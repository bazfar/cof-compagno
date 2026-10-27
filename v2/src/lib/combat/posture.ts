import type { AxePosture } from '../effets/resolution.ts';
import type { BonusCombat } from '../schemas/combat.ts';

/*
 * La posture du Guerrier en combat (lot L6.5a, décision 3a de Thomas du
 * 26/10/2026) : un état durable sur son combattant, un axe en bonus, un
 * autre en malus, jusqu'à son rang (doublé sous Maîtrise tactique, que le
 * moteur vérifie). Elle compte dans tous ses jets jusqu'à ce qu'il en
 * change : ce sont deux bonus sans durée, marqués « posture », qu'une
 * nouvelle posture remplace.
 */

export interface Posture {
  plus: AxePosture;
  moins: AxePosture;
  valeur: number;
}

/** L'usage du combat d'une combinaison dont le second élément n'est pas Maître (L6.5a, 4a). */
export const USAGE_COMBINAISON = 'combinaison';

const NOMS_AXES: Readonly<Record<AxePosture, string>> = { attaque: 'attaque', DEF: 'DEF', degats: 'dégâts' };

/** La nouvelle posture remplace l'ancienne ; les autres bonus restent. */
export function poserPosture(bonus: readonly BonusCombat[], p: Posture): BonusCombat[] {
  const autres = bonus.filter((b) => !b.posture);
  const de = (sur: AxePosture, valeur: number): BonusCombat => ({ sur, valeur, rounds: null, consomme: false, typeDegats: null, source: 'Posture', posture: true });
  return [...autres, de(p.plus, p.valeur), de(p.moins, -p.valeur)].slice(-20);
}

/** La posture en cours, lue sur ses bonus ; null sans posture. */
export function postureDe(bonus: readonly BonusCombat[]): Posture | null {
  const plus = bonus.find((b) => b.posture && typeof b.valeur === 'number' && b.valeur > 0);
  const moins = bonus.find((b) => b.posture && typeof b.valeur === 'number' && b.valeur < 0);
  if (!plus || !moins) return null;
  return { plus: plus.sur as AxePosture, moins: moins.sur as AxePosture, valeur: plus.valeur as number };
}

/** « Posture : +2 attaque, −2 DEF » */
export function textePosture(p: Posture): string {
  return `Posture : +${p.valeur} ${NOMS_AXES[p.plus]}, −${p.valeur} ${NOMS_AXES[p.moins]}`;
}
