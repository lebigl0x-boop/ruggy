/**
 * Cœur de calcul de Ruggers.
 *
 * Tout ce fichier est constitué de fonctions pures : pas d'accès base, pas de
 * date « maintenant », pas de React. C'est volontaire — c'est la seule partie
 * de l'app dont les résultats doivent être reproductibles et testables à 100 %.
 *
 * Les nombres sont renvoyés bruts (non arrondis). L'arrondi est une décision
 * d'affichage, il appartient à lib/format.ts.
 */

/** Réglages de stratégie, propres à chaque wallet. */
export type Strategy = {
  /** Mise engagée par trade, en SOL. */
  mise: number
  /**
   * Montée minimum, en %, pour qu'un lancement compte comme réussi.
   * C'est un seuil, pas un plafond : au-dessus, le gain réel est encaissé.
   */
  objectif: number
  /**
   * Perte par défaut quand un lancement n'atteint pas l'objectif, en %.
   * Chaque token peut la remplacer par la sienne.
   */
  perteRug: number
  /** Frais fixes par trade, en SOL. */
  frais: number
  /** Taux à l'objectif visé, en % (seuil du tag « Rentable »). */
  tauxVise: number
}

/** Un lancement analysé, réduit aux seuls champs qui entrent dans le calcul. */
export type TokenInput = {
  /** % de montée depuis le buy. `null` = non noté, le token est ignoré. */
  gain: number | null
  /**
   * Perte subie sur ce lancement précis, en %.
   * `null` = on reprend la perte par défaut du wallet.
   */
  perteRug: number | null
  /** Délai avant dump, en minutes. `null` = non renseigné. */
  delay: number | null
  /**
   * Le token a été pris.
   *
   * Un token non pris reste une observation du wallet — il a bien lancé, il
   * compte dans son activité et dans son taux à l'objectif — mais son
   * résultat n'entre pas dans le PNL, puisque aucun SOL n'a été engagé.
   * C'est ce qui permet de mesurer un filtre d'entrée : le wallet est jugé
   * sur tout ce qu'il fait, le résultat sur ce qu'on lui a pris.
   */
  pris: boolean

  /**
   * SOL réellement engagé sur ce trade. Absent ou `null` hors phase active.
   *
   * Dès que le couple entrée/sortie est renseigné, il remplace entièrement
   * la simulation : ni `mise`, ni `frais`, ni `perteRug` n'interviennent
   * plus. C'est voulu — un trade réel ne se devine pas depuis une mise
   * théorique, et prétendre le contraire donnerait un PNL faux de façon
   * invisible.
   */
  entreeSol?: number | null
  /** SOL réellement récupéré à la sortie, frais et slippage compris. */
  sortieSol?: number | null
}

/** Résultat d'un token noté. */
export type TokenResult = {
  /** Résultat en % de la mise. */
  percent: number
  /** Résultat en SOL, frais déduits. */
  sol: number
  /** Le token a atteint l'objectif. */
  hit: boolean
  /**
   * Le résultat vient de montants réellement engagés, et non de la
   * simulation. Un bilan qui mélangerait les deux ne voudrait rien dire :
   * c'est ce drapeau qui permet de les compter à part.
   */
  reel: boolean
}

/** Une ligne du tableau, alignée sur l'ordre des tokens fournis. */
export type ReportRow = {
  /**
   * Résultat du lancement, `null` s'il n'est pas noté.
   *
   * Il est calculé même quand le token n'est pas pris : c'est ce qu'il aurait
   * rapporté ou coûté, et c'est à l'écran la seule façon de voir ce que le
   * filtre a évité.
   */
  result: TokenResult | null
  /** Le token a été pris. Seuls les pris entrent dans le PNL. */
  pris: boolean
  /**
   * Cumul en SOL après ce token. `null` sur les tokens non notés et sur les
   * tokens non pris, qui ne font pas bouger la courbe.
   */
  cumulSol: number | null
}

export type Regularite = 'Régulier' | 'Variable' | 'Irrégulier'

export type Tag =
  | 'À compléter'
  | 'Rentable'
  | 'Limite'
  | 'À surveiller'
  | 'Pas rentable'

/** Tag fixé à la main, qui prend le pas sur le tag automatique. */
export type TagOverride = 'rentable' | 'surveiller' | 'pas'

