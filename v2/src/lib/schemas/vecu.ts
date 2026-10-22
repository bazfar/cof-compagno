import { z } from 'zod';
import { schemaId } from './commun.ts';

/*
 * Nœuds de l'arbre du Vécu (lot L4.18). Source : doc « Refonte classes et
 * magie — cadre », « Arbre du Vécu — première version (validée) » :
 * architecture d'un nœud = nom, branche, tier, prérequis, et un ou
 * plusieurs effets (effet, cible, valeur, condition, usage).
 *
 * `calcul` : la part que la fiche additionne (décision 6a du 22/10/2026) —
 * les bonus de compétence ; tout le reste est montré en texte, et joué par
 * les scènes (lot des rencontres) ou par le MJ.
 *
 * Ce fichier n'importe que `zod` et ./commun.ts (avec l'extension), comme
 * les autres schémas de règles.
 */

export const BRANCHES_VECU = ['social', 'exploration', 'savoir', 'croisement'] as const;
export type BrancheVecu = (typeof BRANCHES_VECU)[number];

/** Types d'effet du cadre (liste fermée). */
export const EFFETS_VECU = [
  'bonusCompetence',
  'bonusCarac',
  'reductionDD',
  'reussite',
  'relance',
  'attitude',
  'reductionDegats',
  'soin',
  'information',
  'optionScene',
  'rituel',
] as const;

export const schemaEffetVecu = z.strictObject({
  effet: z.enum(EFFETS_VECU),
  cible: z.string().min(1),
  valeur: z.string().min(1),
  condition: z.string().min(1).nullable(),
  /** Permanent, 1x/scène, 1x/jour… : le texte du cadre ; le suivi viendra avec les scènes. */
  usage: z.string().min(1),
});

export const schemaNoeudVecu = z
  .strictObject({
    id: schemaId,
    nom: z.string().min(1),
    branche: z.enum(BRANCHES_VECU),
    /** 1 libre ; 2 : 2 points déjà dans la branche ; 3 : 4 points (validé). Les croisements sont de tier 2, sans seuil de branche. */
    tier: z.number().int().min(1).max(3),
    /** Nœuds à avoir déjà (un nœud de croisement en demande un dans chacune de ses deux branches). */
    prerequis: z.array(schemaId).default([]),
    effets: z.array(schemaEffetVecu).min(1),
    /** Ce que la fiche additionne : +valeur aux compétences nommées (6a). */
    calcul: z.strictObject({ competences: z.array(z.string().min(1)).min(1), bonus: z.number().int().min(1).max(2) }).optional(),
    /** Texte du cadre à rappeler (cadre des rituels). */
    note: z.string().min(1).optional(),
  })
  .superRefine((n, ctx) => {
    if (n.branche === 'croisement' && !(n.prerequis.length === 2 && n.tier === 2))
      ctx.addIssue({ code: 'custom', message: 'un nœud de croisement est de tier 2 et demande deux nœuds, un par branche', path: ['prerequis'] });
  });
export type NoeudVecu = z.infer<typeof schemaNoeudVecu>;
export type NoeudVecuSaisi = z.input<typeof schemaNoeudVecu>;
