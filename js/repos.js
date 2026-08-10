/* ============================================================
   Repos — couchage/boissons, scrutin et overlay collectif de repos long,
   repos court, dans l'onglet 🎭 Party (+ bouton d'ouverture sur la fiche).

   Refonte (09/08/2026, cf. prompt_repos_cuisine_metiers.md) puis scrutin
   (cf. prompt_repos_long_scrutin.md, qui AMENDE le déclenchement du repos
   long ci-dessus) : le repos long n'est plus lancé par un formulaire MJ
   multi-sélection — un JOUEUR propose un repos long depuis sa propre
   fiche (#panneau-fiche), les joueurs déclarés présents (cf. js/seance.js,
   Presence.presents()) votent oui/non pendant 30 secondes, et l'adoption
   ouvre un overlay collectif (cuisine + attribution des portions) avant
   validation. Le repos COURT (6.4) et le patron "jet de PV en attente,
   joueur lance lui-même" (attente/lancerJetRepos/purgerAttente) sont
   INCHANGÉS par cette passe.

   Stockage : SyncStore, même convention que js/marche.js. Le coût du
   couchage est débité IMMÉDIATEMENT à la validation (pas de re-vote sur
   l'argent) ; la régénération de PV n'est JAMAIS automatique — chaque
   joueur concerné lance lui-même son jet depuis l'encart "🛌 Repos en
   attente" (patron conservé du système d'auberge d'origine). PP/Cercle/
   capacités/Grimoire/Fatiguée/tentatives d'atelier sont appliqués
   IMMÉDIATEMENT à la validation, pas différés au jet.
   Paliers/boissons : cf. data/repos.js. Plats : cf. js/cuisine.js
   (contrat unique : le champ effetRepos d'un consommable, et désormais
   aussi Cuisine.tenterRecette, extrait pour être appelé depuis l'overlay
   SANS dupliquer la logique de résolution de jet/qualité/XP/ingrédients).

   Audit hérité (avant la refonte) : un personnage déjà en attente (jet
   non lancé) n'est JAMAIS re-servi — purgerAttente() reste le moyen
   explicite de vider une entrée bloquée avant de pouvoir renvoyer un
   repos au même personnage — sans remboursement automatique, décision de
   table laissée au MJ.
   ============================================================ */

