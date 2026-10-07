import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * Les clients Supabase, côté serveur uniquement.
 *
 * Supabase ne sert ici qu'à une chose : savoir qui est devant l'écran. Les
 * données, elles, continuent de passer par Drizzle et `lib/repo` — l'app parle
 * à Postgres en direct, pas à l'API REST de Supabase.
 *
 * La session vit dans des cookies. Deux contextes savent les écrire : les
 * Route Handlers (c'est là que la session naît et meurt) et le middleware
 * (qui la rafraîchit). Un Server Component, lui, ne peut que les lire.
 */

function variables(): { url: string; cle: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !cle) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont ' +
        'nécessaires à l’authentification. Voir .env.example.',
    )
  }

  return { url, cle }
}

/**
 * Client pour les Server Components et les Route Handlers.
 *
 * L'écriture des cookies est enveloppée : depuis un Server Component, Next.js
 * refuse d'y toucher. Ce n'est pas une erreur à traiter — le middleware
 * rafraîchit la session de son côté, et c'est lui qui a le droit d'écrire.
 */
export async function clientServeur() {
  const { url, cle } = variables()
  const magasin = await cookies()

  return createServerClient(url, cle, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (aPoser) => {
        try {
          for (const { name, value, options } of aPoser) {
            magasin.set(name, value, options)
          }
        } catch {
          // Appelé depuis un Server Component : lecture seule, le middleware
          // s'en charge.
        }
      },
    },
  })
}

/**
 * Client pour le middleware, qui doit reporter les cookies rafraîchis à la
 * fois sur la requête (pour la suite du traitement) et sur la réponse (pour
 * que le navigateur les garde).
 */
export function clientMiddleware(requete: NextRequest, reponse: NextResponse) {
  const { url, cle } = variables()

  return createServerClient(url, cle, {
    cookies: {
      getAll: () => requete.cookies.getAll(),
      setAll: (aPoser) => {
        for (const { name, value } of aPoser) {
          requete.cookies.set(name, value)
        }
        for (const { name, value, options } of aPoser) {
          reponse.cookies.set(name, value, options)
        }
      },
    },
  })
}
