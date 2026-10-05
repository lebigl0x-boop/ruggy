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
 * 'rejete' une fois le test conclu.
 */
export type WalletStatus = 'screening' | 'test' | 'valide' | 'rejete'

/** Le lot auquel appartient un token. Les deux ne s'additionnent jamais. */
export type TokenPhase = 'screening' | 'test'

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
  phase: TokenPhase
  /** Journée de rattachement. Toujours renseignée en phase de test. */
  dayId: string | null
  source: Source
}

/** Une journée observée pendant la phase de test. */
export type WalletDay = {
  id: string
  walletId: string
  /** AAAA-MM-JJ */
  day: string
  state: DayState
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
  strategy: Strategy
  source: Source
  createdAt: string
  updatedAt: string
}

export type WalletWithTokens = Wallet & {
  /** Les deux lots mélangés, dans l'ordre d'affichage. */
  tokens: Token[]
  /** Journées de test, de la plus ancienne à la plus récente. */
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
  return { gain: token.gain, perteRug: token.perteRug, delay: token.delay }
}

/** Les tokens de l'échantillon de screening. */
export function screeningTokens(wallet: WalletWithTokens): Token[] {
  return wallet.tokens.filter((token) => token.phase === 'screening')
}

/** Les tokens relevés pendant la phase de test. */
export function testTokens(wallet: WalletWithTokens): Token[] {
  return wallet.tokens.filter((token) => token.phase === 'test')
}

/**
 * Assemble les journées de test et leurs tokens.
 *
 * Une journée sans trade garde sa place avec une liste vide : c'est tout
 * l'intérêt de l'avoir enregistrée.
 */
export function toDayInputs(wallet: WalletWithTokens): DayInput[] {
  const parJour = new Map<string, TokenInput[]>()

  for (const token of wallet.tokens) {
    if (token.phase !== 'test' || token.dayId === null) continue
    const liste = parJour.get(token.dayId)
    if (liste) liste.push(toTokenInput(token))
    else parJour.set(token.dayId, [toTokenInput(token)])
  }

  return wallet.days.map((jour) => ({
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
  strategy: Partial<Strategy>
}>

export type UpdateTokenPatch = Partial<{
  name: string | null
  mint: string | null
  gain: number | null
  perteRug: number | null
  delay: number | null
}>

/** Données d'un token créé en lot (saisie rapide, ou import Helius plus tard). */
export type CreateTokenInput = {
  name?: string | null
  mint?: string | null
  gain?: number | null
  perteRug?: number | null
  delay?: number | null
}

/** Contenu d'une journée de test enregistrée d'un coup. */
export type SaveDayInput = {
  walletId: string
  /** AAAA-MM-JJ */
  day: string
  state: DayState
  tokens: readonly CreateTokenInput[]
}
