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

const LOCALITES_MARCHE = [
  {
    id: "haldren",
    nom: "Haldren (Valdorne)",
    palier: "bourg",
    plafondValeurArmure: 2,
    marchands: [
      {
        id: "generaliste_haldren",
        nom: "Marchand généraliste",
        typesAutorises: ["arme", "armure", "bouclier", "consommable"],
        modificateurParDefaut: 1,
        estMarcheNoir: false,
      },
    ],
  },
  {
    id: "grand_marche_libris",
    nom: "Grand Marché (Libris)",
    palier: "capitale",
    plafondValeurArmure: 6,
    marchands: [
      {
        id: "factrice_comptoir",
        nom: "Factrice du Comptoir",
        typesAutorises: ["arme", "armure", "bouclier", "accessoire", "consommable"],
        modificateurParDefaut: 0.8,
        estMarcheNoir: false,
      },
    ],
  },
  {
    id: "karag_dum",
    nom: "Karag Dûm — marché noir",
    palier: "capitale",
    plafondValeurArmure: 6,
    marchands: [
      {
        id: "skarn_ombrefaille",
        nom: "Skarn Ombrefaille",
        typesAutorises: ["arme", "armure", "bouclier", "accessoire", "consommable"],
        modificateurParDefaut: 2.5,
        estMarcheNoir: true,
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

const RARETES_MARCHE = [
  { id: "commun", label: "Commun (×1)", valeur: 1 },
  { id: "peu_commun", label: "Peu commun (×1,5)", valeur: 1.5 },
  { id: "rare", label: "Rare (×3)", valeur: 3 },
  { id: "legendaire", label: "Légendaire (×6)", valeur: 6 },
];

// Tire aléatoirement jusqu'à 40 objets du catalogue LOOT respectant les
// filtres du marchand (type autorisé + plafond valeurArmure/bonusDEF de
// la localité). Si le pool filtré fait moins de 40 objets, prend tout le
// pool (pas de duplication).
function tirerStockMarchand(marchand, localite, catalogueLoot) {
  const pool = catalogueLoot.filter((item) => {
    if (!marchand.typesAutorises.includes(item.type)) return false;
    if (item.type === "armure" && item.valeurArmure > localite.plafondValeurArmure) return false;
    if (item.type === "bouclier") {
      const plafondBouclier = localite.plafondValeurArmure >= 4 ? 3 : Math.min(item.bonusDEF, localite.plafondValeurArmure);
      if (item.bonusDEF > plafondBouclier) return false;
    }
    return true;
  });
  const melange = pool.slice().sort(() => Math.random() - 0.5);
  return melange.slice(0, 40).map((item) => item.id);
}
