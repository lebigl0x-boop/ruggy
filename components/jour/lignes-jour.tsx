'use client'

import { useRef } from 'react'

import type { ReportRow, Strategy } from '@/lib/compute'
import { formatPercent, formatPercentExact, formatSol } from '@/lib/format'
import { parsePerteToken } from '@/lib/validation'
import { cn } from '../ui/cn'
import { NumberField, TextField } from '../ui/field'
import { CheckIcon, CloseIcon, PlusIcon } from '../ui/icons'

/**
 * Le tableau de saisie d'une journée, une ligne par token.
 *
 * Il sert à deux écrans : le relevé du matin, où les lignes n'existent encore
 * qu'en mémoire, et la correction d'une journée passée, où chaque ligne est
 * un token en base. D'où un composant purement présentatif : il affiche des
 * lignes et remonte des modifications, sans rien savoir de l'enregistrement.
 */

/** Une ligne de saisie, qu'elle soit déjà en base ou encore en mémoire. */
export type LigneJour = {
  /** Clé stable d'affichage : l'identifiant du token, ou une clé locale. */
  cle: string
  name: string | null
  gain: number | null
  perteRug: number | null
  delay: number | null
  pris: boolean
}

export type PatchLigne = Partial<Omit<LigneJour, 'cle'>>

/**
 * Les champs d'une ligne, dans l'ordre de tabulation. Sert à retrouver le
 * même champ sur la ligne voisine quand on monte ou on descend.
 */
const CHAMPS = ['nom', 'gain', 'perte', 'delai', 'pris'] as const
type Champ = (typeof CHAMPS)[number]

/**
 * Monte ou descend d'une ligne, sur le même champ.
 *
 * Les flèches sont le geste du tableur : dans une colonne de quinze gains,
 * reprendre la souris à chaque ligne est ce qui rend la saisie pénible. On
 * passe par le DOM plutôt que par une forêt de références — une ligne peut
 * disparaître sous les doigts, un attribut survit à ça.
 */
function deplacer(
  conteneur: HTMLElement | null,
  champ: Champ,
  sens: 1 | -1,
  cleCourante: string,
): boolean {
  if (conteneur === null) return false

  const cibles = Array.from(
    conteneur.querySelectorAll<HTMLElement>(`[data-champ="${champ}"]`),
  )
  const index = cibles.findIndex(
    (element) => element.dataset.ligne === cleCourante,
  )
  const voisin = cibles[index + sens]
  if (index === -1 || voisin === undefined) return false

  voisin.focus()
  if (voisin instanceof HTMLInputElement) voisin.select()
  return true
}

