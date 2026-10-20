/**
 * Tout le calcul de Ruggers, en un seul fichier.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 * C'est la seule partie de l'app dont les résultats doivent être reproductibles
 * et testables à 100 %.
 *
 * Les nombres sont renvoyés bruts, non arrondis — l'arrondi est une décision
 * d'affichage et appartient à `lib/format.ts`. Les taux et pourcentages sont
 * exprimés en pour-cent (0 à 100), jamais en ratio : c'est ce qui permet de
 * comparer directement le taux au TP et le seuil de rentabilité.
 *
 * Règle qui tient tout le fichier : **screening, test et trade ne
 * s'additionnent jamais**. Chaque lot a sa fonction de bilan, et aucune ne
 * reçoit les tokens d'un autre. Le screening est un échantillon choisi à la
 * main, donc flatteur par construction ; le test est exhaustif mais simulé ; le
 * trade est le seul lot où du SOL est réellement sorti du portefeuille.
 */

/** Réglages de stratégie, propres à chaque wallet. */
export type Reglages = {
  /** Mise engagée par trade, en SOL. */
  mise: number
  /** Take-profit visé, en %. Un lancement qui l'atteint est un `tp`. */
  tp: number
  /** Frais fixes par trade, en SOL. */
  frais: number
}

/**
 * L'issue d'un lancement, et toute la saisie.
 *
 * La v1 notait un gain continu en pourcentage, puis le comparait à un objectif.
 * Deux issues suffisent : on vise un multiple, on l'atteint ou non. Ce qui se
 * passe entre les deux ne change pas la décision de sortie.
 */
export type Issue = 'tp' | 'rate'

/** Réglages d'un nouveau wallet. Modifiables wallet par wallet ensuite. */
export const DEFAUTS: Reglages = { mise: 0.05, tp: 300, frais: 0.008 }

/** Nombre de trades récents que regarde la règle d'arrêt. */
export const DERNIERS_TRADES = 5

/** En dessous de ce nombre de gagnants sur la fenêtre, l'app alerte. */
export const GAGNANTS_MINIMUM = 2

// ---------------------------------------------------------------------------
// Le résultat d'un lancement simulé
// ---------------------------------------------------------------------------

/**
 * Ce que rapporte un lancement réussi, en SOL.
 * `mise × tp / 100 − frais`
 */
export function gainTp(r: Reglages): number {
  return (r.mise * r.tp) / 100 - r.frais
}

/**
 * Ce que coûte un lancement raté, en SOL, en valeur positive.
 * `mise + frais`
 *
 * Un raté coûte la mise entière : on vise un multiple, et un lancement qui ne
 * l'atteint pas finit à zéro. Les frais s'ajoutent, ils sont payés quoi qu'il
 * arrive.
 */
export function perteRate(r: Reglages): number {
  return r.mise + r.frais
}

/** Le résultat d'un lancement simulé, en SOL. Positif pour un `tp`. */
export function resultatToken(issue: Issue, r: Reglages): number {
  return issue === 'tp' ? gainTp(r) : -perteRate(r)
}

/**
 * Taux au TP minimum pour être à l'équilibre, en %.
 *
 * Avec G le gain d'un lancement réussi et P le coût d'un raté (tous deux
 * positifs), on cherche le taux t tel que `t·G − (1 − t)·P = 0`, soit
 * `t = P / (G + P)`.
 *
 * Le dénominateur se simplifie en `mise × (1 + tp / 100)` : les frais s'en vont.
 * Il n'est nul que si la mise est nulle — d'où le `null`, plutôt qu'un infini
 * silencieux.
 *
 * Le résultat peut dépasser 100 % quand les frais mangent le gain : aucun taux
 * de réussite ne rend alors la stratégie rentable. On renvoie la valeur telle
 * quelle, c'est à l'écran de le dire.
 */
export function seuilRentabilite(r: Reglages): number | null {
  const denominateur = gainTp(r) + perteRate(r)
  if (denominateur <= 0) return null
  return (perteRate(r) / denominateur) * 100
}

// ---------------------------------------------------------------------------
// Bilan d'un lot simulé : screening et test
// ---------------------------------------------------------------------------

/** Un point de courbe cumulée. */
export type Point = {
  /** Ce que ce point représente : un numéro de token, ou une date. */
  repere: string
  /** Résultat de ce point seul, en SOL. */
  resultat: number
  /** Résultat cumulé depuis le début du lot, en SOL. */
  cumul: number
}

