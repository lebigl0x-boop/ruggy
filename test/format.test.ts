import { describe, expect, it } from 'vitest'
import {
  GMGN_URL,
  SOLSCAN_URL,
  formatDateFr,
  formatEur,
  formatMinutes,
  formatPercent,
  formatPercentExact,
  formatSol,
  shortAddress,
  toInputValue,
} from '@/lib/format'

/** Remplace les espaces insécables pour écrire des attentes lisibles. */
const plain = (s: string) => s.replace(/[  ]/g, ' ')

describe('formatSol', () => {
  it('signe et met en forme à trois décimales', () => {
    expect(plain(formatSol(0.14))).toBe('+0,140 SOL')
    expect(plain(formatSol(-0.093))).toBe('−0,093 SOL')
  })

  it('n’affiche pas de signe négatif sur un zéro arrondi', () => {
    expect(plain(formatSol(-0.0000001))).toBe('0,000 SOL')
  })

  it('peut masquer le signe', () => {
    expect(plain(formatSol(0.1, { sign: false }))).toBe('0,100 SOL')
  })
})

describe('formatPercent', () => {
  it('arrondit à l’entier par défaut', () => {
    expect(plain(formatPercent(41.566))).toBe('42 %')
  })

  it('accepte des décimales', () => {
    expect(plain(formatPercent(41.566, { decimals: 1 }))).toBe('41,6 %')
  })

  it('signe à la demande', () => {
    expect(plain(formatPercent(100, { sign: true }))).toBe('+100 %')
    expect(plain(formatPercent(-30, { sign: true }))).toBe('−30 %')
  })
})

describe('formatEur', () => {
  it('met en forme un montant', () => {
    expect(plain(formatEur(19.4))).toBe('+19,40 €')
    expect(plain(formatEur(-5))).toBe('−5,00 €')
  })
})

describe('formatMinutes', () => {
  it('reste en minutes sous une heure', () => {
    expect(plain(formatMinutes(12))).toBe('12 min')
    expect(plain(formatMinutes(2.5))).toBe('2,5 min')
  })

  it('passe en heures au-delà', () => {
    expect(plain(formatMinutes(90))).toBe('1 h 30')
    expect(plain(formatMinutes(120))).toBe('2 h')
  })
})

describe('shortAddress', () => {
  it('garde 4 caractères de chaque côté', () => {
    expect(shortAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toBe('Toke…Q5DA')
  })

  it('laisse les adresses courtes intactes', () => {
    expect(shortAddress('abcd')).toBe('abcd')
  })
})

describe('formatDateFr', () => {
  it('écrit la date en français', () => {
    expect(plain(formatDateFr('2026-10-05'))).toContain('oct')
    expect(plain(formatDateFr('2026-10-05'))).toContain('2026')
  })

  it('laisse passer une date illisible', () => {
    expect(formatDateFr('pas-une-date')).toBe('pas-une-date')
  })
})

describe('toInputValue', () => {
  it('réécrit le point en virgule', () => {
    expect(toInputValue(0.003)).toBe('0,003')
  })

  it('renvoie un champ vide pour une valeur absente', () => {
    expect(toInputValue(null)).toBe('')
    expect(toInputValue(undefined)).toBe('')
  })
})

describe('liens externes', () => {
  it('pointe vers Solscan et GMGN', () => {
    expect(SOLSCAN_URL('ABC')).toBe('https://solscan.io/account/ABC')
    expect(GMGN_URL('ABC')).toBe('https://gmgn.ai/sol/address/ABC')
  })
})

describe('formatPercentExact', () => {
  it('n’affiche pas de décimale quand il n’y en a pas', () => {
    expect(plain(formatPercentExact(-90, { sign: true }))).toBe('−90 %')
  })

  it('garde la décimale saisie', () => {
    expect(plain(formatPercentExact(-40.5, { sign: true }))).toBe('−40,5 %')
  })

  it('s’arrête à deux décimales', () => {
    expect(plain(formatPercentExact(33.333))).toBe('33,33 %')
  })
})
