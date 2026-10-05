import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[320px] text-center">
        <p className="text-[17px]">Ce wallet n’existe plus.</p>
        <Link href="/" className="mt-2 inline-block text-[17px] text-blue">
          Revenir à la liste
        </Link>
      </div>
    </div>
  )
}
