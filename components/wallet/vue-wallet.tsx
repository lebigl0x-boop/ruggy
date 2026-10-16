'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  ajouterTokenAction,
  ajouterTradeAction,
  changerPhaseAction,
  compterContenuAction,
  modifierTokenAction,
  noterWalletAction,
  reglerAction,
  reglerRepereAction,
  releverJourAction,
  renommerWalletAction,
  supprimerJourAction,
  supprimerTokenAction,
  supprimerTradeAction,
  supprimerWalletAction,
} from '@/app/actions'
import { bilans } from '@/lib/resume'
import { adresseCourte, formatDate, SOLSCAN_URL } from '@/lib/format'
import {
  LIBELLE_PHASE,
  tokensDuJour,
  tokensScreening,
  type Decompte,
  type Phase,
  type Reglages,
  type WalletComplet,
} from '@/lib/repo/types'
import { BORNES } from '@/lib/validation'
import { Ecran } from '../ui/ecran'
import { NumberField, TextField } from '../ui/field'
import { Onglets } from '../ui/onglets'
import { BoutonCopier } from '../ui/copier'
import { ChevronLeftIcon, CloseIcon, ExternalIcon } from '../ui/icons'
import { ListGroup, ListLabel, ListRow } from '../ui/list'
import { PhaseBadge } from '../ui/phase-badge'
import { SaveIndicator } from '../ui/save-indicator'
import { Sheet } from '../ui/sheet'
import { useAutoSave } from '../ui/use-auto-save'
import { Action } from './pieces'
import { VueBilan } from './vue-bilan'
import { VueScreening } from './vue-screening'
import { VueTest } from './vue-test'
import { VueTrade } from './vue-trade'

/** Les réglages, dans l'ordre où on les lit. */
const REGLAGES: { champ: keyof Reglages; label: string; aide: string }[] = [
  { champ: 'mise', label: 'Mise', aide: 'Ce que vous engagez sur chaque lancement.' },
  { champ: 'tp', label: 'Take-profit', aide: 'La montée visée. L’atteindre fait un « TP ».' },
  { champ: 'frais', label: 'Frais', aide: 'Frais de réseau et de plateforme, par trade.' },
]

