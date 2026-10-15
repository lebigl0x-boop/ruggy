'use client'

import { useState } from 'react'

import {
  LignesJour,
  TotalJour,
  type LigneJour,
  type PatchLigne,
} from './lignes-jour'
import type { Strategy } from '@/lib/compute'
import { formatDayFr, formatSol } from '@/lib/format'
import type { DayResult, DayState } from '@/lib/day-report'
import type { Token, UpdateTokenPatch } from '@/lib/repo/types'
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
 * Une journée du relevé, dépliable sur ses tokens.
 *
 * Partagée par la phase de test et la phase active, parce que le geste est le
 * même : on voit une erreur sur la ligne de la journée, on la déplie, on
 * corrige là où on l'a vue. Ce qui change d'une phase à l'autre tient en deux
 * accessoires — quel résultat on met en avant, et si les montants réels sont
 * saisissables.
 */
export function LigneJournee({
  jour,
  journee,
  strategy,
  montants = false,
  valeur = (j) => j.pnlSol,
  onChangeToken,
  onDeleteToken,
  onAddToken,
  onDayState,
}: {
  jour: DayResult
  journee: JourneeEditable | null
  strategy: Strategy
  /** Saisir l'entrée et la sortie en SOL. Phase active uniquement. */
  montants?: boolean
  /**
   * Le chiffre mis en avant pour la journée. En test c'est le résultat
   * simulé ; en phase active, le résultat réellement encaissé.
   */
  valeur?: (jour: DayResult) => number
  onChangeToken: (id: string, patch: UpdateTokenPatch) => void
  onDeleteToken: (id: string) => void
  onAddToken: (dayId: string) => void
  onDayState: (dayId: string, state: DayState) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const inactif = jour.state === 'inactif'
  // Ouverte pour être saisie au fil de l'eau, mais rien n'y a encore été
  // porté : ce n'est pas une journée sans trade, c'est une journée pas encore
  // regardée — et elle ne compte pas dans le plancher.
  const aRelever = jour.state === 'ouvert'
  const sansChiffres = inactif || aRelever
  const ecartes = jour.total - jour.pris
  const net = valeur(jour)

  const lignes: LigneJour[] =
    journee?.tokens.map((token) => ({
      cle: token.id,
      name: token.name,
      mint: token.mint,
      gain: token.gain,
      perteRug: token.perteRug,
      delay: token.delay,
      pris: token.pris,
      entreeSol: token.entreeSol,
      sortieSol: token.sortieSol,
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
            <span
              className={cn('text-[15px]', sansChiffres ? 'text-ink-3' : 'text-ink')}
            >
              {formatDayFr(jour.day)}
            </span>
            {aRelever ? (
              <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-orange">
                à relever
              </span>
            ) : inactif ? (
              <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
                inactif
              </span>
            ) : null}
            {ecartes > 0 ? (
              <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
                {ecartes} écarté{ecartes > 1 ? 's' : ''}
              </span>
            ) : null}
            {/* Un trade sans montants n'entre pas dans le résultat réel : le
                dire sur la ligne évite de croire que la journée est soldée. */}
            {montants && !sansChiffres && jour.reels < jour.pris ? (
              <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-orange">
                {jour.pris - jour.reels} sans montant
              </span>
            ) : null}
          </span>

          {sansChiffres ? (
            <span className="text-[13px] text-ink-3 md:ml-auto">
              {aRelever ? 'Ouverte, pas encore relevée' : 'Aucun trade ce jour-là'}
            </span>
          ) : (
            <span className="flex items-baseline gap-3 md:contents">
              <span className="w-20 shrink-0 text-[13px] text-ink-2 tabular-nums md:text-right">
                <span className="md:hidden">Tokens </span>
                {montants ? jour.reels : jour.n}
                {jour.total > (montants ? jour.reels : jour.n) ? (
                  <span className="text-ink-3">/{jour.total}</span>
                ) : null}
              </span>
              <span className="w-20 shrink-0 text-[13px] text-ink-2 tabular-nums md:text-right">
                <span className="md:hidden">
                  {montants ? 'Engagé ' : 'À l’objectif '}
                </span>
                {montants ? formatSol(jour.engageSol, { sign: false }) : jour.hits}
              </span>
              <span
                className={cn(
                  'ml-auto w-24 shrink-0 text-right text-[15px] font-medium tabular-nums md:ml-0',
                  net > 0 ? 'text-green' : net < 0 ? 'text-red' : 'text-ink-2',
                )}
              >
                {formatSol(net)}
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
            montants={montants}
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
