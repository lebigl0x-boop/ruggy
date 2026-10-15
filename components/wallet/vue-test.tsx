'use client'

import { useState } from 'react'

import type { BilanTest } from '@/lib/calcul'
import { formatJour, formatPct, formatSol, todayIso } from '@/lib/format'
import type { Token } from '@/lib/repo/types'
import { Courbe } from '../charts/courbe'
import { cn } from '../ui/cn'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { Bande, Chiffre, Panneau, Rangee, Tableau } from '../ui/table'
import { BoutonsIssue } from './pieces'

/**
 * La phase de test : un relevé exhaustif, jour par jour, sans argent réel.
 *
 * L'écran est rangé dans l'ordre où on s'en sert : les chiffres en bande, la
 * saisie juste après, puis les journées. Reléguer la saisie en bas de page
 * obligeait à traverser tout le bilan pour noter la journée de la veille — le
 * geste quotidien devenait le plus coûteux de l'écran.
 */
export function VueTest({
  bilan,
  tokensParJour,
  repere,
  onRelever,
  onIssue,
  onSupprimerToken,
  onSupprimerJour,
}: {
  bilan: BilanTest
  tokensParJour: (jour: string) => Token[]
  repere: number
  onRelever: (jour: string, issues: readonly ('tp' | 'rate')[]) => void
  onIssue: (id: string, issue: 'tp' | 'rate') => void
  onSupprimerToken: (id: string) => void
  onSupprimerJour: (jour: string) => void
}) {
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

      <FormulaireJour onRelever={onRelever} />

      <div className="grid gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panneau titre={`Journées · ${bilan.joursObserves}`}>
          <Tableau
            entetes={[
              { label: 'Jour', classe: 'w-[150px]' },
              { label: 'Lancements', classe: 'w-[110px] text-right' },
              { label: 'Au TP', classe: 'w-[70px] text-right' },
              { label: 'Résultat', classe: 'ml-auto w-[110px] text-right' },
            ]}
            vide={
              bilan.parJour.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-3">
                  Aucune journée relevée. Utilisez la saisie ci-dessus — une
                  journée sans lancement compte aussi.
                </p>
              ) : undefined
            }
          >
            {bilan.parJour.map((journee) => (
              <LigneJour
                key={journee.jour}
                jour={journee.jour}
                tokens={journee.tokens}
                tp={journee.tp}
                resultat={journee.resultat}
                liste={tokensParJour(journee.jour)}
                onIssue={onIssue}
                onSupprimerToken={onSupprimerToken}
                onSupprimerJour={onSupprimerJour}
              />
            ))}
          </Tableau>
        </Panneau>

        <div>
          <Panneau titre="Résultat cumulé">
            <div className="px-3 py-2.5">
              <Courbe points={bilan.courbeParJour} hauteur={118} />
            </div>
          </Panneau>

          <Panneau titre="Lecture">
            <p className="px-3 py-2 text-[12.5px] leading-snug text-ink-2">
              {bilan.tokens === 0
                ? 'Relevez quelques journées : le taux au TP se compare ensuite au seuil pour dire si la stratégie tient.'
                : bilan.rentable
                  ? `${formatPct(bilan.tauxTp)} des lancements atteignent le TP, au-dessus des ${formatPct(bilan.seuil ?? 0, { decimales: 1 })} nécessaires à l’équilibre.`
                  : `${formatPct(bilan.tauxTp)} des lancements atteignent le TP, sous les ${formatPct(bilan.seuil ?? 0, { decimales: 1 })} nécessaires à l’équilibre.`}
            </p>
            <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
              Exhaustif, médiocres compris — d’où son honnêteté. Ne s’additionne à aucun autre lot.
            </p>
          </Panneau>
        </div>
      </div>
    </>
  )
}

