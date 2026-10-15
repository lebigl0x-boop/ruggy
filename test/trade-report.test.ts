import { describe, expect, it } from 'vitest'
import { DEFAULT_STRATEGY, computeTokenResult, type TokenInput } from '@/lib/compute'
import type { DayInput } from '@/lib/day-report'
import { SEUIL_ALERTE_ECART, computeTradeReport } from '@/lib/trade-report'

const S = DEFAULT_STRATEGY

/** Un trade chiffré : gain relevé, et les montants réellement passés. */
function trade(
  gain: number | null,
  entreeSol: number | null,
  sortieSol: number | null,
  pris = true,
): TokenInput {
  return { gain, perteRug: null, delay: null, pris, entreeSol, sortieSol }
}

function jour(day: string, tokens: TokenInput[], state: 'actif' | 'inactif' | 'ouvert' = 'actif'): DayInput {
  return { day, state, tokens }
}

describe('computeTokenResult — montants réels', () => {
  it('compte la différence et rien d’autre', () => {
    // 0,2 engagés, 0,5 récupérés : la mise et les frais du wallet ne doivent
    // pas intervenir, ils sont déjà dans les chiffres.
    const r = computeTokenResult(trade(150, 0.2, 0.5), S)
    expect(r).toEqual({
      percent: expect.closeTo(150, 10),
      sol: expect.closeTo(0.3, 10),
      hit: true,
      reel: true,
    })
  })

  it('juge l’objectif sur la montée du token, pas sur le résultat du trade', () => {
    // Le token est monté à +150 %, mais on est sorti trop tôt : le wallet a
    // fait son travail, le trade non. Les deux mesures restent distinctes.
    const r = computeTokenResult(trade(150, 1, 1.1), S)
    expect(r?.hit).toBe(true)
    expect(r?.sol).toBeCloseTo(0.1, 10)
  })

  it('se rabat sur le résultat du trade quand le gain n’est pas relevé', () => {
    const r = computeTokenResult(trade(null, 1, 2.5), S)
    expect(r).toEqual({ percent: 150, sol: expect.closeTo(1.5, 10), hit: true, reel: true })
  })

  it('refuse une entrée nulle : le pourcentage serait infini', () => {
    expect(computeTokenResult(trade(null, 0, 1), S)).toBeNull()
  })

  it('ne compte pas un trade dont la sortie manque', () => {
    // Position pas encore soldée : ce n'est pas une perte totale, et
    // l'inventer donnerait un résultat faux sans rien signaler.
    expect(computeTokenResult(trade(null, 1, null), S)).toBeNull()
  })

  it('retombe sur la simulation quand il n’y a pas de montants', () => {
    const r = computeTokenResult(trade(150, null, null), S)
    expect(r?.reel).toBe(false)
    expect(r?.sol).toBeCloseTo(0.147, 10)
  })
})

describe('computeTradeReport', () => {
  const rapport = computeTradeReport(
    [
      jour('2026-10-01', [trade(150, 0.1, 0.25), trade(-80, 0.1, 0.02)]),
      jour('2026-10-02', [], 'inactif'),
      jour('2026-10-03', [trade(300, 0.2, 0.8)]),
    ],
    S,
  )

  it('somme ce qui est entré et ce qui est sorti', () => {
    expect(rapport.engageSol).toBeCloseTo(0.4, 10)
    expect(rapport.recupereSol).toBeCloseTo(1.07, 10)
    expect(rapport.pnlReelSol).toBeCloseTo(0.67, 10)
  })

  it('rapporte le résultat au capital engagé', () => {
    expect(rapport.rendement).toBeCloseTo((0.67 / 0.4) * 100, 8)
  })

  it('compte les journées comme le test : les creuses comprises', () => {
    expect(rapport.joursObserves).toBe(3)
    expect(rapport.joursActifs).toBe(2)
  })

  it('donne le résultat réel journée par journée', () => {
    expect(rapport.days[0]!.pnlReelSol).toBeCloseTo(0.07, 10)
    expect(rapport.days[1]!.pnlReelSol).toBe(0)
    expect(rapport.days[2]!.pnlReelSol).toBeCloseTo(0.6, 10)
  })

  it('compare au simulé sur exactement les mêmes trades', () => {
    // Simulé : 0,1×150 % − 0,003, puis la perte par défaut (90 %), puis
    // 0,1×300 % − 0,003.
    const simule = 0.147 - 0.093 + 0.297
    expect(rapport.pnlSimuleSol).toBeCloseTo(simule, 10)
    expect(rapport.ecartSol).toBeCloseTo(0.67 - simule, 10)
  })

  it('mesure le creux sur le cumul réel', () => {
    const creux = computeTradeReport(
      [
        jour('2026-10-01', [trade(200, 1, 3)]),
        jour('2026-10-02', [trade(-90, 1, 0)]),
        jour('2026-10-03', [trade(-90, 1, 0)]),
      ],
      S,
    )
    // Sommet à +2, puis deux journées à −1 : le creux vaut 2.
    expect(creux.drawdownMaxSol).toBeCloseTo(2, 10)
    expect(creux.pnlReelSol).toBeCloseTo(0, 10)
  })

  it('n’a pas de creux quand la courbe ne redescend jamais', () => {
    const monte = computeTradeReport(
      [jour('2026-10-01', [trade(200, 1, 3)]), jour('2026-10-02', [trade(200, 1, 2)])],
      S,
    )
    expect(monte.drawdownMaxSol).toBe(0)
  })
})

