import { coutHorsCombat, coutSort, ddSort, seuilEchec } from '../effets/cout.ts';
import { actionAuPalier, paliersDefinis } from '../effets/paliers.ts';
import type { Action, Maitrise, Palier, Sauvegarde } from '../schemas/effets.ts';
import type { FicheV2 } from '../schemas/fiche.ts';
import type { DemandeSort } from '../schemas/sort-hors-combat.ts';
import { actionParId } from '../../regles/index.ts';
import { grimoireDeLaFiche, maitriseDuVerbe } from './grimoire.ts';
import { classeDeLaRefonte, contexteDe, profilDe } from './refonte.ts';

/*
 * Ce qu'un personnage peut lancer hors combat (lot G2a, décisions de
 * Thomas du 22/10/2026). Fonctions pures.
 *   - Les sorts qui ont un usage hors combat (`horsCombat` dans les
 *     données) : verbes appris, verbes « par grimoire » (palier I, 4a),
 *     sorts mineurs (3a).
 *   - 2b : le joueur choisit son palier, au plus celui atteint. Plus bas
 *     coûte moins, et ouvre moins de possibilités.
 *   - 6a : la moitié du coût en combat au palier lancé, sans surcharge ni
 *     élément ; un mineur ne coûte rien (3a). Jet d'échec si l'école est
 *     Non maîtrisée ou Initiée ; jamais pour un mineur.
 *   - 8a : un hybride paie de sa réserve réduite (profil), sans renfort de
 *     ressource de classe.
 *   - 11a : les limites du verbe. « 1x/combat » devient une fois par
 *     séance hors combat ; « 1x/round » ne limite rien hors combat.
 *   - 14b : un sort à sauvegarde porte la sauvegarde et le DD du palier
 *     lancé ; le MJ la lance pour la cible.
 */

const ORDRE: Palier[] = ['I', 'II', 'III'];

export interface PalierLancable {
  palier: Palier;
  pp: number;
  /** Ce qu'ouvrent les paliers jusqu'à celui-ci (7), du I au palier lancé. */
  textes: string[];
  sauvegarde: Sauvegarde | null;
  dd: number | null;
}

export interface SortLancable {
  id: string;
  nom: string;
  mineur: boolean;
  parGrimoire: boolean;
  /** Plus haut d20 qui fait rater le sort, 0 si jamais. */
  echec: number;
  /** Une fois par séance hors combat (verbe « 1x/combat », 11a). */
  unParSeance: boolean;
  paliers: PalierLancable[];
}

function textesJusqua(a: Action, palier: Palier): string[] {
  const textes = a.horsCombat?.paliers ?? [];
  const n = Math.min(ORDRE.indexOf(palier) + 1, textes.length);
  return textes.slice(0, n);
}

function palierLancable(a: Action, palier: Palier, maitrise: Maitrise, modMagie: number): PalierLancable | null {
  const c = coutSort(a, { palier, ecole: maitrise });
  if (!c.ok) return null;
  const au = palier === 'I' ? a : actionAuPalier(a, palier);
  const sauvegarde = au.resolution.jet === 'sauvegarde' ? (au.resolution.sauvegarde ?? null) : null;
  return {
    palier,
    pp: a.nature === 'mineur' ? 0 : coutHorsCombat(c.pp),
    textes: textesJusqua(a, palier),
    sauvegarde,
    dd: sauvegarde ? (au.resolution.ddFixe ?? ddSort(modMagie, maitrise)) : null,
  };
}

function lancable(a: Action, palierMax: Palier, maitrise: Maitrise, modMagie: number, parGrimoire: boolean): SortLancable | null {
  if (!a.horsCombat?.paliers.length) return null;
  const max = ORDRE.indexOf(palierMax);
  const paliers = paliersDefinis(a)
    .filter((p) => ORDRE.indexOf(p) <= max)
    .map((p) => palierLancable(a, p, maitrise, modMagie))
    .filter((p): p is PalierLancable => p !== null);
  if (!paliers.length) return null;
  const mineur = a.nature === 'mineur';
  return { id: a.id, nom: a.nom, mineur, parGrimoire, echec: mineur ? 0 : seuilEchec(maitrise), unParSeance: a.limite === '1x/combat', paliers };
}

