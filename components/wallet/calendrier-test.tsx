'use client'

import { formatSol } from '@/lib/format'
import { cn } from '../ui/cn'
import { ChevronLeftIcon } from '../ui/icons'

/**
 * Le calendrier des journées de test.
 *
 * Relever un test est un geste de calendrier : on se repère à « hier », pas à
 * une ligne de tableau. La grille montre d'un coup d'œil les jours tenus et les
 * trous, et cliquer un jour ouvre son tableau — c'est tout le vocabulaire de
 * l'écran.
 *
 * Trois états par jour, et ils comptent : non relevé (je n'ai pas regardé),
 * relevé sans lancement (il n'a rien lancé), relevé avec lancements. Les deux
 * premiers sont la distinction que toute la phase de test cherche à tenir, donc
 * ils ne se ressemblent pas.
 */

export type JourReleve = { tokens: number; resultat: number }

/** Entêtes de colonnes, semaine commençant le lundi. */
const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

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

export function CalendrierTest({
  mois,
  onMois,
  releves,
  selection,
  onSelection,
  aujourdhui,
}: {
  /** Mois affiché, au format `AAAA-MM`. */
  mois: string
  onMois: (mois: string) => void
  /** Ce qui est relevé, par jour ISO. Absent de la table = pas regardé. */
  releves: ReadonlyMap<string, JourReleve>
  selection: string
  onSelection: (jour: string) => void
  /** Dernier jour relevable : on ne note pas une journée à venir. */
  aujourdhui: string
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
              releve={releves.get(jour)}
              choisi={jour === selection}
              avenir={jour > aujourdhui}
              onSelection={onSelection}
            />
          ),
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-separator pt-2 text-[11px] text-ink-3">
        <Legende classe="bg-green" libelle="journée gagnante" />
        <Legende classe="bg-red" libelle="perdante" />
        <Legende classe="bg-ink-3" libelle="sans lancement" />
        <span>· un jour nu n’a pas été regardé</span>
      </div>
    </div>
  )
}

function Legende({ classe, libelle }: { classe: string; libelle: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', classe)} />
      {libelle}
    </span>
  )
}

function Case({
  jour,
  releve,
  choisi,
  avenir,
  onSelection,
}: {
  jour: string
  releve: JourReleve | undefined
  choisi: boolean
  avenir: boolean
  onSelection: (jour: string) => void
}) {
  const numero = Number(jour.slice(8))
  const vide = releve !== undefined && releve.tokens === 0

  const ton =
    releve === undefined || vide
      ? 'bg-ink-3'
      : releve.resultat > 0
        ? 'bg-green'
        : releve.resultat < 0
          ? 'bg-red'
          : 'bg-ink-3'

  return (
    <button
      type="button"
      disabled={avenir}
      onClick={() => onSelection(jour)}
      title={
        releve === undefined
          ? undefined
          : vide
            ? 'Relevée, aucun lancement'
            : `${releve.tokens} lancement${releve.tokens > 1 ? 's' : ''} · ${formatSol(releve.resultat)}`
      }
      aria-label={`Journée du ${numero}`}
      aria-pressed={choisi}
      className={cn(
        'flex h-9 flex-col items-center justify-center gap-[3px] rounded-[7px] text-[13px] tabular-nums transition',
        choisi && 'ring-1 ring-blue ring-inset',
        avenir
          ? 'cursor-default text-ink-3/40'
          : releve === undefined
            ? 'text-ink-2 hover:bg-fill active:scale-95'
            : 'bg-fill-2 font-medium text-ink hover:bg-fill active:scale-95',
      )}
    >
      {numero}
      <span
        aria-hidden
        className={cn(
          'h-1 w-1 rounded-full',
          releve === undefined ? 'bg-transparent' : ton,
        )}
      />
    </button>
  )
}
