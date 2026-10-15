'use client'

import type { ReactNode } from 'react'

import { cn } from '../ui/cn'

/**
 * Les deux boutons de saisie : c'est toute la notation d'un lancement.
 *
 * Un lancement atteint le take-profit visé, ou non. La v1 notait un gain
 * continu puis le comparait à un objectif ; deux boutons disent la même chose
 * en un geste, et sans la fausse précision d'un pourcentage relevé à la main.
 */
export function BoutonsIssue({
  valeur,
  onChange,
  taille = 'normal',
}: {
  valeur: 'tp' | 'rate' | null
  onChange: (issue: 'tp' | 'rate') => void
  taille?: 'normal' | 'compact'
}) {
  const base = cn(
    'rounded-full font-semibold transition active:scale-95',
    taille === 'compact' ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-3.5 py-1.5 text-[13px]',
  )

  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        type="button"
        onClick={() => onChange('tp')}
        aria-pressed={valeur === 'tp'}
        className={cn(
          base,
          valeur === 'tp'
            ? 'bg-green text-white'
            : 'bg-fill text-ink-3 hover:bg-hi hover:text-ink',
        )}
      >
        TP
      </button>
      <button
        type="button"
        onClick={() => onChange('rate')}
        aria-pressed={valeur === 'rate'}
        className={cn(
          base,
          valeur === 'rate'
            ? 'bg-red text-white'
            : 'bg-fill text-ink-3 hover:bg-hi hover:text-ink',
        )}
      >
        Raté
      </button>
    </span>
  )
}

/** Bouton de liste pleine largeur, façon iOS. */
export function Action({
  onClick,
  children,
  ton = 'normal',
}: {
  onClick: () => void
  children: ReactNode
  ton?: 'normal' | 'discret' | 'rouge'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 border-t border-separator px-4 py-3 text-left text-[15px] transition',
        'first:border-t-0 hover:bg-fill-2 active:bg-fill',
        ton === 'rouge' ? 'text-red' : ton === 'discret' ? 'text-ink-2' : 'text-blue',
      )}
    >
      {children}
    </button>
  )
}
