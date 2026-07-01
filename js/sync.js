/* ============================================================
   SyncStore — couche de synchro légère pour la battlemap.
   Interface volontairement minimale : get(cle) / set(cle, valeur) /
   subscribe(cle, callback, intervalleMs).
   Implémentation aujourd'hui : localStorage, avec écriture optimiste
   locale immédiate + confirmation/merge au prochain poll (4s par défaut).
   Le jour de l'hébergement : remplacer le corps de get/set/subscribe par
   des appels Firebase Realtime Database (mêmes clés de chaîne → chemins),
   SANS toucher au code appelant (carte.js n'écrit jamais dans localStorage
   directement pour ces données).
   Dernier écrit gagne, pas de fusion complexe.
   ============================================================ */

const SyncStore = (() => {
  "use strict";

  const PREFIXE = "cof_sync:";
  const INTERVALLE_DEFAUT = 4000;

  function _lire(cle) {
    try {
      const brut = localStorage.getItem(PREFIXE + cle);
      return brut == null ? null : JSON.parse(brut);
    } catch (e) { return null; }
  }

  function get(cle) { return _lire(cle); }

  // Écrit immédiatement (optimiste). Ne notifie pas les abonnés de cet onglet :
  // l'appelant a déjà mis à jour son propre état local avant/pendant l'appel.
  // Les autres onglets/clients sont notifiés via l'event "storage" (immédiat,
  // même navigateur) et via le poll (fallback, et seul mécanisme une fois
  // porté sur un vrai backend distant).
  function set(cle, valeur) {
    try {
      localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Abonnement à une clé : callback(valeur) appelé à chaque changement détecté
  // (autre onglet du même navigateur, ou même onglet après un poll qui détecte
  // un écart). Retourne une fonction de désabonnement.
  function subscribe(cle, callback, intervalleMs) {
    const intervalle = intervalleMs || INTERVALLE_DEFAUT;
    let dernierBrut = localStorage.getItem(PREFIXE + cle);

    function _notifier(brut) {
      dernierBrut = brut;
      let valeur = null;
      try { valeur = brut == null ? null : JSON.parse(brut); } catch (e) {}
      callback(valeur);
    }

    // Sync immédiate entre onglets du même navigateur.
    const surStorage = (e) => {
      if (e.key !== PREFIXE + cle) return;
      _notifier(e.newValue);
    };
    window.addEventListener("storage", surStorage);

    // Poll de confirmation/fallback — c'est ce mécanisme qui, seul, portera
    // la synchro une fois SyncStore branché sur un backend distant (l'event
    // "storage" ne traverse pas les navigateurs).
    const timerId = setInterval(() => {
      const brut = localStorage.getItem(PREFIXE + cle);
      if (brut !== dernierBrut) _notifier(brut);
    }, intervalle);

    return () => {
      clearInterval(timerId);
      window.removeEventListener("storage", surStorage);
    };
  }

  return { get, set, subscribe };
})();

if (typeof window !== "undefined") window.SyncStore = SyncStore;
