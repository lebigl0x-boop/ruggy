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
  CreateTokenInput,
  Token,
  UpdateTokenPatch,
  UpdateWalletPatch,
  WalletDay,
  WalletStatus,
} from '@/lib/repo/types'
import { MAX_TOKENS_PAR_JOUR } from '@/lib/saisie'
import { computeTestReport, type DayState } from '@/lib/test-report'
import {
  clampStrategyField,
  hasBlockingIssue,
  isIsoDate,
  isTagOverride,
  parseNumberFr,
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
    existingAddresses: await walletsRepo.listAddresses(),
  })

  if (hasBlockingIssue(issues)) return { ok: false, issues }

  const wallet = await walletsRepo.createWallet({
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

  await walletsRepo.updateWallet(id, clean)
  refresh()
}

export async function updateStrategyAction(
  id: string,
  field: StrategyField,
  value: number | null,
): Promise<number> {
  const wallet = await walletsRepo.getWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  // On rabat dans les bornes ici aussi : la valeur renvoyée est celle retenue.
  const retenu = clampStrategyField(field, value, wallet.strategy[field])
  await walletsRepo.updateWallet(id, { strategy: { [field]: retenu } })
  refresh()
  return retenu
}

/** Reprend les réglages d'un wallet comme modèle des prochains. */
export async function useStrategyAsDefaultAction(id: string): Promise<Strategy> {
  const wallet = await walletsRepo.getWallet(id)
  if (!wallet) throw new Error('Wallet introuvable.')

  await settingsRepo.updateDefaults(wallet.strategy)
  refresh()
  return wallet.strategy
}

export async function deleteWalletAction(id: string): Promise<void> {
  await walletsRepo.deleteWallet(id)
  refresh()
}

export async function createTokenAction(walletId: string): Promise<Token> {
  const token = await tokensRepo.createToken(walletId)
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

  await tokensRepo.updateToken(id, clean)
  refresh()
}

export async function deleteTokenAction(id: string): Promise<void> {
  await tokensRepo.deleteToken(id)
  refresh()
}

export async function updateSolPriceAction(value: number | null): Promise<void> {
  // Un prix négatif n'a pas de sens ; on le traite comme « non renseigné ».
  await settingsRepo.updateSolPrice(value !== null && value > 0 ? value : null)
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
  const wallet = await walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }

  if (wallet.status === 'test') return { ok: true }
  if (wallet.status !== 'screening') {
    return {
      ok: false,
      message: 'Ce wallet a déjà été testé. Relancez le test pour repartir.',
    }
  }

  await walletsRepo.updateWallet(id, { status: 'test', testStartedAt: todayIso() })
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
  const wallet = await walletsRepo.getWallet(id)
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

  await walletsRepo.updateWallet(id, { status: verdict })
  refresh()
  return { ok: true }
}

/** Rouvre un test conclu, sans toucher aux journées déjà relevées. */
export async function reopenTestAction(id: string): Promise<ActionResult> {
  const wallet = await walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status === 'screening') {
    return { ok: false, message: 'Ce wallet n’a jamais été testé.' }
  }

  await walletsRepo.updateWallet(id, { status: 'test' })
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
  const wallet = await walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status === status) return { ok: true }

  const patch: UpdateWalletPatch = { status }

  // Entrer en test pour la première fois ouvre la fenêtre d'observation.
  // Y revenir après coup la laisse telle quelle : les journées déjà relevées
  // restent valables.
  if (status === 'test' && wallet.testStartedAt === null) {
    patch.testStartedAt = todayIso()
  }

  await walletsRepo.updateWallet(id, patch)
  refresh()
  return { ok: true }
}

/**
 * Annule une phase de test lancée par erreur.
 *
 * Le wallet retourne au screening. La date d'ouverture n'est effacée que si
 * aucune journée n'a été relevée : c'est la signature d'une fausse manœuvre.
 * Dès qu'une journée existe, la fenêtre d'observation a commencé pour de bon
 * et l'effacer fausserait le décompte si le test reprenait — les journées,
 * elles, ne sont jamais supprimées.
 */
export async function cancelTestAction(id: string): Promise<ActionResult> {
  const wallet = await walletsRepo.getWallet(id)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status !== 'test') {
    return { ok: false, message: 'Ce wallet n’est pas en phase de test.' }
  }

  const aucunReleve = wallet.days.length === 0

  await walletsRepo.updateWallet(id, {
    status: 'screening',
    ...(aucunReleve ? { testStartedAt: null } : {}),
  })

  refresh()
  return { ok: true }
}

export type SaveDayResult =
  | { ok: true; day: WalletDay; tokensCrees: number }
  | { ok: false; message: string }

