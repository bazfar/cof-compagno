import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie, EffetSaisi } from '../../lib/schemas/effets';

/*
 * Le Druide de la refonte (lot L4.15). Source : doc « Refonte classes et
 * magie — cadre », « Druide — Force de la nature », « Ressources de classe
 * (validé) » et « Verbes des hybrides (validé) » (verbes et formes) ; voies
 * v1 (src/donnees/classes.json) pour le Protecteur et le Shaman.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - 1a : hybride, PP réduits (4 + 2 × niveau + mod de SAG, comme le
 *     Prêtre et le Barde), DD = 10 + mod de SAG ; Force de la nature = 3 +
 *     niveau / 3, rechargée au repos court : prendre une forme (1, ou 2
 *     pour la Forme primordiale), booster un sort naturel (1 : zone +1 case
 *     ou +1 round), attaque spéciale (2) ;
 *   - 2a : un élément de départ, terre, eau ou glace, Adepte ; la Tempête
 *     (R5 des éléments naturels) le monte à Maître ; les autres restent
 *     plafonnés à Adepte ;
 *   - 3a : attaque spéciale contondante (Coup assommant, le bâton), 2 Force
 *     de la nature ; le Combat au bâton v1 disparaît ;
 *   - 4a : Communication animale, capacité de classe, passive, hors
 *     combat ;
 *   - 5a : Voie des éléments naturels = son école (src/regles/ecoles/
 *     nature.ts), avec les coûts du tableau validé ;
 *   - 6a : une forme coûte 1 Force de la nature, dure le combat, une seule
 *     à la fois ; ses attaques passent par l'attaque magique, + mod de SAG
 *     aux dégâts ; les PV de forme sont des PV temporaires ;
 *   - 7a : Protecteur et Shaman deviennent des capacités à PP fixes, sans
 *     jet d'attaque, pendant 3 + mod de SAG rounds ; Égide 2 PP, Écorce
 *     partagée 3, Rempart vivant 4, Sanctuaire du gardien 6 (1x/scénario) ;
 *     Totem du courage 2, de la force sauvage 3, de la vélocité 4,
 *     Convocation des esprits 6 (1x/scénario) ; Symbiose protectrice : +2
 *     DEF en milieu naturel ; Multitude des esprits : deux totems, en
 *     texte ;
 *   - 8a : Voie du chaos aux signatures du cadre (src/regles/classes/chaos.ts) ;
 *   - 9a : sorts mineurs de la nature (src/regles/mineurs.ts) ;
 *   - 10a : Survie et le compagnon oiseau partent au Vécu ; la Nuée
 *     d'insectes et la Résistance naturelle disparaissent ;
 *   - 11a : d8 ; dague, bâton, épieu, javelot, arc court ; armure de cuir et
 *     petit bouclier ; SAG.
 *
 * Choix du lot, à valider par Thomas :
 *   - prendre une forme coûte une action (un sort v1 limité) ;
 *   - la morsure du loup pose Saignement 2 rounds ; la charge de l'ours
 *     Renversé 1 round, comme un état d'attaque spéciale ;
 *   - portées : 10 m v1 = 5 cases ; Rempart vivant rayon 2 à 7 cases (v1) ;
 *     Sanctuaire du gardien rayon 2 à 5 cases ; Convocation des esprits
 *     rayon 3 autour du Druide (15 m v1) ;
 *   - Sanctuaire et Convocation gardent leur durée v1, 5 + mod de SAG ;
 *     la régénération (1d4 par tour) et le terrain difficile pour les seuls
 *     ennemis du Sanctuaire sont écrits en texte : le combat (L6) les lit.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
/** 3 + mod de SAG rounds (7a). */
const troisPlusSag = { base: 3, plusModMagie: true } as const;
/** 5 + mod de SAG rounds (durée v1 des capacités de rang 5). */
const cinqPlusSag = { base: 5, plusModMagie: true } as const;
const allie = { type: 'creature', camp: 'allie', portee: 5 } as const;
const auContact = { type: 'creature', camp: 'ennemi', portee: 'contact' } as const;
const FORMES = ['forme_loup', 'forme_ours', 'forme_aigle', 'forme_primordiale'] as const;

