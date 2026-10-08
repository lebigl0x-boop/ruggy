'use client'

/**
 * Le filet des pages.
 *
 * Sans lui, une exception levée pendant le rendu d'une page ne produit rien de
 * visible : React abandonne la navigation, l'écran précédent reste affiché, et
 * la seule trace est un « Minified React error #441 » dans la console. Le
 * message réel, lui, est masqué en production — seul le `digest` permet de
 * retrouver la ligne correspondante dans les journaux Vercel.
 */

export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[360px] text-center">
        <p className="text-[17px]">Cette page n’a pas pu se charger.</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          Le plus souvent, la base est momentanément injoignable. Réessayer
          suffit généralement.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-full bg-accent px-4 py-2 text-[13.5px] font-semibold text-accent-ink transition hover:bg-white active:scale-[0.98]"
        >
          Réessayer
        </button>

        {/* Le digest est la seule clé qui relie cet écran à la ligne
            correspondante dans les journaux du déploiement. */}
        {error.digest ? (
          <p className="mt-5 font-mono text-[11px] text-ink-3">
            digest {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
