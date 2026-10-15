/**
 * Objets métier manipulés par l'application.
 *
 * Ils ne sont pas les lignes de la base : la couche repository traduit dans
 * les deux sens. L'UI ne doit jamais importer Drizzle ni lib/db directement.
 */
import type { Strategy, TagOverride, TokenInput } from '../compute'
import type { DayInput, DayState } from '../test-report'

/** D'où viennent les données. 'helius' est réservé à l'import automatique à venir. */
export type Source = 'manual' | 'helius'

/**
 * Où en est le wallet dans l'entonnoir.
 *
 * 'screening' : échantillon historique, on cherche à savoir si ça vaut le coup
 * de le suivre. 'test' : relevé exhaustif jour après jour. Puis 'valide' ou
 * 'rejete' une fois le test conclu. 'trade' : le wallet validé est passé en
 * phase active — on engage du SOL dessus, et les chiffres enregistrés sont
 * des montants réels.
 *
 * 'trade' est stocké tel quel mais s'affiche « Actif » : au niveau d'une
 * journée, `DayState` emploie déjà 'actif' pour « il a tradé ce jour-là », et
 * deux sens pour le même mot en base rendrait le code illisible.
 */
export type WalletStatus = 'screening' | 'test' | 'valide' | 'trade' | 'rejete'

/** Le lot auquel appartient un token. Les trois ne s'additionnent jamais. */
export type TokenPhase = 'screening' | 'test' | 'trade'

/**
 * Les phases qui tiennent un relevé jour par jour. Le screening n'en est pas :
 * son échantillon est choisi dans le passé, pas observé au fil des jours.
 */
export type DayPhase = 'test' | 'trade'

export type Token = {
  id: string
  walletId: string
  position: number
  name: string | null
  mint: string | null
  gain: number | null
  /** Perte de ce lancement en %. `null` = on reprend celle du wallet. */
  perteRug: number | null
  delay: number | null
  /**
   * Le token a été pris. Un token non pris reste relevé — il dit ce que le
   * wallet a lancé — mais il n'entre pas dans le résultat.
   */
  pris: boolean
  phase: TokenPhase
  /** Journée de rattachement. Toujours renseignée hors screening. */
  dayId: string | null
  /**
   * SOL réellement engagé. `null` hors phase active — et `null` aussi en
   * phase active tant que le trade n'a pas été chiffré.
   */
  entreeSol: number | null
  /** SOL réellement récupéré à la sortie. */
  sortieSol: number | null
  source: Source
}

/** Une journée relevée, en phase de test ou en phase active. */
export type WalletDay = {
  id: string
  walletId: string
  /** AAAA-MM-JJ */
  day: string
  state: DayState
  /** À quelle phase appartient la journée. */
  phase: DayPhase
  note: string
  /** Moment de la saisie. */
  createdAt: string
  updatedAt: string
}

export type Wallet = {
  id: string
  label: string
  address: string
  /** AAAA-MM-JJ */
  analyzedAt: string
  notes: string
  tagOverride: TagOverride | null
  status: WalletStatus
  /** Premier jour de la phase de test. `null` tant qu'elle n'a pas commencé. */
  testStartedAt: string | null
  /** Premier jour de la phase active. `null` tant qu'elle n'a pas commencé. */
  tradeStartedAt: string | null
  strategy: Strategy
  source: Source
  createdAt: string
  updatedAt: string
}

export type WalletWithTokens = Wallet & {
  /** Les trois lots mélangés, dans l'ordre d'affichage. */
  tokens: Token[]
  /** Toutes les journées relevées, de la plus ancienne à la plus récente. */
  days: WalletDay[]
}

export type GlobalSettings = {
  /** Prix du SOL en €, pour convertir les résultats. */
  solPriceEur: number | null
  /** Réglages appliqués aux nouveaux wallets. */
  defaults: Strategy
}

/** Un token réduit à ce dont le calcul a besoin. */
export function toTokenInput(token: Token): TokenInput {
  return {
    gain: token.gain,
    perteRug: token.perteRug,
    delay: token.delay,
    pris: token.pris,
    entreeSol: token.entreeSol,
    sortieSol: token.sortieSol,
  }
}

/** Les tokens de l'échantillon de screening. */
export function screeningTokens(wallet: WalletWithTokens): Token[] {
  return wallet.tokens.filter((token) => token.phase === 'screening')
}

/** Les tokens relevés pendant la phase de test. */
export function testTokens(wallet: WalletWithTokens): Token[] {
  return wallet.tokens.filter((token) => token.phase === 'test')
}

/** Les trades joués pendant la phase active. */
export function tradeTokens(wallet: WalletWithTokens): Token[] {
  return wallet.tokens.filter((token) => token.phase === 'trade')
}

/** Les journées d'une phase, de la plus ancienne à la plus récente. */
export function daysOfPhase(
  wallet: WalletWithTokens,
  phase: DayPhase,
): WalletDay[] {
  return wallet.days.filter((jour) => jour.phase === phase)
}

/**
 * Assemble les journées d'une phase et leurs tokens.
 *
 * Une journée sans trade garde sa place avec une liste vide : c'est tout
 * l'intérêt de l'avoir enregistrée.
 *
 * Le filtrage par phase est ce qui garantit qu'un relevé simulé et un relevé
 * réel ne se retrouvent jamais dans le même bilan.
 */
export function toDayInputs(
  wallet: WalletWithTokens,
  phase: DayPhase = 'test',
): DayInput[] {
  const parJour = new Map<string, TokenInput[]>()

  for (const token of wallet.tokens) {
    if (token.phase !== phase || token.dayId === null) continue
    const liste = parJour.get(token.dayId)
    if (liste) liste.push(toTokenInput(token))
    else parJour.set(token.dayId, [toTokenInput(token)])
  }

  return daysOfPhase(wallet, phase).map((jour) => ({
    day: jour.day,
    state: jour.state,
    tokens: parJour.get(jour.id) ?? [],
  }))
}

export type CreateWalletInput = {
  label: string
  address: string
  analyzedAt: string
}

export type UpdateWalletPatch = Partial<{
  label: string
  address: string
  analyzedAt: string
  notes: string
  tagOverride: TagOverride | null
  status: WalletStatus
  testStartedAt: string | null
  tradeStartedAt: string | null
  strategy: Partial<Strategy>
}>

export type UpdateTokenPatch = Partial<{
  name: string | null
  mint: string | null
  gain: number | null
  perteRug: number | null
  delay: number | null
  pris: boolean
  /** Montants réels d'un trade. N'ont de sens qu'en phase active. */
  entreeSol: number | null
  sortieSol: number | null
}>

/** Données d'un token créé en lot (saisie rapide, ou import Helius plus tard). */
export type CreateTokenInput = {
  name?: string | null
  mint?: string | null
  gain?: number | null
  perteRug?: number | null
  delay?: number | null
  /** Pris par défaut : on décoche ce que le filtre aurait écarté. */
  pris?: boolean
  /** Montants réels d'un trade. Laissés vides en screening et en test. */
  entreeSol?: number | null
  sortieSol?: number | null
}

/** Contenu d'une journée enregistrée d'un coup. */
export type SaveDayInput = {
  walletId: string
  /** AAAA-MM-JJ */
  day: string
  state: DayState
  /** Phase de la journée. 'test' par défaut. */
  phase?: DayPhase
  tokens: readonly CreateTokenInput[]
}
