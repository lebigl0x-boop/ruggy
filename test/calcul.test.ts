import { describe, expect, it } from 'vitest'

import {
  DEFAUTS,
  DERNIERS_TRADES,
  bilanSimule,
  bilanTest,
  bilanTrade,
  gainTp,
  perteRate,
  resultatToken,
  seuilRentabilite,
  type Issue,
  type Reglages,
  type Trade,
} from '@/lib/calcul'

/** Les réglages de référence : mise 0,05 SOL · TP 300 % · frais 0,008 SOL. */
const R: Reglages = { mise: 0.05, tp: 300, frais: 0.008 }

/** Raccourci de lisibilité pour écrire des suites d'issues. */
const suite = (motif: string): Issue[] =>
  [...motif].map((lettre) => (lettre === 'x' ? 'tp' : 'rate'))

function trade(partiel: Partial<Trade> = {}): Trade {
  return {
    date: '2026-01-01',
    entreeSol: 0.05,
    sortieSol: 0.2,
    issue: 'tp',
    ...partiel,
  }
}

// ---------------------------------------------------------------------------

describe('cas de référence — mise 0,05 · tp 300 · frais 0,008', () => {
  it('un TP vaut +0,142 SOL', () => {
    expect(resultatToken('tp', R)).toBeCloseTo(0.142, 10)
    expect(gainTp(R)).toBeCloseTo(0.142, 10)
  })

  it('un raté vaut −0,058 SOL', () => {
    expect(resultatToken('rate', R)).toBeCloseTo(-0.058, 10)
    expect(perteRate(R)).toBeCloseTo(0.058, 10)
  })

  it('le seuil de rentabilité est de 29 %', () => {
    // P / (G + P) = 0,058 / (0,142 + 0,058) = 0,058 / 0,2
    expect(seuilRentabilite(R)).toBeCloseTo(29, 10)
  })

  it('les réglages par défaut sont ceux de ce cas', () => {
    expect(DEFAUTS).toEqual({ mise: 0.05, tp: 300, frais: 0.008 })
  })
})

describe('resultatToken', () => {
  it('un TP plus haut rapporte davantage, un raté coûte pareil', () => {
    const vise = { ...R, tp: 500 }
    expect(resultatToken('tp', vise)).toBeCloseTo(0.242, 10)
    expect(resultatToken('rate', vise)).toBeCloseTo(-0.058, 10)
  })

  it('les frais sont payés dans les deux cas', () => {
    const sansFrais: Reglages = { ...R, frais: 0 }
    expect(resultatToken('tp', sansFrais) - resultatToken('tp', R)).toBeCloseTo(0.008, 10)
    expect(resultatToken('rate', sansFrais) - resultatToken('rate', R)).toBeCloseTo(0.008, 10)
  })

  it('un raté coûte plus que la mise, à cause des frais', () => {
    expect(resultatToken('rate', R)).toBeLessThan(-R.mise)
  })
})

describe('seuilRentabilite', () => {
  it('monte quand le TP visé baisse', () => {
    expect(seuilRentabilite({ ...R, tp: 100 })!).toBeGreaterThan(seuilRentabilite(R)!)
  })

  it('dépasse 100 % quand les frais mangent le gain', () => {
    // mise 0,05 · tp 10 % → un TP rapporte 0,005, les frais coûtent 0,008.
    const perdant: Reglages = { mise: 0.05, tp: 10, frais: 0.008 }
    expect(gainTp(perdant)).toBeLessThan(0)
    expect(seuilRentabilite(perdant)!).toBeGreaterThan(100)
  })

  it('renvoie null plutôt qu’un infini si la mise est nulle', () => {
    expect(seuilRentabilite({ mise: 0, tp: 300, frais: 0.008 })).toBeNull()
  })

  it('ne dépend pas du nombre de tokens', () => {
    const peu = bilanSimule(suite('x'), R)
    const beaucoup = bilanSimule(suite('xxxxoooooo'), R)
    expect(peu.seuil).toBe(beaucoup.seuil)
  })
})

