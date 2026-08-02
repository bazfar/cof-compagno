/* ============================================================
   Forge du MJ — création d'objets custom à partir de champs
   STRUCTURÉS (le moteur applique déjà bonusCarac/bonusDEF/
   valeurArmure/slot, cf. personnage.js) → une fois équipé, l'objet
   forgé applique ses effets tout seul.

   Stockage : SyncStore, clé "loot:custom" = tableau d'objets au
   MÊME format que data/loot.js. Fusionné dans Marche._catalogue()
   (cf. marche.js) → les objets forgés sont vendables via la mise en
   vente manuelle existante. Marqués horsMarche:true → jamais tirés
   dans le stock aléatoire (cf. data/marche.js tirerStockMarchand).
   ============================================================ */

const Forge = (() => {
  "use strict";

  const KEY = "loot:custom";
  const CARACS = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"];
  // Emplacements proposés pour un accessoire (les mains gauche/droite sont
  // réservées aux armes/boucliers, le torse à l'armure — non listés ici).
  const EMPLACEMENTS = ["collier", "bague", "avant_bras", "tete", "jambe", "botte", "mains"];
  const RARETES = [
    ["commun", "Commun"], ["peu_commun", "Peu commun"], ["rare", "Rare"], ["legendaire", "Légendaire"],
  ];
  // Compétences COF (pour le bonus à un jet de compétence, ex. Persuasion) —
  // appliqué par le moteur via bonusCompetenceEquipement (cf. personnage.js).
  const COMPETENCES = (typeof COMPETENCES_PAR_CARAC !== "undefined")
    ? Object.values(COMPETENCES_PAR_CARAC).reduce((a, b) => a.concat(b), [])
    : ["Athlétisme", "Discrétion", "Acrobaties", "Escamotage", "Connaissances (arcanes)", "Connaissances (histoire)", "Connaissances (nature)", "Investigation", "Artisanat", "Perception", "Discernement", "Survie", "Médecine", "Dressage", "Bluff", "Intimidation", "Représentation", "Persuasion"];

  /* ── Helpers locaux (même convention que marche.js) ── */
  function echapper(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }
  function lire() { return SyncStore.get(KEY) || []; }
  function ecrire(arr) { SyncStore.set(KEY, arr); }

  // Icône en cours de saisie (data URI), figée dans l'objet au moment de forger.
  let _iconeEnCours = null;
  // Listes en cours de saisie (un objet peut avoir PLUSIEURS bonus de
  // compétence et PLUSIEURS formules) — figées dans l'objet au moment de forger.
  let _competencesEnCours = []; // [{ competence, valeur }]
  let _formulesEnCours = [];    // [{ cible, expr, carac?, competence? }]

  // Redimensionne l'image uploadée en petite icône (<= 80px, PNG pour garder la
  // transparence) — le catalogue custom est UN document Firestore (limite 1 Mo),
  // donc on garde les icônes minuscules (~5-15 Ko).
  function _lireIcone(file, cb) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 80;
        let w = img.width, h = img.height;
        if (w >= h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        try { cb(cv.toDataURL("image/png")); } catch (err) { toast("Image illisible."); }
      };
      img.onerror = () => toast("Image illisible.");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function estMj() { return (typeof App !== "undefined" && App.obtenirRole && App.obtenirRole() === "mj"); }

  const $ = (id) => document.getElementById(id);
  const v = (id) => { const e = $(id); return e ? e.value.trim() : ""; };
  const n = (id) => { const e = $(id); return e ? (parseInt(e.value, 10) || 0) : 0; };
  const chk = (id) => { const e = $(id); return !!(e && e.checked); };

  /* ── Construit un objet au format catalogue à partir du formulaire ── */
  function _construireItem() {
    const type = v("forge-type");
    const item = {
      id: "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      custom: true,
      horsMarche: true,      // jamais dans le stock aléatoire
      rariteFixe: true,      // prix fixe (le MJ fixe prixPo directement)
      sansModificateurRegional: true,
      nom: v("forge-nom"),
      type,
      description: v("forge-desc"),
      prixPo: n("forge-prix"),
      porte: false,
    };
    const eff = v("forge-effet"); if (eff) item.effet = eff;
    if (_iconeEnCours) item.icone = _iconeEnCours;
    const rar = v("forge-rarete");
    if (rar && rar !== "commun") {
      item.rarete = rar;
      item.rareteNom = (RARETES.find((r) => r[0] === rar) || [])[1] || rar;
    }
    // Bonus de caractéristiques (seulement les non-nuls, + ou -)
    const bonusCarac = {};
    CARACS.forEach((c) => { const val = n("forge-carac-" + c); if (val) bonusCarac[c] = val; });
    if (Object.keys(bonusCarac).length) item.bonusCarac = bonusCarac;
    // Bonus à des jets de compétence (plusieurs possibles) — map cumulée.
    if (_competencesEnCours.length) {
      const bc = {};
      _competencesEnCours.forEach((c) => { bc[c.competence] = (bc[c.competence] || 0) + c.valeur; });
      item.bonusCompetences = bc;
    }
    // Autres bonus déjà câblés côté équipement (personnage.js).
    const init = n("forge-init"); if (init) item.bonusInitiative = init;
    const am = n("forge-atkmag"); if (am) item.bonusAttaqueMagique = am;
    const ad = n("forge-atkdist"); if (ad) item.bonusAttaqueDistance = ad;
    const dm = n("forge-degmag"); if (dm) item.bonusDegatsMagiques = dm;
    // Formules de scaling (plusieurs possibles) — appliquées par le moteur via
    // bonusFormuleEquipement (cf. personnage.js) / le hook dégâts (app.js).
    if (_formulesEnCours.length) item.formules = _formulesEnCours.map((f) => Object.assign({}, f));
    // Champs selon le type
    if (type === "accessoire") item.slot = v("forge-slot");
    const def = n("forge-def"); if (def) item.bonusDEF = def;
    if (type === "armure") {
      item.valeurArmure = n("forge-armure");
      const md = n("forge-malusdex"); if (md) item.malusDEX = md;
    }
    if (type === "arme") {
      item.degats = v("forge-degats") || "1d4";
      item.portee = v("forge-portee") || "contact";
      item.typedegats = "physique";
      item.deuxMains = chk("forge-deuxmains");
      item.enchantement = 0;
    }
    return item;
  }

  /* ── Actions ── */
  function forger() {
    if (!estMj()) return;
    // Indulgence : intègre une saisie tapée mais pas encore « Ajoutée » (les
    // champs sont vidés après un Ajouter, donc pas de double-comptage).
    if (v("forge-comp") && n("forge-comp-val")) _competencesEnCours.push({ competence: v("forge-comp"), valeur: n("forge-comp-val") });
    { const c = v("forge-f-cible"), e = v("forge-f-expr"); if (c && e) { const f = { cible: c, expr: e }; if (c === "carac") f.carac = v("forge-f-carac"); if (c === "competence") f.competence = v("forge-f-comp"); _formulesEnCours.push(f); } }
    const item = _construireItem();
    if (!item.nom) { toast("Donne un nom à l'objet."); return; }
    if (!item.prixPo) { toast("Indique un prix (po)."); return; }
    const cat = lire();
    cat.push(item);
    ecrire(cat);
    _iconeEnCours = null; _competencesEnCours = []; _formulesEnCours = []; // reset pour le prochain objet
    toast("⚒️ « " + item.nom + " » forgé !");
    // Rafraîchit tout le marché (liste des forgés + dropdown « Mettre en vente »).
    if (typeof Marche !== "undefined") Marche.rendrePanneauMarche(); else rendre();
  }

  function supprimer(id) {
    const it = lire().find((x) => x.id === id);
    if (it && !confirm("Supprimer l'objet forgé « " + (it.nom || "") + " » ? (il disparaît du catalogue custom)")) return;
    ecrire(lire().filter((x) => x.id !== id));
    if (typeof Marche !== "undefined") Marche.rendrePanneauMarche(); else rendre();
  }

  /* ── Résumé lisible des effets d'un objet forgé (pour la liste) ── */
  function _resume(it) {
    const bits = [];
    if (it.slot) bits.push("emplacement : " + it.slot);
    if (it.bonusCarac) bits.push(Object.entries(it.bonusCarac).map(([k, val]) => `${val > 0 ? "+" : ""}${val} ${k}`).join(", "));
    if (it.bonusDEF) bits.push(`${it.bonusDEF > 0 ? "+" : ""}${it.bonusDEF} DEF`);
    if (it.bonusCompetences) bits.push(Object.entries(it.bonusCompetences).map(([k, val]) => `${val > 0 ? "+" : ""}${val} ${k}`).join(", "));
    if (it.bonusInitiative) bits.push(`${it.bonusInitiative > 0 ? "+" : ""}${it.bonusInitiative} init`);
    if (it.bonusAttaqueMagique) bits.push(`${it.bonusAttaqueMagique > 0 ? "+" : ""}${it.bonusAttaqueMagique} atk mag.`);
    if (it.bonusAttaqueDistance) bits.push(`${it.bonusAttaqueDistance > 0 ? "+" : ""}${it.bonusAttaqueDistance} atk dist.`);
    if (it.bonusDegatsMagiques) bits.push(`${it.bonusDegatsMagiques > 0 ? "+" : ""}${it.bonusDegatsMagiques} dég. mag.`);
    if (it.valeurArmure) bits.push(`réduction ${it.valeurArmure}` + (it.malusDEX ? `, malus DEX -${it.malusDEX}` : ""));
    if (it.type === "arme") bits.push(`${it.degats} · ${it.portee}` + (it.deuxMains ? " · 2 mains" : ""));
    (it.formules || []).forEach((f) => bits.push(`⚙ ${f.cible}${f.carac ? " " + f.carac : ""}${f.competence ? " " + f.competence : ""} = ${echapper(f.expr)}`));
    if (it.effet) bits.push(echapper(it.effet));
    return bits.join(" · ");
  }

  /* ── Rendu ── */
  function _optionSlots() { return EMPLACEMENTS.map((s) => `<option value="${s}">${s}</option>`).join(""); }
  function _optionRaretes() { return RARETES.map(([id, lbl]) => `<option value="${id}">${lbl}</option>`).join(""); }
  function _caracsInputs() {
    return CARACS.map((c) => `<label class="forge-carac"><span>${c}</span>
      <input type="number" id="forge-carac-${c}" value="0" step="1" /></label>`).join("");
  }

  function _formulaireHtml() {
    return `<div class="carte forge-bloc">
      <h3 style="margin:0 0 4px;">⚒️ Forge du MJ — créer un objet</h3>
      <p class="forge-aide">Les bonus <b>chiffrés</b> (caracs, DEF, réduction) s'appliquent automatiquement une fois l'objet équipé. Le champ « effet » reste narratif (à appliquer à la table).</p>
      <div class="forge-grille">
        <label>Nom<input type="text" id="forge-nom" maxlength="60" placeholder="Anneau du Loup" /></label>
        <label>Type<select id="forge-type">
          <option value="accessoire">Accessoire</option>
          <option value="arme">Arme</option>
          <option value="armure">Armure</option>
          <option value="bouclier">Bouclier</option>
          <option value="consommable">Consommable</option>
        </select></label>
        <label class="f-accessoire">Emplacement<select id="forge-slot">${_optionSlots()}</select></label>
        <label>Prix (po)<input type="number" id="forge-prix" value="50" step="1" min="0" /></label>
        <label>Rareté (affichage)<select id="forge-rarete">${_optionRaretes()}</select></label>
        <label>DEF<input type="number" id="forge-def" value="0" step="1" /></label>
        <label class="f-armure">Réduction (armure)<input type="number" id="forge-armure" value="0" step="1" min="0" /></label>
        <label class="f-armure">Malus DEX<input type="number" id="forge-malusdex" value="0" step="1" min="0" /></label>
        <label class="f-arme">Dégâts<input type="text" id="forge-degats" placeholder="1d8" /></label>
        <label class="f-arme">Portée<input type="text" id="forge-portee" placeholder="contact" /></label>
        <label class="f-arme forge-check"><input type="checkbox" id="forge-deuxmains" /> Arme à 2 mains</label>
      </div>
      <div class="forge-caracs-bloc">
        <span class="forge-sous-titre">Bonus de caractéristiques (± , 0 = aucun)</span>
        <div class="forge-caracs">${_caracsInputs()}</div>
      </div>
      <div class="forge-caracs-bloc">
        <span class="forge-sous-titre">Bonus à des jets de compétence (ex. Persuasion) — plusieurs possibles</span>
        <div class="forge-grille">
          <label>Compétence<select id="forge-comp">${COMPETENCES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
          <label>Valeur<input type="number" id="forge-comp-val" value="1" step="1" /></label>
          <label class="forge-check"><button type="button" class="btn petit secondaire" id="btn-forge-comp-add">➕ Ajouter</button></label>
        </div>
        <div class="forge-chips" id="forge-comp-liste"></div>
      </div>
      <div class="forge-caracs-bloc">
        <span class="forge-sous-titre">Autres bonus (optionnels, ± )</span>
        <div class="forge-grille">
          <label>Initiative<input type="number" id="forge-init" value="0" step="1" /></label>
          <label>Attaque magique<input type="number" id="forge-atkmag" value="0" step="1" /></label>
          <label>Attaque à distance<input type="number" id="forge-atkdist" value="0" step="1" /></label>
          <label>Dégâts magiques<input type="number" id="forge-degmag" value="0" step="1" /></label>
        </div>
      </div>
      <div class="forge-caracs-bloc">
        <span class="forge-sous-titre">Bonus dynamique — formule × variables du jeu</span>
        <div class="forge-grille">
          <label>S'applique à<select id="forge-f-cible">
            <option value="">— aucun —</option>
            <option value="degats">Dégâts</option>
            <option value="DEF">DEF</option>
            <option value="initiative">Initiative</option>
            <option value="carac">Caractéristique…</option>
            <option value="competence">Compétence…</option>
          </select></label>
          <label class="f-fcarac">Caractéristique<select id="forge-f-carac">${CARACS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
          <label class="f-fcomp">Compétence<select id="forge-f-comp">${COMPETENCES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
        </div>
        <label class="forge-full">Formule<input type="text" id="forge-f-expr" placeholder="ex. floor(@player-coin / 100)" /></label>
        <div class="forge-vars">${(typeof Formule !== "undefined" ? Formule.variablesDisponibles() : []).map((vv) => `<button type="button" class="btn petit secondaire btn-forge-var" data-var="${vv.cle}" title="@${vv.cle}">${echapper(vv.label)}</button>`).join("")}</div>
        <div class="forge-f-apercu" id="forge-f-apercu">Aperçu : —</div>
        <div class="barre-actions" style="margin-top:8px;"><button type="button" class="btn petit secondaire" id="btn-forge-f-add">➕ Ajouter la formule</button></div>
        <div class="forge-chips" id="forge-formules-liste"></div>
      </div>
      <label class="forge-full">Icône (image, petite)
        <input type="file" accept="image/*" id="forge-icone-file" />
      </label>
      <div class="forge-icone-apercu" id="forge-icone-apercu"></div>
      <label class="forge-full">Description<textarea id="forge-desc" rows="2" placeholder="Description de l'objet…"></textarea></label>
      <label class="forge-full">Effet narratif (optionnel)<input type="text" id="forge-effet" placeholder="ex. Résistance au feu (géré à la table)" /></label>
      <div class="barre-actions" style="margin-top:10px;">
        <button class="btn or" id="btn-forger">⚒️ Forger l'objet</button>
      </div>
    </div>`;
  }

  function _listeHtml() {
    const cat = lire();
    if (!cat.length) return `<div class="carte forge-bloc"><h3 style="margin:0 0 8px;">📦 Objets forgés</h3><p class="vide">Aucun objet forgé. Crée-en un ci-dessus — il apparaîtra ensuite dans « ➕ Mettre en vente ».</p></div>`;
    const items = cat.map((it) => `<div class="forge-item" data-id="${it.id}">
      <div class="forge-item-tete">
        <span class="forge-item-nom">${it.icone ? `<img class="forge-item-icone" src="${it.icone}" alt="" />` : ""}${echapper(it.nom)}</span>
        <span class="forge-item-badge">${it.type}${it.rareteNom ? " · " + echapper(it.rareteNom) : ""} · ${it.prixPo} po</span>
      </div>
      ${_resume(it) ? `<div class="forge-item-resume">${_resume(it)}</div>` : ""}
      <div class="barre-actions" style="margin-top:6px;">
        <button class="btn petit danger btn-forge-suppr" data-id="${it.id}">🗑 Supprimer</button>
      </div>
    </div>`).join("");
    return `<div class="carte forge-bloc">
      <h3 style="margin:0 0 8px;">📦 Objets forgés (${cat.length})</h3>
      <p class="forge-aide">Pour les vendre : choisis un marchand puis l'objet dans « ➕ Mettre en vente » plus haut.</p>
      <div class="forge-liste">${items}</div>
    </div>`;
  }

  // Ajuste la visibilité des champs selon le type sélectionné.
  function _majVisibilite() {
    const type = v("forge-type") || "accessoire";
    const zone = $("zone-forge");
    if (!zone) return;
    zone.querySelectorAll(".f-arme").forEach((e) => e.style.display = type === "arme" ? "" : "none");
    zone.querySelectorAll(".f-armure").forEach((e) => e.style.display = type === "armure" ? "" : "none");
    zone.querySelectorAll(".f-accessoire").forEach((e) => e.style.display = type === "accessoire" ? "" : "none");
  }

  // ── Listes multi (compétences / formules) en cours de saisie ──
  function _rendreCompListe() {
    const el = $("forge-comp-liste"); if (!el) return;
    el.innerHTML = _competencesEnCours.map((c, i) =>
      `<span class="forge-chip">${c.valeur > 0 ? "+" : ""}${c.valeur} ${echapper(c.competence)} <button type="button" data-i="${i}" class="forge-chip-x">×</button></span>`).join("");
    el.querySelectorAll(".forge-chip-x").forEach((b) => { b.onclick = () => { _competencesEnCours.splice(+b.dataset.i, 1); _rendreCompListe(); }; });
  }
  function _labelFormule(f) {
    return `⚙ ${f.cible}${f.carac ? " " + f.carac : ""}${f.competence ? " " + f.competence : ""} = ${echapper(f.expr)}`;
  }
  function _rendreFormulesListe() {
    const el = $("forge-formules-liste"); if (!el) return;
    el.innerHTML = _formulesEnCours.map((f, i) =>
      `<span class="forge-chip">${_labelFormule(f)} <button type="button" data-i="${i}" class="forge-chip-x">×</button></span>`).join("");
    el.querySelectorAll(".forge-chip-x").forEach((b) => { b.onclick = () => { _formulesEnCours.splice(+b.dataset.i, 1); _rendreFormulesListe(); }; });
  }
  function _ajouterComp() {
    const comp = v("forge-comp"); const val = n("forge-comp-val");
    if (!comp || !val) { toast("Choisis une compétence et une valeur ≠ 0."); return; }
    _competencesEnCours.push({ competence: comp, valeur: val });
    const inp = $("forge-comp-val"); if (inp) inp.value = ""; // évite un double-ajout à la forge
    _rendreCompListe();
  }
  function _ajouterFormule() {
    const cible = v("forge-f-cible"); const expr = v("forge-f-expr");
    if (!cible || !expr) { toast("Choisis une cible et écris une formule."); return; }
    const f = { cible, expr };
    if (cible === "carac") f.carac = v("forge-f-carac");
    if (cible === "competence") f.competence = v("forge-f-comp");
    _formulesEnCours.push(f);
    const inp = $("forge-f-expr"); if (inp) inp.value = "";
    const ap = $("forge-f-apercu"); if (ap) ap.textContent = "Aperçu : —";
    _rendreFormulesListe();
  }

  // Point d'entrée : rend le formulaire + la liste dans #zone-forge (MJ only).
  function rendre() {
    const zone = $("zone-forge");
    if (!zone) return;
    if (!estMj()) { zone.innerHTML = ""; return; }
    zone.innerHTML = _formulaireHtml() + _listeHtml();
    _majVisibilite();
    const selType = $("forge-type");
    if (selType) selType.onchange = _majVisibilite;
    const btn = $("btn-forger");
    if (btn) btn.onclick = forger;
    zone.querySelectorAll(".btn-forge-suppr").forEach((b) => { b.onclick = () => supprimer(b.dataset.id); });

    // Icône : upload + aperçu + retrait
    const _majApercuIcone = () => {
      const ap = $("forge-icone-apercu"); if (!ap) return;
      ap.innerHTML = _iconeEnCours
        ? `<img src="${_iconeEnCours}" alt="icône" /> <button type="button" class="btn petit secondaire" id="btn-forge-icone-suppr">Retirer l'icône</button>`
        : "";
      const sup = $("btn-forge-icone-suppr");
      if (sup) sup.onclick = () => { _iconeEnCours = null; _majApercuIcone(); };
    };
    _majApercuIcone();
    const fileIcone = $("forge-icone-file");
    if (fileIcone) fileIcone.onchange = (e) => { _lireIcone(e.target.files[0], (dataUrl) => { _iconeEnCours = dataUrl; _majApercuIcone(); }); };

    // Listes multi : boutons Ajouter + rendu (restauré depuis l'état en cours)
    const bCompAdd = $("btn-forge-comp-add"); if (bCompAdd) bCompAdd.onclick = _ajouterComp;
    const bFAdd = $("btn-forge-f-add"); if (bFAdd) bFAdd.onclick = _ajouterFormule;
    _rendreCompListe();
    _rendreFormulesListe();

    // Formule dynamique : visibilité carac/compétence, aperçu, insertion de @variables
    const majF = () => {
      const cible = v("forge-f-cible");
      zone.querySelectorAll(".f-fcarac").forEach((e) => e.style.display = cible === "carac" ? "" : "none");
      zone.querySelectorAll(".f-fcomp").forEach((e) => e.style.display = cible === "competence" ? "" : "none");
    };
    const apercu = () => {
      const ap = $("forge-f-apercu"); if (!ap) return;
      const expr = v("forge-f-expr");
      if (!expr) { ap.textContent = "Aperçu : —"; return; }
      const r = (typeof Formule !== "undefined") ? Formule.apercuDemo(expr) : 0;
      ap.textContent = `Aperçu (or=350, niv=3, PV=18/30, CHA=16) → ${r}`;
    };
    majF();
    const selCible = $("forge-f-cible"); if (selCible) selCible.onchange = majF;
    const inExpr = $("forge-f-expr"); if (inExpr) inExpr.oninput = apercu;
    zone.querySelectorAll(".btn-forge-var").forEach((b) => {
      b.onclick = () => {
        const inp = $("forge-f-expr"); if (!inp) return;
        const ins = "@" + b.dataset.var;
        const s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
        const e = inp.selectionEnd != null ? inp.selectionEnd : inp.value.length;
        inp.value = inp.value.slice(0, s) + ins + inp.value.slice(e);
        inp.focus();
        const pos = s + ins.length; inp.setSelectionRange(pos, pos);
        apercu();
      };
    });
  }

  // Catalogue custom (lu par marche.js via Forge.catalogueCustom()).
  function catalogueCustom() { return lire(); }

  // Re-render quand un autre client (MJ) modifie le catalogue custom.
  if (typeof SyncStore !== "undefined" && SyncStore.subscribe) {
    SyncStore.subscribe(KEY, () => { if (typeof Marche !== "undefined") Marche.rendrePanneauMarche(); else rendre(); });
  }

  return { rendre, catalogueCustom };
})();
