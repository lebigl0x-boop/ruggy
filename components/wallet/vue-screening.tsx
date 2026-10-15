'use client'

import type { BilanSimule } from '@/lib/calcul'
import { formatPct, formatSol } from '@/lib/format'
import type { Token } from '@/lib/repo/types'
import { Courbe } from '../charts/courbe'
import { ChampNomToken } from '../token/champ-nom-token'
import { cn } from '../ui/cn'
import { CloseIcon, PlusIcon } from '../ui/icons'
import { Bande, Chiffre, Panneau, Rangee, Tableau } from '../ui/table'
import { BoutonsIssue } from './pieces'

/**
 * La phase de screening : un échantillon de lancements passés, notés à la main.
 *
 * Le repère de tokens est affiché, jamais imposé — on passe en test quand on
 * veut, avec trois lancements si on est convaincu.
 */
export function VueScreening({
  bilan,
  tokens,
  repere,
  onAjouter,
  onIssue,
  onNom,
  onSupprimer,
}: {
  bilan: BilanSimule
  tokens: readonly Token[]
  repere: number
  onAjouter: (issue: 'tp' | 'rate') => void
  onIssue: (id: string, issue: 'tp' | 'rate') => void
  onNom: (id: string, patch: { nom: string | null; mint: string | null }) => void
  onSupprimer: (id: string) => void
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
          detail={bilan.tokens > 0 ? `${bilan.tp} sur ${bilan.tokens}` : 'rien de noté'}
        />
        <Chiffre
          label="Seuil"
          valeur={bilan.seuil !== null ? formatPct(bilan.seuil, { decimales: 1 }) : '—'}
          detail={bilan.tokens === 0 ? 'à atteindre' : bilan.rentable ? 'au-dessus' : 'en dessous'}
          ton={bilan.tokens === 0 || bilan.seuil === null ? undefined : bilan.rentable ? 'vert' : 'rouge'}
        />
        <Chiffre
          label="Par lancement"
          valeur={bilan.tokens > 0 ? formatSol(bilan.moyenneParToken) : '—'}
          detail="en moyenne"
        />
        <Chiffre
          label="Échantillon"
          valeur={`${bilan.tokens}/${repere}`}
          detail={bilan.tokens >= repere ? 'repère atteint' : `${repere - bilan.tokens} conseillés`}
        />
        <Chiffre
          label="Ratés"
          valeur={String(bilan.rate)}
          detail={bilan.tokens > 0 ? `sur ${bilan.tokens} notés` : '—'}
        />
      </Bande>

      <Panneau titre="Noter un lancement">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onAjouter('tp')}
            className="flex items-center gap-1 rounded-full bg-green-soft px-3 py-1.5 text-[12.5px] font-semibold text-green transition hover:opacity-80 active:scale-95"
          >
            <PlusIcon className="h-[13px] w-[13px]" />
            TP atteint
          </button>
          <button
            type="button"
            onClick={() => onAjouter('rate')}
            className="flex items-center gap-1 rounded-full bg-red-soft px-3 py-1.5 text-[12.5px] font-semibold text-red transition hover:opacity-80 active:scale-95"
          >
            <PlusIcon className="h-[13px] w-[13px]" />
            Raté
          </button>
          <span className="text-[12px] text-ink-3">
            La ligne s’ajoute en bas ; collez-y le CA pour retrouver le nom.
          </span>
        </div>
      </Panneau>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panneau titre={`Lancements · ${bilan.tokens}`}>
          <Tableau
            entetes={[
              { label: '#', classe: 'w-7' },
              { label: 'Token', classe: 'min-w-[160px] flex-1' },
              { label: 'Issue', classe: 'w-[170px]' },
              { label: 'Résultat', classe: 'w-[90px] text-right' },
              { label: 'Cumul', classe: 'w-[90px] text-right' },
              { label: '', classe: 'w-7' },
            ]}
            vide={
              tokens.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-3">
                  Aucun lancement noté. Pour chacun, le take-profit visé était-il
                  atteint ou non ?
                </p>
              ) : undefined
            }
          >
            {tokens.map((token, index) => (
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
                  {formatSol(bilan.courbe[index]?.resultat ?? 0)}
                </span>

                <span className="w-[90px] shrink-0 text-right text-ink-3 tabular-nums">
                  {formatSol(bilan.courbe[index]?.cumul ?? 0)}
                </span>

                <button
                  type="button"
                  onClick={() => onSupprimer(token.id)}
                  aria-label={`Supprimer le lancement ${index + 1}`}
                  className="flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-red active:scale-90 md:opacity-0 md:group-hover/ligne:opacity-100 md:focus-visible:opacity-100"
                >
                  <CloseIcon className="h-[14px] w-[14px]" />
                </button>
              </Rangee>
            ))}
          </Tableau>
        </Panneau>

        <div>
          <Panneau titre="Résultat cumulé">
            <div className="px-3 py-2.5">
              <Courbe points={bilan.courbe} hauteur={118} />
            </div>
          </Panneau>

          <Panneau titre="Lecture">
            <p className="px-3 py-2 text-[12.5px] leading-snug text-ink-2">
              {bilan.tokens === 0
                ? 'Notez quelques lancements passés : le taux au TP se compare ensuite au seuil.'
                : bilan.rentable
                  ? `${formatPct(bilan.tauxTp)} au TP, au-dessus des ${formatPct(bilan.seuil ?? 0, { decimales: 1 })} nécessaires à l’équilibre.`
                  : `${formatPct(bilan.tauxTp)} au TP, sous les ${formatPct(bilan.seuil ?? 0, { decimales: 1 })} nécessaires à l’équilibre.`}
            </p>
            <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
              Choisi à la main, donc flatteur par construction. Ne s’additionne à aucun autre lot.
            </p>
          </Panneau>
        </div>
      </div>
    </>
  )
}
