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

  // Applique un chemin pointé (ex. "votes.joueur123") sur une COPIE de
  // l'objet — même logique que la fusion Firestore côté serveur (cf.
  // setChamp/supprimerChamp ci-dessous), pour tenir le cache local
  // optimiste cohérent avec ce qui vient d'être envoyé.
  function _cheminDefinir(obj, chemin, valeur) {
    const parts = chemin.split(".");
    const copie = obj ? JSON.parse(JSON.stringify(obj)) : {};
    let node = copie;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
      node = node[part];
    }
    node[parts[parts.length - 1]] = valeur;
    return copie;
  }
  function _cheminSupprimer(obj, chemin) {
    const parts = chemin.split(".");
    const copie = obj ? JSON.parse(JSON.stringify(obj)) : {};
    let node = copie;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof node[part] !== "object" || node[part] === null) return copie;
      node = node[part];
    }
    delete node[parts[parts.length - 1]];
    return copie;
  }

  /* ----------------------------------------------------------------
     Écriture d'UN SEUL chemin dans l'objet stocké sous `cle`.

     ⚠️ Piège Firestore, cause d'un bug resté silencieux plusieurs
     semaines (présence de séance, votes de repos et de butin, tentatives
     d'atelier : tous perdus) : set() N'INTERPRÈTE PAS les points dans les
     clés de l'objet qu'on lui passe, contrairement à update().
     `set({ "valeur.jean": x }, { merge: true })` ne fusionne donc RIEN
     dans la map `valeur` — il crée, à la racine du document, un champ dont
     le nom contient littéralement un point ("valeur.jean"), à côté de
     `valeur` qui reste inchangée. subscribe() lisant snap.data().valeur,
     l'écriture était invisible pour tous les postes, y compris celui qui
     venait de l'émettre : son cache optimiste était écrasé par le snapshot
     suivant (le bouton « Je suis là » repassait tout seul à l'état non
     déclaré), sans la moindre erreur en console ni côté serveur.

     La forme correcte est l'objet IMBRIQUÉ (_objetImbrique) accompagné
     d'un masque de fusion explicite (mergeFields + FieldPath,
     _cheminFirestore), construit segment par segment et jamais depuis une
     chaîne pointée. Ne JAMAIS revenir à une clé pointée dans un set() ici.
     ---------------------------------------------------------------- */
  function _cheminFirestore(chemin) {
    return new firebase.firestore.FieldPath("valeur", ...chemin.split("."));
  }

  // { valeur: { <chemin imbriqué> : valeur } } — la charge utile qui
  // accompagne le masque _cheminFirestore ci-dessus.
  function _objetImbrique(chemin, valeur) {
    const parts = chemin.split(".");
    const racine = {};
    let node = racine;
    for (let i = 0; i < parts.length - 1; i++) { node[parts[i]] = {}; node = node[parts[i]]; }
    node[parts[parts.length - 1]] = valeur;
    return { valeur: racine };
  }

  // Fusionne UNE clé (chemin pointé, ex. "votes.joueur123") dans l'objet
  // stocké sous `cle`, SANS lire-modifier-réécrire tout l'objet côté
  // client : Firestore remplace ce seul chemin, atomiquement côté serveur
  // — deux clients qui touchent des CLÉS DIFFÉRENTES du même objet au même
  // instant ne s'écrasent jamais l'un l'autre, même avec de la latence
  // réseau, contrairement à get()+set() sur l'objet entier (même famille de
  // bug que celui corrigé dans App.sauverPersos, mais fermée ici à la
  // racine plutôt que rapiécée par une comparaison de baseline côté client
  // — plus simple pour un simple couple clé/valeur). À réserver aux maps où
  // PLUSIEURS joueurs écrivent chacun leur PROPRE entrée (vote, présence,
  // tentative d'atelier...) — pas à un tableau qui grossit (cf.
  // ajouterListe ci-dessous, prévu pour ça) ni à un état à écrivain unique
  // (MJ seul), où get()+set() ne présente pas ce risque.
  function setChamp(cle, chemin, valeur) {
    _cache[cle] = _cheminDefinir(_cache[cle], chemin, valeur); // optimiste
    window.suivreEcritureFirestore(
      _doc(cle).set(_objetImbrique(chemin, valeur), { mergeFields: [_cheminFirestore(chemin)] })
    ).catch((e) => console.error(`SyncStore.setChamp(${cle}, ${chemin}) échoué :`, e));
    return true;
  }

  // Retire UNE clé (chemin pointé) sans toucher au reste — même principe
  // que setChamp, via FieldValue.delete() côté Firestore.
  function supprimerChamp(cle, chemin) {
    _cache[cle] = _cheminSupprimer(_cache[cle], chemin);
    window.suivreEcritureFirestore(
      _doc(cle).set(_objetImbrique(chemin, firebase.firestore.FieldValue.delete()), { mergeFields: [_cheminFirestore(chemin)] })
    ).catch((e) => console.error(`SyncStore.supprimerChamp(${cle}, ${chemin}) échoué :`, e));
    return true;
  }

  // Ajoute `valeur` au TABLEAU stocké sous `cle`, via FieldValue.arrayUnion
  // — fusion Firestore native, encore sans lecture préalable côté client :
  // deux clients qui ajoutent chacun un élément au même instant se
  // retrouvent tous les deux dans le tableau final, jamais l'un n'efface
  // l'ajout de l'autre. À réserver aux tableaux alimentés par PLUSIEURS
  // participants indépendants (ex. demandes d'achat au marché soumises par
  // différents joueurs) où chaque élément est unique par construction (un
  // id généré, cf. l'appelant) — arrayUnion déduplique par égalité
  // profonde, donc deux éléments réellement identiques ne compteraient
  // qu'une fois, ce qui ne peut pas arriver ici. Pour un journal qui reçoit
  // aussi des mises à jour d'éléments déjà présents (pas seulement des
  // ajouts), préférer ajouterListe/subscribeListe ci-dessous (une
  // sous-collection, un document par entrée) plutôt que ce tableau plat.
  function ajouterElement(cle, valeur) {
    const liste = Array.isArray(_cache[cle]) ? _cache[cle].slice() : [];
    const dejaPresent = liste.some((x) => JSON.stringify(x) === JSON.stringify(valeur));
    if (!dejaPresent) liste.push(valeur);
    _cache[cle] = liste; // optimiste
    window.suivreEcritureFirestore(_doc(cle).set({ valeur: firebase.firestore.FieldValue.arrayUnion(valeur) }, { merge: true }))
      .catch((e) => console.error(`SyncStore.ajouterElement(${cle}) échoué :`, e));
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
      return window.suivreEcritureFirestore(batch.commit());
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
    window.suivreEcritureFirestore(_itemsCol(cle).add(valeur))
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
      return window.suivreEcritureFirestore(batch.commit());
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

  return { get, set, setChamp, supprimerChamp, ajouterElement, subscribe, getListe, ajouterListe, viderListe, subscribeListe };
})();

if (typeof window !== "undefined") window.SyncStore = SyncStore;
