/**
 * Applique les migrations sur le Postgres de `DATABASE_URL`.
 *
 * À lancer avant un déploiement, sur une base vide. Une base encore en schéma
 * v1 passe par `npm run db:migration-v2`, qui sauvegarde puis migre les
 * données avant d'appeler les mêmes migrations.
 *
 * L'application ne les applique plus toute seule : en serverless, ce code
 * s'exécuterait à chaque démarrage à froid, plusieurs invocations en même
 * temps.
 *
 * Viser la connexion **directe** (port 5432) et non le pooler : celui-ci est
 * en mode transaction et ne tient pas le verrou de migration.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resolve } from 'node:path'

const url = process.env.DATABASE_URL?.trim()

if (!url) {
  console.error('DATABASE_URL est absente. Posez-la dans .env.local (jamais dans le dépôt).')
  process.exit(1)
}

const client = postgres(url, { max: 1, onnotice: () => {} })

try {
  await migrate(drizzle(client), {
    migrationsFolder: resolve(process.cwd(), 'lib/db/migrations'),
  })

  const tables = await client`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `
  console.log('Schéma à jour. Tables :', tables.map((t) => t.table_name).join(', '))
} finally {
  await client.end()
}