describe('bilanSimule', () => {
  it('somme les résultats et compte les issues', () => {
    // 3 TP et 2 ratés : 3 × 0,142 − 2 × 0,058 = 0,426 − 0,116 = 0,310
    const bilan = bilanSimule(suite('xxxoo'), R)

    expect(bilan.tokens).toBe(5)
    expect(bilan.tp).toBe(3)
    expect(bilan.rate).toBe(2)
    expect(bilan.resultat).toBeCloseTo(0.31, 10)
  })

  it('calcule le taux au TP en pour-cent', () => {
    expect(bilanSimule(suite('xxxoo'), R).tauxTp).toBeCloseTo(60, 10)
  })

  it('calcule le résultat moyen par token', () => {
    expect(bilanSimule(suite('xxxoo'), R).moyenneParToken).toBeCloseTo(0.062, 10)
  })

  it('trace une courbe cumulée, un point par token', () => {
    const bilan = bilanSimule(suite('xox'), R)

    expect(bilan.courbe.map((p) => p.repere)).toEqual(['1', '2', '3'])
    expect(bilan.courbe[0]!.cumul).toBeCloseTo(0.142, 10)
    expect(bilan.courbe[1]!.cumul).toBeCloseTo(0.084, 10)
    expect(bilan.courbe[2]!.cumul).toBeCloseTo(0.226, 10)
    expect(bilan.courbe.at(-1)!.cumul).toBeCloseTo(bilan.resultat, 10)
  })

  it('dit rentable au-dessus du seuil, pas en dessous', () => {
    // Seuil 29 % : 2 TP sur 5 font 40 %, 1 sur 5 fait 20 %.
    expect(bilanSimule(suite('xxooo'), R).rentable).toBe(true)
    expect(bilanSimule(suite('xoooo'), R).rentable).toBe(false)
  })

  it('n’est pas rentable sans aucun token', () => {
    const vide = bilanSimule([], R)

    expect(vide.tokens).toBe(0)
    expect(vide.resultat).toBe(0)
    expect(vide.tauxTp).toBe(0)
    expect(vide.moyenneParToken).toBe(0)
    expect(vide.rentable).toBe(false)
    expect(vide.courbe).toEqual([])
  })

  it('un lot entièrement raté perd la mise et les frais à chaque fois', () => {
    expect(bilanSimule(suite('ooo'), R).resultat).toBeCloseTo(-0.174, 10)
  })
})

describe('bilanTest', () => {
  const jours = [
    { jour: '2026-03-02', issues: suite('xo') },
    { jour: '2026-03-01', issues: suite('x') },
    { jour: '2026-03-03', issues: [] },
  ]

  it('trie les journées par date, quel que soit l’ordre reçu', () => {
    expect(bilanTest(jours, R).parJour.map((j) => j.jour)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ])
  })

  it('compte les journées observées, journées creuses comprises', () => {
    const bilan = bilanTest(jours, R)

    expect(bilan.joursObserves).toBe(3)
    expect(bilan.joursSansLancement).toBe(1)
  })

  it('agrège les tokens de toutes les journées', () => {
    const bilan = bilanTest(jours, R)

    expect(bilan.tokens).toBe(3)
    expect(bilan.tp).toBe(2)
    // 2 × 0,142 − 0,058 = 0,226
    expect(bilan.resultat).toBeCloseTo(0.226, 10)
  })

  it('divise par les journées observées, pas par les journées actives', () => {
    // 0,226 / 3 journées, la journée sans lancement comprise.
    expect(bilanTest(jours, R).moyenneParJour).toBeCloseTo(0.226 / 3, 10)
  })

  it('une journée sans lancement ne fait pas bouger le cumul', () => {
    const bilan = bilanTest(jours, R)
    const derniere = bilan.parJour.at(-1)!

    expect(derniere.tokens).toBe(0)
    expect(derniere.resultat).toBe(0)
    expect(derniere.cumul).toBeCloseTo(bilan.resultat, 10)
  })

  it('trace une courbe par journée, distincte de la courbe par token', () => {
    const bilan = bilanTest(jours, R)

    expect(bilan.courbeParJour).toHaveLength(3)
    expect(bilan.courbe).toHaveLength(3) // 3 tokens, par coïncidence
    expect(bilan.courbeParJour[0]!.repere).toBe('2026-03-01')
    expect(bilan.courbeParJour.at(-1)!.cumul).toBeCloseTo(bilan.resultat, 10)
  })

  it('ne compte aucune journée quand le test n’a pas commencé', () => {
    const vide = bilanTest([], R)

    expect(vide.joursObserves).toBe(0)
    expect(vide.joursSansLancement).toBe(0)
    expect(vide.moyenneParJour).toBe(0)
    expect(vide.resultat).toBe(0)
  })

  it('ne mélange pas les lots : un test ne voit que ses journées', () => {
    const screening = bilanSimule(suite('xxxxx'), R)
    const test = bilanTest([{ jour: '2026-03-01', issues: suite('o') }], R)

    expect(screening.resultat).toBeCloseTo(0.71, 10)
    expect(test.resultat).toBeCloseTo(-0.058, 10)
  })
})

