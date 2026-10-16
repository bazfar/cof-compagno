import type { GeometrieScene } from '../schemas/scene.ts';

/*
 * Scène importée par le MJ depuis une simple image (lot L5.5, décision 4c
 * du 15/10 : comme en v1, l'image est compressée et rangée dans Firestore).
 *
 * Le MJ indique la taille d'une case en pixels sur son image ; on en
 * déduit la grille (v1 : chargerImage). La scène n'a ni mur ni porte : le
 * MJ les trace avec ses outils (L5.4). Ce fichier ne contient que les
 * calculs (testés) ; la compression elle-même, qui a besoin d'un canvas,
 * est dans compression.ts.
 */

/** Taille maximale de l'image en base64 (v1 : 700 000 caractères, marge sous le 1 Mo d'un document). */
export const LIMITE_IMAGE = 700_000;
/** Valeur proposée pour la taille d'une case (v1 : 70). */
export const PX_PAR_CASE_DEFAUT = 70;
/** Grille maximale : au-delà, la carte serait illisible et la vision trop lente. */
export const CASES_MAX = 150;

export interface Grille {
  colonnes: number;
  lignes: number;
}

/** Grille d'une image dont une case mesure `pxParCase` pixels (v1 : arrondi, au moins 1). */
export function grilleDepuisImage(largeur: number, hauteur: number, pxParCase: number): Grille | null {
  if (!(pxParCase > 0) || !(largeur > 0) || !(hauteur > 0)) return null;
  const colonnes = Math.max(1, Math.round(largeur / pxParCase));
  const lignes = Math.max(1, Math.round(hauteur / pxParCase));
  return colonnes <= CASES_MAX && lignes <= CASES_MAX ? { colonnes, lignes } : null;
}

/** Identifiant d'une scène importée : « imp- », le nom simplifié, un suffixe unique. */
export function idSceneImportee(nom: string, maintenant = Date.now()): string {
  const slug = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return `imp-${slug || 'scene'}-${maintenant.toString(36)}`;
}

export function estSceneImportee(id: string): boolean {
  return id.startsWith('imp-');
}

/** Géométrie d'une scène importée : une grille vide, sans mur ni porte. */
export function geometrieImportee(id: string, nom: string, grille: Grille, pxParCase: number): GeometrieScene {
  return { id, nom, colonnes: grille.colonnes, lignes: grille.lignes, pxParCaseSource: Math.max(1, Math.round(pxParCase)), murs: [], obstacles: [], portes: [] };
}

/** Un essai de compression : pixels par case de l'image produite et qualité WebP/JPEG. */
export interface EssaiCompression {
  pxParCase: number;
  qualite: number;
}

/** Premier essai : au plus 128 pixels par case (comme le catalogue, L5.2), qualité 0,8. */
export function premierEssai(pxParCaseSource: number): EssaiCompression {
  return { pxParCase: Math.max(8, Math.min(128, Math.round(pxParCaseSource))), qualite: 0.8 };
}

/**
 * Essai suivant quand l'image dépasse encore la limite (v1 :
 * _comprimerImagePourSync) : on baisse d'abord la qualité jusqu'à 0,5,
 * puis la résolution de 20 % à chaque fois. null = on abandonne (moins de
 * 16 pixels par case, la carte ne serait plus lisible).
 */
export function essaiSuivant(e: EssaiCompression): EssaiCompression | null {
  if (e.qualite > 0.5 + 1e-9) return { pxParCase: e.pxParCase, qualite: Math.round((e.qualite - 0.15) * 100) / 100 };
  const px = Math.floor(e.pxParCase * 0.8);
  return px >= 16 ? { pxParCase: px, qualite: e.qualite } : null;
}

/**
 * D'où vient la scène montrée, et peut-on l'afficher ? (bug v1 : un joueur
 * recevait le changement de scène avant la scène importée elle-même, deux
 * canaux temps réel indépendants, et restait sur l'ancienne.) Ici, une
 * scène importée dont la description n'est pas encore arrivée est « en
 * attente » : elle s'affiche dès qu'elle arrive. « introuvable » seulement
 * une fois la liste des scènes importées chargée.
 */
export function sourceScene(
  id: string,
  importeesChargees: boolean,
  idsImportees: readonly string[],
): 'catalogue' | 'importee' | 'en-attente' | 'introuvable' {
  if (!estSceneImportee(id)) return 'catalogue';
  if (idsImportees.includes(id)) return 'importee';
  return importeesChargees ? 'introuvable' : 'en-attente';
}
