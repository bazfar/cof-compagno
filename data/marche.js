/* ============================================================
   COF-COMPAGNO — Marché : localités et marchands.

   Paliers ancrés sur la légende de la carte du monde "Eldoria" :
   bourg (•) / grande_ville (○) / capitale (★) / forteresse / port.

   Le modificateur régional n'est PAS calculé automatiquement par
   objet (loot.json ne porte pas de champ "origine/faction" par
   objet — l'ajouter aurait exigé de retagger 162 objets sans
   valeur de jeu claire). Le MJ choisit le modificateur applicable
   ligne par ligne dans l'onglet Marché, avec le modificateur par
   défaut du marchand pré-sélectionné :
     - 0.8  Produit local / typique de la région
     - 1.0  Importé, faction alliée ou neutre
     - 1.5  Importé, faction rivale ou zone frontalière
     - 2-3  Marché noir / contrebande (repli si estMarcheNoir=true)

   Les accessoires ignorent ce modificateur (cf. sansModificateurRegional
   sur chaque item de loot.json) — un trinket magique n'a pas de
   provenance régionale.
   ============================================================ */

// nation/regionMeteo (prompt_marche_ingredients.md, étape 3) : `nation`
// pilote le calcul local/allié/import (cf. BLOCS + calculerModificateurOrigine
// plus bas), `regionMeteo` synchronise la ville avec la région météo choisie
// par le MJ (cf. js/marche.js, présélection — un CONFORT, jamais un verrou :
// un joueur reste libre de consulter n'importe quel autre marché).
const LOCALITES_MARCHE = [
  {
    id: "haldren",
    nom: "Haldren (Valdorne)",
    palier: "bourg",
    plafondValeurCA: 12,
    nation: "valdorne",
    regionMeteo: "valdorne",
    marchands: [
      {
        id: "generaliste_haldren",
        nom: "Marchand généraliste",
        // "ingredient" ajouté ici (prompt_marche_ingredients.md étape 4) :
        // Haldren garde son seul généraliste (pas de boucherie/épicerie
        // dédiée), donc c'est LUI qui doit pouvoir vendre des vivres —
        // quotas.ingredient les plafonne à 20 pour ne pas noyer armes et
        // potions sous le grain (cf. tirerStockMarchand, data/marche.js).
        typesAutorises: ["arme", "armure", "bouclier", "consommable", "ingredient"],
        quotas: { ingredient: 20 },
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
    ],
  },
  {
    id: "grand_marche_libris",
    nom: "Grand Marché (Libris)",
    palier: "capitale",
    plafondValeurCA: 16,
    nation: "liberra",
    regionMeteo: "liberra_nord",
    marchands: [
      {
        id: "factrice_comptoir",
        nom: "Factrice du Comptoir",
        typesAutorises: ["arme", "armure", "bouclier", "accessoire", "consommable"],
        modificateurParDefaut: 0.8,
        estMarcheNoir: false,
        faction: "comptoir", // lie ce marchand à la réputation du bloc Comptoir (Liberra)
      },
      {
        id: "boucherie_libris",
        nom: "Boucherie",
        typesAutorises: ["ingredient"],
        famillesAutorisees: ["viande"],
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
      {
        id: "epicerie_libris",
        nom: "Épicerie",
        typesAutorises: ["ingredient", "consommable"],
        famillesAutorisees: ["cereale", "legume", "champignon", "sel_epice", "gras_sucre", "seve", "laitier", "boisson", "divers"],
        quotas: { consommable: 6 }, // quelques potions, pas un apothicaire
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
    ],
  },
  {
    id: "karag_dum",
    nom: "Karag Dûm — marché noir",
    palier: "capitale",
    plafondValeurCA: 16,
    // "khazrak" (nation, cf. origine des vivres) ≠ "karag_dum" (regionMeteo,
    // id de REGIONS_METEO) : Karag Dûm est la CAPITALE de la nation Khazrak
    // Dûm (Nains Renégats, cf. data/donnees.js) — même écart de vocabulaire
    // que Solvarn/Solmaris ou Valdorne/Valdecourt, juste jamais nommé "nation
    // Karag Dûm" nulle part dans le canon.
    nation: "khazrak",
    regionMeteo: "karag_dum",
    marchands: [
      {
        id: "skarn_ombrefaille",
        nom: "Skarn Ombrefaille",
        typesAutorises: ["arme", "armure", "bouclier", "accessoire", "consommable"],
        modificateurParDefaut: 2.5,
        estMarcheNoir: true,
      },
      // Délibérément AUCUNE boucherie ni épicerie ici (cf. prompt_marche_
      // ingredients.md étape 4, "Karag Dûm son marché noir [seulement]") —
      // et son unique marchand ne vend pas non plus de vivres : le marché
      // noir des Failles Rouges fait dans l'arme et la contrebande, pas le
      // grain. Contrôle jetable #6 de la validation.
    ],
  },
  {
    id: "valdecourt",
    nom: "Valdecourt (Valdorne)",
    palier: "capitale",
    plafondValeurCA: 16,
    nation: "valdorne",
    regionMeteo: "valdorne",
    marchands: [
      {
        id: "boucherie_valdecourt",
        nom: "Boucherie",
        typesAutorises: ["ingredient"],
        famillesAutorisees: ["viande"],
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
      {
        id: "epicerie_valdecourt",
        nom: "Épicerie",
        typesAutorises: ["ingredient", "consommable"],
        famillesAutorisees: ["cereale", "legume", "champignon", "sel_epice", "gras_sucre", "seve", "laitier", "boisson", "divers"],
        quotas: { consommable: 6 },
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
    ],
  },
  {
    id: "mornhaven",
    nom: "Mornhaven (Mornac)",
    palier: "capitale",
    plafondValeurCA: 16,
    nation: "mornac",
    regionMeteo: "mornac",
    marchands: [
      {
        id: "boucherie_mornhaven",
        nom: "Boucherie",
        typesAutorises: ["ingredient"],
        famillesAutorisees: ["viande"],
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
      {
        id: "epicerie_mornhaven",
        nom: "Épicerie",
        typesAutorises: ["ingredient", "consommable"],
        famillesAutorisees: ["cereale", "legume", "champignon", "sel_epice", "gras_sucre", "seve", "laitier", "boisson", "divers"],
        quotas: { consommable: 6 },
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
    ],
  },
];

const MODIFICATEURS_REGIONAUX = [
  { id: "local", label: "Produit local (×0,8)", valeur: 0.8 },
  { id: "importe_allie", label: "Importé, allié (×1)", valeur: 1 },
  { id: "importe_rival", label: "Importé, rival/frontière (×1,5)", valeur: 1.5 },
  { id: "marche_noir_2", label: "Marché noir (×2)", valeur: 2 },
  { id: "marche_noir_3", label: "Marché noir (×3)", valeur: 3 },
];

// Blocs culturels (prompt_marche_ingredients.md étape 5) — sert UNIQUEMENT
// au calcul local/allié/import ci-dessous, jamais lu ailleurs (pas une
// donnée géopolitique générale : Serval y est "humain" par convention de
// commerce/langue, ce qui ne dit rien de son statut politique réel).
const BLOCS = {
  humain: ["solvarn", "valdorne", "arveth", "mornac", "liberra", "serval"],
  elfique: ["aetharion", "aelindra", "mordanel"],
  nain: ["kaldrun", "khazrak"],
};
function _blocDe(nationOuBloc) {
  if (Object.keys(BLOCS).includes(nationOuBloc)) return nationOuBloc;
  return Object.keys(BLOCS).find((b) => BLOCS[b].includes(nationOuBloc)) || null;
}

// Modificateur régional AUTOMATIQUE d'un vivre pour une localité donnée,
// déduit de son origine et de la nation de la localité (cf. LOCALITES_MARCHE
// ci-dessus) — remplace la sélection manuelle du MJ comme valeur par
// défaut, jamais comme contrainte (le menu déroulant reste disponible et
// écrase ce calcul, cf. js/marche.js). Une origine valant directement un nom
// de bloc ("elfique"/"nain"/"humain", cf. miel_bosquet et consorts, qui
// n'appartiennent à aucune nation précise) se compare au bloc de la
// localité, jamais à sa nation — d'où le test _blocDe(origine) en premier.
// Répli neutre (×1) si l'une des deux données manque (localité sans nation,
// vivre sans origine) plutôt que de deviner.
//
// Cas particulier vérifié sur l'exemple du prompt (sombre-truffe, origine
// "nain", ×0,8 à Karag Dûm et ×1,5 à Libris) : quand l'origine EST déjà un
// bloc entier, la retrouver dans n'importe quelle localité de ce bloc n'est
// pas un "import allié" entre deux nations distinctes, c'est déjà "de la
// région" au sens large — donc local (×0,8), pas ×1. Le palier "importé
// allié" (×1) ne s'applique qu'à une origine de nation précise (ex.
// "solvarn") retrouvée dans une AUTRE nation du même bloc (ex. valdorne).
function modificateurOrigineAutomatique(origine, nationLocalite) {
  if (!origine || !nationLocalite) return 1;
  if (origine === "partout" || origine === nationLocalite) return 0.8;
  const blocOrigine = _blocDe(origine);
  const blocLocalite = _blocDe(nationLocalite);
  if (!blocOrigine || blocOrigine !== blocLocalite) return 1.5;
  return Object.keys(BLOCS).includes(origine) ? 0.8 : 1;
}

const RARETES_MARCHE = [
  { id: "commun", label: "Commun (×1)", valeur: 1 },
  { id: "peu_commun", label: "Peu commun (×1,5)", valeur: 1.5 },
  { id: "rare", label: "Rare (×3)", valeur: 3 },
  { id: "legendaire", label: "Légendaire (×6)", valeur: 6 },
];

// Poids de tirage de la rareté d'un objet à l'arrivée en stock — indépendant
// du sélecteur RARETES_MARCHE (qui sert au calcul du prix), c'est juste la
// probabilité qu'un objet donné arrive en stock étiqueté peu commun/rare/
// légendaire plutôt que commun. Un item déjà rariteFixe=true (accessoires
// Rare par nature) ou déjà enchanté (arme/armure/bouclier avec enchantement
// > 0, qui a déjà son propre multiplicateur de prix) ne tire jamais : il
// reste "commun" pour ne pas cumuler deux bonus de prix différents.
const POIDS_RARETE_STOCK = [
  { id: "commun", poids: 70 },
  { id: "peu_commun", poids: 22 },
  { id: "rare", poids: 7 },
  { id: "legendaire", poids: 1 },
];

function tirerRareteStock() {
  const total = POIDS_RARETE_STOCK.reduce((s, r) => s + r.poids, 0);
  let tirage = Math.random() * total;
  for (const r of POIDS_RARETE_STOCK) {
    if (tirage < r.poids) return r.id;
    tirage -= r.poids;
  }
  return "commun";
}

// Tire aléatoirement jusqu'à 40 objets du catalogue LOOT respectant les
// filtres du marchand (type autorisé + plafond valeurCA/bonusDEF de
// la localité). Si le pool filtré fait moins de 40 objets, prend tout le
// pool (pas de duplication). Chaque objet tiré reçoit en plus une rareté de
// stock aléatoire (cf. POIDS_RARETE_STOCK) qui majore son prix de vente.
// horsMarche=true (cf. loot.json) : objet unique/quête qu'un marchand
// générique ne doit jamais avoir en stock au hasard — reste obtenable
// uniquement via le MJ (Loot/+Ajouter un objet), jamais tiré ici.
function tirerStockMarchand(marchand, localite, catalogueLoot) {
  let pool = catalogueLoot.filter((item) => {
    if (item.horsMarche) return false;
    if (!marchand.typesAutorises.includes(item.type)) return false;
    // famillesAutorisees (prompt_marche_ingredients.md étape 4) : NOUVEAU
    // filtre, ignoré quand absent — les marchands existants ne changent pas
    // de comportement. Ne gate QUE les ingredients (les potions d'une
    // épicerie, type "consommable" sans familleVivre, ne sont jamais
    // concernées) : une boucherie ne vend ni poisson ni laitier.
    if (marchand.famillesAutorisees && item.type === "ingredient" && !marchand.famillesAutorisees.includes(item.familleVivre)) return false;
    if (item.type === "armure" && (item.valeurCA || 10) > localite.plafondValeurCA) return false;
    if (item.type === "bouclier") {
      // Seuil/plafond décalés de -10 par rapport à plafondValeurCA (échelle
      // 0-6, cf. ex-plafondValeurArmure) pour rester comparables à bonusDEF
      // (échelle 1-3) — migration valeurCA à comportement inchangé.
      const plafondCru = localite.plafondValeurCA - 10;
      const plafondBouclier = plafondCru >= 4 ? 3 : Math.min(item.bonusDEF, plafondCru);
      if (item.bonusDEF > plafondBouclier) return false;
    }
    return true;
  });
  // quotas (prompt_marche_ingredients.md étape 4) : plafond PAR TYPE,
  // appliqué avant la coupe globale à 40 — sans ça, 81 vivres noieraient les
  // potions/armes d'un généraliste. Mélangé d'abord pour que les n gardés
  // soient un sous-ensemble aléatoire, pas toujours les mêmes premiers de
  // catalogueLoot. Type absent de `quotas` = non plafonné ici (seule la
  // coupe globale s'applique) ; `quotas` absent du marchand = comportement
  // actuel inchangé.
  if (marchand.quotas) {
    const compteurs = {};
    pool = pool.slice().sort(() => Math.random() - 0.5).filter((item) => {
      const max = marchand.quotas[item.type];
      if (max == null) return true;
      compteurs[item.type] = (compteurs[item.type] || 0) + 1;
      return compteurs[item.type] <= max;
    });
  }
  const melange = pool.slice().sort(() => Math.random() - 0.5);
  return melange.slice(0, 40).map((item, idx) => ({
    slotId: item.id + "_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).slice(2, 8),
    itemId: item.id,
    rareteId: (item.rariteFixe || item.enchantement > 0) ? "commun" : tirerRareteStock(),
  }));
}
