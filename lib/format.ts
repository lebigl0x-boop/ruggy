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
const NBSP = ' '

/**
 * Un résultat en SOL, signé : « +0,142 SOL », « −0,058 SOL ».
 *
 * Les montants sous le demi-millième s'affichent à zéro, sans signe : un
 * « +0,000 » vert ferait croire à un gain là où il n'y a rien.
 */
export function formatSol(valeur: number, options: { signe?: boolean } = {}): string {
  const avecSigne = options.signe ?? true
  const arrondi = Math.abs(valeur) < 5e-4 ? 0 : valeur
  const corps = nf(3, 3).format(Math.abs(arrondi))
  const prefixe = !avecSigne ? '' : arrondi > 0 ? '+' : arrondi < 0 ? '−' : ''
  return `${prefixe}${corps}${NBSP}SOL`
}

/** Un pourcentage : « 60 % », « −12,5 % ». */
export function formatPct(
  valeur: number,
  options: { decimales?: number; signe?: boolean } = {},
): string {
  const decimales = options.decimales ?? 0
  const avecSigne = options.signe ?? false
  const corps = nf(decimales, decimales).format(Math.abs(valeur))
  const prefixe = !avecSigne
    ? valeur < 0
      ? '−'
      : ''
    : valeur > 0
      ? '+'
      : valeur < 0
        ? '−'
        : ''
  return `${prefixe}${corps}${NBSP}%`
}

/** Adresse raccourcie : les 4 premiers et 4 derniers caractères. */
export function adresseCourte(adresse: string): string {
  const propre = adresse.trim()
  if (propre.length <= 11) return propre
  return `${propre.slice(0, 4)}…${propre.slice(-4)}`
}

/** Date courte : « 5 oct. 2026 ». */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Jour court, avec son nom : « lun. 5 oct. ». */
export function formatJour(iso: string): string {
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
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')
  return `${maintenant.getFullYear()}-${mois}-${jour}`
}

/** Nombre prêt à être réédité dans un champ de saisie (virgule française). */
export function versChamp(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return ''
  return String(valeur).replace('.', ',')
}

/**
 * Une capitalisation en dollars, lue d'un coup d'œil : « 344,7 k$ », « 1,2 M$ ».
 *
 * Les montants s'étalent sur quatre ordres de grandeur d'une ligne à l'autre ;
 * écrits en entier ils ne se comparent plus. Le millier est l'unité naturelle
 * de ces lancements.
 */
export function formatMcUsd(valeur: number): string {
  if (!Number.isFinite(valeur) || valeur <= 0) return '—'
  if (valeur >= 1_000_000) return `${nf(2, 2).format(valeur / 1_000_000)}${NBSP}M$`
  if (valeur >= 1_000) return `${nf(1, 1).format(valeur / 1_000)}${NBSP}k$`
  return `${nf(0, 0).format(valeur)}${NBSP}$`
}

/**
 * Un multiple, lu d'un coup d'œil : « ×2,4 », « ×18 », « ×1 240 ».
 *
 * Les décimales ne servent qu'en dessous de ×10, là où un dixième change la
 * lecture : entre ×24 et ×24,3, la précision supplémentaire n'apprend rien et
 * désaligne la colonne.
 */
export function formatMultiple(valeur: number): string {
  if (!Number.isFinite(valeur) || valeur <= 0) return '—'
  if (valeur < 10) return `×${nf(1, 1).format(valeur)}`
  return `×${nf(0, 0).format(valeur)}`
}

/**
 * Un seuil de multiple, écrit court : « ×2 », « ×1,5 ».
 *
 * À la différence de `formatMultiple`, qui met en forme une mesure, celui-ci
 * affiche une valeur choisie : pas de décimale inutile sur un palier rond.
 */
export function formatSeuil(valeur: number): string {
  return `×${nf(0, 2).format(valeur)}`
}

export const SOLSCAN_URL = (adresse: string) =>
  `https://solscan.io/account/${encodeURIComponent(adresse)}`

/**
 * La page de trade Padre d'un token, construite depuis son adresse.
 *
 * Padre est une application monopage : son HTML est le même pour tous les
 * tokens et ne contient ni le nom ni l'adresse. Le lien se fabrique donc à
 * l'aveugle, et c'est suffisant — il n'a besoin que du CA. Le nom, lui, vient
 * d'ailleurs (voir `lib/token-meta.ts`).
 */
export const PADRE_URL = (mint: string) =>
  `https://trade.padre.gg/trade/solana/${encodeURIComponent(mint)}`
