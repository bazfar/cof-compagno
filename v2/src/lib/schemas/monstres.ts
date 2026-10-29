import { z } from 'zod';
import { schemaFormuleDes } from './commun.ts';
import { schemaSauvegarde } from './effets.ts';

/*
 * Les effets des attaques du bestiaire, traduits en données (lot L6.6a,
 * décision 6b de Thomas du 28/10/2026) : src/regles/monstres.ts. Chaque
 * entrée ne dit que ce que le texte du bestiaire dit (`effetSpecial`) ;
 * ce qu'elle ne sait pas dire (une condition, un effet sans état) reste au
 * MJ, en texte. Une attaque sans entrée garde son texte entier pour le MJ.
 */
export const schemaEffetAttaqueMonstre = z.strictObject({
  /** Utilisations par combat. */
  parCombat: z.number().int().min(1).max(5).optional(),
  /** Une fois par round. */
  unParRound: z.literal(true).optional(),
  /** Servie, elle revient après ce nombre de rounds. */
  recharge: z.number().int().min(1).max(10).optional(),
  /** Jets d'attaque séparés, en une action. */
  jets: z.number().int().min(2).max(3).optional(),
  /** Critique dès ce d20. */
  critique: z.number().int().min(15).max(19).optional(),
  /** Points de DEF de la cible qu'elle ignore. */
  defIgnoree: z.number().int().min(1).max(10).optional(),
  /** Touchée, la cible sauvegarde ; ratée, ce qui suit s'applique. Sans sauvegarde, ce qui suit s'applique à la touche. */
  sauvegarde: z.strictObject({ type: schemaSauvegarde, dd: z.number().int().min(5).max(30) }).optional(),
  /** États du catalogue de la refonte ; `rounds` null : jusqu'à ce que le MJ le retire. */
  etats: z.array(z.strictObject({ id: z.string().min(1).max(60), rounds: z.number().int().min(1).max(20).nullable(), des: schemaFormuleDes.optional() })).max(3).optional(),
  /** Malus chiffrés (bonus du combat) ; `rounds` null : jusqu'à la fin du combat. */
  malus: z.array(z.strictObject({ sur: z.enum(['attaque', 'DEF']), valeur: z.number().int().min(-5).max(-1), rounds: z.number().int().min(1).max(20).nullable() })).max(3).optional(),
  /** Repoussée de ce nombre de cases (1,5 m par case). */
  repousse: z.number().int().min(1).max(5).optional(),
  /** Ce qui reste au MJ ; null : rien. */
  auMj: z.string().min(1).max(300).nullable(),
});
export type EffetAttaqueMonstre = z.infer<typeof schemaEffetAttaqueMonstre>;
