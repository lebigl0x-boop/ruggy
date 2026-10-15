import { describe, expect, it } from 'vitest'

import {
  convertir,
  issueDepuisGain,
  issueDepuisMontants,
  phaseDepuisStatut,
  type JourV1,
  type TokenV1,
  type WalletV1,
} from '@/scripts/conversion'

/** Un wallet v1 fictif, réglages par défaut de la v1. */
function wallet(partiel: Partial<WalletV1> = {}): WalletV1 {
  return {
    id: 'w1',
    label: 'Wallet fictif',
    address: 'AdresseFictive1111111111111111111111111111',
    notes: '',
    status: 'screening',
    testStartedAt: null,
    tradeStartedAt: null,
    mise: 0.1,
    objectif: 100,
    frais: 0.003,
    createdAt: '2026-01-01T10:00:00.000Z',
    ...partiel,
  }
}

function token(partiel: Partial<TokenV1> = {}): TokenV1 {
  return {
    id: 't1',
    walletId: 'w1',
    position: 1,
    name: null,
    mint: null,
    gain: null,
    pris: true,
    phase: 'screening',
    dayId: null,
    entreeSol: null,
    sortieSol: null,
    createdAt: '2026-01-02T10:00:00.000Z',
    ...partiel,
  }
}

function jour(partiel: Partial<JourV1> = {}): JourV1 {
  return {
    id: 'j1',
    walletId: 'w1',
    day: '2026-01-02',
    state: 'actif',
    phase: 'test',
    ...partiel,
  }
}

describe('phaseDepuisStatut', () => {
  it('reprend les trois phases qui survivent', () => {
    expect(phaseDepuisStatut('screening')).toBe('screening')
    expect(phaseDepuisStatut('test')).toBe('test')
    expect(phaseDepuisStatut('trade')).toBe('trade')
  })

  it('rabat valide sur test et rejete sur archive', () => {
    expect(phaseDepuisStatut('valide')).toBe('test')
    expect(phaseDepuisStatut('rejete')).toBe('archive')
  })

  it('retombe sur screening pour un statut inconnu', () => {
    expect(phaseDepuisStatut('nimporte quoi')).toBe('screening')
  })
})

describe('issueDepuisGain', () => {
  it('atteint le TP à partir de l’objectif, bornes comprises', () => {
    expect(issueDepuisGain(100, 100)).toBe('tp')
    expect(issueDepuisGain(301, 300)).toBe('tp')
  })

  it('rate en dessous', () => {
    expect(issueDepuisGain(99.9, 100)).toBe('rate')
    expect(issueDepuisGain(-80, 100)).toBe('rate')
  })
})

describe('issueDepuisMontants', () => {
  it('applique le multiple visé, pas le simple signe du résultat', () => {
    // TP 300 % : il faut quadrupler la mise.
    expect(issueDepuisMontants(0.1, 0.4, 300)).toBe('tp')
    expect(issueDepuisMontants(0.1, 0.39, 300)).toBe('rate')
    // Un trade gagnant mais loin du TP reste un raté.
    expect(issueDepuisMontants(0.1, 0.14, 300)).toBe('rate')
  })
})

describe('convertir — wallets', () => {
  it('reprend les réglages et renomme objectif en tp', () => {
    const { wallets } = convertir({
      wallets: [wallet({ mise: 0.07, objectif: 250, frais: 0.005 })],
      tokens: [],
      jours: [],
    })

    expect(wallets[0]).toMatchObject({
      nom: 'Wallet fictif',
      phase: 'screening',
      mise: 0.07,
      tp: 250,
      frais: 0.005,
      tokensScreening: 10,
      joursTest: 5,
    })
  })

  it('compte les statuts rabattus', () => {
    const { compteurs } = convertir({
      wallets: [
        wallet({ id: 'a', address: 'A', status: 'valide' }),
        wallet({ id: 'b', address: 'B', status: 'rejete' }),
        wallet({ id: 'c', address: 'C', status: 'trade' }),
      ],
      tokens: [],
      jours: [],
    })

    expect(compteurs.wallets).toMatchObject({ total: 3, test: 1, archive: 1, trade: 1 })
    expect(compteurs.rabattus).toEqual({ valideVersTest: 1, rejeteVersArchive: 1 })
  })
})

