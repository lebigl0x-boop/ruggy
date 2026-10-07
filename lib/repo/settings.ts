import 'server-only'

import { eq } from 'drizzle-orm'

import type { Strategy } from '../compute'
import { DEFAULT_STRATEGY } from '../compute'
import { db } from '../db'
import { settings } from '../db/schema'
import { mapSettings } from './mappers'
import type { GlobalSettings } from './types'

const SETTINGS_ID = 1

/** Réglages globaux. La ligne est créée à l'ouverture de la base. */
export async function getSettings(): Promise<GlobalSettings> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .limit(1)
  if (!row) return { solPriceEur: null, defaults: { ...DEFAULT_STRATEGY } }
  return mapSettings(row)
}

export async function updateSolPrice(solPriceEur: number | null): Promise<void> {
  await db
    .update(settings)
    .set({ solPriceEur, updatedAt: new Date().toISOString() })
    .where(eq(settings.id, SETTINGS_ID))
}

/** Enregistre une stratégie comme modèle des prochains wallets. */
export async function updateDefaults(strategy: Strategy): Promise<void> {
  await db
    .update(settings)
    .set({
      defaultMise: strategy.mise,
      defaultObjectif: strategy.objectif,
      defaultPerteRug: strategy.perteRug,
      defaultFrais: strategy.frais,
      defaultTauxVise: strategy.tauxVise,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(settings.id, SETTINGS_ID))
}
