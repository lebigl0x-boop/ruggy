'use client'

import { useMemo, useState, type ReactNode } from 'react'

import { multipleVise } from '@/lib/analyse'
import {
  multipleMax,
  multipleRealise,
  type BilanTrade,
  type Issue,
  type Reglages,
} from '@/lib/calcul'
import {
  formatJour,
  formatMcUsd,
  formatMultiple,
  formatPct,
  formatSeuil,
  formatSol,
  todayIso,
} from '@/lib/format'
import type { TradeComplet } from '@/lib/repo/types'
import { parseMontantCourt, parseNombreFr } from '@/lib/validation'
import { Courbe } from '../charts/courbe'
import { ChampNomToken } from '../token/champ-nom-token'
import { cn } from '../ui/cn'
import { CloseIcon } from '../ui/icons'
import { Bande, Chiffre, Panneau, Rangee, Tableau } from '../ui/table'
import { Calendrier, Legende, moisDe, type MarqueJour } from './calendrier'
import { BoutonsIssue } from './pieces'

/** Ce que le formulaire remonte. La mise, elle, est lue côté serveur. */
export type SaisieTrade = {
  date: string
  nom: string | null
  mint: string | null
  pnlSol: string
  mcEntree: string
  mcSortie: string
  mcAth: string
  issue: Issue
}

/**
 * La phase de trade : ce qu'on a réellement joué.
 *
 * Le résultat est le PNL, recopié du portefeuille — la seule donnée mesurée de
 * l'écran. La mise vient des réglages du wallet, pas d'une ressaisie : elle est
 * la même à chaque trade, et la retaper n'ajoutait que des occasions de se
 * tromper.
 *
 * Les capitalisations sont d'une autre nature : elles disent ce que le *token*
 * a fait quand le PNL dit ce que le *portefeuille* a fait. Entrée et sortie
 * donnent le multiple réalisé, l'ATH donne celui qui était sur la table — et
 * l'écart entre les deux est la seule mesure honnête de la sortie.
 *
 * Les réglages du wallet n'entrent dans aucun résultat : ils servent au
 * contrefactuel — ce que le test prédisait sur ces mêmes trades.
 *
 * Le calendrier est celui du test, avec les mêmes gestes : un point par jour
 * soldé, vert ou rouge selon le PNL de la journée, et cliquer une date réduit
 * le tableau à ses trades. Un second clic sur la même date le rouvre en entier
 * — on ne reste jamais coincé dans un jour.
 */
