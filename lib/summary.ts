/**
 * Résumé d'un wallet pour la liste, et filtres de la liste.
 * Fonctions pures : ni base de données, ni React.
 */
import { computeWalletReport, type Tag } from './compute'
import { computeTestReport } from './test-report'
import { computeTradeReport } from './trade-report'
import type {
  GlobalSettings,
  WalletStatus,
  WalletWithTokens,
} from './repo/types'
import { screeningTokens, toDayInputs, toTokenInput } from './repo/types'

export type WalletSummary = {
  id: string
  label: string
  address: string
  analyzedAt: string
  status: WalletStatus
  /**
   * Tag du lot mis en avant : l'échantillon de screening tant qu'on est en
   * phase 1, le relevé de test ensuite. Les deux ne s'additionnent jamais.
   */
  tag: Tag
  /** Nombre de tokens notés dans le lot mis en avant. */
  n: number
  seuilAnalyse: number
  /**
   * Net mis en avant, en SOL : le résultat **réel** pour un wallet en phase
   * active, le net du lot de test sinon.
   */
  netSol: number
  /** `netSol` est de l'argent compté et non une simulation. */
  netReel: boolean
  /** Trades pris dont les montants manquent : le net réel est incomplet. */
  tradesIncomplets: number

  /** Journées de test observées. Zéro tant que la phase 2 n'a pas commencé. */
  joursObserves: number
  joursMinimum: number
  /** Journées restantes avant de pouvoir conclure le test. */
  joursRestants: number
}

export function summarize(
  wallet: WalletWithTokens,
  settings: GlobalSettings,
): WalletSummary {
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

  // Une fois le test lancé, c'est lui qui fait foi : l'échantillon de
  // screening est choisi à la main, le relevé de test est exhaustif.
  const enAvant = wallet.status === 'screening' ? screening : test.report

  // En phase active, c'est le réel qui fait foi — et lui seul. Afficher le
  // net simulé d'un wallet sur lequel on engage du SOL serait montrer la
  // prévision à la place du résultat.
  const enTrade = wallet.status === 'trade'
  const trade = enTrade
    ? computeTradeReport(toDayInputs(wallet, 'trade'), wallet.strategy, options)
    : null

  return {
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    analyzedAt: wallet.analyzedAt,
    status: wallet.status,
    tag: enAvant.effectiveTag,
    n: enAvant.n,
    seuilAnalyse: enAvant.seuilAnalyse,
    netSol: trade !== null ? trade.pnlReelSol : enAvant.netSol,
    netReel: trade !== null,
    tradesIncomplets: trade?.tradesIncomplets ?? 0,
    joursObserves: test.joursObserves,
    joursMinimum: test.joursMinimum,
    joursRestants: test.joursRestants,
  }
}

/**
 * Les segments suivent l'entonnoir, pas le tag.
 *
 * Le statut dit où en est le wallet dans le processus, le tag dit ce que
 * disent ses chiffres : filtrer sur le premier et afficher le second évite
 * que « En cours » veuille dire deux choses à la fois.
 */
export const SEGMENTS = [
  'tous',
  'screening',
  'test',
  'valides',
  'actifs',
  'ecartes',
] as const
export type Segment = (typeof SEGMENTS)[number]

export const SEGMENT_LABELS: Record<Segment, string> = {
  tous: 'Tous',
  screening: 'Screening',
  test: 'Test',
  valides: 'Validés',
  actifs: 'Actifs',
  ecartes: 'Écartés',
}

const SEGMENT_STATUS: Record<Exclude<Segment, 'tous'>, WalletStatus> = {
  screening: 'screening',
  test: 'test',
  valides: 'valide',
  actifs: 'trade',
  ecartes: 'rejete',
}

export function matchesSegment(summary: WalletSummary, segment: Segment): boolean {
  if (segment === 'tous') return true
  return summary.status === SEGMENT_STATUS[segment]
}

/** Recherche sur le nom ou l'adresse, insensible à la casse et aux accents. */
export function matchesQuery(summary: WalletSummary, query: string): boolean {
  const terme = normalize(query)
  if (terme === '') return true
  return (
    normalize(summary.label).includes(terme) ||
    normalize(summary.address).includes(terme)
  )
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function filterWallets(
  summaries: readonly WalletSummary[],
  { query, segment }: { query: string; segment: Segment },
): WalletSummary[] {
  return summaries.filter(
    (s) => matchesSegment(s, segment) && matchesQuery(s, query),
  )
}
