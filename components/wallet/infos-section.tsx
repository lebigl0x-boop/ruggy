'use client'

import { useState } from 'react'

import type { TagOverride } from '@/lib/compute'
import { shortAddress } from '@/lib/format'
import { NumberField } from '../ui/field'
import { CheckIcon } from '../ui/icons'
import { ListGroup, ListLabel, ListRow, ListValue } from '../ui/list'
import { Segmented } from '../ui/segmented'

/** « Automatique » est une absence de tag manuel, pas un tag. */
const TAGS = [
  { value: 'auto', label: 'Auto' },
  { value: 'rentable', label: 'Rentable' },
  { value: 'surveiller', label: 'À surveiller' },
  { value: 'pas', label: 'Pas rentable' },
] as const

export function InfosSection({
  address,
  analyzedAt,
  tagOverride,
  solPriceEur,
  onAnalyzedAt,
  onTagOverride,
  onSolPrice,
}: {
  address: string
  analyzedAt: string
  tagOverride: TagOverride | null
  solPriceEur: number | null
  onAnalyzedAt: (value: string) => void
  onTagOverride: (value: TagOverride | null) => void
  onSolPrice: (value: number | null) => void
}) {
  const [copie, setCopie] = useState(false)

  return (
    <ListGroup
      title="Infos"
      footer="Le prix du SOL est commun à tous les wallets. Laissez-le vide pour masquer les montants en euros."
    >
      <ListRow>
        <ListLabel>Adresse</ListLabel>
        <ListValue>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(address)
              setCopie(true)
              setTimeout(() => setCopie(false), 1500)
            }}
            className="inline-flex items-center gap-1 font-mono text-[15px] text-ink-2 underline decoration-separator underline-offset-4 transition hover:text-ink active:opacity-50"
            title={address}
          >
            {copie ? (
              <>
                <CheckIcon className="h-[13px] w-[13px]" />
                <span className="font-sans">Copiée</span>
              </>
            ) : (
              shortAddress(address)
            )}
          </button>
        </ListValue>
      </ListRow>

      <ListRow>
        <ListLabel>Date d’analyse</ListLabel>
        <ListValue>
          <input
            type="date"
            value={analyzedAt}
            aria-label="Date d’analyse"
            onChange={(event) => onAnalyzedAt(event.target.value)}
            className="bg-transparent text-right outline-none"
          />
        </ListValue>
      </ListRow>

      <ListRow className="flex-col items-stretch gap-2 py-3">
        <span>
          <ListLabel>Tag manuel</ListLabel>
          <span className="mt-0.5 block text-[13px] text-ink-2">
            « Auto » laisse les chiffres décider.
          </span>
        </span>
        <Segmented
          ariaLabel="Tag manuel"
          options={TAGS}
          value={tagOverride ?? 'auto'}
          onChange={(value) => onTagOverride(value === 'auto' ? null : value)}
        />
      </ListRow>

      <ListRow>
        <ListLabel>Prix du SOL</ListLabel>
        <ListValue>
          <span className="inline-block w-28">
            <NumberField
              ariaLabel="Prix du SOL en euros"
              value={solPriceEur}
              suffix="€"
              placeholder="—"
              onChange={onSolPrice}
            />
          </span>
        </ListValue>
      </ListRow>
    </ListGroup>
  )
}
