/* ============================================================
   Dépôt — couche de persistance derrière une interface.
   But : que l'app ne parle JAMAIS directement à localStorage.
   Aujourd'hui : DepotLocal (localStorage).
   Demain (hébergement) : DepotDistant (Firebase / API) — même interface,
   on change de backend en un seul endroit, sans toucher l'UI.
   ============================================================ */

// "Interface" (contrat). En JS on l'exprime par une classe de base.
class Depot {
  charger(id) { throw new Error("Depot.charger() non implémenté"); }
  liste() { throw new Error("Depot.liste() non implémenté"); }
  sauver(obj, id) { throw new Error("Depot.sauver() non implémenté"); }
  supprimer(id) { throw new Error("Depot.supprimer() non implémenté"); }
  // Abonnement aux changements (temps réel). No-op en local.
  ecouter(/* callback */) { return () => {}; }
}

// Implémentation locale : un "store" clé→objet dans localStorage (ex. cof_persos).
class DepotLocal extends Depot {
  constructor(cle = "cof_persos") {
    super();
    this.cle = cle;
  }

  _lire() {
    try { return JSON.parse(localStorage.getItem(this.cle)) || {}; }
    catch (e) { return {}; }
  }
  _ecrire(o) {
    try { localStorage.setItem(this.cle, JSON.stringify(o)); return true; }
    catch (e) { return false; } // quota dépassé, etc.
  }

  // charger() sans id → tout le store ; avec id → un seul élément
  charger(id) {
    const o = this._lire();
    return id == null ? o : o[id];
  }
  liste() {
    const o = this._lire();
    return Object.keys(o).map((k) => o[k]);
  }
  sauver(obj, id) {
    const o = this._lire();
    const cle = id || (obj && obj.id);
    if (!cle) return null;
    o[cle] = obj;
    this._ecrire(o);
    return cle;
  }
  supprimer(id) {
    const o = this._lire();
    delete o[id];
    this._ecrire(o);
  }
  // Remplace tout le store d'un coup (utile quand on manipule la map {id: obj})
  remplacerTout(map) {
    return this._ecrire(map || {});
  }
  // Synchronisation entre onglets du même navigateur (gratuit, déjà multi-vue).
  ecouter(callback) {
    const handler = (e) => { if (e.key === this.cle) callback(this.charger()); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
}

// Implémentation distante : Firebase Firestore.
// Chaque "cle" (ex. "cof_persos") devient une sous-collection sous
// sessions/{SESSION_ID}/{cle}, un document par id (perso, etc.).
//
// Point important : DepotLocal est SYNCHRONE (localStorage), mais Firestore
// est intrinsèquement ASYNCHRONE. Pour garder EXACTEMENT la même interface
// (charger/sauver/... retournent une valeur directement, pas une Promise) et
// ne rien changer côté app.js, DepotDistant maintient un cache local tenu à
// jour en permanence par un abonnement Firestore temps réel (onSnapshot) :
//   - charger()/liste() lisent ce cache (instantané, jamais de Promise)
//   - sauver()/supprimer() mettent le cache à jour immédiatement (optimiste)
//     ET envoient l'écriture à Firestore en tâche de fond
// Tant que le tout premier snapshot n'est pas arrivé (juste après le chargement
// de la page), le cache est vide. Avec la persistance IndexedDB activée dans
// firebase-config.js, ce délai est quasi invisible dès la 2e visite.
class DepotDistant extends Depot {
  constructor(cle = "cof_persos") {
    super();
    this.cle = cle;
    this._cache = {};
    this._pret = false;
    this._abonnes = []; // callbacks en attente du "temps réel" (voir ecouter())
    this._demarrer();
  }

  _collection() {
    return window.FirebaseDB
      .collection("sessions").doc(window.SESSION_ID)
      .collection(this.cle);
  }

  _demarrer() {
    this._collection().onSnapshot(
      (snap) => {
        const o = {};
        snap.forEach((doc) => { o[doc.id] = doc.data(); });
        this._cache = o;
        this._pret = true;
        this._abonnes.forEach((cb) => cb(o));
      },
      (err) => console.error(`DepotDistant(${this.cle}) — erreur de synchro :`, err)
    );
  }

  // charger() sans id → tout le cache ; avec id → un seul élément
  charger(id) {
    return id == null ? this._cache : this._cache[id];
  }
  liste() {
    return Object.keys(this._cache).map((k) => this._cache[k]);
  }
  sauver(obj, id) {
    const cle = id || (obj && obj.id);
    if (!cle) return null;
    this._cache[cle] = obj; // optimiste : visible localement tout de suite
    this._collection().doc(cle).set(obj)
      .catch((e) => console.error(`DepotDistant(${this.cle}).sauver(${cle}) échoué :`, e));
    return cle;
  }
  supprimer(id) {
    delete this._cache[id];
    this._collection().doc(id).delete()
      .catch((e) => console.error(`DepotDistant(${this.cle}).supprimer(${id}) échoué :`, e));
  }
  // Remplace tout le store d'un coup : diff local pour ne réécrire/supprimer
  // que ce qui a changé (au lieu de tout effacer puis tout réécrire).
  remplacerTout(map) {
    const nouveau = map || {};
    const ancien = this._cache;
    this._cache = nouveau;
    const col = this._collection();
    const batch = window.FirebaseDB.batch();
    Object.keys(ancien).forEach((id) => { if (!(id in nouveau)) batch.delete(col.doc(id)); });
    Object.keys(nouveau).forEach((id) => batch.set(col.doc(id), nouveau[id]));
    batch.commit()
      .catch((e) => console.error(`DepotDistant(${this.cle}).remplacerTout() échoué :`, e));
    return true;
  }
  // Abonnement temps réel : notifie tout de suite si l'état initial est déjà
  // connu, puis à chaque changement distant (autre joueur, autre onglet...).
  ecouter(callback) {
    this._abonnes.push(callback);
    if (this._pret) callback(this._cache);
    return () => { this._abonnes = this._abonnes.filter((cb) => cb !== callback); };
  }
}

if (typeof window !== "undefined") {
  window.Depot = Depot;
  window.DepotLocal = DepotLocal;
  window.DepotDistant = DepotDistant;
}
