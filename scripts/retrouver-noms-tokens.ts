/**
 * Rattrape les lignes saisies avant que le champ « Nom » n'accepte un CA.
 *
 *   npm run db:noms -- --essai   # affiche ce qui serait écrit, sans rien écrire
 *   npm run db:noms              # écrit pour de bon
 *
 * Avant, la colonne `mint` n'était exposée nulle part : qui voulait garder
 * l'adresse d'un token la tapait dans le nom. Ces lignes n'ont donc ni lien
 * Padre ni nom lisible, et le champ ne se déclenche qu'à la frappe — elles
 * resteraient en l'état indéfiniment.
 *
 * Le script range l'adresse dans `mint`, puis va chercher le vrai nom. Si la
 * recherche ne donne rien, le nom devient l'adresse raccourcie : on ne perd
 * rien, `mint` porte désormais l'adresse complète, et le lien marche quand
 * même — il ne dépend que du CA.
 *
 * Il ne touche que les lignes dont le nom *est* une adresse et dont le `mint`
 * est vide. Un nom tapé à la main n'est jamais réécrit.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { shortAddress } from '../lib/format'
import { resolveTokenMeta } from '../lib/token-meta'
import { tokens } from '../lib/db/schema'

const essai = process.argv.includes('--essai')

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error('DATABASE_URL est absente. Posez-la dans .env.local.')
  process.exit(1)
}

if (!process.env.HELIUS_API_KEY?.trim()) {
  console.warn(
    'HELIUS_API_KEY est absente : seul DexScreener répondra, et il ne connaît\n' +
      'que les tokens ayant encore une pool. Les lignes mortes garderont leur CA.\n',
  )
}

const client = postgres(url, { max: 1, onnotice: () => {} })
const db = drizzle(client, { schema: { tokens } })

/** La forme d'une clé publique Solana : base58, 32 à 44 caractères. */
const BASE58 = '^[1-9A-HJ-NP-Za-km-z]{32,44}$'

const candidats = await db
  .select({ id: tokens.id, name: tokens.name })
  .from(tokens)
  .where(and(isNull(tokens.mint), sql`${tokens.name} ~ ${BASE58}`))

console.log(
  `${candidats.length} ligne(s) dont le nom est une adresse.` +
    (essai ? ' Mode essai : rien ne sera écrit.' : ''),
)

let resolus = 0

for (const candidat of candidats) {
  // Le `where` l'a déjà garanti ; la vérification est là pour le typage.
  const mint = candidat.name
  if (mint === null) continue

  const meta = await resolveTokenMeta(mint)
  const name = meta?.name ?? shortAddress(mint)
  if (meta !== null) resolus += 1

  console.log(
    `  ${shortAddress(mint).padEnd(12)} → ${name}` +
      (meta === null ? '  (aucune source ne le connaît)' : `  (${meta.via})`),
  )

  if (!essai) {
    await db
      .update(tokens)
      .set({ mint, name, updatedAt: new Date().toISOString() })
      .where(eq(tokens.id, candidat.id))
  }
}

console.log(
  `\n${resolus}/${candidats.length} nom(s) retrouvé(s). ` +
    (essai
      ? 'Relancez sans --essai pour écrire.'
      : 'Les autres gardent leur CA raccourci, avec un lien Padre valide.'),
)

await client.end()
