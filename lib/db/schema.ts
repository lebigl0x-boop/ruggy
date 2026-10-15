/**
 * Schéma Ruggers v2.
 *
 * Quatre tables, et une règle qui les tient : screening, test et trade sont
 * trois lots séparés dont les résultats ne s'additionnent jamais. Le screening
 * est un échantillon choisi à la main, le test un relevé exhaustif mais simulé,
 * le trade le seul lot où du SOL est réellement sorti du portefeuille.
 *
 * Rien n'est bridé ici : aucune contrainte ne vérifie qu'un wallet a « assez »
 * de tokens ou de journées pour changer de phase. Les planchers de la v1 ont
 * disparu — l'app informe, elle n'empêche pas.
 *
 * Les horodatages sont des chaînes ISO-8601 et les dates de journée des chaînes
 * `AAAA-MM-JJ`, comme en v1 : le code compare et trie ces valeurs telles
 * qu'elles ont été écrites.
 *
 * Ce fichier remplacera `schema.ts` à l'étape 4 ; il vit à côté le temps que
 * les écrans suivent, pour que l'application v1 continue de tourner.
 */
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/** Phase d'un wallet dans le suivi. `archive` sort le wallet du courant. */
export type PhaseWallet = 'screening' | 'test' | 'trade' | 'archive'

/** Lot d'un token simulé. Le lot réel vit dans `trades`. */
export type PhaseToken = 'screening' | 'test'

/** Issue d'un lancement ou d'un trade. C'est toute la saisie. */
export type Issue = 'tp' | 'rate'

/** Réglages d'un nouveau wallet. Modifiables wallet par wallet ensuite. */
export const DEFAUTS = {
  mise: 0.05,
  tp: 300,
  frais: 0.008,
  tokensScreening: 10,
  joursTest: 5,
} as const

export const wallets = pgTable(
  'wallets',
  {
    id: text('id').primaryKey(),
    nom: text('nom').notNull(),
    adresse: text('adresse').notNull(),
    /** 'screening' | 'test' | 'trade' | 'archive' */
    phase: text('phase').notNull().default('screening'),

    /** Mise engagée par trade, en SOL. Sert à simuler screening et test. */
    mise: doublePrecision('mise').notNull().default(DEFAUTS.mise),
    /** Take-profit visé, en %. Un lancement qui l'atteint est un `tp`. */
    tp: doublePrecision('tp').notNull().default(DEFAUTS.tp),
    /** Frais fixes par trade, en SOL. */
    frais: doublePrecision('frais').notNull().default(DEFAUTS.frais),

    /**
     * Repères affichés à côté des boutons de phase — « 6 / 10 tokens notés ».
     * Ce sont des indications, pas des seuils : rien ne les vérifie.
     */
    tokensScreening: integer('tokens_screening').notNull().default(DEFAUTS.tokensScreening),
    joursTest: integer('jours_test').notNull().default(DEFAUTS.joursTest),

    notes: text('notes').notNull().default(''),

    creeLe: text('cree_le').notNull(),
    /** Jour du passage en test. null tant que la phase n'a pas été ouverte. */
    testLe: text('test_le'),
    /** Jour du passage en trade. */
    tradeLe: text('trade_le'),
  },
  (table) => [
    uniqueIndex('wallets_adresse_unique').on(table.adresse),
    index('wallets_phase_idx').on(table.phase),
  ],
)

/**
 * Une journée de test relevée.
 *
 * Elle existe même sans aucun token : c'est la différence entre « le wallet
 * n'a rien lancé ce jour-là » et « je n'ai pas regardé ». Sans cette table, une
 * journée sans lancement ne laisserait aucune trace et le décompte des jours
 * observés serait faux.
 */
export const jours = pgTable(
  'jours',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    /** AAAA-MM-JJ */
    jour: text('jour').notNull(),
    creeLe: text('cree_le').notNull(),
  },
  (table) => [uniqueIndex('jours_unique').on(table.walletId, table.jour)],
)

/**
 * Un lancement observé, en screening ou en test. Simulé dans les deux cas.
 *
 * `jour` est une date simple et non une clé étrangère : la table `jours` est le
 * registre des journées relevées, le token n'a besoin que de savoir à laquelle
 * il appartient. Les deux sont écrits dans la même transaction.
 */
export const tokens = pgTable(
  'tokens',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    /** 'screening' | 'test' */
    phase: text('phase').notNull(),
    /** AAAA-MM-JJ en test, null en screening. */
    jour: text('jour'),
    nom: text('nom'),
    /** Adresse du token. Collée telle quelle, le nom est retrouvé ensuite. */
    mint: text('mint'),
    /** 'tp' | 'rate' — toute la saisie tient là. */
    issue: text('issue').notNull(),
    /** Ordre d'affichage dans son lot. */
    position: integer('position').notNull(),
    creeLe: text('cree_le').notNull(),
  },
  (table) => [
    index('tokens_wallet_phase_idx').on(table.walletId, table.phase),
    index('tokens_jour_idx').on(table.walletId, table.jour),
  ],
)

/**
 * Un trade réellement joué.
 *
 * Le résultat est `sortieSol - entreeSol`, et rien d'autre : frais de réseau et
 * slippage sont déjà dans les montants. `issue` sert au taux au TP et au
 * contrefactuel — ce que le test prédisait sur ces mêmes trades.
 */
export const trades = pgTable(
  'trades',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    /** AAAA-MM-JJ */
    date: text('date').notNull(),
    nom: text('nom'),
    mint: text('mint'),
    /** SOL réellement sorti du portefeuille. */
    entreeSol: doublePrecision('entree_sol').notNull(),
    /** SOL réellement rentré. */
    sortieSol: doublePrecision('sortie_sol').notNull(),
    issue: text('issue').notNull(),
    creeLe: text('cree_le').notNull(),
  },
  (table) => [index('trades_wallet_date_idx').on(table.walletId, table.date)],
)

export type WalletRow = typeof wallets.$inferSelect
export type WalletInsert = typeof wallets.$inferInsert
export type JourRow = typeof jours.$inferSelect
export type JourInsert = typeof jours.$inferInsert
export type TokenRow = typeof tokens.$inferSelect
export type TokenInsert = typeof tokens.$inferInsert
export type TradeRow = typeof trades.$inferSelect
export type TradeInsert = typeof trades.$inferInsert
