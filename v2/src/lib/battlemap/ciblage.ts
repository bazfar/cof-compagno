import { centre, distanceCases, intersectionSegments, type Case, type JetonCarte, type Point, type SceneCalcul } from './geometrie.ts';
import { segmentsBloquants } from './visibilite.ts';

/*
 * Ciblage sur la carte (lot L5.1) : distances, sorts en ligne, zones.
 * Port fidèle de js/carte.js : distanceCases, _traceBresenham, _ligneCases,
 * jetonsSurLigne, jetonsEnZone. Ce module ne connaît ni les armes ni les
 * sorts : il répond « qui est où » ; le combat (L6) décide quoi en faire.
 *
 * Règle nouvelle (décision du 15/10) : un monstre mort ne se cible plus.
 * Il n'apparaît dans aucun résultat de ce module.
 */

const ciblable = (j: JetonCarte) => !j.mort;

/** Cases de (x0,y0) à (x1,y1), départ exclu (v1 : _traceBresenham). */
export function traceBresenham(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  const cases: { x: number; y: number }[] = [];
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    cases.push({ x, y });
  }
  return cases;
}

/**
 * Cases couvertes par un sort en ligne tiré de `lanceur` vers `vise` (v1 :
 * _ligneCases). La ligne va TOUJOURS jusqu'au bout de sa longueur dans
 * cette direction, même si la cible est plus proche ; elle s'arrête AVANT
 * la première case dont le centre n'est plus en vue du lanceur (mêmes
 * obstacles que la vision : une porte ouverte laisse passer le sort).
 * `impact` = point d'arrêt sur l'obstacle, en cases, ou null.
 */
export function ligneCases(scene: SceneCalcul, lanceur: Case, vise: Case, longueur: number): { cases: { x: number; y: number }[]; impact: Point | null } {
  if (lanceur.cx === vise.cx && lanceur.cy === vise.cy) return { cases: [], impact: null };
  const dx = vise.cx - lanceur.cx, dy = vise.cy - lanceur.cy;
  const norme = Math.max(Math.hypot(dx, dy), 0.0001);
  const brutes = traceBresenham(lanceur.cx, lanceur.cy, lanceur.cx + (dx / norme) * longueur, lanceur.cy + (dy / norme) * longueur).slice(0, longueur);
  const segs = segmentsBloquants(scene); // une fois pour toute la ligne
  const p0 = centre(lanceur);
  const cases: { x: number; y: number }[] = [];
  for (const c of brutes) {
    const p1: Point = [c.x + 0.5, c.y + 0.5];
    let impact: Point | null = null, distImpact = Infinity;
    for (const [a, b] of segs) {
      const pt = intersectionSegments(p0, p1, a, b);
      if (!pt) continue;
      const d = Math.hypot(pt[0] - p0[0], pt[1] - p0[1]);
      if (d < distImpact) { distImpact = d; impact = pt; }
    }
    if (impact) return { cases, impact }; // le sort s'arrête sur l'obstacle, avant cette case
    cases.push(c);
  }
  return { cases, impact: null };
}

/** Jetons touchés par la ligne (lanceur exclu, morts exclus) (v1 : jetonsSurLigne). */
export function jetonsSurLigne(scene: SceneCalcul, jetons: readonly JetonCarte[], idLanceur: string, idVise: string, longueur: number): string[] {
  const src = jetons.find((j) => j.id === idLanceur);
  const dst = jetons.find((j) => j.id === idVise);
  if (!src || !dst || src.id === dst.id) return [];
  const { cases } = ligneCases(scene, src, dst, longueur);
  return jetons.filter((j) => j.id !== idLanceur && ciblable(j) && cases.some((c) => c.x === j.cx && c.y === j.cy)).map((j) => j.id);
}

/**
 * Jetons dans un rayon autour de la case du jeton `idCentre`, avec leur
 * cercle (0 = case visée, 1, 2…), en distance de Chebyshev (v1 :
 * jetonsEnZone). Le jeton central est inclus (cercle 0). Morts exclus.
 */
export function jetonsEnZone(jetons: readonly JetonCarte[], idCentre: string, rayon: number): { id: string; cercle: number }[] {
  const c = jetons.find((j) => j.id === idCentre);
  if (!c) return [];
  return jetons
    .filter(ciblable)
    .map((j) => ({ id: j.id, cercle: distanceCases(c, j) }))
    .filter((r) => r.cercle <= rayon);
}

/** Distance en cases entre deux jetons, ou null si l'un manque (v1 : distanceCases). */
export function distanceJetons(jetons: readonly JetonCarte[], idA: string, idB: string): number | null {
  const a = jetons.find((j) => j.id === idA);
  const b = jetons.find((j) => j.id === idB);
  return a && b ? distanceCases(a, b) : null;
}
