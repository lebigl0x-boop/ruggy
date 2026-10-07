import type { WalletStatus } from '@/lib/repo/types'
import { cn } from './cn'

export const STATUS_LABELS: Record<WalletStatus, string> = {
  screening: 'Screening',
  test: 'En test',
  valide: 'Validé',
  rejete: 'Écarté',
}

/**
 * Le statut porte une pastille de couleur, pas un fond coloré : il cohabite
 * toujours avec un tag, qui lui est teinté. Deux aplats côte à côte se
 * disputeraient l'œil pour rien.
 */
const POINTS: Record<WalletStatus, string> = {
  screening: 'bg-gray',
  test: 'bg-blue',
  valide: 'bg-green',
  rejete: 'bg-ink-3',
}

/**
 * Où en est le wallet dans l'entonnoir.
 *
 * Volontairement distinct de `TagBadge` : le statut dit où on en est du
 * processus, le tag dit ce que disent les chiffres. Les deux peuvent
 * s'afficher côte à côte sans se contredire.
 */
export function StatusBadge({
  status,
  detail,
  className,
}: {
  status: WalletStatus
  /** Précision affichée à côté, par exemple « j3/4 ». */
  detail?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-ink-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('h-[7px] w-[7px] shrink-0 rounded-full', POINTS[status])}
      />
      {STATUS_LABELS[status]}
      {detail ? <span className="opacity-70">{detail}</span> : null}
    </span>
  )
}
