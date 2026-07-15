/* ============================================================
   COF-COMPAGNO — Moteur du tracker d'initiative/tour de combat.

   État partagé en temps réel (MJ + joueurs) via SyncStore, clé
   "combat:initiative" :
     {
       actif: boolean,
       round: number,               // commence à 1
       indexActuel: number,         // index dans `ordre` du combattant actif
       ordre: [
         {
           id: string,               // id perso (PJ) ou id token (monstre)
           type: "pj" | "monstre",
           nom: string,
           initiative: number|null,  // total 1d20+mod, null = PJ pas encore lancé
           detail: string|null,      // ex. "d20[14]+2"
           koTourCourant: boolean,   // true si 0 PV au moment du calcul de l'ordre courant
         }, ...
       ],
     }

   Dépendances (chargées avant ce fichier dans index.html) :
   - js/personnage.js  → Personnage.calculerInitiative()
   - js/sync.js        → SyncStore
   - js/carte.js       → Carte.listeMonstresCombat/listeTokensJoueursCombat/
     idPersoDepuisRef/monstreEstVisible/onMonstreDevientVisible/onMonstresChange/
     reinitialiserDetectionVisibilite
   - js/capacites.js   → Capacites.decompterEtatsDebutTour/retirerEtatsFinCombat
   - js/app.js (chargé APRÈS ce fichier, référencé seulement à l'exécution,
     jamais à la définition du module) → App.chargerPersos/sauverPersos/
     lancerDe/ajouterHisto, déjà exposés pour js/capacites.js — réutilisés ici
     plutôt que de dupliquer l'accès direct à Firestore.
   ============================================================ */

