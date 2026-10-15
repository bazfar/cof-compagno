import { db } from '../firebase/client';
import { suivreCollection, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaJoueur, type Joueur } from '../schemas/acces';

/** Joueurs inscrits à la table, en temps réel. */
export function suivreJoueurs(table: string): CollectionSuivie<Joueur> {
  return suivreCollection(db, `tables/${table}/joueurs`, schemaJoueur);
}
