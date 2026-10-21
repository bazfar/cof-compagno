import { schemaAction, type Action, type Effet } from '../lib/schemas/effets';
import { schemaFicheElement, type FicheElement } from '../lib/schemas/elements';
import { schemaEtatRefonte, type EtatRefonte } from '../lib/schemas/etats';
import { ELEMENTS_REFONTE } from './elements';
import { ETATS } from './etats';
import { EVOCATION } from './ecoles/evocation';

/*
 * Règles de la 2.0, écrites à la main (lot L4, décidé le 20/10/2026 : la
 * 2.0 bascule directement sur la refonte). Voir LISEZMOI.md.
 *
 * Tout est validé au chargement par les schémas (valeurs par défaut
 * comprises), et chaque état cité par une action ou un élément doit exister
 * dans le catalogue (L4.2) : une règle mal écrite casse les tests avant le
 * build, jamais une séance.
 */

function indexer<T extends { id: string }>(saisies: readonly unknown[], lire: (s: unknown) => T, quoi: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const s of saisies) {
    const x = lire(s);
    if (index.has(x.id)) throw new Error(`${quoi} en double : ${x.id}`);
    index.set(x.id, x);
  }
  return index;
}

export const etatParId: ReadonlyMap<string, EtatRefonte> = indexer(ETATS, (s) => schemaEtatRefonte.parse(s), 'État');
export const etatsRefonte: readonly EtatRefonte[] = [...etatParId.values()];

export const elementParId: ReadonlyMap<string, FicheElement> = indexer(ELEMENTS_REFONTE, (s) => schemaFicheElement.parse(s), 'Élément');

export const actionParId: ReadonlyMap<string, Action> = indexer([...EVOCATION], (s) => schemaAction.parse(s), 'Action');
export const actions: readonly Action[] = [...actionParId.values()];

/** Identifiants d'états cités par une liste d'effets. */
export function etatsCites(effets: readonly Effet[]): string[] {
  return effets.flatMap((e) => (e.type === 'etat' ? [e.etat] : e.type === 'retraitEtat' ? e.etats : []));
}

/** Tous les endroits qui citent un état, pour la vérification croisée. */
export function citationsDEtats(): { ou: string; etat: string }[] {
  const ou: { ou: string; etat: string }[] = [];
  for (const a of actions) {
    const deltas = [a.paliers.II?.ajoute ?? [], a.paliers.III?.ajoute ?? []].flat();
    for (const etat of etatsCites([...a.effets, ...deltas])) ou.push({ ou: a.id, etat });
    for (const [p, d] of Object.entries(a.paliers))
      for (const patch of Object.values(d?.effets ?? {}))
        if (typeof patch.etat === 'string') ou.push({ ou: `${a.id} (palier ${p})`, etat: patch.etat });
  }
  for (const el of elementParId.values())
    for (const volet of [el.sort, el.derapage])
      for (const etat of etatsCites([...volet.effets, ...volet.auChoix])) ou.push({ ou: `élément ${el.id}`, etat });
  return ou;
}

/** Les citations dont l'état n'est pas au catalogue. */
export function etatsInconnus(citations: readonly { ou: string; etat: string }[], catalogue: ReadonlyMap<string, unknown>): { ou: string; etat: string }[] {
  return citations.filter((c) => !catalogue.has(c.etat));
}

const inconnus = etatsInconnus(citationsDEtats(), etatParId);
if (inconnus.length) throw new Error(`États inconnus : ${inconnus.map((c) => `${c.etat} (${c.ou})`).join(', ')}`);

/** Verbes d'une école, par rang croissant. */
export function verbesDeLEcole(ecole: string): Action[] {
  return actions.filter((a) => a.nature === 'verbe' && a.ecole === ecole).sort((a, b) => a.rang - b.rang);
}
