import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaCombat, schemaCombattant, type Combat, type Combattant } from '../schemas/combat';
import { schemaDemandeReaction, schemaOpportunite, type DemandeReaction, type Opportunite } from '../schemas/reactions';
import { schemaRemous, type Remous } from '../schemas/remous';

/** Toute la table : le combat (lot L6.1). */
export function suivreCombat(table: string, id: string): DocumentSuivi<Combat> {
  return suivreDocument(db, `tables/${table}/combats/${id}`, schemaCombat);
}

/** Toute la table : ses combattants, un document par jeton. */
export function suivreCombattants(table: string, id: string): CollectionSuivie<Combattant> {
  return suivreCollection(db, `tables/${table}/combats/${id}/combattants`, schemaCombattant);
}

/** L6.5b (1a) : les demandes de réaction, que le client du MJ joue ; le joueur y lit ce qu'il en est advenu. */
export function suivreReactions(table: string, id: string): CollectionSuivie<DemandeReaction> {
  return suivreCollection(db, `tables/${table}/combats/${id}/reactions`, schemaDemandeReaction);
}

/** L6.5b (2b) : les attaques d'opportunité ouvertes. */
export function suivreOpportunites(table: string, id: string): CollectionSuivie<Opportunite> {
  return suivreCollection(db, `tables/${table}/combats/${id}/opportunites`, schemaOpportunite);
}

/** L6.7b (5a) : toute la table : la jauge de Remous d'une scène. */
export function suivreRemous(table: string, scene: string): DocumentSuivi<Remous> {
  return suivreDocument(db, `tables/${table}/remous/${scene}`, schemaRemous);
}
