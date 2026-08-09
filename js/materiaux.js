/* ============================================================
   COF-COMPAGNO — Matériaux d'armes (loot).

   Axe INDÉPENDANT de la rareté et de l'enchantement — les bonus se
   cumulent (ex. une Épée longue +1, Rare, Enflammée cumule
   bonusDegatsTotal, effetRarete ET degatsFeu).

   Un seul matériau pour l'instant : Feu (3 rangs), applicable à
   n'importe quelle arme du catalogue (type === "arme") au moment de la
   mise en jeu. Architecture ouverte pour de futurs matériaux, mais ne
   PAS ajouter "Acier" (pénétration d'armure) — abandonné, trop fort pour
   le monde d'Arbre-Monde.

   Comme les effets spéciaux de rareté, cet effet est DESCRIPTIF — affiché
   dans l'inventaire et la fiche, pas appliqué automatiquement par le
   lanceur de dés (le joueur/MJ ajoute le dé de feu manuellement, comme
   pour tous les autres effets spéciaux du jeu).
   ============================================================ */

const MATERIAUX = {
  feu: {
    id: "feu",
    nom: "Enflammée",
    rangs: [
      { rang: 1, nom: "enflammée",     degatsFeu: "1d4" },
      { rang: 2, nom: "ardente",       degatsFeu: "1d6" },
      { rang: 3, nom: "incandescente", degatsFeu: "1d8" },
    ],
  },
};

const Materiaux = (() => {
  "use strict";

  function disponiblePour(item) {
    return !!(item && item.type === "arme");
  }
  function trouver(materiauId) {
    return MATERIAUX[materiauId] || null;
  }
  function trouverRang(materiauId, rang) {
    const m = trouver(materiauId);
    if (!m) return null;
    return m.rangs.find((r) => r.rang === rang) || m.rangs[0];
  }

  /**
   * Renvoie une COPIE de `item` avec le matériau appliqué, ou `item`
   * inchangé si materiauId est null/"aucun" ou l'item n'est pas une arme.
   */
  function appliquer(item, materiauId, rang) {
    if (!materiauId || materiauId === "aucun" || !disponiblePour(item)) return item;
    const infoRang = trouverRang(materiauId, rang);
    if (!infoRang) return item;

    const clone = Object.assign({}, item, {
      materiau: materiauId,
      materiauRang: infoRang.rang,
      materiauNom: infoRang.nom,
      degatsFeu: infoRang.degatsFeu,
      materiauEffet: `+${infoRang.degatsFeu} dégâts de feu`,
    });
    clone.nom = `${item.nom} ${infoRang.nom}`;
    return clone;
  }

  return { LISTE: MATERIAUX, disponiblePour, trouver, trouverRang, appliquer };
})();

if (typeof window !== "undefined") {
  window.MATERIAUX = MATERIAUX;
  window.Materiaux = Materiaux;
}

/* ============================================================
   Le Grisfer — second axe matériau, DISTINCT du bloc Feu ci-dessus.

   Pourquoi un registre séparé (MATERIAUX_RARETE/MateriauxRarete) plutôt
   qu'une entrée de plus dans MATERIAUX.LISTE (cf. prompt_grisfer_seve.md,
   qui demandait initialement "nouveau js/materiaux.js" sans savoir que ce
   fichier existait déjà) : js/loot.js pilote la sélection de matériau via
   Object.values(Materiaux.LISTE) (chips), puis, pour le matériau choisi,
   accède SANS GARDE à `materiau.rangs.map(...)` (_rendreSelecteurRangMateriau).
   Le Grisfer n'a pas de rang indépendant : ses paliers dépendent de la
   rareté de l'objet (peu_commun/rare/legendaire), exactement comme
   js/affixes.js — un objet `{ paliers: {...} }` sans `.rangs` ferait
   planter cette fonction dès qu'on cliquerait sur le chip "Grisfer".
   Tant que js/loot.js n'est pas étendu pour gérer les deux formes (hors
   périmètre de cette passe, qui n'autorise pas de toucher ce fichier),
   le Grisfer vit dans son propre registre, invisible du sélecteur
   dynamique — appliqué pour l'instant via les items statiques du
   catalogue (data/loot.json) qui portent déjà bonusDegatsCreature/
   reductionDegatsCreature en dur.

   Métal gris terne, extrait d'une veine unique sous Kaldrun — accident
   géologique, sans explication cosmologique (décision délibérée : ne
   PAS inventer de justification mystique, l'absence de raison est un
   choix). Frappe plus fort démons et morts-vivants.

   - Émet `bonusDegatsCreature` (arme) / `reductionDegatsCreature`
     (armure) — jamais `bonusDegatsAffixe`/`reductionDegats`, qui
     s'appliquent inconditionnellement : ces bonus sont conditionnés à
     la cible (cf. js/capacites.js, bloc "Grisfer — accord Thomas").
   - Règle gratuite, sans code : une arme de Grisfer compte comme
     magique face à la Chair d'ailleurs des démons (résistance D1-D3,
     immunité D4-D5). Cette règle est écrite dans la fiche de la famille
     démoniaque (capacitesSpeciales, data/bestiaire.json), pas ici — un
     guerrier nain sans arme enchantée redevient donc pertinent contre
     un Gouffre/Convive, sans toucher à la résistance graduée.
   ============================================================ */

