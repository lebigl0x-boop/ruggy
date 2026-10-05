'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Feuille modale : elle monte du bas sur mobile, se centre sur desktop.
 * Se ferme à l'Échap et au clic sur le fond.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // On empêche la page du fond de défiler pendant que la feuille est ouverte.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Le premier champ reçoit le curseur, pour saisir sans toucher la souris.
    panel.current?.querySelector('input')?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[14px] bg-card shadow-[0_-4px_24px_var(--c-shadow)] sm:max-w-[420px] sm:rounded-[14px]"
      >
        <header className="flex items-center justify-between border-b border-separator px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-w-[60px] text-left text-[17px] text-blue transition active:opacity-50"
          >
            Annuler
          </button>
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <div className="min-w-[60px] text-right">{footer}</div>
        </header>
        <div className="overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>
  )
}
