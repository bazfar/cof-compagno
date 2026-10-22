import { CRAN_MAX_PAR_LA_PAROLE, CRANS_ATTITUDE, MOD_DD_ATTITUDE, type CranAttitude } from '../../regles/attitude';
import type { Pnj } from '../schemas/pnj';
import type { ActionScene, Appele, OptionScene, OptionSociale, SceneHorsCombat, TypeScene } from '../schemas/scene-hors-combat';

/*
 * Règles d'une scène hors combat jouée (lot S2, décisions de Thomas du
 * 22/10/2026). Pures : lib/actions/scenes-hors-combat.ts les applique dans
 * des transactions ; le client du MJ résout les jets (5a), les écrans les
 * affichent.
 *
 * Table des options sociales (8a, telle quelle) :
 *   Convaincre (Persuasion) : réussite +1 cran ; échec : rien.
 *   Menacer (Intimidation) : réussite +2 crans pour la scène, et un cran
 *     perdu à la clôture par menace réussie (10b) ; échec −1 cran.
 *   Tromper (Bluff) : réussite +1 cran ; −2 crans si le mensonge est
 *     découvert, maintenant ou plus tard (9a : le MJ le note sur le PNJ).
 *   Séduire (Persuasion, cible au moins Neutre) : réussite +1 cran et +1 au
 *     prochain jet social d'un autre appelé ; échec −1 cran.
 *   20 naturel : 2 réussites. 1 naturel : un cran de moins, en plus de l'échec.
 * Pendant la scène, l'attitude bouge à chaque jet, et le DD avec elle
 * (15a). À la clôture, le PNJ ne retient qu'un cran de mieux, et seulement
 * si la scène est gagnée, jamais au-delà de Favorable (9a, 13c) ; les
 * baisses restent entières.
 */

export class RefusScene extends Error {}

export const NOMS_TYPES: Record<TypeScene, string> = { social: 'Social', exploration: 'Exploration', enquete: 'Enquête' };

export const OPTIONS: Record<OptionSociale, { nom: string; competence: string }> = {
  convaincre: { nom: 'Convaincre', competence: 'Persuasion' },
  menacer: { nom: 'Menacer', competence: 'Intimidation' },
  tromper: { nom: 'Tromper', competence: 'Bluff' },
  seduire: { nom: 'Séduire', competence: 'Persuasion' },
};

/** Repères du cadre pour le MJ (1a) : ils pré-remplissent DD, réussites et échecs tolérés. */
export const DIFFICULTES = {
  facile: { nom: 'Facile', dd: 10, requis: 2, toleres: 2 },
  moyenne: { nom: 'Moyenne', dd: 13, requis: 3, toleres: 2 },
  difficile: { nom: 'Difficile', dd: 16, requis: 4, toleres: 2 },
  majeure: { nom: 'Majeure', dd: 18, requis: 5, toleres: 3 },
} as const;
export type Difficulte = keyof typeof DIFFICULTES;

/** 11a : un échec toléré de plus par tranche de 3 joueurs appelés au-delà de 3. */
export function toleresPourLeGroupe(base: number, appeles: number): number {
  return base + Math.max(0, Math.floor((appeles - 3) / 3));
}

const rang = (c: CranAttitude) => CRANS_ATTITUDE.indexOf(c);
const cranDe = (r: number): CranAttitude => CRANS_ATTITUDE[Math.max(0, Math.min(CRANS_ATTITUDE.length - 1, r))]!;

/** L'attitude du PNJ en ce moment de la scène (null hors scène sociale). */
export function cranScene(s: SceneHorsCombat): CranAttitude | null {
  return s.depart ? cranDe(rang(s.depart) + s.hausses - s.baisses + s.temp) : null;
}

/** DD effectif d'un jet : le DD de base, modulé par l'attitude en scène sociale (15a). Le client du MJ seul le connaît. */
export function ddEffectif(dd: number, s: SceneHorsCombat): number {
  const c = cranScene(s);
  return dd + (c ? MOD_DD_ATTITUDE[c] : 0);
}

/** Ce que l'appelé peut faire (4b) : les options sociales, ou n'importe quelle compétence, ou celle du groupe. */
export interface ChoixScene {
  option: OptionScene;
  nom: string;
  /** null : le joueur choisit la compétence (exploration ou enquête, mode individuel). */
  competence: string | null;
  /** Raison d'un choix grisé, ou null. */
  refus: string | null;
}

export function choixPossibles(s: SceneHorsCombat): ChoixScene[] {
  if (s.mode === 'groupe') return [{ option: 'competence', nom: s.competence!, competence: s.competence, refus: null }];
  if (s.type !== 'social') return [{ option: 'competence', nom: 'Compétence au choix', competence: null, refus: null }];
  const c = cranScene(s)!;
  return (Object.keys(OPTIONS) as OptionSociale[]).map((o) => ({
    option: o,
    nom: OPTIONS[o].nom,
    competence: OPTIONS[o].competence,
    refus: o === 'seduire' && rang(c) < rang('neutre') ? 'Séduire demande une cible au moins Neutre.' : null,
  }));
}

/** +1 du Séduire réussi d'un autre appelé, sur ce jet social. */
export function bonusSeduction(s: SceneHorsCombat, uid: string, option: OptionScene): number {
  return s.seduction && s.seduction !== uid && option in OPTIONS ? 1 : 0;
}

