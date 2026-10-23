import type { Combattant } from '../schemas/combat.ts';

/*
 * Mourant (lot L6.2, décision 7a de Thomas du 23/10/2026 ; v1 : règle
 * « Mort et stabilisation », App.jetDeMort) :
 *   - un PJ à 0 PV est Mourant : il garde son tour, mais n'y fait que son
 *     jet de mort (un d20, 11 ou plus : réussite) ;
 *   - 3 réussites : il se relève à 1 PV ; 3 échecs : il meurt. Il lance
 *     donc 5 jets au plus ;
 *   - un allié le relève (action principale), ou tout soin : ses jets
 *     repartent de zéro.
 */

export const SEUIL_JET_DE_MORT = 11;
export const JETS_POUR_ISSUE = 3;
/** 3 réussites ou 3 échecs arrivent au plus tard au 5ᵉ jet. */
export const JETS_DE_MORT_MAX = 2 * JETS_POUR_ISSUE - 1;

export type EtatPj = 'debout' | 'mourant' | 'mort';

export function etatPj(pvActuel: number, c: Pick<Combattant, 'mort'>): EtatPj {
  if (c.mort) return 'mort';
  return pvActuel <= 0 ? 'mourant' : 'debout';
}

export interface IssueJetDeMort {
  de: number;
  reussi: boolean;
  /** Compteurs après ce jet : remis à zéro quand il se relève. */
  mortSucces: number;
  mortEchecs: number;
  mort: boolean;
  issue: 'releve' | 'mort' | null;
}

export function jetDeMort(de: number, avant: Pick<Combattant, 'mortSucces' | 'mortEchecs'>): IssueJetDeMort {
  const reussi = de >= SEUIL_JET_DE_MORT;
  const succes = avant.mortSucces + (reussi ? 1 : 0);
  const echecs = avant.mortEchecs + (reussi ? 0 : 1);
  if (succes >= JETS_POUR_ISSUE) return { de, reussi, mortSucces: 0, mortEchecs: 0, mort: false, issue: 'releve' };
  if (echecs >= JETS_POUR_ISSUE) return { de, reussi, mortSucces: succes, mortEchecs: JETS_POUR_ISSUE, mort: true, issue: 'mort' };
  return { de, reussi, mortSucces: succes, mortEchecs: echecs, mort: false, issue: null };
}

/** « d20 14 : réussite (2/3 réussites, 1/3 échecs) », ou l'issue. */
export function texteJetDeMort(i: IssueJetDeMort, nom: string): string {
  const base = `d20 ${i.de} : ${i.reussi ? 'réussite' : 'échec'}`;
  if (i.issue === 'releve') return `${base}. ${nom} se relève à 1 PV.`;
  if (i.issue === 'mort') return `${base}. ${nom} succombe.`;
  return `${base} (${i.mortSucces}/3 réussites, ${i.mortEchecs}/3 échecs)`;
}

/** Jets de mort à remettre à zéro : le PJ n'est plus à 0 PV (soin, allié qui le relève). Le MJ les remet (un mort a ses trois échecs). */
export function jetsDeMortARemettre(c: Pick<Combattant, 'genre' | 'mortSucces' | 'mortEchecs'>, pvActuel: number | undefined): boolean {
  return c.genre === 'pj' && pvActuel !== undefined && pvActuel > 0 && (c.mortSucces > 0 || c.mortEchecs > 0);
}
