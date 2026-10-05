'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatDateFr } from '@/lib/format'
import type { WalletStatus } from '@/lib/repo/types'
import type { TestReport } from '@/lib/test-report'
import { cn } from '../ui/cn'
import { ChevronRightIcon } from '../ui/icons'
import { Sheet } from '../ui/sheet'
import { STATUS_LABELS, StatusBadge } from '../ui/status-badge'

/**
 * Le pilotage de l'entonnoir : screening → test → verdict.
 *
 * C'est ici qu'on fait passer un wallet en mode test, et ici seulement que le
 * test se conclut. Le bouton « Conclure » reste grisé tant que le plancher de
 * journées n'est pas atteint : c'est la raison d'être du plancher.
 */
export function PhaseSection({
  status,
  testStartedAt,
  test,
  screeningN,
  screeningSeuil,
  onStart,
  onConclude,
  onReopen,
  onClassify,
}: {
  status: WalletStatus
  testStartedAt: string | null
  test: TestReport
  screeningN: number
  screeningSeuil: number
  onStart: () => void
  onConclude: (verdict: 'valide' | 'rejete') => void
  onReopen: () => void
  onClassify: (status: WalletStatus) => void
}) {
  const [verdictOuvert, setVerdictOuvert] = useState(false)
  const [classementOuvert, setClassementOuvert] = useState(false)

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 px-4 text-[13px] tracking-wide text-ink-2 uppercase">
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
                    : undefined
              }
            />
            {testStartedAt !== null && status !== 'screening' ? (
              <span className="ml-auto text-[13px] text-ink-2">
                test ouvert le {formatDateFr(testStartedAt)}
              </span>
            ) : null}
          </div>

          <p className="px-4 py-3 text-[15px] text-ink-2">{explication(status, test, screeningN, screeningSeuil)}</p>

          {status === 'screening' ? (
            <Action onClick={onStart}>Lancer la phase de test</Action>
          ) : null}

          {status === 'test' ? (
            <>
              <Link
                href="/aujourdhui"
                className="flex items-center gap-2 border-t border-separator px-4 py-3 text-[17px] text-blue transition hover:bg-fill-2 active:bg-fill"
              >
                Saisir une journée
                <ChevronRightIcon className="ml-auto h-[17px] w-[17px] text-ink-3" />
              </Link>

              <Action
                onClick={() => setVerdictOuvert(true)}
                disabled={!test.verdictDisponible}
              >
                Conclure le test
              </Action>
            </>
          ) : null}

          {status === 'valide' || status === 'rejete' ? (
            <Action onClick={onReopen}>Rouvrir le test</Action>
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
          {(['valide', 'rejete', 'screening'] as const)
            .filter((cible) => cible !== status)
            .map((cible) => (
              <BoutonVerdict
                key={cible}
                ton={cible === 'valide' ? 'valide' : cible === 'rejete' ? 'rejete' : 'neutre'}
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
      return 'Wallet validé. Les chiffres affichés sont ceux de la phase de test.'
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
              discret ? 'text-ink-2' : 'text-blue',
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
