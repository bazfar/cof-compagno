import type { Fiche } from '../schemas/fiche.ts';
import type { BrancheVecu, NoeudVecu } from '../schemas/vecu.ts';
import { noeudVecuParId, PREDILECTIONS_VECU, VECU_DES_CAPACITES_V1 } from '../../regles/index.ts';

/*
 * L'arbre du Vécu sur la fiche (lot L4.18) : la partie pure, testée ; les
 * écritures sont dans lib/actions/vecu.ts.
 *
 * Barre (validé, décision 2a du 22/10/2026) : le MJ donne des crans ; tous
 * les 3 crans, un palier et un point ; un retrait ne descend jamais sous un
 * palier atteint. `vecu.crans` compte les crans du palier en cours (0 à 2),
 * `paliers` les paliers atteints, `points` ceux qui restent à dépenser.
 *
 * Arbre (validé, 3a) : tier 1 libre ; tier 2 = 2 points déjà dans la
 * branche ; tier 3 = 4 ; les prérequis nommés d'abord ; le nœud offert
 * compte dans sa branche et ne coûte rien ; un nœud choisi est définitif,
 * seul le MJ le retire (son point revient).
 */

export type Vecu = Fiche['vecu'];

export class RefusVecu extends Error {}

/** Crans par palier (validé). */
export const CRANS_PAR_PALIER = 3;

const SEUIL_DU_TIER: Record<number, number> = { 1: 0, 2: 2, 3: 4 };
/** Noms des branches et des types d'effet, pour l'écran. */
export const NOMS_BRANCHES: Record<BrancheVecu, string> = { social: 'Social', exploration: 'Exploration', savoir: 'Savoir', croisement: 'Croisements' };

/** Nom d'un nœud, pour l'écran. */
export const nomNoeud = (id: string): string => noeudVecuParId.get(id)?.nom ?? id;
const nom = nomNoeud;

/** Nœuds possédés, le nœud offert compris. */
export function noeudsPossedes(v: Vecu): string[] {
  return [...(v.noeudOffert ? [v.noeudOffert] : []), ...v.noeuds];
}

/** Points mis dans chaque branche, nœud offert compris (3a). */
export function pointsParBranche(v: Vecu): Record<BrancheVecu, number> {
  const p: Record<BrancheVecu, number> = { social: 0, exploration: 0, savoir: 0, croisement: 0 };
  for (const id of noeudsPossedes(v)) {
    const n = noeudVecuParId.get(id);
    if (n) p[n.branche] += 1;
  }
  return p;
}

/** Pourquoi ce nœud ne peut pas être pris maintenant, ou null. */
export function refusNoeud(v: Vecu, id: string): string | null {
  const n = noeudVecuParId.get(id);
  if (!n) return 'Ce nœud n’existe pas.';
  const possedes = noeudsPossedes(v);
  if (possedes.includes(id)) return 'Déjà pris.';
  const manquants = n.prerequis.filter((p) => !possedes.includes(p));
  if (manquants.length) return `Il faut d’abord : ${manquants.map(nom).join(', ')}.`;
  if (n.branche !== 'croisement') {
    const seuil = SEUIL_DU_TIER[n.tier]!;
    const mis = pointsParBranche(v)[n.branche];
    if (mis < seuil) return `Tier ${n.tier} : ${seuil} points dans la branche ${NOMS_BRANCHES[n.branche]} (tu en as ${mis}).`;
  }
  if (v.points < 1) return 'Aucun point de Vécu à dépenser.';
  return null;
}

/** Le joueur prend un nœud : un point en moins. */
export function prendreNoeud(v: Vecu, id: string): Vecu {
  const refus = refusNoeud(v, id);
  if (refus) throw new RefusVecu(refus);
  return { ...v, points: v.points - 1, noeuds: [...v.noeuds, id] };
}

/** Le MJ retire un nœud choisi (3a) : son point revient ; jamais un nœud dont un autre dépend, ni le nœud offert. */
export function retirerNoeud(v: Vecu, id: string): Vecu {
  if (!v.noeuds.includes(id)) throw new RefusVecu(v.noeudOffert === id ? 'Le nœud offert ne se retire pas.' : 'Ce nœud n’est pas pris.');
  const dependants = v.noeuds.filter((x) => noeudVecuParId.get(x)?.prerequis.includes(id));
  if (dependants.length) throw new RefusVecu(`${dependants.map(nom).join(', ')} en dépend : retire-le d’abord.`);
  return { ...v, points: v.points + 1, noeuds: v.noeuds.filter((x) => x !== id) };
}

/** Un cran de Vécu donné (+1) ou retiré (−1) par le MJ (2a). */
export function ajouterCranVecu(v: Vecu, delta: 1 | -1): Vecu {
  if (delta < 0) {
    if (v.crans === 0) throw new RefusVecu('Aucun cran à retirer : un palier atteint ne se perd pas.');
    return { ...v, crans: v.crans - 1 };
  }
  const crans = v.crans + 1;
  return crans >= CRANS_PAR_PALIER ? { ...v, crans: crans - CRANS_PAR_PALIER, paliers: v.paliers + 1, points: v.points + 1 } : { ...v, crans };
}

/**
 * Le MJ accorde un nœud de la v1 (5a) : un palier, et le nœud, déjà
 * dépensé. S'il l'a déjà (le nœud offert, souvent), le palier vient avec un
 * point à dépenser : le rang v1 n'est pas perdu.
 */
