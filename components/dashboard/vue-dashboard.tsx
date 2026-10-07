'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  cancelTestAction,
  concludeTestAction,
  reopenTestAction,
  setWalletStatusAction,
  startTestAction,
} from '@/app/actions'
import { CourbePnl, type PointCourbe } from '@/components/charts/courbe-pnl'
import { formatEur, formatPercent, formatSol } from '@/lib/format'
import {
  avancement,
  parEtat,
  type LigneWallet,
  type Portefeuille,
} from '@/lib/portefeuille'
import type { WalletStatus } from '@/lib/repo/types'
import { cn } from '../ui/cn'
import { Bloc } from '../ui/page'
import { TagBadge } from '../ui/tag-badge'

/**
 * Le tableau de bord : où en est le portefeuille, et ce qui attend une
 * décision.
 *
 * Deux étages. En haut les chiffres — le net de la phase de test, la courbe,
 * et quatre mesures. En bas l'entonnoir, qui est la méthode rendue visible :
 * screening → test → validé ou écarté. Un wallet prêt à être tranché remonte
 * en tête de sa colonne et le dit, au lieu d'attendre qu'on l'ouvre pour le
 * découvrir.
 *
 * Le changement d'état se fait depuis la carte. Le glisser-déposer rendrait
 * le même service pour dix fois le travail — il viendra si le reste tient.
 */

const COLONNES: readonly { statut: WalletStatus; titre: string }[] = [
  { statut: 'screening', titre: 'Screening' },
  { statut: 'test', titre: 'En test' },
  { statut: 'valide', titre: 'Validés' },
  { statut: 'rejete', titre: 'Écartés' },
]

/** La pastille de la colonne reprend celle du statut, en tête de pile. */
const POINT_COLONNE: Record<WalletStatus, string> = {
  screening: 'bg-gray',
  test: 'bg-blue',
  valide: 'bg-green',
  rejete: 'bg-ink-3',
}

