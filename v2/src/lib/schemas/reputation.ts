import { z } from 'zod';

/*
 * Réputation du groupe auprès des factions (lot S1, décisions du
 * 22/10/2026). L'échelle et les cinq blocs de l'Assemblée de Libris
 * viennent de la v1 (data/reputation.js), par outils/importer-v1.ts
 * (décision 5) : src/donnees/reputation.json.
 *
 * La valeur est PARTAGÉE : une par faction pour tout le groupe, comme en
 * v1. Le MJ l'ajuste ; toute la table la voit, avec son palier et l'effet
 * sur les prix (12a : affiché ; le calcul se branchera sur la boutique).
 *
 * Ce fichier n'importe que `zod`, comme les autres schémas de données.
 */

/** Un palier de l'échelle, bornes incluses. `modPrix` null : commerce refusé. */
export const schemaPalierReputation = z.strictObject({
  min: z.number().int(),
  max: z.number().int(),
  id: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(1),
  modPrix: z.number().min(-1).max(1).nullable(),
  description: z.string().min(1),
});
export type PalierReputation = z.infer<typeof schemaPalierReputation>;

export const schemaFactionReputation = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  nom: z.string().min(1),
  /** Score maximal atteignable (les Fils de Libris plafonnent à +5). */
  plafond: z.number().int().min(-10).max(10),
  accroche: z.string().min(1),
});
export type FactionReputation = z.infer<typeof schemaFactionReputation>;

/** Score le plus bas, pour toutes les factions (v1 : −10, Némésis). */
export const SCORE_MIN = -10;

/** src/donnees/reputation.json : l'échelle couvre −10 à +10 sans trou ni chevauchement. */
export const schemaReputationV1 = z
  .strictObject({
    echelle: z.array(schemaPalierReputation).min(1),
    factions: z.array(schemaFactionReputation).min(1),
  })
  .superRefine((r, ctx) => {
    const tries = [...r.echelle].sort((a, b) => a.min - b.min);
    let attendu = SCORE_MIN;
    for (const p of tries) {
      if (p.min !== attendu || p.max < p.min) ctx.addIssue({ code: 'custom', message: `échelle : le palier ${p.id} devait commencer à ${attendu}`, path: ['echelle'] });
      attendu = p.max + 1;
    }
    if (attendu !== 11) ctx.addIssue({ code: 'custom', message: 'échelle : elle doit finir à +10', path: ['echelle'] });
  });
export type ReputationV1 = z.infer<typeof schemaReputationV1>;

/** tables/{table}/reputation/groupe : un score par faction ; une faction absente vaut 0. */
export const schemaReputationGroupe = z.strictObject({
  scores: z.record(z.string().regex(/^[a-z_]+$/), z.number().int().min(SCORE_MIN).max(10)),
  majLe: z.number().int().nonnegative(),
});
export type ReputationGroupe = z.infer<typeof schemaReputationGroupe>;
