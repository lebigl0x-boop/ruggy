/**
 * Vue d'ensemble : ce que disent tous les wallets pris ensemble.
 *
 * Deux règles tiennent tout ce fichier, et ce sont les mêmes que dans
 * lib/test-report.ts :
 *
 * - le screening ne s'additionne jamais au test. L'échantillon de screening
 *   est choisi à la main, donc flatteur par construction ; seul le relevé
 *   jour par jour est exhaustif. Les deux totaux existent, côte à côte,
 *   jamais confondus.
 * - un token non pris ne compte pas dans le résultat, mais compte dans ce que
 *   le wallet a lancé.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import { computeWalletReport, type Tag } from './compute'
import type { GlobalSettings, WalletStatus, WalletWithTokens } from './repo/types'
import { screeningTokens, toDayInputs, toTokenInput } from './repo/types'
import { computeTestReport } from './test-report'

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
  /** La courbe, de la plus ancienne journée à la plus récente. */
  courbe: PointJour[]

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
  const lignes: LigneWallet[] = []

  let netTestSol = 0
  let netScreeningSol = 0
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

    parStatut[wallet.status] += 1
    netScreeningSol += screening.netSol
    netTestSol += test.pnlSol
    tokensTest += test.tokensTotal
    tokensPris += test.tokensPris
    tokensNotes += test.report.n
    hits += test.report.hits

    for (const jour of test.days) {
      const cumul = parJour.get(jour.day)
      if (cumul) {
        cumul.pnlSol += jour.pnlSol
        cumul.wallets += 1
      } else {
        parJour.set(jour.day, { pnlSol: jour.pnlSol, wallets: 1 })
      }
    }

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
      joursObserves: test.joursObserves,
      joursMinimum: test.joursMinimum,
      joursRestants: test.joursRestants,
      // Un wallet encore en screening n'a rien à conclure, même si le
      // plancher de journées est techniquement à zéro.
      verdictDisponible: wallet.status === 'test' && test.verdictDisponible,
    })
  }

  let cumul = 0
  const courbe: PointJour[] = [...parJour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, jour]) => {
      cumul += jour.pnlSol
      return { day, pnlSol: jour.pnlSol, cumulSol: cumul, wallets: jour.wallets }
    })

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
    tokensTest,
    tokensPris,
    tokensNotes,
    hits,
    taux: tokensNotes > 0 ? (hits / tokensNotes) * 100 : 0,
    joursObserves: parJour.size,
    courbe,
    lignes,
    meilleur: classees[0] ?? null,
    pire: classees.length > 1 ? (classees.at(-1) ?? null) : null,
  }
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
  test: 0,
  screening: 1,
  valide: 2,
  rejete: 3,
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
