/* ============================================================
   Cuisine (catalogue de référence) — cf. prompt_onglet_cuisine.md.

   ⚠️ Cet onglet est en LECTURE SEULE. Aucun bouton de cuisson, aucun jet,
   aucune consommation d'ingrédient, aucun gain d'XP. L'acte de cuisiner
   reste dans l'Atelier (js/cuisine.js, rendreZoneCuisine). Un catalogue
   affichant recettes, seuils et taux de réussite appellera tôt ou tard un
   « et si on ajoutait juste un bouton Cuisiner ici ? » — ce serait un
   second point d'entrée sur la même mécanique, avec deux compteurs de
   tentatives à tenir cohérents. La ligne d'aide ci-dessous renvoie vers
   l'Atelier plutôt que d'y naviguer directement : du texte, pas un bouton.

   Fichier distinct de js/cuisine.js DÉLIBÉRÉMENT : le moteur de cuisson et
   son UI d'Atelier ne doivent pas grossir d'un second renderer, et un bug
   d'affichage ici ne doit jamais pouvoir casser une cuisson en séance.

   Aucune duplication de la logique de résolution : le seuil S et les
   bandes de qualité viennent de Cuisine.seuilEffectif()/bandesPour()
   (js/cuisine.js) — RIEN n'est recalculé ici. Un catalogue qui affiche des
   seuils faux est pire qu'un catalogue absent.
   ============================================================ */

