import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { db, type DbClient } from '../db'
import { tokens } from '../db/schema'
import { mapToken } from './mappers'
import type {
  CreateTokenInput,
  Source,
  Token,
  TokenPhase,
  UpdateTokenPatch,
} from './types'

function now(): string {
  return new Date().toISOString()
}

async function nextPosition(
  walletId: string,
  client: DbClient = db,
): Promise<number> {
  const [row] = await client
    .select({ max: sql<number | null>`max(${tokens.position})` })
    .from(tokens)
    .where(eq(tokens.walletId, walletId))
    .limit(1)
  return (row?.max ?? 0) + 1
}

/** Ajoute un token vide à la fin de l'échantillon de screening. */
export async function createToken(walletId: string): Promise<Token> {
  const [token] = await createTokens(walletId, [{}])
  if (!token) throw new Error('Le token n’a pas pu être créé.')
  return token
}

export type CreateTokensOptions = {
  /** Lot de rattachement. 'screening' par défaut. */
  phase?: TokenPhase
  /** Journée de rattachement, obligatoire en phase de test. */
  dayId?: string | null
  /**
   * `source` permet au futur module d'import (Helius) d'insérer des tokens
   * marqués comme automatiques sans rien changer à l'interface.
   */
  source?: Source
}

/**
 * Ajoute plusieurs tokens à la suite.
 *
 * Accepte une transaction en cours : la saisie d'une journée crée la journée
 * et ses tokens d'un seul bloc, sans état intermédiaire visible.
 */
export async function createTokens(
  walletId: string,
  inputs: readonly CreateTokenInput[],
  options: CreateTokensOptions = {},
  client: DbClient = db,
): Promise<Token[]> {
  if (inputs.length === 0) return []

  const timestamp = now()
  const start = await nextPosition(walletId, client)

  const rows = inputs.map((input, i) => ({
    id: crypto.randomUUID(),
    walletId,
    position: start + i,
    name: input.name ?? null,
    mint: input.mint ?? null,
    gain: input.gain ?? null,
    perteRug: input.perteRug ?? null,
    delay: input.delay ?? null,
    pris: input.pris ?? true,
    phase: options.phase ?? 'screening',
    dayId: options.dayId ?? null,
    source: options.source ?? 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  await client.insert(tokens).values(rows)
  return rows.map(mapToken)
}

export async function updateToken(
  id: string,
  patch: UpdateTokenPatch,
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: now() }

  if (patch.name !== undefined) values.name = patch.name
  if (patch.mint !== undefined) values.mint = patch.mint
  if (patch.gain !== undefined) values.gain = patch.gain
  if (patch.perteRug !== undefined) values.perteRug = patch.perteRug
  if (patch.delay !== undefined) values.delay = patch.delay
  if (patch.pris !== undefined) values.pris = patch.pris

  await db.update(tokens).set(values).where(eq(tokens.id, id))
}

export async function deleteToken(id: string): Promise<void> {
  await db.delete(tokens).where(eq(tokens.id, id))
}

export async function listTokens(walletId: string): Promise<Token[]> {
  const rows = await db
    .select()
    .from(tokens)
    .where(eq(tokens.walletId, walletId))
    .orderBy(tokens.position)
  return rows.map(mapToken)
}
