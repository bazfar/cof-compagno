import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaImportV1, type ImportV1 } from '../schemas/import-v1';

/** MJ : toutes les fiches v1 déposées à la table (lot L2.2c). */
export function suivreImports(table: string): CollectionSuivie<ImportV1> {
  return suivreCollection(db, `tables/${table}/importsV1`, schemaImportV1);
}

/** Joueur : les fiches v1 que le MJ lui a attribuées (les règles ne lui laissent lire que celles-là). */
export function suivreMesImports(table: string, uid: string): CollectionSuivie<ImportV1> {
  return suivreCollection(db, `tables/${table}/importsV1`, schemaImportV1, { champ: 'proprietaireUid', egal: uid });
}
