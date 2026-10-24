import type { GeometrieScene, Point, Porte } from '../schemas/scene.ts';

/*
 * Briques géométriques de la battlemap (lot L5.1), en CASES.
 *
 * Port fidèle des fonctions de js/carte.js (module DD2VTT), vérifié contre
 * le vrai code v1 par tests/unitaires/battlemap-equivalence-v1.test.ts.
 * Seule différence de fond : l'unité. La v1 calculait en pixels de l'image
 * (cases × pixels_per_grid) ; ici tout est en cases. Les tolérances de la
 * v1 portent sur des rapports sans dimension (paramètres t et u des
 * intersections, angles) : elles restent valables telles quelles.
 */

export type { Point, Porte };
export type Segment = readonly [Point, Point];

/** Une case de la grille : colonne `cx`, ligne `cy` (entiers, à partir de 0). */
export interface Case {
  cx: number;
  cy: number;
}

/**
 * Un jeton tel que les calculs de carte le lisent. Le reste (nom, couleur,
 * propriétaire, référence de fiche) arrive avec les jetons Firestore (L5.3).
 */
export interface JetonCarte extends Case {
  id: string;
  /** v1 : pj = true ; monstre = monstreId ; invocation = invocateur ; libre = jeton générique du MJ. */
  genre: 'pj' | 'monstre' | 'invocation' | 'libre';
  /**
   * Décision du 15/10 : un monstre mort reste sur la carte mais libère sa
   * case, ne se cible plus et ne provoque plus d'attaque d'opportunité. Un
   * PJ à 0 PV n'est PAS mort (à terre) : il garde sa case.
   */
  mort?: boolean;
}

/**
 * Ce que les calculs lisent d'une scène À UN INSTANT DONNÉ : la géométrie
 * préparée, plus ce que le MJ a dessiné et l'état des portes. Construite par
 * `sceneCalcul`, jamais stockée.
 */
export interface SceneCalcul {
  colonnes: number;
  lignes: number;
  /** Murs du .dd2vtt + murs dessinés par le MJ : bloquent vue et déplacement. */
  murs: Segment[];
  /** Obstacles du .dd2vtt + obstacles dessinés : bloquent la vue seulement. */
  obstacles: Segment[];
  /** Portes du .dd2vtt + portes dessinées, avec leur état courant. */
  portes: Porte[];
  /** Cases des zones au sol (L6.4b1, 1a, 2a), « cx,cy » : un PJ n'y entre pas ; y entrer coûte 2 cases. */
  infranchissables?: ReadonlySet<string>;
  difficiles?: ReadonlySet<string>;
}

/** Ce qui change en cours de partie (Firestore, L5.3). */
export interface EtatScene {
  /** État des portes, par id ; une porte absente garde son état d'origine. */
  portesOuvertes?: Readonly<Record<string, boolean>>;
  mursManuels?: readonly Segment[];
  obstaclesManuels?: readonly Segment[];
  portesManuelles?: readonly Porte[];
  /** Zones au sol (L6.4b1) : leurs murs (terrain bloquant) s'ajoutent aux murs dessinés. */
  mursDeZones?: readonly Segment[];
  infranchissables?: ReadonlySet<string>;
  difficiles?: ReadonlySet<string>;
}

/** Aplatit des polylignes en segments consécutifs (v1 : _segmentsDepuisPolylignes). */
export function segmentsDepuisPolylignes(polylignes: readonly (readonly Point[])[]): Segment[] {
  const segments: Segment[] = [];
  for (const poly of polylignes) {
    for (let i = 0; i < poly.length - 1; i++) segments.push([poly[i] as Point, poly[i + 1] as Point]);
  }
  return segments;
}

export function sceneCalcul(geo: GeometrieScene, etat: EtatScene = {}): SceneCalcul {
  const ouvertes = etat.portesOuvertes ?? {};
  return {
    colonnes: geo.colonnes,
    lignes: geo.lignes,
    // L'ordre des segments ne change aucun résultat : à distance égale,
    // deux segments donnent le même point d'impact.
    murs: [...segmentsDepuisPolylignes(geo.murs), ...(etat.mursManuels ?? []), ...(etat.mursDeZones ?? [])],
    obstacles: [...segmentsDepuisPolylignes(geo.obstacles), ...(etat.obstaclesManuels ?? [])],
    portes: [
      ...geo.portes.map((p) => ({ ...p, ouverte: ouvertes[p.id] ?? p.ouverte })),
      ...(etat.portesManuelles ?? []).map((p) => ({ ...p, ouverte: ouvertes[p.id] ?? p.ouverte })),
    ],
    ...(etat.infranchissables?.size ? { infranchissables: etat.infranchissables } : {}),
    ...(etat.difficiles?.size ? { difficiles: etat.difficiles } : {}),
  };
}

/** Centre d'une case, en cases. */
export function centre(c: Case): Point {
  return [c.cx + 0.5, c.cy + 0.5];
}

/** v1 : _distancePointSegment. */
export function distancePointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Intersection de deux segments [a,b] et [c,d], bornée aux deux segments
 * (v1 : _pointIntersectionSegments). Les extrémités de [a,b] sont exclues :
 * un trajet qui part d'un mur ou s'arrête dessus ne le « traverse » pas.
 */
export function intersectionSegments(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = [b[0] - a[0], b[1] - a[1]] as const;
  const s = [d[0] - c[0], d[1] - c[1]] as const;
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-10) return null; // parallèles (ou colinéaires, ignoré)
  const qp = [c[0] - a[0], c[1] - a[1]] as const;
  const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/** Segment d'une porte fermée, ou null si elle est ouverte. */
export function segmentPorteFermee(p: Porte): Segment | null {
  return p.ouverte ? null : [p.a, p.b];
}

/** Distance de Chebyshev : une diagonale compte pour une case (v1 : distanceCases). */
export function distanceCases(a: Case, b: Case): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
}

/** Ramène une case dans la grille. */
export function borner(scene: Pick<SceneCalcul, 'colonnes' | 'lignes'>, cx: number, cy: number): Case {
  return { cx: Math.max(0, Math.min(scene.colonnes - 1, cx)), cy: Math.max(0, Math.min(scene.lignes - 1, cy)) };
}
