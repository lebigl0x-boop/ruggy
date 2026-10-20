'use client'

import type { ReactNode } from 'react'

import { cn } from './cn'

/**
 * Les tableaux denses de l'app.
 *
 * Un outil de suivi se consulte en balayant des lignes, pas en lisant des
 * cartes : des rangées serrées, un en-tête de colonnes, et le survol qui dit
 * où est l'œil. C'est la densité d'un CRM, pas celle d'un réglage iOS — et
 * c'est le bon compromis ici, parce qu'on y revient tous les jours.
 */
export function Tableau({
  entetes,
  children,
  vide,
}: {
  /** Libellé et gabarit de chaque colonne. */
  entetes: readonly { label: string; classe?: string }[]
  children: ReactNode
  /** Affiché à la place des lignes quand il n'y en a aucune. */
  vide?: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex items-center gap-3 border-b border-separator px-3 py-1.5 text-[11px] font-medium tracking-[0.03em] text-ink-3 uppercase">
          {entetes.map((entete) => (
            <span key={entete.label} className={cn('shrink-0', entete.classe)}>
              {entete.label}
            </span>
          ))}
        </div>
        {vide ?? children}
      </div>
    </div>
  )
}

/** Une rangée. Serrée, et qui s'éclaire au survol. */
export function Rangee({
  children,
  onClick,
  actif = false,
  survol = false,
  className,
}: {
  children: ReactNode
  /** Rend la rangée cliquable. Un `<button>` est alors émis. */
  onClick?: () => void
  actif?: boolean
  /**
   * Éclaire la rangée au survol sans la rendre cliquable elle-même : pour une
   * rangée déjà enveloppée dans un lien, où imbriquer un bouton produirait du
   * HTML invalide.
   */
  survol?: boolean
  className?: string
}) {
  const classes = cn(
    'flex w-full items-center gap-3 border-b border-separator/60 px-3 py-1.5 text-left',
    'text-[13px] transition last:border-b-0',
    (onClick || survol) && 'hover:bg-fill-2',
    actif && 'bg-fill-2',
    className,
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {children}
      </button>
    )
  }

  return <div className={classes}>{children}</div>
}

/**
 * La bande de mesures en tête d'écran.
 *
 * Tout tient sur une ligne tant qu'il y a la place, et se replie en grille
 * ensuite. Un chiffre par colonne, son libellé au-dessus : c'est ce qu'on lit
 * en arrivant, avant de descendre dans les lignes.
 */
export function Bande({
  children,
  colonnes = 6,
}: {
  children: ReactNode
  /**
   * Chiffres par ligne en grand écran. À régler sur le nombre exact de cases :
   * une case manquante laisse apparaître le fond de la grille, et la bande a
   * l'air cassée.
   */
  colonnes?: 3 | 4 | 6
}) {
  const grille =
    colonnes === 3 ? 'xl:grid-cols-3' : colonnes === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-6'

  return (
    <div
      className={cn(
        'mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-card bg-separator sm:grid-cols-3 [&>*]:bg-card',
        grille,
      )}
    >
      {children}
    </div>
  )
}

export function Chiffre({
  label,
  valeur,
  detail,
  ton,
  fort = false,
}: {
  label: string
  valeur: string
  detail?: string
  ton?: 'vert' | 'rouge' | 'orange'
  /** La case du résultat, plus grosse que les autres. */
  fort?: boolean
}) {
  return (
    <div className="px-3 py-2">
      <p className="truncate text-[10.5px] font-medium tracking-[0.04em] text-ink-3 uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 leading-tight font-semibold tabular-nums',
          fort ? 'text-[22px] tracking-[-0.02em]' : 'text-[17px]',
          ton === 'vert'
            ? 'text-green'
            : ton === 'rouge'
              ? 'text-red'
              : ton === 'orange'
                ? 'text-orange'
                : 'text-ink',
        )}
      >
        {valeur}
      </p>
      {detail ? <p className="truncate text-[11px] text-ink-3">{detail}</p> : null}
    </div>
  )
}

/**
 * Un panneau : titre discret, contenu dans une carte.
 * La brique de base de tous les écrans denses.
 */
export function Panneau({
  titre,
  action,
  children,
  className,
}: {
  titre?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-2 overflow-hidden rounded-card bg-card', className)}>
      {titre || action ? (
        <div className="flex items-center gap-3 border-b border-separator px-3 py-1.5">
          {titre ? (
            <h2 className="text-[11px] font-semibold tracking-[0.05em] text-ink-3 uppercase">
              {titre}
            </h2>
          ) : null}
          {action ? <div className="ml-auto">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
