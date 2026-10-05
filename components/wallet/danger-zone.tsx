'use client'

import { useState } from 'react'

import { Sheet } from '../ui/sheet'

export function DangerZone({
  label,
  onDelete,
}: {
  label: string
  onDelete: () => void
}) {
  const [confirmation, setConfirmation] = useState(false)

  return (
    <>
      <div className="mb-10 overflow-hidden rounded-card bg-card">
        <button
          type="button"
          onClick={() => setConfirmation(true)}
          className="w-full px-4 py-3 text-[17px] text-red transition hover:bg-fill-2 active:bg-fill"
        >
          Supprimer ce wallet
        </button>
      </div>

      <Sheet
        open={confirmation}
        onClose={() => setConfirmation(false)}
        title="Supprimer ce wallet"
      >
        <p className="mb-5 text-[15px] text-ink-2">
          « {label} » et tous ses tokens seront effacés. Cette action est
          définitive.
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmation(false)
            onDelete()
          }}
          className="w-full rounded-[10px] bg-red px-4 py-3 text-[17px] font-semibold text-white transition active:scale-[0.98] active:opacity-90"
        >
          Supprimer définitivement
        </button>
      </Sheet>
    </>
  )
}
