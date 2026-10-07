/**
 * Icônes dessinées à la main, dans l'esprit SF Symbols : trait de 1,75 px,
 * extrémités arrondies, cadre carré. Elles héritent de la couleur du texte.
 */
type IconProps = { className?: string }

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M12.6 12.6 L16.5 16.5" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2}>
      <path d="M10 4.5 V15.5 M4.5 10 H15.5" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2}>
      <path d="M7.5 4 L13.5 10 L7.5 16" />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2.25}>
      <path d="M12.5 4 L6.5 10 L12.5 16" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6 L14 14 M14 6 L6 14" />
    </svg>
  )
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 4.5 H5.5 A1.5 1.5 0 0 0 4 6 V14.5 A1.5 1.5 0 0 0 5.5 16 H14 A1.5 1.5 0 0 0 15.5 14.5 V12" />
      <path d="M11 4 H16 V9" />
      <path d="M16 4 L9.5 10.5" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} strokeWidth={2.25}>
      <path d="M4.5 10.5 L8 14 L15.5 6" />
    </svg>
  )
}

/** Soleil levant : le relevé du matin. */
export function MatinIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 14h14" />
      <path d="M6.5 14a3.5 3.5 0 0 1 7 0" />
      <path d="M10 4v2M4.8 6.3l1.4 1.4M15.2 6.3l-1.4 1.4" />
      <path d="M5 17h10" />
    </svg>
  )
}

/** Entonnoir : les quatre états de la méthode. */
export function EntonnoirIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 4h14l-5.2 6.2v5.3l-3.6 1.8v-7.1z" />
    </svg>
  )
}

/** Tableau : la liste de tous les wallets. */
export function TableauIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M3 8h14M8 8v8" />
    </svg>
  )
}

/**
 * Portefeuille : un wallet, l'objet suivi par l'app.
 *
 * Le rabat à droite donne la silhouette reconnaissable à petite taille, là où
 * un simple rectangle se confondrait avec une carte ou un tableau.
 */
export function PortefeuilleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="14" height="10" rx="2.6" />
      <path d="M12.8 9h4.2v3.2h-4.2a1.6 1.6 0 0 1 0-3.2z" />
    </svg>
  )
}
