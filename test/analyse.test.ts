import { describe, expect, it } from 'vitest'

import {
  achatsDepuisSwaps,
  capitalisation,
  doitEtreRefaite,
  estLancementPumpFun,
  etatLigne,
  etatsDesLignes,
  FENETRE_ATH_HEURES,
  issueDepuisMultiple,
  issuesConnues,
  mcEntreeUsd,
  mcSommetUsd,
  meilleurMultiple,
  meilleurTp,
  multiplesExploitables,
  multipleDepuisPrix,
  multipleRetenu,
  alertesDeLigne,
  MULTIPLE_ABERRANT,
  multipleVise,
  numerosDeRelance,
  premiersAchats,
  prixDuSwap,
  seuilDeclenchement,
  simulerTakeProfits,
  sommetApres,
  sommetSuffit,
  supplyRetenue,
  SUPPLY_LANCEMENT,
  type LigneAnalyse,
} from '@/lib/analyse'
import { bilanSimule } from '@/lib/calcul'
import { WSOL, type Swap } from '@/lib/helius/swaps'

const MINT = 'Mint1111111111111111111111111111111111pump'
const AUTRE = 'Mint2222222222222222222222222222222222pump'
const HORS_PUMP = 'Mint33333333333333333333333333333333333333'

const T0 = 1_791_928_955

/** Un swap normalisé, tel que `lireSwaps` le rend. */
function swap(partiel: Partial<Swap> = {}): Swap {
  return {
    signature: 'Sig',
    horodatage: T0,
    protocole: 'pump_fun',
    mintEntree: WSOL,
    mintSortie: MINT,
    bruitEntree: 500_000_000, // 0,5 SOL
    bruitSortie: 5_000_000_000_000, // 5 000 000 tokens à 6 décimales
    decimales: 6,
    ...partiel,
  }
}

describe('achatsDepuisSwaps', () => {
  it('retient le SOL du swap, pas ce que le wallet a dépensé', () => {
    // Le wallet débourse davantage : tips, frais de bot, priority fee. Rien de
    // tout ça n'appartient au prix d'entrée.
    const achat = achatsDepuisSwaps([swap({ bruitEntree: 515_510_578 })])[0]!

    expect(achat.solPaye).toBeCloseTo(0.515_510_578, 9)
    expect(achat.tokensRecus).toBeCloseTo(5_000_000, 6)
  })

  it('ignore une vente', () => {
    const vente = swap({ mintEntree: MINT, mintSortie: WSOL })
    expect(achatsDepuisSwaps([vente])).toHaveLength(0)
  })

  it('ignore un swap token contre token', () => {
    expect(achatsDepuisSwaps([swap({ mintEntree: AUTRE, mintSortie: MINT })])).toHaveLength(0)
  })

  it('applique les décimales du token, pas une valeur supposée', () => {
    const achat = achatsDepuisSwaps([
      swap({ decimales: 9, bruitSortie: 5_000_000_000_000_000 }),
    ])[0]!
    expect(achat.tokensRecus).toBeCloseTo(5_000_000, 6)
  })

  it('retombe sur six décimales quand la réponse ne les donne pas', () => {
    const achat = achatsDepuisSwaps([swap({ decimales: null })])[0]!
    expect(achat.decimales).toBe(6)
  })
})

describe('premiersAchats', () => {
  it('ne garde que le premier achat de chaque mint', () => {
    const achats = achatsDepuisSwaps([
      swap({ signature: 'Tard', horodatage: T0 + 600 }),
      swap({ signature: 'Tot', horodatage: T0 }),
      swap({ signature: 'Milieu', horodatage: T0 + 300 }),
    ])

    const premiers = premiersAchats(achats)
    expect(premiers).toHaveLength(1)
    expect(premiers[0]!.signature).toBe('Tot')
  })

  it('garde deux mints distincts, même achetés à la même seconde', () => {
    const achats = achatsDepuisSwaps([
      swap({ mintSortie: MINT }),
      swap({ mintSortie: AUTRE }),
    ])
    expect(premiersAchats(achats)).toHaveLength(2)
  })

  it('rend les lignes dans l’ordre du temps', () => {
    const achats = achatsDepuisSwaps([
      swap({ mintSortie: AUTRE, horodatage: T0 + 100 }),
      swap({ mintSortie: MINT, horodatage: T0 }),
    ])
    expect(premiersAchats(achats).map((a) => a.mint)).toEqual([MINT, AUTRE])
  })
})

