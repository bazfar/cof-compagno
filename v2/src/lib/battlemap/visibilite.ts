import { centre, segmentPorteFermee, type JetonCarte, type Point, type SceneCalcul, type Segment } from './geometrie.ts';

/*
 * Ligne de vue et brouillard (lot L5.1), en cases.
 * Port fidèle de js/carte.js : VisibilityPolygon, _segmentsBloquants,
 * _plafonnerPortee, _pointDansPolygone, calculerEtRendreLoS (partie
 * calcul). Le dessin du brouillard viendra avec le rendu (L5.2).
 */

/** Portées de vision d'un PJ, en cases (v1 : PORTEE_VISION_CLAIRE / ALTEREE). */
export const PORTEE_VISION_CLAIRE = 8;
export const PORTEE_VISION_ALTEREE = 4;
/** Angles ajoutés pour arrondir le polygone en terrain dégagé (v1 : 32). */
const ECHANTILLONS_VISION = 32;

/* ---------- Polygone de visibilité ----------
 * Algorithme de Jason Davies, d'après visibility-polygon-js (MIT), tel que
 * la v1 l'a traduit. `bornes` = [x, y, largeur, hauteur] : rectangle où
 * s'arrêtent les rayons qui ne touchent rien. Sans bornes, il est dérivé des
 * segments et de la position, avec une marge d'une unité (v1 : _bounds). */

function intersectionRayon(ray: Segment, seg: Segment): number | null {
  const [p, q] = ray, [a, b] = seg;
  const r = [q[0] - p[0], q[1] - p[1]] as const;
  const s = [b[0] - a[0], b[1] - a[1]] as const;
  const d = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(d) < 1e-10) return null;
  const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / d;
  const u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / d;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

function bornesDepuis(segs: readonly Segment[], position: Point): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segs) for (const p of s) {
    if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
  }
  if (position[0] < minX) minX = position[0]; if (position[1] < minY) minY = position[1];
  if (position[0] > maxX) maxX = position[0]; if (position[1] > maxY) maxY = position[1];
  const pad = 1;
  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];
}

export function polygoneVisibilite(
  position: Point,
  segments: readonly Segment[],
  bornes?: readonly [number, number, number, number],
  nbEchantillons = 0,
): Point[] {
  const bounded: Segment[] = segments.slice();
  const [bx, by, bw, bh] = bornes ?? bornesDepuis(bounded, position);
  bounded.push([[bx, by], [bx + bw, by]], [[bx + bw, by], [bx + bw, by + bh]], [[bx + bw, by + bh], [bx, by + bh]], [[bx, by + bh], [bx, by]]);
  const angles: number[] = [];
  for (const seg of bounded) {
    for (const pt of seg) {
      const angle = Math.atan2(pt[1] - position[1], pt[0] - position[0]);
      angles.push(angle, angle - 0.0001, angle + 0.0001);
    }
  }
  for (let i = 0; i < nbEchantillons; i++) angles.push((i / nbEchantillons) * Math.PI * 2 - Math.PI);
  angles.sort((a, b) => a - b);
  const polygone: Point[] = [];
  let prevAngle = 0;
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i] as number;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const ray: Segment = [position, [position[0] + dx, position[1] + dy]];
    let minT = Infinity, touche = false;
    for (const seg of bounded) {
      const t = intersectionRayon(ray, seg);
      if (t !== null && t < minT) { minT = t; touche = true; }
    }
    if (touche && (i === 0 || Math.abs(angle - prevAngle) > 0.0002)) polygone.push([position[0] + dx * minT, position[1] + dy * minT]);
    prevAngle = angle;
  }
  return polygone;
}

/**
 * Ce qui bloque la vue : murs, obstacles (dessinés ou importés) et portes
 * FERMÉES. Une porte ouverte ne bloque rien : le regard passe par
 * l'embrasure (v1 : _segmentsBloquants). Sert aussi aux sorts en ligne :
 * « je le vois » et « je peux le toucher » ont la même source.
 */