export type BilanSimule = {
  /** Lancements notés dans ce lot. */
  tokens: number
  tp: number
  rate: number
  /** Résultat du lot, en SOL. */
  resultat: number
  /** Part des lancements qui atteignent le TP, en %. */
  tauxTp: number
  /** Résultat moyen par lancement, en SOL. */
  moyenneParToken: number
  /** Taux au TP à atteindre pour être à l'équilibre, en %. */
  seuil: number | null
  /** Le taux observé passe le seuil. Faux tant qu'aucun lancement n'est noté. */
  rentable: boolean
  /** La courbe, lancement par lancement, dans l'ordre reçu. */
  courbe: Point[]
}

/**
 * Bilan d'un lot simulé, à partir des issues de ses lancements.
 *
 * L'ordre reçu est l'ordre de la courbe : c'est à l'appelant de trier s'il veut
 * un ordre particulier.
 */
export function bilanSimule(
  issues: readonly Issue[],
  r: Reglages,
): BilanSimule {
  const courbe: Point[] = []
  let cumul = 0
  let tp = 0

  issues.forEach((issue, index) => {
    const resultat = resultatToken(issue, r)
    cumul += resultat
    if (issue === 'tp') tp += 1
    courbe.push({ repere: String(index + 1), resultat, cumul })
  })

  const tokens = issues.length
  const tauxTp = tokens > 0 ? (tp / tokens) * 100 : 0
  const seuil = seuilRentabilite(r)

  return {
    tokens,
    tp,
    rate: tokens - tp,
    resultat: cumul,
    tauxTp,
    moyenneParToken: tokens > 0 ? cumul / tokens : 0,
    seuil,
    rentable: tokens > 0 && seuil !== null && tauxTp >= seuil,
    courbe,
  }
}

// ---------------------------------------------------------------------------
// Bilan de la phase de test
// ---------------------------------------------------------------------------

/**
 * Une journée relevée.
 *
 * Une journée sans lancement garde sa place avec une liste vide : c'est tout
 * l'intérêt de l'avoir enregistrée. Sans elle, le décompte des jours observés
 * serait faux et la moyenne par jour flatteuse.
 */
export type JourTest = {
  /** AAAA-MM-JJ */
  jour: string
  issues: readonly Issue[]
}

export type JourResultat = {
  jour: string
  /** Lancements relevés ce jour-là. */
  tokens: number
  tp: number
  /** Résultat de la journée, en SOL. */
  resultat: number
  /** Résultat cumulé depuis la première journée, en SOL. */
  cumul: number
}

export type BilanTest = BilanSimule & {
  /** Journées relevées, journées sans lancement comprises. */
  joursObserves: number
  joursSansLancement: number
  /** Résultat moyen par journée observée, journées creuses comprises. */
  moyenneParJour: number
  /** Une ligne par journée, de la plus ancienne à la plus récente. */
  parJour: JourResultat[]
  /** La courbe du test suit les journées, pas les lancements. */
  courbeParJour: Point[]
}

/**
 * Bilan de la phase de test.
 *
 * Les journées sont triées par date : la courbe suit le temps, pas l'ordre
 * d'insertion en base.
 */
export function bilanTest(
  jours: readonly JourTest[],
  r: Reglages,
): BilanTest {
  const ordonnees = [...jours].sort((a, b) => a.jour.localeCompare(b.jour))

  const base = bilanSimule(
    ordonnees.flatMap((journee) => [...journee.issues]),
    r,
  )

  const parJour: JourResultat[] = []
  const courbeParJour: Point[] = []
  let cumul = 0

  for (const journee of ordonnees) {
    const tp = journee.issues.filter((issue) => issue === 'tp').length
    const resultat = journee.issues.reduce(
      (somme, issue) => somme + resultatToken(issue, r),
      0,
    )
    cumul += resultat

    parJour.push({ jour: journee.jour, tokens: journee.issues.length, tp, resultat, cumul })
    courbeParJour.push({ repere: journee.jour, resultat, cumul })
  }

  const joursObserves = ordonnees.length

  return {
    ...base,
    joursObserves,
    joursSansLancement: ordonnees.filter((journee) => journee.issues.length === 0).length,
    moyenneParJour: joursObserves > 0 ? base.resultat / joursObserves : 0,
    parJour,
    courbeParJour,
  }
}

