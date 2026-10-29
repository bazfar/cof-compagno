import type { Combattant } from '../schemas/combat.ts';

/*
 * Les résistances légendaires d'un boss (lot L6.6a, décision 7a de Thomas
 * du 28/10/2026) : `legendaire` sur son combattant, recopié du bestiaire
 * au démarrage ; `usages.legendaire`, celles qui ont servi. À part de
 * lib/combat/monstres.ts : la visée des sorts (sorts.ts) les lit.
 */

/** La clé de `usages` des résistances légendaires qui ont servi. */
export const USAGE_LEGENDAIRE = 'legendaire';

/** Celles qui lui restent. */
export function legendairesRestantes(c: Pick<Combattant, 'legendaire' | 'usages'>): number {
  return Math.max(0, (c.legendaire ?? 0) - (c.usages[USAGE_LEGENDAIRE] ?? 0));
}

/** Par cible, les résistances légendaires qui ont servi dans les jets du moteur. */
export function legendairesServies(jets: readonly { cible?: string; legendaire?: true }[]): Map<string, number> {
  const r = new Map<string, number>();
  for (const j of jets) if (j.legendaire && j.cible) r.set(j.cible, (r.get(j.cible) ?? 0) + 1);
  return r;
}
