import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Outre-tombe, une des deux écoles du Nécromancien (lot L4.17). Source : doc
 * « Refonte classes et magie — cadre », « Nécromancien (validé) » : coûts,
 * effets par palier et usages hors combat du tableau. Les morts-vivants
 * sont des jetons (src/regles/invocations.ts), un seul par verbe à la fois ;
 * chacun ajoute 1 PP de Remous par round (le combat, L6).
 *
 * Décisions de Thomas du 22/10/2026 (verrouillées) :
 *   - 3a : zombie 2 × niveau PV, DEF 10, 1d6 + mod d'INT, déplacement
 *     divisé par deux ; squelette (palier II) DEF 13, arc 1d6 + mod d'INT ;
 *     deux zombies au palier III ;
 *   - 4a : Renfort macabre reste un passif, au rang 4 de l'école ;
 *   - 8a : la Légion de squelettes v1 devient l'Ossuaire ; la dégradation
 *     des zombies (−1 PV par minute) disparaît.
 * Choix du lot, à valider : portées non données de 6 cases ; Pourriture
 * pose Affaibli sur une sauvegarde ratée ; les os de l'Ossuaire sont des
 * dégâts physiques.
 */

export const OUTRE_TOMBE: ActionSaisie[] = [
  {
    id: 'outre-tombe.relever',
    nom: 'Relever',
    description: 'Une âme repêchée dans un cadavre récent : un zombie se lève.',
    nature: 'verbe',
    ecole: 'outre-tombe',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'invocation', creature: 'zombie', duree: 'finCombat' }],
    paliers: { II: { effets: { '0': { creature: 'squelette' } } }, III: { effets: { '0': { creature: 'zombie', nombre: 2 } } } },
    horsCombat: { paliers: ['Un porteur infatigable.', 'Un gardien d’un lieu pour une nuit.', 'Le mort refait un geste qu’il connaissait : ouvrir sa porte, retrouver sa cachette.'] },
  },
  {
    id: 'outre-tombe.epouvante',
    nom: 'Épouvante',
    description: 'La mort se montre un instant : la cible recule, saisie d’effroi.',
    nature: 'verbe',
    ecole: 'outre-tombe',
    rang: 2,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'effroi', duree: { rounds: 1 } }],
    paliers: { II: { ciblage: { nbCibles: 2 } } },
    horsCombat: { paliers: ['L’intimidation compte une réussite.', 'Vider une rue.'], reussites: 1 },
  },
  {
    id: 'outre-tombe.pourriture',
    nom: 'Pourriture',
    description: 'La chair noircit et la force s’en va.',
    nature: 'verbe',
    ecole: 'outre-tombe',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'CON', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'necrotique' },
      { type: 'etat', etat: 'affaibli', duree: { rounds: 2 }, condition: 'sauvegardeRatee' },
    ],
    element: { application: 'chaqueCible' },
    paliers: {
      II: { ciblage: { type: 'point' }, zone: { forme: 'carre', taille: 3, origine: 'point' }, effets: { '0': { vise: 'zone' }, '1': { vise: 'zone' } } },
    },
    horsCombat: { paliers: ['Pourrir une corde ou une porte en bois.', 'Gâter une réserve de vivres.'] },
  },
  {
    id: 'outre-tombe.renfort-macabre',
    nom: 'Renfort macabre',
    description: 'Ses morts-vivants frappent plus fort et tiennent mieux : +2 en attaque, PV temporaires égaux à son niveau.',
    nature: 'passif',
    ecole: 'outre-tombe',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'aucune',
    ciblage: { type: 'soi', portee: 'soi' },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'narratif', texte: 'Ses morts-vivants : +2 en attaque, et des PV temporaires égaux à son niveau quand ils se lèvent.', vise: 'lanceur' }],
    horsCombat: { paliers: ['Ses morts relevés durent une journée.'] },
  },
  {
    id: 'outre-tombe.ossuaire',
    nom: 'Ossuaire',
    description: 'Une fois par combat, le sol se hérisse d’os pendant 3 rounds.',
    nature: 'verbe',
    ecole: 'outre-tombe',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'cercle', taille: 2, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    persistance: { type: 'zone', duree: { rounds: 3 }, quand: 'debutTour' },
    effets: [{ type: 'degats', des: '2d6', typeDegats: 'physique', vise: 'zone' }],
    horsCombat: { paliers: ['Une armée d’ossements pour un chantier ou un siège (récit).'] },
  },
];
