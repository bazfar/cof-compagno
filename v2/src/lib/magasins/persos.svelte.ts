import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaFiche, type Fiche } from '../schemas/fiche';

/**
 * Fiches de personnage de la table, en temps réel (lot L2.1). Une fiche
 * invalide est écartée et signalée, jamais affichée à moitié.
 */
export function suivrePersos(table: string): CollectionSuivie<Fiche> {
  return suivreCollection(db, `tables/${table}/persos`, schemaFiche);
}
