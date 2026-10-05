import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STRATEGY,
  SEUIL_ANALYSE,
  computeTokenResult,
  computeWalletReport,
  explainTag,
  type Strategy,
  type TokenInput,
} from '@/lib/compute'

/**
 * Fabrique une liste de tokens à partir des gains.
 * `pertes` associe une perte propre à certaines positions (numérotées à
 * partir de 1, comme à l'écran) ; les autres reprennent celle du wallet.
 */
function tokens(
  gains: readonly (number | null)[],
  options: {
    pertes?: Readonly<Record<number, number>>
    delays?: readonly (number | null)[]
  } = {},
): TokenInput[] {
  return gains.map((gain, i) => ({
    gain,
    perteRug: options.pertes?.[i + 1] ?? null,
    delay: options.delays?.[i] ?? null,
  }))
}

const S = DEFAULT_STRATEGY

describe('computeTokenResult', () => {
  it('ignore un token non noté', () => {
    expect(computeTokenResult({ gain: null, perteRug: null, delay: null }, S)).toBeNull()
  })

  it('revend à l’objectif quand le gain le dépasse', () => {
    const r = computeTokenResult({ gain: 150, perteRug: null, delay: null }, S)
    expect(r).toEqual({ percent: 100, sol: expect.closeTo(0.097, 10), hit: true })
  })

  it('compte un gain pile à l’objectif comme une réussite', () => {
    const r = computeTokenResult({ gain: 100, perteRug: null, delay: null }, S)
    expect(r?.hit).toBe(true)
    expect(r?.percent).toBe(100)
  })

  it('ignore la perte du token quand l’objectif est atteint', () => {
    const r = computeTokenResult({ gain: 500, perteRug: 90, delay: null }, S)
    expect(r?.hit).toBe(true)
    expect(r?.percent).toBe(100)
  })

  it('applique la perte propre au token quand l’objectif n’est pas atteint', () => {
    const r = computeTokenResult({ gain: 20, perteRug: 65, delay: null }, S)
    expect(r?.percent).toBe(-65)
    expect(r?.sol).toBeCloseTo(-0.068, 10)
  })

  it('reprend la perte du wallet quand celle du token est vide', () => {
    const r = computeTokenResult({ gain: 20, perteRug: null, delay: null }, S)
    expect(r?.percent).toBe(-S.perteRug)
    expect(r?.sol).toBeCloseTo(-0.093, 10)
  })

  it('lit « −50 » comme une perte de 50 %, pas comme un gain', () => {
    const r = computeTokenResult({ gain: 20, perteRug: -50, delay: null }, S)
    expect(r?.hit).toBe(false)
    expect(r?.percent).toBe(-50)
    expect(r?.sol).toBeCloseTo(-0.053, 10)
  })

  it('ne laisse pas perdre plus que sa mise', () => {
    const r = computeTokenResult({ gain: 20, perteRug: 300, delay: null }, S)
    expect(r?.percent).toBe(-100)
  })

  it('accepte une perte nulle sur un token', () => {
    // 0 est une perte valable : on est sorti à l'équilibre, frais exceptés.
    const r = computeTokenResult({ gain: 20, perteRug: 0, delay: null }, S)
    expect(r?.percent).toBe(-0)
    expect(r?.sol).toBeCloseTo(-S.frais, 10)
  })
})

