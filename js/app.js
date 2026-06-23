/* ============================================================
   Chroniques Oubliées Fantasy — Logique applicative
   Création de perso, fiche vivante, lanceur de dés, sauvegarde.
   ============================================================ */

const App = (() => {
  "use strict";

  const STORAGE_PERSOS = "cof_persos";
  const STORAGE_HISTO = "cof_histo_des";
  const STORAGE_ROLE = "cof_role";
  const STORAGE_MON_PERSO = "cof_mon_perso_actif";

  // État de création en cours
  let creation = null;       // objet personnage en cours de création
  let ficheActiveId = null;  // id du perso affiché dans "Ma fiche"
  let role = null;           // "joueur" | "mj" | null (pas encore choisi)

  /* ---------- Utilitaires ---------- */

  // Modificateur de caractéristique façon d20 : (val - 10) / 2 arrondi à l'inférieur
  function modCarac(valeur) {
    return Math.floor((Number(valeur) - 10) / 2);
  }
  function signe(n) { return (n >= 0 ? "+" + n : "" + n); }

  // Bonus d'attaque (jet uniquement) selon l'archétype de la classe : martial +1/niv,
  // hybride +1 tous les 2 niv, lanceur +1 tous les 3 niv.
  function bonusAttaqueProgression(classe, niveau) {
    const archetype = ARCHETYPE_CLASSE[classe] || "martial";
    const diviseur = DIVISEUR_ATTAQUE[archetype] || 1;
    return Math.floor(niveau / diviseur);
  }

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

  /* ---------- Rôle Joueur / MJ ---------- */

  function definirRole(r) {
    role = r;
    localStorage.setItem(STORAGE_ROLE, r);
    appliquerRole();
    allerVers("accueil");
  }

  function changerDeRole() {
    role = null;
    localStorage.removeItem(STORAGE_ROLE);
    appliquerRole();
    allerVers("accueil");
  }

  function appliquerRole() {
    document.body.classList.toggle("role-joueur", role === "joueur");
    document.body.classList.toggle("role-mj", role === "mj");

    const nav = document.getElementById("onglets");
    const choixRole = document.getElementById("choix-role");
    const accueilContenu = document.getElementById("accueil-contenu");

    if (role) {
      if (nav) nav.style.display = "";
      if (choixRole) choixRole.style.display = "none";
      if (accueilContenu) accueilContenu.style.display = "block";

      const estMj = role === "mj";
      const labelRole = document.getElementById("role-actuel-label");
      if (labelRole) labelRole.textContent = estMj ? "Maître du Jeu" : "Joueur";
      const ongletFiche = document.getElementById("onglet-fiche");
      if (ongletFiche) ongletFiche.textContent = estMj ? "Aventuriers" : "Ma fiche";
      const titreFiche = document.getElementById("titre-fiche");
      if (titreFiche) titreFiche.textContent = estMj ? "Aventuriers" : "Mes personnages";
      const labelLiFiche = document.getElementById("label-li-fiche");
      if (labelLiFiche) labelLiFiche.textContent = estMj ? "Aventuriers" : "Ma fiche";
      const titreCarte = document.getElementById("titre-carte");
      if (titreCarte) titreCarte.textContent = estMj ? "Carte — mode MJ" : "Carte";

      if (typeof Carte !== "undefined") Carte.definirRole(role);
    } else {
      if (nav) nav.style.display = "none";
      if (choixRole) choixRole.style.display = "block";
      if (accueilContenu) accueilContenu.style.display = "none";
    }
  }

  function rendreSelecteurMonPerso() {
    const sel = document.getElementById("select-mon-perso");
    if (!sel) return;
    const persos = chargerPersos();
    const ids = Object.keys(persos);
    sel.innerHTML = ids.length
      ? ids.map((id) => `<option value="${id}">${persos[id].nom}</option>`).join("")
      : `<option value="">Aucun personnage</option>`;
    const sauvegarde = localStorage.getItem(STORAGE_MON_PERSO);
    const actif = ids.includes(sauvegarde) ? sauvegarde : (ids.includes(ficheActiveId) ? ficheActiveId : ids[0]);
    if (actif) sel.value = actif;
    if (typeof Carte !== "undefined") Carte.definirMonPerso(actif || null);
    sel.onchange = () => {
      localStorage.setItem(STORAGE_MON_PERSO, sel.value);
      if (typeof Carte !== "undefined") Carte.definirMonPerso(sel.value);
    };
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
    if (panneau === "carte" && typeof Carte !== "undefined") {
      Carte.onOpen();
      if (role === "joueur") rendreSelecteurMonPerso();
    }
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
      race: null,
      raceVariante: null, // nation elfique (aetharion / aelindra / mordanel), si race = elfe
      caracs: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
      caracsLibres: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, // points libres répartis (point-buy)
      capacites: [], // [{voie, rang}]
      capacitesRace: [], // [rang] — capacités de la voie raciale (gratuite)
      voiesHorsProfil: [], // [{classe, voie, cout}] — voies débloquées hors du profil de classe
      portrait: null, // data URL (optionnel)
      pvMax: null,
      pvActuel: null,
      pvHistorique: [], // [{niveau, faces, jet, modCON, total}] — jets de PV par niveau
      pvNiveauActuel: 1, // dernier niveau dont les PV ont été tirés
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

  function rendreGrilleRaces() {
    const grille = document.getElementById("grille-races");
    grille.innerHTML = "";
    ORDRE_RACES.forEach((cle) => {
      const r = RACES[cle];
      const div = document.createElement("div");
      div.className = "classe-carte" + (creation.race === cle ? " choisie" : "");
      div.innerHTML =
        `<h3>${r.nom_affiche}</h3>` +
        `<div class="dv">${r.voie_nom}</div>` +
        `<p>${r.description}</p>`;
      div.onclick = () => choisirRace(cle);
      grille.appendChild(div);
    });
  }

  function choisirRace(cle) {
    if (creation.race !== cle) {
      creation.race = cle;
      creation.raceVariante = null;
      creation.capacitesRace = [1]; // le rang 1 de la voie raciale est acquis automatiquement
    }
    rendreGrilleRaces();
    document.getElementById("bloc-voie-raciale").style.display = "block";
    rendreVoieRaciale();
  }

  /* ---------- Voie raciale (gratuite, séparée des voies de classe) ---------- */

  function rangMaxRace() {
    return creation.capacitesRace.length ? Math.max(...creation.capacitesRace) : 0;
  }

  function niveauCreation() {
    return parseInt(document.getElementById("champ-niveau").value, 10) || 1;
  }

  // Résout le nom/effet d'un rang de voie raciale, en tenant compte de la variante (nation elfique au rang 3)
  function texteRangRace(r, rg, variante) {
    if (r.variantes && rg.rang === 3 && variante) {
      const v = r.variantes.find((vv) => vv.code === variante);
      if (v) return { nom: v.nom_capacite, effet: v.effet };
    }
    return { nom: rg.nom, effet: rg.effet };
  }

  function rendreVoieRaciale() {
    if (!creation.race) return;
    const r = RACES[creation.race];
    const niveau = niveauCreation();
    const rangMax = rangMaxRace();

    const aide = document.getElementById("aide-race");
    aide.innerHTML =
      `<strong>Voie raciale gratuite</strong> — ne consomme pas tes points de capacité de classe. ` +
      `Le <strong>rang 1 est acquis automatiquement</strong>. ` +
      `Les rangs 2 à 5 s'acquièrent dans l'ordre (impossible de prendre le rang 3 sans 2) et restent ` +
      (niveau <= 1
        ? `<strong>verrouillés tant que le personnage est niveau 1</strong>.`
        : `accessibles à partir du niveau 2.`);

    const zone = document.getElementById("zone-voie-raciale");
    zone.innerHTML = "";
    const divVoie = document.createElement("div");
    divVoie.className = "voie";
    let html = `<div class="voie-entete"><h4>${r.voie_nom}</h4><div class="desc">${r.description}</div></div>`;

    if (r.trait_passif) {
      html += `<div class="aide"><em>Trait racial passif :</em> ${r.trait_passif}</div>`;
    }

    if (r.variantes) {
      html += `<div class="aide"><strong>Nation elfique</strong> (détermine l'effet du rang 3 — Héritage National) :</div>`;
      html += `<div class="options-de">`;
      r.variantes.forEach((v) => {
        html += `<label><input type="radio" name="race-variante" value="${v.code}" ${creation.raceVariante === v.code ? "checked" : ""} /> ${v.nom_affiche}</label>`;
      });
      html += `</div>`;
    }

    r.rangs.forEach((rg) => {
      const auto = rg.rang === 1; // rang 1 : acquis automatiquement, gratuit
      const choisi = auto || creation.capacitesRace.includes(rg.rang);
      const verrouOrdre = !choisi && rg.rang > rangMax + 1;
      const verrouNiveau = !choisi && !auto && niveau <= 1;
      const verrou = verrouOrdre || verrouNiveau;

      const { nom, effet } = texteRangRace(r, rg, creation.raceVariante);

      html +=
        `<div class="rang ${choisi ? "choisi" : ""} ${verrou ? "verrou" : ""}">` +
        `<div class="num">${rg.rang}</div>` +
        `<div class="contenu">` +
        (nom ? `<div class="nom-cap">${nom}</div>` : "") +
        `<div class="effet">${effet}</div></div>` +
        `<div class="check">` +
        (auto
          ? `<span class="badge-auto">Automatique</span>`
          : `<input type="checkbox" ${choisi ? "checked" : ""} ${verrou ? "disabled" : ""} data-rang="${rg.rang}" />`) +
        `</div>` +
        `</div>`;
    });
    divVoie.innerHTML = html;
    zone.appendChild(divVoie);

    zone.querySelectorAll('input[name="race-variante"]').forEach((rb) => {
      rb.onchange = () => { creation.raceVariante = rb.value; rendreVoieRaciale(); };
    });
    zone.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.onchange = () => basculerCapaciteRace(parseInt(cb.dataset.rang, 10));
    });
  }

  function basculerCapaciteRace(rang) {
    const r = RACES[creation.race];
    if (r.variantes && rang === 3 && !creation.raceVariante) {
      toast("Choisis d'abord la nation elfique.");
      rendreVoieRaciale();
      return;
    }
    const idx = creation.capacitesRace.indexOf(rang);
    if (idx >= 0) {
      if (creation.capacitesRace.some((x) => x > rang)) {
        toast("Retire d'abord les rangs supérieurs de la voie raciale.");
        rendreVoieRaciale();
        return;
      }
      creation.capacitesRace.splice(idx, 1);
    } else {
      creation.capacitesRace.push(rang);
    }
    rendreVoieRaciale();
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

  /* ---------- Caractéristiques (point-buy : base 10 + bonus de classe + points libres) ---------- */

  const CARACS_BASE = 10;
  const CARACS_LIBRES_TOTAL = 6;
  const CARACS_LIBRES_MAX_PAR_STAT = 3;
  const CARACS_MIN = 8;
  const CARACS_MAX = 18;

  function bonusClasseCarac(code) {
    const b = creation.classe && CLASS_BONUS_CARACS[creation.classe];
    if (!b) return 0;
    if (b.plus2 === code) return 2;
    if (b.plus1 === code) return 1;
    return 0;
  }
  function libresUtilises() {
    return CARACS.reduce((s, c) => s + (creation.caracsLibres[c.code] || 0), 0);
  }
  function libresRestants() {
    return Math.max(0, CARACS_LIBRES_TOTAL - libresUtilises());
  }
  function peutAugmenterCarac(code) {
    const val = CARACS_BASE + bonusClasseCarac(code) + (creation.caracsLibres[code] || 0);
    return libresRestants() > 0 && val < CARACS_MAX && (creation.caracsLibres[code] || 0) < CARACS_LIBRES_MAX_PAR_STAT;
  }
  function peutDiminuerCarac(code) {
    const val = CARACS_BASE + bonusClasseCarac(code) + (creation.caracsLibres[code] || 0);
    return (creation.caracsLibres[code] || 0) > 0 && val > CARACS_MIN;
  }
  function ajusterCaracLibre(code, delta) {
    if (delta > 0 && !peutAugmenterCarac(code)) return;
    if (delta < 0 && !peutDiminuerCarac(code)) return;
    creation.caracsLibres[code] += delta;
    rendreCaracs();
    recalculerDerives();
  }
  function reinitialiserCaracsLibres() {
    CARACS.forEach((c) => { creation.caracsLibres[c.code] = 0; });
    rendreCaracs();
    recalculerDerives();
  }
  function recalcCaracsDepuisPool() {
    CARACS.forEach((c) => {
      creation.caracs[c.code] = CARACS_BASE + bonusClasseCarac(c.code) + (creation.caracsLibres[c.code] || 0);
    });
  }

  function rendreCaracs() {
    recalcCaracsDepuisPool();

    const bonusBar = document.getElementById("bonus-bar-caracs");
    if (bonusBar) {
      const b = creation.classe && CLASS_BONUS_CARACS[creation.classe];
      bonusBar.innerHTML = b
        ? `<span class="badge-bonus2">${b.plus2} +2</span><span class="badge-bonus1">${b.plus1} +1</span>`
        : "";
    }

    const pool = document.getElementById("pool-caracs");
    if (pool) {
      pool.textContent = `Points libres : ${libresRestants()}/${CARACS_LIBRES_TOTAL}`;
      pool.classList.toggle("epuise", libresRestants() === 0);
    }

    const grille = document.getElementById("grille-caracs");
    grille.innerHTML = "";
    CARACS.forEach((c) => {
      const bonus = bonusClasseCarac(c.code);
      const libre = creation.caracsLibres[c.code] || 0;
      const val = creation.caracs[c.code];

      let cls = "carac-bloc";
      if (bonus > 0) cls += " a-bonus";
      if (libre > 0) cls += " a-libre";

      let bk = `<span class="bk-base">Base ${CARACS_BASE}</span>`;
      if (bonus > 0) bk += `<span class="bk-classe"> +${bonus} classe</span>`;
      if (libre > 0) bk += `<span class="bk-libre"> +${libre} libre</span>`;

      const div = document.createElement("div");
      div.className = cls;
      div.innerHTML =
        `<div class="code">${c.code}</div>` +
        `<div class="nom">${c.nom}</div>` +
        `<div class="valeur-ligne">` +
        `<button type="button" class="carac-btn" data-carac="${c.code}" data-delta="-1" ${!peutDiminuerCarac(c.code) ? "disabled" : ""}>−</button>` +
        `<div class="valeur">${val}</div>` +
        `<button type="button" class="carac-btn" data-carac="${c.code}" data-delta="1" ${!peutAugmenterCarac(c.code) ? "disabled" : ""}>+</button>` +
        `</div>` +
        `<div class="mod" id="mod-${c.code}">Mod. ${signe(modCarac(val))}</div>` +
        `<div class="carac-breakdown">${bk}</div>`;
      grille.appendChild(div);
    });

    grille.querySelectorAll(".carac-btn").forEach((btn) => {
      btn.onclick = () => ajusterCaracLibre(btn.dataset.carac, parseInt(btn.dataset.delta, 10));
    });

    const btnResetLibres = document.getElementById("btn-reset-libres");
    if (btnResetLibres) btnResetLibres.onclick = reinitialiserCaracsLibres;

    rendrePv();
  }

  /* ---------- Points de Vie (création) : auto au niveau 1, jet de dé pour les niveaux suivants ---------- */

  function deDeVieFaces() {
    return creation.classe ? maxDeDeVie(CLASSES[creation.classe].de_de_vie) : 6;
  }
  function pvBaseNiveau1() {
    return Math.max(1, deDeVieFaces() + modCarac(creation.caracs.CON));
  }
  function pvTotalActuel() {
    return creation.pvHistorique.reduce((total, j) => total + j.total, pvBaseNiveau1());
  }

  function rendrePv() {
    const zone = document.getElementById("zone-pv");
    if (!zone || !creation.classe) return;

    const faces = deDeVieFaces();
    const niveauCible = niveauCreation();
    const peutJeter = creation.pvNiveauActuel < niveauCible;

    let html =
      `<div class="pv-resume">` +
      `<div class="pv-case"><div class="label">Dé de vie</div><div class="val">1d${faces}</div></div>` +
      `<div class="pv-case"><div class="label">PV niveau 1 (auto)</div><div class="val">${pvBaseNiveau1()}</div></div>` +
      `<div class="pv-case"><div class="label">Niveau atteint</div><div class="val">${creation.pvNiveauActuel}</div></div>` +
      `<div class="pv-case"><div class="label">PV total</div><div class="val">${pvTotalActuel()}</div></div>` +
      `</div>`;

    html += `<div class="pv-historique">`;
    if (!creation.pvHistorique.length) {
      html += `<div class="pv-vide">Aucun jet de niveau pour l'instant.</div>`;
    } else {
      creation.pvHistorique.forEach((j) => {
        html += `<div class="pv-ligne">Niv.${j.niveau} : jet d${j.faces} → ${j.jet} ${signe(j.modCON)} = ${j.total} PV</div>`;
      });
    }
    html += `</div>`;

    html +=
      `<div class="barre-actions">` +
      `<button type="button" class="btn or petit" id="btn-jet-niveau" ${!peutJeter ? "disabled" : ""}>🎲 Jet de niveau</button>` +
      `<button type="button" class="btn secondaire petit" id="btn-reset-niveaux-pv">↺ Réinitialiser les niveaux</button>` +
      `</div>`;

    zone.innerHTML = html;

    const btnJet = document.getElementById("btn-jet-niveau");
    if (btnJet) btnJet.onclick = jetNiveauPv;
    document.getElementById("btn-reset-niveaux-pv").onclick = reinitialiserNiveauxPv;
  }

  function jetNiveauPv() {
    const niveauCible = niveauCreation();
    if (creation.pvNiveauActuel >= niveauCible) {
      toast("Augmente le niveau du personnage pour jeter un niveau de plus.");
      return;
    }
    const faces = deDeVieFaces();
    const modCON = modCarac(creation.caracs.CON);
    const jet = lancerDe(faces);
    const total = Math.max(1, jet + modCON);
    creation.pvNiveauActuel += 1;
    creation.pvHistorique.push({ niveau: creation.pvNiveauActuel, faces, jet, modCON, total });
    rendrePv();
    appliquerPvAuto();
  }

  function reinitialiserNiveauxPv() {
    creation.pvHistorique = [];
    creation.pvNiveauActuel = 1;
    rendrePv();
    appliquerPvAuto();
  }

  function appliquerPvAuto() {
    const champPv = document.getElementById("champ-pvmax");
    if (champPv && !champPv.dataset.touche) champPv.value = pvTotalActuel();
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

  // Coût en points de capacité d'un rang : rang 1-2 = 1 point, rang 3-5 = 2 points
  function coutRangVoie(rang) {
    return rang >= 3 ? 2 : 1;
  }

  // Points de capacité totaux disponibles : 2 au niveau 1, +2 par niveau supplémentaire
  function pointsVoieTotal() {
    return 2 * niveauCreation();
  }

  // Points déjà dépensés : rangs de voie pris + déblocages de voies hors profil
  function pointsVoieDepenses() {
    const coutRangs = creation.capacites.reduce((t, c) => t + coutRangVoie(c.rang), 0);
    const coutDeblocages = (creation.voiesHorsProfil || []).reduce((t, hp) => t + (hp.cout || 0), 0);
    return coutRangs + coutDeblocages;
  }

  function pointsVoieRestants() {
    return Math.max(0, pointsVoieTotal() - pointsVoieDepenses());
  }

  // Voies disponibles : voies de la classe + voies hors profil débloquées
  function voiesDisponibles() {
    const c = CLASSES[creation.classe];
    const horsProfil = (creation.voiesHorsProfil || [])
      .map((hp) => {
        const cls = CLASSES[hp.classe];
        const voie = cls && cls.voies.find((v) => v.nom === hp.voie);
        return voie ? Object.assign({}, voie, { horsProfilClasse: hp.classe }) : null;
      })
      .filter(Boolean);
    return c.voies.concat(horsProfil);
  }

  function rendreVoies() {
    const niveau = niveauCreation();
    const pointsRestants = pointsVoieRestants();
    const total = pointsVoieTotal();

    const aide = document.getElementById("aide-creation");
    aide.innerHTML =
      `<strong>Règles :</strong> tu disposes de <strong>2 points de capacité par niveau</strong> (${total} au total au niveau ${niveau}). ` +
      `Un rang 1 ou 2 coûte <strong>1 point</strong>, un rang 3, 4 ou 5 coûte <strong>2 points</strong>. ` +
      `Les rangs s'acquièrent dans l'ordre (pas de rang 3 sans 1 et 2). ` +
      `La <strong>Voie du chaos</strong> est optionnelle — uniquement avec l'accord du MJ.`;

    const compteur = document.getElementById("compteur-points-voie");
    if (compteur) {
      compteur.textContent = `Points de capacité : ${pointsRestants}/${total}`;
      compteur.classList.toggle("epuise", pointsRestants === 0);
    }

    const zone = document.getElementById("zone-voies");
    zone.innerHTML = "";
    voiesDisponibles().forEach((voie) => {
      const divVoie = document.createElement("div");
      divVoie.className = "voie" + (voie.speciale ? " speciale" : "");
      let html =
        `<div class="voie-entete"><h4>${voie.nom}` +
        (voie.speciale ? `<span class="badge-chaos">CHAOS — accord MJ</span>` : "") +
        (voie.horsProfilClasse ? `<span class="badge-chaos">HORS PROFIL — ${CLASSES[voie.horsProfilClasse].nom_affiche}</span>` : "") +
        `</h4><div class="desc">${voie.description}</div></div>`;

      voie.rangs.forEach((r) => {
        const choisi = estChoisie(voie.nom, r.rang);
        const cout = coutRangVoie(r.rang);
        // Verrou : pour cocher le rang N, il faut les rangs 1..N-1 dans cette voie
        const verrouOrdre = !choisi && r.rang > rangMaxVoie(voie.nom) + 1;
        // Verrou : plus assez de points de capacité disponibles pour ce rang
        const verrouPoints = !choisi && cout > pointsRestants;
        const verrou = verrouOrdre || verrouPoints;
        html +=
          `<div class="rang ${choisi ? "choisi" : ""} ${verrou ? "verrou" : ""}">` +
          `<div class="num">${r.rang}</div>` +
          `<div class="contenu">` +
          (r.nom ? `<div class="nom-cap">${r.nom}</div>` : "") +
          `<div class="effet">${r.effet}</div></div>` +
          `<div class="cout-rang">${cout} pt${cout > 1 ? "s" : ""}</div>` +
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

    rendreVoiesHorsProfil();
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
      const cout = coutRangVoie(rang);
      if (cout > pointsVoieRestants()) {
        toast("Pas assez de points de capacité.");
        rendreVoies();
        return;
      }
      creation.capacites.push({ voie: voieNom, rang: rang });
    }
    rendreVoies();
    recalculerDerives();
  }

  // Coût d'ouverture d'une voie hors profil : 2 points (même famille de caractéristique), 4 points (famille différente)
  function coutDeblocageHorsProfil(classeCible) {
    const familleActuelle = FAMILLE_CLASSE[creation.classe];
    const familleCible = FAMILLE_CLASSE[classeCible];
    return familleActuelle && familleActuelle === familleCible ? 2 : 4;
  }

  function rendreVoiesHorsProfil() {
    const aide = document.getElementById("aide-horsprofil");
    const zone = document.getElementById("zone-voies-horsprofil");
    if (!zone) return;

    if (aide) {
      aide.innerHTML =
        `<strong>Voies hors profil :</strong> débloque une voie d'une autre classe en payant son coût d'ouverture ` +
        `(2 points si même famille de caractéristique, 4 points sinon), puis achète ses rangs normalement.`;
    }

    const pointsRestants = pointsVoieRestants();
    const dejaDebloquees = (creation.voiesHorsProfil || []).map((hp) => hp.voie);

    zone.innerHTML = "";
    Object.keys(CLASSES)
      .filter((codeClasse) => codeClasse !== creation.classe)
      .forEach((codeClasse) => {
        const cls = CLASSES[codeClasse];
        const cout = coutDeblocageHorsProfil(codeClasse);
        cls.voies.filter((v) => !v.speciale && !dejaDebloquees.includes(v.nom)).forEach((voie) => {
          const verrou = cout > pointsRestants;
          const div = document.createElement("div");
          div.className = "voie hors-profil-ligne";
          div.innerHTML =
            `<div class="voie-entete"><h4>${voie.nom} <span class="badge-chaos">${cls.nom_affiche}</span></h4>` +
            `<div class="desc">${voie.description}</div></div>` +
            `<button type="button" class="btn petit ${verrou ? "secondaire" : "or"}" ${verrou ? "disabled" : ""} ` +
            `data-classe="${codeClasse}" data-voie="${encodeURIComponent(voie.nom)}">Débloquer (coût ${cout} pt${cout > 1 ? "s" : ""})</button>`;
          zone.appendChild(div);
        });
      });

    zone.querySelectorAll("button[data-voie]").forEach((btn) => {
      btn.onclick = () => debloquerVoieHorsProfil(btn.dataset.classe, decodeURIComponent(btn.dataset.voie));
    });
  }

  function debloquerVoieHorsProfil(classeCible, voieNom) {
    const cout = coutDeblocageHorsProfil(classeCible);
    if (cout > pointsVoieRestants()) {
      toast("Pas assez de points de capacité.");
      return;
    }
    if (!creation.voiesHorsProfil) creation.voiesHorsProfil = [];
    creation.voiesHorsProfil.push({ classe: classeCible, voie: voieNom, cout });
    toast(`Voie "${voieNom}" débloquée (${cout} pts).`);
    rendreVoies();
    recalculerDerives();
  }

  // Calcule PV / DEF suggérés (modifiables ensuite)
  function recalculerDerives() {
    const modDEX = modCarac(creation.caracs.DEX);
    const def = 10 + modDEX;

    const champDef = document.getElementById("champ-def");
    // On ne réécrase que si l'utilisateur n'a pas saisi manuellement
    if (!champDef.dataset.touche) champDef.value = def;
    appliquerPvAuto();
  }

  function sauverPersonnage() {
    if (!creation.classe) { toast("Choisis d'abord une classe."); return; }
    if (!creation.race) { toast("Choisis d'abord une race."); return; }
    const nom = document.getElementById("champ-nom").value.trim();
    if (!nom) { toast("Donne un nom à ton personnage."); return; }
    if (pointsVoieDepenses() < pointsVoieTotal()) {
      if (!confirm("Tu n'as pas dépensé tous tes points de capacité disponibles. Enregistrer quand même ?")) return;
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
    document.getElementById("bloc-voie-raciale").style.display = "none";
    document.getElementById("bloc-finition").style.display = "none";
    majApercuPortrait();
    rendreGrilleClasses();
    rendreGrilleRaces();
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
      const r = p.race ? RACES[p.race] : null;
      const tuile = document.createElement("div");
      tuile.className = "perso-tuile";
      tuile.innerHTML =
        `<div class="tuile-tete">${avatarHtml(p, 48)}<div>` +
        `<h4>${p.nom}</h4>` +
        `<div class="info">${c ? c.nom_affiche : p.classe}${r ? " · " + r.nom_affiche : ""} · niveau ${p.niveau} · ${p.pvActuel}/${p.pvMax} PV</div>` +
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

    // Bonus d'attaque (jet uniquement) = bonus de progression selon l'archétype + mod approprié
    const bonusProgression = bonusAttaqueProgression(p.classe, niveau);
    const attContact = bonusProgression + mods.FOR;
    const attDistance = bonusProgression + mods.DEX;
    const caracMag = CARAC_MAGIE[p.classe];
    const attMagique = caracMag ? bonusProgression + mods[caracMag] : null;
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

    // Voie raciale (gratuite), affichée séparément des voies de classe
    const race = p.race ? RACES[p.race] : null;
    let capRaceHtml = "";
    if (race) {
      const liste = (p.capacitesRace || []).slice().sort((a, b) => a - b);
      if (liste.length) {
        liste.forEach((rang) => {
          const rg = race.rangs.find((x) => x.rang === rang);
          if (!rg) return;
          const { nom, effet } = texteRangRace(race, rg, p.raceVariante);
          capRaceHtml +=
            `<div class="cap-fiche">` +
            `<div class="titre-cap">${nom || "Rang " + rang}</div>` +
            `<div class="voie-source">${race.voie_nom} · rang ${rang}</div>` +
            `<div class="effet-cap">${effet}</div></div>`;
        });
      } else {
        capRaceHtml = `<div class="vide">Aucune capacité raciale sélectionnée.</div>`;
      }
      if (race.trait_passif) {
        capRaceHtml += `<div class="aide" style="margin-top:10px;"><em>Trait racial passif :</em> ${race.trait_passif}</div>`;
      }
    }

    zone.innerHTML = `
      <div class="carte">
        <div class="entete-fiche">
          <div class="tete-gauche">
            ${avatarHtml(p, 76)}
            <div>
              <div class="nom-perso">${p.nom}</div>
              <div class="meta">${c.nom_affiche}${race ? " · " + race.nom_affiche : ""} · niveau ${niveau} · Dé de vie ${c.de_de_vie}</div>
            </div>
          </div>
          <div class="barre-actions">
            <button class="btn petit or" id="btn-niveau-up">⬆ Monter de niveau</button>
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
        <p style="font-size:0.75rem;color:#8a8296;margin-top:6px;">Bonus d'attaque (jet, pas les dégâts) = bonus de progression (${ARCHETYPE_CLASSE[p.classe] || "martial"}, ${signe(bonusProgression)} au niveau ${niveau}) + modificateur. Ajuste selon tes voies (ex. +1 Tir ajusté) au moment du jet via l'onglet Dés si besoin.</p>
      </div>

      <div class="carte">
        <h3>Capacités</h3>
        ${capHtml}
      </div>

      ${race ? `<div class="carte"><h3>Capacités raciales — ${race.voie_nom}</h3>${capRaceHtml}</div>` : ""}

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
    document.getElementById("btn-niveau-up").onclick = () => monterDeNiveau(id);
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
    if (!creation.capacitesRace) creation.capacitesRace = []; // compat fiches créées avant les voies raciales
    if (creation.race && !creation.capacitesRace.includes(1)) creation.capacitesRace.unshift(1); // rang 1 toujours acquis
    if (!creation.caracsLibres) {
      // compat fiches créées avant le point-buy : on déduit les points libres déjà investis
      creation.caracsLibres = {};
      CARACS.forEach((c) => {
        const ecart = (creation.caracs[c.code] || CARACS_BASE) - CARACS_BASE - bonusClasseCarac(c.code);
        creation.caracsLibres[c.code] = Math.max(0, Math.min(CARACS_LIBRES_MAX_PAR_STAT, ecart));
      });
    }
    if (!creation.pvHistorique) creation.pvHistorique = []; // compat fiches créées avant le jet de PV par niveau
    if (typeof creation.pvNiveauActuel !== "number") creation.pvNiveauActuel = creation.niveau || 1;
    if (!creation.voiesHorsProfil) creation.voiesHorsProfil = []; // compat fiches créées avant les voies hors profil
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
    rendreGrilleRaces();
    if (creation.race) {
      document.getElementById("bloc-voie-raciale").style.display = "block";
      rendreVoieRaciale();
    }
  }

  // Monte le personnage d'un niveau : ouvre la fiche en édition, incrémente le niveau,
  // jette les PV du nouveau niveau (dé + Mod.CON, min 1) et rafraîchit voies/points/voies hors profil.
  function monterDeNiveau(id) {
    editerPerso(id);
    const champNiveau = document.getElementById("champ-niveau");
    const champPv = document.getElementById("champ-pvmax");
    const pvAvant = pvTotalActuel();

    creation.niveau = (parseInt(champNiveau.value, 10) || 1) + 1;
    champNiveau.value = creation.niveau;

    jetNiveauPv();
    champPv.value = pvTotalActuel();
    const gainPv = pvTotalActuel() - pvAvant;

    rendreVoies();

    toast(`Niveau ${creation.niveau} ! +${gainPv} PV (total ${pvTotalActuel()}). Points de capacité : ${pointsVoieRestants()}/${pointsVoieTotal()}. Pense à enregistrer.`);
    document.getElementById("bloc-voies").scrollIntoView({ behavior: "smooth" });
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
    let html =
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">` +
      `<h2 class="titre-bandeau" style="margin:0;flex:1;">${LORE.titre}</h2>` +
      `<button type="button" class="btn petit secondaire" id="btn-modifier-lore" data-role="mj">✏️ Modifier</button>` +
      `</div>`;
    html += `<img id="lore-carte-img" src="assets/maps/monde.png" alt="Carte du monde" class="lore-carte" />`;
    if (LORE.intro) html += `<p style="font-style:italic;color:#6a6278;">${LORE.intro}</p>`;
    LORE.sections.forEach((s) => {
      html += `<div class="lore-section"><h3>${s.titre}</h3><div class="contenu">${echapper(s.contenu)}</div></div>`;
    });
    zone.innerHTML = html;
    const btnModifierLore = document.getElementById("btn-modifier-lore");
    if (btnModifierLore) {
      btnModifierLore.onclick = () =>
        toast("Édition du lore — bientôt disponible, une fois la synchro serveur en place.");
    }
    // Repli sur le schéma SVG si l'image PNG n'est pas (encore) présente
    const im = document.getElementById("lore-carte-img");
    if (im) {
      // essaie .png puis .jpg, sinon repli sur le schéma SVG
      im.onerror = () => {
        im.onerror = () => {
          im.onerror = null;
          if (typeof CARTE_MONDE_DATAURL !== "undefined") im.src = CARTE_MONDE_DATAURL;
        };
        im.src = "assets/maps/monde.jpg";
      };
    }
  }

  /* ============================================================
     INITIALISATION
     ============================================================ */

  function init() {
    nouvelleCreation();
    rendreGrilleClasses();
    rendreGrilleRaces();
    rendreHisto();
    rendreLore();

    // Rôle Joueur / MJ
    role = localStorage.getItem(STORAGE_ROLE);
    appliquerRole();
    document.querySelectorAll(".role-carte").forEach((b) => {
      b.onclick = () => definirRole(b.dataset.roleChoix);
    });
    const btnChangerRole = document.getElementById("btn-changer-role");
    if (btnChangerRole) btnChangerRole.onclick = changerDeRole;

    // Onglets
    document.querySelectorAll("nav.tabs button").forEach((b) => {
      b.onclick = () => allerVers(b.dataset.panneau);
    });

    // Création
    document.getElementById("champ-niveau").oninput = () => {
      recalculerDerives();
      if (creation.classe) { rendreVoies(); rendrePv(); }
      if (creation.race) rendreVoieRaciale();
    };
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