export function accorderNoeudV1(v: Vecu, id: string): Vecu {
  if (!noeudVecuParId.has(id)) throw new RefusVecu('Ce nœud n’existe pas.');
  if (noeudsPossedes(v).includes(id)) return { ...v, paliers: v.paliers + 1, points: v.points + 1 };
  return { ...v, paliers: v.paliers + 1, noeuds: [...v.noeuds, id] };
}

/** Barre de Vécu affichée. */
export function barreVecu(v: Vecu): { crans: number; requis: number; paliers: number; points: number } {
  return { crans: v.crans, requis: CRANS_PAR_PALIER, paliers: v.paliers, points: v.points };
}

/** Bonus de compétence des nœuds possédés (6a). */
export function bonusCompetencesVecu(v: Vecu): Record<string, number> {
  const b: Record<string, number> = {};
  for (const id of noeudsPossedes(v)) {
    const c = noeudVecuParId.get(id)?.calcul;
    if (c) for (const k of c.competences) b[k] = (b[k] ?? 0) + c.bonus;
  }
  return b;
}

/** Le nœud offert par une classe de la refonte (4a), ou null. Ce module n'importe pas lib/fiche/refonte.ts (cycle avec fiche-document). */
export function noeudOffertDe(classeRefonte: string | null): string | null {
  return classeRefonte ? (PREDILECTIONS_VECU[classeRefonte] ?? null) : null;
}

/** Nœuds du Vécu que les capacités v1 hors combat d'une fiche appellent (5a), sans doublon. */
export function vecuDesCapacitesV1(capacites: readonly { id: string }[]): string[] {
  return [...new Set(capacites.map((c) => VECU_DES_CAPACITES_V1[c.id]).filter((x): x is string => !!x))];
}

export interface NoeudAffiche {
  noeud: NoeudVecu;
  possede: boolean;
  offert: boolean;
  /** null : il peut être pris maintenant. */
  refus: string | null;
}

/** L'arbre, branche par branche, pour l'écran. */
export function arbreVecu(v: Vecu): { branche: BrancheVecu; nom: string; points: number; noeuds: NoeudAffiche[] }[] {
  const possedes = noeudsPossedes(v);
  const parBranche = pointsParBranche(v);
  return (['social', 'exploration', 'savoir', 'croisement'] as const).map((branche) => ({
    branche,
    nom: NOMS_BRANCHES[branche],
    points: parBranche[branche],
    noeuds: [...noeudVecuParId.values()]
      .filter((n) => n.branche === branche)
      .map((n) => ({ noeud: n, possede: possedes.includes(n.id), offert: v.noeudOffert === n.id, refus: possedes.includes(n.id) ? null : refusNoeud(v, n.id) })),
  }));
}

export const NOMS_EFFETS: Record<NoeudVecu['effets'][number]['effet'], string> = {
  bonusCompetence: 'Bonus de compétence',
  bonusCarac: 'Bonus de caractéristique',
  reductionDD: 'Réduction de DD',
  reussite: 'Réussite',
  relance: 'Relance',
  attitude: 'Attitude',
  reductionDegats: 'Réduction de dégâts',
  soin: 'Soin',
  information: 'Information',
  optionScene: 'Option de scène',
  rituel: 'Rituel',
};

// ---------------------------------------------------------------- Dessin de l'arbre (L4.18b)

export interface EtageVecu {
  tier: number;
  /** Points à avoir dans la branche pour ouvrir l'étage. */
  seuil: number;
  atteint: boolean;
  noeuds: NoeudAffiche[];
}

export interface DispositionVecu {
  /** Les trois branches, en colonnes : Social, Exploration, Savoir ; trois étages chacune. */
  branches: { branche: Exclude<BrancheVecu, 'croisement'>; nom: string; points: number; etages: EtageVecu[] }[];
  /** Les croisements, chacun entre ses deux branches (index de colonnes, du plus petit au plus grand). */
  croisements: (NoeudAffiche & { entre: [number, number] })[];
  /** Un trait par prérequis : du nœud requis vers celui qui le demande ; `acquis` quand les deux sont pris. */
  liens: { de: string; vers: string; acquis: boolean }[];
}

const COLONNES = ['social', 'exploration', 'savoir'] as const;

/**
 * L'arbre disposé pour l'écran (décisions 1a à 4a du 22/10/2026, lot
 * L4.18b) : une colonne par branche, trois étages (tier 1 à 3) avec leur
 * seuil, les croisements entre leurs deux branches, et les traits des
 * prérequis.
 */
export function dispositionVecu(v: Vecu): DispositionVecu {
  const arbre = arbreVecu(v);
  const colonneDe = (id: string) => COLONNES.indexOf(noeudVecuParId.get(id)?.branche as (typeof COLONNES)[number]);
  const possedes = noeudsPossedes(v);
  return {
    branches: COLONNES.map((branche) => {
      const b = arbre.find((x) => x.branche === branche)!;
      return {
        branche,
        nom: b.nom,
        points: b.points,
        etages: [1, 2, 3].map((tier) => ({
          tier,
          seuil: SEUIL_DU_TIER[tier]!,
          atteint: b.points >= SEUIL_DU_TIER[tier]!,
          noeuds: b.noeuds.filter((n) => n.noeud.tier === tier),
        })),
      };
    }),
    croisements: arbre
      .find((x) => x.branche === 'croisement')!
      .noeuds.map((n) => {
        const [a, b] = n.noeud.prerequis.map(colonneDe).sort((x, y) => x - y) as [number, number];
        return { ...n, entre: [a, b] as [number, number] };
      }),
    liens: [...noeudVecuParId.values()].flatMap((n) => n.prerequis.map((de) => ({ de, vers: n.id, acquis: possedes.includes(de) && possedes.includes(n.id) }))),
  };
}
