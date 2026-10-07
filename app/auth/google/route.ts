import { NextResponse, type NextRequest } from 'next/server'

import { clientServeur } from '@/lib/auth/supabase'

/**
 * Départ vers Google.
 *
 * Supabase construit l'URL d'autorisation ; on ne fait que suivre. Le retour
 * se fait sur /auth/callback, avec le chemin d'origine en bagage.
 */
export async function GET(requete: NextRequest) {
  const suite = requete.nextUrl.searchParams.get('suite') ?? '/'
  const retour = new URL('/auth/callback', requete.nextUrl.origin)
  retour.searchParams.set('suite', suite)

  const supabase = await clientServeur()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: retour.toString() },
  })

  if (error || !data.url) {
    const echec = new URL('/connexion', requete.nextUrl.origin)
    echec.searchParams.set('erreur', 'google')
    return NextResponse.redirect(echec)
  }

  return NextResponse.redirect(data.url)
}
