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

  function _catalogue() {
    const base = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE : [];
    // Objets forgés par le MJ (cf. js/forge.js) : fusionnés au catalogue pour
    // être résolus (prix/stock) et vendables via la mise en vente manuelle.
    const custom = (typeof Forge !== "undefined" && Forge.catalogueCustom) ? Forge.catalogueCustom() : [];
    return custom.length ? base.concat(custom) : base;
  }
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

  // Types portant une `origine` et passant par le calcul d'import automatique
  // (cf. modificateurOrigineAutomatique, data/marche.js) — vivres d'abord
  // (prompt_marche_ingredients.md), recettes achetées ensuite
  // (prompt_recettes_achetables.md étape 5 : "les recettes portent une
  // origine et passent par le même calcul que les vivres").
  const TYPES_AVEC_ORIGINE = ["ingredient", "recette"];

  // Modificateur "par défaut" effectif pour CET item chez CE marchand dans
  // CETTE localité (prompt_marche_ingredients.md étape 5) : le marché noir
  // garde toujours la priorité (son modificateurParDefaut l'emporte, cf.
  // "Le marché noir garde la priorité" du prompt) ; sinon, pour un item à
  // origine (TYPES_AVEC_ORIGINE) avec une localité qui porte une `nation`,
  // le calcul automatique origine/nation remplace modificateurParDefaut ;
  // pour tout le reste (armes, potions, item sans origine résoluble...),
  // comportement inchangé. Reste une VALEUR PAR DÉFAUT seulement : le menu
  // déroulant MJ (marche-select-mod) l'écrase toujours au moment du clic.
  function _modificateurEffectif(item, marchand, localite) {
    if (marchand.estMarcheNoir) return marchand.modificateurParDefaut;
    if (TYPES_AVEC_ORIGINE.includes(item.type) && localite && localite.nation) {
      return modificateurOrigineAutomatique(item.origine, localite.nation);
    }
    return marchand.modificateurParDefaut;
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

  // Noms d'affichage des origines de vivre (prompt_marche_ingredients.md) —
  // table locale plutôt que REGIONS_METEO (data/meteo.js) : les ids n'y
  // coïncident que partiellement ("khazrak" y est nommé "karag_dum",
  // "liberra" y est scindé nord/sud, "elfique"/"nain"/"partout" n'y existent
  // pas du tout) — cf. LOCALITES_MARCHE ci-dessus pour l'explication complète
  // Khazrak Dûm / Karag Dûm.
  const _NOMS_ORIGINE = {
    partout: "Partout", solvarn: "Solvarn", valdorne: "Valdorne", arveth: "Arveth",
    mornac: "Mornac", liberra: "Liberra", serval: "Serval", aetharion: "Aetharion",
    aelindra: "Aelindra", mordanel: "Mordanel", kaldrun: "Kaldrun", khazrak: "Khazrak Dûm",
    elfique: "pan-elfique", nain: "pan-nain",
  };
  function _nomOrigine(id) { return _NOMS_ORIGINE[id] || id || "?"; }

  // Libellé court du modificateur EFFECTIF (pas forcément un des 5 choix du
  // menu déroulant MJ, ex. ×0,8 automatique local) — affiché sur chaque
  // vivre ET recette en vitrine (prompt_marche_ingredients.md étape 6 puis
  // prompt_recettes_achetables.md étape 5 : « Kaldrun · importé rival
  // ×1,5 »), pour qu'un joueur comprenne pourquoi ce prix-là. Fonction
  // renommée (elle couvrait initialement les seuls vivres) quand les
  // recettes achetables ont repris le même mécanisme d'origine.
  const _LIBELLES_MOD_COURT = { local: "local", importe_allie: "importé allié", importe_rival: "importé rival", marche_noir_2: "marché noir", marche_noir_3: "marché noir" };
  function _infoOrigineEtModificateur(item, modValeur) {
    if (!TYPES_AVEC_ORIGINE.includes(item.type)) return "";
    const idProche = _idModificateurLePlusProche(modValeur);
    const libelleMod = _LIBELLES_MOD_COURT[idProche] || idProche;
    return `${echapper(_nomOrigine(item.origine))} · ${echapper(libelleMod)} ×${modValeur}`;
  }

  // Rang, facteur nutritif et "déjà connue" d'une recette achetable
  // (prompt_recettes_achetables.md étape 5) — la nation est déjà couverte
  // par _infoOrigineEtModificateur (même ligne "🌍 origine · modificateur"
  // que les vivres, réutilisée telle quelle). facteurNutritif n'est stocké
  // NULLE PART sur l'item (seul prixPo l'est, cf. NOTE de comptage dans
  // data/loot.js) : reconstruit ici par division exacte (prixPo/200) — la
  // table source du prompt ne produit que des multiples de 5 qui redivisent
  // proprement, aucun arrondi ne se perd à l'affichage.
  function _infoRecette(item, personnageSelectionne) {
    if (item.type !== "recette") return "";
    const recette = (typeof CUISINE_RECETTES !== "undefined") ? CUISINE_RECETTES.find((r) => r.id === item.recetteApprise) : null;
    const rang = recette ? recette.rang : "?";
    const facteurNutritif = (item.prixPo / 200).toFixed(2).replace(".", ",");
    const repertoire = (personnageSelectionne && personnageSelectionne.metiers && personnageSelectionne.metiers.cuisine
      && personnageSelectionne.metiers.cuisine.repertoire) || [];
    const dejaConnue = repertoire.includes(item.recetteApprise);
    return `Rang ${rang} · Facteur nutritif ${facteurNutritif}${dejaConnue ? ` · <strong style="color:var(--or);">déjà connue</strong>` : ""}`;
  }

  function _statsItem(it) {
    if (it.type === "arme") {
      const degats = it.enchantement > 0 ? `${it.enchantement}+${it.degats}` : it.degats;
      return `${degats} · ${it.portee}${it.deuxMains ? " · 2 mains" : ""}`;
    }
    if (it.type === "armure") return `CA ${it.valeurCA ?? 10} · Réduction ${it.reductionDegats || 0}${it.malusDEX ? ` · Malus DEX -${it.malusDEX}` : ""}`;
    if (it.type === "bouclier") return `+${it.bonusDEF} DEF`;
    if (it.type === "accessoire") return it.effet;
    if (TYPES_EMPILABLES.includes(it.type)) return `Quantité : ${it.quantite || 1}`;
    return "";
  }

  /* ── État local de sélection (par onglet/navigateur, pas synchronisé) ── */
  let _persoId = null;
  let _localiteId = null;
  let _marchandId = null;
  let _filtreType = "tous"; // "tous" | "equip" | "conso" | "vivres" | "recettes" — filtre d'affichage du stock

  // Un objet est un consommable, un vivre ("ingredient", cf.
  // prompt_marche_ingredients.md), une recette achetable ("recette", cf.
  // prompt_recettes_achetables.md) ou un "équipement" (tout le reste : arme,
  // armure, bouclier, accessoire, charme…). "equip" exclut désormais les
  // TROIS types empilables (TYPES_EMPILABLES), pas seulement "consommable" —
  // sinon vivres et recettes réapparaîtraient tous sous "Équipements". Sert
  // au filtre du marché.
  function _correspondFiltre(item) {
    if (_filtreType === "conso") return item.type === "consommable";
    if (_filtreType === "vivres") return item.type === "ingredient";
    if (_filtreType === "recettes") return item.type === "recette";
    if (_filtreType === "equip") return !TYPES_EMPILABLES.includes(item.type);
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
    App.ajouterAInventaire(perso, Object.assign({}, item, { quantite: 1 }));
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
    const modEffectif = _modificateurEffectif(item, marchand, localite);
    const prixFinalPo = calculerPrix(item, modEffectif, _valeurRarete(rareteEffective), 0, marchand.faction);
    if (prixFinalPo == null) { toast("Ce marchand refuse de vous vendre quoi que ce soit."); return; }
    const demandes = lireDemandes();
    demandes.push({
      id: "demande_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      persoId,
      persoNom: perso.nom,
      marchandId,
      localiteId: localite.id,
      itemId,
      modRegionalId: _idModificateurLePlusProche(modEffectif),
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

  function _carteStockJoueur(slot, marchand, localite, personnageSelectionne) {
    const item = slot.item;
    const modEffectif = _modificateurEffectif(item, marchand, localite);
    const prix = calculerPrix(item, modEffectif, _valeurRarete(slot.rareteId), 0, marchand.faction);
    const refuse = prix == null;
    const stats = _statsItem(item);
    // Étape 6 (vivres) puis étape 5 (recettes) : un vivre OU une recette
    // achetable affiche son origine et le modificateur appliqué ("Kaldrun ·
    // importé rival ×1,5") pour que le prix ne soit jamais une boîte noire,
    // et son effetDeclaratif (les 6 vivres hors système) sur sa fiche,
    // jamais comme une règle chiffrée. Une recette ajoute en plus son rang,
    // son facteur nutritif et si elle est déjà connue du perso sélectionné.
    const infoOrigine = _infoOrigineEtModificateur(item, modEffectif);
    const infoRecette = _infoRecette(item, personnageSelectionne);
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${item.icone ? `<img class="loot-item-icone" src="${item.icone}" alt="" />` : ""}${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-${item.type}">${item.type}</span>
        ${item.enchantement ? `<span class="loot-badge loot-badge-magic">+${item.enchantement}</span>` : ""}
        ${_badgeRarete(item, slot.rareteId)}
      </div>
      ${stats ? `<div class="loot-item-stats">${echapper(stats)}</div>` : ""}
      ${infoOrigine ? `<div class="loot-item-stats">🌍 ${infoOrigine}</div>` : ""}
      ${infoRecette ? `<div class="loot-item-stats">${infoRecette}</div>` : ""}
      <div class="loot-item-desc">${echapper(item.description)}</div>
      ${item.effetDeclaratif ? `<div class="aide" style="margin-top:4px;">✦ ${echapper(item.effetDeclaratif)}</div>` : ""}
      <div class="marche-prix">${refuse ? "Commerce refusé" : prix + " po"}</div>
      <div class="barre-actions" style="margin-top:8px;">
        <button class="btn petit or btn-marche-demander" data-item-id="${item.id}" data-rarete-id="${slot.rareteId}" ${refuse ? "disabled" : ""}>🛒 Demander l'achat</button>
      </div>
    </div>`;
  }

  function _carteStockMj(slot, marchand, localite, personnageSelectionne) {
    const item = slot.item;
    const stats = _statsItem(item);
    const modEffectif = _modificateurEffectif(item, marchand, localite);
    const modDefautId = _idModificateurLePlusProche(modEffectif);
    const prixInitial = calculerPrix(item, modEffectif, _valeurRarete(slot.rareteId), 0, marchand.faction);
    const afficheRarete = _peutAvoirRarete(item);
    const infoOrigine = _infoOrigineEtModificateur(item, modEffectif);
    const infoRecette = _infoRecette(item, personnageSelectionne);
    return `<div class="loot-item">
      <div class="loot-item-header">
        <span class="loot-item-nom">${item.icone ? `<img class="loot-item-icone" src="${item.icone}" alt="" />` : ""}${echapper(item.nom)}</span>
        <span class="loot-badge loot-badge-${item.type}">${item.type}</span>
        ${item.enchantement ? `<span class="loot-badge loot-badge-magic">+${item.enchantement}</span>` : ""}
        ${_badgeRarete(item, slot.rareteId)}
      </div>
      ${stats ? `<div class="loot-item-stats">${echapper(stats)}</div>` : ""}
      ${infoOrigine ? `<div class="loot-item-stats">🌍 ${infoOrigine}</div>` : ""}
      ${infoRecette ? `<div class="loot-item-stats">${infoRecette}</div>` : ""}
      <div class="loot-item-desc">${echapper(item.description)}</div>
      ${item.effetDeclaratif ? `<div class="aide" style="margin-top:4px;">✦ ${echapper(item.effetDeclaratif)}</div>` : ""}
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
      const libelleFiltreVide = _filtreType === "conso" ? "consommable" : _filtreType === "vivres" ? "vivre" : _filtreType === "recettes" ? "recette" : "équipement";
      zone.innerHTML = `<p class="vide">Aucun ${libelleFiltreVide} en stock chez ce marchand.</p>`;
      return;
    }
    // Personnage sélectionné (cf. select-marche-perso) : sert à afficher
    // "déjà connue" sur une recette achetable (prompt_recettes_achetables.md
    // étape 5) — null si aucun perso choisi, _infoRecette gère ce cas.
    const personnageSelectionne = _persoId ? lirePersos()[_persoId] : null;
    zone.innerHTML = slotsFiltres.map((s) => role === "mj" ? _carteStockMj(s, marchand, localite, personnageSelectionne) : _carteStockJoueur(s, marchand, localite, personnageSelectionne)).join("");

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
    if (typeof Forge !== "undefined") Forge.rendre(); // Forge du MJ (guarde le rôle en interne)
  }

  // ── API pour la Forge (js/forge.js) : mise en vente / retrait direct ──
  // Met un objet en vente chez le marchand actuellement sélectionné.
  function mettreEnVente(itemId) {
    const localite = _localite(_localiteId);
    const marchand = _marchand(localite, _marchandId);
    if (!marchand) { toast("Choisis d'abord une localité et un marchand."); return; }
    _ajouterItemAuStock(marchand, itemId, "commun");
    rendrePanneauMarche();
  }
  // Retire un objet du stock de TOUS les marchands. Renvoie le nombre retiré.
  function retirerDuMarche(itemId) {
    const stock = lireStock();
    let retires = 0;
    Object.keys(stock).forEach((mid) => {
      const avant = (stock[mid] || []).map(_normStockEntry);
      const apres = avant.filter((e) => e.itemId !== itemId);
      retires += avant.length - apres.length;
      stock[mid] = apres;
    });
    if (retires) { sauverStock(stock); toast(`Retiré du marché (${retires}).`); }
    else toast("Cet objet n'était pas en vente.");
    rendrePanneauMarche();
  }
  // Combien de fois cet objet est en vente (tous marchands confondus).
  function estEnVente(itemId) {
    const stock = lireStock();
    let n = 0;
    Object.keys(stock).forEach((mid) => (stock[mid] || []).map(_normStockEntry).forEach((e) => { if (e.itemId === itemId) n++; }));
    return n;
  }

  // ── Étape 3 (prompt_marche_ingredients.md) : synchro météo → localité ──
  // Quand le MJ change la région météo (SyncStore "meteo:courante"), on
  // présélectionne la localité du marché dont regionMeteo correspond. C'est
  // un confort de mise en scène, jamais une contrainte : on ne fait que
  // changer la VALEUR PAR DÉFAUT du sélecteur (_localiteId) avant le
  // prochain rendu — le sélecteur reste un <select> normal, non désactivé,
  // et un joueur peut toujours choisir une autre ville juste après.
  let _dernierRegionMeteoId = null;
  function _presrelectionnerLocalitePourRegion(etat) {
    if (typeof LOCALITES_MARCHE === "undefined") return;
    const regionId = etat && etat.regionId;
    if (!regionId || regionId === _dernierRegionMeteoId) return;
    _dernierRegionMeteoId = regionId;
    const localite = LOCALITES_MARCHE.find((l) => l.regionMeteo === regionId);
    if (!localite || localite.id === _localiteId) return;
    _localiteId = localite.id;
    _marchandId = null;
    rendrePanneauMarche();
  }
  if (typeof SyncStore !== "undefined" && SyncStore.subscribe) {
    SyncStore.subscribe("meteo:courante", _presrelectionnerLocalitePourRegion);
  }

  return { rendrePanneauMarche, acheterObjetMarche, demanderAchatMarche, calculerPrix, mettreEnVente, retirerDuMarche, estEnVente };
})();
