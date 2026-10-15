'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatDateFr } from '@/lib/format'
import type { WalletStatus } from '@/lib/repo/types'
import type { TestReport } from '@/lib/test-report'
import type { TradeReport } from '@/lib/trade-report'
import { cn } from '../ui/cn'
import { ChevronRightIcon } from '../ui/icons'
import { Sheet } from '../ui/sheet'
import { STATUS_LABELS, StatusBadge } from '../ui/status-badge'

/**
 * Le pilotage de l'entonnoir : screening → test → verdict → phase active.
 *
 * C'est ici qu'on fait passer un wallet en mode test, et ici seulement que le
 * test se conclut. Le bouton « Conclure » reste grisé tant que le plancher de
 * journées n'est pas atteint : c'est la raison d'être du plancher.
 *
 * La dernière marche est la seule où du SOL est engagé pour de bon : elle ne
 * s'ouvre qu'à un wallet validé, parce que c'est exactement ce que
 * l'entonnoir existe pour protéger.
 */
export function PhaseSection({
  walletId,
  status,
  testStartedAt,
  tradeStartedAt,
  test,
  trade,
  screeningN,
  screeningSeuil,
  joursAFaire,
  onStart,
  onConclude,
  onCancel,
  onReopen,
  onClassify,
  onStartTrade,
  onStopTrade,
}: {
  walletId: string
  status: WalletStatus
  testStartedAt: string | null
  tradeStartedAt: string | null
  test: TestReport
  trade: TradeReport
  screeningN: number
  screeningSeuil: number
  /**
   * Journées de ce wallet en attente de relevé.
   *
   * Le plancher n'y change rien : il ouvre le verdict, il ne ferme pas le
   * relevé. Tant que le test n'est pas conclu, chaque journée écoulée vient
   * s'ajouter ici — quatre journées qui ne tranchent pas se prolongent donc
   * sans rien avoir à rouvrir.
   */
  joursAFaire: number
  onStart: () => void
  onConclude: (verdict: 'valide' | 'rejete') => void
  onCancel: () => void
  onReopen: () => void
  onClassify: (status: WalletStatus) => void
  onStartTrade: () => void
  onStopTrade: () => void
}) {
  const [verdictOuvert, setVerdictOuvert] = useState(false)
  const [classementOuvert, setClassementOuvert] = useState(false)

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
          Phase
        </h2>

        <div className="overflow-hidden rounded-card bg-card">
          <div className="flex items-center gap-3 border-b border-separator px-4 py-3">
            <StatusBadge
              status={status}
              detail={
                status === 'test'
                  ? `j${test.joursObserves}/${test.joursMinimum}`
                  : status === 'screening'
                    ? `${screeningN}/${screeningSeuil}`
                    : status === 'trade'
                      ? `${trade.tradesChiffres} ${trade.tradesChiffres > 1 ? 'trades' : 'trade'}`
                      : undefined
              }
            />
            {status === 'trade' && tradeStartedAt !== null ? (
              <span className="ml-auto text-[13px] text-ink-2">
                actif depuis le {formatDateFr(tradeStartedAt)}
              </span>
            ) : testStartedAt !== null && status !== 'screening' ? (
              <span className="ml-auto text-[13px] text-ink-2">
                test ouvert le {formatDateFr(testStartedAt)}
              </span>
            ) : null}
          </div>

          <p className="px-4 py-3 text-[15px] text-ink-2">
            {explication(status, test, trade, screeningN, screeningSeuil)}
          </p>

          {status === 'screening' ? (
            <Action onClick={onStart}>Lancer la phase de test</Action>
          ) : null}

          {status === 'test' ? (
            <>
              {joursAFaire > 0 ? (
                // La file s'ouvre sur ce wallet-ci, pas sur le premier de
                // la liste.
                <Link
                  href={`/?wallet=${walletId}`}
                  className="flex items-center gap-2 border-t border-separator px-4 py-3 text-[17px] font-medium text-ink transition hover:bg-fill-2 active:bg-fill"
                >
                  Saisir {joursAFaire}{' '}
                  {joursAFaire > 1 ? 'journées' : 'journée'}
                  <ChevronRightIcon className="ml-auto h-[17px] w-[17px] text-ink-3" />
                </Link>
              ) : (
                <p className="border-t border-separator px-4 py-3 text-[13px] text-ink-3">
                  Rien à relever : toutes les journées depuis l’ouverture du
                  test sont saisies.
                </p>
              )}

              <Action
                onClick={() => setVerdictOuvert(true)}
                disabled={!test.verdictDisponible}
              >
                Conclure le test
              </Action>

              {/* Jamais désactivé : un test lancé par erreur ne doit pas
                  attendre quatre journées pour être défait. Les journées
                  déjà relevées, elles, sont conservées. */}
              <Action onClick={onCancel} discret>
                Annuler le test
              </Action>
            </>
          ) : null}

          {status === 'valide' ? (
            <Action onClick={onStartTrade}>Passer en phase active</Action>
          ) : null}

          {status === 'trade' ? (
            <Action onClick={onStopTrade} discret>
              Arrêter de trader ce wallet
            </Action>
          ) : null}

          {status === 'valide' || status === 'rejete' ? (
            <Action onClick={onReopen} discret={status === 'valide'}>
              Rouvrir le test
            </Action>
          ) : null}

          {status !== 'test' ? (
            <Action onClick={() => setClassementOuvert(true)} discret>
              Classer à la main
            </Action>
          ) : null}
        </div>

        {test.conseil !== null && status === 'test' ? (
          <p className="mt-2 px-4 text-[13px] text-orange">{test.conseil.message}</p>
        ) : null}

        {trade.conseil !== null && status === 'trade' ? (
          <p className="mt-2 px-4 text-[13px] text-orange">{trade.conseil.message}</p>
        ) : null}
      </section>

      <Sheet
        open={verdictOuvert}
        onClose={() => setVerdictOuvert(false)}
        title="Conclure le test"
      >
        <p className="mb-5 text-[15px] text-ink-2">
          {test.joursObserves} journées observées, {test.report.n} tokens notés.
          {test.conseil !== null ? ` ${test.conseil.message}` : ''}
        </p>
        <div className="flex flex-col gap-2">
          <BoutonVerdict
            ton="valide"
            onClick={() => {
              setVerdictOuvert(false)
              onConclude('valide')
            }}
          >
            Valider ce wallet
          </BoutonVerdict>
          <BoutonVerdict
            ton="rejete"
            onClick={() => {
              setVerdictOuvert(false)
              onConclude('rejete')
            }}
          >
            Écarter ce wallet
          </BoutonVerdict>
        </div>
        <p className="mt-4 text-[13px] text-ink-3">
          Rien ne presse : laisser le test ouvert quelques jours de plus ne coûte
          rien, et un wallet compliqué le mérite.
        </p>
      </Sheet>

      <Sheet
        open={classementOuvert}
        onClose={() => setClassementOuvert(false)}
        title="Classer à la main"
      >
        <p className="mb-5 text-[15px] text-ink-2">
          Sans passer par la phase de test. À réserver aux wallets que vous
          connaissez déjà — les chiffres affichés resteront ceux du screening.
        </p>
        <div className="flex flex-col gap-2">
          {(['valide', 'trade', 'rejete', 'screening'] as const)
            .filter((cible) => cible !== status)
            .map((cible) => (
              <BoutonVerdict
                key={cible}
                ton={
                  cible === 'valide' || cible === 'trade'
                    ? 'valide'
                    : cible === 'rejete'
                      ? 'rejete'
                      : 'neutre'
                }
                onClick={() => {
                  setClassementOuvert(false)
                  onClassify(cible)
                }}
              >
                {STATUS_LABELS[cible]}
              </BoutonVerdict>
            ))}
        </div>
      </Sheet>
    </>
  )
}

