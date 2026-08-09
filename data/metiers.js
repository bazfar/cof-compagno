/* ============================================================
   COF-COMPAGNO — Métiers : données génériques (XP + rang).
   Cf. js/metiers.js pour le moteur, js/cuisine.js pour le premier
   occupant. Structure pensée pour accueillir un futur forgeron/
   herboriste sans refonte : RANGS_METIER est une échelle UNIQUE
   partagée par tous les métiers, seuls les libellés (titres) et la
   caractéristique éventuelle changent d'une entrée de METIERS à l'autre.
   ============================================================ */

// Rangs communs à tous les métiers : la progression est une échelle unique,
// seuls les libellés changent d'un métier à l'autre.
const RANGS_METIER = [
  { rang: 0, xpMin: 0 },
  { rang: 1, xpMin: 10 },
  { rang: 2, xpMin: 25 },
  { rang: 3, xpMin: 50 },
  { rang: 4, xpMin: 90 },
  { rang: 5, xpMin: 150 },
];

const METIERS = {
  cuisine: {
    id: "cuisine",
    nom: "Cuisine",
    icone: "🍳",
    // Libellés de rang propres au métier (index = rang).
    titres: ["Marmiton", "Apprenti", "Cuisinier", "Cuisinier confirmé", "Maître queux", "Grand queux"],
    // Décision délibérée (cf. prompt_repos_cuisine_metiers.md) : le jet de
    // cuisine ne prend AUCUN modificateur de caractéristique — la difficulté
    // est portée entièrement par l'écart entre le rang du cuisinier et le
    // rang de la recette (cf. data/cuisine.js, résolution du jet). Ne PAS
    // "améliorer" ça plus tard en ajoutant un mod : ce serait changer
    // l'équilibrage volontairement plat du système.
    caracteristique: null,
  },
};

if (typeof window !== "undefined") {
  window.RANGS_METIER = RANGS_METIER;
  window.METIERS = METIERS;
}