describe('cas de référence', () => {
  // 10 tokens, réglages par défaut. Les tokens 2, 4 et 8 sont des rugs secs
  // (−90 %) ; les tokens 6 et 9 ont été revendus avec une perte plus douce.
  const report = computeWalletReport(
    tokens([150, 20, 100, 0, 300, 10, 120, 0, 50, 200], {
      pertes: { 2: 90, 4: 90, 6: 30, 8: 90, 9: 30 },
    }),
    S,
  )

  it('donne un net de +0,140 SOL', () => {
    expect(report.netSol).toBeCloseTo(0.14, 6)
  })

  it('donne un taux à l’objectif de 50 %', () => {
    expect(report.n).toBe(10)
    expect(report.hits).toBe(5)
    expect(report.taux).toBeCloseTo(50, 10)
  })

  it('donne un seuil de rentabilité d’environ 41,6 %', () => {
    expect(report.seuilRentabilite).toBeCloseTo(41.6, 1)
  })

  it('classe le wallet « Rentable »', () => {
    expect(report.autoTag).toBe('Rentable')
    expect(report.effectiveTag).toBe('Rentable')
  })

  it('cumule les résultats dans l’ordre des tokens', () => {
    expect(report.rows[0]?.cumulSol).toBeCloseTo(0.097, 10)
    expect(report.rows[1]?.cumulSol).toBeCloseTo(0.004, 10)
    expect(report.rows.at(-1)?.cumulSol).toBeCloseTo(0.14, 6)
  })

  it('projette la moyenne sur 100 tokens', () => {
    expect(report.moyenneSol).toBeCloseTo(0.014, 10)
    expect(report.projection100).toBeCloseTo(1.4, 6)
  })
})

describe('pertes mélangées', () => {
  it('traite chaque perte indépendamment', () => {
    const report = computeWalletReport(
      tokens([150, 10, 10, 10], { pertes: { 2: 100, 3: 50 } }),
      S,
    )
    const pertes = report.rows.slice(1).map((r) => r.result?.percent)
    // Le dernier token n'a pas de perte propre : il reprend les 90 % du wallet.
    expect(pertes).toEqual([-100, -50, -90])
  })
})

describe('computeWalletReport — bilan', () => {
  it('reste neutre sans aucun token', () => {
    const report = computeWalletReport([], S)
    expect(report.n).toBe(0)
    expect(report.netSol).toBe(0)
    expect(report.taux).toBe(0)
    expect(report.moyenneSol).toBe(0)
    expect(report.autoTag).toBe('À compléter')
  })

  it('ne compte pas les tokens non notés mais garde leur ligne', () => {
    const report = computeWalletReport(tokens([150, null, 20]), S)
    expect(report.rows).toHaveLength(3)
    expect(report.rows[1]).toEqual({ result: null, cumulSol: null })
    expect(report.n).toBe(2)
  })

  it('convertit le net en euros quand le prix du SOL est connu', () => {
    const report = computeWalletReport(tokens([150]), S, { solPriceEur: 200 })
    expect(report.netEur).toBeCloseTo(19.4, 10)
  })

  it('laisse le net en euros à null sans prix du SOL', () => {
    expect(computeWalletReport(tokens([150]), S).netEur).toBeNull()
  })
})

describe('seuil de rentabilité', () => {
  it('se replie sur la perte par défaut quand aucun token ne perd', () => {
    const report = computeWalletReport(tokens([150, 200]), S)
    // G = 0,097 ; pertMoy = −(0,09 + 0,003) = −0,093
    expect(report.seuilRentabilite).toBeCloseTo((0.093 / (0.097 + 0.093)) * 100, 8)
  })

  it('tient compte des pertes réellement subies', () => {
    // Deux pertes douces : le seuil d'équilibre baisse.
    const report = computeWalletReport(
      tokens([150, 10, 10], { pertes: { 2: 20, 3: 20 } }),
      S,
    )
    // pertMoy = −(0,02 + 0,003) = −0,023 ; G = 0,097
    expect(report.seuilRentabilite).toBeCloseTo((0.023 / (0.097 + 0.023)) * 100, 8)
  })

  it('vaut null quand un trade gagnant ne rapporte rien', () => {
    const frais: Strategy = { ...S, frais: 0.1 } // G = 0,1 − 0,1 = 0
    expect(computeWalletReport(tokens([150]), frais).seuilRentabilite).toBeNull()
  })
})

