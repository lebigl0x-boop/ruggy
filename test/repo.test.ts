/**
 * Tests de la couche d'accès aux données, sur un Postgres jetable.
 *
 * PGlite fait tourner un vrai Postgres en mémoire, dans le processus : la
 * suite reste autonome — ni conteneur, ni base distante — tout en exécutant
 * le SQL réellement envoyé en production.
 *
 * `DATABASE_URL` doit être absente au premier import de lib/db : c'est elle
 * qui décide du pilote, d'où le `vi.hoisted`, exécuté en premier.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

await vi.hoisted(async () => {
  delete process.env.DATABASE_URL
  process.env.RUGGERS_DB_MEMOIRE = '1'
})

const { db } = await import('@/lib/db')
const { tokens, walletDays, wallets } = await import('@/lib/db/schema')
const { ensureSettingsRow } = await import('@/lib/db/seed')
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

// Le schéma est créé une fois : PGlite démarre sur une base vide.
beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const { resolve } = await import('node:path')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, {
    migrationsFolder: resolve(process.cwd(), 'lib/db/migrations'),
  })
  await ensureSettingsRow(db)
})

beforeEach(async () => {
  await db.delete(tokens)
  await db.delete(walletDays)
  await db.delete(wallets)
  await settingsRepo.updateSolPrice(null)
  await settingsRepo.updateDefaults({
    mise: 0.1,
    objectif: 100,
    perteRug: 90,
    frais: 0.003,
    tauxVise: 30,
  })
})

afterAll(async () => {
  // PGlite vit en mémoire : il disparaît avec le processus, rien à effacer.
})

describe('createWallet', () => {
  it('crée le wallet avec 10 lignes de tokens vides', async () => {
    const wallet = await nouveauWallet()
    expect(wallet.tokens).toHaveLength(walletsRepo.LIGNES_INITIALES)
    expect(wallet.tokens.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(
      wallet.tokens.every((t) => t.gain === null && t.perteRug === null),
    ).toBe(true)
  })

  it('copie les réglages par défaut du moment', async () => {
    await settingsRepo.updateDefaults({
      mise: 0.5,
      objectif: 200,
      perteRug: 80,
      frais: 0.005,
      tauxVise: 40,
    })
    expect((await nouveauWallet()).strategy).toEqual({
      mise: 0.5,
      objectif: 200,
      perteRug: 80,
      frais: 0.005,
      tauxVise: 40,
    })
  })

  it('ne réécrit pas l’historique quand les défauts changent ensuite', async () => {
    const wallet = await nouveauWallet()
    await settingsRepo.updateDefaults({
      mise: 9,
      objectif: 9,
      perteRug: 9,
      frais: 9,
      tauxVise: 9,
    })
    expect((await walletsRepo.getWallet(wallet.id))?.strategy.mise).toBe(0.1)
  })

  it('refuse deux fois la même adresse', async () => {
    await nouveauWallet()
    await expect(nouveauWallet()).rejects.toThrow()
  })

  it('marque la source comme manuelle', async () => {
    expect((await nouveauWallet()).source).toBe('manual')
  })
})

describe('listWallets', () => {
  it('trie par date d’analyse décroissante', async () => {
    await walletsRepo.createWallet({
      label: 'Ancien',
      address: ADRESSE,
      analyzedAt: '2026-01-01',
    })
    await walletsRepo.createWallet({
      label: 'Récent',
      address: AUTRE_ADRESSE,
      analyzedAt: '2026-10-05',
    })
    expect((await walletsRepo.listWallets()).map((w) => w.label)).toEqual(['Récent', 'Ancien'])
  })

  it('rattache ses tokens à chaque wallet', async () => {
    await nouveauWallet()
    await nouveauWallet(AUTRE_ADRESSE)
    const liste = await walletsRepo.listWallets()
    expect(liste).toHaveLength(2)
    expect(liste.every((w) => w.tokens.length === 10)).toBe(true)
    expect(liste.every((w) => w.tokens.every((t) => t.walletId === w.id))).toBe(true)
  })
})

describe('updateWallet', () => {
  it('modifie un champ sans toucher aux autres', async () => {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, { label: 'Nouveau nom' })
    const relu = await walletsRepo.getWallet(wallet.id)
    expect(relu?.label).toBe('Nouveau nom')
    expect(relu?.address).toBe(ADRESSE)
  })

  it('modifie une partie de la stratégie seulement', async () => {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, { strategy: { objectif: 250 } })
    const relu = await walletsRepo.getWallet(wallet.id)
    expect(relu?.strategy.objectif).toBe(250)
    expect(relu?.strategy.perteRug).toBe(90)
  })

  it('pose et retire le tag manuel', async () => {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, { tagOverride: 'surveiller' })
    expect((await walletsRepo.getWallet(wallet.id))?.tagOverride).toBe('surveiller')
    await walletsRepo.updateWallet(wallet.id, { tagOverride: null })
    expect((await walletsRepo.getWallet(wallet.id))?.tagOverride).toBeNull()
  })
})

describe('deleteWallet', () => {
  it('emporte les tokens avec lui', async () => {
    const wallet = await nouveauWallet()
    await walletsRepo.deleteWallet(wallet.id)
    expect(await walletsRepo.getWallet(wallet.id)).toBeNull()
    expect(await tokensRepo.listTokens(wallet.id)).toHaveLength(0)
  })
})

describe('tokens', () => {
  it('ajoute un token à la suite', async () => {
    const wallet = await nouveauWallet()
    const token = await tokensRepo.createToken(wallet.id)
    expect(token.position).toBe(11)
    expect(await tokensRepo.listTokens(wallet.id)).toHaveLength(11)
  })

  it('met à jour un token sans effacer le reste', async () => {
    const wallet = await nouveauWallet()
    const premier = wallet.tokens[0]!
    await tokensRepo.updateToken(premier.id, { gain: 150, name: 'PEPE' })
    await tokensRepo.updateToken(premier.id, { perteRug: 65 })

    const relu = (await tokensRepo.listTokens(wallet.id))[0]!
    expect(relu.gain).toBe(150)
    expect(relu.name).toBe('PEPE')
    expect(relu.perteRug).toBe(65)
  })

  it('bascule un token en « pas pris »', async () => {
    const wallet = await nouveauWallet()
    const premier = (await tokensRepo.listTokens(wallet.id))[0]!

    await tokensRepo.updateToken(premier.id, { pris: false })
    expect((await tokensRepo.listTokens(wallet.id))[0]!.pris).toBe(false)

    await tokensRepo.updateToken(premier.id, { pris: true })
    expect((await tokensRepo.listTokens(wallet.id))[0]!.pris).toBe(true)
  })

  it('accepte de remettre un gain à vide', async () => {
    const wallet = await nouveauWallet()
    const premier = wallet.tokens[0]!
    await tokensRepo.updateToken(premier.id, { gain: 150 })
    await tokensRepo.updateToken(premier.id, { gain: null })
    expect((await tokensRepo.listTokens(wallet.id))[0]!.gain).toBeNull()
  })

  it('distingue une perte nulle d’une perte absente', async () => {
    const wallet = await nouveauWallet()
    const premier = wallet.tokens[0]!
    await tokensRepo.updateToken(premier.id, { perteRug: 0 })
    expect((await tokensRepo.listTokens(wallet.id))[0]!.perteRug).toBe(0)
    await tokensRepo.updateToken(premier.id, { perteRug: null })
    expect((await tokensRepo.listTokens(wallet.id))[0]!.perteRug).toBeNull()
  })

  it('supprime un token', async () => {
    const wallet = await nouveauWallet()
    await tokensRepo.deleteToken(wallet.tokens[0]!.id)
    expect(await tokensRepo.listTokens(wallet.id)).toHaveLength(9)
  })

  it('sait insérer des tokens venus d’un import automatique', async () => {
    const wallet = await nouveauWallet()
    const crees = await tokensRepo.createTokens(
      wallet.id,
      [{ gain: 150, mint: 'MINT1' }, { gain: 20, perteRug: 90 }],
      { source: 'helius' },
    )
    expect(crees.map((t) => t.source)).toEqual(['helius', 'helius'])
    expect(crees.map((t) => t.position)).toEqual([11, 12])
  })
})

describe('settings', () => {
  it('existe dès l’ouverture de la base', async () => {
    expect((await settingsRepo.getSettings()).defaults.mise).toBe(0.1)
  })

  it('retient le prix du SOL', async () => {
    await settingsRepo.updateSolPrice(185.5)
    expect((await settingsRepo.getSettings()).solPriceEur).toBe(185.5)
    await settingsRepo.updateSolPrice(null)
    expect((await settingsRepo.getSettings()).solPriceEur).toBeNull()
  })
})

describe('journées de test', () => {
  async function enTest(debut = '2026-10-01') {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, { status: 'test', testStartedAt: debut })
    return wallet.id
  }

  it('enregistre une journée et ses tokens d’un bloc', async () => {
    const id = await enTest()
    const jour = await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: -80, perteRug: 80 }],
    })

    expect(jour.state).toBe('actif')

    const wallet = (await walletsRepo.getWallet(id))!
    const duJour = wallet.tokens.filter((t) => t.dayId === jour.id)
    expect(duJour).toHaveLength(2)
    expect(duJour.every((t) => t.phase === 'test')).toBe(true)
  })

  it('retient les tokens écartés d’une journée', async () => {
    const id = await enTest()
    const jour = await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: 20, pris: false }],
    })

    const duJour = (await walletsRepo.getWallet(id))!.tokens.filter(
      (t) => t.dayId === jour.id,
    )
    expect(duJour.map((t) => t.pris)).toEqual([true, false])
  })

  it('prend le token par défaut quand rien n’est précisé', async () => {
    // Les relevés d'avant le filtre doivent garder les chiffres qu'ils avaient.
    const id = await enTest()
    const jour = await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })

    const duJour = (await walletsRepo.getWallet(id))!.tokens.filter(
      (t) => t.dayId === jour.id,
    )
    expect(duJour[0]!.pris).toBe(true)
  })

  it('n’ajoute pas les tokens de test à l’échantillon de screening', async () => {
    // Les deux lots cohabitent dans la même table mais ne se mélangent jamais
    // dans les bilans.
    const id = await enTest()
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })

    const wallet = (await walletsRepo.getWallet(id))!
    expect(wallet.tokens.filter((t) => t.phase === 'screening')).toHaveLength(
      walletsRepo.LIGNES_INITIALES,
    )
    expect(wallet.tokens.filter((t) => t.phase === 'test')).toHaveLength(1)
  })

  it('remplace le contenu quand on ré-enregistre la journée', async () => {
    const id = await enTest()
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: 20 }],
    })
    const jour = await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 300 }],
    })

    expect(await daysRepo.listDays(id)).toHaveLength(1)
    const duJour = (await walletsRepo.getWallet(id))!.tokens.filter(
      (t) => t.dayId === jour.id,
    )
    expect(duJour.map((t) => t.gain)).toEqual([300])
  })

  it('vide la journée quand on la passe en inactive', async () => {
    const id = await enTest()
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'inactif',
      tokens: [],
    })

    const wallet = (await walletsRepo.getWallet(id))!
    expect(wallet.days[0]!.state).toBe('inactif')
    expect(wallet.tokens.filter((t) => t.phase === 'test')).toHaveLength(0)
  })

  it('emporte les tokens de la journée quand on la supprime', async () => {
    const id = await enTest()
    const jour = await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }, { gain: 20 }],
    })

    await daysRepo.deleteDay(jour.id)
    expect(await daysRepo.listDays(id)).toHaveLength(0)
    expect(
      (await walletsRepo.getWallet(id))!.tokens.filter((t) => t.phase === 'test'),
    ).toHaveLength(0)
  })

  it('rend les journées dans l’ordre du temps', async () => {
    const id = await enTest()
    for (const day of ['2026-10-03', '2026-10-01', '2026-10-02']) {
      await daysRepo.saveDay({ walletId: id, day, state: 'inactif', tokens: [] })
    }
    expect((await daysRepo.listDays(id)).map((j) => j.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
  })

  it('emporte journées et tokens quand le wallet est supprimé', async () => {
    const id = await enTest()
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-01',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })

    await walletsRepo.deleteWallet(id)
    expect(await daysRepo.listDays(id)).toHaveLength(0)
    expect(await db.select().from(tokens)).toHaveLength(0)
  })
})

describe('file du matin', () => {
  it('réclame les journées manquantes jusqu’à la veille', async () => {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, {
      status: 'test',
      testStartedAt: '2026-10-01',
    })
    await daysRepo.saveDay({
      walletId: wallet.id,
      day: '2026-10-02',
      state: 'inactif',
      tokens: [],
    })

    const file = await daysRepo.listFileDuMatin('2026-10-05')
    expect(file).toHaveLength(1)
    expect(file[0]!.jours).toEqual(['2026-10-01', '2026-10-03', '2026-10-04'])
  })

  it('ignore les wallets qui ne sont pas en test', async () => {
    await nouveauWallet()
    expect(await daysRepo.listFileDuMatin('2026-10-05')).toEqual([])
  })

  it('ne garde pas un wallet dont tout est saisi', async () => {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, {
      status: 'test',
      testStartedAt: '2026-10-04',
    })
    await daysRepo.saveDay({
      walletId: wallet.id,
      day: '2026-10-04',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })
    expect(await daysRepo.listFileDuMatin('2026-10-05')).toEqual([])
  })
})

describe('phase de test de bout en bout', () => {
  /** Quatre journées relevées, comme quatre matins de suite. */
  async function quatreMatins() {
    const wallet = await nouveauWallet()
    await walletsRepo.updateWallet(wallet.id, {
      status: 'test',
      testStartedAt: '2026-10-01',
    })

    const releves: Record<string, number[]> = {
      '2026-10-01': [150, 150, 20, 20, 20],
      '2026-10-02': [150, 20, 20],
      '2026-10-04': [150, 150, 20],
    }

    for (const [day, gains] of Object.entries(releves)) {
      await daysRepo.saveDay({
        walletId: wallet.id,
        day,
        state: 'actif',
        tokens: gains.map((gain) => ({ gain })),
      })
    }
    await daysRepo.saveDay({
      walletId: wallet.id,
      day: '2026-10-03',
      state: 'inactif',
      tokens: [],
    })

    return wallet.id
  }

  it('reconstitue les journées depuis la base dans le bon ordre', async () => {
    const wallet = (await walletsRepo.getWallet(await quatreMatins()))!
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

  it('débloque le verdict au bout de quatre journées', async () => {
    const wallet = (await walletsRepo.getWallet(await quatreMatins()))!
    const rapport = computeTestReport(toDayInputs(wallet), wallet.strategy)

    expect(rapport.joursObserves).toBe(4)
    expect(rapport.joursActifs).toBe(3)
    expect(rapport.report.n).toBe(11)
    expect(rapport.report.hits).toBe(5)
    expect(rapport.verdictDisponible).toBe(true)
  })

  it('tient le relevé de test à l’écart de l’échantillon de screening', async () => {
    // Les 10 lignes d'amorce restent au screening, vides : elles ne doivent
    // ni gonfler le bilan de test ni être gonflées par lui.
    const wallet = (await walletsRepo.getWallet(await quatreMatins()))!
    const screening = wallet.tokens.filter((t) => t.phase === 'screening')

    expect(screening).toHaveLength(walletsRepo.LIGNES_INITIALES)
    expect(screening.every((t) => t.gain === null)).toBe(true)
    expect(wallet.tokens.filter((t) => t.phase === 'test')).toHaveLength(11)
  })

  it('ne réclame plus rien quand les quatre matins sont faits', async () => {
    const id = await quatreMatins()
    expect(
      (await daysRepo.listFileDuMatin('2026-10-05')).filter((e) => e.wallet.id === id),
    ).toEqual([])
  })
})
