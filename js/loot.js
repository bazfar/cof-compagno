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

  // Fiches des personnages : passe par App.chargerPersos/sauverPersos (cf.
  // js/combat.js, même pattern) plutôt que window.DepotPersos.remplacerTout
  // directement — remplacerTout écrase toute la collection cof_persos avec
  // l'instantané reçu, y compris les personnages modifiés entre-temps par
  // d'AUTRES joueurs si celui-ci est périmé (bug réellement rencontré :
  // niveau et livret d'un joueur repartis en arrière après une action Loot
  // sur un autre personnage). App.sauverPersos fait la fusion champ par
  // champ contre la version serveur la plus fraîche.
  function lirePersos() { return App.chargerPersos(); }
  function sauverPersos(p){ App.sauverPersos(p); }

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
    _peuplerDonPieces();
    _initDonPieces();
    _rendreVoteEnCours();
    _rendreHistorique();
  }

  // "Donner des pièces" (or/argent/bronze) — direct, sans passer par le
  // catalogue d'items ni le vote besoin/greed (une bourse n'est pas un objet).
  function _peuplerDonPieces() {
    const sel = document.getElementById("loot-pieces-destinataire");
    if (!sel) return;
    const persos = lirePersos();
    const ids = Object.keys(persos);
    const valeurActuelle = sel.value;
    sel.innerHTML = ids.length
      ? ids.map(id => `<option value="${id}">${echapper(persos[id].nom)}</option>`).join("")
      : `<option value="">— Aucun personnage —</option>`;
    if (ids.includes(valeurActuelle)) sel.value = valeurActuelle;
  }

  function _initDonPieces() {
    const btn = document.getElementById("btn-donner-pieces");
    if (!btn || btn.dataset.pret) return;
    btn.dataset.pret = "1";
    btn.onclick = () => {
      const destId = document.getElementById("loot-pieces-destinataire").value;
      if (!destId) { toast("Choisis un destinataire."); return; }
      const champOr = document.getElementById("loot-pieces-or");
      const champArgent = document.getElementById("loot-pieces-argent");
      const champBronze = document.getElementById("loot-pieces-bronze");
      const or = parseInt(champOr.value, 10) || 0;
      const argent = parseInt(champArgent.value, 10) || 0;
      const bronze = parseInt(champBronze.value, 10) || 0;
      if (!or && !argent && !bronze) { toast("Indique au moins une pièce à donner."); return; }
      const persos = lirePersos();
      const dest = persos[destId];
      if (!dest) return;
      dest.piecesOr = (dest.piecesOr || 0) + or;
      dest.piecesArgent = (dest.piecesArgent || 0) + argent;
      dest.piecesBronze = (dest.piecesBronze || 0) + bronze;
      sauverPersos(persos);
      champOr.value = ""; champArgent.value = ""; champBronze.value = "";
      toast(`Pièces données à ${dest.nom} ✔`);
    };
  }

  function _peuplerFiltreTypes() {
    const sel = document.getElementById("loot-filtre-type");
    if (!sel || sel.dataset.pret) return;
    // Types DÉRIVÉS du catalogue, jamais écrits en dur : la liste figée
    // ["arme"…"consommable"] a survécu à l'arrivée des 82 ingrédients puis
    // des 24 recettes achetables, qui s'affichaient mais étaient
    // infiltrables. Tout nouveau type apparaîtra désormais tout seul.
    // ORDRE ne sert qu'à l'affichage : un type absent de cette liste n'est
    // pas ignoré, il passe simplement en fin, trié alphabétiquement.
    const ORDRE = ["arme", "armure", "bouclier", "accessoire", "consommable", "ingredient", "recette"];
    const rang = (t) => { const i = ORDRE.indexOf(t); return i < 0 ? 99 : i; };
    [...new Set(catalogue.map((it) => it.type).filter(Boolean))]
      .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b))
      .forEach((t) => {
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
    zone.querySelectorAll(".btn-donner-loot").forEach(btn => {
      btn.onclick = () => ouvrirModalDon(catalogue.find(i => i.id === btn.dataset.id));
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
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-mettre-en-jeu" data-id="${it.id}">⚔ Mettre en jeu</button>
        <button class="btn petit secondaire btn-donner-loot" data-id="${it.id}">🎁 Donner à</button>
      </div>
    </div>`;
  }

  function _statsItem(it) {
    if (it.type === "arme") {
      const bonus = it.bonusDegatsTotal !== undefined ? it.bonusDegatsTotal : (it.enchantement || 0);
      const degats = bonus > 0 ? `${bonus}+${it.degats}` : it.degats;
      return `${degats} · ${it.portee}${it.deuxMains ? " · 2 mains" : ""}` +
        (it.degatsFeu ? ` · 🔥+${it.degatsFeu}` : "") +
        (it.bonusAttaqueMagique ? ` · +${it.bonusAttaqueMagique} attaque magique` : "");
    }
    if (it.type === "armure")     return `CA ${it.valeurCA ?? 10} · Réduction ${it.reductionDegats || 0}${it.malusDEX ? ` · Malus DEX -${it.malusDEX}` : ""}`;
    if (it.type === "bouclier")   return `+${it.bonusDEF} DEF`;
    if (it.type === "accessoire") return it.effet;
    if (TYPES_EMPILABLES.includes(it.type)) return `Quantité : ${it.quantite}`;
    return "";
  }

  /* ── Modal vote MJ / don direct ────────────────────────────── */
  let _itemBase = null;
  let _rareteChoisie = "commun";
  let _varianteChoisie = null;
  let _materiauChoisi = "aucun";
  let _materiauRangChoisi = 1;
  let _affixeChoisi = "aucun";
  let _modeModal = "vote"; // "vote" | "don"

  // Axes matériau (ex. Feu) et affixe (ex. Aiguisé/Folie) indépendants de la
  // rareté — tous se cumulent. L'affixe est appliqué en dernier car son
  // palier dépend de la rareté déjà choisie (cf. js/affixes.js).
  function _itemFinal() {
    const itemMateriau = (typeof Materiaux !== "undefined")
      ? Materiaux.appliquer(_itemBase, _materiauChoisi, _materiauRangChoisi)
      : _itemBase;
    const itemRarete = (typeof Raretes !== "undefined")
      ? Raretes.appliquer(itemMateriau, _rareteChoisie, _varianteChoisie)
      : itemMateriau;
    return (typeof Affixes !== "undefined")
      ? Affixes.appliquer(itemRarete, _affixeChoisi, _rareteChoisie)
      : itemRarete;
  }

  function ouvrirModalVote(item) { _ouvrirModal(item, "vote"); }
  // Donne l'item directement dans l'inventaire d'un personnage choisi, sans
  // passer par le vote besoin/greed — même sélection de rareté/variante.
  function ouvrirModalDon(item) { _ouvrirModal(item, "don"); }

  function _ouvrirModal(item, mode) {
    if (!item) return;
    const modal = document.getElementById("modal-loot");
    if (!modal) return;

    _itemBase = item;
    _rareteChoisie = "commun";
    const variantes = (typeof Raretes !== "undefined") ? Raretes.variantesDisponibles(item.id) : [];
    _varianteChoisie = variantes.length ? variantes[0].id : null;
    _materiauChoisi = "aucun";
    _materiauRangChoisi = 1;
    _affixeChoisi = "aucun";
    _modeModal = mode;

    const persos = lirePersos();
    const ids = Object.keys(persos);

    const titreEl = document.getElementById("modal-loot-titre");
    if (titreEl) titreEl.textContent = mode === "don" ? "Donner un item" : "Mettre un item en jeu";
    const btnLancer = document.getElementById("btn-lancer-vote");
    const btnDonner = document.getElementById("btn-donner-direct");
    if (btnLancer) btnLancer.style.display = mode === "vote" ? "" : "none";
    if (btnDonner) btnDonner.style.display = mode === "don" ? "" : "none";

    const zoneDest = document.getElementById("modal-loot-destinataire");
    if (zoneDest) {
      zoneDest.style.display = mode === "don" ? "block" : "none";
      if (mode === "don") {
        const sel = document.getElementById("select-don-destinataire");
        sel.innerHTML = ids.length
          ? ids.map(id => `<option value="${id}">${echapper(persos[id].nom)}</option>`).join("")
          : `<option value="">— Aucun personnage —</option>`;
      }
    }

    _rendreApercuModalLoot();
    _rendreSelecteurRarete();
    _rendreSelecteurVariante();
    _rendreSelecteurMateriau();
    _rendreSelecteurRangMateriau();
    _rendreSelecteurAffixe();

    if (btnLancer) {
      btnLancer.onclick = () => {
        const itemFinal = _itemFinal();
        const vote = { item: itemFinal, votes: {}, statut: "vote_en_cours", gagnant: null, ts: Date.now() };
        ids.forEach(id => { vote.votes[id] = { type: null, jet: null }; });
        sauverVote(vote);
        modal.style.display = "none";
        rendreCatalogue();
        toast("Vote lancé pour « " + itemFinal.nom + " » (" + itemFinal.rareteNom + ") !");
      };
    }
    if (btnDonner) {
      btnDonner.onclick = () => {
        const destId = document.getElementById("select-don-destinataire").value;
        if (!destId) { toast("Choisis un destinataire."); return; }
        const persosActuels = lirePersos();
        const dest = persosActuels[destId];
        if (!dest) return;
        const itemFinal = _itemFinal();
        if (!Array.isArray(dest.inventaireListe)) dest.inventaireListe = [];
        App.ajouterAInventaire(dest, Object.assign({}, itemFinal, { itemRef: itemFinal.id }));
        sauverPersos(persosActuels);
        modal.style.display = "none";
        rendreCatalogue();
        toast("« " + itemFinal.nom + " » (" + itemFinal.rareteNom + ") donné à " + dest.nom + " !");
      };
    }

    modal.style.display = "flex";
  }

  // Ré-affiche nom/stats/desc/effet du modal selon l'item de base + la rareté
  // et la variante choisies.
  function _rendreApercuModalLoot() {
    if (!_itemBase) return;
    const item = _itemFinal();

    const nomEl = document.getElementById("modal-loot-item-nom");
    nomEl.textContent = item.nom;
    nomEl.style.color = item.rareteCouleur || "";
    const badgeEl = document.getElementById("modal-loot-item-rarete-badge");
    if (badgeEl) {
      badgeEl.textContent = item.rareteNom || "";
      badgeEl.style.background = item.rareteCouleur || "";
    }
    document.getElementById("modal-loot-item-stats").textContent = _statsItem(item);
    document.getElementById("modal-loot-item-desc").textContent = item.description;

    const effetEl = document.getElementById("modal-loot-item-effet");
    if (effetEl) {
      if (item.effetRarete) {
        effetEl.textContent = "✨ " + item.effetRarete;
        effetEl.style.color = item.rareteCouleur || "";
        effetEl.style.display = "block";
      } else {
        effetEl.style.display = "none";
      }
    }

    const effetMateriauEl = document.getElementById("modal-loot-item-effet-materiau");
    if (effetMateriauEl) {
      if (item.materiauEffet) {
        effetMateriauEl.textContent = "🔥 " + item.materiauEffet;
        effetMateriauEl.style.color = "var(--or)";
        effetMateriauEl.style.display = "block";
      } else {
        effetMateriauEl.style.display = "none";
      }
    }

    const effetAffixeEl = document.getElementById("modal-loot-item-effet-affixe");
    if (effetAffixeEl) {
      if (item.effetAffixe) {
        effetAffixeEl.textContent = "⚔ " + item.effetAffixe;
        effetAffixeEl.style.color = "var(--or)";
        effetAffixeEl.style.display = "block";
      } else {
        effetAffixeEl.style.display = "none";
      }
    }
  }

  function _rendreSelecteurRarete() {
    const zone = document.getElementById("modal-loot-rarete");
    if (!zone || typeof RARETES === "undefined") return;
    zone.innerHTML = RARETES.map(r => `<button type="button" class="chip-rarete${r.id === _rareteChoisie ? " actif" : ""}"
      data-rarete="${r.id}" style="--couleur-rarete:${r.couleur};">${echapper(r.nom)}</button>`).join("");
    zone.querySelectorAll(".chip-rarete").forEach(btn => {
      btn.onclick = () => {
        _rareteChoisie = btn.dataset.rarete;
        _rendreSelecteurRarete();
        _rendreSelecteurVariante();
        _rendreSelecteurAffixe();
        _rendreApercuModalLoot();
      };
    });
  }

  // Sélecteur de variante d'effet — visible seulement à partir de "rare",
  // et seulement si l'item propose des variantes (cf. EFFETS_PAR_ITEM).
  function _rendreSelecteurVariante() {
    const zone = document.getElementById("modal-loot-variante");
    if (!zone) return;
    const auMoinsRare = _rareteChoisie === "rare" || _rareteChoisie === "legendaire";
    const variantes = (typeof Raretes !== "undefined" && _itemBase) ? Raretes.variantesDisponibles(_itemBase.id) : [];

    if (!auMoinsRare || !variantes.length) { zone.style.display = "none"; zone.innerHTML = ""; return; }

    zone.style.display = "flex";
    zone.innerHTML = variantes.map(v => `<button type="button" class="chip-variante${v.id === _varianteChoisie ? " actif" : ""}"
      data-variante="${v.id}">${echapper(v.nom)}</button>`).join("");
    zone.querySelectorAll(".chip-variante").forEach(btn => {
      btn.onclick = () => {
        _varianteChoisie = btn.dataset.variante;
        _rendreSelecteurVariante();
        _rendreApercuModalLoot();
      };
    });
  }

  // Sélecteur d'affixe (ex. "Aiguisé"/"Folie") — indépendant des variantes
  // par item (EFFETS_PAR_ITEM) : disponible sur toute arme dès "Peu commun",
  // cf. js/affixes.js.
  function _rendreSelecteurAffixe() {
    const zone = document.getElementById("modal-loot-affixe");
    if (!zone) return;
    const disponible = _rareteChoisie !== "commun" &&
      (typeof Affixes !== "undefined" && _itemBase && Affixes.disponiblePour(_itemBase));

    if (!disponible) { zone.style.display = "none"; zone.innerHTML = ""; _affixeChoisi = "aucun"; return; }

    const options = [{ id: "aucun", nom: "Aucun" }].concat(
      Object.values(AFFIXES_ARMES).map(a => ({ id: a.id, nom: a.nom }))
    );
    zone.style.display = "flex";
    zone.innerHTML = options.map(o => `<button type="button" class="chip-affixe${o.id === _affixeChoisi ? " actif" : ""}"
      data-affixe="${o.id}">${echapper(o.nom)}</button>`).join("");
    zone.querySelectorAll(".chip-affixe").forEach(btn => {
      btn.onclick = () => {
        _affixeChoisi = btn.dataset.affixe;
        _rendreSelecteurAffixe();
        _rendreApercuModalLoot();
      };
    });
  }

  // Sélecteur de matériau (ex. "Feu") — visible seulement si l'item de base
  // peut en recevoir un (armes uniquement, cf. Materiaux.disponiblePour).
  function _rendreSelecteurMateriau() {
    const zone = document.getElementById("modal-loot-materiau");
    if (!zone) return;
    if (typeof Materiaux === "undefined" || !_itemBase || !Materiaux.disponiblePour(_itemBase)) {
      zone.style.display = "none";
      zone.innerHTML = "";
      return;
    }

    const options = [{ id: "aucun", nom: "Aucun" }].concat(
      Object.values(Materiaux.LISTE).map(m => ({ id: m.id, nom: m.nom }))
    );
    zone.style.display = "flex";
    zone.innerHTML = options.map(o => `<button type="button" class="chip-materiau${o.id === _materiauChoisi ? " actif" : ""}"
      data-materiau="${o.id}">${echapper(o.nom)}</button>`).join("");
    zone.querySelectorAll(".chip-materiau").forEach(btn => {
      btn.onclick = () => {
        _materiauChoisi = btn.dataset.materiau;
        _materiauRangChoisi = 1;
        _rendreSelecteurMateriau();
        _rendreSelecteurRangMateriau();
        _rendreApercuModalLoot();
      };
    });
  }

  // Sélecteur de rang du matériau choisi — visible seulement si un matériau
  // autre que "aucun" est sélectionné.
  function _rendreSelecteurRangMateriau() {
    const zone = document.getElementById("modal-loot-materiau-rang");
    if (!zone) return;
    if (typeof Materiaux === "undefined" || _materiauChoisi === "aucun") {
      zone.style.display = "none";
      zone.innerHTML = "";
      return;
    }
    const materiau = Materiaux.trouver(_materiauChoisi);
    if (!materiau) { zone.style.display = "none"; zone.innerHTML = ""; return; }

    zone.style.display = "flex";
    zone.innerHTML = materiau.rangs.map(r => `<button type="button" class="chip-rang-materiau${r.rang === _materiauRangChoisi ? " actif" : ""}"
      data-rang="${r.rang}">Rang ${r.rang}</button>`).join("");
    zone.querySelectorAll(".chip-rang-materiau").forEach(btn => {
      btn.onclick = () => {
        _materiauRangChoisi = Number(btn.dataset.rang);
        _rendreSelecteurRangMateriau();
        _rendreApercuModalLoot();
      };
    });
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
      App.ajouterAInventaire(persos[gagnantId], item);
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
    ouvrirModalDon,
    fermerModalLoot,
    resoudreVote,
  };
})();
