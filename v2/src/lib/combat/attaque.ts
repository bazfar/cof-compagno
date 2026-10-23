import { distanceCases, type JetonCarte, type SceneCalcul } from '../battlemap/geometrie.ts';
import { ligneDeVue } from '../battlemap/ciblage.ts';
import { doublerDes } from '../effets/resolution.ts';
import { lancerFormule, type Jet } from '../regles/des.ts';
import type { ArmeMonstre } from '../schemas/bestiaire.ts';
import type { Combattant } from '../schemas/combat.ts';

/*
 * Attaques et dégâts en combat (lot L6.2, décisions de Thomas du
 * 23/10/2026). Fonctions pures : lib/actions/attaques.ts les applique, les
 * écrans les affichent.
 *   - 1b : le joueur voit la DEF du monstre et résout son attaque sur son
 *     client ;
 *   - 3a : un 20 naturel touche toujours et double les dés de l'arme (19–20
 *     avec Précision létale) ; un 1 naturel rate toujours. Le doublement
 *     est celui du moteur (lib/effets/resolution.ts, doublerDes) : les dés,
 *     pas les bonus ;
 *   - 4a : au contact, la cible est adjacente ; à distance, dans la portée
 *     de l'arme et en vue sur la carte. Hors de portée, l'attaque est
 *     refusée ; le MJ peut passer outre ;
 *   - 10a : sur un monstre, l'armure se retire d'abord, puis la résistance
 *     multiplie, arrondi à l'inférieur (v1 : appliquerDegatsCombat et
 *     multiplicateurResistance).
 */

export type TypeDegats = 'physique' | 'magique';

/** Cases d'une arme : de `min` à `max` ; `vue` : il faut voir la cible (à distance). */
export interface Portee {
  min: number;
  max: number;
  vue: boolean;
}

/** Contact sans portée connue (mains nues, objet sans champ de portée) : une case (v1 : PORTEE_CONTACT_DEFAUT). */
export const PORTEE_CONTACT: Portee = { min: 0, max: 1, vue: false };

/**
 * Portée en cases des armes de monstre (bestiaire : texte en mètres). Une
 * case fait 1,5 m (« contact +1 case (3m) » : deux cases) ; à confirmer par
 * Thomas.
 */
export const CASES_PORTEE_MONSTRE: Readonly<Record<ArmeMonstre['portee'], Portee>> = {
  contact: PORTEE_CONTACT,
  'contact +1 case (3m)': { min: 0, max: 2, vue: false },
  'courte (6m)': { min: 0, max: 4, vue: true },
  'moyenne (18m)': { min: 0, max: 12, vue: true },
  'longue (36m)': { min: 0, max: 24, vue: true },
  'contact (zone adjacente)': PORTEE_CONTACT,
  'contact (arc frontal)': PORTEE_CONTACT,
};

/** Critique sur 20 ; 19–20 avec Précision létale (Maître d'armes 3, décision 4a du 21/10/2026). */
export const SEUIL_CRITIQUE = 20;
export const SEUIL_PRECISION_LETALE = 19;

export interface IssueAttaque {
  /** Le d20 gardé ; `des` : les deux d20 d'un avantage ou d'un désavantage (L6.3), sinon le seul. */
  de: number;
  des?: number[];
  bonus: number;
  total: number;
  def: number;
  touche: boolean;
  critique: boolean;
  /** 1 naturel : raté quoi qu'il arrive. */
  echecCritique: boolean;
}

/** d20 + bonus contre la DEF (3a) : le critique touche toujours, le 1 naturel rate toujours. */
export function resoudreAttaque(de: number, bonus: number, def: number, seuilCritique = SEUIL_CRITIQUE): IssueAttaque {
  const total = de + bonus;
  const critique = de >= seuilCritique;
  const echecCritique = de === 1 && !critique;
  return { de, bonus, total, def, touche: critique || (!echecCritique && total >= def), critique, echecCritique };
}

const signe = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

/** « d20 17 +5 = 22 contre DEF 14 : touché, critique » (journal, 10a). */
export function texteAttaque(i: IssueAttaque, contre = 'DEF'): string {
  const issue = i.critique ? 'touché, critique' : i.echecCritique ? 'raté (1 naturel)' : i.touche ? 'touché' : 'raté';
  const d20 = i.des && i.des.length > 1 ? `2d20 (${i.des.join(', ')}) garde ${i.de}` : `d20 ${i.de}`;
  return `${d20} ${signe(i.bonus)} = ${i.total} contre ${contre} ${i.def} : ${issue}`;
}

/** Formule des dégâts : celle de l'arme, ses dés doublés sur un critique (3a), ses bonus une fois. */
export function formuleDegats(formule: string, critique: boolean): string {
  return critique ? doublerDes(formule) : formule;
}

/** Ce qui protège un monstre (recopié du bestiaire sur son combattant). */
export type DefenseMonstre = Pick<Combattant, 'armure' | 'resistances'>;