describe('bilanTrade', () => {
  it('le résultat est la différence des montants, sans les réglages', () => {
    const bilan = bilanTrade([trade({ entreeSol: 0.05, sortieSol: 0.23 })], R)

    expect(bilan.resultat).toBeCloseTo(0.18, 10)
    expect(bilan.engage).toBeCloseTo(0.05, 10)
    expect(bilan.recupere).toBeCloseTo(0.23, 10)
    // 0,18 et non 0,142 : la mise et les frais du wallet n'interviennent pas.
    expect(bilan.resultat).not.toBeCloseTo(resultatToken('tp', R), 5)
  })

  it('calcule le rendement sur le capital engagé', () => {
    const bilan = bilanTrade(
      [
        trade({ entreeSol: 0.1, sortieSol: 0.15 }),
        trade({ entreeSol: 0.1, sortieSol: 0.05, issue: 'rate' }),
      ],
      R,
    )

    // engagé 0,2 · récupéré 0,2 · résultat 0 → rendement 0 %
    expect(bilan.engage).toBeCloseTo(0.2, 10)
    expect(bilan.rendement).toBeCloseTo(0, 10)
  })

  it('renvoie null pour le rendement quand rien n’est engagé', () => {
    expect(bilanTrade([], R).rendement).toBeNull()
  })

  it('compare au prévu par le test sur exactement les mêmes trades', () => {
    const bilan = bilanTrade(
      [
        trade({ entreeSol: 0.05, sortieSol: 0.2, issue: 'tp' }),
        trade({ entreeSol: 0.05, sortieSol: 0, issue: 'rate' }),
      ],
      R,
    )

    // prévu : 0,142 − 0,058 = 0,084 · réel : 0,15 − 0,05 = 0,10
    expect(bilan.prevuParTest).toBeCloseTo(0.084, 10)
    expect(bilan.resultat).toBeCloseTo(0.1, 10)
    expect(bilan.ecartPct).toBeCloseTo((0.016 / 0.084) * 100, 8)
  })

  it('signale un écart négatif quand le test était optimiste', () => {
    const bilan = bilanTrade(
      [trade({ entreeSol: 0.05, sortieSol: 0.12, issue: 'tp' })],
      R,
    )

    // réel 0,07 contre 0,142 prévu
    expect(bilan.ecartPct).toBeLessThan(0)
  })

  it('renvoie null pour l’écart quand le prévu est nul', () => {
    expect(bilanTrade([], R).ecartPct).toBeNull()
  })

  it('trie les trades par date pour la courbe', () => {
    const bilan = bilanTrade(
      [
        trade({ date: '2026-05-03', entreeSol: 0.05, sortieSol: 0.1 }),
        trade({ date: '2026-05-01', entreeSol: 0.05, sortieSol: 0.3 }),
      ],
      R,
    )

    expect(bilan.parTrade.map((p) => p.repere)).toEqual(['2026-05-01', '2026-05-03'])
    expect(bilan.parTrade.at(-1)!.cumul).toBeCloseTo(bilan.resultat, 10)
  })

  it('calcule le taux au TP sur les issues, pas sur le signe du résultat', () => {
    // Un trade gagnant en SOL mais loin du TP reste un raté.
    const bilan = bilanTrade(
      [
        trade({ entreeSol: 0.05, sortieSol: 0.06, issue: 'rate' }),
        trade({ entreeSol: 0.05, sortieSol: 0.25, issue: 'tp' }),
      ],
      R,
    )

    expect(bilan.resultat).toBeGreaterThan(0)
    expect(bilan.tauxTp).toBeCloseTo(50, 10)
  })
})

describe('règle d’arrêt', () => {
  const lot = (motif: string): Trade[] =>
    suite(motif).map((issue, i) =>
      trade({
        date: `2026-06-${String(i + 1).padStart(2, '0')}`,
        issue,
        sortieSol: issue === 'tp' ? 0.2 : 0,
      }),
    )

  it('ne se prononce pas avant d’avoir sa fenêtre complète', () => {
    expect(bilanTrade(lot('oooo'), R).alerteArret).toBe(false)
    expect(bilanTrade(lot('oooo'), R).fenetreArret).toBe(4)
  })

  it('alerte à un seul gagnant sur les cinq derniers', () => {
    expect(bilanTrade(lot('oooox'), R).alerteArret).toBe(true)
    expect(bilanTrade(lot('ooooo'), R).alerteArret).toBe(true)
  })

  it('n’alerte pas à deux gagnants sur cinq', () => {
    expect(bilanTrade(lot('oooxx'), R).alerteArret).toBe(false)
  })

  it('ne regarde que les derniers trades, pas l’historique entier', () => {
    // Un excellent début ne doit pas masquer une série noire récente.
    expect(bilanTrade(lot('xxxxxooooo'), R).alerteArret).toBe(true)
    // Et inversement : un mauvais début n'alerte pas si ça s'est redressé.
    expect(bilanTrade(lot('oooooxxxxx'), R).alerteArret).toBe(false)
  })

  it('regarde les cinq derniers dans l’ordre des dates, pas d’insertion', () => {
    const desordre = [
      ...lot('ooooo'),
      trade({ date: '2026-05-01', issue: 'tp', sortieSol: 0.2 }),
      trade({ date: '2026-05-02', issue: 'tp', sortieSol: 0.2 }),
    ]

    // Les deux gagnants sont antérieurs : la fenêtre récente reste vide.
    expect(bilanTrade(desordre, R).alerteArret).toBe(true)
  })

  it('utilise bien une fenêtre de cinq', () => {
    expect(DERNIERS_TRADES).toBe(5)
  })
})
