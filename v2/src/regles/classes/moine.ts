import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie, EffetSaisi } from '../../lib/schemas/effets';

/*
 * Le Moine de la refonte (lot L4.16). Source : doc « Refonte classes et
 * magie — cadre », « Moine — Ki », « Ressources de classe (validé) » et le
 * tableau des techniques du Moine (« Verbes des hybrides (validé) ») ; voies
 * v1 (src/donnees/classes.json) pour l'Élévation, l'Ascétisme et le chaos.
 *
 * Décisions de Thomas du 22/10/2026 (verrouillées) :
 *   - 1a : Ki = 2 + niveau / 3 ; il repart à 1 à chaque combat et revient
 *     de 1 par coup qui touche, 2 par round au plus (le combat, L6) ; le
 *     bouton « Fin du combat » le remet à 1 ; aucune réserve de PP ; DD =
 *     10 + mod de SAG, caractéristique de classe ;
 *   - 2a : classe physique (ni sort mineur ni PP), d8, sans armure ni
 *     bouclier, toutes les armes sauf les armes à feu ;
 *   - 3a : mains nues d6 (niveaux 1 à 4), d8 (5 à 8), 2d6 (9 à 12), + mod
 *     de FOR (v1) ; la Voie des poings v1 (dés, +2 DEF, option d12)
 *     disparaît ;
 *   - 4a : une technique est un coup à mains nues normal ; s'il touche, la
 *     cible sauvegarde contre 10 + mod de SAG, l'état sur un échec ;
 *   - 5a : Voie des poings = les techniques du tableau validé, sans
 *     paliers ; ce sont ses attaques spéciales (pas de famille d'arme en
 *     plus) ;
 *   - 6a : Élévation conservée, sans Ki ; Avalanche 1x/combat, Tempête
 *     parfaite 1x/scénario, la série d'attaques écrite en texte (L6) ;
 *   - 7a : Ascétisme conservé ; Jeûne purificateur 1x/scène (le « 1x/jour »
 *     v1, faute de mieux) ;
 *   - 8a : les souffles portent les sept éléments sans jet de maîtrise ;
 *     psionique, élément de départ (Adepte), pour le reste ;
 *   - 9a : Poing élémentaire (1 Ki), Maîtrise du souffle (+1d6 de
 *     l'élément), Changement de souffle (en réaction), Fusion (2 Ki, deux
 *     effets génériques), Avatar des éléments (1x/scénario) ;
 *   - 10a : Voie du chaos aux signatures du cadre (src/regles/classes/chaos.ts) ;
 *   - 11a : le Second souffle v1 disparaît.
 *
 * Choix du lot, à valider par Thomas :
 *   - états des techniques : 1 round (Ralenti, Renversé, Étourdi), comme
 *     un état d'attaque spéciale ; Cent mains : 8 cibles au plus, une
 *     attaque chacune ;
 *   - Précision instinctive : action mineure ; le test de Perception est
 *     une attaque à la SAG contre la DEF, à 10 cases ; réussi, la cible est
 *     Observée jusqu'à son prochain tour (+2 à sa prochaine attaque contre
 *     elle, lue par le combat) ;
 *   - Illumination du juste : les 3d6 ne touchent que les ennemis de la
 *     zone ; le soin des alliés de la zone est écrit en texte ;
 *   - Avatar des éléments : 3 + mod de SAG rounds.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
const frappe = { type: 'degats', des: 'arme', typeDegats: 'physique' } as const;
const auContact = { type: 'creature', camp: 'ennemi', portee: 'contact' } as const;
const ki = (montant: number) => [{ ressource: 'ki', montant }] as const;
const troisPlusSag = { base: 3, plusModMagie: true } as const;

/** Une technique des poings (4a, 5a) : un coup à mains nues ; touchée, la cible sauvegarde, l'état sur un échec. */
function technique(id: string, nom: string, rang: number, cout: number, sauvegarde: 'FOR' | 'DEX' | 'CON', etat: EffetSaisi, description: string, horsCombat: string): ActionSaisie {
  return {
    id: `moine.${id}`,
    nom,
    description,
    nature: 'technique',
    rang,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    cout: [...ki(cout)],
    armes: ['mainsNues'],
    ciblage: auContact,
    resolution: { jet: 'attaque', sauvegardeSurTouche: sauvegarde },
    effets: [frappe, { ...etat, condition: 'sauvegardeRatee' } as EffetSaisi],
    horsCombat: { paliers: [horsCombat] },
  };
}

