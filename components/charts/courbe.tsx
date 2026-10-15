'use client'

import type { Point } from '@/lib/calcul'
import { formatSol } from '@/lib/format'
import { cn } from '../ui/cn'

/**
 * La courbe du résultat cumulé.
 *
 * Une seule ligne, pas de grille : ce qu'on vient y lire, c'est la forme — est-ce
 * que ça monte, et est-ce que ça monte régulièrement. Une grille chargée
 * répondrait à une question qu'on ne pose pas, et les chiffres exacts sont déjà
 * au-dessus.
 *
 * Le zéro est en pointillés parce que c'est la seule valeur de référence qui
 * compte : au-dessus on gagne, en dessous on perd.
 */
export function Courbe({
  points,
  className,
  hauteur = 120,
}: {
  points: readonly Point[]
  className?: string
  hauteur?: number
}) {
  if (points.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-[13px] text-ink-3', className)}
        style={{ height: hauteur }}
      >
        Rien à tracer pour l’instant.
      </div>
    )
  }

  const L = 320
  const H = hauteur
  const marge = 6

  const valeurs = points.map((point) => point.cumul)
  // Le zéro fait toujours partie de l'échelle : une courbe entièrement négative
  // qui remplirait le cadre du haut se lirait comme une réussite.
  const haut = Math.max(0, ...valeurs)
  const bas = Math.min(0, ...valeurs)
  const amplitude = haut - bas || 1

  const x = (i: number) =>
    points.length === 1 ? L / 2 : marge + (i * (L - marge * 2)) / (points.length - 1)
  const y = (valeur: number) => marge + ((haut - valeur) / amplitude) * (H - marge * 2)

  const ligne = points.map((point, i) => `${x(i)},${y(point.cumul)}`).join(' ')
  const yZero = y(0)
  const final = valeurs.at(-1)!
  const ton = final > 0 ? 'var(--c-green)' : final < 0 ? 'var(--c-red)' : 'var(--c-text-3)'

  return (
    <svg
      viewBox={`0 0 ${L} ${H}`}
      className={cn('w-full', className)}
      style={{ height: hauteur }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Résultat cumulé sur ${points.length} points, dernier point ${formatSol(final)}.`}
    >
      <line
        x1={0}
        x2={L}
        y1={yZero}
        y2={yZero}
        stroke="var(--c-separator)"
        strokeWidth={1}
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />

      {points.length === 1 ? (
        <circle cx={x(0)} cy={y(final)} r={3} fill={ton} />
      ) : (
        <polyline
          points={ligne}
          fill="none"
          stroke={ton}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

/** La même courbe en miniature, pour une carte du tableau de bord. */
export function MiniCourbe({ points }: { points: readonly Point[] }) {
  if (points.length === 0) return <div className="h-[34px]" />
  return <Courbe points={points} hauteur={34} />
}
