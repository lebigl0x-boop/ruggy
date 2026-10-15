/**
 * Migration de la base Ruggers v1 vers le schéma v2.
 *
 *   npm run db:migration-v2 -- --essai   # lit, compte, n'écrit rien
 *   npm run db:migration-v2              # migre pour de bon
 *
 * La sauvegarde reste **dans la base** : les tables `wallets_v1`, `tokens_v1`
 * et `wallet_days_v1` sont des copies brutes, sans index ni contrainte, donc
 * sans collision de nom avec les nouvelles tables. Rien n'est écrit sur le
 * disque : un fichier d'export traînerait des adresses de wallets hors de la
 * base, et la sauvegarde doit pouvoir être relue par la base elle-même.
 *
 * Les anciennes tables ne sont supprimées que par la migration Drizzle, après
 * la lecture et après la sauvegarde. Si l'insertion échoue ensuite, les copies
 * `*_v1` portent encore l'intégralité des données.
 *
 * Viser la connexion **directe** (port 5432) et non le pooler : celui-ci est en
 * mode transaction et ne tient pas le verrou de migration.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resolve } from 'node:path'

import { convertir, type JourV1, type TokenV1, type WalletV1 } from './conversion'
import { jours, tokens, trades, wallets } from '../lib/db/schema'

const essai = process.argv.includes('--essai')

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error('DATABASE_URL est absente. Posez-la dans .env.local (jamais dans le dépôt).')
  process.exit(1)
}

const client = postgres(url, { max: 1, onnotice: () => {} })

/** Les tables de sauvegarde, et la table v1 que chacune copie. */
const SAUVEGARDES = [
  ['wallets_v1', 'wallets'],
  ['tokens_v1', 'tokens'],
  ['wallet_days_v1', 'wallet_days'],
] as const

async function existe(table: string): Promise<boolean> {
  const [row] = await client`
    select to_regclass(${'public.' + table}) is not null as presente
  `
  return row?.presente === true
}

/**
 * Lit le schéma v1, depuis les tables d'origine ou depuis la sauvegarde.
 *
 * Le suffixe permet de reprendre une migration interrompue après la
 * sauvegarde : les tables d'origine ont disparu, mais `*_v1` porte la même
 * chose, aux mêmes colonnes.
 */
async function lire(suffixe = ''): Promise<{
  wallets: WalletV1[]
  tokens: TokenV1[]
  jours: JourV1[]
}> {
  const tableWallets = client(`wallets${suffixe}`)
  const tableTokens = client(`tokens${suffixe}`)
  const tableJours = client(suffixe === '' ? 'wallet_days' : 'wallet_days_v1')

  const walletsV1 = (await client`
    select id, label, address, notes, status,
           test_started_at as "testStartedAt", trade_started_at as "tradeStartedAt",
           mise, objectif, frais, created_at as "createdAt"
    from ${tableWallets}
  `) as unknown as WalletV1[]

  const tokensV1 = (await client`
    select id, wallet_id as "walletId", position, name, mint, gain, pris, phase,
           day_id as "dayId", entree_sol as "entreeSol", sortie_sol as "sortieSol",
           created_at as "createdAt"
    from ${tableTokens}
    order by wallet_id, position
  `) as unknown as TokenV1[]

  const joursV1 = (await client`
    select id, wallet_id as "walletId", day, state, phase
    from ${tableJours}
    order by wallet_id, day
  `) as unknown as JourV1[]

  return { wallets: walletsV1, tokens: tokensV1, jours: joursV1 }
}

/** Le récapitulatif. Des compteurs seulement : aucune adresse, aucun libellé. */
function rapport(c: ReturnType<typeof convertir>['compteurs']): void {
  const l = (texte: string) => console.log(texte)

  l('')
  l(`  Wallets   ${String(c.wallets.total).padStart(4)} migrés`)
  l(
    `            screening ${c.wallets.screening} · test ${c.wallets.test} · ` +
      `trade ${c.wallets.trade} · archive ${c.wallets.archive}`,
  )
  if (c.rabattus.valideVersTest > 0 || c.rabattus.rejeteVersArchive > 0) {
    l(
      `            dont valide→test ${c.rabattus.valideVersTest}, ` +
        `rejete→archive ${c.rabattus.rejeteVersArchive}`,
    )
  }

  l(`  Journées  ${String(c.jours.total).padStart(4)} relevées`)
  l(`            dont ${c.jours.sansLancement} sans lancement`)

  l(`  Tokens    ${String(c.tokens.total).padStart(4)} migrés`)
  l(
    `            screening ${c.tokens.screening} · test ${c.tokens.test} — ` +
      `tp ${c.tokens.tp} · rate ${c.tokens.rate}`,
  )

  l(`  Trades    ${String(c.trades.total).padStart(4)} migrés`)
  l(`            tp ${c.trades.tp} · rate ${c.trades.rate}`)

  const i = c.ignores
  const ignores = i.tokensNonNotes + i.tokensTestSansJour + i.tradesSansMontants
  l('')
  l(`  Ignorés   ${String(ignores).padStart(4)} lignes`)
  l(`            ${i.tokensNonNotes} tokens jamais notés (gain vide)`)
  l(`            ${i.tradesSansMontants} tokens de trade sans entrée/sortie`)
  if (i.tokensTestSansJour > 0) {
    l(`            ${i.tokensTestSansJour} tokens de test sans journée (anomalie v1)`)
  }
  l(`            ${i.joursOuverts} journées ouvertes mais jamais relevées`)
  l(`            ${i.joursDeTrade} journées du lot trade (la date passe sur le trade)`)
  l('')
  l('  Perdu     délais avant dump · pertes par token · gain continu · tags')
  l('            → conservés dans les tables de sauvegarde *_v1')
  l('')
}

