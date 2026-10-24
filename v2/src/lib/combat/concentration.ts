import type { Changement } from '../effets/resolution.ts';
import type { Combattant, Concentration } from '../schemas/combat.ts';
import type { Action } from '../schemas/effets.ts';
import { dureeEnRounds } from './bonus.ts';
import { retirerEtat } from './etats.ts';

/*
 * La concentration en combat (lot L6.4b2, décisions de Thomas du
 * 24/10/2026), en fonctions pures. lib/actions/invocations.ts l'écrit.
 *   - 1a : ce que disent les données la rompt : une nouvelle concentration
 *     met fin à l'ancienne (autreConcentration) ; une attaque résolue contre
 *     sa cible (cibleAttaquee, Fascination) ; « lanceur surpris » : le MJ,
 *     d'un bouton. Le joueur y met fin lui-même, d'un bouton de sa barre ;
 *   - 1a (ajout de Thomas) : une attaque qui touche un PJ concentré lui
 *     fait faire un jet pour la maintenir : une sauvegarde de CON, DD 10 ou
 *     la moitié des dégâts si c'est plus ;
 *   - 2a : le maintien se paie au début du tour du lanceur ; sans de quoi
 *     payer, elle s'arrête ;
 *   - 3a : quand elle s'arrête, tout ce que ce lancer a posé s'en va : ses
 *     états, sa zone au sol, ses invocations ;
 *   - ses rounds se décomptent à la fin du tour du lanceur, comme ceux de
 *     ses zones (9a de L6.4b1).
 */

type AvecId<T> = T & { id: string };

/** La concentration d'un lancer réussi, ou null si le sort ne se maintient pas. */
export function concentrationDuLancer(
  a: Pick<Action, 'id' | 'nom' | 'persistance'>,
  lancer: string,
  changements: readonly Changement[],
  zone: string | null,
  invocations: readonly string[],
): Concentration | null {
  const p = a.persistance;
  if (p.type !== 'concentration') return null;
  const etats = changements.flatMap((c) => (c.type === 'etat' ? [{ cible: c.cible, etat: c.etat }] : []));
  return {
    action: a.id,
    nom: a.nom.slice(0, 60),
    lancer,
    maintien: p.maintien ?? 0,
    rupture: [...p.rupture],
    rounds: p.duree === undefined ? null : dureeEnRounds(p.duree),
    etats: etats.slice(0, 20),
    zone,
    invocations: invocations.slice(0, 10),
  };
}

/** 3a : ce qui s'en va avec la concentration : les états retirés de leurs cibles, la zone, les invocations. */
export function finDeConcentration(
  conc: Concentration,
  combattants: readonly AvecId<Combattant>[],
): { etats: Map<string, Combattant['etats']>; zone: string | null; invocations: string[] } {
  const etats = new Map<string, Combattant['etats']>();
  for (const p of conc.etats) {
    const c = combattants.find((x) => x.id === p.cible);
    if (!c) continue;
    const avant = etats.get(c.id) ?? c.etats;
    const apres = retirerEtat(avant, p.etat);
    if (apres.length !== avant.length) etats.set(c.id, apres);
  }
  return { etats, zone: conc.zone, invocations: conc.invocations.filter((id) => combattants.some((c) => c.id === id)) };
}

/** 1a : les concentrations qu'une attaque contre cette cible rompt (Fascination). */
export function rompuesParAttaque(combattants: readonly AvecId<Combattant>[], cible: string): AvecId<Combattant>[] {
  return combattants.filter((c) => c.concentration?.rupture.includes('cibleAttaquee') && c.concentration.etats.some((e) => e.cible === cible));
}

/** 1a (ajout de Thomas) : le DD du jet pour maintenir sa concentration quand une attaque le touche. */
export function ddConcentration(degats: number): number {
  return Math.max(10, Math.floor(degats / 2));
}

/** À la fin du tour du lanceur : un round de moins ; à 0, elle s'arrête (`fin`). Sans durée, elle reste. */
export function finDeTourConcentration(conc: Concentration): { rounds: number } | 'fin' | null {
  if (conc.rounds === null) return null;
  return conc.rounds > 1 ? { rounds: conc.rounds - 1 } : 'fin';
}

/** « Fascination (2) » : le nom et les rounds qui restent. */
export function texteConcentration(c: Concentration): string {
  return `${c.nom}${c.rounds !== null ? ` (${c.rounds})` : ''}${c.maintien ? ` · ${c.maintien} PP par round` : ''}`;
}
