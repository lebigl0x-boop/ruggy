'use client'

import { cn } from './cn'

export type SegmentedOption<T extends string> = { value: T; label: string }

/**
 * Contrôle segmenté façon iOS : un rail gris et une pastille qui glisse
 * jusqu'au choix actif, plutôt qu'un fond qui s'allume d'un coup.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const largeur = 100 / options.length

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative flex rounded-[9px] bg-fill p-0.5"
    >
      {/* La pastille est un seul élément qu'on déplace : d'où le glissement. */}
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-[7px] bg-segment shadow-[0_1px_3px_var(--c-shadow),0_0_0_0.5px_var(--c-shadow)] transition-transform duration-200 ease-out"
        style={{
          width: `calc(${largeur}% - 2px)`,
          transform: `translateX(calc(${index * 100}% + ${index * 2}px))`,
        }}
      />

      {options.map((option) => {
        const actif = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex-1 rounded-[7px] px-2 py-1 text-[13px] whitespace-nowrap transition-colors duration-200',
              actif ? 'font-semibold text-ink' : 'font-medium text-ink-2 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
