'use client'

import type { Strategy, WalletReport } from '@/lib/compute'
import { explainTag } from '@/lib/compute'
import { formatEur, formatMinutes, formatPercent, formatSol } from '@/lib/format'
import { cn } from '../ui/cn'
import { TagBadge } from '../ui/tag-badge'

export function BilanCard({
  report,
  strategy,
}: {
  report: WalletReport
  strategy: Strategy
}) {
  const positif = report.netSol > 0
  const negatif = report.netSol < 0
  const progression = Math.min(1, report.n / report.seuilAnalyse)

  // Le taux dépasse-t-il le seuil d'équilibre ? C'est la question qui compte.
  const auDessusDuSeuil =
    report.seuilRentabilite !== null && report.taux >= report.seuilRentabilite

  return (
    <section className="mb-6 overflow-hidden rounded-card bg-card">
      <div className="px-5 pt-6 pb-5 text-center">
        <p
          className={cn(
            'text-[44px] leading-none font-bold tracking-tight tabular-nums',
            positif ? 'text-green' : negatif ? 'text-red' : 'text-ink-2',
          )}
        >
          {formatSol(report.netSol)}
        </p>

        {report.netEur !== null ? (
          <p className="mt-1.5 text-[15px] text-ink-2 tabular-nums">
            {formatEur(report.netEur)}
          </p>
        ) : null}

        <div className="mt-4 flex justify-center">
          <TagBadge
            tag={report.effectiveTag}
            detail={
              report.effectiveTag === 'À compléter'
                ? `${report.n}/${report.seuilAnalyse}`
                : undefined
            }
          />
        </div>

        <p className="mt-2.5 text-[13px] text-ink-2">{explainTag(report, strategy)}</p>

        <div
          className="mt-4 h-1 overflow-hidden rounded-full bg-fill"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={report.seuilAnalyse}
          aria-valuenow={Math.min(report.n, report.seuilAnalyse)}
          aria-label={`${report.n} tokens notés sur ${report.seuilAnalyse}`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              progression >= 1 ? 'bg-green' : 'bg-blue',
            )}
            style={{ width: `${progression * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-separator">
        <Metrique
          label="Taux à l’objectif"
          valeur={report.n > 0 ? formatPercent(report.taux) : '—'}
          detail={report.n > 0 ? `${report.hits} sur ${report.n}` : 'Aucun token noté'}
          bordureDroite
        />
        <Metrique
          label="Seuil de rentabilité"
          valeur={
            report.seuilRentabilite !== null
              ? formatPercent(report.seuilRentabilite, { decimals: 1 })
              : '—'
          }
          detail={
            report.seuilRentabilite === null
              ? 'Les frais annulent le gain'
              : report.n === 0
                ? 'Taux à atteindre'
                : auDessusDuSeuil
                  ? 'Au-dessus du seuil'
                  : 'Sous le seuil'
          }
          ton={
            report.seuilRentabilite === null || report.n === 0
              ? undefined
              : auDessusDuSeuil
                ? 'vert'
                : 'rouge'
          }
          bordureHaute={false}
        />
        <Metrique
          label="Projection sur 100 tokens"
          valeur={report.n > 0 ? formatSol(report.projection100) : '—'}
          detail={report.n > 0 ? 'Au rythme actuel' : 'Pas encore de données'}
          ton={report.n === 0 ? undefined : report.projection100 > 0 ? 'vert' : 'rouge'}
          bordureDroite
          bordureHaute
        />
        <Metrique
          label="Délai avant dump"
          valeur={report.delaiMoyen !== null ? formatMinutes(report.delaiMoyen) : '—'}
          detail={report.regularite ?? 'Au moins 3 délais'}
          bordureHaute
        />
      </div>
    </section>
  )
}

function Metrique({
  label,
  valeur,
  detail,
  ton,
  bordureDroite = false,
  bordureHaute = false,
}: {
  label: string
  valeur: string
  detail: string
  ton?: 'vert' | 'rouge'
  bordureDroite?: boolean
  bordureHaute?: boolean
}) {
  return (
    <div
      className={cn(
        'px-4 py-3.5',
        bordureDroite && 'border-r border-separator',
        bordureHaute && 'border-t border-separator',
      )}
    >
      <p className="text-[13px] text-ink-2">{label}</p>
      <p
        className={cn(
          'mt-1 text-[22px] font-semibold tabular-nums',
          ton === 'vert' ? 'text-green' : ton === 'rouge' ? 'text-red' : 'text-ink',
        )}
      >
        {valeur}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-3">{detail}</p>
    </div>
  )
}
