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
| `npm run lore:exporter` | Exporte le lore de la v1 vers `lore-v1.json` (secret, ignoré par git), à déposer dans Poste MJ › Données (L2.7a) |
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

Fiches (lot L2.1) : `tables/<table>/persos/<id>`, une fiche par personnage ; un joueur peut en avoir plusieurs et joue celui de `joueurs/<uid>.persoActif`. Il crée et modifie les siens, sans pouvoir les donner ni se donner des crans de progression ou de Vécu (champs `progression`, `vecu`, `usages` ; `vecu` et `usages` restent vides jusqu'aux rencontres de la 2.1) ; le MJ fait tout. Hors création, les écritures se font champ par champ (`lib/actions/persos.ts`). L'écran joueur liste ses personnages (`composants/MesPersonnages.svelte`, chargé à la demande avec les données de règles) ; le premier créé devient le personnage joué.

Fiches v1 (lot L2.2c) : `tables/<table>/importsV1/<id>`. Le MJ dépose les exports v1 (`composants/ImportFichesV1.svelte`) et attribue chacune à un joueur ; la fiche v1 y est gardée en texte JSON, telle qu'exportée. Le joueur ne lit que les siennes (requête filtrée sur `proprietaireUid`) et la reprend dans l'assistant (`lib/regles/import-v1.ts`) : il rechoisit voies, capacités raciales, hors profil et dons, tout le reste est reporté, les objets rafraîchis depuis le catalogue ; il ne peut ensuite écrire que `reprisPar`, une seule fois.

Fiche vivante (lot L2.3) : `composants/FicheVivante.svelte` affiche ce que calcule `lib/fiche/vue-fiche.ts` (pur, testé sur les 9 fiches réelles) ; un champ en cours de saisie n'est jamais écrasé par une mise à jour. Le MJ voit tout le groupe (`composants/GroupeMj.svelte`). Notes libres dans le champ `notes` de la fiche ; portrait dans son propre document, `persos/<id>/images/portrait` (data URL compressée, 256 px), écrit par le propriétaire ou le MJ. Équipement et sac (lot L2.4) : `lib/regles/equipement.ts` porte les règles v1 (emplacements, deux mains, bouclier, piles, potions) en fonctions pures qui rendent un changement ; `appliquerChangement` (`lib/actions/persos.ts`) l'écrit en une seule mise à jour des seuls champs touchés (`equipement.<emplacement>`, `inventaire.<clé>`, PV). Le MJ seul ajoute des objets au sac.

Crans et journal de dés (lot L2.5) : le MJ donne un cran de progression à un PJ, ou à tous les PJ joués (`composants/GroupeMj.svelte`), et peut en retirer un sans jamais faire perdre un niveau. `donnerCran` (`lib/actions/progression.ts`) écrit dans **une transaction** le document du cran, `persos/<id>/jalons/<id>` (en ajout seul, MJ seul), et le compte `progression.crans` de la fiche. Crans requis pour monter (`lib/regles/progression.ts`) : 3 jusqu'au niveau 4, 4 jusqu'au 7, 5 jusqu'au 10, 6 pour 11 et 12 ; plafond au niveau 12. Les dés passent tous par `lib/regles/des.ts`. Le journal commun, `tables/<table>/journal/<id>`, est en ajout seul : chacun n'y note que ses jets, toute la table les voit (`composants/JournalDes.svelte`, les 40 derniers). Y arrivent le lanceur libre, les tests lancés depuis la fiche (d20 + modificateur, en cliquant une valeur) et les potions. Le journal est sur l'écran de départ : `lib/actions/journal.ts` n'importe pas `actions/persos`, pour que les données de règles restent dans les morceaux chargés à la demande.

Montée de niveau (lot L2.5b) : barre pleine, « Passer au niveau N » sur la fiche ouvre `composants/MonteeNiveau.svelte`. Les règles sont celles de l'assistant de création (`lib/regles/montee.ts` rejoue `creation.ts` sur un brouillon tiré de la fiche au niveau suivant) : dé de vie, 2 points de capacité, dons des niveaux 4, 8 et 12, rangs raciaux d'office avec leurs choix, Polyvalence, sorts. Les choix acquis sont verrouillés. `monterNiveau` (`lib/actions/montee.ts`) relit la fiche dans une transaction, y rejoue la montée et écrit d'un coup le niveau, les choix, les PV et PP (leur gain, sans corriger des PV max hérités de la v1) et les crans dépensés. Côté règles Firestore, le joueur ne change son niveau et ses crans que par une montée valide (`monteeValide` : un niveau, jusqu'au 12, crans requis dépensés) ; `tests/unitaires/montee.test.ts` vérifie que monter d'un niveau donne le même personnage que le créer à ce niveau, pour toutes les classes et races.

Mise en page (lot L2.6, maquette validée le 18/10/2026) : PC seulement. L'écran joueur a deux colonnes, la fiche à gauche (elle prime) et, à droite, une carte réduite (`CarteTable`, prop `hauteur`) et le journal compact (`JournalDes`, prop `compact` : 8 derniers jets, liste entière à la demande). Le poste MJ a des sections dans la barre du haut (`BarreHaut`, props `sections`) : Séance (carte au centre, groupe en cartes compactes à droite, journal en bas) et Données (fiches v1) ; une section masquée n'est pas démontée, pour que la carte du MJ continue d'enregistrer l'exploration. La fiche vivante a un en-tête collant (portrait, crans, PV, PP) et 4 onglets : Combat (avec les caractéristiques), Capacités (en combat / hors combat, d'après `VOIES_HORS_COMBAT` de `lib/fiche/vue-fiche.ts`), Équipement, Suivi et notes. Côté MJ, elle s'ouvre dans un panneau latéral (Échap le ferme, sauf pendant une saisie). Les joueurs de la table sont des pastilles dans la barre du haut.

Lore partagé (lot L2.7a, décisions du 18/10/2026) : des fiches de lore faites de passages, que le MJ partage avec personne, certains joueurs ou tous, et dont il peut sceller un passage. Deux documents par fiche, écrits ensemble dans une écriture groupée par `lib/actions/lore.ts` : `tables/<table>/loreMj/<id>`, la fiche complète, que le MJ seul lit ; `tables/<table>/lore/<id>`, la version joueurs que calcule `versionJoueurs` (`lib/lore/fiche.ts`), sans passage scellé, lisible seulement si l'uid du joueur ou `*` est dans `lecteurs`, et absente quand personne ne la voit. Un texte scellé ne quitte donc jamais la base vers un joueur (la v1 le livrait dans le code de la page). Le lore de la v1 n'est jamais livré avec l'app : `npm run lore:exporter` le convertit (`lib/lore/import-v1.ts`, partagé comme en v1 : sections MJ cachées, accroches et secrets des PNJ scellés) dans `lore-v1.json`, que le MJ dépose dans Données ; une fiche déjà présente est gardée. L'export échoue si un nom de `NOMS_JAMAIS_REVELES` serait lisible par les joueurs. L'écran Lore arrive en L2.7b.

Battlemap (lot L5.3) : `tables/<table>` porte `sceneActive` (la scène
montrée, écrite par le MJ) ; `tables/<table>/scenes/<scène>` l'état
partagé (portes, exploration) et `…/jetons/<jeton>` un document par
jeton ; le jeton d'un PJ s'appelle `pj-<id du personnage>` (lot L2.3) et
un joueur ne pose que celui de son personnage joué ; nom, PV et portrait
sont relus dans la fiche. `…/dessins/<dessin>` : un document par mur, obstacle, porte ou mur
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
