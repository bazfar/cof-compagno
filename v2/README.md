# cof-compagno 2.0

Réécriture du compagnon de jeu en Svelte + TypeScript. La v1 (racine du
dépôt) reste en ligne jusqu'à la bascule ; la 2.0 vit dans ce dossier et
se déploie sur son propre site Firebase.

Cadrage complet : document « Cadrage cof-compagno 2.0 » du projet JDR.

## Prérequis

- Node.js 24.12 ou plus (exigé par le SDK Firebase 13 ; `npm install` refuse une version plus ancienne, voir `.npmrc`). Avec nvm : `nvm use` lit `.nvmrc`.
- Java 21 (pour l'émulateur Firestore utilisé par les tests de règles)

## Commandes (depuis `v2/`)

| Commande | Effet |
| --- | --- |
| `npm ci` | Installe les dépendances aux versions exactes du `package-lock.json` |
| `npm run dev` | App en local, branchée sur la vraie base |
| `npm run dev:emulateurs` | App en local sur des émulateurs : aucune donnée réelle touchée |
| `npm run importer-v1` | Réimporte les règles depuis la v1 vers `src/donnees/` (voir `src/donnees/LISEZMOI.md`) |
| `npm run preparer-scenes` | Extrait des scènes `.dd2vtt` du catalogue v1 la géométrie (`src/donnees/scenes/`) et l'image en WebP (`public/scenes/`) |
| `npm run verifier` | Typage, architecture, tests, build, règles Firestore — doit passer avant tout commit |
| `npm run deployer` | Vérifie, puis déploie le site v2 et les règles Firestore |

## Architecture

- `src/ecrans/`, `src/composants/` : interface. **Ne parlent jamais à Firebase.**
- `src/lib/magasins/` : lectures en temps réel (états Svelte réactifs).
- `src/lib/actions/` : seules fonctions qui écrivent dans Firestore.
- `src/lib/schemas/` : forme des documents (Zod), source unique.
- `src/lib/regles/` : règles du jeu. Accès typé aux données (`donnees.ts`, depuis `src/donnees/*.json` générés de la v1) et calculs d'un personnage (`calculs.ts`, port fidèle de `js/personnage.js`, vérifié contre la v1 par `tests/unitaires/equivalence-v1.test.ts`). `fiche-document.ts` passe d'une fiche v1 au document Firestore de la 2.0 (`schemas/fiche.ts`, schéma unique et strict) et du document aux calculs ; `tests/unitaires/fiche.test.ts` l'éprouve sur les 9 fiches réelles. `creation.ts` porte les règles de l'assistant de création (lot L2.2a) en fonctions pures, sur les calculs de `calculs.ts` : un brouillon immuable, des gestes qui le modifient ou se refusent avec une phrase pour le joueur, et `ficheDepuisBrouillon` qui rend la fiche validée. L'écran de l'assistant (`composants/AssistantCreation.svelte`, L2.2b) ne fait qu'appeler ces fonctions ; son brouillon est gardé dans le navigateur (`lib/creation/brouillon-local.ts`) et effacé à la création.
- `src/lib/battlemap/` : calculs de la battlemap, en cases, sans écran ni réseau : géométrie d'une scène, ligne de vue, déplacement et placement, ciblage, exploration partagée. Port fidèle de `js/carte.js`, vérifié contre la v1 par `tests/unitaires/battlemap-equivalence-v1.test.ts`. `tests/unitaires/battlemap-bugs-v1.test.ts` tient la liste des bugs connus de la carte v1 : chacun y est vérifié, ou noté « à faire » avec le lot qui le couvrira. S'y ajoutent le cadrage à l'écran (`vue.ts`), les gestes (`interactions.ts`) et le dessin en Canvas 2D (`rendu.ts`), qu'affiche `src/composants/Battlemap.svelte`. `src/composants/CarteTable.svelte` branche la carte sur Firestore (`lib/actions/carte.ts`, `lib/magasins/carte.svelte.ts`) pour le MJ et les joueurs.
- `tests/` : `unitaires/` (fonctions pures, sous Node, sans DOM), `composants/` (composants Svelte montés dans un DOM simulé, jsdom, avec de faux magasins Firestore : pour les bugs qui ne vivent que dans l'enchaînement des états d'un écran), `regles/` (règles Firestore, émulateur). `npm test` lance les deux premiers. **Tout composant qui a cassé en séance reçoit un test de composant** avant d'être corrigé.
- `outils/` : scripts lancés par Node (import des règles de la v1, préparation des scènes).
- `src/lib/firebase/` : initialisation et outils Firebase.
- `src/theme.css` : couleurs, polices, arrondis. Changer d'ambiance = changer ce fichier.

`.dependency-cruiser.cjs` fait échouer `npm run verifier` en cas de
dépendance circulaire ou d'écran qui importe Firebase.

Le diagramme `docs/architecture-v2.drawio` (à la racine du dépôt, à côté
de celui de la v1) montre les modules, leurs dépendances réelles et
l'organisation des données Firestore. **Il se met à jour à chaque lot**,
dans le même commit que le code qu'il décrit.

## Règles Firestore

La 2.0 a son propre projet Firebase, `lejdr-v2` (`.firebaserc`), avec sa
base et ses règles : `firestore.rules` ne couvre que la 2.0
(`tables/**`). La v1 garde le projet `lejdr-b38ef` et ses règles,
déployées depuis la racine du dépôt comme avant.

Le code MJ d'une table se pose à la main dans la console Firebase :
document `tables/<table>/secret/codeMj`, champ `code` (texte).

Fiches (lot L2.1) : `tables/<table>/persos/<id>`, une fiche par personnage ; un joueur peut en avoir plusieurs et joue celui de `joueurs/<uid>.persoActif`. Il crée et modifie les siens, sans pouvoir les donner ni se donner des crans de progression ou de Vécu (champs `progression`, `vecu`, `usages`, réservés vides jusqu'aux rencontres de la 2.1) ; le MJ fait tout. Hors création, les écritures se font champ par champ (`lib/actions/persos.ts`). L'écran joueur liste ses personnages (`composants/MesPersonnages.svelte`, chargé à la demande avec les données de règles) ; le premier créé devient le personnage joué.

Fiches v1 (lot L2.2c) : `tables/<table>/importsV1/<id>`. Le MJ dépose les exports v1 (`composants/ImportFichesV1.svelte`) et attribue chacune à un joueur ; la fiche v1 y est gardée en texte JSON, telle qu'exportée. Le joueur ne lit que les siennes (requête filtrée sur `proprietaireUid`) et la reprend dans l'assistant (`lib/regles/import-v1.ts`) : il rechoisit voies, capacités raciales, hors profil et dons, tout le reste est reporté, les objets rafraîchis depuis le catalogue ; il ne peut ensuite écrire que `reprisPar`, une seule fois.

Battlemap (lot L5.3) : `tables/<table>` porte `sceneActive` (la scène
montrée, écrite par le MJ) ; `tables/<table>/scenes/<scène>` l'état
partagé (portes, exploration) et `…/jetons/<jeton>` un document par
jeton. `…/dessins/<dessin>` : un document par mur, obstacle, porte ou mur
de force tracé par le MJ (lot L5.4). `tables/<table>/scenesImportees/<id>`
décrit une scène importée par le MJ depuis une image (lot L5.5), et
`…/image/donnees` contient l'image compressée. Les règles vérifient les droits ; les
règles de jeu (murs, portes, case occupée) sont appliquées par l'app avant
d'écrire.

Pour essayer à plusieurs sans toucher à la vraie base : `npm run
dev:emulateurs`, puis dans l'interface de l'émulateur
(http://127.0.0.1:4000/firestore) crée le document
`tables/arbre-monde/secret/codeMj` avec un champ `code`. Ouvre l'app dans
une fenêtre normale (MJ) et une fenêtre privée (joueur).
