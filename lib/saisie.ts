/**
 * Lecture de la saisie rapide du matin.
 *
 * En phase de test on relève tous les tokens d'une journée d'un coup, en
 * texte libre : « 120 x3 -80 BONK 45 5m ». Saisir ligne par ligne dans un
 * tableau coûterait dix fois plus de temps.
 *
 * Fonctions pures : pas de base, pas de React, pas de date « maintenant ».
 */

import { parseNumberFr, parsePerteToken } from './validation'

/** Un token lu dans la saisie, prêt à être inséré. */
export type SaisieToken = {
  name: string | null
  /** `null` = token relevé mais pas encore noté (saisi « ? »). */
  gain: number | null
  /** Renseignée seulement quand la saisie porte une perte explicite. */
  perteRug: number | null
  delay: number | null
  /** Le fragment d'origine, pour l'aperçu avant validation. */
  raw: string
}

export type SaisieResult = {
  tokens: SaisieToken[]
  /** Fragments non compris, à signaler à l'écran plutôt qu'à avaler en silence. */
  ignores: string[]
  /** La saisie dépassait le plafond : le surplus a été coupé. */
  tronque: boolean
}

/**
 * Plafond par journée. Un copier-coller malheureux ne doit pas créer des
 * milliers de lignes dans la base.
 */
export const MAX_TOKENS_PAR_JOUR = 200

/** Marque interne qui protège la virgule décimale du découpage en champs. */
const VIRGULE = '\u0000'

const RE_MULTIPLE_PREFIXE = /^x(\d+(?:[.,]\d+)?)$/i
const RE_MULTIPLE_SUFFIXE = /^(\d+(?:[.,]\d+)?)x$/i
const RE_DELAI = /^(\d+(?:[.,]\d+)?)\s*(mn|min(?:utes?)?|m|h(?:eures?)?)$/i
const RE_NOMBRE = /^[+-]?\d+(?:[.,]\d+)?\s*%?$/

type Champ =
  | { kind: 'gain'; value: number }
  | { kind: 'attente' }
  | { kind: 'delai'; value: number }
  | { kind: 'nom'; value: string }
  | { kind: 'inconnu'; value: string }

/**
 * Classe un fragment de saisie.
 *
 * L'ordre des tests compte : « 3x » est un multiple, « 3m » un délai, « 3 »
 * un gain. Les suffixes ne se recouvrent pas, mais les reconnaître avant le
 * nombre nu évite qu'un « 3x » finisse en nom.
 */
function classer(champ: string): Champ {
  if (champ === '?') return { kind: 'attente' }

  const multiple = RE_MULTIPLE_PREFIXE.exec(champ) ?? RE_MULTIPLE_SUFFIXE.exec(champ)
  if (multiple) {
    const facteur = parseNumberFr(multiple[1]!)
    // Un multiple est une montée : ×3 vaut +200 %. Un facteur nul ou négatif
    // n'a pas de sens, on laisse le fragment partir en inconnu.
    if (facteur !== null && facteur > 0) {
      return { kind: 'gain', value: (facteur - 1) * 100 }
    }
    return { kind: 'inconnu', value: champ }
  }

  const delai = RE_DELAI.exec(champ)
  if (delai) {
    const valeur = parseNumberFr(delai[1]!)
    if (valeur !== null && valeur >= 0) {
      const heures = delai[2]!.toLowerCase().startsWith('h')
      return { kind: 'delai', value: heures ? valeur * 60 : valeur }
    }
    return { kind: 'inconnu', value: champ }
  }

  if (RE_NOMBRE.test(champ)) {
    const valeur = parseNumberFr(champ.replace('%', ''))
    if (valeur !== null) return { kind: 'gain', value: valeur }
    return { kind: 'inconnu', value: champ }
  }

  // Tout ce qui commence par une lettre est un nom de token. Le reste
  // (ponctuation seule, « 12a3 »…) est signalé plutôt qu'avalé.
  if (/^[\p{L}]/u.test(champ)) return { kind: 'nom', value: champ }
  return { kind: 'inconnu', value: champ }
}

