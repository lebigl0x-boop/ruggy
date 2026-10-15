/**
 * Retrouver le nom d'un token à partir de son adresse.
 *
 * Pas d'import de `server-only` ici, comme pour `lib/db/seed.ts` : le script
 * de rattrapage des anciennes lignes tourne hors de Next.js. Rien n'y fuit —
 * la clé n'est lue qu'à l'appel, et seule l'action serveur touche ce module
 * depuis l'application.
 *
 * Pourquoi ce module existe : coller un CA dans le tableau doit suffire. Le
 * lien Padre, lui, se fabrique sans rien demander à personne — il ne dépend
 * que de l'adresse (voir `PADRE_URL`). Le nom, non : la page Padre est une
 * application monopage dont le HTML servi est identique pour tous les tokens
 * et ne contient ni le nom, ni même le CA. Rien à lire dans ses métadonnées,
 * il faut donc une source tierce.
 *
 * Deux sources, dans cet ordre :
 *
 * 1. Helius (DAS `getAsset`) lit la métadonnée Metaplex *on-chain*. Elle
 *    répond donc encore quand le token est mort — ce qui est précisément le
 *    cas courant ici : on suit des ruggers, leurs lancements n'ont plus de
 *    liquidité depuis longtemps.
 * 2. DexScreener en secours : gratuit et sans clé, mais il ne connaît que ce
 *    qui a une pool active. Il sauve la mise quand la clé Helius manque ou
 *    que le service est en vrac, pas quand le token est enterré.
 *
 * Les deux peuvent échouer : l'appelant doit savoir lire un `null`.
 */

export type TokenMeta = {
  /** Nom lisible du token. Jamais vide. */
  name: string
  /** Ticker, quand la source le donne. */
  symbol: string | null
  /** Qui a répondu. Sert au diagnostic quand un nom semble faux. */
  via: 'helius' | 'dexscreener'
}

const HELIUS_RPC = 'https://mainnet.helius-rpc.com'
const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens'

/**
 * Au-delà, on rend la main sans nom plutôt que de laisser la ligne en
 * attente : le CA raccourci fait un libellé acceptable, et le lien Padre
 * marche de toute façon.
 */
const DELAI_MS = 6000

export async function resolveTokenMeta(mint: string): Promise<TokenMeta | null> {
  return (await viaHelius(mint)) ?? (await viaDexscreener(mint))
}

// ---------------------------------------------------------------------------
// Les deux sources
// ---------------------------------------------------------------------------

async function viaHelius(mint: string): Promise<TokenMeta | null> {
  const cle = process.env.HELIUS_API_KEY
  if (cle === undefined || cle.trim() === '') return null

  const corps = await lireJson(`${HELIUS_RPC}/?api-key=${encodeURIComponent(cle)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'ruggers',
      method: 'getAsset',
      params: { id: mint },
    }),
  })

  return lireHelius(corps)
}

async function viaDexscreener(mint: string): Promise<TokenMeta | null> {
  const corps = await lireJson(`${DEXSCREENER}/${encodeURIComponent(mint)}`, {
    headers: { accept: 'application/json' },
  })

  return lireDexscreener(corps, mint)
}

// ---------------------------------------------------------------------------
// Lecture des réponses — pures, donc testables sans réseau
// ---------------------------------------------------------------------------

/**
 * Extrait le nom d'une réponse DAS `getAsset`.
 *
 * Le nom vit dans la métadonnée Metaplex, le ticker peut venir de là ou de
 * `token_info` selon la façon dont le token a été frappé. Un token sans nom
 * (métadonnée vide, ou retirée par le créateur) vaut une absence de réponse :
 * mieux vaut le CA raccourci qu'un libellé vide.
 */
export function lireHelius(corps: unknown): TokenMeta | null {
  const result = champ(champ(corps, 'result'), 'content')
  const metadata = champ(result, 'metadata')

  const name = texte(champ(metadata, 'name'))
  if (name === null) return null

  const symbol =
    texte(champ(metadata, 'symbol')) ??
    texte(champ(champ(champ(corps, 'result'), 'token_info'), 'symbol'))

  return { name, symbol, via: 'helius' }
}

/**
 * Extrait le nom d'une réponse DexScreener.
 *
 * Une paire a deux côtés et DexScreener ne garantit pas que le token demandé
 * soit le `baseToken` : sur une paire inversée, le lire sans vérifier
 * renverrait « Wrapped SOL » pour tous les tokens. D'où la comparaison
 * d'adresse, sensible à la casse — le base58 l'est.
 */
export function lireDexscreener(corps: unknown, mint: string): TokenMeta | null {
  const pairs = champ(corps, 'pairs')
  if (!Array.isArray(pairs)) return null

  for (const pair of pairs) {
    for (const cote of ['baseToken', 'quoteToken'] as const) {
      const token = champ(pair, cote)
      if (texte(champ(token, 'address')) !== mint) continue

      const name = texte(champ(token, 'name'))
      if (name === null) continue

      return { name, symbol: texte(champ(token, 'symbol')), via: 'dexscreener' }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/**
 * Un appel réseau qui ne lève jamais.
 *
 * Une source indisponible n'est pas une erreur d'application : on passe à la
 * suivante, et si toutes se taisent la ligne garde son CA. Laisser remonter
 * l'exception ferait échouer une action dont le seul but est un confort de
 * saisie.
 */
async function lireJson(url: string, init: RequestInit): Promise<unknown> {
  try {
    const reponse = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DELAI_MS),
      // Rien à mettre en cache ici : l'appel ne se fait qu'au collage d'un CA.
      cache: 'no-store',
    })
    if (!reponse.ok) return null
    return await reponse.json()
  } catch (cause) {
    console.error(`Résolution du nom de token : ${url.split('?')[0]} muet.`, cause)
    return null
  }
}

function champ(valeur: unknown, cle: string): unknown {
  if (typeof valeur !== 'object' || valeur === null) return undefined
  return (valeur as Record<string, unknown>)[cle]
}

function texte(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  const trimmed = valeur.trim()
  return trimmed === '' ? null : trimmed
}
