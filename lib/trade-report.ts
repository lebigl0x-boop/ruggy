/**
 * Bilan de la phase active (phase 3).
 *
 * Le test dit ce que la stratégie *aurait* donné ; cette phase-ci dit ce
 * qu'elle a donné. La différence n'est pas cosmétique : en test, un résultat
 * se déduit d'une mise théorique, d'une perte par défaut et de frais fixes.
 * En trade, il se lit sur ce qui est sorti du portefeuille et ce qui y est
 * rentré — slippage, sorties partielles et frais de réseau compris.
 *
 * D'où la règle, la même que screening contre test, un cran plus loin :
 * **simulé et réel ne s'additionnent pas**. `pnlReelSol` ne compte que les
 * trades chiffrés ; ceux qui attendent encore leurs montants sont comptés à
 * part, et dits.
 *
 * Et la mesure qui justifie à elle seule la phase : `ecartSol`, la différence
 * entre ce que les mêmes trades ont rapporté et ce que le test prédisait. Tant
 * qu'on ne la regarde pas, on ne sait pas si la phase de test prédit quoi que
 * ce soit.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import { computeWalletReport, type Strategy, type TokenInput } from './compute'
import {
  computeDayReport,
  somme,
  type DayInput,
  type DayReport,
  type DayReportOptions,
} from './day-report'

/** Au-delà, le trade a trop dérivé de ce que le test annonçait. */
export const SEUIL_ALERTE_ECART = 25

export type ConseilTradeCode = 'vide' | 'montants' | 'ecart'

export type ConseilTrade = { code: ConseilTradeCode; message: string }

export type TradeReport = DayReport & {
  /** Première journée de trade relevée. `null` tant qu'il n'y en a aucune. */
  jourDepart: string | null

  /** SOL réellement sorti du portefeuille sur toute la phase. */
  engageSol: number
  /** SOL réellement rentré. */
  recupereSol: number
  /**
   * Le résultat réel : `recupereSol` − `engageSol`, et rien d'autre. Ne porte
   * que sur les trades dont les deux montants sont saisis.
   */
  pnlReelSol: number
  /** Résultat réel en €, ou `null` si le prix du SOL n'est pas renseigné. */
  pnlReelEur: number | null
  /** Rendement sur le capital engagé, en %. `null` si rien n'est engagé. */
  rendement: number | null

  /** Trades pris dont les deux montants sont saisis. */
  tradesChiffres: number
  /**
   * Trades pris qui attendent encore leurs montants. Tant qu'il en reste, le
   * résultat réel est incomplet — et le dire vaut mieux que l'arrondir.
   */
  tradesIncomplets: number

  /**
   * Ce que la stratégie du wallet prédisait sur **exactement** les mêmes
   * trades que `pnlReelSol`. C'est la seule comparaison valable : mesurer le
   * réel sur dix trades contre un simulé sur quinze ne dirait rien.
   */
  pnlSimuleSol: number
  /** `pnlReelSol` − `pnlSimuleSol`. Négatif = le test était optimiste. */
  ecartSol: number
  /**
   * L'écart rapporté au simulé, en %. `null` quand le simulé est nul : on ne
   * divise pas par zéro pour faire joli.
   */
  ecartPct: number | null

  /**
   * Plus forte baisse depuis un sommet du cumul réel, en SOL. Toujours
   * positive ou nulle. Un net flatteur sorti d'un creux à −3 SOL n'est pas le
   * même net.
   */
  drawdownMaxSol: number

  conseil: ConseilTrade | null
}

/** Le token porte ses deux montants : son résultat est de l'argent compté. */
function chiffre(token: TokenInput): boolean {
  const { entreeSol: e, sortieSol: s } = token
  return (
    e !== undefined &&
    e !== null &&
    Number.isFinite(e) &&
    e > 0 &&
    s !== undefined &&
    s !== null &&
    Number.isFinite(s) &&
    s >= 0
  )
}

/**
 * Bilan d'une phase active, à partir des journées de trade.
 *
 * Les journées `ouvert` ne comptent pas plus qu'en test : une journée ouverte
 * et vide n'est pas une journée sans trade.
 */