function LigneJour({
  jour,
  tokens,
  tp,
  resultat,
  liste,
  onIssue,
  onSupprimerToken,
  onSupprimerJour,
}: {
  jour: string
  tokens: number
  tp: number
  resultat: number
  liste: readonly Token[]
  onIssue: (id: string, issue: 'tp' | 'rate') => void
  onSupprimerToken: (id: string) => void
  onSupprimerJour: (jour: string) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const vide = tokens === 0

  return (
    <div className="border-b border-separator/60 last:border-b-0">
      <Rangee onClick={() => setOuvert((etat) => !etat)} actif={ouvert} className="border-b-0">
        <span className={cn('w-[150px] shrink-0', vide ? 'text-ink-3' : 'text-ink')}>
          {formatJour(jour)}
        </span>
        <span className="w-[110px] shrink-0 text-right text-ink-2 tabular-nums">
          {vide ? <span className="text-ink-3">sans lancement</span> : tokens}
        </span>
        <span className="w-[70px] shrink-0 text-right text-ink-2 tabular-nums">
          {vide ? '—' : tp}
        </span>
        <span
          className={cn(
            'ml-auto w-[110px] shrink-0 text-right font-semibold tabular-nums',
            resultat > 0 ? 'text-green' : resultat < 0 ? 'text-red' : 'text-ink-3',
          )}
        >
          {formatSol(resultat)}
        </span>
      </Rangee>

      {ouvert ? (
        <div className="bg-card-2/60">
          {liste.map((token, index) => (
            <div key={token.id} className="flex items-center gap-3 px-3 py-1.5 pl-8 text-[12.5px]">
              <span className="w-4 shrink-0 text-ink-3 tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {token.nom ?? 'Sans nom'}
              </span>
              <BoutonsIssue
                valeur={token.issue}
                onChange={(issue) => onIssue(token.id, issue)}
                taille="compact"
              />
              <button
                type="button"
                onClick={() => onSupprimerToken(token.id)}
                aria-label={`Supprimer le lancement ${index + 1}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-red active:scale-90"
              >
                <CloseIcon className="h-[13px] w-[13px]" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onSupprimerJour(jour)}
            className="w-full px-3 py-2 pl-8 text-left text-[12px] text-red transition hover:bg-fill-2"
          >
            Supprimer cette journée{tokens > 0 ? ` et ses ${tokens} lancements` : ''}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * La saisie d'une journée, en tête d'écran.
 *
 * On compose la liste des issues puis on valide d'un bloc. Valider sans rien
 * ajouter enregistre une journée sans lancement, qui est une observation à part
 * entière — d'où le libellé du bouton, qui change selon ce qu'on a composé.
 */
function FormulaireJour({
  onRelever,
}: {
  onRelever: (jour: string, issues: readonly ('tp' | 'rate')[]) => void
}) {
  const [jour, setJour] = useState(todayIso)
  const [issues, setIssues] = useState<('tp' | 'rate')[]>([])

  const tp = issues.filter((issue) => issue === 'tp').length

  return (
    <Panneau titre="Relever une journée">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <input
          type="date"
          value={jour}
          aria-label="Jour à relever"
          onChange={(event) => setJour(event.target.value)}
          className="rounded-[7px] bg-fill px-2.5 py-1.5 text-[13px] tabular-nums outline-none"
        />

        <button
          type="button"
          onClick={() => setIssues((liste) => [...liste, 'tp'])}
          className="flex items-center gap-1 rounded-full bg-green-soft px-3 py-1.5 text-[12.5px] font-semibold text-green transition hover:opacity-80 active:scale-95"
        >
          <PlusIcon className="h-[13px] w-[13px]" />
          TP atteint
        </button>
        <button
          type="button"
          onClick={() => setIssues((liste) => [...liste, 'rate'])}
          className="flex items-center gap-1 rounded-full bg-red-soft px-3 py-1.5 text-[12.5px] font-semibold text-red transition hover:opacity-80 active:scale-95"
        >
          <PlusIcon className="h-[13px] w-[13px]" />
          Raté
        </button>

        <span className="text-[12.5px] text-ink-2 tabular-nums">
          {issues.length === 0 ? 'aucun lancement' : `${tp} TP · ${issues.length - tp} ratés`}
        </span>

        {issues.length > 0 ? (
          <button
            type="button"
            onClick={() => setIssues([])}
            className="text-[12px] text-ink-3 underline underline-offset-2 transition hover:text-ink"
          >
            effacer
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            onRelever(jour, issues)
            setIssues([])
          }}
          className="ml-auto rounded-full bg-blue px-4 py-1.5 text-[13px] font-semibold text-white transition hover:opacity-90 active:scale-95"
        >
          {issues.length === 0 ? 'Journée sans lancement' : 'Relever'}
        </button>
      </div>
    </Panneau>
  )
}
