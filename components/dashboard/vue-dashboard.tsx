'use client'

import Link from 'next/link'
import { useState } from 'react'

import { adresseCourte, formatPct, formatSol } from '@/lib/format'
import { LIBELLE_PHASE, PHASES, type Phase } from '@/lib/repo/types'
import type { Courbes, ResumeWallet, Totaux } from '@/lib/resume'
import { Courbe, MiniCourbe } from '../charts/courbe'
import { cn } from '../ui/cn'
import { Ecran } from '../ui/ecran'
import { PhasePoint } from '../ui/phase-badge'
import { Bande, Chiffre, Panneau, Rangee, Tableau } from '../ui/table'
import { NouveauWallet } from '../wallets/nouveau-wallet'

type Filtre = 'tous' | Phase
type Vue = 'tableau' | 'cartes'

/**
 * Le tableau de bord.
 *
 * En tête, les trois totaux — et ils restent trois. Additionner un résultat
 * compté et deux résultats simulés donnerait un nombre que rien ne vérifie.
 *
 * En dessous, les wallets. En tableau par défaut : on vient ici pour comparer,
 * et rien ne bat une colonne de chiffres alignés. Les cartes restent à un clic
 * pour quand on cherche une forme de courbe plutôt qu'une valeur.
 */
export function VueDashboard({
  resumes,
  totaux,
  courbes,
  adresses,
}: {
  resumes: readonly ResumeWallet[]
  totaux: Totaux
  courbes: Courbes
  adresses: readonly string[]
}) {
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [vue, setVue] = useState<Vue>('tableau')

  const visibles = resumes.filter((r) => filtre === 'tous' || r.phase === filtre)
  const total = PHASES.reduce((somme, phase) => somme + totaux.parPhase[phase], 0)

  return (
    <Ecran
      titre="Wallets"
      sousTitre={`${resumes.length} ${resumes.length > 1 ? 'wallets suivis' : 'wallet suivi'}`}
      actions={<NouveauWallet adressesExistantes={adresses} />}
    >
      <Bande>
        <Chiffre
          fort
          label="Réel · trade"
          valeur={formatSol(totaux.reel)}
          detail={`${totaux.trades} trade${totaux.trades > 1 ? 's' : ''} joué${totaux.trades > 1 ? 's' : ''}`}
          ton={totaux.reel > 0 ? 'vert' : totaux.reel < 0 ? 'rouge' : undefined}
        />
        <Chiffre
          label="Simulé · test"
          valeur={formatSol(totaux.test)}
          detail={`${totaux.jours} journée${totaux.jours > 1 ? 's' : ''} relevée${totaux.jours > 1 ? 's' : ''}`}
        />
        <Chiffre
          label="Simulé · screening"
          valeur={formatSol(totaux.screening)}
          detail="échantillons à la main"
        />
        <Chiffre label="Wallets" valeur={String(total)} detail="suivis" />
        <Chiffre
          label="En test"
          valeur={String(totaux.parPhase.test)}
          detail={`${totaux.parPhase.screening} en screening`}
        />
        <Chiffre
          label="En trade"
          valeur={String(totaux.parPhase.trade)}
          detail={`${totaux.parPhase.archive} archivés`}
        />
      </Bande>

      {courbes.reel.length > 0 || courbes.test.length > 0 ? (
        <div className="mb-2 grid gap-2 xl:grid-cols-2">
          <Panneau titre="Réel cumulé · trade" className="mb-0">
            <div className="px-3 py-2.5">
              <Courbe points={courbes.reel} hauteur={104} />
            </div>
          </Panneau>
          <Panneau titre="Simulé cumulé · test" className="mb-0">
            <div className="px-3 py-2.5">
              <Courbe points={courbes.test} hauteur={104} />
            </div>
          </Panneau>
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pastille
          actif={filtre === 'tous'}
          onClick={() => setFiltre('tous')}
          label="Tous"
          compte={total}
        />
        {PHASES.filter((phase) => totaux.parPhase[phase] > 0).map((phase) => (
          <Pastille
            key={phase}
            actif={filtre === phase}
            onClick={() => setFiltre(filtre === phase ? 'tous' : phase)}
            label={LIBELLE_PHASE[phase]}
            compte={totaux.parPhase[phase]}
            phase={phase}
          />
        ))}

        <div className="ml-auto flex gap-1 rounded-full bg-fill p-0.5">
          {(['tableau', 'cartes'] as const).map((cible) => (
            <button
              key={cible}
              type="button"
              onClick={() => setVue(cible)}
              aria-pressed={vue === cible}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition',
                vue === cible ? 'bg-segment text-ink' : 'text-ink-2 hover:text-ink',
              )}
            >
              {cible === 'tableau' ? 'Tableau' : 'Cartes'}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-card bg-card px-4 py-12 text-center">
          <p className="text-[15px] text-ink-2">
            {resumes.length === 0 ? 'Aucun wallet suivi' : 'Aucun wallet dans cette phase'}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {resumes.length === 0
              ? 'Ajoutez-en un pour commencer le screening.'
              : 'Changez de filtre pour voir les autres.'}
          </p>
        </div>
      ) : vue === 'tableau' ? (
        <Panneau>
          <Tableau
            entetes={[
              { label: 'Wallet', classe: 'min-w-[180px] flex-1' },
              { label: 'Phase', classe: 'w-[110px]' },
              { label: 'Avancement', classe: 'w-[110px] text-right' },
              { label: 'Lignes', classe: 'w-[70px] text-right' },
              { label: 'Taux au TP', classe: 'w-[90px] text-right' },
              { label: 'Rendement', classe: 'w-[95px] text-right' },
              { label: 'Résultat', classe: 'w-[110px] text-right' },
              { label: 'Courbe', classe: 'w-[90px]' },
            ]}
          >
            {visibles.map((r) => (
              <LigneWallet key={r.id} resume={r} />
            ))}
          </Tableau>
        </Panneau>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibles.map((r) => (
            <Dossier key={r.id} resume={r} />
          ))}
        </div>
      )}
    </Ecran>
  )
}

