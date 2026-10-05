import { describe, expect, it } from 'vitest'
import { DEFAULT_STRATEGY } from '@/lib/compute'
import type {
  GlobalSettings,
  WalletStatus,
  WalletWithTokens,
} from '@/lib/repo/types'
import {
  filterWallets,
  matchesQuery,
  matchesSegment,
  summarize,
  type WalletSummary,
} from '@/lib/summary'

const SETTINGS: GlobalSettings = { solPriceEur: null, defaults: DEFAULT_STRATEGY }

function wallet(
  label: string,
  gains: readonly (number | null)[],
  extra: Partial<WalletWithTokens> = {},
): WalletWithTokens {
  return {
    id: label,
    label,
    address: `adresse-${label}`,
    analyzedAt: '2026-10-05',
    notes: '',
    tagOverride: null,
    status: 'screening',
    testStartedAt: null,
    strategy: DEFAULT_STRATEGY,
    source: 'manual',
    createdAt: '',
    updatedAt: '',
    tokens: gains.map((gain, i) => ({
      id: `${label}-${i}`,
      walletId: label,
      position: i + 1,
      name: null,
      mint: null,
      gain,
      perteRug: null,
      delay: null,
      phase: 'screening' as const,
      dayId: null,
      source: 'manual' as const,
    })),
    days: [],
    ...extra,
  }
}

const dix = (hits: number) =>
  Array.from({ length: 10 }, (_, i) => (i < hits ? 150 : 20))

describe('summarize', () => {
  it('reprend le tag et le net calculés', () => {
    const resume = summarize(wallet('A', dix(5)), SETTINGS)
    expect(resume.tag).toBe('Rentable')
    // 5 × (+0,097) + 5 × (−0,093) = +0,020
    expect(resume.netSol).toBeCloseTo(0.02, 6)
    expect(resume.n).toBe(10)
  })

  it('respecte le tag manuel', () => {
    const resume = summarize(
      wallet('A', dix(5), { tagOverride: 'surveiller' }),
      SETTINGS,
    )
    expect(resume.tag).toBe('À surveiller')
  })

  it('reste « À compléter » tant que les tokens manquent', () => {
    expect(summarize(wallet('A', [150, 20]), SETTINGS).tag).toBe('À compléter')
  })
})

describe('matchesSegment', () => {
  const resume = (status: WalletStatus): WalletSummary => ({
    id: 'x',
    label: 'x',
    address: 'x',
    analyzedAt: '2026-01-01',
    status,
    tag: 'Rentable',
    n: 10,
    seuilAnalyse: 10,
    netSol: 0,
    joursObserves: 0,
    joursMinimum: 4,
    joursRestants: 4,
  })

  it('« Tous » laisse tout passer', () => {
    expect(matchesSegment(resume('rejete'), 'tous')).toBe(true)
  })

  it('sépare les wallets selon leur place dans l’entonnoir', () => {
    expect(matchesSegment(resume('screening'), 'screening')).toBe(true)
    expect(matchesSegment(resume('test'), 'screening')).toBe(false)
    expect(matchesSegment(resume('test'), 'test')).toBe(true)
    expect(matchesSegment(resume('valide'), 'valides')).toBe(true)
    expect(matchesSegment(resume('rejete'), 'ecartes')).toBe(true)
  })

  it('ne confond pas le statut avec le tag', () => {
    // Un wallet en test peut très bien être tagué « Rentable » : les deux
    // axes sont indépendants.
    expect(matchesSegment(resume('test'), 'valides')).toBe(false)
  })
})

describe('matchesQuery', () => {
  const resume: WalletSummary = {
    id: '1',
    label: 'Dév récidiviste',
    address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    analyzedAt: '2026-01-01',
    status: 'screening',
    tag: 'Rentable',
    n: 10,
    seuilAnalyse: 10,
    netSol: 0,
    joursObserves: 0,
    joursMinimum: 4,
    joursRestants: 4,
  }

  it('cherche dans le nom sans tenir compte des accents', () => {
    expect(matchesQuery(resume, 'dev')).toBe(true)
    expect(matchesQuery(resume, 'RÉCIDIVISTE')).toBe(true)
  })

  it('cherche aussi dans l’adresse', () => {
    expect(matchesQuery(resume, 'Tokenkeg')).toBe(true)
    expect(matchesQuery(resume, 'Q5DA')).toBe(true)
  })

  it('laisse tout passer quand la recherche est vide', () => {
    expect(matchesQuery(resume, '   ')).toBe(true)
  })

  it('ne trouve rien hors sujet', () => {
    expect(matchesQuery(resume, 'zzz')).toBe(false)
  })
})

describe('filterWallets', () => {
  it('combine la recherche et le filtre', () => {
    const summaries = [
      summarize(wallet('Alpha', dix(5), { status: 'test' }), SETTINGS),
      summarize(wallet('Beta', dix(1), { status: 'test' }), SETTINGS),
      summarize(wallet('Alphabis', dix(5)), SETTINGS),
    ]
    const resultat = filterWallets(summaries, { query: 'alpha', segment: 'test' })
    expect(resultat.map((r) => r.label)).toEqual(['Alpha'])
  })
})
