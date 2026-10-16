'use client'

import { useRef, useState } from 'react'

import { resoudreNomTokenAction } from '@/app/actions'
import { PADRE_URL, adresseCourte } from '@/lib/format'
import { estAdresseSolana } from '@/lib/validation'
import { cn } from '../ui/cn'
import { TextField } from '../ui/field'
import { ExternalIcon } from '../ui/icons'

/**
 * Le champ « Nom » d'une ligne de token, qui accepte aussi une adresse.
 *
 * Coller un CA est le geste réel : on le copie depuis le wallet qu'on
 * surveille, on n'a pas le nom sous la main. Le champ le reconnaît à sa forme,
 * le range dans `mint`, affiche aussitôt le CA raccourci pour que la ligne
 * reste lisible, puis va chercher le vrai nom en arrière-plan.
 *
 * Rien n'est bloquant : le lien Padre ne dépend que du CA et marche dès le
 * collage, même si la recherche de nom ne donne rien. Un nom tapé à la main
 * reste prioritaire — le champ ne le réécrit jamais de lui-même.
 *
 * Les deux tableaux de saisie s'en servent : celui du screening et celui des
 * journées de test, dont les lignes n'existent parfois qu'en mémoire. D'où un
 * composant qui ne sait rien de l'enregistrement et se contente de remonter
 * un patch.
 */

/**
 * Ce que le champ remonte. Les deux clés voyagent toujours ensemble : les
 * écritures sont regroupées par forme de patch, et un `name` seul chasserait
 * le `mint` encore en attente d'enregistrement.
 */
export type PatchNomToken = { nom: string | null; mint: string | null }

export function ChampNomToken({
  nom,
  mint,
  numero,
  dataChamp,
  dataLigne,
  className,
  taille = 'normal',
  onChange,
}: {
  nom: string | null
  mint: string | null
  /** Numéro de ligne, pour les libellés d'accessibilité. */
  numero: number
  /** Repères de navigation au clavier, voir `LignesJour`. */
  dataChamp?: string
  dataLigne?: string
  className?: string
  /** `compact` pour les sous-lignes d'une journée dépliée, plus serrées. */
  taille?: 'normal' | 'compact'
  onChange: (patch: PatchNomToken) => void
}) {
  const [enCours, setEnCours] = useState(false)
  /**
   * Chaque frappe ouvre un tour et périme le précédent : sans ce compteur, un
   * nom revenu du serveur après coup écraserait ce qui a été tapé entre-temps.
   */
  const tour = useRef(0)
  /** Bougé quand le nom arrive du serveur, pour que le champ le reprenne. */
  const [sync, setSync] = useState(0)

  function saisir(valeur: string) {
    tour.current += 1
    const mien = tour.current
    setEnCours(false)

    const brut = valeur.trim()

    // Vider le champ remet la ligne à zéro, adresse comprise : garder un lien
    // Padre sur une ligne sans nom n'aurait plus de sens.
    if (brut === '') {
      onChange({ nom: null, mint: null })
      return
    }

    if (!estAdresseSolana(brut)) {
      onChange({ nom: valeur, mint })
      return
    }

    onChange({ nom: adresseCourte(brut), mint: brut })
    setEnCours(true)

    void resoudreNomTokenAction(brut).then((meta) => {
      if (tour.current !== mien) return
      setEnCours(false)
      if (meta === null) return
      onChange({ nom: meta.name, mint: brut })
      setSync((precedent) => precedent + 1)
    })
  }

  return (
    <span className={cn('flex min-w-0 flex-1 items-center gap-1', className)}>
      <TextField
        ariaLabel={`Nom ou adresse du token ${numero}`}
        dataChamp={dataChamp}
        dataLigne={dataLigne}
        value={nom ?? ''}
        sync={sync}
        onChange={saisir}
        placeholder={`Token ${numero} ou CA`}
        className={taille === 'compact' ? 'text-[12.5px]' : 'text-[15px]'}
      />

      {enCours ? (
        <span
          role="status"
          aria-label="Recherche du nom en cours"
          className="shrink-0 animate-pulse text-[13px] text-ink-3"
        >
          …
        </span>
      ) : null}

      {mint !== null && mint !== '' ? (
        <a
          href={PADRE_URL(mint)}
          target="_blank"
          rel="noreferrer noopener"
          title={`Ouvrir ${mint} sur Padre`}
          aria-label={`Ouvrir le token ${numero} sur Padre`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink active:scale-90"
        >
          <ExternalIcon className="h-[13px] w-[13px]" />
        </a>
      ) : null}
    </span>
  )
}
