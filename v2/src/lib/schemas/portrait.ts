import { z } from 'zod';

/*
 * Portrait d'un personnage (lot L2.3, décision 6a) :
 * tables/{table}/persos/{id}/images/portrait. Hors de la fiche, pour que la
 * fiche reste légère : chaque écriture de PV ne renvoie pas l'image à toute
 * la table. Compressé dans le navigateur (lib/fiche/portrait.ts), en data
 * URL, comme en v1 (256 px de côté, JPEG). Sert d'avatar et d'image du jeton.
 */

/** Taille maximale de la data URL (une image de 256 px pèse ≈ 20 à 40 Ko). */
export const LIMITE_PORTRAIT = 150_000;
/** Côté maximal en pixels (v1 : 256). */
export const COTE_PORTRAIT = 256;
export const PREFIXE_PORTRAIT = /^data:image\/(jpeg|webp|png);base64,/;

export const schemaPortrait = z.strictObject({
  image: z.string().max(LIMITE_PORTRAIT).regex(PREFIXE_PORTRAIT),
  majLe: z.number().int().nonnegative(),
});
export type Portrait = z.infer<typeof schemaPortrait>;
