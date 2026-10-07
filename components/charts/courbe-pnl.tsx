'use client'

import { useId, useMemo, useState } from 'react'

import { formatDayFr, formatSol } from '@/lib/format'
import { cn } from '../ui/cn'

/**
 * La courbe du résultat cumulé, jour après jour.
 *
 * SVG à la main plutôt qu'une bibliothèque : une série, un axe, un survol —
 * la dépendance coûterait plus cher que le tracé.
 *
 * Une seule série, donc pas de légende : le titre dit ce qu'on regarde. Le
 * signe est porté par la position de la courbe par rapport au zéro, pas par
 * sa couleur ; celle-ci ne fait que redire ce que la ligne montre déjà.
 */

export type PointCourbe = {
  /** AAAA-MM-JJ */
  day: string
  cumulSol: number
  /** Résultat du jour seul, affiché au survol. */
  pnlSol: number
}

/** Dimensions du repère. Le SVG s'étire, les marges restent en unités fixes. */
const L = 760
const H = 180
const MARGE = { haut: 12, bas: 20, gauche: 8, droite: 8 }

export function CourbePnl({
  points,
  className,
  titre = 'Résultat cumulé',
}: {
  points: readonly PointCourbe[]
  className?: string
  titre?: string
}) {
  const [survol, setSurvol] = useState<number | null>(null)
  const clip = useId()

  const trace = useMemo(() => calculer(points), [points])

  if (trace === null || points.length < 2) {
    return (
      <div
        className={cn(
          'flex h-[120px] flex-col items-center justify-center gap-1 text-center',
          className,
        )}
      >
        <p className="text-[13px] text-ink-2">
          {points.length === 0
            ? 'Pas encore de journée relevée.'
            : `Une seule journée relevée : ${formatSol(points[0]!.cumulSol)}`}
        </p>
        <p className="text-[12px] text-ink-3">
          Il en faut deux pour tracer une courbe.
        </p>
      </div>
    )
  }

  const { x, y, zeroY, dernier } = trace
  const positif = dernier.cumulSol >= 0
  const teinte = positif ? 'var(--c-green)' : 'var(--c-red)'

  const ligne = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.cumulSol)}`).join(' ')
  // L'aire est refermée sur le zéro, pas sur le bas du cadre : sinon une
  // courbe négative paraîtrait positive, remplie jusqu'en bas.
  const aire = `${ligne} L${x(points.length - 1)},${zeroY} L${x(0)},${zeroY} Z`

  const actif = survol !== null ? (points[survol] ?? null) : null

  return (
    <figure className={cn('relative', className)}>
      <figcaption className="sr-only">
        {titre} sur {points.length} journées, de {formatDayFr(points[0]!.day)} à{' '}
        {formatDayFr(dernier.day)}. Dernier point {formatSol(dernier.cumulSol)}.
      </figcaption>

      <svg
        viewBox={`0 0 ${L} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${titre} : ${formatSol(dernier.cumulSol)} après ${points.length} journées`}
        className="h-[180px] w-full touch-none"
        onMouseLeave={() => setSurvol(null)}
        onMouseMove={(event) => {
          const cadre = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientX - cadre.left) / cadre.width
          setSurvol(indexLePlusProche(ratio, points.length))
        }}
      >
        <defs>
          <linearGradient id={clip} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={teinte} stopOpacity="0.22" />
            <stop offset="100%" stopColor={teinte} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Le zéro : la seule ligne de repère qui compte sur un résultat. */}
        <line
          x1={MARGE.gauche}
          y1={zeroY}
          x2={L - MARGE.droite}
          y2={zeroY}
          stroke="var(--c-separator)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />

        <path d={aire} fill={`url(#${clip})`} />
        <path
          d={ligne}
          fill="none"
          stroke={teinte}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {survol !== null ? (
          <line
            x1={x(survol)}
            y1={MARGE.haut}
            x2={x(survol)}
            y2={H - MARGE.bas}
            stroke="var(--c-text-3)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Le dernier point est toujours marqué : c'est la valeur qu'on lit. */}
        <circle
          cx={x(points.length - 1)}
          cy={y(dernier.cumulSol)}
          r={4}
          fill={teinte}
          stroke="var(--c-card)"
          strokeWidth={2}
        />

        {survol !== null && survol !== points.length - 1 ? (
          <circle
            cx={x(survol)}
            cy={y(points[survol]!.cumulSol)}
            r={4}
            fill={teinte}
            stroke="var(--c-card)"
            strokeWidth={2}
          />
        ) : null}
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[11px] text-ink-3">
        <span>{formatDayFr(points[0]!.day)}</span>
        <span>{formatDayFr(dernier.day)}</span>
      </div>

      {actif !== null ? (
        <div
          className="pointer-events-none absolute top-0 rounded-[8px] bg-card px-2 py-1.5 text-[12px] shadow-[0_2px_8px_var(--c-shadow)] ring-1 ring-separator"
          style={{
            left: `${(survol! / Math.max(1, points.length - 1)) * 100}%`,
            transform: `translateX(${survol! > points.length / 2 ? '-110%' : '10%'})`,
          }}
        >
          <p className="text-ink-2">{formatDayFr(actif.day)}</p>
          <p className="font-medium tabular-nums">{formatSol(actif.cumulSol)}</p>
          <p className="text-ink-3 tabular-nums">
            jour {formatSol(actif.pnlSol)}
          </p>
        </div>
      ) : null}
    </figure>
  )
}

/**
 * Échelles et repères du tracé.
 *
 * Le zéro est toujours dans le cadre, même si la courbe ne passe jamais
 * dessous : sans lui, une série entièrement positive donnerait l'impression
 * de partir de l'équilibre alors qu'elle part déjà haut.
 */
function calculer(points: readonly PointCourbe[]) {
  if (points.length === 0) return null

  const valeurs = points.map((p) => p.cumulSol)
  const brutMin = Math.min(0, ...valeurs)
  const brutMax = Math.max(0, ...valeurs)
  // Une série parfaitement plate n'a pas d'amplitude : on lui en invente une
  // petite, sinon la division ci-dessous partirait à l'infini.
  const amplitude = brutMax - brutMin || 1
  const marge = amplitude * 0.12
  const min = brutMin - marge
  const max = brutMax + marge

  const largeur = L - MARGE.gauche - MARGE.droite
  const hauteur = H - MARGE.haut - MARGE.bas

  const x = (i: number) =>
    MARGE.gauche + (points.length === 1 ? largeur / 2 : (i / (points.length - 1)) * largeur)

  const y = (valeur: number) =>
    MARGE.haut + hauteur - ((valeur - min) / (max - min)) * hauteur

  return { x, y, zeroY: y(0), dernier: points.at(-1)! }
}

function indexLePlusProche(ratio: number, total: number): number {
  if (total <= 1) return 0
  const brut = Math.round(ratio * (total - 1))
  return Math.min(total - 1, Math.max(0, brut))
}
