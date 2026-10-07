import { VueDashboard } from '@/components/dashboard/vue-dashboard'
import { Page } from '@/components/ui/page'
import { computePortefeuille } from '@/lib/portefeuille'
import { getSettings } from '@/lib/repo/settings'
import { listWallets } from '@/lib/repo/wallets'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [wallets, settings] = await Promise.all([listWallets(), getSettings()])
  const vue = computePortefeuille(wallets, settings)

  return (
    <Page
      titre="Dashboard"
      sousTitre={`${vue.total} ${vue.total > 1 ? 'wallets suivis' : 'wallet suivi'} · ${
        vue.joursObserves
      } ${vue.joursObserves > 1 ? 'journées relevées' : 'journée relevée'}`}
    >
      <VueDashboard vue={vue} />
    </Page>
  )
}