export function computeTradeReport(
  days: readonly DayInput[],
  strategy: Strategy,
  options: DayReportOptions = {},
): TradeReport {
  const base = computeDayReport(days, strategy, options)

  const observes = base.days.filter((jour) => jour.state !== 'ouvert')
  const engageSol = somme(observes.map((jour) => jour.engageSol))
  const recupereSol = somme(observes.map((jour) => jour.recupereSol))
  const pnlReelSol = recupereSol - engageSol

  const pris = days
    .flatMap((jour) => (jour.state === 'ouvert' ? [] : [...jour.tokens]))
    .filter((token) => token.pris)

  const tradesChiffres = pris.filter(chiffre).length
  const tradesIncomplets = pris.length - tradesChiffres

  // Le contrefactuel, sur le même lot exactement : on reprend les trades
  // chiffrés en leur retirant leurs montants, et on laisse la stratégie les
  // rejouer comme elle l'aurait fait en test.
  const pnlSimuleSol = computeWalletReport(
    pris.filter(chiffre).map((token) => ({
      gain: token.gain,
      perteRug: token.perteRug,
      delay: token.delay,
      pris: true,
    })),
    strategy,
  ).netSol

  const ecartSol = pnlReelSol - pnlSimuleSol
  const solPriceEur = options.solPriceEur ?? null

  return {
    ...base,
    jourDepart: observes[0]?.day ?? null,
    engageSol,
    recupereSol,
    pnlReelSol,
    pnlReelEur: solPriceEur !== null ? pnlReelSol * solPriceEur : null,
    rendement: engageSol > 0 ? (pnlReelSol / engageSol) * 100 : null,
    tradesChiffres,
    tradesIncomplets,
    pnlSimuleSol,
    ecartSol,
    ecartPct:
      pnlSimuleSol !== 0 ? (ecartSol / Math.abs(pnlSimuleSol)) * 100 : null,
    drawdownMaxSol: drawdown(observes.map((jour) => jour.pnlReelSol)),
    conseil: conseiller({
      joursObserves: base.joursObserves,
      tradesChiffres,
      tradesIncomplets,
      ecartPct: pnlSimuleSol !== 0 ? (ecartSol / Math.abs(pnlSimuleSol)) * 100 : null,
    }),
  }
}

/**
 * Plus forte baisse depuis un sommet, sur le cumul des journées.
 *
 * Renvoyée en valeur positive : « 2,4 SOL de creux » se lit mieux que
 * « −2,4 ». Zéro quand la courbe n'est jamais redescendue.
 */
function drawdown(parJour: readonly number[]): number {
  let cumul = 0
  let sommet = 0
  let pire = 0

  for (const jour of parJour) {
    cumul += jour
    if (cumul > sommet) sommet = cumul
    const creux = sommet - cumul
    if (creux > pire) pire = creux
  }

  return pire
}

/**
 * Ce qui mérite d'être dit, du plus bloquant au plus discutable. Un seul à la
 * fois : un écran qui affiche trois avertissements n'en fait lire aucun.
 */
function conseiller(etat: {
  joursObserves: number
  tradesChiffres: number
  tradesIncomplets: number
  ecartPct: number | null
}): ConseilTrade | null {
  if (etat.tradesChiffres === 0) {
    return {
      code: 'vide',
      message:
        etat.joursObserves === 0
          ? 'Aucune journée de trade relevée.'
          : 'Aucun trade chiffré : saisissez l’entrée et la sortie en SOL pour avoir un résultat réel.',
    }
  }

  if (etat.tradesIncomplets > 0) {
    return {
      code: 'montants',
      message: `${etat.tradesIncomplets} ${
        etat.tradesIncomplets > 1 ? 'trades pris n’ont' : 'trade pris n’a'
      } pas de montants : le résultat réel ne ${
        etat.tradesIncomplets > 1 ? 'les' : 'le'
      } compte pas.`,
    }
  }

  if (etat.ecartPct !== null && Math.abs(etat.ecartPct) >= SEUIL_ALERTE_ECART) {
    return {
      code: 'ecart',
      message:
        etat.ecartPct < 0
          ? `Le réel rend ${Math.abs(Math.round(etat.ecartPct))} % de moins que ce que le test annonçait : la simulation est optimiste sur ce wallet.`
          : `Le réel rend ${Math.round(etat.ecartPct)} % de plus que ce que le test annonçait : la simulation sous-estime ce wallet.`,
    }
  }

  return null
}
