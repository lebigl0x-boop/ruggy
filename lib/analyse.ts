/**
 * L'analyse d'une journée : des swaps bruts aux lignes du tableau.
 *
 * Fonctions pures — pas de base, pas de réseau, pas de date « maintenant ».
 * Les appels Helius vivent dans `lib/helius/appels.ts`, la lecture de leurs
 * réponses dans `lib/helius/swaps.ts` ; ici on ne manipule que des `Swap` déjà
 * normalisés.
 *
 * Les formules de `lib/calcul.ts` ne sont pas touchées : le résultat simulé
 * d'une journée analysée se calcule en passant ses issues à `bilanSimule`,
 * exactement comme une journée saisie à la main.
 */

import type { Issue } from './calcul'
import { WSOL, type Swap } from './helius/swaps'

// ---------------------------------------------------------------------------
// Réglages de l'analyse — tout ce qui se change sans toucher au reste
// ---------------------------------------------------------------------------

/** Fenêtre de recherche de l'ATH après l'achat, en heures. */
export const FENETRE_ATH_HEURES = 6

/**
 * Pages lues au maximum par token pour l'ATH.
 *
 * Mesuré sur un token actif : 600 transactions en 6 pages pour une heure. La
 * fenêtre de 6 h ne tient donc pas toujours dans ce budget — d'où le drapeau
 * `partiel`. Comme les pages arrivent dans l'ordre chronologique, les
 * premières couvrent les premières minutes, là où l'ATH se produit
 * généralement : la troncature penche du côté prudent.
 */
export const PAGES_MAX_PAR_TOKEN = 40

/** Pages lues au maximum pour l'historique d'une journée de wallet. */
export const PAGES_MAX_JOURNEE = 20

/**
 * Tokens analysés de front.
 *
 * Trois : au-delà, le limiteur de débit devient le goulot et les fils
 * supplémentaires attendent leur jeton sans rien gagner. En deçà, les
 * latences réseau ne se recouvrent pas.
 */
export const TOKENS_EN_PARALLELE = 3

/**
 * Sur quel sommet l'issue se décide.
 *
 * `brut` : le plus haut « high », mèches comprises — ce que le marché a touché.
 * `executable` : le plus haut cours de clôture, donc un prix qui a tenu jusqu'au
 * bout de sa minute.
 *
 * Par défaut `brut`. Décider sur la clôture s'était révélé trop sévère : sur ces
 * tokens, le sommet est souvent une pointe d'une minute, et la clôture de cette
 * minute-là est déjà redescendue. Les deux valeurs restent calculées et
 * affichées : basculer cette constante ne demande aucune réanalyse.
 */
export const BASE_ISSUE: 'executable' | 'brut' = 'brut'

/** Pools interrogées au maximum par token, de la plus liquide à la moins. */
export const POOLS_MAX_PAR_TOKEN = 3

/** Au-delà, le multiple est trop beau pour être vrai : on fait vérifier. */
export const MULTIPLE_ABERRANT = 1000

/**
 * Marge de fin de fenêtre, en secondes.
 *
 * Un sommet trouvé tout à la fin peut n'être qu'un début de montée : la suite
 * est hors champ. On ne tranche pas, on fait vérifier.
 */
export const MARGE_FIN_FENETRE = 15 * 60

/**
 * Swaps sous ce montant ignorés pour l'ATH, en SOL.
 *
 * Un swap de poussière donne un prix aberrant : sur une courbe, quelques
 * lamports contre une poignée de tokens se divisent mal.
 */
export const SWAP_MINIMUM_SOL = 0.001

/** Supply d'un lancement pump.fun, avant tout burn. */
export const SUPPLY_LANCEMENT = 1_000_000_000

/** Décimales d'un token pump.fun, quand rien ne les donne. */
export const DECIMALES_DEFAUT = 6

const LAMPORTS = 1_000_000_000

// ---------------------------------------------------------------------------
// Le premier achat de chaque token
// ---------------------------------------------------------------------------

