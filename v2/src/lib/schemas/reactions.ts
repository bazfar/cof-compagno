import { z } from 'zod';

/*
 * Les réactions en combat (lot L6.5b, décisions de Thomas du 26/10/2026).
 *   - 1a : le joueur ne joue pas sa réaction lui-même, hors de son tour : il
 *     la demande. Le client du MJ la joue d'office, avec le moteur, et
 *     écrit tout (coût, effets, journal) ; les règles des combattants ne
 *     s'élargissent pas ;
 *   - 2b : le client de celui qui bouge note les attaques d'opportunité que
 *     son pas ouvre : qui peut frapper qui, pour ce tour.
 */

/** Une case de la carte (la case d'arrivée d'un bond, 6b). */
const schemaCaseReaction = z.strictObject({ cx: z.number().int().min(0).max(499), cy: z.number().int().min(0).max(499) });
const schemaAxe = z.enum(['attaque', 'DEF', 'degats']);

export const STATUTS_REACTION = ['attente', 'jouee', 'refusee'] as const;

/** La demande d'un joueur : sa réaction, sa cible, ses choix ; le MJ la passe à `jouee` ou `refusee`, avec le texte. */
export const schemaDemandeReaction = z.strictObject({
  /** Le combattant qui réagit (son PJ). */
  qui: z.string().min(1).max(150),
  uid: z.string().min(1).max(128),
  /** L'action des données (src/regles). */
  reaction: z.string().min(1).max(80),
  cible: z.string().min(1).max(150).nullable(),
  /** 6b : la case où il bondit (Esquive acrobatique, Repli). */
  case: schemaCaseReaction.nullable(),
  /** Changement de posture. */
  posture: z.strictObject({ plus: schemaAxe, moins: schemaAxe, valeur: z.number().int().min(1).max(20) }).nullable(),
  /** L'attaque d'opportunité qu'il prend (son identifiant). */
  opportunite: z.string().min(1).max(200).nullable(),
  tour: z.number().int().min(1).max(99999),
  statut: z.enum(STATUTS_REACTION),
  /** Ce que le MJ a joué, ou pourquoi c'est refusé. */
  texte: z.string().min(1).max(300).nullable(),
  creeLe: z.number().int(),
});
export type DemandeReaction = z.infer<typeof schemaDemandeReaction>;

/** 2b : un pas qui quitte le contact d'un ennemi ouvre son attaque d'opportunité, ce tour. */
export const schemaOpportunite = z.strictObject({
  attaquant: z.string().min(1).max(150),
  /** Celui qui bouge. */
  cible: z.string().min(1).max(150),
  tour: z.number().int().min(1).max(99999),
  creeLe: z.number().int(),
});
export type Opportunite = z.infer<typeof schemaOpportunite>;
