import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaFiche, type Fiche } from '../schemas/fiche';
import { schemaPortrait, type Portrait } from '../schemas/portrait';

/**
 * Fiches de personnage de la table, en temps réel (lot L2.1). Une fiche
 * invalide est écartée et signalée, jamais affichée à moitié.
 */
export function suivrePersos(table: string): CollectionSuivie<Fiche> {
  return suivreCollection(db, `tables/${table}/persos`, schemaFiche);
}

/** Portrait d'un personnage (L2.3), en temps réel ; `donnees` vaut null s'il n'y en a pas. */
export function suivrePortrait(table: string, idPerso: string): DocumentSuivi<Portrait> {
  return suivreDocument(db, `tables/${table}/persos/${idPerso}/images/portrait`, schemaPortrait);
}
