/**
 * Les objets métier manipulés par l'application.
 *
 * Ils ne sont pas les lignes de la base : `lib/repo/wallets.ts` traduit dans
 * les deux sens. L'interface n'importe jamais Drizzle.
 */
import type { Issue, JourTest, Reglages, Trade } from '../calcul'

export type { Issue, Reglages, Trade }

/** Où en est un wallet. `archive` le sort du courant sans rien effacer. */
export type Phase = 'screening' | 'test' | 'trade' | 'archive'

export const PHASES: readonly Phase[] = ['screening', 'test', 'trade', 'archive']

export const LIBELLE_PHASE: Record<Phase, string> = {
  screening: 'Screening',
  test: 'Test',
  trade: 'Trade',
  archive: 'Archivé',
}

/** Un lancement observé. Le lot `trade` vit dans `Trade`. */
export type Token = {
  id: string
  phase: 'screening' | 'test'
  /** AAAA-MM-JJ en test, `null` en screening. */
  jour: string | null
  nom: string | null
  mint: string | null
  issue: Issue
  position: number
}

/** Une journée de test relevée, même sans aucun lancement. */
export type Jour = {
  id: string
  jour: string
}

/** Un trade réellement joué, avec son identité en base. */
export type TradeComplet = Trade & {
  id: string
  nom: string | null
  mint: string | null
}

export type Wallet = {
  id: string
  nom: string
  adresse: string
  phase: Phase
  reglages: Reglages
  /** Repères affichés à côté des boutons. Jamais des seuils. */
  tokensScreening: number
  joursTest: number
  notes: string
  creeLe: string
  testLe: string | null
  tradeLe: string | null
}

export type WalletComplet = Wallet & {
  tokens: Token[]
  jours: Jour[]
  trades: TradeComplet[]
}

// ---------------------------------------------------------------------------
// Passage du métier vers les entrées de calcul
// ---------------------------------------------------------------------------

/** Les issues du lot de screening, dans l'ordre d'affichage. */
export function issuesScreening(wallet: WalletComplet): Issue[] {
  return wallet.tokens
    .filter((token) => token.phase === 'screening')
    .map((token) => token.issue)
}

/**
 * Les journées de test, avec leurs lancements.
 *
 * Une journée sans lancement garde sa place avec une liste vide : c'est elle
 * qui fait la différence entre « il n'a rien lancé » et « je n'ai pas
 * regardé ».
 */
export function joursTest(wallet: WalletComplet): JourTest[] {
  const parJour = new Map<string, Issue[]>()
  for (const token of wallet.tokens) {
    if (token.phase !== 'test' || token.jour === null) continue
    const liste = parJour.get(token.jour)
    if (liste) liste.push(token.issue)
    else parJour.set(token.jour, [token.issue])
  }

  return wallet.jours.map((journee) => ({
    jour: journee.jour,
    issues: parJour.get(journee.jour) ?? [],
  }))
}

/** Les tokens d'une journée précise, dans l'ordre d'affichage. */
export function tokensDuJour(wallet: WalletComplet, jour: string): Token[] {
  return wallet.tokens.filter(
    (token) => token.phase === 'test' && token.jour === jour,
  )
}

export function tokensScreening(wallet: WalletComplet): Token[] {
  return wallet.tokens.filter((token) => token.phase === 'screening')
}

// ---------------------------------------------------------------------------
// Entrées des écritures
// ---------------------------------------------------------------------------

export type NouveauWallet = { nom: string; adresse: string }

export type PatchWallet = Partial<{
  nom: string
  adresse: string
  phase: Phase
  reglages: Partial<Reglages>
  tokensScreening: number
  joursTest: number
  notes: string
  testLe: string | null
  tradeLe: string | null
}>

export type NouveauToken = {
  phase: 'screening' | 'test'
  jour?: string | null
  nom?: string | null
  mint?: string | null
  issue: Issue
}

export type NouveauTrade = {
  date: string
  nom?: string | null
  mint?: string | null
  entreeSol: number
  sortieSol: number
  issue: Issue
}

/** Ce qu'une suppression de wallet emporte, pour le dire avant de la faire. */
export type Decompte = { tokens: number; jours: number; trades: number }
