import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { cache } from 'react'

import { db } from '../db'
import { tokens, walletDays, wallets } from '../db/schema'
import { joursManquants } from '../jours'
import { JOURS_MINIMUM_TEST, type DayState } from '../test-report'
import { mapWallet, mapWalletDay } from './mappers'
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

/** Un wallet en test et les journées qu'il reste à saisir. */
export type FileDuMatin = {
  wallet: Wallet
  /** Journées attendues et non saisies, de la plus ancienne à la plus récente. */
  jours: string[]
}

/**
 * Ce qu'il reste à relever.
 *
 * La journée du jour est comprise : on relève au fil de l'eau ce que le
 * wallet a lancé, et ré-enregistrer une journée la remplace — revenir le soir
 * compléter la matinée est donc sans danger.
 *
 * Un wallet quitte la file dès qu'il a son plancher de journées : à ce
 * moment-là il n'attend plus un relevé mais une décision, et continuer à le
 * réclamer chaque matin masquerait ceux qui, eux, en ont encore besoin.
 *
 * Les matins sautés remontent dans la liste au lieu de disparaître — sans
 * quoi le décompte des jours d'observation serait faux.
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
    .select({ wallet: wallets, day: walletDays.day })
    .from(wallets)
    .leftJoin(walletDays, eq(walletDays.walletId, wallets.id))
    .where(eq(wallets.status, 'test'))
    .orderBy(asc(wallets.testStartedAt), asc(wallets.label))

  const enTest: Wallet[] = []
  const saisisParWallet = new Map<string, string[]>()

  for (const ligne of lignes) {
    const saisis = saisisParWallet.get(ligne.wallet.id)
    if (saisis === undefined) {
      enTest.push(mapWallet(ligne.wallet))
      saisisParWallet.set(ligne.wallet.id, ligne.day === null ? [] : [ligne.day])
    } else if (ligne.day !== null) {
      saisis.push(ligne.day)
    }
  }

  return enTest
    .map((wallet) => {
      const saisis = saisisParWallet.get(wallet.id) ?? []

      return {
        wallet,
        jours:
          // Plancher atteint : le wallet attend un verdict, pas un relevé.
          wallet.testStartedAt === null || saisis.length >= JOURS_MINIMUM_TEST
            ? []
            : joursManquants({
                debut: wallet.testStartedAt,
                jusqua: aujourdhui,
                saisis,
              }),
      }
    })
    .filter((entree) => entree.jours.length > 0)
})
