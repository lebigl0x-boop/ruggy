import type { Metadata, Viewport } from 'next'

import { AppShell } from '@/components/app-shell'
import { WalletListPanel } from '@/components/wallets/wallet-list-panel'
import { todayIso } from '@/lib/format'
import { listFileDuMatin } from '@/lib/repo/days'
import { getSettings } from '@/lib/repo/settings'
import { listWallets } from '@/lib/repo/wallets'
import { summarize } from '@/lib/summary'

import './globals.css'

export const metadata: Metadata = {
  title: 'Ruggers',
  description: 'Suivi manuel des wallets de développeurs de memecoins.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

// La base est lue à chaque requête : rien à mettre en cache sur une app locale.
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings()
  const summaries = listWallets().map((wallet) => summarize(wallet, settings))

  // Les journées en attente, toutes phases de test confondues : c'est ce
  // chiffre qui fait remonter le relevé du matin en tête de liste.
  const journeesAFaire = listFileDuMatin(todayIso()).reduce(
    (total, entree) => total + entree.jours.length,
    0,
  )

  return (
    <html lang="fr">
      <body>
        <AppShell
          sidebar={
            <WalletListPanel wallets={summaries} journeesAFaire={journeesAFaire} />
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  )
}
