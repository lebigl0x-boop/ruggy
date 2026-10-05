'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from './ui/cn'

/**
 * Deux panneaux sur desktop, un seul sur mobile.
 *
 * Sur petit écran, la liste et le détail occupent tour à tour l'écran :
 * la route décide lequel est visible. Les deux restent montés pour que le
 * retour à la liste soit instantané et conserve la position de défilement.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const surLaListe = pathname === '/'

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <aside
        className={cn(
          'w-full shrink-0 border-separator md:w-[340px] md:border-r lg:w-[380px]',
          surLaListe ? 'block' : 'hidden md:block',
        )}
      >
        {sidebar}
      </aside>

      <main className={cn('min-w-0 flex-1', surLaListe && 'hidden md:block')}>
        {children}
      </main>
    </div>
  )
}
