/* ============================================================
   COF-COMPAGNO — Sauvegardes des monstres.

   Modèle RÉACTIF (décision du 04/08/2026) : le défenseur lance
   1d20 + modificateur contre un DD. Côté PJ, le modificateur vient de
   Personnage.modSauvegarde(). Côté monstre, il n'existe aucune
   caractéristique dans data/bestiaire.json (schéma réel : pv, def, init,
   atk, dangerosite, boss, taille, armure, tier) — ce module DÉRIVE donc les
   trois sauvegardes de champs déjà saisis, plutôt que d'imposer la saisie de
   six caractéristiques sur 67 entrées.

   La dérivation est un PROXY assumé, pas une simulation fidèle : elle vise à
   produire des profils de créature lisibles (le gobelin esquive et cède, le
   golem encaisse et résiste) à coût de saisie nul. Un champ optionnel
   `resistanceLegendaire` sur une entrée du bestiaire prime sur la formule
   correspondante ; aucun équivalent n'est prévu pour les trois modificateurs
   eux-mêmes tant que la dérivation tient — l'ajouter serait la première
   marche vers un bestiaire à caracs complètes, décision qui n'est pas prise.

   Dépendances (chargées avant ce fichier dans index.html) :
   - data/bestiaire.js → BESTIAIRE_INDEX (résolution du modèle depuis monstreId)
   - js/sync.js        → SyncStore (compteur de résistance légendaire)
   Les deux sont optionnelles à l'exécution : le module dégrade proprement
   (dérivation depuis le token seul, compteur non partagé) plutôt que de jeter.
   ============================================================ */
const Sauvegardes = (function () {
  "use strict";

  // Libellés accentués. Les clés de SAUVEGARDES (data/donnees.js) sont sans
  // accent parce que ce sont des identifiants sérialisés
  // (jetSauvegardeFixe.carac, futur bonusSauvegardes), pas du texte d'UI.
  const LIBELLES = { Reflexes: "Réflexes", Vigueur: "Vigueur", Volonte: "Volonté" };

  const BONUS_TAILLE = { "petite": -1, "moyenne": 0, "grande": 1, "très grande": 2 };
  const BONUS_TIER = { recrue: 0, basique: 0, veteran: 0, elite: 1, meneur: 1, champion: 2, grand_hote: 2 };

  // Fusionne le token de combat et son modèle de bestiaire : le token prime
  // (le MJ peut avoir ajusté une valeur à la volée), le modèle sert de repli.
  // Même patron de résolution que obtenirVolonteCible() dans js/capacites.js.
  function _base(tok) {
    if (!tok) return null;
    const modele = (typeof BESTIAIRE_INDEX !== "undefined" && tok.monstreId) ? BESTIAIRE_INDEX[tok.monstreId] : null;
    const lire = function (champ, defaut) {
      if (tok[champ] != null) return tok[champ];
      if (modele && modele[champ] != null) return modele[champ];
      return defaut;
    };
    return {
      init: lire("init", 0),
      dangerosite: lire("dangerosite", 1),
      taille: lire("taille", "moyenne"),
      tier: lire("tier", null),
      boss: !!lire("boss", false),
      resistanceLegendaire: lire("resistanceLegendaire", null),
    };
  }

  // Modificateur de sauvegarde d'un monstre. `nom` est une clé de SAUVEGARDES
  // ("Reflexes" | "Vigueur" | "Volonte"). Renvoie null si le token est
  // introuvable ou le nom inconnu — l'appelant doit retomber sur une
  // résolution manuelle plutôt que de traiter null comme un 0.
  function modMonstre(tok, nom) {
    const b = _base(tok);
    if (!b) return null;
    if (nom === "Reflexes") {
      // Plafond indispensable : init va de 0 à 7 sans corrélation à la
      // dangerosité (« Loup vétéran », dangerosité 1, porte init 6 — il
      // esquiverait mieux qu'un Chasseur niveau 5 sans ce garde-fou).
      return Math.min(b.init, 3 + b.dangerosite);
    }
    if (nom === "Vigueur") {
      return b.dangerosite + (BONUS_TAILLE[b.taille] || 0);
    }
    if (nom === "Volonte") {
      const bonus = (b.tier != null && BONUS_TIER[b.tier] != null) ? BONUS_TIER[b.tier] : (b.boss ? 1 : 0);
      return b.dangerosite + bonus;
    }
    return null;
  }

  // Nombre total d'usages de résistance légendaire d'un monstre. Un champ
  // `resistanceLegendaire` explicite sur l'entrée du bestiaire prime sur la
  // formule (échappatoire MJ, aucune entrée ne l'utilise aujourd'hui).
  function usagesLegendaires(tok) {
    const b = _base(tok);
    if (!b || !b.boss) return 0;
    if (typeof b.resistanceLegendaire === "number") return b.resistanceLegendaire;
    return Math.max(1, b.dangerosite - 2);
  }

  /* --- Compteur en cours de combat -------------------------------------
     Stocké dans SyncStore plutôt que sur le token : les tokens existent en
     deux implémentations parallèles (etat.jetons de js/carte.js et les
     tokens DD2VTT en battlemap), écrire un champ imposerait de modifier les
     deux chemins pour un gain nul. Même patron que "combat:initiative". */
  const CLE = "combat:resistanceLegendaire";

  function _etat() {
    if (typeof SyncStore === "undefined") return {};
    return SyncStore.get(CLE) || {};
  }

  // Usages restants. Un token jamais vu renvoie son total (pas 0) : le
  // compteur n'est matérialisé qu'à la première consommation.
  function restant(tok) {
    if (!tok) return 0;
    const e = _etat();
    return e[tok.id] != null ? e[tok.id] : usagesLegendaires(tok);
  }

  // Consomme un usage. Renvoie true si un usage était disponible (l'appelant
  // doit alors convertir l'échec en réussite), false sinon.
  function consommer(tok) {
    if (!tok) return false;
    const dispo = restant(tok);
    if (dispo <= 0) return false;
    if (typeof SyncStore === "undefined") return true;
    const e = _etat();
    e[tok.id] = dispo - 1;
    SyncStore.set(CLE, e);
    return true;
  }

  // À appeler en fin de combat (cf. phase B : à brancher sur le même point
  // que Capacites.retirerEtatsFinCombat).
  function reinitialiser() {
    if (typeof SyncStore !== "undefined") SyncStore.set(CLE, {});
  }

  return {
    LIBELLES: LIBELLES,
    modMonstre: modMonstre,
    usagesLegendaires: usagesLegendaires,
    restant: restant,
    consommer: consommer,
    reinitialiser: reinitialiser,
  };
})();
