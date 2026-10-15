/**
 * Configuration publique du projet Firebase (la même que la v1,
 * js/firebase-config.js). Ces valeurs ne sont pas secrètes : la sécurité
 * repose sur la connexion et sur firestore.rules, pas sur leur discrétion.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBaSGv2u_h5rMEUrq1e65kMYmVvjkgtyTA',
  authDomain: 'lejdr-b38ef.firebaseapp.com',
  projectId: 'lejdr-b38ef',
  storageBucket: 'lejdr-b38ef.firebasestorage.app',
  messagingSenderId: '205930200251',
  appId: '1:205930200251:web:5fefaa6ad92993dde97d9e',
};

/** `npm run dev:emulateurs` lance Vite en mode « emulateurs » : aucune donnée réelle touchée. */
export const utiliserEmulateurs = import.meta.env.MODE === 'emulateurs';
