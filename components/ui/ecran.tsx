'use client'

import { useState, type ReactNode } from 'react'

import { cn } from './cn'

/**
 * Défilement à partir duquel le grand titre a quitté l'écran et où le petit
 * prend le relais. Calé sur la hauteur du grand titre.
 */
const SEUIL = 34

/**
 * Le gabarit d'un écran, à la iOS.
 *
 * Le titre existe à deux endroits : en grand sous la barre, et en petit dans
 * la barre. Au repos seul le grand est visible ; dès que la page défile, le
 * grand sort de l'écran et le petit prend le relais dans la barre translucide.
 * La bascule se fait sur la même ligne de défilement que celle où le grand
 * titre disparaît, d'où le seuil calé sur sa hauteur.
 *
 * Le filet sous la barre n'apparaît qu'une fois la page défilée : au repos, la
 * barre et le contenu sont sur le même fond et un trait ne séparerait rien.
 */
export function Ecran({
  titre,
  titreLarge,
  gauche,
  actions,
  sousTitre,
  children,
  mode = 'racine',
  barre,
}: {
  /** Le titre de la barre, en petit. */
  titre: string
  /**
   * Le grand titre. Une chaîne dans la plupart des cas ; un nœud quand il est
   * éditable sur place, comme le nom d'un wallet.
   */
  titreLarge?: ReactNode
  /** Ce qui précède le titre dans la barre — le retour, sur mobile. */
  gauche?: ReactNode
  /** Ce qui suit le titre dans la barre. */
  actions?: ReactNode
  sousTitre?: ReactNode
  children: ReactNode
  /**
   * `racine` : grand titre qui se replie au défilement, comme un écran
   * d'accueil iOS. `detail` : titre toujours visible dans la barre, pour
   * laisser la place à une barre d'onglets qui, elle, doit rester accessible.
   */
  mode?: 'racine' | 'detail'
  /** Barre collante sous la navigation — les onglets de phase. */
  barre?: ReactNode
}) {
  // React court-circuite un `setState` à valeur identique : on peut écouter
  // chaque pixel de défilement sans provoquer de rendu à chaque fois.
  const [compact, setCompact] = useState(false)

  // Pleine largeur : les écrans sont des tableaux, et un tableau centré sur
  // 840 px laisse la moitié d'un écran large inutilisée.
  const detail = mode === 'detail'
  // En mode détail le titre ne se replie pas : il n'a jamais de grande version
  // à laisser passer devant lui.
  const titreVisible = detail || compact

  return (
    <div
      className="h-full overflow-y-auto overscroll-contain"
      onScroll={(event) => setCompact(event.currentTarget.scrollTop > SEUIL)}
    >
      <header
        className={cn(
          'sticky top-0 z-20 bg-nav backdrop-blur-xl transition-[border-color] duration-200',
          'border-b',
          titreVisible && (detail || compact) ? 'border-separator' : 'border-transparent',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-4',
            'pt-[max(0.5rem,env(safe-area-inset-top))] pb-2',
          )}
        >
          {gauche}

          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.01em]',
              'transition-opacity duration-200',
              detail ? 'text-left' : 'text-center',
              titreVisible ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden={!titreVisible}
          >
            {detail ? (titreLarge ?? titre) : titre}
          </span>

          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>

        {barre ? (
          <div className="px-2">{barre}</div>
        ) : null}
      </header>

      <div className="px-3 pb-12">
        {detail ? null : (
          <div className="pt-1 pb-4">
            <h1 className="text-[34px] leading-[1.08] font-bold tracking-[-0.027em]">
              {titreLarge ?? titre}
            </h1>
            {sousTitre ? <p className="mt-1 text-[13px] text-ink-2">{sousTitre}</p> : null}
          </div>
        )}

        <div className={cn(detail && 'pt-2')}>{children}</div>
      </div>
    </div>
  )
}
