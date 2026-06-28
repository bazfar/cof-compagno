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

  function definirRole(r) { role = r; appliquerAffichageFog(); if (dom.aide) majAide(); }
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
        appliquerAffichageFog();
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
    // Si une battlemap .dd2vtt est active, on pose les persos comme tokens de combat
    if (typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive()) {
      let n = 0;
      ids.forEach((pid) => { if (DD2VTT.ajouterTokenData({ nom: persos[pid].nom, couleur: "#b8924a", pj: true })) n++; });
      toastCarte(n + " perso(s) sur la battlemap.");
      return;
    }
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
    // Battlemap .dd2vtt active -> token de combat
    if (typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive()) {
      DD2VTT.ajouterTokenData({ nom: nom.trim() || "Jeton", pj: false });
      return;
    }
    const i = etat.jetons.length;
    etat.jetons.push({
      id: nouvelId(), nom: nom.trim() || "Jeton", couleur: PALETTE[i % PALETTE.length],
      pj: false, portrait: null, x: 50, y: 50,
    });
    sauver(); rendreJetons();
  }

  function ajouterMonstre(monstre) {
    if (!monstre) return;
    const couleurs = { 1: "#27ae60", 2: "#2980b9", 3: "#d35400", 4: "#c0392b", 5: "#7d1a24" };
    const couleur = monstre.boss ? "#8e44ad" : (couleurs[monstre.dangerosite] || "#7f8c8d");
    const label = monstre.tier ? monstre.nom + " [" + monstre.tier + "]" : monstre.nom;
    if (typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive()) {
      DD2VTT.ajouterTokenData({ nom: label, couleur: couleur, pj: false });
      toastCarte("Token « " + monstre.nom + " » ajouté.");
      return;
    }
    // Worldmap fallback
    const i = etat.jetons.length;
    etat.jetons.push({
      id: nouvelId(), nom: label, couleur: couleur,
      pj: false, portrait: null, x: 50, y: 50,
    });
    sauver(); rendreJetons();
    toastCarte("Jeton « " + monstre.nom + " » ajouté.");
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
    // Rafraîchit aussi les jetons dessinés sur la worldmap (canvas pan/zoom)
    if (typeof Worldmap !== "undefined" && Worldmap.redessiner) Worldmap.redessiner();
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
  // Comme remplirFog(), mais sans persister : sert uniquement à l'affichage
  // joueur par défaut, sans écraser le brouillard (ou son absence) côté MJ.
  function remplirFogAffichage() {
    const c = ctxFog();
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "rgba(8,5,12,0.93)";
    c.fillRect(0, 0, dom.fog.width, dom.fog.height);
  }
  // Le joueur voit toujours la carte sous brouillard (seules les zones que le
  // MJ a explicitement révélées apparaissent) ; le MJ garde son interrupteur.
  function appliquerAffichageFog() {
    if (!dom.fog) return;
    if (!etat.image) { dom.fog.style.display = "none"; return; }
    const actif = role === "mj" ? etat.fog : true;
    dom.fog.style.display = actif ? "block" : "none";
    if (!actif) { ctxFog().clearRect(0, 0, dom.fog.width, dom.fog.height); return; }
    if (etat.fogData) restaurerFog();
    else remplirFogAffichage();
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
    if (role === "joueur") {
      dom.aide.textContent = "🌫️ La carte est sous brouillard de guerre : seules les zones révélées par le MJ sont visibles. Glisse ton jeton avec la souris.";
      return;
    }
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
    // Sélecteur géré par Worldmap.init() — ne pas écraser ici
    // dom.select.onchange = () => { if (dom.select.value) chargerPreset(dom.select.value); };
    if (dom.btnImport) dom.btnImport.onclick = () => dom.inputCarte && dom.inputCarte.click();
    if (dom.inputCarte) dom.inputCarte.onchange = (e) => { if (e.target.files[0]) importerCarte(e.target.files[0]); e.target.value = ""; };
    if (dom.btnPersos) dom.btnPersos.onclick = ajouterJetonsPersos;
    if (dom.btnLibre) dom.btnLibre.onclick = ajouterJetonLibre;
    if (dom.btnGrille)   dom.btnGrille.onclick   = basculerGrille;
    if (dom.btnFog)      dom.btnFog.onclick      = basculerFog;
    if (dom.btnPinceau)  dom.btnPinceau.onclick  = basculerPinceau;
    if (dom.btnFogClear) dom.btnFogClear.onclick = () => { viderFog(); };
    if (dom.btnFogFill)  dom.btnFogFill.onclick  = () => { remplirFog(); };
    if (dom.btnReset)    dom.btnReset.onclick    = reset;

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
    if (!dom.scene) return;
    rendreJetons();
    appliquerAffichageFog();
    majAide();
  }

  /* ============================================================
     WORLDMAP — Pan/zoom sur cartes statiques
     ============================================================ */
  const Worldmap = (() => {
    let canvas = null, ctx = null;
    let imgActuelle = null;
    let pan = { x: 0, y: 0 };
    let zoom = 1;
    let drag = false, dragStart = { x: 0, y: 0 }, panStart = { x: 0, y: 0 };
    let jetonDrag = -1; // index du jeton en cours de déplacement (-1 = aucun)
    const ZOOM_MIN = 0.2, ZOOM_MAX = 8;

    function init() {
      canvas = document.getElementById('canvas-worldmap');
      if (!canvas) return;
      ctx = canvas.getContext('2d');

      // Remplir le sélecteur depuis DONNEES.cartesMonde
      const sel = document.getElementById('select-carte-preset');
      if (sel && typeof CARTES_MONDE !== 'undefined') {
        // Vider complètement le sélecteur (supprime les entrées de l'ancien système)
        sel.innerHTML = '<option value="">Choisir une carte…</option>';
        // Repeupler avec CARTES_MONDE groupé par catégorie
        const groupes = {};
        for (const carte of CARTES_MONDE) {
          if (!groupes[carte.categorie]) groupes[carte.categorie] = [];
          groupes[carte.categorie].push(carte);
        }
        for (const [cat, cartes] of Object.entries(groupes)) {
          const grp = document.createElement('optgroup');
          grp.label = cat;
          for (const c of cartes) {
            const opt = document.createElement('option');
            opt.value = c.fichier;
            opt.textContent = c.nom;
            grp.appendChild(opt);
          }
          sel.appendChild(grp);
        }
        // Prise de contrôle exclusive du sélecteur
        sel.addEventListener('change', e => {
          if (e.target.value) {
            if (typeof DD2VTT !== 'undefined') DD2VTT.modeWorldmap();
            charger(e.target.value);
          } else { masquer(); }
        });
      }

      // Événements pan/zoom
      canvas.addEventListener('wheel',       surZoom,    { passive: false });
      canvas.addEventListener('pointerdown', surDragDeb);
      canvas.addEventListener('pointermove', surDragMvt);
      canvas.addEventListener('pointerup',   surDragFin);
      canvas.addEventListener('pointerleave',surDragFin);

      window.addEventListener('resize', () => { if (imgActuelle) { redimensionner(); centrer(); dessiner(); } });
    }

    function charger(fichier) {
      const vide = document.getElementById('carte-vide');
      if (vide) vide.style.display = 'none';

      // Cacher les éléments battlemap
      const els = ['carte-image','carte-fog','carte-murs','carte-los','dd2vtt-tokens','carte-jetons'];
      els.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      // Cacher les contrôles fog worldmap (ancien système)
      document.querySelectorAll('.worldmap-ctrl').forEach(el => el.style.display = 'none');

      canvas.style.display = 'block';

      const img = new Image();
      img.onload = () => {
        imgActuelle = img;
        redimensionner();
        centrer();
        dessiner();
      };
      img.onerror = () => {
        console.error('[Worldmap] Image introuvable :', fichier);
        if (vide) { vide.textContent = 'Carte introuvable : ' + fichier; vide.style.display = 'flex'; }
      };
      img.src = fichier;
    }

    function masquer() {
      if (canvas) canvas.style.display = 'none';
      const vide = document.getElementById('carte-vide');
      if (vide) vide.style.display = 'flex';
      imgActuelle = null;
    }

    function redimensionner() {
      const scene = document.getElementById('carte-scene');
      if (!scene || !canvas) return;
      // On ajuste le canvas À LA TAILLE de la carte (pas de grandes marges) :
      // on remplit la largeur dispo, et si ça dépasse la hauteur max, on réduit
      // la largeur pour que la carte occupe toute la hauteur disponible.
      const largeur = scene.clientWidth;
      const maxH = Math.round(window.innerHeight * 0.92);
      let w = largeur, h = 600;
      if (imgActuelle && imgActuelle.width > 0) {
        const ratio = imgActuelle.height / imgActuelle.width;
        h = Math.round(w * ratio);
        if (h > maxH) { h = maxH; w = Math.round(h / ratio); } // portrait/carré : on remplit la hauteur
      }
      canvas.width  = w;
      canvas.height = h;
      canvas.style.width  = w + 'px';   // taille réelle affichée (canvas centré via CSS)
      canvas.style.height = h + 'px';
      scene.style.height  = h + 'px';
    }

    function centrer() {
      if (!imgActuelle || !canvas) return;
      const scaleW = canvas.width  / imgActuelle.width;
      const scaleH = canvas.height / imgActuelle.height;
      zoom = Math.min(scaleW, scaleH); // la carte remplit son cadre
      pan.x = (canvas.width  - imgActuelle.width  * zoom) / 2;
      pan.y = (canvas.height - imgActuelle.height * zoom) / 2;
    }

    function dessiner() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f0a16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!imgActuelle) return;
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.drawImage(imgActuelle, 0, 0);
      ctx.restore();
      dessinerJetons();
    }

    // Position écran d'un jeton (sa position est stockée en % de l'image
    // → il suit automatiquement le pan/zoom). Taille constante à l'écran.
    const R_JETON = 18;
    function posJetonEcran(j) {
      return {
        x: pan.x + (j.x / 100) * imgActuelle.width  * zoom,
        y: pan.y + (j.y / 100) * imgActuelle.height * zoom,
      };
    }
    function jetonSousCurseur(mx, my) {
      for (let i = etat.jetons.length - 1; i >= 0; i--) {
        const p = posJetonEcran(etat.jetons[i]);
        if (Math.hypot(mx - p.x, my - p.y) <= R_JETON) return i;
      }
      return -1;
    }
    function dessinerJetons() {
      if (!imgActuelle || !etat.jetons.length) return;
      for (const j of etat.jetons) {
        const p = posJetonEcran(j);
        // pastille
        ctx.beginPath(); ctx.arc(p.x, p.y, R_JETON, 0, Math.PI * 2);
        ctx.fillStyle = j.couleur || '#7c5aa6'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = j.pj ? '#b8924a' : '#1d1526'; ctx.stroke();
        // initiales
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.fillText(initiales(j.nom), p.x, p.y);
        // étiquette
        const label = j.nom || '';
        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        const w = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(p.x - w / 2, p.y + R_JETON + 2, w, 15);
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
        ctx.fillText(label, p.x, p.y + R_JETON + 4);
      }
    }

    // ── Zoom molette ─────────────────────────────────────────
    function surZoom(ev) {
      if (!imgActuelle) return;
      ev.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const mouseX = ev.clientX - rect.left;
      const mouseY = ev.clientY - rect.top;
      const facteur = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nvZoom  = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * facteur));
      pan.x = mouseX - (mouseX - pan.x) * (nvZoom / zoom);
      pan.y = mouseY - (mouseY - pan.y) * (nvZoom / zoom);
      zoom  = nvZoom;
      dessiner();
    }

    // ── Pan cliquer-glisser ───────────────────────────────────
    function surDragDeb(ev) {
      if (!imgActuelle) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      // priorité au déplacement d'un jeton si on clique dessus
      const idx = jetonSousCurseur(mx, my);
      if (idx >= 0) {
        jetonDrag = idx;
        canvas.style.cursor = 'grabbing';
        canvas.setPointerCapture(ev.pointerId);
        return;
      }
      drag = true;
      dragStart = { x: ev.clientX, y: ev.clientY };
      panStart  = { x: pan.x, y: pan.y };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(ev.pointerId);
    }
    function surDragMvt(ev) {
      if (jetonDrag >= 0) {
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
        const j = etat.jetons[jetonDrag];
        j.x = Math.max(0, Math.min(100, ((mx - pan.x) / zoom) / imgActuelle.width  * 100));
        j.y = Math.max(0, Math.min(100, ((my - pan.y) / zoom) / imgActuelle.height * 100));
        dessiner();
        return;
      }
      if (!drag) return;
      pan.x = panStart.x + (ev.clientX - dragStart.x);
      pan.y = panStart.y + (ev.clientY - dragStart.y);
      dessiner();
    }
    function surDragFin() {
      if (jetonDrag >= 0) { jetonDrag = -1; sauver(); } // sauvegarde la position
      drag = false;
      if (canvas) canvas.style.cursor = 'grab';
    }

    return { init, charger, masquer, redessiner: dessiner };
  })();

  /* ============================================================
     Visibility Polygon (MIT) — traduction JS de l'algo de Jason Davies
     Source : github.com/byoung/visibility-polygon-js
     ============================================================ */
  const VisibilityPolygon = (() => {
    function compute(position, segments) {
      const bounded = segments.slice();
      const [bx, by, bw, bh] = _bounds(bounded);
      bounded.push([[bx,by],[bx+bw,by]],[[bx+bw,by],[bx+bw,by+bh]],[[bx+bw,by+bh],[bx,by+bh]],[[bx,by+bh],[bx,by]]);
      const endpoints = [];
      const angles = [];
      for (const seg of bounded) {
        for (const pt of seg) {
          const angle = Math.atan2(pt[1]-position[1], pt[0]-position[0]);
          endpoints.push(pt);
          angles.push(angle, angle-0.0001, angle+0.0001);
        }
      }
      angles.sort((a,b)=>a-b);
      const polygon = [];
      let prevAngle = 0;
      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i];
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const ray = [position, [position[0]+dx, position[1]+dy]];
        let minSeg = null, minT = Infinity;
        for (const seg of bounded) {
          const t = _intersect(ray, seg);
          if (t !== null && t < minT) { minT = t; minSeg = seg; }
        }
        if (minSeg !== null) {
          const pt = [position[0]+dx*minT, position[1]+dy*minT];
          if (i === 0 || Math.abs(angle - prevAngle) > 0.0002) polygon.push(pt);
        }
        prevAngle = angle;
      }
      return polygon;
    }

    function _intersect(ray, seg) {
      const [p,q] = ray, [a,b] = seg;
      const r = [q[0]-p[0], q[1]-p[1]];
      const s = [b[0]-a[0], b[1]-a[1]];
      const d = r[0]*s[1] - r[1]*s[0];
      if (Math.abs(d) < 1e-10) return null;
      const t = ((a[0]-p[0])*s[1] - (a[1]-p[1])*s[0]) / d;
      const u = ((a[0]-p[0])*r[1] - (a[1]-p[1])*r[0]) / d;
      if (t >= 0 && u >= 0 && u <= 1) return t;
      return null;
    }

    function _bounds(segs) {
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for (const s of segs) for (const p of s) {
        if(p[0]<minX)minX=p[0]; if(p[1]<minY)minY=p[1];
        if(p[0]>maxX)maxX=p[0]; if(p[1]>maxY)maxY=p[1];
      }
      const pad=1;
      return [minX-pad, minY-pad, (maxX-minX)+pad*2, (maxY-minY)+pad*2];
    }

    return { compute };
  })();

  /* ============================================================
     DD2VTT — Import Dungeondraft + multi-scènes Option B
     ============================================================ */

  const DD2VTT = (() => {
    // Registre des scènes : { [nom]: sceneObj }
    const scenes = {};
    let sceneActive = null;
    let canvasMurs = null;
    let ctxMurs = null;

    // ── Parser ──────────────────────────────────────────────
    function parseDD2VTT(data, nom) {
      const px = data.resolution.pixels_per_grid;
      const lc = data.resolution.map_size.x;
      const hc = data.resolution.map_size.y;

      // Polylignes de murs (coordonnées cases → pixels)
      const polylignes = (data.line_of_sight || []).map(poly =>
        poly.map(p => ({ x: p.x * px, y: p.y * px }))
      );

      // Segments aplatis pour LoS (étape 2)
      const segments = [];
      for (const poly of polylignes) {
        for (let i = 0; i < poly.length - 1; i++) {
          segments.push([[poly[i].x, poly[i].y], [poly[i+1].x, poly[i+1].y]]);
        }
      }

      // Portails (portes)
      const portails = (data.portals || []).map(p => ({
        position: { x: p.position.x * px, y: p.position.y * px },
        bounds: p.bounds.map(b => ({ x: b.x * px, y: b.y * px })),
        ouvert: !p.closed,
        rotation: p.rotation
      }));

      return {
        nom,
        largeur: lc * px,
        hauteur: hc * px,
        px, lc, hc,
        image: data.image ? (data.image.startsWith('data:') ? data.image : 'data:image/png;base64,' + data.image) : null,
        imageObj: null,
        polylignes,
        segments,
        portails,
        tokens: [],
        brouillard: []
      };
    }

    // ── Chargement fichier ───────────────────────────────────
    function chargerFichier(fichier) {
      const nom = fichier.name.replace(/\.dd2vtt$/i, '');
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          const scene = parseDD2VTT(data, nom);
          scenes[nom] = scene;
          mettreAJourSelect();
          activerScene(nom);
          toastCarte('Scène « ' + nom + ' » chargée ✔');
        } catch (err) {
          console.error('[DD2VTT]', err);
          toastCarte('Erreur : fichier .dd2vtt invalide.');
        }
      };
      reader.readAsText(fichier);
    }

    // ── Sélecteur multi-scènes ───────────────────────────────
    function mettreAJourSelect() {
      const sel = document.getElementById('select-scene-dd2vtt');
      if (!sel) return;
      sel.innerHTML = '';
      Object.keys(scenes).forEach(nom => {
        const opt = document.createElement('option');
        opt.value = nom; opt.textContent = nom;
        sel.appendChild(opt);
      });
      sel.style.display = Object.keys(scenes).length > 1 ? 'inline-block' : 'none';
      sel.onchange = () => activerScene(sel.value);
    }

    // ── Activation d'une scène ───────────────────────────────
    function activerScene(nom) {
      if (!scenes[nom]) return;
      sceneActive = nom;
      tokensDD = [];
      tokenSelectionne = null;
      fogRevele = null;
      const scene = scenes[nom];

      // Cacher le placeholder image PNG
      const vide = document.getElementById('carte-vide');
      if (vide) vide.style.display = 'none';

      // Afficher l'image dd2vtt dans l'img existante
      const imgEl = document.getElementById('carte-image');
      if (imgEl && scene.image) {
        imgEl.onload = () => {
          activerModeBattlemap();
          if (canvasMurs) canvasMurs.style.display = 'block';
          if (canvasLoS)  canvasLoS.style.display  = 'block';
          const btnTok = document.getElementById('btn-token-dd');
          if (btnTok) btnTok.style.display = 'inline-block';
          let _t = 0;
          function _go() {
            const _r = document.getElementById('carte-image').getBoundingClientRect();
            if (_r.width > 0 && _r.height > 0) {
              rendreScene(scene);
              requestAnimationFrame(() => { reinitFog2(scene); calculerEtRendreLoS(scene); rendreTokensDD(scene); });
            } else if (_t++ < 10) { requestAnimationFrame(_go); }
          }
          requestAnimationFrame(_go);
        };
        imgEl.src = scene.image;
        imgEl.style.display = 'block';
      }
    }

    // ── Rendu ────────────────────────────────────────────────
    function rendreScene(scene) {
      if (!canvasMurs || !ctxMurs) return;

      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      const affW  = (rect && rect.width  > 0) ? Math.round(rect.width)  : scene.largeur;
      const affH  = (rect && rect.height > 0) ? Math.round(rect.height) : scene.hauteur;

      // Offset image dans carte-scene
      const sceneEl = document.getElementById('carte-scene');
      const sceneRect = sceneEl ? sceneEl.getBoundingClientRect() : null;
      const offX2 = sceneRect ? Math.round(rect.left - sceneRect.left) : 0;
      const offY2 = sceneRect ? Math.round(rect.top  - sceneRect.top)  : 0;

      // Canvas murs calé sur l'image exactement
      canvasMurs.width  = affW;
      canvasMurs.height = affH;
      canvasMurs.style.width  = affW + 'px';
      canvasMurs.style.height = affH + 'px';
      canvasMurs.style.left   = offX2 + 'px';
      canvasMurs.style.top    = offY2 + 'px';

      const sx = affW / scene.largeur;
      const sy = affH / scene.hauteur;

      ctxMurs.clearRect(0, 0, affW, affH);
      rendreMurs(scene, sx, sy);
      rendrePortails(scene, sx, sy);
    }

    function rendreMurs(scene, sx, sy, offX=0, offY=0) {
      ctxMurs.strokeStyle = 'rgba(220, 80, 0, 0.9)';
      ctxMurs.lineWidth   = Math.max(1.5, scene.px * sx / 60);
      ctxMurs.lineCap     = 'round';
      ctxMurs.lineJoin    = 'round';
      ctxMurs.shadowColor = '#ff6600';
      ctxMurs.shadowBlur  = 4;

      for (const poly of scene.polylignes) {
        if (poly.length < 2) continue;
        ctxMurs.beginPath();
        ctxMurs.moveTo(offX + poly[0].x * sx, offY + poly[0].y * sy);
        for (let i = 1; i < poly.length; i++) {
          ctxMurs.lineTo(offX + poly[i].x * sx, offY + poly[i].y * sy);
        }
        ctxMurs.stroke();
      }
      ctxMurs.shadowBlur = 0;
    }

    function rendrePortails(scene, sx, sy, offX=0, offY=0) {
      for (const p of scene.portails) {
        const b = p.bounds;
        if (b.length < 2) continue;
        ctxMurs.strokeStyle = p.ouvert ? '#44ff88' : '#ffcc00';
        ctxMurs.lineWidth   = Math.max(2, scene.px * sx / 50);
        ctxMurs.setLineDash(p.ouvert ? [6, 4] : []);
        ctxMurs.shadowColor = p.ouvert ? '#44ff88' : '#ffcc00';
        ctxMurs.shadowBlur  = 6;
        ctxMurs.beginPath();
        ctxMurs.moveTo(offX + b[0].x * sx, offY + b[0].y * sy);
        ctxMurs.lineTo(offX + b[1].x * sx, offY + b[1].y * sy);
        ctxMurs.stroke();
        ctxMurs.setLineDash([]);
        ctxMurs.shadowBlur = 0;
      }
    }

    // ── État tokens dd2vtt ───────────────────────────────────
    // token : { id, nom, cx, cy, couleur, pj }
    // cx/cy en coordonnées cases (pas pixels)
    let tokensDD = [];
    let tokenSelectionne = null;
    let canvasLoS = null;
    let ctxLoS = null;
    let canvasFog2 = null;  // brouillard persistant dd2vtt
    let ctxFog2 = null;
    let fogRevele = null;   // ImageData du brouillard persistant

    // ── Calcul taille case affichée ──────────────────────────
    function tailleCase(scene) {
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      const affW  = (rect && rect.width > 0) ? rect.width : scene.largeur;
      return affW / scene.largeur * scene.px;
    }

    // ── Rendu tokens dd2vtt ──────────────────────────────────
    function rendreTokensDD(scene) {
      const conteneur = document.getElementById('dd2vtt-tokens');
      if (!conteneur) return;
      conteneur.innerHTML = '';

      const tc = tailleCase(scene);
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return;

      // Le conteneur couvre toute la carte-scene (position:absolute 0/0 100%/100%)
      // Les tokens sont positionnés en % de l'image dans la scene
      const sceneEl = document.getElementById('carte-scene');
      const sceneRect = sceneEl ? sceneEl.getBoundingClientRect() : null;
      const offX = sceneRect ? Math.round(rect.left - sceneRect.left) : 0;
      const offY = sceneRect ? Math.round(rect.top  - sceneRect.top)  : 0;
      conteneur.style.position = 'absolute';
      conteneur.style.left   = offX + 'px';
      conteneur.style.top    = offY + 'px';
      conteneur.style.width  = rect.width  + 'px';
      conteneur.style.height = rect.height + 'px';
      conteneur.style.pointerEvents = 'none';

      tokensDD.forEach(tok => {
        const el = document.createElement('div');
        el.className = 'dd-token' + (tokenSelectionne === tok.id ? ' selectionne' : '');
        el.dataset.id = tok.id;
        el.style.pointerEvents = 'all';

        // Position en pixels depuis le coin haut-gauche de la scene (pas de l'image)
        const px = tok.cx * tc + tc/2;
        const py = tok.cy * tc + tc/2;
        el.style.left   = px + 'px';
        el.style.top    = py + 'px';
        el.style.width  = (tc * 0.85) + 'px';
        el.style.height = (tc * 0.85) + 'px';
        el.style.borderColor = tok.couleur;
        el.style.fontSize = Math.max(8, tc * 0.35) + 'px';
        el.textContent = tok.nom.charAt(0).toUpperCase();
        el.title = tok.nom;

        // Drag sur grille
        el.addEventListener('pointerdown', ev => demarrerDragDD(ev, tok, scene));
        // Sélection pour LoS
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          tokenSelectionne = tokenSelectionne === tok.id ? null : tok.id;
          rendreTokensDD(scene);
          calculerEtRendreLoS(scene);
        });

        conteneur.appendChild(el);
      });
    }

    // ── Drag tokens sur grille ───────────────────────────────
    let dragDD = null;
    function demarrerDragDD(ev, tok, scene) {
      ev.preventDefault();
      dragDD = { tok, scene };
      window.addEventListener('pointermove', surDragDD);
      window.addEventListener('pointerup', finDragDD);
    }
    function surDragDD(ev) {
      if (!dragDD) return;
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect) return;
      const { tok, scene } = dragDD;
      const tc = tailleCase(scene);
      const rx = ev.clientX - rect.left;
      const ry = ev.clientY - rect.top;
      tok.cx = Math.max(0, Math.min(scene.lc - 1, Math.floor(rx / tc)));
      tok.cy = Math.max(0, Math.min(scene.hc - 1, Math.floor(ry / tc)));
      rendreTokensDD(scene);
      calculerEtRendreLoS(scene);
    }
    function finDragDD() {
      dragDD = null;
      window.removeEventListener('pointermove', surDragDD);
      window.removeEventListener('pointerup', finDragDD);
    }

    // ── Ajouter un token dd2vtt ──────────────────────────────
    function ajouterTokenDD(scene) {
      const nom = prompt('Nom du token :', 'Aventurier');
      if (!nom) return;
      const couleurs = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];
      tokensDD.push({
        id: 'dd-' + Date.now(),
        nom: nom.trim(),
        cx: Math.floor(scene.lc / 2),
        cy: Math.floor(scene.hc / 2),
        couleur: couleurs[tokensDD.length % couleurs.length],
        pj: false
      });
      rendreTokensDD(scene);
      calculerEtRendreLoS(scene);
    }

    // Ajout programmatique d'un token (depuis "+ Mes personnages / + PNJ")
    function estActive() { return !!sceneActive && !!scenes[sceneActive]; }
    function ajouterTokenData(d) {
      if (!estActive()) return false;
      const scene = scenes[sceneActive];
      const couleurs = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];
      const n = tokensDD.length;
      tokensDD.push({
        id: 'dd-' + Date.now() + '-' + n,
        nom: (d && d.nom) ? d.nom : 'Jeton',
        cx: Math.max(0, Math.min(scene.lc - 1, Math.floor(scene.lc / 2) + (n % 4))),
        cy: Math.max(0, Math.min(scene.hc - 1, Math.floor(scene.hc / 2) + Math.floor(n / 4))),
        couleur: (d && d.couleur) ? d.couleur : couleurs[n % couleurs.length],
        pj: !!(d && d.pj)
      });
      rendreTokensDD(scene);
      calculerEtRendreLoS(scene);
      return true;
    }

    // ── Init brouillard persistant ───────────────────────────
    function reinitFog2(scene) {
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return;
      if (canvasFog2.width !== Math.round(rect.width) || canvasFog2.height !== Math.round(rect.height)) {
        canvasFog2.width  = Math.round(rect.width);
        canvasFog2.height = Math.round(rect.height);
        ctxFog2.fillStyle = 'rgba(0,0,0,0.92)';
        ctxFog2.fillRect(0, 0, canvasFog2.width, canvasFog2.height);
      }
    }

    // ── LoS + brouillard ─────────────────────────────────────
    function calculerEtRendreLoS(scene) {
      if (!canvasLoS || !ctxLoS) return;

      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return;

      const affW = Math.round(rect.width);
      const affH = Math.round(rect.height);
      const sx   = affW / scene.largeur;
      const sy   = affH / scene.hauteur;

      // Offset du canvas par rapport à carte-scene
      const sceneEl = document.getElementById('carte-scene');
      const sceneRect = sceneEl ? sceneEl.getBoundingClientRect() : null;
      const offX = sceneRect ? Math.round(rect.left - sceneRect.left) : 0;
      const offY = sceneRect ? Math.round(rect.top  - sceneRect.top)  : 0;

      // Redimensionner et repositionner le canvas LoS sur l'image exactement
      canvasLoS.width  = affW;
      canvasLoS.height = affH;
      canvasLoS.style.width  = affW + 'px';
      canvasLoS.style.height = affH + 'px';
      canvasLoS.style.left   = offX + 'px';
      canvasLoS.style.top    = offY + 'px';

      // Segments dans le référentiel du canvas (= référentiel image)
      const segsAff = scene.segments.map(seg => [
        [seg[0][0]*sx, seg[0][1]*sy],
        [seg[1][0]*sx, seg[1][1]*sy]
      ]);

      const tc = tailleCase(scene);

      // Remplir le brouillard opaque
      ctxLoS.clearRect(0, 0, affW, affH);
      ctxLoS.fillStyle = 'rgba(0,0,0,0.92)';
      ctxLoS.fillRect(0, 0, affW, affH);

      if (tokensDD.length === 0) return;

      for (const tok of tokensDD) {
        // Position dans le référentiel du canvas (= référentiel image)
        const posX = (tok.cx + 0.5) * tc;
        const posY = (tok.cy + 0.5) * tc;

        let poly;
        try {
          poly = VisibilityPolygon.compute([posX, posY], segsAff);
          console.log('[LoS] token', tok.nom, 'pos:', posX, posY, 'poly points:', poly ? poly.length : 0);
        } catch(e) { console.error('[LoS] erreur compute:', e); continue; }
        if (!poly || poly.length < 3) { console.warn('[LoS] polygone invalide'); continue; }

        // Révéler dans le brouillard persistant
        ctxFog2.globalCompositeOperation = 'destination-out';
        ctxFog2.beginPath();
        ctxFog2.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) ctxFog2.lineTo(poly[i][0], poly[i][1]);
        ctxFog2.closePath();
        ctxFog2.fill();
        ctxFog2.globalCompositeOperation = 'source-over';

        // Percer le fog actuel
        ctxLoS.globalCompositeOperation = 'destination-out';
        ctxLoS.beginPath();
        ctxLoS.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) ctxLoS.lineTo(poly[i][0], poly[i][1]);
        ctxLoS.closePath();
        ctxLoS.fill();
        ctxLoS.globalCompositeOperation = 'source-over';
      }

      // Superposer le brouillard persistant (zones explorées = semi-transparent)
      ctxLoS.globalAlpha = 0.45;
      ctxLoS.drawImage(canvasFog2, 0, 0);
      ctxLoS.globalAlpha = 1.0;
    }


    // ── API publique ─────────────────────────────────────────
    function init() {
      canvasMurs = document.getElementById('carte-murs');
      canvasLoS  = document.getElementById('carte-los');
      canvasFog2 = document.createElement('canvas'); // offscreen persistant

      if (!canvasMurs) return;
      ctxMurs = canvasMurs.getContext('2d');
      ctxLoS  = canvasLoS  ? canvasLoS.getContext('2d')  : null;
      ctxFog2 = canvasFog2.getContext('2d');

      // Style commun canvas overlay
      for (const cv of [canvasMurs, canvasLoS]) {
        if (!cv) continue;
        cv.style.display = 'none';
        cv.style.position = 'absolute';
        cv.style.top  = '0';
        cv.style.left = '0';
        cv.style.pointerEvents = 'none';
        cv.style.zIndex = '5';
      }

      // Clic sur la carte → désélectionner token
      const scene2 = document.getElementById('carte-scene');
      if (scene2) scene2.addEventListener('click', () => {
        if (tokenSelectionne) {
          tokenSelectionne = null;
          const sc = scenes[sceneActive];
          if (sc) { rendreTokensDD(sc); calculerEtRendreLoS(sc); }
        }
      });

      const inputDD = document.getElementById('input-dd2vtt');
      const btnDD   = document.getElementById('btn-import-dd2vtt');
      if (btnDD && inputDD) {
        btnDD.onclick = () => inputDD.click();
        inputDD.onchange = e => {
          if (e.target.files[0]) chargerFichier(e.target.files[0]);
          e.target.value = '';
        };
      }

      const btnTok = document.getElementById('btn-token-dd');
      if (btnTok) {
        btnTok.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const sc = scenes[sceneActive];
          if (sc) ajouterTokenDD(sc);
        });
      }
    }

    function activerModeBattlemap() {
      const cwm = document.getElementById('canvas-worldmap');
      if (cwm) cwm.style.display = 'none';
      document.querySelectorAll('.worldmap-ctrl').forEach(el => el.style.display = 'none');
    }

    function activerModeWorldmap() {
      // Réafficher les contrôles fog worldmap
      document.querySelectorAll('.worldmap-ctrl').forEach(el => el.style.display = '');
      // Cacher les éléments battlemap
      const btnTok = document.getElementById('btn-token-dd');
      if (btnTok) btnTok.style.display = 'none';
      const sel = document.getElementById('select-scene-dd2vtt');
      if (sel) sel.style.display = 'none';
      // Cacher canvas battlemap
      if (canvasMurs) canvasMurs.style.display = 'none';
      if (canvasLoS)  canvasLoS.style.display  = 'none';
      const tokensEl = document.getElementById('dd2vtt-tokens');
      if (tokensEl) tokensEl.innerHTML = '';
    }

    return { init, scenes: () => scenes, sceneActive: () => sceneActive, ajouterToken: (sc) => ajouterTokenDD(sc), modeWorldmap: activerModeWorldmap, estActive, ajouterTokenData };
  })();

  /* ============================================================
     Fin DD2VTT
     ============================================================ */

  document.addEventListener("DOMContentLoaded", () => { init(); Worldmap.init(); DD2VTT.init(); });

  return { onOpen, definirRole, definirMonPerso, ajouterMonstre };
})();