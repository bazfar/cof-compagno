import type { Combattant } from '../schemas/combat.ts';

/*
 * L'ordre et le tour d'un combat (lot L6.1, décisions de Thomas du
 * 23/10/2026). Fonctions pures : lib/actions/combat.ts les applique, les
 * écrans les affichent.
 *   - 5a : initiative = d20 + modificateur ; égalité : le PJ avant le
 *     monstre, puis le meilleur modificateur. Qui n'a pas encore lancé
 *     attend en bas de l'ordre, et prend sa place dès qu'il lance.
 *   - 6a : la main passe au suivant qui a une initiative et n'est pas à
 *     terre ; revenir en tête ouvre un nouveau round.
 *   - 7a : 5 cases de déplacement par tour (+1 avec le don Mobile) ; le
 *     Sprint donne +2 cases et prend l'action principale.
 */

export type AvecId<T> = T & { id: string };

/** Déplacement de base d'un tour (v1 : DEPLACEMENT_BASE). */
export const DEPLACEMENT_BASE = 5;
/** Cases que donne le Sprint (v1 : SPRINT_BONUS). */
export const BONUS_SPRINT = 2;
/** Dons qui ajoutent une case (v1 : don Mobile). Les capacités de voie viendront avec L6.5. */
const DONS_MOBILITE: Record<string, number> = { mobile: 1 };

export function deplacementDeBase(dons: readonly string[]): number {
  return DEPLACEMENT_BASE + dons.reduce((t, d) => t + (DONS_MOBILITE[d] ?? 0), 0);
}

/** L'ordre d'initiative : initiative décroissante, le PJ avant le monstre, puis le modificateur, puis le nom ; sans initiative en bas. */
export function ordreCombat<T extends Pick<Combattant, 'genre' | 'nom' | 'initiative' | 'modInit'>>(combattants: readonly T[]): T[] {
  return [...combattants].sort((a, b) => {
    if (a.initiative === null || b.initiative === null) return a.initiative === b.initiative ? a.nom.localeCompare(b.nom, 'fr') : a.initiative === null ? 1 : -1;
    if (a.initiative !== b.initiative) return b.initiative - a.initiative;
    if (a.genre !== b.genre) return a.genre === 'pj' ? -1 : 1;
    if (a.modInit !== b.modInit) return b.modInit - a.modInit;
    return a.nom.localeCompare(b.nom, 'fr');
  });
}

/** Peut jouer : une initiative, et pas à terre (`aTerre` : monstre à 0 PV, PJ mort ; L6.2). */
const peutJouer = (c: AvecId<Pick<Combattant, 'initiative'>>, aTerre: ReadonlySet<string>) => c.initiative !== null && !aTerre.has(c.id);

/** Le premier à jouer, ou null si personne n'a encore d'initiative. */
export function premierActif<T extends AvecId<Pick<Combattant, 'genre' | 'nom' | 'initiative' | 'modInit'>>>(combattants: readonly T[], aTerre: ReadonlySet<string> = new Set()): string | null {
  return ordreCombat(combattants).find((c) => peutJouer(c, aTerre))?.id ?? null;
}

/**
 * La main suivante (6a) : le prochain dans l'ordre qui peut jouer. Repartir
 * de la tête ouvre un nouveau round. Personne ne peut jouer : la main reste.
 */
export function mainSuivante<T extends AvecId<Pick<Combattant, 'genre' | 'nom' | 'initiative' | 'modInit'>>>(
  combattants: readonly T[],
  actif: string | null,
  round: number,
  aTerre: ReadonlySet<string> = new Set(),
): { actif: string | null; round: number } {
  const ordre = ordreCombat(combattants);
  const depart = actif === null ? -1 : ordre.findIndex((c) => c.id === actif);
  if (actif === null || depart < 0) return { actif: premierActif(ordre, aTerre), round };
  for (let pas = 1; pas <= ordre.length; pas++) {
    const i = (depart + pas) % ordre.length;
    if (peutJouer(ordre[i]!, aTerre)) return { actif: ordre[i]!.id, round: depart + pas >= ordre.length ? round + 1 : round };
  }
  return { actif, round };
}

/** Les actions de ce combattant pour le tour en cours : celles d'un autre tour comptent comme neuves (7a). */
export function actionsDuTour(c: Pick<Combattant, 'tourActions' | 'principale' | 'secondaire' | 'mvt' | 'sprint'>, tour: number): Pick<Combattant, 'principale' | 'secondaire' | 'mvt' | 'sprint'> {
  return c.tourActions === tour ? { principale: c.principale, secondaire: c.secondaire, mvt: c.mvt, sprint: c.sprint } : { principale: false, secondaire: false, mvt: 0, sprint: false };
}

/** Cases qui restent ce tour : la base, le Sprint, moins ce qui est parcouru. */
export function deplacementRestant(c: Pick<Combattant, 'mvtBase' | 'tourActions' | 'principale' | 'secondaire' | 'mvt' | 'sprint'>, tour: number): number {
  const a = actionsDuTour(c, tour);
  return Math.max(0, c.mvtBase + (a.sprint ? BONUS_SPRINT : 0) - a.mvt);
}

/** Initiative d'un d20 et d'un modificateur, et son détail pour l'affichage (v1 : _detailJet). */
export function detailInitiative(de: number, mod: number): string {
  return `d20 ${de} ${mod >= 0 ? '+' : '−'} ${Math.abs(mod)}`;
}

/**
 * Ceux dont le tour est sauté (6a) : les monstres à 0 PV, les PJ morts.
 * Lot L6.2 (7a) : un PJ à 0 PV est Mourant et garde son tour, pour ses jets
 * de mort ; seul le troisième échec le sort de l'ordre (v1 : _estKO).
 */
export function aTerreDuCombat(combattants: readonly AvecId<Pick<Combattant, 'genre' | 'aTerre' | 'mort'>>[]): Set<string> {
  return new Set(combattants.filter((c) => (c.genre === 'monstre' ? c.aTerre : c.mort)).map((c) => c.id));
}
