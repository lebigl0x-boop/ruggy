import { VueDashboard } from '@/components/dashboard/vue-dashboard'
import { listerWallets } from '@/lib/repo/wallets'
import { courbes, resumer, totaux } from '@/lib/resume'

export const dynamic = 'force-dynamic'

/**
 * Le tableau de bord : un dossier par wallet, et les trois totaux séparés.
 * C'est la page qui s'ouvre, parce que c'est de là qu'on décide quoi ouvrir.
 */
export default async function DashboardPage() {
  const wallets = await listerWallets()

  return (
    <VueDashboard
      resumes={wallets.map((wallet) => resumer(wallet))}
      totaux={totaux(wallets)}
      courbes={courbes(wallets)}
      adresses={wallets.map((wallet) => wallet.adresse)}
    />
  )
}