const Combat = (() => {
  "use strict";

  const STORAGE = "combat:initiative";

  // Économie d'action par tour (PJ uniquement) : une action de déplacement
  // (DEPLACEMENT_BASE cases), une action principale (attaque/capacité, ou
  // "Sprint" qui la consomme sans attaquer contre +SPRINT_BONUS cases) et
  // une action secondaire (boire une potion, utiliser un parchemin, relever
  // un allié...). Remise à zéro automatiquement quand tourSuivant() rend ce
  // PJ actif. Pas de décompte automatique case par case au déplacement du
  // jeton sur la carte (trop couplé au rendu) : le joueur ajuste lui-même
  // son compteur, comme le reste des compteurs manuels de l'app (PV...).
  const DEPLACEMENT_BASE = 5;
  const SPRINT_BONUS = 2;

  function _etatVide() {
    return { actif: false, round: 1, indexActuel: 0, ordre: [] };
  }

  // Lit l'état partagé (cache SyncStore, synchrone) — jamais null, un combat
  // inactif renvoie la forme vide plutôt que d'obliger chaque appelant à
  // vérifier l'absence de document.
  function _lire() {
    return SyncStore.get(STORAGE) || _etatVide();
  }
  function _sauver(etat) {
    SyncStore.set(STORAGE, etat);
  }

  function estActif() {
    const e = SyncStore.get(STORAGE);
    return !!(e && e.actif);
  }
  function etatCourant() {
    return _lire();
  }

  /* ---------- Tri : initiatives desc, nulls (PJ pas encore lancés) en fin, égalité = ordre d'insertion ---------- */
  function _comparerOrdre(a, b) {
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  }

  function _detailJet(d20, mod) {
    return `d20[${d20}]${mod >= 0 ? "+" : ""}${mod}`;
  }

  // Déplacement max d'un tour pour ce perso — DEPLACEMENT_BASE + bonus (don
  // Mobile, Barde "Grâce féline", Druide "Totem de la vélocité" — cf.
  // _reinitialiserActionsEntree/estImmobile, qui doivent s'accorder sur la
  // même valeur : Combat.estImmobile ne peut pas comparer à la constante
  // DEPLACEMENT_BASE brute pour un perso bonus, sous peine de ne jamais le
  // détecter immobile). `p` est l'objet perso BRUT (pas une instance
  // Personnage) : lecture directe des champs, même convention que le don
  // Mobile ci-dessous.
  function _deplacementMax(p) {
    if (!p) return DEPLACEMENT_BASE;
    let bonus = 0;
    if ((p.dons || []).includes("mobile")) bonus += 1;
    // Barde — Voie du spectacle, rang 2 "Grâce féline" (passive) : +2 m de
    // déplacement par tour dans le texte d'origine, converti en +1 case
    // (même ordre de grandeur que le don Mobile, faute de conversion
    // mètres/cases établie ailleurs dans l'app — décision de Thomas).
    if (p.classe === "barde" && (p.capacites || []).some((c) => c.voie === "Voie du spectacle" && c.rang === 2)) bonus += 1;
    // Druide — Voie du shaman, rang 4 "Totem de la vélocité" (sort, cible
    // allié) : "une action de mouvement supplémentaire chaque tour" pendant
    // la durée de l'état 'totem_velocite' — modélisé comme un doublement du
    // déplacement de base (une seconde action de mouvement complète), tant
    // que l'état est actif sur CE perso (posé par Capacites.lancer côté
    // Druide, décompté comme tout autre état).
    if ((p.etatsActifs || []).some((e) => e.idEtat === "totem_velocite")) bonus += DEPLACEMENT_BASE;
    return DEPLACEMENT_BASE + bonus;
  }

  // Barde — Voie de la rapière, rang 4 "Enchaînement" (L) : accorde une
  // attaque supplémentaire ce tour — remet le flag actionPrincipaleUtilisee
  // à false (l'app ne bloque de toute façon jamais les boutons d'attaque
  // dessus, c'est un indicateur d'honnêteté de table, cf. dock-chip "A") de
  // sorte que le joueur puisse re-déclarer une action principale ce tour.
  // Le malus -2 aux DEUX attaques est géré séparément par un effet "bonus"
  // temporaire (cible: "attaque", 1 tour) posé par Capacites.lancer, comme
  // n'importe quel autre bonus/malus d'attaque temporaire.
  function accorderActionPrincipaleBonus(persoId) {
    const etat = _lire();
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return;
    entree.actionPrincipaleUtilisee = false;
    _sauver(etat);
  }

  // Remet à zéro l'économie d'action d'une entrée PJ — appelé à sa création
  // (premier tour) et à chaque fois que tourSuivant() la rend active.
  // `p` (objet perso brut, optionnel) : sert à _deplacementMax (don Mobile) ;
  // les appelants sans perso sous la main (aucun aujourd'hui) retombent sur
  // DEPLACEMENT_BASE.
  function _reinitialiserActionsEntree(e, p) {
    e.deplacementRestant = _deplacementMax(p);
    e.actionPrincipaleUtilisee = false;
    e.actionSecondaireUtilisee = false;
  }

  // `indexActuel` est un index brut dans `ordre` : insérer une entrée qui se
  // trie AVANT le combattant actif décalerait cet index vers une autre entrée.
  // Ancre le pointeur sur l'id du combattant actif avant toute insertion/tri,
  // pour le refaire pointer sur ce même id une fois l'ordre remanié.
  function _idActifCourant(etat) {
    return etat.ordre.length ? etat.ordre[etat.indexActuel].id : null;
  }
  function _reancrerIndexActuel(etat, idActifAvant) {
    if (idActifAvant == null) return;
    const idx = etat.ordre.findIndex((e) => e.id === idActifAvant);
    if (idx !== -1) etat.indexActuel = idx;
  }

  // Jette 1d20+mod.init pour un token monstre, pousse l'entrée dans `etat`
  // (pas encore triée) et journalise le jet dans l'historique partagé.
  function _ajouterMonstreAvecJet(etat, tok) {
    const mod = typeof tok.init === "number" ? tok.init : 0;
    const d20 = App.lancerDe(20);
    const initiative = d20 + mod;
    const detail = _detailJet(d20, mod);
    etat.ordre.push({ id: tok.id, type: "monstre", nom: tok.nom, initiative, detail, koTourCourant: false });
    App.ajouterHisto(`Initiative — ${tok.nom}`, initiative, false, false, detail);
  }

  // Ajoute au combat en cours les PJ et monstres (visibles) qui n'y sont pas
  // encore, sans jamais toucher aux entrées déjà présentes (jets déjà faits
  // préservés). Utilisé aussi bien par demarrer() (premier appel = combat
  // vide) que par la réouverture d'un combat déjà actif.
  function _fusionnerCombattants(etat) {
    const idActifAvant = _idActifCourant(etat);
    const ids = new Set(etat.ordre.map((e) => e.id));
    const persos = App.chargerPersos();

    (Carte.listeTokensJoueursCombat() || []).forEach((tok) => {
      if (!tok.ref) return; // jeton PJ sans ref = anomalie, ignoré plutôt que planter le tracker
      const persoId = Carte.idPersoDepuisRef(tok.ref);
      if (ids.has(persoId)) return;
      const nom = (persos[persoId] && persos[persoId].nom) || tok.nom;
      const entree = { id: persoId, type: "pj", nom, initiative: null, detail: null, koTourCourant: false };
      _reinitialiserActionsEntree(entree, persos[persoId]);
      etat.ordre.push(entree);
      ids.add(persoId);
    });

    (Carte.listeMonstresCombat() || []).forEach((tok) => {
      if (ids.has(tok.id) || !Carte.monstreEstVisible(tok.id)) return;
      _ajouterMonstreAvecJet(etat, tok);
      ids.add(tok.id);
    });

    etat.ordre.sort(_comparerOrdre);
    _reancrerIndexActuel(etat, idActifAvant);
  }

  // MJ : ouverture de l'onglet "⚔ Combat". Idempotent — si un combat est déjà
  // actif, ne relance aucun jet existant, ne fait que compléter l'ordre avec
  // les combattants pas encore présents.
  function demarrer() {
    let etat = _lire();
    if (!etat.actif) etat = { actif: true, round: 1, indexActuel: 0, ordre: [] };
    _fusionnerCombattants(etat);
    _sauver(etat);
  }

  // Callback interne branché sur Carte.onMonstreDevientVisible : un monstre
  // pré-placé par le MJ derrière du brouillard vient d'être repéré par un PJ —
  // rejoint l'ordre avec un jet auto, sans interrompre le tour en cours.
  function _surMonstreVisible(token) {
    const etat = _lire();
    if (!etat.actif) return;
    if (etat.ordre.some((e) => e.id === token.id)) return;
    const idActifAvant = _idActifCourant(etat);
    _ajouterMonstreAvecJet(etat, token);
    etat.ordre.sort(_comparerOrdre);
    _reancrerIndexActuel(etat, idActifAvant);
    _sauver(etat);
  }

  // Callback interne branché sur Carte.onMonstresChange : nettoie l'ordre des
  // monstres réellement supprimés de la carte (pas ceux juste tombés à 0 PV,
  // qui restent affichés — badge "sautable", cf. tourSuivant).
  function _surChangementMonstres() {
    const etat = _lire();
    if (!etat.actif || !etat.ordre.length) return;
    const idActifAvant = _idActifCourant(etat);
    const idsPresents = new Set((Carte.listeMonstresCombat() || []).map((m) => m.id));
    const avant = etat.ordre.length;
    etat.ordre = etat.ordre.filter((e) => e.type !== "monstre" || idsPresents.has(e.id));
    if (etat.ordre.length === avant) return;
    // Le combattant actif a lui-même été supprimé (cas limite) : avance au
    // suivant plutôt que de planter sur un index désormais hors-sujet.
    const idx = etat.ordre.findIndex((e) => e.id === idActifAvant);
    etat.indexActuel = idx !== -1 ? idx : (etat.indexActuel % Math.max(1, etat.ordre.length));
    _sauver(etat);
  }

  // Joueur uniquement (jamais le MJ, jamais automatique) : jet d'initiative
  // pour SON personnage.
  function lancerInitiativeJoueur(persoId) {
    const etat = _lire();
    if (!etat.actif) return;
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree || entree.initiative !== null) return;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    const mod = p ? Personnage.depuisJSON(p).calculerInitiative() : 0;
    const d20 = App.lancerDe(20);
    const idActifAvant = _idActifCourant(etat);
    entree.initiative = d20 + mod;
    entree.detail = _detailJet(d20, mod);
    etat.ordre.sort(_comparerOrdre);
    _reancrerIndexActuel(etat, idActifAvant);
    App.ajouterHisto(`Initiative — ${entree.nom}`, entree.initiative, false, false, entree.detail);
    _sauver(etat);
  }

  // PV courants d'une entrée de l'ordre — monstre via Carte, PJ via la fiche
  // vivante — pour décider si son tour doit être sauté (0 PV = "hors combat").
  function _pvActuel(entree) {
    if (entree.type === "monstre") {
      const m = (Carte.listeMonstresCombat() || []).find((t) => t.id === entree.id);
      return m ? (m.pvActuel ?? m.pvMax ?? 0) : null;
    }
    const p = App.chargerPersos()[entree.id];
    return p ? (p.pvActuel ?? p.pvMax ?? 0) : null;
  }
  // Un PJ à 0 PV est Mourant(e), pas KO : il garde son tour pour lancer son
  // jet de mort (cf. REGLES_GENERALES "Mort et stabilisation") — son tour
  // n'est sauté qu'une fois etatMort=true (3 échecs). Un monstre à 0 PV reste
  // simplement hors combat, aucun jet de mort pour eux.
  function _estKO(entree) {
    if (entree.type === "pj") {
      const p = App.chargerPersos()[entree.id];
      return !!(p && p.etatMort);
    }
    const pv = _pvActuel(entree);
    return typeof pv === "number" && pv <= 0;
  }

  // MJ uniquement (vérifié côté app.js via le rôle, pas ici) : avance au
  // prochain combattant pas à 0 PV. Décompte les états à durée numérique du
  // nouveau PJ actif.
  function tourSuivant() {
    const etat = _lire();
    if (!etat.actif || !etat.ordre.length) return;

    etat.ordre.forEach((e) => { e.koTourCourant = _estKO(e); });

    let index = etat.indexActuel;
    for (let i = 0; i < etat.ordre.length; i++) {
      index = (index + 1) % etat.ordre.length;
      if (index === 0) etat.round += 1;
      if (!etat.ordre[index].koTourCourant) break;
    }
    etat.indexActuel = index;

    const actif = etat.ordre[etat.indexActuel];
    if (actif && actif.type === "pj") {
      const persos = App.chargerPersos();
      const p = persos[actif.id];
      _reinitialiserActionsEntree(actif, p);
      if (p) {
        const { retires, degats } = Capacites.decompterEtatsDebutTour(p);
        App.sauverPersos(persos);
        degats.forEach((d) => App.ajouterHisto(
          `${d.libelle} — Dégâts de début de tour`, d.total, false, false,
          `${d.detail} → ${actif.nom} : ${d.pvApres} PV restants.`
        ));
        retires.forEach((libelle) => App.ajouterHisto(`${libelle} s'est dissipée sur ${actif.nom}`, 0, false, false, ""));
      }
    }

    _sauver(etat);
  }

  // Ajuste le déplacement restant du PJ (+1/-1 case, ou tout delta) — jamais
  // négatif. Le joueur décrémente lui-même en déplaçant son jeton, comme les
  // compteurs manuels du reste de l'app (PV...) : pas de calcul automatique
  // à partir de la distance parcourue sur la carte.
  // Un PJ est "immobile" ce tour s'il n'a pas encore entamé son déplacement
  // (deplacementRestant intact, cf. _reinitialiserActionsEntree/ajusterDeplacement)
  // — utilisé par Personnage.bonusDefImmobile() (Chasseur "Camouflage naturel",
  // Voie de la traque rang 2 : +4 DEF tant qu'immobile). Faux hors combat
  // (l'économie d'action n'existe pas hors combat) ou si le PJ n'a pas
  // (encore) d'entrée dans l'ordre.
  function estImmobile(persoId) {
    const etat = _lire();
    if (!etat.actif) return false;
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return false;
    return entree.deplacementRestant === _deplacementMax(App.chargerPersos()[persoId]);
  }

  function ajusterDeplacement(persoId, delta) {
    const etat = _lire();
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return;
    entree.deplacementRestant = Math.max(0, (entree.deplacementRestant || 0) + delta);
    _sauver(etat);
  }

  // Action principale consommée par une attaque/capacité (cf. app.js, câblé
  // sur les boutons d'attaque/dégâts/capacités du joueur actif).
  function utiliserActionPrincipale(persoId) {
    const etat = _lire();
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return;
    entree.actionPrincipaleUtilisee = true;
    _sauver(etat);
  }

  // Sprint : consomme l'action principale SANS attaquer, contre
  // +SPRINT_BONUS cases de déplacement ce tour.
  function sprint(persoId) {
    const etat = _lire();
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return;
    entree.actionPrincipaleUtilisee = true;
    entree.deplacementRestant = (entree.deplacementRestant || 0) + SPRINT_BONUS;
    _sauver(etat);
  }

  // Action secondaire (boire une potion, utiliser un parchemin, relever un
  // allié...) — un seul flag, pas de sous-catégorie automatisée.
  function utiliserActionSecondaire(persoId) {
    const etat = _lire();
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return;
    entree.actionSecondaireUtilisee = true;
    _sauver(etat);
  }

  // Réinitialisation manuelle de l'économie d'action (correction de table,
  // sans attendre le prochain tour) — même entrée que _reinitialiserActionsEntree.
  function reinitialiserActions(persoId) {
    const etat = _lire();
    const entree = etat.ordre.find((e) => e.id === persoId && e.type === "pj");
    if (!entree) return;
    _reinitialiserActionsEntree(entree, App.chargerPersos()[persoId]);
    _sauver(etat);
  }

  // MJ uniquement (vérifié côté app.js) : fin du combat — purge les états
  // "finCombat" des PJ impliqués, remet le tracker à zéro, réinitialise la
  // détection de visibilité (un monstre déjà repéré doit pouvoir re-déclencher
  // sa détection au combat suivant s'il redevient caché puis revisible).
  function terminerCombat() {
    const etat = _lire();
    const persos = App.chargerPersos();
    let modifie = false;
    etat.ordre.filter((e) => e.type === "pj").forEach((e) => {
      const p = persos[e.id];
      if (!p) return;
      const avant = (p.etatsActifs || []).length;
      Capacites.retirerEtatsFinCombat(p);
      if ((p.etatsActifs || []).length !== avant) modifie = true;
      // Jauge de corruption de combat (Voie du chaos) : remise à 0 en fin de
      // combat — la Corruption d'Âme (corruptionMajeure), elle, ne se
      // réinitialise jamais.
      if (p.corruptionCombat || p.corruptionSeuilFranchi) {
        p.corruptionCombat = 0;
        p.corruptionSeuilFranchi = false;
        modifie = true;
      }
      // Pool de réactions (cf. mecanique.reactionCout, js/capacites.js) : remis
      // à zéro en fin de combat, comme la jauge de corruption ci-dessus.
      if (p.reactionsUtilisees) {
        p.reactionsUtilisees = 0;
        modifie = true;
      }
    });
    if (modifie) App.sauverPersos(persos);
    if (typeof Carte !== "undefined" && Carte.reinitialiserDetectionVisibilite) Carte.reinitialiserDetectionVisibilite();
    _sauver(_etatVide());
  }

  function onChange(cb) {
    return SyncStore.subscribe(STORAGE, cb);
  }

  // Abonnements internes (une seule fois, à l'évaluation du module) — les
  // callbacks eux-mêmes vérifient `etat.actif` et ne font rien si aucun combat
  // n'est en cours.
  if (typeof Carte !== "undefined") {
    if (Carte.onMonstreDevientVisible) Carte.onMonstreDevientVisible(_surMonstreVisible);
    if (Carte.onMonstresChange) Carte.onMonstresChange(_surChangementMonstres);
  }

  return {
    estActif,
    etatCourant,
    demarrer,
    lancerInitiativeJoueur,
    tourSuivant,
    terminerCombat,
    onChange,
    DEPLACEMENT_BASE,
    SPRINT_BONUS,
    estImmobile,
    ajusterDeplacement,
    utiliserActionPrincipale,
    accorderActionPrincipaleBonus,
    sprint,
    utiliserActionSecondaire,
    reinitialiserActions,
  };
})();

if (typeof window !== "undefined") window.Combat = Combat;