describe('computeTradeReport — trades incomplets', () => {
  const rapport = computeTradeReport(
    [jour('2026-10-01', [trade(150, 0.1, 0.25), trade(150, null, null)])],
    S,
  )

  it('ne compte dans le réel que les trades chiffrés', () => {
    expect(rapport.tradesChiffres).toBe(1)
    expect(rapport.tradesIncomplets).toBe(1)
    // 0,15 et non 0,15 + 0,147 : le second trade n'est pas de l'argent compté.
    expect(rapport.pnlReelSol).toBeCloseTo(0.15, 10)
  })

  it('le dit au lieu de l’arrondir', () => {
    expect(rapport.conseil?.code).toBe('montants')
  })

  it('ne compare qu’aux trades chiffrés', () => {
    expect(rapport.pnlSimuleSol).toBeCloseTo(0.147, 10)
  })
})

describe('computeTradeReport — tokens écartés', () => {
  it('ignore un trade non pris, montants ou pas', () => {
    const rapport = computeTradeReport(
      [jour('2026-10-01', [trade(150, 0.1, 0.25), trade(150, 5, 50, false)])],
      S,
    )
    expect(rapport.pnlReelSol).toBeCloseTo(0.15, 10)
    expect(rapport.tradesChiffres).toBe(1)
    expect(rapport.tradesIncomplets).toBe(0)
  })
})

describe('computeTradeReport — conseils', () => {
  it('signale qu’il n’y a rien à compter', () => {
    expect(computeTradeReport([], S).conseil?.code).toBe('vide')
    expect(computeTradeReport([], S).jourDepart).toBeNull()
  })

  it('alerte quand le réel s’écarte trop de ce que le test annonçait', () => {
    // Simulé 0,147 ; réel 0,01 : l'écart dépasse largement le seuil.
    const rapport = computeTradeReport(
      [jour('2026-10-01', [trade(150, 1, 1.01)])],
      S,
    )
    expect(rapport.ecartPct).not.toBeNull()
    expect(Math.abs(rapport.ecartPct!)).toBeGreaterThanOrEqual(SEUIL_ALERTE_ECART)
    expect(rapport.conseil?.code).toBe('ecart')
  })

  it('ne dit rien quand le réel tient ce que le test promettait', () => {
    const rapport = computeTradeReport(
      [jour('2026-10-01', [trade(150, 0.1, 0.247)])],
      S,
    )
    expect(rapport.conseil).toBeNull()
  })
})

describe('computeTradeReport — journée ouverte', () => {
  it('ne la compte ni dans les journées ni dans le résultat', () => {
    const rapport = computeTradeReport(
      [
        jour('2026-10-01', [trade(150, 0.1, 0.25)]),
        jour('2026-10-02', [], 'ouvert'),
      ],
      S,
    )
    expect(rapport.joursObserves).toBe(1)
    expect(rapport.pnlReelSol).toBeCloseTo(0.15, 10)
  })
})