describe('supplyRetenue', () => {
  it('impose un milliard pour un lancement pump.fun, même si DAS dit moins', () => {
    // DAS renvoie la supply actuelle, burns compris : s'en servir
    // sous-estimerait la capitalisation d'entrée.
    expect(supplyRetenue(MINT, 960_590_499)).toBe(SUPPLY_LANCEMENT)
  })

  it('suit DAS pour un token qui n’est pas un lancement pump.fun', () => {
    expect(supplyRetenue(HORS_PUMP, 500_000_000)).toBe(500_000_000)
  })

  it('retombe sur un milliard si DAS se tait', () => {
    expect(supplyRetenue(HORS_PUMP, null)).toBe(SUPPLY_LANCEMENT)
  })

  it('reconnaît un mint pump.fun à son suffixe', () => {
    expect(estLancementPumpFun(MINT)).toBe(true)
    expect(estLancementPumpFun(HORS_PUMP)).toBe(false)
  })
})

describe('prixDuSwap', () => {
  it('calcule le prix d’un achat', () => {
    expect(prixDuSwap(swap())).toBeCloseTo(1e-7, 12)
  })

  it('calcule le prix d’une vente, dans l’autre sens', () => {
    const vente = swap({
      mintEntree: MINT,
      mintSortie: WSOL,
      bruitEntree: 5_000_000_000_000,
      bruitSortie: 500_000_000,
    })
    expect(prixDuSwap(vente)).toBeCloseTo(1e-7, 12)
  })

  it('ignore un swap de poussière', () => {
    // 0,0005 SOL : sous le seuil, et le prix qui en sort ne veut rien dire.
    expect(prixDuSwap(swap({ bruitEntree: 500_000 }))).toBeNull()
  })

  it('accepte un swap juste au seuil', () => {
    expect(prixDuSwap(swap({ bruitEntree: 1_000_000 }))).not.toBeNull()
  })

  it('ne dit rien d’un swap token contre token', () => {
    expect(prixDuSwap(swap({ mintEntree: AUTRE, mintSortie: MINT }))).toBeNull()
  })
})

