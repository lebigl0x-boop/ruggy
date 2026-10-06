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
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import {
  computeWalletReport,
  type ReportRow,
  type Strategy,
  type TagOverride,
  type TokenInput,
  type WalletReport,
} from './compute'

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

export type DayState = 'actif' | 'inactif'

/** Une journée observée, avec les tokens relevés ce jour-là. */
export type DayInput = {
  /** AAAA-MM-JJ */
  day: string
  state: DayState
  tokens: readonly TokenInput[]
}

export type DayResult = {
  day: string
  state: DayState
  /**
   * Les lignes de la journée, alignées sur l'ordre de ses tokens. L'écran de
   * correction s'en sert pour afficher chaque résultat en face de sa saisie.
   */
  rows: ReportRow[]
  /** Tokens relevés ce jour-là, notés ou non, pris ou non. */
  total: number
  /** Tokens pris ce jour-là : ce qui a été engagé. */
  pris: number
  /** Tokens notés, pris ou non. */
  n: number
  /** Tokens notés ayant atteint l'objectif, pris ou non. */
  hits: number
  /** Résultat de la journée sur les seuls tokens pris. */
  pnlSol: number
  /** Résultat qu'aurait donné la journée en prenant tout. */
  pnlSolTout: number
}

export type ConseilCode = 'jours' | 'volume' | 'inactivite'

export type Conseil = { code: ConseilCode; message: string }

export type TestReport = {
  /** Une ligne par journée, de la plus ancienne à la plus récente. */
  days: DayResult[]

  joursObserves: number
  joursActifs: number
  joursInactifs: number
  /** Part des journées sans aucun trade, en %. */
  tauxInactivite: number

  /** Tokens relevés sur toute la phase, notés ou non. */
  tokensTotal: number
  /** Tokens pris sur toute la phase. */
  tokensPris: number
  /** Tokens relevés par journée active. */
  tokensParJourActif: number
  /**
   * Plus gros engagement sur une seule journée, en SOL.
   * Compté sur les tokens pris : un token écarté n'immobilise rien.
   */
  expositionMaxSol: number

  /** Bilan calculé sur l'ensemble des tokens de test, dans l'ordre des jours. */
  report: WalletReport

  pnlSol: number
  /** Résultat moyen par journée observée, journées creuses comprises. */
  pnlMoyenParJour: number
  /** Résultat moyen par journée où le wallet a tradé. */
  pnlMoyenParJourActif: number

  meilleurJour: DayResult | null
  pireJour: DayResult | null
  joursPositifs: number
  /**
   * Part du meilleur jour dans le total des journées gagnantes, en %.
   * `null` quand aucune journée n'est positive. À 70 %, le résultat tient à
   * une seule séance : ce n'est pas une stratégie, c'est un coup.
   */
  partMeilleurJour: number | null

  joursMinimum: number
  /** Journées restantes avant de pouvoir conclure. */
  joursRestants: number
  /** Le test peut être conclu : plancher atteint et au moins un token noté. */
  verdictDisponible: boolean
  /** Ce qu'il manque, ou ce qui mérite attention avant de trancher. */
  conseil: Conseil | null
}

function somme(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
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
  options: {
    solPriceEur?: number | null
    tagOverride?: TagOverride | null
  } = {},
): TestReport {
  const ordonnes = [...days].sort((a, b) => a.day.localeCompare(b.day))

  // Le bilan global rejoue tous les tokens de la phase d'un coup : taux,
  // seuil de rentabilité et régularité des délais n'ont pas à être recalculés
  // ici, computeWalletReport sait déjà le faire.
  const tousLesTokens = ordonnes.flatMap((jour) => [...jour.tokens])
  const report = computeWalletReport(tousLesTokens, strategy, {
    solPriceEur: options.solPriceEur ?? null,
    tagOverride: options.tagOverride ?? null,
  })

  let curseur = 0
  const results: DayResult[] = ordonnes.map((jour) => {
    const lignes = report.rows.slice(curseur, curseur + jour.tokens.length)
    curseur += jour.tokens.length

    const notes = lignes.filter((ligne) => ligne.result !== null)

    return {
      day: jour.day,
      state: jour.state,
      rows: lignes,
      total: jour.tokens.length,
      pris: lignes.filter((ligne) => ligne.pris).length,
      n: notes.length,
      hits: notes.filter((ligne) => ligne.result!.hit).length,
      pnlSol: somme(
        notes.filter((ligne) => ligne.pris).map((ligne) => ligne.result!.sol),
      ),
      pnlSolTout: somme(notes.map((ligne) => ligne.result!.sol)),
    }
  })

  const joursObserves = results.length
  const joursActifs = results.filter((jour) => jour.state === 'actif').length
  const joursInactifs = joursObserves - joursActifs

  const tokensTotal = somme(results.map((jour) => jour.total))
  const tokensPris = somme(results.map((jour) => jour.pris))
  const pnlSol = report.netSol

  const gagnants = results.filter((jour) => jour.pnlSol > 0)
  const meilleurJour = classerPar(results, (a, b) => b.pnlSol - a.pnlSol)
  const pireJour = classerPar(results, (a, b) => a.pnlSol - b.pnlSol)
  const totalGagnant = somme(gagnants.map((jour) => jour.pnlSol))

  const tauxInactivite =
    joursObserves > 0 ? (joursInactifs / joursObserves) * 100 : 0

  const joursRestants = Math.max(0, JOURS_MINIMUM_TEST - joursObserves)
  const verdictDisponible = joursRestants === 0 && report.n > 0

  return {
    days: results,
    joursObserves,
    joursActifs,
    joursInactifs,
    tauxInactivite,
    tokensTotal,
    tokensPris,
    tokensParJourActif: joursActifs > 0 ? tokensTotal / joursActifs : 0,
    expositionMaxSol:
      strategy.mise *
      results.reduce((max, jour) => Math.max(max, jour.pris), 0),
    report,
    pnlSol,
    pnlMoyenParJour: joursObserves > 0 ? pnlSol / joursObserves : 0,
    pnlMoyenParJourActif: joursActifs > 0 ? pnlSol / joursActifs : 0,
    meilleurJour,
    pireJour,
    joursPositifs: gagnants.length,
    partMeilleurJour:
      meilleurJour !== null && totalGagnant > 0
        ? (meilleurJour.pnlSol / totalGagnant) * 100
        : null,
    joursMinimum: JOURS_MINIMUM_TEST,
    joursRestants,
    verdictDisponible,
    conseil: conseiller({
      joursObserves,
      joursRestants,
      n: report.n,
      tauxInactivite,
      joursActifs,
    }),
  }
}

function classerPar(
  results: readonly DayResult[],
  ordre: (a: DayResult, b: DayResult) => number,
): DayResult | null {
  if (results.length === 0) return null
  return [...results].sort(ordre)[0]!
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
