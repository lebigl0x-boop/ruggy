/**
 * Ce qu'un wallet montre de lui-même : dans la liste, et sur sa carte.
 *
 * Un wallet se résume par **sa phase en cours**, et par elle seule. Un wallet
 * en trade montre son résultat réel, un wallet en test son résultat simulé —
 * jamais les deux additionnés. Les phases précédentes restent consultables sur
 * sa page, en petit, comme référence.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import {
  bilanSimule,
  bilanTest,
  bilanTrade,
  type BilanSimule,
  type BilanTest,
  type BilanTrade,
  type Point,
} from './calcul'
import {
  issuesScreening,
  joursTest,
  type Phase,
  type WalletComplet,
} from './repo/types'

/** Les trois bilans d'un wallet, tenus séparés. */
export type Bilans = {
  screening: BilanSimule
  test: BilanTest
  trade: BilanTrade
}

export function bilans(wallet: WalletComplet): Bilans {
  return {
    screening: bilanSimule(issuesScreening(wallet), wallet.reglages),
    test: bilanTest(joursTest(wallet), wallet.reglages),
    trade: bilanTrade(wallet.trades, wallet.reglages),
  }
}

export type ResumeWallet = {
  id: string
  nom: string
  adresse: string
  phase: Phase
  /** Résultat de la phase en cours, en SOL. */
  resultat: number
  /** Ce résultat est de l'argent compté et non une simulation. */
  reel: boolean
  /** La courbe de la phase en cours. Vide tant qu'il n'y a rien. */
  courbe: Point[]
  /** Avancement dans la phase en cours, face à son repère. `null` hors phase. */
  avancement: { fait: number; repere: number } | null
  /** Taux au TP de la phase en cours, en %. */
  tauxTp: number
  /** Lancements ou trades de la phase en cours. */
  lignes: number
  /** Rendement sur le capital engagé, en %. Phase trade seulement. */
  rendement: number | null
  /** Le taux observé passe le seuil de rentabilité. */
  rentable: boolean
  /** Règle d'arrêt déclenchée. Phase trade seulement. */
  alerteArret: boolean
}

/**
 * Le wallet vu par sa phase en cours.
 *
 * Un wallet archivé montre le dernier lot qui a quelque chose à dire : on
 * l'archive après coup, et son historique ne doit pas devenir illisible pour
 * autant.
 */
export function resumer(wallet: WalletComplet, prets = bilans(wallet)): ResumeWallet {
  const { screening, test, trade } = prets
  const identite = {
    id: wallet.id,
    nom: wallet.nom,
    adresse: wallet.adresse,
    phase: wallet.phase,
  }

  const phase = wallet.phase === 'archive' ? phaseVisible(prets) : wallet.phase

  if (phase === 'trade') {
    return {
      ...identite,
      resultat: trade.resultat,
      reel: true,
      courbe: trade.parTrade,
      avancement: null,
      tauxTp: trade.tauxTp,
      lignes: trade.trades,
      rendement: trade.rendement,
      rentable: trade.resultat > 0,
      alerteArret: trade.alerteArret,
    }
  }

  if (phase === 'test') {
    return {
      ...identite,
      resultat: test.resultat,
      reel: false,
      courbe: test.courbeParJour,
      avancement: { fait: test.joursObserves, repere: wallet.joursTest },
      tauxTp: test.tauxTp,
      lignes: test.tokens,
      rendement: null,
      rentable: test.rentable,
      alerteArret: false,
    }
  }

  return {
    ...identite,
    resultat: screening.resultat,
    reel: false,
    courbe: screening.courbe,
    avancement: { fait: screening.tokens, repere: wallet.tokensScreening },
    tauxTp: screening.tauxTp,
    lignes: screening.tokens,
    rendement: null,
    rentable: screening.rentable,
    alerteArret: false,
  }
}

/** Le lot le plus avancé qui porte quelque chose. */
function phaseVisible(prets: Bilans): Exclude<Phase, 'archive'> {
  if (prets.trade.trades > 0) return 'trade'
  if (prets.test.joursObserves > 0) return 'test'
  return 'screening'
}

/**
 * Les trois totaux du tableau de bord.
 *
 * Ils sont renvoyés séparément et le restent à l'écran : additionner un
 * résultat compté et deux résultats simulés donnerait un nombre que rien ne
 * vérifie. Les wallets archivés comptent : leur historique reste vrai.
 */
export type Totaux = {
  /** Résultat réel, tous wallets confondus. */
  reel: number
  /** Résultat simulé du lot de test. */
  test: number
  /** Résultat simulé de l'échantillon de screening. */
  screening: number
  /** Trades réellement joués. */
  trades: number
  /** Journées de test relevées. */
  jours: number
  /** Combien de wallets dans chaque phase. */
  parPhase: Record<Phase, number>
}

/**
 * Les deux courbes du portefeuille, agrégées par date.
 *
 * Deux et non une : l'une compte de l'argent, l'autre en simule. Les
 * superposer sur le même axe laisserait croire qu'on peut les comparer point
 * à point — elles ne portent pas sur les mêmes jours ni sur les mêmes
 * décisions.
 *
 * Deux wallets relevés le même jour donnent un seul point : la question à
 * laquelle elles répondent est « qu'est-ce que ma journée a donné », pas
 * « qu'a fait chaque wallet ».
 *
 * Le screening n'a pas de courbe ici : son échantillon est choisi dans le
 * passé, il n'a pas de dates à aligner.
 */
export type Courbes = { reel: Point[]; test: Point[] }

export function courbes(wallets: readonly WalletComplet[]): Courbes {
  const parDate = { reel: new Map<string, number>(), test: new Map<string, number>() }

  const empiler = (cumul: Map<string, number>, points: readonly Point[]) => {
    for (const point of points) {
      cumul.set(point.repere, (cumul.get(point.repere) ?? 0) + point.resultat)
    }
  }

  for (const wallet of wallets) {
    const { test, trade } = bilans(wallet)
    empiler(parDate.test, test.courbeParJour)
    empiler(parDate.reel, trade.parTrade)
  }

  return { reel: tracer(parDate.reel), test: tracer(parDate.test) }
}

/** Les dates cumulées, remises dans l'ordre du temps. */
function tracer(parDate: ReadonlyMap<string, number>): Point[] {
  let cumul = 0
  return [...parDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repere, resultat]) => {
      cumul += resultat
      return { repere, resultat, cumul }
    })
}

export function totaux(wallets: readonly WalletComplet[]): Totaux {
  const depart: Totaux = {
    reel: 0,
    test: 0,
    screening: 0,
    trades: 0,
    jours: 0,
    parPhase: { screening: 0, test: 0, trade: 0, archive: 0 },
  }

  return wallets.reduce((cumul, wallet) => {
    const { screening, test, trade } = bilans(wallet)
    return {
      reel: cumul.reel + trade.resultat,
      test: cumul.test + test.resultat,
      screening: cumul.screening + screening.resultat,
      trades: cumul.trades + trade.trades,
      jours: cumul.jours + test.joursObserves,
      parPhase: {
        ...cumul.parPhase,
        [wallet.phase]: cumul.parPhase[wallet.phase] + 1,
      },
    }
  }, depart)
}