export interface DegatsAppliques {
  brut: number;
  net: number;
  /** « 12 − armure 2 = 10 × 0,5 = 5 » ; le brut seul s'il n'y a rien à retirer. */
  detail: string;
}

const virgule = (n: number) => String(n).replace('.', ',');

/** Dégâts sur un monstre (10a) : armure d'abord, puis la résistance du type, arrondi à l'inférieur (v1). */
export function degatsSurMonstre(brut: number, d: DefenseMonstre, type: TypeDegats): DegatsAppliques {
  const b = Math.max(0, Math.round(brut));
  const apresArmure = Math.max(0, b - d.armure);
  const facteur = type === 'magique' ? d.resistances.magique : d.resistances.physique;
  const net = Math.floor(apresArmure * facteur);
  let detail = String(b);
  if (d.armure > 0) detail += ` − armure ${d.armure} = ${apresArmure}`;
  if (facteur !== 1) detail += ` × ${virgule(facteur)} (${facteur < 1 ? 'résiste' : 'vulnérable'} ${type === 'magique' ? 'à la magie' : 'au physique'}) = ${net}`;
  return { brut: b, net, detail };
}

/**
 * La cible est-elle à portée (4a) ? null si oui, sinon la raison. Sans
 * carte (jeton manquant), on ne refuse pas : le MJ juge.
 */
export function horsDePortee(scene: SceneCalcul | null, jetons: readonly JetonCarte[], idA: string, idB: string, p: Portee | null): string | null {
  const a = jetons.find((j) => j.id === idA);
  const b = jetons.find((j) => j.id === idB);
  if (!p || !scene || !a || !b) return null;
  const d = distanceCases(a, b);
  if (d > p.max) return p.max <= 1 ? `pas au contact (${d} cases)` : `hors de portée (${d} cases, ${p.max} au plus)`;
  if (d < p.min) return `trop près (${d} case${d > 1 ? 's' : ''}, ${p.min} au moins)`;
  if (p.vue && !ligneDeVue(scene, a, b)) return 'pas de ligne de vue';
  return null;
}

/** Une attaque de monstre telle que le MJ la lance (6a) : bestiaire et liste des armes. */
export interface AttaqueMonstre {
  nom: string;
  bonus: number;
  /** Dés de l'arme plus le bonus de dégâts de l'attaque. */
  formule: string;
  typeDegats: TypeDegats;
  portee: Portee;
  seuilCritique: number;
  /** L'état que l'attaque pose si elle touche (L6.3, 8 : sans sauvegarde) : son identifiant au bestiaire, ses rounds, ses dégâts par tour. */
  etatSurTouche: { id: string; duree: number; formuleDot?: string } | null;
}

/** Les attaques d'un monstre ; une attaque dont l'arme manque à la liste est laissée de côté (pas devinée). */
export function attaquesDuMonstre(
  attaques: readonly { nom: string; armeId: string; bonusAttaque: number; bonusDegats?: number; etatSurTouche?: { id: string; duree: number; formuleDot?: string } }[],
  armes: ReadonlyMap<string, Pick<ArmeMonstre, 'degats' | 'portee' | 'typedegats' | 'critMin'>>,
): AttaqueMonstre[] {
  return attaques.flatMap((a) => {
    const arme = armes.get(a.armeId);
    if (!arme) return [];
    return [{ nom: a.nom, bonus: a.bonusAttaque, formule: a.bonusDegats ? `${arme.degats}${a.bonusDegats > 0 ? '+' : ''}${a.bonusDegats}` : arme.degats, typeDegats: arme.typedegats, portee: CASES_PORTEE_MONSTRE[arme.portee], seuilCritique: arme.critMin ?? SEUIL_CRITIQUE, etatSurTouche: a.etatSurTouche ?? null }];
  });
}

/**
 * Lance une formule de dégâts à plusieurs termes (« 2d6+1d4+3 », les poings
 * du Moine avec leurs gants) ; les constantes vont au bonus. null si un
 * terme est illisible.
 */
export function lancerDegats(formule: string, alea: () => number = Math.random): Jet | null {
  const termes = formule.replace(/\s/g, '').match(/[+-]?[^+-]+/g);
  if (!termes) return null;
  const des: number[] = [];
  let faces = 0;
  let bonus = 0;
  for (const t of termes) {
    const signe = t.startsWith('-') ? -1 : 1;
    const corps = t.replace(/^[+-]/, '');
    if (/^\d+$/.test(corps)) {
      bonus += signe * Number(corps);
      continue;
    }
    const j = signe > 0 ? lancerFormule(corps, alea) : null;
    if (!j) return null;
    des.push(...j.des);
    faces ||= j.faces;
  }
  if (!des.length) return null;
  return { des, faces, bonus, total: Math.max(0, des.reduce((s, d) => s + d, bonus)) };
}

/** La carte d'un combat, telle que la table la montre : de quoi vérifier une portée (4a). */
export interface CarteDuCombat {
  scene: SceneCalcul;
  jetons: readonly JetonCarte[];
}
