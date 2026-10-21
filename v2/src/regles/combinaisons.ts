import type { CombinaisonSaisie } from '../lib/schemas/elements';

/*
 * Les combinaisons signature de deux éléments (lot L4.10). Source : doc
 * « Refonte classes et magie — cadre », « Combinaisons de Maître » : les
 * sept paires que le cadre donne en exemple.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - ces sept paires ont leur signature, qui remplace les deux effets
 *     génériques ; les quatorze autres appliquent les deux effets génériques
 *     à la suite ; d'autres signatures viendront « si on est inspiré » (12a) ;
 *   - quand le second élément n'est pas Maître, l'effet est réduit de
 *     moitié : durées divisées par deux, arrondies au supérieur, dégâts en
 *     plus divisés par deux (13a) ;
 *   - chiffres des signatures proposés par Claude et retenus tels quels
 *     (14a) ;
 *   - tout lanceur qui a un élément Maître et un second élément combine
 *     (15a).
 * L'ordre des éléments ne compte pas : feu + glace et glace + feu donnent
 * la même Vapeur.
 */
export const COMBINAISONS: CombinaisonSaisie[] = [
  {
    id: 'vapeur',
    nom: 'Vapeur',
    elements: ['feu', 'glace'],
    texte: 'Une vapeur brûlante qui aveugle : Aveuglé 1 round, CON.',
    sauvegarde: 'CON',
    effets: [{ type: 'etat', etat: 'aveugle', duree: { rounds: 1 }, condition: 'sauvegardeRatee' }],
  },
  {
    id: 'zone-electrifiee',
    nom: 'Zone électrifiée',
    elements: ['eau', 'electricite'],
    texte: 'Le sol autour de la cible (rayon 1) est électrifié 2 rounds : 1d6 à qui y entre ou y commence son tour.',
    effets: [{ type: 'terrain', nature: 'electrifie', duree: { rounds: 2 } }],
  },
  {
    id: 'lave',
    nom: 'Lave',
    elements: ['feu', 'terre'],
    texte: 'La roche fond : terrain enflammé 2 rounds, et Brûlure.',
    effets: [
      { type: 'terrain', nature: 'enflamme', duree: { rounds: 2 } },
      { type: 'etat', etat: 'brulure', duree: { rounds: 2 } },
    ],
  },
  {
    id: 'gel',
    nom: 'Gel',
    elements: ['glace', 'eau'],
    texte: 'L’eau gèle sur la cible : Immobilisé 1 round, FOR.',
    sauvegarde: 'FOR',
    effets: [{ type: 'etat', etat: 'immobilise', duree: { rounds: 1 }, condition: 'sauvegardeRatee' }],
  },
  {
    id: 'onde-sismique',
    nom: 'Onde sismique',
    elements: ['terre', 'electricite'],
    texte: 'Le sol tremble autour de la cible : 1d6 et Renversé à tout ce qui est à 1 case d’elle, FOR.',
    sauvegarde: 'FOR',
    effets: [
      { type: 'degats', des: '1d6', typeDegats: 'terre', vise: 'voisins' },
      { type: 'etat', etat: 'renverse', duree: { rounds: 1 }, condition: 'sauvegardeRatee', vise: 'voisins' },
    ],
  },
  {
    id: 'emprise',
    nom: 'Emprise',
    elements: ['sang', 'psionique'],
    texte: 'Le sang obéit à l’esprit : Dominé 1 round, Volonté ; les boss y échappent.',
    sauvegarde: 'Volonte',
    effets: [{ type: 'etat', etat: 'domine', duree: { rounds: 1 }, condition: 'sauvegardeRatee', saufBoss: true }],
  },
  {
    id: 'brulure-qui-draine',
    nom: 'Brûlure qui draine',
    elements: ['feu', 'sang'],
    texte: 'Une Brûlure dont les dégâts reviennent au lanceur en PV.',
    effets: [{ type: 'etat', etat: 'brulure', duree: { rounds: 2 }, draine: true }],
  },
];
