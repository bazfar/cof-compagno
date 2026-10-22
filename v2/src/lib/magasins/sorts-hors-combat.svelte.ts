import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaDemandeSort, type DemandeSort } from '../schemas/sort-hors-combat';

/** MJ : toutes les demandes de sorts hors combat (lot G2a). */
export function suivreDemandesSortsMj(table: string): CollectionSuivie<DemandeSort> {
  return suivreCollection(db, `tables/${table}/sortsHorsCombat`, schemaDemandeSort);
}

/** Joueur : ses demandes, la seule requête que les règles laissent passer. */
export function suivreMesDemandesSorts(table: string, uid: string): CollectionSuivie<DemandeSort> {
  return suivreCollection(db, `tables/${table}/sortsHorsCombat`, schemaDemandeSort, { champ: 'uid', egal: uid });
}
