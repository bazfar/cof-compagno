/* ============================================================
   Repos — auberge (nuitée + repas + boissons) dans l'onglet 🎭 Party.
   Stockage : SyncStore, même convention que js/marche.js (demandes).
   Contrairement au Marché, le coût est débité IMMÉDIATEMENT (pas de
   validation MJ) ; en revanche la régénération de PV n'est jamais
   automatique — chaque joueur concerné lance lui-même son jet depuis
   l'encart "🛌 Repos en attente" (patron identique à la mutation due,
   cf. _rendreZoneMutations dans js/app.js).
   Paliers/repas/boissons : cf. data/repos.js.

   Audit (09/08/2026) : envoyerRepos écrasait silencieusement toute
   entrée en attente déjà existante pour un personnage — un joueur qui
   n'avait pas encore lancé son jet perdait à la fois l'or déjà prélevé
   et la régénération de la nuitée précédente, sans le moindre message.
   Corrigé : un personnage déjà en attente est désormais ignoré (signalé
   au MJ) plutôt que re-servi. purgerAttente() donne au MJ un moyen
   explicite de vider une entrée bloquée (jet jamais fait, joueur
   déconnecté...) avant de pouvoir renvoyer un repos au même personnage —
   sans remboursement automatique, décision de table laissée au MJ.

   envoyerRepos accepte aussi un tarif de chambre négocié (optionnel),
   qui remplace palier.prixPo pour cette nuitée sans toucher aux dés de
   régénération — ex. chambre privée obtenue au prix d'un dortoir.
   ============================================================ */

