'use client'

import { useMemo, useState } from 'react'

import { resultatToken, type BilanTest, type Reglages } from '@/lib/calcul'
import { formatJour, formatPct, formatSol, todayIso } from '@/lib/format'
import type { Token } from '@/lib/repo/types'
import { Courbe } from '../charts/courbe'
import { ChampNomToken, type PatchNomToken } from '../token/champ-nom-token'
import { cn } from '../ui/cn'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { Bande, Chiffre, Panneau, Rangee, Tableau } from '../ui/table'
import { BoutonsIssue } from './pieces'
import { CalendrierTest, moisDe, type JourReleve } from './calendrier-test'

/**
 * La phase de test : un relevé exhaustif, jour par jour, sans argent réel.
 *
 * L'écran est un calendrier et le tableau du jour choisi, rien d'autre. Le
 * geste quotidien est toujours le même — « hier, qu'est-ce qu'il a lancé ? » —
 * donc on clique la date puis on remplit les lignes, exactement comme en
 * screening. La saisie composée-puis-validée qui vivait ici obligeait à tenir
 * un état avant de l'enregistrer : un temps de trop pour un geste quotidien.
 */
export function VueTest({
  bilan,
  reglages,
  tokensParJour,
  repere,
  onRelever,
  onAjouter,
  onIssue,
  onNom,
  onSupprimerToken,
  onSupprimerJour,
}: {
  bilan: BilanTest
  reglages: Reglages
  tokensParJour: (jour: string) => Token[]
  repere: number
  onRelever: (jour: string, issues: readonly ('tp' | 'rate')[]) => void
  onAjouter: (jour: string, issue: 'tp' | 'rate') => void
  onIssue: (id: string, issue: 'tp' | 'rate') => void
  onNom: (id: string, patch: PatchNomToken) => void
  onSupprimerToken: (id: string) => void
  onSupprimerJour: (jour: string) => void
}) {
  const [aujourdhui] = useState(todayIso)
  const [selection, setSelection] = useState(aujourdhui)
  const [mois, setMois] = useState(() => moisDe(aujourdhui))

  const releves = useMemo(() => {
    const table = new Map<string, JourReleve>()
    for (const journee of bilan.parJour) {
      table.set(journee.jour, { tokens: journee.tokens, resultat: journee.resultat })
    }
    return table
  }, [bilan.parJour])

  return (
    <>
      <Bande>
        <Chiffre
          fort
          label="Résultat simulé"
          valeur={formatSol(bilan.resultat)}
          detail={`${bilan.tokens} lancement${bilan.tokens > 1 ? 's' : ''}`}
          ton={bilan.resultat > 0 ? 'vert' : bilan.resultat < 0 ? 'rouge' : undefined}
        />
        <Chiffre
          label="Taux au TP"
          valeur={bilan.tokens > 0 ? formatPct(bilan.tauxTp) : '—'}
          detail={bilan.tokens > 0 ? `${bilan.tp} au TP` : 'rien de relevé'}
        />
        <Chiffre
          label="Seuil"
          valeur={bilan.seuil !== null ? formatPct(bilan.seuil, { decimales: 1 }) : '—'}
          detail={bilan.tokens === 0 ? 'à atteindre' : bilan.rentable ? 'au-dessus' : 'en dessous'}
          ton={bilan.tokens === 0 || bilan.seuil === null ? undefined : bilan.rentable ? 'vert' : 'rouge'}
        />
        <Chiffre
          label="Par jour"
          valeur={bilan.joursObserves > 0 ? formatSol(bilan.moyenneParJour) : '—'}
          detail="creuses comprises"
        />
        <Chiffre
          label="Journées"
          valeur={`${bilan.joursObserves}/${repere}`}
          detail={
            bilan.joursSansLancement > 0
              ? `${bilan.joursSansLancement} sans lancement`
              : 'observées / prévues'
          }
        />
        <Chiffre
          label="Lancements / jour"
          valeur={
            bilan.joursObserves > 0
              ? (bilan.tokens / bilan.joursObserves).toFixed(1).replace('.', ',')
              : '—'
          }
          detail="en moyenne"
        />
      </Bande>

      <div className="grid gap-2 xl:grid-cols-[304px_minmax(0,1fr)]">
        <Panneau titre={`Journées · ${bilan.joursObserves}`}>
          <CalendrierTest
            mois={mois}
            onMois={setMois}
            releves={releves}
            selection={selection}
            onSelection={setSelection}
            aujourdhui={aujourdhui}
          />
        </Panneau>

        <PanneauJour
          jour={selection}
          releve={releves.get(selection)}
          reglages={reglages}
          liste={tokensParJour(selection)}
          onRelever={onRelever}
          onAjouter={onAjouter}
          onIssue={onIssue}
          onNom={onNom}
          onSupprimerToken={onSupprimerToken}
          onSupprimerJour={onSupprimerJour}
        />
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panneau titre="Résultat cumulé">
          <div className="px-3 py-2.5">
            <Courbe points={bilan.courbeParJour} hauteur={118} />
          </div>
        </Panneau>

        <Panneau titre="Lecture">
          <p className="px-3 py-2 text-[12.5px] leading-snug text-ink-2">
            {bilan.tokens === 0
              ? 'Relevez quelques journées : le taux au TP se compare ensuite au seuil.'
              : bilan.rentable
                ? `${formatPct(bilan.tauxTp)} des lancements atteignent le TP, au-dessus des ${formatPct(bilan.seuil ?? 0, { decimales: 1 })} nécessaires à l’équilibre.`
                : `${formatPct(bilan.tauxTp)} des lancements atteignent le TP, sous les ${formatPct(bilan.seuil ?? 0, { decimales: 1 })} nécessaires à l’équilibre.`}
          </p>
          <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
            Exhaustif, médiocres compris — d’où son honnêteté. Ne s’additionne à aucun autre lot.
          </p>
        </Panneau>
      </div>
    </>
  )
}

