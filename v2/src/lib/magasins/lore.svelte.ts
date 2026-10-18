import { db } from '../firebase/client';
import { suivreCollection, type AvecId, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaFicheLoreJoueurs, schemaFicheLoreMj, TOUS, type FicheLoreJoueurs, type FicheLoreMj } from '../schemas/lore';

/** MJ : toutes les fiches complètes, passages scellés compris (lot L2.7a). */
export function suivreLoreMj(table: string): CollectionSuivie<FicheLoreMj> {
  return suivreCollection(db, `tables/${table}/loreMj`, schemaFicheLoreMj);
}

/**
 * Joueur : les fiches qu'il a le droit de lire. Deux requêtes, que les
 * règles Firestore savent prouver (une lecture de toute la collection
 * serait refusée en bloc) : `lecteurs` contient son uid, et `lecteurs`
 * contient « * » (partagées à tous).
 */
export function suivreLoreJoueur(table: string, uid: string): CollectionSuivie<FicheLoreJoueurs> {
  const chemin = `tables/${table}/lore`;
  const siennes = suivreCollection(db, chemin, schemaFicheLoreJoueurs, { champ: 'lecteurs', contient: uid });
  const communes = suivreCollection(db, chemin, schemaFicheLoreJoueurs, { champ: 'lecteurs', contient: TOUS });
  const etat = {
    get elements(): AvecId<FicheLoreJoueurs>[] {
      const parId = new Map<string, AvecId<FicheLoreJoueurs>>();
      for (const f of [...communes.etat.elements, ...siennes.etat.elements]) parId.set(f.id, f);
      return [...parId.values()];
    },
    get pret() {
      return siennes.etat.pret && communes.etat.pret;
    },
    get erreur() {
      return siennes.etat.erreur ?? communes.etat.erreur;
    },
  };
  return {
    etat,
    arreter: () => {
      siennes.arreter();
      communes.arreter();
    },
  };
}
