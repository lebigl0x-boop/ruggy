import type { WalletStatus } from '@/lib/repo/types'
import { cn } from './cn'

export const STATUS_LABELS: Record<WalletStatus, string> = {
  screening: 'Screening',
  test: 'En test',
  valide: 'Validé',
  rejete: 'Écarté',
}

const TONS: Record<WalletStatus, string> = {
  screening: 'text-gray bg-fill',
  test: 'text-blue bg-[color-mix(in_srgb,var(--c-blue)_15%,transparent)]',
  valide: 'text-green bg-[color-mix(in_srgb,var(--c-green)_15%,transparent)]',
  rejete: 'text-red bg-[color-mix(in_srgb,var(--c-red)_15%,transparent)]',
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
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium whitespace-nowrap',
        TONS[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
      {detail ? <span className="opacity-70">{detail}</span> : null}
    </span>
  )
}
