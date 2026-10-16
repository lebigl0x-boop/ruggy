'use client'

import { useMemo, useState } from 'react'

import {
  analyserLotAction,
  importerScreeningAction,
  importerTestAction,
  listerAchatsDuJourAction,
  type LigneImport,
} from '@/app/actions'
import {
  alertesDeLigne,
  aTrancher,
  BASE_ISSUE,
  etatsDesLignes,
  FENETRE_ATH_HEURES,
  issuesConnues,
  LIBELLE_ALERTE,
  mcEntreeUsd,
  mcSommetUsd,
  multipleRetenu,
  multipleVise,
  numerosDeRelance,
  TOKENS_EN_PARALLELE,
  type EtatIssue,
  type LigneAnalyse,
} from '@/lib/analyse'
import { bilanSimule } from '@/lib/calcul'
import { adresseCourte, formatMcUsd, formatPct, formatSol, PADRE_URL } from '@/lib/format'
import { formatDelai, heureParis, hier } from '@/lib/journee'
import type { Issue, WalletComplet } from '@/lib/repo/types'
import { Courbe } from '../charts/courbe'
import { cn } from '../ui/cn'
import { BoutonCopier } from '../ui/copier'
import { ExternalIcon } from '../ui/icons'
import { Sheet } from '../ui/sheet'
import { Bande, Chiffre, Rangee, Tableau } from '../ui/table'
import { BoutonsIssue } from './pieces'

/**
 * L'analyse automatique d'une journée.
 *
 * Le découpage en deux temps n'est pas cosmétique : lister les achats tient en
 * un appel, établir les ATH en demande des centaines. Une seule action
 * dépasserait tout délai d'exécution et ne donnerait aucune nouvelle avant la
 * fin. Ici, la liste arrive d'abord, puis chaque ligne se complète sous les
 * yeux — et un token qui échoue affiche son message sans arrêter les autres.
 *
 * L'issue n'est jamais enregistrée par l'analyse : elle se déduit du multiple
 * et du TP du wallet à chaque rendu. Changer le TP met le tableau à jour sans
 * relancer quoi que ce soit, et le forçage manuel reste prioritaire.
 */

type Etape = 'choix' | 'analyse' | 'resultats'

