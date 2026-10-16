import { describe, expect, it } from 'vitest'

import {
  bornesJournee,
  formatDelai,
  heureParis,
  hier,
  jourPrecedent,
  jourSuivant,
  minuitParis,
} from '@/lib/journee'

describe('minuitParis', () => {
  it('cale minuit sur UTC+1 en hiver', () => {
    expect(minuitParis('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z')
  })

  it('cale minuit sur UTC+2 en été', () => {
    expect(minuitParis('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z')
  })
})

describe('bornesJournee', () => {
  it('fait 24 h une journée ordinaire', () => {
    const { debut, fin } = bornesJournee('2026-10-14')
    expect(fin - debut).toBe(24 * 3600)
    expect(new Date(debut * 1000).toISOString()).toBe('2026-10-13T22:00:00.000Z')
  })

  it('fait 23 h le jour du passage à l’heure d’été', () => {
    const { debut, fin } = bornesJournee('2026-03-29')
    expect(fin - debut).toBe(23 * 3600)
  })

  it('fait 25 h le jour du retour à l’heure d’hiver', () => {
    const { debut, fin } = bornesJournee('2026-10-25')
    expect(fin - debut).toBe(25 * 3600)
  })

  it('enchaîne sans trou ni recouvrement d’un jour à l’autre', () => {
    const veille = bornesJournee('2026-03-28')
    const jour = bornesJournee('2026-03-29')
    expect(veille.fin).toBe(jour.debut)
  })
})

describe('jourSuivant et jourPrecedent', () => {
  it('passe le changement de mois', () => {
    expect(jourSuivant('2026-01-31')).toBe('2026-02-01')
    expect(jourPrecedent('2026-03-01')).toBe('2026-02-28')
  })

  it('ne dérape pas les jours de changement d’heure', () => {
    expect(jourSuivant('2026-03-29')).toBe('2026-03-30')
    expect(jourPrecedent('2026-10-25')).toBe('2026-10-24')
  })
})

describe('hier', () => {
  it('rend la veille au sens de Paris, pas d’UTC', () => {
    // 00:30 à Paris le 15 — il est encore le 14 en UTC, mais la veille
    // parisienne est bien le 14.
    expect(hier(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-14')
  })

  it('rend la veille en milieu de journée', () => {
    expect(hier(new Date('2026-10-16T12:00:00Z'))).toBe('2026-10-15')
  })
})

describe('heureParis', () => {
  it('affiche l’heure locale et non UTC', () => {
    // 23:25:51 UTC un 13 octobre = 01:25 à Paris le 14.
    expect(heureParis(Date.parse('2026-10-13T23:25:51Z') / 1000)).toBe('01:25')
  })
})

describe('formatDelai', () => {
  it('descend aux secondes sous la minute', () => {
    expect(formatDelai(12)).toBe('+12 s')
  })

  it('arrondit aux minutes ensuite', () => {
    expect(formatDelai(180)).toBe('+3 min')
    expect(formatDelai(3540)).toBe('+59 min')
  })

  it('passe aux heures au-delà', () => {
    expect(formatDelai(3600)).toBe('+1 h')
    expect(formatDelai(4320)).toBe('+1 h 12')
  })

  it('rend un tiret pour un délai absurde', () => {
    expect(formatDelai(-5)).toBe('—')
    expect(formatDelai(Number.NaN)).toBe('—')
  })
})
