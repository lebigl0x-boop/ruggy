import { describe, expect, it } from 'vitest'
import { DEFAULT_STRATEGY } from '@/lib/compute'
import {
  avancement,
  computePortefeuille,
  parEtat,
  trierLignes,
  type LigneWallet,
} from '@/lib/portefeuille'
import type {
  GlobalSettings,
  Token,
  WalletStatus,
  WalletWithTokens,
} from '@/lib/repo/types'

const SETTINGS: GlobalSettings = { solPriceEur: null, defaults: DEFAULT_STRATEGY }

/** Résultat d'un token à +150 % ou raté, avec la stratégie par défaut. */
const GAGNANT = 0.147
const PERDANT = -0.093

type JourSaisi = { day: string; gains: readonly number[]; ecartes?: readonly number[] }

function token(
  id: string,
  gain: number | null,
  dayId: string | null,
  pris = true,
): Token {
  return {
    id,
    walletId: 'w',
    position: 1,
    name: null,
    mint: null,
    gain,
    perteRug: null,
    delay: null,
    pris,
    phase: dayId === null ? 'screening' : 'test',
    dayId,
    source: 'manual',
  }
}

function wallet(
  label: string,
  {
    status = 'test',
    screening = [],
    jours = [],
  }: {
    status?: WalletStatus
    screening?: readonly number[]
    jours?: readonly JourSaisi[]
  } = {},
): WalletWithTokens {
  const tokens: Token[] = screening.map((gain, i) =>
    token(`${label}-s${i}`, gain, null),
  )

  for (const jour of jours) {
    jour.gains.forEach((gain, i) => {
      const pris = !(jour.ecartes ?? []).includes(i + 1)
      tokens.push(token(`${label}-${jour.day}-${i}`, gain, `${label}:${jour.day}`, pris))
    })
  }

  return {
    id: label,
    label,
    address: `adresse-${label}`,
    analyzedAt: '2026-10-01',
    notes: '',
    tagOverride: null,
    status,
    testStartedAt: jours.length > 0 ? jours[0]!.day : null,
    strategy: DEFAULT_STRATEGY,
    source: 'manual',
    createdAt: '',
    updatedAt: '',
    tokens,
    days: jours.map((jour) => ({
      id: `${label}:${jour.day}`,
      walletId: label,
      day: jour.day,
      state: 'actif' as const,
      note: '',
      createdAt: '',
      updatedAt: '',
    })),
  }
}

describe('computePortefeuille — vide', () => {
  const vue = computePortefeuille([], SETTINGS)

  it('ne sort aucun chiffre inventé', () => {
    expect(vue.total).toBe(0)
    expect(vue.netTestSol).toBe(0)
    expect(vue.taux).toBe(0)
    expect(vue.courbe).toEqual([])
    expect(vue.meilleur).toBeNull()
    expect(vue.pire).toBeNull()
  })
})

describe('computePortefeuille — agrégation', () => {
  const vue = computePortefeuille(
    [
      wallet('A', {
        jours: [
          { day: '2026-10-01', gains: [150, 20] },
          { day: '2026-10-02', gains: [150] },
        ],
      }),
      wallet('B', {
        jours: [{ day: '2026-10-02', gains: [20] }],
      }),
      wallet('C', { status: 'screening', screening: [150, 150] }),
    ],
    SETTINGS,
  )

  it('compte les wallets par statut', () => {
    expect(vue.total).toBe(3)
    expect(vue.parStatut).toEqual({ screening: 1, test: 2, valide: 0, rejete: 0 })
  })

  it('n’additionne pas le screening au test', () => {
    // A : 0,147 − 0,093 + 0,147 ; B : −0,093
    expect(vue.netTestSol).toBeCloseTo(2 * GAGNANT + 2 * PERDANT, 6)
    // C est en screening : ses deux réussites restent de leur côté.
    expect(vue.netScreeningSol).toBeCloseTo(2 * GAGNANT, 6)
  })

  it('agrège le taux à l’objectif sur la phase de test', () => {
    expect(vue.tokensNotes).toBe(4)
    expect(vue.hits).toBe(2)
    expect(vue.taux).toBeCloseTo(50, 10)
  })

  it('réunit les journées de même date en un seul point', () => {
    expect(vue.courbe.map((point) => point.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
    ])
    expect(vue.joursObserves).toBe(2)
    // Le 2 octobre, A et B ont tous deux relevé.
    expect(vue.courbe[1]!.wallets).toBe(2)
    expect(vue.courbe[1]!.pnlSol).toBeCloseTo(GAGNANT + PERDANT, 6)
  })

  it('cumule la courbe dans l’ordre du temps', () => {
    expect(vue.courbe[0]!.cumulSol).toBeCloseTo(GAGNANT + PERDANT, 6)
    expect(vue.courbe.at(-1)!.cumulSol).toBeCloseTo(vue.netTestSol, 6)
  })

  it('désigne le meilleur et le pire wallet', () => {
    expect(vue.meilleur?.id).toBe('C')
    expect(vue.pire?.id).toBe('B')
  })
})

describe('computePortefeuille — tokens écartés', () => {
  it('laisse les tokens écartés hors du net mais dans le relevé', () => {
    const vue = computePortefeuille(
      [wallet('A', { jours: [{ day: '2026-10-01', gains: [150, 20], ecartes: [2] }] })],
      SETTINGS,
    )

    expect(vue.tokensTest).toBe(2)
    expect(vue.tokensPris).toBe(1)
    expect(vue.netTestSol).toBeCloseTo(GAGNANT, 6)
    // Le raté écarté reste une observation : le wallet a bien lancé deux fois.
    expect(vue.tokensNotes).toBe(2)
    expect(vue.taux).toBeCloseTo(50, 10)
  })
})