/** Un achat du wallet : il a donné du SOL et reçu un token. */
export type Achat = {
  mint: string
  signature: string
  horodatage: number
  protocole: string | null
  /** SOL réellement versé à la courbe ou à la pool. */
  solPaye: number
  /** Tokens reçus, décimales appliquées. */
  tokensRecus: number
  decimales: number
}

/**
 * Les achats contenus dans une liste de swaps.
 *
 * Un achat, c'est du SOL qui entre dans le swap et autre chose qui en sort. On
 * ne se fie pas à `parsedData.kind` : la sonde y a relevé sept valeurs
 * différentes pour la même intention, et parfois aucune.
 *
 * Le SOL retenu est celui du swap, pas la variation du solde du wallet : les
 * tips, les frais de bot et la priority fee voyagent dans `nativeTransfers` et
 * n'ont rien à faire dans un prix d'entrée.
 */
export function achatsDepuisSwaps(swaps: readonly Swap[]): Achat[] {
  const achats: Achat[] = []

  for (const swap of swaps) {
    if (swap.mintEntree !== WSOL || swap.mintSortie === WSOL) continue

    const decimales = swap.decimales ?? DECIMALES_DEFAUT
    const tokensRecus = swap.bruitSortie / 10 ** decimales
    if (tokensRecus <= 0) continue

    achats.push({
      mint: swap.mintSortie,
      signature: swap.signature,
      horodatage: swap.horodatage,
      protocole: swap.protocole,
      solPaye: swap.bruitEntree / LAMPORTS,
      tokensRecus,
      decimales,
    })
  }

  return achats
}

/**
 * Le premier achat de chaque mint, dans l'ordre du temps.
 *
 * Un même token peut être racheté dix fois dans la journée ; une ligne de
 * tableau en représente un, le premier — c'est lui qui fixe le prix d'entrée
 * auquel l'ATH sera comparé.
 *
 * Le dédoublonnage porte sur le **mint**, jamais sur le nom : ces wallets
 * achètent des relances, et sept tokens appelés pareil sont sept lancements
 * distincts, avec chacun sa courbe.
 */
export function premiersAchats(achats: readonly Achat[]): Achat[] {
  const parMint = new Map<string, Achat>()

  for (const achat of achats) {
    const connu = parMint.get(achat.mint)
    if (connu === undefined || achat.horodatage < connu.horodatage) {
      parMint.set(achat.mint, achat)
    }
  }

  return [...parMint.values()].sort((a, b) => a.horodatage - b.horodatage)
}

// ---------------------------------------------------------------------------
// Prix et capitalisation
// ---------------------------------------------------------------------------

/**
 * La supply à retenir pour une capitalisation d'entrée.
 *
 * DAS renvoie la supply **actuelle**, burns compris — donc postérieure à
 * l'achat. S'en servir sous-estimerait la MC d'entrée (jusqu'à 4 % sur les
 * mesures faites). Un lancement pump.fun part toujours d'un milliard : c'est
 * cette base qu'on retient, et c'est aussi celle qu'affichent les outils de
 * trading, ce qui rend les chiffres comparables.
 *
 * Pour tout le reste, la supply DAS vaut mieux qu'une constante inventée.
 */
export function supplyRetenue(mint: string, supplyDas: number | null): number {
  if (estLancementPumpFun(mint)) return SUPPLY_LANCEMENT
  return supplyDas !== null && supplyDas > 0 ? supplyDas : SUPPLY_LANCEMENT
}

/** Un mint frappé par pump.fun : son adresse se termine par « pump ». */
export function estLancementPumpFun(mint: string): boolean {
  return mint.endsWith('pump')
}

/** Le prix unitaire d'un swap, en SOL par token. `null` si inexploitable. */
export function prixDuSwap(swap: Swap): number | null {
  const decimales = swap.decimales ?? DECIMALES_DEFAUT

  let sol: number
  let tokens: number

  if (swap.mintEntree === WSOL) {
    sol = swap.bruitEntree / LAMPORTS
    tokens = swap.bruitSortie / 10 ** decimales
  } else if (swap.mintSortie === WSOL) {
    sol = swap.bruitSortie / LAMPORTS
    tokens = swap.bruitEntree / 10 ** decimales
  } else {
    // Un swap token contre token ne dit rien du prix en SOL.
    return null
  }

  if (sol < SWAP_MINIMUM_SOL || tokens <= 0) return null
  return sol / tokens
}

