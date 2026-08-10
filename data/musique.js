/* ============================================================
   COF-COMPAGNO — Métier Musicien : répertoire et instruments.

   Le Barde n'a AUCUN buff d'allié dans ses cinq voies (Voie du chant =
   malus infligés aux ennemis, Voie du spectacle = acrobatie). Ce métier
   occupe une case vide de data/donnees.js, il n'en dispute aucune —
   c'est la raison d'être du chantier, ne pas la perdre de vue si un
   jour quelqu'un veut « fusionner » le métier avec la Voie du chant.

   Modèle de jet : DIFFICULTÉ ABSOLUE (cf. Alchimie), pas seuil relatif
   (cf. Cuisine/Traque). difficulte = 10 + 2 × rang du morceau ; le
   bonus vient du rang de métier (×1, PAS ×2 comme en Alchimie — le
   Musicien porte en plus un terme d'instrument jusqu'à +4) et de la
   caractéristique CHA.

   Les effets s'appliquent jusqu'au PROCHAIN repos long (veillée de
   camp, cf. js/repos.js) — sauf sur Ovation, où ils tiennent un repos
   de plus.
   ============================================================ */

// cible : "Volonte" | "Vigueur" | "Reflexes" | "toutes" | "choix" | null (effet special)
const REPERTOIRE_MUSIQUE = [
  { id: "ritournelle_route", nom: "Ritournelle de route", rang: 0,
    cible: "Volonte", valeur: 1, bardeSeul: false,
    description: "Trois notes qui reviennent, et le pas se cale dessus sans qu'on le décide." },

  { id: "air_gardesele", nom: "Air de Gardesèle", rang: 1,
    cible: "Reflexes", valeur: 1, bardeSeul: false,
    description: "Un air à danser de Valdorne, joué vite. On garde les jambes légères." },

  { id: "complainte_lisdane", nom: "Complainte de la Lisdane", rang: 1,
    cible: "Vigueur", valeur: 1, bardeSeul: false,
    description: "Longue, lente, increvable — comme le fleuve. Les corps tiennent parce qu'elle ne s'arrête pas." },

  { id: "marche_fossessainte", nom: "Marche de Fossessainte", rang: 2,
    cible: "Volonte", valeur: 2, bardeSeul: false,
    description: "Le seul air que les six nations chantent avec les mêmes paroles, et chacune prétend l'avoir écrit." },

  { id: "chant_veille", nom: "Chant de veille", rang: 2,
    cible: null, valeur: 0, bardeSeul: false,
    effetSpecial: "initiative_avantage",
    description: "On ne dort pas vraiment. Le premier qui bouge, on l'entend." },

  { id: "prune_brulante", nom: "Prune brûlante", rang: 3,
    cible: "toutes", valeur: 1, bardeSeul: true,
    description: "La bouteille passe de main en main, du plus haut au plus bas gradé, et l'air va avec. Refuser est une insulte." },

  { id: "repas_long", nom: "Le Repas long", rang: 3,
    cible: "choix", valeur: 2, bardeSeul: true,
    description: "Sept services, ordre fixe, du plus clair au plus sombre. Le musicien mornacien accompagne chaque passage." },

  { id: "requiem_ysmaal", nom: "Requiem d'Ysmaal", rang: 4,
    cible: "Volonte", valeur: 2, bardeSeul: true,
    effetSpecial: "avantage_corruption",
    description: "On chante pour un dieu mort. Personne ne sait si ça l'atteint ; tout le monde sait ce que ça fait à ceux qui écoutent." },

  // ⚠️ VALEUR À SURVEILLER — le plus gros buff permanent de l'app.
  // +2 sur les trois sauvegardes, pour tous les convives, jusqu'au
  // lendemain (deux jours sur Ovation). Décision de Thomas, validée le
  // 10/08/2026 après avertissement explicite. Si ça déséquilibre en
  // partie, c'est CE nombre qu'on baisse — pas la difficulté, pas
  // l'accès : la difficulté 20 et le verrou rang 4 sont déjà les
  // garde-fous prévus.
  { id: "chant_fracture", nom: "Chant de la Fracture", rang: 5,
    cible: "toutes", valeur: 2, bardeSeul: true,
    description: "Ce qu'on jouait avant. Il en reste quatre mesures et personne ne s'accorde sur la cinquième." },
];

// Bonus au jet. La progression de prix est volontairement brutale :
// +4 vaut quatre rangs de métier, et doit coûter le prix d'une maison.
const INSTRUMENTS_MUSIQUE = [
  { id: "flute_roseau",   bonus: 0 },
  { id: "tambour_marche", bonus: 1 },
  { id: "cornemuse_col",  bonus: 1 },
  { id: "luth_mornac",    bonus: 2 },
  { id: "viole_aetharion",bonus: 3 },
  { id: "harpe_seve",     bonus: 4 },
];

function difficulteMorceau(morceau) { return 10 + 2 * morceau.rang; }

if (typeof window !== "undefined") {
  window.REPERTOIRE_MUSIQUE = REPERTOIRE_MUSIQUE;
  window.INSTRUMENTS_MUSIQUE = INSTRUMENTS_MUSIQUE;
  window.difficulteMorceau = difficulteMorceau;
}
