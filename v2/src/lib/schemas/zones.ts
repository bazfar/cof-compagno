import { z } from 'zod';
import { schemaFormuleDes, schemaId } from './commun.ts';
import { schemaSauvegardesCombat } from './combat.ts';
import { schemaElement, schemaMaitrise, schemaSauvegarde } from './effets.ts';

/*
 * Les zones au sol (lot L6.4b1, décisions de Thomas du 24/10/2026). Un seul
 * modèle (5a) pour :
 *   - les cases que le MJ peint sur une scène (1a, 3a, 4a) :
 *     tables/{t}/scenes/{s}/zones/{id}, une case par document, d'identifiant
 *     `c-<cx>-<cy>` ; infranchissable, difficile, dangereuse ou spéciale ;
 *     une case peut rester cachée aux joueurs jusqu'à son premier
 *     déclenchement ;
 *   - les zones des sorts qui durent et les pièges (5a à 10a) :
 *     tables/{t}/combats/{c}/zones/{id}, qui s'en vont avec le combat.
 * Les cases sont données par rapport à l'ancre ; sans ancre, la zone suit le
 * jeton de son lanceur (8a : une aura).
 */

/** Ce qu'est le sol : les quatre cases du MJ, et les terrains des sorts (lib/schemas/effets.ts). */
export const NATURES_SOL = [
  'infranchissable',
  'difficile',
  'dangereuse',
  'speciale',
  'glissant',
  'bloquant',
  'couverture',
  'enflamme',
  'sanctuaire',
  'illusion',
  'sanctifie',
  'electrifie',
] as const;
export type NatureSol = (typeof NATURES_SOL)[number];

/** Les cases que le MJ peint (1a). */
export const NATURES_MJ = ['infranchissable', 'difficile', 'dangereuse', 'speciale'] as const;

export const QUANDS = ['entree', 'finDeplacement', 'debutTour', 'finTour'] as const;

/** Le lanceur figé au lancer (6a) : le sort se rejoue avec son DD et ses mods de ce moment. */
export const schemaLanceurFige = z.strictObject({
  id: z.string().min(1).max(150),
  nom: z.string().min(1).max(40),
  camp: z.enum(['pj', 'monstre']),
  def: z.number().int().min(-10).max(99),
  sauvegardes: schemaSauvegardesCombat,
  modMagie: z.number().int().min(-10).max(20),
  attaqueMagique: z.number().int().min(-10).max(40),
  niveau: z.number().int().min(1).max(30),
  mods: z.partialRecord(z.enum(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']), z.number().int().min(-10).max(20)),
});
export type LanceurFige = z.infer<typeof schemaLanceurFige>;

/** Le sort qui se rejoue au déclenchement (6a). */
export const schemaSortDeZone = z.strictObject({
  action: schemaId,
  palier: z.enum(['I', 'II', 'III']),
  element: z.strictObject({ id: schemaElement, maitrise: schemaMaitrise }).nullable(),
  lanceur: schemaLanceurFige,
});

/** Une case dangereuse du MJ (3a) : ses dégâts, la sauvegarde qui les réduit de moitié et évite l'état. */
export const schemaDanger = z.strictObject({
  formule: schemaFormuleDes,
  typeDegats: z.enum(['physique', 'magique']),
  sauvegarde: schemaSauvegarde.nullable(),
  dd: z.number().int().min(5).max(30).nullable(),
  etat: schemaId.nullable(),
  rounds: z.number().int().min(1).max(99).nullable(),
});
export type Danger = z.infer<typeof schemaDanger>;

export const schemaZoneSol = z
  .strictObject({
    nom: z.string().trim().min(1).max(60),
    nature: z.enum(NATURES_SOL).nullable(),
    /** Cases, par rapport à l'ancre (ou au jeton du lanceur). */
    cases: z.array(z.strictObject({ dx: z.number().int().min(-60).max(60), dy: z.number().int().min(-60).max(60) })).min(1).max(200),
    ancre: z.strictObject({ cx: z.number().int().min(0).max(499), cy: z.number().int().min(0).max(499) }).nullable(),
    /** Combattant (jeton) qui l'a posée ; null : le MJ. */
    lanceur: z.string().min(1).max(150).nullable(),
    /** Camp du lanceur, pour le filtre ; null : le MJ, la zone touche tout le monde. */
    camp: z.enum(['pj', 'monstre']).nullable(),
    filtre: z.enum(['tous', 'ennemis', 'allies']),
    /** Quand elle agit ; null : elle ne fait que changer le sol (terrain). */
    quand: z.enum(QUANDS).nullable(),
    sort: schemaSortDeZone.nullable(),
    danger: schemaDanger.nullable(),
    /** DD du terrain glissant (sauvegarde de DEX), celui du sort. */
    dd: z.number().int().min(5).max(30).nullable(),
    /** Case spéciale du MJ, ou règle d'un terrain : le texte montré. */
    texte: z.string().trim().min(1).max(200).nullable(),
    /** Un piège sert une fois (10a). */
    usageUnique: z.boolean(),
    /** Cachée aux joueurs jusqu'au premier déclenchement (4a). */
    cachee: z.boolean(),
    /** Rounds qui restent, décomptés à la fin du tour du lanceur (9a) ; null : jusqu'à la fin du combat, ou toujours (MJ). */
    rounds: z.number().int().min(1).max(99).nullable(),
    /** Qui l'a déclenchée, et à quel tour du combat (une fois par tour, 3a) ; 0 hors combat. */
    declenchements: z.record(z.string().min(1).max(150), z.number().int().min(0).max(99999)),
    creeLe: z.number().int().nonnegative(),
  })
  .superRefine((z0, ctx) => {
    const ko = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    if (z0.nature === 'dangereuse' && !z0.danger) ko('une case dangereuse dit ses dégâts', 'danger');
    if (z0.danger && z0.danger.sauvegarde !== null && z0.danger.dd === null) ko('une sauvegarde a son DD', 'danger');
    if (z0.ancre === null && z0.lanceur === null) ko('sans ancre, la zone suit son lanceur', 'ancre');
    if (z0.nature === 'speciale' && !z0.texte) ko('une case spéciale dit ce qu’elle fait', 'texte');
  });
export type ZoneSol = z.infer<typeof schemaZoneSol>;
