import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { schemaImportV1 } from '../schemas/import-v1';
import { session } from '../session.svelte';

/*
 * Fiches v1 déposées par le MJ (lot L2.2c). Seul endroit qui écrit dans
 * tables/{table}/importsV1.
 */

const chemin = (id: string) => `tables/${session.table}/importsV1/${id}`;

export function nouvelIdImport(): string {
  return `v1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** MJ : dépose une fiche v1 (texte JSON tel qu'exporté) pour un joueur de la table. */
export async function deposerImportV1(id: string, donnees: { proprietaireUid: string; nom: string; v1Json: string }): Promise<void> {
  await setDoc(doc(db, chemin(id)), schemaImportV1.parse({ ...donnees, importeLe: Date.now() }));
}

/** MJ : retire une fiche déposée (erreur d'attribution…). */
export async function supprimerImportV1(id: string): Promise<void> {
  await deleteDoc(doc(db, chemin(id)));
}

/** Joueur : la fiche a été reprise ; seul `reprisPar` est écrit. */
export async function marquerImportRepris(id: string, idPerso: string): Promise<void> {
  await updateDoc(doc(db, chemin(id)), { reprisPar: idPerso });
}