/** Prendre une forme (6a) : elle dure le combat et remplace la précédente (Forme du chaos sauvage comprise). */
function forme(id: string, nom: string, rang: number, etat: (typeof FORMES)[number], description: string, horsCombat: string, autres: Partial<ActionSaisie> = {}, enPlus: EffetSaisi[] = []): ActionSaisie {
  return {
    id: `druide.${id}`,
    nom,
    description,
    nature: 'capacite',
    rang,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    cout: [{ ressource: 'forceNature', montant: 1 }],
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'retraitEtat', etats: [...FORMES, 'forme_du_chaos_sauvage'].filter((f) => f !== etat), nombre: 1, vise: 'lanceur' },
      { type: 'etat', etat, duree: 'finCombat', vise: 'lanceur' },
      ...enPlus,
    ],
    horsCombat: { paliers: [horsCombat] },
    ...autres,
  };
}

/** Une attaque de forme (6a) : à l'attaque magique, au contact, + mod de SAG. */
function attaqueDeForme(id: string, nom: string, rang: number, etat: (typeof FORMES)[number], des: string, description: string, enPlus: EffetSaisi[] = [], autres: Partial<ActionSaisie> = {}): ActionSaisie {
  return {
    id: `druide.${id}`,
    nom,
    description,
    nature: 'technique',
    rang,
    etiquettes: ['combat'],
    action: 'action',
    enForme: [etat],
    ciblage: auContact,
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des, plusMod: true, typeDegats: 'physique' }, ...enPlus],
    ...autres,
  };
}

/** Une capacité de soutien à PP fixes, sans jet (7a). */
function soutien(id: string, nom: string, rang: number, pp: number, description: string, effets: EffetSaisi[], autres: Partial<ActionSaisie> = {}): ActionSaisie {
  return {
    id: `druide.${id}`,
    nom,
    description,
    nature: 'capacite',
    rang,
    etiquettes: ['combat'],
    action: 'action',
    cout: [{ ressource: 'pp', montant: pp }],
    ciblage: allie,
    resolution: sansJet,
    effets,
    ...autres,
  };
}

const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;

