import 'server-only'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import * as schema from './schema'

// Les commentaires `turbopackIgnore` évitent que Next.js, voyant un chemin
// construit à l'exécution, embarque tout le projet dans la sortie du build.
export const DB_PATH = resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  process.env.RUGGERS_DB_PATH ?? 'data/ruggers.db',
)

const MIGRATIONS_FOLDER = resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  'lib/db/migrations',
)

function createClient() {
  mkdirSync(dirname(DB_PATH), { recursive: true })

  const sqlite = new Database(DB_PATH)
  // WAL : lectures et écritures concurrentes sans blocage.
  sqlite.pragma('journal_mode = WAL')
  // Indispensable pour que la suppression d'un wallet efface ses tokens.
  sqlite.pragma('foreign_keys = ON')

  const client = drizzle(sqlite, { schema })

  // L'app tourne en local : on applique les migrations au démarrage pour
  // qu'un simple `npm run dev` suffise, sans étape d'installation oubliée.
  migrate(client, { migrationsFolder: MIGRATIONS_FOLDER })
  ensureSettingsRow(sqlite)

  return client
}

/** Garantit l'existence de la ligne unique de réglages globaux. */
function ensureSettingsRow(sqlite: Database.Database): void {
  sqlite
    .prepare('INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, ?)')
    .run(new Date().toISOString())
}

// En développement, Next.js recharge les modules à chaud : on garde une seule
// connexion sur l'objet global pour ne pas rouvrir le fichier à chaque fois.
const globalForDb = globalThis as unknown as {
  __ruggersDb?: ReturnType<typeof createClient>
}

export const db = globalForDb.__ruggersDb ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__ruggersDb = db
}

export { schema }
