import type { Fiche } from '../schemas/fiche.ts';

/*
 * Barre de progression du niveau (lot L2.5 ; cadrage « Rencontres, PNJ et
 * Vécu », progression.json). Pas d'XP calculée : le MJ donne des crans
 * (décision 2.0 : jalons donnés par le MJ), et une barre pleine ouvre la
 * montée de niveau.
 *
 * Crans pour atteindre un niveau : 3 pour les niveaux 2 à 4, 4 pour 5 à 7,
 * 5 pour 8 à 10, 6 pour 11 et 12 ; plafond au niveau 12. Un cran retiré
 * (critique, à la discrétion du MJ) ne fait jamais redescendre sous zéro :
 * un niveau acquis n'est jamais perdu. Le Vécu (sa barre, son arbre)
 * arrive avec les rencontres, en 2.1.
 */

export const NIVEAU_PLAFOND = 12;

/** Crans à réunir pour passer du niveau `niveau` au suivant ; null au plafond. */
export function cransRequis(niveau: number): number | null {
  const cible = niveau + 1;
  if (cible > NIVEAU_PLAFOND || cible < 2) return null;
  if (cible <= 4) return 3;
  if (cible <= 7) return 4;
  if (cible <= 10) return 5;
  return 6;
}

/** Nouveau compte de crans après un cran donné (+1) ou retiré (−1), jamais sous zéro. */
export function ajouterCran(crans: number, delta: 1 | -1): number {
  return Math.max(0, crans + delta);
}

export interface Barre {
  crans: number;
  requis: number | null;
  pleine: boolean;
  /** Part remplie, entre 0 et 1 (1 au plafond). */
  part: number;
}

export function barreNiveau(f: Pick<Fiche, 'niveau' | 'progression'>): Barre {
  const requis = cransRequis(f.niveau);
  const crans = f.progression.crans;
  if (requis === null) return { crans, requis, pleine: false, part: 1 };
  return { crans, requis, pleine: crans >= requis, part: Math.min(1, crans / requis) };
}