describe('convertir — tokens simulés', () => {
  it('traduit le gain en issue selon l’objectif du wallet', () => {
    const { tokens } = convertir({
      wallets: [wallet({ objectif: 100 })],
      tokens: [
        token({ id: 'a', gain: 300, position: 1 }),
        token({ id: 'b', gain: 40, position: 2 }),
      ],
      jours: [],
    })

    expect(tokens.map((t) => t.issue)).toEqual(['tp', 'rate'])
  })

  it('ignore les tokens jamais notés', () => {
    const { tokens, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [token({ gain: null })],
      jours: [],
    })

    expect(tokens).toHaveLength(0)
    expect(compteurs.ignores.tokensNonNotes).toBe(1)
  })

  it('migre les tokens non pris comme des tokens ordinaires', () => {
    const { tokens, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [token({ gain: 150, pris: false })],
      jours: [],
    })

    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.issue).toBe('tp')
    expect(compteurs.tokens.tp).toBe(1)
  })

  it('rattache un token de test à la date de sa journée', () => {
    const { tokens } = convertir({
      wallets: [wallet()],
      tokens: [token({ phase: 'test', gain: 500, dayId: 'j1' })],
      jours: [jour({ id: 'j1', day: '2026-02-10' })],
    })

    expect(tokens[0]).toMatchObject({ phase: 'test', jour: '2026-02-10' })
  })

  it('ignore un token de test sans journée rattachée', () => {
    const { tokens, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [token({ phase: 'test', gain: 500, dayId: null })],
      jours: [],
    })

    expect(tokens).toHaveLength(0)
    expect(compteurs.ignores.tokensTestSansJour).toBe(1)
  })

  it('laisse jour à null en screening', () => {
    const { tokens } = convertir({
      wallets: [wallet()],
      tokens: [token({ phase: 'screening', gain: 500 })],
      jours: [],
    })

    expect(tokens[0]!.jour).toBeNull()
  })
})

describe('convertir — journées', () => {
  it('garde les journées relevées, sans lancement comprises', () => {
    const { jours, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [token({ phase: 'test', gain: 500, dayId: 'j1' })],
      jours: [
        jour({ id: 'j1', day: '2026-02-10', state: 'actif' }),
        jour({ id: 'j2', day: '2026-02-11', state: 'inactif' }),
      ],
    })

    expect(jours.map((j) => j.jour)).toEqual(['2026-02-10', '2026-02-11'])
    expect(compteurs.jours).toEqual({ total: 2, sansLancement: 1 })
  })

  it('écarte une journée seulement ouverte', () => {
    const { jours, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [],
      jours: [jour({ id: 'j1', state: 'ouvert' })],
    })

    expect(jours).toHaveLength(0)
    expect(compteurs.ignores.joursOuverts).toBe(1)
  })

  it('garde une journée ouverte qui porte malgré tout un token', () => {
    // Sinon le token migré référencerait une journée absente.
    const { jours, tokens } = convertir({
      wallets: [wallet()],
      tokens: [token({ phase: 'test', gain: 500, dayId: 'j1' })],
      jours: [jour({ id: 'j1', day: '2026-03-01', state: 'ouvert' })],
    })

    expect(jours).toHaveLength(1)
    expect(tokens[0]!.jour).toBe('2026-03-01')
  })

  it('ne migre pas les journées du lot trade', () => {
    const { jours, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [],
      jours: [jour({ id: 'j1', phase: 'trade' })],
    })

    expect(jours).toHaveLength(0)
    expect(compteurs.ignores.joursDeTrade).toBe(1)
  })

  it('aucun token migré ne référence une journée absente', () => {
    const resultat = convertir({
      wallets: [wallet()],
      tokens: [
        token({ id: 'a', phase: 'test', gain: 500, dayId: 'j1' }),
        token({ id: 'b', phase: 'test', gain: 10, dayId: 'j2' }),
      ],
      jours: [jour({ id: 'j1', day: '2026-03-01' }), jour({ id: 'j2', day: '2026-03-02' })],
    })

    const connues = new Set(resultat.jours.map((j) => `${j.walletId}:${j.jour}`))
    for (const t of resultat.tokens) {
      if (t.jour !== null) expect(connues.has(`${t.walletId}:${t.jour}`)).toBe(true)
    }
  })
})

