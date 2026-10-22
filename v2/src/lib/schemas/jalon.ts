import { z } from 'zod';

/*
 * Un cran de progression donné ou retiré par le MJ (lot L2.5 ; cadrage :
 * persos/{id}/jalons/{id}, un document par cran, en ajout seul). La fiche
 * n'en garde que le compte (progression.crans), écrit dans la même
 * transaction. La barre du Vécu (lot L4.18) a ses crans ici aussi :
 * `vecu.crans`, `paliers` et `points` en tiennent le compte.
 *
 * `seance` (L3.1) : la séance ouverte quand le cran a été donné, pour
 * l'historique ; absent hors séance.
 */
export const schemaJalon = z.strictObject({
  barre: z.enum(['niveau', 'vecu']),
  delta: z.union([z.literal(1), z.literal(-1)]),
  libelle: z.string().max(80),
  parUid: z.string().min(1),
  seance: z.string().min(1).max(100).optional(),
  creeLe: z.number().int().nonnegative(),
});
export type Jalon = z.infer<typeof schemaJalon>;
