/**
 * Lecture des sources de marché : DexScreener pour la pool, GeckoTerminal pour
 * les bougies. Fonctions pures, testables sans réseau.
 *
 * Pourquoi deux sources et pas une : DexScreener sait associer un mint à sa
 * pool mais **ne publie aucun sommet** — seulement le prix courant, la
 * capitalisation du moment et des variations sur 1, 6 et 24 heures. C'est
 * vérifié, pas supposé. GeckoTerminal, lui, publie des bougies à la minute
 * mais les indexe par pool, pas par mint. L'une complète l'autre.
 *
 * Ce que cette voie change par rapport à la relecture des swaps : la fenêtre
 * est couverte en entier pour un appel au lieu de quarante pages, et le `high`
 * d'une bougie capture jusqu'aux mèches. Sur les mesures, la relecture
 * tronquée sous-estimait le sommet d'un facteur 4 à 8.
 */

/** Une bougie, telle que GeckoTerminal la renvoie. */
export type Bougie = {
  /** Secondes Unix du début de la minute. */
  horodatage: number
  haut: number
  cloture: number
}

function champ(valeur: unknown, cle: string): unknown {
  if (typeof valeur !== 'object' || valeur === null) return undefined
  return (valeur as Record<string, unknown>)[cle]
}

function texte(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  const propre = valeur.trim()
  return propre === '' ? null : propre
}

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
// DexScreener : mint → pool
// ---------------------------------------------------------------------------

export type Pool = {
  mint: string
  pool: string
  dex: string | null
  /** Liquidité en dollars, pour ordonner les pools d'un même token. */
  liquidite: number
  /** Création de la pool, en secondes Unix. Trahit une migration tardive. */
  creeeA: number | null
}

/**
 * Les pools d'une réponse DexScreener, rangées par mint.
 *
 * La réponse mélange les paires de tous les mints demandés : on se repère sur
 * `baseToken.address`. Une paire dont le mint demandé est en contrepartie
 * (`quoteToken`) n'est pas sa pool de cotation et ne nous sert à rien.
 *
 * Quand un mint a plusieurs pools, on garde celle qui porte le plus de
 * liquidité : c'est là que le prix se fait, et les bougies des pools
 * secondaires sont trop creuses pour dater un sommet.
 */
export function lirePools(corps: unknown): Map<string, Pool[]> {
  const parMint = new Map<string, Pool[]>()

  for (const paire of tableau(champ(corps, 'pairs'))) {
    // La validation qui compte : le mint demandé doit être le token **de base**
    // de la paire. S'il n'est qu'en contrepartie, cette pool cote autre chose.
    const mint = texte(champ(champ(paire, 'baseToken'), 'address'))
    const pool = texte(champ(paire, 'pairAddress'))
    if (mint === null || pool === null) continue

    const liste = parMint.get(mint) ?? []
    liste.push({
      mint,
      pool,
      dex: texte(champ(paire, 'dexId')),
      liquidite: nombre(champ(champ(paire, 'liquidity'), 'usd')) ?? 0,
      creeeA: horodatageMs(champ(paire, 'pairCreatedAt')),
    })
    parMint.set(mint, liste)
  }

  // De la plus liquide à la moins liquide : c'est l'ordre dans lequel on les
  // interrogera, et le budget d'appels par token est borné.
  for (const liste of parMint.values()) liste.sort((a, b) => b.liquidite - a.liquidite)

  return parMint
}

/** Un horodatage en millisecondes, ramené en secondes. */
function horodatageMs(valeur: unknown): number | null {
  const lu = nombre(valeur)
  return lu === null || lu <= 0 ? null : Math.floor(lu / 1000)
}

/** Un horodatage ISO-8601, en secondes. */
function horodatageIso(valeur: unknown): number | null {
  const brut = texte(valeur)
  if (brut === null) return null
  const lu = Date.parse(brut)
  return Number.isFinite(lu) ? Math.floor(lu / 1000) : null
}

/**
 * Les pools d'un mint selon GeckoTerminal.
 *
 * Second annuaire, consulté quand DexScreener n'a rien : celui-ci élague les
 * paires mortes, celui-là les garde. Mesuré sur un token enterré — DexScreener
 * annonçait zéro paire, GeckoTerminal en connaissait deux, dont une portant
 * trente-trois bougies et le vrai sommet.
 *
 * Un token pump.fun en a deux : sa courbe de bonding, créée au lancement et
 * quasiment pas indexée en bougies, et sa pool PumpSwap après migration, qui
 * porte tout l'historique exploitable. D'où le choix de la plus liquide.
 */
