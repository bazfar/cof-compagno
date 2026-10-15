import type { GrilleExploration } from './exploration.ts';
import type { Case, JetonCarte, Point, SceneCalcul } from './geometrie.ts';
import { initiales, RAYON_JETON } from './interactions.ts';
import type { VisionJeton } from './visibilite.ts';
import type { Vue } from './vue.ts';

/*
 * Dessin de la battlemap en Canvas 2D (lot L5.2, décision 5 du 15/10).
 *
 * Tout se dessine EN CASES : une seule transformation (échelle + décalage
 * de la vue) passe de la scène à l'écran. Plus de canvas superposés à
 * recaler sur une image comme en v1 (5 couches DOM, d'où les décalages
 * entre jetons, murs et brouillard).
 *
 * Ordre : image, grille, murs et portes, brouillard, jetons. Les jetons
 * passent au-dessus du brouillard, comme en v1 ; pour un joueur, la liste
 * reçue ne contient déjà que ceux qu'un PJ voit (interactions.jetonsADessiner).
 *
 * Ce module ne calcule rien : visions, exploration et jetons visibles
 * arrivent tout faits. Il n'est pas testé seul (pas de canvas dans les
 * tests) ; tout ce qui décide y entre en paramètre et est testé ailleurs.
 */

export interface JetonAffiche extends JetonCarte {
  nom: string;
  couleur: string;
}

export interface Dessin {
  /** Taille du canvas en pixels d'écran (CSS). */
  largeur: number;
  hauteur: number;
  /** Rapport pixels physiques / pixels CSS (écrans haute densité). */
  densite: number;
  vue: Vue;
  scene: SceneCalcul;
  image: CanvasImageSource | null;
  jetons: readonly JetonAffiche[];
  visions: readonly VisionJeton[];
  /** Masque d'exploration déjà peint (peindreExploration), ou null sans brouillard. */
  masqueExploration: HTMLCanvasElement | OffscreenCanvas | null;
  /** Canvas de travail pour le brouillard, de la taille de l'écran. */
  tampon: HTMLCanvasElement | OffscreenCanvas;
  afficherMurs: boolean;
  afficherGrille: boolean;
  selection: string | null;
  survol: Case | null;
  /** Jeton en cours de glisser et sa case provisoire. */
  glisser: { id: string; case: Case } | null;
}

const COULEURS = {
  fond: '#1b1622',
  mur: 'rgba(220, 80, 0, 0.9)', // v1 : rendreMurs
  obstacle: 'rgba(80, 170, 230, 0.85)', // bloque la vue seulement : couleur à part
  porteFermee: '#ffcc00', // v1 : rendrePortails
  porteOuverte: '#44ff88',
  grille: 'rgba(255, 255, 255, 0.18)',
  survol: 'rgba(255, 255, 255, 0.25)',
  selection: '#e8c36a',
  mort: '#6f6a73',
  bordPJ: '#fbf6ea',
  bordAutre: '#2b2436',
};

/** Opacités du brouillard, reprises de la v1 (_dessinerFogVisuel). */
const BROUILLARD_OPAQUE = 0.92;
const ALLEGEMENT = 0.5; // zone explorée et zone de vision altérée : 0,92 × 0,5 ≈ 0,46

type Contexte = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function contexte(c: HTMLCanvasElement | OffscreenCanvas): Contexte {
  const ctx = c.getContext('2d') as Contexte | null;
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  return ctx;
}

/** Passe le contexte en coordonnées de scène (cases). */
function enCases(ctx: Contexte, d: Dessin) {
  ctx.setTransform(d.densite * d.vue.echelle, 0, 0, d.densite * d.vue.echelle, d.densite * d.vue.decalX, d.densite * d.vue.decalY);
}

