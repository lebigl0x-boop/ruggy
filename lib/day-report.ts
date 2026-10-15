/**
 * Le relevé jour par jour, commun aux deux phases qui en tiennent un.
 *
 * La phase de test observe ce que le wallet lance et **simule** ce que la
 * stratégie en aurait tiré ; la phase active enregistre ce qu'on a joué et
 * **compte** ce que ça a rendu. Le découpage en journées, lui, est le même :
 * une ligne par jour, les journées creuses comprises, et un cumul qui suit le
 * temps. C'est tout ce que ce module sait faire — chaque phase ajoute ensuite
 * ses propres mesures par-dessus.
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

/**
 * Où en est une journée.
 *
 * - `actif` : relevée, le wallet a tradé ;
 * - `inactif` : relevée, il n'a rien lancé ce jour-là ;
 * - `ouvert` : la journée a été ouverte pour être saisie au fil de l'eau,
 *   mais rien n'y a encore été porté.
 *
 * `ouvert` et `inactif` se ressemblent en base — ni l'une ni l'autre n'a de
 * token — mais ils disent le contraire l'un de l'autre : « je n'ai pas encore
 * regardé » contre « j'ai regardé, il n'a rien fait ». Seul le second est une
 * observation, et seul le second compte dans le plancher du test.
 */
export type DayState = 'actif' | 'inactif' | 'ouvert'

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

  /**
   * Tokens pris dont le résultat vient de montants réellement engagés.
   * Zéro en phase de test, où tout est simulé.
   */
  reels: number
  /** Part du résultat de la journée qui est de l'argent compté. */
  pnlReelSol: number
  /** SOL réellement sorti du portefeuille ce jour-là. */
  engageSol: number
  /** SOL réellement rentré ce jour-là. */
  recupereSol: number
  /**
   * Ce que la journée a immobilisé : les montants réels quand ils existent,
   * la mise du wallet sinon. C'est la seule façon d'avoir une exposition
   * comparable entre une journée simulée et une journée jouée.
   */
  expositionSol: number
}

/** Le relevé jour par jour, sans les règles propres à une phase. */
export type DayReport = {
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

  /** Bilan calculé sur l'ensemble des tokens du lot, dans l'ordre des jours. */
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
}

export type DayReportOptions = {
  solPriceEur?: number | null
  tagOverride?: TagOverride | null
}

export function somme(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** Un montant exploitable, ou zéro. */
function montant(value: number | null | undefined): number {
  return value !== undefined && value !== null && Number.isFinite(value) ? value : 0
}

/**
 * Relevé jour par jour d'un lot de journées.
 *
 * Les journées sont triées par date : le cumul affiché suit le temps, pas
 * l'ordre d'insertion en base.
 */
export function computeDayReport(
  days: readonly DayInput[],
  strategy: Strategy,
  options: DayReportOptions = {},
): DayReport {
  const ordonnes = [...days].sort((a, b) => a.day.localeCompare(b.day))

  // Le bilan global rejoue tous les tokens du lot d'un coup : taux, seuil de
  // rentabilité et régularité des délais n'ont pas à être recalculés ici,
  // computeWalletReport sait déjà le faire.
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

    // Les montants réels se lisent sur les tokens, pas sur les lignes : le
    // bilan ne renvoie qu'un résultat, pas ce qui est entré et sorti.
    let reels = 0
    let pnlReelSol = 0
    let engageSol = 0
    let recupereSol = 0
    let expositionSol = 0

    jour.tokens.forEach((token, i) => {
      if (!token.pris) return
      const ligne = lignes[i]
      if (ligne?.result?.reel) {
        reels += 1
        pnlReelSol += ligne.result.sol
        engageSol += montant(token.entreeSol)
        recupereSol += montant(token.sortieSol)
        expositionSol += montant(token.entreeSol)
      } else {
        // Pas de montant saisi : la journée a quand même immobilisé une mise.
        expositionSol += strategy.mise
      }
    })

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
      reels,
      pnlReelSol,
      engageSol,
      recupereSol,
      expositionSol,
    }
  })

  // Une journée seulement ouverte n'est pas une observation : elle attend
  // encore son relevé. La compter ferait avancer le plancher du test sans que
  // personne n'ait rien regardé, et gonflerait le taux d'inactivité d'une
  // journée qui n'a jamais été jugée.
  const observes = results.filter((jour) => jour.state !== 'ouvert')

  const joursObserves = observes.length
  const joursActifs = observes.filter((jour) => jour.state === 'actif').length
  const joursInactifs = joursObserves - joursActifs

  const tokensTotal = somme(observes.map((jour) => jour.total))
  const tokensPris = somme(observes.map((jour) => jour.pris))
  const pnlSol = report.netSol

  const gagnants = observes.filter((jour) => jour.pnlSol > 0)
  const meilleurJour = classerPar(observes, (a, b) => b.pnlSol - a.pnlSol)
  const pireJour = classerPar(observes, (a, b) => a.pnlSol - b.pnlSol)
  const totalGagnant = somme(gagnants.map((jour) => jour.pnlSol))

  const tauxInactivite =
    joursObserves > 0 ? (joursInactifs / joursObserves) * 100 : 0

  return {
    days: results,
    joursObserves,
    joursActifs,
    joursInactifs,
    tauxInactivite,
    tokensTotal,
    tokensPris,
    tokensParJourActif: joursActifs > 0 ? tokensTotal / joursActifs : 0,
    expositionMaxSol: observes.reduce(
      (max, jour) => Math.max(max, jour.expositionSol),
      0,
    ),
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
  }
}

function classerPar(
  results: readonly DayResult[],
  ordre: (a: DayResult, b: DayResult) => number,
): DayResult | null {
  if (results.length === 0) return null
  return [...results].sort(ordre)[0]!
}