export function lirePoolsGecko(corps: unknown, mint: string): Pool[] {
  const pools: Pool[] = []

  for (const element of tableau(champ(corps, 'data'))) {
    // Les identifiants sont préfixés par le réseau : « solana_<adresse> ».
    const brut = texte(champ(element, 'id'))
    if (brut === null) continue
    const adresse = brut.replace(/^solana_/, '')

    /*
     * Cet endpoint est déjà filtré par token, donc l'appartenance est acquise
     * par construction. On la revérifie quand même si la réponse porte le
     * token de base : une pool qui coterait autre chose fausserait l'ATH, et
     * le coût du contrôle est nul.
     */
    const base = texte(
      champ(champ(champ(champ(element, 'relationships'), 'base_token'), 'data'), 'id'),
    )
    if (base !== null && base.replace(/^solana_/, '') !== mint) continue

    const attributs = champ(element, 'attributes')
    pools.push({
      mint,
      pool: adresse,
      dex: texte(champ(champ(champ(champ(element, 'relationships'), 'dex'), 'data'), 'id')),
      liquidite: nombre(champ(attributs, 'reserve_in_usd')) ?? 0,
      creeeA: horodatageIso(champ(attributs, 'pool_created_at')),
    })
  }

  pools.sort((a, b) => b.liquidite - a.liquidite)
  return pools
}

// ---------------------------------------------------------------------------
// GeckoTerminal : pool → bougies
// ---------------------------------------------------------------------------

/**
 * Les bougies d'une réponse GeckoTerminal.
 *
 * `ohlcv_list` est une liste de tuples `[horodatage, open, high, low, close,
 * volume]`. Seules les minutes qui ont vu passer un échange y figurent : la
 * liste est creuse, et c'est normal.
 */
export function lireBougies(corps: unknown): Bougie[] {
  const brutes = tableau(
    champ(champ(champ(corps, 'data'), 'attributes'), 'ohlcv_list'),
  )

  const bougies: Bougie[] = []

  for (const brute of brutes) {
    if (!Array.isArray(brute) || brute.length < 5) continue
    const horodatage = nombre(brute[0])
    const haut = nombre(brute[2])
    const cloture = nombre(brute[4])
    if (horodatage === null || haut === null || haut <= 0) continue
    bougies.push({ horodatage, haut, cloture: cloture ?? haut })
  }

  return bougies
}

/**
 * Les bougies d'une réponse Solana Tracker.
 *
 * Interrogée avec `currency=sol`, l'API rend directement des prix en SOL par
 * token : aucune conversion, donc aucune occasion de se tromper d'unité.
 *
 * Le tableau s'appelle `oclhv` dans leur schéma — vraisemblablement une
 * coquille pour `ohlcv`. On accepte les deux, et `data` par prudence.
 */
export function lireBougiesTracker(corps: unknown): Bougie[] {
  const brutes =
    tableau(champ(corps, 'oclhv')).length > 0
      ? tableau(champ(corps, 'oclhv'))
      : tableau(champ(corps, 'ohlcv')).length > 0
        ? tableau(champ(corps, 'ohlcv'))
        : tableau(champ(corps, 'data'))

  const bougies: Bougie[] = []

  for (const brute of brutes) {
    const horodatage = nombre(champ(brute, 'time'))
    const haut = nombre(champ(brute, 'high'))
    const cloture = nombre(champ(brute, 'close'))
    if (horodatage === null || haut === null || haut <= 0) continue
    bougies.push({ horodatage, haut, cloture: cloture !== null && cloture > 0 ? cloture : haut })
  }

  return bougies
}

/**
 * Une série de taux SOL/USD, indexée par minute.
 *
 * Construite une fois par analyse et consultée pour chaque ligne : convertir
 * une capitalisation avec le taux du jour de lecture donnerait un chiffre faux
 * dès qu'on regarde une journée passée.
 */
