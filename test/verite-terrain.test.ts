import { describe, expect, it } from 'vitest'

import verite from './verite-terrain.json'
import { multipleDepuisPrix } from '@/lib/analyse'

/**
 * Mesure de l'écart entre l'outil et un relevé manuel.
 *
 * Ce test ne vérifie pas du code : il vérifie **la justesse de l'outil face à la
 * réalité**. Le fichier `verite-terrain.json` contient des sommets relevés à la
 * main sur Padre ; on compare le multiple qui en découle à celui que l'outil
 * calcule sur les mêmes prix d'entrée.
 *
 * Il reste vert tant que le fichier n'est pas rempli — son rôle est d'être
 * lancé après l'avoir complété, et de dire où l'outil dérape.
 *
 * Ce qu'il ne peut pas faire : appeler les API. Un test qui dépend du réseau
 * échoue pour des raisons qui n'ont rien à voir avec le code. Il compare donc
 * des prix relevés à des prix relevés, et c'est à l'analyse réelle de produire
 * les siens — voir le mode d'emploi dans le JSON.
 */

type Cas = {
  exemple?: boolean
  mint: string
  nom: string
  acheteA: string
  prixEntree: number
  prixSommet: number | null
  /** Rempli par l'outil, si vous voulez comparer colonne à colonne. */
  prixSommetOutil?: number | null
}

const cas = (verite.cas as Cas[]).filter((c) => c.exemple !== true)
const tolerance = verite.toleranceMultiple

describe('vérité terrain', () => {
  it('le fichier est lisible et cohérent', () => {
    expect(typeof tolerance).toBe('number')
    expect(tolerance).toBeGreaterThan(0)
    for (const c of cas) {
      expect(c.mint, `${c.nom} : mint manquant`).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
      expect(Number.isFinite(Date.parse(c.acheteA)), `${c.nom} : date illisible`).toBe(true)
      expect(c.prixEntree, `${c.nom} : prix d’entrée nul`).toBeGreaterThan(0)
    }
  })

  it('le multiple relevé est calculable pour chaque cas renseigné', () => {
    const renseignes = cas.filter((c) => c.prixSommet !== null)
    for (const c of renseignes) {
      const multiple = multipleDepuisPrix(c.prixEntree, c.prixSommet)
      expect(multiple, `${c.nom}`).not.toBeNull()
      expect(multiple!, `${c.nom} : sommet sous le prix d’entrée`).toBeGreaterThan(0)
    }
  })

  it('l’écart de l’outil reste dans la tolérance', () => {
    const comparables = cas.filter(
      (c) => c.prixSommet !== null && c.prixSommetOutil !== null && c.prixSommetOutil !== undefined,
    )

    if (comparables.length === 0) {
      // Rien à comparer : le fichier n'a pas encore reçu les valeurs de l'outil.
      expect(comparables).toHaveLength(0)
      return
    }

    const ecarts = comparables.map((c) => {
      const attendu = multipleDepuisPrix(c.prixEntree, c.prixSommet)!
      const obtenu = multipleDepuisPrix(c.prixEntree, c.prixSommetOutil!)!
      return { nom: c.nom, attendu, obtenu, ecart: Math.abs(obtenu - attendu) / attendu }
    })

    const hors = ecarts.filter((e) => e.ecart > tolerance)
    const detail = hors
      .map((e) => `${e.nom} : relevé ×${e.attendu.toFixed(2)}, outil ×${e.obtenu.toFixed(2)} (${(e.ecart * 100).toFixed(0)} %)`)
      .join('\n')

    expect(hors, `hors tolérance (${(tolerance * 100).toFixed(0)} %) :\n${detail}`).toHaveLength(0)
  })
})
