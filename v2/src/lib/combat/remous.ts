import { COEFFICIENTS_RACE, MEMBRANES, ORDRE_MEMBRANES, PALIERS_REMOUS, SEUILS_REMOUS, type Membrane, type PalierRemous } from '../../regles/remous.ts';
import type { Changement } from '../effets/resolution.ts';
import type { Remous } from '../schemas/remous.ts';

/** Les membranes, pour l'écran (qui ne lit pas src/regles). */
export { MEMBRANES, ORDRE_MEMBRANES, type Membrane };

/*
 * Le Remous du lieu (lot L6.7b, décisions de Thomas du 29/10/2026), en
 * fonctions pures ; lib/actions/remous.ts l'écrit.
 *   - 5a : une jauge par scène ;
 *   - 6a, 7a : ce qu'un sort y verse : les PP réellement payés × le
 *     coefficient de la race, à l'inférieur ; sa Plongée, point pour point ;
 *   - 8a : les effets du palier : sorts moins chers et plus forts, PP max,
 *     Déchirure ;
 *   - 10a : la Traque : celui qui l'a le plus nourrie.
 */

/** Les seuils cumulés de la membrane (ils se divisent tous juste : 48 est multiple de 2, 3 et 4). */
export function seuilsDe(membrane: Membrane): number[] {
  return SEUILS_REMOUS.map((s) => s / MEMBRANES[membrane].diviseur);
}

/** Le palier atteint ; sans jauge, Stable. */
export function palierDe(r: Pick<Remous, 'total' | 'membrane'> | null): PalierRemous {
  if (!r) return PALIERS_REMOUS[0]!;
  const n = seuilsDe(r.membrane).filter((s) => r.total >= s).length;
  return PALIERS_REMOUS[n]!;
}

/** Le prochain seuil ; null : la Plaie atteinte. */
export function prochainSeuil(r: Pick<Remous, 'total' | 'membrane'>): number | null {
  return seuilsDe(r.membrane).find((s) => r.total < s) ?? null;
}

/** 6a, 7a : ce qu'un sort verse : PP payés × coefficient de race, à l'inférieur, et la Plongée gagnée. */
export function verseParLeSort(race: string, ppPayes: number, plongee: number): number {
  return Math.floor(Math.max(0, ppPayes) * (COEFFICIENTS_RACE[race] ?? 0)) + Math.max(0, plongee);
}

/** La Plongée que le lancer fait gagner au lanceur (Voies du chaos). */
export function plongeeGagnee(changements: readonly Changement[], lanceur: string): number {
  return changements.reduce((s, c) => (c.type === 'ressource' && c.cible === lanceur && c.ressource === 'plongee' && typeof c.montant === 'number' && c.montant > 0 ? s + c.montant : s), 0);
}

/** 8a : le coût d'un sort au palier : moins N PP, jamais sous 0 ; un sort gratuit le reste. */
export function coutAuPalier(pp: number, p: PalierRemous): number {
  return Math.max(0, pp - p.coutSorts);
}

/** 8a : les dégâts d'un sort au palier : +N à chaque cible qu'il blesse (le journal du lanceur le dit). */
export function degatsAuPalier(changements: readonly Changement[], p: PalierRemous): Changement[] {
  return changements.map((c) => (c.type === 'degats' && c.montant > 0 ? { ...c, montant: c.montant + p.degatsSorts } : c));
}

/** 10a : la Traque : le personnage qui a le plus nourri la jauge (pas le MJ) ; null : personne. */
export function remueur(r: Pick<Remous, 'contributions'> | null): string | null {
  let qui: string | null = null;
  let max = 0;
  for (const [k, n] of Object.entries(r?.contributions ?? {})) {
    if (k !== 'mj' && n > max) {
      qui = k;
      max = n;
    }
  }
  return qui;
}
