'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { saveDayAction } from '@/app/actions'
import {
  LignesJour,
  TotalJour,
  type LigneJour,
  type PatchLigne,
} from '@/components/jour/lignes-jour'
import { computeWalletReport, type Strategy } from '@/lib/compute'
import { formatDayFr, formatSol, shortAddress } from '@/lib/format'
import { parseSaisie } from '@/lib/saisie'
import { cn } from '../ui/cn'
import { CheckIcon, ChevronRightIcon } from '../ui/icons'
import {
  cleBrouillon,
  compterBrouillons,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
} from './brouillons'

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
  | {
      kind: 'enregistre'
      tokens: number
      ecartes: number
      pnlSol: number
      inactif: boolean
    }
  | { kind: 'erreur'; message: string }

/**
 * Le relevé du matin.
 *
 * Une seule journée est ouverte à la fois : relever dix journées dépliées
 * côte à côte, c'est un écran qu'on parcourt au lieu d'une file qu'on
 * traite. Les autres tiennent sur une ligne, et la suivante s'ouvre d'elle-même
 * une fois la précédente validée.
 *
 * Une journée se relève en deux temps : on jette la journée entière dans le
 * champ du haut — c'est ce qui va vite —, puis on décoche dans le tableau les
 * tokens que le filtre d'entrée n'aurait pas pris.
 */
