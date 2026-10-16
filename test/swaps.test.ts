import { describe, expect, it } from 'vitest'

import {
  decimalesDuMint,
  jetonSuivant,
  lireMetasDuLot,
  lireMetaToken,
  lirePrix,
  lireSwaps,
  transactionsDe,
  WSOL,
} from '@/lib/helius/swaps'

/**
 * Les réponses fabriquées ici reprennent la forme **réelle** de Parsed Events,
 * relevée par la sonde : montants en chaînes, `rawTokenAmount` en nombre avec
 * `decimals` en champ frère, `kind` présent mais non fiable.
 *
 * Toutes les adresses sont fictives.
 */

const MINT = 'Mint1111111111111111111111111111111111pump'
const AUTRE = 'Mint2222222222222222222222222222222222pump'
const WALLET = 'Wa11et11111111111111111111111111111111111111'

/** Un achat : le wallet donne du SOL, reçoit un token. */
function achat(options: {
  signature?: string
  horodatage?: number
  mint?: string
  lamports?: string
  brut?: string
  decimales?: number
  protocole?: string | null
  kind?: string
  /** Transferts de SOL parasites : tips, frais de bot, création de compte. */
  parasites?: number[]
  fee?: number
}) {
  const mint = options.mint ?? MINT
  const decimales = options.decimales ?? 6
  const lamports = options.lamports ?? '515510578'

  return {
    signature: options.signature ?? 'Sig1',
    parserStatus: 'OK',
    parsed: {
      slot: 456_599_454,
      blockTime: options.horodatage ?? 1_791_928_955,
      fee: options.fee ?? 1_093_800,
      feePayer: WALLET,
      transactionStatus: 'OK',
      error: null,
      decodedError: null,
      nativeTransfers: [
        { fromUserAccount: WALLET, toUserAccount: 'Poo1', amount: Number(lamports) },
        ...(options.parasites ?? []).map((amount, i) => ({
          fromUserAccount: WALLET,
          toUserAccount: `Tip${i}`,
          amount,
        })),
      ],
      tokenTransfers: [
        {
          fromUserAccount: 'Poo1',
          toUserAccount: WALLET,
          fromTokenAccount: 'Ata1',
          toTokenAccount: 'Ata2',
          rawTokenAmount: Number(options.brut ?? '8910986965515'),
          decimals: decimales,
          tokenStandard: 'Fungible',
          mint,
        },
      ],
      summary: {
        type: 'swap',
        description: 'swap',
        parsedData: {
          type: 'swap',
          protocol: options.protocole === undefined ? 'pump_fun' : options.protocole,
          kind: options.kind ?? 'buy',
          in_amount: lamports,
          actual_out_amount: options.brut ?? '8910986965515',
          input_mint: WSOL,
          output_mint: mint,
          inner_swaps: [],
        },
      },
      instructions: [],
    },
  }
}

/** Une transaction qui n'est pas un swap. Il en passe beaucoup. */
function transfert() {
  return {
    signature: 'SigT',
    parserStatus: 'OK',
    parsed: {
      blockTime: 1_791_928_900,
      nativeTransfers: [],
      tokenTransfers: [],
      summary: { type: 'transfer', description: 'transfer', parsedData: {} },
      instructions: [],
    },
  }
}

