'use client'

import { useState } from 'react'

import type { BilanTrade } from '@/lib/calcul'
import { formatJour, formatPct, formatSol, todayIso } from '@/lib/format'
import type { TradeComplet } from '@/lib/repo/types'
import { Courbe } from '../charts/courbe'
import { ChampNomToken } from '../token/champ-nom-token'
import { cn } from '../ui/cn'
import { CloseIcon } from '../ui/icons'
import { Bande, Chiffre, Panneau, Rangee, Tableau } from '../ui/table'
import { BoutonsIssue } from './pieces'

/**
 * La phase de trade : ce qu'on a réellement joué.
 *
 * Le résultat est `sortie − entrée`, et rien d'autre. Les réglages du wallet
 * n'interviennent que pour le contrefactuel — ce que le test prédisait sur ces
 * mêmes trades. C'est l'écart entre les deux qui dit si la phase de test sert
 * à quelque chose.
 */
export function VueTrade({
  bilan,
  trades,
  onAjouter,
  onSupprimer,
}: {
  bilan: BilanTrade
  trades: readonly TradeComplet[]
  onAjouter: (entree: {
    date: string
    nom: string | null
    mint: string | null
    entreeSol: string
    sortieSol: string
    issue: 'tp' | 'rate'
  }) => void
  onSupprimer: (id: string) => void
}) {
  return (
    <>
      <Bande>
        <Chiffre
          fort
          label="Résultat réel"
          valeur={formatSol(bilan.resultat)}
          detail={`${bilan.trades} trade${bilan.trades > 1 ? 's' : ''} joué${bilan.trades > 1 ? 's' : ''}`}
          ton={bilan.resultat > 0 ? 'vert' : bilan.resultat < 0 ? 'rouge' : undefined}
        />
        <Chiffre
          label="Rendement"
          valeur={bilan.rendement !== null ? formatPct(bilan.rendement, { signe: true }) : '—'}
          detail="sur le capital engagé"
          ton={bilan.rendement === null ? undefined : bilan.rendement > 0 ? 'vert' : 'rouge'}
        />
        <Chiffre
          label="Engagé → récupéré"
          valeur={formatSol(bilan.engage, { signe: false })}
          detail={`${formatSol(bilan.recupere, { signe: false })} rentrés`}
        />
        <Chiffre
          label="Taux au TP"
          valeur={bilan.trades > 0 ? formatPct(bilan.tauxTp) : '—'}
          detail={bilan.trades > 0 ? `${bilan.tp} sur ${bilan.trades}` : 'rien de joué'}
        />
        <Chiffre
          label="Prévu par le test"
          valeur={formatSol(bilan.prevuParTest)}
          detail="mêmes trades, simulés"
        />
        <Chiffre
          label="Écart"
          valeur={bilan.ecartPct !== null ? formatPct(bilan.ecartPct, { signe: true }) : '—'}
          detail={
            bilan.ecartPct === null
              ? 'rien à comparer'
              : bilan.ecartPct < 0
                ? 'test optimiste'
                : 'test sous-estimait'
          }
          ton={bilan.ecartPct === null ? undefined : bilan.ecartPct < 0 ? 'rouge' : 'vert'}
        />
      </Bande>

      {bilan.alerteArret ? (
        <p className="mb-2 rounded-card bg-orange-soft px-3 py-2 text-[12.5px] leading-relaxed text-orange">
          <b className="font-semibold">Règle d’arrêt</b> — un gagnant ou moins sur
          les {bilan.fenetreArret} derniers trades. Rien n’est bloqué : à vous de
          voir si ce wallet mérite encore du SOL.
        </p>
      ) : null}

      <FormulaireTrade onAjouter={onAjouter} />

      <div className="grid gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panneau titre={`Trades · ${bilan.trades}`}>
          <Tableau
            entetes={[
              { label: 'Date', classe: 'w-[100px]' },
              { label: 'Token', classe: 'min-w-[140px] flex-1' },
              { label: 'Issue', classe: 'w-[60px]' },
              { label: 'Entrée', classe: 'w-[90px] text-right' },
              { label: 'Sortie', classe: 'w-[90px] text-right' },
              { label: 'Résultat', classe: 'w-[95px] text-right' },
              { label: '', classe: 'w-7' },
            ]}
            vide={
              trades.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-3">
                  Aucun trade enregistré. Notez-en un dès que vous le soldez,
                  avec l’entrée et la sortie en SOL.
                </p>
              ) : undefined
            }
          >
            {[...trades]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((trade) => {
                const resultat = trade.sortieSol - trade.entreeSol
                return (
                  <Rangee key={trade.id} className="group/ligne">
                    <span className="w-[100px] shrink-0 text-ink-2 tabular-nums">
                      {formatJour(trade.date)}
                    </span>
                    <span className="min-w-[140px] flex-1 truncate text-ink">
                      {trade.nom ?? 'Sans nom'}
                    </span>
                    <span className="w-[60px] shrink-0">
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold',
                          trade.issue === 'tp'
                            ? 'bg-green-soft text-green'
                            : 'bg-red-soft text-red',
                        )}
                      >
                        {trade.issue === 'tp' ? 'TP' : 'Raté'}
                      </span>
                    </span>
                    <span className="w-[90px] shrink-0 text-right text-ink-3 tabular-nums">
                      {formatSol(trade.entreeSol, { signe: false })}
                    </span>
                    <span className="w-[90px] shrink-0 text-right text-ink-3 tabular-nums">
                      {formatSol(trade.sortieSol, { signe: false })}
                    </span>
                    <span
                      className={cn(
                        'w-[95px] shrink-0 text-right font-semibold tabular-nums',
                        resultat > 0 ? 'text-green' : resultat < 0 ? 'text-red' : 'text-ink-2',
                      )}
                    >
                      {formatSol(resultat)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSupprimer(trade.id)}
                      aria-label="Supprimer ce trade"
                      className="flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-red active:scale-90 md:opacity-0 md:group-hover/ligne:opacity-100 md:focus-visible:opacity-100"
                    >
                      <CloseIcon className="h-[14px] w-[14px]" />
                    </button>
                  </Rangee>
                )
              })}
          </Tableau>
        </Panneau>

        <div>
          <Panneau titre="Résultat cumulé">
            <div className="px-3 py-2.5">
              <Courbe points={bilan.parTrade} hauteur={118} />
            </div>
          </Panneau>

          <Panneau titre="Lecture">
            <p className="px-3 py-2 text-[12.5px] leading-snug text-ink-2">
              {bilan.trades === 0
                ? 'Dès qu’un trade est chiffré, l’écart au test dit si la simulation prédit quoi que ce soit.'
                : bilan.ecartPct === null
                  ? 'Le test ne prédit rien sur ces trades : rien à comparer.'
                  : bilan.ecartPct < 0
                    ? `Le réel rend ${formatPct(Math.abs(bilan.ecartPct))} de moins que le test annonçait : la simulation est optimiste sur ce wallet.`
                    : `Le réel rend ${formatPct(bilan.ecartPct)} de plus que le test annonçait : la simulation sous-estime ce wallet.`}
            </p>
            <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
              Argent compté : frais réseau et slippage déjà dans les montants saisis.
            </p>
          </Panneau>
        </div>
      </div>
    </>
  )
}