/** La capitalisation correspondant à un prix unitaire, en SOL. */
export function capitalisation(prix: number, supply: number): number {
  return prix * supply
}

// ---------------------------------------------------------------------------
// L'ATH
// ---------------------------------------------------------------------------

export type Sommet = {
  /** Capitalisation maximale atteinte, en SOL. */
  mcSol: number
  /** Quand, en secondes Unix. */
  horodatage: number
}

/**
 * Le sommet atteint par un token après un achat.
 *
 * Ne regarde que les swaps qui concernent réellement ce mint : l'historique
 * d'un mint renvoie toutes les transactions qui le touchent, et certaines
 * portent des swaps sur d'autres tokens. Sans ce filtre, un token voisin
 * fixerait l'ATH.
 *
 * Les ventes comptent autant que les achats : une vente à un prix donné prouve
 * que ce prix existait.
 */
export function sommetApres(
  swaps: readonly Swap[],
  mint: string,
  depuis: number,
  supply: number,
): Sommet | null {
  let sommet: Sommet | null = null

  for (const swap of swaps) {
    if (swap.mintEntree !== mint && swap.mintSortie !== mint) continue
    if (swap.horodatage < depuis) continue

    const prix = prixDuSwap(swap)
    if (prix === null) continue

    const mcSol = capitalisation(prix, supply)
    if (sommet === null || mcSol > sommet.mcSol) {
      sommet = { mcSol, horodatage: swap.horodatage }
    }
  }

  return sommet
}

/**
 * La capitalisation à partir de laquelle l'issue est acquise.
 *
 * Dès que le token l'a franchie, lire la suite de la fenêtre ne peut plus
 * changer l'issue — seulement affiner un ATH dont on sait déjà qu'il suffit.
 * C'est ce qui permet d'arrêter la pagination tôt sur les gagnants, et ce sont
 * eux qui coûtent cher : le seul gagnant d'une journée mesurée consommait à lui
 * seul la moitié du temps total.
 */
export function seuilDeclenchement(mcEntree: number, tp: number): number {
  return mcEntree * multipleVise(tp)
}

/**
 * Le sommet dépasse-t-il déjà le seuil ?
 *
 * Interrogé après chaque page pour décider s'il faut en lire une autre.
 */
export function sommetSuffit(
  sommet: Sommet | null,
  mcEntree: number,
  tp: number,
): boolean {
  return sommet !== null && sommet.mcSol >= seuilDeclenchement(mcEntree, tp)
}

// ---------------------------------------------------------------------------
// La ligne du tableau
// ---------------------------------------------------------------------------

/**
 * Une ligne analysée, telle qu'elle est mise en cache et affichée.
 *
 * L'issue n'en fait pas partie : elle se déduit du multiple et du TP du wallet
 * au moment de l'affichage, pour qu'un changement de réglage mette le tableau
 * à jour sans relancer la moindre requête.
 */
/**
 * D'où vient l'ATH.
 *
 * `tracker` : Solana Tracker, source principale — un appel par token, prix déjà
 * en SOL. `bougies` : GeckoTerminal, repli quand le tracker ne répond pas.
 * `swaps` : relecture Helius, dernier recours pour les tokens que personne
 * n'indexe. `mixte` : bougies complétées par les swaps sur l'intervalle qu'elles
 * ne couvraient pas.
 */
export type SourceAth = 'tracker' | 'bougies' | 'swaps' | 'mixte'

/** Ce qui fait passer une ligne en « à vérifier ». */
export type Alerte =
  | 'sommet-sous-entree'
  | 'multiple-aberrant'
  | 'sommet-en-fin-de-fenetre'

