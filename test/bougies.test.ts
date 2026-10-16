import { describe, expect, it } from 'vitest'

import {
  lireBougies,
  lireBougiesTracker,
  lirePools,
  lirePoolsGecko,
  minuteDeLAchat,
  serieSolUsd,
  sommetDesBougies,
  tauxSolUsd,
} from '@/lib/marche/bougies'

/**
 * Réponses fabriquées sur la forme **réelle**, relevée par sonde : DexScreener
 * ne publie aucun champ de sommet, seulement le prix courant et la liquidité ;
 * GeckoTerminal renvoie `data.attributes.ohlcv_list`, une liste de tuples.
 *
 * Toutes les adresses sont fictives.
 */

const MINT = 'Mint1111111111111111111111111111111111pump'
const AUTRE = 'Mint2222222222222222222222222222222222pump'
const WSOL = 'So11111111111111111111111111111111111111112'

function paire(options: {
  mint?: string
  pool: string
  liquidite?: number
  dex?: string
  /** Le mint demandé est en contrepartie et non en base. */
  inverse?: boolean
}) {
  const mint = options.mint ?? MINT
  return {
    chainId: 'solana',
    dexId: options.dex ?? 'pumpswap',
    pairAddress: options.pool,
    baseToken: { address: options.inverse === true ? WSOL : mint, symbol: 'TEST' },
    quoteToken: { address: options.inverse === true ? mint : WSOL, symbol: 'SOL' },
    priceNative: '0.00000002340',
    liquidity: { usd: options.liquidite ?? 1000 },
    marketCap: 2330,
    fdv: 2330,
  }
}

describe('lirePools', () => {
  it('associe un mint à ses pools', () => {
    const pools = lirePools({ pairs: [paire({ pool: 'Pool1' })] })
    expect(pools.get(MINT)).toHaveLength(1)
    expect(pools.get(MINT)?.[0]?.pool).toBe('Pool1')
  })

  it('rend toutes les pools, de la plus liquide à la moins', () => {
    // Le sommet peut tomber de part et d'autre d'une migration : on les
    // interroge toutes, en commençant par la plus profonde.
    const pools = lirePools({
      pairs: [
        paire({ pool: 'Creuse', liquidite: 50 }),
        paire({ pool: 'Profonde', liquidite: 9000 }),
        paire({ pool: 'Moyenne', liquidite: 400 }),
      ],
    })
    expect(pools.get(MINT)?.map((p) => p.pool)).toEqual(['Profonde', 'Moyenne', 'Creuse'])
  })

  it('ignore une paire où le mint demandé n’est qu’en contrepartie', () => {
    // Sans ce filtre, on prendrait la pool de cotation du SOL.
    const pools = lirePools({ pairs: [paire({ pool: 'Inversee', inverse: true })] })
    expect(pools.has(MINT)).toBe(false)
  })

  it('sépare plusieurs mints demandés d’un coup', () => {
    const pools = lirePools({
      pairs: [paire({ pool: 'P1' }), paire({ mint: AUTRE, pool: 'P2' })],
    })
    expect(pools.get(MINT)?.[0]?.pool).toBe('P1')
    expect(pools.get(AUTRE)?.[0]?.pool).toBe('P2')
  })

  it('rend une table vide quand aucune pool n’est connue', () => {
    // Le cas du token mort sur la courbe sans jamais migrer.
    expect(lirePools({ pairs: [] }).size).toBe(0)
    expect(lirePools({}).size).toBe(0)
  })
})

describe('lireBougies', () => {
  const reponse = (liste: unknown[]) => ({ data: { attributes: { ohlcv_list: liste } } })

  it('lit les tuples [horodatage, open, high, low, close, volume]', () => {
    const bougies = lireBougies(
      reponse([[1_700_000_060, 1e-7, 3e-7, 0.9e-7, 2e-7, 1234]]),
    )
    expect(bougies).toEqual([{ horodatage: 1_700_000_060, haut: 3e-7, cloture: 2e-7 }])
  })

  it('écarte les tuples incomplets ou illisibles', () => {
    const bougies = lireBougies(
      reponse([[1_700_000_000], 'bruit', null, [1_700_000_060, 1, 2, 3, 4, 5]]),
    )
    expect(bougies).toHaveLength(1)
  })

  it('écarte un sommet nul ou négatif', () => {
    expect(lireBougies(reponse([[1_700_000_000, 0, 0, 0, 0, 0]]))).toHaveLength(0)
  })

  it('encaisse une réponse vide', () => {
    expect(lireBougies({})).toEqual([])
    expect(lireBougies({ data: {} })).toEqual([])
  })
})

