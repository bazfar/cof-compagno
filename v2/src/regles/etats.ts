import type { EtatSaisi } from '../lib/schemas/etats';

/*
 * Catalogue des états de la refonte (lot L4.2).
 *
 * Sources : les états cités par la refonte des cinq classes du groupe, les
 * attaques spéciales d'arme et les éléments (doc « Refonte classes et magie
 * — cadre ») ; les chiffres des états repris de la v1 (js/etats.js) sont
 * gardés tels quels.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées, ne pas « corriger ») :
 *   - un état posé par une attaque spéciale d'arme dure 1 round (1a) ;
 *   - Exposé : −2 DEF (2a) ;
 *   - Saignement : 1d6 par tour (3b) ;
 *   - Affaibli : dégâts infligés réduits de 25 %, d'au moins 1 (4) ;
 *   - Déséquilibré : désavantage au prochain jet d'attaque (5b) ;
 *   - avantage et désavantage : 2d20, on garde le meilleur ou le pire (6a) ;
 *   - Dissimulé : les attaques contre lui ont le désavantage ; rompu quand il
 *     attaque (7b) ; il est déclaré par le joueur et validé par le MJ, sans
 *     calcul de ligne de vue (décision antérieure) ;
 *   - Ralenti : déplacement divisé par deux, arrondi au supérieur (8a).
 *
 * Désarmé (lot L4.4b2, Main du mage au palier III) reprend la v1.
 * Leurré, Doublé et Dominé (lot L4.5) viennent des verbes de l'Envoûteur ;
 * Doublé fait rater une attaque par charge. Métamorphosé et Présage
 * viennent de la Transmutation et de la Prescience. Commandé, Apaisé et
 * Banni (lot L4.6) viennent des Cercles du Prêtre ; Apaisé reprend la v1.
 * Maîtrise tactique (lot L4.7) vient de la Voie du soldat (v1 : état
 * `maitrise_tactique`) ; elle dure 2 rounds (décision du 20/10/2026).
 * Silence, Feinté et Ivresse (lot L4.8) viennent du Barde : Silence
 * interdit tout sort (Requiem du silence, 3a) ; Feinté donne l'avantage à la
 * prochaine attaque contre le porteur (Feinte, 8b) ; Ivresse vaut −1 à tous
 * les tests par point, cumulable, jusqu'à la fin de la scène (16a).
 * Déchaîné, Avatar du Vide et Ascension chaotique (lot L4.9) sont les
 * Avatars des Voies du chaos (v1) ; ce qu'ils doublent ou divisent
 * attend le combat (L6), qui lit leur règle.
 *
 * Les formes et avatars de la v1 (Ours, Avatar du Vide…) ne sont plus des
 * états : ils deviennent des actions de leur classe.
 */
