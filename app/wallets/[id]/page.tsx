import { notFound } from 'next/navigation'

import { VueWallet } from '@/components/wallet/vue-wallet'
import { lireWallet } from '@/lib/repo/wallets'

export const dynamic = 'force-dynamic'

export default async function WalletPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const wallet = await lireWallet(id)
  if (!wallet) notFound()

  // La clé force un état local neuf quand on passe d'un wallet à l'autre.
  return <VueWallet key={wallet.id} wallet={wallet} />
}
