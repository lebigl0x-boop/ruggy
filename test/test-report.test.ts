import { describe, expect, it } from 'vitest'
import { DEFAULT_STRATEGY, type TokenInput } from '@/lib/compute'
import {
  JOURS_MINIMUM_TEST,
  SEUIL_CONSEIL_TOKENS,
  computeTestReport,
  type DayInput,
} from '@/lib/test-report'

const S = DEFAULT_STRATEGY

/** Résultat d'un token avec la stratégie par défaut : +0,097 ou −0,093 SOL. */
const GAGNANT = 0.097
const PERDANT = -0.093

function jour(day: string, gains: readonly (number | null)[]): DayInput {
  const tokens: TokenInput[] = gains.map((gain) => ({
    gain,
    perteRug: null,
    delay: null,
  }))
  return { day, state: 'actif', tokens }
}

function inactif(day: string): DayInput {
  return { day, state: 'inactif', tokens: [] }
}

describe('computeTestReport — journées', () => {
  it('calcule le résultat de chaque journée', () => {
    const rapport = computeTestReport(
      [jour('2026-10-01', [150, 20]), jour('2026-10-02', [150])],
      S,
    )

    expect(rapport.days.map((j) => j.day)).toEqual(['2026-10-01', '2026-10-02'])
    expect(rapport.days[0]!.pnlSol).toBeCloseTo(GAGNANT + PERDANT, 6)
    expect(rapport.days[1]!.pnlSol).toBeCloseTo(GAGNANT, 6)
    expect(rapport.pnlSol).toBeCloseTo(2 * GAGNANT + PERDANT, 6)
  })

  it('remet les journées dans l’ordre du temps', () => {
    const rapport = computeTestReport(
      [jour('2026-10-03', [150]), jour('2026-10-01', [20])],
      S,
    )
    expect(rapport.days.map((j) => j.day)).toEqual(['2026-10-01', '2026-10-03'])
    expect(rapport.days[0]!.pnlSol).toBeCloseTo(PERDANT, 6)
  })

  it('compte les tokens notés à part des tokens relevés', () => {
    const rapport = computeTestReport([jour('2026-10-01', [150, null, 20])], S)
    expect(rapport.days[0]).toMatchObject({ total: 3, n: 2, hits: 1 })
    expect(rapport.tokensTotal).toBe(3)
    expect(rapport.report.n).toBe(2)
  })

  it('garde la journée sans trade dans le décompte', () => {
    // C'est toute la raison d'être de la ligne : « il n'a rien fait » est une
    // donnée, pas un trou de saisie.
    const rapport = computeTestReport(
      [jour('2026-10-01', [150]), inactif('2026-10-02')],
      S,
    )
    expect(rapport.joursObserves).toBe(2)
    expect(rapport.joursActifs).toBe(1)
    expect(rapport.joursInactifs).toBe(1)
    expect(rapport.tauxInactivite).toBe(50)
  })
})

describe('computeTestReport — lecture du rythme', () => {
  const quatreJours = [
    jour('2026-10-01', [150, 150, 20]),
    jour('2026-10-02', [20]),
    inactif('2026-10-03'),
    jour('2026-10-04', [150]),
  ]

  it('distingue la moyenne par journée observée de la moyenne par journée active', () => {
    const rapport = computeTestReport(quatreJours, S)
    expect(rapport.pnlMoyenParJour).toBeCloseTo(rapport.pnlSol / 4, 6)
    expect(rapport.pnlMoyenParJourActif).toBeCloseTo(rapport.pnlSol / 3, 6)
  })

  it('compte les tokens par journée active', () => {
    expect(computeTestReport(quatreJours, S).tokensParJourActif).toBeCloseTo(5 / 3, 6)
  })

  it('mesure l’engagement de la plus grosse journée', () => {
    // 3 tokens à 0,1 SOL : il faut 0,3 SOL en caisse pour suivre ce wallet.
    expect(computeTestReport(quatreJours, S).expositionMaxSol).toBeCloseTo(0.3, 6)
  })

  it('désigne la meilleure et la pire journée', () => {
    const rapport = computeTestReport(quatreJours, S)
    expect(rapport.meilleurJour?.day).toBe('2026-10-01')
    expect(rapport.pireJour?.day).toBe('2026-10-02')
  })

  it('dit quelle part du gain tient à une seule séance', () => {
    const rapport = computeTestReport(
      [
        jour('2026-10-01', [150, 150, 150]),
        jour('2026-10-02', [150]),
        inactif('2026-10-03'),
        inactif('2026-10-04'),
      ],
      S,
    )
    // 3 journées gagnantes de 0,291 et 0,097 : la première pèse 75 %.
    expect(rapport.joursPositifs).toBe(2)
    expect(rapport.partMeilleurJour).toBeCloseTo(75, 1)
  })

  it('ne calcule pas de part quand aucune journée n’est positive', () => {
    const rapport = computeTestReport([jour('2026-10-01', [20])], S)
    expect(rapport.partMeilleurJour).toBeNull()
  })
})

