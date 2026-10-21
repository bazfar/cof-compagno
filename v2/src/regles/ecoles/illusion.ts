import type { ActionSaisie, Duree } from '../../lib/schemas/effets';

/*
 * École d'Illusion (lot L4.5). Source : doc « Refonte classes et magie —
 * cadre », « Voie de l'Illusion », « Cadrage de l'Illusion » et tableau
 * « Illusion » des verbes des autres écoles (validés).
 *
 * Décisions verrouillées (ne pas « corriger ») :
 *   - concentration : une seule illusion active à la fois ; un Envoûteur
 *     surpris perd son illusion (validé) ; en v1, l'illusion était posée en
 *     permanence sur tout le groupe et annulait les embuscades ;
 *   - une créature qui interagit avec l'illusion fait un jet de Volonté pour
 *     la percer ; hors combat, les illusions trompent les sens mais ne
 *     donnent aucun bonus de défense (validé) ;
 *   - avec le psionique, l'illusion vise un seul esprit, ne se perce plus
 *     par l'observation et peut infliger des dégâts mentaux (validé) ;
 *   - décisions de Thomas du 21/10/2026 (L4.5) : portée 6 cases (2a) ;
 *     Leurre III éclate et aveugle tout ce qui l'entoure, rayon 1 (3b) ;
 *     Mirage agit comme
 *     un vrai mur ou une vraie fosse jusqu'à ce qu'un ennemi le touche et
 *     réussisse une Volonté, 3 rounds au plus (4a) ; le double de
 *     l'Illusion vivante ne frappe pas, il encaisse et les sorts peuvent
 *     partir de lui (5a).
 */

const concentration = (duree: Duree) => ({
  type: 'concentration' as const,
  duree,
  rupture: ['lanceurSurpris' as const, 'autreConcentration' as const],
});

export const ILLUSION: ActionSaisie[] = [
  {
    id: 'illusion.leurre',
    nom: 'Leurre',
    description: 'Une silhouette trompeuse qui attire les coups.',
    nature: 'verbe',
    ecole: 'illusion',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    persistance: concentration({ rounds: 1 }),
    effets: [{ type: 'etat', etat: 'leurre', duree: { rounds: 1 } }],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: {
        persistance: { duree: { rounds: 2 } },
        effets: { '0': { duree: { rounds: 2 } } },
        ajoute: [{ type: 'narratif', texte: 'Le leurre se déplace de 2 cases par round.', vise: 'lanceur' }],
      },
      III: { effets: { '0': { etat: 'leurre_eclatant' } } },
    },
    horsCombat: {
      paliers: [
        'Un bruit ou une silhouette immobile : compte une réussite en infiltration.',
        'L’illusion bouge et parle : une fausse piste qui se déplace.',
        'Deux leurres à la fois, ou une scène entière jouée par l’illusion.',
      ],
      reussites: 1,
    },
  },
  {
    id: 'illusion.voile',
    nom: 'Voile',
    description: 'Un voile d’illusion sur soi ou un allié.',
    nature: 'verbe',
    ecole: 'illusion',
    rang: 2,
    etiquettes: ['combat', 'exploration', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: concentration('finCombat'),
    effets: [{ type: 'etat', etat: 'dissimule', duree: 'finCombat' }],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: { persistance: { duree: { rounds: 1 } }, effets: { '0': { etat: 'invisible', duree: { rounds: 1 } } } },
    },
    horsCombat: { paliers: ['Cacher une porte, un objet, un visage.', 'Un allié invisible le temps d’un passage.'] },
  },
  {
    id: 'illusion.double',
    nom: 'Double',
    description: 'Une image décalée de l’allié, qui prend les coups à sa place.',
    nature: 'verbe',
    ecole: 'illusion',
    rang: 3,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: concentration('prochainTour'),
    effets: [{ type: 'etat', etat: 'double', duree: 'prochainTour', charges: 1 }],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: { effets: { '0': { charges: 2 } }, ajoute: [{ type: 'narratif', texte: 'Le double imite aussi la voix.', vise: 'lanceur' }] },
    },
    horsCombat: { paliers: ['Déguiser un PJ pour une scène.', 'Il imite la voix : Tromper compte une réussite de plus.'] },
  },
  {
    id: 'illusion.mirage',
    nom: 'Mirage',
    description: 'Une case paraît mur, fosse ou vide.',
    nature: 'verbe',
    ecole: 'illusion',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: concentration({ rounds: 3 }),
    effets: [{ type: 'terrain', nature: 'illusion', duree: { rounds: 3 } }],
    horsCombat: { paliers: ['Un faux décor, un lieu masqué.'] },
  },
  {
    id: 'illusion.illusion-vivante',
    nom: 'Illusion vivante',
    description: 'Un double combattant de l’Envoûteur, d’où ses sorts peuvent partir.',
    nature: 'verbe',
    ecole: 'illusion',
    rang: 5,
    etiquettes: ['combat', 'social'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'point', portee: 6 },
    resolution: { jet: 'aucun' },
    persistance: concentration('finCombat'),
    effets: [{ type: 'invocation', creature: 'double_illusoire', duree: 'finCombat' }],
    horsCombat: { paliers: ['Un faux PNJ qui tient une conversation.'] },
  },
];