describe('minuteDeLAchat', () => {
  it('remonte au début de la minute qui contient l’achat', () => {
    // On la garde : sur ces wallets, le sommet tombe souvent dans la première
    // minute, et l'écarter faisait perdre des ATH réels.
    expect(minuteDeLAchat(1_700_000_107)).toBe(1_700_000_100)
  })

  it('ne bouge pas quand l’achat tombe pile sur la minute', () => {
    expect(minuteDeLAchat(1_700_000_100)).toBe(1_700_000_100)
  })
})

describe('sommetDesBougies', () => {
  // 1 699 999 980 tombe pile sur une minute ; l'achat est 7 s plus tard, donc
  // la première minute pleine est 1 700 000 040.
  const T0 = 1_699_999_987
  const M1 = 1_700_000_040

  it('retient le plus haut « high » et le plus haut « close » séparément', () => {
    const sommet = sommetDesBougies(
      [
        { horodatage: M1, haut: 4e-7, cloture: 1e-7 },
        { horodatage: M1 + 60, haut: 2e-7, cloture: 2e-7 },
      ],
      T0,
      T0 + 21_600,
    )

    // Le plus haut touché est une mèche de la première bougie…
    expect(sommet.brut?.prix).toBeCloseTo(4e-7, 12)
    expect(sommet.brut?.horodatage).toBe(M1)
    // …mais le plus haut tenu jusqu'au bout d'une minute est ailleurs.
    expect(sommet.executable?.prix).toBeCloseTo(2e-7, 12)
    expect(sommet.executable?.horodatage).toBe(M1 + 60)
  })

  it('garde la bougie qui contient l’achat', () => {
    // Le sommet de ce wallet tombe souvent dans la minute de l'achat.
    const sommet = sommetDesBougies(
      [
        { horodatage: 1_699_999_980, haut: 9e-7, cloture: 9e-7 },
        { horodatage: M1, haut: 1e-7, cloture: 1e-7 },
      ],
      T0,
      T0 + 21_600,
    )
    expect(sommet.brut?.prix).toBeCloseTo(9e-7, 12)
    expect(sommet.bougies).toBe(2)
  })

  it('écarte en revanche une bougie entièrement antérieure à l’achat', () => {
    const sommet = sommetDesBougies(
      [
        { horodatage: 1_699_999_920, haut: 9e-7, cloture: 9e-7 },
        { horodatage: M1, haut: 1e-7, cloture: 1e-7 },
      ],
      T0,
      T0 + 21_600,
    )
    expect(sommet.brut?.prix).toBeCloseTo(1e-7, 12)
  })

  it('ignore ce qui dépasse la fenêtre', () => {
    const sommet = sommetDesBougies(
      [
        { horodatage: M1, haut: 1e-7, cloture: 1e-7 },
        { horodatage: T0 + 30_000, haut: 9e-7, cloture: 9e-7 },
      ],
      T0,
      T0 + 21_600,
    )
    expect(sommet.brut?.prix).toBeCloseTo(1e-7, 12)
  })

  it('mesure le trou qui précède la première bougie', () => {
    // Une couverture qui ne commence qu'une demi-heure après l'achat est un
    // trou, pas un vide : c'est ce que la relecture des swaps doit combler.
    const sommet = sommetDesBougies(
      [{ horodatage: M1 + 1800, haut: 1e-7, cloture: 1e-7 }],
      T0,
      T0 + 21_600,
    )
    // Depuis le début de la minute de l'achat (1 699 999 980).
    expect(sommet.trouMax).toBe(1860)
    expect(sommet.premiere).toBe(M1 + 1800)
  })

  it('mesure le plus grand trou entre deux bougies', () => {
    const sommet = sommetDesBougies(
      [
        { horodatage: M1, haut: 1e-7, cloture: 1e-7 },
        { horodatage: M1 + 60, haut: 1e-7, cloture: 1e-7 },
        { horodatage: M1 + 900, haut: 1e-7, cloture: 1e-7 },
      ],
      T0,
      T0 + 21_600,
    )
    // Entre la fin de la deuxième (M1+120) et la troisième (M1+900).
    expect(sommet.trouMax).toBe(780)
    expect(sommet.bougies).toBe(3)
  })

  it('rend deux sommets nuls sans aucune bougie exploitable', () => {
    const sommet = sommetDesBougies([], T0, T0 + 21_600)
    expect(sommet.brut).toBeNull()
    expect(sommet.executable).toBeNull()
    expect(sommet.premiere).toBeNull()
  })
})

