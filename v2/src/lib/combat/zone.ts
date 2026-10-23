import { ligneCases, ligneDeVue } from '../battlemap/ciblage.ts';
import { distanceCases, type Case, type JetonCarte, type SceneCalcul } from '../battlemap/geometrie.ts';
import { segmentsBloquants } from '../battlemap/visibilite.ts';

/*
 * Zones et portées des sorts sur la carte (lot L6.4a, décisions de Thomas
 * du 23/10/2026). Fonctions pures : le joueur vise sur la carte (6a), la
 * carte montre les cases touchées et les jetons pris dedans ; le combat
 * résout avec ce qu'elles rendent.
 *   - carré N : N × N cases centrées sur la case visée ;
 *   - cercle N : rayon N, en distance de cases (Chebyshev, comme
 *     jetonsEnZone de la v1) ;
 *   - ligne N : N cases depuis le lanceur vers la case visée, arrêtée par
 *     le premier obstacle (ligneCases, v1) ;
 *   - cône N (7a) : le quart de plan de 90° ouvert du lanceur vers la case
 *     visée, sur N cases ;
 *   - une case derrière un mur, vue du centre de la zone, n'est pas
 *     touchée (les mêmes obstacles que la vue).
 * L'anneau d'une case : sa distance au centre (0 au centre), pour les
 * zones dégressives du moteur.
 */

export interface ZoneSort {
  forme: 'carre' | 'cercle' | 'ligne' | 'cone';
  taille: number;
  origine: 'lanceur' | 'cible' | 'point';
}

export interface CaseTouchee extends Case {
  anneau: number;
}

const dans = (scene: Pick<SceneCalcul, 'colonnes' | 'lignes'>, c: Case) => c.cx >= 0 && c.cy >= 0 && c.cx < scene.colonnes && c.cy < scene.lignes;

/** Le centre de la zone : le lanceur (aura, ligne, cône) ou la case visée. */
export function centreDeZone(zone: ZoneSort, lanceur: Case, vise: Case): Case {
  return zone.origine === 'lanceur' && (zone.forme === 'carre' || zone.forme === 'cercle') ? lanceur : vise;
}

/** Les cases d'une zone, avec leur anneau ; la case du lanceur n'en fait jamais partie pour une ligne ou un cône. */
export function casesDeZone(scene: SceneCalcul, zone: ZoneSort, lanceur: Case, vise: Case): CaseTouchee[] {
  if (zone.forme === 'ligne') return ligneCases(scene, lanceur, vise, zone.taille).cases.map((c, i) => ({ cx: c.x, cy: c.y, anneau: i }));
  const segs = segmentsBloquants(scene);
  if (zone.forme === 'cone') {
    const dx = vise.cx - lanceur.cx;
    const dy = vise.cy - lanceur.cy;
    const norme = Math.hypot(dx, dy);
    if (!norme) return [];
    const r: CaseTouchee[] = [];
    for (let y = lanceur.cy - zone.taille; y <= lanceur.cy + zone.taille; y++)
      for (let x = lanceur.cx - zone.taille; x <= lanceur.cx + zone.taille; x++) {
        const c = { cx: x, cy: y };
        const d = distanceCases(lanceur, c);
        if (!dans(scene, c)) continue;
        // La case du lanceur (d = 0) : l'angle n'existe pas (NaN), elle n'est jamais prise.
        const cos = ((x - lanceur.cx) * dx + (y - lanceur.cy) * dy) / (Math.hypot(x - lanceur.cx, y - lanceur.cy) * norme);
        // 90° d'ouverture : 45° de part et d'autre de l'axe (une marge pour les cases sur le bord).
        if (cos >= Math.SQRT1_2 - 1e-9 && ligneDeVue(scene, lanceur, c, segs)) r.push({ ...c, anneau: d - 1 });
      }
    return r;
  }
  const centre = centreDeZone(zone, lanceur, vise);
  // Carré N : de −⌊(N−1)/2⌋ à +⌈(N−1)/2⌉ ; cercle N : rayon N.
  const bas = zone.forme === 'carre' ? Math.floor((zone.taille - 1) / 2) : zone.taille;
  const haut = zone.forme === 'carre' ? Math.ceil((zone.taille - 1) / 2) : zone.taille;
  const r: CaseTouchee[] = [];
  for (let y = centre.cy - bas; y <= centre.cy + haut; y++)
    for (let x = centre.cx - bas; x <= centre.cx + haut; x++) {
      const c = { cx: x, cy: y };
      if (dans(scene, c) && ligneDeVue(scene, centre, c, segs)) r.push({ ...c, anneau: distanceCases(centre, c) });
    }
  return r;
}

/** Les jetons vivants sur ces cases, lanceur exclu, avec leur anneau. */
export function jetonsDansZone(jetons: readonly JetonCarte[], cases: readonly CaseTouchee[], idLanceur: string): { id: string; anneau: number }[] {
  return jetons.flatMap((j) => {
    if (j.mort || j.id === idLanceur) return [];
    const c = cases.find((x) => x.cx === j.cx && x.cy === j.cy);
    return c ? [{ id: j.id, anneau: c.anneau }] : [];
  });
}

/** Portée d'un sort en cases : contact 1, soi 0, un nombre, ou celle de l'arme maniée. */
export function porteeEnCases(p: 'contact' | 'soi' | 'arme' | number, porteeArme: number): number {
  return p === 'contact' ? 1 : p === 'soi' ? 0 : p === 'arme' ? porteeArme : p;
}

/** Refus de portée ou de vue du lanceur vers la case visée (6a), ou null. */
export function refusDePortee(scene: SceneCalcul, lanceur: Case, vise: Case, portee: number, vue: boolean): string | null {
  const d = distanceCases(lanceur, vise);
  if (d > portee) return portee <= 1 ? `pas au contact (${d} cases)` : `hors de portée (${d} cases, ${portee} au plus)`;
  if (vue && d > 0 && !ligneDeVue(scene, lanceur, vise)) return 'pas de ligne de vue';
  return null;
}