export type WalletReport = {
  /** Une ligne par token fourni, dans le même ordre. */
  rows: ReportRow[]
  /** Nombre de tokens notés, pris ou non : ce que le wallet a lancé. */
  n: number
  /** Nombre de tokens notés et pris : ce qui a réellement été joué. */
  nPris: number
  /**
   * Parmi les tokens pris, ceux dont le résultat vient de montants réels.
   * Face à `nPris`, il dit quelle part du net est de l'argent compté.
   */
  nReels: number
  /** Nombre de tokens notés ayant atteint l'objectif, pris ou non. */
  hits: number
  /** Taux à l'objectif, en % (0 si aucun token noté). Mesure le wallet. */
  taux: number
  /** Résultat net cumulé sur les tokens pris, en SOL. */
  netSol: number
  /**
   * Résultat net si tous les tokens avaient été pris, en SOL.
   * Égal à `netSol` tant qu'aucun token n'est écarté.
   */
  netSolTout: number
  /**
   * Ce que le fait d'écarter des tokens a rapporté, en SOL (`netSol` −
   * `netSolTout`). Positif = le filtre évite plus de pertes qu'il ne manque
   * de gains.
   */
  apportFiltre: number
  /** Résultat net en €, ou `null` si le prix du SOL n'est pas renseigné. */
  netEur: number | null
  /** Résultat moyen par token pris, en SOL. */
  moyenneSol: number
  /** Projection du net sur 100 tokens pris, en SOL. */
  projection100: number
  /**
   * Taux à l'objectif minimum pour être à l'équilibre, en %.
   *
   * Mesuré sur les seuls tokens pris : c'est le seuil de *ta* stratégie,
   * filtre compris. Le comparer à `taux`, qui porte sur tout ce que le
   * wallet lance, n'a de sens que si tu prends tout.
   *
   * `null` quand un trade gagnant ne rapporte rien (frais trop lourds) :
   * aucun taux de réussite ne rend la stratégie rentable.
   */
  seuilRentabilite: number | null
  /** Délai moyen avant dump, en minutes. `null` si aucun délai renseigné. */
  delaiMoyen: number | null
  /** Régularité des délais. `null` en dessous de 3 délais renseignés. */
  regularite: Regularite | null
  /** Coefficient de variation des délais (écart-type / moyenne). */
  coefficientVariation: number | null
  /** Tag déduit des chiffres. */
  autoTag: Tag
  /** Tag affiché : le tag manuel s'il existe, sinon le tag automatique. */
  effectiveTag: Tag
  /** Nombre de tokens notés attendus avant de juger un wallet. */
  seuilAnalyse: number
}

/**
 * Les montants réels d'un trade, quand ils sont utilisables.
 *
 * Une entrée nulle ou négative n'est pas un trade : elle rendrait le
 * pourcentage infini. Une sortie absente veut dire « position pas encore
 * soldée », pas « tout perdu » — on ne l'invente pas, le token reste non
 * noté jusqu'à ce que le montant soit saisi.
 */
function montantsReels(
  token: TokenInput,
): { entree: number; sortie: number } | null {
  const entree = token.entreeSol
  const sortie = token.sortieSol
  if (entree === undefined || entree === null || !Number.isFinite(entree)) return null
  if (sortie === undefined || sortie === null || !Number.isFinite(sortie)) return null
  if (entree <= 0 || sortie < 0) return null
  return { entree, sortie }
}

/** Nombre de tokens notés à partir duquel un wallet est jugeable. */
export const SEUIL_ANALYSE = 10

export const DEFAULT_STRATEGY: Strategy = {
  mise: 0.1,
  objectif: 100,
  perteRug: 90,
  frais: 0.003,
  tauxVise: 30,
}

/**
 * Résultat d'un token.
 *
 * Deux régimes, et ils ne se mélangent pas.
 *
 * **Trade réel.** Si le token porte des montants engagés, le résultat est
 * leur différence, point. C'est de l'argent compté, pas une estimation : les
 * frais de réseau, le slippage et les sorties partielles sont déjà dans les
 * chiffres. Appliquer par-dessus la mise et les frais du wallet reviendrait à
 * simuler ce qu'on a déjà mesuré.
 *
 * **Simulation.** Sinon, on rejoue le lancement avec les réglages du wallet.
 * Il n'y a alors que deux issues possibles :
 *
 * - gain >= objectif → le lancement est réussi, et il rapporte sa montée
 *                      réelle
 * - sinon            → on encaisse la perte de ce lancement
 *
 * L'objectif est un seuil de réussite, pas un plafond de gain : un token à
 * +300 % ne vaut pas la même chose qu'un token à +100 %, même si les deux
 * passent un objectif fixé à 100 %. Les plafonner reviendrait à effacer la
 * seule chose qui rend une adresse 6/4 rentable — l'ampleur de ses coups.
 *
 * La perte est propre au token, parce que tous les lancements ne se valent
 * pas. À défaut, on reprend celle du wallet.
 *
 * Le drapeau `pris` n'intervient pas ici : ce qu'un lancement a fait ne
 * dépend pas de la décision de le jouer. C'est le bilan qui écarte ensuite
 * les tokens non pris du résultat.
 *
 * Renvoie `null` si le token n'est pas noté — ni gain relevé, ni montants.
 */
