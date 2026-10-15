/**
 * Bilan de la phase de test (phase 2).
 *
 * La phase de screening juge un échantillon choisi dans le passé ; la phase de
 * test juge un relevé exhaustif, jour après jour. Les deux lots ne
 * s'additionnent jamais : l'échantillon de screening est biaisé par
 * construction — on y retient ce qui se remarque — alors que la journée de
 * test contient aussi les trades médiocres. Mélanger les deux reviendrait à
 * polluer la seule mesure honnête dont on dispose.
 *
 * Le découpage en journées vit dans `day-report.ts`, partagé avec la phase
 * active. Ce qui est propre au test, et qui est ici : le plancher de journées
 * avant de pouvoir conclure, et les conseils qui vont avec.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import type { Strategy } from './compute'
import {
  computeDayReport,
  type DayInput,
  type DayReport,
  type DayReportOptions,
} from './day-report'

export type {
  DayInput,
  DayReport,
  DayResult,
  DayState,
} from './day-report'

/** Nombre de journées à observer avant de pouvoir conclure un test. */
export const JOURS_MINIMUM_TEST = 4

/**
 * En dessous de ce nombre de tokens notés, le test reste concluable mais
 * l'app conseille de prolonger : quatre journées à deux tokens ne suffisent
 * pas à juger. C'est un conseil, pas un verrou — un wallet compliqué demande
 * simplement plus de jours.
 */
export const SEUIL_CONSEIL_TOKENS = 20

/** Au-delà, le wallet trade trop rarement pour valoir la peine d'être suivi. */
export const SEUIL_CONSEIL_INACTIVITE = 50

export type ConseilCode = 'jours' | 'volume' | 'inactivite'

export type Conseil = { code: ConseilCode; message: string }

export type TestReport = DayReport & {
  joursMinimum: number
  /** Journées restantes avant de pouvoir conclure. */
  joursRestants: number
  /** Le test peut être conclu : plancher atteint et au moins un token noté. */
  verdictDisponible: boolean
  /** Ce qu'il manque, ou ce qui mérite attention avant de trancher. */
  conseil: Conseil | null
}

/**
 * Bilan d'une phase de test, à partir des journées observées.
 *
 * Les journées sont triées par date : le cumul affiché suit le temps, pas
 * l'ordre d'insertion en base.
 */
export function computeTestReport(
  days: readonly DayInput[],
  strategy: Strategy,
  options: DayReportOptions = {},
): TestReport {
  const base = computeDayReport(days, strategy, options)

  const joursRestants = Math.max(0, JOURS_MINIMUM_TEST - base.joursObserves)
  const verdictDisponible = joursRestants === 0 && base.report.n > 0

  return {
    ...base,
    joursMinimum: JOURS_MINIMUM_TEST,
    joursRestants,
    verdictDisponible,
    conseil: conseiller({
      joursObserves: base.joursObserves,
      joursRestants,
      n: base.report.n,
      tauxInactivite: base.tauxInactivite,
      joursActifs: base.joursActifs,
    }),
  }
}

/**
 * Ce qu'il manque avant de trancher. Un seul conseil à la fois, du plus
 * bloquant au plus discutable — un écran qui affiche trois avertissements
 * n'en fait lire aucun.
 */
function conseiller(etat: {
  joursObserves: number
  joursRestants: number
  n: number
  tauxInactivite: number
  joursActifs: number
}): Conseil | null {
  if (etat.joursObserves === 0) {
    return {
      code: 'jours',
      message: `Aucune journée saisie. Il en faut ${JOURS_MINIMUM_TEST} pour conclure.`,
    }
  }

  if (etat.joursRestants > 0) {
    return {
      code: 'jours',
      message:
        etat.joursRestants > 1
          ? `Encore ${etat.joursRestants} journées à observer avant de conclure.`
          : 'Encore une journée à observer avant de conclure.',
    }
  }

  if (etat.n === 0) {
    return {
      code: 'volume',
      message: 'Aucun token noté : rien à juger pour l’instant.',
    }
  }

  if (etat.n < SEUIL_CONSEIL_TOKENS) {
    return {
      code: 'volume',
      message: `${etat.joursObserves} journées mais seulement ${etat.n} ${
        etat.n > 1 ? 'tokens notés' : 'token noté'
      } : prolongez plutôt que de conclure.`,
    }
  }

  if (etat.tauxInactivite >= SEUIL_CONSEIL_INACTIVITE) {
    return {
      code: 'inactivite',
      message: `Le wallet n’a tradé que ${etat.joursActifs} ${
        etat.joursActifs > 1 ? 'journées' : 'journée'
      } sur ${etat.joursObserves} : débit faible, même s’il est rentable.`,
    }
  }

  return null
}
