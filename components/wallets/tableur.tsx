'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { formatPercent, formatSol, shortAddress } from '@/lib/format'
import {
  trierLignes,
  type ColonnePortefeuille,
  type LigneWallet,
  type Tri,
} from '@/lib/portefeuille'
import type { WalletStatus } from '@/lib/repo/types'
import { SEGMENTS, SEGMENT_LABELS, type Segment } from '@/lib/summary'
import { AddWalletSheet } from './add-wallet-sheet'
import { cn } from '../ui/cn'
import { PlusIcon, PortefeuilleIcon, SearchIcon } from '../ui/icons'
import { Segmented } from '../ui/segmented'
import { StatusBadge } from '../ui/status-badge'
import { TagBadge } from '../ui/tag-badge'

/**
 * Tous les wallets, en tableau.
 *
 * Pour comparer, rien ne bat un tableau : toutes les colonnes visibles d'un
 * coup, triables, à une ligne par wallet. C'est l'écran qu'on ouvre pour
 * décider, pas pour consulter.
 */

const EN_TETES: readonly {
  colonne: ColonnePortefeuille
  label: string
  aDroite?: boolean
  /** Colonnes masquées sur petit écran, par ordre d'importance décroissant. */
  classe?: string
}[] = [
  { colonne: 'label', label: 'Wallet' },
  { colonne: 'status', label: 'État' },
  { colonne: 'n', label: 'Tokens', aDroite: true },
  { colonne: 'taux', label: 'Objectif', aDroite: true, classe: 'hidden sm:table-cell' },
  { colonne: 'joursObserves', label: 'Jours', aDroite: true, classe: 'hidden md:table-cell' },
  { colonne: 'netSol', label: 'Net', aDroite: true },
]

const STATUT_DU_SEGMENT: Record<Exclude<Segment, 'tous'>, WalletStatus> = {
  screening: 'screening',
  test: 'test',
  valides: 'valide',
  ecartes: 'rejete',
}

