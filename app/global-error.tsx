'use client'

/**
 * Le filet du layout racine.
 *
 * `app/error.tsx` ne couvre que les pages : il vit *dans* le layout, et ne
 * peut donc rien attraper de ce que le layout lève lui-même. Or
 * `app/layout.tsx` interroge Supabase puis la base à chaque requête — c'est
 * l'endroit le plus exposé de l'application.
 *
 * Ce composant remplace tout le document : il doit porter ses propres `<html>`
 * et `<body>`, et ne peut pas s'appuyer sur le thème posé par le layout.
 */

export default function ErreurGlobale({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: '#0d0d0e', color: '#f2f2f3' }}>
        <main
          style={{
            display: 'grid',
            minHeight: '100dvh',
            placeItems: 'center',
            padding: '20px',
            font: '400 15px/1.5 system-ui, -apple-system, sans-serif',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 360 }}>
            <p style={{ margin: 0, fontSize: 17 }}>Ruggers n’a pas pu démarrer.</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.6 }}>
              La base de données ou le service d’authentification est
              injoignable.
            </p>

            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 20,
                border: 0,
                borderRadius: 999,
                padding: '9px 16px',
                font: '600 13.5px system-ui, sans-serif',
                background: '#f2f2f3',
                color: '#0d0d0e',
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>

            {error.digest ? (
              <p
                style={{
                  margin: '20px 0 0',
                  font: '400 11px ui-monospace, monospace',
                  opacity: 0.5,
                }}
              >
                digest {error.digest}
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  )
}
