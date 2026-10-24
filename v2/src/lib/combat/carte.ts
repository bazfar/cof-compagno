import type { Combat, Combattant } from '../schemas/combat.ts';
import { deplacementRestant, type AvecId } from './ordre.ts';

/*
 * Le combat sur la carte (lot L6.1, décisions de Thomas du 23/10/2026) :
 *   - 8a : pendant un combat, un joueur ne déplace le jeton d'un
 *     combattant qu'à son tour ; le MJ déplace tout, sans compter ;
 *   - 7a : à son tour, le jeton du joueur a un budget de cases ;
 *   - 3b : les PV des monstres en chiffres, pour toute la table ;
 *   - le combattant qui joue, cerclé d'or.
 */

export interface CombatSurCarte {
  actif: string | null;
  /** Jetons qu'un joueur ne peut pas déplacer maintenant (les combattants qui ne jouent pas). */
  bloques: ReadonlySet<string>;
  /** Le jeton du joueur qui joue et ses cases restantes ; null pour le MJ ou hors de son tour. */
  budget: { id: string; cases: number } | null;
  /** PV des monstres, par jeton. */
  pvMonstres: ReadonlyMap<string, { actuel: number; max: number }>;
}

export const HORS_COMBAT: CombatSurCarte = { actif: null, bloques: new Set(), budget: null, pvMonstres: new Map() };

export function combatSurCarte(
  combat: Pick<Combat, 'statut' | 'actif' | 'tour' | 'scene'> | null,
  combattants: readonly AvecId<Combattant>[],
  sceneAffichee: string | null,
  role: 'mj' | 'joueur',
  uid: string,
): CombatSurCarte {
  if (!combat || combat.statut !== 'encours' || combat.scene !== sceneAffichee) return HORS_COMBAT;
  const pvMonstres = new Map(combattants.filter((c) => c.genre !== 'pj' && c.pv !== null && c.pvMax !== null).map((c) => [c.id, { actuel: c.pv!, max: c.pvMax! }]));
  if (role === 'mj') return { actif: combat.actif, bloques: new Set(), budget: null, pvMonstres };
  const bloques = new Set(combattants.filter((c) => c.id !== combat.actif).map((c) => c.id));
  const joue = combattants.find((c) => c.id === combat.actif && c.uid === uid);
  return { actif: combat.actif, bloques, budget: joue ? { id: joue.id, cases: deplacementRestant(joue, combat.tour) } : null, pvMonstres };
}
