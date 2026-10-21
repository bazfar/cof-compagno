import type { ActionSaisie } from '../lib/schemas/effets';

/*
 * Sorts mineurs (lot L4.4b1), palier I. Source : doc « Refonte classes et
 * magie — cadre », « Sorts mineurs (niveau 0) » et « Sorts mineurs par
 * classe (validé) » : 0 PP, à volonté ; dégâts à l'attaque magique, dont le
 * dé suit le niveau (1d6, 1d8, 1d10) ; un élément ne leur donne que son
 * type de dégâts, sauf avec la Voie du virtuose. Trait arcanique porte à 10
 * cases (décision 16a du 21/10/2026).
 * Les paliers II et III (Voie du virtuose) arrivent en L4.4b2.
 */

const horsCombat = (id: string, nom: string, description: string, texte: string): ActionSaisie => ({
  id,
  nom,
  description,
  nature: 'mineur',
  rang: 0,
  etiquettes: ['exploration'],
  action: 'action',
  ciblage: { type: 'aucun', portee: 'soi' },
  resolution: { jet: 'aucun' },
  effets: [{ type: 'narratif', texte, vise: 'lanceur' }],
  horsCombat: { paliers: [texte] },
});

export const MINEURS: ActionSaisie[] = [
  {
    id: 'mineur.trait-arcanique',
    nom: 'Trait arcanique',
    description: 'Un trait de force, à volonté.',
    nature: 'mineur',
    ecole: 'evocation',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'magique', progression: 'mineur' }],
    element: { application: 'ciblePrincipale' },
  },
  horsCombat('mineur.main-du-mage', 'Main du mage', 'Une main invisible.', 'Déplacer un petit objet à distance.'),
  horsCombat('mineur.lumiere', 'Lumière', 'Une lueur qui suit le mage.', 'Éclairer.'),
  horsCombat('mineur.detection-magie', 'Détection de la magie', 'Le mage sent les auras.', 'Sentir une aura magique à 6 cases.'),
  horsCombat('mineur.prestidigitation', 'Prestidigitation', 'Petits tours de magie.', 'Nettoyer, chauffer, faire un petit tour de magie.'),
];
