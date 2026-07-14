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
      { d6: 1, nom: "Iris fracturés", effet: "-2 CHA face à des inconnus, mais +2 pour intimider" },
      { d6: 2, nom: "Voix dédoublée", effet: "-2 en négociation ; mais on se souvient de lui (réputation marquante)" },
      { d6: 3, nom: "Veines sombres", effet: "Aucun effet mécanique — détectable par examen médical ou magique" },
      { d6: 4, nom: "Odeur de cendre", effet: "-2 discrétion face aux créatures à l'odorat fin ; animaux sauvages l'évitent instinctivement" },
      { d6: 5, nom: "Frissons chaotiques", effet: "En début de combat, 1 sur 1d10 : +1 CS automatique avant le premier sort" },
      { d6: 6, nom: "Reflet trouble", effet: "-2 CHA au premier contact avec un PNJ observateur/méfiant (prêtre, érudit...)" },
    ],
  },
  2: {
    nom: "Mutation fonctionnelle",
    plage: "CA 4-6",
    mutations: [
      { d6: 1, nom: "Peau de pierre", effet: "+2 DEF naturelle ; désavantage aux tests sociaux avec des inconnus" },
      { d6: 2, nom: "Griffes obsidiennes", effet: "+1d4 DM à mains nues ; ne peut plus crocheter, écrire finement ou porter de gants" },
      { d6: 3, nom: "Membre fantôme", effet: "1x/combat : action gratuite supplémentaire (parade, ramasser) ; hallucinations occasionnelles hors combat" },
      { d6: 4, nom: "Sang noir", effet: "Résistance aux poisons ; soigneurs/PNJ hésitent à le toucher en le voyant saigner" },
      { d6: 5, nom: "Troisième œil (fermé)", effet: "+2 Initiative ; doit le dissimuler en société (sinon -4 CHA)" },
      { d6: 6, nom: "Voix de l'abîme", effet: "+2 Intimidation ; -4 en séduction ou négociation pacifique" },
    ],
  },
  3: {
    nom: "Mutation lourde",
    plage: "CA 7-9",
    mutations: [
      { d6: 1, nom: "Carapace fissurée", effet: "+4 DEF, -2 DEX ; 1x/combat, jet de Volonté ou attaque la cible la plus proche (allié ou ennemi)" },
      { d6: 2, nom: "Membre surnuméraire", effet: "Attaque/action gratuite secondaire limitée (1x/tour) ; effraie systématiquement civils et animaux" },
      { d6: 3, nom: "Brûlure intérieure", effet: "Riposte automatique 1d4 DM chaotique au contact ; perd 1 PV par tour de combat" },
      { d6: 4, nom: "Regard pétrifiant", effet: "1x/combat : un ennemi croisant son regard fait un jet de Volonté ou est Effrayé 1 tour ; banni de la plupart des lieux civilisés/sacrés" },
      { d6: 5, nom: "Fragments instables", effet: "+1d6 DM à toutes les attaques magiques ; à chaque sort, jet de Volonté ou subit en plus un effet du Palier 1" },
      { d6: 6, nom: "Voix des autres", effet: "1x/session : relance un jet raté ; le MJ peut faire parler la voix à voix haute en pleine scène sociale" },
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
