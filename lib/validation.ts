/**
 * Validation et lecture des saisies. Fonctions pures, testables, sans UI.
 */

import type { Strategy, TagOverride } from './compute'

/** Alphabet base58 (Bitcoin / Solana) : pas de 0, O, I ni l. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

export const TAG_OVERRIDES = ['rentable', 'surveiller', 'pas'] as const

export function isTagOverride(value: unknown): value is TagOverride {
  return (
    typeof value === 'string' &&
    (TAG_OVERRIDES as readonly string[]).includes(value)
  )
}

/**
 * Une adresse Solana est une clé publique de 32 octets encodée en base58,
 * soit 32 à 44 caractères. On ne vérifie pas que la clé existe sur la
 * blockchain : c'est un simple garde-fou de saisie.
 */
export function isLikelySolanaAddress(value: string): boolean {
  const trimmed = value.trim()
  return (
    trimmed.length >= 32 && trimmed.length <= 44 && BASE58.test(trimmed)
  )
}

/**
 * Lit un nombre saisi à la française : la virgule vaut point décimal, les
 * espaces (y compris insécables) sont ignorés. Renvoie `null` si le champ est
 * vide ou illisible.
 */
export function parseNumberFr(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const cleaned = value
    .replace(/[\s\u00a0\u202f]/g, '')
    // L'app affiche le vrai signe moins (−) et des tirets peuvent venir
    // d'un copier-coller : on les ramène au moins du clavier.
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(',', '.')
    .trim()

  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/** Comme `parseNumberFr`, mais borné et rabattu sur une valeur de repli. */
export function parseBounded(
  value: string | number | null | undefined,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const parsed = parseNumberFr(value)
  if (parsed === null) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** Bornes de saisie des réglages de stratégie. */
export const STRATEGY_BOUNDS = {
  mise: { min: 0, max: 1000, step: 0.01, label: 'Mise', unit: 'SOL' },
  objectif: { min: 1, max: 10000, step: 1, label: 'Objectif', unit: '%' },
  perteRug: { min: 0, max: 100, step: 1, label: 'Perte par défaut', unit: '%' },
  frais: { min: 0, max: 10, step: 0.001, label: 'Frais par trade', unit: 'SOL' },
  tauxVise: { min: 0, max: 100, step: 1, label: 'Taux visé', unit: '%' },
} as const satisfies Record<
  keyof Strategy,
  { min: number; max: number; step: number; label: string; unit: string }
>

export type StrategyField = keyof Strategy

/** Rabat une valeur de stratégie dans ses bornes. */
export function clampStrategyField(
  field: StrategyField,
  value: string | number | null | undefined,
  fallback: number,
): number {
  const bounds = STRATEGY_BOUNDS[field]
  return parseBounded(value, { min: bounds.min, max: bounds.max, fallback })
}

/** Bornes de la perte saisie sur un token. */
export const PERTE_TOKEN_BOUNDS = { min: 0, max: 100 } as const

/**
 * Lit la perte propre à un token, toujours comme une grandeur positive.
 *
 * On écrit naturellement une perte avec un moins : « −50 » veut dire « j'ai
 * perdu 50 % », pas « j'ai gagné 50 % ». On prend donc la valeur absolue,
 * plafonnée à 100 % — on ne perd pas plus que sa mise sur un achat comptant.
 *
 * `null` signifie « comme le wallet » et reste un choix valable.
 */
export function parsePerteToken(
  value: string | number | null | undefined,
): number | null {
  const parsed = parseNumberFr(value)
  if (parsed === null) return null
  return Math.min(PERTE_TOKEN_BOUNDS.max, Math.abs(parsed))
}

/** Date ISO courte `AAAA-MM-JJ`. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export type FieldIssue = { field: string; message: string; level: 'error' | 'warning' }

/** Contrôle du formulaire d'ajout d'un wallet. */
export function validateNewWallet(input: {
  label: string
  address: string
  analyzedAt: string
  existingAddresses: readonly string[]
}): FieldIssue[] {
  const issues: FieldIssue[] = []
  const address = input.address.trim()

  if (input.label.trim() === '') {
    issues.push({ field: 'label', message: 'Donnez un nom à ce wallet.', level: 'error' })
  }

  if (address === '') {
    issues.push({ field: 'address', message: 'L’adresse est obligatoire.', level: 'error' })
  } else if (input.existingAddresses.some((a) => a.trim() === address)) {
    issues.push({
      field: 'address',
      message: 'Cette adresse est déjà suivie.',
      level: 'error',
    })
  } else if (!isLikelySolanaAddress(address)) {
    // Simple avertissement : on laisse passer, au cas où.
    issues.push({
      field: 'address',
      message: 'Cette adresse ne ressemble pas à une adresse Solana.',
      level: 'warning',
    })
  }

  if (!isIsoDate(input.analyzedAt)) {
    issues.push({ field: 'analyzedAt', message: 'Date invalide.', level: 'error' })
  }

  return issues
}

export function hasBlockingIssue(issues: readonly FieldIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
