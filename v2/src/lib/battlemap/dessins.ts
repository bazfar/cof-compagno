import { distancePointSegment, type EtatScene, type Point, type Porte, type Segment } from './geometrie.ts';

/*
 * Dessins du MJ sur une scène (lot L5.4) : murs, obstacles, portes et mur
 * de force tracés à la main, en plus de ce que contient le .dd2vtt.
 * Indispensables sur une scène importée en simple image (L5.5), qui n'a
 * aucun mur au départ.
 *
 * Même sens qu'en v1 :
 *   - mur      : bloque la vue ET le déplacement ;
 *   - obstacle : bloque la vue seulement (arbre, rocher) ;
 *   - porte    : bloque tant qu'elle est fermée ; tout le monde l'ouvre ;
 *   - mur de force : un mur qui porte un nombre de tours. Le décompte se
 *     fera avec les tours de combat (L6) ; d'ici là, le MJ l'efface.
 *
 * Geste (v1) : cliquer-glisser trace ; un simple clic efface l'élément du
 * même outil le plus proche (à moins d'une demi-case).
 */

export type TypeDessin = 'mur' | 'obstacle' | 'porte';

/** Un dessin tel que les calculs le lisent (coordonnées en cases). */
export interface DessinCarte {
  id: string;
  type: TypeDessin;
  a: Point;
  b: Point;
  /** Porte : état d'origine (l'état courant vit dans portesOuvertes). */
  ouverte?: boolean;
  /** Mur de force : tours restants. */
  tours?: number | null;
}

/** En deçà, un geste est un clic (v1 : 0,15 case). */
export const LONGUEUR_MIN_TRACE = 0.15;
/** Rayon de la gomme (v1 : une demi-case). */
export const RAYON_GOMME = 0.5;

/**
 * Aimante un point au demi-case le plus proche (coins, milieux des bords et
 * centres de cases). Nouveauté 2.0, désactivable : en v1 le tracé était
 * libre, et les murs dessinés ne joignaient jamais tout à fait.
 */
export function aimanter([x, y]: Point): Point {
  return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
}

/** Ramène un point dans la scène. */
export function bornerPoint([x, y]: Point, colonnes: number, lignes: number): Point {
  return [Math.max(0, Math.min(colonnes, x)), Math.max(0, Math.min(lignes, y))];
}

export function estUnTrace(a: Point, b: Point): boolean {
  return Math.hypot(b[0] - a[0], b[1] - a[1]) >= LONGUEUR_MIN_TRACE;
}

/** Élément du type donné le plus proche du point, à moins de RAYON_GOMME. */
export function dessinProche(dessins: readonly DessinCarte[], type: TypeDessin, pt: Point, mursDeForce = false): DessinCarte | null {
  let meilleur: DessinCarte | null = null, meilleureDist = RAYON_GOMME;
  for (const d of dessins) {
    if (d.type !== type) continue;
    if (type === 'mur' && Boolean(d.tours) !== mursDeForce) continue;
    const dist = distancePointSegment(pt[0], pt[1], d.a[0], d.a[1], d.b[0], d.b[1]);
    if (dist < meilleureDist) { meilleur = d; meilleureDist = dist; }
  }
  return meilleur;
}

/** Ce que les dessins ajoutent à la scène (voir geometrie.sceneCalcul). */
export function etatDepuisDessins(dessins: readonly DessinCarte[], portesOuvertes: Readonly<Record<string, boolean>> = {}): EtatScene {
  const segment = (d: DessinCarte): Segment => [d.a, d.b];
  return {
    portesOuvertes,
    mursManuels: dessins.filter((d) => d.type === 'mur').map(segment),
    obstaclesManuels: dessins.filter((d) => d.type === 'obstacle').map(segment),
    portesManuelles: dessins.filter((d) => d.type === 'porte').map((d): Porte => ({ id: d.id, a: d.a, b: d.b, ouverte: d.ouverte ?? false })),
  };
}
