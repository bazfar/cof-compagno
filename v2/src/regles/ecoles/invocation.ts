import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * École d'Invocation (lot L4.4a). Source : doc « Refonte classes et magie
 * — cadre », « Verbes des autres écoles (validé) », « Serviteurs (validé) »
 * et « Hors combat ».
 *
 * Décisions verrouillées :
 *   - des jetons sur la battlemap, une seule invocation de chaque verbe à la
 *     fois, sans concentration (validé) ;
 *   - Arme spirituelle : frappe à l'attaque magique du lanceur (exception à
 *     la règle des verbes) ; elle peut porter un élément (1b du 21/10/2026) ;
 *   - Portail : un allié l'accepte sans sauvegarde, un ennemi sauvegarde en
 *     Volonté ;
 *   - Serviteur : celui d'un élément au moins Initié, avec le risque de
 *     dérapage de cet élément ; la Sangsue (sang) coûte des PV comme tout
 *     sort de sang ;
 *   - Légion : trois Embruns pendant 3 rounds.
 * Portées absentes du cadre (où paraît l'invocation, Portail) : 6 cases, à
 * confirmer.
 */
export const INVOCATION: ActionSaisie[] = [
  {
    id: 'invocation.familier',
    nom: 'Familier',
    description: 'Appelle une petite créature liée au mage pour la scène.',
    nature: 'verbe',
    ecole: 'invocation',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: { type: 'duree', duree: 'scene' },
    effets: [{ type: 'invocation', creature: 'familier', duree: 'scene' }],
    paliers: {
      II: { ajoute: [{ type: 'narratif', texte: 'Le familier porte un sort de contact du mage jusqu’à sa cible.', vise: 'lanceur' }] },
      III: { effets: { '0': { nombre: 2 } } },
    },
    horsCombat: { paliers: ['Un éclaireur.', 'Il porte un message ou un objet léger.', 'Deux familiers.'] },
  },
  {
    id: 'invocation.arme-spirituelle',
    nom: 'Arme spirituelle',
    description: 'Une arme de force qui combat seule pendant 3 rounds.',
    nature: 'verbe',
    ecole: 'invocation',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: { type: 'duree', duree: { rounds: 3 } },
    effets: [{ type: 'invocation', creature: 'arme_spirituelle', duree: { rounds: 3 } }],
    element: { application: 'chaqueCible' },
    paliers: {
      II: { effets: { '0': { creature: 'arme_spirituelle_ii' } } },
    },
    horsCombat: { paliers: ['Monter la garde et avertir d’une intrusion.', 'Escorter un allié.'] },
  },
  {
    id: 'invocation.portail',
    nom: 'Portail',
    description: 'Ouvre un passage de 6 cases à travers l’espace.',
    nature: 'verbe',
    ecole: 'invocation',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule', consentant: true },
    effets: [{ type: 'deplacement', sens: 'teleporte', cases: 6 }],
    paliers: {
      II: { ajoute: [{ type: 'narratif', texte: 'Le portail reste ouvert 2 rounds : tout le groupe peut l’emprunter.', vise: 'lanceur' }] },
    },
    horsCombat: { paliers: ['Franchir un mur.', 'Un passage pour tout le groupe.'] },
  },
  {
    id: 'invocation.serviteur',
    nom: 'Serviteur',
    description: 'Repêche une âme dans la Mer et la revêt d’un corps d’élément, jusqu’à la fin du combat.',
    nature: 'verbe',
    ecole: 'invocation',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: { type: 'duree', duree: 'finCombat' },
    effets: [{ type: 'invocation', creature: 'serviteur', parElement: true, duree: 'finCombat' }],
    element: { application: 'ciblePrincipale' },
    elementMin: 'initie',
    horsCombat: { paliers: ['Porter, garder, ouvrir.'] },
  },
  {
    id: 'invocation.legion',
    nom: 'Légion',
    description: 'Trois serviteurs mineurs, les Embruns, pendant 3 rounds.',
    nature: 'verbe',
    ecole: 'invocation',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: { type: 'duree', duree: { rounds: 3 } },
    effets: [{ type: 'invocation', creature: 'embrun', nombre: 3, duree: { rounds: 3 } }],
    horsCombat: { paliers: ['Le travail de dix en une heure : déblayer, étayer, construire.'] },
  },
];