export function LignesJour({
  lignes,
  rows,
  strategy,
  onChange,
  onDelete,
  onAdd,
}: {
  lignes: readonly LigneJour[]
  /** Résultats calculés, alignés sur l'ordre des lignes. */
  rows: readonly ReportRow[]
  strategy: Strategy
  onChange: (cle: string, patch: PatchLigne) => void
  onDelete: (cle: string) => void
  onAdd: () => void
}) {
  const conteneur = useRef<HTMLDivElement | null>(null)

  /**
   * Les flèches déplacent le curseur d'une ligne à l'autre, Entrée descend.
   * Posé sur le conteneur plutôt que sur chaque champ : un seul écouteur,
   * et les lignes ajoutées en cours de route en héritent.
   */
  function auClavier(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
      return
    }
    // ⌘↵ valide la journée, au niveau de la carte : le laisser aussi
    // descendre d'une ligne ferait deux choses pour une frappe.
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const cible = event.target
    if (!(cible instanceof HTMLElement)) return

    const champ = cible.dataset.champ as Champ | undefined
    const ligne = cible.dataset.ligne
    if (champ === undefined || ligne === undefined) return

    // Entrée sur la case à cocher la bascule : c'est le comportement natif
    // d'un bouton, on ne le vole pas.
    if (event.key === 'Enter' && champ === 'pris') return

    const sens = event.key === 'ArrowUp' ? -1 : 1
    if (deplacer(conteneur.current, champ, sens, ligne)) event.preventDefault()
  }

  return (
    <div ref={conteneur} onKeyDown={auClavier}>
      {/* En-têtes : desktop seulement, les cartes mobiles ont leurs libellés. */}
      <div className="hidden items-center gap-3 border-b border-separator px-4 py-2 text-[12px] text-ink-2 md:flex">
        <span className="w-6 shrink-0">#</span>
        <span className="min-w-0 flex-1">Nom</span>
        <span className="w-16 shrink-0 text-right">Gain %</span>
        <span className="w-16 shrink-0 text-right">Perte %</span>
        <span className="w-14 shrink-0 text-right">Délai</span>
        <span className="w-12 shrink-0 text-center">Pris</span>
        <span className="w-32 shrink-0 text-right">Résultat</span>
        <span className="w-7 shrink-0" aria-hidden />
      </div>

      {lignes.map((ligne, index) => (
        <Ligne
          key={ligne.cle}
          ligne={ligne}
          index={index}
          row={rows[index] ?? { result: null, pris: ligne.pris, cumulSol: null }}
          strategy={strategy}
          onChange={onChange}
          onDelete={onDelete}
        />
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[17px] font-medium text-ink transition hover:bg-fill-2 active:bg-fill"
      >
        <PlusIcon className="h-[17px] w-[17px]" />
        Ajouter un token
      </button>
    </div>
  )
}

function Ligne({
  ligne,
  index,
  row,
  strategy,
  onChange,
  onDelete,
}: {
  ligne: LigneJour
  index: number
  row: ReportRow
  strategy: Strategy
  onChange: (cle: string, patch: PatchLigne) => void
  onDelete: (cle: string) => void
}) {
  const numero = index + 1

  // Mobile : deux lignes — le token et son verdict d'abord, les chiffres
  // ensuite. Desktop : une seule ligne de tableau. Les deux partagent le même
  // balisage, remis dans l'ordre des colonnes par `order` au-delà de `md`.
  return (
    <div
      className={cn(
        'group/ligne relative',
        'after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px',
        'after:bg-separator after:content-[""]',
        'px-4 py-2 md:flex md:items-center md:gap-3',
        // Une ligne écartée reste lisible mais s'efface : elle ne pèse plus
        // sur le résultat, l'œil doit le voir sans avoir à lire la case.
        !ligne.pris && 'bg-fill-2/40',
      )}
    >
      <div className="flex items-center gap-2 md:contents">
        <span className="w-5 shrink-0 text-[13px] text-ink-3 tabular-nums md:order-1 md:w-6">
          {numero}
        </span>

        <span className="min-w-0 flex-1 md:order-2">
          <TextField
            ariaLabel={`Nom du token ${numero}`}
            dataChamp="nom"
            dataLigne={ligne.cle}
            value={ligne.name ?? ''}
            onChange={(value) =>
              onChange(ligne.cle, { name: value.trim() === '' ? null : value })
            }
            placeholder={`Token ${numero}`}
            className="text-[15px]"
          />
        </span>

        <span className="flex shrink-0 justify-center md:order-6 md:w-12">
          <CasePris
            coche={ligne.pris}
            numero={numero}
            cle={ligne.cle}
            onChange={(pris) => onChange(ligne.cle, { pris })}
          />
        </span>

        <span className="w-[72px] shrink-0 text-right md:order-7 md:w-32">
          <Resultat row={row} pris={ligne.pris} />
        </span>

        <button
          type="button"
          onClick={() => onDelete(ligne.cle)}
          aria-label={`Supprimer le token ${numero}`}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition',
            'hover:bg-fill hover:text-red active:scale-90',
            // Sur desktop, la croix n'apparaît qu'au survol de la ligne :
            // sept colonnes et une croix permanente, c'est une de trop.
            'md:order-8 md:h-7 md:w-7 md:opacity-0 md:focus-visible:opacity-100 md:group-hover/ligne:opacity-100',
          )}
        >
          <CloseIcon className="h-[15px] w-[15px]" />
        </button>
      </div>

      <div className="mt-1 grid grid-cols-3 gap-2 pl-7 md:mt-0 md:contents">
        <Champ label="Gain" className="md:order-3 md:w-16">
          <NumberField
            ariaLabel={`Gain du token ${numero} en pourcentage`}
            dataChamp="gain"
            dataLigne={ligne.cle}
            value={ligne.gain}
            onChange={(gain) => onChange(ligne.cle, { gain })}
          />
        </Champ>

        <Champ label="Perte" className="md:order-4 md:w-16">
          <NumberField
            ariaLabel={`Perte du token ${numero} en pourcentage`}
            dataChamp="perte"
            dataLigne={ligne.cle}
            value={ligne.perteRug}
            placeholder={String(strategy.perteRug).replace('.', ',')}
            normalize={parsePerteToken}
            onChange={(perteRug) => onChange(ligne.cle, { perteRug })}
          />
        </Champ>

        <Champ label="Délai" className="md:order-5 md:w-14">
          <NumberField
            ariaLabel={`Délai avant dump du token ${numero} en minutes`}
            dataChamp="delai"
            dataLigne={ligne.cle}
            value={ligne.delay}
            onChange={(delay) => onChange(ligne.cle, { delay })}
          />
        </Champ>
      </div>

      {/* Rappel du réglage appliqué, utile quand le résultat surprend. */}
      <span className="sr-only">
        Objectif {strategy.objectif} %, perte appliquée{' '}
        {ligne.perteRug ?? strategy.perteRug} %.
        {row.result !== null && !ligne.pris
          ? ' Token non pris : son résultat ne compte pas.'
          : ''}
      </span>
    </div>
  )
}

