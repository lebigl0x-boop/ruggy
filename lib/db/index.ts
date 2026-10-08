import 'server-only'

import { createRequire } from 'node:module'

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import * as schema from './schema'

/**
 * Le dénominateur commun des deux pilotes : tout `lib/repo` s'écrit contre ce
 * type, et personne n'a besoin de savoir lequel tourne.
 */
type BaseRuggers = PgDatabase<PgQueryResultHKT, typeof schema>

// `createRequire` plutôt qu'un `import` statique : seul le pilote dont
// l'environnement a besoin est chargé, et aucun des deux n'entre dans le
// bundle (voir `serverExternalPackages` dans next.config.ts).
const exiger = createRequire(import.meta.url)

/**
 * La connexion à la base.
 *
 * Deux pilotes, un seul Postgres :
 *
 * - en production et en développement, `postgres.js` parle au Postgres de
 *   Supabase à travers `DATABASE_URL` ;
 * - en test, PGlite fait tourner un Postgres en mémoire, dans le processus.
 *   La suite reste donc autonome — ni base distante, ni conteneur — tout en
 *   exécutant le vrai SQL de Postgres.
 *
 * Les migrations ne sont plus appliquées au démarrage : en serverless, ce
 * code s'exécuterait à chaque démarrage à froid, en concurrence avec lui-même.
 * Elles passent par `npm run db:migrate`, avant le déploiement.
 */

/**
 * Pointer vers le *pooler* de Supabase, pas vers la base directe : chaque
 * invocation serverless ouvre sa propre connexion, et une base directe sature
 * en quelques requêtes.
 *
 *   postgresql://postgres.<ref>:<mot-de-passe>@<région>.pooler.supabase.com:6543/postgres
 */
function urlPostgres(): string | null {
  const url = process.env.DATABASE_URL?.trim()
  return url !== undefined && url !== '' ? url : null
}

function creerClient(): BaseRuggers {
  const url = urlPostgres()

  if (url === null) {
    // La base en mémoire ne s'obtient que sur demande explicite. Sans ça, un
    // `npm run dev` sans .env.local démarrerait sur une base vide et volatile,
    // en donnant l'impression d'avoir perdu toutes les données.
    if (process.env.RUGGERS_DB_MEMOIRE === '1') return creerClientMemoire()

    throw new Error(
      'DATABASE_URL est absente. Posez l’URL du pooler Supabase dans .env.local ' +
        '(ou RUGGERS_DB_MEMOIRE=1 pour une base en mémoire, réservée aux tests).',
    )
  }

  // Imports paresseux : PGlite ne doit pas entrer dans le bundle de production,
  // et postgres.js ne doit pas être chargé par la suite de tests.
  const { drizzle } =
    exiger('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js')
  const postgres = exiger('postgres') as typeof import('postgres')

  const client = postgres(url, {
    // Le pooler de Supabase est en mode transaction : il ne sait pas tenir les
    // requêtes préparées d'une invocation à l'autre.
    prepare: false,
    // Une instance Vercel peut traiter plusieurs requêtes en parallèle, et le
    // préchargement des liens du rail en déclenche volontiers une poignée d'un
    // coup. À `max: 1` elles faisaient la queue sur une seule connexion, et un
    // ralentissement de la base se transformait en attente pour toutes. Cinq
    // reste très en deçà du quota du pooler.
    max: 5,
    // Par défaut, postgres.js garde ses connexions ouvertes indéfiniment. Une
    // instance serverless gelée entre deux requêtes retiendrait donc sa place
    // dans le pooler pour rien : on la rend après 20 s d'inactivité.
    idle_timeout: 20,
    // Filet de sécurité : une connexion ne vit pas plus de trente minutes,
    // même sollicitée en continu.
    max_lifetime: 60 * 30,
    // Échouer vite plutôt que tenir l'invocation ouverte si le pooler sature.
    connect_timeout: 10,
    // Les NOTICE de Postgres n'ont rien à faire dans les journaux de l'app.
    onnotice: () => {},
  })

  return drizzle(client, { schema })
}

/** Postgres en mémoire, pour les tests. */
function creerClientMemoire(): BaseRuggers {
  const { PGlite } =
    exiger('@electric-sql/pglite') as typeof import('@electric-sql/pglite')
  const { drizzle } = exiger('drizzle-orm/pglite') as typeof import('drizzle-orm/pglite')

  return drizzle(new PGlite(), { schema })
}

// Une seule connexion par processus, en développement comme en production.
//
// En développement, Next.js recharge les modules à chaud : sans ce cache, un
// pool s'ouvrirait à chaque rechargement.
//
// En production c'est plus grave encore. `db` est un Proxy : *chaque accès de
// propriété* passe par ici. Un rendu qui fait `db.select(...)` puis
// `db.query...` ouvrirait deux pools `postgres.js`, chacun avec sa connexion
// TCP, et aucune ne serait refermée. Multiplié par les requêtes d'une page et
// par les instances serverless de Vercel, Postgres atteint sa limite de
// connexions en quelques minutes (EMAXCONN).
//
// Sur Vercel, le module global survit d'une invocation à l'autre tant que
// l'instance reste chaude : le cache est donc exactement ce qu'il faut.
const globalForDb = globalThis as unknown as { __ruggersDb?: BaseRuggers }

function obtenirClient(): BaseRuggers {
  const existant = globalForDb.__ruggersDb
  if (existant) return existant

  const client = creerClient()
  globalForDb.__ruggersDb = client
  return client
}

/**
 * La connexion s'ouvre à la première requête, pas à l'import.
 *
 * Next.js évalue les modules de chaque page pendant le build : connecter au
 * chargement ferait échouer `next build` sans `DATABASE_URL`, alors qu'aucune
 * requête n'est exécutée à ce moment-là.
 */
export const db: BaseRuggers = new Proxy({} as BaseRuggers, {
  get(_cible, propriete) {
    const client = obtenirClient() as unknown as Record<string | symbol, unknown>
    const valeur = client[propriete]
    return typeof valeur === 'function' ? valeur.bind(client) : valeur
  },
})

/**
 * Une transaction en cours, ou la base elle-même.
 *
 * La saisie d'une journée crée la journée puis ses tokens : les fonctions de
 * `lib/repo` doivent pouvoir travailler indifféremment sur l'une ou l'autre.
 */
export type DbClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0]

export { schema }