export function computeTokenResult(
  token: TokenInput,
  strategy: Strategy,
): TokenResult | null {
  const note = token.gain !== null && Number.isFinite(token.gain)
  const reels = montantsReels(token)

  if (reels !== null) {
    const sol = reels.sortie - reels.entree
    const percent = (sol / reels.entree) * 100
    // L'objectif se juge sur la montée du token quand elle est relevée : il
    // dit ce que le *wallet* a fait. À défaut, on se rabat sur ce que le
    // trade a rendu, qui est au moins une mesure de la même journée.
    const hit = note ? token.gain! >= strategy.objectif : percent >= strategy.objectif
    return { percent, sol, hit, reel: true }
  }

  if (!note) return null

  const hit = token.gain! >= strategy.objectif
  const perteBrute =
    token.perteRug !== null && Number.isFinite(token.perteRug)
      ? token.perteRug
      : strategy.perteRug

  // Une perte s'écrit aussi bien « 50 » que « −50 » : on retient la grandeur.
  // Sans cela, un moins inverserait la perte en gain. Plafond à 100 % : on ne
  // perd pas plus que sa mise sur un achat au comptant.
  const perte = Math.min(100, Math.abs(perteBrute))

  const percent = hit ? token.gain! : -perte
  const sol = (strategy.mise * percent) / 100 - strategy.frais

  return { percent, sol, hit, reel: false }
}

