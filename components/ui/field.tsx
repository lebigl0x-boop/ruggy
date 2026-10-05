'use client'

import { useEffect, useRef, useState } from 'react'

import { toInputValue } from '@/lib/format'
import { parseNumberFr } from '@/lib/validation'
import { cn } from './cn'

/**
 * Champ numérique à la française : la virgule est acceptée comme séparateur
 * décimal. On garde la saisie telle quelle pendant la frappe — sans quoi
 * « 0, » serait réécrit en « 0 » avant d'avoir pu taper la décimale — et on
 * la remet au propre à la sortie du champ.
 */
export function NumberField({
  value,
  onChange,
  placeholder = '—',
  suffix,
  className,
  ariaLabel,
  normalize,
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  suffix?: string
  className?: string
  ariaLabel: string
  /** Rabat la valeur lue dans ses bornes avant de la transmettre. */
  normalize?: (value: number | null) => number | null
}) {
  const [texte, setTexte] = useState(() => toInputValue(value))
  const actif = useRef(false)

  // On ne resynchronise que lorsque le champ n'a pas le curseur, pour ne
  // jamais écraser ce que l'utilisateur est en train de taper.
  useEffect(() => {
    if (!actif.current) setTexte(toInputValue(value))
  }, [value])

  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={texte}
        placeholder={placeholder}
        onFocus={() => {
          actif.current = true
        }}
        onChange={(event) => {
          setTexte(event.target.value)
          const lu = parseNumberFr(event.target.value)
          onChange(normalize ? normalize(lu) : lu)
        }}
        onBlur={() => {
          actif.current = false
          const lu = parseNumberFr(texte)
          // La valeur retenue peut différer de la saisie : on l'affiche.
          const valeur = normalize ? normalize(lu) : lu
          setTexte(toInputValue(valeur))
          onChange(valeur)
        }}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-ink-3"
      />
      {suffix ? <span className="shrink-0 text-ink-2">{suffix}</span> : null}
    </span>
  )
}

/** Champ texte simple, sans habillage. */
export function TextField({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel: string
}) {
  const [texte, setTexte] = useState(value)
  const actif = useRef(false)

  useEffect(() => {
    if (!actif.current) setTexte(value)
  }, [value])

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={texte}
      placeholder={placeholder}
      onFocus={() => {
        actif.current = true
      }}
      onBlur={() => {
        actif.current = false
      }}
      onChange={(event) => {
        setTexte(event.target.value)
        onChange(event.target.value)
      }}
      className={cn(
        'w-full min-w-0 bg-transparent outline-none placeholder:text-ink-3',
        className,
      )}
    />
  )
}

/** Champ encadré, pour les formulaires de la feuille d'ajout. */
export function BoxedField({
  label,
  children,
  hint,
  tone,
}: {
  label: string
  children: React.ReactNode
  hint?: string
  tone?: 'error' | 'warning'
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] text-ink-2">{label}</span>
      <span className="block rounded-[10px] bg-card-2 px-3 py-2.5 text-[17px]">
        {children}
      </span>
      {hint ? (
        <span
          className={cn(
            'mt-1.5 block text-[13px]',
            tone === 'error' ? 'text-red' : tone === 'warning' ? 'text-orange' : 'text-ink-2',
          )}
        >
          {hint}
        </span>
      ) : null}
    </label>
  )
}
