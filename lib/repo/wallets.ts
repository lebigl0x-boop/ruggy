import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import { db } from '../db'
import { jours, tokens, trades, wallets } from '../db/schema'
import type {
  Decompte,
  Issue,
  Jour,
  NouveauToken,
  NouveauTrade,
  NouveauWallet,
  PatchWallet,
  Phase,
  Token,
  TradeComplet,
  Wallet,
  WalletComplet,
} from './types'

function maintenant(): string {
  return new Date().toISOString()
}

/** Une valeur venue de la base peut être n'importe quoi : on la range. */
function versPhase(valeur: string): Phase {
  return valeur === 'test' || valeur === 'trade' || valeur === 'archive'
    ? valeur
    : 'screening'
}

function versIssue(valeur: string): Issue {
  return valeur === 'tp' ? 'tp' : 'rate'
}

function versWallet(ligne: typeof wallets.$inferSelect): Wallet {
  return {
    id: ligne.id,
    nom: ligne.nom,
    adresse: ligne.adresse,
    phase: versPhase(ligne.phase),
    reglages: { mise: ligne.mise, tp: ligne.tp, frais: ligne.frais },
    tokensScreening: ligne.tokensScreening,
    joursTest: ligne.joursTest,
    notes: ligne.notes,
    creeLe: ligne.creeLe,
    testLe: ligne.testLe,
    tradeLe: ligne.tradeLe,
  }
}

function versToken(ligne: typeof tokens.$inferSelect): Token {
  return {
    id: ligne.id,
    phase: ligne.phase === 'test' ? 'test' : 'screening',
    jour: ligne.jour,
    nom: ligne.nom,
    mint: ligne.mint,
    issue: versIssue(ligne.issue),
    position: ligne.position,
  }
}

function versTrade(ligne: typeof trades.$inferSelect): TradeComplet {
  return {
    id: ligne.id,
    date: ligne.date,
    nom: ligne.nom,
    mint: ligne.mint,
    entreeSol: ligne.entreeSol,
    sortieSol: ligne.sortieSol,
    issue: versIssue(ligne.issue),
  }
}

