import type { Butin, ChoixButin, VoteButin } from '../schemas/butin';

/*
 * Butin (lot L3.4) : qui l'emporte. Pur et testé ; les écritures sont dans
 * lib/actions/butin.ts.
 *
 * Besoin passe avant Envie ; parmi les votants du meilleur choix, le plus
 * haut d100 l'emporte. À égalité, les joueurs à égalité relancent (un d100
 * par tour) jusqu'à ce qu'un seul reste en tête.
 */

export type Issue =
  | { etat: 'gagnant'; uid: string; vote: VoteButin; rang: 'besoin' | 'envie' }
  | { etat: 'personne' }
  | { etat: 'egalite'; enLice: string[]; tour: number; manquants: string[]; rang: 'besoin' | 'envie' };

/** Le score d'un vote au tour `k` : le d100 du vote, puis les relances. */
function score(v: VoteButin, k: number): number | undefined {
  return k === 0 ? v.d100 : v.relances[k - 1];
}

export function issueDuVote(votes: Record<string, VoteButin>): Issue {
  const entrees = Object.entries(votes);
  const rang: 'besoin' | 'envie' | null = entrees.some(([, v]) => v.choix === 'besoin') ? 'besoin' : entrees.some(([, v]) => v.choix === 'envie') ? 'envie' : null;
  if (!rang) return { etat: 'personne' };
  let lice = entrees.filter(([, v]) => v.choix === rang).map(([uid]) => uid).sort();
  for (let k = 0; k <= 20; k++) {
    const manquants = lice.filter((uid) => score(votes[uid]!, k) === undefined);
    if (manquants.length) return { etat: 'egalite', enLice: lice, tour: k, manquants, rang };
    const max = Math.max(...lice.map((uid) => score(votes[uid]!, k)!));
    const tete = lice.filter((uid) => score(votes[uid]!, k) === max);
    if (tete.length === 1) return { etat: 'gagnant', uid: tete[0]!, vote: votes[tete[0]!]!, rang };
    lice = tete;
  }
  // Vingt relances à égalité : on n'en demande pas plus (bornes des règles).
  return { etat: 'egalite', enLice: lice, tour: 21, manquants: lice, rang };
}

/** Ce que le joueur `uid` peut faire sur ce butin. */
export function gesteJoueur(b: Butin, uid: string): 'voter' | 'relancer' | 'attendre' | 'rien' {
  if (b.statut === 'vote') return 'voter';
  if (b.statut !== 'relance' || !b.enLice.includes(uid)) return 'rien';
  return (b.votes[uid]?.relances.length ?? 0) < b.tour ? 'relancer' : 'attendre';
}

export const LIBELLES_CHOIX: Record<ChoixButin, string> = { besoin: 'Besoin', envie: 'Envie', passe: 'Passe' };

/** « 87 », ou « 42 → 77 → 12 » avec les relances. */
export function texteDes(v: VoteButin): string {
  return [v.d100, ...v.relances].join(' → ');
}

/** Les votes, triés comme le classement : Besoin, Envie, Passe, puis le d100 et les relances. */
export function votesTries(votes: Record<string, VoteButin>): [string, VoteButin][] {
  const ordre: Record<ChoixButin, number> = { besoin: 0, envie: 1, passe: 2 };
  return Object.entries(votes).sort(([, a], [, b]) => {
    if (ordre[a.choix] !== ordre[b.choix]) return ordre[a.choix] - ordre[b.choix];
    const sa = [a.d100, ...a.relances];
    const sb = [b.d100, ...b.relances];
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const d = (sb[i] ?? 0) - (sa[i] ?? 0);
      if (d) return d;
    }
    return a.nom.localeCompare(b.nom, 'fr');
  });
}

/** Lance un d100 (1 à 100). */
export function lancerD100(alea: () => number = Math.random): number {
  return 1 + Math.floor(alea() * 100);
}

/** Identifiant d'un nouveau butin. */
export function nouvelIdButin(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
