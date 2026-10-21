import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * La Voie des éléments naturels du Druide, son école (lot L4.15). Source :
 * doc « Refonte classes et magie — cadre », « Druide — Force de la nature »,
 * « Ressources de classe (validé) » et tableau « Verbes des hybrides
 * (validé) » : même formule de coût que les lanceurs (2 / 3 / 4 PP au R1…),
 * payée sur la réserve réduite, DD = 10 + mod de SAG ; l'école reste
 * Adepte, comme le chant et les Cercles ; un boost de Force de la nature par
 * sort : zone +1 case ou +1 round (décision 5a du 21/10/2026).
 *
 * Les verbes portent leur propre nature (lianes, eau, glace, terre) ; seule
 * la Tempête prend l'effet de l'élément du Druide, sur chaque cible.
 *
 * Choix du lot, à valider par Thomas (le tableau ne les donne pas) :
 *   - portées non données : 6 cases, comme ailleurs ; la Vague part du
 *     Druide, en ligne de 3 cases ;
 *   - Enchevêtrement II : le terrain difficile de la zone 3 × 3 dure
 *     2 rounds, comme le sol glissant du Givre ;
 *   - Givre : Ralenti 2 rounds sur une sauvegarde ratée ; Tremblement :
 *     Renversé sur une sauvegarde ratée ;
 *   - Tempête : DEX pour moitié à chaque round, comme le Tremblement.
 */

export const NATURE: ActionSaisie[] = [
  {
    id: 'nature.enchevetrement',
    nom: 'Enchevêtrement',
    description: 'Des lianes jaillissent du sol et lient la cible.',
    nature: 'verbe',
    ecole: 'nature',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'FOR', siSauvegarde: 'rien' },
    effets: [{ type: 'etat', etat: 'immobilise', duree: { rounds: 1 }, condition: 'sauvegardeRatee' }],
    paliers: {
      II: { zone: { forme: 'carre', taille: 3, origine: 'cible' }, ajoute: [{ type: 'terrain', nature: 'difficile', duree: { rounds: 2 } }] },
      III: {
        zone: { forme: 'carre', taille: 3, origine: 'cible' },
        effets: { '0': { duree: { rounds: 2 } } },
        ajoute: [{ type: 'terrain', nature: 'difficile', duree: { rounds: 2 } }],
      },
    },
    horsCombat: { paliers: ['Franchir un obstacle, grimper une paroi.', 'Tendre un pont de lianes.', 'Attacher un prisonnier pour la nuit.'] },
  },
  {
    id: 'nature.vague',
    nom: 'Vague',
    description: 'Une lame d’eau qui balaie tout devant le Druide.',
    nature: 'verbe',
    ecole: 'nature',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 3 },
    zone: { forme: 'ligne', taille: 3, origine: 'lanceur' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'FOR', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'eau', vise: 'zone' },
      { type: 'deplacement', sens: 'repousse', cases: 2, vise: 'zone', condition: 'sauvegardeRatee' },
    ],
    paliers: { II: { effets: { '0': { des: '3d6' }, '1': { cases: 3 } } } },
    horsCombat: { paliers: ['Éteindre un feu.', 'Emporter un obstacle, nettoyer une salle.'] },
  },
  {
    id: 'nature.givre',
    nom: 'Givre',
    description: 'Le froid prend la zone : la glace mord et le sol glisse.',
    nature: 'verbe',
    ecole: 'nature',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'carre', taille: 3, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'CON', siSauvegarde: 'moitie' },
    persistance: { type: 'zone', duree: { rounds: 2 } },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'glace', vise: 'zone' },
      { type: 'etat', etat: 'ralenti', duree: { rounds: 2 }, vise: 'zone', condition: 'sauvegardeRatee' },
      { type: 'terrain', nature: 'glissant', duree: { rounds: 2 } },
    ],
    paliers: { II: { effets: { '0': { des: '3d6' } } } },
    horsCombat: { paliers: ['Figer une serrure.', 'Geler une rivière pour la traverser.'] },
  },
  {
    id: 'nature.tremblement',
    nom: 'Tremblement',
    description: 'La terre se soulève et jette tout le monde au sol.',
    nature: 'verbe',
    ecole: 'nature',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'terre', vise: 'zone' },
      { type: 'etat', etat: 'renverse', duree: { rounds: 1 }, vise: 'zone', condition: 'sauvegardeRatee' },
    ],
    horsCombat: { paliers: ['Fendre un mur, ouvrir une crevasse.'] },
  },
  {
    id: 'nature.tempete',
    nom: 'Tempête',
    description: 'Une fois par combat, la nature entière se lève : trois rounds de tempête, avec l’effet de son élément.',
    nature: 'verbe',
    ecole: 'nature',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    persistance: { type: 'zone', duree: { rounds: 3 }, quand: 'debutTour' },
    effets: [{ type: 'degats', des: '2d6', typeDegats: 'magique', vise: 'zone' }],
    element: { application: 'chaqueCible' },
    horsCombat: { paliers: ['Changer le temps local pendant une heure.'] },
  },
];
