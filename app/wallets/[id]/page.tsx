import { notFound } from 'next/navigation'

import { WalletDetail } from '@/components/wallet/wallet-detail'
import { getSettings } from '@/lib/repo/settings'
import { getWallet } from '@/lib/repo/wallets'

export const dynamic = 'force-dynamic'

export default async function WalletPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const wallet = getWallet(id)
  if (!wallet) notFound()

  // La clé force un état local neuf quand on passe d'un wallet à l'autre.
  return <WalletDetail key={wallet.id} wallet={wallet} settings={getSettings()} />
}
