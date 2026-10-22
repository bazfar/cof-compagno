import { z } from 'zod';
import { PALIERS, schemaSauvegarde } from './effets';

/*
 * Sort lancé hors combat, hors scène (lot G2a, décisions de Thomas du
 * 22/10/2026). tables/{t}/sortsHorsCombat/{id} : une demande du joueur,
 * que le MJ et ce joueur lisent seuls.
 *
 * Le parcours (5b, 15b, 14b) :
 *   1. le joueur demande : sort, palier (au plus celui atteint, 2b), une
 *      ligne d'intention (1a) ; le coût et le DD sont calculés par son
 *      client depuis la fiche ;
 *   2. le MJ accepte ou refuse, avec un motif possible ; un refus ne coûte
 *      rien ;
 *   3. accepté, le joueur lance : ses PP baissent, le jet d'échec part si
 *      l'école est Non maîtrisée ou Initiée (6a, 4a) ; le sort est noté au
 *      journal (9a) ;
 *   4. si le verbe a une sauvegarde, le MJ lance celle de la cible contre
 *      le DD (14b). Sinon, le MJ apprécie (7).
 * Rien n'a d'effet automatique : chaque palier ouvre des possibilités, le
 * reste s'apprécie entre le joueur et le MJ (7).
 */

export const STATUTS_SORT = ['attente', 'acceptee', 'refusee', 'lancee', 'ratee'] as const;
export type StatutSort = (typeof STATUTS_SORT)[number];

export const schemaResistance = z.strictObject({
  de: z.number().int().min(1).max(20),
  bonus: z.number().int().min(-10).max(30),
  reussie: z.boolean(),
});

export const schemaDemandeSort = z
  .strictObject({
    uid: z.string().min(1).max(128),
    /** Identifiant du personnage, et son nom. */
    perso: z.string().min(1).max(100),
    nom: z.string().min(1).max(40),
    sort: z.string().min(1).max(60),
    nomSort: z.string().min(1).max(60),
    palier: z.enum(PALIERS),
    /** Coût hors combat (6a : la moitié du coût en combat ; 0 pour un mineur, 3a). */
    pp: z.number().int().min(0).max(20),
    /** Plus haut d20 qui fait rater le sort (6a), 0 si jamais. */
    echec: z.number().int().min(0).max(20),
    sauvegarde: schemaSauvegarde.nullable(),
    dd: z.number().int().min(5).max(40).nullable(),
    intention: z.string().trim().min(1).max(120),
    /** Ce qu'ouvrent les paliers jusqu'au palier lancé (7), pour le MJ. */
    textes: z.array(z.string().min(1).max(300)).min(1).max(3),
    statut: z.enum(STATUTS_SORT),
    motif: z.string().trim().min(1).max(120).nullable(),
    /** Le d20 du jet d'échec, s'il y en a eu un. */
    de: z.number().int().min(1).max(20).nullable(),
    resistance: schemaResistance.nullable(),
    creeLe: z.number().int().nonnegative(),
    majLe: z.number().int().nonnegative(),
  })
  .superRefine((d, ctx) => {
    if ((d.sauvegarde === null) !== (d.dd === null)) ctx.addIssue({ code: 'custom', message: 'une sauvegarde a un DD, et seulement elle', path: ['dd'] });
    if (d.resistance && (d.statut !== 'lancee' || d.sauvegarde === null)) ctx.addIssue({ code: 'custom', message: 'la cible ne résiste qu’à un sort lancé qui a une sauvegarde', path: ['resistance'] });
    if (d.de !== null && d.statut !== 'lancee' && d.statut !== 'ratee') ctx.addIssue({ code: 'custom', message: 'le jet d’échec part au lancement', path: ['de'] });
  });
export type DemandeSort = z.infer<typeof schemaDemandeSort>;
