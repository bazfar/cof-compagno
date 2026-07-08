# Icônes / jetons de monstres

Convention : un fichier `<id>.png` par monstre, où `<id>` est l'`id` de
l'entrée correspondante dans `data/bestiaire.js` (ex. `golem_de_pierre_naine.png`,
`loup_basique.png`, `loup_veteran.png`).

Format recommandé : 210×210, fond transparent ou neutre — même gabarit que
les tokens de personnages dans `assets/portraits/tokens/`. L'image sert à la
fois d'icône sur la fiche du bestiaire et de jeton sur la carte (worldmap et
battlemap).

Aucune inscription à faire ailleurs : `cheminIconeMonstre()` (js/emblemes.js)
dérive le chemin directement de l'id. Tant qu'un fichier n'existe pas pour un
monstre donné, l'affichage retombe automatiquement sur son emoji (fiche) ou
son initiale (jeton de carte) — dépose simplement l'image ici pour l'activer.

Après ajout/remplacement d'un fichier, pense à incrémenter
`MONSTRES_ICONES_VERSION` dans `js/emblemes.js` pour forcer les navigateurs à
recharger l'image (même nom de fichier).