export function serieSolUsd(bougies: readonly Bougie[]): Map<number, number> {
  const serie = new Map<number, number>()
  for (const bougie of bougies) {
    if (bougie.cloture > 0) serie.set(Math.floor(bougie.horodatage / 60) * 60, bougie.cloture)
  }
  return serie
}

/** Tolérance de recherche dans la série, en minutes. */
export const TOLERANCE_TAUX_MIN = 10

/**
 * Le taux à un instant, par la minute connue la plus proche.
 *
 * `null` au-delà de la tolérance plutôt qu'un taux lointain : mieux vaut ne pas
 * afficher de dollars qu'en afficher de faux.
 */
export function tauxSolUsd(
  serie: ReadonlyMap<number, number>,
  horodatage: number,
): number | null {
  const minute = Math.floor(horodatage / 60) * 60
  for (let ecart = 0; ecart <= TOLERANCE_TAUX_MIN; ecart += 1) {
    const avant = serie.get(minute - ecart * 60)
    if (avant !== undefined) return avant
    const apres = serie.get(minute + ecart * 60)
    if (apres !== undefined) return apres
  }
  return null
}

/** Un point retenu sur la courbe : un prix en SOL par token, et quand. */
export type Point = { prix: number; horodatage: number }

export type SommetBougies = {
  /**
   * Le plus haut « high ». Il inclut les mèches : un prix touché une seconde
   * par un seul ordre compte autant qu'un palier tenu dix minutes.
   */
  brut: Point | null
  /**
   * Le plus haut « close ». Un cours de clôture a tenu jusqu'au bout de sa
   * minute, donc une sortie à ce prix était atteignable — d'où « exécutable ».
   * C'est la base de décision par défaut.
   */
  executable: Point | null
  /** Plus grand intervalle entre deux bougies retenues, en secondes. */
  trouMax: number
  /** Horodatage de la première bougie retenue. Trahit une couverture tardive. */
  premiere: number | null
  bougies: number
}

/**
 * La borne basse de lecture des bougies.
 *
 * La bougie qui *contient* l'achat est **gardée**. Son « high » peut en théorie
 * venir d'un pic antérieur à l'achat, mais sur les wallets suivis le sommet
 * tombe très souvent dans la première minute : l'écarter faisait perdre plus
 * d'ATH réels qu'elle n'en inventait. On remonte donc au début de la minute qui
 * contient l'achat.
 */
export function minuteDeLAchat(achat: number): number {
  return Math.floor(achat / 60) * 60
}

/**
 * Le sommet atteint dans une fenêtre, à partir des bougies.
 *
 * Deux valeurs plutôt qu'une : le plus haut « high » dit ce que le marché a
 * touché, le plus haut « close » ce qu'on aurait pu encaisser. L'écart entre
 * les deux mesure la part de mèche dans un sommet.
 *
 * Les prix sont rendus **tels quels**, en SOL par token : c'est l'unité du prix
 * d'entrée, et comparer deux prix dans la même unité est la seule façon
 * d'obtenir un multiple juste. Les capitalisations ne servent qu'à l'affichage.
 */
export function sommetDesBougies(
  bougies: readonly Bougie[],
  achat: number,
  jusqua: number,
): SommetBougies {
  const depuis = minuteDeLAchat(achat)

  const retenues = bougies
    .filter((b) => b.horodatage >= depuis && b.horodatage <= jusqua)
    .sort((a, b) => a.horodatage - b.horodatage)

  let brut: Point | null = null
  let executable: Point | null = null

  for (const bougie of retenues) {
    if (brut === null || bougie.haut > brut.prix) {
      brut = { prix: bougie.haut, horodatage: bougie.horodatage }
    }
    if (bougie.cloture > 0 && (executable === null || bougie.cloture > executable.prix)) {
      executable = { prix: bougie.cloture, horodatage: bougie.horodatage }
    }
  }

  // Le trou compte aussi celui qui précède la première bougie : une couverture
  // qui ne commence qu'une demi-heure après l'achat est un trou, pas un vide.
  let trouMax = 0
  let precedent = depuis
  for (const bougie of retenues) {
    trouMax = Math.max(trouMax, bougie.horodatage - precedent)
    precedent = bougie.horodatage + 60
  }

  return {
    brut,
    executable,
    trouMax,
    premiere: retenues[0]?.horodatage ?? null,
    bougies: retenues.length,
  }
}
