'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  concludeTestAction,
  createDayTokenAction,
  createTokenAction,
  deleteTokenAction,
  deleteWalletAction,
  reopenTestAction,
  setDayStateAction,
  setWalletStatusAction,
  startTestAction,
  updateSolPriceAction,
  updateStrategyAction,
  updateTokenAction,
  updateWalletAction,
  useStrategyAsDefaultAction,
} from '@/app/actions'
import type { TagOverride } from '@/lib/compute'
import { computeWalletReport } from '@/lib/compute'
import { GMGN_URL, SOLSCAN_URL, formatDateFr, shortAddress } from '@/lib/format'
import type {
  GlobalSettings,
  Token,
  UpdateTokenPatch,
  WalletStatus,
  WalletWithTokens,
} from '@/lib/repo/types'
import { screeningTokens, toDayInputs, toTokenInput } from '@/lib/repo/types'
import { computeTestReport, type DayState } from '@/lib/test-report'
import type { StrategyField } from '@/lib/validation'
import { cn } from '../ui/cn'
import { TextField } from '../ui/field'
import { CheckIcon, ChevronLeftIcon, ExternalIcon } from '../ui/icons'
import { SaveIndicator } from '../ui/save-indicator'
import { useAutoSave } from '../ui/use-auto-save'
import { BilanCard } from './bilan-card'
import { DangerZone } from './danger-zone'
import { InfosSection } from './infos-section'
import { NotesSection } from './notes-section'
import { PhaseSection } from './phase-section'
import { StrategySection } from './strategy-section'
import { TestSection, type JourneeEditable } from './test-section'
import { TokenTable } from './token-table'

