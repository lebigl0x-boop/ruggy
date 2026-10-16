# Analyse automatique d'une journée

Document de référence pour qui reprend cette fonctionnalité — humain ou
assistant. Il décrit **ce que le code fait**, et pourquoi il le fait ainsi.
Les choix contre-intuitifs sont justifiés par des mesures, pas par des
préférences.

> `RECAP.md`, à la racine, décrit la **v1** de l'application et est entièrement
> périmé. Ne pas s'en servir.

---

## 1. À quoi ça sert

Un wallet de « rugger » est suivi à la main : on regarde ce qu'il a lancé dans
la journée, on note pour chaque token si le take-profit visé aurait été atteint,
et on en déduit si la stratégie serait rentable. Cette fonctionnalité fait ce
relevé automatiquement.

Bouton **« Analyser »** dans la barre d'un wallet → feuille modale → choix d'une
date → tableau, une ligne par token acheté ce jour-là :

| Colonne | Contenu |
|---|---|
| Token | nom, mint abrégé, lien Padre, pastille « relance n » si le nom se répète |
| Heure | premier achat du wallet sur ce token, heure de Paris |
| Achat | SOL réellement versé à la pool |
| MC entrée | capitalisation à cet achat, **en dollars** au taux de cet instant (SOL en second) |
| MC à l'ATH | capitalisation au sommet, **en dollars** au taux de cet instant (SOL en second) |
| ATH brut | le même sommet lu sur le plus haut **« high »**, pour mesurer la part de mèche |
| ×max | sommet retenu ÷ prix d'entrée, **sur des prix en SOL** |
| Délai | temps écoulé entre l'achat et le sommet |
| Issue | TP / Raté, **dérivée du multiple**, forçable à la main |

En tête : nombre de tokens, TP atteints, taux au TP, et résultat simulé calculé
par `bilanSimule` de `lib/calcul.ts`. En pied : import vers le lot de screening
ou vers le lot de test.

---

## 2. Le flux, étape par étape

### Étape 1 — les achats de la journée (`listerAchatsDuJourAction`)

1. Valide la date et l'adresse du wallet (`estAdresseSolana`) **avant** tout
   appel réseau.
2. Calcule les bornes de la journée en **heure de Paris** (`lib/journee.ts`).
   Une journée fait 23, 24 ou 25 heures selon la saison ; les deux nuits de
   changement d'heure sont couvertes par des tests.
3. Interroge l'historique du wallet sur Helius (Parsed Events), borné par ces
   deux horodatages, paginé jusqu'à `PAGES_MAX_JOURNEE`.
4. Garde les swaps où le wallet **donne du SOL et reçoit autre chose** : ce sont
   les achats.
5. Ne garde que le **premier achat de chaque mint** — c'est lui qui fixe le prix
   d'entrée auquel l'ATH sera comparé.
6. Écrit les lignes en base avec un ATH vide, puis les renvoie.

### Étape 2 — les ATH, par lots (`analyserLotAction`)

Le client rappelle cette action par paquets de `TOKENS_EN_PARALLELE` (3) et
affiche une barre de progression.

1. Un seul appel DAS `getAssetBatch` pour les métadonnées de tout le lot (nom,
   décimales, supply). Les tokens dont le nom **et** la supply sont déjà en
   cache sont exclus de la demande.
2. Un seul appel DexScreener pour résoudre `mint → pairAddress` de tout le lot.
3. Pour les mints que DexScreener ignore, un appel GeckoTerminal **par mint**
   sur son propre annuaire.
4. Puis, trois tokens de front : les bougies, ou le repli (§ 4).
5. Chaque ligne est écrite en base au fur et à mesure.

---

## 3. Pourquoi ce découpage

**Pourquoi deux actions et pas une.** Une journée demandait jusqu'à 90 appels
réseau. Les tenir dans une seule action dépasse tout délai d'exécution et ne
donne aucune nouvelle avant la fin.

**Pourquoi le parallélisme est dans l'action et pas chez le client.** La
documentation de Next 16 est explicite : *« Next.js dispatches Server Actions
one at a time per client »*. Trois appels lancés depuis le navigateur sont mis
à la queue. Les faire concourir côté serveur est la seule façon de les faire
concourir.