export function AnalyseJournee({
  wallet,
  ouvert,
  onFermer,
  onImporte,
}: {
  wallet: WalletComplet
  ouvert: boolean
  onFermer: () => void
  /** Pour que la page recharge ses données après un import. */
  onImporte: () => void
}) {
  const [jour, setJour] = useState(() => hier(new Date()))
  const [etape, setEtape] = useState<Etape>('choix')
  const [lignes, setLignes] = useState<LigneAnalyse[]>([])
  const [analyseLe, setAnalyseLe] = useState<string | null>(null)
  const [depuisCache, setDepuisCache] = useState(false)
  const [prixSol, setPrixSol] = useState<number | null>(null)
  const [appels, setAppels] = useState(0)
  const [refus, setRefus] = useState(0)
  const [avancement, setAvancement] = useState<{ fait: number; total: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [forcages, setForcages] = useState<Map<string, Issue>>(new Map())
  const [conflitTest, setConflitTest] = useState<LigneImport[] | null>(null)
  const [occupe, setOccupe] = useState(false)

  const tp = wallet.reglages.tp
  const etats = useMemo(() => etatsDesLignes(lignes, tp, forcages), [lignes, tp, forcages])
  const connues = useMemo(() => issuesConnues(etats), [etats])
  const bilan = useMemo(() => bilanSimule(connues, wallet.reglages), [connues, wallet.reglages])
  /** Les lignes qu'il reste à trancher : elles bloquent l'import. */
  const indetermines = aTrancher(etats)
  const relances = useMemo(() => numerosDeRelance(lignes), [lignes])

  /** Les mints déjà présents dans un lot : on le signale, on ne bloque rien. */
  const dejaScreening = useMemo(
    () => new Set(wallet.tokens.filter((t) => t.phase === 'screening').map((t) => t.mint)),
    [wallet.tokens],
  )
  const dejaTest = useMemo(
    () => new Set(wallet.tokens.filter((t) => t.phase === 'test').map((t) => t.mint)),
    [wallet.tokens],
  )

  function reinitialiser() {
    setEtape('choix')
    setLignes([])
    setAnalyseLe(null)
    setDepuisCache(false)
    setPrixSol(null)
    setAppels(0)
    setRefus(0)
    setAvancement(null)
    setErreur(null)
    setForcages(new Map())
    setConflitTest(null)
  }

  function fermer() {
    reinitialiser()
    onFermer()
  }

  async function lancer(forcer: boolean) {
    setOccupe(true)
    setErreur(null)
    setEtape('analyse')
    setLignes([])
    setForcages(new Map())
    setAvancement(null)

    const premier = await listerAchatsDuJourAction(wallet.id, jour, { forcer })

    if (!premier.ok) {
      setErreur(premier.message)
      setEtape('choix')
      setOccupe(false)
      return
    }

    const journee = premier.journee
    setLignes(journee.lignes)
    setAnalyseLe(journee.analyseLe)
    setDepuisCache(journee.depuisCache)
    setPrixSol(journee.prixSolUsd)
    let total = journee.appels

    // Le cache répond pour la journée entière : rien à recalculer.
    if (journee.depuisCache) {
      setAppels(journee.appels)
      setEtape('resultats')
      setOccupe(false)
      return
    }

    // Les ATH, par lots. Le parallélisme vit dans l'action : Next.js n'expédie
    // qu'une Server Action à la fois par client, donc lancer trois appels
    // d'ici ne ferait que les mettre à la queue. Un lot par aller-retour, et
    // l'avancement progresse d'autant.
    const aFaire = journee.lignes
    setAvancement({ fait: 0, total: aFaire.length })
    let refus = 0

    for (let i = 0; i < aFaire.length; i += TOKENS_EN_PARALLELE) {
      const lot = aFaire.slice(i, i + TOKENS_EN_PARALLELE).map((ligne) => ligne.mint)
      const resultat = await analyserLotAction(wallet.id, jour, lot)
      total += resultat.appels
      refus += resultat.refus

      setLignes((precedentes) =>
        precedentes.map((ligne) => {
          const abouti = resultat.resultats.find((r) =>
            r.ok ? r.ligne.mint === ligne.mint : r.mint === ligne.mint,
          )
          if (abouti === undefined) return ligne
          return abouti.ok ? abouti.ligne : { ...ligne, erreur: abouti.message }
        }),
      )
      setAvancement({ fait: Math.min(i + lot.length, aFaire.length), total: aFaire.length })
    }

    setRefus(refus)
    setAppels(total)
    setEtape('resultats')
    setOccupe(false)
  }

  function forcer(mint: string, issue: Issue) {
    setForcages((precedent) => {
      const suivant = new Map(precedent)
      suivant.set(mint, issue)
      return suivant
    })
  }

  /**
   * Les lignes telles qu'elles partent à l'import.
   *
   * Appelé seulement quand plus aucune ligne n'est indéterminée : le repli sur
   * « rate » n'est là que pour satisfaire le typage.
   */
  function versImport(): LigneImport[] {
    return lignes.map((ligne, i) => ({
      nom: ligne.nom,
      mint: ligne.mint,
      issue: etats[i] === 'inconnue' || etats[i] === 'verifier' ? 'rate' : (etats[i] ?? 'rate'),
    }))
  }

  async function importerScreening() {
    setOccupe(true)
    await importerScreeningAction(wallet.id, versImport())
    setOccupe(false)
    onImporte()
    fermer()
  }

  async function importerTest(remplacer: boolean) {
    setOccupe(true)
    const charge = conflitTest ?? versImport()
    const resultat = await importerTestAction(wallet.id, jour, charge, { remplacer })
    setOccupe(false)

    if (!resultat.ok) {
      if (resultat.conflit === true) {
        setConflitTest(charge)
        return
      }
      setErreur(resultat.message)
      return
    }

    setConflitTest(null)
    onImporte()
    fermer()
  }

  const doublonsScreening = lignes.filter((l) => dejaScreening.has(l.mint)).length
  const doublonsTest = lignes.filter((l) => dejaTest.has(l.mint)).length
  const seuil = multipleVise(tp)

  return (
    <Sheet open={ouvert} onClose={fermer} title={`Analyser une journée`} large>
      {erreur !== null ? (
        <p className="mb-4 rounded-card bg-red-soft px-4 py-3 text-[14px] text-red">
          {erreur}
        </p>
      ) : null}

      {/* --- Choix de la journée ------------------------------------------ */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-ink-2">Journée (heure de Paris)</span>
          <input
            type="date"
            value={jour}
            onChange={(event) => {
              setJour(event.target.value)
              reinitialiser()
            }}
            className="rounded-[10px] bg-card-2 px-3 py-2.5 text-[17px] outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => void lancer(false)}
          disabled={occupe || jour === ''}
          className="rounded-full bg-blue px-4 py-2.5 text-[14px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          {etape === 'analyse' ? 'Analyse…' : 'Lancer'}
        </button>

        {etape === 'resultats' ? (
          <button
            type="button"
            onClick={() => void lancer(true)}
            disabled={occupe}
            className="rounded-full bg-fill px-4 py-2.5 text-[14px] font-medium text-ink transition hover:bg-hi active:scale-95 disabled:opacity-50"
          >
            Réanalyser
          </button>
        ) : null}

        <span className="text-[12.5px] text-ink-3">
          {depuisCache && analyseLe !== null
            ? `Analysée le ${new Date(analyseLe).toLocaleString('fr-FR')}`
            : `Fenêtre ATH : ${FENETRE_ATH_HEURES} h après chaque achat`}
        </span>
      </div>

      {/* --- Progression --------------------------------------------------- */}
      {etape === 'analyse' ? (
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[13px] text-ink-2">
            <span>
              {avancement === null
                ? 'Recherche des achats de la journée…'
                : `Analyse des tokens — ${avancement.fait} / ${avancement.total}`}
            </span>
            {avancement !== null && avancement.total > 0 ? (
              <span className="text-ink-3">
                {formatPct((avancement.fait / avancement.total) * 100)}
              </span>
            ) : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fill">
            <div
              className="h-full rounded-full bg-blue transition-[width] duration-300"
              style={{
                width:
                  avancement === null || avancement.total === 0
                    ? '8%'
                    : `${(avancement.fait / avancement.total) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* --- Résultats ----------------------------------------------------- */}
      {lignes.length > 0 ? (
        <>
          <Bande>
            <Chiffre
              label="Tokens achetés"
              valeur={String(lignes.length)}
              detail={
                indetermines > 0 ? `${bilan.tokens} chiffrés` : 'un par lancement'
              }
            />
            <Chiffre
              label="TP atteints"
              valeur={String(bilan.tp)}
              detail={`seuil ×${seuil} · ATH ${BASE_ISSUE === 'brut' ? 'brut' : 'exéc.'}`}
            />
            <Chiffre
              label="Taux au TP"
              valeur={formatPct(bilan.tauxTp)}
              detail={indetermines > 0 ? `${indetermines} à trancher` : `TP ${tp} %`}
              ton={indetermines > 0 ? 'rouge' : undefined}
            />
            <Chiffre
              fort
              label="Résultat simulé"
              valeur={formatSol(bilan.resultat)}
              detail="mise et frais du wallet"
              ton={bilan.resultat > 0 ? 'vert' : bilan.resultat < 0 ? 'rouge' : undefined}
            />
          </Bande>

          {bilan.courbe.length > 1 ? (
            <div className="mb-3 rounded-card bg-card px-3 py-2.5">
              <Courbe points={bilan.courbe} hauteur={90} />
            </div>
          ) : null}

          <Tableau
            entetes={[
              { label: 'Token', classe: 'flex-1 min-w-[180px]' },
              { label: 'Heure', classe: 'w-[52px]' },
              { label: 'Achat', classe: 'w-[92px] text-right' },
              { label: 'MC entrée', classe: 'w-[104px] text-right' },
              { label: 'MC à l’ATH', classe: 'w-[112px] text-right' },
              { label: 'ATH brut', classe: 'w-[96px] text-right' },
              { label: '×max', classe: 'w-[70px] text-right' },
              { label: 'Délai', classe: 'w-[72px] text-right' },
              { label: 'Issue', classe: 'w-[132px]' },
            ]}
          >
            {lignes.map((ligne, index) => (
              <LigneTableau
                key={ligne.mint}
                ligne={ligne}
                etat={etats[index] ?? 'inconnue'}
                force={forcages.has(ligne.mint)}
                relance={relances.get(ligne.mint) ?? null}
                prixSol={prixSol}
                doublon={dejaScreening.has(ligne.mint) || dejaTest.has(ligne.mint)}
                onIssue={(valeur) => forcer(ligne.mint, valeur)}
              />
            ))}
          </Tableau>

          {/* --- Import ----------------------------------------------------- */}
          {etape === 'resultats' ? (
            <div className="mt-5">
              {doublonsScreening > 0 || doublonsTest > 0 ? (
                <p className="mb-2 text-[12.5px] text-orange">
                  {doublonsScreening > 0
                    ? `${doublonsScreening} de ces tokens sont déjà dans le screening. `
                    : ''}
                  {doublonsTest > 0
                    ? `${doublonsTest} sont déjà dans le test. `
                    : ''}
                  L’import les ajoutera quand même — à vous de voir.
                </p>
              ) : null}

              {conflitTest !== null ? (
                <div className="mb-3 rounded-card bg-orange-soft px-4 py-3">
                  <p className="text-[14px] text-ink">
                    Le {jour} est déjà relevé en test. Le remplacer effacera son relevé
                    actuel et ses lancements.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void importerTest(true)}
                      disabled={occupe}
                      className="rounded-full bg-orange px-3.5 py-1.5 text-[13px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
                    >
                      Remplacer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConflitTest(null)}
                      className="rounded-full bg-fill px-3.5 py-1.5 text-[13px] font-medium text-ink transition hover:bg-hi active:scale-95"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : null}

              {indetermines > 0 ? (
                <p className="mb-2 rounded-card bg-red-soft px-4 py-3 text-[13px] text-red">
                  {indetermines} ligne{indetermines > 1 ? 's' : ''} à trancher : soit
                  l’ATH est un minorant qui n’atteint pas le seuil — rien ne dit alors si
                  le TP a été touché —, soit un contrôle de vraisemblance s’est
                  déclenché. Dans les deux cas l’outil refuse de décider à votre place,
                  et l’import attend que vous le fassiez avec les boutons TP / Raté.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void importerScreening()}
                  disabled={occupe || indetermines > 0}
                  className="rounded-[11px] bg-violet px-4 py-2.5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  Ajouter au screening ({lignes.length})
                </button>
                <button
                  type="button"
                  onClick={() => void importerTest(false)}
                  disabled={occupe || indetermines > 0}
                  className="rounded-[11px] bg-orange px-4 py-2.5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  Ajouter au test ({jour})
                </button>
              </div>

              {appels > 0 ? (
                <p className="mt-3 text-[12px] text-ink-3">
                  {appels} appels Helius
                  {refus > 0 ? `, dont ${refus} réessais après refus` : ''}.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : etape === 'resultats' ? (
        <div className="rounded-card bg-card px-4 py-10 text-center">
          <p className="text-[15px] text-ink-2">Aucun achat ce jour-là.</p>
          <p className="mt-1 text-[12.5px] text-ink-3">
            Enregistrer la journée en test la compte comme une journée sans lancement.
          </p>
          <button
            type="button"
            onClick={() => void importerTest(false)}
            disabled={occupe}
            className="mt-4 rounded-full bg-orange px-4 py-2 text-[13.5px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            Enregistrer une journée sans lancement
          </button>
        </div>
      ) : null}
    </Sheet>
  )
}

/** Une ligne du tableau d'analyse. */
function LigneTableau({
  ligne,
  etat,
  force,
  relance,
  prixSol,
  doublon,
  onIssue,
}: {
  ligne: LigneAnalyse
  etat: EtatIssue
  force: boolean
  relance: number | null
  prixSol: number | null
  doublon: boolean
  onIssue: (issue: Issue) => void
}) {
  const enAttente = ligne.prixSommetExec === null && ligne.erreur === null

  /**
   * Un ATH tronqué l'est pour deux raisons très différentes, et elles ne se
   * lisent pas pareil : soit on s'est arrêté parce que le TP était acquis —
   * auquel cas l'issue est certaine et seul le sommet exact manque —, soit la
   * fenêtre n'a pas été parcourue, et là c'est l'issue elle-même qui reste en
   * suspens.
   */
  const multiple = multipleRetenu(ligne)
  const alertes = alertesDeLigne(ligne)
  const entreeUsd = mcEntreeUsd(ligne)
  const sommetUsd = mcSommetUsd(ligne)
  const sommetSol =
    ligne.supply === null || multiple === null ? null : ligne.prixEntree * ligne.supply * multiple
  const arreteAuTp = ligne.athPartiel && etat === 'tp'
  const incertain = etat === 'inconnue' && multiple !== null

  return (
    <Rangee>
      <span className="flex min-w-[180px] flex-1 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[14px]">
          {ligne.nom ?? adresseCourte(ligne.mint)}
          {relance !== null ? (
            <span className="ml-1.5 rounded-full bg-fill px-1.5 py-0.5 text-[10.5px] text-ink-2">
              relance {relance}
            </span>
          ) : null}
          {doublon ? (
            <span className="ml-1.5 rounded-full bg-orange-soft px-1.5 py-0.5 text-[10.5px] text-orange">
              déjà noté
            </span>
          ) : null}
          <BoutonCopier
            valeur={ligne.mint}
            ariaLabel="Copier l’adresse du token"
            className="ml-1.5 font-mono text-[11px] text-ink-3 hover:text-ink-2"
          >
            {adresseCourte(ligne.mint)}
          </BoutonCopier>
        </span>
        <a
          href={PADRE_URL(ligne.mint)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Ouvrir sur Padre"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink"
        >
          <ExternalIcon className="h-[12px] w-[12px]" />
        </a>
      </span>

      <span className="w-[52px] text-[13px] text-ink-2 tabular-nums">
        {heureParis(ligne.acheteA)}
      </span>

      <span className="w-[92px] text-right text-[13px] tabular-nums">
        {formatSol(ligne.solPaye, { signe: false })}
      </span>

      <span className="w-[104px] text-right text-[13px] tabular-nums">
        {entreeUsd === null
          ? `${ligne.mcEntreeSol.toFixed(1)} SOL`
          : formatMcUsd(entreeUsd)}
        <span className="block text-[10.5px] text-ink-3">
          {entreeUsd === null ? '—' : `${ligne.mcEntreeSol.toFixed(1)} SOL`}
        </span>
      </span>

      {/* La capitalisation au sommet, en dollars au taux de **cet instant-là**.
          Convertir au cours du jour de lecture donnerait un chiffre faux dès
          qu'on rouvre une journée passée. */}
      <span className="w-[112px] text-right text-[13px] tabular-nums">
        {ligne.erreur !== null ? (
          <span className="text-[11.5px] text-red">échec</span>
        ) : enAttente ? (
          <span className="animate-pulse text-ink-3">…</span>
        ) : sommetSol === null ? (
          '—'
        ) : (
          <>
            {arreteAuTp ? '≥ ' : ''}
            {sommetUsd === null ? `${sommetSol.toFixed(1)} SOL` : formatMcUsd(sommetUsd)}
            <span className="block text-[10.5px] text-ink-3">
              {sommetUsd === null ? 'taux inconnu' : `${sommetSol.toFixed(1)} SOL`}
            </span>
            {arreteAuTp ? (
              <span
                title="Lecture arrêtée dès le TP atteint : l’issue est acquise, le sommet exact n’a pas été cherché."
                className="block text-[10.5px] text-green"
              >
                arrêté au TP
              </span>
            ) : incertain ? (
              <span
                title={`Fenêtre de ${FENETRE_ATH_HEURES} h non parcourue en entier : l’ATH est un minorant.`}
                className="block text-[10.5px] text-red"
              >
                minorant
              </span>
            ) : ligne.source !== 'tracker' ? (
              <span
                title={
                  ligne.source === 'mixte'
                    ? 'Bougies complétées par la relecture des swaps sur l’intervalle qu’elles ne couvraient pas.'
                    : ligne.source === 'bougies'
                      ? 'Solana Tracker n’a rien renvoyé : l’ATH vient des bougies GeckoTerminal.'
                      : 'Aucune source de bougies : l’ATH vient de la relecture des swaps, et tronque.'
                }
                className="block text-[10.5px] text-ink-3"
              >
                {ligne.source === 'mixte'
                  ? 'mixte'
                  : ligne.source === 'bougies'
                    ? 'gecko'
                    : 'swaps'}
              </span>
            ) : null}
          </>
        )}
      </span>

      {/* ATH brut : le plus haut « high », mèches comprises. Affiché pour
          mesurer la part de mèche, jamais utilisé pour décider (sauf bascule
          de BASE_ISSUE). */}
      <span className="w-[96px] text-right text-[12.5px] text-ink-2 tabular-nums">
        {ligne.prixSommetBrut === null || ligne.supply === null ? (
          '—'
        ) : (
          <>
            {ligne.solUsdSommet === null
              ? `${(ligne.prixSommetBrut * ligne.supply).toFixed(1)} SOL`
              : formatMcUsd(ligne.prixSommetBrut * ligne.supply * ligne.solUsdSommet)}
            {ligne.prixSommetExec !== null &&
            ligne.prixSommetBrut > ligne.prixSommetExec * 1.5 ? (
              <span
                title="Le plus haut touché dépasse de moitié le plus haut tenu : l’essentiel du sommet est une mèche."
                className="block text-[10.5px] text-orange"
              >
                mèche
              </span>
            ) : null}
          </>
        )}
      </span>

      <span
        className="w-[72px] text-right text-[12.5px] text-ink-2 tabular-nums"
        title={
          arreteAuTp
            ? 'Délai au bout duquel le TP était atteint.'
            : 'Délai entre le premier achat et le sommet.'
        }
      >
        {ligne.athA === null ? '—' : formatDelai(ligne.athA - ligne.acheteA)}
      </span>

      <span className="flex w-[132px] items-center gap-1.5">
        <BoutonsIssue
          valeur={etat === 'inconnue' || etat === 'verifier' ? null : etat}
          onChange={onIssue}
          taille="compact"
        />
        {force ? <span className="text-[10.5px] text-ink-3">forcé</span> : null}
      </span>

      {ligne.erreur !== null ? (
        <span className="basis-full pt-1 text-[11.5px] text-red">{ligne.erreur}</span>
      ) : alertes.length > 0 ? (
        <span className="basis-full pt-1 text-[11.5px] text-orange">
          À vérifier — {alertes.map((a) => LIBELLE_ALERTE[a]).join(' · ')}
        </span>
      ) : null}
    </Rangee>
  )
}
