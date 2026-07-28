/* ============================================================
   COF-COMPAGNO — Repos : paliers d'auberge, repas, boissons.
   Prix en po (cf. table de référence économique déjà validée :
   1 po = 10 pa = 100 pb ; ~5 po/jour pour "vivre correctement" à
   Libris = base du calibrage ci-dessous).
   ============================================================ */

// Palier d'auberge (nuit, par personne) : coût + dé(s) de régénération.
const PALIERS_AUBERGE = [
  { id: "dortoir", nom: "Dortoir", prixPo: 3, des: [4], flat: 0 },
  { id: "chambre_privee", nom: "Chambre privée", prixPo: 7, des: [6], flat: 1 },
  { id: "luxe", nom: "Luxe", prixPo: 20, des: [6, 6], flat: 2 },
];

// Repas (par repas, par personne) : coût + dé bonus de régénération (si applicable).
const TYPES_REPAS = [
  { id: "simple", nom: "Simple", prixPo: 1, des: [], flat: 0 },
  { id: "copieux", nom: "Copieux", prixPo: 2, des: [4], flat: 0 },
  { id: "gastronomique", nom: "Gastronomique", prixPo: 6, des: [6], flat: 0 },
];

// Boissons (par verre, par personne) : coût seul, aucune régénération.
const TYPES_BOISSON = [
  { id: "table", nom: "Vin/bière de table", prixPo: 0.2 },
  { id: "qualite", nom: "Vin de qualité", prixPo: 1.5 },
  { id: "spiritueux", nom: "Spiritueux", prixPo: 1 },
];