**Pourquoi une ligne par mint et jamais par nom.** Ces wallets achètent des
relances : le même dev republie le même nom encore et encore. Sept tokens
appelés pareil sont sept lancements distincts, avec chacun sa courbe, son prix
d'entrée et son ATH. Regrouper par nom fusionnerait sept trades indépendants.
D'où la pastille « relance n », purement visuelle, calculée à l'affichage.

**Pourquoi l'issue n'est pas stockée.** Elle se dérive du multiple et du TP du
wallet à chaque rendu. La figer en base la rendrait fausse dès le premier
changement de réglage. Changer le TP met le tableau à jour sans relancer un seul
appel.

---

## 4. D'où vient l'ATH : trois sources en cascade

Chacune ne sert que si la précédente s'est tue.

### 1. Solana Tracker — la source principale

`GET data.solanatracker.io/chart/{mint}` · en-tête `x-api-key` ·
`type=1m&currency=sol&removeOutliers=false`

**Interrogée par adresse de token**, donc aucun annuaire de pools à consulter :
**un appel par token**, et c'est tout. Réponse : `{ oclhv: [{ open, high, low,
close, volume, time }] }`, `time` en secondes.

Deux paramètres comptent autant que l'endpoint :

- **`currency=sol`** rend les prix dans l'unité du prix d'entrée. Aucune
  conversion, donc aucune occasion de se tromper d'unité.
- **`removeOutliers=false`** désactive un filtre **actif par défaut**. Sur ces
  tokens le sommet est souvent une pointe d'une minute, soit exactement ce qu'un
  filtre d'aberrations supprime. L'oublier coûterait des TP.

Mesuré sur une journée réelle de sept tokens : **7/7 en 7 appels et 5,8 s**,
contre 0,6 % de GeckoTerminal sur le token que les deux ont servi, et 2,6 % d'un
relevé manuel sur Padre. Offre gratuite : 2 500 requêtes par mois, 3 par
seconde — soit environ 250 journées analysables par mois.

Son absence n'est pas bloquante : sans `SOLANATRACKER_API_KEY`, la chaîne
descend d'un cran.

### 2. GeckoTerminal — le repli

`DexScreener (ou GeckoTerminal) → pairAddress → GeckoTerminal → bougies à la minute`

Plus cher et plus fragile, parce qu'il faut d'abord un annuaire. **La résolution
des pools est donc paresseuse** : elle n'est déclenchée que pour les tokens que
le tracker n'a pas su servir, et la requête groupée DexScreener n'est émise
qu'au premier besoin du lot.

**Toutes les pools du token sont interrogées**, dans la limite de
`POOLS_MAX_PAR_TOKEN` et par liquidité décroissante. Un lancement pump.fun en a
deux — sa courbe de bonding, quasiment pas indexée (1 bougie mesurée), et sa
pool PumpSwap après migration (33 bougies sur le même token) — et le sommet peut
tomber de part et d'autre de la migration.

L'appartenance de chaque pool au mint est contrôlée : `baseToken.address` côté
DexScreener, `relationships.base_token` côté GeckoTerminal quand la réponse le
porte.

**La bougie qui contient l'achat est gardée** (`minuteDeLAchat`). Son « high »
peut en théorie venir d'un pic antérieur à l'achat, mais sur les wallets suivis
le sommet tombe très souvent dans la première minute : l'écarter faisait perdre
plus d'ATH réels qu'elle n'en inventait.

**Deux sommets, pas un** (`sommetDesBougies`) :

- **brut** — le plus haut « high ». Ce que le marché a touché, mèche d'une
  seconde comprise.
- **exécutable** — le plus haut « close ». Un cours de clôture a tenu jusqu'au
  bout de sa minute, donc une sortie à ce prix était atteignable.

L'issue se décide sur le **brut** par défaut (`BASE_ISSUE`). Décider sur la
clôture s'était révélé trop sévère : le sommet est souvent une pointe d'une
minute, et la clôture de cette minute-là est déjà redescendue. Les deux sont
calculés, stockés et affichés dans tous les cas — basculer la constante ne
demande aucune réanalyse. Une ligne dont l'ATH brut dépasse de moitié
l'exécutable porte la mention « mèche ».

### Le repli — la relecture des swaps

Quand aucune pool n'existe, ou que l'appel de bougies échoue : on relit les
swaps du mint sur Helius, page par page, et on retient le prix le plus élevé.
Les swaps sous `SWAP_MINIMUM_SOL` sont ignorés (un prix calculé sur quelques
lamports est aberrant). Les **ventes comptent** : un prix atteint est un prix
atteint.

Deux optimisations y vivent :

- **arrêt anticipé au TP** : dès que le seuil est franchi, l'issue est acquise et
  les pages suivantes ne feraient qu'affiner un ATH dont on sait déjà qu'il
  suffit. Mesuré : un gagnant est passé de 40 à 20 pages ;
- les pages arrivent en ordre chronologique, donc une lecture tronquée couvre le
  **début** de la fenêtre.

### 3. La relecture des swaps Helius — le dernier recours

Quand aucune source de bougies ne répond. Elle tronque, donc ne rend qu'un
minorant, d'où l'état `inconnue` (§ 5).

### Le complément — combler l'avant-migration

Si la première bougie disponible est postérieure à la minute suivant l'achat —
parce que l'achat s'est fait sur la courbe et que la pool migrée n'existait pas
encore, ou parce que la bougie de l'achat a été écartée — la relecture des swaps
Helius est lancée **sur ce seul intervalle** et son maximum est fusionné. La
ligne est alors marquée `mixte`.

Un swap étant un échange conclu, son prix compte comme exécutable autant que
comme brut.

### Pourquoi les bougies ont remplacé la relecture

La relecture exhaustive lit 4 000 transactions pour couvrir 4 minutes. Mesures
sur de vrais tokens :

| | Relecture tronquée | Bougies |
|---|---|---|
| Token A | ×1,87, pic annoncé à +1 min | **×14,47 à +28 min** |
| Token B | ×3,22 | **×12,69 à +29 min** |
| Token C | ×3,50 | **×9,82 à +33 min** |

La troncature sous-estimait d'un facteur 4 à 8, et plaçait le pic à une minute
de l'achat alors qu'il tombait une demi-heure plus tard — le « délai » affiché
n'était que le maximum de la portion lue. Sur une journée de sept tokens,
**quatre issues sur sept étaient fausses, toutes dans le même sens.**

---

## 5. L'invariant central : un minorant ne ment que dans un sens

Un ATH tronqué est toujours **inférieur ou égal** au vrai sommet. Il ne peut donc
transformer qu'un TP en « Raté », jamais l'inverse. D'où trois états, et non
deux (`etatLigne` dans `lib/analyse.ts`) :

| Condition | État |
|---|---|
| forçage manuel | ce que dit le forçage |
| pas de multiple | `inconnue` |
| multiple ≥ seuil | `tp` — certain, même tronqué : le seuil est déjà franchi |
| multiple < seuil, ATH complet | `rate` — certain |
| multiple < seuil, **ATH tronqué** | `inconnue` — le vrai sommet a pu franchir le seuil |
| un contrôle de vraisemblance se déclenche | `verifier` — voir § 5 bis |

Conséquences à l'écran :

- une ligne `inconnue` s'affiche en rouge, ses boutons TP/Raté sont **vides** ;
- **les deux boutons d'import sont désactivés** tant qu'il en reste une ;
- `bilanSimule` ne reçoit que les issues établies (`issuesConnues`) : un
  résultat sur ce qu'on sait plutôt qu'un résultat complet et faux. Le bandeau
  affiche « 7 tokens · 5 chiffrés · 2 à trancher ».

Le seuil est `1 + tp/100` : un TP de 300 % vise ×4.

### 5 ter. Les dollars, et pourquoi deux taux sont stockés

Une capitalisation se lit en dollars — c'est l'unité de Padre, donc celle qui
permet de recouper. Mais le cours du SOL bouge entre l'achat et le sommet, et
surtout entre la journée analysée et le jour où on la relit.

Deux taux sont donc **stockés par ligne** : `solUsdAchat` et `solUsdSommet`,
chacun lu à son propre instant. Ils viennent d'une série SOL/USD à la minute,
récupérée **une fois par analyse** chez Solana Tracker (`chart/{WSOL}` avec
`currency=usd`), en tranches de huit heures — l'API rend les *dernières*
bougies de l'intervalle demandé, donc une requête trop large tronque le début.

Quand le taux manque à plus de `TOLERANCE_TAUX_MIN` minutes, la ligne
n'affiche **aucun dollar** et retombe sur les SOL. Un montant converti au
mauvais cours serait pire qu'une absence.

Le multiple, lui, ne dépend d'aucun change : c'est un rapport de deux prix en
SOL. L'issue reste donc juste même sans taux.

### 5 bis. Les contrôles de vraisemblance

`alertesDeLigne` ne dit jamais qu'un chiffre est faux — il dit qu'il mérite un
œil. Quatre motifs, et chacun suspend la décision :

| Code | Déclenchement | Ce que ça trahit |
|---|---|---|
| `sommet-sous-entree` | sommet < prix d'entrée | mauvaise pool, ou bougie antérieure à l'achat |
| `multiple-aberrant` | multiple > `MULTIPLE_ABERRANT` | unité incohérente, ou pool d'un autre token |
| `sommet-en-fin-de-fenetre` | sommet dans les `MARGE_FIN_FENETRE` dernières secondes | la montée continuait peut-être après |

Il n'y a **pas de contrôle sur les trous de couverture** : une minute sans
transaction est normale sur un memecoin. `trouMax` reste mesuré et stocké, mais
pour le diagnostic seulement.

---

## 6. Le cache, et quand il est périmé

Table `analyses`, unique sur `(wallet, jour, mint)`. Elle ne participe à aucun
bilan : seules les lignes recopiées dans `tokens` à l'import comptent. Elle
n'évite qu'une chose, mais elle est chère — recommencer les appels réseau.

Deux colonnes gouvernent la fraîcheur : `source` (`bougies` | `swaps`) et
`pool`. `doitEtreRefaite` (pur, testé) reprend automatiquement :

- **une ligne sans `source`** : écrite par une version antérieure aux bougies,
  donc porteuse d'un ATH tronqué qu'on sait faux ;
- **un repli tronqué alors qu'une pool existait** : les bougies étaient
  possibles, l'appel a juste échoué. Sans cette relance, un seul refus 429
  figerait un minorant pour toujours ;
- **une ligne dont le sommet n'existe qu'en capitalisation** : écrite avant que
  les multiples se calculent sur des prix. Sans reprise, elle basculerait en
  « inconnue » alors qu'elle était juste.

Et laisse tranquille : un repli sans pool (rien de mieux à en tirer), un repli
qui a couvert toute la fenêtre, une ligne venue des bougies, et une ligne en
erreur — celle-là attend un « Réanalyser » explicite, sinon une panne durable
relancerait tout à chaque ouverture.

⚠️ C'est le piège qui a coûté le plus de temps : les libellés se calculent à
l'affichage, donc du **code neuf sur un cache ancien** montre les nouveaux
libellés avec les anciens chiffres. Si un chiffre semble ne pas bouger,
vérifier `source` en base avant de soupçonner le calcul.

---

## 7. Le limiteur de débit

`lib/helius/limiteur.ts` — un seau à jetons **partagé**, quatre familles, parce
que des pauses fixes ne marchent pas ici.

Mesuré : à 550 ms d'intervalle (1,8 req/s), une analyse prenait 25 refus 429,
alors qu'une sonde isolée tenait 250 ms sans broncher. Explication : Helius
limite lui aussi par seau — **sept requêtes partent d'affilée sans aucune pause,
la huitième est refusée avec `retry-after: 1`**. Une sonde courte vide un seau
plein ; une analyse longue vit sur le débit de reconstitution.

| Famille | Débit | Rafale | Pourquoi |
|---|---|---|---|
| `tracker` | 3/s | 3 | Solana Tracker, offre gratuite. Mesuré sans un refus |
| `rest` | 2/s | 5 | Helius Parsed Events, plan gratuit |
| `das` | 2/s | 2 | Helius DAS ; le lot rend la limite non bloquante |
| `dexscreener` | 4/s | 4 | large, un appel suffit par journée |
| `gecko` | 0,45/s | 2 | 30/min comptés sur fenêtre glissante |

Un 429 appelle `penaliser(famille, retryAfter(headers))` : **tout le seau
ralentit**, pas seulement l'appel refusé. L'attente par défaut varie par
famille — Helius se reconstitue en une seconde, GeckoTerminal compte à la
minute, d'où 4 s.

---

## 8. Carte des fichiers

| Fichier | Rôle | Pur ? |
|---|---|---|
| `lib/journee.ts` | bornes minuit→minuit Europe/Paris, formats d'heure et de délai | ✅ |
| `lib/analyse.ts` | achats, premier par mint, prix, MC, multiple, états, `doitEtreRefaite`, **toutes les constantes** | ✅ |
| `lib/helius/swaps.ts` | lecture des réponses Parsed Events et DAS | ✅ |
| `lib/helius/appels.ts` | réseau Helius | ❌ |
| `lib/helius/limiteur.ts` | seau à jetons partagé | ❌ |
| `lib/marche/bougies.ts` | lecture Solana Tracker, DexScreener et GeckoTerminal, sommets | ✅ |
| `lib/marche/appels.ts` | réseau marché | ❌ |
| `lib/repo/analyses.ts` | cache | ❌ |
| `app/actions.ts` | les 4 Server Actions | ❌ |
| `components/wallet/analyse-journee.tsx` | la feuille et son tableau | ❌ |

Tests : `test/journee.test.ts`, `test/analyse.test.ts`, `test/swaps.test.ts`,
`test/bougies.test.ts`. Toutes les réponses d'API y sont fabriquées sur la forme
**réelle**, relevée par sonde — pas sur la documentation, qui s'est révélée
fausse sur plusieurs points (voir § 10).

`lib/calcul.ts` n'est pas touché : le résultat simulé passe par `bilanSimule`
tel quel.

---

## 9. Les constantes à régler

`lib/analyse.ts` :

```
FENETRE_ATH_HEURES    = 6      fenêtre de recherche du sommet
PAGES_MAX_PAR_TOKEN   = 40     plafond du repli par swaps
PAGES_MAX_JOURNEE     = 20     plafond de l'historique du wallet
SWAP_MINIMUM_SOL      = 0.001  swaps de poussière ignorés
SUPPLY_LANCEMENT      = 1e9    supply d'un lancement pump.fun
TOKENS_EN_PARALLELE   = 3      tokens analysés de front
BASE_ISSUE            = 'executable'   'brut' pour décider sur les mèches
POOLS_MAX_PAR_TOKEN   = 3      pools interrogées par token
MULTIPLE_ABERRANT     = 1000   au-delà, « à vérifier »
MARGE_FIN_FENETRE     = 900    sommet trop proche de la fin
```

**L'unité des comparaisons.** Le multiple se calcule entre deux **prix en SOL par
token** — `multipleDepuisPrix`. La supply n'y entre pas : elle se simplifierait
de toute façon, et la faire entrer ouvrirait la porte à comparer une
capitalisation calculée ici avec une capitalisation ou une FDV fournie par une
source tierce, qui ne reposerait ni sur la même supply ni sur la même
convention. Les capitalisations affichées sont **dérivées**, pour la lecture
seulement.

`lib/helius/limiteur.ts` : `DEBIT_PAR_SECONDE`, `RAFALE`, `PENALITE_PAR_FAMILLE`.

**La supply : 1 milliard pour tout mint pump.fun, DAS sinon.** Contre-intuitif,
mais mesuré : DAS renvoie la supply **actuelle**, burns compris, donc
postérieure à l'achat. S'en servir sous-estimait la MC d'entrée jusqu'à 4 % et
faisait diverger les comparaisons avec les outils de trading, qui capitalisent
sur un milliard.

---

## 10. Pièges vérifiés, à ne pas redécouvrir

**La documentation Helius se contredit.** Trois pages donnent trois orthographes
des paramètres de pagination et de filtre temporel. La forme retenue vient d'une
sonde sur l'API réelle.

**`parsedData.kind` n'est pas fiable.** Au moins sept valeurs pour la même
intention (`buy`, `sell`, `buy_exact_sol_in`, `buy_exact_quote_in`, `swap`,
`swap_base_in`, absent). On classe sur `input_mint` / `output_mint`.

**`rawTokenAmount` est un nombre, `decimals` un champ frère.** Ce n'est pas
l'objet `{tokenAmount, decimals}` de l'ancienne API Enhanced. Les montants
`in_amount` / `actual_out_amount` sont des **chaînes**.

**Le SOL retenu est celui du swap, pas la variation du solde.** Vérifié sur une
transaction réelle : le wallet était débité d'environ 1,7 % de plus que
`in_amount` — tips, création de compte, priority fee. Rien de tout cela
n'appartient à un prix d'entrée.

**L'historique d'un mint renvoie des swaps qui ne le concernent pas.** Une
transaction qui touche le mint peut porter un swap sur un autre token. Sans
filtre `input_mint === mint || output_mint === mint`, un voisin fixe l'ATH.

**DexScreener élague les paires mortes.** Sur un token enterré il annonçait zéro
paire quand GeckoTerminal en connaissait deux, dont une portant le vrai sommet.
Comme on suit des ruggers, nos tokens sont précisément ceux qu'il élague : d'où
le second annuaire.

**DexScreener ne publie aucun ATH.** Seulement le prix courant, `marketCap`,
`fdv`, et des variations h1/h6/h24. Vérifié champ par champ. Il ne sert qu'à
traduire un mint en adresse de pool.

**Mobula et Bitquery sont inutilisables en gratuit.** Mobula répond
`403 "API access is unavailable on the Free plan"` sur tous ses endpoints —
vérifié en direct, requête groupée comme unitaire. Bitquery n'a pas de palier
gratuit, seulement un essai de sept jours.

**`removeOutliers` de Solana Tracker vaut `true` par défaut.** Un sommet d'une
minute est précisément ce qu'un filtre d'aberrations supprime.

**Des montants d'achat identiques au neuvième chiffre ne sont pas un bug.** La
courbe pump.fun est déterministe : un bot qui achète un montant fixe à une MC
cible obtient exactement le même nombre de tokens sur des lancements différents.

---

## 11. Limites connues

**Un token mort sur la courbe sans migrer** n'a qu'une bougie indexée. Seul le
repli par swaps peut en tirer quelque chose, et il tronque → ligne `inconnue`,
à trancher à la main.

**L'historique GeckoTerminal est glissant sur ~6 mois.** Au-delà, repli.

**Le `high` d'une bougie d'une minute capture la mèche.** Sur un multiple qui
frôle le seuil, le forçage manuel reste l'arbitre — c'est sa raison d'être.

**Les quotas gratuits ne tiennent pas plusieurs réanalyses successives.** Usage
normal — une journée, une fois — : environ 5 appels Helius, 1 DexScreener et un
par token chez GeckoTerminal. Enchaîner cinq analyses de la même journée épuise
la fenêtre glissante de GeckoTerminal, partagée par IP.

**Pas de test d'intégration.** Les fonctions pures sont couvertes ; les Server
Actions, le repo et les composants ne le sont pas. La voie réseau a été validée
par des sondes jetables, hors dépôt.

**La validation du token de base côté GeckoTerminal n'est pas confirmée en
direct.** Le contrôle est écrit défensivement — vérifier le champ s'il existe,
accepter sinon, puisque l'endpoint est déjà filtré par token — mais la forme
exacte de `relationships.base_token` n'a pas pu être relevée sur une réponse
réelle, le quota étant épuisé au moment de l'écriture.

---

## 12. La vérité terrain

`test/verite-terrain.json` attend des sommets relevés **à la main sur Padre** :
mint, heure d'achat, prix d'entrée et prix de sommet, tous en SOL par token.
`test/verite-terrain.test.ts` mesure l'écart entre ces relevés et ce que l'outil
calcule, et échoue au-delà de `toleranceMultiple`.

Le test reste vert tant que le fichier n'est pas rempli : son rôle est d'être
lancé **après**. Il ne fait aucun appel réseau — un test qui en dépend échoue
pour des raisons étrangères au code. Il compare donc des prix relevés à des prix
relevés, et c'est à l'analyse réelle de fournir les siens via
`prixSommetOutil`.