/** Recherche insensible à la casse et aux accents. */
function normalise(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function Tableur({ lignes }: { lignes: readonly LigneWallet[] }) {
  const [tri, setTri] = useState<Tri>({ colonne: 'netSol', sens: 'desc' })
  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState<Segment>('tous')
  const [ajoutOuvert, setAjoutOuvert] = useState(false)

  const visibles = useMemo(() => {
    const terme = normalise(query)
    const filtrees = lignes.filter((ligne) => {
      if (segment !== 'tous' && ligne.status !== STATUT_DU_SEGMENT[segment]) {
        return false
      }
      if (terme === '') return true
      return (
        normalise(ligne.label).includes(terme) ||
        normalise(ligne.address).includes(terme)
      )
    })
    return trierLignes(filtrees, tri)
  }, [lignes, query, segment, tri])

  function trierPar(colonne: ColonnePortefeuille) {
    setTri((courant) =>
      courant.colonne === colonne
        ? { colonne, sens: courant.sens === 'desc' ? 'asc' : 'desc' }
        : // Un nom se lit de A à Z, un chiffre du plus gros au plus petit.
          { colonne, sens: colonne === 'label' ? 'asc' : 'desc' },
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] max-w-[340px] flex-1 items-center gap-2 rounded-full bg-fill px-3.5 py-1.5 transition focus-within:bg-hi">
          <SearchIcon className="h-[15px] w-[15px] shrink-0 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom ou adresse"
            aria-label="Rechercher un wallet"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <button
          type="button"
          onClick={() => setAjoutOuvert(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition hover:bg-white active:scale-95"
        >
          <PlusIcon className="h-[15px] w-[15px]" />
          Ajouter
        </button>

        <div className="order-last w-full overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto sm:min-w-[320px] [&::-webkit-scrollbar]:hidden">
          <div className="min-w-[320px]">
            <Segmented
              ariaLabel="Filtrer les wallets"
              options={SEGMENTS.map((value) => ({
                value,
                label: SEGMENT_LABELS[value],
              }))}
              value={segment}
              onChange={setSegment}
            />
          </div>
        </div>
      </div>

      <section className="pointille overflow-hidden rounded-card border border-separator bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">
              {visibles.length} wallets, triés par{' '}
              {EN_TETES.find((e) => e.colonne === tri.colonne)?.label} en ordre{' '}
              {tri.sens === 'asc' ? 'croissant' : 'décroissant'}.
            </caption>
            <thead>
              <tr className="border-b border-separator bg-card-2">
                {EN_TETES.map((entete) => (
                  <th
                    key={entete.colonne}
                    scope="col"
                    aria-sort={
                      tri.colonne === entete.colonne
                        ? tri.sens === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className={cn(
                      'px-4 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase whitespace-nowrap',
                      // Le nom prend tout l'espace restant ; les colonnes de
                      // chiffres se serrent sur leur contenu. Sans ça, six
                      // colonnes se répartissent 1500 px à parts égales et
                      // l'œil traverse l'écran pour lire une ligne.
                      entete.colonne === 'label' ? 'w-full' : 'w-px',
                      entete.aDroite ? 'text-right' : 'text-left',
                      entete.classe,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => trierPar(entete.colonne)}
                      className={cn(
                        'inline-flex items-center gap-1 transition hover:text-ink',
                        tri.colonne === entete.colonne && 'font-medium text-ink',
                      )}
                    >
                      {entete.label}
                      <span aria-hidden className="text-[9px]">
                        {tri.colonne === entete.colonne
                          ? tri.sens === 'asc'
                            ? '▲'
                            : '▼'
                          : ''}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((ligne) => (
                <Ligne key={ligne.id} ligne={ligne} />
              ))}
            </tbody>
          </table>
        </div>

        {visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14px] text-ink-2">
            {lignes.length === 0
              ? 'Aucun wallet pour l’instant. Touchez « Ajouter » pour commencer.'
              : 'Aucun wallet ne correspond.'}
          </p>
        ) : null}
      </section>

      <p className="px-1 text-[12px] text-ink-3">
        Le net affiché est celui du relevé de test dès qu’il a commencé, sinon
        celui de l’échantillon de screening. Les deux ne s’additionnent jamais.
      </p>

      <AddWalletSheet
        open={ajoutOuvert}
        onClose={() => setAjoutOuvert(false)}
        adressesExistantes={lignes.map((ligne) => ligne.address)}
      />
    </div>
  )
}

function Ligne({ ligne }: { ligne: LigneWallet }) {
  // L'avancement se lit dans la colonne de la phase en cours : les tokens
  // notés pendant le screening, les journées observées pendant le test.
  const enScreening = ligne.status === 'screening'
  const enTest = ligne.status === 'test'

  return (
    <tr className="group border-b border-separator transition last:border-b-0 hover:bg-fill-2">
      <td className="px-4 py-2">
        <Link href={`/wallets/${ligne.id}`} className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-fill text-ink-2"
          >
            <PortefeuilleIcon className="h-[14px] w-[14px]" />
          </span>
          <span className="truncate rounded-full bg-fill px-3 py-1 text-[12px] font-semibold tracking-[0.015em] uppercase transition group-hover:bg-hi">
            {ligne.label}
          </span>
          <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 sm:inline">
            {shortAddress(ligne.address)}
          </span>
        </Link>
      </td>

      <td className="px-4 py-2 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <StatusBadge status={ligne.status} />
          <TagBadge tag={ligne.tag} className="hidden lg:inline-flex" />
        </div>
      </td>

      <td className="px-4 py-2 text-right whitespace-nowrap text-ink-2 tabular-nums">
        <span>
          {ligne.n}
          {ligne.nPris < ligne.n ? (
            <span className="text-ink-3"> ({ligne.nPris})</span>
          ) : null}
        </span>
        {enScreening ? (
          <Jauge fait={ligne.n} plancher={ligne.seuilAnalyse} />
        ) : null}
      </td>

      <td className="hidden px-4 py-2 text-right whitespace-nowrap text-ink-2 tabular-nums sm:table-cell">
        {ligne.n > 0 ? formatPercent(ligne.taux) : '—'}
      </td>

      <td className="hidden px-4 py-2 text-right whitespace-nowrap text-ink-2 tabular-nums md:table-cell">
        {enTest || ligne.joursObserves > 0 ? ligne.joursObserves : '—'}
        {enTest ? (
          <Jauge fait={ligne.joursObserves} plancher={ligne.joursMinimum} />
        ) : null}
      </td>

      <td className="px-4 py-2 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <span
            className={cn(
              'text-[14px] font-semibold tabular-nums',
              ligne.n === 0
                ? 'text-ink-3'
                : ligne.netSol > 0
                  ? 'text-green'
                  : ligne.netSol < 0
                    ? 'text-red'
                    : 'text-ink-2',
            )}
          >
            {ligne.n > 0 ? formatSol(ligne.netSol) : '—'}
          </span>
          {/* Le seul point coloré de la ligne : une décision attend. */}
          {ligne.verdictDisponible ? (
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full bg-orange"
              title="Le test peut être conclu"
            />
          ) : (
            <span aria-hidden className="h-[7px] w-[7px] shrink-0" />
          )}
        </div>
      </td>
    </tr>
  )
}

/**
 * L'avancement vers le plancher de la phase, sous le chiffre qu'il complète.
 *
 * Elle se remplit en ocre une fois le plancher atteint : c'est le moment où
 * le wallet réclame une décision, et la couleur n'est utilisée que pour ça.
 */
function Jauge({ fait, plancher }: { fait: number; plancher: number }) {
  if (plancher <= 0) return null
  const part = Math.min(1, fait / plancher)

  return (
    <span
      // Largeur fixe : calée sur le chiffre, la barre se réduirait à un trait
      // pour « 2 » et deviendrait incomparable d'une ligne à l'autre.
      className="mt-1.5 ml-auto block h-[3px] w-[56px] overflow-hidden rounded-full bg-hi"
      title={`${fait} sur ${plancher}`}
    >
      <span
        className={cn(
          'block h-full rounded-full',
          part >= 1 ? 'bg-orange' : 'bg-ink-3',
        )}
        style={{ width: `${part * 100}%` }}
      />
    </span>
  )
}