/** Moyenne arithmétique. Les appelants garantissent une liste non vide. */
function moyenne(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Écart-type de population (divisé par n, pas n − 1). */
function ecartType(values: number[]): number {
  if (values.length === 0) return 0
  const centre = moyenne(values)
  return Math.sqrt(moyenne(values.map((v) => (v - centre) ** 2)))
}

function classerRegularite(cv: number): Regularite {
  if (cv < 0.35) return 'Régulier'
  if (cv < 0.7) return 'Variable'
  return 'Irrégulier'
}

/**
 * Taux à l'objectif minimum pour être à l'équilibre.
 *
 * Avec G le gain moyen d'un trade réussi et P la perte moyenne d'un trade
 * raté (négative), on cherche le taux t tel que t·G + (1 − t)·P = 0,
 * soit t = −P / (G − P).
 *
 * G et P sont mesurés sur les trades réellement observés : depuis que les
 * gains ne sont plus plafonnés à l'objectif, deux wallets au même taux de
 * réussite n'ont pas le même seuil d'équilibre. À défaut d'observation, on
 * se replie sur un trade pile à l'objectif et sur la perte par défaut du
 * wallet.
 *
 * Renvoie `null` si G <= 0 : un trade réussi ne rapporte rien, donc aucun
 * taux de réussite ne rattrape les pertes.
 */
function computeSeuil(
  strategy: Strategy,
  /** Résultats des réussites prises. Les tokens écartés n'y figurent pas. */
  gainsSol: number[],
  /** Résultats des ratés pris. */
  pertesSol: number[],
): number | null {
  const G =
    gainsSol.length > 0
      ? moyenne(gainsSol)
      : (strategy.mise * strategy.objectif) / 100 - strategy.frais
  if (G <= 0) return null

  const pertMoy =
    pertesSol.length > 0
      ? moyenne(pertesSol)
      : -((strategy.mise * strategy.perteRug) / 100 + strategy.frais)

  return (-pertMoy / (G - pertMoy)) * 100
}

function computeAutoTag(n: number, taux: number, netSol: number, tauxVise: number): Tag {
  if (n < SEUIL_ANALYSE) return 'À compléter'
  if (taux >= tauxVise && netSol > 0) return 'Rentable'
  if (netSol > 0) return 'Limite'
  return 'Pas rentable'
}

const OVERRIDE_TO_TAG: Record<TagOverride, Tag> = {
  rentable: 'Rentable',
  surveiller: 'À surveiller',
  pas: 'Pas rentable',
}

/** Traduit un tag manuel en tag affichable. */
export function tagFromOverride(override: TagOverride): Tag {
  return OVERRIDE_TO_TAG[override]
}

export type ReportOptions = {
  /** Tag fixé à la main. */
  tagOverride?: TagOverride | null
  /** Prix du SOL en €, pour la conversion du net. */
  solPriceEur?: number | null
}

/** Bilan complet d'un wallet, à partir de ses tokens dans l'ordre d'affichage. */
export function computeWalletReport(
  tokens: readonly TokenInput[],
  strategy: Strategy,
  options: ReportOptions = {},
): WalletReport {
  const rows: ReportRow[] = []
  const gainsSol: number[] = []
  const pertesSol: number[] = []
  let cumul = 0
  let cumulTout = 0
  let n = 0
  let nPris = 0
  let nReels = 0
  let hits = 0

  for (const token of tokens) {
    const result = computeTokenResult(token, strategy)
    if (result === null) {
      rows.push({ result: null, pris: token.pris, cumulSol: null })
      continue
    }

    // Le wallet est jugé sur tout ce qu'il a lancé, pris ou non.
    n += 1
    cumulTout += result.sol
    if (result.hit) hits += 1

    if (!token.pris) {
      rows.push({ result, pris: false, cumulSol: null })
      continue
    }

    // À partir d'ici, le token a été joué : il compte dans le résultat.
    nPris += 1
    if (result.reel) nReels += 1
    cumul += result.sol
    if (result.hit) gainsSol.push(result.sol)
    else pertesSol.push(result.sol)

    rows.push({ result, pris: true, cumulSol: cumul })
  }

  const netSol = cumul
  const taux = n > 0 ? (hits / n) * 100 : 0
  const moyenneSol = nPris > 0 ? netSol / nPris : 0

  const delais = tokens
    .map((t) => t.delay)
    .filter((d): d is number => d !== null && Number.isFinite(d))

  const delaiMoyen =
    delais.length > 0
      ? delais.reduce((a, b) => a + b, 0) / delais.length
      : null

  // En dessous de 3 délais, la dispersion ne veut rien dire.
  const coefficientVariation =
    delais.length >= 3 && delaiMoyen !== null && delaiMoyen > 0
      ? ecartType(delais) / delaiMoyen
      : null

  const autoTag = computeAutoTag(n, taux, netSol, strategy.tauxVise)
  const override = options.tagOverride ?? null
  const solPriceEur = options.solPriceEur ?? null

  return {
    rows,
    n,
    nPris,
    nReels,
    hits,
    taux,
    netSol,
    netSolTout: cumulTout,
    apportFiltre: netSol - cumulTout,
    netEur: solPriceEur !== null ? netSol * solPriceEur : null,
    moyenneSol,
    projection100: moyenneSol * 100,
    seuilRentabilite: computeSeuil(strategy, gainsSol, pertesSol),
    delaiMoyen,
    regularite:
      coefficientVariation !== null
        ? classerRegularite(coefficientVariation)
        : null,
    coefficientVariation,
    autoTag,
    effectiveTag: override !== null ? tagFromOverride(override) : autoTag,
    seuilAnalyse: SEUIL_ANALYSE,
  }
}

/** Phrase d'explication du tag, affichée sous le résultat net. */
export function explainTag(report: WalletReport, strategy: Strategy): string {
  const taux = Math.round(report.taux)
  const vise = Math.round(strategy.tauxVise)

  switch (report.effectiveTag) {
    case 'À compléter':
      return `Encore ${report.seuilAnalyse - report.n} ${
        report.seuilAnalyse - report.n > 1 ? 'tokens' : 'token'
      } à noter pour juger ce wallet.`
    case 'Rentable':
      return `${taux} % des tokens atteignent l'objectif, au-dessus des ${vise} % visés.`
    case 'Limite':
      return `Positif, mais ${taux} % des tokens atteignent l'objectif, sous les ${vise} % visés.`
    case 'À surveiller':
      return 'Wallet marqué à surveiller à la main.'
    case 'Pas rentable':
      return report.netSol <= 0
        ? 'Sur la durée, cette stratégie perd de l\'argent sur ce wallet.'
        : 'Wallet marqué comme pas rentable à la main.'
  }
}
