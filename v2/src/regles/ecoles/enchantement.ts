import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * École d'Enchantement (lot L4.5). Source : doc « Refonte classes et
 * magie — cadre », « Voie de l'Enchantement » et tableau « Enchantement »
 * des verbes des autres écoles (validés) : sauvegarde de Volonté ; plus de
 * « DEF + moitié des PV » comme en v1.
 *
 * Décisions verrouillées :
 *   - boss et démons D5 sont immunisés à Sommeil, Ordre et Domination
 *     (validé) ;
 *   - Sommeil : une cible dont les PV actuels sont au plus 4 × niveau de
 *     l'Envoûteur ; réveillée par des dégâts (validé) ;
 *   - Fascination : concentration, 1 PP par round, brisée si la cible est
 *     attaquée (validé) ; c'est la seule Fascination (doublon levé) ;
 *   - Terreur : Effroi 1 round, la cible recule de 2 cases ; la zone du
 *     palier II ne vise que les ennemis (validé) ;
 *   - décisions de Thomas du 21/10/2026 (L4.5) : portée 6 cases (2a) ;
 *     Terreur II, cercle de rayon 2 autour d'un point (6a) ; Charme II
 *     protège aussi un allié que l'Envoûteur désigne (7a).
 */

export const ENCHANTEMENT: ActionSaisie[] = [
  {
    id: 'enchantement.charme',
    nom: 'Charme',
    description: 'La cible ne peut se résoudre à frapper l’Envoûteur.',
    nature: 'verbe',
    ecole: 'enchantement',
    rang: 1,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'charme', duree: { rounds: 1 } }],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: {
        effets: { '0': { duree: { rounds: 2 } } },
        ajoute: [{ type: 'narratif', texte: 'La cible ne peut pas attaquer non plus l’allié que l’Envoûteur désigne.', vise: 'lanceur' }],
      },
      III: {
        ajoute: [{ type: 'narratif', texte: 'Ordre : la cible exécute un mot (fuis, lâche, à genoux, approche).', saufBoss: true }],
      },
    },
    horsCombat: {
      paliers: ['Attitude du PNJ : +1 cran.', 'Attitude +1 cran, et une réussite.', 'Ordre : un mot exécuté.'],
    },
  },
  {
    id: 'enchantement.fascination',
    nom: 'Fascination',
    description: 'La cible reste immobile, captivée, tant que l’Envoûteur maintient le sort.',
    nature: 'verbe',
    ecole: 'enchantement',
    rang: 2,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    persistance: { type: 'concentration', duree: 'finCombat', maintien: 1, rupture: ['cibleAttaquee', 'lanceurSurpris', 'autreConcentration'] },
    effets: [{ type: 'etat', etat: 'fascine', duree: 'finCombat' }],
    element: { application: 'ciblePrincipale' },
    paliers: { II: { ciblage: { nbCibles: 2 } } },
    horsCombat: { paliers: ['Captiver un garde.', 'Captiver deux gardes.'] },
  },
  {
    id: 'enchantement.terreur',
    nom: 'Terreur',
    description: 'Une peur qui fait reculer et trembler la main.',
    nature: 'verbe',
    ecole: 'enchantement',
    rang: 3,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [
      { type: 'etat', etat: 'effroi', duree: { rounds: 1 } },
      { type: 'deplacement', sens: 'repousse', cases: 2 },
    ],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: {
        ciblage: { type: 'point' },
        zone: { forme: 'cercle', taille: 2, origine: 'point', filtre: 'ennemis' },
        effets: { '0': { vise: 'zone' }, '1': { vise: 'zone' } },
        element: { application: 'chaqueCible' },
      },
    },
    horsCombat: { paliers: ['L’intimidation compte une réussite.', 'Disperser une foule.'], reussites: 1 },
  },
  {
    id: 'enchantement.sommeil',
    nom: 'Sommeil',
    description: 'Endort une cible déjà affaiblie.',
    nature: 'verbe',
    ecole: 'enchantement',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'endormi', duree: 'finCombat', siPvAuPlus: { parNiveau: 4 }, saufBoss: true }],
    element: { application: 'ciblePrincipale' },
    horsCombat: { paliers: ['Endormir une sentinelle.'] },
  },
  {
    id: 'enchantement.domination',
    nom: 'Domination',
    description: 'L’Envoûteur joue le prochain tour de la cible.',
    nature: 'verbe',
    ecole: 'enchantement',
    rang: 5,
    etiquettes: ['combat', 'social'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'domine', duree: 'prochainTour', saufBoss: true }],
    element: { application: 'ciblePrincipale' },
    horsCombat: { paliers: ['Obéissance pendant une scène, sans souvenir.'] },
  },
];
