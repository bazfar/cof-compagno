import { schemaAction, type Action } from '../lib/schemas/effets';
import { EVOCATION } from './ecoles/evocation';

/*
 * Règles de la 2.0, écrites à la main (lot L4, décidé le 20/10/2026 : la
 * 2.0 bascule directement sur la refonte). Voir LISEZMOI.md.
 *
 * Chaque action est validée au chargement par le schéma (valeurs par
 * défaut comprises) : une règle mal écrite casse les tests avant le build,
 * jamais une séance.
 */

function indexer(saisies: readonly unknown[]): Map<string, Action> {
  const index = new Map<string, Action>();
  for (const s of saisies) {
    const a = schemaAction.parse(s);
    if (index.has(a.id)) throw new Error(`Action en double : ${a.id}`);
    index.set(a.id, a);
  }
  return index;
}

export const actionParId: ReadonlyMap<string, Action> = indexer([...EVOCATION]);
export const actions: readonly Action[] = [...actionParId.values()];

/** Verbes d'une école, par rang croissant. */
export function verbesDeLEcole(ecole: string): Action[] {
  return actions.filter((a) => a.nature === 'verbe' && a.ecole === ecole).sort((a, b) => a.rang - b.rang);
}
