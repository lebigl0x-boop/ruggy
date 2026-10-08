import 'server-only'

import { eq } from 'drizzle-orm'
import { cache } from 'react'

import type { Strategy } from '../compute'
import { DEFAULT_STRATEGY } from '../compute'
import { db } from '../db'
import { settings } from '../db/schema'
import { mapSettings } from './mappers'
import type { GlobalSettings } from './types'

const SETTINGS_ID = 1

/**
 * Réglages globaux. La ligne est créée à l'ouverture de la base.
 *
 * Mémorisé le temps d'une requête : le layout racine les demande à chaque
 * navigation, et la page affichée les redemande aussitôt. Sans ce `cache()`,
 * c'étaient deux allers-retours vers Supabase là où un seul suffit.
 *
 * La mémoire ne survit pas à la requête — rien n'est partagé d'un visiteur à
 * l'autre. Seule contrainte à respecter : une Server Action qui *écrit* les
 * réglages ne doit pas les avoir lus plus tôt dans la même requête, sinon le
 * rendu déclenché par `revalidatePath` relirait la valeur d'avant. Aucune ne
 * le fait aujourd'hui (voir `app/actions.ts`).
 */
export const getSettings = cache(async function getSettings(): Promise<GlobalSettings> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .limit(1)
  if (!row) return { solPriceEur: null, defaults: { ...DEFAULT_STRATEGY } }
  return mapSettings(row)
})

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
