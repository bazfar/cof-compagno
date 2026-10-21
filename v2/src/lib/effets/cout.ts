import { MAITRISES, type Action, type Maitrise, type Palier } from '../schemas/effets';
import { paliersDefinis, palierSuivant } from './paliers';

/*
 * Coût et DD d'un sort (lot L4.1 ; doc de cadre, « Chiffrage des lanceurs
 * (validé) » et « Verbes des hybrides (validé) ») :
 *
 *   coût = base du verbe + (palier − 1) + élément + combinaison + surcharge
 *          − maîtrise d'école, plancher 1 PP
 *
 *   base selon le rang : R1 2 · R2 3 · R3 4 · R4 5 · R5 6
 *   palier            : +1 PP par palier au-dessus de I
 *   élément           : Initié +1, Maître −1 (Non maîtrisé et Adepte : 0)
 *   maîtrise d'école  : même échelle (décision 6a du 20/10/2026) ; l'école
 *                       de la voie est Adepte, puis Maître (−1 PP, +2 au DD) ;
 *                       une autre école, apprise par grimoire, est Non
 *                       maîtrisée puis Initiée (+1 PP), palier I seulement
 *   combinaison       : +2 si le 2ᵉ élément n'est pas Maître
 *   surcharge         : palier immédiatement supérieur, +2 PP en plus du palier ;
 *                       jamais au-delà du III ni sur un verbe 1x/combat
 *
 * Sort mineur : 0 PP, toujours. Hybrides : même formule, payée sur leur
 * réserve réduite. Hors combat (validé) : moitié du coût, arrondie au
 * supérieur, minimum 1 PP.
 *
 * Chaque terme est rendu à part : le grimoire affiche le coût réel détaillé
 * (maquette 2.0, écran Joueur · grimoire).
 */

export { MAITRISES, type Maitrise };

export interface ParametresLancer {
  /** Palier auquel le lanceur a accès (lib/effets/paliers.ts, palierAtteint). */
  palier: Palier;
  /** Lancer au palier immédiatement supérieur. */
  surcharge?: boolean;
  /** Maîtrise de l'élément appliqué, ou null sans élément. */
  element?: Maitrise | null;
  /** Combinaison de Maître : maîtrise du 2ᵉ élément (le 1ᵉʳ doit être Maître). */
  secondElement?: Maitrise | null;
  /** Maîtrise de l'école (ou du Cercle) du verbe ; Adepte par défaut. */
  ecole?: Maitrise;
}

export interface TermeCout {
  terme: 'base' | 'palier' | 'element' | 'combinaison' | 'surcharge' | 'ecole' | 'plancher';
  valeur: number;
}

export type CoutCalcule =
  | { ok: true; pp: number; palierLance: Palier; detail: TermeCout[] }
  | { ok: false; raison: string };

const BASE_PAR_RANG: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
/** Surcoût selon la maîtrise, pour un élément comme pour une école. */
const MAITRISE: Record<Maitrise, number> = { nonMaitrise: 0, initie: 1, adepte: 0, maitre: -1 };
const ORDRE: Palier[] = ['I', 'II', 'III'];

/** Coût en points d'un verbe ou d'un sort mineur, terme par terme, ou la raison d'un refus. */
export function coutSort(action: Pick<Action, 'id' | 'nature' | 'rang' | 'limite' | 'paliers' | 'element'>, p: ParametresLancer): CoutCalcule {
  if (action.nature === 'mineur') {
    if (p.surcharge) return { ok: false, raison: 'un sort mineur ne se surcharge pas' };
    if (p.secondElement) return { ok: false, raison: 'un sort mineur ne combine pas deux éléments' };
    return { ok: true, pp: 0, palierLance: 'I', detail: [] };
  }
  if (action.nature !== 'verbe') return { ok: false, raison: `${action.id} n'est pas un sort` };
  if (!paliersDefinis(action).includes(p.palier)) return { ok: false, raison: `${action.id} n'a pas de palier ${p.palier}` };

  let palierLance = p.palier;
  const detail: TermeCout[] = [{ terme: 'base', valeur: BASE_PAR_RANG[action.rang]! }];
  if (p.surcharge) {
    if (action.limite === '1x/combat') return { ok: false, raison: 'jamais de surcharge sur un verbe 1x/combat' };
    const suivant = palierSuivant(action, p.palier);
    if (!suivant) return { ok: false, raison: 'pas de palier au-dessus pour surcharger' };
    palierLance = suivant;
  }
  const crans = ORDRE.indexOf(palierLance);
  if (crans > 0) detail.push({ terme: 'palier', valeur: crans });
  if (p.surcharge) detail.push({ terme: 'surcharge', valeur: 2 });

  if (p.element || p.secondElement) {
    if (!action.element) return { ok: false, raison: `${action.id} ne prend pas d'élément` };
    if (!p.element) return { ok: false, raison: 'une combinaison part d’un premier élément' };
    if (MAITRISE[p.element]) detail.push({ terme: 'element', valeur: MAITRISE[p.element] });
    if (p.secondElement) {
      if (p.element !== 'maitre') return { ok: false, raison: 'une combinaison demande un premier élément Maître' };
      if (p.secondElement !== 'maitre') detail.push({ terme: 'combinaison', valeur: 2 });
    }
  }
  if (p.ecole && MAITRISE[p.ecole]) detail.push({ terme: 'ecole', valeur: MAITRISE[p.ecole] });

  const brut = detail.reduce((s, t) => s + t.valeur, 0);
  if (brut < 1) detail.push({ terme: 'plancher', valeur: 1 - brut });
  return { ok: true, pp: Math.max(1, brut), palierLance, detail };
}

/** Coût de l'usage hors combat (validé) : moitié, arrondie au supérieur, minimum 1 ; 0 pour un sort mineur. */
export function coutHorsCombat(coutEnCombat: number): number {
  if (coutEnCombat <= 0) return 0;
  return Math.max(1, Math.ceil(coutEnCombat / 2));
}

/** DD d'un sort (validé) : 10 + mod de la caractéristique de magie, +2 quand l'école est Maître. */
export function ddSort(modMagie: number, ecole: Maitrise = 'adepte'): number {
  return 10 + modMagie + (ecole === 'maitre' ? 2 : 0);
}

/**
 * Échec selon la maîtrise (validé pour les éléments, étendu aux écoles par
 * la décision 6a du 20/10/2026) : Non maîtrisé 50 % (1 à 10 au d20), Initié
 * 20 % (1 à 4). Rend le plus haut résultat du d20 qui fait échouer, 0 si
 * jamais. Les PP sont dépensés ; un élément raté dérape (son effet part de
 * travers), une école ratée ne produit rien.
 */
export function seuilEchec(maitrise: Maitrise): number {
  return maitrise === 'nonMaitrise' ? 10 : maitrise === 'initie' ? 4 : 0;
}

/**
 * Combinaison de Maître (validé) : le 1ᵉʳ élément est Maître, le 2ᵉ garde
 * les règles de son rang. Hors Maître/Maître : effet du 2ᵉ réduit de moitié
 * et une fois par combat.
 */
export function regleCombinaison(second: Maitrise): { derapage: number; effetReduit: boolean; unParCombat: boolean } {
  if (second === 'maitre') return { derapage: 0, effetReduit: false, unParCombat: false };
  return { derapage: seuilEchec(second), effetReduit: true, unParCombat: true };
}
