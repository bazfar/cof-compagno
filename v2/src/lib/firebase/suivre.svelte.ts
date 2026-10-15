import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import type { z } from 'zod';

export type AvecId<T> = T & { id: string };

export interface CollectionSuivie<T> {
  /** État réactif : tout composant qui le lit se redessine seul à chaque changement. */
  readonly etat: { elements: AvecId<T>[]; pret: boolean; erreur: string | null };
  /** Coupe l'abonnement Firestore (à appeler quand l'écran disparaît). */
  arreter: () => void;
}

/**
 * Suit une collection Firestore en temps réel et la valide document par
 * document avec un schéma Zod.
 *
 * Pourquoi la validation : en v1, une fiche mal formée cassait l'affichage
 * sans bruit. Ici, un document invalide est écarté et signalé en console,
 * il ne peut pas propager de valeurs fausses dans l'interface.
 *
 * Pourquoi pas de liste d'écrans à rafraîchir : `etat` est un état Svelte.
 * Les écrans qui le lisent se mettent à jour d'eux-mêmes, y compris pour une
 * modification faite par un autre client (le MJ qui donne un objet…).
 */
export function suivreCollection<T>(
  db: Firestore,
  chemin: string,
  schema: z.ZodType<T>,
): CollectionSuivie<T> {
  const etat = $state<CollectionSuivie<T>['etat']>({ elements: [], pret: false, erreur: null });

  const arreter = onSnapshot(
    collection(db, chemin),
    (instantane) => {
      const valides: AvecId<T>[] = [];
      instantane.forEach((document) => {
        const resultat = schema.safeParse(document.data());
        if (resultat.success) {
          valides.push({ ...resultat.data, id: document.id });
        } else {
          console.error(`Document invalide ignoré : ${chemin}/${document.id}`, resultat.error.issues);
        }
      });
      etat.elements = valides;
      etat.pret = true;
      etat.erreur = null;
    },
    (erreur) => {
      etat.erreur = erreur.message;
    },
  );

  return { etat, arreter };
}
