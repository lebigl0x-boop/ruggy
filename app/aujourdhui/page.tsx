import { redirect } from 'next/navigation'

/** Le relevé du matin est devenu la page d'accueil. */
export default function AujourdhuiPage() {
  redirect('/')
}