/**
 * Traduit un gain saisi en couple (gain, perte).
 *
 * Un gain négatif porte l'information de la perte : « −80 » veut dire « le
 * token a dumpé de 80 % ». Sans ce report, le calcul retomberait sur la perte
 * par défaut du wallet et le bilan de la journée serait faux.
 *
 * Par convention « 0 » vaut perte totale : dans ce suivi, un token noté zéro
 * est un token parti à zéro.
 */
function perteDepuisGain(gain: number): number | null {
  if (gain > 0) return null
  if (gain === 0) return 100
  return parsePerteToken(gain)
}

/** Un token en cours de construction, le temps de lire ses fragments. */
type EnCours = {
  nom: string[]
  gain: number | null
  noteGain: boolean
  delai: number | null
  raw: string[]
}

function vide(): EnCours {
  return { nom: [], gain: null, noteGain: false, delai: null, raw: [] }
}

function estVide(token: EnCours): boolean {
  return !token.noteGain && token.nom.length === 0 && token.delai === null
}

function finaliser(token: EnCours): SaisieToken {
  return {
    name: token.nom.length > 0 ? token.nom.join(' ') : null,
    gain: token.gain,
    perteRug: token.gain !== null ? perteDepuisGain(token.gain) : null,
    delay: token.delai,
    raw: token.raw.join(' '),
  }
}

/**
 * Découpe une ligne en fragments.
 *
 * Les séparateurs sont l'espace, la tabulation, la virgule et le point-virgule
 * — pour qu'un collage depuis un tableur marche sans retouche. La virgule
 * encadrée de chiffres est épargnée : c'est une virgule décimale française.
 */
function fragments(ligne: string): string[] {
  return ligne
    .replace(/(\d),(\d)/g, `$1${VIRGULE}$2`)
    .split(/[\s,;]+/)
    .map((champ) => champ.replaceAll(VIRGULE, ',').trim())
    .filter((champ) => champ !== '')
}

/**
 * Lit une saisie libre et en tire la liste des tokens de la journée.
 *
 * Un retour à la ligne termine toujours le token courant ; sur une même
 * ligne, c'est l'arrivée d'un second gain (ou d'un nom après un gain) qui
 * ouvre le token suivant. « 120 45 » fait donc deux tokens, « BONK 120 5m »
 * un seul.
 */
export function parseSaisie(input: string): SaisieResult {
  const tokens: SaisieToken[] = []
  const ignores: string[] = []
  let tronque = false

  const pousser = (token: EnCours): void => {
    if (estVide(token)) return
    if (tokens.length >= MAX_TOKENS_PAR_JOUR) {
      tronque = true
      return
    }
    tokens.push(finaliser(token))
  }

  for (const ligne of input.split(/\r?\n/)) {
    let courant = vide()

    for (const champ of fragments(ligne)) {
      const lu = classer(champ)

      switch (lu.kind) {
        case 'gain':
        case 'attente': {
          // Un deuxième gain sur la même ligne ouvre un nouveau token.
          if (courant.noteGain) {
            pousser(courant)
            courant = vide()
          }
          courant.noteGain = true
          courant.gain = lu.kind === 'gain' ? lu.value : null
          break
        }

        case 'nom': {
          // Le nom précède son gain : s'il en arrive un après, c'est que le
          // token précédent est terminé.
          if (courant.noteGain) {
            pousser(courant)
            courant = vide()
          }
          courant.nom.push(lu.value)
          break
        }

        case 'delai': {
          courant.delai = lu.value
          break
        }

        case 'inconnu': {
          ignores.push(lu.value)
          continue
        }
      }

      courant.raw.push(champ)
    }

    pousser(courant)
  }

  return { tokens, ignores, tronque }
}

/** La saisie ne produit aucun token exploitable. */
export function saisieEstVide(result: SaisieResult): boolean {
  return result.tokens.length === 0
}