/** Écrit les quatre lots en une transaction : tout ou rien. */
async function ecrire(
  db: ReturnType<typeof drizzle>,
  resultat: ReturnType<typeof convertir>,
): Promise<void> {
  await db.transaction(async (tx) => {
    // L'ordre compte : les trois autres tables référencent `wallets`.
    if (resultat.wallets.length > 0) await tx.insert(wallets).values(resultat.wallets)
    if (resultat.jours.length > 0) await tx.insert(jours).values(resultat.jours)
    if (resultat.tokens.length > 0) await tx.insert(tokens).values(resultat.tokens)
    if (resultat.trades.length > 0) await tx.insert(trades).values(resultat.trades)
  })
}

async function principal(): Promise<void> {
  // Une migration interrompue après la sauvegarde laisse `*_v1` en place et le
  // schéma v2 déjà créé. On reprend là où elle s'est arrêtée plutôt que de
  // demander de tout défaire à la main.
  const reprise = (await existe('wallets_v1')) && (await existe('trades'))

  if (!reprise && !(await existe('wallets'))) {
    console.error('Aucune table `wallets` : cette base n’est pas en schéma v1.')
    process.exit(1)
  }

  const v1 = await lire(reprise ? '_v1' : '')
  const resultat = convertir(v1)

  console.log('')
  console.log(essai ? '  ESSAI — rien ne sera écrit' : '  MIGRATION v1 → v2')
  console.log('  ' + '─'.repeat(56))
  rapport(resultat.compteurs)

  if (essai) {
    console.log('  Relancez sans --essai pour appliquer.')
    console.log('')
    return
  }

  // --- Reprise : il ne reste que l'écriture --------------------------------
  if (reprise) {
    const db = drizzle(client)
    const [dejaLa] = await client`select count(*)::int as n from wallets`
    if ((dejaLa?.n ?? 0) > 0) {
      console.error('  Les tables v2 contiennent déjà des données : rien à reprendre.')
      process.exit(1)
    }

    console.log('  Reprise depuis la sauvegarde *_v1.')
    await ecrire(db, resultat)
    console.log('  ✓ Données migrées')
    console.log('')
    console.log('  Les tables *_v1 restent en place. Vérifiez l’application, puis')
    console.log('  supprimez-les à la main quand vous êtes sûr.')
    console.log('')
    return
  }

  // --- Garde-fou : on ne réécrit jamais une sauvegarde existante ------------
  for (const [copie] of SAUVEGARDES) {
    if (await existe(copie)) {
      console.error(
        `  La table \`${copie}\` existe déjà : une migration a donc déjà tourné.\n` +
          '  Supprimez les tables *_v1 à la main si vous voulez recommencer.',
      )
      process.exit(1)
    }
  }

  // --- 1. Sauvegarde -------------------------------------------------------
  await client.begin(async (tx) => {
    for (const [copie, source] of SAUVEGARDES) {
      await tx.unsafe(`create table ${copie} as select * from ${source}`)
    }
  })
  console.log('  ✓ Sauvegarde : wallets_v1, tokens_v1, wallet_days_v1')

  // --- 2. Nouveau schéma ---------------------------------------------------
  // On efface l'ancien schéma nous-mêmes : la migration v2 est une création
  // de zéro, elle ne sait pas défaire la v1. Elle ne tourne qu'après lecture
  // ET sauvegarde — à ce stade, plus rien de ce qu'on efface n'est perdu.
  //
  // Le journal de Drizzle part avec : la v2 repart d'une migration unique, et
  // un journal qui se souvient des migrations v1 ferait sauter la seule qui
  // reste à appliquer.
  await client.begin(async (tx) => {
    await tx.unsafe('drop table if exists tokens, wallet_days, settings, wallets cascade')
    await tx.unsafe('drop schema if exists drizzle cascade')
  })

  const db = drizzle(client)
  await migrate(db, { migrationsFolder: resolve(process.cwd(), 'lib/db/migrations') })
  console.log('  ✓ Schéma v2 en place')

  await ecrire(db, resultat)

  console.log('  ✓ Données migrées')
  console.log('')
  console.log('  Les tables *_v1 restent en place. Vérifiez l’application, puis')
  console.log('  supprimez-les avec `npm run db:nettoyage-v1`.')
  console.log('')
}

try {
  await principal()
} finally {
  await client.end()
}
