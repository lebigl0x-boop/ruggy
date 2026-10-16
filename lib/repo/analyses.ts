import 'server-only'

import { and, asc, eq } from 'drizzle-orm'

import type { LigneAnalyse } from '../analyse'
import { db } from '../db'
import { analyses } from '../db/schema'

/**
 * Le cache des journées analysées.
 *
 * Il ne participe à aucun bilan : seules les lignes recopiées dans `tokens` à
 * l'import comptent. Ce qui vit ici n'évite qu'une chose, mais elle est chère —
 * recommencer plusieurs centaines d'appels Helius pour relire le même tableau.
 */

function versIso(secondes: number): string {
  return new Date(secondes * 1000).toISOString()
}

function versSecondes(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000)
}

function versLigne(ligne: typeof analyses.$inferSelect): LigneAnalyse {
  return {
    mint: ligne.mint,
    nom: ligne.nom,
    signature: ligne.signature,
    acheteA: versSecondes(ligne.acheteA),
    solPaye: ligne.solPaye,
    tokensRecus: ligne.tokensRecus,
    decimales: ligne.decimales,
    supply: ligne.supply,
    // Une ligne d'avant les prix canoniques : on le reconstitue depuis les
    // montants du swap, qui eux n'ont jamais bougé.
    prixEntree:
      ligne.prixEntree ??
      (ligne.tokensRecus > 0 ? ligne.solPaye / ligne.tokensRecus : 0),
    prixSommetBrut: ligne.prixSommetBrut,
    prixSommetExec: ligne.prixSommetExec,
    sommetBrutA: ligne.sommetBrutA === null ? null : versSecondes(ligne.sommetBrutA),
    sommetExecA: ligne.sommetExecA === null ? null : versSecondes(ligne.sommetExecA),
    trouMax: ligne.trouMax,
    solUsdAchat: ligne.solUsdAchat,
    solUsdSommet: ligne.solUsdSommet,
    mcEntreeSol: ligne.mcEntreeSol,
    athMcSol: ligne.athMcSol,
    athA: ligne.athA === null ? null : versSecondes(ligne.athA),
    multiple: ligne.multiple,
    athPartiel: ligne.athPartiel,
    source: ligne.source === 'bougies' || ligne.source === 'swaps' ? ligne.source : null,
    pool: ligne.pool,
    erreur: ligne.erreur,
  }
}

/** Les lignes d'une journée, dans l'ordre des achats. Vide si jamais analysée. */
export async function lireJournee(
  walletId: string,
  jour: string,
): Promise<LigneAnalyse[]> {
  const lignes = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.walletId, walletId), eq(analyses.jour, jour)))
    .orderBy(asc(analyses.acheteA))

  return lignes.map(versLigne)
}

/** Quand cette journée a été analysée, ou `null`. */
export async function dateAnalyse(
  walletId: string,
  jour: string,
): Promise<string | null> {
  const [ligne] = await db
    .select({ analyseLe: analyses.analyseLe })
    .from(analyses)
    .where(and(eq(analyses.walletId, walletId), eq(analyses.jour, jour)))
    .orderBy(asc(analyses.analyseLe))
    .limit(1)

  return ligne?.analyseLe ?? null
}

/** Efface une journée du cache. Appelé par « Réanalyser ». */
export async function oublierJournee(walletId: string, jour: string): Promise<void> {
  await db
    .delete(analyses)
    .where(and(eq(analyses.walletId, walletId), eq(analyses.jour, jour)))
}

/**
 * Écrit une ligne, en remplaçant celle qui existait.
 *
 * L'analyse se fait token par token et chaque token peut être relancé seul :
 * l'écriture doit donc être idempotente sur `(wallet, jour, mint)`.
 */
export async function enregistrerLigne(
  walletId: string,
  jour: string,
  ligne: LigneAnalyse,
  analyseLe: string,
): Promise<void> {
  const valeurs = {
    id: crypto.randomUUID(),
    walletId,
    jour,
    mint: ligne.mint,
    nom: ligne.nom,
    signature: ligne.signature,
    acheteA: versIso(ligne.acheteA),
    solPaye: ligne.solPaye,
    tokensRecus: ligne.tokensRecus,
    decimales: ligne.decimales,
    supply: ligne.supply,
    prixEntree: ligne.prixEntree,
    prixSommetBrut: ligne.prixSommetBrut,
    prixSommetExec: ligne.prixSommetExec,
    sommetBrutA: ligne.sommetBrutA === null ? null : versIso(ligne.sommetBrutA),
    sommetExecA: ligne.sommetExecA === null ? null : versIso(ligne.sommetExecA),
    trouMax: ligne.trouMax,
    solUsdAchat: ligne.solUsdAchat,
    solUsdSommet: ligne.solUsdSommet,
    mcEntreeSol: ligne.mcEntreeSol,
    athMcSol: ligne.athMcSol,
    athA: ligne.athA === null ? null : versIso(ligne.athA),
    multiple: ligne.multiple,
    athPartiel: ligne.athPartiel,
    source: ligne.source,
    pool: ligne.pool,
    erreur: ligne.erreur,
    analyseLe,
  }

  await db
    .insert(analyses)
    .values(valeurs)
    .onConflictDoUpdate({
      target: [analyses.walletId, analyses.jour, analyses.mint],
      set: {
        nom: valeurs.nom,
        signature: valeurs.signature,
        acheteA: valeurs.acheteA,
        solPaye: valeurs.solPaye,
        tokensRecus: valeurs.tokensRecus,
        decimales: valeurs.decimales,
        supply: valeurs.supply,
        prixEntree: valeurs.prixEntree,
        prixSommetBrut: valeurs.prixSommetBrut,
        prixSommetExec: valeurs.prixSommetExec,
        sommetBrutA: valeurs.sommetBrutA,
        sommetExecA: valeurs.sommetExecA,
        trouMax: valeurs.trouMax,
        solUsdAchat: valeurs.solUsdAchat,
        solUsdSommet: valeurs.solUsdSommet,
        mcEntreeSol: valeurs.mcEntreeSol,
        athMcSol: valeurs.athMcSol,
        athA: valeurs.athA,
        multiple: valeurs.multiple,
        athPartiel: valeurs.athPartiel,
        source: valeurs.source,
        pool: valeurs.pool,
        erreur: valeurs.erreur,
        analyseLe: valeurs.analyseLe,
      },
    })
}
