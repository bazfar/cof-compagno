import { CalculsPersonnage } from '../regles/calculs.ts';
import type { ObjetPorte } from '../regles/fiche-calcul.ts';
import { ficheCalculDepuisFiche } from '../regles/fiche-document.ts';
import type { Fiche } from '../schemas/fiche.ts';
import { PORTEE_CONTACT, SEUIL_CRITIQUE, SEUIL_PRECISION_LETALE, type Portee, type TypeDegats } from './attaque.ts';

/*
 * Ce qu'un PJ attaque et ce qu'il encaisse (lot L6.2, décisions de Thomas
 * du 23/10/2026), lu de sa fiche par les calculs de la v1 :
 *   - ses attaques d'arme : au contact (l'arme de contact équipée, à défaut
 *     les poings du Moine) et à distance (l'arme à distance équipée), avec
 *     le bonus d'attaque de la fiche, la formule de dégâts de la v1 (dés de
 *     l'arme + enchantement) et la portée de l'arme (4a) ;
 *   - les dégâts qu'il subit (8a, 10a) : moins sa réduction de dégâts
 *     (armure, capacités, Écorce partagée), le don Maître des armures
 *     lourdes sur le physique, la Résistance naturelle du Druide sur le
 *     naturel et la chute (v1 : subirDegats).
 * Les bonus d'états et de dons à bascule (Frappe puissante, Tir de
 * précision, Arme bénie…) viendront avec les états (L6.3) et les capacités
 * de classe (L6.5).
 */

export type ModeAttaque = 'contact' | 'distance';

export interface AttaquePj {
  mode: ModeAttaque;
  /** L'arme (ou « Poings »). */
  nom: string;
  bonus: number;
  /** Formule des dégâts, bonus compris (« 1d8+1 ») : un critique en double les dés. */
  formule: string;
  typeDegats: TypeDegats;
  /** null : l'arme ne dit pas sa portée, le MJ juge. */
  portee: Portee | null;
  seuilCritique: number;
}

/** v1 formuleDegats (js/app.js) : les dés de l'arme, plus son bonus (bonusDegatsTotal, à défaut l'enchantement) et l'affixe Folie. */
export function formuleArme(arme: ObjetPorte): string | null {
  if (typeof arme.degats !== 'string' || !arme.degats) return null;
  const bonus = typeof arme.bonusDegatsTotal === 'number' ? arme.bonusDegatsTotal : typeof arme.enchantement === 'number' ? arme.enchantement : 0;
  const total = bonus + (typeof arme.bonusDegatsAffixe === 'number' ? arme.bonusDegatsAffixe : 0);
  return `${arme.degats}${total > 0 ? `+${total}` : total < 0 ? total : ''}`;
}

function porteeArme(arme: ObjetPorte, defaut: Portee | null, vue: boolean): Portee | null {
  return typeof arme.porteeMaxCases === 'number' ? { min: typeof arme.porteeMinCases === 'number' ? arme.porteeMinCases : 0, max: arme.porteeMaxCases, vue } : defaut;
}

/** Précision létale (Maître d'armes 3) : critique sur 19–20. */
export function seuilCritiqueDe(f: Fiche): number {
  return f.schemaVersion === 2 && (f.refonte.rangs['guerrier.maitre-d-armes'] ?? 0) >= 3 ? SEUIL_PRECISION_LETALE : SEUIL_CRITIQUE;
}

/** Les attaques d'arme du PJ, contact d'abord ; sans arme ni poings, aucune. */
export function attaquesDuPj(f: Fiche): AttaquePj[] {
  const c = new CalculsPersonnage(ficheCalculDepuisFiche(f));
  const seuilCritique = seuilCritiqueDe(f);
  const r: AttaquePj[] = [];
  const contact = c.armeContactEquipee();
  const formuleContact = contact ? formuleArme(contact) : null;
  const poings = c.degatsPoings();
  if (contact && formuleContact)
    r.push({ mode: 'contact', nom: String(contact.nom ?? 'Arme'), bonus: c.bonusAttaque('contact') ?? 0, formule: formuleContact, typeDegats: contact.typedegats === 'magique' ? 'magique' : 'physique', portee: porteeArme(contact, PORTEE_CONTACT, false), seuilCritique });
  else if (poings) r.push({ mode: 'contact', nom: 'Poings', bonus: c.bonusAttaque('contact') ?? 0, formule: poings, typeDegats: 'physique', portee: PORTEE_CONTACT, seuilCritique });
  const distance = c.armeDistanceEquipee();
  const formuleDistance = distance ? formuleArme(distance) : null;
  if (distance && formuleDistance)
    r.push({ mode: 'distance', nom: String(distance.nom ?? 'Arme'), bonus: c.bonusAttaque('distance') ?? 0, formule: formuleDistance, typeDegats: distance.typedegats === 'magique' ? 'magique' : 'physique', portee: porteeArme(distance, null, true), seuilCritique });
  return r;
}

export const TYPES_DEGATS_SUBIS = ['physique', 'magique', 'naturel', 'chute'] as const;
export type TypeDegatsSubis = (typeof TYPES_DEGATS_SUBIS)[number];
export const NOMS_TYPES_DEGATS: Readonly<Record<TypeDegatsSubis, string>> = {
  physique: 'Physique',
  magique: 'Magique',
  naturel: 'Naturel (froid, chaleur, poison, animal)',
  chute: 'Chute',
};

/** Dégâts subis par un PJ (8a, 10a) : le brut moins ses réductions, jamais sous 0 (v1 : subirDegats, réductions fixes). */
export function degatsSurPj(f: Fiche, brut: number, type: TypeDegatsSubis): { brut: number; net: number; detail: string } {
  const c = new CalculsPersonnage(ficheCalculDepuisFiche(f));
  const b = Math.max(0, Math.round(brut));
  const parts: [string, number][] = [
    ['armure', c.reductionDegats()],
    ['don', type === 'physique' ? c.bonusReductionLourdeDons() : 0],
    ['résistance naturelle', type === 'naturel' || type === 'chute' ? c.reductionDegatsNaturels() : 0],
  ];
  const sources = parts.filter(([, v]) => v > 0);
  const reduction = sources.reduce((t, [, v]) => t + v, 0);
  const net = Math.max(0, b - reduction);
  return { brut: b, net, detail: reduction ? `${b} − ${reduction} (${sources.map(([n]) => n).join(' + ')}) = ${net}` : String(b) };
}
