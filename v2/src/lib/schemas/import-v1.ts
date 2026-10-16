import { z } from 'zod';
import { schemaNom } from './acces.ts';

/*
 * Fiche v1 déposée par le MJ pour un joueur (lot L2.2c, décision 6a) :
 * tables/{table}/importsV1/{id}. Le joueur la reprend dans l'assistant ;
 * `reprisPar` dit alors quel personnage 2.0 en est né.
 *
 * La fiche v1 est gardée en TEXTE JSON, telle qu'exportée : Firestore
 * refuse certaines formes v1 (tableaux de tableaux), et rien ne doit s'y
 * perdre avant la reprise. Le portrait y reste, pour L2.3 (décision 6a).
 */

/** Taille maximale du texte v1 : marge sous le 1 Mo d'un document Firestore. */
export const LIMITE_V1_JSON = 900_000;

export const schemaImportV1 = z.strictObject({
  proprietaireUid: z.string().min(1),
  /** Nom du personnage v1, pour les listes. */
  nom: schemaNom,
  importeLe: z.number().int().nonnegative(),
  v1Json: z.string().max(LIMITE_V1_JSON),
  reprisPar: z.string().optional(),
});
export type ImportV1 = z.infer<typeof schemaImportV1>;