/**
 * Le tableau du jour choisi.
 *
 * Il a trois visages, parce que le jour en a trois : pas encore regardé, relevé
 * sans lancement, relevé avec des lancements. Les deux premiers se ressemblent
 * à l'écran mais disent le contraire l'un de l'autre, d'où le texte explicite
 * dans chaque cas plutôt qu'un tableau vide muet.
 */
function PanneauJour({
  jour,
  releve,
  reglages,
  liste,
  onRelever,
  onAjouter,
  onIssue,
  onNom,
  onSupprimerToken,
  onSupprimerJour,
}: {
  jour: string
  releve: JourReleve | undefined
  reglages: Reglages
  liste: readonly Token[]
  onRelever: (jour: string, issues: readonly ('tp' | 'rate')[]) => void
  onAjouter: (jour: string, issue: 'tp' | 'rate') => void
  onIssue: (id: string, issue: 'tp' | 'rate') => void
  onNom: (id: string, patch: PatchNomToken) => void
  onSupprimerToken: (id: string) => void
  onSupprimerJour: (jour: string) => void
}) {
  const resultat = releve?.resultat ?? 0

  return (
    <Panneau
      titre={`Journée du ${formatJour(jour)}`}
      action={
        releve !== undefined ? (
          <span
            className={cn(
              'text-[13px] font-semibold tabular-nums',
              resultat > 0 ? 'text-green' : resultat < 0 ? 'text-red' : 'text-ink-3',
            )}
          >
            {formatSol(resultat)}
          </span>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-separator px-3 py-2">
        <button
          type="button"
          onClick={() => onAjouter(jour, 'tp')}
          className="flex items-center gap-1 rounded-full bg-green-soft px-3 py-1.5 text-[12.5px] font-semibold text-green transition hover:opacity-80 active:scale-95"
        >
          <PlusIcon className="h-[13px] w-[13px]" />
          TP atteint
        </button>
        <button
          type="button"
          onClick={() => onAjouter(jour, 'rate')}
          className="flex items-center gap-1 rounded-full bg-red-soft px-3 py-1.5 text-[12.5px] font-semibold text-red transition hover:opacity-80 active:scale-95"
        >
          <PlusIcon className="h-[13px] w-[13px]" />
          Raté
        </button>

        {releve === undefined ? (
          <button
            type="button"
            onClick={() => onRelever(jour, [])}
            className="rounded-full bg-fill px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:bg-fill-2 active:scale-95"
          >
            Journée sans lancement
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSupprimerJour(jour)}
            className="ml-auto text-[12px] text-ink-3 underline underline-offset-2 transition hover:text-red"
          >
            Ne plus relever cette journée
            {liste.length > 0 ? ` (et ses ${liste.length} lancements)` : ''}
          </button>
        )}
      </div>

      <Tableau
        entetes={[
          { label: '#', classe: 'w-7' },
          { label: 'Token', classe: 'min-w-[160px] flex-1' },
          { label: 'Issue', classe: 'w-[170px]' },
          { label: 'Résultat', classe: 'w-[90px] text-right' },
          { label: '', classe: 'w-7' },
        ]}
        vide={
          liste.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">
              {releve === undefined
                ? 'Journée pas encore regardée. Ajoutez ses lancements, ou relevez-la sans lancement si le wallet n’a rien lancé.'
                : 'Relevée sans aucun lancement. Elle compte dans les journées observées et tire la moyenne par jour vers le bas — c’est voulu.'}
            </p>
          ) : undefined
        }
      >
        {liste.map((token, index) => (
          <Rangee key={token.id} className="group/ligne">
            <span className="w-7 shrink-0 text-ink-3 tabular-nums">{index + 1}</span>

            <span className="min-w-[160px] flex-1">
              <ChampNomToken
                numero={index + 1}
                nom={token.nom}
                mint={token.mint}
                onChange={(patch) => onNom(token.id, patch)}
              />
            </span>

            <span className="w-[170px] shrink-0">
              <BoutonsIssue
                valeur={token.issue}
                onChange={(issue) => onIssue(token.id, issue)}
                taille="compact"
              />
            </span>

            <span
              className={cn(
                'w-[90px] shrink-0 text-right font-semibold tabular-nums',
                token.issue === 'tp' ? 'text-green' : 'text-red',
              )}
            >
              {formatSol(resultatToken(token.issue, reglages))}
            </span>

            <button
              type="button"
              onClick={() => onSupprimerToken(token.id)}
              aria-label={`Supprimer le lancement ${index + 1}`}
              className="flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-red active:scale-90 md:opacity-0 md:group-hover/ligne:opacity-100 md:focus-visible:opacity-100"
            >
              <CloseIcon className="h-[14px] w-[14px]" />
            </button>
          </Rangee>
        ))}
      </Tableau>
    </Panneau>
  )
}
