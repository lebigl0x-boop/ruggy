# Ruggers — récapitulatif technique

Document destiné à un assistant qui ne connaît pas le code. Il décrit **ce que
le code fait réellement**, pas ce qu'il devrait faire. Les écarts, zones
ambiguës et incohérences sont signalés dans la section 7 et, ponctuellement,
par des encarts « ⚠️ ».

Aucune donnée réelle n'est reproduite ici : tous les exemples sont fictifs.

---

## 1. Vue d'ensemble

### À quoi sert l'app

Ruggers est un outil **personnel et manuel** de suivi de wallets de
développeurs de memecoins Solana (« ruggers »). L'idée : observer ce qu'un
wallet lance, mesurer ce qu'une stratégie de copie *aurait* rapporté, puis —
si le wallet convainc — passer à des trades réellement joués et comparer le
réel à la prévision.

Le modèle mental central est un **entonnoir en trois phases** qui ne
s'additionnent jamais :

| Lot | Nature | Chiffres |
|---|---|---|
| `screening` | échantillon historique choisi à la main | simulés, biaisés par construction |
| `test` | relevé exhaustif jour après jour | simulés (« ce que ça aurait donné ») |
| `trade` | trades réellement joués | comptés (`sortie_sol − entree_sol`) |

Cette règle de non-addition est répétée partout dans le code et dans l'UI.

### Stack technique

- **Next.js 16** (App Router, React 19, Server Components + Server Actions),
  TypeScript 7, Tailwind CSS 4.
- **Drizzle ORM** sur **PostgreSQL**.
  - Prod / dev : `postgres.js` vers le Postgres de **Supabase** (`DATABASE_URL`,
    à pointer sur le *pooler* port 6543, mode transaction → `prepare: false`).
  - Tests : **PGlite** (Postgres en mémoire, dans le processus), activé par
    `RUGGERS_DB_MEMOIRE=1`.
  - Choix du pilote : `lib/db/index.ts`, via `createRequire` (import paresseux,
    `serverExternalPackages` dans `next.config.ts`).
  - `db` est un **Proxy** mémorisé dans `globalThis.__ruggersDb` : un seul pool
    par processus (sinon saturation des connexions en serverless).
- **Auth** : Supabase Auth + OAuth Google. `middleware.ts` protège tout le site
  sauf `/connexion`, `/auth/google`, `/auth/callback`, `/auth/deconnexion`.
  Vérification par `supabase.auth.getClaims()` (signature vérifiée localement).
- **Tests** : Vitest (`test/`, 14 fichiers, 300 tests — tous verts au moment de
  la rédaction).
- **Déploiement** : Vercel, région `fra1` (`vercel.json`).
- Interface **entièrement en français**, thème sombre par défaut (bascule
  clair/sombre stockée dans `localStorage` sous `ruggers-theme`).

### Lancement

```
npm run dev         # serveur de dev Next.js
npm run build       # build de production
npm run start
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run db:generate # drizzle-kit generate (migrations)
npm run db:setup    # applique les migrations + crée la ligne settings id=1
npm run db:reprise  # scripts/sqlite-vers-postgres.ts (reprise d'une ancienne base SQLite)
npm run db:noms     # scripts/retrouver-noms-tokens.ts (rattrape les noms de tokens)
```

⚠️ Les commentaires de `lib/db/index.ts` et `drizzle.config.ts` parlent de
`npm run db:migrate` / `db:push` : **ces scripts n'existent pas** dans
`package.json`. Le script réel est `db:setup`.

Les migrations ne sont **plus** appliquées au démarrage de l'app : il faut
lancer `db:setup` avant un déploiement, en visant la connexion **directe**
(port 5432) et non le pooler (le pooler ne tient pas le verrou de migration).

### Où sont stockées les données

Tout est dans **PostgreSQL (Supabase)**, en 3 tables + 1 table de réglages :
`settings`, `wallets`, `wallet_days`, `tokens`
(schéma : `lib/db/schema.ts`, migrations : `lib/db/migrations/`).

Une seule donnée vit **hors base** : les **brouillons** du relevé du matin,
stockés dans le `localStorage` du navigateur sous la clé
`ruggers:brouillon:v1:<walletId>:<AAAA-MM-JJ>` (`components/matin/brouillons.ts`).
Ils sont effacés uniquement après confirmation d'enregistrement serveur.

### Secrets