export function FileDuMatin({
  entrees,
  ouvrir,
}: {
  entrees: readonly EntreeMatin[]
  /**
   * Wallet sur lequel ouvrir la file.
   *
   * On arrive souvent ici depuis la page d'un wallet précis : s'ouvrir sur
   * le premier venu donne l'impression d'avoir été redirigé ailleurs.
   */
  ouvrir?: string
}) {
  const [etats, setEtats] = useState<Record<string, EtatEntree>>({})
  const [brouillons, setBrouillons] = useState<Record<string, number>>({})
  // Rien à ouvrir côté serveur : la première journée fait l'affaire, et le
  // rendu reste identique des deux côtés.
  const [ouvert, setOuvert] = useState<string | null>(() => {
    const demande = entrees.find((entree) => entree.walletId === ouvrir)
    return demande ? cle(demande) : entrees.length > 0 ? cle(entrees[0]!) : null
  })
  // Le focus ne part sur le champ qu'après une validation : à l'arrivée sur
  // la page, ouvrir le clavier d'autorité serait pénible sur mobile.
  const [focusAuto, setFocusAuto] = useState(false)

  const cles = useMemo(() => entrees.map(cle), [entrees])

  // Les brouillons vivent sur l'appareil : on ne peut les lire qu'une fois
  // l'écran monté, sinon le rendu serveur et le rendu client divergeraient.
  useEffect(() => {
    setBrouillons(compterBrouillons(cles))
  }, [cles])

  const faites = entrees.filter(
    (entree) => etats[cle(entree)]?.kind === 'enregistre',
  ).length
  const restantes = entrees.length - faites

  function enregistrer(
    entree: EntreeMatin,
    lignes: readonly LigneJour[],
    inactif: boolean,
  ) {
    const id = cle(entree)
    const retenues = inactif ? [] : lignes
    const report = computeWalletReport(retenues.map(toTokenInput), entree.strategy)

    // Optimiste : la file doit rester fluide même si l'écriture traîne.
    setEtats((courant) => ({
      ...courant,
      [id]: {
        kind: 'enregistre',
        tokens: retenues.length,
        ecartes: retenues.filter((ligne) => !ligne.pris).length,
        pnlSol: report.netSol,
        inactif: inactif || retenues.length === 0,
      },
    }))

    // On enchaîne sur la première journée encore à faire, sans attendre le
    // serveur : c'est ce qui fait de la file une file.
    const suivante = cles.find(
      (autre) => autre !== id && etats[autre]?.kind !== 'enregistre',
    )
    setOuvert(suivante ?? null)
    setFocusAuto(true)

    void saveDayAction({
      walletId: entree.walletId,
      day: entree.day,
      state: inactif ? 'inactif' : 'actif',
      tokens: retenues.map((ligne) => ({
        name: ligne.name,
        gain: ligne.gain,
        perteRug: ligne.perteRug,
        delay: ligne.delay,
        pris: ligne.pris,
      })),
    }).then((resultat) => {
      if (!resultat.ok) {
        // Le brouillon n'a pas été touché : rouvrir la carte suffit à
        // retrouver la saisie telle quelle.
        setEtats((courant) => ({
          ...courant,
          [id]: { kind: 'erreur', message: resultat.message },
        }))
        setOuvert(id)
        return
      }

      // La journée est en base, et seulement maintenant : effacer le
      // brouillon avant la confirmation perdrait la saisie sur un échec.
      effacerBrouillon(id)
      setBrouillons((courant) => {
        const suite = { ...courant }
        delete suite[id]
        return suite
      })
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
    // Une journée se saisit dans une colonne, pas sur toute la largeur d'un
    // écran : au-delà, le champ Nom fait mille pixels et l'œil traverse la
    // ligne pour atteindre la case « Pris ».
    <div className="max-w-[1000px]">
      {/* Avancement : avec les journées repliées, il reste visible sans
          avoir à remonter. */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-ink-2">
            {restantes === 0
              ? 'Tout est relevé.'
              : `${restantes} ${restantes > 1 ? 'journées' : 'journée'} à relever`}
          </span>
          <span className="text-ink-3 tabular-nums">
            {faites}/{entrees.length}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fill">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              restantes === 0 ? 'bg-green' : 'bg-ink-3',
            )}
            style={{ width: `${(faites / entrees.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {entrees.map((entree) => {
          const id = cle(entree)
          const etat = etats[id] ?? { kind: 'a-faire' as const }

          if (etat.kind === 'enregistre') {
            return <CarteFaite key={id} entree={entree} etat={etat} />
          }

          if (ouvert !== id) {
            return (
              <CarteRepliee
                key={id}
                entree={entree}
                lignes={brouillons[id] ?? 0}
                erreur={etat.kind === 'erreur' ? etat.message : null}
                onOuvrir={() => {
                  setOuvert(id)
                  setFocusAuto(false)
                }}
              />
            )
          }

          return (
            <CarteJournee
              key={id}
              entree={entree}
              erreur={etat.kind === 'erreur' ? etat.message : null}
              autoFocus={focusAuto}
              onBrouillon={(nb) =>
                setBrouillons((courant) =>
                  courant[id] === nb ? courant : { ...courant, [id]: nb },
                )
              }
              onReplier={() => setOuvert(null)}
              onValider={(lignes) => enregistrer(entree, lignes, false)}
              onInactif={() => enregistrer(entree, [], true)}
            />
          )
        })}
      </div>
    </div>
  )
}

function cle(entree: EntreeMatin): string {
  return cleBrouillon(entree.walletId, entree.day)
}

/** Une ligne de saisie, réduite à ce dont le calcul a besoin. */
function toTokenInput(ligne: LigneJour) {
  return {
    gain: ligne.gain,
    perteRug: ligne.perteRug,
    delay: ligne.delay,
    pris: ligne.pris,
  }
}

/** L'en-tête commun à toutes les cartes : qui, quel jour. */
function Entete({
  entree,
  children,
}: {
  entree: EntreeMatin
  children?: React.ReactNode
}) {
  return (
    <>
      <Link
        href={`/wallets/${entree.walletId}`}
        onClick={(event) => event.stopPropagation()}
        className="min-w-0 truncate text-[17px] font-semibold text-ink hover:underline"
      >
        {entree.label}
      </Link>
      <span className="hidden shrink-0 font-mono text-[12px] text-ink-3 sm:inline">
        {shortAddress(entree.address)}
      </span>
      <span className="ml-auto shrink-0 text-[13px] text-ink-2">
        {formatDayFr(entree.day)}
      </span>
      {children}
    </>
  )
}

function CarteFaite({
  entree,
  etat,
}: {
  entree: EntreeMatin
  etat: Extract<EtatEntree, { kind: 'enregistre' }>
}) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-card px-4 py-2.5">
      <CheckIcon className="h-[15px] w-[15px] shrink-0 text-green" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">
        {entree.label} · {formatDayFr(entree.day)}
      </span>
      <span className="shrink-0 text-[13px] text-ink-2 tabular-nums">
        {etat.inactif ? (
          'inactif'
        ) : (
          <>
            {etat.tokens} tokens
            {etat.ecartes > 0 ? (
              <span className="text-ink-3"> · {etat.ecartes} écartés</span>
            ) : null}{' '}
            ·{' '}
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

function CarteRepliee({
  entree,
  lignes,
  erreur,
  onOuvrir,
}: {
  entree: EntreeMatin
  lignes: number
  erreur: string | null
  onOuvrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="flex w-full items-center gap-2 rounded-card bg-card px-4 py-3 text-left transition hover:bg-fill-2 active:bg-fill"
    >
      <ChevronRightIcon className="h-[15px] w-[15px] shrink-0 text-ink-3" />
      <Entete entree={entree}>
        {lignes > 0 ? (
          <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
            brouillon · {lignes}
          </span>
        ) : null}
        {erreur !== null ? (
          <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-red">
            échec
          </span>
        ) : null}
      </Entete>
    </button>
  )
}

function CarteJournee({
  entree,
  erreur,
  autoFocus,
  onBrouillon,
  onReplier,
  onValider,
  onInactif,
}: {
  entree: EntreeMatin
  erreur: string | null
  autoFocus: boolean
  onBrouillon: (lignes: number) => void
  onReplier: () => void
  onValider: (lignes: readonly LigneJour[]) => void
  onInactif: () => void
}) {
  const id = cleBrouillon(entree.walletId, entree.day)
  const [saisie, setSaisie] = useState('')
  const [lignes, setLignes] = useState<LigneJour[]>([])
  const champ = useRef<HTMLTextAreaElement | null>(null)
  // Le parent recrée son rappel à chaque rendu : on le garde dans une
  // référence pour que l'effet d'écriture ne dépende que de la saisie.
  const signaler = useRef(onBrouillon)
  signaler.current = onBrouillon
  // Les clés ne servent qu'à React : un compteur suffit, et il reste stable
  // d'un rendu à l'autre contrairement à un identifiant tiré au hasard.
  const compteur = useRef(0)
  // Tant que le brouillon n'est pas relu, on n'écrit pas : sans ce garde-fou,
  // le premier rendu (vide) effacerait ce qu'on vient d'ouvrir.
  const relu = useRef(false)

  useEffect(() => {
    const brouillon = lireBrouillon(id)
    if (brouillon !== null) {
      setSaisie(brouillon.saisie)
      setLignes(brouillon.lignes)
      // Les clés du brouillon sont déjà prises : on repart au-dessus.
      compteur.current = brouillon.lignes.length
    }
    relu.current = true
  }, [id])

  // Le brouillon suit la saisie, frappe après frappe. C'est ce qui permet de
  // partir voir un wallet et de revenir sans rien perdre.
  useEffect(() => {
    if (!relu.current) return
    ecrireBrouillon(id, { saisie, lignes })
    signaler.current(lignes.length)
  }, [id, saisie, lignes])

  useEffect(() => {
    if (autoFocus) champ.current?.focus()
  }, [autoFocus])

  // L'aperçu se recalcule à la frappe : on voit ce que l'app a compris avant
  // d'ajouter au tableau. C'est ce qui permet d'aller vite sans se tromper.
  const lu = useMemo(() => parseSaisie(saisie), [saisie])

  const report = useMemo(
    () => computeWalletReport(lignes.map(toTokenInput), entree.strategy),
    [lignes, entree.strategy],
  )

  function nouvelleCle(): string {
    compteur.current += 1
    return `l${compteur.current}`
  }

  /** Verse la saisie libre dans le tableau, puis vide le champ. */
  function verser() {
    if (lu.tokens.length === 0) return
    setLignes((courantes) => [
      ...courantes,
      ...lu.tokens.map((token) => ({
        cle: nouvelleCle(),
        name: token.name,
        gain: token.gain,
        perteRug: token.perteRug,
        delay: token.delay,
        pris: token.pris,
      })),
    ])
    setSaisie('')
    champ.current?.focus()
  }

  function majLigne(cleLigne: string, patch: PatchLigne) {
    setLignes((courantes) =>
      courantes.map((ligne) =>
        ligne.cle === cleLigne ? { ...ligne, ...patch } : ligne,
      ),
    )
  }

  function ajouterLigne() {
    setLignes((courantes) => [
      ...courantes,
      {
        cle: nouvelleCle(),
        name: null,
        gain: null,
        perteRug: null,
        delay: null,
        pris: true,
      },
    ])
  }

  function supprimerLigne(cleLigne: string) {
    setLignes((courantes) => courantes.filter((ligne) => ligne.cle !== cleLigne))
  }

  const vide = lignes.length === 0

  /**
   * ⌘↵ fait la seule chose sensée à l'endroit où on se trouve : verser la
   * saisie rapide si le champ en contient, valider la journée sinon. Posé
   * sur la carte entière, le raccourci marche depuis n'importe quelle
   * cellule du tableau — c'est là qu'on est quand on finit de saisir.
   */
  function auClavier(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    if (lu.tokens.length > 0) verser()
    else if (!vide) onValider(lignes)
  }

  return (
    // Pas d'`overflow-hidden` ici : il empêcherait la barre d'action de
    // coller au bas de l'écran. Les coins sont arrondis bloc par bloc.
    <section className="rounded-card bg-card" onKeyDown={auClavier}>
      <button
        type="button"
        onClick={onReplier}
        className="flex w-full items-center gap-2 rounded-t-card border-b border-separator px-4 py-3 text-left transition hover:bg-fill-2/50"
      >
        <ChevronRightIcon className="h-[15px] w-[15px] shrink-0 rotate-90 text-ink-3" />
        <Entete entree={entree} />
      </button>

      <div className="border-b border-separator px-4 py-3">
        <textarea
          ref={champ}
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          rows={2}
          inputMode="text"
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="120  x3  -80  BONK 45 5m"
          aria-label={`Tokens de ${entree.label} le ${formatDayFr(entree.day)}`}
          className="w-full resize-y rounded-[10px] bg-card-2 px-3 py-2.5 font-mono text-[15px] text-ink placeholder:font-sans placeholder:text-ink-3 focus:bg-fill focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {lu.tokens.length === 0 ? (
            <p className="text-ink-3">
              Collez la journée entière : « −80 » pour un dump de 80 %, « x3 »
              pour un ×3, « ? » pour un token pas encore noté.
            </p>
          ) : (
            <button
              type="button"
              onClick={verser}
              className="font-medium text-ink transition hover:opacity-70 active:opacity-50"
            >
              Ajouter {lu.tokens.length}{' '}
              {lu.tokens.length > 1 ? 'tokens' : 'token'} au tableau
              <span className="ml-1.5 text-ink-3">⌘↵</span>
            </button>
          )}

          {lu.ignores.length > 0 ? (
            <span className="w-full text-orange">
              Non compris : {lu.ignores.join(' ')}
            </span>
          ) : null}
          {lu.tronque ? (
            <span className="w-full text-orange">
              Saisie trop longue : le surplus a été coupé.
            </span>
          ) : null}
        </div>
      </div>

      {vide ? (
        <p className="border-b border-separator px-4 py-6 text-center text-[13px] text-ink-3">
          Aucun token pour l’instant. Collez la journée ci-dessus, ou ajoutez
          les lignes une par une.
        </p>
      ) : null}

      <LignesJour
        lignes={lignes}
        rows={report.rows}
        strategy={entree.strategy}
        onChange={majLigne}
        onDelete={supprimerLigne}
        onAdd={ajouterLigne}
      />

      {vide ? null : (
        <TotalJour
          netSol={report.netSol}
          netSolTout={report.netSolTout}
          nPris={report.nPris}
          n={report.n}
          strategy={entree.strategy}
        />
      )}

      {erreur !== null ? (
        <p className="border-t border-separator px-4 py-2.5 text-[13px] text-red">
          {erreur}
        </p>
      ) : null}

      {/* Barre d'action collante : sur une journée à quinze tokens, « Valider »
          doit rester sous le pouce sans avoir à dérouler jusqu'en bas. */}
      <div className="sticky bottom-0 flex rounded-b-card border-t border-separator bg-card/90 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => onValider(lignes)}
          disabled={vide}
          className={cn(
            'flex-1 rounded-bl-card px-4 py-3 text-[17px] transition',
            vide
              ? 'cursor-not-allowed text-ink-3'
              : 'font-medium text-ink hover:bg-fill-2 active:bg-fill',
          )}
        >
          Valider la journée
          <span className="ml-1.5 text-[13px] text-ink-3">⌘↵</span>
        </button>

        <button
          type="button"
          onClick={onInactif}
          className="flex-1 rounded-br-card border-l border-separator px-4 py-3 text-[17px] text-ink-2 transition hover:bg-fill-2 active:bg-fill"
        >
          Inactif
        </button>
      </div>
    </section>
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
