import { borner, centre, distanceCases, distancePointSegment, intersectionSegments, type Case, type JetonCarte, type Point, type Porte, type SceneCalcul } from './geometrie.ts';

/*
 * Déplacement et placement des jetons (lot L5.1), en cases.
 * Port fidèle de js/carte.js : _portailProche, _deplacementBloque,
 * _casesGrilleAutour, _resoudreCase, _posePlacementParDefaut,
 * ajouterTokensLot (partie géométrique), et la détection de l'attaque
 * d'opportunité de finDragDD.
 *
 * Règles nouvelles (décisions du 15/10) : un monstre mort ne tient plus
 * sa case (on peut poser un jeton dessus, il ne provoque plus d'attaque
 * d'opportunité) ; un PJ ne s'arrête pas sur la case d'une créature
 * vivante (interactions.pasDeGlisser, lot L5.3).
 */

/**
 * Porte la plus proche d'un point, à moins de `tolerance` cases. Une porte
 * Dungeondraft est souvent centrée sur la limite entre deux cases et un peu
 * plus étroite qu'une case : un trajet de centre à centre ne tombe presque
 * jamais pile dans son ouverture. On associe donc au point où le trajet
 * coupe le mur la porte la plus proche, à moins d'une case (v1).
 */
function porteProche(scene: SceneCalcul, pt: Point, tolerance: number): Porte | null {
  let meilleure: Porte | null = null, meilleureDist = tolerance;
  for (const p of scene.portes) {
    const d = distancePointSegment(pt[0], pt[1], p.a[0], p.a[1], p.b[0], p.b[1]);
    if (d <= meilleureDist) { meilleure = p; meilleureDist = d; }
  }
  return meilleure;
}

/** Ce qui arrête un jeton : sert aussi aux dégâts de collision des poussées (L6). */
export type Obstacle = 'mur' | 'porte' | 'occupant';

/**
 * Ce qui arrête un PJ qui va de la case `de` à la case `vers` (ligne droite
 * entre les centres), ou null si le passage est libre. Arrêt s'il traverse
 * un mur sans porte ouverte à moins d'une case (« mur », ou « porte » si une
 * porte fermée est là), ou une porte fermée. Les obstacles (arbres,
 * rochers) ne bloquent pas le passage (v1 : _deplacementBloque).
 */
export function obstacleDeplacement(scene: SceneCalcul, de: Case, vers: Case): Exclude<Obstacle, 'occupant'> | null {
  const p0 = centre(de), p1 = centre(vers);
  for (const [a, b] of scene.murs) {
    const pt = intersectionSegments(p0, p1, a, b);
    if (!pt) continue;
    const porte = porteProche(scene, pt, 1);
    if (porte && porte.ouverte) continue; // porte ouverte juste là : on passe
    return porte ? 'porte' : 'mur'; // porte fermée à proximité, ou mur plein
  }
  for (const p of scene.portes) {
    if (!p.ouverte && intersectionSegments(p0, p1, p.a, p.b)) return 'porte';
  }
  return null;
}

/**
 * Un PJ qui va de `de` à `vers` est-il arrêté par un mur ou une porte
 * fermée ? Les monstres ne sont jamais arrêtés : le MJ les place où il
 * veut (v1).
 */
export function deplacementBloque(scene: SceneCalcul, de: Case, vers: Case): boolean {
  return obstacleDeplacement(scene, de, vers) !== null;
}

/** La case est-elle tenue par un jeton ? Un monstre mort ne tient plus sa case. */
export function caseOccupee(jetons: readonly JetonCarte[], cx: number, cy: number): boolean {
  return jetons.some((j) => j.cx === cx && j.cy === cy && !j.mort);
}

/**
 * Grille compacte de n cases centrée sur l'ancre, remplie de gauche à
 * droite puis de haut en bas : l'ordre de la liste devient l'ordre visuel
 * (v1 : _casesGrilleAutour).
 */
export function casesGrilleAutour(n: number, ancre: Case): Case[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rangs = Math.ceil(n / cols);
  const decalCol = Math.floor((cols - 1) / 2);
  const decalRang = Math.floor((rangs - 1) / 2);
  const cases: Case[] = [];
  for (let i = 0; i < n; i++) {
    cases.push({ cx: ancre.cx + ((i % cols) - decalCol), cy: ancre.cy + (Math.floor(i / cols) - decalRang) });
  }
  return cases;
}