/** Une série de coups (Avalanche, Tempête parfaite, 6a) : la première attaque ici, la suite au combat (L6). */
function serie(id: string, nom: string, rang: number, limite: '1x/combat' | '1x/scenario', description: string, texte: string): ActionSaisie {
  return {
    id: `moine.${id}`,
    nom,
    description,
    nature: 'technique',
    rang,
    etiquettes: ['combat'],
    action: 'action',
    limite,
    armes: ['mainsNues'],
    ciblage: auContact,
    resolution: { jet: 'attaque' },
    effets: [frappe, { type: 'narratif', texte, vise: 'lanceur' }],
  };
}

export const ACTIONS_MOINE: ActionSaisie[] = [
  // ---- Classe (3a) ----
  {
    id: 'moine.mains-nues',
    nom: 'Mains nues',
    description: 'Un coup à mains nues : d6 aux niveaux 1 à 4, d8 de 5 à 8, 2d6 de 9 à 12, + mod de FOR.',
    nature: 'technique',
    rang: 1,
    etiquettes: ['combat'],
    action: 'action',
    armes: ['mainsNues'],
    ciblage: auContact,
    resolution: { jet: 'attaque' },
    effets: [frappe],
  },

  // ---- Voie des poings (5a) ----
  technique('frappe-nerveuse', 'Frappe nerveuse', 1, 1, 'CON', { type: 'etat', etat: 'ralenti', duree: { rounds: 1 } }, 'Un coup sur un nerf : la cible est Ralentie 1 round (CON).', 'Immobiliser quelqu’un sans le blesser.'),
  technique('balayage', 'Balayage', 2, 1, 'DEX', { type: 'etat', etat: 'renverse', duree: { rounds: 1 } }, 'Un coup dans les jambes : la cible est Renversée (DEX).', 'Désarmer sans violence.'),
  technique('paume', 'Paume', 3, 2, 'FOR', { type: 'deplacement', sens: 'repousse', cases: 2 }, 'Une paume en pleine poitrine : la cible est repoussée de 2 cases (FOR).', 'Enfoncer une porte.'),
  technique('point-vital', 'Point vital', 4, 2, 'CON', { type: 'etat', etat: 'etourdi', duree: { rounds: 1 } }, 'Un point vital : la cible est Étourdie 1 round (CON).', 'Faire perdre connaissance sans trace.'),
  {
    id: 'moine.cent-mains',
    nom: 'Cent mains',
    description: 'Une fois par combat, pour 2 Ki : une attaque à mains nues contre chaque ennemi adjacent.',
    nature: 'technique',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    cout: [...ki(2)],
    armes: ['mainsNues'],
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'contact', nbCibles: 8 },
    resolution: { jet: 'attaque' },
    effets: [frappe],
  },

  // ---- Voie de l'élévation (6a) ----
  {
    id: 'moine.reflexes-du-sage',
    nom: 'Réflexes du sage',
    description: 'Son mod de SAG s’ajoute à son initiative.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'initiative', valeur: { mod: 'SAG' }, duree: 'permanente', vise: 'lanceur' }],
  },
  {
    id: 'moine.defense-du-corps-libre',
    nom: 'Défense du corps libre',
    description: 'Sans armure, son mod de SAG s’ajoute à sa DEF.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'DEF', valeur: { mod: 'SAG' }, duree: 'permanente', vise: 'lanceur' },
      { type: 'narratif', texte: 'Seulement sans armure.', vise: 'lanceur' },
    ],
  },
  {
    id: 'moine.precision-instinctive',
    nom: 'Précision instinctive',
    description: 'Il observe une cible (SAG contre sa DEF) : réussi, +2 à sa prochaine attaque contre elle.',
    nature: 'capacite',
    rang: 3,
    etiquettes: ['combat'],
    action: 'mineure',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaque' },
    attaquePar: 'SAG',
    effets: [{ type: 'etat', etat: 'observe', duree: 'prochainTour' }],
  },
  serie('avalanche-de-coups', 'Avalanche de coups', 4, '1x/combat', 'Une fois par combat : des coups en série sur la même cible, jusqu’au premier raté.', 'Tant qu’il touche, il frappe encore la même cible ; la série s’arrête au premier raté.'),
  serie(
    'tempete-parfaite',
    'Tempête parfaite',
    5,
    '1x/scenario',
    'Une fois par scénario : des coups en série, jusqu’au deuxième raté de suite ; un critique double ses dés.',
    'Tant qu’il touche, il frappe encore la même cible ; la série s’arrête au deuxième raté de suite ; chaque critique double ses dés.',
  ),

  // ---- Voie de l'ascétisme (7a) ----
  {
    id: 'moine.discipline-du-corps',
    nom: 'Discipline du corps',
    description: 'Il renonce à un confort (silence, jeûne, dénuement) : +2 en Volonté contre la Peur et l’Intimidation.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: '+2 à ses sauvegardes de Volonté contre la Peur et l’Intimidation ; il tient son renoncement.', vise: 'lanceur' }],
  },
  {
    id: 'moine.poing-beni',
    nom: 'Poing béni',
    description: 'Une fois par combat : +1d6 sacrés à sa prochaine frappe, +2d6 contre un démon, un mort-vivant ou une créature corrompue.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat'],
    action: 'gratuite',
    limite: '1x/combat',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'degats', valeur: '1d6', typeDegats: 'sacre', consomme: 'prochaineFrappe', duree: 'finCombat', vise: 'lanceur' },
      { type: 'narratif', texte: 'Contre un démon, un mort-vivant ou une créature corrompue : +2d6 au lieu de +1d6.', vise: 'lanceur' },
    ],
  },
  {
    id: 'moine.jeune-purificateur',
    nom: 'Jeûne purificateur',
    description: 'Une fois par scène, par le toucher : il retire un état néfaste, sur lui ou sur un allié au contact.',
    nature: 'capacite',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/scene',
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: sansJet,
    effets: [{ type: 'retraitEtat', etats: [], nombre: 1 }],
    horsCombat: { paliers: ['Retirer un état néfaste, à lui ou à un allié.'] },
  },
  {
    id: 'moine.voeu-inebranlable',
    nom: 'Vœu inébranlable',
    description: 'Avantage contre la corruption, la possession et la manipulation mentale.',
    nature: 'passif',
    rang: 4,
    etiquettes: ['combat', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Avantage à ses jets contre la corruption, la possession et la manipulation mentale.', vise: 'lanceur' }],
  },
  {
    id: 'moine.illumination-du-juste',
    nom: 'Illumination du juste',
    description: 'Une fois par scénario, un éclat sacré à 1 case autour de lui : 3d6 sacrés aux ennemis (doublés contre démons et morts-vivants) ; lui et ses alliés de la zone regagnent 1d6 + SAG PV.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 1, origine: 'lanceur', filtre: 'ennemis' },
    resolution: sansJet,
    effets: [
      { type: 'degats', des: '3d6', typeDegats: 'sacre', doubleContre: 'demonsMortsVivants', vise: 'zone' },
      { type: 'soin', des: '1d6', plusMod: true, vise: 'lanceur' },
      { type: 'narratif', texte: 'Ses alliés dans la zone regagnent aussi 1d6 + mod de SAG PV.', vise: 'lanceur' },
    ],
  },

  // ---- Voie des souffles (8a, 9a) ----
  {
    id: 'moine.poing-elementaire',
    nom: 'Poing élémentaire',
    description: 'Pour 1 Ki, un coup à mains nues qui porte l’effet générique d’un élément, au choix parmi les sept.',
    nature: 'technique',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    cout: [...ki(1)],
    armes: ['mainsNues'],
    ciblage: auContact,
    resolution: { jet: 'attaque' },
    effets: [frappe],
    element: { application: 'ciblePrincipale' },
    horsCombat: { paliers: ['Allumer, geler, mouiller au contact.'] },
  },
  {
    id: 'moine.fusion',
    nom: 'Fusion',
    description: 'Pour 2 Ki, un coup à mains nues qui porte deux éléments : leurs deux effets génériques.',
    nature: 'technique',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    cout: [...ki(2)],
    armes: ['mainsNues'],
    ciblage: auContact,
    resolution: { jet: 'attaque' },
    effets: [frappe],
    element: { application: 'ciblePrincipale' },
  },
  {
    id: 'moine.avatar-des-elements',
    nom: 'Avatar des éléments',
    description: 'Une fois par scénario, 3 + mod de SAG rounds : +4 DEF ; chaque coup à mains nues porte deux éléments sans Ki ; immunisé à Repoussé et Renversé.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'DEF', valeur: 4, duree: troisPlusSag, vise: 'lanceur' },
      { type: 'etat', etat: 'avatar_des_elements', duree: troisPlusSag, vise: 'lanceur' },
    ],
  },
];

