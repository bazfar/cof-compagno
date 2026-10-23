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

/*
 * Lot L6.4a (10a, décisions de Thomas du 23/10/2026) : un sort repousse de
 * N cases (case par case, la collision arrête le jeton et blesse comme en
 * L6.3) ou attire de N cases vers le lanceur (le jeton s'arrête devant ce
 * qui le bloque, sans dégâts) ; une zone posée sur une case repousse ou
 * attire depuis son centre (Vortex) ; « téléporte » et « libre » : le joueur
 * clique la case d'arrivée, à N cases au plus, libre.
 */

/** Un pas vers le lanceur ; null s'il est au contact ou que la case est prise ou bloquée. */
export function attirer(scene: SceneCalcul, jetons: readonly JetonCarte[], idLanceur: string, idCible: string): Case | null {
  const a = jetons.find((j) => j.id === idLanceur);
  const c = jetons.find((j) => j.id === idCible);
  if (!a || !c) return null;
  const dx = Math.sign(a.cx - c.cx), dy = Math.sign(a.cy - c.cy);
  const vers = { cx: c.cx + dx, cy: c.cy + dy };
  if ((!dx && !dy) || (vers.cx === a.cx && vers.cy === a.cy)) return null;
  if (obstacleDeplacement(scene, c, vers) || caseOccupee(jetons, vers.cx, vers.cy)) return null;
  const p0 = centre(c), p1 = centre(vers);
  return scene.obstacles.some(([x, y]) => intersectionSegments(p0, p1, x, y)) ? null : vers;
}

const ORIGINE = '·origine';

/** Le trajet d'un jeton repoussé ou attiré de `cases` cases depuis `origine` (le lanceur, le centre d'une zone) : où il s'arrête, et la collision qui l'arrête (repousser seulement). */
export function trajet(
  scene: SceneCalcul,
  jetons: readonly JetonCarte[],
  origine: Case,
  idCible: string,
  sens: 'repousse' | 'attire',
  cases: number,
): { vers: Case | null; collision: Exclude<Poussee, { vers: Case }> | null } {
  // L'origine, en jeton fantôme : elle ne tient pas de case.
  const idLanceur = ORIGINE;
  let js: readonly JetonCarte[] = [...jetons, { id: ORIGINE, genre: 'libre', cx: origine.cx, cy: origine.cy, mort: true }];
  let vers: Case | null = null;
  for (let i = 0; i < cases; i++) {
    if (sens === 'attire') {
      const v = attirer(scene, js, idLanceur, idCible);
      if (!v) break;
      vers = v;
    } else {
      const p = pousser(scene, js, idLanceur, idCible);
      if (!p) break;
      if (!('vers' in p)) return { vers, collision: p };
      vers = p.vers;
    }
    const v = vers;
    js = js.map((j) => (j.id === idCible ? { ...j, cx: v.cx, cy: v.cy } : j));
  }
  return { vers, collision: null };
}

/** La case d'arrivée d'une téléportation ou d'un déplacement libre : dans la carte, à `cases` au plus, libre ; un refus sinon. */
export function arriveePermise(scene: SceneCalcul, jetons: readonly JetonCarte[], idCible: string, vers: Case, cases: number): string | null {
  const c = jetons.find((j) => j.id === idCible);
  if (!c) return 'ce jeton n’est pas sur la carte';
  if (vers.cx < 0 || vers.cy < 0 || vers.cx >= scene.colonnes || vers.cy >= scene.lignes) return 'hors de la carte';
  if (Math.max(Math.abs(vers.cx - c.cx), Math.abs(vers.cy - c.cy)) > cases) return `${cases} case${cases > 1 ? 's' : ''} au plus`;
  if (caseOccupee(jetons.filter((j) => j.id !== idCible), vers.cx, vers.cy)) return 'case prise';
  return null;
}
