'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import { cn } from './ui/cn'
import {
  ChevronLeftIcon,
  EntonnoirIcon,
  MatinIcon,
  PortefeuilleIcon,
} from './ui/icons'
import { SelecteurTheme } from './ui/theme'

/**
 * La coquille de l'application.
 *
 * La navigation porte des tâches, pas des objets : relever le matin, faire
 * avancer l'entonnoir, comparer les wallets. L'ancienne liste permanente
 * immobilisait 260 px pour un écran consulté une fois par session, pendant
 * que la saisie quotidienne se faisait dans ce qui restait.
 *
 * Le rail porte ses libellés — trois destinations ne méritent pas qu'on
 * devine des pictogrammes — et se replie sur ses icônes d'un clic quand on
 * veut toute la largeur pour un tableau. Barre d'onglets en bas sur mobile,
 * là où le pouce arrive.
 */

type Espace = {
  href: string
  label: string
  Icone: (props: { className?: string }) => ReactNode
}

const ESPACES: readonly Espace[] = [
  { href: '/', label: 'Matin', Icone: MatinIcon },
  { href: '/dashboard', label: 'Dashboard', Icone: EntonnoirIcon },
  { href: '/wallets', label: 'Wallets', Icone: PortefeuilleIcon },
]

/** Le détail d'un wallet appartient à l'espace Wallets. */
function estActif(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell({
  children,
  journeesAFaire,
  solPriceEur,
  email,
}: {
  children: ReactNode
  /** Journées de test en attente, pour la pastille du rail. */
  journeesAFaire: number
  /** Prix du SOL en €, ou `null` s'il n'a jamais été renseigné. */
  solPriceEur: number | null
  /** Le compte connecté, affiché en pied de rail. */
  email: string | null
}) {
  const pathname = usePathname()
  const [replie, setReplie] = useState(false)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg md:flex-row">
      {/* Rail — desktop */}
      <nav
        aria-label="Navigation principale"
        className={cn(
          'hidden shrink-0 flex-col gap-0.5 border-r border-separator bg-card p-2.5 transition-[width] duration-200 md:flex',
          replie ? 'w-[60px]' : 'w-[214px]',
        )}
      >
        <div className="flex items-center gap-2.5 px-1 pt-1 pb-4">
          <span
            aria-hidden
            className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] bg-accent text-[14px] font-extrabold tracking-tight text-accent-ink"
          >
            R
          </span>
          {replie ? null : (
            <>
              <span className="text-[14.5px] font-semibold tracking-tight">Ruggers</span>
              <button
                type="button"
                onClick={() => setReplie(true)}
                aria-label="Replier le menu"
                className="ml-auto grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition hover:bg-fill hover:text-ink-2"
              >
                <ChevronLeftIcon className="h-[15px] w-[15px]" />
              </button>
            </>
          )}
        </div>

        {ESPACES.map((espace) => (
          <LienRail
            key={espace.href}
            espace={espace}
            actif={estActif(espace.href, pathname)}
            badge={espace.href === '/' ? journeesAFaire : 0}
            replie={replie}
          />
        ))}

        <div className="mt-auto grid gap-2">
          {replie ? (
            <button
              type="button"
              onClick={() => setReplie(false)}
              aria-label="Déplier le menu"
              className="grid h-8 place-items-center rounded-[11px] text-ink-3 transition hover:bg-fill hover:text-ink-2"
            >
              <ChevronLeftIcon className="h-[15px] w-[15px] rotate-180" />
            </button>
          ) : null}

          {/* Le prix du SOL convertit tous les résultats de l'app : il vit avec
              l'identité plutôt que dans un écran qu'il faudrait aller ouvrir. */}
          <div
            className={cn(
              'flex items-center rounded-[11px] bg-fill text-[12.5px] text-ink-2',
              replie ? 'justify-center py-2' : 'gap-2 px-3 py-2',
            )}
            title={
              solPriceEur !== null
                ? `1 SOL = ${solPriceEur} €`
                : 'Prix du SOL non renseigné'
            }
          >
            <SolIcon className="h-[15px] w-[15px] shrink-0" />
            {replie ? null : (
              <>
                <span>SOL</span>
                <span className="ml-auto font-semibold text-ink tabular-nums">
                  {solPriceEur !== null
                    ? `${solPriceEur.toLocaleString('fr-FR')} €`
                    : '—'}
                </span>
              </>
            )}
          </div>

          <SelecteurTheme replie={replie} />

          {/* Le compte, et la sortie. En POST : un GET se déclencherait au
              moindre préchargement de lien. */}
          <form action="/auth/deconnexion" method="post">
            <button
              type="submit"
              title={email ?? 'Se déconnecter'}
              className={cn(
                'group flex w-full items-center rounded-[11px] border border-separator py-2 text-ink-2 transition hover:bg-fill hover:text-ink',
                replie ? 'justify-center' : 'gap-2.5 px-2.5',
              )}
            >
              <span
                aria-hidden
                className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-fill text-[9.5px] font-bold text-ink-2"
              >
                {(email ?? '?').slice(0, 1).toUpperCase()}
              </span>
              {replie ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate text-left text-[12px]">
                    {email ?? 'Compte'}
                  </span>
                  <SortieIcon className="h-[14px] w-[14px] shrink-0 opacity-0 transition group-hover:opacity-100" />
                </>
              )}
            </button>
          </form>
        </div>
      </nav>

      <main className="min-h-0 min-w-0 flex-1">{children}</main>

      {/* Barre d'onglets — mobile */}
      <nav
        aria-label="Navigation principale"
        className="flex shrink-0 border-t border-separator bg-nav pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {ESPACES.map((espace) => (
          <LienOnglet
            key={espace.href}
            espace={espace}
            actif={estActif(espace.href, pathname)}
            badge={espace.href === '/' ? journeesAFaire : 0}
          />
        ))}
      </nav>
    </div>
  )
}

