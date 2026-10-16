import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaDessin, schemaEtatScene, schemaJeton, schemaTable, type Dessin, type EtatSceneDoc, type Jeton, type TableDoc } from '../schemas/carte';

/*
 * Lectures en temps réel de la battlemap (lot L5.3). Chaque fonction rend
 * un état réactif et une fonction `arreter` à appeler quand l'écran se
 * ferme ou que la scène change.
 */

/** Document de la table : quelle scène le MJ montre. */
export function suivreTable(table: string): DocumentSuivi<TableDoc> {
  return suivreDocument(db, `tables/${table}`, schemaTable);
}

/** État partagé d'une scène : portes, exploration. */
export function suivreEtatScene(table: string, scene: string): DocumentSuivi<EtatSceneDoc> {
  return suivreDocument(db, `tables/${table}/scenes/${scene}`, schemaEtatScene);
}

/** Jetons d'une scène. */
export function suivreJetons(table: string, scene: string): CollectionSuivie<Jeton> {
  return suivreCollection(db, `tables/${table}/scenes/${scene}/jetons`, schemaJeton);
}

/** Murs, obstacles et portes tracés par le MJ sur une scène (L5.4). */
export function suivreDessins(table: string, scene: string): CollectionSuivie<Dessin> {
  return suivreCollection(db, `tables/${table}/scenes/${scene}/dessins`, schemaDessin);
}
