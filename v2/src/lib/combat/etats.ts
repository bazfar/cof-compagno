import { ETATS_BESTIAIRE, etatParId, etatsRefonte } from '../../regles/index.ts';
import { bonusFixe } from './bonus.ts';
import type { BonusCombat, EtatCombat } from '../schemas/combat.ts';
import type { EtatRefonte } from '../schemas/etats.ts';

/*
 * Les états en combat (lot L6.3, décisions de Thomas du 23/10/2026).
 * Fonctions pures : lib/actions les appliquent, les écrans les montrent.
 *   - 1a : le catalogue de la refonte (src/regles/etats.ts), seul ; les
 *     identifiants v1 du bestiaire passent par ETATS_V1_VERS_REFONTE ;
 *   - 2a : sur le combattant, effacés avec le combat ;
 *   - 4b : le MJ comme le joueur posent un état à la main ; les attaques
 *     spéciales et les attaques de monstre le posent d'office (8 : comme
 *     les attaques spéciales des PJ, sans sauvegarde) ;
 *   - 5a : la durée se décompte à la fin du tour du porteur : un état d'un
 *     round couvre son prochain tour entier ;
 *   - 6a : l'app applique ce que l'état décrit (modificateurs, avantage et
 *     désavantage, dégâts par tour, Affaibli, déplacement, ciblable, contact
 *     seulement, Double, rupture) ; le reste est le texte de la règle ;
 *   - 7b : qui « n'agit pas » garde la main et la passe lui-même.
 */

/** États du bestiaire (v1) traduits en états de la refonte (L6.6a : src/regles/monstres.ts) ; un état sans équivalent n'est pas posé (dit au journal). */
export const ETATS_V1_VERS_REFONTE: Readonly<Record<string, string>> = ETATS_BESTIAIRE;

export function etatDuCatalogue(id: string): EtatRefonte | null {
  return etatParId.get(id) ?? null;
}

