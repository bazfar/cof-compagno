import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaCombat, schemaCombattant, type Combat, type Combattant } from '../schemas/combat';

/** Toute la table : le combat (lot L6.1). */
export function suivreCombat(table: string, id: string): DocumentSuivi<Combat> {
  return suivreDocument(db, `tables/${table}/combats/${id}`, schemaCombat);
}

/** Toute la table : ses combattants, un document par jeton. */
export function suivreCombattants(table: string, id: string): CollectionSuivie<Combattant> {
  return suivreCollection(db, `tables/${table}/combats/${id}/combattants`, schemaCombattant);
}
