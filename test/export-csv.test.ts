import { describe, expect, it } from 'vitest'
import { DEFAULT_STRATEGY } from '@/lib/compute'
import { nomFichierCsv, walletToCsv } from '@/lib/export-csv'
import type {
  GlobalSettings,
  Token,
  TokenPhase,
  WalletDay,
  WalletWithTokens,
} from '@/lib/repo/types'

const SETTINGS: GlobalSettings = { solPriceEur: 150, defaults: DEFAULT_STRATEGY }

function token(id: string, phase: TokenPhase, extra: Partial<Token> = {}): Token {
  return {
    id,
    walletId: 'w',
    position: 1,
    name: null,
    mint: null,
    gain: null,
    perteRug: null,
    delay: null,
    pris: true,
    phase,
    dayId: null,
    entreeSol: null,
    sortieSol: null,
    source: 'manual',
    ...extra,
  }
}

function jour(id: string, day: string, phase: 'test' | 'trade'): WalletDay {
  return {
    id,
    walletId: 'w',
    day,
    state: 'actif',
    phase,
    note: '',
    createdAt: '',
    updatedAt: '',
  }
}

function wallet(extra: Partial<WalletWithTokens> = {}): WalletWithTokens {
  return {
    id: 'w',
    label: 'Dév récidiviste',
    address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    analyzedAt: '2026-10-01',
    notes: '',
    tagOverride: null,
    status: 'trade',
    testStartedAt: '2026-10-02',
    tradeStartedAt: '2026-10-10',
    strategy: DEFAULT_STRATEGY,
    source: 'manual',
    createdAt: '',
    updatedAt: '',
    tokens: [],
    days: [],
    ...extra,
  }
}

/** Les lignes de données : tout ce qui n'est ni préambule ni en-tête. */
function donnees(csv: string): string[] {
  return csv
    .split('\n')
    .filter((ligne) => ligne !== '' && !ligne.startsWith('#'))
    .slice(1)
}

function entete(csv: string): string {
  return csv.split('\n').find((ligne) => ligne.startsWith('phase,'))!
}

describe('walletToCsv', () => {
  const csv = walletToCsv(
    wallet({
      days: [jour('j1', '2026-10-03', 'test'), jour('j2', '2026-10-11', 'trade')],
      tokens: [
        token('a', 'screening', { position: 1, name: 'BONK', gain: 150, delay: 7 }),
        token('b', 'test', { position: 2, gain: -80, perteRug: 95, dayId: 'j1' }),
        token('c', 'trade', {
          position: 3,
          gain: 220,
          dayId: 'j2',
          entreeSol: 0.2,
          sortieSol: 0.55,
        }),
      ],
    }),
    SETTINGS,
  )

  it('sort une ligne par token, pas une par journée', () => {
    expect(donnees(csv)).toHaveLength(3)
  })

  it('porte la phase en colonne plutôt que de couper le fichier en trois', () => {
    expect(entete(csv).startsWith('phase,jour,etat_jour,')).toBe(true)
    expect(donnees(csv).map((l) => l.split(',')[0])).toEqual([
      'screening',
      'test',
      'trade',
    ])
  })

  it('rattache chaque token à sa journée', () => {
    const [screening, test, trade] = donnees(csv)
    // Un token de screening n'a pas de journée : la case reste vide.
    expect(screening!.split(',')[1]).toBe('')
    expect(test!.split(',')[1]).toBe('2026-10-03')
    expect(trade!.split(',')[1]).toBe('2026-10-11')
  })

  it('ne porte aucune colonne calculée', () => {
    // Le lecteur recalcule depuis les réglages du préambule. Lui livrer des
    // résultats tout faits lui retirerait le moyen de les vérifier.
    for (const interdite of ['resultat', 'sol', 'cumul', 'hit', 'net']) {
      expect(entete(csv).split(',')).not.toContain(interdite)
    }
  })

  it('porte les réglages, sans quoi rien n’est recalculable', () => {
    expect(csv).toContain('# mise_sol: 0.1')
    expect(csv).toContain('# objectif_pct: 100')
    expect(csv).toContain('# perte_defaut_pct: 90')
    expect(csv).toContain('# frais_sol: 0.003')
    expect(csv).toContain('# sol_eur: 150')
  })

  it('dit que les phases ne s’additionnent pas', () => {
    expect(csv).toContain('# Les trois phases ne s’additionnent jamais.')
    expect(csv).toContain('# tokens: screening=1 test=1 trade=1')
  })

  it('écrit les montants réels du trade', () => {
    const trade = donnees(csv)[2]!.split(',')
    expect(trade.at(-2)).toBe('0.2')
    expect(trade.at(-1)).toBe('0.55')
  })

  it('laisse vides les montants hors phase active', () => {
    const test = donnees(csv)[1]!.split(',')
    expect(test.at(-2)).toBe('')
    expect(test.at(-1)).toBe('')
  })
})

