/**
 * Vue d'ensemble : ce que disent tous les wallets pris ensemble.
 *
 * Trois règles tiennent tout ce fichier, et ce sont les mêmes que dans
 * lib/test-report.ts et lib/trade-report.ts :
 *
 * - le screening ne s'additionne jamais au test. L'échantillon de screening
 *   est choisi à la main, donc flatteur par construction ; seul le relevé
 *   jour par jour est exhaustif. Les deux totaux existent, côte à côte,
 *   jamais confondus.
 * - le test ne s'additionne jamais au réel. Le net de test est ce que la
 *   stratégie *aurait* donné ; `netReelSol` est de l'argent compté. Les
 *   mélanger donnerait un total que rien ne vérifie.
 * - un token non pris ne compte pas dans le résultat, mais compte dans ce que
 *   le wallet a lancé.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import { computeWalletReport, type Tag } from './compute'
import type { GlobalSettings, WalletStatus, WalletWithTokens } from './repo/types'
import { screeningTokens, toDayInputs, toTokenInput } from './repo/types'
import { computeTestReport } from './test-report'
import { computeTradeReport } from './trade-report'

/** Un jour de la courbe, tous wallets confondus. */
export type PointJour = {
  /** AAAA-MM-JJ */
  day: string
  /** Résultat de la journée, en SOL. */
  pnlSol: number
  /** Résultat cumulé depuis le premier jour relevé, en SOL. */
  cumulSol: number
  /** Nombre de wallets ayant relevé une journée ce jour-là. */
  wallets: number
}

/**
 * Un wallet réduit à ce qu'en disent la vue d'ensemble et l'entonnoir.
 *
 * L'entonnoir a besoin de savoir où en est chaque wallet dans sa phase —
 * combien de tokens notés sur le plancher en screening, combien de journées
 * observées en test — pour que sa carte montre l'avancement sans qu'on ait
 * à l'ouvrir.
 */
export type LigneWallet = {
  id: string
  label: string
  address: string
  status: WalletStatus
  /** Tag du lot mis en avant. */
  tag: Tag
  /** Net du lot mis en avant (test dès qu'il a commencé), en SOL. */
  netSol: number
  /** Tokens notés du lot mis en avant. */
  n: number
  /** Tokens notés et pris. */
  nPris: number
  /** Taux à l'objectif du lot mis en avant, en %. */
  taux: number
  /** Tokens notés attendus avant de juger un screening. */
  seuilAnalyse: number
  /**
   * Résultat réellement encaissé en phase active, en SOL. Zéro tant qu'aucun
   * trade n'est chiffré. Il ne s'ajoute pas à `netSol` : l'un est compté,
   * l'autre simulé.
   */
  netReelSol: number
  /** Journées de trade relevées. */
  joursTrades: number
  joursObserves: number
  /** Journées à observer avant de pouvoir conclure un test. */
  joursMinimum: number
  /** Journées restantes avant de pouvoir conclure. */
  joursRestants: number
  /** Le test peut être conclu : la carte doit réclamer la décision. */
  verdictDisponible: boolean
}

export type Portefeuille = {
  total: number
  parStatut: Record<WalletStatus, number>

  /** Net cumulé de la phase de test, tous wallets confondus. */
  netTestSol: number
  /** Converti, ou `null` si le prix du SOL n'est pas renseigné. */
  netTestEur: number | null
  /**
   * Net de l'échantillon de screening, tenu à part.
   * Il ne s'ajoute pas au net de test : ce sont deux mesures différentes.
   */
  netScreeningSol: number

  /**
   * Ce que la phase active a réellement rapporté, tous wallets confondus.
   * Tenu à part de `netTestSol` : le test simule, celui-ci compte.
   */
  netReelSol: number
  /** Converti, ou `null` si le prix du SOL n'est pas renseigné. */
  netReelEur: number | null
  /** Trades dont l'entrée et la sortie sont saisies. */
  tradesChiffres: number
  /** Trades pris qui attendent encore leurs montants. */
  tradesIncomplets: number

  /** Tokens relevés en phase de test, pris ou non. */
  tokensTest: number
  /** Tokens pris en phase de test. */
  tokensPris: number
  /** Tokens notés en phase de test. */
  tokensNotes: number
  /** Tokens notés ayant atteint leur objectif. */
  hits: number
  /** Taux à l'objectif agrégé sur la phase de test, en %. */
  taux: number

  /** Journées distinctes relevées, toutes phases de test confondues. */
  joursObserves: number
  /** La courbe du test, de la plus ancienne journée à la plus récente. */
  courbe: PointJour[]
  /**
   * La même courbe pour la phase active, en SOL réellement encaissés. Vide
   * tant qu'aucun trade n'est chiffré. Deux courbes et non une seule : elles
   * ne mesurent pas la même chose, les superposer mentirait.
   */
  courbeReelle: PointJour[]

  /** Une ligne par wallet, dans l'ordre reçu. */
  lignes: LigneWallet[]
  /** Meilleur et pire wallet au net, `null` sans aucun wallet noté. */
  meilleur: LigneWallet | null
  pire: LigneWallet | null
}