describe('sommetApres', () => {
  const supply = SUPPLY_LANCEMENT

  it('retient la capitalisation la plus haute et son heure', () => {
    const sommet = sommetApres(
      [
        swap({ horodatage: T0 + 60, bruitEntree: 500_000_000 }),
        swap({ horodatage: T0 + 180, bruitEntree: 1_500_000_000 }),
        swap({ horodatage: T0 + 300, bruitEntree: 800_000_000 }),
      ],
      MINT,
      T0,
      supply,
    )

    expect(sommet?.mcSol).toBeCloseTo(300, 6)
    expect(sommet?.horodatage).toBe(T0 + 180)
  })

  it('ne regarde que les swaps qui concernent le mint visé', () => {
    // L'historique d'un mint renvoie des transactions qui portent aussi des
    // swaps sur d'autres tokens : sans filtre, un voisin fixerait l'ATH.
    const sommet = sommetApres(
      [
        swap({ horodatage: T0 + 60, bruitEntree: 500_000_000 }),
        swap({
          horodatage: T0 + 120,
          mintSortie: AUTRE,
          bruitEntree: 50_000_000_000,
        }),
      ],
      MINT,
      T0,
      supply,
    )

    expect(sommet?.mcSol).toBeCloseTo(100, 6)
  })

  it('ignore ce qui précède l’achat', () => {
    const sommet = sommetApres(
      [
        swap({ horodatage: T0 - 60, bruitEntree: 5_000_000_000 }),
        swap({ horodatage: T0 + 60, bruitEntree: 500_000_000 }),
      ],
      MINT,
      T0,
      supply,
    )

    expect(sommet?.mcSol).toBeCloseTo(100, 6)
  })

  it('compte les ventes : un prix atteint est un prix atteint', () => {
    const vente = swap({
      horodatage: T0 + 120,
      mintEntree: MINT,
      mintSortie: WSOL,
      bruitEntree: 5_000_000_000_000,
      bruitSortie: 2_000_000_000,
    })

    const sommet = sommetApres([swap({ horodatage: T0 + 60 }), vente], MINT, T0, supply)
    expect(sommet?.mcSol).toBeCloseTo(400, 6)
    expect(sommet?.horodatage).toBe(T0 + 120)
  })

  it('suit un token migré de la courbe vers la pool', () => {
    // Même mint, deux protocoles : la migration ne doit rien interrompre.
    const sommet = sommetApres(
      [
        swap({ horodatage: T0 + 60, protocole: 'pump_fun', bruitEntree: 500_000_000 }),
        swap({ horodatage: T0 + 600, protocole: 'pumpswap', bruitEntree: 2_500_000_000 }),
      ],
      MINT,
      T0,
      supply,
    )

    expect(sommet?.mcSol).toBeCloseTo(500, 6)
    expect(sommet?.horodatage).toBe(T0 + 600)
  })

  it('rend null quand aucun swap exploitable ne suit l’achat', () => {
    expect(sommetApres([], MINT, T0, supply)).toBeNull()
    expect(sommetApres([swap({ bruitEntree: 500_000 })], MINT, T0, supply)).toBeNull()
  })
})

describe('capitalisation et multiple', () => {
  it('capitalise un prix sur la supply', () => {
    expect(capitalisation(1e-7, SUPPLY_LANCEMENT)).toBeCloseTo(100, 6)
  })

  it('rapporte le sommet au prix d’entrée, dans la même unité', () => {
    expect(multipleDepuisPrix(1e-7, 2.87e-7)).toBeCloseTo(2.87, 6)
  })

  it('rend null sans sommet', () => {
    expect(multipleDepuisPrix(1e-7, null)).toBeNull()
  })

  it('rend null plutôt qu’un infini si l’entrée est nulle', () => {
    expect(multipleDepuisPrix(0, 1e-7)).toBeNull()
  })

  it('ne dépend pas de la supply : elle se simplifie', () => {
    // C'est l'invariant qui protège d'une comparaison entre une MC calculée
    // ici et une MC fournie par une source tierce.
    const a = multipleDepuisPrix(1e-7, 4e-7)
    const b = multipleDepuisPrix(2e-7, 8e-7)
    expect(a).toBeCloseTo(b!, 9)
  })

  it('traduit un TP en multiple visé', () => {
    expect(multipleVise(300)).toBe(4)
    expect(multipleVise(100)).toBe(2)
  })
})

describe('issueDepuisMultiple', () => {
  it('atteint le TP pile au seuil', () => {
    expect(issueDepuisMultiple(4, 300)).toBe('tp')
  })

  it('rate juste en dessous', () => {
    expect(issueDepuisMultiple(3.99, 300)).toBe('rate')
  })

  it('suit le TP du wallet : la même ligne change d’issue', () => {
    expect(issueDepuisMultiple(2.87, 300)).toBe('rate')
    expect(issueDepuisMultiple(2.87, 150)).toBe('tp')
  })

  it('dit « raté » faute de multiple : c’est le sens prudent', () => {
    expect(issueDepuisMultiple(null, 300)).toBe('rate')
  })
})

// ---------------------------------------------------------------------------

