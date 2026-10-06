/**
 * Brouillons du relevé du matin.
 *
 * Une journée à moitié saisie ne vivait que dans l'écran : ouvrir un wallet
 * puis revenir suffisait à tout perdre. On la garde donc sur l'appareil
 * jusqu'à validation.
 *
 * Pourquoi pas en base ? Parce qu'en base, une journée enregistrée est une
 * journée relevée : elle quitte la file du matin et entre dans le bilan. Un
 * brouillon à trois lignes ferait disparaître la journée de la file et
 * compterait comme une observation, ce qui est faux dans les deux cas.
 *
 * Le stockage peut échouer (navigation privée, quota) : tout est enveloppé,
 * un brouillon perdu ne doit jamais casser la saisie en cours.
 */

import type { LigneJour } from '@/components/jour/lignes-jour'

/** Le `v1` permet d'ignorer d'anciens brouillons si la forme change. */
const PREFIXE = 'ruggers:brouillon:v1:'

export type Brouillon = {
  /** Ce qui reste dans le champ de saisie rapide, pas encore versé. */
  saisie: string
  lignes: LigneJour[]
}

/** La clé d'un brouillon : une journée d'un wallet. */
export function cleBrouillon(walletId: string, day: string): string {
  return `${walletId}:${day}`
}

function estLigne(valeur: unknown): valeur is LigneJour {
  if (typeof valeur !== 'object' || valeur === null) return false
  const ligne = valeur as Record<string, unknown>
  return typeof ligne.cle === 'string' && typeof ligne.pris === 'boolean'
}

/**
 * Relit un brouillon. Tout ce qui n'a pas la forme attendue est jeté : un
 * brouillon abîmé ne vaut pas la peine d'être rattrapé, et surtout pas au
 * prix d'un écran cassé.
 */
export function lireBrouillon(cle: string): Brouillon | null {
  if (typeof window === 'undefined') return null

  try {
    const brut = window.localStorage.getItem(PREFIXE + cle)
    if (brut === null) return null

    const lu = JSON.parse(brut) as unknown
    if (typeof lu !== 'object' || lu === null) return null

    const { saisie, lignes } = lu as Record<string, unknown>
    if (!Array.isArray(lignes) || !lignes.every(estLigne)) return null

    return { saisie: typeof saisie === 'string' ? saisie : '', lignes }
  } catch {
    return null
  }
}

/** Écrit un brouillon, ou l'efface s'il ne reste rien à garder. */
export function ecrireBrouillon(cle: string, brouillon: Brouillon): void {
  if (typeof window === 'undefined') return

  if (brouillon.lignes.length === 0 && brouillon.saisie.trim() === '') {
    effacerBrouillon(cle)
    return
  }

  try {
    window.localStorage.setItem(PREFIXE + cle, JSON.stringify(brouillon))
  } catch {
    // Quota plein ou stockage refusé : la saisie en cours continue de vivre
    // dans l'écran, c'est seulement le filet de sécurité qui manque.
  }
}

export function effacerBrouillon(cle: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(PREFIXE + cle)
  } catch {
    // Rien à faire : au pire le brouillon traîne jusqu'à la prochaine saisie.
  }
}

/** Le nombre de lignes gardées pour chaque journée, pour l'afficher replié. */
export function compterBrouillons(cles: readonly string[]): Record<string, number> {
  const compte: Record<string, number> = {}
  for (const cle of cles) {
    const brouillon = lireBrouillon(cle)
    if (brouillon !== null && brouillon.lignes.length > 0) {
      compte[cle] = brouillon.lignes.length
    }
  }
  return compte
}