export function VueWallet({ wallet: initial }: { wallet: WalletComplet }) {
  const router = useRouter()
  const { status, schedule, run } = useAutoSave()

  // L'état local fait foi pendant l'édition : l'affichage réagit à la frappe,
  // l'écriture en base suit avec un léger retard.
  const [wallet, setWallet] = useState(initial)
  const [erreur, setErreur] = useState<string | null>(null)
  const [suppression, setSuppression] = useState<Decompte | null>(null)

  const prets = useMemo(() => bilans(wallet), [wallet])

  // L'onglet qu'on regarde n'est pas la phase où le wallet se trouve : on
  // ouvre sur sa phase, puis on consulte librement les autres lots. Un wallet
  // archivé s'ouvre sur son lot le plus avancé, sinon il s'ouvrirait sur un
  // écran vide.
  const [onglet, setOnglet] = useState<OngletWallet>('bilan')

  function majWallet(patch: Partial<WalletComplet>) {
    setWallet((precedent) => ({ ...precedent, ...patch }))
  }

  // --- Phase ---------------------------------------------------------------
  function changerPhase(phase: Phase) {
    majWallet({ phase })
    run(async () => {
      await changerPhaseAction(wallet.id, phase)
      router.refresh()
    })
  }

  // --- Réglages ------------------------------------------------------------
  function regler(champ: keyof Reglages, valeur: number | null) {
    majWallet({ reglages: { ...wallet.reglages, [champ]: valeur ?? wallet.reglages[champ] } })
    schedule(`reglage:${champ}`, async () => {
      const retenu = await reglerAction(wallet.id, champ, valeur)
      setWallet((precedent) => ({
        ...precedent,
        reglages: { ...precedent.reglages, [champ]: retenu },
      }))
    })
  }

  function reglerRepere(champ: 'tokensScreening' | 'joursTest', valeur: number | null) {
    majWallet({ [champ]: valeur ?? wallet[champ] } as Partial<WalletComplet>)
    schedule(`repere:${champ}`, async () => {
      const retenu = await reglerRepereAction(wallet.id, champ, valeur)
      setWallet((precedent) => ({ ...precedent, [champ]: retenu }))
    })
  }

  // --- Tokens --------------------------------------------------------------
  function ajouterToken(phase: 'screening' | 'test', issue: 'tp' | 'rate', jour?: string) {
    run(async () => {
      const token = await ajouterTokenAction(wallet.id, { phase, jour, issue })
      setWallet((precedent) => {
        // Noter un lancement relève sa journée côté base (voir `ajouterToken`
        // dans le repo) : la liste locale doit suivre, sinon le calendrier ne
        // marque le jour qu'au prochain aller-retour serveur.
        const nouvelle =
          token.jour !== null && !precedent.jours.some((j) => j.jour === token.jour)
            ? [...precedent.jours, { id: `jour-${token.jour}`, jour: token.jour }]
            : precedent.jours

        return { ...precedent, tokens: [...precedent.tokens, token], jours: nouvelle }
      })
    })
  }

  function majToken(
    id: string,
    patch: { nom?: string | null; mint?: string | null; issue?: 'tp' | 'rate' },
  ) {
    setWallet((precedent) => ({
      ...precedent,
      tokens: precedent.tokens.map((token) =>
        token.id === id ? { ...token, ...patch } : token,
      ),
    }))
    const champ = Object.keys(patch)[0] ?? 'token'
    schedule(`token:${id}:${champ}`, () => modifierTokenAction(id, patch))
  }

  function supprimerToken(id: string) {
    setWallet((precedent) => ({
      ...precedent,
      tokens: precedent.tokens.filter((token) => token.id !== id),
    }))
    run(() => supprimerTokenAction(id))
  }

  // --- Journées ------------------------------------------------------------
  function relever(jour: string, issues: readonly ('tp' | 'rate')[]) {
    run(async () => {
      const resultat = await releverJourAction(wallet.id, jour, issues)
      if (!resultat.ok) {
        setErreur(resultat.message)
        return
      }
      setErreur(null)
      router.refresh()
    })
  }

  function supprimerJour(jour: string) {
    setWallet((precedent) => ({
      ...precedent,
      jours: precedent.jours.filter((journee) => journee.jour !== jour),
      tokens: precedent.tokens.filter(
        (token) => !(token.phase === 'test' && token.jour === jour),
      ),
    }))
    run(() => supprimerJourAction(wallet.id, jour))
  }

  // --- Trades --------------------------------------------------------------
  function ajouterTrade(entree: Parameters<typeof ajouterTradeAction>[1]) {
    run(async () => {
      const resultat = await ajouterTradeAction(wallet.id, entree)
      if (!resultat.ok) {
        setErreur(resultat.message)
        return
      }
      setErreur(null)
      setWallet((precedent) => ({ ...precedent, trades: [...precedent.trades, resultat.trade] }))
    })
  }

  function supprimerTrade(id: string) {
    setWallet((precedent) => ({
      ...precedent,
      trades: precedent.trades.filter((trade) => trade.id !== id),
    }))
    run(() => supprimerTradeAction(id))
  }

  // --- Suppression ---------------------------------------------------------
  function demanderSuppression() {
    run(async () => setSuppression(await compterContenuAction(wallet.id)))
  }

  function confirmerSuppression() {
    setSuppression(null)
    run(async () => {
      await supprimerWalletAction(wallet.id)
      router.push('/')
    })
  }

  return (
    <Ecran
      mode="detail"
      titre={wallet.nom}
      titreLarge={
        <TextField
          ariaLabel="Nom du wallet"
          value={wallet.nom}
          placeholder="Sans nom"
          onChange={(nom) => {
            majWallet({ nom })
            schedule('nom', () => renommerWalletAction(wallet.id, nom))
          }}
        />
      }
      gauche={
        <Link
          href="/"
          aria-label="Retour aux wallets"
          className="-ml-1.5 flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-1 text-[15px] text-blue transition hover:bg-fill active:opacity-60 lg:hidden"
        >
          <ChevronLeftIcon className="h-[18px] w-[18px]" />
          Wallets
        </Link>
      }
      actions={
        <>
          <BoutonCopier
            valeur={wallet.adresse}
            ariaLabel="Copier l’adresse du wallet"
            className="hidden font-mono text-[11.5px] text-ink-3 hover:text-ink-2 lg:inline-flex"
          >
            {adresseCourte(wallet.adresse)}
          </BoutonCopier>
          <a
            href={SOLSCAN_URL(wallet.adresse)}
            target="_blank"
            rel="noreferrer noopener"
            className="hidden items-center gap-1 rounded-full bg-fill px-2.5 py-1 text-[11.5px] text-ink-2 transition hover:bg-hi hover:text-ink sm:inline-flex"
          >
            Solscan
            <ExternalIcon className="h-[11px] w-[11px]" />
          </a>
          <a
            href={`/wallets/${wallet.id}/export`}
            download
            title="Réglages, lancements et trades — chaque ligne porte sa phase"
            className="rounded-full bg-fill px-2.5 py-1 text-[11.5px] text-ink-2 transition hover:bg-hi hover:text-ink"
          >
            CSV
          </a>
          <PhaseBadge phase={wallet.phase} />
          <SaveIndicator status={status} />
        </>
      }
      barre={
        <Onglets
          ariaLabel="Sections du wallet"
          valeur={onglet}
          onChange={setOnglet}
          onglets={[
            { value: 'bilan', label: 'Bilan' },
            {
              value: 'screening',
              label: 'Screening',
              ton: 'screening',
              compte: prets.screening.tokens,
              marque: wallet.phase === 'screening',
            },
            {
              value: 'test',
              label: 'Test',
              ton: 'test',
              compte: prets.test.joursObserves,
              marque: wallet.phase === 'test',
            },
            {
              value: 'trade',
              label: 'Trade',
              ton: 'trade',
              compte: prets.trade.trades,
              marque: wallet.phase === 'trade',
            },
            { value: 'reglages', label: 'Réglages' },
          ]}
        />
      }
    >
      {erreur !== null ? (
        <p className="mb-4 flex items-center gap-2 rounded-card bg-card px-4 py-3 text-[14px] text-red">
          {erreur}
          <button
            type="button"
            onClick={() => setErreur(null)}
            aria-label="Fermer"
            className="ml-auto text-ink-3 transition hover:text-ink"
          >
            <CloseIcon className="h-[15px] w-[15px]" />
          </button>
        </p>
      ) : null}

      {onglet === 'bilan' ? (
        <VueBilan wallet={wallet} prets={prets} onChangerPhase={changerPhase} />
      ) : null}

      <HorsPhase wallet={wallet} onglet={onglet} onChanger={changerPhase} />

      {onglet === 'screening' ? (
        <VueScreening
          bilan={prets.screening}
          tokens={tokensScreening(wallet)}
          repere={wallet.tokensScreening}
          onAjouter={(issue) => ajouterToken('screening', issue)}
          onIssue={(id, issue) => majToken(id, { issue })}
          onNom={(id, patch) => majToken(id, patch)}
          onSupprimer={supprimerToken}
        />
      ) : null}

      {onglet === 'test' ? (
        <VueTest
          bilan={prets.test}
          tokensParJour={(jour) => tokensDuJour(wallet, jour)}
          repere={wallet.joursTest}
          reglages={wallet.reglages}
          onRelever={relever}
          onAjouter={(jour, issue) => ajouterToken('test', issue, jour)}
          onIssue={(id, issue) => majToken(id, { issue })}
          onNom={(id, patch) => majToken(id, patch)}
          onSupprimerToken={supprimerToken}
          onSupprimerJour={supprimerJour}
        />
      ) : null}

      {onglet === 'trade' ? (
        <VueTrade
          bilan={prets.trade}
          trades={wallet.trades}
          onAjouter={ajouterTrade}
          onSupprimer={supprimerTrade}
        />
      ) : null}

      {onglet === 'reglages' ? (
        <>
        <ListGroup title="Réglages">
          {REGLAGES.map(({ champ, label, aide }) => (
            <ListRow key={champ}>
              <span className="min-w-0 flex-1">
                <ListLabel>{label}</ListLabel>
                <span className="mt-0.5 block text-[12.5px] text-ink-2">{aide}</span>
              </span>
              <span className="w-24 shrink-0 text-[16px]">
                <NumberField
                  ariaLabel={`${label} en ${BORNES[champ].unite}`}
                  value={wallet.reglages[champ]}
                  suffix={BORNES[champ].unite}
                  onChange={(valeur) => regler(champ, valeur)}
                />
              </span>
            </ListRow>
          ))}
        </ListGroup>

        <ListGroup
          title="Repères"
          footer="Affichés à côté de l’avancement. Ils n’empêchent jamais un changement de phase."
        >
          <ListRow>
            <span className="min-w-0 flex-1">
              <ListLabel>Tokens de screening</ListLabel>
              <span className="mt-0.5 block text-[12.5px] text-ink-2">
                Taille d’échantillon conseillée.
              </span>
            </span>
            <span className="w-24 shrink-0 text-[16px]">
              <NumberField
                ariaLabel="Tokens de screening conseillés"
                value={wallet.tokensScreening}
                onChange={(valeur) => reglerRepere('tokensScreening', valeur)}
              />
            </span>
          </ListRow>
          <ListRow>
            <span className="min-w-0 flex-1">
              <ListLabel>Jours de test</ListLabel>
              <span className="mt-0.5 block text-[12.5px] text-ink-2">
                Durée d’observation prévue.
              </span>
            </span>
            <span className="w-24 shrink-0 text-[16px]">
              <NumberField
                ariaLabel="Jours de test prévus"
                value={wallet.joursTest}
                onChange={(valeur) => reglerRepere('joursTest', valeur)}
              />
            </span>
          </ListRow>
        </ListGroup>

        {/* L'en-tête ne porte l'adresse qu'à partir de `lg` : sur un écran
            étroit, c'est ici qu'on vient la chercher. */}
        <ListGroup title="Adresse">
          <ListRow>
            <ListLabel>Solana</ListLabel>
            <BoutonCopier
              valeur={wallet.adresse}
              ariaLabel="Copier l’adresse du wallet"
              className="ml-auto font-mono text-[15px] text-ink-2 underline decoration-separator underline-offset-4 hover:text-ink"
            >
              {adresseCourte(wallet.adresse)}
            </BoutonCopier>
          </ListRow>
        </ListGroup>

        <ListGroup title="Dates">
          <ListRow>
            <ListLabel>Créé le</ListLabel>
            <span className="ml-auto text-[15px] text-ink-2 tabular-nums">
              {formatDate(wallet.creeLe.slice(0, 10))}
            </span>
          </ListRow>
          <ListRow>
            <ListLabel>Passé en test</ListLabel>
            <span className="ml-auto text-[15px] text-ink-2 tabular-nums">
              {wallet.testLe ? formatDate(wallet.testLe) : '—'}
            </span>
          </ListRow>
          <ListRow>
            <ListLabel>Passé en trade</ListLabel>
            <span className="ml-auto text-[15px] text-ink-2 tabular-nums">
              {wallet.tradeLe ? formatDate(wallet.tradeLe) : '—'}
            </span>
          </ListRow>
        </ListGroup>

        <ListGroup title="Notes">
          <div className="px-4 py-3">
            <textarea
              value={wallet.notes}
              aria-label="Notes"
              rows={3}
              placeholder="Ce que vous avez remarqué sur ce wallet…"
              onChange={(event) => {
                const notes = event.target.value
                majWallet({ notes })
                schedule('notes', () => noterWalletAction(wallet.id, notes))
              }}
              className="w-full resize-y bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
          </div>
        </ListGroup>

        {/* Zone dangereuse, détachée du reste : on ne supprime pas un wallet
            par inadvertance en parcourant ses réglages. */}
        <section className="mt-10">
          <div className="overflow-hidden rounded-card bg-card">
            <Action onClick={demanderSuppression} ton="rouge">
              Supprimer ce wallet
            </Action>
          </div>
        </section>
        </>
      ) : null}

      <Sheet
        open={suppression !== null}
        onClose={() => setSuppression(null)}
        title="Supprimer ce wallet"
      >
        <p className="mb-4 text-[15px] text-ink-2">
          <b className="font-semibold text-ink">{wallet.nom}</b> et tout son
          contenu seront supprimés définitivement :
        </p>
        <ul className="mb-5 space-y-1.5 text-[15px] text-ink-2">
          <li className="flex items-baseline gap-2">
            <span className="w-10 text-right font-semibold text-ink tabular-nums">
              {suppression?.tokens ?? 0}
            </span>
            lancements (screening et test)
          </li>
          <li className="flex items-baseline gap-2">
            <span className="w-10 text-right font-semibold text-ink tabular-nums">
              {suppression?.jours ?? 0}
            </span>
            journées relevées
          </li>
          <li className="flex items-baseline gap-2">
            <span className="w-10 text-right font-semibold text-ink tabular-nums">
              {suppression?.trades ?? 0}
            </span>
            trades réels
          </li>
        </ul>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={confirmerSuppression}
            className="w-full rounded-[11px] bg-red px-4 py-3 text-[16px] font-semibold text-white transition active:scale-[0.98]"
          >
            Supprimer définitivement
          </button>
          <button
            type="button"
            onClick={() => setSuppression(null)}
            className="w-full rounded-[11px] bg-fill px-4 py-3 text-[16px] font-medium text-ink transition active:scale-[0.98]"
          >
            Annuler
          </button>
        </div>
      </Sheet>
    </Ecran>
  )
}