function ligne(partiel: Partial<LigneAnalyse> = {}): LigneAnalyse {
  return {
    mint: MINT,
    nom: 'Jeton Fictif',
    signature: 'Sig',
    acheteA: T0,
    solPaye: 0.5,
    tokensRecus: 5_000_000,
    decimales: 6,
    supply: SUPPLY_LANCEMENT,
    // Prix en SOL par token : 1e-7 à l'entrée, 4e-7 au sommet → ×4 pile.
    prixEntree: 1e-7,
    prixSommetBrut: 4e-7,
    prixSommetExec: 4e-7,
    sommetBrutA: T0 + 180,
    sommetExecA: T0 + 180,
    trouMax: 0,
    solUsdAchat: 100,
    solUsdSommet: 100,
    source: 'bougies',
    pool: null,
    mcEntreeSol: 100,
    athMcSol: 400,
    athA: T0 + 180,
    multiple: 4,
    athPartiel: false,
    erreur: null,
    ...partiel,
  }
}

describe('etatLigne', () => {
  it('déduit l’issue du multiple et du TP', () => {
    expect(etatLigne(ligne({ prixSommetBrut: 4e-7 }), 300)).toBe('tp')
    expect(etatLigne(ligne({ prixSommetBrut: 2e-7 }), 300)).toBe('rate')
  })

  it('dit « inconnue » sous le seuil quand l’ATH est tronqué', () => {
    // C'est le cas qui faussait les statistiques : un minorant sous le seuil
    // ne prouve pas un raté, le vrai sommet a pu le franchir.
    expect(etatLigne(ligne({ prixSommetBrut: 2e-7, athPartiel: true }), 300)).toBe('inconnue')
  })

  it('reste certain au-dessus du seuil, même tronqué', () => {
    // Là, la troncature ne change rien : le TP est déjà acquis.
    expect(etatLigne(ligne({ prixSommetBrut: 4.19e-7, athPartiel: true }), 300)).toBe('tp')
  })

  it('dit « inconnue » sans multiple du tout', () => {
    expect(etatLigne(ligne({ prixSommetBrut: null }), 300)).toBe('inconnue')
  })

  it('laisse le forçage manuel trancher, y compris une ligne inconnue', () => {
    const forcages = new Map([[MINT, 'rate' as const]])
    expect(etatLigne(ligne({ prixSommetBrut: 4e-7 }), 300, forcages)).toBe('rate')
    expect(etatLigne(ligne({ prixSommetBrut: null }), 300, forcages)).toBe('rate')
  })
})

describe('issuesConnues', () => {
  it('écarte les lignes indéterminées plutôt que de les compter en raté', () => {
    const lignes = [
      ligne({ prixSommetBrut: 4e-7 }),
      ligne({ mint: AUTRE, prixSommetBrut: 1.2e-7 }),
      ligne({ mint: HORS_PUMP, prixSommetBrut: 2e-7, athPartiel: true }),
    ]

    const etats = etatsDesLignes(lignes, 300)
    expect(etats).toEqual(['tp', 'rate', 'inconnue'])
    expect(issuesConnues(etats)).toEqual(['tp', 'rate'])
  })

  it('alimente bilanSimule sans toucher à ses formules', () => {
    const lignes = [
      ligne({ prixSommetBrut: 4e-7 }),
      ligne({ mint: AUTRE, prixSommetBrut: 1.2e-7 }),
      ligne({ mint: HORS_PUMP, prixSommetBrut: null }),
    ]

    const reglages = { mise: 0.05, tp: 300, frais: 0.008 }
    const bilan = bilanSimule(issuesConnues(etatsDesLignes(lignes, reglages.tp)), reglages)

    // La troisième ligne est indéterminée : elle ne pèse sur rien.
    expect(bilan.tokens).toBe(2)
    expect(bilan.tp).toBe(1)
    expect(bilan.rate).toBe(1)
    expect(bilan.resultat).toBeCloseTo(0.142 - 0.058, 6)
    expect(bilan.tauxTp).toBeCloseTo(50, 6)
  })
})