const STATUTS_VIDES: Record<WalletStatus, number> = {
  screening: 0,
  test: 0,
  valide: 0,
  trade: 0,
  rejete: 0,
}

/**
 * Bilan de tous les wallets.
 *
 * La courbe agrège les journées par date : deux wallets relevés le même jour
 * donnent un seul point. C'est voulu — la question à laquelle elle répond est
 * « qu'est-ce que ma journée a donné », pas « qu'a fait chaque wallet ».
 */
export function computePortefeuille(
  wallets: readonly WalletWithTokens[],
  settings: GlobalSettings,
): Portefeuille {
  const parStatut = { ...STATUTS_VIDES }
  const parJour = new Map<string, { pnlSol: number; wallets: number }>()
  const parJourReel = new Map<string, { pnlSol: number; wallets: number }>()
  const lignes: LigneWallet[] = []

  let netTestSol = 0
  let netScreeningSol = 0
  let netReelSol = 0
  let tradesChiffres = 0
  let tradesIncomplets = 0
  let tokensTest = 0
  let tokensPris = 0
  let tokensNotes = 0
  let hits = 0

  for (const wallet of wallets) {
    const options = {
      tagOverride: wallet.tagOverride,
      solPriceEur: settings.solPriceEur,
    }

    const screening = computeWalletReport(
      screeningTokens(wallet).map(toTokenInput),
      wallet.strategy,
      options,
    )
    const test = computeTestReport(toDayInputs(wallet), wallet.strategy, options)
    const trade = computeTradeReport(
      toDayInputs(wallet, 'trade'),
      wallet.strategy,
      options,
    )

    parStatut[wallet.status] += 1
    netScreeningSol += screening.netSol
    netTestSol += test.pnlSol
    netReelSol += trade.pnlReelSol
    tradesChiffres += trade.tradesChiffres
    tradesIncomplets += trade.tradesIncomplets
    tokensTest += test.tokensTotal
    tokensPris += test.tokensPris
    tokensNotes += test.report.n
    hits += test.report.hits

    cumulerJours(parJour, test.days, (jour) => jour.pnlSol)
    cumulerJours(parJourReel, trade.days, (jour) => jour.pnlReelSol)

    // Une fois le test lancé, c'est lui qui fait foi : l'échantillon de
    // screening est choisi à la main, le relevé de test est exhaustif.
    const enAvant = wallet.status === 'screening' ? screening : test.report

    lignes.push({
      id: wallet.id,
      label: wallet.label,
      address: wallet.address,
      status: wallet.status,
      tag: enAvant.effectiveTag,
      netSol: enAvant.netSol,
      n: enAvant.n,
      nPris: enAvant.nPris,
      taux: enAvant.taux,
      seuilAnalyse: enAvant.seuilAnalyse,
      netReelSol: trade.pnlReelSol,
      joursTrades: trade.joursObserves,
      joursObserves: test.joursObserves,
      joursMinimum: test.joursMinimum,
      joursRestants: test.joursRestants,
      // Un wallet encore en screening n'a rien à conclure, même si le
      // plancher de journées est techniquement à zéro.
      verdictDisponible: wallet.status === 'test' && test.verdictDisponible,
    })
  }

  const courbe = tracer(parJour)
  const courbeReelle = tracer(parJourReel)

  // Un wallet sans aucun token noté n'est ni le meilleur ni le pire : son
  // zéro ne dit rien, et il écraserait un vrai résultat négatif.
  const notes = lignes.filter((ligne) => ligne.n > 0)
  const classees = [...notes].sort((a, b) => b.netSol - a.netSol)

  return {
    total: wallets.length,
    parStatut,
    netTestSol,
    netTestEur:
      settings.solPriceEur !== null ? netTestSol * settings.solPriceEur : null,
    netScreeningSol,
    netReelSol,
    netReelEur:
      settings.solPriceEur !== null ? netReelSol * settings.solPriceEur : null,
    tradesChiffres,
    tradesIncomplets,
    tokensTest,
    tokensPris,
    tokensNotes,
    hits,
    taux: tokensNotes > 0 ? (hits / tokensNotes) * 100 : 0,
    joursObserves: parJour.size,
    courbe,
    courbeReelle,
    lignes,
    meilleur: classees[0] ?? null,
    pire: classees.length > 1 ? (classees.at(-1) ?? null) : null,
  }
}

