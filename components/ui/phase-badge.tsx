import type { Phase } from '@/lib/repo/types'
import { LIBELLE_PHASE } from '@/lib/repo/types'
import { cn } from './cn'

/**
 * La pastille de phase.
 *
 * Une couleur par phase, et elles ne servent qu'à ça : violet pour le
 * screening, orange pour le test, bleu pour le trade. Le gris de l'archive dit
 * qu'il n'y a plus rien à décider.
 */
const TONS: Record<Phase, string> = {
  screening: 'bg-violet-soft text-violet',
  test: 'bg-orange-soft text-orange',
  trade: 'bg-blue-soft text-blue',
  archive: 'bg-fill text-ink-3',
}

export function PhaseBadge({
  phase,
  detail,
  className,
}: {
  phase: Phase
  /** Précision collée au libellé : « j3/5 », « 4 trades ». */
  detail?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-[11px] font-semibold tracking-[0.01em] whitespace-nowrap',
        TONS[phase],
        className,
      )}
    >
      {LIBELLE_PHASE[phase]}
      {detail ? <span className="font-medium opacity-70 tabular-nums">{detail}</span> : null}
    </span>
  )
}

/** Le point coloré seul, pour les en-têtes de colonne et les listes serrées. */
export function PhasePoint({ phase }: { phase: Phase }) {
  const couleurs: Record<Phase, string> = {
    screening: 'bg-violet',
    test: 'bg-orange',
    trade: 'bg-blue',
    archive: 'bg-ink-3',
  }
  return (
    <span
      aria-hidden
      className={cn('h-[7px] w-[7px] shrink-0 rounded-full', couleurs[phase])}
    />
  )
}
