'use client'

import { useState } from 'react'

import {
  LignesJour,
  TotalJour,
  type LigneJour,
  type PatchLigne,
} from '@/components/jour/lignes-jour'
import type { Strategy } from '@/lib/compute'
import { formatDayFr, formatPercent, formatSol } from '@/lib/format'
import type { Token, UpdateTokenPatch } from '@/lib/repo/types'
import type { DayResult, DayState, TestReport } from '@/lib/test-report'
import { cn } from '../ui/cn'
import { ChevronRightIcon } from '../ui/icons'

/** Une journée relevée, avec de quoi la corriger. */
export type JourneeEditable = {
  /** Identifiant en base de la journée. */
  dayId: string
  /** AAAA-MM-JJ */
  day: string
  /** Tokens de la journée, dans l'ordre où le bilan les a calculés. */
  tokens: Token[]
}

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
  onChangeToken,
  onDeleteToken,
  onAddToken,
  onDayState,
}: {
  test: TestReport
  /** Journées corrigeables, repérées par leur date. */
  journees: readonly JourneeEditable[]
  strategy: Strategy
  onChangeToken: (id: string, patch: UpdateTokenPatch) => void
  onDeleteToken: (id: string) => void
  onAddToken: (dayId: string) => void
  onDayState: (dayId: string, state: DayState) => void
}) {
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
  const parDate = new Map(journees.map((journee) => [journee.day, journee]))
  const ecartes = test.tokensTotal - test.tokensPris

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
          {ecartes > 0 ? (
            <p className="mt-1 text-[13px] text-ink-3 tabular-nums">
              {ecartes} {ecartes > 1 ? 'tokens écartés' : 'token écarté'} · en
              prenant tout : {formatSol(test.report.netSolTout)}
            </p>
          ) : null}
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

        <div className="hidden items-center gap-3 border-b border-separator px-4 py-2 pl-11 text-[12px] text-ink-2 md:flex">
          <span className="min-w-0 flex-1">Journée</span>
          <span className="w-20 shrink-0 text-right">Tokens</span>
          <span className="w-20 shrink-0 text-right">Objectif</span>
          <span className="w-24 shrink-0 text-right">Résultat</span>
        </div>

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

function LigneJournee({
  jour,
  journee,
  strategy,
  onChangeToken,
  onDeleteToken,
  onAddToken,
  onDayState,
}: {
  jour: DayResult
  journee: JourneeEditable | null
  strategy: Strategy
  onChangeToken: (id: string, patch: UpdateTokenPatch) => void
  onDeleteToken: (id: string) => void
  onAddToken: (dayId: string) => void
  onDayState: (dayId: string, state: DayState) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const inactif = jour.state === 'inactif'
  const ecartes = jour.total - jour.pris

  const lignes: LigneJour[] =
    journee?.tokens.map((token) => ({
      cle: token.id,
      name: token.name,
      gain: token.gain,
      perteRug: token.perteRug,
      delay: token.delay,
      pris: token.pris,
    })) ?? []

  function majLigne(cle: string, patch: PatchLigne) {
    onChangeToken(cle, patch)
  }

  return (
    <div className="border-b border-separator last:border-b-0">
      <button
        type="button"
        onClick={() => setOuvert((etat) => !etat)}
        aria-expanded={ouvert}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-fill-2 active:bg-fill md:py-2.5"
      >
        <ChevronRightIcon
          className={cn(
            'h-[15px] w-[15px] shrink-0 text-ink-3 transition-transform',
            ouvert && 'rotate-90',
          )}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-3">
          <span className="flex items-center gap-2 md:min-w-0 md:flex-1">
            <span className={cn('text-[15px]', inactif ? 'text-ink-3' : 'text-ink')}>
              {formatDayFr(jour.day)}
            </span>
            {inactif ? (
              <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
                inactif
              </span>
            ) : null}
            {ecartes > 0 ? (
              <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
                {ecartes} écarté{ecartes > 1 ? 's' : ''}
              </span>
            ) : null}
          </span>

          {inactif ? (
            <span className="text-[13px] text-ink-3 md:ml-auto">
              Aucun trade ce jour-là
            </span>
          ) : (
            <span className="flex items-baseline gap-3 md:contents">
              <span className="w-20 shrink-0 text-[13px] text-ink-2 tabular-nums md:text-right">
                <span className="md:hidden">Tokens </span>
                {jour.n}
                {jour.total > jour.n ? (
                  <span className="text-ink-3">/{jour.total}</span>
                ) : null}
              </span>
              <span className="w-20 shrink-0 text-[13px] text-ink-2 tabular-nums md:text-right">
                <span className="md:hidden">À l’objectif </span>
                {jour.hits}
              </span>
              <span
                className={cn(
                  'ml-auto w-24 shrink-0 text-right text-[15px] font-medium tabular-nums md:ml-0',
                  jour.pnlSol > 0
                    ? 'text-green'
                    : jour.pnlSol < 0
                      ? 'text-red'
                      : 'text-ink-2',
                )}
              >
                {formatSol(jour.pnlSol)}
              </span>
            </span>
          )}
        </span>
      </button>

      {ouvert && journee !== null ? (
        <div className="border-t border-separator bg-card-2/40">
          <LignesJour
            lignes={lignes}
            rows={jour.rows}
            strategy={strategy}
            onChange={majLigne}
            onDelete={onDeleteToken}
            onAdd={() => onAddToken(journee.dayId)}
          />

          {lignes.length > 0 ? (
            <TotalJour
              netSol={jour.pnlSol}
              netSolTout={jour.pnlSolTout}
              nPris={jour.rows.filter((row) => row.pris && row.result !== null).length}
              n={jour.n}
              strategy={strategy}
            />
          ) : (
            <label className="flex items-center gap-2 border-t border-separator px-4 py-3 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={inactif}
                onChange={(event) =>
                  onDayState(journee.dayId, event.target.checked ? 'inactif' : 'actif')
                }
                className="h-4 w-4 accent-blue"
              />
              Journée sans trade
            </label>
          )}
        </div>
      ) : null}
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
