import Link from 'next/link'

import { FileDuMatin, type EntreeMatin } from '@/components/matin/file-du-matin'
import { ChevronLeftIcon } from '@/components/ui/icons'
import { formatDateFr, todayIso } from '@/lib/format'
import { listFileDuMatin } from '@/lib/repo/days'

export const dynamic = 'force-dynamic'

export default function AujourdhuiPage() {
  const aujourdhui = todayIso()

  // Une journée par ligne, du plus ancien au plus récent : les matins sautés
  // remontent en tête au lieu de se perdre.
  const entrees: EntreeMatin[] = listFileDuMatin(aujourdhui)
    .flatMap((entree) =>
      entree.jours.map((day) => ({
        walletId: entree.wallet.id,
        label: entree.wallet.label,
        address: entree.wallet.address,
        strategy: entree.wallet.strategy,
        day,
      })),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label))

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-separator bg-nav px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur-xl">
        <Link
          href="/"
          className="-ml-1 flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-[17px] text-blue transition active:opacity-50 md:invisible md:w-0"
        >
          <ChevronLeftIcon className="h-[17px] w-[17px]" />
          Wallets
        </Link>
        <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">
          Ce matin
        </h2>
        <span className="w-16 shrink-0" />
      </header>

      <div className="mx-auto max-w-[680px] px-4 pb-16">
        <div className="pt-5 pb-6">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">
            Ce matin
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {formatDateFr(aujourdhui)} · relevé des journées écoulées
          </p>
        </div>

        <FileDuMatin entrees={entrees} />
      </div>
    </div>
  )
}
