import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaRencontre, type Rencontre } from '../schemas/rencontre';

/** MJ : les rencontres préparées (lot L3.5). Les règles les refusent aux joueurs. */
export function suivreRencontres(table: string): CollectionSuivie<Rencontre> {
  return suivreCollection(db, `tables/${table}/rencontres`, schemaRencontre);
}
