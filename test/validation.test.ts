import { describe, expect, it } from 'vitest'

import {
  BORNES,
  borner,
  estAdresseSolana,
  estDateIso,
  parseMontantCourt,
  parseNombreFr,
  valideNouveauWallet,
} from '@/lib/validation'

/** Une adresse fictive, de longueur et d'alphabet valides. */
const ADRESSE = 'AbCdEfGhJkLmNpQrStUvWxYz123456789ABCDEFGH'

describe('parseNombreFr', () => {
  it('accepte la virgule décimale', () => {
    expect(parseNombreFr('0,05')).toBe(0.05)
  })

  it('ignore les espaces, insécables compris', () => {
    expect(parseNombreFr('1 234,5')).toBe(1234.5)
    expect(parseNombreFr('1 234,5')).toBe(1234.5)
  })

  it('rabat les tirets typographiques sur le moins du clavier', () => {
    expect(parseNombreFr('−12')).toBe(-12)
    expect(parseNombreFr('–12')).toBe(-12)
  })

  it('rend null sur une saisie vide ou illisible', () => {
    expect(parseNombreFr('')).toBeNull()
    expect(parseNombreFr('-')).toBeNull()
    expect(parseNombreFr(',')).toBeNull()
    expect(parseNombreFr('abc')).toBeNull()
    expect(parseNombreFr(null)).toBeNull()
    expect(parseNombreFr(undefined)).toBeNull()
  })

  it('laisse passer un nombre déjà lu, sauf s’il n’en est pas un', () => {
    expect(parseNombreFr(0.5)).toBe(0.5)
    expect(parseNombreFr(Number.NaN)).toBeNull()
    expect(parseNombreFr(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('borner', () => {
  it('rabat dans les bornes', () => {
    expect(borner('999', BORNES.tp, 300)).toBe(999)
    expect(borner('-5', BORNES.mise, 0.05)).toBe(0)
    expect(borner('50000', BORNES.tp, 300)).toBe(BORNES.tp.max)
  })

  it('retombe sur le repli si la saisie est illisible', () => {
    expect(borner('', BORNES.mise, 0.05)).toBe(0.05)
    expect(borner('abc', BORNES.frais, 0.008)).toBe(0.008)
  })
})

describe('estAdresseSolana', () => {
  it('accepte une base58 de la bonne longueur', () => {
    expect(estAdresseSolana(ADRESSE)).toBe(true)
  })

  it('refuse ce qui est trop court ou trop long', () => {
    expect(estAdresseSolana('ABC')).toBe(false)
    expect(estAdresseSolana(ADRESSE + ADRESSE)).toBe(false)
  })

  it('refuse les caractères absents de la base58', () => {
    // 0, O, I et l n'en font pas partie.
    expect(estAdresseSolana('0'.repeat(40))).toBe(false)
    expect(estAdresseSolana('l'.repeat(40))).toBe(false)
  })
})

describe('estDateIso', () => {
  it('accepte une date qui existe', () => {
    expect(estDateIso('2026-10-15')).toBe(true)
  })

  it('refuse une date impossible ou mal formée', () => {
    expect(estDateIso('2026-02-31')).toBe(false)
    expect(estDateIso('15/10/2026')).toBe(false)
    expect(estDateIso('')).toBe(false)
  })
})

describe('valideNouveauWallet', () => {
  it('ne dit rien quand tout va bien', () => {
    expect(
      valideNouveauWallet({ nom: 'Wallet', adresse: ADRESSE, adressesExistantes: [] }),
    ).toEqual([])
  })

  it('exige un nom et une adresse', () => {
    const soucis = valideNouveauWallet({ nom: '  ', adresse: '', adressesExistantes: [] })
    expect(soucis.map((s) => s.champ)).toEqual(['nom', 'adresse'])
    expect(soucis.every((s) => s.niveau === 'erreur')).toBe(true)
  })

  it('bloque un doublon d’adresse', () => {
    const soucis = valideNouveauWallet({
      nom: 'Wallet',
      adresse: ADRESSE,
      adressesExistantes: [ADRESSE],
    })
    expect(soucis).toHaveLength(1)
    expect(soucis[0]).toMatchObject({ champ: 'adresse', niveau: 'erreur' })
  })

  it('avertit sans bloquer sur une adresse douteuse', () => {
    // On laisse passer : une adresse inhabituelle reste peut-être la bonne.
    const soucis = valideNouveauWallet({
      nom: 'Wallet',
      adresse: 'pas-une-adresse',
      adressesExistantes: [],
    })
    expect(soucis).toHaveLength(1)
    expect(soucis[0]!.niveau).toBe('avertissement')
  })
})

describe('parseMontantCourt', () => {
  it('lit les abréviations des graphiques', () => {
    expect(parseMontantCourt('45k')).toBe(45_000)
    expect(parseMontantCourt('45K')).toBe(45_000)
    expect(parseMontantCourt('1,2M')).toBe(1_200_000)
    expect(parseMontantCourt('2b')).toBe(2_000_000_000)
  })

  it('ignore le symbole monétaire et les espaces', () => {
    expect(parseMontantCourt('$45k')).toBe(45_000)
    expect(parseMontantCourt('450 000')).toBe(450_000)
    expect(parseMontantCourt(' 45 K$ ')).toBe(45_000)
  })

  it('accepte un montant écrit en entier', () => {
    expect(parseMontantCourt('45000')).toBe(45_000)
    expect(parseMontantCourt(45_000)).toBe(45_000)
  })

  it('renvoie null sur une saisie vide ou illisible', () => {
    expect(parseMontantCourt('')).toBeNull()
    expect(parseMontantCourt(null)).toBeNull()
    expect(parseMontantCourt(undefined)).toBeNull()
    expect(parseMontantCourt('k')).toBeNull()
    expect(parseMontantCourt('abc')).toBeNull()
  })
})
