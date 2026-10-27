import { actionParId } from '../../regles/index.ts';
import { classeDeLaRefonte, contexteDe, profilDe } from '../fiche/refonte.ts';
import type { Action } from '../schemas/effets.ts';
import type { Fiche } from '../schemas/fiche.ts';

/*
 * Les passifs qui se déclenchent en combat (lot L6.5a, décision 12a de
 * Thomas du 26/10/2026) : l'app les applique d'office quand l'événement
 * arrive ; ce que le moteur ne sait pas faire va au journal, pour le MJ.
 * Les réactions (un choix du joueur) viendront avec L6.5b.
 * Aujourd'hui, les données en ont deux, sur « un ennemi abattu » : Soif de
 * sang (le Guerrier du chaos, dès 5 de Corruption d'Âme, que le moteur
 * vérifie) et Sang impie (le Nécromancien, seulement quand un sort de sang
 * abat l'ennemi : la condition est dans son texte, elle est lue ici).
 */

export type EvenementPassif = { quoi: 'ennemiAbattu'; parSortDeSang: boolean };

/** Les passifs à condition écrite dans leur texte (src/regles) : ce qu'il faut à l'événement. */
const CONDITIONS: Readonly<Record<string, (e: EvenementPassif) => boolean>> = {
  'necromancien.sang-impie': (e) => e.parSortDeSang,
};

/** Les passifs de ce personnage que cet événement déclenche. */
export function passifsDeclenches(f: Fiche, e: EvenementPassif): Action[] {
  if (f.schemaVersion !== 2) return [];
  const classe = classeDeLaRefonte(f.refonte.classe);
  if (!classe) return [];
  const p = profilDe(classe, f.refonte, contexteDe(f, classe));
  const ids = [...new Set([...classe.actionsDeClasse, ...p.actions])];
  return ids.flatMap((id) => {
    const a = actionParId.get(id);
    if (!a || a.nature !== 'passif' || a.declencheur !== e.quoi) return [];
    return (CONDITIONS[a.id] ?? (() => true))(e) ? [a] : [];
  });
}

/** Un sort de sang : de l'école du sang, ou porté par l'élément sang. */
export function estDeSang(a: Pick<Action, 'ecole'>, element: string | null): boolean {
  return a.ecole === 'sang' || element === 'sang';
}
