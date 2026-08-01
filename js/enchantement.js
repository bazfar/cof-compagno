/* ============================================================
   COF-COMPAGNO — Enchantement à risque (onglet Atelier).

   Système de craft magique risqué, indépendant de :
   - Raretes (js/raretes.js)  : variante Rare/Légendaire tirée au loot.
   - Materiaux (js/materiaux.js) : rang Feu appliqué à la mise en jeu.
   Ici, un jet de d20 EN JEU (pas au loot) peut faire progresser une
   arme/armure déjà en possession d'un joueur, avec un risque de
   destruction sur un jet bas — cf. Enchantements.resoudre.

   3 tables de paliers (cf. ENCHANTEMENTS) :
   - generique  : +1 à +5 dégâts (arme). `enchantement` est déjà traité
     comme une valeur ABSOLUE partout ailleurs dans l'app (catalogue,
     Raretes.appliquer qui l'additionne au bonus de rareté) — chaque palier
     réussi le fixe donc directement à sa valeur, aucun risque d'empilement.
   - feu        : rangs 1-3 (arme). Rejoue EXACTEMENT les champs posés par
     Materiaux.appliquer("feu", rang) — materiau/materiauRang/materiauNom/
     degatsFeu/materiauEffet — pour un affichage identique dans l'inventaire,
     que l'arme ait été trouvée enflammée en loot ou enchantée ici.
     item.nomBase mémorise le nom AVANT tout suffixe de matériau : repasser
     un palier supérieur sur la même arme remplace le suffixe au lieu de
     l'empiler ("épée enflammée ardente").
   - protection : +1 à +3 valeurCA (armure). Contrairement à
     `enchantement`, valeurCA est déjà un champ « brut » utilisé tel
     quel ailleurs (calcul de CA, cf. Personnage.calculerCA) : chaque palier
     doit donc reconstruire "valeur d'origine + bonus du palier", jamais
     ajouter au résultat déjà enchanté d'un palier précédent. item.valeurCABase
     mémorise cette valeur d'origine (avant tout palier de CE système), posée
     une seule fois au premier succès et jamais réécrite ensuite.

   Le jet (1d20 BRUT, avant bonus) détermine seul la destruction ; la
   réussite se juge sur jet+bonus vs diff. Les deux sont indépendants : un
   jet bas peut détruire l'objet MÊME si le bonus aurait suffi à réussir.
   ============================================================ */