describe('numerosDeRelance', () => {
  it('numérote les noms qui reviennent, dans l’ordre des achats', () => {
    const lignes = [
      ligne({ mint: 'A', nom: 'Doge Cate', acheteA: T0 + 200 }),
      ligne({ mint: 'B', nom: 'Doge Cate', acheteA: T0 }),
      ligne({ mint: 'C', nom: 'Doge Cate', acheteA: T0 + 100 }),
    ]

    const numeros = numerosDeRelance(lignes)
    expect(numeros.get('B')).toBe(1)
    expect(numeros.get('C')).toBe(2)
    expect(numeros.get('A')).toBe(3)
  })

  it('ne numérote pas un nom unique', () => {
    const lignes = [ligne({ mint: 'A', nom: 'Seul' }), ligne({ mint: 'B', nom: 'Autre' })]
    expect(numerosDeRelance(lignes).size).toBe(0)
  })

  it('ignore les lignes sans nom', () => {
    const lignes = [ligne({ mint: 'A', nom: null }), ligne({ mint: 'B', nom: null })]
    expect(numerosDeRelance(lignes).size).toBe(0)
  })
})

describe('arrêt anticipé au TP', () => {
  it('place le seuil au multiple visé par le TP', () => {
    expect(seuilDeclenchement(87.6, 300)).toBeCloseTo(350.4, 6)
    expect(seuilDeclenchement(100, 100)).toBeCloseTo(200, 6)
  })

  it('autorise l’arrêt dès que le seuil est franchi', () => {
    expect(sommetSuffit({ mcSol: 400, horodatage: T0 }, 100, 300)).toBe(true)
  })

  it('n’arrête pas pile en dessous', () => {
    expect(sommetSuffit({ mcSol: 399.9, horodatage: T0 }, 100, 300)).toBe(false)
  })

  it('arrête à l’égalité stricte, comme l’issue', () => {
    expect(sommetSuffit({ mcSol: 400, horodatage: T0 }, 100, 300)).toBe(true)
    expect(issueDepuisMultiple(400 / 100, 300)).toBe('tp')
  })

  it('n’arrête pas sans sommet', () => {
    expect(sommetSuffit(null, 100, 300)).toBe(false)
  })

  it('suit le TP : un seuil plus bas arrête plus tôt', () => {
    const sommet = { mcSol: 250, horodatage: T0 }
    expect(sommetSuffit(sommet, 100, 300)).toBe(false)
    expect(sommetSuffit(sommet, 100, 100)).toBe(true)
  })
})

describe('doitEtreRefaite', () => {
  it('reprend une ligne sans source : elle vient d’une version périmée', () => {
    expect(doitEtreRefaite(ligne({ source: null }))).toBe(true)
  })

  it('reprend un repli tronqué alors qu’une pool existait', () => {
    // Les bougies étaient possibles, l'appel a juste échoué. Sans cette
    // relance, un seul refus figerait un minorant pour toujours.
    expect(
      doitEtreRefaite(ligne({ source: 'swaps', athPartiel: true, pool: 'Pool1' })),
    ).toBe(true)
  })

  it('laisse tranquille un repli tronqué sans pool : rien de mieux à en tirer', () => {
    expect(
      doitEtreRefaite(ligne({ source: 'swaps', athPartiel: true, pool: null })),
    ).toBe(false)
  })

  it('laisse tranquille un repli complet', () => {
    expect(
      doitEtreRefaite(ligne({ source: 'swaps', athPartiel: false, pool: 'Pool1' })),
    ).toBe(false)
  })

  it('laisse tranquille une ligne venue des bougies', () => {
    expect(doitEtreRefaite(ligne({ source: 'bougies', pool: 'Pool1' }))).toBe(false)
  })

  it('n’insiste pas sur une ligne en erreur : elle attend un Réanalyser', () => {
    expect(doitEtreRefaite(ligne({ source: null, erreur: 'panne' }))).toBe(false)
  })
})