// ---------------------------------------------------------------------------
// Bilan de la phase de trade
// ---------------------------------------------------------------------------

/**
 * Un trade réellement joué.
 *
 * Le résultat est `sortieSol − entreeSol`, et rien d'autre : les frais de
 * réseau et le slippage sont déjà dans les montants. Les réglages du wallet
 * n'interviennent pas — les appliquer par-dessus reviendrait à simuler ce qu'on
 * a déjà mesuré.
 */
export type Trade = {
  /** AAAA-MM-JJ */
  date: string
  entreeSol: number
  sortieSol: number
  issue: Issue
  /**
   * Les capitalisations du token, dans l'unité où elles ont été relevées — des
   * dollars en pratique, parce que c'est ce qu'affichent les graphiques.
   *
   * L'unité n'entre jamais dans un calcul : seuls des rapports en sortent, et
   * un rapport est sans unité. Mélanger du dollar et du SOL d'une ligne à
   * l'autre ne fausserait donc aucun multiple — tant que les trois chiffres
   * d'une même ligne sont lus sur la même échelle.
   *
   * `null` partout tant qu'un trade n'est pas chiffré : c'est une saisie
   * facultative, et l'absence se lit comme une absence, pas comme un zéro.
   */
  mcEntree?: number | null
  mcSortie?: number | null
  /** Plus haute capitalisation atteinte après l'entrée. */
  mcAth?: number | null
}

/**
 * Le multiple réellement fait sur le token : sortie rapportée à l'entrée.
 *
 * C'est le mouvement du token, pas celui du portefeuille. Les deux coïncident
 * quand la position est prise et soldée d'un bloc, et divergent dès qu'une
 * sortie est partielle — raison de plus pour garder le PNL comme seule source
 * du résultat en SOL.
 */
export function multipleRealise(trade: Trade): number | null {
  const entree = trade.mcEntree
  const sortie = trade.mcSortie
  if (!entree || entree <= 0 || !sortie || sortie <= 0) return null
  return sortie / entree
}

/**
 * Le multiple maximal qu'offrait le token : son sommet rapporté à l'entrée.
 *
 * C'est un plafond, pas un regret : personne ne sort au sommet à la seconde.
 * Il sert à mesurer la part du mouvement captée, trade après trade.
 *
 * Un ATH noté en dessous de la sortie est une faute de saisie, pas une
 * information : le plus haut connu est alors la sortie elle-même, et c'est
 * elle qu'on retient plutôt que de renvoyer un plafond sous le réalisé.
 */
export function multipleMax(trade: Trade): number | null {
  const entree = trade.mcEntree
  if (!entree || entree <= 0) return null
  const ath = trade.mcAth
  if (!ath || ath <= 0) return null
  const sommet = Math.max(ath, trade.mcSortie && trade.mcSortie > 0 ? trade.mcSortie : 0)
  return sommet / entree
}

/**
 * Ce que ce trade aurait rendu soldé au sommet, en SOL.
 *
 * `engagé × (multiple max − 1)` : le gain d'une sortie parfaite, frais de
 * réseau non déduits une seconde fois — ils sont déjà dans le montant engagé.
 */
export function potentielTrade(trade: Trade): number | null {
  const max = multipleMax(trade)
  if (max === null) return null
  return trade.entreeSol * (max - 1)
}