const Repos = (() => {
  "use strict";

  const STORAGE_REPOS_ATTENTE = "repos:enAttente"; // { [persoId]: { label, des:[..], flat, horodatage } }

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
  function _repas(id) { return TYPES_REPAS.find((r) => r.id === id); }
  function _boisson(id) { return TYPES_BOISSON.find((b) => b.id === id); }
  function _formatPo(n) { return (Math.round(n * 100) / 100).toString(); }

  /* ── État local du formulaire MJ (par onglet/navigateur, pas synchronisé) ── */
  let _persoIdsDecoches = new Set(); // ids explicitement décochés — vide = tout le monde coché par défaut
  let _palierId = null;
  let _nbRepas = 2;
  let _typeRepasId = null;
  let _nbBoissons = 0;
  let _typeBoissonId = null;
  let _prixNegocieChambre = ""; // chaîne brute du champ — vide = pas de tarif négocié, on retombe sur palier.prixPo

  function _assurerDefauts() {
    if (!_palierId) _palierId = PALIERS_AUBERGE[0].id;
    if (!_typeRepasId) _typeRepasId = TYPES_REPAS[0].id;
    if (!_typeBoissonId) _typeBoissonId = TYPES_BOISSON[0].id;
  }

  /* ── Envoi du repos (MJ) ──────────────────────────────────────── */
  // prixChambrePo (optionnel) : tarif négocié qui REMPLACE palier.prixPo pour
  // cette nuitée (ex. chambre privée obtenue au prix d'un dortoir) — les dés
  // de régénération et le flat restent ceux du palier choisi, seul le coût
  // en po change. undefined/"" = comportement historique (palier.prixPo).
  function envoyerRepos(persoIds, palierId, nbRepas, typeRepasId, nbBoissons, typeBoissonId, prixChambrePo) {
    const palier = _palier(palierId);
    const repas = _repas(typeRepasId);
    const boisson = _boisson(typeBoissonId);
    if (!palier || !repas || !boisson) return;
    const prixChambre = (prixChambrePo !== undefined && prixChambrePo !== "" && !Number.isNaN(Number(prixChambrePo)))
      ? Math.max(0, Number(prixChambrePo)) : palier.prixPo;
    const coutPoParPersonne = prixChambre + nbRepas * repas.prixPo + nbBoissons * boisson.prixPo;
    const coutPb = Math.round(coutPoParPersonne * 100);
    const persos = App.chargerPersos();
    const attente = lireAttente();
    const insuffisants = [];
    // Un personnage qui a déjà un repos en attente (jet non lancé) ne doit
    // JAMAIS être re-servi : envoyerRepos écrasait auparavant l'entrée en
    // attente sans préavis — le joueur perdait à la fois l'or déjà prélevé
    // ET le jet de régénération de la nuitée précédente, sans que rien ne
    // le signale. cf. purgerAttente ci-dessous pour vider délibérément une
    // entrée bloquée avant de renvoyer un repos.
    const dejaEnAttente = [];
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
      const des = palier.des.concat(Array(nbRepas).fill(repas.des).flat());
      const flat = palier.flat + nbRepas * (repas.flat || 0);
      attente[persoId] = {
        label: "Repos — " + palier.nom + (prixChambre !== palier.prixPo ? ` (tarif négocié ${_formatPo(prixChambre)} po)` : "") + (nbRepas ? ` + ${nbRepas} repas ${repas.nom.toLowerCase()}` : ""),
        des, flat,
        horodatage: Date.now(),
      };
      servis++;
    });
    App.sauverPersos(persos);
    sauverAttente(attente);
    let msg = servis
      ? `🛌 Repos envoyé à ${servis} personnage${servis > 1 ? "s" : ""} (${_formatPo(coutPoParPersonne * servis)} po prélevés au total).`
      : "🛌 Aucun personnage servi.";
    if (insuffisants.length) msg += ` Bourse insuffisante pour : ${insuffisants.join(", ")}.`;
    if (dejaEnAttente.length) msg += ` Déjà un repos en attente (non lancé) pour : ${dejaEnAttente.join(", ")} — purge-le d'abord si besoin.`;
    toast(msg);
    rendreZoneRepos();
  }

  /* ── Lancer le jet (joueur ou MJ) ─────────────────────────────── */
  function lancerJetRepos(persoId) {
    const attente = lireAttente();
    const entree = attente[persoId];
    if (!entree) return;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    let total = entree.flat || 0;
    entree.des.forEach((d) => { total += App.lancerDe(d); });
    App.ajusterPv(persoId, total);
    // Grimoire v3 : un repos long rouvre la fenêtre de re-préparation des
    // sorts (cf. Personnage.grimoirePreparationDisponible).
    if (App.autoriserPreparationGrimoire) App.autoriserPreparationGrimoire(persoId);
    const formule = entree.des.map((d) => `1d${d}`).join("+") + (entree.flat ? `+${entree.flat}` : "");
    App.ajouterHisto(entree.label, total, false, false, formule);
    toast(`🛌 ${p.nom} récupère ${total} PV.`);
    delete attente[persoId];
    sauverAttente(attente);
    rendreZoneRepos();
  }

  /* ── Purge MJ d'un repos en attente non lancé ─────────────────── */
  // Le joueur ne récupère AUCUN PV (aucun jet n'a été fait) et l'or déjà
  // prélevé au moment de envoyerRepos n'est PAS remboursé automatiquement —
  // c'est une décision de table, pas un calcul : au MJ de compenser à la
  // main (boutons +/- PO sur la fiche) s'il l'estime nécessaire. Pensé pour
  // débloquer une entrée abandonnée (joueur déconnecté, oubli, changement
  // de plan du MJ) avant de pouvoir renvoyer un nouveau repos au même
  // personnage — cf. le garde "dejaEnAttente" dans envoyerRepos ci-dessus.
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
      `<option value="${p.id}" ${p.id === _palierId ? "selected" : ""}>${echapper(p.nom)} (${p.prixPo} po)</option>`).join("");
    const optionsRepas = TYPES_REPAS.map((r) =>
      `<option value="${r.id}" ${r.id === _typeRepasId ? "selected" : ""}>${echapper(r.nom)} (${r.prixPo} po)</option>`).join("");
    const optionsBoisson = TYPES_BOISSON.map((b) =>
      `<option value="${b.id}" ${b.id === _typeBoissonId ? "selected" : ""}>${echapper(b.nom)} (${b.prixPo} po)</option>`).join("");
    return `<div class="carte">
      <h3 style="margin-top:0;">🛌 Organiser un repos</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${checks}</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:10px;">
        <label>Auberge
          <select id="repos-select-palier">${optionsPalier}</select>
        </label>
        <label title="Remplace le prix de la chambre pour cette nuitée seulement — ex. chambre privée négociée au prix d'un dortoir. Laisser vide pour le tarif normal.">Tarif négocié (po, optionnel)
          <input type="number" id="repos-prix-negocie" min="0" step="0.1" value="${echapper(_prixNegocieChambre)}" placeholder="prix normal" style="width:90px;" />
        </label>
        <label>Repas
          <input type="number" id="repos-nb-repas" min="0" max="4" value="${_nbRepas}" style="width:50px;" /> ×
          <select id="repos-select-repas">${optionsRepas}</select>
        </label>
        <label>Boissons
          <input type="number" id="repos-nb-boissons" min="0" max="4" value="${_nbBoissons}" style="width:50px;" /> ×
          <select id="repos-select-boisson">${optionsBoisson}</select>
        </label>
      </div>
      <button class="btn or" id="btn-repos-envoyer">🛌 Envoyer le repos</button>
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
    const inputRepas = document.getElementById("repos-nb-repas");
    if (inputRepas) inputRepas.onchange = () => { _nbRepas = Math.max(0, Math.min(4, parseInt(inputRepas.value, 10) || 0)); };
    const selRepas = document.getElementById("repos-select-repas");
    if (selRepas) selRepas.onchange = () => { _typeRepasId = selRepas.value; };
    const inputBoissons = document.getElementById("repos-nb-boissons");
    if (inputBoissons) inputBoissons.onchange = () => { _nbBoissons = Math.max(0, Math.min(4, parseInt(inputBoissons.value, 10) || 0)); };
    const selBoisson = document.getElementById("repos-select-boisson");
    if (selBoisson) selBoisson.onchange = () => { _typeBoissonId = selBoisson.value; };
    const btn = document.getElementById("btn-repos-envoyer");
    if (btn) {
      btn.onclick = () => {
        const persoIds = ids.filter((id) => !_persoIdsDecoches.has(id));
        if (!persoIds.length) { toast("Choisis au moins un personnage."); return; }
        envoyerRepos(persoIds, _palierId, _nbRepas, _typeRepasId, _nbBoissons, _typeBoissonId, _prixNegocieChambre);
      };
    }
  }

  function _htmlCartesAttente(attente, persos, role) {
    const ids = Object.keys(attente).filter((id) => persos[id]);
    if (!ids.length) return "";
    const cartes = ids.map((id) => {
      const p = persos[id];
      const e = attente[id];
      const peutLancer = role === "mj" || (typeof App !== "undefined" && App.estProprietaire && App.estProprietaire(p));
      const formule = e.des.map((d) => `1d${d}`).join("+") + (e.flat ? `+${e.flat}` : "");
      return `<div class="carte">
        <strong>🛌 Repos en attente — ${echapper(p.nom)}</strong>
        <div style="font-size:0.85rem;margin:4px 0;">${echapper(e.label)} — formule : ${echapper(formule)}</div>
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
    html += _htmlCartesAttente(attente, persos, role);
    zone.innerHTML = html;

    if (role === "mj") _wireFormulaireMj(ids);
    _wireCartesAttente();
  }

  // Notification temps réel — un joueur qui a l'onglet Party déjà ouvert voit
  // apparaître son encart "Repos en attente" sans reload, dès que le MJ
  // envoie un repos (même schéma que marche:stock/marche:demandes).
  SyncStore.subscribe(STORAGE_REPOS_ATTENTE, () => {
    const p = document.getElementById("panneau-party");
    if (p && p.classList.contains("actif")) rendreZoneRepos();
  });

  return { rendreZoneRepos, envoyerRepos, lancerJetRepos, purgerAttente };
})();
