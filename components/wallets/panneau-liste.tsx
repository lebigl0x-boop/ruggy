'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { formatSol } from '@/lib/format'
import type { ResumeWallet } from '@/lib/resume'
import { cn } from '../ui/cn'
import { SearchIcon } from '../ui/icons'
import { PhasePoint } from '../ui/phase-badge'
import { BasculeTheme } from '../ui/theme'

/**
 * Le panneau de gauche : tous les wallets, en liste serrée.
 *
 * Il reste affiché pendant qu'on travaille dans un wallet — c'est ce qui
 * permet de passer de l'un à l'autre sans repasser par le tableau de bord. Sur
 * mobile il n'existe pas : la navigation y est liste → détail, avec un retour.
 */
export function PanneauListe({
  resumes,
  email,
}: {
  resumes: readonly ResumeWallet[]
  /** Le compte connecté, en pied de panneau. */
  email: string | null
}) {
  const pathname = usePathname()
  const [requete, setRequete] = useState('')

  const terme = normalise(requete)
  const visibles =
    terme === ''
      ? resumes
      : resumes.filter(
          (resume) =>
            normalise(resume.nom).includes(terme) ||
            normalise(resume.adresse).includes(terme),
        )

  return (
    <nav
      aria-label="Wallets"
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-separator bg-card"
    >
      <div className="px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link
          href="/"
          className={cn(
            'mb-2 flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] font-semibold transition',
            pathname === '/' ? 'bg-hi text-ink' : 'text-ink-2 hover:bg-fill hover:text-ink',
          )}
        >
          <span
            aria-hidden
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-blue text-[12px] font-extrabold text-white"
          >
            R
          </span>
          Tableau de bord
        </Link>

        <div className="flex items-center gap-2 rounded-[9px] bg-fill px-2.5 py-1.5 transition focus-within:bg-hi">
          <SearchIcon className="h-[14px] w-[14px] shrink-0 text-ink-3" />
          <input
            type="search"
            value={requete}
            onChange={(event) => setRequete(event.target.value)}
            placeholder="Nom ou adresse"
            aria-label="Rechercher un wallet"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visibles.length === 0 ? (
          <p className="px-2 py-4 text-[12.5px] text-ink-3">
            {resumes.length === 0 ? 'Aucun wallet suivi.' : 'Aucun résultat.'}
          </p>
        ) : (
          visibles.map((resume) => {
            const actif = pathname === `/wallets/${resume.id}`
            return (
              <Link
                key={resume.id}
                href={`/wallets/${resume.id}`}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-[7px] px-2 py-1.5 transition',
                  actif ? 'bg-hi' : 'hover:bg-fill',
                )}
              >
                <PhasePoint phase={resume.phase} />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[12.5px]',
                    actif ? 'font-semibold text-ink' : 'text-ink-2',
                  )}
                >
                  {resume.nom}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[12px] font-medium tabular-nums',
                    resume.resultat > 0
                      ? 'text-green'
                      : resume.resultat < 0
                        ? 'text-red'
                        : 'text-ink-3',
                  )}
                >
                  {formatSol(resume.resultat)}
                </span>
              </Link>
            )
          })
        )}
      </div>

      {/* Le compte, et la sortie. En POST : un GET se déclencherait au moindre
          préchargement de lien. */}
      <div className="border-t border-separator p-2">
        <BasculeTheme />
      </div>

      <form
        action="/auth/deconnexion"
        method="post"
        className="border-t border-separator p-2"
      >
        <button
          type="submit"
          title={email ?? 'Se déconnecter'}
          className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-ink-3 transition hover:bg-fill hover:text-ink"
        >
          <span
            aria-hidden
            className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-fill text-[9.5px] font-bold text-ink-2"
          >
            {(email ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px]">{email ?? 'Compte'}</span>
          <SortieIcon className="h-[14px] w-[14px] shrink-0 opacity-50" />
        </button>
      </form>
    </nav>
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

/** Recherche insensible à la casse et aux accents. */
function normalise(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