export const ACTIONS_DRUIDE: ActionSaisie[] = [
  // ---- Classe (4a) ----
  {
    id: 'druide.communication-animale',
    nom: 'Communication animale',
    description: 'Il comprend les animaux et se fait comprendre d’eux.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['exploration', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Hors combat : il parle avec les animaux, les comprend et se fait comprendre d’eux.', vise: 'lanceur' }],
    horsCombat: { paliers: ['Parler avec un animal.'] },
  },

  // ---- Voie des formes (6a) ----
  forme('forme-du-loup', 'Forme du loup', 1, 'forme_loup', 'Pour 1 Force de la nature, il devient loup jusqu’à la fin du combat : +2 cases de déplacement, et sa morsure.', 'Flair : suivre une piste.'),
  attaqueDeForme('morsure-du-loup', 'Morsure du loup', 1, 'forme_loup', '1d8', 'En forme de loup, à l’attaque magique : 1d8 + SAG, et la cible saigne.', [{ type: 'etat', etat: 'saignement', duree: { rounds: 2 } }]),
  {
    id: 'druide.masque-du-predateur',
    nom: 'Masque du prédateur',
    description: '+2 en attaque en forme animale ; +2 en Intimidation face aux bêtes.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'attaqueMagique', valeur: 2, duree: 'permanente', condition: 'enFormeAnimale', vise: 'lanceur' },
      { type: 'narratif', texte: '+2 en Intimidation face aux bêtes.', vise: 'lanceur' },
    ],
    horsCombat: { paliers: ['+2 en Intimidation face aux bêtes.'] },
  },
  forme('forme-de-l-ours', 'Forme de l’ours', 3, 'forme_ours', 'Pour 1 Force de la nature, il devient ours jusqu’à la fin du combat : 2 × niveau PV temporaires, ses griffes et sa charge.', 'Force de l’ours : soulever, enfoncer.', {}, [
    { type: 'pvTemp', des: '0', parNiveau: 2, vise: 'lanceur' },
  ]),
  attaqueDeForme('griffes-de-l-ours', 'Griffes de l’ours', 3, 'forme_ours', '1d10', 'En forme d’ours, à l’attaque magique : 1d10 + SAG ; en charge, la cible est renversée.', [], {
    variantes: [
      {
        id: 'charge',
        nom: 'Charge',
        palier: 'I',
        delta: { ajoute: [{ type: 'etat', etat: 'renverse', duree: { rounds: 1 } }, { type: 'narratif', texte: 'Il charge en ligne droite jusqu’à la cible avant de frapper.', vise: 'lanceur' }] },
      },
    ],
  }),
  forme('forme-de-l-aigle', 'Forme de l’aigle', 4, 'forme_aigle', 'Pour 1 Force de la nature, il devient aigle jusqu’à la fin du combat : il vole, et ses serres.', 'Repérage : survoler les lieux.'),
  attaqueDeForme('serres-de-l-aigle', 'Serres de l’aigle', 4, 'forme_aigle', '1d6', 'En forme d’aigle, à l’attaque magique : 1d6 + SAG.'),
  forme(
    'forme-primordiale',
    'Forme primordiale',
    5,
    'forme_primordiale',
    'Une fois par scénario, pour 2 Force de la nature, la bête des premiers âges : 4 × niveau PV temporaires, 2d8 + SAG, une attaque spéciale gratuite par round.',
    'Traverser n’importe quel terrain naturel.',
    { limite: '1x/scenario', cout: [{ ressource: 'forceNature', montant: 2 }] },
    [
      { type: 'pvTemp', des: '0', parNiveau: 4, vise: 'lanceur' },
      { type: 'narratif', texte: 'Une attaque spéciale gratuite par round, tant que dure la forme.', vise: 'lanceur' },
    ],
  ),
  attaqueDeForme('frappe-primordiale', 'Frappe primordiale', 5, 'forme_primordiale', '2d8', 'En Forme primordiale, à l’attaque magique : 2d8 + SAG.'),

  // ---- Voie du protecteur (7a) ----
  soutien('egide-naturelle', 'Égide naturelle', 1, 2, '+3 en DEF à un allié, 3 + mod de SAG rounds.', [{ type: 'bonus', cible: 'DEF', valeur: 3, duree: troisPlusSag }]),
  {
    id: 'druide.symbiose-protectrice',
    nom: 'Symbiose protectrice',
    description: '+2 en DEF tant qu’il combat en milieu naturel.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 2, duree: 'permanente', condition: 'milieuNaturel', vise: 'lanceur' }],
  },
  soutien('ecorce-partagee', 'Écorce partagée', 3, 3, 'Un allié réduit de 3 les dégâts qu’il subit, 3 + mod de SAG rounds.', [{ type: 'bonus', cible: 'reductionDegats', valeur: 3, duree: troisPlusSag }]),
  soutien(
    'rempart-vivant',
    'Rempart vivant',
    4,
    4,
    'Rayon 2 jusqu’à 7 cases : les alliés dans la zone ont +2 en DEF, 3 + mod de SAG rounds, et 1d6 PV temporaires.',
    [
      { type: 'bonus', cible: 'DEF', valeur: 2, duree: troisPlusSag, vise: 'zone' },
      { type: 'pvTemp', des: '1d6', vise: 'zone' },
    ],
    { ciblage: { type: 'point', portee: 7 }, zone: { forme: 'cercle', taille: 2, origine: 'point', filtre: 'allies' } },
  ),
  soutien(
    'sanctuaire-du-gardien',
    'Sanctuaire du gardien',
    5,
    6,
    'Une fois par scénario, rayon 2 jusqu’à 5 cases, 5 + mod de SAG rounds : les alliés ont +4 en DEF et regagnent 1d4 PV par tour ; le terrain est difficile pour les ennemis.',
    [
      { type: 'bonus', cible: 'DEF', valeur: 4, duree: cinqPlusSag, vise: 'zone' },
      { type: 'narratif', texte: 'Les alliés dans la zone regagnent 1d4 PV au début de leur tour ; la zone est un terrain difficile pour les seuls ennemis.', vise: 'lanceur' },
    ],
    {
      limite: '1x/scenario',
      ciblage: { type: 'point', portee: 5 },
      zone: { forme: 'cercle', taille: 2, origine: 'point', filtre: 'allies' },
      persistance: { type: 'zone', duree: cinqPlusSag },
    },
  ),

  // ---- Voie du shaman (7a) ----
  soutien('totem-du-courage', 'Totem du courage', 1, 2, 'Un allié a +2 en attaque, 3 + mod de SAG rounds.', [{ type: 'bonus', cible: 'attaque', valeur: 2, duree: troisPlusSag }]),
  soutien('totem-de-la-force-sauvage', 'Totem de la force sauvage', 3, 3, 'Un allié a +1d6 aux dégâts de ses attaques, 3 + mod de SAG rounds.', [{ type: 'bonus', cible: 'degats', valeur: '1d6', duree: troisPlusSag }]),
  soutien('totem-de-la-velocite', 'Totem de la vélocité', 4, 4, 'Un allié a une action de mouvement de plus à chaque tour, 3 + mod de SAG rounds.', [
    { type: 'narratif', texte: 'Une action de mouvement de plus à chacun de ses tours, pendant 3 + mod de SAG du Druide rounds.' },
  ]),
  soutien(
    'convocation-des-esprits',
    'Convocation des esprits ancestraux',
    5,
    6,
    'Une fois par scénario, rayon 3 autour du Druide : les alliés ont +2 à toutes leurs caractéristiques, 5 + mod de SAG rounds.',
    CARACS.map((k) => ({ type: 'bonus', cible: k, valeur: 2, duree: cinqPlusSag, vise: 'zone' }) as const),
    { limite: '1x/scenario', ciblage: surSoi, zone: { forme: 'cercle', taille: 3, origine: 'lanceur', filtre: 'allies' } },
  ),
];

