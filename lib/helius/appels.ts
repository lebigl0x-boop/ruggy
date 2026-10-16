import 'server-only'

/**
 * La couche réseau vers Helius.
 *
 * Un seul endroit sait qu'il existe une clé, un quota et des pannes. Tout le
 * reste de l'analyse travaille sur des réponses déjà obtenues.
 *
 * Le rythme n'est plus donné par une pause fixe mais par le limiteur partagé
 * (voir `limiteur.ts`) : c'est ce qui permet d'analyser plusieurs tokens de
 * front sans se faire refuser. Un 429 ralentit le seau entier plutôt que de
 * faire réessayer l'appel dans son coin.
 *
 * La clé ne sort jamais dans un journal : elle voyage en query string, et les
 * messages d'erreur ne portent que le chemin — comme dans `lib/token-meta.ts`.
 */

import { attendreSonTour, penaliser, retryAfter, type Famille } from './limiteur'

/** Au-delà, on considère l'appel perdu. */
export const DELAI_APPEL_MS = 20_000

/** Tentatives au total, première comprise. */
export const TENTATIVES_MAX = 4

const HOTE = 'https://mainnet.helius-rpc.com'

/**
 * Le compte des appels d'une analyse.
 *
 * Passé en argument plutôt que tenu en module : en serverless, un compteur
 * global serait partagé entre des analyses sans rapport.
 */
export type Compteur = { appels: number; refus: number }

export function nouveauCompteur(): Compteur {
  return { appels: 0, refus: 0 }
}

/** Levée quand toutes les tentatives ont échoué. Le message ne porte pas la clé. */
export class ErreurHelius extends Error {}

function cle(): string {
  const valeur = process.env.HELIUS_API_KEY?.trim()
  if (valeur === undefined || valeur === '') {
    throw new ErreurHelius('HELIUS_API_KEY n’est pas configurée.')
  }
  return valeur
}

const dormir = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms))

async function poster(
  chemin: string,
  famille: Famille,
  corps: unknown,
  compteur: Compteur,
): Promise<unknown> {
  const url = `${HOTE}${chemin}?api-key=${encodeURIComponent(cle())}`

  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative += 1) {
    await attendreSonTour(famille)
    compteur.appels += 1

    let reponse: Response
    try {
      reponse = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(DELAI_APPEL_MS),
        // Les prix et les historiques bougent : rien à mettre en cache.
        cache: 'no-store',
      })
    } catch (cause) {
      if (tentative === TENTATIVES_MAX) {
        throw new ErreurHelius(`${chemin} injoignable après ${TENTATIVES_MAX} tentatives.`)
      }
      console.error(`Helius ${chemin} : tentative ${tentative} échouée.`, cause)
      await dormir(400 * 2 ** (tentative - 1))
      continue
    }

    // Quota dépassé : le seau entier ralentit, et on repasse par la file.
    if (reponse.status === 429) {
      compteur.refus += 1
      penaliser(famille, retryAfter(reponse.headers))
      if (tentative === TENTATIVES_MAX) {
        throw new ErreurHelius(`${chemin} a répondu 429 après ${TENTATIVES_MAX} tentatives.`)
      }
      continue
    }

    if (reponse.status >= 500) {
      compteur.refus += 1
      if (tentative === TENTATIVES_MAX) {
        throw new ErreurHelius(`${chemin} a répondu ${reponse.status}.`)
      }
      await dormir(400 * 2 ** (tentative - 1))
      continue
    }

    // Une 4xx autre que 429 ne s'arrangera pas en réessayant.
    if (!reponse.ok) {
      throw new ErreurHelius(`${chemin} a répondu ${reponse.status}.`)
    }

    try {
      return await reponse.json()
    } catch {
      throw new ErreurHelius(`${chemin} a renvoyé une réponse illisible.`)
    }
  }

  throw new ErreurHelius(`${chemin} : toutes les tentatives ont échoué.`)
}

// ---------------------------------------------------------------------------
// Les appels dont l'analyse a besoin
// ---------------------------------------------------------------------------

/**
 * Une page d'historique d'un compte, bornée dans le temps.
 *
 * `adresse` peut être un wallet comme un mint : la sonde a confirmé que
 * l'historique d'un mint renvoie bien les transactions qui le touchent. Les
 * pages arrivent dans l'ordre chronologique (`asc`), ce qui rend une lecture
 * tronquée exploitable — elle couvre le début de la fenêtre.
 */
export async function pageHistorique(
  adresse: string,
  bornes: { debut: number; fin: number },
  jeton: string | null,
  compteur: Compteur,
): Promise<unknown> {
  const corps: Record<string, unknown> = {
    address: adresse,
    limit: 100,
    sortOrder: 'asc',
    commitment: 'confirmed',
    time: { gte: bornes.debut, lte: bornes.fin },
  }
  if (jeton !== null) corps.paginationToken = jeton

  return poster('/v1/parsed-events/transaction-history', 'rest', corps, compteur)
}

/** Les métadonnées d'un token (DAS `getAsset`). */
export async function assetDuToken(mint: string, compteur: Compteur): Promise<unknown> {
  return poster(
    '/',
    'das',
    { jsonrpc: '2.0', id: 'ruggers', method: 'getAsset', params: { id: mint } },
    compteur,
  )
}

/**
 * Les métadonnées de plusieurs tokens, en un appel.
 *
 * DAS accepte jusqu'à mille adresses par requête. Sur le plan gratuit, limité à
 * deux requêtes DAS par seconde, c'est la différence entre quatre secondes
 * d'attente pour sept tokens et une seule requête.
 */
export async function assetsDesTokens(
  mints: readonly string[],
  compteur: Compteur,
): Promise<unknown> {
  return poster(
    '/',
    'das',
    {
      jsonrpc: '2.0',
      id: 'ruggers',
      method: 'getAssetBatch',
      params: { ids: [...mints], options: { showFungible: true } },
    },
    compteur,
  )
}
