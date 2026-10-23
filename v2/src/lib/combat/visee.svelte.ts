import type { Case } from '../battlemap/geometrie';

/*
 * La visée sur la carte (lot L6.4a, décision 6a de Thomas du 23/10/2026) :
 * la barre du joueur l'ouvre quand un sort demande une cible ou une case ;
 * la carte montre, au survol, les cases de la zone et les jetons qu'elle
 * prend, et rend le clic à la barre au lieu de sélectionner ou de glisser
 * un jeton. Un seul état partagé, sans Firestore.
 */

export interface ViseeCarte {
  /** Ce que la visée prendrait si on cliquait cette case. */
  apercu: (survol: Case) => { cases: readonly Case[]; jetons: readonly string[]; refus: string | null };
  /** Le clic : la case, et le jeton qui l'occupe s'il y en a un. */
  choisir: (c: Case, jeton: string | null) => void;
  /** Ce qui est déjà choisi, montré sans survol. */
  fixe: { cases: readonly Case[]; jetons: readonly string[] };
}

export const viseeCarte = $state<{ v: ViseeCarte | null }>({ v: null });
