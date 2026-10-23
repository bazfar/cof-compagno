import { persoDuJeton } from '../battlemap/jetons-pj.ts';
import { idJetonRencontre } from '../rencontres/rencontre.ts';
import type { Combattant } from '../schemas/combat.ts';
import type { Rencontre } from '../schemas/rencontre.ts';
import { deplacementDeBase } from './ordre.ts';

/*
 * Qui entre dans un combat (lot L6.1, décision 4a du 23/10/2026) : les
 * jetons de la scène. Les PJ dont le jeton est posé ; les monstres vivants,
 * avec leur modèle du bestiaire quand ils viennent de la rencontre
 * préparée (initiative et PV) ; un monstre posé à la main (combat libre)
 * attend que le MJ donne ses PV. Les jetons libres et les invocations
 * n'entrent pas (les invocations viendront avec les sorts, L6.4).
 *
 * Lot L6.2 (1b, 10a) : le monstre entre avec sa DEF, son armure et ses
 * résistances, que le joueur lit pour résoudre son attaque ; un monstre
 * posé à la main attend aussi sa DEF (armure 0, sans résistance).
 */

export interface BrouillonCombattant {
  /** Identifiant du jeton, et donc du combattant. */
  id: string;
  genre: Combattant['genre'];
  nom: string;
  perso: string | null;
  uid: string | null;
  monstre: string | null;
  modInit: number;
  /** Monstre : ses PV (null : à saisir). */
  pvMax: number | null;
  /** Monstre : sa DEF (null : à saisir) ; PJ : null, sa CA est sur sa fiche. */
  def: number | null;
  armure: number;
  resistances: { physique: number; magique: number };
  mvtBase: number;
}

export interface FichePourCombat {
  nom: string;
  uid: string;
  modInit: number;
  dons: readonly string[];
}

export interface MonstrePourCombat {
  init: number;
  pv: number;
  def: number;
  /** Réduction de son armure (bestiaire : armureId dans la liste des armures), 0 sans armure. */
  armure: number;
  resistances: { physique?: number; magique?: number } | undefined;
}

/** Sans résistance : ×1 (v1, multiplicateurResistance). */
export const SANS_RESISTANCE = { physique: 1, magique: 1 } as const;

export function brouillonDuCombat(
  jetons: readonly { id: string; genre: string; nom: string; mort?: boolean }[],
  fiches: ReadonlyMap<string, FichePourCombat>,
  rencontre: (Pick<Rencontre, 'monstres'> & { id: string }) | null,
  bestiaire: ReadonlyMap<string, MonstrePourCombat>,
): BrouillonCombattant[] {
  const r: BrouillonCombattant[] = [];
  for (const j of jetons) {
    if (j.genre === 'pj') {
      const perso = persoDuJeton(j.id);
      const f = perso ? fiches.get(perso) : undefined;
      if (perso && f)
        r.push({ id: j.id, genre: 'pj', nom: f.nom.slice(0, 40), perso, uid: f.uid, monstre: null, modInit: f.modInit, pvMax: null, def: null, armure: 0, resistances: { ...SANS_RESISTANCE }, mvtBase: deplacementDeBase(f.dons) });
    } else if (j.genre === 'monstre' && !j.mort) {
      const m = rencontre?.monstres.find((x) => idJetonRencontre(rencontre.id, x.cle) === j.id) ?? null;
      const modele = m ? bestiaire.get(m.monstre) : undefined;
      r.push({
        id: j.id,
        genre: 'monstre',
        nom: j.nom.slice(0, 40),
        perso: null,
        uid: null,
        monstre: m && modele ? m.monstre : null,
        modInit: modele?.init ?? 0,
        pvMax: modele?.pv ?? null,
        def: modele?.def ?? null,
        armure: modele?.armure ?? 0,
        resistances: { ...SANS_RESISTANCE, ...modele?.resistances },
        mvtBase: deplacementDeBase([]),
      });
    }
  }
  return r;
}

/** Ce qui manque pour démarrer, en une phrase ; null si tout est prêt. */
export function manquePourDemarrer(b: readonly BrouillonCombattant[]): string | null {
  if (!b.some((c) => c.genre === 'pj')) return 'Aucun PJ sur la scène : pose leurs jetons.';
  if (!b.some((c) => c.genre === 'monstre')) return 'Aucun monstre vivant sur la scène.';
  const sansPv = b.find((c) => c.genre === 'monstre' && (c.pvMax === null || c.pvMax < 1));
  if (sansPv) return `Donne les PV de ${sansPv.nom}.`;
  const sansDef = b.find((c) => c.genre === 'monstre' && c.def === null);
  if (sansDef) return `Donne la DEF de ${sansDef.nom}.`;
  return null;
}
