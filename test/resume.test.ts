import { describe, expect, it } from 'vitest'

import { courbes, resumer, totaux } from '@/lib/resume'
import type { WalletComplet } from '@/lib/repo/types'

/** Un wallet fictif, réglages de référence : 0,05 · 300 % · 0,008. */
function wallet(partiel: Partial<WalletComplet> = {}): WalletComplet {
  return {
    id: 'w1',
    nom: 'Wallet fictif',
    adresse: 'AdresseFictive1111111111111111111111111111',
    phase: 'screening',
    reglages: { mise: 0.05, tp: 300, frais: 0.008 },
    tokensScreening: 10,
    joursTest: 5,
    notes: '',
    creeLe: '2026-01-01T10:00:00.000Z',
    testLe: null,
    tradeLe: null,
    tokens: [],
    jours: [],
    trades: [],
    ...partiel,
  }
}

const token = (
  phase: 'screening' | 'test',
  issue: 'tp' | 'rate',
  jour: string | null = null,
  position = 1,
) => ({ id: `t${position}-${jour ?? 's'}`, phase, jour, nom: null, mint: null, issue, position })

const trade = (date: string, entreeSol: number, sortieSol: number, issue: 'tp' | 'rate') => ({
  id: `tr-${date}`,
  date,
  nom: null,
  mint: null,
  entreeSol,
  sortieSol,
  issue,
})

describe('resumer', () => {
  it('met en avant le lot de la phase en cours', () => {
    const r = resumer(
      wallet({
        phase: 'test',
        jours: [{ id: 'j1', jour: '2026-02-01' }],
        tokens: [token('screening', 'tp'), token('test', 'rate', '2026-02-01', 2)],
      }),
    )

    // Le screening vaut +0,142, le test −0,058 : c'est le test qui s'affiche.
    expect(r.resultat).toBeCloseTo(-0.058, 10)
    expect(r.reel).toBe(false)
    expect(r.avancement).toEqual({ fait: 1, repere: 5 })
  })

  it('dit « réel » en phase de trade', () => {
    const r = resumer(
      wallet({ phase: 'trade', trades: [trade('2026-03-01', 0.05, 0.2, 'tp')] }),
    )

    expect(r.reel).toBe(true)
    expect(r.resultat).toBeCloseTo(0.15, 10)
    expect(r.rendement).toBeCloseTo(300, 10)
  })

  it('montre le lot le plus avancé d’un wallet archivé', () => {
    // Archiver ne doit pas rendre l'historique illisible.
    const r = resumer(
      wallet({
        phase: 'archive',
        tokens: [token('screening', 'tp')],
        trades: [trade('2026-03-01', 0.05, 0.3, 'tp')],
      }),
    )

    expect(r.reel).toBe(true)
    expect(r.resultat).toBeCloseTo(0.25, 10)
  })
})

describe('totaux', () => {
  it('tient les trois lots séparés', () => {
    const t = totaux([
      wallet({ id: 'a', tokens: [token('screening', 'tp')] }),
      wallet({
        id: 'b',
        jours: [{ id: 'j1', jour: '2026-02-01' }],
        tokens: [token('test', 'rate', '2026-02-01')],
      }),
      wallet({ id: 'c', trades: [trade('2026-03-01', 0.05, 0.2, 'tp')] }),
    ])

    expect(t.screening).toBeCloseTo(0.142, 10)
    expect(t.test).toBeCloseTo(-0.058, 10)
    expect(t.reel).toBeCloseTo(0.15, 10)
    // Aucun des trois n'est la somme des autres.
    expect(t.reel).not.toBeCloseTo(t.test + t.screening, 5)
  })

  it('compte les wallets par phase', () => {
    const t = totaux([
      wallet({ id: 'a', phase: 'screening' }),
      wallet({ id: 'b', phase: 'test' }),
      wallet({ id: 'c', phase: 'test' }),
      wallet({ id: 'd', phase: 'archive' }),
    ])

    expect(t.parPhase).toEqual({ screening: 1, test: 2, trade: 0, archive: 1 })
  })

  it('compte zéro partout sans aucun wallet', () => {
    const t = totaux([])
    expect(t).toMatchObject({ reel: 0, test: 0, screening: 0, trades: 0, jours: 0 })
  })
})

describe('courbes', () => {
  it('cumule deux wallets relevés le même jour en un seul point', () => {
    const c = courbes([
      wallet({
        id: 'a',
        jours: [{ id: 'j1', jour: '2026-02-01' }],
        tokens: [token('test', 'tp', '2026-02-01')],
      }),
      wallet({
        id: 'b',
        jours: [{ id: 'j2', jour: '2026-02-01' }],
        tokens: [token('test', 'tp', '2026-02-01')],
      }),
    ])

    expect(c.test).toHaveLength(1)
    expect(c.test[0]!.cumul).toBeCloseTo(0.284, 10)
  })

  it('remet les dates dans l’ordre du temps', () => {
    const c = courbes([
      wallet({
        jours: [
          { id: 'j2', jour: '2026-02-05' },
          { id: 'j1', jour: '2026-02-01' },
        ],
        tokens: [
          token('test', 'rate', '2026-02-05', 1),
          token('test', 'tp', '2026-02-01', 2),
        ],
      }),
    ])

    expect(c.test.map((p) => p.repere)).toEqual(['2026-02-01', '2026-02-05'])
    expect(c.test.at(-1)!.cumul).toBeCloseTo(0.084, 10)
  })

  it('tient la courbe réelle à part de la simulée', () => {
    const c = courbes([
      wallet({
        jours: [{ id: 'j1', jour: '2026-02-01' }],
        tokens: [token('test', 'tp', '2026-02-01')],
        trades: [trade('2026-02-01', 0.05, 0.4, 'tp')],
      }),
    ])

    expect(c.test[0]!.cumul).toBeCloseTo(0.142, 10)
    expect(c.reel[0]!.cumul).toBeCloseTo(0.35, 10)
  })

  it('rend deux courbes vides sans aucun wallet', () => {
    expect(courbes([])).toEqual({ reel: [], test: [] })
  })
})
