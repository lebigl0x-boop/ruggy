'use client'

import { cn } from './cn'

/**
 * Onglets de page, en pastilles.
 *
 * Distinct du contrôle segmenté : celui-ci filtre une liste sur place, les
 * onglets changent de contenu. Deux gestes différents méritent deux formes
 * différentes, sinon on ne sait plus ce qu'un clic va faire — le segmenté
 * garde son rail continu, les onglets sont des pastilles indépendantes.
 *
 * La barre défile horizontalement plutôt que de se comprimer : sur mobile,
 * quatre onglets tassés à 60 px deviennent illisibles.
 */

export type Onglet<T extends string> = {
  value: T
  label: string
  /** Pastille de décompte, pour signaler ce qui attend. */
  badge?: number | null
}

export function Tabs<T extends string>({
  onglets,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  onglets: readonly Onglet<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex gap-2 overflow-x-auto',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {onglets.map((onglet) => {
        const actif = onglet.value === value
        return (
          <button
            key={onglet.value}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => onChange(onglet.value)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors',
              actif
                ? 'bg-hi font-semibold text-ink'
                : 'bg-fill text-ink-2 hover:bg-hi hover:text-ink',
            )}
          >
            {onglet.label}
            {onglet.badge ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  actif ? 'bg-bg text-ink-2' : 'bg-hi text-ink-3',
                )}
              >
                {onglet.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
