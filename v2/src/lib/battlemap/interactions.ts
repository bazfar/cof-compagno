import { caseOccupee, coutDuPas, obstacleDeplacement, traverseInfranchissable, type Obstacle } from './deplacement.ts';
import { distancePointSegment, type Case, type JetonCarte, type Point, type Porte, type SceneCalcul } from './geometrie.ts';

/*
 * Ce que fait un geste sur la carte (lot L5.2), sans DOM : quel jeton ou
 * quelle porte est sous le pointeur, où va un jeton qu'on fait glisser,
 * qui a le droit de le bouger, dans quel ordre dessiner. Le composant
 * Battlemap.svelte ne fait que traduire les événements en appels ici.
 */

export type Role = 'mj' | 'joueur';

/** Rayon d'un jeton, en cases (le jeton tient dans sa case). */
export const RAYON_JETON = 0.42;

/**
 * Porte sous le pointeur (v1 : _basculerPortailAuClic) : la plus proche à
 * moins de max(8 px, 0,35 case). `echelle` = pixels d'écran par case.
 */
export function porteSousPointeur(scene: SceneCalcul, pt: Point, echelle: number): Porte | null {
  const seuil = Math.max(8 / echelle, 0.35);
  let meilleure: Porte | null = null, meilleureDist = Infinity;
  for (const p of scene.portes) {
    const d = distancePointSegment(pt[0], pt[1], p.a[0], p.a[1], p.b[0], p.b[1]);
    if (d < seuil && d < meilleureDist) { meilleure = p; meilleureDist = d; }
  }
  return meilleure;
}

/**
 * Ordre de dessin : les morts d'abord (en dessous), puis les vivants. Pour
 * un joueur, les jetons qu'aucun PJ ne voit sont retirés (le MJ voit tout).
 */
export function jetonsADessiner(jetons: readonly JetonCarte[], role: Role, visibles: ReadonlySet<string>): JetonCarte[] {
  const montres = role === 'mj' ? [...jetons] : jetons.filter((j) => visibles.has(j.id));
  return [...montres.filter((j) => j.mort), ...montres.filter((j) => !j.mort)];
}

/** Jeton sous le pointeur : le dernier dessiné l'emporte (un vivant sur un mort). */
export function jetonSousPointeur(dessines: readonly JetonCarte[], pt: Point): JetonCarte | null {
  for (let i = dessines.length - 1; i >= 0; i--) {
    const j = dessines[i] as JetonCarte;
    if (Math.hypot(pt[0] - (j.cx + 0.5), pt[1] - (j.cy + 0.5)) <= RAYON_JETON) return j;
  }
  return null;
}

/**
 * Droit de déplacer (v1 : demarrerDragDD) : le MJ bouge tout ; un joueur
 * seulement son PJ et ses invocations, désignés par `miens`.
 */
export function peutDeplacer(role: Role, jeton: JetonCarte, miens: ReadonlySet<string>): boolean {
  return role === 'mj' || miens.has(jeton.id);
}

/**
 * Pas d'un glisser (v1 : surDragDD) : le jeton suit le pointeur case par
 * case. Un PJ ne passe pas d'un mur ou d'une porte fermée : il reste sur sa
 * dernière case libre et repart dès que le pointeur repasse par un chemin
 * dégagé (la porte ouverte, par exemple). Les autres jetons vont partout :
 * le MJ place ses monstres où il veut.
 *
 * Écart volontaire avec la v1 (décision du 15/10) : un PJ ne s'arrête pas
 * non plus sur la case d'une créature vivante. Il peut la traverser (le
 * pointeur passe au-delà, le pas suivant part de sa dernière case libre),
 * pas y rester. Un corps (monstre mort) ne gêne pas.
 *
 * `arret` dit ce qui a retenu le jeton à ce pas ; il servira aux dégâts de
 * collision des poussées (L6).
 */
export function pasDeGlisser(
  scene: SceneCalcul,
  jetons: readonly JetonCarte[],
  jeton: JetonCarte,
  actuelle: Case,
  visee: Case,
): { case: Case; arret: Obstacle | null } {
  if (visee.cx === actuelle.cx && visee.cy === actuelle.cy) return { case: actuelle, arret: null };
  if (jeton.genre !== 'pj') return { case: visee, arret: null };
  const obstacle = obstacleDeplacement(scene, actuelle, visee);
  if (obstacle) return { case: actuelle, arret: obstacle };
  // L6.4b1 (1a) : une case infranchissable du MJ arrête un PJ, comme un mur.
  if (traverseInfranchissable(actuelle, visee, scene.infranchissables)) return { case: actuelle, arret: 'mur' };
  const autres = jetons.filter((j) => j.id !== jeton.id);
  if (caseOccupee(autres, visee.cx, visee.cy)) return { case: actuelle, arret: 'occupant' };
  return { case: visee, arret: null };
}

/**
 * Pas d'un glisser en combat (lot L6.1, 7a) : comme `pasDeGlisser`, mais
 * le jeton ne dépense pas plus de cases qu'il ne lui en reste. `restant` :
 * cases encore disponibles à ce pas. Rend la case atteinte et ce qu'elle a
 * coûté (distance en cases, une diagonale compte pour une).
 */
export function pasDeGlisserBorne(
  scene: SceneCalcul,
  jetons: readonly JetonCarte[],
  jeton: JetonCarte,
  actuelle: Case,
  visee: Case,
  restant: number,
): { case: Case; cout: number; arret: Obstacle | 'epuise' | null } {
  const p = pasDeGlisser(scene, jetons, jeton, actuelle, visee);
  // L6.4b1 (2a) : entrer dans une case difficile coûte 2 cases.
  const cout = coutDuPas(actuelle, p.case, scene.difficiles);
  if (cout > restant) return { case: actuelle, cout: 0, arret: 'epuise' };
  return { case: p.case, cout, arret: p.arret };
}

/**
 * Les cases d'un pas à l'autre, une à une, départ exclu (lot L6.5b, 3b) :
 * un glisser rapide saute des cases, le chemin les intercale (en diagonale
 * d'abord, puis tout droit).
 */
export function pasAPas(a: Case, b: Case): Case[] {
  const r: Case[] = [];
  let k = a;
  while (k.cx !== b.cx || k.cy !== b.cy) {
    k = { cx: k.cx + Math.sign(b.cx - k.cx), cy: k.cy + Math.sign(b.cy - k.cy) };
    r.push(k);
  }
  return r;
}

/** Initiales d'un nom, pour le jeton (v1 : initiales). */
export function initiales(nom: string): string {
  return (nom || '?').trim().split(/\s+/).map((m) => m[0]).slice(0, 2).join('').toUpperCase();
}