describe('lireSwaps', () => {
  it('lit un achat dont les montants sont des chaînes', () => {
    const swap = lireSwaps([achat({})])[0]

    expect(swap).toEqual({
      signature: 'Sig1',
      horodatage: 1_791_928_955,
      protocole: 'pump_fun',
      mintEntree: WSOL,
      mintSortie: MINT,
      bruitEntree: 515_510_578,
      bruitSortie: 8_910_986_965_515,
      decimales: 6,
    })
  })

  it('écarte ce qui n’est pas un swap', () => {
    expect(lireSwaps([transfert(), achat({}), transfert()])).toHaveLength(1)
  })

  it('tolère un swap sans protocole', () => {
    const swap = lireSwaps([achat({ protocole: null })])[0]!
    expect(swap.protocole).toBeNull()
  })

  it('écarte un swap aux montants illisibles plutôt que de deviner', () => {
    const casse = achat({})
    // Une réponse abîmée : le montant n'est pas un nombre lisible.
    casse.parsed.summary.parsedData.in_amount = 'beaucoup'
    expect(lireSwaps([casse])).toHaveLength(0)
  })

  it('écarte un swap sans horodatage', () => {
    const casse = achat({})
    // @ts-expect-error — réponse abîmée.
    casse.parsed.blockTime = null
    expect(lireSwaps([casse])).toHaveLength(0)
  })

  it('n’avale pas une liste vide de travers', () => {
    expect(lireSwaps([])).toEqual([])
  })
})

describe('decimalesDuMint', () => {
  it('lit les décimales dans les transferts, sans appel DAS', () => {
    expect(decimalesDuMint(achat({ decimales: 9 }), MINT)).toBe(9)
  })

  it('rend null pour un mint absent des transferts', () => {
    expect(decimalesDuMint(achat({}), AUTRE)).toBeNull()
  })
})

describe('pagination', () => {
  it('lit les transactions et le jeton suivant', () => {
    const reponse = { data: [achat({})], paginationToken: 'suite' }
    expect(transactionsDe(reponse)).toHaveLength(1)
    expect(jetonSuivant(reponse)).toBe('suite')
  })

  it('rend null quand il n’y a plus de page', () => {
    expect(jetonSuivant({ data: [], paginationToken: null })).toBeNull()
    expect(jetonSuivant({ data: [] })).toBeNull()
  })
})

describe('lireMetaToken', () => {
  it('lit le nom, les décimales et ramène la supply en unités entières', () => {
    const meta = lireMetaToken({
      result: {
        content: { metadata: { name: 'Jeton Fictif' } },
        token_info: { decimals: 6, supply: 960_590_499_000_000 },
      },
    })

    expect(meta).toEqual({ nom: 'Jeton Fictif', decimales: 6, supply: 960_590_499 })
  })

  it('encaisse une réponse vide', () => {
    expect(lireMetaToken({})).toEqual({ nom: null, decimales: null, supply: null })
  })

  it('ne rend pas de supply sans décimales pour la ramener', () => {
    const meta = lireMetaToken({ result: { token_info: { supply: 1_000 } } })
    expect(meta.supply).toBeNull()
  })
})

describe('lirePrix', () => {
  it('lit le prix en dollars', () => {
    expect(
      lirePrix({ result: { token_info: { price_info: { price_per_token: 105.27 } } } }),
    ).toBe(105.27)
  })

  it('rend null quand DAS ne connaît pas le token', () => {
    expect(lirePrix({ result: { token_info: {} } })).toBeNull()
  })
})

describe('lireMetasDuLot', () => {
  it('range les métadonnées par mint, sans se fier à l’ordre', () => {
    const metas = lireMetasDuLot({
      result: [
        { id: AUTRE, content: { metadata: { name: 'Second' } }, token_info: { decimals: 6, supply: 1_000_000_000_000_000 } },
        { id: MINT, content: { metadata: { name: 'Premier' } }, token_info: { decimals: 6, supply: 960_000_000_000_000 } },
      ],
    })

    expect(metas.get(MINT)?.nom).toBe('Premier')
    expect(metas.get(AUTRE)?.nom).toBe('Second')
    expect(metas.get(MINT)?.supply).toBe(960_000_000)
  })

  it('ignore un élément sans identifiant plutôt que de le ranger au hasard', () => {
    const metas = lireMetasDuLot({
      result: [null, { content: { metadata: { name: 'Orphelin' } } }, { id: MINT }],
    })

    expect(metas.size).toBe(1)
    expect(metas.has(MINT)).toBe(true)
  })

  it('encaisse une réponse vide', () => {
    expect(lireMetasDuLot({}).size).toBe(0)
  })
})
