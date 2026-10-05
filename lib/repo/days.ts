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
export function listDays(walletId: string): WalletDay[] {
  return db
    .select()
    .from(walletDays)
    .where(eq(walletDays.walletId, walletId))
    .orderBy(asc(walletDays.day))
    .all()
    .map(mapWalletDay)
}

export function getDay(walletId: string, day: string): WalletDay | null {
  const row = db
    .select()
    .from(walletDays)
    .where(and(eq(walletDays.walletId, walletId), eq(walletDays.day, day)))
    .get()
  return row ? mapWalletDay(row) : null
}

/** Les wallets actuellement en phase de test, pour alimenter la file du matin. */
export function listWalletsEnTest(): Wallet[] {
  return db
    .select()
    .from(wallets)
    .where(eq(wallets.status, 'test'))
    .orderBy(asc(wallets.testStartedAt), asc(wallets.label))
    .all()
    .map(mapWallet)
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
export function saveDay(input: SaveDayInput): WalletDay {
  const timestamp = now()
  const tokensAEcrire = input.state === 'inactif' ? [] : input.tokens

  db.transaction((tx) => {
    const existant = tx
      .select()
      .from(walletDays)
      .where(
        and(eq(walletDays.walletId, input.walletId), eq(walletDays.day, input.day)),
      )
      .get()

    let dayId: string

    if (existant) {
      dayId = existant.id
      tx.update(walletDays)
        .set({ state: input.state, updatedAt: timestamp })
        .where(eq(walletDays.id, dayId))
        .run()
      // La journée est réécrite : on repart de zéro plutôt que d'empiler.
      tx.delete(tokens).where(eq(tokens.dayId, dayId)).run()
    } else {
      dayId = crypto.randomUUID()
      tx.insert(walletDays)
        .values({
          id: dayId,
          walletId: input.walletId,
          day: input.day,
          state: input.state,
          note: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run()
    }

    if (tokensAEcrire.length > 0) {
      createTokens(input.walletId, tokensAEcrire, { phase: 'test', dayId }, tx)
    }
  })

  const enregistre = getDay(input.walletId, input.day)
  if (!enregistre) throw new Error('La journée n’a pas pu être enregistrée.')
  return enregistre
}

export function setDayState(id: string, state: DayState): void {
  db.update(walletDays)
    .set({ state, updatedAt: now() })
    .where(eq(walletDays.id, id))
    .run()
}

export function setDayNote(id: string, note: string): void {
  db.update(walletDays)
    .set({ note, updatedAt: now() })
    .where(eq(walletDays.id, id))
    .run()
}

/** Supprime la journée ; ses tokens suivent (ON DELETE CASCADE). */
export function deleteDay(id: string): void {
  db.delete(walletDays).where(eq(walletDays.id, id)).run()
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
export function listFileDuMatin(aujourdhui: string): FileDuMatin[] {
  const hier = jourPrecedent(aujourdhui)

  return listWalletsEnTest()
    .map((wallet) => ({
      wallet,
      jours:
        wallet.testStartedAt === null
          ? []
          : joursManquants({
              debut: wallet.testStartedAt,
              jusqua: hier,
              saisis: listDays(wallet.id).map((jour) => jour.day),
            }),
    }))
    .filter((entree) => entree.jours.length > 0)
}
