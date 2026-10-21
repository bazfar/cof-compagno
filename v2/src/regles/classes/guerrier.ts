import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Le Guerrier de la refonte (lot L4.7), pilote des classes physiques.
 * Source : doc « Refonte classes et magie — cadre », « Classes physiques »,
 * « Ressources de classe (validé) » et « Guerrier (pilote) » ; voies v1
 * (src/donnees/classes.json) pour ce que le cadre garde.
 *
 * Décisions verrouillées :
 *   - Endurance = 3 + niveau / 3, rechargée au repos court ; +1 quand il
 *     subit des dégâts (une fois par round), +2 au Second souffle ;
 *     l'attaque spéciale coûte 2, 1 avec Maniement expert (validé) ;
 *   - attaques spéciales de toutes les familles d'armes (src/regles/armes.ts) ;
 *   - une seule réaction par round, partagée entre l'attaque d'opportunité
 *     et les réactions de voie (décision du 20/10/2026) ;
 *   - Soldat, Peuple et Ingénieur conservés ; l'Élite devient la Voie du
 *     maître d'armes (2b) ; Fils du village devient une Riposte : attaque
 *     gratuite contre l'ennemi qui attaque un allié au contact (doc de
 *     cadre), au jet d'attaque normal (5a) ; Rempart devient Pilier du
 *     village ;
 *   - Maîtrise tactique (Soldat 5) : 1 fois par combat, posture doublée
 *     pendant 2 rounds ; changement de posture en réaction, 1 fois par
 *     round (décision du 20/10/2026) ;
 *   - décisions de Thomas du 21/10/2026 : critique sur 20 naturel, dés de
 *     l'arme doublés (4a) ; Second souffle 1 fois par combat, en action
 *     mineure : 2d6 + mod de CON en PV et +2 Endurance (7a) ; l'Ingénieur
 *     reste une voie du Guerrier (8a) ; Coup double au coût normal (10a ; ainsi
 *     nommé au lot L4.8, l'Enchaînement restant au Barde : 9a) ;
 *     mods de caractéristique lus par leur nom (12a).
 * Chiffres repris de la v1 : Posture de combat (jusqu'au rang en malus et
 * autant en bonus), Prouesse (1d4 PV pour +5), Cri du rassemblement
 * (7 cases, 1d6 + CON en PV temporaires, +2 en attaque 2 rounds), Le héros
 * qu'on n'oublie pas (−4 à tous ses tests), pièges (DEX contre la DEF,
 * 1d6 puis 2d6, Ralenti 3 rounds), barricade (10 + niveau PV, +4 DEF à
 * distance et +2 au contact), Bastion (+2 DEF).
 * La Voie du chaos est dans src/regles/classes/chaos.ts (lot L4.9) ; la Sensibilité élémentaire (don
 * du niveau 4) viendra avec les dons.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;

export const ACTIONS_GUERRIER: ActionSaisie[] = [
  // ---- Voie du soldat ----
  {
    id: 'guerrier.posture-de-combat',
    nom: 'Posture de combat',
    description: 'Au début de son tour : jusqu’à son rang dans la voie en malus sur l’attaque, la DEF ou les dégâts, et autant en bonus sur un autre, jusqu’à son prochain tour.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'gratuite',
    limite: '1x/round',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'posture', axes: ['attaque', 'DEF', 'degats'], vise: 'lanceur' }],
  },
  {
    id: 'guerrier.combat-en-phalange',
    nom: 'Combat en phalange',
    description: '+1 DEF par allié à son contact.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 1, duree: 'permanente', parAllieAuContact: true, vise: 'lanceur' }],
  },
  {
    id: 'guerrier.second-souffle',
    nom: 'Second souffle',
    description: 'Une fois par combat, en action mineure : il reprend son souffle, 2d6 + mod de CON en PV et +2 Endurance.',
    nature: 'capacite',
    rang: 3,
    etiquettes: ['combat'],
    action: 'mineure',
    limite: '1x/combat',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'soin', des: '2d6', mod: 'CON', vise: 'lanceur' },
      { type: 'ressource', ressource: 'endurance', montant: 2, vise: 'lanceur' },
    ],
  },
  {
    id: 'guerrier.prouesse',
    nom: 'Prouesse',
    description: 'Une fois par round, il sacrifie 1d4 PV pour +5 à son prochain test.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'gratuite',
    limite: '1x/round',
    sacrifice: { des: '1d4' },
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'prochainJet', valeur: 5, duree: 'prochainTour', vise: 'lanceur' }],
  },
  {
    id: 'guerrier.maitrise-tactique',
    nom: 'Maîtrise tactique',
    description: 'Une fois par combat : pendant 2 rounds, sa posture de combat peut aller jusqu’au double de son rang.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'etat', etat: 'maitrise_tactique', duree: { rounds: 2 }, vise: 'lanceur' }],
  },
  {
    id: 'guerrier.changement-de-posture',
    nom: 'Changement de posture',
    description: 'Une fois par round, hors de son tour : il change de posture, en réaction.',
    nature: 'reaction',
    rang: 5,
    etiquettes: ['combat'],
    action: 'reaction',
    limite: '1x/round',
    declencheur: 'aToutMoment',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'posture', axes: ['attaque', 'DEF', 'degats'], vise: 'lanceur' }],
  },

  // ---- Voie du peuple ----
  {
    id: 'guerrier.riposte',
    nom: 'Riposte',
    description: 'Un ennemi attaque un allié à son contact : il le frappe, d’une attaque gratuite qui prend la réaction du round.',
    nature: 'reaction',
    rang: 1,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'allieAttaqueAuContact',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [{ type: 'degats', des: 'arme', typeDegats: 'physique' }],
  },
  {
    id: 'guerrier.l-exemple',
    nom: 'L’exemple',
    description: 'Tant qu’il reste immobile ce tour, les alliés à 2 cases de lui gagnent +1 DEF.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 2, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 1, duree: 'prochainTour', condition: 'immobile', vise: 'zone' }],
  },
  {
    id: 'guerrier.pilier-du-village',
    nom: 'Pilier du village',
    description: 'Il réduit de 2 les dégâts qu’il subit quand il protège activement un allié (déclaré par le joueur).',
    nature: 'passif',
    rang: 3,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'reductionDegats', valeur: 2, duree: 'permanente', condition: 'protegeUnAllie', vise: 'lanceur' }],
  },
  {
    id: 'guerrier.cri-du-rassemblement',
    nom: 'Cri du rassemblement',
    description: 'Une fois par combat : les alliés à 7 cases gagnent 1d6 + mod de CON en PV temporaires et +2 en attaque pendant 2 rounds.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 7, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    effets: [
      { type: 'pvTemp', des: '1d6', mod: 'CON', vise: 'zone' },
      { type: 'bonus', cible: 'attaque', valeur: 2, duree: { rounds: 2 }, vise: 'zone' },
    ],
  },
  {
    id: 'guerrier.heros-qu-on-n-oublie-pas',
    nom: 'Le héros qu’on n’oublie pas',
    description: 'Une fois par scénario : un allié à 2 cases va tomber ; il prend le coup à sa place. S’il survit, −4 à tous ses tests jusqu’à la fin du combat.',
    nature: 'reaction',
    rang: 5,
    etiquettes: ['combat'],
    action: 'reaction',
    limite: '1x/scenario',
    declencheur: 'allieTombe',
    ciblage: { type: 'creature', camp: 'allie', portee: 2 },
    resolution: sansJet,
    effets: [
      { type: 'narratif', texte: 'Le Guerrier encaisse à sa place les dégâts entiers qui l’auraient fait tomber.' },
      { type: 'bonus', cible: 'tests', valeur: -4, duree: 'finCombat', vise: 'lanceur' },
    ],
  },

  // ---- Voie de l'ingénieur ----
  {
    id: 'guerrier.piege-de-fortune',
    nom: 'Piège de fortune',
    description: 'En action mineure, il pose un piège à usage unique sur une case adjacente. Un ennemi qui y finit son déplacement : DEX contre sa DEF ; touché, 1d6 et Ralenti 3 rounds.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'mineure',
    attaquePar: 'DEX',
    ciblage: { type: 'point', portee: 'contact' },
    zone: { forme: 'carre', taille: 1, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'attaque' },
    persistance: { type: 'zone', duree: 'finCombat', quand: 'finDeplacement' },
    effets: [
      { type: 'degats', des: '1d6', typeDegats: 'physique', vise: 'zone' },
      { type: 'etat', etat: 'ralenti', duree: { rounds: 3 }, vise: 'zone' },
      { type: 'narratif', texte: 'Usage unique : le piège disparaît une fois déclenché.', vise: 'lanceur' },
    ],
  },
  {
    id: 'guerrier.terrain-favorable',
    nom: 'Terrain favorable',
    description: 'Une case à 6 cases devient un terrain difficile pendant 3 rounds, pour les ennemis seulement.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'carre', taille: 1, origine: 'point', filtre: 'ennemis' },
    resolution: sansJet,
    persistance: { type: 'zone', duree: { rounds: 3 } },
    effets: [
      { type: 'terrain', nature: 'difficile', duree: { rounds: 3 } },
      { type: 'narratif', texte: 'Le terrain ne gêne que les ennemis.', vise: 'lanceur' },
    ],
  },
  {
    id: 'guerrier.fortification-de-fortune',
    nom: 'Fortification de fortune',
    description: 'Une barricade improvisée sur une case adjacente (10 + niveau PV) : les alliés abrités gagnent +4 DEF à distance et +2 au contact.',
    nature: 'capacite',
    rang: 3,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'point', portee: 'contact' },
    resolution: sansJet,
    effets: [{ type: 'invocation', creature: 'barricade', duree: 'finCombat' }],
  },
  {
    id: 'guerrier.champ-de-pieges',
    nom: 'Champ de pièges',
    description: 'En une action, jusqu’à 3 pièges sur des cases adjacentes. Chacun : DEX contre la DEF, 2d6 et Ralenti 3 rounds.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    attaquePar: 'DEX',
    ciblage: { type: 'point', portee: 'contact', nbCibles: 3 },
    zone: { forme: 'carre', taille: 1, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'attaque' },
    persistance: { type: 'zone', duree: 'finCombat', quand: 'finDeplacement' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'physique', vise: 'zone' },
      { type: 'etat', etat: 'ralenti', duree: { rounds: 3 }, vise: 'zone' },
      { type: 'narratif', texte: 'Usage unique : chaque piège disparaît une fois déclenché.', vise: 'lanceur' },
    ],
  },
  {
    id: 'guerrier.bastion-improvise',
    nom: 'Bastion improvisé',
    description: 'Une fois par combat : la zone de 3 × 3 cases autour de lui devient un bastion jusqu’à la fin du combat. Les alliés dedans ont +2 DEF ; tout ennemi qui y entre subit une attaque d’opportunité.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: surSoi,
    zone: { forme: 'carre', taille: 3, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    persistance: { type: 'zone', duree: 'finCombat', quand: 'debutTour' },
    effets: [
      { type: 'bonus', cible: 'DEF', valeur: 2, duree: 'prochainTour', vise: 'zone' },
      { type: 'narratif', texte: 'Tout ennemi qui entre dans le bastion subit une attaque d’opportunité du Guerrier, qui ne prend pas sa réaction du round.', vise: 'lanceur' },
    ],
  },
];

