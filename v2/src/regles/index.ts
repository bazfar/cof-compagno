import { schemaAction, type Action, type Effet } from '../lib/schemas/effets';
import { schemaFicheElement, type FicheElement } from '../lib/schemas/elements';
import { schemaEtatRefonte, type EtatRefonte } from '../lib/schemas/etats';
import { schemaInvocation, type Invocation } from '../lib/schemas/invocations';
import { schemaClasseRefonte, schemaVoieRefonte, type ClasseRefonte, type VoieRefonte } from '../lib/schemas/classes';
import { ACTIONS_ENVOUTEUR, ENVOUTEUR, VOIES_ENVOUTEUR } from './classes/envouteur';
import { ACTIONS_MAGICIEN, MAGICIEN, VOIES_MAGICIEN } from './classes/magicien';
import { MINEURS } from './mineurs';
import { ABJURATION } from './ecoles/abjuration';
import { ENCHANTEMENT } from './ecoles/enchantement';
import { ILLUSION } from './ecoles/illusion';
import { INVOCATION } from './ecoles/invocation';
import { INVOCATIONS } from './invocations';
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

export const invocationParId: ReadonlyMap<string, Invocation> = indexer(INVOCATIONS, (s) => schemaInvocation.parse(s), 'Invocation');

export const actionParId: ReadonlyMap<string, Action> = indexer([...EVOCATION, ...ABJURATION, ...INVOCATION, ...ILLUSION, ...ENCHANTEMENT, ...MINEURS, ...ACTIONS_MAGICIEN, ...ACTIONS_ENVOUTEUR], (s) => schemaAction.parse(s), 'Action');

export const voieParId: ReadonlyMap<string, VoieRefonte> = indexer([...VOIES_MAGICIEN, ...VOIES_ENVOUTEUR], (s) => schemaVoieRefonte.parse(s), 'Voie');
export const classeParId: ReadonlyMap<string, ClasseRefonte> = indexer([MAGICIEN, ENVOUTEUR], (s) => schemaClasseRefonte.parse(s), 'Classe');
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
  for (const inv of invocationParId.values())
    for (const c of inv.capacites) for (const etat of etatsCites(c.effets)) ou.push({ ou: `invocation ${inv.id}`, etat });
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

/**
 * Créatures que les actions invoquent, à chaque palier : `<creature>.<élément>`
 * pour les sept éléments quand l'invocation dépend de l'élément (lot L4.4a).
 */
export function invocationsCitees(): { ou: string; creature: string }[] {
  const ou: { ou: string; creature: string }[] = [];
  for (const a of actions) {
    const deltas = Object.values(a.paliers).flatMap((d) => [...(d?.ajoute ?? []), ...Object.values(d?.effets ?? {})]);
    for (const e of [...a.effets, ...deltas] as { creature?: unknown; parElement?: unknown }[]) {
      if (typeof e.creature !== 'string') continue;
      const ids = e.parElement === true ? [...elementParId.keys()].map((el) => `${e.creature}.${el}`) : [e.creature];
      for (const creature of ids) ou.push({ ou: a.id, creature });
    }
  }
  return ou;
}

const sansCreature = invocationsCitees().filter((c) => !invocationParId.has(c.creature));
if (sansCreature.length) throw new Error(`Invocations inconnues : ${sansCreature.map((c) => `${c.creature} (${c.ou})`).join(', ')}`);

/** Verbes d'une école, par rang croissant. */
export function verbesDeLEcole(ecole: string): Action[] {
  return actions.filter((a) => a.nature === 'verbe' && a.ecole === ecole).sort((a, b) => a.rang - b.rang);
}

/**
 * Ce qu'une classe ou une voie cite et qui n'existe pas (lot L4.4b1) : voie
 * d'une classe, action d'un rang, sort mineur, école de création qui n'a pas
 * ses cinq verbes.
 */
export function referencesManquantes(): string[] {
  const manque: string[] = [];
  for (const k of classeParId.values()) {
    for (const v of [...k.voies, ...k.voiesExclusives.flat()]) if (!voieParId.has(v)) manque.push(`voie ${v} (classe ${k.id})`);
    for (const m of k.mineurs.liste) if (actionParId.get(m)?.nature !== 'mineur') manque.push(`sort mineur ${m} (classe ${k.id})`);
    for (const e of k.creation.ecoles)
      if (verbesDeLEcole(e).map((a) => a.rang).join() !== '1,2,3,4,5') manque.push(`les cinq verbes de l'école ${e} (classe ${k.id})`);
  }
  for (const v of voieParId.values()) for (const r of v.rangs) for (const a of r.actions) if (!actionParId.has(a)) manque.push(`action ${a} (${v.id}, rang ${r.rang})`);
  return manque;
}

const manquantes = referencesManquantes();
if (manquantes.length) throw new Error(`Références manquantes : ${manquantes.join(', ')}`);
