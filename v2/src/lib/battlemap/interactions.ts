import { deplacementBloque } from './deplacement.ts';
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
 * dégagé (la porte ouverte, par exemple). Les autres jetons vont partout.
 */
export function pasDeGlisser(scene: SceneCalcul, jeton: JetonCarte, actuelle: Case, visee: Case): Case {
  if (visee.cx === actuelle.cx && visee.cy === actuelle.cy) return actuelle;
  if (jeton.genre === 'pj' && deplacementBloque(scene, actuelle, visee)) return actuelle;
  return visee;
}

/** Initiales d'un nom, pour le jeton (v1 : initiales). */
export function initiales(nom: string): string {
  return (nom || '?').trim().split(/\s+/).map((m) => m[0]).slice(0, 2).join('').toUpperCase();
}