export function VueDashboard({ vue }: { vue: Portefeuille }) {
  const router = useRouter()
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const colonnes = parEtat(vue.lignes)
  const ecartes = vue.tokensTest - vue.tokensPris

  const courbe: PointCourbe[] = vue.courbe.map((point) => ({
    day: point.day,
    pnlSol: point.pnlSol,
    cumulSol: point.cumulSol,
  }))

  /** Toute transition passe par le serveur, qui seul juge si elle est permise. */
  function agir(id: string, appel: () => Promise<{ ok: boolean; message?: string }>) {
    setEnCours(id)
    setErreur(null)
    void appel()
      .then((resultat) => {
        if (!resultat.ok) setErreur(resultat.message ?? 'Action impossible.')
        else router.refresh()
      })
      .finally(() => setEnCours(null))
  }

  return (
    <div className="grid gap-4">
      {/* Le résultat et sa courbe : côte à côte dès qu'il y a la place. */}
      <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="rounded-card border border-separator bg-card px-5 py-4">
          <p className="text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
            Net de la phase de test
          </p>
          <p
            className={cn(
              'mt-1 text-[clamp(26px,7vw,34px)] leading-none font-bold tracking-tight tabular-nums',
              vue.netTestSol > 0
                ? 'text-green'
                : vue.netTestSol < 0
                  ? 'text-red'
                  : 'text-ink-2',
            )}
          >
            {formatSol(vue.netTestSol)}
          </p>
          <p className="mt-2 text-[11.5px] text-ink-3 tabular-nums">
            {vue.netTestEur !== null ? `${formatEur(vue.netTestEur)} · ` : ''}
            échantillon screening {formatSol(vue.netScreeningSol)}, tenu à part
          </p>
        </div>

        <Bloc titre="Résultat cumulé" className="min-w-0">
          <div className="px-3 pt-3 pb-2">
            <CourbePnl points={courbe} />
          </div>
        </Bloc>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tuile
          label="Taux à l’objectif"
          valeur={vue.tokensNotes > 0 ? formatPercent(vue.taux) : '—'}
          detail={`${vue.hits} sur ${vue.tokensNotes} notés`}
        />
        <Tuile
          label="Tokens pris"
          valeur={String(vue.tokensPris)}
          detail={ecartes > 0 ? `${ecartes} écartés` : `sur ${vue.tokensTest} relevés`}
        />
        <Tuile
          label="Journées"
          valeur={String(vue.joursObserves)}
          detail={`${vue.parStatut.test} ${vue.parStatut.test > 1 ? 'wallets en test' : 'wallet en test'}`}
        />
        <Tuile
          label="Meilleur wallet"
          valeur={vue.meilleur !== null ? formatSol(vue.meilleur.netSol) : '—'}
          detail={vue.meilleur?.label ?? 'Aucun token noté'}
          ton={
            vue.meilleur === null
              ? undefined
              : vue.meilleur.netSol > 0
                ? 'vert'
                : 'rouge'
          }
        />
      </div>

      {erreur !== null ? (
        <p className="rounded-card bg-card px-4 py-3 text-[14px] text-red">{erreur}</p>
      ) : null}

      <section className="grid gap-2">
        <h2 className="px-1 text-[11px] tracking-[0.07em] text-ink-2 uppercase">
          Entonnoir
        </h2>

        {/* Les colonnes s'empilent plutôt que de défiler latéralement : à
            quatre de front sur un téléphone, aucune carte n'est lisible. */}
        <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {COLONNES.map(({ statut, titre }) => (
            <Colonne
              key={statut}
              statut={statut}
              titre={titre}
              lignes={colonnes[statut]}
              enCours={enCours}
              onStart={(id) => agir(id, () => startTestAction(id))}
              onConclude={(id, verdict) => agir(id, () => concludeTestAction(id, verdict))}
              onCancel={(id) => agir(id, () => cancelTestAction(id))}
              onReopen={(id) => agir(id, () => reopenTestAction(id))}
              onClassify={(id, cible) => agir(id, () => setWalletStatusAction(id, cible))}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function Tuile({
  label,
  valeur,
  detail,
  ton,
}: {
  label: string
  valeur: string
  detail: string
  ton?: 'vert' | 'rouge'
}) {
  return (
    <div className="rounded-card border border-separator bg-card px-4 py-3.5">
      <p className="truncate text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 text-[21px] leading-tight font-semibold tracking-tight tabular-nums',
          ton === 'vert' ? 'text-green' : ton === 'rouge' ? 'text-red' : 'text-ink',
        )}
      >
        {valeur}
      </p>
      <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{detail}</p>
    </div>
  )
}

function Colonne({
  statut,
  titre,
  lignes,
  enCours,
  onStart,
  onConclude,
  onCancel,
  onReopen,
  onClassify,
}: {
  statut: WalletStatus
  titre: string
  lignes: readonly LigneWallet[]
  enCours: string | null
  onStart: (id: string) => void
  onConclude: (id: string, verdict: 'valide' | 'rejete') => void
  onCancel: (id: string) => void
  onReopen: (id: string) => void
  onClassify: (id: string, cible: WalletStatus) => void
}) {
  return (
    <section className="rounded-card border border-separator bg-card p-2.5">
      <h3 className="flex items-center gap-2 px-1.5 pb-2 text-[12.5px] font-semibold text-ink-2">
        <span
          aria-hidden
          className={cn('h-[7px] w-[7px] shrink-0 rounded-full', POINT_COLONNE[statut])}
        />
        {titre}
        <span className="ml-auto text-[11.5px] text-ink-3 tabular-nums">
          {lignes.length}
        </span>
      </h3>

      {lignes.length === 0 ? (
        <p className="px-1 pb-1 text-[12px] text-ink-3">Vide</p>
      ) : (
        <div className="grid gap-1.5">
          {lignes.map((ligne) => (
            <Carte
              key={ligne.id}
              ligne={ligne}
              occupe={enCours === ligne.id}
              onStart={onStart}
              onConclude={onConclude}
              onCancel={onCancel}
              onReopen={onReopen}
              onClassify={onClassify}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function Carte({
  ligne,
  occupe,
  onStart,
  onConclude,
  onCancel,
  onReopen,
  onClassify,
}: {
  ligne: LigneWallet
  occupe: boolean
  onStart: (id: string) => void
  onConclude: (id: string, verdict: 'valide' | 'rejete') => void
  onCancel: (id: string) => void
  onReopen: (id: string) => void
  onClassify: (id: string, cible: WalletStatus) => void
}) {
  const part = avancement(ligne)
  const sorti = ligne.status === 'valide' || ligne.status === 'rejete'

  return (
    <article
      className={cn(
        'rounded-[11px] border border-separator bg-card-2 p-2.5 transition',
        occupe && 'opacity-50',
        // Un wallet prêt à être tranché s'entoure d'ocre : c'est la seule
        // chose de cet écran sur laquelle il faut agir.
        ligne.verdictDisponible && 'border-orange/45',
      )}
    >
      <Link
        href={`/wallets/${ligne.id}`}
        className="flex min-w-0 items-center gap-2"
      >
        <span className="truncate text-[12px] font-semibold tracking-[0.015em] uppercase hover:underline">
          {ligne.label}
        </span>
        <TagBadge tag={ligne.tag} className="ml-auto" />
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[11.5px] text-ink-3">
          {avancementTexte(ligne)}
        </span>
        <span
          className={cn(
            'shrink-0 font-mono text-[11.5px] font-semibold tabular-nums',
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
      </div>

      {/* La barre ne vaut que pendant la phase : un wallet sorti de
          l'entonnoir n'a plus de chemin à parcourir. */}
      {sorti ? null : (
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-hi">
          <div
            className={cn('h-full rounded-full', part >= 1 ? 'bg-orange' : 'bg-ink-3')}
            style={{ width: `${part * 100}%` }}
          />
        </div>
      )}

      {ligne.verdictDisponible ? (
        <p className="mt-1.5 text-[11.5px] font-semibold text-orange">
          Prêt à trancher
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        {ligne.status === 'screening' ? (
          <Action onClick={() => onStart(ligne.id)} occupe={occupe} principal>
            Lancer le test
          </Action>
        ) : null}

        {ligne.status === 'test' ? (
          <>
            <Action
              onClick={() => onConclude(ligne.id, 'valide')}
              occupe={occupe || !ligne.verdictDisponible}
              principal={ligne.verdictDisponible}
            >
              Valider
            </Action>
            <Action
              onClick={() => onConclude(ligne.id, 'rejete')}
              occupe={occupe || !ligne.verdictDisponible}
            >
              Écarter
            </Action>
            {/* Toujours disponible : un test lancé par erreur ne doit pas
                attendre quatre journées pour être défait. */}
            <Action onClick={() => onCancel(ligne.id)} occupe={occupe}>
              Annuler le test
            </Action>
          </>
        ) : null}

        {sorti ? (
          <>
            <Action onClick={() => onReopen(ligne.id)} occupe={occupe}>
              Rouvrir
            </Action>
            <Action
              onClick={() =>
                onClassify(ligne.id, ligne.status === 'valide' ? 'rejete' : 'valide')
              }
              occupe={occupe}
            >
              {ligne.status === 'valide' ? 'Écarter' : 'Valider'}
            </Action>
          </>
        ) : null}
      </div>
    </article>
  )
}

/** Ce qu'il reste à faire avant de pouvoir trancher, en une ligne. */
function avancementTexte(ligne: LigneWallet): string {
  if (ligne.status === 'screening') {
    return `${ligne.n}/${ligne.seuilAnalyse} notés`
  }
  if (ligne.status === 'test') {
    return ligne.verdictDisponible
      ? 'à conclure'
      : `j${ligne.joursObserves}/${ligne.joursMinimum}`
  }
  return `${ligne.n} tokens · ${ligne.n > 0 ? formatPercent(ligne.taux) : '—'}`
}

function Action({
  onClick,
  occupe,
  principal = false,
  children,
}: {
  onClick: () => void
  occupe: boolean
  principal?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={occupe}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition',
        occupe
          ? 'cursor-not-allowed bg-fill text-ink-3'
          : principal
            ? 'bg-accent text-accent-ink hover:bg-white'
            : 'bg-hi text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
