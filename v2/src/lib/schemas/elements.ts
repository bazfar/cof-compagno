import { z } from 'zod';
import { ELEMENTS, schemaEffet, schemaElement, schemaSauvegarde } from './effets.ts';

/*
 * Les sept éléments (lot L4.2 ; doc « Refonte classes et magie — cadre »,
 * « Effet générique des éléments », validé). Chaque élément a son propre
 * effet générique, identique quel que soit le verbe, et son dérapage.
 *
 * Les effets courants (un état, un déplacement) sont des effets typés. Ce
 * qu'un élément change AU SORT lui-même est dans `modifie`, en champs
 * typés que le moteur de résolution lira (L4.3) :
 *   - pousseeEnPlus : cases ajoutées à une poussée du sort (eau) ;
 *   - rebond : une 2ᵉ cible proche prend une part des dégâts (électricité) ;
 *   - contreMetal : multiplicateur contre une armure de métal (électricité) ;
 *   - deSupplementaire : +1 dé payé en PV, en partie récupéré (sang) ;
 *   - sauvegarde / ignoreArmure : le sort vise une autre sauvegarde (psionique) ;
 *   - coutPvMultiplie : le dérapage du sang double le coût en PV.
 * Un sort mineur ne prend de l'élément que le type de dégâts (validé), sauf
 * avec la Voie du virtuose.
 *
 * `sauvegardeSiAucune` (lot L4.3, décisions 4a et 5a du 21/10/2026) : un
 * effet de l'élément conditionné à une sauvegarde ratée, porté par un sort
 * qui n'en a pas (Missile), se joue sur cette sauvegarde contre le DD du
 * sort, pour cet effet seulement : FOR pour la terre, Volonté pour le
 * psionique.
 */

const schemaModifications = z.strictObject({
  pousseeEnPlus: z.number().int().min(1).max(5).optional(),
  rebond: z.strictObject({ cases: z.number().int().min(1).max(5), part: z.literal('moitie') }).optional(),
  contreMetal: z.literal(2).optional(),
  deSupplementaire: z.strictObject({ payeEnPv: z.literal('coutDuSort'), recupere: z.literal('moitie') }).optional(),
  sauvegarde: z.literal('Volonte').optional(),
  ignoreArmure: z.literal(true).optional(),
  coutPvMultiplie: z.literal(2).optional(),
});

const schemaVolet = z.strictObject({
  /** Le texte du doc de cadre, montré aux joueurs. */
  texte: z.string().min(1),
  effets: z.array(schemaEffet).default([]),
  modifie: schemaModifications.default({}),
  /** Choix offert au lanceur à la place de l'effet (eau : retirer un état à un allié de la zone). */
  auChoix: z.array(schemaEffet).default([]),
  sauvegardeSiAucune: schemaSauvegarde.optional(),
});

export const schemaFicheElement = z.strictObject({
  id: schemaElement,
  nom: z.string().min(1),
  role: z.string().min(1),
  sort: schemaVolet,
  derapage: schemaVolet,
});
export type FicheElement = z.infer<typeof schemaFicheElement>;
export type FicheElementSaisie = z.input<typeof schemaFicheElement>;
export { ELEMENTS };
