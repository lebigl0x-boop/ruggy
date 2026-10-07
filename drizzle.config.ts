import type { Config } from 'drizzle-kit'

/**
 * Les migrations SQLite ont été remplacées : Postgres repart d'une migration
 * unique qui crée le schéma final. L'historique d'avant la bascule reste dans
 * git, il n'a plus de sens à rejouer sur un moteur différent.
 *
 * `DATABASE_URL` n'est lue que par `db:migrate` et `db:push` ; la génération
 * des migrations, elle, ne lit que le schéma.
 */
export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
} satisfies Config
