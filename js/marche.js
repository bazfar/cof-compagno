/* ============================================================
   Marché — localités, marchands, achat et négociation manuelle.
   Stockage : SyncStore (Firestore, multijoueur temps réel), mêmes
   conventions que js/loot.js (SyncStore.get/set, historique borné).
   Localités/marchands/tirage de stock : cf. data/marche.js.
   ============================================================ */

const Marche = (() => {
  "use strict";

  const KEY_STOCK = "marche:stock";       // { [marchandId]: [{ slotId, itemId, rareteId }, ...] (40 max) }
  const KEY_DEMANDES = "marche:demandes"; // [{ id, persoId, persoNom, marchandId, localiteId, itemId, modRegionalId, rariteId, remisePct, prixFinalPo, statut, horodatage }]

  function lireStock() { return SyncStore.get(KEY_STOCK) || {}; }
  function sauverStock(s) { SyncStore.set(KEY_STOCK, s); }

  // Compat : une ancienne entrée de stock (juste l'id de l'objet, format
  // d'avant l'ajout de la rareté aléatoire) est traitée comme un objet
  // Commun avec un slotId de repli — évite un crash si un vieux document
  // marche:stock traîne encore en base.
  function _normStockEntry(entry, idx) {
    if (typeof entry === "string") return { slotId: entry + "_legacy_" + idx, itemId: entry, rareteId: "commun" };
    return entry;
  }

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

  // Un objet enchanté (arme/armure/bouclier avec enchantement > 0) coûte plus
  // cher que sa version de base — même échelle que RARETES_MARCHE (une arme
  // +1/+2/+3 est de fait "peu commune/rare/légendaire"), plutôt qu'une
  // nouvelle échelle inventée séparément. +1 → ×1,5, +2 → ×3, +3 et plus → ×6.
  function _multiplicateurEnchantement(niveau) {
    if (!niveau) return 1;
    if (niveau >= 3) return _valeurRarete("legendaire");
    if (niveau === 2) return _valeurRarete("rare");
    return _valeurRarete("peu_commun");
  }

  // Un objet ne peut jamais cumuler rareté ET enchantement (les deux sont des
  // façons différentes de dire "cet objet vaut plus cher que la normale") —
  // cf. _peutAvoirRarete.
  function _peutAvoirRarete(item) {
    return !item.rariteFixe && !(item.enchantement > 0);
  }

  // Prix = base × modificateur régional (sauf accessoire) × rareté (tout objet
  // non rariteFixe et non déjà enchanté) × multiplicateur d'enchantement
  // (arme/armure/bouclier déjà enchantés) × (1 - remise%) × modificateur de
  // réputation (si le marchand est lié à une faction, cf. js/reputation.js) —
  // arrondi entier supérieur. Retourne null si le palier de réputation est
  // Némésis (commerce refusé) : à l'appelant de vérifier avant d'afficher un
  // prix ou de proposer un achat.
  function calculerPrix(item, modificateurValeur, rareteValeur, remisePct, factionId) {
    let prix = item.prixPo;
    if (!item.sansModificateurRegional) prix *= modificateurValeur;
    if (_peutAvoirRarete(item)) prix *= rareteValeur;
    if ((item.type === "arme" || item.type === "armure" || item.type === "bouclier") && item.enchantement > 0) {
      prix *= _multiplicateurEnchantement(item.enchantement);
    }
    if (remisePct) prix *= (1 - remisePct / 100);
    prix = Math.ceil(prix);
    if (factionId && typeof Reputation !== "undefined") {
      const resultat = Reputation.appliquerModifierPrix(factionId, prix);
      return resultat.refuse ? null : resultat.prix;
    }
    return prix;
  }

  const _LABELS_RARETE_COURT = { commun: "Commun", peu_commun: "Peu commun", rare: "Rare", legendaire: "Légendaire" };
  function _labelCourtRarete(id) { return _LABELS_RARETE_COURT[id] || id; }

  function _statsItem(it) {
    if (it.type === "arme") {
      const degats = it.enchantement > 0 ? `${it.enchantement}+${it.degats}` : it.degats;
      return `${degats} · ${it.portee}${it.deuxMains ? " · 2 mains" : ""}`;
    }
    if (it.type === "armure") return `CA ${it.valeurCA ?? 10} · Réduction ${it.reductionDegats || 0}${it.malusDEX ? ` · Malus DEX -${it.malusDEX}` : ""}`;
    if (it.type === "bouclier") return `+${it.bonusDEF} DEF`;
    if (it.type === "accessoire") return it.effet;
    if (it.type === "consommable") return `Quantité : ${it.quantite || 1}`;
    return "";
  }

  /* ── État local de sélection (par onglet/navigateur, pas synchronisé) ── */
  let _persoId = null;
  let _localiteId = null;
  let _marchandId = null;
  let _filtreType = "tous"; // "tous" | "equip" | "conso" — filtre d'affichage du stock

  // Un objet est un consommable ou un "équipement" (tout le reste : arme,
  // armure, bouclier, accessoire, charme…). Sert au filtre du marché.
  function _correspondFiltre(item) {
    if (_filtreType === "conso") return item.type === "consommable";
    if (_filtreType === "equip") return item.type !== "consommable";
    return true;
  }

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

  // Mise en vente manuelle d'un objet précis par le MJ, en plus du stock
  // aléatoire — n'écrase rien, ajoute juste une ligne (contrairement au
  // réassort). Ignore délibérément le plafond de valeurCA/bonusDEF de la
  // localité : c'est un outil de placement volontaire, pas un tirage.
  function _ajouterItemAuStock(marchand, itemId, rareteId) {
    const item = _itemCatalogue(itemId);
    if (!marchand || !item) return;
    const stock = lireStock();
    const liste = (stock[marchand.id] || []).map(_normStockEntry);
    const rareteEffective = _peutAvoirRarete(item) ? rareteId : "commun";
    liste.unshift({
      slotId: itemId + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      itemId,
      rareteId: rareteEffective,
    });
    stock[marchand.id] = liste;
    sauverStock(stock);
    toast(`« ${item.nom} » mis en vente chez ${marchand.nom}.`);
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
    perso.inventaireListe.push(Object.assign({}, item, { quantite: 1 }));
    sauverPersosPartagees(persos);
    return { ok: true };
  }

  // Demande d'achat côté joueur : prix par défaut du marchand, à la rareté
  // effectivement affichée en stock (sans remise) — le MJ ajuste et
  // valide/refuse ensuite.
  function demanderAchatMarche(persoId, marchandId, itemId, rareteId) {
    const persos = lirePersos();
    const perso = persos[persoId];
    const item = _itemCatalogue(itemId);
    const { localite, marchand } = _trouverMarchandEtLocalite(marchandId);
    if (!perso || !item || !localite || !marchand) return;
    const rareteEffective = _peutAvoirRarete(item) ? (rareteId || "commun") : "commun";
    const prixFinalPo = calculerPrix(item, marchand.modificateurParDefaut, _valeurRarete(rareteEffective), 0, marchand.faction);
    if (prixFinalPo == null) { toast("Ce marchand refuse de vous vendre quoi que ce soit."); return; }
    const demandes = lireDemandes();
    demandes.push({
      id: "demande_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      persoId,
      persoNom: perso.nom,
      marchandId,
      localiteId: localite.id,
      itemId,
      modRegionalId: _idModificateurLePlusProche(marchand.modificateurParDefaut),
      rariteId: rareteEffective,
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

  // Portée par slotId (pas itemId) : le même objet peut apparaître plusieurs
  // fois en stock (tirage + ajout manuel), chacun avec sa propre rareté.
  function _recalculerLigne(zone, slotId) {
    const controles = zone.querySelector(`.marche-controles[data-slot-id="${slotId}"]`);
    if (!controles) return;
    const item = _itemCatalogue(controles.dataset.itemId);
    if (!item) return;
    const marchand = _marchand(_localite(_localiteId), _marchandId);
    const selMod = controles.querySelector(".marche-select-mod");
    const selRarete = controles.querySelector(".marche-select-rarete");
    const selRemise = controles.querySelector(".marche-select-remise");
    const modVal = selMod ? _valeurModificateur(selMod.value) : 1;
    const rareteVal = selRarete ? _valeurRarete(selRarete.value) : 1;
    const remisePct = selRemise ? parseInt(selRemise.value, 10) || 0 : 0;
    const prix = calculerPrix(item, modVal, rareteVal, remisePct, marchand ? marchand.faction : null);
    const span = controles.querySelector(".marche-prix-calcule");
    if (span) span.textContent = prix == null ? "Refusé" : `${prix} po`;
    return prix;
  }

  function _badgeRarete(item, rareteId) {
    if (!_peutAvoirRarete(item) || rareteId === "commun") return "";
    return `<span class="loot-badge loot-badge-rarete-${rareteId}">${echapper(_labelCourtRarete(rareteId))}</span>`;
  }

  function _carteStockJoueur(slot, marchand) {
    const item = slot.item;
    const prix = calculerPrix(item, marchand.modificateurParDefaut, _valeurRarete(slot.rareteId), 0, marchand.faction);
    const refuse = prix == null;
    const stats = _statsItem(item);
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-${item.type}">${item.type}</span>
        ${item.enchantement ? `<span class="loot-badge loot-badge-magic">+${item.enchantement}</span>` : ""}
        ${_badgeRarete(item, slot.rareteId)}
      </div>
      ${stats ? `<div class="loot-item-stats">${echapper(stats)}</div>` : ""}
      <div class="loot-item-desc">${echapper(item.description)}</div>
      <div class="marche-prix">${refuse ? "Commerce refusé" : prix + " po"}</div>
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-marche-demander" data-item-id="${item.id}" data-rarete-id="${slot.rareteId}" ${refuse ? "disabled" : ""}>🛒 Demander l'achat</button>
      </div>
    </div>`;
  }

  function _carteStockMj(slot, marchand) {
    const item = slot.item;
    const stats = _statsItem(item);
    const modDefautId = _idModificateurLePlusProche(marchand.modificateurParDefaut);
    const prixInitial = calculerPrix(item, marchand.modificateurParDefaut, _valeurRarete(slot.rareteId), 0, marchand.faction);
    const afficheRarete = _peutAvoirRarete(item);
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-${item.type}">${item.type}</span>
        ${item.enchantement ? `<span class="loot-badge loot-badge-magic">+${item.enchantement}</span>` : ""}
        ${_badgeRarete(item, slot.rareteId)}
      </div>
      ${stats ? `<div class="loot-item-stats">${echapper(stats)}</div>` : ""}
      <div class="loot-item-desc">${echapper(item.description)}</div>
      <div class="marche-controles" data-slot-id="${slot.slotId}" data-item-id="${item.id}">
        ${!item.sansModificateurRegional ? `<select class="marche-select-mod">${_optionsModificateur(item, modDefautId)}</select>` : ""}
        ${afficheRarete ? `<select class="marche-select-rarete">${_optionsRarete(slot.rareteId)}</select>` : ""}
        <select class="marche-select-remise" ${marchand.estMarcheNoir ? "disabled" : ""}>${_optionsRemise(0)}</select>
        <span class="marche-prix-calcule">${prixInitial == null ? "Refusé" : prixInitial + " po"}</span>
      </div>
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-marche-acheter-direct" data-slot-id="${slot.slotId}" data-item-id="${item.id}">💰 Acheter (direct)</button>
      </div>
    </div>`;
  }

  function _afficherStock(role, marchand, localite) {
    const zone = document.getElementById("zone-marche");
    if (!zone) return;
    if (!marchand || !localite) { zone.innerHTML = '<p class="vide">Choisis une localité et un marchand.</p>'; return; }
    const stockBrut = _assurerStock(marchand, localite);
    const slots = stockBrut
      .map((entry, idx) => _normStockEntry(entry, idx))
      .map((entry) => Object.assign({}, entry, { item: _itemCatalogue(entry.itemId) }))
      .filter((s) => s.item);
    if (!slots.length) { zone.innerHTML = '<p class="vide">Ce marchand n\'a rien en stock pour l\'instant.</p>'; return; }
    const slotsFiltres = slots.filter((s) => _correspondFiltre(s.item));
    if (!slotsFiltres.length) {
      zone.innerHTML = `<p class="vide">Aucun ${_filtreType === "conso" ? "consommable" : "équipement"} en stock chez ce marchand.</p>`;
      return;
    }
    zone.innerHTML = slotsFiltres.map((s) => role === "mj" ? _carteStockMj(s, marchand) : _carteStockJoueur(s, marchand)).join("");

    if (role === "mj") {
      zone.querySelectorAll(".marche-controles select").forEach((sel) => {
        sel.onchange = () => _recalculerLigne(zone, sel.closest(".marche-controles").dataset.slotId);
      });
      zone.querySelectorAll(".btn-marche-acheter-direct").forEach((btn) => {
        btn.onclick = () => {
          if (!_persoId) { toast("Choisis un personnage destinataire."); return; }
          const prix = _recalculerLigne(zone, btn.dataset.slotId);
          if (prix == null) { toast("Ce marchand refuse de vous vendre quoi que ce soit."); return; }
          const res = acheterObjetMarche(_persoId, btn.dataset.itemId, prix);
          if (!res.ok) { toast(res.raison === "bourse_insuffisante" ? "Bourse insuffisante." : "Achat impossible."); return; }
          toast("Achat effectué ✔");
          rendrePanneauMarche();
        };
      });
    } else {
      zone.querySelectorAll(".btn-marche-demander").forEach((btn) => {
        btn.onclick = () => {
          if (!_persoId) { toast("Choisis ton personnage."); return; }
          demanderAchatMarche(_persoId, marchand.id, btn.dataset.itemId, btn.dataset.rareteId);
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
    const afficheRarete = _peutAvoirRarete(item);
    const prixActuel = calculerPrix(item, _valeurModificateur(d.modRegionalId), _valeurRarete(d.rariteId), d.remisePct, marchand.faction);
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
        <span class="marche-prix-calcule" data-demande-id="${d.id}">${prixActuel == null ? "Refusé" : prixActuel + " po"}</span>
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
    const { marchand } = _trouverMarchandEtLocalite(d.marchandId);
    const prix = calculerPrix(item, modVal, rareteVal, remisePct, marchand ? marchand.faction : null);
    const span = zone.querySelector(`.marche-prix-calcule[data-demande-id="${demandeId}"]`);
    if (span) span.textContent = prix == null ? "Refusé" : `${prix} po`;
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
        const prixFinal = recalc.prix !== undefined ? recalc.prix : d.prixFinalPo;
        if (prixFinal == null) {
          toast(`Ce marchand refuse de vendre quoi que ce soit à ${d.persoNom} — demande laissée en attente.`);
          return;
        }
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

  /* ── Mise en vente manuelle d'un objet précis (MJ) ──────────────── */
  function _peuplerAjoutManuel(marchand) {
    const selItem = document.getElementById("select-marche-ajout-item");
    const selRarete = document.getElementById("select-marche-ajout-rarete");
    if (!selItem || !selRarete) return;
    if (!selRarete.dataset.pret) {
      selRarete.innerHTML = _optionsRarete("commun");
      selRarete.dataset.pret = "1";
    }
    if (!marchand) { selItem.innerHTML = `<option value="">— Choisis un marchand —</option>`; return; }
    const pool = _catalogue().filter((it) => marchand.typesAutorises.includes(it.type));
    const valeurActuelle = selItem.value;
    selItem.innerHTML = pool
      .map((it) => `<option value="${it.id}">${echapper(it.nom)}${it.enchantement ? " +" + it.enchantement : ""}</option>`)
      .join("");
    if (pool.some((it) => it.id === valeurActuelle)) selItem.value = valeurActuelle;
  }

  function _wireAjoutManuel(marchand) {
    const btn = document.getElementById("btn-marche-ajouter-item");
    if (!btn) return;
    btn.onclick = () => {
      const selItem = document.getElementById("select-marche-ajout-item");
      const selRarete = document.getElementById("select-marche-ajout-rarete");
      if (!marchand || !selItem || !selItem.value) { toast("Choisis d'abord un marchand puis un objet."); return; }
      _ajouterItemAuStock(marchand, selItem.value, selRarete ? selRarete.value : "commun");
      rendrePanneauMarche();
    };
  }

  /* ── Filtre d'affichage (Tout / Équipements / Consommables) ────── */
  function _wireFiltreType() {
    const barre = document.getElementById("marche-filtres");
    if (!barre) return;
    barre.querySelectorAll("[data-marche-filtre]").forEach((btn) => {
      btn.classList.toggle("actif", btn.dataset.marcheFiltre === _filtreType);
      btn.onclick = () => {
        if (_filtreType === btn.dataset.marcheFiltre) return;
        _filtreType = btn.dataset.marcheFiltre;
        rendrePanneauMarche();
      };
    });
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
    _wireFiltreType();
    _afficherStock(role, marchand, localite);
    const zoneDemandes = document.getElementById("zone-marche-demandes");
    if (zoneDemandes) {
      if (role === "mj") _afficherDemandes();
      else zoneDemandes.innerHTML = "";
    }
    _wireReassort();
    if (role === "mj") {
      _peuplerAjoutManuel(marchand);
      _wireAjoutManuel(marchand);
    }
  }

  return { rendrePanneauMarche, acheterObjetMarche, demanderAchatMarche, calculerPrix };
})();
