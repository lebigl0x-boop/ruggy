'use client'

import { useEffect, useState } from 'react'

import { cn } from './cn'

/**
 * Le choix du thème.
 *
 * Trois états, pas deux : clair, sombre, et « système » — qui est le défaut et
 * ne pose rien sur la racine, laissant `prefers-color-scheme` trancher. Forcer
 * un choix dès la première visite priverait l'app de suivre le réglage de la
 * machine, qui bascule tout seul le soir.
 *
 * Le choix est relu avant le premier rendu par le script de `app/layout.tsx` :
 * sans lui, une page sombre s'afficherait en clair le temps que React démarre.
 */

export const CLE_THEME = 'ruggers-theme'

type Theme = 'clair' | 'sombre'

/** Ce que le document porte réellement, une fois le script d'amorçage passé. */
function themeApplique(): Theme {
  if (typeof document === 'undefined') return 'sombre'
  const pose = document.documentElement.dataset.theme
  if (pose === 'light') return 'clair'
  if (pose === 'dark') return 'sombre'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'sombre'
    : 'clair'
}

export function SelecteurTheme({ replie }: { replie: boolean }) {
  // Premier rendu identique à celui du serveur : on ne lit le document qu'une
  // fois monté, sinon l'hydratation diverge.
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(themeApplique())
  }, [])

  function basculer() {
    const cible: Theme = theme === 'sombre' ? 'clair' : 'sombre'
    document.documentElement.dataset.theme = cible === 'clair' ? 'light' : 'dark'
    try {
      localStorage.setItem(CLE_THEME, cible === 'clair' ? 'light' : 'dark')
    } catch {
      // Navigation privée, stockage refusé : le thème tiendra pour la session.
    }
    setTheme(cible)
  }

  const versLeClair = theme !== 'clair'
  const libelle = versLeClair ? 'Thème clair' : 'Thème sombre'

  return (
    <button
      type="button"
      onClick={basculer}
      title={libelle}
      aria-label={libelle}
      className={cn(
        'flex w-full items-center rounded-[11px] bg-fill py-2 text-[12.5px] text-ink-2 transition hover:bg-hi hover:text-ink',
        replie ? 'justify-center' : 'gap-2.5 px-3',
      )}
    >
      {/* Tant que le thème n'est pas lu, on garde l'emplacement sans rien
          affirmer : une icône qui change au montage se verrait. */}
      <span className="grid h-[15px] w-[15px] shrink-0 place-items-center">
        {theme === null ? null : versLeClair ? <SoleilIcon /> : <LuneIcon />}
      </span>
      {replie ? null : <span>{theme === null ? '' : libelle}</span>}
    </button>
  )
}

function SoleilIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.2v1.9M10 15.9v1.9M17.8 10h-1.9M4.1 10H2.2M15.5 4.5l-1.3 1.3M5.8 14.2l-1.3 1.3M15.5 15.5l-1.3-1.3M5.8 5.8 4.5 4.5" />
    </svg>
  )
}

function LuneIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9z" />
    </svg>
  )
}
