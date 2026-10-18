/*
 * Marque « nouveau » du lore côté joueur (lot L2.7b). Ce que chaque joueur
 * a déjà vu est gardé dans son navigateur : c'est un confort de lecture,
 * pas une donnée de jeu, et cela évite d'ouvrir une écriture de plus dans
 * les règles Firestore. Sur un autre appareil, rien n'est marqué nouveau
 * au premier passage (voir `nouveautes`).
 */

/** Pour chaque fiche, la date de révélation que le joueur a déjà vue. */
export type Vus = Record<string, number>;

/**
 * Fiches nouvelles pour ce joueur : révélées après ce qu'il en a vu, ou
 * jamais vues. Au tout premier passage (`vus` absent), rien n'est nouveau :
 * tout le lore importé n'a pas à clignoter d'un coup.
 */
export function nouveautes(fiches: { id: string; reveleLe: number }[], vus: Vus | null): Set<string> {
  if (vus === null) return new Set();
  return new Set(fiches.filter((f) => (vus[f.id] ?? -1) < f.reveleLe).map((f) => f.id));
}

/** Toutes les fiches comptées comme vues, à leur date de révélation actuelle. */
export function toutVu(fiches: { id: string; reveleLe: number }[], vus: Vus | null): Vus {
  return { ...(vus ?? {}), ...Object.fromEntries(fiches.map((f) => [f.id, f.reveleLe])) };
}

const cle = (table: string, uid: string) => `cof-compagno:lore-vu:${table}:${uid}`;

/** Lit ce que le joueur a vu ; null s'il n'est jamais venu (ou si le navigateur refuse le stockage). */
export function lireVus(table: string, uid: string): Vus | null {
  try {
    const brut = localStorage.getItem(cle(table, uid));
    if (!brut) return null;
    const v: unknown = JSON.parse(brut);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Vus) : null;
  } catch {
    return null;
  }
}

export function ecrireVus(table: string, uid: string, vus: Vus): void {
  try {
    localStorage.setItem(cle(table, uid), JSON.stringify(vus));
  } catch {
    // Stockage refusé (navigation privée…) : la marque « nouveau » ne survit pas au rechargement, rien de plus.
  }
}

/** Recherche sans tenir compte des majuscules ni des accents. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
