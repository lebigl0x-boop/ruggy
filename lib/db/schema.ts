import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/**
 * Réglages globaux. Une seule ligne, d'identifiant 1.
 * Sert de modèle aux nouveaux wallets : les valeurs sont *copiées* à la
 * création, jamais référencées, pour qu'un changement de réglages ne
 * réécrive pas l'historique.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  solPriceEur: real('sol_price_eur'),
  defaultMise: real('default_mise').notNull().default(0.1),
  defaultObjectif: real('default_objectif').notNull().default(100),
  defaultPerteRug: real('default_perte_rug').notNull().default(90),
  defaultFrais: real('default_frais').notNull().default(0.003),
  defaultTauxVise: real('default_taux_vise').notNull().default(30),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
})

export const wallets = sqliteTable(
  'wallets',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    address: text('address').notNull(),
    /** Date d'analyse, au format AAAA-MM-JJ. */
    analyzedAt: text('analyzed_at').notNull(),
    notes: text('notes').notNull().default(''),
    /** null | 'rentable' | 'surveiller' | 'pas' */
    tagOverride: text('tag_override'),

    /**
     * Où en est le wallet dans l'entonnoir :
     * 'screening' | 'test' | 'valide' | 'rejete'.
     * C'est un axe distinct du tag : le statut dit où on en est, le tag dit
     * ce que disent les chiffres.
     */
    status: text('status').notNull().default('screening'),
    /** Premier jour de la phase de test, AAAA-MM-JJ. null hors phase de test. */
    testStartedAt: text('test_started_at'),

    // Réglages de stratégie propres au wallet.
    mise: real('mise').notNull().default(0.1),
    objectif: real('objectif').notNull().default(100),
    /** Perte appliquée aux tokens qui n'ont pas la leur. */
    perteRug: real('perte_rug').notNull().default(90),
    frais: real('frais').notNull().default(0.003),
    tauxVise: real('taux_vise').notNull().default(30),

    /** 'manual' aujourd'hui ; 'helius' le jour où l'import automatique arrive. */
    source: text('source').notNull().default('manual'),

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('wallets_address_unique').on(table.address),
    index('wallets_analyzed_at_idx').on(table.analyzedAt),
    index('wallets_status_idx').on(table.status),
  ],
)

/**
 * Une journée de la phase de test, pour un wallet.
 *
 * La ligne existe même quand le wallet n'a rien tradé : c'est la différence
 * entre « je n'ai pas vérifié » et « il n'a rien fait ». Sans elle, le
 * décompte des jours d'observation serait faux et le plancher de la phase 2
 * ne voudrait rien dire.
 */
export const walletDays = sqliteTable(
  'wallet_days',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    /** Jour observé, au format AAAA-MM-JJ. */
    day: text('day').notNull(),
    /** 'actif' = il a tradé ; 'inactif' = journée sans trade. */
    state: text('state').notNull().default('actif'),
    note: text('note').notNull().default(''),
    /** Moment de la saisie. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('wallet_days_unique').on(table.walletId, table.day)],
)

export const tokens = sqliteTable(
  'tokens',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    /** Ordre d'affichage dans le tableau. */
    position: integer('position').notNull(),
    name: text('name'),
    /** Adresse du token. */
    mint: text('mint'),
    /** % de montée depuis le buy. null = token non noté. */
    gain: real('gain'),
    /** Perte de ce lancement, en %. null = on reprend celle du wallet. */
    perteRug: real('perte_rug'),
    /** Délai avant dump, en minutes. */
    delay: real('delay'),

    /**
     * De quel lot vient ce token : 'screening' (échantillon historique choisi
     * à la main) ou 'test' (relevé exhaustif d'une journée).
     *
     * Les deux lots ne s'additionnent pas : l'échantillon de screening est
     * biaisé par construction, seul le lot de test donne un résultat honnête.
     */
    phase: text('phase').notNull().default('screening'),
    /** Journée de rattachement. Toujours renseignée en phase de test. */
    dayId: text('day_id').references(() => walletDays.id, { onDelete: 'cascade' }),

    source: text('source').notNull().default('manual'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('tokens_wallet_position_idx').on(table.walletId, table.position),
    index('tokens_day_idx').on(table.dayId),
  ],
)

export type WalletRow = typeof wallets.$inferSelect
export type WalletInsert = typeof wallets.$inferInsert
export type TokenRow = typeof tokens.$inferSelect
export type TokenInsert = typeof tokens.$inferInsert
export type SettingsRow = typeof settings.$inferSelect
export type WalletDayRow = typeof walletDays.$inferSelect
export type WalletDayInsert = typeof walletDays.$inferInsert
