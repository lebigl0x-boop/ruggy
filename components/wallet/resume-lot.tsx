'use client'

import type { Strategy, WalletReport } from '@/lib/compute'
import { explainTag } from '@/lib/compute'
import { formatMinutes, formatPercent, formatSol } from '@/lib/format'
import { cn } from '../ui/cn'
import { TagBadge } from '../ui/tag-badge'

/**
 * Le verdict d'un lot de tokens, en bandeau au-dessus de sa liste.
 *
 * Il existe parce que la grande carte du Bilan parle du relevé de test dès
 * que celui-ci a commencé : sans ce bandeau, l'échantillon de screening
 * n'aurait plus nulle part où dire ce qu'il vaut, alors qu'on est en train
 * d'en regarder les lignes.
 *
 * Les deux ne s'additionnent jamais — l'échantillon est choisi à la main,
 * donc flatteur par construction ; le relevé de test est exhaustif.
 */
export function ResumeLot({
  titre,
  report,
  strategy,
  aPart = false,
}: {
  titre: string
  report: WalletReport
  strategy: Strategy
  /** Rappeler que ce lot ne s'ajoute pas au relevé de test. */
  aPart?: boolean
}) {
  const auDessusDuSeuil =
    report.seuilRentabilite !== null && report.taux >= report.seuilRentabilite

  return (
    <section className="mb-3 overflow-hidden rounded-card bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <h2 className="text-[11px] tracking-[0.07em] text-ink-2 uppercase">
          {titre}
        </h2>

        <TagBadge
          tag={report.effectiveTag}
          detail={
            report.effectiveTag === 'À compléter'
              ? `${report.n}/${report.seuilAnalyse}`
              : undefined
          }
        />

        <span
          className={cn(
            'ml-auto text-[19px] font-semibold tabular-nums',
            report.netSol > 0
              ? 'text-green'
              : report.netSol < 0
                ? 'text-red'
                : 'text-ink-2',
          )}
        >
          {report.n > 0 ? formatSol(report.netSol) : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-separator bg-separator sm:grid-cols-4">
        <Mesure
          label="Notés"
          valeur={`${report.n}`}
          detail={
            report.nPris < report.n
              ? `${report.n - report.nPris} écartés`
              : `sur ${report.seuilAnalyse} attendus`
          }
        />
        <Mesure
          label="À l’objectif"
          valeur={report.n > 0 ? formatPercent(report.taux) : '—'}
          detail={report.n > 0 ? `${report.hits} sur ${report.n}` : 'Aucun token noté'}
        />
        <Mesure
          label="Seuil"
          valeur={
            report.seuilRentabilite !== null
              ? formatPercent(report.seuilRentabilite, { decimals: 1 })
              : '—'
          }
          detail={
            report.seuilRentabilite === null
              ? 'Frais trop lourds'
              : report.n === 0
                ? 'Taux à atteindre'
                : auDessusDuSeuil
                  ? 'Au-dessus'
                  : 'En dessous'
          }
          ton={
            report.seuilRentabilite === null || report.n === 0
              ? undefined
              : auDessusDuSeuil
                ? 'vert'
                : 'rouge'
          }
        />
        <Mesure
          label="Délai"
          valeur={report.delaiMoyen !== null ? formatMinutes(report.delaiMoyen) : '—'}
          detail={report.regularite ?? 'Au moins 3 délais'}
        />
      </div>

      <p className="border-t border-separator px-3 py-2 text-[12px] text-ink-2">
        {explainTag(report, strategy)}
        {aPart ? (
          <span className="text-ink-3">
            {' '}
            Choisi à la main, donc biaisé : il ne s’ajoute pas au relevé de test.
          </span>
        ) : null}
      </p>
    </section>
  )
}

function Mesure({
  label,
  valeur,
  detail,
  ton,
}: {
  label: string
  valeur: string
  detail: string
  ton?: 'vert' | 'rouge'
}) {
  return (
    <div className="bg-card px-3 py-2">
      <p className="truncate text-[10.5px] tracking-[0.05em] text-ink-2 uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-[16px] leading-tight font-semibold tabular-nums',
          ton === 'vert' ? 'text-green' : ton === 'rouge' ? 'text-red' : 'text-ink',
        )}
      >
        {valeur}
      </p>
      <p className="mt-0.5 truncate text-[10.5px] text-ink-3">{detail}</p>
    </div>
  )
}
