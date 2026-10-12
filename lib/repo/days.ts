import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { cache } from 'react'

import { db } from '../db'
import { tokens, walletDays, wallets } from '../db/schema'
import { listerJours } from '../jours'
import { JOURS_MINIMUM_TEST, type DayState } from '../test-report'
import { mapWallet, mapWalletDay, toDayState } from './mappers'
import { createTokens } from './tokens'
import type { SaveDayInput, Wallet, WalletDay } from './types'

function now(): string {
  return new Date().toISOString()
}

/** Les journées d'un wallet, de la plus ancienne à la plus récente. */
export async function listDays(walletId: string): Promise<WalletDay[]> {
  const rows = await db
    .select()
    .from(walletDays)
    .where(eq(walletDays.walletId, walletId))
    .orderBy(asc(walletDays.day))
  return rows.map(mapWalletDay)
}

export async function getDay(
  walletId: string,
  day: string,
): Promise<WalletDay | null> {
  const [row] = await db
    .select()
    .from(walletDays)
    .where(and(eq(walletDays.walletId, walletId), eq(walletDays.day, day)))
    .limit(1)
  return row ? mapWalletDay(row) : null
}

/** Les wallets actuellement en phase de test, pour alimenter la file du matin. */
export async function listWalletsEnTest(): Promise<Wallet[]> {
  const rows = await db
    .select()
    .from(wallets)
    .where(eq(wallets.status, 'test'))
    .orderBy(asc(wallets.testStartedAt), asc(wallets.label))
  return rows.map(mapWallet)
}

/**
 * Enregistre une journée et ses tokens d'un seul bloc.
 *
 * Ré-enregistrer une journée **remplace** son contenu : la saisie du matin
 * décrit la journée entière, elle ne s'y ajoute pas. Marquer une journée
 * inactive efface donc les tokens qu'elle portait, ce qui est le
 * comportement attendu quand on corrige une erreur de saisie.
 *
 * Les corrections à l'unité se font depuis le tableau du wallet, pas ici.
 */
