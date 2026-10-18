import { z } from 'zod';

/*
 * Un cran de progression donné ou retiré par le MJ (lot L2.5 ; cadrage :
 * persos/{id}/jalons/{id}, un document par cran, en ajout seul). La fiche
 * n'en garde que le compte (progression.crans), écrit dans la même
 * transaction. Seule la barre du niveau existe avant 2.1 (Vécu).
 *
 * `seance` (L3.1) : la séance ouverte quand le cran a été donné, pour
 * l'historique ; absent hors séance.
 */
export const schemaJalon = z.strictObject({
  barre: z.literal('niveau'),
  delta: z.union([z.literal(1), z.literal(-1)]),
  libelle: z.string().max(80),
  parUid: z.string().min(1),
  seance: z.string().min(1).max(100).optional(),
  creeLe: z.number().int().nonnegative(),
});
export type Jalon = z.infer<typeof schemaJalon>;
