/* ============================================================
   COF-COMPAGNO — Alchimie à risque (onglet Atelier, sous-onglet Alchimie).

   Second volet du système de craft à risque, à côté de l'enchantement
   (js/enchantement.js) : au lieu de faire progresser un objet déjà en
   inventaire, l'alchimie PRODUIT une potion du catalogue loot à partir
   d'ingrédients (fleurs, herbes...). Rien n'est jamais détruit ici (pas
   d'objet à perdre) — un jet catastrophique produit une "Potion ratée"
   à la place de la potion visée, plutôt qu'un échec sec.

   3 familles de recettes (cf. ALCHIMIE) :
   - soin.filieres.seve/flambeau : 3 paliers chacune, potions de soin de
     difficulté croissante (Druide/Prêtre thématiquement, mais l'app ne
     restreint pas par classe — cf. bonus au jet, laissé libre côté UI).
   - utilitaires.recettes : 6 recettes indépendantes (une seule "palier"
     chacune), potions utilitaires diverses.
   - poisons.familles.enduit/dard/piege : 5 paliers chacune (même table de
     potence à chaque palier) ; seuls le potionId produit et le réactif de
     famille changent — cf. js/etats.js (empoisonnee) pour l'état appliqué.

   Chaque palier/recette référence `potionId`, l'id catalogue (data/loot.js)
   de la potion produite en cas de succès — jamais recréé ici, juste
   pointé (cf. js/app.js, ajouterItemInventaire).
   ============================================================ */

