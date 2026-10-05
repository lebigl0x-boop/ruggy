import { describe, expect, it } from 'vitest'
import {
  MAX_JOURS_FILE,
  ajouterJours,
  ecartEnJours,
  jourPrecedent,
  joursManquants,
  listerJours,
} from '@/lib/jours'

describe('ajouterJours', () => {
  it('avance et recule d’un jour', () => {
    expect(ajouterJours('2026-10-05', 1)).toBe('2026-10-06')
    expect(jourPrecedent('2026-10-05')).toBe('2026-10-04')
  })

  it('passe les fins de mois et les années bissextiles', () => {
    expect(ajouterJours('2026-10-31', 1)).toBe('2026-11-01')
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01')
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('traverse le changement d’heure sans sauter de journée', () => {
    // Dernier dimanche d'octobre 2026 : l'heure d'été s'arrête en France.
    // Un calcul en heure locale perdrait ou doublerait un jour ici.
    expect(ajouterJours('2026-10-24', 1)).toBe('2026-10-25')
    expect(ajouterJours('2026-10-25', 1)).toBe('2026-10-26')
    expect(ecartEnJours('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('renvoie l’entrée telle quelle si elle est illisible', () => {
    expect(ajouterJours('pas-une-date', 1)).toBe('pas-une-date')
  })
})

describe('listerJours', () => {
  it('liste les dates bornes comprises', () => {
    expect(listerJours('2026-10-03', '2026-10-06')).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ])
  })

  it('renvoie un seul jour quand les bornes se confondent', () => {
    expect(listerJours('2026-10-05', '2026-10-05')).toEqual(['2026-10-05'])
  })

  it('renvoie une liste vide quand la fin précède le début', () => {
    expect(listerJours('2026-10-06', '2026-10-03')).toEqual([])
  })

  it('plafonne la liste pour qu’une date aberrante ne la fasse pas exploser', () => {
    expect(listerJours('2020-01-01', '2026-10-05')).toHaveLength(MAX_JOURS_FILE)
  })
})

describe('joursManquants', () => {
  const debut = '2026-10-01'

  it('réclame les journées non saisies jusqu’à la veille', () => {
    expect(
      joursManquants({ debut, jusqua: '2026-10-04', saisis: ['2026-10-02'] }),
    ).toEqual(['2026-10-01', '2026-10-03', '2026-10-04'])
  })

  it('fait remonter les matins sautés au lieu de les perdre', () => {
    // C'est la raison d'être de la file : un jour oublié fausserait le
    // décompte des journées d'observation.
    const manquants = joursManquants({
      debut,
      jusqua: '2026-10-05',
      saisis: ['2026-10-04', '2026-10-05'],
    })
    expect(manquants).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('ne réclame rien quand tout est saisi', () => {
    expect(
      joursManquants({
        debut,
        jusqua: '2026-10-02',
        saisis: ['2026-10-01', '2026-10-02'],
      }),
    ).toEqual([])
  })

  it('ne réclame rien le jour même du départ', () => {
    // Le test démarre aujourd'hui ; la veille précède le départ, il n'y a
    // donc encore rien à relever.
    expect(
      joursManquants({ debut: '2026-10-05', jusqua: '2026-10-04', saisis: [] }),
    ).toEqual([])
  })
})
