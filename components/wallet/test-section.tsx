'use client'

import { LigneJournee, type JourneeEditable } from '@/components/jour/ligne-journee'
import type { Strategy } from '@/lib/compute'
import { formatPercent, formatSol } from '@/lib/format'
import type { UpdateTokenPatch } from '@/lib/repo/types'
import type { DayState, TestReport } from '@/lib/test-report'
import { cn } from '../ui/cn'
import { PlusIcon } from '../ui/icons'

export type { JourneeEditable }

/**
 * Le relevé jour par jour de la phase de test.
 *
 * Il est présenté à part du bilan de screening, et jamais additionné avec
 * lui : l'échantillon de screening est choisi à la main, celui-ci est
 * exhaustif. Les mélanger reviendrait à salir la seule mesure honnête.
 *
 * Chaque journée se déplie sur ses tokens : une erreur de relevé se corrige
 * là où on la voit, sans avoir à ressaisir la journée entière.
 */
export function TestSection({
  test,
  journees,
  strategy,
  jourEnCoursSaisi,
  onOuvrirJour,
  onChangeToken,
  onDeleteToken,
  onAddToken,
  onDayState,
}: {
  test: TestReport
  /** Journées corrigeables, repérées par leur date. */
  journees: readonly JourneeEditable[]
  strategy: Strategy
  /** La journée du jour est déjà ouverte : inutile de la proposer. */
  jourEnCoursSaisi: boolean
  onOuvrirJour: () => void
  onChangeToken: (id: string, patch: UpdateTokenPatch) => void
  onDeleteToken: (id: string) => void
  onAddToken: (dayId: string) => void
  onDayState: (dayId: string, state: DayState) => void
}) {
  // « Aucune journée » et non « aucune journée observée » : une journée
  // seulement ouverte ne compte pas dans le plancher, mais elle existe et
  // c'est précisément là qu'on vient la remplir. Trancher sur `joursObserves`
  // renvoyait sur cet écran-ci, qui masque son bouton dès que la journée est
  // ouverte — la journée devenait alors introuvable.
  if (test.days.length === 0) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
          Phase de test
        </h2>
        <div className="rounded-card bg-card px-4 py-6 text-center">
          <p className="text-[15px] text-ink-2">Aucune journée relevée.</p>
          <p className="mt-1 text-[13px] text-ink-3">
            Le relevé du matin porte sur la veille. Vous pouvez aussi ouvrir la
            journée en cours et la remplir au fil de l’eau.
          </p>
          {jourEnCoursSaisi ? null : (
            <button
              type="button"
              onClick={onOuvrirJour}
              className="mt-3 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-ink transition hover:bg-white active:scale-95"
            >
              Ouvrir la journée du jour
            </button>
          )}
        </div>
      </section>
    )
  }

  const positif = test.pnlSol > 0
  const parDate = new Map(journees.map((journee) => [journee.day, journee]))
  const ecartes = test.tokensTotal - test.tokensPris

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
        Phase de test
      </h2>

      <div className="overflow-hidden rounded-card bg-card">
        {/* Un bilan de zéro journée relevée ne dit rien : « 0 SOL sur 0
            journées », « 0/0 journées gagnantes ». Tant que rien n'est jugé,
            on n'affiche que la liste des journées. */}
        {test.joursObserves > 0 ? (
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
            {ecartes > 0 ? (
              <p className="mt-1 text-[13px] text-ink-3 tabular-nums">
                {ecartes} {ecartes > 1 ? 'tokens écartés' : 'token écarté'} · en
                prenant tout : {formatSol(test.report.netSolTout)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="border-b border-separator px-4 py-3 text-[13px] text-ink-2">
            Journée ouverte, pas encore relevée. Dépliez-la pour la remplir au
            fil de l’eau, ou marquez-la sans trade.
          </p>
        )}

        {test.joursObserves > 0 ? (
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
        ) : null}

        <div className="hidden items-center gap-3 border-b border-separator px-4 py-2 pl-11 text-[12px] text-ink-2 md:flex">
          <span className="min-w-0 flex-1">Journée</span>
          <span className="w-20 shrink-0 text-right">Tokens</span>
          <span className="w-20 shrink-0 text-right">Objectif</span>
          <span className="w-24 shrink-0 text-right">Résultat</span>
        </div>

        {jourEnCoursSaisi ? null : (
          <button
            type="button"
            onClick={onOuvrirJour}
            className="flex w-full items-center gap-2 border-b border-separator px-4 py-2.5 text-left text-[14px] font-medium text-ink transition hover:bg-fill-2 active:bg-fill"
          >
            <PlusIcon className="h-[15px] w-[15px]" />
            Ouvrir la journée du jour
            <span className="ml-auto text-[12px] text-ink-3">
              à remplir au fil de l’eau
            </span>
          </button>
        )}

        {test.days.map((jour) => (
          <LigneJournee
            key={jour.day}
            jour={jour}
            journee={parDate.get(jour.day) ?? null}
            strategy={strategy}
            onChangeToken={onChangeToken}
            onDeleteToken={onDeleteToken}
            onAddToken={onAddToken}
            onDayState={onDayState}
          />
        ))}
      </div>

      <p className="mt-2 px-4 text-[13px] text-ink-2">
        Ce bilan ne compte que les tokens relevés jour par jour. L’échantillon
        de screening est tenu à part : il est choisi à la main, donc biaisé.
      </p>
    </section>
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
