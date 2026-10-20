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
 *
 * Avec une exception, mesurée : **le parser ne reconnaît pas tous les
 * routeurs**. Un wallet passant par FlashX voit ses 1 756 transactions d'une
 * journée résumées en `transfer`, `parsedData` à `null`, et `parserStatus` à
 * `OK` — le parser n'avoue pas qu'il a renoncé. Les mouvements, eux, sont tous
 * là. `swapsDepuisTransferts` les recompose quand, et seulement quand, le
 * résumé n'annonce aucun swap.
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
  /**
   * Vrai quand le swap a été recomposé depuis les transferts, faute de résumé.
   *
   * Absent — et non `false` — sur un swap déclaré par l'API : la clé n'apparaît
   * que là où elle apprend quelque chose, et son absence se lit comme « lu tel
   * quel ».
   */
  reconstruit?: true
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
    const resume = champ(champ(transaction, 'parsed'), 'summary')

    // Le résumé annonce un swap : on le lit, et on s'en tient là. S'il est
    // abîmé, il n'est pas rafistolé — une réponse qui se contredit n'est pas
    // une réponse incomplète, et la recomposer reviendrait à deviner.
    if (texte(champ(resume, 'type')) === 'swap') {
      const declare = swapDeclare(transaction, resume)
      if (declare !== null) swaps.push(declare)
      continue
    }

    swaps.push(...swapsDepuisTransferts(transaction))
  }

  return swaps
}

/** Le swap tel que `parsedData` l'annonce. `null` si la réponse ne suit pas. */
function swapDeclare(transaction: unknown, resume: unknown): Swap | null {
  const donnees = champ(resume, 'parsedData')
  const mintEntree = texte(champ(donnees, 'input_mint'))
  const mintSortie = texte(champ(donnees, 'output_mint'))
  if (mintEntree === null || mintSortie === null) return null

  const bruitEntree = nombre(champ(donnees, 'in_amount'))
  const bruitSortie = nombre(champ(donnees, 'actual_out_amount'))
  if (bruitEntree === null || bruitSortie === null) return null
  if (bruitEntree <= 0 || bruitSortie <= 0) return null

  const signature = texte(champ(transaction, 'signature'))
  const horodatage = nombre(champ(champ(transaction, 'parsed'), 'blockTime'))
  if (signature === null || horodatage === null) return null

  // Le token du swap est celui qui n'est pas du SOL ; s'il y en a deux, on
  // prend celui de sortie, qui est le token acheté.
  const mintToken = mintEntree === WSOL ? mintSortie : mintEntree

  return {
    signature,
    horodatage,
    protocole: texte(champ(donnees, 'protocol')),
    mintEntree,
    mintSortie,
    bruitEntree,
    bruitSortie,
    decimales: decimalesDuMint(transaction, mintToken),
  }
}

/** Le SOL qu'un compte a échangé avec chacun de ses voisins, en lamports. */
type Flux = Map<string, number>

function ajouterFlux(flux: Flux, compte: string, montant: number): void {
  flux.set(compte, (flux.get(compte) ?? 0) + montant)
}

/** Un lot de tokens d'un même mint, et d'où il vient — ou bien où il va. */
type Lot = { brut: number; contreparties: string[] }

function ajouterLot(lots: Map<string, Lot>, mint: string, brut: number, voisin: string): void {
  const lot = lots.get(mint)
  if (lot === undefined) {
    lots.set(mint, { brut, contreparties: [voisin] })
    return
  }
  lot.brut += brut
  if (!lot.contreparties.includes(voisin)) lot.contreparties.push(voisin)
}

