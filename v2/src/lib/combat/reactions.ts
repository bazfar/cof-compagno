import { actionParId } from '../../regles/index.ts';
import { distanceCases, type Case, type JetonCarte } from '../battlemap/geometrie.ts';
import type { AxePosture } from '../effets/resolution.ts';
import { vueFiche } from '../fiche/vue-fiche.ts';
import type { Combattant } from '../schemas/combat.ts';
import type { Fiche, FicheV2 } from '../schemas/fiche.ts';
import { peutAgir } from './etats.ts';
import { etatPj } from './mort.ts';
import { besoinsDuLancer, plafondPosture } from './options-lancer.ts';
import { campDe } from './ordre.ts';
import { ciblageDe, OPPORTUNITE, reactionsDeCombat, type CiblageSort, type SortDeCombat } from './sorts.ts';

/*
 * Les réactions en combat (lot L6.5b, décisions de Thomas du 26/10/2026),
 * en fonctions pures. lib/actions/reactions.ts les écrit.
 *   - 6a : le joueur les joue depuis sa barre, hors de son tour ; avant
 *     l'attaque d'un monstre, le panneau du MJ rappelle celles de la cible
 *     et de ses alliés ;
 *   - 7a : une réaction par round et par créature, rendue au début de son
 *     tour ; les limites des données (1× par round, par combat) en plus ;
 *   - 8a, 9a : le moteur joue ce qu'il sait, le coût se paie à l'usage ;
 *   - 10a, 2b, 3b : quitter le contact d'un ennemi, case après case le long
 *     du chemin, ouvre son attaque d'opportunité ; elle prend sa réaction ;
 *   - 4 : le déplacement va au bout ; l'attaque part quand même ;
 *   - 11a : un monstre n'a que l'attaque d'opportunité ;
 *   - 6b : un bond (Esquive acrobatique, Repli) se pose sur la case que le
 *     joueur choisit ;
 *   - 7a : Riposte et Tir de couverture se proposent contre un ennemi à
 *     portée : le joueur juge du déclencheur ;
 *   - 8a : un sort-réaction part au plus haut palier atteint, sans options.
 */

/** La clé de `usages` : le tour où il a réagi. */
export const USAGE_REACTION = 'reaction';

export { OPPORTUNITE };

type AvecId<T> = T & { id: string };

/** 7a : une réaction par round, rendue au début de son tour (`debutTour`). */
export function reactionDisponible(c: Pick<Combattant, 'usages' | 'debutTour'>): boolean {
  const u = c.usages[USAGE_REACTION];
  return u === undefined || u < c.debutTour;
}

/**
 * 2b, 3b : les ennemis dont il quitte le contact, case après case, le long
 * de son chemin (départ compris) : chacun peut l'attaquer d'opportunité.
 * Seuls ceux qui le peuvent : debout, qui agissent, leur réaction libre ;
 * pas une invocation (11a).
 */
export function opportunitesDuChemin(
  qui: string,
  chemin: readonly Case[],
  jetons: readonly JetonCarte[],
  combattants: readonly AvecId<Combattant>[],
): { attaquant: string; case: Case }[] {
  const moi = combattants.find((c) => c.id === qui);
  if (!moi) return [];
  return combattants
    .filter((c) => campDe(c) !== campDe(moi) && c.genre !== 'invocation' && !c.aTerre && !c.mort && reactionDisponible(c) && peutAgir(c.etats) === 'oui')
    .flatMap((c) => {
      const j = jetons.find((x) => x.id === c.id && !x.mort);
      if (!j) return [];
      // La dernière case encore au contact : c'est là que le coup part.
      const i = chemin.findIndex((k, n) => n + 1 < chemin.length && distanceCases(k, j) <= 1 && distanceCases(chemin[n + 1]!, j) > 1);
      // `chemin[0]` est le jeton de départ, pas une case nue : on n'en garde
      // que les coordonnées, sinon le document porterait tout le jeton.
      return i < 0 ? [] : [{ attaquant: c.id, case: { cx: chemin[i]!.cx, cy: chemin[i]!.cy } }];
    });
}

/** Identifiant d'une opportunité : un tour, un attaquant, celui qui bouge. */
export const idOpportunite = (tour: number, attaquant: string, cible: string) => `t${tour}-${attaquant}-${cible}`;

/** Ce que la réaction demande au joueur. */
export interface BesoinsReaction {
  /** Une créature à viser, et de quel camp. */
  cible: CiblageSort['camp'] | null;
  /** 6b : un bond, en cases. */
  bond: number | null;
  posture: { axes: AxePosture[]; plafond: number } | null;
}

/** Ce que la réaction demande : sa cible, son bond, sa posture. */
export function besoinsReaction(f: FicheV2, moi: Pick<Combattant, 'etats'>, s: SortDeCombat): BesoinsReaction {
  const a = actionParId.get(s.id);
  const palier = s.paliers.at(-1) ?? 'I';
  const c = ciblageDe(s.id, palier);
  // Les déplacements des réactions sont tous ceux du lanceur (Esquive acrobatique, Repli).
  const bond = a?.effets.find((e) => e.type === 'deplacement');
  const b = besoinsDuLancer(f, s, palier, null, null);
  return {
    cible: c?.type === 'creature' ? c.camp : null,
    bond: bond?.type === 'deplacement' ? bond.cases : null,
    posture: b.posture ? { axes: b.posture.axes, plafond: plafondPosture(b, moi) } : null,
  };
}

/** Les réactions que sa barre propose (6a) : toutes, sauf l'opportunité, qui attend son signal (10a). */
export function reactionsProposees(f: Fiche): SortDeCombat[] {
  return reactionsDeCombat(f).filter((s) => s.id !== OPPORTUNITE);
}

/** Les déclencheurs que le panneau du MJ rappelle avant l'attaque d'un monstre (6a) : ceux de la cible, ceux d'un allié. */
const POUR_LA_CIBLE: readonly string[] = ['attaqueVisee', 'attaqueSubie', 'attaqueRatee', 'aToutMoment'];
const POUR_UN_ALLIE: readonly string[] = ['allieCible', 'allieAttaqueAuContact', 'allieTombe'];

/**
 * 6a : avant qu'un monstre attaque `cible`, les réactions que la cible et
 * ses alliés peuvent encore jouer (réaction du round libre, debout, qui
 * agissent) : par combattant, leurs noms.
 */
export function rappelAvantAttaque(cible: string, combattants: readonly AvecId<Combattant>[], fiches: ReadonlyMap<string, Fiche>): { qui: string; nom: string; reactions: string[] }[] {
  return combattants.flatMap((c) => {
    const f = c.perso ? fiches.get(c.perso) : undefined;
    // Seul un PJ a une fiche.
    if (!f || etatPj(vueFiche(f).pv.actuel, c) !== 'debout' || !reactionDisponible(c) || peutAgir(c.etats) !== 'oui') return [];
    const quand = c.id === cible ? POUR_LA_CIBLE : POUR_UN_ALLIE;
    const r = reactionsProposees(f).filter((s) => quand.includes(actionParId.get(s.id)?.declencheur ?? ''));
    return r.length ? [{ qui: c.id, nom: c.nom, reactions: r.map((s) => s.nom) }] : [];
  });
}