function explication(
  status: WalletStatus,
  test: TestReport,
  trade: TradeReport,
  screeningN: number,
  screeningSeuil: number,
): string {
  switch (status) {
    case 'screening':
      return screeningN < screeningSeuil
        ? `Échantillon historique : ${screeningN} tokens notés sur ${screeningSeuil}. Complétez-le, ou lancez le test si le wallet vous convainc déjà.`
        : 'Échantillon complet. Lancez la phase de test pour le vérifier au jour le jour.'
    case 'test':
      return test.joursRestants > 0
        ? `Relevé quotidien en cours. Encore ${test.joursRestants} ${
            test.joursRestants > 1 ? 'journées' : 'journée'
          } avant de pouvoir conclure.`
        : `${test.joursObserves} journées observées, dont ${test.joursActifs} avec des trades. Le verdict est ouvert.`
    case 'valide':
      return trade.tradesChiffres > 0
        ? 'Wallet validé, phase active en pause. Les trades déjà joués sont conservés.'
        : 'Wallet validé. Passez-le en phase active pour enregistrer vos trades réels.'
    case 'trade':
      return trade.tradesChiffres === 0
        ? 'Phase active. Saisissez l’entrée et la sortie en SOL de chaque trade : à partir d’ici, les chiffres sont comptés et non simulés.'
        : `${trade.tradesChiffres} ${
            trade.tradesChiffres > 1 ? 'trades chiffrés' : 'trade chiffré'
          } sur ${trade.joursObserves} ${
            trade.joursObserves > 1 ? 'journées' : 'journée'
          }. Le résultat affiché est de l’argent compté, pas une simulation.`
    case 'rejete':
      return 'Wallet écarté. Rouvrez le test pour lui redonner sa chance.'
  }
}

function Action({
  onClick,
  children,
  disabled = false,
  discret = false,
}: {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  discret?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full border-t border-separator px-4 py-3 text-left text-[17px] transition',
        disabled
          ? 'cursor-not-allowed text-ink-3'
          : cn(
              'hover:bg-fill-2 active:bg-fill',
              discret ? 'text-ink-2' : 'text-ink',
            ),
      )}
    >
      {children}
    </button>
  )
}

function BoutonVerdict({
  ton,
  onClick,
  children,
}: {
  ton: 'valide' | 'rejete' | 'neutre'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-[10px] px-4 py-3 text-[17px] font-semibold transition active:scale-[0.98] active:opacity-90',
        ton === 'valide' && 'bg-green text-white',
        ton === 'rejete' && 'bg-red text-white',
        ton === 'neutre' && 'bg-fill text-ink',
      )}
    >
      {children}
    </button>
  )
}
