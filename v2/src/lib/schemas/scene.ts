import { z } from 'zod';
import { schemaId } from './commun.ts';

/*
 * Géométrie d'une scène de battlemap (lot L5.1), telle que
 * outils/preparer-scenes.ts la tire d'un export Dungeondraft (.dd2vtt).
 *
 * UNITÉ : la CASE. Un point (3.5, 2) est au milieu du bord haut de la case
 * (3, 2). Le .dd2vtt est déjà en cases ; la v1 multipliait tout par
 * pixels_per_grid pour travailler en pixels de l'image. La 2.0 garde les
 * cases : l'image pourra être recompressée ou redimensionnée sans toucher
 * à la géométrie.
 *
 * L'image n'est pas ici : elle arrive avec le rendu (L5.2).
 */

/** Point en cases : [x, y]. */
export const schemaPoint = z.tuple([z.number(), z.number()]);

/** Suite de points reliés (un mur ou un contour d'obstacle). */
export const schemaPolyligne = z.array(schemaPoint).min(2);

/**
 * Porte OU fenêtre : Dungeondraft ne les distingue pas à l'export.
 * `a`-`b` est l'ouverture dans le mur. `ouverte` est l'état au chargement ;
 * l'état en cours de partie vit dans Firestore (L5.3).
 */
export const schemaPorte = z.object({
  id: z.string().regex(/^p\d+$/),
  a: schemaPoint,
  b: schemaPoint,
  ouverte: z.boolean(),
});

export const schemaGeometrieScene = z.object({
  /** Clé du catalogue v1 (`CARTES_BATTLEMAP[].key`) : sert de clé de synchro, ne change jamais. */
  id: schemaId,
  nom: z.string().min(1),
  colonnes: z.number().int().positive(),
  lignes: z.number().int().positive(),
  /** Résolution de l'image d'origine (pixels par case), pour information. */
  pxParCaseSource: z.number().int().positive(),
  /** Murs : bloquent la vue ET le déplacement (`line_of_sight`). */
  murs: z.array(schemaPolyligne),
  /** Arbres, rochers… : bloquent la vue, PAS le déplacement (`objects_line_of_sight`). */
  obstacles: z.array(schemaPolyligne),
  portes: z.array(schemaPorte),
});

export const schemaCatalogueScenes = z.array(
  z.object({ id: schemaId, nom: z.string().min(1), colonnes: z.number().int().positive(), lignes: z.number().int().positive() }),
);

export type Point = z.infer<typeof schemaPoint>;
export type Porte = z.infer<typeof schemaPorte>;
export type GeometrieScene = z.infer<typeof schemaGeometrieScene>;
export type CatalogueScenes = z.infer<typeof schemaCatalogueScenes>;