/**
 * Le rappel affiché quand on consulte un lot qui n'est pas la phase du wallet.
 *
 * Sans lui, rien ne distinguerait « je regarde le screening » de « ce wallet
 * est en screening » — et c'est précisément la confusion que les onglets
 * pourraient réintroduire. Le bouton est là parce que c'est le moment où on
 * veut basculer : on vient de regarder le lot, on décide.
 */
function HorsPhase({
  wallet,
  onglet,
  onChanger,
}: {
  wallet: WalletComplet
  onglet: OngletWallet
  onChanger: (phase: Phase) => void
}) {
  if (onglet === 'bilan' || onglet === 'reglages') return null
  if (wallet.phase === onglet) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card bg-card px-3 py-2.5">
      <span className="text-[13px] text-ink-2">
        Vous consultez le lot <b className="font-semibold text-ink">{LIBELLE_PHASE[onglet]}</b>.
        Ce wallet est en phase{' '}
        <b className="font-semibold text-ink">{LIBELLE_PHASE[wallet.phase]}</b>.
      </span>
      <button
        type="button"
        onClick={() => onChanger(onglet)}
        className="ml-auto shrink-0 rounded-full bg-fill px-3 py-1.5 text-[12.5px] font-semibold text-blue transition hover:bg-hi active:scale-95"
      >
        Passer en {LIBELLE_PHASE[onglet].toLowerCase()}
      </button>
    </div>
  )
}

/** Les trois lots consultables. L'archive n'en est pas un : c'est un rangement. */
type Lot = 'screening' | 'test' | 'trade'

/** Les sections de l'écran : un bilan, les trois lots, les réglages. */
type OngletWallet = 'bilan' | Lot | 'reglages'
