import 'server-only'

import { and, asc, eq } from 'drizzle-orm'

import { db } from '../db'
import { tokens, walletDays, wallets } from '../db/schema'
import { joursManquants, jourPrecedent } from '../jours'
import type { DayState } from '../test-report'
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
 * Ce qu'il reste à relever ce matin.
 *
 * La dernière journée attendue est la veille : le relevé du matin porte sur
 * ce que le wallet a tradé hier, le jour même n'est pas encore fini. Les
 * matins sautés remontent dans la liste au lieu de disparaître — sans quoi le
 * décompte des jours d'observation serait faux.
 */
export async function listFileDuMatin(aujourdhui: string): Promise<FileDuMatin[]> {
  const hier = jourPrecedent(aujourdhui)
  const enTest = await listWalletsEnTest()

  // Les journées de chaque wallet sont lues en parallèle : en série, la file
  // du matin ferait un aller-retour par wallet suivi.
  const entrees = await Promise.all(
    enTest.map(async (wallet) => ({
      wallet,
      jours:
        wallet.testStartedAt === null
          ? []
          : joursManquants({
              debut: wallet.testStartedAt,
              jusqua: hier,
              saisis: (await listDays(wallet.id)).map((jour) => jour.day),
            }),
    })),
  )

  return entrees.filter((entree) => entree.jours.length > 0)
}
