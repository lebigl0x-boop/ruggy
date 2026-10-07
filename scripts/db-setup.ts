/**
 * Applique les migrations sur le Postgres de `DATABASE_URL`, puis amorce la
 * ligne de réglages globaux.
 *
 * À lancer avec `npm run db:setup`, avant un déploiement. L'application ne le
 * fait plus toute seule : en serverless, ce code s'exécuterait à chaque
 * démarrage à froid, plusieurs invocations en même temps.
 *
 * Pour migrer la base de production, viser la connexion **directe**
 * (port 5432) et non le pooler : le pooler est en mode transaction et ne sait
 * pas tenir un verrou de migration.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resolve } from 'node:path'

const url = process.env.DATABASE_URL?.trim()

if (!url) {
  console.error(
    'DATABASE_URL est absente. Posez-la dans .env.local (jamais dans le dépôt).',
  )
  process.exit(1)
}

const client = postgres(url, { max: 1, onnotice: () => {} })
const db = drizzle(client)

await migrate(db, {
  migrationsFolder: resolve(process.cwd(), 'lib/db/migrations'),
})

const { ensureSettingsRow } = await import('../lib/db/seed')
await ensureSettingsRow(db)

const tables = await client`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name
`

await client.end()

console.log('Base prête.')
console.log(`Tables : ${tables.map((t) => t.table_name).join(', ')}`)
