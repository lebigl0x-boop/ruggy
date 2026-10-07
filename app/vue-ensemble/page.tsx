import { redirect } from 'next/navigation'

/** La vue d'ensemble a été remplacée par le tableau de bord. */
export default function VueEnsemblePage() {
  redirect('/dashboard')
}
