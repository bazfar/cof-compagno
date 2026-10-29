import { schemaAction, type Action, type Effet } from '../lib/schemas/effets';
import { schemaCombinaison, schemaFicheElement, type Combinaison, type FicheElement } from '../lib/schemas/elements';
import { COMBINAISONS } from './combinaisons';
import { schemaEtatRefonte, type EtatRefonte } from '../lib/schemas/etats';
import { schemaInvocation, type Invocation } from '../lib/schemas/invocations';
import { schemaClasseRefonte, schemaVoieRefonte, type ClasseRefonte, type VoieRefonte } from '../lib/schemas/classes';
import { ACTIONS_ARMES, ACTIONS_COMMUNES } from './armes';
import { ACTIONS_BARDE, BARDE, VOIES_BARDE } from './classes/barde';
import { ACTIONS_CHASSEUR, CHASSEUR, VOIES_CHASSEUR } from './classes/chasseur';
import { ACTIONS_CHEVALIER, CHEVALIER, VOIES_CHEVALIER } from './classes/chevalier';
import { ACTIONS_DRUIDE, DRUIDE, VOIES_DRUIDE } from './classes/druide';
import { ACTIONS_CHAOS, VOIES_CHAOS } from './classes/chaos';
import { CHANT } from './ecoles/chant';
import { NATURE } from './ecoles/nature';
import { ACTIONS_ENVOUTEUR, ENVOUTEUR, VOIES_ENVOUTEUR } from './classes/envouteur';
import { ACTIONS_GUERRIER, GUERRIER, VOIES_GUERRIER } from './classes/guerrier';
import { ACTIONS_MAGICIEN, MAGICIEN, VOIES_MAGICIEN } from './classes/magicien';
import { ACTIONS_MOINE, MOINE, VOIES_MOINE } from './classes/moine';
import { ACTIONS_NECROMANCIEN, NECROMANCIEN, VOIES_NECROMANCIEN } from './classes/necromancien';
import { MALEDICTION } from './ecoles/malediction';
import { OUTRE_TOMBE } from './ecoles/outre-tombe';
import { ACTIONS_PRETRE, PRETRE, VOIES_PRETRE } from './classes/pretre';
import { BANNISSEMENT, FOI, GUERISON, JUGEMENT } from './ecoles/cercles';
import { MINEURS } from './mineurs';
import { ABJURATION } from './ecoles/abjuration';
import { ENCHANTEMENT } from './ecoles/enchantement';
import { ILLUSION } from './ecoles/illusion';
import { INVOCATION } from './ecoles/invocation';
import { INVOCATIONS } from './invocations';
import { ELEMENTS_REFONTE } from './elements';
import { ETATS } from './etats';
import { EVOCATION } from './ecoles/evocation';
import { schemaNoeudVecu, type NoeudVecu } from '../lib/schemas/vecu';
import { NOEUDS_VECU, PREDILECTIONS_VECU, VECU_DES_CAPACITES_V1 } from './vecu';
import { EFFETS_ATTAQUES, ETATS_BESTIAIRE } from './monstres';
import { schemaEffetAttaqueMonstre, type EffetAttaqueMonstre } from '../lib/schemas/monstres';

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

/** Combinaisons signature (lot L4.10) : une par paire d'éléments, au plus. */
export const combinaisonParId: ReadonlyMap<string, Combinaison> = indexer(COMBINAISONS, (s) => schemaCombinaison.parse(s), 'Combinaison');
export const combinaisons: readonly Combinaison[] = [...combinaisonParId.values()];
const paires = combinaisons.map((c) => [...c.elements].sort().join('+'));
if (new Set(paires).size !== paires.length) throw new Error(`Deux signatures pour la même paire : ${paires.join(', ')}`);

export const invocationParId: ReadonlyMap<string, Invocation> = indexer(INVOCATIONS, (s) => schemaInvocation.parse(s), 'Invocation');

export const actionParId: ReadonlyMap<string, Action> = indexer([...EVOCATION, ...ABJURATION, ...INVOCATION, ...ILLUSION, ...ENCHANTEMENT, ...GUERISON, ...FOI, ...BANNISSEMENT, ...JUGEMENT, ...MINEURS, ...ACTIONS_MAGICIEN, ...ACTIONS_ENVOUTEUR, ...ACTIONS_PRETRE, ...ACTIONS_ARMES, ...ACTIONS_GUERRIER, ...CHANT, ...ACTIONS_BARDE, ...ACTIONS_CHEVALIER, ...ACTIONS_CHASSEUR, ...NATURE, ...ACTIONS_DRUIDE, ...ACTIONS_MOINE, ...OUTRE_TOMBE, ...MALEDICTION, ...ACTIONS_NECROMANCIEN, ...ACTIONS_CHAOS], (s) => schemaAction.parse(s), 'Action');

