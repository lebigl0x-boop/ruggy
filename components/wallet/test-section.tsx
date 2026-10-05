'use client'

import { formatDayFr, formatPercent, formatSol } from '@/lib/format'
import type { DayResult, TestReport } from '@/lib/test-report'
import { cn } from '../ui/cn'

/**
 * Le relevé jour par jour de la phase de test.
 *
 * Il est présenté à part du bilan de screening, et jamais additionné avec
 * lui : l'échantillon de screening est choisi à la main, celui-ci est
 * exhaustif. Les mélanger reviendrait à salir la seule mesure honnête.
 */
export function TestSection({ test }: { test: TestReport }) {
  if (test.joursObserves === 0) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 px-4 text-[13px] tracking-wide text-ink-2 uppercase">
          Phase de test
        </h2>
        <div className="rounded-card bg-card px-4 py-6 text-center">
          <p className="text-[15px] text-ink-2">Aucune journée relevée.</p>
          <p className="mt-1 text-[13px] text-ink-3">
            Le relevé du matin porte sur la veille : la première journée
            apparaîtra demain.
          </p>
        </div>
      </section>
    )
  }

  const positif = test.pnlSol > 0

  return (
    <section className="mb-6">
      <h2 className="mb-2 px-4 text-[13px] tracking-wide text-ink-2 uppercase">
        Phase de test
      </h2>

      <div className="overflow-hidden rounded-card bg-card">
        <div className="border-b border-separator px-5 py-5 text-center">
          <p
            className={cn(
              'text-[34px] leading-none font-bold tracking-tight tabular-nums',
              positif ? 'text-green' : test.pnlSol < 0 ? 'text-red' : 'text-ink-2',
            )}
          >
            {formatSol(test.pnlSol)}
          </p>
          <p className="mt-1.5 text-[13px] text-ink-2">
            sur {test.joursObserves}{' '}
            {test.joursObserves > 1 ? 'journées' : 'journée'}, dont{' '}
            {test.joursActifs} {test.joursActifs > 1 ? 'actives' : 'active'}
          </p>
        </div>

        <div className="grid grid-cols-2 border-b border-separator md:grid-cols-4">
          <Mesure
            label="Par jour"
            valeur={formatSol(test.pnlMoyenParJour)}
            detail="journées creuses comprises"
          />
          <Mesure
            label="Tokens / jour actif"
            valeur={test.tokensParJourActif.toFixed(1).replace('.', ',')}
            detail={`exposition ${formatSol(test.expositionMaxSol, { sign: false })}`}
          />
          <Mesure
            label="Journées gagnantes"
            valeur={`${test.joursPositifs}/${test.joursObserves}`}
            detail={
              test.partMeilleurJour !== null
                ? `meilleure : ${formatPercent(test.partMeilleurJour)} du gain`
                : 'aucune journée positive'
            }
          />
          <Mesure
            label="Inactivité"
            valeur={formatPercent(test.tauxInactivite)}
            detail={`${test.joursInactifs} ${
              test.joursInactifs > 1 ? 'journées sans trade' : 'journée sans trade'
            }`}
          />
        </div>

        <div className="hidden items-center gap-3 border-b border-separator px-4 py-2 text-[12px] text-ink-2 md:flex">
          <span className="min-w-0 flex-1">Journée</span>
          <span className="w-20 shrink-0 text-right">Tokens</span>
          <span className="w-20 shrink-0 text-right">Objectif</span>
          <span className="w-24 shrink-0 text-right">Résultat</span>
        </div>

        {test.days.map((jour) => (
          <LigneJour key={jour.day} jour={jour} />
        ))}
      </div>

      <p className="mt-2 px-4 text-[13px] text-ink-2">
        Ce bilan ne compte que les tokens relevés jour par jour. L’échantillon
        de screening est tenu à part : il est choisi à la main, donc biaisé.
      </p>
    </section>
  )
}

function LigneJour({ jour }: { jour: DayResult }) {
  const inactif = jour.state === 'inactif'

  return (
    <div
      className={cn(
        'relative px-4 py-3 md:flex md:items-center md:gap-3 md:py-2.5',
        'after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px',
        'after:bg-separator after:content-[""] last:after:hidden',
      )}
    >
      <div className="flex items-center gap-2 md:min-w-0 md:flex-1">
        <span className={cn('text-[15px]', inactif ? 'text-ink-3' : 'text-ink')}>
          {formatDayFr(jour.day)}
        </span>
        {inactif ? (
          <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
            inactif
          </span>
        ) : null}
      </div>

      {inactif ? (
        <p className="mt-1 text-[13px] text-ink-3 md:mt-0 md:ml-auto">
          Aucun trade ce jour-là
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between md:mt-0 md:contents">
            <span className="text-[13px] text-ink-2 md:hidden">Tokens</span>
            <span className="w-20 shrink-0 text-right text-[13px] text-ink-2 tabular-nums">
              {jour.n}
              {jour.total > jour.n ? (
                <span className="text-ink-3">/{jour.total}</span>
              ) : null}
            </span>
          </div>

          <div className="mt-1 flex items-baseline justify-between md:mt-0 md:contents">
            <span className="text-[13px] text-ink-2 md:hidden">À l’objectif</span>
            <span className="w-20 shrink-0 text-right text-[13px] text-ink-2 tabular-nums">
              {jour.hits}
            </span>
          </div>

          <div className="mt-1 flex items-baseline justify-between md:mt-0 md:contents">
            <span className="text-[13px] text-ink-2 md:hidden">Résultat</span>
            <span
              className={cn(
                'w-24 shrink-0 text-right text-[15px] font-medium tabular-nums',
                jour.pnlSol > 0 ? 'text-green' : jour.pnlSol < 0 ? 'text-red' : 'text-ink-2',
              )}
            >
              {formatSol(jour.pnlSol)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Mesure({
  label,
  valeur,
  detail,
}: {
  label: string
  valeur: string
  detail: string
}) {
  return (
    <div className="border-b border-separator px-4 py-3 last:border-b-0 even:border-l md:border-b-0 md:border-l md:first:border-l-0 md:even:border-l">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className="mt-0.5 text-[17px] font-medium tabular-nums">{valeur}</p>
      <p className="mt-0.5 text-[11px] text-ink-3">{detail}</p>
    </div>
  )
}