export function WalletDetail({
  wallet: initial,
  settings,
}: {
  wallet: WalletWithTokens
  settings: GlobalSettings
}) {
  const router = useRouter()
  const { status, schedule, run } = useAutoSave()

  // L'état local fait foi pendant l'édition : l'affichage réagit à la frappe,
  // l'écriture en base suit avec un léger retard.
  const [wallet, setWallet] = useState(initial)
  const [solPriceEur, setSolPriceEur] = useState(settings.solPriceEur)
  const [defile, setDefile] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Les deux lots sont calculés séparément et ne sont jamais additionnés :
  // le screening est un échantillon choisi à la main, le test un relevé
  // exhaustif. Seul le second dit la vérité sur le wallet.
  const tokensScreening = useMemo(() => screeningTokens(wallet), [wallet])

  const report = useMemo(
    () =>
      computeWalletReport(tokensScreening.map(toTokenInput), wallet.strategy, {
        tagOverride: wallet.tagOverride,
        solPriceEur,
      }),
    [tokensScreening, wallet.strategy, wallet.tagOverride, solPriceEur],
  )

  const test = useMemo(
    () =>
      computeTestReport(toDayInputs(wallet), wallet.strategy, {
        tagOverride: wallet.tagOverride,
        solPriceEur,
      }),
    [wallet, wallet.strategy, wallet.tagOverride, solPriceEur],
  )

  /**
   * Les journées, chacune avec ses tokens dans l'ordre où le bilan les a
   * calculés — c'est ce qui aligne les résultats affichés sur les lignes
   * saisies. `toDayInputs` parcourt `wallet.tokens` dans l'ordre : on refait
   * le même parcours ici.
   */
  const journees = useMemo<JourneeEditable[]>(() => {
    const parJour = new Map<string, Token[]>()
    for (const token of wallet.tokens) {
      if (token.phase !== 'test' || token.dayId === null) continue
      const liste = parJour.get(token.dayId)
      if (liste) liste.push(token)
      else parJour.set(token.dayId, [token])
    }

    return wallet.days.map((jour) => ({
      dayId: jour.id,
      day: jour.day,
      tokens: parJour.get(jour.id) ?? [],
    }))
  }, [wallet])

  const enTest = wallet.status !== 'screening'

  /** Une transition de statut peut échouer côté serveur : on reprend la sienne. */
  function majStatut(
    appel: () => Promise<{ ok: boolean; message?: string }>,
    optimiste: WalletStatus,
  ) {
    const precedent = wallet.status
    setWallet((courant) => ({ ...courant, status: optimiste }))
    run(async () => {
      const resultat = await appel()
      if (!resultat.ok) {
        setWallet((courant) => ({ ...courant, status: precedent }))
        setErreur(resultat.message ?? 'Action impossible.')
        return
      }
      router.refresh()
    })
  }

  function majWallet(
    patch: Partial<
      Pick<WalletWithTokens, 'label' | 'analyzedAt' | 'notes' | 'tagOverride'>
    >,
    key: string,
  ) {
    setWallet((precedent) => ({ ...precedent, ...patch }))
    schedule(key, () => updateWalletAction(wallet.id, patch))
  }

  function majStrategie(field: StrategyField, value: number | null) {
    setWallet((precedent) => ({
      ...precedent,
      strategy: { ...precedent.strategy, [field]: value ?? precedent.strategy[field] },
    }))
    schedule(`strategy:${field}`, async () => {
      const retenu = await updateStrategyAction(wallet.id, field, value)
      // Le serveur rabat la valeur dans ses bornes : on reprend la sienne.
      setWallet((precedent) => ({
        ...precedent,
        strategy: { ...precedent.strategy, [field]: retenu },
      }))
    })
  }

  function majToken(id: string, patch: UpdateTokenPatch) {
    setWallet((precedent) => ({
      ...precedent,
      tokens: precedent.tokens.map((token) =>
        token.id === id ? { ...token, ...patch } : token,
      ),
    }))
    const champ = Object.keys(patch)[0] ?? 'token'
    schedule(`token:${id}:${champ}`, () => updateTokenAction(id, patch))
  }

  function ajouterToken() {
    run(async () => {
      const token = await createTokenAction(wallet.id)
      setWallet((precedent) => ({ ...precedent, tokens: [...precedent.tokens, token] }))
    })
  }

  /** Ajoute une ligne à une journée déjà relevée, qui redevient active. */
  function ajouterTokenJour(dayId: string) {
    run(async () => {
      const token = await createDayTokenAction(wallet.id, dayId)
      setWallet((precedent) => ({
        ...precedent,
        tokens: [...precedent.tokens, token],
        days: precedent.days.map((jour) =>
          jour.id === dayId ? { ...jour, state: 'actif' } : jour,
        ),
      }))
    })
  }

  function majEtatJour(dayId: string, state: DayState) {
    setWallet((precedent) => ({
      ...precedent,
      days: precedent.days.map((jour) =>
        jour.id === dayId ? { ...jour, state } : jour,
      ),
    }))
    schedule(`day:${dayId}:state`, () => setDayStateAction(dayId, state))
  }

  function supprimerToken(id: string) {
    setWallet((precedent) => ({
      ...precedent,
      tokens: precedent.tokens.filter((token) => token.id !== id),
    }))
    run(() => deleteTokenAction(id))
  }

  function majPrixSol(value: number | null) {
    setSolPriceEur(value)
    schedule('solPrice', () => updateSolPriceAction(value))
  }

  return (
    <div
      onScroll={(event) => setDefile(event.currentTarget.scrollTop > 36)}
      className="h-full overflow-y-auto overscroll-contain"
    >
      {/* Barre de navigation translucide : le titre n'apparaît qu'au défilement. */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-separator bg-nav px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur-xl">
        <Link
          href="/"
          className="-ml-1 flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-[17px] text-blue transition active:opacity-50 md:invisible md:w-0"
        >
          <ChevronLeftIcon className="h-[17px] w-[17px]" />
          Wallets
        </Link>

        <h2
          className={cn(
            'min-w-0 flex-1 truncate text-center text-[17px] font-semibold transition-opacity duration-200',
            defile ? 'opacity-100' : 'opacity-0',
          )}
        >
          {wallet.label}
        </h2>

        <div className="shrink-0">
          <SaveIndicator status={status} />
        </div>
      </header>

      <div className="mx-auto max-w-[680px] px-4 pb-16">
        <div className="pt-5 pb-6">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">
            <TextField
              ariaLabel="Nom du wallet"
              value={wallet.label}
              placeholder="Sans nom"
              onChange={(label) => majWallet({ label }, 'label')}
            />
          </h1>

          <p className="mt-1 font-mono text-[13px] text-ink-2" title={wallet.address}>
            {shortAddress(wallet.address)}
            <span className="ml-2 font-sans">
              · analysé le {formatDateFr(wallet.analyzedAt)}
            </span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <BoutonLien onClick={() => void navigator.clipboard.writeText(wallet.address)}>
              Copier
            </BoutonLien>
            <BoutonExterne href={SOLSCAN_URL(wallet.address)}>Solscan</BoutonExterne>
            <BoutonExterne href={GMGN_URL(wallet.address)}>GMGN</BoutonExterne>
          </div>
        </div>

        <BilanCard
          report={enTest ? test.report : report}
          strategy={wallet.strategy}
        />

        {erreur !== null ? (
          <p className="mb-6 rounded-card bg-card px-4 py-3 text-[15px] text-red">
            {erreur}
          </p>
        ) : null}

        <PhaseSection
          status={wallet.status}
          testStartedAt={wallet.testStartedAt}
          test={test}
          screeningN={report.n}
          screeningSeuil={report.seuilAnalyse}
          onStart={() => majStatut(() => startTestAction(wallet.id), 'test')}
          onConclude={(verdict) =>
            majStatut(() => concludeTestAction(wallet.id, verdict), verdict)
          }
          onReopen={() => majStatut(() => reopenTestAction(wallet.id), 'test')}
          onClassify={(cible) =>
            majStatut(() => setWalletStatusAction(wallet.id, cible), cible)
          }
        />

        {enTest ? (
          <TestSection
            test={test}
            journees={journees}
            strategy={wallet.strategy}
            onChangeToken={majToken}
            onDeleteToken={supprimerToken}
            onAddToken={ajouterTokenJour}
            onDayState={majEtatJour}
          />
        ) : null}

        <TokenTable
          tokens={tokensScreening}
          rows={report.rows}
          strategy={wallet.strategy}
          onChange={majToken}
          onDelete={supprimerToken}
          onAdd={ajouterToken}
        />

        <StrategySection
          strategy={wallet.strategy}
          onChange={majStrategie}
          onUseAsDefault={() => run(() => useStrategyAsDefaultAction(wallet.id))}
        />

        <InfosSection
          address={wallet.address}
          analyzedAt={wallet.analyzedAt}
          tagOverride={wallet.tagOverride}
          solPriceEur={solPriceEur}
          onAnalyzedAt={(analyzedAt) => majWallet({ analyzedAt }, 'analyzedAt')}
          onTagOverride={(tagOverride: TagOverride | null) =>
            majWallet({ tagOverride }, 'tagOverride')
          }
          onSolPrice={majPrixSol}
        />

        <NotesSection
          value={wallet.notes}
          onChange={(notes) => majWallet({ notes }, 'notes')}
        />

        <DangerZone
          label={wallet.label}
          onDelete={() =>
            run(async () => {
              await deleteWalletAction(wallet.id)
              router.push('/')
            })
          }
        />
      </div>
    </div>
  )
}

const STYLE_BOUTON =
  'inline-flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] font-medium text-blue transition hover:bg-fill-2 active:scale-95'

function BoutonLien({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  const [fait, setFait] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        setFait(true)
        setTimeout(() => setFait(false), 1500)
      }}
      className={STYLE_BOUTON}
    >
      {fait ? (
        <>
          <CheckIcon className="h-[13px] w-[13px]" />
          Copiée
        </>
      ) : (
        children
      )}
    </button>
  )
}

function BoutonExterne({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={STYLE_BOUTON}>
      {children}
      <ExternalIcon className="h-[13px] w-[13px]" />
    </a>
  )
}
