import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Les pilotes de base restent externes au bundle serveur : ils sont chargés
  // à l'exécution, et seulement celui dont l'environnement a besoin.
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
  // Sans cette ligne, Next.js remonte jusqu'au dossier personnel pour chercher
  // la racine du projet, à cause d'un package-lock.json qui s'y trouve.
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
