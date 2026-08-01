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
    const rar = v("forge-rarete");
    if (rar && rar !== "commun") {
      item.rarete = rar;
      item.rareteNom = (RARETES.find((r) => r[0] === rar) || [])[1] || rar;
    }
    // Bonus de caractéristiques (seulement les non-nuls, + ou -)
    const bonusCarac = {};
    CARACS.forEach((c) => { const val = n("forge-carac-" + c); if (val) bonusCarac[c] = val; });
    if (Object.keys(bonusCarac).length) item.bonusCarac = bonusCarac;
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
    const item = _construireItem();
    if (!item.nom) { toast("Donne un nom à l'objet."); return; }
    if (!item.prixPo) { toast("Indique un prix (po)."); return; }
    const cat = lire();
    cat.push(item);
    ecrire(cat);
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
    if (it.valeurArmure) bits.push(`réduction ${it.valeurArmure}` + (it.malusDEX ? `, malus DEX -${it.malusDEX}` : ""));
    if (it.type === "arme") bits.push(`${it.degats} · ${it.portee}` + (it.deuxMains ? " · 2 mains" : ""));
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
        <span class="forge-item-nom">${echapper(it.nom)}</span>
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
  }

  // Catalogue custom (lu par marche.js via Forge.catalogueCustom()).
  function catalogueCustom() { return lire(); }

  // Re-render quand un autre client (MJ) modifie le catalogue custom.
  if (typeof SyncStore !== "undefined" && SyncStore.subscribe) {
    SyncStore.subscribe(KEY, () => { if (typeof Marche !== "undefined") Marche.rendrePanneauMarche(); else rendre(); });
  }

  return { rendre, catalogueCustom };
})();