/** Les sorts que ce personnage peut lancer hors combat, dans l'ordre du grimoire. */
export function sortsLancables(f: FicheV2): SortLancable[] {
  const g = grimoireDeLaFiche(f);
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!g || !classe) return [];
  const { modMagie } = contexteDe(f, classe);
  const r: SortLancable[] = [];
  for (const v of [...g.verbes.filter((x) => x.appris), ...g.parGrimoire]) {
    const a = actionParId.get(v.id);
    const s = a ? lancable(a, v.palierAtteint, maitriseDuVerbe(f, v.id), modMagie, v.parGrimoire) : null;
    if (s) r.push(s);
  }
  for (const m of g.mineurs) {
    const a = actionParId.get(m.id);
    const s = a ? lancable(a, m.palier, 'adepte', modMagie, false) : null;
    if (s) r.push(s);
  }
  return r;
}

/** Réserve de PP du personnage (profil de la refonte), 0 s'il n'en a pas. */
export function reservePP(f: FicheV2): number {
  const classe = classeDeLaRefonte(f.refonte.classe);
  return classe ? profilDe(classe, f.refonte, contexteDe(f, classe)).reservePP : 0;
}

/** PP disponibles : ceux de la fiche, la réserve pleine s'ils n'ont jamais été notés. */
export function ppDisponibles(f: FicheV2): number {
  return f.ppActuel ?? reservePP(f);
}

/** Le jet d'échec (6a) : le sort rate si le d20 est au plus le seuil. */
export function sortRate(de: number, echec: number): boolean {
  return de <= echec;
}

/** La sauvegarde de la cible (14b) : elle résiste si d20 + bonus atteint le DD. */
export function cibleResiste(de: number, bonus: number, dd: number): boolean {
  return de + bonus >= dd;
}

/** Ce qui attend le MJ (16a) : une demande à accepter ou refuser, ou la sauvegarde de la cible d'un sort lancé (14b). */
export function aTraiter(d: Pick<DemandeSort, 'statut' | 'sauvegarde' | 'resistance'>): boolean {
  return d.statut === 'attente' || (d.statut === 'lancee' && d.sauvegarde !== null && d.resistance === null);
}

// ---- Lot G2b : un sort joint à l'action du tour ----

/** Ce qu'un sort fait au jet du tour, une fois tranché (13a, 14b, 7b). */
export interface EffetEnScene {
  /** Jet d'échec raté (7b) : l'action compte comme un échec de la scène, quel que soit le d20. */
  rate: boolean;
  /** Bonus au jet : celui que le MJ a accordé, 0 si la cible a résisté. */
  bonus: number;
  /** Ce que la carte de scène note sur le jet. */
  note: string;
}

/**
 * Le sort est-il tranché, et que fait-il au jet ? null tant qu'il attend :
 * l'accord du MJ, le lancement par le client du joueur (4b) ou la
 * sauvegarde de la cible (14b). Un sort refusé ne résout rien : le client
 * du MJ défait l'action, que le joueur rejoue (2b).
 */
export function effetEnScene(d: Pick<DemandeSort, 'statut' | 'nomSort' | 'palier' | 'bonus' | 'sauvegarde' | 'resistance'>): EffetEnScene | null {
  const nom = `${d.nomSort} ${d.palier}`;
  if (d.statut === 'ratee') return { rate: true, bonus: 0, note: `${nom} raté` };
  if (d.statut !== 'lancee') return null;
  if (d.sauvegarde !== null && d.resistance === null) return null;
  if (d.resistance?.reussie) return { rate: false, bonus: 0, note: `${nom}, la cible résiste` };
  const bonus = d.bonus ?? 0;
  return { rate: false, bonus, note: `${nom} +${bonus}` };
}
