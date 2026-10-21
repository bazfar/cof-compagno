import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * École d'Abjuration (lot L4.4a). Source : doc « Refonte classes et magie
 * — cadre », « Verbes des autres écoles (validé) » et « Hors combat ».
 *
 * Décisions verrouillées :
 *   - Bouclier : le bonus de DEF s'applique à l'attaque qui le déclenche
 *     (il peut la faire rater) ; au palier III, au choix +3 DEF ou deux
 *     cibles (variante) ;
 *   - Rempart : un mur sur la carte (mur de force de la battlemap, L5.4),
 *     qui bloque le passage et la vue, couverture totale ; il peut porter un
 *     élément (décision 1b du 21/10/2026) ;
 *   - Dissipation contre un sort ennemi : d20 + mod de magie contre le DD
 *     de ce sort (décision 2a du 21/10/2026), appliqué par le combat (L6) ;
 *   - Renvoi : la moitié retenue revient au lanceur du sort.
 * Portées absentes du cadre (Rempart, Dissipation) : 6 cases, à confirmer.
 */
export const ABJURATION: ActionSaisie[] = [
  {
    id: 'abjuration.bouclier',
    nom: 'Bouclier',
    description: 'Un éclat de force qui se dresse au moment du coup.',
    nature: 'verbe',
    ecole: 'abjuration',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'reaction',
    declencheur: 'attaqueVisee',
    ciblage: { type: 'soi', portee: 'soi' },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 2, duree: 'prochainTour' }],
    paliers: {
      II: { ciblage: { type: 'creature', camp: 'allie', portee: 6 } },
      III: { effets: { '0': { valeur: 3 } } },
    },
    variantes: [{ id: 'deux-cibles', nom: 'Deux cibles à +2 DEF', palier: 'III', delta: { ciblage: { nbCibles: 2 } } }],
    horsCombat: {
      paliers: [
        'Les dégâts d’un piège ou d’une chute sont réduits de moitié.',
        'La même protection, pour un allié.',
        'La même protection, pour deux.',
      ],
    },
  },
  {
    id: 'abjuration.rempart',
    nom: 'Rempart',
    description: 'Un mur de force qui coupe le champ de bataille.',
    nature: 'verbe',
    ecole: 'abjuration',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'ligne', taille: 3, origine: 'point' },
    resolution: { jet: 'aucun' },
    persistance: { type: 'zone', duree: { rounds: 2 } },
    effets: [{ type: 'terrain', nature: 'bloquant', duree: { rounds: 2 } }],
    element: { application: 'chaqueCible' },
    paliers: {
      II: { zone: { taille: 5 }, persistance: { duree: { rounds: 3 } }, effets: { '0': { duree: { rounds: 3 } } } },
    },
    horsCombat: { paliers: ['Barricader un passage pour la scène.', 'Bloquer un pont ou un couloir plusieurs heures.'] },
  },
  {
    id: 'abjuration.dissipation',
    nom: 'Dissipation',
    description: 'Défait un état ou un sort.',
    nature: 'verbe',
    ecole: 'abjuration',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'dissipation', nombre: 1 }],
    paliers: {
      II: { zone: { forme: 'cercle', taille: 1, origine: 'cible' }, effets: { '0': { vise: 'zone' } } },
    },
    horsCombat: { paliers: ['Défaire un sceau, une illusion ou un piège magique.', 'Défaire tous les effets magiques d’une pièce.'] },
  },
  {
    id: 'abjuration.renvoi',
    nom: 'Renvoi',
    description: 'Retourne contre son lanceur une part du sort qui frappe.',
    nature: 'verbe',
    ecole: 'abjuration',
    rang: 4,
    etiquettes: ['combat', 'exploration'],
    action: 'reaction',
    declencheur: 'sortCible',
    ciblage: { type: 'creature', camp: 'allie', portee: 1 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'reductionDegats', part: 'moitie', renvoi: true }],
    horsCombat: { paliers: ['Retourner une divination : celui qui espionne est vu.'] },
  },
  {
    id: 'abjuration.sanctuaire',
    nom: 'Sanctuaire',
    description: 'Un cercle que rien d’extérieur ne peut viser.',
    nature: 'verbe',
    ecole: 'abjuration',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'soi', portee: 'soi' },
    zone: { forme: 'cercle', taille: 1, origine: 'lanceur' },
    resolution: { jet: 'aucun' },
    persistance: { type: 'zone', duree: { rounds: 2 } },
    effets: [{ type: 'terrain', nature: 'sanctuaire', duree: { rounds: 2 } }],
    horsCombat: { paliers: ['Un repos long sans rencontre.'] },
  },
];
