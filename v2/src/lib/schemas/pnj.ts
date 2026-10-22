import { z } from 'zod';
import { CRANS_ATTITUDE } from '../../regles/attitude';

/*
 * PNJ et leur attitude (lot S1, décisions de Thomas du 22/10/2026).
 *
 * tables/{table}/pnj/{id} (3a) : écrit par le MJ seul. Les joueurs ne
 * lisent que les PNJ rencontrés (6a, 7a ; requête `rencontre == true`,
 * que les règles prouvent) : leur nom, leur faction, leur cran et le sens
 * du dernier changement (18a). Rien de secret n'y est écrit : la fiche du
 * PNJ reste dans le lore, où le MJ décide ce que les joueurs lisent.
 *
 * Un PNJ importé du lore porte l'identifiant de sa fiche (`pnj-<id v1>`) :
 * `lore` la désigne, et un second import ne crée pas de doublon.
 *
 * tables/{table}/pnj/{id}/historique/{geste} : chaque changement d'attitude,
 * avec son motif (le service rendu en demande un, 17a). Le MJ seul le lit.
 */

export const schemaCran = z.enum(CRANS_ATTITUDE);
const schemaFaction = z.string().regex(/^[a-z_]+$/);

export const schemaPnj = z
  .strictObject({
    nom: z.string().trim().min(1).max(80),
    /** Faction de la réputation (un des blocs de Libris), ou null. */
    faction: schemaFaction.nullable(),
    /** Fiche de lore du PNJ (même identifiant côté MJ et côté joueurs). */
    lore: z.string().regex(/^[a-z0-9_.-]{1,100}$/).nullable(),
    /** Pas encore rencontré : invisible des joueurs, sans cran (4a : le départ se fixe à la rencontre). */
    rencontre: z.boolean(),
    cran: schemaCran.nullable(),
    /** Sens du dernier changement de cran (18a) ; null avant tout changement. */
    tendance: z.enum(['hausse', 'baisse']).nullable(),
    /** Mensonges réussis en scène, pas encore découverts (S2, 9a). Absent des PNJ créés par S1 : 0. */
    mensonges: z.number().int().min(0).max(99).default(0),
    creeLe: z.number().int().nonnegative(),
    majLe: z.number().int().nonnegative(),
  })
  .superRefine((p, ctx) => {
    if (p.rencontre !== (p.cran !== null)) ctx.addIssue({ code: 'custom', message: 'un PNJ rencontré a un cran ; un PNJ pas encore rencontré n’en a pas', path: ['cran'] });
  });
export type Pnj = z.infer<typeof schemaPnj>;

/** `scene` et `mensonge` : clôture d'une scène et mensonge découvert (lot S2). */
export const GESTES_ATTITUDE = ['rencontre', 'service', 'correction', 'scene', 'mensonge'] as const;
export type GesteAttitude = (typeof GESTES_ATTITUDE)[number];

export const schemaGesteAttitude = z.strictObject({
  geste: z.enum(GESTES_ATTITUDE),
  avant: schemaCran.nullable(),
  apres: schemaCran,
  motif: z.string().trim().min(1).max(120),
  parUid: z.string().min(1),
  /** Séance ouverte au moment du geste, s'il y en a une. */
  seance: z.string().min(1).max(40).optional(),
  creeLe: z.number().int().nonnegative(),
});
export type GesteAttitudeEnregistre = z.infer<typeof schemaGesteAttitude>;
