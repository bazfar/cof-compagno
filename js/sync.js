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

  // suivreEcritureFirestore (cf. firebase-config.js) : affiche #statut-sync
  // si cette écriture n'est pas accusée par le serveur après quelques
  // secondes — sinon un client qui n'atteint plus Firestore (réseau coupé,
  // bloqueur...) croit que son jet est parti (mise à jour optimiste locale
  // ci-dessous) alors qu'il n'a jamais atteint les autres joueurs.
  function set(cle, valeur) {
    _cache[cle] = valeur; // optimiste, dispo immédiatement pour l'appelant local
    window.suivreEcritureFirestore(_doc(cle).set({ valeur: valeur }))
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

  /* ----------------------------------------------------------------
     Liste synchronisée par sous-collection — à utiliser à la place de
     get/set pour un journal partagé (ex. historique de dés) où plusieurs
     clients peuvent ajouter une entrée à quelques centaines de ms
     d'écart. Avec get/set, chaque ajout relit tout le tableau, ajoute une
     entrée, réécrit tout le tableau : deux clients qui ajoutent presque
     en même temps peuvent s'écraser l'un l'autre (celui qui écrit en
     second repart d'une version du tableau qui ne contient pas encore
     l'entrée du premier), et la dernière entrée écrite gagne alors que
     l'autre disparaît silencieusement de l'historique.
     Ici, chaque entrée est un document Firestore indépendant dans
     sessions/{id}/sync/{cle}/items : deux ajouts concurrents créent deux
     documents distincts, jamais de collision. ---------------------- */
  const _listeCache = {};

  function _itemsCol(cle) {
    return _doc(cle).collection("items");
  }

  function getListe(cle) {
    return Object.prototype.hasOwnProperty.call(_listeCache, cle) ? _listeCache[cle] : [];
  }

  // Élague les entrées les plus anciennes au-delà de `limite` (triées par
  // champ "horodatage"). Best-effort et non coordonné entre clients : si
  // plusieurs clients l'exécutent en parallèle, ils suppriment au pire les
  // mêmes documents (delete est idempotent, pas d'erreur), donc pas besoin
  // de verrou.
  function _elaguerListe(cle, limite) {
    if (!limite) return;
    _itemsCol(cle).orderBy("horodatage", "desc").get().then((snap) => {
      if (snap.size <= limite) return;
      const batch = window.FirebaseDB.batch();
      snap.docs.slice(limite).forEach((d) => batch.delete(d.ref));
      return batch.commit();
    }).catch(() => {});
  }

  // Ajoute `valeur` comme nouveau document (jamais de réécriture d'un
  // tableau partagé). Mise à jour optimiste du cache local — même principe
  // que set() — pour un rendu synchrone côté auteur ; le snapshot Firestore
  // (déclenché quasi immédiatement même hors-ligne, écriture locale en
  // attente) remplacera ensuite cette valeur par la liste triée faisant
  // autorité. `limite` (optionnel) : nombre d'entrées conservées, cf.
  // _elaguerListe.
  function ajouterListe(cle, valeur, limite) {
    const liste = getListe(cle).slice();
    liste.unshift(Object.assign({ _id: null }, valeur));
    _listeCache[cle] = liste;
    _itemsCol(cle).add(valeur)
      .then(() => _elaguerListe(cle, limite))
      .catch((e) => console.error(`SyncStore.ajouterListe(${cle}) échoué :`, e));
    return true;
  }

  // Vide toute la liste (ex. "Vider l'historique" du MJ).
  function viderListe(cle) {
    _listeCache[cle] = [];
    _itemsCol(cle).get().then((snap) => {
      if (snap.empty) return;
      const batch = window.FirebaseDB.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      return batch.commit();
    }).catch((e) => console.error(`SyncStore.viderListe(${cle}) échoué :`, e));
    return true;
  }

  // Abonnement temps réel à la liste, triée par "horodatage" décroissant
  // (plus récent en premier, comme l'ancien tableau avec unshift).
  function subscribeListe(cle, callback, limite) {
    return _itemsCol(cle).orderBy("horodatage", "desc").limit(limite || 100).onSnapshot(
      (snap) => {
        const items = snap.docs.map((d) => Object.assign({ _id: d.id }, d.data()));
        _listeCache[cle] = items;
        callback(items);
      },
      (err) => console.error(`SyncStore.subscribeListe(${cle}) erreur :`, err)
    );
  }

  return { get, set, subscribe, getListe, ajouterListe, viderListe, subscribeListe };
})();

if (typeof window !== "undefined") window.SyncStore = SyncStore;
