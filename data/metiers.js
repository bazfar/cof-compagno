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
  traque: {
    id: "traque",
    nom: "Traque",
    icone: "🏹",
    titres: ["Rabatteur", "Pisteur", "Traqueur", "Traqueur confirmé", "Maître traqueur", "Grand veneur"],
    // Contrairement à la Cuisine (caracteristique: null, jet volontairement
    // nu), la Traque PORTE des modificateurs : mod SAG + bonusCompetence
    // ("Survie") + météo. C'est ce qui empêche le métier d'être un doublon
    // de la Cuisine et donne enfin au Chasseur et au Druide un terrain
    // mécanique propre hors combat (un Chasseur rang 2 en Voie de la traque
    // porte déjà +4 en Survie). La base de seuil est relevée de 8 à 10 pour
    // compenser (cf. data/recolte.js, en-tête).
    caracteristique: "SAG",
    competence: "Survie",
    domaine: "faune",
  },
  alchimie: {
    id: "alchimie",
    nom: "Alchimie",
    icone: "⚗️",
    titres: ["Touilleur", "Apprenti", "Herboriste", "Alchimiste", "Maître alchimiste", "Grand œuvre"],
    // Deux usages du même rang : la cueillette de flore (js/recolte.js) et le
    // brassage de potions/poisons (js/alchimie.js, cf. prompt 3). L'XP est
    // commune aux deux — un herboriste qui cueille progresse aussi comme
    // brasseur, c'est voulu.
    caracteristique: "INT",
    competence: null,
    domaine: "flore",
  },
};

if (typeof window !== "undefined") {
  window.RANGS_METIER = RANGS_METIER;
  window.METIERS = METIERS;
}
