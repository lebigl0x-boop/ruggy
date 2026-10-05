/** Écran d'accueil du panneau de droite : visible seulement sur desktop. */
export default function HomePage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[320px] text-center">
        <p className="text-[17px] text-ink-2">Sélectionnez un wallet</p>
        <p className="mt-1.5 text-[13px] text-ink-3">
          Ou ajoutez-en un avec le bouton + en haut de la liste.
        </p>
      </div>
    </div>
  )
}
