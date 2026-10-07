import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // `server-only` lève une erreur dès l'import hors contexte serveur React.
      'server-only': here('./test/stubs/server-only.ts'),
      // `next/cache` exige le contexte d'une requête : voir le bouchon.
      'next/cache': here('./test/stubs/next-cache.ts'),
      '@': here('./'),
    },
  },
})
