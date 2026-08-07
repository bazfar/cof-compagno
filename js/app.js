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
  // Skin de d20 choisi par CE navigateur (local, pas synchronisé en soi) —
  // embarqué dans chaque jet (cf. ajouterHisto/afficherOverlayJet) pour que
  // les AUTRES clients affichent le bon skin sans document Firestore séparé.
  const STORAGE_SKIN_DE = "cof_skin_de";
  const SKINS_DE = {
    solvarn:   { nom: "Solvarn",             img: "assets/des/d20-solvarn-vierge.png?v=2" },
    libris:    { nom: "Libris",              img: "assets/des/d20-libris-tissage.png?v=2" },
    citadelle: { nom: "Citadelle des Ponts", img: "assets/des/d20-citadelle-ponts.png?v=2" },
  };
  const SKIN_DE_DEFAUT = "solvarn";

  function _skinDeActuel() {
    return localStorage.getItem(STORAGE_SKIN_DE) || SKIN_DE_DEFAUT;
  }
  function _skinDeImg(id) {
    return (SKINS_DE[id] || SKINS_DE[SKIN_DE_DEFAUT]).img;
  }
  // Câble les vignettes du panneau Dés (#skin-de-selecteur) : clic = mémorise
  // le choix (localStorage) et met à jour le surlignage. Le choix n'est lu
  // qu'au moment du jet suivant (cf. ajouterHisto) — pas besoin de re-render
  // ailleurs.
  function initSelecteurSkinDe() {
    const zone = document.getElementById("skin-de-selecteur");
    if (!zone) return;
    const actuel = _skinDeActuel();
    zone.querySelectorAll(".skin-de-vignette").forEach((btn) => {
      btn.classList.toggle("actif", btn.dataset.skin === actuel);
      btn.onclick = () => {
        localStorage.setItem(STORAGE_SKIN_DE, btn.dataset.skin);
        zone.querySelectorAll(".skin-de-vignette").forEach((b) =>
          b.classList.toggle("actif", b === btn)
        );
      };
    });
  }
  // Messages MJ → joueur individuel : liste partagée (SyncStore), même
  // schéma que STORAGE_HISTO — ciblage par NOM (memeNom), pas par joueurId,
  // pour rester cohérent avec le partage de livres (_rosterJoueurs/
  // _livrePartageAvecMoi), seul précédent de ciblage MJ->joueur nommé.
  const STORAGE_MESSAGES = "mj:messages";

  // État de création en cours
  let creation = null;       // objet personnage en cours de création
  // Accordéon des étapes de création : etapeCourante = étape actuellement dépliée,
  // etapeDebloquee = étape la plus avancée déjà atteinte (les étapes au-delà restent masquées).
  let etapeCourante = 1;
  let etapeDebloquee = 1;
  let ficheActiveId = null;  // id du perso affiché dans "Ma fiche"
  let ficheSidebarActiveId = null;  // id du perso affiché dans la mini-fiche battlemap (sidebar)
  // Bascules manuelles des dons Frappe puissante / Tir de précision (-2 attaque
  // / +4 dégâts) dans le dock de combat — état de session, pas persisté, ne
  // distingue pas les personnages (cf. rendreDockCombat). Arme bénie n'en fait
  // plus partie (cf. Personnage.aArmeBenie) : sort activé via le Grimoire,
  // posant un état 'arme_benie' persisté et décompté automatiquement.
  const togglesDons = { frappe_puissante: false, tir_precision: false };
  // Résolution d'une capacité d'attaque vs DEF qui vient de toucher (ou dont
  // la DEF cible est inconnue), en attente du clic sur "Lancer les dégâts"
  // (cf. Capacites.lancer/resoudreDegatsEnAttente, wireCapacitesEtEtats) —
  // état de module (pas une variable fermée locale) car la sidebar/dock/fiche
  // sont re-rendues à chaque Combat.onChange, ce qui recréerait une closure
  // vierge et perdrait l'état. Un seul slot : lancer une nouvelle capacité
  // avant d'avoir résolu les dégâts de la précédente écrase volontairement
  // l'état en attente (cf. htmlDegatsCapaciteEnAttente/resoudreCapaciteEtRafraichir).
  let capaciteDegatsEnAttente = null;
  let _cibleDistanceId = null;  // token cible choisi pour le vérificateur de portée (cf. rendreFicheSidebarBattlemap)
  let _typeAttaquePortee = "contact";  // type d'attaque choisi dans le vérificateur de portée : "contact" | "distance" | "magique" | "lancer"
  let _objetLanceIdx = null;  // index dans objetsJetables (PAS p.inventaireListe) de l'objet choisi pour 🎯 Lancer
  let livretPersoId = null;  // id du perso choisi dans l'onglet "📖 Livret"
  let mutationPersoId = null;  // id du perso choisi dans l'onglet "🧬 Mutations"
  // Sélection courante de l'onglet "🔨 Atelier" (cf. rendrePanneauAtelier) —
  // atelierItemIdx référence un index dans inventaireListe du perso choisi,
  // jamais un id stable (l'inventaire n'a pas d'id par entrée). Partagé entre
  // les deux sous-onglets (Enchantement/Alchimie) : même personnage choisi.
  let atelierPersoId = null;
  let atelierItemIdx = null;
  let atelierSystemeId = null;
  // Sélection courante du sous-onglet Alchimie (cf. _rendreAlchimieType et suite).
  let alchimieType = null;      // "soin" | "utilitaires" | "poisons"
  let alchimieFiliereId = null; // "seve" | "flambeau" (si alchimieType === "soin")
  let alchimieFamilleId = null; // "enduit" | "dard" | "piege" (si alchimieType === "poisons")
  // Compteur de tentatives/jour partagé enchantement + alchimie (clé composite
  // "categorie:sousId:palierOuRecetteId", ex. "enchantement:generique:3",
  // "alchimie:soin_seve:2", "alchimie:util:antidote") — un seul bouton MJ
  // "Nouveau jour" réinitialise les deux systèmes d'un coup.
  const STORAGE_ATELIER_TENTATIVES = "atelier:tentatives";
  // Chance d'équipe (don Chanceux, cf. data/dons.js) : pool PARTAGÉ, visible et
  // modifiable par tout le monde (contrairement à la Chance personnelle, propre
  // à chaque perso ayant le don, cf. p.chancePersonnelle dans htmlBlocChance) —
  // valeur de base nb_joueurs/2 tant que personne n'a encore ajusté le compteur,
  // purement manuel ensuite (pas de reset automatique/périodique).
  const STORAGE_CHANCE_EQUIPE = "chance:equipe";
  const STORAGE_PNJ_REVELES = "pnj:reveles"; // via SyncStore (Firestore) : ids des PNJ secrets révélés aux joueurs — irréversible
  const STORAGE_FACTIONS_ENTITES_REVELEES = "factions:entites:reveles"; // via SyncStore (Firestore) : ids d'entités de faction partiellement secrètes (ex. Inquisition, Œil de Solmaris) dont la partie cachée a été révélée aux joueurs — irréversible
  let livreOuvertId = null;  // id du livre ouvert dans l'étagère du perso (null = vue étagère)
  let livreOuvertPersoId = null; // id du perso auquel appartient le livre ouvert (le mien, ou celui d'un livre partagé avec moi)
  let role = null;           // "joueur" | "mj" | null (pas encore choisi)
  let carteMode = "worldmap"; // "worldmap" | "battlemap"
  // Identité locale du joueur (par navigateur, pas d'authentification réelle) : sert
  // à marquer un "propriétaire" sur les persos qu'il crée, cf. estProprietaire().
  let joueurId = null;
  let joueurNom = null;
  // Dernier test d20 rattaché à un PJ (cf. lancerTest) — permet une relance
  // manuelle via Pierre de chance "insistante"/"protectrice" (lot "jour"),
  // cf. _relancerDernierJet/htmlBlocPierreChance. { persoId, label, bonus,
  // critMin, mode, total, de, crit, echec } ou null.
  let dernierJetRelancable = null;

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
  let overlayJetDuoTimer = null; // phase "2 dés visibles" avant fusion, cf. afficherOverlayJet (avantage/désavantage)
  let overlayJetRevealTimerP2 = null; // équivalent overlayJetRevealTimer, pour la boîte B (cf. groupeJetId)
  // groupeJetId actuellement ancré sur la boîte A, tant qu'elle reste
  // affichée — un second jet du même groupe rejoint la boîte B au lieu de
  // remplacer la boîte A (cf. afficherOverlayJet).
  let paireJetGroupeActif = null;
  // Date.now() seul ne suffit pas : la résolution auto-chaînée d'une
  // sauvegarde réactive fait deux ajouterHisto() synchrones à la suite
  // (jet de sauvegarde puis jet de dégâts), qui atterrissent souvent dans
  // la même milliseconde. _verifierNouveauJetPourOverlay ignorerait alors
  // le second jet (horodatage <= dernierHorodatageAffiche) et la boîte B
  // n'apparaîtrait jamais. On force donc une suite strictement croissante.
  let _dernierHorodatageEmis = 0;
  function _horodatageUnique() {
    const t = Date.now();
    _dernierHorodatageEmis = t > _dernierHorodatageEmis ? t : _dernierHorodatageEmis + 1;
    return _dernierHorodatageEmis;
  }
  let _sonsDe = null; // instances Audio réutilisées (une par fichier), cf. SONS_DE
  // Même principe que SONS_ECHEC_CRITIQUE, pour le bruit de dé qui roule joué
  // à chaque jet — dossier assets/sounds/de/.
  const SONS_DE = ["de-lance.mp3"];
  let _sonsEchec = null; // instances Audio réutilisées (une par fichier), cf. SONS_ECHEC_CRITIQUE
  // Un fichier tiré au hasard à chaque échec critique, pour varier le stinger.
  // Pas de liste automatique possible (aucune API navigateur ne liste le
  // contenu d'un dossier) : pour ajouter un son, dépose le fichier dans
  // assets/sounds/echec-critique/ ET ajoute son nom ici.
  const SONS_ECHEC_CRITIQUE = [
    "echec-critique.mp3",
    "All An Ally has been Slain Classic Announcer Sounds (LoL) - Sound Effects for editing (mp3cut.net).mp3",
    "Chauve barbe vicieux (mp3cut.net).mp3",
    "Hitler Angry Moments 1 (mp3cut.net).mp3",
    "It was at this moment he knew, He f_cked up sound Effect.mp3",
    "Mario Death - Sound Effect (HD).mp3",
    "NARUTO SAD SONG  SOUND EFFECTS  cut.mp3",
    "Nelson Haha #shorts.mp3",
    "OSS 117 - Tes mauvais Jack (mp3cut.net).mp3",
    "Rickroll (Meme Template) (mp3cut.net).mp3",
    "SPONGEBOB FAIL SOUND EFFECT.mp3",
    "Sad Trombone - Sound Effect (HD).mp3",
    "Super windows error meme (Download In Description!) (mp3cut.net).mp3",
    "The Price is Right Losing Horn - Sound Effect (HD).mp3",
    "emotional damage (mp3cut.net).mp3",
    "TFTD Lana del rey my 🐱 tastes like pepsi cola (mp3cut.net).mp3",
  ];
  let _sonsSucces = null; // instances Audio réutilisées (une par fichier), cf. SONS_SUCCES_CRITIQUE
  // Même principe que SONS_ECHEC_CRITIQUE, mais pour le succès critique (20
  // naturel) — dossier assets/sounds/succes-critique/.
  const SONS_SUCCES_CRITIQUE = [
    "Abba - Money, Money, Money (Official Music Video) (mp3cut.net).mp3",
  ];
  let _sonNiveau = null; // instance Audio réutilisée pour le thème de montée de niveau
  const VOLUME_SON_NIVEAU = 0.7; // -30% par rapport au plein volume (demande de Thomas)

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

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("visible");
    if (toastTimer) clearTimeout(toastTimer);
    // 5000ms (pas 2200) : aligné sur la durée de l'overlay de dé associé
    // (5000ms pour un jet simple, cf. afficherOverlayJet) — le résultat
    // ("Touché ! (DEF 14)") reste lisible aussi longtemps que le jet lui-même.
    toastTimer = setTimeout(() => { t.classList.remove("visible"); toastTimer = null; }, 5000);
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
    // Rattrapage objets de Grimoire manquants (cf. rattraperObjetsGrimoireManquants) :
    // aussi déclenché ici (pas seulement via l'abonnement DepotPersos.ecouter
    // dans init()) pour couvrir le cas où les personnages étaient déjà
    // synchronisés avant ce choix de rôle MJ.
    if (r === "mj" && typeof rattraperObjetsGrimoireManquants === "function") rattraperObjetsGrimoireManquants();
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
    enregistrerJoueurCourant();
  }

  // DepotJoueurs (DepotDistant) n'a un cache fiable qu'une fois son tout
  // premier instantané Firestore arrivé (this._pret côté depot.js) — jamais
  // garanti synchrone au chargement de la page. Un seul abonnement, posé une
  // fois pour toutes ici (pas dans enregistrerJoueurCourant, qui peut être
  // appelée plusieurs fois par session — renommage, aller-retour de rôle —
  // et créerait sinon un abonnement supplémentaire à chaque fois).
  let _depotJoueursPret = false;
  let _enregistrerJoueurEnAttente = false;
  if (typeof window.DepotJoueurs !== "undefined") {
    window.DepotJoueurs.ecouter(() => {
      _depotJoueursPret = true;
      if (_enregistrerJoueurEnAttente) { _enregistrerJoueurEnAttente = false; enregistrerJoueurCourant(); }
    });
  }

  // Inscrit (ou met à jour) ce joueur dans le registre partagé des joueurs
  // (cof_joueurs) : un document par joueurId. C'est ce registre qui alimente
  // la "liste des joueurs" (p.ex. partage d'un livre), pour ne pas dépendre
  // des personnages créés. On n'inscrit pas le nom générique "Joueur".
  // Tant que DepotJoueurs n'est pas prêt (cf. _depotJoueursPret ci-dessus),
  // reporte l'écriture au lieu de l'exécuter avec un cache vide : sinon,
  // `existant` serait toujours vide et écraserait silencieusement une
  // couleur déjà choisie (cf. choisirCouleurJoueur) avec `null` à CHAQUE
  // chargement de page — bug réellement rencontré en testant ce chantier.
  // `|| null` (jamais `undefined`) : Firestore refuse un champ à `undefined`
  // dans .set() et lève une exception SYNCHRONE — sans ce garde-fou, le tout
  // premier enregistrement d'un joueur (sans couleur existante) plantait ici
  // et coupait net le reste de l'initialisation de la page (rôle jamais
  // appliqué, onglets jamais câblés), sans rien de visible dans la console.
  function enregistrerJoueurCourant() {
    if (typeof window.DepotJoueurs === "undefined") return;
    if (!joueurId || !joueurNom || joueurNom.trim().toLowerCase() === "joueur") return;
    if (!_depotJoueursPret) { _enregistrerJoueurEnAttente = true; return; }
    // Adopte l'id CANONIQUE déjà utilisé par ce prénom dans le registre
    // partagé, s'il existe — fusion d'identité par prénom ("si on met thomas
    // on accède à la même session", demande de Thomas) : un même prénom
    // saisi depuis un autre appareil/navigateur retombe désormais sur LE
    // MÊME joueurId plutôt que d'en créer un nouveau, éliminant la classe de
    // bug rencontrée avec Fred (couleur enregistrée sous un id, personnage
    // sous un autre). Écrase joueurId/localStorage pour TOUT le reste de la
    // session (nouveaux persos créés, etc.), pas seulement cet appel.
    const canonique = window.DepotJoueurs.liste().find((j) => memeNom(j.nom, joueurNom));
    if (canonique && canonique.id !== joueurId) {
      joueurId = canonique.id;
      localStorage.setItem(STORAGE_JOUEUR_ID, joueurId);
    }
    const existant = window.DepotJoueurs.charger(joueurId);
    window.DepotJoueurs.sauver({ id: joueurId, nom: joueurNom, couleur: (existant && existant.couleur) || null }, joueurId);
    verifierCouleurJoueur();
  }

  // Ouvre automatiquement (une seule fois par session) le picker de couleur
  // si ce joueur n'en a pas encore choisi — dès que le registre partagé
  // (Firestore, DepotJoueurs) est chargé. Les callbacks suivants de
  // DepotJoueurs.ecouter (déclenchés par n'importe quel changement du
  // registre, pas seulement le mien) se contentent de rafraîchir le badge de
  // couleur. Gardé par _abonneCouleurJoueur : enregistrerJoueurCourant peut
  // être appelée plusieurs fois par session (renommage, changement de rôle
  // aller-retour) sans jamais créer plus d'un abonnement.
  let _abonneCouleurJoueur = false;
  function verifierCouleurJoueur() {
    if (typeof window.DepotJoueurs === "undefined" || !joueurId || !joueurNom || joueurNom.trim().toLowerCase() === "joueur") return;
    if (_abonneCouleurJoueur) { _majSwatchCouleurJoueur(); return; }
    _abonneCouleurJoueur = true;
    let dejaVerifie = false;
    window.DepotJoueurs.ecouter(() => {
      _majSwatchCouleurJoueur();
      if (dejaVerifie) return;
      dejaVerifie = true;
      const moi = window.DepotJoueurs.charger(joueurId);
      if (!moi || !moi.couleur) ouvrirModalCouleurJoueur();
    });
  }

  // Reflète la couleur actuellement choisie (ou son absence) sur le petit
  // rond à côté du bouton "Couleur" — no-op si l'élément n'est pas dans le
  // DOM courant (ex. onglet MJ) ou si le registre n'est pas encore prêt.
  function _majSwatchCouleurJoueur() {
    const swatch = document.getElementById("joueur-couleur-swatch");
    if (!swatch || typeof window.DepotJoueurs === "undefined") return;
    const moi = window.DepotJoueurs.charger(joueurId);
    swatch.style.background = (moi && moi.couleur) || "transparent";
  }

  // Picker de couleur (mutuellement exclusive entre joueurs de la table) —
  // grise/désactive toute couleur déjà prise par un AUTRE joueurId dans le
  // registre partagé DepotJoueurs. Vérification "best effort" (pas de verrou
  // transactionnel : deux joueurs cliquant à la milliseconde près pourraient
  // en théorie choisir la même couleur), cohérente avec le reste des gardes
  // "douces" de l'app (cf. assurerIdentiteJoueur) — re-vérifiée une seconde
  // fois côté choisirCouleurJoueur au moment du clic.
  function ouvrirModalCouleurJoueur() {
    if (typeof window.DepotJoueurs === "undefined" || typeof Carte === "undefined" || !Carte.COULEURS_JOUEURS) return;
    const modal = document.getElementById("modal-couleur-joueur");
    const grille = document.getElementById("modal-couleur-joueur-grille");
    if (!modal || !grille) return;
    // Exclut aussi les entrées partageant mon PRÉNOM (pas seulement mon id
    // exact) : un joueurId est volatil (autre appareil, cache vidé...), cf.
    // memeNom/estProprietaire — sans ça, une ancienne entrée sous mon propre
    // prénom (créée avant un changement d'appareil) grise à tort une couleur
    // qui est en fait la mienne.
    const couleursPrises = new Set(
      window.DepotJoueurs.liste()
        .filter((j) => j.id !== joueurId && !memeNom(j.nom, joueurNom) && j.couleur)
        .map((j) => j.couleur)
    );
    const moi = window.DepotJoueurs.charger(joueurId);
    const couleurActuelle = moi && moi.couleur;
    grille.innerHTML = Carte.COULEURS_JOUEURS.map((c) => {
      const prise = couleursPrises.has(c);
      const selectionnee = c === couleurActuelle;
      return `<button type="button" class="swatch-couleur-joueur" data-couleur="${c}" ${prise ? "disabled" : ""}
        title="${prise ? "Déjà prise par un autre joueur" : c}"
        style="width:34px;height:34px;border-radius:50%;background:${c};cursor:${prise ? "not-allowed" : "pointer"};
        opacity:${prise ? "0.25" : "1"};border:${selectionnee ? "3px solid #fff" : "2px solid transparent"};"></button>`;
    }).join("");
    grille.querySelectorAll(".swatch-couleur-joueur").forEach((btn) => {
      btn.onclick = () => choisirCouleurJoueur(btn.dataset.couleur);
    });
    modal.style.display = "flex";
  }

  function fermerModalCouleurJoueur() {
    const modal = document.getElementById("modal-couleur-joueur");
    if (modal) modal.style.display = "none";
  }

  function choisirCouleurJoueur(couleur) {
    if (typeof window.DepotJoueurs === "undefined") return;
    // Re-vérifie au moment du clic (cf. commentaire d'ouvrirModalCouleurJoueur) :
    // le registre a pu changer depuis l'ouverture du modal.
    const prise = window.DepotJoueurs.liste().some((j) => j.id !== joueurId && !memeNom(j.nom, joueurNom) && j.couleur === couleur);
    if (prise) { toast("Cette couleur vient d'être prise par un autre joueur."); ouvrirModalCouleurJoueur(); return; }
    window.DepotJoueurs.sauver({ id: joueurId, nom: joueurNom, couleur }, joueurId);
    if (typeof Carte !== "undefined" && Carte.rafraichirCouleurJoueur) Carte.rafraichirCouleurJoueur(joueurId, joueurNom, couleur);
    fermerModalCouleurJoueur();
    _majSwatchCouleurJoueur();
    toast("Couleur enregistrée — ton jeton en sera cerclé sur la carte.");
  }

  function renommerJoueur() {
    let saisie = "";
    try { saisie = prompt("Ton prénom :", joueurNom || "") || ""; }
    catch (e) { return; }
    const nom = saisie.trim();
    if (!nom) return;
    joueurNom = nom;
    localStorage.setItem(STORAGE_JOUEUR_NOM, nom);
    enregistrerJoueurCourant();
    appliquerRole();
  }

  // Compare deux prénoms de joueur de façon tolérante (accents/casse/espaces
  // ignorés). Sert d'identité STABLE pour la propriété des persos : l'id
  // navigateur (joueurId) est volatil (vidage du cache/localStorage,
  // autre appareil...) et un joueur qui le perd perdait l'accès à ses fiches.
  function memeNom(a, b) {
    if (!a || !b) return false;
    const norm = (s) =>
      String(s).trim().toLowerCase()
        .normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
    const na = norm(a), nb = norm(b);
    // "Joueur" est le nom générique de repli — jamais une identité valable.
    if (!na || na === "joueur") return false;
    return na === nb;
  }

  // Un joueur ne voit/modifie que ses propres persos. La propriété est
  // établie sur DEUX critères, dans cet ordre :
  //   1. le prénom (proprietaireNom === joueurNom) — identité STABLE, survit
  //      à la perte de l'id navigateur : c'est ce qui répare le bug "je ne
  //      retrouve plus mon perso après quelque temps".
  //   2. l'ancien id navigateur (proprietaire === joueurId) — conservé en
  //      repli pour ne casser AUCUN lien déjà en place.
  // + les persos "non réclamés" (ni id ni nom) restent visibles/adoptables.
  // Le MJ garde un accès total (loot, combat...).
  function estProprietaire(p) {
    if (role === "mj") return true;
    if (!p.proprietaire && !p.proprietaireNom) return true; // non réclamé
    if (memeNom(p.proprietaireNom, joueurNom)) return true;  // 1. par prénom
    return p.proprietaire === joueurId;                      // 2. par id (compat)
  }

  // Revendique un perso comme sien (bouton "C'est le mien", ou sélection dans
  // "Mon personnage" sur la carte). Autorisé si le perso est non réclamé OU
  // s'il porte déjà mon prénom (reprise après perte de l'id). Ré-ancre l'id
  // navigateur courant (auto-heal) pour que le repli par id reste à jour.
  // No-op si le perso appartient à quelqu'un d'autre.
  function reclamerPerso(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    const aMoiParNom = memeNom(p.proprietaireNom, joueurNom);
    if (p.proprietaire && !aMoiParNom) return; // à un autre joueur → on ne vole pas
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

    // Le contenu verrouillé du Lore (PNJ/factions secrets) dépend de `role` :
    // sans ce re-rendu, un changement de rôle en cours de session (sans
    // rechargement de page) laisserait affiché le contenu MJ précédent.
    rendrePnjCles();
    rendreFactions();
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

  // Id du token dd2vtt du perso `persoId` sur la scène de combat active, ou
  // null s'il n'a pas (encore) de jeton posé — sert de point de référence
  // pour le vérificateur de portée (cf. Carte.distanceCasesEntre).
  function _monTokenId(persoId) {
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso) return null;
    return Carte.tokenIdPourPerso(persoId);
  }

  // Une capacité de zone SANS jet opposé vise-t-elle des ennemis (comme
  // Chant brisant, Cataclysme élémentaire) plutôt que des alliés (comme
  // Rempart vivant, Sanctuaire du gardien, Convocation des esprits
  // ancestraux) ? Sert à réserver le sélecteur de cible carte (monstre
  // uniquement, cf. son appelant) aux zones réellement hostiles — sans ce
  // garde-fou, une zone de soin/buff alliée se retrouverait avec un picker
  // qui ne propose que des monstres, inutilisable pour prévisualiser qui
  // serait vraiment affecté. Pas de champ dédié dans les données : déduit
  // des effets déjà présents (un "degats", ou un "bonus" à valeur négative =
  // un debuff, donc hostile ; un "pvTemp" ou un "bonus" positif = un buff
  // allié, donc pas concerné).
  function _zoneCibleHostile(mecanique) {
    if (mecanique.jetOppose) return true;
    return (mecanique.effets || []).some((e) =>
      e.type === "degats" || (e.type === "bonus" && typeof e.valeur === "number" && e.valeur < 0)
    );
  }

  // Cibles possibles pour le vérificateur de portée : tous les tokens de la
  // table de combat (monstres + autres PJ), hors soi-même.
  function _ciblesPortee(monTokenId) {
    if (typeof Carte === "undefined") return [];
    const monstres = Carte.listeMonstresCombat ? Carte.listeMonstresCombat() : [];
    const pjs = Carte.listeTokensJoueursCombat ? Carte.listeTokensJoueursCombat() : [];
    return [...monstres, ...pjs].filter((t) => t.id !== monTokenId);
  }

  // Bascule la carte en mode "clic sur un jeton pour cibler" (cf.
  // Carte.activerModeCiblage) pour une capacité en cours de ciblage — ne
  // RÉSOUT rien : un clic sur un jeton en portée présélectionne juste
  // `pickerSelect` (comme si l'utilisateur avait choisi l'option dans le
  // menu déroulant), il faut encore cliquer sur Confirmer. mecanique.portee
  // est déjà exprimée en CASES (cf. data/donnees.js, converti depuis les
  // mètres du texte source) — pas de conversion à faire ici. Absente/non
  // numérique = pas de limite de portée appliquée (mieux vaut ne rien
  // bloquer qu'un faux négatif sur une donnée de portée incomplète).
  // La distance est recalculée à CHAQUE appel du prédicat estValide (pas une
  // seule fois ici) : Carte.activerModeCiblage le rappelle à chaque rendu,
  // y compris pendant un glisser de jeton, pour que la surbrillance suive
  // un déplacement (le lanceur ou une cible) au lieu de rester figée sur
  // les distances du moment de l'ouverture du picker.
  function _armerCiblageCarte(persoId, mecanique, cibles, pickerSelect) {
    if (typeof Carte === "undefined" || !Carte.activerModeCiblage) return;
    const monTokenId = _monTokenId(persoId);
    if (!monTokenId) { if (Carte.desactiverModeCiblage) Carte.desactiverModeCiblage(); return; }
    const porteeCases = (typeof mecanique.portee === "number") ? mecanique.portee : null;
    // Seul l'ensemble des cibles CANDIDATES (allié/ennemi résolu en token) est
    // figé ici — l'allégeance/la résolution de token d'un perso ne change pas
    // quand un jeton se déplace, contrairement à la distance.
    const tokenVersCible = {};
    cibles.forEach((cc) => {
      // Un monstre (genre "monstre") a déjà un id de TOKEN (cf.
      // Capacites.listeCibles -> Carte.listeMonstresCombat) ; un PJ
      // (genre "perso") a un id de PERSONNAGE, à traduire en id de token.
      const tokId = cc.genre === "monstre" ? cc.id : Carte.tokenIdPourPerso(cc.id);
      if (!tokId || tokId === monTokenId) return;
      tokenVersCible[tokId] = cc.id;
    });
    const estValide = (tokId) => {
      if (!tokenVersCible[tokId]) return false;
      if (porteeCases === null) return true;
      const dist = Carte.distanceCasesEntre(monTokenId, tokId);
      return dist !== null && dist <= porteeCases;
    };
    // mecanique.zone (cases) : rayon de l'aperçu de zone d'effet au survol
    // d'une cible valide (cf. Carte.activerModeCiblage/rayonZoneCases) — les
    // AUTRES jetons dans ce rayon se surlignent pour prévisualiser qui serait
    // aussi touché. Même unité que portee (cases), aucune conversion ici.
    const rayonZoneCases = (typeof mecanique.zone === "number") ? mecanique.zone : null;
    Carte.activerModeCiblage(estValide, (tokId) => {
      const cibleId = tokenVersCible[tokId];
      if (!cibleId || !pickerSelect) return;
      pickerSelect.value = cibleId;
      toast("Cible présélectionnée sur la carte — clique sur Confirmer.");
    }, rayonZoneCases);
  }

  // Variante automatisée de _armerCiblageCarte pour la règle générale
  // zone/ligne (battlemap dd2vtt uniquement) : au clic sur un jeton valide,
  // calcule TOUTES les cibles touchées (Carte.jetonsEnZoneCombat pour une
  // zone circulaire, Carte.jetonsSurLigneCombat si mecanique.zone.forme ===
  // "ligne") et résout directement via resoudreCapaciteEtRafraichir(null,
  // cibleIds, cerclesParCible) — pas de relance manuelle par cible
  // contrairement à _armerCiblageCarte. mecanique.cible vaut toujours "zone"
  // dans les données (cf. eclair_localise/eclair_grand) : "ligne" n'est pas
  // une valeur de cible séparée, seule mecanique.zone.forme distingue les
  // deux formes.
  function _armerCiblageCarteZoneAuto(persoId, mecanique, cibles, pickerSelect) {
    if (typeof Carte === "undefined" || !Carte.activerModeCiblage) return;
    const monTokenId = _monTokenId(persoId);
    if (!monTokenId) { if (Carte.desactiverModeCiblage) Carte.desactiverModeCiblage(); return; }
    const estLigne = !!(mecanique.zone && mecanique.zone.forme === "ligne");
    const idsValides = new Set(cibles.map((c) => c.id));
    const estValide = (tokId) => idsValides.has(tokId);
    const rayonZoneCases = (!estLigne && mecanique.zone && typeof mecanique.zone.taille === "number")
      ? mecanique.zone.taille : null;
    // eclair_localise/eclair_grand gardent leur longueur propre
    // (mecanique.zone.longueur) ; sinon LONGUEUR_LIGNE_CASES (règle générale,
    // 5 cases). Calculée ici et plus dans le callback : l'aperçu visuel (cf.
    // Carte.activerModeCiblage/ligne) en a besoin dès l'armement du ciblage,
    // pour tracer le rayon au survol avant tout clic.
    const longueurLigne = estLigne
      ? ((typeof mecanique.zone.longueur === "number") ? mecanique.zone.longueur : LONGUEUR_LIGNE_CASES)
      : null;
    Carte.activerModeCiblage(estValide, (tokId) => {
      let cibleIds, cerclesParCible = {};
      if (estLigne) {
        cibleIds = Carte.jetonsSurLigneCombat(monTokenId, tokId, longueurLigne);
      } else {
        const rayon = rayonZoneCases ?? 2;
        Carte.jetonsEnZoneCombat(tokId, rayon).forEach((r) => { cerclesParCible[r.id] = r.cercle; });
        cibleIds = Object.keys(cerclesParCible);
      }
      if (!cibleIds.length) { toast("Aucune cible touchée."); return; }
      resoudreCapaciteEtRafraichir(null, cibleIds, cerclesParCible);
    }, rayonZoneCases, estLigne ? { longueur: longueurLigne, idLanceur: monTokenId } : null);
  }

  // Combine deux formules de dégâts (bi-arme : mêlée + arme courte en main
  // secondaire, cf. Personnage.armeCourteSecondaire) en une seule formule
  // lançable via lancerFormule (qui gère désormais plusieurs termes de dés).
  function _combinerFormules(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a + (b.startsWith("-") ? "" : "+") + b;
  }

  // État "dégâts en attente" des attaques rapides à l'arme (Contact/Distance/
  // Magique, boutons data-bm-attaque/data-bm-degats, sidebar ET dock — cf.
  // _resoudreAttaqueRapide/_etatDegatsRapide) — état de MODULE par type
  // d'attaque (pas une seule variable globale : cliquer "Contact" puis
  // "Distance" sans lancer les dégâts du premier ne doit pas écraser le
  // contexte du second), et pas une closure locale au rendu (sidebar/dock
  // sont re-rendus à chaque Combat.onChange, ce qui recréerait une closure
  // vierge — même contrainte que capaciteDegatsEnAttente). Sidebar et dock
  // partagent ce même état : un clic dans l'une des deux zones met à jour
  // l'autre automatiquement (rendreFicheSidebarBattlemap re-rend toujours
  // aussi le dock, cf. sa dernière ligne).
  let attaquesRapidesEnAttente = { contact: null, distance: null, magique: null };

  // DEF d'un PJ + aura Guerrier "L'exemple" (Voie du peuple rang 2, cf.
  // Capacites.bonusDefAuraPeuple) : cette aura dépend d'AUTRES personnages
  // (position/immobilité d'un Guerrier proche), elle ne peut donc pas vivre
  // dans Personnage.calculerCA() (auto-contenu à `this`) — appelée ici à
  // chaque affichage ET résolution de DEF de PJ, pour ne jamais désynchroniser
  // la valeur affichée de la valeur réellement opposée à une attaque.
  // typeAttaque (optionnel, cf. lot "armures B" — "imposante"/"glissante") :
  // "distance" ou "opportunite" ajoutent un bonus de DEF conditionnel à
  // CETTE résolution précise, jamais à l'affichage général de la DEF (les
  // 6 autres appels de cette fonction n'en passent pas — afficher "ta DEF"
  // hors contexte d'attaque ne doit jamais inclure un bonus qui ne s'applique
  // qu'à un type d'attaque particulier).
  function _defPjAvecAura(perso, persoId, typeAttaque) {
    let def = perso.calculerCA();
    if (typeAttaque === "distance") def += perso.bonusDefContreDistance();
    if (typeAttaque === "opportunite") def += perso.bonusDefContreOpportunite();
    if (typeof Capacites === "undefined") return def;
    if (Capacites.bonusDefAuraPeuple) def += Capacites.bonusDefAuraPeuple(persoId);
    // Chevalier — Voie du protecteur rang 1 "Garde rapprochée" : même
    // principe que l'aura ci-dessus, cf. Capacites.bonusDefGardeRapprochee.
    if (Capacites.bonusDefGardeRapprochee) def += Capacites.bonusDefGardeRapprochee(persoId);
    return def;
  }

  // Bonus/malus temporaires actifs sur un jeton monstre (cf.
  // Carte.ajouterEtatCombat, posé par resoudreCapaciteEtRafraichir pour
  // toute capacité "bonus" ciblant un monstre — ex. Barde "Note
  // discordante"/"Chant brisant") pour une cible donnée ("DEF" ou
  // "attaque") — même principe que Personnage.bonusTemporaire côté PJ, mais
  // sur le token puisqu'un monstre n'a pas de classe Personnage. Utilisé
  // partout où m.def/bonusAttaque est lu (affichage carte de combat ET
  // résolution réelle des jets), pour que la valeur affichée corresponde
  // toujours à la valeur réellement utilisée dans les jets.
  function _bonusEtatsMonstre(m, cible) {
    return ((m && m.etatsActifs) || []).reduce((t, e) => t + ((e.bonus && e.bonus.cible === cible) ? e.bonus.valeur : 0), 0);
  }
  // DEF effective d'un monstre : valeur de base + bonus/malus actifs (cf.
  // _bonusEtatsMonstre) — null si la DEF de base est inconnue (comme avant).
  function _defEffectiveMonstre(m) {
    return (m && typeof m.def === "number") ? m.def + _bonusEtatsMonstre(m, "DEF") : null;
  }

  // Résout une formule de durée ("3+Mod.CHA", "2", "prochainTour",
  // "permanente"...) en nombre de tours pour un état posé sur un monstre —
  // même vocabulaire que Capacites.resoudreDureeInitiale (data/donnees.js),
  // mais réimplémenté ici en miniature (juste Mod.XXX/constantes, jamais de
  // dé dans une durée) pour ne jamais avoir à toucher js/capacites.js : ce
  // module ne stocke un état que sur un PJ (cf. appliquerBonusSurPerso), pas
  // sur un jeton monstre. perso = le LANCEUR (dont dépend Mod.XXX ici).
  function _resoudreDureeToursMonstre(dureeExpr, perso) {
    if (dureeExpr === "permanente") return { tours: null, motCle: "permanente" };
    if (dureeExpr === "finCombat") return { tours: null, motCle: "finCombat" };
    if (dureeExpr === "24h") return { tours: null, motCle: "horsTour" };
    if (dureeExpr === "prochainTour") return { tours: 1, motCle: null };
    const termes = String(dureeExpr || "").replace(/\s/g, "").match(/[+-]?[^+-]+/g) || [];
    let total = 0;
    for (const terme of termes) {
      const negatif = terme.startsWith("-");
      const brut = terme.replace(/^[+-]/, "");
      const mod = /^Mod\.([A-Za-z]+)$/i.exec(brut);
      let v;
      if (mod) v = perso ? perso.mod(mod[1].toUpperCase()) : 0;
      else if (/^\d+$/.test(brut)) v = parseInt(brut, 10);
      else return { tours: null, motCle: null }; // formule imprévue (dé...) : pas de décompte fiable
      total += negatif ? -v : v;
    }
    return { tours: total, motCle: null };
  }

  // Applique manuellement, côté app.js, le bonus/malus d'une capacité de
  // zone/attaque ciblant un MONSTRE (Capacites.resoudreEffet ne stocke un
  // "bonus" que pour un PJ, cf. sa doc — sur une cible monstre il se contente
  // de renvoyer un message "à appliquer manuellement", même sans le savoir
  // lui-même vraiment sélectionné). Plutôt que dupliquer les nombreux
  // ajustements de rang spécifiques (Refrain lancinant/Dissonance profonde,
  // Malédiction profonde...) déjà résolus dans ce message, on relit la
  // valeur FINALE déjà calculée dedans (regex sur le motif "Bonus (cible
  // valeur, duree) — ..."), puis on la stocke via Carte.ajouterEtatCombat —
  // même format d'entrée que appliquerBonusSurPerso (bonus.cible/valeur,
  // dureeRestante), affiché par htmlEtatsActifs comme pour un PJ.
  function _appliquerBonusMonstreDepuisMessages(messages, cibleMonstreId, perso, libelle) {
    if (typeof Carte === "undefined" || !Carte.ajouterEtatCombat) return;
    const re = /Bonus \(([A-Za-zÀ-ÿ]+) ([+-]?\d+), ([^)]+)\) — aucune cible sélectionnée, à appliquer manuellement\./g;
    let m;
    while ((m = re.exec(messages.join("\n")))) {
      const [, cible, valeurTxt, duree] = m;
      Carte.ajouterEtatCombat(cibleMonstreId, {
        idEtat: null,
        bonus: { cible, valeur: parseInt(valeurTxt, 10) },
        dureeRestante: Object.assign(_resoudreDureeToursMonstre(duree, perso), { dureeAffichee: duree }),
        source: libelle,
        poseLe: Date.now(),
      });
    }
  }

  // Détermine touché/raté à partir d'un jet déjà résolu (cf. lancerTest) et
  // d'une DEF cible déjà connue (ou null) — cœur de règle partagé par
  // _resoudreAttaqueRapide (joueur, armes rapides) ET la table de combat MJ
  // (attaques de monstre vs PJ, cf. _resoudreAttaqueMonstreVsPJ) : 1 naturel
  // = toujours raté, seuil de critique (déjà intégré à critMin passé à
  // lancerTest) = toujours touché, sinon touché si total >= DEF. Sans cible
  // sélectionnée ou DEF inconnue, renvoie null : ne bloque jamais (comportement
  // d'avant ce chantier, jet brut, bouton dégâts disponible).
  function _toucheVsDef(jet, cibleSelectionnee, defCible) {
    if (!cibleSelectionnee) return null;
    if (jet.echec) return false;
    if (jet.crit) return true;
    if (defCible === null) return null;
    return jet.total >= defCible;
  }

  // Caractéristique dont dépend un jet d'attaque, selon son type — pour le
  // Contrat Démoniaque (cf. lancerTest/opts.caracCode) uniquement : réutilise
  // CARAC_MAGIE (data/donnees.js), déjà la source de perso.bonusAttaque("magique").
  function _caracPourTypeAttaque(type, perso) {
    if (type === "contact" || type === "lancer") return "FOR";
    if (type === "distance") return "DEX";
    if (type === "magique" && perso) return (typeof CARAC_MAGIE !== "undefined" && CARAC_MAGIE[perso.classe]) || null;
    return null;
  }

  // Résout une attaque rapide à l'arme : lance le jet (réutilise lancerTest,
  // ne duplique jamais le tirage de dés/le journal). Si `cibleId` (id de
  // TOKEN dd2vtt, cf. _cibleDistanceId/_ciblesPortee — PAS un id de
  // personnage) est fourni, détermine touché/raté/critique/échec critique via
  // _toucheVsDef. Un token PJ n'a pas de champ `def` direct (contrairement à
  // un token monstre) : il faut recalculer Personnage.calculerCA() via son
  // `ref` ("pj-"+persoId), cf. _ciblesPortee/ajouterMonPersoBattlemap.
  // opts (optionnel) : { persoId, caracCode } transmis tel quel à lancerTest
  // (cf. sa doc) pour le Contrat Démoniaque/l'Anneau de Chance.
  function _resoudreAttaqueRapide(label, bonus, critMin, cibleId, opts) {
    const jet = lancerTest(label, bonus, critMin, null, opts);
    let defCible = null;
    if (cibleId && typeof Carte !== "undefined") {
      const monstre = (Carte.listeMonstresCombat ? Carte.listeMonstresCombat() : []).find((t) => t.id === cibleId);
      if (monstre) {
        defCible = _defEffectiveMonstre(monstre);
      } else {
        const pjTok = (Carte.listeTokensJoueursCombat ? Carte.listeTokensJoueursCombat() : []).find((t) => t.id === cibleId);
        if (pjTok && pjTok.ref && pjTok.ref.startsWith("pj-")) {
          const cibleId2 = pjTok.ref.slice(3);
          const cibleP = chargerPersos()[cibleId2];
          if (cibleP) defCible = _defPjAvecAura(Personnage.depuisJSON(cibleP), cibleId2);
        }
      }
    }
    const touche = _toucheVsDef(jet, !!cibleId, defCible);
    return { touche, critique: jet.crit, echecCritique: jet.echec, totalAttaque: jet.total, defCible };
  }

  // Redirection "intercepte" (Rempart vivant/Couverture du sacrifice, cf.
  // "Prototype du moteur de réaction", extension §B) : contrairement à
  // Contresort/Bouclier arcanique, le MJ joue les DEUX côtés (l'attaquant
  // choisi par un PJ et le garde adjacent) — pas de fenêtre SyncStore
  // asynchrone, un confirm() synchrone au moment d'appliquer les dégâts
  // suffit. MJ uniquement (jamais proposé sur le clic "Dégâts" d'un joueur,
  // qui n'a pas à arbitrer pour un monstre). Renvoie l'id du jeton qui
  // encaisse RÉELLEMENT les dégâts (le garde si redirection acceptée, sinon
  // cibleId inchangé).
  function _redirectionIntercepteMonstre(cibleId) {
    if (role !== "mj" || typeof Carte === "undefined" || !Carte.listeMonstresCombat || !Carte.distanceCasesEntre || typeof CapacitesMonstres === "undefined") return cibleId;
    const monstres = Carte.listeMonstresCombat();
    const cible = monstres.find((t) => t.id === cibleId);
    if (!cible) return cibleId;
    for (const garde of monstres) {
      if (garde.id === cibleId) continue;
      const dist = Carte.distanceCasesEntre(cibleId, garde.id);
      if (dist === null || dist > 1) continue;
      const capacites = CapacitesMonstres.capacitesDe(garde);
      for (let i = 0; i < capacites.length; i++) {
        const meca = capacites[i].mecanique;
        if (!meca || !meca.intercepte) continue;
        const usage = Capacites.verifierUsage(garde, CapacitesMonstres.cleCapacite(garde.monstreId || garde.id, i), meca);
        if (!usage.ok) continue;
        if (!confirm(`${garde.nom} peut intercepter (« ${capacites[i].nom} ») et prendre les dégâts à la place de ${cible.nom}. Rediriger ?`)) continue;
        usage.appliquer();
        return garde.id;
      }
    }
    return cibleId;
  }

  // Applique les dégâts d'une attaque rapide (Contact/Distance/Magique) à sa
  // cible verrouillée, une fois le jet de dégâts effectué (cf. le bouton
  // "Dégâts" sidebar/dock) — jusqu'ici ce bouton se contentait d'un jet de
  // dés affiché, sans jamais toucher la PV de la cible (contrairement à la
  // table de combat MJ et aux attaques d'opportunité, qui le faisaient déjà).
  // Même distinction monstre/PJ que _resoudreAttaqueRapide (defCible) : un
  // monstre passe par Carte.appliquerDegatsCombat (armure du token), un PJ
  // par subirDegats (réduction complète du personnage, cf. Personnage).
  // silencieux (cf. _resoudreEffetsDeclencheur, branche "degats") : le
  // résolveur de déclencheurs compose déjà son propre message dans
  // messagesToast pour un seul toast final — sans ça, le toast interne
  // ci-dessous ("X subit N dégâts") s'affiche puis est immédiatement
  // écrasé, même bug déjà corrigé ailleurs (appliquerMalus, clic capacité
  // de monstre) pour la même raison : #toast est un élément unique.
  function _appliquerDegatsCibleRapide(cibleId, total, ignoreReduction, silencieux, persoId) {
    if (!cibleId || typeof total !== "number" || typeof Carte === "undefined") return null;
    const monstre = (Carte.listeMonstresCombat ? Carte.listeMonstresCombat() : []).find((t) => t.id === cibleId);
    if (monstre) {
      const cibleEffective = _redirectionIntercepteMonstre(cibleId);
      // "ennemi tué" (cf. "drainante_os", armure_ossements, lot "armes/
      // accessoires D") : PV AVANT capturés sur la cible EFFECTIVE (après
      // redirection d'interception éventuelle), pour détecter un passage
      // >0 -> 0 causé par CETTE action précise — pas de proc sur un
      // sur-kill (déjà à 0 avant) ni sans PJ identifié (persoId absent des
      // call sites qui ne le connaissent pas encore).
      const monstreEffectif = Carte.listeMonstresCombat().find((t) => t.id === cibleEffective);
      const pvAvant = monstreEffectif ? (monstreEffectif.pvActuel ?? monstreEffectif.pvMax ?? 0) : null;
      const info = Carte.appliquerDegatsCombat(cibleEffective, total, ignoreReduction);
      if (info && !silencieux) toast(`${info.nom} subit ${info.degatsNets} dégâts (PV ${info.pvActuel}).`);
      if (info && persoId && pvAvant !== null && pvAvant > 0 && info.pvActuel === 0) {
        _declencherEnnemiTue(persoId, cibleEffective);
      }
      return info;
    }
    const pjTok = (Carte.listeTokensJoueursCombat ? Carte.listeTokensJoueursCombat() : []).find((t) => t.id === cibleId);
    if (pjTok && pjTok.ref && pjTok.ref.startsWith("pj-")) {
      subirDegats(pjTok.ref.slice(3), total, null, null, null, ignoreReduction);
    }
    return null;
  }

  // Réponse à un "ennemi tué à moins de 2 cases" (cf. "drainante_os",
  // armure_ossements, lot "armes/accessoires D") — jamais de choix du
  // joueur (comme "absorbant"/"drainante"), proc automatique dès qu'un des
  // deux appelants de _appliquerDegatsCibleRapide détecte le passage >0->0.
  // Distance vérifiée ICI (pas dans l'appelant) : nécessite le jeton du PJ
  // (_monTokenId), absent hors battlemap dd2vtt — pas de proc dans ce cas
  // plutôt qu'une fausse supposition de portée.
  function _declencherEnnemiTue(persoId, monstreTokenId) {
    if (typeof Carte === "undefined" || !Carte.distanceCasesEntre) return;
    const monTokenId = _monTokenId(persoId);
    if (!monTokenId) return;
    const dist = Carte.distanceCasesEntre(monTokenId, monstreTokenId);
    if (typeof dist !== "number" || dist > 2) return;
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const messages = [];
    let modifie = false;
    perso._itemsEquipesUniques().forEach((it) => {
      if (!it.declencheurs) return;
      it.declencheurs.forEach((d) => {
        if (d.evenement !== "ennemiTue") return;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (!usage.ok) return;
        if (usage.appliquer) usage.appliquer();
        modifie = true;
        const effetSoin = (d.effets || []).find((e) => e.type === "soin");
        const effetPvTemp = (d.effets || []).find((e) => e.type === "pvTemp");
        if (effetSoin) {
          const total = lancerFormule(effetSoin.formule, `${it.nom} — Soin`, false);
          if (typeof total === "number") {
            Personnage.appliquerGainPv(p, total, { ignorerCorruption: true });
            messages.push(`${it.nom} : ${p.nom} regagne ${total} PV.`);
          }
        }
        if (effetPvTemp && typeof Capacites !== "undefined" && Capacites.appliquerPvTemporairesSurPerso) {
          const totalTemp = lancerFormule(effetPvTemp.formule, `${it.nom} — PV temporaires`, false);
          if (typeof totalTemp === "number") {
            const res = Capacites.appliquerPvTemporairesSurPerso(p, totalTemp, effetPvTemp.duree || "finCombat", {});
            messages.push(`${it.nom} : ${res.montant} PV temporaires.`);
          }
        }
      });
    });
    if (modifie) { sauverPersos(persos); if (messages.length) toast(messages.join(" — ")); }
  }

  // Chasseur — Voie du chaos, rang 1 "Premier sang du prédateur" (passif) :
  // +1 point de jauge de Chaos par touche RÉUSSIE À DISTANCE (les pièges ne
  // sont pas trackés par l'app, seule cette moitié du texte est mécanisable)
  // — appelé par les deux wirings dupliqués (sidebar+dock) après
  // _resoudreAttaqueRapide, qui ne connaît pas persoId lui-même. Plafonné à
  // 6 pour cette source passive spécifiquement (même logique que Premier
  // sang côté Guerrier, cf. subirDegats).
  function _gererPremierSangChasseur(persoId, type, touche) {
    if (type !== "distance" || touche !== true) return;
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    if (!perso.aPremierSangChasseur() || typeof Capacites === "undefined" || (p.corruptionCombat || 0) >= 6) return;
    const franchi = Capacites.ajusterCorruptionCombat(p, 1);
    sauverPersos(persos);
    if (franchi) toast(`⚠️ ${p.nom} franchit le seuil de Corruption d'Âme (Corruption d'Âme +1, total ${p.corruptionMajeure}).`);
  }

  // Déclencheurs génériques d'objets forgés OU du catalogue statique (cf.
  // js/forge.js, champ `declencheurs`) : sur touche/rate/critique d'une
  // attaque (contact ou distance), perte/gain d'une ressource sur le
  // PORTEUR uniquement. N'existait pas avant le 04/08/2026 : un objet sans
  // `declencheurs` ne change rien au comportement existant.
  // Épée de Cupidité (data/loot.json: epee_cupidite) migrée vers ce système
  // le 04/08/2026 — son malus (perte de 25 PO à un échec d'attaque de
  // contact, repli en 1d4 PV si déjà à 0 PO) était auparavant en dur ici
  // même (_gererMalusEpeeCupidite, retirée), le volet dégâts (+1/100 PO)
  // passant déjà par `formules`/bonusDegatsFormuleEquipement.
  //
  // Un seul passage local (persos/p chargés UNE fois, sauvés UNE fois à la
  // fin) : évite la course entre ajusterPv (qui recharge/sauve séparément)
  // et une mutation directe de piecesOr/Argent/Bronze sur le même perso
  // dans le même événement — sinon le second sauverPersos() écraserait le
  // premier avec des données obsolètes.
  function _valeurDeclencheur(expr) {
    if (typeof expr !== "string") return Number(expr) || 0;
    const m = expr.trim().match(/^(\d+)d(\d+)$/i);
    if (!m) return parseInt(expr, 10) || 0;
    const nb = parseInt(m[1], 10), faces = parseInt(m[2], 10);
    let total = 0;
    for (let i = 0; i < nb; i++) total += lancerDe(faces);
    return total;
  }
  const _CHAMP_RESSOURCE = { or: "piecesOr", argent: "piecesArgent", bronze: "piecesBronze", pv: "pvActuel" };

  // Résout la branche `effets[]` d'un déclencheur (cf. "Mécaniser les affixes
  // de rareté" — vocabulaire mecanique.effets[] de data/donnees.js, réutilisé
  // ici tel quel, troisième usage après les capacités PJ et monstres).
  // Contrairement à l'ancien chemin ressource/operation (mouvement sur le
  // PORTEUR uniquement), degats/dot/etat/bonus ciblent la CIBLE de l'attaque
  // (cibleId) — soin cible le porteur (p, déjà chargé par l'appelant : aucun
  // affixe converti ne soigne un tiers). Chaque effet applicable pousse un
  // message dans messagesToast plutôt que d'appeler toast() lui-même : un
  // seul toast final composé par l'appelant (même anti-écrasement que
  // appliquerMalus/le clic des capacités de monstre, cf. suffixeToastFinal/
  // messagesToast ailleurs dans ce fichier).
  function _resoudreEffetsDeclencheur(effets, ctx) {
    const cibleRaw = ctx.cibleId ? _cibleRawDepuisToken(ctx.cibleId) : null;
    effets.forEach((e) => {
      // probabilite (cf. schéma) : enveloppe générique, pas un type d'effet —
      // s'applique à n'importe quel effet qui la porte. Raté = silencieux,
      // comme un jet de dé qui ne produit rien.
      if (typeof e.probabilite === "number" && Math.random() >= e.probabilite) return;
      if (e.type === "degats") {
        // cible: "attaquant" (cf. Affixes phase 2 §C, épineuse/renvoyeur —
        // "quand le porteur est touché") : redirige vers ctx.attaquantId
        // plutôt que ctx.cibleId, seul cas où l'effet vise l'inverse du
        // porteur qui a déclenché l'effet plutôt que sa propre cible.
        const viseAttaquant = e.cible === "attaquant";
        const idEffectif = viseAttaquant ? ctx.attaquantId : ctx.cibleId;
        const rawEffectif = viseAttaquant ? (idEffectif ? _cibleRawDepuisToken(idEffectif) : null) : cibleRaw;
        if (!rawEffectif) { ctx.messagesToast.push(`${ctx.itNom} : ${viseAttaquant ? "attaquant" : "cible"} inconnu(e) — ${e.formule} dégâts à appliquer manuellement.`); return; }
        const total = lancerFormule(e.formule, `${ctx.itNom} — Dégâts`, false);
        if (typeof total === "number") {
          _appliquerDegatsCibleRapide(idEffectif, total, viseAttaquant ? null : ctx.ignoreReductionCourant, true, ctx.persoId);
          ctx.messagesToast.push(`${ctx.itNom} : +${total} dégâts${e.elementaire ? ` (${e.elementaire})` : ""}${viseAttaquant ? " à l'attaquant" : ""}.`);
        }
      } else if (e.type === "dot") {
        // "Saignement"/"Brûlure"/poison de prose : mécaniquement le même DOT
        // (empoisonnee + formuleDot), déjà structuré sur les 15 consommables
        // empoisonnés — cf. _resoudreConsommationLancer/decompterEtatsDebutTour.
        if (!cibleRaw) { ctx.messagesToast.push(`${ctx.itNom} : cible inconnue — effet à appliquer manuellement.`); return; }
        const entree = {
          idEtat: "empoisonnee",
          dureeRestante: Object.assign(_resoudreDureeToursMonstre(String(e.duree), null), { dureeAffichee: `${e.duree} tours` }),
          formuleDot: e.formule,
          source: ctx.itNom, poseLe: Date.now(),
        };
        const res = _appliquerEtatSurCibleRaw(cibleRaw, "empoisonnee", entree);
        if (res.message) ctx.messagesToast.push(`${ctx.itNom} : ${res.message}`);
      } else if (e.type === "soin") {
        const total = lancerFormule(e.formule, `${ctx.itNom} — Soin`, false);
        if (typeof total === "number") {
          Personnage.appliquerGainPv(ctx.p, total, { ignorerCorruption: true });
          ctx.pvPorteurTouche = true;
          ctx.messagesToast.push(`${ctx.itNom} : ${ctx.p.nom} regagne ${total} PV.`);
        }
      } else if (e.type === "bonus") {
        if (!cibleRaw) { ctx.messagesToast.push(`${ctx.itNom} : cible inconnue — bonus ${e.cible} ${e.valeur >= 0 ? "+" : ""}${e.valeur} à appliquer manuellement.`); return; }
        _appliquerBonusSurCibleRaw(cibleRaw, e.cible, e.valeur, String(e.duree), ctx.itNom);
        ctx.messagesToast.push(`${ctx.itNom} : ${e.cible} ${e.valeur >= 0 ? "+" : ""}${e.valeur} sur la cible.`);
      } else if (e.type === "etat") {
        // cible: "attaquant" (cf. éblouissant, Affixes phase 4 — même
        // redirection que "degats" en phase 2 §C) : le porteur touché pose
        // l'état sur l'attaquant, pas sur lui-même.
        const viseAttaquant = e.cible === "attaquant";
        const idEffectif = viseAttaquant ? ctx.attaquantId : ctx.cibleId;
        const rawEffectif = viseAttaquant ? (idEffectif ? _cibleRawDepuisToken(idEffectif) : null) : cibleRaw;
        if (!rawEffectif) { ctx.messagesToast.push(`${ctx.itNom} : ${viseAttaquant ? "attaquant" : "cible"} inconnu(e) — état « ${ETATS[e.id] ? ETATS[e.id].nom : e.id} » à appliquer manuellement.`); return; }
        const entree = {
          idEtat: e.id,
          dureeRestante: Object.assign(_resoudreDureeToursMonstre(e.duree || "", null), { dureeAffichee: e.duree || null }),
          source: ctx.itNom, poseLe: Date.now(),
        };
        const res = _appliquerEtatSurCibleRaw(rawEffectif, e.id, entree);
        if (res.message) ctx.messagesToast.push(`${ctx.itNom} : ${res.message}`);
      } else if (e.type === "ignoreReduction") {
        // Touche le calcul de dégâts, pas un mouvement de ressource : stocké
        // sur attaquesRapidesEnAttente[type] (déjà peuplé par l'appelant AVANT
        // ce déclenchement, cf. les deux handlers data-bm-attaque) pour que le
        // clic "Dégâts" qui suit (_appliquerDegatsCibleRapide) le lise et le
        // soustraie à reductionDegats de la cible AVANT application.
        if (attaquesRapidesEnAttente[ctx.type]) attaquesRapidesEnAttente[ctx.type].ignoreReduction = e.valeur;
        ctx.ignoreReductionCourant = e.valeur; // pour un éventuel "degats" du MÊME déclenchement
        ctx.messagesToast.push(`${ctx.itNom} : ignore ${e.valeur} points de réduction de la cible.`);
      } else if (e.type === "critique") {
        // Seuil de critique élargi (ex. Rapière perfide, "Critique sur
        // 19-20") : PAS résolu ici — le jet est déjà fait au moment où ce
        // déclencheur "touche" s'exécute, trop tard pour changer si CETTE
        // attaque était critique. Raretes.appliquer() pose déjà clone.critMin
        // directement depuis ce même effet, lu statiquement et EN AMONT par
        // Personnage.critMinAttaque() (js/personnage.js) — no-op volontaire ici.
      } else if (e.type === "special") {
        ctx.messagesToast.push(`${ctx.itNom} : ${e.note}`);
      }
    });
  }

  // Condition lisible sur le jeton adverse au moment du coup (cf. Affixes
  // phase 2 §B : sauvage/féroce, "cibleSousMoitie" ; precise, "cibleBlessee"
  // — celle-ci lue ailleurs, avant le jet, pas ici). false si la cible est
  // inconnue : mieux vaut ne pas déclencher qu'appliquer un bonus non mérité.
  function _conditionRemplie(condition, cibleId) {
    if (!condition) return true;
    if (!cibleId || typeof Carte === "undefined") return false;
    const monstre = Carte.listeMonstresCombat ? Carte.listeMonstresCombat().find((t) => t.id === cibleId) : null;
    let pvActuel, pvMax;
    if (monstre) {
      pvActuel = monstre.pvActuel; pvMax = monstre.pvMax;
    } else {
      const pjTok = Carte.listeTokensJoueursCombat ? Carte.listeTokensJoueursCombat().find((t) => t.id === cibleId) : null;
      if (!pjTok || !pjTok.ref || !pjTok.ref.startsWith("pj-")) return false;
      const p = chargerPersos()[pjTok.ref.slice(3)];
      if (!p) return false;
      pvActuel = p.pvActuel; pvMax = p.pvMax;
    }
    if (typeof pvActuel !== "number" || typeof pvMax !== "number") return false;
    if (condition === "cibleBlessee") return pvActuel < pvMax;
    if (condition === "cibleSousMoitie") return pvActuel < pvMax / 2;
    return false;
  }

  // precise (cf. Affixes phase 2 §B) : bonus au JET D'ATTAQUE conditionné à
  // l'état de la cible, lu AVANT le jet — pas un effet de déclencheur (le
  // texte porte sur le jet lui-même, résolu trop tard une fois "touche"
  // connu). Même équipement contact/distance que critMinAttaque().
  function _bonusAttaqueConditionnelEquipement(perso, type, cibleId) {
    const arme = type === "contact" ? perso.armeContactEquipee() : type === "distance" ? perso.armeDistanceEquipee() : null;
    const bac = arme && arme.bonusAttaqueConditionnel;
    if (!bac) return 0;
    return _conditionRemplie(bac.condition, cibleId) ? bac.valeur : 0;
  }

  // Limite d'usage d'un déclencheur d'équipement (cf. "éblouissant", Affixes
  // phase 4 — "1/2 fois par combat") : réutilise Capacites.verifierUsage tel
  // quel (clé arbitraire, mecanique.usage.frequence générique), au lieu d'un
  // compteur ad hoc — la remise à zéro "combat" est donc déjà couverte
  // gratuitement par Combat.terminerCombat() -> Capacites.
  // reinitialiserUsagesPeriode(p, "combat"), qui ne fait aucune distinction
  // entre une clé de capacité et une clé d'équipement. Pas de limite = { ok:
  // true } sans effet de bord, comme avant l'introduction de ce champ.
  function _verifierUsageDeclencheur(p, it, d) {
    if (!d.usage || typeof Capacites === "undefined") return { ok: true };
    return Capacites.verifierUsage(p, `equipement:${it.id}:${d.evenement}`, { usage: d.usage });
  }

  function _gererDeclencheursEquipement(persoId, type, resolution, cibleId) {
    if (type !== "contact" && type !== "distance") return;
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const armeUtilisee = type === "contact" ? perso.armeContactEquipee() : perso.armeDistanceEquipee();
    const pvAvant = p.pvActuel;
    let modifie = false, pvTouche = false;
    const messagesToast = [];
    perso._itemsEquipesUniques().forEach((it) => {
      if (!it.declencheurs || !it.declencheurs.length) return;
      if (it.type === "arme" && (!armeUtilisee || armeUtilisee.id !== it.id)) return; // pas la bonne arme
      it.declencheurs.forEach((d) => {
        const evenementOk =
          (d.evenement === "touche" && resolution.touche === true) ||
          (d.evenement === "rate" && resolution.touche === false) ||
          (d.evenement === "critique" && resolution.critique === true);
        if (!evenementOk) return;
        if (!_conditionRemplie(d.condition, cibleId)) return;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (!usage.ok) return;
        if (Array.isArray(d.effets)) {
          // Nouvelle branche (cf. schéma étendu) : vocabulaire effets[],
          // ctx.p/pvPorteurTouche partagés avec le reste de la fonction pour
          // qu'un seul sauverPersos() ferme le passage, comme l'ancien chemin.
          const ctx = { persoId, p, perso, persos, cibleId, itNom: it.nom, type, messagesToast, pvPorteurTouche: false };
          _resoudreEffetsDeclencheur(d.effets, ctx);
          if (usage.appliquer) usage.appliquer();
          if (ctx.pvPorteurTouche) pvTouche = true;
          modifie = true;
          return;
        }
        const champActuel = _CHAMP_RESSOURCE[d.ressource];
        const actuel = champActuel ? (p[champActuel] || 0) : 0;
        let ressourceAppliquee = d.ressource, deltaLog, valLog;
        if (d.operation === "perte" && d.repli && actuel <= 0) {
          ressourceAppliquee = d.repli.ressource;
          valLog = _valeurDeclencheur(d.repli.valeur);
          deltaLog = -valLog;
        } else {
          valLog = _valeurDeclencheur(d.valeur);
          deltaLog = d.operation === "gain" ? valLog : -valLog;
        }
        const champ = _CHAMP_RESSOURCE[ressourceAppliquee];
        if (!champ) return;
        if (ressourceAppliquee === "pv") {
          if (deltaLog > 0) Personnage.appliquerGainPv(p, deltaLog, { ignorerCorruption: true });
          else p.pvActuel = Math.max(0, Math.min(p.pvMax, p.pvActuel + deltaLog));
          pvTouche = true;
        } else {
          p[champ] = Math.max(0, (p[champ] || 0) + deltaLog);
        }
        toast(`⚡ ${it.nom} : ${p.nom} ${deltaLog >= 0 ? "gagne" : "perd"} ${Math.abs(deltaLog)} ${LABELS_RESSOURCE_TOAST[ressourceAppliquee] || ressourceAppliquee}.`);
        modifie = true;
      });
    });
    if (!modifie) return;
    if (pvTouche) {
      const transition = _majEtatMourant(p, pvAvant);
      sauverPersos(persos);
      _syncPvAffichages(persoId, p);
      if (transition) _rerendreApresTransitionMourant(persoId);
    } else {
      sauverPersos(persos);
    }
    // messagesToast : uniquement rempli par la branche effets[] (l'ancien
    // chemin ressource/operation appelle toast() lui-même par déclencheur,
    // comportement inchangé) — un seul toast final, même principe que
    // appliquerMalus/le clic des capacités de monstre.
    if (messagesToast.length) toast(messagesToast.join(" — "));
  }

  // Réduction automatique des dégâts subis (cf. "absorbant", lot "subitAttaque :
  // esquive/réduction") — contrairement à l'esquive (fenêtre de réaction
  // AVANT le jet), la réduction agit APRÈS un coup déjà confirmé mais AVANT
  // que les PV ne soient décomptés : aucun choix proposé (comportement
  // automatique, même principe que les procs subitContact existants), juste
  // branché en AMONT de subirDegats plutôt qu'en aval. Un effet dédié
  // "reductionDegats" (hors du vocabulaire de _resoudreEffetsDeclencheur, qui
  // ne s'exécute qu'une fois les PV déjà décomptés — trop tard pour réduire).
  // Renvoie le total inchangé si rien n'est disponible.
  function _reduireDegatsSubisSiDisponible(pjId, total, typeDegatsSubis) {
    const persos = chargerPersos();
    const p = persos[pjId];
    if (!p || typeof total !== "number") return total;
    const perso = Personnage.depuisJSON(p);
    let totalAjuste = total;
    let modifie = false;
    const messagesToast = [];
    perso._itemsEquipesUniques().forEach((it) => {
      if (!it.declencheurs || modifie) return; // un seul proc par coup, cf. "1 fois"
      it.declencheurs.forEach((d) => {
        if (modifie || d.evenement !== "subitContact") return;
        if (d.typeDegats && d.typeDegats !== typeDegatsSubis) return;
        const effetReduction = Array.isArray(d.effets) && d.effets.find((e) => e.type === "reductionDegats");
        if (!effetReduction) return;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (!usage.ok) return;
        // valeur (flat, cf. "protectrice mithril" légendaire, lot "armures C")
        // OU fraction (défaut, cf. "absorbant") — jamais les deux sur un même effet.
        totalAjuste = effetReduction.valeur !== undefined
          ? Math.max(0, total - effetReduction.valeur)
          : Math.floor(total * (1 - (effetReduction.fraction || 0.5)));
        if (usage.appliquer) usage.appliquer();
        modifie = true;
        messagesToast.push(`${it.nom} : dégâts réduits à ${totalAjuste} (au lieu de ${total}).`);
      });
    });
    if (modifie) { sauverPersos(persos); toast(messagesToast.join(" — ")); }
    return totalAjuste;
  }

  // Symétrique de _gererDeclencheursEquipement : le PORTEUR est la CIBLE
  // (cf. Affixes phase 2 §C, "quand le porteur est touché" — épineuse/
  // renvoyeur). Appelé quand un monstre touche un PJ au contact ; les effets
  // visent "l'attaquant" (le monstre), jamais le porteur lui-même — aucun
  // texte de cette phase ne cible autre chose, donc pas de branche ctx.cibleId
  // ici (resterait undefined, jamais lue par _resoudreEffetsDeclencheur pour
  // un effet cible:"attaquant"). Journalise dans l'historique (ajouterHisto)
  // pour rester visible côté MJ, comme demandé par la checklist du prompt.
  // typeDegatsSubis ("physique"|"magique", cf. affixes "réfléchissante" —
  // ne renvoie que les dégâts MAGIQUES subis, contrairement à épineuse/
  // renvoyeur/runique qui ne distinguent pas) : optionnel, absent = aucun
  // filtre côté déclencheur (comportement historique, épineuse/renvoyeur
  // n'ont jamais porté ce champ).
  function _gererDeclencheursSubitContact(pjId, attaquantMonstreId, typeDegatsSubis) {
    const persos = chargerPersos();
    const p = persos[pjId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const messagesToast = [];
    let usageConsomme = false;
    perso._itemsEquipesUniques().forEach((it) => {
      if (!it.declencheurs || !it.declencheurs.length) return;
      it.declencheurs.forEach((d) => {
        if (d.evenement !== "subitContact") return;
        if (!Array.isArray(d.effets)) return;
        // reductionDegats (cf. "absorbant" ci-dessus) : déjà traité en amont
        // par _reduireDegatsSubisSiDisponible — un déclencheur PUREMENT
        // reductionDegats n'a plus rien à faire ici (usage déjà consommé),
        // le laisser passer redéclencherait/re-consommerait pour rien.
        if (d.effets.every((e) => e.type === "reductionDegats")) return;
        if (d.typeDegats && d.typeDegats !== typeDegatsSubis) return;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (!usage.ok) return;
        const ctx = { persoId: pjId, p, perso, persos, attaquantId: attaquantMonstreId, itNom: it.nom, type: null, messagesToast, pvPorteurTouche: false };
        _resoudreEffetsDeclencheur(d.effets, ctx);
        if (usage.appliquer) { usage.appliquer(); usageConsomme = true; }
      });
    });
    if (usageConsomme) sauverPersos(persos);
    if (messagesToast.length) {
      toast(messagesToast.join(" — "));
      ajouterHisto(`${p.nom} — Riposte d'équipement`, 0, false, false, messagesToast.join(" — "));
    }
  }
  const LABELS_RESSOURCE_TOAST = { or: "PO", argent: "PA", bronze: "PB", pv: "PV" };

  // Résout un token de battlemap (cibleId, cf. _ciblesPortee) vers la clé
  // composite attendue par ouvrirModalMalus/appliquerMalus ("pj:id" ou
  // "monstre:id") — même logique de résolution que _resoudreAttaqueRapide.
  function _cibleRawDepuisToken(cibleId) {
    if (!cibleId || typeof Carte === "undefined") return null;
    const monstre = (Carte.listeMonstresCombat ? Carte.listeMonstresCombat() : []).find((t) => t.id === cibleId);
    if (monstre) return `monstre:${monstre.id}`;
    const pjTok = (Carte.listeTokensJoueursCombat ? Carte.listeTokensJoueursCombat() : []).find((t) => t.id === cibleId);
    if (pjTok && pjTok.ref && pjTok.ref.startsWith("pj-")) return `pj:${pjTok.ref.slice(3)}`;
    return null;
  }

  // Applique `entree` (déjà construite, forme etatsActifs — idEtat/dureeRestante/
  // formuleDot...) sur cibleRaw ("pj:id" ou "monstre:id"), avec les MÊMES gardes
  // d'immunité que le panneau Malus MJ (appliquerMalus, plus bas) — factorisé
  // ici pour qu'un déclenchement AUTOMATIQUE (affixe de loot sur touche,
  // cf. _resoudreEffetsDeclencheur) applique un état sans passer par la modale
  // ni dupliquer une troisième fois la garde déjà écrite deux fois (ici et dans
  // le clic des capacités de monstre). Ne fait AUCUN toast lui-même : renvoie
  // { applique, message } pour que l'appelant compose un seul toast final
  // (cf. la bascule messagesToast déjà en place ailleurs dans ce fichier).
  function _appliquerEtatSurCibleRaw(cibleRaw, idEtat, entree) {
    if (!cibleRaw || !ETATS[idEtat]) return { applique: false, message: null };
    const sep = cibleRaw.indexOf(":");
    const type = cibleRaw.slice(0, sep);
    const id = cibleRaw.slice(sep + 1);
    if (type === "pj") {
      const persos = chargerPersos();
      const p = persos[id];
      if (!p) return { applique: false, message: null };
      const perso = Personnage.depuisJSON(p);
      if (perso.aImmuniteEtat(idEtat)) {
        return { applique: false, message: `${p.nom} est immunisé·e à « ${ETATS[idEtat].nom} » (Liberté d'action).` };
      }
      p.etatsActifs = p.etatsActifs || [];
      p.etatsActifs.push(entree);
      sauverPersos(persos);
      if (ficheActiveId === id) afficherFiche(id);
      if (ficheSidebarActiveId === id) rendreFicheSidebarBattlemap(id);
      return { applique: true, message: `${ETATS[idEtat].nom} appliqué à ${p.nom}.` };
    }
    if (type === "monstre" && typeof Carte !== "undefined") {
      const jetonCible = Carte.listeMonstresCombat ? Carte.listeMonstresCombat().find((mm) => mm.id === id) : null;
      const imm = typeof CapacitesMonstres !== "undefined" ? CapacitesMonstres.immunite(jetonCible, idEtat) : { bloquee: false, condition: null };
      if (imm.bloquee) {
        return { applique: false, message: `${jetonCible ? jetonCible.nom : "Ce monstre"} est immunisé à « ${ETATS[idEtat].nom} ».` };
      }
      Carte.ajouterEtatCombat(id, entree);
      rendreTableCombat();
      rendreTableCombat("battlemap-zone-table-combat");
      return { applique: true, message: `${ETATS[idEtat].nom} appliqué${imm.condition ? ` (immunité conditionnelle : ${imm.condition} À arbitrer)` : ""}.` };
    }
    return { applique: false, message: null };
  }

  // Pose une entrée "bonus" pure (idEtat: null, cf. _appliquerBonusMonstreDepuisMessages
  // pour l'équivalent monstre "manuel") sur cibleRaw — même format lu par
  // htmlEtatsActifs côté PJ et _bonusEtatsMonstre côté monstre. Pas de garde
  // d'immunité ici : un bonus/malus générique (ex. -1 DEF) n'est pas un état
  // nommé, rien dans le catalogue ETATS ne peut s'y opposer.
  function _appliquerBonusSurCibleRaw(cibleRaw, cible, valeur, dureeExpr, source) {
    if (!cibleRaw) return false;
    const sep = cibleRaw.indexOf(":");
    const type = cibleRaw.slice(0, sep);
    const id = cibleRaw.slice(sep + 1);
    const entree = {
      idEtat: null,
      bonus: { cible, valeur },
      dureeRestante: Object.assign(_resoudreDureeToursMonstre(dureeExpr, null), { dureeAffichee: dureeExpr }),
      source,
      poseLe: Date.now(),
    };
    if (type === "pj") {
      const persos = chargerPersos();
      const p = persos[id];
      if (!p) return false;
      p.etatsActifs = p.etatsActifs || [];
      p.etatsActifs.push(entree);
      sauverPersos(persos);
      if (ficheActiveId === id) afficherFiche(id);
      if (ficheSidebarActiveId === id) rendreFicheSidebarBattlemap(id);
      return true;
    }
    if (type === "monstre" && typeof Carte !== "undefined" && Carte.ajouterEtatCombat) {
      Carte.ajouterEtatCombat(id, entree);
      rendreTableCombat();
      rendreTableCombat("battlemap-zone-table-combat");
      return true;
    }
    return false;
  }

  // Action de Lancer (data-bm-attaque="lancer", cf. rendreFicheSidebarBattlemap/
  // rendreDockCombat) : consomme l'objet choisi (_objetLanceIdx) que le jet
  // touche ou non — jeté/perdu dans tous les cas, comme n'importe quelle
  // munition. Si l'objet porte un formuleDot (poison) ET que le jet a touché
  // une cible identifiée, ouvre la modale Malus déjà pré-remplie (empoisonnee)
  // — le MJ garde la main pour confirmer via "Appliquer" ou annuler. Sinon
  // (objet non-poison, raté, ou cible inconnue) : toast informatif standard.
  function _resoudreConsommationLancer(persoId, cibleId, resolution, resultatMsg) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const objetsJetables = (p.inventaireListe || []).filter((it) => it.jetable && (it.quantite || 1) > 0);
    const item = objetsJetables[_objetLanceIdx];
    if (!item) return;
    _consommerUnite(p, p.inventaireListe.indexOf(item));
    sauverPersos(persos);
    _objetLanceIdx = null;

    if (item.formuleDot && resolution.touche === true && cibleId) {
      const cibleRaw = _cibleRawDepuisToken(cibleId);
      if (cibleRaw) {
        ouvrirModalMalus({
          cibleRaw, idEtat: "empoisonnee",
          dureeAffichee: item.dureeEtat ? `${item.dureeEtat} tours` : "",
          formuleDot: item.formuleDot,
        });
        if (resultatMsg) toast(resultatMsg);
        return;
      }
    }
    toast(`${item.nom} lancé et consommé.${resultatMsg ? " " + resultatMsg : ""}`);
  }

  // Visibilité du bouton "Dégâts" et doublement des dés pour un type
  // d'attaque donné, pour CE personnage (cf. attaquesRapidesEnAttente) —
  // visible=false SEULEMENT si l'attaque a explicitement raté (touche ===
  // false) ; jamais si aucune cible n'a été sélectionnée ou si sa DEF est
  // inconnue (touche === null, comportement d'avant ce chantier).
  function _etatDegatsRapide(persoId, type) {
    const e = attaquesRapidesEnAttente[type];
    if (!e || e.persoId !== persoId) return { visible: true, critique: false };
    return { visible: e.touche !== false, critique: e.touche === true && !!e.critique };
  }

  // Sorts de Grimoire (appris + accordés par la voie) pour la mini-fiche
  // battlemap d'un casteur (cf. estCasterGrimoire ci-dessous) — reprend
  // l'énumération de la carte "📖 Grimoire" de la fiche complète
  // (afficherFiche), sans le sélecteur de Cercle de spécialisation ni la
  // liste "Apprentissage" (gestion hors combat, hors de propos ici).
  function htmlSortsGrimoireBattlemap(p, perso) {
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[p.classe] || []) : [];
    const appris = p.grimoireSortsConnus || [];
    const accordes = perso.sortsGrimoireAccordes();
    const idsAffiches = appris.concat(accordes.filter((sid) => !appris.includes(sid)));
    const resume = `<div class="aide" style="margin-bottom:8px;">${perso.grimoireSlotsOccupes()}/${perso.slotsGrimoire()} sorts connus${perso.slotsGrimoire() === 0 ? ` — ajoute ${NOM_OBJET_GRIMOIRE_PAR_CLASSE[p.classe] || "un objet de Grimoire"} à ton inventaire pour en apprendre.` : ""}</div>`;
    if (!idsAffiches.length) return resume + `<div class="vide">Aucun sort appris.</div>`;
    const listeHtml = idsAffiches.map((sortId) => {
      const sort = catalogue.find((s) => s.id === sortId);
      if (!sort) return "";
      const source = { origine: "grimoire", cle: sort.id, nomCap: sort.nom };
      const coutTexte = sort.mecanique.coutPP ? `${sort.mecanique.coutPP} PP`
        : sort.mecanique.coutPointsBenediction ? `${sort.mecanique.coutPointsBenediction} Pt. Bénédiction`
        : sort.mecanique.coutPointsConviction ? `${sort.mecanique.coutPointsConviction} Pt. Conviction`
        : sort.mecanique.coutPointsBannissement ? `${sort.mecanique.coutPointsBannissement} Pt. Bannissement`
        : sort.mecanique.coutPointsJugement ? `${sort.mecanique.coutPointsJugement} Pt. Jugement`
        : "gratuit";
      const tagAccorde = !appris.includes(sortId) ? " · accordé par la voie" : "";
      // Emplacement réellement disponible (cf. Personnage.sortGrimoireADesEmplacements) :
      // un sort "connu" (appris ou accordé) sans palier compatible sur l'objet
      // porté reste listé, mais son bouton Lancer est remplacé par un badge
      // explicatif — se débloque automatiquement avec un meilleur objet.
      const dispo = perso.sortGrimoireADesEmplacements ? perso.sortGrimoireADesEmplacements(sortId) : true;
      const boutonOuBadge = dispo
        ? htmlLancerCapacite(source, sort.mecanique, p)
        : ` <span class="loot-badge" style="opacity:.6;" title="Nécessite un objet de meilleure rareté pour ce rang">Sans emplacement</span>`;
      return `<div class="cap-fiche">
        <div class="titre-cap">${echapper(sort.nom)}${boutonOuBadge}</div>
        <div class="voie-source">Rang ${sort.rang} · ${coutTexte}${tagAccorde}</div>
        <div class="effet-cap">${echapper(sort.effet)}</div>
      </div>`;
    }).join("");
    return resume + listeHtml;
  }

  // Mini-fiche affichée en permanence à gauche de la battlemap (joueur
  // uniquement) : suit le personnage sélectionné dans "Mon personnage",
  // le même que celui dont le jeton est posé sur la scène.
  function rendreFicheSidebarBattlemap(id) {
    const sidebar = document.getElementById("battlemap-fiche-sidebar");
    if (!sidebar) return;
    ficheSidebarActiveId = id || null;
    // Ordre d'initiative (lecture seule) au-dessus de la battlemap (cf.
    // #battlemap-zone-ordre-initiative-joueur, index.html) pendant un combat —
    // re-rendu en temps réel car cette fonction est rappelée à chaque
    // Combat.onChange (cf. init()).
    const zoneOrdreJoueur = document.getElementById("battlemap-zone-ordre-initiative-joueur");
    if (zoneOrdreJoueur) zoneOrdreJoueur.innerHTML = _htmlOrdreInitiativeLecture(id);
    const persos = chargerPersos();
    const p = id && persos[id];
    if (!p) {
      sidebar.innerHTML = `<div class="carte"><p class="aide">Choisis ton personnage dans « Mon personnage » ci-dessus pour afficher sa fiche ici.</p></div>`;
      rendreDockCombat(); // masque le dock si aucun perso sélectionné
      if (typeof Carte !== "undefined" && Carte.desactiverModeCiblage) Carte.desactiverModeCiblage();
      return;
    }
    const c = CLASSES[p.classe];
    const race = p.race ? RACES[p.race] : null;
    const perso = Personnage.depuisJSON(p);
    // Casteur de Grimoire (cf. SORTS_PAR_CLASSE) : au combat, ce qui compte
    // est la liste de sorts à lancer, pas le texte des voies (déjà
    // consultable sur la fiche complète) — la carte "Capacités" de cette
    // mini-fiche affiche donc les sorts (appris + accordés) à la place,
    // cf. htmlSortsGrimoireBattlemap ci-dessous.
    const estCasterGrimoire = typeof SORTS_PAR_CLASSE !== "undefined" && !!SORTS_PAR_CLASSE[p.classe];
    const mods = {};
    CARACS.forEach((cc) => (mods[cc.code] = perso.mod(cc.code)));
    const init = perso.calculerInitiative();

    // Attaques rapides : Contact toujours dispo, Distance seulement avec une
    // arme à portée équipée (arc, arbalète...), Magique seulement pour une
    // classe de lanceur de sorts (cf. Personnage.bonusAttaque).
    const armeContact = perso.armeContactEquipee();
    const armeDistance = perso.armeDistanceEquipee();
    const attMagique = perso.bonusAttaque("magique");
    // 4e type d'attaque rapide : lance n'importe quel objet d'inventaire
    // marqué jetable: true (dard empoisonné en premier lieu, mais générique —
    // cf. bombe_alchimique). Portée calculée dynamiquement (2m + Mod.FOR),
    // pas une constante comme PORTEE_CONTACT/PORTEE_MAGIQUE_BASE plus bas.
    const objetsJetables = (p.inventaireListe || []).filter((it) => it.jetable && (it.quantite || 1) > 0);
    const attLancer = objetsJetables.length ? perso.bonusAttaque("lancer") : null;
    // Dégâts = formule de l'arme réellement équipée (même bonus que
    // badgeEffetItem : bonusDegatsTotal posé par une rareté prime sur
    // enchantement seul) ; si aucune arme de contact n'est équipée, repli sur
    // les dégâts à mains nues du Moine (Voie des poings) le cas échéant. En
    // bi-arme (mêlée + arme courte en main secondaire), combine les deux
    // formules — cf. Personnage.armeCourteSecondaire.
    // bonusDegatsAffixe : bonus de dégâts fixe de l'affixe de loot "Folie"
    // (js/affixes.js), mécanisé ici comme un terme additionnel de la formule
    // (au même titre que l'enchantement/bonusDegatsTotal), à la différence du
    // bonus SUR critique de "Aiguisé" qui reste descriptif (cf. affixes.js).
    const formuleDegats = (arme) => {
      if (!arme) return null;
      const bonus = arme.bonusDegatsTotal !== undefined ? arme.bonusDegatsTotal : (arme.enchantement || 0);
      const base = arme.degats + (bonus ? (bonus > 0 ? "+" + bonus : String(bonus)) : "");
      return arme.bonusDegatsAffixe ? base + "+" + arme.bonusDegatsAffixe : base;
    };
    // Dons mécaniques Frappe puissante/Tir de précision (cf. rendreDockCombat) :
    // les bascules sont pilotées depuis le dock (togglesDons, état module
    // partagé) mais doivent aussi ajuster les chiffres affichés ici.
    const dons = p.dons || [];
    const peutFrappePuissante = dons.includes("frappe_puissante") && !!(armeContact && armeContact.deuxMains);
    const peutTirPrecision = dons.includes("tir_precision") && !!armeDistance;
    const actifFrappePuissante = peutFrappePuissante && togglesDons.frappe_puissante;
    const actifTirPrecision = peutTirPrecision && togglesDons.tir_precision;
    // Prêtre — Cercle de la Foi, sort "Arme bénie" (cf. Personnage.aArmeBenie) :
    // +1 attaque/+2 DM tant que l'état posé par le sort reste actif — plus une
    // bascule manuelle, la cible maléfique/morte-vivante reste déclarée par le
    // joueur au moment de résoudre l'attaque, faute de cibleId résolu ici.
    const actifArmeBenie = perso.aArmeBenie();
    const attContact = perso.bonusAttaque("contact") - (actifFrappePuissante ? 2 : 0) + (actifArmeBenie ? 1 : 0);
    // "tournoyante" (francisque, cf. lot "malgré la limite") : une arme de
    // contact aussi jetable à distance courte partage le même bouton
    // "Distance" qu'une vraie arme à distance — mais son usage (1x/combat au
    // rare, illimité au légendaire) est vérifié ICI, pas dans
    // armeDistanceEquipee() (lecture pure de l'équipement, cf. Personnage).
    const armeDistanceEstJetContact = !!(armeDistance && Personnage._estArmeContact(armeDistance));
    const jetArmeDispo = armeDistanceEstJetContact ? _itemLancerArmeDisponible(p) : null;
    const attDistance = armeDistance && (!armeDistanceEstJetContact || jetArmeDispo) ? perso.bonusAttaque("distance") - (actifTirPrecision ? 2 : 0) : null;
    const armeCourteSecondaire = perso.armeCourteSecondaire();
    let dmgContact = _combinerFormules(formuleDegats(armeContact) || perso.degatsPoings(), formuleDegats(armeCourteSecondaire));
    if (dmgContact && actifFrappePuissante) dmgContact += "+4";
    if (dmgContact && actifArmeBenie) dmgContact += "+2";
    // Don Expert en hast : +1 dégâts au contact avec une arme d'allonge
    // qualifiante (cf. Personnage.aExpertHastQualifie).
    if (dmgContact && perso.aExpertHastQualifie()) dmgContact += "+1";
    // Chevalier — Voie du chaos rang 4 "Marque du serment brisé", choix
    // "degats" (dès CA 5+) : +1d8 DM chaotique sur l'arme de contact.
    if (dmgContact && perso.bonusDegatsArmeChaos()) dmgContact += "+" + perso.bonusDegatsArmeChaos();
    if (dmgContact && perso.bonusDegatsDechainement()) dmgContact += "+" + perso.bonusDegatsDechainement();
    if (dmgContact && perso.bonusDegatsForceHerculeenne()) dmgContact += "+" + perso.bonusDegatsForceHerculeenne();
    if (dmgContact && perso.bonusDegatsFormuleEquipement()) dmgContact += "+" + perso.bonusDegatsFormuleEquipement(); // objet forgé « +dmg par variable » (Forge)
    if (dmgContact && perso.bonusDegatsContactEquipement()) dmgContact += "+" + perso.bonusDegatsContactEquipement(); // affixes "brutale"/"ecrasant", cf. Personnage.bonusDegatsContactEquipement
    // Enchanteur — Voie de la transfiguration rang 3 "Arme enchantée" (cible :
    // n'importe quel allié équipé) : +1d6 DM magiques tant que l'état
    // 'arme_enchantee' reste actif.
    if (dmgContact && perso.bonusDegatsArmeEnchantee()) dmgContact += "+" + perso.bonusDegatsArmeEnchantee();
    // Chevalier — Voie du chaos rang 5 "Avatar du pacte" : +2d6 DM tant que
    // l'état 'avatar_du_pacte' reste actif.
    if (dmgContact && perso.bonusDegatsAvatarPacte()) dmgContact += "+" + perso.bonusDegatsAvatarPacte();
    // Bonus de dégâts générique posé par une capacité "bonus cible:degats"
    // (ex. Druide "Masque du prédateur"/"Totem de la force sauvage") — dés
    // déjà résolus une seule fois à l'activation (cf. appliquerBonusSurPerso),
    // stockés comme un nombre fixe, lu génériquement via bonusTemporaire.
    if (dmgContact && perso.bonusTemporaire("degats")) dmgContact += "+" + perso.bonusTemporaire("degats");
    let dmgDistance = formuleDegats(armeDistance);
    if (dmgDistance && actifTirPrecision) dmgDistance += "+4";
    if (dmgDistance && perso.bonusDegatsFormuleEquipement()) dmgDistance += "+" + perso.bonusDegatsFormuleEquipement(); // objet forgé « +dmg par variable » (Forge)
    const dmgMagique = attMagique !== null ? perso.degatsMagiques() : null;
    // Guerrier — Voie du soldat, rang 1 "Posture de combat" : transfert
    // temporaire vers "DM" (cf. Capacites.resoudreEffet, choix pairé) —
    // canal générique, lu ici pour les 3 types d'attaque comme bonusAttaque.
    const bonusDmTemp = perso.bonusTemporaire("DM");
    if (bonusDmTemp) {
      if (dmgContact) dmgContact += (bonusDmTemp >= 0 ? "+" : "") + bonusDmTemp;
      if (dmgDistance) dmgDistance += (bonusDmTemp >= 0 ? "+" : "") + bonusDmTemp;
    }
    // Visibilité/doublement des boutons "Dégâts" selon la dernière attaque de
    // ce type (cf. _etatDegatsRapide/_resoudreAttaqueRapide) — masqué
    // seulement sur un raté avéré (cible sélectionnée + DEF connue).
    const etatDegC = _etatDegatsRapide(id, "contact");
    const etatDegD = _etatDegatsRapide(id, "distance");
    const etatDegM = _etatDegatsRapide(id, "magique");
    // État Mourant(e)/Mort (cf. rendreDockCombat) : plus aucune action tant que
    // peutAgir est faux, seul le jet de mort reste disponible (à son tour).
    const pv = p.pvActuel || 0;
    const estMourant = pv <= 0 && !p.etatMort;
    const estMort = !!p.etatMort;
    const peutAgir = !estMourant && !estMort;
    const etatCS = typeof Combat !== "undefined" ? Combat.etatCourant() : null;
    const actifCS = etatCS && etatCS.ordre[etatCS.indexActuel];
    const cEstMonTourS = !!(actifCS && actifCS.type === "pj" && actifCS.id === id);

    // Vérificateur de portée (grille dd2vtt) : ne propose comme cible QUE les
    // tokens effectivement à portée du type d'attaque choisi (Contact/
    // Distance/Magique), plutôt que lister tout le monde avec un verdict —
    // Contact = 1 case (mêlée de base), Distance = porteeMinCases/
    // porteeMaxCases de l'arme équipée, Magique = 5 cases de base (aucune
    // arme concernée, valeur fixe indépendante de l'équipement).
    const PORTEE_CONTACT = { min: 0, max: 1 };
    const PORTEE_MAGIQUE_BASE = { min: 0, max: 5 };
    const porteesParType = { contact: PORTEE_CONTACT };
    if (armeDistance && armeDistance.porteeMaxCases !== undefined) {
      porteesParType.distance = { min: armeDistance.porteeMinCases || 0, max: armeDistance.porteeMaxCases };
    }
    if (attMagique !== null) porteesParType.magique = PORTEE_MAGIQUE_BASE;
    if (objetsJetables.length) {
      porteesParType.lancer = { min: 0, max: 2 + perso.mod("FOR") };
    }

    let porteeHtml = "";
    // Hoistés hors du bloc ci-dessous pour l'armement du mode de ciblage
    // carte juste après (cf. plus bas) : monTokenIdPortee = token du
    // lanceur, porteeActuellePortee = {min,max} du type d'attaque choisi.
    let monTokenIdPortee = null;
    let porteeActuellePortee = null;
    if (typeof Combat !== "undefined" && Combat.estActif() &&
        typeof Carte !== "undefined" && Carte.distanceCasesEntre) {
      const monTokenId = _monTokenId(id);
      const toutesLesCibles = monTokenId ? _ciblesPortee(monTokenId) : [];
      if (monTokenId && toutesLesCibles.length) {
        const TYPE_LABELS = { contact: "⚔️ Contact", distance: "🏹 Distance", magique: "✨ Magique", lancer: "🎯 Lancer" };
        const typesDispo = Object.keys(porteesParType);
        if (!typesDispo.includes(_typeAttaquePortee)) _typeAttaquePortee = typesDispo[0];
        const portee = porteesParType[_typeAttaquePortee];
        const ciblesEnPortee = toutesLesCibles
          .map((cc) => Object.assign({ _distance: Carte.distanceCasesEntre(monTokenId, cc.id) }, cc))
          .filter((cc) => cc._distance !== null && cc._distance >= portee.min && cc._distance <= portee.max);
        monTokenIdPortee = monTokenId;
        porteeActuellePortee = portee;
        if (!ciblesEnPortee.some((cc) => cc.id === _cibleDistanceId)) {
          _cibleDistanceId = ciblesEnPortee.length ? ciblesEnPortee[0].id : null;
        }
        const cibleActuelle = ciblesEnPortee.find((cc) => cc.id === _cibleDistanceId);
        // Sélecteur d'objet à lancer, visible seulement pour ce type — même
        // emplacement que le sélecteur de cible (cf. _objetLanceIdx).
        if (_typeAttaquePortee === "lancer") {
          if (_objetLanceIdx === null || _objetLanceIdx < 0 || _objetLanceIdx >= objetsJetables.length) {
            _objetLanceIdx = objetsJetables.length ? 0 : null;
          }
        }
        porteeHtml = `
        <div style="margin-top:8px;">
          <label style="font-size:0.78rem;display:block;">📏 Portée
            <select id="bm-type-portee" style="width:100%;margin-top:2px;">
              ${typesDispo.map((t) => `<option value="${t}" ${t === _typeAttaquePortee ? "selected" : ""}>${TYPE_LABELS[t]} (${porteesParType[t].min}-${porteesParType[t].max} cases)</option>`).join("")}
            </select>
          </label>
          ${_typeAttaquePortee === "lancer" && objetsJetables.length ? `
          <select id="bm-objet-lancer" style="width:100%;margin-top:4px;">
            ${objetsJetables.map((it, i) => `<option value="${i}" ${i === _objetLanceIdx ? "selected" : ""}>${echapper(it.nom)} (${it.quantite || 1})</option>`).join("")}
          </select>
          ` : ""}
          ${ciblesEnPortee.length ? `
          <select id="bm-cible-portee" style="width:100%;margin-top:4px;">
            ${ciblesEnPortee.map((cc) => `<option value="${cc.id}" ${cc.id === _cibleDistanceId ? "selected" : ""}>${echapper(cc.nom)} (${cc._distance} case${cc._distance === 1 ? "" : "s"})</option>`).join("")}
          </select>
          ${cibleActuelle ? `<p style="font-size:0.78rem;margin:4px 0 0;color:#2f9e44;font-weight:700;">En portée — ${cibleActuelle._distance} case${cibleActuelle._distance === 1 ? "" : "s"}</p>` : ""}
          <p class="aide" style="font-size:0.72rem;margin:4px 0 0;">💡 Ou clique directement sur un jeton en surbrillance sur la carte.</p>
          ` : `<p class="aide" style="font-size:0.72rem;margin:4px 0 0;">Aucune cible à portée pour cette attaque.</p>`}
        </div>`;
      }
    }

    // Mode de ciblage carte (clic sur un jeton = présélection, cf.
    // Carte.activerModeCiblage) : le prédicat recalcule la distance à CHAQUE
    // rendu (pas un ensemble d'ids figé), pour suivre un déplacement de
    // jeton en direct (le sien ou celui d'une cible potentielle) — sinon la
    // surbrillance restait calée sur les distances du moment de l'ouverture
    // du vérificateur de portée. Désarmé si aucun vérificateur n'est affiché
    // (ex. combat terminé entre deux rendus). Partage modeCiblage avec le
    // ciblage des capacités (cf. _armerCiblageCarte) : un seul picker/
    // vérificateur peut être actif à la fois de toute façon, le dernier
    // armé gagne.
    if (typeof Carte !== "undefined" && Carte.activerModeCiblage) {
      if (monTokenIdPortee && porteeActuellePortee) {
        Carte.activerModeCiblage((tokId) => {
          if (tokId === monTokenIdPortee) return false;
          const dist = Carte.distanceCasesEntre(monTokenIdPortee, tokId);
          return dist !== null && dist >= porteeActuellePortee.min && dist <= porteeActuellePortee.max;
        }, (tokId) => {
          _cibleDistanceId = tokId;
          rendreFicheSidebarBattlemap(id);
        });
      } else if (Carte.desactiverModeCiblage) {
        Carte.desactiverModeCiblage();
      }
    }

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
          <div class="stat-box stat-pv">
            <div class="label">Points de vie</div>
            <div class="pv-control">
              <button id="bm-pv-moins">−</button>
              <input type="number" id="bm-pv-actuel" value="${p.pvActuel}" />
              <span style="font-weight:700;">/ ${p.pvMax}</span>
              <button id="bm-pv-plus">+</button>
            </div>
            <div class="barre-pv"><div class="rempli" id="bm-barre-pv-rempli"></div></div>
            ${blocDegatsSubisHtml("bm-", perso, p)}
          </div>
          <div class="stat-box"><div class="label">CA</div><div class="valeur">${_defPjAvecAura(perso, id)}</div></div>
          <div class="stat-box"><div class="label">Init.</div><div class="valeur">${signe(init)}</div></div>
          ${estCasterGrimoire ? `<div class="stat-box"><div class="label">PP</div><div class="valeur">${p.ppActuel != null ? p.ppActuel : perso.calculerPPMax()} / ${perso.calculerPPMax()}</div></div>` : ""}
        </div>
        <button class="btn petit secondaire" id="bm-voir-fiche-complete" style="width:100%;margin-top:6px;">Voir la fiche complète</button>
      </div>
      ${estMort ? `<div class="carte">
        <h3 style="margin-top:0;">💀 Mort</h3>
        <p class="aide" style="margin:0;">Plus aucune action possible.</p>
      </div>` : estMourant ? `<div class="carte">
        <h3 style="margin-top:0;">🩸 Mourant(e)</h3>
        <p class="aide" style="margin:0 0 6px;">Succès ${p.mortSucces || 0}/3 · Échecs ${p.mortEchecs || 0}/3</p>
        ${cEstMonTourS
          ? `<button class="btn petit" id="bm-btn-jet-mort">🎲 Jet de mort</button>`
          : `<p class="aide" style="margin:0;">Attends ton tour pour lancer ton jet de mort.</p>`}
      </div>` : `<div class="carte">
        <h3 style="margin-top:0;">Attaques rapides</h3>
        <div class="barre-actions">
          <button class="btn petit" data-bm-attaque="contact" data-bonus="${attContact}">⚔️ Contact (${signe(attContact)})</button>
          ${attDistance !== null ? `<button class="btn petit" data-bm-attaque="distance" data-bonus="${attDistance}">🏹 Distance (${signe(attDistance)})</button>` : ""}
          ${attMagique !== null ? `<button class="btn petit" data-bm-attaque="magique" data-bonus="${attMagique}">✨ Magique (${signe(attMagique)})</button>` : ""}
          ${attLancer !== null ? `<button class="btn petit" data-bm-attaque="lancer" data-bonus="${attLancer}">🎯 Lancer (${signe(attLancer)})</button>` : ""}
        </div>
        ${attDistance === null ? `<p class="aide" style="font-size:0.72rem;margin:6px 0 0;">Équipe un arc ou une arbalète pour débloquer l'attaque à distance.</p>` : ""}
        ${(dmgContact && etatDegC.visible) || (dmgDistance && etatDegD.visible) || (dmgMagique && etatDegM.visible) ? `
        <div class="barre-actions" style="margin-top:6px;">
          ${dmgContact && etatDegC.visible ? `<button class="btn petit secondaire" data-bm-degats="${dmgContact}" data-bm-degats-type="contact" data-bm-critique="${etatDegC.critique ? "1" : "0"}" title="${echapper((armeContact ? armeContact.nom : "Poings (Voie des poings)") + (armeCourteSecondaire ? " + " + armeCourteSecondaire.nom : ""))}">🎲 Dégâts Contact (${dmgContact})${etatDegC.critique ? " CRIT" : ""}</button>` : ""}
          ${dmgDistance && etatDegD.visible ? `<button class="btn petit secondaire" data-bm-degats="${dmgDistance}" data-bm-degats-type="distance" data-bm-critique="${etatDegD.critique ? "1" : "0"}" data-bm-mult="${perso.aTirFatal() ? "3" : "2"}" title="${echapper(armeDistance ? armeDistance.nom : "")}">🎲 Dégâts Distance (${dmgDistance})${etatDegD.critique ? " CRIT" : ""}</button>` : ""}
          ${dmgMagique && etatDegM.visible ? `<button class="btn petit secondaire" data-bm-degats="${dmgMagique}" data-bm-degats-type="magique" data-bm-critique="${etatDegM.critique ? "1" : "0"}">🎲 Dégâts Magique (${dmgMagique})${etatDegM.critique ? " CRIT" : ""}</button>` : ""}
        </div>` : ""}
        ${porteeHtml}
      </div>`}
      ${peutAgir ? htmlBlocActionsDuTour(id) : ""}
      ${peutAgir ? htmlBlocDesengagement() : ""}
      ${peutAgir ? htmlBlocAttaqueOpportunite(perso, p) : ""}
      ${htmlBlocFenetreReaction(id, p)}
      ${htmlEtatsActifs(p)}
      ${htmlBlocInitiativeJoueur(id)}
      ${htmlBlocChance(p, perso)}
      ${htmlBlocPierreChance(id, p)}
      ${htmlBlocDisparition(id, p)}
      ${htmlBlocCorruption(p, perso)}
      ${htmlBlocIllusions(p, perso)}
      ${htmlBlocAmes(p, perso)}
      <div class="carte">
        <h3 style="margin-top:0;">${estCasterGrimoire ? "📖 Sorts" : "Capacités"}</h3>
        <div class="cible-capacite-form" style="display:none;">
          <select class="cible-capacite-select"></select>
          <label class="option-payer-cs" style="display:none;"><input type="checkbox" class="check-payer-cs" /> Payer en CS (Don corrompu)</label>
          <label class="option-supplement-cs" style="display:none;"><input type="checkbox" class="check-supplement-cs" /> Payer les points manquants en CS (Supplément corrompu)</label>
          <button class="btn petit or btn-confirmer-cible-capacite">Confirmer la cible</button>
          <button class="btn petit secondaire btn-annuler-cible-capacite">Annuler</button>
        </div>
        ${htmlDegatsCapaciteEnAttente(id)}
        ${estCasterGrimoire ? htmlSortsGrimoireBattlemap(p, perso) : htmlCapacitesClasse(p, c)}
      </div>
      ${race ? `<div class="carte"><h3>Capacités raciales — ${race.voie_nom}</h3>${htmlCapacitesRace(p, race)}</div>` : ""}
    `;
    majBarrePvSidebar(p);
    document.getElementById("bm-pv-plus").onclick = () => ajusterPv(id, +1);
    document.getElementById("bm-pv-moins").onclick = () => ajusterPv(id, -1);
    document.getElementById("bm-pv-actuel").onchange = (e) => definirPv(id, parseInt(e.target.value, 10));
    document.getElementById("bm-voir-fiche-complete").onclick = () => { allerVers("fiche"); afficherFiche(id); };
    wireDegatsSubis(id, "bm-");
    const btnJetMortS = document.getElementById("bm-btn-jet-mort");
    if (btnJetMortS) btnJetMortS.onclick = () => jetDeMort(id);
    // Jet d'attaque sans quitter la battlemap — l'overlay de jet est visible
    // sur tous les onglets (cf. #overlay-jet), pas besoin de rejoindre "Dés".
    // Consomme l'action principale du tour (no-op hors combat, cf. Combat.utiliserActionPrincipale).
    // Réutilise la cible du vérificateur de portée SEULEMENT si son type
    // correspond à cette attaque (sinon elle n'a pas été validée à portée
    // pour CE type, cf. _typeAttaquePortee/_cibleDistanceId) — sans cible,
    // touche vaut null et le bouton de dégâts reste disponible (cf.
    // _resoudreAttaqueRapide).
    sidebar.querySelectorAll("[data-bm-attaque]").forEach((el) => {
      el.onclick = () => {
        const type = el.dataset.bmAttaque;
        const bonus = parseInt(el.dataset.bonus, 10);
        const cibleId = (_typeAttaquePortee === type) ? _cibleDistanceId : null;
        // "tournoyante" (francisque, cf. lot "malgré la limite") : consomme
        // l'usage du jet à distance courte au clic — revérifié ici plutôt que
        // de faire confiance à jetArmeDispo (calculé au rendu, potentiellement
        // périmé), même principe que les fenêtres de réaction.
        if (type === "distance" && armeDistanceEstJetContact) {
          const persosFrais = chargerPersos();
          const pFrais = persosFrais[id];
          const dispoFrais = pFrais && _itemLancerArmeDisponible(pFrais);
          // .usage.appliquer absent sans usage.frequence sur le déclencheur
          // (cf. "tournoyante" légendaire, illimité) — _verifierUsageDeclencheur
          // renvoie alors {ok:true} nu, rien à consommer.
          if (dispoFrais) { if (dispoFrais.usage.appliquer) dispoFrais.usage.appliquer(); sauverPersos(persosFrais); }
        }
        // bonusAttaqueConditionnel (affixe "precise", cf. Affixes phase 2 §B) :
        // lu ici, avant le jet — un effet de déclencheur arriverait trop tard.
        const bonusEffectif = bonus + _bonusAttaqueConditionnelEquipement(perso, type, cibleId);
        const resolution = _resoudreAttaqueRapide(`Attaque ${type}`, bonusEffectif, perso.critMinAttaque(type), cibleId, { persoId: perso.id, caracCode: _caracPourTypeAttaque(type, perso) });
        // cibleId conservé ici (pas seulement dans la résolution du jet) :
        // sert au bouton "Dégâts" pour appliquer automatiquement le résultat
        // sur la BONNE cible au moment du clic (cf. _appliquerDegatsCibleRapide),
        // même si _cibleDistanceId a changé entre-temps (le joueur a reciblé
        // avant de cliquer sur Dégâts).
        attaquesRapidesEnAttente[type] = Object.assign({ persoId: id, cibleId }, resolution);
        const resultatMsg = cibleId
          ? (resolution.echecCritique ? "1 naturel — échec critique automatique."
            : resolution.critique ? `CRITIQUE !${resolution.defCible !== null ? ` (DEF cible ${resolution.defCible})` : ""}`
            : resolution.defCible === null ? "DEF de la cible inconnue — à comparer manuellement."
            : (resolution.touche ? `Touché ! (DEF ${resolution.defCible})` : `Raté (DEF ${resolution.defCible}).`))
          : "";
        // Action de Lancer : consomme l'objet choisi que le jet touche ou
        // non, puis ouvre la modale Malus pré-remplie si l'objet est un
        // poison (formuleDot) et que le jet a touché — cf.
        // _resoudreConsommationLancer.
        if (type === "lancer") {
          _resoudreConsommationLancer(id, cibleId, resolution, resultatMsg);
        } else if (resultatMsg) {
          toast(resultatMsg);
        }
        _gererPremierSangChasseur(id, type, resolution.touche);
        _gererDeclencheursEquipement(id, type, resolution, cibleId);
        if (typeof Combat !== "undefined" && Combat.utiliserActionPrincipale) Combat.utiliserActionPrincipale(id);
        rendreFicheSidebarBattlemap(id);
      };
    });
    // Dégâts de l'arme équipée (formule figée, pas de bonus au jet ici) —
    // data-bm-critique="1" multiplie les dés (×data-bm-mult, 2 par défaut,
    // 3 à distance avec Tir fatal) si la dernière attaque de ce type était
    // un critique (cf. etatDegC/D/M, lancerFormule). Si une cible a été
    // verrouillée ET touchée pour CE type d'attaque (cf. attaquesRapidesEnAttente/
    // _appliquerDegatsCibleRapide), les dégâts lui sont appliqués directement —
    // jusqu'ici ce bouton se contentait d'un jet de dés affiché.
    sidebar.querySelectorAll("[data-bm-degats]").forEach((el) => {
      el.onclick = () => {
        const formule = el.dataset.bmDegats;
        const estCrit = el.dataset.bmCritique === "1";
        const total = lancerFormule(formule, `${p.nom} — Dégâts (${formule})`, estCrit ? parseInt(el.dataset.bmMult || "2", 10) : false);
        const type = el.dataset.bmDegatsType;
        const attente = type && attaquesRapidesEnAttente[type];
        if (attente && attente.persoId === id && attente.touche === true && attente.cibleId) {
          _appliquerDegatsCibleRapide(attente.cibleId, total, attente.ignoreReduction, false, id);
        }
      };
    });
    // Vérificateur de portée : changer de type d'attaque ou de cible re-rend
    // juste ce bloc (recalcule la liste des cibles à portée pour le type choisi).
    const selTypePortee = document.getElementById("bm-type-portee");
    if (selTypePortee) {
      selTypePortee.onchange = () => {
        _typeAttaquePortee = selTypePortee.value;
        _cibleDistanceId = null; // la cible précédente peut ne plus être à portée pour ce type
        rendreFicheSidebarBattlemap(id);
      };
    }
    const selObjetLancer = document.getElementById("bm-objet-lancer");
    if (selObjetLancer) {
      selObjetLancer.onchange = () => {
        _objetLanceIdx = parseInt(selObjetLancer.value, 10);
        rendreFicheSidebarBattlemap(id);
      };
    }
    const selCiblePortee = document.getElementById("bm-cible-portee");
    if (selCiblePortee) {
      selCiblePortee.onchange = () => {
        _cibleDistanceId = selCiblePortee.value;
        rendreFicheSidebarBattlemap(id);
      };
    }
    // Actions du tour (déplacement, action principale/secondaire) — cf.
    // htmlBlocActionsDuTour et js/combat.js.
    const btnDeplacementMoins = document.getElementById("bm-deplacement-moins");
    if (btnDeplacementMoins) btnDeplacementMoins.onclick = () => { Combat.ajusterDeplacement(id, -1); rendreFicheSidebarBattlemap(id); };
    const btnDeplacementPlus = document.getElementById("bm-deplacement-plus");
    if (btnDeplacementPlus) btnDeplacementPlus.onclick = () => { Combat.ajusterDeplacement(id, 1); rendreFicheSidebarBattlemap(id); };
    const btnSprint = document.getElementById("bm-sprint");
    if (btnSprint) btnSprint.onclick = () => { Combat.sprint(id); toast(`Sprint : +${Combat.SPRINT_BONUS} cases de déplacement.`); rendreFicheSidebarBattlemap(id); };
    const btnDoubleDeplacement = document.getElementById("bm-double-deplacement");
    if (btnDoubleDeplacement) btnDoubleDeplacement.onclick = () => { _declencherDoubleDeplacement(id); rendreFicheSidebarBattlemap(id); };
    const btnAttaqueSupplementaire = document.getElementById("bm-attaque-supplementaire");
    if (btnAttaqueSupplementaire) btnAttaqueSupplementaire.onclick = () => { _declencherAttaqueSupplementaire(id); rendreFicheSidebarBattlemap(id); };
    const btnActionSecondaire = document.getElementById("bm-action-secondaire");
    if (btnActionSecondaire) btnActionSecondaire.onclick = () => { Combat.utiliserActionSecondaire(id); rendreFicheSidebarBattlemap(id); };
    const btnReinitActions = document.getElementById("bm-reinit-actions");
    if (btnReinitActions) btnReinitActions.onclick = () => { Combat.reinitialiserActions(id); rendreFicheSidebarBattlemap(id); };
    // Capacités/états, mêmes règles que la fiche complète (cf. wireCapacitesEtEtats).
    wireCapacitesEtEtats(sidebar, id, p, () => rendreFicheSidebarBattlemap(id));
    rendreDockCombat(); // barre d'action de combat sous la carte (cf. plus bas)
  }

  /* ---------- Dock de combat (barre d'action sous la battlemap) ---------- */

  // Énumère les capacités LANÇABLES (non passives, mécanisées) d'un perso —
  // classe + voie raciale — sous la forme { source, mecanique, nom }, en
  // répliquant l'énumération de htmlCapacitesClasse/htmlCapacitesRace.
  function _capacitesLancablesPerso(p) {
    const out = [];
    const c = CLASSES[p.classe];
    if (c && Array.isArray(p.capacites)) {
      p.capacites.slice().sort((a, b) => a.voie.localeCompare(b.voie) || a.rang - b.rang).forEach((cap) => {
        const voie = c.voies.find((v) => v.nom === cap.voie);
        const rang = voie && voie.rangs.find((r) => r.rang === cap.rang);
        if (!rang || !rang.mecanique || rang.mecanique.type === "passive") return;
        out.push({ source: { origine: "classe", cle: p.classe, voie: cap.voie, rang: cap.rang, nomCap: rang.nom || `Rang ${cap.rang}` }, mecanique: rang.mecanique, nom: rang.nom || `Rang ${cap.rang}` });
      });
    }
    const race = p.race ? RACES[p.race] : null;
    if (race && Array.isArray(p.capacitesRace)) {
      p.capacitesRace.slice().sort((a, b) => a - b).forEach((rangNum) => {
        const rg = race.rangs.find((x) => x.rang === rangNum);
        if (!rg) return;
        const t = texteRangRace(race, rg, p.raceVariante);
        if (!t.mecanique || t.mecanique.type === "passive") return;
        const src = Object.assign({ cle: p.race, voie: race.voie_nom, nomCap: t.nom || `Rang ${rangNum}` }, t.source);
        out.push({ source: src, mecanique: t.mecanique, nom: t.nom || `Rang ${rangNum}` });
      });
    }
    // Sorts de Grimoire (appris + accordés par la voie, cf. SORTS_PAR_CLASSE)
    // — aussi affichés dans le dock, à côté des capacités : même tuile
    // compacte (nom + badge d'usage), même clic pour lancer/jeter les dés
    // (wireCapacitesEtEtats gère déjà data-lancer-origine="grimoire", cf.
    // la carte "📖 Grimoire" de la fiche complète). Vide pour toute classe
    // sans catalogue (non-casteur) — aucun changement pour elles.
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[p.classe] || []) : [];
    if (catalogue.length) {
      const perso = Personnage.depuisJSON(p);
      const appris = p.grimoireSortsConnus || [];
      const accordes = perso.sortsGrimoireAccordes();
      const idsAffiches = appris.concat(accordes.filter((sid) => !appris.includes(sid)));
      idsAffiches.forEach((sortId) => {
        const sort = catalogue.find((s) => s.id === sortId);
        if (!sort) return;
        out.push({ source: { origine: "grimoire", cle: sort.id, nomCap: sort.nom }, mecanique: sort.mecanique, nom: sort.nom });
      });
    }
    return out;
  }

  // Attributs data-lancer-* d'une capacité (repris tels quels par
  // wireCapacitesEtEtats / Capacites.lancer) — mêmes que htmlLancerCapacite.
  function _attrsLancer(source) {
    return [
      `data-lancer-origine="${source.origine}"`,
      `data-lancer-cle="${source.cle}"`,
      source.voie !== undefined ? `data-lancer-voie="${source.voie}"` : "",
      source.rang !== undefined ? `data-lancer-rang="${source.rang}"` : "",
      source.code !== undefined ? `data-lancer-code="${source.code}"` : "",
      `data-lancer-nom="${echapper(source.nomCap || "")}"`,
    ].filter(Boolean).join(" ");
  }

  // Nom court de sort pour une tuile (retire "(sort, L)" etc., tronque).
  function _courtNom(n) {
    const s = String(n || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    return s.length > 16 ? s.slice(0, 15) + "…" : s;
  }

  // Barre d'action de combat (dock) sous la battlemap, côté JOUEUR : identité +
  // PV + DEF/Init/corruption, attaques rapides, sorts lançables, subir des
  // dégâts. Réutilise les mêmes handlers que la sidebar (lancerTest/
  // lancerFormule, wireDegatsSubis, wireCapacitesEtEtats) — aucune logique
  // dupliquée. Visible seulement pour un joueur, en battlemap, combat actif.
  function rendreDockCombat() {
    const dock = document.getElementById("battlemap-dock-combat");
    if (!dock) return;
    const id = ficheSidebarActiveId;
    const persos = chargerPersos();
    const p = id && persos[id];
    const enCombat = (typeof Combat !== "undefined" && Combat.estActif());
    if (role === "mj" || carteMode !== "battlemap" || !enCombat || !p) {
      dock.innerHTML = "";
      dock.classList.remove("visible");
      return;
    }
    const perso = Personnage.depuisJSON(p);
    const mods = {};
    // + bonusTestCaracCapacites : bonus additif sur un test de caractéristique
    // brut (ex. Moine "Discipline du corps") — jamais mélangé à mod() lui-même
    // pour ne pas fausser attaque/DEF ailleurs, seulement lu par les boutons
    // [data-test] plus bas.
    CARACS.forEach((cc) => (mods[cc.code] = perso.mod(cc.code) + perso.bonusTestCaracCapacites(cc.code)));

    const armeDistance = perso.armeDistanceEquipee();
    const attMagique = perso.bonusAttaque("magique");
    const armeContact = perso.armeContactEquipee();
    // Cf. rendreFicheSidebarBattlemap pour le détail — même calcul, dupliqué
    // ici faute de factorisation commune entre sidebar et dock (comme le
    // reste de ce fichier).
    const objetsJetables = (p.inventaireListe || []).filter((it) => it.jetable && (it.quantite || 1) > 0);
    const attLancer = objetsJetables.length ? perso.bonusAttaque("lancer") : null;
    // bonusDegatsAffixe : bonus de dégâts fixe de l'affixe de loot "Folie"
    // (js/affixes.js), mécanisé ici comme un terme additionnel de la formule
    // (au même titre que l'enchantement/bonusDegatsTotal), à la différence du
    // bonus SUR critique de "Aiguisé" qui reste descriptif (cf. affixes.js).
    const formuleDegats = (arme) => {
      if (!arme) return null;
      const bonus = arme.bonusDegatsTotal !== undefined ? arme.bonusDegatsTotal : (arme.enchantement || 0);
      const base = arme.degats + (bonus ? (bonus > 0 ? "+" + bonus : String(bonus)) : "");
      return arme.bonusDegatsAffixe ? base + "+" + arme.bonusDegatsAffixe : base;
    };
    // Dons mécaniques Frappe puissante (contact, arme deux_mains) / Tir de
    // précision (distance) : -2 au jet d'attaque pour +4 aux dégâts, au choix
    // via une bascule (cf. togglesDons) plutôt qu'automatique à chaque attaque.
    const dons = p.dons || [];
    const peutFrappePuissante = dons.includes("frappe_puissante") && !!(armeContact && armeContact.deuxMains);
    const peutTirPrecision = dons.includes("tir_precision") && !!armeDistance;
    const actifFrappePuissante = peutFrappePuissante && togglesDons.frappe_puissante;
    const actifTirPrecision = peutTirPrecision && togglesDons.tir_precision;
    // Prêtre — Cercle de la Foi, sort "Arme bénie" (cf. Personnage.aArmeBenie) :
    // +1 attaque/+2 DM tant que l'état posé par le sort reste actif.
    const actifArmeBenie = perso.aArmeBenie();

    const attContact = perso.bonusAttaque("contact") - (actifFrappePuissante ? 2 : 0) + (actifArmeBenie ? 1 : 0);
    // "tournoyante" (francisque, cf. lot "malgré la limite") : cf. même
    // garde-fou d'usage que rendreFicheSidebarBattlemap.
    const armeDistanceEstJetContact = !!(armeDistance && Personnage._estArmeContact(armeDistance));
    const jetArmeDispo = armeDistanceEstJetContact ? _itemLancerArmeDisponible(p) : null;
    const attDistance = armeDistance && (!armeDistanceEstJetContact || jetArmeDispo) ? perso.bonusAttaque("distance") - (actifTirPrecision ? 2 : 0) : null;

    // Repli sur les dégâts à mains nues du Moine (Voie des poings) si aucune
    // arme de contact n'est équipée ; combine avec l'arme courte en main
    // secondaire (bi-arme) le cas échéant — cf. rendreFicheSidebarBattlemap.
    const armeCourteSecondaire = perso.armeCourteSecondaire();
    let dmgContact = _combinerFormules(formuleDegats(armeContact) || perso.degatsPoings(), formuleDegats(armeCourteSecondaire));
    if (dmgContact && actifFrappePuissante) dmgContact += "+4";
    if (dmgContact && actifArmeBenie) dmgContact += "+2";
    // Don Expert en hast : +1 dégâts au contact avec une arme d'allonge
    // qualifiante (cf. Personnage.aExpertHastQualifie).
    if (dmgContact && perso.aExpertHastQualifie()) dmgContact += "+1";
    // Chevalier — Voie du chaos rang 4 "Marque du serment brisé", choix
    // "degats" (dès CA 5+) : +1d8 DM chaotique sur l'arme de contact.
    if (dmgContact && perso.bonusDegatsArmeChaos()) dmgContact += "+" + perso.bonusDegatsArmeChaos();
    if (dmgContact && perso.bonusDegatsDechainement()) dmgContact += "+" + perso.bonusDegatsDechainement();
    if (dmgContact && perso.bonusDegatsForceHerculeenne()) dmgContact += "+" + perso.bonusDegatsForceHerculeenne();
    if (dmgContact && perso.bonusDegatsFormuleEquipement()) dmgContact += "+" + perso.bonusDegatsFormuleEquipement(); // objet forgé « +dmg par variable » (Forge)
    if (dmgContact && perso.bonusDegatsContactEquipement()) dmgContact += "+" + perso.bonusDegatsContactEquipement(); // affixes "brutale"/"ecrasant", cf. Personnage.bonusDegatsContactEquipement
    // Enchanteur — Voie de la transfiguration rang 3 "Arme enchantée" (cible :
    // n'importe quel allié équipé) : +1d6 DM magiques tant que l'état
    // 'arme_enchantee' reste actif.
    if (dmgContact && perso.bonusDegatsArmeEnchantee()) dmgContact += "+" + perso.bonusDegatsArmeEnchantee();
    // Chevalier — Voie du chaos rang 5 "Avatar du pacte" : +2d6 DM tant que
    // l'état 'avatar_du_pacte' reste actif.
    if (dmgContact && perso.bonusDegatsAvatarPacte()) dmgContact += "+" + perso.bonusDegatsAvatarPacte();
    // Bonus de dégâts générique posé par une capacité "bonus cible:degats"
    // (ex. Druide "Masque du prédateur"/"Totem de la force sauvage") — dés
    // déjà résolus une seule fois à l'activation (cf. appliquerBonusSurPerso),
    // stockés comme un nombre fixe, lu génériquement via bonusTemporaire.
    if (dmgContact && perso.bonusTemporaire("degats")) dmgContact += "+" + perso.bonusTemporaire("degats");
    let dmgDistance = armeDistance ? formuleDegats(armeDistance) : null;
    if (dmgDistance && actifTirPrecision) dmgDistance += "+4";
    if (dmgDistance && perso.bonusDegatsFormuleEquipement()) dmgDistance += "+" + perso.bonusDegatsFormuleEquipement(); // objet forgé « +dmg par variable » (Forge)
    const dmgMagique = attMagique !== null ? perso.degatsMagiques() : null;
    // Guerrier — Voie du soldat, rang 1 "Posture de combat" : cf. le même
    // ajout côté rendreFicheSidebarBattlemap plus haut dans ce fichier.
    const bonusDmTempDock = perso.bonusTemporaire("DM");
    if (bonusDmTempDock) {
      if (dmgContact) dmgContact += (bonusDmTempDock >= 0 ? "+" : "") + bonusDmTempDock;
      if (dmgDistance) dmgDistance += (bonusDmTempDock >= 0 ? "+" : "") + bonusDmTempDock;
    }
    // Visibilité/doublement des tuiles "Dégâts" — même état de module que la
    // sidebar (cf. _etatDegatsRapide/attaquesRapidesEnAttente) : les deux
    // zones restent synchronisées puisqu'un clic dans l'une re-rend l'autre.
    const etatDegC = _etatDegatsRapide(id, "contact");
    const etatDegD = _etatDegatsRapide(id, "distance");
    const etatDegM = _etatDegatsRapide(id, "magique");

    const pv = p.pvActuel || 0, pvMax = p.pvMax || 1;
    const pct = Math.max(0, Math.min(100, Math.round((pv / pvMax) * 100)));
    const etatC = Combat.etatCourant();
    const actifC = etatC.ordre[etatC.indexActuel];
    const cEstMonTour = !!(actifC && actifC.type === "pj" && actifC.id === id);
    // État Mourant(e)/Mort (0 PV, cf. REGLES_GENERALES "Mort et stabilisation") :
    // remplace la zone Attaques par le jet de mort (uniquement à son tour) tant
    // que le perso n'est ni stabilisé ni mort ; plus aucune action une fois mort.
    // Un personnage Mourant·e ou Mort ne peut RIEN faire d'autre que son jet
    // de mort — Relever un allié/Jets de carac/Sorts/Objets sont masqués tant
    // que peutAgir est faux (recevoir des dégâts reste possible, cf. plus bas).
    const estMourant = pv <= 0 && !p.etatMort;
    const estMort = !!p.etatMort;
    const peutAgir = !estMourant && !estMort;
    // Alliés à relever (Mourant·e OU Renversée) — n'importe quel autre PJ,
    // pas seulement ceux présents dans l'ordre d'initiative (cf. releverAllie).
    const alliesARelever = Object.keys(persos).filter((pid) => {
      if (pid === id) return false;
      const d = persos[pid];
      const dMourant = (d.pvActuel || 0) <= 0 && !d.etatMort;
      const dRenversee = (d.etatsActifs || []).some((e) => e.idEtat === "renversee");
      return dMourant || dRenversee;
    });

    const attTiles = [
      `<button class="dock-tuile" data-bm-attaque="contact" data-bonus="${attContact}"><span class="dock-ic">⚔️</span><span class="dock-lbl">Contact ${signe(attContact)}</span></button>`,
    ];
    if (attDistance !== null) attTiles.push(`<button class="dock-tuile" data-bm-attaque="distance" data-bonus="${attDistance}"><span class="dock-ic">🏹</span><span class="dock-lbl">Distance ${signe(attDistance)}</span></button>`);
    if (attMagique !== null) attTiles.push(`<button class="dock-tuile" data-bm-attaque="magique" data-bonus="${attMagique}"><span class="dock-ic">✨</span><span class="dock-lbl">Magique ${signe(attMagique)}</span></button>`);
    if (attLancer !== null) attTiles.push(`<button class="dock-tuile" data-bm-attaque="lancer" data-bonus="${attLancer}"><span class="dock-ic">🎯</span><span class="dock-lbl">Lancer ${signe(attLancer)}</span></button>`);
    if (dmgContact && etatDegC.visible) attTiles.push(`<button class="dock-tuile dock-tuile-dmg" data-bm-degats="${dmgContact}" data-bm-degats-type="contact" data-bm-critique="${etatDegC.critique ? "1" : "0"}" title="${echapper((armeContact ? armeContact.nom : "Poings (Voie des poings)") + (armeCourteSecondaire ? " + " + armeCourteSecondaire.nom : ""))}"><span class="dock-ic">🎲</span><span class="dock-lbl">${dmgContact}${etatDegC.critique ? " CRIT" : ""}</span></button>`);
    if (dmgDistance && etatDegD.visible) attTiles.push(`<button class="dock-tuile dock-tuile-dmg" data-bm-degats="${dmgDistance}" data-bm-degats-type="distance" data-bm-critique="${etatDegD.critique ? "1" : "0"}" data-bm-mult="${perso.aTirFatal() ? "3" : "2"}" title="${echapper(armeDistance.nom)}"><span class="dock-ic">🎲</span><span class="dock-lbl">${dmgDistance}${etatDegD.critique ? " CRIT" : ""}</span></button>`);
    if (dmgMagique && etatDegM.visible) attTiles.push(`<button class="dock-tuile dock-tuile-dmg" data-bm-degats="${dmgMagique}" data-bm-degats-type="magique" data-bm-critique="${etatDegM.critique ? "1" : "0"}"><span class="dock-ic">🎲</span><span class="dock-lbl">${dmgMagique}${etatDegM.critique ? " CRIT" : ""}</span></button>`);
    // Bascules Frappe puissante / Tir de précision : -2 attaque / +4 dégâts
    // tant qu'actives, visibles seulement si le don est acquis ET l'arme requise
    // équipée (cf. peutFrappePuissante/peutTirPrecision ci-dessus).
    if (peutFrappePuissante) attTiles.push(`<button class="dock-tuile" data-toggle-don="frappe_puissante" style="${actifFrappePuissante ? "outline:2px solid var(--or);" : ""}"><span class="dock-ic">💥</span><span class="dock-lbl">Frappe puissante ${actifFrappePuissante ? "ON" : "OFF"}</span></button>`);
    if (peutTirPrecision) attTiles.push(`<button class="dock-tuile" data-toggle-don="tir_precision" style="${actifTirPrecision ? "outline:2px solid var(--or);" : ""}"><span class="dock-ic">🎯</span><span class="dock-lbl">Tir de précision ${actifTirPrecision ? "ON" : "OFF"}</span></button>`);
    // Prêtre — Cercle de la Foi, sort "Arme bénie" : plus de bascule manuelle
    // ici (cf. actifArmeBenie ci-dessus, activé/désactivé par le sort
    // lui-même depuis le Grimoire) — rien à pousser dans attTiles.

    const sorts = _capacitesLancablesPerso(p);
    const sortTiles = sorts.map((s) => {
      const freq = Capacites.parserFrequence(s.mecanique.usage && s.mecanique.usage.frequence);
      let badge = "";
      if (freq) {
        const cle = Capacites.cleCapacite(s.source);
        const entree = (p.usagesCapacites || {})[cle];
        const n = entree && entree.periode === freq.periode ? entree.utilisations : 0;
        badge = `<span class="dock-usage">${n}/${freq.max}</span>`;
      }
      return `<button class="dock-tuile dock-sort" ${_attrsLancer(s.source)} title="${echapper(s.nom)}"><span class="dock-lbl-sort">${echapper(_courtNom(s.nom))}</span>${badge}</button>`;
    }).join("");

    const aChaos = typeof perso.aVoieChaosActive === "function" && perso.aVoieChaosActive();
    const reduction = perso.reductionDegats();
    // Actions du tour (compact, cf. htmlBlocActionsDuTour côté sidebar pour
    // la version détaillée avec Sprint/réinitialisation).
    const entreeActions = etatC.ordre.find((e) => e.type === "pj" && e.id === id);
    // Objets utilisables (potions/consommables de soin) — index conservé pour
    // utiliserConsommable(id, idx).
    const objets = (p.inventaireListe || []).map((it, i) => ({ it, i })).filter((x) => formuleSoinItem(x.it));
    const objetTiles = objets.map((x) => {
      const qte = x.it.quantite || 1;
      return `<button class="dock-tuile dock-objet" data-utiliser-idx="${x.i}" title="${echapper(x.it.nom)}"><span class="dock-ic">🧪</span><span class="dock-lbl">${echapper(_courtNom(x.it.nom))}</span><span class="dock-usage">×${qte}</span></button>`;
    }).join("");

    dock.innerHTML = `<div class="dock-combat${cEstMonTour ? " mon-tour" : ""}">
      <div class="dock-zone dock-identite">
        <div class="dock-avatar">${avatarHtml(p, 46)}</div>
        <div class="dock-id-txt">
          <div class="dock-nom">${echapper(p.nom)}${cEstMonTour ? ` <span class="dock-badge-tour">⚔️ À toi</span>` : ""}</div>
          <div class="dock-hp-ligne">
            <div class="barre-pv dock-hp"><div class="rempli" style="width:${pct}%;background:${_couleurPv(pct)};"></div></div>
            <span class="dock-hp-val">${pv}/${pvMax}</span>
          </div>
          <div class="dock-chips">
            <span class="dock-chip" title="Défense">🛡 ${_defPjAvecAura(perso, id)}</span>
            ${reduction > 0 ? `<span class="dock-chip" title="Réduction de dégâts (armure)">🪖 ${reduction}</span>` : ""}
            <span class="dock-chip" title="Initiative">⚡ ${signe(perso.calculerInitiative())}</span>
            ${(typeof SORTS_PAR_CLASSE !== "undefined" && SORTS_PAR_CLASSE[p.classe]) ? `<span class="dock-chip" title="Points de Pouvoir">✨ ${p.ppActuel != null ? p.ppActuel : perso.calculerPPMax()}/${perso.calculerPPMax()}</span>` : ""}
            ${aChaos ? `<span class="dock-chip chaos">${p.corruptionCombat || 0} CS</span>` : ""}
            ${entreeActions ? `
            <span class="dock-chip" title="Déplacement restant">🚶 ${entreeActions.deplacementRestant}</span>
            <span class="dock-chip" title="Action principale ${entreeActions.actionPrincipaleUtilisee ? "utilisée" : "disponible"}">${entreeActions.actionPrincipaleUtilisee ? "◼️" : "◻️"}A</span>
            <span class="dock-chip" title="Action secondaire ${entreeActions.actionSecondaireUtilisee ? "utilisée" : "disponible"}">${entreeActions.actionSecondaireUtilisee ? "◼️" : "◻️"}B</span>
            ` : ""}
          </div>
        </div>
      </div>
      ${estMort ? `<div class="dock-zone">
        <div class="dock-zone-titre">💀 Mort</div>
        <p class="aide" style="margin:0;">Plus aucune action possible.</p>
      </div>` : estMourant ? `<div class="dock-zone">
        <div class="dock-zone-titre">🩸 Mourant(e) — Succès ${p.mortSucces || 0}/3 · Échecs ${p.mortEchecs || 0}/3</div>
        ${cEstMonTour
          ? `<div class="dock-tuiles"><button class="dock-tuile" id="dock-btn-jet-mort"><span class="dock-ic">🎲</span><span class="dock-lbl">Jet de mort</span></button></div>`
          : `<p class="aide" style="margin:0;">Attends ton tour pour lancer ton jet de mort.</p>`}
      </div>` : `<div class="dock-zone">
        <div class="dock-zone-titre">Attaques</div>
        <div class="dock-tuiles">${attTiles.join("")}</div>
      </div>`}
      ${peutAgir && alliesARelever.length ? `<div class="dock-zone">
        <div class="dock-zone-titre">Relever un allié</div>
        <div class="dock-tuiles">
          <button class="dock-tuile" id="dock-btn-relever"${entreeActions && entreeActions.actionPrincipaleUtilisee ? " disabled" : ""}><span class="dock-ic">🤝</span><span class="dock-lbl">Relever un allié</span></button>
        </div>
        <div class="relever-allie-form" style="display:none;margin-top:6px;">
          <select class="relever-allie-select">${alliesARelever.map((pid) => `<option value="${pid}">${echapper(persos[pid].nom)}</option>`).join("")}</select>
          <button class="btn petit or btn-confirmer-relever">Relever</button>
        </div>
      </div>` : ""}
      ${peutAgir ? `<div class="dock-zone">
        <div class="dock-zone-titre">Jets de carac</div>
        <div class="dock-tuiles">${CARACS.map((cc) => `<button class="dock-tuile dock-stat" data-test="${cc.code}" title="Test de ${cc.code}"><span class="dock-stat-code">${cc.code}</span><span class="dock-lbl">${signe(mods[cc.code])}</span></button>`).join("")}</div>
      </div>` : ""}
      ${peutAgir && sorts.length ? `<div class="dock-zone">
        <div class="dock-zone-titre">Sorts &amp; capacités</div>
        <div class="dock-tuiles">${sortTiles}</div>
      </div>` : ""}
      ${peutAgir && objets.length ? `<div class="dock-zone">
        <div class="dock-zone-titre">Objets</div>
        <div class="dock-tuiles">${objetTiles}</div>
      </div>` : ""}
      <div class="dock-zone dock-degats">
        ${blocDegatsSubisHtml("dock-", perso, p)}
      </div>
      <div class="cible-capacite-form" style="display:none;">
        <select class="cible-capacite-select"></select>
        <label class="option-payer-cs" style="display:none;"><input type="checkbox" class="check-payer-cs" /> Payer en CS (Don corrompu)</label>
        <label class="option-supplement-cs" style="display:none;"><input type="checkbox" class="check-supplement-cs" /> Payer les points manquants en CS (Supplément corrompu)</label>
        <button class="btn petit or btn-confirmer-cible-capacite">Confirmer la cible</button>
        <button class="btn petit secondaire btn-annuler-cible-capacite">Annuler</button>
      </div>
      ${htmlDegatsCapaciteEnAttente(id)}
    </div>`;

    // Le dock n'a pas son propre sélecteur de portée/cible/objet à lancer
    // (contrairement à la sidebar, cf. porteeHtml dans
    // rendreFicheSidebarBattlemap) — réutilise tel quel
    // _typeAttaquePortee/_cibleDistanceId/_objetLanceIdx (état de module
    // partagé) : un joueur mobile pur (dock seul, pas de sidebar visible)
    // n'a donc pas de gating (touche reste null, bouton dégâts toujours
    // disponible ; pour Lancer, doit avoir ouvert la sidebar au moins une
    // fois pour choisir son objet), ce qui reste le compromis assumé
    // d'avant ce chantier plutôt qu'un blocage. Dupliquer le petit bloc
    // porteeHtml dans le dock demanderait de le factoriser en fonction
    // commune ; laissé pour un chantier ultérieur si Thomas le demande.
    dock.querySelectorAll("[data-bm-attaque]").forEach((el) => {
      el.onclick = () => {
        const type = el.dataset.bmAttaque;
        const bonus = parseInt(el.dataset.bonus, 10);
        const cibleId = (_typeAttaquePortee === type) ? _cibleDistanceId : null;
        // "tournoyante" (francisque, cf. lot "malgré la limite") : cf. même
        // consommation d'usage que rendreFicheSidebarBattlemap.
        if (type === "distance" && armeDistanceEstJetContact) {
          const persosFrais = chargerPersos();
          const pFrais = persosFrais[id];
          const dispoFrais = pFrais && _itemLancerArmeDisponible(pFrais);
          // .usage.appliquer absent sans usage.frequence sur le déclencheur
          // (cf. "tournoyante" légendaire, illimité) — _verifierUsageDeclencheur
          // renvoie alors {ok:true} nu, rien à consommer.
          if (dispoFrais) { if (dispoFrais.usage.appliquer) dispoFrais.usage.appliquer(); sauverPersos(persosFrais); }
        }
        // bonusAttaqueConditionnel (affixe "precise", cf. Affixes phase 2 §B) :
        // lu ici, avant le jet — un effet de déclencheur arriverait trop tard.
        const bonusEffectif = bonus + _bonusAttaqueConditionnelEquipement(perso, type, cibleId);
        const resolution = _resoudreAttaqueRapide(`Attaque ${type}`, bonusEffectif, perso.critMinAttaque(type), cibleId, { persoId: perso.id, caracCode: _caracPourTypeAttaque(type, perso) });
        // cibleId conservé ici (pas seulement dans la résolution du jet) :
        // sert au bouton "Dégâts" pour appliquer automatiquement le résultat
        // sur la BONNE cible au moment du clic (cf. _appliquerDegatsCibleRapide),
        // même si _cibleDistanceId a changé entre-temps (le joueur a reciblé
        // avant de cliquer sur Dégâts).
        attaquesRapidesEnAttente[type] = Object.assign({ persoId: id, cibleId }, resolution);
        const resultatMsg = cibleId
          ? (resolution.echecCritique ? "1 naturel — échec critique automatique."
            : resolution.critique ? `CRITIQUE !${resolution.defCible !== null ? ` (DEF cible ${resolution.defCible})` : ""}`
            : resolution.defCible === null ? "DEF de la cible inconnue — à comparer manuellement."
            : (resolution.touche ? `Touché ! (DEF ${resolution.defCible})` : `Raté (DEF ${resolution.defCible}).`))
          : "";
        if (type === "lancer") {
          _resoudreConsommationLancer(id, cibleId, resolution, resultatMsg);
        } else if (resultatMsg) {
          toast(resultatMsg);
        }
        _gererPremierSangChasseur(id, type, resolution.touche);
        _gererDeclencheursEquipement(id, type, resolution, cibleId);
        if (typeof Combat !== "undefined" && Combat.utiliserActionPrincipale) Combat.utiliserActionPrincipale(id);
        rendreFicheSidebarBattlemap(id);
      };
    });
    // cf. sidebar.querySelectorAll("[data-bm-degats]") plus haut : même
    // application automatique des dégâts sur la cible verrouillée/touchée.
    dock.querySelectorAll("[data-bm-degats]").forEach((el) => {
      el.onclick = () => {
        const estCrit = el.dataset.bmCritique === "1";
        const total = lancerFormule(el.dataset.bmDegats, `${p.nom} — Dégâts (${el.dataset.bmDegats})`, estCrit ? parseInt(el.dataset.bmMult || "2", 10) : false);
        const type = el.dataset.bmDegatsType;
        const attente = type && attaquesRapidesEnAttente[type];
        if (attente && attente.persoId === id && attente.touche === true && attente.cibleId) {
          _appliquerDegatsCibleRapide(attente.cibleId, total, attente.ignoreReduction, false, id);
        }
      };
    });
    dock.querySelectorAll("[data-toggle-don]").forEach((el) => {
      el.onclick = () => {
        const cle = el.dataset.toggleDon;
        togglesDons[cle] = !togglesDons[cle];
        rendreDockCombat();
        rendreFicheSidebarBattlemap(id);
      };
    });
    const btnJetMort = dock.querySelector("#dock-btn-jet-mort");
    if (btnJetMort) btnJetMort.onclick = () => jetDeMort(id);
    const btnRelever = dock.querySelector("#dock-btn-relever");
    if (btnRelever) btnRelever.onclick = () => {
      const form = dock.querySelector(".relever-allie-form");
      if (form) form.style.display = form.style.display === "none" ? "block" : "none";
    };
    const btnConfirmerRelever = dock.querySelector(".btn-confirmer-relever");
    if (btnConfirmerRelever) btnConfirmerRelever.onclick = () => {
      const destId = dock.querySelector(".relever-allie-select").value;
      releverAllie(id, destId);
    };
    // Jets de caractéristique (d20 + mod) — sans quitter la battlemap
    // (l'overlay de jet est visible sur tous les onglets, cf. #overlay-jet).
    // Avantage automatique (cf. même logique dans afficherFiche, chantier
    // groupe 7 initialement oublié ici — le dock a son propre wiring
    // dupliqué du [data-test] de la fiche complète) : Endurance de fer/
    // résistance mentale. Les cases "avantage 1x/jour" (INT héroïque/Double
    // Héritage) restent réservées à la fiche complète, pas dupliquées ici.
    dock.querySelectorAll("[data-test]").forEach((el) => {
      el.onclick = () => {
        const code = el.dataset.test;
        const modeForce = (code === "CON" && perso.aEnduranceDeFer()) || (code === "SAG" && perso.aAvantageResistanceMentale())
          ? "avantage" : null;
        const bonusAmes = code === "INT" ? perso.bonusSavoirVole() : 0;
        lancerTest(`Test de ${code}`, mods[code] + bonusAmes, null, modeForce, { persoId: perso.id, caracCode: code });
      };
    });
    // Objets : boire/utiliser un consommable de soin sur soi (réutilise
    // utiliserConsommable, qui marque aussi l'action secondaire consommée),
    // puis re-render de la sidebar (PV + quantité + action secondaire mis à
    // jour) — rendreFicheSidebarBattlemap réappelle rendreDockCombat().
    dock.querySelectorAll("[data-utiliser-idx]").forEach((el) => {
      el.onclick = () => { utiliserConsommable(id, parseInt(el.dataset.utiliserIdx, 10)); rendreFicheSidebarBattlemap(id); };
    });
    wireDegatsSubis(id, "dock-");
    wireCapacitesEtEtats(dock, id, p, rendreDockCombat);
    dock.classList.add("visible");
  }

  /* ---------- Navigation onglets ---------- */

  function allerVers(panneau) {
    // Ferme la bulle "fiche rapide" d'un token (cf. Carte.onClose) quand on
    // QUITTE l'onglet Carte pour un autre — capturé avant le bascule de
    // classes ci-dessous, sinon on ne peut plus savoir d'où on vient. Sans
    // ça, la bulle (position:fixed sur document.body) restait affichée
    // par-dessus n'importe quel autre onglet (ex. Dés) — bug rencontré.
    const panneauPrecedent = document.querySelector(".panneau.actif");
    if (panneauPrecedent && panneauPrecedent.id === "panneau-carte" && panneau !== "carte" && typeof Carte !== "undefined" && Carte.onClose) {
      Carte.onClose();
    }
    document.querySelectorAll("nav.tabs button").forEach((b) => {
      b.classList.toggle("actif", b.dataset.panneau === panneau);
    });
    document.querySelectorAll(".panneau").forEach((p) => {
      p.classList.toggle("actif", p.id === "panneau-" + panneau);
    });
    if (panneau === "fiche") { rendreListePersos(); _mettreAJourLootFiche(); }
    if (panneau === "livret") rendrePanneauLivret();
    if (panneau === "party") rendrePartyPanneau();
    if (panneau === "mutations") rendrePanneauMutations();
    if (panneau === "messages") { rendreMessages(); _majBadgeMessages(); }
    if (panneau === "loot" && typeof Loot !== "undefined") Loot.rendreCatalogue();
    if (panneau === "marche" && typeof Marche !== "undefined") Marche.rendrePanneauMarche();
    if (panneau === "reputation" && typeof Reputation !== "undefined") Reputation.rendrePanneauReputation();
    if (panneau === "atelier") rendrePanneauAtelier();
    if (panneau === "regles") rendreRegles();
    if (panneau === "bestiaire") rendreBestiaire();
    if (panneau === "table-combat") { rendreOrdreInitiative(); rendreTableCombat(); }
    if (panneau === "carte" && typeof Carte !== "undefined") {
      Carte.onOpen();
      if (role === "joueur") rendreSelecteurMonPerso();
      if (role === "mj") {
        rendreTableCombat("battlemap-zone-table-combat");
        rendreOrdreInitiative("battlemap-zone-ordre-initiative");
      }
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
      capacitesRaceChoix: {}, // { [rang]: valeurChoisie } — choix fixé à l'acquisition d'un rang racial (cf. RACE_CAPACITES_A_CHOIX)
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
      // Rappel du choix permanent fait à l'acquisition (cf. RACE_CAPACITES_A_CHOIX)
      const choixValeur = creation.capacitesRaceChoix && creation.capacitesRaceChoix[rg.rang];
      const choixLabel = choixValeur ? _labelChoixCapaciteRace(rg.rang, choixValeur) : null;

      html +=
        `<div class="rang ${choisi ? "choisi" : ""} ${verrou ? "verrou" : ""}">` +
        `<div class="num">${rg.rang}</div>` +
        `<div class="contenu">` +
        (nom ? `<div class="nom-cap">${nom}</div>` : "") +
        `<div class="effet">${effet}${choixLabel ? ` — <strong>Choix : ${choixLabel}</strong>` : ""}</div></div>` +
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
      if (creation.capacitesRaceChoix) delete creation.capacitesRaceChoix[rang];
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
      // Certains rangs raciaux fixent un choix permanent de caractéristique
      // à l'acquisition (ex. Humain "Ambition") — même principe que
      // CAPACITES_A_CHOIX côté classe, cf. RACE_CAPACITES_A_CHOIX.
      const choixDef = RACE_CAPACITES_A_CHOIX[creation.race + "|" + rang];
      if (choixDef) {
        rendreVoieRaciale(); // remet la case dans son état réel en attendant le choix
        ouvrirModalChoixCapacite(choixDef, (valeurChoisie) => {
          if (!creation.capacitesRaceChoix) creation.capacitesRaceChoix = {};
          creation.capacitesRaceChoix[rang] = valeurChoisie;
          creation.capacitesRace.push(rang);
          rendreVoieRaciale();
          if (creation.classe) rendreVoies();
          recalculerDerives();
        });
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

  // Lit un fichier image, le redimensionne (côté le plus long ≤ max) et renvoie
  // un data URL JPEG compressé via cb(dataUrl). Les images de livre vivent dans
  // la fiche du perso (Firestore, limite 1 Mo/document), d'où la compression
  // pour rester léger même avec plusieurs livres illustrés.
  function lireImageRedimensionnee(file, max, qualite, cb) {
    if (!file || !file.type.startsWith("image/")) { toast("Choisis un fichier image."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
        else if (h > max) { w = Math.round((w * max) / h); h = max; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL("image/jpeg", qualite));
      };
      img.onerror = () => toast("Image illisible.");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
    // Délègue à Personnage.pvNiveau1() au lieu de dupliquer la formule (dé de
    // vie + Mod.CON + 2, cf. équilibrage) — évite un écart silencieux si la
    // règle change côté Personnage sans être répercutée ici.
    return new Personnage(creation).pvNiveau1();
  }
  // Guerrier — Voie de l'élite, rang 2 "Endurance de fer" (passive) : +1 PV/niveau.
  // Don Robuste : +2 PV par niveau, rétroactif (cf. Personnage.bonusPvDons).
  function bonusPvVoies() {
    const perso = new Personnage(creation);
    return perso.bonusPvCapacites() + perso.bonusPvDons();
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
    "guerrier|Voie de l'élite|1": {
      titre: "Spécimen d'élite",
      consigne: "Choisis la caractéristique physique qui gagne +1 permanent :",
      options: [
        { valeur: "FOR", label: "+1 FORCE" },
        { valeur: "DEX", label: "+1 DEXTÉRITÉ" },
        { valeur: "CON", label: "+1 CONSTITUTION" },
      ],
    },
    // Corrige un bug : cette entrée était keyée "druide" (copié-collé), alors
    // que le vrai rang 4 de la Voie du chaos du Druide est "Fléau rampant"
    // (sans choix) — c'est le Nécromancien qui a réellement "Symbiose du
    // chaos" à ce rang. cf. Personnage.bonusReductionCapacites/
    // bonusDegatsSortsChaos côté js/personnage.js pour le correctif complet.
    "necromancien|Voie du chaos|4": {
      titre: "Symbiose du chaos",
      consigne: "Choisis l'effet permanent (contrepartie : détecté comme corrompu) :",
      options: [
        { valeur: "reduction", label: "+2 réduction de dégâts" },
        { valeur: "degats", label: "+1d6 DM à tous les sorts" },
      ],
    },
    "magicien|Voie du chaos|4": {
      titre: "Esprit fissuré",
      consigne: "Choisis l'effet permanent (contrepartie : détecté comme instable par les cercles savants) :",
      options: [
        { valeur: "degats", label: "+1d6 DM à tous les sorts" },
        { valeur: "reduction", label: "+2 résistance aux dégâts" },
      ],
    },
  };

  // Rangs de voie RACIALE dont l'acquisition fixe un choix permanent de
  // caractéristique (clé "race|rang") — même principe que CAPACITES_A_CHOIX,
  // mais le choix est mémorisé à part (creation.capacitesRaceChoix[rang],
  // cf. basculerCapaciteRace) car this.capacitesRace est un simple tableau de
  // numéros de rang, sans objet {rang, choix} par entrée comme les voies de
  // classe. Exploité par Personnage.choixCapaciteRace/bonusCaracCapacites.
  const RACE_CAPACITES_A_CHOIX = {
    "humain|4": {
      titre: "Ambition",
      consigne: "Choisis la caractéristique qui gagne +2 permanent (définitif) :",
      options: CARACS.map((c) => ({ valeur: c.code, label: `+2 ${c.nom.toUpperCase()}` })),
    },
    "demi_elfe|2": {
      titre: "Sang Mêlé",
      consigne: "Choisis la caractéristique qui gagne +1 permanent (définitif) :",
      options: [
        { valeur: "DEX", label: "+1 DEXTÉRITÉ" },
        { valeur: "CHA", label: "+1 CHARISME" },
      ],
    },
    "demi_orc|2": {
      titre: "Sang de Guerre",
      consigne: "Choisis la caractéristique qui gagne +1 permanent (définitif) :",
      options: [
        { valeur: "FOR", label: "+1 FORCE" },
        { valeur: "CON", label: "+1 CONSTITUTION" },
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

  // Sélecteur de Don (niveaux 4/8/12, cf. data/dons.js) : un seul choix, jamais
  // de doublon avec un don déjà acquis (donsDejaPris = tableau d'ids).
  function ouvrirModalChoixDon(donsDejaPris, onChoisi) {
    const modal = document.getElementById("modal-choix-don");
    const zone = document.getElementById("modal-choix-don-options");
    if (!modal || !zone || typeof DONS === "undefined") return;
    const disponibles = DONS.filter((d) => !(donsDejaPris || []).includes(d.id));
    zone.innerHTML = "";
    disponibles.forEach((don) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn or";
      btn.style.textAlign = "left";
      btn.innerHTML = `<strong>${don.nom}</strong><br><span style="font-weight:400;font-size:0.8rem;">${don.effet}</span>`;
      btn.onclick = () => { fermerModalChoixDon(); onChoisi(don.id); };
      zone.appendChild(btn);
    });
    modal.style.display = "flex";
  }

  function fermerModalChoixDon() {
    const modal = document.getElementById("modal-choix-don");
    if (modal) modal.style.display = "none";
  }

  // Plafond d'une caractéristique pour le don Amélioration de caractéristique :
  // 20 si affinité raciale (cf. data/dons.js), 18 sinon.
  const AFFINITES_RACE_CARAC = { elfe: ["INT", "DEX"], nain: ["CON", "FOR"], demi_orc: ["CON", "FOR"], demi_gobelin: ["DEX", "INT"] };
  function plafondCaracDon(code, race) {
    return (AFFINITES_RACE_CARAC[race] || []).includes(code) ? 20 : 18;
  }

  // Deux prompts séquentiels (réutilise le modal de choix de capacité, un
  // seul choix par appel) pour le don Amélioration de caractéristique —
  // exclut du 2e choix la carac déjà prise, et toute carac déjà au plafond.
  function ouvrirChoixAmeliorationCarac(cible, onDone) {
    const options1 = CARACS.filter((c) => (cible.caracs[c.code] || 10) < plafondCaracDon(c.code, cible.race));
    if (!options1.length) { toast("Toutes les caractéristiques sont déjà au plafond."); onDone([]); return; }
    ouvrirModalChoixCapacite({
      titre: "Amélioration de caractéristique",
      consigne: "Choisis la 1ère caractéristique (+1) :",
      options: options1.map((c) => ({ label: `${c.nom} (${c.code}) — actuellement ${cible.caracs[c.code] || 10}`, valeur: c.code })),
    }, (code1) => {
      const options2 = CARACS.filter((c) => c.code !== code1 && (cible.caracs[c.code] || 10) < plafondCaracDon(c.code, cible.race));
      if (!options2.length) { onDone([code1]); return; }
      ouvrirModalChoixCapacite({
        titre: "Amélioration de caractéristique",
        consigne: "Choisis la 2e caractéristique (+1) :",
        options: options2.map((c) => ({ label: `${c.nom} (${c.code}) — actuellement ${cible.caracs[c.code] || 10}`, valeur: c.code })),
      }, (code2) => onDone([code1, code2]));
    });
  }

  // Un seul prompt (réutilise le modal de choix de capacité) pour le don
  // Athlète — +1 FOR OU DEX au choix, jamais les deux. Le don ne précise pas
  // de plafond propre : réutilise plafondCaracDon par cohérence avec
  // Amélioration de caractéristique.
  function ouvrirChoixAthlete(cible, onDone) {
    const options = ["FOR", "DEX"]
      .map((code) => CARACS.find((c) => c.code === code))
      .filter((c) => c && (cible.caracs[c.code] || 10) < plafondCaracDon(c.code, cible.race));
    if (!options.length) { toast("FOR et DEX sont déjà au plafond."); onDone(null); return; }
    ouvrirModalChoixCapacite({
      titre: "Athlète",
      consigne: "Choisis la caractéristique (+1) :",
      options: options.map((c) => ({ label: `${c.nom} (${c.code}) — actuellement ${cible.caracs[c.code] || 10}`, valeur: c.code })),
    }, (code) => onDone(code));
  }

  // Finalise l'acquisition d'un don sur `cible` (creation, ou perso persisté
  // côté Fiche) : l'ajoute à cible.dons, résout le choix supplémentaire des
  // dons Amélioration de caractéristique / Athlète s'il y a lieu
  // (cible.donsChoix), puis appelle onTermine() — au caller de gérer PV/
  // persistance/re-rendu ensuite (ex. Robuste modifie pvMax, cf.
  // monterDeNiveau et le bouton de rattrapage).
  function finaliserChoixDon(idDon, cible, msgSuffix, onTermine) {
    if (!cible.dons) cible.dons = [];
    cible.dons.push(idDon);
    const don = (typeof DONS !== "undefined") && DONS.find((d) => d.id === idDon);
    if (idDon === "amelioration_carac") {
      if (!cible.donsChoix) cible.donsChoix = {};
      ouvrirChoixAmeliorationCarac(cible, (choix) => {
        cible.donsChoix.amelioration_carac = choix;
        toast(`Don choisi : ${don ? don.nom : idDon}${choix.length ? ` (+1 ${choix.join(", +1 ")})` : ""}.${msgSuffix}`);
        onTermine();
      });
      return;
    }
    if (idDon === "athlete") {
      if (!cible.donsChoix) cible.donsChoix = {};
      ouvrirChoixAthlete(cible, (choix) => {
        cible.donsChoix.athlete = choix;
        toast(`Don choisi : ${don ? don.nom : idDon}${choix ? ` (+1 ${choix})` : ""}.${msgSuffix}`);
        onTermine();
      });
      return;
    }
    toast(`Don choisi : ${don ? don.nom : idDon}.${msgSuffix}`);
    onTermine();
  }

  // Libellé lisible du choix mémorisé sur une capacité (ex. "+2 DEF permanent"),
  // pour le rappeler sur la fiche de création une fois le choix fait.
  function _labelChoixCapacite(voieNom, rang, valeur) {
    const cfg = CAPACITES_A_CHOIX[creation.classe + "|" + voieNom + "|" + rang];
    const opt = cfg && cfg.options.find((o) => o.valeur === valeur);
    return opt ? opt.label : valeur;
  }
  // Équivalent pour un rang de voie RACIALE (cf. RACE_CAPACITES_A_CHOIX).
  function _labelChoixCapaciteRace(rang, valeur) {
    const cfg = RACE_CAPACITES_A_CHOIX[creation.race + "|" + rang];
    const opt = cfg && cfg.options.find((o) => o.valeur === valeur);
    return opt ? opt.label : valeur;
  }

  // Coût d'ouverture d'une voie hors profil : 2 points (même famille de caractéristique), 4 points (famille différente)
  // Don Initié aux arcanes (simplifié par Thomas par rapport au texte
  // d'origine "rang 1 seul, n'importe quelle classe" : débloque gratuitement
  // UNE voie liée à l'intelligence) — restreint aux classes utilisant l'INT
  // pour leur magie (CARAC_MAGIE : magicien, necromancien), coût 0 pour le
  // PREMIER déblocage hors profil éligible, normal ensuite. Pas de champ
  // dédié pour marquer "jeton déjà consommé" : un déblocage à cout 0 déjà
  // présent dans voiesHorsProfil suffit à le savoir.
  function coutDeblocageHorsProfil(classeCible) {
    const familleActuelle = FAMILLE_CLASSE[creation.classe];
    const familleCible = FAMILLE_CLASSE[classeCible];
    const coutNormal = familleActuelle && familleActuelle === familleCible ? 2 : 4;
    const eligibleInitieArcanes = (creation.dons || []).includes("initie_arcanes") && CARAC_MAGIE[classeCible] === "INT";
    const dejaUtilise = (creation.voiesHorsProfil || []).some((hp) => hp.cout === 0);
    return eligibleInitieArcanes && !dejaUtilise ? 0 : coutNormal;
  }

  function rendreVoiesHorsProfil() {
    const aide = document.getElementById("aide-horsprofil");
    const zone = document.getElementById("zone-voies-horsprofil");
    if (!zone) return;

    if (aide) {
      aide.innerHTML =
        `<strong>Voies hors profil :</strong> débloque une voie d'une autre classe en payant son coût d'ouverture ` +
        `(2 points si même famille de caractéristique, 4 points sinon), puis achète ses rangs normalement. ` +
        `Le don Initié aux arcanes débloque gratuitement la première voie liée à l'intelligence (Magicien, Nécromancien).`;
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
            `data-classe="${codeClasse}" data-voie="${encodeURIComponent(voie.nom)}">${cout === 0 ? "Débloquer (gratuit — Initié aux arcanes)" : `Débloquer (coût ${cout} pt${cout > 1 ? "s" : ""})`}</button>`;
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
    toast(cout === 0 ? `Voie "${voieNom}" débloquée gratuitement (Initié aux arcanes).` : `Voie "${voieNom}" débloquée (${cout} pts).`);
    rendreVoies();
    recalculerDerives();
  }

  // Calcule PV / DEF suggérés (modifiables ensuite)
  function recalculerDerives() {
    const champDef = document.getElementById("champ-def");
    // On ne réécrase que si l'utilisateur n'a pas saisi manuellement
    if (!champDef.dataset.touche) champDef.value = new Personnage(creation).calculerCA();
    appliquerPvAuto();
    // Le récap DEF affiché dans le bloc équipement (perso.calculerCA()) doit
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

  /* ---------- Onglet "🎭 Party" : cartes de tous les personnages de la table ---------- */

  // Libellé de race (+ variante/nation elfique) d'un perso.
  function _labelRaceParty(p) {
    const race = p.race ? RACES[p.race] : null;
    let label = race ? race.nom_affiche : (p.race || "—");
    if (race && p.raceVariante && race.variantes) {
      const v = race.variantes.find((vv) => vv.code === p.raceVariante);
      if (v) label += ` (${v.nom_affiche})`;
    }
    return label;
  }

  // Carte "party" d'un personnage : image (illustration ou avatar), classe
  // (teinte de classe), race, genre, ville/nation d'origine, lore. Le
  // propriétaire (ou le MJ) peut compléter ville/nation/lore.
  function _htmlCartePartyPerso(p, id) {
    const c = CLASSES[p.classe];
    const couleur = couleurClasse(p.classe);
    const genre = p.genre === "femme" ? "Femme" : "Homme";
    const editable = estProprietaire(p);
    // Image de la carte : l'illustration en priorité, sinon le portrait uploadé
    // à la création — les deux sont de vraies images du perso, affichées en
    // grand. On ne retombe sur l'icône (avatar/token/emblème) que si le joueur
    // n'a AUCUNE image.
    const imageCarte = p.illustration || p.portrait;
    const illus = imageCarte
      ? `<img class="party-illus" src="${imageCarte}" alt="illustration de ${echapper(p.nom)}" />`
      : `<div class="party-illus-vide">${avatarHtml(p, 120)}</div>`;
    const perso = Personnage.depuisJSON(p);
    const vitalsHtml = `<div class="party-vitals">
      <span title="Niveau">Niv ${p.niveau || 1}</span>
      <span title="Points de vie">❤ ${p.pvActuel != null ? p.pvActuel : (p.pvMax || 0)}/${p.pvMax || 0}</span>
      <span title="Défense">🛡 ${perso.calculerCA()}</span>
    </div>`;
    const statsHtml = `<div class="party-stats">${CARACS.map((cc) =>
      `<div class="party-stat"><span class="party-stat-code">${cc.code}</span><b>${((p.caracs && p.caracs[cc.code] != null) ? p.caracs[cc.code] : 10) + perso.bonusCaracCapacites(cc.code) + perso.bonusCaracDons(cc.code) + perso.bonusCaracEquipement(cc.code) + perso.bonusCaracMutations(cc.code)}</b><span class="party-stat-mod">${signe(perso.mod(cc.code))}</span></div>`).join("")}</div>`;
    return `<div class="party-carte" style="border-top:4px solid ${couleur};">
      <div class="party-illus-wrap">${illus}</div>
      <div class="party-corps">
        <div class="party-nom">${echapper(p.nom)}</div>
        <div class="party-tags">
          <span class="party-tag" style="background:${couleur};">${c ? echapper(c.nom_affiche) : echapper(p.classe || "")}</span>
          <span class="party-tag-sec">${echapper(_labelRaceParty(p))}</span>
          <span class="party-tag-sec">${genre}</span>
        </div>
        ${vitalsHtml}
        ${statsHtml}
        <div class="party-origine">
          <div><span class="party-lbl">📍 Ville</span> ${p.villeOrigine ? echapper(p.villeOrigine) : "<em>—</em>"}</div>
          <div><span class="party-lbl">🏴 Nation</span> ${p.nationOrigine ? echapper(p.nationOrigine) : "<em>—</em>"}</div>
          <div><span class="party-lbl">🎂 Âge</span> ${p.age ? echapper(String(p.age)) : "<em>—</em>"}</div>
          <div><span class="party-lbl">🎨 Loisirs</span> ${p.hobbies ? echapper(p.hobbies) : "<em>—</em>"}</div>
        </div>
        ${p.bio ? `<div class="party-lore">${echapper(p.bio)}</div>` : ""}
        ${editable ? `<button class="btn petit secondaire party-editer" data-party-id="${id}">✎ Compléter</button>
        <div class="party-form" id="party-form-${id}" style="display:none;">
          <input type="text" id="party-ville-${id}" placeholder="Ville d'origine" maxlength="60" value="${echapper(p.villeOrigine || "")}" />
          <input type="text" id="party-nation-${id}" placeholder="Nation d'origine" maxlength="60" value="${echapper(p.nationOrigine || "")}" />
          <input type="text" id="party-age-${id}" placeholder="Âge" maxlength="20" value="${echapper(p.age != null ? String(p.age) : "")}" />
          <input type="text" id="party-hobbies-${id}" placeholder="Loisirs / hobbies" maxlength="120" value="${echapper(p.hobbies || "")}" />
          <textarea id="party-bio-${id}" placeholder="Lore / bio courte de ton personnage" rows="3">${echapper(p.bio || "")}</textarea>
          <button class="btn petit or" data-party-save="${id}">Enregistrer</button>
        </div>` : ""}
      </div>
    </div>`;
  }

  function rendrePartyPanneau() {
    if (typeof Repos !== "undefined") Repos.rendreZoneRepos();
    const zone = document.getElementById("zone-party");
    if (!zone) return;
    const persos = chargerPersos();
    const ids = Object.keys(persos).filter((id) => persos[id] && persos[id].classe);
    if (!ids.length) {
      zone.innerHTML = `<div class="carte"><p class="vide">Aucun personnage dans la compagnie pour l'instant.</p></div>`;
      return;
    }
    zone.innerHTML = `<div class="party-grille">${ids.map((id) => _htmlCartePartyPerso(persos[id], id)).join("")}</div>`;
    zone.querySelectorAll(".party-editer").forEach((b) => {
      b.onclick = () => {
        const f = document.getElementById("party-form-" + b.dataset.partyId);
        if (f) f.style.display = f.style.display === "none" ? "flex" : "none";
      };
    });
    zone.querySelectorAll("[data-party-save]").forEach((b) => {
      b.onclick = () => {
        const pid = b.dataset.partySave;
        const pers = chargerPersos();
        const pp = pers[pid];
        if (!pp) return;
        pp.villeOrigine = (document.getElementById("party-ville-" + pid).value || "").trim();
        pp.nationOrigine = (document.getElementById("party-nation-" + pid).value || "").trim();
        pp.age = (document.getElementById("party-age-" + pid).value || "").trim();
        pp.hobbies = (document.getElementById("party-hobbies-" + pid).value || "").trim();
        pp.bio = (document.getElementById("party-bio-" + pid).value || "").trim();
        sauverPersos(pers);
        toast("Infos enregistrées ✔");
        rendrePartyPanneau();
      };
    });
  }

  // Onglet "📖 Livret" : sélecteur de personnage (même filtre estProprietaire
  // que "Ma fiche" — un joueur ne voit que les siens, le MJ voit tout le
  // monde) + étagère de livres (cf. _rendreEtagere) du personnage choisi.
  function rendrePanneauLivret() {
    const sel = document.getElementById("select-livret-perso");
    const zone = document.getElementById("zone-livret");
    if (!sel || !zone) return;
    const persos = chargerPersos();
    const ids = Object.keys(persos).filter((id) => estProprietaire(persos[id]));
    if (!ids.length) {
      sel.innerHTML = `<option value="">Aucun personnage</option>`;
      zone.innerHTML = `<div class="carte"><p class="vide">Aucun personnage. Crée-en un dans l'onglet « Création ».</p></div>`;
      return;
    }
    sel.innerHTML = ids.map((id) => `<option value="${id}">${echapper(persos[id].nom)}</option>`).join("");
    const avant = livretPersoId;
    livretPersoId = ids.includes(livretPersoId) ? livretPersoId : (ids.includes(ficheActiveId) ? ficheActiveId : ids[0]);
    if (livretPersoId !== avant) { livreOuvertId = null; livreOuvertPersoId = null; } // changer de perso referme le livre ouvert
    sel.value = livretPersoId;
    sel.onchange = () => { livretPersoId = sel.value; livreOuvertId = null; livreOuvertPersoId = null; _rendreZoneLivret(); };
    _rendreZoneLivret();
  }

  // Aiguille entre la vue "étagère" (liste des livres) et la vue "livre ouvert".
  // Le livre ouvert peut appartenir au perso sélectionné (le mien) OU à un autre
  // perso (livre partagé avec moi) — d'où la résolution par livreOuvertPersoId.
  function _rendreZoneLivret() {
    const zone = document.getElementById("zone-livret");
    if (!zone) return;
    const persos = chargerPersos();
    if (livreOuvertId) {
      const pOuvert = persos[livreOuvertPersoId] || persos[livretPersoId];
      const l = pOuvert && livresDe(pOuvert).find((x) => x.id === livreOuvertId);
      if (pOuvert && l) { _rendreLivreOuvert(pOuvert, l, persos); return; }
      livreOuvertId = null; livreOuvertPersoId = null; // introuvable → retour étagère
    }
    const p = persos[livretPersoId];
    if (!p) return;
    _rendreEtagere(p, livresDe(p), persos);
  }

  // Un joueur peut éditer les livres de SES persos (jamais le MJ, jamais les
  // livres partagés par un autre joueur, qui restent en lecture seule).
  function _peutEditerLivre(p) {
    return role !== "mj" && estProprietaire(p);
  }

  // Un livre (d'un autre perso) m'est-il partagé ? "table" = tout le monde ;
  // "joueurs" = mon prénom figure dans la liste des destinataires.
  function _livrePartageAvecMoi(l) {
    if (!l) return false;
    if (l.partage === "table") return true;
    if (l.partage === "joueurs" && Array.isArray(l.partageAvec)) {
      return l.partageAvec.some((n) => memeNom(n, joueurNom));
    }
    return false;
  }

  // Collecte les livres que d'AUTRES joueurs ont partagés avec moi (parcourt
  // tous les persos que je ne possède pas). Vide pour le MJ, qui voit déjà tout
  // via le sélecteur de personnage.
  function _livresPartagesAvecMoi(persos) {
    if (role === "mj") return [];
    const res = [];
    Object.keys(persos).forEach((pid) => {
      const p = persos[pid];
      if (estProprietaire(p)) return; // mes persos : déjà dans mon étagère
      livresDe(p).forEach((l) => { if (_livrePartageAvecMoi(l)) res.push({ persoId: pid, perso: p, livre: l }); });
    });
    return res;
  }

  // Liste dédupliquée des prénoms des AUTRES joueurs de la table (destinataires
  // possibles d'un partage). Source principale : le registre partagé des joueurs
  // (cof_joueurs, cf. enregistrerJoueurCourant) ; on y fusionne les
  // proprietaireNom des persos pour n'oublier aucun joueur (anciens, ou pas
  // encore ré-inscrits). Mon prénom et le générique "Joueur" sont exclus.
  function _rosterJoueurs(persos) {
    const noms = [];
    const ajouter = (nom) => {
      if (!nom || memeNom(nom, joueurNom)) return;               // pas de nom, ou moi
      if (String(nom).trim().toLowerCase() === "joueur") return; // nom générique
      if (!noms.some((n) => memeNom(n, nom))) noms.push(nom);
    };
    if (typeof window.DepotJoueurs !== "undefined") {
      window.DepotJoueurs.liste().forEach((j) => ajouter(j && j.nom));
    }
    Object.keys(persos || {}).forEach((pid) => ajouter(persos[pid].proprietaireNom));
    return noms;
  }

  /* ============================================================
     MUTATIONS DE LA CORRUPTION D'ÂME (homebrew, cf. data/mutations.js) —
     même schéma de sélecteur que l'onglet "📖 Livret" (rendrePanneauLivret) :
     un seul sélecteur de personnage filtré par estProprietaire, partagé par
     joueur et MJ (le joueur n'y voit que les siens). Les mutations elles-
     mêmes vivent sur le perso (p.mutations, cf. Personnage.versJSON), pas
     dans un document SyncStore à part — comme corruptionMajeure, dont elles
     découlent directement.
     ============================================================ */

  function _genMutationId() { return "mut" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function rendrePanneauMutations() {
    const sel = document.getElementById("select-mutation-perso");
    const zone = document.getElementById("zone-mutations");
    if (!sel || !zone) return;
    const persos = chargerPersos();
    const ids = Object.keys(persos).filter((id) => estProprietaire(persos[id]));
    if (!ids.length) {
      sel.innerHTML = `<option value="">Aucun personnage</option>`;
      zone.innerHTML = `<div class="carte"><p class="vide">Aucun personnage. Crée-en un dans l'onglet « Création ».</p></div>`;
      return;
    }
    sel.innerHTML = ids.map((id) => `<option value="${id}">${echapper(persos[id].nom)}</option>`).join("");
    mutationPersoId = ids.includes(mutationPersoId) ? mutationPersoId : (ids.includes(ficheActiveId) ? ficheActiveId : ids[0]);
    sel.value = mutationPersoId;
    sel.onchange = () => { mutationPersoId = sel.value; _rendreZoneMutations(); };
    _rendreZoneMutations();
  }

  // Génère la mutation manquante au palier `palier` (1 à 3) pour `persoId` :
  // jette 1d6, journalise le jet (comme tout autre dé de l'app) et ajoute
  // l'entrée obtenue à p.mutations. Ne vérifie PAS ici que ce palier est
  // effectivement "dû" — le bouton appelant (cf. _rendreZoneMutations)
  // n'est affiché que dans ce cas, mais un second appel accidentel resterait
  // sans risque (ajoute juste une entrée de plus, jamais bloquant).
  function genererMutation(persoId, palier) {
    const table = typeof TABLE_MUTATIONS !== "undefined" ? TABLE_MUTATIONS[palier] : null;
    if (!table) return;
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const d6 = lancerDe(6);
    const entree = table.mutations.find((m) => m.d6 === d6);
    ajouterHisto(`Mutation — Palier ${palier} (${table.nom})`, d6, false, false, `d6[${d6}]`);
    p.mutations = p.mutations || [];
    p.mutations.push({ id: _genMutationId(), palier, d6, nom: entree.nom, effet: entree.effet, obtenueLe: Date.now() });
    sauverPersos(persos);
    toast(`🧬 Nouvelle mutation (Palier ${palier}) : ${entree.nom}.`);
    _rendreZoneMutations();
  }

  // Retire une mutation au choix (purification) — jamais automatique, cf.
  // demande de Thomas ("purification au choix"). Ne touche pas à la CA
  // elle-même : c'est un geste distinct (typiquement décidé en même temps
  // qu'une purification de CA ajustée manuellement ailleurs sur la fiche).
  function retirerMutation(persoId, mutationId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p || !p.mutations) return;
    const idx = p.mutations.findIndex((m) => m.id === mutationId);
    if (idx === -1) return;
    const nom = p.mutations[idx].nom;
    p.mutations.splice(idx, 1);
    sauverPersos(persos);
    toast(`Mutation retirée : ${nom}.`);
    _rendreZoneMutations();
  }

  function _rendreZoneMutations() {
    const zone = document.getElementById("zone-mutations");
    if (!zone) return;
    const persos = chargerPersos();
    const p = persos[mutationPersoId];
    if (!p) { zone.innerHTML = ""; return; }
    const perso = Personnage.depuisJSON(p);
    const ca = perso.corruptionMajeure || 0;
    const paliersAtteints = perso.nombrePaliersMutationAtteints();
    const mutations = p.mutations || [];
    const peutEditer = role === "mj" || estProprietaire(p);

    let html = `<div class="carte"><h3 style="margin-top:0;">Corruption d'Âme : ${ca}</h3>`;

    if (!paliersAtteints && !perso.aAtteintRupture()) {
      html += `<p class="vide">Aucune mutation — la Corruption d'Âme n'a pas encore atteint le Palier 1 (CA ${SEUILS_PALIERS_MUTATION[1]}+).</p>`;
    }

    // Une mutation "due" (palier atteint, pas encore tirée) par palier manquant.
    const prochainPalier = mutations.length + 1;
    if (peutEditer && paliersAtteints >= prochainPalier && prochainPalier <= 3) {
      const table = typeof TABLE_MUTATIONS !== "undefined" ? TABLE_MUTATIONS[prochainPalier] : null;
      html += `<div class="aide" style="margin-bottom:8px;">
        <strong>Palier ${prochainPalier} atteint (${table ? table.nom : ""}, ${table ? table.plage : ""})</strong> —
        une mutation reste à générer.
        <button class="btn petit or" data-generer-mutation="${prochainPalier}" style="margin-left:8px;">🎲 Générer la mutation</button>
      </div>`;
    }

    if (peutEditer && perso.aAtteintRupture()) {
      html += `<div class="aide" style="margin-bottom:8px;border-left:3px solid var(--chaos);padding-left:8px;">
        <strong>${PALIER_4_RUPTURE ? PALIER_4_RUPTURE.nom : "Rupture"} (${PALIER_4_RUPTURE ? PALIER_4_RUPTURE.plage : "CA 10"})</strong> —
        ${PALIER_4_RUPTURE ? echapper(PALIER_4_RUPTURE.texte) : ""}
      </div>`;
    }

    html += `</div>`;

    if (mutations.length) {
      html += `<div class="carte"><h3 style="margin-top:0;">Mutations actives</h3>`;
      // Groupées par palier, dans l'ordre d'obtention à l'intérieur d'un palier.
      [1, 2, 3].forEach((palier) => {
        const dePalier = mutations.filter((m) => m.palier === palier);
        if (!dePalier.length) return;
        const table = typeof TABLE_MUTATIONS !== "undefined" ? TABLE_MUTATIONS[palier] : null;
        html += `<h4 style="margin-bottom:4px;">Palier ${palier} — ${table ? table.nom : ""}</h4>`;
        dePalier.forEach((m) => {
          html += `<div class="mutation-ligne" style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--parchemin-fonce);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <strong>${echapper(m.nom)}</strong>
              ${peutEditer ? `<button class="btn petit danger" data-retirer-mutation="${m.id}" title="Retirer (purification)">✕</button>` : ""}
            </div>
            <div style="font-size:0.85rem;">${echapper(m.effet)}</div>
          </div>`;
        });
      });
      html += `</div>`;
    }

    zone.innerHTML = html;
    zone.querySelectorAll("[data-generer-mutation]").forEach((el) => {
      el.onclick = () => genererMutation(mutationPersoId, parseInt(el.dataset.genererMutation, 10));
    });
    zone.querySelectorAll("[data-retirer-mutation]").forEach((el) => {
      el.onclick = () => {
        if (confirm("Retirer cette mutation (purification) ?")) retirerMutation(mutationPersoId, el.dataset.retirerMutation);
      };
    });
  }

  /* ============================================================
     MESSAGES MJ → JOUEUR (homebrew) — ciblage par nom (memeNom), cf.
     STORAGE_MESSAGES. Liste partagée façon journal de dés (STORAGE_HISTO) :
     un seul document SyncStore, jamais purgé automatiquement (le MJ garde
     l'historique de ce qu'il a envoyé).
     ============================================================ */

  function _messages() { return SyncStore.get(STORAGE_MESSAGES) || []; }
  function _genMessageId() { return "msg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Mes messages (joueur courant), triés du plus récent au plus ancien —
  // ciblage par nom, cf. _rosterJoueurs/_livrePartageAvecMoi (même
  // convention que le partage de livres, seul précédent de ciblage nommé).
  function _mesMessages() {
    return _messages()
      .filter((m) => memeNom(m.destinataireNom, joueurNom))
      .slice()
      .sort((a, b) => b.envoyeLe - a.envoyeLe);
  }

  // Sentinelle pour "Tous les joueurs" dans le select destinataire — jamais
  // un vrai prénom (aucun joueur ne peut s'appeler "__tous__"), reconnue par
  // envoyerMessage() ci-dessous pour diffuser au lieu de cibler un seul nom.
  const DESTINATAIRE_TOUS = "__tous__";

  function _rendreOptionsDestinatairesMessage() {
    const sel = document.getElementById("msg-destinataire");
    if (!sel) return;
    const persos = chargerPersos();
    const noms = _rosterJoueurs(persos);
    const valeurAvant = sel.value;
    const optionTous = `<option value="${DESTINATAIRE_TOUS}">📢 Tous les joueurs</option>`;
    sel.innerHTML = noms.length
      ? optionTous + noms.map((n) => `<option value="${echapper(n)}">${echapper(n)}</option>`).join("")
      : `<option value="">Aucun joueur connu</option>`;
    if (valeurAvant === DESTINATAIRE_TOUS || noms.includes(valeurAvant)) sel.value = valeurAvant;
  }

  function envoyerMessage() {
    const sel = document.getElementById("msg-destinataire");
    const champ = document.getElementById("msg-texte");
    if (!sel || !champ) return;
    const destinataireNom = sel.value;
    const texte = champ.value.trim();
    if (!destinataireNom) { toast("Choisis un destinataire."); return; }
    if (!texte) { toast("Écris un message avant d'envoyer."); return; }
    const messages = _messages();
    const envoyeLe = Date.now();
    if (destinataireNom === DESTINATAIRE_TOUS) {
      // Diffusion : un message individuel par joueur connu (même roster que
      // le select), plutôt qu'un seul enregistrement partagé — évite que le
      // statut "lu" d'un joueur (marquerMessageLu, cf. plus bas) rejaillisse
      // sur les autres, puisque m.lu est un champ partagé par message.
      const noms = _rosterJoueurs(chargerPersos());
      if (!noms.length) { toast("Aucun joueur connu à qui diffuser."); return; }
      noms.forEach((nom) => messages.push({ id: _genMessageId(), destinataireNom: nom, texte, envoyeLe, lu: false }));
      SyncStore.set(STORAGE_MESSAGES, messages);
      champ.value = "";
      toast(`Message diffusé à ${noms.length} joueur(s).`);
      rendreMessages();
      return;
    }
    messages.push({ id: _genMessageId(), destinataireNom, texte, envoyeLe, lu: false });
    SyncStore.set(STORAGE_MESSAGES, messages);
    champ.value = "";
    toast(`Message envoyé à ${destinataireNom}.`);
    rendreMessages();
  }

  function marquerMessageLu(id) {
    const messages = _messages();
    const m = messages.find((mm) => mm.id === id);
    if (!m || m.lu) return;
    m.lu = true;
    SyncStore.set(STORAGE_MESSAGES, messages);
  }

  function _formatDateMessage(ts) {
    try { return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }

  function rendreMessages() {
    const zone = document.getElementById("zone-messages");
    if (!zone) return;
    if (role === "mj") {
      _rendreOptionsDestinatairesMessage();
      const envoyes = _messages().slice().sort((a, b) => b.envoyeLe - a.envoyeLe);
      // Une diffusion "Tous les joueurs" (envoyerMessage) crée un message
      // PAR joueur (même texte, même envoyeLe) — regroupés ici en une seule
      // ligne "📢 Tous les joueurs (N)" côté MJ, pour ne pas noyer la liste
      // envoyée d'autant de lignes que de joueurs à la table.
      const groupes = [];
      const dejaGroupe = new Set();
      envoyes.forEach((m) => {
        if (dejaGroupe.has(m.id)) return;
        const memeEnvoi = envoyes.filter((mm) => mm.envoyeLe === m.envoyeLe && mm.texte === m.texte);
        if (memeEnvoi.length > 1) {
          memeEnvoi.forEach((mm) => dejaGroupe.add(mm.id));
          groupes.push({ diffusion: true, envoyeLe: m.envoyeLe, texte: m.texte, membres: memeEnvoi });
        } else {
          dejaGroupe.add(m.id);
          groupes.push({ diffusion: false, envoyeLe: m.envoyeLe, texte: m.texte, membres: [m] });
        }
      });
      zone.innerHTML = groupes.length
        ? groupes.map((g) => {
            const nomLabel = g.diffusion ? `📢 Tous les joueurs (${g.membres.length})` : echapper(g.membres[0].destinataireNom);
            const nbLus = g.membres.filter((mm) => mm.lu).length;
            const statutLabel = g.diffusion
              ? ` · ${nbLus}/${g.membres.length} lu(s)`
              : g.membres[0].lu ? " · lu" : " · pas encore lu";
            const nonLu = nbLus < g.membres.length;
            return `<div class="message-ligne${nonLu ? " message-non-lu" : ""}">
              <div class="message-entete"><strong>${nomLabel}</strong> · ${_formatDateMessage(g.envoyeLe)}${statutLabel}</div>
              <div class="message-texte">${echapper(g.texte)}</div>
            </div>`;
          }).join("")
        : `<div class="vide">Aucun message envoyé pour l'instant.</div>`;
      return;
    }
    const mesMsg = _mesMessages();
    zone.innerHTML = mesMsg.length
      ? mesMsg.map((m) => `<div class="message-ligne${m.lu ? "" : " message-non-lu"}" data-message-id="${m.id}">
          <div class="message-entete">${_formatDateMessage(m.envoyeLe)}${m.lu ? "" : " · <strong>nouveau</strong>"}</div>
          <div class="message-texte">${echapper(m.texte)}</div>
        </div>`).join("")
      : `<div class="vide">Aucun message pour l'instant.</div>`;
    zone.querySelectorAll("[data-message-id]").forEach((el) => { marquerMessageLu(el.dataset.messageId); });
  }

  // Badge de compteur non-lu sur l'onglet "✉️ Messages" — mis à jour à
  // chaque rendu/synchro (cf. rendreMessages/abonnement SyncStore dans init()).
  function _majBadgeMessages() {
    const btn = document.getElementById("onglet-messages");
    if (!btn) return;
    const n = role === "joueur" ? _mesMessages().filter((m) => !m.lu).length : 0;
    btn.textContent = n > 0 ? `✉️ Messages (${n})` : "✉️ Messages";
  }

  // Notifie (toast) l'arrivée d'un nouveau message pour MOI, en temps réel —
  // même principe que la notification de vote loot (SyncStore.subscribe).
  // _messagesConnus évite de re-notifier au premier chargement (l'abonnement
  // Firestore renvoie tout l'historique existant dès la connexion).
  let _messagesConnus = null;
  function _verifierNouveauxMessages(messages) {
    const mesMsg = (messages || []).filter((m) => memeNom(m.destinataireNom, joueurNom));
    if (_messagesConnus === null) {
      _messagesConnus = new Set(mesMsg.map((m) => m.id));
      return;
    }
    mesMsg.forEach((m) => {
      if (!_messagesConnus.has(m.id)) {
        _messagesConnus.add(m.id);
        toast(`✉️ Nouveau message : « ${m.texte.length > 60 ? m.texte.slice(0, 60) + "…" : m.texte} »`);
      }
    });
  }

  // Badge de partage affiché sur la tranche d'un de MES livres (état courant).
  function _badgePartage(l) {
    if (l.partage === "table") return ` <span class="badge-partage">🌐 table</span>`;
    if (l.partage === "joueurs" && (l.partageAvec || []).length) return ` <span class="badge-partage">👥 ${l.partageAvec.length}</span>`;
    return "";
  }

  // Tranche de livre (carte) de l'étagère. estPartage=true → livre d'un autre
  // joueur partagé avec moi (on montre l'auteur au lieu du badge de partage).
  function _htmlSpine(l, estPartage, perso) {
    const texte = (l.texte || "").trim();
    const apercu = texte.slice(0, 120);
    const cover = l.image ? `<img class="livre-spine-cover" src="${l.image}" alt="" />` : "";
    const meta = estPartage
      ? ` <span class="livre-spine-meta">✍ ${echapper(perso.proprietaireNom || perso.nom)}</span>`
      : _badgePartage(l);
    const dataPerso = estPartage ? ` data-perso="${perso.id}"` : "";
    return `<button class="livre-spine${l.image ? " avec-cover" : ""}" data-livre="${l.id}" data-type="${estPartage ? "autre" : "mien"}"${dataPerso}>
      ${cover}
      <span class="livre-spine-titre">📖 ${echapper(l.titre || "Sans titre")}${meta}</span>
      <span class="livre-spine-apercu">${apercu ? echapper(apercu) + (texte.length > 120 ? "…" : "") : "<i>vide</i>"}</span>
    </button>`;
  }

  // Range les livres par catégorie : catégories nommées triées alpha, puis le
  // groupe "Sans catégorie" en dernier. Une seule catégorie vide → pas de
  // regroupement (l'étagère reste plate, comme avant).
  function _grouperLivresParCategorie(livres) {
    const groupes = new Map();
    livres.forEach((l) => {
      const cat = (l.categorie || "").trim();
      if (!groupes.has(cat)) groupes.set(cat, []);
      groupes.get(cat).push(l);
    });
    const nommees = [...groupes.keys()].filter((c) => c).sort((a, b) => a.localeCompare(b, "fr"));
    const ordre = groupes.has("") ? [...nommees, ""] : nommees;
    return ordre.map((cat) => ({ cat, livres: groupes.get(cat) }));
  }

  // Étagère HTML d'une liste de livres : plate s'il n'y a aucune catégorie,
  // sinon un bloc par catégorie avec un intitulé.
  function _htmlEtagere(livres, estPartage) {
    const groupes = _grouperLivresParCategorie(livres);
    if (!groupes.some((g) => g.cat)) {
      return `<div class="livre-etagere">${livres.map((l) => _htmlSpine(l, estPartage, l._perso)).join("")}</div>`;
    }
    return groupes.map((g) => `<div class="livre-groupe">
      <div class="livre-groupe-titre">🏷 ${g.cat ? echapper(g.cat) : "Sans catégorie"}</div>
      <div class="livre-etagere">${g.livres.map((l) => _htmlSpine(l, estPartage, l._perso)).join("")}</div>
    </div>`).join("");
  }

  // Vue "étagère" : mes livres (+ bouton Nouveau livre si éditable), puis une
  // section "Partagés avec moi" avec les livres que d'autres joueurs m'ont ouverts.
  function _rendreEtagere(p, livres, persos) {
    const zone = document.getElementById("zone-livret");
    const editable = _peutEditerLivre(p);
    const partages = _livresPartagesAvecMoi(persos);
    // Porte le perso propriétaire sur chaque livre partagé pour _htmlEtagere/_htmlSpine.
    const livresPartages = partages.map((it) => Object.assign({}, it.livre, { _perso: it.perso }));
    zone.innerHTML = `<div class="carte livret-bloc">
      <div class="livret-entete">
        <h3 style="margin:0;">📚 Livres — ${echapper(p.nom)}</h3>
        ${editable ? `<button class="btn petit" id="btn-nouveau-livre">➕ Nouveau livre</button>` : ""}
      </div>
      ${livres.length
        ? _htmlEtagere(livres, false)
        : `<p class="vide">${editable ? "Aucun livre pour l'instant. Clique « ➕ Nouveau livre » pour commencer." : "Aucun livre."}</p>`}
    </div>
    ${role !== "mj" ? `<div class="carte livret-bloc">
      <h3 style="margin:0 0 12px;">📬 Partagés avec moi</h3>
      ${partages.length
        ? _htmlEtagere(livresPartages, true)
        : `<p class="vide">Aucun livre partagé avec toi pour l'instant. Quand un joueur partagera un livre avec toi (ou avec toute la table), il apparaîtra ici.</p>`}
    </div>` : ""}`;
    zone.querySelectorAll('.livre-spine[data-type="mien"]').forEach((b) => {
      b.onclick = () => { livreOuvertId = b.dataset.livre; livreOuvertPersoId = p.id; _rendreZoneLivret(); };
    });
    zone.querySelectorAll('.livre-spine[data-type="autre"]').forEach((b) => {
      b.onclick = () => { livreOuvertId = b.dataset.livre; livreOuvertPersoId = b.dataset.perso; _rendreZoneLivret(); };
    });
    if (editable) {
      const btn = document.getElementById("btn-nouveau-livre");
      if (btn) btn.onclick = () => creerLivre(p.id);
    }
  }

  /* ============================================================
     ATELIER — enchantement (js/enchantement.js) + alchimie (js/alchimie.js)
     à risque, partagent les mêmes bases : matériaux/inventaire, tentatives/
     jour, jet 1d20 brut.
     ============================================================ */

  // Nom affiché du catalogue loot pour un id d'item (matériau, potion...),
  // repli sur l'id brut si le catalogue n'est pas chargé ou l'id inconnu.
  function _nomCatalogueLoot(id) {
    if (typeof LOOT_CATALOGUE === "undefined") return id;
    const it = LOOT_CATALOGUE.find((l) => l.id === id);
    return it ? it.nom : id;
  }

  // Quantité totale d'un consommable dans un inventaire — les entrées ne sont
  // JAMAIS fusionnées à l'ajout (cf. ajouterItemInventaire, simple push), donc
  // un même id peut apparaître dans plusieurs entrées séparées à additionner.
  function _quantiteDisponible(inventaireListe, itemId) {
    return (inventaireListe || []).filter((it) => it.id === itemId).reduce((total, it) => total + (it.quantite || 1), 0);
  }

  // Consomme `qte` unités d'un consommable, en piochant sur autant d'entrées
  // que nécessaire (cf. _quantiteDisponible) — décrémente une entrée
  // partiellement plutôt que de la retirer si elle n'est pas épuisée.
  // Boucle à l'envers : la suppression d'une entrée ne décale jamais les
  // index déjà visités.
  function _consommerQuantite(inventaireListe, itemId, qte) {
    let restant = qte;
    for (let i = inventaireListe.length - 1; i >= 0 && restant > 0; i--) {
      const it = inventaireListe[i];
      if (it.id !== itemId) continue;
      const dispo = it.quantite || 1;
      if (dispo <= restant) {
        restant -= dispo;
        inventaireListe.splice(i, 1);
      } else {
        it.quantite = dispo - restant;
        restant = 0;
      }
    }
  }

  // Vérifie sans rien modifier si `persoId` possède tous les matériaux d'un
  // coût (cout = [{id, qte}]) — partagé enchantement + alchimie.
  function materiauxDisponibles(persoId, cout) {
    const p = chargerPersos()[persoId];
    if (!p) return false;
    return cout.every((c) => _quantiteDisponible(p.inventaireListe, c.id) >= c.qte);
  }

  // Retire les matériaux d'un coût et persiste. À n'appeler qu'après
  // materiauxDisponibles() === true (pas de re-vérification ici — c'est à
  // l'appelant de garder le contrôle sur l'ordre des vérifications, cf.
  // _tenterEnchantement/_brasserPotion).
  function consommerMateriaux(persoId, cout) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    cout.forEach((c) => _consommerQuantite(p.inventaireListe, c.id, c.qte));
    sauverPersos(persos);
  }

  function _tentativesAtelier() { return SyncStore.get(STORAGE_ATELIER_TENTATIVES) || {}; }
  // cle : identifiant composite complet, ex. "enchantement:generique:3",
  // "alchimie:soin_seve:2", "alchimie:util:antidote" — construit par l'appelant.
  function _tentativesJour(persoId, cle) {
    const table = _tentativesAtelier();
    return (table[persoId] && table[persoId][cle]) || 0;
  }
  function _incrementerTentative(persoId, cle) {
    const table = _tentativesAtelier();
    table[persoId] = table[persoId] || {};
    table[persoId][cle] = (table[persoId][cle] || 0) + 1;
    SyncStore.set(STORAGE_ATELIER_TENTATIVES, table);
  }

  // Onglet "🔨 Atelier" : sélecteur de personnage commun aux deux sous-onglets
  // (même filtre estProprietaire que "Ma fiche"/"Livret"), puis délègue le
  // rendu de chaque sous-onglet — les deux sont tenus à jour en permanence,
  // seule la visibilité CSS (.sous-panneau.actif, cf. initSousOnglets) change
  // au clic, pas de re-rendu nécessaire à la bascule.
  function rendrePanneauAtelier() {
    initSousOnglets("sous-onglets-atelier", {
      enchantement: "sous-panneau-atelier-enchantement",
      alchimie: "sous-panneau-atelier-alchimie",
    });
    const sel = document.getElementById("select-atelier-perso");
    if (!sel) return;
    const persos = chargerPersos();
    const ids = Object.keys(persos).filter((id) => estProprietaire(persos[id]));
    if (!ids.length) {
      sel.innerHTML = `<option value="">Aucun personnage</option>`;
      const vide = `<div class="carte"><p class="vide">Aucun personnage. Crée-en un dans l'onglet « Création ».</p></div>`;
      document.getElementById("zone-atelier").innerHTML = vide;
      document.getElementById("zone-atelier-alchimie").innerHTML = "";
      return;
    }
    sel.innerHTML = ids.map((id) => `<option value="${id}">${echapper(persos[id].nom)}</option>`).join("");
    atelierPersoId = ids.includes(atelierPersoId) ? atelierPersoId : (ids.includes(ficheActiveId) ? ficheActiveId : ids[0]);
    sel.value = atelierPersoId;
    sel.onchange = () => {
      atelierPersoId = sel.value;
      atelierItemIdx = null; atelierSystemeId = null;
      alchimieType = null; alchimieFiliereId = null; alchimieFamilleId = null;
      _rendreAtelierItems();
      _rendreAlchimieType();
    };
    _rendreAtelierItems();
    _rendreAlchimieType();
  }

  /* ---------- Sous-onglet Enchantement ---------- */

  function _rendreAtelierItems() {
    const zone = document.getElementById("zone-atelier");
    if (!zone) return;
    const p = chargerPersos()[atelierPersoId];
    if (!p) { zone.innerHTML = ""; return; }
    const items = (p.inventaireListe || [])
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.type === "arme" || it.type === "armure");

    if (!items.length) {
      zone.innerHTML = `<div class="carte"><p class="vide">Aucune arme ni armure dans l'inventaire de ${echapper(p.nom)}.</p></div>`;
      return;
    }
    zone.innerHTML = `<div class="carte">
      <label>Objet à enchanter
        <select id="select-atelier-item">
          ${items.map(({ it, idx }) => `<option value="${idx}">${echapper(it.nom)} (${it.type})</option>`).join("")}
        </select>
      </label>
      <div id="zone-atelier-systeme" style="margin-top:10px;"></div>
    </div>`;
    const selItem = document.getElementById("select-atelier-item");
    atelierItemIdx = items.some(({ idx }) => idx === atelierItemIdx) ? atelierItemIdx : items[0].idx;
    selItem.value = atelierItemIdx;
    selItem.onchange = () => { atelierItemIdx = parseInt(selItem.value, 10); atelierSystemeId = null; _rendreAtelierSysteme(); };
    _rendreAtelierSysteme();
  }

  function _rendreAtelierSysteme() {
    const zoneSys = document.getElementById("zone-atelier-systeme");
    if (!zoneSys || typeof Enchantements === "undefined") return;
    const p = chargerPersos()[atelierPersoId];
    const item = p && p.inventaireListe[atelierItemIdx];
    if (!item) { zoneSys.innerHTML = ""; return; }
    const systemes = Enchantements.systemesDisponibles(item);
    if (!systemes.length) {
      zoneSys.innerHTML = `<p class="vide">Aucun système d'enchantement pour ce type d'objet.</p>`;
      return;
    }
    zoneSys.innerHTML = `
      <label>Système
        <select id="select-atelier-systeme">
          ${systemes.map((sid) => `<option value="${sid}">${echapper(Enchantements.trouverSysteme(sid).label)}</option>`).join("")}
        </select>
      </label>
      <label style="margin-left:12px;">Bonus au jet
        <input type="number" id="atelier-bonus" value="0" style="width:70px;" />
      </label>
      <div id="zone-atelier-paliers"></div>
    `;
    const selSys = document.getElementById("select-atelier-systeme");
    atelierSystemeId = systemes.includes(atelierSystemeId) ? atelierSystemeId : systemes[0];
    selSys.value = atelierSystemeId;
    selSys.onchange = () => { atelierSystemeId = selSys.value; _rendreAtelierPaliers(); };
    _rendreAtelierPaliers();
  }

  function _rendreAtelierPaliers() {
    const zone = document.getElementById("zone-atelier-paliers");
    if (!zone || typeof Enchantements === "undefined") return;
    const p = chargerPersos()[atelierPersoId];
    const item = p && p.inventaireListe[atelierItemIdx];
    const systeme = Enchantements.trouverSysteme(atelierSystemeId);
    if (!p || !item || !systeme) { zone.innerHTML = ""; return; }

    zone.innerHTML = systeme.paliers.map((palier) => {
      const cle = `enchantement:${atelierSystemeId}:${palier.id}`;
      const tentatives = _tentativesJour(atelierPersoId, cle);
      const restantes = palier.tentativesJour - tentatives;
      const materiauxOk = materiauxDisponibles(atelierPersoId, palier.cout);
      const coutTxt = palier.cout.map((c) => {
        const dispo = _quantiteDisponible(p.inventaireListe, c.id);
        const manque = dispo < c.qte;
        return `<span${manque ? ' style="color:var(--chaos);font-weight:700;"' : ""}>${c.qte}× ${echapper(_nomCatalogueLoot(c.id))} (${dispo} en stock)</span>`;
      }).join(", ");
      const desactive = restantes <= 0 || !materiauxOk;
      return `<div class="carte" style="margin-top:10px;">
        <div><strong>Palier ${palier.id}</strong> — diff. ${palier.diff}${palier.destructionSi > 0 ? ` · <span style="color:var(--chaos);">destruction si jet brut ≤ ${palier.destructionSi}</span>` : ""}</div>
        <div>Coût : ${coutTxt}</div>
        <div>Tentatives aujourd'hui : ${tentatives}/${palier.tentativesJour}${restantes <= 0 ? " — épuisées" : ""}</div>
        <button class="btn or" data-palier="${palier.id}" ${desactive ? "disabled" : ""} style="margin-top:6px;">Tenter</button>
      </div>`;
    }).join("");

    zone.querySelectorAll("[data-palier]").forEach((btn) => {
      btn.onclick = () => _tenterEnchantement(parseInt(btn.dataset.palier, 10));
    });
  }

  function _tenterEnchantement(palierId) {
    const p = chargerPersos()[atelierPersoId];
    const item = p && p.inventaireListe[atelierItemIdx];
    const systeme = Enchantements.trouverSysteme(atelierSystemeId);
    const palier = systeme && systeme.paliers.find((pp) => pp.id === palierId);
    if (!p || !item || !palier) return;
    const cle = `enchantement:${atelierSystemeId}:${palierId}`;

    // Gardes défensives (en plus du bouton désactivé) : re-vérifie tentatives
    // et matériaux au moment du clic, au cas où l'affichage serait périmé
    // (un autre client a pu consommer les mêmes matériaux entre-temps).
    if (_tentativesJour(atelierPersoId, cle) >= palier.tentativesJour) {
      toast("Plus de tentatives pour ce palier aujourd'hui.");
      return;
    }
    if (!materiauxDisponibles(atelierPersoId, palier.cout)) {
      toast("Matériaux insuffisants.");
      return;
    }
    // Avertissement AVANT de lancer le dé (on ne sait pas encore si le jet
    // sera assez bas pour détruire l'objet — le risque se prend à l'aveugle).
    if (palier.destructionSi > 0 && !confirm(`Risque de destruction : « ${item.nom} » sera détruit(e) si le d20 brut tombe à ${palier.destructionSi} ou moins. Tenter quand même ?`)) {
      return;
    }

    const bonus = parseInt(document.getElementById("atelier-bonus").value, 10) || 0;
    const jetBrut = lancerDe(20);
    const resultat = Enchantements.resoudre(item, atelierSystemeId, palierId, jetBrut, bonus);

    // Matériaux consommés dans tous les cas (succès, échec, destruction) —
    // seul le sort de l'objet ensuite change selon le résultat. consommerMateriaux
    // recharge/sauve son propre snapshot de persos, mais p.inventaireListe reste
    // la MÊME référence (chargerPersos ne fait qu'une copie superficielle de la
    // map, cf. DepotDistant.charger) : les deux se voient mutuellement.
    consommerMateriaux(atelierPersoId, palier.cout);

    // Retrouve l'entrée par référence d'objet, jamais par index : la
    // consommation ci-dessus a pu retirer une entrée de matériau placée AVANT
    // atelierItemIdx dans inventaireListe, ce qui décale tous les index
    // suivants — un index figé avant l'appel serait alors erroné.
    const idxActuel = p.inventaireListe.indexOf(item);
    if (idxActuel === -1) return; // sécurité : ne devrait pas arriver
    if (resultat.resultat === "destruction") {
      p.inventaireListe.splice(idxActuel, 1);
      atelierItemIdx = null;
    } else if (resultat.resultat === "succes") {
      p.inventaireListe[idxActuel] = resultat.itemMisAJour;
      atelierItemIdx = idxActuel;
    }
    // échec : objet inchangé, seuls les matériaux ci-dessus sont partis.
    _incrementerTentative(atelierPersoId, cle);
    sauverPersos(chargerPersos()); // persiste la mutation d'objet ci-dessus (partage la même map que consommerMateriaux)

    const total = jetBrut + bonus;
    const crit = jetBrut === 20, echec = jetBrut === 1;
    const detailJet = `d20[${jetBrut}]${bonus >= 0 ? "+" : ""}${bonus} — ${resultat.message}`;
    const label = `${p.nom} — ${systeme.label} palier ${palierId} sur « ${item.nom} »`;
    afficherResultat(label, total, detailJet, crit, echec);
    ajouterHisto(label, total, crit, echec, detailJet);
    toast(resultat.message);

    rendrePanneauAtelier();
  }

  /* ---------- Sous-onglet Alchimie ---------- */

  // Reconstruit la recette/palier à partir d'une clé composite (cf.
  // _tentativesJour) plutôt que de fermer sur une référence — les boutons
  // sont re-générés à chaque rendu, autant relire depuis ALCHIMIE à chaque
  // clic pour ne jamais dépendre d'un état capturé périmé.
  function _recetteDepuisCle(cle) {
    const parts = cle.split(":"); // ["alchimie", "soin_<filiere>" | "util" | "poison_<famille>", <palierId> | <recetteId>]
    if (parts[1] === "util") return Alchimie.trouverRecetteUtilitaire(parts[2]);
    if (parts[1].startsWith("poison_")) return Alchimie.trouverRecettePoison(parts[1].replace(/^poison_/, ""), parseInt(parts[2], 10));
    const filiereId = parts[1].replace(/^soin_/, "");
    return Alchimie.trouverRecetteSoin(filiereId, parseInt(parts[2], 10));
  }

  function _rendreAlchimieType() {
    const zone = document.getElementById("zone-atelier-alchimie");
    if (!zone || typeof Alchimie === "undefined") return;
    const p = chargerPersos()[atelierPersoId];
    if (!p) { zone.innerHTML = ""; return; }
    zone.innerHTML = `<div class="carte">
      <label>Type de potion
        <select id="select-alchimie-type">
          <option value="soin">${echapper(ALCHIMIE.soin.label)}</option>
          <option value="utilitaires">${echapper(ALCHIMIE.utilitaires.label)}</option>
          <option value="poisons">${echapper(ALCHIMIE.poisons.label)}</option>
        </select>
      </label>
      <label style="margin-left:12px;">Bonus au jet
        <input type="number" id="alchimie-bonus" value="0" style="width:70px;" />
      </label>
      <div id="zone-alchimie-detail" style="margin-top:10px;"></div>
    </div>`;
    const sel = document.getElementById("select-alchimie-type");
    alchimieType = alchimieType || "soin";
    sel.value = alchimieType;
    sel.onchange = () => { alchimieType = sel.value; alchimieFiliereId = null; alchimieFamilleId = null; _rendreAlchimieDetail(); };
    _rendreAlchimieDetail();
  }

  function _rendreAlchimieDetail() {
    if (alchimieType === "utilitaires") _rendreAlchimieUtilitaires();
    else if (alchimieType === "poisons") _rendreAlchimiePoisons();
    else _rendreAlchimieSoin();
  }

  function _rendreAlchimieSoin() {
    const zone = document.getElementById("zone-alchimie-detail");
    if (!zone) return;
    const filieres = Object.keys(ALCHIMIE.soin.filieres);
    alchimieFiliereId = filieres.includes(alchimieFiliereId) ? alchimieFiliereId : filieres[0];
    zone.innerHTML = `
      <label>Filière
        <select id="select-alchimie-filiere">
          ${filieres.map((fid) => `<option value="${fid}">${echapper(ALCHIMIE.soin.filieres[fid].label)}</option>`).join("")}
        </select>
      </label>
      <div id="zone-alchimie-paliers" style="margin-top:10px;"></div>
    `;
    const sel = document.getElementById("select-alchimie-filiere");
    sel.value = alchimieFiliereId;
    sel.onchange = () => { alchimieFiliereId = sel.value; _rendreAlchimiePaliersSoin(); };
    _rendreAlchimiePaliersSoin();
  }

  function _rendreAlchimiePaliersSoin() {
    const zone = document.getElementById("zone-alchimie-paliers");
    if (!zone) return;
    const filiere = ALCHIMIE.soin.filieres[alchimieFiliereId];
    if (!filiere) { zone.innerHTML = ""; return; }
    _rendreCartesRecettes(zone, filiere.paliers.map((palier) => ({ recette: palier, cle: `alchimie:soin_${alchimieFiliereId}:${palier.id}` })));
  }

  // Copie quasi conforme de _rendreAlchimieSoin/_rendreAlchimiePaliersSoin,
  // mais sur ALCHIMIE.poisons.familles — variable de module dédiée
  // (alchimieFamilleId) pour ne pas mélanger les deux systèmes si jamais
  // leurs clés se recoupent.
  function _rendreAlchimiePoisons() {
    const zone = document.getElementById("zone-alchimie-detail");
    if (!zone) return;
    const familles = Object.keys(ALCHIMIE.poisons.familles);
    alchimieFamilleId = familles.includes(alchimieFamilleId) ? alchimieFamilleId : familles[0];
    zone.innerHTML = `
      <label>Famille
        <select id="select-alchimie-famille">
          ${familles.map((fid) => `<option value="${fid}">${echapper(ALCHIMIE.poisons.familles[fid].label)}</option>`).join("")}
        </select>
      </label>
      <div id="zone-alchimie-paliers" style="margin-top:10px;"></div>
    `;
    const sel = document.getElementById("select-alchimie-famille");
    sel.value = alchimieFamilleId;
    sel.onchange = () => { alchimieFamilleId = sel.value; _rendreAlchimiePaliersPoisons(); };
    _rendreAlchimiePaliersPoisons();
  }

  function _rendreAlchimiePaliersPoisons() {
    const zone = document.getElementById("zone-alchimie-paliers");
    if (!zone) return;
    const famille = ALCHIMIE.poisons.familles[alchimieFamilleId];
    if (!famille) { zone.innerHTML = ""; return; }
    _rendreCartesRecettes(zone, famille.paliers.map((palier) => ({ recette: palier, cle: `alchimie:poison_${alchimieFamilleId}:${palier.id}` })));
  }

  function _rendreAlchimieUtilitaires() {
    const zone = document.getElementById("zone-alchimie-detail");
    if (!zone) return;
    zone.innerHTML = `<div id="zone-alchimie-paliers"></div>`;
    _rendreCartesRecettes(document.getElementById("zone-alchimie-paliers"),
      ALCHIMIE.utilitaires.recettes.map((r) => ({ recette: r, cle: `alchimie:util:${r.id}` })));
  }

  // Rendu partagé filière-soin/utilitaires : une carte par recette, même
  // gabarit que _rendreAtelierPaliers côté enchantement (diff/tentatives/
  // coût/bouton), adapté au vocabulaire alchimie (rate au lieu de détruit).
  function _rendreCartesRecettes(zone, entrees) {
    if (!zone || typeof Alchimie === "undefined") return;
    const p = chargerPersos()[atelierPersoId];
    if (!p) { zone.innerHTML = ""; return; }
    zone.innerHTML = entrees.map(({ recette, cle }) => {
      const nomPotion = _nomCatalogueLoot(recette.potionId);
      const tentatives = _tentativesJour(atelierPersoId, cle);
      const restantes = recette.tentativesJour - tentatives;
      const materiauxOk = materiauxDisponibles(atelierPersoId, recette.cout);
      const coutTxt = recette.cout.map((c) => {
        const dispo = _quantiteDisponible(p.inventaireListe, c.id);
        const manque = dispo < c.qte;
        return `<span${manque ? ' style="color:var(--chaos);font-weight:700;"' : ""}>${c.qte}× ${echapper(_nomCatalogueLoot(c.id))} (${dispo} en stock)</span>`;
      }).join(", ");
      const desactive = restantes <= 0 || !materiauxOk;
      const nomItemRate = _nomCatalogueLoot(recette.itemRateId || "potion_ratee");
      return `<div class="carte" style="margin-top:10px;">
        <div><strong>${echapper(nomPotion)}</strong> — diff. ${recette.diff}${recette.rateCritiqueSi > 0 ? ` · <span style="color:var(--chaos);">rate si jet brut ≤ ${recette.rateCritiqueSi} (${echapper(nomItemRate)})</span>` : ""}</div>
        ${recette.formuleDot ? `<div>Dégâts par tour : ${echapper(recette.formuleDot)}${recette.dureeEtat ? ` pendant ${recette.dureeEtat} tours` : ""}</div>` : ""}
        <div>Coût : ${coutTxt}</div>
        <div>Tentatives aujourd'hui : ${tentatives}/${recette.tentativesJour}${restantes <= 0 ? " — épuisées" : ""}</div>
        <button class="btn or" data-cle-recette="${echapper(cle)}" ${desactive ? "disabled" : ""} style="margin-top:6px;">Brasser</button>
      </div>`;
    }).join("");

    zone.querySelectorAll("[data-cle-recette]").forEach((btn) => {
      btn.onclick = () => _brasserPotion(btn.dataset.cleRecette);
    });
  }

  function _brasserPotion(cle) {
    const recette = _recetteDepuisCle(cle);
    const p = chargerPersos()[atelierPersoId];
    if (!recette || !p) return;

    if (_tentativesJour(atelierPersoId, cle) >= recette.tentativesJour) {
      toast("Plus de tentatives pour cette recette aujourd'hui.");
      return;
    }
    if (!materiauxDisponibles(atelierPersoId, recette.cout)) {
      toast("Matériaux insuffisants.");
      return;
    }

    const bonus = parseInt(document.getElementById("alchimie-bonus").value, 10) || 0;
    const jetBrut = lancerDe(20);
    const resultat = Alchimie.resoudre(recette, jetBrut, bonus);

    // Ingrédients consommés dans tous les cas (succès, échec, ratée).
    consommerMateriaux(atelierPersoId, recette.cout);

    if (resultat.resultat !== "echec") {
      const itemCatalogue = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.id === resultat.itemProduitId) : null;
      if (itemCatalogue) ajouterItemInventaire(atelierPersoId, Object.assign({}, itemCatalogue));
    }
    _incrementerTentative(atelierPersoId, cle);

    const total = jetBrut + bonus;
    const crit = jetBrut === 20, echec = jetBrut === 1;
    const detailJet = `d20[${jetBrut}]${bonus >= 0 ? "+" : ""}${bonus} — ${resultat.message}`;
    const label = `${p.nom} — Alchimie (${_nomCatalogueLoot(recette.potionId)})`;
    afficherResultat(label, total, detailJet, crit, echec);
    ajouterHisto(label, total, crit, echec, detailJet);
    toast(resultat.message);

    rendrePanneauAtelier();
  }

  // Bloc de contrôle du partage (propriétaire uniquement) : Privé / Certains
  // joueurs (cases à cocher des autres prénoms) / Toute la table.
  function _htmlPartageControl(p, l, persos) {
    const mode = l.partage || "prive";
    const avec = l.partageAvec || [];
    const btn = (val, txt) => `<button class="btn-partage${mode === val ? " actif" : ""}" data-mode="${val}">${txt}</button>`;
    let checks = "";
    if (mode === "joueurs") {
      const roster = _rosterJoueurs(persos);
      checks = roster.length
        ? `<div class="partage-joueurs">${roster.map((n) =>
            `<label><input type="checkbox" class="chk-partage" value="${echapper(n)}"${avec.some((x) => memeNom(x, n)) ? " checked" : ""}/> ${echapper(n)}</label>`).join("")}</div>`
        : `<p class="partage-vide">Aucun autre joueur connu pour l'instant. Un joueur apparaît ici dès qu'il a créé un perso avec son prénom.</p>`;
    }
    return `<div class="livre-partage" id="livre-partage">
      <span class="livre-partage-lbl">Partage :</span>
      ${btn("prive", "🔒 Privé")}
      ${btn("joueurs", "👥 Certains joueurs")}
      ${btn("table", "🌐 Toute la table")}
      ${checks}
    </div>`;
  }

  // Ligne d'info affichée en lecture seule (MJ ou destinataire d'un partage) :
  // auteur du livre + état de partage.
  function _htmlInfoLecture(p, l) {
    const bits = [];
    if (p.proprietaireNom) bits.push(`✍ ${echapper(p.proprietaireNom)}`);
    if (l.partage === "table") bits.push("🌐 partagé avec toute la table");
    else if (l.partage === "joueurs") bits.push("👥 partagé avec certains joueurs");
    return bits.length ? `<p class="livre-partage-info">${bits.join(" · ")}</p>` : "";
  }

  // Vue "livre ouvert" : présenté comme une page de livre (couverture + titre +
  // illustration optionnelle + texte). Éditable pour le propriétaire (titre,
  // texte, image et partage sauvegardés à la volée), lecture seule sinon.
  function _rendreLivreOuvert(p, l, persos) {
    const zone = document.getElementById("zone-livret");
    const editable = _peutEditerLivre(p);
    const illustration = l.image
      ? `<div class="livre-illustration"><img src="${l.image}" alt="illustration du livre" /></div>`
      : "";
    zone.innerHTML = `<div class="carte livre-ouvert">
      <div class="livret-entete">
        <button class="btn petit secondaire" id="btn-retour-etagere">← Tous les livres</button>
        ${editable ? `<span class="livre-actions">
          <button class="btn petit" id="btn-livre-image">🖼 ${l.image ? "Changer l'image" : "Ajouter une image"}</button>
          ${l.image ? `<button class="btn petit secondaire" id="btn-livre-image-suppr">Retirer l'image</button>` : ""}
          <button class="btn petit danger" id="btn-suppr-livre">🗑 Supprimer</button>
          <input type="file" accept="image/*" id="input-livre-image" hidden />
        </span>` : ""}
      </div>
      ${editable
        ? `<label class="livre-titre-champ"><span class="livre-titre-lbl">Titre du livre</span>
            <input type="text" id="livre-titre" class="livre-titre-input" value="${echapper(l.titre || "")}" placeholder="Donne un titre à ton livre…" maxlength="80" /></label>`
        : `<h3 class="livre-titre-lecture">📖 ${echapper(l.titre || "Sans titre")}</h3>`}
      ${editable
        ? `<label class="livre-cat-champ"><span class="livre-titre-lbl">Catégorie (pour ranger)</span>
            <input type="text" id="livre-categorie" class="livre-cat-input" list="livre-cat-suggestions" value="${echapper(l.categorie || "")}" placeholder="ex. Histoire, Quête, Notes…" maxlength="30" />
            <datalist id="livre-cat-suggestions">${_suggestionsCategories(p).map((c) => `<option value="${echapper(c)}"></option>`).join("")}</datalist></label>`
        : (l.categorie ? `<div class="livre-cat-lecture">🏷 ${echapper(l.categorie)}</div>` : "")}
      ${editable ? _htmlPartageControl(p, l, persos) : _htmlInfoLecture(p, l)}
      ${illustration}
      <textarea id="livre-texte" class="livret-texte" rows="14"${editable ? "" : " readonly"} placeholder="Écris ici l'histoire, tes notes, une lettre…">${echapper(l.texte || "")}</textarea>
    </div>`;
    document.getElementById("btn-retour-etagere").onclick = () => { livreOuvertId = null; livreOuvertPersoId = null; _rendreZoneLivret(); };
    if (editable) {
      document.getElementById("livre-titre").onchange = (e) => sauverChampLivre(p.id, l.id, "titre", e.target.value);
      document.getElementById("livre-categorie").onchange = (e) => sauverChampLivre(p.id, l.id, "categorie", e.target.value.trim());
      document.getElementById("livre-texte").onchange = (e) => sauverChampLivre(p.id, l.id, "texte", e.target.value);
      document.getElementById("btn-suppr-livre").onclick = () => supprimerLivre(p.id, l.id);
      const inp = document.getElementById("input-livre-image");
      document.getElementById("btn-livre-image").onclick = () => inp.click();
      inp.onchange = (e) => {
        lireImageRedimensionnee(e.target.files[0], 800, 0.8, (dataUrl) => {
          sauverChampLivre(p.id, l.id, "image", dataUrl);
          toast("Image ajoutée ✔");
          _rendreZoneLivret(); // ré-affiche le livre avec son illustration
        });
      };
      const supprImg = document.getElementById("btn-livre-image-suppr");
      if (supprImg) supprImg.onclick = () => { sauverChampLivre(p.id, l.id, "image", null); _rendreZoneLivret(); };
      // Contrôles de partage
      const zoneP = document.getElementById("livre-partage");
      if (zoneP) {
        zoneP.querySelectorAll(".btn-partage").forEach((b) => {
          b.onclick = () => {
            const avec = Array.from(document.querySelectorAll(".chk-partage:checked")).map((c) => c.value);
            sauverPartageLivre(p.id, l.id, b.dataset.mode, avec);
            _rendreZoneLivret(); // re-render pour afficher/masquer les cases à cocher
          };
        });
        zoneP.querySelectorAll(".chk-partage").forEach((c) => {
          c.onchange = () => {
            const avec = Array.from(document.querySelectorAll(".chk-partage:checked")).map((x) => x.value);
            sauverPartageLivre(p.id, l.id, "joueurs", avec);
          };
        });
      }
    }
  }

  // Liste des livres d'un perso. Migre à la volée (sans écrire) l'ancien champ
  // mono-texte `livret` de thomas en un premier livre "Mon histoire" ; l'écriture
  // effective (et la suppression de `livret`) a lieu au premier _ecrireLivres.
  function livresDe(p) {
    if (Array.isArray(p.livres)) return p.livres;
    if (p.livret && p.livret.trim()) return [{ id: "lv-histoire", titre: "Mon histoire", texte: p.livret }];
    return [];
  }

  function _genLivreId() {
    return "lv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Suggestions de catégories pour la saisie : celles déjà utilisées par ce
  // perso d'abord (réutilisation en un clic), puis quelques valeurs par défaut.
  function _suggestionsCategories(p) {
    const base = ["Histoire", "Quête", "Journal", "Notes", "Lettres", "Sorts", "PNJ", "Lieux"];
    const utilisees = livresDe(p).map((l) => (l.categorie || "").trim()).filter(Boolean);
    return [...new Set([...utilisees, ...base])];
  }

  // Écrit le tableau de livres dans la fiche et absorbe l'ancien champ `livret`
  // (migration). Réservé au propriétaire : jamais câblé côté MJ.
  function _ecrireLivres(persoId, livres) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    p.livres = livres;
    delete p.livret;
    sauverPersos(persos);
  }

  function creerLivre(persoId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const livres = livresDe(p).slice();
    const nouveau = { id: _genLivreId(), titre: "Nouveau livre", texte: "", partage: "prive", partageAvec: [] };
    livres.push(nouveau);
    _ecrireLivres(persoId, livres);
    livreOuvertId = nouveau.id;
    livreOuvertPersoId = persoId;
    _rendreZoneLivret();
  }

  // Enregistre le mode de partage d'un livre (prive/joueurs/table) et, pour
  // "joueurs", la liste des prénoms destinataires. Réservé au propriétaire.
  function sauverPartageLivre(persoId, livreId, partage, partageAvec) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const livres = livresDe(p).slice();
    const l = livres.find((x) => x.id === livreId);
    if (!l) return;
    l.partage = partage;
    l.partageAvec = partage === "joueurs" ? (partageAvec || []) : [];
    _ecrireLivres(persoId, livres);
  }

  function sauverChampLivre(persoId, livreId, champ, val) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const livres = livresDe(p).slice();
    const l = livres.find((x) => x.id === livreId);
    if (!l) return;
    l[champ] = val;
    _ecrireLivres(persoId, livres);
  }

  function supprimerLivre(persoId, livreId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const livres = livresDe(p);
    const l = livres.find((x) => x.id === livreId);
    if (!confirm(`Supprimer le livre « ${l ? (l.titre || "Sans titre") : ""} » ?`)) return;
    _ecrireLivres(persoId, livres.filter((x) => x.id !== livreId));
    livreOuvertId = null;
    _rendreZoneLivret();
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
    // Pool générique de réactions (3/combat, cf. mecanique.reactionCout,
    // js/capacites.js) — ex. Guerrier "Fils du village". Affiché seulement
    // pendant un combat actif : hors combat, le pool n'a pas de sens.
    if (mecanique.reactionCout && typeof Combat !== "undefined" && Combat.estActif && Combat.estActif()) {
      const restantes = Capacites.reactionsRestantes(p);
      html += ` <span class="usage-cap">${restantes}/${Capacites.REACTIONS_MAX} réaction(s)</span>`;
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
      // Durée affichée : nombre de tours RESTANTS en direct (décompté à
      // chaque tour, cf. Capacites.decompterEtatsDebutTour côté PJ /
      // Carte.decompterEtatsMonstre côté monstre) plutôt que la formule de
      // départ figée — permet de suivre le debuff dans la durée, pas
      // seulement sa valeur initiale. Repli sur un mot-clé (permanent/fin de
      // combat) ou, en dernier recours, la formule brute si jamais résolue.
      const dr = e.dureeRestante;
      let dureeTxt;
      if (dr && typeof dr === "object") {
        if (typeof dr.tours === "number") dureeTxt = `${dr.tours} tour${dr.tours > 1 ? "s" : ""}`;
        else if (dr.motCle === "permanente") dureeTxt = "permanent";
        else if (dr.motCle === "finCombat") dureeTxt = "jusqu'à la fin du combat";
        else dureeTxt = dr.dureeAffichee;
      } else {
        dureeTxt = dr;
      }
      return `<span class="etat-actif">${libelle}${dureeTxt ? ` (${dureeTxt})` : ""}${e.source ? ` · ${e.source}` : ""} ` +
        `<button class="btn-retirer-etat" data-etat-idx="${idx}" title="Retirer cet état/bonus">✕</button></span>`;
    }).join(" ");
    return `<div class="carte"><h3>États actifs</h3><div class="etats-actifs-liste">${items}</div></div>`;
  }

  // Bouton "🎲 Lancer les dégâts" d'une capacité d'attaque vs DEF qui vient de
  // toucher (cf. capaciteDegatsEnAttente, wireCapacitesEtEtats) — masqué si
  // aucune résolution n'est en attente pour CE personnage, ou si l'attaque a
  // raté (auquel cas capaciteDegatsEnAttente est déjà remis à null, cf.
  // resoudreCapaciteEtRafraichir).
  function htmlDegatsCapaciteEnAttente(persoId) {
    if (!capaciteDegatsEnAttente || capaciteDegatsEnAttente.persoId !== persoId) return "";
    const r = capaciteDegatsEnAttente;
    const libelle = r.source.nomCap || "Capacité";
    const detail = r.critique ? "critique !" : r.defCible === null ? "DEF cible inconnue" : `touché, DEF ${r.defCible}`;
    return `<div class="capacite-degats-attente">
      <button class="btn petit or btn-lancer-degats-capacite">🎲 Lancer les dégâts — ${echapper(libelle)} (${detail})</button>
    </div>`;
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

  // Bloc "Actions du tour" (déplacement + action principale/secondaire),
  // visible sur la fiche vivante pendant un combat où ce PJ a rejoint
  // l'ordre d'initiative (cf. js/combat.js — Combat.ajusterDeplacement/
  // utiliserActionPrincipale/sprint/utiliserActionSecondaire). Remis à zéro
  // automatiquement au tour de ce PJ (Combat.tourSuivant) ; affiché à tout
  // moment du combat, pas seulement pendant son propre tour, comme le reste
  // des compteurs manuels de l'app (PV...).
  function htmlBlocActionsDuTour(persoId) {
    if (typeof Combat === "undefined" || !Combat.estActif()) return "";
    const entree = Combat.etatCourant().ordre.find((e) => e.type === "pj" && e.id === persoId);
    if (!entree) return "";
    const base = Combat.DEPLACEMENT_BASE || 5;
    // "fulgurantes" (bottes_vitesse, cf. lot "malgré la limite") : bouton
    // SANS coût d'action (contrairement à Sprint) — usage vérifié ici, pas
    // gaté par actionPrincipaleUtilisee.
    const p = chargerPersos()[persoId];
    const doubleDeplacementDispo = p && _itemDoubleDeplacementDisponible(p);
    // "vive"/"a_repetition"/"duelliste"/"tourbillonnante" (lot "armes A/B") :
    // même principe SANS coût d'action que "Doubler le déplacement" ci-dessus.
    const attaqueSupplementaireDispo = p && _itemAttaqueSupplementaireDisponible(p);
    return `<div class="carte">
      <h3 style="margin-top:0;">Actions du tour</h3>
      <div class="stats-rapides">
        <div class="stat-box">
          <div class="label">Déplacement</div>
          <div class="pv-control">
            <button id="bm-deplacement-moins">−</button>
            <span style="font-weight:700;">${entree.deplacementRestant}</span>
            <button id="bm-deplacement-plus">+</button>
          </div>
          <div style="font-size:0.7rem;color:#6a6278;">/ ${base} cases</div>
        </div>
        <div class="stat-box">
          <div class="label">Principale</div>
          <div class="valeur" style="font-size:0.85rem;">${entree.actionPrincipaleUtilisee ? "✅ utilisée" : "◻️ disponible"}</div>
        </div>
        <div class="stat-box">
          <div class="label">Secondaire</div>
          <div class="valeur" style="font-size:0.85rem;">${entree.actionSecondaireUtilisee ? "✅ utilisée" : "◻️ disponible"}</div>
        </div>
      </div>
      <div class="barre-actions" style="margin-top:6px;">
        ${!entree.actionPrincipaleUtilisee ? `<button class="btn petit secondaire" id="bm-sprint" title="Consomme l'action principale sans attaquer, contre +${Combat.SPRINT_BONUS || 2} cases">🏃 Sprint (+${Combat.SPRINT_BONUS || 2} cases)</button>` : ""}
        ${!entree.actionSecondaireUtilisee ? `<button class="btn petit secondaire" id="bm-action-secondaire" title="Boire une potion, utiliser un parchemin, relever un allié...">Action secondaire</button>` : ""}
        ${doubleDeplacementDispo ? `<button class="btn petit or" id="bm-double-deplacement" title="${echapper(doubleDeplacementDispo.it.nom)} : double le déplacement de ce tour, sans coût d'action">🥾 Doubler le déplacement</button>` : ""}
        ${attaqueSupplementaireDispo ? `<button class="btn petit or" id="bm-attaque-supplementaire" title="${echapper(attaqueSupplementaireDispo.it.nom)} : accorde une attaque supplémentaire ce tour, sans coût d'action">⚔️ Attaque supplémentaire</button>` : ""}
        <button class="btn petit secondaire" id="bm-reinit-actions" title="Réinitialise sans attendre le prochain tour (correction de table)">↺</button>
      </div>
    </div>`;
  }

  // Chance d'équipe (don Chanceux) : pool partagé (SyncStore), valeur de base
  // nb_joueurs/2 (arrondi à l'inférieur) tant que personne n'y a touché — dès
  // le premier ajustement manuel, la valeur stockée fait foi indéfiniment (pas
  // de recalcul ni de reset automatique).
  function chanceEquipe() {
    const v = SyncStore.get(STORAGE_CHANCE_EQUIPE);
    if (typeof v === "number") return v;
    return Math.floor(Object.keys(chargerPersos()).length / 2);
  }
  function ajusterChanceEquipe(delta) {
    SyncStore.set(STORAGE_CHANCE_EQUIPE, Math.max(0, chanceEquipe() + delta));
  }

  // Bloc "Chance" : ligne "Chance d'équipe" toujours visible (pool partagé, à
  // dépenser après concertation du groupe) + ligne "Chance personnelle"
  // seulement pour un joueur ayant le don Chanceux (cf. Personnage.aChanceux) —
  // ses 3 points à lui, dépensables sans discussion. Deux compteurs manuels
  // indépendants, aucun lien automatique entre les deux.
  function htmlBlocChance(p, perso) {
    const equipe = chanceEquipe();
    return `<div class="carte corruption-bloc">
      <h3 style="margin-top:0;">🍀 Chance</h3>
      <div class="corruption-ligne">
        <span>Chance d'équipe (usage collectif, à discuter)</span>
        <div class="corruption-control">
          <button data-chance-equipe-moins title="Dépenser un point de chance d'équipe">−</button>
          <span class="corruption-valeur">${equipe}</span>
          <button data-chance-equipe-plus title="Ajouter un point de chance d'équipe">+</button>
        </div>
      </div>
      ${perso.aChanceux() ? `
      <div class="corruption-ligne">
        <span>Chance personnelle (don Chanceux — dépensable sans concertation)</span>
        <div class="corruption-control">
          <button data-chance-perso-moins title="Dépenser un point de chance personnelle">−</button>
          <span class="corruption-valeur">${p.chancePersonnelle || 0}</span>
          <button data-chance-perso-plus title="Ajouter un point de chance personnelle">+</button>
        </div>
      </div>` : ""}
    </div>`;
  }

  // Bloc "Pierre de chance" (insistante/protectrice) — visible pour CE PJ
  // uniquement s'il porte l'objet ET qu'un jet relançable existe (cf.
  // dernierJetRelancable, posé par lancerTest) : rien à proposer sans les
  // deux. Le volet "transforme un critique subi en coup normal" de
  // "protectrice" n'a pas de bouton — automatique, cf. _itemAnnuleCritiqueDisponible/
  // _resoudreAttaqueEtSuite (comme "absorbant").
  function htmlBlocPierreChance(persoId, p) {
    const dispo = _itemRelanceDisponible(p);
    if (!dispo || !dernierJetRelancable || dernierJetRelancable.persoId !== persoId) return "";
    return `<div class="carte">
      <h3 style="margin-top:0;">🍀 ${echapper(dispo.it.nom)}</h3>
      <p class="aide" style="margin:0 0 6px;">Dernier jet : <strong>${echapper(dernierJetRelancable.label)}</strong> (${dernierJetRelancable.total}). Si tu l'estimes raté, tu peux le relancer.</p>
      <button class="btn petit or" data-relancer-jet="${echapper(persoId)}">🍀 Relancer ce jet</button>
    </div>`;
  }

  // Bloc "Disparition" (cape_brume.evanescente, cf. lot "malgré la limite") :
  // visible pour CE PJ uniquement s'il porte l'objet ET dispose encore d'un
  // usage — même patron que htmlBlocPierreChance (action à la demande, pas
  // liée à une fenêtre de réaction). Pas de bouton pour le volet "+1/+2 DEF
  // contre la première attaque" (cf. note sur la mecanique) — laissé à
  // l'arbitrage manuel, même limite qu'"insaisissable".
  function htmlBlocDisparition(persoId, p) {
    const dispo = _itemDisparitionDisponible(p);
    if (!dispo) return "";
    return `<div class="carte">
      <h3 style="margin-top:0;">🌫️ ${echapper(dispo.it.nom)}</h3>
      <p class="aide" style="margin:0 0 6px;">Disparaît de la vue (Discrétion totale) pendant 1 tour.</p>
      <button class="btn petit or" data-disparaitre="${echapper(persoId)}">🌫️ Disparaître</button>
    </div>`;
  }

  // Adversaires (tokens monstres) actuellement à `rayon` cases ou moins de
  // `persoId` sur la scène dd2vtt active (défaut 1 = adjacent, cf.
  // Carte.distanceCasesEntre) — même infra que Personnage.bonusDefDuel
  // (Combattant en duel), réutilisée ici pour l'attaque d'opportunité (cf.
  // htmlBlocDesengagement/tenterDesengagement) et, avec un rayon élargi à 3
  // cases (~6 m, conversion déjà utilisée pour Mobile/Grâce féline), pour le
  // Bastion improvisé du Guerrier (Voie de l'ingénieur rang 5).
  function _ennemisAdjacents(persoId, rayon) {
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeMonstresCombat || !Carte.distanceCasesEntre) return [];
    const monToken = Carte.tokenIdPourPerso(persoId);
    if (!monToken) return [];
    const r = rayon || 1;
    return (Carte.listeMonstresCombat() || []).filter((m) => {
      // Exclut les invocations (m.invocateur) : Carte.listeMonstresCombat()
      // regroupe monstres du bestiaire ET invocations de joueurs (nécessaire
      // pour l'ordre d'initiative, cf. Carte.tokensMonstres), mais une
      // invocation (zombie, compagnon animal, Barricade improvisée du
      // Guerrier lui-même...) n'est jamais un adversaire valide pour une
      // attaque d'opportunité — sans ce filtre, le Bastion improvisé (rayon
      // élargi à 3 cases) déclenchait le bouton contre la propre barricade
      // du Guerrier qui la pose juste à côté de lui.
      if (m.invocateur) return false;
      const d = Carte.distanceCasesEntre(monToken, m.id);
      return d !== null && d <= r;
    });
  }

  // Bloc "Désengagement" (homebrew, attaque d'opportunité) — visible en combat
  // sur une scène dd2vtt uniquement (seule source d'adjacence de l'app). Le
  // jet de Force (poussée) et sa résolution se font au clic du bouton, cf.
  // tenterDesengagement dans wireCapacitesEtEtats : pas de pré-calcul ici.
  function htmlBlocDesengagement() {
    if (typeof Combat === "undefined" || !Combat.estActif() || typeof Carte === "undefined" || !Carte.distanceCasesEntre) return "";
    return `<div class="carte">
      <h3 style="margin-top:0;">🏃 Désengagement</h3>
      <p class="aide" style="margin:0 0 6px;">Si tu t'éloignes de plus d'une case d'un adversaire adjacent sans te désengager, il obtient une attaque d'opportunité. Pousse-le (jet de FOR vs sa DEF) pour partir sans risque.</p>
      <button class="btn petit secondaire" data-desengager style="width:100%;">🏃 Tenter de se désengager</button>
    </div>`;
  }

  // Bloc "Attaque d'opportunité" (homebrew, dons Sentinelle/Expert en hast) :
  // même trigger manuel que le désengagement (pas de détection de mouvement),
  // mais dans l'autre sens — CE perso attaque un adversaire adjacent qui
  // tente de fuir (Sentinelle, inconditionnel) ou vient d'entrer à son
  // contact (Expert en hast, seulement avec une arme d'allonge qualifiante,
  // cf. Personnage.aExpertHastQualifie). Résolution identique dans les deux
  // cas (une attaque de contact bonus), donc un seul bouton/handler partagé.
  // `p` (perso brut, optionnel) : sert à détecter le marqueur Bastion
  // improvisé (p.bastionActifFinCombat, cf. Capacites.lancer/js/combat.js
  // terminerCombat) — Guerrier, Voie de l'ingénieur rang 5 : élargit le rayon
  // de déclenchement de 1 (adjacent, Sentinelle/Expert en hast) à 3 cases
  // (~6 m, la zone du Bastion), sans dupliquer le bouton/handler existant.
  function htmlBlocAttaqueOpportunite(perso, p) {
    if (typeof Combat === "undefined" || !Combat.estActif() || typeof Carte === "undefined" || !Carte.distanceCasesEntre) return "";
    const aBastion = !!(p && p.bastionActifFinCombat);
    if (!perso.aSentinelle() && !perso.aExpertHastQualifie() && !aBastion) return "";
    const aide = aBastion
      ? "Quand un adversaire adjacent tente de fuir ou vient d'entrer à ton contact, OU quand un monstre pénètre ta zone de Bastion improvisé (~3 cases) : déclenche ton attaque bonus (jet de contact normal vs sa DEF)."
      : "Quand un adversaire adjacent tente de fuir ou vient d'entrer à ton contact : déclenche ton attaque bonus (jet de contact normal vs sa DEF).";
    return `<div class="carte">
      <h3 style="margin-top:0;">⚔️ Attaque d'opportunité</h3>
      <p class="aide" style="margin:0 0 6px;">${aide}</p>
      <button class="btn petit secondaire" data-attaque-opportunite style="width:100%;">⚔️ Attaque d'opportunité</button>
    </div>`;
  }

  // Bloc "Corruption" — deux jauges distinctes cohabitant sur la même carte :
  // - "Jauge de combat" (corruptionCombat) : mécanique de classe Voie du
  //   chaos (opt-in, cf. Personnage.aVoieChaosActive), auto-incrémentée par
  //   Capacites.lancer() (rang.mecanique.corruption) pour les capacités au
  //   gain univoque ; +/- manuels ici pour les déclencheurs passifs non
  //   automatisables et les corrections de table. Éditable par le joueur
  //   comme avant, inchangé.
  // - "Corruption d'Âme" (corruptionMajeure) : depuis le 28/07/2026, jauge
  //   GÉNÉRALE ouverte à tout PJ (exposition à la Cupidité ou à d'autres
  //   aspects du Chaos rencontrés en jeu, pas seulement la Voie du chaos).
  //   Gain/perte reste une décision manuelle et narrative du MJ (validé avec
  //   Thomas) : les boutons +/- de cette ligne ne s'affichent qu'au MJ, le
  //   joueur ne voit que la valeur. Ne se réinitialise jamais, y compris
  //   après combat. Le franchissement d'un palier reste géré par l'onglet
  //   🧬 Mutations (déjà générique, aucun changement requis là-bas).
  // Le bloc entier s'affiche si : la Voie du chaos est active (comme avant),
  // OU l'utilisateur courant est le MJ (pour pouvoir fixer la CA de
  // n'importe quel PJ), OU corruptionMajeure > 0 (le joueur voit sa jauge
  // une fois touché) — un PJ classique à CA 0 ne voit donc rien de plus.
  // Bloc "Fenêtre de réaction" (prototype Contresort, cf. js/reactions.js) —
  // visible pour CE PJ uniquement s'il fait partie des répondants de la
  // fenêtre actuellement ouverte, et tant qu'elle n'a reçu aucune réponse.
  // PAS gaté par peutAgir (contrairement à htmlBlocDesengagement/
  // AttaqueOpportunite) : une réaction se déclenche par définition hors de
  // son propre tour. Rendu dans la fiche complète ET la sidebar battlemap
  // (mêmes deux surfaces que htmlBlocChance/Corruption) — pas dans le dock,
  // trop compact pour porter ce niveau de détail. Deux évènements partagent
  // ce bloc (evenement discriminant le texte/bouton) : "sortLance" (Contresort)
  // et "subitAttaque" (Bouclier arcanique, cf. extension §A).
  function htmlBlocFenetreReaction(persoId, p) {
    if (typeof Reactions === "undefined") return "";
    const e = Reactions.etat();
    if (!e || e.reponse || !e.repondants.includes(persoId) || Reactions.estExpiree(e)) return "";
    const secondes = Math.ceil(Reactions.msRestantes(e) / 1000);
    const estAttaque = e.evenement === "subitAttaque";
    const estCible = estAttaque && persoId === e.cible.persoId;
    const texte = !estAttaque
      ? `${echapper(e.source.nom)} lance <strong>${echapper(e.sort.nom)}</strong> (rang ${e.sort.rang}, ${echapper(e.sort.ecole)}) — <span id="reaction-compte-a-rebours">${secondes}</span> s pour réagir.`
      : estCible
      ? `Tu es visé(e) par une attaque (<strong>${echapper(e.attaque.label)}</strong>) — <span id="reaction-compte-a-rebours">${secondes}</span> s pour réagir.`
      // "muraille" (cf. bouclier_tour) : un allié adjacent à la cible voit ce
      // même bloc, avec un texte et un bouton distincts (Intercepter) — il
      // n'est jamais lui-même éligible à Bouclier arcanique/Esquive.
      : `${echapper((chargerPersos()[e.cible.persoId] || {}).nom || "Un allié")} est visé(e) par une attaque (<strong>${echapper(e.attaque.label)}</strong>) — tu peux t'interposer, <span id="reaction-compte-a-rebours">${secondes}</span> s pour réagir.`;
    // Boutons dynamiques (cf. lots "subitAttaque : esquive/réduction" et
    // "reflechissant/muraille") : contrairement à l'ancien Contresort (un seul
    // répondant possible), ces fenêtres peuvent offrir PLUSIEURS réponses
    // indépendantes à PLUSIEURS répondants différents — chaque bouton affiché
    // seulement s'il est réellement disponible à cet instant, pour CE PJ précis.
    let boutonsAction;
    if (estAttaque) {
      boutonsAction = "";
      if (estCible) {
        if (_peutBouclierArcanique(p)) {
          boutonsAction += `<button class="btn petit or" data-reaction-action="bouclier_arcanique" data-reaction-persoid="${echapper(persoId)}">🛡️ Bouclier arcanique</button>`;
        }
        const esquive = _itemEsquiveDisponible(p, e.attaque.contact);
        if (esquive) {
          boutonsAction += `<button class="btn petit or" data-reaction-action="esquive" data-reaction-persoid="${echapper(persoId)}">💨 Esquive (${echapper(esquive.it.nom)})</button>`;
        }
      } else {
        const interception = _itemInterceptionDisponible(p);
        if (interception) {
          boutonsAction += `<button class="btn petit or" data-reaction-action="intercepte" data-reaction-persoid="${echapper(persoId)}">🛡️ Intercepter (${echapper(interception.it.nom)})</button>`;
        }
      }
    } else {
      // Dynamique aussi (cf. lot "reflechissant") : Contresort n'est plus le
      // seul répondant possible — la cible du sort peut aussi renvoyer via un
      // objet équipé (bouclier_miroir), indépendamment de Contresort.
      boutonsAction = "";
      if (_peutContresort(persoId, p, e.source.id)) {
        boutonsAction += `<button class="btn petit or" data-reaction-action="contresort" data-reaction-persoid="${echapper(persoId)}">🛡️ Contresort</button>`;
      }
      if (persoId === e.pjId) {
        const reflet = _itemReflechissantDisponible(p);
        if (reflet) {
          boutonsAction += `<button class="btn petit or" data-reaction-action="reflechissant" data-reaction-persoid="${echapper(persoId)}">🪞 Renvoyer (${echapper(reflet.it.nom)})</button>`;
        }
      }
    }
    return `<div class="carte" style="border:2px solid var(--or);">
      <h3 style="margin-top:0;">⚡ Fenêtre de réaction</h3>
      <p class="aide" style="margin:0 0 6px;">${texte}</p>
      <div class="barre-actions">
        ${boutonsAction}
        <button class="btn petit secondaire" data-reaction-action="passe" data-reaction-persoid="${echapper(persoId)}">Passer</button>
      </div>
    </div>`;
  }

  function htmlBlocCorruption(p, perso) {
    const aChaos = perso.aVoieChaosActive();
    const majeure = p.corruptionMajeure || 0;
    const estMJ = role === "mj";
    // Toujours affichée, même à 0 — sinon la ligne "Corruption d'Âme" disparaît
    // du point de vue joueur dès qu'elle retombe à 0 (ex. purification), sans
    // aucun moyen de constater son existence ni de la faire remonter plus tard
    // (seul le MJ a les boutons +/-, cf. plus bas).
    const afficherJaugeCombat = aChaos && typeof Capacites !== "undefined";
    const combat = p.corruptionCombat || 0;
    const seuil = (typeof Capacites !== "undefined" && Capacites.SEUIL_CORRUPTION_MAJEURE) || 6;
    return `<div class="carte corruption-bloc">
      <h3 style="margin-top:0;">☣ Corruption</h3>
      ${afficherJaugeCombat ? `<div class="corruption-ligne">
        <span>Jauge de combat</span>
        <div class="corruption-control">
          <button data-corruption-moins="combat" title="Diminuer">−</button>
          <span class="corruption-valeur${combat > seuil ? " corruption-danger" : ""}">${combat}/${seuil}</span>
          <button data-corruption-plus="combat" title="Augmenter">+</button>
        </div>
      </div>` : ""}
      <div class="corruption-ligne">
        <span>Corruption d'Âme</span>
        <div class="corruption-control">
          ${estMJ ? `<button data-corruption-moins="majeure" title="Diminuer">−</button>` : ""}
          <span class="corruption-valeur${majeure > 0 ? " corruption-danger" : ""}">${majeure}</span>
          ${estMJ ? `<button data-corruption-plus="majeure" title="Augmenter">+</button>` : ""}
        </div>
      </div>
      ${aChaos && majeure >= 5 ? `<p class="aide" style="margin:6px 0 0;">⚠️ Dès Corruption d'Âme 5+ : le rang 4 « Voie du chaos » se débloque (contrepartie incluse).</p>` : ""}
      ${!estMJ && !aChaos ? `<p class="aide" style="margin:6px 0 0;">Cette jauge évolue uniquement à la discrétion du MJ.</p>` : ""}
    </div>`;
  }

  // Compteur de doubles illusoires actifs (Enchanteur, "Image décalée") —
  // visible seulement pour un enchanteur ayant pris cette capacité (cf.
  // Personnage.aImageDecalee). +1 à chaque nouveau lancer, −1 quand un double
  // "meurt" (consommé pour faire rater une attaque contre l'Enchanteur).
  function htmlBlocIllusions(p, perso) {
    if (!perso.aImageDecalee()) return "";
    const n = p.illusionsActives || 0;
    return `<div class="carte corruption-bloc">
      <h3 style="margin-top:0;">🪞 Illusions actives</h3>
      <div class="corruption-ligne">
        <span>Doubles illusoires (Image décalée)</span>
        <div class="corruption-control">
          <button data-illusions-moins title="Retirer (consommée par une attaque)">−</button>
          <span class="corruption-valeur">${n}</span>
          <button data-illusions-plus title="Ajouter (nouveau lancer)">+</button>
        </div>
      </div>
    </div>`;
  }

  // Compteur d'âmes capturées (Nécromancien, Voie des âmes) — visible pour un
  // nécromancien ayant pris "Capture d'âme" (cf. Personnage.aCaptureAme).
  // +1 à la capture d'une âme, −1 à la dépense (Libération vengeresse) ou à
  // sa dissipation. Le réceptacle est normalement limité à 3 âmes ("Savoir
  // volé" plafonne son propre bonus à +3) — pas de blocage dur ici, le rang 5
  // "Moisson d'âmes" peut temporairement dépasser cette limite.
  function htmlBlocAmes(p, perso) {
    if (!perso.aCaptureAme()) return "";
    const n = p.amesCapturees || 0;
    const aSavoirVole = !!perso.capaciteEntree("Voie des âmes", 4);
    const bonusSavoir = Math.min(n, 3);
    return `<div class="carte corruption-bloc">
      <h3 style="margin-top:0;">💀 Âmes capturées</h3>
      <div class="corruption-ligne">
        <span>Réceptacle (max 3)${aSavoirVole ? ` — Savoir volé : +${bonusSavoir} à un test d'INT` : ""}</span>
        <div class="corruption-control">
          <button data-ames-moins title="Dépenser une âme (Libération vengeresse) ou la retirer">−</button>
          <span class="corruption-valeur">${n}</span>
          <button data-ames-plus title="Capturer une âme (Capture d'âme)">+</button>
        </div>
      </div>
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

  // Dons acquis (p.dons, cf. data/dons.js) — bonus descriptifs appliqués
  // manuellement par le joueur, comme les capacités textuelles ci-dessus.
  function htmlDons(p) {
    const ids = p.dons || [];
    if (!ids.length) return `<div class="vide">Aucun don acquis.</div>`;
    return ids.map((id) => {
      const don = (typeof DONS !== "undefined") && DONS.find((d) => d.id === id);
      if (!don) return "";
      let choixLabel = "";
      const choixCarac = id === "amelioration_carac" && p.donsChoix && p.donsChoix.amelioration_carac;
      if (choixCarac && choixCarac.length) choixLabel = ` — <strong>Choix : +1 ${choixCarac.join(", +1 ")}</strong>`;
      else if (id === "athlete" && p.donsChoix && p.donsChoix.athlete) choixLabel = ` — <strong>Choix : +1 ${p.donsChoix.athlete}</strong>`;
      return `<div class="cap-fiche"><div class="titre-cap">${don.nom}</div><div class="effet-cap">${don.effet}${choixLabel}</div></div>`;
    }).join("");
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
    // Prêtre — Voie du chaos rang 2/3 (Don corrompu/Supplément corrompu) :
    // options de paiement en CS, affichées seulement si le personnage a le
    // rang concerné (cf. procederCiblage ci-dessous pour la visibilité
    // conditionnelle au coût réel de la capacité lancée).
    const perso = Personnage.depuisJSON(p);
    const optionPayerCS = racine.querySelector(".option-payer-cs");
    const checkPayerCS = racine.querySelector(".check-payer-cs");
    const optionSupplementCS = racine.querySelector(".option-supplement-cs");
    const checkSupplementCS = racine.querySelector(".check-supplement-cs");
    let lancerCapaciteEnAttente = null;

    function fermerPickerCibleCapacite() {
      if (pickerForme) pickerForme.style.display = "none";
      // Reset du <select multiple> (cf. Bénédiction "soin_partage" ci-dessous)
      // pour ne jamais laisser un picker en mode multi-sélection pour la
      // capacité suivante.
      if (pickerSelect) { pickerSelect.multiple = false; pickerSelect.size = 1; }
      // Reset des options CS (Prêtre — Voie du chaos rang 2/3) pour ne jamais
      // laisser une case cochée/visible pour la capacité suivante.
      if (optionPayerCS) optionPayerCS.style.display = "none";
      if (checkPayerCS) checkPayerCS.checked = false;
      if (optionSupplementCS) optionSupplementCS.style.display = "none";
      if (checkSupplementCS) checkSupplementCS.checked = false;
      lancerCapaciteEnAttente = null;
      if (typeof Carte !== "undefined" && Carte.desactiverModeCiblage) Carte.desactiverModeCiblage();
    }
    // cibleIds (optionnel) : Prêtre — Voie de la guérison rang 4 "Bénédiction",
    // choix "soin_partage" (jusqu'à 3 cibles indépendantes) ; règle générale
    // zone/ligne automatisée (cf. _armerCiblageCarteZoneAuto) — deux cas hors
    // du schéma standard "une seule cible via cibleId", cf. Capacites.lancer.
    // cerclesParCible (optionnel) : { cibleId: numéroDeCercle }, fourni par
    // _armerCiblageCarteZoneAuto pour la pondération 100/75/50% des zones
    // circulaires — ignoré par Capacites.lancer pour tout le reste.
    function resoudreCapaciteEtRafraichir(cibleId, cibleIds, cerclesParCible) {
      const mecaniqueLancee = lancerCapaciteEnAttente.mecanique;
      const sourceLancee = lancerCapaciteEnAttente.source;
      const res = Capacites.lancer({
        persoId: id,
        source: sourceLancee,
        mecanique: mecaniqueLancee,
        cibleId,
        cibleIds,
        cerclesParCible,
        choixEffet: lancerCapaciteEnAttente.choixEffet,
        payerEnCS: !!(checkPayerCS && checkPayerCS.checked),
        payerSupplementCS: !!(checkSupplementCS && checkSupplementCS.checked),
      });
      fermerPickerCibleCapacite();
      toast(res.messages.join(" · "));
      // Prêtre — Cercle de Vie, sort "Résurrection" (Grimoire, rang 5) : au-delà
      // du soin générique (1d6 PV, déjà résolu par Capacites.lancer ci-dessus
      // via le canal "soin" standard, qui ne touche que pvActuel), lève aussi
      // l'état Mort de la cible (etatMort/mortSucces/mortEchecs) — sans quoi
      // le personnage resterait affiché "Mort" malgré ses PV retrouvés, le
      // moteur générique de soin n'ayant aucune notion de "ramène un mort"
      // propre à ce sort précis. Même mécanique que reanimerAllie (objet de
      // réanimation), appliquée ici après un cast réussi. Identifié par
      // idSort plutôt que voie+rang depuis que Résurrection a rejoint le
      // Grimoire (cf. prompt_pretre_cercle_vie.md) — "Miracle" (même rang 5)
      // reste un wildcard narratif, volontairement exclu de ce déclenchement.
      if (res.ok && cibleId && mecaniqueLancee.cible === "allie" && sourceLancee.idSort === "resurrection") {
        const persosApresSoin = chargerPersos();
        const cibleResurrection = persosApresSoin[cibleId];
        if (cibleResurrection && cibleResurrection.etatMort) {
          cibleResurrection.etatMort = false;
          cibleResurrection.mortSucces = 0;
          cibleResurrection.mortEchecs = 0;
          sauverPersos(persosApresSoin);
        }
      }
      // Barde "Note discordante"/"Chant brisant" (et toute future capacité de
      // zone/attaque à bonus) ciblant un MONSTRE : Capacites.lancer ne stocke
      // rien pour lui (cf. appliquerBonusSurPerso, PJ uniquement) — reproduit
      // ici l'équivalent côté app.js (cf. _appliquerBonusMonstreDepuisMessages),
      // pour que le debuff soit réellement suivi (DEF/attaque ajustées, durée
      // en tours) sur la fiche monstre plutôt que laissé purement narratif.
      if (res.ok && cibleId && (mecaniqueLancee.cible === "ennemi" || mecaniqueLancee.cible === "zone")) {
        const cibleMonstre = Capacites.listeCibles(id).find((c) => c.id === cibleId && c.genre === "monstre");
        if (cibleMonstre) {
          _appliquerBonusMonstreDepuisMessages(res.messages, cibleMonstre.id, Personnage.depuisJSON(p), sourceLancee.nomCap || "Capacité");
        }
      }
      // Consomme l'action principale du tour en combat (no-op hors combat) —
      // "compétence" est l'autre exemple type d'action principale. Une
      // réaction (mecanique.reactionCout, ex. Guerrier "Fils du village") ne
      // consomme jamais l'action principale : par définition, une réaction se
      // déclenche hors de son propre tour, sur une autre économie (le pool de
      // réactions), jamais sur celle du tour en cours.
      if (!mecaniqueLancee.reactionCout && typeof Combat !== "undefined" && Combat.utiliserActionPrincipale) {
        Combat.utiliserActionPrincipale(id);
      }
      // mecanique.actionBonus (champ générique, ex. Barde "Enchaînement") :
      // la capacité ACCORDE une action principale bonus plutôt que d'en
      // consommer une — annule immédiatement la consommation ci-dessus.
      // Cible du bonus : le lanceur lui-même par défaut (Enchaînement, cible
      // "soi"), OU l'allié choisi si mecanique.cible === "allie" (Chevalier —
      // Voie du commandant rang 4 : donne une action principale à un allié).
      if (mecaniqueLancee.actionBonus && typeof Combat !== "undefined" && Combat.accorderActionPrincipaleBonus) {
        const cibleActionBonus = (mecaniqueLancee.cible === "allie" && cibleId) ? cibleId : id;
        Combat.accorderActionPrincipaleBonus(cibleActionBonus);
      }
      // Capacité d'attaque vs DEF (cf. Capacites.lancer/resolutionDegats) qui
      // touche (ou dont la DEF cible est inconnue, donc pas bloquée) ET a
      // effectivement des dégâts/états à résoudre : garde l'état en attente
      // pour afficher le bouton "Lancer les dégâts" au prochain rendu. Un
      // raté (touche === false) ou un jetOppose hors DEF (resolutionDegats
      // null) efface tout état résiduel d'une capacité précédente non résolue.
      const rd = res.resolutionDegats;
      const aEffetsDifferes = rd && (rd.mecanique.effets || []).some((e) => e.type === "degats" || e.type === "etat" || e.differe);
      capaciteDegatsEnAttente = (rd && rd.touche !== false && aEffetsDifferes)
        ? Object.assign({ persoId: id }, rd)
        : null;
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
        } else if (d.lancerOrigine === "grimoire") {
          // Sort connu hors Voies (cf. reference_sorts_connus.md,
          // SORTS_PAR_CLASSE, data/donnees.js) — cloné pour poser
          // origineGrimoire sans muter l'entrée partagée. source.idSort : lu
          // par le gate dans Capacites.lancer() (mecanique.origineGrimoire).
          const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? SORTS_PAR_CLASSE[p.classe] : null;
          const sort = catalogue ? catalogue.find((s) => s.id === d.lancerCle) : null;
          if (sort) {
            mecanique = Object.assign({}, sort.mecanique, { origineGrimoire: true });
            source.idSort = sort.id;
          }
        }
        if (!mecanique) { toast("Capacité introuvable."); return; }

        function procederCiblage() {
          // Prêtre — Voie du chaos rang 2 "Don corrompu"/rang 3 "Supplément
          // corrompu" : cases à cocher affichées seulement si le personnage a
          // le rang concerné ET que la capacité lancée a un coût auquel la
          // substitution s'applique (coutPP pour Don corrompu, un des 4
          // coutPointsX pour Supplément corrompu).
          if (optionPayerCS) {
            optionPayerCS.style.display = (perso.classe === "pretre" && perso.estChoisie("Voie du chaos", 2) && mecanique.coutPP) ? "" : "none";
          }
          if (optionSupplementCS) {
            const aCoutCercle = mecanique.coutPointsBenediction || mecanique.coutPointsConviction || mecanique.coutPointsBannissement || mecanique.coutPointsJugement;
            optionSupplementCS.style.display = (perso.classe === "pretre" && perso.estChoisie("Voie du chaos", 3) && aCoutCercle) ? "" : "none";
          }
          // Prêtre — Cercle de Vie, sort "Soins divins", choix "trois_cibles" :
          // jusqu'à 3 cibles indépendantes plutôt qu'une seule — réutilise
          // pickerSelect en <select multiple> (aucun nouveau composant), même
          // mécanisme que l'ancienne Bénédiction/"soin_partage" (cf.
          // prompt_pretre_cercle_vie.md Partie 6).
          const troisCibles = mecanique.cible === "allie" && lancerCapaciteEnAttente.choixEffet === "trois_cibles";
          pickerSelect.multiple = troisCibles;
          pickerSelect.size = troisCibles ? 5 : 1;
          if (mecanique.cible === "allie" || mecanique.cible === "ennemi") {
            const cibles = Capacites.listeCibles(id).filter((cc) =>
              mecanique.cible === "allie" ? cc.genre === "perso" : cc.genre === "monstre"
            );
            pickerSelect.innerHTML = cibles.length
              ? cibles.map((cc) => `<option value="${cc.id}">${echapper(cc.nom)}${cc.soi ? " (soi-même)" : ""}</option>`).join("")
              : `<option value="">Aucune cible disponible</option>`;
            if (troisCibles) toast("Sélectionne jusqu'à 3 alliés (Ctrl/Cmd + clic).");
            pickerForme.style.display = "flex";
          } else if (mecanique.cible === "zone" && (mecanique.jetOppose || mecanique.portee)
              && (_zoneCibleHostile(mecanique) || mecanique.cibleZoneHostile)
              && (mecanique.effets || []).some((e) => e.type === "degats" && e.formule)
              && typeof Carte !== "undefined" && Carte.jetonsEnZoneCombat) {
            // Règle générale "zone/ligne automatisée" (battlemap dd2vtt
            // uniquement, cf. js/carte.js jetonsEnZoneCombat/jetonsSurLigneCombat) :
            // pour une capacité hostile en zone (circulaire OU ligne, cf.
            // mecanique.zone.forme) avec un effet degats chiffré, un clic sur
            // la carte choisit directement le CENTRE (zone) ou la CASE VISÉE
            // (ligne) et l'app calcule elle-même TOUTES les cibles touchées —
            // plus besoin de relancer manuellement cible par cible (cf.
            // branche suivante, conservée comme repli pour tout le reste :
            // zones alliées, effets non chiffrés, worldmap sans battlemap
            // dd2vtt actif...). Carte.jetonsEnZoneCombat/jetonsSurLigneCombat
            // renvoient [] hors battlemap dd2vtt — dans ce cas la présence
            // même de Carte.jetonsEnZoneCombat ne suffit pas à garantir un
            // résultat, géré côté _armerCiblageCarteZoneAuto (toast "Aucune
            // cible touchée" plutôt qu'un blocage silencieux).
            const cibles = Capacites.listeCibles(id).filter((cc) => cc.genre === "monstre");
            pickerSelect.innerHTML = cibles.length
              ? cibles.map((cc) => `<option value="${cc.id}">${echapper(cc.nom)}</option>`).join("")
              : `<option value="">Aucune cible disponible</option>`;
            pickerForme.style.display = "flex";
            _armerCiblageCarteZoneAuto(id, mecanique, cibles, pickerSelect);
          } else if (mecanique.cible === "zone" && (mecanique.jetOppose || mecanique.portee) && (_zoneCibleHostile(mecanique) || mecanique.cibleZoneHostile)) {
            // Capacité de zone HOSTILE (cf. _zoneCibleHostile) avec une portée
            // définie — AVEC jet opposé (ex. Barde "Mélopée de la Folie"/
            // "Requiem du silence") OU sans (ex. Barde "Chant brisant",
            // Magicien "Cataclysme élémentaire", un debuff/AOE de zone pur) :
            // le moteur ne cible jamais automatiquement toute une zone à la
            // fois (même limite que les zones à bonus alliées, ex. Cri du
            // rassemblement — "à appliquer manuellement allié par allié"),
            // mais on permet ici de choisir UN monstre de la zone (via le
            // sélecteur carte, avec aperçu de zone au survol — cf.
            // _armerCiblageCarte/mecanique.zone) pour que le jet vs DEF se
            // résolve automatiquement contre lui s'il y en a un (cibleId
            // ignoré sans effet si jetOppose est absent, cf. Capacites.lancer)
            // ; relancer pour la cible suivante. Les zones alliées (Rempart
            // vivant, Sanctuaire du gardien...) restent sur la résolution
            // immédiate ci-dessous : un picker de monstres n'aurait aucun sens
            // pour prévisualiser qui serait affecté.
            const cibles = Capacites.listeCibles(id).filter((cc) => cc.genre === "monstre");
            pickerSelect.innerHTML = cibles.length
              ? cibles.map((cc) => `<option value="${cc.id}">${echapper(cc.nom)}</option>`).join("")
              : `<option value="">Aucune cible disponible</option>`;
            pickerForme.style.display = "flex";
            _armerCiblageCarte(id, mecanique, cibles, pickerSelect);
          } else {
            resoudreCapaciteEtRafraichir(null);
          }
        }

        lancerCapaciteEnAttente = { source, mecanique };
        // Effet à choix d'activation (ex. Barde Voie de l'alcoolisme : quelle
        // caractéristique boostée ; Nécromancien Toucher flétrissant : attaque
        // ou DEF pénalisée) — distinct du choix fixé à l'acquisition
        // (CAPACITES_A_CHOIX/RACE_CAPACITES_A_CHOIX), redemandé à chaque lancer
        // puisqu'il peut varier d'une utilisation à l'autre. Réutilise le même
        // modal générique que les choix d'acquisition (ouvrirModalChoixCapacite).
        // e.choix seul suffit (pas besoin de e.cible === "choix", qui ne
        // concerne que la substitution de cible des effets "bonus", cf.
        // resoudreEffet) : un effet "etat" comme Poing élémentaire (Moine)
        // peut aussi porter un choix d'activation sans passer par ce chemin.
        const effetChoix = (mecanique.effets || []).find((e) => e.choix);
        if (effetChoix) {
          ouvrirModalChoixCapacite(effetChoix.choix, (valeurChoisie) => {
            lancerCapaciteEnAttente.choixEffet = valeurChoisie;
            procederCiblage();
          });
        } else {
          procederCiblage();
        }
      };
    });
    const btnConfirmerCible = racine.querySelector(".btn-confirmer-cible-capacite");
    const btnAnnulerCible = racine.querySelector(".btn-annuler-cible-capacite");
    if (btnConfirmerCible) {
      btnConfirmerCible.onclick = () => {
        if (pickerSelect.multiple) {
          const ids = Array.from(pickerSelect.selectedOptions).map((o) => o.value).filter(Boolean).slice(0, 3);
          if (!ids.length) { toast("Choisis au moins un allié."); return; }
          resoudreCapaciteEtRafraichir(null, ids);
          return;
        }
        const cibleId = pickerSelect.value;
        if (!cibleId) { toast("Choisis une cible."); return; }
        resoudreCapaciteEtRafraichir(cibleId);
      };
    }
    // Après Annuler, redemande un rendu (rafraichir) : sur la battlemap, ça
    // réarme le mode de ciblage carte pour les attaques rapides (cf.
    // rendreFicheSidebarBattlemap), coupé par fermerPickerCibleCapacite ci-dessus.
    if (btnAnnulerCible) btnAnnulerCible.onclick = () => { fermerPickerCibleCapacite(); rafraichir(); };

    // Résolution différée des dégâts/états d'une capacité d'attaque vs DEF qui
    // a touché (cf. capaciteDegatsEnAttente/htmlDegatsCapaciteEnAttente).
    racine.querySelectorAll(".btn-lancer-degats-capacite").forEach((el) => {
      el.onclick = () => {
        if (!capaciteDegatsEnAttente || capaciteDegatsEnAttente.persoId !== id) return;
        const res = Capacites.resoudreDegatsEnAttente(capaciteDegatsEnAttente);
        // Barde "Note discordante" (bonus différé, cf. differe:true) ciblant
        // un MONSTRE : même application manuelle que dans
        // resoudreCapaciteEtRafraichir ci-dessus, mais ici pour un effet
        // résolu seulement APRÈS confirmation du toucher (le message "Bonus"
        // n'existe qu'à ce moment-là, pas au moment du jet d'attaque).
        const cibleDeg = capaciteDegatsEnAttente.cible;
        if (res.ok && cibleDeg && cibleDeg.genre === "monstre") {
          const pLanceur = chargerPersos()[capaciteDegatsEnAttente.persoId];
          _appliquerBonusMonstreDepuisMessages(res.messages, cibleDeg.id,
            pLanceur ? Personnage.depuisJSON(pLanceur) : null,
            (capaciteDegatsEnAttente.source && capaciteDegatsEnAttente.source.nomCap) || "Capacité");
        }
        capaciteDegatsEnAttente = null;
        toast(res.messages.length ? res.messages.join(" · ") : "Aucun dégât à résoudre.");
        rafraichir();
        if (racine.id === "zone-fiche-active") allerVers("des");
      };
    });

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
    // Compteur d'Illusions actives (cf. htmlBlocIllusions) — +1 à chaque
    // nouveau lancer d'Image décalée, −1 quand un double est consommé.
    racine.querySelectorAll("[data-illusions-plus]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        pp.illusionsActives = (pp.illusionsActives || 0) + 1;
        sauverPersos(persos);
        rafraichir();
      };
    });
    racine.querySelectorAll("[data-illusions-moins]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        pp.illusionsActives = Math.max(0, (pp.illusionsActives || 0) - 1);
        sauverPersos(persos);
        rafraichir();
      };
    });
    // Compteur d'Âmes capturées (cf. htmlBlocAmes) — +1 à la capture, −1 à la
    // dépense (Libération vengeresse) ou au retrait.
    racine.querySelectorAll("[data-ames-plus]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        pp.amesCapturees = (pp.amesCapturees || 0) + 1;
        sauverPersos(persos);
        rafraichir();
      };
    });
    racine.querySelectorAll("[data-ames-moins]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        pp.amesCapturees = Math.max(0, (pp.amesCapturees || 0) - 1);
        sauverPersos(persos);
        rafraichir();
      };
    });
    // Chance d'équipe (cf. htmlBlocChance) : pool PARTAGÉ (SyncStore, pas
    // persos) — le +/- ne touche jamais un perso en particulier.
    racine.querySelectorAll("[data-chance-equipe-plus]").forEach((el) => {
      el.onclick = () => { ajusterChanceEquipe(1); rafraichir(); };
    });
    racine.querySelectorAll("[data-chance-equipe-moins]").forEach((el) => {
      el.onclick = () => { ajusterChanceEquipe(-1); rafraichir(); };
    });
    // Chance personnelle (don Chanceux) : propre à CE perso, même mécanique que
    // illusionsActives/amesCapturees ci-dessus.
    racine.querySelectorAll("[data-chance-perso-plus]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        pp.chancePersonnelle = (pp.chancePersonnelle || 0) + 1;
        sauverPersos(persos);
        rafraichir();
      };
    });
    racine.querySelectorAll("[data-chance-perso-moins]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        pp.chancePersonnelle = Math.max(0, (pp.chancePersonnelle || 0) - 1);
        sauverPersos(persos);
        rafraichir();
      };
    });
    // Fenêtre de réaction (prototype Contresort + extension Bouclier
    // arcanique, cf. htmlBlocFenetreReaction) : "passe" clôt juste la
    // participation de CE PJ (sans coût) dans les deux cas ; la réponse
    // active (Contresort ou Bouclier arcanique) est dispatchée sur l'évènement
    // COURANT de la fenêtre — les deux dépensent PP+réaction via
    // Capacites.lancer (API publique, cf. piège "ne pas toucher
    // js/capacites.js"), mais seul Contresort tranche un contest après coup
    // (test d'attaque magique vs difficulté du rang, cf. js/enchantement.js
    // pour l'échelle) : Bouclier arcanique se contente d'ajuster la DEF avant
    // le jet différé.
    racine.querySelectorAll("[data-reaction-action]").forEach((el) => {
      el.onclick = () => {
        const e = (typeof Reactions !== "undefined") ? Reactions.etat() : null;
        if (e && e.evenement === "subitAttaque") _repondreFenetreAttaque(id, el.dataset.reactionAction);
        else _repondreFenetreReaction(id, el.dataset.reactionAction);
        rafraichir();
      };
    });
    // Pierre de chance (cf. htmlBlocPierreChance) : relance le dernier test
    // d20 de CE PJ, jugé "raté" par le joueur lui-même.
    racine.querySelectorAll("[data-relancer-jet]").forEach((el) => {
      el.onclick = () => { _relancerDernierJet(id); rafraichir(); };
    });
    // Disparition (cape_brume.evanescente, cf. htmlBlocDisparition).
    racine.querySelectorAll("[data-disparaitre]").forEach((el) => {
      el.onclick = () => { _declencherDisparition(id); rafraichir(); };
    });
    // Désengagement (homebrew, attaque d'opportunité, cf. htmlBlocDesengagement) :
    // un jet de FOR (poussée) par adversaire actuellement adjacent, opposé à
    // sa DEF. Réussite = pas d'AO de ce côté-là ; échec = AO immédiate,
    // résolue avec le même pipeline attaque->dégâts que la Table de combat MJ
    // (_resoudreAttaqueMonstre/_resoudreAttaqueMonstreVsPJ/subirDegats),
    // simplement déclenché ici côté joueur plutôt qu'au clic du MJ. Utilise
    // la première attaque du monstre (m.attaques[0]) — pas de sélection
    // d'arme pour une réaction hors tour.
    racine.querySelectorAll("[data-desengager]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        const perso = Personnage.depuisJSON(pp);
        const adjacents = _ennemisAdjacents(id);
        if (!adjacents.length) { toast("Aucun adversaire adjacent : déplacement libre, pas de jet nécessaire."); return; }
        const bonusFor = perso.mod("FOR");
        const messages = [];
        adjacents.forEach((m) => {
          // Don Mobile : jamais d'attaque d'opportunité en se désengageant
          // (simplifié — s'applique à tout adversaire adjacent, cf.
          // Personnage.aMobile) — pas de jet, sortie automatique.
          if (perso.aMobile()) {
            messages.push(`✅ ${m.nom} : pas d'attaque d'opportunité (don Mobile).`);
            return;
          }
          const jet = lancerTest(`${perso.nom || "Perso"} — Poussée (désengagement vs ${m.nom})`, bonusFor, 20, null, { persoId: perso.id, caracCode: "FOR" });
          const defM = _defEffectiveMonstre(m);
          const reussi = defM !== null && jet.total >= defM;
          if (reussi) {
            messages.push(`✅ ${m.nom} repoussé (${jet.total} vs DEF ${defM}) — pas d'attaque d'opportunité.`);
            return;
          }
          messages.push(`❌ Poussée ratée sur ${m.nom}${defM !== null ? ` (${jet.total} vs DEF ${defM})` : " (DEF inconnue)"} — attaque d'opportunité !`);
          const def = typeof BESTIAIRE_INDEX !== "undefined" && m.monstreId ? BESTIAIRE_INDEX[m.monstreId] : null;
          const attaques = m.attaques || (def && def.attaques);
          const a = attaques && attaques[0];
          const r = a && _resoudreAttaqueMonstre(a);
          if (!r) { messages.push(`  → attaque de ${m.nom} inconnue, à résoudre manuellement.`); return; }
          const resolution = _resoudreAttaqueMonstreVsPJ(`${m.nom} — ${r.nom} (attaque d'opportunité)`, r.bonusAttaque + _bonusEtatsMonstre(m, "attaque"), r.critMin, id, "opportunite");
          if (resolution.echecCritique) {
            messages.push(`  → échec critique automatique (1 naturel), pas de dégâts.`);
          } else if (resolution.touche === false) {
            messages.push(`  → raté (DEF ${resolution.defCible}), pas de dégâts.`);
          } else {
            const total = lancerFormule(r.degats, `${m.nom} — ${r.nom} (dégâts, attaque d'opportunité)`, resolution.critique, { estMonstre: true });
            if (typeof total === "number") {
              const typeDegatsNormalise = r.typedegats && r.typedegats.startsWith("physique") ? "physique" : "magique";
              subirDegats(id, total, typeDegatsNormalise, undefined, undefined, undefined, r.elementaire);
              messages.push(`  → touché${resolution.critique ? " CRITIQUE" : ""} : ${total} dégâts subis.`);
            }
          }
        });
        toast(messages.join(" "));
        rafraichir();
      };
    });
    // Attaque d'opportunité (Sentinelle/Expert en hast, rayon 1 = adjacent ;
    // Bastion improvisé, Guerrier Voie de l'ingénieur rang 5, rayon élargi à
    // 3 cases tant que p.bastionActifFinCombat est actif — cf.
    // htmlBlocAttaqueOpportunite) : CE perso attaque tous les monstres dans
    // ce rayon, jet de contact normal (arme équipée, y compris le +1 dégâts
    // Expert en hast déjà intégré à la formule via dmgContact plus haut dans
    // ce fichier — recalculé ici à l'identique, pas de duplication de règle,
    // juste de la formule).
    racine.querySelectorAll("[data-attaque-opportunite]").forEach((el) => {
      el.onclick = () => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        const perso = Personnage.depuisJSON(pp);
        const adjacents = _ennemisAdjacents(id, pp.bastionActifFinCombat ? 3 : 1);
        if (!adjacents.length) { toast(pp.bastionActifFinCombat ? "Aucun monstre à portée du Bastion." : "Aucun adversaire adjacent."); return; }
        const armeContact = perso.armeContactEquipee();
        const armeCourteSecondaire = perso.armeCourteSecondaire();
        const formuleDegats = (arme) => {
          if (!arme) return null;
          const bonus = arme.bonusDegatsTotal !== undefined ? arme.bonusDegatsTotal : (arme.enchantement || 0);
          const base = arme.degats + (bonus ? (bonus > 0 ? "+" + bonus : String(bonus)) : "");
          return arme.bonusDegatsAffixe ? base + "+" + arme.bonusDegatsAffixe : base;
        };
        let dmgContact = _combinerFormules(formuleDegats(armeContact) || perso.degatsPoings(), formuleDegats(armeCourteSecondaire));
        if (dmgContact && perso.aExpertHastQualifie()) dmgContact += "+1";
    // Chevalier — Voie du chaos rang 4 "Marque du serment brisé", choix
    // "degats" (dès CA 5+) : +1d8 DM chaotique sur l'arme de contact.
    if (dmgContact && perso.bonusDegatsArmeChaos()) dmgContact += "+" + perso.bonusDegatsArmeChaos();
    if (dmgContact && perso.bonusDegatsDechainement()) dmgContact += "+" + perso.bonusDegatsDechainement();
    if (dmgContact && perso.bonusDegatsForceHerculeenne()) dmgContact += "+" + perso.bonusDegatsForceHerculeenne();
    if (dmgContact && perso.bonusDegatsFormuleEquipement()) dmgContact += "+" + perso.bonusDegatsFormuleEquipement(); // objet forgé « +dmg par variable » (Forge)
    if (dmgContact && perso.bonusDegatsContactEquipement()) dmgContact += "+" + perso.bonusDegatsContactEquipement(); // affixes "brutale"/"ecrasant", cf. Personnage.bonusDegatsContactEquipement
    // Enchanteur — Voie de la transfiguration rang 3 "Arme enchantée" (cible :
    // n'importe quel allié équipé) : +1d6 DM magiques tant que l'état
    // 'arme_enchantee' reste actif.
    if (dmgContact && perso.bonusDegatsArmeEnchantee()) dmgContact += "+" + perso.bonusDegatsArmeEnchantee();
    // Chevalier — Voie du chaos rang 5 "Avatar du pacte" : +2d6 DM tant que
    // l'état 'avatar_du_pacte' reste actif.
    if (dmgContact && perso.bonusDegatsAvatarPacte()) dmgContact += "+" + perso.bonusDegatsAvatarPacte();
    // Bonus de dégâts générique posé par une capacité "bonus cible:degats"
    // (ex. Druide "Masque du prédateur"/"Totem de la force sauvage") — dés
    // déjà résolus une seule fois à l'activation (cf. appliquerBonusSurPerso),
    // stockés comme un nombre fixe, lu génériquement via bonusTemporaire.
    if (dmgContact && perso.bonusTemporaire("degats")) dmgContact += "+" + perso.bonusTemporaire("degats");
    // Guerrier — Voie du soldat, rang 1 "Posture de combat" (contact
    // uniquement ici : attaque d'opportunité, pas de dmgDistance dans ce bloc).
    if (dmgContact && perso.bonusTemporaire("DM")) dmgContact += (perso.bonusTemporaire("DM") >= 0 ? "+" : "") + perso.bonusTemporaire("DM");
        const bonus = perso.bonusAttaque("contact");
        const critMin = perso.critMinAttaque("contact");
        const messages = [];
        adjacents.forEach((m) => {
          const resolution = _resoudreAttaqueRapide(`${perso.nom || "Perso"} — Attaque d'opportunité vs ${m.nom}`, bonus, critMin, m.id, { persoId: perso.id, caracCode: "FOR" });
          if (resolution.echecCritique) {
            messages.push(`❌ Échec critique automatique sur ${m.nom} (1 naturel), pas de dégâts.`);
          } else if (resolution.touche === false) {
            messages.push(`❌ Raté sur ${m.nom}${resolution.defCible !== null ? ` (DEF ${resolution.defCible})` : ""}.`);
          } else if (!dmgContact) {
            messages.push(`✅ Touché ${m.nom}, mais aucune arme/formule de dégâts au contact.`);
          } else {
            const total = lancerFormule(dmgContact, `${perso.nom || "Perso"} — Dégâts (attaque d'opportunité vs ${m.nom})`, resolution.critique);
            if (typeof total === "number") {
              const res = Carte.appliquerDegatsCombat(m.id, total);
              messages.push(`✅ Touché${resolution.critique ? " CRITIQUE" : ""} ${m.nom} : ${total} dégâts${res ? ` → ${res.pvActuel} PV restants` : ""}.`);
            }
          }
        });
        toast(messages.join(" "));
        rafraichir();
      };
    });
  }

  /* ============================================================
     ÉQUIPEMENT / INVENTAIRE — colonne droite de la fiche
     ============================================================ */

  const LABELS_SLOT = {
    tete: "Tête", torse: "Torse", jambe: "Jambes / Bottes",
    avant_bras: "Avant-bras", main_droite: "Main droite", main_gauche: "Main gauche",
    collier: "Collier", bague: "Bague", mains: "Mains",
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
    if (it.type === "armure") return it.valeurCA ? `${it.valeurCA} CA` : "";
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

  // Bourse (pièces d'or/d'argent/de bronze) — éditable directement par le
  // joueur (dépenses, achats hors combat...) ; le MJ peut aussi en donner
  // depuis l'onglet Loot (cf. Loot.rendreCatalogue → "Donner des pièces").
  function htmlBlocBourse(p) {
    return `<div class="carte">
      <h3 class="titre-bandeau" style="font-size:1rem;">🪙 Bourse</h3>
      <div class="bourse-lignes">
        <label class="bourse-ligne">🟡 Or <input type="number" min="0" id="bourse-or" value="${p.piecesOr || 0}" /></label>
        <label class="bourse-ligne">⚪ Argent <input type="number" min="0" id="bourse-argent" value="${p.piecesArgent || 0}" /></label>
        <label class="bourse-ligne">🟤 Bronze <input type="number" min="0" id="bourse-bronze" value="${p.piecesBronze || 0}" /></label>
      </div>
    </div>`;
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

    // Contrat Démoniaque (data/loot.json: contrat_demoniaque) : pas de notion
    // de repos long dans l'app — réinitialisation manuelle par le joueur,
    // visible seulement si le contrat a été utilisé/a une pénalité active
    // (cf. Personnage.penaliteContratDemoniaque, js/app.js lancerTest).
    const contratActif = perso.contratDemoniaqueUtilise || perso.contratDemoniaquePenalite;
    const contratHtml = contratActif
      ? `<div class="recap-equipement" style="margin-top:6px;">
          <div>🔥 Contrat Démoniaque : ${perso.contratDemoniaquePenalite ? `-${perso.contratDemoniaquePenalite.valeur} ${perso.contratDemoniaquePenalite.carac}` : "utilisé"}</div>
          <button class="btn petit secondaire" id="btn-reset-contrat-demoniaque">🔄 Réinitialiser le Contrat Démoniaque</button>
        </div>`
      : "";

    return `
      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:1rem;">🛡️ Équipement</h3>
        <div class="slots-equipement">${casesHtml}</div>
        <div class="recap-equipement">
          <div>DEF totale : <strong>${_defPjAvecAura(perso, perso.id)}</strong> (dont +${perso.bonusDefEquipement()} équipement)</div>
          <div>Réduction de dégâts : <strong>${perso.reductionDegats()}</strong></div>
        </div>
        ${contratHtml}
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
          const resurrection = estParcheminResurrection(it);
          const parcheminSort = estParcheminSort(it);
          return `<div class="inv-item">
            <div class="inv-item-header">
              <span class="inv-item-nom" style="color:${it.rareteCouleur || ""}">${echapper(it.nom)}</span>${badgeRareteHtml(it)}
              ${it.type ? `<span class="loot-badge loot-badge-${it.type}">${echapper(it.type)}</span>` : ""}
            </div>
            ${badge ? `<div class="inv-item-stats">${echapper(badge)}</div>` : ""}
            ${it.effetRarete ? `<div class="inv-item-stats" style="color:${it.rareteCouleur || ""}">✨ ${echapper(it.effetRarete)}</div>` : ""}
            ${it.materiauEffet ? `<div class="inv-item-stats" style="color:var(--or);">🔥 ${echapper(it.materiauEffet)}</div>` : ""}
            ${it.effetAffixe ? `<div class="inv-item-stats" style="color:var(--or);">⚔ ${echapper(it.effetAffixe)}</div>` : ""}
            ${it.bonusAttaqueMagique ? `<div class="inv-item-stats">+${it.bonusAttaqueMagique} attaque magique</div>` : ""}
            ${it.description ? `<div class="inv-item-desc">${echapper(it.description)}</div>` : ""}
            <div class="inv-actions">
              ${equipable ? `<button class="btn petit or btn-equiper-depuis-inv" data-idx="${idx}">Équiper</button>` : ""}
              ${soin && persoId ? `<button class="btn petit or btn-utiliser-item" data-idx="${idx}">🧪 Utiliser</button>` : ""}
              ${soin && persoId ? `<button class="btn petit secondaire btn-soigner-allie" data-idx="${idx}">❤ Soigner un allié</button>` : ""}
              ${resurrection && persoId ? `<button class="btn petit or btn-reanimer-allie" data-idx="${idx}">📜 Réanimer un allié</button>` : ""}
              ${parcheminSort && persoId ? `<button class="btn petit or btn-apprendre-sort" data-idx="${idx}">📖 Apprendre</button>` : ""}
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
    // Retire le kit précédent des slots qu'il peut occuper (tête/jambes
    // (fusionné avec bottes)/avant-bras/collier/bague ne sont jamais
    // touchés : rien n'y est placé ici).
    creation.equipement.main_droite = null;
    creation.equipement.main_gauche = null;
    creation.equipement.torse = null;
    // Retire les consommables ET l'accessoire de Grimoire du kit précédent
    // (marqués _kitDepart), en laissant intacts les objets ajoutés
    // manuellement par le joueur.
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
    // accessoire : objet de Grimoire donné Commun de base (cf.
    // prompt_grimoire_v2_emplacements_typ_s.md) — dans le SAC, pas équipé
    // dans un slot : l'avoir sur soi suffit pour bénéficier du Grimoire
    // (cf. Personnage._objetGrimoirePorte), aucun compromis d'emplacement
    // à faire pour un Manuel/une Amulette de base.
    if (kit.accessoire) {
      const accessoire = depuisCatalogue(kit.accessoire);
      if (accessoire) creation.inventaireListe.push(Object.assign({}, accessoire, { _kitDepart: true }));
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

  // Roule le dé de bonus PV max d'un objet (ex. Amulette de santé,
  // bonusPvMaxDe: "1d4") une seule fois, à la première mise en équipement de
  // CETTE instance d'objet — fige le résultat dans bonusPvMax, jamais
  // relancé ensuite (y compris déséquiper/rééquiper), cf.
  // Personnage.bonusPvEquipement.
  function _resoudreDePvMaxSiBesoin(item) {
    if (!item || !item.bonusPvMaxDe || item.bonusPvMax !== undefined) return;
    const m = /^(\d*)d(\d+)$/.exec(item.bonusPvMaxDe);
    if (!m) return;
    const nb = parseInt(m[1] || "1", 10), faces = parseInt(m[2], 10);
    let total = 0;
    for (let i = 0; i < nb; i++) total += lancerDe(faces);
    item.bonusPvMax = total;
  }

  // Types de dégâts sélectionnables pour une résistance "au choix" (cf.
  // "renforcé"/"polyvalent", anneau_resistance, lot "armures C" — cluster
  // résistances) — même vocabulaire que le sélecteur "Élément" du formulaire
  // "Subir des dégâts" (cf. blocDegatsSubisHtml), + "physique"/"magique" que
  // ce sélecteur-là ne propose pas (lui gère déjà ces deux via typeDegats).
  const CHOIX_RESISTANCE_ELEMENTAIRE = [
    { id: "physique", label: "Physique" },
    { id: "magique", label: "Magique" },
    { id: "feu", label: "Feu" },
    { id: "froid", label: "Froid" },
    { id: "chaos", label: "Chaos" },
    { id: "mental", label: "Mental" },
    { id: "sacre", label: "Sacré" },
  ];
  // Résout le(s) type(s) de résistance élémentaire "au choix" d'un objet (cf.
  // resistanceElementaireEnAttente, js/raretes.js) UNE SEULE FOIS, à la
  // première mise en équipement de CETTE instance — fige le résultat dans
  // resistanceElementaire, jamais rejoué ensuite (même principe que
  // _resoudreDePvMaxSiBesoin ci-dessus). prompt() peut être bloqué/indisponible
  // (même remarque qu'ailleurs dans ce fichier) : un rejet retombe sur le
  // premier type de la liste plutôt que de laisser l'objet sans résistance.
  function _resoudreChoixResistanceSiBesoin(item) {
    if (!item || !item.resistanceElementaireEnAttente || item.resistanceElementaire !== undefined) return;
    const { nbChoix, valeur } = item.resistanceElementaireEnAttente;
    const choisis = [];
    for (let i = 0; i < nbChoix; i++) {
      const options = CHOIX_RESISTANCE_ELEMENTAIRE.filter((o) => !choisis.some((c) => c.type === o.id));
      let saisie = "";
      try {
        saisie = prompt(`${item.nom} — choisis le type de dégâts résisté (${i + 1}/${nbChoix}) parmi : ${options.map((o) => o.label).join(", ")}`, options[0].id) || "";
      } catch (e) { saisie = ""; }
      const trouve = options.find((o) => o.id === saisie.trim().toLowerCase()) || options[0];
      choisis.push({ type: trouve.id, valeur });
    }
    item.resistanceElementaire = choisis;
  }

  // Applique un delta de PV max lié à l'équipement (accessoires à
  // bonusPvMax, ex. Amulette de santé) aux PV actuels — même principe que le
  // recalcul manuel (btn-recalculer-pv) ou le Don Robuste, mais ciblé sur ce
  // seul delta pour ne jamais toucher au reste de la formule (n'écrase pas un
  // pvMax ajusté manuellement pour une autre raison).
  function _ajusterPvMaxEquipement(perso, delta) {
    if (!delta) return;
    perso.pvMax = (perso.pvMax || 0) + delta;
    perso.pvActuel = Math.max(0, Math.min(perso.pvMax, (perso.pvActuel || 0) + delta));
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
    _resoudreDePvMaxSiBesoin(item);
    _resoudreChoixResistanceSiBesoin(item);
    const ancien = perso.equiper(slot, item);
    if (ancien === undefined) { toast("Cet objet ne peut pas être équipé dans cet emplacement."); return; }
    perso.inventaireListe.splice(idx, 1);
    if (ancien) perso.inventaireListe.push(ancien);
    _ajusterPvMaxEquipement(perso, (item.bonusPvMax || 0) - ((ancien && ancien.bonusPvMax) || 0));
    persos[persoId] = perso.versJSON();
    sauverPersos(persos);
    afficherFiche(persoId);
    // Bâton (cf. reference_sorts_connus.md §4) : "prérequis" cosmétique, pas
    // de vraie restriction technique (l'app n'a aucune notion de prérequis
    // d'équipement) — simple avertissement non bloquant si le porteur ne
    // connaît encore aucun sort, l'objet reste équipable dans tous les cas.
    const avertissementBaton = /^baton/.test(item.id || "") && !(perso.grimoireSortsConnus || []).length
      ? " ⚠️ Aucun sort connu — le bonus de canalisation ne sert à rien pour l'instant."
      : "";
    toast(`« ${item.nom} » équipé (${LABELS_SLOT[slot]}).${avertissementBaton}`);
  }

  function desequiperItem(persoId, slot) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);
    const item = perso.deséquiper(slot);
    if (!item) return;
    perso.inventaireListe.push(item);
    _ajusterPvMaxEquipement(perso, -((item.bonusPvMax) || 0));
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

  // Objet à effet binaire (pas de dé de soin, donc absent de formuleSoinItem) :
  // identifié par id, pour proposer un bouton dédié plutôt qu'un "Utiliser"
  // générique qui ne ferait rien.
  function estParcheminResurrection(it) {
    return !!it && it.type === "consommable" && it.id === "parchemin_resurrection";
  }

  // Parchemin d'apprentissage (cf. reference_sorts_connus.md) : consommable
  // référençant un id de SORTS_PAR_CLASSE[classe] via sortAppris — identifié
  // par champ plutôt que par id explicite (contrairement à
  // estParcheminResurrection), pour ne pas devoir lister chaque parchemin un
  // par un.
  function estParcheminSort(it) {
    return !!it && it.type === "consommable" && typeof it.sortAppris === "string";
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
  // Délègue à Personnage.appliquerGainPv (point d'application unique de tout
  // gain de PV) — gère le halving Corruption persistante ET la Dette du
  // Soigneur (data/loot.json: collier_dette_soigneur).
  function soigner(id, montant, source) {
    if (!montant) return;
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    const avant = p.pvActuel;
    const res = Personnage.appliquerGainPv(p, montant);
    const transition = _majEtatMourant(p, avant);
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    if (transition) _rerendreApresTransitionMourant(id);
    const suffixeReduit = res.detteAnnulee
      ? ` (Dette du Soigneur : gain annulé, dette effacée)`
      : res.reduit ? ` (réduit de moitié — Corruption persistante)` : "";
    toast(`❤ ${p.nom} récupère ${res.gain} PV${source ? " (" + source + ")" : ""}${suffixeReduit}.`);
  }

  // Bouton "Utiliser" : le personnage consomme lui-même l'objet, soin immédiat
  // sans jet de caractéristique (boire sa propre potion ne demande pas de test).
  // Consomme l'action secondaire du tour en combat (no-op hors combat, cf.
  // Combat.utiliserActionSecondaire) — "boire une potion" est l'exemple type
  // d'action secondaire de l'économie d'action.
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
    if (typeof Combat !== "undefined" && Combat.utiliserActionSecondaire) Combat.utiliserActionSecondaire(persoId);
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
  // ou échec), seul le soin est conditionnel. Consomme l'action secondaire du
  // tour du SOIGNEUR (no-op hors combat), comme utiliserConsommable (soin sur
  // soi-même).
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
    if (typeof Combat !== "undefined" && Combat.utiliserActionSecondaire) Combat.utiliserActionSecondaire(persoId);
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

  // Sélecteur d'allié à réanimer avec un parchemin de résurrection — même
  // conteneur/modèle que ouvrirSelecteurSoin, mais restreint aux alliés
  // effectivement Morts (etatMort) : un simple Mourant·e ou Renversée relève
  // déjà de « Relever un allié », pas d'un objet à usage unique.
  function ouvrirSelecteurReanimation(persoId, idx) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    const zone = document.getElementById("selecteur-soin-item");
    if (!zone) return;
    const morts = Object.keys(persos).filter((pid) => pid !== persoId && persos[pid].etatMort);
    if (!morts.length) {
      zone.innerHTML = `<div class="aide">Aucun allié tombé à réanimer.</div>`;
      zone.style.display = "block";
      return;
    }
    zone.innerHTML =
      `<select id="select-destinataire-reanimation">` +
      morts.map((pid) => `<option value="${pid}">${echapper(persos[pid].nom)}</option>`).join("") +
      `</select>` +
      `<button class="btn petit or" id="btn-confirmer-reanimation">Réanimer avec « ${echapper(item.nom)} »</button>`;
    zone.style.display = "block";
    document.getElementById("btn-confirmer-reanimation").onclick = () => {
      const destId = document.getElementById("select-destinataire-reanimation").value;
      reanimerAllie(persoId, idx, destId);
    };
  }

  // Réanime un allié Mort (etatMort) à 1 PV, jets de mort remis à zéro —
  // contrairement à Relever un allié (qui ne gère que Mourant·e/Renversée),
  // c'est le seul moyen de récupérer un PJ ayant franchi ce seuil. Objet à
  // usage unique, consommé dans tous les cas. Consomme l'action secondaire
  // du RÉANIMATEUR (no-op hors combat), comme soignerAllie.
  function reanimerAllie(persoId, idx, destId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dest = persos[destId];
    if (!p || !dest) return;
    const item = p.inventaireListe[idx];
    if (!item) return;
    _consommerUnite(p, idx);
    if (dest.etatMort) {
      dest.pvActuel = 1;
      dest.mortSucces = 0;
      dest.mortEchecs = 0;
      dest.etatMort = false;
    }
    sauverPersos(persos);
    afficherFiche(persoId);
    if (typeof Combat !== "undefined" && Combat.utiliserActionSecondaire) Combat.utiliserActionSecondaire(persoId);
    const zone = document.getElementById("selecteur-soin-item");
    if (zone) zone.style.display = "none";
    toast(`📜 ${p.nom} réanime ${dest.nom} avec « ${item.nom} » (1 PV) !`);
    _syncPvAffichages(destId, dest);
    if (ficheActiveId === destId) afficherFiche(destId);
    rendreFicheSidebarBattlemap(ficheSidebarActiveId);
    rendreDockCombat();
  }

  // Apprend un sort depuis un parchemin (cf. reference_sorts_connus.md,
  // estParcheminSort ci-dessus) — toujours sur SOI (pas de sélection de
  // destinataire comme reanimerAllie/soignerAllie : aucune mécanique
  // canonique pour "apprendre un sort à un allié" dans la référence).
  // Consommé uniquement en cas de succès (sort déjà connu ou plus de slot
  // disponible = tentative refusée, le parchemin reste dans l'inventaire).
  // Nom de l'objet attendu pour CETTE classe (juste pour les messages —
  // aucune logique de jeu ne dépend de ce nom, seulement de grimoireClasses
  // sur l'item réellement équipé).
  const NOM_OBJET_GRIMOIRE_PAR_CLASSE = {
    magicien: "Manuel d'incantation", enchanteur: "Manuel d'incantation", necromancien: "Manuel d'incantation",
    pretre: "Amulette de Bénédiction",
  };
  // Cœur partagé par apprendreSortDepuisParchemin (consomme un parchemin
  // précis) et apprendreSortDirectementDuGrimoire (bouton "Apprentissage"
  // de la carte Grimoire, liste complète du catalogue, aucune consommation
  // d'objet) : mute `p` déjà chargé par l'appelant, ne sauve/rafraîchit
  // PAS elle-même — même principe de passage local unique que
  // _gererDeclencheursEquipement plus haut, pour que l'appelant puisse
  // encore consommer un parchemin dans la MÊME transaction sans écraser
  // grimoireSortsConnus au second sauverPersos(). Renvoie le sort appris
  // (truthy) ou null si bloqué (message déjà toasté).
  function _apprendreSortGrimoireLocal(p, sortId) {
    if (typeof CARAC_MAGIE === "undefined" || !CARAC_MAGIE[p.classe]) { toast("Seul un casteur pur peut apprendre ce sort."); return null; }
    const perso = Personnage.depuisJSON(p);
    const connus = p.grimoireSortsConnus || [];
    if (connus.includes(sortId)) { toast("Ce sort est déjà connu."); return null; }
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[p.classe] || []) : [];
    const sort = catalogue.find((s) => s.id === sortId);
    if (!sort) { toast("Sort introuvable pour cette classe."); return null; }
    if (!perso._objetGrimoirePorte()) {
      const nomAttendu = NOM_OBJET_GRIMOIRE_PAR_CLASSE[p.classe] || "un objet de Grimoire";
      toast(`Ajoute ${nomAttendu} à ton inventaire pour apprendre des sorts hors Voie.`);
      return null;
    }
    // Palier de niveau minimum par rang (cf. NIVEAU_MIN_PAR_RANG,
    // data/donnees.js) : même garde-fou que Capacites.lancer (qui bloque le
    // LANCER d'un sort trop haut niveau), appliqué ici à l'APPRENTISSAGE —
    // inutile de laisser un joueur occuper un emplacement avec un sort
    // qu'il ne pourra de toute façon pas lancer avant d'avoir pris du niveau.
    const niveauMin = (typeof NIVEAU_MIN_PAR_RANG !== "undefined" && NIVEAU_MIN_PAR_RANG[sort.rang]) || 1;
    if ((p.niveau || 1) < niveauMin) {
      toast(`Ce sort (rang ${sort.rang}) nécessite le niveau ${niveauMin} (actuellement niveau ${p.niveau || 1}).`);
      return null;
    }
    const tierLibre = perso.emplacementLibrePourRang(sort.rang);
    if (!tierLibre) {
      toast(`Plus d'emplacement compatible avec un sort de rang ${sort.rang} — équipe un objet de meilleure rareté, ou n'apprends pas de nouveau sort pour l'instant.`);
      return null;
    }
    p.grimoireSortsConnus = connus.concat([sortId]);
    const slots = perso.slotsGrimoire();
    toast(`📖 « ${sort.nom} » ajouté au Grimoire, emplacement 1-${GRIMOIRE_PLAFOND_TIER[tierLibre]} (${p.grimoireSortsConnus.length}/${slots} au total).`);
    return sort;
  }
  function apprendreSortDepuisParchemin(persoId, idx) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const item = p.inventaireListe[idx];
    if (!item || !estParcheminSort(item)) return;
    if (!_apprendreSortGrimoireLocal(p, item.sortAppris)) return;
    _consommerUnite(p, idx);
    sauverPersos(persos);
    afficherFiche(persoId);
  }
  // Bouton "📖 Apprentissage" de la carte Grimoire (liste complète du
  // catalogue de classe, cf. bloc HTML dans afficherFiche ci-dessous) :
  // apprend directement un sort choisi dans la liste, sans consommer de
  // parchemin — l'objet de Grimoire porté (Manuel/Amulette) suffit, comme
  // convenu.
  function apprendreSortDirectementDuGrimoire(persoId, sortId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    if (!_apprendreSortGrimoireLocal(p, sortId)) return;
    sauverPersos(persos);
    afficherFiche(persoId);
  }

  // Rattrapage pour les personnages créés AVANT l'introduction de l'objet de
  // Grimoire dans EQUIPEMENT_DEPART (cf. data/equipement_depart.js) : ceux-ci
  // n'ont jamais reçu leur Manuel d'incantation/Amulette de Bénédiction —
  // sans lui, _objetGrimoirePorte() reste faux et slotsGrimoire() = 0, donc
  // aucun sort de Grimoire apprenable. Ajoute l'objet manquant à l'inventaire
  // (jamais équipé dans un slot, comme le kit de départ — l'avoir sur soi
  // suffit) pour toute classe concernée qui ne l'a pas déjà (équipé OU en
  // inventaire, cf. Personnage._objetGrimoirePorte). Idempotent : ne fait
  // rien pour un personnage qui l'a déjà, donc appelable sans risque à
  // chaque démarrage. L'objet cible est déduit de LOOT_CATALOGUE
  // (grimoireClasses), jamais d'un id/nom recopié ici, pour rester
  // synchronisé si le catalogue change.
  function rattraperObjetsGrimoireManquants() {
    if (typeof LOOT_CATALOGUE === "undefined") return;
    const persos = chargerPersos();
    let modifie = false;
    Object.keys(persos).forEach((id) => {
      const p = persos[id];
      const objetAttendu = LOOT_CATALOGUE.find((it) => Array.isArray(it.grimoireClasses) && it.grimoireClasses.includes(p.classe));
      if (!objetAttendu) return; // classe sans Grimoire (guerrier, druide...)
      const perso = Personnage.depuisJSON(p);
      if (perso._objetGrimoirePorte()) return; // déjà équipé ou en inventaire
      p.inventaireListe = (p.inventaireListe || []).concat([Object.assign({}, objetAttendu)]);
      modifie = true;
      console.info(`Rattrapage Grimoire : « ${objetAttendu.nom} » ajouté à l'inventaire de ${p.nom} (${p.classe}).`);
    });
    if (modifie) sauverPersos(persos);
  }

  // Jet de mort (état Mourant, 0 PV, cf. REGLES_GENERALES "Mort et
  // stabilisation") : 1d20, ≥11 = succès. 3 succès = stabilisé à 1 PV
  // (jet de mort remis à zéro). 3 échecs = mort (etatMort, plus aucun jet,
  // tour définitivement sauté — cf. Combat._estKO). Uniquement disponible à
  // son propre tour (cf. bouton câblé sur cEstMonTour dans rendreDockCombat).
  function jetDeMort(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p || p.pvActuel > 0 || p.etatMort) return;
    const d20 = lancerDe(20);
    const reussite = d20 >= 11;
    if (reussite) p.mortSucces = (p.mortSucces || 0) + 1;
    else p.mortEchecs = (p.mortEchecs || 0) + 1;

    let issue = "";
    if (p.mortSucces >= 3) {
      p.pvActuel = 1;
      p.mortSucces = 0;
      p.mortEchecs = 0;
      p.etatMort = false;
      issue = ` ${p.nom} se stabilise et rouvre les yeux (1 PV) !`;
    } else if (p.mortEchecs >= 3) {
      p.etatMort = true;
      issue = ` ${p.nom} succombe...`;
    }
    ajouterHisto(`${p.nom} — Jet de mort`, d20, d20 === 20, d20 === 1,
      `d20 [${d20}] → ${reussite ? "succès" : "échec"} (${p.mortSucces || 0}/3 succès, ${p.mortEchecs || 0}/3 échecs)`);
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    toast(`🎲 Jet de mort (${d20}) : ${reussite ? "succès" : "échec"}.${issue}`);
    if (ficheActiveId === id) afficherFiche(id);
    rendreDockCombat();
  }

  // Relève un allié Mourant(e) (stabilise à 1 PV, sans jet) ou Renversée
  // (retire l'état, sans jet non plus) — action principale, consomme
  // Combat.utiliserActionPrincipale comme les attaques. Contrairement à
  // soignerAllie (soin), ne consomme aucun objet et réussit toujours : c'est
  // le fait d'y consacrer son action qui fait la différence, pas un test.
  function releverAllie(persoId, destId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dest = persos[destId];
    if (!p || !dest) return;
    const estMourant = (dest.pvActuel || 0) <= 0 && !dest.etatMort;
    const idxRenversee = (dest.etatsActifs || []).findIndex((e) => e.idEtat === "renversee");
    if (!estMourant && idxRenversee === -1) { toast(`${dest.nom} n'a besoin d'être ni stabilisé·e ni relevé·e.`); return; }

    if (estMourant) {
      dest.pvActuel = 1;
      dest.mortSucces = 0;
      dest.mortEchecs = 0;
      dest.etatMort = false;
    }
    if (idxRenversee !== -1) dest.etatsActifs.splice(idxRenversee, 1);

    sauverPersos(persos);
    if (typeof Combat !== "undefined" && Combat.utiliserActionPrincipale) Combat.utiliserActionPrincipale(persoId);
    toast(`🤝 ${p.nom} relève ${dest.nom}${estMourant ? " (stabilisé·e, 1 PV)" : " (debout)"}.`);
    _syncPvAffichages(destId, dest);
    if (ficheActiveId === destId) afficherFiche(destId);
    rendreFicheSidebarBattlemap(ficheSidebarActiveId);
    rendreDockCombat();
  }

  // Grande illustration du personnage (p.illustration) — distincte du petit
  // avatar/icône (p.portrait/token/emblème). Affichée en tête de la fiche
  // complète ; le propriétaire peut l'ajouter/changer/retirer (image
  // compressée, cf. lireImageRedimensionnee). Rien pour le MJ si absente.
  function htmlPortraitFiche(p) {
    const editable = role !== "mj";
    if (!p.illustration && !editable) return "";
    return `<div class="carte portrait-fiche">
      ${p.illustration
        ? `<img class="portrait-fiche-img" src="${p.illustration}" alt="illustration de ${echapper(p.nom)}" />`
        : `<div class="portrait-fiche-vide">Aucune illustration — ajoute une image qui représente ton personnage.</div>`}
      ${editable ? `<div class="barre-actions" style="justify-content:center;margin-top:10px;">
        <button class="btn petit or" id="btn-portrait-fiche">🖼 ${p.illustration ? "Changer l'illustration" : "Ajouter une illustration"}</button>
        ${p.illustration ? `<button class="btn petit secondaire" id="btn-portrait-fiche-suppr">Retirer</button>` : ""}
        <input type="file" accept="image/*" id="input-portrait-fiche" hidden />
      </div>` : ""}
    </div>`;
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
    // + bonusTestCaracCapacites : cf. même ajout côté rendreDockCombat().
    CARACS.forEach((cc) => (mods[cc.code] = perso.mod(cc.code) + perso.bonusTestCaracCapacites(cc.code)));
    // Demi-Elfe "Double Héritage" (race rang 5) : 1x/jour, avantage sur le
    // PROCHAIN test de Perception/Social/INT — case à cocher "armée" avant de
    // cliquer un bouton de test, consommée à ce clic (cf. wiring plus bas),
    // même mécanique d'usage que Cœur de Montagne (Capacites.verifierUsage).
    const doubleHeritageDispo = !!(perso.aDoubleHeritage() && typeof Capacites !== "undefined" &&
      Capacites.verifierUsage(p, "race:demi_elfe:5", { usage: { frequence: "1x/jour" } }).ok);

    // Bonus d'attaque (jet uniquement) via le modèle Personnage
    const attContact = perso.bonusAttaque("contact");
    const attDistance = perso.bonusAttaque("distance");
    const attMagique = perso.bonusAttaque("magique");
    const init = perso.calculerInitiative();
    // Points de Pouvoir (cf. reference_systeme_magie_pp.md) : null pour les
    // classes sans CARAC_MAGIE (cf. Personnage.calculerPPMax) — zone entière
    // masquée pour elles, pas de bloc vide.
    const ppMax = perso.calculerPPMax();
    // Prêtre — Points de Cercle (cf. les 4 prompts prompt_pretre_cercle_*.md) :
    // 4 pools indépendants du PP, un par Cercle, affichés seulement si leur
    // max > 0 (rang 4+ acquis dans la voie correspondante). Repos long
    // uniquement (cf. reposLongPointsCercle(), même bouton que le PP).
    const poolsCercle = [
      { nom: "Bénédiction", val: p.pointsBenediction, max: perso.pointsBenedictionMax() },
      { nom: "Conviction", val: p.pointsConviction, max: perso.pointsConvictionMax() },
      { nom: "Bannissement", val: p.pointsBannissement, max: perso.pointsBannissementMax() },
      { nom: "Jugement", val: p.pointsJugement, max: perso.pointsJugementMax() },
    ].filter((x) => x.max > 0);

    const zone = document.getElementById("zone-fiche-active");

    const capHtml = htmlCapacitesClasse(p, c);

    // Voie raciale (gratuite), affichée séparément des voies de classe
    const race = p.race ? RACES[p.race] : null;
    const capRaceHtml = htmlCapacitesRace(p, race);

    zone.innerHTML = `
      <div class="fiche-layout">
        <div class="fiche-col-gauche">
          ${htmlPortraitFiche(p)}
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
                <button class="btn petit secondaire" id="btn-recalculer-pv" title="Recalcule le max de PV avec la formule à jour (utile après un changement d'équilibrage)">🔄 Recalculer PV</button>
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
                ${blocDegatsSubisHtml("", perso, p)}
              </div>
              <div class="stat-box"><div class="label">CA</div><div class="valeur">${_defPjAvecAura(perso, id)}</div></div>
              <div class="stat-box"><div class="label">Initiative</div><div class="valeur">${signe(init)}</div></div>
            </div>

            ${ppMax !== null ? `
            <div class="stats-rapides">
              <div class="stat-box">
                <div class="label">Points de Pouvoir</div>
                <div class="pv-control">
                  <span style="font-weight:700;">${p.ppActuel != null ? p.ppActuel : ppMax} / ${ppMax}</span>
                </div>
                <div class="barre-actions" style="margin-top:6px;">
                  <button class="btn petit secondaire" id="btn-repos-long-pp" title="Reset complet des PP et Points de Cercle">🌙 Repos long</button>
                  <button class="btn petit secondaire" id="btn-repos-court-pp" title="+25% des PP max, arrondi supérieur, plafonné">☕ Repos court</button>
                </div>
              </div>
              ${poolsCercle.map((x) => `<div class="stat-box"><div class="label">Points de ${x.nom}</div><div class="valeur">${x.val != null ? x.val : x.max} / ${x.max}</div></div>`).join("")}
            </div>
            <div class="carte" style="margin-top:10px;">
              <h3 style="margin-top:0;">📖 Grimoire</h3>
              ${p.classe === "pretre" ? `
              <div class="aide" style="margin-bottom:8px;">
                Cercle de spécialisation :
                <select id="select-cercle-specialisation">
                  <option value="">Aucun</option>
                  <option value="vie"${p.cercleSpecialisation === "vie" ? " selected" : ""}>Vie</option>
                  <option value="foi"${p.cercleSpecialisation === "foi" ? " selected" : ""}>Foi</option>
                  <option value="bannissement"${p.cercleSpecialisation === "bannissement" ? " selected" : ""}>Bannissement</option>
                  <option value="jugement"${p.cercleSpecialisation === "jugement" ? " selected" : ""}>Jugement</option>
                </select>
                — accorde 1 sort de rang 1 de la famille choisie (occupe un emplacement de Grimoire si un est disponible).
              </div>` : ""}
              <div class="aide" style="margin-bottom:8px;">${perso.grimoireSlotsOccupes()}/${perso.slotsGrimoire()} sorts connus${perso.slotsGrimoire() === 0 ? ` — ajoute ${NOM_OBJET_GRIMOIRE_PAR_CLASSE[p.classe] || "un objet de Grimoire"} à ton inventaire pour en apprendre.` : ""}</div>
              ${perso.slotsGrimoire() > 0 ? (function () {
                const cap = perso.slotsGrimoireParTier();
                const occ = perso.grimoireOccupationParTier();
                return `<div class="aide" style="margin-bottom:8px;font-size:0.78rem;">Par rang max. logeable — 1-2 : ${occ["12"]}/${cap["12"]} · 1-3 : ${occ["13"]}/${cap["13"]} · 1-4 : ${occ["14"]}/${cap["14"]} · 1-5 : ${occ["15"]}/${cap["15"]}</div>`;
              })() : ""}
              ${perso.slotsGrimoire() > 0 ? `
              <div class="barre-actions" style="margin-bottom:8px;">
                <button type="button" class="btn petit secondaire btn-toggle-apprentissage-grimoire" data-perso="${id}">📖 Apprentissage</button>
              </div>
              <div class="grimoire-apprentissage" id="grimoire-apprentissage-${id}" style="display:none;margin-bottom:8px;">
                ${(function () {
                  const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[p.classe] || []) : [];
                  if (!catalogue.length) return `<div class="vide">Catalogue vide pour cette classe.</div>`;
                  const connus = p.grimoireSortsConnus || [];
                  const accordes = perso.sortsGrimoireAccordes();
                  const tries = catalogue.slice().sort((a, b) => a.rang - b.rang);
                  return tries.map((sort) => {
                    const dejaConnu = connus.includes(sort.id) || accordes.includes(sort.id);
                    // Palier de niveau minimum par rang (cf. NIVEAU_MIN_PAR_RANG,
                    // data/donnees.js — rang 3 : niveau 4, rang 4 : niveau 6,
                    // rang 5 : niveau 8) : même garde-fou que Capacites.lancer/
                    // _apprendreSortGrimoireLocal, affiché ici pour ne pas laisser
                    // le joueur tenter d'apprendre un sort qu'il ne peut pas encore.
                    const niveauMin = (typeof NIVEAU_MIN_PAR_RANG !== "undefined" && NIVEAU_MIN_PAR_RANG[sort.rang]) || 1;
                    const niveauInsuffisant = !dejaConnu && (p.niveau || 1) < niveauMin;
                    const tierLibre = dejaConnu || niveauInsuffisant ? null : perso.emplacementLibrePourRang(sort.rang);
                    const action = dejaConnu
                      ? `<span class="loot-badge">Connu</span>`
                      : niveauInsuffisant
                        ? `<span class="loot-badge" style="opacity:.6;" title="Nécessite le niveau ${niveauMin}">Trop haut niveau</span>`
                        : tierLibre
                          ? `<button type="button" class="btn petit or btn-apprendre-sort-direct" data-perso="${id}" data-sort="${sort.id}">Apprendre (1-${GRIMOIRE_PLAFOND_TIER[tierLibre]})</button>`
                          : `<span class="loot-badge" style="opacity:.6;">Aucun emplacement</span>`;
                    // École débloquée (cf. ECOLE_VERS_VOIE_DEBLOCAGE, data/donnees.js
                    // et Capacites.lancer, coutPPReel) : mise en avant + tag, pour
                    // repérer avant d'apprendre les sorts au tarif PP normal de ceux
                    // actuellement à ×2 (aucune école assignée = toujours verrouillée).
                    const ecoleOk = sort.categorie && perso.ecoleSortDebloquee && perso.ecoleSortDebloquee(sort.categorie);
                    const tagEcole = sort.categorie
                      ? (ecoleOk
                          ? `<span class="tag-ecole tag-ecole-debloquee" title="École débloquée : coût PP normal">🔓 débloquée</span>`
                          : `<span class="tag-ecole tag-ecole-verrouillee" title="École non débloquée : coût PP ×2">🔒 verrouillée</span>`)
                      : "";
                    return `<div class="cap-fiche${ecoleOk ? " ecole-debloquee" : ""}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                      <div>
                        <div class="titre-cap">${echapper(sort.nom)}</div>
                        <div class="voie-source">Rang ${sort.rang}${sort.categorie ? " · " + echapper(sort.categorie) : ""} ${tagEcole}</div>
                      </div>
                      ${action}
                    </div>`;
                  }).join("");
                })()}
              </div>` : ""}
              ${(function () {
                const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[p.classe] || []) : [];
                const appris = p.grimoireSortsConnus || [];
                const accordes = perso.sortsGrimoireAccordes();
                const idsAffiches = appris.concat(accordes.filter((sid) => !appris.includes(sid)));
                if (!idsAffiches.length) return `<div class="vide">Aucun sort appris.</div>`;
                return idsAffiches.map((sortId) => {
                  const sort = catalogue.find((s) => s.id === sortId);
                  if (!sort) return "";
                  const source = { origine: "grimoire", cle: sort.id, nomCap: sort.nom };
                  const coutTexte = sort.mecanique.coutPP ? `${sort.mecanique.coutPP} PP`
                    : sort.mecanique.coutPointsBenediction ? `${sort.mecanique.coutPointsBenediction} Pt. Bénédiction`
                    : sort.mecanique.coutPointsConviction ? `${sort.mecanique.coutPointsConviction} Pt. Conviction`
                    : sort.mecanique.coutPointsBannissement ? `${sort.mecanique.coutPointsBannissement} Pt. Bannissement`
                    : sort.mecanique.coutPointsJugement ? `${sort.mecanique.coutPointsJugement} Pt. Jugement`
                    : "gratuit";
                  const tagAccorde = !appris.includes(sortId) ? " · accordé par la voie" : "";
                  const dispo = perso.sortGrimoireADesEmplacements ? perso.sortGrimoireADesEmplacements(sortId) : true;
                  const boutonOuBadge = dispo
                    ? htmlLancerCapacite(source, sort.mecanique, p)
                    : ` <span class="loot-badge" style="opacity:.6;" title="Nécessite un objet de meilleure rareté pour ce rang">Sans emplacement</span>`;
                  return `<div class="cap-fiche">
                    <div class="titre-cap">${echapper(sort.nom)}${boutonOuBadge}</div>
                    <div class="voie-source">Rang ${sort.rang} · ${coutTexte}${tagAccorde}</div>
                    <div class="effet-cap">${echapper(sort.effet)}</div>
                  </div>`;
                }).join("");
              })()}
            </div>
            ` : ""}

            ${perso.estMort() ? `<p class="aide" style="color:#c0392b;font-weight:700;">💀 Mort.</p>`
              : perso.estMourant() ? `<p class="aide" style="color:#c0392b;font-weight:700;">🩸 Mourant(e) — Succès ${p.mortSucces || 0}/3 · Échecs ${p.mortEchecs || 0}/3. Jet de mort à son tour (onglet Battlemap) ou stabilisation via « Relever un allié ».</p>` : ""}

            ${doubleHeritageDispo ? `
              <div class="aide" style="margin-bottom:8px;display:flex;flex-direction:column;gap:4px;">
                <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="arme-double-heritage" /> 🧬 Double Héritage (1x/jour) : avantage sur le prochain test de Perception/Social/INT</label>
              </div>
            ` : ""}
            <div class="stats-rapides">
              ${CARACS.map((cc) =>
                `<div class="stat-box" style="cursor:pointer;" data-test="${cc.code}" title="Lancer un test de ${cc.nom}">
                  <div class="label">${cc.code}</div>
                  <div class="valeur">${signe(mods[cc.code])}</div>
                  <div style="font-size:0.65rem;opacity:0.7;">val. ${p.caracs[cc.code] + perso.bonusCaracCapacites(cc.code) + perso.bonusCaracDons(cc.code) + perso.bonusCaracEquipement(cc.code) + perso.bonusCaracMutations(cc.code)} · 🎲 test</div>
                  ${COMPETENCES_PAR_CARAC[cc.code] && COMPETENCES_PAR_CARAC[cc.code].length > 0 ? `
                    <details class="carac-competences" onclick="event.stopPropagation();">
                      <summary>Compétences</summary>
                      <div class="competences-liste">
                        ${COMPETENCES_PAR_CARAC[cc.code].map((nom) => {
                          const modComp = perso.modCompetence(nom, cc.code);
                          return `<button type="button" class="competence-btn" data-competence="${echapper(nom)}" data-carac="${cc.code}">${echapper(nom)} ${signe(modComp)}</button>`;
                        }).join("")}
                      </div>
                    </details>
                  ` : ""}
                </div>`).join("")}
            </div>

            <h3>Jets de sauvegarde</h3>
            <div class="sauvegardes-liste">
              ${Object.keys(SAUVEGARDES).map((nomSauv) => {
                const libelleSauv = (typeof Sauvegardes !== "undefined" && Sauvegardes.LIBELLES[nomSauv]) || nomSauv;
                const codeSauv = SAUVEGARDES[nomSauv];
                return `<button type="button" class="sauvegarde-btn" data-sauvegarde="${nomSauv}" data-carac="${codeSauv}" title="Lancer un jet de sauvegarde de ${libelleSauv} (${codeSauv})">
                  <span class="sauv-nom">${libelleSauv}</span>
                  <span class="sauv-valeur">${signe(perso.modSauvegarde(nomSauv))}</span>
                  <span class="sauv-carac">${codeSauv}</span>
                </button>`;
              }).join("")}
            </div>
            <p style="font-size:0.75rem;color:#8a8296;margin-top:6px;">Le défenseur lance : 1d20 + modificateur contre le DD annoncé par le MJ. Les bonus d'objets et les bonus conditionnels (vs magie, poison, corruption) ne sont pas encore chiffrés ici — à ajouter à la main au moment du jet.</p>

            <h3>Attaques rapides</h3>
            <div class="barre-actions">
              <button class="btn" data-attaque="contact" data-bonus="${attContact}">⚔️ Contact (${signe(attContact)})</button>
              <button class="btn" data-attaque="distance" data-bonus="${attDistance}">🏹 Distance (${signe(attDistance)})</button>
              ${attMagique !== null ? `<button class="btn" data-attaque="magique" data-bonus="${attMagique}">✨ Magique (${signe(attMagique)})</button>` : ""}
            </div>
            <p style="font-size:0.75rem;color:#8a8296;margin-top:6px;">Bonus d'attaque (jet, pas les dégâts) = bonus de progression (${ARCHETYPE_CLASSE[p.classe] || "martial"}, ${signe(perso.bonusProgression())} au niveau ${niveau}) + modificateur. Ajuste selon tes voies (ex. +1 Tir ajusté) au moment du jet via l'onglet Dés si besoin.</p>
          </div>

          ${htmlBlocFenetreReaction(id, p)}
          ${htmlEtatsActifs(p)}
          ${htmlBlocInitiativeJoueur(id)}
          ${htmlBlocChance(p, perso)}
          ${htmlBlocPierreChance(id, p)}
          ${htmlBlocDisparition(id, p)}
          ${htmlBlocCorruption(p, perso)}
          ${htmlBlocIllusions(p, perso)}
          ${htmlBlocAmes(p, perso)}

          <div class="carte">
            <h3>Capacités</h3>
            <div class="cible-capacite-form" style="display:none;">
              <select class="cible-capacite-select"></select>
              <label class="option-payer-cs" style="display:none;"><input type="checkbox" class="check-payer-cs" /> Payer en CS (Don corrompu)</label>
              <label class="option-supplement-cs" style="display:none;"><input type="checkbox" class="check-supplement-cs" /> Payer les points manquants en CS (Supplément corrompu)</label>
              <button class="btn petit or btn-confirmer-cible-capacite">Confirmer la cible</button>
              <button class="btn petit secondaire btn-annuler-cible-capacite">Annuler</button>
            </div>
            ${htmlDegatsCapaciteEnAttente(id)}
            ${capHtml}
          </div>

          ${race ? `<div class="carte"><h3>Capacités raciales — ${race.voie_nom}</h3>${capRaceHtml}</div>` : ""}

          ${perso.donsRequis() > 0 ? `<div class="carte">
            <h3>Dons</h3>
            ${htmlDons(p)}
            ${perso.donsManquants() > 0 ? `<button class="btn petit or" id="btn-choisir-don" style="margin-top:8px;">🎁 Choisir un don (niveau ${niveau})</button>` : ""}
          </div>` : ""}

          <div class="carte">
            <h3>Notes</h3>
            <textarea id="fiche-notes" rows="5" style="width:100%;resize:vertical;font-family:inherit;font-size:0.9rem;" placeholder="Notes libres (idées, quêtes en cours, objectifs...)">${echapper(p.notes || "")}</textarea>
          </div>
        </div>

        <div class="fiche-col-droite">
          ${htmlBlocBourse(p)}
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
    // Bourse (cf. htmlBlocBourse) — édition directe par le joueur.
    const _wireBourse = (elId, champ) => {
      document.getElementById(elId).onchange = (e) => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        const v = parseInt(e.target.value, 10);
        pp[champ] = isNaN(v) ? 0 : Math.max(0, v);
        sauverPersos(persos);
      };
    };
    _wireBourse("bourse-or", "piecesOr");
    _wireBourse("bourse-argent", "piecesArgent");
    _wireBourse("bourse-bronze", "piecesBronze");
    // Tests de carac. Avantage automatique (modeForce, même mécanisme
    // qu'Acteur ci-dessous) : Guerrier "Endurance de fer" sur le Test de CON
    // (contre la fatigue) ; Chevalier "Verdict inébranlable"/Moine "Vœu
    // inébranlable"/"Esprit fendu" sur le Test de SAG (résistance mentale) —
    // cf. Personnage.aEnduranceDeFer/aAvantageResistanceMentale. L'app n'a
    // qu'un bouton par caractéristique brute, pas de sous-catégorie
    // "fatigue"/"peur"/"tromperie" distincte : même simplification assumée
    // que pour Acteur (avantage sur le test brut entier).
    // Consomme une case "avantage 1x/jour" armée (INT héroïque/Double
    // Héritage) si elle est cochée — décrémente l'usage réel et décoche,
    // renvoie true si consommée (pour forcer modeForce="avantage" ce jet).
    const _armerAvantageJournalier = (checkboxId, cle) => {
      const cb = document.getElementById(checkboxId);
      if (!cb || !cb.checked || typeof Capacites === "undefined") return false;
      const persosFrais = chargerPersos();
      const pFrais = persosFrais[id];
      if (!pFrais) return false;
      const res = Capacites.verifierUsage(pFrais, cle, { usage: { frequence: "1x/jour" } });
      if (!res.ok) { toast(res.raison); cb.checked = false; return false; }
      res.appliquer();
      sauverPersos(persosFrais);
      cb.checked = false;
      return true;
    };
    zone.querySelectorAll("[data-test]").forEach((el) => {
      el.onclick = () => {
        const code = el.dataset.test;
        let modeForce = (code === "CON" && perso.aEnduranceDeFer()) || (code === "SAG" && perso.aAvantageResistanceMentale())
          ? "avantage" : null;
        if (code === "INT" && _armerAvantageJournalier("arme-double-heritage", "race:demi_elfe:5")) modeForce = "avantage";
        const bonusAmes = code === "INT" ? perso.bonusSavoirVole() : 0;
        lancerTest(`Test de ${code}`, mods[code] + bonusAmes, null, modeForce, { persoId: perso.id, caracCode: code });
        allerVers("des");
      };
    });
    // Tests de compétence (accordéon sous chaque carac). Don Acteur :
    // avantage sur Bluff/Représentation (tromperie/imitation, cf.
    // Personnage.aActeur) — modeForce impose l'avantage sur CE jet précis,
    // indépendamment du sélecteur global mode-d20. Demi-Elfe Double
    // Héritage : même principe sur Perception + les 4 compétences "Social"
    // (même groupe que Doué/Sens Affinés, cf. Personnage.bonusCompetence).
    // Guerrier "Force herculéenne" (Voie de l'élite rang 4) : même principe
    // sur Athlétisme (cf. Personnage.aForceHerculeenne).
    const COMPETENCES_ACTEUR = ["Bluff", "Représentation"];
    const COMPETENCES_DOUBLE_HERITAGE = ["Perception", "Bluff", "Intimidation", "Représentation", "Persuasion"];
    zone.querySelectorAll(".competence-btn").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const nom = el.dataset.competence;
        const code = el.dataset.carac;
        const bonus = perso.modCompetence(nom, code);
        let modeForce = (perso.aActeur() && COMPETENCES_ACTEUR.includes(nom)) || (nom === "Athlétisme" && perso.aForceHerculeenne())
          ? "avantage" : null;
        if (COMPETENCES_DOUBLE_HERITAGE.includes(nom) && _armerAvantageJournalier("arme-double-heritage", "race:demi_elfe:5")) modeForce = "avantage";
        lancerTest(`Test de ${nom}`, bonus, null, modeForce, { persoId: perso.id, caracCode: code });
        allerVers("des");
      };
    });
    // Jets de sauvegarde (modèle réactif : le défenseur lance, cf.
    // Personnage.modSauvegarde). Réutilise tel quel les avantages déjà câblés
    // sur les tests de carac bruts — Endurance de fer (CON → Vigueur) et
    // Verdict/Vœu inébranlable (SAG → Volonté) — plutôt que de redéclarer une
    // seconde table de conditions qui divergerait à la première évolution.
    zone.querySelectorAll(".sauvegarde-btn").forEach((el) => {
      el.onclick = () => {
        const nomSauv = el.dataset.sauvegarde;
        const codeSauv = el.dataset.carac;
        const libelleSauv = (typeof Sauvegardes !== "undefined" && Sauvegardes.LIBELLES[nomSauv]) || nomSauv;
        const modeForce = (codeSauv === "CON" && perso.aEnduranceDeFer()) || (codeSauv === "SAG" && perso.aAvantageResistanceMentale())
          ? "avantage" : null;
        lancerTest(`Sauvegarde de ${libelleSauv}`, perso.modSauvegarde(nomSauv), null, modeForce, { persoId: perso.id, caracCode: codeSauv });
        allerVers("des");
      };
    });
    // Attaques
    zone.querySelectorAll("[data-attaque]").forEach((el) => {
      el.onclick = () => {
        const bonus = parseInt(el.dataset.bonus, 10);
        lancerTest(`Attaque ${el.dataset.attaque}`, bonus, perso.critMinAttaque(el.dataset.attaque), null, { persoId: perso.id, caracCode: _caracPourTypeAttaque(el.dataset.attaque, perso) });
        allerVers("des");
      };
    });
    // Capacités (bouton "⚔️ Lancer"), compteurs d'usage et retrait manuel
    // d'état — logique partagée avec la mini-fiche battlemap (cf.
    // wireCapacitesEtEtats, scoppée sur `zone` pour ne jamais toucher au DOM
    // de l'autre vue si les deux sont montées en même temps).
    wireCapacitesEtEtats(zone, id, p, () => afficherFiche(id));
    document.getElementById("btn-niveau-up").onclick = () => monterDeNiveau(id);
    // Recalcule le max de PV avec la formule actuelle (utile pour les persos
    // créés avant un changement d'équilibrage, ex. +2 PV au niveau 1). Applique
    // le delta aux PV actuels ; même logique que le Don "Robuste" (cf. plus bas).
    const btnRecalcPv = document.getElementById("btn-recalculer-pv");
    if (btnRecalcPv) btnRecalcPv.onclick = () => {
      const persos = chargerPersos();
      const pp = persos[id];
      if (!pp) return;
      const nouveauMax = new Personnage(pp).pvCalcule();
      const ancienMax = pp.pvMax || 0;
      if (nouveauMax === ancienMax) { toast("PV déjà à jour (aucun changement)."); return; }
      const delta = nouveauMax - ancienMax;
      pp.pvActuel = Math.max(0, Math.min(nouveauMax, (pp.pvActuel || 0) + delta));
      pp.pvMax = nouveauMax;
      sauverPersos(persos);
      afficherFiche(id);
      toast(`PV recalculés : ${ancienMax} → ${nouveauMax} (${delta >= 0 ? "+" : ""}${delta}).`);
    };
    // Prêtre — Cercle de spécialisation (cf. prompt_pretre_cercle_vie.md
    // Partie 1) : select libre, éditable à tout moment (pas verrouillé à la
    // création — cohérent avec le reste des choix de la fiche, ex. dons).
    const selectCercle = document.getElementById("select-cercle-specialisation");
    if (selectCercle) selectCercle.onchange = () => {
      const persos = chargerPersos();
      const pp = persos[id];
      if (!pp) return;
      pp.cercleSpecialisation = selectCercle.value || null;
      sauverPersos(persos);
      afficherFiche(id);
      toast(pp.cercleSpecialisation ? `Cercle de spécialisation : ${selectCercle.value}.` : "Cercle de spécialisation retiré.");
    };
    // Repos long/court PP (cf. reference_systeme_magie_pp.md) : boutons
    // manuels, comme Capacites.reinitialiserUsage — pas de cycle jour/nuit
    // automatique dans l'app. Absents du DOM pour les classes sans PP
    // (ppMax === null), d'où les gardes getElementById.
    const btnReposLongPP = document.getElementById("btn-repos-long-pp");
    if (btnReposLongPP) btnReposLongPP.onclick = () => {
      const persos = chargerPersos();
      const pp = persos[id];
      if (!pp) return;
      const instance = new Personnage(pp);
      instance.reposLongPP();
      instance.reposLongPointsCercle();
      pp.ppActuel = instance.ppActuel;
      pp.pointsBenediction = instance.pointsBenediction;
      pp.pointsConviction = instance.pointsConviction;
      pp.pointsBannissement = instance.pointsBannissement;
      pp.pointsJugement = instance.pointsJugement;
      sauverPersos(persos);
      afficherFiche(id);
      toast("Repos long : Points de Pouvoir et Points de Cercle restaurés au maximum.");
    };
    const btnReposCourtPP = document.getElementById("btn-repos-court-pp");
    if (btnReposCourtPP) btnReposCourtPP.onclick = () => {
      const persos = chargerPersos();
      const pp = persos[id];
      if (!pp) return;
      const instance = new Personnage(pp);
      const avant = instance.ppActuel || 0;
      instance.reposCourtPP();
      pp.ppActuel = instance.ppActuel;
      sauverPersos(persos);
      afficherFiche(id);
      toast(`Repos court : Points de Pouvoir +${instance.ppActuel - avant} (${instance.ppActuel}/${instance.calculerPPMax()}).`);
    };
    document.getElementById("btn-editer-fiche").onclick = () => editerPerso(id);
    document.getElementById("btn-exporter-fiche").onclick = () => exporterPerso(id);
    // Grande illustration du personnage (cf. htmlPortraitFiche) — upload
    // compressé (max 600px) et retrait, réservés au propriétaire.
    const btnPortraitFiche = document.getElementById("btn-portrait-fiche");
    if (btnPortraitFiche) {
      const inp = document.getElementById("input-portrait-fiche");
      btnPortraitFiche.onclick = () => inp.click();
      inp.onchange = (e) => {
        lireImageRedimensionnee(e.target.files[0], 600, 0.82, (dataUrl) => {
          const pers = chargerPersos(); const pp = pers[id]; if (!pp) return;
          pp.illustration = dataUrl; sauverPersos(pers);
          toast("Illustration ajoutée ✔");
          afficherFiche(id);
        });
      };
      const supprPortrait = document.getElementById("btn-portrait-fiche-suppr");
      if (supprPortrait) supprPortrait.onclick = () => {
        const pers = chargerPersos(); const pp = pers[id]; if (!pp) return;
        delete pp.illustration; sauverPersos(pers);
        afficherFiche(id);
      };
    }
    // Rattrapage d'un Don manquant (perso déjà à ce niveau avant l'introduction
    // de la fonctionnalité, ou palier atteint sans choix fait) — persistance
    // directe comme ajusterPv/definirNotes, sans passer par la création.
    const btnChoisirDon = document.getElementById("btn-choisir-don");
    if (btnChoisirDon) btnChoisirDon.onclick = () => {
      ouvrirModalChoixDon(p.dons, (idDon) => {
        const persos = chargerPersos();
        const pp = persos[id];
        if (!pp) return;
        if (!pp.donsChoix) pp.donsChoix = {};
        finaliserChoixDon(idDon, pp, " ✔", () => {
          // Robuste modifie pvMax rétroactivement (cf. Personnage.bonusPvDons) —
          // pas de re-jet, juste le delta appliqué aussi aux PV actuels.
          if (idDon === "robuste") {
            const nouveauMax = new Personnage(pp).pvCalcule();
            pp.pvActuel = Math.min(nouveauMax, (pp.pvActuel || 0) + (nouveauMax - pp.pvMax));
            pp.pvMax = nouveauMax;
          }
          sauverPersos(persos);
          afficherFiche(id);
        });
      });
    };

    // Équipement — retirer un item équipé
    zone.querySelectorAll(".btn-desequiper").forEach((el) => {
      el.onclick = () => desequiperItem(id, el.dataset.slot);
    });
    // Équipement — ouvrir le sélecteur d'un slot vide
    zone.querySelectorAll(".btn-ouvrir-equiper").forEach((el) => {
      el.onclick = () => ouvrirSelecteurEquip(id, el.dataset.slot);
    });
    // Contrat Démoniaque — reset manuel (cf. rendreBlocEquipement)
    const btnResetContrat = zone.querySelector("#btn-reset-contrat-demoniaque");
    if (btnResetContrat) btnResetContrat.onclick = () => reinitialiserContratDemoniaque(id);
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
    // Inventaire — réanimer un allié Mort avec un parchemin de résurrection
    zone.querySelectorAll(".btn-reanimer-allie").forEach((el) => {
      el.onclick = () => ouvrirSelecteurReanimation(id, parseInt(el.dataset.idx, 10));
    });
    // Inventaire — apprendre un sort depuis un parchemin (Grimoire)
    zone.querySelectorAll(".btn-apprendre-sort").forEach((el) => {
      el.onclick = () => apprendreSortDepuisParchemin(id, parseInt(el.dataset.idx, 10));
    });
    // Carte Grimoire — bouton "Apprentissage" : replie/déplie la liste
    // complète du catalogue de classe (cf. rendu ci-dessus).
    zone.querySelectorAll(".btn-toggle-apprentissage-grimoire").forEach((el) => {
      el.onclick = () => {
        const liste = document.getElementById(`grimoire-apprentissage-${el.dataset.perso}`);
        if (liste) liste.style.display = liste.style.display === "none" ? "block" : "none";
      };
    });
    // Carte Grimoire — apprendre directement un sort choisi dans la liste
    // (pas de parchemin à consommer, cf. apprendreSortDirectementDuGrimoire).
    zone.querySelectorAll(".btn-apprendre-sort-direct").forEach((el) => {
      el.onclick = () => apprendreSortDirectementDuGrimoire(el.dataset.perso, el.dataset.sort);
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

  // Couleur de la barre de PV selon le pourcentage restant : vert (plein) →
  // ambre (entamé) → rouge (critique). Renvoie une valeur utilisable en CSS.
  function _couleurPv(pct) {
    if (pct <= 25) return "var(--chaos)";
    if (pct <= 55) return "#c9a43a";
    return "var(--succes)";
  }
  function _appliquerBarrePv(el, pct) {
    if (!el) return;
    el.style.width = pct + "%";
    el.style.background = _couleurPv(pct);
  }
  function majBarrePv(p) {
    const pct = Math.max(0, Math.min(100, (p.pvActuel / p.pvMax) * 100));
    _appliquerBarrePv(document.getElementById("barre-pv-rempli"), pct);
  }
  function majBarrePvSidebar(p) {
    const pct = Math.max(0, Math.min(100, (p.pvActuel / p.pvMax) * 100));
    _appliquerBarrePv(document.getElementById("bm-barre-pv-rempli"), pct);
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
  // Bascule l'état Mourant(e) (cf. REGLES_GENERALES "Mort et stabilisation")
  // à chaque franchissement du seuil de 0 PV : remet à zéro le jet de mort en
  // entrant (0 PV) comme en sortant (soin au-dessus de 0). Ne touche à rien
  // si le perso reste déjà à 0 PV (jet de mort en cours) ou déjà au-dessus.
  // Renvoie true si le perso vient d'entrer/sortir de l'état Mourant(e) — les
  // callers doivent alors forcer un re-rendu complet (afficherFiche/dock),
  // au-delà du simple _syncPvAffichages (barre + input PV), pour que le
  // badge Mourant/Mort et les boutons du dock (jet de mort, Relever un allié)
  // reflètent le changement sans attendre une réouverture manuelle de la fiche.
  function _majEtatMourant(p, pvAvant) {
    const etaitMourant = (pvAvant || 0) <= 0;
    const estMourant = (p.pvActuel || 0) <= 0;
    if (etaitMourant === estMourant) return false;
    p.mortSucces = 0;
    p.mortEchecs = 0;
    p.etatMort = false;
    return true;
  }
  // Re-rendu complet des vues affectées par une bascule d'état Mourant(e) —
  // mêmes cibles que releverAllie/jetDeMort.
  function _rerendreApresTransitionMourant(id) {
    if (ficheActiveId === id) afficherFiche(id);
    rendreFicheSidebarBattlemap(ficheSidebarActiveId);
    rendreDockCombat();
  }
  // Ajustement manuel MJ (+/-) : contrairement à soigner(), n'a jamais
  // appliqué le halving Corruption persistante (correction/triche assumée du
  // MJ, pas un vrai "soin") — un delta positif reste néanmoins un gain de PV
  // et doit donc pouvoir déclencher/payer la Dette du Soigneur (cf.
  // Personnage.appliquerGainPv, { ignorerCorruption: true }). Un delta négatif
  // (perte) n'a rien à voir avec un gain, inchangé.
  function ajusterPv(id, delta) {
    const persos = chargerPersos();
    const p = persos[id];
    const pvAvant = p.pvActuel;
    if (delta > 0) {
      Personnage.appliquerGainPv(p, delta, { ignorerCorruption: true });
    } else {
      p.pvActuel = Math.max(0, Math.min(p.pvMax, p.pvActuel + delta));
    }
    const transition = _majEtatMourant(p, pvAvant);
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    if (transition) _rerendreApresTransitionMourant(id);
  }
  // Saisie MJ d'une valeur PV absolue — même logique qu'ajusterPv ci-dessus :
  // une hausse est un gain de PV (Dette du Soigneur applicable), une baisse
  // ou une valeur inchangée ne l'est pas.
  function definirPv(id, val) {
    const persos = chargerPersos();
    const p = persos[id];
    const pvAvant = p.pvActuel;
    if (isNaN(val)) {
      // valeur invalide : inchangé, comme avant.
    } else if (val > p.pvActuel) {
      Personnage.appliquerGainPv(p, val - p.pvActuel, { ignorerCorruption: true });
    } else {
      p.pvActuel = Math.max(0, Math.min(p.pvMax, val));
    }
    const transition = _majEtatMourant(p, pvAvant);
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    if (transition) _rerendreApresTransitionMourant(id);
  }

  // Contrat Démoniaque (data/loot.json: contrat_demoniaque) : bouton de reset
  // manuel géré par le joueur lui-même (cf. rendreBlocEquipement) — pas de
  // notion de repos long dans l'app. Efface à la fois la pénalité de
  // caractéristique ET la disponibilité de l'usage.
  function reinitialiserContratDemoniaque(id) {
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    p.contratDemoniaqueUtilise = false;
    p.contratDemoniaquePenalite = null;
    sauverPersos(persos);
    if (ficheActiveId === id) afficherFiche(id);
    toast(`🔥 Contrat Démoniaque réinitialisé pour ${p.nom}.`);
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
  // l'équipement (undo d'un soin, correction manuelle...). typeDegats
  // ("physique"/"magique", cf. blocDegatsSubisHtml) détermine si le don
  // Maître des armures lourdes (-3 dégâts physiques, avant reductionDegats)
  // s'applique — sans effet sur des dégâts magiques.
  // coeurMontagneArme (optionnel) : case cochée sur le formulaire (cf.
  // blocDegatsSubisHtml/wireDegatsSubisGenerique) — Nain "Cœur de Montagne"
  // (rang racial 5, 1x/jour) annule intégralement ces dégâts. Consomme
  // l'usage du jour via Capacites.verifierUsage (même mécanique que les
  // capacités à fréquence limitée, appelée à la volée puisque Cœur de
  // Montagne ne passe jamais par Capacites.lancer()) ; si déjà utilisé
  // aujourd'hui, prévient et applique les dégâts normalement. Sanctuaire
  // (Magicien) n'a pas de paramètre dédié : détecté automatiquement via
  // l'état 'sanctuaire_magicien' posé par Capacites.lancer(), tant qu'il
  // est actif tout dégât typeDegats === "magique" est intégralement annulé.
  // rempartArme (optionnel) : case cochée pour Guerrier "Rempart" (Voie du
  // peuple rang 3, cf. Personnage.aRempart()) — condition "protège
  // activement un allié" non trackable automatiquement, déclarée par le
  // joueur à chaque jet, réduit de 2 les dégâts (tout type confondu).
  function subirDegats(id, degatsBruts, typeDegats, coeurMontagneArme, rempartArme, ignoreReduction, elementDegats) {
    degatsBruts = parseInt(degatsBruts, 10);
    if (isNaN(degatsBruts) || degatsBruts < 0) { toast("Entre un nombre de dégâts valide."); return; }
    const persos = chargerPersos();
    const p = persos[id];
    if (!p) return;
    const perso = Personnage.depuisJSON(p);

    // Guerrier — Voie du chaos, rang 1 "Premier sang" (passif) : +1 point de
    // jauge de Corruption de Fureur par attaque ennemie réussie contre lui —
    // chaque appel avec degatsBruts > 0 représente une attaque réussie dans
    // le modèle de l'app (ce formulaire n'est déclenché qu'après un coup
    // déjà déterminé comme réussi). Plafonné à 6 pour CETTE source passive
    // spécifiquement (d'autres capacités actives peuvent pousser plus haut,
    // comme avant ce chantier).
    if (degatsBruts > 0 && perso.aPremierSangGuerrier() && typeof Capacites !== "undefined" && (p.corruptionCombat || 0) < 6) {
      const franchi = Capacites.ajusterCorruptionCombat(p, 1);
      if (franchi) toast(`⚠️ ${p.nom} franchit le seuil de Corruption d'Âme (Corruption d'Âme +1, total ${p.corruptionMajeure}).`);
    }

    let coeurMontagneActif = false;
    if (coeurMontagneArme && perso.aCoeurDeMontagne() && typeof Capacites !== "undefined") {
      const res = Capacites.verifierUsage(p, "race:nain:5", { usage: { frequence: "1x/jour" } });
      if (res.ok) { res.appliquer(); coeurMontagneActif = true; }
      else toast(res.raison);
    }
    // Magicien — Voie de la magie protectrice, rang 5 "Sanctuaire" : pendant
    // sa durée (état 'sanctuaire_magicien', posé par Capacites.lancer et
    // décompté automatiquement comme tout autre état), immunité totale aux
    // dégâts marqués "magique" — détection automatique, pas de case à
    // cocher (même principe que l'état 'renversee' ailleurs dans l'app).
    const sanctuaireActif = typeDegats === "magique" && (p.etatsActifs || []).some((e) => e.idEtat === "sanctuaire_magicien");
    // Druide — Voie du chaos, rang 5 "Forme du chaos sauvage" : pendant sa
    // durée (état 'forme_chaos_sauvage'), divise par 2 (arrondi inf.) les
    // dégâts PHYSIQUES uniquement — détection automatique, même principe.
    // Nécromancien "Avatar du chaos" et Magicien "Avatar du Vide" (même voie,
    // même rang 5, même texte "divise par 2 les DM physiques subis") partagent
    // cette mécanique via leurs propres états dédiés.
    const formeChaosActive = typeDegats === "physique" && (p.etatsActifs || []).some(
      (e) => e.idEtat === "forme_chaos_sauvage" || e.idEtat === "avatar_du_chaos" || e.idEtat === "avatar_du_vide");
    // Druide — Voie des compagnons, rang 5 "Forme animale" (choix "ours",
    // tank) : même principe que Forme du chaos sauvage ci-dessus, divise par
    // 2 (arrondi inf.) les dégâts PHYSIQUES uniquement pendant sa durée.
    const formeOursActive = typeDegats === "physique" && (p.etatsActifs || []).some((e) => e.idEtat === "forme_ours");
    const rempartActif = !!rempartArme && perso.aRempart();

    const reductionLourde = typeDegats === "physique" ? perso.bonusReductionLourdeDons() : 0;
    // Druide — Voie de la nature, rang 4 "Résistance naturelle" : sur le
    // type "naturel" (froid/chaleur/chute/poison/animal) ET sur "chute"
    // (cf. lot "armures C" — 4e valeur du sélecteur, distincte de "naturel"
    // pour permettre à "robuste" de cibler UNIQUEMENT la chute, mais "chute"
    // reste un sous-cas de "naturel" pour ce don, qui continue à s'appliquer).
    const reductionNaturelle = (typeDegats === "naturel" || typeDegats === "chute") ? perso.reductionDegatsNaturels() : 0;
    // ignoreReduction (cf. affixes de rareté "broyeuse" et co., js/raretes.js) :
    // points de reductionDegats de la cible neutralisés par CETTE attaque.
    const reductionArmure = Math.max(0, perso.reductionDegats() - (ignoreReduction || 0)); // inclut désormais Écorce partagée (bonusTemporaire)
    const reductionRempart = rempartActif ? 2 : 0;
    // Affixes de rareté "renforcee"/"impenetrable"/"increvable" (cf. lot
    // "armures A") : N points de dégâts PHYSIQUES en plus de reductionArmure
    // — champ dédié (bonusReductionPhysique), jamais fusionné à
    // item.reductionDegats (qui réduit tous les types), même garde-fou
    // typeDegats === "physique" que reductionLourde ci-dessus.
    const reductionEquipementPhysique = typeDegats === "physique" ? perso.bonusReductionPhysiqueEquipement() : 0;
    // Résistances élémentaires (cf. "résistante"/armure_ecailles,
    // "renforcé"/"polyvalent"/anneau_resistance, lot "armures C" — cluster
    // résistances) : dimension INDÉPENDANTE de typeDegats (physique/magique/
    // naturel/chute) — une attaque "magique" élémentaire (ex. Toucher glacial,
    // typedegats magique + elementaire froid) reste "magique" pour
    // Sanctuaire/réfléchissante, ET "froid" pour cette résistance-ci, d'où le
    // paramètre elementDegats séparé plutôt qu'une 5e valeur du sélecteur
    // typeDegats. Cf. Personnage.reductionElementaireEquipement.
    const reductionEquipementElementaire = elementDegats ? perso.reductionElementaireEquipement(elementDegats) : 0;
    const reductionFlatTotale = reductionLourde + reductionNaturelle + reductionArmure + reductionRempart + reductionEquipementPhysique + reductionEquipementElementaire;
    let degatsNets = Math.max(0, degatsBruts - reductionFlatTotale);
    // Demi-Orc — Résistance Instinctive (rang racial 3) : -3 dégâts quand le
    // résultat passerait sous la moitié des PV max.
    degatsNets = Math.max(0, degatsNets - perso.reductionSeuilBasPv(degatsNets));
    if (formeChaosActive || formeOursActive) degatsNets = Math.floor(degatsNets / 2);
    // "robuste" (armure_cloute, cf. lot "armures C") : réduction
    // FRACTIONNAIRE (moitié/totalité) des dégâts de chute — même principe
    // que formeChaosActive/formeOursActive ci-dessus (appliquée sur
    // degatsNets, après la réduction plate), fraction lue dynamiquement au
    // lieu d'un simple /2 codé en dur.
    const fractionChute = typeDegats === "chute" ? perso.fractionReductionChuteEquipement() : 0;
    if (fractionChute > 0) degatsNets = Math.floor(degatsNets * (1 - fractionChute));
    if (coeurMontagneActif || sanctuaireActif) degatsNets = 0;

    // PV temporaires (cf. Capacites.appliquerPvTemporairesSurPerso) : absorbent
    // les dégâts en priorité, avant les PV réels — jamais de réduction
    // d'armure appliquée dessus (déjà comptée dans degatsNets ci-dessus).
    const pvTempAvant = p.pvTemporaires || 0;
    const absorbeParPvTemp = Math.min(pvTempAvant, degatsNets);
    p.pvTemporaires = pvTempAvant - absorbeParPvTemp;
    const degatsVersPvReels = degatsNets - absorbeParPvTemp;

    // Prêtre — Voie du chaos, rang 5 "Le fléau, c'est moi !" : pendant sa
    // durée (état 'increvable'), les PV ne peuvent pas descendre sous 1 —
    // plancher spécial distinct du KO normal à 0 PV, détection automatique
    // même principe que Sanctuaire/Forme du chaos sauvage ci-dessus.
    const increvableActif = (p.etatsActifs || []).some((e) => e.idEtat === "increvable");
    const pvAvant = p.pvActuel;
    const planchePv = (increvableActif && pvAvant > 0) ? 1 : 0;
    p.pvActuel = Math.max(planchePv, p.pvActuel - degatsVersPvReels);
    const transition = _majEtatMourant(p, pvAvant);
    sauverPersos(persos);
    _syncPvAffichages(id, p);
    if (transition) _rerendreApresTransitionMourant(id);

    let message;
    if (coeurMontagneActif) message = `🏔 Cœur de Montagne : ${degatsBruts} dégâts encaissés sans dommage.`;
    else if (sanctuaireActif) message = `✨ Sanctuaire : ${degatsBruts} dégâts magiques encaissés sans dommage.`;
    else {
      const sources = [];
      if (reductionArmure > 0) sources.push("armure");
      if (reductionLourde > 0) sources.push("don");
      if (reductionNaturelle > 0) sources.push("résistance naturelle");
      if (reductionRempart > 0) sources.push("Rempart");
      if (reductionEquipementPhysique > 0) sources.push("affixe");
      if (reductionEquipementElementaire > 0) sources.push(`résistance ${elementDegats}`);
      const suffixeReduction = sources.length ? ` après réduction (${sources.join(" + ")}, −${reductionFlatTotale})` : "";
      const suffixeChaos = formeChaosActive ? " puis divisés par 2 (Forme du chaos sauvage)"
        : formeOursActive ? " puis divisés par 2 (Forme animale — Ours)"
        : fractionChute === 1 ? " puis annulés (robuste)"
        : fractionChute > 0 ? ` puis réduits de ${Math.round(fractionChute * 100)}% (robuste)` : "";
      const suffixePvTemp = absorbeParPvTemp > 0 ? ` dont ${absorbeParPvTemp} absorbés par les PV temporaires (${p.pvTemporaires} restants)` : "";
      message = (sources.length || formeChaosActive || formeOursActive || fractionChute > 0 || absorbeParPvTemp > 0)
        ? `🛡 ${degatsBruts} dégâts subis${suffixeReduction}${suffixeChaos} → ${degatsNets}${suffixePvTemp}, ${degatsVersPvReels} sur les PV réels.`
        : `${degatsVersPvReels} dégâts subis.`;
    }
    toast(message);
  }

  // HTML + câblage du petit formulaire "Subir des dégâts", réutilisé par la
  // fiche complète, la mini-fiche battlemap et la table de combat (monstres) —
  // prefixe distingue les ids. Le sélecteur de type (physique/magique/
  // naturel) sert au don Maître des armures lourdes et à Résistance
  // naturelle (cf. subirDegats) ; ignoré côté monstre, qui n'a pas ces
  // mécaniques. `perso`/`p` (optionnels, absents côté monstre) : affiche la
  // case Cœur de Montagne (Nain, rang racial 5, 1x/jour) si le perso l'a et
  // ne l'a pas déjà utilisée aujourd'hui (cf. Capacites.verifierUsage, même
  // mécanique que les capacités à fréquence limitée, appelée ici avec une
  // mecanique construite à la volée puisque Cœur de Montagne ne passe jamais
  // par Capacites.lancer()), et la case Rempart (Guerrier, Voie du peuple
  // rang 3, fréquence libre — pas de suivi d'usage, juste une déclaration
  // manuelle à chaque jet).
  function blocDegatsSubisHtml(prefixe, perso, p) {
    const coeurMontagneDispo = !!(perso && perso.aCoeurDeMontagne() && typeof Capacites !== "undefined" &&
      Capacites.verifierUsage(p || {}, "race:nain:5", { usage: { frequence: "1x/jour" } }).ok);
    const rempartDispo = !!(perso && perso.aRempart());
    return `
      <button class="btn petit danger btn-toggle-degats" id="${prefixe}btn-toggle-degats" style="width:100%;">🛡 Subir des dégâts</button>
      <div class="degats-subis" id="${prefixe}degats-subis-form" style="display:none;">
        <input type="number" id="${prefixe}champ-degats-bruts" placeholder="Dégâts bruts" min="0" />
        <select id="${prefixe}type-degats-subis">
          <option value="physique" selected>Physique</option>
          <option value="magique">Magique</option>
          <option value="naturel">Naturel (froid/chaleur/chute/poison/animal)</option>
          <option value="chute">Chute (cf. "robuste", armure_cloute)</option>
        </select>
        <select id="${prefixe}element-degats-subis" title="Élément (cumulable avec le type ci-dessus — cf. Toucher glacial : magique + froid) : lu par les résistances élémentaires (anneau_resistance, armure_ecailles)">
          <option value="" selected>Aucun élément</option>
          <option value="feu">Feu</option>
          <option value="froid">Froid</option>
          <option value="chaos">Chaos</option>
          <option value="mental">Mental</option>
          <option value="sacre">Sacré</option>
        </select>
        ${coeurMontagneDispo ? `<label style="display:flex;align-items:center;gap:4px;font-size:0.78rem;"><input type="checkbox" id="${prefixe}coeur-montagne" /> 🏔 Cœur de Montagne (annule ces dégâts, 1x/jour)</label>` : ""}
        ${rempartDispo ? `<label style="display:flex;align-items:center;gap:4px;font-size:0.78rem;"><input type="checkbox" id="${prefixe}rempart" /> 🛡️ Rempart (protège activement un allié, −2)</label>` : ""}
        <button class="btn petit or" id="${prefixe}btn-appliquer-degats">Appliquer</button>
      </div>`;
  }
  function wireDegatsSubis(id, prefixe) {
    wireDegatsSubisGenerique(prefixe, (val, typeDegats, coeurMontagneArme, rempartArme, elementDegats) =>
      subirDegats(id, val, typeDegats, coeurMontagneArme, rempartArme, undefined, elementDegats));
  }

  // Câblage générique du petit formulaire "Subir des dégâts" (toggle + input +
  // bouton + Entrée) : `appliquer(valeurBrute, typeDegats, ..., elementDegats)`
  // porte la logique propre à l'appelant (joueur via subirDegats, monstre de
  // la table de combat, etc. — ce dernier ignore simplement les arguments en
  // trop).
  function wireDegatsSubisGenerique(prefixe, appliquer) {
    const btnToggle = document.getElementById(`${prefixe}btn-toggle-degats`);
    const form = document.getElementById(`${prefixe}degats-subis-form`);
    const champ = document.getElementById(`${prefixe}champ-degats-bruts`);
    const selType = document.getElementById(`${prefixe}type-degats-subis`);
    const selElement = document.getElementById(`${prefixe}element-degats-subis`);
    const caseCoeurMontagne = document.getElementById(`${prefixe}coeur-montagne`);
    const caseRempart = document.getElementById(`${prefixe}rempart`);
    if (!btnToggle || !form || !champ) return;
    btnToggle.onclick = () => {
      form.style.display = form.style.display === "none" ? "flex" : "none";
      if (form.style.display === "flex") champ.focus();
    };
    const appliquerEtVider = () => {
      appliquer(champ.value, selType ? selType.value : "physique", !!(caseCoeurMontagne && caseCoeurMontagne.checked), !!(caseRempart && caseRempart.checked), selElement ? selElement.value || null : null);
      champ.value = "";
      if (caseCoeurMontagne) caseCoeurMontagne.checked = false;
      if (caseRempart) caseRempart.checked = false;
      if (selElement) selElement.value = "";
    };
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
    if (!creation.capacitesRaceChoix) creation.capacitesRaceChoix = {}; // compat fiches créées avant les rangs raciaux à choix
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
    if (!creation.dons) creation.dons = []; // compat fiches créées avant les Dons (niveaux 4/8/12)
    if (!creation.donsChoix) creation.donsChoix = {}; // compat fiches créées avant les dons à choix (Amélioration de caractéristique)
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

  // Persiste immédiatement niveau + PV + dons du personnage `id` dans
  // persos/Firestore, à partir de l'état courant du brouillon `creation` —
  // utilisé par monterDeNiveau ci-dessous, PAS par le reste du flux de
  // création/édition (qui reste un brouillon en mémoire tant que
  // sauverPersonnage() n'est pas explicitement appelée). Ne touche jamais
  // nom/classe/race/voies : seulement niveau/PV/dons, les champs qu'un
  // niveau garantit valides immédiatement (contrairement à un choix de
  // capacité de voie encore en cours, cf. pointsVoieRestants()).
  // Bug réellement rencontré à table : un joueur qui montait de niveau puis
  // changeait d'onglet (ex. retour sur "Ma fiche") AVANT d'avoir cliqué
  // "Enregistrer" perdait silencieusement le niveau/PV fraîchement gagnés
  // (et, séparément, le don gratuit choisi aux niveaux 4/8/12 — ex.
  // Amélioration de caractéristique — puisque `dons`/`donsChoix` n'étaient
  // pas non plus persistés), `creation` étant abandonné au profit de la
  // fiche encore persistée à l'ancien niveau.
  function _persisterNiveauEtPv(id) {
    const persosActuels = chargerPersos();
    const p = persosActuels[id];
    if (!p) return;
    p.niveau = creation.niveau;
    p.pvMax = pvTotalActuel();
    p.pvHistorique = creation.pvHistorique;
    p.pvNiveauActuel = creation.pvNiveauActuel;
    if (p.pvActuel === null || p.pvActuel > p.pvMax) p.pvActuel = p.pvMax;
    p.dons = creation.dons;
    p.donsChoix = creation.donsChoix;
    p.grimoireSortsConnus = creation.grimoireSortsConnus;
    sauverPersos(persosActuels);
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
    _persisterNiveauEtPv(id);
    _jouerSonNiveau();

    toast(`Niveau ${creation.niveau} ! +${gainPv} PV (total ${pvTotalActuel()}, déjà enregistré). Points de capacité : ${pointsVoieRestants()}/${pointsVoieTotal()}. Choisis tes nouvelles capacités puis pense à enregistrer.`);
    allerEtape(2);

    // Don gratuit aux niveaux 4/8/12 (cf. data/dons.js) : gratuit, n'entame pas
    // les points de voie. Ne propose que s'il manque effectivement un choix
    // pour le palier atteint (pas de doublon avec un don déjà pris).
    if (!creation.dons) creation.dons = [];
    if (Personnage.donsRequisPourNiveau(creation.niveau) > creation.dons.length) {
      ouvrirModalChoixDon(creation.dons, (idDon) => {
        finaliserChoixDon(idDon, creation, " Déjà enregistré. Pense à enregistrer tes autres capacités.", () => {
          champPv.value = pvTotalActuel(); // reflète Robuste si c'est le don choisi
          _persisterNiveauEtPv(id); // idem : Robuste (+2 PV/niveau) ne doit pas non plus se perdre en changeant d'onglet
        });
      });
    }

    // Sorts hors Voies (cf. reference_sorts_connus.md) : un casteur pur
    // (CARAC_MAGIE défini) avec un slot de Grimoire encore libre se voit
    // proposer un sort non encore connu à chaque montée de niveau — pas
    // d'apprentissage forcé (fermer le modal sans choisir ne fait rien, cf.
    // ouvrirModalChoixCapacite/btn-fermer-modal-choix-capacite). Recherche
    // via parchemin (Partie 2 point 1) reste le seul autre canal.
    if (typeof CARAC_MAGIE !== "undefined" && CARAC_MAGIE[creation.classe] && typeof SORTS_PAR_CLASSE !== "undefined" && SORTS_PAR_CLASSE[creation.classe]) {
      const catalogue = SORTS_PAR_CLASSE[creation.classe];
      const slots = new Personnage(creation).slotsGrimoire();
      const connus = creation.grimoireSortsConnus || [];
      // Exclut les sorts accordés directement par un rang de voie (cf.
      // SORTS_ACCORDES_PAR_VOIE, data/donnees.js) — pas d'intérêt à proposer
      // de les apprendre via un slot, ils sont déjà connus autrement.
      const accordes = (typeof SORTS_ACCORDES_PAR_VOIE !== "undefined" ? SORTS_ACCORDES_PAR_VOIE : [])
        .filter((e) => e.classe === creation.classe).map((e) => e.idSort);
      const disponibles = catalogue.filter((s) => !connus.includes(s.id) && !accordes.includes(s.id));
      if (slots > connus.length && disponibles.length) {
        ouvrirModalChoixCapacite({
          titre: "Nouveau sort disponible",
          consigne: `Slot de Grimoire libre (${connus.length}/${slots}) — apprends un nouveau sort, ou ferme cette fenêtre pour l'apprendre plus tard (parchemin) :`,
          options: disponibles.map((s) => ({ label: `${s.nom} (rang ${s.rang}, ${s.mecanique.coutPP || 0} PP) — ${s.effet}`, valeur: s.id })),
        }, (sortId) => {
          creation.grimoireSortsConnus = (creation.grimoireSortsConnus || []).concat([sortId]);
          _persisterNiveauEtPv(id);
          const sort = catalogue.find((s) => s.id === sortId);
          toast(`📖 « ${sort ? sort.nom : sortId} » ajouté au Grimoire. Déjà enregistré.`);
        });
      }
    }
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

  // Lance 1 ou 2d20 selon le mode (normal/avantage/désavantage) — factorisé
  // entre lancerTest (tests avec bonus) et lancerDeSimple (bouton "d20" brut
  // de la section Dés simples), pour que le sélecteur global mode-d20
  // s'applique identiquement aux deux et alimente la même animation duo
  // côté overlay (cf. afficherOverlayJet).
  function _lancerD20SelonMode(mode) {
    let d1 = lancerDe(20), d2 = lancerDe(20), de, detailDes;
    if (mode === "avantage") { de = Math.max(d1, d2); detailDes = `2d20 av. [${d1}, ${d2}] → ${de}`; }
    else if (mode === "desavantage") { de = Math.min(d1, d2); detailDes = `2d20 dés. [${d1}, ${d2}] → ${de}`; }
    else { de = d1; detailDes = `d20 → ${de}`; }
    return { de, d1, d2, detailDes };
  }

  // Test = 1d20 + bonus, gère avantage/désavantage. critMin : seuil de
  // critique (20 par défaut, abaissé par certaines capacités — cf.
  // Personnage.critMinAttaque, ex. Guerrier "Précision létale" à 19).
  // modeForce (optionnel) : impose "avantage"/"desavantage" indépendamment du
  // sélecteur global mode-d20 — sert à Expert du bouclier (cf.
  // _resoudreAttaqueMonstreVsPJ), qui désavantage l'ATTAQUANT d'une cible
  // précise plutôt que de dépendre du réglage manuel de qui lance le dé.
  // Renvoie { total, de, crit, echec } — lu par _resoudreAttaqueRapide pour
  // gater le bouton de dégâts sans dupliquer le tirage de dés/le journal ;
  // les appelants historiques (ne regardant pas le retour) ne sont pas affectés.
  // opts = { persoId, caracCode } (tous deux optionnels) : identifie le PJ qui
  // lance CE jet précis et la caractéristique dont il dépend, uniquement pour
  // activer le Contrat Démoniaque / l'Anneau de Chance sur Naturel s'il les
  // porte (data/loot.json) — cf. _proposerBonusItemsLance/_apresJetAnneauChance
  // ci-dessous. Sans opts.persoId (dés libres, panneau "Dés"), aucun item ne
  // s'active : comportement strictement inchangé.
  function lancerTest(label, bonus, critMin, modeForce, opts) {
    opts = opts || {};
    bonus = bonus || 0;
    critMin = critMin || 20;
    const bonusItems = opts.persoId ? _proposerBonusItemsLancer(opts.persoId, opts.caracCode) : 0;
    bonus += bonusItems;
    const mode = modeForce || modeD20();
    const { de, d1, d2, detailDes } = _lancerD20SelonMode(mode);
    const total = de + bonus;
    const crit = (de >= critMin), echec = (de === 1);
    const detail = `${detailDes} ${signe(bonus)}`;
    afficherResultat(label, total, detail, crit, echec);
    ajouterHisto(label + " " + signe(bonus), total, crit, echec, detail, { mode, d1, d2, estMonstre: !!opts.estMonstre });
    if (echec && opts.persoId) _apresJetAnneauChance(opts.persoId);
    // Pierre de chance "insistante"/"protectrice" (cf. lot "jour" — relance un
    // jet raté) : mémorise CE jet pour une relance manuelle ultérieure (cf.
    // _relancerDernierJet/htmlBlocPierreChance) — "raté" n'est pas toujours
    // connu de l'app (beaucoup de jets libres n'ont pas de DC suivie), c'est
    // au joueur de juger et de cliquer le bouton, pas à lancerTest de deviner.
    if (opts.persoId) dernierJetRelancable = { persoId: opts.persoId, label, bonus, critMin, mode, total, de, crit, echec };
    return { total, de, crit, echec };
  }

  // Attaque d'Opportunité générique semi-auto (cf. §3 de
  // reference_sauvegardes_reactions.md) — appelée par js/carte.js
  // (demarrerDragDD/finDragDD) quand un token monstre quitte une case
  // adjacente à un PJ éligible (CLASSES_ELIGIBLES_AO, data/donnees.js).
  // Consomme le pool générique de réactions (Capacites.REACTIONS_MAX/
  // reactionsRestantes, cf. js/capacites.js) — silencieux (pas de popup) si
  // le PJ n'a plus de réaction disponible. nomMonstre : déjà résolu côté
  // carte.js (tok.nom), pas de lookup ici.
  // Portée volontairement limitée au jet d'attaque seul (pas de résolution
  // de dégâts) — distinct du bouton "Attaque d'opportunité" existant
  // (Sentinelle/Expert en hast, cf. htmlBlocAttaqueOpportunite), qui reste
  // la voie complète (dégâts inclus) pour les dons qui le permettent.
  function proposerAttaqueOpportunite(persoId, nomMonstre) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return;
    const restantes = (typeof Capacites !== "undefined" && Capacites.reactionsRestantes) ? Capacites.reactionsRestantes(p) : 0;
    if (restantes < 1) return;
    const cible = nomMonstre || "la cible";
    if (!confirm(`Attaque d'Opportunité disponible contre ${cible} avec ${p.nom} (${restantes} réaction(s) restante(s)). Lancer l'attaque ?`)) return;
    p.reactionsUtilisees = (p.reactionsUtilisees || 0) + 1;
    sauverPersos(persos);
    const perso = Personnage.depuisJSON(p);
    const bonus = perso.bonusAttaque("contact");
    const critMin = perso.critMinAttaque("contact");
    lancerTest(`Attaque d'Opportunité (${p.nom} vs ${cible})`, bonus, critMin, null, { persoId, caracCode: "FOR" });
  }

  // Contrat Démoniaque (contrat_demoniaque) / Anneau de Chance sur Naturel
  // (anneau_chance_naturel) : proposés AVANT le jet (prompt/confirm), un seul
  // item à la fois peut se déclencher par clic — chacun modifie `bonus` et
  // pose son propre state persistant sur le perso. Retourne le bonus total à
  // ajouter au jet (0 si aucun item porté, ou si le joueur décline).
  function _proposerBonusItemsLancer(persoId, caracCode) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p) return 0;
    const perso = Personnage.depuisJSON(p);
    const items = perso._itemsEquipesUniques();
    let bonusTotal = 0;
    let modifie = false;
    // Contrat Démoniaque : la pénalité qu'il pose dépend de la caractéristique
    // liée au jet — sans caracCode connu (ex. jet libre non rattaché à une
    // carac précise), l'item n'a rien de cohérent à pénaliser, donc on ne le
    // propose pas plutôt que de deviner.
    if (caracCode && !p.contratDemoniaqueUtilise && items.some((it) => it.id === "contrat_demoniaque")) {
      const saisie = prompt(`🔥 Contrat Démoniaque : utiliser sur ce jet ? Choisis un bonus (nombre entier), ou laisse vide pour ne pas l'utiliser.\nEn contrepartie, cette valeur sera déduite du modificateur de ${caracCode} jusqu'à réinitialisation manuelle du contrat.`);
      const n = saisie === null || saisie.trim() === "" ? NaN : parseInt(saisie, 10);
      if (!isNaN(n) && n !== 0) {
        bonusTotal += n;
        p.contratDemoniaqueUtilise = true;
        p.contratDemoniaquePenalite = { carac: caracCode, valeur: n };
        modifie = true;
      }
    }
    if (items.some((it) => it.id === "anneau_chance_naturel")) {
      const cumulsAvant = p.anneauChanceCumuls || 0;
      const ok = confirm(`💍 Anneau de Chance sur Naturel : ajouter +5 à ce jet ?\nCumuls actuels : ${cumulsAvant} — un 1 naturel infligera alors ${cumulsAvant + 1}d10 de dégâts directs.`);
      if (ok) {
        bonusTotal += 5;
        p.anneauChanceCumuls = cumulsAvant + 1;
        modifie = true;
      }
    }
    if (modifie) sauverPersos(persos);
    return bonusTotal;
  }

  // Contrecoup de l'Anneau de Chance sur Naturel : appelé uniquement après un
  // jet en 1 naturel (echec === true, cf. lancerTest ci-dessus). Dégâts
  // DIRECTS (pas de réduction d'armure/PV temporaires — c'est une malédiction,
  // pas une attaque), cumuls remis à 0 quoi qu'il arrive.
  function _apresJetAnneauChance(persoId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    if (!p || !p.anneauChanceCumuls) return;
    const cumuls = p.anneauChanceCumuls;
    const jets = [];
    let total = 0;
    for (let i = 0; i < cumuls; i++) { const v = lancerDe(10); jets.push(v); total += v; }
    p.anneauChanceCumuls = 0;
    const avant = p.pvActuel;
    p.pvActuel = Math.max(0, p.pvActuel - total);
    ajouterHisto(`${p.nom} — Contrecoup de l'Anneau de Chance`, -total, false, false, `${cumuls}d10 [${jets.join(",")}]`);
    const transition = _majEtatMourant(p, avant);
    sauverPersos(persos);
    _syncPvAffichages(persoId, p);
    if (transition) _rerendreApresTransitionMourant(persoId);
    toast(`💍 1 naturel ! L'Anneau de Chance inflige ${total} dégâts directs à ${p.nom} (${cumuls}d10, cumuls remis à 0).`);
  }

  // Item équipé portant une relance "relance" disponible (cf. "insistante"/
  // "protectrice", Pierre de chance) — même patron que _itemEsquiveDisponible :
  // renvoie { it, d, usage } (usage vérifié, pas encore consommé) ou null.
  function _itemRelanceDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "relance") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "relance")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Relance manuelle du dernier test d20 de CE PJ (cf. dernierJetRelancable,
  // posé par lancerTest) via Pierre de chance — c'est au joueur de juger
  // qu'un jet est "raté" (l'app ne connaît pas toujours la DC d'un test
  // libre) et de cliquer le bouton, pas à l'app de deviner. garderMeilleur
  // (cf. "insistante" légendaire, effets[].garderMeilleur) : conserve le
  // MEILLEUR des deux totaux plutôt que d'imposer le nouveau — absent/false
  // pour tous les autres paliers (relance standard, nouveau résultat gardé).
  // Un seul jet relançable à la fois (remis à null après usage) : on ne
  // relance jamais une relance.
  function _relancerDernierJet(persoId) {
    if (!dernierJetRelancable || dernierJetRelancable.persoId !== persoId) return;
    const persos = chargerPersos();
    const p = persos[persoId];
    const dispo = p && _itemRelanceDisponible(p);
    if (!dispo) { toast("Relance indisponible."); return; }
    const ancien = dernierJetRelancable;
    dispo.usage.appliquer();
    sauverPersos(persos);
    const effetRelance = dispo.d.effets.find((e) => e.type === "relance");
    const { de, d1, d2, detailDes } = _lancerD20SelonMode(ancien.mode);
    const nouveauTotal = de + ancien.bonus;
    const garderMeilleur = !!(effetRelance && effetRelance.garderMeilleur);
    const garderAncien = garderMeilleur && ancien.total > nouveauTotal;
    const totalFinal = garderAncien ? ancien.total : nouveauTotal;
    const critFinal = garderAncien ? ancien.crit : (de >= ancien.critMin);
    const echecFinal = garderAncien ? ancien.echec : (de === 1);
    const detail = `${detailDes} ${signe(ancien.bonus)} (ancien jet : ${ancien.total})`;
    afficherResultat(`${ancien.label} (relance)`, totalFinal, detail, critFinal, echecFinal);
    ajouterHisto(`${ancien.label} (relance, ${dispo.it.nom})`, totalFinal, critFinal, echecFinal, detail, { mode: ancien.mode, d1, d2 });
    dernierJetRelancable = null;
    toast(garderAncien
      ? `🍀 ${dispo.it.nom} : relance à ${nouveauTotal}, meilleur résultat conservé (${totalFinal}).`
      : `🍀 ${dispo.it.nom} : jet relancé — ${totalFinal}.`);
  }

  // d20 "simple" (section Dés simples) : respecte quand même le mode
  // avantage/désavantage global juste au-dessus (modeD20) — sinon ce bouton
  // ignorerait silencieusement le sélecteur qu'il jouxte. Les autres faces
  // (d4/d6/d8/d10/d12/d100) n'ont pas de notion d'avantage en COF, elles
  // restent un jet unique, inchangé.
  function lancerDeSimple(faces) {
    if (faces === 20) {
      const mode = modeD20();
      const { de, d1, d2, detailDes } = _lancerD20SelonMode(mode);
      const crit = de === 20, echec = de === 1;
      afficherResultat("d20", de, detailDes, crit, echec);
      ajouterHisto("d20", de, crit, echec, detailDes, { mode, d1, d2 });
      return;
    }
    const v = lancerDe(faces);
    const detail = `1d${faces}`;
    afficherResultat(`d${faces}`, v, detail, false, false);
    ajouterHisto(`d${faces}`, v, false, false, detail);
  }

  // Parse une formule type "2d6+3", "1d20-1" ou "1d8+1d4+2" (plusieurs
  // termes de dés, ex. dégâts de contact bi-arme — cf. Personnage.
  // armeCourteSecondaire). label : texte affiché dans le résultat/journal à
  // la place de la formule brute (ex. attaques de monstre, où "1d4" seul ne
  // dit pas de qui/quoi il s'agit) — par défaut la formule elle-même.
  // `critique` (cf. liaison attaque->dégâts, _resoudreAttaqueRapide) :
  // multiplie le NOMBRE de dés de chaque terme "NdF" avant de les lancer
  // (1d8 devient 2d8) plutôt que de relancer une seconde fois et
  // additionner — mathématiquement équivalent, un seul tirage, plus simple
  // à intégrer ici que la variante de js/capacites.js (qui, elle, relance
  // deux fois pour garder le détail "1d8[x]+1d8[y]" affiché par le moteur
  // de capacités). Accepte soit un booléen (true = ×2, comportement
  // historique), soit un NOMBRE = multiplicateur explicite — cf. Chasseur
  // "Tir fatal" (×3 sur les dégâts critiques à distance, Personnage.aTirFatal()).
  function lancerFormule(formule, label, critique, opts) {
    opts = opts || {};
    formule = (formule || "").trim().toLowerCase().replace(/\s/g, "");
    if (!formule) { toast("Entre une formule, ex. 2d6+3"); return; }
    const termes = formule.match(/[+-]?[^+-]+/g) || [];
    const valide = termes.length > 0 && termes.every((t) => /^[+-]?(\d*d\d+|\d+)$/.test(t));
    if (!valide) { toast("Formule invalide. Ex : 2d6+3, 1d20-1, 1d8+1d4+2"); return; }

    let total = 0;
    let horsLimites = false;
    let nbTermesDe = 0;
    let jetD20Unique = null; // crit/échec seulement si un SEUL terme de dés, et c'est 1d20
    const detailParts = [];
    termes.forEach((terme) => {
      const negatif = terme.startsWith("-");
      const brut = terme.replace(/^[+-]/, "");
      const de = /^(\d*)d(\d+)$/.exec(brut);
      if (de) {
        nbTermesDe++;
        const nbBase = parseInt(de[1] || "1", 10);
        const faces = parseInt(de[2], 10);
        const multCritique = typeof critique === "number" ? critique : (critique ? 2 : 1);
        const nb = nbBase * multCritique;
        if (nb < 1 || nb > 50 || faces < 2 || faces > 1000) { horsLimites = true; return; }
        const jets = [];
        for (let i = 0; i < nb; i++) jets.push(lancerDe(faces));
        const somme = jets.reduce((a, b) => a + b, 0);
        total += negatif ? -somme : somme;
        detailParts.push(`${negatif ? "-" : detailParts.length ? "+" : ""}${nb}d${faces}[${jets.join(",")}]`);
        if (nb === 1 && faces === 20) jetD20Unique = jets[0];
      } else {
        const v = parseInt(brut, 10);
        total += negatif ? -v : v;
        detailParts.push(`${negatif ? "-" : detailParts.length ? "+" : ""}${v}`);
      }
    });
    if (horsLimites) { toast("Valeurs hors limites."); return; }

    const crit = nbTermesDe === 1 && jetD20Unique === 20;
    const echec = nbTermesDe === 1 && jetD20Unique === 1;
    const detail = detailParts.join(" ");
    label = label || formule;
    afficherResultat(label, total, detail, crit, echec);
    ajouterHisto(label, total, crit, echec, detail, { estMonstre: !!opts.estMonstre });
    return total;
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

  function chargerHisto() { return SyncStore.getListe(STORAGE_HISTO); }
  // opts (optionnel) : { mode, d1, d2 } — pour un jet 2d20 (avantage/
  // désavantage, cf. lancerTest), permet à l'overlay de rejouer l'animation
  // "2 dés qui se lancent puis fusionnent" côté afficherOverlayJet, y compris
  // pour les AUTRES clients (l'info voyage dans l'entrée synchronisée).
  // cache (checkbox #jet-cache, cf. panneau Dés) : lu ici plutôt que passé
  // par chaque appelant — un seul endroit à vérifier, comme modeD20() lit le
  // sélecteur global directement. joueurId permet à un AUTRE client de
  // reconnaître "c'est moi l'auteur" malgré le masquage (cf. afficherOverlayJet/
  // rendreHisto), sans dépendre du nom affiché (auteur), qui peut être un nom
  // de personnage partagé par plusieurs joueurs en théorie.
  function ajouterHisto(label, total, crit, echec, detail, opts) {
    opts = opts || {};
    const caseCache = document.getElementById("jet-cache");
    const cache = !!(caseCache && caseCache.checked);
    // Son de crit/échec choisi UNE SEULE FOIS ici, par le lanceur, et stocké
    // dans l'entrée partagée — sinon chaque client qui reçoit ce jet (cf.
    // _verifierNouveauJetPourOverlay, déclenché à chaque synchro Firestore
    // sur TOUS les clients) tirerait indépendamment son propre Math.random()
    // et n'entendrait pas le même stinger que les autres joueurs.
    const sonDe = SONS_DE.length ? SONS_DE[Math.floor(Math.random() * SONS_DE.length)] : null;
    const sonEchec = (echec && SONS_ECHEC_CRITIQUE.length)
      ? SONS_ECHEC_CRITIQUE[Math.floor(Math.random() * SONS_ECHEC_CRITIQUE.length)] : null;
    const sonSucces = (crit && SONS_SUCCES_CRITIQUE.length)
      ? SONS_SUCCES_CRITIQUE[Math.floor(Math.random() * SONS_SUCCES_CRITIQUE.length)] : null;
    // Chaque jet devient son propre document Firestore (cf. SyncStore.
    // ajouterListe) plutôt qu'une réécriture du tableau entier : deux jets
    // presque simultanés (ex. initiative de groupe) ne peuvent plus
    // s'écraser l'un l'autre.
    SyncStore.ajouterListe(STORAGE_HISTO, {
      label, total, crit, echec, detail: detail || "", auteur: nomLanceur(), horodatage: _horodatageUnique(),
      joueurId, cache, sonDe, sonEchec, sonSucces,
      mode: opts.mode || null, d1: typeof opts.d1 === "number" ? opts.d1 : null, d2: typeof opts.d2 === "number" ? opts.d2 : null,
      estMonstre: !!opts.estMonstre,
      skinDe: _skinDeActuel(),
      // groupeJetId (cf. Capacites.lancer, sauvegardes réactives) : deux jets
      // du même cast (sauvegarde puis dégâts) partagent cet id pour que
      // l'overlay les affiche côte à côte plutôt que le second n'écrase le
      // premier, cf. afficherOverlayJet.
      groupeJetId: opts.groupeJetId || null,
      // sansOverlay : entrées de comptabilité (coût en PP/Corruption/
      // Réaction/Âme) qui suivent immédiatement, dans le même lancer(),
      // un vrai jet de dé (attaque, sauvegarde...) — sans ce drapeau elles
      // écraseraient/masqueraient l'overlay du jet qui vient d'être affiché
      // avant même que le joueur ait pu le lire (cf. _verifierNouveauJetPourOverlay).
      // Elles restent visibles normalement dans le journal (rendreHisto).
      sansOverlay: !!opts.sansOverlay,
    }, 40);
    rendreHisto();
  }
  // Un jet caché reste illisible pour tout le monde SAUF son auteur (même
  // joueurId, cf. ajouterHisto) et le MJ (accès total, comme partout ailleurs
  // dans l'app) — cf. afficherOverlayJet pour le même principe côté overlay.
  function _jetVisibleEnClair(x) {
    return !x.cache || role === "mj" || (!!x.joueurId && x.joueurId === joueurId);
  }
  function rendreHisto() {
    const h = chargerHisto();
    const zone = document.getElementById("historique");
    if (!h.length) { zone.innerHTML = `<div class="vide">Aucun lancer pour l'instant.</div>`; }
    else {
      zone.innerHTML = h.map((x) => {
        if (!_jetVisibleEnClair(x)) {
          // Ni nom ni valeur, même standard que l'overlay masqué (cf.
          // afficherOverlayJet) — la simple présence d'une ligne suffit à
          // signaler qu'un jet a eu lieu, sans révéler qui ni quoi.
          return `<div class="ligne-histo"><span>🙈 <em>Jet caché</em></span><span class="res"></span></div>`;
        }
        return `<div class="ligne-histo"><span>${x.auteur ? `<strong>${echapper(x.auteur)}</strong> — ` : ""}${echapper(x.label)}</span>` +
          `<span class="res ${x.crit ? "crit" : x.echec ? "echec" : ""}">${x.total}</span></div>`;
      }).join("");
    }
    rendreHistoriqueBattlemap();
  }
  // Panneau "🎲 Jets de dés" à droite de la battlemap : le joueur n'y voit que
  // ses propres jets (même joueurId, cf. _jetVisibleEnClair) et ceux des
  // monstres (cf. estMonstre, posé par _resoudreAttaqueMonstreVsPJ et les
  // lancerFormule de dégâts monstre) — les jets des AUTRES joueurs sont
  // simplement absents de cette liste (pas "cachés" : filtrés en amont). Le
  // MJ y voit tout, comme le panneau "Dés" classique (rendreHisto), y compris
  // les jets cachés qui lui restent lisibles en clair.
  function rendreHistoriqueBattlemap() {
    const zone = document.getElementById("battlemap-zone-historique");
    if (!zone) return;
    const h = chargerHisto();
    const visible = role === "mj" ? h : h.filter((x) => x.estMonstre || (!!x.joueurId && x.joueurId === joueurId));
    if (!visible.length) { zone.innerHTML = `<div class="vide">Aucun lancer pour l'instant.</div>`; return; }
    zone.innerHTML = visible.map((x) => {
      if (!_jetVisibleEnClair(x)) {
        return `<div class="ligne-histo"><span>🙈 <em>Jet caché</em></span><span class="res"></span></div>`;
      }
      return `<div class="ligne-histo"><span>${x.auteur ? `<strong>${echapper(x.auteur)}</strong> — ` : ""}${echapper(x.label)}</span>` +
        `<span class="res ${x.crit ? "crit" : x.echec ? "echec" : ""}">${x.total}</span></div>`;
    }).join("");
  }
  function viderHisto() {
    SyncStore.viderListe(STORAGE_HISTO);
    rendreHisto();
  }

  // Son de collision joué à chaque jet (local ou distant, cf. afficherOverlayJet).
  // Instances réutilisées + currentTime remis à 0 pour permettre des jets
  // rapprochés sans attendre la fin du son précédent. `fichier` : nom déjà
  // tiré au sort UNE FOIS par ajouterHisto et stocké dans l'entrée partagée
  // (entree.sonDe), pour que tous les clients entendent le même son sur le
  // même jet (même principe que sonEchec/sonSucces, cf. ajouterHisto) —
  // repli sur un tirage local si absent (entrées antérieures à ce champ).
  function _jouerSonDe(fichier) {
    if (!SONS_DE.length) return;
    try {
      if (!_sonsDe) _sonsDe = SONS_DE.map((f) => new Audio("assets/sounds/de/" + encodeURIComponent(f)));
      const idx = fichier ? SONS_DE.indexOf(fichier) : -1;
      const son = _sonsDe[idx >= 0 ? idx : Math.floor(Math.random() * _sonsDe.length)];
      son.currentTime = 0;
      son.play().catch(() => {}); // autoplay bloqué (rare, nécessite une interaction) : silencieux
    } catch (e) { /* pas de son plutôt que planter le jet */ }
  }

  // Stinger joué en plus du son de dé, uniquement sur échec critique (1 naturel),
  // au moment de la révélation du résultat (cf. finPhaseRoulement dans
  // afficherOverlayJet) — jamais au lancer, pour ne pas se superposer à _jouerSonDe.
  // `fichier` : nom déjà tiré au sort UNE FOIS par ajouterHisto et stocké dans
  // l'entrée partagée (entree.sonEchec), pour que tous les clients jouent le
  // même son sur le même jet — cf. commentaire dans ajouterHisto. Repli sur un
  // tirage local si absent (entrées d'historique antérieures à ce champ).
  function _jouerSonEchec(fichier) {
    try {
      // encodeURIComponent : certains noms de fichiers contiennent un "#", qui
      // casserait l'URL (fragment) s'il n'était pas échappé.
      if (!_sonsEchec) _sonsEchec = SONS_ECHEC_CRITIQUE.map((f) => new Audio("assets/sounds/echec-critique/" + encodeURIComponent(f)));
      const idx = fichier ? SONS_ECHEC_CRITIQUE.indexOf(fichier) : -1;
      const son = _sonsEchec[idx >= 0 ? idx : Math.floor(Math.random() * _sonsEchec.length)];
      son.currentTime = 0;
      son.play().catch(() => {}); // autoplay bloqué (rare) : silencieux
    } catch (e) { /* pas de son plutôt que planter le jet */ }
  }

  // Même principe que _jouerSonEchec, pour le succès critique (20 naturel).
  // Ne fait rien tant qu'aucun fichier n'a été déposé dans
  // assets/sounds/succes-critique/ (SONS_SUCCES_CRITIQUE vide).
  function _jouerSonSucces(fichier) {
    if (!SONS_SUCCES_CRITIQUE.length) return;
    try {
      if (!_sonsSucces) _sonsSucces = SONS_SUCCES_CRITIQUE.map((f) => new Audio("assets/sounds/succes-critique/" + encodeURIComponent(f)));
      const idx = fichier ? SONS_SUCCES_CRITIQUE.indexOf(fichier) : -1;
      const son = _sonsSucces[idx >= 0 ? idx : Math.floor(Math.random() * _sonsSucces.length)];
      son.currentTime = 0;
      son.play().catch(() => {}); // autoplay bloqué (rare) : silencieux
    } catch (e) { /* pas de son plutôt que planter le jet */ }
  }

  // Thème joué au clic sur "⬆ Monter de niveau" (cf. monterDeNiveau). Volume
  // réduit de 30% (VOLUME_SON_NIVEAU) par rapport aux stingers courts
  // ci-dessus : c'est un vrai morceau de musique, pas un simple bruitage.
  function _jouerSonNiveau() {
    try {
      if (!_sonNiveau) {
        _sonNiveau = new Audio("assets/sounds/niveau/" + encodeURIComponent("FF VII victory theme (mp3cut.net).mp3"));
        _sonNiveau.volume = VOLUME_SON_NIVEAU;
      }
      _sonNiveau.currentTime = 0;
      _sonNiveau.play().catch(() => {}); // autoplay bloqué (rare) : silencieux
    } catch (e) { /* pas de son plutôt que planter la montée de niveau */ }
  }

  // Remplit et affiche l'overlay de jet de dé (visible sur n'importe quel
  // onglet). entree suit le même format que les entrées de des:histo. Le dé
  // "roule" (son + rotation CSS) le temps du roulement, puis révèle le total.
  //
  // Masquage (jet caché, cf. #jet-cache/ajouterHisto) : pour un spectateur
  // qui n'est ni l'auteur (entree.joueurId) ni le MJ, l'overlay ne révèle
  // JAMAIS rien — juste le dé qui tourne (+ son), sans nom/label/détail/
  // total, avant de disparaître comme un jet normal (cf. classe CSS
  // "masque"). L'auteur et le MJ voient l'overlay complet, normalement.
  //
  // Duo avantage/désavantage (entree.mode + d1/d2, cf. lancerTest) : pour un
  // jet visible en clair, affiche d'abord les 2 d20 individuels côte à côte
  // un instant, puis les fusionne sur le dé unique en ne gardant que la
  // valeur retenue (la plus haute en avantage, la plus basse en
  // désavantage) — cf. classes "gagnant"/"perdant" côté CSS.
  function afficherOverlayJet(entree) {
    const overlay = document.getElementById("overlay-jet");
    const d20 = document.getElementById("overlay-jet-d20");
    if (!overlay || !d20 || !entree) return;

    const estAuteur = !!(entree.joueurId && entree.joueurId === joueurId);
    const masque = !!entree.cache && role !== "mj" && !estAuteur;

    // Paire (sauvegarde réactive + dégâts, cf. groupeJetId posé par
    // Capacites.lancer, js/capacites.js) : le second jet du même cast
    // rejoint la boîte B À CÔTÉ de la boîte A déjà affichée, au lieu de
    // l'écraser — pour que tout le monde voie le jet de sauvegarde ET le
    // jet de dégâts en même temps. Seulement si la boîte A affiche encore
    // CE groupe (sinon, fenêtre expirée ou jet indépendant : traité comme
    // un jet normal plus bas, qui repart de zéro et masque la boîte B).
    if (!masque && entree.groupeJetId && entree.groupeJetId === paireJetGroupeActif
        && overlay.classList.contains("visible")) {
      _afficherBoiteJetP2(entree);
      // Reprend la fenêtre d'affichage à partir de CE second jet plutôt que
      // de laisser le minuteur déjà posé par la boîte A l'interrompre en
      // plein roulement/lecture.
      if (overlayJetTimer) clearTimeout(overlayJetTimer);
      overlayJetTimer = setTimeout(() => {
        overlay.classList.remove("visible");
        overlayJetTimer = null;
        paireJetGroupeActif = null;
      }, 5000);
      return;
    }

    // Jet indépendant, ou premier jet d'une nouvelle paire : repart de
    // zéro — masque toute boîte B résiduelle d'un groupe précédent.
    paireJetGroupeActif = (!masque && entree.groupeJetId) ? entree.groupeJetId : null;
    _cacherBoiteJetP2();

    const boiteA = document.getElementById("overlay-jet-boite-a");
    const skinImg = document.getElementById("overlay-jet-d20-img");
    if (skinImg) skinImg.src = _skinDeImg(entree.skinDe);

    document.getElementById("overlay-jet-auteur").textContent = masque ? "" : (entree.auteur || "");
    document.getElementById("overlay-jet-label").textContent = masque ? "" : (entree.label || "");
    document.getElementById("overlay-jet-detail").textContent = masque ? "" : (entree.detail || "");
    document.getElementById("overlay-jet-total").textContent = "";
    document.getElementById("overlay-jet-badge").textContent = "";
    overlay.classList.remove("cache");
    if (boiteA) boiteA.classList.remove("crit", "echec");
    overlay.classList.toggle("masque", masque);
    overlay.classList.add("visible");

    const duo = !masque && (entree.mode === "avantage" || entree.mode === "desavantage")
      && typeof entree.d1 === "number" && typeof entree.d2 === "number";
    const zoneDuo = document.getElementById("overlay-jet-duo");
    const d20a = document.getElementById("overlay-jet-d20-a");
    const d20b = document.getElementById("overlay-jet-d20-b");
    const skinImgA = document.getElementById("overlay-jet-d20-img-a");
    const skinImgB = document.getElementById("overlay-jet-d20-img-b");
    if (skinImgA) skinImgA.src = _skinDeImg(entree.skinDe);
    if (skinImgB) skinImgB.src = _skinDeImg(entree.skinDe);
    const valA = document.getElementById("overlay-jet-val-a");
    const valB = document.getElementById("overlay-jet-val-b");
    if (valA) valA.textContent = "";
    if (valB) valB.textContent = "";
    if (d20a) d20a.classList.remove("gagnant", "perdant");
    if (d20b) d20b.classList.remove("gagnant", "perdant");
    if (zoneDuo) zoneDuo.classList.toggle("visible", duo);

    if (overlayJetTimer) clearTimeout(overlayJetTimer);
    if (overlayJetRevealTimer) clearTimeout(overlayJetRevealTimer);
    if (overlayJetDuoTimer) clearTimeout(overlayJetDuoTimer);
    // Relance l'animation même si un jet précédent tournait encore (retirer
    // puis reflow forcé, sinon le navigateur ignore un ré-ajout à l'identique).
    [d20, d20a, d20b].forEach((el) => { if (el) { el.classList.remove("en-cours"); } });
    void d20.offsetWidth;
    d20.classList.add("en-cours");
    if (duo) { if (d20a) d20a.classList.add("en-cours"); if (d20b) d20b.classList.add("en-cours"); }
    _jouerSonDe(entree.sonDe);

    overlayJetRevealTimer = setTimeout(() => {
      [d20, d20a, d20b].forEach((el) => { if (el) el.classList.remove("en-cours"); });
      overlayJetRevealTimer = null;

      const finPhaseRoulement = () => {
        if (masque) {
          // Rien à révéler : juste laisser le dé visible un instant avant de disparaître.
          overlayJetTimer = setTimeout(() => { overlay.classList.remove("visible"); overlayJetTimer = null; }, 1400);
          return;
        }
        document.getElementById("overlay-jet-total").textContent = entree.total;
        document.getElementById("overlay-jet-badge").textContent =
          entree.crit ? "CRITIQUE ! 🎉" : entree.echec ? "Échec critique 💀" : "";
        if (entree.crit) { if (boiteA) boiteA.classList.add("crit"); _jouerSonSucces(entree.sonSucces); }
        else if (entree.echec) { if (boiteA) boiteA.classList.add("echec"); _jouerSonEchec(entree.sonEchec); }
        // Durée d'affichage du total final : 5s pour un jet normal, 2s pour
        // un duo (cf. DUREE_DUO_MS ci-dessous) — la lecture des 2 dés a déjà
        // pris son temps, pas besoin de laisser le total affiché aussi
        // longtemps qu'un jet simple.
        overlayJetTimer = setTimeout(() => { overlay.classList.remove("visible"); overlayJetTimer = null; }, duo ? 2000 : 5000);
      };

      if (duo) {
        // Révèle les 2 valeurs individuelles, les garde visibles un moment
        // (DUREE_DUO_MS, cf. plus haut : 5s de fenêtre totale post-roulement
        // pour un duo, dont 3s de suspense ici + 2s de total final ensuite),
        // puis fusionne sur le dé unique (masque === false ici, cf. calcul de `duo`).
        if (valA) valA.textContent = entree.d1;
        if (valB) valB.textContent = entree.d2;
        const gagnantA = entree.mode === "avantage" ? entree.d1 >= entree.d2 : entree.d1 <= entree.d2;
        if (d20a) d20a.classList.add(gagnantA ? "gagnant" : "perdant");
        if (d20b) d20b.classList.add(gagnantA ? "perdant" : "gagnant");
        overlayJetDuoTimer = setTimeout(() => {
          if (zoneDuo) zoneDuo.classList.remove("visible");
          overlayJetDuoTimer = null;
          finPhaseRoulement();
        }, 3000);
      } else {
        finPhaseRoulement();
      }
    }, 620);
  }

  // Boîte B de la paire sauvegarde+dégâts (cf. groupeJetId, afficherOverlayJet
  // ci-dessus) : jamais de duo avantage/désavantage ici (un jet de dégâts n'a
  // pas ce mode) — juste un roulement puis révélation, indépendant de la
  // boîte A pour ne jamais couper sa propre lecture.
  function _afficherBoiteJetP2(entree) {
    const boite = document.getElementById("overlay-jet-boite-p2");
    const d20 = document.getElementById("overlay-jet-d20-p2");
    if (!boite || !d20) return;
    const skinImg = document.getElementById("overlay-jet-d20-img-p2");
    if (skinImg) skinImg.src = _skinDeImg(entree.skinDe);

    document.getElementById("overlay-jet-auteur-p2").textContent = entree.auteur || "";
    document.getElementById("overlay-jet-label-p2").textContent = entree.label || "";
    document.getElementById("overlay-jet-detail-p2").textContent = entree.detail || "";
    document.getElementById("overlay-jet-total-p2").textContent = "";
    document.getElementById("overlay-jet-badge-p2").textContent = "";
    boite.classList.remove("crit", "echec");
    boite.classList.add("visible");

    if (overlayJetRevealTimerP2) clearTimeout(overlayJetRevealTimerP2);
    d20.classList.remove("en-cours");
    void d20.offsetWidth;
    d20.classList.add("en-cours");
    _jouerSonDe(entree.sonDe);

    overlayJetRevealTimerP2 = setTimeout(() => {
      d20.classList.remove("en-cours");
      overlayJetRevealTimerP2 = null;
      document.getElementById("overlay-jet-total-p2").textContent = entree.total;
      document.getElementById("overlay-jet-badge-p2").textContent =
        entree.crit ? "CRITIQUE ! 🎉" : entree.echec ? "Échec critique 💀" : "";
      if (entree.crit) { boite.classList.add("crit"); _jouerSonSucces(entree.sonSucces); }
      else if (entree.echec) { boite.classList.add("echec"); _jouerSonEchec(entree.sonEchec); }
    }, 620);
  }

  function _cacherBoiteJetP2() {
    const boite = document.getElementById("overlay-jet-boite-p2");
    if (boite) boite.classList.remove("visible", "crit", "echec");
    if (overlayJetRevealTimerP2) { clearTimeout(overlayJetRevealTimerP2); overlayJetRevealTimerP2 = null; }
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
    if (plusRecent.sansOverlay) return; // entrée de comptabilité, cf. ajouterHisto
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
      magie: "sous-panneau-regles-magie",
      etats: "sous-panneau-regles-etats",
    });

    rendreReglesGeneral();
    rendreReglesMagie();
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

  // Onglet "Magie" — recense tous les sorts de Grimoire (SORTS_PAR_CLASSE,
  // data/donnees.js : magicien/enchanteur/prêtre) et permet de filtrer par
  // école (mecanique.categorie de chaque sort), même patron visuel que le
  // filtre de dangérosité du Bestiaire (cf. .filtre-dangerosite/.btn-dang).
  const ORDRE_ECOLES_MAGIE = ["evocation", "abjuration", "enchantement", "illusion",
    "divination", "transmutation", "divination_transmutation", "guerison", "foi", "bannissement", "jugement"];
  const LIBELLES_ECOLES_MAGIE = {
    evocation: "Évocation", abjuration: "Abjuration", enchantement: "Enchantement", illusion: "Illusion",
    divination: "Divination", transmutation: "Transmutation", divination_transmutation: "Divination / Transmutation",
    guerison: "Guérison", foi: "Foi", bannissement: "Bannissement", jugement: "Jugement",
  };
  let _regleMagieEcole = "";

  // Coût affiché pour un sort : PP normalement, ou la ressource de Cercle du
  // Prêtre si c'en est un (cf. prompt_pretre_cercle_vie.md et suivants —
  // Soins divins/Voix du jugement/Aura divine/Bannissement(_zone)/Bûcher
  // purificateur n'ont pas de coutPP, seulement une des 4 coutPointsX).
  function _coutAffiche(mecanique) {
    if (mecanique.coutPP) return `${mecanique.coutPP} PP`;
    if (mecanique.coutPointsBenediction) return `${mecanique.coutPointsBenediction} Pt. Bénédiction`;
    if (mecanique.coutPointsConviction) return `${mecanique.coutPointsConviction} Pt. Conviction`;
    if (mecanique.coutPointsBannissement) return `${mecanique.coutPointsBannissement} Pt. Bannissement`;
    if (mecanique.coutPointsJugement) return `${mecanique.coutPointsJugement} Pt. Jugement`;
    return "gratuit";
  }

  function rendreReglesMagie() {
    const filtreZone = document.getElementById("filtre-ecole");
    if (!filtreZone || typeof SORTS_PAR_CLASSE === "undefined") return;

    // Tous les sorts de toutes les classes casteuses (cf. SORTS_PAR_CLASSE),
    // taggés avec leur classe d'origine pour l'affichage — reste générique à
    // une nouvelle classe qui rejoindrait cette table plus tard.
    const tousLesSorts = Object.keys(SORTS_PAR_CLASSE).flatMap((classe) =>
      (SORTS_PAR_CLASSE[classe] || []).map((s) => Object.assign({ classe }, s))
    );

    // Écoles réellement présentes dans les données, dans l'ordre de
    // ORDRE_ECOLES_MAGIE puis les éventuelles nouvelles écoles non listées
    // (fallback alphabétique) — n'invente jamais une école sans sort.
    const ecolesPresentes = [...new Set(tousLesSorts.map((s) => s.categorie))];
    const ecolesTriees = ORDRE_ECOLES_MAGIE.filter((e) => ecolesPresentes.includes(e))
      .concat(ecolesPresentes.filter((e) => !ORDRE_ECOLES_MAGIE.includes(e)).sort());

    filtreZone.innerHTML = `<span>École :</span>` +
      `<button type="button" class="btn-ecole${_regleMagieEcole === "" ? " actif" : ""}" data-ecole="">Toutes (${tousLesSorts.length})</button>` +
      ecolesTriees.map((e) => {
        const n = tousLesSorts.filter((s) => s.categorie === e).length;
        return `<button type="button" class="btn-ecole${_regleMagieEcole === e ? " actif" : ""}" data-ecole="${e}">${LIBELLES_ECOLES_MAGIE[e] || e} (${n})</button>`;
      }).join("");

    filtreZone.querySelectorAll(".btn-ecole").forEach((btn) => {
      btn.onclick = () => {
        _regleMagieEcole = btn.dataset.ecole;
        rendreReglesMagie();
      };
    });

    const zone = document.getElementById("zone-regles-magie");
    if (!zone) return;
    const ecolesAffichees = _regleMagieEcole ? [_regleMagieEcole] : ecolesTriees;
    zone.innerHTML = ecolesAffichees.map((ecole) => {
      const sorts = tousLesSorts.filter((s) => s.categorie === ecole).sort((a, b) => a.rang - b.rang);
      if (!sorts.length) return "";
      const items = sorts.map((s) => `<div class="etat-regle">
          <div class="etat-regle-nom">${echapper(s.nom)} <span class="badge-reserve">${echapper(CLASSES[s.classe] ? CLASSES[s.classe].nom_affiche : s.classe)}</span></div>
          <div class="sort-regle-meta">Rang ${s.rang} · ${_coutAffiche(s.mecanique)}</div>
          <div class="etat-regle-desc">${echapper(s.effet)}</div>
        </div>`).join("");
      return `<div class="carte"><h3 style="margin-top:0;">${LIBELLES_ECOLES_MAGIE[ecole] || ecole}</h3>${items}</div>`;
    }).join("");
  }

  // Onglet "Général" — REGLES_GENERALES (data/donnees.js), même format que
  // LORE.sections, rendu à l'identique (une carte par section). `s.html: true`
  // (ex. Dons, Alchimie, Enchantement, Équipement) signale un contenu déjà en
  // HTML de confiance (tableau), écrit à la main dans donnees.js — pas de
  // saisie utilisateur ici, donc pas besoin d'échapper (et ça casserait les
  // balises <table>).
  function rendreReglesGeneral() {
    const zone = document.getElementById("zone-regles-general");
    if (!zone || typeof REGLES_GENERALES === "undefined") return;
    zone.innerHTML = REGLES_GENERALES.map((s) =>
      `<div class="carte"><h3 style="margin-top:0;">${echapper(s.titre)}</h3><div class="regle-generale-contenu">${s.html ? s.contenu : echapper(s.contenu)}</div></div>`
    ).join("");
  }

  // Libellés lisibles des catégories d'états (js/etats.js, ORDRE_CATEGORIES_ETATS).
  const LIBELLES_CATEGORIES_ETATS = {
    controle: "Contrôle",
    malus: "Malus",
    dot: "Dégâts continus (DoT)",
    physique: "Altérations physiques",
    buff: "Buffs",
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
    html += `<img id="lore-carte-img" src="assets/maps/Carte monde.png" alt="Carte du monde" class="lore-carte" />`;
    if (LORE.intro) html += `<p style="font-style:italic;color:#6a6278;">${LORE.intro}</p>`;
    let categoriePrecedente = null;
    LORE.sections.forEach((s) => {
      if (s.categorie && s.categorie !== categoriePrecedente) {
        html += `<h2 class="lore-categorie">${echapper(s.categorie)}</h2>`;
        categoriePrecedente = s.categorie;
      }
      const attrRole = s.mjSeulement ? ` data-role="mj"` : "";
      html += `<div class="lore-section"${attrRole}><h3>${echapper(s.titre)}</h3><div class="contenu">${echapper(s.contenu)}</div></div>`;
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

  // PNJ secrets (cf. p.secret dans PNJ_CLES, data/donnees.js) : nom/titre/faction
  // toujours visibles, contenu (résumé/description/accroches) verrouillé côté joueur
  // tant que le MJ ne l'a pas explicitement révélé. Révélation permanente et partagée
  // (SyncStore) — pas de re-masquage, cf. décision validée.
  function _pnjReveles() { return SyncStore.get(STORAGE_PNJ_REVELES) || []; }
  function _pnjEstRevele(id) { return _pnjReveles().includes(id); }
  function _reveleerPnj(id) {
    if (role !== "mj") return;
    const reveles = _pnjReveles();
    if (reveles.includes(id)) return;
    reveles.push(id);
    SyncStore.set(STORAGE_PNJ_REVELES, reveles);
  }

  // Onglet "PNJ" du panneau Lore — une carte par entrée de PNJ_CLES
  // (data/donnees.js). Statique/local pour l'essentiel (comme le reste du
  // Lore — pas de synchro Firestore), sauf l'état de révélation des PNJ
  // secrets (cf. STORAGE_PNJ_REVELES ci-dessus), partagé en temps réel.
  // Filtre par faction optionnel.
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
      .map((p) => {
        const estSecret = !!p.secret;
        const revele = !estSecret || _pnjEstRevele(p.id);
        const verrouillePourJoueur = estSecret && !revele && role !== "mj";

        const badgeSecretMj = estSecret && role === "mj"
          ? (revele
              ? `<span class="badge-chaos" title="Révélé aux joueurs">🔓 Révélé</span>`
              : `<span class="badge-chaos" title="Visible MJ uniquement">🔒 Secret</span>`)
          : "";

        const boutonReveler = estSecret && !revele && role === "mj"
          ? `<button type="button" class="btn petit secondaire" data-act="reveler-pnj" data-id="${p.id}">🔓 Révéler aux joueurs</button>`
          : "";

        const corpsHtml = verrouillePourJoueur
          ? `<p class="pnj-verrouille">🔒 <em>Information non révélée par le Maître de Jeu.</em></p>`
          : `<p class="pnj-resume"><em>${echapper(p.resume)}</em></p>` +
            `<div class="contenu">${echapper(p.description)}</div>` +
            ((p.accroches || []).length ? `<div class="pnj-accroches" data-role="mj"><h4>Accroches</h4><ul>${
              p.accroches.map((a) => `<li>${echapper(a)}</li>`).join("")
            }</ul></div>` : "");

        return `<div class="carte pnj-carte${verrouillePourJoueur ? " pnj-carte-verrouillee" : ""}">
          <div class="pnj-entete">
            <div>
              <div class="pnj-nom">${echapper(p.nom)}</div>
              <div class="pnj-titre">${echapper(p.titre)}</div>
            </div>
            ${badgeSecretMj}
            <span class="badge-faction" style="background:${_couleurFaction(p.faction)};">${echapper(p.faction)}</span>
          </div>
          ${corpsHtml}
          ${boutonReveler}
        </div>`;
      }).join("");
    zone.innerHTML = filtreHtml + cartesHtml;
    zone.querySelectorAll("[data-pnj-faction]").forEach((btn) => {
      btn.onclick = () => { _pnjFactionFiltre = btn.dataset.pnjFaction; rendrePnjCles(); };
    });
    zone.querySelectorAll('[data-act="reveler-pnj"]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const pnj = PNJ_CLES.find((p) => p.id === id);
        if (!confirm(`Révéler "${pnj ? pnj.nom : id}" à tous les joueurs ? Cette action est irréversible.`)) return;
        _reveleerPnj(id);
        toast("PNJ révélé aux joueurs.");
        rendrePnjCles();
      };
    });
  }

  // Onglet "Factions" du panneau Lore — une carte par entité (maison/bloc)
  // groupée par camp politique (FACTIONS, data/donnees.js), même charte
  // visuelle que l'onglet PNJ (réutilise .pnj-carte/.pnj-entete/.badge-faction).
  // Filtre par groupe optionnel, comme le filtre par faction de rendrePnjCles.
  let _factionsGroupeFiltre = "";
  function _couleurGroupeFaction(groupe, groupes) {
    const idx = groupes.indexOf(groupe);
    return PNJ_PALETTE_FACTIONS[idx % PNJ_PALETTE_FACTIONS.length];
  }
  // Verrouillage MJ au niveau d'une entité (ex. Inquisition/Œil de Solmaris
  // dans le bloc Empire de Solvarn) plutôt qu'au niveau du groupe entier :
  // l'entité et sa description générale restent toujours visibles, seule
  // e.descriptionSecrete est gatée tant que le MJ ne l'a pas révélée.
  function _factionsEntitesRevelees() { return SyncStore.get(STORAGE_FACTIONS_ENTITES_REVELEES) || []; }
  function _factionEntiteEstRevelee(id) { return _factionsEntitesRevelees().includes(id); }
  function _reveleerFactionEntite(id) {
    if (role !== "mj") return;
    const reveles = _factionsEntitesRevelees();
    if (reveles.includes(id)) return;
    reveles.push(id);
    SyncStore.set(STORAGE_FACTIONS_ENTITES_REVELEES, reveles);
  }
  function rendreFactions() {
    const zone = document.getElementById("zone-lore-factions");
    if (!zone || typeof FACTIONS === "undefined") return;
    const groupes = FACTIONS.map((g) => g.groupe);
    const filtreHtml =
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">` +
      `<div class="barre-actions" style="margin:0;">` +
      `<button type="button" class="btn petit ${_factionsGroupeFiltre === "" ? "or" : "secondaire"}" data-factions-groupe="">Tous</button>` +
      groupes.map((g) =>
        `<button type="button" class="btn petit ${_factionsGroupeFiltre === g ? "or" : "secondaire"}" data-factions-groupe="${echapper(g)}">${echapper(g)}</button>`
      ).join("") +
      `</div>` +
      `<button type="button" class="btn petit secondaire" id="btn-modifier-factions" data-role="mj">✏️ Modifier</button>` +
      `</div>`;
    const groupesHtml = FACTIONS
      .filter((g) => !_factionsGroupeFiltre || g.groupe === _factionsGroupeFiltre)
      .map((g) => {
        const entitesHtml = g.entites.map((e) => {
          const estSecretEntite = !!e.secret;
          const releveeEntite = !estSecretEntite || _factionEntiteEstRevelee(e.id);

          const badgeSecretEntiteMj = estSecretEntite && role === "mj"
            ? (releveeEntite
                ? `<span class="badge-chaos" title="Révélé aux joueurs">🔓 Révélé</span>`
                : `<span class="badge-chaos" title="Visible MJ uniquement">🔒 Secret</span>`)
            : "";

          const boutonRevelerEntite = estSecretEntite && !releveeEntite && role === "mj"
            ? `<button type="button" class="btn petit secondaire" data-act="reveler-faction-entite" data-id="${echapper(e.id)}">🔓 Révéler aux joueurs</button>`
            : "";

          const partieSecreteHtml = estSecretEntite && e.descriptionSecrete && (releveeEntite || role === "mj")
            ? `<div class="contenu" style="margin-top:8px;">${echapper(e.descriptionSecrete)}</div>`
            : "";

          return `<div class="carte pnj-carte">
          <div class="pnj-entete">
            ${e.blason ? `<img class="pnj-blason" src="${echapper(e.blason)}" alt="Blason — ${echapper(e.nom)}" onerror="this.style.display='none';" />` : ""}
            <div style="flex:1;">
              <div class="pnj-nom">${echapper(e.nom)}</div>
              <div class="pnj-titre">« ${echapper(e.devise)} »</div>
            </div>
            ${badgeSecretEntiteMj}
            <span class="badge-faction" style="background:${_couleurGroupeFaction(g.groupe, groupes)};">${echapper(g.groupe)}</span>
          </div>
          <div class="contenu">${echapper(e.description)}</div>
          ${partieSecreteHtml}
          ${boutonRevelerEntite}
        </div>`;
        }).join("");
        const blasonHtml = g.blason
          ? `<img class="faction-blason" src="${echapper(g.blason)}" alt="Blason — ${echapper(g.groupe)}" onerror="this.style.display='none';" />`
          : "";
        const histoireHtml = g.histoire
          ? `<h4 style="color:var(--or);margin:10px 0 4px;font-size:0.95rem;">Histoire</h4><div class="contenu" style="color:#fff;">${echapper(g.histoire)}</div>`
          : "";
        return `<div class="lore-section"><h3>${echapper(g.groupe)}</h3>` +
          blasonHtml +
          histoireHtml +
          `<p style="font-style:italic;color:#6a6278;white-space:pre-wrap;">${echapper(g.intro)}</p>` +
          entitesHtml +
          `<div class="carte pnj-carte" style="margin-top:10px;"><div class="contenu">${echapper(g.synthese)}</div></div>` +
          `</div>`;
      }).join("");
    zone.innerHTML = filtreHtml + groupesHtml;
    zone.querySelectorAll("[data-factions-groupe]").forEach((btn) => {
      btn.onclick = () => { _factionsGroupeFiltre = btn.dataset.factionsGroupe; rendreFactions(); };
    });
    zone.querySelectorAll("[data-act='reveler-faction-entite']").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!confirm(`Révéler cette information à tous les joueurs ? Cette action est irréversible.`)) return;
        _reveleerFactionEntite(id);
        toast("Information révélée aux joueurs.");
        rendreFactions();
      };
    });
    const btnModifierFactions = document.getElementById("btn-modifier-factions");
    if (btnModifierFactions) {
      btnModifierFactions.onclick = () =>
        toast("Édition des factions — bientôt disponible, une fois la synchro serveur en place.");
    }
  }

  /* ============================================================
     FRISE CHRONOLOGIQUE (page "Lore" > onglet "Chronologie")
     ============================================================ */
  let _chronologiePeupleFiltre = "";

  function rendreChronologie() {
    const zone = document.getElementById("zone-lore-chronologie");
    if (!zone || typeof CHRONOLOGIE === "undefined") return;

    const peuples = ["humains", "nains", "elfes", "chaos"];
    const filtreHtml =
      `<div style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">` +
      `<button type="button" class="btn petit ${_chronologiePeupleFiltre === "" ? "or" : "secondaire"}" data-chronologie-peuple="">Tous</button>` +
      peuples.map((p) =>
        `<button type="button" class="btn petit ${_chronologiePeupleFiltre === p ? "or" : "secondaire"}" data-chronologie-peuple="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`
      ).join("") +
      `</div>`;

    const items = CHRONOLOGIE
      .filter((e) => !_chronologiePeupleFiltre || e.peuples.includes(_chronologiePeupleFiltre))
      .map((e) => `
        <div class="frise-item">
          <div class="frise-point"></div>
          <div class="frise-contenu">
            <div class="frise-entete">
              <span class="frise-periode">${echapper(e.periode)}</span>
              <span class="frise-quand">${echapper(e.quand)}${e.duree ? ` · ${echapper(e.duree)}` : ""}</span>
            </div>
            <div class="frise-description">${echapper(e.description)}</div>
          </div>
        </div>`
      ).join("");

    zone.innerHTML = filtreHtml + `<div class="frise-chronologique">${items}</div>`;

    zone.querySelectorAll("[data-chronologie-peuple]").forEach((btn) => {
      btn.onclick = () => {
        _chronologiePeupleFiltre = btn.dataset.chronologiePeuple;
        rendreChronologie();
      };
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
      factions: "sous-panneau-lore-factions",
      chronologie: "sous-panneau-lore-chronologie",
    });
    rendrePnjCles();
    rendreFactions();
    rendreChronologie();

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
    const btnChoisirCouleurJoueur = document.getElementById("btn-choisir-couleur-joueur");
    if (btnChoisirCouleurJoueur) btnChoisirCouleurJoueur.onclick = ouvrirModalCouleurJoueur;
    const btnFermerModalCouleurJoueur = document.getElementById("btn-fermer-modal-couleur-joueur");
    if (btnFermerModalCouleurJoueur) btnFermerModalCouleurJoueur.onclick = fermerModalCouleurJoueur;
    _majSwatchCouleurJoueur();

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

    // Bouton MJ "Ajouter malus" (dupliqué : onglet Table de combat + colonne
    // battlemap, cf. index.html) — même modale partagée pour les deux.
    document.querySelectorAll(".btn-ajouter-malus").forEach((btn) => {
      btn.onclick = ouvrirModalMalus;
    });
    const btnFermerModalMalus = document.getElementById("btn-fermer-modal-malus");
    if (btnFermerModalMalus) btnFermerModalMalus.onclick = fermerModalMalus;
    const btnAppliquerMalus = document.getElementById("btn-appliquer-malus");
    if (btnAppliquerMalus) btnAppliquerMalus.onclick = appliquerMalus;
    document.getElementById("modal-malus").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fermerModalMalus();
    });

    // Atelier — bouton MJ "Nouveau jour" : remet à zéro les tentatives
    // d'enchantement ET d'alchimie de tout le monde d'un seul coup (clé
    // SyncStore partagée, cf. STORAGE_ATELIER_TENTATIVES) — data-role="mj"
    // masque déjà le bouton côté joueur, garde de rôle ici en défense
    // supplémentaire.
    const btnNouveauJourAtelier = document.getElementById("btn-atelier-nouveau-jour");
    if (btnNouveauJourAtelier) {
      btnNouveauJourAtelier.onclick = () => {
        if (role !== "mj") return;
        if (!confirm("Réinitialiser les tentatives d'enchantement et d'alchimie de tous les joueurs pour aujourd'hui ?")) return;
        SyncStore.set(STORAGE_ATELIER_TENTATIVES, {});
        toast("Nouveau jour : tentatives d'atelier réinitialisées.");
        rendrePanneauAtelier();
      };
    }
    // Rafraîchit les tentatives/paliers affichés dès qu'un autre client (MJ
    // "Nouveau jour", ou un autre joueur qui tente un enchantement/brassage)
    // modifie le compteur partagé — les deux sous-onglets sont maintenus à
    // jour en continu (cf. rendrePanneauAtelier), seule la visibilité CSS
    // distingue lequel est affiché.
    SyncStore.subscribe(STORAGE_ATELIER_TENTATIVES, () => {
      const panneauAtelier = document.getElementById("panneau-atelier");
      if (panneauAtelier && panneauAtelier.classList.contains("actif")) {
        _rendreAtelierPaliers();
        _rendreAlchimieDetail();
      }
    });

    // Un MJ révèle un PNJ secret (Œil de Solmaris, etc.) : tous les clients (autres
    // joueurs ET autres onglets MJ) doivent voir le déverrouillage immédiatement s'ils
    // sont sur l'onglet PNJ du panneau Lore.
    SyncStore.subscribe(STORAGE_PNJ_REVELES, () => {
      const zonePnj = document.getElementById("zone-lore-pnj");
      if (zonePnj) rendrePnjCles();
    });

    // Un MJ révèle la partie cachée d'une entité de faction (Inquisition,
    // Œil de Solmaris) : même principe que la révélation des PNJ ci-dessus.
    SyncStore.subscribe(STORAGE_FACTIONS_ENTITES_REVELEES, () => {
      const zoneFactions = document.getElementById("zone-lore-factions");
      if (zoneFactions) rendreFactions();
    });

    // Modal choix permanent d'une capacité (ex. +2 DEF OU +1d8 DM)
    const btnFermerModalChoix = document.getElementById("btn-fermer-modal-choix-capacite");
    if (btnFermerModalChoix) btnFermerModalChoix.onclick = fermerModalChoixCapacite;
    const modalChoixCapacite = document.getElementById("modal-choix-capacite");
    if (modalChoixCapacite) modalChoixCapacite.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fermerModalChoixCapacite();
    });

    // Modal choix d'un Don (niveaux 4/8/12)
    const btnFermerModalDon = document.getElementById("btn-fermer-modal-choix-don");
    if (btnFermerModalDon) btnFermerModalDon.onclick = fermerModalChoixDon;
    const modalChoixDon = document.getElementById("modal-choix-don");
    if (modalChoixDon) modalChoixDon.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) fermerModalChoixDon();
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
    initSelecteurSkinDe();

    // Messages MJ → joueur
    const btnEnvoyerMessage = document.getElementById("btn-envoyer-message");
    if (btnEnvoyerMessage) btnEnvoyerMessage.onclick = envoyerMessage;
    SyncStore.subscribe(STORAGE_MESSAGES, (messages) => {
      _verifierNouveauxMessages(messages);
      _majBadgeMessages();
      const panneauMessages = document.getElementById("panneau-messages");
      if (panneauMessages && panneauMessages.classList.contains("actif")) rendreMessages();
    });
    _majBadgeMessages();

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
      if (panneauFiche && panneauFiche.classList.contains("actif")) {
        rendreListePersos();
        if (ficheActiveId && chargerPersos()[ficheActiveId]) afficherFiche(ficheActiveId);
      }
      // Mini-fiche battlemap : rafraîchie même hors onglet "Ma fiche" — un
      // malus posé par le MJ ("Ajouter malus") doit apparaître tout de suite
      // pour un joueur resté sur la carte, pas seulement s'il revient sur sa fiche.
      if (ficheSidebarActiveId && chargerPersos()[ficheSidebarActiveId]) rendreFicheSidebarBattlemap(ficheSidebarActiveId);
      const panneauLivret = document.getElementById("panneau-livret");
      if (panneauLivret && panneauLivret.classList.contains("actif")) rendrePanneauLivret();
      // Atelier : un inventaire modifié ailleurs (loot reçu, objet donné...)
      // doit mettre à jour la liste d'objets/matériaux disponibles sans
      // attendre que le joueur change d'onglet et y revienne.
      const panneauAtelier = document.getElementById("panneau-atelier");
      if (panneauAtelier && panneauAtelier.classList.contains("actif")) rendrePanneauAtelier();
    });

    // Rattrapage objets de Grimoire manquants (cf. rattraperObjetsGrimoireManquants),
    // réservé au MJ (seul client normalement unique sur une table — pas de
    // garde anti-répétition nécessaire, la fonction est déjà un no-op dès que
    // plus aucun personnage n'a l'objet manquant) : dès que le premier état
    // des personnages est connu (ecouter() notifie immédiatement si déjà
    // prêt) ET à chaque fois que le rôle MJ est choisi (cf. definirRole),
    // pour couvrir aussi bien "MJ déjà choisi avant ce chargement" que
    // "personnages pas encore synchronisés au moment du choix de rôle".
    window.DepotPersos.ecouter(() => { if (role === "mj") rattraperObjetsGrimoireManquants(); });

    // Journal de dés partagé : re-rendu dès qu'un autre client lance un dé.
    // subscribeListe (sous-collection, cf. sync.js) au lieu de subscribe
    // (document unique) : chaque jet est un document séparé, plus de
    // réécriture d'un tableau partagé entre clients concurrents.
    SyncStore.subscribeListe(STORAGE_HISTO, () => { rendreHisto(); _verifierNouveauJetPourOverlay(); }, 40);

    // Tracker d'initiative : re-rendu temps réel (MJ ET joueurs voient le même
    // ordre/round/tour actif), y compris le bloc "Lancer mon initiative" sur
    // la fiche d'un joueur dès que son entrée est mise à jour ailleurs.
    if (typeof Combat !== "undefined") {
      Combat.onChange(() => {
        rendreOrdreInitiative();
        rendreOrdreInitiative("battlemap-zone-ordre-initiative");
        if (ficheActiveId && chargerPersos()[ficheActiveId]) afficherFiche(ficheActiveId);
        if (ficheSidebarActiveId && chargerPersos()[ficheSidebarActiveId]) rendreFicheSidebarBattlemap(ficheSidebarActiveId);
      });
    }

    // Fenêtre de réaction (prototype Contresort, cf. js/reactions.js) :
    // TOUS les rôles re-rendent (pour afficher/masquer htmlBlocFenetreReaction
    // côté joueur, et le bandeau "Clore" de rendreOrdreInitiative côté MJ) —
    // seul le MJ, en plus, est responsable de la résolution (timer ou
    // réponse reçue), cf. _planifierResolutionReaction. onChange se déclenche
    // aussi à l'abonnement initial (valeur en cache) : un MJ qui recharge sa
    // page pendant qu'une fenêtre est ouverte reprend donc le bon timer
    // (cf. piège "doit survivre à un rechargement").
    if (typeof Reactions !== "undefined") {
      Reactions.onChange((e) => {
        rendreOrdreInitiative();
        rendreOrdreInitiative("battlemap-zone-ordre-initiative");
        if (ficheActiveId && chargerPersos()[ficheActiveId]) afficherFiche(ficheActiveId);
        if (ficheSidebarActiveId && chargerPersos()[ficheSidebarActiveId]) rendreFicheSidebarBattlemap(ficheSidebarActiveId);
        if (role === "mj") _planifierResolutionReaction(e);
      });
      // Décompte affiché (#reaction-compte-a-rebours, cf. htmlBlocFenetreReaction)
      // : rafraîchi chaque seconde sans re-rendu complet — la fermeture de la
      // fenêtre (qui, elle, fait disparaître le bloc) passe par onChange
      // ci-dessus, pas par ce minuteur d'affichage.
      setInterval(() => {
        const span = document.getElementById("reaction-compte-a-rebours");
        const e = span && Reactions.etat();
        if (e) span.textContent = Math.ceil(Reactions.msRestantes(e) / 1000);
      }, 1000);
    }

    // Chance d'équipe (cf. htmlBlocChance) : pool partagé, re-rendu temps réel
    // dès qu'un autre client (MJ ou joueur) l'ajuste.
    SyncStore.subscribe(STORAGE_CHANCE_EQUIPE, () => {
      if (ficheActiveId && chargerPersos()[ficheActiveId]) afficherFiche(ficheActiveId);
      if (ficheSidebarActiveId && chargerPersos()[ficheSidebarActiveId]) rendreFicheSidebarBattlemap(ficheSidebarActiveId);
    });

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

    // Marché — réassort MJ ou nouvelle demande/validation : répercute en
    // direct chez tout le monde si le panneau Marché est actuellement ouvert
    // (même schéma que loot:vote ci-dessus).
    SyncStore.subscribe("marche:stock", () => {
      const p = document.getElementById("panneau-marche");
      if (p && p.classList.contains("actif") && typeof Marche !== "undefined") Marche.rendrePanneauMarche();
    });
    SyncStore.subscribe("marche:demandes", () => {
      const p = document.getElementById("panneau-marche");
      if (p && p.classList.contains("actif") && typeof Marche !== "undefined") Marche.rendrePanneauMarche();
    });
    // Bestiaire — une stat de monstre modifiée par un MJ se répercute en direct.
    SyncStore.subscribe("bestiaire:overrides", () => {
      const p = document.getElementById("panneau-bestiaire");
      if (p && p.classList.contains("actif") && !_monstreEnEdition) _afficherMonstres();
    });

    // Réputation — un ajustement MJ sur un bloc répercute en direct chez tout
    // le monde si le panneau Réputation est actuellement ouvert (même schéma
    // que marche:stock/marche:demandes ci-dessus). Une clé SyncStore par
    // faction (reputation:{factionId}), abonnement individuel pour chacune.
    if (typeof REPUTATION_FACTIONS_LIBERRA !== "undefined") {
      REPUTATION_FACTIONS_LIBERRA.forEach((f) => {
        SyncStore.subscribe(`reputation:${f.id}`, () => {
          const p = document.getElementById("panneau-reputation");
          if (p && p.classList.contains("actif") && typeof Reputation !== "undefined") Reputation.rendrePanneauReputation();
        });
      });
    }
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
    rendreDockCombat(); // reconstruit/masque le dock de combat selon le mode
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
        const base = typeof BESTIAIRE_INDEX !== "undefined" ? BESTIAIRE_INDEX[btn.dataset.monstreId] : null;
        const m = base ? _monstreEffectif(base) : null; // stats éditées par le MJ prises en compte en combat
        if (m && typeof Carte !== "undefined") {
          Carte.ajouterMonstre(m);
          fermerModalMonstre();
        }
      };
    });
  }

  /* ============================================================
     MODAL MALUS (MJ) — applique un état du catalogue (js/etats.js) à un
     PJ ou un monstre en combat, sans passer par une capacité mécanisée.
     ============================================================ */

  // prefill (optionnel) : { cibleRaw, idEtat, dureeAffichee, formuleDot } —
  // utilisé par l'action de Lancer (cf. _resoudreConsommationLancer) pour
  // pré-sélectionner la cible touchée, l'état "empoisonnee" et les valeurs
  // du poison lancé. Le MJ garde la main : rien n'est appliqué tant qu'il
  // ne clique pas sur "Appliquer".
  function ouvrirModalMalus(prefill) {
    const modal = document.getElementById("modal-malus");
    if (!modal || typeof ETATS === "undefined") return;

    const selCible = document.getElementById("modal-malus-cible");
    const persos = chargerPersos();
    const monstres = typeof Carte !== "undefined" ? Carte.listeMonstresCombat() : [];
    const optionsJoueurs = Object.keys(persos)
      .map((id) => `<option value="pj:${id}">${echapper(persos[id].nom)}</option>`).join("");
    const optionsMonstres = monstres
      .map((m) => `<option value="monstre:${m.id}">${echapper(m.nom)}</option>`).join("");
    selCible.innerHTML =
      (optionsJoueurs ? `<optgroup label="Joueurs">${optionsJoueurs}</optgroup>` : "") +
      (optionsMonstres ? `<optgroup label="Monstres">${optionsMonstres}</optgroup>` : "");
    if (!optionsJoueurs && !optionsMonstres) {
      selCible.innerHTML = `<option value="">Aucune cible disponible</option>`;
    }
    if (prefill && prefill.cibleRaw && [...selCible.options].some((o) => o.value === prefill.cibleRaw)) {
      selCible.value = prefill.cibleRaw;
    }

    const selEtat = document.getElementById("modal-malus-etat");
    selEtat.innerHTML = ORDRE_CATEGORIES_ETATS.map((cat) => {
      const ids = Object.keys(ETATS).filter((id) => ETATS[id].categorie === cat && !ETATS[id].parSource);
      if (!ids.length) return "";
      const options = ids.map((id) => `<option value="${id}">${echapper(ETATS[id].nom)}</option>`).join("");
      return `<optgroup label="${LIBELLES_CATEGORIES_ETATS[cat] || cat}">${options}</optgroup>`;
    }).join("");
    if (prefill && prefill.idEtat && ETATS[prefill.idEtat]) selEtat.value = prefill.idEtat;

    document.getElementById("modal-malus-duree").value = (prefill && prefill.dureeAffichee) || "";
    const champDot = document.getElementById("modal-malus-dot");
    const labelDot = document.getElementById("modal-malus-dot-label");
    champDot.value = (prefill && prefill.formuleDot) || "";
    const majChampDot = () => {
      labelDot.style.display = ETATS[selEtat.value] && ETATS[selEtat.value].categorie === "dot" ? "block" : "none";
    };
    selEtat.onchange = majChampDot;
    majChampDot();
    modal.style.display = "flex";
  }

  function fermerModalMalus() {
    const modal = document.getElementById("modal-malus");
    if (modal) modal.style.display = "none";
  }

  // entrée etatsActifs manuelle (pas de durée numérique auto-décomptée — cf.
  // decompterEtatsDebutTour côté capacites.js, qui ignore les entrées sans
  // dureeRestante.tours numérique) : retrait toujours manuel via ✕, comme
  // souhaité pour un malus posé "à la main" par le MJ.
  function _entreeMalusMj(idEtat, dureeAffichee, formuleDot) {
    return {
      idEtat,
      dureeRestante: { tours: null, motCle: null, dureeAffichee: dureeAffichee || null },
      formuleDot: formuleDot || null,
      source: "MJ",
      poseLe: Date.now(),
    };
  }

  function appliquerMalus() {
    const cibleRaw = document.getElementById("modal-malus-cible").value;
    const idEtat = document.getElementById("modal-malus-etat").value;
    const duree = document.getElementById("modal-malus-duree").value.trim();
    const formuleDot = document.getElementById("modal-malus-dot").value.trim();
    if (!cibleRaw || !idEtat) return;
    // Barde — Voie du spectacle, rang 5 "Liberté d'action" (paralysee
    // uniquement) : cas MJ-only à part, consomme un usage 1x/combat avant
    // même de tenter la pose — reste ici plutôt que dans
    // _appliquerEtatSurCibleRaw, qui ne connaît pas cette nuance de classe
    // ni la modale à fermer sur ce chemin de sortie spécifique.
    if (idEtat === "paralysee" && cibleRaw.startsWith("pj:") && typeof Capacites !== "undefined") {
      const persos = chargerPersos();
      const p = persos[cibleRaw.slice(3)];
      const perso = p && Personnage.depuisJSON(p);
      if (perso && perso.aLiberteAction() && !perso.aImmuniteEtat(idEtat)) {
        const usage = Capacites.verifierUsage(p, "classe:barde:5", { usage: { frequence: "1x/combat" } });
        if (usage.ok) {
          usage.appliquer();
          sauverPersos(persos);
          toast(`${p.nom} ignore automatiquement l'état « ${ETATS[idEtat].nom} » (Liberté d'action, 1x/combat — épuisé pour ce combat).`);
          fermerModalMalus();
          return;
        }
      }
    }
    const entree = _entreeMalusMj(idEtat, duree, formuleDot);
    const res = _appliquerEtatSurCibleRaw(cibleRaw, idEtat, entree);
    // res.message porte déjà soit le refus (immunité), soit la confirmation —
    // un seul toast() ici, jamais deux (cf. _appliquerEtatSurCibleRaw).
    if (res.message) toast(res.message);
    fermerModalMalus();
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

  // Extrait le bonus d'un jet de monstre en texte libre, ex. "1d20+3 vs DEF"
  // -> +3 — utilisé uniquement pour l'ANCIEN format inline (invocations, cf.
  // _resoudreAttaqueMonstre) ; le bestiaire migré porte bonusAttaque en clair.
  function extraireBonusJetMonstre(jet) {
    const m = /1d20\s*([+-]\s*\d+)/i.exec(jet || "");
    return m ? parseInt(m[1].replace(/\s/g, ""), 10) : 0;
  }

  // Résout une entrée m.attaques[] dans un format commun, quelle que soit sa
  // source : le bestiaire migré (data/bestiaire.json + data/armes_monstres.js,
  // cf. armeId+bonusAttaque) OU une invocation de joueur (js/carte.js,
  // _resoudreInvocation/confirmerInvocation, qui génère encore l'ANCIEN format
  // inline jet/degats/portee/type — pas de migration prévue pour ces jetons
  // dynamiques). Renvoie null si l'armeId référencé est introuvable dans le
  // catalogue (ne devrait pas arriver, cf. tools/valider_mecaniques.js).
  function _resoudreAttaqueMonstre(a) {
    if (!a) return null;
    if (a.armeId !== undefined) {
      const arme = typeof ArmesMonstres !== "undefined" ? ArmesMonstres.trouver(a.armeId) : null;
      if (!arme) return null;
      const bonusAttaque = a.bonusAttaque || 0;
      // Le catalogue ne porte que le dé nu (cf. schema_cible_armes_monstres.md
      // §1) — tout modificateur fixe vient de l'attaque qui référence l'arme
      // (bonusDegats), jamais de l'arme elle-même : un futur monstre qui veut
      // la même arme à un tarif différent réutilise l'armeId avec son propre
      // bonusDegats, au lieu de créer un doublon "_2"/"_3" dans le catalogue.
      const bonusDegats = a.bonusDegats || 0;
      const expr = bonusDegats ? `${arme.degats}${signe(bonusDegats)}` : arme.degats;
      // touches (§5.2) : une arme qui frappe N fois (ex. Double frappe) répète
      // le même terme N fois plutôt que d'écrire un multiplicateur littéral
      // ("(x2)") que lancerFormule ne sait pas interpréter — "1d12+4+1d12+4"
      // reste une formule valide, produit un total unique, et double
      // correctement CHAQUE terme de dé sur un critique (comportement de
      // table déjà pratiqué : un seul jet d'attaque pour toute l'action, pas
      // un jet par touche — cf. §5.2 pour la réserve assumée sur ce point).
      const touches = arme.touches || 1;
      return {
        nom: a.nom, bonusAttaque,
        degats: Array(touches).fill(expr).join("+"),
        degatsTexte: touches > 1 ? `${expr} ×${touches}` : expr,
        portee: arme.portee, typedegats: arme.typedegats, elementaire: arme.elementaire || null,
        jetTexte: `1d20${signe(bonusAttaque)} vs DEF`,
        effetSpecial: a.effetSpecial,
        // Aucune arme de monstre n'a de seuil de critique abaissé aujourd'hui
        // (pas d'affixe "Aiguisé" sur le catalogue armes_monstres) — point
        // d'extension si une arme spécifique en reçoit un jour un.
        critMin: arme.critMin || 20,
      };
    }
    return {
      nom: a.nom, bonusAttaque: extraireBonusJetMonstre(a.jet),
      degats: a.degats, degatsTexte: a.degats, portee: a.portee, typedegats: a.type, elementaire: null,
      jetTexte: a.jet,
      effetSpecial: a.effetSpecial,
      critMin: 20,
    };
  }

  // Cible PJ actuellement choisie par monstre (table de combat MJ, cf.
  // rendreTableCombat/_resoudreAttaqueMonstreVsPJ) — monstreId -> persoId,
  // état de MODULE (pas une closure locale) car la table de combat est
  // re-rendue indépendamment dans l'onglet "⚔ Combat" ET le panneau
  // battlemap MJ (peuvent être montés simultanément, cf. rendreTableCombat).
  let ciblesMonstres = {};
  // État "dégâts en attente" des attaques de monstre, par monstre ET par
  // index d'attaque (un monstre a souvent 2-3 armes distinctes) — même
  // contrainte de module que ciblesMonstres.
  let attaquesMonstresEnAttente = {};

  // Résout une attaque de monstre contre une cible PJ (table de combat MJ) :
  // lance le jet (réutilise lancerTest), détermine touché/raté/critique/échec
  // critique via _toucheVsDef si un PJ cible est choisi. Sans cible, touche
  // vaut null (jamais bloquant, jet brut) — même logique que
  // _resoudreAttaqueRapide côté joueur, avec une DEF cible directement issue
  // de calculerCA() (pas de token dd2vtt à résoudre ici, la cible est
  // choisie par id de personnage directement).
  // Don Expert du bouclier (cf. Personnage.aExpertBouclier) : force le
  // désavantage sur CE jet précis, indépendamment du sélecteur global
  // mode-d20 — ne couvre que les attaques de monstre résolues ici (pas les
  // capacités, dont le jet d'attaque ne passe pas par lancerTest).
  function _resoudreAttaqueMonstreVsPJ(label, bonus, critMin, pjId, typeAttaque) {
    const cibleP = pjId ? chargerPersos()[pjId] : null;
    const cible = cibleP ? Personnage.depuisJSON(cibleP) : null;
    const modeForce = cible && cible.aExpertBouclier() ? "desavantage" : null;
    const jet = lancerTest(label, bonus, critMin, modeForce, { estMonstre: true });
    const defCible = cible ? _defPjAvecAura(cible, pjId, typeAttaque) : null;
    const touche = _toucheVsDef(jet, !!pjId, defCible);
    return { touche, critique: jet.crit, echecCritique: jet.echec, totalAttaque: jet.total, defCible };
  }

  // Visibilité du bouton "Dégâts" et doublement des dés pour une attaque de
  // monstre donnée — mêmes règles que _etatDegatsRapide (visible=false
  // SEULEMENT sur un raté avéré, jamais sans cible ou DEF inconnue).
  function _etatDegatsMonstre(monstreId, idxAttaque) {
    const e = attaquesMonstresEnAttente[`${monstreId}:${idxAttaque}`];
    if (!e) return { visible: true, critique: false };
    return { visible: e.touche !== false, critique: e.touche === true && !!e.critique };
  }

  // Boutons d'attaque rapide pour un monstre de la table de combat : une ligne
  // par attaque, jet 1d20+bonus à gauche, dégâts (formule figée, pas de bonus)
  // à droite via l'icône 🎲. Source des attaques : m.attaques si présent
  // directement sur le jeton (invocation de joueur, cf. INVOCATIONS/
  // confirmerInvocation côté js/carte.js — pas d'entrée BESTIAIRE_INDEX pour
  // ces créatures-là), sinon m.monstreId -> BESTIAIRE_INDEX comme avant.
  function attaquesMonstreHtml(m) {
    const def = (typeof BESTIAIRE_INDEX !== "undefined" && m.monstreId) ? BESTIAIRE_INDEX[m.monstreId] : null;
    const attaques = m.attaques || (def && def.attaques);
    if (!attaques || !attaques.length) return "";
    // bonusAttaqueEffectif : bonusAttaque de base + malus/bonus actifs (cf.
    // _bonusEtatsMonstre, ex. Barde "Note discordante") — affiché ici et
    // repris tel quel au clic (data-monstre-jet ci-dessous), pour que le
    // nombre affiché soit toujours celui réellement lancé.
    return `<div class="cm-attaques">${attaques.map((a, i) => {
      const r = _resoudreAttaqueMonstre(a);
      if (!r) return "";
      const etatDeg = _etatDegatsMonstre(m.id, i);
      const bonusAttaqueEffectif = r.bonusAttaque + _bonusEtatsMonstre(m, "attaque");
      return `<div class="cm-attaque-ligne">
        <button class="btn petit secondaire" data-monstre-jet="${m.id}" data-idx-attaque="${i}" title="${echapper(r.jetTexte || "")}">⚔ ${echapper(r.nom)} (${signe(bonusAttaqueEffectif)})</button>
        ${etatDeg.visible ? `<button class="btn-de-cap" data-monstre-degats="${m.id}" data-idx-attaque="${i}" data-monstre-critique="${etatDeg.critique ? "1" : "0"}" title="Dégâts : ${echapper(r.degatsTexte || r.degats || "")}">🎲${etatDeg.critique ? " CRIT" : ""}</button>` : ""}
      </div>`;
    }).join("")}</div>`;
  }

  // Capacités actives d'un monstre (cf. js/capacites_monstres.js,
  // schema_cible_capacites_monstres.md §6) — un bouton par entrée de
  // CapacitesMonstres.capacitesDe(m), grisé quand preparer() refuse (usage
  // épuisé), avec un résumé compact en title. Bouton ↻ à côté des capacités
  // en "1x/recharge" (recharge purement déclarative — le MJ débloque à la
  // main, cf. §7 du schéma : aucune période nommée n'est réinitialisée
  // automatiquement).
  function capacitesMonstreHtml(m) {
    if (typeof CapacitesMonstres === "undefined") return "";
    const capacites = CapacitesMonstres.capacitesDe(m);
    if (!capacites.length) return "";
    return `<div class="cm-capacites">${capacites.map((cap, i) => {
      const prep = CapacitesMonstres.preparer(m, i);
      const grise = !prep.ok;
      const titre = [CapacitesMonstres.resume(cap.mecanique), cap.description, prep.raison].filter(Boolean).join(" — ");
      const enRecharge = cap.mecanique && cap.mecanique.usage && cap.mecanique.usage.frequence === "1x/recharge";
      return `<div class="cm-capacite-ligne">
        <button class="btn petit or${grise ? " grise" : ""}" data-capacite-monstre="${m.id}" data-idx-capacite="${i}" ${grise ? "disabled" : ""} title="${echapper(titre)}">✨ ${echapper(cap.nom)}</button>
        ${enRecharge ? `<button class="btn petit secondaire" data-recharge-capacite="${m.id}" data-idx-capacite="${i}" title="Débloque manuellement cette capacité (recharge non décomptée automatiquement).">↻</button>` : ""}
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
    let avatarInner, styleCadre = "", badgeNumero = "";
    if (e.type === "pj") {
      const perso = chargerPersos()[e.id];
      avatarInner = avatarHtml(perso, 52);
    } else {
      const monstre = (typeof Carte !== "undefined" ? Carte.listeMonstresCombat() : []).find((m) => m.id === e.id);
      const couleur = (monstre && monstre.couleur) || "#7c5aa6";
      // Distingue plusieurs instances d'un même monstre (ex. "Gobelin garde
      // 2") — même badge numéro que le jeton sur la carte (cf. rendreTokensDD/
      // dd-token-numero dans js/carte.js). Sans ce détachement du chiffre
      // avant d'appeler Carte.initiales(), un nom à 2+ mots ("Gobelin garde
      // 1"/"Gobelin garde 2") perd le chiffre : slice(0,2) sur ["Gobelin",
      // "garde","2"] ne garde que "Gobelin"+"garde" → "GG" pour les deux.
      const numeroMatch = /\s(\d+)$/.exec(e.nom);
      const nomSansNumero = numeroMatch ? e.nom.slice(0, numeroMatch.index) : e.nom;
      const inits = typeof Carte !== "undefined" && Carte.initiales ? Carte.initiales(nomSansNumero) : "?";
      styleCadre = ` style="background:${couleur};"`;
      avatarInner = echapper(inits);
      badgeNumero = numeroMatch ? `<span class="initiative-numero">${numeroMatch[1]}</span>` : "";
    }
    const badgeInitiative = e.initiative === null
      ? `<span class="initiative-badge attente">?</span>`
      : `<span class="initiative-badge">${e.initiative}</span>`;
    const titre = `${e.nom}${e.type === "monstre" ? " (monstre)" : ""}`;
    return `<div class="initiative-pastille${estActif ? " actif" : ""}${e.koTourCourant ? " ko" : ""}" title="${echapper(titre)}">
      <div class="initiative-avatar-wrap">
        <div class="initiative-avatar-cadre"${styleCadre}>${avatarInner}</div>
        ${badgeInitiative}
        ${badgeNumero}
        ${e.koTourCourant ? `<span class="initiative-badge-ko">💀</span>` : ""}
      </div>
      <span class="initiative-nom-mini">${echapper(e.nom)}</span>
    </div>`;
  }

  // Ordre d'initiative en LECTURE SEULE pour un joueur (aucun bouton MJ) —
  // affiché en haut de sa sidebar battlemap pendant un combat, pour qu'il voie
  // les cartes de tous les combattants et à qui c'est le tour, sans dépendre du
  // partage d'écran du MJ. monPersoId sert à détecter "c'est ton tour".
  // Renvoie "" hors combat (le MJ n'a pas encore lancé le mode combat).
  function _htmlOrdreInitiativeLecture(monPersoId) {
    if (typeof Combat === "undefined" || !Combat.estActif()) return "";
    const etat = Combat.etatCourant();
    if (!etat.ordre.length) return "";
    const actif = etat.ordre[etat.indexActuel];
    const cEstMonTour = !!(actif && actif.type === "pj" && actif.id === monPersoId);
    return `<div class="carte initiative-carte${cEstMonTour ? " mon-tour" : ""}">
      <div class="initiative-entete">
        <h3 style="margin:0;">Ordre d'initiative — Round ${etat.round}</h3>
        ${cEstMonTour ? `<span class="badge-mon-tour">⚔️ À toi de jouer !</span>` : ""}
      </div>
      <div class="initiative-bandeau">
        ${etat.ordre.map((e, idx) => _ligneInitiativeHtml(e, idx === etat.indexActuel)).join("")}
      </div>
    </div>`;
  }

  // targetId : conteneur à peupler — l'onglet dédié "Table de combat"
  // (zone-ordre-initiative) par défaut, ou la colonne MJ de la battlemap
  // (battlemap-zone-ordre-initiative) pour lancer/suivre le combat sans
  // changer d'onglet. Les deux peuvent exister dans le DOM en même temps
  // (l'onglet caché n'est que masqué en CSS) : les boutons sont donc
  // ciblés via zone.querySelector (classes) plutôt que des id globaux,
  // sinon document.getElementById ne câblerait le handler que sur la
  // première instance trouvée dans le document.
  function rendreOrdreInitiative(targetId) {
    targetId = targetId || "zone-ordre-initiative";
    const zone = document.getElementById(targetId);
    if (!zone || typeof Combat === "undefined") return;

    if (!Combat.estActif()) {
      zone.innerHTML = `<div class="carte"><button class="btn or btn-demarrer-combat">⚔ Lancer le combat</button></div>`;
      zone.querySelector(".btn-demarrer-combat").onclick = () => {
        if (role !== "mj") return;
        Combat.demarrer();
      };
      return;
    }

    const etatCombat = Combat.etatCourant();
    // Fenêtre de réaction ouverte (prototype Contresort, cf. js/reactions.js)
    // : bandeau MJ uniquement — les joueurs répondants voient déjà
    // htmlBlocFenetreReaction sur leur propre fiche, le MJ n'a besoin que
    // du bouton "Clore" (résolution immédiate, sans attendre les 15 s).
    const reactionOuverte = (role === "mj" && typeof Reactions !== "undefined") ? Reactions.etat() : null;
    const reactionLibelle = reactionOuverte && reactionOuverte.evenement === "subitAttaque"
      ? echapper(reactionOuverte.attaque.label)
      : reactionOuverte ? `${echapper(reactionOuverte.sort.nom)} (${echapper(reactionOuverte.source.nom)})` : "";
    const reactionHtml = reactionOuverte ? `<div class="initiative-entete" style="border-top:1px dashed var(--or);padding-top:8px;margin-top:8px;">
      <span>⚡ Fenêtre de réaction ouverte : <strong>${reactionLibelle}</strong> — ${reactionOuverte.repondants.length} répondant(s), ${Math.ceil(Reactions.msRestantes(reactionOuverte) / 1000)} s restantes.</span>
      <button class="btn petit secondaire btn-clore-reaction">⏹ Clore la fenêtre</button>
    </div>` : "";
    zone.innerHTML = `<div class="carte initiative-carte">
      <div class="initiative-entete">
        <h3 style="margin:0;">Ordre d'initiative — Round ${etatCombat.round}</h3>
        <div class="barre-actions">
          <button class="btn petit btn-tour-suivant">⏭ Tour suivant</button>
          <button class="btn petit danger btn-terminer-combat">⏹ Terminer le combat</button>
        </div>
      </div>
      ${reactionHtml}
      <div class="initiative-bandeau">
        ${etatCombat.ordre.map((e, idx) => _ligneInitiativeHtml(e, idx === etatCombat.indexActuel)).join("")}
      </div>
    </div>`;

    zone.querySelector(".btn-tour-suivant").onclick = () => {
      if (role !== "mj") return;
      Combat.tourSuivant();
    };
    zone.querySelector(".btn-terminer-combat").onclick = () => {
      if (role !== "mj") return;
      if (!confirm("Terminer le combat ? Les états « finCombat » actifs sur les PJ seront purgés.")) return;
      Combat.terminerCombat();
    };
    const btnClore = zone.querySelector(".btn-clore-reaction");
    if (btnClore) {
      btnClore.onclick = () => {
        if (role !== "mj" || typeof Reactions === "undefined") return;
        const e = Reactions.etat();
        if (e) _resoudreFenetreReaction(e);
      };
    }
  }

  // Distance de la fenêtre de réaction (15 m, cf. "Prototype du moteur de
  // réaction : Contresort", Étape 3) — exprimée en CASES puisque
  // Carte.distanceCasesEntre() rend des cases (1 case = 1,5 m, cf. carte.js
  // "Domaine de Valdecourt"). Constante dédiée, DISTINCTE de
  // mecanique.portee (en mètres, propre à chaque sort du bestiaire) : le
  // prompt fixe 15 m explicitement pour cette fenêtre, indépendamment de la
  // portée du sort qui la déclenche.
  const PORTEE_CONTRESORT_CASES = 10; // 15 m / 1,5 m par case

  // Sort "contresort" (SORTS_MAGICIEN, partagé par magicien/necromancien,
  // cf. data/donnees.js) — coutPP/reactionCout lus dynamiquement plutôt que
  // dupliqués en dur ici : une seule source de vérité si l'équilibrage change.
  function _sortContresort() {
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? SORTS_PAR_CLASSE.magicien : null;
    return catalogue ? catalogue.find((s) => s.id === "contresort") : null;
  }

  // Réponse d'un PJ à la fenêtre de réaction (cf. htmlBlocFenetreReaction,
  // boutons Contresort/Passer) — extrait du wiring pour rester testable
  // directement. "passe" clôt juste la participation de CE PJ (sans coût) ;
  // "contresort" dépense PP+réaction via Capacites.lancer (API publique, cf.
  // piège "ne pas toucher js/capacites.js") PUIS résout le contest à part —
  // un test d'attaque magique vs la difficulté du rang (10+2×rang, même
  // échelle que l'enchantement d'armes, cf. js/enchantement.js). Le coût est
  // dépensé que le contest réussisse ou non, comme n'importe quel sort lancé.
  function _repondreFenetreReaction(persoId, action) {
    if (typeof Reactions === "undefined") return;
    if (action === "passe") { Reactions.repondre(persoId, "passe"); return; }
    const e = Reactions.etat();
    if (!e || e.reponse || !e.repondants.includes(persoId)) return;
    if (action === "reflechissant") {
      // Seul le PJ CIBLE du sort peut renvoyer (cf. _repondantsSortLance) —
      // pas de PP/réaction (économie item, comme "esquive"), consomme
      // seulement l'usage de l'objet.
      if (e.pjId !== persoId) return;
      const persos = chargerPersos();
      const p = persos[persoId];
      const dispo = p && _itemReflechissantDisponible(p);
      if (!dispo) { toast("Renvoi du sort indisponible."); return; }
      dispo.usage.appliquer();
      sauverPersos(persos);
      toast(`🪞 ${dispo.it.nom} : le sort est renvoyé vers son lanceur !`);
      Reactions.repondre(persoId, "reflechissant", { itemNom: dispo.it.nom });
      return;
    }
    const sort = _sortContresort();
    if (!sort) { toast("Contresort introuvable dans le catalogue de sorts."); return; }
    const res = Capacites.lancer({
      persoId,
      source: { origine: "grimoire", cle: "contresort", nomCap: "Contresort", idSort: "contresort" },
      mecanique: Object.assign({}, sort.mecanique, { origineGrimoire: true }),
    });
    if (!res.ok) { toast(res.messages.join(" · ")); return; }
    const perso = Personnage.depuisJSON(chargerPersos()[persoId]);
    const difficulte = 10 + 2 * e.sort.rang;
    const caracMagie = (typeof CARAC_MAGIE !== "undefined") ? CARAC_MAGIE[perso.classe] : null;
    const jet = lancerTest(`Contresort vs ${e.sort.nom} (rang ${e.sort.rang})`, perso.bonusAttaque("magique") || 0, 20, null, { persoId, caracCode: caracMagie });
    const reussite = jet.total >= difficulte;
    toast(reussite ? `✨ Contresort réussi (${jet.total} ≥ ${difficulte}) ! ${e.sort.nom} est annulé.` : `Contresort raté (${jet.total} < ${difficulte}) — ${e.sort.nom} se résout normalement.`);
    Reactions.repondre(persoId, "contresort", { reussite, jetTotal: jet.total, difficulte });
  }

  // Éligibilité à Contresort pour UN PJ donné (cf. Étape 3, 4 conditions) —
  // extrait de _repondantsContresort (même principe que _peutBouclierArcanique
  // extrait de son ancien _repondantsBouclierArcanique) pour être réutilisable
  // au rendu des boutons (cf. htmlBlocFenetreReaction, lot "reflechissant" :
  // la fenêtre sortLance peut désormais avoir des répondants non-Contresort).
  function _peutContresort(persoId, p, monstreTokenId) {
    if (!p) return false;
    if (typeof Carte === "undefined" || !Carte.distanceCasesEntre || !Carte.tokenIdPourPerso) return false;
    const sort = _sortContresort();
    if (!sort) return false;
    const perso = Personnage.depuisJSON(p);
    // 1. connaît Contresort (même vérification que le garde-fou
    // origineGrimoire côté Capacites.lancer, cf. js/capacites.js).
    if (!(p.grimoireSortsConnus || []).concat(perso.sortsGrimoireAccordes()).includes("contresort")) return false;
    // 2. dispose du coût en PP.
    if ((p.ppActuel || 0) < (sort.mecanique.coutPP || 0)) return false;
    // 3. au moins 1 réaction restante.
    if (typeof Capacites === "undefined" || Capacites.reactionsRestantes(p) < 1) return false;
    // 4. à 15 m ou moins du lanceur.
    const tokPj = Carte.tokenIdPourPerso(persoId);
    if (!tokPj) return false;
    const dist = Carte.distanceCasesEntre(monstreTokenId, tokPj);
    return dist !== null && dist <= PORTEE_CONTRESORT_CASES;
  }

  // Filtre des répondants éligibles à Contresort — calculé une seule fois, à
  // l'OUVERTURE de la fenêtre : un PJ qui s'éloigne ou dépense ses PP pendant
  // les 15 s reste dans la liste (figée, comme une fenêtre d'opportunité
  // réelle), _repondre() revérifiera de toute façon via Capacites.lancer au
  // moment du clic.
  function _repondantsContresort(monstreTokenId) {
    if (typeof Carte === "undefined" || !Carte.listeTokensJoueursCombat) return [];
    const persos = chargerPersos();
    const persoIds = Carte.listeTokensJoueursCombat()
      .map((tok) => (tok.ref && tok.ref.startsWith("pj-")) ? tok.ref.slice(3) : null)
      .filter(Boolean);
    return persoIds.filter((persoId) => _peutContresort(persoId, persos[persoId], monstreTokenId));
  }

  // Item équipé portant un renvoi de sort "sortLance" disponible (cf.
  // "réfléchissant", bouclier_miroir) — même patron que _itemEsquiveDisponible :
  // renvoie { it, d, usage } (usage vérifié, pas encore consommé) ou null.
  // Contrairement à Contresort (n'importe quel PJ à portée), seul le PJ CIBLE
  // du sort peut renvoyer (cf. _repondantsSortLance) — pas de filtre de
  // portée/distance ici, déjà géré à ce niveau-là.
  function _itemReflechissantDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "sortLance") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "reflechitSort")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Répondants éligibles à la fenêtre "sortLance" (cf. lot "reflechissant") :
  // les PJ éligibles à Contresort (n'importe qui à portée) UNION la cible du
  // sort elle-même si elle porte un objet "réfléchissant" disponible — les
  // deux réponses sont indépendantes, htmlBlocFenetreReaction affiche celles
  // qui s'appliquent à CE PJ précis.
  function _repondantsSortLance(monstreTokenId, pjId) {
    const repondants = _repondantsContresort(monstreTokenId);
    if (pjId && !repondants.includes(pjId) && _itemReflechissantDisponible(chargerPersos()[pjId])) {
      repondants.push(pjId);
    }
    return repondants;
  }

  // Sort "bouclier_arcanique_mineur" (SORTS_MAGICIEN) — même patron que
  // _sortContresort, coutPP lu dynamiquement.
  function _sortBouclierArcanique() {
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? SORTS_PAR_CLASSE.magicien : null;
    return catalogue ? catalogue.find((s) => s.id === "bouclier_arcanique_mineur") : null;
  }

  // Bouclier arcanique disponible pour ce perso brut ? (cf. "Prototype du
  // moteur de réaction", extension §A) — extrait de l'ancien
  // _repondantsBouclierArcanique pour être réutilisable à la fois par le
  // filtre des répondants et par htmlBlocFenetreReaction (qui doit savoir
  // QUEL bouton afficher, pas seulement SI la fenêtre doit s'ouvrir).
  function _peutBouclierArcanique(p) {
    if (!p) return false;
    const sort = _sortBouclierArcanique();
    if (!sort) return false;
    const perso = Personnage.depuisJSON(p);
    if (!(p.grimoireSortsConnus || []).concat(perso.sortsGrimoireAccordes()).includes("bouclier_arcanique_mineur")) return false;
    if ((p.ppActuel || 0) < (sort.mecanique.coutPP || 0)) return false;
    if (typeof Capacites === "undefined" || Capacites.reactionsRestantes(p) < 1) return false;
    return true;
  }

  // Item équipé portant une esquive "subitAttaque" disponible (cf. "parade"/
  // "reactifs"/"insaisissable", lot "subitAttaque : esquive/réduction") —
  // renvoie { it, d, usage } (usage déjà vérifié, pas encore consommé) ou
  // null. `contact` (bool) : true pour une attaque de contact, false pour
  // une attaque à distance/magique — porteeRequise filtre sur ce point
  // (absent = les deux, cf. "insaisissable" qui n'a pas cette restriction).
  function _itemEsquiveDisponible(p, contact) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "subitAttaque") continue;
        if (d.porteeRequise && d.porteeRequise !== (contact ? "contact" : "distance")) continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "esquive")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Item équipé portant une interception "subitAttaque" disponible (cf.
  // "muraille", bouclier_tour) — même patron que _itemEsquiveDisponible, mais
  // sans filtre de portée : c'est l'adjacence à la CIBLE (pas au porteur)
  // qui conditionne la disponibilité, déjà vérifiée par _repondantsSubitAttaque
  // avant d'appeler cette fonction.
  function _itemInterceptionDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "subitAttaque") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "intercepte")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Item équipé portant une annulation de critique "critiqueSubi" disponible
  // (cf. "protectrice", Pierre de chance) — même patron que
  // _itemInterceptionDisponible, mais évènement dédié : contrairement à
  // subitAttaque (avant le jet) et subitContact (après les dégâts, contact
  // uniquement), ce proc se déclenche dès que le jet est connu ET critique,
  // qu'il s'agisse d'une arme ou d'une capacité à jetAttaque à distance — lu
  // par _resoudreAttaqueEtSuite, entièrement automatique (comme "absorbant").
  function _itemAnnuleCritiqueDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "critiqueSubi") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "annuleCritique")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Item équipé (arme de contact) portant un jet à distance courte "jetArme"
  // disponible (cf. "tournoyante", francisque, lot "malgré la limite") —
  // même patron que les autres _item*Disponible : renvoie { it, d, usage }
  // (usage vérifié, pas encore consommé) ou null. Sans usage sur le
  // déclencheur (légendaire), _verifierUsageDeclencheur renvoie {ok:true}
  // sans effet de bord — toujours disponible.
  function _itemLancerArmeDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "jetArme") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "porteeCourte")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Item équipé portant un soin "rateSubie" disponible (cf. "drainante",
  // armure_ombre, lot "armures B") — même patron que les autres
  // _item*Disponible ; contrairement à la plupart, aucun usage.frequence
  // dans le texte de l'affixe (proc à chaque attaque de contact ratée, sans
  // limite) — _verifierUsageDeclencheur renvoie {ok:true} sans effet de
  // bord en l'absence de champ usage, donc toujours disponible ici.
  function _itemSoinRateDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "rateSubie") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "soin")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Item équipé portant une "attaque supplémentaire" disponible (cf. "vive"/
  // "a_repetition"/"duelliste"/"tourbillonnante", lot "armes A/B" — même
  // mécanique que la capacité Barde "Enchaînement (L)", cf. data/donnees.js) —
  // même patron que les autres _item*Disponible.
  function _itemAttaqueSupplementaireDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "attaqueSupplementaire") continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Réponse au bouton "Attaque supplémentaire" (cf. htmlBlocActionsDuTour) :
  // consomme l'usage, délègue l'octroi de l'action à
  // Combat.accorderActionPrincipaleBonus (même fonction que "Doubler le
  // déplacement" et qu'Enchaînement — remet actionPrincipaleUtilisee à false
  // ce tour), puis pose l'éventuel malus ({type:"bonus", cible:"attaque"})
  // sur le porteur lui-même via _appliquerBonusSurCibleRaw — même assomption
  // documentée qu'Enchaînement : le malus s'applique aux DEUX attaques du
  // tour (bonusTemporaire générique, pas de malus scopé à une seule attaque
  // dans le vocabulaire actuel). Rien à poser au palier légendaire (aucun
  // effet "bonus" dans son déclencheur) : _appliquerBonusSurCibleRaw n'est
  // simplement pas appelé.
  function _declencherAttaqueSupplementaire(persoId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dispo = p && _itemAttaqueSupplementaireDisponible(p);
    if (!dispo) { toast("Attaque supplémentaire indisponible."); return; }
    dispo.usage.appliquer();
    sauverPersos(persos);
    if (typeof Combat !== "undefined" && Combat.accorderActionPrincipaleBonus) Combat.accorderActionPrincipaleBonus(persoId);
    const effetMalus = (dispo.d.effets || []).find((e) => e.type === "bonus");
    if (effetMalus) _appliquerBonusSurCibleRaw(`pj:${persoId}`, effetMalus.cible, effetMalus.valeur, String(effetMalus.duree || "1"), dispo.it.nom);
    toast(`⚔️ ${dispo.it.nom} : attaque supplémentaire accordée${effetMalus ? ` (${effetMalus.valeur} ${effetMalus.cible} ce tour)` : ""}.`);
  }

  // Item équipé portant un doublement de déplacement "doublerDeplacement"
  // disponible (cf. "fulgurantes", bottes_vitesse, lot "malgré la limite") —
  // même patron que les autres _item*Disponible.
  function _itemDoubleDeplacementDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "doublerDeplacement") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "doubleDeplacement")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Réponse au bouton "Doubler le déplacement" (cf. htmlBlocActionsDuTour) :
  // consomme l'usage de l'item, délègue le calcul/l'application à
  // Combat.doublerDeplacement (js/combat.js — ajoute _deplacementMax(p) au
  // déplacement restant, sans coût d'action), puis toast.
  function _declencherDoubleDeplacement(persoId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dispo = p && _itemDoubleDeplacementDisponible(p);
    if (!dispo) { toast("Doublement du déplacement indisponible."); return; }
    dispo.usage.appliquer();
    sauverPersos(persos);
    const montant = (typeof Combat !== "undefined" && Combat.doublerDeplacement) ? Combat.doublerDeplacement(persoId) : 0;
    toast(`🥾 ${dispo.it.nom} : déplacement doublé (+${montant} cases ce tour).`);
  }

  // Item équipé portant une disparition "disparition" disponible (cf.
  // "evanescente", cape_brume, lot "malgré la limite") — même patron que les
  // autres _item*Disponible.
  function _itemDisparitionDisponible(p) {
    if (!p) return null;
    const perso = Personnage.depuisJSON(p);
    for (const it of perso._itemsEquipesUniques()) {
      if (!it.declencheurs) continue;
      for (const d of it.declencheurs) {
        if (d.evenement !== "disparition") continue;
        if (!Array.isArray(d.effets) || !d.effets.some((e) => e.type === "etat")) continue;
        const usage = _verifierUsageDeclencheur(p, it, d);
        if (usage.ok) return { it, d, usage };
      }
    }
    return null;
  }

  // Réponse au bouton "Disparaître" (cf. htmlBlocDisparition) : consomme
  // l'usage puis pose l'état porté par l'effet "etat" du déclencheur (id
  // "invisible", cf. js/etats.js) sur le porteur lui-même, via
  // _appliquerEtatSurCibleRaw (même chemin que les autres déclencheurs
  // d'équipement — respecte l'immunité "Liberté d'action" au passage).
  function _declencherDisparition(persoId) {
    const persos = chargerPersos();
    const p = persos[persoId];
    const dispo = p && _itemDisparitionDisponible(p);
    if (!dispo) { toast("Disparition indisponible."); return; }
    const effetEtat = dispo.d.effets.find((e) => e.type === "etat");
    dispo.usage.appliquer();
    sauverPersos(persos);
    const entree = {
      idEtat: effetEtat.id,
      dureeRestante: Object.assign(_resoudreDureeToursMonstre(effetEtat.duree || "", null), { dureeAffichee: effetEtat.duree || null }),
      source: dispo.it.nom, poseLe: Date.now(),
    };
    const res = _appliquerEtatSurCibleRaw("pj:" + persoId, effetEtat.id, entree);
    toast(res.applique ? `🌫️ ${dispo.it.nom} : ${res.message}` : (res.message || "Disparition indisponible."));
  }

  // Répondants éligibles à la fenêtre "subitAttaque" (cf. "Prototype du
  // moteur de réaction", extension §A + lots "esquive/réduction" et
  // "reflechissant/muraille") : la cible de l'attaque elle-même (Bouclier
  // arcanique et/ou une esquive d'équipement, réponses indépendantes) UNION
  // tout allié ADJACENT À LA CIBLE (distance <= 1 case, cf. Personnage.
  // bonusDefDuel pour le même patron Carte.distanceCasesEntre) qui porte un
  // objet d'interception disponible (cf. "muraille") — [] hors battlemap
  // dd2vtt (aucune notion de case) ou si la cible n'a pas de jeton posé,
  // comme les autres bonus d'adjacence de l'app.
  function _repondantsSubitAttaque(pjId, contact) {
    if (!pjId) return [];
    const p = chargerPersos()[pjId];
    if (!p) return [];
    const repondants = (_peutBouclierArcanique(p) || _itemEsquiveDisponible(p, contact)) ? [pjId] : [];
    if (typeof Carte !== "undefined" && Carte.tokenIdPourPerso && Carte.listeTokensJoueursCombat && Carte.distanceCasesEntre) {
      const persos = chargerPersos();
      const tokCible = Carte.tokenIdPourPerso(pjId);
      if (tokCible) {
        Carte.listeTokensJoueursCombat().forEach((tok) => {
          if (!tok.ref || !tok.ref.startsWith("pj-")) return;
          const allieId = tok.ref.slice(3);
          if (allieId === pjId || repondants.includes(allieId)) return;
          const dist = Carte.distanceCasesEntre(tokCible, tok.id);
          if (dist === null || dist > 1) return;
          if (_itemInterceptionDisponible(persos[allieId])) repondants.push(allieId);
        });
      }
    }
    return repondants;
  }

  // Réponse d'un PJ à une fenêtre "subitAttaque" (cf. htmlBlocFenetreReaction,
  // qui rend les boutons correspondant à ce qui est réellement disponible) :
  // - "bouclier_arcanique" : dépense PP+réaction via Capacites.lancer, pose
  //   +2 DEF (bonus standard, cf. mecanique.effets du sort) AVANT que le jet
  //   d'attaque de _resoudreAttaqueEtSuite ne compare au total — rien à
  //   départager, contrairement à Contresort.
  // - "esquive" : consomme l'usage de l'ITEM (pas de PP/réaction — même
  //   économie que les procs subitContact existants), force l'attaque à
  //   rater sans même la lancer (cf. _resoudreFenetreReaction/forceRate).
  // - "intercepte" (cf. "muraille", bouclier_tour) : réponse d'un ALLIÉ
  //   adjacent, pas de la cible — l'attaque se résout contre LUI (DEF, dégâts,
  //   effets), cf. redirection dans _resoudreFenetreReaction.
  // - "passe" : clôt juste la participation, sans coût, dans tous les cas.
  // "bouclier_arcanique"/"esquive" restent réservés à la cible elle-même
  // (e.cible.persoId), "intercepte" à tout autre répondant — un allié ne peut
  // pas non plus agir à la place de la cible via ces deux premières réponses.
  function _repondreFenetreAttaque(persoId, action) {
    if (typeof Reactions === "undefined") return;
    if (action === "passe") { Reactions.repondre(persoId, "passe"); return; }
    const e = Reactions.etat();
    if (!e || e.evenement !== "subitAttaque" || e.reponse || !e.repondants.includes(persoId)) return;
    if (action === "intercepte") {
      if (persoId === e.cible.persoId) return;
      const persos = chargerPersos();
      const p = persos[persoId];
      const dispo = p && _itemInterceptionDisponible(p);
      if (!dispo) { toast("Interception indisponible."); return; }
      dispo.usage.appliquer();
      sauverPersos(persos);
      toast(`🛡️ ${dispo.it.nom} : ${p.nom} s'interpose et prend l'attaque à sa place.`);
      Reactions.repondre(persoId, "intercepte", { itemNom: dispo.it.nom, interceptantId: persoId });
      return;
    }
    if (persoId !== e.cible.persoId) return;
    if (action === "esquive") {
      const persos = chargerPersos();
      const p = persos[persoId];
      const dispo = p && _itemEsquiveDisponible(p, e.attaque.contact);
      if (!dispo) { toast("Esquive indisponible."); return; }
      dispo.usage.appliquer();
      sauverPersos(persos);
      toast(`💨 ${dispo.it.nom} : esquive automatique — l'attaque manque sa cible.`);
      Reactions.repondre(persoId, "esquive", { itemNom: dispo.it.nom });
      return;
    }
    const sort = _sortBouclierArcanique();
    if (!sort) { toast("Bouclier arcanique introuvable dans le catalogue de sorts."); return; }
    const res = Capacites.lancer({
      persoId,
      source: { origine: "grimoire", cle: "bouclier_arcanique_mineur", nomCap: "Bouclier arcanique mineur", idSort: "bouclier_arcanique_mineur" },
      mecanique: Object.assign({}, sort.mecanique, { origineGrimoire: true }),
    });
    if (!res.ok) { toast(res.messages.join(" · ")); return; }
    toast("🛡️ Bouclier arcanique mineur : +2 DEF jusqu'à ton prochain tour.");
    Reactions.repondre(persoId, "bouclier_arcanique");
  }

  // Point d'entrée AVANT tout jet d'attaque de monstre contre un PJ (arme,
  // cf. [data-monstre-jet], ou capacité à jetAttaque, cf.
  // _appliquerPlanCapaciteMonstre) — cf. "Prototype du moteur de réaction",
  // extension §A. `descripteur.contact` (bool) distingue une attaque de
  // contact d'une attaque à distance/magique — lu par _itemEsquiveDisponible
  // (porteeRequise). `descripteur.suite` porte tout le nécessaire pour
  // reprendre au bon endroit après résolution (arme ou capacité) — jamais
  // une closure, pour rester correct après un rechargement MJ. Renvoie le
  // résultat du jet si résolu immédiatement (aucun répondant), ou null si
  // une fenêtre s'est ouverte (l'appelant ne doit RIEN faire de plus :
  // _resoudreAttaqueEtSuite reprendra depuis Reactions.onChange/
  // _resoudreFenetreReaction).
  function _declencherAttaqueMonstreVsPJ(descripteur) {
    if (descripteur.pjId && typeof Reactions !== "undefined") {
      const repondants = _repondantsSubitAttaque(descripteur.pjId, descripteur.contact);
      if (repondants.length) {
        Reactions.ouvrir({
          evenement: "subitAttaque",
          source: descripteur.suite && descripteur.suite.monstreId ? { type: "monstre", id: descripteur.suite.monstreId, nom: (descripteur.label || "").split(" — ")[0] } : null,
          cible: { persoId: descripteur.pjId },
          attaque: { label: descripteur.label, bonus: descripteur.bonus, critMin: descripteur.critMin, contact: !!descripteur.contact },
          suite: descripteur.suite,
          repondants,
        });
        toast(`⏳ Fenêtre de réaction ouverte — 15 s avant le jet de « ${descripteur.label} ».`);
        rendreTableCombat();
        rendreTableCombat("battlemap-zone-table-combat");
        return null;
      }
    }
    return _resoudreAttaqueEtSuite(descripteur);
  }

  // Résout réellement le jet d'attaque (avec la DEF éventuellement déjà
  // relevée par Bouclier arcanique, appliquée en amont par
  // _repondreFenetreAttaque via Capacites.lancer) puis reprend la suite
  // propre au point d'entrée d'origine — arme (attaquesMonstresEnAttente,
  // même toast qu'avant ce chantier) ou capacité (_appliquerPlanCapaciteMonstreApresJet).
  // forceRate (cf. réponse "esquive") : l'attaque rate automatiquement, SANS
  // même lancer le jet — même principe qu'annuler un jet de contresort
  // gagné, appliqué ici à l'issue de l'attaque plutôt qu'à ses effets.
  function _resoudreAttaqueEtSuite(descripteur) {
    // typeAttaque (cf. lot "armures B" — "imposante"/"glissante") : distingue
    // contact/distance pour le bonus de DEF conditionnel lu par
    // _defPjAvecAura (via _resoudreAttaqueMonstreVsPJ ci-dessous) — undefined
    // sur un forceRate (aucun jet, la DEF n'intervient jamais).
    const typeAttaque = descripteur.forceRate ? undefined : (descripteur.contact === true ? "contact" : descripteur.contact === false ? "distance" : undefined);
    const resAtt = descripteur.forceRate
      ? { touche: false, critique: false, echecCritique: false, totalAttaque: null, defCible: null, esquiveForcee: true }
      : _resoudreAttaqueMonstreVsPJ(descripteur.label, descripteur.bonus, descripteur.critMin, descripteur.pjId, typeAttaque);
    // "protectrice" (Pierre de chance, cf. lot "jour") : contrairement à
    // "insistante" (relance manuelle, cf. _relancerDernierJet), ce volet est
    // un proc AUTOMATIQUE sans choix du joueur — même principe qu'"absorbant"
    // (lot subitAttaque esquive/réduction). resAtt.critiqueAnnuleePar est lu
    // par les deux chemins de message ci-dessous (arme et capacité de monstre).
    if (resAtt.critique && descripteur.pjId) {
      const persos = chargerPersos();
      const p = persos[descripteur.pjId];
      const dispo = p && _itemAnnuleCritiqueDisponible(p);
      if (dispo) {
        dispo.usage.appliquer();
        sauverPersos(persos);
        resAtt.critique = false;
        resAtt.critiqueAnnuleePar = dispo.it.nom;
      }
    }
    // "drainante" (armure_ombre, cf. lot "armures B") : soigne le porteur
    // quand une attaque de CONTACT le manque — pas de forceRate (l'attaque
    // rate déjà pour une autre raison, esquive, rien à "manquer" au sens du
    // texte) ni d'échec critique (déjà un raté, redondant). Portée à cette
    // seule voie (arme + capacité à jetAttaque) — l'attaque d'opportunité de
    // désengagement (cf. tenterDesengagement) appelle _resoudreAttaqueMonstreVsPJ
    // directement, hors de cette fonction, non couverte ici.
    if (resAtt.touche === false && !resAtt.esquiveForcee && !resAtt.echecCritique && descripteur.contact === true && descripteur.pjId) {
      const persos = chargerPersos();
      const p = persos[descripteur.pjId];
      const dispo = p && _itemSoinRateDisponible(p);
      if (dispo) {
        const effetSoin = dispo.d.effets.find((e) => e.type === "soin");
        // .usage.appliquer absent sans usage.frequence sur le déclencheur
        // (cf. "drainante" — aucune limite par combat dans le texte).
        if (dispo.usage.appliquer) dispo.usage.appliquer();
        const total = lancerFormule(effetSoin.formule, `${dispo.it.nom} — Soin`, false);
        if (typeof total === "number") {
          Personnage.appliquerGainPv(p, total, { ignorerCorruption: true });
          resAtt.soinDrainante = { itemNom: dispo.it.nom, total };
        }
        sauverPersos(persos);
      }
    }
    const suite = descripteur.suite || {};
    if (suite.type === "jetMonstreArme") {
      attaquesMonstresEnAttente[`${suite.monstreId}:${suite.idxAttaque}`] = resAtt;
      if (descripteur.pjId) {
        const nomCible = (chargerPersos()[descripteur.pjId] || {}).nom || "la cible";
        toast(resAtt.esquiveForcee ? `💨 ${nomCible} esquive totalement l'attaque !`
          : resAtt.critiqueAnnuleePar ? `🍀 ${resAtt.critiqueAnnuleePar} : critique transformé en coup normal sur ${nomCible} !${resAtt.defCible !== null ? ` (DEF ${resAtt.defCible})` : ""}`
          : resAtt.echecCritique ? "1 naturel — échec critique automatique."
          : resAtt.critique ? `CRITIQUE sur ${nomCible} !${resAtt.defCible !== null ? ` (DEF ${resAtt.defCible})` : ""}`
          : resAtt.defCible === null ? "DEF de la cible inconnue — à comparer manuellement."
          : (resAtt.touche ? `Touché ${nomCible} ! (DEF ${resAtt.defCible})`
            : `Raté sur ${nomCible} (DEF ${resAtt.defCible})${resAtt.soinDrainante ? ` — 🩹 ${resAtt.soinDrainante.itemNom} : ${nomCible} regagne ${resAtt.soinDrainante.total} PV.` : "."}`));
      }
      rendreTableCombat();
      rendreTableCombat("battlemap-zone-table-combat");
    } else if (suite.type === "capaciteMonstre") {
      const m = (typeof Carte !== "undefined" && Carte.listeMonstresCombat ? Carte.listeMonstresCombat() : []).find((mm) => mm.id === suite.monstreId);
      if (!m) { toast("Le lanceur a quitté le combat — résolution annulée."); return; }
      _appliquerPlanCapaciteMonstreApresJet(m, suite.indice, suite.pjId, resAtt);
    }
    return resAtt;
  }

  // Point d'entrée du clic [data-capacite-monstre] (cf. "Prototype du moteur
  // de réaction : Contresort", Étapes 3-4) : un sort marqué typeSort ouvre
  // d'abord la fenêtre de réaction s'il existe des répondants éligibles —
  // dans ce cas, RIEN n'est résolu ici (ni jet d'attaque, ni effets, ni
  // usage) : _resoudreFenetreReaction reprendra la résolution à la fermeture
  // (cf. l'abonnement Reactions.onChange dans init()). Peek direct via
  // CapacitesMonstres.capacitesDe (pas preparer()) : inutile de déclencher
  // verifierUsage avant de savoir si la résolution est immédiate ou différée
  // — _appliquerPlanCapaciteMonstre le refera à l'application, immédiate ou
  // différée. Extrait du handler onclick pour rester testable directement.
  function _declencherCapaciteMonstre(m, indice, pjId) {
    const capPeek = (CapacitesMonstres.capacitesDe(m) || [])[indice];
    const mecaPeek = capPeek && capPeek.mecanique;
    if (mecaPeek && mecaPeek.typeSort && typeof Reactions !== "undefined") {
      const repondants = _repondantsSortLance(m.id, pjId);
      if (repondants.length) {
        Reactions.ouvrir({
          evenement: "sortLance",
          source: { type: "monstre", id: m.id, nom: m.nom },
          sort: { nom: capPeek.nom, rang: mecaPeek.rang, ecole: mecaPeek.ecole },
          indice, pjId, repondants,
        });
        toast(`⏳ Fenêtre de réaction ouverte (${repondants.length} répondant(s) possible(s)) — 15 s avant résolution de « ${capPeek.nom} ».`);
        rendreTableCombat();
        rendreTableCombat("battlemap-zone-table-combat");
        return;
      }
    }
    _appliquerPlanCapaciteMonstre(m, indice, pjId);
  }

  // jetAttaque (Sceau du silence / Marque du jugement) : jet 1d20+bonus vs
  // DEF AVANT le reste du plan — même pipeline qu'une attaque d'arme
  // (_resoudreAttaqueMonstreVsPJ). Passe désormais par
  // _declencherAttaqueMonstreVsPJ (cf. "Prototype du moteur de réaction",
  // extension Bouclier arcanique §A) : si la cible peut réagir (Bouclier
  // arcanique mineur, PP+réaction disponibles), le jet lui-même est différé
  // derrière une fenêtre de réaction — sinon résolu immédiatement comme
  // avant. jetSauvegardeFixe reste un jet CÔTÉ CIBLE, non automatisable pour
  // un monstre (cf. §3 du schéma) : affiché dans le résumé du bouton, jamais
  // roulé ici.
  // redirigerVersLanceur (cf. "réfléchissant", bouclier_miroir) : le sort
  // renvoyé s'applique au MONSTRE lanceur (m) au lieu du PJ ciblé — traité
  // exactement comme cibleSoi ci-dessous (mêmes branches etat/bonus). Saute
  // TOUJOURS le jet d'attaque (même capacité à jetAttaque, ex. Sceau du
  // silence) : le renvoi est automatique, pas un second jet contre la cible
  // d'origine — comparer à sa DEF n'aurait aucun sens pour un effet qui
  // frappe maintenant le lanceur, pas elle.
  function _appliquerPlanCapaciteMonstre(m, indice, pjId, redirigerVersLanceur) {
    const prep = CapacitesMonstres.preparer(m, indice);
    if (!prep.ok) { toast(prep.raison); return; }
    const mecanique = prep.mecanique;
    if (mecanique && mecanique.jetAttaque !== undefined && !redirigerVersLanceur) {
      // contact: false — les capacités à jetAttaque (Sceau du silence, Marque
      // du jugement...) sont toujours des effets à portée (mètres), jamais
      // "adjacent" : jamais des attaques de contact au sens de parade/reactifs.
      const resAtt = _declencherAttaqueMonstreVsPJ({
        label: `${m.nom} — ${prep.capacite.nom}`, bonus: mecanique.jetAttaque + _bonusEtatsMonstre(m, "attaque"), critMin: 20, pjId, contact: false,
        suite: { type: "capaciteMonstre", monstreId: m.id, indice, pjId },
      });
      if (resAtt === null) return; // fenêtre ouverte : _resoudreAttaqueEtSuite reprendra à la fermeture
      _appliquerPlanCapaciteMonstreApresJet(m, indice, pjId, resAtt, redirigerVersLanceur);
      return;
    }
    _appliquerPlanCapaciteMonstreApresJet(m, indice, pjId, null, redirigerVersLanceur);
  }

  // Suite de _appliquerPlanCapaciteMonstre une fois le jet d'attaque connu
  // (ou d'emblée si la capacité n'en a pas) — ré-prépare le plan depuis zéro
  // (l'usage n'a pas encore été consommé) plutôt que de le recevoir en
  // paramètre : reste correct si le jet a été différé par une fenêtre de
  // réaction entre-temps (cf. Étape 4 de Contresort, même principe).
  function _appliquerPlanCapaciteMonstreApresJet(m, indice, pjId, resAtt, redirigerVersLanceur) {
    const prep = CapacitesMonstres.preparer(m, indice);
    if (!prep.ok) { toast(prep.raison); return; }
    const cap = prep.capacite;
    const mecanique = prep.mecanique;
    const libelle = `${m.nom} — ${cap.nom}`;
    const cibleSoi = !!(mecanique && mecanique.cible === "soi") || !!redirigerVersLanceur;

    // messagesToast accumule tous les messages du clic (jet d'attaque +
    // effets qui suivent) pour un unique toast() final — un second appel
    // à toast() écraserait silencieusement le premier (ex. "Touché !"
    // perdu si la cible s'avère ensuite immunisée à l'état posé), même
    // bug déjà corrigé côté appliquerMalus (cf. suffixeToastFinal).
    const messagesToast = [];
    let toucheOk = true;
    if (resAtt) {
      messagesToast.push(resAtt.esquiveForcee ? "Esquive totale — effet non appliqué."
        : resAtt.critiqueAnnuleePar ? `🍀 ${resAtt.critiqueAnnuleePar} : critique transformé en coup normal.${resAtt.defCible !== null ? ` (DEF ${resAtt.defCible})` : ""}`
        : resAtt.echecCritique ? "1 naturel — échec critique automatique, effet non appliqué."
        : resAtt.critique ? `CRITIQUE !${resAtt.defCible !== null ? ` (DEF ${resAtt.defCible})` : ""}`
        : resAtt.defCible === null ? "DEF de la cible inconnue — effet appliqué, à confirmer manuellement."
        : (resAtt.touche ? `Touché ! (DEF ${resAtt.defCible})` : `Raté (DEF ${resAtt.defCible}) — effet non appliqué.`));
      toucheOk = resAtt.touche !== false;
    }

    if (toucheOk) {
      prep.plan.forEach((action) => {
        if (action.action === "degats" || action.action === "soin") {
          const suffixe = action.surReussite === "demi" ? " — moitié si sauvegarde réussie" : "";
          lancerFormule(action.formule, `${libelle} (${action.action === "degats" ? "dégâts" : "soin"})${suffixe}`, false, { estMonstre: true });
        } else if (action.action === "etat") {
          const entree = { idEtat: action.idEtat, dureeRestante: _resoudreDureeToursMonstre(action.duree || "", null), source: cap.nom, poseLe: Date.now() };
          if (cibleSoi) {
            const imm = CapacitesMonstres.immunite(m, action.idEtat);
            if (imm.bloquee) { messagesToast.push(`${m.nom} est immunisé à « ${ETATS[action.idEtat].nom} ».`); return; }
            if (imm.condition) messagesToast.push(`Immunité conditionnelle : ${imm.condition} — à arbitrer.`);
            Carte.ajouterEtatCombat(m.id, entree);
          } else if (pjId) {
            const persos = chargerPersos();
            const p = persos[pjId];
            if (p) {
              const perso = Personnage.depuisJSON(p);
              if (perso.aImmuniteEtat(action.idEtat)) {
                messagesToast.push(`${p.nom} est immunisé·e à « ${ETATS[action.idEtat].nom} » (Liberté d'action).`);
              } else {
                p.etatsActifs = p.etatsActifs || [];
                p.etatsActifs.push(entree);
                sauverPersos(persos);
                if (ficheActiveId === pjId) afficherFiche(pjId);
                if (ficheSidebarActiveId === pjId) rendreFicheSidebarBattlemap(pjId);
              }
            } else {
              // Cible 🎯 choisie mais introuvable dans les persos chargés
              // (PJ supprimé entre-temps, id périmé...) : signaler plutôt
              // que d'appliquer l'état dans le vide sans un mot.
              messagesToast.push(`${ETATS[action.idEtat].nom} (${cap.nom}) — personnage cible introuvable : à appliquer manuellement.`);
            }
          } else {
            messagesToast.push(`${ETATS[action.idEtat].nom} (${cap.nom}) — aucune cible 🎯 choisie ci-dessus : à appliquer manuellement.`);
          }
        } else if (action.action === "bonus") {
          if (cibleSoi) {
            Carte.ajouterEtatCombat(m.id, {
              idEtat: null, bonus: { cible: action.cible, valeur: action.valeur },
              dureeRestante: _resoudreDureeToursMonstre(action.duree || "", null), source: cap.nom, poseLe: Date.now(),
            });
          } else {
            // "allie" (Cri de ralliement, Cri de commandement des os...) :
            // pas de sélecteur multi-cible pour les autres monstres —
            // laissé à la table, cf. §4 "Partiellement mécanisables" du
            // schéma (même limite que les redirections d'attaque PJ).
            messagesToast.push(`Bonus ${action.cible} ${signe(action.valeur)} (${cap.nom}) — cible(s) alliée(s) à appliquer manuellement (pas de sélecteur multi-cible).`);
          }
        } else if (action.action === "retraitEtat") {
          messagesToast.push(`${cap.nom} : retrait d'état — à appliquer manuellement.`);
        } else if (action.action === "note") {
          messagesToast.push(action.texte);
          ajouterHisto(libelle, 0, false, false, action.texte);
        }
      });
    }

    if (messagesToast.length) toast(messagesToast.join(" — "));
    prep.appliquerUsage();
    rendreTableCombat();
    rendreTableCombat("battlemap-zone-table-combat");
  }

  // Résolution de la fenêtre de réaction (cf. Étape 4) — appelée côté MJ
  // UNIQUEMENT (timer expiré, réponse reçue, ou bouton "Clore" cf.
  // rendreOrdreInitiative), jamais par un joueur. Clôture D'ABORD (empêche
  // une double résolution si Reactions.onChange refire pendant le
  // traitement — clore() déclenche lui-même onChange), puis délègue selon
  // evenement — deux formes indépendantes partagent la même fenêtre/le même
  // timer (cf. "une seule fenêtre à la fois"), pas le même dénouement :
  // sortLance (Contresort) tranche un contest avant d'appliquer ou non ;
  // subitAttaque (Bouclier arcanique) n'a rien à départager, la DEF est déjà
  // ajustée en amont, il ne reste qu'à rouler le jet différé.
  function _resoudreFenetreReaction(e) {
    Reactions.clore();
    if (e.evenement === "subitAttaque") {
      // "esquive" (cf. lot subitAttaque : esquive/réduction) : l'attaque
      // rate d'office, jamais lancée — "bouclier_arcanique"/"passe"/aucune
      // réponse laissent le jet se dérouler normalement (la DEF est déjà
      // ajustée en amont si Bouclier arcanique a été utilisé).
      const forceRate = !!(e.reponse && e.reponse.action === "esquive");
      // "intercepte" (cf. "muraille", bouclier_tour) : l'attaque se résout
      // contre l'ALLIÉ interposé, pas la cible d'origine — DEF, dégâts et
      // effets suivent tous ce nouveau pjId. ciblesMonstres est aussi mis à
      // jour : [data-monstre-degats] relit cette map au clic suivant (le jet
      // et le clic "Dégâts" sont deux actions séparées, cf. son propre
      // commentaire), sans ça les dégâts retomberaient sur la cible d'origine.
      const intercepte = e.reponse && e.reponse.action === "intercepte";
      const pjCible = intercepte ? e.reponse.interceptantId : e.cible.persoId;
      let suiteEffective = e.suite;
      if (intercepte) {
        const nomCibleInit = (chargerPersos()[e.cible.persoId] || {}).nom || "la cible";
        const nomIntercepteur = (chargerPersos()[pjCible] || {}).nom || pjCible;
        toast(`🛡️ ${nomIntercepteur} s'interpose devant ${nomCibleInit} (${e.reponse.itemNom}) !`);
        ajouterHisto(`${nomIntercepteur} intercepte une attaque visant ${nomCibleInit}`, 0, false, false, `${e.reponse.itemNom} — l'attaque se résout contre ${nomIntercepteur} à la place.`);
        if (e.suite && e.suite.monstreId) ciblesMonstres[e.suite.monstreId] = pjCible;
        if (e.suite && e.suite.type === "capaciteMonstre") suiteEffective = Object.assign({}, e.suite, { pjId: pjCible });
      }
      _resoudreAttaqueEtSuite({ label: e.attaque.label, bonus: e.attaque.bonus, critMin: e.attaque.critMin, pjId: pjCible, contact: e.attaque.contact, suite: suiteEffective, forceRate });
      return;
    }
    _resoudreFenetreSortLance(e);
  }

  // sortLance : contresort réussi -> journalise l'annulation, n'applique rien ;
  // "reflechissant" (cf. bouclier_miroir) -> le plan s'applique au LANCEUR
  // (monstre) au lieu du PJ ciblé, cf. redirigerVersLanceur ;
  // contresort raté, "passe", ou personne n'a répondu (timeout) -> déroule la
  // résolution existante, inchangée (_appliquerPlanCapaciteMonstre).
  function _resoudreFenetreSortLance(e) {
    const { source, sort, reponse, indice, pjId } = e;
    if (reponse && reponse.action === "contresort" && reponse.reussite) {
      const nomRepondant = (chargerPersos()[reponse.persoId] || {}).nom || reponse.persoId;
      const detail = `${nomRepondant} contre le sort (jet ${reponse.jetTotal} ≥ diff. ${reponse.difficulte}) — aucun effet appliqué.`;
      ajouterHisto(`${sort.nom} (${source.nom}) — Contresort réussi`, 0, false, false, detail);
      toast(`✨ ${nomRepondant} a contré ${sort.nom} !`);
      rendreTableCombat();
      rendreTableCombat("battlemap-zone-table-combat");
      return;
    }
    const m = (typeof Carte !== "undefined" && Carte.listeMonstresCombat ? Carte.listeMonstresCombat() : []).find((mm) => mm.id === source.id);
    if (!m) {
      toast(`${source.nom} a quitté le combat — résolution de « ${sort.nom} » annulée.`);
      rendreTableCombat();
      rendreTableCombat("battlemap-zone-table-combat");
      return;
    }
    if (reponse && reponse.action === "reflechissant") {
      const nomRepondant = (chargerPersos()[reponse.persoId] || {}).nom || reponse.persoId;
      const detail = `${nomRepondant} renvoie ${sort.nom} (${reponse.itemNom}) à ${source.nom} — les effets s'appliquent à ${source.nom} au lieu de ${nomRepondant}.`;
      ajouterHisto(`${sort.nom} (${source.nom}) — Renvoyé par ${nomRepondant}`, 0, false, false, detail);
      toast(`🪞 ${nomRepondant} renvoie ${sort.nom} à ${source.nom} !`);
      _appliquerPlanCapaciteMonstre(m, indice, pjId, true);
      return;
    }
    _appliquerPlanCapaciteMonstre(m, indice, pjId);
  }

  // Timer de la fenêtre — recalculé depuis ouverteA/delaiMs (Reactions.
  // msRestantes), jamais depuis une durée figée à l'ouverture : reste exact
  // après un rechargement de page côté MJ (cf. piège "doit survivre à un
  // rechargement"). Un seul timer actif à la fois (_timerReactionMJ) : chaque
  // appel annule le précédent, cohérent avec "une seule fenêtre à la fois".
  let _timerReactionMJ = null;
  function _planifierResolutionReaction(e) {
    if (_timerReactionMJ) { clearTimeout(_timerReactionMJ); _timerReactionMJ = null; }
    if (!e) return;
    if (e.reponse || Reactions.estExpiree(e)) { _resoudreFenetreReaction(e); return; }
    _timerReactionMJ = setTimeout(() => {
      _timerReactionMJ = null;
      const actuel = Reactions.etat();
      if (actuel) _resoudreFenetreReaction(actuel);
    }, Reactions.msRestantes(e) + 50);
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

    const persos = chargerPersos();
    const pjsDispo = Object.keys(persos).map((pid) => ({ id: pid, nom: persos[pid].nom }));

    zone.innerHTML = `<div class="grille-table-combat">${monstres.map((m) => {
      const prefixe = `cm-${m.id}-`;
      const pvMax = m.pvMax || 0;
      const pvActuel = m.pvActuel ?? pvMax;
      const morEnCombat = pvActuel <= 0;
      const etoiles = m.dangerosite ? "★".repeat(Math.min(m.dangerosite, 5)) : "";
      const badgeBoss = m.boss ? ' <span class="badge-boss">BOSS</span>' : "";
      const cibleActuelle = ciblesMonstres[m.id] || "";
      // DEF affichée = valeur effective (base + bonus/malus actifs, ex. Barde
      // "Note discordante"/"Chant brisant", cf. _bonusEtatsMonstre) — la base
      // reste visible entre parenthèses dès qu'un ajustement est actif, pour
      // que le MJ voie d'un coup d'œil la DEF réelle ET d'où elle vient.
      const bonusDefActif = _bonusEtatsMonstre(m, "DEF");
      const defHtml = (m.def !== null && m.def !== undefined)
        ? `<span>DEF ${m.def + bonusDefActif}${bonusDefActif ? ` <span class="def-ajustee">(base ${m.def})</span>` : ""}</span>`
        : "";
      // Cible PJ de l'attaque (cf. _resoudreAttaqueMonstreVsPJ) — pas de
      // gating possible sans elle (comportement d'avant ce chantier, jamais
      // bloquant), donc omise s'il n'y a aucun PJ enregistré.
      const cibleHtml = pjsDispo.length ? `<label class="cm-cible" style="font-size:0.78rem;display:block;margin:4px 0;">🎯 Cible
        <select data-cible-monstre="${m.id}" style="width:100%;margin-top:2px;">
          <option value="">— Aucune —</option>
          ${pjsDispo.map((p) => `<option value="${p.id}" ${p.id === cibleActuelle ? "selected" : ""}>${echapper(p.nom)}</option>`).join("")}
        </select>
      </label>` : "";
      return `
        <div class="combat-monstre${morEnCombat ? " hors-combat" : ""}" data-id="${m.id}">
          <div class="cm-entete">
            <div class="cm-nom">${echapper(m.nom)}${badgeBoss}</div>
            <button class="btn petit danger" data-suppr-monstre="${m.id}">✕</button>
          </div>
          <div class="cm-stats">
            ${defHtml}
            <span title="SAG — résistance aux sorts mentaux (Domination, Sommeil, Fascination…)${m.defMentale != null ? " · fixée" : " · dérivée : 10 + dangerosité"}">SAG ${m.defMentale != null ? m.defMentale : (10 + (m.dangerosite || 0))}</span>
            <span title="${echapper((typeof ARMURES_MONSTRES_INDEX !== "undefined" && m.armureId && ARMURES_MONSTRES_INDEX[m.armureId] && ARMURES_MONSTRES_INDEX[m.armureId].note) || "")}">Armure ${m.armure || 0}</span>
            ${etoiles ? `<span>${etoiles}</span>` : ""}
          </div>
          ${cibleHtml}
          ${attaquesMonstreHtml(m)}
          ${capacitesMonstreHtml(m)}
          <div class="pv-control">
            <button data-pv-moins="${m.id}">−</button>
            <input type="number" value="${pvActuel}" data-pv-input="${m.id}" />
            <span style="font-weight:700;">/ ${pvMax}</span>
            <button data-pv-plus="${m.id}">+</button>
          </div>
          <div class="barre-pv"><div class="rempli" style="width:${pvMax ? Math.max(0, Math.min(100, (pvActuel / pvMax) * 100)) : 0}%;background:${_couleurPv(pvMax ? (pvActuel / pvMax) * 100 : 0)};"></div></div>
          ${blocDegatsSubisHtml(prefixe)}
          ${htmlEtatsActifs(m)}
          ${morEnCombat ? '<div class="badge-mort">💀 Hors combat</div>' : ""}
        </div>`;
    }).join("")}</div>`;

    monstres.forEach((m) => {
      wireDegatsSubisGenerique(`cm-${m.id}-`, (val) => subirDegatsMonstre(m.id, val, targetId));
    });
    zone.querySelectorAll("[data-cible-monstre]").forEach((sel) => {
      sel.onchange = () => {
        ciblesMonstres[sel.dataset.cibleMonstre] = sel.value || null;
        // Changer de cible invalide le gating dégâts en cours pour ce monstre
        // (une nouvelle attaque contre une autre cible doit repartir à zéro).
        Object.keys(attaquesMonstresEnAttente).forEach((cle) => {
          if (cle.startsWith(`${sel.dataset.cibleMonstre}:`)) delete attaquesMonstresEnAttente[cle];
        });
        rendreTableCombat(targetId);
      };
    });
    // Attaques rapides du monstre (jet à gauche, dégâts via 🎲 à droite) —
    // reste sur l'onglet courant (Battlemap ou Table de combat), comme les
    // attaques rapides du joueur. Si une cible PJ est choisie (cf.
    // ciblesMonstres), le jet est comparé à sa DEF (_resoudreAttaqueMonstreVsPJ) ;
    // sans cible, comportement inchangé (jet brut, dégâts toujours dispo).
    // m.attaques (invocation, cf. attaquesMonstreHtml) prime sur BESTIAIRE_INDEX.
    zone.querySelectorAll("[data-monstre-jet]").forEach((btn) => {
      btn.onclick = () => {
        const m = monstres.find((mm) => mm.id === btn.dataset.monstreJet);
        const def = m && typeof BESTIAIRE_INDEX !== "undefined" ? BESTIAIRE_INDEX[m.monstreId] : null;
        const attaques = m && (m.attaques || (def && def.attaques));
        const idx = parseInt(btn.dataset.idxAttaque, 10);
        const a = attaques && attaques[idx];
        const r = _resoudreAttaqueMonstre(a);
        if (!r) return;
        const pjId = ciblesMonstres[m.id] || null;
        // _declencherAttaqueMonstreVsPJ (cf. "Prototype du moteur de
        // réaction", extension §A + lot esquive/réduction) : ouvre une
        // fenêtre (Bouclier arcanique et/ou esquive d'équipement) si la
        // cible peut réagir, sinon résout immédiatement — dans les deux cas,
        // attaquesMonstresEnAttente/toast/rendu sont posés par
        // _resoudreAttaqueEtSuite (branche "jetMonstreArme"), jamais ici.
        // contact (cf. parade/reactifs, porteeRequise:"contact") : même
        // logique que r.portee.startsWith("contact") déjà utilisée pour
        // subitContact — "contact +1 case (3m)" (armes d'hast) compte aussi.
        _declencherAttaqueMonstreVsPJ({
          label: `${m.nom} — ${r.nom}`, bonus: r.bonusAttaque + _bonusEtatsMonstre(m, "attaque"), critMin: r.critMin, pjId,
          contact: !!(r.portee && r.portee.startsWith("contact")),
          suite: { type: "jetMonstreArme", monstreId: m.id, idxAttaque: idx },
        });
      };
    });
    zone.querySelectorAll("[data-monstre-degats]").forEach((btn) => {
      btn.onclick = () => {
        const m = monstres.find((mm) => mm.id === btn.dataset.monstreDegats);
        const def = m && typeof BESTIAIRE_INDEX !== "undefined" ? BESTIAIRE_INDEX[m.monstreId] : null;
        const attaques = m && (m.attaques || (def && def.attaques));
        const a = attaques && attaques[parseInt(btn.dataset.idxAttaque, 10)];
        const r = _resoudreAttaqueMonstre(a);
        if (!r) return;
        const critique = btn.dataset.monstreCritique === "1";
        const total = lancerFormule(r.degats, `${m.nom} — ${r.nom} (dégâts)`, critique, { estMonstre: true });
        // Applique automatiquement les dégâts à la cible PJ choisie (celle du
        // moment, pas forcément celle du jet d'attaque si changée entre-temps)
        // — c'est précisément l'intérêt d'avoir désigné une cible : éviter à
        // la table de reporter le total à la main sur la fiche du joueur.
        const pjId = ciblesMonstres[m.id] || null;
        if (pjId && typeof total === "number") {
          const typeDegatsNormalise = r.typedegats && r.typedegats.startsWith("physique") ? "physique" : "magique";
          // Réduction automatique (cf. "absorbant", lot subitAttaque : esquive/
          // réduction) : AVANT subirDegats, contrairement à
          // _gererDeclencheursSubitContact (après) — une fois les PV décomptés,
          // il serait trop tard pour réduire quoi que ce soit.
          const totalAjuste = _reduireDegatsSubisSiDisponible(pjId, total, typeDegatsNormalise);
          subirDegats(pjId, totalAjuste, typeDegatsNormalise, undefined, undefined, undefined, r.elementaire);
          // "quand le porteur est touché" (cf. Affixes phase 2 §C, épineuse/
          // renvoyeur) : seulement sur une attaque de CONTACT — r.portee peut
          // valoir "contact" ou "contact +1 case (3m)" (armes d'hast), les
          // deux comptent comme une attaque de contact.
          if (r.portee && r.portee.startsWith("contact")) _gererDeclencheursSubitContact(pjId, m.id, typeDegatsNormalise);
        }
      };
    });
    // Capacités actives (cf. js/capacites_monstres.js) : un clic prépare le
    // plan (CapacitesMonstres.preparer, qui gate déjà l'usage) puis l'exécute
    // intégralement — un seul bouton, pas de second clic "Lancer les dégâts"
    // comme pour une attaque, cf. schema_cible_capacites_monstres.md §6.
    zone.querySelectorAll("[data-capacite-monstre]").forEach((btn) => {
      btn.onclick = () => {
        const m = monstres.find((mm) => mm.id === btn.dataset.capaciteMonstre);
        if (!m) return;
        const indice = parseInt(btn.dataset.idxCapacite, 10);
        _declencherCapaciteMonstre(m, indice, ciblesMonstres[m.id] || null);
      };
    });
    zone.querySelectorAll("[data-recharge-capacite]").forEach((btn) => {
      btn.onclick = () => {
        const m = monstres.find((mm) => mm.id === btn.dataset.rechargeCapacite);
        if (!m || typeof Capacites === "undefined" || !Capacites.reinitialiserUsage) return;
        const indice = parseInt(btn.dataset.idxCapacite, 10);
        Capacites.reinitialiserUsage(m, CapacitesMonstres.cleCapacite(m.monstreId || m.id, indice));
        rendreTableCombat(targetId);
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
    // Retrait d'un état/malus (posé via "Ajouter malus" ou une future capacité
    // de monstre) — htmlEtatsActifs(m) génère un data-etat-idx par entrée,
    // scopé ici à la carte .combat-monstre du bon id pour retrouver le token.
    zone.querySelectorAll(".combat-monstre").forEach((carte) => {
      const id = carte.dataset.id;
      carte.querySelectorAll("[data-etat-idx]").forEach((btn) => {
        btn.onclick = () => {
          Carte.retirerEtatCombat(id, parseInt(btn.dataset.etatIdx, 10));
          rendreTableCombat(targetId);
        };
      });
    });
  }

  /* ============================================================
     BESTIAIRE
     ============================================================ */

  let _bestFamille = "";
  let _bestDang = "";
  let _bestRace = "";

  // ── Overrides de stats de monstres (MJ) : partagés via SyncStore
  // ("bestiaire:overrides" = { monstreId: { pv?, def?, defMentale?, init?,
  // atk?, dangerosite? } }). Le bestiaire (data/bestiaire.json) est immuable ;
  // on superpose juste les champs modifiés. _monstreEffectif fusionne base +
  // override, utilisé à l'affichage ET à l'ajout en combat.
  let _monstreEnEdition = null; // id du monstre dont la carte est en mode édition
  function _overridesMonstres() { return (typeof SyncStore !== "undefined" && SyncStore.get("bestiaire:overrides")) || {}; }
  function _monstreEffectif(m) {
    if (!m) return m;
    const ov = _overridesMonstres()[m.id];
    return ov ? Object.assign({}, m, ov) : m;
  }
  function _estOverride(id) { return !!_overridesMonstres()[id]; }
  function _sauverOverrideMonstre(id, champs) {
    if (typeof SyncStore === "undefined") return;
    const all = _overridesMonstres();
    all[id] = Object.assign({}, all[id], champs);
    SyncStore.set("bestiaire:overrides", all);
  }
  function _resetOverrideMonstre(id) {
    if (typeof SyncStore === "undefined") return;
    const all = _overridesMonstres();
    delete all[id];
    SyncStore.set("bestiaire:overrides", all);
  }

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

    const selRace = document.getElementById("filtre-race");
    if (selRace) {
      selRace.value = _bestRace;
      selRace.onchange = (e) => { _bestRace = e.target.value; _afficherMonstres(); };
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

    const monstres = BESTIAIRE.map((m) => _monstreEffectif(m)).filter(m => {
      if (_bestFamille && m.famille !== _bestFamille) return false;
      if (_bestDang && String(m.dangerosite) !== _bestDang) return false;
      if (_bestRace && !(Array.isArray(m.race) && m.race.includes(_bestRace))) return false;
      return true;
    });

    if (compteur) compteur.textContent = `${monstres.length} monstre${monstres.length !== 1 ? "s" : ""}`;

    if (!monstres.length) {
      grille.innerHTML = '<p class="vide" style="padding:20px;">Aucun monstre ne correspond aux filtres.</p>';
      return;
    }

    grille.innerHTML = monstres.map(m => _carteMonstreHTML(m)).join("");
    _wireEditionMonstres();
  }

  // Câble les boutons Modifier / Enregistrer / Annuler / Réinitialiser des
  // cartes du bestiaire (MJ). L'édition ne concerne que les stats chiffrées.
  function _wireEditionMonstres() {
    const grille = document.getElementById("bestiaire-grille");
    if (!grille) return;
    grille.querySelectorAll(".btn-monstre-editer").forEach((b) => {
      b.onclick = () => { _monstreEnEdition = b.dataset.id; _afficherMonstres(); };
    });
    grille.querySelectorAll(".btn-monstre-annuler").forEach((b) => {
      b.onclick = () => { _monstreEnEdition = null; _afficherMonstres(); };
    });
    grille.querySelectorAll(".btn-monstre-reset").forEach((b) => {
      b.onclick = () => { _resetOverrideMonstre(b.dataset.id); _monstreEnEdition = null; _afficherMonstres(); };
    });
    grille.querySelectorAll(".btn-monstre-save").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        const num = (champ) => { const e = document.getElementById(`edit-${champ}-${id}`); const v = e ? parseInt(e.value, 10) : NaN; return Number.isFinite(v) ? v : undefined; };
        const champs = {};
        ["pv", "def", "defMentale", "init", "atk", "dangerosite"].forEach((c) => { const v = num(c); if (v !== undefined) champs[c] = v; });
        _sauverOverrideMonstre(id, champs);
        _monstreEnEdition = null;
        _afficherMonstres();
      };
    });
  }

  function _etoiles(n) {
    return "★".repeat(Math.min(n, 5)) + "☆".repeat(Math.max(0, 5 - n));
  }

  const TIER_LABELS = { basique: "Basique", veteran: "Vétéran", elite: "Élite", champion: "Champion" };

  function _carteMonstreHTML(m) {
    const iconePath = typeof cheminIconeMonstre === "function" ? cheminIconeMonstre(m) : null;
    const emoji = iconePath
      ? `<img class="monstre-icone" src="${iconePath}" alt="" data-emoji-repli="${echapper(m.emoji || "")}" onerror="monstreIconeFallback(this)" />`
      : (m.emoji ? `<span class="monstre-emoji">${m.emoji}</span>` : "");
    const boss = m.boss ? '<span class="badge-boss">BOSS</span>' : "";
    const tier = m.tier ? `<span class="badge-tier badge-tier-${echapper(m.tier)}">${echapper(TIER_LABELS[m.tier] || m.tier)}</span>` : "";
    const taille = m.taille ? `<span class="badge-taille">${echapper(m.taille)}</span>` : "";
    const dang = `<span class="badge-dang dang-${m.dangerosite}" title="Dangérosité">${_etoiles(m.dangerosite || 0)}</span>`;
    const race = Array.isArray(m.race) && m.race.length
      ? m.race.map(r => `<span class="badge-race">${echapper(r)}</span>`).join("")
      : "";

    const volonte = m.defMentale != null ? m.defMentale : (10 + (m.dangerosite || 0));
    const enEdition = m.id === _monstreEnEdition;
    const modifie = _estOverride(m.id);
    const inp = (champ, val, label) => `<label class="edit-stat"><span>${label || champ}</span><input type="number" id="edit-${champ}-${echapper(m.id)}" value="${val != null ? val : 0}" /></label>`;
    const statsHtml = enEdition
      ? `<div class="monstre-edit">
          ${inp("pv", m.pv, "PV")}${inp("def", m.def, "DEF")}${inp("defMentale", volonte, "SAG")}${inp("init", m.init, "INIT")}${inp("atk", m.atk, "ATK")}${inp("dangerosite", m.dangerosite, "Dang.")}
          <div class="barre-actions" style="margin-top:8px;flex-basis:100%;">
            <button class="btn petit or btn-monstre-save" data-id="${echapper(m.id)}">💾 Enregistrer</button>
            <button class="btn petit secondaire btn-monstre-annuler" data-id="${echapper(m.id)}">Annuler</button>
            ${modifie ? `<button class="btn petit danger btn-monstre-reset" data-id="${echapper(m.id)}">↺ Réinitialiser</button>` : ""}
          </div>
        </div>`
      : `<div class="monstre-stats">
      <span title="Points de Vie"><strong>PV</strong> ${m.pv ?? "—"}</span>
      <span title="Défense"><strong>DEF</strong> ${m.def ?? "—"}</span>
      <span title="SAG — résistance aux sorts mentaux (${m.defMentale != null ? "fixée" : "dérivée : 10 + dangerosité"})"><strong>SAG</strong> ${volonte}</span>
      <span title="Initiative"><strong>INIT</strong> ${m.init >= 0 ? "+" : ""}${m.init ?? "—"}</span>
      <span title="Attaque"><strong>ATK</strong> ${m.atk >= 0 ? "+" : ""}${m.atk ?? "—"}</span>
      ${(() => {
        const arm = (typeof ARMURES_MONSTRES_INDEX !== "undefined" && m.armureId) ? ARMURES_MONSTRES_INDEX[m.armureId] : null;
        if (!arm) return "";
        // naturelle (fourrure, écorce, corps de granit) : fait partie de la
        // créature, ne se retire pas (contrairement à une cotte de mailles) —
        // marqué visuellement pour que le MJ ne propose pas de la dépouiller.
        return `<span title="${echapper(`${arm.nom}${arm.naturelle ? " (naturelle)" : ""}${arm.note ? " — " + arm.note : ""}`)}"><strong>Armure</strong> ${arm.reduction}${arm.naturelle ? " 🐾" : ""}</span>`;
      })()}
    </div>`;

    const atqHtml = m.attaques && m.attaques.length
      ? `<div class="monstre-section"><strong>Attaques</strong><ul>${m.attaques.map((a) => {
          const r = _resoudreAttaqueMonstre(a);
          if (!r) return `<li><em>${echapper(a.nom)}</em> — arme introuvable (armeId « ${echapper(a.armeId || "")} »)</li>`;
          return `<li><em>${echapper(r.nom)}</em> — ${echapper(r.jetTexte || "")} · Dégâts ${echapper(r.degatsTexte || r.degats || "")}${r.portee ? ` (${echapper(r.portee)})` : ""}${r.effetSpecial ? ` · ${echapper(r.effetSpecial)}` : ""}</li>`;
        }).join("")}</ul></div>`
      : "";

    // Capacités actives : entre les attaques et les passifs, lecture seule
    // hors combat (aucun bouton — cf. capacitesMonstreHtml pour la table de
    // combat, seul endroit où elles sont réellement déclenchables).
    const activesHtml = m.capacitesActives && m.capacitesActives.length
      ? `<div class="monstre-section"><strong>Capacités actives</strong><ul>${m.capacitesActives.map((c) => {
          const resume = typeof CapacitesMonstres !== "undefined" ? CapacitesMonstres.resume(c.mecanique) : "";
          return `<li><em>✨ ${echapper(c.nom)}</em>${resume ? ` (${echapper(resume)})` : ""}${c.description ? ` — ${echapper(c.description)}` : ""}</li>`;
        }).join("")}</ul></div>`
      : "";

    const capHtml = m.capacitesSpeciales && m.capacitesSpeciales.length
      ? `<div class="monstre-section"><strong>Capacités spéciales</strong><ul>${m.capacitesSpeciales.map(c =>
          `<li><em>${echapper(c.nom)}</em>${c.description ? ` — ${echapper(c.description)}` : ""}</li>`
        ).join("")}</ul></div>`
      : "";

    const loreHtml = m.lore ? `<div class="monstre-section monstre-lore">${echapper(m.lore)}</div>` : "";

    return `<div class="carte carte-monstre">
      <div class="monstre-header">
        <div class="monstre-nom">${emoji} ${echapper(m.nom)} ${boss}${tier}${modifie ? ' <span class="badge-modifie" title="Stats modifiées par le MJ">✎ modifié</span>' : ""}</div>
        <div class="monstre-meta">${dang} ${taille}${race}</div>
      </div>
      ${m.faction ? `<div class="monstre-sous">${echapper(m.faction)}</div>` : ""}
      ${statsHtml}
      ${atqHtml}
      ${activesHtml}
      ${capHtml}
      ${loreHtml}
      ${enEdition ? "" : `<div class="monstre-actions"><button class="btn petit secondaire btn-monstre-editer" data-id="${echapper(m.id)}">✏️ Modifier les stats</button></div>`}
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
  // — obtenirRole/estProprietaire sont en plus exposés pour js/marche.js
  // (filtrer le sélecteur de personnage par propriétaire en vue joueur).
  // — ajusterPv est en plus exposé pour js/repos.js (applique le résultat
  // du jet de régénération, avec le même plafond PV max / interaction
  // Dette du Soigneur que le reste de l'app — cf. Personnage.appliquerGainPv).
  // — proposerAttaqueOpportunite est en plus exposé pour js/carte.js
  // (déclenchement géométrique semi-auto depuis demarrerDragDD/finDragDD).
  return { allerVers, allerVersCarteMode, chargerPersos, sauverPersos, lancerDe, ajouterHisto, obtenirRole: () => role, estProprietaire, ajusterPv, proposerAttaqueOpportunite };
})();
