# Blasons de faction

Convention : un fichier par groupe de `FACTIONS` (data/donnees.js), référencé
par le champ optionnel `blason` de l'objet groupe (ex. `blason:
"assets/blasons/liberra.png"`). Absent d'un groupe → aucune image affichée,
pas de repli visuel nécessaire (`rendreFactions()`, js/app.js) — l'`<img>`
se masque silencieusement si le fichier n'existe pas encore
(`onerror="this.style.display='none'"`).

Format recommandé : portrait/écu, fond transparent ou neutre, ~1200×1200 —
affiché à 220px de large maximum dans l'onglet Lore > Factions
(`.faction-blason`, css/style.css).

Aucune inscription à faire ailleurs : dépose simplement le fichier au chemin
indiqué par `blason` pour l'activer.