export const VOIES_MOINE: VoieSaisie[] = [
  {
    id: 'moine.poings',
    nom: 'Voie des poings',
    description: 'Ses techniques : des coups ordinaires qui portent un état.',
    rangs: [
      { rang: 1, nom: 'Frappe nerveuse', description: '1 Ki : Ralenti 1 round (CON).', actions: ['moine.frappe-nerveuse'] },
      { rang: 2, nom: 'Balayage', description: '1 Ki : Renversé (DEX).', actions: ['moine.balayage'] },
      { rang: 3, nom: 'Paume', description: '2 Ki : repoussé de 2 cases (FOR).', actions: ['moine.paume'] },
      { rang: 4, nom: 'Point vital', description: '2 Ki : Étourdi 1 round (CON).', actions: ['moine.point-vital'] },
      { rang: 5, nom: 'Cent mains', description: '2 Ki, 1x/combat : une attaque sur chaque ennemi adjacent.', actions: ['moine.cent-mains'] },
    ],
  },
  {
    id: 'moine.elevation',
    nom: 'Voie de l’élévation',
    description: 'La sagesse dans le corps : vitesse, garde et coups en série.',
    rangs: [
      { rang: 1, nom: 'Réflexes du sage', description: '+ mod de SAG en initiative.', actions: ['moine.reflexes-du-sage'] },
      { rang: 2, nom: 'Défense du corps libre', description: 'Sans armure : + mod de SAG en DEF.', actions: ['moine.defense-du-corps-libre'] },
      { rang: 3, nom: 'Précision instinctive', description: 'Observer une cible : +2 à la prochaine attaque.', actions: ['moine.precision-instinctive'] },
      { rang: 4, nom: 'Avalanche de coups', description: '1x/combat, coups en série jusqu’au premier raté.', actions: ['moine.avalanche-de-coups'] },
      { rang: 5, nom: 'Tempête parfaite', description: '1x/scénario, jusqu’au deuxième raté de suite.', actions: ['moine.tempete-parfaite'] },
    ],
  },
  {
    id: 'moine.ascetisme',
    nom: 'Voie de l’ascétisme',
    description: 'Le renoncement qui purifie, et la lumière qui frappe le mal.',
    rangs: [
      { rang: 1, nom: 'Discipline du corps', description: '+2 en Volonté contre la Peur et l’Intimidation.', actions: ['moine.discipline-du-corps'] },
      { rang: 2, nom: 'Poing béni', description: '1x/combat, +1d6 sacrés (+2d6 contre le mal).', actions: ['moine.poing-beni'] },
      { rang: 3, nom: 'Jeûne purificateur', description: '1x/scène, retirer un état néfaste.', actions: ['moine.jeune-purificateur'] },
      { rang: 4, nom: 'Vœu inébranlable', description: 'Avantage contre corruption, possession, manipulation.', actions: ['moine.voeu-inebranlable'] },
      { rang: 5, nom: 'Illumination du juste', description: '1x/scénario, éclat sacré et soin.', actions: ['moine.illumination-du-juste'] },
    ],
  },
  {
    id: 'moine.souffles',
    nom: 'Voie des souffles',
    description: 'Les sept éléments dans les poings, sans jet de maîtrise.',
    rangs: [
      { rang: 1, nom: 'Poing élémentaire', description: '1 Ki : un coup qui porte l’effet d’un élément.', actions: ['moine.poing-elementaire'] },
      {
        rang: 2,
        nom: 'Maîtrise du souffle',
        description: 'Un coup à mains nues qui porte un élément gagne +1d6 de cet élément.',
        regles: [{ type: 'capacite', nom: 'maitriseDuSouffle' }],
      },
      {
        rang: 3,
        nom: 'Changement de souffle',
        description: 'Changer d’élément en réaction.',
        regles: [{ type: 'texte', texte: 'Changement de souffle : en réaction, il change l’élément d’un Poing élémentaire annoncé, avant le jet.' }],
      },
      { rang: 4, nom: 'Fusion', description: '2 Ki : deux éléments sur un coup.', actions: ['moine.fusion'] },
      { rang: 5, nom: 'Avatar des éléments', description: '1x/scénario : +4 DEF, deux éléments par coup sans Ki.', actions: ['moine.avatar-des-elements'] },
    ],
  },
];

export const MOINE: ClasseSaisie = {
  id: 'moine',
  nom: 'Moine',
  famille: 'physique',
  deVie: 8,
  caracMagie: 'SAG',
  ressourceDeClasse: { ressource: 'ki', base: 2, diviseurNiveau: 3, recharge: 'chaqueCombat', debutCombat: 1, parTouche: { montant: 1, parRound: 2 } },
  mainsNues: [
    { niveau: 1, des: '1d6' },
    { niveau: 5, des: '1d8' },
    { niveau: 9, des: '2d6' },
  ],
  actionsDeClasse: ['moine.mains-nues'],
  voies: ['moine.poings', 'moine.elevation', 'moine.ascetisme', 'moine.souffles', 'moine.chaos'],
  creation: { elements: ['psionique'] },
  mineurs: { liste: [], creation: 0, plusUnAuNiveau: [] },
};