export const voieParId: ReadonlyMap<string, VoieRefonte> = indexer([...VOIES_MAGICIEN, ...VOIES_ENVOUTEUR, ...VOIES_PRETRE, ...VOIES_GUERRIER, ...VOIES_BARDE, ...VOIES_CHEVALIER, ...VOIES_CHASSEUR, ...VOIES_DRUIDE, ...VOIES_MOINE, ...VOIES_NECROMANCIEN, ...VOIES_CHAOS], (s) => schemaVoieRefonte.parse(s), 'Voie');
export const classeParId: ReadonlyMap<string, ClasseRefonte> = indexer([MAGICIEN, ENVOUTEUR, PRETRE, GUERRIER, BARDE, CHEVALIER, CHASSEUR, DRUIDE, MOINE, NECROMANCIEN], (s) => schemaClasseRefonte.parse(s), 'Classe');
/** Actions d'arme de toutes les classes (lot L4.7) : le profil les reçoit dans ses règles (Regles.actionsCommunes). */
export const actionsCommunes: readonly string[] = ACTIONS_COMMUNES;
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
    for (const etat of a.enForme ?? []) ou.push({ ou: `${a.id} (forme)`, etat });
    for (const [p, d] of Object.entries(a.paliers))
      for (const patch of Object.values(d?.effets ?? {}))
        if (typeof patch.etat === 'string') ou.push({ ou: `${a.id} (palier ${p})`, etat: patch.etat });
  }
  for (const inv of invocationParId.values())
    for (const c of inv.capacites) for (const etat of etatsCites(c.effets)) ou.push({ ou: `invocation ${inv.id}`, etat });
  for (const c of combinaisonParId.values()) for (const etat of etatsCites(c.effets)) ou.push({ ou: `combinaison ${c.id}`, etat });
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

/** Verbes d'une école, par rang croissant ; avec le passif qui tient lieu de verbe à un rang (Renfort macabre, lot L4.17). */
export function verbesDeLEcole(ecole: string): Action[] {
  return actions.filter((a) => (a.nature === 'verbe' || a.nature === 'passif') && a.ecole === ecole).sort((a, b) => a.rang - b.rang);
}

/**
 * Ce qu'une classe ou une voie cite et qui n'existe pas (lot L4.4b1) : voie
 * d'une classe, action d'un rang, sort mineur, école de création qui n'a pas
 * ses cinq verbes.
 */
export function referencesManquantes(): string[] {
  const manque: string[] = [];
  for (const a of actionsCommunes) if (!actionParId.has(a)) manque.push(`action commune ${a}`);
  for (const k of classeParId.values()) {
    for (const v of [...k.voies, ...k.voiesExclusives.flat()]) if (!voieParId.has(v)) manque.push(`voie ${v} (classe ${k.id})`);
    for (const m of k.mineurs.liste) if (actionParId.get(m)?.nature !== 'mineur') manque.push(`sort mineur ${m} (classe ${k.id})`);
    for (const a of k.actionsDeClasse) if (!actionParId.has(a)) manque.push(`action de classe ${a} (classe ${k.id})`);
    for (const e of k.creation.ecoles)
      if (verbesDeLEcole(e).map((a) => a.rang).join() !== '1,2,3,4,5') manque.push(`les cinq verbes de l'école ${e} (classe ${k.id})`);
  }
  for (const v of voieParId.values())
    for (const r of v.rangs) {
      for (const a of r.actions) if (!actionParId.has(a)) manque.push(`action ${a} (${v.id}, rang ${r.rang})`);
      // Une voie qui fixe son école (Cercles du Prêtre) doit trouver le verbe de son rang.
      for (const x of r.regles)
        if (x.type === 'verbeDeLEcole' && x.ecole && !verbesDeLEcole(x.ecole).some((a) => a.rang === r.rang)) manque.push(`verbe de rang ${r.rang} de ${x.ecole} (${v.id})`);
    }
  return manque;
}

/** Arbre du Vécu (lot L4.18). */
export const noeudVecuParId: ReadonlyMap<string, NoeudVecu> = indexer(NOEUDS_VECU, (s) => schemaNoeudVecu.parse(s), 'Nœud du Vécu');
export { PREDILECTIONS_VECU, VECU_DES_CAPACITES_V1 };

/** Ce que l'arbre du Vécu cite et qui n'existe pas : prérequis, nœuds offerts (tier 1), nœuds de la v1. */
export function referencesVecuManquantes(): string[] {
  const manque: string[] = [];
  for (const n of noeudVecuParId.values()) for (const p of n.prerequis) if (!noeudVecuParId.has(p)) manque.push(`prérequis ${p} (${n.id})`);
  for (const [k, id] of Object.entries(PREDILECTIONS_VECU)) {
    if (!classeParId.has(k)) manque.push(`classe ${k} (prédilection)`);
    if (noeudVecuParId.get(id)?.tier !== 1) manque.push(`nœud offert de tier 1 ${id} (${k})`);
  }
  for (const [k, id] of Object.entries(VECU_DES_CAPACITES_V1)) if (!noeudVecuParId.has(id)) manque.push(`nœud ${id} (capacité v1 ${k})`);
  return manque;
}

const manquantes = [...referencesManquantes(), ...referencesVecuManquantes()];
if (manquantes.length) throw new Error(`Références manquantes : ${manquantes.join(', ')}`);

// ---- Le bestiaire en combat (lot L6.6a) ----
/** Les effets des attaques du bestiaire traduits en données (6b), par `monstre|attaque`. */
export const effetsAttaquesMonstres: ReadonlyMap<string, EffetAttaqueMonstre> = new Map(Object.entries(EFFETS_ATTAQUES).map(([k, e]) => [k, schemaEffetAttaqueMonstre.parse(e)]));
/** Les états du bestiaire (v1) et leur état de la refonte. */
export { ETATS_BESTIAIRE };

/** Les états de la refonte que citent les effets d'attaque et la correspondance du bestiaire, inconnus du catalogue (vide). */
export function etatsDuBestiaireInconnus(etats: Readonly<Record<string, string>> = ETATS_BESTIAIRE, effets: Iterable<EffetAttaqueMonstre> = effetsAttaquesMonstres.values()): string[] {
  const cites = [...Object.values(etats), ...[...effets].flatMap((e) => (e.etats ?? []).map((x) => x.id))];
  return [...new Set(cites)].filter((id) => !etatParId.has(id));
}
