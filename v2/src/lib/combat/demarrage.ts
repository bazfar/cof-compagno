import { persoDuJeton } from '../battlemap/jetons-pj.ts';
import { idJetonRencontre } from '../rencontres/rencontre.ts';
import type { Combattant, SauvegardesCombat } from '../schemas/combat.ts';
import type { Rencontre } from '../schemas/rencontre.ts';
import { deplacementDeBase } from './ordre.ts';
import { immunitesDuMonstre, legendaireDuMonstre } from './monstres.ts';

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
 *
 * Lot L6.4a (8a, 9a) : le monstre entre avec ses sauvegardes, dérivées du
 * bestiaire comme en v1 (js/sauvegardes.js, modMonstre) ; la FOR se joue
 * sur la Vigueur, comme la CON. Un monstre posé à la main n'en a pas (+0),
 * le MJ les donne.
 */

/** v1 : BONUS_TAILLE (Vigueur). */
export const BONUS_TAILLE: Readonly<Record<string, number>> = { petite: -1, moyenne: 0, grande: 1, 'très grande': 2 };
/** v1 : BONUS_TIER (Volonté) ; paliers démoniaques alignés sur basique → champion. */
export const BONUS_TIER: Readonly<Record<string, number>> = { recrue: 0, basique: 0, veteran: 0, elite: 1, meneur: 1, champion: 2, grand_hote: 2, d1: 0, d2: 0, d3: 1, d4: 1, d5: 2 };

/**
 * Les sauvegardes d'un monstre (v1 : Sauvegardes.modMonstre) : Réflexes
 * (DEX) = init plafonnée à 3 + dangerosité ; Vigueur (CON, et FOR : 9a) =
 * dangerosité + taille ; Volonté = dangerosité + palier (+1 pour un boss
 * sans palier).
 */
export function sauvegardesDuMonstre(m: { init: number; dangerosite: number; taille: string; tier?: string | undefined; boss: boolean }): SauvegardesCombat {
  const vigueur = m.dangerosite + (BONUS_TAILLE[m.taille] ?? 0);
  const palier = m.tier !== undefined && BONUS_TIER[m.tier] !== undefined ? BONUS_TIER[m.tier]! : m.boss ? 1 : 0;
  return { FOR: vigueur, DEX: Math.min(m.init, 3 + m.dangerosite), CON: vigueur, Volonte: m.dangerosite + palier };
}

export interface BrouillonCombattant {
  /** Identifiant du jeton, et donc du combattant. */
  id: string;
  genre: Exclude<Combattant['genre'], 'invocation'>;
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
  /** Monstre du bestiaire : ses sauvegardes (8a) ; null : PJ, ou monstre posé à la main. */
  sauvegardes: SauvegardesCombat | null;
  boss: boolean;
  demonOuMortVivant: boolean;
  /** L6.6a (8a) : monstre du bestiaire : ses immunités, en états de la refonte ; absent : aucune. */
  immunites?: string[];
  /** L6.6a (7a) : boss du bestiaire : ses résistances légendaires ; absent : aucune. */
  legendaire?: number;
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
  /** Sauvegardes (L6.4a, 8a), dérivées par sauvegardesDuMonstre. */
  sauvegardes: SauvegardesCombat;
  boss: boolean;
  /** Race démon ou mort-vivant. */
  demonOuMortVivant: boolean;
  /** L6.6a : immunités (8a), résistances légendaires (7a) ; absent : aucune. */
  immunites?: string[];
  legendaire?: number;
}

/** Ce que le combat lit d'un monstre du bestiaire (L6.2, L6.4a) : la réduction de son armure, ses sauvegardes, boss, démon ou mort-vivant. */
export function monstrePourCombat(
  m: {
    init: number;
    pv: number;
    def: number;
    armureId?: string | undefined;
    resistances?: { physique?: number; magique?: number } | undefined;
    dangerosite: number;
    taille: string;
    tier?: string | undefined;
    boss: boolean;
    race: readonly string[];
    immunites?: readonly string[] | undefined;
    resistanceLegendaire?: unknown;
  },
  reductions: ReadonlyMap<string, number>,
): MonstrePourCombat {
  return {
    init: m.init,
    pv: m.pv,
    def: m.def,
    armure: m.armureId ? (reductions.get(m.armureId) ?? 0) : 0,
    resistances: m.resistances,
    sauvegardes: sauvegardesDuMonstre(m),
    boss: m.boss,
    demonOuMortVivant: m.race.includes('démon') || m.race.includes('mort-vivant'),
    ...(immunitesDuMonstre(m).length ? { immunites: immunitesDuMonstre(m) } : {}),
    ...(legendaireDuMonstre(m) ? { legendaire: legendaireDuMonstre(m) } : {}),
  };
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
        r.push({ id: j.id, genre: 'pj', nom: f.nom.slice(0, 40), perso, uid: f.uid, monstre: null, modInit: f.modInit, pvMax: null, def: null, armure: 0, resistances: { ...SANS_RESISTANCE }, mvtBase: deplacementDeBase(f.dons), sauvegardes: null, boss: false, demonOuMortVivant: false });
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
        sauvegardes: modele?.sauvegardes ?? null,
        boss: modele?.boss ?? false,
        demonOuMortVivant: modele?.demonOuMortVivant ?? false,
        ...(modele?.immunites?.length ? { immunites: modele.immunites } : {}),
        ...(modele?.legendaire ? { legendaire: modele.legendaire } : {}),
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
