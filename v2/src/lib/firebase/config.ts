/**
 * Configuration publique du projet Firebase de la 2.0 (lejdr-v2, séparé de
 * celui de la v1 depuis le 16/10/2026). Ces valeurs ne sont pas secrètes :
 * la sécurité repose sur la connexion et sur firestore.rules, pas sur leur
 * discrétion.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyCpaJ-tj4WL8F-7CXHDUPqpkympRDgiHao',
  authDomain: 'lejdr-v2.firebaseapp.com',
  projectId: 'lejdr-v2',
  storageBucket: 'lejdr-v2.firebasestorage.app',
  messagingSenderId: '565261317471',
  appId: '1:565261317471:web:cef07fcbeded20aafef2ea',
};

/** `npm run dev:emulateurs` lance Vite en mode « emulateurs » : aucune donnée réelle touchée. */
export const utiliserEmulateurs = import.meta.env.MODE === 'emulateurs';
