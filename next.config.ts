import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // better-sqlite3 est un module natif : il doit rester externe au bundle serveur.
  serverExternalPackages: ['better-sqlite3'],
  // Sans cette ligne, Next.js remonte jusqu'au dossier personnel pour chercher
  // la racine du projet, à cause d'un package-lock.json qui s'y trouve.
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
