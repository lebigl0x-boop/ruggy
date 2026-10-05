'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Sauvegarde automatique différée.
 *
 * `schedule` repousse l'écriture tant qu'on continue de taper : une frappe
 * rapide ne déclenche qu'un seul appel. Les modifications portant sur des
 * champs différents (une `key` différente) partent chacune de leur côté.
 * `run` sert aux gestes francs — ajouter, supprimer, basculer — qui doivent
 * partir tout de suite.
 */
export function useAutoSave(delay = 600) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const enCours = useRef(0)

  const terminer = useCallback(() => {
    if (enCours.current === 0 && timers.current.size === 0) {
      setStatus((precedent) => (precedent === 'error' ? 'error' : 'saved'))
    }
  }, [])

  const executer = useCallback(
    (action: () => Promise<unknown>) => {
      enCours.current += 1
      void action()
        .then(() => {
          setStatus((precedent) => (precedent === 'error' ? 'saving' : precedent))
        })
        .catch((erreur: unknown) => {
          console.error('Enregistrement impossible', erreur)
          setStatus('error')
        })
        .finally(() => {
          enCours.current -= 1
          terminer()
        })
    },
    [terminer],
  )

  const schedule = useCallback(
    (key: string, action: () => Promise<unknown>) => {
      setStatus('saving')
      const precedent = timers.current.get(key)
      if (precedent) clearTimeout(precedent)

      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key)
          executer(action)
        }, delay),
      )
    },
    [delay, executer],
  )

  const run = useCallback(
    (action: () => Promise<unknown>) => {
      setStatus('saving')
      executer(action)
    },
    [executer],
  )

  useEffect(() => {
    const enAttente = timers.current
    return () => {
      for (const timer of enAttente.values()) clearTimeout(timer)
      enAttente.clear()
    }
  }, [])

  return { status, schedule, run }
}
