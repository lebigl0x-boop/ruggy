'use client'

import type { Phase } from '@/lib/repo/types'
import { cn } from './cn'

export type Onglet<T extends string> = {
  value: T
  label: string
  /** Chiffre collé au libellé : ce que l'onglet contient, avant d'y entrer. */
  compte?: number
  /** Teinte de l'onglet. Les lots prennent la couleur de leur phase. */
  ton?: Phase
  /** Marque la phase où le wallet se trouve réellement. */
  marque?: boolean
}

const TRAITS: Record<Phase, string> = {
  screening: 'bg-violet',
  test: 'bg-orange',
  trade: 'bg-blue',
  archive: 'bg-ink-3',
}

const TEXTES: Record<Phase, string> = {
  screening: 'text-violet',
  test: 'text-orange',
  trade: 'text-blue',
  archive: 'text-ink-2',
}

/**
 * La barre d'onglets d'un écran.
 *
 * Les onglets de lot servent à **regarder**, pas à décider : ouvrir l'onglet
 * Test d'un wallet qui n'est pas en test ne le fait pas changer de phase. D'où
 * le point du `marque` — il signale la phase réelle du wallet, qui n'est pas
 * forcément celle qu'on consulte.
 *
 * Sans cette distinction, l'onglet actif et la phase du wallet se
 * confondraient, et c'est exactement l'ambiguïté que l'app passe son temps à
 * éviter entre ce qu'on observe et ce qu'on a joué.
 */
export function Onglets<T extends string>({
  onglets,
  valeur,
  onChange,
  ariaLabel,
}: {
  onglets: readonly Onglet<T>[]
  valeur: T
  onChange: (valeur: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {onglets.map((onglet) => {
        const actif = onglet.value === valeur
        const trait = onglet.ton ? TRAITS[onglet.ton] : 'bg-ink'
        const texte = onglet.ton ? TEXTES[onglet.ton] : 'text-ink'

        return (
          <button
            key={onglet.value}
            type="button"
            role="tab"
            aria-selected={actif}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 px-3 pt-2 pb-2.5 text-[14px] transition',
              actif ? cn('font-semibold', texte) : 'font-medium text-ink-2 hover:text-ink',
            )}
            onClick={() => onChange(onglet.value)}
          >
            {onglet.marque ? (
              <span
                aria-label="phase en cours"
                className={cn('h-[6px] w-[6px] shrink-0 rounded-full', trait)}
              />
            ) : null}

            {onglet.label}

            {onglet.compte !== undefined && onglet.compte > 0 ? (
              <span className="text-[12px] font-normal text-ink-3 tabular-nums">
                {onglet.compte}
              </span>
            ) : null}

            <span
              aria-hidden
              className={cn(
                'absolute inset-x-2 bottom-0 h-[2.5px] rounded-full transition-opacity duration-200',
                trait,
                actif ? 'opacity-100' : 'opacity-0',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
