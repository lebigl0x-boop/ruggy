'use client'

import type { ReportRow, Strategy } from '@/lib/compute'
import { formatPercent, formatPercentExact, formatSol } from '@/lib/format'
import type { Token, UpdateTokenPatch } from '@/lib/repo/types'
import { parsePerteToken } from '@/lib/validation'
import { cn } from '../ui/cn'
import { NumberField, TextField } from '../ui/field'
import { CloseIcon, PlusIcon } from '../ui/icons'

export function TokenTable({
  tokens,
  rows,
  strategy,
  onChange,
  onDelete,
  onAdd,
}: {
  tokens: Token[]
  rows: ReportRow[]
  strategy: Strategy
  onChange: (id: string, patch: UpdateTokenPatch) => void
  onDelete: (id: string) => void
  onAdd: () => void
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-4 text-[13px] tracking-wide text-ink-2 uppercase">
        Tokens
      </h2>

      <div className="overflow-hidden rounded-card bg-card">
        {/* En-têtes de colonnes : desktop seulement, les cartes mobiles ont
            leurs propres libellés. */}
        <div className="hidden items-center gap-3 border-b border-separator px-4 py-2 text-[12px] text-ink-2 md:flex">
          <span className="w-6 shrink-0">#</span>
          <span className="min-w-0 flex-1">Nom</span>
          <span className="w-16 shrink-0 text-right">Gain %</span>
          <span className="w-16 shrink-0 text-right">Perte %</span>
          <span className="w-16 shrink-0 text-right">Délai</span>
          <span className="w-24 shrink-0 text-right">Résultat</span>
          <span className="w-20 shrink-0 text-right">Cumul</span>
          <span className="w-7 shrink-0" />
        </div>

        {tokens.map((token, index) => (
          <TokenLigne
            key={token.id}
            token={token}
            index={index}
            row={rows[index] ?? { result: null, pris: true, cumulSol: null }}
            strategy={strategy}
            onChange={onChange}
            onDelete={onDelete}
          />
        ))}

        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-[17px] text-blue transition hover:bg-fill-2 active:bg-fill"
        >
          <PlusIcon className="h-[17px] w-[17px]" />
          Ajouter un token
        </button>
      </div>

      <p className="mt-2 px-4 text-[13px] text-ink-2">
        Laissez le gain vide tant que le token n’est pas analysé : il ne
        comptera pas dans le bilan. Au-dessus de l’objectif
        ({formatPercent(strategy.objectif)}) le gain compte à sa valeur réelle ;
        en dessous, c’est une perte. La perte laissée vide reprend celle du
        wallet ({formatPercent(strategy.perteRug)}).
      </p>
    </section>
  )
}