export function VueTrade({
  bilan,
  trades,
  reglages,
  onAjouter,
  onSupprimer,
}: {
  bilan: BilanTrade
  trades: readonly TradeComplet[]
  reglages: Reglages
  onAjouter: (entree: SaisieTrade) => void
  onSupprimer: (id: string) => void
}) {
  const [aujourdhui] = useState(todayIso)
  const [mois, setMois] = useState(() => moisDe(aujourdhui))
  /** Jour choisi dans le calendrier. `null` = tous les trades. */
  const [selection, setSelection] = useState<string | null>(null)

  // Le PNL d'une journée est la somme des trades soldés ce jour-là : la même
  // addition que le résultat réel, mais arrêtée à la date.
  const journees = useMemo(() => {
    const table = new Map<string, { trades: number; resultat: number }>()
    for (const trade of trades) {
      const jour = table.get(trade.date) ?? { trades: 0, resultat: 0 }
      jour.trades += 1
      jour.resultat += trade.sortieSol - trade.entreeSol
      table.set(trade.date, jour)
    }
    return table
  }, [trades])

  const marques = useMemo(() => {
    const table = new Map<string, MarqueJour>()
    for (const [jour, { trades: nombre, resultat }] of journees) {
      table.set(jour, {
        ton: resultat > 0 ? 'vert' : resultat < 0 ? 'rouge' : 'neutre',
        titre: `${nombre} trade${nombre > 1 ? 's' : ''} · ${formatSol(resultat)}`,
      })
    }
    return table
  }, [journees])

  const visibles = useMemo(
    () =>
      trades
        .filter((trade) => selection === null || trade.date === selection)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [trades, selection],
  )

  const jourChoisi = selection !== null ? journees.get(selection) : undefined

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

      <Bande colonnes={3}>
        <Chiffre
          label="Multiple moyen"
          valeur={bilan.multipleMoyen !== null ? formatMultiple(bilan.multipleMoyen) : '—'}
          detail={
            bilan.avecMultiple > 0
              ? `sur ${bilan.avecMultiple} trade${bilan.avecMultiple > 1 ? 's' : ''} chiffré${bilan.avecMultiple > 1 ? 's' : ''} · TP visé ${formatSeuil(multipleVise(reglages.tp))}`
              : 'notez entrée et sortie en market cap'
          }
        />
        <Chiffre
          label="Max possible"
          valeur={bilan.multipleMaxMoyen !== null ? formatMultiple(bilan.multipleMaxMoyen) : '—'}
          detail={
            bilan.avecAth > 0
              ? `à l’ATH, sur ${bilan.avecAth} trade${bilan.avecAth > 1 ? 's' : ''}`
              : 'notez l’ATH du token'
          }
        />
        <Chiffre
          label="Laissé sur la table"
          valeur={bilan.manque !== null ? formatSol(bilan.manque, { signe: false }) : '—'}
          detail={
            bilan.capture !== null
              ? `${formatPct(bilan.capture)} du potentiel capté`
              : 'rien à comparer'
          }
          ton={bilan.manque !== null && bilan.manque > 0 ? 'orange' : undefined}
        />
      </Bande>

      {bilan.alerteArret ? (
        <p className="mb-2 rounded-card bg-orange-soft px-3 py-2 text-[12.5px] leading-relaxed text-orange">
          <b className="font-semibold">Règle d’arrêt</b> — un gagnant ou moins sur
          les {bilan.fenetreArret} derniers trades. Rien n’est bloqué : à vous de
          voir si ce wallet mérite encore du SOL.
        </p>
      ) : null}

      <FormulaireTrade reglages={reglages} onAjouter={onAjouter} />

      <div className="grid gap-2 xl:grid-cols-[304px_minmax(0,1fr)]">
        <Panneau titre={`Journées · ${journees.size}`}>
          <Calendrier
            mois={mois}
            onMois={setMois}
            marques={marques}
            selection={selection}
            onSelection={(jour) =>
              setSelection((precedent) => (precedent === jour ? null : jour))
            }
            aujourdhui={aujourdhui}
            legende={
              <>
                <Legende classe="bg-green" libelle="journée gagnante" />
                <Legende classe="bg-red" libelle="perdante" />
                <Legende classe="bg-ink-3" libelle="à l’équilibre" />
                <span>· un jour nu n’a rien de joué</span>
              </>
            }
          />
        </Panneau>

        <Panneau
          titre={
            selection === null
              ? `Trades · ${bilan.trades}`
              : `Journée du ${formatJour(selection)}`
          }
          action={
            selection === null ? null : (
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'text-[13px] font-semibold tabular-nums',
                    (jourChoisi?.resultat ?? 0) > 0
                      ? 'text-green'
                      : (jourChoisi?.resultat ?? 0) < 0
                        ? 'text-red'
                        : 'text-ink-3',
                  )}
                >
                  {formatSol(jourChoisi?.resultat ?? 0)}
                </span>
                <span className="text-[11.5px] text-ink-3 tabular-nums">
                  {jourChoisi?.trades ?? 0} trade{(jourChoisi?.trades ?? 0) > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setSelection(null)}
                  className="text-[12px] text-ink-3 underline underline-offset-2 transition hover:text-ink"
                >
                  Tous les trades
                </button>
              </span>
            )
          }
        >
          <Tableau
            entetes={[
              { label: 'Date', classe: 'w-[92px]' },
              { label: 'Token', classe: 'min-w-[120px] flex-1' },
              { label: 'Issue', classe: 'w-[52px]' },
              { label: 'Market cap', classe: 'w-[136px] text-right' },
              { label: '×', classe: 'w-[56px] text-right' },
              { label: '× max', classe: 'w-[62px] text-right' },
              { label: 'PNL', classe: 'w-[88px] text-right' },
              { label: '', classe: 'w-7' },
            ]}
            vide={
              visibles.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-3">
                  {selection !== null
                    ? 'Aucun trade soldé ce jour-là. Cliquez à nouveau la date pour revoir tous les trades.'
                    : 'Aucun trade enregistré. Notez-en un dès que vous le soldez : le PNL tel qu’il apparaît dans le portefeuille, et les market caps d’entrée, de sortie et d’ATH.'}
                </p>
              ) : undefined
            }
          >
            {visibles
              .map((trade) => {
                const resultat = trade.sortieSol - trade.entreeSol
                const multiple = multipleRealise(trade)
                const max = multipleMax(trade)
                return (
                  <Rangee key={trade.id} className="group/ligne">
                    <span className="w-[92px] shrink-0 text-ink-2 tabular-nums">
                      {formatJour(trade.date)}
                    </span>
                    <span className="min-w-[120px] flex-1 truncate text-ink">
                      {trade.nom ?? 'Sans nom'}
                    </span>
                    <span className="w-[52px] shrink-0">
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
                    <span className="w-[136px] shrink-0 text-right text-ink-3 tabular-nums">
                      {trade.mcEntree ? (
                        <>
                          {formatMcUsd(trade.mcEntree)}
                          <span className="px-1 text-ink-3">→</span>
                          {trade.mcSortie ? formatMcUsd(trade.mcSortie) : '—'}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="w-[56px] shrink-0 text-right text-ink-2 tabular-nums">
                      {multiple !== null ? formatMultiple(multiple) : '—'}
                    </span>
                    <span
                      className="w-[62px] shrink-0 text-right tabular-nums"
                      title={
                        trade.mcAth ? `ATH à ${formatMcUsd(trade.mcAth)}` : undefined
                      }
                    >
                      {max !== null ? (
                        <span
                          className={cn(
                            multiple !== null && max >= multiple * 2 ? 'text-orange' : 'text-ink-3',
                          )}
                        >
                          {formatMultiple(max)}
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'w-[88px] shrink-0 text-right font-semibold tabular-nums',
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
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
          {bilan.capture !== null && bilan.manque !== null ? (
            <p className="border-t border-separator px-3 py-2 text-[12.5px] leading-snug text-ink-2">
              {bilan.capture >= 100
                ? `Vous avez pris tout ce qu’il y avait à prendre sur les ${bilan.avecAth} trade${bilan.avecAth > 1 ? 's' : ''} chiffré${bilan.avecAth > 1 ? 's' : ''}.`
                : `Sorti au sommet, ces ${bilan.avecAth} trade${bilan.avecAth > 1 ? 's' : ''} rendaient ${formatSol(bilan.potentiel ?? 0)} : ${formatSol(bilan.manque, { signe: false })} de plus. Personne ne sort à l’ATH — mais ${formatPct(bilan.capture)} capté dit si le TP est posé trop bas ou trop haut.`}
            </p>
          ) : null}
          <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
            Argent compté : le PNL saisi, frais réseau et slippage compris.
          </p>
        </Panneau>
      </div>
    </>
  )
}

/**
 * Le formulaire.
 *
 * Il calcule à l'écran ce qu'il va écrire — multiple réalisé, multiple maximal,
 * SOL laissés sur la table — avant d'enregistrer quoi que ce soit : une market
 * cap tapée de travers se voit immédiatement au multiple, là où elle passerait
 * inaperçue dans une colonne de plus.
 */
function FormulaireTrade({
  reglages,
  onAjouter,
}: {
  reglages: Reglages
  onAjouter: (entree: SaisieTrade) => void
}) {
  const [date, setDate] = useState(todayIso)
  const [nom, setNom] = useState<string | null>(null)
  const [mint, setMint] = useState<string | null>(null)
  const [mcEntree, setMcEntree] = useState('')
  const [mcSortie, setMcSortie] = useState('')
  const [mcAth, setMcAth] = useState('')
  const [pnlSol, setPnlSol] = useState('')
  /** `null` tant que l'issue est déduite du multiple ; un clic la fige. */
  const [issueForcee, setIssueForcee] = useState<Issue | null>(null)

  // Le même trade que celui qui sera écrit, pour le relire avant de l'écrire.
  const apercu = {
    date,
    entreeSol: reglages.mise,
    sortieSol: reglages.mise + (parseNombreFr(pnlSol) ?? 0),
    issue: 'tp' as Issue,
    mcEntree: parseMontantCourt(mcEntree),
    mcSortie: parseMontantCourt(mcSortie),
    mcAth: parseMontantCourt(mcAth),
  }

  const multiple = multipleRealise(apercu)
  const max = multipleMax(apercu)
  const potentiel = max !== null ? reglages.mise * (max - 1) : null

  // L'issue se déduit du multiple : le TP est un objectif de multiple, et le
  // comparer à la main revenait à refaire une division déjà faite. Un clic sur
  // les boutons tranche quand même — une sortie en deux fois, par exemple, ne
  // se lit pas dans le rapport des market caps.
  const issueDeduite: Issue | null =
    multiple === null ? null : multiple >= multipleVise(reglages.tp) ? 'tp' : 'rate'
  const issue = issueForcee ?? issueDeduite ?? 'tp'

  const pret = pnlSol.trim() !== '' && parseNombreFr(pnlSol) !== null

  function enregistrer() {
    onAjouter({ date, nom, mint, pnlSol, mcEntree, mcSortie, mcAth, issue })
    setNom(null)
    setMint(null)
    setMcEntree('')
    setMcSortie('')
    setMcAth('')
    setPnlSol('')
    setIssueForcee(null)
  }

  return (
    <Panneau titre="Enregistrer un trade">
      <div className="flex flex-wrap items-end gap-2 px-3 py-2">
        <Champ label="Date">
          <input
            type="date"
            value={date}
            aria-label="Date du trade"
            onChange={(event) => setDate(event.target.value)}
            className="w-[130px] rounded-[7px] bg-fill px-2.5 py-1.5 text-[13px] tabular-nums outline-none"
          />
        </Champ>

        <Champ label="Token" className="min-w-[150px] flex-1">
          <span className="block rounded-[7px] bg-fill px-2.5 py-1.5 text-[13px]">
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
        </Champ>

        <Champ label="MC entrée">
          <Montant valeur={mcEntree} onChange={setMcEntree} aria="Market cap à l’entrée" />
        </Champ>
        <Champ label="MC sortie">
          <Montant valeur={mcSortie} onChange={setMcSortie} aria="Market cap à la sortie" />
        </Champ>
        <Champ label="ATH">
          <Montant valeur={mcAth} onChange={setMcAth} aria="Market cap au plus haut" />
        </Champ>

        <Champ label="PNL (SOL)">
          <input
            value={pnlSol}
            onChange={(event) => setPnlSol(event.target.value)}
            inputMode="decimal"
            placeholder="+0,12"
            aria-label="PNL réel en SOL"
            className="w-[92px] rounded-[7px] bg-fill px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none placeholder:text-ink-3"
          />
        </Champ>

        <Champ label="Issue">
          <BoutonsIssue valeur={issue} onChange={setIssueForcee} />
        </Champ>

        <button
          type="button"
          onClick={enregistrer}
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

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-separator px-3 py-1.5 text-[12px] text-ink-3">
        <span>
          Mise <b className="font-semibold text-ink-2 tabular-nums">{formatSol(reglages.mise, { signe: false })}</b>{' '}
          (réglages du wallet)
        </span>
        <span>
          Multiple{' '}
          <b className="font-semibold text-ink tabular-nums">
            {multiple !== null ? formatMultiple(multiple) : '—'}
          </b>
        </span>
        <span>
          Max possible{' '}
          <b
            className={cn(
              'font-semibold tabular-nums',
              max !== null && multiple !== null && max >= multiple * 2 ? 'text-orange' : 'text-ink',
            )}
          >
            {max !== null ? formatMultiple(max) : '—'}
          </b>
          {potentiel !== null ? (
            <span className="text-ink-3"> · {formatSol(potentiel)} à l’ATH</span>
          ) : null}
        </span>
        {issueDeduite !== null && issueForcee === null ? (
          <span className="text-ink-3">
            Issue déduite du multiple (TP visé {formatSeuil(multipleVise(reglages.tp))})
          </span>
        ) : null}
        <span className="text-ink-3">Market caps : « 45k », « 1,2M » acceptés.</span>
      </p>
    </Panneau>
  )
}

/** Un champ du formulaire, son libellé au-dessus. */
function Champ({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  // Un `div` et non un `label` : la case Issue contient deux boutons, et un
  // libellé cliquable déclencherait le premier au moindre clic de côté. Chaque
  // champ porte déjà son `aria-label`.
  return (
    <div className={cn('block', className)}>
      <span className="mb-0.5 block text-[10.5px] font-medium tracking-[0.04em] text-ink-3 uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

/** Une market cap : saisie libre, abréviations comprises. */
function Montant({
  valeur,
  onChange,
  aria,
}: {
  valeur: string
  onChange: (valeur: string) => void
  aria: string
}) {
  return (
    <input
      value={valeur}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      placeholder="45k"
      aria-label={aria}
      className="w-[80px] rounded-[7px] bg-fill px-2.5 py-1.5 text-right text-[13px] tabular-nums outline-none placeholder:text-ink-3"
    />
  )
}
