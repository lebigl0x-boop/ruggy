/**
 * Export CSV d'un wallet : une ligne par token, tous lots confondus.
 *
 * Le grain est le token et non la journée, et c'est délibéré. Un agrégat par
 * journée se recalcule depuis les tokens ; l'inverse, non. Exporter les
 * journées reviendrait à livrer un résumé en se privant de ce qui permet de
 * le vérifier.
 *
 * Pour la même raison, le fichier ne porte **aucune colonne calculée** : ni
 * résultat en SOL, ni cumul, ni « à l'objectif ». Un lecteur qui reçoit les
 * réglages et les saisies peut tout recalculer — et détecter une erreur au
 * passage. Un lecteur qui reçoit des résultats tout faits ne peut que les
 * croire.
 *
 * Les trois lots cohabitent dans le même fichier, séparés par la colonne
 * `phase`. C'est la règle de toute l'app : screening, test et trade ne
 * s'additionnent jamais — le préambule le redit, pour que ce soit vrai aussi
 * pour qui lit le fichier sans connaître l'app.
 *
 * Fonctions pures : pas de base, pas de date « maintenant », pas de React.
 */

import type { GlobalSettings, WalletWithTokens } from './repo/types'

/** Les colonnes du fichier, dans l'ordre. */
const COLONNES = [
  'phase',
  'jour',
  'etat_jour',
  'position',
  'nom',
  'mint',
  'gain_pct',
  'perte_pct',
  'delai_min',
  'pris',
  'entree_sol',
  'sortie_sol',
] as const

/**
 * Échappe une valeur au format CSV (RFC 4180).
 *
 * `null` sort en case vide et non en « null » : une case vide se lit comme
 * une absence par tous les tableurs, « null » se lirait comme une chaîne.
 */
function cellule(value: string | number | boolean | null): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return value ? 'oui' : 'non'

  const texte = String(value)
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
function nombre(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '' : String(value)
}

export type ExportOptions = {
  /** Horodatage de l'export, décidé par l'appelant. */
  genereLe?: string | null
}

/**
 * Le fichier CSV complet d'un wallet.
 *
 * Le préambule est en lignes `#`, que les lecteurs automatiques savent
 * ignorer. Il porte les réglages de stratégie : sans eux, aucun résultat
 * n'est recalculable, et le fichier ne serait qu'une liste de pourcentages
 * sans unité de compte.
 */
export function walletToCsv(
  wallet: WalletWithTokens,
  settings: GlobalSettings,
  options: ExportOptions = {},
): string {
  const jours = new Map(wallet.days.map((jour) => [jour.id, jour]))

  const parPhase = { screening: 0, test: 0, trade: 0 }
  for (const token of wallet.tokens) parPhase[token.phase] += 1

  const preambule = [
    `# wallet: ${wallet.label}`,
    `# adresse: ${wallet.address}`,
    `# statut: ${wallet.status}`,
    `# analyse_le: ${wallet.analyzedAt}`,
    `# test_ouvert_le: ${wallet.testStartedAt ?? ''}`,
    `# trade_ouvert_le: ${wallet.tradeStartedAt ?? ''}`,
    `# mise_sol: ${wallet.strategy.mise}`,
    `# objectif_pct: ${wallet.strategy.objectif}`,
    `# perte_defaut_pct: ${wallet.strategy.perteRug}`,
    `# frais_sol: ${wallet.strategy.frais}`,
    `# taux_vise_pct: ${wallet.strategy.tauxVise}`,
    `# sol_eur: ${settings.solPriceEur ?? ''}`,
    `# tokens: screening=${parPhase.screening} test=${parPhase.test} trade=${parPhase.trade}`,
    ...(options.genereLe ? [`# genere_le: ${options.genereLe}`] : []),
    '#',
    '# Les trois phases ne s’additionnent jamais.',
    '# screening : échantillon choisi à la main dans le passé, flatteur par construction.',
    '# test      : relevé exhaustif jour par jour, mais SIMULÉ — le résultat se',
    '#             recalcule avec mise_sol, objectif_pct, perte_defaut_pct et frais_sol.',
    '# trade     : trades réellement joués — le résultat est sortie_sol − entree_sol,',
    '#             rien d’autre : frais de réseau et slippage y sont déjà.',
    '#',
    '# gain_pct vide = token relevé mais pas noté : il ne compte dans aucun résultat.',
    '# perte_pct vide = on reprend perte_defaut_pct.',
    '# pris = non : le wallet a bien lancé ce token, mais il n’a pas été joué.',
  ]

  const lignes = wallet.tokens.map((token) => {
    const jour = token.dayId !== null ? jours.get(token.dayId) : undefined

    return [
      token.phase,
      jour?.day ?? null,
      jour?.state ?? null,
      token.position,
      token.name,
      token.mint,
      nombre(token.gain),
      nombre(token.perteRug),
      nombre(token.delay),
      token.pris,
      nombre(token.entreeSol),
      nombre(token.sortieSol),
    ]
      .map(cellule)
      .join(',')
  })

  return [...preambule, COLONNES.join(','), ...lignes].join('\n') + '\n'
}

/**
 * Nom de fichier lisible et sans surprise.
 *
 * Tout ce qui n'est pas alphanumérique devient un tiret : un libellé de
 * wallet est saisi librement, et une barre oblique ou un guillemet dedans
 * casserait l'en-tête `Content-Disposition`.
 */
export function nomFichierCsv(label: string, jour: string): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'wallet'

  return `ruggers-${base}-${jour}.csv`
}
