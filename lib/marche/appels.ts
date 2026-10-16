import 'server-only'

/**
 * Les appels aux sources de marché.
 *
 * Deux services gratuits et sans clé, donc rien à protéger dans les journaux —
 * mais les mêmes précautions qu'Helius pour le reste : délai borné, nouvelle
 * tentative sur refus, et le limiteur partagé qui tient les débits.
 */

import { attendreSonTour, penaliser, retryAfter } from '../helius/limiteur'
import type { Compteur } from '../helius/appels'

export const DELAI_APPEL_MS = 15_000
export const TENTATIVES_MAX = 5

const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens'
const GECKOTERMINAL = 'https://api.geckoterminal.com/api/v2/networks/solana/pools'
const GECKOTERMINAL_TOKENS = 'https://api.geckoterminal.com/api/v2/networks/solana/tokens'
const TRACKER = 'https://data.solanatracker.io'

/** Adresses par appel DexScreener. L'endpoint en accepte trente. */
export const MINTS_PAR_APPEL = 30

export class ErreurMarche extends Error {}

const dormir = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms))

async function lire(
  url: string,
  famille: 'dexscreener' | 'gecko' | 'tracker',
  etiquette: string,
  compteur: Compteur,
  entetes: Record<string, string> = {},
): Promise<unknown> {
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative += 1) {
    await attendreSonTour(famille)
    compteur.appels += 1

    let reponse: Response
    try {
      reponse = await fetch(url, {
        headers: { accept: 'application/json', ...entetes },
        signal: AbortSignal.timeout(DELAI_APPEL_MS),
        cache: 'no-store',
      })
    } catch (cause) {
      if (tentative === TENTATIVES_MAX) {
        throw new ErreurMarche(`${etiquette} injoignable.`)
      }
      await dormir(400 * 2 ** (tentative - 1))
      continue
    }

    if (reponse.status === 429) {
      compteur.refus += 1
      penaliser(famille, retryAfter(reponse.headers))
      if (tentative === TENTATIVES_MAX) {
        throw new ErreurMarche(`${etiquette} a répondu 429.`)
      }
      continue
    }

    if (reponse.status >= 500) {
      compteur.refus += 1
      if (tentative === TENTATIVES_MAX) {
        throw new ErreurMarche(`${etiquette} a répondu ${reponse.status}.`)
      }
      await dormir(400 * 2 ** (tentative - 1))
      continue
    }

    if (!reponse.ok) throw new ErreurMarche(`${etiquette} a répondu ${reponse.status}.`)

    try {
      return await reponse.json()
    } catch {
      throw new ErreurMarche(`${etiquette} a renvoyé une réponse illisible.`)
    }
  }

  throw new ErreurMarche(`${etiquette} : toutes les tentatives ont échoué.`)
}

/** Les paires de plusieurs mints, en un appel. */
export async function pairesDesMints(
  mints: readonly string[],
  compteur: Compteur,
): Promise<unknown> {
  const adresses = mints.slice(0, MINTS_PAR_APPEL).map(encodeURIComponent).join(',')
  return lire(`${DEXSCREENER}/${adresses}`, 'dexscreener', 'DexScreener', compteur)
}

/**
 * Les pools d'un mint selon GeckoTerminal.
 *
 * Un appel par mint, là où DexScreener en traite trente d'un coup : on ne s'en
 * sert donc que pour les tokens que DexScreener a manqués.
 */
export async function poolsDuMint(mint: string, compteur: Compteur): Promise<unknown> {
  return lire(
    `${GECKOTERMINAL_TOKENS}/${encodeURIComponent(mint)}/pools`,
    'gecko',
    'GeckoTerminal',
    compteur,
  )
}

/**
 * Les bougies d'un token chez Solana Tracker, à la minute.
 *
 * Source principale, et la seule des trois à s'interroger **par adresse de
 * token** : plus de pool à résoudre, un appel suffit. Deux paramètres comptent
 * autant que l'endpoint lui-même :
 *
 * - `currency=sol` rend les prix dans l'unité du prix d'entrée ;
 * - `removeOutliers=false` **désactive un filtre actif par défaut**. Sur ces
 *   tokens le sommet est souvent une pointe d'une minute, soit exactement ce
 *   qu'un filtre d'aberrations supprime.
 */
export async function bougiesDuTracker(
  mint: string,
  depuis: number,
  jusqua: number,
  compteur: Compteur,
): Promise<unknown> {
  const cle = process.env.SOLANATRACKER_API_KEY?.trim()
  if (cle === undefined || cle === '') {
    throw new ErreurMarche('SOLANATRACKER_API_KEY n’est pas configurée.')
  }

  const url =
    `${TRACKER}/chart/${encodeURIComponent(mint)}` +
    `?type=1m&time_from=${depuis}&time_to=${jusqua}` +
    `&currency=sol&removeOutliers=false`

  return lire(url, 'tracker', 'Solana Tracker', compteur, { 'x-api-key': cle })
}

/** Le mint de wrapped SOL, dont on lit le cours en dollars. */
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

/**
 * Le cours du SOL en dollars, à la minute, sur une sous-fenêtre.
 *
 * Découpé en sous-fenêtres parce que l'API rend les **dernières** bougies de
 * l'intervalle demandé : une requête sur trente heures en renvoie onze cents et
 * tronque le début. L'appelant ancre donc `jusqua` sur chaque tranche.
 */
export async function bougiesSolUsd(
  depuis: number,
  jusqua: number,
  compteur: Compteur,
): Promise<unknown> {
  const cle = process.env.SOLANATRACKER_API_KEY?.trim()
  if (cle === undefined || cle === '') {
    throw new ErreurMarche('SOLANATRACKER_API_KEY n’est pas configurée.')
  }

  const url =
    `${TRACKER}/chart/${WSOL_MINT}` +
    `?type=1m&time_from=${depuis}&time_to=${jusqua}` +
    `&currency=usd&removeOutliers=false`

  return lire(url, 'tracker', 'Solana Tracker (SOL/USD)', compteur, { 'x-api-key': cle })
}

/**
 * Les bougies d'une pool, à la minute.
 *
 * `before_timestamp` borne la fin de la fenêtre et `limit` le nombre de
 * bougies remontées depuis cette borne. `currency=token` donne le prix dans le
 * token de cotation — du SOL sur ces pools — plutôt qu'en dollars, ce qui
 * évite une conversion et un taux de change à dater.
 */
export async function bougiesDeLaPool(
  pool: string,
  jusqua: number,
  minutes: number,
  compteur: Compteur,
): Promise<unknown> {
  const url =
    `${GECKOTERMINAL}/${encodeURIComponent(pool)}/ohlcv/minute` +
    `?aggregate=1&before_timestamp=${jusqua}&limit=${minutes}` +
    `&currency=token&token=base`

  return lire(url, 'gecko', 'GeckoTerminal', compteur)
}
