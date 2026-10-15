import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { firebaseConfig, utiliserEmulateurs } from './config';

/*
 * Seul point d'entrée vers Firebase. Les écrans et composants n'importent
 * jamais ce fichier (vérifié par .dependency-cruiser.cjs) : ils passent
 * par src/lib/magasins pour lire et src/lib/actions pour écrire.
 */
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Cache local persistant partagé entre onglets : la dernière fiche vue
// s'affiche tout de suite au chargement, même avant la réponse du serveur.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (utiliserEmulateurs) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
