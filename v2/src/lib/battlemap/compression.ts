import { essaiSuivant, LIMITE_IMAGE, premierEssai, type Grille } from './import-image.ts';

/*
 * Compression d'une image de scène dans le navigateur (lot L5.5). L'image
 * est recadrée à la grille (colonnes × lignes cases), puis encodée en WebP
 * (en JPEG si le navigateur ne sait pas faire de WebP) jusqu'à tenir sous
 * LIMITE_IMAGE. Les paliers sont dans import-image.ts (testés).
 */

/** Lit un fichier image choisi par le MJ. */
export function lireImage(fichier: File): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resoudre(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("Ce fichier n'est pas une image lisible."));
    };
    img.src = url;
  });
}

/** Image compressée (data URL) et pixels par case retenus. */
export async function comprimerImage(img: HTMLImageElement, grille: Grille, pxParCaseSource: number): Promise<{ image: string; pxParCase: number }> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  const formatTeste = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  let essai: ReturnType<typeof essaiSuivant> = premierEssai(pxParCaseSource);
  while (essai) {
    canvas.width = grille.colonnes * essai.pxParCase;
    canvas.height = grille.lignes * essai.pxParCase;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL(formatTeste, essai.qualite);
    if (image.length <= LIMITE_IMAGE) return { image, pxParCase: essai.pxParCase };
    essai = essaiSuivant(essai);
  }
  throw new Error("Image trop lourde : même réduite à 16 pixels par case, elle dépasse la limite. Essaie avec moins de cases ou une image plus simple.");
}
