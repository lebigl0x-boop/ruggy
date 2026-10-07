/**
 * La porte d'entrée.
 *
 * Volontairement nue : un seul bouton. Qui a le droit d'entrer se décide côté
 * Google, par la configuration du client OAuth — cette page ne fait que
 * proposer le départ.
 */

export const dynamic = 'force-dynamic'

const MESSAGES: Record<string, string> = {
  code: 'Google n’a rien renvoyé. Réessayez.',
  echange: 'La session n’a pas pu être ouverte. Réessayez.',
  google: 'La connexion à Google a échoué. Vérifiez la configuration du fournisseur dans Supabase.',
}

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; suite?: string }>
}) {
  const { erreur, suite } = await searchParams
  const message = erreur ? (MESSAGES[erreur] ?? MESSAGES.echange) : null

  const depart = `/auth/google${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-5">
      <div className="w-full max-w-[340px]">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-accent text-[18px] font-extrabold tracking-tight text-accent-ink"
          >
            R
          </span>
          <div>
            <h1 className="text-[17px] leading-tight font-semibold tracking-tight">
              Ruggers
            </h1>
            <p className="text-[12.5px] text-ink-3">Suivi des wallets</p>
          </div>
        </div>

        {message !== null ? (
          <p className="mt-6 rounded-card border border-separator bg-card px-4 py-3 text-[13px] text-red">
            {message}
          </p>
        ) : null}

        <a
          href={depart}
          className="mt-6 flex items-center justify-center gap-2.5 rounded-full bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-accent-ink transition hover:bg-white active:scale-[0.98]"
        >
          <LogoGoogle />
          Continuer avec Google
        </a>

        <p className="mt-5 text-[11.5px] leading-relaxed text-ink-3">
          L’accès est réservé aux comptes autorisés dans la configuration
          Google du projet.
        </p>
      </div>
    </main>
  )
}

/** Le G de Google, aux couleurs officielles — c'est ce que la marque exige. */
function LogoGoogle() {
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[17px] w-[17px] shrink-0"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
