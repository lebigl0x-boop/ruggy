import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

/**
 * Garantit l'existence de la ligne unique de réglages globaux.
 *
 * Elle était créée à l'ouverture de la base du temps de SQLite. Avec Postgres,
 * l'application ne touche plus au schéma au démarrage : l'amorçage se fait
 * une fois, par `npm run db:setup`, et les tests appellent la même fonction
 * pour partir d'une base identique.
 *
 * Pas d'import de `server-only` ici : ce module tourne aussi hors de Next.js,
 * dans les scripts lancés avec tsx.
 */
export async function ensureSettingsRow(
  client: PgDatabase<PgQueryResultHKT, Record<string, unknown>>,
): Promise<void> {
  await client.execute(
    sql`insert into settings (id, updated_at) values (1, ${new Date().toISOString()}) on conflict (id) do nothing`,
  )
}
