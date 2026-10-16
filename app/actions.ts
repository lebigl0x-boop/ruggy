'use server'

import { revalidatePath } from 'next/cache'

import {
  achatsDepuisSwaps,
  capitalisation,
  doitEtreRefaite,
  FENETRE_ATH_HEURES,
  multipleDepuisPrix,
  POOLS_MAX_PAR_TOKEN,
  PAGES_MAX_JOURNEE,
  PAGES_MAX_PAR_TOKEN,
  premiersAchats,
  sommetApres,
  sommetSuffit,
  BASE_ISSUE,
  type SourceAth,
  supplyRetenue,
  TOKENS_EN_PARALLELE,
  type LigneAnalyse,
} from '@/lib/analyse'
import { todayIso } from '@/lib/format'
import {
  assetDuToken,
  assetsDesTokens,
  nouveauCompteur,
  pageHistorique,
  type Compteur,
} from '@/lib/helius/appels'
import {
  jetonSuivant,
  lireMetasDuLot,
  lirePrix,
  lireSwaps,
  transactionsDe,
  WSOL,
  type MetaToken,
} from '@/lib/helius/swaps'
import { bornesJournee } from '@/lib/journee'
import {
  bougiesDeLaPool,
  bougiesDuTracker,
  bougiesSolUsd,
  pairesDesMints,
  poolsDuMint,
} from '@/lib/marche/appels'
import {
  lireBougies,
  lireBougiesTracker,
  lirePools,
  lirePoolsGecko,
  minuteDeLAchat,
  serieSolUsd,
  sommetDesBougies,
  tauxSolUsd,
  type Bougie,
  type Point,
  type Pool,
} from '@/lib/marche/bougies'
import * as analysesRepo from '@/lib/repo/analyses'
import * as repo from '@/lib/repo/wallets'
import type {
  Decompte,
  Issue,
  Phase,
  Reglages,
  Token,
  TradeComplet,
} from '@/lib/repo/types'
import { resolveTokenMeta, type TokenMeta } from '@/lib/token-meta'
import {
  BORNES,
  borner,
  estAdresseSolana,
  estDateIso,
  parseNombreFr,
  valideNouveauWallet,
  type Souci,
} from '@/lib/validation'

/** Rafraîchit la liste et le détail d'un coup. */
function rafraichir(): void {
  revalidatePath('/', 'layout')
}