describe('deux sommets, une base de décision', () => {
  it('le multiple retenu suit BASE_ISSUE', () => {
    // Mèche à ×9, cours tenu à ×3 : les deux sont conservés.
    const l = ligne({ prixSommetBrut: 9e-7, prixSommetExec: 3e-7 })
    expect(multipleDepuisPrix(l.prixEntree, l.prixSommetBrut)).toBeCloseTo(9, 6)
    expect(multipleDepuisPrix(l.prixEntree, l.prixSommetExec)).toBeCloseTo(3, 6)
    // Par défaut le « high » : sur ces tokens, le sommet est une pointe d'une
    // minute et la clôture de cette minute est déjà redescendue.
    expect(multipleRetenu(l)).toBeCloseTo(9, 6)
  })

  it('une pointe d’une minute suffit à faire un TP', () => {
    const l = ligne({ prixSommetBrut: 9e-7, prixSommetExec: 3e-7 })
    expect(etatLigne(l, 300)).toBe('tp')
  })
})

describe('alertesDeLigne', () => {
  it('ne dit rien sur une ligne saine', () => {
    expect(alertesDeLigne(ligne())).toEqual([])
  })

  it('signale un sommet sous le prix d’entrée', () => {
    // Contradictoire : mauvaise pool, ou bougie antérieure à l'achat.
    expect(alertesDeLigne(ligne({ prixSommetBrut: 0.5e-7 }))).toContain('sommet-sous-entree')
  })

  it('signale un multiple invraisemblable', () => {
    const l = ligne({ prixSommetBrut: 1e-7 * (MULTIPLE_ABERRANT + 1) })
    expect(alertesDeLigne(l)).toContain('multiple-aberrant')
  })

  it('ne signale pas une couverture trouée', () => {
    // Une minute sans transaction est normale sur un memecoin : un trou n'est
    // pas un défaut de mesure.
    expect(alertesDeLigne(ligne({ trouMax: 45 * 60 }))).toEqual([])
  })

  it('signale un sommet collé à la fin de la fenêtre', () => {
    // La montée continuait peut-être après : la suite est hors champ.
    const fin = T0 + FENETRE_ATH_HEURES * 3600
    expect(alertesDeLigne(ligne({ sommetBrutA: fin - 300 }))).toContain(
      'sommet-en-fin-de-fenetre',
    )
  })

  it('fait passer la ligne en « à vérifier », quelle que soit l’issue', () => {
    // Même un multiple largement au-dessus du seuil attend une relecture.
    const fin = T0 + FENETRE_ATH_HEURES * 3600
    const l = ligne({ prixSommetBrut: 8e-7, sommetBrutA: fin - 300 })
    expect(etatLigne(l, 300)).toBe('verifier')
  })

  it('cède devant un forçage manuel', () => {
    const l = ligne({ trouMax: 30 * 60 })
    expect(etatLigne(l, 300, new Map([[MINT, 'tp']]))).toBe('tp')
  })
})

describe('doitEtreRefaite — reprise des prix canoniques', () => {
  it('reprend une ligne dont le sommet n’existe qu’en capitalisation', () => {
    // Écrite avant que le multiple se calcule sur des prix : sans reprise,
    // elle basculerait en « inconnue » alors qu'elle était juste.
    const l = ligne({
      source: 'bougies',
      prixSommetBrut: null,
      prixSommetExec: null,
      athMcSol: 400,
    })
    expect(doitEtreRefaite(l)).toBe(true)
  })

  it('laisse tranquille une ligne qui porte déjà ses prix', () => {
    expect(doitEtreRefaite(ligne({ source: 'bougies' }))).toBe(false)
  })

  it('laisse tranquille une ligne sans sommet du tout', () => {
    // Rien à reprendre : il n'y a jamais eu d'ATH à convertir.
    const l = ligne({
      source: 'swaps',
      prixSommetBrut: null,
      prixSommetExec: null,
      athMcSol: null,
      athPartiel: false,
    })
    expect(doitEtreRefaite(l)).toBe(false)
  })
})

