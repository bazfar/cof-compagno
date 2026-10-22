import { db } from '../firebase/client';
import { suivreCollection, suivreDocument, type CollectionSuivie, type DocumentSuivi } from '../firebase/suivre.svelte';
import { schemaGesteAttitude, schemaPnj, type GesteAttitudeEnregistre, type Pnj } from '../schemas/pnj';
import { schemaReputationGroupe, type ReputationGroupe } from '../schemas/reputation';

/** MJ : tous les PNJ, rencontrés ou non (lot S1). */
export function suivrePnjMj(table: string): CollectionSuivie<Pnj> {
  return suivreCollection(db, `tables/${table}/pnj`, schemaPnj);
}

/** Joueur : les PNJ rencontrés seulement, la seule requête que les règles laissent passer (6a, 7a). */
export function suivrePnjJoueur(table: string): CollectionSuivie<Pnj> {
  return suivreCollection(db, `tables/${table}/pnj`, schemaPnj, { champ: 'rencontre', egal: true });
}

/** MJ : les 20 derniers changements d'attitude d'un PNJ, avec leur motif. */
export function suivreHistoriquePnj(table: string, id: string): CollectionSuivie<GesteAttitudeEnregistre> {
  return suivreCollection(db, `tables/${table}/pnj/${id}/historique`, schemaGesteAttitude, undefined, { champ: 'creeLe', sens: 'desc', limite: 20 });
}

/** Toute la table : la réputation du groupe (un score par faction). */
export function suivreReputation(table: string): DocumentSuivi<ReputationGroupe> {
  return suivreDocument(db, `tables/${table}/reputation/groupe`, schemaReputationGroupe);
}
