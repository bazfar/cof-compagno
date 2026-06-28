/* ============================================================
   Bestiaire — catalogue de monstres (mode MJ).
   Monstres de base (data/bestiaire.js) + monstres créés par le MJ
   (élites, boss…) stockés en localStorage via le Dépôt.
   ============================================================ */

const Bestiaire = (() => {
  "use strict";

  const depot = new DepotLocal("cof_bestiaire");
  let filtreType = "tous";
  let recherche = "";
  let editionId = null; // id du monstre custom en cours d'édition (null = création)
  let formPortrait = null; // image du monstre en cours d'édition (data URL)
  let baseMonstres = []; // bestiaire de base (chargé depuis data/bestiaire.json)
  let baseChargee = false;

  /* ---------- Données ---------- */
  function chargerCustom() {
    try { return depot.charger() || {}; } catch (e) { return {}; }
  }
  function tous() {
    const base = baseMonstres.map((m) => Object.assign({ base: true }, m));
    const custom = Object.values(chargerCustom()).map((m) => Object.assign({ base: false }, m));
    return base.concat(custom);
  }

  /* ---------- Chargement du bestiaire de base (format thomas) ---------- */
  function typeDepuis(m) {
    if (m.boss) return "boss";
    if ((m.dangerosite || 1) >= 3) return "elite";
    return "normal";
  }
  function emojiPour(m) {
    const n = (m.nom + " " + (m.famille || "") + " " + (m.id || "")).toLowerCase();
    if (/loup/.test(n)) return "🐺";
    if (/ours|urskar/.test(n)) return "🐻";
    if (/orc|warchief|berserker/.test(n)) return "🪓";
    if (/gobelin|goblin|kratz/.test(n)) return "👺";
    if (/golem/.test(n)) return "🗿";
    if (/elfe/.test(n)) return "🧝";
    if (/garde|solvarn|legion|imperial/.test(n)) return "🛡️";
    if (/spectre|fantome|ombre|revenant/.test(n)) return "👻";
    if (/sanglier/.test(n)) return "🐗";
    if (/racine|sylvath|seve|plante|sylv/.test(n)) return "🌿";
    if (/bandit|brigand|voleur/.test(n)) return "🗡️";
    if (/araign/.test(n)) return "🕷️";
    if (/demon|diable|chaos/.test(n)) return "👹";
    if (/squelette|zombie|mort|liche|necro/.test(n)) return "💀";
    return m.boss ? "👑" : (typeDepuis(m) === "elite" ? "⭐" : "🦴");
  }
  // Convertit un monstre du format thomas vers le modèle d'affichage
  function normaliser(m) {
    const attaques = (m.attaques || []).map((a) => {
      let s = a.nom;
      if (a.degats && a.degats !== "0" && a.degats !== "null" && a.degats != null) s += " — " + a.degats;
      if (a.portee && a.portee !== "contact") s += " (" + a.portee + ")";
      if (a.effetSpecial) s += " · " + a.effetSpecial;
      return s;
    });
    const caps = (m.capacitesSpeciales || []).map((c) => c.nom + (c.description ? " : " + c.description : ""));
    if (m.armure && m.armure.valeur) caps.unshift("Armure : " + (m.armure.description || ("réduit " + m.armure.valeur + " dégâts")));
    let desc = m.lore || "";
    if (m.roleNarratif) desc += (desc ? "\n\n" : "") + "Rôle MJ : " + m.roleNarratif;
    return {
      id: m.id, nom: m.nom, emoji: emojiPour(m), type: typeDepuis(m),
      pv: m.pv, def: m.def, init: m.init, attaque: m.atk,
      attaques, capacites: caps, description: desc,
      dangerosite: m.dangerosite, boss: m.boss,
      tags: [m.faction, m.famille, m.tier].filter(Boolean),
    };
  }
  async function chargerBase() {
    if (baseChargee) return;
    try {
      const resp = await fetch("data/bestiaire.json", { cache: "no-store" });
      const data = await resp.json();
      baseMonstres = (data.monstres || []).map(normaliser);
    } catch (e) {
      baseMonstres = (typeof BESTIAIRE_BASE !== "undefined" ? BESTIAIRE_BASE : []);
    }
    baseChargee = true;
  }
  function genId(nom) {
    const slug = (nom || "monstre").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 18);
    const cust = chargerCustom();
    let i = 1, id;
    do { id = "m-" + slug + "-" + i; i++; } while (cust[id]);
    return id;
  }

  /* ---------- Utilitaires ---------- */
  function ech(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2200);
  }
  function badgeType(type) {
    const t = (typeof TYPES_MONSTRE !== "undefined" && TYPES_MONSTRE[type]) || { label: type, couleur: "#777" };
    return `<span class="badge-type" style="background:${t.couleur}">${t.label}</span>`;
  }

  /* ---------- Rendu de la liste ---------- */
  function render() {
    const liste = document.getElementById("bestiaire-liste");
    if (!liste) return;
    let monstres = tous();
    if (filtreType !== "tous") monstres = monstres.filter((m) => m.type === filtreType);
    if (recherche) {
      const q = recherche.toLowerCase();
      monstres = monstres.filter((m) => (m.nom + " " + (m.tags || []).join(" ")).toLowerCase().includes(q));
    }

    if (!monstres.length) {
      liste.innerHTML = `<div class="vide">Aucun monstre ne correspond.</div>`;
      return;
    }

    // Groupé par type, dans l'ordre normal → élite → boss
    const ordre = ["normal", "elite", "boss"];
    const pluriels = { normal: "Normaux", elite: "Élites", boss: "Boss" };
    liste.innerHTML = ordre.map((type) => {
      const grp = monstres.filter((m) => m.type === type);
      if (!grp.length) return "";
      const titre = pluriels[type] || type;
      return `<h3 class="bestiaire-section">${titre} <span class="compte">(${grp.length})</span></h3>` +
        `<div class="bestiaire-grille">` + grp.map(carteMonstre).join("") + `</div>`;
    }).join("");

    // bindings
    liste.querySelectorAll("[data-act]").forEach((b) => {
      const id = b.dataset.id, act = b.dataset.act;
      if (act === "editer") b.onclick = () => ouvrirForm(id);
      if (act === "supprimer") b.onclick = () => supprimer(id);
      if (act === "dupliquer") b.onclick = () => dupliquer(id);
    });
  }

  function carteMonstre(m) {
    const stats = `PV ${m.pv} · DEF ${m.def} · Init ${m.init >= 0 ? "+" + m.init : m.init} · Att ${m.attaque >= 0 ? "+" + m.attaque : m.attaque}` +
      (m.dangerosite ? ` · Danger ${m.dangerosite}/5` : "");
    const attaques = (m.attaques || []).map((a) => `<li>${ech(a)}</li>`).join("");
    const capacites = (m.capacites || []).map((c) => `<li>${ech(c)}</li>`).join("");
    const actions = m.base
      ? `<button class="btn petit secondaire" data-act="dupliquer" data-id="${m.id}">Dupliquer</button>`
      : `<button class="btn petit secondaire" data-act="editer" data-id="${m.id}">Éditer</button>` +
        `<button class="btn petit danger" data-act="supprimer" data-id="${m.id}">Suppr.</button>`;
    return `
      <div class="monstre-carte ${m.type}">
        <div class="monstre-tete">
          ${m.portrait ? `<img class="monstre-portrait" src="${m.portrait}" alt="" />` : `<span class="monstre-emoji">${m.emoji || "🦴"}</span>`}
          <div><div class="monstre-nom">${ech(m.nom)}</div>${badgeType(m.type)}${m.base ? ' <span class="badge-base">de base</span>' : ""}</div>
        </div>
        <div class="monstre-stats">${stats}</div>
        ${attaques ? `<div class="monstre-bloc"><strong>Attaques</strong><ul>${attaques}</ul></div>` : ""}
        ${capacites ? `<div class="monstre-bloc"><strong>Capacités</strong><ul>${capacites}</ul></div>` : ""}
        ${m.description ? `<div class="monstre-desc">${ech(m.description)}</div>` : ""}
        <div class="barre-actions">${actions}</div>
      </div>`;
  }

  /* ---------- Formulaire création / édition ---------- */
  function ouvrirForm(id) {
    editionId = id || null;
    const m = id ? chargerCustom()[id] : null;
    const form = document.getElementById("bestiaire-form");
    if (!form) return;
    const v = (x) => (x == null ? "" : x);
    const lignes = (arr) => (arr || []).join("\n");

    form.innerHTML = `
      <h3 class="titre-bandeau">${id ? "Éditer" : "Créer"} un monstre</h3>
      <div class="grille grille-2">
        <div><label>Nom</label><input id="mf-nom" type="text" value="${ech(m ? m.nom : "")}" placeholder="Ex. Gobelin d'élite" /></div>
        <div><label>Emoji / icône</label><input id="mf-emoji" type="text" maxlength="3" value="${ech(m ? m.emoji : "👹")}" /></div>
        <div><label>Type</label><select id="mf-type">
          <option value="normal">Normal</option>
          <option value="elite">Élite</option>
          <option value="boss">Boss</option>
        </select></div>
        <div><label>PV</label><input id="mf-pv" type="number" min="1" value="${v(m ? m.pv : 10)}" /></div>
        <div><label>DEF</label><input id="mf-def" type="number" value="${v(m ? m.def : 12)}" /></div>
        <div><label>Initiative</label><input id="mf-init" type="number" value="${v(m ? m.init : 10)}" /></div>
        <div><label>Bonus d'attaque</label><input id="mf-attaque" type="number" value="${v(m ? m.attaque : 3)}" /></div>
      </div>
      <div class="portrait-zone" style="margin-top:10px;">
        <div class="portrait-apercu" id="mf-portrait-apercu">—</div>
        <div>
          <label>Image du monstre <span style="font-weight:400;font-size:0.75rem;">(optionnel)</span></label>
          <div class="barre-actions" style="margin-top:0;">
            <button type="button" class="btn petit secondaire" id="mf-portrait-btn">Choisir une image</button>
            <button type="button" class="btn petit danger" id="mf-portrait-suppr" style="display:none;">Retirer</button>
          </div>
          <input type="file" id="mf-portrait-input" accept="image/*" style="display:none;" />
          <p style="font-size:0.72rem;color:#8a8296;margin:6px 0 0;">Redimensionnée (max 256px). Sans image, l'emoji est utilisé.</p>
        </div>
      </div>
      <div style="margin-top:10px;"><label>Attaques (une par ligne)</label>
        <textarea id="mf-attaques" placeholder="Hache lourde — 1d8+2">${ech(lignes(m ? m.attaques : []))}</textarea></div>
      <div style="margin-top:10px;"><label>Capacités spéciales (une par ligne)</label>
        <textarea id="mf-capacites" placeholder="Férocité : +2 DM sous 50% PV">${ech(lignes(m ? m.capacites : []))}</textarea></div>
      <div style="margin-top:10px;"><label>Description</label>
        <textarea id="mf-description">${ech(m ? m.description : "")}</textarea></div>
      <div class="barre-actions">
        <button class="btn or" id="mf-save">💾 Enregistrer</button>
        <button class="btn secondaire" id="mf-cancel">Annuler</button>
      </div>`;
    form.style.display = "block";
    if (m) document.getElementById("mf-type").value = m.type;

    // Image du monstre (upload)
    formPortrait = m ? (m.portrait || null) : null;
    majApercuPortrait();
    document.getElementById("mf-portrait-btn").onclick = () => document.getElementById("mf-portrait-input").click();
    document.getElementById("mf-portrait-input").onchange = (e) => { if (e.target.files[0]) chargerPortrait(e.target.files[0]); e.target.value = ""; };
    document.getElementById("mf-portrait-suppr").onclick = () => { formPortrait = null; majApercuPortrait(); };

    document.getElementById("mf-save").onclick = sauver;
    document.getElementById("mf-cancel").onclick = fermerForm;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function majApercuPortrait() {
    const ap = document.getElementById("mf-portrait-apercu");
    const suppr = document.getElementById("mf-portrait-suppr");
    if (!ap) return;
    if (formPortrait) { ap.innerHTML = `<img src="${formPortrait}" alt="" />`; if (suppr) suppr.style.display = ""; }
    else { ap.innerHTML = "—"; if (suppr) suppr.style.display = "none"; }
  }

  function chargerPortrait(file) {
    if (!file.type.startsWith("image/")) { toast("Choisis un fichier image."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 256; let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
        else if (h > max) { w = Math.round((w * max) / h); h = max; }
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        formPortrait = cv.toDataURL("image/jpeg", 0.82);
        majApercuPortrait();
        toast("Image ajoutée ✔");
      };
      img.onerror = () => toast("Image illisible.");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function fermerForm() {
    const form = document.getElementById("bestiaire-form");
    if (form) { form.style.display = "none"; form.innerHTML = ""; }
    editionId = null;
  }

  function lignesDepuis(id) {
    return document.getElementById(id).value.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  function sauver() {
    const nom = document.getElementById("mf-nom").value.trim();
    if (!nom) { toast("Donne un nom au monstre."); return; }
    const m = {
      id: editionId || genId(nom),
      nom,
      emoji: document.getElementById("mf-emoji").value.trim() || "👹",
      type: document.getElementById("mf-type").value,
      pv: parseInt(document.getElementById("mf-pv").value, 10) || 1,
      def: parseInt(document.getElementById("mf-def").value, 10) || 10,
      init: parseInt(document.getElementById("mf-init").value, 10) || 0,
      attaque: parseInt(document.getElementById("mf-attaque").value, 10) || 0,
      attaques: lignesDepuis("mf-attaques"),
      capacites: lignesDepuis("mf-capacites"),
      description: document.getElementById("mf-description").value.trim(),
      portrait: formPortrait || null,
    };
    const cust = chargerCustom();
    cust[m.id] = m;
    depot.remplacerTout(cust);
    fermerForm();
    render();
    toast(editionId ? "Monstre modifié ✔" : "Monstre créé ✔");
  }

  function supprimer(id) {
    const cust = chargerCustom();
    if (!cust[id]) return;
    if (!confirm(`Supprimer « ${cust[id].nom} » ?`)) return;
    depot.supprimer(id);
    render();
    toast("Monstre supprimé.");
  }

  function dupliquer(id) {
    const base = tous().find((m) => m.id === id);
    if (!base) return;
    const copie = JSON.parse(JSON.stringify(base));
    delete copie.base;
    copie.nom = base.nom + " (copie)";
    copie.id = genId(copie.nom);
    const cust = chargerCustom();
    cust[copie.id] = copie;
    depot.remplacerTout(cust);
    render();
    ouvrirForm(copie.id); // ouvre direct en édition pour personnaliser
    toast("Copie créée — personnalise-la !");
  }

  /* ---------- Init ---------- */
  function init() {
    const btnNew = document.getElementById("btn-nouveau-monstre");
    const filtre = document.getElementById("filtre-type-monstre");
    const rech = document.getElementById("recherche-monstre");
    if (!btnNew) return;
    btnNew.onclick = () => ouvrirForm(null);
    if (filtre) filtre.onchange = () => { filtreType = filtre.value; render(); };
    if (rech) rech.oninput = () => { recherche = rech.value; render(); };
  }
  async function onOpen() {
    if (!baseChargee) {
      const liste = document.getElementById("bestiaire-liste");
      if (liste) liste.innerHTML = `<div class="vide">Chargement du bestiaire…</div>`;
      await chargerBase();
    }
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
  return { onOpen };
})();
