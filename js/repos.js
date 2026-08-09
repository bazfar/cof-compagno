/* ============================================================
   Repos — auberge/camp (couchage + boissons) et point d'entrée unique du
   repos long/court, dans l'onglet 🎭 Party.

   Refonte (09/08/2026, cf. prompt_repos_cuisine_metiers.md) : avant cette
   passe, le "repos" n'existait pas comme système — il était éclaté entre
   cette auberge payante (nuitée + repas à 3 crans + boissons, inutilisable
   hors ville), les boutons manuels de fiche (reposLongPP/reposCourtPP/
   reposLongPointsCercle, sans lien entre eux ni avec l'auberge) et le
   bouton MJ "🌅 Nouveau jour" (Atelier, tentatives d'artisanat seulement).
   Repos.reposLong()/Repos.reposCourt() sont désormais l'UNIQUE point
   d'entrée : ils appellent tout le reste (PP, Points de Cercle, capacités
   1x/jour et 1x/scène, Grimoire, tentatives d'atelier, état Fatiguée) —
   plus aucun de ces resets ne se déclenche indépendamment.

   Stockage de l'attente : SyncStore, même convention que js/marche.js
   (demandes). Le coût du couchage/des boissons est débité IMMÉDIATEMENT
   (pas de validation MJ) ; la régénération de PV, elle, n'est JAMAIS
   automatique — chaque joueur concerné lance lui-même son jet depuis
   l'encart "🛌 Repos en attente" (patron conservé du système d'auberge
   d'origine). Tout le reste (PP/Cercle/capacités/Grimoire/Fatiguée/
   tentatives) est en revanche appliqué IMMÉDIATEMENT à Repos.reposLong(),
   pas différé au jet — ce sont des resets déterministes, pas des jets.
   Paliers/boissons : cf. data/repos.js. Plats : cf. js/cuisine.js
   (contrat unique : le champ effetRepos d'un consommable).

   Audit hérité (09/08/2026, avant la refonte) : envoyerRepos écrasait
   silencieusement toute entrée en attente déjà existante pour un
   personnage — un joueur qui n'avait pas encore lancé son jet perdait à la
   fois l'or déjà prélevé et la régénération de la nuitée précédente, sans
   le moindre message. Corrigé et CONSERVÉ dans reposLong ci-dessous : un
   personnage déjà en attente est ignoré (signalé au MJ) plutôt que
   re-servi. purgerAttente() reste le moyen explicite de vider une entrée
   bloquée avant de pouvoir renvoyer un repos au même personnage — sans
   remboursement automatique, décision de table laissée au MJ.

   reposLong accepte aussi un tarif de couchage négocié (optionnel), qui
   remplace palier.prixPo pour cette nuitée sans toucher au dé de
   régénération — ex. chambre privée obtenue au prix d'un dortoir.
   ============================================================ */

