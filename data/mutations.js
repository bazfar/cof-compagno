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

   Chiffrage mécanique (caracDelta/competenceDelta/defDelta/initiativeDelta/
   soinsRecusDelta) : ajouté après coup pour les modificateurs CHIFFRÉS et
   PERMANENTS du texte `effet` — lus dynamiquement par Personnage
   (bonusCaracMutations/bonusCompetenceMutations/bonusDefMutations/
   bonusInitiativeMutations, cf. js/personnage.js) exactement comme
   bonusCarac/bonusCompetences sur les objets de loot. Les capacités ACTIVES
   mêlées à certains textes (riposte automatique, action gratuite 1x/combat,
   pétrification, jet de Volonté obligatoire à chaque attaque...) restent
   volontairement narratives : ce sont des mécaniques de jeu à part entière
   (nouvel état, bouton dédié, hook dans la boucle de combat), pas de simples
   variables à faire bouger — même sujettes à un chantier futur si besoin,
   cf. capacités de classe mécanisées une à une dans personnage.js/capacites.js.
   ============================================================ */

const SEUILS_PALIERS_MUTATION = { 1: 1, 2: 4, 3: 7, 4: 10 };

const TABLE_MUTATIONS = {
  1: {
    nom: "Marques latentes",
    plage: "CA 1-3",
    mutations: [
      { d6: 1, nom: "Iris fracturés", effet: "-1 CHA, +1 Intimidation", caracDelta: { CHA: -1 }, competenceDelta: { "Intimidation": 1 } },
      { d6: 2, nom: "Voix dédoublée", effet: "+1 Intimidation, -1 Persuasion", competenceDelta: { "Intimidation": 1, "Persuasion": -1 } },
      { d6: 3, nom: "Veines sombres", effet: "+1 FOR, -1 CHA", caracDelta: { FOR: 1, CHA: -1 } },
      { d6: 4, nom: "Odeur de cendre", effet: "-1 Discrétion", competenceDelta: { "Discrétion": -1 } },
      { d6: 5, nom: "Frissons chaotiques", effet: "En début de combat, jet de 1d10 : sur un 1, subit 1d4 dégâts" },
      // "en société" simplifié en malus permanent (pas de notion de scène sociale
      // vs combat dans l'app — cf. note de chiffrage en tête de fichier).
      { d6: 6, nom: "Reflet trouble", effet: "+1 Discrétion, -1 CHA en société", caracDelta: { CHA: -1 }, competenceDelta: { "Discrétion": 1 } },
    ],
  },
  2: {
    nom: "Mutation fonctionnelle",
    plage: "CA 4-6",
    mutations: [
      { d6: 1, nom: "Peau de pierre", effet: "+2 DEF, -2 Persuasion/Représentation", defDelta: 2, competenceDelta: { "Persuasion": -2, "Représentation": -2 } },
      { d6: 2, nom: "Griffes obsidiennes", effet: "1d6 dégâts à mains nues ; bloque l'escamotage ; -2 ATK si maniement d'arme" },
      { d6: 3, nom: "Membre fantôme", effet: "+1 action gratuite/combat (1x) ; jet de CON hors combat ou hallucination" },
      // caracDelta CON chiffré ; le malus de soin (-3 sur la valeur ajoutée aux
      // PV) est lu par Personnage.appliquerGainPv via soinsRecusDelta.
      { d6: 4, nom: "Sang noir", effet: "+2 CON, mais soins reçus réduits de -3 sur la valeur ajoutée aux PV", caracDelta: { CON: 2 }, soinsRecusDelta: -3 },
      // "-2 CHA si pas de casque équipé" : seul cas conditionnel à l'équipement
      // de la table, testé nommément dans bonusCaracMutations (equipement.tete).
      { d6: 5, nom: "Troisième œil (fermé)", effet: "+2 Initiative, -2 CHA si pas de casque équipé", initiativeDelta: 2 },
      { d6: 6, nom: "Voix de l'abîme", effet: "+2 Intimidation, -3 Persuasion/Bluff", competenceDelta: { "Intimidation": 2, "Persuasion": -3, "Bluff": -3 } },
    ],
  },
  3: {
    nom: "Mutation lourde",
    plage: "CA 7-9",
    mutations: [
      { d6: 1, nom: "Carapace fissurée", effet: "+4 DEF, -2 DEX, -1 CHA", defDelta: 4, caracDelta: { DEX: -2, CHA: -1 } },
      { d6: 2, nom: "Membre surnuméraire", effet: "+1 attaque gratuite/combat (1x)" },
      { d6: 3, nom: "Brûlure intérieure", effet: "Riposte automatique 1d4 dégâts chaotiques au contact ; perd 1d4 PV par tour de combat" },
      { d6: 4, nom: "Regard pétrifiant", effet: "1x/combat, -4 ATK pour toucher : pétrifie la cible 2 tours (aucune action, aucun déplacement) ; doit porter les yeux bandés en permanence, sous peine d'être poursuivi par la Garde ou l'Inquisition" },
      // Le bonus de dégâts (+1d10) est indissociable du risque (test de
      // Volonté obligatoire à CHAQUE attaque, sous peine de dégâts) — les
      // deux nécessitent un hook dans la boucle d'attaque, pas juste un
      // champ de données ; laissé narratif dans son ensemble pour ne pas
      // chiffrer le bonus sans jamais appliquer la contrepartie.
      { d6: 5, nom: "Fragments instables", effet: "+1d10 dégâts par attaque ; à chaque attaque, test de Volonté (1d20 + Mod.CON + Mod.CHA/2) contre DD 13 — en cas d'échec, subit 1d10 dégâts en plus" },
      { d6: 6, nom: "Voix des autres", effet: "+4 Intimidation, -4 Persuasion/Bluff", competenceDelta: { "Intimidation": 4, "Persuasion": -4, "Bluff": -4 } },
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