function Pastille({
  actif,
  onClick,
  label,
  compte,
  phase,
}: {
  actif: boolean
  onClick: () => void
  label: string
  compte: number
  phase?: Phase
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] transition active:scale-95',
        actif ? 'bg-accent text-accent-ink' : 'bg-card text-ink-2 hover:bg-card-2',
      )}
    >
      {phase ? <PhasePoint phase={phase} /> : null}
      {label}
      <span className="font-semibold tabular-nums">{compte}</span>
    </button>
  )
}

/** Une ligne du tableau : tout ce qui sert à comparer, et rien de plus. */
function LigneWallet({ resume }: { resume: ResumeWallet }) {
  const avancement = resume.avancement
    ? `${resume.avancement.fait}/${resume.avancement.repere}`
    : '—'

  return (
    <Link href={`/wallets/${resume.id}`} className="block">
      <Rangee survol className="cursor-pointer">
        <span className="flex min-w-[180px] flex-1 items-center gap-2">
          <span className="truncate font-medium text-ink">{resume.nom}</span>
          <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
            {adresseCourte(resume.adresse)}
          </span>
          {resume.alerteArret ? (
            <span className="shrink-0 rounded-full bg-orange-soft px-1.5 py-0.5 text-[10px] font-semibold text-orange">
              arrêt
            </span>
          ) : null}
        </span>

        <span className="flex w-[110px] shrink-0 items-center gap-1.5 text-ink-2">
          <PhasePoint phase={resume.phase} />
          {LIBELLE_PHASE[resume.phase]}
        </span>

        <span className="w-[110px] shrink-0 text-right text-ink-3 tabular-nums">
          {avancement}
        </span>
        <span className="w-[70px] shrink-0 text-right text-ink-2 tabular-nums">
          {resume.lignes}
        </span>
        <span className="w-[90px] shrink-0 text-right text-ink-2 tabular-nums">
          {resume.lignes > 0 ? formatPct(resume.tauxTp) : '—'}
        </span>
        <span className="w-[95px] shrink-0 text-right text-ink-2 tabular-nums">
          {resume.rendement !== null ? formatPct(resume.rendement, { signe: true }) : '—'}
        </span>

        <span
          className={cn(
            'w-[110px] shrink-0 text-right font-semibold tabular-nums',
            resume.lignes === 0
              ? 'text-ink-3'
              : resume.resultat > 0
                ? 'text-green'
                : resume.resultat < 0
                  ? 'text-red'
                  : 'text-ink-2',
          )}
        >
          {resume.lignes > 0 ? formatSol(resume.resultat) : '—'}
          <span className="ml-1 text-[10px] font-normal text-ink-3">
            {resume.reel ? 'réel' : 'sim.'}
          </span>
        </span>

        <span className="w-[90px] shrink-0">
          <MiniCourbe points={resume.courbe} />
        </span>
      </Rangee>
    </Link>
  )
}

/** Le dossier d'un wallet : ce qu'il faut pour décider s'il faut l'ouvrir. */
function Dossier({ resume }: { resume: ResumeWallet }) {
  return (
    <Link
      href={`/wallets/${resume.id}`}
      className="group block rounded-card bg-card p-3 transition hover:bg-card-2 active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <PhasePoint phase={resume.phase} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold group-hover:underline">
          {resume.nom}
        </span>
        <span className="shrink-0 text-[11px] text-ink-3">{LIBELLE_PHASE[resume.phase]}</span>
      </div>

      <p
        className={cn(
          'mt-2 text-[24px] leading-none font-bold tracking-[-0.02em] tabular-nums',
          resume.resultat > 0 ? 'text-green' : resume.resultat < 0 ? 'text-red' : 'text-ink-2',
        )}
      >
        {formatSol(resume.resultat)}
      </p>
      <p className="mt-1 text-[11px] text-ink-3">
        {resume.reel ? 'réel' : 'simulé'} · {cle(resume)}
      </p>

      <div className="mt-2">
        <MiniCourbe points={resume.courbe} />
      </div>

      {resume.alerteArret ? (
        <p className="mt-1.5 text-[11px] font-medium text-orange">Règle d’arrêt</p>
      ) : null}
    </Link>
  )
}

/** L'info clé, propre à la phase en cours. */
function cle(resume: ResumeWallet): string {
  if (resume.reel) {
    return resume.rendement !== null
      ? `${formatPct(resume.rendement, { signe: true })} de rendement`
      : 'aucun trade'
  }

  if (resume.avancement === null) return `${resume.lignes} lignes`

  const { fait, repere } = resume.avancement
  const unite = resume.phase === 'test' ? 'jour' : 'token'
  const avancement = `${fait}/${repere} ${unite}${fait > 1 ? 's' : ''}`

  return resume.lignes > 0 ? `${avancement} · ${formatPct(resume.tauxTp)} au TP` : avancement
}
