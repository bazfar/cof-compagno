/* ============================================================
   Marché — localités, marchands, achat et négociation manuelle.
   Stockage : SyncStore (Firestore, multijoueur temps réel), mêmes
   conventions que js/loot.js (SyncStore.get/set, historique borné).
   Localités/marchands/tirage de stock : cf. data/marche.js.
   ============================================================ */

const Marche = (() => {
  "use strict";

  const KEY_STOCK = "marche:stock";       // { [marchandId]: [itemId, ...] (40 max) }
  const KEY_DEMANDES = "marche:demandes"; // [{ id, persoId, persoNom, marchandId, localiteId, itemId, modRegionalId, rariteId, remisePct, prixFinalPo, statut, horodatage }]

  function lireStock() { return SyncStore.get(KEY_STOCK) || {}; }
  function sauverStock(s) { SyncStore.set(KEY_STOCK, s); }

  function lireDemandes() { return SyncStore.get(KEY_DEMANDES) || []; }
  function sauverDemandes(d) { SyncStore.set(KEY_DEMANDES, d); }

  function lirePersos() { return App.chargerPersos(); }
  function sauverPersosPartagees(p) { App.sauverPersos(p); }

  /* ── Utilitaires (copie locale, même convention que js/loot.js) ── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  function _catalogue() { return (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE : []; }
  function _itemCatalogue(id) { return _catalogue().find((i) => i.id === id); }
  function _localite(id) { return LOCALITES_MARCHE.find((l) => l.id === id); }
  function _marchand(localite, id) { return localite ? localite.marchands.find((m) => m.id === id) : null; }
  function _trouverMarchandEtLocalite(marchandId) {
    for (const loc of LOCALITES_MARCHE) {
      const m = loc.marchands.find((mm) => mm.id === marchandId);
      if (m) return { localite: loc, marchand: m };
    }
    return { localite: null, marchand: null };
  }

  function _idModificateurLePlusProche(valeur) {
    let meilleur = MODIFICATEURS_REGIONAUX[0];
    let ecart = Math.abs(meilleur.valeur - valeur);
    for (const m of MODIFICATEURS_REGIONAUX) {
      const e = Math.abs(m.valeur - valeur);
      if (e < ecart) { meilleur = m; ecart = e; }
    }
    return meilleur.id;
  }

  // Prix = base × modificateur régional (sauf accessoire) × rareté (accessoire
  // non rariteFixe uniquement) × (1 - remise%), arrondi entier supérieur.
  function calculerPrix(item, modificateurValeur, rareteValeur, remisePct) {
    let prix = item.prixPo;
    if (!item.sansModificateurRegional) prix *= modificateurValeur;
    if (item.type === "accessoire" && !item.rariteFixe) prix *= rareteValeur;
    if (remisePct) prix *= (1 - remisePct / 100);
    return Math.ceil(prix);
  }

  function _statsItem(it) {
    if (it.type === "arme") {
      const degats = it.enchantement > 0 ? `${it.enchantement}+${it.degats}` : it.degats;
      return `${degats} · ${it.portee}${it.deuxMains ? " · 2 mains" : ""}`;
    }
    if (it.type === "armure") return `Réduction ${it.valeurArmure}${it.malusDEX ? ` · Malus DEX -${it.malusDEX}` : ""}`;
    if (it.type === "bouclier") return `+${it.bonusDEF} DEF`;
    if (it.type === "accessoire") return it.effet;
    if (it.type === "consommable") return `Quantité : ${it.quantite || 1}`;
    return "";
  }

  /* ── État local de sélection (par onglet/navigateur, pas synchronisé) ── */
  let _persoId = null;
  let _localiteId = null;
  let _marchandId = null;

  /* ── Sélecteurs (peuplés une fois, valeur préservée entre les rendus) ── */
  function _peuplerSelectPerso(role) {
    const sel = document.getElementById("select-marche-perso");
    if (!sel) return;
    const persos = lirePersos();
    const ids = Object.keys(persos).filter((id) => role === "mj" || App.estProprietaire(persos[id]));
    const valeurActuelle = _persoId || sel.value;
    sel.innerHTML = ids.length
      ? ids.map((id) => `<option value="${id}">${echapper(persos[id].nom)}</option>`).join("")
      : `<option value="">— Aucun personnage —</option>`;
    _persoId = ids.includes(valeurActuelle) ? valeurActuelle : (ids[0] || null);
    if (_persoId) sel.value = _persoId;
    sel.onchange = () => { _persoId = sel.value; };
  }

  function _peuplerSelectLocalite() {
    const sel = document.getElementById("select-marche-localite");
    if (!sel) return;
    if (!sel.dataset.pret) {
      sel.innerHTML = LOCALITES_MARCHE.map((l) => `<option value="${l.id}">${echapper(l.nom)}</option>`).join("");
      sel.dataset.pret = "1";
      sel.onchange = () => {
        _localiteId = sel.value;
        _marchandId = null;
        _peuplerSelectMarchand();
        rendrePanneauMarche();
      };
    }
    if (!_localiteId) _localiteId = LOCALITES_MARCHE[0] ? LOCALITES_MARCHE[0].id : null;
    sel.value = _localiteId;
  }

  function _peuplerSelectMarchand() {
    const sel = document.getElementById("select-marche-marchand");
    if (!sel) return;
    const localite = _localite(_localiteId);
    const marchands = localite ? localite.marchands : [];
    const valeurActuelle = _marchandId || sel.value;
    sel.innerHTML = marchands.length
      ? marchands.map((m) => `<option value="${m.id}">${echapper(m.nom)}</option>`).join("")
      : `<option value="">— Aucun marchand —</option>`;
    _marchandId = marchands.some((m) => m.id === valeurActuelle) ? valeurActuelle : (marchands[0] ? marchands[0].id : null);
    if (_marchandId) sel.value = _marchandId;
    sel.onchange = () => { _marchandId = sel.value; rendrePanneauMarche(); };
  }

  /* ── Stock ──────────────────────────────────────────────────── */
  function _assurerStock(marchand, localite) {
    if (!marchand || !localite) return [];
    const stock = lireStock();
    if (!stock[marchand.id]) {
      stock[marchand.id] = tirerStockMarchand(marchand, localite, _catalogue());
      sauverStock(stock);
    }
    return stock[marchand.id];
  }

  function _regenererStock(marchand, localite) {
    if (!marchand || !localite) return;
    const stock = lireStock();
    stock[marchand.id] = tirerStockMarchand(marchand, localite, _catalogue());
    sauverStock(stock);
    toast(`Réassort effectué (${stock[marchand.id].length} objets).`);
    rendrePanneauMarche();
  }

  /* ── Achat ──────────────────────────────────────────────────── */
  // Débite la bourse (or/argent/bronze convertis en pièces de bronze pour le
  // calcul) et ajoute une copie de l'objet catalogue à l'inventaire.
  function acheterObjetMarche(persoId, itemId, prixFinalPo) {
    const persos = lirePersos();
    const perso = persos[persoId];
    const item = _itemCatalogue(itemId);
    if (!perso || !item) return { ok: false, raison: "invalide" };
    const totalPb = (perso.piecesOr || 0) * 100 + (perso.piecesArgent || 0) * 10 + (perso.piecesBronze || 0);
    const coutPb = Math.round(prixFinalPo * 100);
    if (totalPb < coutPb) return { ok: false, raison: "bourse_insuffisante" };
    const restePb = totalPb - coutPb;
    perso.piecesOr = Math.floor(restePb / 100);
    perso.piecesArgent = Math.floor((restePb % 100) / 10);
    perso.piecesBronze = restePb % 10;
    perso.inventaireListe = perso.inventaireListe || [];
    perso.inventaireListe.push({ id: item.id, nom: item.nom, type: item.type, description: item.description, quantite: 1 });
    sauverPersosPartagees(persos);
    return { ok: true };
  }

  // Demande d'achat côté joueur : prix par défaut du marchand (rareté commune,
  // sans remise) — le MJ ajuste et valide/refuse ensuite.
  function demanderAchatMarche(persoId, marchandId, itemId) {
    const persos = lirePersos();
    const perso = persos[persoId];
    const item = _itemCatalogue(itemId);
    const { localite, marchand } = _trouverMarchandEtLocalite(marchandId);
    if (!perso || !item || !localite || !marchand) return;
    const prixFinalPo = calculerPrix(item, marchand.modificateurParDefaut, 1, 0);
    const demandes = lireDemandes();
    demandes.push({
      id: "demande_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      persoId,
      persoNom: perso.nom,
      marchandId,
      localiteId: localite.id,
      itemId,
      modRegionalId: _idModificateurLePlusProche(marchand.modificateurParDefaut),
      rariteId: "commun",
      remisePct: 0,
      prixFinalPo,
      statut: "attente",
      horodatage: Date.now(),
    });
    sauverDemandes(demandes);
    toast("Demande envoyée, en attente du MJ.");
  }

  function _purgerDemandes(demandes) {
    const enAttente = demandes.filter((d) => d.statut === "attente");
    const resolues = demandes.filter((d) => d.statut !== "attente").slice(-20);
    return resolues.concat(enAttente);
  }

  /* ── Rendu : stock (vue joueur / vue MJ) ────────────────────── */
  function _optionsModificateur(item, selectedId) {
    return MODIFICATEURS_REGIONAUX.map((m) =>
      `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${echapper(m.label)}</option>`
    ).join("");
  }
  function _optionsRarete(selectedId) {
    return RARETES_MARCHE.map((r) =>
      `<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>${echapper(r.label)}</option>`
    ).join("");
  }
  function _optionsRemise(selectedPct) {
    return [0, 10, 20].map((pct) =>
      `<option value="${pct}" ${pct === selectedPct ? "selected" : ""}>${pct === 0 ? "Remise 0%" : "-" + pct + "%"}</option>`
    ).join("");
  }

  function _valeurModificateur(id) {
    const m = MODIFICATEURS_REGIONAUX.find((x) => x.id === id);
    return m ? m.valeur : 1;
  }
  function _valeurRarete(id) {
    const r = RARETES_MARCHE.find((x) => x.id === id);
    return r ? r.valeur : 1;
  }

  function _recalculerLigne(zone, itemId) {
    const item = _itemCatalogue(itemId);
    if (!item) return;
    const selMod = zone.querySelector(`.marche-select-mod[data-id="${itemId}"]`);
    const selRarete = zone.querySelector(`.marche-select-rarete[data-id="${itemId}"]`);
    const selRemise = zone.querySelector(`.marche-select-remise[data-id="${itemId}"]`);
    const modVal = selMod ? _valeurModificateur(selMod.value) : 1;
    const rareteVal = selRarete ? _valeurRarete(selRarete.value) : 1;
    const remisePct = selRemise ? parseInt(selRemise.value, 10) || 0 : 0;
    const prix = calculerPrix(item, modVal, rareteVal, remisePct);
    const span = zone.querySelector(`.marche-prix-calcule[data-id="${itemId}"]`);
    if (span) span.textContent = `${prix} po`;
    return prix;
  }

  function _carteStockJoueur(item, marchand) {
    const prix = calculerPrix(item, marchand.modificateurParDefaut, 1, 0);
    const stats = _statsItem(item);
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-${item.type}">${item.type}</span>
      </div>
      ${stats ? `<div class="loot-item-stats">${echapper(stats)}</div>` : ""}
      <div class="loot-item-desc">${echapper(item.description)}</div>
      <div class="marche-prix">${prix} po</div>
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-marche-demander" data-id="${item.id}">🛒 Demander l'achat</button>
      </div>
    </div>`;
  }

  function _carteStockMj(item, marchand) {
    const stats = _statsItem(item);
    const modDefautId = _idModificateurLePlusProche(marchand.modificateurParDefaut);
    const prixInitial = calculerPrix(item, marchand.modificateurParDefaut, 1, 0);
    const afficheRarete = item.type === "accessoire" && !item.rariteFixe;
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-${item.type}">${item.type}</span>
      </div>
      ${stats ? `<div class="loot-item-stats">${echapper(stats)}</div>` : ""}
      <div class="loot-item-desc">${echapper(item.description)}</div>
      <div class="marche-controles">
        ${!item.sansModificateurRegional ? `<select class="marche-select-mod" data-id="${item.id}">${_optionsModificateur(item, modDefautId)}</select>` : ""}
        ${afficheRarete ? `<select class="marche-select-rarete" data-id="${item.id}">${_optionsRarete("commun")}</select>` : ""}
        <select class="marche-select-remise" data-id="${item.id}" ${marchand.estMarcheNoir ? "disabled" : ""}>${_optionsRemise(0)}</select>
        <span class="marche-prix-calcule" data-id="${item.id}">${prixInitial} po</span>
      </div>
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-marche-acheter-direct" data-id="${item.id}">💰 Acheter (direct)</button>
      </div>
    </div>`;
  }

  function _afficherStock(role, marchand, localite) {
    const zone = document.getElementById("zone-marche");
    if (!zone) return;
    if (!marchand || !localite) { zone.innerHTML = '<p class="vide">Choisis une localité et un marchand.</p>'; return; }
    const stockIds = _assurerStock(marchand, localite);
    const items = stockIds.map((id) => _itemCatalogue(id)).filter(Boolean);
    if (!items.length) { zone.innerHTML = '<p class="vide">Ce marchand n\'a rien en stock pour l\'instant.</p>'; return; }
    zone.innerHTML = items.map((it) => role === "mj" ? _carteStockMj(it, marchand) : _carteStockJoueur(it, marchand)).join("");

    if (role === "mj") {
      zone.querySelectorAll(".marche-select-mod, .marche-select-rarete, .marche-select-remise").forEach((sel) => {
        sel.onchange = () => _recalculerLigne(zone, sel.dataset.id);
      });
      zone.querySelectorAll(".btn-marche-acheter-direct").forEach((btn) => {
        btn.onclick = () => {
          if (!_persoId) { toast("Choisis un personnage destinataire."); return; }
          const prix = _recalculerLigne(zone, btn.dataset.id);
          const res = acheterObjetMarche(_persoId, btn.dataset.id, prix);
          if (!res.ok) { toast(res.raison === "bourse_insuffisante" ? "Bourse insuffisante." : "Achat impossible."); return; }
          toast("Achat effectué ✔");
          rendrePanneauMarche();
        };
      });
    } else {
      zone.querySelectorAll(".btn-marche-demander").forEach((btn) => {
        btn.onclick = () => {
          if (!_persoId) { toast("Choisis ton personnage."); return; }
          demanderAchatMarche(_persoId, marchand.id, btn.dataset.id);
          rendrePanneauMarche();
        };
      });
    }
  }

  /* ── Rendu : file d'attente MJ ───────────────────────────────── */
  function _carteDemande(d) {
    const item = _itemCatalogue(d.itemId);
    const { localite, marchand } = _trouverMarchandEtLocalite(d.marchandId);
    if (!item || !localite || !marchand) return "";
    const afficheRarete = item.type === "accessoire" && !item.rariteFixe;
    const prixActuel = calculerPrix(item, _valeurModificateur(d.modRegionalId), _valeurRarete(d.rariteId), d.remisePct);
    return `<div class="loot-item marche-demande" data-demande-id="${d.id}">
      <div class="loot-item-header">
        <span class="loot-item-nom">${echapper(d.persoNom)} → ${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-accessoire">en attente</span>
      </div>
      <div class="loot-item-desc">${echapper(marchand.nom)} — ${echapper(localite.nom)}</div>
      <div class="marche-controles">
        ${!item.sansModificateurRegional ? `<select class="marche-select-mod" data-demande-id="${d.id}">${_optionsModificateur(item, d.modRegionalId)}</select>` : ""}
        ${afficheRarete ? `<select class="marche-select-rarete" data-demande-id="${d.id}">${_optionsRarete(d.rariteId)}</select>` : ""}
        <select class="marche-select-remise" data-demande-id="${d.id}" ${marchand.estMarcheNoir ? "disabled" : ""}>${_optionsRemise(marchand.estMarcheNoir ? 0 : d.remisePct)}</select>
        <span class="marche-prix-calcule" data-demande-id="${d.id}">${prixActuel} po</span>
      </div>
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-marche-valider" data-demande-id="${d.id}">✅ Valider</button>
        <button class="btn petit secondaire btn-marche-refuser" data-demande-id="${d.id}">❌ Refuser</button>
      </div>
    </div>`;
  }

  function _recalculerLigneDemande(zone, demandeId) {
    const demandes = lireDemandes();
    const d = demandes.find((x) => x.id === demandeId);
    if (!d) return null;
    const item = _itemCatalogue(d.itemId);
    if (!item) return null;
    const selMod = zone.querySelector(`.marche-select-mod[data-demande-id="${demandeId}"]`);
    const selRarete = zone.querySelector(`.marche-select-rarete[data-demande-id="${demandeId}"]`);
    const selRemise = zone.querySelector(`.marche-select-remise[data-demande-id="${demandeId}"]`);
    const modVal = selMod ? _valeurModificateur(selMod.value) : 1;
    const rareteVal = selRarete ? _valeurRarete(selRarete.value) : 1;
    const remisePct = selRemise ? parseInt(selRemise.value, 10) || 0 : 0;
    const prix = calculerPrix(item, modVal, rareteVal, remisePct);
    const span = zone.querySelector(`.marche-prix-calcule[data-demande-id="${demandeId}"]`);
    if (span) span.textContent = `${prix} po`;
    return { prix, modId: selMod ? selMod.value : d.modRegionalId, rariteId: selRarete ? selRarete.value : d.rariteId, remisePct };
  }

  function _afficherDemandes() {
    const zone = document.getElementById("zone-marche-demandes");
    if (!zone) return;
    const demandes = lireDemandes().filter((d) => d.statut === "attente").sort((a, b) => b.horodatage - a.horodatage);
    if (!demandes.length) { zone.innerHTML = ""; return; }
    zone.innerHTML = `<h3 class="titre-bandeau" style="font-size:1rem;">📬 Demandes en attente</h3>` +
      demandes.map((d) => _carteDemande(d)).join("");

    zone.querySelectorAll(".marche-select-mod, .marche-select-rarete, .marche-select-remise").forEach((sel) => {
      sel.onchange = () => _recalculerLigneDemande(zone, sel.dataset.demandeId);
    });
    zone.querySelectorAll(".btn-marche-valider").forEach((btn) => {
      btn.onclick = () => {
        const demandeId = btn.dataset.demandeId;
        const recalc = _recalculerLigneDemande(zone, demandeId) || {};
        let demandes = lireDemandes();
        const d = demandes.find((x) => x.id === demandeId);
        if (!d) return;
        const prixFinal = recalc.prix != null ? recalc.prix : d.prixFinalPo;
        const res = acheterObjetMarche(d.persoId, d.itemId, prixFinal);
        if (!res.ok) {
          toast(res.raison === "bourse_insuffisante"
            ? `Bourse insuffisante pour ${d.persoNom} — demande laissée en attente.`
            : "Achat impossible — demande laissée en attente.");
          return;
        }
        d.statut = "validee";
        d.prixFinalPo = prixFinal;
        if (recalc.modId) d.modRegionalId = recalc.modId;
        if (recalc.rariteId) d.rariteId = recalc.rariteId;
        if (recalc.remisePct != null) d.remisePct = recalc.remisePct;
        demandes = _purgerDemandes(demandes);
        sauverDemandes(demandes);
        toast(`Achat validé pour ${d.persoNom} ✔`);
        rendrePanneauMarche();
      };
    });
    zone.querySelectorAll(".btn-marche-refuser").forEach((btn) => {
      btn.onclick = () => {
        const demandeId = btn.dataset.demandeId;
        let demandes = lireDemandes();
        const d = demandes.find((x) => x.id === demandeId);
        if (!d) return;
        d.statut = "refusee";
        demandes = _purgerDemandes(demandes);
        sauverDemandes(demandes);
        toast(`Demande de ${d.persoNom} refusée.`);
        rendrePanneauMarche();
      };
    });
  }

  /* ── Réassort (MJ) ───────────────────────────────────────────── */
  function _wireReassort() {
    const btn = document.getElementById("btn-marche-reassort");
    if (!btn) return;
    btn.onclick = () => {
      const localite = _localite(_localiteId);
      const marchand = _marchand(localite, _marchandId);
      if (!localite || !marchand) return;
      if (!confirm(`Retirer 40 objets au hasard pour « ${marchand.nom} » ?`)) return;
      _regenererStock(marchand, localite);
    };
  }

  /* ── Point d'entrée ──────────────────────────────────────────── */
  function rendrePanneauMarche() {
    if (typeof LOCALITES_MARCHE === "undefined" || typeof LOOT_CATALOGUE === "undefined") return;
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    _peuplerSelectPerso(role);
    _peuplerSelectLocalite();
    _peuplerSelectMarchand();
    const localite = _localite(_localiteId);
    const marchand = _marchand(localite, _marchandId);
    _afficherStock(role, marchand, localite);
    const zoneDemandes = document.getElementById("zone-marche-demandes");
    if (zoneDemandes) {
      if (role === "mj") _afficherDemandes();
      else zoneDemandes.innerHTML = "";
    }
    _wireReassort();
  }

  return { rendrePanneauMarche, acheterObjetMarche, demanderAchatMarche, calculerPrix };
})();
