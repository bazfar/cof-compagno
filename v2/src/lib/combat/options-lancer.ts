import { actionParId, combinaisons, elementParId } from '../../regles/index.ts';
import { regleCombinaison } from '../effets/cout.ts';
import { actionAuPalier } from '../effets/paliers.ts';
import { BOOSTS_PAR_CERCLE, type AxePosture, type BoostSacre } from '../effets/resolution.ts';
import { vueFiche } from '../fiche/vue-fiche.ts';
import { classeDeLaRefonte, contexteDe, profilDe } from '../fiche/refonte.ts';
import { ppDisponibles } from '../fiche/sorts-hors-combat.ts';
import type { Combattant } from '../schemas/combat.ts';
import { CARACS } from '../schemas/commun.ts';
import type { Element, Maitrise, Palier } from '../schemas/effets.ts';
import type { FicheV2 } from '../schemas/fiche.ts';

/*
 * Les choix d'un lancer que la barre propose (lot L6.5a, décisions de
 * Thomas du 26/10/2026), en fonctions pures. Le moteur des lots L4 les
 * sait déjà ; L6.4a refusait ces sorts en combat faute de les demander.
 *   - 2b : tous dans un panneau « Options » replié de la barre ; seuls ceux
 *     dont le sort a besoin y paraissent, avec la valeur des données ;
 *   - 3a : la posture du Guerrier : un axe en bonus, un autre en malus,
 *     jusqu'à son rang (doublé sous Maîtrise tactique) ;
 *   - 4a : le second élément d'une combinaison, parmi ses éléments, quand
 *     le premier est Maître (lot L4.10) ; une
 *     fois par combat (sauf second élément Maître), avec le dérapage de son
 *     rang ;
 *   - 5a : le montant d'une Transfusion et la caractéristique d'un élixir,
 *     bornés par les données.
 * Les autres choix du moteur : variante, nombre de dés tirés d'avance,
 * boost (Sacré, Inspiration, Force de la nature), choix de l'eau
 * (repousser ou retirer un état), l'allié, le rebond de l'électricité.
 * Les voisins d'une signature (Séisme) sont pris d'office autour de la
 * cible, sur la carte (lib/combat/sorts.ts).
 */

/** Ce que le joueur a choisi. */
export interface OptionsDuLancer {
  variante?: string;
  nombreDeDes?: number;
  boost?: BoostSacre;
  secondElement?: Element;
  choixEau?: 'poussee' | 'retraitEtat';
  posture?: { plus: AxePosture; moins: AxePosture; valeur: number };
  montant?: number;
  caracChoisie?: (typeof CARACS)[number];
  /** Combattant allié (Transfusion vers un allié, effet « allié », l'eau qui retire un état). */
  allie?: string;
  /** Combattant que touche le rebond de l'électricité. */
  rebond?: string;
}

/** Ce que ce sort demande, à ce palier et avec cet élément. */
export interface BesoinsDuLancer {
  variantes: { id: string; nom: string }[];
  /** Dés tirés d'avance (Prophétie) : combien, au plus. */
  nombreDeDes: { max: number; ppParDe: number } | null;
  boosts: { id: BoostSacre; nom: string }[];
  secondsElements: { id: Element; nom: string; maitrise: Maitrise }[];
  /** La combinaison se paie d'une fois par combat (second élément pas Maître). */
  eau: boolean;
  posture: { axes: AxePosture[]; plafond: number } | null;
  montant: { max: number } | null;
  carac: boolean;
  /** L'allié : `exige` quand le sort ne se lance pas sans. */
  allie: { exige: boolean } | null;
  rebond: boolean;
}

export const NOMS_BOOSTS: Readonly<Record<BoostSacre, string>> = {
  secondAllie: 'Un second allié',
  retraitEtat: 'Retire un état',
  sansSauvegarde: 'Sans sauvegarde',
  plusUnRound: '+1 round',
  doubleContreDemons: 'Double contre démons et morts-vivants',
  ignoreResistances: 'Ignore les résistances',
  marquePartagee: 'Marque partagée',
  plusUneCible: '+1 cible',
  plusUneCase: '+1 case de zone',
};

/** La ressource que paie un boost (le Sacré, sauf l'Inspiration du chant et la Force de la nature). */
const RESSOURCE_BOOST: Readonly<Record<string, string>> = { chant: 'inspiration', nature: 'forceNature' };

/** Le sort tel que la barre le connaît (lib/combat/sorts.ts : SortDeCombat). */
export type SortChoisi = { id: string; elements: { id: Element; nom: string; maitrise: Maitrise }[] };

const AVEC_ELEMENT = (s: SortChoisi, e: Element | null) => (e ? s.elements.find((x) => x.id === e) : undefined);

