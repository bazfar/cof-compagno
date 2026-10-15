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
| `npm run verifier` | Typage, architecture, tests, build, règles Firestore — doit passer avant tout commit |
| `npm run deployer` | Vérifie, puis déploie le site v2 et les règles Firestore |

## Architecture

- `src/ecrans/`, `src/composants/` : interface. **Ne parlent jamais à Firebase.**
- `src/lib/magasins/` : lectures en temps réel (états Svelte réactifs).
- `src/lib/actions/` : seules fonctions qui écrivent dans Firestore.
- `src/lib/schemas/` : forme des documents (Zod), source unique.
- `src/lib/firebase/` : initialisation et outils Firebase.
- `src/theme.css` : couleurs, polices, arrondis. Changer d'ambiance = changer ce fichier.

`.dependency-cruiser.cjs` fait échouer `npm run verifier` en cas de
dépendance circulaire ou d'écran qui importe Firebase.

Le diagramme `docs/architecture-v2.drawio` (à la racine du dépôt, à côté
de celui de la v1) montre les modules, leurs dépendances réelles et
l'organisation des données Firestore. **Il se met à jour à chaque lot**,
dans le même commit que le code qu'il décrit.

## Règles Firestore

`firestore.rules` est le **seul** fichier de règles du projet : il couvre
la v1 (`sessions/**`, inchangé) et la 2.0 (`tables/**`). Ne plus jamais
déployer de règles depuis la racine du dépôt.

Le code MJ d'une table se pose à la main dans la console Firebase :
document `tables/<table>/secret/codeMj`, champ `code` (texte).