describe('computeTestReport — verdict', () => {
  const vingtTokens = Array.from({ length: 20 }, (_, i) => (i < 8 ? 150 : 20))

  it('bloque le verdict sous le plancher de journées', () => {
    const rapport = computeTestReport(
      [jour('2026-10-01', [150]), jour('2026-10-02', [150])],
      S,
    )
    expect(rapport.verdictDisponible).toBe(false)
    expect(rapport.joursRestants).toBe(JOURS_MINIMUM_TEST - 2)
    expect(rapport.conseil?.code).toBe('jours')
  })

  it('bloque le verdict tant qu’aucun token n’est noté', () => {
    const rapport = computeTestReport(
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map(inactif),
      S,
    )
    expect(rapport.joursObserves).toBe(4)
    expect(rapport.verdictDisponible).toBe(false)
    expect(rapport.conseil?.code).toBe('volume')
  })

  it('débloque le verdict au plancher atteint', () => {
    const rapport = computeTestReport(
      [
        jour('2026-10-01', vingtTokens.slice(0, 5)),
        jour('2026-10-02', vingtTokens.slice(5, 10)),
        jour('2026-10-03', vingtTokens.slice(10, 15)),
        jour('2026-10-04', vingtTokens.slice(15)),
      ],
      S,
    )
    expect(rapport.verdictDisponible).toBe(true)
    expect(rapport.joursRestants).toBe(0)
    expect(rapport.conseil).toBeNull()
  })

  it('conseille de prolonger quand le volume est mince', () => {
    // Le plancher est un plancher de temps, pas de volume : quatre journées à
    // deux tokens ne suffisent pas à juger, mais rien n'est verrouillé.
    const rapport = computeTestReport(
      [
        jour('2026-10-01', [150, 20]),
        jour('2026-10-02', [150]),
        jour('2026-10-03', [20]),
        jour('2026-10-04', [150]),
      ],
      S,
    )
    expect(rapport.verdictDisponible).toBe(true)
    expect(rapport.conseil?.code).toBe('volume')
    expect(rapport.report.n).toBeLessThan(SEUIL_CONSEIL_TOKENS)
  })

  it('signale un wallet à faible débit une fois le volume atteint', () => {
    const rapport = computeTestReport(
      [
        jour('2026-10-01', vingtTokens.slice(0, 10)),
        jour('2026-10-02', vingtTokens.slice(10)),
        inactif('2026-10-03'),
        inactif('2026-10-04'),
      ],
      S,
    )
    expect(rapport.tauxInactivite).toBe(50)
    expect(rapport.conseil?.code).toBe('inactivite')
  })
})

describe('computeTestReport — bilan global', () => {
  it('rejoue tous les tokens de la phase d’un seul tenant', () => {
    const rapport = computeTestReport(
      [jour('2026-10-01', [150, 20]), jour('2026-10-02', [150])],
      S,
    )
    expect(rapport.report.n).toBe(3)
    expect(rapport.report.hits).toBe(2)
    expect(rapport.report.taux).toBeCloseTo(66.67, 1)
    expect(rapport.report.netSol).toBeCloseTo(rapport.pnlSol, 10)
  })

  it('convertit le net en euros quand le prix du SOL est connu', () => {
    const rapport = computeTestReport([jour('2026-10-01', [150])], S, {
      solPriceEur: 100,
    })
    expect(rapport.report.netEur).toBeCloseTo(GAGNANT * 100, 4)
  })

  it('reste vide sans aucune journée', () => {
    const rapport = computeTestReport([], S)
    expect(rapport.joursObserves).toBe(0)
    expect(rapport.pnlSol).toBe(0)
    expect(rapport.pnlMoyenParJour).toBe(0)
    expect(rapport.meilleurJour).toBeNull()
    expect(rapport.verdictDisponible).toBe(false)
  })
})
