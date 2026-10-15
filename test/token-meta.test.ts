import { afterEach, describe, expect, it, vi } from 'vitest'

import { lireDexscreener, lireHelius, resolveTokenMeta } from '@/lib/token-meta'

const MINT = 'DW2EsD7bUL13VFQHcZ2XUJnQm7en6feLEW4f4Ka2pNLy'
const SOL = 'So11111111111111111111111111111111111111112'

describe('lireHelius', () => {
  it('lit le nom et le ticker de la métadonnée Metaplex', () => {
    const corps = {
      jsonrpc: '2.0',
      result: { content: { metadata: { name: 'Bonk', symbol: 'BONK' } } },
    }
    expect(lireHelius(corps)).toEqual({ name: 'Bonk', symbol: 'BONK', via: 'helius' })
  })

  it('se rabat sur token_info quand la métadonnée n’a pas de ticker', () => {
    const corps = {
      result: {
        content: { metadata: { name: 'Bonk' } },
        token_info: { symbol: 'BONK' },
      },
    }
    expect(lireHelius(corps)?.symbol).toBe('BONK')
  })

  it('ne rend rien sans nom : un libellé vide est pire que le CA', () => {
    expect(lireHelius({ result: { content: { metadata: { symbol: 'X' } } } })).toBeNull()
    expect(lireHelius({ result: { content: { metadata: { name: '  ' } } } })).toBeNull()
  })

  it('encaisse une erreur JSON-RPC ou un corps inattendu', () => {
    expect(lireHelius({ error: { code: -32000, message: 'boom' } })).toBeNull()
    expect(lireHelius(null)).toBeNull()
    expect(lireHelius('pas du JSON')).toBeNull()
  })
})

describe('lireDexscreener', () => {
  it('lit le côté de la paire qui porte l’adresse demandée', () => {
    const corps = {
      pairs: [
        {
          baseToken: { address: MINT, name: 'Ruggy', symbol: 'RUG' },
          quoteToken: { address: SOL, name: 'Wrapped SOL', symbol: 'SOL' },
        },
      ],
    }
    expect(lireDexscreener(corps, MINT)).toEqual({
      name: 'Ruggy',
      symbol: 'RUG',
      via: 'dexscreener',
    })
  })

  it('ne confond pas le token demandé avec sa contrepartie', () => {
    // Paire inversée : lire `baseToken` sans vérifier renverrait « Wrapped SOL ».
    const corps = {
      pairs: [
        {
          baseToken: { address: SOL, name: 'Wrapped SOL', symbol: 'SOL' },
          quoteToken: { address: MINT, name: 'Ruggy', symbol: 'RUG' },
        },
      ],
    }
    expect(lireDexscreener(corps, MINT)?.name).toBe('Ruggy')
  })

  it('rend null quand le token n’a plus de pool', () => {
    // Le cas courant ici : le lancement est mort, DexScreener l'a oublié.
    expect(lireDexscreener({ schemaVersion: '1.0.0', pairs: null }, MINT)).toBeNull()
    expect(lireDexscreener({ pairs: [] }, MINT)).toBeNull()
  })
})

describe('resolveTokenMeta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  /** Branche un faux `fetch` qui répond selon l'hôte appelé. */
  function brancher(reponses: Record<string, unknown | 'ko'>) {
    const appels: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const hote = new URL(url).hostname
        appels.push(hote)
        const reponse = reponses[hote]
        if (reponse === undefined || reponse === 'ko') {
          return { ok: false, status: 500, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => reponse }
      }),
    )
    return appels
  }

  it('interroge Helius en premier et s’arrête là s’il répond', async () => {
    vi.stubEnv('HELIUS_API_KEY', 'cle-de-test')
    const appels = brancher({
      'mainnet.helius-rpc.com': {
        result: { content: { metadata: { name: 'Ruggy', symbol: 'RUG' } } },
      },
    })

    expect(await resolveTokenMeta(MINT)).toEqual({
      name: 'Ruggy',
      symbol: 'RUG',
      via: 'helius',
    })
    expect(appels).toEqual(['mainnet.helius-rpc.com'])
  })

  it('passe à DexScreener quand Helius ne connaît pas le token', async () => {
    vi.stubEnv('HELIUS_API_KEY', 'cle-de-test')
    const appels = brancher({
      'mainnet.helius-rpc.com': { result: null },
      'api.dexscreener.com': {
        pairs: [{ baseToken: { address: MINT, name: 'Ruggy', symbol: 'RUG' } }],
      },
    })

    expect((await resolveTokenMeta(MINT))?.via).toBe('dexscreener')
    expect(appels).toEqual(['mainnet.helius-rpc.com', 'api.dexscreener.com'])
  })

  it('va droit à DexScreener sans clé Helius : pas d’appel inutile', async () => {
    vi.stubEnv('HELIUS_API_KEY', '')
    const appels = brancher({
      'api.dexscreener.com': {
        pairs: [{ baseToken: { address: MINT, name: 'Ruggy', symbol: null } }],
      },
    })

    expect((await resolveTokenMeta(MINT))?.name).toBe('Ruggy')
    expect(appels).toEqual(['api.dexscreener.com'])
  })

  it('rend null quand les deux sources se taisent, sans lever', async () => {
    vi.stubEnv('HELIUS_API_KEY', 'cle-de-test')
    brancher({})
    expect(await resolveTokenMeta(MINT)).toBeNull()
  })

  it('ne laisse pas une panne réseau casser la saisie', async () => {
    vi.stubEnv('HELIUS_API_KEY', 'cle-de-test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up')
      }),
    )
    expect(await resolveTokenMeta(MINT)).toBeNull()
  })
})
