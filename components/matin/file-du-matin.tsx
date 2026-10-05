'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { saveDayAction } from '@/app/actions'
import { computeWalletReport, type Strategy } from '@/lib/compute'
import { formatDayFr, formatSol, shortAddress } from '@/lib/format'
import { parseSaisie } from '@/lib/saisie'
import { cn } from '../ui/cn'
import { CheckIcon } from '../ui/icons'

/** Une journée à relever, aplatie depuis la file du serveur. */
export type EntreeMatin = {
  walletId: string
  label: string
  address: string
  strategy: Strategy
  /** AAAA-MM-JJ */
  day: string
}

type EtatEntree =
  | { kind: 'a-faire' }
  | { kind: 'enregistre'; tokens: number; pnlSol: number; inactif: boolean }
  | { kind: 'erreur'; message: string }

/**
 * Le relevé du matin.
 *
 * Tout tient sur un écran et se fait au clavier : une file de journées, un
 * champ de texte libre par journée, et le focus qui saute tout seul à la
 * suivante. Saisir token par token dans un tableau coûterait dix fois plus de
 * temps pour la même information.
 */
export function FileDuMatin({ entrees }: { entrees: readonly EntreeMatin[] }) {
  const [etats, setEtats] = useState<Record<string, EtatEntree>>({})
  const champs = useRef<(HTMLTextAreaElement | null)[]>([])

  const cle = (entree: EntreeMatin) => `${entree.walletId}:${entree.day}`
  const restantes = entrees.filter(
    (entree) => (etats[cle(entree)]?.kind ?? 'a-faire') === 'a-faire',
  ).length

  function enregistrer(index: number, entree: EntreeMatin, saisie: string, inactif: boolean) {
    const id = cle(entree)
    const lu = parseSaisie(saisie)
    const report = computeWalletReport(lu.tokens, entree.strategy)

    // Optimiste : la file doit rester fluide même si l'écriture traîne.
    setEtats((courant) => ({
      ...courant,
      [id]: {
        kind: 'enregistre',
        tokens: inactif ? 0 : lu.tokens.length,
        pnlSol: inactif ? 0 : report.netSol,
        inactif: inactif || lu.tokens.length === 0,
      },
    }))

    // Le focus part sur la journée suivante sans attendre le serveur.
    champs.current[index + 1]?.focus()

    void saveDayAction({
      walletId: entree.walletId,
      day: entree.day,
      state: inactif ? 'inactif' : 'actif',
      saisie: inactif ? '' : saisie,
    }).then((resultat) => {
      if (!resultat.ok) {
        setEtats((courant) => ({
          ...courant,
          [id]: { kind: 'erreur', message: resultat.message },
        }))
      }
    })
  }

  if (entrees.length === 0) {
    return (
      <Vide
        titre="Rien à relever"
        detail="Aucune journée en attente. Les wallets en test réapparaîtront ici demain matin."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="px-4 text-[13px] text-ink-2">
        {restantes === 0
          ? 'Tout est relevé.'
          : `${restantes} ${restantes > 1 ? 'journées' : 'journée'} à relever.`}
      </p>

      {entrees.map((entree, index) => (
        <CarteJournee
          key={cle(entree)}
          entree={entree}
          etat={etats[cle(entree)] ?? { kind: 'a-faire' }}
          champRef={(element) => {
            champs.current[index] = element
          }}
          autoFocus={index === 0}
          onValider={(saisie) => enregistrer(index, entree, saisie, false)}
          onInactif={() => enregistrer(index, entree, '', true)}
        />
      ))}
    </div>
  )
}

function CarteJournee({
  entree,
  etat,
  champRef,
  autoFocus,
  onValider,
  onInactif,
}: {
  entree: EntreeMatin
  etat: EtatEntree
  champRef: (element: HTMLTextAreaElement | null) => void
  autoFocus: boolean
  onValider: (saisie: string) => void
  onInactif: () => void
}) {
  const [saisie, setSaisie] = useState('')
  const interne = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (autoFocus) interne.current?.focus()
  }, [autoFocus])

  // L'aperçu se recalcule à la frappe : on voit ce que l'app a compris avant
  // de valider. C'est ce qui permet d'aller vite sans se tromper.
  const apercu = useMemo(() => {
    const lu = parseSaisie(saisie)
    const report = computeWalletReport(lu.tokens, entree.strategy)
    return { lu, report }
  }, [saisie, entree.strategy])

  if (etat.kind === 'enregistre') {
    return (
      <div className="flex items-center gap-3 rounded-card bg-card px-4 py-3">
        <CheckIcon className="h-[15px] w-[15px] shrink-0 text-green" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">
          {entree.label} · {formatDayFr(entree.day)}
        </span>
        <span className="shrink-0 text-[13px] text-ink-2 tabular-nums">
          {etat.inactif ? (
            'inactif'
          ) : (
            <>
              {etat.tokens} tokens ·{' '}
              <span
                className={cn(
                  etat.pnlSol > 0 ? 'text-green' : etat.pnlSol < 0 ? 'text-red' : '',
                )}
              >
                {formatSol(etat.pnlSol)}
              </span>
            </>
          )}
        </span>
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-card bg-card">
      <div className="flex items-baseline gap-2 border-b border-separator px-4 py-3">
        <Link
          href={`/wallets/${entree.walletId}`}
          className="min-w-0 truncate text-[17px] font-semibold text-ink hover:text-blue"
        >
          {entree.label}
        </Link>
        <span className="shrink-0 font-mono text-[12px] text-ink-3">
          {shortAddress(entree.address)}
        </span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-2">
          {formatDayFr(entree.day)}
        </span>
      </div>

      <div className="px-4 py-3">
        <textarea
          ref={(element) => {
            interne.current = element
            champRef(element)
          }}
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              onValider(saisie)
            }
          }}
          rows={2}
          inputMode="text"
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="120  x3  -80  BONK 45 5m"
          aria-label={`Tokens de ${entree.label} le ${formatDayFr(entree.day)}`}
          className="w-full resize-y rounded-[10px] bg-card-2 px-3 py-2.5 font-mono text-[15px] text-ink placeholder:font-sans placeholder:text-ink-3 focus:bg-fill focus:outline-none"
        />

        <Apercu
          tokens={apercu.lu.tokens.length}
          hits={apercu.report.hits}
          notes={apercu.report.n}
          pnlSol={apercu.report.netSol}
          ignores={apercu.lu.ignores}
          tronque={apercu.lu.tronque}
        />
      </div>

      {etat.kind === 'erreur' ? (
        <p className="border-t border-separator px-4 py-2.5 text-[13px] text-red">
          {etat.message}
        </p>
      ) : null}

      <div className="flex border-t border-separator">
        <button
          type="button"
          onClick={() => onValider(saisie)}
          disabled={apercu.lu.tokens.length === 0}
          className={cn(
            'flex-1 px-4 py-3 text-[17px] transition',
            apercu.lu.tokens.length === 0
              ? 'cursor-not-allowed text-ink-3'
              : 'font-medium text-blue hover:bg-fill-2 active:bg-fill',
          )}
        >
          Valider
          <span className="ml-1.5 text-[13px] text-ink-3">⌘↵</span>
        </button>

        <button
          type="button"
          onClick={onInactif}
          className="flex-1 border-l border-separator px-4 py-3 text-[17px] text-ink-2 transition hover:bg-fill-2 active:bg-fill"
        >
          Inactif
        </button>
      </div>
    </section>
  )
}

