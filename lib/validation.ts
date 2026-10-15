/**
 * Lecture et contrôle des saisies. Fonctions pures, sans UI.
 */

/** Alphabet base58 (Bitcoin / Solana) : pas de 0, O, I ni l. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

/**
 * Une adresse Solana est une clé publique de 32 octets en base58, soit 32 à 44
 * caractères. On ne vérifie pas qu'elle existe sur la chaîne : c'est un
 * garde-fou de saisie, et le filtre qui évite d'appeler Helius pour rien.
 */
export function estAdresseSolana(valeur: string): boolean {
  const propre = valeur.trim()
  return propre.length >= 32 && propre.length <= 44 && BASE58.test(propre)
}

/**
 * Lit un nombre saisi à la française : la virgule vaut point décimal, les
 * espaces (y compris insécables) sont ignorés. `null` si vide ou illisible.
 */
export function parseNombreFr(
  valeur: string | number | null | undefined,
): number | null {
  if (valeur === null || valeur === undefined) return null
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null

  const propre = valeur
    .replace(/[\s  ]/g, '')
    // L'app affiche le vrai signe moins (−) et un copier-coller peut ramener
    // des tirets typographiques : on les rabat sur le moins du clavier.
    .replace(/[−–—]/g, '-')
    .replace(',', '.')
    .trim()

  if (propre === '' || propre === '-' || propre === '.') return null

  const lu = Number(propre)
  return Number.isFinite(lu) ? lu : null
}

export type Bornes = { min: number; max: number; pas: number; unite: string }

/**
 * Bornes de saisie.
 *
 * Ce sont des garde-fous de frappe — une mise de mille SOL est une faute de
 * virgule, pas une stratégie — et non des règles métier. Rien ici ne décide de
 * ce qu'on a le droit de faire.
 */
export const BORNES = {
  mise: { min: 0, max: 100, pas: 0.01, unite: 'SOL' },
  tp: { min: 1, max: 10000, pas: 10, unite: '%' },
  frais: { min: 0, max: 10, pas: 0.001, unite: 'SOL' },
  tokensScreening: { min: 1, max: 500, pas: 1, unite: 'tokens' },
  joursTest: { min: 1, max: 365, pas: 1, unite: 'jours' },
} as const satisfies Record<string, Bornes>

/** Lit une valeur et la rabat dans ses bornes, avec un repli si illisible. */
export function borner(
  valeur: string | number | null | undefined,
  bornes: Bornes,
  repli: number,
): number {
  const lu = parseNombreFr(valeur)
  if (lu === null) return repli
  return Math.min(bornes.max, Math.max(bornes.min, lu))
}

/** Date courte `AAAA-MM-JJ`, et qui existe vraiment. */
export function estDateIso(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false
  const date = new Date(`${valeur}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === valeur
}

export type Souci = {
  champ: string
  message: string
  /** `erreur` bloque, `avertissement` laisse passer. */
  niveau: 'erreur' | 'avertissement'
}

/** Contrôle du formulaire de création d'un wallet. */
export function valideNouveauWallet(entree: {
  nom: string
  adresse: string
  adressesExistantes: readonly string[]
}): Souci[] {
  const soucis: Souci[] = []
  const adresse = entree.adresse.trim()

  if (entree.nom.trim() === '') {
    soucis.push({ champ: 'nom', message: 'Donnez un nom à ce wallet.', niveau: 'erreur' })
  }

  if (adresse === '') {
    soucis.push({ champ: 'adresse', message: 'L’adresse est obligatoire.', niveau: 'erreur' })
  } else if (entree.adressesExistantes.some((a) => a.trim() === adresse)) {
    soucis.push({
      champ: 'adresse',
      message: 'Cette adresse est déjà suivie.',
      niveau: 'erreur',
    })
  } else if (!estAdresseSolana(adresse)) {
    // Simple avertissement : on laisse passer, au cas où.
    soucis.push({
      champ: 'adresse',
      message: 'Cette adresse ne ressemble pas à une adresse Solana.',
      niveau: 'avertissement',
    })
  }

  return soucis
}