const Repos = (() => {
  "use strict";

  const STORAGE_REPOS_ATTENTE = "repos:enAttente"; // { [persoId]: { label, desPositifs:[..], flatPositif, desNegatifs:[..], horodatage } }
  const KEY_VOTE = "repos:vote";       // null hors scrutin
  const KEY_ENCOURS = "repos:encours"; // null hors overlay
  // Requête de récolte (prompt_recolte_4_repos.md §2.2) — même patron exact
  // que Meteo (CLE_DEMANDE/demanderLectureCiel/_cloreDemandeEnCours,
  // js/meteo.js) : document unique, statut "en_attente" pendant la fenêtre
  // de réponse. Échéance 60s (le double de la météo — choisir un milieu ET
  // une espèce prend plus de temps que lire le ciel).
  const KEY_DEMANDE_RECOLTE = "recolte:demande"; // null hors requête
  const ECHEANCE_DEMANDE_RECOLTE_MS = 60000;
  // Requête de veillée (prompt_musicien_7_veillee.md §2) — même patron
  // exact que KEY_DEMANDE_RECOLTE ci-dessus, échéance 60s également.
  const KEY_DEMANDE_MUSIQUE = "musique:demande"; // null hors requête
  const ECHEANCE_DEMANDE_MUSIQUE_MS = 60000;

  function lireAttente() { return SyncStore.get(STORAGE_REPOS_ATTENTE) || {}; }
  function sauverAttente(a) { SyncStore.set(STORAGE_REPOS_ATTENTE, a); }
  function lireVote() { return SyncStore.get(KEY_VOTE) || null; }
  function sauverVote(v) { SyncStore.set(KEY_VOTE, v); }
  function lireEncours() { return SyncStore.get(KEY_ENCOURS) || null; }
  function sauverEncours(e) { SyncStore.set(KEY_ENCOURS, e); }
  function lireDemandeRecolte() { return SyncStore.get(KEY_DEMANDE_RECOLTE) || null; }
  function sauverDemandeRecolte(d) { SyncStore.set(KEY_DEMANDE_RECOLTE, d); }
  function lireDemandeMusique() { return SyncStore.get(KEY_DEMANDE_MUSIQUE) || null; }
  function sauverDemandeMusique(d) { SyncStore.set(KEY_DEMANDE_MUSIQUE, d); }

  /* ── Utilitaires (copie locale, même convention que js/marche.js) ── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }
  // Copie locale de App.memeNom (privée à app.js, non exposée) — même
  // normalisation, nécessaire ici pour retrouver le(s) personnage(s) d'un
  // joueur présent (Presence.presents() ne donne que joueurId+nom, jamais
  // de persoId directement).
  function _memeNom(a, b) {
    if (!a || !b) return false;
    const norm = (s) => String(s).trim().toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
    const na = norm(a), nb = norm(b);
    if (!na || na === "joueur") return false;
    return na === nb;
  }

  function _palier(id) { return PALIERS_AUBERGE.find((p) => p.id === id); }
  function _boisson(id) { return TYPES_BOISSON.find((b) => b.id === id); }
  function _formatPo(n) { return (Math.round(n * 100) / 100).toString(); }

  // "XdY" -> { nb, faces } — mêmes formules que ECHELLE_DES_PLAT/palier.de,
  // jamais de +Z dans ces données, mais on reste tolérant sur l'espacement.
  function _parseDe(formule) {
    const m = /^(\d*)d(\d+)$/.exec((formule || "").trim());
    if (!m) return null;
    return { nb: parseInt(m[1] || "1", 10), faces: parseInt(m[2], 10) };
  }

  function _consommerUneUnite(inventaireListe, itemId) {
    const idx = (inventaireListe || []).findIndex((it) => it.id === itemId);
    if (idx === -1) return;
    const it = inventaireListe[idx];
    if ((it.quantite || 1) <= 1) inventaireListe.splice(idx, 1);
    else it.quantite -= 1;
  }

  /* ── Repos court (propriétaire ou MJ) — immédiat, INCHANGÉ ────────── */
  // Décision en suspens (cf. prompt_repos_cuisine_metiers.md 6.4) : pas de
  // plafond de repos courts entre deux repos longs — affiché au MJ via le
  // compteur, à arbitrer à la table.
  // TODO Thomas : plafonner à N repos courts entre deux repos longs si la
  // table le demande — ne pas choisir de plafond ici.
  function reposCourt(persoId) {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    if (role !== "mj" && !(App.estProprietaire && App.estProprietaire(p))) return;

    const gainPV = App.lancerDe(4);
    App.ajusterPv(persoId, gainPV); // gère son propre chargement/sauvegarde — cf. ajusterPv

    // Rechargé APRÈS ajusterPv pour ne jamais écraser son écriture avec un
    // instantané antérieur (même objet perso partagé, mais on rejoue par
    // prudence plutôt que de supposer l'aliasing interne du dépôt).
    const persos2 = App.chargerPersos();
    const p2 = persos2[persoId];
    if (!p2) return;
    const instance = new Personnage(p2);
    const avantPP = instance.ppActuel || 0;
    instance.reposCourtPP();
    p2.ppActuel = instance.ppActuel;
    if (typeof Capacites !== "undefined" && Capacites.reinitialiserUsagesPeriode) {
      Capacites.reinitialiserUsagesPeriode(p2, "scene");
    }
    p2.reposCourtsDepuisReposLong = (p2.reposCourtsDepuisReposLong || 0) + 1;
    App.sauverPersos(persos2);

    App.ajouterHisto(`${p2.nom} — Repos court`, gainPV, false, false, "1d4");
    toast(`☕ Repos court : ${p2.nom} récupère ${gainPV} PV et +${instance.ppActuel - avantPP} PP (${p2.reposCourtsDepuisReposLong}ᵉ depuis le dernier repos long).`);
    rendreZoneRepos();
  }

  /* ── Lancer le jet de PV en attente (joueur ou MJ) — INCHANGÉ ────── */
  function lancerJetRepos(persoId) {
    const attente = lireAttente();
    const entree = attente[persoId];
    if (!entree) return;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const rolls = [];
    const rollsNeg = [];
    let total = entree.flatPositif || 0;
    (entree.desPositifs || []).forEach((d) => { const v = App.lancerDe(d); rolls.push(v); total += v; });
    (entree.desNegatifs || []).forEach((d) => { const v = App.lancerDe(d); rollsNeg.push(v); total -= v; });
    total = Math.max(0, total);
    App.ajusterPv(persoId, total);
    const detailPos = (entree.desPositifs || []).map((d, i) => `1d${d}[${rolls[i]}]`).join("+");
    const detailFlat = entree.flatPositif ? ` ${entree.flatPositif >= 0 ? "+" : ""}${entree.flatPositif}` : "";
    const detailNeg = rollsNeg.length ? " -" + (entree.desNegatifs || []).map((d, i) => `1d${d}[${rollsNeg[i]}]`).join("-") : "";
    App.ajouterHisto(entree.label, total, false, false, detailPos + detailFlat + detailNeg);
    toast(`🛌 ${p.nom} récupère ${total} PV.`);
    delete attente[persoId];
    sauverAttente(attente);
    rendreZoneRepos();
  }

  /* ── Purge MJ d'un repos en attente non lancé — INCHANGÉ ─────────── */
  function purgerAttente(persoId) {
    if (typeof App !== "undefined" && App.obtenirRole && App.obtenirRole() !== "mj") return;
    const attente = lireAttente();
    if (!attente[persoId]) return;
    const persos = App.chargerPersos();
    const nom = (persos[persoId] && persos[persoId].nom) || persoId;
    delete attente[persoId];
    sauverAttente(attente);
    toast(`🗑 Repos en attente purgé pour ${nom} — aucun PV récupéré, or déjà prélevé non remboursé automatiquement.`);
    rendreZoneRepos();
  }

  /* ================================================================
     SCRUTIN DE REPOS LONG (repos:vote)
     ================================================================ */

  function estScrutinEnCours() { return !!lireVote(); }

  // Ouverture — bouton "🌙 Repos long" sur la fiche du propriétaire. Le
  // couchage (palierId) est choisi par l'initiateur à l'ouverture (pas de
  // négociation de tarif dans ce chantier, contrairement à l'ancien
  // formulaire MJ — hors périmètre du prompt de scrutin) et PORTÉ PAR LE
  // VOTE jusqu'à la création de l'overlay : extension délibérée du schéma
  // documenté (qui ne liste que initiateur/échéance/votants/votes/statut),
  // pour éviter une étape UI supplémentaire à l'adoption.
  function ouvrirScrutin(persoId, palierId) {
    if (lireVote()) return; // un seul scrutin à la fois
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    if (typeof App === "undefined" || !App.estProprietaire || !App.estProprietaire(p)) return;
    const joueurId = App.obtenirJoueurId ? App.obtenirJoueurId() : null;
    const joueurNom = App.obtenirJoueurNom ? App.obtenirJoueurNom() : null;
    if (!joueurId || !joueurNom) { toast("Seul un joueur identifié peut proposer un repos long."); return; }

    // Votants = présents moins l'initiateur, GELÉ à l'ouverture — quelqu'un
    // qui se déclare présent pendant les 30 secondes ne rejoint pas le
    // scrutin en cours, sinon le dénominateur bouge sous les pieds du calcul.
    const votants = (typeof Presence !== "undefined" ? Presence.presents() : [])
      .filter((j) => j.joueurId !== joueurId)
      .map((j) => j.joueurId);
    const ouvertTs = Date.now();
    const vote = {
      initiateurJoueurId: joueurId, initiateurNom: joueurNom, initiateurPersoId: persoId,
      ouvertTs, echeanceTs: ouvertTs + 30000,
      votants, votes: {}, statut: "en_cours",
      palierId: palierId || "camp",
    };
    sauverVote(vote);
    toast(`🌙 ${joueurNom} propose un repos long.`);
    _demarrerMinuteur();
    rendreZoneRepos();
    if (typeof App !== "undefined" && App.rafraichirFicheActive) App.rafraichirFicheActive();
  }

  // Le MJ ne vote pas (bouton "Résoudre maintenant" séparé). L'initiateur
  // ne vote pas non plus : il n'est jamais dans `votants`, sa voix "oui"
  // est ajoutée d'office à la résolution (cf. _resoudreScrutin).
  function voter(choix) {
    const vote = lireVote();
    if (!vote || vote.statut !== "en_cours") return;
    const joueurId = App.obtenirJoueurId ? App.obtenirJoueurId() : null;
    if (!joueurId || !vote.votants.includes(joueurId)) return;
    if (vote.votes[joueurId] !== undefined) return; // déjà voté
    vote.votes[joueurId] = choix;
    sauverVote(vote);
    rendreZoneRepos();
    // Résolution anticipée dès que tous les votants ont répondu.
    if (vote.votants.every((id) => vote.votes[id] !== undefined)) _resoudreScrutin();
  }

  // n'importe quel client peut écrire la résolution une fois l'échéance
  // passée (pas de serveur de tâches planifiées) — deux clients qui
  // résolvent à la même seconde écrivent la MÊME valeur (calcul pur,
  // déterministe à partir de votes), et SyncStore étant en dernier-
  // écrivain-gagne, le résultat est identique quel que soit celui qui
  // "gagne" la course d'écriture. La garde ci-dessous n'empêche donc pas
  // un bug de course (il n'y en a pas ici) : elle évite juste le travail
  // et les toasts redondants d'une résolution déjà faite. NE PAS
  // "corriger" en la retirant au prétexte d'une condition de course.
  function _resoudreScrutin() {
    const vote = lireVote();
    if (!vote || vote.statut !== "en_cours") return;
    const ouis = vote.votants.filter((id) => vote.votes[id] === "oui").length + 1; // +1 : l'initiateur compte comme un oui d'office
    const nons = vote.votants.filter((id) => vote.votes[id] === "non").length;
    const adopte = ouis >= nons; // égalité -> adopté, le oui l'emporte
    vote.statut = adopte ? "adopte" : "rejete";
    sauverVote(vote);
    _arreterMinuteur();
    if (adopte) {
      _creerOverlay(vote);
      toast(`🌙 Repos long adopté (${ouis} oui / ${nons} non).`);
    } else {
      toast(`Repos long rejeté (${ouis} oui / ${nons} non).`);
      // La bannière affiche le rejet 5 secondes avant de revenir à zéro.
      setTimeout(() => {
        const v = lireVote();
        if (v && v.statut === "rejete") sauverVote(null);
        rendreZoneRepos();
      }, 5000);
    }
    rendreZoneRepos();
    if (typeof App !== "undefined" && App.rafraichirFicheActive) App.rafraichirFicheActive();
  }

  // Minuteur local, sans serveur — un setInterval par client qui affiche un
  // scrutin en_cours, arrêté dès que le scrutin n'est plus en_cours (ici ou
  // via un autre client). Rafraîchit aussi le décompte affiché chaque
  // seconde, pas seulement à l'échéance.
  let _minuteurId = null;
  function _demarrerMinuteur() {
    if (_minuteurId) return;
    _minuteurId = setInterval(() => {
      const vote = lireVote();
      if (!vote || vote.statut !== "en_cours") { _arreterMinuteur(); return; }
      if (Date.now() >= vote.echeanceTs) _resoudreScrutin();
      else rendreZoneRepos();
    }, 1000);
  }
  function _arreterMinuteur() {
    if (_minuteurId) { clearInterval(_minuteurId); _minuteurId = null; }
  }

  /* ================================================================
     OVERLAY COLLECTIF DE REPOS LONG (repos:encours)
     ================================================================ */

  // Convives = personnages des joueurs déclarés présents. Un joueur avec
  // deux fiches est pré-affecté à la première trouvée (ordre des clés) —
  // switchable ensuite depuis l'overlay (cf. data-changer-convive). Le
  // couchage est celui choisi par l'initiateur à l'ouverture du scrutin
  // (cf. vote.palierId).
  function _creerOverlay(vote) {
    const persos = App.chargerPersos();
    const presents = (typeof Presence !== "undefined") ? Presence.presents() : [];
    const convives = [];
    presents.forEach((joueur) => {
      const mesPersos = Object.keys(persos).filter((id) => persos[id] && persos[id].classe && _memeNom(persos[id].proprietaireNom, joueur.nom));
      if (mesPersos.length) convives.push(mesPersos[0]);
    });
    // L'initiateur vient d'agir : toujours convive, même s'il n'apparaît
    // pas dans Presence pour une raison ou une autre.
    if (vote.initiateurPersoId && !convives.includes(vote.initiateurPersoId)) convives.unshift(vote.initiateurPersoId);

    sauverEncours({
      convives,
      couchage: vote.palierId || "camp",
      plats: [],
      attributions: {},
      statut: "cuisine",
      // recoltes (prompt_recolte_4_repos.md §2.1) : { [persoId]: { metierId,
      // milieuId, itemId, qualiteId, unites, aleaD } }. Sa présence vaut
      // compteur — un convive qui y figure a déjà récolté ce repos-ci.
      // Toujours initialisé (même en dortoir/chambre/luxe, où le bloc
      // Récolte ne s'affiche juste jamais) pour que Recolte.tenter()
      // (js/recolte.js) trouve toujours la forme attendue.
      recoltes: {},
      // veillee (prompt_musicien_7_veillee.md §2) : null jusqu'à ce qu'un
      // musicien joue, puis { persoId, morceauId, qualiteId, portee } — sa
      // seule présence vaut compteur "une seule veillée par repos long,
      // tous musiciens confondus", même patron que recoltes ci-dessus.
      // Contrairement à la récolte, le bloc Veillée s'affiche à TOUS les
      // couchages (on joue aussi en salle d'auberge) — veillee est donc
      // TOUJOURS pertinent, jamais conditionné au couchage.
      veillee: null,
    });
  }

  // Un joueur avec plusieurs personnages peut changer lequel mange —
  // remplace l'entrée dans `convives` (l'ancien persoId perd toute
  // attribution en cours, la nouvelle repart de "rien").
  function changerConvive(ancienPersoId, nouveauPersoId) {
    const encours = lireEncours();
    if (!encours) return;
    const idx = encours.convives.indexOf(ancienPersoId);
    if (idx === -1) return;
    encours.convives[idx] = nouveauPersoId;
    const attrib = encours.attributions[ancienPersoId];
    delete encours.attributions[ancienPersoId];
    if (typeof attrib === "number" && encours.plats[attrib]) encours.plats[attrib].portionsRestantes++;
    _recalculerStatut(encours);
    sauverEncours(encours);
    _rendreOverlayRepos();
  }

  function _recalculerStatut(encours) {
    const portionsPool = encours.plats.reduce((t, pl) => t + pl.portionsRestantes, 0);
    encours.statut = portionsPool >= encours.convives.length ? "pret" : "cuisine";
  }

  /* ================================================================
     RÉCOLTE DANS L'OVERLAY (prompt_recolte_4_repos.md) — un bloc
     SUPPLÉMENTAIRE, jamais une phase : elle ne touche JAMAIS
     encours.statut/_recalculerStatut, ne peut donc jamais empêcher un
     groupe de valider son repos. Uniquement au couchage "camp" — en
     dortoir/chambre/luxe on est en ville, on achète (cf. §1 du prompt).
     ================================================================ */

  // joueurId d'un convive : un personnage n'a pas de joueurId propre, seul
  // son propriétaire en a un via sa présence déclarée (cf. Presence,
  // js/seance.js) — même résolution par nom que _creerOverlay ci-dessus.
  function _joueurIdDuConvive(p) {
    const presents = (typeof Presence !== "undefined") ? Presence.presents() : [];
    const trouve = presents.find((j) => _memeNom(p.proprietaireNom, j.nom));
    return trouve ? trouve.joueurId : null;
  }

  // Convives éligibles à une requête de récolte : ont déclaré traque OU
  // alchimie sur leur fiche (p.metiersPratiques, cf. js/app.js — Recolte.
  // metiersDe le lit) ET n'ont pas déjà récolté ce repos-ci (présence dans
  // encours.recoltes, cf. Recolte.tenter).
  function _convivesEligiblesRecolte(encours, persos) {
    if (typeof Recolte === "undefined") return [];
    return encours.convives.filter((persoId) => {
      const p = persos[persoId];
      if (!p) return false;
      if (encours.recoltes && encours.recoltes[persoId]) return false;
      return Recolte.metiersDe(p).some((m) => m === "traque" || m === "alchimie");
    });
  }

  // MJ uniquement — construit `cibles` et ouvre la requête. Pas
  // d'automatisme à l'ouverture de l'overlay (cf. §1.3) : c'est un clic
  // délibéré du MJ, qui décide si le groupe a le temps de battre les bois.
  function lancerRecoltes() {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    if (role !== "mj") return;
    const encours = lireEncours();
    if (!encours || encours.couchage !== "camp") return;
    if (lireDemandeRecolte()) return; // une requête à la fois
    const persos = App.chargerPersos();
    const eligibles = _convivesEligiblesRecolte(encours, persos);
    if (!eligibles.length) { toast("Aucun convive éligible à la récolte."); return; }
    const cibles = eligibles.map((persoId) => {
      const p = persos[persoId];
      return { persoId, joueurId: _joueurIdDuConvive(p), nom: p.nom, metiers: Recolte.metiersDe(p).filter((m) => m === "traque" || m === "alchimie") };
    });
    const ouvertTs = Date.now();
    sauverDemandeRecolte({ ouvertTs, echeanceTs: ouvertTs + ECHEANCE_DEMANDE_RECOLTE_MS, cibles, repondus: [], statut: "en_attente" });
    toast(`🌿 Requête de récolte envoyée à ${cibles.length} convive${cibles.length > 1 ? "s" : ""}.`);
    _demarrerMinuteurRecolte();
    _rendreOverlayRepos();
  }

  // Relais MJ ("⏩ Clore les récoltes") — clôt sans attendre le décompte.
  // Les joueurs qui n'ont pas répondu n'ont simplement pas récolté : aucun
  // jet n'est lancé à leur place (cf. §2.2).
  function clorerRecoltes() {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    if (role !== "mj") return;
    if (!lireDemandeRecolte()) return;
    sauverDemandeRecolte(null);
    _arreterMinuteurRecolte();
    toast("Récoltes closes.");
    _rendreOverlayRepos();
  }

  // Minuteur local sans serveur, même patron que _demarrerMinuteur/
  // _arreterMinuteur (scrutin) — mais ICI la requête se CLÔT elle-même à
  // l'échéance (cf. §2.2 : "la requête se clôt d'elle-même"), contrairement
  // à la demande météo qui attend un relais manuel. Plusieurs clients
  // peuvent écrire ce null en même temps sans risque (même raisonnement que
  // _resoudreScrutin : calcul déterministe, dernier-écrivain-gagne anodin).
  let _minuteurRecolteId = null;
  function _demarrerMinuteurRecolte() {
    if (_minuteurRecolteId) return;
    _minuteurRecolteId = setInterval(() => {
      const d = lireDemandeRecolte();
      if (!d || d.statut !== "en_attente") { _arreterMinuteurRecolte(); return; }
      if (Date.now() >= d.echeanceTs) { sauverDemandeRecolte(null); _arreterMinuteurRecolte(); _rendreOverlayRepos(); return; }
      _rendreOverlayRepos();
      _rendreModalRecolte();
    }, 1000);
  }
  function _arreterMinuteurRecolte() {
    if (_minuteurRecolteId) { clearInterval(_minuteurRecolteId); _minuteurRecolteId = null; }
  }

  /* ── Modale de récolte (#modal-recolte), chez le joueur sollicité —
     même patron que #modal-porte-ciel (js/meteo.js) : ouverte UNIQUEMENT
     chez le(s) client(s) dont joueurId figure dans `cibles` et pas encore
     dans `repondus`, fermée chez tous à la résolution/clôture. Vérifié
     avant d'écrire ce bloc : aucune infrastructure de modale générique
     n'existe dans js/app.js (chaque modal-X a son propre <div>/logique) —
     overlay local ici, sur le modèle demandé par le prompt à défaut. ── */

  // État local des sélecteurs de la modale (par navigateur, pas synchronisé
  // — ne concerne que l'affichage avant le jet, jamais son résultat).
  let _recolteChoix = { metierId: null, milieuId: null, itemId: null };

  function _maCibleRecolte(demande) {
    if (!demande || demande.statut !== "en_attente") return null;
    const moi = (typeof App !== "undefined" && App.obtenirJoueurId) ? App.obtenirJoueurId() : null;
    return demande.cibles.find((c) => c.joueurId === moi && !demande.repondus.includes(c.persoId)) || null;
  }

  function _rendreModalRecolte() {
    const modal = document.getElementById("modal-recolte");
    if (!modal) return;
    const demande = lireDemandeRecolte();
    const cible = _maCibleRecolte(demande);
    if (!cible) { modal.style.display = "none"; _recolteChoix = { metierId: null, milieuId: null, itemId: null }; return; }
    const corps = document.getElementById("modal-recolte-corps");
    if (!corps) return;
    const persos = App.chargerPersos();
    const p = persos[cible.persoId];
    if (!p) { modal.style.display = "none"; return; }
    modal.style.display = "flex";

    // 1. Métier — sélecteur seulement si les deux sont déclarés.
    if (!_recolteChoix.metierId || !cible.metiers.includes(_recolteChoix.metierId)) _recolteChoix.metierId = cible.metiers[0];
    const blocMetier = cible.metiers.length > 1
      ? `<label>Métier
          <select id="recolte-select-metier">${cible.metiers.map((m) => `<option value="${m}"${m === _recolteChoix.metierId ? " selected" : ""}>${echapper(METIERS[m].icone + " " + METIERS[m].nom)}</option>`).join("")}</select>
        </label>`
      : `<div>${echapper(METIERS[_recolteChoix.metierId].icone + " " + METIERS[_recolteChoix.metierId].nom)}</div>`;

    // 2. Milieu — limité à ceux de la région météo courante (cf. §4.2).
    const regionId = (typeof Meteo !== "undefined" && Meteo.obtenirEtat) ? Meteo.obtenirEtat().regionId : null;
    const milieuxDispo = (regionId && typeof MILIEUX_PAR_REGION !== "undefined") ? (MILIEUX_PAR_REGION[regionId] || []) : [];
    if (!milieuxDispo.length) {
      corps.innerHTML = `<p><strong>${echapper(p.nom)}</strong></p>${blocMetier}
        <p class="vide">Aucun milieu accessible dans cette région — pas de récolte possible ce soir.</p>
        <div class="barre-actions"><button class="btn secondaire" id="recolte-btn-fermer-vide">Fermer</button></div>`;
      document.getElementById("recolte-btn-fermer-vide").onclick = () => _repondreRecolte(cible.persoId);
      return;
    }
    if (!_recolteChoix.milieuId || !milieuxDispo.includes(_recolteChoix.milieuId)) _recolteChoix.milieuId = milieuxDispo[0];
    const blocMilieu = `<label>Milieu
      <select id="recolte-select-milieu">${milieuxDispo.map((mid) => {
        const m = (typeof MILIEUX_RECOLTE !== "undefined") ? MILIEUX_RECOLTE.find((x) => x.id === mid) : null;
        return `<option value="${mid}"${mid === _recolteChoix.milieuId ? " selected" : ""}>${m ? echapper(m.icone + " " + m.nom) : echapper(mid)}</option>`;
      }).join("")}</select>
    </label>`;

    // 3. Espèce visée, groupée par rareté, seuil affiché à côté de chacune —
    // les espèces hors de portée du rang NE SONT PAS listées (cf. §4.3 :
    // "pas grisées : listées, elles inviteraient à demander une dérogation").
    const rangMetier = Metiers.rang(p, _recolteChoix.metierId);
    const especes = Recolte.especesDisponibles(regionId, _recolteChoix.milieuId, _recolteChoix.metierId, rangMetier);
    if (!_recolteChoix.itemId || !especes.some((e) => e.item.id === _recolteChoix.itemId)) {
      _recolteChoix.itemId = especes.length ? especes[0].item.id : null;
    }
    const parRarete = {};
    especes.forEach((e) => { (parRarete[e.rarete] = parRarete[e.rarete] || []).push(e); });
    const optionsEspeces = Object.keys(RARETES_RECOLTE).filter((r) => parRarete[r] && parRarete[r].length).map((r) => {
      const opts = parRarete[r].map((e) => {
        const S = Recolte.seuilEffectif(e.rangCible, rangMetier);
        return `<option value="${e.item.id}"${e.item.id === _recolteChoix.itemId ? " selected" : ""}>${echapper(e.item.nom)} — seuil ${S}</option>`;
      }).join("");
      return `<optgroup label="${echapper(RARETES_RECOLTE[r].nom)}">${opts}</optgroup>`;
    }).join("");

    // 4. Détail du modificateur — chaque composante sur sa ligne, aucun
    // modificateur silencieux (cf. §4.4).
    const mods = Recolte.modificateurs(p, _recolteChoix.metierId);
    const signe = (n) => (n >= 0 ? "+" : "") + n;
    const detailMods = mods.detail.map((d) => `<div>${echapper(d.libelle)} ${signe(d.valeur)}</div>`).join("");

    corps.innerHTML = `
      <p><strong>${echapper(p.nom)}</strong></p>
      ${blocMetier}
      ${blocMilieu}
      <label>Espèce visée
        <select id="recolte-select-espece">${optionsEspeces || `<option value="">— Aucune espèce accessible à ce rang —</option>`}</select>
      </label>
      <div class="carte" style="margin-top:8px;">
        ${detailMods}
        <div style="margin-top:4px;"><strong>Total : ${signe(mods.total)}</strong></div>
      </div>
      <div class="barre-actions" style="margin-top:10px;">
        <button class="btn or" id="recolte-btn-lancer"${especes.length ? "" : " disabled"}>🎲 Récolter</button>
      </div>
      <div id="recolte-resultat" style="margin-top:10px;"></div>
    `;
    const selMetier = document.getElementById("recolte-select-metier");
    if (selMetier) selMetier.onchange = (e) => { _recolteChoix.metierId = e.target.value; _recolteChoix.itemId = null; _rendreModalRecolte(); };
    document.getElementById("recolte-select-milieu").onchange = (e) => { _recolteChoix.milieuId = e.target.value; _recolteChoix.itemId = null; _rendreModalRecolte(); };
    const selEspece = document.getElementById("recolte-select-espece");
    if (selEspece) selEspece.onchange = (e) => { _recolteChoix.itemId = e.target.value; };
    document.getElementById("recolte-btn-lancer").onclick = () => _lancerJetRecolte(cible.persoId);
  }

  function _lancerJetRecolte(persoId) {
    const res = Recolte.tenter(persoId, _recolteChoix.metierId, _recolteChoix.milieuId, _recolteChoix.itemId);
    const zone = document.getElementById("recolte-resultat");
    if (!res.ok) { if (zone) zone.innerHTML = `<p class="vide">${echapper(res.raison)}</p>`; return; }
    if (zone) {
      zone.innerHTML = `<p><strong>${echapper(Recolte.libelleQualite(res.resultat.qualiteId))}</strong> — ${res.unitesFinal > 0 ? `${res.unitesFinal}× ${echapper(res.itemProduit.nom)}` : "rien récolté"}${res.alea ? `<br><span style="color:var(--chaos);">⚠ ${echapper(res.alea.message)}</span>` : ""}</p>
        <button class="btn or" id="recolte-btn-fermer-resultat">Fermer</button>`;
      document.getElementById("recolte-btn-fermer-resultat").onclick = () => _repondreRecolte(persoId);
    }
    // La carte MJ/récap de l'overlay doit refléter le résultat tout de
    // suite chez les autres — Recolte.tenter() a déjà écrit encours.recoltes,
    // un simple re-rendu local suffit (SyncStore notifiera les autres clients).
    _rendreOverlayRepos();
  }

  // Marque le convive comme "répondu" (jet fait, ou milieu vide constaté) —
  // ferme la modale chez lui ; les autres clients se mettent à jour via le
  // SyncStore.subscribe(KEY_DEMANDE_RECOLTE) plus bas.
  function _repondreRecolte(persoId) {
    const demande = lireDemandeRecolte();
    if (demande && demande.statut === "en_attente" && !demande.repondus.includes(persoId)) {
      demande.repondus = demande.repondus.concat([persoId]);
      sauverDemandeRecolte(demande);
    }
    _recolteChoix = { metierId: null, milieuId: null, itemId: null };
    _rendreModalRecolte();
  }

  /* ── Bloc "🌿 Récolte" de l'overlay (vue MJ complète, vue joueur =
     récapitulatif seul) ── */
  function _htmlBlocRecolte(encours, persos, role) {
    if (encours.couchage !== "camp") return "";
    const recoltesFaites = encours.recoltes || {};
    const recap = Object.keys(recoltesFaites).map((persoId) => {
      const p = persos[persoId];
      const r = recoltesFaites[persoId];
      if (!p) return "";
      const item = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.id === r.itemId) : null;
      const milieu = (typeof MILIEUX_RECOLTE !== "undefined") ? MILIEUX_RECOLTE.find((m) => m.id === r.milieuId) : null;
      const icone = r.metierId === "traque" ? "🏹" : "⚗️";
      const nomMetier = (typeof METIERS !== "undefined" && METIERS[r.metierId]) ? METIERS[r.metierId].nom : r.metierId;
      let ligne = `<div>${icone} ${echapper(p.nom)} — ${echapper(nomMetier)} · ${milieu ? echapper(milieu.nom) : echapper(r.milieuId)} · ${item ? echapper(item.nom) : echapper(r.itemId)} — ${echapper((typeof Recolte !== "undefined") ? Recolte.libelleQualite(r.qualiteId) : r.qualiteId)}${r.unites ? `, ${r.unites} unité${r.unites > 1 ? "s" : ""}` : ""}</div>`;
      if (r.aleaD != null && typeof ALEAS_RECOLTE !== "undefined") {
        const alea = ALEAS_RECOLTE.find((a) => a.d === r.aleaD);
        if (alea) ligne += `<div style="font-size:0.82rem;color:var(--chaos);margin-left:22px;">${echapper(alea.nom)} — ${echapper(alea[r.metierId] || "")}</div>`;
      }
      return ligne;
    }).join("");

    let corpsMJ = "";
    if (role === "mj") {
      const demande = lireDemandeRecolte();
      if (demande && demande.statut === "en_attente") {
        const secondes = Math.max(0, Math.ceil((demande.echeanceTs - Date.now()) / 1000));
        const statuts = demande.cibles.map((c) => `<div>${demande.repondus.includes(c.persoId) ? "✅" : "⏳"} ${echapper(c.nom)}</div>`).join("");
        corpsMJ = `<div style="margin-top:6px;">⏳ ${secondes}s restantes — ${demande.repondus.length}/${demande.cibles.length} ont répondu.</div>
          ${statuts}
          <button class="btn petit secondaire" id="btn-clore-recoltes" style="margin-top:6px;">⏩ Clore les récoltes</button>`;
      } else {
        const eligibles = _convivesEligiblesRecolte(encours, persos);
        const desactive = !eligibles.length;
        let explication = "";
        if (desactive) {
          explication = Object.keys(recoltesFaites).length
            ? "Tous les convives éligibles ont déjà récolté ce repos."
            : "Aucun convive n'a déclaré la Traque ou l'Alchimie sur sa fiche.";
        }
        corpsMJ = `<button class="btn or" id="btn-lancer-recoltes"${desactive ? " disabled" : ""}>🌿 Lancer les récoltes</button>
          ${explication ? `<div style="font-size:0.82rem;color:#6a6278;margin-top:4px;">${echapper(explication)}</div>` : ""}`;
      }
    }

    return `<div class="carte" style="margin-top:10px;">
      <h4 style="margin-top:0;">🌿 Récolte</h4>
      ${corpsMJ}
      ${recap ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">${recap}</div>` : ""}
    </div>`;
  }

  // Bannière "Rencontre à tirer" — MJ uniquement. Alimentée par
  // SyncStore["recolte:rencontres"] (cf. js/recolte.js, _appliquerAlea cas
  // "rencontre"). Volontairement PASSIVE : elle ne fait qu'informer le MJ,
  // jamais n'interrompt le repos long ni ne force un jet — c'est au MJ
  // d'arbitrer (au dé, en RP, etc.) puis de cocher "Traité" une fois fait.
  function _htmlBanniereRencontres(role) {
    if (role !== "mj") return "";
    const rencontres = SyncStore.get("recolte:rencontres") || [];
    if (!rencontres.length) return "";
    const lignes = rencontres.map((r, idx) => `<div class="carte" style="margin-top:6px;border-color:var(--chaos);">
      🐺 Rencontre à tirer — la récolte de ${echapper(r.nom || "?")} a mal tourné${r.majeure ? " (majeure)" : ""}.
      <button class="btn petit secondaire" data-traiter-rencontre="${idx}" style="margin-left:8px;">✔️ Traité</button>
    </div>`).join("");
    return lignes;
  }

  function _traiterRencontre(idx) {
    const rencontres = SyncStore.get("recolte:rencontres") || [];
    rencontres.splice(idx, 1);
    SyncStore.set("recolte:rencontres", rencontres);
    _rendreOverlayRepos();
  }

  // N'importe quel convive peut se déclarer cuisinier. Le jet/qualité/XP/
  // consommation passent par Cuisine.tenterRecette (moteur existant, cf.
  // js/cuisine.js) — cette fonction ne fait QUE décider quoi faire du plat
  // produit : ici, un pool PARTAGÉ de 4 portions (jamais placé dans
  // l'inventaire du cuisinier, contrairement à l'Atelier).
  function cuisinerDansOverlay(cuisinierPersoId, recetteId) {
    const encours = lireEncours();
    if (!encours) return;
    if (!encours.convives.includes(cuisinierPersoId)) { toast("Seul un convive peut cuisiner pour le groupe."); return; }
    const t = Cuisine.tenterRecette(cuisinierPersoId, recetteId);
    if (!t.ok) { toast(t.raison); return; }

    let msg = `${t.nomCuisinier} — ${t.resultat.qualite.nom}`;
    if (t.resultat.produit) {
      const plat = {
        cuisinierPersoId, recetteId,
        qualiteId: t.resultat.qualite.id, indexDe: t.recette.indexDe,
        de: t.resultat.de, maximise: t.resultat.maximise, intoxication: t.resultat.intoxication,
        portionsRestantes: 4,
      };
      encours.plats.push(plat);
      const idx = encours.plats.length - 1;
      // Pré-remplissage automatique dans l'ordre des convives — n'écrase
      // JAMAIS une attribution déjà faite (rien, ration, ou un autre plat) :
      // seuls les convives encore sans choix sont servis en premier.
      encours.convives.forEach((persoId) => {
        if (plat.portionsRestantes <= 0 || encours.attributions[persoId] !== undefined) return;
        encours.attributions[persoId] = idx;
        plat.portionsRestantes--;
      });
      msg += ` : plat ajouté au pool commun (4 portions).`;
    } else {
      msg += t.resultat.qualite.id === "rate" ? " : rien produit, ingrédients perdus." : " : intoxication — dé soustrait au repos.";
    }
    if (t.resultat.xpGagne) msg += ` +${t.resultat.xpGagne} XP Cuisine.`;
    _recalculerStatut(encours);
    sauverEncours(encours);
    toast(msg);
    _rendreOverlayRepos();
  }

  // Raté/désastre → le cuisinier peut retenter tant qu'il lui reste des
  // tentatives (cf. Cuisine.tenterRecette, même compteur atelier:tentatives
  // que l'Atelier) — aucune limite propre à ajouter ici.

  // Le cuisinier (ou le MJ) peut jeter un plat de désastre plutôt que de le
  // servir. Réindexe les attributions pointant sur un index supérieur
  // (décalées par le splice) et libère celles qui pointaient sur CE plat.
  function jeterPlat(index) {
    const encours = lireEncours();
    if (!encours || !encours.plats[index]) return;
    Object.keys(encours.attributions).forEach((persoId) => {
      const a = encours.attributions[persoId];
      if (a === index) delete encours.attributions[persoId];
      else if (typeof a === "number" && a > index) encours.attributions[persoId] = a - 1;
    });
    encours.plats.splice(index, 1);
    _recalculerStatut(encours);
    sauverEncours(encours);
    toast("Plat jeté.");
    _rendreOverlayRepos();
  }

  // choix : index numérique (plat), "ration", ou null (rien — Fatiguée).
  // Décrémente/ré-incrémente portionsRestantes du plat concerné.
  function attribuer(persoId, choix) {
    const encours = lireEncours();
    if (!encours) return;
    const ancien = encours.attributions[persoId];
    if (typeof ancien === "number" && encours.plats[ancien]) encours.plats[ancien].portionsRestantes++;
    if (typeof choix === "number" && encours.plats[choix] && encours.plats[choix].portionsRestantes > 0) {
      encours.plats[choix].portionsRestantes--;
      encours.attributions[persoId] = choix;
    } else if (choix === "ration") {
      encours.attributions[persoId] = "ration";
    } else {
      delete encours.attributions[persoId];
    }
    _recalculerStatut(encours);
    sauverEncours(encours);
    _rendreOverlayRepos();
  }

  /* ================================================================
     VEILLÉE DANS L'OVERLAY (prompt_musicien_7_veillee.md) — un bloc
     SUPPLÉMENTAIRE, jamais une phase : elle ne touche JAMAIS
     encours.statut/_recalculerStatut, ne peut donc jamais empêcher un
     groupe de valider son repos. Contrairement à la Récolte, PAS limitée
     au couchage "camp" : on joue aussi en salle d'auberge, et c'est même
     là que c'est le plus naturel — le bloc apparaît donc à TOUS les
     couchages. Ordre du bloc camp, documenté ici car un futur remaniement
     d'UI le réordonnera "pour la lisibilité" sinon : Récolte → Cuisine →
     Veillée. On chasse avant de cuisiner, on joue après avoir mangé.
     ================================================================ */

  // Métiers effectivement "pratiqués" pour p — même repli que
  // js/app.js htmlMetiersPratiques (prompt_musicien_6_metier.md §7) : un
  // Barde jamais renseigné (p.metiersPratiques undefined) est traité comme
  // ayant Musique par défaut jusqu'à un premier choix explicite (même un
  // tableau vide, qui prime alors pour toujours). Dupliqué ici plutôt que
  // d'exposer une fonction privée d'app.js — même discipline que les
  // autres modules self-contained (cf. js/alchimie.js).
  function _metiersEffectifs(p) {
    if (p.metiersPratiques !== undefined) return p.metiersPratiques;
    return (typeof METIERS !== "undefined") ? Object.keys(METIERS).filter((m) => METIERS[m].autoClasse === p.classe) : [];
  }

  // Convives éligibles à une requête de veillée : ont déclaré Musique
  // (ou en héritent par défaut, cf. _metiersEffectifs) — PAS de condition
  // sur encours.veillee ici (contrairement à la Récolte, qui exclut ceux
  // qui ont déjà récolté) : TOUS les musiciens sont sollicités à la fois,
  // "s'ils sont deux, ils choisissent qui joue" (§2) — c'est Musique.jouer()
  // qui refuse une deuxième veillée, pas le filtre d'éligibilité.
  function _convivesEligiblesMusique(encours, persos) {
    return encours.convives.filter((persoId) => {
      const p = persos[persoId];
      if (!p) return false;
      return _metiersEffectifs(p).includes("musicien");
    });
  }

  // MJ uniquement — construit `cibles` et ouvre la requête. Pas
  // d'automatisme : un clic délibéré du MJ, même patron que lancerRecoltes.
  function lancerVeillee() {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    if (role !== "mj") return;
    const encours = lireEncours();
    if (!encours) return;
    if (encours.veillee) { toast("Une veillée a déjà été jouée ce repos-ci."); return; }
    if (lireDemandeMusique()) return; // une requête à la fois
    const persos = App.chargerPersos();
    const eligibles = _convivesEligiblesMusique(encours, persos);
    if (!eligibles.length) { toast("Aucun convive n'a déclaré le métier de Musique sur sa fiche."); return; }
    const cibles = eligibles.map((persoId) => {
      const p = persos[persoId];
      return { persoId, joueurId: _joueurIdDuConvive(p), nom: p.nom };
    });
    const ouvertTs = Date.now();
    sauverDemandeMusique({ ouvertTs, echeanceTs: ouvertTs + ECHEANCE_DEMANDE_MUSIQUE_MS, cibles, repondus: [], statut: "en_attente" });
    toast(`🎵 Requête de veillée envoyée à ${cibles.length} convive${cibles.length > 1 ? "s" : ""}.`);
    _demarrerMinuteurMusique();
    _rendreOverlayRepos();
  }

  // Relais MJ ("⏩ Clore la veillée") — clôt sans attendre le décompte.
  function clorerVeillee() {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    if (role !== "mj") return;
    if (!lireDemandeMusique()) return;
    sauverDemandeMusique(null);
    _arreterMinuteurMusique();
    toast("Veillée close.");
    _rendreOverlayRepos();
  }

  // Minuteur local, même patron que _demarrerMinuteurRecolte : la requête
  // se clôt elle-même à l'échéance (60 s), contrairement à la demande
  // météo qui attend un relais manuel.
  let _minuteurMusiqueId = null;
  function _demarrerMinuteurMusique() {
    if (_minuteurMusiqueId) return;
    _minuteurMusiqueId = setInterval(() => {
      const d = lireDemandeMusique();
      if (!d || d.statut !== "en_attente") { _arreterMinuteurMusique(); return; }
      if (Date.now() >= d.echeanceTs) { sauverDemandeMusique(null); _arreterMinuteurMusique(); _rendreOverlayRepos(); return; }
      _rendreOverlayRepos();
      _rendreModalVeillee();
    }, 1000);
  }
  function _arreterMinuteurMusique() {
    if (_minuteurMusiqueId) { clearInterval(_minuteurMusiqueId); _minuteurMusiqueId = null; }
  }

  /* ── Modale du musicien (#modal-veillee), chez le joueur sollicité —
     même patron que #modal-recolte (donc #modal-porte-ciel). Une requête
     peut solliciter PLUSIEURS musiciens à la fois ; dès que l'un joue
     (encours.veillee non-null), _maCibleVeillee renvoie null pour TOUS les
     autres — leur modale se referme, même sans qu'ils aient eux-mêmes
     répondu (cf. §2 : "s'ils sont deux, ils choisissent qui joue"). ── */

  let _veilleeChoix = { morceauId: null, cible: null };

  function _maCibleVeillee(demande) {
    if (!demande || demande.statut !== "en_attente") return null;
    const encours = lireEncours();
    if (encours && encours.veillee) return null; // le créneau est déjà pris
    const moi = (typeof App !== "undefined" && App.obtenirJoueurId) ? App.obtenirJoueurId() : null;
    return demande.cibles.find((c) => c.joueurId === moi && !demande.repondus.includes(c.persoId)) || null;
  }

  function _rendreModalVeillee() {
    const modal = document.getElementById("modal-veillee");
    if (!modal) return;
    const demande = lireDemandeMusique();
    const cible = _maCibleVeillee(demande);
    if (!cible) { modal.style.display = "none"; _veilleeChoix = { morceauId: null, cible: null }; return; }
    const corps = document.getElementById("modal-veillee-corps");
    if (!corps) return;
    const persos = App.chargerPersos();
    const p = persos[cible.persoId];
    if (!p) { modal.style.display = "none"; return; }
    modal.style.display = "flex";

    // 1. Morceau — Musique.morceauxDisponibles filtre déjà rang+bardeSeul ;
    // les morceaux hors de portée ne sont PAS listés (même règle que la
    // Récolte : listés, ils inviteraient à négocier une dérogation chaque
    // soir).
    const rangMusicien = (typeof Metiers !== "undefined") ? Metiers.rang(p, "musicien") : 0;
    const morceaux = (typeof Musique !== "undefined") ? Musique.morceauxDisponibles(p, rangMusicien) : [];
    if (!morceaux.length) {
      corps.innerHTML = `<p><strong>${echapper(p.nom)}</strong></p>
        <p class="vide">Aucun morceau accessible à ce rang.</p>
        <div class="barre-actions"><button class="btn secondaire" id="veillee-btn-fermer-vide">Fermer</button></div>`;
      document.getElementById("veillee-btn-fermer-vide").onclick = () => _repondreVeillee(cible.persoId);
      return;
    }
    if (!_veilleeChoix.morceauId || !morceaux.some((m) => m.id === _veilleeChoix.morceauId)) {
      _veilleeChoix.morceauId = morceaux[0].id;
    }
    const morceau = morceaux.find((m) => m.id === _veilleeChoix.morceauId);

    const parRang = {};
    morceaux.forEach((m) => { (parRang[m.rang] = parRang[m.rang] || []).push(m); });
    const optionsMorceaux = Object.keys(parRang).sort((a, b) => a - b).map((r) => {
      const opts = parRang[r].map((m) =>
        `<option value="${m.id}"${m.id === _veilleeChoix.morceauId ? " selected" : ""}>${echapper(m.nom)} — difficulté ${difficulteMorceau(m)}</option>`
      ).join("");
      return `<optgroup label="Rang ${r}">${opts}</optgroup>`;
    }).join("");

    // 2. Sauvegarde visée — UNIQUEMENT si morceau.cible === "choix" (Le
    // Repas long), déclarée AVANT le jet, jamais après.
    let blocCible = "";
    if (morceau.cible === "choix") {
      if (!_veilleeChoix.cible) _veilleeChoix.cible = Object.keys(SAUVEGARDES)[0];
      blocCible = `<label>Sauvegarde visée
        <select id="veillee-select-cible">${Object.keys(SAUVEGARDES).map((s) =>
          `<option value="${s}"${s === _veilleeChoix.cible ? " selected" : ""}>${echapper((typeof Sauvegardes !== "undefined" && Sauvegardes.LIBELLES[s]) || s)}</option>`
        ).join("")}</select>
      </label>`;
    } else {
      _veilleeChoix.cible = null;
    }

    // 3. Détail du bonus — une ligne par terme, aucun modificateur silencieux.
    const mods = (typeof Musique !== "undefined") ? Musique.bonusJet(p) : { bonus: 0, detail: [] };
    const signe = (n) => (n >= 0 ? "+" : "") + n;
    const detailMods = mods.detail.map((d) => `<div>${echapper(d.libelle)} ${signe(d.valeur)}</div>`).join("");

    corps.innerHTML = `
      <p><strong>${echapper(p.nom)}</strong></p>
      <label>Morceau
        <select id="veillee-select-morceau">${optionsMorceaux}</select>
      </label>
      <p style="font-size:0.85rem;color:#8a8296;margin:4px 0;">${echapper(morceau.description)}</p>
      ${blocCible}
      <div class="carte" style="margin-top:8px;">
        ${detailMods}
        <div style="margin-top:4px;"><strong>Total : ${signe(mods.bonus)}</strong></div>
      </div>
      <div class="barre-actions" style="margin-top:10px;">
        <button class="btn or" id="veillee-btn-lancer">🎲 Jouer</button>
      </div>
      <div id="veillee-resultat" style="margin-top:10px;"></div>
    `;
    document.getElementById("veillee-select-morceau").onchange = (e) => {
      _veilleeChoix.morceauId = e.target.value; _veilleeChoix.cible = null; _rendreModalVeillee();
    };
    const selCible = document.getElementById("veillee-select-cible");
    if (selCible) selCible.onchange = (e) => { _veilleeChoix.cible = e.target.value; };
    document.getElementById("veillee-btn-lancer").onclick = () => _lancerJetVeillee(cible.persoId);
  }

  function _lancerJetVeillee(persoId) {
    const res = (typeof Musique !== "undefined") ? Musique.jouer(persoId, _veilleeChoix.morceauId, _veilleeChoix.cible) : { ok: false, raison: "Musique indisponible." };
    const zone = document.getElementById("veillee-resultat");
    if (!res.ok) { if (zone) zone.innerHTML = `<p class="vide">${echapper(res.raison)}</p>`; return; }
    if (zone) {
      const libelle = (typeof Musique !== "undefined") ? Musique.libelleQualite(res.qualiteId) : res.qualiteId;
      zone.innerHTML = `<p><strong>${echapper(libelle)}</strong> — ${res.portee.length ? `${res.portee.length} convive${res.portee.length > 1 ? "s" : ""} couvert${res.portee.length > 1 ? "s" : ""}` : "aucun effet"}</p>
        <button class="btn or" id="veillee-btn-fermer-resultat">Fermer</button>`;
      document.getElementById("veillee-btn-fermer-resultat").onclick = () => _repondreVeillee(persoId);
    }
    // Musique.jouer() a déjà écrit encours.veillee et musique:veillee — un
    // simple re-rendu local suffit (SyncStore notifiera les autres clients,
    // dont les autres musiciens sollicités, dont la modale se refermera
    // via _maCibleVeillee ci-dessus).
    _rendreOverlayRepos();
  }

  // Marque le convive comme "répondu" (jet fait, ou aucun morceau
  // accessible constaté) — ferme la modale chez lui ; les autres clients
  // se mettent à jour via SyncStore.subscribe(KEY_DEMANDE_MUSIQUE) plus bas.
  function _repondreVeillee(persoId) {
    const demande = lireDemandeMusique();
    if (demande && demande.statut === "en_attente" && !demande.repondus.includes(persoId)) {
      demande.repondus = demande.repondus.concat([persoId]);
      sauverDemandeMusique(demande);
    }
    _veilleeChoix = { morceauId: null, cible: null };
    _rendreModalVeillee();
  }

  /* ── Bloc "🎵 Veillée" de l'overlay (vue MJ complète, vue joueur =
     récapitulatif seul) — affiché à TOUS les couchages, contrairement au
     bloc Récolte (cf. en-tête de section). ── */
  function _htmlBlocVeillee(encours, persos, role) {
    const v = encours.veillee;
    let recap = "";
    if (v) {
      const p = persos[v.persoId];
      const morceau = (typeof REPERTOIRE_MUSIQUE !== "undefined") ? REPERTOIRE_MUSIQUE.find((m) => m.id === v.morceauId) : null;
      const libelle = (typeof Musique !== "undefined") ? Musique.libelleQualite(v.qualiteId) : v.qualiteId;
      recap = `<div>🎵 ${echapper(p ? p.nom : "?")} — ${echapper(morceau ? morceau.nom : v.morceauId)} — ${echapper(libelle)}${v.portee.length ? `, ${v.portee.length} convive${v.portee.length > 1 ? "s" : ""} couvert${v.portee.length > 1 ? "s" : ""}` : ""}</div>`;
    }

    let corpsMJ = "";
    if (role === "mj") {
      const demande = lireDemandeMusique();
      if (demande && demande.statut === "en_attente") {
        const secondes = Math.max(0, Math.ceil((demande.echeanceTs - Date.now()) / 1000));
        const statuts = demande.cibles.map((c) => `<div>${(demande.repondus.includes(c.persoId) || v) ? "✅" : "⏳"} ${echapper(c.nom)}</div>`).join("");
        corpsMJ = `<div style="margin-top:6px;">⏳ ${secondes}s restantes — ${demande.repondus.length}/${demande.cibles.length} ont répondu.</div>
          ${statuts}
          <button class="btn petit secondaire" id="btn-clore-veillee" style="margin-top:6px;">⏩ Clore la veillée</button>`;
      } else {
        const eligibles = _convivesEligiblesMusique(encours, persos);
        const desactive = !eligibles.length || !!v;
        let explication = "";
        if (!eligibles.length) explication = "personne n'a déclaré le métier de Musique sur sa fiche";
        else if (v) explication = "Une veillée a déjà été jouée ce repos-ci.";
        corpsMJ = `<button class="btn or" id="btn-lancer-veillee"${desactive ? " disabled" : ""}>🎵 Demander une veillée</button>
          ${explication ? `<div style="font-size:0.82rem;color:#6a6278;margin-top:4px;">${echapper(explication)}</div>` : ""}`;
      }
    }

    return `<div class="carte" style="margin-top:10px;">
      <h4 style="margin-top:0;">🎵 Veillée</h4>
      ${corpsMJ}
      ${recap ? `<div style="margin-top:8px;">${recap}</div>` : ""}
    </div>`;
  }

  // Validation — actionnable par l'initiateur ou le MJ. Séquence imposée
  // (cf. prompt_repos_long_scrutin.md) : la cuisine et l'attribution sont
  // déjà closes à ce stade (phases précédentes de l'overlay) ; on pose
  // ICI, dans l'ordre, pour chaque convive : 1. le dé du plat attribué
  // (déjà résolu, cf. cuisinerDansOverlay/attribuer) 2. rien → Fatiguée
  // 3. le jet de PV en attente (patron existant, jamais automatique)
  // 4. seulement ENSUITE les resets (PP/Cercle/usages/Grimoire/tentatives).
  // Puisque cuisine+attribution sont déjà terminées avant cet appel, le
  // risque documenté par le prompt (relance rétroactive après un reset des
  // tentatives) ne peut pas se produire : aucun reset ne part avant que
  // cette fonction ne soit explicitement déclenchée par l'initiateur/MJ.
  function validerRepos() {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const vote = lireVote();
    const encours = lireEncours();
    if (!encours) return;
    const joueurId = App.obtenirJoueurId ? App.obtenirJoueurId() : null;
    const estInitiateur = !!(vote && joueurId === vote.initiateurJoueurId);
    if (role !== "mj" && !estInitiateur) return;

    const persos = App.chargerPersos();
    const palier = _palier(encours.couchage) || _palier("camp");
    const coutPb = Math.round(palier.prixPo * 100);

    const attente = lireAttente();
    const dejaEnAttente = [];
    const insuffisants = [];
    const fatigues = [];
    const bonusAccordes = [];
    let servis = 0;

    encours.convives.forEach((persoId) => {
      const p = persos[persoId];
      if (!p) return;
      // cf. audit hérité en tête de fichier : jamais re-servir un
      // personnage déjà en attente (jet non lancé).
      if (attente[persoId]) { dejaEnAttente.push(p.nom); return; }
      const totalPb = (p.piecesOr || 0) * 100 + (p.piecesArgent || 0) * 10 + (p.piecesBronze || 0);
      if (totalPb < coutPb) { insuffisants.push(p.nom); return; }
      const restePb = totalPb - coutPb;
      p.piecesOr = Math.floor(restePb / 100);
      p.piecesArgent = Math.floor((restePb % 100) / 10);
      p.piecesBronze = restePb % 10;

      // 1. Dé du plat attribué (ou ration), déjà déterminé en phase cuisine.
      const attrib = encours.attributions[persoId];
      let effetRepos = null, nomPlat = null, recetteCuisinee = null;
      if (attrib === "ration") {
        const ration = (p.inventaireListe || []).find((it) => it.id === "ration_voyage" && it.effetRepos);
        if (ration) { effetRepos = ration.effetRepos; nomPlat = ration.nom; _consommerUneUnite(p.inventaireListe, "ration_voyage"); }
      } else if (typeof attrib === "number" && encours.plats[attrib]) {
        const cuisine = encours.plats[attrib];
        effetRepos = { des: [cuisine.de], maximise: cuisine.maximise, intoxication: cuisine.intoxication };
        // Résolu par recetteId (cf. cuisinerDansOverlay) plutôt que le nom
        // générique "plat cuisiné" d'avant ce chantier : nécessaire pour
        // retrouver bonusTemporaire (cf. prompt_cuisine_bonus_rang5.md) ET
        // pour que le joueur voie le VRAI nom du plat dans son jet en attente.
        recetteCuisinee = CUISINE_RECETTES.find((r) => r.id === cuisine.recetteId) || null;
        nomPlat = recetteCuisinee ? recetteCuisinee.nom : "plat cuisiné";
      }

      const instance = new Personnage(p);
      const niveau = p.niveau || 1;
      const desPositifs = Array(niveau).fill(8);
      let flatPositif = instance.mod("CON");
      const desNegatifs = [];
      if (palier.de) {
        const dCouchage = _parseDe(palier.de);
        if (dCouchage) for (let i = 0; i < dCouchage.nb; i++) desPositifs.push(dCouchage.faces);
      }
      if (effetRepos) {
        (effetRepos.des || []).forEach((formule) => {
          const d = _parseDe(formule);
          if (!d) return;
          if (effetRepos.intoxication) { for (let i = 0; i < d.nb; i++) desNegatifs.push(d.faces); }
          else if (effetRepos.maximise) { flatPositif += d.nb * d.faces; }
          else { for (let i = 0; i < d.nb; i++) desPositifs.push(d.faces); }
        });
      }

      // 4. Resets — APRÈS le calcul du jet en attente ci-dessus, jamais avant.
      instance.reposLongPP();
      instance.reposLongPointsCercle();
      p.ppActuel = instance.ppActuel;
      p.pointsBenediction = instance.pointsBenediction;
      p.pointsConviction = instance.pointsConviction;
      p.pointsBannissement = instance.pointsBannissement;
      p.pointsJugement = instance.pointsJugement;

      // "jour"/"scene" redeviennent disponibles — PAS "scenario", qui reste
      // au bouton manuel du MJ (un repos ne consomme pas tout un scénario).
      if (typeof Capacites !== "undefined" && Capacites.reinitialiserUsagesPeriode) {
        Capacites.reinitialiserUsagesPeriode(p, "jour");
        Capacites.reinitialiserUsagesPeriode(p, "scene");
      }
      if (App.autoriserPreparationGrimoire) App.autoriserPreparationGrimoire(persoId);

      p.etatsActifs = (p.etatsActifs || []).filter((e) => e.idEtat !== "fatiguee");
      if (!effetRepos) {
        p.etatsActifs.push({ idEtat: "fatiguee", dureeRestante: { tours: null, motCle: null, dureeAffichee: "prochain repos long" }, source: "Repos", poseLe: Date.now() });
        fatigues.push(p.nom);
      }
      p.etatsActifs = p.etatsActifs.filter((e) => e.idEtat !== "intoxication");
      if (effetRepos && effetRepos.intoxication) {
        p.etatsActifs.push({ idEtat: "intoxication", dureeRestante: { tours: null, motCle: null, dureeAffichee: "prochain repos long" }, source: "Repos", poseLe: Date.now() });
      }

      // bonusTemporaire de rang 5 (cf. prompt_cuisine_bonus_rang5.md §2-3) :
      // posé APRÈS le nettoyage des effets ci-dessus, jamais avant. Le bonus
      // de LA NUIT PRÉCÉDENTE disparaît d'abord (il dure "jusqu'au prochain
      // repos long", pas au-delà) — un repos qui ne serait pas suivi d'un
      // nouveau bonus laisse quand même le convive sans aucun bonus actif,
      // c'est le comportement voulu.
      p.bonusRepasRang5 = null;
      if (p.pvTemporairesExpiration && p.pvTemporairesExpiration.motCle === "reposLong") {
        p.pvTemporaires = 0;
        p.pvTemporairesExpiration = null;
      }
      // Même sweep, même endroit, pour le malus social temporaire posé par
      // un aléa de récolte "requalifié malgré tout"/rencontre (cf.
      // js/recolte.js) : il expire "jusqu'au prochain repos long", donc au
      // même instant que le bonus PV ci-dessus, pas avant.
      if (p.malusSocialTemporaire && p.malusSocialTemporaire.motCle === "reposLong") {
        p.malusSocialTemporaire = null;
      }
      // Récolte "bloquée au prochain repos" (aléa de récolte) : un blocage
      // qui ne concerne QUE ce repos-ci, purgé pour tout le monde qu'on ait
      // ou non tenté de récolter cette fois. p.recolteBonus, lui, N'EST PAS
      // touché ici : c'est un bonus DURABLE affecté à un milieu précis (cf.
      // js/recolte.js, cas "bonusMilieu"), qui ne s'épuise qu'en étant
      // consommé par une future récolte, jamais par le simple passage d'un
      // repos long.
      p.recolteBloqueeProchainRepos = false;
      if (recetteCuisinee && recetteCuisinee.bonusTemporaire && recetteCuisinee.rang !== 5) {
        // Exclusif au rang 5 (cf. prompt_cuisine_bonus_rang5.md §2) : le
        // moteur IGNORE le champ s'il apparaît sur une autre recette plutôt
        // que de l'appliquer silencieusement — signe d'une donnée mal posée
        // dans data/cuisine.js, pas un cas à supporter.
        console.warn(`bonusTemporaire ignoré sur "${recetteCuisinee.id}" (rang ${recetteCuisinee.rang}, exclusif au rang 5).`);
      }
      if (typeof attrib === "number" && encours.plats[attrib] && recetteCuisinee && recetteCuisinee.bonusTemporaire && recetteCuisinee.rang === 5) {
        // "à partir d'Excellent" = qualiteId "bien" (Bien réussi) ou "chef"
        // (Chef-d'œuvre) — cf. js/cuisine_reference.js, même mapping, vérifié
        // contre le tableau de fréquence du prompt (5/5/15/25/35/45 %).
        // Réussi (xpMult identique à Bien réussi/Chef-d'œuvre côté XP, mais
        // AUCUN bonus ici) nourrit sans rien conférer de plus.
        const qualiteId = encours.plats[attrib].qualiteId;
        if (qualiteId === "bien" || qualiteId === "chef") {
          const bt = recetteCuisinee.bonusTemporaire;
          if (bt.type === "pvTemporaires") {
            // Même sémantique "garde le plus haut" que
            // Capacites.appliquerPvTemporairesSurPerso (js/capacites.js,
            // interdit à la modification) — reproduite ici à la main car
            // cette fonction ne connaît pas de dureeExpr "jusqu'au prochain
            // repos long" (son vocabulaire s'arrête à permanente/finCombat/
            // 24h/prochainTour/maintenue) : motCle "reposLong" est purement
            // local à ce fichier, decompterEtatsDebutTour (js/capacites.js)
            // l'ignore superbement (ne décrémente que motCle === null).
            if (bt.valeur > (p.pvTemporaires || 0)) {
              p.pvTemporaires = bt.valeur;
              p.pvTemporairesExpiration = { tours: null, motCle: "reposLong" };
              bonusAccordes.push(`${p.nom} : ${bt.libelle} (${recetteCuisinee.nom})`);
            }
          } else {
            // testsCarac / testsSociaux — un seul bonus actif à la fois pour
            // CE convive (remplace, ne s'additionne jamais) : chaque convive
            // ne mange qu'un plat par repos long, donc l'assignation directe
            // (pas de push dans un tableau) suffit à garantir l'absence de
            // cumul du même type.
            p.bonusRepasRang5 = Object.assign({ origineNom: recetteCuisinee.nom }, bt);
            bonusAccordes.push(`${p.nom} : ${bt.libelle} (${recetteCuisinee.nom})`);
          }
        }
      }

      p.reposCourtsDepuisReposLong = 0;

      attente[persoId] = {
        label: `Repos long — ${palier.nom}${nomPlat ? ` + ${nomPlat}` : " — sans repas (Fatiguée)"}`,
        desPositifs, flatPositif, desNegatifs,
        horodatage: Date.now(),
      };
      servis++;
    });

    App.sauverPersos(persos);
    sauverAttente(attente);
    // Le repos long EST le nouveau jour : mêmes tentatives d'atelier
    // (enchantement/alchimie/cuisine) réinitialisées que via le bouton MJ
    // "🌅 Nouveau jour" — appelé ICI seulement, jamais pendant la phase
    // cuisine (cf. contrainte de séquencement en tête de fonction).
    if (servis && typeof App !== "undefined" && App.reinitialiserTentativesAtelier) App.reinitialiserTentativesAtelier();

    // Une nouvelle journée commence : le ciel dérive (cf.
    // prompt_meteo_porte_ciel.md §3). On POUSSE une demande au Porte-Ciel
    // plutôt que de tirer ici — le jet reste un acte de joueur. Silencieux
    // (aucune demande émise, Meteo.demanderLectureCiel renvoie false sans
    // lever d'erreur) si : région souterraine, aucun Porte-Ciel désigné, ou
    // demande déjà en cours. Ce n'est pas un échec, juste un non-évènement —
    // APRÈS les resets ci-dessus, jamais avant (le temps change quand la
    // nuit est passée, pas pendant qu'on la traite). Seulement si au moins
    // un convive a été servi (un repos où personne n'a payé n'a pas eu lieu).
    if (servis && typeof Meteo !== "undefined") Meteo.demanderLectureCiel("repos");

    // Expiration du buff de veillée (prompt_musicien_7_veillee.md §4) — À LA
    // FIN de CE repos long, pas à son ouverture : on profite de la nuit
    // qu'on vient de passer, pas de celle qui commence. Une seule fois ici
    // (musique:veillee est une clé GLOBALE, pas par convive, contrairement
    // au sweep pvTemporairesExpiration/malusSocialTemporaire ci-dessus).
    // survitUnReposDePlus (Ovation) : le drapeau retombe à false et le buff
    // survit un repos de plus ; sinon il est effacé.
    const buffMusique = SyncStore.get("musique:veillee");
    if (buffMusique) {
      SyncStore.set("musique:veillee", buffMusique.survitUnReposDePlus
        ? Object.assign({}, buffMusique, { survitUnReposDePlus: false })
        : null);
    }

    sauverEncours(null);
    sauverVote(null);
    _arreterMinuteur();

    let msg = servis ? `😴 Repos long validé pour ${servis} convive${servis > 1 ? "s" : ""}.` : "😴 Aucun convive servi.";
    if (insuffisants.length) msg += ` Bourse insuffisante pour : ${insuffisants.join(", ")}.`;
    if (dejaEnAttente.length) msg += ` Déjà un repos en attente pour : ${dejaEnAttente.join(", ")}.`;
    if (fatigues.length) msg += ` Fatiguée (sans repas) : ${fatigues.join(", ")}.`;
    // Annonce explicite des bonusTemporaire de rang 5 accordés (cf.
    // prompt_cuisine_bonus_rang5.md §4, "annoncer explicitement les bonus
    // accordés et à qui") — un joueur qui n'ouvre pas sa fiche voit quand
    // même passer l'info dans le même toast que le reste du repos.
    if (bonusAccordes.length) msg += ` 🎁 Bonus accordés — ${bonusAccordes.join(" · ")}.`;
    toast(msg);
    rendreZoneRepos();
    _rendreOverlayRepos();
    if (typeof App !== "undefined" && App.rafraichirFicheActive) App.rafraichirFicheActive();
  }

  // Abandon — réservé à l'initiateur et au MJ. Les ingrédients déjà
  // consommés pendant la phase cuisine NE SONT PAS rendus : on a cuisiné,
  // ce n'est pas un bug si un repos abandonné a coûté des vivres pour
  // rien — ne pas "corriger" ça en remboursant plus tard. Même logique pour
  // les récoltes déjà faites (encours.recoltes) : le gibier/les ingrédients
  // récoltés et l'XP de métier déjà accordée ne sont PAS repris non plus —
  // Recolte.tenter() s'arrête dès que le produit entre en inventaire. Et
  // pour la veillée : on a joué, on a joué — le morceau déjà joué
  // (encours.veillee), le buff qu'il a posé (musique:veillee) et l'XP de
  // Musique déjà accordée ne sont PAS annulés non plus.
  function annulerRepos() {
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const vote = lireVote();
    const joueurId = App.obtenirJoueurId ? App.obtenirJoueurId() : null;
    const estInitiateur = !!(vote && joueurId === vote.initiateurJoueurId);
    if (role !== "mj" && !estInitiateur) return;
    sauverEncours(null);
    sauverVote(null);
    _arreterMinuteur();
    toast("Repos long annulé.");
    rendreZoneRepos();
    _rendreOverlayRepos();
    if (typeof App !== "undefined" && App.rafraichirFicheActive) App.rafraichirFicheActive();
  }

  /* ── Rendu — bannière de scrutin dans #zone-repos ─────────────────── */

  function _htmlBanniereScrutin(vote) {
    if (!vote) return "";
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const joueurId = App.obtenirJoueurId ? App.obtenirJoueurId() : null;

    if (vote.statut === "rejete") {
      return `<div class="carte" style="border-left:3px solid var(--chaos);"><strong>❌ Repos long rejeté.</strong></div>`;
    }
    if (vote.statut === "adopte") {
      return `<div class="carte"><strong>✅ Repos long adopté</strong> — préparation en cours (cf. fenêtre de repos collectif).</div>`;
    }
    const secondes = Math.max(0, Math.ceil((vote.echeanceTs - Date.now()) / 1000));
    const nbRepondu = vote.votants.filter((id) => vote.votes[id] !== undefined).length;
    let corps;
    if (role === "mj") {
      corps = `<div>${nbRepondu}/${vote.votants.length} ont répondu — ${secondes}s restantes.</div>
        <button class="btn petit or" id="btn-resoudre-scrutin-maintenant" style="margin-top:6px;">⏩ Résoudre maintenant</button>`;
    } else if (joueurId === vote.initiateurJoueurId) {
      corps = `<div>Ton repos long est soumis au vote — ${secondes}s restantes (${nbRepondu}/${vote.votants.length} ont répondu).</div>`;
    } else if (vote.votants.includes(joueurId)) {
      const monVote = vote.votes[joueurId];
      corps = monVote !== undefined
        ? `<div>Tu as voté <strong>${monVote === "oui" ? "Oui" : "Non"}</strong> — ${secondes}s restantes (${nbRepondu}/${vote.votants.length} ont répondu).</div>`
        : `<div>${echapper(vote.initiateurNom)} propose un repos long — ${secondes}s restantes.</div>
           <div style="display:flex;gap:8px;margin-top:6px;">
             <button class="btn petit or" id="btn-vote-repos-oui">✅ Oui</button>
             <button class="btn petit secondaire" id="btn-vote-repos-non">❌ Non</button>
           </div>`;
    } else {
      corps = `<div>${echapper(vote.initiateurNom)} propose un repos long.</div>`;
    }
    return `<div class="carte"><strong>🌙 Scrutin de repos long</strong>${corps}</div>`;
  }

  function _wireBanniereScrutin() {
    const btnOui = document.getElementById("btn-vote-repos-oui");
    if (btnOui) btnOui.onclick = () => voter("oui");
    const btnNon = document.getElementById("btn-vote-repos-non");
    if (btnNon) btnNon.onclick = () => voter("non");
    const btnResoudre = document.getElementById("btn-resoudre-scrutin-maintenant");
    if (btnResoudre) btnResoudre.onclick = () => _resoudreScrutin();
  }

  function _htmlReposCourt(ids, persos, role) {
    const accessibles = ids.filter((id) => role === "mj" || (App.estProprietaire && App.estProprietaire(persos[id])));
    if (!accessibles.length) return "";
    const cartes = accessibles.map((id) => {
      const p = persos[id];
      const n = p.reposCourtsDepuisReposLong || 0;
      return `<button class="btn petit secondaire" data-repos-court="${id}" title="+1d4 PV, +25% PP max, réinitialise les capacités 1x/scène">☕ ${echapper(p.nom)} (${n})</button>`;
    }).join("");
    return `<div class="carte" style="margin-top:10px;">
      <strong>☕ Repos court</strong>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">${cartes}</div>
    </div>`;
  }

  function _wireReposCourt() {
    document.querySelectorAll("[data-repos-court]").forEach((btn) => {
      btn.onclick = () => reposCourt(btn.dataset.reposCourt);
    });
  }

  function _htmlCartesAttente(attente, persos, role) {
    const ids = Object.keys(attente).filter((id) => persos[id]);
    if (!ids.length) return "";
    const cartes = ids.map((id) => {
      const p = persos[id];
      const e = attente[id];
      const peutLancer = role === "mj" || (typeof App !== "undefined" && App.estProprietaire && App.estProprietaire(p));
      const detailPos = (e.desPositifs || []).map((d) => `1d${d}`).join("+");
      const detailFlat = e.flatPositif ? ` ${e.flatPositif >= 0 ? "+" : ""}${e.flatPositif}` : "";
      const detailNeg = (e.desNegatifs || []).length ? " -" + e.desNegatifs.map((d) => `1d${d}`).join("-") : "";
      return `<div class="carte">
        <strong>🛌 Repos en attente — ${echapper(p.nom)}</strong>
        <div style="font-size:0.85rem;margin:4px 0;">${echapper(e.label)} — formule : ${echapper(detailPos + detailFlat + detailNeg)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${peutLancer ? `<button class="btn petit or" data-lancer-repos="${id}">🎲 Lancer le jet</button>` : ""}
          ${role === "mj" ? `<button class="btn petit secondaire" data-purger-repos="${id}">🗑 Purger (sans jet)</button>` : ""}
        </div>
      </div>`;
    }).join("");
    return `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">${cartes}</div>`;
  }

  function _wireCartesAttente() {
    document.querySelectorAll("[data-lancer-repos]").forEach((btn) => {
      btn.onclick = () => lancerJetRepos(btn.dataset.lancerRepos);
    });
    document.querySelectorAll("[data-purger-repos]").forEach((btn) => {
      btn.onclick = () => {
        if (confirm("Purger ce repos en attente ? Le personnage ne récupérera aucun PV et l'or déjà prélevé n'est pas remboursé automatiquement.")) {
          purgerAttente(btn.dataset.purgerRepos);
        }
      };
    });
  }

  function rendreZoneRepos() {
    const zone = document.getElementById("zone-repos");
    if (!zone) return;
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const persos = App.chargerPersos();
    const ids = Object.keys(persos).filter((id) => persos[id] && persos[id].classe);
    const attente = lireAttente();
    const vote = lireVote();

    let html = _htmlBanniereScrutin(vote);
    html += _htmlReposCourt(ids, persos, role);
    html += _htmlCartesAttente(attente, persos, role);
    zone.innerHTML = html;

    _wireBanniereScrutin();
    _wireReposCourt();
    _wireCartesAttente();
  }

  /* ── Rendu — overlay collectif (#modal-repos-long), GLOBAL (pas gated
     par l'onglet Party : le repos peut être adopté pendant que quelqu'un
     consulte "Ma fiche" ou "Dés", l'overlay doit s'ouvrir quand même) ── */

  function _htmlOverlay(encours) {
    const persos = App.chargerPersos();
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const vote = lireVote();
    const joueurId = App.obtenirJoueurId ? App.obtenirJoueurId() : null;
    const estInitiateur = !!(vote && joueurId === vote.initiateurJoueurId);
    const peutValider = role === "mj" || estInitiateur;

    const couverts = encours.convives.filter((id) => encours.attributions[id] !== undefined).length;
    const recettesOptions = CUISINE_RECETTES.slice().sort((a, b) => a.rang - b.rang).map((r) => `<option value="${r.id}">${echapper(r.nom)} (rang ${r.rang})</option>`).join("");
    const convivesOptions = encours.convives.map((id) => `<option value="${id}">${echapper((persos[id] || {}).nom || id)}</option>`).join("");

    const listePlats = encours.plats.map((pl, idx) => {
      const cuisinierNom = (persos[pl.cuisinierPersoId] || {}).nom || "?";
      return `<div class="carte" style="margin-top:6px;">
        <strong>Plat #${idx + 1}</strong> — cuisiné par ${echapper(cuisinierNom)}, dé ${echapper(pl.de)}${pl.maximise ? " (maximisé)" : ""}${pl.intoxication ? " ⚠ intoxication (soustrait)" : ""}
        <div>Portions restantes : ${pl.portionsRestantes}/4</div>
        <button class="btn petit secondaire" data-jeter-plat="${idx}">🗑 Jeter ce plat</button>
      </div>`;
    }).join("");

    const lignesAttribution = encours.convives.map((id) => {
      const p = persos[id];
      if (!p) return "";
      const attrib = encours.attributions[id];
      const aRation = (p.inventaireListe || []).some((it) => it.id === "ration_voyage" && it.effetRepos);
      const options = [`<option value="">— Rien (Fatiguée) —</option>`]
        .concat(aRation ? [`<option value="ration"${attrib === "ration" ? " selected" : ""}>🎒 Sa ration de voyage</option>`] : [])
        .concat(encours.plats.map((pl, idx) => (pl.portionsRestantes > 0 || attrib === idx)
          ? `<option value="${idx}"${attrib === idx ? " selected" : ""}>Plat #${idx + 1} (${pl.portionsRestantes} portion${pl.portionsRestantes > 1 ? "s" : ""})</option>` : ""));
      const sansRepas = attrib === undefined;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;${sansRepas ? "color:var(--chaos);" : ""}">
        <span>${echapper(p.nom)}${sansRepas ? " ⚠" : ""}</span>
        <select data-attribuer="${id}">${options.join("")}</select>
      </div>`;
    }).join("");

    return `
      ${_htmlBanniereRencontres(role)}
      <div class="carte">
        <strong>🍽 Portions couvertes : ${couverts}/${encours.convives.length}</strong>
      </div>
      ${_htmlBlocRecolte(encours, persos, role)}
      <div class="carte" style="margin-top:10px;">
        <h4 style="margin-top:0;">Cuisiner</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <select id="overlay-select-cuisinier">${convivesOptions}</select>
          <select id="overlay-select-recette">${recettesOptions}</select>
          <button class="btn petit or" id="btn-overlay-cuisiner">🍳 Cuisiner</button>
        </div>
        ${listePlats}
      </div>
      <div class="carte" style="margin-top:10px;">
        <h4 style="margin-top:0;">Attribution</h4>
        ${lignesAttribution}
      </div>
      ${_htmlBlocVeillee(encours, persos, role)}
      <div class="barre-actions" style="margin-top:10px;">
        ${peutValider ? `<button class="btn or" id="btn-overlay-valider">😴 Valider le repos</button>` : ""}
        ${peutValider ? `<button class="btn danger" id="btn-overlay-annuler">Annuler le repos</button>` : ""}
      </div>`;
  }

  function _wireOverlay() {
    const btnCuisiner = document.getElementById("btn-overlay-cuisiner");
    if (btnCuisiner) btnCuisiner.onclick = () => {
      const cuisinierId = document.getElementById("overlay-select-cuisinier").value;
      const recetteId = document.getElementById("overlay-select-recette").value;
      const persos = App.chargerPersos();
      const role = App.obtenirRole ? App.obtenirRole() : "joueur";
      if (role !== "mj" && !(App.estProprietaire && App.estProprietaire(persos[cuisinierId]))) {
        toast("Tu ne peux cuisiner que pour ton propre personnage.");
        return;
      }
      cuisinerDansOverlay(cuisinierId, recetteId);
    };
    document.querySelectorAll("[data-jeter-plat]").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.jeterPlat, 10);
        const encours = lireEncours();
        const plat = encours && encours.plats[idx];
        if (!plat) return;
        const persos = App.chargerPersos();
        const role = App.obtenirRole ? App.obtenirRole() : "joueur";
        const estCuisinier = App.estProprietaire && App.estProprietaire(persos[plat.cuisinierPersoId]);
        if (role !== "mj" && !estCuisinier) { toast("Seul le cuisinier (ou le MJ) peut jeter ce plat."); return; }
        if (confirm("Jeter ce plat ? Ses portions restantes seront perdues.")) jeterPlat(idx);
      };
    });
    document.querySelectorAll("[data-attribuer]").forEach((sel) => {
      sel.onchange = () => {
        const val = sel.value;
        const choix = val === "" ? null : (val === "ration" ? "ration" : parseInt(val, 10));
        attribuer(sel.dataset.attribuer, choix);
      };
    });
    const btnValider = document.getElementById("btn-overlay-valider");
    if (btnValider) btnValider.onclick = () => { if (confirm("Valider le repos long pour tout le groupe ?")) validerRepos(); };
    const btnAnnuler = document.getElementById("btn-overlay-annuler");
    if (btnAnnuler) btnAnnuler.onclick = () => { if (confirm("Annuler ce repos long ? Les ingrédients déjà consommés ne seront pas rendus.")) annulerRepos(); };
    const btnLancerRecoltes = document.getElementById("btn-lancer-recoltes");
    if (btnLancerRecoltes) btnLancerRecoltes.onclick = () => lancerRecoltes();
    const btnClorerRecoltes = document.getElementById("btn-clore-recoltes");
    if (btnClorerRecoltes) btnClorerRecoltes.onclick = () => clorerRecoltes();
    document.querySelectorAll("[data-traiter-rencontre]").forEach((btn) => {
      btn.onclick = () => _traiterRencontre(parseInt(btn.dataset.traiterRencontre, 10));
    });
    const btnLancerVeillee = document.getElementById("btn-lancer-veillee");
    if (btnLancerVeillee) btnLancerVeillee.onclick = () => lancerVeillee();
    const btnClorerVeillee = document.getElementById("btn-clore-veillee");
    if (btnClorerVeillee) btnClorerVeillee.onclick = () => clorerVeillee();
  }

  function _rendreOverlayRepos() {
    const modal = document.getElementById("modal-repos-long");
    const corps = document.getElementById("modal-repos-long-corps");
    if (!modal || !corps) return;
    const encours = lireEncours();
    if (!encours) { modal.style.display = "none"; return; }
    modal.style.display = "flex";
    corps.innerHTML = _htmlOverlay(encours);
    _wireOverlay();
  }

  // Notification temps réel — même schéma que marche:stock/marche:demandes.
  // KEY_ENCOURS n'est PAS gated par l'onglet Party : l'overlay est une
  // modale globale, elle doit s'ouvrir même si le client consulte un autre
  // onglet au moment de l'adoption.
  SyncStore.subscribe(STORAGE_REPOS_ATTENTE, () => {
    const p = document.getElementById("panneau-party");
    if (p && p.classList.contains("actif")) rendreZoneRepos();
  });
  SyncStore.subscribe(KEY_VOTE, (val) => {
    if (val && val.statut === "en_cours") _demarrerMinuteur(); else _arreterMinuteur();
    const p = document.getElementById("panneau-party");
    if (p && p.classList.contains("actif")) rendreZoneRepos();
    if (typeof App !== "undefined" && App.rafraichirFicheActive) App.rafraichirFicheActive();
  });
  SyncStore.subscribe(KEY_ENCOURS, () => { _rendreOverlayRepos(); _rendreModalRecolte(); _rendreModalVeillee(); });
  SyncStore.subscribe(KEY_DEMANDE_RECOLTE, (val) => {
    if (val && val.statut === "en_attente") _demarrerMinuteurRecolte(); else _arreterMinuteurRecolte();
    _rendreOverlayRepos();
    _rendreModalRecolte();
  });
  SyncStore.subscribe("recolte:rencontres", () => { _rendreOverlayRepos(); });
  SyncStore.subscribe(KEY_DEMANDE_MUSIQUE, (val) => {
    if (val && val.statut === "en_attente") _demarrerMinuteurMusique(); else _arreterMinuteurMusique();
    _rendreOverlayRepos();
    _rendreModalVeillee();
  });
  SyncStore.subscribe("musique:veillee", () => { _rendreOverlayRepos(); });

  return {
    rendreZoneRepos, reposCourt, lancerJetRepos, purgerAttente,
    estScrutinEnCours, ouvrirScrutin, voter, resoudreScrutinMaintenant: _resoudreScrutin,
    changerConvive, cuisinerDansOverlay, jeterPlat, attribuer, validerRepos, annulerRepos,
    lancerRecoltes, clorerRecoltes, lancerVeillee, clorerVeillee,
  };
})();
