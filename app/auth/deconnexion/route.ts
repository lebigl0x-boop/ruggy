import { NextResponse, type NextRequest } from 'next/server'

import { clientServeur } from '@/lib/auth/supabase'

/**
 * Fin de session.
 *
 * En POST uniquement : un GET se déclencherait au simple chargement d'une
 * image ou d'un lien préchargé.
 */
export async function POST(requete: NextRequest) {
  const supabase = await clientServeur()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/connexion', requete.nextUrl.origin), {
    status: 303,
  })
}
