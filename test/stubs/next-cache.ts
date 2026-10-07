/**
 * Remplace `next/cache` pendant les tests.
 *
 * `revalidatePath` exige le contexte d'une requête Next.js : hors serveur, il
 * lève « static generation store missing ». Les actions de `app/actions.ts`
 * l'appellent toutes pour rafraîchir l'écran — sans ce bouchon, aucune
 * d'elles ne serait testable.
 */
export function revalidatePath(): void {}
export function revalidateTag(): void {}
