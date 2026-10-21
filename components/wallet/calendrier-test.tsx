'use client'

import { useMemo } from 'react'

import { formatSol } from '@/lib/format'
import { Calendrier, Legende, type MarqueJour } from './calendrier'

/**
 * Le calendrier des journées de test.
 *
 * Relever un test est un geste de calendrier : on se repère à « hier », pas à
 * une ligne de tableau. La grille montre d'un coup d'œil les jours tenus et les
 * trous, et cliquer un jour ouvre son tableau — c'est tout le vocabulaire de
 * l'écran.
 *
 * Trois états par jour, et ils comptent : non relevé (je n'ai pas regardé),
 * relevé sans lancement (il n'a rien lancé), relevé avec lancements. Les deux
 * premiers sont la distinction que toute la phase de test cherche à tenir, donc
 * ils ne se ressemblent pas.
 */

export type JourReleve = { tokens: number; resultat: number }

export function CalendrierTest({
  mois,
  onMois,
  releves,
  selection,
  onSelection,
  aujourdhui,
}: {
  /** Mois affiché, au format `AAAA-MM`. */
  mois: string
  onMois: (mois: string) => void
  /** Ce qui est relevé, par jour ISO. Absent de la table = pas regardé. */
  releves: ReadonlyMap<string, JourReleve>
  selection: string
  onSelection: (jour: string) => void
  /** Dernier jour relevable : on ne note pas une journée à venir. */
  aujourdhui: string
}) {
  const marques = useMemo(() => {
    const table = new Map<string, MarqueJour>()
    for (const [jour, releve] of releves) {
      // Une journée relevée sans lancement est grise, pas neutre par défaut :
      // elle dit « il n'a rien lancé », ce qui n'est pas « je n'ai pas regardé ».
      const vide = releve.tokens === 0
      table.set(jour, {
        ton: vide || releve.resultat === 0 ? 'neutre' : releve.resultat > 0 ? 'vert' : 'rouge',
        titre: vide
          ? 'Relevée, aucun lancement'
          : `${releve.tokens} lancement${releve.tokens > 1 ? 's' : ''} · ${formatSol(releve.resultat)}`,
      })
    }
    return table
  }, [releves])

  return (
    <Calendrier
      mois={mois}
      onMois={onMois}
      marques={marques}
      selection={selection}
      onSelection={onSelection}
      aujourdhui={aujourdhui}
      legende={
        <>
          <Legende classe="bg-green" libelle="journée gagnante" />
          <Legende classe="bg-red" libelle="perdante" />
          <Legende classe="bg-ink-3" libelle="sans lancement" />
          <span>· un jour nu n’a pas été regardé</span>
        </>
      }
    />
  )
}
