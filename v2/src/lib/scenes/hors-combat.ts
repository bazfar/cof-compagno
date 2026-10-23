import { CRAN_MAX_PAR_LA_PAROLE, CRANS_ATTITUDE, MOD_DD_ATTITUDE, type CranAttitude } from '../../regles/attitude';
import type { Pnj } from '../schemas/pnj';
import type { ActionScene, Appele, OptionScene, OptionSociale, SceneHorsCombat, TypeScene } from '../schemas/scene-hors-combat';
import { COMPETENCES_RELANCABLES } from './vecu-en-scene';

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
  return s.depart ? cranDe(rang(s.depart) + s.peuple + s.hausses - s.baisses + s.temp) : null;
}

// ---- Vécu en scène (S3) ----
/** L'appelé a-t-il ce nœud (relevé à l'ouverture) ? */
export const aLeNoeud = (s: SceneHorsCombat, uid: string, noeud: string) => (s.vecus[uid] ?? []).includes(noeud);
/** A-t-il déjà utilisé ce « 1x/scène » ? */
export const aUtilise = (s: SceneHorsCombat, uid: string, noeud: string) => (s.usages[uid] ?? []).includes(noeud);
const avecUsage = (s: SceneHorsCombat, uid: string, noeud: string): SceneHorsCombat['usages'] => ({ ...s.usages, [uid]: [...new Set([...(s.usages[uid] ?? []), noeud])] });