const MATERIAUX_RARETE = {
  grisfer: {
    id: "grisfer",
    nom: "Grisfer",
    paliers: {
      peu_commun: {
        suffixe: "de Grisfer",
        arme: { bonusDegatsCreature: "1d4", texte: "+1d4 dégâts contre les démons et les morts-vivants. Compte comme une arme magique face à la Chair d'ailleurs des démons." },
        armure: { reductionDegatsCreature: 1, texte: "+1 réduction de dégâts contre les démons et les morts-vivants." },
      },
      rare: {
        suffixe: "de Grisfer",
        arme: { bonusDegatsCreature: "1d6", texte: "+1d6 dégâts contre les démons et les morts-vivants. Compte comme une arme magique face à la Chair d'ailleurs des démons." },
        armure: { reductionDegatsCreature: 2, texte: "+2 réduction de dégâts contre les démons et les morts-vivants." },
      },
      legendaire: {
        suffixe: "de Grisfer",
        arme: { bonusDegatsCreature: "1d8", texte: "+1d8 dégâts contre les démons et les morts-vivants. Compte comme une arme magique face à la Chair d'ailleurs des démons." },
        armure: { reductionDegatsCreature: 3, texte: "+3 réduction de dégâts contre les démons et les morts-vivants." },
      },
    },
  },
};

const MateriauxRarete = (() => {
  "use strict";

  const ORDRE_RARETE = ["commun", "peu_commun", "rare", "legendaire"];

  function disponiblePour(item) {
    return !!(item && (item.type === "arme" || item.type === "armure"));
  }
  function trouver(materiauId) {
    return MATERIAUX_RARETE[materiauId] || null;
  }

  // Même logique que Affixes._palierEffectif (js/affixes.js) : le palier
  // défini le plus haut parmi ceux ≤ rareteId.
  function _palierEffectif(materiau, rareteId) {
    const idxRarete = ORDRE_RARETE.indexOf(rareteId);
    if (idxRarete < 0) return null;
    let meilleur = null;
    Object.keys(materiau.paliers).forEach((palierId) => {
      const idxPalier = ORDRE_RARETE.indexOf(palierId);
      if (idxPalier >= 0 && idxPalier <= idxRarete && (meilleur === null || idxPalier > ORDRE_RARETE.indexOf(meilleur))) {
        meilleur = palierId;
      }
    });
    return meilleur;
  }

  /**
   * Renvoie une COPIE de `item` avec le matériau appliqué, ou `item`
   * inchangé si materiauId est null/"aucun", l'item n'est ni une arme ni
   * une armure, ou la rareté choisie est trop basse pour ce matériau.
   */
  function appliquer(item, materiauId, rareteId) {
    if (!materiauId || materiauId === "aucun" || !disponiblePour(item)) return item;
    const materiau = trouver(materiauId);
    if (!materiau) return item;
    const palierId = _palierEffectif(materiau, rareteId);
    if (!palierId) return item;
    const palier = materiau.paliers[palierId];
    const sub = item.type === "arme" ? palier.arme : palier.armure;
    if (!sub) return item;

    const clone = Object.assign({}, item, {
      materiau: materiauId,
      materiauNom: materiau.nom,
      effetMateriau: sub.texte,
    });
    if (sub.bonusDegatsCreature) clone.bonusDegatsCreature = sub.bonusDegatsCreature;
    if (sub.reductionDegatsCreature !== undefined) clone.reductionDegatsCreature = sub.reductionDegatsCreature;
    clone.nom = `${item.nom} ${palier.suffixe}`;
    return clone;
  }

  return { LISTE: MATERIAUX_RARETE, disponiblePour, trouver, appliquer };
})();

if (typeof window !== "undefined") {
  window.MATERIAUX_RARETE = MATERIAUX_RARETE;
  window.MateriauxRarete = MateriauxRarete;
}
