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

  // Un wallet par carte, dans l'ordre d'ouverture de leur test. L'ordre ne
  // dépend pas de ce qu'il reste à faire : une carte qui remonterait d'elle-même
  // pendant qu'on saisit déplacerait la suivante sous le curseur.
  const file = await listFileDuMatin(aujourdhui)
  const entrees: EntreeMatin[] = file.map((entree) => ({
    walletId: entree.wallet.id,
    label: entree.wallet.label,
    address: entree.wallet.address,
    strategy: entree.wallet.strategy,
    journees: entree.journees,
    aRelever: entree.aRelever,
    plancherAtteint: entree.plancherAtteint,
  }))

  return (
    <Page
      titre="Ce matin"
      // Pas de décompte ici : il vit dans la file, qui est la seule à savoir
      // ce qui vient d'être validé. Affiché aux deux endroits, il resterait
      // figé le temps qu'une validation remonte du serveur — deux chiffres
      // pour la même chose, qui se contredisent à l'écran.
      sousTitre={`${formatDateFr(aujourdhui)} · les journées terminées, à relever`}
    >
      <FileDuMatin entrees={entrees} aujourdhui={aujourdhui} ouvrir={wallet} />
    </Page>
  )
}