/**
 * Les swaps d'une transaction que le parser n'a pas su classer.
 *
 * Le pivot est le **payeur de frais** : c'est lui qui a signé, donc lui qui
 * achète ou qui vend. Ce choix fait tenir les deux usages de ce module avec un
 * seul code — sur l'historique d'un wallet, le payeur est le wallet suivi ; sur
 * celui d'un mint, c'est le trader dont le prix nous intéresse pour l'ATH.
 *
 * Un achat est alors l'appariement d'un **token reçu** et du **SOL envoyé à
 * celui qui l'a envoyé**, dans la même transaction ; une vente est le miroir.
 * Apparier par contrepartie, plutôt que de sommer tout ce qui sort du wallet,
 * est ce qui laisse de côté la priority fee, le tip et le loyer du compte
 * token : ils partent ailleurs. Le prix d'entrée reste celui du swap.
 *
 * Ce que cette méthode ne voit pas, et c'est assumé : une pool dont les coffres
 * sont séparés, où le SOL part vers un compte qui n'est pas celui d'où vient le
 * token. L'appariement échoue alors, et la transaction est ignorée comme avant.
 */
export function swapsDepuisTransferts(transaction: unknown): Swap[] {
  const parsed = champ(transaction, 'parsed')
  const payeur = texte(champ(parsed, 'feePayer'))
  const signature = texte(champ(transaction, 'signature'))
  const horodatage = nombre(champ(parsed, 'blockTime'))
  if (payeur === null || signature === null || horodatage === null) return []

  const solSorti: Flux = new Map()
  const solRecu: Flux = new Map()

  for (const transfert of tableau(champ(parsed, 'nativeTransfers'))) {
    const de = texte(champ(transfert, 'fromUserAccount'))
    const vers = texte(champ(transfert, 'toUserAccount'))
    const montant = nombre(champ(transfert, 'amount'))
    if (montant === null || montant <= 0 || de === vers) continue
    if (de === payeur && vers !== null) ajouterFlux(solSorti, vers, montant)
    else if (vers === payeur && de !== null) ajouterFlux(solRecu, de, montant)
  }

  const entres = new Map<string, Lot>()
  const sortis = new Map<string, Lot>()

  for (const transfert of tableau(champ(parsed, 'tokenTransfers'))) {
    const mint = texte(champ(transfert, 'mint'))
    const de = texte(champ(transfert, 'fromUserAccount'))
    const vers = texte(champ(transfert, 'toUserAccount'))
    const brut = nombre(champ(transfert, 'rawTokenAmount'))
    if (mint === null || brut === null || brut <= 0 || de === vers) continue

    // Le SOL enveloppé est du SOL : certains routeurs paient en WSOL plutôt
    // qu'en natif, et le traiter comme un token ferait un swap token/token.
    if (mint === WSOL) {
      if (de === payeur && vers !== null) ajouterFlux(solSorti, vers, brut)
      else if (vers === payeur && de !== null) ajouterFlux(solRecu, de, brut)
      continue
    }

    if (vers === payeur && de !== null) ajouterLot(entres, mint, brut, de)
    else if (de === payeur && vers !== null) ajouterLot(sortis, mint, brut, vers)
  }

  const swaps: Swap[] = []

  /**
   * Le SOL échangé avec les contreparties d'un lot, **consommé** au passage.
   *
   * Consommé parce qu'une transaction peut porter deux tokens d'une même
   * contrepartie : sans ce retrait, chacun se verrait attribuer la totalité du
   * SOL et les deux prix d'entrée seraient faux.
   */
  const apparier = (flux: Flux, lot: Lot): number => {
    let total = 0
    for (const contrepartie of lot.contreparties) {
      total += flux.get(contrepartie) ?? 0
      flux.delete(contrepartie)
    }
    return total
  }

  for (const [mint, lot] of entres) {
    const lamports = apparier(solSorti, lot)
    if (lamports <= 0) continue
    swaps.push({
      signature,
      horodatage,
      protocole: null,
      mintEntree: WSOL,
      mintSortie: mint,
      bruitEntree: lamports,
      bruitSortie: lot.brut,
      decimales: decimalesDuMint(transaction, mint),
      reconstruit: true,
    })
  }

  for (const [mint, lot] of sortis) {
    const lamports = apparier(solRecu, lot)
    if (lamports <= 0) continue
    swaps.push({
      signature,
      horodatage,
      protocole: null,
      mintEntree: mint,
      mintSortie: WSOL,
      bruitEntree: lot.brut,
      bruitSortie: lamports,
      decimales: decimalesDuMint(transaction, mint),
      reconstruit: true,
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
