/* ============================================================
   Loot — distribution MJ → joueurs avec vote besoin/greed
   Stockage : localStorage (clés cof_loot_vote, cof_loot_histo)
   ============================================================ */

const Loot = (() => {
  "use strict";

  const KEY_VOTE  = "loot:vote";
  const KEY_HISTO = "loot:histo";

  /* ── Helpers stockage — via SyncStore (Firestore, multijoueur temps réel) ── */
  function lireVote()   { return SyncStore.get(KEY_VOTE) || null; }
  function sauverVote(v){ SyncStore.set(KEY_VOTE, v); }
  function effacerVote(){ SyncStore.set(KEY_VOTE, null); }

  function lireHisto()  { return SyncStore.get(KEY_HISTO) || []; }
  function sauverHisto(h){ SyncStore.set(KEY_HISTO, h.slice(-20)); }

  // Fiches des personnages : instance partagée avec app.js/carte.js
  // (window.DepotPersos, cf. depot.js) — un seul cache/abonnement Firestore.
  function lirePersos() { return window.DepotPersos.charger(); }
  function sauverPersos(p){ window.DepotPersos.remplacerTout(p); }

  function persoNom(id) { const p = lirePersos(); return p[id] ? p[id].nom : "Inconnu"; }

  /* ── Catalogue ────────────────────────────────────────────── */
  let catalogue = [];
  function chargerCatalogue() {
    if (typeof LOOT_CATALOGUE !== "undefined") { catalogue = LOOT_CATALOGUE; return; }
    catalogue = [];
  }

  /* ── Vue MJ : catalogue + filtres ────────────────────────── */
  let filtreType = "";
  let filtreRecherche = "";

  function rendreCatalogue() {
    chargerCatalogue();
    const zone = document.getElementById("loot-catalogue");
    if (!zone) return;

    _peuplerFiltreTypes();
    _afficherCatalogue();
    _rendreVoteEnCours();
    _rendreHistorique();
  }

  function _peuplerFiltreTypes() {
    const sel = document.getElementById("loot-filtre-type");
    if (!sel || sel.dataset.pret) return;
    ["arme","armure","bouclier","accessoire","consommable"].forEach(t => {
      const o = document.createElement("option");
      o.value = t; o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      sel.appendChild(o);
    });
    sel.dataset.pret = "1";
    sel.onchange = () => { filtreType = sel.value; _afficherCatalogue(); };
    const rech = document.getElementById("loot-recherche");
    if (rech) rech.oninput = () => { filtreRecherche = rech.value.toLowerCase(); _afficherCatalogue(); };
  }

  function _afficherCatalogue() {
    const zone = document.getElementById("loot-catalogue");
    if (!zone) return;
    const items = catalogue.filter(it => {
      if (filtreType && it.type !== filtreType) return false;
      if (filtreRecherche && !it.nom.toLowerCase().includes(filtreRecherche)) return false;
      return true;
    });
    if (!items.length) { zone.innerHTML = '<p class="vide">Aucun item.</p>'; return; }
    zone.innerHTML = items.map(it => _lootItemHTML(it)).join("");
    zone.querySelectorAll(".btn-mettre-en-jeu").forEach(btn => {
      btn.onclick = () => ouvrirModalVote(catalogue.find(i => i.id === btn.dataset.id));
    });
  }

  function _lootItemHTML(it) {
    const stats = _statsItem(it);
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${echapper(it.nom)}</span>
        <span class="loot-badge loot-badge-${it.type}">${it.type}</span>
        ${it.enchantement ? `<span class="loot-badge loot-badge-magic">+${it.enchantement}</span>` : ""}
      </div>
      ${stats ? `<div class="loot-item-stats">${stats}</div>` : ""}
      <div class="loot-item-desc">${echapper(it.description)}</div>
      <button class="btn petit or btn-mettre-en-jeu" data-id="${it.id}">⚔ Mettre en jeu</button>
    </div>`;
  }

  function _statsItem(it) {
    if (it.type === "arme")       return `${it.degats} · ${it.portee}${it.deuxMains ? " · 2 mains" : ""}`;
    if (it.type === "armure")     return `Réduction ${it.valeurArmure}${it.malusDEX ? ` · Malus DEX -${it.malusDEX}` : ""}`;
    if (it.type === "bouclier")   return `+${it.bonusDEF} DEF`;
    if (it.type === "accessoire") return it.effet;
    if (it.type === "consommable")return `Quantité : ${it.quantite}`;
    return "";
  }

  /* ── Modal vote MJ ────────────────────────────────────────── */
  function ouvrirModalVote(item) {
    if (!item) return;
    const modal = document.getElementById("modal-loot");
    if (!modal) return;

    const persos = lirePersos();
    const ids = Object.keys(persos);

    document.getElementById("modal-loot-item-nom").textContent = item.nom;
    document.getElementById("modal-loot-item-stats").textContent = _statsItem(item);
    document.getElementById("modal-loot-item-desc").textContent = item.description;

    const btnLancer = document.getElementById("btn-lancer-vote");
    btnLancer.onclick = () => {
      const vote = { item, votes: {}, statut: "vote_en_cours", gagnant: null, ts: Date.now() };
      ids.forEach(id => { vote.votes[id] = { type: null, jet: null }; });
      sauverVote(vote);
      modal.style.display = "none";
      rendreCatalogue();
      toast("Vote lancé pour « " + item.nom + " » !");
    };

    modal.style.display = "flex";
  }

  function fermerModalLoot() {
    const m = document.getElementById("modal-loot");
    if (m) m.style.display = "none";
  }

  /* ── Vote en cours (MJ) ───────────────────────────────────── */
  function _rendreVoteEnCours() {
    const zone = document.getElementById("loot-vote-encours");
    if (!zone) return;
    const vote = lireVote();
    if (!vote) { zone.innerHTML = '<p class="vide" style="margin:0;">Aucun vote en cours.</p>'; return; }

    const persos = lirePersos();
    const lignes = Object.entries(vote.votes).map(([id, v]) => {
      const nom = persos[id] ? persos[id].nom : "???";
      const badge = v.type === "besoin" ? '<span class="badge-besoin">Besoin</span>'
                  : v.type === "greed"  ? '<span class="badge-greed">Greed</span>'
                  : '<span class="badge-attente">En attente</span>';
      const jet = v.jet !== null ? ` — 🎲 ${v.jet}` : "";
      return `<div class="vote-ligne">${echapper(nom)} ${badge}${jet}</div>`;
    }).join("");

    const tousOntVote = Object.values(vote.votes).every(v => v.type !== null);

    zone.innerHTML = `
      <div class="vote-item-titre">🎁 ${echapper(vote.item.nom)}</div>
      <div class="vote-lignes">${lignes}</div>
      <div class="vote-actions">
        ${tousOntVote ? '<button class="btn petit or" id="btn-resoudre-vote">⚖ Résoudre</button>' : ""}
        <button class="btn petit danger" id="btn-annuler-vote">✕ Annuler</button>
      </div>`;

    const btnRes = document.getElementById("btn-resoudre-vote");
    if (btnRes) btnRes.onclick = _resoudreVote;
    const btnAnn = document.getElementById("btn-annuler-vote");
    if (btnAnn) btnAnn.onclick = () => { effacerVote(); rendreCatalogue(); toast("Vote annulé."); };
  }

  /* ── Algorithme de résolution ─────────────────────────────── */
  function _resoudreVote() {
    const vote = lireVote();
    if (!vote) return;
    const gagnantId = resoudreVote(vote.votes);
    if (!gagnantId) { toast("Aucun joueur n'a voté."); return; }

    // Ajouter l'item à l'inventaire du gagnant (pas équipé automatiquement —
    // le joueur l'équipe ensuite lui-même depuis le bloc Inventaire de sa fiche).
    const persos = lirePersos();
    if (persos[gagnantId]) {
      if (!Array.isArray(persos[gagnantId].inventaireListe)) persos[gagnantId].inventaireListe = [];
      const item = Object.assign({}, vote.item, { itemRef: vote.item.id });
      persos[gagnantId].inventaireListe.push(item);
      sauverPersos(persos);
    }

    // Historique
    const histo = lireHisto();
    histo.push({ item: vote.item, gagnant: gagnantId, gagnantNom: persoNom(gagnantId), timestamp: Date.now() });
    sauverHisto(histo);

    effacerVote();
    toast("🎉 " + persoNom(gagnantId) + " remporte « " + vote.item.nom + " » !");
    rendreCatalogue();
  }

  function resoudreVote(votes) {
    const besoins = Object.entries(votes).filter(([_, v]) => v.type === "besoin");
    const greeds  = Object.entries(votes).filter(([_, v]) => v.type === "greed");
    const pool = besoins.length > 0 ? besoins : greeds;
    if (pool.length === 0) return null;
    pool.forEach(([id, v]) => { if (v.jet === null) v.jet = Math.ceil(Math.random() * 100); });
    const maxJet = Math.max(...pool.map(([_, v]) => v.jet));
    const gagnants = pool.filter(([_, v]) => v.jet === maxJet);
    if (gagnants.length === 1) return gagnants[0][0];
    const sousVotes = Object.fromEntries(gagnants.map(([id, v]) => [id, { type: v.type, jet: null }]));
    return resoudreVote(sousVotes);
  }

  /* ── Historique ───────────────────────────────────────────── */
  function _rendreHistorique() {
    const zone = document.getElementById("loot-historique");
    if (!zone) return;
    const histo = lireHisto().slice().reverse();
    if (!histo.length) { zone.innerHTML = '<p class="vide">Aucun loot distribué.</p>'; return; }
    zone.innerHTML = histo.map(h => {
      const d = new Date(h.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return `<div class="histo-ligne"><span class="histo-item">${echapper(h.item.nom)}</span> → <strong>${echapper(h.gagnantNom)}</strong> <span class="histo-heure">${d}</span></div>`;
    }).join("");
  }

  /* ── Vue joueur : bannière de vote ────────────────────────── */
  function rendreNotificationVote(persoId) {
    const zone = document.getElementById("loot-notif-joueur");
    if (!zone) return;
    const vote = lireVote();

    if (!vote || vote.statut !== "vote_en_cours") { zone.style.display = "none"; return; }

    const monVote = vote.votes[persoId];
    if (!monVote) { zone.style.display = "none"; return; }

    zone.style.display = "block";
    const dejaVote = monVote.type !== null;
    const stats = _statsItem(vote.item);

    zone.innerHTML = `
      <div class="loot-notif-entete">🎁 Loot disponible !</div>
      <div class="loot-notif-item">
        <strong>${echapper(vote.item.nom)}</strong>
        ${stats ? `<span class="loot-notif-stats">${stats}</span>` : ""}
        <em>${echapper(vote.item.description)}</em>
      </div>
      ${dejaVote
        ? `<div class="loot-notif-vote-ok">Tu as voté : <strong>${monVote.type}</strong>${monVote.jet !== null ? " (🎲 " + monVote.jet + ")" : ""}</div>`
        : `<div class="loot-notif-btns">
            <button class="btn or" id="btn-vote-besoin">❤ Besoin</button>
            <button class="btn secondaire" id="btn-vote-greed">🎲 Greed</button>
          </div>`}`;

    if (!dejaVote) {
      document.getElementById("btn-vote-besoin").onclick = () => _voterJoueur(persoId, "besoin");
      document.getElementById("btn-vote-greed").onclick  = () => _voterJoueur(persoId, "greed");
    }
  }

  function _voterJoueur(persoId, type) {
    const vote = lireVote();
    if (!vote || !vote.votes[persoId]) return;
    vote.votes[persoId].type = type;
    vote.votes[persoId].jet  = type === "greed" ? Math.ceil(Math.random() * 100) : null;
    sauverVote(vote);
    rendreNotificationVote(persoId);
    toast(type === "besoin" ? "❤ Besoin déclaré !" : "🎲 Greed lancé : " + vote.votes[persoId].jet);
  }

  // NB : l'inventaire/équipement du joueur n'est plus rendu ici — le bloc
  // Inventaire de la fiche (app.js, colonne droite) est désormais l'unique
  // source de vérité (voir Personnage.equiper/deséquiper).

  /* ── Polling (vérification vote actif toutes les 4s) ─────── */
  let _persoIdActif = null;
  function demarrerPolling(persoId) {
    _persoIdActif = persoId;
    setInterval(() => {
      if (_persoIdActif) rendreNotificationVote(_persoIdActif);
    }, 4000);
  }

  /* ── Utilitaire ───────────────────────────────────────────── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  return {
    rendreCatalogue,
    rendreNotificationVote,
    demarrerPolling,
    ouvrirModalVote,
    fermerModalLoot,
    resoudreVote,
  };
})();
