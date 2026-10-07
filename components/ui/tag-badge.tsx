import type { Tag } from '@/lib/compute'
import { cn } from './cn'

const TONS: Record<Tag, string> = {
  Rentable: 'text-green bg-[color-mix(in_srgb,var(--c-green)_15%,transparent)]',
  Limite: 'text-orange bg-[color-mix(in_srgb,var(--c-orange)_15%,transparent)]',
  'À surveiller': 'text-blue bg-[color-mix(in_srgb,var(--c-blue)_15%,transparent)]',
  'Pas rentable': 'text-red bg-[color-mix(in_srgb,var(--c-red)_15%,transparent)]',
  'À compléter': 'text-gray bg-fill',
}

export function TagBadge({
  tag,
  detail,
  className,
}: {
  tag: Tag
  /** Précision affichée à côté du tag, par exemple « 4/10 ». */
  detail?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap',
        TONS[tag],
        className,
      )}
    >
      {tag}
      {detail ? <span className="opacity-70">{detail}</span> : null}
    </span>
  )
}