describe('computePortefeuille — conversion en euros', () => {
  it('convertit le net de test quand le prix du SOL est connu', () => {
    const vue = computePortefeuille(
      [wallet('A', { jours: [{ day: '2026-10-01', gains: [150] }] })],
      { ...SETTINGS, solPriceEur: 100 },
    )
    expect(vue.netTestEur).toBeCloseTo(GAGNANT * 100, 4)
  })

  it('laisse le net en euros à null sans prix du SOL', () => {
    const vue = computePortefeuille(
      [wallet('A', { jours: [{ day: '2026-10-01', gains: [150] }] })],
      SETTINGS,
    )
    expect(vue.netTestEur).toBeNull()
  })
})

describe('computePortefeuille — wallet sans token noté', () => {
  it('ne le désigne ni meilleur ni pire', () => {
    // Son zéro ne dit rien : il écraserait un vrai résultat négatif.
    const vue = computePortefeuille(
      [
        wallet('Vide', { status: 'screening' }),
        wallet('Perdant', { jours: [{ day: '2026-10-01', gains: [20] }] }),
      ],
      SETTINGS,
    )
    expect(vue.meilleur?.id).toBe('Perdant')
    expect(vue.pire).toBeNull()
  })
})

function ligne(
  label: string,
  netSol: number,
  status: WalletStatus = 'test',
  extra: Partial<LigneWallet> = {},
): LigneWallet {
  return {
    id: label,
    label,
    address: '',
    status,
    tag: 'À compléter',
    netSol,
    n: 0,
    nPris: 0,
    taux: 0,
    seuilAnalyse: 10,
    joursObserves: 0,
    joursMinimum: 4,
    joursRestants: 4,
    verdictDisponible: false,
    ...extra,
  }
}

describe('parEtat', () => {
  it('range chaque wallet dans sa colonne', () => {
    const colonnes = parEtat([
      ligne('A', 0, 'screening'),
      ligne('B', 0, 'test'),
      ligne('C', 0, 'test'),
      ligne('D', 0, 'rejete'),
    ])
    expect(colonnes.screening.map((l) => l.label)).toEqual(['A'])
    expect(colonnes.test.map((l) => l.label)).toEqual(['B', 'C'])
    expect(colonnes.valide).toEqual([])
    expect(colonnes.rejete.map((l) => l.label)).toEqual(['D'])
  })

  it('met en tête ce qui réclame une décision', () => {
    // Une colonne d'entonnoir se lit du haut vers le bas : le haut doit
    // porter ce sur quoi il y a quelque chose à faire.
    const colonnes = parEtat([
      ligne('Avancé', 0, 'test', { joursObserves: 3 }),
      ligne('À conclure', 0, 'test', { joursObserves: 4, verdictDisponible: true }),
    ])
    expect(colonnes.test.map((l) => l.label)).toEqual(['À conclure', 'Avancé'])
  })

  it('classe ensuite par avancement, puis par nom', () => {
    const colonnes = parEtat([
      ligne('Bravo', 0, 'screening', { n: 2 }),
      ligne('Alpha', 0, 'screening', { n: 8 }),
      ligne('Charlie', 0, 'screening', { n: 8 }),
    ])
    expect(colonnes.screening.map((l) => l.label)).toEqual([
      'Alpha',
      'Charlie',
      'Bravo',
    ])
  })
})

describe('avancement', () => {
  it('compte les tokens notés en screening', () => {
    expect(avancement(ligne('A', 0, 'screening', { n: 4, seuilAnalyse: 10 }))).toBeCloseTo(0.4, 10)
  })

  it('compte les journées observées en test', () => {
    expect(avancement(ligne('A', 0, 'test', { joursObserves: 2, joursMinimum: 4 }))).toBeCloseTo(0.5, 10)
  })

  it('plafonne à 1 quand le plancher est dépassé', () => {
    expect(avancement(ligne('A', 0, 'test', { joursObserves: 9, joursMinimum: 4 }))).toBe(1)
  })

  it('vaut 1 pour un wallet sorti de l’entonnoir', () => {
    expect(avancement(ligne('A', 0, 'valide'))).toBe(1)
    expect(avancement(ligne('A', 0, 'rejete'))).toBe(1)
  })
})

describe('trierLignes', () => {

  const lignes = [ligne('Charlie', 0.2), ligne('Alpha', -0.1), ligne('Bravo', 0.2)]

  it('trie par net décroissant', () => {
    expect(
      trierLignes(lignes, { colonne: 'netSol', sens: 'desc' }).map((l) => l.label),
    ).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('départage par nom à valeur égale', () => {
    // Sans départage, deux wallets au même net changeraient de place d'un
    // rendu à l'autre.
    const ordre = trierLignes(lignes, { colonne: 'netSol', sens: 'desc' })
    expect(ordre[0]!.label).toBe('Bravo')
    expect(ordre[1]!.label).toBe('Charlie')
  })

  it('trie par nom', () => {
    expect(
      trierLignes(lignes, { colonne: 'label', sens: 'asc' }).map((l) => l.label),
    ).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('range les statuts par avancement dans l’entonnoir', () => {
    const mixte = [
      ligne('A', 0, 'rejete'),
      ligne('B', 0, 'test'),
      ligne('C', 0, 'screening'),
    ]
    expect(
      trierLignes(mixte, { colonne: 'status', sens: 'asc' }).map((l) => l.status),
    ).toEqual(['test', 'screening', 'rejete'])
  })

  it('ne modifie pas la liste reçue', () => {
    const copie = [...lignes]
    trierLignes(lignes, { colonne: 'netSol', sens: 'asc' })
    expect(lignes).toEqual(copie)
  })
})
