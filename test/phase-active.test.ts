/**
 * La phase active, bout en bout : base, actions, et surtout l'étanchéité
 * entre le relevé de test et le relevé de trade.
 *
 * C'est le point où une erreur serait invisible : un montant réel tombé dans
 * le lot de test, ou l'inverse, ne lèverait aucune exception — il donnerait
 * seulement un chiffre faux. D'où des tests sur la base réelle plutôt que sur
 * les seules fonctions pures.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

process.env.RUGGERS_DB_MEMOIRE = '1'
delete process.env.DATABASE_URL

const { db } = await import('@/lib/db')
const { tokens, walletDays, wallets } = await import('@/lib/db/schema')
const { ensureSettingsRow } = await import('@/lib/db/seed')
const walletsRepo = await import('@/lib/repo/wallets')
const daysRepo = await import('@/lib/repo/days')
const tokensRepo = await import('@/lib/repo/tokens')
const { toDayInputs, tradeTokens, testTokens } = await import('@/lib/repo/types')
const { computeTradeReport } = await import('@/lib/trade-report')
const { computeTestReport } = await import('@/lib/test-report')
const { startTradeAction, stopTradeAction, createDayTokenAction } = await import(
  '@/app/actions'
)

const ADRESSE = '11111111111111111111111111111111'

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  await migrate(db as never, {
    migrationsFolder: resolve(process.cwd(), 'lib/db/migrations'),
  })
  await ensureSettingsRow(db)
})

beforeEach(async () => {
  await db.delete(tokens)
  await db.delete(walletDays)
  await db.delete(wallets)
})

async function walletValide() {
  const wallet = await walletsRepo.createWallet({
    label: 'Wallet test',
    address: ADRESSE,
    analyzedAt: '2026-10-01',
  })
  await walletsRepo.updateWallet(wallet.id, {
    status: 'valide',
    testStartedAt: '2026-10-02',
  })
  return wallet.id
}

describe('startTradeAction', () => {
  it('fait passer un wallet validé en phase active et ouvre sa fenêtre', async () => {
    const id = await walletValide()

    expect(await startTradeAction(id)).toEqual({ ok: true })

    const apres = await walletsRepo.getWallet(id)
    expect(apres?.status).toBe('trade')
    expect(apres?.tradeStartedAt).not.toBeNull()
  })

  it('refuse un wallet qui n’a pas été validé', async () => {
    const wallet = await walletsRepo.createWallet({
      label: 'Jamais testé',
      address: ADRESSE,
      analyzedAt: '2026-10-01',
    })

    const resultat = await startTradeAction(wallet.id)
    expect(resultat.ok).toBe(false)
    expect((await walletsRepo.getWallet(wallet.id))?.status).toBe('screening')
  })

  it('garde la date de départ quand on relance une phase déjà ouverte', async () => {
    const id = await walletValide()
    await walletsRepo.updateWallet(id, { tradeStartedAt: '2026-09-01' })

    await startTradeAction(id)

    expect((await walletsRepo.getWallet(id))?.tradeStartedAt).toBe('2026-09-01')
  })
})

describe('stopTradeAction', () => {
  it('repasse en « validé » sans toucher aux journées jouées', async () => {
    const id = await walletValide()
    await startTradeAction(id)
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'actif',
      phase: 'trade',
      tokens: [{ gain: 150, entreeSol: 0.2, sortieSol: 0.5 }],
    })

    expect(await stopTradeAction(id)).toEqual({ ok: true })

    const apres = await walletsRepo.getWallet(id)
    expect(apres?.status).toBe('valide')
    // L'historique du PNL réel n'a aucune raison de disparaître.
    expect(tradeTokens(apres!)).toHaveLength(1)
    expect(apres?.days).toHaveLength(1)
  })
})

describe('étanchéité entre les deux relevés', () => {
  it('accepte une journée de test et une journée de trade à la même date', async () => {
    const id = await walletValide()

    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'actif',
      phase: 'test',
      tokens: [{ gain: 150 }],
    })
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'actif',
      phase: 'trade',
      tokens: [{ gain: 150, entreeSol: 0.2, sortieSol: 0.5 }],
    })

    const wallet = await walletsRepo.getWallet(id)
    expect(wallet?.days).toHaveLength(2)
    expect(testTokens(wallet!)).toHaveLength(1)
    expect(tradeTokens(wallet!)).toHaveLength(1)
  })

  it('ne réécrit pas la journée de l’autre phase', async () => {
    const id = await walletValide()

    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'actif',
      phase: 'test',
      tokens: [{ gain: 150 }, { gain: -80 }],
    })
    // Même date, phase différente : saveDay remplace le contenu d'une
    // journée, il ne doit remplacer que la sienne.
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'inactif',
      phase: 'trade',
      tokens: [],
    })

    const wallet = await walletsRepo.getWallet(id)
    expect(testTokens(wallet!)).toHaveLength(2)
  })

  it('ne mélange pas les deux lots dans les bilans', async () => {
    const id = await walletValide()

    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-05',
      state: 'actif',
      phase: 'test',
      tokens: [{ gain: 150 }],
    })
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'actif',
      phase: 'trade',
      tokens: [{ gain: 150, entreeSol: 0.2, sortieSol: 0.5 }],
    })

    const wallet = await walletsRepo.getWallet(id)
    const test = computeTestReport(toDayInputs(wallet!), wallet!.strategy)
    const trade = computeTradeReport(toDayInputs(wallet!, 'trade'), wallet!.strategy)

    expect(test.joursObserves).toBe(1)
    expect(test.pnlSol).toBeCloseTo(0.147, 10)
    expect(trade.joursObserves).toBe(1)
    expect(trade.pnlReelSol).toBeCloseTo(0.3, 10)
  })

  it('la file du matin ignore les journées de trade', async () => {
    const id = await walletValide()
    await walletsRepo.updateWallet(id, { status: 'test', testStartedAt: '2026-10-10' })
    // Une journée de trade posée sur une date que le test n'a pas relevée :
    // la compter ferait passer la journée pour faite.
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-10',
      state: 'actif',
      phase: 'trade',
      tokens: [{ gain: 150, entreeSol: 0.2, sortieSol: 0.5 }],
    })

    const file = await daysRepo.listFileDuMatin('2026-10-12')
    expect(file[0]?.aRelever).toEqual(['2026-10-10', '2026-10-11'])
  })
})

describe('createDayTokenAction', () => {
  it('rattache le token au lot de sa journée, pas au statut du wallet', async () => {
    const id = await walletValide()
    await startTradeAction(id)

    const jour = await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-12',
      state: 'ouvert',
      phase: 'trade',
      tokens: [],
    })

    // Le wallet repasse en test pendant qu'on complète une journée de trade.
    await walletsRepo.updateWallet(id, { status: 'test' })
    const token = await createDayTokenAction(id, jour.id)

    expect(token.phase).toBe('trade')
  })
})

describe('montants réels en base', () => {
  it('écrit et relit l’entrée et la sortie', async () => {
    const id = await walletValide()
    const [token] = await tokensRepo.createTokens(id, [
      { gain: 150, entreeSol: 0.2, sortieSol: 0.55 },
    ])

    const relu = (await walletsRepo.getWallet(id))!.tokens.find(
      (autre) => autre.id === token!.id,
    )
    expect(relu?.entreeSol).toBe(0.2)
    expect(relu?.sortieSol).toBe(0.55)
  })

  it('efface un montant remis à vide', async () => {
    const id = await walletValide()
    const [token] = await tokensRepo.createTokens(id, [
      { gain: 150, entreeSol: 0.2, sortieSol: 0.55 },
    ])

    await tokensRepo.updateToken(token!.id, { sortieSol: null })

    const relu = (await walletsRepo.getWallet(id))!.tokens.find(
      (autre) => autre.id === token!.id,
    )
    expect(relu?.sortieSol).toBeNull()
  })
})
