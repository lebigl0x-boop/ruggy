/**
 * Reprend le contenu de l'ancienne base SQLite dans le Postgres de Supabase.
 *
 * À lancer une seule fois, après `npm run db:setup` :
 *
 *   npm run db:reprise -- --essai   # lit SQLite, affiche ce qui serait écrit
 *   npm run db:reprise              # écrit pour de bon
 *
 * Le mode essai ne touche ni ne lit Postgres : il sert à vérifier que la
 * vieille base est bien lue avant d'ouvrir une connexion distante.
 *
 * L'ordre d'écriture suit les clés étrangères : wallets, puis journées, puis
 * tokens — un token référence sa journée, qui référence son wallet.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { resolve } from 'node:path'

import { settings, tokens, walletDays, wallets } from '../lib/db/schema'

const essai = process.argv.includes('--essai')

const cheminSqlite = resolve(
  process.cwd(),
  process.env.RUGGERS_DB_PATH ?? 'data/ruggers.db',
)

// --------------------------------------------------------------- lecture ---

const sqlite = new Database(cheminSqlite, { readonly: true })

// Le WAL peut contenir des écritures que le fichier principal n'a pas encore :
// sans ce point de contrôle, on reprendrait une base en retard.
try {
  sqlite.pragma('wal_checkpoint(TRUNCATE)')
} catch {
  // Base ouverte en lecture seule par ailleurs : le checkpoint est un confort,
  // pas une obligation — SQLite lit le WAL de toute façon.
}

type Ligne = Record<string, unknown>

const lire = (table: string): Ligne[] =>
  sqlite.prepare(`SELECT * FROM ${table}`).all() as Ligne[]

const lignesSettings = lire('settings')
const lignesWallets = lire('wallets')
const lignesJours = lire('wallet_days')
const lignesTokens = lire('tokens')

sqlite.close()

console.log(`Lu depuis ${cheminSqlite} :`)
console.log(`  wallets      ${lignesWallets.length}`)
console.log(`  journées     ${lignesJours.length}`)
console.log(`  tokens       ${lignesTokens.length}`)
console.log(`  réglages     ${lignesSettings.length}`)

if (essai) {
  console.log('\nMode essai : rien n’a été écrit.')
  process.exit(0)
}

// ------------------------------------------------------------- conversion ---

/** SQLite stocke les booléens en 0/1 ; Postgres veut un vrai booléen. */
const booleen = (valeur: unknown): boolean => valeur === 1 || valeur === true

const nombre = (valeur: unknown): number | null =>
  valeur === null || valeur === undefined ? null : Number(valeur)

const texte = (valeur: unknown): string | null =>
  valeur === null || valeur === undefined ? null : String(valeur)

// --------------------------------------------------------------- écriture ---

const url = process.env.DATABASE_URL?.trim()

if (!url) {
  console.error(
    '\nDATABASE_URL est absente. Posez-la dans .env.local (jamais dans le dépôt).',
  )
  process.exit(1)
}

const client = postgres(url, { max: 1, onnotice: () => {} })
const db = drizzle(client)

await db.transaction(async (tx) => {
  if (lignesWallets.length > 0) {
    await tx.insert(wallets).values(
      lignesWallets.map((r) => ({
        id: String(r.id),
        label: String(r.label),
        address: String(r.address),
        analyzedAt: String(r.analyzed_at),
        notes: String(r.notes ?? ''),
        tagOverride: texte(r.tag_override),
        status: String(r.status),
        testStartedAt: texte(r.test_started_at),
        mise: Number(r.mise),
        objectif: Number(r.objectif),
        perteRug: Number(r.perte_rug),
        frais: Number(r.frais),
        tauxVise: Number(r.taux_vise),
        source: String(r.source),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
    )
  }

  if (lignesJours.length > 0) {
    await tx.insert(walletDays).values(
      lignesJours.map((r) => ({
        id: String(r.id),
        walletId: String(r.wallet_id),
        day: String(r.day),
        state: String(r.state),
        note: String(r.note ?? ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
    )
  }

  if (lignesTokens.length > 0) {
    await tx.insert(tokens).values(
      lignesTokens.map((r) => ({
        id: String(r.id),
        walletId: String(r.wallet_id),
        position: Number(r.position),
        name: texte(r.name),
        mint: texte(r.mint),
        gain: nombre(r.gain),
        perteRug: nombre(r.perte_rug),
        delay: nombre(r.delay),
        pris: booleen(r.pris),
        phase: String(r.phase),
        dayId: texte(r.day_id),
        source: String(r.source),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
    )
  }

  // Les réglages globaux sont une ligne unique, déjà amorcée par db:setup :
  // on la met à jour plutôt que de l'insérer.
  const reglages = lignesSettings[0]
  if (reglages) {
    await tx.update(settings).set({
      solPriceEur: nombre(reglages.sol_price_eur),
      defaultMise: Number(reglages.default_mise),
      defaultObjectif: Number(reglages.default_objectif),
      defaultPerteRug: Number(reglages.default_perte_rug),
      defaultFrais: Number(reglages.default_frais),
      defaultTauxVise: Number(reglages.default_taux_vise),
      updatedAt: String(reglages.updated_at),
    })
  }
})

await client.end()

console.log('\nReprise terminée.')
