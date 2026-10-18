import { db } from '../firebase/client';
import { suivreCollection, type AvecId, type CollectionSuivie } from '../firebase/suivre.svelte';
import { schemaDon, type Don } from '../schemas/don';

/**
 * Les dons d'un joueur (lot L3.3) : ceux qu'il a faits et ceux qu'il a
 * reçus. Deux requêtes, que les règles Firestore savent prouver (une
 * lecture de toute la collection serait refusée en bloc).
 */
export function suivreMesDons(table: string, uid: string): CollectionSuivie<Don> {
  const chemin = `tables/${table}/dons`;
  const faits = suivreCollection(db, chemin, schemaDon, { champ: 'deUid', egal: uid });
  const recus = suivreCollection(db, chemin, schemaDon, { champ: 'aUid', egal: uid });
  const etat = {
    get elements(): AvecId<Don>[] {
      const parId = new Map<string, AvecId<Don>>();
      for (const d of [...faits.etat.elements, ...recus.etat.elements]) parId.set(d.id, d);
      return [...parId.values()];
    },
    get pret() {
      return faits.etat.pret && recus.etat.pret;
    },
    get erreur() {
      return faits.etat.erreur ?? recus.etat.erreur;
    },
  };
  return {
    etat,
    arreter: () => {
      faits.arreter();
      recus.arreter();
    },
  };
}