export type BilanTrade = {
  trades: number
  tp: number
  /** Résultat réel, en SOL : `récupéré − engagé`. */
  resultat: number
  /** SOL réellement sorti du portefeuille. */
  engage: number
  /** SOL réellement rentré. */
  recupere: number
  /** Rendement sur le capital engagé, en %. `null` si rien n'est engagé. */
  rendement: number | null
  tauxTp: number
  /**
   * Ce que la stratégie simulée prédisait sur **exactement** ces trades, en
   * SOL. C'est la seule comparaison valable : mesurer le réel sur dix trades
   * contre un simulé sur quinze ne dirait rien.
   */
  prevuParTest: number
  /**
   * L'écart au prévu, en %. Négatif = le test était optimiste.
   * `null` quand le prévu est nul : on ne divise pas par zéro pour faire joli.
   */
  ecartPct: number | null
  /**
   * Règle d'arrêt : un gagnant ou moins sur les derniers trades. Simple
   * information, rien n'est bloqué.
   */
  alerteArret: boolean
  /** Les trades les plus récents regardés par la règle d'arrêt. */
  fenetreArret: number
  parTrade: Point[]

  // --- Ce que les capitalisations ajoutent, quand elles sont saisies -------

  /** Trades dont l'entrée **et** la sortie en capitalisation sont chiffrées. */
  avecMultiple: number
  /** Moyenne des multiples réalisés. `null` tant qu'aucun trade n'est chiffré. */
  multipleMoyen: number | null
  /** Trades dont l'entrée **et** l'ATH sont chiffrés. */
  avecAth: number
  /** Moyenne des multiples maximaux offerts. */
  multipleMaxMoyen: number | null
  /**
   * Ce que les trades chiffrés auraient rendu soldés au sommet, en SOL.
   *
   * Somme sur les seuls trades à ATH connu — comparer un potentiel partiel à
   * un résultat complet gonflerait le manque d'autant de trades non chiffrés.
   */
  potentiel: number | null
  /** Le résultat réel sur ces mêmes trades, seul terme comparable au potentiel. */
  resultatComparable: number | null
  /** `potentiel − résultat` : ce qui est resté sur la table, en SOL. */
  manque: number | null
  /** Part du potentiel réellement captée, en %. `null` si le potentiel est nul. */
  capture: number | null
}

/** Bilan de la phase active, à partir des trades joués. */
export function bilanTrade(trades: readonly Trade[], r: Reglages): BilanTrade {
  // Tri stable par date : à date égale, l'ordre reçu est conservé.
  const ordonnes = [...trades].sort((a, b) => a.date.localeCompare(b.date))

  const parTrade: Point[] = []
  let cumul = 0
  let engage = 0
  let recupere = 0
  let tp = 0
  let prevuParTest = 0

  // Les deux lots chiffrés, tenus à part : un multiple moyen calculé sur les
  // seuls trades renseignés n'a rien à voir avec une moyenne sur tous.
  const multiples: number[] = []
  const maxima: number[] = []
  let potentiel = 0
  let resultatComparable = 0

  for (const trade of ordonnes) {
    const resultat = trade.sortieSol - trade.entreeSol
    cumul += resultat
    engage += trade.entreeSol
    recupere += trade.sortieSol
    if (trade.issue === 'tp') tp += 1
    prevuParTest += resultatToken(trade.issue, r)

    const multiple = multipleRealise(trade)
    if (multiple !== null) multiples.push(multiple)

    const max = multipleMax(trade)
    if (max !== null) {
      maxima.push(max)
      potentiel += trade.entreeSol * (max - 1)
      resultatComparable += resultat
    }

    parTrade.push({ repere: trade.date, resultat, cumul })
  }

  const moyenne = (valeurs: readonly number[]): number | null =>
    valeurs.length > 0
      ? valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length
      : null

  const nombre = ordonnes.length
  const ecart = cumul - prevuParTest

  // La règle d'arrêt ne se prononce pas avant d'avoir sa fenêtre complète :
  // deux ratés d'affilée sur trois trades ne disent rien.
  const fenetre = ordonnes.slice(-DERNIERS_TRADES)
  const gagnantsRecents = fenetre.filter((trade) => trade.issue === 'tp').length

  return {
    trades: nombre,
    tp,
    resultat: cumul,
    engage,
    recupere,
    rendement: engage > 0 ? (cumul / engage) * 100 : null,
    tauxTp: nombre > 0 ? (tp / nombre) * 100 : 0,
    prevuParTest,
    ecartPct: prevuParTest !== 0 ? (ecart / Math.abs(prevuParTest)) * 100 : null,
    alerteArret:
      fenetre.length >= DERNIERS_TRADES && gagnantsRecents < GAGNANTS_MINIMUM,
    fenetreArret: fenetre.length,
    parTrade,

    avecMultiple: multiples.length,
    multipleMoyen: moyenne(multiples),
    avecAth: maxima.length,
    multipleMaxMoyen: moyenne(maxima),
    potentiel: maxima.length > 0 ? potentiel : null,
    resultatComparable: maxima.length > 0 ? resultatComparable : null,
    manque: maxima.length > 0 ? potentiel - resultatComparable : null,
    capture: potentiel > 0 ? (resultatComparable / potentiel) * 100 : null,
  }
}
