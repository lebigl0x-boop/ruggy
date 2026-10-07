'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { createWalletAction } from '@/app/actions'
import { todayIso } from '@/lib/format'
import {
  hasBlockingIssue,
  validateNewWallet,
  type FieldIssue,
} from '@/lib/validation'
import { BoxedField } from '../ui/field'
import { Sheet } from '../ui/sheet'

const VIDE = { label: '', address: '', analyzedAt: '' }

export function AddWalletSheet({
  open,
  onClose,
  adressesExistantes,
}: {
  open: boolean
  onClose: () => void
  adressesExistantes: string[]
}) {
  const router = useRouter()
  const [form, setForm] = useState(VIDE)
  const [touche, setTouche] = useState(false)
  const [erreurServeur, setErreurServeur] = useState<FieldIssue[]>([])
  const [enCours, startTransition] = useTransition()

  // À chaque ouverture, on repart d'un formulaire neuf daté d'aujourd'hui.
  useEffect(() => {
    if (open) {
      setForm({ ...VIDE, analyzedAt: todayIso() })
      setTouche(false)
      setErreurServeur([])
    }
  }, [open])

  const issues = validateNewWallet({ ...form, existingAddresses: adressesExistantes })
  const bloque = hasBlockingIssue(issues)

  // On signale un champ dès qu'il contient quelque chose — sinon l'avertissement
  // sur l'adresse ne s'afficherait jamais, puisqu'il ne bloque pas l'envoi.
  // Les champs encore vides n'alertent qu'après une tentative d'envoi.
  const rempli: Record<string, boolean> = {
    label: form.label.trim() !== '',
    address: form.address.trim() !== '',
    analyzedAt: form.analyzedAt !== '',
  }
  const affichees = [
    ...issues.filter((i) => touche || rempli[i.field]),
    ...erreurServeur,
  ]
  const probleme = (field: string) => affichees.find((i) => i.field === field)

  function soumettre() {
    setTouche(true)
    if (bloque || enCours) return

    startTransition(async () => {
      const resultat = await createWalletAction(form)
      if (resultat.ok) {
        onClose()
        router.push(`/wallets/${resultat.id}`)
      } else {
        setErreurServeur(resultat.issues)
      }
    })
  }

  const adresse = probleme('address')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nouveau wallet"
      footer={
        <button
          type="button"
          onClick={soumettre}
          disabled={enCours || (touche && bloque)}
          className="text-[17px] font-semibold text-ink disabled:opacity-40"
        >
          {enCours ? '…' : 'Ajouter'}
        </button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          soumettre()
        }}
      >
        <BoxedField
          label="Nom"
          hint={probleme('label')?.message}
          tone={probleme('label') ? 'error' : undefined}
        >
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Dév récidiviste"
            className="w-full bg-transparent outline-none placeholder:text-ink-3"
          />
        </BoxedField>

        <BoxedField
          label="Adresse Solana"
          hint={adresse?.message}
          tone={adresse?.level === 'error' ? 'error' : adresse ? 'warning' : undefined}
        >
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Collez l’adresse ici"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent font-mono text-[15px] outline-none placeholder:font-sans placeholder:text-ink-3"
          />
        </BoxedField>

        <BoxedField
          label="Date d’analyse"
          hint={probleme('analyzedAt')?.message}
          tone={probleme('analyzedAt') ? 'error' : undefined}
        >
          <input
            type="date"
            value={form.analyzedAt}
            onChange={(e) => setForm({ ...form, analyzedAt: e.target.value })}
            className="w-full bg-transparent outline-none"
          />
        </BoxedField>

        <p className="text-[13px] text-ink-2">
          Le wallet reprend vos réglages par défaut et démarre avec 10 lignes de
          tokens vides.
        </p>

        {/* Permet de valider à la touche Entrée sans bouton visible. */}
        <button type="submit" className="sr-only">
          Ajouter
        </button>
      </form>
    </Sheet>
  )
}
