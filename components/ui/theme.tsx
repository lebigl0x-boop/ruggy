'use client'

import { useEffect, useState } from 'react'

import { cn } from './cn'

export type Theme = 'dark' | 'light'

/** La clé du stockage local. Le script d'amorçage lit exactement la même. */
export const CLE_THEME = 'ruggers-theme'

/**
 * Pose le thème choisi avant le premier rendu.
 *
 * Sans ce script, une page réglée en clair s'afficherait d'abord en sombre —
 * le temps que React démarre et lise le stockage local. Il s'exécute de manière
 * bloquante dans le `<head>` : quelques microsecondes contre un clignotement
 * visible à chaque navigation.
 */
export function ScriptTheme() {
  const script = `try{var t=localStorage.getItem('${CLE_THEME}');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}

/** Bascule clair / sombre, mémorisée sur l'appareil. */
export function BasculeTheme({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark')

  // Le thème réel ne se lit qu'une fois monté : le rendu serveur ne connaît
  // pas le stockage local, et prétendre le contraire ferait diverger
  // l'hydratation.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  }, [])

  function basculer() {
    const suivant: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(suivant)
    if (suivant === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    try {
      window.localStorage.setItem(CLE_THEME, suivant)
    } catch {
      // Navigation privée ou quota plein : le thème vaut pour la session.
    }
  }

  return (
    <button
      type="button"
      onClick={basculer}
      aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
      className={cn(
        'flex items-center gap-2 rounded-[8px] text-ink-3 transition hover:bg-fill hover:text-ink',
        compact ? 'h-7 w-7 justify-center' : 'w-full px-2.5 py-2 text-[12px]',
      )}
    >
      {theme === 'dark' ? <IconeSoleil /> : <IconeLune />}
      {compact ? null : <span>{theme === 'dark' ? 'Thème clair' : 'Thème sombre'}</span>}
    </button>
  )
}

function IconeSoleil() {
  return (
    <svg viewBox="0 0 20 20" className="h-[15px] w-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7l-1.3 1.3M6 14l-1.3 1.3M15.3 15.3 14 14M6 6 4.7 4.7" />
    </svg>
  )
}

function IconeLune() {
  return (
    <svg viewBox="0 0 20 20" className="h-[15px] w-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
      <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />
    </svg>
  )
}
