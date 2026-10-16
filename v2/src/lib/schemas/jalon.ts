import { z } from 'zod';

/*
 * Un cran de progression donné ou retiré par le MJ (lot L2.5 ; cadrage :
 * persos/{id}/jalons/{id}, un document par cran, en ajout seul). La fiche
 * n'en garde que le compte (progression.crans), écrit dans la même
 * transaction. Seule la barre du niveau existe avant 2.1 (Vécu).
 */
export const schemaJalon = z.strictObject({
  barre: z.literal('niveau'),
  delta: z.union([z.literal(1), z.literal(-1)]),
  libelle: z.string().max(80),
  parUid: z.string().min(1),
  creeLe: z.number().int().nonnegative(),
});
export type Jalon = z.infer<typeof schemaJalon>;
