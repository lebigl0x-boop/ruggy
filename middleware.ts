import { NextResponse, type NextRequest } from 'next/server'

import { clientMiddleware } from '@/lib/auth/supabase'

/**
 * Le portier.
 *
 * Il fait deux choses à chaque requête : rafraîchir la session (les jetons
 * Supabase expirent, et seul un contexte autorisé à écrire des cookies peut
 * les renouveler), puis renvoyer vers la page de connexion quiconque n'en a
 * pas.
 *
 * Le contrôle est ici plutôt que dans chaque page : une page oubliée, c'est
 * une porte ouverte. Les pages peuvent faire confiance au fait qu'elles ne
 * sont rendues que pour quelqu'un d'authentifié.
 *
 * *Qui* a le droit de se connecter ne se décide pas ici mais côté Google, par
 * la configuration du client OAuth. Toute session valide entre.
 */

/** Chemins accessibles sans session : la connexion elle-même, et son retour. */
const PUBLICS = ['/connexion', '/auth/google', '/auth/callback', '/auth/deconnexion']

function estPublic(chemin: string): boolean {
  return PUBLICS.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))
}

export async function middleware(requete: NextRequest) {
  const reponse = NextResponse.next({ request: requete })
  const supabase = clientMiddleware(requete, reponse)

  // `getUser()` et non `getSession()` : le premier vérifie le jeton auprès de
  // Supabase, le second se contente de lire un cookie que le navigateur
  // pourrait avoir fabriqué.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const chemin = requete.nextUrl.pathname
  const autorise = user !== null

  if (!autorise && !estPublic(chemin)) {
    const cible = requete.nextUrl.clone()
    cible.pathname = '/connexion'
    // D'où l'on venait, pour y revenir une fois connecté.
    cible.searchParams.set('suite', chemin)
    return NextResponse.redirect(cible)
  }

  // Déjà connecté : la page de connexion n'a plus rien à offrir.
  if (autorise && chemin === '/connexion') {
    const cible = requete.nextUrl.clone()
    cible.pathname = '/'
    cible.search = ''
    return NextResponse.redirect(cible)
  }

  return reponse
}

export const config = {
  /**
   * Tout sauf les fichiers statiques et les images : les faire passer par le
   * portier coûterait un aller-retour Supabase pour chaque icône.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
