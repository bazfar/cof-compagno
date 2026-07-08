/* ============================================================
   Chroniques Oubliées Fantasy — Logique applicative
   Création de perso, fiche vivante, lanceur de dés, sauvegarde.
   ============================================================ */

const App = (() => {
  "use strict";

  const STORAGE_PERSOS = "cof_persos";
  const STORAGE_HISTO = "des:histo"; // via SyncStore (Firestore) : journal partagé, tout le monde voit les jets de tout le monde
  const STORAGE_ROLE = "cof_role";
  const STORAGE_MON_PERSO = "cof_mon_perso_actif";
  const STORAGE_JOUEUR_ID = "cof_joueur_id";
  const STORAGE_JOUEUR_NOM = "cof_joueur_nom";

  // État de création en cours
  let creation = null;       // objet personnage en cours de création
  // Accordéon des étapes de création : etapeCourante = étape actuellement dépliée,
  // etapeDebloquee = étape la plus avancée déjà atteinte (les étapes au-delà restent masquées).
  let etapeCourante = 1;
  let etapeDebloquee = 1;
  let ficheActiveId = null;  // id du perso affiché dans "Ma fiche"
  let ficheSidebarActiveId = null;  // id du perso affiché dans la mini-fiche battlemap (sidebar)
  let role = null;           // "joueur" | "mj" | null (pas encore choisi)
  let carteMode = "worldmap"; // "worldmap" | "battlemap"
  // Identité locale du joueur (par navigateur, pas d'authentification réelle) : sert
  // à marquer un "propriétaire" sur les persos qu'il crée, cf. estProprietaire().
  let joueurId = null;
  let joueurNom = null;

  // Overlay de jet de dé partagée (voir _verifierNouveauJetPourOverlay) :
  // horodatage du dernier jet déjà montré, pour ne jamais rejouer une
  // overlay pour un jet déjà vu (écriture optimiste + confirmation Firestore
  // déclenchent chacune le callback subscribe pour la même entrée).
  let dernierHorodatageAffiche = null;
  // true dès que la toute première synchro de l'historique est reçue :
  // permet de distinguer "je rejoins la session, voici l'historique déjà
  // là" (pas d'overlay) de "un nouveau jet vient d'être ajouté" (overlay).
  let histoOverlayInitialise = false;
  let overlayJetTimer = null;
  let overlayJetRevealTimer = null;
  let _sonDe = null; // instance Audio réutilisée (évite de la recréer à chaque jet)

  /* ---------- Utilitaires ---------- */

  // Modificateur de caractéristique façon d20 — délègue au modèle Entité
  function modCarac(valeur) {
    return Entite.modCarac(valeur);
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

  // Persistance des persos derrière l'interface Depot — Firestore (multijoueur
  // temps réel). Instance partagée avec carte.js et loot.js (window.DepotPersos,
  // défini dans depot.js) : un seul abonnement Firestore pour toute l'app.
  const depotPersos = window.DepotPersos;
  function chargerPersos() {
    return depotPersos.charger(); // map { id: perso }
  }
  function sauverPersos(obj) {
    depotPersos.remplacerTout(obj);
  }

  /* ---------- Rôle Joueur / MJ ---------- */

  function definirRole(r) {
    role = r;
    localStorage.setItem(STORAGE_ROLE, r);
    if (r === "joueur") assurerIdentiteJoueur();
    appliquerRole();
    allerVers("accueil");
  }

  // Identité locale (par navigateur) : sert de "propriétaire" pour les persos
  // créés par ce joueur (cf. estProprietaire), afin qu'un autre joueur à la
  // même table ne modifie pas sa fiche par erreur. Protection côté client
  // seulement — pas d'authentification, pensée contre la maladresse entre
  // amis, pas contre une triche volontaire (cf. discussion : protection douce).
  function assurerIdentiteJoueur() {
    joueurId = localStorage.getItem(STORAGE_JOUEUR_ID);
    joueurNom = localStorage.getItem(STORAGE_JOUEUR_NOM);
    if (!joueurId) {
      joueurId = "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(STORAGE_JOUEUR_ID, joueurId);
    }
    if (!joueurNom) {
      // prompt() peut être bloqué/indisponible selon le navigateur (contexte
      // embarqué, permissions...) — un rejet ne doit pas casser le choix de
      // rôle, on retombe simplement sur un nom générique.
      let saisie = "";
      try { saisie = prompt("Ton prénom (pour retrouver tes personnages à cette table) :") || ""; }
      catch (e) { saisie = ""; }
      joueurNom = saisie.trim() || "Joueur";
      localStorage.setItem(STORAGE_JOUEUR_NOM, joueurNom);
    }
  }

  function renommerJoueur() {
    let saisie = "";
    try { saisie = prompt("Ton prénom :", joueurNom || "") || ""; }
    catch (e) { return; }
    const nom = saisie.trim();
    if (!nom) return;
    joueurNom = nom;
    localStorage.setItem(STORAGE_JOUEUR_NOM, nom);
    appliquerRole();
  }

  // Un joueur ne voit/modifie que ses propres persos (proprietaire === joueurId)
  // + les persos "non réclamés" (créés avant ce système, ou par le MJ) — le MJ
  // garde un accès total, pour ses besoins de table (loot, combat...).
  function estProprietaire(p) {
    return role === "mj" || !p.proprietaire || p.proprietaire === joueurId;
  }

  // Revendique un perso non réclamé comme sien (bouton "C'est le mien" dans la
  // liste, ou sélection dans "Mon personnage" sur la carte). No-op si déjà
  // réclamé par quelqu'un (soi-même y compris).
  function reclamerPerso(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p || p.proprietaire) return;
    p.proprietaire = joueurId;
    p.proprietaireNom = joueurNom;
    sauverPersos(persos);
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

      const blocJoueurNom = document.getElementById("bloc-joueur-nom");
      if (blocJoueurNom) blocJoueurNom.style.display = estMj ? "none" : "inline";
      const joueurNomLabel = document.getElementById("joueur-nom-label");
      if (joueurNomLabel) joueurNomLabel.textContent = joueurNom || "";

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
    // Même filtre que "Ma fiche" : un joueur ne choisit "son" personnage que
    // parmi les siens + les non-réclamés (qu'il revendique alors en même
    // temps, cf. reclamerPerso ci-dessous) — jamais le perso de quelqu'un d'autre.
    const ids = Object.keys(persos).filter((id) => estProprietaire(persos[id]));
    sel.innerHTML = ids.length
      ? ids.map((id) => `<option value="${id}">${persos[id].nom}</option>`).join("")
      : `<option value="">Aucun personnage</option>`;
    const sauvegarde = localStorage.getItem(STORAGE_MON_PERSO);
    const actif = ids.includes(sauvegarde) ? sauvegarde : (ids.includes(ficheActiveId) ? ficheActiveId : ids[0]);
    if (actif) sel.value = actif;
    if (typeof Carte !== "undefined") Carte.definirMonPerso(actif || null);
    rendreFicheSidebarBattlemap(actif || null);
    sel.onchange = () => {
      localStorage.setItem(STORAGE_MON_PERSO, sel.value);
      if (sel.value) reclamerPerso(sel.value); // affirme la propriété si non réclamé
      if (typeof Carte !== "undefined") Carte.definirMonPerso(sel.value);
      rendreFicheSidebarBattlemap(sel.value || null);
    };
  }

  // Mini-fiche affichée en permanence à gauche de la battlemap (joueur
  // uniquement) : suit le personnage sélectionné dans "Mon personnage",
  // le même que celui dont le jeton est posé sur la scène.
  function rendreFicheSidebarBattlemap(id) {
    const sidebar = document.getElementById("battlemap-fiche-sidebar");
    if (!sidebar) return;
    ficheSidebarActiveId = id || null;
    const persos = chargerPersos();
    const p = id && persos[id];
    if (!p) {
      sidebar.innerHTML = `<div class="carte"><p class="aide">Choisis ton personnage dans « Mon personnage » ci-dessus pour afficher sa fiche ici.</p></div>`;
      return;
    }
    const c = CLASSES[p.classe];
    const race = p.race ? RACES[p.race] : null;
    const perso = Personnage.depuisJSON(p);
    const mods = {};
    CARACS.forEach((cc) => (mods[cc.code] = perso.mod(cc.code)));
    const init = perso.calculerInitiative();

    // Attaques rapides : Contact toujours dispo, Distance seulement avec une
    // arme à portée équipée (arc, arbalète...), Magique seulement pour une
    // classe de lanceur de sorts (cf. Personnage.bonusAttaque).
    const attContact = perso.bonusAttaque("contact");
    const armeContact = perso.armeContactEquipee();
    const armeDistance = perso.armeDistanceEquipee();
    const attDistance = armeDistance ? perso.bonusAttaque("distance") : null;
    const attMagique = perso.bonusAttaque("magique");
    // Dégâts = formule de l'arme réellement équipée (pas une valeur générique
    // à mains nues) : même bonus que badgeEffetItem (bonusDegatsTotal posé
    // par une rareté prime sur enchantement seul).
    const formuleDegats = (arme) => {
      if (!arme) return null;
      const bonus = arme.bonusDegatsTotal !== undefined ? arme.bonusDegatsTotal : (arme.enchantement || 0);
      return arme.degats + (bonus ? (bonus > 0 ? "+" + bonus : String(bonus)) : "");
    };
    const dmgContact = formuleDegats(armeContact);
    const dmgDistance = formuleDegats(armeDistance);

    sidebar.innerHTML = `
      <div class="carte">
        <div class="entete-fiche">
          <div class="tete-gauche">
            ${avatarHtml(p, 56)}
            <div>
              <div class="nom-perso">${p.nom}</div>
              <div class="meta">${c.nom_affiche} · niveau ${p.niveau}</div>
            </div>
          </div>
        </div>
        <div class="stats-rapides">
          <div class="stat-box">
            <div class="label">Points de vie</div>
            <div class="pv-control">
              <button id="bm-pv-moins">−</button>
              <input type="number" id="bm-pv-actuel" value="${p.pvActuel}" />
              <span style="font-weight:700;">/ ${p.pvMax}</span>
              <button id="bm-pv-plus">+</button>
            </div>
            <div class="barre-pv"><div class="rempli" id="bm-barre-pv-rempli"></div></div>
            ${blocDegatsSubisHtml("bm-")}
          </div>
          <div class="stat-box"><div class="label">DEF</div><div class="valeur">${perso.calculerDEF()}</div></div>
          <div class="stat-box"><div class="label">Init.</div><div class="valeur">${signe(init)}</div></div>
        </div>
        <button class="btn petit secondaire" id="bm-voir-fiche-complete" style="width:100%;margin-top:6px;">Voir la fiche complète</button>
      </div>
      <div class="carte">
        <h3 style="margin-top:0;">Attaques rapides</h3>
        <div class="barre-actions">
          <button class="btn petit" data-bm-attaque="contact" data-bonus="${attContact}">⚔️ Contact (${signe(attContact)})</button>
          ${attDistance !== null ? `<button class="btn petit" data-bm-attaque="distance" data-bonus="${attDistance}">🏹 Distance (${signe(attDistance)})</button>` : ""}
          ${attMagique !== null ? `<button class="btn petit" data-bm-attaque="magique" data-bonus="${attMagique}">✨ Magique (${signe(attMagique)})</button>` : ""}
        </div>
        ${attDistance === null ? `<p class="aide" style="font-size:0.72rem;margin:6px 0 0;">Équipe un arc ou une arbalète pour débloquer l'attaque à distance.</p>` : ""}
        ${dmgContact || dmgDistance ? `
        <div class="barre-actions" style="margin-top:6px;">
          ${dmgContact ? `<button class="btn petit secondaire" data-bm-degats="${dmgContact}">🎲 Dégâts Contact (${dmgContact})</button>` : ""}
          ${dmgDistance ? `<button class="btn petit secondaire" data-bm-degats="${dmgDistance}">🎲 Dégâts Distance (${dmgDistance})</button>` : ""}
        </div>` : ""}
      </div>
      ${htmlEtatsActifs(p)}
      ${htmlBlocInitiativeJoueur(id)}
      ${htmlBlocCorruption(p, perso)}
      <div class="carte">
        <h3 style="margin-top:0;">Capacités</h3>
        <div class="cible-capacite-form" style="display:none;">
          <select class="cible-capacite-select"></select>
          <button class="btn petit or btn-confirmer-cible-capacite">Confirmer la cible</button>
          <button class="btn petit secondaire btn-annuler-cible-capacite">Annuler</button>
        </div>
        ${htmlCapacitesClasse(p, c)}
      </div>
      ${race ? `<div class="carte"><h3>Capacités raciales — ${race.voie_nom}</h3>${htmlCapacitesRace(p, race)}</div>` : ""}
    `;
    majBarrePvSidebar(p);
    document.getElementById("bm-pv-plus").onclick = () => ajusterPv(id, +1);
    document.getElementById("bm-pv-moins").onclick = () => ajusterPv(id, -1);
    document.getElementById("bm-pv-actuel").onchange = (e) => definirPv(id, parseInt(e.target.value, 10));
    document.getElementById("bm-voir-fiche-complete").onclick = () => { allerVers("fiche"); afficherFiche(id); };
    wireDegatsSubis(id, "bm-");
    // Jet d'attaque sans quitter la battlemap — l'overlay de jet est visible
    // sur tous les onglets (cf. #overlay-jet), pas besoin de rejoindre "Dés".
    sidebar.querySelectorAll("[data-bm-attaque]").forEach((el) => {
      el.onclick = () => {
        const bonus = parseInt(el.dataset.bonus, 10);
        lancerTest(`Attaque ${el.dataset.bmAttaque}`, bonus, perso.critMinAttaque(el.dataset.bmAttaque));
      };
    });
    // Dégâts de l'arme équipée (formule figée, pas de bonus au jet ici)
    sidebar.querySelectorAll("[data-bm-degats]").forEach((el) => {
      el.onclick = () => {
        const formule = el.dataset.bmDegats;
        lancerFormule(formule, `${p.nom} — Dégâts (${formule})`);
      };
    });
    // Capacités/états, mêmes règles que la fiche complète (cf. wireCapacitesEtEtats).
    wireCapacitesEtEtats(sidebar, id, p, () => rendreFicheSidebarBattlemap(id));
  }

  /* ---------- Navigation onglets ---------- */

  function allerVers(panneau) {
    document.querySelectorAll("nav.tabs button").forEach((b) => {
      b.classList.toggle("actif", b.dataset.panneau === panneau);
    });
    document.querySelectorAll(".panneau").forEach((p) => {
      p.classList.toggle("actif", p.id === "panneau-" + panneau);
    });
    if (panneau === "fiche") { rendreListePersos(); _mettreAJourLootFiche(); }
    if (panneau === "loot" && typeof Loot !== "undefined") Loot.rendreCatalogue();
    if (panneau === "regles") rendreRegles();
    if (panneau === "bestiaire") rendreBestiaire();
    if (panneau === "table-combat") { rendreOrdreInitiative(); rendreTableCombat(); }
    if (panneau === "carte" && typeof Carte !== "undefined") {
      Carte.onOpen();
      if (role === "joueur") rendreSelecteurMonPerso();
      if (role === "mj") rendreTableCombat("battlemap-zone-table-combat");
      _appliquerCarteMode();
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
      genre: "homme", // "homme" | "femme" — détermine le portrait de race affiché
      race: null,
      raceVariante: null, // nation elfique (aetharion / aelindra / mordanel), si race = elfe
      caracs: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
      caracsLibres: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 }, // points libres répartis (point-buy)
      capacites: [], // [{voie, rang}]
      capacitesRace: [], // [rang] — capacités de la voie raciale (rang 1 gratuit, 2-5 sur le pool de points partagé)
      voiesHorsProfil: [], // [{classe, voie, cout}] — voies débloquées hors du profil de classe
      portrait: null, // data URL (optionnel)
      pvMax: null,
      pvActuel: null,
      pvHistorique: [], // [{niveau, faces, jet, modCON, total}] — jets de PV par niveau
      pvNiveauActuel: 1, // dernier niveau dont les PV ont été tirés
      def: null,
      equipement: (typeof SLOTS_EQUIPEMENT !== "undefined") ? Object.fromEntries(SLOTS_EQUIPEMENT.map((s) => [s, null])) : {},
      inventaireListe: [],
      notes: "",
      proprietaire: null,    // joueurId — assigné au premier enregistrement (cf. sauverPersonnage/reclamerPerso)
      proprietaireNom: null, // prénom du joueur au moment de la revendication, pour l'affichage MJ
    };
    etapeCourante = 1;
    etapeDebloquee = 1;
  }

  /* ---------- Accordéon des étapes de création ---------- */

  const TITRES_ETAPES = {
    1: "1 · Genre, race & classe",
    2: "2 · Voies & capacités",
    3: "3 · Équipement, inventaire & finition",
  };

  function resumeEtape1() {
    const parts = [creation.genre === "femme" ? "Femme" : "Homme"];
    if (creation.race) {
      const r = RACES[creation.race];
      let txt = r.nom_affiche;
      if (creation.raceVariante && r.variantes) {
        const v = r.variantes.find((vv) => vv.code === creation.raceVariante);
        if (v) txt += ` (${v.nom_affiche})`;
      }
      parts.push(txt);
    }
    if (creation.classe) parts.push(CLASSES[creation.classe].nom_affiche);
    return parts.join(" · ");
  }

  function resumeEtape2() {
    return `${pointsVoieDepenses()}/${pointsVoieTotal()} points de capacité utilisés`;
  }

  function majAffichageEtapes() {
    for (let n = 1; n <= 3; n++) {
      const carte = document.getElementById(`etape-${n}`);
      const corps = document.getElementById(`corps-etape-${n}`);
      const entete = document.getElementById(`entete-etape-${n}`);
      if (!carte || !corps || !entete) continue;
      const debloquee = n <= etapeDebloquee;
      carte.style.display = debloquee ? "block" : "none";
      if (!debloquee) continue;

      const ouverte = n === etapeCourante;
      corps.style.display = ouverte ? "block" : "none";
      entete.classList.toggle("repliee", !ouverte);

      let resume = "";
      if (!ouverte) {
        if (n === 1) resume = resumeEtape1();
        else if (n === 2) resume = resumeEtape2();
      }
      const h2 = entete.querySelector("h2");
      h2.innerHTML = TITRES_ETAPES[n] + (resume ? ` <span class="etape-resume">— ${echapper(resume)}</span>` : "");
    }
  }

  // Ouvre l'étape n (doit déjà avoir été débloquée) et y fait défiler la page.
  function allerEtape(n) {
    if (n > etapeDebloquee) return;
    etapeCourante = n;
    majAffichageEtapes();
    document.getElementById(`etape-${n}`).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Débloque (si besoin) puis ouvre l'étape n — utilisé par les boutons "Continuer".
  function debloquerEtape(n) {
    if (n > etapeDebloquee) etapeDebloquee = n;
    allerEtape(n);
  }

  /* ---------- Portraits : images individuelles dans assets/portraits/ ---------- */
  // Portrait de classe genre (assets/portraits/<classe>-<genre>.png) ; repli sur
  // l'ancienne planche unisexe (assets/portraits/classes/<classe>.png) si le
  // fichier genre manque (ex. necromancien-femme.png pas encore fourni).
  function portraitClasse(cle) {
    return `<img class="portrait-fig" src="assets/portraits/${cle}-${creation.genre}.png" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/portraits/classes/${cle}.png';" />`;
  }
  function portraitRace(cle) {
    return `<img class="portrait-fig" src="assets/portraits/races/${cle}-${creation.genre}.png" alt="" loading="lazy" onerror="this.style.display='none'" />`;
  }

  function rendreChoixGenre() {
    document.querySelectorAll("#choix-genre .btn-genre").forEach((b) => {
      b.classList.toggle("choisi", b.dataset.genre === creation.genre);
    });
  }

  function choisirGenre(g) {
    if (creation.genre !== g) {
      creation.genre = g;
      rendreChoixGenre();
      rendreGrilleRaces();
      rendreGrilleClasses();
      majApercuPortrait();
    }
  }

  function rendreGrilleClasses() {
    const grille = document.getElementById("grille-classes");
    grille.innerHTML = "";
    ORDRE_CLASSES.forEach((cle) => {
      const c = CLASSES[cle];
      const div = document.createElement("div");
      div.className = "classe-carte" + (creation.classe === cle ? " choisie" : "");
      div.innerHTML =
        portraitClasse(cle) +
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
      appliquerEquipementDepart(cle); // équipe le kit de départ (uniquement à la création, pas en édition)
      rendreEquipInventaireCreation();
    }
    rendreGrilleClasses();
    document.getElementById("bloc-caracs").style.display = "block";
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
        portraitRace(cle) +
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
    majApercuPortrait();
  }

  /* ---------- Voie raciale (rang 1 gratuit, rangs 2-5 sur le pool de points de capacité partagé avec les voies de classe) ---------- */

  function rangMaxRace() {
    return creation.capacitesRace.length ? Math.max(...creation.capacitesRace) : 0;
  }

  function niveauCreation() {
    return parseInt(document.getElementById("champ-niveau").value, 10) || 1;
  }

  // Résout le nom/effet/mecanique d'un rang de voie raciale, en tenant compte
  // de la variante (nation elfique au rang 3) : la variante a sa propre
  // mecanique (cf. race.variantes[].mecanique), distincte de celle du rang 3
  // générique "Héritage National" (qui n'est qu'un renvoi textuel).
  function texteRangRace(r, rg, variante) {
    if (r.variantes && rg.rang === 3 && variante) {
      const v = r.variantes.find((vv) => vv.code === variante);
      if (v) return { nom: v.nom_capacite, effet: v.effet, mecanique: v.mecanique, source: { origine: "variante", code: variante } };
    }
    return { nom: rg.nom, effet: rg.effet, mecanique: rg.mecanique, source: { origine: "race", rang: rg.rang } };
  }

  function rendreVoieRaciale() {
    if (!creation.race) return;
    const r = RACES[creation.race];
    const niveau = niveauCreation();
    const rangMax = rangMaxRace();
    const pointsRestants = pointsVoieRestants();

    const aide = document.getElementById("aide-race");
    aide.innerHTML =
      `<strong>Voie raciale</strong> — le <strong>rang 1 est acquis automatiquement</strong> et gratuit. ` +
      `Les rangs 2 à 5 puisent dans les <strong>mêmes points de capacité</strong> que les voies de classe ` +
      `(1 point pour le rang 2, 2 points pour les rangs 3 à 5), s'acquièrent dans l'ordre (impossible de ` +
      `prendre le rang 3 sans 2) et restent ` +
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
      const cout = coutRangVoie(rg.rang);
      const verrouOrdre = !choisi && rg.rang > rangMax + 1;
      const verrouNiveau = !choisi && !auto && niveau <= 1;
      const verrouPoints = !choisi && !auto && cout > pointsRestants;
      const verrou = verrouOrdre || verrouNiveau || verrouPoints;

      const { nom, effet } = texteRangRace(r, rg, creation.raceVariante);

      html +=
        `<div class="rang ${choisi ? "choisi" : ""} ${verrou ? "verrou" : ""}">` +
        `<div class="num">${rg.rang}</div>` +
        `<div class="contenu">` +
        (nom ? `<div class="nom-cap">${nom}</div>` : "") +
        `<div class="effet">${effet}</div></div>` +
        (auto ? "" : `<div class="cout-rang">${cout} pt${cout > 1 ? "s" : ""}</div>`) +
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
      rb.onchange = () => { creation.raceVariante = rb.value; rendreVoieRaciale(); majApercuPortrait(); };
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
      // Rang 1 excepté (acquis automatiquement à la sélection de race, cf.
      // choisirRace) : les rangs 2-5 puisent dans le même pool de points de
      // capacité que les voies de classe, au même tarif (coutRangVoie).
      const cout = coutRangVoie(rang);
      if (cout > pointsVoieRestants()) {
        toast("Pas assez de points de capacité.");
        rendreVoieRaciale();
        return;
      }
      creation.capacitesRace.push(rang);
    }
    rendreVoieRaciale();
    if (creation.classe) rendreVoies(); // compteur de points de capacité partagé
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
      return;
    }
    if (suppr) suppr.style.display = "none";
    const token = cheminTokenPersonnage(creation);
    if (token) {
      ap.innerHTML = `<img src="${token}" alt="" onerror="this.outerHTML=embleme('${creation.classe}',70)" />`;
    } else {
      ap.innerHTML = creation.classe ? embleme(creation.classe, 70) : "—";
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
    // Passe par Personnage.mod() (pas le modCarac brut) pour tenir compte d'un
    // éventuel +1 CON permanent choisi via une capacité (ex. Guerrier —
    // Spécimen d'élite), cf. Personnage.bonusCaracCapacites.
    return Math.max(1, deDeVieFaces() + new Personnage(creation).mod("CON"));
  }
  // Guerrier — Voie de l'élite, rang 2 "Endurance de fer" (passive) : +1 PV par niveau.
  function bonusPvVoies() {
    return (creation.classe === "guerrier" && estChoisie("Voie de l'élite", 2)) ? niveauCreation() : 0;
  }
  function pvTotalActuel() {
    return creation.pvHistorique.reduce((total, j) => total + j.total, pvBaseNiveau1()) + bonusPvVoies();
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

  // Points déjà dépensés : rangs de voie pris + déblocages de voies hors profil +
  // rangs de voie raciale (rang 1 excepté, toujours gratuit — cf. basculerCapaciteRace)
  function pointsVoieDepenses() {
    const coutRangs = creation.capacites.reduce((t, c) => t + coutRangVoie(c.rang), 0);
    const coutDeblocages = (creation.voiesHorsProfil || []).reduce((t, hp) => t + (hp.cout || 0), 0);
    const coutRace = (creation.capacitesRace || []).reduce((t, rang) => t + (rang > 1 ? coutRangVoie(rang) : 0), 0);
    return coutRangs + coutDeblocages + coutRace;
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
        // Rappel du choix permanent fait à l'acquisition (cf. CAPACITES_A_CHOIX)
        const capEntree = creation.capacites.find((c) => c.voie === voie.nom && c.rang === r.rang);
        const choixLabel = capEntree && capEntree.choix ? _labelChoixCapacite(voie.nom, r.rang, capEntree.choix) : null;
        html +=
          `<div class="rang ${choisi ? "choisi" : ""} ${verrou ? "verrou" : ""}">` +
          `<div class="num">${r.rang}</div>` +
          `<div class="contenu">` +
          (r.nom ? `<div class="nom-cap">${r.nom}</div>` : "") +
          `<div class="effet">${r.effet}${choixLabel ? ` — <strong>Choix : ${choixLabel}</strong>` : ""}</div></div>` +
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
      // Certaines capacités fixent un choix permanent à l'acquisition (ex.
      // +2 DEF OU +1d8 DM) — on affiche une modale et on n'ajoute la
      // capacité qu'une fois le choix fait (cf. CAPACITES_A_CHOIX).
      const choixDef = CAPACITES_A_CHOIX[creation.classe + "|" + voieNom + "|" + rang];
      if (choixDef) {
        rendreVoies(); // remet la case à cocher dans son état réel (pas encore prise) en attendant le choix
        ouvrirModalChoixCapacite(choixDef, (valeurChoisie) => {
          creation.capacites.push({ voie: voieNom, rang: rang, choix: valeurChoisie });
          rendreVoies();
          recalculerDerives();
        });
        return;
      }
      creation.capacites.push({ voie: voieNom, rang: rang });
    }
    rendreVoies();
    recalculerDerives();
  }

  // Capacités dont l'acquisition fixe un choix permanent entre deux effets
  // (clé "classe|voie|rang") — le choix est mémorisé sur la capacité elle-même
  // (creation.capacites[].choix) et exploité par Personnage (cf.
  // bonusDefCapacites/capaciteEntree) pour appliquer le bon effet mécanique.
  const CAPACITES_A_CHOIX = {
    "chevalier|Voie du chaos|4": {
      titre: "Marque du serment brisé",
      consigne: "Choisis l'effet permanent (contrepartie : rejeté par les ordres de chevalerie) :",
      options: [
        { valeur: "def", label: "+2 DEF permanent" },
        { valeur: "degats", label: "+1d8 DM chaotique sur l'arme de prédilection" },
      ],
    },
    "moine|Voie de l'élévation|2": {
      titre: "Voie de l'élévation — rang 2",
      consigne: "Choisis la caractéristique ajoutée à l'Initiative et à la DEF :",
      options: [
        { valeur: "INT", label: "Modificateur d'INTELLIGENCE" },
        { valeur: "SAG", label: "Modificateur de SAGESSE" },
      ],
    },
    "guerrier|Voie de l'élite|1": {
      titre: "Spécimen d'élite",
      consigne: "Choisis la caractéristique physique qui gagne +1 permanent :",
      options: [
        { valeur: "FOR", label: "+1 FORCE" },
        { valeur: "DEX", label: "+1 DEXTÉRITÉ" },
        { valeur: "CON", label: "+1 CONSTITUTION" },
      ],
    },
    "druide|Voie du chaos|4": {
      titre: "Symbiose du chaos",
      consigne: "Choisis l'effet permanent (contrepartie : détecté comme corrompu) :",
      options: [
        { valeur: "reduction", label: "+2 réduction de dégâts" },
        { valeur: "degats", label: "+1d6 DM à tous les sorts" },
      ],
    },
  };

  function ouvrirModalChoixCapacite(config, onChoisi) {
    const modal = document.getElementById("modal-choix-capacite");
    if (!modal) { onChoisi(config.options[0].valeur); return; } // filet de sécurité si le DOM manque
    document.getElementById("modal-choix-capacite-titre").textContent = config.titre;
    document.getElementById("modal-choix-capacite-consigne").textContent = config.consigne;
    const zone = document.getElementById("modal-choix-capacite-options");
    zone.innerHTML = "";
    config.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn or";
      btn.textContent = opt.label;
      btn.onclick = () => { fermerModalChoixCapacite(); onChoisi(opt.valeur); };
      zone.appendChild(btn);
    });
    modal.style.display = "flex";
  }

  function fermerModalChoixCapacite() {
    const modal = document.getElementById("modal-choix-capacite");
    if (modal) modal.style.display = "none";
  }

  // Libellé lisible du choix mémorisé sur une capacité (ex. "+2 DEF permanent"),
  // pour le rappeler sur la fiche de création une fois le choix fait.
  function _labelChoixCapacite(voieNom, rang, valeur) {
    const cfg = CAPACITES_A_CHOIX[creation.classe + "|" + voieNom + "|" + rang];
    const opt = cfg && cfg.options.find((o) => o.valeur === valeur);
    return opt ? opt.label : valeur;
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
    const champDef = document.getElementById("champ-def");
    // On ne réécrase que si l'utilisateur n'a pas saisi manuellement
    if (!champDef.dataset.touche) champDef.value = new Personnage(creation).calculerDEF();
    appliquerPvAuto();
    // Le récap DEF affiché dans le bloc équipement (perso.calculerDEF()) doit
    // rester en phase avec le champ-def ci-dessus : sans ça, cocher/décocher
    // une capacité qui modifie la DEF (cf. Personnage.bonusDefCapacites)
    // laissait ce bloc affiché avec une valeur périmée jusqu'au prochain
    // changement d'équipement.
    rendreEquipInventaireCreation();
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
    creation.notes = document.getElementById("champ-notes").value;
    if (creation.pvActuel === null || creation.pvActuel > creation.pvMax) creation.pvActuel = creation.pvMax;
    // Marque le propriétaire au premier enregistrement seulement (jamais réécrit
    // ensuite) — cf. estProprietaire(). Un MJ qui crée un perso ne le revendique
    // pas : ça reste "non réclamé", visible de tous les joueurs (ex. PNJ commun).
    if (role === "joueur" && !creation.proprietaire) {
      creation.proprietaire = joueurId;
      creation.proprietaireNom = joueurNom;
    }

    // `_kitDepart` n'est qu'un marqueur interne à la session de création (pour
    // savoir quoi retirer si le joueur change de classe) — on ne le persiste pas.
    Object.values(creation.equipement || {}).forEach((it) => { if (it) delete it._kitDepart; });
    (creation.inventaireListe || []).forEach((it) => { if (it) delete it._kitDepart; });

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
    nouvelleCreation(); // remet aussi etapeCourante/etapeDebloquee à 1
    document.getElementById("champ-nom").value = "";
    document.getElementById("champ-niveau").value = 1;
    document.getElementById("champ-notes").value = "";
    const pv = document.getElementById("champ-pvmax"), def = document.getElementById("champ-def");
    delete pv.dataset.touche; delete def.dataset.touche; pv.value = ""; def.value = "";
    document.getElementById("bloc-caracs").style.display = "none";
    document.getElementById("bloc-voie-raciale").style.display = "none";
    majApercuPortrait();
    rendreGrilleClasses();
    rendreChoixGenre();
    rendreGrilleRaces();
    rendreEquipInventaireCreation();
    majAffichageEtapes();
  }

  /* ============================================================
     FICHE VIVANTE
     ============================================================ */

  function rendreListePersos() {
    const persos = chargerPersos();
    const liste = document.getElementById("liste-persos");
    // Un joueur ne voit que ses propres persos + les non-réclamés (cf.
    // estProprietaire) — le MJ voit tout le monde, comme avant.
    const ids = Object.keys(persos).filter((id) => estProprietaire(persos[id]));
    if (!ids.length) {
      liste.innerHTML = `<div class="vide">Aucun personnage. Crée-en un dans l'onglet « Création ».</div>`;
      return;
    }
    liste.innerHTML = "";
    ids.forEach((id) => {
      const p = persos[id];
      const c = CLASSES[p.classe];
      const r = p.race ? RACES[p.race] : null;
      const nonReclame = !p.proprietaire;
      const tuile = document.createElement("div");
      tuile.className = "perso-tuile";
      tuile.innerHTML =
        `<div class="tuile-tete">${avatarHtml(p, 48)}<div>` +
        `<h4>${p.nom}${nonReclame ? ' <span class="badge-chaos">non réclamé</span>' : (role === "mj" && p.proprietaireNom ? ` <span class="badge-chaos">${echapper(p.proprietaireNom)}</span>` : "")}</h4>` +
        `<div class="info">${c ? c.nom_affiche : p.classe}${r ? " · " + r.nom_affiche : ""} · niveau ${p.niveau} · ${p.pvActuel}/${p.pvMax} PV</div>` +
        `</div></div>` +
        `<div class="barre-actions">` +
        `<button class="btn petit or" data-act="ouvrir" data-id="${id}">Ouvrir</button>` +
        (nonReclame && role === "joueur" ? `<button class="btn petit secondaire" data-act="reclamer" data-id="${id}">C'est le mien</button>` : "") +
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
      if (b.dataset.act === "reclamer") b.onclick = () => { reclamerPerso(id); toast("Personnage réclamé ✔"); rendreListePersos(); };
    });
  }

  // Détecte une notation de dé (ex. "1d6", "2d4+2") dans le texte d'effet
  // d'une capacité, pour proposer un raccourci de lancer directement sur
  // la fiche. Renvoie null si aucun dé n'est mentionné dans le texte.
  function extraireDeCapacite(texte) {
    if (!texte) return null;
    const m = /(\d*)d(\d+)([+-]\d+)?/i.exec(texte);
    if (!m) return null;
    return `${m[1] || "1"}d${m[2]}${m[3] || ""}`;
  }

  // Bouton "⚔️ Lancer" (+ compteur d'usage) d'une capacité mécanisée — résolu
  // par js/capacites.js. Absent pour les capacités passives (rien à
  // déclencher) ou sans mecanique (pas encore mécanisée). `source` identifie
  // la capacité pour le clic (cf. data-lancer-*, relu par Capacites.lancer) :
  // { origine: "classe"|"race"|"variante", cle, voie?, rang?, code?, nomCap }.
  function htmlLancerCapacite(source, mecanique, p) {
    if (!mecanique || mecanique.type === "passive") return "";
    const attrs = [
      `data-lancer-origine="${source.origine}"`,
      `data-lancer-cle="${source.cle}"`,
      source.voie !== undefined ? `data-lancer-voie="${source.voie}"` : "",
      source.rang !== undefined ? `data-lancer-rang="${source.rang}"` : "",
      source.code !== undefined ? `data-lancer-code="${source.code}"` : "",
      `data-lancer-nom="${echapper(source.nomCap || "")}"`,
    ].filter(Boolean).join(" ");
    let html = ` <button class="btn-lancer-cap" ${attrs} title="Résoudre cette capacité">⚔️ Lancer</button>`;
    const freq = Capacites.parserFrequence(mecanique.usage && mecanique.usage.frequence);
    if (freq) {
      const cle = Capacites.cleCapacite(source);
      const entree = (p.usagesCapacites || {})[cle];
      const n = entree && entree.periode === freq.periode ? entree.utilisations : 0;
      html += ` <span class="usage-cap">${n}/${freq.max} (${freq.periode}) ` +
        `<button class="btn-reset-usage" data-reset-cle="${cle}" title="Réinitialiser ce compteur d'usage">↺</button></span>`;
    }
    return html;
  }

  // États/bonus actifs posés par Capacites.lancer (cf. p.etatsActifs) — carte
  // "États actifs" affichée seulement si la liste n'est pas vide. Pas de
  // décompte automatique de durée (aucune horloge de tour/combat dans l'app) :
  // retrait manuel via le ✕, à la table, quand la durée annoncée est passée.
  function htmlEtatsActifs(p) {
    const liste = p.etatsActifs || [];
    if (!liste.length) return "";
    const items = liste.map((e, idx) => {
      let libelle;
      if (e.idEtat) {
        const etat = typeof ETATS !== "undefined" ? ETATS[/^marquee_.+/.test(e.idEtat) ? "marquee" : e.idEtat] : null;
        libelle = etat ? etat.nom : e.idEtat;
      } else if (e.bonus) {
        libelle = `Bonus ${e.bonus.cible} ${e.bonus.valeur >= 0 ? "+" : ""}${e.bonus.valeur}`;
      } else {
        libelle = "État";
      }
      const dureeAffichee = e.dureeRestante && typeof e.dureeRestante === "object" ? e.dureeRestante.dureeAffichee : e.dureeRestante;
      return `<span class="etat-actif">${libelle}${dureeAffichee ? ` (${dureeAffichee})` : ""}${e.source ? ` · ${e.source}` : ""} ` +
        `<button class="btn-retirer-etat" data-etat-idx="${idx}" title="Retirer cet état/bonus">✕</button></span>`;
    }).join(" ");
    return `<div class="carte"><h3>États actifs</h3><div class="etats-actifs-liste">${items}</div></div>`;
  }

  // Bloc "Lancer mon initiative", visible sur la fiche vivante uniquement
  // pendant un combat où ce PJ n'a pas encore jeté (cf. js/combat.js —
  // Combat.lancerInitiativeJoueur, appelé par le joueur lui-même, jamais
  // automatiquement ni par le MJ). Une fois lancée, affiche simplement le
  // score (pas de re-bouton).
  function htmlBlocInitiativeJoueur(persoId) {
    if (typeof Combat === "undefined" || !Combat.estActif()) return "";
    const entree = Combat.etatCourant().ordre.find((e) => e.type === "pj" && e.id === persoId);
    if (!entree) return "";
    const contenu = entree.initiative === null
      ? `<button class="btn or" data-lancer-initiative="${persoId}">🎲 Lancer mon initiative</button>`
      : `<p style="margin:0;">Ton initiative : <strong>${entree.initiative}</strong>${entree.detail ? ` (${entree.detail})` : ""}</p>`;
    return `<div class="carte initiative-mini"><h3 style="margin-top:0;">Initiative</h3>${contenu}</div>`;
  }

  // Bloc "Corruption" (Voie du chaos, homebrew) — visible seulement pour un
  // perso ayant pris au moins un rang dans sa Voie du chaos (opt-in, cf.
  // Personnage.aVoieChaosActive). Jauge de combat incrémentée automatiquement
  // par Capacites.lancer() (rang.mecanique.corruption) pour les capacités au
  // gain univoque ; +/- manuels ici pour les déclencheurs passifs non
  // automatisables (ex. Guerrier/Chasseur rang 1) et les corrections de table.
  // Corruption d'Âme (majeure) ne se réinitialise jamais, y compris après combat.
  function htmlBlocCorruption(p, perso) {
    if (!perso.aVoieChaosActive() || typeof Capacites === "undefined") return "";
    const combat = p.corruptionCombat || 0;
    const majeure = p.corruptionMajeure || 0;
    const seuil = Capacites.SEUIL_CORRUPTION_MAJEURE || 6;
    return `<div class="carte corruption-bloc">
      <h3 style="margin-top:0;">☣ Corruption</h3>
      <div class="corruption-ligne">
        <span>Jauge de combat</span>
        <div class="corruption-control">
          <button data-corruption-moins="combat" title="Diminuer">−</button>
          <span class="corruption-valeur${combat > seuil ? " corruption-danger" : ""}">${combat}/${seuil}</span>
          <button data-corruption-plus="combat" title="Augmenter">+</button>
        </div>
      </div>
      <div class="corruption-ligne">
        <span>Corruption d'Âme</span>
        <div class="corruption-control">
          <button data-corruption-moins="majeure" title="Diminuer">−</button>
          <span class="corruption-valeur${majeure > 0 ? " corruption-danger" : ""}">${majeure}</span>
          <button data-corruption-plus="majeure" title="Augmenter">+</button>
        </div>
      </div>
      ${majeure >= 5 ? `<p class="aide" style="margin:6px 0 0;">⚠️ Dès Corruption d'Âme 5+ : le rang 4 « Voie du chaos » se débloque (contrepartie incluse).</p>` : ""}
    </div>`;
  }

  // Capacités de classe débloquées (p.capacites), groupées par voie — factorisé
  // pour être réutilisé tel quel par la fiche complète et la mini-fiche battlemap.
  function htmlCapacitesClasse(p, c) {
    if (!p.capacites.length) return `<div class="vide">Aucune capacité sélectionnée.</div>`;
    let capHtml = "";
    p.capacites.slice().sort((a, b) => a.voie.localeCompare(b.voie) || a.rang - b.rang).forEach((cap) => {
      const voie = c.voies.find((v) => v.nom === cap.voie);
      const rang = voie && voie.rangs.find((r) => r.rang === cap.rang);
      if (!rang) return;
      const source = { origine: "classe", cle: p.classe, voie: cap.voie, rang: cap.rang, nomCap: rang.nom || `Rang ${cap.rang}` };
      capHtml +=
        `<div class="cap-fiche ${voie.speciale ? "chaos" : ""}">` +
        `<div class="titre-cap">${rang.nom || "Rang " + cap.rang}${htmlLancerCapacite(source, rang.mecanique, p)}</div>` +
        `<div class="voie-source">${cap.voie} · rang ${cap.rang}</div>` +
        `<div class="effet-cap">${rang.effet}</div></div>`;
    });
    return capHtml;
  }

  // Capacités de la voie raciale débloquées (p.capacitesRace) + variante
  // elfique éventuelle — même logique de factorisation que ci-dessus.
  function htmlCapacitesRace(p, race) {
    if (!race) return "";
    let capRaceHtml = "";
    const liste = (p.capacitesRace || []).slice().sort((a, b) => a - b);
    if (liste.length) {
      liste.forEach((rang) => {
        const rg = race.rangs.find((x) => x.rang === rang);
        if (!rg) return;
        const { nom, effet, mecanique, source } = texteRangRace(race, rg, p.raceVariante);
        const srcComplet = Object.assign({ cle: p.race, voie: race.voie_nom, nomCap: nom || `Rang ${rang}` }, source);
        capRaceHtml +=
          `<div class="cap-fiche">` +
          `<div class="titre-cap">${nom || "Rang " + rang}${htmlLancerCapacite(srcComplet, mecanique, p)}</div>` +
          `<div class="voie-source">${race.voie_nom} · rang ${rang}</div>` +
          `<div class="effet-cap">${effet}</div></div>`;
      });
    } else {
      capRaceHtml = `<div class="vide">Aucune capacité raciale sélectionnée.</div>`;
    }
    if (race.trait_passif) {
      capRaceHtml += `<div class="aide" style="margin-top:10px;"><em>Trait racial passif :</em> ${race.trait_passif}</div>`;
    }
    return capRaceHtml;
  }

  // Wiring du bouton "⚔️ Lancer", du sélecteur de cible, du reset des
  // compteurs d'usage et du retrait manuel d'état — scoppé sur `racine`
  // (jamais `document` directement) pour que la fiche complète et la
  // mini-fiche battlemap puissent cohabiter dans le DOM sans collision.
  // `rafraichir` est appelé après toute mutation pour re-rendre la bonne vue.
  function wireCapacitesEtEtats(racine, id, p, rafraichir) {
    const pickerForme = racine.querySelector(".cible-capacite-form");
    const pickerSelect = racine.querySelector(".cible-capacite-select");
    let lancerCapaciteEnAttente = null;

    function fermerPickerCibleCapacite() {
      if (pickerForme) pickerForme.style.display = "none";
      lancerCapaciteEnAttente = null;
    }
    function resoudreCapaciteEtRafraichir(cibleId) {
      const res = Capacites.lancer({
        persoId: id,
        source: lancerCapaciteEnAttente.source,
        mecanique: lancerCapaciteEnAttente.mecanique,
        cibleId,
      });
      fermerPickerCibleCapacite();
      toast(res.messages.join(" · "));
      rafraichir();
      // La fiche complète redirige vers l'onglet "Dés" (comportement historique) ;
      // la mini-fiche battlemap reste en place, comme les attaques rapides
      // (cf. rendreFicheSidebarBattlemap) — l'overlay de jet est de toute façon
      // visible sur tous les onglets.
      if (racine.id === "zone-fiche-active") allerVers("des");
    }

    racine.querySelectorAll("[data-lancer-origine]").forEach((el) => {
      el.onclick = () => {
        const d = el.dataset;
        const source = { origine: d.lancerOrigine, cle: d.lancerCle, nomCap: d.lancerNom };
        let mecanique = null;
        if (d.lancerOrigine === "classe") {
          const cc = CLASSES[d.lancerCle];
          const v = cc && cc.voies.find((vv) => vv.nom === d.lancerVoie);
          const r = v && v.rangs.find((rr) => rr.rang === parseInt(d.lancerRang, 10));
          mecanique = r && r.mecanique;
          source.voie = d.lancerVoie;
          source.rang = parseInt(d.lancerRang, 10);
        } else if (d.lancerOrigine === "race") {
          const rc = RACES[d.lancerCle];
          const r = rc && rc.rangs.find((rr) => rr.rang === parseInt(d.lancerRang, 10));
          mecanique = r && r.mecanique;
          source.voie = d.lancerVoie;
          source.rang = parseInt(d.lancerRang, 10);
        } else if (d.lancerOrigine === "variante") {
          const rc = RACES[d.lancerCle];
          const v = rc && rc.variantes && rc.variantes.find((vv) => vv.code === d.lancerCode);
          mecanique = v && v.mecanique;
          source.code = d.lancerCode;
        }
        if (!mecanique) { toast("Capacité introuvable."); return; }
        if (mecanique.cible === "allie" || mecanique.cible === "ennemi") {
          lancerCapaciteEnAttente = { source, mecanique };
          const cibles = Capacites.listeCibles(id).filter((cc) =>
            mecanique.cible === "allie" ? cc.genre === "perso" : cc.genre === "monstre"
          );
          pickerSelect.innerHTML = cibles.length
            ? cibles.map((cc) => `<option value="${cc.id}">${echapper(cc.nom)}${cc.soi ? " (soi-même)" : ""}</option>`).join("")
            : `<option value="">Aucune cible disponible</option>`;
          pickerForme.style.display = "flex";
        } else {
          lancerCapaciteEnAttente = { source, mecanique };
          resoudreCapaciteEtRafraichir(null);
        }
      };
    });
    const btnConfirmerCible = racine.querySelector(".btn-confirmer-cible-capacite");
    const btnAnnulerCible = racine.querySelector(".btn-annuler-cible-capacite");
    if (btnConfirmerCible) {
      btnConfirmerCible.onclick = () => {
        const cibleId = pickerSelect.value;
        if (!cibleId) { toast("Choisis une cible."); return; }
        resoudreCapaciteEtRafraichir(cibleId);
      };
    }
    if (btnAnnulerCible) btnAnnulerCible.onclick = fermerPickerCibleCapacite;

    // Réinitialisation manuelle d'un compteur d'usage (nouvelle période : combat, jour, scénario...)
    racine.querySelectorAll("[data-reset-cle]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        Capacites.reinitialiserUsage(pp, el.dataset.resetCle);
        sauverPersos(persos);
        rafraichir();
      };
    });
    // Retrait manuel d'un état/bonus actif (pas de décompte automatique de durée)
    racine.querySelectorAll("[data-etat-idx]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp || !pp.etatsActifs) return;
        pp.etatsActifs.splice(parseInt(el.dataset.etatIdx, 10), 1);
        sauverPersos(persos);
        rafraichir();
      };
    });
    // Jet d'initiative du joueur (jamais le MJ, jamais automatique) — cf.
    // htmlBlocInitiativeJoueur. Combat.onChange (abonné une fois dans init())
    // rafraîchit déjà la vue une fois le jet enregistré, mais rafraichir()
    // ici couvre le cas où l'abonnement met plus de temps à revenir.
    racine.querySelectorAll("[data-lancer-initiative]").forEach((el) => {
      el.onclick = () => {
        if (typeof Combat === "undefined") return;
        Combat.lancerInitiativeJoueur(el.dataset.lancerInitiative);
        rafraichir();
      };
    });
    // Ajustement manuel de la jauge de Corruption (cf. htmlBlocCorruption) —
    // "combat" passe par Capacites.ajusterCorruptionCombat (gère le seuil de
    // Corruption d'Âme et le clamp à 0), "majeure" s'ajuste directement (pas
    // de seuil au-dessus, correction de table pure).
    racine.querySelectorAll("[data-corruption-plus]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        if (el.dataset.corruptionPlus === "combat") Capacites.ajusterCorruptionCombat(pp, 1);
        else pp.corruptionMajeure = (pp.corruptionMajeure || 0) + 1;
        sauverPersos(persos);
        rafraichir();
      };
    });
    racine.querySelectorAll("[data-corruption-moins]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        if (el.dataset.corruptionMoins === "combat") Capacites.ajusterCorruptionCombat(pp, -1);
        else pp.corruptionMajeure = Math.max(0, (pp.corruptionMajeure || 0) - 1);
        sauverPersos(persos);
        rafraichir();
      };
    });
  }

  /* ============================================================
     ÉQUIPEMENT / INVENTAIRE — colonne droite de la fiche
     ============================================================ */

  const LABELS_SLOT = {
    tete: "Tête", torse: "Torse", jambe: "Jambes", botte: "Bottes",
    avant_bras: "Avant-bras", main_droite: "Main droite", main_gauche: "Main gauche",
    collier: "Collier", bague: "Bague",
  };

  // Résumé chiffré de l'effet d'un item, pour les badges de slot/inventaire.
  // bonusDegatsTotal (posé par Raretes.appliquer) prime sur enchantement seul,
  // sinon le bonus de rareté d'une arme donnée par le MJ n'apparaissait jamais.
  function badgeEffetItem(it) {
    if (!it) return "";
    if (it.type === "arme") {
      const bonus = it.bonusDegatsTotal !== undefined ? it.bonusDegatsTotal : (it.enchantement || 0);
      return [it.degats, it.typedegats, bonus ? "+" + bonus : ""].filter(Boolean).join(" ");
    }
    if (it.type === "armure") return it.valeurArmure ? `+${it.valeurArmure} armure` : "";
    if (it.type === "bouclier") return it.bonusDEF ? `+${it.bonusDEF} DEF` : "";
    if (it.type === "accessoire") return it.effet || "";
    return "";
  }

  // Badge de rareté (même modèle visuel que le modal loot) affiché à côté du
  // nom dans l'inventaire/l'équipement — absent si l'item n'a jamais été
  // passé par Raretes.appliquer (kit de départ, ajout manuel "divers"...).
  function badgeRareteHtml(it) {
    if (!it || !it.rareteNom) return "";
    return ` <span class="badge-rarete" style="background:${it.rareteCouleur || ""}">${echapper(it.rareteNom)}</span>`;
  }

  function rendreBlocEquipement(perso) {
    const casesHtml = SLOTS_EQUIPEMENT.map((slot) => {
      const it = perso.equipement[slot];
      if (it) {
        const badge = badgeEffetItem(it);
        return `<div class="slot-case occupe" data-slot="${slot}">
          <div class="slot-label">${LABELS_SLOT[slot]}</div>
          <div class="slot-item-nom" style="color:${it.rareteCouleur || ""}">${echapper(it.nom)}</div>
          ${badgeRareteHtml(it)}
          <div class="slot-item-effet">${echapper(badge)}</div>
          <button class="btn petit danger btn-desequiper" data-slot="${slot}">Retirer</button>
        </div>`;
      }
      return `<div class="slot-case" data-slot="${slot}">
        <div class="slot-label">${LABELS_SLOT[slot]}</div>
        <div style="flex:1;"></div>
        <button class="btn petit secondaire btn-ouvrir-equiper" data-slot="${slot}">+ Équiper</button>
      </div>`;
    }).join("");

    return `
      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:1rem;">🛡️ Équipement</h3>
        <div class="slots-equipement">${casesHtml}</div>
        <div class="recap-equipement">
          <div>DEF totale : <strong>${perso.calculerDEF()}</strong> (dont +${perso.bonusDefEquipement()} équipement)</div>
          <div>Réduction de dégâts : <strong>${perso.reductionDegats()}</strong></div>
        </div>
        <div class="selecteur-slot" id="selecteur-slot-equip" style="display:none;"></div>
      </div>`;
  }

  // `persoId` : id réel du personnage (fiche déjà sauvegardée) — falsy pendant
  // la création (le brouillard `creation` n'a pas encore d'id, et il n'y a pas
  // encore de "l'autre joueur à qui donner" pertinent avant sauvegarde). Le
  // bouton "Donner" n'apparaît donc que sur une fiche réelle.
  function rendreBlocInventaire(perso, persoId) {
    const items = perso.inventaireListe || [];
    const listeHtml = items.length
      ? items.map((it, idx) => {
          const equipable = Personnage.slotsPourType(it).length > 0;
          const badge = badgeEffetItem(it);
          const soin = formuleSoinItem(it);
          return `<div class="inv-item">
            <div class="inv-item-header">
              <span class="inv-item-nom" style="color:${it.rareteCouleur || ""}">${echapper(it.nom)}</span>${badgeRareteHtml(it)}
              ${it.type ? `<span class="loot-badge loot-badge-${it.type}">${echapper(it.type)}</span>` : ""}
            </div>
            ${badge ? `<div class="inv-item-stats">${echapper(badge)}</div>` : ""}
            ${it.effetRarete ? `<div class="inv-item-stats" style="color:${it.rareteCouleur || ""}">✨ ${echapper(it.effetRarete)}</div>` : ""}
            ${it.bonusAttaqueMagique ? `<div class="inv-item-stats">+${it.bonusAttaqueMagique} attaque magique</div>` : ""}
            ${it.description ? `<div class="inv-item-desc">${echapper(it.description)}</div>` : ""}
            <div class="inv-actions">
              ${equipable ? `<button class="btn petit or btn-equiper-depuis-inv" data-idx="${idx}">Équiper</button>` : ""}
              ${soin && persoId ? `<button class="btn petit or btn-utiliser-item" data-idx="${idx}">🧪 Utiliser</button>` : ""}
              ${soin && persoId ? `<button class="btn petit secondaire btn-soigner-allie" data-idx="${idx}">❤ Soigner un allié</button>` : ""}
              ${persoId ? `<button class="btn petit secondaire btn-donner-item" data-idx="${idx}">🎁 Donner</button>` : ""}
              <button class="btn petit danger btn-jeter-item" data-idx="${idx}">Jeter</button>
            </div>
          </div>`;
        }).join("")
      : `<div class="vide">Inventaire vide.</div>`;

    return `
      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:1rem;">🎒 Inventaire</h3>
        <div>${listeHtml}</div>
        <button class="btn petit secondaire" id="btn-ajouter-item" style="width:100%;margin-top:10px;">+ Ajouter un objet</button>
        <div class="form-ajout-item" id="form-ajout-item" style="display:none;">
          <select id="nouvel-item-catalogue">
            <option value="">— Choisir un objet —</option>
            ${optionsCatalogueLoot()}
            <option value="__divers__">Objet divers (or, quête...)</option>
          </select>
          <div id="nouvel-item-divers-champs" style="display:none;flex-direction:column;gap:6px;">
            <input type="text" id="nouvel-item-nom" placeholder="Nom de l'objet" />
            <input type="text" id="nouvel-item-desc" placeholder="Description (optionnel)" />
          </div>
          <button class="btn petit or" id="btn-confirmer-ajout-item">Ajouter</button>
        </div>
        ${persoId ? `<div class="selecteur-slot" id="selecteur-don-item" style="display:none;"></div>` : ""}
        ${persoId ? `<div class="selecteur-slot" id="selecteur-soin-item" style="display:none;"></div>` : ""}
      </div>`;
  }

  /* ---------- Équipement de départ (kit automatique au choix de la classe) ----------
     N'est appelé que depuis choisirClasse() lors d'un vrai changement de classe
     pendant la création initiale (jamais depuis editerPerso(), qui appelle
     choisirClasse() avec la classe déjà en place — voir le garde-fou
     `creation.classe !== cle` dans choisirClasse). Retire d'abord le kit de la
     classe précédemment sélectionnée dans cette session, pour ne jamais
     accumuler les kits si le joueur change d'avis plusieurs fois. */
  function appliquerEquipementDepart(cle) {
    // Retire le kit précédent des slots qu'il peut occuper (tête/jambes/bottes/
    // avant-bras/collier/bague ne sont jamais touchés : rien n'y est placé ici).
    creation.equipement.main_droite = null;
    creation.equipement.main_gauche = null;
    creation.equipement.torse = null;
    // Retire les consommables du kit précédent (marqués _kitDepart), en
    // laissant intacts les objets ajoutés manuellement par le joueur.
    creation.inventaireListe = (creation.inventaireListe || []).filter((it) => !it._kitDepart);

    const kit = (typeof EQUIPEMENT_DEPART !== "undefined") ? EQUIPEMENT_DEPART[cle] : null;
    if (!kit || typeof LOOT_CATALOGUE === "undefined") return;
    const depuisCatalogue = (id) => LOOT_CATALOGUE.find((it) => it.id === id);

    if (kit.arme) {
      const arme = depuisCatalogue(kit.arme);
      if (arme) {
        const copie = Object.assign({}, arme, { _kitDepart: true });
        creation.equipement.main_droite = copie;
        if (arme.deuxMains) creation.equipement.main_gauche = copie; // même instance dans les 2 mains, comme Personnage.equiper()
      }
    }
    if (kit.bouclier && !creation.equipement.main_gauche) {
      const bouclier = depuisCatalogue(kit.bouclier);
      if (bouclier) creation.equipement.main_gauche = Object.assign({}, bouclier, { _kitDepart: true });
    }
    if (kit.armure) {
      const armure = depuisCatalogue(kit.armure);
      if (armure) creation.equipement.torse = Object.assign({}, armure, { _kitDepart: true });
    }
    (kit.consommables || []).forEach((id) => {
      const item = depuisCatalogue(id);
      if (item) creation.inventaireListe.push(Object.assign({}, item, { _kitDepart: true }));
    });
  }

  /* ---------- Équipement / Inventaire pendant la création (avant sauvegarde, pas encore de persoId) ----------
     Même bloc visuel que la fiche (rendreBlocEquipement / rendreBlocInventaire), mais on
     mute directement `creation.equipement` / `creation.inventaireListe` au lieu de passer
     par chargerPersos()/sauverPersos() (le personnage n'existe pas encore en stockage). */

  function rendreEquipInventaireCreation() {
    const zone = document.getElementById("creation-equip-inventaire");
    if (!zone) return;
    const perso = new Personnage(creation); // partage les mêmes objets/tableaux que `creation`
    zone.innerHTML = rendreBlocEquipement(perso) + rendreBlocInventaire(perso);
    wireEquipInventaireCreation();
  }

  function wireEquipInventaireCreation() {
    const zone = document.getElementById("creation-equip-inventaire");
    if (!zone) return;
    zone.querySelectorAll(".btn-desequiper").forEach((el) => {
      el.onclick = () => desequiperItemCreation(el.dataset.slot);
    });
    zone.querySelectorAll(".btn-ouvrir-equiper").forEach((el) => {
      el.onclick = () => ouvrirSelecteurEquipCreation(el.dataset.slot);
    });
    zone.querySelectorAll(".btn-equiper-depuis-inv").forEach((el) => {
      el.onclick = () => equiperItemCreation(parseInt(el.dataset.idx, 10));
    });
    zone.querySelectorAll(".btn-jeter-item").forEach((el) => {
      el.onclick = () => jeterItemCreation(parseInt(el.dataset.idx, 10));
    });

    const btnAjouterItem = document.getElementById("btn-ajouter-item");
    const formAjouterItem = document.getElementById("form-ajout-item");
    if (!btnAjouterItem || !formAjouterItem) return;
    btnAjouterItem.onclick = () => {
      formAjouterItem.style.display = formAjouterItem.style.display === "none" ? "flex" : "none";
    };
    const selectCatalogue = document.getElementById("nouvel-item-catalogue");
    const diversChamps = document.getElementById("nouvel-item-divers-champs");
    selectCatalogue.onchange = () => {
      diversChamps.style.display = selectCatalogue.value === "__divers__" ? "flex" : "none";
    };
    document.getElementById("btn-confirmer-ajout-item").onclick = () => {
      const choix = selectCatalogue.value;
      if (!choix) { toast("Choisis un objet dans la liste."); return; }
      if (choix === "__divers__") {
        const nom = document.getElementById("nouvel-item-nom").value.trim();
        if (!nom) { toast("Donne un nom à l'objet."); return; }
        ajouterItemInventaireCreation({
          id: "manuel-" + Date.now(),
          nom,
          type: "divers",
          description: document.getElementById("nouvel-item-desc").value.trim(),
        });
      } else {
        const catalogueItem = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.id === choix) : null;
        if (!catalogueItem) { toast("Objet introuvable dans le catalogue."); return; }
        ajouterItemInventaireCreation(Object.assign({}, catalogueItem, { itemRef: catalogueItem.id }));
      }
    };
  }

  function equiperItemCreation(idx, slotPref) {
    const perso = new Personnage(creation);
    const item = perso.inventaireListe[idx];
    if (!item) return;
    const slotsPossibles = Personnage.slotsPourType(item);
    if (!slotsPossibles.length) { toast("Cet objet ne peut pas être équipé."); return; }
    const slot = slotPref && slotsPossibles.includes(slotPref)
      ? slotPref
      : (slotsPossibles.find((s) => !perso.equipement[s]) || slotsPossibles[0]);
    const ancien = perso.equiper(slot, item);
    if (ancien === undefined) { toast("Cet objet ne peut pas être équipé dans cet emplacement."); return; }
    perso.inventaireListe.splice(idx, 1);
    if (ancien) perso.inventaireListe.push(ancien);
    rendreEquipInventaireCreation();
    recalculerDerives();
    toast(`« ${item.nom} » équipé (${LABELS_SLOT[slot]}).`);
  }

  function desequiperItemCreation(slot) {
    const perso = new Personnage(creation);
    const item = perso.deséquiper(slot);
    if (!item) return;
    perso.inventaireListe.push(item);
    rendreEquipInventaireCreation();
    recalculerDerives();
    toast(`« ${item.nom} » retiré, renvoyé dans l'inventaire.`);
  }

  function ajouterItemInventaireCreation(item) {
    creation.inventaireListe.push(item);
    rendreEquipInventaireCreation();
    toast(`« ${item.nom} » ajouté à l'inventaire.`);
  }

  function jeterItemCreation(idx) {
    const item = creation.inventaireListe[idx];
    if (!item) return;
    if (!confirm(`Jeter « ${item.nom} » ?`)) return;
    creation.inventaireListe.splice(idx, 1);
    rendreEquipInventaireCreation();
  }

  // Ouvre, dans le bloc Équipement de la création, un sélecteur des items de
  // l'inventaire compatibles avec `slot` (déclenché par "+ Équiper" sur un slot vide).
  function ouvrirSelecteurEquipCreation(slot) {
    const perso = new Personnage(creation);
    const zone = document.getElementById("selecteur-slot-equip");
    if (!zone) return;
    const compatibles = perso.inventaireListe
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => Personnage.slotsPourType(it).includes(slot));
    if (!compatibles.length) {
      zone.innerHTML = `<div class="aide">Aucun objet compatible dans l'inventaire pour « ${LABELS_SLOT[slot]} ».</div>`;
      zone.style.display = "block";
      return;
    }
    zone.innerHTML =
      `<select id="select-item-a-equiper">` +
      compatibles.map(({ it, idx }) => {
        const badge = badgeEffetItem(it);
        return `<option value="${idx}">${echapper(it.nom)}${badge ? " — " + echapper(badge) : ""}</option>`;
      }).join("") +
      `</select>` +
      `<button class="btn petit or" id="btn-confirmer-equip">Équiper dans « ${LABELS_SLOT[slot]} »</button>`;
    zone.style.display = "block";
    document.getElementById("btn-confirmer-equip").onclick = () => {
      const idx = parseInt(document.getElementById("select-item-a-equiper").value, 10);
      equiperItemCreation(idx, slot);
    };
  }

  // Ouvre, dans le bloc Équipement, un sélecteur des items de l'inventaire
  // compatibles avec `slot` (déclenché par "+ Équiper" sur un slot vide).
  function ouvrirSelecteurEquip(persoId, slot) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const zone = document.getElementById("selecteur-slot-equip");
    if (!zone) return;
    const compatibles = perso.inventaireListe
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => Personnage.slotsPourType(it).includes(slot));
    if (!compatibles.length) {
      zone.innerHTML = `<div class="aide">Aucun objet compatible dans l'inventaire pour « ${LABELS_SLOT[slot]} ».</div>`;
      zone.style.display = "block";
      return;
    }
    zone.innerHTML =
      `<select id="select-item-a-equiper">` +
      compatibles.map(({ it, idx }) => {
        const badge = badgeEffetItem(it);
        return `<option value="${idx}">${echapper(it.nom)}${badge ? " — " + echapper(badge) : ""}</option>`;
      }).join("") +
      `</select>` +
      `<button class="btn petit or" id="btn-confirmer-equip">Équiper dans « ${LABELS_SLOT[slot]} »</button>`;
    zone.style.display = "block";
    document.getElementById("btn-confirmer-equip").onclick = () => {
      const idx = parseInt(document.getElementById("select-item-a-equiper").value, 10);
      equiperItem(persoId, idx, slot);
    };
  }

  // Équipe l'item d'index `idx` de l'inventaire. slotPref force un
  // emplacement précis (choisi via le sélecteur du bloc Équipement) ; sans
  // préférence, on prend le premier emplacement libre compatible (ou, à
  // défaut, le premier emplacement compatible — l'ancien item en repart en
  // inventaire).
  function equiperItem(persoId, idx, slotPref) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const item = perso.inventaireListe[idx];
    if (!item) return;
    const slotsPossibles = Personnage.slotsPourType(item);
    if (!slotsPossibles.length) { toast("Cet objet ne peut pas être équipé."); return; }
    const slot = slotPref && slotsPossibles.includes(slotPref)
      ? slotPref
      : (slotsPossibles.find((s) => !perso.equipement[s]) || slotsPossibles[0]);
    const ancien = perso.equiper(slot, item);
    if (ancien === undefined) { toast("Cet objet ne peut pas être équipé dans cet emplacement."); return; }
    perso.inventaireListe.splice(idx, 1);
    if (ancien) perso.inventaireListe.push(ancien);
    persos[persoId] = perso.versJSON();
    sauverPersos(persos);
    afficherFiche(persoId);
    toast(`« ${item.nom} » équipé (${LABELS_SLOT[slot]}).`);
  }

  function desequiperItem(persoId, slot) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const item = perso.deséquiper(slot);
    if (!item) return;
    perso.inventaireListe.push(item);
    persos[persoId] = perso.versJSON();
    sauverPersos(persos);
    afficherFiche(persoId);
    toast(`« ${item.nom} » retiré, renvoyé dans l'inventaire.`);
  }

  function ajouterItemInventaire(persoId, item) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    perso.inventaireListe.push(item);
    persos[persoId] = perso.versJSON();
    sauverPersos(persos);
    afficherFiche(persoId);
    toast(`« ${item.nom} » ajouté à l'inventaire.`);
  }

  // <option>/<optgroup> du catalogue loot (data/loot.js), groupés par type,
  // pour le sélecteur "+ Ajouter un objet" du bloc Inventaire.
  const LABELS_TYPE_LOOT = { arme: "Armes", armure: "Armures", bouclier: "Boucliers", accessoire: "Accessoires", consommable: "Consommables" };
  function optionsCatalogueLoot() {
    if (typeof LOOT_CATALOGUE === "undefined") return "";
    const groupes = {};
    LOOT_CATALOGUE.forEach((it) => { (groupes[it.type] = groupes[it.type] || []).push(it); });
    return Object.keys(LABELS_TYPE_LOOT).filter((t) => groupes[t]).map((t) => {
      const options = groupes[t].map((it) => {
        const badge = badgeEffetItem(it);
        return `<option value="${it.id}">${echapper(it.nom)}${badge ? " — " + echapper(badge) : ""}</option>`;
      }).join("");
      return `<optgroup label="${LABELS_TYPE_LOOT[t]}">${options}</optgroup>`;
    }).join("");
  }

  function jeterItem(persoId, idx) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const item = perso.inventaireListe[idx];
    if (!item) return;
    if (!confirm(`Jeter « ${item.nom} » ?`)) return;
    perso.inventaireListe.splice(idx, 1);
    persos[persoId] = perso.versJSON();
    sauverPersos(persos);
    afficherFiche(persoId);
  }

  // Ouvre, dans le bloc Inventaire, un sélecteur des autres personnages à qui
  // donner l'item d'index `idx` (échange entre joueurs, sans passer par le
  // système de vote loot).
  function ouvrirSelecteurDon(persoId, idx) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    const zone = document.getElementById("selecteur-don-item");
    if (!zone) return;
    const autres = Object.keys(persos).filter((pid) => pid !== persoId);
    if (!autres.length) {
      zone.innerHTML = `<div class="aide">Aucun autre personnage à qui donner un objet.</div>`;
      zone.style.display = "block";
      return;
    }
    zone.innerHTML =
      `<select id="select-destinataire-don">` +
      autres.map((pid) => `<option value="${pid}">${echapper(persos[pid].nom)}</option>`).join("") +
      `</select>` +
      `<button class="btn petit or" id="btn-confirmer-don">Donner « ${echapper(item.nom)} »</button>`;
    zone.style.display = "block";
    document.getElementById("btn-confirmer-don").onclick = () => {
      const destId = document.getElementById("select-destinataire-don").value;
      donnerItem(persoId, idx, destId);
    };
  }

  function donnerItem(persoId, idx, destId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dest = persos[destId];
    if (!p || !dest) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    p.inventaireListe.splice(idx, 1);
    if (!Array.isArray(dest.inventaireListe)) dest.inventaireListe = [];
    dest.inventaireListe.push(item);
    sauverPersos(persos);
    afficherFiche(persoId);
    toast(`« ${item.nom} » donné à ${dest.nom}.`);
  }

  /* ---------- Consommables : usage direct (soin) et administration à un allié ----------
     Un consommable ne propose ces boutons que s'il soigne réellement (formule de
     dé + mention de PV dans sa description) — sinon huile sainte, antidote,
     corde... se retrouveraient avec un bouton "Utiliser" qui ne fait rien. */
  function formuleSoinItem(it) {
    if (!it || it.type !== "consommable" || !it.description || !/PV/i.test(it.description)) return null;
    return extraireDeCapacite(it.description);
  }

  // Réduit la quantité d'un consommable utilisé, retire l'entrée si elle tombe à 0.
  function _consommerUnite(perso, idx) {
    const it = perso.inventaireListe[idx];
    if (!it) return;
    const q = (it.quantite || 1) - 1;
    if (q > 0) it.quantite = q;
    else perso.inventaireListe.splice(idx, 1);
  }

  // Tire une formule "XdY(+Z)" et l'annonce dans l'historique partagé (donc
  // dans l'overlay de jet, visible sur tous les écrans) — même tirage que
  // lancerFormule, mais sans passer par la zone de résultat de l'onglet Dés :
  // ce jet accompagne un soin, pas une consultation libre du lanceur.
  function _tirerEtAnnoncer(formule, label) {
    const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec((formule || "").trim().toLowerCase().replace(/\s/g, ""));
    if (!m) return null;
    const nb = parseInt(m[1] || "1", 10);
    const faces = parseInt(m[2], 10);
    const bonus = parseInt(m[3] || "0", 10);
    const jets = [];
    let somme = 0;
    for (let i = 0; i < nb; i++) { const v = lancerDe(faces); jets.push(v); somme += v; }
    const total = somme + bonus;
    const detail = `[${jets.join(", ")}]${bonus ? " " + signe(bonus) : ""}`;
    ajouterHisto(label, total, false, false, detail);
    return total;
  }

  // Soin direct (symétrique de subirDegats) : clamp via ajusterPv, toast dédié.
  function soigner(id, montant, source) {
    if (!montant) return;
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    const avant = p.pvActuel;
    p.pvActuel = Math.max(0, Math.min(p.pvMax, p.pvActuel + montant));
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    const gain = p.pvActuel - avant;
    toast(`❤ ${p.nom} récupère ${gain} PV${source ? " (" + source + ")" : ""}.`);
  }

  // Bouton "Utiliser" : le personnage consomme lui-même l'objet, soin immédiat
  // sans jet de caractéristique (boire sa propre potion ne demande pas de test).
  function utiliserConsommable(persoId, idx) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    const formule = formuleSoinItem(item);
    if (!formule) { toast("Cet objet ne soigne pas directement."); return; }
    const total = _tirerEtAnnoncer(formule, `${p.nom} utilise ${item.nom}`);
    if (total === null) return;
    _consommerUnite(p, idx);
    sauverPersos(persos);
    afficherFiche(persoId);
    soigner(persoId, total, item.nom);
  }

  // Ouvre le sélecteur d'allié à qui administrer le consommable — même modèle
  // que ouvrirSelecteurDon, conteneur séparé pour ne pas entrer en collision
  // si les deux sélecteurs (don / soin) sont ouverts sur des objets différents.
  function ouvrirSelecteurSoin(persoId, idx) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    const zone = document.getElementById("selecteur-soin-item");
    if (!zone) return;
    const autres = Object.keys(persos).filter((pid) => pid !== persoId);
    if (!autres.length) {
      zone.innerHTML = `<div class="aide">Aucun allié à qui administrer cet objet.</div>`;
      zone.style.display = "block";
      return;
    }
    zone.innerHTML =
      `<select id="select-destinataire-soin">` +
      autres.map((pid) => `<option value="${pid}">${echapper(persos[pid].nom)}</option>`).join("") +
      `</select>` +
      `<button class="btn petit or" id="btn-confirmer-soin">Administrer « ${echapper(item.nom)} »</button>`;
    zone.style.display = "block";
    document.getElementById("btn-confirmer-soin").onclick = () => {
      const destId = document.getElementById("select-destinataire-soin").value;
      soignerAllie(persoId, idx, destId);
    };
  }

  // Administrer un soin à un allié demande un test de FOR (diff. 12, celle du
  // soigneur) avant de tirer le dé de soin — représente la difficulté à faire
  // boire/appliquer correctement l'objet à quelqu'un d'autre, contrairement à
  // l'utiliser sur soi-même. L'objet est consommé dans tous les cas (réussite
  // ou échec), seul le soin est conditionnel.
  function soignerAllie(persoId, idx, destId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dest = persos[destId];
    if (!p || !dest) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    const formule = formuleSoinItem(item);
    if (!formule) { toast("Cet objet ne soigne pas directement."); return; }

    const modFor = Personnage.depuisJSON(p).mod("FOR");
    const d20 = lancerDe(20);
    const totalTest = d20 + modFor;
    const reussite = totalTest >= 12;
    ajouterHisto(`${p.nom} administre ${item.nom} à ${dest.nom} — Test de FOR`, totalTest,
      d20 === 20, d20 === 1, `d20 [${d20}] ${signe(modFor)}`);

    _consommerUnite(p, idx);
    sauverPersos(persos);
    afficherFiche(persoId);
    const zone = document.getElementById("selecteur-soin-item");
    if (zone) zone.style.display = "none";

    if (!reussite) {
      toast(`Échec (${totalTest} < 12) : « ${item.nom} » gaspillé sur ${dest.nom}.`);
      return;
    }
    // Laisse le temps de lire l'overlay du test de FOR avant que le jet de
    // soin ne le remplace (un seul overlay/timer partagé, cf. afficherOverlayJet).
    setTimeout(() => {
      const total = _tirerEtAnnoncer(formule, `${dest.nom} est soigné par ${p.nom}`);
      if (total !== null) soigner(destId, total, item.nom);
    }, 1800);
  }

  function afficherFiche(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    // Garde-fou en plus du filtre de rendreListePersos (au cas où l'accès
    // viendrait d'ailleurs, ex. lien direct) — un joueur ne peut pas ouvrir la
    // fiche de quelqu'un d'autre.
    if (role === "joueur" && !estProprietaire(p)) { toast("Ce n'est pas ton personnage."); return; }
    ficheActiveId = id;
    const c = CLASSES[p.classe];
    const niveau = p.niveau;
    const perso = Personnage.depuisJSON(p); // modèle OOP : règles centralisées
    const mods = {};
    CARACS.forEach((cc) => (mods[cc.code] = perso.mod(cc.code)));

    // Bonus d'attaque (jet uniquement) via le modèle Personnage
    const attContact = perso.bonusAttaque("contact");
    const attDistance = perso.bonusAttaque("distance");
    const attMagique = perso.bonusAttaque("magique");
    const init = perso.calculerInitiative();

    const zone = document.getElementById("zone-fiche-active");

    const capHtml = htmlCapacitesClasse(p, c);

    // Voie raciale (gratuite), affichée séparément des voies de classe
    const race = p.race ? RACES[p.race] : null;
    const capRaceHtml = htmlCapacitesRace(p, race);

    zone.innerHTML = `
      <div class="fiche-layout">
        <div class="fiche-col-gauche">
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
                ${blocDegatsSubisHtml("")}
              </div>
              <div class="stat-box"><div class="label">DEF</div><div class="valeur">${perso.calculerDEF()}</div></div>
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
            <p style="font-size:0.75rem;color:#8a8296;margin-top:6px;">Bonus d'attaque (jet, pas les dégâts) = bonus de progression (${ARCHETYPE_CLASSE[p.classe] || "martial"}, ${signe(perso.bonusProgression())} au niveau ${niveau}) + modificateur. Ajuste selon tes voies (ex. +1 Tir ajusté) au moment du jet via l'onglet Dés si besoin.</p>
          </div>

          ${htmlEtatsActifs(p)}
          ${htmlBlocInitiativeJoueur(id)}
          ${htmlBlocCorruption(p, perso)}

          <div class="carte">
            <h3>Capacités</h3>
            <div class="cible-capacite-form" style="display:none;">
              <select class="cible-capacite-select"></select>
              <button class="btn petit or btn-confirmer-cible-capacite">Confirmer la cible</button>
              <button class="btn petit secondaire btn-annuler-cible-capacite">Annuler</button>
            </div>
            ${capHtml}
          </div>

          ${race ? `<div class="carte"><h3>Capacités raciales — ${race.voie_nom}</h3>${capRaceHtml}</div>` : ""}

          <div class="carte">
            <h3>Notes</h3>
            <textarea id="fiche-notes" rows="5" style="width:100%;resize:vertical;font-family:inherit;font-size:0.9rem;" placeholder="Notes libres (idées, quêtes en cours, objectifs...)">${echapper(p.notes || "")}</textarea>
          </div>
        </div>

        <div class="fiche-col-droite">
          ${rendreBlocEquipement(perso)}
          ${rendreBlocInventaire(perso, id)}
        </div>
      </div>
    `;

    majBarrePv(p);

    // Boutons PV
    document.getElementById("pv-plus").onclick = () => ajusterPv(id, +1);
    document.getElementById("pv-moins").onclick = () => ajusterPv(id, -1);
    document.getElementById("pv-actuel").onchange = (e) => definirPv(id, parseInt(e.target.value, 10));
    document.getElementById("fiche-notes").onchange = (e) => definirNotes(id, e.target.value);
    wireDegatsSubis(id, "");
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
        lancerTest(`Attaque ${el.dataset.attaque}`, bonus, perso.critMinAttaque(el.dataset.attaque));
        allerVers("des");
      };
    });
    // Capacités (bouton "⚔️ Lancer"), compteurs d'usage et retrait manuel
    // d'état — logique partagée avec la mini-fiche battlemap (cf.
    // wireCapacitesEtEtats, scoppée sur `zone` pour ne jamais toucher au DOM
    // de l'autre vue si les deux sont montées en même temps).
    wireCapacitesEtEtats(zone, id, p, () => afficherFiche(id));
    document.getElementById("btn-niveau-up").onclick = () => monterDeNiveau(id);
    document.getElementById("btn-editer-fiche").onclick = () => editerPerso(id);
    document.getElementById("btn-exporter-fiche").onclick = () => exporterPerso(id);

    // Équipement — retirer un item équipé
    zone.querySelectorAll(".btn-desequiper").forEach((el) => {
      el.onclick = () => desequiperItem(id, el.dataset.slot);
    });
    // Équipement — ouvrir le sélecteur d'un slot vide
    zone.querySelectorAll(".btn-ouvrir-equiper").forEach((el) => {
      el.onclick = () => ouvrirSelecteurEquip(id, el.dataset.slot);
    });
    // Inventaire — équiper directement (choisit l'emplacement automatiquement)
    zone.querySelectorAll(".btn-equiper-depuis-inv").forEach((el) => {
      el.onclick = () => equiperItem(id, parseInt(el.dataset.idx, 10));
    });
    // Inventaire — jeter un objet
    zone.querySelectorAll(".btn-jeter-item").forEach((el) => {
      el.onclick = () => jeterItem(id, parseInt(el.dataset.idx, 10));
    });
    // Inventaire — donner l'objet à un autre personnage (échange entre joueurs)
    zone.querySelectorAll(".btn-donner-item").forEach((el) => {
      el.onclick = () => ouvrirSelecteurDon(id, parseInt(el.dataset.idx, 10));
    });
    // Inventaire — consommer un objet de soin sur soi-même
    zone.querySelectorAll(".btn-utiliser-item").forEach((el) => {
      el.onclick = () => utiliserConsommable(id, parseInt(el.dataset.idx, 10));
    });
    // Inventaire — administrer un objet de soin à un allié (test de FOR)
    zone.querySelectorAll(".btn-soigner-allie").forEach((el) => {
      el.onclick = () => ouvrirSelecteurSoin(id, parseInt(el.dataset.idx, 10));
    });
    // Inventaire — formulaire d'ajout, lié au catalogue loot (+ option "divers")
    const btnAjouterItem = document.getElementById("btn-ajouter-item");
    const formAjouterItem = document.getElementById("form-ajout-item");
    if (btnAjouterItem && formAjouterItem) {
      btnAjouterItem.onclick = () => {
        formAjouterItem.style.display = formAjouterItem.style.display === "none" ? "flex" : "none";
      };
      const selectCatalogue = document.getElementById("nouvel-item-catalogue");
      const diversChamps = document.getElementById("nouvel-item-divers-champs");
      selectCatalogue.onchange = () => {
        diversChamps.style.display = selectCatalogue.value === "__divers__" ? "flex" : "none";
      };
      document.getElementById("btn-confirmer-ajout-item").onclick = () => {
        const choix = selectCatalogue.value;
        if (!choix) { toast("Choisis un objet dans la liste."); return; }
        if (choix === "__divers__") {
          const nom = document.getElementById("nouvel-item-nom").value.trim();
          if (!nom) { toast("Donne un nom à l'objet."); return; }
          ajouterItemInventaire(id, {
            id: "manuel-" + Date.now(),
            nom,
            type: "divers",
            description: document.getElementById("nouvel-item-desc").value.trim(),
          });
        } else {
          const catalogueItem = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.id === choix) : null;
          if (!catalogueItem) { toast("Objet introuvable dans le catalogue."); return; }
          ajouterItemInventaire(id, Object.assign({}, catalogueItem, { itemRef: catalogueItem.id }));
        }
      };
    }
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
  function majBarrePvSidebar(p) {
    const pct = Math.max(0, Math.min(100, (p.pvActuel / p.pvMax) * 100));
    const el = document.getElementById("bm-barre-pv-rempli");
    if (el) el.style.width = pct + "%";
  }
  // Répercute les PV à jour sur toutes les vues actuellement montées pour ce
  // personnage (la fiche complète et/ou la mini-fiche battlemap), sans
  // supposer qu'une seule des deux est présente dans le DOM.
  function _syncPvAffichages(id, p) {
    if (ficheActiveId === id) {
      const el = document.getElementById("pv-actuel");
      if (el) el.value = p.pvActuel;
      majBarrePv(p);
    }
    if (ficheSidebarActiveId === id) {
      const el = document.getElementById("bm-pv-actuel");
      if (el) el.value = p.pvActuel;
      majBarrePvSidebar(p);
    }
  }
  function ajusterPv(id, delta) {
    const persos = chargerPersos();
    const p = persos[id];
    p.pvActuel = Math.max(0, Math.min(p.pvMax, p.pvActuel + delta));
    sauverPersos(persos);
    _syncPvAffichages(id, p);
  }
  function definirPv(id, val) {
    const persos = chargerPersos();
    const p = persos[id];
    p.pvActuel = isNaN(val) ? p.pvActuel : Math.max(0, Math.min(p.pvMax, val));
    sauverPersos(persos);
    _syncPvAffichages(id, p);
  }

  // Notes libres de la fiche vivante (idées, quêtes en cours...) — éditables
  // directement sur la fiche, pas seulement à la création du personnage.
  function definirNotes(id, val) {
    const persos = chargerPersos();
    const p = persos[id];
    p.notes = val;
    sauverPersos(persos);
  }

  // Applique un jet de dégâts subis : retranche la réduction de dégâts de
  // l'équipement (armure) avant de décompter les PV, contrairement à
  // ajusterPv/definirPv qui manipulent les PV bruts sans passer par
  // l'équipement (undo d'un soin, correction manuelle...).
  function subirDegats(id, degatsBruts) {
    degatsBruts = parseInt(degatsBruts, 10);
    if (isNaN(degatsBruts) || degatsBruts < 0) { toast("Entre un nombre de dégâts valide."); return; }
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const reduction = perso.reductionDegats();
    const degatsNets = Math.max(0, degatsBruts - reduction);
    p.pvActuel = Math.max(0, p.pvActuel - degatsNets);
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    toast(reduction > 0
      ? `🛡 ${degatsBruts} dégâts subis → ${degatsNets} après réduction d'armure (−${reduction}).`
      : `${degatsNets} dégâts subis.`);
  }

  // HTML + câblage du petit formulaire "Subir des dégâts", réutilisé par la
  // fiche complète et la mini-fiche battlemap (prefixe distingue les ids).
  function blocDegatsSubisHtml(prefixe) {
    return `
      <button class="btn petit secondaire btn-toggle-degats" id="${prefixe}btn-toggle-degats" style="width:100%;">🛡 Subir des dégâts</button>
      <div class="degats-subis" id="${prefixe}degats-subis-form" style="display:none;">
        <input type="number" id="${prefixe}champ-degats-bruts" placeholder="Dégâts bruts" min="0" />
        <button class="btn petit or" id="${prefixe}btn-appliquer-degats">Appliquer</button>
      </div>`;
  }
  function wireDegatsSubis(id, prefixe) {
    wireDegatsSubisGenerique(prefixe, (val) => subirDegats(id, val));
  }

  // Câblage générique du petit formulaire "Subir des dégâts" (toggle + input +
  // bouton + Entrée) : `appliquer(valeurBrute)` porte la logique propre à
  // l'appelant (joueur via subirDegats, monstre de la table de combat, etc.).
  function wireDegatsSubisGenerique(prefixe, appliquer) {
    const btnToggle = document.getElementById(`${prefixe}btn-toggle-degats`);
    const form = document.getElementById(`${prefixe}degats-subis-form`);
    const champ = document.getElementById(`${prefixe}champ-degats-bruts`);
    if (!btnToggle || !form || !champ) return;
    btnToggle.onclick = () => {
      form.style.display = form.style.display === "none" ? "flex" : "none";
      if (form.style.display === "flex") champ.focus();
    };
    const appliquerEtVider = () => { appliquer(champ.value); champ.value = ""; };
    document.getElementById(`${prefixe}btn-appliquer-degats`).onclick = appliquerEtVider;
    champ.addEventListener("keydown", (e) => { if (e.key === "Enter") appliquerEtVider(); });
  }

  function editerPerso(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    if (role === "joueur" && !estProprietaire(p)) { toast("Ce n'est pas ton personnage."); return; }
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
    if (!creation.equipement) creation.equipement = Object.fromEntries(SLOTS_EQUIPEMENT.map((s) => [s, null])); // compat fiches créées avant les slots d'équipement
    if (!creation.inventaireListe) creation.inventaireListe = [];
    if (!creation.genre) creation.genre = "homme"; // compat fiches créées avant le choix du genre
    allerVers("creation");
    document.getElementById("champ-nom").value = p.nom;
    document.getElementById("champ-niveau").value = p.niveau;
    document.getElementById("champ-notes").value = p.notes || "";
    const champPv = document.getElementById("champ-pvmax"), champDef = document.getElementById("champ-def");
    champPv.value = p.pvMax; champPv.dataset.touche = "1";
    champDef.value = p.def; champDef.dataset.touche = "1";
    choisirClasse(p.classe);
    rendreGrilleClasses();
    rendreCaracs();
    rendreVoies();
    rendreChoixGenre();
    rendreGrilleRaces();
    if (creation.race) {
      document.getElementById("bloc-voie-raciale").style.display = "block";
      rendreVoieRaciale();
    }
    rendreEquipInventaireCreation();
    // Personnage déjà complet : les 3 étapes sont débloquées, on ouvre sur la finition.
    etapeDebloquee = 3;
    etapeCourante = 3;
    majAffichageEtapes();
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
    if (creation.race) rendreVoieRaciale();

    toast(`Niveau ${creation.niveau} ! +${gainPv} PV (total ${pvTotalActuel()}). Points de capacité : ${pointsVoieRestants()}/${pointsVoieTotal()}. Pense à enregistrer.`);
    allerEtape(2);
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

  // Test = 1d20 + bonus, gère avantage/désavantage. critMin : seuil de
  // critique (20 par défaut, abaissé par certaines capacités — cf.
  // Personnage.critMinAttaque, ex. Guerrier "Précision létale" à 19).
  function lancerTest(label, bonus, critMin) {
    bonus = bonus || 0;
    critMin = critMin || 20;
    const mode = modeD20();
    let d1 = lancerDe(20), d2 = lancerDe(20), de, detailDes;
    if (mode === "avantage") { de = Math.max(d1, d2); detailDes = `2d20 av. [${d1}, ${d2}] → ${de}`; }
    else if (mode === "desavantage") { de = Math.min(d1, d2); detailDes = `2d20 dés. [${d1}, ${d2}] → ${de}`; }
    else { de = d1; detailDes = `d20 → ${de}`; }
    const total = de + bonus;
    const crit = (de >= critMin), echec = (de === 1);
    const detail = `${detailDes} ${signe(bonus)}`;
    afficherResultat(label, total, detail, crit, echec);
    ajouterHisto(label + " " + signe(bonus), total, crit, echec, detail);
  }

  function lancerDeSimple(faces) {
    const v = lancerDe(faces);
    const crit = (faces === 20 && v === 20), echec = (faces === 20 && v === 1);
    const detail = `1d${faces}`;
    afficherResultat(`d${faces}`, v, detail, crit, echec);
    ajouterHisto(`d${faces}`, v, crit, echec, detail);
  }

  // Parse une formule type "2d6+3" ou "1d20-1" ou "3d8". label : texte affiché
  // dans le résultat/journal à la place de la formule brute (ex. attaques de
  // monstre, où "1d4" seul ne dit pas de qui/quoi il s'agit) — par défaut la
  // formule elle-même, comme avant.
  function lancerFormule(formule, label) {
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
    const detail = `[${jets.join(", ")}] ${bonus ? signe(bonus) : ""}`;
    label = label || formule;
    afficherResultat(label, total, detail, crit, echec);
    ajouterHisto(label, total, crit, echec, detail);
  }

  function afficherResultat(label, total, detail, crit, echec) {
    const z = document.getElementById("zone-resultat");
    z.className = crit ? "crit" : echec ? "echec" : "";
    z.innerHTML =
      `<div class="label-jet">${label}${crit ? " — CRITIQUE ! 🎉" : echec ? " — Échec critique 💀" : ""}</div>` +
      `<div class="total">${total}</div>` +
      `<div class="detail">${detail}</div>`;
  }

  // Nom affiché pour attribuer un jet dans le journal partagé : le perso
  // actuellement ouvert dans "Ma fiche" si dispo, sinon celui sélectionné
  // sur la battlemap (un joueur peut lancer une attaque depuis la carte sans
  // jamais être passé par "Ma fiche"), sinon le rôle.
  function nomLanceur() {
    const id = ficheActiveId || ficheSidebarActiveId;
    if (id) {
      const p = chargerPersos()[id];
      if (p && p.nom) return p.nom;
    }
    return role === "mj" ? "MJ" : "Joueur";
  }

  function chargerHisto() { return SyncStore.get(STORAGE_HISTO) || []; }
  function ajouterHisto(label, total, crit, echec, detail) {
    const h = chargerHisto();
    h.unshift({ label, total, crit, echec, detail: detail || "", auteur: nomLanceur(), horodatage: Date.now() });
    if (h.length > 40) h.pop();
    SyncStore.set(STORAGE_HISTO, h);
    rendreHisto();
  }
  function rendreHisto() {
    const h = chargerHisto();
    const zone = document.getElementById("historique");
    if (!h.length) { zone.innerHTML = `<div class="vide">Aucun lancer pour l'instant.</div>`; return; }
    zone.innerHTML = h.map((x) =>
      `<div class="ligne-histo"><span>${x.auteur ? `<strong>${echapper(x.auteur)}</strong> — ` : ""}${echapper(x.label)}</span>` +
      `<span class="res ${x.crit ? "crit" : x.echec ? "echec" : ""}">${x.total}</span></div>`).join("");
  }
  function viderHisto() {
    SyncStore.set(STORAGE_HISTO, []);
    rendreHisto();
  }

  // Son de collision joué à chaque jet (local ou distant, cf. afficherOverlayJet).
  // Instance réutilisée + currentTime remis à 0 pour permettre des jets
  // rapprochés sans attendre la fin du son précédent.
  function _jouerSonDe() {
    try {
      if (!_sonDe) _sonDe = new Audio("assets/sounds/de-lance.mp3");
      _sonDe.currentTime = 0;
      _sonDe.play().catch(() => {}); // autoplay bloqué (rare, nécessite une interaction) : silencieux
    } catch (e) { /* pas de son plutôt que planter le jet */ }
  }

  // Remplit et affiche l'overlay de jet de dé (visible sur n'importe quel
  // onglet). entree suit le même format que les entrées de des:histo. Le dé
  // "roule" (son + rotation CSS) le temps du roulement, puis révèle le total.
  function afficherOverlayJet(entree) {
    const overlay = document.getElementById("overlay-jet");
    const d20 = document.getElementById("overlay-jet-d20");
    if (!overlay || !d20 || !entree) return;
    document.getElementById("overlay-jet-auteur").textContent = entree.auteur || "";
    document.getElementById("overlay-jet-label").textContent = entree.label;
    document.getElementById("overlay-jet-detail").textContent = entree.detail || "";
    document.getElementById("overlay-jet-total").textContent = "";
    document.getElementById("overlay-jet-badge").textContent = "";
    overlay.classList.remove("cache", "crit", "echec");
    overlay.classList.add("visible");

    if (overlayJetTimer) clearTimeout(overlayJetTimer);
    if (overlayJetRevealTimer) clearTimeout(overlayJetRevealTimer);
    // Relance l'animation même si un jet précédent tournait encore (retirer
    // puis reflow forcé, sinon le navigateur ignore un ré-ajout à l'identique).
    d20.classList.remove("en-cours");
    void d20.offsetWidth;
    d20.classList.add("en-cours");
    _jouerSonDe();

    overlayJetRevealTimer = setTimeout(() => {
      d20.classList.remove("en-cours");
      document.getElementById("overlay-jet-total").textContent = entree.total;
      document.getElementById("overlay-jet-badge").textContent =
        entree.crit ? "CRITIQUE ! 🎉" : entree.echec ? "Échec critique 💀" : "";
      if (entree.crit) overlay.classList.add("crit");
      else if (entree.echec) overlay.classList.add("echec");
      overlayJetRevealTimer = null;
      overlayJetTimer = setTimeout(() => {
        overlay.classList.remove("visible");
        overlayJetTimer = null;
      }, 5000);
    }, 620);
  }

  // Appelé à chaque synchro de l'historique partagé (voir subscribe plus
  // bas) : déclenche l'overlay uniquement pour un jet réellement nouveau.
  function _verifierNouveauJetPourOverlay() {
    const h = chargerHisto();
    if (!histoOverlayInitialise) {
      // Première synchro (chargement de page, ou joueur qui rejoint en
      // cours de session) : on mémorise juste le dernier jet déjà connu,
      // sans faire apparaître l'overlay pour de l'historique déjà ancien.
      dernierHorodatageAffiche = h.length ? h[0].horodatage : 0;
      histoOverlayInitialise = true;
      return;
    }
    if (!h.length) return; // viderHisto() : tableau vidé, pas d'overlay
    const plusRecent = h[0]; // ajouterHisto fait unshift : h[0] = le plus récent
    if (dernierHorodatageAffiche !== null && plusRecent.horodatage <= dernierHorodatageAffiche) return;
    dernierHorodatageAffiche = plusRecent.horodatage;
    afficherOverlayJet(plusRecent);
  }

  /* ============================================================
     SOUS-NAVIGATION LOCALE (réutilisable — panneaux Règles et Lore)
     ============================================================ */

  // Bascule la classe "actif" entre les boutons [data-sous-panneau] d'un
  // conteneur nav et les sous-panneaux correspondants (`zones` : { clé:
  // idDuSousPanneau }, une entrée par bouton). Même principe que la
  // navigation principale (allerVers), scopé localement pour ne pas
  // interférer avec nav.tabs. Idempotent — le wiring n'est posé qu'une seule
  // fois par nav (nav.dataset.wired) ; l'onglet actif par défaut est déjà
  // celui marqué "actif" dans le HTML statique, rien à faire ici pour ça.
  function initSousOnglets(navId, zones) {
    const nav = document.getElementById(navId);
    if (!nav || nav.dataset.wired) return;
    nav.dataset.wired = "1";
    const boutons = nav.querySelectorAll("[data-sous-panneau]");
    boutons.forEach((btn) => {
      btn.onclick = () => {
        boutons.forEach((b) => b.classList.toggle("actif", b === btn));
        Object.keys(zones).forEach((cle) => {
          const el = document.getElementById(zones[cle]);
          if (el) el.classList.toggle("actif", cle === btn.dataset.sousPanneau);
        });
      };
    });
  }

  /* ============================================================
     RÈGLES (référence)
     ============================================================ */

  function rendreRegles() {
    initSousOnglets("sous-onglets-regles", {
      general: "sous-panneau-regles-general",
      classes: "sous-panneau-regles-classes",
      etats: "sous-panneau-regles-etats",
    });

    rendreReglesGeneral();
    rendreReglesEtats();

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

  // Onglet "Général" — REGLES_GENERALES (data/donnees.js), même format que
  // LORE.sections, rendu à l'identique (une carte par section).
  function rendreReglesGeneral() {
    const zone = document.getElementById("zone-regles-general");
    if (!zone || typeof REGLES_GENERALES === "undefined") return;
    zone.innerHTML = REGLES_GENERALES.map((s) =>
      `<div class="carte"><h3 style="margin-top:0;">${echapper(s.titre)}</h3><div class="contenu">${echapper(s.contenu)}</div></div>`
    ).join("");
  }

  // Libellés lisibles des catégories d'états (js/etats.js, ORDRE_CATEGORIES_ETATS).
  const LIBELLES_CATEGORIES_ETATS = {
    controle: "Contrôle",
    malus: "Malus",
    dot: "Dégâts continus (DoT)",
    physique: "Altérations physiques",
  };

  // Onglet "États & Malus" — généré depuis le catalogue ETATS (js/etats.js),
  // aucune donnée dupliquée ici : toute nouvelle entrée du catalogue apparaît
  // automatiquement, groupée par catégorie dans l'ordre de ORDRE_CATEGORIES_ETATS.
  function rendreReglesEtats() {
    const zone = document.getElementById("zone-regles-etats");
    if (!zone || typeof ETATS === "undefined" || typeof ORDRE_CATEGORIES_ETATS === "undefined") return;
    zone.innerHTML = ORDRE_CATEGORIES_ETATS.map((cat) => {
      const ids = Object.keys(ETATS).filter((id) => ETATS[id].categorie === cat);
      if (!ids.length) return "";
      const items = ids.map((id) => {
        const e = ETATS[id];
        return `<div class="etat-regle">
          <div class="etat-regle-nom">${echapper(e.nom)}` +
          (e.parSource ? ` <span class="badge-chaos" title="Effet dépendant de sa source">selon source</span>` : "") +
          (e.reserve ? ` <span class="badge-reserve" title="Réservé — pas de source actuelle">réservé</span>` : "") +
          `</div>
          <div class="etat-regle-desc">${echapper(e.description)}</div>
          ${e.reserve ? `<p class="aide" style="margin:6px 0 0;font-size:0.78rem;">Réservé — pas de source actuelle (bestiaire/pièges futurs).</p>` : ""}
        </div>`;
      }).join("");
      return `<div class="carte"><h3 style="margin-top:0;">${LIBELLES_CATEGORIES_ETATS[cat] || cat}</h3>${items}</div>`;
    }).join("");
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

  // Couleur de badge par faction — attribuée dynamiquement (pas de mapping
  // figé par nom) depuis une petite palette, dans l'ordre de première
  // apparition dans PNJ_CLES : une nouvelle faction ajoutée aux données
  // obtient automatiquement une couleur sans retouche ici.
  const PNJ_PALETTE_FACTIONS = ["#7c5aa6", "#b8924a", "#8a2f3b", "#3a7d44", "#2980b9", "#8e44ad"];
  function _couleurFaction(faction) {
    const factions = [...new Set(PNJ_CLES.map((p) => p.faction))];
    const idx = factions.indexOf(faction);
    return PNJ_PALETTE_FACTIONS[idx % PNJ_PALETTE_FACTIONS.length];
  }

  // Onglet "PNJ" du panneau Lore — une carte par entrée de PNJ_CLES
  // (data/donnees.js), purement statique/local pour l'instant (comme le
  // reste du Lore — pas de synchro Firestore). Filtre par faction optionnel.
  let _pnjFactionFiltre = "";
  function rendrePnjCles() {
    const zone = document.getElementById("zone-lore-pnj");
    if (!zone || typeof PNJ_CLES === "undefined") return;
    const factions = [...new Set(PNJ_CLES.map((p) => p.faction))];
    const filtreHtml = `<div class="barre-actions" style="margin-bottom:14px;">` +
      `<button type="button" class="btn petit ${_pnjFactionFiltre === "" ? "or" : "secondaire"}" data-pnj-faction="">Toutes</button>` +
      factions.map((f) =>
        `<button type="button" class="btn petit ${_pnjFactionFiltre === f ? "or" : "secondaire"}" data-pnj-faction="${echapper(f)}">${echapper(f)}</button>`
      ).join("") +
      `</div>`;
    const cartesHtml = PNJ_CLES
      .filter((p) => !_pnjFactionFiltre || p.faction === _pnjFactionFiltre)
      .map((p) => `<div class="carte pnj-carte">
        <div class="pnj-entete">
          <div>
            <div class="pnj-nom">${echapper(p.nom)}</div>
            <div class="pnj-titre">${echapper(p.titre)}</div>
          </div>
          <span class="badge-faction" style="background:${_couleurFaction(p.faction)};">${echapper(p.faction)}</span>
        </div>
        <p class="pnj-resume"><em>${echapper(p.resume)}</em></p>
        <div class="contenu">${echapper(p.description)}</div>
        ${(p.accroches || []).length ? `<div class="pnj-accroches"><h4>Accroches</h4><ul>${
          p.accroches.map((a) => `<li>${echapper(a)}</li>`).join("")
        }</ul></div>` : ""}
      </div>`).join("");
    zone.innerHTML = filtreHtml + cartesHtml;
    zone.querySelectorAll("[data-pnj-faction]").forEach((btn) => {
      btn.onclick = () => { _pnjFactionFiltre = btn.dataset.pnjFaction; rendrePnjCles(); };
    });
  }

  /* ============================================================
     INITIALISATION
     ============================================================ */

  function init() {
    nouvelleCreation();
    rendreGrilleClasses();
    rendreChoixGenre();
    rendreGrilleRaces();
    rendreEquipInventaireCreation();
    rendreHisto();
    rendreLore();
    initSousOnglets("sous-onglets-lore", {
      chroniques: "sous-panneau-lore-chroniques",
      pnj: "sous-panneau-lore-pnj",
    });
    rendrePnjCles();

    document.querySelectorAll("#choix-genre .btn-genre").forEach((b) => {
      b.onclick = () => choisirGenre(b.dataset.genre);
    });

    // Accordéon de création : cliquer sur l'entête d'une étape repliée (déjà
    // débloquée) la rouvre ; les étapes non atteintes restent inaccessibles.
    [1, 2, 3].forEach((n) => {
      document.getElementById(`entete-etape-${n}`).onclick = () => {
        if (n <= etapeDebloquee && n !== etapeCourante) allerEtape(n);
      };
    });
    document.getElementById("btn-continuer-etape1").onclick = () => {
      if (!creation.classe) { toast("Choisis d'abord une classe."); return; }
      debloquerEtape(2);
    };
    document.getElementById("btn-continuer-etape2").onclick = () => debloquerEtape(3);
    majAffichageEtapes();

    // Rôle Joueur / MJ
    role = localStorage.getItem(STORAGE_ROLE);
    if (role === "joueur") assurerIdentiteJoueur();
    appliquerRole();
    document.querySelectorAll(".role-carte").forEach((b) => {
      b.onclick = () => definirRole(b.dataset.roleChoix);
    });
    const btnChangerRole = document.getElementById("btn-changer-role");
    if (btnChangerRole) btnChangerRole.onclick = changerDeRole;
    const btnRenommerJoueur = document.getElementById("btn-renommer-joueur");
    if (btnRenommerJoueur) btnRenommerJoueur.onclick = renommerJoueur;

    // Onglets
    document.querySelectorAll("nav.tabs button[data-panneau]").forEach((b) => {
      b.onclick = () => allerVers(b.dataset.panneau);
    });

    // Table de combat : se rafraîchit dès qu'un monstre est ajouté/blessé/
    // retiré, y compris depuis la carte (jeton ✕) ou un autre client (sync).
    if (typeof Carte !== "undefined" && Carte.onMonstresChange) {
      Carte.onMonstresChange(() => {
        const actif = document.querySelector(".panneau.actif")?.id;
        if (actif === "panneau-table-combat") rendreTableCombat();
        if (actif === "panneau-carte" && role === "mj" && carteMode === "battlemap") rendreTableCombat("battlemap-zone-table-combat");
      });
    }

    // Bouton + Monstre battlemap
    const btnMonstreBattle = document.getElementById("btn-monstre-battlemap");
    if (btnMonstreBattle) btnMonstreBattle.onclick = ouvrirModalMonstre;
    const btnFermerModal = document.getElementById("btn-fermer-modal-monstre");
    if (btnFermerModal) btnFermerModal.onclick = fermerModalMonstre;
    const rechercheModal = document.getElementById("modal-monstre-recherche");
    if (rechercheModal) rechercheModal.oninput = () => _peuplerListeMonstres(rechercheModal.value);
    document.getElementById("modal-monstre").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fermerModalMonstre();
    });

    // Modal choix permanent d'une capacité (ex. +2 DEF OU +1d8 DM)
    const btnFermerModalChoix = document.getElementById("btn-fermer-modal-choix-capacite");
    if (btnFermerModalChoix) btnFermerModalChoix.onclick = fermerModalChoixCapacite;
    const modalChoixCapacite = document.getElementById("modal-choix-capacite");
    if (modalChoixCapacite) modalChoixCapacite.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fermerModalChoixCapacite();
    });

    // Dropdown Carte
    const triggerCarte = document.getElementById("trigger-carte");
    const menuCarte = document.getElementById("menu-carte");
    if (triggerCarte && menuCarte) {
      triggerCarte.onclick = (e) => {
        e.stopPropagation();
        menuCarte.classList.toggle("ouvert");
      };
      menuCarte.querySelectorAll(".tab-dropdown-item").forEach((item) => {
        item.onclick = (e) => {
          e.stopPropagation();
          allerVersCarteMode(item.dataset.carteMode);
          menuCarte.classList.remove("ouvert");
        };
      });
      document.addEventListener("click", () => menuCarte.classList.remove("ouvert"));
    }

    // Création
    document.getElementById("champ-niveau").oninput = () => {
      recalculerDerives();
      if (creation.classe) { rendreVoies(); rendrePv(); }
      if (creation.race) rendreVoieRaciale();
    };
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

    // Personnages : re-rendu en temps réel quand un autre client modifie une
    // fiche (PV, capacités, niveau...) — sauverPersos() persistait déjà
    // correctement vers Firestore, mais rien ne rafraîchissait une fiche
    // déjà ouverte ailleurs tant que l'utilisateur ne renaviguait pas dessus.
    window.DepotPersos.ecouter(() => {
      const panneauFiche = document.getElementById("panneau-fiche");
      if (!panneauFiche || !panneauFiche.classList.contains("actif")) return;
      rendreListePersos();
      if (ficheActiveId && chargerPersos()[ficheActiveId]) afficherFiche(ficheActiveId);
    });

    // Journal de dés partagé : re-rendu dès qu'un autre client lance un dé.
    SyncStore.subscribe(STORAGE_HISTO, () => { rendreHisto(); _verifierNouveauJetPourOverlay(); });

    // Tracker d'initiative : re-rendu temps réel (MJ ET joueurs voient le même
    // ordre/round/tour actif), y compris le bloc "Lancer mon initiative" sur
    // la fiche d'un joueur dès que son entrée est mise à jour ailleurs.
    if (typeof Combat !== "undefined") {
      Combat.onChange(() => {
        rendreOrdreInitiative();
        if (ficheActiveId && chargerPersos()[ficheActiveId]) afficherFiche(ficheActiveId);
        if (ficheSidebarActiveId && chargerPersos()[ficheSidebarActiveId]) rendreFicheSidebarBattlemap(ficheSidebarActiveId);
      });
    }

    // Loot — fermeture modals
    const btnFermerLoot = document.getElementById("btn-fermer-modal-loot");
    if (btnFermerLoot && typeof Loot !== "undefined") btnFermerLoot.onclick = Loot.fermerModalLoot;
    const btnAnnulerLoot = document.getElementById("btn-annuler-modal-loot");
    if (btnAnnulerLoot && typeof Loot !== "undefined") btnAnnulerLoot.onclick = Loot.fermerModalLoot;
    const modalLoot = document.getElementById("modal-loot");
    if (modalLoot) modalLoot.addEventListener("click", (e) => { if (e.target === e.currentTarget && typeof Loot !== "undefined") Loot.fermerModalLoot(); });

    // Loot — polling 4s pour notifications joueur (filet de secours, cf.
    // l'abonnement temps réel ci-dessous qui couvre le cas courant).
    if (typeof Loot !== "undefined") {
      setInterval(() => {
        if (role === "joueur" && ficheActiveId) _mettreAJourLootFiche();
      }, 4000);
    }

    // Loot — notification temps réel d'un vote lancé/modifié par le MJ.
    // Sans ça, un joueur qui n'a pas "Ma fiche" ouverte au moment où le MJ
    // lance le vote (typiquement : encore sur la Carte/le Combat juste après
    // le combat) ne voyait jamais l'option de vote avant jusqu'à 4s plus tard
    // ET seulement s'il finissait par ouvrir sa fiche — cf. STORAGE_MON_PERSO,
    // seule source fiable de "quel perso est le mien" hors de la fiche.
    SyncStore.subscribe("loot:vote", (vote) => {
      if (typeof Loot === "undefined" || role !== "joueur") return;
      _mettreAJourLootFiche();
      const monId = localStorage.getItem(STORAGE_MON_PERSO) || ficheActiveId;
      if (!vote || vote.statut !== "vote_en_cours" || !monId) return;
      const monVote = vote.votes[monId];
      if (!monVote || monVote.type !== null) return;
      const surMaFiche = ficheActiveId === monId && document.getElementById("panneau-fiche")?.classList.contains("actif");
      if (!surMaFiche) toast("🎁 Nouveau loot à voter ! Va sur « Ma fiche ».");
    });
  }

  /* ============================================================
     CARTE — sous-modes Worldmap / Battlemap
     ============================================================ */

  function allerVersCarteMode(mode) {
    carteMode = mode;
    allerVers("carte");
  }

  function _appliquerCarteMode() {
    const isWorld = carteMode === "worldmap";

    // Groupes de mode dans la toolbar
    const worldGroup = document.getElementById("groupe-worldmap");
    const battleGroup = document.getElementById("groupe-battlemap");
    if (worldGroup) worldGroup.style.display = isWorld ? "" : "none";
    if (battleGroup) battleGroup.style.display = isWorld ? "none" : "";

    // Contrôles fog / jetons worldmap-only
    document.querySelectorAll(".worldmap-ctrl").forEach(el => { el.style.display = isWorld ? "" : "none"; });
    document.querySelectorAll(".worldmap-only").forEach(el => { el.style.display = isWorld ? "" : "none"; });
    document.querySelectorAll(".battlemap-only").forEach(el => { el.style.display = isWorld ? "none" : ""; });

    // Titre du panneau
    const titre = document.getElementById("titre-carte");
    if (titre) titre.textContent = "Carte — " + (isWorld ? "Worldmap" : "Battlemap");

    // Label du trigger nav
    const trigger = document.getElementById("trigger-carte");
    if (trigger) trigger.textContent = (isWorld ? "🗺 Worldmap" : "⚔ Battlemap") + " ▾";

    // Bascule la couche DD2VTT partagée (#carte-image, tokens, murs/LoS) : sans
    // ça, une scène de combat restée active en arrière-plan continuait de
    // s'afficher par-dessus la worldmap après un changement d'onglet.
    if (typeof Carte !== "undefined" && Carte.definirModeCarte) Carte.definirModeCarte(carteMode);

    // La sidebar fiche (battlemap-only) vient de changer la largeur dispo
    // pour la scène : on relaisse le temps au reflow puis on redéclenche le
    // redimensionnement (géré aujourd'hui via l'événement resize existant).
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  /* ============================================================
     MODAL MONSTRE — sélecteur pour battlemap
     ============================================================ */

  function ouvrirModalMonstre() {
    const modal = document.getElementById("modal-monstre");
    const input = document.getElementById("modal-monstre-recherche");
    if (!modal) return;
    input.value = "";
    _peuplerListeMonstres("");
    modal.style.display = "flex";
    input.focus();
  }

  function fermerModalMonstre() {
    const modal = document.getElementById("modal-monstre");
    if (modal) modal.style.display = "none";
  }

  function _peuplerListeMonstres(filtre) {
    const liste = document.getElementById("modal-monstre-liste");
    if (!liste || typeof BESTIAIRE === "undefined") return;
    const q = (filtre || "").toLowerCase().trim();
    const monstres = q
      ? BESTIAIRE.filter(m => m.nom.toLowerCase().includes(q) || (m.famille && m.famille.toLowerCase().includes(q)))
      : BESTIAIRE;

    if (!monstres.length) {
      liste.innerHTML = '<p class="vide" style="padding:12px;">Aucun résultat.</p>';
      return;
    }

    liste.innerHTML = monstres.map(m => {
      const etoiles = "★".repeat(Math.min(m.dangerosite || 0, 5));
      const emoji = m.emoji ? echapper(m.emoji) + " " : "";
      const badge = m.boss ? ' <span class="badge-boss">BOSS</span>' : "";
      const tier = m.tier ? ' <span class="badge-tier badge-tier-' + echapper(m.tier) + '">' + echapper(TIER_LABELS[m.tier] || m.tier) + "</span>" : "";
      return '<button class="modal-monstre-item" data-monstre-id="' + echapper(m.id) + '">'
        + '<span class="mmi-nom">' + emoji + echapper(m.nom) + badge + tier + '</span>'
        + '<span class="mmi-info">' + etoiles + (m.famille ? " · " + echapper(m.famille) : "") + "</span>"
        + "</button>";
    }).join("");

    liste.querySelectorAll(".modal-monstre-item").forEach(btn => {
      btn.onclick = () => {
        const m = typeof BESTIAIRE_INDEX !== "undefined" ? BESTIAIRE_INDEX[btn.dataset.monstreId] : null;
        if (m && typeof Carte !== "undefined") {
          Carte.ajouterMonstre(m);
          fermerModalMonstre();
        }
      };
    });
  }

  /* ============================================================
     TABLE DE COMBAT (MJ) — monstres posés sur la carte via "+ Monstre"
     ============================================================ */

  // Applique des dégâts bruts à un monstre de la table de combat (réduits par
  // son armure, comme subirDegats côté fiche joueur), puis rafraîchit la table.
  function subirDegatsMonstre(id, degatsBruts, targetId) {
    degatsBruts = parseInt(degatsBruts, 10);
    if (isNaN(degatsBruts) || degatsBruts < 0) { toast("Entre un nombre de dégâts valide."); return; }
    const info = Carte.appliquerDegatsCombat(id, degatsBruts);
    if (!info) return;
    toast(info.reduction > 0
      ? `🛡 ${degatsBruts} dégâts subis par ${info.nom} → ${info.degatsNets} après réduction d'armure (−${info.reduction}).`
      : `${info.degatsNets} dégâts subis par ${info.nom}.`);
    rendreTableCombat(targetId);
  }

  // Extrait le bonus d'un jet de monstre du bestiaire, ex. "1d20+3 vs DEF" -> +3.
  function extraireBonusJetMonstre(jet) {
    const m = /1d20\s*([+-]\s*\d+)/i.exec(jet || "");
    return m ? parseInt(m[1].replace(/\s/g, ""), 10) : 0;
  }

  // Boutons d'attaque rapide pour un monstre de la table de combat : une ligne
  // par attaque du bestiaire (m.monstreId -> BESTIAIRE_INDEX), jet 1d20+bonus
  // à gauche, dégâts (formule figée, pas de bonus) à droite via l'icône 🎲.
  function attaquesMonstreHtml(m) {
    const def = (typeof BESTIAIRE_INDEX !== "undefined" && m.monstreId) ? BESTIAIRE_INDEX[m.monstreId] : null;
    const attaques = def && def.attaques;
    if (!attaques || !attaques.length) return "";
    return `<div class="cm-attaques">${attaques.map((a, i) => {
      const bonus = extraireBonusJetMonstre(a.jet);
      return `<div class="cm-attaque-ligne">
        <button class="btn petit secondaire" data-monstre-jet="${m.id}" data-idx-attaque="${i}" title="${echapper(a.jet || "")}">⚔ ${echapper(a.nom)} (${signe(bonus)})</button>
        <button class="btn-de-cap" data-monstre-degats="${m.id}" data-idx-attaque="${i}" title="Dégâts : ${echapper(a.degats || "")}">🎲</button>
      </div>`;
    }).join("")}</div>`;
  }

  // Bandeau d'initiative (façon tracker de tour BG3) du panneau MJ "⚔ Combat"
  // — au-dessus de la grille de monstres (rendreTableCombat). Alimenté par
  // js/combat.js, dont l'état (SyncStore "combat:initiative") est partagé en
  // temps réel avec les joueurs (cf. abonnement Combat.onChange dans init()).
  // Avatar PJ = portrait/token de fiche (avatarHtml, js/emblemes.js) ; avatar
  // monstre = pastille couleur + initiales, même logique que les jetons de
  // la battlemap (Carte.initiales/couleur du token, js/carte.js).
  function _ligneInitiativeHtml(e, estActif) {
    let avatarInner, styleCadre = "";
    if (e.type === "pj") {
      const perso = chargerPersos()[e.id];
      avatarInner = avatarHtml(perso, 52);
    } else {
      const monstre = (typeof Carte !== "undefined" ? Carte.listeMonstresCombat() : []).find((m) => m.id === e.id);
      const couleur = (monstre && monstre.couleur) || "#7c5aa6";
      const inits = typeof Carte !== "undefined" && Carte.initiales ? Carte.initiales(e.nom) : "?";
      styleCadre = ` style="background:${couleur};"`;
      avatarInner = echapper(inits);
    }
    const badgeInitiative = e.initiative === null
      ? `<span class="initiative-badge attente">?</span>`
      : `<span class="initiative-badge">${e.initiative}</span>`;
    const titre = `${e.nom}${e.type === "monstre" ? " (monstre)" : ""}`;
    return `<div class="initiative-pastille${estActif ? " actif" : ""}${e.koTourCourant ? " ko" : ""}" title="${echapper(titre)}">
      <div class="initiative-avatar-wrap">
        <div class="initiative-avatar-cadre"${styleCadre}>${avatarInner}</div>
        ${badgeInitiative}
        ${e.koTourCourant ? `<span class="initiative-badge-ko">💀</span>` : ""}
      </div>
      <span class="initiative-nom-mini">${echapper(e.nom)}</span>
    </div>`;
  }

  function rendreOrdreInitiative() {
    const zone = document.getElementById("zone-ordre-initiative");
    if (!zone || typeof Combat === "undefined") return;

    if (!Combat.estActif()) {
      zone.innerHTML = `<div class="carte"><button class="btn or" id="btn-demarrer-combat">⚔ Lancer le combat</button></div>`;
      document.getElementById("btn-demarrer-combat").onclick = () => {
        if (role !== "mj") return;
        Combat.demarrer();
      };
      return;
    }

    const etatCombat = Combat.etatCourant();
    zone.innerHTML = `<div class="carte initiative-carte">
      <div class="initiative-entete">
        <h3 style="margin:0;">Ordre d'initiative — Round ${etatCombat.round}</h3>
        <div class="barre-actions">
          <button class="btn petit" id="btn-tour-suivant">⏭ Tour suivant</button>
          <button class="btn petit danger" id="btn-terminer-combat">⏹ Terminer le combat</button>
        </div>
      </div>
      <div class="initiative-bandeau">
        ${etatCombat.ordre.map((e, idx) => _ligneInitiativeHtml(e, idx === etatCombat.indexActuel)).join("")}
      </div>
    </div>`;

    document.getElementById("btn-tour-suivant").onclick = () => {
      if (role !== "mj") return;
      Combat.tourSuivant();
    };
    document.getElementById("btn-terminer-combat").onclick = () => {
      if (role !== "mj") return;
      if (!confirm("Terminer le combat ? Les états « finCombat » actifs sur les PJ seront purgés.")) return;
      Combat.terminerCombat();
    };
  }

  // targetId : conteneur à peupler — l'onglet dédié "Table de combat"
  // (zone-table-combat) par défaut, ou la colonne MJ de la battlemap
  // (battlemap-zone-table-combat) pour suivre les monstres sans changer d'onglet.
  function rendreTableCombat(targetId) {
    targetId = targetId || "zone-table-combat";
    const zone = document.getElementById(targetId);
    if (!zone || typeof Carte === "undefined") return;
    const monstres = Carte.listeMonstresCombat();

    if (!monstres.length) {
      zone.innerHTML = '<div class="carte"><p class="vide">Aucun monstre en combat pour l\'instant — ajoute-en un via « + Monstre » sur la carte.</p></div>';
      return;
    }

    zone.innerHTML = `<div class="grille-table-combat">${monstres.map((m) => {
      const prefixe = `cm-${m.id}-`;
      const pvMax = m.pvMax || 0;
      const pvActuel = m.pvActuel ?? pvMax;
      const morEnCombat = pvActuel <= 0;
      const etoiles = m.dangerosite ? "★".repeat(Math.min(m.dangerosite, 5)) : "";
      const badgeBoss = m.boss ? ' <span class="badge-boss">BOSS</span>' : "";
      return `
        <div class="combat-monstre${morEnCombat ? " hors-combat" : ""}" data-id="${m.id}">
          <div class="cm-entete">
            <div class="cm-nom">${echapper(m.nom)}${badgeBoss}</div>
            <button class="btn petit danger" data-suppr-monstre="${m.id}">✕</button>
          </div>
          <div class="cm-stats">
            ${m.def !== null && m.def !== undefined ? `<span>DEF ${m.def}</span>` : ""}
            <span>Armure ${m.armure || 0}</span>
            ${etoiles ? `<span>${etoiles}</span>` : ""}
          </div>
          ${attaquesMonstreHtml(m)}
          <div class="pv-control">
            <button data-pv-moins="${m.id}">−</button>
            <input type="number" value="${pvActuel}" data-pv-input="${m.id}" />
            <span style="font-weight:700;">/ ${pvMax}</span>
            <button data-pv-plus="${m.id}">+</button>
          </div>
          <div class="barre-pv"><div class="rempli" style="width:${pvMax ? Math.max(0, Math.min(100, (pvActuel / pvMax) * 100)) : 0}%;"></div></div>
          ${blocDegatsSubisHtml(prefixe)}
          ${morEnCombat ? '<div class="badge-mort">💀 Hors combat</div>' : ""}
        </div>`;
    }).join("")}</div>`;

    monstres.forEach((m) => {
      wireDegatsSubisGenerique(`cm-${m.id}-`, (val) => subirDegatsMonstre(m.id, val, targetId));
    });
    // Attaques rapides du monstre (jet à gauche, dégâts via 🎲 à droite) —
    // reste sur l'onglet courant (Battlemap ou Table de combat), comme les
    // attaques rapides du joueur.
    zone.querySelectorAll("[data-monstre-jet]").forEach((btn) => {
      btn.onclick = () => {
        const m = monstres.find((mm) => mm.id === btn.dataset.monstreJet);
        const def = m && typeof BESTIAIRE_INDEX !== "undefined" ? BESTIAIRE_INDEX[m.monstreId] : null;
        const a = def && def.attaques && def.attaques[parseInt(btn.dataset.idxAttaque, 10)];
        if (!a) return;
        lancerTest(`${m.nom} — ${a.nom}`, extraireBonusJetMonstre(a.jet));
      };
    });
    zone.querySelectorAll("[data-monstre-degats]").forEach((btn) => {
      btn.onclick = () => {
        const m = monstres.find((mm) => mm.id === btn.dataset.monstreDegats);
        const def = m && typeof BESTIAIRE_INDEX !== "undefined" ? BESTIAIRE_INDEX[m.monstreId] : null;
        const a = def && def.attaques && def.attaques[parseInt(btn.dataset.idxAttaque, 10)];
        if (!a) return;
        lancerFormule(a.degats, `${m.nom} — ${a.nom} (dégâts)`);
      };
    });
    zone.querySelectorAll("[data-pv-moins]").forEach((btn) => {
      btn.onclick = () => { Carte.ajusterPvCombat(btn.dataset.pvMoins, -1); rendreTableCombat(targetId); };
    });
    zone.querySelectorAll("[data-pv-plus]").forEach((btn) => {
      btn.onclick = () => { Carte.ajusterPvCombat(btn.dataset.pvPlus, +1); rendreTableCombat(targetId); };
    });
    zone.querySelectorAll("[data-pv-input]").forEach((input) => {
      input.onchange = () => { Carte.definirPvCombat(input.dataset.pvInput, parseInt(input.value, 10)); rendreTableCombat(targetId); };
    });
    zone.querySelectorAll("[data-suppr-monstre]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.supprMonstre;
        const m = monstres.find((mm) => mm.id === id);
        if (!confirm(`Retirer « ${m ? m.nom : "ce monstre"} » de la carte et de la table de combat ?`)) return;
        Carte.supprimerMonstreCombat(id);
        rendreTableCombat(targetId);
      };
    });
  }

  /* ============================================================
     BESTIAIRE
     ============================================================ */

  let _bestFamille = "";
  let _bestDang = "";

  function rendreBestiaire() {
    if (typeof BESTIAIRE === "undefined") return;

    // Peupler le filtre famille (une seule fois)
    const selFam = document.getElementById("filtre-famille");
    if (selFam && selFam.options.length === 1) {
      const familles = [...new Set(BESTIAIRE.map(m => m.famille).filter(Boolean))].sort();
      familles.forEach(f => {
        const o = document.createElement("option");
        o.value = f;
        o.textContent = f.charAt(0).toUpperCase() + f.slice(1);
        selFam.appendChild(o);
      });
      selFam.value = _bestFamille;
      selFam.onchange = () => { _bestFamille = selFam.value; _afficherMonstres(); };
    }

    // Filtres dangérosité
    document.querySelectorAll(".btn-dang").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".btn-dang").forEach(b => b.classList.remove("actif"));
        btn.classList.add("actif");
        _bestDang = btn.dataset.dang;
        _afficherMonstres();
      };
    });

    _afficherMonstres();
  }

  function _afficherMonstres() {
    const grille = document.getElementById("bestiaire-grille");
    const compteur = document.getElementById("bestiaire-compteur");
    if (!grille) return;

    const monstres = BESTIAIRE.filter(m => {
      if (_bestFamille && m.famille !== _bestFamille) return false;
      if (_bestDang && String(m.dangerosite) !== _bestDang) return false;
      return true;
    });

    if (compteur) compteur.textContent = `${monstres.length} monstre${monstres.length !== 1 ? "s" : ""}`;

    if (!monstres.length) {
      grille.innerHTML = '<p class="vide" style="padding:20px;">Aucun monstre ne correspond aux filtres.</p>';
      return;
    }

    grille.innerHTML = monstres.map(m => _carteMonstreHTML(m)).join("");
  }

  function _etoiles(n) {
    return "★".repeat(Math.min(n, 5)) + "☆".repeat(Math.max(0, 5 - n));
  }

  const TIER_LABELS = { basique: "Basique", veteran: "Vétéran", elite: "Élite", champion: "Champion" };

  function _carteMonstreHTML(m) {
    const emoji = m.emoji ? `<span class="monstre-emoji">${m.emoji}</span>` : "";
    const boss = m.boss ? '<span class="badge-boss">BOSS</span>' : "";
    const tier = m.tier ? `<span class="badge-tier badge-tier-${echapper(m.tier)}">${echapper(TIER_LABELS[m.tier] || m.tier)}</span>` : "";
    const taille = m.taille ? `<span class="badge-taille">${echapper(m.taille)}</span>` : "";
    const dang = `<span class="badge-dang dang-${m.dangerosite}" title="Dangérosité">${_etoiles(m.dangerosite || 0)}</span>`;

    const statsHtml = `<div class="monstre-stats">
      <span title="Points de Vie"><strong>PV</strong> ${m.pv ?? "—"}</span>
      <span title="Défense"><strong>DEF</strong> ${m.def ?? "—"}</span>
      <span title="Initiative"><strong>INIT</strong> ${m.init >= 0 ? "+" : ""}${m.init ?? "—"}</span>
      <span title="Attaque"><strong>ATK</strong> ${m.atk >= 0 ? "+" : ""}${m.atk ?? "—"}</span>
      ${m.armure ? `<span title="${echapper(m.armure.description || "")}"><strong>Armure</strong> ${m.armure.valeur ?? "—"}</span>` : ""}
    </div>`;

    const atqHtml = m.attaques && m.attaques.length
      ? `<div class="monstre-section"><strong>Attaques</strong><ul>${m.attaques.map(a =>
          `<li><em>${echapper(a.nom)}</em> — ${echapper(a.jet)} · Dégâts ${echapper(a.degats)}${a.portee ? ` (${echapper(a.portee)})` : ""}${a.effetSpecial ? ` · ${echapper(a.effetSpecial)}` : ""}</li>`
        ).join("")}</ul></div>`
      : "";

    const capHtml = m.capacitesSpeciales && m.capacitesSpeciales.length
      ? `<div class="monstre-section"><strong>Capacités spéciales</strong><ul>${m.capacitesSpeciales.map(c =>
          `<li><em>${echapper(c.nom)}</em>${c.description ? ` — ${echapper(c.description)}` : ""}</li>`
        ).join("")}</ul></div>`
      : "";

    const loreHtml = m.lore ? `<div class="monstre-section monstre-lore">${echapper(m.lore)}</div>` : "";

    return `<div class="carte carte-monstre">
      <div class="monstre-header">
        <div class="monstre-nom">${emoji} ${echapper(m.nom)} ${boss}${tier}</div>
        <div class="monstre-meta">${dang} ${taille}</div>
      </div>
      ${m.categorie || m.faction ? `<div class="monstre-sous">${[m.categorie, m.faction].filter(Boolean).map(echapper).join(" · ")}</div>` : ""}
      ${statsHtml}
      ${atqHtml}
      ${capHtml}
      ${loreHtml}
    </div>`;
  }

  /* ============================================================
     LOOT — notification joueur (gains distribués par le MJ)
     ============================================================ */

  function _mettreAJourLootFiche() {
    if (typeof Loot === "undefined") return;
    const persoId = ficheActiveId;
    if (!persoId) return;

    // Notification vote actif (réutilise la div dans panneau-fiche)
    const notifEl = document.getElementById("loot-notif-fiche");
    if (notifEl) {
      // Loot.rendreNotificationVote attend un id="loot-notif-joueur" —
      // on redirige temporairement en swappant l'id
      notifEl.id = "loot-notif-joueur";
      Loot.rendreNotificationVote(persoId);
      notifEl.id = "loot-notif-fiche";
    }
    // Les objets gagnés atterrissent dans inventaireListe et s'affichent
    // via le bloc Inventaire de la fiche (afficherFiche) — rien d'autre à
    // faire ici.
  }

  document.addEventListener("DOMContentLoaded", init);

  // API publique (utilisée par les onclick inline, et par carte.js pour
  // forcer la navigation d'un joueur quand le MJ choisit une carte)
  // — chargerPersos/sauverPersos/lancerDe/ajouterHisto sont en plus exposés
  // pour js/capacites.js (moteur de résolution des capacités mécanisées).
  return { allerVers, allerVersCarteMode, chargerPersos, sauverPersos, lancerDe, ajouterHisto };
})();
