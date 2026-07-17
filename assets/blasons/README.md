# Blasons de faction

Convention de nommage : `blason_<slug>.png`, où `<slug>` identifie soit un
groupe de `FACTIONS` (data/donnees.js) au niveau national — ex.
`blason_solvarn.png`, `blason_liberra.png` — soit une entité au sein d'un
groupe (maison, royaume) — ex. `blason_ashe.png`, `blason_valdorne.png`.
Référencé par le champ optionnel `blason` de l'objet groupe (`g.blason`) ou
de l'objet entité (`e.blason` dans `g.entites[]`).

Absent d'un groupe/entité → aucune image affichée, pas de repli visuel
nécessaire (`rendreFactions()`, js/app.js) — l'`<img>` se masque
silencieusement si le fichier n'existe pas encore
(`onerror="this.style.display='none'"`).

Format recommandé : portrait/écu, fond transparent ou neutre, ~1200×1200 —
affiché à 220px de large maximum au niveau groupe (`.faction-blason`) et
56px en vignette au niveau entité (`.pnj-blason`), css/style.css.

Aucune inscription à faire ailleurs : dépose simplement le fichier au chemin
indiqué par `blason` pour l'activer. Après ajout/remplacement d'un fichier,
pense à incrémenter la query string `?v=` de `data/donnees.js` dans
`index.html` pour forcer les navigateurs à recharger les données (même nom
de fichier image côté navigateur : le cache HTTP standard des `<img>` se
rafraîchit de lui-même dès que l'URL apparaît pour la première fois, donc
un simple ajout de fichier n'a pas besoin de bump — seul un remplacement
avec le même nom en aurait besoin).
