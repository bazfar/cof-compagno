/*
 * Jauges du chaos (lot L4.9). Source : doc « Refonte classes et magie —
 * cadre », « Voies du chaos (validé pour l'instant, à revoir à l'usage) ».
 *
 *   - Plongée : jauge de combat, remise à 0 en fin de combat ; chaque
 *     capacité de chaos y ajoute des points (R1 +1, R2 +1, R3 +2, R5 +3) ;
 *     chaque point ajoute aussi 1 PP au Remous du lieu, multiplié par le
 *     coefficient de race (appliqué par le combat, L6) ;
 *   - Corruption d'Âme : permanente ; +1 chaque fois que la Plongée dépasse
 *     un multiple de 6 dans un combat (décision 1b du 21/10/2026 : le cadre
 *     disait « la première fois », ce qui rendait gratuit tout le chaos
 *     au-delà de 6) ; +1 directe à chaque Avatar (R5, décision 3b) ;
 *   - mutations aux paliers 1, 4 et 7 de Corruption d'Âme, Rupture à 10
 *     (règles v1 conservées ; table v1 : src/donnees/mutations.json).
 */

export const TRANCHE_DE_PLONGEE = 6;
export const PALIERS_DE_MUTATION = [1, 4, 7] as const;
export const RUPTURE = 10;

/** Points de Corruption d'Âme gagnés quand la Plongée passe de `avant` à `apres` : un par multiple de 6 dépassé. */
export function corruptionParLaPlongee(avant: number, apres: number): number {
  if (apres <= avant) return 0;
  const premier = Math.max(1, Math.ceil(avant / TRANCHE_DE_PLONGEE));
  const dernier = Math.ceil(apres / TRANCHE_DE_PLONGEE) - 1;
  return Math.max(0, dernier - premier + 1);
}

/** Paliers de mutation franchis quand la Corruption d'Âme passe de `avant` à `apres` (1, 4, 7), et la Rupture (10). */
export function seuilsFranchis(avant: number, apres: number): { mutations: number[]; rupture: boolean } {
  return {
    mutations: PALIERS_DE_MUTATION.filter((p) => avant < p && apres >= p).map((p) => PALIERS_DE_MUTATION.indexOf(p) + 1),
    rupture: avant < RUPTURE && apres >= RUPTURE,
  };
}
