import { redirect } from 'next/navigation'

/** L'entonnoir n'est qu'une section du tableau de bord. */
export default function EntonnoirPage() {
  redirect('/dashboard')
}
