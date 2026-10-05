/**
 * Arithmétique des journées de test, au format AAAA-MM-JJ.
 *
 * Tout passe par UTC : un décalage horaire ou un changement d'heure ne doit
 * pas faire apparaître ou disparaître une journée d'observation. La date du
 * jour n'est jamais lue ici — elle est toujours passée en paramètre, pour que
 * ces fonctions restent reproductibles.
 */

import { isIsoDate } from './validation'

const MS_PAR_JOUR = 86_400_000

/** Garde-fou : une file de saisie ne remonte pas à plus d'un an. */
export const MAX_JOURS_FILE = 366

function versDate(iso: string): Date | null {
  if (!isIsoDate(iso)) return null
  return new Date(`${iso}T00:00:00Z`)
}

function versIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Décale une date d'un nombre de jours. Renvoie l'entrée si elle est illisible. */
export function ajouterJours(iso: string, nombre: number): string {
  const date = versDate(iso)
  if (date === null) return iso
  return versIso(new Date(date.getTime() + nombre * MS_PAR_JOUR))
}

export function jourPrecedent(iso: string): string {
  return ajouterJours(iso, -1)
}

/** Nombre de jours entre deux dates, négatif si `fin` précède `debut`. */
export function ecartEnJours(debut: string, fin: string): number {
  const a = versDate(debut)
  const b = versDate(fin)
  if (a === null || b === null) return 0
  return Math.round((b.getTime() - a.getTime()) / MS_PAR_JOUR)
}

/**
 * Toutes les dates de `debut` à `fin`, bornes comprises.
 * Liste vide si `fin` précède `debut` ou si une borne est illisible.
 */
export function listerJours(debut: string, fin: string): string[] {
  if (versDate(debut) === null || versDate(fin) === null) return []

  const ecart = ecartEnJours(debut, fin)
  if (ecart < 0) return []

  const total = Math.min(ecart, MAX_JOURS_FILE - 1)
  return Array.from({ length: total + 1 }, (_, i) => ajouterJours(debut, i))
}

/**
 * Les journées que la phase de test attend mais qui ne sont pas encore
 * saisies, de la plus ancienne à la plus récente.
 *
 * `jusqua` est la dernière journée attendue — en pratique la veille, puisque
 * le relevé du matin porte sur ce que le wallet a tradé la veille. Le jour
 * même n'est donc jamais réclamé.
 */
export function joursManquants({
  debut,
  jusqua,
  saisis,
}: {
  debut: string
  jusqua: string
  saisis: readonly string[]
}): string[] {
  const connus = new Set(saisis)
  return listerJours(debut, jusqua).filter((jour) => !connus.has(jour))
}
