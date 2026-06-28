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

// Squelette pour plus tard — multijoueur temps réel.
// À implémenter le jour de l'hébergement (Firebase Firestore / Realtime DB, ou API).
class DepotDistant extends Depot {
  constructor(config) {
    super();
    this.config = config;
    // TODO: init du client (Firebase, fetch API, websocket...)
  }
  // charger/liste/sauver/supprimer/ecouter à brancher sur le backend choisi.
}

if (typeof window !== "undefined") {
  window.Depot = Depot;
  window.DepotLocal = DepotLocal;
  window.DepotDistant = DepotDistant;
}
