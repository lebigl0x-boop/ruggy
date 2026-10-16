/**
 * Lecture des réponses Parsed Events. Fonctions pures, donc testables sans
 * réseau — et c'est tout l'intérêt : la forme de ces réponses est la seule
 * chose qu'on ne maîtrise pas.
 *
 * Ce que la sonde a montré, et qui ne figure pas dans la documentation :
 *
 * - `in_amount` et `actual_out_amount` sont des **chaînes** ;
 * - `tokenTransfers[].rawTokenAmount` est un **nombre**, et `decimals` est un
 *   champ frère — pas l'objet `{tokenAmount, decimals}` de l'ancienne API ;
 * - `parsedData.kind` existe mais prend au moins sept valeurs (`buy`, `sell`,
 *   `buy_exact_sol_in`, `buy_exact_quote_in`, `swap`, `swap_base_in`, absent) :
 *   **on ne classe jamais sur lui**, mais sur les mints ;
 * - `protocol` manque sur une partie des swaps, sans que les montants soient
 *   pour autant inexploitables.
 *
 * D'où la règle de ce fichier : tout est lu défensivement, et une entrée qu'on
 * ne sait pas lire est ignorée plutôt que devinée.
 */

/** Le mint de wrapped SOL. C'est la contrepartie de tous les achats suivis. */
export const WSOL = 'So11111111111111111111111111111111111111112'

/** Un swap, ramené à ce dont le calcul a besoin. */
export type Swap = {
  signature: string
  /** Secondes Unix. */
  horodatage: number
  protocole: string | null
  mintEntree: string
  mintSortie: string
  /** Montants bruts, dans les unités de leur mint respectif. */
  bruitEntree: number
  bruitSortie: number
  /** Décimales du token non-SOL de ce swap, quand la réponse les donne. */
  decimales: number | null
}

// ---------------------------------------------------------------------------
// Accès défensifs
// ---------------------------------------------------------------------------

function champ(valeur: unknown, cle: string): unknown {
  if (typeof valeur !== 'object' || valeur === null) return undefined
  return (valeur as Record<string, unknown>)[cle]
}

function texte(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  const propre = valeur.trim()
  return propre === '' ? null : propre
}

/** Un nombre, qu'il arrive en nombre ou en chaîne. */
function nombre(valeur: unknown): number | null {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null
  if (typeof valeur !== 'string') return null
  const lu = Number(valeur.trim())
  return Number.isFinite(lu) ? lu : null
}

function tableau(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : []
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Les décimales d'un mint, lues dans les transferts d'une transaction.
 *
 * Évite un appel DAS par token : la transaction qui déplace le token porte
 * déjà l'information.
 */
export function decimalesDuMint(transaction: unknown, mint: string): number | null {
  for (const transfert of tableau(champ(champ(transaction, 'parsed'), 'tokenTransfers'))) {
    if (texte(champ(transfert, 'mint')) !== mint) continue
    const lu = champ(transfert, 'decimals')
    if (typeof lu === 'number' && Number.isInteger(lu) && lu >= 0) return lu
  }
  return null
}

/**
 * Les swaps d'une page de `transaction-history`.
 *
 * Une transaction qui n'est pas un swap, dont le parser a échoué, ou dont les
 * montants sont illisibles, est écartée sans bruit : il en passe beaucoup
 * (`transfer`, `create_token_account`…) et ce n'est pas une anomalie.
 */
export function lireSwaps(transactions: readonly unknown[]): Swap[] {
  const swaps: Swap[] = []

  for (const transaction of transactions) {
    const parsed = champ(transaction, 'parsed')
    const resume = champ(parsed, 'summary')
    if (texte(champ(resume, 'type')) !== 'swap') continue

    const donnees = champ(resume, 'parsedData')
    const mintEntree = texte(champ(donnees, 'input_mint'))
    const mintSortie = texte(champ(donnees, 'output_mint'))
    if (mintEntree === null || mintSortie === null) continue

    const bruitEntree = nombre(champ(donnees, 'in_amount'))
    const bruitSortie = nombre(champ(donnees, 'actual_out_amount'))
    if (bruitEntree === null || bruitSortie === null) continue
    if (bruitEntree <= 0 || bruitSortie <= 0) continue

    const signature = texte(champ(transaction, 'signature'))
    const horodatage = nombre(champ(parsed, 'blockTime'))
    if (signature === null || horodatage === null) continue

    // Le token du swap est celui qui n'est pas du SOL ; s'il y en a deux, on
    // prend celui de sortie, qui est le token acheté.
    const mintToken = mintEntree === WSOL ? mintSortie : mintEntree

    swaps.push({
      signature,
      horodatage,
      protocole: texte(champ(donnees, 'protocol')),
      mintEntree,
      mintSortie,
      bruitEntree,
      bruitSortie,
      decimales: decimalesDuMint(transaction, mintToken),
    })
  }

  return swaps
}

/**
 * Le jeton de page suivante, ou `null` à la fin.
 *
 * Son absence est la seule condition d'arrêt fiable : une page peut être vide
 * sans que l'historique soit épuisé.
 */
export function jetonSuivant(reponse: unknown): string | null {
  return texte(champ(reponse, 'paginationToken'))
}

/** Les transactions d'une page. */
export function transactionsDe(reponse: unknown): unknown[] {
  return tableau(champ(reponse, 'data'))
}

// ---------------------------------------------------------------------------
// Métadonnées DAS
// ---------------------------------------------------------------------------

export type MetaToken = {
  nom: string | null
  decimales: number | null
  /** Supply en unités entières, décimales déjà appliquées. */
  supply: number | null
}

/**
 * Nom, décimales et supply depuis une réponse `getAsset`.
 *
 * La supply renvoyée est la supply **actuelle** : les burns postérieurs à
 * l'achat y sont déjà. Elle n'est donc pas la bonne base pour une MC d'entrée
 * — voir `supplyRetenue` dans `lib/analyse.ts`.
 */
export function lireMetaToken(corps: unknown): MetaToken {
  const resultat = champ(corps, 'result')
  const infos = champ(resultat, 'token_info')

  const decimales = champ(infos, 'decimals')
  const dec =
    typeof decimales === 'number' && Number.isInteger(decimales) && decimales >= 0
      ? decimales
      : null

  const brute = nombre(champ(infos, 'supply'))

  return {
    nom: texte(champ(champ(champ(resultat, 'content'), 'metadata'), 'name')),
    decimales: dec,
    supply: brute !== null && dec !== null ? brute / 10 ** dec : null,
  }
}

/**
 * Les métadonnées d'une réponse `getAssetBatch`, rangées par mint.
 *
 * Le lot peut contenir des trous : DAS renvoie `null` pour une adresse qu'il
 * ne connaît pas, et la liste n'est pas garantie dans l'ordre demandé. On se
 * repère donc sur l'`id` de chaque élément, jamais sur sa position.
 */
export function lireMetasDuLot(corps: unknown): Map<string, MetaToken> {
  const metas = new Map<string, MetaToken>()

  for (const element of tableau(champ(corps, 'result'))) {
    const id = texte(champ(element, 'id'))
    if (id === null) continue
    // `lireMetaToken` attend l'enveloppe d'un `getAsset` : on la reconstitue.
    metas.set(id, lireMetaToken({ result: element }))
  }

  return metas
}

/** Le prix d'un token en dollars, si DAS le connaît. */
export function lirePrix(corps: unknown): number | null {
  const prix = champ(champ(champ(champ(corps, 'result'), 'token_info'), 'price_info'), 'price_per_token')
  const lu = nombre(prix)
  return lu !== null && lu > 0 ? lu : null
}