export const VOIES_DRUIDE: VoieSaisie[] = [
  {
    id: 'druide.elements',
    nom: 'Voie des éléments naturels',
    description: 'Son école : lianes, eau, glace et terre au service du Druide.',
    rangs: [
      { rang: 1, nom: 'Enchevêtrement', description: 'Le verbe de rang 1 de la nature ; l’école est Adepte.', regles: [{ type: 'verbeDeLEcole', ecole: 'nature' }, { type: 'maitriseEcole', niveau: 'adepte' }] },
      { rang: 2, nom: 'Vague', description: 'Le verbe de rang 2 de la nature.', regles: [{ type: 'verbeDeLEcole', ecole: 'nature' }] },
      { rang: 3, nom: 'Givre', description: 'Le verbe de rang 3 ; Enchevêtrement passe au palier II.', regles: [{ type: 'verbeDeLEcole', ecole: 'nature' }] },
      { rang: 4, nom: 'Tremblement', description: 'Le verbe de rang 4 ; Vague passe au palier II.', regles: [{ type: 'verbeDeLEcole', ecole: 'nature' }] },
      {
        rang: 5,
        nom: 'Tempête',
        description: 'Le verbe de rang 5 (1x/combat) ; son élément passe Maître ; Enchevêtrement III, Givre II.',
        regles: [
          { type: 'verbeDeLEcole', ecole: 'nature' },
          { type: 'maitriseElement', quel: 'depart', niveau: 'maitre' },
        ],
      },
    ],
  },
  {
    id: 'druide.formes',
    nom: 'Voie des formes',
    description: 'Son côté martial : la bête qu’il devient, le temps d’un combat.',
    rangs: [
      { rang: 1, nom: 'Loup', description: 'Forme du loup : +2 cases, morsure 1d8 + SAG et Saignement.', actions: ['druide.forme-du-loup', 'druide.morsure-du-loup'] },
      { rang: 2, nom: 'Masque du prédateur', description: '+2 en attaque en forme animale.', actions: ['druide.masque-du-predateur'] },
      { rang: 3, nom: 'Ours', description: 'Forme de l’ours : 2 × niveau PV temporaires, griffes 1d10 + SAG, charge qui renverse.', actions: ['druide.forme-de-l-ours', 'druide.griffes-de-l-ours'] },
      { rang: 4, nom: 'Aigle', description: 'Forme de l’aigle : vol, serres 1d6 + SAG.', actions: ['druide.forme-de-l-aigle', 'druide.serres-de-l-aigle'] },
      { rang: 5, nom: 'Forme primordiale', description: '1x/scénario, 2 Force de la nature : 4 × niveau PV temporaires, 2d8 + SAG.', actions: ['druide.forme-primordiale', 'druide.frappe-primordiale'] },
    ],
  },
  {
    id: 'druide.protecteur',
    nom: 'Voie du protecteur',
    description: 'La nature fait bouclier autour de ses alliés.',
    rangs: [
      { rang: 1, nom: 'Égide naturelle', description: '2 PP : +3 DEF à un allié.', actions: ['druide.egide-naturelle'] },
      { rang: 2, nom: 'Symbiose protectrice', description: '+2 DEF en milieu naturel.', actions: ['druide.symbiose-protectrice'] },
      { rang: 3, nom: 'Écorce partagée', description: '3 PP : un allié réduit les dégâts de 3.', actions: ['druide.ecorce-partagee'] },
      { rang: 4, nom: 'Rempart vivant', description: '4 PP : +2 DEF et 1d6 PV temporaires aux alliés de la zone.', actions: ['druide.rempart-vivant'] },
      { rang: 5, nom: 'Sanctuaire du gardien', description: '6 PP, 1x/scénario : +4 DEF et régénération dans la zone.', actions: ['druide.sanctuaire-du-gardien'] },
    ],
  },
  {
    id: 'druide.shaman',
    nom: 'Voie du shaman',
    description: 'Les esprits des bêtes, appelés en totems sur ses alliés.',
    rangs: [
      { rang: 1, nom: 'Totem du courage', description: '2 PP : +2 en attaque à un allié.', actions: ['druide.totem-du-courage'] },
      {
        rang: 2,
        nom: 'Multitude des esprits',
        description: 'Deux totems actifs à la fois, sur deux alliés différents.',
        regles: [{ type: 'texte', texte: 'Multitude des esprits : deux totems actifs à la fois, sur deux alliés différents (un seul sinon).' }],
      },
      { rang: 3, nom: 'Totem de la force sauvage', description: '3 PP : +1d6 aux dégâts d’un allié.', actions: ['druide.totem-de-la-force-sauvage'] },
      { rang: 4, nom: 'Totem de la vélocité', description: '4 PP : une action de mouvement de plus.', actions: ['druide.totem-de-la-velocite'] },
      { rang: 5, nom: 'Convocation des esprits ancestraux', description: '6 PP, 1x/scénario : +2 à toutes les caractéristiques des alliés.', actions: ['druide.convocation-des-esprits'] },
    ],
  },
];

export const DRUIDE: ClasseSaisie = {
  id: 'druide',
  nom: 'Druide',
  famille: 'hybride',
  deVie: 8,
  caracMagie: 'SAG',
  reservePP: { base: 4, parNiveau: 2, parMod: 1 },
  ressourceDeClasse: { ressource: 'forceNature', base: 3, diviseurNiveau: 3, recharge: 'reposCourt' },
  attaquesSpeciales: { familles: ['contondant'], cout: { ressource: 'forceNature', montant: 2 } },
  actionsDeClasse: ['druide.communication-animale'],
  voies: ['druide.elements', 'druide.formes', 'druide.protecteur', 'druide.shaman', 'druide.chaos'],
  creation: { elements: ['terre', 'eau', 'glace'] },
  mineurs: { liste: ['mineur.fouet-d-epines', 'mineur.gourdin', 'mineur.bouclier-de-terre', 'mineur.pousse', 'mineur.druidisme'], creation: 1, plusUnAuNiveau: [7] },
};
