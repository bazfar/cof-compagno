import { z } from 'zod';
import { schemaNom } from './acces.ts';

/*
 * Journal de dés commun (lot L2.5, décision 4a du 16/10) :
 * tables/{table}/journal/{id}, en ajout seul. Toute la table voit tous les
 * jets : tests depuis la fiche, potions, PV de montée de niveau, lanceur
 * libre. Personne ne modifie ni ne supprime un jet.
 */
/**
 * Un sort lancé hors combat (lot G2a, 9a du 22/10/2026) : le journal le
 * montre à toute la table, comme un jet. `des` porte le d20 du jet d'échec
 * s'il y en a eu un (6a), et peut être vide sinon.
 */
export const schemaSortJournal = z.strictObject({
  nom: z.string().min(1).max(60),
  palier: z.enum(['I', 'II', 'III']),
  pp: z.number().int().min(0).max(20),
  intention: z.string().min(1).max(120),
  issue: z.enum(['lance', 'rate']),
});

export const schemaJetJournal = z
  .strictObject({
    auteurUid: z.string().min(1),
    auteurNom: schemaNom,
    /** Personnage au nom duquel on lance, s'il y en a un. */
    perso: schemaNom.optional(),
    libelle: z.string().min(1).max(80),
    formule: z.string().min(1).max(40),
    des: z.array(z.number().int().min(1).max(1000)).max(100),
    bonus: z.number().int(),
    total: z.number().int(),
    creeLe: z.number().int().nonnegative(),
    sort: schemaSortJournal.optional(),
  })
  .superRefine((j, ctx) => {
    if (!j.sort && j.des.length === 0) ctx.addIssue({ code: 'custom', message: 'un jet a au moins un dé', path: ['des'] });
  });
export type JetJournal = z.infer<typeof schemaJetJournal>;