function remplirPolygone(ctx: Contexte, poly: readonly Point[]) {
  if (poly.length < 3) return;
  ctx.beginPath();
  ctx.moveTo((poly[0] as Point)[0], (poly[0] as Point)[1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo((poly[i] as Point)[0], (poly[i] as Point)[1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * Peint la grille d'exploration dans un petit canvas (une sous-case = un
 * pixel opaque). À rappeler quand l'exploration change, pas à chaque image.
 */
export function peindreExploration(masque: HTMLCanvasElement | OffscreenCanvas, grille: GrilleExploration): void {
  masque.width = grille.largeur;
  masque.height = grille.hauteur;
  const ctx = contexte(masque);
  const img = ctx.createImageData(grille.largeur, grille.hauteur);
  for (let sy = 0; sy < grille.hauteur; sy++) {
    for (let sx = 0; sx < grille.largeur; sx++) {
      if (grille.estExploree(sx, sy)) img.data[(sy * grille.largeur + sx) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function dessinerBrouillard(ctx: Contexte, d: Dessin, masque: HTMLCanvasElement | OffscreenCanvas) {
  const t = d.tampon;
  if (t.width !== ctx.canvas.width || t.height !== ctx.canvas.height) {
    t.width = ctx.canvas.width;
    t.height = ctx.canvas.height;
  }
  const b = contexte(t);
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  b.globalAlpha = 1;
  b.clearRect(0, 0, t.width, t.height);
  enCases(b, d);
  // Le fond hors de la scène est déjà sombre ; sur la scène, brouillard opaque.
  b.fillStyle = `rgba(0, 0, 0, ${BROUILLARD_OPAQUE})`;
  b.fillRect(0, 0, d.scene.colonnes, d.scene.lignes);
  b.globalCompositeOperation = 'destination-out';
  // Déjà exploré : brouillard allégé. Lissé à l'agrandissement (sous-cases → écran).
  b.globalAlpha = ALLEGEMENT;
  b.imageSmoothingEnabled = true;
  b.drawImage(masque, 0, 0, d.scene.colonnes, d.scene.lignes);
  // Vu maintenant : allégé jusqu'à la portée altérée, clair jusqu'à la portée nette.
  b.fillStyle = '#000';
  for (const v of d.visions) {
    b.globalAlpha = ALLEGEMENT;
    remplirPolygone(b, v.alteree);
    b.globalAlpha = 1;
    remplirPolygone(b, v.claire);
  }
  b.globalCompositeOperation = 'source-over';
  b.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(t, 0, 0);
}

function dessinerJeton(ctx: Contexte, j: JetonAffiche, cx: number, cy: number, selectionne: boolean, echelle: number) {
  const x = cx + 0.5, y = cy + 0.5;
  ctx.globalAlpha = j.mort ? 0.6 : 1;
  ctx.beginPath();
  ctx.arc(x, y, RAYON_JETON, 0, Math.PI * 2);
  ctx.fillStyle = j.mort ? COULEURS.mort : j.couleur;
  ctx.fill();
  ctx.lineWidth = Math.max(2 / echelle, 0.05);
  ctx.strokeStyle = j.genre === 'pj' ? COULEURS.bordPJ : COULEURS.bordAutre;
  ctx.stroke();
  if (j.mort) {
    // Croix : le corps reste, la case est libre.
    const r = RAYON_JETON * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.strokeStyle = '#2b2436';
    ctx.lineWidth = Math.max(2 / echelle, 0.06);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${0.34}px 'Source Sans 3', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initiales(j.nom), x, y + 0.02);
  }
  ctx.globalAlpha = 1;
  if (selectionne) {
    ctx.beginPath();
    ctx.arc(x, y, RAYON_JETON + 0.08, 0, Math.PI * 2);
    ctx.strokeStyle = COULEURS.selection;
    ctx.lineWidth = Math.max(3 / echelle, 0.07);
    ctx.stroke();
  }
}

export function dessiner(ctx: CanvasRenderingContext2D, d: Dessin): void {
  const { scene, vue } = d;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COULEURS.fond;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  enCases(ctx, d);
  const trait = (px: number) => px / vue.echelle; // épaisseur constante à l'écran

  if (d.image) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(d.image, 0, 0, scene.colonnes, scene.lignes);
  }

  if (d.afficherGrille) {
    ctx.strokeStyle = COULEURS.grille;
    ctx.lineWidth = trait(1);
    ctx.beginPath();
    for (let x = 0; x <= scene.colonnes; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, scene.lignes); }
    for (let y = 0; y <= scene.lignes; y++) { ctx.moveTo(0, y); ctx.lineTo(scene.colonnes, y); }
    ctx.stroke();
  }

  ctx.lineCap = 'round';
  if (d.afficherMurs) {
    ctx.lineWidth = trait(2.5);
    for (const [segments, couleur] of [[scene.murs, COULEURS.mur], [scene.obstacles, COULEURS.obstacle]] as const) {
      ctx.strokeStyle = couleur;
      ctx.beginPath();
      for (const [a, b] of segments) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
  }
  // Portes : toujours dessinées, tout le monde peut les ouvrir (décision 3b).
  for (const p of scene.portes) {
    ctx.strokeStyle = p.ouverte ? COULEURS.porteOuverte : COULEURS.porteFermee;
    ctx.lineWidth = trait(4);
    ctx.setLineDash(p.ouverte ? [trait(6), trait(4)] : []);
    ctx.beginPath();
    ctx.moveTo(p.a[0], p.a[1]);
    ctx.lineTo(p.b[0], p.b[1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (d.masqueExploration) {
    dessinerBrouillard(ctx, d, d.masqueExploration);
    enCases(ctx, d);
  }

  if (d.survol) {
    ctx.fillStyle = COULEURS.survol;
    ctx.fillRect(d.survol.cx, d.survol.cy, 1, 1);
  }

  for (const j of d.jetons) {
    const pos = d.glisser?.id === j.id ? d.glisser.case : j;
    dessinerJeton(ctx, j, pos.cx, pos.cy, d.selection === j.id, vue.echelle);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