const Repos = (() => {
  "use strict";

  const STORAGE_REPOS_ATTENTE = "repos:enAttente"; // { [persoId]: { label, desPositifs:[..], flatPositif, desNegatifs:[..], horodatage } }

  function lireAttente() { return SyncStore.get(STORAGE_REPOS_ATTENTE) || {}; }
  function sauverAttente(a) { SyncStore.set(STORAGE_REPOS_ATTENTE, a); }

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

  // Plats/rations disponibles dans l'inventaire d'un perso — seul contrat lu
  // ici : le champ effetRepos (cf. js/cuisine.js, en-tête). Repos ne connaît
  // ni les recettes ni les qualités.
  function _platsDisponibles(p) {
    return (p.inventaireListe || []).filter((it) => it.effetRepos);
  }

  /* ── État local du formulaire MJ (par onglet/navigateur, pas synchronisé) ── */
  let _persoIdsDecoches = new Set(); // ids explicitement décochés — vide = tout le monde coché par défaut
  let _palierId = null;
  let _nbBoissons = 0;
  let _typeBoissonId = null;
  let _prixNegocieChambre = ""; // chaîne brute du champ — vide = pas de tarif négocié, on retombe sur palier.prixPo
  let _platParPersoId = {}; // { [persoId]: itemId choisi dans SON inventaire, ou "" = aucun }

  function _assurerDefauts() {
    if (!_palierId) _palierId = PALIERS_AUBERGE[0].id;
    if (!_typeBoissonId) _typeBoissonId = TYPES_BOISSON[0].id;
  }

  /* ── Repos long (MJ) — point d'entrée unique ─────────────────────
     options = { palierId, prixNegocieChambre, nbBoissons, typeBoissonId,
                 platParPersoId: { [persoId]: itemId|"" } } */
  function reposLong(persoIds, options) {
    if (typeof App !== "undefined" && App.obtenirRole && App.obtenirRole() !== "mj") return;
    const opts = options || {};
    const palier = _palier(opts.palierId);
    const boisson = _boisson(opts.typeBoissonId);
    if (!palier || !boisson) return;
    const prixChambre = (opts.prixNegocieChambre !== undefined && opts.prixNegocieChambre !== "" && !Number.isNaN(Number(opts.prixNegocieChambre)))
      ? Math.max(0, Number(opts.prixNegocieChambre)) : palier.prixPo;
    const nbBoissons = opts.nbBoissons || 0;
    const coutPoParPersonne = prixChambre + nbBoissons * boisson.prixPo;
    const coutPb = Math.round(coutPoParPersonne * 100);
    const platParPersoId = opts.platParPersoId || {};

    const persos = App.chargerPersos();
    const attente = lireAttente();
    const insuffisants = [];
    // cf. audit hérité en tête de fichier : un personnage déjà en attente
    // (jet non lancé) n'est JAMAIS re-servi — purgerAttente() d'abord.
    const dejaEnAttente = [];
    const fatigues = [];
    let servis = 0;

    persoIds.forEach((persoId) => {
      const p = persos[persoId];
      if (!p) return;
      if (attente[persoId]) { dejaEnAttente.push(p.nom); return; }
      const totalPb = (p.piecesOr || 0) * 100 + (p.piecesArgent || 0) * 10 + (p.piecesBronze || 0);
      if (totalPb < coutPb) { insuffisants.push(p.nom); return; }
      const restePb = totalPb - coutPb;
      p.piecesOr = Math.floor(restePb / 100);
      p.piecesArgent = Math.floor((restePb % 100) / 10);
      p.piecesBronze = restePb % 10;

      // Plat/ration choisi (optionnel) — seul contrat lu : effetRepos.
      const platId = platParPersoId[persoId];
      const plat = platId ? (p.inventaireListe || []).find((it) => it.id === platId && it.effetRepos) : null;

      // Formule : (NIV × 1d8) + Mod.CON + dé de couchage + dé du plat.
      const instance = new Personnage(p);
      const niveau = p.niveau || 1;
      const desPositifs = Array(niveau).fill(8);
      let flatPositif = instance.mod("CON");
      const desNegatifs = [];
      if (palier.de) {
        const dCouchage = _parseDe(palier.de);
        if (dCouchage) for (let i = 0; i < dCouchage.nb; i++) desPositifs.push(dCouchage.faces);
      }
      if (plat) {
        (plat.effetRepos.des || []).forEach((formule) => {
          const d = _parseDe(formule);
          if (!d) return;
          if (plat.effetRepos.intoxication) { for (let i = 0; i < d.nb; i++) desNegatifs.push(d.faces); }
          else if (plat.effetRepos.maximise) { flatPositif += d.nb * d.faces; }
          else { for (let i = 0; i < d.nb; i++) desPositifs.push(d.faces); }
        });
      }

      // PP / Points de Cercle : reset complet, IMMÉDIAT (mêmes méthodes que
      // les anciens boutons manuels de fiche, désormais appelées d'ici).
      instance.reposLongPP();
      instance.reposLongPointsCercle();
      p.ppActuel = instance.ppActuel;
      p.pointsBenediction = instance.pointsBenediction;
      p.pointsConviction = instance.pointsConviction;
      p.pointsBannissement = instance.pointsBannissement;
      p.pointsJugement = instance.pointsJugement;

      // Capacités "1x/jour" et "1x/scène" redeviennent disponibles — PAS
      // "1x/scénario", qui reste au bouton manuel du MJ (décision explicite :
      // un repos ne "consomme" pas tout un scénario, contrairement à un jour
      // ou une scène — cf. Capacites.reinitialiserUsagesPeriode, lu en
      // lecture seule, jamais modifié par ce chantier).
      if (typeof Capacites !== "undefined" && Capacites.reinitialiserUsagesPeriode) {
        Capacites.reinitialiserUsagesPeriode(p, "jour");
        Capacites.reinitialiserUsagesPeriode(p, "scene");
      }

      // Grimoire v3 : re-préparation immédiatement disponible (plus besoin
      // d'attendre le jet de PV, contrairement à l'ancien système).
      if (App.autoriserPreparationGrimoire) App.autoriserPreparationGrimoire(persoId);

      // Fatiguée : retirée avant d'être éventuellement réappliquée — jamais
      // les deux à la fois. Premier déclencheur réel de cet état dans l'app.
      p.etatsActifs = (p.etatsActifs || []).filter((e) => e.idEtat !== "fatiguee");
      if (!plat) {
        p.etatsActifs.push({ idEtat: "fatiguee", dureeRestante: { tours: null, motCle: null, dureeAffichee: "prochain repos long" }, source: "Repos", poseLe: Date.now() });
        fatigues.push(p.nom);
      }
      // Intoxication (désastre culinaire) : posée EN PLUS du dé négatif ci-
      // dessus, jusqu'au prochain repos long — cf. js/etats.js.
      p.etatsActifs = p.etatsActifs.filter((e) => e.idEtat !== "intoxication");
      if (plat && plat.effetRepos.intoxication) {
        p.etatsActifs.push({ idEtat: "intoxication", dureeRestante: { tours: null, motCle: null, dureeAffichee: "prochain repos long" }, source: "Repos", poseLe: Date.now() });
      }

      // Consommation du plat/ration choisi (une seule unité).
      if (plat) _consommerUneUnite(p.inventaireListe, plat.id);

      // Repos courts : nouveau cycle.
      p.reposCourtsDepuisReposLong = 0;

      attente[persoId] = {
        label: `Repos long — ${palier.nom}${prixChambre !== palier.prixPo ? ` (tarif négocié ${_formatPo(prixChambre)} po)` : ""}${plat ? ` + ${plat.nom}` : " — sans repas (Fatiguée)"}`,
        desPositifs, flatPositif, desNegatifs,
        horodatage: Date.now(),
      };
      servis++;
    });

    App.sauverPersos(persos);
    sauverAttente(attente);
    // Le repos long EST le nouveau jour : mêmes tentatives d'atelier
    // (enchantement/alchimie/cuisine) réinitialisées que via le bouton MJ
    // "🌅 Nouveau jour" — même fonction partagée, cf. js/app.js.
    if (servis && typeof App !== "undefined" && App.reinitialiserTentativesAtelier) App.reinitialiserTentativesAtelier();

    let msg = servis
      ? `🌙 Repos long organisé pour ${servis} personnage${servis > 1 ? "s" : ""} (${_formatPo(coutPoParPersonne * servis)} po prélevés au total).`
      : "🌙 Aucun personnage servi.";
    if (insuffisants.length) msg += ` Bourse insuffisante pour : ${insuffisants.join(", ")}.`;
    if (dejaEnAttente.length) msg += ` Déjà un repos en attente (non lancé) pour : ${dejaEnAttente.join(", ")} — purge-le d'abord si besoin.`;
    if (fatigues.length) msg += ` Fatiguée (sans repas) : ${fatigues.join(", ")}.`;
    toast(msg);
    rendreZoneRepos();
  }

  /* ── Repos court (propriétaire ou MJ) — immédiat, pas de dé en attente ── */
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

  /* ── Lancer le jet de PV en attente (joueur ou MJ) ────────────────── */
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

  /* ── Purge MJ d'un repos en attente non lancé ─────────────────── */
  // Le joueur ne récupère AUCUN PV (aucun jet n'a été fait) et l'or déjà
  // prélevé au moment de reposLong n'est PAS remboursé automatiquement —
  // c'est une décision de table, pas un calcul : au MJ de compenser à la
  // main (boutons +/- PO sur la fiche) s'il l'estime nécessaire. Pensé pour
  // débloquer une entrée abandonnée (joueur déconnecté, oubli, changement
  // de plan du MJ) avant de pouvoir renvoyer un nouveau repos au même
  // personnage — cf. le garde "dejaEnAttente" dans reposLong ci-dessus.
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

  /* ── Rendu ────────────────────────────────────────────────────── */
  function _htmlFormulaireMj(ids, persos) {
    if (!ids.length) return "";
    const checks = ids.map((id) => {
      const coche = !_persoIdsDecoches.has(id);
      return `<label style="display:flex;align-items:center;gap:4px;">
        <input type="checkbox" class="repos-chk-perso" data-perso-id="${id}" ${coche ? "checked" : ""}/> ${echapper(persos[id].nom)}
      </label>`;
    }).join("");
    const optionsPalier = PALIERS_AUBERGE.map((p) =>
      `<option value="${p.id}" ${p.id === _palierId ? "selected" : ""}>${echapper(p.nom)} (${p.prixPo} po${p.de ? `, ${echapper(p.de)}` : ""})</option>`).join("");
    const optionsBoisson = TYPES_BOISSON.map((b) =>
      `<option value="${b.id}" ${b.id === _typeBoissonId ? "selected" : ""}>${echapper(b.nom)} (${b.prixPo} po)</option>`).join("");
    // Un sélecteur de plat par personnage — chaque joueur mange ce qu'IL a
    // en stock (plat cuisiné ou ration_voyage), jamais un choix centralisé
    // par le MJ comme l'étaient les anciens "repas" à 3 crans.
    const platsParPerso = ids.map((id) => {
      const plats = _platsDisponibles(persos[id]);
      const valeurActuelle = _platParPersoId[id] || "";
      const options = `<option value="">— Aucun (Fatiguée) —</option>` +
        plats.map((it) => `<option value="${echapper(it.id)}" ${it.id === valeurActuelle ? "selected" : ""}>${echapper(it.nom)}${it.quantite > 1 ? ` (×${it.quantite})` : ""}</option>`).join("");
      return `<label style="display:flex;align-items:center;gap:4px;">🍽 ${echapper(persos[id].nom)}
        <select class="repos-select-plat" data-perso-id="${id}">${options}</select>
      </label>`;
    }).join("");
    return `<div class="carte">
      <h3 style="margin-top:0;">🌙 Organiser un repos long</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${checks}</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:10px;">
        <label>Couchage
          <select id="repos-select-palier">${optionsPalier}</select>
        </label>
        <label title="Remplace le prix du couchage pour cette nuitée seulement — ex. chambre privée négociée au prix d'un dortoir. Laisser vide pour le tarif normal.">Tarif négocié (po, optionnel)
          <input type="number" id="repos-prix-negocie" min="0" step="0.1" value="${echapper(_prixNegocieChambre)}" placeholder="prix normal" style="width:90px;" />
        </label>
        <label>Boissons
          <input type="number" id="repos-nb-boissons" min="0" max="4" value="${_nbBoissons}" style="width:50px;" /> ×
          <select id="repos-select-boisson">${optionsBoisson}</select>
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">${platsParPerso}</div>
      <button class="btn or" id="btn-repos-envoyer">🌙 Envoyer le repos long</button>
    </div>`;
  }

  function _wireFormulaireMj(ids) {
    document.querySelectorAll(".repos-chk-perso").forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) _persoIdsDecoches.delete(cb.dataset.persoId);
        else _persoIdsDecoches.add(cb.dataset.persoId);
      };
    });
    const selPalier = document.getElementById("repos-select-palier");
    if (selPalier) selPalier.onchange = () => { _palierId = selPalier.value; };
    const inputPrixNegocie = document.getElementById("repos-prix-negocie");
    if (inputPrixNegocie) inputPrixNegocie.onchange = () => { _prixNegocieChambre = inputPrixNegocie.value; };
    const inputBoissons = document.getElementById("repos-nb-boissons");
    if (inputBoissons) inputBoissons.onchange = () => { _nbBoissons = Math.max(0, Math.min(4, parseInt(inputBoissons.value, 10) || 0)); };
    const selBoisson = document.getElementById("repos-select-boisson");
    if (selBoisson) selBoisson.onchange = () => { _typeBoissonId = selBoisson.value; };
    document.querySelectorAll(".repos-select-plat").forEach((sel) => {
      sel.onchange = () => { _platParPersoId[sel.dataset.persoId] = sel.value; };
    });
    const btn = document.getElementById("btn-repos-envoyer");
    if (btn) {
      btn.onclick = () => {
        const persoIds = ids.filter((id) => !_persoIdsDecoches.has(id));
        if (!persoIds.length) { toast("Choisis au moins un personnage."); return; }
        reposLong(persoIds, {
          palierId: _palierId,
          prixNegocieChambre: _prixNegocieChambre,
          nbBoissons: _nbBoissons,
          typeBoissonId: _typeBoissonId,
          platParPersoId: _platParPersoId,
        });
      };
    }
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
    _assurerDefauts();
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const persos = App.chargerPersos();
    const ids = Object.keys(persos).filter((id) => persos[id] && persos[id].classe);
    const attente = lireAttente();

    let html = "";
    if (role === "mj") html += _htmlFormulaireMj(ids, persos);
    html += _htmlReposCourt(ids, persos, role);
    html += _htmlCartesAttente(attente, persos, role);
    zone.innerHTML = html;

    if (role === "mj") _wireFormulaireMj(ids);
    _wireReposCourt();
    _wireCartesAttente();
  }

  // Notification temps réel — un joueur qui a l'onglet Party déjà ouvert voit
  // apparaître son encart "Repos en attente" sans reload, dès que le MJ
  // envoie un repos (même schéma que marche:stock/marche:demandes).
  SyncStore.subscribe(STORAGE_REPOS_ATTENTE, () => {
    const p = document.getElementById("panneau-party");
    if (p && p.classList.contains("actif")) rendreZoneRepos();
  });

  return { rendreZoneRepos, reposLong, reposCourt, lancerJetRepos, purgerAttente };
})();