/** Empile les journées d'un wallet dans le cumul tous-wallets d'une date. */
function cumulerJours<T extends { day: string }>(
  parJour: Map<string, { pnlSol: number; wallets: number }>,
  jours: readonly T[],
  valeur: (jour: T) => number,
): void {
  for (const jour of jours) {
    const pnlSol = valeur(jour)
    const cumul = parJour.get(jour.day)
    if (cumul) {
      cumul.pnlSol += pnlSol
      cumul.wallets += 1
    } else {
      parJour.set(jour.day, { pnlSol, wallets: 1 })
    }
  }
}

/** Les journées cumulées, triées dans le temps, avec leur cumul courant. */
function tracer(
  parJour: ReadonlyMap<string, { pnlSol: number; wallets: number }>,
): PointJour[] {
  let cumul = 0
  return [...parJour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, jour]) => {
      cumul += jour.pnlSol
      return { day, pnlSol: jour.pnlSol, cumulSol: cumul, wallets: jour.wallets }
    })
}

/**
 * Les lignes rangées par colonne de l'entonnoir.
 *
 * L'ordre à l'intérieur d'une colonne met en tête ce qui réclame une
 * décision, puis ce qui est le plus avancé : une colonne d'entonnoir se lit
 * du haut vers le bas, et le haut doit porter ce sur quoi agir.
 */
export function parEtat(
  lignes: readonly LigneWallet[],
): Record<WalletStatus, LigneWallet[]> {
  const colonnes: Record<WalletStatus, LigneWallet[]> = {
    screening: [],
    test: [],
    valide: [],
    trade: [],
    rejete: [],
  }

  for (const ligne of lignes) colonnes[ligne.status].push(ligne)

  for (const statut of Object.keys(colonnes) as WalletStatus[]) {
    colonnes[statut].sort((a, b) => {
      if (a.verdictDisponible !== b.verdictDisponible) {
        return a.verdictDisponible ? -1 : 1
      }
      const ecart = avancement(b) - avancement(a)
      return ecart !== 0 ? ecart : a.label.localeCompare(b.label, 'fr')
    })
  }

  return colonnes
}

/**
 * Part du chemin parcourue dans la phase en cours, entre 0 et 1.
 *
 * En screening c'est le nombre de tokens notés, en test le nombre de
 * journées observées. Hors de ces deux phases, le wallet est arrivé.
 */
export function avancement(ligne: LigneWallet): number {
  if (ligne.status === 'screening') {
    return ligne.seuilAnalyse > 0 ? Math.min(1, ligne.n / ligne.seuilAnalyse) : 1
  }
  if (ligne.status === 'test') {
    return ligne.joursMinimum > 0
      ? Math.min(1, ligne.joursObserves / ligne.joursMinimum)
      : 1
  }
  return 1
}

/** Colonnes triables du tableau de la vue d'ensemble. */
export const COLONNES_PORTEFEUILLE = [
  'label',
  'status',
  'n',
  'taux',
  'netSol',
  'joursObserves',
] as const

export type ColonnePortefeuille = (typeof COLONNES_PORTEFEUILLE)[number]

export type Tri = { colonne: ColonnePortefeuille; sens: 'asc' | 'desc' }

const ORDRE_STATUT: Record<WalletStatus, number> = {
  // La phase active en tête : c'est là qu'il y a du SOL en jeu, donc là qu'on
  // regarde en premier.
  trade: 0,
  test: 1,
  screening: 2,
  valide: 3,
  rejete: 4,
}

/**
 * Trie les lignes du tableau.
 *
 * Le tri est stable et le nom sert toujours de départage : deux wallets au
 * même net ne doivent pas changer de place d'un rendu à l'autre.
 */
export function trierLignes(
  lignes: readonly LigneWallet[],
  { colonne, sens }: Tri,
): LigneWallet[] {
  const signe = sens === 'asc' ? 1 : -1

  return [...lignes].sort((a, b) => {
    const ecart =
      colonne === 'label'
        ? a.label.localeCompare(b.label, 'fr')
        : colonne === 'status'
          ? ORDRE_STATUT[a.status] - ORDRE_STATUT[b.status]
          : a[colonne] - b[colonne]

    return ecart !== 0 ? ecart * signe : a.label.localeCompare(b.label, 'fr')
  })
}
