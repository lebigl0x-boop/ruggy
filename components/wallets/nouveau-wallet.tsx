'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { creerWalletAction } from '@/app/actions'
import { valideNouveauWallet, type Souci } from '@/lib/validation'
import { BoxedField, TextField } from '../ui/field'
import { PlusIcon } from '../ui/icons'
import { Sheet } from '../ui/sheet'

/** Ajouter un wallet : un nom, une adresse, et c'est tout. */
export function NouveauWallet({
  adressesExistantes,
}: {
  adressesExistantes: readonly string[]
}) {
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [soucis, setSoucis] = useState<Souci[]>([])
  const [occupe, setOccupe] = useState(false)

  // À la frappe, on ne montre que ce qui est déjà sûr : signaler « nom
  // obligatoire » avant la première lettre serait du bruit.
  const vus = ouvert ? valideNouveauWallet({ nom, adresse, adressesExistantes }) : []
  const souci = (champ: string) =>
    soucis.find((s) => s.champ === champ) ??
    vus.find((s) => s.champ === champ && s.niveau === 'avertissement')

  function fermer() {
    setOuvert(false)
    setNom('')
    setAdresse('')
    setSoucis([])
  }

  function valider() {
    setOccupe(true)
    void creerWalletAction({ nom, adresse })
      .then((resultat) => {
        if (!resultat.ok) {
          setSoucis(resultat.soucis)
          return
        }
        fermer()
        router.push(`/wallets/${resultat.id}`)
      })
      .finally(() => setOccupe(false))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:opacity-90 active:scale-95"
      >
        <PlusIcon className="h-[15px] w-[15px]" />
        Nouveau wallet
      </button>

      <Sheet open={ouvert} onClose={fermer} title="Nouveau wallet">
        <BoxedField
          label="Nom"
          hint={souci('nom')?.message}
          tone={souci('nom')?.niveau === 'erreur' ? 'error' : 'warning'}
        >
          <TextField
            ariaLabel="Nom du wallet"
            value={nom}
            placeholder="Comment vous l’appelez"
            onChange={setNom}
          />
        </BoxedField>

        <BoxedField
          label="Adresse Solana"
          hint={souci('adresse')?.message}
          tone={souci('adresse')?.niveau === 'erreur' ? 'error' : 'warning'}
        >
          <TextField
            ariaLabel="Adresse Solana"
            value={adresse}
            placeholder="Collez l’adresse"
            className="font-mono text-[15px]"
            onChange={setAdresse}
          />
        </BoxedField>

        <button
          type="button"
          onClick={valider}
          disabled={occupe}
          className="mt-2 w-full rounded-[11px] bg-blue px-4 py-3 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {occupe ? 'Création…' : 'Créer et commencer le screening'}
        </button>
      </Sheet>
    </>
  )
}
