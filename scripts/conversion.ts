/**
 * Conversion du schéma v1 vers le schéma v2.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas d'affichage.
 * C'est ce qui permet de les tester, et surtout de faire tourner exactement la
 * même conversion en essai et pour de vrai — un dry-run qui n'exécute pas le
 * code réel ne prouve rien.
 *
 * Ce que la v1 savait et que la v2 ne sait plus : le gain continu (réduit à
 * `tp` / `rate`), la perte par token, le délai avant dump, le drapeau « pris »,
 * les tags. Les tables de sauvegarde `*_v1` les conservent.
 */

// ---------------------------------------------------------------------------
// Les lignes de la v1, telles qu'elles sortent de la base
// ---------------------------------------------------------------------------

export type WalletV1 = {
  id: string
  label: string
  address: string
  notes: string
  status: string
  testStartedAt: string | null
  tradeStartedAt: string | null
  mise: number
  objectif: number
  frais: number
  createdAt: string
}

export type TokenV1 = {
  id: string
  walletId: string
  position: number
  name: string | null
  mint: string | null
  gain: number | null
  pris: boolean
  phase: string
  dayId: string | null
  entreeSol: number | null
  sortieSol: number | null
  createdAt: string
}

export type JourV1 = {
  id: string
  walletId: string
  day: string
  state: string
  phase: string
}

// ---------------------------------------------------------------------------
// Les lignes de la v2
// ---------------------------------------------------------------------------

export type Issue = 'tp' | 'rate'
export type PhaseWallet = 'screening' | 'test' | 'trade' | 'archive'

export type WalletV2 = {
  id: string
  nom: string
  adresse: string
  phase: PhaseWallet
  mise: number
  tp: number
  frais: number
  tokensScreening: number
  joursTest: number
  notes: string
  creeLe: string
  testLe: string | null
  tradeLe: string | null
}

export type JourV2 = { id: string; walletId: string; jour: string; creeLe: string }

export type TokenV2 = {
  id: string
  walletId: string
  phase: 'screening' | 'test'
  jour: string | null
  nom: string | null
  mint: string | null
  issue: Issue
  position: number
  creeLe: string
}

export type TradeV2 = {
  id: string
  walletId: string
  date: string
  nom: string | null
  mint: string | null
  entreeSol: number
  sortieSol: number
  issue: Issue
  creeLe: string
}

export type Compteurs = {
  wallets: { total: number } & Record<PhaseWallet, number>
  /** Les deux statuts v1 qui n'existent plus et où ils atterrissent. */
  rabattus: { valideVersTest: number; rejeteVersArchive: number }
  jours: { total: number; sansLancement: number }
  tokens: { total: number; screening: number; test: number; tp: number; rate: number }
  trades: { total: number; tp: number; rate: number }
  ignores: {
    /** Relevés mais jamais notés : ils ne comptaient dans aucun résultat. */
    tokensNonNotes: number
    /** Anomalie : un token de test sans journée rattachée. */
    tokensTestSansJour: number
    /** Lot trade sans entrée ni sortie exploitables. */
    tradesSansMontants: number
    /** Journées ouvertes mais jamais relevées : pas des observations. */
    joursOuverts: number
    /** Journées du lot trade : la v2 porte la date sur le trade lui-même. */
    joursDeTrade: number
  }
}

