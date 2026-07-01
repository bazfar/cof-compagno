/* ============================================================
   Configuration Firebase — point d'entrée unique.
   Charge ce fichier AVANT depot.js et sync.js dans index.html :
   ils s'appuient sur window.FirebaseDB et window.SESSION_ID.

   SESSION_ID identifie la "table" dans Firestore
   (sessions/{SESSION_ID}/...). Une seule table pour l'instant ;
   changer cette valeur permettrait d'héberger plusieurs tables
   séparées sur le même projet Firebase sans rien casser d'autre.
   ============================================================ */

(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBaSGv2u_h5rMEUrq1e65kMYmVvjkgtyTA",
    authDomain: "lejdr-b38ef.firebaseapp.com",
    projectId: "lejdr-b38ef",
    storageBucket: "lejdr-b38ef.firebasestorage.app",
    messagingSenderId: "205930200251",
    appId: "1:205930200251:web:5fefaa6ad92993dde97d9e"
  };

  const SESSION_ID = "table-arbre-monde";

  const app = firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  // Cache local persistant (IndexedDB) : la fiche de perso ou l'état de
  // combat vus la dernière fois s'affichent instantanément au chargement,
  // même hors-ligne, avant que Firestore ne confirme les données fraîches.
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === "failed-precondition") {
      // Plusieurs onglets ouverts sans synchronizeTabs — non bloquant.
      console.warn("Firestore persistence : plusieurs onglets détectés.", err);
    } else if (err.code === "unimplemented") {
      console.warn("Firestore persistence non supportée par ce navigateur.");
    }
  });

  window.FirebaseDB = db;
  window.SESSION_ID = SESSION_ID;
})();
