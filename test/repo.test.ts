/**
 * Tests de la couche d'accès aux données, sur une base jetable.
 *
 * `RUGGERS_DB_PATH` doit être posé avant le premier import de lib/db, d'où
 * le `vi.hoisted` : c'est lui qui s'exécute en premier.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'

const { dossier } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dossier = mkdtempSync(join(tmpdir(), 'ruggers-test-'))
  process.env.RUGGERS_DB_PATH = join(dossier, 'test.db')
  return { dossier }
})

const { db } = await import('@/lib/db')
const { tokens, walletDays, wallets } = await import('@/lib/db/schema')
const walletsRepo = await import('@/lib/repo/wallets')
const daysRepo = await import('@/lib/repo/days')
const { toDayInputs } = await import('@/lib/repo/types')
const { computeTestReport } = await import('@/lib/test-report')
const tokensRepo = await import('@/lib/repo/tokens')
const settingsRepo = await import('@/lib/repo/settings')

const ADRESSE = '11111111111111111111111111111111'
const AUTRE_ADRESSE = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

function nouveauWallet(address = ADRESSE) {
  return walletsRepo.createWallet({
    label: 'Wallet test',
    address,
    analyzedAt: '2026-10-05',
  })
}

beforeEach(() => {
  db.delete(tokens).run()
  db.delete(walletDays).run()
  db.delete(wallets).run()
  settingsRepo.updateSolPrice(null)
  settingsRepo.updateDefaults({
    mise: 0.1,
    objectif: 100,
    perteRug: 90,
    frais: 0.003,
    tauxVise: 30,
  })
})

afterAll(() => {
  rmSync(dossier, { recursive: true, force: true })
})

describe('createWallet', () => {
  it('crée le wallet avec 10 lignes de tokens vides', () => {
    const wallet = nouveauWallet()
    expect(wallet.tokens).toHaveLength(walletsRepo.LIGNES_INITIALES)
    expect(wallet.tokens.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(
      wallet.tokens.every((t) => t.gain === null && t.perteRug === null),
    ).toBe(true)
  })

  it('copie les réglages par défaut du moment', () => {
    settingsRepo.updateDefaults({
      mise: 0.5,
      objectif: 200,
      perteRug: 80,
      frais: 0.005,
      tauxVise: 40,
    })
    expect(nouveauWallet().strategy).toEqual({
      mise: 0.5,
      objectif: 200,
      perteRug: 80,
      frais: 0.005,
      tauxVise: 40,
    })
  })

  it('ne réécrit pas l’historique quand les défauts changent ensuite', () => {
    const wallet = nouveauWallet()
    settingsRepo.updateDefaults({
      mise: 9,
      objectif: 9,
      perteRug: 9,
      frais: 9,
      tauxVise: 9,
    })
    expect(walletsRepo.getWallet(wallet.id)?.strategy.mise).toBe(0.1)
  })

  it('refuse deux fois la même adresse', () => {
    nouveauWallet()
    expect(() => nouveauWallet()).toThrow()
  })

  it('marque la source comme manuelle', () => {
    expect(nouveauWallet().source).toBe('manual')
  })
})

describe('listWallets', () => {
  it('trie par date d’analyse décroissante', () => {
    walletsRepo.createWallet({
      label: 'Ancien',
      address: ADRESSE,
      analyzedAt: '2026-01-01',
    })
    walletsRepo.createWallet({
      label: 'Récent',
      address: AUTRE_ADRESSE,
      analyzedAt: '2026-10-05',
    })
    expect(walletsRepo.listWallets().map((w) => w.label)).toEqual(['Récent', 'Ancien'])
  })

  it('rattache ses tokens à chaque wallet', () => {
    nouveauWallet()
    nouveauWallet(AUTRE_ADRESSE)
    const liste = walletsRepo.listWallets()
    expect(liste).toHaveLength(2)
    expect(liste.every((w) => w.tokens.length === 10)).toBe(true)
    expect(liste.every((w) => w.tokens.every((t) => t.walletId === w.id))).toBe(true)
  })
})

describe('updateWallet', () => {
  it('modifie un champ sans toucher aux autres', () => {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, { label: 'Nouveau nom' })
    const relu = walletsRepo.getWallet(wallet.id)
    expect(relu?.label).toBe('Nouveau nom')
    expect(relu?.address).toBe(ADRESSE)
  })

  it('modifie une partie de la stratégie seulement', () => {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, { strategy: { objectif: 250 } })
    const relu = walletsRepo.getWallet(wallet.id)
    expect(relu?.strategy.objectif).toBe(250)
    expect(relu?.strategy.perteRug).toBe(90)
  })

  it('pose et retire le tag manuel', () => {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, { tagOverride: 'surveiller' })
    expect(walletsRepo.getWallet(wallet.id)?.tagOverride).toBe('surveiller')
    walletsRepo.updateWallet(wallet.id, { tagOverride: null })
    expect(walletsRepo.getWallet(wallet.id)?.tagOverride).toBeNull()
  })
})

describe('deleteWallet', () => {
  it('emporte les tokens avec lui', () => {
    const wallet = nouveauWallet()
    walletsRepo.deleteWallet(wallet.id)
    expect(walletsRepo.getWallet(wallet.id)).toBeNull()
    expect(tokensRepo.listTokens(wallet.id)).toHaveLength(0)
  })
})

describe('tokens', () => {
  it('ajoute un token à la suite', () => {
    const wallet = nouveauWallet()
    const token = tokensRepo.createToken(wallet.id)
    expect(token.position).toBe(11)
    expect(tokensRepo.listTokens(wallet.id)).toHaveLength(11)
  })

  it('met à jour un token sans effacer le reste', () => {
    const wallet = nouveauWallet()
    const premier = wallet.tokens[0]!
    tokensRepo.updateToken(premier.id, { gain: 150, name: 'PEPE' })
    tokensRepo.updateToken(premier.id, { perteRug: 65 })

    const relu = tokensRepo.listTokens(wallet.id)[0]!
    expect(relu.gain).toBe(150)
    expect(relu.name).toBe('PEPE')
    expect(relu.perteRug).toBe(65)
  })

  it('accepte de remettre un gain à vide', () => {
    const wallet = nouveauWallet()
    const premier = wallet.tokens[0]!
    tokensRepo.updateToken(premier.id, { gain: 150 })
    tokensRepo.updateToken(premier.id, { gain: null })
    expect(tokensRepo.listTokens(wallet.id)[0]!.gain).toBeNull()
  })

  it('distingue une perte nulle d’une perte absente', () => {
    const wallet = nouveauWallet()
    const premier = wallet.tokens[0]!
    tokensRepo.updateToken(premier.id, { perteRug: 0 })
    expect(tokensRepo.listTokens(wallet.id)[0]!.perteRug).toBe(0)
    tokensRepo.updateToken(premier.id, { perteRug: null })
    expect(tokensRepo.listTokens(wallet.id)[0]!.perteRug).toBeNull()
  })

  it('supprime un token', () => {
    const wallet = nouveauWallet()
    tokensRepo.deleteToken(wallet.tokens[0]!.id)
    expect(tokensRepo.listTokens(wallet.id)).toHaveLength(9)
  })

  it('sait insérer des tokens venus d’un import automatique', () => {
    const wallet = nouveauWallet()
    const crees = tokensRepo.createTokens(
      wallet.id,
      [{ gain: 150, mint: 'MINT1' }, { gain: 20, perteRug: 90 }],
      { source: 'helius' },
    )
    expect(crees.map((t) => t.source)).toEqual(['helius', 'helius'])
    expect(crees.map((t) => t.position)).toEqual([11, 12])
  })
})

describe('settings', () => {
  it('existe dès l’ouverture de la base', () => {
    expect(settingsRepo.getSettings().defaults.mise).toBe(0.1)
  })

  it('retient le prix du SOL', () => {
    settingsRepo.updateSolPrice(185.5)
    expect(settingsRepo.getSettings().solPriceEur).toBe(185.5)
    settingsRepo.updateSolPrice(null)
    expect(settingsRepo.getSettings().solPriceEur).toBeNull()
  })
})

describe('journées de test', () => {
  function enTest(debut = '2026-10-01') {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, { status: 'test', testStartedAt: debut })
    return wallet.id
  }

  it('enregistre une journée et ses tokens d’un bloc', () => {
    const id = enTest()
    const jour = daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: -80, perteRug: 80 }],
    })

    expect(jour.state).toBe('actif')

    const wallet = walletsRepo.getWallet(id)!
    const duJour = wallet.tokens.filter((t) => t.dayId === jour.id)
    expect(duJour).toHaveLength(2)
    expect(duJour.every((t) => t.phase === 'test')).toBe(true)
  })

  it('n’ajoute pas les tokens de test à l’échantillon de screening', () => {
    // Les deux lots cohabitent dans la même table mais ne se mélangent jamais
    // dans les bilans.
    const id = enTest()
    daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })

    const wallet = walletsRepo.getWallet(id)!
    expect(wallet.tokens.filter((t) => t.phase === 'screening')).toHaveLength(
      walletsRepo.LIGNES_INITIALES,
    )
    expect(wallet.tokens.filter((t) => t.phase === 'test')).toHaveLength(1)
  })

  it('remplace le contenu quand on ré-enregistre la journée', () => {
    const id = enTest()
    daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: 20 }],
    })
    const jour = daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 300 }],
    })

    expect(daysRepo.listDays(id)).toHaveLength(1)
    const duJour = walletsRepo
      .getWallet(id)!
      .tokens.filter((t) => t.dayId === jour.id)
    expect(duJour.map((t) => t.gain)).toEqual([300])
  })

  it('vide la journée quand on la passe en inactive', () => {
    const id = enTest()
    daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })
    daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'inactif',
      tokens: [],
    })

    const wallet = walletsRepo.getWallet(id)!
    expect(wallet.days[0]!.state).toBe('inactif')
    expect(wallet.tokens.filter((t) => t.phase === 'test')).toHaveLength(0)
  })

  it('emporte les tokens de la journée quand on la supprime', () => {
    const id = enTest()
    const jour = daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: 20 }],
    })

    daysRepo.deleteDay(jour.id)
    expect(daysRepo.listDays(id)).toHaveLength(0)
    expect(
      walletsRepo.getWallet(id)!.tokens.filter((t) => t.phase === 'test'),
    ).toHaveLength(0)
  })

  it('rend les journées dans l’ordre du temps', () => {
    const id = enTest()
    for (const day of ['2026-10-03', '2026-10-01', '2026-10-02']) {
      daysRepo.saveDay({ walletId: id, day, state: 'inactif', tokens: [] })
    }
    expect(daysRepo.listDays(id).map((j) => j.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
  })

  it('emporte journées et tokens quand le wallet est supprimé', () => {
    const id = enTest()
    daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })

    walletsRepo.deleteWallet(id)
    expect(daysRepo.listDays(id)).toHaveLength(0)
    expect(db.select().from(tokens).all()).toHaveLength(0)
  })
})

describe('file du matin', () => {
  it('réclame les journées manquantes jusqu’à la veille', () => {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, {
      status: 'test',
      testStartedAt: '2026-10-01',
    })
    daysRepo.saveDay({
      walletId: wallet.id,
      day: '2026-10-02',
      state: 'inactif',
      tokens: [],
    })

    const file = daysRepo.listFileDuMatin('2026-10-05')
    expect(file).toHaveLength(1)
    expect(file[0]!.jours).toEqual(['2026-10-01', '2026-10-03', '2026-10-04'])
  })

  it('ignore les wallets qui ne sont pas en test', () => {
    nouveauWallet()
    expect(daysRepo.listFileDuMatin('2026-10-05')).toEqual([])
  })

  it('ne garde pas un wallet dont tout est saisi', () => {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, {
      status: 'test',
      testStartedAt: '2026-10-04',
    })
    daysRepo.saveDay({
      walletId: wallet.id,
      day: '2026-10-04',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })
    expect(daysRepo.listFileDuMatin('2026-10-05')).toEqual([])
  })
})

describe('phase de test de bout en bout', () => {
  /** Quatre journées relevées, comme quatre matins de suite. */
  function quatreMatins() {
    const wallet = nouveauWallet()
    walletsRepo.updateWallet(wallet.id, {
      status: 'test',
      testStartedAt: '2026-10-01',
    })

    const releves: Record<string, number[]> = {
      '2026-10-01': [150, 150, 20, 20, 20],
      '2026-10-02': [150, 20, 20],
      '2026-10-04': [150, 150, 20],
    }

    for (const [day, gains] of Object.entries(releves)) {
      daysRepo.saveDay({
        walletId: wallet.id,
        day,
        state: 'actif',
        tokens: gains.map((gain) => ({ gain })),
      })
    }
    daysRepo.saveDay({
      walletId: wallet.id,
      day: '2026-10-03',
      state: 'inactif',
      tokens: [],
    })

    return wallet.id
  }

  it('reconstitue les journées depuis la base dans le bon ordre', () => {
    const wallet = walletsRepo.getWallet(quatreMatins())!
    const jours = toDayInputs(wallet)

    expect(jours.map((j) => j.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(jours.map((j) => j.tokens.length)).toEqual([5, 3, 0, 3])
    expect(jours[2]!.state).toBe('inactif')
  })

  it('débloque le verdict au bout de quatre journées', () => {
    const wallet = walletsRepo.getWallet(quatreMatins())!
    const rapport = computeTestReport(toDayInputs(wallet), wallet.strategy)

    expect(rapport.joursObserves).toBe(4)
    expect(rapport.joursActifs).toBe(3)
    expect(rapport.report.n).toBe(11)
    expect(rapport.report.hits).toBe(5)
    expect(rapport.verdictDisponible).toBe(true)
  })

  it('tient le relevé de test à l’écart de l’échantillon de screening', () => {
    // Les 10 lignes d'amorce restent au screening, vides : elles ne doivent
    // ni gonfler le bilan de test ni être gonflées par lui.
    const wallet = walletsRepo.getWallet(quatreMatins())!
    const screening = wallet.tokens.filter((t) => t.phase === 'screening')

    expect(screening).toHaveLength(walletsRepo.LIGNES_INITIALES)
    expect(screening.every((t) => t.gain === null)).toBe(true)
    expect(wallet.tokens.filter((t) => t.phase === 'test')).toHaveLength(11)
  })

  it('ne réclame plus rien quand les quatre matins sont faits', () => {
    const id = quatreMatins()
    expect(
      daysRepo.listFileDuMatin('2026-10-05').filter((e) => e.wallet.id === id),
    ).toEqual([])
  })
})
