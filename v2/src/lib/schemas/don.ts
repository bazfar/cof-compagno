import { z } from 'zod';
import { schemaObjetFiche } from './fiche.ts';

/*
 * Don d'objet entre joueurs (lot L3.3, décision du 18/10/2026 : proposé
 * puis accepté). tables/{table}/dons/{id}.
 *
 * L'objet est MIS DE CÔTÉ dans le document du don dès la proposition :
 * il quitte le sac du donneur dans la même transaction. Il n'existe donc
 * qu'à un endroit à la fois (sac du donneur, don, ou sac du receveur) :
 * rien ne se perd ni ne se duplique, même si les deux joueurs cliquent en
 * même temps.
 *
 * Statuts : propose → accepte (le receveur le range) | refuse (le receveur
 * décline) → repris (le donneur le récupère) | annule (le donneur le
 * reprend avant réponse).
 */
export const STATUTS_DON = ['propose', 'accepte', 'refuse', 'repris', 'annule'] as const;
export type StatutDon = (typeof STATUTS_DON)[number];

export const schemaDon = z.strictObject({
  deUid: z.string().min(1),
  dePerso: z.string().min(1),
  deNom: z.string().min(1).max(80),
  aUid: z.string().min(1),
  aPerso: z.string().min(1),
  aNom: z.string().min(1).max(80),
  objet: schemaObjetFiche,
  statut: z.enum(STATUTS_DON),
  creeLe: z.number().int().nonnegative(),
  resoluLe: z.number().int().nonnegative().nullable(),
});
export type Don = z.infer<typeof schemaDon>;
