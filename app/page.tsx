import { FileDuMatin, type EntreeMatin } from '@/components/matin/file-du-matin'
import { Page } from '@/components/ui/page'
import { formatDateFr, todayIso } from '@/lib/format'
import { listFileDuMatin } from '@/lib/repo/days'

export const dynamic = 'force-dynamic'

/**
 * L'accueil, c'est le relevé du matin.
 *
 * C'est la tâche quotidienne : elle mérite la page qui s'ouvre, pas une
 * sous-page atteignable depuis une liste.
 */
export default async function MatinPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>
}) {
  const { wallet } = await searchParams
  const aujourdhui = todayIso()

  // Une journée par ligne, du plus ancien au plus récent : les matins sautés
  // remontent en tête au lieu de se perdre.
  const entrees: EntreeMatin[] = (await listFileDuMatin(aujourdhui))
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
    <Page
      titre="Ce matin"
      sousTitre={`${formatDateFr(aujourdhui)} · journées à relever`}
    >
      <FileDuMatin entrees={entrees} ouvrir={wallet} />
    </Page>
  )
}
