'use client'

import { useMemo, useState } from 'react'

import { formatDayFr, formatSol } from '@/lib/format'
import { cn } from '../ui/cn'

/**
 * Le résultat de chaque journée, en barres de part et d'autre du zéro.
 *
 * Le signe est porté par la position : au-dessus de la ligne c'est gagné,
 * en dessous c'est perdu. La couleur ne fait que le redire — ce qui compte,
 * parce que le rouge et le vert de l'app se distinguent mal en deutéranopie
 * (ΔE 6,8). Quelqu'un qui ne voit pas la différence de teinte lit quand même
 * le graphique.
 */

export type BarreJour = {
  /** AAAA-MM-JJ */
  day: string
  pnlSol: number
  /** Journée sans trade : barre absente, repère conservé. */
  inactif: boolean
}

const H = 150
const MARGE = { haut: 10, bas: 10 }
/** Écart entre deux barres, en part de la place disponible. */
const ESPACE = 0.3
/** Hauteur minimale d'une barre non nulle, pour qu'elle reste visible. */
const MINIMUM = 2

export function BarresJours({
  jours,
  className,
}: {
  jours: readonly BarreJour[]
  className?: string
}) {
  const [survol, setSurvol] = useState<number | null>(null)

  const echelle = useMemo(() => {
    const amplitude = Math.max(
      ...jours.map((jour) => Math.abs(jour.pnlSol)),
      Number.EPSILON,
    )
    const hauteur = H - MARGE.haut - MARGE.bas
    const zeroY = MARGE.haut + hauteur / 2
    return { zeroY, demi: hauteur / 2, amplitude }
  }, [jours])

  if (jours.length === 0) return null

  const actives = jours.filter((jour) => !jour.inactif)
  const gagnantes = actives.filter((jour) => jour.pnlSol > 0).length
  const largeurCase = 100 / jours.length

  return (
    <figure className={cn('relative', className)}>
      <figcaption className="sr-only">
        Résultat de {jours.length} journées : {gagnantes} positives sur{' '}
        {actives.length} journées actives. Les barres au-dessus de la ligne
        centrale sont des gains, celles en dessous des pertes.
      </figcaption>

      <div
        className="relative flex h-[150px] items-stretch"
        onMouseLeave={() => setSurvol(null)}
      >
        {/* La ligne du zéro, tracée sous les barres. */}
        <span
          aria-hidden
          className="absolute right-0 left-0 border-t border-dashed border-separator"
          style={{ top: echelle.zeroY }}
        />

        {jours.map((jour, index) => {
          const part = Math.abs(jour.pnlSol) / echelle.amplitude
          const hauteur = jour.inactif
            ? 0
            : Math.max(MINIMUM, part * echelle.demi)
          const positif = jour.pnlSol >= 0

          return (
            <button
              key={jour.day}
              type="button"
              onMouseEnter={() => setSurvol(index)}
              onFocus={() => setSurvol(index)}
              onBlur={() => setSurvol(null)}
              aria-label={`${formatDayFr(jour.day)} : ${
                jour.inactif ? 'aucun trade' : formatSol(jour.pnlSol)
              }`}
              className="relative min-w-0 flex-1 cursor-default"
            >
              {jour.inactif ? (
                // Une journée sans trade garde sa place : c'est une donnée,
                // pas un trou. Un point gris la marque sur la ligne du zéro.
                <span
                  className="absolute left-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3"
                  style={{ top: echelle.zeroY }}
                />
              ) : (
                <span
                  className={cn(
                    'absolute left-1/2 -translate-x-1/2 transition-opacity',
                    positif ? 'rounded-t-[3px] bg-green' : 'rounded-b-[3px] bg-red',
                    survol !== null && survol !== index && 'opacity-40',
                  )}
                  style={{
                    width: `${(1 - ESPACE) * largeurCase}%`,
                    minWidth: 2,
                    height: hauteur,
                    top: positif ? echelle.zeroY - hauteur : echelle.zeroY,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-1 flex justify-between px-0.5 text-[11px] text-ink-3">
        <span>{formatDayFr(jours[0]!.day)}</span>
        <span>{formatDayFr(jours.at(-1)!.day)}</span>
      </div>

      {survol !== null ? (
        <div
          className="pointer-events-none absolute top-0 rounded-[8px] bg-card px-2 py-1.5 text-[12px] whitespace-nowrap shadow-[0_2px_8px_var(--c-shadow)] ring-1 ring-separator"
          style={{
            left: `${(survol + 0.5) * largeurCase}%`,
            transform: `translateX(${survol > jours.length / 2 ? '-110%' : '10%'})`,
          }}
        >
          <p className="text-ink-2">{formatDayFr(jours[survol]!.day)}</p>
          <p className="font-medium tabular-nums">
            {jours[survol]!.inactif ? 'Aucun trade' : formatSol(jours[survol]!.pnlSol)}
          </p>
        </div>
      ) : null}
    </figure>
  )
}
