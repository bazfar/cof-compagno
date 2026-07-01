/* ============================================================
   SyncStore — couche de synchro légère pour la battlemap.
   Interface volontairement minimale : get(cle) / set(cle, valeur) /
   subscribe(cle, callback, intervalleMs).

   Implémentation : Firebase Firestore, temps réel (onSnapshot).
   Chaque clé (ex. "battlemap:scene-active") devient un document dans
   sessions/{SESSION_ID}/sync/{cle}. carte.js n'a pas besoin de changer :
   même interface qu'avant, juste remplacée en dessous.

   get() reste synchrone via un cache local tenu à jour par les abonnements
   Firestore actifs (voir subscribe). set() écrit en optimiste (cache local
   immédiat) puis pousse vers Firestore en tâche de fond.

   intervalleMs est conservé dans la signature pour compat mais ignoré :
   Firestore pousse les mises à jour en temps réel, plus besoin de polling.
   ============================================================ */

const SyncStore = (() => {
  "use strict";

  const _cache = {};

  function _doc(cle) {
    return window.FirebaseDB
      .collection("sessions").doc(window.SESSION_ID)
      .collection("sync").doc(cle);
  }

  function get(cle) {
    return Object.prototype.hasOwnProperty.call(_cache, cle) ? _cache[cle] : null;
  }

  function set(cle, valeur) {
    _cache[cle] = valeur; // optimiste, dispo immédiatement pour l'appelant local
    _doc(cle).set({ valeur: valeur })
      .catch((e) => console.error(`SyncStore.set(${cle}) échoué :`, e));
    return true;
  }

  // Abonnement temps réel. Retourne une fonction de désabonnement, comme
  // avant (Firestore onSnapshot renvoie directement cette fonction).
  function subscribe(cle, callback /*, intervalleMs (ignoré) */) {
    return _doc(cle).onSnapshot(
      (snap) => {
        const valeur = snap.exists ? snap.data().valeur : null;
        _cache[cle] = valeur;
        callback(valeur);
      },
      (err) => console.error(`SyncStore.subscribe(${cle}) erreur :`, err)
    );
  }

  return { get, set, subscribe };
})();

if (typeof window !== "undefined") window.SyncStore = SyncStore;