describe('convertir — trades', () => {
  it('migre un token de trade chiffré, date reprise de sa journée', () => {
    const { trades } = convertir({
      wallets: [wallet({ objectif: 300 })],
      tokens: [
        token({ phase: 'trade', gain: 400, entreeSol: 0.05, sortieSol: 0.21, dayId: 'j1' }),
      ],
      jours: [jour({ id: 'j1', day: '2026-04-05', phase: 'trade' })],
    })

    expect(trades[0]).toMatchObject({
      date: '2026-04-05',
      entreeSol: 0.05,
      sortieSol: 0.21,
      issue: 'tp',
    })
  })

  it('déduit l’issue des montants quand le gain manque', () => {
    const { trades } = convertir({
      wallets: [wallet({ objectif: 300 })],
      tokens: [token({ phase: 'trade', gain: null, entreeSol: 0.1, sortieSol: 0.45 })],
      jours: [],
    })

    expect(trades[0]!.issue).toBe('tp')
  })

  it('ignore un trade sans montants exploitables', () => {
    const { trades, compteurs } = convertir({
      wallets: [wallet()],
      tokens: [
        token({ id: 'a', phase: 'trade', gain: 400, entreeSol: 0.05, sortieSol: null }),
        token({ id: 'b', phase: 'trade', gain: 400, entreeSol: 0, sortieSol: 0.2 }),
        token({ id: 'c', phase: 'trade', gain: null, entreeSol: null, sortieSol: null }),
      ],
      jours: [],
    })

    expect(trades).toHaveLength(0)
    expect(compteurs.ignores.tradesSansMontants).toBe(3)
    // Un trade sans montants n'est pas compté comme « token non noté ».
    expect(compteurs.ignores.tokensNonNotes).toBe(0)
  })

  it('se rabat sur la date de saisie faute de journée', () => {
    const { trades } = convertir({
      wallets: [wallet()],
      tokens: [
        token({
          phase: 'trade',
          gain: 400,
          entreeSol: 0.05,
          sortieSol: 0.2,
          dayId: null,
          createdAt: '2026-05-06T08:30:00.000Z',
        }),
      ],
      jours: [],
    })

    expect(trades[0]!.date).toBe('2026-05-06')
  })
})

describe('convertir — intégrité', () => {
  it('ignore les lignes orphelines plutôt que de les rattacher au hasard', () => {
    const { tokens, trades } = convertir({
      wallets: [wallet({ id: 'w1' })],
      tokens: [
        token({ id: 'a', walletId: 'inconnu', gain: 500 }),
        token({ id: 'b', walletId: 'inconnu', phase: 'trade', entreeSol: 1, sortieSol: 2 }),
      ],
      jours: [],
    })

    expect(tokens).toHaveLength(0)
    expect(trades).toHaveLength(0)
  })

  it('tout token et tout trade pointe vers un wallet migré', () => {
    const resultat = convertir({
      wallets: [wallet({ id: 'w1' }), wallet({ id: 'w2', address: 'B' })],
      tokens: [
        token({ id: 'a', walletId: 'w1', gain: 500 }),
        token({ id: 'b', walletId: 'w2', gain: 10 }),
      ],
      jours: [],
    })

    const ids = new Set(resultat.wallets.map((w) => w.id))
    for (const t of resultat.tokens) expect(ids.has(t.walletId)).toBe(true)
    for (const t of resultat.trades) expect(ids.has(t.walletId)).toBe(true)
  })
})
