import { z } from 'zod';
import { schemaFormuleDes, schemaId } from './commun.ts';
import { schemaEffet, schemaElement, schemaTypeDegats } from './effets.ts';

/*
 * Créatures invoquées (lot L4.4a) : familier, arme spirituelle, serviteurs
 * et mineurs de Légion. Doc « Refonte classes et magie — cadre », tableaux
 * d'Invocation et « Serviteurs (validé) ».
 *
 * Ce sont des jetons sur la battlemap qui agissent au tour du mage sans lui
 * coûter d'action (validé pour les serviteurs, étendu aux autres). Leurs
 * chiffres dépendent du lanceur : PV = k × niveau, DEF de base (+ mod de
 * magie pour les serviteurs), attaque au jet d'attaque magique du lanceur.
 * Décisions du 21/10/2026 : déplacement de 6 cases (3a) ; l'arme
 * spirituelle a PV = niveau et DEF 12, comme le familier (4a).
 */
export const schemaInvocation = z.strictObject({
  id: schemaId,
  nom: z.string().min(1),
  description: z.string().min(1),
  /** PV = `parNiveau` × niveau du lanceur, arrondi à l'inférieur ; ou la moitié de ses PV actuels (Illusion vivante, lot L4.5). */
  pv: z.union([z.strictObject({ parNiveau: z.number().min(0.5).max(10) }), z.strictObject({ moitiePvLanceur: z.literal(true) })]),
  /** DEF de base (+ mod de magie) ; ou celle du lanceur (Illusion vivante). */
  def: z.union([z.strictObject({ base: z.number().int().min(5).max(25), plusModMagie: z.boolean().default(false) }), z.strictObject({ commeLanceur: z.literal(true) })]),
  deplacement: z.number().int().min(0).max(30),
  vol: z.boolean().default(false),
  /** Frappe au jet d'attaque magique du lanceur ; null : elle n'attaque pas. */
  attaque: z
    .strictObject({ des: schemaFormuleDes, plusModMagie: z.boolean().default(false), typeDegats: schemaTypeDegats })
    .nullable(),
  /** Élément du corps (serviteurs) : ses coups portent l'effet générique de l'élément. */
  element: schemaElement.optional(),
  /** Ce qu'elle sait faire en plus de frapper ; `effets` vides : arbitré par le MJ. */
  capacites: z.array(z.strictObject({ nom: z.string().min(1), texte: z.string().min(1), effets: z.array(schemaEffet).default([]) })).default([]),
  /** PP ajoutés à la jauge de Remous du lieu au début de chaque round (validé pour les serviteurs). */
  remousParRound: z.number().min(0).max(3).default(0),
});
export type Invocation = z.infer<typeof schemaInvocation>;
export type InvocationSaisie = z.input<typeof schemaInvocation>;
