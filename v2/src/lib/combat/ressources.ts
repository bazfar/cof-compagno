import { jaugesDeLaFiche } from '../fiche/actions-fiche.ts';
import { classeDeLaRefonte } from '../fiche/refonte.ts';
import type { Combattant } from '../schemas/combat.ts';
import type { Fiche } from '../schemas/fiche.ts';

/*
 * Les ressources de classe en combat (lot L6.3, décision 9a de Thomas du
 * 23/10/2026). Une fiche de la refonte seulement (3 : la v1 sera
 * convertie). L'app paie et gagne ce que la classe décrit :
 *   - au début du combat, une ressource qui repart à chaque combat reprend
 *     sa valeur de départ (Ki : 1) ; à sa fin, la Plongée revient à 0 ;
 *   - par dégâts subis (Endurance du Guerrier : +1 à chaque coup qui
 *     blesse) ;
 *   - par touche, dans la limite du round (Ki : +1, 2 par round) ;
 *   - sur un 20 naturel, le sien (Inspiration) ; celui d'un allié qui
 *     l'entend reste au MJ ;
 *   - le coût d'une attaque spéciale (11a).
 * Les autres gains restent au MJ. Rendu : les jauges à écrire, par clé.
 */

export type Jauges = Record<string, number>;

function ressource(f: Fiche) {
  if (f.schemaVersion !== 2) return null;
  const r = classeDeLaRefonte(f.refonte.classe)?.ressourceDeClasse;
  if (!r) return null;
  const j = jaugesDeLaFiche(f).find((x) => x.cle === r.ressource);
  return j ? { ...r, actuel: j.actuel, max: j.max ?? Infinity } : null;
}

/** La jauge d'une ressource (son nom, actuelle et maximum), ou null. */
export function jauge(f: Fiche, cle: string): { nom: string; actuel: number; max: number | null } | null {
  if (f.schemaVersion !== 2) return null;
  const j = jaugesDeLaFiche(f).find((x) => x.cle === cle);
  return j ? { nom: j.nom, actuel: j.actuel, max: j.max } : null;
}

export function jaugesAuDebutDuCombat(f: Fiche): Jauges {
  const r = ressource(f);
  return r && r.debutCombat !== undefined && r.actuel !== r.debutCombat ? { [r.ressource]: r.debutCombat } : {};
}

export function jaugesALaFinDuCombat(f: Fiche): Jauges {
  const p = jauge(f, 'plongee');
  return p && p.actuel > 0 ? { plongee: 0 } : {};
}

export function gainParDegatsSubis(f: Fiche, net: number): Jauges {
  const r = ressource(f);
  if (!r || net <= 0 || !r.parDegatsSubis || r.actuel >= r.max) return {};
  return { [r.ressource]: Math.min(r.max, r.actuel + r.parDegatsSubis) };
}

/** Gain par touche (Ki), plafonné par round : les jauges et le compte du round à écrire. */
export function gainParTouche(f: Fiche, c: Pick<Combattant, 'gainTouche'>, round: number): { jauges: Jauges; gainTouche: Combattant['gainTouche'] } | null {
  const r = ressource(f);
  if (!r?.parTouche) return null;
  const deja = c.gainTouche.round === round ? c.gainTouche.montant : 0;
  const gain = Math.min(r.parTouche.montant, r.parTouche.parRound - deja, r.max - r.actuel);
  if (gain <= 0) return null;
  return { jauges: { [r.ressource]: r.actuel + gain }, gainTouche: { round, montant: deja + gain } };
}

export function gainParVingtNaturel(f: Fiche, de: number): Jauges {
  const r = ressource(f);
  if (!r?.parVingtNaturel || de !== 20 || r.actuel >= r.max) return {};
  return { [r.ressource]: r.actuel + 1 };
}

/** Payer un coût : la jauge après paiement, ou la raison du refus. */
export function payer(f: Fiche, cle: string, montant: number): Jauges | string {
  const j = jauge(f, cle);
  if (!j) return `Pas de ${cle} sur cette fiche.`;
  if (j.actuel < montant) return `Il faut ${montant} ${j.nom} (il en reste ${j.actuel}).`;
  return { [cle]: j.actuel - montant };
}

/** Les champs Firestore de la fiche pour ces jauges. */
export function champsJauges(j: Jauges): Record<string, number> {
  return Object.fromEntries(Object.entries(j).map(([k, v]) => [`refonte.jauges.${k}`, v]));
}
