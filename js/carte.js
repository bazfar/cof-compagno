/* ============================================================
   Carte (mode MJ) — Worldmap : import d'image, jetons déplaçables,
   grille, brouillard de guerre.
   État synchronisé via SyncStore (Firestore, multijoueur temps réel).
   ============================================================ */

const Carte = (() => {
  "use strict";

  // Via SyncStore (Firestore, multijoueur temps réel). Le brouillard peint
  // (fogData, un PNG en dataURL) est gardé dans un document séparé de l'état
  // léger (image/jetons/grille) : Firestore limite un document à 1 Mio, et un
  // fogData trop lourd ne doit pas empêcher la synchro des jetons.
  const STORAGE = "worldmap:etat";
  const STORAGE_FOG = "worldmap:fog-data";
  const LIMITE_FOG = 900000; // marge sous la limite Firestore (1 Mio/document)
  const PALETTE = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#b8924a", "#7f8c8d"];

  // Couleurs proposées aux JOUEURS pour distinguer leur jeton sur la carte
  // (cf. app.js ouvrirModalCouleurJoueur/choisirCouleurJoueur) — mutuellement
  // exclusives entre joueurs de la même table (vérifié via DepotJoueurs.liste(),
  // registre partagé Firestore), distincte de PALETTE ci-dessus (jetons
  // libres/PNJ, jamais des PJ). Exposée via Carte.COULEURS_JOUEURS (interne à
  // l'IIFE, contrairement à Carte/Combat/Capacites eux-mêmes qui sont de
  // vrais globals) — lue depuis app.js qui charge après ce fichier.
  const COULEURS_JOUEURS = [
    "#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5",
    "#ffca3a", "#f15bb5", "#00b4d8", "#8d5524", "#6c757d",
  ];
  // Couleur de secours pour un token PJ dont le joueur propriétaire n'a pas
  // (encore) choisi de couleur — comportement d'avant ce chantier (or fixe).
  const COULEUR_PJ_DEFAUT = "#b8924a";

  // Compare deux prénoms de joueur de façon tolérante (accents/casse/espaces
  // ignorés) — copie de app.js memeNom (identité STABLE d'un joueur : cf. son
  // commentaire, l'id navigateur est volatil — vidage de cache, autre
  // appareil — alors que le prénom saisi survit). Dupliquée ici plutôt que
  // partagée : carte.js charge avant app.js, pas l'inverse.
  function _memeNomJoueur(a, b) {
    if (!a || !b) return false;
    const norm = (s) => String(s).trim().toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
    const na = norm(a), nb = norm(b);
    if (!na || na === "joueur") return false;
    return na === nb;
  }

  // Couleur de cercle/bordure d'un token PJ : celle choisie par le joueur
  // propriétaire du personnage (registre partagé DepotJoueurs, champ
  // `couleur` posé par app.js choisirCouleurJoueur) — permet de distinguer
  // plusieurs joueurs sur la carte. Cherche d'abord par id (rapide, cas
  // normal), PUIS par prénom (cf. _memeNomJoueur) : un joueur peut avoir
  // choisi sa couleur depuis un navigateur/appareil différent de celui qui a
  // créé ce personnage (même bug de fond que app.js estProprietaire/memeNom
  // — repéré en pratique : un joueur "Fred" dont le perso.proprietaire ne
  // correspondait pas au joueurId sous lequel il avait choisi sa couleur).
  // Retombe sur COULEUR_PJ_DEFAUT si aucune couleur n'est trouvée par
  // aucune des deux voies (comptes créés avant ce chantier, DepotJoueurs pas
  // encore chargé...).
  function _couleurJoueur(proprietaireId, proprietaireNom) {
    if (typeof window.DepotJoueurs === "undefined") return COULEUR_PJ_DEFAUT;
    const parId = proprietaireId && window.DepotJoueurs.charger(proprietaireId);
    if (parId && parId.couleur) return parId.couleur;
    if (proprietaireNom) {
      const parNom = window.DepotJoueurs.liste().find((j) => j.couleur && _memeNomJoueur(j.nom, proprietaireNom));
      if (parNom) return parNom.couleur;
    }
    return COULEUR_PJ_DEFAUT;
  }

  // Recolore rétroactivement tous les tokens PJ déjà posés (worldmap ET
  // battlemap) appartenant à ce joueur — appelé quand un joueur change sa
  // couleur après coup (cf. app.js choisirCouleurJoueur), pour que le
  // changement soit immédiatement visible sans devoir re-poser son jeton.
  // Un joueur peut posséder plusieurs personnages : tous leurs tokens sont
  // recolorés, identifiés via leur ref ("pj-" + persoId) et p.proprietaire
  // OU p.proprietaireNom (cf. _memeNomJoueur/_couleurJoueur ci-dessus — même
  // repli par prénom, pour que le changement s'applique aussi aux tokens
  // d'un personnage créé sous un ancien joueurId).
  function rafraichirCouleurJoueur(joueurId, joueurNom, couleur) {
    const persos = (typeof window.DepotPersos !== "undefined") ? window.DepotPersos.charger() : {};
    const estAMoi = (ref) => {
      if (!ref) return false;
      const p = persos[idPersoDepuisRef(ref)];
      return !!(p && (p.proprietaire === joueurId || _memeNomJoueur(p.proprietaireNom, joueurNom)));
    };
    let touche = false;
    etat.jetons.filter((j) => j.pj && estAMoi(j.ref)).forEach((j) => { j.couleur = couleur; touche = true; });
    if (touche) { sauver(); rendreJetons(); }
    if (typeof DD2VTT !== "undefined" && DD2VTT.tokensPJ && DD2VTT.changerCouleurToken) {
      DD2VTT.tokensPJ().filter((t) => estAMoi(t.ref)).forEach((t) => DD2VTT.changerCouleurToken(t.id, couleur));
    }
  }

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
    const e = SyncStore.get(STORAGE);
    if (e) etat = Object.assign({ image: null, jetons: [], grille: false, fog: false }, e);
    etat.fogData = SyncStore.get(STORAGE_FOG) || null;
  }
  function sauver() {
    SyncStore.set(STORAGE, { image: etat.image, jetons: etat.jetons, grille: etat.grille, fog: etat.fog });
    sauverFog();
  }
  function sauverFog() {
    if (!etat.fogData) { SyncStore.set(STORAGE_FOG, null); return; }
    if (etat.fogData.length > LIMITE_FOG) {
      toastCarte("Brouillard trop volumineux pour être synchronisé, gardé sur cet appareil seulement.");
      return;
    }
    SyncStore.set(STORAGE_FOG, etat.fogData);
  }
  // Applique un état reçu d'un autre client (MJ change de carte, révèle du
  // brouillard...). Distingue "que faut-il redessiner" pour éviter de
  // recharger l'image à chaque petit changement.
  function _appliquerEtatDistant(distant) {
    if (!distant) return;
    const imageAChange = distant.image !== etat.image;
    etat = Object.assign({}, etat, distant, { fogData: etat.fogData });
    if (imageAChange) {
      // Le rendu réel de la worldmap passe par le canvas pan/zoom
      // (Worldmap.charger), pas par le vieux #carte-image — qui est
      // d'ailleurs partagé avec la battlemap dd2vtt. Ne vole pas
      // l'affichage à une scène de combat en cours sur CE client.
      const battlemapActif = typeof DD2VTT !== 'undefined' && DD2VTT.estActive && DD2VTT.estActive();
      if (!battlemapActif) {
        if (etat.image) Worldmap.charger(etat.image);
        else Worldmap.masquer();
        // Le MJ choisit une carte → force l'affichage chez les joueurs (bascule
        // leur onglet actif sur Carte/Worldmap), comme un partage d'écran.
        // Pas si une battlemap est en cours sur ce client : on n'interrompt
        // pas un combat pour montrer un changement de carte du monde.
        if (etat.image && role === 'joueur' && typeof App !== 'undefined' && App.allerVersCarteMode) {
          App.allerVersCarteMode('worldmap');
        }
      }
      syncSelect();
    } else {
      rendreJetons(); dom.scene.classList.toggle("grille", !!etat.grille); syncSelect(); appliquerAffichageFog();
    }
  }
  function _appliquerFogDistant(fogData) {
    etat.fogData = fogData || null;
    appliquerAffichageFog();
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

  // Aligne le menu déroulant sur la carte actuelle. Le sélecteur visible est
  // repeuplé par Worldmap.init() depuis CARTES_MONDE, avec le chemin du
  // fichier directement comme value — pas besoin de chercher une "key" dans
  // CARTES_PRESETS (l'ancienne liste, plus utilisée par ce sélecteur).
  function syncSelect() {
    if (!dom.select) return;
    dom.select.value = etat.image || "";
  }

  /* ---------- Jetons ---------- */
  function nouvelId() { let id; do { id = "j" + compteur++; } while (etat.jetons.some((j) => j.id === id)); return id; }

  function ajouterJetonsPersos() {
    const persos = (typeof window.DepotPersos !== "undefined") ? window.DepotPersos.charger() : {};
    const ids = Object.keys(persos);
    if (!ids.length) { toastCarte("Aucun personnage enregistré."); return; }
    // Si une battlemap .dd2vtt est active, on pose les persos comme tokens de combat
    if (typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive()) {
      let n = 0;
      ids.forEach((pid) => {
        const p = persos[pid];
        if (DD2VTT.ajouterTokenData({
          nom: p.nom, couleur: _couleurJoueur(p.proprietaire, p.proprietaireNom), pj: true, ref: "pj-" + pid,
          classe: p.classe || null, race: p.race || null, raceVariante: p.raceVariante || null, genre: p.genre || null,
        })) n++;
      });
      toastCarte(n + " perso(s) sur la battlemap.");
      return;
    }
    let ajout = 0, i = etat.jetons.length;
    ids.forEach((pid) => {
      const ref = "pj-" + pid;
      if (etat.jetons.some((j) => j.ref === ref)) return; // déjà sur la carte
      const p = persos[pid];
      etat.jetons.push({
        id: nouvelId(), ref: ref, nom: p.nom, couleur: _couleurJoueur(p.proprietaire, p.proprietaireNom), pj: true,
        portrait: p.portrait || null, classe: p.classe || null,
        race: p.race || null, raceVariante: p.raceVariante || null, genre: p.genre || null,
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

  // Joueur : pose son propre token sur la battlemap active (bouton dédié,
  // visible uniquement en mode battlemap côté joueur). La permission et la
  // règle de doublon sont vérifiées côté DD2VTT.ajouterTokenData.
  function ajouterMonPersoBattlemap() {
    if (!monPersoId) { toastCarte("Choisis d'abord ton personnage."); return; }
    if (typeof DD2VTT === "undefined" || !DD2VTT.estActive || !DD2VTT.estActive()) {
      toastCarte("Aucune scène de combat active.");
      return;
    }
    const persos = (typeof window.DepotPersos !== "undefined") ? window.DepotPersos.charger() : {};
    const p = persos[monPersoId];
    if (!p) { toastCarte("Personnage introuvable."); return; }
    DD2VTT.ajouterTokenData({
      nom: p.nom, couleur: _couleurJoueur(p.proprietaire, p.proprietaireNom), pj: true, ref: "pj-" + monPersoId,
      classe: p.classe || null, race: p.race || null, raceVariante: p.raceVariante || null, genre: p.genre || null,
    });
  }

  // ── Invocations (Nécromancien, Druide...) : jeton posé par le joueur lui-même ──
  // Catalogue INVOCATIONS (data/donnees.js) filtré sur la classe ET la
  // capacité réellement acquise (Personnage.capaciteEntree), pour ne
  // proposer que ce que monPersoId peut effectivement invoquer.
  function _invocationsDisponibles() {
    if (!monPersoId || typeof INVOCATIONS === "undefined" || typeof Personnage === "undefined") return [];
    const persos = (typeof window.DepotPersos !== "undefined") ? window.DepotPersos.charger() : {};
    const p = persos[monPersoId];
    if (!p) return [];
    const perso = Personnage.depuisJSON(p);
    return INVOCATIONS.filter((inv) => inv.classe === p.classe && !!perso.capaciteEntree(inv.voie, inv.rangRequis));
  }

  // pvMax/attaqueBonus === null dans le catalogue => valeur dynamique (cf.
  // commentaire de INVOCATIONS) résolue ici à partir du personnage invocateur.
  // pvMaxFormule (ex. Barricade improvisée, "10+niveau") : résolue via le même
  // moteur de formules que les dégâts/soins des capacités (Capacites.
  // resoudreExpression, gère "niveau"/"rang"/"Mod.XXX"/dés), plutôt que
  // d'ajouter un cas spécial de plus au fallback pvMax===null ci-dessous.
  function _resoudreInvocation(inv, perso, p) {
    const pvMax = inv.pvMaxFormule && typeof Capacites !== "undefined"
      ? Capacites.resoudreExpression(inv.pvMaxFormule, { perso }).total
      : (inv.pvMax !== null ? inv.pvMax : (p.niveau || 1) * 2);
    // sansAttaque (ex. Barricade improvisée) : jeton posé sans capacité
    // d'attaque, attaqueBonus toujours 0, jamais résolu dynamiquement (les
    // deux branches ci-dessous ne concernent que les invocations combattantes).
    let attaqueBonus = inv.sansAttaque ? 0 : inv.attaqueBonus;
    if (!inv.sansAttaque && attaqueBonus === null) {
      const attaqueDruide = perso.bonusAttaque("magique") || 0;
      attaqueBonus = inv.id === "creature_corrompue_druide" ? attaqueDruide - 2 : attaqueDruide;
    }
    // Nécromancien — Voie de l'outre-tombe, rang 4 "Renfort macabre" (passive) :
    // +2 attaque et +5 PV à tous les morts-vivants contrôlés (seul le Zombie
    // du catalogue en est un ici) — appliqué automatiquement à l'invocation
    // dès ce rang acquis. L'arrêt de la dégradation -1 PV/minute promis par
    // le même rang n'a rien à "arrêter" côté app : cette dégradation n'est
    // de toute façon trackée par aucun minuteur automatique (aucun jeton n'a
    // de décompte temps réel), c'est déjà un ajustement manuel de table.
    let pvMaxFinal = pvMax;
    if (inv.id === "zombie_necromancien" && perso.capaciteEntree(inv.voie, 4)) {
      attaqueBonus += 2;
      pvMaxFinal += 5;
    }
    return { pvMax: pvMaxFinal, attaqueBonus };
  }

  function ouvrirModalInvocation() {
    if (!monPersoId) { toastCarte("Choisis d'abord ton personnage."); return; }
    if (typeof DD2VTT === "undefined" || !DD2VTT.estActive || !DD2VTT.estActive()) {
      toastCarte("Aucune scène de combat active.");
      return;
    }
    const modal = document.getElementById("modal-invocation");
    if (!modal) return;
    const dispo = _invocationsDisponibles();
    if (!dispo.length) {
      toastCarte("Ton personnage n'a aucune invocation disponible.");
      return;
    }
    const sel = document.getElementById("modal-invocation-choix");
    sel.innerHTML = dispo.map((inv) => `<option value="${inv.id}">${inv.nom}</option>`).join("");
    const desc = document.getElementById("modal-invocation-desc");
    const majDesc = () => {
      const inv = dispo.find((i) => i.id === sel.value);
      desc.textContent = inv ? inv.description : "";
    };
    sel.onchange = majDesc;
    majDesc();
    modal.style.display = "flex";
  }

  function fermerModalInvocation() {
    const modal = document.getElementById("modal-invocation");
    if (modal) modal.style.display = "none";
  }

  function confirmerInvocation() {
    const dispo = _invocationsDisponibles();
    const sel = document.getElementById("modal-invocation-choix");
    const inv = dispo.find((i) => i.id === (sel && sel.value));
    if (!inv) return;
    const persos = (typeof window.DepotPersos !== "undefined") ? window.DepotPersos.charger() : {};
    const p = persos[monPersoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const { pvMax, attaqueBonus } = _resoudreInvocation(inv, perso, p);
    const jetTxt = `1d20${attaqueBonus >= 0 ? "+" : ""}${attaqueBonus} vs DEF`;
    const labelBase = `${inv.nom} (${p.nom})`;
    const ok = DD2VTT.ajouterTokenData({
      nom: _labelInvocationDistinct(monPersoId, inv.id, labelBase),
      couleur: "#5a4a7c",
      pj: false,
      invocateur: monPersoId,
      invocationId: inv.id,
      pvMax, pvActuel: pvMax,
      def: inv.def, armure: inv.armure || 0,
      init: (typeof inv.init === "number") ? inv.init : 0,
      // sansAttaque (ex. Barricade improvisée) : aucune entrée d'attaque —
      // n'apparaît jamais dans le sélecteur de cible d'attaque des monstres.
      attaques: inv.sansAttaque ? [] : [{ nom: "Attaque", jet: jetTxt, degats: inv.degats }],
    });
    if (ok) {
      toastCarte(`« ${inv.nom} » invoqué(e) !`);
      fermerModalInvocation();
    }
  }

  // Distingue plusieurs instances d'un même "type" de combattant (ex. 3
  // "Loup" du bestiaire, ou 2 "Zombie (Aldric)" invoqués par le même joueur)
  // posés sur la même table de combat, pour que le MJ s'y retrouve dans
  // l'initiative, le ciblage des sorts (Capacites.listeCibles, affiche
  // cc.nom) et la table de combat — sans ça, des entrées identiques sont
  // indiscernables. `predicat(token)` décide si un token déjà présent compte
  // comme "même type" que celui qu'on s'apprête à ajouter (cf.
  // _labelMonstreDistinct/_labelInvocationDistinct ci-dessous pour les deux
  // usages actuels). Numéroté seulement à partir du 2e ajout : le premier
  // garde son nom tel quel ("Loup") ; dès qu'un 2e est posé, le PREMIER est
  // renommé rétroactivement en "Loup 1" (cf. _renommerMonstreCombat) et le
  // nouveau devient "Loup 2" ; un 3e devient "Loup 3", etc.
  function _labelDistinct(predicat, labelBase) {
    const memeType = listeMonstresCombat().filter(predicat);
    if (memeType.length === 0) return labelBase;
    if (memeType.length === 1) {
      _renommerMonstreCombat(memeType[0].id, labelBase + " 1");
      return labelBase + " 2";
    }
    return labelBase + " " + (memeType.length + 1);
  }
  // Monstres du bestiaire (Carte.ajouterMonstre) — comparaison par monstreId
  // (pas par nom affiché, qui peut varier avec le tier), donc fiable même si
  // labelBase change d'un ajout à l'autre.
  function _labelMonstreDistinct(monstreId, labelBase) {
    return _labelDistinct((t) => t.monstreId === monstreId, labelBase);
  }
  // Invocations d'un joueur (confirmerInvocation) — comparaison par
  // invocateur ET invocationId : deux joueurs différents invoquant le même
  // familier (ex. deux Nécromanciens, chacun son Zombie) ne doivent PAS se
  // numéroter entre eux, seulement les doublons d'un MÊME invocateur.
  function _labelInvocationDistinct(casterId, invocationId, labelBase) {
    return _labelDistinct((t) => t.invocateur === casterId && t.invocationId === invocationId, labelBase);
  }

  // Renomme un token déjà posé sur la table de combat, quel que soit le mode
  // actif (battlemap dd2vtt ou worldmap) — même bascule que
  // appliquerDegatsCombat/definirPvCombat ci-dessous. Utilisé uniquement par
  // _labelDistinct ci-dessus pour le renommage rétroactif du premier
  // exemplaire d'un type (monstre ou invocation). Propage aussi vers Combat.renommerCombattant
  // (js/combat.js, chargé après carte.js — vérifié à l'exécution, jamais à
  // la définition) : si ce monstre a déjà rejoint l'ordre d'initiative, son
  // nom y est capturé une fois pour toutes à l'entrée (cf.
  // _ajouterMonstreAvecJet) et ne suivrait pas ce renommage sans cet appel.
  function _renommerMonstreCombat(id, nouveauNom) {
    if (_combatEnBattlemap() && DD2VTT.renommerToken) {
      DD2VTT.renommerToken(id, nouveauNom);
    } else {
      const tok = etat.jetons.find((j) => j.id === id);
      if (tok) { tok.nom = nouveauNom; sauver(); rendreJetons(); _notifierChangementMonstres(); }
    }
    if (typeof Combat !== "undefined" && Combat.renommerCombattant) Combat.renommerCombattant(id, nouveauNom);
  }

  function ajouterMonstre(monstre) {
    if (!monstre) return;
    const couleurs = { 1: "#27ae60", 2: "#2980b9", 3: "#d35400", 4: "#c0392b", 5: "#7d1a24" };
    const couleur = monstre.boss ? "#8e44ad" : (couleurs[monstre.dangerosite] || "#7f8c8d");
    const labelBase = monstre.tier ? monstre.nom + " [" + monstre.tier + "]" : monstre.nom;
    const label = _labelMonstreDistinct(monstre.id, labelBase);
    // Stats de combat (table de combat MJ) : PV/DEF/armure viennent du bestiaire,
    // repris tels quels (armure.valeur -> réduction de dégâts, comme les PJ).
    const donneesCombat = {
      monstreId: monstre.id,
      pvMax: (typeof monstre.pv === "number") ? monstre.pv : 1,
      pvActuel: (typeof monstre.pv === "number") ? monstre.pv : 1,
      def: (typeof monstre.def === "number") ? monstre.def : null,
      armure: (monstre.armure && monstre.armure.valeur) || 0,
      dangerosite: monstre.dangerosite || null,
      boss: !!monstre.boss,
      init: (typeof monstre.init === "number") ? monstre.init : 0,
    };
    if (typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive()) {
      DD2VTT.ajouterTokenData(Object.assign({ nom: label, couleur: couleur, pj: false }, donneesCombat));
      toastCarte("Token « " + monstre.nom + " » ajouté.");
      return;
    }
    // Worldmap fallback
    const i = etat.jetons.length;
    etat.jetons.push(Object.assign({
      id: nouvelId(), nom: label, couleur: couleur,
      pj: false, portrait: null, x: 50, y: 50,
    }, donneesCombat));
    sauver(); rendreJetons();
    toastCarte("Jeton « " + monstre.nom + " » ajouté.");
    _notifierChangementMonstres();
  }

  function supprimerJeton(id) {
    etat.jetons = etat.jetons.filter((j) => j.id !== id);
    sauver(); rendreJetons();
    _notifierChangementMonstres();
  }

  /* ---------- Table de combat (MJ) : monstres du bestiaire, battlemap ou worldmap ----------
     Source de vérité unique : les tokens eux-mêmes (tokensDD côté battlemap,
     etat.jetons côté worldmap). Pas de liste séparée à maintenir en synchro —
     ajouter/retirer un jeton sur la carte suffit à le faire apparaître/disparaître
     ici, et vice versa. */

  // Plusieurs abonnés indépendants (rendreTableCombat côté app.js, moteur de
  // tracker d'initiative côté combat.js) : liste plutôt qu'un unique callback,
  // sinon le dernier abonné écrase les précédents.
  let _onChangementMonstresListeners = [];
  function onMonstresChange(cb) { _onChangementMonstresListeners.push(cb); }
  function _notifierChangementMonstres() { _onChangementMonstresListeners.forEach((cb) => cb()); }

  function _combatEnBattlemap() {
    return typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive();
  }

  function listeMonstresCombat() {
    if (_combatEnBattlemap()) return DD2VTT.tokensMonstres();
    return etat.jetons.filter((j) => !j.pj && (j.monstreId || j.invocateur));
  }

  // Symétrique à listeMonstresCombat() côté PJ : source unique de vérité des
  // tokens joueurs présents sur la scène de combat active (js/combat.js).
  function listeTokensJoueursCombat() {
    if (_combatEnBattlemap()) return DD2VTT.tokensPJ ? DD2VTT.tokensPJ() : [];
    return etat.jetons.filter((j) => j.pj);
  }

  // Distance en cases (grille dd2vtt) entre deux tokens de la scène de combat
  // active — sert à vérifier la portée d'une arme à distance
  // (porteeMinCases/porteeMaxCases, cf. data/loot.json) contre une cible
  // choisie. null hors battlemap dd2vtt (worldmap, sans grille en cases) ou
  // si l'un des deux tokens est introuvable.
  function distanceCasesEntre(idA, idB) {
    if (!_combatEnBattlemap()) return null;
    return DD2VTT.distanceCases(idA, idB);
  }

  function appliquerDegatsCombat(id, degatsBruts) {
    if (_combatEnBattlemap() && DD2VTT.tokensMonstres().some((t) => t.id === id)) {
      return DD2VTT.appliquerDegats(id, degatsBruts);
    }
    const tok = etat.jetons.find((j) => j.id === id);
    if (!tok) return null;
    const reduction = tok.armure || 0;
    const degatsNets = Math.max(0, degatsBruts - reduction);
    tok.pvActuel = Math.max(0, (tok.pvActuel ?? tok.pvMax ?? 0) - degatsNets);
    sauver(); rendreJetons();
    _notifierChangementMonstres();
    return { nom: tok.nom, reduction, degatsNets, pvActuel: tok.pvActuel };
  }

  function definirPvCombat(id, val) {
    if (_combatEnBattlemap() && DD2VTT.tokensMonstres().some((t) => t.id === id)) {
      DD2VTT.definirPv(id, val);
      return;
    }
    const tok = etat.jetons.find((j) => j.id === id);
    if (!tok) return;
    tok.pvActuel = isNaN(val) ? tok.pvActuel : Math.max(0, Math.min(tok.pvMax || 0, val));
    sauver(); rendreJetons();
    _notifierChangementMonstres();
  }

  function ajusterPvCombat(id, delta) {
    if (_combatEnBattlemap() && DD2VTT.tokensMonstres().some((t) => t.id === id)) {
      DD2VTT.ajusterPv(id, delta);
      return;
    }
    const tok = etat.jetons.find((j) => j.id === id);
    if (!tok) return;
    tok.pvActuel = Math.max(0, Math.min(tok.pvMax || 0, (tok.pvActuel || 0) + delta));
    sauver(); rendreJetons();
    _notifierChangementMonstres();
  }

  // États/malus manuels posés par le MJ (cf. "Ajouter malus", js/app.js) sur
  // un monstre/jeton de combat — même bascule battlemap/worldmap que
  // appliquerDegatsCombat/ajusterPvCombat ci-dessus.
  function ajouterEtatCombat(id, entree) {
    if (_combatEnBattlemap() && DD2VTT.tokensMonstres().some((t) => t.id === id)) {
      DD2VTT.ajouterEtat(id, entree);
      return;
    }
    const tok = etat.jetons.find((j) => j.id === id);
    if (!tok) return;
    tok.etatsActifs = tok.etatsActifs || [];
    tok.etatsActifs.push(entree);
    sauver(); rendreJetons();
    _notifierChangementMonstres();
  }
  function retirerEtatCombat(id, idx) {
    if (_combatEnBattlemap() && DD2VTT.tokensMonstres().some((t) => t.id === id)) {
      DD2VTT.retirerEtat(id, idx);
      return;
    }
    const tok = etat.jetons.find((j) => j.id === id);
    if (!tok || !tok.etatsActifs) return;
    tok.etatsActifs.splice(idx, 1);
    sauver(); rendreJetons();
    _notifierChangementMonstres();
  }

  // Retire le monstre à la fois de la table de combat et de la carte (même
  // suppression que le bouton ✕ du jeton/token) — quel que soit le mode actif.
  function supprimerMonstreCombat(id) {
    if (_combatEnBattlemap() && DD2VTT.tokensMonstres().some((t) => t.id === id)) {
      DD2VTT.supprimerToken(id);
      return;
    }
    supprimerJeton(id);
  }

  function initiales(nom) {
    return (nom || "?").trim().split(/\s+/).map((m) => m[0]).slice(0, 2).join("").toUpperCase();
  }

  // Un token PJ porte ref = "pj-" + idPersonnage (cf. ajouterMonPersoBattlemap) —
  // utilitaire partagé (Worldmap + DD2VTT) pour en extraire l'id personnage.
  function idPersoDepuisRef(ref) { return (ref || "").replace(/^pj-/, ""); }

  // Sens inverse d'idPersoDepuisRef : id du token (scène de combat active) du
  // perso `persoId`, ou null s'il n'a pas (encore) de jeton posé — sert de
  // point de référence pour distanceCasesEntre (cf. Personnage.bonusDefDuel,
  // même recherche que _monTokenId côté app.js).
  function tokenIdPourPerso(persoId) {
    const tok = listeTokensJoueursCombat().find((t) => t.ref === "pj-" + persoId);
    return tok ? tok.id : null;
  }

  // Résout {pvActuel, pvMax} pour la barre de PV au-dessus d'un jeton/token :
  // - monstre : pvMax/pvActuel déjà portés par le jeton lui-même (cf. ajouterMonstre)
  // - PJ : le jeton ne stocke pas ses PV, résolus depuis la fiche vivante (seule
  //   source de vérité, cf. rendreJetons/rendreTokensDD qui font déjà pareil pour le portrait)
  // - jeton libre (PNJ sans PV suivis) : pas de barre (retourne null)
  function _infosPv(j, personasPJ) {
    if (j.pj && j.ref) {
      const perso = personasPJ[idPersoDepuisRef(j.ref)];
      if (!perso || typeof perso.pvMax !== "number") return null;
      return { pvActuel: perso.pvActuel ?? perso.pvMax, pvMax: perso.pvMax };
    }
    if (typeof j.pvMax !== "number") return null;
    return { pvActuel: j.pvActuel ?? j.pvMax, pvMax: j.pvMax };
  }
  // Palier de couleur (CSS) selon le % de PV restant, cohérent entre les 3 rendus.
  function _classePv(pvActuel, pvMax) {
    if (!pvMax) return "";
    const pct = pvActuel / pvMax;
    if (pct <= 0.25) return "critique";
    if (pct <= 0.5) return "faible";
    return "";
  }

  function rendreJetons() {
    dom.jetons.innerHTML = "";
    // Jetons posés avant l'ajout des tokens race/genre : on complète depuis la fiche
    // vivante (source de vérité) plutôt que de se fier aux champs figés sur le jeton.
    const personasPJ = (typeof window.DepotPersos !== "undefined") ? window.DepotPersos.charger() : {};
    etat.jetons.forEach((j) => {
      const el = document.createElement("div");
      el.className = "jeton";
      el.style.left = j.x + "%";
      el.style.top = j.y + "%";
      el.dataset.id = j.id;
      const perso = j.pj && j.ref ? personasPJ[idPersoDepuisRef(j.ref)] : null;
      const infosToken = perso || j;
      const jetonToken = j.pj && typeof cheminTokenPersonnage === "function" ? cheminTokenPersonnage(infosToken) : null;
      const jetonIconeMonstre = (!j.pj && j.monstreId && typeof cheminIconeMonstre === "function") ? cheminIconeMonstre(j.monstreId) : null;
      const classePourEmbleme = infosToken.classe || j.classe;
      const interieur = j.portrait
        ? `<img src="${j.portrait}" alt="" />`
        : jetonToken
        ? `<img src="${jetonToken}" alt="" onerror="this.outerHTML=embleme('${classePourEmbleme}',40)" />`
        : jetonIconeMonstre
        ? `<img src="${jetonIconeMonstre}" alt="" onerror="this.outerHTML='${initiales(j.nom)}'" />`
        : (j.pj && typeof embleme === "function" ? embleme(classePourEmbleme, 40) : initiales(j.nom));
      const infosPv = _infosPv(j, personasPJ);
      const barreHp = infosPv
        ? `<div class="jeton-hp"><div class="rempli ${_classePv(infosPv.pvActuel, infosPv.pvMax)}" style="width:${Math.max(0, Math.min(100, (infosPv.pvActuel / infosPv.pvMax) * 100))}%"></div></div>`
        : "";
      el.innerHTML =
        `<div class="jeton-pion" style="border-color:${j.couleur};${j.portrait || j.pj ? "" : "background:" + j.couleur + ";"}">${interieur}</div>` +
        barreHp +
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
  // La worldmap est une vue d'ensemble (voyage/navigation), jamais de
  // brouillard de guerre côté joueur — le brouillard de guerre "à la case
  // près" reste l'affaire de la battlemap (LoS individuelle par token).
  // Le MJ garde son interrupteur pour son propre affichage.
  function appliquerAffichageFog() {
    if (!dom.fog) return;
    if (!etat.image) { dom.fog.style.display = "none"; return; }
    const actif = role === "mj" && etat.fog;
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
    // Battlemap active : l'image/les murs/les tokens viennent du .dd2vtt, pas
    // de `etat` (worldmap) — "Réinitialiser" n'a de sens ici que pour repartir
    // d'un brouillard d'exploration vierge sur la scène en cours.
    if (typeof DD2VTT !== "undefined" && DD2VTT.estActive && DD2VTT.estActive()) {
      if (!confirm("Réinitialiser le brouillard d'exploration de cette scène (tout redevient inexploré) ?")) return;
      DD2VTT.reinitialiserExploration();
      toastCarte("Brouillard de la scène réinitialisé.");
      return;
    }
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
      dom.aide.textContent = "Consulte la carte choisie par le MJ et glisse ton jeton avec la souris.";
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
      btnMonTokenBattlemap: document.getElementById("btn-mon-token-battlemap"),
      btnInvocation: document.getElementById("btn-invocation-battlemap"),
    };
    if (!dom.scene) return;

    // Abonnements temps réel AVANT charger() : SyncStore.get() lit un cache
    // qui n'est peuplé qu'une fois un abonnement actif sur la clé (sinon
    // premier chargement à froid = valeurs par défaut, rattrapées dès que
    // le premier callback ci-dessous arrive).
    SyncStore.subscribe(STORAGE, _appliquerEtatDistant);
    SyncStore.subscribe(STORAGE_FOG, _appliquerFogDistant);
    charger();

    // Barre de PV des jetons/tokens PJ : les PV ne vivent pas sur le jeton mais
    // sur la fiche (cf. _infosPv), donc un changement ailleurs (fiche complète,
    // mini-fiche battlemap, autre appareil via Firestore) doit redessiner la
    // carte pour rester à jour sans avoir à changer d'onglet.
    if (typeof window.DepotPersos !== "undefined") {
      window.DepotPersos.ecouter(() => {
        rendreJetons();
        if (typeof DD2VTT !== "undefined" && DD2VTT.actualiserTokens) DD2VTT.actualiserTokens();
      });
    }

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
    if (dom.btnMonTokenBattlemap) dom.btnMonTokenBattlemap.onclick = ajouterMonPersoBattlemap;
    if (dom.btnInvocation) dom.btnInvocation.onclick = ouvrirModalInvocation;
    const btnFermerModalInvocation = document.getElementById("btn-fermer-modal-invocation");
    if (btnFermerModalInvocation) btnFermerModalInvocation.onclick = fermerModalInvocation;
    const btnConfirmerInvocation = document.getElementById("btn-confirmer-invocation");
    if (btnConfirmerInvocation) btnConfirmerInvocation.onclick = confirmerInvocation;
    const modalInvocation = document.getElementById("modal-invocation");
    if (modalInvocation) modalInvocation.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fermerModalInvocation();
    });

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

  // Appelé quand on ouvre l'onglet (re-rendu défensif). Réapplique aussi le
  // dimensionnement du canvas worldmap : une mise à jour distante (MJ change
  // de carte) a pu charger l'image pendant que cet onglet était invisible
  // (display:none → conteneur à 0×0), laissant le canvas mal dimensionné
  // jusqu'à ce que quelque chose le redimensionne explicitement.
  function onOpen() {
    if (!dom.scene) return;
    rendreJetons();
    appliquerAffichageFog();
    majAide();
    if (typeof Worldmap !== 'undefined' && Worldmap.actualiser) Worldmap.actualiser();
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
        // Prise de contrôle exclusive du sélecteur. Persiste le choix du MJ
        // via SyncStore pour que tous les clients suivent automatiquement
        // la carte du monde active (comme la scène active en battlemap).
        sel.addEventListener('change', e => {
          if (e.target.value) {
            if (typeof DD2VTT !== 'undefined') DD2VTT.modeWorldmap();
            charger(e.target.value);
            etat.image = e.target.value;
          } else {
            masquer();
            etat.image = null;
          }
          sauver();
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
    const R_SUPPR = 8; // rayon du bouton de suppression au survol
    let hoverIdx = -1; // jeton actuellement survolé (-1 = aucun)

    // Cache d'images (portrait uploadé ou token race+genre+classe) : un chargement
    // par src, on redessine une fois l'image prête (le premier rendu retombe sur
    // les initiales le temps que ça charge).
    const _imgCache = {};
    function _image(src) {
      let entry = _imgCache[src];
      if (!entry) {
        entry = { img: new Image(), ready: false, echec: false };
        entry.img.onload = () => { entry.ready = true; dessiner(); };
        entry.img.onerror = () => { entry.echec = true; };
        entry.img.src = src;
        _imgCache[src] = entry;
      }
      return entry;
    }
    function posJetonEcran(j) {
      return {
        x: pan.x + (j.x / 100) * imgActuelle.width  * zoom,
        y: pan.y + (j.y / 100) * imgActuelle.height * zoom,
      };
    }
    // Zone "survolée" = pastille du jeton OU son bouton de suppression (qui
    // déborde légèrement du rayon principal) — sinon bouger le curseur du
    // centre du jeton vers la croix fait perdre le survol juste avant le clic.
    function jetonSousCurseur(mx, my) {
      for (let i = etat.jetons.length - 1; i >= 0; i--) {
        const j = etat.jetons[i];
        const p = posJetonEcran(j);
        if (Math.hypot(mx - p.x, my - p.y) <= R_JETON) return i;
        const sp = posSuppr(j);
        if (sp && Math.hypot(mx - sp.x, my - sp.y) <= R_SUPPR + 3) return i;
      }
      return -1;
    }
    // Position du bouton "✕" (survol, en haut à droite de la pastille), ou null
    // si ce jeton n'a pas de bouton (rôle joueur : suppression MJ uniquement).
    function posSuppr(j) {
      if (role === 'joueur') return null;
      const p = posJetonEcran(j);
      return { x: p.x + R_JETON * 0.75, y: p.y - R_JETON * 0.75 };
    }
    function dessinerJetons() {
      if (!imgActuelle || !etat.jetons.length) return;
      const personasPJ = (typeof window.DepotPersos !== 'undefined') ? window.DepotPersos.charger() : {};
      etat.jetons.forEach((j, i) => {
        const p = posJetonEcran(j);
        // pastille (fond couleur, servira de secours si pas de portrait/token)
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, R_JETON, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = j.couleur || '#7c5aa6'; ctx.fill();

        // portrait uploadé, sinon token race+genre+classe (fiche vivante en priorité,
        // au cas où le jeton ait été pose avant l'ajout de ces infos), sinon initiales
        const perso = j.pj && j.ref ? personasPJ[idPersoDepuisRef(j.ref)] : null;
        const infosToken = perso || j;
        const src = j.portrait || (j.pj && typeof cheminTokenPersonnage === 'function' ? cheminTokenPersonnage(infosToken) : null);
        let dessine = false;
        if (src) {
          const entry = _image(src);
          if (entry.ready && !entry.echec) {
            ctx.save();
            ctx.clip();
            ctx.drawImage(entry.img, p.x - R_JETON, p.y - R_JETON, R_JETON * 2, R_JETON * 2);
            ctx.restore();
            dessine = true;
          }
        }
        if (!dessine) {
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
          ctx.fillText(initiales(j.nom), p.x, p.y);
        }
        ctx.lineWidth = 3; ctx.strokeStyle = j.pj ? '#b8924a' : '#1d1526'; ctx.stroke();
        ctx.restore();

        // barre de PV au-dessus du jeton (monstre, ou PJ résolu depuis sa fiche)
        const infosPv = _infosPv(j, personasPJ);
        if (infosPv) {
          const bw = R_JETON * 2, bh = 4;
          const bx = p.x - bw / 2, by = p.y - R_JETON - bh - 4;
          const pct = infosPv.pvMax ? Math.max(0, Math.min(1, infosPv.pvActuel / infosPv.pvMax)) : 0;
          const classePv = _classePv(infosPv.pvActuel, infosPv.pvMax);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = classePv === 'critique' ? '#8a2f3b' : classePv === 'faible' ? '#d38b1f' : '#3a7d44';
          ctx.fillRect(bx, by, bw * pct, bh);
        }

        // étiquette
        const label = j.nom || '';
        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        const w = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(p.x - w / 2, p.y + R_JETON + 2, w, 15);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(label, p.x, p.y + R_JETON + 4);

        // bouton de suppression, uniquement sur le jeton survolé
        if (i === hoverIdx) {
          const sp = posSuppr(j);
          if (sp) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, R_SUPPR, 0, Math.PI * 2);
            ctx.fillStyle = '#c0392b'; ctx.fill();
            ctx.strokeStyle = '#1d1526'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('✕', sp.x, sp.y + 0.5);
          }
        }
      });
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
      // priorité au bouton de suppression du jeton survolé (avant tout drag)
      if (hoverIdx >= 0 && hoverIdx < etat.jetons.length) {
        const jh = etat.jetons[hoverIdx];
        const sp = posSuppr(jh);
        if (sp && Math.hypot(mx - sp.x, my - sp.y) <= R_SUPPR + 3) {
          supprimerJeton(jh.id);
          hoverIdx = -1;
          dessiner();
          return;
        }
      }
      // priorité au déplacement d'un jeton si on clique dessus — mais un
      // joueur ne peut déplacer QUE son propre jeton (ref === "pj-"+monPersoId),
      // comme sur la battlemap. Sur le jeton de quelqu'un d'autre, on retombe
      // sur le pan de la carte plutôt que de bloquer silencieusement.
      const idx = jetonSousCurseur(mx, my);
      if (idx >= 0) {
        const j = etat.jetons[idx];
        const autorise = role !== 'joueur' || j.ref === 'pj-' + monPersoId;
        if (autorise) {
          jetonDrag = idx;
          canvas.style.cursor = 'grabbing';
          canvas.setPointerCapture(ev.pointerId);
          return;
        }
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
      if (drag) {
        pan.x = panStart.x + (ev.clientX - dragStart.x);
        pan.y = panStart.y + (ev.clientY - dragStart.y);
        dessiner();
        return;
      }
      // Ni pan ni déplacement de jeton en cours : suit le survol pour afficher
      // le bouton de suppression sur le jeton pointé.
      if (!imgActuelle) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const idx = jetonSousCurseur(mx, my);
      if (idx !== hoverIdx) { hoverIdx = idx; dessiner(); }
    }
    function surDragFin() {
      if (jetonDrag >= 0) { jetonDrag = -1; sauver(); } // sauvegarde la position
      drag = false;
      if (canvas) canvas.style.cursor = 'grab';
    }

    // Redimensionne/recentre/redessine sur la taille actuelle du conteneur.
    // Utile quand l'image a été chargée (via une mise à jour distante) pendant
    // que cet onglet était invisible : le conteneur faisait alors 0×0.
    function actualiser() {
      if (!imgActuelle) return;
      redimensionner();
      centrer();
      dessiner();
    }

    return { init, charger, masquer, redessiner: dessiner, actualiser };
  })();

  /* ============================================================
     Visibility Polygon (MIT) — traduction JS de l'algo de Jason Davies
     Source : github.com/byoung/visibility-polygon-js
     ============================================================ */
  const VisibilityPolygon = (() => {
    // bounds optionnel [x,y,largeur,hauteur] : rectangle englobant dans lequel
    // les rayons non bloqués doivent se terminer (typiquement l'étendue de la
    // scène/du canvas). Sans lui, le rectangle est dérivé des segments (et de
    // la position, pour rester valide) — mais un token situé en zone ouverte,
    // hors de toute portion couverte par des murs, se retrouve alors coincé
    // dans un rectangle à peine plus grand que lui-même (padding de 1 unité)
    // au lieu de voir jusqu'au bord réel de la carte.
    // nbEchantillons : angles supplémentaires uniformément répartis, en plus de
    // ceux dérivés des coins des murs — sans ça, une zone dégagée (aucun mur
    // avant le bord du canvas/la portée de vision) ne produit qu'un polygone à
    // 4-8 sommets (facettes du rectangle englobant), visuellement anguleux une
    // fois recadré en cercle de portée limitée (cf. calculerEtRendreLoS).
    function compute(position, segments, bounds, nbEchantillons) {
      const bounded = segments.slice();
      const [bx, by, bw, bh] = bounds || _bounds(bounded, position);
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
      const n = nbEchantillons || 0;
      for (let i = 0; i < n; i++) angles.push((i / n) * Math.PI * 2 - Math.PI);
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

    function _bounds(segs, position) {
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for (const s of segs) for (const p of s) {
        if(p[0]<minX)minX=p[0]; if(p[1]<minY)minY=p[1];
        if(p[0]>maxX)maxX=p[0]; if(p[1]>maxY)maxY=p[1];
      }
      if (position) {
        if(position[0]<minX)minX=position[0]; if(position[1]<minY)minY=position[1];
        if(position[0]>maxX)maxX=position[0]; if(position[1]>maxY)maxY=position[1];
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

    // Sync des scènes importées à la main (chargerImage/chargerFichier) : à la
    // différence du catalogue (assets/battlemaps/, fetché par URL — donc déjà
    // identique chez tout le monde), une scène importée par le MJ n'existe au
    // départ que dans son navigateur. On la republie ici (image compressée +
    // géométrie) pour que les joueurs puissent la charger dès que le MJ
    // l'active (cf. _publierSceneManuelle, _suivreSceneDistante).
    let _depotScenesManuelles = null;
    // Dernier nom de scène demandé via SyncStore "battlemap:scene-active" —
    // permet de relancer activerScene() dès que le document Firestore de la
    // scène arrive, si le joueur a reçu le changement de scène avant que la
    // scène elle-même n'ait fini de se synchroniser (course possible, deux
    // canaux temps réel indépendants).
    let _sceneActiveDemandee = null;

    // État ouvert/fermé des portails (portes + fenêtres, indiscernables côté
    // Dungeondraft), synchronisé via un DepotDistant par scène (_depotPortails,
    // un document Firestore par portail — voir activerScene).

    // Obstacles bloquant la vue dessinés à la main par le MJ (arbres, rochers...
    // que l'export Dungeondraft n'a pas tagués en objects_line_of_sight) — même
    // sémantique que scene.segmentsObjets : bloque la LoS, jamais _deplacementBloque.
    // Un document par obstacle (_depotObjetsManuels), synchronisé comme les
    // tokens/portails pour que tous les clients calculent la même LoS.
    let modeDessinObjet = false;
    let _depotObjetsManuels = null;
    let _dessinEnCours = null; // { scene, x1, y1, x2, y2 } en pixels natifs de la scène

    // Portes/fenêtres dessinées à la main par le MJ (indispensable pour une
    // scène importée en simple image, cf. chargerImage — sans .dd2vtt, aucun
    // portail n'existe). Poussées directement dans scene.portails au même
    // titre que les portails importés : rendu (rendrePortails), bascule au
    // clic (_basculerPortailAuClic) et blocage (_deplacementBloque,
    // _segmentsBloquants) fonctionnent donc SANS modification, puisqu'ils
    // itèrent tous scene.portails sans distinguer l'origine d'un portail.
    // Seule la persistance diffère (cf. _sauverEtatPortail) : un portail
    // importé ne synchronise que son état ouvert/fermé (_depotPortails,
    // gardé par id stable venant du fichier) ; un portail manuel synchronise
    // sa géométrie ET son état, car rien d'autre ne la connaît (_depotPortailsManuels).
    let modeDessinPortail = false;
    let _depotPortailsManuels = null;
    let _dessinPortailEnCours = null; // { scene, x1, y1, x2, y2 } en pixels natifs de la scène

    // Aplatit une liste de polylignes (déjà en pixels) en segments consécutifs
    // [[x1,y1],[x2,y2]] — dérivable mécaniquement des polylignes, donc jamais
    // stocké ni synchronisé séparément (cf. _sceneDepuisSync / _publierSceneManuelle) :
    // seules les polylignes voyagent, les segments sont recalculés à l'arrivée.
    function _segmentsDepuisPolylignes(polylignes) {
      const segments = [];
      for (const poly of polylignes) {
        for (let i = 0; i < poly.length - 1; i++) {
          segments.push([[poly[i].x, poly[i].y], [poly[i+1].x, poly[i+1].y]]);
        }
      }
      return segments;
    }

    // Convertit une liste de polylignes (coordonnées cases, format UVTT) en
    // polylignes pixels + segments aplatis, pour les murs comme pour les
    // objets (cf. appels dans parseDD2VTT).
    function _polylignesEtSegments(liste, px) {
      const polylignes = (liste || []).map(poly => poly.map(p => ({ x: p.x * px, y: p.y * px })));
      return { polylignes, segments: _segmentsDepuisPolylignes(polylignes) };
    }

    // ── Parser ──────────────────────────────────────────────
    // key   : identifiant stable (clé de synchro) — nom de fichier pour un
    //         import manuel, ou la "key" du catalogue pour une scène commitée
    // label : nom affiché dans le sélecteur (par défaut = key)
    function parseDD2VTT(data, key, label) {
      const px = data.resolution.pixels_per_grid;
      const lc = data.resolution.map_size.x;
      const hc = data.resolution.map_size.y;

      // Murs "en dur" (line_of_sight) : bloquent la vision ET le déplacement.
      const { polylignes, segments } = _polylignesEtSegments(data.line_of_sight, px);

      // Objets qui bloquent la vue sans bloquer le passage (arbres, rochers,
      // statues...) — Dungeondraft les exporte séparément depuis la 0.3 UVTT
      // (objects_line_of_sight) précisément pour cette distinction : contrairement
      // à un mur, on peut marcher à travers un arbre. Utilisés pour le calcul de
      // LoS (cf. _segmentsBloquants) mais jamais pour _deplacementBloque.
      const { polylignes: polylignesObjets, segments: segmentsObjets } = _polylignesEtSegments(data.objects_line_of_sight, px);

      // Portails (portes ET fenêtres — Dungeondraft ne les distingue pas dans
      // l'export). id stable (ordre d'export, constant pour un même fichier)
      // : sert de clé de document Firestore pour synchroniser chaque portail
      // individuellement (cf. _depotPortails dans activerScene). L'état
      // ouvert/fermé sauvegardé est réappliqué de façon asynchrone une fois
      // le dépôt de la scène abonné (voir activerScene) — pas ici, où aucun
      // dépôt n'existe encore pour cette scène.
      const portails = (data.portals || []).map((p, i) => ({
        id: 'p' + i,
        position: { x: p.position.x * px, y: p.position.y * px },
        bounds: p.bounds.map(b => ({ x: b.x * px, y: b.y * px })),
        ouvert: !p.closed,
        rotation: p.rotation
      }));

      return {
        nom: key,
        label: label || key,
        largeur: lc * px,
        hauteur: hc * px,
        px, lc, hc,
        image: data.image ? (data.image.startsWith('data:') ? data.image : 'data:image/png;base64,' + data.image) : null,
        imageObj: null,
        polylignes,
        segments,
        polylignesObjets,
        segmentsObjets,
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
          _publierSceneActive(nom);
          _publierSceneManuelle(nom, scene);
          toastCarte('Scène « ' + nom + ' » chargée ✔');
        } catch (err) {
          console.error('[DD2VTT]', err);
          toastCarte('Erreur : fichier .dd2vtt invalide.');
        }
      };
      reader.readAsText(fichier);
    }

    // Import d'une simple image (PNG/JPG, sans métadonnées Dungeondraft) comme
    // scène de combat : même structure de scène que parseDD2VTT (grille, LoS,
    // tokens, portails), mais murs/objets/portails vides au départ — le MJ les
    // pose lui-même à la main (cf. basculerModeDessinObjet/basculerModeDessinPortail).
    function chargerImage(fichier) {
      const nom = fichier.name.replace(/\.[a-z0-9]+$/i, '');
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          const px = parseInt(prompt('Taille d\'une case de grille, en pixels (mesure sur ton image) :', '70'), 10);
          if (!px || px <= 0) { toastCarte('Import annulé (taille de case invalide).'); return; }
          const lc = Math.max(1, Math.round(img.naturalWidth / px));
          const hc = Math.max(1, Math.round(img.naturalHeight / px));
          const scene = {
            nom, label: nom,
            largeur: lc * px, hauteur: hc * px,
            px, lc, hc,
            image: dataUrl, imageObj: null,
            polylignes: [], segments: [],
            polylignesObjets: [], segmentsObjets: [],
            portails: [],
            tokens: [], brouillard: [],
          };
          scenes[nom] = scene;
          mettreAJourSelect();
          activerScene(nom);
          // mettreAJourSelect() conserve la sélection précédente du menu si elle
          // existe toujours (cf. son commentaire) — sur un premier import, ça
          // laisse le menu affiché sur une autre scène que celle qu'on vient
          // d'activer. On force explicitement l'affichage sur la bonne scène.
          const sel = document.getElementById('select-scene-dd2vtt');
          if (sel) sel.value = nom;
          _publierSceneActive(nom);
          _publierSceneManuelle(nom, scene);
          toastCarte('Scène « ' + nom + ' » chargée (' + lc + '×' + hc + ' cases) ✔');
        };
        img.onerror = () => toastCarte('Erreur : image invalide.');
        img.src = dataUrl;
      };
      reader.readAsDataURL(fichier);
    }

    // ── Sélecteur multi-scènes ───────────────────────────────
    // Liste à la fois les scènes déjà chargées (scenes) et les entrées du
    // catalogue pas encore récupérées (CARTES_BATTLEMAP) : le menu doit
    // afficher toutes les cartes disponibles sans avoir à les télécharger en
    // entier d'avance (cf. sel.onchange, qui charge à la demande). Un export
    // Dungeondraft brut pèse facilement plusieurs dizaines de Mo ; les
    // télécharger tous au démarrage, pour chaque visiteur, MJ ou pas, serait
    // extrêmement lourd (cf. l'ancien chargerCatalogue() qui le faisait).
    function mettreAJourSelect() {
      const sel = document.getElementById('select-scene-dd2vtt');
      if (!sel) return;
      const valeurActuelle = sel.value;
      sel.innerHTML = '';
      const clesAjoutees = new Set();
      const ajouterOption = (valeur, texte) => {
        if (clesAjoutees.has(valeur)) return;
        clesAjoutees.add(valeur);
        const opt = document.createElement('option');
        opt.value = valeur; opt.textContent = texte;
        sel.appendChild(opt);
      };
      Object.keys(scenes).forEach(nom => ajouterOption(nom, scenes[nom].label || nom));
      if (typeof CARTES_BATTLEMAP !== 'undefined') {
        CARTES_BATTLEMAP.forEach(entree => ajouterOption(entree.key, entree.label || entree.key));
      }
      // Visible dès qu'il y a au moins une scène (catalogue ou import manuel) :
      // avec une seule entrée, c'est le seul moyen pour le MJ de l'activer
      // (le catalogue ne s'auto-active pas au chargement).
      sel.style.display = clesAjoutees.size >= 1 ? 'inline-block' : 'none';
      if (clesAjoutees.has(valeurActuelle)) sel.value = valeurActuelle; // conserve la sélection après ajout catalogue
      sel.onchange = () => {
        const val = sel.value;
        if (scenes[val]) { activerScene(val); _publierSceneActive(val); return; }
        const entree = (typeof CARTES_BATTLEMAP !== 'undefined') ? CARTES_BATTLEMAP.find(c => c.key === val) : null;
        if (!entree) return;
        toastCarte('Chargement de « ' + (entree.label || val) + ' »…');
        _chargerEntreeCatalogue(entree)
          .then(() => { activerScene(entree.key); _publierSceneActive(entree.key); })
          .catch(err => {
            console.warn('[DD2VTT] échec chargement scène catalogue :', entree.file, err);
            toastCarte('Erreur : impossible de charger « ' + (entree.label || val) + ' ».');
          });
      };
    }

    // ── Synchro scène active (MJ → joueurs) ──────────────────
    function _publierSceneActive(nom) {
      if (typeof SyncStore !== 'undefined') SyncStore.set('battlemap:scene-active', nom);
    }

    // Fetches de scènes catalogue en cours, indexées par key. Évite que
    // chargerCatalogue() (au démarrage) et _suivreSceneDistante() (dès que
    // scene-active arrive) ne tirent chacun le même fichier — potentiellement
    // volumineux (export Dungeondraft brut) — en double sur le réseau,
    // doublant le temps avant que la scène (et ses tokens) n'apparaissent.
    const _fetchesEnCours = {};
    function _chargerEntreeCatalogue(entree) {
      if (!_fetchesEnCours[entree.key]) {
        _fetchesEnCours[entree.key] = fetch(entree.file)
          .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(data => {
            scenes[entree.key] = parseDD2VTT(data, entree.key, entree.label);
            mettreAJourSelect();
          })
          .finally(() => { delete _fetchesEnCours[entree.key]; });
      }
      return _fetchesEnCours[entree.key];
    }

    // Applique une scène choisie par le MJ (reçue via sync) : l'active si déjà
    // connue localement, sinon tente de la récupérer dans le catalogue, sinon
    // dans le dépôt des scènes importées à la main (cf. _publierSceneManuelle) —
    // celui-ci peut ne pas avoir encore livré le document au moment de l'appel
    // (course entre les deux canaux temps réel) ; _sceneActiveDemandee permet
    // à _depotScenesManuelles.ecouter() de relancer l'activation dès qu'il arrive.
    function _suivreSceneDistante(nomDistant) {
      _sceneActiveDemandee = nomDistant;
      if (!nomDistant || nomDistant === sceneActive) return;
      if (scenes[nomDistant]) { activerScene(nomDistant); return; }
      const entree = (typeof CARTES_BATTLEMAP !== 'undefined')
        ? CARTES_BATTLEMAP.find(c => c.key === nomDistant) : null;
      if (entree) {
        _chargerEntreeCatalogue(entree)
          .then(() => activerScene(entree.key))
          .catch(err => console.warn('[DD2VTT] échec chargement scène distante :', entree.file, err));
        return;
      }
      toastCarte('Chargement de la scène du MJ…');
    }

    // ── Sync des scènes importées à la main (chargerImage/chargerFichier) ───
    function _initDepotScenesManuelles() {
      if (_depotScenesManuelles || typeof DepotDistant === 'undefined') return;
      _depotScenesManuelles = new DepotDistant('battlemap_scenes_manuelles');
      _depotScenesManuelles.ecouter((cache) => {
        Object.keys(cache).forEach((nom) => {
          if (scenes[nom]) return; // déjà connue localement (ex. le MJ qui vient de l'importer)
          scenes[nom] = _sceneDepuisSync(nom, cache[nom]);
          mettreAJourSelect();
          if (nom === _sceneActiveDemandee && sceneActive !== nom) activerScene(nom);
        });
      });
    }
    // Firestore refuse tout tableau contenant directement un autre tableau
    // ("Nested arrays are not supported") — hors polylignes est un tableau de
    // tableaux de points, et segments un tableau de [[x,y],[x,y]]. On enveloppe
    // donc chaque polyligne dans { pts } pour la synchro, et on ne synchronise
    // pas les segments (recalculés à l'arrivée, cf. _segmentsDepuisPolylignes) :
    // ils sont de toute façon dérivés mécaniquement des polylignes.
    function _polylignesPourSync(polylignes) {
      return (polylignes || []).map(poly => ({ pts: poly }));
    }
    function _polylignesDepuisSync(polylignesSync) {
      return (polylignesSync || []).map(p => p.pts || []);
    }

    function _sceneDepuisSync(nom, d) {
      const polylignes = _polylignesDepuisSync(d.polylignes);
      const polylignesObjets = _polylignesDepuisSync(d.polylignesObjets);
      return {
        nom, label: d.label || nom,
        largeur: d.largeur, hauteur: d.hauteur, px: d.px, lc: d.lc, hc: d.hc,
        image: d.image, imageObj: null,
        polylignes, segments: _segmentsDepuisPolylignes(polylignes),
        polylignesObjets, segmentsObjets: _segmentsDepuisPolylignes(polylignesObjets),
        portails: d.portails || [],
        tokens: [], brouillard: [],
      };
    }

    // Redimensionne/recompresse une image (dataURL) sous un seuil de taille
    // avant synchro : les documents Firestore sont limités à 1 Mo, et une image
    // de scène (photo/scan haute résolution, export Dungeondraft brut) le
    // dépasse largement telle quelle. Baisse la résolution puis la qualité JPEG
    // par paliers jusqu'à repasser sous le seuil (ou jusqu'à un plancher, pour
    // ne jamais boucler indéfiniment sur une image pathologique).
    function _comprimerImagePourSync(dataUrl) {
      const LIMITE = 700000; // caractères base64 — grande marge sous 1 Mo Firestore
      return new Promise((resolve) => {
        if (!dataUrl || dataUrl.length <= LIMITE) { resolve(dataUrl); return; }
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(1, Math.sqrt(LIMITE / dataUrl.length));
          let w = Math.max(1, Math.round(img.naturalWidth * ratio));
          let h = Math.max(1, Math.round(img.naturalHeight * ratio));
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          let qualite = 0.85;
          let essai = 0;
          function _tenter() {
            essai++;
            canvas.width = w; canvas.height = h;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/jpeg', qualite);
            if (out.length <= LIMITE || essai > 25) { resolve(out); return; }
            if (qualite > 0.4) qualite -= 0.15;
            else { w = Math.max(50, Math.round(w * 0.8)); h = Math.max(50, Math.round(h * 0.8)); }
            _tenter();
          }
          _tenter();
        };
        img.onerror = () => resolve(dataUrl); // tant pis — la synchro échouera côté Firestore, pas pire qu'avant
        img.src = dataUrl;
      });
    }

    // Republie une scène importée à la main (image compressée + géométrie) —
    // appelé après chargerImage()/chargerFichier(). N'écrit rien si le dépôt
    // n'est pas encore prêt (DepotDistant non chargé, ex. Firebase indisponible).
    function _publierSceneManuelle(nom, scene) {
      if (typeof DepotDistant === 'undefined') return;
      _initDepotScenesManuelles();
      _comprimerImagePourSync(scene.image).then((image) => {
        _depotScenesManuelles.sauver({
          label: scene.label || nom,
          largeur: scene.largeur, hauteur: scene.hauteur, px: scene.px, lc: scene.lc, hc: scene.hc,
          image,
          polylignes: _polylignesPourSync(scene.polylignes),
          polylignesObjets: _polylignesPourSync(scene.polylignesObjets),
          portails: scene.portails || [],
        }, nom, (err) => {
          toastCarte('⚠ Échec de la synchro de « ' + (scene.label || nom) + ' » vers les joueurs : ' + (err && err.message ? err.message : err));
        });
      });
    }

    // ── Catalogue statique (assets/battlemaps/, cf. data/donnees.js) ────
    // Ne fait qu'inscrire les entrées du catalogue dans le sélecteur (menu
    // déroulant) au démarrage — le fichier .dd2vtt de chacune n'est téléchargé
    // que lorsqu'elle est effectivement choisie (cf. mettreAJourSelect).
    // L'import manuel (chargerFichier) reste disponible pour du one-shot MJ
    // non committé au catalogue.
    function chargerCatalogue() {
      mettreAJourSelect();
    }

    // ── Activation d'une scène ───────────────────────────────
    function activerScene(nom) {
      if (!scenes[nom]) return;
      sceneActive = nom;
      const scene = scenes[nom];

      // Le MJ active une scène → force l'affichage chez les joueurs (bascule
      // leur onglet actif sur Carte/Battlemap), comme un partage d'écran.
      // Appelé aussi quand c'est le MJ lui-même qui active la scène
      // localement, mais le garde de rôle rend ce cas inoffensif (il y est déjà).
      if (role === 'joueur' && typeof App !== 'undefined' && App.allerVersCarteMode) {
        App.allerVersCarteMode('battlemap');
      }

      // Un dépôt (Firestore, un document par token/portail) par scène active,
      // détruit et recréé au changement de scène — voir DepotDistant.arreter().
      // Un document par élément plutôt qu'un tableau entier synchronisé
      // d'un coup : deux clients qui modifient des tokens/portails différents
      // au même instant n'entrent plus en collision (écritures sur des
      // documents distincts), contrairement à un tableau réécrit en entier
      // où le second à écrire écrase le premier.
      if (_depotTokens) _depotTokens.arreter();
      _depotTokens = new DepotDistant('battlemap_' + nom + '_tokens');
      tokensDD = _depotTokens.liste();
      tokenSelectionne = null;
      fogRevele = null;
      reinitialiserDetectionVisibilite();
      _desabonnerTokens = _depotTokens.ecouter((cache) => {
        tokensDD = Object.keys(cache).map(k => cache[k]);
        tokenSelectionne = null;
        rendreTokensDD(scene);
        calculerEtRendreLoS(scene);
        _onChangeMonstres && _onChangeMonstres();
      });

      // Idem pour l'état des portails : un autre client (n'importe quel rôle)
      // a basculé une porte/fenêtre → on répercute et on recalcule la LoS.
      if (_depotPortails) _depotPortails.arreter();
      _depotPortails = new DepotDistant('battlemap_' + nom + '_portails');
      _desabonnerPortails = _depotPortails.ecouter((cache) => {
        scene.portails.forEach(p => {
          if (cache[p.id] && typeof cache[p.id].ouvert === 'boolean') p.ouvert = cache[p.id].ouvert;
        });
        rendreScene(scene);
        calculerEtRendreLoS(scene);
      });

      // Idem pour les obstacles dessinés à la main (arbres/rochers ajoutés
      // par le MJ) : un document par obstacle, reconstruit en segments à
      // chaque changement pour _segmentsBloquants/rendreMurs.
      if (_depotObjetsManuels) _depotObjetsManuels.arreter();
      _depotObjetsManuels = new DepotDistant('battlemap_' + nom + '_objets_manuels');
      scene.objetsManuelsBruts = _depotObjetsManuels.charger();
      scene.segmentsObjetsManuels = Object.values(scene.objetsManuelsBruts).map(o => [[o.x1, o.y1], [o.x2, o.y2]]);
      _depotObjetsManuels.ecouter((cache) => {
        scene.objetsManuelsBruts = cache;
        scene.segmentsObjetsManuels = Object.values(cache).map(o => [[o.x1, o.y1], [o.x2, o.y2]]);
        rendreScene(scene);
        calculerEtRendreLoS(scene);
      });

      // Idem pour les portes/fenêtres dessinées à la main (indispensable pour
      // une scène importée en simple image, sans aucun portail Dungeondraft) —
      // fusionnées directement dans scene.portails, cf. commentaire plus haut.
      if (_depotPortailsManuels) _depotPortailsManuels.arreter();
      _depotPortailsManuels = new DepotDistant('battlemap_' + nom + '_portails_manuels');
      _fusionnerPortailsManuels(scene, _depotPortailsManuels.charger());
      _depotPortailsManuels.ecouter((cache) => {
        _fusionnerPortailsManuels(scene, cache);
        rendreScene(scene);
        calculerEtRendreLoS(scene);
      });

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
      // Pas de layout dispo (image cachée, ex. onglet Worldmap actif) : on
      // n'a rien de fiable à dessiner. Sans ce garde-fou, on retombait sur
      // scene.largeur/hauteur — les dimensions RAW de la scène en pixels
      // (cases × résolution Dungeondraft, souvent des milliers de px) au
      // lieu de la taille CSS affichée — ce qui redimensionnait le canvas
      // des murs à une échelle totalement fausse, un décalage qui persistait
      // au retour sur l'onglet Battlemap (activerModeBattlemap ne rappelle
      // pas rendreScene).
      if (!rect || rect.width === 0) return;
      const affW = Math.round(rect.width);
      const affH = Math.round(rect.height);

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

      // Objets bloquant la vue mais pas le passage (arbres, rochers...) : même
      // idée que les murs pour la LoS (cf. _segmentsBloquants), tracé en vert
      // pointillé pour que le MJ les distingue visuellement d'un vrai mur.
      if (scene.polylignesObjets && scene.polylignesObjets.length) {
        ctxMurs.strokeStyle = 'rgba(60, 180, 90, 0.85)';
        ctxMurs.shadowColor = '#3cb45a';
        ctxMurs.shadowBlur  = 3;
        ctxMurs.setLineDash([5, 4]);
        for (const poly of scene.polylignesObjets) {
          if (poly.length < 2) continue;
          ctxMurs.beginPath();
          ctxMurs.moveTo(offX + poly[0].x * sx, offY + poly[0].y * sy);
          for (let i = 1; i < poly.length; i++) {
            ctxMurs.lineTo(offX + poly[i].x * sx, offY + poly[i].y * sy);
          }
          ctxMurs.stroke();
        }
        ctxMurs.setLineDash([]);
        ctxMurs.shadowBlur = 0;
      }

      // Mêmes obstacles (bloquent la vue, pas le passage), mais dessinés à la
      // main par le MJ directement dans l'appli (cf. basculerModeDessinObjet) —
      // rendu identique aux objets importés, stockés en segments bruts plutôt
      // qu'en polylignes.
      if (scene.segmentsObjetsManuels && scene.segmentsObjetsManuels.length) {
        ctxMurs.strokeStyle = 'rgba(60, 180, 90, 0.85)';
        ctxMurs.shadowColor = '#3cb45a';
        ctxMurs.shadowBlur  = 3;
        ctxMurs.setLineDash([5, 4]);
        for (const seg of scene.segmentsObjetsManuels) {
          ctxMurs.beginPath();
          ctxMurs.moveTo(offX + seg[0][0] * sx, offY + seg[0][1] * sy);
          ctxMurs.lineTo(offX + seg[1][0] * sx, offY + seg[1][1] * sy);
          ctxMurs.stroke();
        }
        ctxMurs.setLineDash([]);
        ctxMurs.shadowBlur = 0;
      }
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

    // ── Interaction portails (clic = bascule ouvert/fermé) ───
    function _distancePointSegment(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      return Math.hypot(px - cx, py - cy);
    }

    // Intersection de deux segments [a,b] et [c,d] (bornée aux deux segments,
    // contrairement à VisibilityPolygon._intersect qui traite [a,b] comme un
    // rayon infini) — sert à bloquer un déplacement de token qui traverserait
    // un mur ou une porte fermée. Renvoie le point d'intersection, ou null.
    function _pointIntersectionSegments(a, b, c, d) {
      const r = [b[0] - a[0], b[1] - a[1]];
      const s = [d[0] - c[0], d[1] - c[1]];
      const denom = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(denom) < 1e-10) return null; // parallèles (ou colinéaires, ignoré)
      const qp = [c[0] - a[0], c[1] - a[1]];
      const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
      const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
      if (t <= 1e-6 || t >= 1 - 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
      return [a[0] + t * r[0], a[1] + t * r[1]];
    }

    // Portail le plus proche d'un point (crossing d'un mur), dans une limite
    // de distance. Un portail Dungeondraft est souvent centré sur la limite
    // entre deux cases plutôt que sur le centre d'une case (sa largeur — la
    // taille réelle du battant — est en général un peu inférieure à une case
    // entière) : un déplacement centre-de-case à centre-de-case ne retombe
    // donc presque jamais EXACTEMENT dans ses bounds. On associe plutôt la
    // porte la plus proche du point de traversée du mur, tant qu'elle reste
    // à moins d'une case de distance (au-delà, ce n'est plus "la même porte").
    function _portailProche(scene, pt, tolerance) {
      let meilleur = null, meilleureDist = tolerance;
      for (const p of scene.portails) {
        const b = p.bounds;
        if (!b || b.length < 2) continue;
        const d = _distancePointSegment(pt[0], pt[1], b[0].x, b[0].y, b[1].x, b[1].y);
        if (d <= meilleureDist) { meilleur = p; meilleureDist = d; }
      }
      return meilleur;
    }

    // Un déplacement de token (cases -> pixels natifs de la scène, cx/cy *
    // scene.px comme le reste du parsing dd2vtt) est bloqué s'il traverse un
    // mur sans porte ouverte à proximité, ou une porte/fenêtre fermée —
    // ouverte, elle laisse passer comme pour la LoS (cf. _segmentsBloquants).
    // Empêche un token d'entrer dans un bâtiment "à travers le mur" au lieu
    // de passer par une porte.
    function _deplacementBloque(scene, cx0, cy0, cx1, cy1) {
      const px = scene.px;
      const p0 = [(cx0 + 0.5) * px, (cy0 + 0.5) * px];
      const p1 = [(cx1 + 0.5) * px, (cy1 + 0.5) * px];
      for (const seg of scene.segments) {
        const pt = _pointIntersectionSegments(p0, p1, seg[0], seg[1]);
        if (!pt) continue;
        const portail = _portailProche(scene, pt, px);
        if (portail && portail.ouvert) continue; // porte ouverte juste là : on passe
        return true; // mur plein, ou porte fermée à proximité
      }
      for (const p of scene.portails) {
        if (p.ouvert) continue;
        const b = p.bounds;
        if (!b || b.length < 2) continue;
        if (_pointIntersectionSegments(p0, p1, [b[0].x, b[0].y], [b[1].x, b[1].y])) return true;
      }
      return false;
    }

    function _sauverEtatPortail(p) {
      // Portail manuel : rien d'autre ne connaît sa géométrie, donc on
      // resauvegarde le portail complet. Portail importé : seul l'état
      // ouvert/fermé change de session en session, la géométrie vient du
      // fichier — cf. commentaire sur modeDessinPortail plus haut.
      if (p.manuel) {
        if (_depotPortailsManuels) {
          _depotPortailsManuels.sauver({
            x1: p.bounds[0].x, y1: p.bounds[0].y, x2: p.bounds[1].x, y2: p.bounds[1].y, ouvert: p.ouvert,
          }, p.id);
        }
        return;
      }
      if (_depotPortails) _depotPortails.sauver({ ouvert: p.ouvert }, p.id);
    }

    // Reconstruit la portion "manuelle" de scene.portails à partir du cache
    // synchronisé, sans toucher aux portails importés (déjà dans le tableau,
    // jamais retirés ici). Appelé à l'activation de la scène et à chaque
    // changement distant (cf. activerScene).
    function _fusionnerPortailsManuels(scene, cache) {
      scene.portailsManuelsBruts = cache || {};
      scene.portails = (scene.portails || []).filter(p => !p.manuel);
      Object.keys(scene.portailsManuelsBruts).forEach((id) => {
        const o = scene.portailsManuelsBruts[id];
        scene.portails.push({
          id,
          bounds: [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }],
          position: { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 },
          ouvert: !!o.ouvert,
          rotation: 0,
          manuel: true,
        });
      });
    }

    // Clic n'importe où sur la carte-scene : si assez proche d'un portail
    // (porte ou fenêtre), bascule son état. Accessible à tout joueur, sans
    // restriction de rôle ni de proximité du token.
    function _basculerPortailAuClic(ev, scene) {
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0 || !scene.portails.length) return false;

      const affW = rect.width, affH = rect.height;
      const sx = affW / scene.largeur, sy = affH / scene.hauteur;
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      if (mx < 0 || my < 0 || mx > affW || my > affH) return false;

      const seuil = Math.max(8, tailleCase(scene) * 0.35);
      let meilleur = null, meilleureDist = Infinity;
      for (const p of scene.portails) {
        const b = p.bounds;
        if (!b || b.length < 2) continue;
        const d = _distancePointSegment(mx, my, b[0].x * sx, b[0].y * sy, b[1].x * sx, b[1].y * sy);
        if (d < seuil && d < meilleureDist) { meilleur = p; meilleureDist = d; }
      }
      if (!meilleur) return false;

      meilleur.ouvert = !meilleur.ouvert;
      _sauverEtatPortail(meilleur);
      rendreScene(scene);
      calculerEtRendreLoS(scene);
      toastCarte(meilleur.ouvert ? 'Portail ouvert' : 'Portail fermé');
      return true;
    }

    // ── Dessin manuel d'obstacles (arbres/rochers) — MJ uniquement ───────
    // Convertit un événement pointer en coordonnées natives de la scène
    // (mêmes unités que scene.segments/portails.bounds, avant mise à l'échelle
    // d'affichage sx/sy).
    function _pointSceneDepuisEvent(ev, scene) {
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return null;
      const sx = rect.width / scene.largeur, sy = rect.height / scene.hauteur;
      return [(ev.clientX - rect.left) / sx, (ev.clientY - rect.top) / sy];
    }

    function basculerModeDessinObjet() {
      modeDessinObjet = !modeDessinObjet;
      const btn = document.getElementById('btn-objet-bloquant-dd');
      if (btn) btn.classList.toggle('actif-bouton', modeDessinObjet);
      // Un seul mode de dessin à la fois (sinon les deux pointerdown se
      // disputent le même geste).
      if (modeDessinObjet && modeDessinPortail) basculerModeDessinPortail();
      toastCarte(modeDessinObjet
        ? '🌳 Mode obstacle : clique-glisse pour tracer un obstacle (bloque la vue, pas le passage), clique sur un obstacle existant pour le retirer.'
        : 'Mode obstacle désactivé.');
    }

    function _demarrerDessinObjet(ev) {
      if (!modeDessinObjet) return;
      if (ev.target && ev.target.closest && ev.target.closest('.dd-token')) return;
      const scene = scenes[sceneActive];
      if (!scene) return;
      const pt = _pointSceneDepuisEvent(ev, scene);
      if (!pt) return;
      ev.preventDefault();
      _dessinEnCours = { scene, x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1] };
      window.addEventListener('pointermove', _surDessinObjet);
      window.addEventListener('pointerup', _finDessinObjet);
    }

    function _surDessinObjet(ev) {
      if (!_dessinEnCours) return;
      const { scene } = _dessinEnCours;
      const pt = _pointSceneDepuisEvent(ev, scene);
      if (!pt) return;
      _dessinEnCours.x2 = pt[0];
      _dessinEnCours.y2 = pt[1];
      rendreScene(scene);
      // Prévisualisation en direct par-dessus le rendu normal des murs/objets.
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return;
      const sx = rect.width / scene.largeur, sy = rect.height / scene.hauteur;
      ctxMurs.strokeStyle = 'rgba(60, 180, 90, 0.85)';
      ctxMurs.lineWidth   = Math.max(1.5, scene.px * sx / 60);
      ctxMurs.setLineDash([5, 4]);
      ctxMurs.beginPath();
      ctxMurs.moveTo(_dessinEnCours.x1 * sx, _dessinEnCours.y1 * sy);
      ctxMurs.lineTo(_dessinEnCours.x2 * sx, _dessinEnCours.y2 * sy);
      ctxMurs.stroke();
      ctxMurs.setLineDash([]);
    }

    function _finDessinObjet() {
      window.removeEventListener('pointermove', _surDessinObjet);
      window.removeEventListener('pointerup', _finDessinObjet);
      if (!_dessinEnCours) return;
      const { scene, x1, y1, x2, y2 } = _dessinEnCours;
      _dessinEnCours = null;
      const distance = Math.hypot(x2 - x1, y2 - y1);
      if (distance < scene.px * 0.15) {
        // Pas de glisser significatif : un clic sur un obstacle existant le retire.
        _supprimerObjetManuelProche(scene, x1, y1);
        return;
      }
      const id = 'obj-' + Date.now();
      const obstacle = { x1, y1, x2, y2 };
      if (!scene.objetsManuelsBruts) scene.objetsManuelsBruts = {};
      scene.objetsManuelsBruts[id] = obstacle;
      scene.segmentsObjetsManuels = Object.values(scene.objetsManuelsBruts).map(o => [[o.x1, o.y1], [o.x2, o.y2]]);
      // Rendu local d'abord, synchro en dernier (cf. supprimerTokenDD) : un
      // souci réseau/Firestore ne doit jamais empêcher l'obstacle d'apparaître
      // tout de suite pour le MJ qui vient de le tracer.
      rendreScene(scene);
      calculerEtRendreLoS(scene);
      if (_depotObjetsManuels) _depotObjetsManuels.sauver(obstacle, id);
      toastCarte('Obstacle ajouté.');
    }

    function _supprimerObjetManuelProche(scene, x, y) {
      const bruts = scene.objetsManuelsBruts || {};
      let meilleurId = null, meilleureDist = scene.px * 0.5;
      Object.keys(bruts).forEach((id) => {
        const o = bruts[id];
        const d = _distancePointSegment(x, y, o.x1, o.y1, o.x2, o.y2);
        if (d < meilleureDist) { meilleureDist = d; meilleurId = id; }
      });
      if (!meilleurId) { rendreScene(scene); toastCarte('Aucun obstacle à cet endroit.'); return; }
      delete bruts[meilleurId];
      scene.segmentsObjetsManuels = Object.values(bruts).map(o => [[o.x1, o.y1], [o.x2, o.y2]]);
      rendreScene(scene);
      calculerEtRendreLoS(scene);
      if (_depotObjetsManuels) _depotObjetsManuels.supprimer(meilleurId);
      toastCarte('Obstacle retiré.');
    }

    // ── Dessin manuel de portes/fenêtres — MJ uniquement ─────────────────
    // Même interaction que le dessin d'obstacle (clique-glisse pour tracer,
    // clic seul pour retirer), mais produit un portail normal dans
    // scene.portails : une fois posé, il se bascule ouvert/fermé au clic par
    // _basculerPortailAuClic comme n'importe quel portail importé.
    function basculerModeDessinPortail() {
      modeDessinPortail = !modeDessinPortail;
      const btn = document.getElementById('btn-portail-dd');
      if (btn) btn.classList.toggle('actif-bouton', modeDessinPortail);
      if (modeDessinPortail && modeDessinObjet) basculerModeDessinObjet();
      toastCarte(modeDessinPortail
        ? '🚪 Mode porte/fenêtre : clique-glisse pour tracer une porte (clic simple dessus, ensuite, pour l\'ouvrir/fermer), clique sur une porte manuelle pour la retirer.'
        : 'Mode porte/fenêtre désactivé.');
    }

    function _demarrerDessinPortail(ev) {
      if (!modeDessinPortail) return;
      if (ev.target && ev.target.closest && ev.target.closest('.dd-token')) return;
      const scene = scenes[sceneActive];
      if (!scene) return;
      const pt = _pointSceneDepuisEvent(ev, scene);
      if (!pt) return;
      ev.preventDefault();
      _dessinPortailEnCours = { scene, x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1] };
      window.addEventListener('pointermove', _surDessinPortail);
      window.addEventListener('pointerup', _finDessinPortail);
    }

    function _surDessinPortail(ev) {
      if (!_dessinPortailEnCours) return;
      const { scene } = _dessinPortailEnCours;
      const pt = _pointSceneDepuisEvent(ev, scene);
      if (!pt) return;
      _dessinPortailEnCours.x2 = pt[0];
      _dessinPortailEnCours.y2 = pt[1];
      rendreScene(scene);
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return;
      const sx = rect.width / scene.largeur, sy = rect.height / scene.hauteur;
      ctxMurs.strokeStyle = '#ffcc00';
      ctxMurs.lineWidth   = Math.max(2, scene.px * sx / 50);
      ctxMurs.beginPath();
      ctxMurs.moveTo(_dessinPortailEnCours.x1 * sx, _dessinPortailEnCours.y1 * sy);
      ctxMurs.lineTo(_dessinPortailEnCours.x2 * sx, _dessinPortailEnCours.y2 * sy);
      ctxMurs.stroke();
    }

    function _finDessinPortail() {
      window.removeEventListener('pointermove', _surDessinPortail);
      window.removeEventListener('pointerup', _finDessinPortail);
      if (!_dessinPortailEnCours) return;
      const { scene, x1, y1, x2, y2 } = _dessinPortailEnCours;
      _dessinPortailEnCours = null;
      const distance = Math.hypot(x2 - x1, y2 - y1);
      if (distance < scene.px * 0.15) {
        _supprimerPortailManuelProche(scene, x1, y1);
        return;
      }
      const id = 'portail-' + Date.now();
      const portail = {
        id,
        bounds: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
        position: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
        ouvert: false,
        rotation: 0,
        manuel: true,
      };
      if (!scene.portails) scene.portails = [];
      scene.portails.push(portail);
      // Rendu local d'abord, synchro en dernier (cf. _finDessinObjet).
      rendreScene(scene);
      calculerEtRendreLoS(scene);
      _sauverEtatPortail(portail);
      toastCarte('Porte/fenêtre ajoutée (fermée).');
    }

    function _supprimerPortailManuelProche(scene, x, y) {
      const candidats = (scene.portails || []).filter(p => p.manuel);
      let meilleur = null, meilleureDist = scene.px * 0.5;
      candidats.forEach((p) => {
        const b = p.bounds;
        const d = _distancePointSegment(x, y, b[0].x, b[0].y, b[1].x, b[1].y);
        if (d < meilleureDist) { meilleureDist = d; meilleur = p; }
      });
      if (!meilleur) { rendreScene(scene); toastCarte('Aucune porte/fenêtre manuelle à cet endroit.'); return; }
      scene.portails = scene.portails.filter(p => p !== meilleur);
      rendreScene(scene);
      calculerEtRendreLoS(scene);
      if (_depotPortailsManuels) _depotPortailsManuels.supprimer(meilleur.id);
      toastCarte('Porte/fenêtre retirée.');
    }

    // Portée de vision d'un token PJ, en cases (~équivalent torche/vision
    // nocturne) : vision nette jusqu'à PORTEE_VISION_CLAIRE, puis vision
    // altérée (assombrie, mais pas totalement cachée) sur PORTEE_VISION_ALTEREE
    // cases supplémentaires. Sans limite, un token dans une zone ouverte
    // (peu/pas de murs, ex. l'extérieur autour d'un bâtiment) voit d'un bord à
    // l'autre du canvas — ce qui donnait l'impression qu'"il n'y a pas de
    // brouillard" dans les zones dégagées. Les murs/objets bloquent toujours
    // la vue avant ces limites ; elles ne font que plafonner la distance en
    // terrain dégagé (cf. calculerEtRendreLoS).
    const PORTEE_VISION_CLAIRE = 8;
    const PORTEE_VISION_ALTEREE = 4;

    // ── État tokens dd2vtt ───────────────────────────────────
    // token : { id, nom, cx, cy, couleur, pj, ref }
    // ref : "pj-"+persoId pour un token joueur (sert au contrôle d'accès et
    // à la règle de doublon), absent/null pour un monstre.
    // cx/cy en coordonnées cases (pas pixels)
    let tokensDD = [];
    let tokenSelectionne = null;
    let _depotTokens = null;
    let _depotPortails = null;
    let _desabonnerTokens = null;
    let _desabonnerPortails = null;
    // Sauvegarde granulaire : un document par token (id = tok.id), pas un
    // tableau entier — deux clients qui modifient des tokens différents au
    // même instant écrivent sur des documents distincts, sans collision.
    function _sauverToken(tok) {
      if (_depotTokens) _depotTokens.sauver(tok, tok.id);
    }
    function _supprimerTokenSync(id) {
      if (_depotTokens) _depotTokens.supprimer(id);
    }
    let canvasLoS = null;
    let ctxLoS = null;
    let canvasFog2 = null;  // brouillard persistant dd2vtt
    let ctxFog2 = null;
    let fogRevele = null;   // ImageData du brouillard persistant

    // Polygones de vision (unités natives de la scène, scene.px) des tokens
    // PJ, recalculés à chaque appel de calculerEtRendreLoS — sert à savoir
    // quels monstres montrer aux joueurs (cf. _monstreVisiblePourJoueurs /
    // rendreTokensDD / estMonstreVisible). Toujours en unités natives : plus
    // aucune dépendance à la largeur affichée de #carte-image, donc valide
    // même appelé depuis un autre onglet (ex. Table de combat) ou suite à une
    // mise à jour distante (Firestore) reçue pendant que l'onglet Carte
    // n'était pas affiché.
    let _polygonsVisionJoueurs = [];

    // Notifie js/combat.js quand un monstre pré-placé par le MJ (planqué
    // derrière du brouillard) entre dans le champ de vision d'au moins un PJ —
    // permet au tracker d'initiative de ne l'ajouter à l'ordre qu'à cet
    // instant. `_monstresDejaNotifiesVisibles` évite de spammer le callback à
    // chaque frame tant que le monstre reste visible ; remise à zéro à la fin
    // du combat (cf. reinitialiserDetectionVisibilite) ou au changement de scène.
    let _onMonstreDevientVisible = null;
    let _monstresDejaNotifiesVisibles = new Set();
    function onMonstreDevientVisible(cb) { _onMonstreDevientVisible = cb; }
    function reinitialiserDetectionVisibilite() { _monstresDejaNotifiesVisibles = new Set(); }

    // Un monstre (par id de token) est-il actuellement visible d'au moins un
    // PJ ? Sert au démarrage du tracker d'initiative (js/combat.js), qui ne
    // doit pas inclure d'entrée pour un monstre encore planqué derrière le
    // brouillard (cf. _polygonsVisionJoueurs, recalculé en continu par
    // calculerEtRendreLoS).
    function estMonstreVisible(id) {
      const tok = tokensDD.find(t => t.id === id);
      const scene = scenes[sceneActive];
      if (!tok || !scene) return false;
      // scene.px (unité native) : _polygonsVisionJoueurs est maintenant
      // toujours construit dans ce même référentiel, qu'il ait été recalculé
      // pendant que l'onglet Carte était affiché ou non (cf. calculerEtRendreLoS).
      const posX = (tok.cx + 0.5) * scene.px;
      const posY = (tok.cy + 0.5) * scene.px;
      return _monstreVisiblePourJoueurs(posX, posY);
    }

    function _pointDansPolygone(pt, poly) {
      let dedans = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersecte = ((yi > pt[1]) !== (yj > pt[1])) &&
          (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
        if (intersecte) dedans = !dedans;
      }
      return dedans;
    }
    // Un monstre n'est montré aux joueurs que s'il est actuellement dans la
    // vision d'au moins un token PJ — pas la mémoire du brouillard déjà
    // exploré (fog2), qui n'a de sens que pour le décor : un monstre a pu
    // bouger ou apparaître depuis. Le MJ voit toujours tout (cf. rendreTokensDD).
    function _monstreVisiblePourJoueurs(px, py) {
      return _polygonsVisionJoueurs.some(poly => _pointDansPolygone([px, py], poly));
    }

    // ── Calcul taille case affichée ──────────────────────────
    function tailleCase(scene) {
      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      const affW  = (rect && rect.width > 0) ? rect.width : scene.largeur;
      return affW / scene.largeur * scene.px;
    }

    // ── Rendu tokens dd2vtt ──────────────────────────────────
    // Peut être appelé (ex. depuis un abonnement SyncStore) avant que l'image
    // ait fini son layout (rect encore 0x0) — notamment juste après un
    // rechargement de page, quand une mise à jour distante arrive pendant que
    // la scène (potentiellement lourde) est encore en train de se charger.
    // Sans retry, le conteneur restait vidé (innerHTML = '') sans jamais être
    // repeuplé, tant qu'aucune autre mise à jour ne redéclenchait un rendu.
    function rendreTokensDD(scene, _tentative) {
      const conteneur = document.getElementById('dd2vtt-tokens');
      if (!conteneur) return;

      const imgEl = document.getElementById('carte-image');
      const rect  = imgEl ? imgEl.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) {
        if ((_tentative || 0) < 20) requestAnimationFrame(() => rendreTokensDD(scene, (_tentative || 0) + 1));
        return;
      }
      conteneur.innerHTML = '';
      const tc = tailleCase(scene);

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

      const personasPJ2 = (typeof window.DepotPersos !== 'undefined') ? window.DepotPersos.charger() : {};
      tokensDD.forEach(tok => {
        const el = document.createElement('div');
        el.className = 'dd-token' + (tokenSelectionne === tok.id ? ' selectionne' : '');
        el.dataset.id = tok.id;
        el.style.pointerEvents = 'all';

        // Position en pixels depuis le coin haut-gauche de la scene (pas de l'image)
        const px = tok.cx * tc + tc/2;
        const py = tok.cy * tc + tc/2;
        // Côté joueur, un monstre reste caché tant qu'aucun token PJ n'a
        // actuellement ce point dans son champ de vision (cf. calculerEtRendreLoS).
        // Le MJ voit toujours tous les tokens. Vérifié en unités natives de la
        // scène (scene.px) — le même référentiel que _polygonsVisionJoueurs,
        // jamais celui (dépendant de l'affichage) de px/py ci-dessus.
        const posXNatif = (tok.cx + 0.5) * scene.px;
        const posYNatif = (tok.cy + 0.5) * scene.px;
        if (role === 'joueur' && !tok.pj && !_monstreVisiblePourJoueurs(posXNatif, posYNatif)) return;
        el.style.left   = px + 'px';
        el.style.top    = py + 'px';
        el.style.width  = (tc * 0.85) + 'px';
        el.style.height = (tc * 0.85) + 'px';
        el.style.borderColor = tok.couleur;
        el.style.fontSize = Math.max(8, tc * 0.35) + 'px';
        el.title = tok.nom;
        const perso = tok.pj && tok.ref ? personasPJ2[idPersoDepuisRef(tok.ref)] : null;
        const tokImgPJ = (tok.pj && typeof cheminTokenPersonnage === 'function') ? cheminTokenPersonnage(perso || tok) : null;
        const tokImgMonstre = (!tok.pj && tok.monstreId && typeof cheminIconeMonstre === 'function') ? cheminIconeMonstre(tok.monstreId) : null;
        const tokImg = tokImgPJ || tokImgMonstre;
        const contenuTok = tokImg
          ? '<img class="dd-token-img" src="' + tokImg + '" alt="" data-initiale="' + tok.nom.charAt(0).toUpperCase() + '" onerror="ddTokenFallback(this)" />'
          : '<span class="dd-token-initiale">' + tok.nom.charAt(0).toUpperCase() + '</span>';
        const infosPv = _infosPv(tok, personasPJ2);
        const barreHp = infosPv
          ? '<div class="dd-token-hp"><div class="rempli ' + _classePv(infosPv.pvActuel, infosPv.pvMax) + '" style="width:' + Math.max(0, Math.min(100, (infosPv.pvActuel / infosPv.pvMax) * 100)) + '%"></div></div>'
          : '';
        // Badge numéro (ex. "Gobelin garde 1"/"2", "Loup 1"/"2"/"3", cf.
        // _labelDistinct côté ajouterMonstre/confirmerInvocation) : deux
        // tokens de la même espèce montrent la même image/initiale et ne se
        // distinguent AUTREMENT que par ce suffixe numérique dans le nom —
        // sans badge visible sur le jeton lui-même, ce nom n'aide en rien
        // tant qu'on n'a pas cliqué dessus (seul el.title, un tooltip au
        // survol, le porte). Extrait le nombre final du nom déjà résolu.
        const numeroTok = /\s(\d+)$/.exec(tok.nom);
        const badgeNumero = numeroTok ? '<span class="dd-token-numero">' + numeroTok[1] + '</span>' : '';
        // MJ : retire n'importe quel token. Joueur : seulement ses propres
        // invocations (une créature qu'il a lui-même invoquée), jamais un
        // monstre du bestiaire ni le jeton d'un autre joueur.
        const peutSupprimer = role === 'mj' || (!!tok.invocateur && tok.invocateur === monPersoId);
        el.innerHTML = contenuTok + barreHp + badgeNumero
          + (peutSupprimer ? '<button class="dd-token-suppr" title="Retirer ' + tok.nom + '">✕</button>' : '');

        // Drag sur grille
        el.addEventListener('pointerdown', ev => demarrerDragDD(ev, tok, scene));
        // Sélection pour LoS
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          tokenSelectionne = tokenSelectionne === tok.id ? null : tok.id;
          rendreTokensDD(scene);
          calculerEtRendreLoS(scene);
        });
        // Suppression (garde de rôle/propriété ci-dessus — bouton absent du DOM sinon)
        const btnSuppr = el.querySelector('.dd-token-suppr');
        if (btnSuppr) btnSuppr.addEventListener('click', ev => {
          ev.stopPropagation();
          supprimerTokenDD(tok.id, scene);
        });

        conteneur.appendChild(el);
      });
    }

    // ── Drag tokens sur grille ───────────────────────────────
    // Joueur : ne peut déplacer que son propre token (ref === "pj-"+monPersoId)
    // ou une invocation lui appartenant (invocateur === monPersoId).
    // MJ : peut déplacer n'importe quel token. Porte demarrerDrag() (jetons
    // historiques) sur les tokens dd2vtt.
    let dragDD = null;
    function demarrerDragDD(ev, tok, scene) {
      if (role === 'joueur' && tok.ref !== 'pj-' + monPersoId && tok.invocateur !== monPersoId) return;
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
      const nx = Math.max(0, Math.min(scene.lc - 1, Math.floor(rx / tc)));
      const ny = Math.max(0, Math.min(scene.hc - 1, Math.floor(ry / tc)));
      if (nx === tok.cx && ny === tok.cy) return;
      // Mur ou porte fermée sur la trajectoire directe : on bloque le
      // déplacement plutôt que de laisser le token traverser (il ne bougera
      // que quand la souris repassera par un chemin dégagé, ex. la porte).
      // Les monstres/PNJ (tok.pj === false) y échappent : le MJ doit pouvoir
      // les placer librement (embuscade derrière un mur, popup au milieu
      // d'une pièce...) sans batailler avec la détection de mur case par case.
      if (tok.pj && _deplacementBloque(scene, tok.cx, tok.cy, nx, ny)) return;
      tok.cx = nx; tok.cy = ny;
      rendreTokensDD(scene);
      calculerEtRendreLoS(scene);
    }
    function finDragDD() {
      if (dragDD) { _sauverToken(dragDD.tok); }
      dragDD = null;
      window.removeEventListener('pointermove', surDragDD);
      window.removeEventListener('pointerup', finDragDD);
    }

    // ── Ajouter un token dd2vtt ──────────────────────────────
    // Générique (nom libre, pas de ref) : MJ uniquement — bouton "+ Token"
    // situé dans #groupe-battlemap (data-role="mj").
    function ajouterTokenDD(scene) {
      const nom = prompt('Nom du token :', 'Aventurier');
      if (!nom) return;
      const couleurs = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];
      const nouveauToken = {
        id: 'dd-' + Date.now(),
        nom: nom.trim(),
        cx: Math.floor(scene.lc / 2),
        cy: Math.floor(scene.hc / 2),
        couleur: couleurs[tokensDD.length % couleurs.length],
        pj: false
      };
      tokensDD.push(nouveauToken);
      rendreTokensDD(scene);
      calculerEtRendreLoS(scene);
      _sauverToken(nouveauToken);
    }

    // Ajout programmatique d'un token (depuis "+ Mes personnages / + Monstre / + Mon perso / + Invocation").
    // Gatekeeper unique des permissions et de la règle de doublon, vérifiée
    // sur tokensDD (état synchronisé, donc visible par tous) :
    //  - MJ : peut ajouter n'importe quel token (pj ou monstre).
    //  - Joueur : peut ajouter son propre token (pj: true, ref = le sien) OU
    //    une invocation lui appartenant (pj: false, invocateur = son id —
    //    cf. INVOCATIONS/ouvrirModalInvocation ci-dessus).
    //  - Doublon (même ref) refusé pour tout le monde, peu importe qui a
    //    tenté d'ajouter en premier — symétrique. Les invocations n'ont pas
    //    de ref : plusieurs instances de la même créature sont attendues
    //    (ex. un zombie par rang possédé dans la voie).
    function estActive() { return !!sceneActive && !!scenes[sceneActive]; }
    function ajouterTokenData(d) {
      if (!estActive()) return false;
      if (role === 'joueur') {
        const estMonPJ = !!(d && d.pj && d.ref === 'pj-' + monPersoId);
        const estMonInvocation = !!(d && !d.pj && d.invocateur && d.invocateur === monPersoId);
        if (!estMonPJ && !estMonInvocation) {
          toastCarte("Tu ne peux ajouter que ton propre personnage ou tes propres invocations.");
          return false;
        }
      }
      if (d && d.ref && tokensDD.some(t => t.ref === d.ref)) {
        toastCarte("Ce personnage est déjà sur la carte.");
        return false;
      }
      const scene = scenes[sceneActive];
      const couleurs = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];
      const n = tokensDD.length;
      const estPJ = !!(d && d.pj);
      // Les PJ arrivent en colonne sur le bord gauche de la carte (case 1,
      // pas 0, pour éviter d'atterrir pile sur un mur de bordure), empilés
      // verticalement autour du centre au fur et à mesure qu'ils rejoignent
      // la scène — plutôt qu'au centre de la grille comme les monstres/PNJ,
      // que le MJ positionne lui-même à la main (embuscade, etc.).
      const nPJ = tokensDD.filter(t => t.pj).length;
      const cx = estPJ
        ? Math.max(0, Math.min(scene.lc - 1, 1))
        : Math.max(0, Math.min(scene.lc - 1, Math.floor(scene.lc / 2) + (n % 4)));
      const cy = estPJ
        ? Math.max(0, Math.min(scene.hc - 1, Math.floor(scene.hc / 2) - 2 + nPJ))
        : Math.max(0, Math.min(scene.hc - 1, Math.floor(scene.hc / 2) + Math.floor(n / 4)));
      const nouveauToken = {
        id: 'dd-' + Date.now() + '-' + n,
        nom: (d && d.nom) ? d.nom : 'Jeton',
        cx, cy,
        couleur: (d && d.couleur) ? d.couleur : couleurs[n % couleurs.length],
        pj: !!(d && d.pj),
        ref: (d && d.ref) ? d.ref : null,
        classe: (d && d.classe) || null,
        race: (d && d.race) || null,
        raceVariante: (d && d.raceVariante) || null,
        genre: (d && d.genre) || null,
        // Table de combat (monstres du bestiaire uniquement, cf. Carte.ajouterMonstre) :
        monstreId: (d && d.monstreId) || null,
        pvMax: (d && typeof d.pvMax === 'number') ? d.pvMax : null,
        pvActuel: (d && typeof d.pvActuel === 'number') ? d.pvActuel : null,
        def: (d && typeof d.def === 'number') ? d.def : null,
        armure: (d && typeof d.armure === 'number') ? d.armure : 0,
        dangerosite: (d && d.dangerosite) || null,
        boss: !!(d && d.boss),
        init: (d && typeof d.init === 'number') ? d.init : 0,
        // Invocation d'un joueur (cf. INVOCATIONS, data/donnees.js) : id du perso
        // invocateur (permission de déplacer/retirer) + attaques propres au
        // jeton (pas de monstreId/BESTIAIRE_INDEX à interroger — cf.
        // attaquesMonstreHtml côté app.js, qui préfère tok.attaques si présent).
        // invocationId (id du catalogue INVOCATIONS, ex. "zombie_necromancien") :
        // sert uniquement à _labelDistinct (cf. confirmerInvocation) pour
        // détecter plusieurs invocations du même type par le même invocateur
        // (même rôle que monstreId pour Carte.ajouterMonstre) — jamais lu
        // ailleurs, comme monstreId l'est par BESTIAIRE_INDEX.
        invocateur: (d && d.invocateur) || null,
        invocationId: (d && d.invocationId) || null,
        attaques: (d && d.attaques) || null,
      };
      tokensDD.push(nouveauToken);
      rendreTokensDD(scene);
      calculerEtRendreLoS(scene);
      _sauverToken(nouveauToken);
      _onChangeMonstres && _onChangeMonstres();
      return true;
    }

    // ── Table de combat : monstres du bestiaire posés sur cette scène ────
    let _onChangeMonstres = null;
    function onChange(cb) { _onChangeMonstres = cb; }

    // Monstres du bestiaire (monstreId) ET invocations de joueurs (invocateur) —
    // les deux rejoignent la table de combat et l'ordre d'initiative de la
    // même façon (cf. Carte.listeMonstresCombat, js/combat.js).
    function tokensMonstres() {
      return tokensDD.filter(t => !t.pj && (t.monstreId || t.invocateur));
    }

    function tokensPJ() {
      return tokensDD.filter(t => t.pj);
    }

    // Distance en cases entre deux tokens de la scène active, façon dd2vtt :
    // distance de Chebyshev (max des deltas x/y — une diagonale compte pour 1
    // case, pas plus qu'un déplacement orthogonal), pas une distance
    // euclidienne. null si l'un des deux tokens est introuvable.
    function distanceCases(idA, idB) {
      const a = tokensDD.find(t => t.id === idA);
      const b = tokensDD.find(t => t.id === idB);
      if (!a || !b) return null;
      return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
    }

    // Applique des dégâts bruts à un token monstre, réduits par son armure
    // (comme Personnage.reductionDegats côté fiche joueur). Renvoie le détail
    // pour le toast de l'appelant, ou null si le token n'existe pas/plus.
    function appliquerDegatsToken(id, degatsBruts) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok) return null;
      const reduction = tok.armure || 0;
      const degatsNets = Math.max(0, degatsBruts - reduction);
      tok.pvActuel = Math.max(0, (tok.pvActuel ?? tok.pvMax ?? 0) - degatsNets);
      _sauverToken(tok);
      _onChangeMonstres && _onChangeMonstres();
      return { nom: tok.nom, reduction, degatsNets, pvActuel: tok.pvActuel };
    }

    // Renomme un token (utilisé par Carte._renommerMonstreCombat pour
    // distinguer plusieurs instances d'un même monstre, cf. ajouterMonstre/
    // _labelMonstreDistinct) — même schéma que definirPvToken ci-dessous.
    function renommerToken(id, nouveauNom) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok) return;
      tok.nom = nouveauNom;
      _sauverToken(tok);
      _onChangeMonstres && _onChangeMonstres();
    }

    // Recolore un token (utilisé par Carte.rafraichirCouleurJoueur quand un
    // joueur change sa couleur après avoir déjà posé son jeton) — même
    // schéma que renommerToken ci-dessus.
    function changerCouleurToken(id, couleur) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok) return;
      tok.couleur = couleur;
      _sauverToken(tok);
      rendreTokensDD(scenes[sceneActive]);
      _onChangeMonstres && _onChangeMonstres();
    }

    function definirPvToken(id, val) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok) return;
      tok.pvActuel = isNaN(val) ? tok.pvActuel : Math.max(0, Math.min(tok.pvMax || 0, val));
      _sauverToken(tok);
      _onChangeMonstres && _onChangeMonstres();
    }

    function ajusterPvToken(id, delta) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok) return;
      tok.pvActuel = Math.max(0, Math.min(tok.pvMax || 0, (tok.pvActuel || 0) + delta));
      _sauverToken(tok);
      _onChangeMonstres && _onChangeMonstres();
    }

    // États/malus actifs sur un token (monstre ou PNJ) — même forme d'entrée
    // que p.etatsActifs côté PJ (cf. capacites.js appliquerEtatSurPerso), pour
    // que htmlEtatsActifs (js/app.js) puisse afficher les deux indifféremment.
    // Pas de décompte automatique tour par tour ici (aucune horloge de tour
    // pour les monstres) : retrait manuel via le ✕, comme pour un PJ.
    function ajouterEtatToken(id, entree) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok) return;
      tok.etatsActifs = tok.etatsActifs || [];
      tok.etatsActifs.push(entree);
      _sauverToken(tok);
      _onChangeMonstres && _onChangeMonstres();
    }
    function retirerEtatToken(id, idx) {
      const tok = tokensDD.find(t => t.id === id);
      if (!tok || !tok.etatsActifs) return;
      tok.etatsActifs.splice(idx, 1);
      _sauverToken(tok);
      _onChangeMonstres && _onChangeMonstres();
    }

    // Suppression : MJ (n'importe quel token) ou joueur retirant sa propre
    // invocation (cf. rendreTokensDD, même garde de propriété pour le bouton
    // ✕ — défense supplémentaire ici au cas où l'appel viendrait d'ailleurs).
    function supprimerTokenDD(id, scene) {
      const tokActuel = tokensDD.find(t => t.id === id);
      if (role === 'joueur' && !(tokActuel && tokActuel.invocateur === monPersoId)) return;
      tokensDD = tokensDD.filter(t => t.id !== id);
      if (tokenSelectionne === id) tokenSelectionne = null;
      const sc = scene || (sceneActive && scenes[sceneActive]);
      if (sc) { rendreTokensDD(sc); calculerEtRendreLoS(sc); }
      _supprimerTokenSync(id);
      _onChangeMonstres && _onChangeMonstres();
    }

    // ── Init brouillard persistant ───────────────────────────
    // canvasFog2 marque en NOIR OPAQUE les zones déjà explorées (transparent =
    // jamais vu) — UN SEUL canvas partagé par toutes les scènes (créé une fois
    // dans init()), en résolution NATIVE de la scène (scene.largeur/hauteur) :
    // indépendant de la largeur affichée de #carte-image, donc jamais périmé
    // selon l'onglet actif ou la taille de fenêtre. Affecter width/height vide
    // TOUJOURS un canvas (comportement standard), y compris à valeur
    // inchangée : on force cette (ré)affectation sans condition, sinon deux
    // scènes de mêmes dimensions natives gardaient le brouillard déjà exploré
    // de la scène précédente au lieu de repartir de zéro (cf. activerScene, qui
    // appelle reinitFog2 à chaque activation, y compris un changement de scène).
    function reinitFog2(scene) {
      canvasFog2.width  = scene.largeur;
      canvasFog2.height = scene.hauteur;
    }

    // Bouton "Réinitialiser" côté MJ, quand une battlemap est active : ne
    // touche ni l'image, ni les murs, ni les tokens (contrairement au reset
    // worldmap sur `etat`, qui n'a pas de sens ici) — repart juste d'un
    // brouillard "rien d'exploré" pour la scène en cours.
    function reinitialiserExploration() {
      const scene = scenes[sceneActive];
      if (!scene) return;
      reinitFog2(scene);
      calculerEtRendreLoS(scene);
    }

    // ── Segments bloquants pour la LoS (murs + objets + portails fermés) ──
    // Un portail (porte ou fenêtre — Dungeondraft ne les distingue pas) ouvert
    // ne génère aucun segment : le rayon de vision passe à travers l'embrasure.
    // Fermé, son "bounds" (les 2 points de l'ouverture dans le mur) devient un
    // segment bloquant au même titre qu'un mur. Le blocage est donc symétrique
    // par construction : ça sert aussi bien un token dedans que dehors.
    // segmentsObjets (arbres, rochers...) bloquent la vue ici, mais ne sont
    // volontairement PAS repris dans _deplacementBloque : contrairement à un
    // mur, on peut marcher à travers.
    // Toujours en unités natives de la scène (mêmes unités que scene.segments/
    // portails.bounds) : la mise à l'échelle d'affichage est appliquée
    // seulement au moment du rendu visuel du brouillard, jamais dans le calcul
    // de géométrie/visibilité lui-même (cf. calculerEtRendreLoS).
    function _segmentsBloquants(scene) {
      const segs = scene.segments.map(seg => [seg[0], seg[1]]);
      if (scene.segmentsObjets) {
        for (const seg of scene.segmentsObjets) segs.push([seg[0], seg[1]]);
      }
      if (scene.segmentsObjetsManuels) {
        for (const seg of scene.segmentsObjetsManuels) segs.push([seg[0], seg[1]]);
      }
      for (const p of scene.portails) {
        if (p.ouvert) continue;
        const b = p.bounds;
        if (!b || b.length < 2) continue;
        segs.push([[b[0].x, b[0].y], [b[1].x, b[1].y]]);
      }
      return segs;
    }

    // Recadre chaque sommet d'un polygone de vision à une distance max du
    // token (les murs/objets ont déjà découpé le polygone avant cet appel,
    // ça ne fait que couper court une ligne de vue dégagée trop longue).
    function _plafonnerPortee(poly, posX, posY, maxDist) {
      return poly.map(([px2, py2]) => {
        const dx = px2 - posX, dy = py2 - posY;
        const dist = Math.hypot(dx, dy);
        if (dist <= maxDist) return [px2, py2];
        const scale = maxDist / dist;
        return [posX + dx * scale, posY + dy * scale];
      });
    }
    function _remplirChemin(ctx, poly) {
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.closePath();
      ctx.fill();
    }

    // ── LoS + brouillard ─────────────────────────────────────
    // Géométrie et portée de vision : toujours calculées en unités NATIVES de
    // la scène (scene.px), jamais recalculées depuis la largeur d'affichage
    // courante de #carte-image. Avant, tout (segments, positions, portée)
    // était mis à l'échelle d'affichage à chaque appel : un token déplacé
    // (drag local, ou mise à jour distante d'un autre client via Firestore)
    // pendant que l'onglet Carte n'était pas affiché (rect.width === 0, ex.
    // depuis « Ma fiche » ou la Table de combat) faisait sortir la fonction
    // en échec AVANT même de recalculer _polygonsVisionJoueurs : un monstre
    // pourtant à portée restait caché jusqu'à ce qu'un évènement resize (ex.
    // retour sur l'onglet Carte, qui en déclenche un via _appliquerCarteMode)
    // relance tout le calcul. La géométrie ne dépendant plus d'aucune mesure
    // d'affichage, elle est désormais toujours à jour ; seul le dessin visuel
    // du brouillard (cosmétique) a encore besoin d'une taille d'affichage
    // valide, et peut donc légitimement attendre le prochain rendu visible.
    function calculerEtRendreLoS(scene) {
      const px = scene.px;
      const segsAff = _segmentsBloquants(scene);

      // Seuls les tokens joueurs dissipent le brouillard (LoS individuelle) et
      // déterminent quels monstres sont montrés aux joueurs (cf. rendreTokensDD).
      const tokensVision = tokensDD.filter(t => t.pj);
      const maxDistClaire = PORTEE_VISION_CLAIRE * px;
      const maxDistAlteree = (PORTEE_VISION_CLAIRE + PORTEE_VISION_ALTEREE) * px;

      // Polygones par token (unités natives), gardés pour le dessin visuel
      // ci-dessous sans avoir à relancer VisibilityPolygon.compute.
      const polysParToken = [];
      for (const tok of tokensVision) {
        const posX = (tok.cx + 0.5) * px;
        const posY = (tok.cy + 0.5) * px;
        let poly;
        try {
          poly = VisibilityPolygon.compute([posX, posY], segsAff, [0, 0, scene.largeur, scene.hauteur], 32);
        } catch(e) { console.error('[LoS] erreur compute:', e); continue; }
        if (!poly || poly.length < 3) continue;

        // Deux polygones emboîtés : vision nette (claire) et vision altérée
        // (plus large, assombrie plutôt que masquée). La détection des
        // monstres (cf. rendreTokensDD) utilise la version altérée : on
        // perçoit une présence même en vision trouble, juste moins nettement.
        const polyAlteree = _plafonnerPortee(poly, posX, posY, maxDistAlteree);
        const polyClaire = _plafonnerPortee(poly, posX, posY, maxDistClaire);
        polysParToken.push({ polyAlteree, polyClaire });
      }

      _polygonsVisionJoueurs = polysParToken.map(p => p.polyAlteree);

      // Détection des monstres qui viennent d'entrer dans le champ de vision
      // d'un PJ (cf. onMonstreDevientVisible ci-dessus) — un seul appel par
      // monstre tant qu'il reste visible en continu.
      if (_onMonstreDevientVisible) {
        for (const tok of tokensMonstres()) {
          if (_monstresDejaNotifiesVisibles.has(tok.id)) continue;
          const posX = (tok.cx + 0.5) * px;
          const posY = (tok.cy + 0.5) * px;
          if (_monstreVisiblePourJoueurs(posX, posY)) {
            _monstresDejaNotifiesVisibles.add(tok.id);
            _onMonstreDevientVisible(tok);
          }
        }
      }

      rendreTokensDD(scene); // ré-applique la visibilité des monstres avec la LoS à jour
      _dessinerFogVisuel(scene, polysParToken);
    }

    // Dessin visuel du brouillard (cosmétique) : marque en clair les zones
    // vues, atténue celles déjà explorées mais plus visibles. Nécessite une
    // taille d'affichage valide (onglet Carte visible) ; sans ça, on attend
    // simplement le prochain appel (resize/retour sur l'onglet) pour
    // rafraîchir l'affichage — la géométrie/le gating ci-dessus, eux, sont
    // déjà à jour dans tous les cas.
    function _dessinerFogVisuel(scene, polysParToken) {
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

      // Remplir le brouillard opaque (zone jamais vue = totalement cachée)
      ctxLoS.clearRect(0, 0, affW, affH);
      ctxLoS.fillStyle = 'rgba(0,0,0,0.92)';
      ctxLoS.fillRect(0, 0, affW, affH);

      // Alléger le brouillard sur tout ce qui a déjà été exploré (canvasFog2,
      // en résolution native → mis à l'échelle d'affichage ici uniquement).
      // Passe faite AVANT les trous de vision courante ci-dessous, pour
      // qu'ils puissent ensuite passer par-dessus en clair total — sinon un
      // "trou" transparent dessiné en source-over sur un fond déjà opaque ne
      // fait rien (c'était le bug : la zone déjà explorée mais plus visible
      // retombait à l'opacité max au lieu de rester grisée).
      ctxLoS.globalCompositeOperation = 'destination-out';
      ctxLoS.globalAlpha = 0.5; // 0.92 * (1 - 0.5) ≈ 0.46 → brouillard semi-transparent
      ctxLoS.drawImage(canvasFog2, 0, 0, canvasFog2.width, canvasFog2.height, 0, 0, affW, affH);
      ctxLoS.globalAlpha = 1.0;
      ctxLoS.globalCompositeOperation = 'source-over';

      const enAffichage = (poly) => poly.map(([x, y]) => [x * sx, y * sy]);

      for (const { polyAlteree, polyClaire } of polysParToken) {
        // Marquer la zone (jusqu'à la portée altérée) comme explorée pour
        // toujours (marque opaque, union naturelle des passages successifs) —
        // sur canvasFog2, en unités natives (pas de mise à l'échelle ici).
        ctxFog2.globalCompositeOperation = 'source-over';
        ctxFog2.fillStyle = '#000';
        _remplirChemin(ctxFog2, polyAlteree);

        // Perce le fog actuel : d'abord la portée altérée en semi-transparent
        // (vision trouble), puis la portée claire par-dessus en clair total —
        // passe faite après l'atténuation "déjà exploré" pour la remplacer.
        ctxLoS.globalCompositeOperation = 'destination-out';
        ctxLoS.globalAlpha = 0.5;
        _remplirChemin(ctxLoS, enAffichage(polyAlteree));
        ctxLoS.globalAlpha = 1.0;
        _remplirChemin(ctxLoS, enAffichage(polyClaire));
        ctxLoS.globalCompositeOperation = 'source-over';
      }
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

      // Redimensionnement (fenêtre, ou bascule worldmap/battlemap qui change la
      // largeur dispo pour la scène, cf. _appliquerCarteMode côté app.js) : la
      // scène dd2vtt n'a pas de canvas pan/zoom comme la Worldmap, elle doit
      // recalculer sa mise à l'échelle (murs, LoS, tokens) sur la largeur réelle.
      window.addEventListener('resize', () => {
        if (!estActive()) return;
        const sc = scenes[sceneActive];
        rendreScene(sc);
        calculerEtRendreLoS(sc); // ré-applique aussi rendreTokensDD(sc) à la fin
      });

      // Clic sur la carte → bascule un portail proche (porte/fenêtre, accessible à
      // tous les joueurs, pas de check de rôle), sinon désélectionne le token actif.
      // En mode dessin d'obstacle, ce clic fait double emploi avec le pointerup
      // du tracé (cf. _demarrerDessinObjet/_finDessinObjet) : on le court-circuite.
      const scene2 = document.getElementById('carte-scene');
      if (scene2) scene2.addEventListener('click', (ev) => {
        if (modeDessinObjet || modeDessinPortail) return;
        const sc = scenes[sceneActive];
        if (sc && _basculerPortailAuClic(ev, sc)) return;
        if (tokenSelectionne) {
          tokenSelectionne = null;
          if (sc) { rendreTokensDD(sc); calculerEtRendreLoS(sc); }
        }
      });
      if (scene2) scene2.addEventListener('pointerdown', _demarrerDessinObjet);
      if (scene2) scene2.addEventListener('pointerdown', _demarrerDessinPortail);

      // Sync scène active : le MJ choisit une scène → tous les clients la
      // chargent automatiquement au prochain poll (ou immédiatement si même
      // navigateur, via l'event "storage"). subscribe() ne notifie que sur un
      // changement : on applique aussi la valeur déjà en place tout de suite,
      // pour un client qui rejoint/recharge après le choix du MJ.
      if (typeof SyncStore !== 'undefined') {
        SyncStore.subscribe('battlemap:scene-active', (nomDistant) => {
          _suivreSceneDistante(nomDistant);
        });
        _suivreSceneDistante(SyncStore.get('battlemap:scene-active'));
      }

      const inputDD = document.getElementById('input-dd2vtt');
      const btnDD   = document.getElementById('btn-import-dd2vtt');
      if (btnDD && inputDD) {
        btnDD.onclick = () => inputDD.click();
        inputDD.onchange = e => {
          if (e.target.files[0]) chargerFichier(e.target.files[0]);
          e.target.value = '';
        };
      }

      const inputImg = document.getElementById('input-image-battlemap');
      const btnImg   = document.getElementById('btn-import-image');
      if (btnImg && inputImg) {
        btnImg.onclick = () => inputImg.click();
        inputImg.onchange = e => {
          if (e.target.files[0]) chargerImage(e.target.files[0]);
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

      const btnObjet = document.getElementById('btn-objet-bloquant-dd');
      if (btnObjet) {
        btnObjet.addEventListener('click', (ev) => {
          ev.stopPropagation();
          basculerModeDessinObjet();
        });
      }

      const btnPortailDessin = document.getElementById('btn-portail-dd');
      if (btnPortailDessin) {
        btnPortailDessin.addEventListener('click', (ev) => {
          ev.stopPropagation();
          basculerModeDessinPortail();
        });
      }

      chargerCatalogue();
      _initDepotScenesManuelles();
    }

    // Idempotente : appelée à la fois quand une scène finit de charger (image
    // onload) et quand l'utilisateur bascule l'onglet Carte sur "Battlemap"
    // avec une scène déjà active en arrière-plan (sceneActive persiste tant
    // qu'on ne quitte pas la scène — changer d'onglet ne doit pas la décharger).
    // Sans le réaffichage explicite de #carte-image ici, revenir sur l'onglet
    // Battlemap après être passé par Worldmap laissait la scène masquée par
    // activerModeWorldmap() sans jamais la faire réapparaître.
    function activerModeBattlemap() {
      const cwm = document.getElementById('canvas-worldmap');
      if (cwm) cwm.style.display = 'none';
      document.querySelectorAll('.worldmap-ctrl').forEach(el => el.style.display = 'none');
      if (estActive()) {
        const imgEl = document.getElementById('carte-image');
        if (imgEl) imgEl.style.display = 'block';
        if (canvasMurs) canvasMurs.style.display = 'block';
        if (canvasLoS)  canvasLoS.style.display  = 'block';
        // Worldmap.charger() masque aussi #dd2vtt-tokens (cf. la liste `els`
        // dans Worldmap.charger) pour laisser la place au canvas pan/zoom —
        // sans ce réaffichage, les tokens dd2vtt restaient générés (présents
        // dans le DOM, correctement positionnés) mais invisibles pour
        // toujours après un aller-retour par l'onglet Worldmap.
        const tokensEl = document.getElementById('dd2vtt-tokens');
        if (tokensEl) tokensEl.style.display = 'block';
        const btnTok = document.getElementById('btn-token-dd');
        if (btnTok) btnTok.style.display = 'inline-block';
        const btnObjet = document.getElementById('btn-objet-bloquant-dd');
        if (btnObjet) btnObjet.style.display = 'inline-block';
        const btnPortailDessin = document.getElementById('btn-portail-dd');
        if (btnPortailDessin) btnPortailDessin.style.display = 'inline-block';
        const sel = document.getElementById('select-scene-dd2vtt');
        if (sel) sel.style.display = '';
        const scene = scenes[sceneActive];
        rendreScene(scene);
        rendreTokensDD(scene);
        calculerEtRendreLoS(scene);
      }
    }

    function activerModeWorldmap() {
      // Réafficher les contrôles fog worldmap
      document.querySelectorAll('.worldmap-ctrl').forEach(el => el.style.display = '');
      // Cacher les éléments battlemap
      const btnTok = document.getElementById('btn-token-dd');
      if (btnTok) btnTok.style.display = 'none';
      const btnObjet = document.getElementById('btn-objet-bloquant-dd');
      if (btnObjet) { btnObjet.style.display = 'none'; btnObjet.classList.remove('actif-bouton'); }
      modeDessinObjet = false;
      const btnPortailDessin = document.getElementById('btn-portail-dd');
      if (btnPortailDessin) { btnPortailDessin.style.display = 'none'; btnPortailDessin.classList.remove('actif-bouton'); }
      modeDessinPortail = false;
      const sel = document.getElementById('select-scene-dd2vtt');
      if (sel) sel.style.display = 'none';
      // Cacher canvas battlemap
      if (canvasMurs) canvasMurs.style.display = 'none';
      if (canvasLoS)  canvasLoS.style.display  = 'none';
      const tokensEl = document.getElementById('dd2vtt-tokens');
      if (tokensEl) tokensEl.innerHTML = '';
      // Cache l'image de scène de combat, partagée avec la worldmap (#carte-image) —
      // sinon une scène restée "active" en arrière-plan (sceneActive non nul mais
      // onglet Worldmap affiché) continue de s'afficher par-dessus la worldmap.
      const imgEl = document.getElementById('carte-image');
      if (imgEl) imgEl.style.display = 'none';
    }

    // Rafraîchit les tokens de la scène active (ex. PV d'un PJ modifiés depuis
    // sa fiche, ailleurs que sur la carte) — no-op si aucune scène affichée.
    function actualiserTokens() {
      const sc = scenes[sceneActive];
      if (sc) rendreTokensDD(sc);
    }

    return {
      init, scenes: () => scenes, sceneActive: () => sceneActive,
      ajouterToken: (sc) => ajouterTokenDD(sc),
      modeWorldmap: activerModeWorldmap, modeBattlemap: activerModeBattlemap, estActive, ajouterTokenData,
      tokensMonstres, tokensPJ, distanceCases, appliquerDegats: appliquerDegatsToken, definirPv: definirPvToken, ajusterPv: ajusterPvToken,
      renommerToken, changerCouleurToken,
      ajouterEtat: ajouterEtatToken, retirerEtat: retirerEtatToken,
      supprimerToken: supprimerTokenDD, onChange, actualiserTokens, reinitialiserExploration,
      onMonstreDevientVisible, reinitialiserDetectionVisibilite, estMonstreVisible,
    };
  })();
  // Un changement de token dd2vtt (ajout/dégâts/suppression, local ou distant
  // via Firestore) doit aussi rafraîchir la table de combat si elle est ouverte.
  DD2VTT.onChange(() => _notifierChangementMonstres());

  /* ============================================================
     Fin DD2VTT
     ============================================================ */

  document.addEventListener("DOMContentLoaded", () => { init(); Worldmap.init(); DD2VTT.init(); });

  // Applique le mode d'affichage (worldmap/battlemap) choisi via l'onglet Carte —
  // bascule la couche DD2VTT partagée (#carte-image, tokens, murs/LoS) en plus
  // du canvas worldmap, sinon une scène de combat restée active en arrière-plan
  // continue de s'afficher par-dessus la worldmap (cf. activerModeWorldmap).
  function definirModeCarte(mode) {
    if (typeof DD2VTT === "undefined") return;
    if (mode === "worldmap") {
      DD2VTT.modeWorldmap();
      // _appliquerEtatDistant évite volontairement d'appeler Worldmap.charger()
      // pendant qu'une scène de combat est active (pour ne pas voler l'affichage
      // en plein combat) — mais si l'utilisateur bascule lui-même explicitement
      // sur l'onglet Worldmap, rien d'autre ne (re)charge alors le canvas.
      if (etat.image && typeof Worldmap !== "undefined") Worldmap.charger(etat.image);
    } else {
      DD2VTT.modeBattlemap();
    }
  }

  // Point d'accroche pour js/combat.js : un monstre devient visible d'un PJ
  // (battlemap uniquement — pas de notion de brouillard en mode worldmap).
  function onMonstreDevientVisible(cb) {
    if (typeof DD2VTT !== "undefined" && DD2VTT.onMonstreDevientVisible) DD2VTT.onMonstreDevientVisible(cb);
  }
  function reinitialiserDetectionVisibilite() {
    if (typeof DD2VTT !== "undefined" && DD2VTT.reinitialiserDetectionVisibilite) DD2VTT.reinitialiserDetectionVisibilite();
  }
  // Pas de brouillard/LoS en mode worldmap : un monstre posé sur la table y
  // est donc toujours considéré visible.
  function monstreEstVisible(id) {
    if (!_combatEnBattlemap()) return true;
    return DD2VTT.estMonstreVisible ? DD2VTT.estMonstreVisible(id) : true;
  }

  return {
    onOpen, definirRole, definirMonPerso, ajouterMonstre,
    listeMonstresCombat, listeTokensJoueursCombat, appliquerDegatsCombat, definirPvCombat, ajusterPvCombat,
    ajouterEtatCombat, retirerEtatCombat, distanceCasesEntre,
    supprimerMonstreCombat, onMonstresChange, definirModeCarte,
    onMonstreDevientVisible, reinitialiserDetectionVisibilite, idPersoDepuisRef, tokenIdPourPerso, monstreEstVisible,
    initiales, rafraichirCouleurJoueur, COULEURS_JOUEURS,
  };
})();