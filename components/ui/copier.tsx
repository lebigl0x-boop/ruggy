'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from './cn'
import { CheckIcon } from './icons'

/** Durée pendant laquelle le bouton confirme la copie avant de reprendre son texte. */
const CONFIRMATION_MS = 1500

/**
 * Un texte qu'on clique pour le copier.
 *
 * L'adresse d'un wallet se recolle sans arrêt — dans Solscan, dans un bot,
 * dans un message. On affiche la version courte, on copie l'entière, et on le
 * dit : sans retour visible, rien ne distingue une copie réussie d'un clic
 * dans le vide.
 */
export function BoutonCopier({
  valeur,
  children,
  className,
  ariaLabel,
}: {
  /** Ce qui part dans le presse-papiers. */
  valeur: string
  /** Ce qui s'affiche au repos — l'adresse abrégée, le plus souvent. */
  children: React.ReactNode
  className?: string
  ariaLabel: string
}) {
  const [copie, setCopie] = useState(false)
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Le composant peut disparaître pendant la confirmation — en changeant de
  // wallet, par exemple. Un `setCopie` après coup n'aurait plus de cible.
  useEffect(() => () => clearTimeout(minuterie.current), [])

  function copier() {
    // L'écriture peut être refusée : hors contexte sécurisé, ou sans
    // permission. On ne confirme que ce qui a réellement abouti.
    void navigator.clipboard
      .writeText(valeur)
      .then(() => {
        setCopie(true)
        clearTimeout(minuterie.current)
        minuterie.current = setTimeout(() => setCopie(false), CONFIRMATION_MS)
      })
      .catch(() => setCopie(false))
  }

  return (
    <button
      type="button"
      onClick={copier}
      aria-label={ariaLabel}
      title={valeur}
      className={cn('inline-flex items-center gap-1 transition active:opacity-50', className)}
    >
      {copie ? (
        <>
          <CheckIcon className="h-[11px] w-[11px]" />
          <span className="font-sans">Copiée</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