function versJour(ligne: typeof jours.$inferSelect): Jour {
  return { id: ligne.id, jour: ligne.jour }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Tous les wallets avec tout leur contenu.
 *
 * Quatre requêtes lancées ensemble plutôt qu'en cascade : elles ne dépendent
 * pas les unes des autres, et sur une base distante les enchaîner coûterait
 * quatre allers-retours. Le volume reste celui d'un suivi personnel.
 */
export async function listerWallets(): Promise<WalletComplet[]> {
  const [lignesWallets, lignesTokens, lignesJours, lignesTrades] = await Promise.all([
    db.select().from(wallets).orderBy(asc(wallets.creeLe)),
    db.select().from(tokens).orderBy(asc(tokens.walletId), asc(tokens.position)),
    db.select().from(jours).orderBy(asc(jours.walletId), asc(jours.jour)),
    db.select().from(trades).orderBy(asc(trades.walletId), asc(trades.date), asc(trades.creeLe)),
  ])

  const grouper = <L extends { walletId: string }, T>(
    lignes: L[],
    convertir: (ligne: L) => T,
  ): Map<string, T[]> => {
    const parWallet = new Map<string, T[]>()
    for (const ligne of lignes) {
      const liste = parWallet.get(ligne.walletId)
      if (liste) liste.push(convertir(ligne))
      else parWallet.set(ligne.walletId, [convertir(ligne)])
    }
    return parWallet
  }

  const parToken = grouper(lignesTokens, versToken)
  const parJour = grouper(lignesJours, versJour)
  const parTrade = grouper(lignesTrades, versTrade)

  return lignesWallets.map((ligne) => ({
    ...versWallet(ligne),
    tokens: parToken.get(ligne.id) ?? [],
    jours: parJour.get(ligne.id) ?? [],
    trades: parTrade.get(ligne.id) ?? [],
  }))
}

export async function lireWallet(id: string): Promise<WalletComplet | null> {
  const [ligne] = await db.select().from(wallets).where(eq(wallets.id, id)).limit(1)
  if (!ligne) return null

  const [lignesTokens, lignesJours, lignesTrades] = await Promise.all([
    db.select().from(tokens).where(eq(tokens.walletId, id)).orderBy(asc(tokens.position)),
    db.select().from(jours).where(eq(jours.walletId, id)).orderBy(asc(jours.jour)),
    db
      .select()
      .from(trades)
      .where(eq(trades.walletId, id))
      .orderBy(asc(trades.date), asc(trades.creeLe)),
  ])

  return {
    ...versWallet(ligne),
    tokens: lignesTokens.map(versToken),
    jours: lignesJours.map(versJour),
    trades: lignesTrades.map(versTrade),
  }
}

/** Adresses déjà suivies, pour refuser un doublon à la saisie. */
export async function listerAdresses(): Promise<string[]> {
  const lignes = await db.select({ adresse: wallets.adresse }).from(wallets)
  return lignes.map((ligne) => ligne.adresse)
}

/** Ce qu'une suppression emporterait. Sert à l'annoncer avant de la faire. */
export async function compterContenu(id: string): Promise<Decompte> {
  const [compte] = await db
    .select({
      tokens: sql<number>`(select count(*) from ${tokens} where ${tokens.walletId} = ${id})`,
      jours: sql<number>`(select count(*) from ${jours} where ${jours.walletId} = ${id})`,
      trades: sql<number>`(select count(*) from ${trades} where ${trades.walletId} = ${id})`,
    })
    .from(wallets)
    .where(eq(wallets.id, id))
    .limit(1)

  return {
    tokens: Number(compte?.tokens ?? 0),
    jours: Number(compte?.jours ?? 0),
    trades: Number(compte?.trades ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Écriture — wallets
// ---------------------------------------------------------------------------

export async function creerWallet(entree: NouveauWallet): Promise<string> {
  const id = crypto.randomUUID()

  // Les réglages ne sont pas précisés ici : ce sont les valeurs par défaut des
  // colonnes qui s'appliquent, et elles valent pour ce wallet seul. Les
  // modifier plus tard ne touche aucun autre wallet.
  await db.insert(wallets).values({
    id,
    nom: entree.nom.trim() || 'Sans nom',
    adresse: entree.adresse.trim(),
    creeLe: maintenant(),
  })

  return id
}

export async function modifierWallet(id: string, patch: PatchWallet): Promise<void> {
  const valeurs: Record<string, unknown> = {}

  if (patch.nom !== undefined) valeurs.nom = patch.nom
  if (patch.adresse !== undefined) valeurs.adresse = patch.adresse.trim()
  if (patch.phase !== undefined) valeurs.phase = patch.phase
  if (patch.notes !== undefined) valeurs.notes = patch.notes
  if (patch.tokensScreening !== undefined) valeurs.tokensScreening = patch.tokensScreening
  if (patch.joursTest !== undefined) valeurs.joursTest = patch.joursTest
  if (patch.testLe !== undefined) valeurs.testLe = patch.testLe
  if (patch.tradeLe !== undefined) valeurs.tradeLe = patch.tradeLe

  const r = patch.reglages
  if (r) {
    if (r.mise !== undefined) valeurs.mise = r.mise
    if (r.tp !== undefined) valeurs.tp = r.tp
    if (r.frais !== undefined) valeurs.frais = r.frais
  }

  if (Object.keys(valeurs).length === 0) return
  await db.update(wallets).set(valeurs).where(eq(wallets.id, id))
}

/** Supprime le wallet ; tokens, journées et trades suivent (ON DELETE CASCADE). */
export async function supprimerWallet(id: string): Promise<void> {
  await db.delete(wallets).where(eq(wallets.id, id))
}

// ---------------------------------------------------------------------------
// Écriture — tokens
// ---------------------------------------------------------------------------

async function prochainePosition(walletId: string): Promise<number> {
  const [ligne] = await db
    .select({ max: sql<number | null>`max(${tokens.position})` })
    .from(tokens)
    .where(eq(tokens.walletId, walletId))
    .limit(1)
  return (ligne?.max ?? 0) + 1
}

export async function ajouterToken(
  walletId: string,
  entree: NouveauToken,
): Promise<Token> {
  const ligne = {
    id: crypto.randomUUID(),
    walletId,
    phase: entree.phase,
    jour: entree.jour ?? null,
    nom: entree.nom ?? null,
    mint: entree.mint ?? null,
    issue: entree.issue,
    position: await prochainePosition(walletId),
    creeLe: maintenant(),
  }

  // Un lancement de test accroché à une journée absente de `jours` serait
  // invisible : `joursTest` parcourt les journées et y rattache les lancements,
  // jamais l'inverse. Noter un lancement vaut donc relevé de la journée.
  const jour = ligne.jour
  if (entree.phase === 'test' && jour !== null) {
    await db.transaction(async (tx) => {
      await tx
        .insert(jours)
        .values({ id: crypto.randomUUID(), walletId, jour, creeLe: ligne.creeLe })
        .onConflictDoNothing()
      await tx.insert(tokens).values(ligne)
    })
    return versToken(ligne)
  }

  await db.insert(tokens).values(ligne)
  return versToken(ligne)
}

export async function modifierToken(
  id: string,
  patch: Partial<{ nom: string | null; mint: string | null; issue: Issue }>,
): Promise<void> {
  const valeurs: Record<string, unknown> = {}
  if (patch.nom !== undefined) valeurs.nom = patch.nom
  if (patch.mint !== undefined) valeurs.mint = patch.mint
  if (patch.issue !== undefined) valeurs.issue = patch.issue

  if (Object.keys(valeurs).length === 0) return
  await db.update(tokens).set(valeurs).where(eq(tokens.id, id))
}

export async function supprimerToken(id: string): Promise<void> {
  await db.delete(tokens).where(eq(tokens.id, id))
}

// ---------------------------------------------------------------------------
// Écriture — journées de test
// ---------------------------------------------------------------------------

/**
 * Enregistre une journée de test et ses lancements, d'un seul bloc.
 *
 * La journée est créée même sans aucun lancement : c'est ce qui permet de
 * relever une journée « sans lancement », qui compte dans les jours observés.
 * Relever une journée déjà présente ajoute ses lancements aux existants plutôt
 * que de la réécrire — on corrige ligne par ligne, pas en ressaisissant tout.
 */
export async function releverJour(
  walletId: string,
  jour: string,
  issues: readonly Issue[],
): Promise<void> {
  const horodatage = maintenant()

  await db.transaction(async (tx) => {
    await tx
      .insert(jours)
      .values({ id: crypto.randomUUID(), walletId, jour, creeLe: horodatage })
      .onConflictDoNothing()

    if (issues.length === 0) return

    const [ligne] = await tx
      .select({ max: sql<number | null>`max(${tokens.position})` })
      .from(tokens)
      .where(eq(tokens.walletId, walletId))
      .limit(1)
    const depart = (ligne?.max ?? 0) + 1

    await tx.insert(tokens).values(
      issues.map((issue, i) => ({
        id: crypto.randomUUID(),
        walletId,
        phase: 'test' as const,
        jour,
        nom: null,
        mint: null,
        issue,
        position: depart + i,
        creeLe: horodatage,
      })),
    )
  })
}

/** Supprime une journée et les lancements qui s'y rattachent. */
export async function supprimerJour(walletId: string, jour: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(tokens)
      .where(and(eq(tokens.walletId, walletId), eq(tokens.jour, jour)))
    await tx.delete(jours).where(and(eq(jours.walletId, walletId), eq(jours.jour, jour)))
  })
}

// ---------------------------------------------------------------------------
// Écriture — trades
// ---------------------------------------------------------------------------

export async function ajouterTrade(
  walletId: string,
  entree: NouveauTrade,
): Promise<TradeComplet> {
  const ligne = {
    id: crypto.randomUUID(),
    walletId,
    date: entree.date,
    nom: entree.nom ?? null,
    mint: entree.mint ?? null,
    entreeSol: entree.entreeSol,
    sortieSol: entree.sortieSol,
    issue: entree.issue,
    creeLe: maintenant(),
  }

  await db.insert(trades).values(ligne)
  return versTrade(ligne)
}

export async function supprimerTrade(id: string): Promise<void> {
  await db.delete(trades).where(eq(trades.id, id))
}