describe('lirePoolsGecko', () => {
  const reponse = (pools: unknown[]) => ({ data: pools })

  const pool = (id: string, liquidite: string | number, dex: string) => ({
    id: `solana_${id}`,
    attributes: { name: 'TEST / SOL', reserve_in_usd: liquidite },
    relationships: { dex: { data: { id: dex } } },
  })

  it('retire le préfixe de réseau de l’identifiant', () => {
    const trouvees = lirePoolsGecko(reponse([pool('Pool1', 2136.55, 'pumpswap')]), MINT)
    expect(trouvees[0]?.pool).toBe('Pool1')
    expect(trouvees[0]?.dex).toBe('pumpswap')
  })

  it('rend la courbe et la pool migrée, la plus liquide en tête', () => {
    // Les deux comptent : le sommet peut tomber de part et d'autre de la
    // migration.
    const trouvees = lirePoolsGecko(
      reponse([pool('Courbe', '0.0', 'pump-fun'), pool('Migree', '2136.55', 'pumpswap')]),
      MINT,
    )
    expect(trouvees.map((p) => p.pool)).toEqual(['Migree', 'Courbe'])
  })

  it('écarte une pool dont le token de base est un autre mint', () => {
    const trouvees = lirePoolsGecko(
      {
        data: [
          {
            id: 'solana_Etrangere',
            attributes: { reserve_in_usd: 9999 },
            relationships: { base_token: { data: { id: `solana_${AUTRE}` } } },
          },
        ],
      },
      MINT,
    )
    expect(trouvees).toHaveLength(0)
  })

  it('accepte une pool qui ne déclare pas son token de base', () => {
    // L'endpoint est déjà filtré par token : l'absence du champ n'est pas un
    // motif de rejet.
    const trouvees = lirePoolsGecko(reponse([pool('Sans', 10, 'pumpswap')]), MINT)
    expect(trouvees).toHaveLength(1)
  })

  it('rend une liste vide quand le token n’a aucune pool', () => {
    expect(lirePoolsGecko(reponse([]), MINT)).toEqual([])
    expect(lirePoolsGecko({}, MINT)).toEqual([])
  })
})

describe('lireBougiesTracker', () => {
  /** Forme réelle relevée par sonde : le tableau s'appelle « oclhv ». */
  const reponse = (liste: unknown[]) => ({ oclhv: liste })

  const bougie = (time: number, high: number, close: number) => ({
    open: high / 2,
    close,
    low: close / 2,
    high,
    volume: 11102,
    time,
  })

  it('lit le tableau « oclhv » et son horodatage en secondes', () => {
    const bougies = lireBougiesTracker(
      reponse([bougie(1_791_930_480, 4.808e-7, 2.794e-8)]),
    )
    expect(bougies).toEqual([
      { horodatage: 1_791_930_480, haut: 4.808e-7, cloture: 2.794e-8 },
    ])
  })

  it('accepte aussi « ohlcv » et « data »', () => {
    expect(lireBougiesTracker({ ohlcv: [bougie(1, 2e-7, 1e-7)] })).toHaveLength(1)
    expect(lireBougiesTracker({ data: [bougie(1, 2e-7, 1e-7)] })).toHaveLength(1)
  })

  it('retombe sur le haut quand la clôture est inexploitable', () => {
    const bougies = lireBougiesTracker(reponse([{ time: 10, high: 3e-7, close: 0 }]))
    expect(bougies[0]?.cloture).toBeCloseTo(3e-7, 12)
  })

  it('écarte une bougie sans sommet exploitable', () => {
    expect(lireBougiesTracker(reponse([{ time: 10, high: 0, close: 0 }]))).toHaveLength(0)
    expect(lireBougiesTracker(reponse([{ high: 1e-7 }]))).toHaveLength(0)
  })

  it('encaisse une réponse vide', () => {
    expect(lireBougiesTracker({})).toEqual([])
    expect(lireBougiesTracker(reponse([]))).toEqual([])
  })
})

describe('serieSolUsd et tauxSolUsd', () => {
  const T = 1_700_000_040

  it('indexe les clôtures par minute', () => {
    const serie = serieSolUsd([
      { horodatage: T, haut: 107, cloture: 106.5 },
      { horodatage: T + 60, haut: 108, cloture: 107.2 },
    ])
    expect(serie.get(T)).toBe(106.5)
    expect(serie.get(T + 60)).toBe(107.2)
  })

  it('trouve le taux de la minute exacte', () => {
    const serie = serieSolUsd([{ horodatage: T, haut: 107, cloture: 106.5 }])
    expect(tauxSolUsd(serie, T + 30)).toBe(106.5)
  })

  it('accepte la minute voisine dans la tolérance', () => {
    const serie = serieSolUsd([{ horodatage: T, haut: 107, cloture: 106.5 }])
    expect(tauxSolUsd(serie, T + 5 * 60)).toBe(106.5)
  })

  it('rend null au-delà de la tolérance', () => {
    // Un taux lu huit heures plus tard ne vaut rien : mieux vaut pas de dollars.
    const serie = serieSolUsd([{ horodatage: T, haut: 107, cloture: 106.5 }])
    expect(tauxSolUsd(serie, T + 8 * 3600)).toBeNull()
  })

  it('ignore une clôture nulle', () => {
    expect(serieSolUsd([{ horodatage: T, haut: 0.1, cloture: 0 }]).size).toBe(0)
  })
})
