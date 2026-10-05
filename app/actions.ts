'use server'

import { revalidatePath } from 'next/cache'

import type { Strategy } from '@/lib/compute'
import { todayIso } from '@/lib/format'
import { ecartEnJours } from '@/lib/jours'
import * as daysRepo from '@/lib/repo/days'
import * as settingsRepo from '@/lib/repo/settings'
import * as tokensRepo from '@/lib/repo/tokens'
import * as walletsRepo from '@/lib/repo/wallets'
import { toDayInputs } from '@/lib/repo/types'
import type {
  Token,
  UpdateTokenPatch,
  UpdateWalletPatch,
  WalletDay,
  WalletStatus,
} from '@/lib/repo/types'
import { parseSaisie } from '@/lib/saisie'
import { computeTestReport, type DayState } from '@/lib/test-report'
import {
  clampStrategyField,
  hasBlockingIssue,
  isIsoDate,
  isTagOverride,
  parsePerteToken,
  validateNewWallet,
  type FieldIssue,
  type StrategyField,
} from '@/lib/validation'

/** Rafraîchit la liste latérale et la page de détail. */
function refresh(): void {
  revalidatePath('/', 'layout')
}

export type CreateWalletResult =
  | { ok: true; id: string }
  | { ok: false; issues: FieldIssue[] }

export async function createWalletAction(input: {
  label: string
  address: string
  analyzedAt: string
}): Promise<CreateWalletResult> {
  // La validation côté client sert au confort ; celle-ci fait foi.
  const issues = validateNewWallet({
    ...input,
    existingAddresses: walletsRepo.listAddresses(),
  })

  if (hasBlockingIssue(issues)) return { ok: false, issues }

  const wallet = walletsRepo.createWallet({
    label: input.label.trim(),
    address: input.address.trim(),
    analyzedAt: input.analyzedAt,
  })

  refresh()
  return { ok: true, id: wallet.id }
}

export async function updateWalletAction(
  id: string,
  patch: {
    label?: string
    analyzedAt?: string
    notes?: string
    tagOverride?: string | null
  },
): Promise<void> {
  const clean: UpdateWalletPatch = {}

  if (patch.label !== undefined) clean.label = patch.label.trim() || 'Sans nom'
  if (patch.analyzedAt !== undefined) clean.analyzedAt = patch.analyzedAt
  if (patch.notes !== undefined) clean.notes = patch.notes
  if (patch.tagOverride !== undefined) {
    clean.tagOverride = isTagOverride(patch.tagOverride) ? patch.tagOverride : null
  }

  walletsRepo.updateWallet(id, clean)
  refresh()
}

export async function updateStrategyAction(
  id: string,
  field: StrategyField,
  value: number | null,
): Promise<number> {
  const wallet = walletsRepo.getWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  // On rabat dans les bornes ici aussi : la valeur renvoyée est celle retenue.
  const retenu = clampStrategyField(field, value, wallet.strategy[field])
  walletsRepo.updateWallet(id, { strategy: { [field]: retenu } })
  refresh()
  return retenu
}

/** Reprend les réglages d'un wallet comme modèle des prochains. */
export async function useStrategyAsDefaultAction(id: string): Promise<Strategy> {
  const wallet = walletsRepo.getWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  settingsRepo.updateDefaults(wallet.strategy)
  refresh()
  return wallet.strategy
}

export async function deleteWalletAction(id: string): Promise<void> {
  walletsRepo.deleteWallet(id)
  refresh()
}

export async function createTokenAction(walletId: string): Promise<Token> {
  const token = tokensRepo.createToken(walletId)
  refresh()
  return token
}

export async function updateTokenAction(
  id: string,
  patch: UpdateTokenPatch,
): Promise<void> {
  // Une perte négative s'inverserait en gain dans le calcul : on la borne ici,
  // côté serveur, quoi qu'ait envoyé l'interface.
  const clean: UpdateTokenPatch =
    patch.perteRug !== undefined
      ? { ...patch, perteRug: parsePerteToken(patch.perteRug) }
      : patch

  tokensRepo.updateToken(id, clean)
  refresh()
}

export async function deleteTokenAction(id: string): Promise<void> {
  tokensRepo.deleteToken(id)
  refresh()
}

export async function updateSolPriceAction(value: number | null): Promise<void> {
  // Un prix négatif n'a pas de sens ; on le traite comme « non renseigné ».
  settingsRepo.updateSolPrice(value !== null && value > 0 ? value : null)
  refresh()
}

// ---------------------------------------------------------------------------
// Phase de test
// ---------------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; message: string }

/**
 * Fait passer un wallet du screening à la phase de test.
 *
 * Le test démarre aujourd'hui : la première journée à relever sera donc
 * demain matin, pour les trades d'aujourd'hui.
 */
