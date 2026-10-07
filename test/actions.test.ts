/**
 * Tests des règles portées par les actions serveur.
 *
 * On ne teste ici que ce que la couche repository ne peut pas dire toute
 * seule : les transitions d'état et leurs conditions.
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
const { cancelTestAction } = await import('@/app/actions')

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

async function walletEnTest(testStartedAt = '2026-10-05') {
  const wallet = await walletsRepo.createWallet({
    label: 'Wallet test',
    address: ADRESSE,
    analyzedAt: '2026-10-01',
  })
  await walletsRepo.updateWallet(wallet.id, { status: 'test', testStartedAt })
  return wallet.id
}

describe('cancelTestAction', () => {
  it('ramène au screening et efface la date quand rien n’a été relevé', async () => {
    const id = await walletEnTest()

    expect(await cancelTestAction(id)).toEqual({ ok: true })

    const apres = await walletsRepo.getWallet(id)
    expect(apres?.status).toBe('screening')
    // Fausse manœuvre : la fenêtre d'observation n'a jamais commencé.
    expect(apres?.testStartedAt).toBeNull()
  })

  it('garde la date d’ouverture et les journées dès qu’un relevé existe', async () => {
    const id = await walletEnTest()
    await daysRepo.saveDay({
      walletId: id,
      day: '2026-10-05',
      state: 'actif',
      tokens: [{ gain: 150 }],
    })

    await cancelTestAction(id)

    const apres = await walletsRepo.getWallet(id)
    expect(apres?.status).toBe('screening')
    // Le test avait vraiment commencé : effacer la date fausserait le
    // décompte s'il reprenait.
    expect(apres?.testStartedAt).toBe('2026-10-05')
    expect(apres?.days).toHaveLength(1)
  })

  it('refuse un wallet qui n’est pas en phase de test', async () => {
    const wallet = await walletsRepo.createWallet({
      label: 'Wallet test',
      address: ADRESSE,
      analyzedAt: '2026-10-01',
    })

    expect((await cancelTestAction(wallet.id)).ok).toBe(false)
  })

  it('refuse un wallet introuvable', async () => {
    expect((await cancelTestAction('inexistant')).ok).toBe(false)
  })
})
