'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import { formatDateFr, formatSol, shortAddress } from '@/lib/format'
import {
  SEGMENTS,
  SEGMENT_LABELS,
  filterWallets,
  type Segment,
  type WalletSummary,
} from '@/lib/summary'
import { AddWalletSheet } from './add-wallet-sheet'
import { cn } from '../ui/cn'
import { ChevronRightIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { Segmented } from '../ui/segmented'
import { StatusBadge } from '../ui/status-badge'
import { TagBadge } from '../ui/tag-badge'

export function WalletListPanel({
  wallets,
  journeesAFaire,
}: {
  wallets: WalletSummary[]
  /** Journées de test en attente de relevé, tous wallets confondus. */
  journeesAFaire: number
}) {
  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState<Segment>('tous')
  const [ajoutOuvert, setAjoutOuvert] = useState(false)

  const params = useParams<{ id?: string }>()
  const selection = params?.id

  const visibles = useMemo(
    () => filterWallets(wallets, { query, segment }),
    [wallets, query, segment],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-separator bg-nav px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">Ruggers</h1>
          <button
            type="button"
            onClick={() => setAjoutOuvert(true)}
            aria-label="Ajouter un wallet"
            className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full text-blue transition hover:bg-fill active:scale-90"
          >
            <PlusIcon className="h-[22px] w-[22px]" />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-1.5 rounded-[10px] bg-fill px-2.5 py-1.5 transition focus-within:bg-fill-2">
          <SearchIcon className="h-[17px] w-[17px] shrink-0 text-ink-2" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom ou adresse"
            aria-label="Rechercher un wallet"
            className="w-full bg-transparent text-[17px] outline-none placeholder:text-ink-2 [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== '' ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Effacer la recherche"
              className="shrink-0 text-ink-3 transition hover:text-ink-2"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden
                className="h-[17px] w-[17px]"
                fill="currentColor"
              >
                <circle cx="10" cy="10" r="8" />
                <path
                  d="M7 7 L13 13 M13 7 L7 13"
                  stroke="var(--c-fill)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        <Segmented
          ariaLabel="Filtrer les wallets"
          options={SEGMENTS.map((value) => ({ value, label: SEGMENT_LABELS[value] }))}
          value={segment}
          onChange={setSegment}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {journeesAFaire > 0 ? (
          <Link
            href="/aujourdhui"
            className="mb-4 flex items-center gap-3 rounded-card bg-card px-4 py-3 transition hover:bg-fill-2 active:bg-fill"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-medium">Ce matin</span>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                {journeesAFaire} {journeesAFaire > 1 ? 'journées' : 'journée'} à
                relever
              </span>
            </span>
            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-blue px-1.5 text-[13px] font-semibold text-white tabular-nums">
              {journeesAFaire}
            </span>
            <ChevronRightIcon className="-mr-1 h-[15px] w-[15px] shrink-0 text-ink-3" />
          </Link>
        ) : null}

        {visibles.length === 0 ? (
          <p className="mt-10 text-center text-[15px] text-ink-2">
            {wallets.length === 0
              ? 'Aucun wallet pour l’instant. Touchez + pour en ajouter un.'
              : 'Aucun wallet ne correspond.'}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-card bg-card">
            {visibles.map((wallet, index) => (
              <li key={wallet.id}>
                <WalletRow
                  wallet={wallet}
                  actif={wallet.id === selection}
                  dernier={index === visibles.length - 1}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddWalletSheet
        open={ajoutOuvert}
        onClose={() => setAjoutOuvert(false)}
        adressesExistantes={wallets.map((w) => w.address)}
      />
    </div>
  )
}

function WalletRow({
  wallet,
  actif,
  dernier,
}: {
  wallet: WalletSummary
  actif: boolean
  /** La dernière ligne d'une carte ne porte pas de séparateur. */
  dernier: boolean
}) {
  const positif = wallet.netSol > 0
  const negatif = wallet.netSol < 0

  return (
    <Link
      href={`/wallets/${wallet.id}`}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 transition',
        'active:bg-fill',
        !dernier &&
          'after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-separator after:content-[""]',
        actif ? 'bg-fill-2' : 'hover:bg-fill-2',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[17px] font-medium">{wallet.label}</span>
          {/* Un seul badge par ligne : en screening c'est le tag qui informe,
              ensuite c'est la place dans l'entonnoir. */}
          {wallet.status === 'screening' ? (
            <TagBadge
              tag={wallet.tag}
              detail={
                wallet.tag === 'À compléter'
                  ? `${wallet.n}/${wallet.seuilAnalyse}`
                  : undefined
              }
            />
          ) : (
            <StatusBadge
              status={wallet.status}
              detail={
                wallet.status === 'test'
                  ? `j${wallet.joursObserves}/${wallet.joursMinimum}`
                  : undefined
              }
            />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-2">
          <span className="font-mono">{shortAddress(wallet.address)}</span>
          <span aria-hidden>·</span>
          <span>{formatDateFr(wallet.analyzedAt)}</span>
        </div>
      </div>

      <span
        className={cn(
          'shrink-0 text-[15px] font-medium tabular-nums',
          positif ? 'text-green' : negatif ? 'text-red' : 'text-ink-2',
        )}
      >
        {formatSol(wallet.netSol)}
      </span>

      {/* Indicateur de navigation : sur desktop, c'est la sélection qui l'indique. */}
      <ChevronRightIcon className="-mr-1 h-[15px] w-[15px] shrink-0 text-ink-3 md:hidden" />
    </Link>
  )
}