export const LIBELLE_ALERTE: Record<Alerte, string> = {
  'sommet-sous-entree': 'Sommet sous le prix d’entrée',
  'multiple-aberrant': 'Multiple invraisemblable',
  'sommet-en-fin-de-fenetre': 'Sommet en fin de fenêtre',
}

/**
 * L'issue d'une ligne, ou l'aveu qu'on ne sait pas.
 *
 * Le troisième état n'est pas du luxe : un ATH tronqué est toujours un
 * minorant, donc il ne peut transformer qu'un TP en « Raté », jamais l'inverse.
 * Laisser ces lignes partir en « Raté » biaisait les statistiques dans un seul
 * sens — sur une journée mesurée, quatre lignes sur sept étaient fausses, toutes
 * du même côté.
 */
export type EtatIssue = Issue | 'inconnue' | 'verifier'

export type LigneAnalyse = {
  mint: string
  nom: string | null
  signature: string
  /** Secondes Unix du premier achat. */
  acheteA: number
  solPaye: number
  tokensRecus: number
  decimales: number
  /** Supply retenue pour la capitalisation. `null` tant qu'elle n'est pas connue. */
  supply: number | null
  /**
   * Prix d'entrée, en SOL par token.
   *
   * **La base canonique de toute comparaison.** Le multiple se calcule entre ce
   * prix et un prix de sommet, dans la même unité — jamais entre une
   * capitalisation calculée ici et une capitalisation fournie par une source
   * tierce, qui ne reposerait ni sur la même supply ni sur la même convention.
   * Les capitalisations affichées sont dérivées, pour la lecture seulement.
   */
  prixEntree: number
  /** Plus haut « high », en SOL par token. Mèches comprises. */
  prixSommetBrut: number | null
  /** Plus haut « close », en SOL par token. Le prix qu'on aurait pu prendre. */
  prixSommetExec: number | null
  sommetBrutA: number | null
  sommetExecA: number | null
  /**
   * Plus grand trou de couverture, en secondes.
   *
   * Conservé pour le diagnostic seulement : une minute sans transaction est
   * normale sur un memecoin, donc un trou ne déclenche aucun contrôle.
   */
  trouMax: number | null
  /** Taux SOL/USD à l'instant de l'achat. `null` si introuvable. */
  solUsdAchat: number | null
  /** Taux SOL/USD à l'instant du sommet retenu. */
  solUsdSommet: number | null
  mcEntreeSol: number
  /** `null` quand l'ATH n'a pas pu être établi. */
  athMcSol: number | null
  athA: number | null
  multiple: number | null
  /** La fenêtre n'a pas été parcourue en entier : l'ATH est un minorant. */
  athPartiel: boolean
  /** D'où vient l'ATH. `null` tant qu'il n'a pas été cherché. */
  source: SourceAth | null
  /** La pool de cotation, quand les bougies ont servi. */
  pool: string | null
  /** Message d'échec, s'il y en a eu un. */
  erreur: string | null
}

/**
 * Cette ligne mérite-t-elle d'être recalculée ?
 *
 * Deux cas, et seulement deux :
 *
 * - **pas de source** : la ligne vient d'une version antérieure à la voie des
 *   bougies. Son ATH est une relecture de swaps souvent fausse d'un facteur 4
 *   à 8 ; la resservir reviendrait à présenter comme à jour un chiffre périmé.
 * - **repli tronqué alors qu'une pool existait** : les bougies étaient
 *   possibles mais l'appel a échoué — un refus passager suffit —, et le repli
 *   a saturé son plafond de pages. Sans cette relance, un seul 429 figerait un
 *   minorant pour toujours.
 *
 * Une ligne sans pool n'est pas reprise : il n'y a rien de mieux à en tirer.
 * Une ligne en erreur non plus — elle attend un « Réanalyser » explicite,
 * sinon une panne durable relancerait tout à chaque ouverture.
 */
