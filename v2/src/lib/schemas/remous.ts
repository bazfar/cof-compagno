import { z } from 'zod';

/*
 * La jauge de Remous d'un lieu (lot L6.7b, 5a) : tables/{table}/remous/{scène}.
 * Lue de toute la table. Le MJ l'écrit ; un joueur ne fait que l'alimenter
 * (ses sorts, sa Plongée), au nom de son personnage joué (firestore.rules).
 *   - total : les PP cumulés (la jauge ne retombe que quand le MJ la vide) ;
 *   - membrane : absente, elle est épaisse ;
 *   - contributions : par personnage (ou « mj »), pour la Traque du remueur (10a).
 */
export const schemaRemous = z.strictObject({
  total: z.number().int().min(0).max(9999),
  membrane: z.enum(['epaisse', 'amincie', 'fine', 'dechiree']).default('epaisse'),
  contributions: z.record(z.string().min(1).max(150), z.number().int().min(0).max(9999)).default({}),
  majLe: z.number().int().nonnegative().optional(),
});
export type Remous = z.infer<typeof schemaRemous>;
