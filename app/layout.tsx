import type { Metadata, Viewport } from 'next'

import { AppShell } from '@/components/app-shell'
import { clientServeur } from '@/lib/auth/supabase'
import { listerWallets } from '@/lib/repo/wallets'
import { resumer } from '@/lib/resume'
import { ScriptTheme } from '@/components/ui/theme'

import './globals.css'

export const metadata: Metadata = {
  title: 'Ruggers',
  description: 'Suivi personnel de wallets de memecoins Solana.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // L'app est sombre par défaut ; la barre du navigateur suit.
  themeColor: '#000000',
}

// La base est lue à chaque requête : rien à mettre en cache sur un outil
// personnel où chaque saisie change les chiffres.
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await clientServeur()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Pas de session : seule la page de connexion peut s'afficher (le middleware
  // y a déjà renvoyé le reste). On la rend nue — ni panneau, ni requête vers la
  // base, qui n'a rien à dire à un visiteur.
  if (user === null) {
    return (
      <html lang="fr" suppressHydrationWarning>
        <head>
          <ScriptTheme />
        </head>
        <body>{children}</body>
      </html>
    )
  }

  const resumes = (await listerWallets()).map((wallet) => resumer(wallet))

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ScriptTheme />
      </head>
      <body>
        <AppShell resumes={resumes} email={user.email ?? null}>
          {children}
        </AppShell>
      </body>
    </html>
  )
}
