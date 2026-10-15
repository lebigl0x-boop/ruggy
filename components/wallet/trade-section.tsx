'use client'

import { LigneJournee, type JourneeEditable } from '@/components/jour/ligne-journee'
import type { Strategy } from '@/lib/compute'
import { formatPercent, formatSol } from '@/lib/format'
import type { DayState } from '@/lib/day-report'
import type { UpdateTokenPatch } from '@/lib/repo/types'
import type { TradeReport } from '@/lib/trade-report'
import { cn } from '../ui/cn'
import { PlusIcon } from '../ui/icons'

/**
 * Le relevé jour par jour de la phase active.
 *
 * Même forme que le relevé de test, mais ce qu'il affiche n'a pas le même
 * statut : ici les chiffres sont comptés, pas simulés. Les deux ne sont jamais
 * additionnés nulle part, et le gros chiffre en tête est `pnlReelSol` — pas le
 * net du lot, qui retomberait sur la simulation pour les trades pas encore
 * chiffrés.
 *
 * La mesure qui justifie la phase est l'écart : ce que ces trades-là ont
 * rapporté, face à ce que le test prédisait sur exactement les mêmes. C'est la
 * seule façon de savoir si la phase de test sert à quelque chose.
 */
export function TradeSection({
  trade,
  journees,
  strategy,
  jourEnCoursSaisi,
  onOuvrirJour,
  onChangeToken,
  onDeleteToken,
  onAddToken,
  onDayState,
}: {
  trade: TradeReport
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
  if (trade.days.length === 0) {
    return (
      <section className="mb-6">
        <Titre />
        <div className="rounded-card bg-card px-4 py-6 text-center">
          <p className="text-[15px] text-ink-2">Aucun trade enregistré.</p>
          <p className="mt-1 text-[13px] text-ink-3">
            Un trade se note quand on le fait, pas le lendemain : ouvrez la
            journée et portez-y l’entrée et la sortie en SOL.
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

  const parDate = new Map(journees.map((journee) => [journee.day, journee]))
  const net = trade.pnlReelSol

  return (
    <section className="mb-6">
      <Titre />

      <div className="overflow-hidden rounded-card bg-card">
        {trade.tradesChiffres > 0 ? (
          <div className="border-b border-separator px-5 py-5 text-center">
            <p
              className={cn(
                'text-[34px] leading-none font-bold tracking-tight tabular-nums',
                net > 0 ? 'text-green' : net < 0 ? 'text-red' : 'text-ink-2',
              )}
            >
              {formatSol(net)}
            </p>
            <p className="mt-1.5 text-[13px] text-ink-2">
              réellement encaissés sur {trade.tradesChiffres}{' '}
              {trade.tradesChiffres > 1 ? 'trades' : 'trade'}, en{' '}
              {trade.joursObserves} {trade.joursObserves > 1 ? 'journées' : 'journée'}
            </p>
            <p className="mt-1 text-[13px] text-ink-3 tabular-nums">
              {formatSol(trade.engageSol, { sign: false })} engagés →{' '}
              {formatSol(trade.recupereSol, { sign: false })} récupérés
              {trade.pnlReelEur !== null
                ? ` · ${trade.pnlReelEur > 0 ? '+' : ''}${Math.round(trade.pnlReelEur)} €`
                : ''}
            </p>
            {trade.tradesIncomplets > 0 ? (
              <p className="mt-1 text-[13px] text-orange tabular-nums">
                {trade.tradesIncomplets}{' '}
                {trade.tradesIncomplets > 1
                  ? 'trades sans montants ne sont pas comptés'
                  : 'trade sans montants n’est pas compté'}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="border-b border-separator px-4 py-3 text-[13px] text-ink-2">
            Aucun trade chiffré pour l’instant. Dépliez une journée et portez-y
            l’entrée et la sortie en SOL : c’est ce couple qui fait le résultat,
            pas la mise théorique du wallet.
          </p>
        )}

        {trade.tradesChiffres > 0 ? (
          <div className="grid grid-cols-2 border-b border-separator md:grid-cols-4">
            <Mesure
              label="Rendement"
              valeur={
                trade.rendement !== null ? formatPercent(trade.rendement) : '—'
              }
              detail="sur le capital engagé"
            />
            <Mesure
              label="Par jour"
              valeur={formatSol(net / Math.max(1, trade.joursObserves))}
              detail="journées creuses comprises"
            />
            <Mesure
              label="Écart au test"
              valeur={formatSol(trade.ecartSol)}
              detail={
                trade.ecartPct !== null
                  ? `le test annonçait ${formatSol(trade.pnlSimuleSol)}`
                  : 'rien à comparer'
              }
            />
            <Mesure
              label="Creux max"
              valeur={formatSol(trade.drawdownMaxSol, { sign: false })}
              detail={`${trade.joursPositifs}/${trade.joursObserves} journées gagnantes`}
            />
          </div>
        ) : null}

        <div className="hidden items-center gap-3 border-b border-separator px-4 py-2 pl-11 text-[12px] text-ink-2 md:flex">
          <span className="min-w-0 flex-1">Journée</span>
          <span className="w-20 shrink-0 text-right">Trades</span>
          <span className="w-20 shrink-0 text-right">Engagé</span>
          <span className="w-24 shrink-0 text-right">Réel</span>
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

        {trade.days.map((jour) => (
          <LigneJournee
            key={jour.day}
            jour={jour}
            journee={parDate.get(jour.day) ?? null}
            strategy={strategy}
            montants
            valeur={(j) => j.pnlReelSol}
            onChangeToken={onChangeToken}
            onDeleteToken={onDeleteToken}
            onAddToken={onAddToken}
            onDayState={onDayState}
          />
        ))}
      </div>

      <p className="mt-2 px-4 text-[13px] text-ink-2">
        Ce résultat ne compte que les trades dont l’entrée et la sortie sont
        saisies : c’est de l’argent compté. Il ne s’additionne ni au relevé de
        test, qui simule, ni à l’échantillon de screening.
      </p>
    </section>
  )
}

function Titre() {
  return (
    <h2 className="mb-2 text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
      Phase active
    </h2>
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
