import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * La Voie du chant du Barde, son école (lot L4.8). Source : doc « Refonte
 * classes et magie — cadre », « Barde — Inspiration » et tableau « Verbes
 * des hybrides (validé) » : même formule de coût que les lanceurs, payée
 * sur la réserve réduite, DD = 10 + mod de CHA ; le chant reste Adepte,
 * comme les Cercles ; un boost d'Inspiration par sort (+1 cible ou +1
 * round).
 *
 * Décisions verrouillées (Thomas, 21/10/2026) :
 *   - Note discordante vise l'attaque ou la DEF, au choix au lancer (1b) ;
 *     portée 6 cases, comme les portées non données ;
 *   - Ballade II : tous les alliés à 7 cases, portée de voix (2a) ;
 *   - Requiem du silence : rayon 2 à 6 cases, 2 rounds, sans sauvegarde ;
 *     personne dans la zone ne lance de sort ni ne crie, alliés compris
 *     (3a) ;
 *   - Contre-chant retire Charmé, Fasciné, Dominé, Commandé, Effroi ou
 *     Silence (4a).
 * Chant brisant garde sa portée v1 (7 cases) et ne touche que les ennemis,
 * comme en v1.
 */

export const CHANT: ActionSaisie[] = [
  {
    id: 'chant.note-discordante',
    nom: 'Note discordante',
    description: 'Une note fausse qui fait trembler la main ou la garde.',
    nature: 'verbe',
    ecole: 'chant',
    rang: 1,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'bonus', cible: 'attaque', valeur: -2, duree: { rounds: 2 } }],
    variantes: [{ id: 'def', nom: 'Sur la DEF', palier: 'I', delta: { effets: { '0': { cible: 'DEF' } } } }],
    paliers: { II: { effets: { '0': { valeur: -3 } } }, III: { ciblage: { nbCibles: 2 } } },
    horsCombat: { paliers: ['Couvrir une conversation.', 'Perturber un discours.', 'Faire échouer une négociation adverse : le PNJ perd une réussite.'] },
  },
  {
    id: 'chant.ballade',
    nom: 'Ballade',
    description: 'Un chant qui donne du cœur au bras.',
    nature: 'verbe',
    ecole: 'chant',
    rang: 2,
    etiquettes: ['combat', 'social'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'attaque', valeur: 1, duree: { rounds: 2 } }],
    paliers: {
      II: { ciblage: { type: 'soi', portee: 'soi' }, zone: { forme: 'cercle', taille: 7, origine: 'lanceur', filtre: 'allies' }, effets: { '0': { vise: 'zone' } } },
    },
    horsCombat: { paliers: ['Gagner une foule : compte une réussite sociale.', 'Tout le groupe a +1 aux jets sociaux pour la scène.'] },
  },
  {
    id: 'chant.chant-brisant',
    nom: 'Chant brisant',
    description: 'Une note si haute que les rangs ennemis se défont.',
    nature: 'verbe',
    ecole: 'chant',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 7 },
    zone: { forme: 'carre', taille: 3, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [
      { type: 'bonus', cible: 'attaque', valeur: -2, duree: { rounds: 2 }, vise: 'zone' },
      { type: 'bonus', cible: 'DEF', valeur: -2, duree: { rounds: 2 }, vise: 'zone' },
    ],
    paliers: { II: { zone: { forme: 'cercle', taille: 2 } } },
    horsCombat: { paliers: ['Briser du verre ou un objet fragile.', 'Faire céder une serrure ou une vitre blindée.'] },
  },
  {
    id: 'chant.contre-chant',
    nom: 'Contre-chant',
    description: 'Il couvre le chant ennemi et libère un allié.',
    nature: 'verbe',
    ecole: 'chant',
    rang: 4,
    etiquettes: ['combat', 'social'],
    action: 'reaction',
    declencheur: 'effetSonOuCharme',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'retraitEtat', etats: ['charme', 'fascine', 'domine', 'commande', 'effroi', 'silence'], nombre: 1 }],
    horsCombat: { paliers: ['Protéger le groupe d’un charme pour la scène.'] },
  },
  {
    id: 'chant.requiem-du-silence',
    nom: 'Requiem du silence',
    description: 'Une dernière note, puis plus rien : ni sort ni cri.',
    nature: 'verbe',
    ecole: 'chant',
    rang: 5,
    etiquettes: ['combat', 'social'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'aucun' },
    persistance: { type: 'zone', duree: { rounds: 2 }, quand: 'entree' },
    effets: [{ type: 'etat', etat: 'silence', duree: { rounds: 2 }, vise: 'zone' }],
    horsCombat: { paliers: ['Faire taire une salle entière.'] },
  },
];
