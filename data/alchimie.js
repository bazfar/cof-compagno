/* ============================================================
   COF-COMPAGNO — Alchimie à risque : données pures (recettes/paliers).
   Déplacé depuis js/alchimie.js (prompt_recolte_3_alchimie.md, §2) — la
   constante ALCHIMIE elle-même n'est PAS touchée par ce déplacement (aucun
   diff/cout/tentativesJour/rateCritiqueSi/potionId modifié). Le moteur et
   toute l'UI vivent désormais dans js/alchimie.js, sur le patron de
   data/cuisine.js + js/cuisine.js.

   3 familles de recettes :
   - soin.filieres.seve/flambeau : 3 paliers chacune, potions de soin de
     difficulté croissante (Druide/Prêtre thématiquement, mais l'app ne
     restreint pas par classe).
   - utilitaires.recettes : 6 recettes indépendantes (une seule "palier"
     chacune), potions utilitaires diverses.
   - poisons.familles.enduit/dard/piege : 5 paliers chacune (même table de
     potence à chaque palier) ; seuls le potionId produit et le réactif de
     famille changent — cf. js/etats.js (empoisonnee) pour l'état appliqué.

   Chaque palier/recette référence `potionId`, l'id catalogue (data/loot.js)
   de la potion produite en cas de succès — jamais recréé ici, juste
   pointé (cf. js/alchimie.js, App.ajouterAInventaire).
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

if (typeof window !== "undefined") window.ALCHIMIE = ALCHIMIE;
