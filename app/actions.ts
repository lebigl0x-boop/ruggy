'use server'

import { revalidatePath } from 'next/cache'

import { todayIso } from '@/lib/format'
import * as repo from '@/lib/repo/wallets'
import type {
  Decompte,
  Issue,
  Phase,
  Reglages,
  Token,
  TradeComplet,
} from '@/lib/repo/types'
import { resolveTokenMeta, type TokenMeta } from '@/lib/token-meta'
import {
  BORNES,
  borner,
  estAdresseSolana,
  estDateIso,
  parseNombreFr,
  valideNouveauWallet,
  type Souci,
} from '@/lib/validation'

/** Rafraîchit la liste et le détail d'un coup. */
function rafraichir(): void {
  revalidatePath('/', 'layout')
}

function versIssue(valeur: unknown): Issue {
  return valeur === 'tp' ? 'tp' : 'rate'
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export type CreationResultat =
  | { ok: true; id: string }
  | { ok: false; soucis: Souci[] }

export async function creerWalletAction(entree: {
  nom: string
  adresse: string
}): Promise<CreationResultat> {
  // La validation du navigateur sert au confort ; celle-ci fait foi.
  const soucis = valideNouveauWallet({
    ...entree,
    adressesExistantes: await repo.listerAdresses(),
  })

  if (soucis.some((souci) => souci.niveau === 'erreur')) return { ok: false, soucis }

  const id = await repo.creerWallet(entree)
  rafraichir()
  return { ok: true, id }
}

export async function renommerWalletAction(id: string, nom: string): Promise<void> {
  await repo.modifierWallet(id, { nom: nom.trim() || 'Sans nom' })
  rafraichir()
}

export async function noterWalletAction(id: string, notes: string): Promise<void> {
  await repo.modifierWallet(id, { notes })
  rafraichir()
}

/**
 * Change la phase d'un wallet.
 *
 * Rien n'est vérifié, et c'est voulu : aucun nombre de tokens ni de journées
 * n'ouvre ou ne ferme une phase. L'app affiche où on en est, la décision est
 * humaine. Les dates de passage sont posées au premier passage seulement —
 * revenir en arrière puis repartir ne réécrit pas l'histoire.
 */
export async function changerPhaseAction(id: string, phase: Phase): Promise<void> {
  const wallet = await repo.lireWallet(id)
  if (!wallet) return

  await repo.modifierWallet(id, {
    phase,
    ...(phase === 'test' && wallet.testLe === null ? { testLe: todayIso() } : {}),
    ...(phase === 'trade' && wallet.tradeLe === null ? { tradeLe: todayIso() } : {}),
  })

  rafraichir()
}

/** Les réglages sont rabattus dans leurs bornes ici : la valeur rendue fait foi. */
export async function reglerAction(
  id: string,
  champ: keyof Reglages,
  valeur: number | null,
): Promise<number> {
  const wallet = await repo.lireWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  const retenu = borner(valeur, BORNES[champ], wallet.reglages[champ])
  await repo.modifierWallet(id, { reglages: { [champ]: retenu } })
  rafraichir()
  return retenu
}

/** Les repères affichés à côté des boutons : 10 tokens, 5 jours… */
export async function reglerRepereAction(
  id: string,
  champ: 'tokensScreening' | 'joursTest',
  valeur: number | null,
): Promise<number> {
  const wallet = await repo.lireWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  const retenu = Math.round(borner(valeur, BORNES[champ], wallet[champ]))
  await repo.modifierWallet(id, { [champ]: retenu })
  rafraichir()
  return retenu
}

/** Ce qu'une suppression emporterait, pour pouvoir le dire avant de la faire. */
export async function compterContenuAction(id: string): Promise<Decompte> {
  return repo.compterContenu(id)
}

export async function supprimerWalletAction(id: string): Promise<void> {
  await repo.supprimerWallet(id)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Tokens — screening et test
// ---------------------------------------------------------------------------

export async function ajouterTokenAction(
  walletId: string,
  entree: { phase: 'screening' | 'test'; jour?: string | null; issue: unknown },
): Promise<Token> {
  const token = await repo.ajouterToken(walletId, {
    phase: entree.phase,
    jour: entree.phase === 'test' ? (entree.jour ?? null) : null,
    issue: versIssue(entree.issue),
  })
  rafraichir()
  return token
}

export async function modifierTokenAction(
  id: string,
  patch: { nom?: string | null; mint?: string | null; issue?: unknown },
): Promise<void> {
  await repo.modifierToken(id, {
    ...(patch.nom !== undefined ? { nom: patch.nom } : {}),
    ...(patch.mint !== undefined ? { mint: patch.mint } : {}),
    ...(patch.issue !== undefined ? { issue: versIssue(patch.issue) } : {}),
  })
  rafraichir()
}

export async function supprimerTokenAction(id: string): Promise<void> {
  await repo.supprimerToken(id)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Journées de test
// ---------------------------------------------------------------------------

export type JourResultat = { ok: true } | { ok: false; message: string }

/**
 * Relève une journée de test.
 *
 * Une liste vide est un relevé valable : c'est la journée « sans lancement »,
 * et elle compte dans les jours observés. La seule chose refusée est une date
 * illisible — y compris une date future, qu'on peut vouloir saisir d'avance.
 */
export async function releverJourAction(
  walletId: string,
  jour: string,
  issues: readonly unknown[],
): Promise<JourResultat> {
  if (!estDateIso(jour)) return { ok: false, message: 'Date de journée invalide.' }

  await repo.releverJour(walletId, jour, issues.map(versIssue))
  rafraichir()
  return { ok: true }
}

export async function supprimerJourAction(
  walletId: string,
  jour: string,
): Promise<void> {
  await repo.supprimerJour(walletId, jour)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export type TradeResultat =
  | { ok: true; trade: TradeComplet }
  | { ok: false; message: string }

/**
 * Enregistre un trade réellement joué.
 *
 * L'entrée doit être un montant positif : sans elle, le rendement n'aurait pas
 * de dénominateur. La sortie peut être zéro — une position partie à zéro est
 * un résultat, pas une absence de saisie.
 */
export async function ajouterTradeAction(
  walletId: string,
  entree: {
    date: string
    nom?: string | null
    mint?: string | null
    entreeSol: string | number | null
    sortieSol: string | number | null
    issue: unknown
  },
): Promise<TradeResultat> {
  if (!estDateIso(entree.date)) return { ok: false, message: 'Date invalide.' }

  const entreeSol = parseNombreFr(entree.entreeSol)
  const sortieSol = parseNombreFr(entree.sortieSol)

  if (entreeSol === null || entreeSol <= 0) {
    return { ok: false, message: 'L’entrée en SOL doit être un montant positif.' }
  }
  if (sortieSol === null || sortieSol < 0) {
    return { ok: false, message: 'La sortie en SOL doit être renseignée (zéro compris).' }
  }

  const trade = await repo.ajouterTrade(walletId, {
    date: entree.date,
    nom: entree.nom?.trim() || null,
    mint: entree.mint ?? null,
    entreeSol,
    sortieSol,
    issue: versIssue(entree.issue),
  })

  rafraichir()
  return { ok: true, trade }
}

export async function supprimerTradeAction(id: string): Promise<void> {
  await repo.supprimerTrade(id)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Noms de tokens
// ---------------------------------------------------------------------------

/**
 * Cherche le nom d'un token à partir de son adresse. N'écrit rien.
 *
 * Le filtre sur la forme de l'adresse n'est pas cosmétique : une action est
 * joignable par POST direct, et sans lui n'importe quelle chaîne partirait
 * brûler le quota Helius.
 */
export async function resoudreNomTokenAction(mint: string): Promise<TokenMeta | null> {
  const propre = mint.trim()
  if (!estAdresseSolana(propre)) return null
  return resolveTokenMeta(propre)
}
