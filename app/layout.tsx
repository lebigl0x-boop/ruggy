import type { Metadata, Viewport } from 'next'

import { AppShell } from '@/components/app-shell'
import { clientServeur } from '@/lib/auth/supabase'
import { todayIso } from '@/lib/format'
import { listFileDuMatin } from '@/lib/repo/days'
import { getSettings } from '@/lib/repo/settings'

import './globals.css'

export const metadata: Metadata = {
  title: 'Ruggers',
  description: 'Suivi manuel des wallets de développeurs de memecoins.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Un seul thème : l'app est sombre, quel que soit le réglage du système.
  themeColor: '#0d0d0e',
}

// La base est lue à chaque requête : rien à mettre en cache sur une app locale.
export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await clientServeur()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Pas de session : seule la page de connexion peut s'afficher (le
  // middleware y a déjà renvoyé le reste). On la rend nue — ni rail, ni
  // requête vers la base, qui n'a rien à dire à un visiteur.
  if (user === null) {
    return (
      <html lang="fr">
        <body>{children}</body>
      </html>
    )
  }

  // Les journées en attente, toutes phases de test confondues : c'est ce
  // chiffre que porte la pastille du rail.
  const [file, settings] = await Promise.all([
    listFileDuMatin(todayIso()),
    getSettings(),
  ])
  const journeesAFaire = file.reduce((total, entree) => total + entree.jours.length, 0)

  return (
    <html lang="fr">
      <body>
        <AppShell
          journeesAFaire={journeesAFaire}
          solPriceEur={settings.solPriceEur}
          email={user?.email ?? null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  )
}