/** DD d'un jet : le DD effectif, moins 1 par Crocheter et Désamorcer en Escamotage, hors social (7a). */
export function ddDuJet(dd: number, s: SceneHorsCombat, a: Pick<ActionScene, 'uid' | 'option' | 'competence'>): number {
  const outils = a.option === 'competence' && a.competence === 'Escamotage' && s.type !== 'social' ? ['crocheter', 'desamorcer'].filter((n) => aLeNoeud(s, a.uid, n)).length : 0;
  return ddEffectif(dd, s) - outils;
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

export function choixPossibles(s: SceneHorsCombat, uid?: string): ChoixScene[] {
  if (s.mode === 'groupe') return [{ option: 'competence', nom: s.competence!, competence: s.competence, refus: null }];
  if (s.type !== 'social') return [{ option: 'competence', nom: 'Compétence au choix', competence: null, refus: null }];
  const c = cranScene(s)!;
  const sociales: ChoixScene[] = (Object.keys(OPTIONS) as OptionSociale[]).map((o) => ({
    option: o,
    nom: OPTIONS[o].nom,
    competence: OPTIONS[o].competence,
    refus: o === 'seduire' && rang(c) < rang('neutre') ? 'Séduire demande une cible au moins Neutre.' : null,
  }));
  if (!uid) return sociales;
  // Options du Vécu (S3, 1a et 5a) : pour leur porteur, une fois par scène.
  const vecu: ChoixScene[] = [];
  if (aLeNoeud(s, uid, 'lire-les-gens'))
    vecu.push({ option: 'lire', nom: 'Lire les gens', competence: 'Discernement', refus: aUtilise(s, uid, 'lire-les-gens') ? 'Déjà utilisé dans cette scène.' : null });
  if (aLeNoeud(s, uid, 'citer-le-precedent') && s.autorite)
    vecu.push({ option: 'citer', nom: 'Citer le précédent', competence: 'Connaissances (histoire)', refus: aUtilise(s, uid, 'citer-le-precedent') ? 'Déjà utilisé dans cette scène.' : null });
  return [...sociales, ...vecu];
}

/** +1 du Séduire réussi d'un autre appelé, sur ce jet social. */
export function bonusSeduction(s: SceneHorsCombat, uid: string, option: OptionScene): number {
  return s.seduction && s.seduction !== uid && option in OPTIONS ? 1 : 0;
}

/** Le sort joint à une action, une fois tranché (lot G2b ; voir effetEnScene). */
export interface SortAuJet {
  rate: boolean;
  bonus: number;
  note: string;
}

/** 7a (G2b) : les options qui peuvent porter un sort. Pas Passer, Lire les gens ni Citer le précédent. */
export const OPTIONS_AVEC_SORT: readonly OptionScene[] = ['convaincre', 'menacer', 'tromper', 'seduire', 'competence'];

/** Ce que résoudre un jet rend au client du MJ. */
export interface Resolution {
  resultat: 'reussite' | 'echec' | 'passe';
  scene: SceneHorsCombat;
  /** Ce que le Vécu a changé, noté sur l'action (« Langue d'argent »…). */
  note: string | null;
  /** Ce que le jet a changé aux compteurs, pour qu'une relance le défasse (8a). */
  delta: Record<string, number>;
  /** Lire les gens réussi (1a) : le DD du moment, révélé au joueur seul. */
  revelation: number | null;
}

const COMPTEURS = ['reussites', 'echecs', 'hausses', 'baisses', 'menaces', 'temp', 'mensonges'] as const;
function difference(avant: SceneHorsCombat, apres: SceneHorsCombat): Record<string, number> {
  const d: Record<string, number> = {};
  for (const k of COMPTEURS) if (apres[k] !== avant[k]) d[k] = apres[k] - avant[k];
  return d;
}
function issueDe(n: SceneHorsCombat): SceneHorsCombat {
  if (n.reussites >= n.requis) return { ...n, statut: 'terminee', issue: 'gagnee' };
  if (n.echecs > n.toleres) return { ...n, statut: 'terminee', issue: 'perdue' };
  return { ...n, statut: 'ouverte', issue: null };
}

/**
 * Résout une action en attente (5a, client du MJ) : la réussite ou l'échec,
 * et ce qu'elle change à la scène, Vécu compris (S3). Rend la scène telle
 * qu'après le jet, sans encore passer au tour suivant (voir `apresLeTour`).
 * Une relance (8a) peut viser un tour passé : son échec a déjà été défait
 * (`defaireJet`).
 * Sort joint (lot G2b) : tranché, il ajoute son bonus au jet (13a) ; raté au
 * jet d'échec, l'action compte comme un échec de la scène, sans toucher à
 * l'attitude (7b).
 */
export function resoudre(s: SceneHorsCombat, dd: number, a: ActionScene, sort: SortAuJet | null = null): Resolution {
  if (s.statut !== 'ouverte') throw new RefusScene('La scène n’attend plus de jet.');
  if ((a.relance ? a.tour > s.tour : a.tour !== s.tour) || !s.appelesUids.includes(a.uid)) throw new RefusScene('Ce jet n’est pas attendu.');
  const rien: Resolution = { resultat: 'passe', scene: s, note: null, delta: {}, revelation: null };
  if (a.option === 'passer' || a.de === null) return rien;
  const ddJet = ddDuJet(dd, s, a);
  const sociale = s.type === 'social' && a.option in OPTIONS;

  // Lire les gens (1a) : un jet pour savoir, qui ne compte ni pour ni contre la scène.
  if (a.option === 'lire') {
    if (s.type !== 'social' || !aLeNoeud(s, a.uid, 'lire-les-gens') || (aUtilise(s, a.uid, 'lire-les-gens') && !a.relance)) return { ...rien, note: 'Lire les gens indisponible' };
    const lu = a.de === 20 || (a.de !== 1 && a.de + a.bonus >= ddJet);
    return { resultat: lu ? 'reussite' : 'echec', scene: { ...s, usages: avecUsage(s, a.uid, 'lire-les-gens') }, note: 'Lire les gens', delta: {}, revelation: lu ? ddJet : null };
  }
  // Citer le précédent (5a) : face à une autorité, une réussite pour la scène, sans toucher à l'attitude.
  if (a.option === 'citer' && (s.type !== 'social' || !s.autorite || !aLeNoeud(s, a.uid, 'citer-le-precedent') || (aUtilise(s, a.uid, 'citer-le-precedent') && !a.relance)))
    return { ...rien, note: 'Citer le précédent indisponible' };

  if (sort?.rate) {
    const n = issueDe({ ...s, echecs: s.echecs + 1 });
    return { resultat: 'echec', scene: n, note: sort.note.slice(0, 60), delta: difference(s, n), revelation: null };
  }
  const plus = (sociale ? bonusSeduction(s, a.uid, a.option) : 0) + (sort?.bonus ?? 0);
  let reussi = a.de === 20 || (a.de !== 1 && a.de + a.bonus + plus >= ddJet);
  let note: string | null = a.option === 'citer' ? 'Citer le précédent' : sort ? sort.note : null;
  let n: SceneHorsCombat = { ...s, seduction: sociale && bonusSeduction(s, a.uid, a.option) ? null : s.seduction };
  if (a.option === 'citer') n.usages = avecUsage(n, a.uid, 'citer-le-precedent');
  // Langue d'argent (4a) : le premier jet social de la scène raté de 2 ou moins devient une réussite.
  if (!reussi && sociale && a.de !== 1 && aLeNoeud(s, a.uid, 'langue-d-argent') && !aUtilise(s, a.uid, 'langue-d-argent') && a.de + a.bonus + plus >= ddJet - 2) {
    reussi = true;
    note = 'Langue d’argent';
    n.usages = avecUsage(n, a.uid, 'langue-d-argent');
  }
  if (reussi) {
    let gain = a.de === 20 ? 2 : 1;
    // Orateur (3a) : face à une foule, les réussites sociales comptent double.
    if (sociale && s.foule && aLeNoeud(s, a.uid, 'orateur')) {
      gain *= 2;
      note = note ? `${note}, Orateur` : 'Orateur';
    }
    n.reussites += gain;
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
    if (sociale && a.de === 1) n.baisses += 1;
  }
  n = issueDe(n);
  return { resultat: reussi ? 'reussite' : 'echec', scene: n, note: note ? note.slice(0, 60) : null, delta: difference(s, n), revelation: null };
}

/** Défait ce qu'un échec avait changé (8a), avant de résoudre sa relance ; la scène peut se rouvrir. */
export function defaireJet(s: SceneHorsCombat, delta: Record<string, number>): SceneHorsCombat {
  if (s.statut === 'close') throw new RefusScene('La scène est close.');
  const n = { ...s };
  for (const k of COMPTEURS) n[k] = Math.max(0, n[k] - (delta[k] ?? 0));
  return issueDe(n);
}

/** Mémoire eidétique (8a) : cet échec peut-il être relancé par son auteur ? */
export function relancable(s: SceneHorsCombat, a: Pick<ActionScene, 'uid' | 'option' | 'competence' | 'resultat' | 'relance' | 'annule'>): boolean {
  return (
    s.statut !== 'close' &&
    a.resultat === 'echec' &&
    !a.relance &&
    !a.annule &&
    a.competence !== null &&
    COMPETENCES_RELANCABLES.has(a.competence) &&
    aLeNoeud(s, a.uid, 'memoire-eidetique')
  );
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

/** 10a : les appelés qui ont apporté au moins une réussite (leur personnage), dans l'ordre de l'appel. Lire les gens n'en apporte pas (S3). */
export function contributeurs(s: SceneHorsCombat, actions: readonly (Pick<ActionScene, 'uid' | 'resultat'> & { option?: ActionScene['option'] })[]): Appele[] {
  const ont = new Set(actions.filter((a) => a.resultat === 'reussite' && a.option !== 'lire').map((a) => a.uid));
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
