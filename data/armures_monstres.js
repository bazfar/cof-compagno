// Catalogue d'armures de monstres — même patron que data/armes_monstres.js :
// le monstre porte un armureId, le catalogue porte la valeur de réduction.
// `naturelle: true` = trait corporel (fourrure, écorce, granit), non retirable.
const ARMURES_MONSTRES = [
  {
    "id": "armure_de_cuir_rapiecee",
    "nom": "Armure de cuir rapiécée",
    "reduction": 1,
    "naturelle": false
  },
  {
    "id": "cottes_de_mailles_de_recuperation",
    "nom": "Cottes de mailles de récupération",
    "reduction": 2,
    "naturelle": false
  },
  {
    "id": "peau_epaisse_et_couche_de_graisse",
    "nom": "Peau épaisse et couche de graisse",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "ecorce_vivante",
    "nom": "Écorce vivante",
    "reduction": 3,
    "naturelle": true,
    "note": "Pas d'effet contre le feu."
  },
  {
    "id": "armure_legionnaire_solaire_plates_cotte",
    "nom": "Armure légionnaire solaire (plates + cotte)",
    "reduction": 5,
    "naturelle": false
  },
  {
    "id": "corps_de_granit",
    "nom": "Corps de granit",
    "reduction": 10,
    "naturelle": true,
    "note": "Vulnérable à la foudre (annule la réduction)."
  },
  {
    "id": "armure_d_ombre_elfique_legere",
    "nom": "Armure d'ombre elfique légère",
    "reduction": 1,
    "naturelle": false
  },
  {
    "id": "fourrure_dense",
    "nom": "Fourrure dense",
    "reduction": 1,
    "naturelle": true
  },
  {
    "id": "fourrure_epaisse_impregnee_de_seve",
    "nom": "Fourrure épaisse imprégnée de Sève",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "fourrure_et_graisse_naturelle",
    "nom": "Fourrure et graisse naturelle",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "fourrure_des_cavernes_tres_dense",
    "nom": "Fourrure des cavernes très dense",
    "reduction": 3,
    "naturelle": true
  },
  {
    "id": "armure_de_guerre_clouee_sur_une_fourrure_epaisse",
    "nom": "Armure de guerre clouée sur une fourrure épaisse",
    "reduction": 5,
    "naturelle": true
  },
  {
    "id": "fourrure_de_seve_peau_durcie_par_des_decennies",
    "nom": "Fourrure de Sève + peau durcie par des décennies",
    "reduction": 6,
    "naturelle": true
  },
  {
    "id": "armure_de_cuir_cloute",
    "nom": "Armure de cuir clouté",
    "reduction": 2,
    "naturelle": false
  },
  {
    "id": "cotte_de_mailles_orque",
    "nom": "Cotte de mailles orque",
    "reduction": 3,
    "naturelle": false
  },
  {
    "id": "aucune_armure_lourde",
    "nom": "Aucune armure lourde",
    "reduction": 2,
    "naturelle": true,
    "note": "Mobilité conservée pour la furie."
  },
  {
    "id": "armure_de_plaques_runiques_liee_a_khoreth",
    "nom": "Armure de plaques runiques liée à Khoreth",
    "reduction": 5,
    "naturelle": false
  },
  {
    "id": "cuir_tanne",
    "nom": "Cuir tanné",
    "reduction": 1,
    "naturelle": false
  },
  {
    "id": "cotte_de_mailles_legere",
    "nom": "Cotte de mailles légère",
    "reduction": 2,
    "naturelle": false
  },
  {
    "id": "armure_composite_cuir_plaques",
    "nom": "Armure composite (cuir + plaques)",
    "reduction": 3,
    "naturelle": false
  },
  {
    "id": "cotte_de_mailles_standard",
    "nom": "Cotte de mailles standard",
    "reduction": 3,
    "naturelle": false
  },
  {
    "id": "demi_armure_de_plates",
    "nom": "Demi-armure de plates",
    "reduction": 4,
    "naturelle": false
  },
  {
    "id": "armure_de_plates_complete",
    "nom": "Armure de plates complète",
    "reduction": 6,
    "naturelle": false
  },
  {
    "id": "armure_de_plates_de_maitre_benie_d_aethar",
    "nom": "Armure de plates de maître, bénie d'Aethar",
    "reduction": 8,
    "naturelle": false
  },
  {
    "id": "armure_de_plates_de_maitre",
    "nom": "Armure de plates de maître",
    "reduction": 8,
    "naturelle": false
  },
  {
    "id": "cuir_tanne_et_rembourrage",
    "nom": "Cuir tanné et rembourrage",
    "reduction": 1,
    "naturelle": true
  },
  {
    "id": "cotte_de_mailles_legere_volee",
    "nom": "Cotte de mailles légère volée",
    "reduction": 3,
    "naturelle": false
  },
  {
    "id": "armure_composite_assemblee_piece_a_piece",
    "nom": "Armure composite assemblée pièce à pièce",
    "reduction": 4,
    "naturelle": false
  },
  {
    "id": "harnois_benis_de_l_ordre",
    "nom": "Harnois bénis de l'Ordre",
    "reduction": 5,
    "naturelle": false
  },
  {
    "id": "harnois_de_capitaine_beni_deux_fois",
    "nom": "Harnois de capitaine, béni deux fois",
    "reduction": 7,
    "naturelle": false
  },
  {
    "id": "harnois_du_concile_beni_par_le_flambeau_supreme_en_personne",
    "nom": "Harnois du Concile, béni par le Flambeau Suprême en personne",
    "reduction": 9,
    "naturelle": false
  },
  {
    "id": "robe_de_clerc",
    "nom": "Robe de clerc",
    "reduction": 1,
    "naturelle": false
  },
  {
    "id": "robe_renforcee_de_plaques_legeres",
    "nom": "Robe renforcée de plaques légères",
    "reduction": 2,
    "naturelle": false
  },
  {
    "id": "harnois_de_l_ordre_grave_du_pont_brise",
    "nom": "Harnois de l'Ordre, gravé du pont brisé",
    "reduction": 5,
    "naturelle": false
  },
  {
    "id": "harnois_de_l_ordre_du_pont_porte_depuis_des_annees",
    "nom": "Harnois de l'Ordre du Pont, porté depuis des années",
    "reduction": 7,
    "naturelle": false
  },
  {
    "id": "peaux_et_cuirs_rapieces",
    "nom": "Peaux et cuirs rapiécés",
    "reduction": 1,
    "naturelle": true
  },
  {
    "id": "cuirasse_de_peaux_cloutees",
    "nom": "Cuirasse de peaux cloutées",
    "reduction": 3,
    "naturelle": true
  },
  {
    "id": "cuir_renforce_de_chasse",
    "nom": "Cuir renforcé de chasse",
    "reduction": 4,
    "naturelle": false
  },
  {
    "id": "fragments_d_armure_de_plaques_fusionnes_a_l_os",
    "nom": "Fragments d'armure de plaques fusionnés à l'os",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "ecorce_et_os_fusionnes",
    "nom": "Écorce et os fusionnés",
    "reduction": 3,
    "naturelle": true,
    "note": "Pas d'effet contre le feu."
  },
  {
    "id": "armure_noircie_fusionnee_a_la_chair_corrompue",
    "nom": "Armure noircie fusionnée à la chair corrompue",
    "reduction": 3,
    "naturelle": true
  },
  {
    "id": "cuir_renforce_cloue_d_or",
    "nom": "Cuir renforcé cloué d'or",
    "reduction": 1,
    "naturelle": false
  },
  {
    "id": "cuirasse_sertie_d_or_et_de_gemmes_volees",
    "nom": "Cuirasse sertie d'or et de gemmes volées",
    "reduction": 3,
    "naturelle": false
  },
  {
    "id": "haillons_offerts_superposes",
    "nom": "Haillons offerts, superposés",
    "reduction": 2,
    "naturelle": false,
    "note": "Des dizaines de vêtements donnés au fil des ans, portés les uns sur les autres — le Roi ne jette jamais ce qu'on lui donne."
  },
  {
    "id": "cuir_epais_et_soies_durcies",
    "nom": "Cuir épais et soies durcies",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "peau_visqueuse_et_muscle",
    "nom": "Peau visqueuse et muscle",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "anneaux_chitineux",
    "nom": "Anneaux chitineux",
    "reduction": 2,
    "naturelle": true
  },
  {
    "id": "carapace_de_faille",
    "nom": "Carapace de Faille",
    "reduction": 3,
    "naturelle": true
  }
];

const ARMURES_MONSTRES_INDEX = Object.fromEntries(ARMURES_MONSTRES.map(function (a) { return [a.id, a]; }));