export async function startTestAction(id: string): Promise<ActionResult> {
  const wallet = walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }

  if (wallet.status === 'test') return { ok: true }
  if (wallet.status !== 'screening') {
    return {
      ok: false,
      message: 'Ce wallet a déjà été testé. Relancez le test pour repartir.',
    }
  }

  walletsRepo.updateWallet(id, { status: 'test', testStartedAt: todayIso() })
  refresh()
  return { ok: true }
}

/**
 * Conclut la phase de test.
 *
 * Le verdict reste bloqué tant que le plancher de journées n'est pas atteint :
 * c'est tout l'intérêt d'avoir un plancher. Au-delà, c'est une décision
 * humaine — l'app conseille de prolonger quand les données sont minces, elle
 * ne tranche pas à la place.
 */
export async function concludeTestAction(
  id: string,
  verdict: 'valide' | 'rejete',
): Promise<ActionResult> {
  const wallet = walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status !== 'test') {
    return { ok: false, message: 'Ce wallet n’est pas en phase de test.' }
  }

  const rapport = computeTestReport(toDayInputs(wallet), wallet.strategy)
  if (!rapport.verdictDisponible) {
    return {
      ok: false,
      message: rapport.conseil?.message ?? 'Le test n’est pas encore concluable.',
    }
  }

  walletsRepo.updateWallet(id, { status: verdict })
  refresh()
  return { ok: true }
}

/** Rouvre un test conclu, sans toucher aux journées déjà relevées. */
export async function reopenTestAction(id: string): Promise<ActionResult> {
  const wallet = walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status === 'screening') {
    return { ok: false, message: 'Ce wallet n’a jamais été testé.' }
  }

  walletsRepo.updateWallet(id, { status: 'test' })
  refresh()
  return { ok: true }
}

/**
 * Classe un wallet à la main, sans passer par le test.
 *
 * `concludeTestAction` est le chemin normal et reste verrouillé sous le
 * plancher de journées — c'est tout son intérêt. Celui-ci est l'échappatoire
 * assumée : un wallet qu'on connaît déjà n'a pas besoin d'être testé, et un
 * wallet manifestement mauvais peut être écarté dès le screening.
 */
export async function setWalletStatusAction(
  id: string,
  status: WalletStatus,
): Promise<ActionResult> {
  const wallet = walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status === status) return { ok: true }

  const patch: UpdateWalletPatch = { status }

  // Entrer en test pour la première fois ouvre la fenêtre d'observation.
  // Y revenir après coup la laisse telle quelle : les journées déjà relevées
  // restent valables.
  if (status === 'test' && wallet.testStartedAt === null) {
    patch.testStartedAt = todayIso()
  }

  walletsRepo.updateWallet(id, patch)
  refresh()
  return { ok: true }
}

export type SaveDayResult =
  | { ok: true; day: WalletDay; tokensCrees: number; ignores: string[] }
  | { ok: false; message: string }

/**
 * Enregistre le relevé d'une journée.
 *
 * La saisie libre est relue ici, côté serveur : l'aperçu affiché pendant la
 * frappe sert au confort, c'est cette lecture-ci qui fait foi.
 */
export async function saveDayAction(input: {
  walletId: string
  day: string
  state: DayState
  saisie: string
}): Promise<SaveDayResult> {
  const wallet = walletsRepo.getWallet(input.walletId)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status !== 'test') {
    return { ok: false, message: 'Ce wallet n’est pas en phase de test.' }
  }

  if (!isIsoDate(input.day)) {
    return { ok: false, message: 'Date de journée invalide.' }
  }

  // Une journée hors de la fenêtre de test fausserait le décompte : ni avant
  // le départ, ni dans le futur.
  if (wallet.testStartedAt !== null && ecartEnJours(wallet.testStartedAt, input.day) < 0) {
    return { ok: false, message: 'Cette journée précède le début du test.' }
  }
  if (ecartEnJours(todayIso(), input.day) > 0) {
    return { ok: false, message: 'Cette journée n’a pas encore eu lieu.' }
  }

  const lu = parseSaisie(input.saisie)
  const state: DayState =
    input.state === 'inactif' || lu.tokens.length === 0 ? 'inactif' : 'actif'

  const day = daysRepo.saveDay({
    walletId: input.walletId,
    day: input.day,
    state,
    tokens: lu.tokens.map((token) => ({
      name: token.name,
      gain: token.gain,
      perteRug: token.perteRug,
      delay: token.delay,
    })),
  })

  refresh()
  return {
    ok: true,
    day,
    tokensCrees: state === 'inactif' ? 0 : lu.tokens.length,
    ignores: lu.ignores,
  }
}

export async function deleteDayAction(id: string): Promise<void> {
  daysRepo.deleteDay(id)
  refresh()
}

export async function setDayStateAction(id: string, state: DayState): Promise<void> {
  daysRepo.setDayState(id, state)
  refresh()
}
