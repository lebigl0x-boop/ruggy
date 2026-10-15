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
import { ecartEnJours } from '@/lib/jours'
import { cn } from '../ui/cn'
import { CheckIcon, ChevronRightIcon } from '../ui/icons'
import {
  cleBrouillon,
  compterBrouillons,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
} from './brouillons'

/** Où en est une journée de la fenêtre d'observation. */
export type EtatJournee = 'actif' | 'inactif' | 'ouvert' | 'manquante'

export type JourneeMatin = {
  /** AAAA-MM-JJ */
  day: string
  etat: EtatJournee
}

/** Un wallet en test, avec toute sa fenêtre d'observation. */
export type EntreeMatin = {
  walletId: string
  label: string
  address: string
  strategy: Strategy
  /** Du premier jour du test à aujourd'hui, relevé ou non. */
  journees: readonly JourneeMatin[]
  /** Ce qu'il reste à relever, jour en cours exclu, du plus ancien au plus récent. */
  aRelever: readonly string[]
  /** Le wallet a son plancher de journées : il attend un verdict, pas un relevé. */
  plancherAtteint: boolean
}

/** Ce qu'une journée validée depuis cet écran a laissé derrière elle. */
type Releve = {
  tokens: number
  ecartes: number
  pnlSol: number
  inactif: boolean
}

/**
 * Le relevé du matin.
 *
 * Un wallet, une carte. La carte porte sa fenêtre de test en bande de
 * journées : on y lit d'un coup d'œil ce qui est relevé, ce qui manque et où
 * en est le wallet, et on clique la journée qu'on veut saisir. C'est ce qui
 * remplace l'ancienne liste à plat, où une journée oubliée de la semaine
 * dernière avait exactement le même poids que celle d'hier.
 *
 * Une seule carte est ouverte à la fois : relever dix journées dépliées côte
 * à côte, c'est un écran qu'on parcourt au lieu d'une file qu'on traite. La
 * journée suivante s'ouvre d'elle-même une fois la précédente validée, et
 * quand un wallet n'a plus rien le wallet suivant prend la main.
 *
 * Une journée se relève en deux temps : on jette la journée entière dans le
 * champ du haut — c'est ce qui va vite —, puis on décoche dans le tableau les
 * tokens que le filtre d'entrée n'aurait pas pris.
 */
