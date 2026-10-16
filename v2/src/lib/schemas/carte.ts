import { z } from 'zod';
import { schemaNom } from './acces.ts';

/*
 * Documents Firestore de la battlemap (lot L5.3). Seule définition de leur
 * forme : actions, magasins et tests s'en servent. Les champs autorisés
 * restent alignés avec les `hasOnly([...])` de firestore.rules.
 *
 * La GÉOMÉTRIE d'une scène n'est pas en base : elle est livrée avec l'app
 * (src/donnees/scenes/). Firestore ne garde que ce qui change en partie.
 */

/** Coordonnée de case (les plus grandes scènes font 80 × 50). */
const schemaCoord = z.number().int().min(0).max(499);

/**
 * tables/{table}/scenes/{scene}/jetons/{jeton} — un document par jeton,
 * pour que deux clients qui bougent deux jetons n'écrivent jamais le même
 * document (bug d'écrasement de la v1).
 *
 * Le jeton du PJ d'un joueur a pour identifiant `pj-<uid du joueur>` : un
 * seul par joueur et par scène, garanti par l'identifiant lui-même (v1 :
 * règle de doublon « Ce personnage est déjà sur la carte »). Il sera relié
 * à la fiche du personnage avec le lot L2.
 *
 * Les PV et états des monstres ne sont PAS ici (décision du 15/10) : ils
 * vivront dans le combat (L6). `mort` est le seul état que la carte lit.
 */
export const schemaJeton = z.object({
  genre: z.enum(['pj', 'monstre', 'invocation', 'libre']),
  nom: schemaNom,
  couleur: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  cx: schemaCoord,
  cy: schemaCoord,
  mort: z.boolean().optional(),
  /** uid du joueur qui peut le déplacer ; null = seul le MJ. */
  proprietaire: z.string().nullable(),
  creeLe: z.number().int().nonnegative(),
});
export type Jeton = z.infer<typeof schemaJeton>;

/**
 * tables/{table}/scenes/{scene} — l'état partagé d'une scène.
 *   portesOuvertes : état des portes qui ont été manipulées (les autres
 *                    gardent leur état d'origine) ; tout membre l'écrit.
 *   exploration    : brouillard « déjà exploré » partagé (GrilleExploration
 *                    en base64) ; seul le MJ l'écrit.
 *   explorationRaz : compteur de remises à zéro par le MJ ; quand il change,
 *                    chaque client oublie aussi ce qu'il avait exploré localement.
 */
export const schemaEtatScene = z.object({
  portesOuvertes: z.record(z.string(), z.boolean()).optional(),
  exploration: z.string().max(20000).optional(),
  explorationRaz: z.number().int().nonnegative().optional(),
});
export type EtatSceneDoc = z.infer<typeof schemaEtatScene>;

/**
 * tables/{table} — on n'y lit que la scène montrée par le MJ (v1 :
 * « battlemap:scene-active »). Les autres champs éventuels sont ignorés.
 */
export const schemaTable = z.looseObject({
  sceneActive: z.string().nullable().optional(),
});
export type TableDoc = z.infer<typeof schemaTable>;

/** Coordonnée d'un point de dessin, en cases (pas forcément entière). */
const schemaCoordPoint = z.number().min(0).max(500);

/**
 * tables/{table}/scenes/{scene}/dessins/{dessin} — un document par mur,
 * obstacle ou porte tracé par le MJ (lot L5.4). Un document chacun : un
 * dessin effacé l'est chez tout le monde (bug v1 du mur supprimé d'un seul
 * côté). Points à plat (ax, ay, bx, by) : Firestore refuse les tableaux de
 * tableaux.
 *   ouverte : porte seulement, état d'origine (l'état courant est dans
 *             portesOuvertes, comme pour les portes du .dd2vtt) ;
 *   tours   : mur de force seulement, tours restants (décompte en L6) ;
 *   lanceur : mur de force, qui l'a lancé (relié aux fiches en L2/L6).
 */
export const schemaDessin = z.object({
  type: z.enum(['mur', 'obstacle', 'porte']),
  ax: schemaCoordPoint,
  ay: schemaCoordPoint,
  bx: schemaCoordPoint,
  by: schemaCoordPoint,
  ouverte: z.boolean().optional(),
  tours: z.number().int().min(1).max(100).optional(),
  lanceur: z.string().nullable().optional(),
  creeLe: z.number().int().nonnegative(),
});
export type Dessin = z.infer<typeof schemaDessin>;

/**
 * tables/{table}/scenesImportees/{id} — scène importée par le MJ depuis
 * une image (lot L5.5). Description seule, légère : tous les clients la
 * lisent pour lister et ouvrir les scènes. L'image est dans un document à
 * part (ci-dessous), que seuls ceux qui ouvrent la scène téléchargent.
 * Identifiant : « imp-… » (import-image.idSceneImportee).
 */
export const schemaSceneImportee = z.object({
  nom: schemaNom,
  colonnes: z.number().int().min(1).max(150),
  lignes: z.number().int().min(1).max(150),
  /** Pixels par case de l'image stockée. */
  pxParCase: z.number().int().min(1).max(512),
  creeLe: z.number().int().nonnegative(),
});
export type SceneImportee = z.infer<typeof schemaSceneImportee>;

/** tables/{table}/scenesImportees/{id}/image/donnees — l'image compressée (data URL, 700 000 caractères au plus). */
export const schemaImageScene = z.object({
  image: z.string().startsWith('data:image/').max(750000),
});
export type ImageScene = z.infer<typeof schemaImageScene>;
