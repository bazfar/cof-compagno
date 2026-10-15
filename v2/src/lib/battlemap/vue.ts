import type { Case, Point } from './geometrie.ts';

/*
 * Cadrage de la carte à l'écran (lot L5.2) : zoom et déplacement.
 *
 * Un point de la scène (en cases) s'affiche à
 *   écran = case × echelle + décalage
 * `echelle` = pixels d'écran par case. Tout le reste de la battlemap
 * (géométrie, vision, déplacement) ignore l'écran : seul ce module et le
 * dessin convertissent. C'est ce qui manquait en v1, où les calculs
 * dépendaient de la taille de l'image affichée (bug du monstre resté caché
 * tant que l'onglet Carte n'était pas visible).
 */

export interface Vue {
  echelle: number;
  decalX: number;
  decalY: number;
}

export interface Dimensions {
  colonnes: number;
  lignes: number;
}

/** Zoom maximal : une case fait au plus 200 px à l'écran. */
export const ECHELLE_MAX = 200;
/** Zoom minimal : la carte entière tient dans la moitié de l'écran. */
const RECUL_MAX = 0.5;

/** Échelle qui fait tenir toute la scène à l'écran. */
export function echelleAjustee(scene: Dimensions, largeur: number, hauteur: number): number {
  return Math.min(largeur / scene.colonnes, hauteur / scene.lignes);
}

/** Toute la scène visible, centrée. */
export function vueAjustee(scene: Dimensions, largeur: number, hauteur: number): Vue {
  const echelle = echelleAjustee(scene, largeur, hauteur);
  return { echelle, decalX: (largeur - scene.colonnes * echelle) / 2, decalY: (hauteur - scene.lignes * echelle) / 2 };
}

export function borneEchelle(scene: Dimensions, largeur: number, hauteur: number, echelle: number): number {
  const min = Math.min(echelleAjustee(scene, largeur, hauteur) * RECUL_MAX, ECHELLE_MAX);
  return Math.max(min, Math.min(ECHELLE_MAX, echelle));
}

/** Zoom par `facteur` en gardant immobile le point d'écran (ex, ey), sous la souris. */
export function zoomer(vue: Vue, facteur: number, ex: number, ey: number, scene: Dimensions, largeur: number, hauteur: number): Vue {
  const echelle = borneEchelle(scene, largeur, hauteur, vue.echelle * facteur);
  const k = echelle / vue.echelle;
  return { echelle, decalX: ex - (ex - vue.decalX) * k, decalY: ey - (ey - vue.decalY) * k };
}

/**
 * Déplace la vue, sans perdre la carte : au moins un quart de l'écran
 * (ou toute la carte si elle est plus petite) reste couvert par la scène.
 */
export function deplacer(vue: Vue, dx: number, dy: number, scene: Dimensions, largeur: number, hauteur: number): Vue {
  const borne = (decal: number, taille: number, ecran: number) => {
    const garde = Math.min(taille, ecran / 4);
    return Math.max(garde - taille, Math.min(ecran - garde, decal));
  };
  return {
    echelle: vue.echelle,
    decalX: borne(vue.decalX + dx, scene.colonnes * vue.echelle, largeur),
    decalY: borne(vue.decalY + dy, scene.lignes * vue.echelle, hauteur),
  };
}

/** Point de la scène (en cases, non arrondi) sous le point d'écran. */
export function ecranVersScene(vue: Vue, ex: number, ey: number): Point {
  return [(ex - vue.decalX) / vue.echelle, (ey - vue.decalY) / vue.echelle];
}

/** Case sous le point d'écran, ou null hors de la carte. */
export function ecranVersCase(vue: Vue, ex: number, ey: number, scene: Dimensions): Case | null {
  const [x, y] = ecranVersScene(vue, ex, ey);
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx >= 0 && cy >= 0 && cx < scene.colonnes && cy < scene.lignes ? { cx, cy } : null;
}

export function sceneVersEcran(vue: Vue, x: number, y: number): Point {
  return [x * vue.echelle + vue.decalX, y * vue.echelle + vue.decalY];
}