const ALCHIMIE = {
  soin: {
    label: "Potions de soin",
    filieres: {
      seve: {
        label: "Sève (Druide)",
        paliers: [
          { id: 1, potionId: "potion_soin_petite", diff: 10, tentativesJour: 5, cout: [{ id: "fleur_seve_naissante", qte: 1 }], rateCritiqueSi: 0 },
          { id: 2, potionId: "potion_soin", diff: 12, tentativesJour: 4, cout: [{ id: "fleur_seve_eclose", qte: 1 }], rateCritiqueSi: 0 },
          { id: 3, potionId: "potion_soin_sup", diff: 14, tentativesJour: 3, cout: [{ id: "fleur_seve_ancienne", qte: 2 }], rateCritiqueSi: 2 },
        ],
      },
      flambeau: {
        label: "Flambeau (Prêtre)",
        paliers: [
          { id: 4, potionId: "potion_soin_benie", diff: 16, tentativesJour: 2, cout: [{ id: "fleur_flambeau", qte: 1 }], rateCritiqueSi: 3 },
          { id: 5, potionId: "potion_soin_grande", diff: 18, tentativesJour: 1, cout: [{ id: "fleur_flambeau_embrasee", qte: 2 }], rateCritiqueSi: 5 },
          { id: 6, potionId: "potion_soin_grande_benie", diff: 20, tentativesJour: 1, cout: [{ id: "fleur_aurore_eternelle", qte: 1 }, { id: "diamant", qte: 1 }], rateCritiqueSi: 8 },
        ],
      },
    },
  },
  utilitaires: {
    label: "Potions utilitaires",
    recettes: [
      { id: "antidote", potionId: "antidote", diff: 10, tentativesJour: 5, cout: [{ id: "herbes_medicinales", qte: 2 }], rateCritiqueSi: 0 },
      { id: "huile_sainte", potionId: "huile_sainte", diff: 12, tentativesJour: 3, cout: [{ id: "fleur_flambeau", qte: 1 }], rateCritiqueSi: 0 },
      { id: "elixir_vision_nocturne", potionId: "elixir_vision_nocturne", diff: 12, tentativesJour: 3, cout: [{ id: "fleur_lune", qte: 1 }], rateCritiqueSi: 0 },
      { id: "fumigene", potionId: "fumigene", diff: 10, tentativesJour: 4, cout: [{ id: "poussiere_fer", qte: 1 }, { id: "herbes_medicinales", qte: 1 }], rateCritiqueSi: 0 },
      { id: "elixir_force", potionId: "elixir_force", diff: 14, tentativesJour: 2, cout: [{ id: "fleur_rugissante", qte: 2 }], rateCritiqueSi: 0 },
      { id: "bombe_alchimique", potionId: "bombe_alchimique", diff: 14, tentativesJour: 2, cout: [{ id: "herbe_feu", qte: 2 }], rateCritiqueSi: 0 },
    ],
  },
  // Table de potence commune aux 3 familles (enduit/dard/piege) : mêmes
  // diff/tentativesJour/rateCritiqueSi à chaque palier, seuls potionId et le
  // réactif de famille changent. formuleDot/dureeEtat ne sont PAS lus par
  // Alchimie.resoudre (qui ignore tout ce qui n'est pas diff/cout/
  // tentativesJour/rateCritiqueSi/itemRateId) : ils servent uniquement à
  // l'affichage de la carte recette et au pré-remplissage de la modale Malus
  // au moment de l'usage (cf. js/app.js, ouvrirModalMalus).
  poisons: {
    label: "Poisons",
    familles: {
      enduit: {
        label: "Enduit d'arme",
        paliers: [
          { id: 1, potionId: "poison_enduit_1", diff: 12, tentativesJour: 3, formuleDot: "1d4", dureeEtat: 2,
            cout: [{ id: "venin_brut", qte: 1 }, { id: "huile_alchimique", qte: 1 }], rateCritiqueSi: 0, itemRateId: "poison_rate" },
          { id: 2, potionId: "poison_enduit_2", diff: 14, tentativesJour: 3, formuleDot: "1d6", dureeEtat: 3,
            cout: [{ id: "venin_brut", qte: 2 }, { id: "huile_alchimique", qte: 1 }], rateCritiqueSi: 0, itemRateId: "poison_rate" },
          { id: 3, potionId: "poison_enduit_3", diff: 16, tentativesJour: 2, formuleDot: "1d8", dureeEtat: 3,
            cout: [{ id: "glande_venimeuse", qte: 1 }, { id: "huile_alchimique", qte: 1 }], rateCritiqueSi: 2, itemRateId: "poison_rate" },
          { id: 4, potionId: "poison_enduit_4", diff: 18, tentativesJour: 1, formuleDot: "1d10", dureeEtat: 4,
            cout: [{ id: "glande_venimeuse", qte: 2 }, { id: "huile_alchimique", qte: 1 }], rateCritiqueSi: 5, itemRateId: "poison_rate" },
          { id: 5, potionId: "poison_enduit_5", diff: 20, tentativesJour: 1, formuleDot: "2d6", dureeEtat: 4,
            cout: [{ id: "fiel_noir", qte: 1 }, { id: "diamant", qte: 1 }, { id: "huile_alchimique", qte: 1 }], rateCritiqueSi: 10, itemRateId: "poison_rate" },
        ],
      },
      dard: {
        label: "Dard / fiole lancée",
        paliers: [
          { id: 1, potionId: "poison_dard_1", diff: 12, tentativesJour: 3, formuleDot: "1d4", dureeEtat: 2,
            cout: [{ id: "venin_brut", qte: 1 }, { id: "fiole_vide", qte: 1 }], rateCritiqueSi: 0, itemRateId: "poison_rate" },
          { id: 2, potionId: "poison_dard_2", diff: 14, tentativesJour: 3, formuleDot: "1d6", dureeEtat: 3,
            cout: [{ id: "venin_brut", qte: 2 }, { id: "fiole_vide", qte: 1 }], rateCritiqueSi: 0, itemRateId: "poison_rate" },
          { id: 3, potionId: "poison_dard_3", diff: 16, tentativesJour: 2, formuleDot: "1d8", dureeEtat: 3,
            cout: [{ id: "glande_venimeuse", qte: 1 }, { id: "fiole_vide", qte: 1 }], rateCritiqueSi: 2, itemRateId: "poison_rate" },
          { id: 4, potionId: "poison_dard_4", diff: 18, tentativesJour: 1, formuleDot: "1d10", dureeEtat: 4,
            cout: [{ id: "glande_venimeuse", qte: 2 }, { id: "fiole_vide", qte: 1 }], rateCritiqueSi: 5, itemRateId: "poison_rate" },
          { id: 5, potionId: "poison_dard_5", diff: 20, tentativesJour: 1, formuleDot: "2d6", dureeEtat: 4,
            cout: [{ id: "fiel_noir", qte: 1 }, { id: "diamant", qte: 1 }, { id: "fiole_vide", qte: 1 }], rateCritiqueSi: 10, itemRateId: "poison_rate" },
        ],
      },
      piege: {
        label: "Ingéré / piège",
        paliers: [
          { id: 1, potionId: "poison_piege_1", diff: 12, tentativesJour: 3, formuleDot: "1d4", dureeEtat: 2,
            cout: [{ id: "venin_brut", qte: 1 }, { id: "poudre_camouflage", qte: 1 }], rateCritiqueSi: 0, itemRateId: "poison_rate" },
          { id: 2, potionId: "poison_piege_2", diff: 14, tentativesJour: 3, formuleDot: "1d6", dureeEtat: 3,
            cout: [{ id: "venin_brut", qte: 2 }, { id: "poudre_camouflage", qte: 1 }], rateCritiqueSi: 0, itemRateId: "poison_rate" },
          { id: 3, potionId: "poison_piege_3", diff: 16, tentativesJour: 2, formuleDot: "1d8", dureeEtat: 3,
            cout: [{ id: "glande_venimeuse", qte: 1 }, { id: "poudre_camouflage", qte: 1 }], rateCritiqueSi: 2, itemRateId: "poison_rate" },
          { id: 4, potionId: "poison_piege_4", diff: 18, tentativesJour: 1, formuleDot: "1d10", dureeEtat: 4,
            cout: [{ id: "glande_venimeuse", qte: 2 }, { id: "poudre_camouflage", qte: 1 }], rateCritiqueSi: 5, itemRateId: "poison_rate" },
          { id: 5, potionId: "poison_piege_5", diff: 20, tentativesJour: 1, formuleDot: "2d6", dureeEtat: 4,
            cout: [{ id: "fiel_noir", qte: 1 }, { id: "diamant", qte: 1 }, { id: "poudre_camouflage", qte: 1 }], rateCritiqueSi: 10, itemRateId: "poison_rate" },
        ],
      },
    },
  },
};