function TokenLigne({
  token,
  index,
  row,
  strategy,
  onChange,
  onDelete,
}: {
  token: Token
  index: number
  row: ReportRow
  strategy: Strategy
  onChange: (id: string, patch: UpdateTokenPatch) => void
  onDelete: (id: string) => void
}) {
  const resultat = row.result
  const ton = resultat === null ? '' : resultat.hit ? 'text-green' : 'text-red'

  return (
    <div
      className={cn(
        'group/ligne relative',
        // Séparateur fin, décalé à gauche comme dans les listes iOS.
        'after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px',
        'after:bg-separator after:content-[""]',
        // Mobile : carte empilée. Desktop : ligne de tableau.
        'px-4 py-3 md:flex md:items-center md:gap-3 md:py-2',
      )}
    >
      <span className="hidden w-6 shrink-0 text-[13px] text-ink-3 tabular-nums md:block">
        {index + 1}
      </span>

      {/* Nom — pleine largeur sur mobile, colonne souple sur desktop */}
      <div className="mb-2 flex items-center gap-2 md:mb-0 md:min-w-0 md:flex-1">
        <span className="w-6 shrink-0 text-[13px] text-ink-3 tabular-nums md:hidden">
          {index + 1}
        </span>
        <TextField
          ariaLabel={`Nom du token ${index + 1}`}
          value={token.name ?? ''}
          onChange={(value) => onChange(token.id, { name: value.trim() === '' ? null : value })}
          placeholder={`Token ${index + 1}`}
          className="text-[17px] md:text-[15px]"
        />
        {token.source === 'helius' ? (
          <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
            auto
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onDelete(token.id)}
          aria-label={`Supprimer le token ${index + 1}`}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-red active:scale-90 md:hidden"
        >
          <CloseIcon className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* Saisies — en grille sur mobile, en colonnes sur desktop */}
      <div className="grid grid-cols-3 gap-3 md:contents">
        <Champ label="Gain %" className="md:w-16 md:shrink-0">
          <NumberField
            ariaLabel={`Gain du token ${index + 1} en pourcentage`}
            value={token.gain}
            onChange={(value) => onChange(token.id, { gain: value })}
          />
        </Champ>

        <Champ label="Perte %" className="md:w-16 md:shrink-0">
          <NumberField
            ariaLabel={`Perte du token ${index + 1} en pourcentage`}
            value={token.perteRug}
            placeholder={String(strategy.perteRug).replace('.', ',')}
            normalize={parsePerteToken}
            onChange={(value) => onChange(token.id, { perteRug: value })}
          />
        </Champ>

        <Champ label="Délai (min)" className="md:w-16 md:shrink-0">
          <NumberField
            ariaLabel={`Délai avant dump du token ${index + 1} en minutes`}
            value={token.delay}
            onChange={(value) => onChange(token.id, { delay: value })}
          />
        </Champ>
      </div>

      {/* Résultat calculé */}
      <div className="mt-3 flex items-baseline justify-between border-t border-separator pt-2 md:mt-0 md:w-24 md:shrink-0 md:flex-col md:items-end md:justify-center md:border-0 md:pt-0">
        <span className="text-[13px] text-ink-2 md:hidden">Résultat</span>
        {resultat === null ? (
          <span className="text-[15px] text-ink-3">—</span>
        ) : (
          <span className="text-right">
            <span className={cn('text-[15px] font-medium tabular-nums', ton)}>
              {formatSol(resultat.sol)}
            </span>
            <span className="block text-[12px] text-ink-2 tabular-nums">
              {formatPercentExact(resultat.percent, { sign: true })}
              {/* Sur mobile il n'y a pas de colonne Cumul : on l'ajoute ici. */}
              <span className="md:hidden">
                {' · cumul '}
                {formatSol(row.cumulSol ?? 0)}
              </span>
            </span>
          </span>
        )}
      </div>

      <div className="hidden w-20 shrink-0 text-right text-[13px] text-ink-2 tabular-nums md:block">
        {row.cumulSol === null ? '—' : formatSol(row.cumulSol)}
      </div>

      <button
        type="button"
        onClick={() => onDelete(token.id)}
        aria-label={`Supprimer le token ${index + 1}`}
        className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 opacity-0 transition hover:bg-fill hover:text-red focus-visible:opacity-100 active:scale-90 group-hover/ligne:opacity-100 md:flex"
      >
        <CloseIcon className="h-[15px] w-[15px]" />
      </button>

      {/* Rappel du réglage appliqué, utile quand le résultat surprend. */}
      <span className="sr-only">
        Objectif {strategy.objectif} %, perte appliquée{' '}
        {token.perteRug ?? strategy.perteRug} %.
      </span>
    </div>
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
    <div className={className}>
      <span className="mb-0.5 block text-[12px] text-ink-2 md:hidden">{label}</span>
      <div className="rounded-[8px] bg-card-2 px-2 py-1.5 transition-colors focus-within:bg-fill md:bg-transparent md:px-1.5 md:hover:bg-card-2 md:focus-within:bg-fill">
        {children}
      </div>
    </div>
  )
}
