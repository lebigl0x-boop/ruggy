'use client'

import { useState } from 'react'

import type { Strategy } from '@/lib/compute'
import { STRATEGY_BOUNDS, type StrategyField } from '@/lib/validation'
import { NumberField } from '../ui/field'
import { CheckIcon } from '../ui/icons'
import { ListGroup, ListLabel, ListRow } from '../ui/list'

const ORDRE: StrategyField[] = ['mise', 'objectif', 'perteRug', 'frais', 'tauxVise']

const EXPLICATIONS: Record<StrategyField, string> = {
  mise: 'Ce que vous engagez sur chaque token.',
  objectif: 'La montée à laquelle vous revendez.',
  perteRug: 'Perte appliquée aux tokens dont la perte n’est pas renseignée.',
  frais: 'Frais de réseau et de plateforme, par trade.',
  tauxVise: 'Le taux de réussite à partir duquel vous jugez un wallet rentable.',
}

export function StrategySection({
  strategy,
  onChange,
  onUseAsDefault,
}: {
  strategy: Strategy
  onChange: (field: StrategyField, value: number | null) => void
  onUseAsDefault: () => void
}) {
  const [confirme, setConfirme] = useState(false)

  return (
    <ListGroup
      title="Stratégie"
      footer="Ces réglages ne valent que pour ce wallet. Les modifier recalcule tous ses résultats."
    >
      {ORDRE.map((field) => {
        const bounds = STRATEGY_BOUNDS[field]
        return (
          <ListRow key={field}>
            <span className="min-w-0 flex-1">
              <ListLabel>{bounds.label}</ListLabel>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                {EXPLICATIONS[field]}
              </span>
            </span>
            <span className="w-24 shrink-0 text-[17px]">
              <NumberField
                ariaLabel={`${bounds.label} en ${bounds.unit}`}
                value={strategy[field]}
                suffix={bounds.unit}
                onChange={(value) => onChange(field, value)}
              />
            </span>
          </ListRow>
        )
      })}

      <ListRow>
        <button
          type="button"
          onClick={() => {
            onUseAsDefault()
            setConfirme(true)
            setTimeout(() => setConfirme(false), 2500)
          }}
          className="flex w-full items-center gap-1.5 text-left text-[17px] text-blue transition active:opacity-50"
        >
          {confirme ? (
            <>
              <CheckIcon className="h-[17px] w-[17px] shrink-0" />
              Réglages enregistrés par défaut
            </>
          ) : (
            'Utiliser ces réglages pour les nouveaux wallets'
          )}
        </button>
      </ListRow>
    </ListGroup>
  )
}
