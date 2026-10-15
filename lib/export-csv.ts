/**
 * Export CSV d'un wallet : ses réglages, ses lancements et ses trades.
 *
 * Le fichier ne porte **aucune colonne calculée** : ni résultat, ni cumul, ni
 * taux. Un lecteur qui reçoit les réglages et les saisies peut tout recalculer
 * — et détecter une erreur au passage. Un lecteur qui reçoit des résultats
 * tout faits ne peut que les croire.
 *
 * Les trois lots cohabitent dans le même fichier, séparés par la colonne
 * `phase`. C'est la règle de toute l'app : screening, test et trade ne
 * s'additionnent jamais — le préambule le redit, pour que ce soit vrai aussi
 * pour qui lit le fichier sans connaître l'app.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import type { WalletComplet } from './repo/types'

/** Les colonnes du fichier, dans l'ordre. */
const COLONNES = [
  'phase',
  'jour',
  'nom',
  'mint',
  'issue',
  'entree_sol',
  'sortie_sol',
] as const

/**
 * Échappe une valeur au format CSV (RFC 4180).
 *
 * `null` sort en case vide et non en « null » : une case vide se lit comme une
 * absence par tous les tableurs, « null » se lirait comme une chaîne.
 */
function cellule(valeur: string | number | null): string {
  if (valeur === null) return ''
  const texte = String(valeur)
  return /[",\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

/**
 * Un nombre tel qu'il a été saisi, point décimal.
 *
 * Volontairement en notation anglaise : le fichier part vers un lecteur
 * automatique, pas vers un tableur français. Une virgule décimale demanderait
 * un séparateur de colonnes différent, et c'est exactement le genre de détail
 * qui transforme un export en source d'erreurs.
 */
function nombre(valeur: number | null): string {
  return valeur === null || !Number.isFinite(valeur) ? '' : String(valeur)
}

export type OptionsExport = {
  /** Horodatage de l'export, décidé par l'appelant. */
  genereLe?: string | null
}

export function walletVersCsv(
  wallet: WalletComplet,
  options: OptionsExport = {},
): string {
  const screening = wallet.tokens.filter((token) => token.phase === 'screening')
  const test = wallet.tokens.filter((token) => token.phase === 'test')

  const preambule = [
    `# wallet: ${wallet.nom}`,
    `# adresse: ${wallet.adresse}`,
    `# phase: ${wallet.phase}`,
    `# cree_le: ${wallet.creeLe}`,
    `# test_le: ${wallet.testLe ?? ''}`,
    `# trade_le: ${wallet.tradeLe ?? ''}`,
    `# mise_sol: ${wallet.reglages.mise}`,
    `# tp_pct: ${wallet.reglages.tp}`,
    `# frais_sol: ${wallet.reglages.frais}`,
    `# lignes: screening=${screening.length} test=${test.length} trade=${wallet.trades.length}`,
    `# jours_observes: ${wallet.jours.length}`,
    ...(options.genereLe ? [`# genere_le: ${options.genereLe}`] : []),
    '#',
    '# Les trois phases ne s’additionnent jamais.',
    '# screening : échantillon choisi à la main dans le passé, flatteur par construction.',
    '# test      : relevé exhaustif jour par jour, mais SIMULÉ — le résultat se',
    '#             recalcule avec mise_sol, tp_pct et frais_sol.',
    '# trade     : trades réellement joués — le résultat est sortie_sol − entree_sol,',
    '#             rien d’autre : frais de réseau et slippage y sont déjà.',
    '#',
    '# issue = tp   : le take-profit a été atteint → mise_sol × tp_pct / 100 − frais_sol',
    '# issue = rate : il ne l’a pas été          → − mise_sol − frais_sol',
    '#',
    '# Une ligne `jour` sans aucun token est une journée sans lancement :',
    '# le wallet n’a rien lancé ce jour-là, et la journée compte dans les jours observés.',
  ]

  /** Les journées sans lancement, pour qu'elles existent dans le fichier. */
  const joursPeuples = new Set(test.map((token) => token.jour))
  const joursVides = wallet.jours
    .filter((journee) => !joursPeuples.has(journee.jour))
    .map((journee) => [
      'test',
      journee.jour,
      null,
      null,
      'sans-lancement',
      '',
      '',
    ] as (string | number | null)[])

  const lignes = [
    ...screening.map((token) => [
      'screening',
      null,
      token.nom,
      token.mint,
      token.issue,
      '',
      '',
    ]),
    ...test.map((token) => [
      'test',
      token.jour,
      token.nom,
      token.mint,
      token.issue,
      '',
      '',
    ]),
    ...joursVides,
    ...wallet.trades.map((trade) => [
      'trade',
      trade.date,
      trade.nom,
      trade.mint,
      trade.issue,
      nombre(trade.entreeSol),
      nombre(trade.sortieSol),
    ]),
  ].map((ligne) => ligne.map(cellule).join(','))

  return [...preambule, COLONNES.join(','), ...lignes].join('\n') + '\n'
}

/**
 * Nom de fichier lisible et sans surprise.
 *
 * Tout ce qui n'est pas alphanumérique devient un tiret : un nom de wallet est
 * saisi librement, et une barre oblique ou un guillemet dedans casserait
 * l'en-tête `Content-Disposition`.
 */
export function nomFichierCsv(nom: string, jour: string): string {
  const base =
    nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'wallet'

  return `ruggers-${base}-${jour}.csv`
}