/** Les états qu'on peut poser à la main, par nom. */
export function etatsPosables(): { id: string; nom: string; regle: string }[] {
  return etatsRefonte.map((e) => ({ id: e.id, nom: e.nom, regle: e.regle })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

const def = (e: EtatCombat) => etatParId.get(e.id);

/**
 * Pose un état : un état déjà là prend la plus longue des deux durées ; un
 * état cumulable ajoute une pose (Ivresse). 20 états au plus.
 */
export function poserEtat(etats: readonly EtatCombat[], id: string, rounds: number | null, source: string | null, autres: { charges?: number | null; des?: string | null } = {}): EtatCombat[] {
  const d = etatParId.get(id);
  if (!d) throw new Error(`État inconnu : ${id}`);
  const deja = etats.find((e) => e.id === id);
  if (deja) {
    const duree = deja.rounds === null || rounds === null ? null : Math.max(deja.rounds, rounds);
    return etats.map((e) => (e.id === id ? { ...e, rounds: duree, cumul: d.cumulable ? Math.min(20, e.cumul + 1) : e.cumul, charges: autres.charges ?? e.charges, des: autres.des ?? e.des } : e));
  }
  return [...etats, { id, rounds, cumul: 1, charges: autres.charges ?? null, des: autres.des ?? null, source: source ? source.slice(0, 40) : null }].slice(-20);
}

/** L6.6a (8a) : un monstre immunisé : l'état ne se pose pas sur lui. */
export function immunise(c: { immunites?: readonly string[] | undefined }, etat: string): boolean {
  return !!c.immunites?.includes(etat);
}

export function retirerEtat(etats: readonly EtatCombat[], id: string): EtatCombat[] {
  return etats.filter((e) => e.id !== id);
}

/** Fin du tour du porteur (5a) : un round de moins ; à 0, l'état tombe. Sans durée, il reste. */
export function finDeTour(etats: readonly EtatCombat[]): EtatCombat[] {
  return etats.flatMap((e) => (e.rounds === null ? [e] : e.rounds > 1 ? [{ ...e, rounds: e.rounds - 1 }] : []));
}

export type Rupture = 'degatsSubis' | 'sesAttaques' | 'estAttaque' | 'actionMouvement';

/** Les états que cet événement rompt tombent (Endormi réveillé par les dégâts, Dissimulé par ses attaques…). */
export function rompre(etats: readonly EtatCombat[], cause: Rupture): EtatCombat[] {
  return etats.filter((e) => !def(e)?.rompuPar.includes(cause));
}

/** Somme des modificateurs de ces cibles (« attaque », « DEF »…) ; un état cumulable compte chaque pose. */
export function modificateur(etats: readonly EtatCombat[], cibles: readonly string[]): number {
  let t = 0;
  for (const e of etats) {
    const d = def(e);
    if (!d) continue;
    for (const m of d.modificateurs) if (cibles.includes(m.cible)) t += m.valeur * (d.cumulable ? e.cumul : 1);
  }
  return t;
}

/**
 * La défense qu'un jet d'attaque visera : la sienne, modifiée par ses
 * états (Exposé −2…) et ses bonus temporaires de DEF. Les écrans la
 * montrent pour que la valeur lue soit celle du jet ; le bonus propre au
 * contact ou à la distance, que `jetAttaque` ajoute selon le mode de
 * l'attaque, n'en fait pas partie.
 */
export function defenseVisee(base: number, etats: readonly EtatCombat[], bonus: readonly BonusCombat[] = []): number {
  return base + modificateur(etats, ['DEF']) + bonusFixe(bonus, ['DEF']);
}

/**
 * Avantage de l'attaquant (6a du 20/10 : 2d20) : +1 avantage, −1
 * désavantage, 0 s'ils s'annulent. `consommes` : les états « prochaine
 * attaque » de l'attaquant, qui tombent avec ce jet.
 */
export function avantageAttaque(attaquant: readonly EtatCombat[], cible: readonly EtatCombat[]): { avantage: number; consommes: string[] } {
  const a = attaquant.map((e) => ({ e, d: def(e) })).filter((x) => x.d);
  const c = cible.map(def).filter((d): d is EtatRefonte => !!d);
  const av = a.some((x) => x.d!.avantage.includes('attaques') || x.d!.avantage.includes('prochaineAttaque')) || c.some((d) => d.avantage.includes('attaquesContre'));
  const des = a.some((x) => x.d!.desavantage.includes('attaques') || x.d!.desavantage.includes('prochaineAttaque')) || c.some((d) => d.desavantage.includes('attaquesContre'));
  const consommes = a.filter((x) => x.d!.avantage.includes('prochaineAttaque') || x.d!.desavantage.includes('prochaineAttaque')).map((x) => x.e.id);
  return { avantage: (av ? 1 : 0) - (des ? 1 : 0), consommes };
}

/** Le d20 d'une attaque, avec avantage (le meilleur de deux) ou désavantage (le pire). */
export function d20Attaque(alea: () => number, avantage: number): { des: number[]; garde: number } {
  const a = 1 + Math.floor(alea() * 20);
  if (!avantage) return { des: [a], garde: a };
  const b = 1 + Math.floor(alea() * 20);
  return { des: [a, b], garde: avantage > 0 ? Math.max(a, b) : Math.min(a, b) };
}

/** Ce que le porteur peut faire à son tour (6a, 7b) : « non », il passe ; « deplacementSeul », il bouge sans agir. */
export function peutAgir(etats: readonly EtatCombat[]): 'oui' | 'deplacementSeul' | 'non' {
  const a = etats.map((e) => def(e)?.agit ?? 'oui');
  return a.includes('non') ? 'non' : a.includes('deplacementSeul') ? 'deplacementSeul' : 'oui';
}

/** Le déplacement que les états laissent : moitié (arrondie au supérieur, 8a du 21/10) ou rien. */
export function deplacementPermis(etats: readonly EtatCombat[]): 'normal' | 'moitie' | 'nul' {
  const d = etats.map((e) => def(e)?.deplacement ?? 'normal');
  return d.includes('nul') ? 'nul' : d.includes('moitie') ? 'moitie' : 'normal';
}

export function ciblable(etats: readonly EtatCombat[]): boolean {
  return etats.every((e) => def(e)?.ciblable ?? true);
}

/** Aveuglé : il n'attaque qu'au contact. */
export function contactSeulement(etats: readonly EtatCombat[]): boolean {
  return etats.some((e) => def(e)?.contactSeulement);
}

/** Double (lot L4.5) : l'état dont une charge fait rater cette attaque, ou null. */
export function leurre(etats: readonly EtatCombat[]): EtatCombat | null {
  return etats.find((e) => def(e)?.annuleAttaquesContre) ?? null;
}

/** Une charge de moins ; la dernière fait tomber l'état. */
export function consommerCharge(etats: readonly EtatCombat[], id: string): EtatCombat[] {
  return etats.flatMap((e) => (e.id !== id ? [e] : e.charges && e.charges > 1 ? [{ ...e, charges: e.charges - 1 }] : []));
}

/** Affaibli : le pourcentage retiré à ses dégâts et leur plancher, ou null. */
export function affaibli(etats: readonly EtatCombat[]): { pourcent: number; minimum: number } | null {
  for (const e of etats) {
    const d = def(e)?.degatsInfliges;
    if (d) return d;
  }
  return null;
}

/** Dégâts de début de tour (6a) : ceux de l'état, ou ceux que la source a donnés. */
export function degatsParTour(etats: readonly EtatCombat[]): { id: string; nom: string; des: string; typeDegats: string }[] {
  return etats.flatMap((e) => {
    const d = def(e);
    const des = e.des ?? d?.degatsParTour?.des;
    return d && des ? [{ id: e.id, nom: d.nom, des, typeDegats: d.degatsParTour?.typeDegats ?? 'physique' }] : [];
  });
}

/** « Étourdi (1) », « Ivresse ×2 », « Marqué » : le nom, les poses, les rounds qui restent. */
export function texteEtat(e: EtatCombat): string {
  const d = def(e);
  return `${d?.nom ?? e.id}${e.cumul > 1 ? ` ×${e.cumul}` : ''}${e.charges ? ` [${e.charges}]` : ''}${e.rounds !== null ? ` (${e.rounds})` : ''}`;
}

export function regleEtat(id: string): string {
  return etatParId.get(id)?.regle ?? '';
}
