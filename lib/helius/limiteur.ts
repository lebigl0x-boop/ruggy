/**
 * Le limiteur de débit, commun à tous les appels Helius.
 *
 * Des pauses fixes ne marchent pas ici, et la mesure l'a montré : à 550 ms
 * d'intervalle — 1,8 requête par seconde — une analyse de sept tokens a pris
 * 25 refus 429, alors qu'une sonde isolée tient 250 ms sans broncher. Ce qui
 * est limité n'est pas l'intervalle entre deux requêtes mais le débit sur une
 * fenêtre glissante : une pause fixe paie donc le prix fort (66 % du temps
 * total) tout en se faisant quand même refuser en rafale.
 *
 * D'où un seau à jetons : il autorise une rafale courte puis se remplit à
 * débit constant, et surtout il est **partagé**. Trois tokens analysés de front
 * puisent dans le même seau, ce qu'une pause par appel ne sait pas faire.
 *
 * Deux seaux séparés, parce que les deux familles d'endpoints n'ont pas le même
 * quota : le JSON-RPC de DAS d'un côté, l'API REST des événements analysés de
 * l'autre.
 */

export type Famille = 'rest' | 'das' | 'dexscreener' | 'gecko' | 'tracker'

/**
 * Jetons par seconde.
 *
 * Valeurs **mesurées**, pas annoncées. Sur des pages réelles de cent
 * transactions, le plan gratuit a tenu 3,62 req/s sans un seul refus, tandis
 * qu'à 5 req/s avec trois tokens de front les 429 devenaient persistants. On
 * se cale donc à 3 : au-dessus du débit utile, sous le mur.
 *
 * `das` suit la limite annoncée du plan gratuit, et le lot (`getAssetBatch`)
 * fait qu'elle n'est de toute façon plus un goulot.
 */
export const DEBIT_PAR_SECONDE: Record<Famille, number> = {
  rest: 2,
  das: 2,
  // DexScreener annonce 300 requêtes par minute sur cet endpoint ; on reste
  // large, un seul appel suffit de toute façon pour une journée entière.
  dexscreener: 4,
  /*
   * GeckoTerminal annonce 30 appels par minute. À 0,5/s pile, la moindre
   * rafale fait dépasser la moyenne sur la première minute et déclenche des
   * refus en série : 0,45/s laisse la marge qui évite de tout payer en
   * réessais, lesquels coûtent bien plus cher que l'attente.
   */
  gecko: 0.45,
  // Solana Tracker annonce 3 req/s sur l'offre gratuite. Mesuré sans un refus.
  tracker: 3,
}

/**
 * Rafale autorisée, en jetons.
 *
 * Mesuré : après quelques secondes d'inactivité, sept requêtes partent
 * d'affilée sans la moindre pause avant que la huitième soit refusée. Le quota
 * se comporte donc comme un seau à jetons côté Helius aussi — c'est pourquoi
 * une sonde courte voyait 3,6 req/s passer alors qu'une analyse longue prenait
 * 27 refus à 3 req/s : la sonde vidait un seau plein, l'analyse vivait sur le
 * débit de reconstitution.
 *
 * On reste un cran sous la rafale observée, pour ne pas partir le seau à sec.
 */
export const RAFALE: Record<Famille, number> = {
  rest: 5,
  das: 2,
  dexscreener: 4,
  /*
   * Deux, pas dix. Les 30 appels par minute de GeckoTerminal sont comptés sur
   * une fenêtre glissante : une rafale de dix en prenait cinq de refus, une de
   * quatre en prenait encore une quinzaine sur une journée entière. Avec deux,
   * la moyenne de la première minute reste sous le plafond.
   */
  gecko: 2,
  tracker: 3,
}

/**
 * Pénalité par défaut quand Helius refuse sans dire combien attendre.
 *
 * Il le dit presque toujours : ses 429 portent un en-tête `retry-after`, à une
 * seconde sur les mesures. Cette constante n'est donc que le repli.
 */
export const PENALITE_MS = 1000

