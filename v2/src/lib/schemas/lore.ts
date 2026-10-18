import { z } from 'zod';

/*
 * Lore partagé (lot L2.7a, décisions du 18/10/2026) : des fiches de lore
 * (un lieu, un PNJ, une faction, une période…), chacune faite de passages
 * (paragraphes). Le MJ décide qui voit chaque fiche (personne, certains
 * joueurs, tous) et peut sceller un passage d'une fiche partagée.
 *
 * DEUX documents par fiche, parce que les règles Firestore ne savent pas
 * cacher une partie d'un document à un lecteur :
 * - tables/{table}/loreMj/{id} : la fiche complète, passages scellés
 *   compris. Le MJ seul la lit et l'écrit. C'est la source.
 * - tables/{table}/lore/{id} : ce que voient les joueurs, dérivé de la
 *   fiche MJ par versionJoueurs (lib/lore/fiche.ts) : sans passage scellé,
 *   avec la liste `lecteurs` que vérifient les règles. Absent quand la
 *   fiche n'est partagée avec personne.
 * Un texte scellé ne quitte donc jamais la base vers un joueur (la v1 le
 * livrait dans le code de la page et le masquait à l'affichage).
 */

/** Taille d'un passage : 4 fois le plus long paragraphe du lore v1 (2 215 signes). */
export const LIMITE_TEXTE_PASSAGE = 10_000;
export const LIMITE_PASSAGES = 120;
/** Lecteur spécial : tous les joueurs de la table. */
export const TOUS = '*';

export const VISIBILITES = ['mj', 'certains', 'tous'] as const;
export type Visibilite = (typeof VISIBILITES)[number];

const schemaIdPassage = z.string().regex(/^[a-z0-9-]{1,40}$/);
const schemaTitre = z.string().trim().min(1).max(120);
const schemaCategorie = z.string().trim().min(1).max(60);
const schemaEtiquettes = z.array(z.string().trim().min(1).max(40)).max(10);

export const schemaPassageMj = z.strictObject({
  id: schemaIdPassage,
  /** Intertitre facultatif (« Histoire », « Accroche »…). */
  intertitre: z.string().trim().max(80).optional(),
  texte: z.string().trim().min(1).max(LIMITE_TEXTE_PASSAGE),
  scelle: z.boolean(),
});
export type PassageMj = z.infer<typeof schemaPassageMj>;

/** tables/{table}/loreMj/{id} : la fiche complète (MJ seul). */
export const schemaFicheLoreMj = z.strictObject({
  titre: schemaTitre,
  sousTitre: z.string().trim().max(200).optional(),
  categorie: schemaCategorie,
  /** Rang dans la catégorie (petit d'abord), puis le titre. */
  ordre: z.number().int(),
  etiquettes: schemaEtiquettes,
  visibilite: z.enum(VISIBILITES),
  /** uid des joueurs qui la voient quand `visibilite` vaut « certains ». */
  lecteurs: z.array(z.string().min(1)).max(50),
  passages: z.array(schemaPassageMj).max(LIMITE_PASSAGES),
  majLe: z.number().int().nonnegative(),
  /** Dernière fois que les joueurs y ont gagné quelque chose à lire (marque « nouveau », L2.7b). */
  reveleLe: z.number().int().nonnegative(),
  /** Origine d'une fiche importée (ex. « v1:pnj:aude-berlan »), pour ne jamais l'importer deux fois. */
  source: z.string().max(120).optional(),
});
export type FicheLoreMj = z.infer<typeof schemaFicheLoreMj>;

export const schemaPassageJoueurs = schemaPassageMj.omit({ scelle: true });
export type PassageJoueurs = z.infer<typeof schemaPassageJoueurs>;

/** tables/{table}/lore/{id} : ce que voient les joueurs. Écrit par le MJ seul, jamais à la main. */
export const schemaFicheLoreJoueurs = z.strictObject({
  titre: schemaTitre,
  sousTitre: z.string().trim().max(200).optional(),
  categorie: schemaCategorie,
  ordre: z.number().int(),
  etiquettes: schemaEtiquettes,
  /** [TOUS] ou des uid : les règles Firestore ne laissent lire qu'eux. */
  lecteurs: z.array(z.string().min(1)).min(1).max(50),
  passages: z.array(schemaPassageJoueurs).max(LIMITE_PASSAGES),
  majLe: z.number().int().nonnegative(),
  reveleLe: z.number().int().nonnegative(),
});
export type FicheLoreJoueurs = z.infer<typeof schemaFicheLoreJoueurs>;

/** Fichier d'import produit par `npm run lore:exporter` (lore de la v1), déposé par le MJ. */
export const schemaExportLore = z.strictObject({
  format: z.literal('cof-compagno/lore-v1'),
  exporteLe: z.number().int().nonnegative(),
  fiches: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_.-]{1,100}$/), fiche: schemaFicheLoreMj })).max(1000),
});
export type ExportLore = z.infer<typeof schemaExportLore>;