/**
 * Le résultat d'une ligne.
 *
 * Un token écarté garde son chiffre, entre parenthèses et en gris : c'est ce
 * que le filtre a évité — ou laissé passer. L'effacer reviendrait à cacher la
 * seule information qui dit si le filtre sert à quelque chose.
 */
function Resultat({ row, pris }: { row: ReportRow; pris: boolean }) {
  const resultat = row.result
  if (resultat === null) return <span className="text-[15px] text-ink-3">—</span>

  const ton = !pris ? 'text-ink-3' : resultat.hit ? 'text-green' : 'text-red'

  return (
    <span className="text-right">
      <span className={cn('text-[15px] font-medium tabular-nums', ton)}>
        {pris ? formatSol(resultat.sol) : `(${formatSol(resultat.sol)})`}
      </span>
      <span className="hidden text-[12px] text-ink-3 tabular-nums md:ml-1.5 md:inline">
        {pris ? formatPercentExact(resultat.percent, { sign: true }) : 'non pris'}
      </span>
    </span>
  )
}

function CasePris({
  coche,
  numero,
  cle,
  onChange,
}: {
  coche: boolean
  numero: number
  cle: string
  onChange: (coche: boolean) => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={coche}
      aria-label={`Token ${numero} pris`}
      data-champ="pris"
      data-ligne={cle}
      onClick={() => onChange(!coche)}
      className={cn(
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border transition active:scale-90',
        coche
          ? 'border-green bg-green text-bg'
          : 'border-separator bg-card-2 text-transparent hover:border-ink-3',
      )}
    >
      <CheckIcon className="h-[13px] w-[13px]" />
    </button>
  )
}

function Champ({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex min-w-0 items-baseline gap-1 rounded-[8px] bg-card-2 px-2 py-1 text-[15px]',
        'md:block md:rounded-none md:bg-transparent md:px-0 md:py-0',
        className,
      )}
    >
      <span className="shrink-0 text-[11px] text-ink-3 md:hidden">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

/**
 * Le pied de tableau : ce que la journée a rapporté, et ce qu'elle aurait
 * rapporté en prenant tout. La seconde ligne n'apparaît que s'il y a
 * effectivement un écart — sinon c'est du bruit.
 */
export function TotalJour({
  netSol,
  netSolTout,
  nPris,
  n,
  strategy,
}: {
  netSol: number
  netSolTout: number
  nPris: number
  n: number
  strategy: Strategy
}) {
  const ecart = netSol - netSolTout
  const filtre = nPris < n

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-separator px-4 py-3 text-[13px]">
      <span className="text-ink-2">
        {nPris} {nPris > 1 ? 'tokens pris' : 'token pris'}
        {filtre ? <span className="text-ink-3"> sur {n} notés</span> : null}
      </span>
      <span className="text-ink-3">·</span>
      <span
        className={cn(
          'text-[15px] font-medium tabular-nums',
          netSol > 0 ? 'text-green' : netSol < 0 ? 'text-red' : 'text-ink-2',
        )}
      >
        {formatSol(netSol)}
      </span>

      {filtre ? (
        <span className="w-full text-ink-3 tabular-nums">
          En prenant tout : {formatSol(netSolTout)} · le filtre{' '}
          <span className={ecart >= 0 ? 'text-green' : 'text-red'}>
            {ecart >= 0 ? 'rapporte' : 'coûte'} {formatSol(Math.abs(ecart), { sign: false })}
          </span>
        </span>
      ) : (
        <span className="text-ink-3">
          objectif {formatPercent(strategy.objectif)}
        </span>
      )}
    </div>
  )
}