export function doitEtreRefaite(ligne: LigneAnalyse): boolean {
  if (ligne.erreur !== null) return false
  if (ligne.source === null) return true

  // Ligne d'avant les prix canoniques : son sommet n'existe qu'en
  // capitalisation, et le multiple se calcule désormais sur des prix. Sans
  // cette reprise, une ligne jusque-là juste basculerait en « inconnue ».
  if (
    ligne.prixSommetBrut === null &&
    ligne.prixSommetExec === null &&
    ligne.athMcSol !== null
  ) {
    return true
  }

  return ligne.source === 'swaps' && ligne.athPartiel && ligne.pool !== null
}

/**
 * Le multiple maximal atteint : sommet rapporté au prix d'entrée.
 *
 * Les deux termes sont des prix en SOL par token. La supply n'intervient pas —
 * elle se simplifierait de toute façon, et la faire entrer dans le calcul
 * ouvrirait la porte à comparer deux grandeurs qui ne reposent pas sur la même
 * convention.
 */
export function multipleDepuisPrix(
  prixEntree: number,
  prixSommet: number | null,
): number | null {
  if (prixSommet === null || prixEntree <= 0) return null
  return prixSommet / prixEntree
}

/** Le sommet sur lequel l'issue se décide, selon `BASE_ISSUE`. */
export function prixSommetRetenu(ligne: LigneAnalyse): number | null {
  return BASE_ISSUE === 'brut' ? ligne.prixSommetBrut : ligne.prixSommetExec
}

/** L'horodatage du sommet retenu. */
export function sommetRetenuA(ligne: LigneAnalyse): number | null {
  return BASE_ISSUE === 'brut' ? ligne.sommetBrutA : ligne.sommetExecA
}

/**
 * La capitalisation d'entrée en dollars, au taux de l'instant de l'achat.
 *
 * `null` quand le taux manque : mieux vaut n'afficher aucun dollar qu'un
 * dollar converti au cours du jour de lecture, qui serait faux dès qu'on
 * regarde une journée passée.
 */
export function mcEntreeUsd(ligne: LigneAnalyse): number | null {
  if (ligne.supply === null || ligne.solUsdAchat === null) return null
  return ligne.prixEntree * ligne.supply * ligne.solUsdAchat
}

/** La capitalisation au sommet en dollars, au taux de l'instant du sommet. */
export function mcSommetUsd(ligne: LigneAnalyse): number | null {
  const prix = prixSommetRetenu(ligne)
  if (prix === null || ligne.supply === null || ligne.solUsdSommet === null) return null
  return prix * ligne.supply * ligne.solUsdSommet
}

/**
 * Le multiple retenu, recalculé à chaque lecture.
 *
 * Dérivé et non stocké : basculer `BASE_ISSUE` doit changer le tableau sans
 * qu'une seule requête reparte.
 */
export function multipleRetenu(ligne: LigneAnalyse): number | null {
  return multipleDepuisPrix(ligne.prixEntree, prixSommetRetenu(ligne))
}

/**
 * Les contrôles de vraisemblance.
 *
 * Aucun ne dit qu'un chiffre est faux : ils disent qu'il mérite un œil. Une
 * ligne qui en déclenche un passe en « à vérifier » et ne part pas à l'import
 * sans décision.
 */
export function alertesDeLigne(ligne: LigneAnalyse): Alerte[] {
  const alertes: Alerte[] = []
  const sommet = prixSommetRetenu(ligne)
  if (sommet === null) return alertes

  // Un sommet sous le prix d'entrée est contradictoire : soit la pool n'est pas
  // la bonne, soit la bougie retenue précède l'achat.
  if (sommet < ligne.prixEntree) alertes.push('sommet-sous-entree')

  const multiple = multipleDepuisPrix(ligne.prixEntree, sommet)
  if (multiple !== null && multiple > MULTIPLE_ABERRANT) alertes.push('multiple-aberrant')

  const quand = sommetRetenuA(ligne)
  const fin = ligne.acheteA + FENETRE_ATH_HEURES * 3600
  if (quand !== null && fin - quand <= MARGE_FIN_FENETRE) {
    alertes.push('sommet-en-fin-de-fenetre')
  }

  return alertes
}

/**
 * Le multiple qu'un take-profit demande.
 *
 * Un TP de 300 % vise une montée de 300 %, soit quatre fois la mise.
 */