/**
 * Attente par défaut après un refus, quand le service ne dit pas combien.
 *
 * Helius le dit (`retry-after: 1`) et son seau se reconstitue vite.
 * GeckoTerminal ne le dit pas, et sa fenêtre se compte à la minute : une
 * seconde d'attente ne libère rien, il en faut plusieurs.
 */
export const PENALITE_PAR_FAMILLE: Record<Famille, number> = {
  rest: PENALITE_MS,
  das: PENALITE_MS,
  dexscreener: PENALITE_MS,
  gecko: 4000,
  tracker: PENALITE_MS,
}

type Seau = { jetons: number; dernier: number; penaliseJusqua: number }

/**
 * Les seaux vivent au niveau du module, donc par processus.
 *
 * En serverless chaque instance a les siens, ce qui est le bon grain : le
 * quota se compte par clé, mais une instance ne peut pas connaître le débit
 * des autres. Le rattrapage sur 429 s'en charge.
 */
const seaux: Record<Famille, Seau> = {
  rest: { jetons: RAFALE.rest, dernier: Date.now(), penaliseJusqua: 0 },
  das: { jetons: RAFALE.das, dernier: Date.now(), penaliseJusqua: 0 },
  dexscreener: { jetons: RAFALE.dexscreener, dernier: Date.now(), penaliseJusqua: 0 },
  gecko: { jetons: RAFALE.gecko, dernier: Date.now(), penaliseJusqua: 0 },
  tracker: { jetons: RAFALE.tracker, dernier: Date.now(), penaliseJusqua: 0 },
}

const dormir = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms))

function recharger(seau: Seau, famille: Famille, maintenant: number): void {
  const ecoule = (maintenant - seau.dernier) / 1000
  if (ecoule <= 0) return
  seau.jetons = Math.min(RAFALE[famille], seau.jetons + ecoule * DEBIT_PAR_SECONDE[famille])
  seau.dernier = maintenant
}

/**
 * Attend son tour, puis consomme un jeton.
 *
 * Les appels concurrents se mettent naturellement à la queue : chacun consomme
 * son jeton au moment où il en trouve un, et repasse par l'attente sinon.
 */
export async function attendreSonTour(famille: Famille): Promise<void> {
  const seau = seaux[famille]

  for (;;) {
    const maintenant = Date.now()

    if (maintenant < seau.penaliseJusqua) {
      await dormir(seau.penaliseJusqua - maintenant)
      continue
    }

    recharger(seau, famille, maintenant)

    if (seau.jetons >= 1) {
      seau.jetons -= 1
      return
    }

    // Le temps qu'il manque pour qu'un jeton se reconstitue.
    const manque = 1 - seau.jetons
    await dormir(Math.ceil((manque / DEBIT_PAR_SECONDE[famille]) * 1000))
  }
}

/**
 * Signale un 429 : tout le seau ralentit, pas seulement l'appel refusé.
 *
 * `secondes` vient de l'en-tête `retry-after` de la réponse. Le respecter vaut
 * mieux que deviner : c'est Helius qui sait quand son seau sera reconstitué.
 */
export function penaliser(famille: Famille, secondes?: number | null): void {
  const attente =
    secondes !== undefined && secondes !== null && Number.isFinite(secondes) && secondes > 0
      ? Math.min(secondes * 1000, 30_000)
      : PENALITE_PAR_FAMILLE[famille]

  const seau = seaux[famille]
  seau.penaliseJusqua = Date.now() + attente
  seau.jetons = 0
}

/** Lit `retry-after`, en secondes. `null` si l'en-tête manque ou est illisible. */
export function retryAfter(entetes: Headers): number | null {
  const brut = entetes.get('retry-after')
  if (brut === null) return null
  const lu = Number(brut.trim())
  return Number.isFinite(lu) && lu >= 0 ? lu : null
}

/** Remet les seaux à neuf. Réservé aux tests. */
export function reinitialiserLimiteur(): void {
  for (const famille of ['rest', 'das', 'dexscreener', 'gecko', 'tracker'] as const) {
    seaux[famille] = {
      jetons: RAFALE[famille],
      dernier: Date.now(),
      penaliseJusqua: 0,
    }
  }
}