describe('capitalisations en dollars', () => {
  it('convertit au taux de l’instant, pas à celui du jour', () => {
    // 1e-7 SOL/token × 1e9 = 100 SOL d'entrée ; sommet ×4 = 400 SOL.
    // Le SOL valait 100 $ à l'achat et 120 $ au sommet.
    const l = ligne({ solUsdAchat: 100, solUsdSommet: 120 })
    expect(mcEntreeUsd(l)).toBeCloseTo(10_000, 6)
    expect(mcSommetUsd(l)).toBeCloseTo(48_000, 6)
  })

  it('ne rend aucun dollar quand le taux manque', () => {
    // Mieux vaut n'afficher que des SOL qu'un montant converti au mauvais cours.
    expect(mcEntreeUsd(ligne({ solUsdAchat: null }))).toBeNull()
    expect(mcSommetUsd(ligne({ solUsdSommet: null }))).toBeNull()
  })

  it('le multiple, lui, ne dépend d’aucun change', () => {
    // C'est ce qui décide de l'issue : il reste juste même sans taux.
    const l = ligne({ solUsdAchat: null, solUsdSommet: null })
    expect(multipleRetenu(l)).toBeCloseTo(4, 6)
    expect(etatLigne(l, 300)).toBe('tp')
  })
})

describe('le multiple maximal atteignable', () => {
  it('rend le plus haut multiple du lot', () => {
    const lignes = [
      ligne({ mint: 'A', prixSommetBrut: 2e-7 }),
      ligne({ mint: 'B', prixSommetBrut: 12e-7 }),
      ligne({ mint: 'C', prixSommetBrut: 4e-7 }),
    ]
    expect(meilleurMultiple(lignes)).toBeCloseTo(12, 6)
    expect(multiplesExploitables(lignes)).toHaveLength(3)
  })

  it('écarte un multiple invraisemblable : il écraserait la lecture', () => {
    const lignes = [
      ligne({ mint: 'A', prixSommetBrut: 3e-7 }),
      ligne({ mint: 'B', prixSommetBrut: 1e-7 * (MULTIPLE_ABERRANT + 1) }),
    ]
    expect(meilleurMultiple(lignes)).toBeCloseTo(3, 6)
  })

  it('écarte un sommet sous le prix d’entrée', () => {
    expect(meilleurMultiple([ligne({ prixSommetBrut: 0.5e-7 })])).toBeNull()
  })

  it('ne rend rien quand aucun ATH n’est établi', () => {
    expect(meilleurMultiple([ligne({ prixSommetBrut: null, prixSommetExec: null })])).toBeNull()
  })
})

