/* ============================================================
   COF-COMPAGNO — Réputation de groupe : échelle et blocs de Liberra.
   Réputation PARTAGÉE (une valeur par faction pour tout le groupe),
   stockée via SyncStore (clé "reputation:{factionId}").
   ============================================================ */

// Échelle commune à toutes les factions (bornes inclusives).
const REPUTATION_ECHELLE = [
  { min: 10,  max: 10,  id: "allie_legendaire", label: "Allié Légendaire",
    modPrix: -0.20, description: "Le bloc vous soutient pleinement." },
  { min: 6,   max: 9,   id: "fiable",           label: "Fiable",
    modPrix: -0.10, description: "Vous êtes accueillis et protégés." },
  { min: 2,   max: 5,   id: "reconnu",          label: "Reconnu",
    modPrix: 0,     description: "Votre nom a un poids." },
  { min: -1,  max: 1,   id: "neutre",           label: "Neutre",
    modPrix: 0,     description: "Aucune relation marquée." },
  { min: -5,  max: -2,  id: "mefiant",          label: "Méfiant",
    modPrix: 0.10,  description: "Le bloc vous surveille de près." },
  { min: -9,  max: -6,  id: "deteste",          label: "Détesté",
    modPrix: 0.25,  description: "Vous êtes considérés comme dangereux." },
  { min: -10, max: -10, id: "nemesis",          label: "Némésis",
    modPrix: null,  description: "Le bloc œuvre activement contre vous (commerce refusé)." },
];

// Les 5 blocs de l'Assemblée de Libris.
// plafond : score maximum atteignable (Fils de Libris ne sont jamais
// vraiment "alliés" — cf. discussion 27/07/2026).
const REPUTATION_FACTIONS_LIBERRA = [
  { id: "comptoir",         nom: "Le Comptoir",         plafond: 10,
    accroche: "Marchands, guildes, taxes portuaires — l'effet prix est central ici." },
  { id: "serment_libris",   nom: "Le Serment de Libris", plafond: 10,
    accroche: "Autorité morale déclinante — peu d'effet commercial, surtout accès à l'Assemblée." },
  { id: "garde_citoyenne",  nom: "La Garde Citoyenne",   plafond: 10,
    accroche: "Accès = surveillance/arrestation plutôt que boutiques." },
  { id: "cercle_peuples",   nom: "Le Cercle des Peuples", plafond: 10,
    accroche: "Accès = partage d'info et hospitalité du Quartier du Tissage." },
  { id: "fils_libris",      nom: "Les Fils de Libris",    plafond: 5,
    accroche: "Jamais vraiment alliés — plafond réduit à +5." },
];

if (typeof window !== "undefined") {
  window.REPUTATION_ECHELLE = REPUTATION_ECHELLE;
  window.REPUTATION_FACTIONS_LIBERRA = REPUTATION_FACTIONS_LIBERRA;
}
