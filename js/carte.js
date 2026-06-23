/* ============================================================
   Carte (mode MJ) — Option A : local + partage d'écran Discord
   Import d'image, jetons déplaçables, grille, brouillard de guerre.
   État sauvegardé localement (localStorage).
   ============================================================ */

const Carte = (() => {
  "use strict";

  const STORAGE = "cof_carte";
  const PALETTE = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#b8924a", "#7f8c8d"];

  // Cartes intégrées (fichiers dans assets/maps/). En ajouter ici au besoin.
  // groupe : libellé d'optgroup dans le menu déroulant.
  const CARTES_PRESETS = [
    { key: "monde", groupe: "Monde & régions", label: "🌍 Le Monde", file: "assets/maps/monde.png" },
    { key: "solvarn", groupe: "Monde & régions", label: "Solvarn — Empire", file: "assets/maps/solvarn.png" },
    { key: "valdorne", groupe: "Monde & régions", label: "Valdorne — Chevalerie", file: "assets/maps/valdorne.png" },
    { key: "arveth", groupe: "Monde & régions", label: "Arveth — Le Vacillant", file: "assets/maps/arveth.png" },
    { key: "mornac", groupe: "Monde & régions", label: "Mornac — Maritime", file: "assets/maps/mornac.png" },
    { key: "serval", groupe: "Monde & régions", label: "Serval — Montagnard", file: "assets/maps/serval.png" },
    { key: "liberra", groupe: "Monde & régions", label: "Liberra — République", file: "assets/maps/liberra.png" },
    { key: "aetharion", groupe: "Monde & régions", label: "Aetharion — Hauts Elfes", file: "assets/maps/aetharion.png" },
    { key: "aelindra", groupe: "Monde & régions", label: "Aelindra — Elfes Sylvains", file: "assets/maps/aelindra.png" },
    { key: "mordanel", groupe: "Monde & régions", label: "Mordanel — Elfes Crépuscule", file: "assets/maps/mordanel.png" },
    { key: "khazrak", groupe: "Monde & régions", label: "Khazrak Dûm — Race Sublimée", file: "assets/maps/khazrak-dum.png" },
    { key: "valdcourt", groupe: "Lieux & combats", label: "Domaine de Valdcourt (1 case = 1,50 m)", file: "assets/maps/domaine-valdcourt.png" },
  ];

  let etat = { image: null, jetons: [], grille: false, fog: false, fogData: null };
  let pinceauActif = false;
  let compteur = 1;
  let role = null;       // "joueur" | "mj" | null — gère qui peut déplacer quels jetons
  let monPersoId = null; // id du personnage du joueur (jeton "pj-<id>" déplaçable en mode joueur)

  function definirRole(r) { role = r; }
  function definirMonPerso(id) { monPersoId = id; }
  let dom = {};

  /* ---------- Persistance ---------- */
  function charger() {
    try { const e = JSON.parse(localStorage.getItem(STORAGE)); if (e) etat = e; } catch (x) {}
  }
  function sauver() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(etat));
    } catch (x) {
      // quota dépassé : on sauve sans le brouillard (souvent le plus lourd)
      try {
        const copie = Object.assign({}, etat, { fogData: null });
        localStorage.setItem(STORAGE, JSON.stringify(copie));
        toastCarte("Brouillard non sauvegardé (mémoire pleine), le reste est conservé.");
      } catch (y) {
        toastCarte("Mémoire pleine : carte non sauvegardée.");
      }
    }
  }
  function toastCarte(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2400);
  }

  /* ---------- Import d'image (redimensionnée) ---------- */
  function importerCarte(file) {
    if (!file || !file.type.startsWith("image/")) { toastCarte("Choisis un fichier image."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
        else if (h > max) { w = Math.round((w * max) / h); h = max; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        etat.image = cv.toDataURL("image/jpeg", 0.82);
        etat.fogData = null; // nouvelle carte => brouillard remis à zéro
        sauver();
        rendreImage(() => { if (etat.fog) remplirFog(); });
        toastCarte("Carte importée ✔");
      };
      img.onerror = () => toastCarte("Image illisible.");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Charge une carte intégrée (fichier dans assets/maps/) comme fond
  function chargerPreset(key) {
    const p = CARTES_PRESETS.find((c) => c.key === key);
    if (!p) return;
    etat.image = p.file;
    etat.fogData = null;
    sauver();
    rendreImage(() => { if (etat.fog) remplirFog(); });
    toastCarte(p.label + " chargée");
  }

  // Pour un fichier preset, propose plusieurs extensions (tolérant png/jpg/webp)
  function candidatsImage(src) {
    const m = /^(assets\/maps\/.+?)\.(png|jpg|jpeg|webp)$/i.exec(src);
    if (!m) return [src]; // dataURL importée ou URL autre : un seul essai
    return [m[1] + ".png", m[1] + ".jpg", m[1] + ".jpeg", m[1] + ".webp"];
  }

  function rendreImage(apres) {
    if (etat.image) {
      dom.vide.style.display = "none";
      dom.image.style.display = "block";
      dom.image.onload = () => {
        dom.fog.width = dom.image.naturalWidth;
        dom.fog.height = dom.image.naturalHeight;
        if (etat.fogData) restaurerFog();
        if (apres) apres();
      };
      const essais = candidatsImage(etat.image);
      dom.image.onerror = () => {
        if (essais.length) { dom.image.src = essais.shift(); return; }
        dom.image.style.display = "none";
        dom.vide.style.display = "flex";
        dom.vide.textContent = "Carte introuvable. Place le fichier dans assets/maps/ (puis recharge).";
      };
      dom.image.src = essais.length ? essais.shift() : etat.image;
    } else {
      dom.vide.style.display = "flex";
      dom.vide.textContent = "Aucune carte. Choisis « Cartes… » ou importe la tienne.";
      dom.image.style.display = "none";
    }
    rendreJetons();
    dom.scene.classList.toggle("grille", !!etat.grille);
    syncSelect();
  }

  // Aligne le menu déroulant sur la carte actuelle
  function syncSelect() {
    if (!dom.select) return;
    const p = CARTES_PRESETS.find((c) => c.file === etat.image);
    dom.select.value = p ? p.key : "";
  }

  /* ---------- Jetons ---------- */
  function nouvelId() { let id; do { id = "j" + compteur++; } while (etat.jetons.some((j) => j.id === id)); return id; }

  function ajouterJetonsPersos() {
    let persos = {};
    try { persos = JSON.parse(localStorage.getItem("cof_persos")) || {}; } catch (x) {}
    const ids = Object.keys(persos);
    if (!ids.length) { toastCarte("Aucun personnage enregistré."); return; }
    let ajout = 0, i = etat.jetons.length;
    ids.forEach((pid) => {
      const ref = "pj-" + pid;
      if (etat.jetons.some((j) => j.ref === ref)) return; // déjà sur la carte
      const p = persos[pid];
      etat.jetons.push({
        id: nouvelId(), ref: ref, nom: p.nom, couleur: "#b8924a", pj: true,
        portrait: p.portrait || null, classe: p.classe,
        x: 15 + ((i % 6) * 12), y: 15 + (Math.floor(i / 6) * 14),
      });
      i++; ajout++;
    });
    if (!ajout) { toastCarte("Tous tes persos sont déjà sur la carte."); return; }
    sauver(); rendreJetons();
    toastCarte(ajout + " jeton(s) ajouté(s).");
  }

  function ajouterJetonLibre() {
    const nom = prompt("Nom du jeton (PNJ / monstre) :", "Gobelin");
    if (nom === null) return;
    const i = etat.jetons.length;
    etat.jetons.push({
      id: nouvelId(), nom: nom.trim() || "Jeton", couleur: PALETTE[i % PALETTE.length],
      pj: false, portrait: null, x: 50, y: 50,
    });
    sauver(); rendreJetons();
  }

  function supprimerJeton(id) {
    etat.jetons = etat.jetons.filter((j) => j.id !== id);
    sauver(); rendreJetons();
  }

  function initiales(nom) {
    return (nom || "?").trim().split(/\s+/).map((m) => m[0]).slice(0, 2).join("").toUpperCase();
  }

  function rendreJetons() {
    dom.jetons.innerHTML = "";
    etat.jetons.forEach((j) => {
      const el = document.createElement("div");
      el.className = "jeton";
      el.style.left = j.x + "%";
      el.style.top = j.y + "%";
      el.dataset.id = j.id;
      const interieur = j.portrait
        ? `<img src="${j.portrait}" alt="" />`
        : (j.pj && typeof embleme === "function" ? embleme(j.classe, 40) : initiales(j.nom));
      el.innerHTML =
        `<div class="jeton-pion" style="border-color:${j.couleur};${j.portrait || j.pj ? "" : "background:" + j.couleur + ";"}">${interieur}</div>` +
        (role === "joueur" ? "" : `<button class="jeton-suppr" title="Retirer">✕</button>`) +
        `<div class="jeton-label">${echappe(j.nom)}</div>`;
      dom.jetons.appendChild(el);
      // suppression (MJ uniquement)
      const btnSuppr = el.querySelector(".jeton-suppr");
      if (btnSuppr) btnSuppr.addEventListener("click", (ev) => { ev.stopPropagation(); supprimerJeton(j.id); });
      // glisser-déposer
      el.querySelector(".jeton-pion").addEventListener("pointerdown", (ev) => demarrerDrag(ev, j, el));
    });
  }

  function echappe(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  /* ---------- Déplacement des jetons ---------- */
  let drag = null;
  function demarrerDrag(ev, j, el) {
    if (pinceauActif) return; // en mode pinceau, on ne déplace pas
    if (role === "joueur" && j.ref !== "pj-" + monPersoId) return; // joueur : ne déplace que son propre jeton
    ev.preventDefault();
    drag = { j, el };
    el.classList.add("drag");
    window.addEventListener("pointermove", surDrag);
    window.addEventListener("pointerup", finDrag);
  }
  function surDrag(ev) {
    if (!drag) return;
    const r = dom.scene.getBoundingClientRect();
    let x = ((ev.clientX - r.left) / r.width) * 100;
    let y = ((ev.clientY - r.top) / r.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    drag.j.x = x; drag.j.y = y;
    drag.el.style.left = x + "%";
    drag.el.style.top = y + "%";
  }
  function finDrag() {
    if (!drag) return;
    drag.el.classList.remove("drag");
    drag = null;
    window.removeEventListener("pointermove", surDrag);
    window.removeEventListener("pointerup", finDrag);
    sauver();
  }

  /* ---------- Brouillard de guerre ---------- */
  function ctxFog() { return dom.fog.getContext("2d"); }
  function remplirFog() {
    const c = ctxFog();
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "rgba(8,5,12,0.93)";
    c.fillRect(0, 0, dom.fog.width, dom.fog.height);
    enregistrerFog();
  }
  function viderFog() {
    ctxFog().clearRect(0, 0, dom.fog.width, dom.fog.height);
    enregistrerFog();
  }
  function revelerEn(ev) {
    const c = ctxFog();
    const r = dom.fog.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * dom.fog.width;
    const y = ((ev.clientY - r.top) / r.height) * dom.fog.height;
    const rayon = Math.max(28, dom.fog.width * 0.05);
    c.globalCompositeOperation = "destination-out";
    c.beginPath(); c.arc(x, y, rayon, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = "source-over";
  }
  function enregistrerFog() {
    try { etat.fogData = dom.fog.toDataURL("image/png"); } catch (x) { etat.fogData = null; }
    sauver();
  }
  function restaurerFog() {
    if (!etat.fogData) return;
    const img = new Image();
    img.onload = () => ctxFog().drawImage(img, 0, 0, dom.fog.width, dom.fog.height);
    img.src = etat.fogData;
  }

  let peintEnCours = false;
  function brushDown(ev) { if (!pinceauActif) return; peintEnCours = true; revelerEn(ev); }
  function brushMove(ev) { if (pinceauActif && peintEnCours) revelerEn(ev); }
  function brushUp() { if (peintEnCours) { peintEnCours = false; enregistrerFog(); } }

  /* ---------- Boutons brouillard ---------- */
  function basculerFog() {
    etat.fog = !etat.fog;
    majBoutonsFog();
    if (etat.fog) { if (!etat.fogData) remplirFog(); else restaurerFog(); }
    else { ctxFog().clearRect(0, 0, dom.fog.width, dom.fog.height); }
    dom.fog.style.display = etat.fog ? "block" : "none";
    sauver();
  }
  function basculerPinceau() {
    pinceauActif = !pinceauActif;
    dom.fog.classList.toggle("actif-pinceau", pinceauActif);
    dom.btnPinceau.classList.toggle("actif-bouton", pinceauActif);
    majAide();
  }
  function majBoutonsFog() {
    const v = etat.fog ? "" : "none";
    dom.btnPinceau.style.display = v;
    dom.btnFogClear.style.display = v;
    dom.btnFogFill.style.display = v;
    if (!etat.fog && pinceauActif) basculerPinceau();
    dom.btnFog.classList.toggle("actif-bouton", !!etat.fog);
  }

  /* ---------- Divers ---------- */
  function basculerGrille() {
    etat.grille = !etat.grille;
    dom.scene.classList.toggle("grille", etat.grille);
    dom.btnGrille.classList.toggle("actif-bouton", etat.grille);
    sauver();
  }

  function reset() {
    if (!confirm("Réinitialiser la carte (image, jetons, brouillard) ?")) return;
    etat = { image: null, jetons: [], grille: false, fog: false, fogData: null };
    pinceauActif = false;
    sauver();
    dom.fog.style.display = "none";
    dom.btnGrille.classList.remove("actif-bouton");
    majBoutonsFog();
    rendreImage();
    majAide();
    toastCarte("Carte réinitialisée.");
  }

  function majAide() {
    if (pinceauActif) dom.aide.textContent = "✏️ Mode révéler : clique-glisse sur la carte pour dissiper le brouillard. Re-clique « Révéler » pour redéplacer les jetons.";
    else if (etat.fog) dom.aide.textContent = "🌫️ Brouillard actif. Active « Révéler » pour dissiper des zones, ou « Tout révéler / couvrir ».";
    else dom.aide.textContent = "Glisse les jetons à la souris. Partage ton écran sur Discord pour montrer la carte à tes joueurs.";
  }

  /* ---------- Init ---------- */
  function init() {
    dom = {
      scene: document.getElementById("carte-scene"),
      image: document.getElementById("carte-image"),
      fog: document.getElementById("carte-fog"),
      jetons: document.getElementById("carte-jetons"),
      vide: document.getElementById("carte-vide"),
      aide: document.getElementById("carte-aide"),
      select: document.getElementById("select-carte-preset"),
      btnImport: document.getElementById("btn-import-carte"),
      inputCarte: document.getElementById("input-carte"),
      btnPersos: document.getElementById("btn-jeton-perso"),
      btnLibre: document.getElementById("btn-jeton-libre"),
      btnGrille: document.getElementById("btn-grille"),
      btnFog: document.getElementById("btn-fog"),
      btnPinceau: document.getElementById("btn-fog-brush"),
      btnFogClear: document.getElementById("btn-fog-clear"),
      btnFogFill: document.getElementById("btn-fog-fill"),
      btnReset: document.getElementById("btn-carte-reset"),
    };
    if (!dom.scene) return;

    charger();

    // Remplir le menu déroulant des cartes, groupé par optgroup
    const groupes = {};
    CARTES_PRESETS.forEach((p) => {
      const nomG = p.groupe || "Cartes";
      if (!groupes[nomG]) {
        const og = document.createElement("optgroup");
        og.label = nomG;
        dom.select.appendChild(og);
        groupes[nomG] = og;
      }
      const opt = document.createElement("option");
      opt.value = p.key; opt.textContent = p.label;
      groupes[nomG].appendChild(opt);
    });
    dom.select.onchange = () => { if (dom.select.value) chargerPreset(dom.select.value); };
    dom.btnImport.onclick = () => dom.inputCarte.click();
    dom.inputCarte.onchange = (e) => { if (e.target.files[0]) importerCarte(e.target.files[0]); e.target.value = ""; };
    dom.btnPersos.onclick = ajouterJetonsPersos;
    dom.btnLibre.onclick = ajouterJetonLibre;
    dom.btnGrille.onclick = basculerGrille;
    dom.btnFog.onclick = basculerFog;
    dom.btnPinceau.onclick = basculerPinceau;
    dom.btnFogClear.onclick = () => { viderFog(); };
    dom.btnFogFill.onclick = () => { remplirFog(); };
    dom.btnReset.onclick = reset;

    // peinture du brouillard
    dom.fog.addEventListener("pointerdown", brushDown);
    window.addEventListener("pointermove", brushMove);
    window.addEventListener("pointerup", brushUp);

    // état initial
    dom.btnGrille.classList.toggle("actif-bouton", !!etat.grille);
    dom.fog.style.display = etat.fog ? "block" : "none";
    rendreImage(() => { if (etat.fog) { majBoutonsFog(); } });
    majBoutonsFog();
    majAide();
  }

  // Appelé quand on ouvre l'onglet (re-rendu défensif)
  function onOpen() {
    if (dom.scene) rendreJetons();
  }

  document.addEventListener("DOMContentLoaded", init);

  return { onOpen, definirRole, definirMonPerso };
})();
