import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';
import { voieDeLEcole } from './commun';

/*
 * Le Nécromancien de la refonte (lot L4.17). Source : doc « Refonte classes
 * et magie — cadre », « Nécromancien (validé) » : création, voies, Âmes,
 * écoles (src/regles/ecoles/outre-tombe.ts, malediction.ts), Voies du
 * sang, des âmes et du seuil, avec leurs coûts. Un mort-vivant est un
 * Repêché logé dans un cadavre : il suit les règles des serviteurs. Magie
 * taboue à Liberra, comme l'Hémomancie.
 *
 * Décisions de Thomas du 22/10/2026 (verrouillées) :
 *   - 1a : lanceur, d4, INT, dague et bâton ferré, armure de tissu ; PP =
 *     4 + 2 × niveau + 2 × mod d'INT ; DD = 10 + mod d'INT ; 2 sorts
 *     mineurs, +1 aux niveaux 5 et 9 ; une école au choix (Outre-tombe ou
 *     Malédiction), l'autre par grimoire ; sang de départ, Adepte ; la Voie
 *     de l'école suit la règle des lanceurs (Maître au rang 4) ;
 *   - 2a : Âmes de 0 à 3 (5 avec la Moisson) ; une âme ne paie que ce qui
 *     la nomme (Libération vengeresse, Rempart d'âmes, Suture renforcée) ;
 *   - 5a : sorts mineurs Trait nécrotique, Frisson, Sentir la mort,
 *     Préserver, Main froide (src/regles/mineurs.ts) ;
 *   - 6a : Suture : sans cadavre ni âme à 3 cases, une variante lui coûte
 *     1d4 PV ; une âme dépensée porte le soin à 2d6 + mod ; Transfusion : X
 *     PV choisis au lancer, au plus 2 × niveau ;
 *   - 7a : Voie du chaos aux signatures du cadre (src/regles/classes/chaos.ts) ;
 *   - 8a : Murmure des morts part au Vécu (validé) ; Capture d'âme le
 *     remplace au rang 1.
 *
 * Choix du lot, à valider par Thomas :
 *   - les sorts de sang et des âmes passent par l'attaque magique (v1) ;
 *     Étreinte exsangue ne donne ses +2 que si elle touche ;
 *   - Libération vengeresse : 2d6 + mod nécrotiques ; Capture d'âme et
 *     Moisson ne tiennent pas le plafond de 3 âmes : la jauge de la fiche
 *     le borne ;
 *   - Rempart d'âmes se déclenche quand une attaque le touche, lui ou un
 *     allié adjacent ; Sang figé, sur le jet de survie d'un allié à terre,
 *     à 6 cases.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
const auContact = { type: 'creature', camp: 'ennemi', portee: 'contact' } as const;
const allieAuContact = { type: 'creature', camp: 'allie', portee: 'contact' } as const;
const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;

export const ACTIONS_NECROMANCIEN: ActionSaisie[] = [
  // ---- Voie du sang (sa voie élémentaire) ----
  {
    id: 'sang.morsure-du-sang',
    nom: 'Morsure du sang',
    description: 'Au contact, il boit : 1d6 + mod, et la moitié lui revient en PV.',
    nature: 'verbe',
    ecole: 'sang',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: auContact,
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', plusMod: true, typeDegats: 'sang', draine: 'moitie' }],
    element: { application: 'ciblePrincipale' },
    paliers: { II: { ciblage: { portee: 3 } }, III: { ciblage: { portee: 3, nbCibles: 2 } } },
    horsCombat: { paliers: ['Goûter un sang pour savoir à qui il appartient.'] },
  },
  {
    id: 'necromancien.regeneration-sanguine',
    nom: 'Régénération sanguine',
    description: 'S’il a drainé au tour précédent, il regagne 1d4 PV au début de son tour.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'S’il a drainé des PV au tour précédent : +1d4 PV au début de son tour (le combat, L6).', vise: 'lanceur' }],
  },
  {
    id: 'sang.vol-de-vitalite',
    nom: 'Vol de vitalité',
    description: 'À 10 cases, 2d6 ; la moitié lui revient en PV.',
    nature: 'verbe',
    ecole: 'sang',
    rang: 3,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '2d6', typeDegats: 'sang', draine: 'moitie' }],
    element: { application: 'ciblePrincipale' },
    paliers: { II: { effets: { '0': { des: '3d6' } } } },
  },
  {
    id: 'necromancien.sang-impie',
    nom: 'Sang impie',
    description: 'Tuer avec un sort de sang lui rend 2d6 PV.',
    nature: 'passif',
    rang: 4,
    etiquettes: ['combat'],
    action: 'aucune',
    declencheur: 'ennemiAbattu',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'soin', des: '2d6', vise: 'lanceur' },
      { type: 'narratif', texte: 'Seulement quand un sort de sang abat l’ennemi.', vise: 'lanceur' },
    ],
  },
  {
    id: 'sang.etreinte-exsangue',
    nom: 'Étreinte exsangue',
    description: 'Une fois par combat, au contact : 4d6, tout lui revient en PV, et +2 à toutes ses caractéristiques 2 rounds.',
    nature: 'verbe',
    ecole: 'sang',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: auContact,
    resolution: { jet: 'attaqueMagique' },
    effets: [
      { type: 'degats', des: '4d6', typeDegats: 'sang', draine: 'tout' },
      ...CARACS.map((k) => ({ type: 'bonus', cible: k, valeur: 2, duree: { rounds: 2 }, condition: 'touche', vise: 'lanceur' }) as const),
    ],
    element: { application: 'ciblePrincipale' },
  },

  // ---- Voie des âmes ----
  {
    id: 'ames.capture-d-ame',
    nom: 'Capture d’âme',
    description: 'Sur une créature morte ce round, à l’attaque magique : son âme va au réceptacle.',
    nature: 'verbe',
    ecole: 'ames',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'toute', portee: 6 },
    resolution: { jet: 'attaqueMagique' },
    effets: [
      { type: 'ressource', ressource: 'ame', montant: 1, condition: 'touche', vise: 'lanceur' },
      { type: 'narratif', texte: 'Seulement sur une créature morte ce round ; le réceptacle tient 3 âmes (5 pendant la Moisson).', vise: 'lanceur' },
    ],
    paliers: { II: { ciblage: { portee: 10 } }, III: { ciblage: { portee: 10, nbCibles: 2 } } },
    horsCombat: { paliers: ['Sentir les âmes errantes d’un lieu.'] },
  },
  {
    id: 'ames.liberation-vengeresse',
    nom: 'Libération vengeresse',
    description: 'Pour 1 âme au lieu de PP : 2d6 + mod à 10 cases ; l’âme retourne à la Mer.',
    nature: 'verbe',
    ecole: 'ames',
    rang: 2,
    etiquettes: ['combat'],
    action: 'action',
    coutEnAmes: 1,
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [
      { type: 'degats', des: '2d6', plusMod: true, typeDegats: 'necrotique' },
      { type: 'narratif', texte: 'L’âme retourne à la Mer : +1 PP au Remous du lieu.', vise: 'lanceur' },
    ],
    element: { application: 'ciblePrincipale' },
    paliers: { II: { effets: { '0': { des: '3d6' } } } },
  },
  {
    id: 'necromancien.savoir-vole',
    nom: 'Savoir volé',
    description: '+1 aux tests d’INT par âme détenue, +3 au plus.',
    nature: 'passif',
    rang: 3,
    etiquettes: ['exploration', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: '+1 aux tests d’INT par âme détenue, +3 au plus.', vise: 'lanceur' }],
    horsCombat: { paliers: ['Une question sur ce que le mort savait, par âme dépensée.'] },
  },
  {
    id: 'necromancien.rempart-d-ames',
    nom: 'Rempart d’âmes',
    description: 'En réaction, pour 1 âme : une attaque qui vient de le toucher, lui ou un allié adjacent, est annulée.',
    nature: 'reaction',
    rang: 4,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'attaqueSubie',
    cout: [{ ressource: 'ame', montant: 1 }],
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'L’attaque qui vient de toucher le Nécromancien, ou un allié adjacent, est annulée.', vise: 'lanceur' }],
  },
  {
    id: 'necromancien.moisson-d-ames',
    nom: 'Moisson d’âmes',
    description: 'Une fois par scénario, 3 rounds : il capture l’âme de tout ce qui meurt à 10 cases ; son réceptacle en tient 5.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'etat', etat: 'moisson_d_ames', duree: { rounds: 3 }, vise: 'lanceur' }],
  },

  // ---- Voie du seuil ----
  {
    id: 'seuil.suture',
    nom: 'Suture',
    description: 'Au contact, il soigne 1d6 + mod en puisant dans un cadavre ou une âme à 3 cases ; sans eux, il paie 1d4 PV.',
    nature: 'verbe',
    ecole: 'seuil',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: allieAuContact,
    resolution: sansJet,
    effets: [{ type: 'soin', des: '1d6', plusMod: true }],
    variantes: [
      { id: 'sans-corps', nom: 'Sans cadavre ni âme : 1d4 PV', palier: 'I', delta: { ajoute: [{ type: 'degats', des: '1d4', typeDegats: 'necrotique', vise: 'lanceur' }] } },
      {
        id: 'ame',
        nom: 'Une âme dépensée : 2d6 + mod',
        palier: 'I',
        delta: { remplaceEffets: [{ type: 'soin', des: '2d6', plusMod: true }, { type: 'ressource', ressource: 'ame', montant: -1, vise: 'lanceur' }] },
      },
    ],
    paliers: { II: { ciblage: { portee: 3 } }, III: { ciblage: { portee: 3, nbCibles: 2 } } },
    horsCombat: { paliers: ['Soigner sans magie visible, comme un chirurgien.', 'Remettre debout un blessé grave.', 'Soigner deux blessés.'] },
  },
  {
    id: 'necromancien.lire-la-chair',
    nom: 'Lire la chair',
    description: 'Il voit l’état d’une créature vivante (intacte, blessée, en sang, mourante) ; +2 en Médecine.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Il voit si une cible vivante est intacte, blessée, en sang ou mourante ; +2 en Médecine.', vise: 'lanceur' }],
    horsCombat: { paliers: ['Examiner un corps : la cause, l’heure et l’arme de la mort (une fois par corps).'] },
  },
  {
    id: 'seuil.transfusion',
    nom: 'Transfusion',
    description: 'Il cède jusqu’à 2 × niveau PV à un allié adjacent ; au palier II, à 6 cases, ou en les prenant à un ennemi (CON).',
    nature: 'verbe',
    ecole: 'seuil',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: allieAuContact,
    resolution: sansJet,
    effets: [
      { type: 'transfusion', parNiveau: 2, depuis: 'lanceur' },
      { type: 'narratif', texte: 'Un mort-vivant qu’il contrôle peut céder ces PV à sa place (on les retire alors du jeton).', vise: 'lanceur' },
    ],
    paliers: { II: { ciblage: { portee: 6 } } },
    variantes: [
      {
        id: 'sur-un-ennemi',
        nom: 'Prendre les PV à un ennemi',
        palier: 'II',
        delta: {
          ciblage: { camp: 'ennemi' },
          resolution: { jet: 'sauvegarde', sauvegarde: 'CON', siSauvegarde: 'annule' },
          remplaceEffets: [{ type: 'transfusion', parNiveau: 2, depuis: 'cible' }],
        },
      },
    ],
    horsCombat: { paliers: ['Sauver un mourant en lui donnant sa propre vie.'] },
  },
  {
    id: 'seuil.sang-fige',
    nom: 'Sang figé',
    description: 'Une fois par combat, en réaction : il fige le sang d’un allié à terre ; un échec à son jet de survie est annulé.',
    nature: 'verbe',
    ecole: 'seuil',
    rang: 4,
    etiquettes: ['combat'],
    action: 'reaction',
    limite: '1x/combat',
    declencheur: 'jetAllie',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Son sang se fige : l’échec à son jet de survie est annulé.' }],
  },
  {
    id: 'seuil.retour',
    nom: 'Retour',
    description: 'Une fois par scénario : un allié mort depuis moins d’un round revient à 1 PV ; son âme est repêchée de la Mer.',
    nature: 'verbe',
    ecole: 'seuil',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: allieAuContact,
    resolution: sansJet,
    effets: [
      { type: 'soin', des: '1' },
      { type: 'narratif', texte: 'Seulement sur un allié mort depuis moins d’un round. Son âme est repêchée : +1d6 PP au Remous du lieu, et une séquelle durable (une Marque, au choix du MJ).' },
    ],
  },
];

export const VOIES_NECROMANCIEN: VoieSaisie[] = [
  voieDeLEcole('necromancien'),
  {
    id: 'necromancien.sang',
    nom: 'Voie du sang',
    description: 'Sa voie élémentaire : le drain compense le coût en PV du sang.',
    rangs: [
      { rang: 1, nom: 'Morsure du sang', description: 'Au contact, 1d6 + mod, la moitié en PV.', regles: [{ type: 'verbeDeLEcole', ecole: 'sang' }] },
      { rang: 2, nom: 'Régénération sanguine', description: '+1d4 PV s’il a drainé au tour précédent.', actions: ['necromancien.regeneration-sanguine'] },
      {
        rang: 3,
        nom: 'Vol de vitalité',
        description: '2d6 à 10 cases, la moitié en PV ; le sang passe Maître ; Morsure du sang au palier II.',
        regles: [
          { type: 'verbeDeLEcole', ecole: 'sang' },
          { type: 'maitriseElement', quel: 'depart', niveau: 'maitre' },
        ],
      },
      { rang: 4, nom: 'Sang impie', description: 'Tuer avec un sort de sang rend 2d6 PV.', actions: ['necromancien.sang-impie'] },
      { rang: 5, nom: 'Étreinte exsangue', description: '1x/combat, 4d6, tout en PV, +2 aux caractéristiques.', regles: [{ type: 'verbeDeLEcole', ecole: 'sang' }] },
    ],
  },
  {
    id: 'necromancien.ames',
    nom: 'Voie des âmes',
    description: 'Il intercepte les âmes avant qu’elles ne retournent à la Mer.',
    rangs: [
      { rang: 1, nom: 'Capture d’âme', description: 'L’âme d’une créature morte ce round va au réceptacle.', regles: [{ type: 'verbeDeLEcole', ecole: 'ames' }] },
      { rang: 2, nom: 'Libération vengeresse', description: '1 âme : 2d6 + mod à 10 cases.', regles: [{ type: 'verbeDeLEcole', ecole: 'ames' }] },
      { rang: 3, nom: 'Savoir volé', description: '+1 aux tests d’INT par âme, +3 au plus.', actions: ['necromancien.savoir-vole'] },
      { rang: 4, nom: 'Rempart d’âmes', description: 'Réaction, 1 âme : une attaque annulée.', actions: ['necromancien.rempart-d-ames'] },
      { rang: 5, nom: 'Moisson d’âmes', description: '1x/scénario, 3 rounds de capture d’office ; réceptacle à 5.', actions: ['necromancien.moisson-d-ames'] },
    ],
  },
  {
    id: 'necromancien.seuil',
    nom: 'Voie du seuil',
    description: 'Il connaît la vie parce qu’il fréquente la mort : il soigne en puisant dans ce qui meurt.',
    rangs: [
      { rang: 1, nom: 'Suture', description: 'Un soin puisé dans un cadavre ou une âme.', regles: [{ type: 'verbeDeLEcole', ecole: 'seuil' }] },
      { rang: 2, nom: 'Lire la chair', description: 'L’état d’une cible vivante ; +2 en Médecine.', actions: ['necromancien.lire-la-chair'] },
      { rang: 3, nom: 'Transfusion', description: 'Céder jusqu’à 2 × niveau PV à un allié.', regles: [{ type: 'verbeDeLEcole', ecole: 'seuil' }] },
      { rang: 4, nom: 'Sang figé', description: 'Réaction 1x/combat : un jet de survie raté annulé.', regles: [{ type: 'verbeDeLEcole', ecole: 'seuil' }] },
      { rang: 5, nom: 'Retour', description: '1x/scénario : un allié mort depuis moins d’un round revient à 1 PV.', regles: [{ type: 'verbeDeLEcole', ecole: 'seuil' }] },
    ],
  },
];

export const NECROMANCIEN: ClasseSaisie = {
  id: 'necromancien',
  nom: 'Nécromancien',
  famille: 'magique',
  deVie: 4,
  caracMagie: 'INT',
  reservePP: { base: 4, parNiveau: 2, parMod: 2 },
  reserveAmes: { max: 3, moisson: { action: 'necromancien.moisson-d-ames', max: 5 } },
  voies: ['necromancien.ecole', 'necromancien.sang', 'necromancien.ames', 'necromancien.seuil', 'necromancien.chaos'],
  creation: {
    ecoles: ['outre-tombe', 'malediction'],
    elements: ['sang'],
    elementsSecond: [],
    maitriseElementDepart: 'adepte',
  },
  mineurs: {
    liste: ['mineur.trait-necrotique', 'mineur.frisson', 'mineur.sentir-la-mort', 'mineur.preserver', 'mineur.main-froide'],
    creation: 2,
    plusUnAuNiveau: [5, 9],
  },
};
