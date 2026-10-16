import { COTE_PORTRAIT, LIMITE_PORTRAIT } from '../schemas/portrait.ts';

/*
 * Compression du portrait dans le navigateur (lot L2.3 ; v1 :
 * chargerPortrait, JPEG qualité 0,82, 256 px de côté au plus). Si l'image
 * dépasse encore la limite du document, la qualité baisse par paliers.
 */

/** Dimensions réduites pour que le plus grand côté tienne dans `cote`, proportions gardées, sans agrandir. */
export function dimensionsPortrait(largeur: number, hauteur: number, cote = COTE_PORTRAIT): { largeur: number; hauteur: number } {
  if (!(largeur > 0) || !(hauteur > 0)) throw new Error('Image vide.');
  const echelle = Math.min(1, cote / Math.max(largeur, hauteur));
  return { largeur: Math.max(1, Math.round(largeur * echelle)), hauteur: Math.max(1, Math.round(hauteur * echelle)) };
}

/** Qualités essayées, dans l'ordre (la première est celle de la v1). */
export const QUALITES_PORTRAIT = [0.82, 0.7, 0.55, 0.4] as const;

/** Image choisie par le joueur → data URL JPEG sous LIMITE_PORTRAIT. */
export async function comprimerPortrait(img: HTMLImageElement): Promise<string> {
  const { largeur, hauteur } = dimensionsPortrait(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, largeur, hauteur);
  for (const q of QUALITES_PORTRAIT) {
    const image = canvas.toDataURL('image/jpeg', q);
    if (image.length <= LIMITE_PORTRAIT) return image;
  }
  throw new Error('Image trop lourde, même compressée : essaie une image plus simple.');
}
