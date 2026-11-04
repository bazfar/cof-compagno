import { z } from 'zod';

/*
 * Le repos (lot L7.1a, décisions de Thomas du 29/10/2026). Voir
 * src/regles/repos.ts.
 *   - `reposEnAttente/{perso}` : le jet de PV qu'un repos a ouvert (4b :
 *     chaque joueur lance le sien, comme en v1) ; le MJ l'écrit, le joueur
 *     le lance et le retire ;
 *   - `repos/etat` : les repos courts de chaque personnage depuis son
 *     dernier repos long (5b), tenus par le MJ.
 */

/** Une formule de dés de repos : « 2d8+1d6+2 », « 1d4 », « 3d10-1 ». */
export const FORMULE_REPOS = /^\d{1,2}d\d{1,2}(\+\d{1,2}d\d{1,2})*([+-]\d{1,2})?$/;

export const schemaReposEnAttente = z.strictObject({
  nom: z.string().min(1).max(40),
  quoi: z.enum(['court', 'long']),
  formule: z.string().max(40).regex(FORMULE_REPOS),
  creeLe: z.number().int().nonnegative(),
});
export type ReposEnAttente = z.infer<typeof schemaReposEnAttente>;

export const schemaEtatRepos = z.strictObject({
  courts: z.record(z.string().min(1).max(150), z.number().int().min(0).max(9)).default({}),
  majLe: z.number().int().nonnegative(),
});
export type EtatRepos = z.infer<typeof schemaEtatRepos>;
