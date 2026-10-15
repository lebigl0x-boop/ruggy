import type { NextRequest } from 'next/server'

import { nomFichierCsv, walletVersCsv } from '@/lib/export-csv'
import { todayIso } from '@/lib/format'
import { lireWallet } from '@/lib/repo/wallets'

/**
 * L'export CSV d'un wallet, en téléchargement direct.
 *
 * Un Route Handler plutôt qu'une Server Action : le navigateur sait déjà
 * télécharger une réponse HTTP avec son nom de fichier, et un simple lien
 * suffit. L'authentification est celle du middleware, qui couvre tout le site.
 *
 * Les paramètres sont typés à la main plutôt qu'avec `RouteContext` : ce
 * dernier s'appuie sur des types générés par `next dev`/`next build`, et
 * `npm run typecheck` doit pouvoir tourner sur une copie fraîche du dépôt.
 */
export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const wallet = await lireWallet(id)

  if (!wallet) {
    return new Response('Wallet introuvable.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const csv = walletVersCsv(wallet, { genereLe: new Date().toISOString() })

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nomFichierCsv(wallet.nom, todayIso())}"`,
      // Les chiffres bougent à chaque saisie : un export mis en cache
      // renverrait l'état d'hier sans que rien ne le signale.
      'cache-control': 'no-store',
    },
  })
}
