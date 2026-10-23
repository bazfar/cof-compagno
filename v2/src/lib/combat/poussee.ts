import { caseOccupee, obstacleDeplacement } from '../battlemap/deplacement.ts';
import { centre, intersectionSegments, type Case, type JetonCarte, type SceneCalcul } from '../battlemap/geometrie.ts';

/*
 * Repousser d'une case (lot L6.3, décisions de Thomas du 23/10/2026) :
 *   - 12a : l'app pousse le jeton de la cible d'une case, dans l'axe de
 *     l'attaquant vers la cible (diagonale comprise) ;
 *   - si la case est prise, c'est une collision : contre un autre jeton,
 *     1d4 à celui qui heurte et 1d4 à celui qui est heurté ; contre le
 *     décor (mur, porte fermée, obstacle dessiné, bord de la carte), 1d6 à
 *     celui qui heurte. Un sort ou une action peut le dire autrement ;
 *   - Ba : une poussée s'arrête sur un obstacle dessiné (rocher, arbre),
 *     alors qu'à pied on le traverse. Marquer case par case ce qui se
 *     franchit viendra avec les cases spéciales (L6.4).
 */

export const DEGATS_COLLISION_JETON = '1d4';
export const DEGATS_COLLISION_DECOR = '1d6';

export type Poussee = { vers: Case } | { collision: 'jeton'; avec: string } | { collision: 'decor' };

export function pousser(scene: SceneCalcul, jetons: readonly JetonCarte[], idAttaquant: string, idCible: string): Poussee | null {
  const a = jetons.find((j) => j.id === idAttaquant);
  const c = jetons.find((j) => j.id === idCible);
  if (!a || !c) return null;
  const dx = Math.sign(c.cx - a.cx), dy = Math.sign(c.cy - a.cy);
  if (!dx && !dy) return null;
  const vers = { cx: c.cx + dx, cy: c.cy + dy };
  if (vers.cx < 0 || vers.cy < 0 || vers.cx >= scene.colonnes || vers.cy >= scene.lignes) return { collision: 'decor' };
  if (obstacleDeplacement(scene, c, vers)) return { collision: 'decor' };
  const p0 = centre(c), p1 = centre(vers);
  if (scene.obstacles.some(([x, y]) => intersectionSegments(p0, p1, x, y))) return { collision: 'decor' };
  if (caseOccupee(jetons, vers.cx, vers.cy)) return { collision: 'jeton', avec: jetons.find((j) => j.cx === vers.cx && j.cy === vers.cy && !j.mort)!.id };
  return { vers };
}
