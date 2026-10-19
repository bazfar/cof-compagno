import { z } from 'zod';

/*
 * Rencontres préparées (lot L3.5, décisions du 19/10/2026) :
 * tables/{table}/rencontres/{id}, lisibles et écrites par le MJ seul (elles
 * nomment les monstres du bestiaire). Une rencontre porte sa scène, ses
 * monstres placés d'avance sur la carte, et le butin prévu, envoyé au vote
 * (L3.4) à la fin du combat. Le combat lui-même (initiative, tours, PV et
 * états des monstres) vient avec le module combat (L6).
 */

const schemaCoord = z.number().int().min(0).max(499);

export const schemaMonstreRencontre = z.strictObject({
  /** Clé unique dans la rencontre ; le jeton posé s'appelle `m-<rencontre>-<cle>`. */
  cle: z.string().regex(/^[a-z0-9_-]{1,60}$/),
  /** Identifiant du monstre dans le bestiaire du MJ (L3.2). */
  monstre: z.string().min(1).max(100),
  /** Nom affiché sur le jeton, vu par les joueurs (le MJ peut le changer). */
  nom: z.string().trim().min(1).max(40),
  /** Case choisie dans l'aperçu ; null tant qu'il n'est pas placé. */
  cx: schemaCoord.nullable(),
  cy: schemaCoord.nullable(),
});
export type MonstreRencontre = z.infer<typeof schemaMonstreRencontre>;

export const schemaButinPrevu = z.strictObject({
  /** Objet du catalogue. */
  objet: z.string().min(1).max(100),
  combien: z.number().int().min(1).max(99),
});
export type ButinPrevu = z.infer<typeof schemaButinPrevu>;

export const schemaRencontre = z.strictObject({
  nom: z.string().trim().min(1).max(80),
  scene: z.string().min(1).max(100).nullable(),
  monstres: z.array(schemaMonstreRencontre).max(60),
  butin: z.array(schemaButinPrevu).max(30),
  statut: z.enum(['preparee', 'lancee']),
  creeLe: z.number().int().nonnegative(),
  majLe: z.number().int().nonnegative(),
  lanceeLe: z.number().int().nonnegative().nullable(),
  butinEnvoyeLe: z.number().int().nonnegative().nullable(),
});
export type Rencontre = z.infer<typeof schemaRencontre>;

/** Ce que le MJ modifie dans l'éditeur. */
export type BrouillonRencontre = Pick<Rencontre, 'nom' | 'scene' | 'monstres' | 'butin'>;
