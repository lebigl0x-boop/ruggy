/**
 * Mise en forme pour l'affichage. Tout est en français : virgule décimale,
 * espace insécable avant les unités, dates courtes.
 */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })

/** Espace insécable fine, pour coller l'unité au nombre sans la détacher. */
const NBSP = ' '

/** Un résultat en SOL, signé : « +0,140 SOL », « −0,093 SOL ». */
export function formatSol(value: number, options: { sign?: boolean } = {}): string {
  const withSign = options.sign ?? true
  const rounded = Math.abs(value) < 5e-4 ? 0 : value
  const body = nf(3, 3).format(Math.abs(rounded))
  const prefix = !withSign ? '' : rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${prefix}${body}${NBSP}SOL`
}

/** Un pourcentage : « 50 % », « −30 % ». */
export function formatPercent(
  value: number,
  options: { decimals?: number; sign?: boolean } = {},
): string {
  const decimals = options.decimals ?? 0
  const withSign = options.sign ?? false
  const body = nf(decimals, decimals).format(Math.abs(value))
  const prefix = !withSign ? (value < 0 ? '−' : '') : value > 0 ? '+' : value < 0 ? '−' : ''
  return `${prefix}${body}${NBSP}%`
}

/**
 * Un pourcentage affiché au plus juste : les décimales n'apparaissent que si
 * elles existent. « −90 % », mais « −40,5 % » quand c'est ce qui a été saisi.
 */
export function formatPercentExact(
  value: number,
  options: { sign?: boolean } = {},
): string {
  const withSign = options.sign ?? false
  const body = nf(0, 2).format(Math.abs(value))
  const prefix = !withSign ? (value < 0 ? '−' : '') : value > 0 ? '+' : value < 0 ? '−' : ''
  return `${prefix}${body}${NBSP}%`
}

/** Un montant en euros : « 19,40 € ». */
export function formatEur(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${prefix}${nf(2, 2).format(Math.abs(value))}${NBSP}€`
}

/** Une durée en minutes : « 12 min », « 1 h 30 ». */
export function formatMinutes(value: number): string {
  if (value < 60) return `${nf(0, 1).format(value)}${NBSP}min`
  const heures = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return minutes === 0 ? `${heures}${NBSP}h` : `${heures}${NBSP}h${NBSP}${minutes}`
}

/** Adresse raccourcie : les 4 premiers et 4 derniers caractères. */
export function shortAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 11) return trimmed
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

/** Date courte : « 5 oct. 2026 ». */
export function formatDateFr(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Jour court, avec son nom : « lun. 5 oct. ». */
export function formatDayFr(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

/** Date du jour au format AAAA-MM-JJ, dans le fuseau local. */
export function todayIso(): string {
  const now = new Date()
  const mois = String(now.getMonth() + 1).padStart(2, '0')
  const jour = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mois}-${jour}`
}

/** Nombre prêt à être réédité dans un champ de saisie (virgule française). */
export function toInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return String(value).replace('.', ',')
}

export const SOLSCAN_URL = (address: string) =>
  `https://solscan.io/account/${encodeURIComponent(address)}`

export const GMGN_URL = (address: string) =>
  `https://gmgn.ai/sol/address/${encodeURIComponent(address)}`
