import { z } from 'zod';

/*
 * Schémas des documents d'accès. Ils sont la seule définition de la forme
 * de ces documents : l'écriture (actions), la lecture (magasins) et les
 * tests s'en servent tous. Les champs autorisés doivent rester alignés avec
 * les `hasOnly([...])` de firestore.rules.
 */

export const schemaNom = z
  .string()
  .trim()
  .min(1, 'Le nom est obligatoire.')
  .max(40, 'Le nom ne doit pas dépasser 40 caractères.');

/** tables/{table}/joueurs/{uid} */
export const schemaJoueur = z.object({
  nom: schemaNom,
  couleur: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  persoActif: z.string().optional(),
  /** Le joueur a choisi un code perso (correctif du 19/10) : le MJ voit qui peut se retrouver ailleurs. */
  protege: z.boolean().optional(),
  rejointLe: z.number().int().nonnegative(),
});
export type Joueur = z.infer<typeof schemaJoueur>;

/** tables/{table}/mjs/{uid} — le champ `code` est stocké mais jamais relu par l'app. */
export const schemaMj = z.object({
  nom: schemaNom,
  rejointLe: z.number().int().nonnegative(),
});
export type Mj = z.infer<typeof schemaMj>;
