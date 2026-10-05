import type { ReactNode } from 'react'

import { cn } from './cn'

/** Liste groupée : carte blanche arrondie sur fond gris. */
export function ListGroup({
  title,
  footer,
  children,
  className,
}: {
  title?: string
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-6', className)}>
      {title ? (
        <h2 className="mb-2 px-4 text-[13px] font-normal tracking-wide text-ink-2 uppercase">
          {title}
        </h2>
      ) : null}
      <div className="overflow-hidden rounded-card bg-card">{children}</div>
      {footer ? <p className="mt-2 px-4 text-[13px] text-ink-2">{footer}</p> : null}
    </section>
  )
}

/**
 * Ligne de liste. Le séparateur est décalé à gauche, comme dans iOS :
 * il part du bord du contenu, pas du bord de la carte.
 */
export function ListRow({
  children,
  className,
  inset = true,
}: {
  children: ReactNode
  className?: string
  inset?: boolean
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-[44px] items-center gap-3 px-4 py-2.5',
        'after:absolute after:right-0 after:bottom-0 after:h-px after:bg-separator',
        'after:content-[""] last:after:hidden',
        inset ? 'after:left-4' : 'after:left-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Libellé à gauche, valeur à droite. */
export function ListLabel({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[17px] text-ink">{children}</span>
}

export function ListValue({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto text-right text-[17px] text-ink-2 tabular-nums">
      {children}
    </span>
  )
}
