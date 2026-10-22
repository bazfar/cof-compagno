import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Malédiction, une des deux écoles du Nécromancien (lot L4.17). Source :
 * doc « Refonte classes et magie — cadre », « Nécromancien (validé) » :
 * sauvegarde de Volonté, coûts, effets par palier et usages hors combat du
 * tableau.
 *
 * Décision de Thomas du 22/10/2026 (8a) : la Domination v1 devient
 * l'Emprise des ombres ; boss et D5 y échappent (validé).
 * Choix du lot, à valider : portées non données de 6 cases ; Œil mauvais
 * vise l'attaque, la DEF ou les sauvegardes, au choix au lancer ; Toucher
 * flétrissant fait ses dégâts pour moitié sur une sauvegarde réussie, et
 * son malus seulement sur un échec ; Manipulation pose Commandé jusqu'au
 * prochain tour du Nécromancien.
 */

export const MALEDICTION: ActionSaisie[] = [
  {
    id: 'malediction.oeil-mauvais',
    nom: 'Œil mauvais',
    description: 'Un regard qui porte malheur : −2 à un type de jet, 3 rounds.',
    nature: 'verbe',
    ecole: 'malediction',
    rang: 1,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'bonus', cible: 'attaque', valeur: -2, duree: { rounds: 3 } }],
    variantes: [
      { id: 'def', nom: 'Sur la DEF', palier: 'I', delta: { effets: { '0': { cible: 'DEF' } } } },
      { id: 'sauvegardes', nom: 'Sur les sauvegardes', palier: 'I', delta: { effets: { '0': { cible: 'sauvegardes' } } } },
    ],
    paliers: { II: { effets: { '0': { valeur: -3 } } }, III: { ciblage: { nbCibles: 2 } } },
    horsCombat: { paliers: ['Malchance : le PNJ rate son prochain jet.', 'La malchance dure toute la scène.', 'Deux PNJ.'] },
  },
  {
    id: 'malediction.toucher-fletrissant',
    nom: 'Toucher flétrissant',
    description: 'Au contact, la vie se fane : 2d6 et un malus de 1d4 en attaque ou en DEF, 2 rounds.',
    nature: 'verbe',
    ecole: 'malediction',
    rang: 2,
    etiquettes: ['combat', 'exploration', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'contact' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'necrotique' },
      { type: 'bonus', cible: 'attaque', valeur: '-1d4', duree: { rounds: 2 }, condition: 'sauvegardeRatee' },
    ],
    element: { application: 'ciblePrincipale' },
    variantes: [{ id: 'def', nom: 'Malus sur la DEF', palier: 'I', delta: { effets: { '1': { cible: 'DEF' } } } }],
    paliers: { II: { effets: { '1': { valeur: '-1d6' } } } },
    horsCombat: { paliers: ['Faner une plante, gâter un aliment.', 'Marquer quelqu’un d’une flétrissure visible.'] },
  },
  {
    id: 'malediction.manipulation',
    nom: 'Manipulation',
    description: 'Il souffle un ordre : la cible fait une action simple, non suicidaire, à son prochain tour.',
    nature: 'verbe',
    ecole: 'malediction',
    rang: 3,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [
      { type: 'etat', etat: 'commande', duree: 'prochainTour' },
      { type: 'narratif', texte: 'À son prochain tour, la cible fait une action simple dictée par le Nécromancien, jamais suicidaire.' },
    ],
    paliers: { II: { ciblage: { nbCibles: 2 } } },
    horsCombat: { paliers: ['Souffler une idée à un PNJ, qui la croit sienne.', 'Deux idées.'] },
  },
  {
    id: 'malediction.malediction-profonde',
    nom: 'Malédiction profonde',
    description: 'Jusqu’à la fin du combat : soins reçus divisés par deux, −2 aux sauvegardes.',
    nature: 'verbe',
    ecole: 'malediction',
    rang: 4,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'maudit', duree: 'finCombat' }],
    horsCombat: { paliers: ['Une malédiction durable sur un PNJ, jusqu’à ce qu’on la lève.'] },
  },
  {
    id: 'malediction.emprise-des-ombres',
    nom: 'Emprise des ombres',
    description: 'Une fois par combat : le contrôle total d’une cible, 2 rounds. Boss et D5 y échappent.',
    nature: 'verbe',
    ecole: 'malediction',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [
      { type: 'etat', etat: 'domine', duree: { rounds: 2 }, saufBoss: true },
      { type: 'narratif', texte: 'Le Nécromancien joue ses tours ; un ordre suicidaire ou contraire à sa nature lui rend une sauvegarde.', saufBoss: true },
    ],
  },
];
