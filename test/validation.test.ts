import { describe, expect, it } from 'vitest'
import {
  clampStrategyField,
  hasBlockingIssue,
  parsePerteToken,
  isIsoDate,
  isLikelySolanaAddress,
  parseBounded,
  parseNumberFr,
  validateNewWallet,
} from '@/lib/validation'

// Adresse de test : le programme système Solana, publique et sans lien avec personne.
const ADRESSE_VALIDE = '11111111111111111111111111111111'
const ADRESSE_44 = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

describe('isLikelySolanaAddress', () => {
  it('accepte une adresse base58 de 32 à 44 caractères', () => {
    expect(isLikelySolanaAddress(ADRESSE_VALIDE)).toBe(true)
    expect(isLikelySolanaAddress(ADRESSE_44)).toBe(true)
  })

  it('ignore les espaces autour', () => {
    expect(isLikelySolanaAddress(`  ${ADRESSE_VALIDE}  `)).toBe(true)
  })

  it('refuse une adresse trop courte ou trop longue', () => {
    expect(isLikelySolanaAddress('abc')).toBe(false)
    expect(isLikelySolanaAddress('1'.repeat(45))).toBe(false)
  })

  it('refuse les caractères hors base58', () => {
    expect(isLikelySolanaAddress(`0${ADRESSE_VALIDE.slice(1)}`)).toBe(false)
    expect(isLikelySolanaAddress(`O${ADRESSE_VALIDE.slice(1)}`)).toBe(false)
    expect(isLikelySolanaAddress(`l${ADRESSE_VALIDE.slice(1)}`)).toBe(false)
  })

  it('refuse une chaîne vide', () => {
    expect(isLikelySolanaAddress('')).toBe(false)
  })
})

describe('parseNumberFr', () => {
  it('lit la virgule comme séparateur décimal', () => {
    expect(parseNumberFr('0,1')).toBeCloseTo(0.1, 10)
    expect(parseNumberFr('1,5')).toBeCloseTo(1.5, 10)
  })

  it('lit aussi le point', () => {
    expect(parseNumberFr('0.003')).toBeCloseTo(0.003, 10)
  })

  it('ignore les espaces, y compris insécables', () => {
    expect(parseNumberFr('1 000,5')).toBeCloseTo(1000.5, 10)
    expect(parseNumberFr('1 000')).toBe(1000)
  })

  it('accepte les nombres négatifs', () => {
    expect(parseNumberFr('-2,5')).toBeCloseTo(-2.5, 10)
  })

  it('accepte le vrai signe moins et les tirets d’un copier-coller', () => {
    expect(parseNumberFr('−2,5')).toBeCloseTo(-2.5, 10)
    expect(parseNumberFr('–2,5')).toBeCloseTo(-2.5, 10)
  })

  it('renvoie null sur un champ vide ou illisible', () => {
    expect(parseNumberFr('')).toBeNull()
    expect(parseNumberFr('   ')).toBeNull()
    expect(parseNumberFr('-')).toBeNull()
    expect(parseNumberFr(',')).toBeNull()
    expect(parseNumberFr('abc')).toBeNull()
    expect(parseNumberFr(null)).toBeNull()
    expect(parseNumberFr(undefined)).toBeNull()
  })

  it('laisse passer un nombre déjà typé', () => {
    expect(parseNumberFr(42)).toBe(42)
    expect(parseNumberFr(Number.NaN)).toBeNull()
  })
})

describe('parseBounded', () => {
  it('rabat dans les bornes', () => {
    expect(parseBounded('500', { min: 0, max: 100, fallback: 0 })).toBe(100)
    expect(parseBounded('-5', { min: 0, max: 100, fallback: 0 })).toBe(0)
  })

  it('se replie sur la valeur par défaut si le champ est vide', () => {
    expect(parseBounded('', { min: 0, max: 100, fallback: 30 })).toBe(30)
  })
})

describe('clampStrategyField', () => {
  it('borne la perte par défaut à 100 %', () => {
    expect(clampStrategyField('perteRug', '250', 90)).toBe(100)
  })

  it('accepte une mise saisie à la française', () => {
    expect(clampStrategyField('mise', '0,25', 0.1)).toBeCloseTo(0.25, 10)
  })
})

describe('parsePerteToken', () => {
  it('lit une perte saisie à la française', () => {
    expect(parsePerteToken('42,5')).toBeCloseTo(42.5, 10)
  })

  it('garde null quand le champ est vide — le token suivra le wallet', () => {
    expect(parsePerteToken('')).toBeNull()
    expect(parsePerteToken(null)).toBeNull()
  })

  it('distingue une perte nulle d’une perte absente', () => {
    expect(parsePerteToken('0')).toBe(0)
  })

  it('comprend une perte écrite avec un moins', () => {
    expect(parsePerteToken('-50')).toBe(50)
    // Y compris le vrai signe moins, celui que l'app affiche.
    expect(parsePerteToken('−40')).toBe(40)
  })

  it('plafonne la perte à 100 %', () => {
    expect(parsePerteToken('250')).toBe(100)
    expect(parsePerteToken('-250')).toBe(100)
  })
})

describe('isIsoDate', () => {
  it('accepte une date réelle', () => {
    expect(isIsoDate('2026-10-05')).toBe(true)
  })

  it('refuse un format ou une date impossible', () => {
    expect(isIsoDate('05/10/2026')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-02-30')).toBe(false)
  })
})

describe('validateNewWallet', () => {
  const base = {
    label: 'Wallet test',
    address: ADRESSE_VALIDE,
    analyzedAt: '2026-10-05',
    existingAddresses: [] as string[],
  }

  it('ne signale rien sur une saisie correcte', () => {
    expect(validateNewWallet(base)).toEqual([])
  })

  it('exige un nom', () => {
    const issues = validateNewWallet({ ...base, label: '  ' })
    expect(issues).toContainEqual({
      field: 'label',
      message: 'Donnez un nom à ce wallet.',
      level: 'error',
    })
    expect(hasBlockingIssue(issues)).toBe(true)
  })

  it('refuse une adresse déjà suivie', () => {
    const issues = validateNewWallet({ ...base, existingAddresses: [ADRESSE_VALIDE] })
    expect(hasBlockingIssue(issues)).toBe(true)
    expect(issues[0]?.message).toContain('déjà suivie')
  })

  it('avertit sans bloquer sur une adresse douteuse', () => {
    const issues = validateNewWallet({ ...base, address: 'pas-une-adresse' })
    expect(hasBlockingIssue(issues)).toBe(false)
    expect(issues[0]?.level).toBe('warning')
  })

})