const Alchimie = (() => {
  "use strict";

  function trouverRecetteSoin(filiereId, palierId) {
    const f = ALCHIMIE.soin.filieres[filiereId];
    return f ? f.paliers.find((p) => p.id === palierId) : null;
  }
  function trouverRecetteUtilitaire(recetteId) {
    return ALCHIMIE.utilitaires.recettes.find((r) => r.id === recetteId) || null;
  }
  function trouverRecettePoison(familleId, palierId) {
    const f = ALCHIMIE.poisons.familles[familleId];
    return f ? f.paliers.find((p) => p.id === palierId) : null;
  }

  // jetBrut : d20 seul (avant bonus) — juge à lui seul le brassage raté.
  // bonus : modificateur d'artisan (Druide/Prêtre/artisan PNJ incarné par le
  // MJ) ajouté au jet pour juger la réussite face à recette.diff.
  // Contrairement à Enchantements.resoudre, il n'y a rien à muter/détruire
  // ici : le résultat pointe seulement l'id catalogue à produire (ou null).
  function resoudre(recette, jetBrut, bonus) {
    if (!recette) return { resultat: "erreur", message: "Recette introuvable." };

    if (recette.rateCritiqueSi > 0 && jetBrut <= recette.rateCritiqueSi) {
      const itemRateId = recette.itemRateId || "potion_ratee";
      const messageRate = itemRateId === "potion_ratee"
        ? "une Potion ratée est produite à la place."
        : "un résultat instable est produit à la place.";
      return {
        resultat: "ratee", itemProduitId: itemRateId,
        message: `Brassage raté (jet brut ${jetBrut} ≤ ${recette.rateCritiqueSi}) — ${messageRate}`,
      };
    }
    const total = jetBrut + (bonus || 0);
    if (total >= recette.diff) {
      return { resultat: "succes", itemProduitId: recette.potionId, message: `Réussite (${total} ≥ ${recette.diff}).` };
    }
    return { resultat: "echec", itemProduitId: null, message: `Échec (${total} < ${recette.diff}) — ingrédients perdus, rien produit.` };
  }

  return { LISTE: ALCHIMIE, trouverRecetteSoin, trouverRecetteUtilitaire, trouverRecettePoison, resoudre };
})();

if (typeof window !== "undefined") {
  window.ALCHIMIE = ALCHIMIE;
  window.Alchimie = Alchimie;
}