export function multipleVise(tp: number): number {
  return 1 + tp / 100
}

/**
 * L'issue d'une ligne, déduite de son multiple.
 *
 * Sans multiple — ATH inconnu, erreur réseau — on répond « raté » : c'est le
 * sens prudent, et la ligne reste forçable à la main.
 */
export function issueDepuisMultiple(multiple: number | null, tp: number): Issue {
  if (multiple === null) return 'rate'
  return multiple >= multipleVise(tp) ? 'tp' : 'rate'
}

/**
 * L'état d'une ligne : son issue, ou `inconnue`.
 *
 * Une ligne est indéterminée quand son ATH est un minorant **et** que ce
 * minorant n'atteint pas le seuil : le vrai sommet a pu le franchir sans qu'on
 * l'ait vu. Au-dessus du seuil, au contraire, la troncature ne change rien —
 * le TP est acquis.
 *
 * Un forçage manuel tranche toujours, c'est sa raison d'être.
 */
export function etatLigne(
  ligne: LigneAnalyse,
  tp: number,
  forcages: ReadonlyMap<string, Issue> = new Map(),
): EtatIssue {
  const force = forcages.get(ligne.mint)
  if (force !== undefined) return force

  const multiple = multipleRetenu(ligne)
  if (multiple === null) return 'inconnue'

  // Un contrôle de vraisemblance qui se déclenche suspend la décision, quelle
  // qu'elle soit : mieux vaut un œil humain qu'un chiffre plausible et faux.
  if (alertesDeLigne(ligne).length > 0) return 'verifier'

  const issue = issueDepuisMultiple(multiple, tp)
  if (issue === 'tp') return 'tp'

  // Sous le seuil, et le sommet n'est qu'un minorant : on ne sait pas.
  return ligne.athPartiel ? 'inconnue' : 'rate'
}

/** Les états d'un lot de lignes, dans l'ordre. */
export function etatsDesLignes(
  lignes: readonly LigneAnalyse[],
  tp: number,
  forcages: ReadonlyMap<string, Issue> = new Map(),
): EtatIssue[] {
  return lignes.map((ligne) => etatLigne(ligne, tp, forcages))
}

/**
 * Les issues effectivement connues, pour `bilanSimule`.
 *
 * Les lignes indéterminées sont **écartées** plutôt que comptées en « Raté » :
 * un résultat simulé sur ce qu'on sait vaut mieux qu'un résultat complet et
 * faux. L'écran dit combien de lignes manquent à l'appel.
 */
export function issuesConnues(etats: readonly EtatIssue[]): Issue[] {
  return etats.filter(
    (etat): etat is Issue => etat !== 'inconnue' && etat !== 'verifier',
  )
}

/** Les lignes qui bloquent l'import : indéterminées ou à vérifier. */
export function aTrancher(etats: readonly EtatIssue[]): number {
  return etats.filter((etat) => etat === 'inconnue' || etat === 'verifier').length
}

/**
 * Le numéro de relance de chaque ligne, par nom.
 *
 * Ces wallets achètent le même nom republié encore et encore. Sept lignes
 * « Doge Cate » sont sept tokens différents, et rien à l'écran ne les
 * distingue à part leur mint : ce numéro est là pour s'y retrouver. Les noms
 * uniques n'en reçoivent pas.
 */
export function numerosDeRelance(
  lignes: readonly LigneAnalyse[],
): Map<string, number> {
  const total = new Map<string, number>()
  for (const ligne of lignes) {
    const nom = ligne.nom
    if (nom === null) continue
    total.set(nom, (total.get(nom) ?? 0) + 1)
  }

  const numeros = new Map<string, number>()
  const vus = new Map<string, number>()

  for (const ligne of [...lignes].sort((a, b) => a.acheteA - b.acheteA)) {
    const nom = ligne.nom
    if (nom === null || (total.get(nom) ?? 0) < 2) continue
    const rang = (vus.get(nom) ?? 0) + 1
    vus.set(nom, rang)
    numeros.set(ligne.mint, rang)
  }

  return numeros
}
