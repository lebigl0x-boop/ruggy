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

  let user: Awaited<ReturnType<typeof lireUtilisateur>>

  try {
    user = await lireUtilisateur(requete, reponse)
  } catch (cause) {
    // Mal configuré : on refuse l'accès plutôt que de laisser passer, mais on
    // le dit. Une exception non rattrapée ici ne donne qu'un
    // « MIDDLEWARE_INVOCATION_FAILED » qui n'aide personne à comprendre.
    console.error('Middleware : authentification indisponible.', cause)
    return new NextResponse(
      'Configuration incomplète : NEXT_PUBLIC_SUPABASE_URL et ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY doivent être posées dans les ' +
        'variables d’environnement du déploiement.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  const chemin = requete.nextUrl.pathname
  const autorise = user !== null

  if (!autorise && !estPublic(chemin)) {
    const cible = requete.nextUrl.clone()
    cible.pathname = '/connexion'
    // D'où l'on venait, pour y revenir une fois connecté.
    cible.searchParams.set('suite', chemin)
    return rediriger(cible, reponse)
  }

  // Déjà connecté : la page de connexion n'a plus rien à offrir.
  if (autorise && chemin === '/connexion') {
    const cible = requete.nextUrl.clone()
    cible.pathname = '/'
    cible.search = ''
    return rediriger(cible, reponse)
  }

  return reponse
}

/**
 * Rediriger sans perdre la session.
 *
 * `clientMiddleware` a pu écrire des jetons rafraîchis sur `reponse` : quand
 * Supabase renouvelle un accès, il invalide l'ancien jeton de rafraîchissement
 * du même coup. Repartir sur un `NextResponse.redirect` neuf jetterait les
 * nouveaux cookies — le navigateur garderait un jeton que le serveur ne
 * reconnaît plus, la requête suivante échouerait, et le portier renverrait
 * encore vers /connexion. C'est la boucle de connexion classique.
 */
function rediriger(cible: URL, reponse: NextResponse): NextResponse {
  const redirection = NextResponse.redirect(cible)
  for (const cookie of reponse.cookies.getAll()) redirection.cookies.set(cookie)
  return redirection
}

/**
 * Qui est devant l'écran, ou `null`.
 *
 * `getClaims()` et non `getSession()` : le second se contente de lire un
 * cookie que le navigateur pourrait avoir fabriqué, le premier vérifie la
 * signature du jeton.
 *
 * Et `getClaims()` plutôt que `getUser()` : à clés asymétriques, la
 * vérification est locale, sans aller-retour vers Supabase — or ce code
 * s'exécute à chaque requête, préchargements compris. Avec l'ancien secret
 * partagé, la bibliothèque retombe d'elle-même sur un appel distant : jamais
 * moins sûr, simplement moins rapide.
 */
async function lireUtilisateur(requete: NextRequest, reponse: NextResponse) {
  const supabase = clientMiddleware(requete, reponse)
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return null
  return data.claims
}

export const config = {
  /**
   * Tout sauf les fichiers statiques et les images : les faire passer par le
   * portier coûterait un aller-retour Supabase pour chaque icône.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
