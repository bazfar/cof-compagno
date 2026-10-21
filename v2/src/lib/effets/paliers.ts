import { schemaAction, type Action, type DeltaPalier, type Palier } from '../schemas/effets';

/*
 * Paliers des verbes (lot L4.1 ; doc de cadre, « Magicien » et « Structure
 * d'un sort », validés) :
 *   - un verbe appris au rang X de la voie de son école est au palier I ;
 *     il passe au palier II deux rangs plus tard, au III encore deux rangs
 *     après (Missile R1 : II au rang 3, III au rang 5) ;
 *   - les paliers n'existent que dans la voie de l'école : un verbe appris
 *     hors voie (grimoire) reste au palier I ;
 *   - II et III sont écrits en deltas du palier I, appliqués dans l'ordre.
 */

const ORDRE: Palier[] = ['I', 'II', 'III'];

/** Rang de voie qui débloque ce palier du verbe. */
export function rangDeblocage(action: Pick<Action, 'rang'>, palier: Palier): number {
  return action.rang + 2 * ORDRE.indexOf(palier);
}

/** Les paliers que le verbe définit, dans l'ordre. */
export function paliersDefinis(action: Pick<Action, 'paliers'>): Palier[] {
  const p: Palier[] = ['I'];
  if (action.paliers.II) p.push('II');
  if (action.paliers.II && action.paliers.III) p.push('III');
  return p;
}

/**
 * Palier atteint par un lanceur : le plus haut palier défini dont le rang de
 * déblocage est atteint dans la voie de l'école. Hors voie : palier I.
 */
export function palierAtteint(action: Pick<Action, 'rang' | 'paliers'>, rangVoie: number, dansLaVoie: boolean): Palier {
  if (!dansLaVoie) return 'I';
  let atteint: Palier = 'I';
  for (const p of paliersDefinis(action)) if (rangDeblocage(action, p) <= rangVoie) atteint = p;
  return atteint;
}

/** Palier immédiatement supérieur défini, ou null. */
export function palierSuivant(action: Pick<Action, 'paliers'>, palier: Palier): Palier | null {
  const definis = paliersDefinis(action);
  return definis[definis.indexOf(palier) + 1] ?? null;
}

function appliquerDelta(a: Record<string, unknown>, d: DeltaPalier, id: string, palier: Palier): Record<string, unknown> {
  const r: Record<string, unknown> = { ...a };
  const fusion = (cle: 'ciblage' | 'resolution' | 'persistance', valeur: object | undefined) => {
    if (valeur) r[cle] = { ...(a[cle] as object), ...valeur };
  };
  fusion('ciblage', d.ciblage);
  fusion('resolution', d.resolution);
  fusion('persistance', d.persistance);
  if (d.zone === null) r.zone = null;
  else if (d.zone) r.zone = { ...((a.zone as object | null) ?? {}), ...d.zone };
  if (d.element) r.element = d.element;
  const effets = [...(a.effets as Record<string, unknown>[])];
  for (const [i, patch] of Object.entries(d.effets ?? {})) {
    const n = Number(i);
    const effet = effets[n];
    if (!effet) throw new Error(`${id}, palier ${palier} : l'effet ${n} n'existe pas au palier précédent`);
    if ('type' in patch && patch.type !== effet.type) throw new Error(`${id}, palier ${palier} : un delta ne change pas le type d'un effet`);
    effets[n] = { ...effet, ...patch };
  }
  r.effets = [...effets, ...(d.ajoute ?? [])];
  return r;
}

/**
 * L'action telle qu'elle est au palier demandé, deltas appliqués, sans ses
 * paliers. Elle est revalidée : un delta qui casse l'action lève une erreur
 * (les tests des règles résolvent chaque palier de chaque verbe).
 */
export function actionAuPalier(action: Action, palier: Palier): Action {
  if (!paliersDefinis(action).includes(palier)) throw new Error(`${action.id} n'a pas de palier ${palier}`);
  let brut: Record<string, unknown> = { ...action, paliers: {} };
  if (palier !== 'I') brut = appliquerDelta(brut, action.paliers.II!, action.id, 'II');
  if (palier === 'III') brut = appliquerDelta(brut, action.paliers.III!, action.id, 'III');
  return schemaAction.parse(brut);
}

/** Texte de l'usage hors combat au palier donné (le dernier défini s'il en a moins). */
export function horsCombatAuPalier(action: Pick<Action, 'horsCombat'>, palier: Palier): string | null {
  const textes = action.horsCombat?.paliers;
  if (!textes) return null;
  return textes[Math.min(ORDRE.indexOf(palier), textes.length - 1)] ?? null;
}