export const VOIES_GUERRIER: VoieSaisie[] = [
  {
    id: 'guerrier.soldat',
    nom: 'Voie du soldat',
    description: 'Souplesse tactique et combat en groupe.',
    rangs: [
      { rang: 1, nom: 'Posture de combat', description: 'Jusqu’à son rang en malus sur un axe, autant en bonus sur un autre.', actions: ['guerrier.posture-de-combat'], regles: [{ type: 'capacite', nom: 'postureDeCombat', limite: '1x/round' }] },
      { rang: 2, nom: 'Combat en phalange', description: '+1 DEF par allié au contact.', actions: ['guerrier.combat-en-phalange'] },
      { rang: 3, nom: 'Second souffle', description: '1x/combat : 2d6 + CON en PV, +2 Endurance.', actions: ['guerrier.second-souffle'] },
      { rang: 4, nom: 'Prouesse', description: '1d4 PV pour +5 à un test.', actions: ['guerrier.prouesse'] },
      {
        rang: 5,
        nom: 'Maîtrise tactique',
        description: '1x/combat, posture doublée 2 rounds ; changement de posture en réaction, 1x/round.',
        actions: ['guerrier.maitrise-tactique', 'guerrier.changement-de-posture'],
        regles: [{ type: 'capacite', nom: 'maitriseTactique', limite: '1x/combat' }],
      },
    ],
  },
  {
    id: 'guerrier.peuple',
    nom: 'Voie du peuple',
    description: 'Un défenseur né du peuple : sa force vient de ceux qu’il protège.',
    rangs: [
      {
        rang: 1,
        nom: 'Fils du village',
        description: 'Riposte contre l’ennemi qui attaque un allié au contact ; +2 CHA avec les gens du peuple.',
        actions: ['guerrier.riposte'],
        regles: [{ type: 'texte', texte: 'Fils du village : +2 en CHA avec les gens du peuple, hors combat.' }],
      },
      { rang: 2, nom: 'L’exemple', description: 'Immobile, +1 DEF aux alliés à 2 cases.', actions: ['guerrier.l-exemple'] },
      { rang: 3, nom: 'Pilier du village', description: '−2 aux dégâts subis en protégeant un allié.', actions: ['guerrier.pilier-du-village'] },
      { rang: 4, nom: 'Cri du rassemblement', description: '1x/combat : PV temporaires et +2 en attaque aux alliés à 7 cases.', actions: ['guerrier.cri-du-rassemblement'] },
      { rang: 5, nom: 'Le héros qu’on n’oublie pas', description: '1x/scénario : prendre le coup qui ferait tomber un allié.', actions: ['guerrier.heros-qu-on-n-oublie-pas'] },
    ],
  },
  {
    id: 'guerrier.maitre-d-armes',
    nom: 'Voie du maître d’armes',
    description: 'L’ex-Élite : la maîtrise des attaques spéciales.',
    rangs: [
      { rang: 1, nom: 'Maniement expert', description: 'Les attaques spéciales coûtent 1 Endurance de moins.', regles: [{ type: 'capacite', nom: 'maniementExpert' }] },
      { rang: 2, nom: 'Spécimen d’élite', description: '+1 en FOR, DEX ou CON, choisi à l’acquisition.', regles: [{ type: 'caracEnPlus', parmi: ['FOR', 'DEX', 'CON'], valeur: 1 }] },
      { rang: 3, nom: 'Précision létale', description: 'Critique sur 19–20 ; l’état d’une attaque spéciale dure 1 round de plus.', regles: [{ type: 'capacite', nom: 'precisionLetale' }] },
      { rang: 4, nom: 'Coup double', description: 'Une attaque spéciale qui touche en permet une seconde, au coût normal.', regles: [{ type: 'capacite', nom: 'coupDouble' }] },
      { rang: 5, nom: 'Coup de maître', description: '1x/combat, une attaque spéciale pose deux états, ou porte l’arme et un élément.', regles: [{ type: 'capacite', nom: 'coupDeMaitre', limite: '1x/combat' }] },
    ],
  },
  {
    id: 'guerrier.ingenieur',
    nom: 'Voie de l’ingénieur',
    description: 'Pièges et terrain au service du groupe, du piège isolé au champ de bataille retourné.',
    rangs: [
      { rang: 1, nom: 'Piège de fortune', description: 'Un piège : DEX contre la DEF, 1d6 et Ralenti.', actions: ['guerrier.piege-de-fortune'] },
      { rang: 2, nom: 'Terrain favorable', description: 'Terrain difficile pour les ennemis, 3 rounds.', actions: ['guerrier.terrain-favorable'] },
      { rang: 3, nom: 'Fortification de fortune', description: 'Une barricade qui abrite les alliés.', actions: ['guerrier.fortification-de-fortune'] },
      { rang: 4, nom: 'Champ de pièges', description: 'Jusqu’à 3 pièges de 2d6 en une action.', actions: ['guerrier.champ-de-pieges'] },
      { rang: 5, nom: 'Bastion improvisé', description: '1x/combat : +2 DEF aux alliés dans la zone, attaque d’opportunité sur qui y entre.', actions: ['guerrier.bastion-improvise'] },
    ],
  },
];

export const GUERRIER: ClasseSaisie = {
  id: 'guerrier',
  nom: 'Guerrier',
  famille: 'physique',
  deVie: 10,
  ressourceDeClasse: { ressource: 'endurance', base: 3, diviseurNiveau: 3, recharge: 'reposCourt', parDegatsSubis: 1 },
  attaquesSpeciales: { familles: 'toutes', cout: { ressource: 'endurance', montant: 2 } },
  voies: ['guerrier.soldat', 'guerrier.peuple', 'guerrier.maitre-d-armes', 'guerrier.ingenieur', 'guerrier.chaos'],
  creation: {},
  mineurs: { liste: [], creation: 0, plusUnAuNiveau: [] },
};
