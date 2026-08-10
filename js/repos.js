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

  function lireAttente() { return SyncStore.get(STORAGE_REPOS_ATTENTE) || {}; }
  function sauverAttente(a) { SyncStore.set(STORAGE_REPOS_ATTENTE, a); }
  function lireVote() { return SyncStore.get(KEY_VOTE) || null; }
  function sauverVote(v) { SyncStore.set(KEY_VOTE, v); }
  function lireEncours() { return SyncStore.get(KEY_ENCOURS) || null; }
  function sauverEncours(e) { SyncStore.set(KEY_ENCOURS, e); }

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
      let effetRepos = null, nomPlat = null;
      if (attrib === "ration") {
        const ration = (p.inventaireListe || []).find((it) => it.id === "ration_voyage" && it.effetRepos);
        if (ration) { effetRepos = ration.effetRepos; nomPlat = ration.nom; _consommerUneUnite(p.inventaireListe, "ration_voyage"); }
      } else if (typeof attrib === "number" && encours.plats[attrib]) {
        const cuisine = encours.plats[attrib];
        effetRepos = { des: [cuisine.de], maximise: cuisine.maximise, intoxication: cuisine.intoxication };
        nomPlat = "plat cuisiné";
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

    sauverEncours(null);
    sauverVote(null);
    _arreterMinuteur();

    let msg = servis ? `😴 Repos long validé pour ${servis} convive${servis > 1 ? "s" : ""}.` : "😴 Aucun convive servi.";
    if (insuffisants.length) msg += ` Bourse insuffisante pour : ${insuffisants.join(", ")}.`;
    if (dejaEnAttente.length) msg += ` Déjà un repos en attente pour : ${dejaEnAttente.join(", ")}.`;
    if (fatigues.length) msg += ` Fatiguée (sans repas) : ${fatigues.join(", ")}.`;
    toast(msg);
    rendreZoneRepos();
    _rendreOverlayRepos();
    if (typeof App !== "undefined" && App.rafraichirFicheActive) App.rafraichirFicheActive();
  }

  // Abandon — réservé à l'initiateur et au MJ. Les ingrédients déjà
  // consommés pendant la phase cuisine NE SONT PAS rendus : on a cuisiné,
  // ce n'est pas un bug si un repos abandonné a coûté des vivres pour
  // rien — ne pas "corriger" ça en remboursant plus tard.
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
      <div class="carte">
        <strong>🍽 Portions couvertes : ${couverts}/${encours.convives.length}</strong>
      </div>
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
  SyncStore.subscribe(KEY_ENCOURS, () => { _rendreOverlayRepos(); });

  return {
    rendreZoneRepos, reposCourt, lancerJetRepos, purgerAttente,
    estScrutinEnCours, ouvrirScrutin, voter, resoudreScrutinMaintenant: _resoudreScrutin,
    changerConvive, cuisinerDansOverlay, jeterPlat, attribuer, validerRepos, annulerRepos,
  };
})();
