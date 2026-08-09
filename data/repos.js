/* ============================================================
   COF-COMPAGNO — Repos : paliers de couchage (auberge ou camp) + boissons.
   Prix en po (cf. table de référence économique déjà validée :
   1 po = 10 pa = 100 pb ; ~5 po/jour pour "vivre correctement" à
   Libris = base du calibrage ci-dessous).

   Refonte (09/08/2026, cf. prompt_repos_cuisine_metiers.md) : les repas ne
   sont plus une abstraction à 3 crans (TYPES_REPAS, supprimé) — l'auberge
   vend désormais de vrais plats du catalogue Cuisine (js/cuisine.js), choisis
   individuellement par personnage et lus via leur champ effetRepos (cf.
   js/repos.js). Les paliers de couchage n'ont plus qu'un SEUL dé de
   régénération (le flat séparé disparaît, "luxe" n'a plus deux dés) : camp
   (gratuit, aucun dé propre — juste un abri), dortoir 1d4, chambre privée
   1d6, luxe 1d8. Le palier "camp" permet un repos long hors ville, ce que
   l'ancien système (auberge uniquement) ne permettait pas.
   ============================================================ */

// Palier de couchage (nuit, par personne) : coût + dé de régénération
// (null pour camp — aucun bonus propre, juste un abri).
const PALIERS_AUBERGE = [
  { id: "camp", nom: "Camp (hors ville)", prixPo: 0, de: null },
  { id: "dortoir", nom: "Dortoir", prixPo: 3, de: "1d4" },
  { id: "chambre_privee", nom: "Chambre privée", prixPo: 7, de: "1d6" },
  { id: "luxe", nom: "Luxe", prixPo: 20, de: "1d8" },
];

// Boissons (par verre, par personne) : coût seul, aucune régénération —
// purement cosmétique/économique, inchangé par la refonte.
const TYPES_BOISSON = [
  { id: "table", nom: "Vin/bière de table", prixPo: 0.2 },
  { id: "qualite", nom: "Vin de qualité", prixPo: 1.5 },
  { id: "spiritueux", nom: "Spiritueux", prixPo: 1 },
];
