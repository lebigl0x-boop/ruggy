'use client'

import type { ReactNode } from 'react'

import { cn } from '../ui/cn'
import { ChevronLeftIcon } from '../ui/icons'

/**
 * La grille de calendrier, nue.
 *
 * Deux phases s'y repèrent de la même façon : le test relève une journée, le
 * trade en solde une. Dans les deux cas on se situe à « hier », pas à une ligne
 * de tableau — donc une seule grille, et chaque phase lui donne ses marques.
 *
 * Le composant ne sait rien des lancements ni des trades : il reçoit, par jour,
 * un ton et une infobulle. Toute la sémantique — ce qu'est un jour vide, un
 * jour gagnant — reste dans la phase qui l'emploie.
 */

/** Ce qu'une phase dit d'un jour. Absent de la table = jour nu. */
export type MarqueJour = {
  ton: 'vert' | 'rouge' | 'neutre'
  /** Infobulle du jour, au survol. */
  titre?: string
}

/** Entêtes de colonnes, semaine commençant le lundi. */
const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const TON: Record<MarqueJour['ton'], string> = {
  vert: 'bg-green',
  rouge: 'bg-red',
  neutre: 'bg-ink-3',
}

/** `AAAA-MM` du mois qui contient ce jour. */
export function moisDe(jourIso: string): string {
  return jourIso.slice(0, 7)
}

/** Les deux nombres d'un `AAAA-MM`. */
function lireMois(mois: string): { annee: number; numero: number } {
  return { annee: Number(mois.slice(0, 4)), numero: Number(mois.slice(5, 7)) }
}

/** Décale un `AAAA-MM` de n mois, sans passer par un fuseau horaire. */
function decalerMois(mois: string, pas: number): string {
  const { annee, numero } = lireMois(mois)
  const total = annee * 12 + (numero - 1) + pas
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * Les jours du mois, précédés des cases vides qui alignent le 1er sur sa
 * colonne. Tout en UTC : le calendrier ne sert qu'à fabriquer des `AAAA-MM-JJ`,
 * et l'heure locale n'y ferait que décaler les bords de mois.
 */
function grille(mois: string): (string | null)[] {
  const { annee, numero } = lireMois(mois)
  const premier = new Date(Date.UTC(annee, numero - 1, 1))
  const combien = new Date(Date.UTC(annee, numero, 0)).getUTCDate()

  // getUTCDay() rend 0 pour dimanche ; on veut lundi en tête.
  const avant = (premier.getUTCDay() + 6) % 7

  return [
    ...Array<null>(avant).fill(null),
    ...Array.from(
      { length: combien },
      (_, i) => `${mois}-${String(i + 1).padStart(2, '0')}`,
    ),
  ]
}

export function Calendrier({
  mois,
  onMois,
  marques,
  selection,
  onSelection,
  aujourdhui,
  legende,
}: {
  /** Mois affiché, au format `AAAA-MM`. */
  mois: string
  onMois: (mois: string) => void
  /** Ce qu'on sait de chaque jour. Absent de la table = rien ce jour-là. */
  marques: ReadonlyMap<string, MarqueJour>
  /** Jour choisi, `null` quand aucun ne l'est. */
  selection: string | null
  onSelection: (jour: string) => void
  /** Dernier jour cliquable : on ne note pas une journée à venir. */
  aujourdhui: string
  /** La légende sous la grille, propre à la phase. */
  legende?: ReactNode
}) {
  const cases = grille(mois)
  const { annee, numero } = lireMois(mois)

  return (
    <div className="px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-[13px] font-semibold text-ink">
          {MOIS[numero - 1]} {annee}
        </span>

        <button
          type="button"
          onClick={() => onMois(decalerMois(mois, -1))}
          aria-label="Mois précédent"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink active:scale-90"
        >
          <ChevronLeftIcon className="h-[14px] w-[14px]" />
        </button>
        <button
          type="button"
          onClick={() => onMois(decalerMois(mois, 1))}
          aria-label="Mois suivant"
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink active:scale-90"
        >
          <ChevronLeftIcon className="h-[14px] w-[14px] rotate-180" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {JOURS_SEMAINE.map((lettre, i) => (
          <span
            key={`${lettre}-${i}`}
            aria-hidden
            className="pb-1 text-center text-[10.5px] font-medium tracking-[0.03em] text-ink-3 uppercase"
          >
            {lettre}
          </span>
        ))}

        {cases.map((jour, i) =>
          jour === null ? (
            <span key={`vide-${i}`} />
          ) : (
            <Case
              key={jour}
              jour={jour}
              marque={marques.get(jour)}
              choisi={jour === selection}
              avenir={jour > aujourdhui}
              onSelection={onSelection}
            />
          ),
        )}
      </div>

      {legende ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-separator pt-2 text-[11px] text-ink-3">
          {legende}
        </div>
      ) : null}
    </div>
  )
}

export function Legende({ classe, libelle }: { classe: string; libelle: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', classe)} />
      {libelle}
    </span>
  )
}

function Case({
  jour,
  marque,
  choisi,
  avenir,
  onSelection,
}: {
  jour: string
  marque: MarqueJour | undefined
  choisi: boolean
  avenir: boolean
  onSelection: (jour: string) => void
}) {
  const numero = Number(jour.slice(8))

  return (
    <button
      type="button"
      disabled={avenir}
      onClick={() => onSelection(jour)}
      title={marque?.titre}
      aria-label={`Journée du ${numero}`}
      aria-pressed={choisi}
      className={cn(
        'flex h-9 flex-col items-center justify-center gap-[3px] rounded-[7px] text-[13px] tabular-nums transition',
        choisi && 'ring-1 ring-blue ring-inset',
        avenir
          ? 'cursor-default text-ink-3/40'
          : marque === undefined
            ? 'text-ink-2 hover:bg-fill active:scale-95'
            : 'bg-fill-2 font-medium text-ink hover:bg-fill active:scale-95',
      )}
    >
      {numero}
      <span
        aria-hidden
        className={cn(
          'h-1 w-1 rounded-full',
          marque === undefined ? 'bg-transparent' : TON[marque.ton],
        )}
      />
    </button>
  )
}
