import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaJetJournal, type JetJournal } from '../schemas/journal';

/** Nombre de jets montrés : les plus récents. */
export const JETS_MONTRES = 40;

/** Journal de dés commun (L2.5), en temps réel, du plus récent au plus ancien. */
export function suivreJournal(table: string): CollectionSuivie<JetJournal> {
  return suivreCollection(db, `tables/${table}/journal`, schemaJetJournal, undefined, { champ: 'creeLe', sens: 'desc', limite: JETS_MONTRES });
}