const CuisineReference = (() => {
  "use strict";

  /* ── Utilitaires (copie locale, même convention que js/repos.js/js/marche.js) ── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML;
  }

  function _nomIngredient(id) {
    const it = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((l) => l.id === id) : null;
    return it ? it.nom : id;
  }

  function _quantiteDisponible(inventaireListe, itemId) {
    return (inventaireListe || []).filter((it) => it.id === itemId).reduce((t, it) => t + (it.quantite || 1), 0);
  }

  // Nation par recette — dérivée des sections du fichier SOURCE
  // (data/cuisine.js, regroupé par commentaires « ── Nation ── »), PAS un
  // champ de données : cette table vit uniquement dans ce module d'affichage
  // pour respecter l'invariant « ce prompt ne crée aucune donnée, il
  // n'affiche que ce qu'ils ont posé » — data/cuisine.js reste intact.
  // Les deux recettes "Rites de table" ne portent aucune nation unique
  // (cf. leur propre section, transversale) : absentes de cette table, donc
  // toujours visibles hors filtre nation, jamais sous un filtre précis.
  const NATION_PAR_RECETTE = {
    pain_soleil: "Solvarn", sauce_or: "Solvarn", volaille_zenith: "Solvarn", oie_confite: "Solvarn", carpe_kor_valdan: "Solvarn",
    la_grise: "Solvarn", pain_naros: "Solvarn", soupe_de_fer: "Solvarn", hareng_dessale: "Solvarn", le_gris: "Solvarn",
    cerf_au_cidre: "Valdorne", sanglier_broche: "Valdorne", potee_de_cendre: "Valdorne", civet_ferme: "Valdorne", pomme: "Valdorne",
    galette_sarrasin: "Arveth", chaudron_de_veille: "Arveth", boeuf_de_lannee: "Arveth", prune_brulante: "Arveth",
    jambon_mornhaven: "Mornac", matelote_lisdane: "Mornac", quenelles_brochet: "Mornac", porc_noir_prunes: "Mornac", repas_long: "Mornac",
    fromage_de_col: "Serval", agneau_au_fumoir: "Serval", biere_de_col: "Serval", champignons_farcis: "Serval",
    anguille_grand_port: "Liberra", bouillon_de_silure: "Liberra",
    seve_claire: "Aetharion", truite_tranchee: "Aetharion", bouillon_trompette: "Aetharion", feuille_dargent: "Aetharion", chevreuil_aux_baies: "Aetharion",
    pain_de_gland: "Aelindra", fromage_de_feuille: "Aelindra", le_plat: "Aelindra", sanglier_boucane: "Aelindra",
    soupe_lanterne: "Mordanel", escargots_canopee: "Mordanel", prunes_pales_macerees: "Mordanel", vin_de_crepuscule: "Mordanel", caille_de_brume: "Mordanel",
    bouillie_de_cave: "Kaldrun", barrique_grillee: "Kaldrun", pain_de_souche: "Kaldrun", biere_de_clan: "Kaldrun", boeuf_de_surface: "Kaldrun", sombre_truffe_rapee: "Kaldrun",
    chapeau_rouge_bouilli: "Khazrak Dûm", ver_grille: "Khazrak Dûm", graisse_de_ver: "Khazrak Dûm", rat_des_veines: "Khazrak Dûm", barbade_infusion: "Khazrak Dûm",
    // Amendement rang 5 (prompt_cuisine_bonus_rang5.md, étape 1) : nations
    // données explicitement par ce prompt, pas déduites d'une section.
    service_aetharion: "Aetharion", table_de_prestige: "Kaldrun",
  };
  function _nationPour(recette) { return NATION_PAR_RECETTE[recette.id] || null; }
  function _nationsDisponibles() {
    return Array.from(new Set(Object.values(NATION_PAR_RECETTE))).sort((a, b) => a.localeCompare(b));
  }

  // Couleurs des 6 qualités (dégradé désastre → chef-d'œuvre), réutilisées
  // par la barre de 20 segments (table des bandes) et les pastilles du
  // catalogue — palette propre à cet onglet, cf. variables CSS globales
  // (--chaos/--succes/--or) pour les teintes d'ancrage aux deux bouts.
  const COULEUR_QUALITE = {
    desastre: "#8a2f3b", rate: "#c0603a", mediocre: "#c9a227",
    reussi: "#3a7d44", bien: "#2f6690", chef: "#b8924a",
  };

  /* ── État local du sous-onglet (mémorisé pour la session de navigation,
     jamais synchronisé — lecture seule, rien à partager entre clients) ── */
  let _persoId = "";
  let _filtreRangs = new Set(); // vide = tous les rangs
  let _filtreNation = "";
  let _filtreRegistre = "";
  let _filtreRealisable = false;
  let _recherche = "";
  let _tri = "nom"; // "nom" | "rang" | "indexDe"

  function _htmlBandeau() {
    return `<div class="carte">
      <h2 class="titre-bandeau">🍳 Cuisine — catalogue de référence</h2>
      <p style="font-size:0.85rem;color:#6a6278;">
        Le jet de cuisine est un <strong>1d20 seul</strong>, sans modificateur de
        caractéristique : toute la difficulté vient de l'écart entre le rang du
        cuisinier et le rang de la recette. Cuisiner au-dessus de son propre rang
        est plus dur, mais rapporte davantage d'XP — cuisiner très en dessous
        n'en rapporte presque plus. 1 est toujours un désastre et 20 toujours un
        chef-d'œuvre, quel que soit le seuil : même un Grand queux peut rater un
        plat un mauvais jour.
      </p>
      <p style="font-size:0.85rem;color:#6a6278;margin-top:6px;">
        <strong>Pour cuisiner : onglet 🔨 Atelier → 🍳 Cuisine.</strong> Ce panneau
        ne fait qu'afficher le catalogue, les seuils et les taux de réussite —
        aucune cuisson ne se lance ici.
      </p>
    </div>`;
  }

  function _peuplerSelectPerso(role, persos) {
    const ids = Object.keys(persos).filter((id) => role === "mj" || (typeof App !== "undefined" && App.estProprietaire(persos[id])));
    if (_persoId && !ids.includes(_persoId)) _persoId = "";
    return ids;
  }

  function _htmlCarteCuisinier(p) {
    if (!p) return "";
    const rang = Metiers.rang(p, "cuisine");
    const titre = Metiers.titre(p, "cuisine");
    const xp = Metiers.xp(p, "cuisine");
    const prog = Metiers.progressionVersRangSuivant(p, "cuisine");
    return `<div class="carte">
      <h3 style="margin-top:0;">${METIERS.cuisine.icone} ${echapper(p.nom)} — ${echapper(titre)} (rang ${rang})</h3>
      <div style="font-size:0.85rem;">${xp} XP${prog ? ` — ${prog.actuel}/${prog.requis} vers le rang ${rang + 1}` : " — rang maximal atteint"}</div>
      ${prog ? `<div class="barre-pv" style="margin-top:4px;"><div class="rempli" style="width:${prog.pct}%;"></div></div>` : ""}
    </div>`;
  }

  function _htmlTableRangs(rangCourant) {
    const lignes = RANGS_METIER.map((palier) => {
      const titre = METIERS.cuisine.titres[palier.rang] || METIERS.cuisine.titres[METIERS.cuisine.titres.length - 1];
      const surligne = rangCourant === palier.rang;
      return `<tr${surligne ? ' style="background:rgba(184,146,74,.25);font-weight:700;"' : ""}>
        <td>${palier.rang}</td><td>${echapper(titre)}</td><td>${palier.xpMin} XP</td>
      </tr>`;
    }).join("");
    return `<div class="carte">
      <h3 style="margin-top:0;">Rangs du métier</h3>
      <div class="tableau-regle-scroll"><table class="tableau-regle"><thead><tr><th>Rang</th><th>Titre</th><th>XP minimum</th></tr></thead>
      <tbody>${lignes}</tbody></table></div>
    </div>`;
  }

  // Barre de 20 segments colorés (1 segment = 1 valeur de d20) — la lecture
  // visuelle du rétrécissement de la bande d'échec quand le rang monte est
  // l'argument central du système (cf. prompt, §2.4), autant qu'elle se voie.
  function _htmlBarre20(bandes) {
    const segments = [];
    bandes.forEach((b) => {
      for (let v = b.min; v <= b.max; v++) segments.push(COULEUR_QUALITE[b.qualiteId] || "#999");
    });
    return `<div style="display:flex;gap:1px;margin-top:4px;">
      ${segments.map((c) => `<div style="flex:1;height:10px;background:${c};"></div>`).join("")}
    </div>`;
  }

  function _pctReussiteOuMieux(bandes) {
    const cases = bandes.filter((b) => b.qualiteId !== "desastre" && b.qualiteId !== "rate")
      .reduce((t, b) => t + (b.max - b.min + 1), 0);
    return Math.round((cases / 20) * 100);
  }

  function _htmlTableBandes(rangCuisinier) {
    const lignes = [1, 2, 3, 4, 5].map((rangRecette) => {
      const { seuil, bandes } = Cuisine.bandesPour(rangRecette, rangCuisinier == null ? 0 : rangCuisinier);
      const parQualite = {};
      bandes.forEach((b) => { parQualite[b.qualiteId] = b; });
      const cellule = (id) => {
        const b = parQualite[id];
        return b ? `${b.min}${b.max > b.min ? `–${b.max}` : ""}` : "—";
      };
      return `<tr>
        <td>${rangRecette}</td><td>${seuil}</td>
        <td style="color:${COULEUR_QUALITE.desastre};">${cellule("desastre")}</td>
        <td style="color:${COULEUR_QUALITE.rate};">${cellule("rate")}</td>
        <td style="color:${COULEUR_QUALITE.mediocre};">${cellule("mediocre")}</td>
        <td style="color:${COULEUR_QUALITE.reussi};">${cellule("reussi")}</td>
        <td style="color:${COULEUR_QUALITE.bien};">${cellule("bien")}</td>
        <td style="color:${COULEUR_QUALITE.chef};">${cellule("chef")}</td>
        <td>${_pctReussiteOuMieux(bandes)} %</td>
      </tr>
      <tr><td colspan="9" style="padding:2px 4px 8px;">${_htmlBarre20(bandes)}</td></tr>`;
    }).join("");
    return `<div class="carte">
      <h3 style="margin-top:0;">Bandes de qualité${rangCuisinier == null ? "" : ` — cuisinier de rang ${rangCuisinier}`}</h3>
      <p style="font-size:0.78rem;color:#6a6278;margin:2px 0 8px;">1 est toujours un désastre, 20 toujours un chef-d'œuvre, quel que soit le seuil S.</p>
      <div class="tableau-regle-scroll">
      <table class="tableau-regle"><thead><tr>
        <th>Rang recette</th><th>Seuil S</th><th>Désastre</th><th>Raté</th><th>Médiocre</th><th>Réussi</th><th>Bien</th><th>Chef-d'œuvre</th><th>Réussite</th>
      </tr></thead><tbody>${lignes}</tbody></table>
      </div>
    </div>`;
  }

  // Dé de plat par qualité — purement DÉCLARATIF (indexDe + décalage QUALITES
  // via ECHELLE_DES_PLAT), jamais issu d'un jet : identique pour tout cuisinier,
  // cf. prompt §2.5. Le chef-d'œuvre est annoté "maximisé" (non aléatoire).
  function _dePlatParQualite(recette) {
    const clamp = (i) => Math.max(0, Math.min(ECHELLE_DES_PLAT.length - 1, i));
    const dPlat = (id) => (QUALITES.find((q) => q.id === id) || {}).dPlat || 0;
    return {
      mediocre: ECHELLE_DES_PLAT[clamp(recette.indexDe + dPlat("mediocre"))],
      reussi: ECHELLE_DES_PLAT[clamp(recette.indexDe + dPlat("reussi"))],
      bien: ECHELLE_DES_PLAT[clamp(recette.indexDe + dPlat("bien"))],
      chef: ECHELLE_DES_PLAT[clamp(recette.indexDe + dPlat("chef"))],
    };
  }

  function _recetteCorrespondFiltres(r, p) {
    if (_filtreRangs.size && !_filtreRangs.has(r.rang)) return false;
    if (_filtreNation && _nationPour(r) !== _filtreNation) return false;
    if (_filtreRegistre && r.registre !== _filtreRegistre) return false;
    if (_recherche) {
      const q = _recherche.toLowerCase();
      const dansNom = r.nom.toLowerCase().includes(q);
      const dansIngredients = r.ingredients.some((c) => _nomIngredient(c.id).toLowerCase().includes(q));
      if (!dansNom && !dansIngredients) return false;
    }
    if (_filtreRealisable) {
      if (!p) return false;
      if (!r.ingredients.every((c) => _quantiteDisponible(p.inventaireListe, c.id) >= c.qte)) return false;
    }
    return true;
  }

  function _htmlCarteRecette(r, p, rangCuisinier) {
    const des = _dePlatParQualite(r);
    const registre = REGISTRES_TABLE[r.registre];
    const nation = _nationPour(r);
    const tentativesMax = Cuisine.tentativesJourMax(r.rang);
    const ingredientsHtml = r.ingredients.map((c) => {
      if (!p) return `${c.qte}× ${echapper(_nomIngredient(c.id))}`;
      const dispo = _quantiteDisponible(p.inventaireListe, c.id);
      const suffisant = dispo >= c.qte;
      return `<span style="color:${suffisant ? "var(--succes)" : "var(--chaos)"};font-weight:${suffisant ? 400 : 700};">${c.qte}× ${echapper(_nomIngredient(c.id))} (${dispo} en stock)</span>`;
    }).join(", ");
    const realisable = p && r.ingredients.every((c) => _quantiteDisponible(p.inventaireListe, c.id) >= c.qte);

    let blocPerso = "";
    if (p && rangCuisinier != null) {
      const S = Cuisine.seuilEffectif(r, rangCuisinier);
      const { bandes } = Cuisine.bandesPour(r.rang, rangCuisinier);
      const pct = _pctReussiteOuMieux(bandes);
      // XP "qu'il gagnerait" : représentatif d'un résultat Réussi (xpMult=1,
      // identique à Bien réussi/Chef-d'œuvre — seul Médiocre en donne la
      // moitié, Raté/Désastre aucune) — réutilise Cuisine.resoudre() avec un
      // jetBrut pris DANS la bande "reussi" plutôt que de recalculer la
      // formule d'XP ici (aucune duplication de la logique de résolution).
      const bandeReussi = bandes.find((b) => b.qualiteId === "reussi");
      const xp = bandeReussi ? Cuisine.resoudre(r, rangCuisinier, bandeReussi.min).xpGagne : 0;
      blocPerso = `<div style="font-size:0.82rem;margin-top:4px;padding:4px 6px;background:rgba(184,146,74,.12);border-radius:6px;">
        Seuil pour ${echapper(p.nom)} : <strong>${S}</strong> · Réussite (médiocre ou mieux) : <strong>${pct} %</strong> · XP si réussi : <strong>${xp}</strong>
      </div>`;
    }

    return `<div class="carte" style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;">
        <strong>${echapper(r.nom)}</strong>
        <span style="display:flex;gap:6px;align-items:center;">
          <span style="font-weight:700;background:var(--violet);color:#fff;border-radius:4px;padding:1px 6px;font-size:0.78rem;">Rang ${r.rang}</span>
          ${realisable ? `<span style="background:var(--succes);color:#fff;border-radius:4px;padding:1px 6px;font-size:0.78rem;">✔ réalisable</span>` : ""}
        </span>
      </div>
      <div style="font-size:0.82rem;color:#6a6278;">
        ${nation ? `${echapper(nation)} · ` : ""}${registre ? `<span title="Registre social — purement descriptif, aucun effet">${registre.icone} ${echapper(registre.nom)}</span>` : ""}
      </div>
      <div style="font-size:0.85rem;margin-top:4px;">Ingrédients : ${ingredientsHtml}</div>
      <div style="font-size:0.85rem;margin-top:2px;">Tentatives par jour : ${tentativesMax}</div>
      <div style="font-size:0.82rem;margin-top:4px;">
        Dé de plat — Médiocre ${des.mediocre} · Réussi ${des.reussi} · Bien réussi ${des.bien} · Chef-d'œuvre ${des.chef} (maximisé)
      </div>
      ${r.effetDeclaratif ? `<div class="aide" style="margin-top:4px;">✦ ${echapper(r.effetDeclaratif)}</div>` : ""}
      ${r.avertissement ? `<div class="aide" style="margin-top:4px;color:var(--chaos);">⚠ ${echapper(r.avertissement)}</div>` : ""}
      ${r.bonusTemporaire ? _htmlBonusTemporaire(r, rangCuisinier) : ""}
      ${blocPerso}
    </div>`;
  }

  // Bonus rang 5 (prompt_cuisine_bonus_rang5.md, étape 4) : encadré distinct,
  // "à partir d'Excellent", et — si un personnage est sélectionné — sa
  // probabilité de l'obtenir (bande "bien" == "Excellent" dans ce module,
  // cf. js/repos.js pour le même mapping qualité -> palier).
  function _htmlBonusTemporaire(r, rangCuisinier) {
    let proba = "";
    if (rangCuisinier != null) {
      const { bandes } = Cuisine.bandesPour(r.rang, rangCuisinier);
      const cases = bandes.filter((b) => b.qualiteId === "bien" || b.qualiteId === "chef").reduce((t, b) => t + (b.max - b.min + 1), 0);
      proba = ` · probabilité pour ce cuisinier : <strong>${Math.round((cases / 20) * 100)} %</strong>`;
    }
    return `<div style="margin-top:6px;padding:6px 8px;background:rgba(58,125,68,.12);border-radius:6px;font-size:0.82rem;">
      🎁 Bonus à partir d'Excellent : <strong>${echapper(r.bonusTemporaire.libelle)}</strong>${proba}
    </div>`;
  }

  function _htmlFiltres() {
    const rangsBtns = [1, 2, 3, 4, 5].map((r) => `<button type="button" class="btn petit ${_filtreRangs.has(r) ? "" : "secondaire"}" data-filtre-rang="${r}">Rang ${r}</button>`).join("");
    const nationsOptions = [`<option value="">Toutes nations</option>`].concat(_nationsDisponibles().map((n) => `<option value="${echapper(n)}"${_filtreNation === n ? " selected" : ""}>${echapper(n)}</option>`)).join("");
    const registresOptions = [`<option value="">Tous registres</option>`].concat(Object.keys(REGISTRES_TABLE).map((id) => `<option value="${id}"${_filtreRegistre === id ? " selected" : ""}>${echapper(REGISTRES_TABLE[id].nom)}</option>`)).join("");
    return `<div class="carte" style="margin-top:10px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${rangsBtns}
        <select id="cuisine-ref-select-nation" class="champ">${nationsOptions}</select>
        <select id="cuisine-ref-select-registre" class="champ">${registresOptions}</select>
        <input type="text" id="cuisine-ref-recherche" class="champ" placeholder="Rechercher (nom, ingrédient)…" value="${echapper(_recherche)}" style="min-width:200px;" />
        <select id="cuisine-ref-select-tri" class="champ">
          <option value="nom"${_tri === "nom" ? " selected" : ""}>Trier par nom</option>
          <option value="rang"${_tri === "rang" ? " selected" : ""}>Trier par rang</option>
          <option value="indexDe"${_tri === "indexDe" ? " selected" : ""}>Trier par valeur nourrissante</option>
        </select>
        <label style="font-size:0.85rem;"><input type="checkbox" id="cuisine-ref-realisable" ${_filtreRealisable ? "checked" : ""} /> Je peux la cuisiner</label>
      </div>
    </div>`;
  }

  function rendrePanneau() {
    const zone = document.getElementById("zone-cuisine-reference");
    if (!zone) return;
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const persos = (typeof App !== "undefined") ? App.chargerPersos() : {};
    const ids = _peuplerSelectPerso(role, persos);
    const p = _persoId ? persos[_persoId] : null;
    const rangCuisinier = p ? Metiers.rang(p, "cuisine") : null;

    const selectPerso = `<div class="carte">
      <label style="display:block;font-size:0.85rem;margin-bottom:6px;">Personnage
        <select id="cuisine-ref-select-perso" class="champ">
          <option value="">— Vue générale (aucun personnage) —</option>
          ${ids.map((id) => `<option value="${id}"${id === _persoId ? " selected" : ""}>${echapper(persos[id].nom)}</option>`).join("")}
        </select>
      </label>
    </div>`;

    const recettesTriees = CUISINE_RECETTES.filter((r) => _recetteCorrespondFiltres(r, p)).slice().sort((a, b) => {
      if (_tri === "rang") return a.rang - b.rang || a.nom.localeCompare(b.nom);
      if (_tri === "indexDe") return b.indexDe - a.indexDe || a.nom.localeCompare(b.nom);
      return a.nom.localeCompare(b.nom);
    });

    zone.innerHTML =
      _htmlBandeau() +
      selectPerso +
      _htmlCarteCuisinier(p) +
      _htmlTableRangs(rangCuisinier) +
      _htmlTableBandes(rangCuisinier) +
      _htmlFiltres() +
      `<div id="cuisine-ref-catalogue">${recettesTriees.map((r) => _htmlCarteRecette(r, p, rangCuisinier)).join("")}</div>`;

    _cablerControles();
  }

  function _cablerControles() {
    const selPerso = document.getElementById("cuisine-ref-select-perso");
    if (selPerso) selPerso.onchange = () => { _persoId = selPerso.value; rendrePanneau(); };
    document.querySelectorAll("[data-filtre-rang]").forEach((btn) => {
      btn.onclick = () => {
        const r = parseInt(btn.dataset.filtreRang, 10);
        if (_filtreRangs.has(r)) _filtreRangs.delete(r); else _filtreRangs.add(r);
        rendrePanneau();
      };
    });
    const selNation = document.getElementById("cuisine-ref-select-nation");
    if (selNation) selNation.onchange = () => { _filtreNation = selNation.value; rendrePanneau(); };
    const selRegistre = document.getElementById("cuisine-ref-select-registre");
    if (selRegistre) selRegistre.onchange = () => { _filtreRegistre = selRegistre.value; rendrePanneau(); };
    const selTri = document.getElementById("cuisine-ref-select-tri");
    if (selTri) selTri.onchange = () => { _tri = selTri.value; rendrePanneau(); };
    const inputRecherche = document.getElementById("cuisine-ref-recherche");
    if (inputRecherche) {
      inputRecherche.oninput = () => { _recherche = inputRecherche.value; };
      // Re-rend seulement au "blur"/Enter, pas à chaque frappe, pour ne pas
      // perdre le focus du champ à chaque re-rendu complet du panneau —
      // même contrainte que les champs de recherche du Marché.
      inputRecherche.onkeydown = (e) => { if (e.key === "Enter") rendrePanneau(); };
      inputRecherche.onblur = () => rendrePanneau();
    }
    const checkRealisable = document.getElementById("cuisine-ref-realisable");
    if (checkRealisable) checkRealisable.onchange = () => { _filtreRealisable = checkRealisable.checked; rendrePanneau(); };
  }

  return { rendrePanneau };
})();

if (typeof window !== "undefined") window.CuisineReference = CuisineReference;
