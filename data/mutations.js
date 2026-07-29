/* ============================================================
   COF-COMPAGNO — Table des mutations de la Corruption d'Âme (CA).
   Voie du Chaos (homebrew), fournie par Thomas (PDF "Mutations de la
   Corruption d'Âme").

   Quand la CA d'un personnage franchit un palier, on jette 1d6 sur la
   table de ce palier (cf. Personnage.nombrePaliersMutationAtteints() et
   genererMutation() côté app.js). La mutation obtenue est permanente —
   il n'y a pas de retrait automatique si la CA redescend ensuite ; le
   retrait ("purification") reste au choix du joueur/MJ, cf. l'onglet
   Mutations.

   Palier 4 (CA 10, "Rupture") n'a pas de table à tirer : contenu
   explicitement laissé à une discussion joueur/MJ par le document source.
   ============================================================ */

const SEUILS_PALIERS_MUTATION = { 1: 1, 2: 4, 3: 7, 4: 10 };

const TABLE_MUTATIONS = {
  1: {
    nom: "Marques latentes",
    plage: "CA 1-3",
    mutations: [
      { d6: 1, nom: "Iris fracturés", effet: "-1 CHA, +1 Intimidation" },
      { d6: 2, nom: "Voix dédoublée", effet: "+1 Intimidation, -1 Persuasion" },
      { d6: 3, nom: "Veines sombres", effet: "+1 FOR, -1 CHA" },
      { d6: 4, nom: "Odeur de cendre", effet: "-1 Discrétion" },
      { d6: 5, nom: "Frissons chaotiques", effet: "En début de combat, jet de 1d10 : sur un 1, subit 1d4 dégâts" },
      { d6: 6, nom: "Reflet trouble", effet: "+1 Discrétion, -1 CHA en société" },
    ],
  },
  2: {
    nom: "Mutation fonctionnelle",
    plage: "CA 4-6",
    mutations: [
      { d6: 1, nom: "Peau de pierre", effet: "+2 DEF, -2 Persuasion/Représentation" },
      { d6: 2, nom: "Griffes obsidiennes", effet: "1d6 dégâts à mains nues ; bloque l'escamotage ; -2 ATK si maniement d'arme" },
      { d6: 3, nom: "Membre fantôme", effet: "+1 action gratuite/combat (1x) ; jet de CON hors combat ou hallucination" },
      { d6: 4, nom: "Sang noir", effet: "+2 CON, mais soins reçus réduits de -3 sur la valeur ajoutée aux PV" },
      { d6: 5, nom: "Troisième œil (fermé)", effet: "+2 Initiative, -2 CHA si pas de casque équipé" },
      { d6: 6, nom: "Voix de l'abîme", effet: "+2 Intimidation, -3 Persuasion/Bluff" },
    ],
  },
  3: {
    nom: "Mutation lourde",
    plage: "CA 7-9",
    mutations: [
      { d6: 1, nom: "Carapace fissurée", effet: "+4 DEF, -2 DEX, -1 CHA" },
      { d6: 2, nom: "Membre surnuméraire", effet: "+1 attaque gratuite/combat (1x)" },
      { d6: 3, nom: "Brûlure intérieure", effet: "Riposte automatique 1d4 dégâts chaotiques au contact ; perd 1d4 PV par tour de combat" },
      { d6: 4, nom: "Regard pétrifiant", effet: "1x/combat, -4 ATK pour toucher : pétrifie la cible 2 tours (aucune action, aucun déplacement) ; doit porter les yeux bandés en permanence, sous peine d'être poursuivi par la Garde ou l'Inquisition" },
      { d6: 5, nom: "Fragments instables", effet: "+1d10 dégâts par attaque ; à chaque attaque, test de Volonté (1d20 + Mod.CON + Mod.CHA/2) contre DD 13 — en cas d'échec, subit 1d10 dégâts en plus" },
      { d6: 6, nom: "Voix des autres", effet: "+4 Intimidation, -4 Persuasion/Bluff" },
    ],
  },
};

// Palier 4 : pas de table à tirer, texte informatif seul.
const PALIER_4_RUPTURE = {
  nom: "Rupture",
  plage: "CA 10",
  texte: "À détailler séparément : explosion / bascule en monstre / rédemption forcée, au choix du joueur en accord avec le MJ.",
};

if (typeof window !== "undefined") {
  window.SEUILS_PALIERS_MUTATION = SEUILS_PALIERS_MUTATION;
  window.TABLE_MUTATIONS = TABLE_MUTATIONS;
  window.PALIER_4_RUPTURE = PALIER_4_RUPTURE;
}
