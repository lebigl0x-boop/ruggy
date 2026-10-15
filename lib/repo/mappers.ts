import 'server-only'

import type { TagOverride } from '../compute'
import { isTagOverride } from '../validation'
import type { DayState } from '../test-report'
import type {
  SettingsRow,
  TokenRow,
  WalletDayRow,
  WalletRow,
} from '../db/schema'
import type {
  DayPhase,
  GlobalSettings,
  Source,
  Token,
  TokenPhase,
  Wallet,
  WalletDay,
  WalletStatus,
} from './types'

function toSource(value: string): Source {
  return value === 'helius' ? 'helius' : 'manual'
}

const STATUTS: readonly string[] = [
  'screening',
  'test',
  'valide',
  'trade',
  'rejete',
]

/** Un statut inconnu en base retombe sur le début de l'entonnoir. */
function toStatus(value: string): WalletStatus {
  return STATUTS.includes(value) ? (value as WalletStatus) : 'screening'
}

/**
 * Un token dont la phase est illisible est rattaché au screening : il ne
 * polluera ni le bilan de test, qui doit rester exhaustif par construction,
 * ni le résultat réel, qui ne doit porter que sur de l'argent engagé.
 */
function toPhase(value: string): TokenPhase {
  if (value === 'test') return 'test'
  if (value === 'trade') return 'trade'
  return 'screening'
}

/** Une journée de phase illisible est une journée de test : c'est l'ancien cas. */
function toDayPhase(value: string): DayPhase {
  return value === 'trade' ? 'trade' : 'test'
}

const ETATS_JOUR: readonly DayState[] = ['actif', 'inactif', 'ouvert']

export function toDayState(value: string): DayState {
  return ETATS_JOUR.includes(value as DayState) ? (value as DayState) : 'actif'
}

function toTagOverride(value: string | null): TagOverride | null {
  return isTagOverride(value) ? value : null
}

export function mapWallet(row: WalletRow): Wallet {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    analyzedAt: row.analyzedAt,
    notes: row.notes,
    tagOverride: toTagOverride(row.tagOverride),
    status: toStatus(row.status),
    testStartedAt: row.testStartedAt,
    tradeStartedAt: row.tradeStartedAt,
    strategy: {
      mise: row.mise,
      objectif: row.objectif,
      perteRug: row.perteRug,
      frais: row.frais,
      tauxVise: row.tauxVise,
    },
    source: toSource(row.source),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function mapToken(row: TokenRow): Token {
  return {
    id: row.id,
    walletId: row.walletId,
    position: row.position,
    name: row.name,
    mint: row.mint,
    gain: row.gain,
    perteRug: row.perteRug,
    delay: row.delay,
    pris: row.pris,
    phase: toPhase(row.phase),
    dayId: row.dayId,
    entreeSol: row.entreeSol,
    sortieSol: row.sortieSol,
    source: toSource(row.source),
  }
}

export function mapWalletDay(row: WalletDayRow): WalletDay {
  return {
    id: row.id,
    walletId: row.walletId,
    day: row.day,
    state: toDayState(row.state),
    phase: toDayPhase(row.phase),
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function mapSettings(row: SettingsRow): GlobalSettings {
  return {
    solPriceEur: row.solPriceEur,
    defaults: {
      mise: row.defaultMise,
      objectif: row.defaultObjectif,
      perteRug: row.defaultPerteRug,
      frais: row.defaultFrais,
      tauxVise: row.defaultTauxVise,
    },
  }
}