/**
 * Résout une action en attente (5a, client du MJ) : la réussite ou l'échec,
 * et ce qu'elle change à la scène. Rend la scène telle qu'après le jet,
 * sans encore passer au tour suivant (voir `apresLeTour`).
 */
export function resoudre(s: SceneHorsCombat, dd: number, a: ActionScene): { resultat: 'reussite' | 'echec' | 'passe'; scene: SceneHorsCombat } {
  if (s.statut !== 'ouverte') throw new RefusScene('La scène n’attend plus de jet.');
  if (a.tour !== s.tour || !s.appelesUids.includes(a.uid)) throw new RefusScene('Ce jet n’est pas attendu.');
  if (a.option === 'passer' || a.de === null) return { resultat: 'passe', scene: s };
  const plus = bonusSeduction(s, a.uid, a.option);
  const reussi = a.de === 20 || (a.de !== 1 && a.de + a.bonus + plus >= ddEffectif(dd, s));
  const n = { ...s, seduction: plus ? null : s.seduction };
  const sociale = s.type === 'social' && a.option !== 'competence';
  if (reussi) {
    n.reussites += a.de === 20 ? 2 : 1;
    if (sociale) {
      if (a.option === 'menacer') {
        n.menaces += 1;
        n.temp = Math.min(4, n.temp + 2);
      } else n.hausses += 1;
      if (a.option === 'tromper') n.mensonges += 1;
      if (a.option === 'seduire') n.seduction = a.uid;
    }
  } else {
    n.echecs += 1;
    if (sociale && (a.option === 'menacer' || a.option === 'seduire')) n.baisses += 1;
    if (s.type === 'social' && a.de === 1) n.baisses += 1;
  }
  if (n.reussites >= n.requis) Object.assign(n, { statut: 'terminee', issue: 'gagnee' });
  else if (n.echecs > n.toleres) Object.assign(n, { statut: 'terminee', issue: 'perdue' });
  return { resultat: reussi ? 'reussite' : 'echec', scene: n };
}

/** Identifiant de l'action d'un appelé pour un tour (une seule par tour et par joueur). */
export const idAction = (tour: number, uid: string) => `${tour}-${uid}`;

/** 7a : le tour suivant s'ouvre quand chaque appelé a agi ou passé, si la scène continue. */
export function apresLeTour(s: SceneHorsCombat, actionsDuTour: readonly Pick<ActionScene, 'uid' | 'resultat'>[]): SceneHorsCombat {
  if (s.statut !== 'ouverte') return s;
  const faits = new Set(actionsDuTour.filter((a) => a.resultat !== null).map((a) => a.uid));
  return s.appelesUids.every((u) => faits.has(u)) ? { ...s, tour: s.tour + 1 } : s;
}

/**
 * L'attitude que le PNJ retient à la clôture (9a, 10b, 13c) : un cran de
 * mieux si la scène est gagnée, jamais au-delà de Favorable par la parole ;
 * moins les baisses et un cran par menace réussie. Les mensonges réussis
 * s'ajoutent à ceux que le MJ pourra découvrir.
 */
export function pnjApresScene(p: Pnj, s: SceneHorsCombat, issue: 'gagnee' | 'perdue' | 'abandonnee', maintenant: number): Pnj {
  if (!p.cran) throw new RefusScene(`${p.nom} n’est pas encore rencontré.`);
  const gain = issue === 'gagnee' && rang(p.cran) < rang(CRAN_MAX_PAR_LA_PAROLE) ? 1 : 0;
  const r = rang(p.cran) + gain - s.baisses - s.menaces;
  const cran = cranDe(r);
  const tendance = rang(cran) > rang(p.cran) ? 'hausse' : rang(cran) < rang(p.cran) ? 'baisse' : p.tendance;
  return { ...p, cran, tendance, mensonges: Math.min(99, p.mensonges + s.mensonges), majLe: maintenant };
}

/** 10a : les appelés qui ont apporté au moins une réussite (leur personnage), dans l'ordre de l'appel. */
export function contributeurs(s: SceneHorsCombat, actions: readonly Pick<ActionScene, 'uid' | 'resultat'>[]): Appele[] {
  const ont = new Set(actions.filter((a) => a.resultat === 'reussite').map((a) => a.uid));
  return s.appeles.filter((a) => ont.has(a.uid));
}

/** Ce qui manque pour ouvrir une scène, ou null. */
export function manquePourOuvrir(b: { type: TypeScene; pnj: string | null; cible: string; objectif: string; mode: 'individuel' | 'groupe'; competence: string | null; appeles: readonly Appele[] }): string | null {
  if (b.type === 'social' && !b.pnj) return 'Une scène sociale vise un PNJ rencontré.';
  if (b.type === 'social' && b.mode === 'groupe') return 'Une scène sociale se joue en mode individuel.';
  if (!b.cible.trim()) return 'Nomme le lieu de la scène.';
  if (!b.objectif.trim()) return 'Donne l’objectif de la scène.';
  if (b.mode === 'groupe' && !b.competence) return 'Choisis la compétence que tout le groupe lance.';
  if (!b.appeles.length) return 'Appelle au moins un joueur.';
  return null;
}