export interface CaseResolue extends Case {
  /** Aucune case libre à 12 cases : posé sur l'ancre, par-dessus un autre. */
  empile: boolean;
}

/**
 * Case finale d'un jeton posé en groupe, à partir de sa case théorique
 * (v1 : _resoudreCase). La case doit être libre et, pour un PJ, atteignable
 * depuis `origine` (la case du jeton posé juste avant) sans traverser de
 * mur. Sinon, on cherche en spirale la case libre la plus proche, jusqu'à
 * 12 cases. Au-delà, on empile sur l'ancre plutôt que de perdre le jeton.
 */
export function resoudreCase(
  scene: SceneCalcul,
  jetons: readonly JetonCarte[],
  theorique: Case,
  estPJ: boolean,
  origine: Case,
  ancre: Case,
): CaseResolue {
  const essai = (cx: number, cy: number): Case | null => {
    const c = borner(scene, cx, cy);
    if (caseOccupee(jetons, c.cx, c.cy)) return null;
    if (estPJ && deplacementBloque(scene, origine, c)) return null;
    return c;
  };
  const direct = essai(theorique.cx, theorique.cy);
  if (direct) return { ...direct, empile: false };
  for (let rayon = 1; rayon <= 12; rayon++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      for (let dy = -rayon; dy <= rayon; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rayon) continue; // l'anneau seul, l'intérieur est déjà testé
        const r = essai(theorique.cx + dx, theorique.cy + dy);
        if (r) return { ...r, empile: false };
      }
    }
  }
  return { ...borner(scene, ancre.cx, ancre.cy), empile: true };
}

/**
 * Pose d'un lot de jetons autour d'une ancre (v1 : ajouterTokensLot, partie
 * géométrique ; les droits et les doublons sont vérifiés avant, L5.3).
 * Chaque jeton posé occupe sa case pour les suivants, et sert d'origine au
 * test de mur du suivant : le groupe « arrive ensemble », jeton après jeton,
 * ce qui permet de contourner un angle de mur.
 */
export function placerLot(
  scene: SceneCalcul,
  jetons: readonly JetonCarte[],
  lot: readonly { id: string; genre: JetonCarte['genre'] }[],
  ancre: Case,
): { poses: JetonCarte[]; empilements: number } {
  const cellules = casesGrilleAutour(lot.length, ancre);
  const occupes: JetonCarte[] = [...jetons];
  const poses: JetonCarte[] = [];
  let origine = ancre, empilements = 0;
  lot.forEach((d, i) => {
    const r = resoudreCase(scene, occupes, cellules[i] as Case, d.genre === 'pj', origine, ancre);
    const jeton: JetonCarte = { id: d.id, genre: d.genre, cx: r.cx, cy: r.cy };
    occupes.push(jeton);
    poses.push(jeton);
    origine = r;
    if (r.empile) empilements++;
  });
  return { poses, empilements };
}

/**
 * Case d'arrivée d'un jeton posé seul (v1 : _posePlacementParDefaut). Les PJ
 * arrivent en colonne près du bord gauche (colonne 1, pour éviter un mur de
 * bordure), les autres vers le centre de la carte.
 */
export function placementParDefaut(scene: SceneCalcul, jetons: readonly JetonCarte[], estPJ: boolean): Case {
  const n = jetons.length;
  const nPJ = jetons.filter((j) => j.genre === 'pj').length;
  return estPJ
    ? borner(scene, 1, Math.floor(scene.lignes / 2) - 2 + nPJ)
    : borner(scene, Math.floor(scene.colonnes / 2) + (n % 4), Math.floor(scene.lignes / 2) + Math.floor(n / 4));
}

/**
 * PJ qui étaient au contact du jeton déplacé et ne le sont plus : ce sont
 * eux qui peuvent tenter une attaque d'opportunité (v1 : demarrerDragDD /
 * finDragDD). La classe du PJ (éligible ou non) est vérifiée par le combat
 * (L6). Un PJ qui bouge ne provoque rien ; un monstre mort non plus
 * (décision du 15/10).
 */
export function contactsPerdus(jetons: readonly JetonCarte[], bouge: JetonCarte, avant: Case, apres: Case): string[] {
  if (bouge.genre === 'pj' || bouge.mort) return [];
  return jetons
    .filter((j) => j.genre === 'pj' && j.id !== bouge.id)
    .filter((j) => distanceCases(avant, j) <= 1 && distanceCases(apres, j) > 1)
    .map((j) => j.id);
}