describe('walletToCsv — échappement', () => {
  it('protège une virgule dans un nom', () => {
    const csv = walletToCsv(
      wallet({ tokens: [token('a', 'screening', { name: 'BONK, le vrai' })] }),
      SETTINGS,
    )
    expect(donnees(csv)[0]).toContain('"BONK, le vrai"')
  })

  it('double les guillemets', () => {
    const csv = walletToCsv(
      wallet({ tokens: [token('a', 'screening', { name: 'le "vrai" BONK' })] }),
      SETTINGS,
    )
    expect(donnees(csv)[0]).toContain('"le ""vrai"" BONK"')
  })

  it('distingue un token non noté d’un token à zéro', () => {
    const csv = walletToCsv(
      wallet({
        tokens: [
          token('a', 'screening', { position: 1, gain: null }),
          token('b', 'screening', { position: 2, gain: 0 }),
        ],
      }),
      SETTINGS,
    )
    const [sansNote, aZero] = donnees(csv)
    expect(sansNote!.split(',')[6]).toBe('')
    expect(aZero!.split(',')[6]).toBe('0')
  })

  it('écrit « pris » en toutes lettres', () => {
    const csv = walletToCsv(
      wallet({
        tokens: [
          token('a', 'test', { position: 1, pris: true }),
          token('b', 'test', { position: 2, pris: false }),
        ],
      }),
      SETTINGS,
    )
    expect(donnees(csv)[0]!.split(',')[9]).toBe('oui')
    expect(donnees(csv)[1]!.split(',')[9]).toBe('non')
  })
})

describe('walletToCsv — wallet vide', () => {
  it('sort quand même ses en-têtes', () => {
    const csv = walletToCsv(wallet(), SETTINGS)
    expect(donnees(csv)).toHaveLength(0)
    expect(entete(csv)).toBeDefined()
  })

  it('laisse vide un prix du SOL non renseigné plutôt que d’écrire « null »', () => {
    const csv = walletToCsv(wallet(), { solPriceEur: null, defaults: DEFAULT_STRATEGY })
    expect(csv).toContain('# sol_eur: \n')
  })
})

describe('nomFichierCsv', () => {
  it('réduit le libellé à quelque chose de sûr dans un en-tête HTTP', () => {
    expect(nomFichierCsv('Dév récidiviste', '2026-10-15')).toBe(
      'ruggers-dev-recidiviste-2026-10-15.csv',
    )
  })

  it('ne laisse passer ni guillemet ni barre oblique', () => {
    const nom = nomFichierCsv('a/b "c"', '2026-10-15')
    expect(nom).not.toMatch(/["/]/)
  })

  it('retombe sur un nom générique quand le libellé n’en laisse rien', () => {
    expect(nomFichierCsv('!!!', '2026-10-15')).toBe('ruggers-wallet-2026-10-15.csv')
  })
})
