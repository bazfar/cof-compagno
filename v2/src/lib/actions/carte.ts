import { deleteDoc, deleteField, doc, increment, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { GrilleExploration } from '../battlemap/exploration';
import type { Case, Point } from '../battlemap/geometrie';
import type { TypeDessin } from '../battlemap/dessins';
import { db } from '../firebase/client';
import { schemaDessin, schemaEtatScene, schemaJeton, type Jeton } from '../schemas/carte';
import { session } from '../session.svelte';

/*
 * Écritures de la battlemap (lot L5.3). Seul endroit qui écrit les jetons,
 * les portes, l'exploration et la scène montrée. Chaque action ne touche que
 * les champs concernés : deux clients qui agissent en même temps ne
 * s'écrasent pas (bug de la v1).
 *
 * Les règles Firestore vérifient les DROITS (un joueur ne bouge que ses
 * jetons, ne touche qu'aux portes…) ; les règles de JEU (murs, portes
 * fermées, case occupée) sont appliquées avant l'appel, par les calculs de
 * src/lib/battlemap, comme en v1 : Firestore ne connaît pas la géométrie.
 */

const cheminScene = (scene: string) => `tables/${session.table}/scenes/${scene}`;
const cheminJeton = (scene: string, id: string) => `${cheminScene(scene)}/jetons/${id}`;

/** Identifiant du jeton de PJ d'un joueur : un seul par joueur et par scène. */
export const idJetonPJ = (uid: string) => `pj-${uid}`;

/** MJ : scène montrée à toute la table (null = aucune). */
export async function montrerScene(scene: string | null): Promise<void> {
  await setDoc(doc(db, 'tables', session.table), { sceneActive: scene }, { merge: true });
}

/** Pose un jeton. Un joueur ne peut poser que son propre PJ (règles Firestore). */
export async function poserJeton(scene: string, id: string, jeton: Omit<Jeton, 'creeLe'>): Promise<void> {
  await setDoc(doc(db, cheminJeton(scene, id)), schemaJeton.parse({ ...jeton, creeLe: Date.now() }));
}

/** Déplace un jeton : seuls cx et cy changent. */
export async function deplacerJeton(scene: string, id: string, vers: Case): Promise<void> {
  await updateDoc(doc(db, cheminJeton(scene, id)), { cx: vers.cx, cy: vers.cy });
}

/** MJ : marque un monstre mort ou le ranime. */
export async function marquerMort(scene: string, id: string, mort: boolean): Promise<void> {
  await updateDoc(doc(db, cheminJeton(scene, id)), { mort });
}

/** MJ (ou le propriétaire du jeton) : retire un jeton de la carte. */
export async function retirerJeton(scene: string, id: string): Promise<void> {
  await deleteDoc(doc(db, cheminJeton(scene, id)));
}

/**
 * Ouvre ou ferme une porte. N'importe quel membre de la table, à toute
 * distance (décision 3b, comme en v1). Seule la clé de cette porte change :
 * deux portes basculées en même temps par deux joueurs ne s'écrasent pas.
 */
export async function basculerPorte(scene: string, porte: string, ouverte: boolean): Promise<void> {
  await setDoc(doc(db, cheminScene(scene)), { portesOuvertes: { [porte]: ouverte } }, { merge: true });
}

/**
 * MJ : ajoute à l'exploration partagée ce que `locale` a vu. Fusion par OU
 * dans une transaction : rien de ce qui est déjà enregistré ne se perd, même
 * si deux écritures se croisent. N'écrit rien si rien de nouveau.
 */
export async function enregistrerExploration(scene: string, colonnes: number, lignes: number, locale: GrilleExploration): Promise<void> {
  const ref = doc(db, cheminScene(scene));
  await runTransaction(db, async (tx) => {
    const instantane = await tx.get(ref);
    const actuel = schemaEtatScene.safeParse(instantane.exists() ? instantane.data() : {});
    const texte = actuel.success ? actuel.data.exploration : undefined;
    const enBase = texte ? GrilleExploration.depuisTexte(colonnes, lignes, texte) : new GrilleExploration(colonnes, lignes);
    const fusion = enBase.fusionner(locale);
    const nouveau = fusion.versTexte();
    if (nouveau !== texte) tx.set(ref, { exploration: nouveau }, { merge: true });
  });
}

/** MJ : « Réinitialiser » — plus rien d'exploré, chez tout le monde. */
export async function reinitialiserExploration(scene: string): Promise<void> {
  await setDoc(doc(db, cheminScene(scene)), { exploration: deleteField(), explorationRaz: increment(1) }, { merge: true });
}

/** MJ : « Tout révéler » — toute la scène est explorée. */
export async function toutReveler(scene: string, colonnes: number, lignes: number): Promise<void> {
  await setDoc(doc(db, cheminScene(scene)), { exploration: GrilleExploration.pleine(colonnes, lignes).versTexte() }, { merge: true });
}

/**
 * MJ : trace un mur, un obstacle ou une porte (lot L5.4). `tours` fait d'un
 * mur un mur de force. Un document par dessin, identifiant unique.
 */
export async function tracerDessin(
  scene: string,
  type: TypeDessin,
  a: Point,
  b: Point,
  options: { tours?: number; lanceur?: string | null } = {},
): Promise<void> {
  const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dessin = schemaDessin.parse({
    type,
    ax: a[0], ay: a[1], bx: b[0], by: b[1],
    ...(type === 'porte' ? { ouverte: false } : {}),
    ...(type === 'mur' && options.tours ? { tours: options.tours, lanceur: options.lanceur ?? null } : {}),
    creeLe: Date.now(),
  });
  await setDoc(doc(db, `${cheminScene(scene)}/dessins/${id}`), dessin);
}

/** MJ : efface un dessin, chez tout le monde. */
export async function effacerDessin(scene: string, id: string): Promise<void> {
  await deleteDoc(doc(db, `${cheminScene(scene)}/dessins/${id}`));
}

/** Message lisible pour une écriture refusée. */
export function messageErreurCarte(erreur: unknown): string {
  if (typeof erreur === 'object' && erreur !== null && 'code' in erreur && erreur.code === 'permission-denied') {
    return "Action refusée : tu n'as pas le droit de faire ça.";
  }
  return erreur instanceof Error ? erreur.message : String(erreur);
}
