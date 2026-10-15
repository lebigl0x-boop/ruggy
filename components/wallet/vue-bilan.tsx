'use client'

import { formatPct, formatSol } from '@/lib/format'
import { LIBELLE_PHASE, PHASES, type Phase, type WalletComplet } from '@/lib/repo/types'
import type { Bilans } from '@/lib/resume'
import { Courbe } from '../charts/courbe'
import { cn } from '../ui/cn'
import { Bande, Chiffre, Panneau } from '../ui/table'

/**
 * L'onglet Bilan : où en est ce wallet, en un écran.
 *
 * Trois questions dans l'ordre : qu'a donné la phase en cours, que disent les
 * trois lots côte à côte, et où en est le wallet dans l'entonnoir. Le détail
 * d'un lot vit dans son propre onglet — ici on ne montre que ce qu'on vient
 * lire en arrivant.
 */
export function VueBilan({
  wallet,
  prets,
  onChangerPhase,
}: {
  wallet: WalletComplet
  prets: Bilans
  onChangerPhase: (phase: Phase) => void
}) {
  const courbe =
    wallet.phase === 'trade'
      ? prets.trade.parTrade
      : wallet.phase === 'screening'
        ? prets.screening.courbe
        : prets.test.courbeParJour

  return (
    <>
      <Bande>{mesures(wallet, prets)}</Bande>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panneau titre="Les trois lots">
          <div className="grid gap-px bg-separator sm:grid-cols-3 [&>*]:bg-card">
            <Lot
              label="Screening"
              ton="screening"
              valeur={prets.screening.resultat}
              vide={prets.screening.tokens === 0}
              detail={`${prets.screening.tokens} lancement${prets.screening.tokens > 1 ? 's' : ''}`}
              second={
                prets.screening.tokens > 0
                  ? `${formatPct(prets.screening.tauxTp)} au TP`
                  : 'rien de noté'
              }
            />
            <Lot
              label="Test"
              ton="test"
              valeur={prets.test.resultat}
              vide={prets.test.joursObserves === 0}
              detail={`${prets.test.joursObserves} journée${prets.test.joursObserves > 1 ? 's' : ''}`}
              second={
                prets.test.tokens > 0
                  ? `${formatPct(prets.test.tauxTp)} au TP`
                  : 'rien de relevé'
              }
            />
            <Lot
              label="Trade"
              ton="trade"
              reel
              valeur={prets.trade.resultat}
              vide={prets.trade.trades === 0}
              detail={`${prets.trade.trades} trade${prets.trade.trades > 1 ? 's' : ''}`}
              second={
                prets.trade.rendement !== null
                  ? `${formatPct(prets.trade.rendement, { signe: true })} de rendement`
                  : 'rien de joué'
              }
            />
          </div>
          <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
            Jamais additionnés : choisi à la main · exhaustif mais simulé · argent compté.
          </p>
        </Panneau>

        <Panneau titre={`Résultat cumulé · ${LIBELLE_PHASE[wallet.phase]}`}>
          <div className="px-3 py-2.5">
            <Courbe points={courbe} hauteur={128} />
          </div>
        </Panneau>
      </div>

      <Panneau titre="Phase du wallet">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {PHASES.map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => onChangerPhase(phase)}
              aria-pressed={wallet.phase === phase}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition active:scale-95',
                wallet.phase === phase
                  ? 'bg-accent text-accent-ink'
                  : 'bg-fill text-ink-2 hover:bg-hi hover:text-ink',
              )}
            >
              {LIBELLE_PHASE[phase]}
            </button>
          ))}
          <span className="ml-auto text-[12.5px] text-ink-3">{indication(wallet, prets)}</span>
        </div>
        <p className="border-t border-separator px-3 py-1.5 text-[11.5px] text-ink-3">
          Changeable dans les deux sens, à tout moment : les repères indiquent, ils n’imposent rien.
        </p>
      </Panneau>
    </>
  )
}