function Apercu({
  tokens,
  hits,
  notes,
  pnlSol,
  ignores,
  tronque,
}: {
  tokens: number
  hits: number
  notes: number
  pnlSol: number
  ignores: readonly string[]
  tronque: boolean
}) {
  if (tokens === 0) {
    return (
      <p className="mt-2 text-[13px] text-ink-3">
        Un nombre par token. « −80 » pour un dump de 80 %, « x3 » pour un ×3,
        « ? » pour un token pas encore noté.
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <span className="text-ink-2 tabular-nums">
        {tokens} {tokens > 1 ? 'tokens' : 'token'}
        {notes < tokens ? <span className="text-ink-3"> ({notes} notés)</span> : null}
      </span>
      <span className="text-ink-3">·</span>
      <span className="text-ink-2 tabular-nums">
        {hits} à l’objectif
      </span>
      <span className="text-ink-3">·</span>
      <span
        className={cn(
          'font-medium tabular-nums',
          pnlSol > 0 ? 'text-green' : pnlSol < 0 ? 'text-red' : 'text-ink-2',
        )}
      >
        {formatSol(pnlSol)}
      </span>

      {ignores.length > 0 ? (
        <span className="w-full text-orange">
          Non compris : {ignores.join(' ')}
        </span>
      ) : null}
      {tronque ? (
        <span className="w-full text-orange">
          Saisie trop longue : seuls les premiers tokens seront enregistrés.
        </span>
      ) : null}
    </div>
  )
}

function Vide({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className="rounded-card bg-card px-4 py-10 text-center">
      <p className="text-[17px] text-ink-2">{titre}</p>
      <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] text-ink-3">{detail}</p>
    </div>
  )
}
