import { collection, doc, limit, onSnapshot, orderBy, query, where, type Firestore, type QueryConstraint } from 'firebase/firestore';
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
 *
 * `filtre` (lot L2.2c) : ne suivre que les documents dont un champ vaut une
 * valeur. Indispensable quand les règles Firestore ne laissent lire que
 * ses propres documents : une lecture de toute la collection serait
 * refusée en bloc.
 *
 * `tri` (lot L2.5) : les `limite` derniers documents selon un champ (le
 * journal de dés ne charge que ses derniers jets, pas tout l'historique).
 */
export function suivreCollection<T>(
  db: Firestore,
  chemin: string,
  schema: z.ZodType<T>,
  filtre?: { champ: string; egal: string },
  tri?: { champ: string; sens: 'asc' | 'desc'; limite: number },
): CollectionSuivie<T> {
  const etat = $state<CollectionSuivie<T>['etat']>({ elements: [], pret: false, erreur: null });

  const contraintes: QueryConstraint[] = [
    ...(filtre ? [where(filtre.champ, '==', filtre.egal)] : []),
    ...(tri ? [orderBy(tri.champ, tri.sens), limit(tri.limite)] : []),
  ];
  const source = contraintes.length ? query(collection(db, chemin), ...contraintes) : collection(db, chemin);
  const arreter = onSnapshot(
    source,
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

export interface DocumentSuivi<T> {
  /** `donnees` : null tant que le document n'existe pas (ou s'il est invalide). */
  readonly etat: { donnees: T | null; pret: boolean; erreur: string | null };
  arreter: () => void;
}

/** Même chose pour un document seul (ex. l'état partagé d'une scène). */
export function suivreDocument<T>(db: Firestore, chemin: string, schema: z.ZodType<T>): DocumentSuivi<T> {
  const etat = $state<DocumentSuivi<T>['etat']>({ donnees: null, pret: false, erreur: null });

  const arreter = onSnapshot(
    doc(db, chemin),
    (instantane) => {
      if (!instantane.exists()) {
        etat.donnees = null;
      } else {
        const resultat = schema.safeParse(instantane.data());
        if (resultat.success) {
          etat.donnees = resultat.data;
        } else {
          console.error(`Document invalide ignoré : ${chemin}`, resultat.error.issues);
          etat.donnees = null;
        }
      }
      etat.pret = true;
      etat.erreur = null;
    },
    (erreur) => {
      etat.erreur = erreur.message;
    },
  );

  return { etat, arreter };
}
