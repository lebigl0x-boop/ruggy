import { describe, expect, it } from 'vitest'
import { MAX_TOKENS_PAR_JOUR, parseSaisie, saisieEstVide } from '@/lib/saisie'

/** Raccourci : les gains lus, dans l'ordre. */
const gains = (entree: string) => parseSaisie(entree).tokens.map((t) => t.gain)

describe('parseSaisie — découpage', () => {
  it('lit une suite de gains séparés par des espaces', () => {
    expect(gains('120 45 -80')).toEqual([120, 45, -80])
  })

  it('accepte le retour à la ligne, la tabulation, la virgule et le point-virgule', () => {
    expect(gains('120\n45\t-80, 30; 10')).toEqual([120, 45, -80, 30, 10])
  })

  it('ne confond pas la virgule décimale avec un séparateur', () => {
    expect(gains('45,5 120')).toEqual([45.5, 120])
  })

  it('ignore les lignes vides et les espaces superflus', () => {
    expect(gains('  120  \n\n\n   45 ')).toEqual([120, 45])
  })

  it('ne renvoie rien sur une saisie vide', () => {
    const lu = parseSaisie('   \n  ')
    expect(lu.tokens).toEqual([])
    expect(saisieEstVide(lu)).toBe(true)
  })
})

describe('parseSaisie — multiples', () => {
  it('traduit un multiple en pourcentage de montée', () => {
    // ×3 veut dire « monté à trois fois le prix d'achat », soit +200 %.
    expect(gains('x3')).toEqual([200])
    expect(gains('3x')).toEqual([200])
  })

  it('accepte un multiple décimal', () => {
    expect(gains('x1,5')).toEqual([50])
  })

  it('ne lit pas un multiple nul ou négatif', () => {
    const lu = parseSaisie('x0')
    expect(lu.tokens).toEqual([])
    expect(lu.ignores).toEqual(['x0'])
  })
})

describe('parseSaisie — perte', () => {
  it('reporte un gain négatif sur la perte du token', () => {
    // Sans ce report, le calcul retomberait sur la perte par défaut du
    // wallet et le bilan de la journée serait faux.
    const [token] = parseSaisie('-80').tokens
    expect(token).toMatchObject({ gain: -80, perteRug: 80 })
  })

  it('traite zéro comme une perte totale', () => {
    expect(parseSaisie('0').tokens[0]).toMatchObject({ gain: 0, perteRug: 100 })
  })

  it('plafonne la perte à 100 %', () => {
    expect(parseSaisie('-150').tokens[0]?.perteRug).toBe(100)
  })

  it('laisse la perte vide sur un gain positif', () => {
    // Un token monté sans atteindre l'objectif reprend la perte du wallet :
    // c'est la stratégie qui le dit, pas la saisie.
    expect(parseSaisie('45').tokens[0]?.perteRug).toBeNull()
  })
})

describe('parseSaisie — nom et délai', () => {
  it('lit nom, gain et délai sur une même ligne', () => {
    expect(parseSaisie('BONK 120 5m').tokens).toEqual([
      {
        name: 'BONK',
        gain: 120,
        perteRug: null,
        delay: 5,
        pris: true,
        raw: 'BONK 120 5m',
      },
    ])
  })

  it('rattache le délai au token courant sans en ouvrir un autre', () => {
    expect(gains('120 5m 45')).toEqual([120, 45])
  })

  it('convertit les heures en minutes', () => {
    expect(parseSaisie('120 1h').tokens[0]?.delay).toBe(60)
    expect(parseSaisie('120 90min').tokens[0]?.delay).toBe(90)
  })

  it('assemble un nom en plusieurs mots', () => {
    expect(parseSaisie('BONK COIN 120').tokens[0]?.name).toBe('BONK COIN')
  })

  it('ouvre un nouveau token quand un nom arrive après un gain', () => {
    const lu = parseSaisie('120 BONK 45')
    expect(lu.tokens.map((t) => [t.name, t.gain])).toEqual([
      [null, 120],
      ['BONK', 45],
    ])
  })

  it('garde un token nommé mais pas encore noté', () => {
    expect(parseSaisie('BONK').tokens[0]).toMatchObject({
      name: 'BONK',
      gain: null,
    })
  })
})

describe('parseSaisie — cas limites', () => {
  it('crée un token en attente sur « ? »', () => {
    expect(parseSaisie('120 ? 45').tokens.map((t) => t.gain)).toEqual([
      120,
      null,
      45,
    ])
  })

  it('accepte le signe pourcentage et le plus', () => {
    expect(gains('+120% 45%')).toEqual([120, 45])
  })

  it('signale les fragments non compris au lieu de les avaler', () => {
    const lu = parseSaisie('120 ### 45')
    expect(gains('120 ### 45')).toEqual([120, 45])
    expect(lu.ignores).toEqual(['###'])
  })

  it('coupe au-delà du plafond et le signale', () => {
    const lu = parseSaisie(Array(MAX_TOKENS_PAR_JOUR + 10).fill('120').join(' '))
    expect(lu.tokens).toHaveLength(MAX_TOKENS_PAR_JOUR)
    expect(lu.tronque).toBe(true)
  })

  it('ne signale pas de troncature sur une saisie normale', () => {
    expect(parseSaisie('120 45').tronque).toBe(false)
  })
})
