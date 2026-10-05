'use client'

import { cn } from './cn'
import type { SaveStatus } from './use-auto-save'

const LIBELLES: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Échec de l’enregistrement',
}

/** Mention discrète de l'état de la sauvegarde automatique. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const libelle = LIBELLES[status]

  return (
    <span
      aria-live="polite"
      className={cn(
        'text-[13px] transition-opacity duration-300',
        status === 'error' ? 'text-red' : 'text-ink-2',
        libelle === '' && 'opacity-0',
      )}
    >
      {libelle || ' '}
    </span>
  )
}
