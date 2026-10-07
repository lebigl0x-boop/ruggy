'use client'

import type { Strategy, WalletReport } from '@/lib/compute'
import { explainTag } from '@/lib/compute'
import { formatEur, formatMinutes, formatPercent, formatSol } from '@/lib/format'
import { cn } from '../ui/cn'
import { TagBadge } from '../ui/tag-badge'

/**
 * Les chiffres du wallet, en bandeau.
 *
 * Le résultat occupe la première case, plus large et plus grosse que les
 * autres : c'est la seule qu'on regarde à chaque visite. Les quatre suivantes
 * expliquent d'où il vient. En colonne, elles coûtaient un écran entier de
 * défilement pour cinq nombres.
 */
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
    <section className="mb-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {/* Le résultat, sur deux cases : c'est lui qu'on vient lire. */}
        <div className="col-span-2 rounded-card bg-card px-4 py-3.5 md:col-span-1">
          <p className="text-[13px] text-ink-2">Résultat net</p>
          <p
            className={cn(
              'mt-1 text-[32px] leading-none font-bold tracking-tight tabular-nums',
              positif ? 'text-green' : negatif ? 'text-red' : 'text-ink-2',
            )}
          >
            {formatSol(report.netSol)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TagBadge
              tag={report.effectiveTag}
              detail={
                report.effectiveTag === 'À compléter'
                  ? `${report.n}/${report.seuilAnalyse}`
                  : undefined
              }
            />
            {report.netEur !== null ? (
              <span className="text-[13px] text-ink-2 tabular-nums">
                {formatEur(report.netEur)}
              </span>
            ) : null}
          </div>

          <div
            className="mt-2.5 h-1 overflow-hidden rounded-full bg-fill"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={report.seuilAnalyse}
            aria-valuenow={Math.min(report.n, report.seuilAnalyse)}
            aria-label={`${report.n} tokens notés sur ${report.seuilAnalyse}`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500',
                progression >= 1 ? 'bg-orange' : 'bg-ink-3',
              )}
              style={{ width: `${progression * 100}%` }}
            />
          </div>
        </div>

        <Metrique
          label="Taux à l’objectif"
          valeur={report.n > 0 ? formatPercent(report.taux) : '—'}
          detail={report.n > 0 ? `${report.hits} sur ${report.n}` : 'Aucun token noté'}
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
        />

        <Metrique
          label="Sur 100 tokens"
          valeur={report.nPris > 0 ? formatSol(report.projection100) : '—'}
          detail={report.nPris > 0 ? 'Au rythme actuel' : 'Pas encore de données'}
          ton={
            report.nPris === 0 ? undefined : report.projection100 > 0 ? 'vert' : 'rouge'
          }
        />

        <Metrique
          label="Délai avant dump"
          valeur={report.delaiMoyen !== null ? formatMinutes(report.delaiMoyen) : '—'}
          detail={report.regularite ?? 'Au moins 3 délais'}
        />
      </div>

      <p className="mt-2 px-1 text-[13px] text-ink-2">
        {explainTag(report, strategy)}
        {report.nPris < report.n ? (
          <>
            {' '}
            <span className="text-ink-3">
              {report.n - report.nPris} tokens écartés · en prenant tout :{' '}
              {formatSol(report.netSolTout)}
            </span>
          </>
        ) : null}
      </p>
    </section>
  )
}

function Metrique({
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
    <div className="rounded-card bg-card px-4 py-3.5">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p
        className={cn(
          'mt-1 text-[22px] leading-tight font-semibold tabular-nums',
          ton === 'vert' ? 'text-green' : ton === 'rouge' ? 'text-red' : 'text-ink',
        )}
      >
        {valeur}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-ink-3">{detail}</p>
    </div>
  )
}
