'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  cancelTestAction,
  concludeTestAction,
  createDayTokenAction,
  openDayAction,
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
import { CourbePnl, type PointCourbe } from '../charts/courbe-pnl'
import { BarresJours } from '../charts/barres-jours'
import { Tabs, type Onglet } from '../ui/tabs'
import type { StrategyField } from '@/lib/validation'
import { cn } from '../ui/cn'
import { TextField } from '../ui/field'
import { CheckIcon, ChevronLeftIcon, ExternalIcon } from '../ui/icons'
import { SaveIndicator } from '../ui/save-indicator'
import { StatusBadge } from '../ui/status-badge'
import { useAutoSave } from '../ui/use-auto-save'
import { BilanCard } from './bilan-card'
import { DangerZone } from './danger-zone'
import { InfosSection } from './infos-section'
import { NotesSection } from './notes-section'
import { PhaseSection } from './phase-section'
import { ResumeLot } from './resume-lot'
import { StrategySection } from './strategy-section'
import { TestSection, type JourneeEditable } from './test-section'
import { TokenTable } from './token-table'

/** Les sections de la page, une par onglet. */
type OngletWallet = 'bilan' | 'tokens' | 'journees' | 'reglages'

export function WalletDetail({
  wallet: initial,
  settings,
  joursAFaire,
  aujourdhui,
}: {
  wallet: WalletWithTokens
  settings: GlobalSettings
  /** Journées de ce wallet en attente de relevé, comptées côté serveur. */
  joursAFaire: number
  /**
   * La date du jour, décidée côté serveur. La lire dans le navigateur
   * ferait diverger le premier rendu de l'hydratation autour de minuit.
   */
  aujourdhui: string
}) {
  const router = useRouter()
  const { status, schedule, run } = useAutoSave()

  // L'état local fait foi pendant l'édition : l'affichage réagit à la frappe,
  // l'écriture en base suit avec un léger retard.
  const [wallet, setWallet] = useState(initial)
  const [solPriceEur, setSolPriceEur] = useState(settings.solPriceEur)
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

  const [onglet, setOnglet] = useState<OngletWallet>('bilan')

  /** La courbe du wallet : une journée par point, dans l'ordre du temps. */
  const courbe = useMemo<PointCourbe[]>(() => {
    let cumul = 0
    return test.days.map((jour) => {
      cumul += jour.pnlSol
      return { day: jour.day, pnlSol: jour.pnlSol, cumulSol: cumul }
    })
  }, [test.days])

  // L'onglet Journées n'existe pas tant que le test n'a pas commencé : un
  // onglet vide qui ne le sera jamais est pire qu'un onglet absent.
  const onglets: Onglet<OngletWallet>[] = [
    { value: 'bilan', label: 'Bilan' },
    { value: 'tokens', label: 'Tokens', badge: tokensScreening.length || null },
    ...(enTest
      ? [
          {
            value: 'journees' as const,
            label: 'Journées',
            badge: test.joursObserves || null,
          },
        ]
      : []),
    { value: 'reglages', label: 'Réglages' },
  ]

  // Conclure un test ramène le wallet en screening : l'onglet ouvert peut
  // avoir disparu sous les pieds.
  const actif: OngletWallet = onglets.some((o) => o.value === onglet)
    ? onglet
    : 'bilan'

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

  /** Ouvre la journée en cours pour la saisir sans attendre demain matin. */
  function ouvrirJourEnCours() {
    run(async () => {
      const resultat = await openDayAction(wallet.id, aujourdhui)
      if (!resultat.ok) {
        setErreur(resultat.message)
        return
      }
      const jour = resultat.day
      setWallet((precedent) =>
        precedent.days.some((autre) => autre.id === jour.id)
          ? precedent
          : {
              ...precedent,
              days: [...precedent.days, jour].sort((a, b) =>
                a.day.localeCompare(b.day),
              ),
            },
      )
      setOnglet('journees')
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
      className="h-full overflow-y-auto overscroll-contain"
    >
      {/* Barre d'outils : identité, statut et onglets tiennent sur deux
          lignes collantes. L'ancien bandeau de titre coûtait 120 px de
          hauteur avant le premier chiffre. */}
      <header className="sticky top-0 z-20 border-b border-separator bg-nav backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4 md:px-6">
          <Link
            href="/wallets"
            aria-label="Retour aux wallets"
            className="flex shrink-0 items-center gap-1 rounded-full bg-fill px-2.5 py-1 text-[12.5px] text-ink-2 transition hover:bg-hi hover:text-ink active:opacity-60"
          >
            <ChevronLeftIcon className="h-[15px] w-[15px]" />
            <span className="hidden sm:inline">Wallets</span>
          </Link>

          <h1 className="min-w-0 flex-1 text-[16px] leading-tight font-bold tracking-tight">
            <TextField
              ariaLabel="Nom du wallet"
              value={wallet.label}
              placeholder="Sans nom"
              onChange={(label) => majWallet({ label }, 'label')}
            />
          </h1>

          <span className="hidden shrink-0 sm:block">
            <StatusBadge
              status={wallet.status}
              detail={
                wallet.status === 'test'
                  ? `j${test.joursObserves}/${test.joursMinimum}`
                  : undefined
              }
            />
          </span>

          <div className="shrink-0">
            <SaveIndicator status={status} />
          </div>
        </div>

        <Tabs
          onglets={onglets}
          value={actif}
          onChange={setOnglet}
          ariaLabel="Sections du wallet"
          className="px-3 pb-2.5 sm:px-4 md:px-6"
        />
      </header>

      <div
        className={cn(
          'px-3 pt-4 pb-16 sm:px-4 md:px-6',
          // Les réglages sont un formulaire : étalés sur 1600 px, l'étiquette
          // et son champ se retrouvent aux deux bouts de l'écran.
          actif === 'reglages' && 'mx-auto max-w-[760px]',
        )}
      >
        {/* Identité et liens externes : hors de la barre collante, ils ne
            prennent de la place qu'une fois. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-separator bg-card px-4 py-2.5 text-[12.5px] text-ink-3">
          <span>
            Analysé le{' '}
            <b className="font-semibold text-ink">{formatDateFr(wallet.analyzedAt)}</b>
          </span>
          <span>
            Adresse{' '}
            <b className="font-mono font-semibold text-ink" title={wallet.address}>
              {shortAddress(wallet.address)}
            </b>
          </span>
          <div className="flex flex-wrap gap-1.5 md:ml-auto">
            <BoutonLien
              onClick={() => void navigator.clipboard.writeText(wallet.address)}
            >
              Copier
            </BoutonLien>
            <BoutonExterne href={SOLSCAN_URL(wallet.address)}>Solscan</BoutonExterne>
            <BoutonExterne href={GMGN_URL(wallet.address)}>GMGN</BoutonExterne>
          </div>
          <span className="shrink-0 sm:hidden">
            <StatusBadge status={wallet.status} />
          </span>
        </div>

        {erreur !== null ? (
          <p className="mb-4 rounded-card border border-separator bg-card px-4 py-3 text-[15px] text-red">
            {erreur}
          </p>
        ) : null}

        {actif === 'bilan' ? (
          <>
            <BilanCard
              report={enTest ? test.report : report}
              strategy={wallet.strategy}
            />

            {/* La courbe prend les deux tiers : c'est elle qui a besoin de
                largeur, la phase est une liste de boutons. Sans courbe — un
                wallet encore en screening — pas de grille du tout, sinon la
                phase resterait coincée dans une colonne avec un vide à côté. */}
            <div
              className={cn(
                'grid items-start gap-4',
                courbe.length > 0 && 'xl:grid-cols-[2fr_1fr]',
              )}
            >
              {courbe.length > 0 ? (
                <section className="rounded-card border border-separator bg-card px-4 pt-4 pb-3">
                  <h2 className="text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
                    Résultat cumulé
                  </h2>
                  <CourbePnl points={courbe} className="mt-3" />
                </section>
              ) : null}

              <div className={cn(courbe.length === 0 && 'max-w-[560px]')}>
                <PhaseSection
                  walletId={wallet.id}
                  status={wallet.status}
                  testStartedAt={wallet.testStartedAt}
                  joursAFaire={joursAFaire}
                  test={test}
                  screeningN={report.n}
                  screeningSeuil={report.seuilAnalyse}
                  // Lancer le test fait apparaître l'onglet Journées : on y
                  // emmène, sinon le bouton semble n'avoir rien fait. Si le
                  // serveur refuse, le statut repart en arrière et l'onglet
                  // disparaît — le repli sur Bilan est automatique.
                  onStart={() => {
                    majStatut(() => startTestAction(wallet.id), 'test')
                    setOnglet('journees')
                  }}
                  // Annuler ramène au screening, et l'onglet Journées
                  // disparaît : on revient sur le Bilan pour ne pas laisser
                  // un onglet vide sélectionné.
                  onCancel={() => {
                    majStatut(() => cancelTestAction(wallet.id), 'screening')
                    setOnglet('bilan')
                  }}
                  onConclude={(verdict) =>
                    majStatut(() => concludeTestAction(wallet.id, verdict), verdict)
                  }
                  onReopen={() => {
                    majStatut(() => reopenTestAction(wallet.id), 'test')
                    setOnglet('journees')
                  }}
                  onClassify={(cible) =>
                    majStatut(() => setWalletStatusAction(wallet.id, cible), cible)
                  }
                />
              </div>
            </div>
          </>
        ) : null}

        {actif === 'tokens' ? (
          <div>
            {/* Le verdict du lot qu'on est en train de regarder. La carte du
                Bilan parle du relevé de test dès qu'il a commencé : sans ce
                bandeau, l'échantillon n'aurait plus où se juger. */}
            <ResumeLot
              titre="Échantillon de screening"
              report={report}
              strategy={wallet.strategy}
              aPart={enTest}
            />
              <TokenTable
              tokens={tokensScreening}
              rows={report.rows}
              strategy={wallet.strategy}
              onChange={majToken}
              onDelete={supprimerToken}
              onAdd={ajouterToken}
            />
          </div>
        ) : null}

        {actif === 'journees' && enTest ? (
          <>
            {test.days.length > 0 ? (
              <section className="mb-4 rounded-card border border-separator bg-card px-4 pt-4 pb-3">
                <h2 className="text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
                  Résultat par journée
                </h2>
                <BarresJours
                  className="mt-3"
                  jours={test.days.map((jour) => ({
                    day: jour.day,
                    pnlSol: jour.pnlSol,
                    inactif: jour.state === 'inactif',
                  }))}
                />
              </section>
            ) : null}

            <TestSection
              test={test}
              journees={journees}
              strategy={wallet.strategy}
              jourEnCoursSaisi={wallet.days.some((jour) => jour.day === aujourdhui)}
              onOuvrirJour={ouvrirJourEnCours}
              onChangeToken={majToken}
              onDeleteToken={supprimerToken}
              onAddToken={ajouterTokenJour}
              onDayState={majEtatJour}
            />
          </>
        ) : null}

        {actif === 'reglages' ? (
          <>
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
                  router.push('/wallets')
                })
              }
            />
          </>
        ) : null}
      </div>
    </div>
  )
}


const STYLE_BOUTON =
  'inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium text-ink-2 transition hover:bg-hi hover:text-ink active:scale-95'

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