/** Ce que ce sort demande (2b) : rien si le sort n'a pas de choix à faire. */
export function besoinsDuLancer(f: FicheV2, s: SortChoisi, palier: Palier, element: Element | null, second: Element | null, variante?: string): BesoinsDuLancer {
  const brute = actionParId.get(s.id);
  const vide: BesoinsDuLancer = { variantes: [], nombreDeDes: null, boosts: [], secondsElements: [], eau: false, posture: null, montant: null, carac: false, allie: null, rebond: false };
  if (!brute) return vide;
  // Les variantes de ce palier (le moteur prend celles du palier I et du palier lancé).
  const variantes = brute.variantes.filter((v) => v.palier === 'I' || v.palier === palier);
  const a = actionAuPalier(brute, palier, variantes.some((v) => v.id === variante) ? variante : undefined);
  const vue = vueFiche(f);
  const jauge = (cle: string) => vue.refonte?.jauges.find((j) => j.cle === cle);
  const classe = classeDeLaRefonte(f.refonte.classe);
  const profil = classe ? profilDe(classe, f.refonte, contexteDe(f, classe)) : null;
  const reserve = a.effets.find((e) => e.type === 'jetsReserves');
  const transfusion = a.effets.find((e) => e.type === 'transfusion');
  const posture = a.effets.find((e) => e.type === 'posture');
  const ecole = a.ecole ?? '';
  const boosts = ((BOOSTS_PAR_CERCLE as Record<string, readonly BoostSacre[]>)[ecole] ?? []).filter(() => !!jauge(RESSOURCE_BOOST[ecole] ?? 'sacre'));
  const premier = AVEC_ELEMENT(s, element);
  const deuxieme = second && premier ? AVEC_ELEMENT(s, second) : undefined;
  const elements = [premier?.id, deuxieme?.id];
  const eau = elements.includes('eau');
  const tousEffets = [...a.effets];
  const allieExige = transfusion?.type === 'transfusion' && transfusion.depuis === 'cible';
  const allie = allieExige || eau || tousEffets.some((e) => e.vise === 'allie') ? { exige: !!allieExige } : null;
  return {
    variantes: variantes.map((v) => ({ id: v.id, nom: v.nom })),
    nombreDeDes: reserve?.type === 'jetsReserves' ? { max: Math.max(0, Math.min(10, Math.floor(ppDisponibles(f) / reserve.ppParDe))), ppParDe: reserve.ppParDe } : null,
    boosts: boosts.map((id) => ({ id, nom: NOMS_BOOSTS[id] })),
    // Une combinaison part d'un premier élément Maître (lot L4.10, lib/effets/cout.ts).
    secondsElements:
      premier?.maitrise === 'maitre' && brute.element && brute.nature !== 'mineur' ? s.elements.filter((x) => x.id !== premier.id).map((x) => ({ id: x.id, nom: x.nom, maitrise: x.maitrise })) : [],
    eau,
    posture: posture?.type === 'posture' ? { axes: [...posture.axes], plafond: profil?.voie.soldat?.rang ?? 0 } : null,
    montant: transfusion?.type === 'transfusion' ? { max: transfusion.parNiveau * f.niveau } : null,
    carac: a.effets.some((e) => e.type === 'bonus' && e.cible === 'caracAuChoix'),
    allie,
    rebond: rebondDe(elements) !== null,
  };
}

/** Le rebond d'un des éléments choisis (électricité : 2 cases, src/regles/elements.ts), ou null. */
export function rebondDe(elements: readonly (Element | null | undefined)[]): number | null {
  for (const id of elements) {
    const r = id ? elementParId.get(id)?.sort.modifie.rebond : undefined;
    if (r) return r.cases;
  }
  return null;
}

/** 3a : le plafond de la posture : le rang du soldat, doublé sous Maîtrise tactique. */
export function plafondPosture(b: Pick<BesoinsDuLancer, 'posture'>, moi: Pick<Combattant, 'etats'>): number {
  return (b.posture?.plafond ?? 0) * (moi.etats.some((e) => e.id === 'maitrise_tactique') ? 2 : 1);
}

/** Ce qui manque encore pour lancer (la barre désactive « Lancer » et le dit) ; null : rien. */
export function manqueAuLancer(b: BesoinsDuLancer, o: OptionsDuLancer): string | null {
  if (b.nombreDeDes && !o.nombreDeDes) return 'combien de dés ?';
  if (b.posture && !o.posture) return 'choisis la posture';
  if (b.montant && !o.montant) return 'combien de PV ?';
  if (b.carac && !o.caracChoisie) return 'choisis la caractéristique';
  if (b.allie?.exige && !o.allie) return 'choisis l’allié';
  if (o.choixEau === 'retraitEtat' && !o.allie) return 'choisis l’allié dont l’eau retire un état';
  return null;
}

/** 4a : la combinaison coûte l'usage du combat (sauf second élément Maître). */
export function combinaisonUnParCombat(second: Maitrise | null): boolean {
  return !!second && regleCombinaison(second).unParCombat;
}

/** La signature de la paire (lot L4.10), pour la nommer dans la barre. */
export function nomDeLaPaire(a: Element | null, b: Element | null): string | null {
  const paire = [a, b].sort().join('+');
  return combinaisons.find((c) => [...c.elements].sort().join('+') === paire)?.nom ?? null;
}

export { CARACS };