Le dépôt contient un fichier **`.env.local` non versionné** (couvert par
`.gitignore`) et un modèle versionné `.env.example`. Les variables attendues
sont, **sans leurs valeurs** :

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `HELIUS_API_KEY` (optionnelle — sert uniquement à retrouver le nom d'un token)

`HELIUS_API_KEY` est lue dans `lib/token-meta.ts` (`viaHelius`) et injectée en
query string vers `https://mainnet.helius-rpc.com`. Aucune clé n'est codée en
dur dans le dépôt.

---

## 2. Modèle de données

Tous les horodatages sont des **chaînes ISO-8601** (`text`), pas des
`timestamp` : le code compare et trie des chaînes. Les dates de journée sont au
format court `AAAA-MM-JJ`.

### 2.1 `settings` — réglages globaux (une seule ligne, `id = 1`)

| Colonne | Type SQL | Défaut | Signification |
|---|---|---|---|
| `id` | integer PK | — | toujours `1` |
| `sol_price_eur` | double | `null` | prix du SOL en €, pour convertir les résultats. `null` = conversions masquées |
| `default_mise` | double NOT NULL | `0.1` | mise modèle des nouveaux wallets, en SOL |
| `default_objectif` | double NOT NULL | `100` | objectif modèle, en % |
| `default_perte_rug` | double NOT NULL | `90` | perte par défaut modèle, en % |
| `default_frais` | double NOT NULL | `0.003` | frais par trade modèle, en SOL |
| `default_taux_vise` | double NOT NULL | `30` | taux visé modèle, en % |
| `updated_at` | text NOT NULL | `now()` UTC | — |

Les `default_*` sont **copiés** dans le wallet à sa création
(`lib/repo/wallets.ts:createWallet`), jamais référencés : changer les réglages
globaux ne réécrit pas l'historique.

La ligne est créée par `ensureSettingsRow` (`lib/db/seed.ts`), appelée par
`db:setup` et par les tests. Si elle est absente, `getSettings` renvoie
`{ solPriceEur: null, defaults: DEFAULT_STRATEGY }`.

### 2.2 `wallets`

| Colonne | Type | Défaut | Signification |
|---|---|---|---|
| `id` | text PK | `crypto.randomUUID()` | — |
| `label` | text NOT NULL | — | nom libre. Vidé → remplacé par `"Sans nom"` côté action |
| `address` | text NOT NULL **UNIQUE** | — | adresse Solana du wallet suivi |
| `analyzed_at` | text NOT NULL | — | date d'analyse, `AAAA-MM-JJ` |
| `notes` | text NOT NULL | `''` | notes libres |
| `tag_override` | text | `null` | tag manuel : `null` \| `'rentable'` \| `'surveiller'` \| `'pas'` |
| `status` | text NOT NULL | `'screening'` | `screening` \| `test` \| `valide` \| `trade` \| `rejete` |
| `test_started_at` | text | `null` | premier jour de la phase de test |
| `trade_started_at` | text | `null` | premier jour de la phase active |
| `mise` | double NOT NULL | `0.1` | **SOL** engagés par trade (simulation) |
| `objectif` | double NOT NULL | `100` | **%** de montée minimum pour « réussi » |
| `perte_rug` | double NOT NULL | `90` | **%** de perte appliquée à défaut |
| `frais` | double NOT NULL | `0.003` | **SOL** de frais fixes par trade (simulation) |
| `taux_vise` | double NOT NULL | `30` | **%** de réussite visé (seuil du tag « Rentable ») |
| `source` | text NOT NULL | `'manual'` | `'manual'` \| `'helius'` (import auto, non implémenté) |
| `created_at` / `updated_at` | text NOT NULL | — | — |

Index : unique sur `address`, index sur `analyzed_at`, index sur `status`.

À la création, 10 lignes de tokens vides sont insérées
(`LIGNES_INITIALES = 10`, phase `screening`).

⚠️ Les valeurs par défaut des colonnes (`0.1`, `100`, `90`, `0.003`, `30`) ne
servent jamais en pratique : `createWallet` fournit toujours explicitement les
valeurs issues de `settings`. Elles coïncident avec `DEFAULT_STRATEGY`
(`lib/compute.ts`).

### 2.3 `wallet_days` — une journée relevée, pour un wallet

| Colonne | Type | Défaut | Signification |
|---|---|---|---|
| `id` | text PK | uuid | — |
| `wallet_id` | text NOT NULL FK → `wallets.id` | — | `ON DELETE CASCADE` |
| `day` | text NOT NULL | — | jour observé, `AAAA-MM-JJ` |
| `state` | text NOT NULL | `'actif'` | `actif` \| `inactif` \| `ouvert` |
| `phase` | text NOT NULL | `'test'` | `test` \| `trade` |
| `note` | text NOT NULL | `''` | note de journée |
| `created_at` / `updated_at` | text NOT NULL | — | — |

Index unique : **(`wallet_id`, `day`, `phase`)** — une même date peut porter une
journée de test *et* une journée de trade.

Les trois états, et pourquoi ils ne sont pas interchangeables
(`lib/day-report.ts`, `DayState`) :

- `actif` : relevée, le wallet a tradé ce jour-là ;
- `inactif` : relevée, **il n'a rien lancé** — c'est une observation ;
- `ouvert` : journée créée pour être saisie au fil de l'eau, **rien n'y a
  encore été porté** — ce n'est *pas* une observation.

Seuls `actif` et `inactif` comptent dans les décomptes (`joursObserves`,
plancher du test, taux d'inactivité).

⚠️ `note` n'est **jamais écrite ni affichée** par l'interface. La fonction
`setDayNote` existe dans `lib/repo/days.ts` mais n'est exposée par aucune
Server Action.

### 2.4 `tokens` — un lancement observé ou un trade joué

| Colonne | Type | Défaut | Signification |
|---|---|---|---|
| `id` | text PK | uuid | — |
| `wallet_id` | text NOT NULL FK → `wallets.id` | — | `ON DELETE CASCADE` |
| `position` | integer NOT NULL | `max(position)+1` | ordre d'affichage |
| `name` | text | `null` | nom lisible du token |
| `mint` | text | `null` | adresse (CA) du token |
| `gain` | double | `null` | **%** de montée depuis le buy. `null` = **token non noté** |
| `perte_rug` | double | `null` | **%** de perte propre à ce lancement. `null` = on reprend celle du wallet |
| `delay` | double | `null` | délai avant dump, en **minutes** |
| `pris` | boolean NOT NULL | `true` | le token a été joué. `false` = observé mais écarté par le filtre d'entrée |
| `phase` | text NOT NULL | `'screening'` | `screening` \| `test` \| `trade` |
| `day_id` | text FK → `wallet_days.id` | `null` | journée de rattachement. Toujours renseignée hors screening. `ON DELETE CASCADE` |
| `entree_sol` | double | `null` | **SOL réellement sorti** du portefeuille |
| `sortie_sol` | double | `null` | **SOL réellement rentré**, frais réseau et slippage compris |
| `source` | text NOT NULL | `'manual'` | `'manual'` \| `'helius'` |
| `created_at` / `updated_at` | text NOT NULL | — | — |

Index : (`wallet_id`, `position`), (`day_id`).

Points importants :

- `gain = null` ⇒ **token non noté** ⇒ il n'entre dans aucun décompte de
  résultat (sauf s'il porte un couple entrée/sortie valide, cf. § 4.1).
- `pris = false` ⇒ le token **compte dans ce que le wallet a lancé** (et donc
  dans le taux à l'objectif) mais **pas dans le résultat en SOL**.
- `entree_sol` / `sortie_sol` : dès que les deux sont exploitables, ils
  **remplacent entièrement** la simulation pour ce token (ni `mise`, ni `frais`,
  ni `perte_rug` n'interviennent).

### 2.5 Objets métier (`lib/repo/types.ts`)

La couche `lib/repo` traduit lignes SQL ↔ objets métier (`lib/repo/mappers.ts`).
L'UI n'importe jamais Drizzle. Les mappers sont **tolérants** : une valeur
inconnue retombe sur un défaut sûr —

- statut inconnu → `'screening'` (`toStatus`)
- phase de token inconnue → `'screening'` (`toPhase`)
- phase de journée inconnue → `'test'` (`toDayPhase`)
- état de journée inconnu → `'actif'` (`toDayState`)
- `tag_override` invalide → `null`

---

## 3. Les phases

### 3.1 Deux axes distincts : `status` (wallet) et `phase` (token / journée)

- **`wallets.status`** dit *où en est le wallet dans l'entonnoir*.
- **`tokens.phase`** et **`wallet_days.phase`** disent *à quel lot appartient la
  donnée*. Un token prend la phase de sa journée (`createDayTokenAction`) ou la
  phase déduite du statut au moment de la saisie (`saveDayAction`).
- Le **tag** (§ 4.4) est un troisième axe : il dit ce que disent les chiffres.

Conséquence : remettre un wallet en test ne fait **pas** basculer ses anciennes
journées de trade dans le lot simulé.

### 3.2 Les trois lots

| | screening | test | trade |
|---|---|---|---|
| Constitution | tokens saisis à la main, sans journée | relevé exhaustif par journée | trades réellement joués, par journée |
| `day_id` | `null` | renseigné | renseigné |
| `entree_sol` / `sortie_sol` | vides | vides | renseignés (idéalement) |
| Résultat | simulé | simulé | compté |
| Plancher | 10 tokens notés (`SEUIL_ANALYSE`) | 4 journées observées (`JOURS_MINIMUM_TEST`) | — |

### 3.3 Transitions (toutes dans `app/actions.ts`)

```
screening ──startTestAction──> test ──concludeTestAction──> valide
     ^            |                         └──────────> rejete
     |            |                                         |
     └─cancelTestAction                  reopenTestAction ───┘
                                                   |
                                                   v
                                valide ──startTradeAction──> trade
                                   ^──stopTradeAction────────┘
```

- `startTestAction` : n'accepte que `screening` → `test`. Pose
  `test_started_at = todayIso()`. **Le test démarre aujourd'hui**, donc la
  première journée à relever sera demain (le relevé porte sur la veille).
- `concludeTestAction(id, 'valide' | 'rejete')` : refuse si le wallet n'est pas
  en `test`, **et refuse si `verdictDisponible` est faux** (≥ 4 journées
  observées **et** au moins 1 token noté). Le message d'erreur renvoyé est celui
  du « conseil » du rapport de test.
- `reopenTestAction` : remet en `test` n'importe quel wallet sauf un wallet en
  `screening`. Ne touche pas aux journées.
- `cancelTestAction` : `test` → `screening`. Efface `test_started_at`
  **seulement si aucune journée n'existe** (`wallet.days.length === 0` — toutes
  phases confondues).
- `setWalletStatusAction(id, status)` : **échappatoire assumée**, aucun contrôle
  de plancher. Pose `test_started_at` / `trade_started_at` s'ils sont `null`.
  C'est ce qui alimente le bouton « Classer à la main », disponible **à tous les
  statuts, phase de test comprise** : il permet notamment de passer directement
  `test` → `trade` sans attendre les 4 journées, sur un wallet dont on est sûr.
  Les journées déjà relevées ne sont jamais supprimées.
- `startTradeAction` : n'accepte que `valide` → `trade`. Pose
  `trade_started_at` s'il est `null`.
- `stopTradeAction` : `trade` → `valide`, **sans rien effacer** (les journées de
  trade et leurs montants restent).

### 3.4 Calcul de chaque phase

Trois modules, empilés :

```
lib/compute.ts        computeTokenResult / computeWalletReport  (le cœur)
       ^
lib/day-report.ts     computeDayReport   (découpage par journée, commun)
       ^                        ^
lib/test-report.ts    lib/trade-report.ts
computeTestReport     computeTradeReport
```

- **Screening** : `computeWalletReport(screeningTokens(wallet).map(toTokenInput), strategy, options)`.
  Pas de notion de journée.
- **Test** : `computeTestReport(toDayInputs(wallet, 'test'), strategy, options)`.
  `toDayInputs` assemble les journées de phase `test` et leurs tokens ; une
  journée sans token garde sa place avec une liste vide.
- **Trade** : `computeTradeReport(toDayInputs(wallet, 'trade'), strategy, options)`.

Tous ces modules sont des **fonctions pures** : pas d'accès base, pas de
`Date.now()`, pas de React. Les nombres sont renvoyés **bruts, non arrondis** —
l'arrondi appartient à `lib/format.ts`.

---

## 4. Règles de calcul, en détail

### 4.1 Résultat d'un token — `computeTokenResult` (`lib/compute.ts:237`)

Entrée : `TokenInput { gain, perteRug, delay, pris, entreeSol?, sortieSol? }`
et `Strategy { mise, objectif, perteRug, frais, tauxVise }`.
Sortie : `TokenResult { percent, sol, hit, reel } | null`.

**Étape 0 — le token est-il noté ?**

```ts
const note = token.gain !== null && Number.isFinite(token.gain)
```

**Étape 1 — y a-t-il des montants réels exploitables ?**
(`montantsReels`, `lib/compute.ts:183`)

```ts
entree et sortie doivent être non-null, finis, avec entree > 0 et sortie >= 0
```

Une entrée ≤ 0 n'est pas un trade (pourcentage infini) ; une sortie absente veut
dire « position pas encore soldée », **pas** « tout perdu ».

**Régime A — trade réel** (si `montantsReels` renvoie un couple) :

```ts
sol     = sortie - entree
percent = (sol / entree) * 100
hit     = note ? (gain >= objectif) : (percent >= objectif)
reel    = true
```

→ **Ni `mise`, ni `frais`, ni `perteRug` n'interviennent.** Les frais réseau et
le slippage sont censés être déjà dans les montants saisis.

**Régime B — simulation** (sinon). Si le token n'est pas noté → `null`
(« non noté »). Sinon :

```ts
hit        = gain >= objectif
perteBrute = (token.perteRug fini) ? token.perteRug : strategy.perteRug
perte      = Math.min(100, Math.abs(perteBrute))      // grandeur positive, plafond 100 %
percent    = hit ? gain : -perte
sol        = (strategy.mise * percent) / 100 - strategy.frais
reel       = false
```

**Les quatre issues possibles pour un token :**

| Cas | Condition | `result` |
|---|---|---|
| **Gagnant** | noté, `gain >= objectif` (ou trade réel dont le pourcentage passe l'objectif) | `hit: true` |
| **Perdant** | noté, `gain < objectif` | `hit: false`, `percent = -perte` |
| **Non noté** | `gain` vide **et** pas de couple entrée/sortie valide | `null` — ignoré partout |
| **Non pris** | `pris = false` | le résultat est **calculé quand même** (pour montrer ce que le filtre a évité) mais exclu du net |

Le drapeau `pris` **n'intervient pas** dans `computeTokenResult` : ce qu'un
lancement a fait ne dépend pas de la décision de le jouer. C'est
`computeWalletReport` qui écarte ensuite les non-pris du résultat.

### 4.2 Rôle exact de `objectif_pct`, `perte_defaut_pct`, `perte_pct`, `frais_sol`, `mise_sol`

**`objectif_pct` (`wallets.objectif`) : c'est un SEUIL de réussite, PAS un
take-profit.**

C'est explicite dans le code (`lib/compute.ts`, commentaire de
`computeTokenResult` et du type `Strategy`) et dans le calcul :

```ts
const percent = hit ? token.gain! : -perte      // ← gain réel, pas objectif
```

Conséquences concrètes, avec `mise = 0.1`, `objectif = 100`, `frais = 0.003` :

| `gain` saisi | `hit` | `percent` retenu | `sol` |
|---|---|---|---|
| `300` | oui | `+300` | `0.1 × 3 − 0.003 = +0.297` |
| `100` | oui | `+100` | `0.1 × 1 − 0.003 = +0.097` |
| `80` | **non** | `−90` (perte par défaut) | `−0.09 − 0.003 = −0.093` |
| `−40` | non | `−40` | `−0.04 − 0.003 = −0.043` |

Un token à +300 % ne vaut donc pas la même chose qu'un token à +100 %. Le code
justifie ce choix : plafonner effacerait « la seule chose qui rend une adresse
6/4 rentable — l'ampleur de ses coups ».

**Effet de bord à connaître** : l'objectif sert *en même temps* de seuil de
réussite **et** de déclencheur de perte totale. Un token monté à +80 % avec un
objectif à 100 % n'est pas compté « +80 % » mais **`−perte`** (soit −90 % par
défaut). Il n'existe aucun régime intermédiaire. Voir § 7.

**`perte_defaut_pct` (`wallets.perteRug`)** : perte appliquée à tout token raté
dont `tokens.perte_rug` est vide.

**`perte_pct` (`tokens.perteRug`)** : perte propre à ce lancement. Toujours
ramenée à une **grandeur positive plafonnée à 100 %** :

- à la saisie — `parsePerteToken` (`lib/validation.ts:100`) :
  `Math.min(100, Math.abs(valeur))` ;
- côté serveur — `updateTokenAction` repasse systématiquement par
  `parsePerteToken` (`app/actions.ts:134`) et `normaliserLigne` fait de même ;
- au calcul — `Math.min(100, Math.abs(perteBrute))`.

Donc « −50 » et « 50 » donnent le même résultat : une perte de 50 %. Sans cela,
un signe moins inverserait la perte en gain.

Cas particulier de la saisie rapide (`lib/saisie.ts:113`, `perteDepuisGain`) :
un gain négatif reporte sa valeur absolue en perte, et **`gain = 0` vaut perte
totale (100 %)** — « dans ce suivi, un token noté zéro est un token parti à
zéro ». ⚠️ Ce module n'est plus branché à l'UI (§ 7).

**`frais_sol` (`wallets.frais`)** : frais fixes **en SOL**, retranchés **une
fois par token noté**, gagnant **comme** perdant :

```ts
sol = (mise * percent) / 100 - frais
```

Une perte de 100 % coûte donc `mise + frais`, soit plus que la mise. Les frais
ne sont **jamais** appliqués à un trade réel (ils sont censés être dans les
montants).

**`mise_sol` (`wallets.mise`)** : taille de position **théorique**, en SOL. Elle
ne sert que :
1. dans la formule de simulation ci-dessus ;
2. dans le repli du seuil de rentabilité (§ 4.3) ;
3. dans `expositionSol` d'une journée (`lib/day-report.ts:190`) : un token pris
   sans montant réel compte pour `strategy.mise` d'exposition.

### 4.3 Bilan d'un lot — `computeWalletReport` (`lib/compute.ts:354`)

Parcours des tokens **dans l'ordre fourni**, avec deux cumuls en parallèle :

```ts
for (const token of tokens) {
  const result = computeTokenResult(token, strategy)
  if (result === null) { rows.push({result: null, pris, cumulSol: null}); continue }

  n += 1                        // le wallet est jugé sur TOUT ce qu'il a lancé
  cumulTout += result.sol       // ce que ça aurait donné en prenant tout
  if (result.hit) hits += 1

  if (!token.pris) { rows.push({result, pris: false, cumulSol: null}); continue }

  nPris += 1
  if (result.reel) nReels += 1
  cumul += result.sol           // le net : seuls les tokens PRIS
  if (result.hit) gainsSol.push(result.sol) else pertesSol.push(result.sol)
  rows.push({result, pris: true, cumulSol: cumul})
}
```

Champs produits :

| Champ | Formule |
|---|---|
| `n` | tokens **notés** (pris ou non) |
| `nPris` | tokens notés **et** pris |
| `nReels` | parmi les pris, ceux au résultat réel |
| `hits` | tokens notés ayant atteint l'objectif (pris ou non) |
| `taux` | `n > 0 ? (hits / n) * 100 : 0` — **mesure le wallet**, pas la stratégie |
| `netSol` | somme des `result.sol` des tokens **pris** |
| `netSolTout` | somme des `result.sol` de **tous** les tokens notés |
| `apportFiltre` | `netSol − netSolTout` (> 0 = le filtre évite plus de pertes qu'il ne rate de gains) |
| `netEur` | `solPriceEur !== null ? netSol * solPriceEur : null` |
| `moyenneSol` | `nPris > 0 ? netSol / nPris : 0` |
| `projection100` | `moyenneSol * 100` — « sur 100 tokens pris » |
| `delaiMoyen` | moyenne arithmétique des `delay` non nuls ; `null` si aucun |
| `coefficientVariation` | `écartType(delais) / delaiMoyen`, seulement si **≥ 3 délais** et moyenne > 0 ; sinon `null`. Écart-type **de population** (÷ n) |
| `regularite` | `cv < 0.35` → `Régulier` ; `cv < 0.7` → `Variable` ; sinon `Irrégulier` ; `null` si `cv === null` |
| `seuilAnalyse` | constante `SEUIL_ANALYSE = 10` |

**Seuil de rentabilité** — `computeSeuil` (`lib/compute.ts:307`) :

On cherche le taux `t` tel que `t·G + (1−t)·P = 0`, d'où :

```
seuilRentabilite = ( −P / (G − P) ) × 100
```

avec, **mesurés sur les seuls tokens PRIS** :

```ts
G = gainsSol.length > 0 ? moyenne(gainsSol) : (mise * objectif) / 100 - frais
P = pertesSol.length > 0 ? moyenne(pertesSol) : -((mise * perteRug) / 100 + frais)
```

- `G` = gain moyen **en SOL** d'un trade réussi ; `P` = résultat moyen (négatif)
  d'un trade raté.
- À défaut d'observation, repli sur un trade pile à l'objectif et sur la perte
  par défaut.
- **`null` si `G <= 0`** : un trade réussi ne rapporte rien, aucun taux de
  réussite ne rattrape les pertes. L'UI affiche alors « Les frais annulent le
  gain ».
- Le seuil porte sur les tokens **pris** alors que `taux` porte sur **tous** les
  tokens notés. Les comparer (ce que fait l'UI : `taux >= seuilRentabilite`
  → vert) n'a un sens strict que si on prend tout.

### 4.4 Tag / statut du wallet et ses seuils

**Tag automatique** — `computeAutoTag` (`lib/compute.ts:328`) :

```ts
if (n < SEUIL_ANALYSE)              return 'À compléter'   // SEUIL_ANALYSE = 10
if (taux >= tauxVise && netSol > 0) return 'Rentable'
if (netSol > 0)                     return 'Limite'
return 'Pas rentable'
```

- `n` = tokens **notés** du lot regardé (pris ou non).
- `tauxVise` = réglage du wallet, **30 %** par défaut.
- `netSol > 0` est strict : un net exactement nul donne « Pas rentable ».

**Tag manuel** (`tagOverride`) — il **écrase** le tag automatique
(`effectiveTag`), sans rien changer aux chiffres :

| `tag_override` | Tag affiché |
|---|---|
| `'rentable'` | `Rentable` |
| `'surveiller'` | `À surveiller` |
| `'pas'` | `Pas rentable` |
| `null` | tag automatique |

⚠️ **`'À surveiller'` n'est jamais produit automatiquement** : il n'est
accessible que par tag manuel.

**Phrase d'explication** — `explainTag` (`lib/compute.ts:446`), affichée sous le
résultat net (`BilanCard`, `ResumeLot`) :

- `À compléter` → « Encore N token(s) à noter pour juger ce wallet. »
- `Rentable` → « X % des tokens atteignent l'objectif, au-dessus des Y % visés. »
- `Limite` → « Positif, mais X %…, sous les Y % visés. »
- `À surveiller` → « Wallet marqué à surveiller à la main. »
- `Pas rentable` → si `netSol <= 0` : « Sur la durée, cette stratégie perd de
  l'argent sur ce wallet. » sinon : « Wallet marqué comme pas rentable à la
  main. »

**À ne pas confondre avec `wallets.status`** (`screening` / `test` / `valide` /
`trade` / `rejete`), qui dit où en est le wallet dans l'entonnoir. `trade` est
stocké tel quel mais s'affiche **« Actif »**.

### 4.5 Bilan par journée — `computeDayReport` (`lib/day-report.ts:149`)

Les journées sont **triées par date** (`localeCompare`), pas par ordre
d'insertion. Tous les tokens de toutes les journées sont d'abord passés d'un
bloc à `computeWalletReport` ; les lignes sont ensuite redécoupées journée par
journée avec un curseur.

Par journée (`DayResult`) :

| Champ | Calcul |
|---|---|
| `total` | nombre de tokens relevés ce jour-là |
| `pris` | lignes avec `pris = true` |
| `n` | lignes notées (résultat non `null`) |
| `hits` | lignes notées avec `hit` |
| `pnlSol` | somme des `sol` des lignes **notées et prises** |
| `pnlSolTout` | somme des `sol` de **toutes** les lignes notées |
| `reels` | tokens pris dont le résultat est réel |
| `pnlReelSol` | somme des `sol` des tokens pris **réels** uniquement |
| `engageSol` | somme des `entree_sol` des tokens pris réels |
| `recupereSol` | somme des `sortie_sol` des tokens pris réels |
| `expositionSol` | `entree_sol` quand le résultat est réel, **sinon `strategy.mise`** pour chaque token pris |

Agrégats de phase (`DayReport`), **calculés sur les journées `state !== 'ouvert'`** :

```
joursObserves       = nombre de journées actif + inactif
joursActifs         = journées 'actif'
joursInactifs       = joursObserves − joursActifs
tauxInactivite      = joursObserves > 0 ? (joursInactifs / joursObserves) * 100 : 0
tokensTotal         = Σ total des journées observées
tokensPris          = Σ pris des journées observées
tokensParJourActif  = joursActifs > 0 ? tokensTotal / joursActifs : 0
expositionMaxSol    = max(expositionSol) sur les journées observées
pnlSol              = report.netSol           ← voir l'avertissement ci-dessous
pnlMoyenParJour     = joursObserves > 0 ? pnlSol / joursObserves : 0
pnlMoyenParJourActif= joursActifs   > 0 ? pnlSol / joursActifs   : 0
joursPositifs       = journées observées avec pnlSol > 0
meilleurJour/pireJour = tri sur pnlSol
partMeilleurJour    = totalGagnant > 0 ? (meilleurJour.pnlSol / totalGagnant) * 100 : null
```

⚠️ `pnlSol` (et `report.n`, `report.taux`, `report.seuilRentabilite`…) sont
calculés sur **toutes** les journées, y compris `ouvert`, alors que
`tokensTotal`, `joursObserves`, etc. excluent les journées `ouvert`. En pratique
une journée `ouvert` n'a aucun token (elle passe `actif` dès le premier token
ajouté), donc l'écart ne se manifeste pas — mais le code ne l'interdit pas.

### 4.6 Phase de test — `computeTestReport` (`lib/test-report.ts:67`)

C'est `computeDayReport` + trois ajouts :

```ts
JOURS_MINIMUM_TEST = 4
joursRestants      = Math.max(0, 4 - joursObserves)
verdictDisponible  = joursRestants === 0 && report.n > 0
```

**Conseil** (un seul à la fois, du plus bloquant au plus discutable,
`conseiller`, `lib/test-report.ts:97`) :

1. `joursObserves === 0` → « Aucune journée saisie. Il en faut 4 pour conclure. »
2. `joursRestants > 0` → « Encore N journée(s) à observer… »
3. `report.n === 0` → « Aucun token noté : rien à juger pour l'instant. »
4. `report.n < SEUIL_CONSEIL_TOKENS` (**20**) → « … seulement N tokens notés :
   prolongez plutôt que de conclure. » *(conseil, pas verrou)*
5. `tauxInactivite >= SEUIL_CONSEIL_INACTIVITE` (**50 %**) → « débit faible,
   même s'il est rentable. »

### 4.7 Phase active (trade) — `computeTradeReport` (`lib/trade-report.ts:110`)

Base : `computeDayReport` sur les journées de phase `trade`. Puis :

```ts
observes      = days.filter(j => j.state !== 'ouvert')
engageSol     = Σ j.engageSol
recupereSol   = Σ j.recupereSol
pnlReelSol    = recupereSol - engageSol          // ← LE résultat réel, rien d'autre
pnlReelEur    = solPriceEur !== null ? pnlReelSol * solPriceEur : null
rendement     = engageSol > 0 ? (pnlReelSol / engageSol) * 100 : null
```

Comptage des trades (sur les tokens `pris` des journées non-`ouvert`) :

```ts
chiffre(token) = entree finie > 0 ET sortie finie >= 0
tradesChiffres   = pris.filter(chiffre).length
tradesIncomplets = pris.length - tradesChiffres    // le résultat réel ne les compte pas
```

**Le contrefactuel** — la mesure qui justifie la phase :

```ts
pnlSimuleSol = computeWalletReport(
  pris.filter(chiffre).map(t => ({ gain, perteRug, delay, pris: true })),  // montants RETIRÉS
  strategy
).netSol

ecartSol = pnlReelSol - pnlSimuleSol
ecartPct = pnlSimuleSol !== 0 ? (ecartSol / Math.abs(pnlSimuleSol)) * 100 : null
```

On reprend **exactement les mêmes trades** (ceux qui sont chiffrés), on leur
retire leurs montants et on laisse la stratégie les rejouer comme en test.
`ecartSol` négatif = le test était optimiste.

⚠️ `pnlSimuleSol` vaut 0 pour tout trade chiffré dont le `gain` n'a pas été
saisi (`computeTokenResult` renvoie alors `null`). L'écart est donc faussé si on
ne note pas aussi la montée du token.

**Creux maximal** (`drawdown`, `lib/trade-report.ts:175`) : plus forte baisse
depuis un sommet du cumul **journalier réel**, renvoyée en valeur positive, 0 si
la courbe n'est jamais redescendue.

**Conseil trade** (`lib/trade-report.ts:194`) :

1. `tradesChiffres === 0` → « Aucune journée de trade relevée. » ou « Aucun
   trade chiffré : saisissez l'entrée et la sortie en SOL… »
2. `tradesIncomplets > 0` → « N trade(s) pris n'ont pas de montants… »
3. `|ecartPct| >= SEUIL_ALERTE_ECART` (**25 %**) → « Le réel rend X % de
   moins/plus que ce que le test annonçait… »

### 4.8 Agrégat portefeuille — `computePortefeuille` (`lib/portefeuille.ts:150`)

Pour chaque wallet, les **trois** rapports sont calculés, puis cumulés
**séparément** :

```ts
netScreeningSol += screening.netSol
netTestSol      += test.pnlSol
netReelSol      += trade.pnlReelSol          // jamais additionné aux deux autres
tokensTest      += test.tokensTotal
tokensPris      += test.tokensPris
tokensNotes     += test.report.n
hits            += test.report.hits
taux             = tokensNotes > 0 ? (hits / tokensNotes) * 100 : 0
```

Deux courbes distinctes, agrégées **par date** tous wallets confondus
(`cumulerJours` + `tracer`) : `courbe` (test, `pnlSol`) et `courbeReelle`
(trade, `pnlReelSol`). `joursObserves` du portefeuille = nombre de **dates
distinctes** de la courbe de test.

Par wallet (`LigneWallet`), le lot mis en avant est :

```ts
enAvant = wallet.status === 'screening' ? screening : test.report
```

→ **y compris pour un wallet en phase active** : `ligne.netSol` est alors le net
**simulé du test**, pas le réel. Le réel est à part dans `ligne.netReelSol`.
Voir § 7.

`meilleur` / `pire` : tri décroissant sur `netSol`, en ne gardant que les lignes
avec `n > 0` ; `pire` est `null` s'il n'y a qu'une seule ligne.

**Entonnoir** (`parEtat`) : les cartes d'une colonne sont triées par
`verdictDisponible` d'abord, puis par `avancement` décroissant, puis par label
(`localeCompare('fr')`).

```ts
avancement(ligne) =
  status 'screening' ? min(1, n / seuilAnalyse)                 // /10
  status 'test'      ? min(1, joursObserves / joursMinimum)     // /4
  : 1
```

`verdictDisponible` au niveau portefeuille ajoute une condition :
`wallet.status === 'test' && test.verdictDisponible`.

### 4.9 Saisie et normalisation

- `parseNumberFr` (`lib/validation.ts:36`) : virgule décimale, espaces (y
  compris insécables) ignorés, `−` / `–` / `—` ramenés à `-`. Vide/illisible →
  `null`.
- `STRATEGY_BOUNDS` (`lib/validation.ts:65`) — bornes **appliquées côté serveur**
  par `updateStrategyAction` :

| Champ | min | max | pas | unité |
|---|---|---|---|---|
| `mise` | 0 | 1000 | 0,01 | SOL |
| `objectif` | 1 | 10000 | 1 | % |
| `perteRug` | 0 | 100 | 1 | % |
| `frais` | 0 | 10 | 0,001 | SOL |
| `tauxVise` | 0 | 100 | 1 | % |

- `montantSol` (`app/actions.ts:427`) : un montant **négatif est refusé**
  (→ `null`). Le signe du résultat vient de la différence, pas des montants.
- `isLikelySolanaAddress` : base58, 32 à 44 caractères. Sert de garde-fou de
  saisie **et** de filtre avant tout appel à Helius.
- `validateNewWallet` : label obligatoire, adresse obligatoire et non déjà
  suivie (erreurs bloquantes) ; adresse non conforme → simple **avertissement**
  (on laisse passer) ; date non `AAAA-MM-JJ` → erreur.
- `saveDayAction` : la journée est **réécrite en entier** (`saveDay` supprime
  tous les tokens de la journée avant de réinsérer). Bornes : pas avant le début
  de la phase, pas dans le futur. Plafond `MAX_TOKENS_PAR_JOUR = 200`. L'état
  est forcé : `state = (input.state === 'inactif' || lignes.length === 0) ? 'inactif' : 'actif'`.
- `openDayAction` : crée la journée du jour à l'état **`ouvert`** (et jamais
  `inactif`), uniquement si elle n'existe pas déjà.

### 4.10 Arithmétique des jours (`lib/jours.ts`)

Tout passe par **UTC** pour qu'un changement d'heure ne fasse pas apparaître ou
disparaître une journée. `listerJours(debut, fin)` renvoie les dates bornes
comprises, plafonnées à `MAX_JOURS_FILE = 366` jours.
`joursManquants({debut, jusqua, saisis})` filtre sur ce qui n'est pas déjà saisi.

⚠️ `todayIso()` (`lib/format.ts:94`) lit la date **locale** du serveur, alors
que le reste de l'arithmétique est en UTC. Décalage possible en fin de journée
selon le fuseau de l'hébergeur (Vercel `fra1`).

---

## 5. Les écrans

Toutes les pages sont `dynamic = 'force-dynamic'` (lecture base à chaque
requête). Le layout racine (`app/layout.tsx`) vérifie la session, charge les
réglages et le décompte de journées en attente, puis rend l'`AppShell`
(rail de navigation à gauche en desktop, barre d'onglets en bas en mobile).

| Route | Fichier | Contenu |
|---|---|---|
| `/` | `app/page.tsx` | **Ce matin** — relevé du matin |
| `/dashboard` | `app/dashboard/page.tsx` | **Dashboard** — chiffres + entonnoir |
| `/wallets` | `app/wallets/page.tsx` | **Wallets** — tableau comparatif |
| `/wallets/[id]` | `app/wallets/[id]/page.tsx` | **Détail d'un wallet** (5 onglets) |
| `/wallets/[id]/export` | route handler | téléchargement CSV |
| `/connexion` | `app/connexion/page.tsx` | bouton « Continuer avec Google » |
| `/auth/google`, `/auth/callback`, `/auth/deconnexion` | routes | OAuth |
| `/vue-ensemble`, `/entonnoir` | redirigent vers `/dashboard` | *(legacy)* |
| `/aujourdhui` | redirige vers `/` | *(legacy)* |

### 5.1 `/` — Ce matin (`components/matin/file-du-matin.tsx`)

Source : `listFileDuMatin(todayIso())` (`lib/repo/days.ts:191`), qui ne retient
que les wallets de **statut `test`** ayant au moins une journée à relever.

Affiche une **carte par wallet**, une seule dépliée à la fois :

- une **bande de journées** (une pastille par jour, du premier jour du test à
  aujourd'hui), quatre états visuels : relevée / sans trade / à relever
  (pointillés, cliquable) / jour sélectionné ;
- la journée choisie, avec un tableau de saisie (`LignesJour`) : Nom (accepte un
  CA collé), Gain %, Perte %, Délai, case **Pris**, Résultat calculé en direct ;
- un pied de journée (`TotalJour`) : tokens pris, net, et « en prenant tout » +
  apport du filtre s'il y a des écartés ;
- deux actions : **Valider la journée** (`⌘↵`) et **Journée sans trade**.

Particularités :

- le **jour en cours n'est jamais réclamé** (`aRelever` l'exclut) : une journée
  se juge une fois finie ;
- une journée `ouvert` est traitée comme « à relever », au même titre qu'une
  absente ;
- saisie optimiste : on enchaîne sur la journée suivante sans attendre le
  serveur ; en cas d'échec la carte se rouvre avec le message d'erreur et le
  brouillon intact ;
- brouillon `localStorage` écrit à chaque frappe, effacé **après** confirmation ;
- navigation clavier façon tableur : ↑/↓ changent de ligne sur le même champ,
  Entrée descend, `⌘↵` valide ;
- un badge « verdict en attente » apparaît si le plancher de 4 journées est
  atteint alors qu'il reste des trous — avec le message que « le verdict se
  prononcerait sur un décompte faux ».

⚠️ Cet écran ne propose **jamais** de journées de phase active : elles se
saisissent depuis la page du wallet, onglet Trades.

### 5.2 `/dashboard` (`components/dashboard/vue-dashboard.tsx`)

- **Net de la phase de test** (gros chiffre), + conversion € si le prix du SOL
  est renseigné, + rappel du net de screening « tenu à part » ;
- **courbe de résultat cumulé** (test uniquement) ;
- 4 tuiles : *Taux à l'objectif* (`hits / tokensNotes`), *Tokens pris* (avec le
  nombre d'écartés), *Journées* (dates distinctes relevées + nb de wallets en
  test), *Meilleur wallet* ;
- **Entonnoir** : 5 colonnes (Screening / En test / Validés / Actifs / Écartés),
  une carte par wallet avec tag, avancement, net, et boutons d'action en ligne
  (Lancer le test, Valider, Écarter, Annuler le test, Rouvrir).

⚠️ `courbeReelle` (courbe de la phase active) est calculée par
`computePortefeuille` mais **n'est affichée nulle part**.

### 5.3 `/wallets` (`components/wallets/tableur.tsx`)

Tableau triable : **Wallet** (nom + adresse raccourcie), **État** (badge de
statut + tag), **Tokens** (`n`, avec `(nPris)` s'il y a des écartés, + jauge
vers 10 en screening), **Objectif** (taux %), **Jours** (journées observées +
jauge vers 4 en test), **Net**. Point ocre si le test peut être conclu.

Recherche sur nom ou adresse (insensible casse/accents), filtres segmentés
(Tous / Screening / Test / Validés / Actifs / Écartés), bouton **Ajouter**
(`AddWalletSheet` : nom, adresse, date d'analyse).

Mention sous le tableau : « Le net affiché est celui du relevé de test dès qu'il
a commencé, sinon celui de l'échantillon de screening. »

### 5.4 `/wallets/[id]` (`components/wallet/wallet-detail.tsx`)

En-tête collant : nom éditable en place, badge de statut (détail `j2/4` en test,
net réel en phase active), indicateur de sauvegarde automatique. Puis un bandeau
d'identité : date d'analyse, adresse, boutons *Copier*, *Solscan*, *GMGN*, *CSV*.

Tout se sauvegarde automatiquement (`useAutoSave`, état local optimiste +
écriture différée).

**Onglet Bilan**
- `BilanCard` : Résultat net (gros, + tag + € + barre de progression vers 10
  tokens), Taux à l'objectif, Seuil de rentabilité (vert/rouge selon
  `taux >= seuil`), Sur 100 tokens, Délai avant dump (+ régularité). Phrase
  `explainTag` en dessous, + « N tokens écartés · en prenant tout : X SOL ».
- Courbe de résultat cumulé (réel si statut `trade`, sinon simulé du test).
- `PhaseSection` : badge de statut, phrase d'explication contextuelle, et les
  boutons de transition (§ 3.3). « Conclure le test » est **grisé** tant que
  `verdictDisponible` est faux. « Annuler le test » n'est jamais grisé.
  Feuille « Classer à la main » (toujours disponible, y compris en phase de
  test) : elle propose les quatre statuts autres que le statut courant et
  court-circuite le plancher. En phase de test, son texte rappelle combien de
  journées sont déjà relevées.

**Onglet Tokens** (lot screening) : `ResumeLot` (verdict du lot) + `TokenTable` :
# / Nom (accepte un CA) / Gain % / Perte % / Délai / Résultat / Cumul /
supprimer, et « Ajouter un token ». Pas de case « Pris » ici, pas de colonnes
entrée/sortie.

**Onglet Journées** (visible dès que `status !== 'screening'`) : graphe en
barres par journée, puis `TestSection` — gros net de test, 4 mesures (*Par
jour*, *Tokens / jour actif* + exposition max, *Journées gagnantes* + part du
meilleur jour, *Inactivité*), puis la liste des journées dépliables
(`LigneJournee`) pour corriger token par token. Bouton « Ouvrir la journée du
jour ».

**Onglet Trades** (visible si `status === 'trade'` **ou** s'il existe au moins
une journée de trade) : graphe en barres du réel, puis `TradeSection` — gros
`pnlReelSol`, « X engagés → Y récupérés », alerte sur les trades sans montants,
4 mesures (*Rendement*, *Par jour*, *Écart au test*, *Creux max*), puis les
journées dépliables **avec les colonnes Entrée et Sortie en SOL**.

**Onglet Réglages** :
- `StrategySection` : Mise (SOL), Objectif (%), Perte par défaut (%), Frais par
  trade (SOL), Taux visé (%) + « Utiliser ces réglages pour les nouveaux
  wallets » (écrit dans `settings`).
- `InfosSection` : adresse (copiable), date d'analyse, **tag manuel**
  (Auto / Rentable / À surveiller / Pas rentable), **prix du SOL en €**
  (réglage global, visible depuis n'importe quel wallet).
- `NotesSection` : notes libres du wallet.
- `DangerZone` : suppression du wallet (cascade sur journées et tokens).

### 5.5 Champ « Nom » intelligent (`components/token/champ-nom-token.tsx`)

Coller un CA dans le champ Nom : l'adresse est reconnue à sa forme, rangée dans
`mint`, le champ affiche aussitôt le CA raccourci, un lien **Padre**
(`https://trade.padre.gg/trade/solana/<mint>`) apparaît, et le vrai nom est
cherché en arrière-plan via `resolveTokenMetaAction` →
**Helius DAS `getAsset`** (métadonnée Metaplex on-chain, répond même sur un
token mort), avec repli **DexScreener** (gratuit, mais ne connaît que ce qui a
une pool active). Timeout 6 s, aucune exception propagée. Un nom tapé à la main
n'est jamais réécrit.

---

## 6. Exports

Un seul export : **CSV par wallet**, `GET /wallets/[id]/export`
(`app/wallets/[id]/export/route.ts`), produit par `walletToCsv`
(`lib/export-csv.ts`).

- `content-type: text/csv; charset=utf-8`
- `content-disposition: attachment; filename="ruggers-<label-normalisé>-<AAAA-MM-JJ>.csv"`
  — le label est désaccentué, tout caractère non alphanumérique devient `-`,
  minuscules, repli `wallet` si vide (`nomFichierCsv`).
- `cache-control: no-store`
- séparateur **virgule**, décimales au **point** (notation anglaise, volontaire :
  le fichier part vers un lecteur automatique), échappement RFC 4180.
- `null` → **case vide** (jamais `"null"`), booléen → **`oui` / `non`**.

### 6.1 Préambule (lignes commençant par `#`)

```
# wallet: <label>
# adresse: <address>
# statut: <status>
# analyse_le: <analyzed_at>
# test_ouvert_le: <test_started_at ou vide>
# trade_ouvert_le: <trade_started_at ou vide>
# mise_sol: <strategy.mise>
# objectif_pct: <strategy.objectif>
# perte_defaut_pct: <strategy.perteRug>
# frais_sol: <strategy.frais>
# taux_vise_pct: <strategy.tauxVise>
# sol_eur: <settings.solPriceEur ou vide>
# tokens: screening=<n> test=<n> trade=<n>
# genere_le: <ISO-8601>            ← présent uniquement si l'appelant le fournit (la route le fournit)
#
# Les trois phases ne s’additionnent jamais.
# screening : échantillon choisi à la main dans le passé, flatteur par construction.
# test      : relevé exhaustif jour par jour, mais SIMULÉ — le résultat se
#             recalcule avec mise_sol, objectif_pct, perte_defaut_pct et frais_sol.
# trade     : trades réellement joués — le résultat est sortie_sol − entree_sol,
#             rien d’autre : frais de réseau et slippage y sont déjà.
#
# gain_pct vide = token relevé mais pas noté : il ne compte dans aucun résultat.
# perte_pct vide = on reprend perte_defaut_pct.
# pris = non : le wallet a bien lancé ce token, mais il n’a pas été joué.
```

### 6.2 Colonnes (une ligne par token, tous lots confondus, ordre `position`)

| # | Colonne | Source | Signification |
|---|---|---|---|
| 1 | `phase` | `tokens.phase` | `screening` \| `test` \| `trade` — **les trois ne s'additionnent pas** |
| 2 | `jour` | `wallet_days.day` via `day_id` | date de la journée, vide en screening |
| 3 | `etat_jour` | `wallet_days.state` | `actif` \| `inactif` \| `ouvert`, vide en screening |
| 4 | `position` | `tokens.position` | ordre d'affichage |
| 5 | `nom` | `tokens.name` | nom lisible, vide si absent |
| 6 | `mint` | `tokens.mint` | adresse du token, vide si absente |
| 7 | `gain_pct` | `tokens.gain` | % de montée depuis le buy. **Vide = non noté** |
| 8 | `perte_pct` | `tokens.perteRug` | % de perte propre au token. **Vide = `perte_defaut_pct`** |
| 9 | `delai_min` | `tokens.delay` | délai avant dump, en minutes |
| 10 | `pris` | `tokens.pris` | `oui` / `non` |
| 11 | `entree_sol` | `tokens.entreeSol` | SOL engagé (phase trade uniquement) |
| 12 | `sortie_sol` | `tokens.sortieSol` | SOL récupéré (phase trade uniquement) |

**Aucune colonne calculée** : ni résultat, ni cumul, ni « à l'objectif ». Choix
délibéré — un lecteur qui reçoit les réglages (préambule) et les saisies peut
tout recalculer et détecter une erreur au passage.

Pour recalculer depuis le CSV, appliquer § 4.1 :
- `phase = trade` et `entree_sol`/`sortie_sol` remplis → `sol = sortie_sol − entree_sol` ;
- sinon, `gain_pct` vide → ignorer la ligne ;
- sinon `hit = gain_pct >= objectif_pct` ;
  `sol = mise_sol × (hit ? gain_pct : −min(100, |perte_pct ?? perte_defaut_pct|)) / 100 − frais_sol` ;
- ne sommer que les lignes `pris = oui`.

### 6.3 Il n'y a pas d'autre export

Pas d'export JSON, pas d'export global du portefeuille, pas d'API publique.

---

## 7. Limites connues, incohérences, données manquantes

### 7.1 Incohérences repérées dans le code

1. **Le Bilan d'un wallet en phase active mélange réel et simulé.**
   `wallet-detail.tsx:446` passe `trade.report` à `BilanCard`. Or
   `trade.report.netSol` (via `computeWalletReport`) additionne les résultats
   **réels** des trades chiffrés **et** les résultats **simulés** des trades pris
   dont les montants manquent (mais dont le `gain` est noté). L'onglet Trades,
   lui, affiche `pnlReelSol` (réel uniquement). Les deux onglets peuvent donc
   afficher deux « résultats » différents pour le même wallet — ce qui contredit
   la règle « simulé et réel ne s'additionnent jamais » affirmée partout ailleurs.

2. **Le net affiché pour un wallet actif, dans la liste et l'entonnoir, est le
   net du *test*.** `lib/portefeuille.ts:203` : `enAvant = status === 'screening'
   ? screening : test.report`. Un wallet en `trade` voit donc son net **simulé**
   dans `/wallets` et sur sa carte d'entonnoir ; `netReelSol` existe sur la ligne
   mais n'est affiché nulle part.

3. **Deux implémentations divergentes du même résumé.** `lib/summary.ts`
   (`summarize`, `filterWallets`, `matchesSegment`, `matchesQuery`, `SEGMENTS`)
   met en avant `trade.pnlReelSol` pour un wallet actif — ce qui est le
   comportement attendu. Mais **`summarize` et `filterWallets` ne sont utilisés
   que par les tests** : l'UI passe par `computePortefeuille` / `trierLignes`, et
   `components/wallets/tableur.tsx` **réimplémente** le filtrage et la
   normalisation de recherche (`STATUT_DU_SEGMENT`, `normalise`) au lieu
   d'importer ceux de `lib/summary.ts`.

4. **`lib/saisie.ts` est du code mort côté UI.** `parseSaisie` / `saisieEstVide`
   (lecture d'une saisie libre du type `« 120 x3 -80 BONK 45 5m »`) ne sont
   appelés que par `test/saisie.test.ts`. Seule la constante
   `MAX_TOKENS_PAR_JOUR` est encore utilisée. Un commentaire de
   `components/matin/brouillons.ts` confirme : « les brouillons écrits avant la
   disparition du champ de saisie rapide ». **Conséquence pratique** : la
   convention « gain `0` = perte totale (100 %) » de `perteDepuisGain` ne
   s'applique plus ; un `0` saisi dans le tableau donne `hit = false` et la perte
   **par défaut du wallet**, pas 100 %.

5. **`pnlSol` d'un `DayReport` inclut les tokens des journées `ouvert`**, alors
   que `joursObserves` / `tokensTotal` / `tokensPris` les excluent (§ 4.5).
   Inoffensif aujourd'hui (une journée `ouvert` n'a pas de token) mais rien ne
   l'empêche structurellement.

6. **`taux` et `netSol` peuvent se contredire en phase active.** Pour un trade
   réel sans `gain` noté, `hit = percent >= objectif` : un trade à **+50 %** avec
   un objectif à 100 % est compté **raté** dans `taux` alors que son `sol` est
   positif et compte dans le net.

7. **`pnlSimuleSol` (donc `ecartSol` et le conseil « écart ») vaut 0 pour tout
   trade chiffré sans `gain` saisi** : l'écart au test paraît alors
   artificiellement bon.

8. **`À surveiller` est inatteignable automatiquement** — uniquement par tag
   manuel.

9. **Code exporté mais jamais branché** : `setDayNote` + colonne
   `wallet_days.note`, `deleteDayAction`, `listWalletsEnTest`, `findByAddress`,
   `listTokens`, `courbeReelle` du portefeuille, `apportFiltre` / `nReels` /
   `netEur` du rapport (partiellement), source `'helius'` sur les wallets et
   tokens (import automatique annoncé, non implémenté).

10. **Documentation désynchronisée** : `npm run db:migrate` / `db:push` cités
    dans les commentaires n'existent pas (§ 1). `app/wallets/page.tsx` affiche
    `vue.parStatut.test` / `screening` en sous-titre mais ignore `valide`,
    `trade` et `rejete`.

11. **`todayIso()` est en heure locale serveur**, le reste de l'arithmétique des
    jours est en UTC (§ 4.10).

12. **`cancelTestAction` regarde `wallet.days.length`, toutes phases confondues** :
    un wallet qui a des journées de *trade* mais aucune journée de test
    conservera son `test_started_at` à l'annulation.

### 7.2 Limites du modèle de calcul

- **Pas de take-profit.** `objectif_pct` est un seuil binaire : au-dessus, on
  encaisse la montée **maximale saisie** ; en dessous, on encaisse la perte
  **entière**. Il n'y a aucun régime intermédiaire, aucune sortie partielle,
  aucun trailing stop. Un token monté à +80 % avec objectif 100 compte −90 %.
  → Le net simulé est donc très sensible à la valeur de `objectif` et à la
  définition exacte de ce qu'on met dans `gain`.
- **Ambiguïté sur `gain`.** Le schéma dit « % de montée depuis le buy ». Rien ne
  précise s'il s'agit du **maximum atteint (ATH)** ou d'un prix de sortie
  réaliste. Si c'est l'ATH, le net simulé est un plafond théorique jamais
  atteignable (il suppose une sortie au plus haut).
- **Pas de modélisation du slippage ni de l'impact de marché** en simulation :
  seuls des `frais` fixes en SOL sont retranchés.
- **`frais` est un montant fixe, pas un pourcentage** : il ne suit pas la mise.
- **Pas d'horodatage intra-journée.** La granularité est la journée ; `delay`
  (minutes avant dump) est la seule donnée temporelle fine, et elle décrit le
  comportement du *token*, pas la durée de détention.
- **Pas de gestion de capital.** Mise fixe par trade, pas de dimensionnement, pas
  de suivi d'un solde de portefeuille réel. `expositionMaxSol` est la seule
  mesure d'exposition et mélange montants réels et mise théorique.
- **Un seul wallet par adresse** (index unique) : impossible de suivre deux
  stratégies différentes sur la même adresse.
- **Le screening est biaisé par construction** — l'app le dit elle-même —, donc
  tout tag calculé en phase screening est à lire comme un indicateur, pas un
  verdict.
- **Statistiques fragiles aux petits nombres** : `SEUIL_ANALYSE = 10` tokens et
  `JOURS_MINIMUM_TEST = 4` journées sont très bas pour une distribution à queue
  épaisse comme celle des memecoins. `partMeilleurJour` est d'ailleurs là pour
  le signaler (« à 70 %, le résultat tient à une seule séance »).
- **Pas d'historique des modifications** : changer `objectif` ou `perteRug`
  recalcule rétroactivement **tout** l'historique simulé du wallet. Aucun
  versionnage des réglages.

### 7.3 Données qu'il serait utile d'ajouter

Pour mieux analyser les résultats, par ordre de valeur décroissante :

1. **Multiple maximal atteint (ATH) séparé du gain retenu.** Aujourd'hui une
   seule colonne `gain` porte les deux sens. Deux champs — `multiple_max` (ou
   `ath_pct`) et `gain_retenu_pct` — permettraient de mesurer l'écart entre
   « ce qui était atteignable » et « ce qu'une règle de sortie donne », et de
   tester plusieurs take-profits sur les mêmes données.
2. **MC (market cap) d'entrée**, et idéalement MC au pic et MC de sortie. C'est
   le seul moyen de savoir si l'avantage vient du *timing* ou de la *taille* du
   lancement, et de filtrer par tranche de MC.
3. **Montant d'achat du wallet copié** (taille de position du rugger). Un gros
   achat du dev n'a pas la même valeur de signal qu'un achat symbolique ; sans
   cette donnée, impossible de pondérer le signal.
4. **Horodatage du trade** (heure du buy du wallet suivi, heure de notre entrée)
   plutôt que la seule date : permettrait de mesurer la **latence de copie**, qui
   est sans doute la variable la plus déterminante.
5. **Durée de détention réelle** de notre position (distincte de `delay`, qui
   décrit le token).
6. **Prix / MC de sortie et règle de sortie appliquée** (take-profit, stop,
   manuel) — pour expliquer un écart `pnlReelSol` vs `pnlSimuleSol`.
7. **Raison du non-pris** sur un token écarté (texte court ou énumération) :
   c'est ce qui rendrait `apportFiltre` interprétable — aujourd'hui on sait que
   le filtre rapporte ou coûte, pas *pourquoi*.
8. **Nombre de holders / liquidité initiale / présence d'un bundle** au moment
   de l'entrée : critères de filtre objectivables.
9. **Slippage et frais réseau constatés**, séparés du résultat net, pour pouvoir
   calibrer `frais_sol` en simulation.
10. **Exposer la note de journée** (`wallet_days.note`, déjà en base) dans l'UI :
    le contexte d'une journée atypique est aujourd'hui perdu.
11. **Un export JSON du portefeuille complet** (wallets + journées + tokens +
    réglages) : le CSV est par wallet et par token, il ne permet pas de rejouer
    une analyse multi-wallets sans recoller N fichiers à la main.

---

## 8. Carte des fichiers (repères rapides)

| Fichier | Rôle |
|---|---|
| `lib/compute.ts` | cœur de calcul : `computeTokenResult`, `computeWalletReport`, `computeSeuil`, `computeAutoTag`, `explainTag` |
| `lib/day-report.ts` | découpage par journée, commun test/trade |
| `lib/test-report.ts` | plancher de 4 journées + conseils |
| `lib/trade-report.ts` | PNL réel, contrefactuel, écart, drawdown |
| `lib/portefeuille.ts` | agrégat tous wallets, courbes, entonnoir, tris |
| `lib/summary.ts` | résumé par wallet + filtres — **utilisé uniquement par les tests** |
| `lib/export-csv.ts` | génération du CSV |
| `lib/saisie.ts` | lecture de saisie libre — **non branché à l'UI** |
| `lib/validation.ts` | parsing FR, bornes, validation de formulaire |
| `lib/jours.ts` | arithmétique des dates (UTC) |
| `lib/format.ts` | affichage FR + `todayIso` + URLs externes |
| `lib/token-meta.ts` | résolution du nom d'un token (Helius → DexScreener) |
| `lib/db/schema.ts` | schéma Drizzle |
| `lib/db/index.ts` | choix du pilote, pool unique |
| `lib/repo/*` | accès base, mappers, objets métier |
| `app/actions.ts` | toutes les Server Actions (transitions, saisies, réglages) |
| `middleware.ts` | portier d'authentification |

Les tests (`test/*.test.ts`) sont la meilleure documentation exécutable des
formules : `compute.test.ts`, `test-report.test.ts`, `trade-report.test.ts`,
`export-csv.test.ts` en particulier.
