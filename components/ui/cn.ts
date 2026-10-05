/** Assemble des classes CSS en ignorant les valeurs vides. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