/** La bande de chiffres de la phase en cours. */
function mesures(wallet: WalletComplet, prets: Bilans) {
  if (wallet.phase === 'trade') {
    const t = prets.trade
    return (
      <>
        <Chiffre
          fort
          label="Résultat réel"
          valeur={formatSol(t.resultat)}
          detail={`${t.trades} trade${t.trades > 1 ? 's' : ''}`}
          ton={t.resultat > 0 ? 'vert' : t.resultat < 0 ? 'rouge' : undefined}
        />
        <Chiffre
          label="Rendement"
          valeur={t.rendement !== null ? formatPct(t.rendement, { signe: true }) : '—'}
          detail="capital engagé"
          ton={t.rendement === null ? undefined : t.rendement > 0 ? 'vert' : 'rouge'}
        />
        <Chiffre label="Taux au TP" valeur={formatPct(t.tauxTp)} detail={`${t.tp} sur ${t.trades}`} />
        <Chiffre label="Engagé" valeur={formatSol(t.engage, { signe: false })} detail="SOL sortis" />
        <Chiffre
          label="Écart au test"
          valeur={t.ecartPct !== null ? formatPct(t.ecartPct, { signe: true }) : '—'}
          detail={t.ecartPct === null ? 'rien à comparer' : 'réel contre simulé'}
          ton={t.ecartPct === null ? undefined : t.ecartPct < 0 ? 'rouge' : 'vert'}
        />
        <Chiffre
          label="Règle d’arrêt"
          valeur={t.alerteArret ? 'Alerte' : t.fenetreArret < 5 ? '—' : 'OK'}
          detail={`${t.fenetreArret}/5 derniers`}
          ton={t.alerteArret ? 'orange' : undefined}
        />
      </>
    )
  }

  if (wallet.phase === 'archive') {
    const t = prets.trade
    return (
      <>
        <Chiffre fort label="Archivé" valeur="—" detail="rien n’a été effacé" />
        <Chiffre label="Screening" valeur={formatSol(prets.screening.resultat)} detail="simulé" />
        <Chiffre label="Test" valeur={formatSol(prets.test.resultat)} detail="simulé" />
        <Chiffre label="Trade" valeur={formatSol(t.resultat)} detail="réel" />
        <Chiffre label="Journées" valeur={String(prets.test.joursObserves)} detail="relevées" />
        <Chiffre label="Trades" valeur={String(t.trades)} detail="joués" />
      </>
    )
  }

  const enTest = wallet.phase === 'test'
  const b = enTest ? prets.test : prets.screening
  const fait = enTest ? prets.test.joursObserves : prets.screening.tokens
  const repere = enTest ? wallet.joursTest : wallet.tokensScreening

  return (
    <>
      <Chiffre
        fort
        label="Résultat simulé"
        valeur={formatSol(b.resultat)}
        detail={`${b.tokens} lancement${b.tokens > 1 ? 's' : ''}`}
        ton={b.resultat > 0 ? 'vert' : b.resultat < 0 ? 'rouge' : undefined}
      />
      <Chiffre
        label="Taux au TP"
        valeur={b.tokens > 0 ? formatPct(b.tauxTp) : '—'}
        detail={b.tokens > 0 ? `${b.tp} sur ${b.tokens}` : 'rien de noté'}
      />
      <Chiffre
        label="Seuil"
        valeur={b.seuil !== null ? formatPct(b.seuil, { decimales: 1 }) : '—'}
        detail={b.tokens === 0 ? 'à atteindre' : b.rentable ? 'au-dessus' : 'en dessous'}
        ton={b.tokens === 0 || b.seuil === null ? undefined : b.rentable ? 'vert' : 'rouge'}
      />
      <Chiffre
        label={enTest ? 'Par jour' : 'Par lancement'}
        valeur={
          enTest
            ? prets.test.joursObserves > 0
              ? formatSol(prets.test.moyenneParJour)
              : '—'
            : b.tokens > 0
              ? formatSol(b.moyenneParToken)
              : '—'
        }
        detail="en moyenne"
      />
      <Chiffre
        label={enTest ? 'Journées' : 'Échantillon'}
        valeur={`${fait}/${repere}`}
        detail={fait >= repere ? 'repère atteint' : 'observé / prévu'}
      />
      <Chiffre label="Ratés" valeur={String(b.rate)} detail={`sur ${b.tokens} notés`} />
    </>
  )
}

/** Une colonne de la comparaison des trois lots. */
function Lot({
  label,
  ton,
  valeur,
  detail,
  second,
  vide,
  reel = false,
}: {
  label: string
  ton: Phase
  valeur: number
  detail: string
  second: string
  vide: boolean
  reel?: boolean
}) {
  const couleurs: Record<string, string> = {
    screening: 'text-violet',
    test: 'text-orange',
    trade: 'text-blue',
  }

  return (
    <div className="px-3 py-2">
      <p className={cn('text-[10.5px] font-semibold tracking-[0.04em] uppercase', couleurs[ton])}>
        {label}
        {reel ? <span className="ml-1.5 font-medium text-ink-3">réel</span> : null}
      </p>
      <p
        className={cn(
          'mt-0.5 text-[19px] leading-tight font-bold tracking-[-0.02em] tabular-nums',
          vide ? 'text-ink-3' : valeur > 0 ? 'text-green' : valeur < 0 ? 'text-red' : 'text-ink-2',
        )}
      >
        {vide ? '—' : formatSol(valeur)}
      </p>
      <p className="truncate text-[11.5px] text-ink-2">{detail}</p>
      <p className="truncate text-[11px] text-ink-3">{second}</p>
    </div>
  )
}

/** L'indication à côté des boutons de phase : où on en est, sans verdict. */
function indication(wallet: WalletComplet, prets: Bilans): string {
  switch (wallet.phase) {
    case 'screening': {
      const n = prets.screening.tokens
      return `${n} noté${n > 1 ? 's' : ''} sur ${wallet.tokensScreening} conseillés`
    }
    case 'test': {
      const j = prets.test.joursObserves
      return `${j} jour${j > 1 ? 's' : ''} observé${j > 1 ? 's' : ''} sur ${wallet.joursTest} prévus`
    }
    case 'trade': {
      const t = prets.trade.trades
      return `${t} trade${t > 1 ? 's' : ''} enregistré${t > 1 ? 's' : ''}`
    }
    case 'archive':
      return 'historique intact'
  }
}