function LienRail({
  espace,
  actif,
  badge,
  replie,
}: {
  espace: Espace
  actif: boolean
  badge: number
  replie: boolean
}) {
  const { Icone } = espace
  return (
    <Link
      href={espace.href}
      aria-current={actif ? 'page' : undefined}
      title={replie ? espace.label : undefined}
      className={cn(
        'relative flex items-center rounded-[11px] py-2 text-[13px] transition',
        replie ? 'justify-center' : 'gap-2.5 px-2.5',
        actif ? 'bg-hi font-semibold text-ink' : 'text-ink-2 hover:bg-fill hover:text-ink',
      )}
    >
      {/* Le filet sur le bord dit « vous êtes ici » sans recourir à une teinte. */}
      {actif ? (
        <span
          aria-hidden
          className="absolute top-2 bottom-2 left-0 w-[2px] rounded-r-full bg-accent"
        />
      ) : null}
      <Icone className="h-[17px] w-[17px] shrink-0" />
      {replie ? null : <span>{espace.label}</span>}
      {badge > 0 ? <Pastille nombre={badge} replie={replie} /> : null}
    </Link>
  )
}

function LienOnglet({
  espace,
  actif,
  badge,
}: {
  espace: Espace
  actif: boolean
  badge: number
}) {
  const { Icone } = espace
  return (
    <Link
      href={espace.href}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center gap-0.5 py-2 transition',
        actif ? 'text-ink' : 'text-ink-3',
      )}
    >
      <Icone className="h-[21px] w-[21px]" />
      <span className="text-[10px] leading-none font-medium">{espace.label}</span>
      {badge > 0 ? <Pastille nombre={badge} replie /> : null}
    </Link>
  )
}

/** Le décompte des journées à relever, sur l'icône du matin. */
function Pastille({ nombre, replie }: { nombre: number; replie: boolean }) {
  if (replie) {
    return (
      <span className="absolute top-1 right-1/2 translate-x-[14px] rounded-full bg-red px-1 text-[9px] leading-[14px] font-bold text-white tabular-nums">
        {nombre > 9 ? '9+' : nombre}
      </span>
    )
  }

  return (
    <span className="ml-auto grid h-[17px] min-w-[17px] place-items-center rounded-full bg-red px-1.5 text-[10px] font-bold text-white tabular-nums">
      {nombre > 9 ? '9+' : nombre}
    </span>
  )
}

/** La porte de sortie, sur le bouton de déconnexion. */
function SortieIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M12 3.5H15.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H12" />
      <path d="M8.5 13.5 12 10 8.5 6.5M12 10H3.5" />
    </svg>
  )
}

/** Les trois barres de Solana, pour le prix du SOL. */
function SolIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M4.3 5.8h11l-2.3 2.5H2zM5.6 9.3h11l-2.3 2.5h-11zM4.3 12.8h11L13 15.3H2z"
      />
    </svg>
  )
}
