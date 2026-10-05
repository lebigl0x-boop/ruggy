/**
 * Crée ./data/ruggers.db et y applique les migrations Drizzle.
 * À lancer avec `npm run db:setup`. L'app le fait aussi toute seule au
 * démarrage ; ce script sert surtout à vérifier que tout est en place.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dbPath = resolve(process.cwd(), process.env.RUGGERS_DB_PATH ?? 'data/ruggers.db')

mkdirSync(dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

migrate(drizzle(sqlite), {
  migrationsFolder: resolve(process.cwd(), 'lib/db/migrations'),
})

sqlite
  .prepare('INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, ?)')
  .run(new Date().toISOString())

const tables = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as { name: string }[]

sqlite.close()

console.log(`Base prête : ${dbPath}`)
console.log(`Tables : ${tables.map((t) => t.name).join(', ')}`)
