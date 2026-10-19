import { z } from 'zod';
import { schemaObjetFiche } from './fiche.ts';

/*
 * Butin (lot L3.4, décisions du 18 et du 19/10/2026) : le MJ met un objet
 * au vote ; chaque joueur choisit Besoin, Envie ou Passer et lance son d100
 * en votant. Besoin passe avant Envie, le plus haut d100 l'emporte ; en cas
 * d'égalité, les joueurs à égalité relancent. Le MJ peut aussi attribuer
 * directement, même pendant le vote. tables/{table}/butins/{id}.
 *
 * Les votes sont dans le document du butin (`votes.<uid>`) : une seule
 * lecture pour tout le monde, et chaque joueur n'écrit que sa propre clé
 * (règles Firestore).
 */
export const CHOIX_BUTIN = ['besoin', 'envie', 'passe'] as const;
export type ChoixButin = (typeof CHOIX_BUTIN)[number];

export const STATUTS_BUTIN = ['vote', 'relance', 'clos', 'attribue'] as const;
export type StatutButin = (typeof STATUTS_BUTIN)[number];

const d100 = z.number().int().min(1).max(100);

export const schemaVoteButin = z.strictObject({
  choix: z.enum(CHOIX_BUTIN),
  /** Personnage joué au moment du vote : c'est lui qui recevra l'objet. */
  perso: z.string().min(1).max(100),
  nom: z.string().min(1).max(80),
  /** Lancé en votant ; il ne change plus, même si le joueur change d'avis. */
  d100,
  /** Relances en cas d'égalité, une par tour. */
  relances: z.array(d100).max(20),
  le: z.number().int().nonnegative(),
});
export type VoteButin = z.infer<typeof schemaVoteButin>;

export const schemaGagnantButin = z.strictObject({
  uid: z.string().min(1),
  perso: z.string().min(1),
  nom: z.string().min(1).max(80),
  /** `vote` : gagné au vote ; `direct` : attribué par le MJ. */
  mode: z.enum(['vote', 'direct']),
});
export type GagnantButin = z.infer<typeof schemaGagnantButin>;

export const schemaButin = z.strictObject({
  objet: schemaObjetFiche,
  statut: z.enum(STATUTS_BUTIN),
  creeLe: z.number().int().nonnegative(),
  /** Nombre de relances demandées aux joueurs à égalité (0 pendant le vote). */
  tour: z.number().int().min(0).max(20),
  /** Joueurs à égalité qui doivent relancer (statut « relance »). */
  enLice: z.array(z.string().min(1)).max(50),
  votes: z.record(z.string(), schemaVoteButin),
  gagnant: schemaGagnantButin.nullable(),
  resoluLe: z.number().int().nonnegative().nullable(),
});
export type Butin = z.infer<typeof schemaButin>;