export function segmentsBloquants(scene: SceneCalcul): Segment[] {
  const segs: Segment[] = [...scene.murs, ...scene.obstacles];
  for (const p of scene.portes) {
    const s = segmentPorteFermee(p);
    if (s) segs.push(s);
  }
  return segs;
}

/** Ramène chaque sommet à `maxDist` du centre au plus (v1 : _plafonnerPortee). */
export function plafonnerPortee(poly: readonly Point[], posX: number, posY: number, maxDist: number): Point[] {
  return poly.map(([x, y]) => {
    const dx = x - posX, dy = y - posY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDist) return [x, y] as Point;
    const scale = maxDist / dist;
    return [posX + dx * scale, posY + dy * scale] as Point;
  });
}

/** Test pair-impair (v1 : _pointDansPolygone). */
export function pointDansPolygone(pt: Point, poly: readonly Point[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as Point;
    const [xj, yj] = poly[j] as Point;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Vision d'un PJ : zone nette (8 cases) et zone altérée (12 cases), en cases. */
export interface VisionJeton {
  idJeton: string;
  claire: Point[];
  alteree: Point[];
}

/**
 * Vision de chaque PJ de la scène (v1 : calculerEtRendreLoS). Seuls les PJ
 * voient ; un PJ à terre voit encore. `bloquants` se passe quand on a déjà
 * calculé segmentsBloquants(scene) (ex. plusieurs appels pour un rendu).
 */
export function visionsDesPJ(scene: SceneCalcul, jetons: readonly JetonCarte[], bloquants = segmentsBloquants(scene)): VisionJeton[] {
  const visions: VisionJeton[] = [];
  for (const j of jetons) {
    if (j.genre !== 'pj') continue;
    const [x, y] = centre(j);
    const poly = polygoneVisibilite([x, y], bloquants, [0, 0, scene.colonnes, scene.lignes], ECHANTILLONS_VISION);
    if (poly.length < 3) continue;
    visions.push({
      idJeton: j.id,
      claire: plafonnerPortee(poly, x, y, PORTEE_VISION_CLAIRE),
      alteree: plafonnerPortee(poly, x, y, PORTEE_VISION_CLAIRE + PORTEE_VISION_ALTEREE),
    });
  }
  return visions;
}

/**
 * Le centre de cette case est-il vu par au moins un PJ ? La détection
 * utilise la zone ALTÉRÉE : on perçoit une présence même en vision trouble
 * (v1 : _monstreVisiblePourJoueurs). Le MJ, lui, voit toujours tout.
 */
export function caseVueParLesPJ(visions: readonly VisionJeton[], cx: number, cy: number): boolean {
  const pt: Point = [cx + 0.5, cy + 0.5];
  return visions.some((v) => pointDansPolygone(pt, v.alteree));
}

/**
 * Jetons montrés aux joueurs : les PJ toujours, tous les autres (monstres,
 * invocations, jetons libres) seulement s'ils sont vus, comme en v1
 * (rendreTokensDD). Un monstre mort reste montré s'il est vu : on voit le corps.
 */
export function jetonsVisiblesDesPJ(visions: readonly VisionJeton[], jetons: readonly JetonCarte[]): Set<string> {
  const vus = new Set<string>();
  for (const j of jetons) if (j.genre === 'pj' || caseVueParLesPJ(visions, j.cx, j.cy)) vus.add(j.id);
  return vus;
}

/**
 * Monstres (et invocations) qui viennent d'entrer dans la vue des PJ, à
 * annoncer au combat pour l'initiative (v1 : onMonstreDevientVisible).
 * `dejaAnnonces` : ceux déjà signalés depuis le début du combat. Nouveauté
 * 2.0 : un monstre déjà mort n'est jamais annoncé.
 */
export function monstresQuiApparaissent(
  visions: readonly VisionJeton[],
  jetons: readonly JetonCarte[],
  dejaAnnonces: ReadonlySet<string>,
): string[] {
  return jetons
    .filter((j) => (j.genre === 'monstre' || j.genre === 'invocation') && !j.mort && !dejaAnnonces.has(j.id))
    .filter((j) => caseVueParLesPJ(visions, j.cx, j.cy))
    .map((j) => j.id);
}