describe('délai et régularité', () => {
  it('ne juge pas la régularité en dessous de 3 délais', () => {
    const report = computeWalletReport(tokens([150, 20], { delays: [10, 12] }), S)
    expect(report.delaiMoyen).toBeCloseTo(11, 10)
    expect(report.regularite).toBeNull()
  })

  it('classe « Régulier » des délais resserrés', () => {
    const report = computeWalletReport(tokens([150, 20, 10], { delays: [10, 11, 12] }), S)
    expect(report.regularite).toBe('Régulier')
  })

  it('classe « Variable » une dispersion moyenne', () => {
    const report = computeWalletReport(tokens([150, 20, 10], { delays: [5, 10, 15] }), S)
    // écart-type ≈ 4,082 ; moyenne = 10 ; cv ≈ 0,408
    expect(report.coefficientVariation).toBeCloseTo(0.4082, 3)
    expect(report.regularite).toBe('Variable')
  })

  it('classe « Irrégulier » une forte dispersion', () => {
    const report = computeWalletReport(tokens([150, 20, 10], { delays: [1, 5, 60] }), S)
    expect(report.regularite).toBe('Irrégulier')
  })

  it('laisse le délai à null quand aucun n’est renseigné', () => {
    const report = computeWalletReport(tokens([150, 20]), S)
    expect(report.delaiMoyen).toBeNull()
    expect(report.regularite).toBeNull()
  })
})

describe('tag automatique', () => {
  const dix = (hits: number): TokenInput[] =>
    tokens(Array.from({ length: SEUIL_ANALYSE }, (_, i) => (i < hits ? 150 : 20)))

  it('reste « À compléter » sous 10 tokens notés', () => {
    expect(computeWalletReport(dix(10).slice(0, 9), S).autoTag).toBe('À compléter')
  })

  it('devient « Rentable » au-dessus du taux visé et en positif', () => {
    // 5 réussites sur 10 : taux 50 % ≥ 30 % visés, et le net reste positif.
    const report = computeWalletReport(dix(5), S)
    expect(report.netSol).toBeGreaterThan(0)
    expect(report.autoTag).toBe('Rentable')
  })

  it('devient « Limite » quand c’est positif mais sous le taux visé', () => {
    // Mêmes chiffres, mais le taux visé passe à 60 % : 50 % est en dessous.
    const report = computeWalletReport(dix(5), { ...S, tauxVise: 60 })
    expect(report.netSol).toBeGreaterThan(0)
    expect(report.autoTag).toBe('Limite')
  })

  it('devient « Pas rentable » quand le net est négatif', () => {
    expect(computeWalletReport(dix(2), S).autoTag).toBe('Pas rentable')
  })

  it('reste « Pas rentable » à l’équilibre exact', () => {
    // Sans frais, 1 gain de +0,1 contre 1 perte de −0,1 : net nul.
    const equilibre: Strategy = { ...S, frais: 0, perteRug: 100 }
    const report = computeWalletReport(
      tokens([150, 20, 150, 20, 150, 20, 150, 20, 150, 20]),
      equilibre,
    )
    expect(report.netSol).toBeCloseTo(0, 10)
    expect(report.autoTag).toBe('Pas rentable')
  })
})

describe('tag manuel', () => {
  const dix = tokens(Array.from({ length: 10 }, () => 150))

  it('prend le pas sur le tag automatique', () => {
    const report = computeWalletReport(dix, S, { tagOverride: 'surveiller' })
    expect(report.autoTag).toBe('Rentable')
    expect(report.effectiveTag).toBe('À surveiller')
  })

  it('laisse passer le tag automatique quand il est vide', () => {
    expect(computeWalletReport(dix, S, { tagOverride: null }).effectiveTag).toBe('Rentable')
  })
})

describe('explainTag', () => {
  it('annonce combien de tokens il reste à noter', () => {
    const report = computeWalletReport(tokens([150, 20]), S)
    expect(explainTag(report, S)).toContain('8 tokens')
  })

  it('accorde le singulier au dernier token', () => {
    const report = computeWalletReport(tokens(Array.from({ length: 9 }, () => 150)), S)
    expect(explainTag(report, S)).toContain('1 token à noter')
  })
})
