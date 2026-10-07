import type { ReactNode } from 'react'

import { cn } from './cn'

/**
 * Le gabarit commun aux trois espaces.
 *
 * Une barre de titre collante, puis la zone de travail en pleine largeur.
 * Chaque page le reprend pour que passer de l'un à l'autre ne déplace ni le
 * titre ni les actions — c'est ce qui fait qu'un ensemble d'écrans se lit
 * comme une application et non comme une suite de pages.
 */
export function Page({
  titre,
  sousTitre,
  actions,
  children,
  className,
}: {
  titre: string
  sousTitre?: ReactNode
  /** Boutons alignés à droite du titre. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <header className="sticky top-0 z-20 border-b border-separator bg-nav px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 backdrop-blur-xl sm:px-4 md:px-6">
        <div className="flex w-full items-start gap-3">
          {/* Titre et sous-titre sur une ligne dès qu'il y a la place : le
              sous-titre est une précision, pas un second titre. */}
          <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
            <h1 className="truncate text-[17px] leading-tight font-semibold tracking-tight">
              {titre}
            </h1>
            {sousTitre ? (
              <p className="truncate text-[12.5px] text-ink-3">
                <span aria-hidden className="mr-2.5 hidden text-separator sm:inline">
                  ·
                </span>
                {sousTitre}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          'w-full px-3 pt-3 pb-16 sm:px-4 sm:pt-4 md:px-6',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Un bloc de contenu avec son étiquette, dans l'esprit des tableaux. */
export function Bloc({
  titre,
  actions,
  children,
  className,
}: {
  titre?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-card bg-card', className)}>
      {titre ? (
        <div className="flex items-center gap-2 border-b border-separator px-3 py-2">
          <h2 className="text-[11px] tracking-[0.07em] text-ink-2 uppercase">
            {titre}
          </h2>
          {actions ? <div className="ml-auto flex gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