export async function saveDay(input: SaveDayInput): Promise<WalletDay> {
  const timestamp = now()
  const tokensAEcrire = input.state === 'inactif' ? [] : input.tokens

  await db.transaction(async (tx) => {
    const [existant] = await tx
      .select()
      .from(walletDays)
      .where(
        and(eq(walletDays.walletId, input.walletId), eq(walletDays.day, input.day)),
      )
      .limit(1)

    let dayId: string

    if (existant) {
      dayId = existant.id
      await tx
        .update(walletDays)
        .set({ state: input.state, updatedAt: timestamp })
        .where(eq(walletDays.id, dayId))
      // La journée est réécrite : on repart de zéro plutôt que d'empiler.
      await tx.delete(tokens).where(eq(tokens.dayId, dayId))
    } else {
      dayId = crypto.randomUUID()
      await tx.insert(walletDays).values({
        id: dayId,
        walletId: input.walletId,
        day: input.day,
        state: input.state,
        note: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    if (tokensAEcrire.length > 0) {
      await createTokens(input.walletId, tokensAEcrire, { phase: 'test', dayId }, tx)
    }
  })

  const enregistre = await getDay(input.walletId, input.day)
  if (!enregistre) throw new Error('La journée n’a pas pu être enregistrée.')
  return enregistre
}

export async function setDayState(id: string, state: DayState): Promise<void> {
  await db
    .update(walletDays)
    .set({ state, updatedAt: now() })
    .where(eq(walletDays.id, id))
}

export async function setDayNote(id: string, note: string): Promise<void> {
  await db
    .update(walletDays)
    .set({ note, updatedAt: now() })
    .where(eq(walletDays.id, id))
}

/** Supprime la journée ; ses tokens suivent (ON DELETE CASCADE). */
export async function deleteDay(id: string): Promise<void> {
  await db.delete(walletDays).where(eq(walletDays.id, id))
}

/** Où en est une journée de la fenêtre d'observation. */
export type EtatJournee = DayState | 'manquante'

export type JourneeFile = {
  /** AAAA-MM-JJ */
  day: string
  etat: EtatJournee
}

/** Un wallet en test, et sa fenêtre d'observation journée par journée. */
export type FileDuMatin = {
  wallet: Wallet
  /**
   * Toute la fenêtre, du premier jour du test à aujourd'hui inclus — relevée
   * ou non. C'est elle que l'écran affiche en bande : on ne peut pas choisir
   * une journée à rattraper si on ne voit que celles qui manquent.
   */
  journees: JourneeFile[]
  /**
   * Ce qu'il reste à relever, de la plus ancienne à la plus récente.
   * Le jour en cours n'y est jamais : une journée se juge une fois finie.
   */
  aRelever: string[]
  /** Le wallet a son plancher de journées observées : il attend un verdict. */
  plancherAtteint: boolean
}

/**
 * Ce qu'il reste à relever, wallet par wallet.
 *
 * Le jour en cours apparaît dans la fenêtre mais jamais dans `aRelever` : on
 * relève une journée terminée, et réclamer celle qui court remettrait chaque
 * wallet dans la file l'après-midi même — la file ne serait jamais finie.
 * Rien n'empêche de la saisir au fil de l'eau, mais c'est un choix, pas une
 * tâche du matin.
 *
 * Les matins sautés remontent au lieu de disparaître — sans quoi le décompte
 * des jours d'observation serait faux. Atteindre le plancher ne fait plus
 * sortir un wallet qui garde un trou : le trou serait alors impossible à
 * combler, et le décompte resterait faux pour toujours.
 *
 * Mémorisé le temps d'une requête, par date : le layout racine l'appelle pour
 * la pastille du rail, et la page d'accueil la rappelle aussitôt pour la liste
 * elle-même. Les deux reçoivent `todayIso()`, donc la même clé — une seule
 * requête part vers Supabase au lieu de deux.
 */
export const listFileDuMatin = cache(async function listFileDuMatin(
  aujourdhui: string,
): Promise<FileDuMatin[]> {
  // Les wallets en test et leurs journées d'un seul coup. Cette fonction
  // tourne sur chaque page — c'est elle qui alimente la pastille du rail —
  // et chaque requête supplémentaire coûte un aller-retour vers Supabase.
  // La jointure est externe : un wallet dont le test vient de s'ouvrir n'a
  // aucune journée, et doit malgré tout figurer dans la file.
  const lignes = await db
    .select({ wallet: wallets, day: walletDays.day, state: walletDays.state })
    .from(wallets)
    .leftJoin(walletDays, eq(walletDays.walletId, wallets.id))
    .where(eq(wallets.status, 'test'))
    .orderBy(asc(wallets.testStartedAt), asc(wallets.label))

  const enTest: Wallet[] = []
  const relevesParWallet = new Map<string, Map<string, DayState>>()

  for (const ligne of lignes) {
    let releves = relevesParWallet.get(ligne.wallet.id)
    if (releves === undefined) {
      releves = new Map()
      relevesParWallet.set(ligne.wallet.id, releves)
      enTest.push(mapWallet(ligne.wallet))
    }
    if (ligne.day !== null) releves.set(ligne.day, toDayState(ligne.state ?? ''))
  }

  return enTest
    .map((wallet) => {
      const releves = relevesParWallet.get(wallet.id) ?? new Map<string, DayState>()

      const journees: JourneeFile[] =
        wallet.testStartedAt === null
          ? []
          : listerJours(wallet.testStartedAt, aujourdhui).map((day) => ({
              day,
              etat: releves.get(day) ?? 'manquante',
            }))

      return {
        wallet,
        journees,
        aRelever: journees
          .filter((journee) => journee.day !== aujourdhui && aRelever(journee.etat))
          .map((journee) => journee.day),
        plancherAtteint: observees(releves) >= JOURS_MINIMUM_TEST,
      }
    })
    .filter((entree) => entree.aRelever.length > 0)
})

/** Une journée ouverte mais jamais remplie reste à relever, comme une absente. */
function aRelever(etat: EtatJournee): boolean {
  return etat === 'manquante' || etat === 'ouvert'
}

/** Les journées qui comptent dans le plancher : celles qui ont été jugées. */
function observees(releves: ReadonlyMap<string, DayState>): number {
  let total = 0
  for (const etat of releves.values()) if (etat !== 'ouvert') total += 1
  return total
}
