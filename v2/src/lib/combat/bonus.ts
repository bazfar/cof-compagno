import type { Duree } from '../schemas/effets.ts';
import type { BonusCombat } from '../schemas/combat.ts';

/*
 * Bonus temporaires et PV temporaires en combat (lot L6.4a, décisions de
 * Thomas du 23/10/2026). Fonctions pures.
 *   - 11a : les PV temporaires sont absorbés avant les PV ; ils ne se
 *     cumulent pas (la plus forte réserve reste) et s'en vont avec le
 *     combat ;
 *   - 12a : un bonus temporaire vit sur le combattant avec sa durée,
 *     décomptée comme un état, à la fin du tour du porteur ; il compte dans
 *     les jets comme les modificateurs d'état ; « prochaine frappe » : il
 *     tombe avec les dégâts qui le portent.
 */

/** Une durée du moteur en rounds (5a de L6.3 : « prochain tour » = 1 round) ; null : jusqu'à la fin du combat. */
export function dureeEnRounds(d: Duree): number | null {
  if (typeof d === 'string') return d === 'prochainTour' ? 1 : null;
  if ('rounds' in d) return Math.min(99, d.rounds);
  return null;
}

/** Ajoute un bonus ; 20 au plus (le plus ancien sort). */
export function poserBonus(bonus: readonly BonusCombat[], b: BonusCombat): BonusCombat[] {
  return [...bonus, b].slice(-20);
}

/** Fin du tour du porteur : un round de moins, à 0 le bonus tombe ; sans durée, il reste. */
export function finDeTourBonus(bonus: readonly BonusCombat[]): BonusCombat[] {
  return bonus.flatMap((b) => (b.rounds === null ? [b] : b.rounds > 1 ? [{ ...b, rounds: b.rounds - 1 }] : []));
}

/** Somme des bonus chiffrés sur ces cibles (« attaque », « DEF »…). */
export function bonusFixe(bonus: readonly BonusCombat[], cibles: readonly string[]): number {
  return bonus.reduce((t, b) => (cibles.includes(b.sur) && typeof b.valeur === 'number' ? t + b.valeur : t), 0);
}

/** Les dés en bonus sur ces cibles (« +1d6 aux dégâts »), à ajouter à la formule. */
export function bonusDes(bonus: readonly BonusCombat[], cibles: readonly string[]): string[] {
  return bonus.flatMap((b) => (cibles.includes(b.sur) && typeof b.valeur === 'string' ? [b.valeur] : []));
}

/** Les bonus « prochaine frappe » sur ces cibles tombent (12a). */
export function consommerBonus(bonus: readonly BonusCombat[], cibles: readonly string[]): BonusCombat[] {
  return bonus.filter((b) => !(b.consomme && cibles.includes(b.sur)));
}

/**
 * L6.5b (8a) : le bonus d'une réaction « contre cette attaque » (Bouclier :
 * +2 DEF ; Tir de couverture : −2 à l'attaque de l'ennemi) tombe avec la
 * prochaine attaque : celle qu'il reçoit pour une DEF, celle qu'il porte
 * pour une attaque.
 */
export const SUR_CONTRE_ATTAQUE: readonly string[] = ['DEF', 'DEFContact', 'DEFDistance', 'attaque', 'attaqueContact', 'attaqueDistance'];
export function apresAttaque(bonus: readonly BonusCombat[], role: 'attaquant' | 'cible'): BonusCombat[] {
  return bonus.filter((b) => !(b.contreAttaque && b.sur.startsWith(role === 'cible' ? 'DEF' : 'attaque')));
}

/** Retire les `n` bonus les plus récents (dissipation). */
export function dissiper(bonus: readonly BonusCombat[], n: number): BonusCombat[] {
  return bonus.slice(0, Math.max(0, bonus.length - n));
}

const NOMS: Readonly<Record<string, string>> = {
  attaque: 'attaque',
  attaqueContact: 'attaque au contact',
  attaqueDistance: 'attaque à distance',
  attaqueMagique: 'attaque magique',
  degats: 'dégâts',
  sauvegardes: 'sauvegardes',
  sauvegardeFOR: 'sauvegarde de FOR',
  sauvegardeDEX: 'sauvegarde de DEX',
  sauvegardeCON: 'sauvegarde de CON',
  sauvegardeVolonte: 'sauvegarde de Volonté',
  reductionDegats: 'réduction des dégâts',
  prochainJet: 'prochain jet',
  tests: 'tous les jets',
  deplacement: 'déplacement',
};

/** « +2 DEF (3) », « +1d6 dégâts, prochaine frappe ». */
export function texteBonus(b: BonusCombat): string {
  const v = typeof b.valeur === 'number' ? (b.valeur >= 0 ? `+${b.valeur}` : `−${-b.valeur}`) : `+${b.valeur}`;
  return `${v} ${NOMS[b.sur] ?? b.sur}${b.typeDegats ? ` (${b.typeDegats})` : ''}${b.consomme ? ', prochaine frappe' : ''}${b.contreAttaque ? ', prochaine attaque' : ''}${b.rounds !== null ? ` (${b.rounds})` : ''}`;
}

/** PV temporaires (11a) : les dégâts les entament d'abord ; rend ce qui reste de chacun. */
export function absorber(pvTemp: number, degats: number): { pvTemp: number; reste: number } {
  const pris = Math.min(pvTemp, Math.max(0, degats));
  return { pvTemp: pvTemp - pris, reste: Math.max(0, degats) - pris };
}

/** De nouveaux PV temporaires : la plus forte réserve reste, ils ne s'ajoutent pas (11a). */
export function gagnerPvTemp(pvTemp: number, montant: number): number {
  return Math.min(999, Math.max(pvTemp, montant));
}
