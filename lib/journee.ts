/**
 * La journée, telle qu'on la vit : de minuit à minuit, heure de Paris.
 *
 * Tout le reste de l'app manipule des dates `AAAA-MM-JJ` sans fuseau, ce qui
 * suffit tant qu'on saisit à la main. Dès qu'on interroge la chaîne, il faut
 * trancher : un lancement de 00:30 à Paris appartient à la journée du jour, pas
 * à celle de la veille en UTC. Ce module fait cette traduction, et lui seul.
 *
 * Fonctions pures : pas de base, pas de réseau, pas de React. La seule entorse
 * est `hier()`, qui prend l'instant courant en argument plutôt que de le lire.
 */

export const FUSEAU = 'Europe/Paris'

/**
 * Le décalage du fuseau, en minutes, à un instant donné.
 *
 * Lu auprès d'`Intl` plutôt que codé en dur : Paris est à UTC+1 l'hiver et
 * UTC+2 l'été, et les dates de bascule changent d'une année sur l'autre.
 */
function decalage(instant: Date): number {
  const partie = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU,
    timeZoneName: 'longOffset',
  })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')

  // « GMT+02:00 », ou « GMT » tout court à décalage nul.
  const lu = /GMT([+-])(\d{2}):(\d{2})/.exec(partie?.value ?? '')
  if (!lu) return 0

  const signe = lu[1] === '-' ? -1 : 1
  return signe * (Number(lu[2]) * 60 + Number(lu[3]))
}

/**
 * L'instant UTC auquel il est minuit à Paris, pour une date donnée.
 *
 * Deux passes, et elles sont nécessaires : le décalage à appliquer dépend de
 * l'instant qu'on cherche justement à calculer. La première passe donne une
 * approximation à une heure près, la seconde la corrige — c'est ce qui rend
 * juste les deux nuits de changement d'heure.
 */
export function minuitParis(jour: string): Date {
  const naif = Date.parse(`${jour}T00:00:00Z`)
  const approche = new Date(naif - decalage(new Date(naif)) * 60_000)
  return new Date(naif - decalage(approche) * 60_000)
}

/** La date du lendemain, en `AAAA-MM-JJ`. */
export function jourSuivant(jour: string): string {
  // Midi plutôt que minuit : un décalage de fuseau ne peut pas faire changer
  // de date depuis le milieu de la journée.
  return new Date(Date.parse(`${jour}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** La date de la veille, en `AAAA-MM-JJ`. */
export function jourPrecedent(jour: string): string {
  return new Date(Date.parse(`${jour}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/**
 * Les bornes d'une journée, en secondes Unix.
 *
 * `debut` inclus, `fin` exclu — c'est minuit du lendemain. Une journée fait
 * 23, 24 ou 25 heures selon la saison, et c'est voulu.
 */
export function bornesJournee(jour: string): { debut: number; fin: number } {
  return {
    debut: Math.floor(minuitParis(jour).getTime() / 1000),
    fin: Math.floor(minuitParis(jourSuivant(jour)).getTime() / 1000),
  }
}

/** La date du jour à Paris, en `AAAA-MM-JJ`. */
export function aujourdhui(maintenant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant)
}

/** La date d'hier à Paris. C'est la journée qu'on relève le plus souvent. */
export function hier(maintenant: Date): string {
  return jourPrecedent(aujourdhui(maintenant))
}

/** L'heure d'un horodatage Unix, à Paris : « 01:25 ». */
export function heureParis(secondes: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(secondes * 1000))
}

/**
 * Un délai en secondes, dit court : « +3 min », « +1 h 12 ».
 *
 * Sert à lire d'un coup d'œil si le TP a eu le temps d'être atteint. En
 * dessous de la minute on descend aux secondes : sur ces tokens, l'écart entre
 * « +12 s » et « +4 min » change la façon de jouer.
 */
export function formatDelai(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes < 0) return '—'
  if (secondes < 60) return `+${Math.round(secondes)} s`

  const minutes = Math.round(secondes / 60)
  if (minutes < 60) return `+${minutes} min`

  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  return reste === 0 ? `+${heures} h` : `+${heures} h ${String(reste).padStart(2, '0')}`
}
