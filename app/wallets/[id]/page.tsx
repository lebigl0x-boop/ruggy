import { notFound } from 'next/navigation'

import { WalletDetail } from '@/components/wallet/wallet-detail'
import { todayIso } from '@/lib/format'
import { joursManquants, jourPrecedent } from '@/lib/jours'
import { getSettings } from '@/lib/repo/settings'
import { getWallet } from '@/lib/repo/wallets'

export const dynamic = 'force-dynamic'

export default async function WalletPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [wallet, settings] = await Promise.all([getWallet(id), getSettings()])
  if (!wallet) notFound()

  // La date du jour est décidée ici : la lire dans le navigateur ferait
  // diverger le premier rendu de l'hydratation autour de minuit.
  const aujourdhui = todayIso()

  // Ce que ce wallet-ci a en attente de relevé. Le relevé du matin porte sur
  // la veille : un test lancé aujourd'hui n'a encore rien à saisir.
  //
  // Une journée seulement ouverte ne compte pas comme saisie : elle attend
  // son relevé au même titre qu'une journée absente, et la file du matin la
  // réclame. Les deux décomptes doivent dire la même chose.
  const joursAFaire =
    wallet.status === 'test' && wallet.testStartedAt !== null
      ? joursManquants({
          debut: wallet.testStartedAt,
          jusqua: jourPrecedent(aujourdhui),
          saisis: wallet.days
            .filter((jour) => jour.phase === 'test' && jour.state !== 'ouvert')
            .map((jour) => jour.day),
        }).length
      : 0

  // La clé force un état local neuf quand on passe d'un wallet à l'autre.
  return (
    <WalletDetail
      key={wallet.id}
      wallet={wallet}
      settings={settings}
      joursAFaire={joursAFaire}
      aujourdhui={aujourdhui}
    />
  )
}
