'use client'

import { useEffect, useRef, useState } from 'react'

import { ListGroup } from '../ui/list'

export function NotesSection({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [texte, setTexte] = useState(value)
  const actif = useRef(false)

  useEffect(() => {
    if (!actif.current) setTexte(value)
  }, [value])

  return (
    <ListGroup title="Notes">
      <textarea
        value={texte}
        aria-label="Notes sur ce wallet"
        rows={4}
        placeholder="Ce que vous avez remarqué sur ce wallet…"
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
        className="w-full resize-y bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-ink-3"
      />
    </ListGroup>
  )
}
