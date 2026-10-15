import { sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * Les horodatages sont des chaînes ISO-8601, écrites par l'application avec
 * `new Date().toISOString()`. On les garde en `text` plutôt qu'en `timestamp`
 * pour que la valeur lue soit exactement celle qui a été écrite — le reste du
 * code compare et trie ces dates comme des chaînes.
 */
const horodatage = sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

/**
 * Réglages globaux. Une seule ligne, d'identifiant 1.
 * Sert de modèle aux nouveaux wallets : les valeurs sont *copiées* à la
 * création, jamais référencées, pour qu'un changement de réglages ne
 * réécrive pas l'historique.
 */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  solPriceEur: doublePrecision('sol_price_eur'),
  defaultMise: doublePrecision('default_mise').notNull().default(0.1),
  defaultObjectif: doublePrecision('default_objectif').notNull().default(100),
  defaultPerteRug: doublePrecision('default_perte_rug').notNull().default(90),
  defaultFrais: doublePrecision('default_frais').notNull().default(0.003),
  defaultTauxVise: doublePrecision('default_taux_vise').notNull().default(30),
  updatedAt: text('updated_at').notNull().default(horodatage),
})

export const wallets = pgTable(
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
     * 'screening' | 'test' | 'valide' | 'trade' | 'rejete'.
     * C'est un axe distinct du tag : le statut dit où on en est, le tag dit
     * ce que disent les chiffres.
     *
     * 'trade' est la phase active : le wallet est validé *et* on engage du
     * SOL dessus. C'est le seul statut où les chiffres enregistrés sont des
     * montants réels et non une simulation.
     */
    status: text('status').notNull().default('screening'),
    /** Premier jour de la phase de test, AAAA-MM-JJ. null hors phase de test. */
    testStartedAt: text('test_started_at'),
    /** Premier jour de la phase active, AAAA-MM-JJ. null avant le premier trade. */
    tradeStartedAt: text('trade_started_at'),

    // Réglages de stratégie propres au wallet.
    mise: doublePrecision('mise').notNull().default(0.1),
    objectif: doublePrecision('objectif').notNull().default(100),
    /** Perte appliquée aux tokens qui n'ont pas la leur. */
    perteRug: doublePrecision('perte_rug').notNull().default(90),
    frais: doublePrecision('frais').notNull().default(0.003),
    tauxVise: doublePrecision('taux_vise').notNull().default(30),

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
 * Une journée de relevé, pour un wallet.
 *
 * La ligne existe même quand le wallet n'a rien tradé : c'est la différence
 * entre « je n'ai pas vérifié » et « il n'a rien fait ». Sans elle, le
 * décompte des jours d'observation serait faux et le plancher de la phase 2
 * ne voudrait rien dire.
 *
 * La journée porte sa phase : une journée de test observe ce que le wallet a
 * lancé, une journée de trade enregistre ce qu'on a joué. Les deux séries ne
 * se mélangent jamais — un relevé simulé et un relevé réel ne s'additionnent
 * pas plus que screening et test.
 */
export const walletDays = pgTable(
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
    /**
     * À quelle phase appartient la journée : 'test' ou 'trade'.
     *
     * Par défaut 'test', pour que les journées antérieures à la phase active
     * gardent exactement le sens qu'elles avaient.
     */
    phase: text('phase').notNull().default('test'),
    note: text('note').notNull().default(''),
    /** Moment de la saisie. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Une même date peut porter une journée de test et une journée de trade :
    // un wallet peut être remis en test pendant qu'on le trade encore.
    uniqueIndex('wallet_days_unique').on(table.walletId, table.day, table.phase),
    index('wallet_days_phase_idx').on(table.walletId, table.phase),
  ],
)

export const tokens = pgTable(
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
    gain: doublePrecision('gain'),
    /** Perte de ce lancement, en %. null = on reprend celle du wallet. */
    perteRug: doublePrecision('perte_rug'),
    /** Délai avant dump, en minutes. */
    delay: doublePrecision('delay'),
    /**
     * Le token a été pris. Un token non pris reste une observation du wallet
     * — il a bien lancé ce jour-là — mais son résultat n'entre pas dans le
     * PNL : c'est ce qui permet de mesurer un filtre d'entrée.
     *
     * Par défaut à vrai, pour que les relevés antérieurs au filtre gardent
     * exactement les chiffres qu'ils avaient.
     */
    pris: boolean('pris').notNull().default(true),

    /**
     * De quel lot vient ce token : 'screening' (échantillon historique choisi
     * à la main), 'test' (relevé exhaustif d'une journée) ou 'trade' (un
     * trade réellement joué).
     *
     * Les trois lots ne s'additionnent pas. Le screening est biaisé par
     * construction — on y retient ce qui se remarque. Le test est exhaustif
     * mais simulé : son résultat est ce que la stratégie *aurait* donné. Seul
     * le lot de trade porte des montants réellement engagés.
     */
    phase: text('phase').notNull().default('screening'),
    /** Journée de rattachement. Toujours renseignée hors screening. */
    dayId: text('day_id').references(() => walletDays.id, { onDelete: 'cascade' }),

    /**
     * SOL réellement sorti du portefeuille pour entrer sur ce token.
     * `null` hors phase active : le lot de test se calcule sur la mise
     * théorique du wallet, pas sur un montant engagé.
     */
    entreeSol: doublePrecision('entree_sol'),
    /**
     * SOL réellement récupéré à la sortie, frais de réseau et slippage
     * compris — c'est ce qui est rentré, pas ce qui aurait dû rentrer.
     *
     * Le couple entrée/sortie remplace entièrement la simulation : quand il
     * est renseigné, `mise`, `frais` et `perteRug` du wallet ne servent plus.
     * C'est le seul moyen d'avoir un PNL qui dise la vérité.
     */
    sortieSol: doublePrecision('sortie_sol'),

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
