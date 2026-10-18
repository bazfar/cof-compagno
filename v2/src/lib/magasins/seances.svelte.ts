import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaSeance, type Seance } from '../schemas/seance';

/** Les séances de la table (lot L3.1), les 20 dernières par numéro. */
export function suivreSeances(table: string): CollectionSuivie<Seance> {
  return suivreCollection(db, `tables/${table}/seances`, schemaSeance, undefined, { champ: 'numero', sens: 'desc', limite: 20 });
}
