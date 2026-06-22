/* ============================================================
   Chroniques Oubliées Fantasy — Logique applicative
   Création de perso, fiche vivante, lanceur de dés, sauvegarde.
   ============================================================ */

const App = (() => {
  "use strict";

  const STORAGE_PERSOS = "cof_persos";
  const STORAGE_HISTO = "cof_histo_des";

  // État de création en cours
  let creation = null;       // objet personnage en cours de création
  let ficheActiveId = null;  // id du perso affiché dans "Ma fiche"

  /* ---------- Utilitaires ---------- */

  // Modificateur de caractéristique façon d20 : (val - 10) / 2 arrondi à l'inférieur
  function modCarac(valeur) {
    return Math.floor((Number(valeur) - 10) / 2);
  }
  function signe(n) { return (n >= 0 ? "+" + n : "" + n); }

  // Génère un id sans Date.now ni Math.random impur — basé sur compteur + contenu
  function genererId(nom) {
    const base = (nom || "perso").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
    const existants = chargerPersos();
    let i = 1, id;
    do { id = base + "-" + i; i++; } while (existants[id]);
    return id;
  }

  function maxDeDeVie(deStr) {
    const m = /1d(\d+)/.exec(deStr || "");
    return m ? parseInt(m[1], 10) : 6;
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2200);
  }

  /* ---------- Persistance ---------- */

  function chargerPersos() {
    try { return JSON.parse(localStorage.getItem(STORAGE_PERSOS)) || {}; }
    catch (e) { return {}; }
  }
  function sauverPersos(obj) {
    localStorage.setItem(STORAGE_PERSOS, JSON.stringify(obj));
  }

  /* ---------- Navigation onglets ---------- */

  function allerVers(panneau) {
    document.querySelectorAll("nav.tabs button").forEach((b) => {
      b.classList.toggle("actif", b.dataset.panneau === panneau);
    });
    document.querySelectorAll(".panneau").forEach((p) => {
      p.classList.toggle("actif", p.id === "panneau-" + panneau);
    });
    if (panneau === "fiche") rendreListePersos();
    if (panneau === "regles") rendreRegles();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ============================================================
     CRÉATION
     ============================================================ */

  function nouvelleCreation() {
    creation = {
      id: null,
      nom: "",
      niveau: 1,
      classe: null,
      caracs: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
      capacites: [], // [{voie, rang}]
      portrait: null, // data URL (optionnel)
      pvMax: null,
      pvActuel: null,
      def: null,
      inventaire: "",
      notes: "",
    };
  }

  function rendreGrilleClasses() {
    const grille = document.getElementById("grille-classes");
    grille.innerHTML = "";
    ORDRE_CLASSES.forEach((cle) => {
      const c = CLASSES[cle];
      const div = document.createElement("div");
      div.className = "classe-carte" + (creation.classe === cle ? " choisie" : "");
      div.innerHTML =
        `<div class="embleme-wrap">${embleme(cle, 72)}</div>` +
        `<h3>${c.nom_affiche}</h3>` +
        `<div class="dv">Dé de vie : ${c.de_de_vie}</div>` +
        `<p>${c.voies.length} voies · ${c.attaque.magique ? "Lanceur (" + c.attaque.magique + ")" : c.attaque.distance ? "Tireur" : "Combattant"}</p>`;
      div.onclick = () => choisirClasse(cle);
      grille.appendChild(div);
    });
  }

  function choisirClasse(cle) {
    if (creation.classe !== cle) {
      creation.classe = cle;
      creation.capacites = []; // on remet à zéro les capacités si on change de classe
    }
    rendreGrilleClasses();
    document.getElementById("bloc-caracs").style.display = "block";
    document.getElementById("bloc-voies").style.display = "block";
    document.getElementById("bloc-finition").style.display = "block";
    rendreCaracs();
    rendreVoies();
    recalculerDerives();
    majApercuPortrait();
  }

  /* ---------- Portrait ---------- */

  function chargerPortrait(file) {
    if (!file.type.startsWith("image/")) { toast("Choisis un fichier image."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
        else if (h > max) { w = Math.round((w * max) / h); h = max; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        creation.portrait = cv.toDataURL("image/jpeg", 0.82);
        majApercuPortrait();
        toast("Portrait ajouté ✔");
      };
      img.onerror = () => toast("Image illisible.");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function majApercuPortrait() {
    const ap = document.getElementById("portrait-apercu");
    const suppr = document.getElementById("btn-portrait-suppr");
    if (!ap) return;
    if (creation.portrait) {
      ap.innerHTML = `<img src="${creation.portrait}" alt="portrait" />`;
      if (suppr) suppr.style.display = "";
    } else {
      ap.innerHTML = creation.classe ? embleme(creation.classe, 70) : "—";
      if (suppr) suppr.style.display = "none";
    }
  }

  function rendreCaracs() {
    const grille = document.getElementById("grille-caracs");
    grille.innerHTML = "";
    CARACS.forEach((c) => {
      const val = creation.caracs[c.code];
      const div = document.createElement("div");
      div.className = "carac-bloc";
      div.innerHTML =
        `<div class="code">${c.code}</div>` +
        `<div class="nom">${c.nom}</div>` +
        `<input type="number" min="1" max="20" value="${val}" data-carac="${c.code}" />` +
        `<div class="mod" id="mod-${c.code}">Mod. ${signe(modCarac(val))}</div>`;
      grille.appendChild(div);
    });
    grille.querySelectorAll("input[data-carac]").forEach((inp) => {
      inp.oninput = () => {
        creation.caracs[inp.dataset.carac] = parseInt(inp.value, 10) || 0;
        document.getElementById("mod-" + inp.dataset.carac).textContent =
          "Mod. " + signe(modCarac(inp.value));
        recalculerDerives();
      };
    });
  }

  // Une capacité est-elle sélectionnée ?
  function estChoisie(voieNom, rang) {
    return creation.capacites.some((c) => c.voie === voieNom && c.rang === rang);
  }
  // Rang le plus haut pris dans une voie
  function rangMaxVoie(voieNom) {
    const rangs = creation.capacites.filter((c) => c.voie === voieNom).map((c) => c.rang);
    return rangs.length ? Math.max(...rangs) : 0;
  }
  // Nb de capacités de rang 1 prises
  function nbRang1() {
    return creation.capacites.filter((c) => c.rang === 1).length;
  }

  function rendreVoies() {
    const c = CLASSES[creation.classe];
    const aide = document.getElementById("aide-creation");
    aide.innerHTML =
      `<strong>Règles :</strong> au niveau 1, tu choisis <strong>2 capacités de rang 1</strong>. ` +
      `Les rangs supérieurs s'acquièrent dans l'ordre (pas de rang 3 sans 1 et 2). ` +
      `La <strong>Voie du chaos</strong> est optionnelle — uniquement avec l'accord du MJ.`;

    const zone = document.getElementById("zone-voies");
    zone.innerHTML = "";
    c.voies.forEach((voie) => {
      const divVoie = document.createElement("div");
      divVoie.className = "voie" + (voie.speciale ? " speciale" : "");
      let html =
        `<div class="voie-entete"><h4>${voie.nom}` +
        (voie.speciale ? `<span class="badge-chaos">CHAOS — accord MJ</span>` : "") +
        `</h4><div class="desc">${voie.description}</div></div>`;

      voie.rangs.forEach((r) => {
        const choisi = estChoisie(voie.nom, r.rang);
        // Verrou : pour cocher le rang N, il faut les rangs 1..N-1 dans cette voie
        const verrou = !choisi && r.rang > rangMaxVoie(voie.nom) + 1;
        html +=
          `<div class="rang ${choisi ? "choisi" : ""} ${verrou ? "verrou" : ""}">` +
          `<div class="num">${r.rang}</div>` +
          `<div class="contenu">` +
          (r.nom ? `<div class="nom-cap">${r.nom}</div>` : "") +
          `<div class="effet">${r.effet}</div></div>` +
          `<div class="check"><input type="checkbox" ${choisi ? "checked" : ""} ${verrou ? "disabled" : ""} ` +
          `data-voie="${encodeURIComponent(voie.nom)}" data-rang="${r.rang}" /></div>` +
          `</div>`;
      });
      divVoie.innerHTML = html;
      zone.appendChild(divVoie);
    });

    zone.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.onchange = () => basculerCapacite(decodeURIComponent(cb.dataset.voie), parseInt(cb.dataset.rang, 10));
    });
  }

  function basculerCapacite(voieNom, rang) {
    const idx = creation.capacites.findIndex((c) => c.voie === voieNom && c.rang === rang);
    if (idx >= 0) {
      // Décocher : interdit si un rang supérieur de la même voie est pris
      if (creation.capacites.some((c) => c.voie === voieNom && c.rang > rang)) {
        toast("Retire d'abord les rangs supérieurs de cette voie.");
        rendreVoies();
        return;
      }
      creation.capacites.splice(idx, 1);
    } else {
      creation.capacites.push({ voie: voieNom, rang: rang });
    }
    rendreVoies();
    recalculerDerives();
  }

  // Calcule PV / DEF suggérés (modifiables ensuite)
  function recalculerDerives() {
    const c = CLASSES[creation.classe];
    const modCON = modCarac(creation.caracs.CON);
    const modDEX = modCarac(creation.caracs.DEX);
    const niveau = parseInt(document.getElementById("champ-niveau").value, 10) || 1;
    // PV niveau 1 = max dé de vie + modCON ; +1 dé moyen par niveau supplémentaire
    const dv = maxDeDeVie(c.de_de_vie);
    let pv = dv + modCON;
    if (niveau > 1) pv += (niveau - 1) * (Math.ceil(dv / 2) + 1 + modCON);
    pv = Math.max(1, pv);

    const def = 10 + modDEX;

    const champPv = document.getElementById("champ-pvmax");
    const champDef = document.getElementById("champ-def");
    // On ne réécrase que si l'utilisateur n'a pas saisi manuellement
    if (!champPv.dataset.touche) champPv.value = pv;
    if (!champDef.dataset.touche) champDef.value = def;
  }

  function sauverPersonnage() {
    if (!creation.classe) { toast("Choisis d'abord une classe."); return; }
    const nom = document.getElementById("champ-nom").value.trim();
    if (!nom) { toast("Donne un nom à ton personnage."); return; }
    if (nbRang1() < 2) {
      if (!confirm("Tu as moins de 2 capacités de rang 1 (règle de création). Enregistrer quand même ?")) return;
    }

    creation.nom = nom;
    creation.niveau = parseInt(document.getElementById("champ-niveau").value, 10) || 1;
    creation.pvMax = parseInt(document.getElementById("champ-pvmax").value, 10) || 1;
    creation.def = parseInt(document.getElementById("champ-def").value, 10) || 10;
    creation.inventaire = document.getElementById("champ-inventaire").value;
    creation.notes = document.getElementById("champ-notes").value;
    if (creation.pvActuel === null || creation.pvActuel > creation.pvMax) creation.pvActuel = creation.pvMax;

    const persos = chargerPersos();
    if (!creation.id) creation.id = genererId(nom);
    persos[creation.id] = creation;
    sauverPersos(persos);
    ficheActiveId = creation.id;
    toast("Personnage enregistré ✔");
    allerVers("fiche");
    afficherFiche(creation.id);
  }

  function reinitialiserCreation() {
    nouvelleCreation();
    document.getElementById("champ-nom").value = "";
    document.getElementById("champ-niveau").value = 1;
    document.getElementById("champ-inventaire").value = "";
    document.getElementById("champ-notes").value = "";
    const pv = document.getElementById("champ-pvmax"), def = document.getElementById("champ-def");
    delete pv.dataset.touche; delete def.dataset.touche; pv.value = ""; def.value = "";
    document.getElementById("bloc-caracs").style.display = "none";
    document.getElementById("bloc-voies").style.display = "none";
    document.getElementById("bloc-finition").style.display = "none";
    majApercuPortrait();
    rendreGrilleClasses();
  }

  /* ============================================================
     FICHE VIVANTE
     ============================================================ */

  function rendreListePersos() {
    const persos = chargerPersos();
    const liste = document.getElementById("liste-persos");
    const ids = Object.keys(persos);
    if (!ids.length) {
      liste.innerHTML = `<div class="vide">Aucun personnage. Crée-en un dans l'onglet « Création ».</div>`;
      return;
    }
    liste.innerHTML = "";
    ids.forEach((id) => {
      const p = persos[id];
      const c = CLASSES[p.classe];
      const tuile = document.createElement("div");
      tuile.className = "perso-tuile";
      tuile.innerHTML =
        `<div class="tuile-tete">${avatarHtml(p, 48)}<div>` +
        `<h4>${p.nom}</h4>` +
        `<div class="info">${c ? c.nom_affiche : p.classe} · niveau ${p.niveau} · ${p.pvActuel}/${p.pvMax} PV</div>` +
        `</div></div>` +
        `<div class="barre-actions">` +
        `<button class="btn petit or" data-act="ouvrir" data-id="${id}">Ouvrir</button>` +
        `<button class="btn petit secondaire" data-act="exporter" data-id="${id}">Exporter</button>` +
        `<button class="btn petit danger" data-act="supprimer" data-id="${id}">Suppr.</button>` +
        `</div>`;
      liste.appendChild(tuile);
    });
    liste.querySelectorAll("button[data-act]").forEach((b) => {
      const id = b.dataset.id;
      if (b.dataset.act === "ouvrir") b.onclick = () => afficherFiche(id);
      if (b.dataset.act === "exporter") b.onclick = () => exporterPerso(id);
      if (b.dataset.act === "supprimer") b.onclick = () => supprimerPerso(id);
    });
  }

  function afficherFiche(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    ficheActiveId = id;
    const c = CLASSES[p.classe];
    const niveau = p.niveau;
    const mods = {};
    CARACS.forEach((cc) => (mods[cc.code] = modCarac(p.caracs[cc.code])));

    // Bonus d'attaque = niveau + mod approprié
    const attContact = niveau + mods.FOR;
    const attDistance = niveau + mods.DEX;
    const caracMag = CARAC_MAGIE[p.classe];
    const attMagique = caracMag ? niveau + mods[caracMag] : null;
    const init = mods.DEX;

    const zone = document.getElementById("zone-fiche-active");

    let capHtml = "";
    if (p.capacites.length) {
      // Regrouper par voie pour l'affichage
      p.capacites.slice().sort((a, b) => a.voie.localeCompare(b.voie) || a.rang - b.rang).forEach((cap) => {
        const voie = c.voies.find((v) => v.nom === cap.voie);
        const rang = voie && voie.rangs.find((r) => r.rang === cap.rang);
        if (!rang) return;
        capHtml +=
          `<div class="cap-fiche ${voie.speciale ? "chaos" : ""}">` +
          `<div class="titre-cap">${rang.nom || "Rang " + cap.rang}</div>` +
          `<div class="voie-source">${cap.voie} · rang ${cap.rang}</div>` +
          `<div class="effet-cap">${rang.effet}</div></div>`;
      });
    } else {
      capHtml = `<div class="vide">Aucune capacité sélectionnée.</div>`;
    }

    zone.innerHTML = `
      <div class="carte">
        <div class="entete-fiche">
          <div class="tete-gauche">
            ${avatarHtml(p, 76)}
            <div>
              <div class="nom-perso">${p.nom}</div>
              <div class="meta">${c.nom_affiche} · niveau ${niveau} · Dé de vie ${c.de_de_vie}</div>
            </div>
          </div>
          <div class="barre-actions">
            <button class="btn petit secondaire" id="btn-editer-fiche">✎ Modifier</button>
            <button class="btn petit secondaire" id="btn-exporter-fiche">Exporter</button>
          </div>
        </div>

        <div class="stats-rapides">
          <div class="stat-box">
            <div class="label">Points de vie</div>
            <div class="pv-control">
              <button id="pv-moins">−</button>
              <input type="number" id="pv-actuel" value="${p.pvActuel}" />
              <span style="font-weight:700;">/ ${p.pvMax}</span>
              <button id="pv-plus">+</button>
            </div>
            <div class="barre-pv"><div class="rempli" id="barre-pv-rempli"></div></div>
          </div>
          <div class="stat-box"><div class="label">DEF</div><div class="valeur">${p.def}</div></div>
          <div class="stat-box"><div class="label">Initiative</div><div class="valeur">${signe(init)}</div></div>
        </div>

        <div class="stats-rapides">
          ${CARACS.map((cc) =>
            `<div class="stat-box" style="cursor:pointer;" data-test="${cc.code}" title="Lancer un test de ${cc.nom}">
              <div class="label">${cc.code}</div>
              <div class="valeur">${signe(mods[cc.code])}</div>
              <div style="font-size:0.65rem;opacity:0.7;">val. ${p.caracs[cc.code]} · 🎲 test</div>
            </div>`).join("")}
        </div>

        <h3>Attaques rapides</h3>
        <div class="barre-actions">
          <button class="btn" data-attaque="contact" data-bonus="${attContact}">⚔️ Contact (${signe(attContact)})</button>
          <button class="btn" data-attaque="distance" data-bonus="${attDistance}">🏹 Distance (${signe(attDistance)})</button>
          ${attMagique !== null ? `<button class="btn" data-attaque="magique" data-bonus="${attMagique}">✨ Magique (${signe(attMagique)})</button>` : ""}
        </div>
        <p style="font-size:0.75rem;color:#8a8296;margin-top:6px;">Bonus d'attaque = niveau + modificateur. Ajuste selon tes voies (ex. +1 Tir ajusté) au moment du jet via l'onglet Dés si besoin.</p>
      </div>

      <div class="carte">
        <h3>Capacités</h3>
        ${capHtml}
      </div>

      ${p.inventaire ? `<div class="carte"><h3>Équipement</h3><div style="white-space:pre-wrap;font-size:0.9rem;">${echapper(p.inventaire)}</div></div>` : ""}
      ${p.notes ? `<div class="carte"><h3>Notes</h3><div style="white-space:pre-wrap;font-size:0.9rem;">${echapper(p.notes)}</div></div>` : ""}
    `;

    majBarrePv(p);

    // Boutons PV
    document.getElementById("pv-plus").onclick = () => ajusterPv(id, +1);
    document.getElementById("pv-moins").onclick = () => ajusterPv(id, -1);
    document.getElementById("pv-actuel").onchange = (e) => definirPv(id, parseInt(e.target.value, 10));
    // Tests de carac
    zone.querySelectorAll("[data-test]").forEach((el) => {
      el.onclick = () => {
        const code = el.dataset.test;
        lancerTest(`Test de ${code}`, mods[code]);
        allerVers("des");
      };
    });
    // Attaques
    zone.querySelectorAll("[data-attaque]").forEach((el) => {
      el.onclick = () => {
        const bonus = parseInt(el.dataset.bonus, 10);
        lancerTest(`Attaque ${el.dataset.attaque}`, bonus);
        allerVers("des");
      };
    });
    document.getElementById("btn-editer-fiche").onclick = () => editerPerso(id);
    document.getElementById("btn-exporter-fiche").onclick = () => exporterPerso(id);
  }

  function echapper(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function majBarrePv(p) {
    const pct = Math.max(0, Math.min(100, (p.pvActuel / p.pvMax) * 100));
    const el = document.getElementById("barre-pv-rempli");
    if (el) el.style.width = pct + "%";
  }
  function ajusterPv(id, delta) {
    const persos = chargerPersos();
    const p = persos[id];
    p.pvActuel = Math.max(0, p.pvActuel + delta);
    sauverPersos(persos);
    document.getElementById("pv-actuel").value = p.pvActuel;
    majBarrePv(p);
  }
  function definirPv(id, val) {
    const persos = chargerPersos();
    const p = persos[id];
    p.pvActuel = isNaN(val) ? p.pvActuel : Math.max(0, val);
    sauverPersos(persos);
    document.getElementById("pv-actuel").value = p.pvActuel;
    majBarrePv(p);
  }

  function editerPerso(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    creation = JSON.parse(JSON.stringify(p)); // copie
    allerVers("creation");
    document.getElementById("champ-nom").value = p.nom;
    document.getElementById("champ-niveau").value = p.niveau;
    document.getElementById("champ-inventaire").value = p.inventaire || "";
    document.getElementById("champ-notes").value = p.notes || "";
    const champPv = document.getElementById("champ-pvmax"), champDef = document.getElementById("champ-def");
    champPv.value = p.pvMax; champPv.dataset.touche = "1";
    champDef.value = p.def; champDef.dataset.touche = "1";
    choisirClasse(p.classe);
    rendreGrilleClasses();
    rendreCaracs();
    rendreVoies();
  }

  function supprimerPerso(id) {
    const persos = chargerPersos();
    if (!persos[id]) return;
    if (!confirm(`Supprimer définitivement « ${persos[id].nom} » ?`)) return;
    delete persos[id];
    sauverPersos(persos);
    if (ficheActiveId === id) {
      ficheActiveId = null;
      document.getElementById("zone-fiche-active").innerHTML = "";
    }
    rendreListePersos();
    toast("Personnage supprimé.");
  }

  /* ---------- Export / Import ---------- */

  function exporterPerso(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cof-" + id + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Fiche exportée — partage le fichier sur Discord.");
  }

  function importerPerso(fichier) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const p = JSON.parse(e.target.result);
        if (!p.classe || !CLASSES[p.classe]) throw new Error("Format invalide");
        const persos = chargerPersos();
        if (!p.id || persos[p.id]) p.id = genererId(p.nom || "import");
        persos[p.id] = p;
        sauverPersos(persos);
        rendreListePersos();
        toast(`« ${p.nom} » importé ✔`);
      } catch (err) {
        toast("Fichier invalide.");
      }
    };
    reader.readAsText(fichier);
  }

  /* ============================================================
     LANCEUR DE DÉS
     ============================================================ */

  function lancerDe(faces) {
    // RNG : crypto si dispo, sinon Math.random (côté navigateur, OK ici)
    let r;
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      r = buf[0] / 4294967296;
    } else {
      r = Math.random();
    }
    return Math.floor(r * faces) + 1;
  }

  function modeD20() {
    const el = document.querySelector('input[name="mode-d20"]:checked');
    return el ? el.value : "normal";
  }

  // Test = 1d20 + bonus, gère avantage/désavantage
  function lancerTest(label, bonus) {
    bonus = bonus || 0;
    const mode = modeD20();
    let d1 = lancerDe(20), d2 = lancerDe(20), de, detailDes;
    if (mode === "avantage") { de = Math.max(d1, d2); detailDes = `2d20 av. [${d1}, ${d2}] → ${de}`; }
    else if (mode === "desavantage") { de = Math.min(d1, d2); detailDes = `2d20 dés. [${d1}, ${d2}] → ${de}`; }
    else { de = d1; detailDes = `d20 → ${de}`; }
    const total = de + bonus;
    const crit = (de === 20), echec = (de === 1);
    afficherResultat(label, total, `${detailDes} ${signe(bonus)}`, crit, echec);
    ajouterHisto(label + " " + signe(bonus), total, crit, echec);
  }

  function lancerDeSimple(faces) {
    const v = lancerDe(faces);
    const crit = (faces === 20 && v === 20), echec = (faces === 20 && v === 1);
    afficherResultat(`d${faces}`, v, `1d${faces}`, crit, echec);
    ajouterHisto(`d${faces}`, v, crit, echec);
  }

  // Parse une formule type "2d6+3" ou "1d20-1" ou "3d8"
  function lancerFormule(formule) {
    formule = (formule || "").trim().toLowerCase().replace(/\s/g, "");
    if (!formule) { toast("Entre une formule, ex. 2d6+3"); return; }
    const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(formule);
    if (!m) { toast("Formule invalide. Ex : 2d6+3, 1d20-1"); return; }
    const nb = parseInt(m[1] || "1", 10);
    const faces = parseInt(m[2], 10);
    const bonus = parseInt(m[3] || "0", 10);
    if (nb < 1 || nb > 50 || faces < 2 || faces > 1000) { toast("Valeurs hors limites."); return; }
    const jets = [];
    let somme = 0;
    for (let i = 0; i < nb; i++) { const v = lancerDe(faces); jets.push(v); somme += v; }
    const total = somme + bonus;
    let crit = false, echec = false;
    if (nb === 1 && faces === 20) { crit = (jets[0] === 20); echec = (jets[0] === 1); }
    afficherResultat(formule, total, `[${jets.join(", ")}] ${bonus ? signe(bonus) : ""}`, crit, echec);
    ajouterHisto(formule, total, crit, echec);
  }

  function afficherResultat(label, total, detail, crit, echec) {
    const z = document.getElementById("zone-resultat");
    z.className = crit ? "crit" : echec ? "echec" : "";
    z.innerHTML =
      `<div class="label-jet">${label}${crit ? " — CRITIQUE ! 🎉" : echec ? " — Échec critique 💀" : ""}</div>` +
      `<div class="total">${total}</div>` +
      `<div class="detail">${detail}</div>`;
  }

  function chargerHisto() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HISTO)) || []; }
    catch (e) { return []; }
  }
  function ajouterHisto(label, total, crit, echec) {
    const h = chargerHisto();
    h.unshift({ label, total, crit, echec });
    if (h.length > 40) h.pop();
    localStorage.setItem(STORAGE_HISTO, JSON.stringify(h));
    rendreHisto();
  }
  function rendreHisto() {
    const h = chargerHisto();
    const zone = document.getElementById("historique");
    if (!h.length) { zone.innerHTML = `<div class="vide">Aucun lancer pour l'instant.</div>`; return; }
    zone.innerHTML = h.map((x) =>
      `<div class="ligne-histo"><span>${echapper(x.label)}</span>` +
      `<span class="res ${x.crit ? "crit" : x.echec ? "echec" : ""}">${x.total}</span></div>`).join("");
  }
  function viderHisto() {
    localStorage.removeItem(STORAGE_HISTO);
    rendreHisto();
  }

  /* ============================================================
     RÈGLES (référence)
     ============================================================ */

  function rendreRegles() {
    const select = document.getElementById("select-regles-classe");
    if (!select.options.length) {
      ORDRE_CLASSES.forEach((cle) => {
        const opt = document.createElement("option");
        opt.value = cle; opt.textContent = CLASSES[cle].nom_affiche;
        select.appendChild(opt);
      });
      select.onchange = () => afficherReglesClasse(select.value);
    }
    afficherReglesClasse(select.value || ORDRE_CLASSES[0]);
  }

  function afficherReglesClasse(cle) {
    const c = CLASSES[cle];
    const zone = document.getElementById("zone-regles");
    let html = `<div class="carte">
      <h2 class="titre-bandeau">${c.nom_affiche}</h2>
      <div class="grille grille-2">
        <div><strong>Dé de vie :</strong> ${c.de_de_vie}</div>
        <div><strong>Attaque :</strong> ${[c.attaque.contact && "Contact (" + c.attaque.contact + ")", c.attaque.distance && "Distance (" + c.attaque.distance + ")", c.attaque.magique && "Magique (" + c.attaque.magique + ")"].filter(Boolean).join(" · ")}</div>
        <div><strong>Armes :</strong> ${c.armes}</div>
        <div><strong>Armures :</strong> ${c.armures}</div>
      </div>
      ${c.notes_generales ? `<p style="font-size:0.82rem;color:#6a6278;margin-top:10px;"><em>${c.notes_generales}</em></p>` : ""}
    </div>`;

    c.voies.forEach((voie) => {
      html += `<div class="voie ${voie.speciale ? "speciale" : ""}">
        <div class="voie-entete"><h4>${voie.nom}${voie.speciale ? `<span class="badge-chaos">CHAOS</span>` : ""}</h4>
        <div class="desc">${voie.description}</div></div>`;
      voie.rangs.forEach((r) => {
        html += `<div class="rang"><div class="num">${r.rang}</div><div class="contenu">` +
          (r.nom ? `<div class="nom-cap">${r.nom}</div>` : "") +
          `<div class="effet">${r.effet}</div></div></div>`;
      });
      html += `</div>`;
    });

    html = `<div>${html}</div>`;
    // On insère les voies dans une carte conteneur
    zone.innerHTML = html;
  }

  /* ============================================================
     LORE
     ============================================================ */

  function rendreLore() {
    const zone = document.getElementById("zone-lore");
    let html = `<h2 class="titre-bandeau">${LORE.titre}</h2>`;
    if (LORE.intro) html += `<p style="font-style:italic;color:#6a6278;">${LORE.intro}</p>`;
    LORE.sections.forEach((s) => {
      html += `<div class="lore-section"><h3>${s.titre}</h3><div class="contenu">${echapper(s.contenu)}</div></div>`;
    });
    zone.innerHTML = html;
  }

  /* ============================================================
     INITIALISATION
     ============================================================ */

  function init() {
    nouvelleCreation();
    rendreGrilleClasses();
    rendreHisto();
    rendreLore();

    // Onglets
    document.querySelectorAll("nav.tabs button").forEach((b) => {
      b.onclick = () => allerVers(b.dataset.panneau);
    });

    // Création
    document.getElementById("champ-niveau").oninput = recalculerDerives;
    document.getElementById("champ-pvmax").oninput = (e) => { e.target.dataset.touche = "1"; };
    document.getElementById("champ-def").oninput = (e) => { e.target.dataset.touche = "1"; };
    document.getElementById("btn-sauver").onclick = sauverPersonnage;
    document.getElementById("btn-reset").onclick = reinitialiserCreation;

    // Portrait
    document.getElementById("btn-portrait").onclick = () => document.getElementById("input-portrait").click();
    document.getElementById("input-portrait").onchange = (e) => {
      if (e.target.files[0]) chargerPortrait(e.target.files[0]);
      e.target.value = "";
    };
    document.getElementById("btn-portrait-suppr").onclick = () => { creation.portrait = null; majApercuPortrait(); };

    // Dés
    document.querySelectorAll(".de-btn").forEach((b) => {
      b.onclick = () => lancerDeSimple(parseInt(b.dataset.de, 10));
    });
    document.getElementById("btn-lancer-formule").onclick = () =>
      lancerFormule(document.getElementById("champ-formule").value);
    document.getElementById("champ-formule").addEventListener("keydown", (e) => {
      if (e.key === "Enter") lancerFormule(e.target.value);
    });
    document.getElementById("btn-vider-histo").onclick = viderHisto;

    // Fiche : import
    document.getElementById("btn-importer").onclick = () => document.getElementById("input-import").click();
    document.getElementById("input-import").onchange = (e) => {
      if (e.target.files[0]) importerPerso(e.target.files[0]);
      e.target.value = "";
    };

    rendreListePersos();
  }

  document.addEventListener("DOMContentLoaded", init);

  // API publique (utilisée par les onclick inline)
  return { allerVers };
})();