export type Resultat = {
  wallets: WalletV2[]
  jours: JourV2[]
  tokens: TokenV2[]
  trades: TradeV2[]
  compteurs: Compteurs
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

/** Les deux statuts v1 qui disparaissent sont rabattus, pas perdus. */
const PHASES: Record<string, PhaseWallet> = {
  screening: 'screening',
  test: 'test',
  trade: 'trade',
  valide: 'test',
  rejete: 'archive',
}

export function phaseDepuisStatut(status: string): PhaseWallet {
  return PHASES[status] ?? 'screening'
}

function nombre(valeur: number | null | undefined): number | null {
  return valeur !== null && valeur !== undefined && Number.isFinite(valeur) ? valeur : null
}

/**
 * L'issue d'un lancement simulé : il a atteint l'objectif du wallet, ou non.
 * C'est exactement la frontière que la v1 traçait déjà pour décider si un
 * token rapportait son gain ou coûtait sa perte.
 */
export function issueDepuisGain(gain: number, objectif: number): Issue {
  return gain >= objectif ? 'tp' : 'rate'
}

/**
 * L'issue d'un trade dont le gain n'a jamais été noté.
 *
 * On ne l'invente pas depuis le signe du résultat : un trade à +40 % n'est pas
 * un take-profit quand le TP est à 300 %. On applique le même multiple que
 * celui que le wallet vise.
 */
export function issueDepuisMontants(
  entree: number,
  sortie: number,
  tp: number,
): Issue {
  return sortie >= entree * (1 + tp / 100) ? 'tp' : 'rate'
}

/** Un montant de trade exploitable : une entrée réelle et une sortie connue. */
function montants(token: TokenV1): { entree: number; sortie: number } | null {
  const entree = nombre(token.entreeSol)
  const sortie = nombre(token.sortieSol)
  if (entree === null || sortie === null) return null
  if (entree <= 0 || sortie < 0) return null
  return { entree, sortie }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

export function convertir(v1: {
  wallets: readonly WalletV1[]
  tokens: readonly TokenV1[]
  jours: readonly JourV1[]
}): Resultat {
  const parWallet = new Map(v1.wallets.map((w) => [w.id, w]))
  const parJour = new Map(v1.jours.map((j) => [j.id, j]))

  const compteurs: Compteurs = {
    wallets: { total: 0, screening: 0, test: 0, trade: 0, archive: 0 },
    rabattus: { valideVersTest: 0, rejeteVersArchive: 0 },
    jours: { total: 0, sansLancement: 0 },
    tokens: { total: 0, screening: 0, test: 0, tp: 0, rate: 0 },
    trades: { total: 0, tp: 0, rate: 0 },
    ignores: {
      tokensNonNotes: 0,
      tokensTestSansJour: 0,
      tradesSansMontants: 0,
      joursOuverts: 0,
      joursDeTrade: 0,
    },
  }

  // --- Wallets -------------------------------------------------------------
  const wallets: WalletV2[] = v1.wallets.map((w) => {
    const phase = phaseDepuisStatut(w.status)
    compteurs.wallets.total += 1
    compteurs.wallets[phase] += 1
    if (w.status === 'valide') compteurs.rabattus.valideVersTest += 1
    if (w.status === 'rejete') compteurs.rabattus.rejeteVersArchive += 1

    return {
      id: w.id,
      nom: w.label,
      adresse: w.address,
      phase,
      // Les réglages du wallet sont repris tels quels ; seul l'objectif change
      // de nom. Les nouveaux défauts ne valent que pour les wallets à venir.
      mise: w.mise,
      tp: w.objectif,
      frais: w.frais,
      tokensScreening: 10,
      joursTest: 5,
      notes: w.notes,
      creeLe: w.createdAt,
      testLe: w.testStartedAt,
      tradeLe: w.tradeStartedAt,
    }
  })

  // --- Tokens et trades ----------------------------------------------------
  const tokens: TokenV2[] = []
  const trades: TradeV2[] = []
  /** Journées de test qui portent au moins un token migré. */
  const joursPeuples = new Set<string>()

  for (const token of v1.tokens) {
    const wallet = parWallet.get(token.walletId)
    if (wallet === undefined) continue

    // --- Lot trade : il devient un trade, ou rien ---------------------------
    if (token.phase === 'trade') {
      const reels = montants(token)
      if (reels === null) {
        compteurs.ignores.tradesSansMontants += 1
        continue
      }

      const gain = nombre(token.gain)
      const issue =
        gain !== null
          ? issueDepuisGain(gain, wallet.objectif)
          : issueDepuisMontants(reels.entree, reels.sortie, wallet.objectif)

      const jour = token.dayId !== null ? parJour.get(token.dayId) : undefined

      trades.push({
        id: token.id,
        walletId: token.walletId,
        // La date du trade vient de sa journée ; à défaut, du jour de saisie.
        date: jour?.day ?? token.createdAt.slice(0, 10),
        nom: token.name,
        mint: token.mint,
        entreeSol: reels.entree,
        sortieSol: reels.sortie,
        issue,
        creeLe: token.createdAt,
      })

      compteurs.trades.total += 1
      compteurs.trades[issue] += 1
      continue
    }

    // --- Lots simulés : screening et test -----------------------------------
    // Le drapeau `pris` est ignoré : la v2 ne connaît plus de filtre d'entrée,
    // un token relevé est un token du lot.
    const gain = nombre(token.gain)
    if (gain === null) {
      compteurs.ignores.tokensNonNotes += 1
      continue
    }

    const phase = token.phase === 'test' ? 'test' : 'screening'
    let jour: string | null = null

    if (phase === 'test') {
      const releve = token.dayId !== null ? parJour.get(token.dayId) : undefined
      if (releve === undefined) {
        compteurs.ignores.tokensTestSansJour += 1
        continue
      }
      jour = releve.day
      joursPeuples.add(releve.id)
    }

    const issue = issueDepuisGain(gain, wallet.objectif)

    tokens.push({
      id: token.id,
      walletId: token.walletId,
      phase,
      jour,
      nom: token.name,
      mint: token.mint,
      issue,
      position: token.position,
      creeLe: token.createdAt,
    })

    compteurs.tokens.total += 1
    compteurs.tokens[phase] += 1
    compteurs.tokens[issue] += 1
  }

  // --- Journées de test ----------------------------------------------------
  // Une journée relevée compte, qu'elle ait porté des lancements ou non : c'est
  // tout l'intérêt de l'avoir enregistrée. Une journée seulement ouverte, non :
  // elle n'a jamais été regardée. On garde malgré tout celles qui portent un
  // token, pour qu'aucun token migré ne référence une journée absente.
  const jours: JourV2[] = []

  for (const releve of v1.jours) {
    if (releve.phase === 'trade') {
      compteurs.ignores.joursDeTrade += 1
      continue
    }
    if (releve.state === 'ouvert' && !joursPeuples.has(releve.id)) {
      compteurs.ignores.joursOuverts += 1
      continue
    }

    const wallet = parWallet.get(releve.walletId)
    if (wallet === undefined) continue

    jours.push({
      id: releve.id,
      walletId: releve.walletId,
      jour: releve.day,
      creeLe: wallet.createdAt,
    })

    compteurs.jours.total += 1
    if (!joursPeuples.has(releve.id)) compteurs.jours.sansLancement += 1
  }

  return { wallets, jours, tokens, trades, compteurs }
}
