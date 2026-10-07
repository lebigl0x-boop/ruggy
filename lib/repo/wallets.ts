import 'server-only'

import { asc, desc, eq } from 'drizzle-orm'

import { db } from '../db'
import { tokens, walletDays, wallets } from '../db/schema'
import { mapToken, mapWallet, mapWalletDay } from './mappers'
import { getSettings } from './settings'
import type {
  CreateWalletInput,
  UpdateWalletPatch,
  Wallet,
  WalletDay,
  WalletWithTokens,
} from './types'

/** Lignes de tokens vides créées avec un nouveau wallet. */
export const LIGNES_INITIALES = 10

function now(): string {
  return new Date().toISOString()
}

/** Tous les wallets avec leurs tokens, du plus récemment analysé au plus ancien. */
export async function listWallets(): Promise<WalletWithTokens[]> {
  // Trois requêtes lancées ensemble : elles ne dépendent pas les unes des
  // autres, et sur une base distante les enchaîner coûterait trois allers-retours.
  const [walletRows, tokenRows, dayRows] = await Promise.all([
    db.select().from(wallets).orderBy(desc(wallets.analyzedAt), desc(wallets.createdAt)),
    db.select().from(tokens).orderBy(asc(tokens.walletId), asc(tokens.position)),
    db.select().from(walletDays).orderBy(asc(walletDays.walletId), asc(walletDays.day)),
  ])

  const byWallet = new Map<string, ReturnType<typeof mapToken>[]>()
  for (const row of tokenRows) {
    const list = byWallet.get(row.walletId)
    if (list) list.push(mapToken(row))
    else byWallet.set(row.walletId, [mapToken(row)])
  }

  const daysByWallet = new Map<string, WalletDay[]>()
  for (const row of dayRows) {
    const list = daysByWallet.get(row.walletId)
    if (list) list.push(mapWalletDay(row))
    else daysByWallet.set(row.walletId, [mapWalletDay(row)])
  }

  return walletRows.map((row) => ({
    ...mapWallet(row),
    tokens: byWallet.get(row.id) ?? [],
    days: daysByWallet.get(row.id) ?? [],
  }))
}

export async function getWallet(id: string): Promise<WalletWithTokens | null> {
  const [row] = await db.select().from(wallets).where(eq(wallets.id, id)).limit(1)
  if (!row) return null

  const [tokenRows, dayRows] = await Promise.all([
    db
      .select()
      .from(tokens)
      .where(eq(tokens.walletId, id))
      .orderBy(asc(tokens.position)),
    db
      .select()
      .from(walletDays)
      .where(eq(walletDays.walletId, id))
      .orderBy(asc(walletDays.day)),
  ])

  return {
    ...mapWallet(row),
    tokens: tokenRows.map(mapToken),
    days: dayRows.map(mapWalletDay),
  }
}

/** Adresses déjà suivies, pour refuser les doublons à la saisie. */
export async function listAddresses(): Promise<string[]> {
  const rows = await db.select({ address: wallets.address }).from(wallets)
  return rows.map((r) => r.address)
}

export async function findByAddress(address: string): Promise<Wallet | null> {
  const [row] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.address, address))
    .limit(1)
  return row ? mapWallet(row) : null
}

/**
 * Crée un wallet avec les réglages par défaut du moment et ses 10 lignes de
 * tokens vides, le tout dans une seule transaction.
 */
export async function createWallet(
  input: CreateWalletInput,
): Promise<WalletWithTokens> {
  const { defaults } = await getSettings()
  const timestamp = now()
  const id = crypto.randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(wallets)
      .values({
        id,
        label: input.label.trim(),
        address: input.address.trim(),
        analyzedAt: input.analyzedAt,
        notes: '',
        tagOverride: null,
        status: 'screening',
        testStartedAt: null,
        mise: defaults.mise,
        objectif: defaults.objectif,
        perteRug: defaults.perteRug,
        frais: defaults.frais,
        tauxVise: defaults.tauxVise,
        source: 'manual',
        createdAt: timestamp,
        updatedAt: timestamp,
      })

    await tx.insert(tokens)
      .values(
        Array.from({ length: LIGNES_INITIALES }, (_, i) => ({
          id: crypto.randomUUID(),
          walletId: id,
          position: i + 1,
          name: null,
          mint: null,
          gain: null,
          perteRug: null,
          delay: null,
          // Les lignes d'amorce appartiennent à l'échantillon de screening.
          phase: 'screening' as const,
          dayId: null,
          source: 'manual' as const,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      )
  })

  const created = await getWallet(id)
  if (!created) throw new Error('Le wallet n’a pas pu être créé.')
  return created
}

export async function updateWallet(
  id: string,
  patch: UpdateWalletPatch,
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: now() }

  if (patch.label !== undefined) values.label = patch.label
  if (patch.address !== undefined) values.address = patch.address.trim()
  if (patch.analyzedAt !== undefined) values.analyzedAt = patch.analyzedAt
  if (patch.notes !== undefined) values.notes = patch.notes
  if (patch.tagOverride !== undefined) values.tagOverride = patch.tagOverride
  if (patch.status !== undefined) values.status = patch.status
  if (patch.testStartedAt !== undefined) values.testStartedAt = patch.testStartedAt

  const s = patch.strategy
  if (s) {
    if (s.mise !== undefined) values.mise = s.mise
    if (s.objectif !== undefined) values.objectif = s.objectif
    if (s.perteRug !== undefined) values.perteRug = s.perteRug
    if (s.frais !== undefined) values.frais = s.frais
    if (s.tauxVise !== undefined) values.tauxVise = s.tauxVise
  }

  await db.update(wallets).set(values).where(eq(wallets.id, id))
}

/** Supprime le wallet ; ses tokens et ses journées suivent (ON DELETE CASCADE). */
export async function deleteWallet(id: string): Promise<void> {
  await db.delete(wallets).where(eq(wallets.id, id))
}
