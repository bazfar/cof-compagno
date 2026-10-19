import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaButin, type Butin } from '../schemas/butin';

/** Les butins de la table (lot L3.4), les 40 derniers : votes en cours et derniers attribués. */
export function suivreButins(table: string): CollectionSuivie<Butin> {
  return suivreCollection(db, `tables/${table}/butins`, schemaButin, undefined, { champ: 'creeLe', sens: 'desc', limite: 40 });
}
