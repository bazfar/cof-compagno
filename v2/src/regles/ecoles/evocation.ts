import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * École d'Évocation (lot L4.1) : gabarit des autres écoles.
 * Source : doc « Refonte classes et magie — cadre », « Chiffrage des
 * lanceurs (validé) », tableau « Verbes d'Évocation » et « Hors combat ».
 *
 * Décisions verrouillées (ne pas « corriger ») :
 *   - Missile touche automatiquement ; un dé par projectile, chaque
 *     projectile peut viser une cible différente ; l'élément ne s'applique à
 *     chaque projectile qu'au palier III (« 3 projectiles, élément sur
 *     chacun »), avant il ne porte que sur la cible principale ;
 *   - les zones touchent tout le monde, alliés compris (validé) ;
 *   - Vortex est dégressif (100 / 75 / 50 % par cercle) et attire au centre ;
 *   - Nova : 1x/combat, jamais surchargée.
 * Décisions de Thomas du 20/10/2026 (L4.1) :
 *   - Choc : portée 6 cases ; dégâts pleins jusqu'à 3 cases, moitié de 4 à
 *     6 ; une sauvegarde de FOR réussie annule la poussée ET divise les
 *     dégâts par deux (1a, 2b) ;
 *   - Vortex : portée 6 cases ; DEX pour moitié, et une sauvegarde réussie
 *     n'est pas attirée (3b, 4c) ;
 *   - Nova : DEX pour moitié (5a).
 */
export const EVOCATION: ActionSaisie[] = [
  {
    id: 'evocation.missile',
    nom: 'Missile',
    description: 'Un trait de force pure qui ne manque jamais sa cible.',
    nature: 'verbe',
    ecole: 'evocation',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'auto' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'magique' }],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: { ciblage: { nbCibles: 2 } },
      III: { ciblage: { nbCibles: 3 }, element: { application: 'chaqueProjectile' } },
    },
    horsCombat: {
      paliers: [
        'Briser ou couper un objet à distance.',
        'Deux objets à la fois.',
        'Trajectoire courbe : le trait contourne un obstacle.',
      ],
    },
  },
  {
    id: 'evocation.choc',
    nom: 'Choc',
    description: 'Une onde de force qui frappe et repousse.',
    nature: 'verbe',
    ecole: 'evocation',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'FOR', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'magique', attenuation: { pleinsJusqua: 3, auDela: 'moitie' } },
      { type: 'deplacement', sens: 'repousse', cases: 1, condition: 'sauvegardeRatee' },
    ],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: { effets: { '0': { des: '3d6' }, '1': { cases: 2 } } },
    },
    horsCombat: {
      paliers: ['Enfoncer une porte, renverser un étal.', 'Faire céder une herse ou un mur léger.'],
    },
  },
  {
    id: 'evocation.rayon',
    nom: 'Rayon',
    description: 'Un faisceau qui traverse tout ce qui se trouve sur sa ligne.',
    nature: 'verbe',
    ecole: 'evocation',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 5 },
    zone: { forme: 'ligne', taille: 5, origine: 'lanceur' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    effets: [{ type: 'degats', des: '3d6', typeDegats: 'magique', vise: 'zone' }],
    element: { application: 'chaqueCible' },
    paliers: {
      II: { effets: { '0': { des: '4d6' } } },
    },
    horsCombat: {
      paliers: ['Découper une ouverture dans le bois.', 'Découper une ouverture dans la pierre.'],
    },
  },
  {
    id: 'evocation.vortex',
    nom: 'Vortex',
    description: 'Un tourbillon qui broie et aspire vers son cœur.',
    nature: 'verbe',
    ecole: 'evocation',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'carre', taille: 3, origine: 'point', degressif: true },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '4d6', typeDegats: 'magique', vise: 'zone' },
      { type: 'deplacement', sens: 'attire', cases: 1, vise: 'zone', condition: 'sauvegardeRatee' },
    ],
    element: { application: 'chaqueCible' },
    horsCombat: { paliers: ['Aspirer fumée ou gaz, dégager une pièce.'] },
  },
  {
    id: 'evocation.nova',
    nom: 'Nova',
    description: 'Le mage devient le cœur d’une explosion.',
    nature: 'verbe',
    ecole: 'evocation',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'soi', portee: 'soi' },
    zone: { forme: 'cercle', taille: 2, origine: 'lanceur' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    effets: [{ type: 'degats', des: '6d6', typeDegats: 'magique', vise: 'zone' }],
    element: { application: 'chaqueCible' },
    horsCombat: { paliers: ['Déblayer un éboulement, ou lancer un signal visible de loin.'] },
  },
];