const ENCHANTEMENTS = {
  generique: {
    label: "Enchantement (arme)",
    appliquePour: (item) => !!(item && item.type === "arme"),
    paliers: [
      { id: 1, diff: 12, tentativesJour: 3, cout: [{ id: "poussiere_fer", qte: 1 }],
        destructionSi: 0, effet: (item) => Object.assign({}, item, { enchantement: 1 }) },
      { id: 2, diff: 14, tentativesJour: 3, cout: [{ id: "poussiere_acier", qte: 1 }],
        destructionSi: 0, effet: (item) => Object.assign({}, item, { enchantement: 2 }) },
      { id: 3, diff: 16, tentativesJour: 2, cout: [{ id: "gemme_magique", qte: 1 }],
        destructionSi: 2, effet: (item) => Object.assign({}, item, { enchantement: 3 }) },
      { id: 4, diff: 18, tentativesJour: 1, cout: [{ id: "gemme_magique", qte: 2 }],
        destructionSi: 5, effet: (item) => Object.assign({}, item, { enchantement: 4 }) },
      { id: 5, diff: 20, tentativesJour: 1, cout: [{ id: "gemme_magique", qte: 3 }, { id: "diamant", qte: 1 }],
        destructionSi: 10, effet: (item) => Object.assign({}, item, {
          enchantement: 5, effetEnchantement: "Ignore en permanence 2 points de reductionDegats de la cible" }) },
    ],
  },
  feu: {
    label: "Enchantement de feu (arme)",
    appliquePour: (item) => !!(item && item.type === "arme"),
    paliers: [
      { id: 1, diff: 12, tentativesJour: 3, cout: [{ id: "poussiere_rubis", qte: 1 }],
        destructionSi: 0, effet: (item) => {
          const base = item.nomBase || item.nom;
          return Object.assign({}, item, {
            materiau: "feu", materiauRang: 1, materiauNom: "enflammée", degatsFeu: "1d4",
            materiauEffet: "+1d4 dégâts de feu", nomBase: base, nom: `${base} enflammée`,
          });
        } },
      { id: 2, diff: 14, tentativesJour: 2, cout: [{ id: "poussiere_rubis", qte: 2 }],
        destructionSi: 0, effet: (item) => {
          const base = item.nomBase || item.nom;
          return Object.assign({}, item, {
            materiau: "feu", materiauRang: 2, materiauNom: "ardente", degatsFeu: "1d6",
            materiauEffet: "+1d6 dégâts de feu", nomBase: base, nom: `${base} ardente`,
          });
        } },
      { id: 3, diff: 16, tentativesJour: 1, cout: [{ id: "poussiere_rubis", qte: 3 }],
        destructionSi: 0, effet: (item) => {
          const base = item.nomBase || item.nom;
          return Object.assign({}, item, {
            materiau: "feu", materiauRang: 3, materiauNom: "incandescente", degatsFeu: "1d8",
            materiauEffet: "+1d8 dégâts de feu", nomBase: base, nom: `${base} incandescente`,
          });
        } },
    ],
  },
  protection: {
    label: "Enchantement de protection (armure)",
    appliquePour: (item) => !!(item && item.type === "armure"),
    paliers: [
      { id: 1, diff: 12, tentativesJour: 3, cout: [{ id: "poussiere_diamant", qte: 1 }],
        destructionSi: 0, effet: (item) => {
          const base = (typeof item.valeurCABase === "number") ? item.valeurCABase : (item.valeurCA || 10);
          return Object.assign({}, item, { valeurCABase: base, valeurCA: base + 1 });
        } },
      { id: 2, diff: 14, tentativesJour: 2, cout: [{ id: "poussiere_diamant", qte: 2 }],
        destructionSi: 0, effet: (item) => {
          const base = (typeof item.valeurCABase === "number") ? item.valeurCABase : (item.valeurCA || 10);
          return Object.assign({}, item, { valeurCABase: base, valeurCA: base + 2 });
        } },
      { id: 3, diff: 16, tentativesJour: 1, cout: [{ id: "poussiere_diamant", qte: 3 }],
        destructionSi: 5, effet: (item) => {
          const base = (typeof item.valeurCABase === "number") ? item.valeurCABase : (item.valeurCA || 10);
          return Object.assign({}, item, { valeurCABase: base, valeurCA: base + 3 });
        } },
    ],
  },
};

const Enchantements = (() => {
  "use strict";

  function trouverSysteme(id) { return ENCHANTEMENTS[id] || null; }
  function trouverPalier(systemeId, palierId) {
    const s = trouverSysteme(systemeId);
    return s ? s.paliers.find((p) => p.id === palierId) : null;
  }
  // Systèmes éligibles pour un item donné (ex. une arme ne se voit jamais
  // proposer "protection", réservé aux armures).
  function systemesDisponibles(item) {
    return Object.keys(ENCHANTEMENTS).filter((id) => ENCHANTEMENTS[id].appliquePour(item));
  }

  // jetBrut : résultat du d20 SEUL (avant bonus) — juge la destruction à lui
  // seul, indépendamment du bonus. bonus : modificateur d'artisan ajouté au
  // jet pour juger la réussite face à palier.diff (jet+bonus >= diff).
  function resoudre(item, systemeId, palierId, jetBrut, bonus) {
    const palier = trouverPalier(systemeId, palierId);
    if (!palier) return { resultat: "erreur", message: "Palier introuvable." };

    if (palier.destructionSi > 0 && jetBrut <= palier.destructionSi) {
      return { resultat: "destruction", message: `${item.nom} est détruit(e) dans l'opération (jet brut ${jetBrut} ≤ ${palier.destructionSi}).` };
    }
    const total = jetBrut + (bonus || 0);
    if (total >= palier.diff) {
      return { resultat: "succes", itemMisAJour: palier.effet(item), message: `Réussite (${total} ≥ ${palier.diff}).` };
    }
    return { resultat: "echec", message: `Échec (${total} < ${palier.diff}) — matériaux perdus, objet intact.` };
  }

  return { LISTE: ENCHANTEMENTS, trouverSysteme, trouverPalier, systemesDisponibles, resoudre };
})();

if (typeof window !== "undefined") {
  window.ENCHANTEMENTS = ENCHANTEMENTS;
  window.Enchantements = Enchantements;
}