/** Le formulaire rapide : un trade se note en quelques secondes, ou pas du tout. */
function FormulaireTrade({
  onAjouter,
}: {
  onAjouter: (entree: {
    date: string
    nom: string | null
    mint: string | null
    entreeSol: string
    sortieSol: string
    issue: 'tp' | 'rate'
  }) => void
}) {
  const [date, setDate] = useState(todayIso)
  const [nom, setNom] = useState<string | null>(null)
  const [mint, setMint] = useState<string | null>(null)
  const [entreeSol, setEntreeSol] = useState('')
  const [sortieSol, setSortieSol] = useState('')
  const [issue, setIssue] = useState<'tp' | 'rate'>('tp')

  const pret = entreeSol.trim() !== '' && sortieSol.trim() !== ''

  return (
    <Panneau titre="Enregistrer un trade">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <input
          type="date"
          value={date}
          aria-label="Date du trade"
          onChange={(event) => setDate(event.target.value)}
          className="rounded-[7px] bg-fill px-2.5 py-1.5 text-[13px] tabular-nums outline-none"
        />

        <span className="min-w-[160px] flex-1 rounded-[7px] bg-fill px-2.5 py-1.5 text-[13px]">
          <ChampNomToken
            numero={0}
            nom={nom}
            mint={mint}
            onChange={(patch) => {
              setNom(patch.nom)
              setMint(patch.mint)
            }}
          />
        </span>

        <input
          value={entreeSol}
          onChange={(event) => setEntreeSol(event.target.value)}
          inputMode="decimal"
          placeholder="entrée"
          aria-label="SOL engagé"
          className="w-[86px] rounded-[7px] bg-fill px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none placeholder:text-ink-3"
        />
        <input
          value={sortieSol}
          onChange={(event) => setSortieSol(event.target.value)}
          inputMode="decimal"
          placeholder="sortie"
          aria-label="SOL récupéré"
          className="w-[86px] rounded-[7px] bg-fill px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none placeholder:text-ink-3"
        />

        <BoutonsIssue valeur={issue} onChange={setIssue} taille="compact" />

        <button
          type="button"
          onClick={() => {
            onAjouter({ date, nom, mint, entreeSol, sortieSol, issue })
            setNom(null)
            setMint(null)
            setEntreeSol('')
            setSortieSol('')
            setIssue('tp')
          }}
          disabled={!pret}
          className={cn(
            'ml-auto rounded-full px-4 py-1.5 text-[13px] font-semibold transition',
            pret
              ? 'bg-blue text-white hover:opacity-90 active:scale-95'
              : 'cursor-not-allowed bg-fill text-ink-3',
          )}
        >
          Enregistrer
        </button>
      </div>
    </Panneau>
  )
}
