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