export const ETATS: EtatSaisi[] = [
  // ---- Contrôle ----
  {
    id: 'etourdi',
    nom: 'Étourdi',
    categorie: 'controle',
    regle: 'Perd son action ; peut encore se déplacer.',
    agit: 'deplacementSeul',
  },
  {
    id: 'immobilise',
    nom: 'Immobilisé',
    categorie: 'controle',
    regle: 'Ne peut pas se déplacer ; peut attaquer une cible à sa portée.',
    deplacement: 'nul',
  },
  {
    id: 'effroi',
    nom: 'Effroi',
    categorie: 'controle',
    regle: 'Recule de 2 cases quand l’effroi le saisit, puis attaque avec le désavantage.',
    desavantage: ['attaques'],
  },
  {
    id: 'charme',
    nom: 'Charmé',
    categorie: 'controle',
    regle: 'Ne peut pas attaquer celui qui l’a charmé ; la capacité qui le charme dit le reste.',
    parSource: true,
  },
  {
    id: 'fascine',
    nom: 'Fasciné',
    categorie: 'controle',
    regle: 'Reste immobile et n’agit pas ; la fascination se brise s’il est attaqué.',
    agit: 'non',
    deplacement: 'nul',
    rompuPar: ['estAttaque'],
  },
  {
    id: 'endormi',
    nom: 'Endormi',
    categorie: 'controle',
    regle: 'Inconscient ; se réveille au premier dégât subi.',
    agit: 'non',
    deplacement: 'nul',
    rompuPar: ['degatsSubis'],
  },
  {
    id: 'leurre',
    nom: 'Leurré',
    categorie: 'controle',
    regle: 'Doit attaquer le leurre de l’Envoûteur ; l’attaque ne touche rien de réel.',
    parSource: true,
  },
  {
    id: 'leurre_eclatant',
    nom: 'Leurré (éclatant)',
    categorie: 'controle',
    regle: 'Doit attaquer le leurre ; quand il le frappe, le leurre éclate en lumière et Aveugle 1 round tout ce qui l’entoure (rayon 1).',
    parSource: true,
  },
  {
    id: 'metamorphose',
    nom: 'Métamorphosé',
    categorie: 'controle',
    regle: 'Changé en petit animal inoffensif : il se déplace, mais n’attaque pas et ne lance rien.',
    agit: 'deplacementSeul',
  },
  {
    id: 'presage',
    nom: 'Présage',
    categorie: 'malus',
    regle: 'Son prochain jet d’attaque se fait avec le désavantage : l’Envoûteur l’a vu venir.',
    desavantage: ['prochaineAttaque'],
  },
  {
    id: 'commande',
    nom: 'Commandé',
    categorie: 'controle',
    regle: 'Exécute le mot du Prêtre : recule, lâche, à genoux.',
    parSource: true,
  },
  {
    id: 'apaise',
    nom: 'Apaisé',
    categorie: 'controle',
    regle: 'Ne peut pas attaquer, sauf pour se défendre.',
  },
  {
    id: 'banni',
    nom: 'Banni',
    categorie: 'controle',
    regle: 'Renvoyé à la Mer : il quitte le combat.',
    agit: 'non',
    deplacement: 'nul',
    ciblable: false,
  },
  {
    id: 'domine',
    nom: 'Dominé',
    categorie: 'controle',
    regle: 'L’Envoûteur joue son prochain tour.',
    parSource: true,
  },
  {
    id: 'desarme',
    nom: 'Désarmé',
    categorie: 'controle',
    regle: 'Ne peut plus se servir de son arme ; mains nues et sorts restent possibles.',
  },
  {
    id: 'confus',
    nom: 'Confus',
    categorie: 'controle',
    regle: 'Attaque une cible au hasard à chaque tour, alliés compris.',
  },

  // ---- Malus ----
  {
    id: 'silence',
    nom: 'Silence',
    categorie: 'controle',
    regle: 'Ne peut lancer aucun sort ni crier (chant, cri de ralliement).',
    interditSorts: true,
  },
  {
    id: 'expose',
    nom: 'Exposé',
    categorie: 'malus',
    regle: '−2 en DEF.',
    modificateurs: [{ cible: 'DEF', valeur: -2 }],
  },
  {
    id: 'desequilibre',
    nom: 'Déséquilibré',
    categorie: 'malus',
    regle: 'Son prochain jet d’attaque se fait avec le désavantage.',
    desavantage: ['prochaineAttaque'],
  },
  {
    id: 'affaibli',
    nom: 'Affaibli',
    categorie: 'malus',
    regle: 'Les dégâts qu’il inflige sont réduits de 25 %, d’au moins 1.',
    degatsInfliges: { pourcent: 25, minimum: 1 },
  },
  {
    id: 'feinte',
    nom: 'Feinté',
    categorie: 'malus',
    regle: 'La prochaine attaque contre lui se fait avec l’avantage ; l’état tombe à cette attaque.',
    avantage: ['attaquesContre'],
    rompuPar: ['estAttaque'],
  },
  {
    id: 'ivresse',
    nom: 'Ivresse',
    categorie: 'malus',
    regle: '−1 à tous ses tests par point d’Ivresse ; les points s’ajoutent.',
    modificateurs: [{ cible: 'tests', valeur: -1 }],
    cumulable: true,
  },
  {
    id: 'ralenti',
    nom: 'Ralenti',
    categorie: 'malus',
    regle: 'Son déplacement est divisé par deux, arrondi au supérieur.',
    deplacement: 'moitie',
  },
  {
    id: 'aveugle',
    nom: 'Aveuglé',
    categorie: 'malus',
    regle: 'Attaque avec le désavantage et ne peut viser qu’au contact.',
    desavantage: ['attaques'],
    contactSeulement: true,
  },
  {
    id: 'marque',
    nom: 'Marqué',
    categorie: 'malus',
    regle: 'Désigné comme cible ; le bonus contre lui dépend de la capacité qui l’a marqué.',
    parSource: true,
  },
  {
    id: 'influence',
    nom: 'Influencé',
    categorie: 'malus',
    regle: '−2 à une caractéristique choisie par celui qui l’influence.',
    parSource: true,
  },
  {
    id: 'hallucine',
    nom: 'Halluciné',
    categorie: 'malus',
    regle: '−2 en Perception et aux sauvegardes de Volonté.',
    modificateurs: [{ cible: 'sauvegardeVolonte', valeur: -2 }],
  },
  {
    id: 'fatigue',
    nom: 'Fatigué',
    categorie: 'malus',
    regle: '−2 à tous les tests, jusqu’au prochain repos long.',
  },

  // ---- Dégâts dans la durée ----
  {
    id: 'saignement',
    nom: 'Saignement',
    categorie: 'degats',
    regle: 'Perd 1d6 PV au début de chaque tour.',
    degatsParTour: { des: '1d6', typeDegats: 'physique' },
  },
  {
    id: 'brulure',
    nom: 'Brûlure',
    categorie: 'degats',
    regle: 'Subit 1d4 dégâts de feu au début de chaque tour ; une action de mouvement éteint le feu.',
    degatsParTour: { des: '1d4', typeDegats: 'feu' },
    rompuPar: ['actionMouvement'],
  },
  {
    id: 'empoisonne',
    nom: 'Empoisonné',
    categorie: 'degats',
    regle: 'Subit des dégâts de poison au début de chaque tour ; le poison qui l’atteint dit combien.',
    parSource: true,
  },

  // ---- Physique ----
  {
    id: 'renverse',
    nom: 'Renversé',
    categorie: 'physique',
    regle: 'À terre : −4 en DEF ; se relever coûte une action de mouvement.',
    modificateurs: [{ cible: 'DEF', valeur: -4 }],
    rompuPar: ['actionMouvement'],
  },
  {
    id: 'dechainement',
    nom: 'Déchaîné',
    categorie: 'physique',
    regle: 'Chaque tour, Volonté DD 14 ; raté, son attaque vise la créature la plus proche, allié compris.',
  },
  {
    id: 'avatar_du_vide',
    nom: 'Avatar du Vide',
    categorie: 'physique',
    regle: 'Dégâts physiques subis divisés par deux. À la fin : Volonté DD 12, sinon Halluciné 1 round et 1d4 dégâts.',
  },
  {
    id: 'ascension_chaotique',
    nom: 'Ascension chaotique',
    categorie: 'physique',
    regle: 'PV max et bonus de caractéristiques doublés ; réserve de PP doublée et remplie.',
  },
  {
    id: 'maitrise_tactique',
    nom: 'Maîtrise tactique',
    categorie: 'physique',
    regle: 'La posture de combat peut aller jusqu’au double du rang dans la Voie du soldat.',
  },

  // ---- Perception ----
  {
    id: 'dissimule',
    nom: 'Dissimulé',
    categorie: 'perception',
    regle: 'Les attaques contre lui se font avec le désavantage ; l’état tombe quand il attaque. Déclaré par le joueur, validé par le MJ.',
    desavantage: ['attaquesContre'],
    rompuPar: ['sesAttaques'],
  },
  {
    id: 'double',
    nom: 'Doublé',
    categorie: 'perception',
    regle: 'Une illusion le double : chaque charge fait rater une attaque contre lui.',
    annuleAttaquesContre: true,
  },
  {
    id: 'invisible',
    nom: 'Invisible',
    categorie: 'perception',
    regle: 'Ne peut pas être ciblé ; l’invisibilité tombe quand il attaque.',
    ciblable: false,
    rompuPar: ['sesAttaques'],
  },
];
