import { z } from 'zod';

/*
 * Séances (lot L3.1, décisions du 18/10/2026) : tables/{table}/seances/{id}.
 * Le MJ ouvre et clôt la séance, et coche les présents (des uid de
 * joueurs) : les crans de niveau vont aux personnages joués par les
 * présents (cadrage : « crans de niveau donnés aux présents seulement »).
 *
 * La séance ouverte est aussi notée dans le document de la table
 * (`seanceOuverte`, schemaTable), pour que tous la voient d'un seul
 * abonnement, sans lire les séances.
 */
export const schemaSeance = z.strictObject({
  numero: z.number().int().min(1).max(9999),
  ouverteLe: z.number().int().nonnegative(),
  /** null tant que la séance est ouverte. */
  closeLe: z.number().int().nonnegative().nullable(),
  presents: z.array(z.string().min(1)).max(50),
});
export type Seance = z.infer<typeof schemaSeance>;

/** Ce que porte le document de la table quand une séance est ouverte. */
export const schemaSeanceOuverte = z.strictObject({
  id: z.string().min(1),
  numero: z.number().int().min(1).max(9999),
});
export type SeanceOuverte = z.infer<typeof schemaSeanceOuverte>;
