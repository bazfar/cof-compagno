import type { Point } from './geometrie.ts';
import { pointDansPolygone, type VisionJeton } from './visibilite.ts';

/*
 * Brouillard « déjà exploré », PARTAGÉ par toute la table (décision 2a du
 * 15/10). Nouveauté 2.0.
 *
 * En v1, chaque navigateur gardait une image de ce qu'IL avait vu : deux
 * joueurs n'avaient pas le même brouillard, et un rechargement de page
 * l'effaçait. Ici, l'exploration est une grille de booléens, assez petite
 * pour vivre dans un document Firestore (L5.3) : 80 × 50 cases à 2 × 2
 * sous-cases = 16 000 bits = 2 Ko.
 *
 * Résolution : chaque case est découpée en SOUS_CASES × SOUS_CASES ; une
 * sous-case est explorée dès que son centre a été dans la zone ALTÉRÉE
 * d'un PJ (comme la v1, qui marquait la zone altérée). Le rendu (L5.2)
 * l'adoucit à l'écran.
 *
 * Fusion : on ne fait qu'ajouter des sous-cases explorées. Deux clients qui
 * explorent en même temps se fusionnent par un OU (L5.3, en transaction),
 * sans jamais rien perdre. Seul le MJ efface (réinitialiser) ou remplit
 * (tout révéler).
 */

export const SOUS_CASES = 2;

export class GrilleExploration {
  readonly largeur: number;
  readonly hauteur: number;
  readonly bits: Uint8Array;

  constructor(colonnes: number, lignes: number, bits?: Uint8Array) {
    this.largeur = colonnes * SOUS_CASES;
    this.hauteur = lignes * SOUS_CASES;
    const taille = Math.ceil((this.largeur * this.hauteur) / 8);
    if (bits && bits.length !== taille) throw new Error(`Exploration : ${bits.length} octets reçus, ${taille} attendus.`);
    this.bits = bits ?? new Uint8Array(taille);
  }

  estExploree(sx: number, sy: number): boolean {
    if (sx < 0 || sy < 0 || sx >= this.largeur || sy >= this.hauteur) return false;
    const i = sy * this.largeur + sx;
    return ((this.bits[i >> 3] as number) & (1 << (i & 7))) !== 0;
  }

  /** Marque la sous-case ; vrai si elle ne l'était pas encore. */
  private marquerSousCase(sx: number, sy: number): boolean {
    const i = sy * this.largeur + sx;
    const avant = this.bits[i >> 3] as number;
    const apres = avant | (1 << (i & 7));
    this.bits[i >> 3] = apres;
    return apres !== avant;
  }

  /** Marque tout ce qui est dans le polygone (en cases). Rend le nombre de sous-cases nouvellement explorées. */
  marquerPolygone(poly: readonly Point[]): number {
    if (poly.length < 3) return 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const sx0 = Math.max(0, Math.floor(minX * SOUS_CASES)), sx1 = Math.min(this.largeur - 1, Math.ceil(maxX * SOUS_CASES));
    const sy0 = Math.max(0, Math.floor(minY * SOUS_CASES)), sy1 = Math.min(this.hauteur - 1, Math.ceil(maxY * SOUS_CASES));
    let nouvelles = 0;
    for (let sy = sy0; sy <= sy1; sy++) {
      for (let sx = sx0; sx <= sx1; sx++) {
        if (this.estExploree(sx, sy)) continue;
        const pt: Point = [(sx + 0.5) / SOUS_CASES, (sy + 0.5) / SOUS_CASES];
        if (pointDansPolygone(pt, poly) && this.marquerSousCase(sx, sy)) nouvelles++;
      }
    }
    return nouvelles;
  }

  /** Marque la zone altérée de chaque vision. Rend le nombre de sous-cases nouvellement explorées. */
  marquerVisions(visions: readonly VisionJeton[]): number {
    let n = 0;
    for (const v of visions) n += this.marquerPolygone(v.alteree);
    return n;
  }

  /** OU avec une autre grille de même taille (fusion de deux clients). */
  fusionner(autre: GrilleExploration): GrilleExploration {
    if (autre.largeur !== this.largeur || autre.hauteur !== this.hauteur) throw new Error('Exploration : grilles de tailles différentes.');
    const bits = new Uint8Array(this.bits.length);
    for (let i = 0; i < bits.length; i++) bits[i] = (this.bits[i] as number) | (autre.bits[i] as number);
    return new GrilleExploration(this.largeur / SOUS_CASES, this.hauteur / SOUS_CASES, bits);
  }

  /** « Tout révéler » du MJ. */
  static pleine(colonnes: number, lignes: number): GrilleExploration {
    const g = new GrilleExploration(colonnes, lignes);
    for (let sy = 0; sy < g.hauteur; sy++) for (let sx = 0; sx < g.largeur; sx++) g.marquerSousCase(sx, sy);
    return g;
  }

  /** Texte base64 pour Firestore. */
  versTexte(): string {
    let binaire = '';
    for (const o of this.bits) binaire += String.fromCharCode(o);
    return btoa(binaire);
  }

  static depuisTexte(colonnes: number, lignes: number, texte: string): GrilleExploration {
    const binaire = atob(texte);
    const bits = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) bits[i] = binaire.charCodeAt(i);
    return new GrilleExploration(colonnes, lignes, bits);
  }
}

/** Ce qu'un client a vu localement : pour quelle scène, depuis quelle remise à zéro. */
export interface RepereExploration {
  scene: string;
  raz: number;
}

/**
 * Faut-il repartir d'une exploration locale vide ? Oui au changement de
 * scène, même si la nouvelle a les mêmes dimensions (bug v1 : deux scènes
 * de même taille gardaient le brouillard de la précédente), et quand le MJ
 * a remis l'exploration à zéro (le compteur explorationRaz a changé).
 */
export function explorationLocalePerimee(avant: RepereExploration | null, scene: string, raz: number): boolean {
  return avant === null || avant.scene !== scene || avant.raz !== raz;
}