function versIssue(valeur: unknown): Issue {
  return valeur === 'tp' ? 'tp' : 'rate'
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export type CreationResultat =
  | { ok: true; id: string }
  | { ok: false; soucis: Souci[] }

export async function creerWalletAction(entree: {
  nom: string
  adresse: string
}): Promise<CreationResultat> {
  // La validation du navigateur sert au confort ; celle-ci fait foi.
  const soucis = valideNouveauWallet({
    ...entree,
    adressesExistantes: await repo.listerAdresses(),
  })

  if (soucis.some((souci) => souci.niveau === 'erreur')) return { ok: false, soucis }

  const id = await repo.creerWallet(entree)
  rafraichir()
  return { ok: true, id }
}

export async function renommerWalletAction(id: string, nom: string): Promise<void> {
  await repo.modifierWallet(id, { nom: nom.trim() || 'Sans nom' })
  rafraichir()
}

export async function noterWalletAction(id: string, notes: string): Promise<void> {
  await repo.modifierWallet(id, { notes })
  rafraichir()
}

/**
 * Change la phase d'un wallet.
 *
 * Rien n'est vérifié, et c'est voulu : aucun nombre de tokens ni de journées
 * n'ouvre ou ne ferme une phase. L'app affiche où on en est, la décision est
 * humaine. Les dates de passage sont posées au premier passage seulement —
 * revenir en arrière puis repartir ne réécrit pas l'histoire.
 */
export async function changerPhaseAction(id: string, phase: Phase): Promise<void> {
  const wallet = await repo.lireWallet(id)
  if (!wallet) return

  await repo.modifierWallet(id, {
    phase,
    ...(phase === 'test' && wallet.testLe === null ? { testLe: todayIso() } : {}),
    ...(phase === 'trade' && wallet.tradeLe === null ? { tradeLe: todayIso() } : {}),
  })

  rafraichir()
}

/** Les réglages sont rabattus dans leurs bornes ici : la valeur rendue fait foi. */
export async function reglerAction(
  id: string,
  champ: keyof Reglages,
  valeur: number | null,
): Promise<number> {
  const wallet = await repo.lireWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  const retenu = borner(valeur, BORNES[champ], wallet.reglages[champ])
  await repo.modifierWallet(id, { reglages: { [champ]: retenu } })
  rafraichir()
  return retenu
}

/** Les repères affichés à côté des boutons : 10 tokens, 5 jours… */
export async function reglerRepereAction(
  id: string,
  champ: 'tokensScreening' | 'joursTest',
  valeur: number | null,
): Promise<number> {
  const wallet = await repo.lireWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  const retenu = Math.round(borner(valeur, BORNES[champ], wallet[champ]))
  await repo.modifierWallet(id, { [champ]: retenu })
  rafraichir()
  return retenu
}

/** Ce qu'une suppression emporterait, pour pouvoir le dire avant de la faire. */
export async function compterContenuAction(id: string): Promise<Decompte> {
  return repo.compterContenu(id)
}

export async function supprimerWalletAction(id: string): Promise<void> {
  await repo.supprimerWallet(id)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Tokens — screening et test
// ---------------------------------------------------------------------------

export async function ajouterTokenAction(
  walletId: string,
  entree: { phase: 'screening' | 'test'; jour?: string | null; issue: unknown },
): Promise<Token> {
  const token = await repo.ajouterToken(walletId, {
    phase: entree.phase,
    jour: entree.phase === 'test' ? (entree.jour ?? null) : null,
    issue: versIssue(entree.issue),
  })
  rafraichir()
  return token
}

export async function modifierTokenAction(
  id: string,
  patch: { nom?: string | null; mint?: string | null; issue?: unknown },
): Promise<void> {
  await repo.modifierToken(id, {
    ...(patch.nom !== undefined ? { nom: patch.nom } : {}),
    ...(patch.mint !== undefined ? { mint: patch.mint } : {}),
    ...(patch.issue !== undefined ? { issue: versIssue(patch.issue) } : {}),
  })
  rafraichir()
}

export async function supprimerTokenAction(id: string): Promise<void> {
  await repo.supprimerToken(id)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Journées de test
// ---------------------------------------------------------------------------

export type JourResultat = { ok: true } | { ok: false; message: string }

/**
 * Relève une journée de test.
 *
 * Une liste vide est un relevé valable : c'est la journée « sans lancement »,
 * et elle compte dans les jours observés. La seule chose refusée est une date
 * illisible — y compris une date future, qu'on peut vouloir saisir d'avance.
 */
export async function releverJourAction(
  walletId: string,
  jour: string,
  issues: readonly unknown[],
): Promise<JourResultat> {
  if (!estDateIso(jour)) return { ok: false, message: 'Date de journée invalide.' }

  await repo.releverJour(walletId, jour, issues.map(versIssue))
  rafraichir()
  return { ok: true }
}

export async function supprimerJourAction(
  walletId: string,
  jour: string,
): Promise<void> {
  await repo.supprimerJour(walletId, jour)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export type TradeResultat =
  | { ok: true; trade: TradeComplet }
  | { ok: false; message: string }

/**
 * Enregistre un trade réellement joué.
 *
 * L'entrée doit être un montant positif : sans elle, le rendement n'aurait pas
 * de dénominateur. La sortie peut être zéro — une position partie à zéro est
 * un résultat, pas une absence de saisie.
 */
export async function ajouterTradeAction(
  walletId: string,
  entree: {
    date: string
    nom?: string | null
    mint?: string | null
    entreeSol: string | number | null
    sortieSol: string | number | null
    issue: unknown
  },
): Promise<TradeResultat> {
  if (!estDateIso(entree.date)) return { ok: false, message: 'Date invalide.' }

  const entreeSol = parseNombreFr(entree.entreeSol)
  const sortieSol = parseNombreFr(entree.sortieSol)

  if (entreeSol === null || entreeSol <= 0) {
    return { ok: false, message: 'L’entrée en SOL doit être un montant positif.' }
  }
  if (sortieSol === null || sortieSol < 0) {
    return { ok: false, message: 'La sortie en SOL doit être renseignée (zéro compris).' }
  }

  const trade = await repo.ajouterTrade(walletId, {
    date: entree.date,
    nom: entree.nom?.trim() || null,
    mint: entree.mint ?? null,
    entreeSol,
    sortieSol,
    issue: versIssue(entree.issue),
  })

  rafraichir()
  return { ok: true, trade }
}

export async function supprimerTradeAction(id: string): Promise<void> {
  await repo.supprimerTrade(id)
  rafraichir()
}

// ---------------------------------------------------------------------------
// Noms de tokens
// ---------------------------------------------------------------------------

/**
 * Cherche le nom d'un token à partir de son adresse. N'écrit rien.
 *
 * Le filtre sur la forme de l'adresse n'est pas cosmétique : une action est
 * joignable par POST direct, et sans lui n'importe quelle chaîne partirait
 * brûler le quota Helius.
 */
export async function resoudreNomTokenAction(mint: string): Promise<TokenMeta | null> {
  const propre = mint.trim()
  if (!estAdresseSolana(propre)) return null
  return resolveTokenMeta(propre)
}

// ---------------------------------------------------------------------------
// Analyse automatique d'une journée
// ---------------------------------------------------------------------------

/**
 * L'analyse est découpée volontairement.
 *
 * Une journée, c'est jusqu'à plusieurs centaines d'appels Helius : la tenir
 * dans une seule action dépasserait n'importe quel délai d'exécution et ne
 * donnerait aucune nouvelle avant la fin. Une action liste les achats, puis le
 * client rappelle une seconde action une fois par token.
 */

export type JourneeAnalysee = {
  lignes: LigneAnalyse[]
  /** ISO-8601 de la dernière analyse, `null` si elle vient d'être faite. */
  analyseLe: string | null
  /** Le cache a répondu : aucun appel réseau n'a eu lieu. */
  depuisCache: boolean
  /** Prix du SOL en dollars, s'il a pu être lu. */
  prixSolUsd: number | null
  appels: number
}

export type AnalyseResultat =
  | { ok: true; journee: JourneeAnalysee }
  | { ok: false; message: string }

/**
 * Parcourt un historique page par page, dans la limite donnée.
 *
 * `assez` est consulté après chaque page : il permet d'arrêter la lecture dès
 * que la réponse est acquise, sans attendre la fin de la fenêtre. C'est le
 * levier principal sur les gagnants, qui sont aussi les tokens les plus actifs
 * et donc les plus coûteux à parcourir.
 */
async function parcourirHistorique(
  adresse: string,
  bornes: { debut: number; fin: number },
  pagesMax: number,
  compteur: Compteur,
  assez?: (transactions: readonly unknown[]) => boolean,
): Promise<{ transactions: unknown[]; tronque: boolean; pages: number }> {
  const transactions: unknown[] = []
  let jeton: string | null = null
  let pages = 0

  do {
    const reponse: unknown = await pageHistorique(adresse, bornes, jeton, compteur)
    transactions.push(...transactionsDe(reponse))
    jeton = jetonSuivant(reponse)
    pages += 1

    if (assez !== undefined && assez(transactions)) {
      // Arrêt volontaire : l'ATH retenu est un minorant, et c'est assumé.
      return { transactions, tronque: true, pages }
    }
  } while (jeton !== null && pages < pagesMax)

  // Un jeton encore en main après le dernier tour : la fenêtre n'a pas été lue
  // en entier.
  return { transactions, tronque: jeton !== null, pages }
}

/**
 * Les premiers achats de la journée, un par token.
 *
 * N'établit pas les ATH : c'est le travail de `analyserTokenAction`, token par
 * token. Les lignes sont écrites tout de suite avec un ATH vide, pour qu'une
 * analyse interrompue ne soit pas perdue.
 */
export async function listerAchatsDuJourAction(
  walletId: string,
  jour: string,
  options: { forcer?: boolean } = {},
): Promise<AnalyseResultat> {
  if (!estDateIso(jour)) return { ok: false, message: 'Date de journée invalide.' }

  const wallet = await repo.lireWallet(walletId)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }

  // Le garde-fou qui évite d'envoyer n'importe quelle chaîne brûler le quota.
  if (!estAdresseSolana(wallet.adresse)) {
    return { ok: false, message: 'L’adresse de ce wallet n’est pas une adresse Solana.' }
  }

  if (options.forcer === true) {
    await analysesRepo.oublierJournee(walletId, jour)
  } else {
    const connues = await analysesRepo.lireJournee(walletId, jour)

    // Voir `doitEtreRefaite` : cache périmé, ou repli tronqué alors que les
    // bougies étaient possibles.
    const aRefaire = connues.filter(doitEtreRefaite)

    if (connues.length > 0 && aRefaire.length === 0) {
      // Un appel quand même, pour le prix du SOL : sans lui la colonne en
      // dollars disparaîtrait à la réouverture d'une journée déjà analysée,
      // ce qui se lirait comme une anomalie.
      const compteurCache = nouveauCompteur()
      return {
        ok: true,
        journee: {
          lignes: connues,
          analyseLe: await analysesRepo.dateAnalyse(walletId, jour),
          depuisCache: true,
          prixSolUsd: await prixDuSol(compteurCache),
          appels: compteurCache.appels,
        },
      }
    }

    // Des lignes à refaire : on rend la liste connue, en remettant à zéro ce
    // qui va être recalculé, et le client relance l'étape des ATH.
    if (connues.length > 0) {
      const compteurCache = nouveauCompteur()
      return {
        ok: true,
        journee: {
          lignes: connues.map((ligne) =>
            doitEtreRefaite(ligne)
              ? { ...ligne, athMcSol: null, athA: null, multiple: null, athPartiel: false }
              : ligne,
          ),
          analyseLe: null,
          depuisCache: false,
          prixSolUsd: await prixDuSol(compteurCache),
          appels: compteurCache.appels,
        },
      }
    }
  }

  const compteur = nouveauCompteur()

  try {
    const bornes = bornesJournee(jour)
    const { transactions } = await parcourirHistorique(
      wallet.adresse,
      bornes,
      PAGES_MAX_JOURNEE,
      compteur,
    )

    const achats = premiersAchats(achatsDepuisSwaps(lireSwaps(transactions)))
    const analyseLe = new Date().toISOString()

    const lignes: LigneAnalyse[] = achats.map((achat) => ({
      mint: achat.mint,
      nom: null,
      signature: achat.signature,
      acheteA: achat.horodatage,
      solPaye: achat.solPaye,
      tokensRecus: achat.tokensRecus,
      decimales: achat.decimales,
      // La supply définitive est tranchée à l'analyse du token, quand DAS a
      // répondu. Ici on pose la base de lancement, juste pour pump.fun.
      supply: null,
      prixEntree: achat.solPaye / achat.tokensRecus,
      prixSommetBrut: null,
      prixSommetExec: null,
      sommetBrutA: null,
      sommetExecA: null,
      trouMax: null,
      solUsdAchat: null,
      solUsdSommet: null,
      mcEntreeSol: capitalisation(
        achat.solPaye / achat.tokensRecus,
        supplyRetenue(achat.mint, null),
      ),
      athMcSol: null,
      athA: null,
      multiple: null,
      athPartiel: false,
      source: null,
      pool: null,
      erreur: null,
    }))

    for (const ligne of lignes) {
      await analysesRepo.enregistrerLigne(walletId, jour, ligne, analyseLe)
    }

    return {
      ok: true,
      journee: {
        lignes,
        analyseLe,
        depuisCache: false,
        prixSolUsd: await prixDuSol(compteur),
        appels: compteur.appels,
      },
    }
  } catch (cause) {
    console.error('Analyse de journée : échec.', cause)
    return {
      ok: false,
      message:
        cause instanceof Error ? cause.message : 'L’analyse de la journée a échoué.',
    }
  }
}

/** Le prix du SOL en dollars. Un échec ici ne fait pas échouer l'analyse. */
async function prixDuSol(compteur: Compteur): Promise<number | null> {
  try {
    return lirePrix(await assetDuToken(WSOL, compteur))
  } catch {
    return null
  }
}

export type TokenAnalyse =
  | { ok: true; ligne: LigneAnalyse }
  | { ok: false; mint: string; message: string }

export type LotAnalyse = {
  resultats: TokenAnalyse[]
  appels: number
  refus: number
}

/**
 * Analyse un lot de tokens, plusieurs de front.
 *
 * Le parallélisme est **dans** l'action et non chez l'appelant : Next.js
 * n'expédie qu'une Server Action à la fois par client, donc trois appels
 * lancés ensemble depuis le navigateur seraient sagement mis à la queue. Les
 * faire concourir ici est la seule façon de les faire concourir tout court.
 *
 * Le limiteur partagé encaisse la concurrence : les trois tokens puisent dans
 * le même seau de jetons, ce qu'une pause par appel ne savait pas faire.
 *
 * Une erreur n'est pas levée mais renvoyée, token par token : celui qui échoue
 * affiche son message sur sa ligne, les autres continuent.
 */
export async function analyserLotAction(
  walletId: string,
  jour: string,
  mints: readonly string[],
): Promise<LotAnalyse> {
  const compteur = nouveauCompteur()

  if (!estDateIso(jour)) {
    return {
      resultats: mints.map((mint) => ({
        ok: false as const,
        mint,
        message: 'Date de journée invalide.',
      })),
      appels: 0,
      refus: 0,
    }
  }

  const wallet = await repo.lireWallet(walletId)
  if (!wallet) {
    return {
      resultats: mints.map((mint) => ({
        ok: false as const,
        mint,
        message: 'Wallet introuvable.',
      })),
      appels: 0,
      refus: 0,
    }
  }

  const connues = await analysesRepo.lireJournee(walletId, jour)
  const analyseLe = new Date().toISOString()

  // Les métadonnées de tout le lot en un appel. DAS accepte mille adresses ;
  // sur le plan gratuit, limité à deux requêtes DAS par seconde, c'est quatre
  // secondes d'attente économisées pour sept tokens.
  const aChercher = mints.filter((mint) => {
    const ligne = connues.find((l) => l.mint === mint)
    // Déjà en cache avec son nom et sa supply : plus rien à demander.
    return !(ligne !== undefined && ligne.nom !== null && ligne.supply !== null)
  })

  let metas = new Map<string, MetaToken>()
  if (aChercher.length > 0) {
    try {
      metas = lireMetasDuLot(await assetsDesTokens(aChercher, compteur))
    } catch (cause) {
      // Pas de métadonnées : l'analyse continue sans nom, avec la supply de
      // lancement. Mieux vaut un ATH sans libellé que pas d'ATH.
      console.error('Analyse : le lot de métadonnées a échoué.', cause)
    }
  }

  /**
   * Les pools ne sont résolues que pour les tokens que Solana Tracker n'a pas
   * su servir.
   *
   * C'est tout l'intérêt de la source principale : elle s'interroge par adresse
   * de token, donc le chemin courant n'a plus besoin d'annuaire du tout. La
   * machinerie de pools — requête groupée DexScreener, puis GeckoTerminal mint
   * par mint pour les paires qu'il élague — ne sert plus que de repli, et n'est
   * déclenchée que si quelque chose a échoué.
   *
   * Mémorisé par lot : deux tokens en repli ne paient qu'une résolution.
   */
  /**
   * Le cours du SOL en dollars sur la période, à la minute.
   *
   * Lu une fois pour tout le lot, en sous-fenêtres : l'API rend les
   * **dernières** bougies de l'intervalle demandé, donc une requête trop large
   * tronque le début. Sans cette série, les capitalisations en dollars d'une
   * journée passée seraient converties au cours du jour de lecture.
   */
  const solUsd = new Map<number, number>()
  {
    const bornes = bornesJournee(jour)
    const finCouverture = bornes.fin + FENETRE_ATH_HEURES * 3600
    const TRANCHE = 8 * 3600

    for (let fin = bornes.debut + TRANCHE; fin <= finCouverture + TRANCHE; fin += TRANCHE) {
      try {
        const bougies = lireBougiesTracker(
          await bougiesSolUsd(fin - TRANCHE, Math.min(fin, finCouverture), compteur),
        )
        for (const [minute, taux] of serieSolUsd(bougies)) solUsd.set(minute, taux)
      } catch (cause) {
        // Sans taux, les lignes n'afficheront que des SOL. Ce n'est pas
        // bloquant : le multiple, lui, ne dépend d'aucun change.
        console.error('Analyse : cours SOL/USD indisponible sur une tranche.', cause)
      }
    }
  }

  const poolsConnues = new Map<string, Pool[]>()
  let lotDexscreener = false

  async function resoudrePools(mint: string): Promise<Pool[]> {
    const deja = poolsConnues.get(mint)
    if (deja !== undefined) return deja

    if (!lotDexscreener) {
      lotDexscreener = true
      try {
        for (const [m, liste] of lirePools(await pairesDesMints(mints, compteur))) {
          poolsConnues.set(m, liste)
        }
      } catch (cause) {
        console.error('Analyse : la résolution groupée des pools a échoué.', cause)
      }
    }

    const apresLot = poolsConnues.get(mint)
    if (apresLot !== undefined && apresLot.length > 0) return apresLot

    // DexScreener élague les paires mortes, et nos tokens sont précisément
    // ceux qu'il élague : un token enterré y annonçait zéro paire alors que
    // GeckoTerminal en connaissait deux, dont une portant le vrai sommet.
    try {
      const trouvees = lirePoolsGecko(await poolsDuMint(mint, compteur), mint)
      poolsConnues.set(mint, trouvees)
      return trouvees
    } catch (cause) {
      console.error('Analyse : second annuaire muet pour un mint.', cause)
      poolsConnues.set(mint, [])
      return []
    }
  }

  const resultats = await enParallele(mints, TOKENS_EN_PARALLELE, (mint) =>
    analyserUnToken({
      walletId,
      jour,
      mint,
      tp: wallet.reglages.tp,
      connue: connues.find((l) => l.mint === mint),
      meta: metas.get(mint),
      resoudrePools,
      solUsd,
      analyseLe,
      compteur,
    }),
  )

  return { resultats, appels: compteur.appels, refus: compteur.refus }
}

/**
 * Exécute `travail` sur chaque élément, `largeur` à la fois.
 *
 * Une file de curseurs partagée plutôt qu'un découpage en tranches : un token
 * lent ne laisse pas les autres fils inoccupés en attendant la fin de sa
 * tranche.
 */
async function enParallele<T, R>(
  elements: readonly T[],
  largeur: number,
  travail: (element: T) => Promise<R>,
): Promise<R[]> {
  const resultats: R[] = new Array(elements.length)
  let curseur = 0

  async function fil(): Promise<void> {
    for (;;) {
      const index = curseur
      curseur += 1
      const element = elements[index]
      if (element === undefined) return
      resultats[index] = await travail(element)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(largeur, elements.length) }, () => fil()),
  )

  return resultats
}

/** L'ATH d'un token, et son nom. Ne lève jamais. */
async function analyserUnToken(entree: {
  walletId: string
  jour: string
  mint: string
  tp: number
  connue: LigneAnalyse | undefined
  meta: MetaToken | undefined
  /** Résolution paresseuse : appelée seulement si le tracker n'a rien donné. */
  resoudrePools: (mint: string) => Promise<Pool[]>
  solUsd: ReadonlyMap<number, number>
  analyseLe: string
  compteur: Compteur
}): Promise<TokenAnalyse> {
  const { walletId, jour, mint, tp, connue, meta, resoudrePools, solUsd, analyseLe, compteur } =
    entree

  if (!estAdresseSolana(mint)) {
    return { ok: false, mint, message: 'Adresse de token invalide.' }
  }
  if (connue === undefined) {
    return { ok: false, mint, message: 'Ligne absente du cache.' }
  }

  try {
    const supply = supplyRetenue(mint, meta?.supply ?? connue.supply)
    const decimales = meta?.decimales ?? connue.decimales
    const nom = meta?.nom ?? connue.nom

    const tokensRecus =
      decimales === connue.decimales
        ? connue.tokensRecus
        : (connue.tokensRecus * 10 ** connue.decimales) / 10 ** decimales

    const prixEntree = connue.solPaye / tokensRecus
    const mcEntreeSol = capitalisation(prixEntree, supply)

    const fin = connue.acheteA + FENETRE_ATH_HEURES * 3600

    /**
     * Trois sources, dans cet ordre, et chacune ne sert que si la précédente
     * s'est tue.
     *
     * 1. **Solana Tracker**, par adresse de token : un appel, prix déjà en SOL,
     *    aucune pool à résoudre. Mesuré sur une journée réelle : sept tokens
     *    sur sept, en sept appels et six secondes, à 0,6 % de GeckoTerminal et
     *    2,6 % du relevé manuel.
     * 2. **GeckoTerminal**, par pool : il faut d'abord un annuaire, donc c'est
     *    plus cher et plus fragile — mais il connaît des tokens que le tracker
     *    pourrait ignorer.
     * 3. **Relecture des swaps Helius** : dernier recours, tronque, et ne rend
     *    qu'un minorant.
     */
    /**
     * Le meilleur de toutes les sources, tenu dans un objet et non dans des
     * variables : `retenir` les met à jour depuis une fermeture, ce que
     * l'analyse de flux de TypeScript ne sait pas suivre sur des `let`.
     */
    const vu: {
      brut: Point | null
      exec: Point | null
      trouMax: number | null
      premiere: number | null
      pool: string | null
    } = { brut: null, exec: null, trouMax: null, premiere: null, pool: null }

    let tronque = false
    let source: SourceAth | null = null

    const retenir = (
      sommet: ReturnType<typeof sommetDesBougies>,
      pool: string | null,
    ) => {
      if (sommet.brut !== null && (vu.brut === null || sommet.brut.prix > vu.brut.prix)) {
        vu.brut = sommet.brut
        vu.pool = pool
      }
      if (
        sommet.executable !== null &&
        (vu.exec === null || sommet.executable.prix > vu.exec.prix)
      ) {
        vu.exec = sommet.executable
      }
      if (sommet.premiere !== null) {
        vu.premiere =
          vu.premiere === null ? sommet.premiere : Math.min(vu.premiere, sommet.premiere)
      }
      vu.trouMax = vu.trouMax === null ? sommet.trouMax : Math.min(vu.trouMax, sommet.trouMax)
    }

    // 1. Solana Tracker.
    try {
      const sommet = sommetDesBougies(
        lireBougiesTracker(
          await bougiesDuTracker(mint, minuteDeLAchat(connue.acheteA), fin, compteur),
        ),
        connue.acheteA,
        fin,
      )
      if (sommet.brut !== null) {
        retenir(sommet, null)
        source = 'tracker'
      }
    } catch (cause) {
      console.error('Analyse : Solana Tracker muet, on descend la chaîne.', cause)
    }

    // 2. GeckoTerminal, seulement si le tracker n'a rien donné.
    if (source === null) {
      const pools = await resoudrePools(mint)

      for (const candidate of pools.slice(0, POOLS_MAX_PAR_TOKEN)) {
        try {
          const bougies: Bougie[] = lireBougies(
            await bougiesDeLaPool(candidate.pool, fin, FENETRE_ATH_HEURES * 60, compteur),
          )
          const sommet = sommetDesBougies(bougies, connue.acheteA, fin)
          if (sommet.brut !== null) {
            retenir(sommet, candidate.pool)
            source = 'bougies'
          }
        } catch (cause) {
          console.error('Analyse : bougies indisponibles pour une pool.', cause)
        }
      }
    }

    /**
     * 3. Les swaps : soit personne n'a rien, soit la couverture démarre trop
     * tard — signe d'un achat sur la courbe alors que la pool migrée n'existait
     * pas encore.
     */
    const debutManquant = vu.premiere === null ? fin : vu.premiere
    const aCombler = source !== null && debutManquant > minuteDeLAchat(connue.acheteA) + 60

    if (source === null || aCombler) {
      const borneHaute = source === null ? fin : Math.min(debutManquant, fin)

      const lu = await parcourirHistorique(
        mint,
        { debut: connue.acheteA, fin: borneHaute },
        PAGES_MAX_PAR_TOKEN,
        compteur,
        // L'arrêt anticipé ne vaut que quand les swaps sont la seule source :
        // en complément, l'intervalle est court et son parcours est borné.
        source === null
          ? (vues) =>
              sommetSuffit(
                sommetApres(lireSwaps(vues), mint, connue.acheteA, supply),
                mcEntreeSol,
                tp,
              )
          : undefined,
      )

      const parSwaps = sommetApres(lireSwaps(lu.transactions), mint, connue.acheteA, supply)
      if (parSwaps !== null) {
        // `sommetApres` rend une capitalisation : on revient au prix, seule
        // unité dans laquelle les sources se comparent.
        const prix = parSwaps.mcSol / supply
        const point = { prix, horodatage: parSwaps.horodatage }
        if (vu.brut === null || prix > vu.brut.prix) vu.brut = point
        // Un swap est un échange conclu : il est exécutable par définition.
        if (vu.exec === null || prix > vu.exec.prix) vu.exec = point
      }

      tronque = source === null && lu.tronque
      if (source === null) source = 'swaps'
      else if (aCombler) source = 'mixte'
    }

    const prixRetenu = BASE_ISSUE === 'brut' ? vu.brut : vu.exec

    const aboutie: LigneAnalyse = {
      ...connue,
      nom,
      tokensRecus,
      decimales,
      supply,
      prixEntree,
      prixSommetBrut: vu.brut?.prix ?? null,
      prixSommetExec: vu.exec?.prix ?? null,
      sommetBrutA: vu.brut?.horodatage ?? null,
      sommetExecA: vu.exec?.horodatage ?? null,
      trouMax: vu.trouMax,
      solUsdAchat: tauxSolUsd(solUsd, connue.acheteA),
      solUsdSommet:
        prixRetenu === null ? null : tauxSolUsd(solUsd, prixRetenu.horodatage),
      mcEntreeSol,
      athMcSol: prixRetenu === null ? null : prixRetenu.prix * supply,
      athA: prixRetenu?.horodatage ?? null,
      multiple: multipleDepuisPrix(prixEntree, prixRetenu?.prix ?? null),
      athPartiel: tronque,
      source: source ?? 'swaps',
      pool: vu.pool,
      erreur: null,
    }

    await analysesRepo.enregistrerLigne(walletId, jour, aboutie, analyseLe)
    return { ok: true, ligne: aboutie }
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : 'L’analyse de ce token a échoué.'
    console.error('Analyse du token : échec.', cause)

    await analysesRepo.enregistrerLigne(
      walletId,
      jour,
      { ...connue, erreur: message },
      analyseLe,
    )

    return { ok: false, mint, message }
  }
}

// ---------------------------------------------------------------------------
// Import des lignes analysées
// ---------------------------------------------------------------------------

/** Ce qu'une ligne devient à l'import : son identité et l'issue retenue. */
export type LigneImport = { nom: string | null; mint: string; issue: unknown }

export async function importerScreeningAction(
  walletId: string,
  lignes: readonly LigneImport[],
): Promise<{ ok: true; ajoutes: number }> {
  const ajoutes = await repo.ajouterTokensScreening(
    walletId,
    lignes.map((ligne) => ({
      nom: ligne.nom,
      mint: ligne.mint,
      issue: versIssue(ligne.issue),
    })),
  )

  rafraichir()
  return { ok: true, ajoutes: ajoutes.length }
}

export type ImportTestResultat =
  | { ok: true; ajoutes: number }
  | { ok: false; conflit: true }
  | { ok: false; conflit?: false; message: string }

/**
 * Enregistre une journée analysée dans le lot de test.
 *
 * Une journée déjà relevée n'est pas écrasée en silence : `releverJour` ajoute
 * aux lancements existants, ce qui doublerait le relevé. On répond `conflit`
 * et c'est l'écran qui demande.
 *
 * Zéro ligne est un relevé valable : c'est la journée sans lancement, et elle
 * compte dans les jours observés.
 */
export async function importerTestAction(
  walletId: string,
  jour: string,
  lignes: readonly LigneImport[],
  options: { remplacer?: boolean } = {},
): Promise<ImportTestResultat> {
  if (!estDateIso(jour)) return { ok: false, message: 'Date de journée invalide.' }

  const wallet = await repo.lireWallet(walletId)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }

  const deja = wallet.jours.some((journee) => journee.jour === jour)
  if (deja && options.remplacer !== true) return { ok: false, conflit: true }

  if (deja) await repo.supprimerJour(walletId, jour)

  await repo.releverJour(walletId, jour, lignes.map((ligne) => versIssue(ligne.issue)))

  // `releverJour` ne pose ni nom ni mint : on les reporte sur les lancements
  // de la journée, dans l'ordre où ils ont été écrits.
  const apres = await repo.lireWallet(walletId)
  const ecrits = (apres?.tokens ?? [])
    .filter((token) => token.phase === 'test' && token.jour === jour)
    .sort((a, b) => a.position - b.position)

  await Promise.all(
    ecrits.map((token, i) => {
      const source = lignes[i]
      if (source === undefined) return Promise.resolve()
      return repo.modifierToken(token.id, { nom: source.nom, mint: source.mint })
    }),
  )

  rafraichir()
  return { ok: true, ajoutes: lignes.length }
}
