import { Tableur } from '@/components/wallets/tableur'
import { Page } from '@/components/ui/page'
import { computePortefeuille } from '@/lib/portefeuille'
import { getSettings } from '@/lib/repo/settings'
import { listWallets } from '@/lib/repo/wallets'

export const dynamic = 'force-dynamic'

export default async function WalletsPage() {
  const [wallets, settings] = await Promise.all([listWallets(), getSettings()])
  const vue = computePortefeuille(wallets, settings)

  return (
    <Page
      titre="Wallets"
      sousTitre={`${vue.total} suivis · ${vue.parStatut.test} en test, ${vue.parStatut.screening} en screening`}
    >
      <Tableur lignes={vue.lignes} />
    </Page>
  )
}