export function FileDuMatin({
  entrees,
  aujourdhui,
  ouvrir,
}: {
  entrees: readonly EntreeMatin[]
  /** La date du jour, décidée côté serveur : la bande s'arrête là. */
  aujourdhui: string
  /**
   * Wallet sur lequel ouvrir la file.
   *
   * On arrive souvent ici depuis la page d'un wallet précis : s'ouvrir sur
   * le premier venu donne l'impression d'avoir été redirigé ailleurs.
   */
  ouvrir?: string
}) {
  const [releves, setReleves] = useState<Record<string, Releve>>({})
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [brouillons, setBrouillons] = useState<Record<string, number>>({})
  /** La journée sélectionnée dans la bande, quand on en a choisi une. */
  const [choisi, setChoisi] = useState<Record<string, string>>({})
  const [ouvert, setOuvert] = useState<string | null>(() => {
    const demande = entrees.find((entree) => entree.walletId === ouvrir)
    return demande?.walletId ?? entrees[0]?.walletId ?? null
  })
  // Les journées saisissables, et elles seules : un brouillon n'a de sens que
  // là où un champ de saisie peut s'ouvrir.
  const cles = useMemo(
    () =>
      entrees.flatMap((entree) =>
        entree.journees
          .filter((journee) => aSaisir(journee.etat))
          .map((journee) => cleBrouillon(entree.walletId, journee.day)),
      ),
    [entrees],
  )

  // Les brouillons vivent sur l'appareil : on ne peut les lire qu'une fois
  // l'écran monté, sinon le rendu serveur et le rendu client divergeraient.
  useEffect(() => {
    setBrouillons(compterBrouillons(cles))
  }, [cles])

  /** Les journées qu'il reste à relever sur ce wallet, ici et maintenant. */
  function restantes(entree: EntreeMatin): string[] {
    return entree.aRelever.filter(
      (day) => releves[cleBrouillon(entree.walletId, day)] === undefined,
    )
  }

  /** La journée affichée par la carte : celle qu'on a choisie, sinon la plus ancienne qui manque. */
  function jourChoisi(entree: EntreeMatin): string {
    return choisi[entree.walletId] ?? restantes(entree)[0] ?? aujourdhui
  }

  /** L'état d'une journée, corrigé de ce qui vient d'être validé à l'écran. */
  function etatAffiche(entree: EntreeMatin, journee: JourneeMatin): EtatJournee {
    const releve = releves[cleBrouillon(entree.walletId, journee.day)]
    if (releve === undefined) return journee.etat
    return releve.inactif ? 'inactif' : 'actif'
  }

  const total = entrees.reduce((somme, entree) => somme + entree.aRelever.length, 0)
  const faites = total - entrees.reduce((somme, e) => somme + restantes(e).length, 0)
  const reste = total - faites

  function enregistrer(
    entree: EntreeMatin,
    day: string,
    lignes: readonly LigneJour[],
    inactif: boolean,
  ) {
    const id = cleBrouillon(entree.walletId, day)
    const retenues = inactif ? [] : lignes
    const report = computeWalletReport(retenues.map(toTokenInput), entree.strategy)

    // Optimiste : la file doit rester fluide même si l'écriture traîne.
    setReleves((courant) => ({
      ...courant,
      [id]: {
        tokens: retenues.length,
        ecartes: retenues.filter((ligne) => !ligne.pris).length,
        pnlSol: report.netSol,
        inactif: inactif || retenues.length === 0,
      },
    }))
    setErreurs((courant) => {
      const suite = { ...courant }
      delete suite[id]
      return suite
    })

    // On enchaîne sans attendre le serveur : c'est ce qui fait de la file une
    // file. D'abord la journée suivante du même wallet — on vide sa bande
    // avant de passer à un autre contexte —, puis le wallet suivant.
    const suivante = restantes(entree).find((autre) => autre !== day)
    if (suivante !== undefined) {
      setChoisi((courant) => ({ ...courant, [entree.walletId]: suivante }))
    } else {
      const suivant = entrees.find(
        (autre) =>
          autre.walletId !== entree.walletId && restantes(autre).length > 0,
      )
      setOuvert(suivant?.walletId ?? null)
    }

    void saveDayAction({
      walletId: entree.walletId,
      day,
      state: inactif ? 'inactif' : 'actif',
      tokens: retenues.map((ligne) => ({
        name: ligne.name,
        mint: ligne.mint,
        gain: ligne.gain,
        perteRug: ligne.perteRug,
        delay: ligne.delay,
        pris: ligne.pris,
      })),
    }).then((resultat) => {
      if (!resultat.ok) {
        // Le brouillon n'a pas été touché : rouvrir la journée suffit à
        // retrouver la saisie telle quelle.
        setReleves((courant) => {
          const suite = { ...courant }
          delete suite[id]
          return suite
        })
        setErreurs((courant) => ({ ...courant, [id]: resultat.message }))
        setOuvert(entree.walletId)
        setChoisi((courant) => ({ ...courant, [entree.walletId]: day }))
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
        detail="Aucune journée en retard. Celle d’aujourd’hui s’ouvrira ici demain matin — pour la noter au fil de l’eau, passez par la page du wallet."
      />
    )
  }

  return (
    // Une journée se saisit dans une colonne, pas sur toute la largeur d'un
    // écran : au-delà, le champ Nom fait mille pixels et l'œil traverse la
    // ligne pour atteindre la case « Pris ».
    <div className="max-w-[1000px]">
      {/* Avancement : avec les cartes repliées, il reste visible sans avoir
          à remonter. */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-ink-2">
            {reste === 0
              ? 'Tout est relevé.'
              : `${reste} ${reste > 1 ? 'journées' : 'journée'} à relever`}
          </span>
          <span className="text-ink-3 tabular-nums">
            {faites}/{total} faites
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fill">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              reste === 0 ? 'bg-green' : 'bg-ink-3',
            )}
            style={{ width: `${(faites / Math.max(total, 1)) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {entrees.map((entree) => {
          const journees = entree.journees.map((journee) => ({
            day: journee.day,
            etat: etatAffiche(entree, journee),
          }))
          const aFaire = restantes(entree)
          const day = jourChoisi(entree)
          const id = cleBrouillon(entree.walletId, day)

          if (aFaire.length === 0) {
            return (
              <CarteFaite
                key={entree.walletId}
                entree={entree}
                journees={journees}
                releves={releves}
              />
            )
          }

          if (ouvert !== entree.walletId) {
            return (
              <CarteRepliee
                key={entree.walletId}
                entree={entree}
                journees={journees}
                reste={aFaire.length}
                brouillons={brouillons}
                erreur={erreurs[id] ?? null}
                onOuvrir={() => setOuvert(entree.walletId)}
              />
            )
          }

          return (
            <CarteWallet
              key={entree.walletId}
              entree={entree}
              journees={journees}
              aujourdhui={aujourdhui}
              reste={aFaire.length}
              day={day}
              onReplier={() => setOuvert(null)}
              onChoisir={(autre) =>
                setChoisi((courant) => ({ ...courant, [entree.walletId]: autre }))
              }
            >
              <CarteJournee
                // La clé force un montage propre d'une journée à l'autre :
                // sans elle, le tableau de la précédente resterait à l'écran.
                key={id}
                entree={entree}
                day={day}
                aujourdhui={aujourdhui}
                erreur={erreurs[id] ?? null}
                onBrouillon={(nb) =>
                  setBrouillons((courant) =>
                    courant[id] === nb ? courant : { ...courant, [id]: nb },
                  )
                }
                onValider={(lignes) => enregistrer(entree, day, lignes, false)}
                onInactif={() => enregistrer(entree, day, [], true)}
              />
            </CarteWallet>
          )
        })}
      </div>
    </div>
  )
}

/** Une journée ouverte mais jamais remplie reste à saisir, comme une absente. */
function aSaisir(etat: EtatJournee): boolean {
  return etat === 'manquante' || etat === 'ouvert'
}

/** « hier », « il y a 4 jours » : de quand date la journée qu'on saisit. */
function retard(day: string, aujourdhui: string): string {
  const jours = ecartEnJours(day, aujourdhui)
  if (jours <= 0) return 'aujourd’hui'
  if (jours === 1) return 'hier'
  return `il y a ${jours} jours`
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

// ---------------------------------------------------------------------------
// La bande de journées
// ---------------------------------------------------------------------------

/**
 * La fenêtre de test d'un wallet, une pastille par jour.
 *
 * C'est à la fois le résumé et le sélecteur : on y voit ce qui manque et on
 * clique dessus pour le saisir. Une journée déjà relevée n'est pas cliquable
 * — la réécrire d'ici effacerait ses tokens, et les corrections à l'unité se
 * font depuis le tableau du wallet.
 *
 * Bornée à la fenêtre du test, elle tient sur une ligne au départ (quatre
 * journées) et reste lisible après trois semaines. Un calendrier mensuel
 * afficherait vingt-six cases mortes pour quatre utiles.
 */
function BandeJours({
  journees,
  aujourdhui,
  choisi,
  onChoisir,
}: {
  journees: readonly JourneeMatin[]
  aujourdhui: string
  /** La journée en cours de saisie, mise en avant. `null` sur une carte repliée. */
  choisi: string | null
  onChoisir?: (day: string) => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-1">
      {journees.map((journee) => {
        const saisissable = aSaisir(journee.etat)
        const actif = journee.day === choisi
        const libelle = `${formatDayFr(journee.day)} · ${LEGENDE[journee.etat]}`

        // Quatre états, quatre formes — et non quatre gris voisins : sur une
        // carte blanche, `bg-fill-2` et `bg-fill-2/50` étaient deux fois rien.
        // Le remplissage dit ce qu'il y a dedans, le trait dit si c'est fait,
        // et les pointillés — eux seuls — se cliquent.
        const classes = cn(
          'flex h-[30px] w-[32px] items-center justify-center rounded-[8px] text-[12px] tabular-nums transition',
          actif
            ? 'bg-ink font-medium text-bg'
            : journee.etat === 'actif'
              ? 'bg-hi font-medium text-ink'
              : journee.etat === 'inactif'
                ? 'border border-separator text-ink-3'
                : 'border border-dashed border-ink-3 text-ink-2',
          saisissable && !actif && onChoisir
            ? 'cursor-pointer hover:border-ink-2 hover:text-ink active:bg-fill'
            : null,
        )

        return (
          <span key={journee.day} className="flex flex-col items-center gap-0.5">
            {saisissable && onChoisir ? (
              <button
                type="button"
                onClick={() => onChoisir(journee.day)}
                title={libelle}
                aria-label={libelle}
                aria-pressed={actif}
                className={classes}
              >
                {journee.day.slice(8)}
              </button>
            ) : (
              <span title={libelle} aria-label={libelle} className={classes}>
                {journee.day.slice(8)}
              </span>
            )}
            <span className="text-[10px] leading-none text-ink-3">
              {journee.day === aujourdhui
                ? 'auj.'
                : journee.day.slice(8) === '01'
                  ? MOIS[Number(journee.day.slice(5, 7)) - 1]
                  : ' '}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Ce que disent les pastilles.
 *
 * Le sens ne vivait que dans l'attribut `title` : au doigt, il n'existe pas.
 * Trois repères sous la bande coûtent une ligne et rendent l'écran lisible
 * sans survol.
 */
function LegendeBande() {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-[12px] w-[13px] rounded-[4px] bg-hi" />
        relevée
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-[12px] w-[13px] rounded-[4px] border border-separator"
        />
        sans trade
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-[12px] w-[13px] rounded-[4px] border border-dashed border-ink-3"
        />
        à relever — cliquez la journée pour la saisir
      </span>
    </p>
  )
}

const LEGENDE: Record<EtatJournee, string> = {
  actif: 'relevée, avec trades',
  inactif: 'relevée, sans trade',
  ouvert: 'ouverte, à relever',
  manquante: 'à relever',
}

const MOIS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

/** La bande en miniature, pour une carte repliée : les points suffisent. */
function BandeMinuscule({ journees }: { journees: readonly JourneeMatin[] }) {
  return (
    <span className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
      {journees.map((journee) => (
        <span
          key={journee.day}
          // Les pointillés de la grande bande ne survivent pas à six pixels :
          // ici c'est le creux qui dit « à relever ».
          className={cn(
            'h-[6px] w-[6px] rounded-full',
            journee.etat === 'actif'
              ? 'bg-ink-2'
              : journee.etat === 'inactif'
                ? 'bg-ink-3/40'
                : 'border border-ink-3',
          )}
        />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Les cartes
// ---------------------------------------------------------------------------

/** L'en-tête commun à toutes les cartes : qui, et où il en est. */
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
      {children}
    </>
  )
}

function CarteRepliee({
  entree,
  journees,
  reste,
  brouillons,
  erreur,
  onOuvrir,
}: {
  entree: EntreeMatin
  journees: readonly JourneeMatin[]
  reste: number
  brouillons: Record<string, number>
  erreur: string | null
  onOuvrir: () => void
}) {
  const enBrouillon = entree.aRelever.filter(
    (day) => (brouillons[cleBrouillon(entree.walletId, day)] ?? 0) > 0,
  ).length

  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="flex w-full items-center gap-2 rounded-card bg-card px-4 py-3 text-left transition hover:bg-fill-2 active:bg-fill"
    >
      <ChevronRightIcon className="h-[15px] w-[15px] shrink-0 text-ink-3" />
      <Entete entree={entree}>
        <BandeMinuscule journees={journees} />
        {enBrouillon > 0 ? (
          <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-ink-2">
            brouillon · {enBrouillon}
          </span>
        ) : null}
        {erreur !== null ? (
          <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-red">
            échec
          </span>
        ) : null}
        <Compteur entree={entree} reste={reste} />
      </Entete>
    </button>
  )
}

/** Un wallet dont il ne reste rien à relever ce matin. */
function CarteFaite({
  entree,
  journees,
  releves,
}: {
  entree: EntreeMatin
  journees: readonly JourneeMatin[]
  releves: Record<string, Releve>
}) {
  const faits = entree.aRelever
    .map((day) => releves[cleBrouillon(entree.walletId, day)])
    .filter((releve): releve is Releve => releve !== undefined)

  const tokens = faits.reduce((somme, releve) => somme + releve.tokens, 0)
  const ecartes = faits.reduce((somme, releve) => somme + releve.ecartes, 0)
  const pnlSol = faits.reduce((somme, releve) => somme + releve.pnlSol, 0)

  return (
    <div className="flex items-center gap-3 rounded-card bg-card px-4 py-2.5">
      <CheckIcon className="h-[15px] w-[15px] shrink-0 text-green" />
      <span className="min-w-0 truncate text-[15px] text-ink-2">{entree.label}</span>
      <BandeMinuscule journees={journees} />
      <span className="ml-auto shrink-0 text-[13px] text-ink-2 tabular-nums">
        {tokens === 0 ? (
          `${faits.length} ${faits.length > 1 ? 'journées' : 'journée'} · inactif`
        ) : (
          <>
            {tokens} tokens
            {ecartes > 0 ? (
              <span className="text-ink-3"> · {ecartes} écartés</span>
            ) : null}{' '}
            ·{' '}
            <span
              className={cn(pnlSol > 0 ? 'text-green' : pnlSol < 0 ? 'text-red' : '')}
            >
              {formatSol(pnlSol)}
            </span>
          </>
        )}
      </span>
    </div>
  )
}

/**
 * Le décompte de droite : ce qui reste, et pourquoi le wallet est encore là.
 *
 * Un wallet au plancher qui garde des journées à relever est un wallet à
 * trous : il attend un verdict, mais ce verdict se prononcerait sur un
 * décompte faux. Le dire ici évite de le conclure en l'état.
 */
function Compteur({ entree, reste }: { entree: EntreeMatin; reste: number }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 text-[13px]">
      {entree.plancherAtteint ? (
        <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-orange">
          verdict en attente
        </span>
      ) : null}
      <span className="text-ink-2 tabular-nums">{reste} à relever</span>
    </span>
  )
}

/** La carte dépliée : la bande, puis la journée choisie. */
function CarteWallet({
  entree,
  journees,
  aujourdhui,
  reste,
  day,
  onReplier,
  onChoisir,
  children,
}: {
  entree: EntreeMatin
  journees: readonly JourneeMatin[]
  aujourdhui: string
  reste: number
  day: string
  onReplier: () => void
  onChoisir: (day: string) => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-card bg-card">
      <button
        type="button"
        onClick={onReplier}
        className="flex w-full items-center gap-2 rounded-t-card px-4 py-3 text-left transition hover:bg-fill-2/50"
      >
        <ChevronRightIcon className="h-[15px] w-[15px] shrink-0 rotate-90 text-ink-3" />
        <Entete entree={entree}>
          <Compteur entree={entree} reste={reste} />
        </Entete>
      </button>

      <div className="border-b border-separator px-4 pb-3">
        <BandeJours
          journees={journees}
          aujourdhui={aujourdhui}
          choisi={day}
          onChoisir={onChoisir}
        />
        <LegendeBande />
        {entree.plancherAtteint ? (
          <p className="mt-2 text-[11.5px] leading-relaxed text-orange">
            Ce wallet a assez de journées observées pour être conclu, mais il
            en manque {reste} : le verdict se prononcerait sur un décompte
            faux.
          </p>
        ) : null}
      </div>

      {children}
    </section>
  )
}

function CarteJournee({
  entree,
  day,
  aujourdhui,
  erreur,
  onBrouillon,
  onValider,
  onInactif,
}: {
  entree: EntreeMatin
  day: string
  /** La date du jour, pour dire de quel retard cette journée parle. */
  aujourdhui: string
  erreur: string | null
  onBrouillon: (lignes: number) => void
  onValider: (lignes: readonly LigneJour[]) => void
  onInactif: () => void
}) {
  const id = cleBrouillon(entree.walletId, day)
  const [lignes, setLignes] = useState<LigneJour[]>([])
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
    ecrireBrouillon(id, { lignes })
    signaler.current(lignes.length)
  }, [id, lignes])

  const report = useMemo(
    () => computeWalletReport(lignes.map(toTokenInput), entree.strategy),
    [lignes, entree.strategy],
  )

  function nouvelleCle(): string {
    compteur.current += 1
    return `l${compteur.current}`
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
        mint: null,
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
   * ⌘↵ valide la journée. Posé sur la carte entière, le raccourci marche
   * depuis n'importe quelle cellule du tableau — c'est là qu'on est quand on
   * finit de saisir.
   */
  function auClavier(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    if (vide) return
    event.preventDefault()
    onValider(lignes)
  }

  return (
    // Pas d'`overflow-hidden` ici : il empêcherait la barre d'action de
    // coller au bas de l'écran. Les coins sont arrondis bloc par bloc.
    <div onKeyDown={auClavier}>
      {/* La date seule ne dit pas si on rattrape hier ou la semaine dernière —
          et c'est toute la différence quand on revient après une absence. */}
      <div className="border-b border-separator px-4 py-2.5">
        <p className="flex items-baseline gap-2 text-[13px]">
          <span className="font-medium text-ink">{formatDayFr(day)}</span>
          <span className="text-ink-3">{retard(day, aujourdhui)}</span>
        </p>
      </div>

      {vide ? (
        <p className="border-b border-separator px-4 py-6 text-center text-[13px] text-ink-3">
          Aucun token pour l’instant. Ajoutez les lignes une par une, ou
          marquez la journée sans trade.
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
          Journée sans trade
        </button>
      </div>
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
