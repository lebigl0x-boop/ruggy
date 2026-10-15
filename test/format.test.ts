import { describe, expect, it } from 'vitest'

import {
  adresseCourte,
  formatDate,
  formatJour,
  formatPct,
  formatSol,
  PADRE_URL,
  SOLSCAN_URL,
  versChamp,
} from '@/lib/format'

// Les espaces de `Intl` en français sont insécables : on compare sur une
// version normalisée plutôt que de coller des caractères invisibles dans les
// attentes.
const sansEspaces = (texte: string) => texte.replace(/\s/g, ' ')

describe('formatSol', () => {
  it('signe les résultats et garde trois décimales', () => {
    expect(sansEspaces(formatSol(0.142))).toBe('+0,142 SOL')
    expect(sansEspaces(formatSol(-0.058))).toBe('−0,058 SOL')
  })

  it('n’affiche pas de signe sur un zéro', () => {
    expect(sansEspaces(formatSol(0))).toBe('0,000 SOL')
  })

  it('rabat à zéro ce qui est sous le demi-millième', () => {
    // Un « +0,000 » vert ferait croire à un gain là où il n'y a rien.
    expect(sansEspaces(formatSol(0.0004))).toBe('0,000 SOL')
    expect(sansEspaces(formatSol(-0.0004))).toBe('0,000 SOL')
  })

  it('peut se passer du signe', () => {
    expect(sansEspaces(formatSol(0.142, { signe: false }))).toBe('0,142 SOL')
  })
})

describe('formatPct', () => {
  it('arrondit à l’entier par défaut', () => {
    expect(sansEspaces(formatPct(60))).toBe('60 %')
    expect(sansEspaces(formatPct(28.97))).toBe('29 %')
  })

  it('accepte des décimales', () => {
    expect(sansEspaces(formatPct(28.97, { decimales: 1 }))).toBe('29,0 %')
  })

  it('signe à la demande, et marque toujours le négatif', () => {
    expect(sansEspaces(formatPct(12, { signe: true }))).toBe('+12 %')
    expect(sansEspaces(formatPct(-12))).toBe('−12 %')
  })
})

describe('adresseCourte', () => {
  it('garde quatre caractères de chaque côté', () => {
    expect(adresseCourte('ABCD1234567890WXYZ')).toBe('ABCD…WXYZ')
  })

  it('laisse une adresse courte telle quelle', () => {
    expect(adresseCourte('ABCD123')).toBe('ABCD123')
  })
})

describe('dates', () => {
  it('formate une date courte', () => {
    expect(formatDate('2026-10-15')).toContain('2026')
  })

  it('rend la chaîne telle quelle si elle est illisible', () => {
    expect(formatDate('pas-une-date')).toBe('pas-une-date')
    expect(formatJour('pas-une-date')).toBe('pas-une-date')
  })
})

describe('versChamp', () => {
  it('rend la virgule décimale française', () => {
    expect(versChamp(0.05)).toBe('0,05')
  })

  it('rend une chaîne vide pour une absence', () => {
    expect(versChamp(null)).toBe('')
    expect(versChamp(undefined)).toBe('')
    expect(versChamp(Number.NaN)).toBe('')
  })
})

describe('liens externes', () => {
  it('échappe ce qu’on lui donne', () => {
    expect(PADRE_URL('a b')).toBe('https://trade.padre.gg/trade/solana/a%20b')
    expect(SOLSCAN_URL('a b')).toBe('https://solscan.io/account/a%20b')
  })
})
