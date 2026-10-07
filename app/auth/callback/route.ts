import { NextResponse, type NextRequest } from 'next/server'

import { clientServeur } from '@/lib/auth/supabase'

/**
 * Retour de Google.
 *
 * Le code reçu est échangé contre une session. Qui a le droit d'arriver
 * jusqu'ici se décide côté Google, dans la configuration du client OAuth :
 * toute authentification réussie ouvre une session.
 */
export async function GET(requete: NextRequest) {
  const code = requete.nextUrl.searchParams.get('code')
  const suite = requete.nextUrl.searchParams.get('suite') ?? '/'
  const origine = requete.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(new URL('/connexion?erreur=code', origine))
  }

  const supabase = await clientServeur()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/connexion?erreur=echange', origine))
  }

  // `suite` vient de l'URL : on n'accepte qu'un chemin interne, pour qu'un lien
  // forgé ne puisse pas rediriger ailleurs après connexion.
  const destination = suite.startsWith('/') && !suite.startsWith('//') ? suite : '/'
  return NextResponse.redirect(new URL(destination, origine))
}
