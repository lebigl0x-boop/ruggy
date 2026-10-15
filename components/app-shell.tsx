'use client'

import type { ReactNode } from 'react'

import type { ResumeWallet } from '@/lib/resume'
import { PanneauListe } from './wallets/panneau-liste'

/**
 * La coquille : deux panneaux sur desktop, un seul sur mobile.
 *
 * La liste des wallets reste à gauche pendant qu'on travaille dans un wallet —
 * passer de l'un à l'autre ne doit pas demander de repasser par le tableau de
 * bord. Sur petit écran il n'y a pas la place pour deux colonnes : on y navigue
 * liste → détail, avec un bouton retour dans l'en-tête du détail.
 */
export function AppShell({
  resumes,
  email,
  children,
}: {
  resumes: readonly ResumeWallet[]
  email: string | null
  children: ReactNode
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <div className="hidden lg:flex">
        <PanneauListe resumes={resumes} email={email} />
      </div>

      <main className="min-h-0 min-w-0 flex-1">{children}</main>
    </div>
  )
}