/**
 * Remet une ligne saisie dans ses clous.
 *
 * L'écran envoie des valeurs déjà lues, mais c'est cette normalisation-ci qui
 * fait foi : une perte reste une grandeur positive plafonnée à 100 %, un
 * délai ne peut pas être négatif, un nom vide vaut « sans nom ».
 */
function normaliserLigne(ligne: CreateTokenInput): CreateTokenInput {
  const nom = (ligne.name ?? '').trim()
  const delay = parseNumberFr(ligne.delay)

  return {
    name: nom === '' ? null : nom,
    gain: parseNumberFr(ligne.gain),
    perteRug: parsePerteToken(ligne.perteRug),
    delay: delay !== null && delay >= 0 ? delay : null,
    // Pris par défaut : seul un `false` explicite écarte un token.
    pris: ligne.pris !== false,
  }
}

/**
 * Enregistre le relevé d'une journée.
 *
 * La journée est réécrite en entier à chaque enregistrement : l'écran décrit
 * la journée complète, il ne s'y ajoute pas. Les valeurs sont renormalisées
 * ici, côté serveur — ce que l'écran affiche pendant la saisie sert au
 * confort, c'est cette lecture-ci qui fait foi.
 */
export async function saveDayAction(input: {
  walletId: string
  day: string
  state: DayState
  tokens: readonly CreateTokenInput[]
}): Promise<SaveDayResult> {
  const wallet = await walletsRepo.getWallet(input.walletId)
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

  // Le plafond protège la base d'un copier-coller malheureux.
  const lignes = input.tokens.slice(0, MAX_TOKENS_PAR_JOUR).map(normaliserLigne)
  const state: DayState =
    input.state === 'inactif' || lignes.length === 0 ? 'inactif' : 'actif'

  const day = await daysRepo.saveDay({
    walletId: input.walletId,
    day: input.day,
    state,
    tokens: lignes,
  })

  refresh()
  return { ok: true, day, tokensCrees: state === 'inactif' ? 0 : lignes.length }
}

/**
 * Ouvre la journée en cours, pour la saisir au fil de l'eau.
 *
 * Le relevé du matin ne propose que les journées terminées — c'est sa raison
 * d'être : une journée se juge une fois finie. Mais rien n'oblige à attendre
 * le lendemain pour noter ce qu'un wallet lance aujourd'hui. La journée est
 * créée vide et se remplit token par token ; elle passe « active » au
 * premier token ajouté.
 *
 * Elle n'est jamais réécrite si elle existe déjà : `saveDay` remplace le
 * contenu d'une journée, l'appeler sur une journée saisie effacerait tout.
 */
export async function openDayAction(
  walletId: string,
  day: string,
): Promise<SaveDayResult> {
  const wallet = await walletsRepo.getWallet(walletId)
  if (!wallet) return { ok: false, message: 'Wallet introuvable.' }
  if (wallet.status !== 'test') {
    return { ok: false, message: 'Ce wallet n’est pas en phase de test.' }
  }
  if (!isIsoDate(day)) return { ok: false, message: 'Date de journée invalide.' }

  if (wallet.testStartedAt !== null && ecartEnJours(wallet.testStartedAt, day) < 0) {
    return { ok: false, message: 'Cette journée précède le début du test.' }
  }
  if (ecartEnJours(todayIso(), day) > 0) {
    return { ok: false, message: 'Cette journée n’a pas encore eu lieu.' }
  }

  const existante = await daysRepo.getDay(walletId, day)
  if (existante) return { ok: true, day: existante, tokensCrees: 0 }

  // Sans trade relevé, la journée est « sans trade » : c'est vrai tant qu'on
  // n'y a rien mis, et le premier token la rendra active.
  const creee = await daysRepo.saveDay({ walletId, day, state: 'inactif', tokens: [] })
  refresh()
  return { ok: true, day: creee, tokensCrees: 0 }
}

/**
 * Ajoute une ligne à une journée déjà relevée.
 *
 * Une journée qui reçoit un token n'est plus une journée sans trade : son
 * état suit, sans quoi le décompte des journées actives mentirait.
 */
export async function createDayTokenAction(
  walletId: string,
  dayId: string,
): Promise<Token> {
  const [token] = await tokensRepo.createTokens(
    walletId,
    [{}],
    { phase: 'test', dayId },
  )
  if (!token) throw new Error('Le token n’a pas pu être créé.')

  await daysRepo.setDayState(dayId, 'actif')
  refresh()
  return token
}

export async function deleteDayAction(id: string): Promise<void> {
  await daysRepo.deleteDay(id)
  refresh()
}

export async function setDayStateAction(id: string, state: DayState): Promise<void> {
  await daysRepo.setDayState(id, state)
  refresh()
}
