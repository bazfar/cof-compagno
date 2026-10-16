import { z } from 'zod';
import { schemaNom } from './acces.ts';

/*
 * Journal de dés commun (lot L2.5, décision 4a du 16/10) :
 * tables/{table}/journal/{id}, en ajout seul. Toute la table voit tous les
 * jets : tests depuis la fiche, potions, PV de montée de niveau, lanceur
 * libre. Personne ne modifie ni ne supprime un jet.
 */
export const schemaJetJournal = z.strictObject({
  auteurUid: z.string().min(1),
  auteurNom: schemaNom,
  /** Personnage au nom duquel on lance, s'il y en a un. */
  perso: schemaNom.optional(),
  libelle: z.string().min(1).max(80),
  formule: z.string().min(1).max(40),
  des: z.array(z.number().int().min(1).max(1000)).min(1).max(100),
  bonus: z.number().int(),
  total: z.number().int(),
  creeLe: z.number().int().nonnegative(),
});
export type JetJournal = z.infer<typeof schemaJetJournal>;
