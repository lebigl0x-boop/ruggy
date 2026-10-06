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
 * `ecartes` liste les positions laissées de côté : relevées mais pas prises.
 */
function tokens(
  gains: readonly (number | null)[],
  options: {
    pertes?: Readonly<Record<number, number>>
    delays?: readonly (number | null)[]
    ecartes?: readonly number[]
  } = {},
): TokenInput[] {
  return gains.map((gain, i) => ({
    gain,
    perteRug: options.pertes?.[i + 1] ?? null,
    delay: options.delays?.[i] ?? null,
    pris: !(options.ecartes ?? []).includes(i + 1),
  }))
}

const S = DEFAULT_STRATEGY

describe('computeTokenResult', () => {
  it('ignore un token non noté', () => {
    expect(computeTokenResult({ gain: null, perteRug: null, delay: null, pris: true }, S)).toBeNull()
  })

  it('encaisse la montée réelle quand elle dépasse l’objectif', () => {
    const r = computeTokenResult({ gain: 150, perteRug: null, delay: null, pris: true }, S)
    expect(r).toEqual({ percent: 150, sol: expect.closeTo(0.147, 10), hit: true })
  })

  it('n’écrase pas deux gains inégaux au-dessus de l’objectif', () => {
    // L'objectif est un seuil de réussite. Plafonner le gain mettrait un x3
    // et un x2 au même niveau, et masquerait ce qui fait la valeur du wallet.
    const double = computeTokenResult({ gain: 100, perteRug: null, delay: null, pris: true }, S)
    const triple = computeTokenResult({ gain: 200, perteRug: null, delay: null, pris: true }, S)
    expect(double?.percent).toBe(100)
    expect(triple?.percent).toBe(200)
    expect(triple!.sol).toBeGreaterThan(double!.sol)
  })

  it('compte un gain pile à l’objectif comme une réussite', () => {
    const r = computeTokenResult({ gain: 100, perteRug: null, delay: null, pris: true }, S)
    expect(r?.hit).toBe(true)
    expect(r?.percent).toBe(100)
  })

  it('ignore la perte du token quand l’objectif est atteint', () => {
    const r = computeTokenResult({ gain: 500, perteRug: 90, delay: null, pris: true }, S)
    expect(r?.hit).toBe(true)
    expect(r?.percent).toBe(500)
  })

  it('applique la perte propre au token quand l’objectif n’est pas atteint', () => {
    const r = computeTokenResult({ gain: 20, perteRug: 65, delay: null, pris: true }, S)
    expect(r?.percent).toBe(-65)
    expect(r?.sol).toBeCloseTo(-0.068, 10)
  })

  it('reprend la perte du wallet quand celle du token est vide', () => {
    const r = computeTokenResult({ gain: 20, perteRug: null, delay: null, pris: true }, S)
    expect(r?.percent).toBe(-S.perteRug)
    expect(r?.sol).toBeCloseTo(-0.093, 10)
  })

  it('lit « −50 » comme une perte de 50 %, pas comme un gain', () => {
    const r = computeTokenResult({ gain: 20, perteRug: -50, delay: null, pris: true }, S)
    expect(r?.hit).toBe(false)
    expect(r?.percent).toBe(-50)
    expect(r?.sol).toBeCloseTo(-0.053, 10)
  })

  it('ne laisse pas perdre plus que sa mise', () => {
    const r = computeTokenResult({ gain: 20, perteRug: 300, delay: null, pris: true }, S)
    expect(r?.percent).toBe(-100)
  })

  it('accepte une perte nulle sur un token', () => {
    // 0 est une perte valable : on est sorti à l'équilibre, frais exceptés.
    const r = computeTokenResult({ gain: 20, perteRug: 0, delay: null, pris: true }, S)
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

  it('donne un net de +0,510 SOL', () => {
    expect(report.netSol).toBeCloseTo(0.51, 6)
  })

  it('donne un taux à l’objectif de 50 %', () => {
    expect(report.n).toBe(10)
    expect(report.hits).toBe(5)
    expect(report.taux).toBeCloseTo(50, 10)
  })

  it('donne un seuil de rentabilité d’environ 28,8 %', () => {
    // Gain moyen des réussites : 0,171 SOL ; perte moyenne : −0,069 SOL.
    expect(report.seuilRentabilite).toBeCloseTo(28.75, 1)
  })

  it('classe le wallet « Rentable »', () => {
    expect(report.autoTag).toBe('Rentable')
    expect(report.effectiveTag).toBe('Rentable')
  })

  it('cumule les résultats dans l’ordre des tokens', () => {
    expect(report.rows[0]?.cumulSol).toBeCloseTo(0.147, 10)
    expect(report.rows[1]?.cumulSol).toBeCloseTo(0.054, 10)
    expect(report.rows.at(-1)?.cumulSol).toBeCloseTo(0.51, 6)
  })

  it('projette la moyenne sur 100 tokens', () => {
    expect(report.moyenneSol).toBeCloseTo(0.051, 10)
    expect(report.projection100).toBeCloseTo(5.1, 6)
  })
})

describe('adresse 6/4 à gros coups', () => {
  // Le cas qui a fait remonter le bug : 6 réussites à +200 %, 4 rugs secs à
  // −100 %. Tant que les gains étaient plafonnés à l'objectif, ce wallet
  // affichait +0,170 SOL au lieu de +0,770 — soit un wallet « limite » là où
  // il y en a un franchement rentable.
  const report = computeWalletReport(
    tokens([200, 200, 200, 200, 200, 200, -100, -100, -100, -100], {
      pertes: { 7: 100, 8: 100, 9: 100, 10: 100 },
    }),
    S,
  )

  it('compte chaque réussite à +200 %', () => {
    expect(report.rows.slice(0, 6).map((r) => r.result?.percent)).toEqual(
      Array.from({ length: 6 }, () => 200),
    )
  })

  it('donne un taux de 60 % et un net de +0,770 SOL', () => {
    expect(report.taux).toBeCloseTo(60, 10)
    // 6 × (0,2 − 0,003) + 4 × (−0,1 − 0,003)
    expect(report.netSol).toBeCloseTo(0.77, 6)
  })

  it('le classe « Rentable »', () => {
    expect(report.autoTag).toBe('Rentable')
  })
})

describe('tokens écartés', () => {
  // Deux réussites prises, deux ratés laissés de côté — ce que fait un filtre
  // d'entrée qui marche. Le wallet a bien lancé quatre fois : c'est sur
  // quatre qu'on le juge, et sur deux qu'on compte l'argent.
  const report = computeWalletReport(
    tokens([200, 20, 200, 20], { ecartes: [2, 4] }),
    S,
  )

  it('compte le token écarté dans l’activité du wallet', () => {
    expect(report.n).toBe(4)
    expect(report.hits).toBe(2)
    expect(report.taux).toBeCloseTo(50, 10)
  })

  it('ne compte que les tokens pris dans le résultat', () => {
    expect(report.nPris).toBe(2)
    // 2 × (0,2 − 0,003), les deux pertes écartées ne coûtent rien.
    expect(report.netSol).toBeCloseTo(0.394, 10)
  })

  it('chiffre ce que le filtre rapporte', () => {
    // En prenant tout : 0,394 − 2 × (0,09 + 0,003) = 0,208.
    expect(report.netSolTout).toBeCloseTo(0.208, 10)
    expect(report.apportFiltre).toBeCloseTo(0.186, 10)
  })

  it('garde le résultat de la ligne écartée, hors du cumul', () => {
    // Le chiffre reste affichable — c'est ce que le filtre a évité — mais la
    // courbe ne bouge pas.
    expect(report.rows[1]?.result?.sol).toBeCloseTo(-0.093, 10)
    expect(report.rows[1]?.pris).toBe(false)
    expect(report.rows[1]?.cumulSol).toBeNull()
    expect(report.rows[2]?.cumulSol).toBeCloseTo(0.394, 10)
  })

  it('moyenne et projection portent sur les tokens pris', () => {
    expect(report.moyenneSol).toBeCloseTo(0.197, 10)
    expect(report.projection100).toBeCloseTo(19.7, 6)
  })

  it('mesure le seuil de rentabilité sur les seuls trades pris', () => {
    // Les deux ratés sont écartés : plus aucune perte subie, le seuil se
    // replie sur la perte par défaut — exactement comme si la série n'avait
    // compté que les deux réussites.
    const deuxGagnants = computeWalletReport(tokens([200, 200]), S)
    expect(report.seuilRentabilite).toBeCloseTo(deuxGagnants.seuilRentabilite!, 10)
  })

  it('n’abaisse pas le seuil avec une perte qu’on a évitée', () => {
    const subie = computeWalletReport(tokens([200, 20], { pertes: { 2: 20 } }), S)
    const evitee = computeWalletReport(
      tokens([200, 20], { pertes: { 2: 20 }, ecartes: [2] }),
      S,
    )
    // Une perte douce réellement subie abaisse le seuil d'équilibre. Écartée,
    // elle n'est plus une mesure de rien : le seuil repart de la perte par
    // défaut du wallet, plus lourde.
    expect(evitee.seuilRentabilite!).toBeGreaterThan(subie.seuilRentabilite!)
  })

  it('reste neutre quand tout est pris', () => {
    const tout = computeWalletReport(tokens([200, 20, 200, 20]), S)
    expect(tout.nPris).toBe(tout.n)
    expect(tout.netSolTout).toBeCloseTo(tout.netSol, 10)
    expect(tout.apportFiltre).toBeCloseTo(0, 10)
  })

  it('n’empêche pas de noter un token écarté plus tard', () => {
    // Un token écarté et non noté reste une ligne vide, comme un autre.
    const partiel = computeWalletReport(
      tokens([200, null], { ecartes: [2] }),
      S,
    )
    expect(partiel.n).toBe(1)
    expect(partiel.rows[1]).toEqual({ result: null, pris: false, cumulSol: null })
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
    expect(report.rows[1]).toEqual({ result: null, pris: true, cumulSol: null })
    expect(report.n).toBe(2)
  })

  it('convertit le net en euros quand le prix du SOL est connu', () => {
    const report = computeWalletReport(tokens([150]), S, { solPriceEur: 200 })
    expect(report.netEur).toBeCloseTo(29.4, 10)
  })

  it('laisse le net en euros à null sans prix du SOL', () => {
    expect(computeWalletReport(tokens([150]), S).netEur).toBeNull()
  })
})

describe('seuil de rentabilité', () => {
  it('se replie sur la perte par défaut quand aucun token ne perd', () => {
    const report = computeWalletReport(tokens([150, 200]), S)
    // G = (0,147 + 0,197) / 2 = 0,172 ; pertMoy = −(0,09 + 0,003) = −0,093
    expect(report.seuilRentabilite).toBeCloseTo((0.093 / (0.172 + 0.093)) * 100, 8)
  })

  it('se replie sur l’objectif tant qu’aucun token ne gagne', () => {
    const report = computeWalletReport(tokens([20, 20]), S)
    // G = 0,1 − 0,003 = 0,097 ; pertMoy = −0,093
    expect(report.seuilRentabilite).toBeCloseTo((0.093 / (0.097 + 0.093)) * 100, 8)
  })

  it('baisse quand les réussites rapportent plus gros', () => {
    const modeste = computeWalletReport(tokens([100, 20]), S)
    const gros = computeWalletReport(tokens([400, 20]), S)
    expect(gros.seuilRentabilite!).toBeLessThan(modeste.seuilRentabilite!)
  })

  it('tient compte des pertes réellement subies', () => {
    // Deux pertes douces : le seuil d'équilibre baisse.
    const report = computeWalletReport(
      tokens([150, 10, 10], { pertes: { 2: 20, 3: 20 } }),
      S,
    )
    // pertMoy = −(0,02 + 0,003) = −0,023 ; G = 0,147
    expect(report.seuilRentabilite).toBeCloseTo((0.023 / (0.147 + 0.023)) * 100, 8)
  })

  it('vaut null quand un trade gagnant ne rapporte rien', () => {
    const frais: Strategy = { ...S, frais: 0.1 } // gain pile à l'objectif : 0,1 − 0,1 = 0
    expect(computeWalletReport(tokens([100]), frais).seuilRentabilite).toBeNull()
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
      tokens([100, 20, 100, 20, 100, 20, 100, 20, 100, 20]),
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