describe('simulerTakeProfits', () => {
  const reglages = { mise: 0.05, tp: 300, frais: 0.008 }

  it('compte, pour chaque seuil, les tokens qui l’atteignent', () => {
    const lignes = [
      ligne({ mint: 'A', prixSommetBrut: 2.5e-7 }),
      ligne({ mint: 'B', prixSommetBrut: 6e-7 }),
      ligne({ mint: 'C', prixSommetBrut: 1.2e-7 }),
    ]
    const simules = simulerTakeProfits(lignes, reglages)

    const a2 = simules.find((s) => s.multiple === 2)
    const a5 = simules.find((s) => s.multiple === 5)
    expect(a2?.atteints).toBe(2)
    expect(a2?.tokens).toBe(3)
    expect(a5?.atteints).toBe(1)
  })

  it('garde toujours le TP du wallet, même hors palier rond', () => {
    const simules = simulerTakeProfits([ligne()], { ...reglages, tp: 250 })
    expect(simules.some((s) => s.multiple === 3.5)).toBe(true)
    // La liste reste croissante : c'est l'ordre d'affichage.
    expect([...simules].sort((a, b) => a.multiple - b.multiple)).toEqual(simules)
  })

  it('écarte du bilan les lignes indéterminées à ce seuil-là', () => {
    // Minorant à ×4 : tranchée tant que le seuil est dessous, indécidable
    // au-dessus — et alors écartée plutôt que comptée en raté.
    const simules = simulerTakeProfits([ligne({ athPartiel: true })], reglages)
    const a3 = simules.find((s) => s.multiple === 3)
    const a10 = simules.find((s) => s.multiple === 10)
    expect(a3?.tokens).toBe(1)
    expect(a10?.tokens).toBe(0)
    expect(a10?.indetermines).toBe(1)
  })

  it('désigne le TP le plus rentable, le plus bas à égalité', () => {
    // Trois tokens à ×4 pile : au-delà, plus rien n'est atteint.
    const lignes = ['A', 'B', 'C'].map((mint) => ligne({ mint, prixSommetBrut: 4e-7 }))
    const optimal = meilleurTp(simulerTakeProfits(lignes, reglages))
    expect(optimal?.multiple).toBe(4)
  })

  it('ne désigne personne quand aucun TP n’est rentable', () => {
    const lignes = ['A', 'B', 'C'].map((mint) => ligne({ mint, prixSommetBrut: 1.1e-7 }))
    expect(meilleurTp(simulerTakeProfits(lignes, reglages))).toBeNull()
  })
})

describe('la portée d’un forçage dans la simulation', () => {
  const reglages = { mise: 0.05, tp: 300, frais: 0.008 }

  it('garde un gagnant forcé en dessous de son seuil, l’écarte au-dessus', () => {
    // Forcé « TP » à ×4 : vrai aussi à ×2, muet à ×10.
    const lignes = [ligne({ mint: 'A', prixSommetBrut: null, prixSommetExec: null })]
    const forcages = new Map([['A', 'tp' as const]])
    const simules = simulerTakeProfits(lignes, reglages, forcages)

    expect(simules.find((s) => s.multiple === 2)?.atteints).toBe(1)
    expect(simules.find((s) => s.multiple === 4)?.atteints).toBe(1)
    expect(simules.find((s) => s.multiple === 10)?.tokens).toBe(0)
  })

  it('garde un raté forcé au-dessus de son seuil, l’écarte en dessous', () => {
    const lignes = [ligne({ mint: 'A', prixSommetBrut: null, prixSommetExec: null })]
    const forcages = new Map([['A', 'rate' as const]])
    const simules = simulerTakeProfits(lignes, reglages, forcages)

    expect(simules.find((s) => s.multiple === 10)?.tokens).toBe(1)
    expect(simules.find((s) => s.multiple === 10)?.atteints).toBe(0)
    expect(simules.find((s) => s.multiple === 2)?.tokens).toBe(0)
  })

  it('au TP du wallet, la simulation rend exactement le bilan du tableau', () => {
    const lignes = [
      ligne({ mint: 'A', prixSommetBrut: 6e-7 }),
      ligne({ mint: 'B', prixSommetBrut: 1.2e-7 }),
      ligne({ mint: 'C', prixSommetBrut: null, prixSommetExec: null }),
    ]
    const forcages = new Map([['C', 'tp' as const]])

    const attendu = bilanSimule(
      issuesConnues(etatsDesLignes(lignes, reglages.tp, forcages)),
      reglages,
    )
    const courant = simulerTakeProfits(lignes, reglages, forcages).find(
      (s) => s.multiple === multipleVise(reglages.tp),
    )

    expect(courant?.resultat).toBeCloseTo(attendu.resultat, 9)
    expect(courant?.tokens).toBe(attendu.tokens)
    expect(courant?.atteints).toBe(attendu.tp)
  })
})
