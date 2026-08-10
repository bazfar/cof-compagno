/* ============================================================
   Personnage — instance de PJ (hérite d'Entité).
   Centralise les RÈGLES COF aujourd'hui éparpillées dans app.js :
   modificateurs, PV, DEF, bonus d'attaque, points de voie.
   Enveloppe la même structure de données que celle stockée
   en localStorage → adoption progressive possible.

   Dépend des globales de donnees.js :
   CLASSES, CARAC_MAGIE, ARCHETYPE_CLASSE, DIVISEUR_ATTAQUE.
   ============================================================ */

// 9 emplacements d'équipement fixes. Seul ce qui est placé ici compte pour
// les stats de combat (DEF, réduction de dégâts, dégâts d'arme) — le reste
// vit dans inventaireListe, un simple sac sans effet mécanique.
const SLOTS_EQUIPEMENT = ["tete", "torse", "jambe", "avant_bras", "main_droite", "main_gauche", "collier", "bague", "mains"];

// Grimoire v2 (04/08/2026, cf. prompt_grimoire_v2_emplacements_typ_s.md) —
// emplacements de sorts hors Voies typés par plafond de rang logeable
// ("12" = rang 1 ou 2, "13" = rang 1 à 3, etc.), qui scalent par palier de
// RARETÉ de l'objet porteur (Manuel d'incantation / Amulette de
// Bénédiction, cf. grimoireClasses) — pas par niveau du perso. Constantes
// module-level (pas des static class fields) pour rester cohérent avec le
// reste du fichier, qui n'utilise que des static METHODS sur Personnage.
const GRIMOIRE_TIERS_PAR_RARETE = [
  { "12": 4, "13": 1, "14": 1, "15": 0 }, // Commun      (6 au total)
  { "12": 4, "13": 3, "14": 2, "15": 0 }, // Peu commun  (9 au total)
  { "12": 4, "13": 4, "14": 3, "15": 1 }, // Rare        (12 au total)
  { "12": 4, "13": 5, "14": 4, "15": 2 }, // Légendaire  (15 au total)
];
// Ordre de préférence de remplissage : le plus petit plafond compatible
// d'abord, pour préserver les emplacements élevés aux sorts qui en ont
// vraiment besoin.
const GRIMOIRE_ORDRE_TIERS = ["12", "13", "14", "15"];
const GRIMOIRE_PLAFOND_TIER = { "12": 2, "13": 3, "14": 4, "15": 5 };

function equipementVide() {
  const e = {};
  SLOTS_EQUIPEMENT.forEach((s) => (e[s] = null));
  return e;
}

class Personnage extends Entite {
  constructor(data = {}) {
    const d = Object.assign(
      {
        id: null,
        nom: "",
        niveau: 1,
        classe: null,
        race: null,
        raceVariante: null,
        caracs: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
        caracsLibres: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 },
        bonusCompetences: {},
        capacites: [],
        capacitesRace: [],
        capacitesRaceChoix: {},
        voiesHorsProfil: [],
        dons: [],
        donsChoix: {},
        portrait: null,
        pvMax: 1,
        pvActuel: null,
        pvHistorique: [],
        pvNiveauActuel: 1,
        def: 10,
        equipement: equipementVide(),
        inventaireListe: [],
        notes: "",
        etatsActifs: [],
        usagesCapacites: {},
        corruptionCombat: 0,
        corruptionMajeure: 0,
        corruptionSeuilFranchi: false,
        // Nécromancien "Voie des âmes" : réceptacle d'âmes stockées (0 à 3,
        // cf. Capacites.lancer — mecanique.ameGain/ameCout, "Capture d'âme"/
        // "Libération vengeresse"). Lu par bonusSavoirVole() ci-dessous.
        amesStockees: 0,
        // État Mourant(e) (0 PV, cf. REGLES_GENERALES "Mort et stabilisation") :
        // compteurs du jet de mort en cours, remis à zéro à chaque franchissement
        // du seuil de 0 PV (cf. js/app.js _majEtatMourant). etatMort=true une
        // fois 3 échecs atteints — plus aucun jet de mort, tour définitivement
        // sauté (cf. Combat._estKO).
        mortSucces: 0,
        mortEchecs: 0,
        etatMort: false,
        // Items loot mécanisés (data/loot.json: collier_dette_soigneur,
        // contrat_demoniaque, anneau_chance_naturel) — cf. Personnage.appliquerGainPv
        // et le hook dans js/app.js lancerTest(). detteSoigneurActive : soin du
        // porteur forcé au max au prochain sort de soin qu'il lance, PUIS son
        // prochain gain de PV (n'importe quelle source) tombe à 0. contratDemoniaque*
        // : pas de notion de "repos long" dans l'app — réinitialisé manuellement
        // par le joueur (cf. bouton dédié sur la fiche).
        detteSoigneurActive: false,
        contratDemoniaquePenalite: null, // { carac, valeur } ou null
        contratDemoniaqueUtilise: false,
        anneauChanceCumuls: 0,
      },
      data
    );

    super({ nom: d.nom, pvMax: d.pvMax, pvActuel: d.pvActuel, def: d.def, etatsActifs: d.etatsActifs });

    this.id = d.id;
    this.niveau = d.niveau;
    this.classe = d.classe;
    this.race = d.race;
    this.raceVariante = d.raceVariante;
    this.caracs = d.caracs;
    this.caracsLibres = d.caracsLibres;
    this.bonusCompetences = d.bonusCompetences;
    this.capacites = d.capacites;
    this.capacitesRace = d.capacitesRace;
    this.capacitesRaceChoix = d.capacitesRaceChoix;
    this.voiesHorsProfil = d.voiesHorsProfil;
    // Dons (niveaux 4/8/12, cf. data/dons.js) : tableau d'ids. La plupart restent
    // des bonus descriptifs appliqués manuellement par le joueur, mais certains
    // sont mécanisés ci-dessous (Frappe puissante, Tir de précision, Ambidextre,
    // Maître d'armes doubles, Robuste, Alerte, Amélioration de caractéristique).
    this.dons = d.dons;
    // Choix fixés à l'acquisition d'un don qui en demande un (ex. Amélioration
    // de caractéristique : { amelioration_carac: ["FOR","DEX"] }) — même esprit
    // que capacites[].choix, mais indexé par id de don (un don n'est pris qu'une fois).
    this.donsChoix = d.donsChoix;
    this.portrait = d.portrait;
    this.pvHistorique = d.pvHistorique;
    this.pvNiveauActuel = d.pvNiveauActuel;
    this.equipement = d.equipement || equipementVide();
    // Migration : ajoute les clés des emplacements ajoutés à SLOTS_EQUIPEMENT
    // après la création de cette fiche (ex. "mains", introduit par le commit
    // "Gants du Poing"). equiper()/deséquiper() exigent `slot in this.equipement` ;
    // sans cette clé (absente, pas juste `null`, sur une vieille sauvegarde),
    // équiper un gant dans "mains" échouait silencieusement avec le message
    // "Cet objet ne peut pas être équipé dans cet emplacement." même quand
    // l'objet était parfaitement compatible.
    SLOTS_EQUIPEMENT.forEach((s) => {
      if (!(s in this.equipement)) this.equipement[s] = null;
    });
    // Migration slot "botte" -> "jambe" (fusion des deux emplacements,
    // cf. commit "fusion jambe/botte") : une fiche sauvegardée avant la
    // fusion peut encore porter un objet dans equipement.botte, un slot qui
    // n'existe plus dans SLOTS_EQUIPEMENT. On le rapatrie dans "jambe" s'il
    // est libre, sinon on le renvoie dans l'inventaire plutôt que de le
    // perdre silencieusement.
    if (this.equipement && "botte" in this.equipement) {
      const orphelin = this.equipement.botte;
      if (orphelin) {
        if (!this.equipement.jambe) {
          this.equipement.jambe = orphelin;
        } else {
          (d.inventaireListe || (d.inventaireListe = [])).push(orphelin);
        }
      }
      delete this.equipement.botte;
    }
    this.inventaireListe = d.inventaireListe;
    this.notes = d.notes;
    // Champs "administratifs" gérés directement sur l'objet perso brut
    // ailleurs dans l'app (jamais via Personnage), mais qui DOIVENT survivre
    // un aller-retour Personnage.depuisJSON(p).versJSON() — sans ça,
    // n'importe quelle action passant par ce chemin (équiper/déséquiper un
    // objet, ajouter/jeter/donner un item, cf. js/app.js) écrasait
    // silencieusement le propriétaire du personnage, son genre et ses livres
    // partagés à la sauvegarde suivante. Bug réellement trouvé en auditant
    // l'inventaire/équipement (2026-07-18), jamais déclenché en pratique
    // jusqu'ici car masqué par le bug jumeau ci-dessous (undefined —
    // Firestore refusait déjà la sauvegarde avant d'écraser quoi que ce soit).
    this.genre = d.genre;
    this.proprietaire = d.proprietaire;
    this.proprietaireNom = d.proprietaireNom;
    this.livres = d.livres;
    // Bio "Party" (onglet 🎭 Party, cf. app.js) et illustration pleine page
    // (distincte du petit portrait) : même risque de perte au aller-retour.
    this.age = d.age;
    this.villeOrigine = d.villeOrigine;
    this.nationOrigine = d.nationOrigine;
    this.hobbies = d.hobbies;
    this.bio = d.bio;
    this.illustration = d.illustration;
    // Compteur d'illusions actives (Enchanteur, cf. htmlBlocIllusions) et
    // bourse (or/argent/bronze, cf. htmlBlocBourse) : idem.
    this.illusionsActives = d.illusionsActives;
    this.piecesOr = d.piecesOr;
    this.piecesArgent = d.piecesArgent;
    this.piecesBronze = d.piecesBronze;
    // this.etatsActifs déjà posé par Entite (super()) ; usagesCapacites
    // compte les usages d'une capacité à fréquence limitée (cf. js/etats.js,
    // rang.mecanique.usage) : { [idCapacite]: nombreUtilise }.
    this.usagesCapacites = d.usagesCapacites;
    // Voie du chaos (homebrew) : jauge de corruption du combat en cours
    // (remise à 0 par Combat.terminerCombat), incrémentée automatiquement par
    // Capacites.lancer() quand rang.mecanique.corruption est défini — cf.
    // js/capacites.js. corruptionMajeure (Corruption d'Âme) ne se réinitialise
    // jamais ; corruptionSeuilFranchi évite de la incrémenter plus d'une fois
    // par combat quand la jauge reste au-delà du seuil sur plusieurs tours.
    this.corruptionCombat = d.corruptionCombat;
    this.corruptionMajeure = d.corruptionMajeure;
    this.corruptionSeuilFranchi = d.corruptionSeuilFranchi;
    this.amesStockees = d.amesStockees;
    // État Mourant(e) — cf. estMourant()/estMort() ci-dessous.
    this.mortSucces = d.mortSucces;
    this.mortEchecs = d.mortEchecs;
    this.etatMort = d.etatMort;
    this.detteSoigneurActive = d.detteSoigneurActive;
    this.contratDemoniaquePenalite = d.contratDemoniaquePenalite;
    this.contratDemoniaqueUtilise = d.contratDemoniaqueUtilise;
    this.anneauChanceCumuls = d.anneauChanceCumuls;
    // PV temporaires (Guerrier Cri du rassemblement, Druide Rempart vivant/
    // Forme du chaos sauvage) : jamais cumulatifs (une nouvelle source
    // n'écrase l'ancien total que si elle est plus élevée), expirent avec la
    // durée de la capacité qui les a posés plutôt que d'être décomptés
    // séparément — cf. Capacites.appliquerPvTemporaires/decompterEtatsDebutTour.
    // Absorbés en priorité par subirDegats côté app.js, avant pvActuel.
    this.pvTemporaires = d.pvTemporaires;
    this.pvTemporairesExpiration = d.pvTemporairesExpiration;
    // Mutations de la Corruption d'Âme (Voie du chaos, homebrew, cf.
    // data/mutations.js) : [{ id, palier, d6, nom, effet, obtenueLe }],
    // permanentes une fois tirées (pas de retrait automatique si la CA
    // redescend — cf. genererMutation/retirerMutation côté app.js pour la
    // génération 1d6 et le retrait au choix, onglet "🧬 Mutations").
    this.mutations = d.mutations;
    // Points de Pouvoir (Magicien et autres classes à CARAC_MAGIE, cf.
    // calculerPPMax ci-dessous) — calculé après TOUS les champs dont
    // calculerPPMax dépend transitivement via mod() (caracs, dons,
    // équipement, mutations, etatsActifs...), d'où sa position en toute fin
    // de constructeur plutôt qu'à côté de pvActuel (posé par super() tout en
    // haut, avant que ces champs n'existent encore sur `this`).
    this.ppActuel = d.ppActuel !== undefined ? d.ppActuel : this.calculerPPMax();
    // Écrêtage au chargement (cf. "Réserve de PP réduite pour les
    // hybrides") : une fiche existante peut avoir ppActuel au-dessus du
    // nouveau maximum d'un hybride (mod ×1 au lieu de ×2). On écrête
    // seulement — jamais de repos forcé ni de remise à plein, un
    // personnage en cours de journée ne doit pas être soigné par cette
    // passe.
    const _ppMaxApresEcretage = this.calculerPPMax();
    if (_ppMaxApresEcretage !== null && this.ppActuel > _ppMaxApresEcretage) this.ppActuel = _ppMaxApresEcretage;
    // Sorts appris hors Voies (cf. reference_sorts_connus.md) : tableau d'id
    // de SORTS_MAGICIEN (ou liste équivalente future Nécro/Enchanteur),
    // distinct de capacites[] (réservé aux rangs de Voie classiques).
    this.grimoireSortsConnus = d.grimoireSortsConnus || [];
    // Grimoire v3 — sélection MANUELLE des sorts préparés (= réellement
    // lançables) parmi les sorts inscrits. Tableau vide/absent = repli sur
    // le remplissage glouton historique (cf. grimoireOccupationParTier), ce
    // qui laisse intactes toutes les fiches créées avant ce système.
    this.grimoireSortsPrepares = d.grimoireSortsPrepares || [];
    // Drapeau de rattrapage : tant qu'il est faux, le joueur peut inscrire
    // librement dans la limite du plafond (les sorts ont été distribués
    // hors mécanique au niveau 3). Une fois figé à true, seuls les
    // parchemins permettent d'inscrire un nouveau sort.
    this.grimoireRattrapageFait = d.grimoireRattrapageFait === true;
    // Fenêtre de préparation ouverte par un repos long (cf. js/repos.js,
    // lancerJetRepos) et consommée à la validation de la sélection.
    this.grimoirePreparationDisponible = d.grimoirePreparationDisponible === true;
    // Prêtre — Cercle de spécialisation (cf. prompt_pretre_cercle_vie.md
    // Partie 1) : "vie"/"foi"/"bannissement"/"jugement"/null, fixé à la
    // création — donne 1 sort de la famille correspondante, occupant un
    // emplacement de Grimoire s'il y en a un de compatible (cf.
    // sortsGrimoireAccordes()).
    this.cercleSpecialisation = d.cercleSpecialisation || null;
    // Points de Cercle (façon Channel Divinity D&D, cf. les 4 prompts
    // prompt_pretre_cercle_*.md) : 4 pools séparés du PP, un par Cercle,
    // jamais prélevés sur la même action. Reconstitution repos long
    // uniquement (cf. reposLongPointsCercle()). Positionnés en fin de
    // constructeur comme ppActuel : leurs Max() dépendent de estChoisie/
    // rangMaxVoie, donc de capacites déjà posé plus haut.
    this.pointsBenediction = d.pointsBenediction !== undefined ? d.pointsBenediction : this.pointsBenedictionMax();
    this.pointsConviction = d.pointsConviction !== undefined ? d.pointsConviction : this.pointsConvictionMax();
    this.pointsBannissement = d.pointsBannissement !== undefined ? d.pointsBannissement : this.pointsBannissementMax();
    this.pointsJugement = d.pointsJugement !== undefined ? d.pointsJugement : this.pointsJugementMax();

    // Migration douce : l'ancien champ libre `inventaire` (string) devient un
    // item texte libre dans inventaireListe, pour ne rien perdre à la casse
    // des fiches créées avant l'introduction des slots d'équipement.
    if (typeof d.inventaire === "string" && d.inventaire.trim()) {
      this.inventaireListe = (this.inventaireListe || []).concat([{
        id: "migre-inventaire-texte",
        nom: "Ancien inventaire (texte libre)",
        type: "divers",
        description: d.inventaire.trim(),
      }]);
    }
  }

  /* ----- Caractéristiques ----- */
  // Enchanteur — Voie du chaos, rang 5 "Ascension chaotique" (L, 1x/scénario) :
  // état 'ascension_chaotique' — double TOUS les modificateurs de
  // caractéristique tant qu'il est actif (cf. mod() ci-dessous). Volontairement
  // PAS de multiplicateur supplémentaire dans calculerPPMax() (qui appelle déjà
  // mod() en interne) : un second ×2 par-dessus produirait un double-comptage
  // (le pool de PP augmente donc via la cascade du mod doublé, pas d'un
  // strict ×2 du total — simplification assumée pour éviter ce risque signalé
  // par le design). Même principe pour tout autre calcul qui passe par mod().
  _multiplicateurAscension() {
    return (this.etatsActifs || []).some((e) => e.idEtat === "ascension_chaotique") ? 2 : 1;
  }
  mod(code) {
    const base = Entite.modCarac(this.caracs[code] + this.bonusCaracCapacites(code) + this.bonusCaracDons(code) + this.bonusCaracEquipement(code) + this.bonusCaracMutations(code) + this.bonusTemporaire(code)) - this.penaliteContratDemoniaque(code);
    // Guerrier — Voie de l'élite, rang 5 "Apogée physique" (L, 1x/combat) :
    // double le MODIFICATEUR (pas la carac brute) de la carac choisie au
    // rang 1 (Spécimen d'élite), pendant 3 tours — état 'apogee_physique'
    // posé avec un champ 'carac' dynamique (cf. resoudreEffet côté
    // capacites.js, qui va chercher le choix fait au rang 1 à la pose).
    const apogeeActif = (this.etatsActifs || []).some((e) => e.idEtat === "apogee_physique" && e.carac === code);
    return (apogeeActif ? base * 2 : base) * this._multiplicateurAscension();
  }

  // Bonus permanent à une caractéristique de base, accordé par un choix fixé
  // à l'acquisition d'une capacité (ex. Guerrier — Spécimen d'élite : +1 FOR,
  // DEX ou CON au choix, cf. CAPACITES_A_CHOIX côté app.js). N'altère jamais
  // this.caracs (la base allouée à la création reste intacte) — mais est bien
  // ajouté à la valeur "val." affichée sur la fiche (cf. app.js, à côté du
  // modificateur) comme au modificateur effectif utilisé pour tous les
  // calculs (attaque, DEF, PV...).
  bonusCaracCapacites(code) {
    let bonus = 0;
    if (this.classe === "guerrier") {
      const cap = this.capaciteEntree("Voie de l'élite", 1);
      if (cap && cap.choix === code) bonus += 1;
    }
    // Voies raciales (homebrew) à bonus de caractéristique permanent — cf.
    // estChoisieRace/choixCapaciteRace, RACE_CAPACITES_A_CHOIX côté app.js
    // pour les rangs à choix.
    if (this.race === "humain" && this.estChoisieRace(4) && code === this.choixCapaciteRace(4)) {
      // Ambition : +2 à n'importe quelle caractéristique, fixée à l'acquisition.
      bonus += 2;
    }
    if (this.race === "elfe" && code === "DEX" && this.estChoisieRace(2)) {
      // Grâce de la Sève : +2 DEX fixe (pas de choix).
      bonus += 2;
    }
    if (this.race === "demi_elfe" && this.estChoisieRace(2) && code === this.choixCapaciteRace(2)) {
      // Sang Mêlé : +1 DEX ou CHA au choix, fixé à l'acquisition.
      bonus += 1;
    }
    if (this.race === "demi_orc" && this.estChoisieRace(2) && code === this.choixCapaciteRace(2)) {
      // Sang de Guerre : +1 FOR ou CON au choix. Le "+2 PV par niveau
      // (rétroactif)" associé à ce même rang n'est PAS mécanisé ici — hors
      // scope (bonus de caractéristique uniquement), cf. bonusPvDons pour
      // le modèle si mécanisé séparément plus tard.
      bonus += 1;
    }
    if (this.race === "demi_gobelin" && code === "DEX" && this.estChoisieRace(2)) {
      // Instinct de Fuite : +1 DEX fixe (pas de choix).
      bonus += 1;
    }
    // Prêtre — Cercle de Vie, rang 5 "Faveur divine" (passive) : +1 CON et
    // +1 CHA permanents, cf. prompt_pretre_cercle_vie.md Partie 4.
    if (this.classe === "pretre" && this.estChoisie("Voie de la guérison", 5) && (code === "CON" || code === "CHA")) {
      bonus += 1;
    }
    return bonus;
  }

  // Don Amélioration de caractéristique : +1 aux deux caractéristiques
  // choisies à l'acquisition (cf. this.donsChoix.amelioration_carac, posé côté
  // app.js lors du choix du don — le plafond 18/20 n'est vérifié qu'à ce
  // moment-là, pas ici).
  bonusCaracDons(code) {
    let bonus = 0;
    const choix = this.donsChoix && this.donsChoix.amelioration_carac;
    if (Array.isArray(choix) && choix.includes(code)) bonus += 1;
    // Don Athlète : +1 FOR ou DEX au choix, fixé à l'acquisition
    // (this.donsChoix.athlete) — même plafond que Amélioration de
    // caractéristique (18, ou 20 par affinité raciale), réutilisé par
    // cohérence même si le don ne précise pas de plafond spécifique.
    if (this.donsChoix && this.donsChoix.athlete === code) bonus += 1;
    return bonus;
  }

  // Bonus fixe accordé à une compétence nommée par un don ou un rang de voie
  // (ex. futur don "Expert en Intimidation" : perso.bonusCompetences["Intimidation"] = 2
  // posé côté app.js à l'acquisition, sur le même principe que donsChoix).
  // Don Doué : +1 CHA "lors des conversations" sur Bluff/Intimidation/
  // Représentation/Persuasion (les 4 compétences sociales de
  // COMPETENCES_PAR_CARAC.CHA) — pas un bonus de caractéristique générique
  // (n'affecte ni l'attaque magique CHA ni la DEF/initiative), donc modélisé
  // ici plutôt que via bonusCaracDons. Fixe et sans choix : calculé à la
  // volée comme bonusPvDons/bonusCaracDons, jamais écrit dans
  // this.bonusCompetences (réservé aux futurs dons/voies à choix explicite).
  bonusCompetence(nom) {
    let bonus = (this.bonusCompetences && this.bonusCompetences[nom]) || 0;
    bonus += this.bonusCompetenceEquipement(nom);
    bonus += this.bonusCompetenceMutations(nom);
    const competencesDoue = ["Bluff", "Intimidation", "Représentation", "Persuasion"];
    if ((this.dons || []).includes("doue") && competencesDoue.includes(nom)) bonus += 1;

    // Voies de classe à bonus de compétence progressif ("+2 par rang atteint
    // dans la voie", cf. rangMaxVoie) — même principe que Doué, mais l'ampleur
    // dépend du rang le plus haut acquis plutôt que d'être fixe. Le texte des
    // rangs mentionne parfois plusieurs notions ("vigilance", "pistage") sans
    // entrée dédiée dans COMPETENCES_PAR_CARAC : repliées sur la compétence la
    // plus proche (Perception, Survie) plutôt que d'inventer une compétence.
    if (this.classe === "barde" && nom === "Acrobaties") {
      bonus += 2 * this.rangMaxVoie("Voie du spectacle"); // Acrobate (équilibre/saut/escalade repliés dessus)
    }
    if (this.classe === "pretre" && nom === "Persuasion") {
      bonus += 2 * this.rangMaxVoie("Voie de la conversion"); // Voix de la persuasion
    }
    if (this.classe === "enchanteur" && nom === "Persuasion") {
      bonus += 2 * this.rangMaxVoie("Voie du spectacle"); // Voix envoûtante
    }
    if (this.classe === "enchanteur" && (nom === "Connaissances (histoire)" || nom === "Connaissances (arcanes)")) {
      bonus += 2 * this.rangMaxVoie("Voie de l'historien"); // Archives vivantes
    }
    if (this.classe === "druide" && (nom === "Survie" || nom === "Discrétion" || nom === "Perception")) {
      bonus += 2 * this.rangMaxVoie("Voie de la nature"); // Survie (vigilance → Perception)
    }
    if (this.classe === "chasseur" && (nom === "Survie" || nom === "Discrétion")) {
      bonus += 2 * this.rangMaxVoie("Voie de la traque"); // Pisteur (pistage replié sur Survie)
    }
    if (this.classe === "druide" && nom === "Dressage") {
      bonus += 2 * this.rangMaxVoie("Voie des compagnons"); // Communication animale
    }

    // Voies raciales à bonus de compétence fixe (cf. estChoisieRace).
    if (this.race === "elfe" && nom === "Perception" && this.estChoisieRace(1)) bonus += 2; // Sens Affinés
    if (this.race === "nain" && nom === "Artisanat" && this.estChoisieRace(4)) bonus += 2; // Savoir des Veines
    if (this.race === "demi_elfe" && this.estChoisieRace(1)) {
      // Sens Affinés : "+1 aux tests de Perception et de Social" — Social =
      // les 4 compétences sociales CHA (même groupe que Doué), pas une
      // compétence nommée à part.
      if (nom === "Perception") bonus += 1;
      if (competencesDoue.includes(nom)) bonus += 1;
    }
    if (this.race === "demi_orc" && nom === "Intimidation" && this.estChoisieRace(1)) bonus += 2; // Carrure Menaçante
    if (this.race === "demi_gobelin" && nom === "Discrétion" && this.estChoisieRace(1)) bonus += 2; // Petite Taille
    if (this.race === "demi_gobelin" && nom === "Artisanat" && this.estChoisieRace(3)) bonus += 2; // Bricoleur (pièges/mécanismes repliés dessus)
    // Chasseur — Voie du piège, rang 4 "Détection des pièges adverses" :
    // +4 à la détection de pièges, repliés sur Perception faute d'une
    // compétence "détection de pièges" dédiée dans COMPETENCES_PAR_CARAC —
    // s'applique donc à tout test de Perception, pas seulement aux pièges
    // (même simplification que les autres bonus de compétence "élargis").
    if (this.classe === "chasseur" && nom === "Perception" && this.estChoisie("Voie du piège", 4)) bonus += 4;
    // Barde — Voie du chaos, rang 4 "Voix qui corrompt" (passive, dès CA 5+) :
    // +2 aux 3 compétences de manipulation sociale (Représentation exclue,
    // plus proche de la performance artistique que de la séduction).
    if (this.classe === "barde" && this.estChoisie("Voie du chaos", 4) && (this.corruptionMajeure || 0) >= 5
        && ["Persuasion", "Bluff", "Intimidation"].includes(nom)) {
      bonus += 2;
    }

    return bonus;
  }

  // Modificateur total pour un test de compétence : mod. de la carac porteuse
  // + bonusCompetence(nom) éventuel, moins le malus de proficience d'armure
  // (-2, cf. estArmureNonMaitrisee) sur les compétences DEX (Discrétion,
  // Acrobaties, Escamotage).
  modCompetence(nom, caracCode) {
    const malusProficience = (caracCode === "DEX" && Personnage.estArmureNonMaitrisee(this)) ? -2 : 0;
    return this.mod(caracCode) + this.bonusCompetence(nom) + malusProficience;
  }

  // Modificateur total d'un jet de sauvegarde (cf. SAUVEGARDES, data/donnees.js :
  // Reflexes→DEX, Vigueur→CON, Volonte→SAG). Modèle RÉACTIF assumé (décision du
  // 04/08/2026) : c'est le DÉFENSEUR qui lance.
  //
  // `defMentale` est un ALIAS historique de "Volonte" : js/capacites.js le
  // convertit avant de résoudre (cf. nomSauvegarde dans Capacites.lancer,
  // chantier du 04/08/2026) et appelle ensuite cette fonction. Tout terme
  // ajouté ici se propage donc automatiquement à Domination, Fascination,
  // Éclat chaotique et Drain d'âme, sans migration des données.
  // obtenirVolonteCible ne sert plus qu'aux MONSTRES.
  //
  // contexte : null | "magie" | "poison" | "corruption" | "peur"
  // null = total inconditionnel, seul affiché sur la fiche au repos. Les
  // bonus conditionnels ne sont JAMAIS comptés sans contexte explicite :
  // afficher +4 vs poison en permanence mentirait sur toutes les autres
  // menaces, ce qui est exactement le défaut que l'étape 1 refusait.
  //
  // Composition :
  //   - mod() de la carac porteuse ;
  //   - bonusTestCaracCapacites() : déjà appliqué aux tests de carac bruts,
  //     porte le Moine « Discipline du corps » (+2 sur SAG, donc sur Volonté) —
  //     appliqué EN PERMANENCE et non seulement contre la Peur, imprécision
  //     antérieure à ce chantier qu'on ne corrige pas aujourd'hui ;
  //   - malus de proficience d'armure (-2) sur RÉFLEXES uniquement, même
  //     patron que modCompetence() pour les compétences DEX (une armure trop
  //     lourde gêne l'esquive comme elle gêne l'Acrobatie) ;
  //   - bonusResistanceMentaleEquipement() sur VOLONTÉ, champ legacy
  //     (bonusResistanceMentale) actuellement porté par ZÉRO objet du
  //     catalogue. Laissé en place mais plus alimenté : le chemin d'avenir
  //     est bonusSauvegardes ci-dessous — ne rien ajouter ici, sous peine de
  //     faire diverger les deux champs ;
  //   - bonusSauvegardeEquipement(nom) : inconditionnel (objets, étape 3) ;
  //   - bonusSauvegardeRace(nom, contexte) : conditionnel (voies raciales,
  //     étape 3), renvoie 0 sans contexte ;
  //   - bonusSauvegardeVsEquipement(contexte) : conditionnel (objets, étape
  //     3), renvoie 0 sans contexte ;
  //   - bonusSauvegardeMusique(nom) : posé par le métier Musicien (étape
  //     ultérieure), inconditionnel — gardé derrière un test d'existence pour
  //     ne pas dépendre de l'ordre de chargement des scripts classiques.
  // NE COMPOSE PAS ENCORE : l'aura Volonté du Chevalier (« Autorité de
  // sang », +1 aux alliés à ≤3 cases — étape 4, non traitée ici parce
  // qu'elle dépend des positions sur la battlemap).
  //
  // L'avantage automatique (Endurance de fer → Vigueur, Verdict/Vœu
  // inébranlable → Volonté) n'est PAS un terme additif : il est appliqué au
  // moment du jet via modeForce côté app.js, comme pour les tests de carac.
  modSauvegarde(nom, contexte = null) {
    const code = (typeof SAUVEGARDES !== "undefined" && SAUVEGARDES[nom]) || null;
    if (!code) return 0;
    const malusProficience = (nom === "Reflexes" && Personnage.estArmureNonMaitrisee(this)) ? -2 : 0;
    // "impenetrable" (collier_clarte, lot "armes/accessoires D") : "+X aux
    // jets de résistance MENTALE" est assez spécifique pour être fixé sur
    // Volonté, contrairement à "contre la magie" (cotte_runique/targe_elfique,
    // jamais mécanisé — le save concerné y dépend du sort). Même principe que
    // Verdict/Vœu inébranlable (aAvantageResistanceMentale), qui forcent déjà
    // l'avantage sur ce même jet SAG — ici un bonus fixe, pas un avantage.
    // NB : collier_clarte n'affiche en réalité aucune valeur numérique
    // (« Immunisé à la lecture de pensées ») — s'il porte un jour ce
    // commentaire comme justification de bonusResistanceMentale, c'est une
    // confusion avec un autre objet, pas une donnée à répliquer ici.
    const bonusResistanceMentale = (nom === "Volonte") ? this.bonusResistanceMentaleEquipement() : 0;
    const bonusEquipement = this.bonusSauvegardeEquipement(nom);
    const bonusRace = this.bonusSauvegardeRace(nom, contexte);
    const bonusVsEquipement = this.bonusSauvegardeVsEquipement(contexte);
    const bonusMusique = (typeof this.bonusSauvegardeMusique === "function") ? this.bonusSauvegardeMusique(nom) : 0;
    return this.mod(code) + this.bonusTestCaracCapacites(code) + malusProficience + bonusResistanceMentale
      + bonusEquipement + bonusRace + bonusVsEquipement + bonusMusique;
  }

  // Bonus de sauvegarde INCONDITIONNEL porté par l'équipement (champ
  // bonusSauvegardes: { toutes, Reflexes, Vigueur, Volonte }, cf. data/loot.json)
  // — même patron de réduction que bonusResistanceMentaleEquipement, mais sur
  // les trois sauvegardes plutôt que la seule Volonté.
  bonusSauvegardeEquipement(nom) {
    return this._itemsEquipesUniques().reduce((t, it) => {
      const b = it.bonusSauvegardes; if (!b) return t;
      return t + (b.toutes || 0) + (b[nom] || 0);
    }, 0);
  }

  // Bonus de sauvegarde CONDITIONNELS portés par l'équipement (champ
  // bonusSauvegardesVs: { magie, poison, corruption, peur }). Renvoie 0 sans
  // contexte : cf. modSauvegarde.
  bonusSauvegardeVsEquipement(contexte) {
    if (!contexte) return 0;
    return this._itemsEquipesUniques().reduce((t, it) =>
      t + ((it.bonusSauvegardesVs && it.bonusSauvegardesVs[contexte]) || 0), 0);
  }

  // Bonus de sauvegarde CONDITIONNELS portés par les voies raciales.
  // Renvoie 0 sans contexte : cf. modSauvegarde. Les rangs et les races sont
  // vérifiés sur data/donnees.js — ne pas les déduire du nom de la voie.
  // Le quatrième conditionnel connu — Moine « Discipline du corps », +2
  // Volonté vs Peur et Intimidation — ne se traite PAS ici : il transite déjà
  // par bonusTestCaracCapacites("SAG") et serait compté deux fois.
  bonusSauvegardeRace(nom, contexte) {
    if (!contexte) return 0;
    let b = 0;
    if (this.race === "humain" && this.estChoisieRace(1) && (contexte === "magie" || contexte === "corruption")) b += 1;
    if (this.race === "nain" && this.estChoisieRace(1) && contexte === "poison") b += 4;
    if (this.race === "demi_elfe" && this.estChoisieRace(2) && contexte === "magie") b += 1;
    return b;
  }

  // Détail NOMMÉ des termes conditionnels actifs pour un contexte donné —
  // usage UI uniquement (afficherFiche, sélecteur de menace) : un bonus qui
  // apparaît sans être expliqué sera contesté à table (cf. §5). Mêmes
  // conditions que bonusSauvegardeRace/bonusSauvegardeVsEquipement, jamais
  // recalculées différemment. [] sans contexte.
  detailSauvegardeConditionnel(contexte) {
    if (!contexte) return [];
    const lignes = [];
    if (this.race === "humain" && this.estChoisieRace(1) && (contexte === "magie" || contexte === "corruption")) {
      lignes.push({ libelle: "Sang Divin", valeur: 1 });
    }
    if (this.race === "nain" && this.estChoisieRace(1) && contexte === "poison") {
      lignes.push({ libelle: "Résistance de Pierre", valeur: 4 });
    }
    if (this.race === "demi_elfe" && this.estChoisieRace(2) && contexte === "magie") {
      lignes.push({ libelle: "Sang Mêlé", valeur: 1 });
    }
    this._itemsEquipesUniques().forEach((it) => {
      const v = it.bonusSauvegardesVs && it.bonusSauvegardesVs[contexte];
      if (v) lignes.push({ libelle: it.nom, valeur: v });
    });
    return lignes;
  }

  // Bonus de sauvegarde INCONDITIONNEL posé par la veillée du Musicien (cf.
  // js/musique.js, jouer() → SyncStore["musique:veillee"]) — la musique
  // porte quel que soit le contexte de menace (prompt_musicien_6_metier.md
  // §8), donc lu dans TOUS les cas, jamais gated sur contexte. Un seul buff
  // actif à la fois (un nouveau morceau remplace le précédent, cf. jouer()).
  // Derrière un garde d'existence de SyncStore, comme le reste des modules
  // self-contained en script classique — l'ordre de chargement n'est pas
  // garanti entre js/sync.js et js/personnage.js.
  bonusSauvegardeMusique(nom) {
    if (typeof SyncStore === "undefined") return 0;
    const buff = SyncStore.get("musique:veillee");
    if (!buff || !buff.portee.includes(this.id)) return 0;
    if (buff.cible !== "toutes" && buff.cible !== nom) return 0;
    return buff.valeur;
  }

  get classeDef() {
    return (typeof CLASSES !== "undefined" && CLASSES[this.classe]) || null;
  }

  /* ----- Points de vie ----- */
  facesDeVie() {
    const c = this.classeDef;
    const m = c && /1d(\d+)/.exec(c.de_de_vie || "");
    return m ? parseInt(m[1], 10) : 6;
  }
  // PV de base au niveau 1 = dé de vie max + Mod. CON + 2 (bonus fixe, min 1)
  pvNiveau1() {
    return Math.max(1, this.facesDeVie() + this.mod("CON") + 2);
  }
  // PV total = niveau 1 + somme des jets de niveau historisés + bonus de capacités/dons
  pvCalcule() {
    return (this.pvHistorique || []).reduce((t, j) => t + (j.total || 0), this.pvNiveau1()) + this.bonusPvCapacites() + this.bonusPvDons() + this.bonusPvEquipement();
  }
  // Guerrier — Voie de l'élite, rang 2 "Endurance de fer" (passive) : +1 PV par niveau.
  bonusPvCapacites() {
    let bonus = 0;
    if (this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 2)) {
      bonus += this.niveau || 1;
    }
    // Nain — "Résistance de Pierre" (rang 1 racial, acquis automatiquement à
    // la sélection de la race) : +2 PV par niveau, rétroactif — même modèle
    // que le don Robuste (bonusPvDons).
    if (this.race === "nain" && this.estChoisieRace(1)) {
      bonus += 2 * (this.niveau || 1);
    }
    // Demi-Orc — "Sang de Guerre" (rang 2 racial) : +2 PV par niveau,
    // rétroactif, en plus du bonus de caractéristique déjà mécanisé
    // (cf. bonusCaracCapacites, même rang).
    if (this.race === "demi_orc" && this.estChoisieRace(2)) {
      bonus += 2 * (this.niveau || 1);
    }
    return bonus;
  }
  // Don Robuste : +2 PV par niveau, rétroactif sur tous les niveaux déjà acquis.
  bonusPvDons() {
    return (this.dons || []).includes("robuste") ? 2 * (this.niveau || 1) : 0;
  }

  // Somme des bonus temporaires actuellement actifs (sorts/capacités posés via
  // js/capacites.js — Bouclier arcanique, Faveur sombre, Voie de l'alcoolisme,
  // Toucher flétrissant, etc. — cf. etatsActifs) pour une cible donnée : "DEF",
  // "attaque", "initiative", ou un code de caractéristique ("FOR".."CHA", lu
  // par mod() ci-dessus — cf. effet.cible: "choix" côté données, résolu à
  // l'activation par Capacites.lancer). Distinct des bonus permanents
  // hardcodés ci-dessous (bonusDefCapacites, etc.), qui restent la seule
  // source pour les bonus fixés à l'acquisition d'une capacité (les entrées
  // "permanente" ne sont jamais poussées dans etatsActifs, cf. Capacites.lancer).
  bonusTemporaire(cible) {
    return (this.etatsActifs || []).reduce((total, e) => {
      if (e.bonus && e.bonus.cible === cible && typeof e.bonus.valeur === "number") return total + e.bonus.valeur;
      return total;
    }, 0);
  }

  // Contrat Démoniaque (data/loot.json: contrat_demoniaque) — pénalité posée
  // sur UNE SEULE caractéristique (celle liée au jet où le bonus a été
  // utilisé, cf. js/app.js lancerTest), distincte de bonusTemporaire ci-dessus
  // (pas liée à un état à durée limitée : reste active jusqu'à ce que le
  // porteur clique le bouton de reset dédié sur sa fiche).
  penaliteContratDemoniaque(code) {
    const p = this.contratDemoniaquePenalite;
    return (p && p.carac === code && typeof p.valeur === "number") ? p.valeur : 0;
  }

  /* ----- Points de Pouvoir (PP, cf. reference_systeme_magie_pp.md) ----- */
  // PP max : null si la classe n'a pas de CARAC_MAGIE (même garde-fou que
  // bonusAttaque("magique")) — un Guerrier n'a pas de pool de PP.
  // Réserve de PP réduite pour les hybrides (changement d'équilibrage) :
  // un lanceur pur compte le mod ×2, un hybride (prêtre/druide/barde/
  // moine) ne le compte qu'une fois — cf. MULTIPLICATEUR_MOD_PP
  // (data/donnees.js, à côté de DIVISEUR_ATTAQUE, même patron). Repli
  // "lanceur" (×2, comportement historique) si ARCHETYPE_CLASSE ou
  // MULTIPLICATEUR_MOD_PP est indisponible — même principe que
  // bonusProgression() ci-dessous (l. ~1998).
  //
  // Interaction avec 'ascension_chaotique' (cf. _multiplicateurAscension
  // ci-dessus, l. ~266-275) : ce multiplicateur passe par mod(), qu'on
  // pondère maintenant ×1 au lieu de ×2 pour les hybrides. Conséquence
  // mécanique non neutre, à ne pas découvrir en jeu : le gain de PP que
  // procure Ascension chaotique est donc, lui aussi, divisé par deux pour
  // un hybride par rapport à un lanceur pur — cohérent avec la règle
  // ci-dessus, mais distinct d'elle.
  calculerPPMax() {
    const carac = CARAC_MAGIE[this.classe];
    if (!carac) return null;
    const arch = (typeof ARCHETYPE_CLASSE !== "undefined" && ARCHETYPE_CLASSE[this.classe]) || "lanceur";
    const multMod = (typeof MULTIPLICATEUR_MOD_PP !== "undefined" && MULTIPLICATEUR_MOD_PP[arch]) || 2;
    return 4 + (this.niveau || 1) * 2 + this.mod(carac) * multMod + this.bonusPPCapacites();
  }
  // Magicien — Voie de la magie universitaire, rangs 1/2 "Réserve étendue
  // I/II" (passives) : +4 PP max par rang acquis (cumulables, +8 max aux
  // rangs 1-2). rangMaxVoie plafonné à 2 : les rangs 3-5 de cette voie
  // n'ajoutent aucun bonus de PP max (Efficience arcanique/Surcharge
  // maîtrisée/Consumation totale, effets différents — cf. leur note
  // respective dans data/donnees.js).
  bonusPPCapacites() {
    if (this.classe !== "magicien") return 0;
    return Math.min(this.rangMaxVoie("Voie de la magie universitaire"), 2) * 4;
  }
  // Repos long (bouton manuel, cf. Capacites.reinitialiserUsage pour le
  // même principe) : reset complet.
  reposLongPP() {
    const max = this.calculerPPMax();
    if (max === null) return;
    this.ppActuel = max;
  }
  // Repos court (bouton manuel, nouveau — pas de fonction équivalente pour
  // les usages de capacités, spécifique aux PP) : +25% de ppMax, arrondi au
  // supérieur, plafonné à ppMax.
  reposCourtPP() {
    const max = this.calculerPPMax();
    if (max === null) return;
    this.ppActuel = Math.min(max, (this.ppActuel || 0) + Math.ceil(max * 0.25));
  }

  // Objet de Grimoire PORTÉ pour CETTE classe — équipé OU simplement dans
  // le sac (convenu : l'avoir sur soi suffit, pas besoin de lui dédier un
  // emplacement d'équipement) — généralisé via le champ `grimoireClasses`
  // (liste de classes autorisées) plutôt qu'un id en dur : Manuel
  // d'incantation [magicien/enchanteur/necromancien] et Amulette de
  // Bénédiction [pretre] partagent ce même mécanisme, cf.
  // prompt_grimoire_v2_emplacements_typ_s.md. Tout futur objet du même
  // genre n'a qu'à porter ce champ, aucun code à toucher.
  _objetGrimoirePorte() {
    const candidats = this._itemsEquipesUniques().concat(this.inventaireListe || []);
    return candidats.find((it) => it && Array.isArray(it.grimoireClasses) && it.grimoireClasses.includes(this.classe));
  }
  // Emplacements de sorts hors Voies, typés par plafond de rang logeable
  // (cf. GRIMOIRE_TIERS_PAR_RARETE ci-dessus) — 0 partout sans objet
  // compatible sur soi pour cette classe.
  slotsGrimoireParTier() {
    const objet = this._objetGrimoirePorte();
    if (!objet) return { "12": 0, "13": 0, "14": 0, "15": 0 };
    return GRIMOIRE_TIERS_PAR_RARETE[objet.bonusRarete || 0];
  }
  // Total agrégé, conservé pour l'affichage existant ("X/Y sorts connus").
  slotsGrimoire() {
    const t = this.slotsGrimoireParTier();
    return t["12"] + t["13"] + t["14"] + t["15"];
  }
  // Grimoire v3 — plafond de sorts INSCRITS (cf. GRIMOIRE_INSCRITS_BASE /
  // GRIMOIRE_NIVEAU_PIVOT, data/donnees.js) : 4 + 1 par niveau au-delà du 3.
  // Indépendant des emplacements PRÉPARÉS (slotsGrimoireParTier), qui
  // dépendent eux de la rareté de l'objet porté.
  plafondInscriptionGrimoire() {
    const base = (typeof GRIMOIRE_INSCRITS_BASE !== "undefined") ? GRIMOIRE_INSCRITS_BASE : 4;
    const pivot = (typeof GRIMOIRE_NIVEAU_PIVOT !== "undefined") ? GRIMOIRE_NIVEAU_PIVOT : 3;
    return base + Math.max(0, (this.niveau || 1) - pivot);
  }
  // Ids réellement inscrits, accordés d'abord (garantis par les règles,
  // jamais bloqués), puis les sorts appris — dédoublonnés. Au-delà du
  // plafond, les sorts APPRIS en excédent sont exclus : ils restent dans
  // grimoireSortsConnus (rien n'est effacé) mais ne sont ni préparables ni
  // lançables tant que le plafond n'a pas remonté d'un niveau.
  idsGrimoireInscrits() {
    const accordes = this.sortsGrimoireAccordes();
    const appris = (this.grimoireSortsConnus || []).filter((id) => !accordes.includes(id));
    return accordes.concat(appris).slice(0, this.plafondInscriptionGrimoire());
  }
  // Sorts appris qui débordent du plafond d'inscription — sert à l'affichage
  // d'avertissement sur la fiche, jamais à filtrer/effacer des données.
  idsGrimoireHorsPlafond() {
    const accordes = this.sortsGrimoireAccordes();
    const appris = (this.grimoireSortsConnus || []).filter((id) => !accordes.includes(id));
    return accordes.concat(appris).slice(this.plafondInscriptionGrimoire());
  }
  // Reste-t-il une place inscriptible ? Utilisé aussi bien par
  // l'apprentissage libre (rattrapage) que par les parchemins.
  placeInscriptionLibre() {
    const accordes = this.sortsGrimoireAccordes();
    const total = accordes.length + (this.grimoireSortsConnus || []).filter((id) => !accordes.includes(id)).length;
    return total < this.plafondInscriptionGrimoire();
  }
  // Liste ordonnée des ids de sorts en compétition pour un emplacement :
  // les sorts ACCORDÉS (cf. sortsGrimoireAccordes, garantis par la Voie/le
  // Cercle) passent en premier, avant les sorts appris manuellement — pour
  // qu'en cas de capacité insuffisante, ce soit un choix du joueur qui
  // reste sans emplacement plutôt qu'un octroi garanti par les règles.
  // Dédoublonné (un id ne compte qu'une fois, même appris ET accordé).
  _idsGrimoirePourOccupation() {
    const inscrits = this.idsGrimoireInscrits();
    // Grimoire v3 — sélection manuelle des préparés : on ne garde que les
    // ids explicitement choisis par le joueur, dans SON ordre, filtrés sur
    // ceux qui sont réellement inscrits (une sélection peut devenir
    // obsolète après une baisse de niveau ou un sort retiré). Sélection
    // vide ou entièrement obsolète = repli sur le remplissage glouton
    // historique (accordés d'abord, puis appris), pour ne rien casser sur
    // les fiches antérieures à ce système.
    const choisis = (this.grimoireSortsPrepares || []).filter((id) => inscrits.includes(id));
    return choisis.length ? choisis : inscrits;
  }
  // Recalcule l'occupation par palier À LA VOLÉE depuis grimoireSortsConnus
  // + sortsGrimoireAccordes (cf. _idsGrimoirePourOccupation ci-dessus) —
  // AUCUN champ persisté supplémentaire : réappliquer le même remplissage
  // glouton (plus petit plafond compatible libre) donne toujours le même
  // résultat, tant que l'objet équipé ne change pas de rareté/classe
  // entre-temps. Un sort dont le rang ne trouve plus AUCUN plafond
  // compatible (objet retiré/changé pour un moins bon, ou sort accordé de
  // rang 5 sur un objet Commun qui n'a aucun emplacement 1-5) n'est
  // simplement compté dans aucun palier — pas d'erreur, juste absent du
  // décompte d'occupation (cf. sortGrimoireADesEmplacements, qui expose ce
  // même calcul par sort individuel pour bloquer son lancer le cas échéant).
  grimoireOccupationParTier() {
    const capacites = this.slotsGrimoireParTier();
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[this.classe] || []) : [];
    const occ = { "12": 0, "13": 0, "14": 0, "15": 0 };
    this._idsGrimoirePourOccupation().forEach((sortId) => {
      const sort = catalogue.find((s) => s.id === sortId);
      if (!sort) return;
      const tier = Personnage._tierLibrePourRang(capacites, occ, sort.rang);
      if (tier) occ[tier]++;
    });
    return occ;
  }
  // Plus petit plafond compatible ENCORE LIBRE pour un sort de `rang` donné,
  // ou null si aucun (capacités saturées ou aucun palier assez haut).
  static _tierLibrePourRang(capacites, occupation, rang) {
    for (const tier of GRIMOIRE_ORDRE_TIERS) {
      if (GRIMOIRE_PLAFOND_TIER[tier] < rang) continue;
      if ((occupation[tier] || 0) < (capacites[tier] || 0)) return tier;
    }
    return null;
  }
  // Emplacement disponible pour apprendre un NOUVEAU sort de `rang` donné —
  // utilisé par apprendreSortDepuisParchemin (js/app.js) avant d'ajouter à
  // grimoireSortsConnus.
  emplacementLibrePourRang(rang) {
    return Personnage._tierLibrePourRang(this.slotsGrimoireParTier(), this.grimoireOccupationParTier(), rang);
  }
  // Une sélection de préparés est-elle logeable telle quelle dans les
  // emplacements typés disponibles ? Rejoue le remplissage glouton sur la
  // liste proposée : renvoie { ok, refuses[] } — refuses = ids qui ne
  // trouvent aucun palier compatible libre (rang trop élevé pour la rareté
  // de l'objet, ou capacité saturée).
  validerPreparationGrimoire(ids) {
    const capacites = this.slotsGrimoireParTier();
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[this.classe] || []) : [];
    const occ = { "12": 0, "13": 0, "14": 0, "15": 0 };
    const refuses = [];
    (ids || []).forEach((id) => {
      const sort = catalogue.find((s) => s.id === id);
      if (!sort) { refuses.push(id); return; }
      const tier = Personnage._tierLibrePourRang(capacites, occ, sort.rang);
      if (tier) occ[tier]++;
      else refuses.push(id);
    });
    return { ok: refuses.length === 0, refuses };
  }
  // Nombre total de sorts (appris + accordés) qui obtiennent effectivement
  // un emplacement — numérateur de l'affichage "X/Y sorts connus" (cf.
  // afficherFiche/htmlSortsGrimoireBattlemap) : un sort accordé de rang 5
  // sans emplacement 1-5 disponible n'est pas compté ici (cohérent avec
  // grimoireOccupationParTier), mais reste listé comme "connu" (juste
  // injouable, cf. sortGrimoireADesEmplacements) — pas perdu, pas doublé.
  grimoireSlotsOccupes() {
    const occ = this.grimoireOccupationParTier();
    return occ["12"] + occ["13"] + occ["14"] + occ["15"];
  }
  // Vrai si CE sort précis (identifié par id, appris ou accordé) obtient
  // effectivement un emplacement compatible sur l'objet actuellement porté
  // — rejoue le même remplissage glouton que grimoireOccupationParTier en
  // s'arrêtant dès que `sortId` est atteint. Faux = le sort reste "connu"
  // (visible, listé) mais son bouton Lancer doit être désactivé tant que ça
  // reste vrai (ex. sort accordé de rang 5 sur un objet Commun, ou sort
  // appris resté sans emplacement après un déséquipement de l'objet de
  // Grimoire) — se débloque automatiquement dès qu'un objet de meilleure
  // rareté (ou le bon objet) est porté, sans rien avoir à refaire.
  sortGrimoireADesEmplacements(sortId) {
    const capacites = this.slotsGrimoireParTier();
    const catalogue = (typeof SORTS_PAR_CLASSE !== "undefined") ? (SORTS_PAR_CLASSE[this.classe] || []) : [];
    const occ = { "12": 0, "13": 0, "14": 0, "15": 0 };
    let dispo = false;
    this._idsGrimoirePourOccupation().some((id) => {
      const sort = catalogue.find((s) => s.id === id);
      if (!sort) return false;
      const tier = Personnage._tierLibrePourRang(capacites, occ, sort.rang);
      if (tier) occ[tier]++;
      if (id === sortId) { dispo = !!tier; return true; }
      return false;
    });
    return dispo;
  }

  // Sorts accordés directement par un rang de voie (cf. SORTS_ACCORDES_PAR_VOIE
  // et CERCLE_SORT_GRATUIT, data/donnees.js) plutôt qu'appris manuellement
  // via le Grimoire — même patron répété pour les 4 Cercles du Prêtre
  // (chacun accorde son sort de rang 1, certains aussi un sort de rang 4/5).
  // Garantis par les règles (aucun apprentissage requis), mais occupent
  // quand même un emplacement de Grimoire s'il y en a un de compatible —
  // priorité sur les sorts appris manuellement en cas de capacité
  // insuffisante (cf. _idsGrimoirePourOccupation/grimoireOccupationParTier)
  // — DEPUIS le 04/08/2026 (avant cette date, comptés "hors slot").
  // Fusionné avec grimoireSortsConnus côté app.js pour l'affichage/le
  // lancement.
  sortsGrimoireAccordes() {
    const ids = (typeof SORTS_ACCORDES_PAR_VOIE !== "undefined" ? SORTS_ACCORDES_PAR_VOIE : [])
      .filter((e) => e.classe === this.classe && this.rangMaxVoie(e.voie) >= e.rang)
      .map((e) => e.idSort);
    const sortCercle = typeof CERCLE_SORT_GRATUIT !== "undefined" ? CERCLE_SORT_GRATUIT[this.cercleSpecialisation] : null;
    if (sortCercle && !ids.includes(sortCercle)) ids.push(sortCercle);
    return ids;
  }

  // Prêtre — sort mineur gratuit (cf. prompt_pretre_cercle_vie.md Partie 2) :
  // dé de soin de base scalant par palier de niveau, même paliers que
  // "Spécialisation de soin" (Cercle de Vie rang 2).
  soinsMineurs() {
    if (this.classe !== "pretre") return null;
    const n = this.niveau || 1;
    if (n >= 10) return "1d10";
    if (n >= 7) return "1d8";
    if (n >= 4) return "1d6";
    return "1d4";
  }

  // Points de Cercle (cf. constructeur) : 0 sans le rang 4 de la voie
  // correspondante, 2 avec le rang 4 seul, 3 avec le rang 5 (même barème
  // pour les 4 Cercles).
  pointsBenedictionMax() {
    if (this.classe !== "pretre") return 0;
    if (this.estChoisie("Voie de la guérison", 5)) return 3;
    if (this.estChoisie("Voie de la guérison", 4)) return 2;
    return 0;
  }
  pointsConvictionMax() {
    if (this.classe !== "pretre") return 0;
    if (this.estChoisie("Voie de la conversion", 5)) return 3;
    if (this.estChoisie("Voie de la conversion", 4)) return 2;
    return 0;
  }
  pointsBannissementMax() {
    if (this.classe !== "pretre") return 0;
    if (this.estChoisie("Voie de l'exorcisme", 5)) return 3;
    if (this.estChoisie("Voie de l'exorcisme", 4)) return 2;
    return 0;
  }
  pointsJugementMax() {
    if (this.classe !== "pretre") return 0;
    if (this.estChoisie("Voie de l'inquisition", 5)) return 3;
    if (this.estChoisie("Voie de l'inquisition", 4)) return 2;
    return 0;
  }
  // Repos long (bouton manuel, même principe que reposLongPP) : restaure les
  // 4 pools de Points de Cercle au maximum. Pas de repos court équivalent
  // (non demandé par les prompts, contrairement au PP).
  reposLongPointsCercle() {
    this.pointsBenediction = this.pointsBenedictionMax();
    this.pointsConviction = this.pointsConvictionMax();
    this.pointsBannissement = this.pointsBannissementMax();
    this.pointsJugement = this.pointsJugementMax();
  }

  /* ----- Défense ----- */
  // A-t-il une armure équipée d'une catégorie au-dessus de celle maîtrisée
  // par sa classe (cf. PROFICIENCE_ARMURE/RANG_CATEGORIE, data/donnees.js),
  // sans le don qui lève le malus de proficience ? Utilisable aussi bien sur
  // une instance Personnage que sur un objet perso brut `p` (même patron que
  // Combat._deplacementMax).
  static estArmureNonMaitrisee(p) {
    if (!p) return false;
    // Une armure occupe toujours le slot "torse" (cf. slotsPourType) — pas de
    // slot "armure" dédié dans SLOTS_EQUIPEMENT.
    const armure = (p.equipement && p.equipement.torse) || null;
    if (!armure || armure.type !== "armure" || !armure.categorie) return false; // "Vêtements" par défaut = toujours légère, jamais non-maîtrisée
    const categorieRequise = PROFICIENCE_ARMURE[p.classe] || "legere";
    const auDessus = RANG_CATEGORIE[armure.categorie] > RANG_CATEGORIE[categorieRequise];
    if (!auDessus) return false;
    const donRequis = armure.categorie === "lourde" ? "maitre_armures_lourdes" : "maitre_armures_moyennes";
    return !(p.dons || []).includes(donRequis);
  }

  // Une arme donnée est-elle d'une catégorie de maîtrise au-dessus de celle
  // de la classe (cf. PROFICIENCE_ARME/RANG_MAITRISE_ARME, data/donnees.js),
  // sans le don qui lève le malus ? Utilisable aussi bien sur une instance
  // Personnage que sur un objet perso brut `p` (même patron que
  // estArmureNonMaitrisee ci-dessus).
  // Une arme sans champ `maitrise` est traitée comme simple, donc jamais
  // non-maîtrisée : décision assumée pour ne pas pénaliser rétroactivement
  // les objets créés dans la Forge du MJ avant ce système.
  static estArmeNonMaitrisee(p, arme) {
    if (!p || !arme || arme.type !== "arme" || !arme.maitrise) return false;
    const requise = PROFICIENCE_ARME[p.classe] || "simple";
    if (RANG_MAITRISE_ARME[arme.maitrise] <= RANG_MAITRISE_ARME[requise]) return false;
    return !(p.dons || []).includes("maitre_armes_martiales");
  }

  // Mod. DEX effectif pour la CA : ignoré entièrement si l'armure équipée
  // n'est pas maîtrisée (cf. estArmureNonMaitrisee), sinon réduit du malusDEX
  // de l'armure (data/loot.json).
  dexEffectifCA() {
    if (Personnage.estArmureNonMaitrisee(this)) return 0;
    const armure = this._itemsEquipesUniques().find((it) => it.type === "armure");
    const malusDEX = armure ? (armure.malusDEX || 0) : 0;
    return this.mod("DEX") - malusDEX;
  }

  calculerCA() {
    const dex = this.dexEffectifCA();
    const armure = this._itemsEquipesUniques().find((it) => it.type === "armure");
    const valeurCA = armure ? (armure.valeurCA || 10) : 10; // 10 = "Vêtements" par défaut
    return valeurCA + dex + this.bonusDefEquipement() + this.bonusDefCapacites() + this.bonusDefMutations() + this.bonusTemporaire("DEF") + this.bonusDefImmobile() + this.bonusDefDuel() + this.bonusDefBouclierExpert() + this.bonusDefPhalange() + this.bonusDefSansArmureEquipement() + this.bonusDefArmureGroupeEquipement();
  }

  // Chasseur — Voie de la traque, rang 2 "Camouflage naturel" (passive) :
  // +4 DEF tant qu'il reste immobile en milieu naturel. "Immobile" = n'a pas
  // encore entamé son déplacement ce tour (cf. Combat.estImmobile, basé sur
  // deplacementRestant) — dépendance optionnelle (comme Carte pour les
  // capacités), false si Combat n'est pas chargé ou aucun combat actif. La
  // condition "milieu naturel" reste hors périmètre (pas de notion de terrain
  // dans l'app) : le bonus s'applique dès que le PJ est immobile, à ajuster
  // manuellement par la table si la scène ne s'y prête pas.
  bonusDefImmobile() {
    if (this.classe === "chasseur" && this.estChoisie("Voie de la traque", 2) &&
        typeof Combat !== "undefined" && Combat.estImmobile && Combat.estImmobile(this.id)) {
      return 4;
    }
    return 0;
  }

  // Don Combattant en duel : +2 DEF tant qu'une seule arme à une main est
  // équipée (armeUniqueMainLibre) ET qu'exactement un adversaire est adjacent
  // (distance <= 1 case, cf. Carte.distanceCasesEntre) — nécessite une scène
  // de combat dd2vtt active (seul mode où l'app connaît une distance en
  // cases) ; renvoie 0 sans Carte chargée, hors combat sur grille, ou si le
  // perso n'a pas (encore) de jeton posé.
  bonusDefDuel() {
    if (!(this.dons || []).includes("combattant_duel") || !this.armeUniqueMainLibre()) return 0;
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeMonstresCombat || !Carte.distanceCasesEntre) return 0;
    const monToken = Carte.tokenIdPourPerso(this.id);
    if (!monToken) return 0;
    const adjacents = (Carte.listeMonstresCombat() || []).filter((m) => {
      const d = Carte.distanceCasesEntre(monToken, m.id);
      return d !== null && d <= 1;
    });
    return adjacents.length === 1 ? 2 : 0;
  }

  // Guerrier — Voie du soldat, rang 2 "Combat en phalange" (passive) : +1 DEF
  // par PJ à son contact (distance <= 1 case, cf. Carte.distanceCasesEntre) —
  // simplifié par rapport au texte d'origine (validé avec Thomas : plus de
  // bonus d'attaque, plus de condition "même cible"), pas de plafond
  // contrairement à bonusDefDuel (ici PLUSIEURS alliés adjacents cumulent).
  // Même garde-fou que bonusDefDuel : 0 sans Carte chargée, hors combat sur
  // grille, ou si le perso n'a pas (encore) de jeton posé.
  bonusDefPhalange() {
    if (!(this.classe === "guerrier" && this.estChoisie("Voie du soldat", 2))) return 0;
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeTokensJoueursCombat || !Carte.distanceCasesEntre) return 0;
    const monToken = Carte.tokenIdPourPerso(this.id);
    if (!monToken) return 0;
    const adjacents = (Carte.listeTokensJoueursCombat() || []).filter((t) => {
      if (t.id === monToken) return false;
      const d = Carte.distanceCasesEntre(monToken, t.id);
      return d !== null && d <= 1;
    });
    return adjacents.length;
  }

  // Don Expert du bouclier (simplifié par Thomas par rapport au texte
  // d'origine "+2 Réflexes ; réaction 1x/tour réduire de moitié des dégâts",
  // ni l'un ni l'autre trackés dans l'app) : +1 DEF si un bouclier est
  // équipé. Le second volet ("l'attaquant est désavantagé") n'est pas un
  // bonus de CE perso : cf. Personnage.aExpertBouclier(), lu directement par
  // _resoudreAttaqueMonstreVsPJ côté app.js pour forcer le désavantage sur le
  // jet de l'ATTAQUANT (monstre) — hors de portée de calculerCA().
  bonusDefBouclierExpert() {
    if (!(this.dons || []).includes("expert_bouclier")) return 0;
    return this._itemsEquipesUniques().some((it) => it.type === "bouclier") ? 1 : 0;
  }

  // A-t-il Expert du bouclier ET un bouclier réellement équipé ? Cf.
  // bonusDefBouclierExpert (gagne le +1 DEF ici) — cette méthode sert
  // uniquement à app.js pour savoir si l'ATTAQUANT de ce perso doit lancer en
  // désavantage (monstre vs PJ uniquement, cf. _resoudreAttaqueMonstreVsPJ ;
  // pas les capacités, dont le jet d'attaque ne passe pas par lancerTest).
  aExpertBouclier() {
    return (this.dons || []).includes("expert_bouclier") && this._itemsEquipesUniques().some((it) => it.type === "bouclier");
  }

  // Initiative = Mod. de DEX + bonus de capacités (ex. Barde/Moine ajoutant
  // Mod.INT ou Mod.SAG en plus de la DEX, cf. bonusInitiativeCapacites) +
  // bonus temporaires actifs (sorts/capacités, cf. bonusTemporaire).
  calculerInitiative() {
    return this.mod("DEX") + this.bonusInitiativeCapacites() + this.bonusInitiativeDons() + this.bonusInitiativeEquipement() + this.bonusInitiativeMutations() + this.bonusTemporaire("initiative");
  }
  bonusInitiativeCapacites() {
    let bonus = 0;
    // Barde — Voie de la rapière, rang 2 "Intelligence du combat" (passive) :
    // ajoute aussi le Mod. d'INT à l'Initiative (déjà appliqué à la DEF).
    if (this.classe === "barde" && this.estChoisie("Voie de la rapière", 2)) {
      bonus += this.mod("INT");
    }
    // Moine — Voie de l'élévation, rang 1 "Réflexes du sage" (passive) :
    // +Mod.SAG à l'Initiative, sans condition.
    if (this.classe === "moine" && this.estChoisie("Voie de l'élévation", 1)) {
      bonus += this.mod("SAG");
    }
    // Chevalier — Voie du noble, rang 1 "Prestance martiale" (passive) :
    // +Mod.CHA à l'Initiative, sans condition.
    if (this.classe === "chevalier" && this.estChoisie("Voie du noble", 1)) {
      bonus += this.mod("CHA");
    }
    // Chasseur — Voie de la traque, rang 4 "Sens du danger" (passive) : +2
    // Initiative. Gap corrigé : ce bonus était déclaré dans les données mais
    // jamais lu par aucune fonction (même famille de bug que Précision côté
    // Barde). "Ne peut pas être surpris" reste non modélisé (pas de mécanique
    // de surprise dans l'app).
    if (this.classe === "chasseur" && this.estChoisie("Voie de la traque", 4)) {
      bonus += 2;
    }
    // Enchanteur — Voie de l'historien, rang 3 "Pressentiment" (passive) :
    // même bonus fixe que Sens du danger ci-dessus (+2 Initiative). "Ne peut
    // pas être surpris" et l'indice du MJ 1x/combat restent non modélisés.
    if (this.classe === "enchanteur" && this.estChoisie("Voie de l'historien", 3)) {
      bonus += 2;
    }
    return bonus;
  }
  // Don Alerte : +5 Initiative. ("Ne peut jamais être surpris" reste descriptif,
  // aucune mécanique de surprise n'existe dans l'app.)
  bonusInitiativeDons() {
    return (this.dons || []).includes("alerte") ? 5 : 0;
  }

  // Seuil de critique pour un type d'attaque donné ("contact"/"distance"/
  // "magique") : 20 par défaut, abaissé par certaines capacités ou par
  // l'affixe de loot "Aiguisé" sur l'arme réellement utilisée pour ce type
  // (cf. js/affixes.js) — les deux sources se cumulent en gardant la
  // meilleure (la plus basse). "magique" n'a pas d'arme associée.
  critMinAttaque(type) {
    let seuil = 20;
    // Guerrier — Voie de l'élite, rang 3 "Précision létale" (passive) :
    // critique sur 19-20 au lieu de 20, uniquement sur les attaques au contact.
    if (type === "contact" && this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 3)) {
      seuil = 19;
    }
    // Chasseur — Voie de la gâchette, rang 5 "Tir fatal" (L, 1x/combat en
    // théorie) : critique sur 18-20 au lieu de 20 sur les attaques à distance.
    // Simplification : traité ici comme une capacité passive (toujours
    // active dès qu'acquise) — la limite "1x/combat" n'est pas mécanisée
    // (pas de compteur d'usage pour les attaques rapides, hors du système
    // usagesCapacites qui ne suit que les capacités lancées via
    // Capacites.lancer()). Le triplement des dégâts critiques (au lieu du
    // doublement standard), lui, EST mécanisé — cf. aTirFatal() ci-dessous,
    // lu par lancerFormule() côté app.js pour les dégâts à distance.
    if (type === "distance" && this.aTirFatal()) {
      seuil = Math.min(seuil, 18);
    }
    // Druide — Voie des compagnons, rang 5 "Forme animale" (choix "loup",
    // dex/crit) : critique sur 18-20 au lieu de 20, uniquement sur les
    // attaques au contact (crocs), tant que l'état temporaire 'forme_loup'
    // reste actif.
    if (type === "contact" && (this.etatsActifs || []).some((e) => e.idEtat === "forme_loup")) {
      seuil = Math.min(seuil, 18);
    }
    const arme = type === "contact" ? this.armeContactEquipee()
      : type === "distance" ? this.armeDistanceEquipee()
      : null;
    if (arme && arme.critMin) seuil = Math.min(seuil, arme.critMin);
    return seuil;
  }

  // A-t-il "Tir fatal" (Chasseur, Voie de la gâchette rang 5) ? Sert au
  // seuil de critique abaissé ci-dessus ET au triplement des dégâts
  // critiques à distance (cf. lancerFormule côté app.js).
  aTirFatal() {
    return this.classe === "chasseur" && this.estChoisie("Voie de la gâchette", 5);
  }

  // Bonus de DEF accordés par certaines capacités passives et permanentes.
  // Seules les capacités inconditionnelles (ou dont la condition est
  // mécaniquement vérifiable, ex. torse vide = pas d'armure physique) sont
  // automatisées ici. Celles qui demandent un choix du joueur (ex. "Mod.INT
  // OU Mod.SAG au choix") ou une condition non modélisée par l'app (terrain,
  // immobilité, présence d'un allié...) restent gérées à la table par le MJ.
  bonusDefCapacites() {
    let bonus = 0;
    // Druide — Voie de la nature, rang 2 "Terrain naturel" : texte d'origine
    // conditionné à un combat "en terrain difficile" (neige/boue/broussailles),
    // notion absente de l'app (pas de mécanique de terrain) — simplifié en
    // bonus permanent dès l'acquisition, comme la mutation "Reflet trouble"
    // (cf. data/mutations.js) ; à la table d'ignorer hors contexte adapté.
    // Volet attaque du même rang : cf. bonusAttaque().
    if (this.classe === "druide" && this.estChoisie("Voie de la nature", 2)) {
      bonus += 2;
    }
    // Druide — Voie du protecteur, rang 2 "Symbiose protectrice" (passive) :
    // texte d'origine conditionné à "se trouver en milieu naturel", même
    // simplification que Terrain naturel ci-dessus (bonus permanent).
    if (this.classe === "druide" && this.estChoisie("Voie du protecteur", 2)) {
      bonus += 2;
    }
    // Prêtre — Voie de la conversion, rang 1 "Vêtements sacrés" : +5 DEF tant
    // qu'aucune armure physique n'est portée. Seul un item de type "armure"
    // peut occuper le slot torse (cf. slotsPourType) : torse vide = pas d'armure.
    if (this.classe === "pretre" && this.estChoisie("Voie de la conversion", 1) && !this.equipement.torse) {
      bonus += 5;
    }
    // Prêtre — Cercle du Bannissement, rang 2 "Armure de foi" (passive) :
    // +1 CA permanent (partie chiffrable). Le +2 CA supplémentaire contre un
    // attaquant mort-vivant/démon reste hors schéma — le calcul de CA n'a
    // aucune connaissance de l'attaquant en cours au moment du jet.
    if (this.classe === "pretre" && this.estChoisie("Voie de l'exorcisme", 2)) {
      bonus += 1;
    }
    // Barde — Voie de la rapière, rang 2 "Intelligence du combat" (passive) :
    // ajoute le Mod. d'INT à la DEF, en plus du Mod. de DEX.
    if (this.classe === "barde" && this.estChoisie("Voie de la rapière", 2)) {
      bonus += this.mod("INT");
    }
    // Druide — Voie du chaos, rang 2 "Écorce corrompue" (passive) : +2 DEF naturelle permanente.
    if (this.classe === "druide" && this.estChoisie("Voie du chaos", 2)) {
      bonus += 2;
    }
    // Moine — Voie des poings, rang 3 : "le dé passe à 1d10, +2 DEF" (partie DEF).
    if (this.classe === "moine" && this.estChoisie("Voie des poings", 3)) {
      bonus += 2;
    }
    // Chevalier — Voie du chaos, rang 4 "Marque du serment brisé" (dès CA 5+,
    // même verrou qu'Enchanteur Réalité fracturée) : choix fixé à
    // l'acquisition entre +2 DEF permanent et +1d8 DM chaotique (cf.
    // CAPACITES_A_CHOIX côté app.js, bonusDegatsArmeChaos pour l'autre
    // choix) — seul "def" affecte la DEF. Manquait le verrou CA 5+ avant ce
    // correctif : la DEF s'appliquait dès l'acquisition du rang.
    if (this.classe === "chevalier" && (this.corruptionMajeure || 0) >= 5) {
      const cap = this.capaciteEntree("Voie du chaos", 4);
      if (cap && cap.choix === "def") bonus += 2;
    }
    // Moine — Voie de l'élévation, rang 2 "Défense du corps libre" (passive) :
    // +Mod.SAG à la CA tant qu'aucune armure (categorie moyenne/lourde) n'est équipée.
    if (this.classe === "moine" && this.estChoisie("Voie de l'élévation", 2)) {
      const armure = this._itemsEquipesUniques().find((it) => it.type === "armure");
      const sansArmureReelle = !armure || !armure.categorie || armure.categorie === "legere";
      if (sansArmureReelle) bonus += this.mod("SAG");
    }
    return bonus;
  }

  // Renvoie l'entrée de capacité (voie+rang) telle que stockée dans
  // this.capacites — utile pour lire un `choix` mémorisé à l'acquisition
  // (cf. CAPACITES_A_CHOIX côté app.js), au-delà du simple "est choisie ?".
  capaciteEntree(voieNom, rang) {
    return (this.capacites || []).find((c) => c.voie === voieNom && c.rang === rang) || null;
  }

  // A-t-il pris au moins un rang dans la "Voie du chaos" de sa classe
  // (voie.speciale === true, cf. data/donnees.js) ? Sert désormais UNIQUEMENT
  // à la ligne "Jauge de combat" du bloc Corruption (mécanique de classe
  // auto-incrémentée en combat) — la ligne "Corruption d'Âme" du même bloc
  // est, elle, générale à tous les PJ depuis le 28/07/2026 (cf.
  // htmlBlocCorruption côté app.js), le MJ pouvant l'ajuster narrativement
  // sans que le joueur ait pris cette voie.
  aVoieChaosActive() {
    const c = this.classeDef;
    if (!c) return false;
    return (this.capacites || []).some((cap) => {
      const voie = c.voies.find((v) => v.nom === cap.voie);
      return !!(voie && voie.speciale);
    });
  }

  // A-t-il pris "Image décalée" (Enchanteur, Voie de l'enchantement rang 1) ?
  // Sert à n'afficher le compteur de doubles illusoires actifs (fiche/mini-
  // fiche battlemap) qu'aux enchanteurs ayant réellement cette capacité.
  aImageDecalee() {
    return this.classe === "enchanteur" && !!this.capaciteEntree("Voie de l'enchantement", 1);
  }

  // A-t-il pris "Capture d'âme" (Nécromancien, Voie des âmes rang 2) ? Sert à
  // n'afficher le compteur d'âmes capturées (fiche/mini-fiche battlemap) qu'aux
  // nécromanciens ayant réellement cette capacité.
  aCaptureAme() {
    return this.classe === "necromancien" && !!this.capaciteEntree("Voie des âmes", 2);
  }

  // A-t-il le don Chanceux ? Sert à n'afficher le compteur de Chance
  // personnelle (fiche/mini-fiche battlemap) qu'aux joueurs l'ayant pris —
  // distinct de la Chance d'équipe (partagée, visible de tous, cf. htmlBlocChance
  // côté app.js), que ce don complète sans la remplacer.
  aChanceux() {
    return (this.dons || []).includes("chanceux");
  }

  // A-t-il Sentinelle ? Déclenche une attaque d'opportunité contre TOUTE
  // cible qui quitte son contact, même via un retrait organisé (donc jamais
  // évitable par la cible, contrairement à l'attaque d'opportunité "reçue"
  // du désengagement, cf. htmlBlocDesengagement). Sert de bouton
  // "Attaque d'opportunité" côté app.js — partagé avec aExpertHastQualifie
  // ci-dessous, le déclenchement/résolution étant identique (une attaque de
  // contact bonus contre un adversaire adjacent), seule la condition change.
  aSentinelle() {
    return (this.dons || []).includes("sentinelle");
  }

  // Don Expert en hast : arme deux_mains à allonge (lance, hallebarde,
  // pique, glaive de guerre) — liste d'ids explicite plutôt que déduite du
  // champ deuxMains, car le catalogue (data/loot.js) modélise la lance en
  // une main (categorieArme "longue"), alors que le texte du don la liste
  // aux côtés d'armes authentiquement deuxMains. Conditionne le +1 dégâts
  // (cf. dmgContact côté app.js, même schéma que Frappe puissante) ET
  // l'attaque d'opportunité bonus (cf. aSentinelle ci-dessus).
  aExpertHastQualifie() {
    if (!(this.dons || []).includes("expert_hast")) return false;
    const armesHast = ["lance", "hallebarde", "pique", "glaive_guerre"];
    const arme = this.armeContactEquipee();
    return !!(arme && armesHast.includes(arme.id));
  }

  // A-t-il le don Mobile ? +1 case de déplacement (cf. Combat._deplacementMax
  // côté combat.js) et jamais d'attaque d'opportunité en se désengageant
  // (cf. htmlBlocDesengagement côté app.js, qui saute le jet de Force et
  // déclare directement la réussite pour tout adversaire adjacent — simplifié
  // par Thomas par rapport au texte d'origine, qui limitait l'immunité à la
  // seule cible que le perso vient de frapper ce tour, non trackée ici).
  aMobile() {
    return (this.dons || []).includes("mobile");
  }

  // A-t-il le don Acteur ? Avantage (2d20, garde le plus haut, cf.
  // lancerTest/modeForce côté app.js) sur les tests de Bluff et Représentation
  // — correspondance avec "tromperie"/"imitation" du texte du don, qui ne
  // sont pas des compétences nommées dans COMPETENCES_PAR_CARAC.
  aActeur() {
    return (this.dons || []).includes("acteur");
  }

  // Barde — Voie du spectacle, rang 5 "Liberté d'action" (passive) :
  // immunité totale aux états 'immobilisee'/'entravee' — bloque leur
  // application (cf. resoudreEffet côté capacites.js et appliquerMalus côté
  // app.js, les deux seuls points où un état est poussé sur un PJ). "Voie du
  // spectacle" existe aussi côté Enchanteur (voie homonyme, contenu
  // différent) : le verrou classe === "barde" est donc nécessaire, pas
  // seulement défensif.
  aImmuniteEtat(idEtat) {
    if ((idEtat === "immobilisee" || idEtat === "entravee") && this.classe === "barde" && this.estChoisie("Voie du spectacle", 5)) return true;
    // Chevalier — Voie du chaos, rang 5 "Avatar du pacte" : immunité
    // temporaire à la Peur tant que l'état 'avatar_du_pacte' reste actif
    // (indépendante du choix de la Voie du commandant ci-dessus).
    if (idEtat === "effrayee" && this.classe === "chevalier" && (this.etatsActifs || []).some((e) => e.idEtat === "avatar_du_pacte")) return true;
    // "ancree" (demi_plaques)/"inebranlable" (bouclier_tour), palier
    // légendaire uniquement (cf. lot "repoussement") : immunité PERMANENTE
    // à "repoussee" — le palier rare ("1 fois par combat") aurait demandé de
    // dupliquer le double-contrôle (gate + usage 1x/combat) déjà écrit à
    // chaque site d'application d'état pour "Liberté d'action" ci-dessus,
    // disproportionné pour ce seul affixe : laissé en note/texte seul.
    if (this._itemsEquipesUniques().some((it) => (it.immuniteEtats || []).includes(idEtat))) return true;
    return false;
  }
  // A-t-il "Liberté d'action" (gate seule, sans le contrôle d'usage 1x/combat
  // qui reste côté capacites.js/app.js — même principe que aCoeurDeMontagne).
  aLiberteAction() {
    return this.classe === "barde" && this.estChoisie("Voie du spectacle", 5);
  }

  // Guerrier — Voie de l'élite, rang 2 "Endurance de fer" (passive) :
  // avantage automatique aux tests de CON contre la fatigue — lu par
  // lancerTest/modeForce côté app.js sur le bouton "Test de CON" brut (pas
  // de sous-catégorie "fatigue" distincte côté app, même simplification que
  // pour Acteur : avantage sur le test brut plutôt que sur un sous-cas
  // précis non trackable). Le +1 PV/niveau du même rang est mécanisé à part
  // dans bonusPvCapacites().
  aEnduranceDeFer() {
    return this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 2);
  }

  // Guerrier — Voie de l'élite, rang 4 "Force herculéenne" (désormais
  // passive, cf. data/donnees.js) : avantage automatique aux tests
  // d'Athlétisme — même mécanisme qu'Endurance de fer ci-dessus (rang 2,
  // même voie) sur le Test de CON, lu par le bouton compétence "Athlétisme"
  // côté app.js. Le bonus de dégâts (+1d4 aux attaques au contact) est
  // mécanisé séparément dans bonusDegatsForceHerculeenne ci-dessous.
  aForceHerculeenne() {
    return this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 4);
  }

  // Avantage automatique aux tests de résistance MENTALE (SAG) — regroupe 3
  // capacités au texte quasi identique : Chevalier "Verdict inébranlable"
  // (tromperie/illusion/manipulation), Moine "Vœu inébranlable" (corruption/
  // possession/manipulation), Moine "Esprit fendu" (Peur/Charme, dès CA 5+).
  // Comme pour Acteur/Endurance de fer, approximé par un avantage sur TOUT
  // test de SAG brut plutôt que sur la sous-catégorie précise (l'app n'a pas
  // de bouton "Test de Volonté vs Peur" distinct d'un "Test de SAG" — même
  // simplification assumée que pour les autres avantages automatiques).
  aAvantageResistanceMentale() {
    if (this.classe === "chevalier" && this.estChoisie("Voie du paladin (justicier)", 4)) return true;
    if (this.classe === "moine" && this.estChoisie("Voie de l'ascétisme", 4)) return true;
    if (this.classe === "moine" && this.estChoisie("Voie du chaos", 4) && (this.corruptionMajeure || 0) >= 5) return true;
    return false;
  }

  // Moine — Voie de l'ascétisme, rang 1 "Discipline du corps" (passive) : +2
  // à tous les tests de Volonté (SAG) contre la Peur et l'Intimidation.
  // N'était lu par aucune fonction (contrairement à aAvantageResistanceMentale
  // ci-dessus pour des capacités au texte presque identique) — approximé en
  // bonus additif sur TOUT test de SAG brut (même simplification de
  // sous-catégorie déjà assumée pour Endurance de fer/Acteur/Résistance
  // mentale), lu uniquement par les boutons [data-test], jamais par mod()
  // directement (pour ne pas fausser l'attaque magique du Moine, qui utilise
  // aussi SAG).
  bonusTestCaracCapacites(code) {
    if (code === "SAG" && this.classe === "moine" && this.estChoisie("Voie de l'ascétisme", 1)) return 2;
    return 0;
  }

  // Demi-Elfe — "Double Héritage" (rang racial 5, 1x/jour) : même principe,
  // sur Perception/Social(4 compétences CHA)/INT — cf. app.js.
  aDoubleHeritage() {
    return this.race === "demi_elfe" && this.estChoisieRace(5);
  }

  // Guerrier — Voie du chaos, rang 1 "Premier sang" (passif) : +1 point de
  // jauge de Corruption de Fureur par attaque ennemie réussie contre lui —
  // gate seule, le gain réel passe par subirDegats côté app.js (chaque appel
  // avec degatsBruts > 0 représente une attaque réussie dans le modèle de
  // l'app), via Capacites.ajusterCorruptionCombat comme le reste de la jauge.
  aPremierSangGuerrier() {
    return this.classe === "guerrier" && this.estChoisie("Voie du chaos", 1);
  }
  // Chasseur — Voie du chaos, rang 1 "Premier sang du prédateur" (passif) :
  // +1 point de jauge de Chaos par touche réussie à DISTANCE (les pièges ne
  // sont pas trackés par l'app, seule cette moitié du texte est mécanisable)
  // — gate seule, déclenché par _resoudreAttaqueRapide côté app.js.
  aPremierSangChasseur() {
    return this.classe === "chasseur" && this.estChoisie("Voie du chaos", 1);
  }

  // Nombre de paliers de mutation (cf. data/mutations.js, SEUILS_PALIERS_MUTATION)
  // atteints par la Corruption d'Âme actuelle — paliers 1 à 3 seulement (le
  // palier 4 "Rupture" n'a pas de table à tirer, traité à part par l'onglet
  // Mutations côté app.js). Sert à déterminer si une mutation reste à
  // générer : cf. genererMutation(), qui compare ce nombre à
  // (this.mutations || []).length.
  nombrePaliersMutationAtteints() {
    const ca = this.corruptionMajeure || 0;
    if (ca >= 7) return 3;
    if (ca >= 4) return 2;
    if (ca >= 1) return 1;
    return 0;
  }
  // La CA a-t-elle atteint le palier 4 "Rupture" (pas de table à tirer,
  // discussion joueur/MJ) ?
  aAtteintRupture() {
    return (this.corruptionMajeure || 0) >= 10;
  }

  /* ----- Équipement (slots) -----
     Seuls les items placés dans un slot comptent pour les stats de combat.
     inventaireListe (simple sac) n'a aucun effet mécanique. */

  // Emplacements compatibles avec le type d'un item (ou son slot explicite
  // si le catalogue le précise un jour, ex. une armure de jambes future).
  //
  // item.slot === null (sentinelle EXPLICITE, ex. les 6 instruments du
  // Musicien, data/loot.json) : jamais équipable, distinct d'un slot
  // simplement ABSENT (undefined), qui retombe sur le défaut par type
  // ci-dessous. "on ne les équipe pas, on les porte" (prompt_musicien_6_
  // metier.md §5) — resté un vœu jusqu'à ce bugfix : `if (item.slot)` est
  // faux pour null ET pour undefined, donc ces objets tombaient dans le
  // défaut "accessoire" (collier/bague/avant_bras) au lieu de rester
  // strictement inventaire.
  //
  // "botte" → "jambe" : alias de compat pour tout objet forgé (Forge du
  // MJ, SyncStore "loot:custom") créé avant la fusion des deux slots dans
  // SLOTS_EQUIPEMENT — "botte" n'existe plus comme case d'équipement, un
  // item qui le porterait encore resterait sinon équipable nulle part.
  // Même principe que la migration equipement.botte→jambe posée dans le
  // constructeur ci-dessus, appliquée ici à la DÉFINITION de l'objet.
  //
  // Arme à deux mains : PRIORITAIRE sur un slot explicite éventuel — occupe
  // toujours main_droite ET main_gauche (cf. equiper()), jamais un seul des
  // deux. Aucune arme du catalogue actuel n'a de champ slot (toutes
  // retombent sur le défaut par type ci-dessous), mais si l'une en avait un
  // jour un (Forge du MJ, faute de frappe...), un slot unique romprait
  // l'invariant "deux mains occupées ensemble" — même classe de bug que
  // botte/mains, blindée par anticipation plutôt qu'après coup.
  static slotsPourType(item) {
    if (!item) return [];
    if (item.slot === null) return [];
    if (item.type === "arme" && item.deuxMains) return ["main_droite", "main_gauche"];
    if (item.slot) return [item.slot === "botte" ? "jambe" : item.slot];
    switch (item.type) {
      case "arme": return ["main_droite", "main_gauche"];
      case "bouclier": return ["main_gauche"];
      case "armure": return ["torse"];
      case "accessoire": return ["collier", "bague", "avant_bras"];
      default: return []; // consommable, divers... jamais équipable
    }
  }

  // categoriePortee (cf. prompt_portees_armes.md) est la SOURCE DE VÉRITÉ —
  // "contact" ET "allonge" comptent comme mêlée (lance, hallebarde, pique,
  // glaive de guerre restent des armes de contact du point de vue de
  // l'équipement, malgré leurs 1-2 cases). Ancien test textuel sur le
  // préfixe "contact" du champ portee ABANDONNÉ : il cassait silencieusement
  // dès que portee devenait "1 case"/"1-2 cases" (texte normalisé). Un objet
  // sans categoriePortee (Forge du MJ, avant mise à jour de son formulaire)
  // se comporte comme contact par défaut, cf. prompt_portees_armes.md §3.4.
  static _estArmeContact(it) {
    if (!it || it.type !== "arme") return false;
    if (!it.categoriePortee) return true;
    return it.categoriePortee === "contact" || it.categoriePortee === "allonge";
  }
  static _estArmeContactCourte(it) { return Personnage._estArmeContact(it) && it.categorieArme === "courte"; }
  static _estArbaleteCourte(it) { return !!it && it.type === "arme" && it.portee !== "contact" && (it.id || "").startsWith("arbalete"); }
  static _estArcCourt(it) { return !!it && it.type === "arme" && it.portee !== "contact" && (it.id || "").startsWith("arc"); }
  // Combinaisons main_droite/main_gauche acceptées quand aucun des deux
  // objets n'est à deux mains (déjà géré séparément). Refonte du bi-arme
  // (décision de Thomas) : toute paire d'objets à une main est désormais
  // permise — y compris arme longue + arme longue, auparavant réservée au
  // don Maître d'armes doubles — la contrepartie n'étant plus une
  // interdiction mais un malus d'attaque (cf. malusCombatDeuxArmes) et un
  // pourcentage de dégâts réduit sur l'arme secondaire (cf.
  // pourcentageDegatsSecondaire).
  // Deux seules exclusions subsistent, faute d'une main libre pour
  // manœuvrer : deux armes à distance ensemble, et arme à distance +
  // bouclier.
  static _armesCompatiblesMainsCroisees(a, b) {
    if (!a || !b) return true; // main libre : toujours compatible
    if (a.deuxMains || b.deuxMains) return false;
    const estDistance = (it) => it.type === "arme" && !Personnage._estArmeContact(it);
    if (estDistance(a) && estDistance(b)) return false;
    if ((estDistance(a) && b.type === "bouclier") || (estDistance(b) && a.type === "bouclier")) return false;
    return true;
  }

  // Équipe item dans slot. Renvoie l'ancien occupant du slot (item ou null
  // s'il était vide), à remettre dans l'inventaire côté appelant — ou
  // `undefined` si la combinaison item/slot est invalide (rien n'est changé).
  equiper(slot, item) {
    if (!item || !this.equipement || !(slot in this.equipement)) return undefined;
    if (!Personnage.slotsPourType(item).includes(slot)) return undefined;

    if (item.type === "arme" && item.deuxMains) {
      // Occupe main_droite ET main_gauche à la fois : les deux doivent être
      // libres (ou déjà occupés par ce même item, en cas de ré-équipement).
      const droite = this.equipement.main_droite;
      const gauche = this.equipement.main_gauche;
      if ((droite && droite !== item) || (gauche && gauche !== item)) return undefined;
      const ancien = droite || gauche || null;
      this.equipement.main_droite = item;
      this.equipement.main_gauche = item;
      return ancien;
    }

    if (slot === "main_droite" || slot === "main_gauche") {
      const autreSlot = slot === "main_droite" ? "main_gauche" : "main_droite";
      const autre = this.equipement[autreSlot];
      if (autre && autre !== item && !Personnage._armesCompatiblesMainsCroisees(item, autre)) return undefined;
    }

    const ancien = this.equipement[slot];
    this.equipement[slot] = item;
    return ancien;
  }

  // Libère slot, renvoie l'item retiré (ou null si le slot était déjà vide).
  deséquiper(slot) {
    if (!this.equipement || !(slot in this.equipement)) return null;
    const item = this.equipement[slot];
    if (!item) return null;
    if (item.type === "arme" && item.deuxMains) {
      this.equipement.main_droite = null;
      this.equipement.main_gauche = null;
    } else {
      this.equipement[slot] = null;
    }
    return item;
  }

  // Objets équipés uniques (une arme à deux mains occupe 2 slots mais ne
  // doit compter qu'une fois dans les sommes ci-dessous).
  _itemsEquipesUniques() {
    const vus = new Set();
    const items = [];
    Object.values(this.equipement || {}).forEach((it) => {
      if (!it || vus.has(it)) return;
      vus.add(it);
      items.push(it);
    });
    return items;
  }
  reductionDegats() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.reductionDegats || 0), 0) + this.bonusReductionCapacites()
      + this.bonusTemporaire("reduction_degats");
  }
  // Affixes de rareté "renforcee" (cotte_mailles), "impenetrable"
  // (plaques_comp), "increvable" (armure_guerre_orque) — mêmes texte/valeurs
  // sur 3 armures différentes (cf. lot "armures A") : "réduit/ignore N points
  // de dégâts PHYSIQUES après application de reductionDegats" — champ dédié
  // (pas item.reductionDegats, qui réduit TOUS les types de dégâts déjà,
  // cf. subirDegats) puisque celui-ci ne s'applique qu'au physique, comme
  // bonusReductionLourdeDons ci-dessous.
  bonusReductionPhysiqueEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusReductionPhysique || 0), 0);
  }
  // Résistances élémentaires — "résistante" (armure_ecailles, type "feu" fixe)
  // et "renforcé"/"polyvalent" (anneau_resistance, type(s) choisi(s) par le
  // joueur à l'équipement, cf. js/app.js _resoudreChoixResistanceSiBesoin),
  // lot "armures C" cluster résistances : item.resistanceElementaire est un
  // tableau [{type, valeur}], sommé sur tous les objets équipés PUIS filtré
  // sur le type demandé — deux sources différentes (torse + bague) résistant
  // au même élément s'additionnent, contrairement à fractionReductionChute
  // (un seul torse possible) qui écrasait au lieu de sommer.
  reductionElementaireEquipement(typeElement) {
    return this._itemsEquipesUniques().reduce((t, it) => {
      const entree = (it.resistanceElementaire || []).find((r) => r.type === typeElement);
      return t + (entree ? entree.valeur : 0);
    }, 0);
  }
  // Affixes "imposante" (demi_plaques) et "glissante" (armure_ecailles), cf.
  // lot "armures B" : bonus de DEF conditionnel selon le TYPE d'attaque
  // subie — jamais dans calculerCA() (qui n'a aucune notion d'attaque en
  // cours), lus uniquement par _defPjAvecAura (js/app.js) au moment de
  // résoudre une attaque de monstre précise, jamais à l'affichage général
  // de la DEF.
  bonusDefContreDistance() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDefDistance || 0), 0);
  }
  bonusDefContreOpportunite() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDefOpportunite || 0), 0);
  }
  // Affixe de rareté "brutale" (armure_guerre_orque, cf. "Affixes phase 2" §A)
  // et "ecrasant" (ceinturon_colosse, cf. lot "armes A/B") : « +1d4/1d6 dégâts
  // avec armes de contact tant que l'objet est équipé ». Aucun champ
  // bonusDegats* existant ne porte de FORMULE de dé (ils sont tous des
  // entiers plats, cf. bonusDegatsMainsNues ci-dessus), d'où ce champ dédié
  // (item.bonusDegatsContact, une chaîne "NdM"). Concatène TOUS les objets
  // équipés qui en portent un (armure ET ceinturon simultanément, ex.) en un
  // seul terme de formule ("1d4+1d6") à ajouter à dmgContact côté app.js,
  // jamais un nombre — même principe que bonusDegatsFormuleEquipement mais
  // pour un dé littéral, pas une expression @variable évaluée. À l'origine
  // restreint aux armures (find, un seul item) — généralisé pour ne pas
  // perdre silencieusement l'une des deux sources en cas de cumul.
  bonusDegatsContactEquipement() {
    return this._itemsEquipesUniques().reduce((acc, it) => it.bonusDegatsContact ? (acc ? `${acc}+${it.bonusDegatsContact}` : it.bonusDegatsContact) : acc, "");
  }
  // "impenetrable" (collier_clarte, lot "armes/accessoires D") : lu par
  // modSauvegarde uniquement sur le jet de Volonté (SAG) — jamais dans un
  // calcul générique, même principe que bonusDegatsContactEquipement ci-dessus.
  bonusResistanceMentaleEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusResistanceMentale || 0), 0);
  }
  // "impassibles" (bracelets_defense, lot "armes/accessoires D") : "+X DEF
  // (sans armure/bouclier)" — conditionnel à l'ABSENCE d'armure ET de
  // bouclier équipés (contrairement à bonusDefDistance/bonusDefOpportunite,
  // conditionnels au TYPE d'attaque subie) : la condition est toujours vraie
  // ou fausse, jamais contextuelle à une attaque précise, donc lue
  // directement dans calculerCA() plutôt que via _defPjAvecAura.
  bonusDefSansArmureEquipement() {
    const aArmureOuBouclier = this._itemsEquipesUniques().some((it) => it.type === "armure" || it.type === "bouclier");
    if (aArmureOuBouclier) return 0;
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDefSansArmure || 0), 0);
  }
  // "standard"/"d'unité" (armure_garde_solvarn, lot "précédent armure_garde
  // _solvarn") : "+X DEF quand porté aux côtés d'un autre porteur de la MÊME
  // armure" — PREMIER cas où Personnage lit l'équipement d'un AUTRE
  // personnage (jusqu'ici toujours self-contained, cf. bonusDefDuel/
  // bonusDefPhalange qui ne lisent que des positions de jetons Carte, jamais
  // le contenu d'un autre perso) : Carte ne donne que la position/le ref du
  // jeton adjacent, pas son équipement — il faut App.chargerPersos() pour
  // résoudre la fiche brute de CET allié (même pattern déjà utilisé par
  // Combat/Capacites pour accéder à App, jamais par Personnage jusqu'ici).
  // Générique sur l'id de l'item porteur du champ (pas juste
  // "armure_garde_solvarn" en dur), pour rester réutilisable si un futur
  // objet porte la même mécanique.
  bonusDefArmureGroupeEquipement() {
    const monItem = this._itemsEquipesUniques().find((it) => it.bonusDefArmureGroupe);
    if (!monItem) return 0;
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeTokensJoueursCombat || !Carte.distanceCasesEntre) return 0;
    if (typeof App === "undefined" || !App.chargerPersos) return 0;
    const monToken = Carte.tokenIdPourPerso(this.id);
    if (!monToken) return 0;
    const persos = App.chargerPersos();
    const aUnAllieEquipe = (Carte.listeTokensJoueursCombat() || []).some((t) => {
      if (t.id === monToken || !t.ref || !t.ref.startsWith("pj-")) return false;
      const d = Carte.distanceCasesEntre(monToken, t.id);
      if (d === null || d > 1) return false;
      const autreP = persos[t.ref.slice(3)];
      if (!autreP || !autreP.equipement) return false;
      return Object.values(autreP.equipement).some((it) => it && it.id === monItem.id);
    });
    return aUnAllieEquipe ? monItem.bonusDefArmureGroupe : 0;
  }
  // Druide — Voie de la nature, rang 4 "Résistance naturelle" : réduction
  // égale à 2×rangMaxVoie contre les dégâts "naturels" (froid/chaleur/chute/
  // poison/animal — nouveau 3e type de dégâts au sélecteur "Subir des
  // dégâts" côté app.js, en plus de physique/magique). Verrou explicite
  // rangMaxVoie >= 4 : sans lui, un Druide n'ayant que les rangs 1-3 de la
  // voie (donc PAS encore Résistance naturelle) toucherait quand même
  // 2×rangMaxVoie au lieu de 0.
  reductionDegatsNaturels() {
    const rangMax = this.rangMaxVoie("Voie de la nature");
    return (this.classe === "druide" && rangMax >= 4) ? 2 * rangMax : 0;
  }
  // Affixe de rareté "robuste" (armure_cloute, cf. lot "armures C") :
  // "réduit de moitié/annule les dégâts de chute" — réduction FRACTIONNAIRE
  // (0.5/1), pas un entier plat comme les autres passifs de ce fichier,
  // appliquée uniquement sur typeDegats === "chute" (4e valeur du sélecteur
  // "Subir des dégâts", distincte de "naturel" — cf. son propre commentaire
  // ci-dessus). Un seul torse équipable à la fois : max() plutôt que somme,
  // pour ne jamais dépasser 1 (annulation totale) même en théorie.
  fractionReductionChuteEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => Math.max(t, it.fractionReductionChute || 0), 0);
  }
  // Affixe de rareté "tissée de sève" (robe_mage, légendaire uniquement,
  // cf. lot "armures C") : "régénère 1 PV par tour, même en combat" — le
  // palier rare ("hors combat") n'a aucun crochet de tour hors combat
  // nulle part dans l'app (js/repos.js ne gère que le repos long) et reste
  // une note manuelle non automatisée. Consommé par Combat.tourSuivant().
  regenCombatEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.regenCombat || 0), 0);
  }
  // Guerrier — Voie du peuple, rang 3 "Rempart" (passive, fréquence libre) :
  // réduit de 2 les dégâts subis "lorsqu'il protège activement un allié" —
  // condition non trackable automatiquement (qui protège qui n'est pas une
  // donnée de l'app), donc case à cocher manuelle sur le formulaire "Subir
  // des dégâts" (cf. subirDegats côté app.js), réutilisable à volonté (pas
  // de suivi d'usage, contrairement à Cœur de Montagne).
  aRempart() {
    return this.classe === "guerrier" && this.estChoisie("Voie du peuple", 3);
  }
  // Demi-Orc — "Résistance Instinctive" (rang racial 3) : réduit de 3 les
  // dégâts qui feraient passer sous la moitié des PV max — évalué sur
  // degatsNets (après les autres réductions), pas sur le montant brut. Lu
  // par subirDegats côté app.js, seul point d'application des dégâts à un PJ.
  reductionSeuilBasPv(degatsNets) {
    if (this.race === "demi_orc" && this.estChoisieRace(3) && (this.pvActuel - degatsNets) < this.pvMax / 2) {
      return Math.min(3, degatsNets);
    }
    return 0;
  }
  // A-t-il "Cœur de Montagne" (Nain, rang racial 5) ? Le contrôle d'usage
  // (1x/jour) se fait côté app.js sur l'objet perso brut via
  // Capacites.verifierUsage — pas ici, pour ne pas faire dépendre
  // Personnage de Capacites (sens inverse de la dépendance habituelle).
  aCoeurDeMontagne() {
    return this.race === "nain" && this.estChoisieRace(5);
  }
  // Nécromancien "Symbiose du chaos" / Magicien "Esprit fissuré" (Voie du
  // chaos rang 4, dès CA 5+) : choix fixé à l'acquisition entre +2 réduction
  // de dégâts et +1d6 DM à tous les sorts (cf. CAPACITES_A_CHOIX côté
  // app.js) — seul le choix "reduction" est géré ici, l'autre par
  // bonusDegatsSortsChaos(). Corrige un bug : cette méthode vérifiait
  // `classe === "druide"` (copié-collé d'un autre chantier) alors que le
  // rang 4 réel de la Voie du chaos du Druide est "Fléau rampant", sans
  // choix — un Druide qui prenait ce rang se voyait donc proposer à tort le
  // choix "Symbiose du chaos", et le Nécromancien (le vrai concerné)
  // n'avait ni modal ni bonus. Manquait aussi le verrou CA 5+ (comme pour
  // Enchanteur Réalité fracturée) : les deux classes pouvaient toucher le
  // bonus avant d'avoir atteint le seuil.
  bonusReductionCapacites() {
    let bonus = 0;
    if ((this.classe === "necromancien" || this.classe === "magicien") && (this.corruptionMajeure || 0) >= 5) {
      const cap = this.capaciteEntree("Voie du chaos", 4);
      if (cap && cap.choix === "reduction") bonus += 2;
    }
    return bonus;
  }
  // Fragment de formule de dégâts (ex. "1d6") à ajouter aux dégâts de TOUS
  // les sorts (capacités de type "degats") du Nécromancien/Magicien ayant
  // choisi "degats" à Symbiose du chaos/Esprit fissuré (dès CA 5+, cf.
  // bonusReductionCapacites pour l'autre choix) — lu par
  // Capacites.resoudreEffet côté js/capacites.js. null si non applicable.
  bonusDegatsSortsChaos() {
    const termes = [];
    if ((this.classe === "necromancien" || this.classe === "magicien") && (this.corruptionMajeure || 0) >= 5) {
      const cap = this.capaciteEntree("Voie du chaos", 4);
      if (cap && cap.choix === "degats") termes.push("1d6");
    }
    // Nécromancien "Avatar du chaos" / Magicien "Avatar du Vide" (Voie du
    // chaos rang 5) : +2d6 DM à tous les sorts tant que l'état temporaire
    // reste actif. Gap corrigé : cette méthode ne vérifiait jusqu'ici que le
    // choix permanent CA 5+ ci-dessus, jamais ce buff temporaire du rang 5 —
    // les deux peuvent se cumuler (rangs différents, indépendants).
    if ((this.etatsActifs || []).some((e) => e.idEtat === "avatar_du_chaos" || e.idEtat === "avatar_du_vide")) {
      termes.push("2d6");
    }
    return termes.length ? termes.join("+") : null;
  }
  // Nécromancien "Savoir volé" (Voie des âmes rang 4, passive) : +1 par âme
  // stockée (p.amesStockees, cf. Capacites.lancer — ameGain/ameCout) à un
  // Test d'INT au choix, plafonné à +3 (= le stock max de 3 âmes simultanées,
  // cf. Capture d'âme). Ressource propre au perso (auto-contenu, pas besoin
  // de lire d'autres personnages) — câblé dans app.js uniquement sur le
  // bouton "Test de INT" (les autres caracs n'en bénéficient pas).
  bonusSavoirVole() {
    if (this.classe !== "necromancien" || this.rangMaxVoie("Voie des âmes") < 4) return 0;
    return Math.min(this.amesStockees || 0, 3);
  }
  // Chevalier "Marque du serment brisé" (Voie du chaos rang 4, dès CA 5+),
  // choix "degats" : +1d8 DM chaotique sur l'arme de prédilection — lu par
  // app.js pour ajouter le terme à dmgContact (l'autre choix, "def", est
  // dans bonusDefCapacites). "Prédilection" = arme de contact équipée,
  // seule interprétation exploitable (pas de notion de "favorite" distincte
  // dans l'app).
  bonusDegatsArmeChaos() {
    if (this.classe === "chevalier" && (this.corruptionMajeure || 0) >= 5) {
      const cap = this.capaciteEntree("Voie du chaos", 4);
      if (cap && cap.choix === "degats") return "1d8";
    }
    return null;
  }
  // Guerrier — Voie de l'élite, rang 4 "Force herculéenne" (passive) : +1d4
  // DM permanent sur l'arme de contact, câblé aux mêmes 3 sites app.js que
  // bonusDegatsArmeChaos/Dechainement/ArmeEnchantee/AvatarPacte ci-dessous —
  // simple terme de dé supplémentaire ajouté à la formule de dégâts (le dé de
  // l'arme et ce d4 bonus sont lancés séparément puis fusionnés en un seul
  // résultat par lancerFormule, comme n'importe quel autre bonus de dégâts
  // "+NdF" de cette liste). Contrairement aux autres, pas d'état ni de choix
  // à vérifier : actif en permanence dès le rang acquis.
  bonusDegatsForceHerculeenne() {
    return this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 4) ? "1d4" : null;
  }
  // Guerrier — Voie du chaos, rang 5 "Déchaînement" : +2d6 DM à toutes les
  // attaques au contact tant que l'état 'dechainement' reste actif (posé par
  // Capacites.lancer/decompterEtatsDebutTour, cf. js/etats.js) — même canal
  // que bonusDegatsArmeChaos ci-dessus (câblé aux mêmes 3 sites app.js), mais
  // déclenché par un etatsActifs temporaire plutôt qu'un choix fixé à
  // l'acquisition (Déchaînement est une capacité limitée, pas un choix permanent).
  bonusDegatsDechainement() {
    if (this.classe === "guerrier" && (this.etatsActifs || []).some((e) => e.idEtat === "dechainement")) return "2d6";
    return null;
  }
  // Enchanteur — Voie de la transfiguration, rang 3 "Arme enchantée" (cible :
  // allié, pas nécessairement l'Enchanteur) : +1d6 DM magiques tant que
  // l'état 'arme_enchantee' reste actif sur LE BÉNÉFICIAIRE de cette
  // fonction — donc AUCUN verrou de classe ici, contrairement à
  // bonusDegatsArmeChaos/Dechainement (des buffs sur soi-même) : n'importe
  // quel allié équipé de l'arme visée peut porter cet état.
  bonusDegatsArmeEnchantee() {
    return (this.etatsActifs || []).some((e) => e.idEtat === "arme_enchantee") ? "1d6" : null;
  }
  // Enchanteur — Voie de l'enchantement, rang 5 "Illusion vivante" : +1d6
  // dégâts magiques par illusion liée encore vivante (jusqu'à 2, cf.
  // catalogue INVOCATIONS "illusion_liee_enchanteur") — dépend d'un jeton
  // posé sur la carte (invocateur/invocationId/pvActuel), pas d'un état sur
  // this, même schéma dépendance-Carte que bonusDefDuel/bonusDefPhalange
  // ci-dessus : 0 sans Carte chargée ou hors combat sur grille.
  bonusDegatsMagiquesIllusionsLiees() {
    if (this.classe !== "enchanteur") return 0;
    if (typeof Carte === "undefined" || !Carte.listeMonstresCombat) return 0;
    const nbVivantes = (Carte.listeMonstresCombat() || []).filter((m) =>
      m.invocateur === this.id && m.invocationId === "illusion_liee_enchanteur" && (m.pvActuel || 0) > 0
    ).length;
    return nbVivantes; // nombre de d6 à ajouter, résolu comme `${n}d6` par l'appelant
  }
  // Chevalier — Voie du chaos, rang 5 "Avatar du pacte" : +2d6 DM à toutes
  // les attaques au contact tant que l'état 'avatar_du_pacte' reste actif —
  // même canal que bonusDegatsDechainement (câblé aux mêmes 3 sites app.js).
  bonusDegatsAvatarPacte() {
    if (this.classe === "chevalier" && (this.etatsActifs || []).some((e) => e.idEtat === "avatar_du_pacte")) return "2d6";
    return null;
  }
  // Prêtre — Cercle de la Foi, sort "Arme bénie" (rang 3, appris via
  // Grimoire) : +1 attaque et +2 DM au contact contre les créatures
  // maléfiques/mortes-vivantes, tant que l'état 'arme_benie' posé par
  // l'activation du sort reste actif — condition désormais l'état actif
  // plutôt que le simple rang de voie (cf. prompt_pretre_cercle_foi.md,
  // remplace l'ancienne bascule manuelle togglesDons.arme_benie).
  aArmeBenie() {
    return this.classe === "pretre" && (this.etatsActifs || []).some((e) => e.idEtat === "arme_benie");
  }
  // Don Maître des armures lourdes : -3 dégâts physiques subis, appliqué
  // AVANT reductionDegats (cf. subirDegats côté app.js — pas inclus dans
  // reductionDegats(), qui n'a pas connaissance du type de dégâts). Actif
  // uniquement avec une armure de catégorie lourde équipée (condition basée
  // sur la catégorie plutôt que sur un seuil de valeurArmure, cf. §5 de la
  // référence CA/armures).
  bonusReductionLourdeDons() {
    const armure = this._itemsEquipesUniques().find((it) => it.type === "armure");
    return (armure && armure.categorie === "lourde" && (this.dons || []).includes("maitre_armures_lourdes")) ? 3 : 0;
  }
  // Somme des formules de scaling des objets équipés visant `cible` (et, pour
  // carac/competence, la sous-clé `cle`) — cf. js/forge.js (champ `formules`)
  // et js/formule.js (évaluateur @variables). Un objet du catalogue classique
  // n'a pas de `formules` → contribue 0, aucun changement pour l'existant.
  bonusFormuleEquipement(cible, cle) {
    if (typeof Formule === "undefined") return 0;
    let t = 0;
    this._itemsEquipesUniques().forEach((it) => {
      (it.formules || []).forEach((f) => {
        if (!f || f.cible !== cible) return;
        if (cle != null && (f.competence || f.carac) !== cle) return;
        t += Formule.evaluer(f.expr, { perso: this }) || 0;
      });
    });
    // Arrondi ICI (unique point d'entrée pour les 5 cibles : degats, DEF,
    // carac, competence, initiative) — avant ce fix, seul degats arrondissait
    // (via bonusDegatsFormuleEquipement ci-dessous), les 4 autres cibles
    // pouvaient renvoyer un bonus fractionnaire si la formule ne contenait
    // pas explicitement floor()/round()/ceil(). Aucun changement de
    // comportement pour degats (déjà arrondi, au même endroit fonctionnellement).
    return Math.round(t);
  }
  // Bonus de dégâts dérivé d'une formule d'objet (ex. Épée « +dmg par or »),
  // ajouté à la formule de dégâts côté app.js (même canal que les autres
  // bonusDegats*).
  bonusDegatsFormuleEquipement() {
    return this.bonusFormuleEquipement("degats");
  }
  bonusDefEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDEF || 0), 0)
      + this.bonusFormuleEquipement("DEF");
  }
  // Bonus de caractéristique porté par un accessoire équipé (ex. Anneau de
  // force : { bonusCarac: { FOR: 1 } }, cf. data/loot.js/json) — lu
  // dynamiquement comme bonusCaracCapacites/bonusCaracDons ci-dessus, jamais
  // en mutant this.caracs. Seule une poignée d'accessoires "simples" (bonus
  // de carac fixe, sans condition) portent ce champ pour l'instant : le
  // reste du catalogue "accessoire" (résistances, immunités, relance 1x/jour,
  // bonus conditionnels...) reste un effet narratif/manuel, cf. leur `effet`
  // affiché en badge sur la fiche (badgeEffetItem côté app.js) mais non
  // chiffré — audit du 2026-07-18, à étendre au cas par cas.
  bonusCaracEquipement(code) {
    return this._itemsEquipesUniques().reduce((t, it) => t + ((it.bonusCarac && it.bonusCarac[code]) || 0), 0)
      + this.bonusFormuleEquipement("carac", code);
  }
  // Même principe que bonusCaracEquipement, pour les accessoires qui donnent
  // un bonus fixe à une compétence nommée (ex. Cape de camouflage :
  // { bonusCompetences: { "Discrétion": 1 } }) — lu par bonusCompetence().
  bonusCompetenceEquipement(nom) {
    return this._itemsEquipesUniques().reduce((t, it) => t + ((it.bonusCompetences && it.bonusCompetences[nom]) || 0), 0)
      + this.bonusFormuleEquipement("competence", nom);
  }
  // Bonus d'initiative porté par un accessoire équipé (ex. Bottes légères :
  // { bonusInitiative: 1 }) — lu par calculerInitiative().
  bonusInitiativeEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusInitiative || 0), 0)
      + this.bonusFormuleEquipement("initiative");
  }

  // Résout l'entrée CANONIQUE (avec caracDelta/competenceDelta/etc.) d'une
  // mutation stockée sur le perso, via palier+d6 dans TABLE_MUTATIONS —
  // jamais via les champs figés sur l'entrée du perso elle-même (qui ne
  // contient que { id, palier, d6, nom, effet, obtenueLe }, cf.
  // genererMutation côté app.js : il ne recopie PAS les champs de chiffrage).
  // Indispensable pour que le chiffrage s'applique rétroactivement aux
  // mutations déjà tirées avant son ajout, ET aux futures sans dépendre de
  // ce que genererMutation choisit de stocker. Renvoie null si la table
  // n'est pas chargée ou si le palier/d6 ne correspond à rien (mutation
  // d'un palier retiré/renommé depuis).
  static _entreeCanoniqueMutation(m) {
    if (typeof TABLE_MUTATIONS === "undefined") return null;
    const table = TABLE_MUTATIONS[m.palier];
    if (!table) return null;
    return table.mutations.find((x) => x.d6 === m.d6) || null;
  }
  // Bonus de caractéristique porté par une mutation de la Corruption d'Âme
  // (data/mutations.js: caracDelta, ex. Veines sombres { FOR: 1, CHA: -1 })
  // — même principe que bonusCaracEquipement/Capacites/Dons, lu dynamiquement
  // par mod(), jamais en mutant this.caracs. Cas particulier : "Troisième œil
  // (fermé)" n'a PAS de caracDelta.CHA dans les données (son malus est
  // conditionnel, "si pas de casque équipé") — testé nommément ici plutôt que
  // via un schéma générique de conditions, vu que c'est le seul cas de toute
  // la table (cf. note de chiffrage en tête de data/mutations.js).
  bonusCaracMutations(code) {
    let bonus = (this.mutations || []).reduce((t, m) => {
      const e = Personnage._entreeCanoniqueMutation(m);
      return t + ((e && e.caracDelta && e.caracDelta[code]) || 0);
    }, 0);
    if (code === "CHA" && (this.mutations || []).some((m) => m.nom === "Troisième œil (fermé)") && !this.equipement.tete) {
      bonus -= 2;
    }
    return bonus;
  }
  // Même principe que bonusCaracMutations, pour les mutations qui donnent un
  // bonus/malus fixe à une compétence nommée (data/mutations.js:
  // competenceDelta) — lu par bonusCompetence().
  bonusCompetenceMutations(nom) {
    return (this.mutations || []).reduce((t, m) => {
      const e = Personnage._entreeCanoniqueMutation(m);
      return t + ((e && e.competenceDelta && e.competenceDelta[nom]) || 0);
    }, 0);
  }
  // Bonus de DEF porté par une mutation (data/mutations.js: defDelta, ex.
  // Peau de pierre +2, Carapace fissurée +4) — lu par calculerCA().
  bonusDefMutations() {
    return (this.mutations || []).reduce((t, m) => {
      const e = Personnage._entreeCanoniqueMutation(m);
      return t + ((e && e.defDelta) || 0);
    }, 0);
  }
  // Bonus d'initiative porté par une mutation (data/mutations.js:
  // initiativeDelta, ex. Troisième œil (fermé) +2) — lu par calculerInitiative().
  bonusInitiativeMutations() {
    return (this.mutations || []).reduce((t, m) => {
      const e = Personnage._entreeCanoniqueMutation(m);
      return t + ((e && e.initiativeDelta) || 0);
    }, 0);
  }
  // Réduction de la valeur d'un gain de PV portée par une mutation
  // (data/mutations.js: soinsRecusDelta, ex. Sang noir -3) — lue par
  // Personnage.appliquerGainPv, même principe que le halving Corruption
  // persistante déjà appliqué là-bas. Négatif = réduction ; la somme est
  // ajoutée directement au montant (jamais en-dessous de 0, cf. appliquerGainPv).
  reductionSoinsMutations() {
    return (this.mutations || []).reduce((t, m) => {
      const e = Personnage._entreeCanoniqueMutation(m);
      return t + ((e && e.soinsRecusDelta) || 0);
    }, 0);
  }
  // Bonus de PV max porté par un accessoire équipé. Pour les objets à bonus
  // fixe, bonusPvMax est déjà posé côté catalogue. Pour un bonus aléatoire
  // (ex. Amulette de santé : bonusPvMaxDe: "1d4"), le jet est effectué une
  // seule fois, à la première mise en équipement de CETTE instance d'objet
  // (cf. App.equiperItem), qui fige le résultat dans bonusPvMax sur l'objet —
  // jamais relancé ensuite, y compris si l'objet est déséquipé puis rééquipé.
  bonusPvEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusPvMax || 0), 0);
  }
  // "main_droite" | "main_gauche" -> l'arme qui y est équipée, ou null.
  armeEquipee(main) {
    const it = this.equipement && this.equipement[main];
    return it && it.type === "arme" ? it : null;
  }
  // Arme à portée (arc, arbalète...) équipée dans une main, ou null. Sert à
  // n'afficher l'attaque à distance (battlemap) que si le perso a de quoi
  // la faire — une arme de "contact" (y compris à allonge, cf.
  // _estArmeContact) ne compte pas.
  armeDistanceEquipee() {
    for (const main of ["main_droite", "main_gauche"]) {
      const arme = this.armeEquipee(main);
      // francisque/fronde/javelot (categoriePortee "jet") entrent ici tout
      // seuls depuis la normalisation des portées (prompt_portees_armes.md) :
      // avant, la francisque restait classée "contact" par défaut et son
      // usage à distance (affixe "tournoyante") devait être détecté via un
      // second test dédié (ancien _estArmeContactJetable, qui piggy-backait
      // sur "porter porteeMaxCases" — signal devenu FAUX POSITIF pour
      // n'importe quelle arme de contact depuis que toutes en portent un).
      // Supprimé : plus rien à ajouter, categoriePortee suffit désormais.
      if (arme && arme.portee && !Personnage._estArmeContact(arme)) return arme;
    }
    return null;
  }
  // Arme de mêlée (portée "contact") équipée dans une main, ou null. Sert au
  // bouton de dégâts (battlemap) : la formule vient de l'arme réellement
  // équipée si le Moine en porte une (cf. degatsPoings pour le repli à mains
  // nues quand aucune arme n'est équipée). En bi-arme (mêlée + arme courte,
  // cf. Personnage._armesCompatiblesMainsCroisees), l'arme NON courte fait
  // référence comme "principale" (armeCourteSecondaire complète les dégâts) ;
  // en dague+dague, la première main trouvée sert de référence.
  armeContactEquipee() {
    const contacts = [this.armeEquipee("main_droite"), this.armeEquipee("main_gauche")]
      .filter((a) => Personnage._estArmeContact(a));
    if (!contacts.length) return null;
    return contacts.find((a) => a.categorieArme !== "courte") || contacts[0];
  }

  // Arme de contact tenue dans la main qui ne porte pas l'arme principale,
  // ou null (l'autre main porte un bouclier, une arme à distance, ou rien).
  // Depuis la refonte du bi-arme : n'importe quelle arme de contact à une
  // main convient (courte OU longue), le don Maître d'armes doubles n'est
  // plus une condition d'accès mais un multiplicateur de dégâts (cf.
  // pourcentageDegatsSecondaire). Sert à combiner les dégâts de contact
  // (cf. js/app.js).
  armeSecondaire() {
    const droite = this.armeEquipee("main_droite");
    const gauche = this.armeEquipee("main_gauche");
    const principale = this.armeContactEquipee();
    if (!principale) return null;
    const autre = principale === droite ? gauche : droite;
    if (!autre || autre === principale) return null;
    return Personnage._estArmeContact(autre) ? autre : null;
  }

  // Alias historique conservé le temps que tous les appelants migrent.
  armeCourteSecondaire() { return this.armeSecondaire(); }

  // Arme à deux mains actuellement équipée (contact OU distance), ou null —
  // sert de base au don Frappe puissante (contact) et Tir de précision
  // (distance) exigent chacun un type d'arme précis, cf. app.js pour le
  // détail ; ce booléen générique sert surtout à l'affichage.
  armeDeuxMainsEquipee() {
    const contact = this.armeContactEquipee();
    if (contact && contact.deuxMains) return contact;
    const distance = this.armeDistanceEquipee();
    if (distance && distance.deuxMains) return distance;
    return null;
  }

  // Combat à deux armes valide (cf. REGLES_GENERALES) : une arme de CONTACT à
  // une main dans chaque main, sans bouclier. Sert de base au malus d'attaque
  // de contact (cf. malusCombatDeuxArmes) — indépendant de la compatibilité
  // bi-arme déjà validée à l'équipement (_armesCompatiblesMainsCroisees), qui
  // autorise aussi mêlée+bouclier ou mêlée+arbalète courte (non concernés).
  // Exclut explicitement arc court + arme courte (une main tient une arme à
  // distance, ce n'est pas le combat à deux armes de mêlée).
  enCombatDeuxArmes() {
    const d = this.equipement && this.equipement.main_droite;
    const g = this.equipement && this.equipement.main_gauche;
    return !!(d && g && d !== g && Personnage._estArmeContact(d) && Personnage._estArmeContact(g) && !d.deuxMains && !g.deuxMains);
  }

  // Don Combattant en duel : condition d'équipement — une seule arme à une
  // main équipée, l'autre main strictement vide (donc ni bouclier ni seconde
  // arme, qui occuperaient cette main). Une arme deuxMains ne laisse aucune
  // main libre, donc exclue. Cf. bonusDefDuel pour la condition d'adjacence.
  armeUniqueMainLibre() {
    const d = this.equipement && this.equipement.main_droite;
    const g = this.equipement && this.equipement.main_gauche;
    const armeD = !!(d && d.type === "arme" && !d.deuxMains);
    const armeG = !!(g && g.type === "arme" && !g.deuxMains);
    return (armeD && !g) || (armeG && !d);
  }

  // Malus d'attaque du combat à deux armes, uniquement au contact.
  // Refonte (décision de Thomas) : deux armes COURTES ne subissent aucun
  // malus, quel que soit le don — c'est ce qui ouvre les builds bi-arme
  // légers (poignard/poignard, rapière + arme courte...) aux classes qui
  // n'ont pas de don à dépenser. Dès qu'une des deux armes n'est pas courte,
  // l'échelle historique s'applique : -4 par défaut, -2 avec Ambidextre,
  // 0 avec Maître d'armes doubles.
  malusCombatDeuxArmes(type) {
    if (type !== "contact" || !this.enCombatDeuxArmes()) return 0;
    const d = this.equipement && this.equipement.main_droite;
    const g = this.equipement && this.equipement.main_gauche;
    if (d && g && d.categorieArme === "courte" && g.categorieArme === "courte") return 0;
    const dons = this.dons || [];
    if (dons.includes("maitre_armes_doubles")) return 0;
    if (dons.includes("ambidextre")) return -2;
    return -4;
  }

  // Part des dégâts de l'arme secondaire réellement infligée en combat à
  // deux armes (décision de Thomas). S'applique à TOUT bi-arme, court comme
  // long : sans cela les deux dons n'auraient plus aucun effet sur les
  // combos courts, désormais exemptés de malus d'attaque.
  // L'assiette est celle de formuleDegats() côté js/app.js — dé de l'arme +
  // enchantement/rareté + affixe — le Mod.FOR n'y entre pas (il n'est compté
  // qu'une fois dans l'attaque).
  pourcentageDegatsSecondaire() {
    const dons = this.dons || [];
    if (dons.includes("maitre_armes_doubles")) return 100;
    if (dons.includes("ambidextre")) return 75;
    return 50;
  }

  // Dégâts à mains nues du Moine (Voie des poings), résolus en formule
  // directement lançable (Mod.FOR remplacé par sa valeur numérique) — null si
  // la classe n'est pas Moine ou si la voie n'est pas acquise. Le dé progresse
  // et REMPLACE (ne s'additionne pas) d'un rang à l'autre : seul le rang le
  // plus élevé acquis (rangMaxVoie) fait foi, cf. data/donnees.js rangs 1-5.
  degatsPoings() {
    if (this.classe !== "moine") return null;
    const rangMax = this.rangMaxVoie("Voie des poings");
    if (!rangMax) return null;
    const voie = this.classeDef && this.classeDef.voies.find((v) => v.nom === "Voie des poings");
    const rg = voie && voie.rangs.find((r) => r.rang === rangMax);
    const effet = rg && rg.mecanique.effets.find((e) => e.type === "degats");
    if (!effet) return null;
    let formule = effet.formule.replace(/([+-])Mod\.([A-Za-z]+)/gi, (_, signe, code) => {
      const v = (signe === "-" ? -1 : 1) * this.mod(code.toUpperCase());
      return v >= 0 ? "+" + v : String(v);
    });
    // Bonus fixe porté par un accessoire équipé (ex. Gants du Poing :
    // { bonusDegatsMainsNues: 1 }, cf. data/loot.js/json) — item déjà en jeu
    // mais jamais réellement appliqué avant ce commit (aucune lecture
    // d'équipement dans degatsPoings() jusqu'ici).
    const bonusGants = this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDegatsMainsNues || 0), 0);
    if (bonusGants) formule += "+" + bonusGants;
    return formule;
  }

  /* ----- Attaque ----- */
  // Bonus de progression selon l'archétype : martial +1 tous les 2 niv (aligné sur hybride),
  // lanceur +1 tous les 3 niv. La distinction Martial/Hybride se fait via dégâts/PV/voies,
  // pas via ce bonus.
  bonusProgression() {
    const arch = (typeof ARCHETYPE_CLASSE !== "undefined" && ARCHETYPE_CLASSE[this.classe]) || "martial";
    const div = (typeof DIVISEUR_ATTAQUE !== "undefined" && DIVISEUR_ATTAQUE[arch]) || 1;
    return Math.floor((this.niveau || 1) / div);
  }
  // Bonus d'attaque permanents accordés par certaines capacités — même
  // principe que bonusDefCapacites/bonusInitiativeCapacites ci-dessous.
  // Barde — Voie de la rapière, rang 1 "Précision" (passive) : +1 en attaque
  // avec une arme légère (dague, épée courte, rapière). Restriction "armes
  // légères uniquement" non modélisée (même simplification que Force
  // herculéenne pour les DM au contact) : appliqué à toute attaque de
  // contact, pas seulement aux trois armes citées.
  bonusAttaqueCapacites(type) {
    let bonus = 0;
    if (type === "contact" && this.classe === "barde" && this.estChoisie("Voie de la rapière", 1)) {
      bonus += 1;
    }
    // Druide — Voie de la nature, rang 2 "Terrain naturel" : volet attaque du
    // même rang que le +2 DEF (cf. bonusDefCapacites) — même simplification
    // (bonus permanent, condition de terrain non trackée), appliqué à tout
    // type d'attaque faute de restriction dans le texte source.
    if (this.classe === "druide" && this.estChoisie("Voie de la nature", 2)) {
      bonus += 2;
    }
    // Chasseur — Voie de la gâchette, rang 1 "Tir ajusté" (passive) : +1 en
    // attaque à distance. Même gap que Précision ci-dessus : déclaré dans les
    // données mais jamais lu par aucune fonction.
    if (type === "distance" && this.classe === "chasseur" && this.estChoisie("Voie de la gâchette", 1)) {
      bonus += 1;
    }
    // Enchanteur — Voie du chaos, rang 5 "Ascension chaotique" : +4 à tous
    // les jets d'attaque rapide (contact/distance/magique/lancer) tant que
    // l'état 'ascension_chaotique' reste actif.
    if ((this.etatsActifs || []).some((e) => e.idEtat === "ascension_chaotique")) {
      bonus += 4;
    }
    return bonus;
  }
  // type : "contact" (FOR), "distance" (DEX), "magique" (carac de magie de la classe), "lancer" (FOR, objet jeté)
  bonusAttaque(type) {
    const b = this.bonusProgression() + this.bonusTemporaire("attaque") + this.malusCombatDeuxArmes(type) + this.bonusAttaqueCapacites(type);
    // Malus de proficience d'armure (-3, cf. estArmureNonMaitrisee) : contact
    // et magique uniquement — l'attaque à distance garde son propre -2 (déjà
    // dans le malus DEX ci-dessous), pas de cumul entre les deux.
    const malusProficienceAttaque = (type === "contact" || type === "magique") && Personnage.estArmureNonMaitrisee(this) ? -3 : 0;
    // Malus d'arme non maîtrisée (-3, cf. estArmeNonMaitrisee) : porte sur
    // l'arme réellement en main, indépendant du malus d'armure ci-dessus —
    // les deux se cumulent volontairement (un magicien en armure lourde avec
    // une hallebarde est à -6).
    if (type === "contact") {
      const malusArme = Personnage.estArmeNonMaitrisee(this, this.armeContactEquipee()) ? -3 : 0;
      return b + this.mod("FOR") + malusProficienceAttaque + malusArme;
    }
    if (type === "distance") {
      // Bonus simple et mécanique d'un item équipé (ex. Gants du
      // Franc-Tireur : { bonusAttaqueDistance: 1 }, cf. data/loot.js/json)
      // — même convention que bonusGrimoire ci-dessous pour l'attaque
      // magique, jamais fusionné dans les caracs de base.
      const bonusGantsDistance = this._itemsEquipesUniques()
        .reduce((t, it) => t + (it.bonusAttaqueDistance || 0), 0);
      // Malus de proficience d'armure (-2, cf. estArmureNonMaitrisee).
      const malusProficience = Personnage.estArmureNonMaitrisee(this) ? -2 : 0;
      // Une arme de JET (fronde, javelot, francisque — cf. categoriePortee,
      // prompt_portees_armes.md) reste un jet de FORCE (comme "lancer"
      // ci-dessous), jamais de DEX — seule une vraie arme à distance (arc,
      // arbalète...) utilise DEX. Ancien test _estArmeContactJetable
      // (détection via "porte porteeMaxCases malgré être classée contact")
      // abandonné : categoriePortee encode directement cette distinction
      // maintenant, plus besoin de heuristique.
      const armeDist = this.armeDistanceEquipee();
      const modCarac = (armeDist && armeDist.categoriePortee === "jet") ? this.mod("FOR") : this.mod("DEX");
      // Malus d'arme non maîtrisée (-3, cf. estArmeNonMaitrisee).
      const malusArme = Personnage.estArmeNonMaitrisee(this, armeDist) ? -3 : 0;
      return b + modCarac + bonusGantsDistance + malusProficience + malusArme;
    }
    if (type === "lancer") return b + this.mod("FOR");
    if (type === "magique") {
      const cm = typeof CARAC_MAGIE !== "undefined" ? CARAC_MAGIE[this.classe] : null;
      if (!cm) return null;
      // Bonus simple et mécanique d'un item équipé (ex. Grimoire : +1 attaque
      // magique tant qu'il est équipé, quelle que soit sa rareté) — à la
      // différence des effets de rareté (purement descriptifs, cf.
      // effetRarete), ce bonus est câblé directement ici.
      const bonusGrimoire = this._itemsEquipesUniques()
        .reduce((t, it) => t + (it.bonusAttaqueMagique || 0), 0);
      return b + this.mod(cm) + bonusGrimoire + malusProficienceAttaque;
    }
    return b;
  }
  // Dégâts d'une attaque magique (jet de dés seul, pas de mod. de carac. ni
  // bonus d'objet) : 1d6 de base, 1d8 à partir du niveau 4, 1d10 à partir du
  // niveau 8. null si la classe n'a pas d'attaque magique (cf. bonusAttaque).
  degatsMagiques() {
    const cm = typeof CARAC_MAGIE !== "undefined" ? CARAC_MAGIE[this.classe] : null;
    if (!cm) return null;
    const niveau = this.niveau || 1;
    let base = niveau >= 8 ? "1d10" : niveau >= 4 ? "1d8" : "1d6";
    // Bonus fixe porté par un accessoire équipé (ex. Jambières d'Affinité
    // Arcanique : { bonusDegatsMagiques: 1 }, cf. data/loot.js/json) — même
    // convention que bonusCarac/bonusDEF, lu dynamiquement, jamais fusionné
    // dans les caracs de base.
    const bonusEquip = this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDegatsMagiques || 0), 0);
    if (bonusEquip) base += "+" + bonusEquip;
    return base;
  }

  /* ----- Dons (niveaux 4/8/12) ----- */
  // Nombre de Dons dus au niveau actuel : gratuits, indépendants des points de voie.
  static donsRequisPourNiveau(niveau) {
    let n = 0;
    if (niveau >= 4) n++;
    if (niveau >= 8) n++;
    if (niveau >= 12) n++;
    return n;
  }
  donsRequis() {
    return Personnage.donsRequisPourNiveau(this.niveau || 1);
  }
  donsManquants() {
    return Math.max(0, this.donsRequis() - (this.dons || []).length);
  }

  /* ----- Mort et stabilisation ----- */
  // 0 PV, jet de mort toujours en cours (ni stabilisé ni mort).
  estMourant() {
    return (this.pvActuel || 0) <= 0 && !this.etatMort;
  }
  estMort() {
    return !!this.etatMort;
  }

  /* ----- Points de capacité (voies) ----- */
  static coutRangVoie(rang) {
    return rang >= 3 ? 2 : 1; // rang 1-2 = 1 point, rang 3-5 = 2 points
  }
  pointsVoieTotal() {
    return 2 * (this.niveau || 1); // 2 au niveau 1, +2 par niveau
  }
  pointsVoieDepenses() {
    const coutRangs = (this.capacites || []).reduce((t, c) => t + Personnage.coutRangVoie(c.rang), 0);
    const coutDeblocages = (this.voiesHorsProfil || []).reduce((t, hp) => t + (hp.cout || 0), 0);
    return coutRangs + coutDeblocages;
  }
  pointsVoieRestants() {
    return Math.max(0, this.pointsVoieTotal() - this.pointsVoieDepenses());
  }

  /* ----- Voies / capacités ----- */
  estChoisie(voieNom, rang) {
    return (this.capacites || []).some((c) => c.voie === voieNom && c.rang === rang);
  }
  rangMaxVoie(voieNom) {
    const rangs = (this.capacites || []).filter((c) => c.voie === voieNom).map((c) => c.rang);
    return rangs.length ? Math.max(...rangs) : 0;
  }
  // École débloquée (cf. ECOLE_VERS_VOIE_DEBLOCAGE, data/donnees.js) : vrai
  // si le personnage a investi au moins le rang requis dans la Voie
  // "Initiation X" correspondante — native à sa classe OU acquise via
  // voiesHorsProfil, rangMaxVoie() ne fait aucune différence d'origine.
  // Une école absente de la table (pas encore de rang assigné) n'est
  // JAMAIS débloquée.
  ecoleDebloquee(ecole) {
    const cfg = (typeof ECOLE_VERS_VOIE_DEBLOCAGE !== "undefined") ? ECOLE_VERS_VOIE_DEBLOCAGE[ecole] : null;
    if (!cfg) return false;
    return this.rangMaxVoie(cfg.voie) >= cfg.rang;
  }
  // Variante de ecoleDebloquee() compatible avec les catégories composées
  // d'un sort (ex. "divination_transmutation", cf. 'detection_magie') :
  // débloqué dès qu'AU MOINS une des écoles listées l'est. À utiliser avec
  // le champ `categorie` d'une entrée SORTS_PAR_CLASSE plutôt qu'avec
  // ecoleDebloquee() directement (cf. Capacites.lancer et la liste
  // d'apprentissage du Grimoire, js/app.js).
  ecoleSortDebloquee(categorie) {
    if (!categorie) return false;
    return categorie.split("_").some((e) => this.ecoleDebloquee(e));
  }
  // Équivalents estChoisie/capaciteEntree pour la voie RACIALE (this.capacitesRace,
  // simple tableau de numéros de rang — contrairement aux voies de classe,
  // aucun objet {voie, rang} par entrée) : le choix éventuel (ex. Humain
  // "Ambition") est stocké à part, dans this.capacitesRaceChoix[rang], posé
  // côté app.js à l'acquisition (cf. RACE_CAPACITES_A_CHOIX).
  estChoisieRace(rang) {
    return (this.capacitesRace || []).includes(rang);
  }
  choixCapaciteRace(rang) {
    return (this.capacitesRaceChoix && this.capacitesRaceChoix[rang]) || null;
  }

  /* ----- Sérialisation (même forme que le localStorage actuel) ----- */
  versJSON() {
    const obj = {
      id: this.id,
      nom: this.nom,
      niveau: this.niveau,
      classe: this.classe,
      race: this.race,
      raceVariante: this.raceVariante,
      genre: this.genre,
      proprietaire: this.proprietaire,
      proprietaireNom: this.proprietaireNom,
      livres: this.livres,
      age: this.age,
      villeOrigine: this.villeOrigine,
      nationOrigine: this.nationOrigine,
      hobbies: this.hobbies,
      bio: this.bio,
      illustration: this.illustration,
      illusionsActives: this.illusionsActives,
      piecesOr: this.piecesOr,
      piecesArgent: this.piecesArgent,
      piecesBronze: this.piecesBronze,
      caracs: this.caracs,
      caracsLibres: this.caracsLibres,
      bonusCompetences: this.bonusCompetences,
      capacites: this.capacites,
      capacitesRace: this.capacitesRace,
      capacitesRaceChoix: this.capacitesRaceChoix,
      voiesHorsProfil: this.voiesHorsProfil,
      dons: this.dons,
      donsChoix: this.donsChoix,
      portrait: this.portrait,
      pvMax: this.pvMax,
      pvActuel: this.pvActuel,
      pvHistorique: this.pvHistorique,
      pvNiveauActuel: this.pvNiveauActuel,
      def: this.def,
      equipement: this.equipement,
      inventaireListe: this.inventaireListe,
      notes: this.notes,
      etatsActifs: this.etatsActifs,
      usagesCapacites: this.usagesCapacites,
      corruptionCombat: this.corruptionCombat,
      corruptionMajeure: this.corruptionMajeure,
      corruptionSeuilFranchi: this.corruptionSeuilFranchi,
      amesStockees: this.amesStockees,
      mortSucces: this.mortSucces,
      mortEchecs: this.mortEchecs,
      etatMort: this.etatMort,
      detteSoigneurActive: this.detteSoigneurActive,
      contratDemoniaquePenalite: this.contratDemoniaquePenalite,
      contratDemoniaqueUtilise: this.contratDemoniaqueUtilise,
      anneauChanceCumuls: this.anneauChanceCumuls,
      pvTemporaires: this.pvTemporaires,
      pvTemporairesExpiration: this.pvTemporairesExpiration,
      mutations: this.mutations,
      // Bug trouvé lors de l'audit post-chantier Prêtre (cf. prompt de
      // vérification) : ces champs manquaient ici, alors que 4 sites app.js
      // (equiperItem/desequiperItem/ajouterItemInventaire/jeterItem) font
      // TOUS un aller-retour Personnage.depuisJSON(p).versJSON() avant de
      // sauver — sans ces lignes, équiper ou ramasser un simple objet
      // effaçait silencieusement les sorts de Grimoire appris ainsi que le
      // Cercle de spécialisation et les 4 pools de Points de Cercle du
      // Prêtre au prochain aller-retour.
      grimoireSortsConnus: this.grimoireSortsConnus,
      grimoireSortsPrepares: this.grimoireSortsPrepares,
      grimoireRattrapageFait: this.grimoireRattrapageFait,
      grimoirePreparationDisponible: this.grimoirePreparationDisponible,
      cercleSpecialisation: this.cercleSpecialisation,
      pointsBenediction: this.pointsBenediction,
      pointsConviction: this.pointsConviction,
      pointsBannissement: this.pointsBannissement,
      pointsJugement: this.pointsJugement,
    };
    // Firestore refuse un champ explicitement à `undefined` dans .set() et
    // lève une exception SYNCHRONE — via DepotDistant.remplacerTout (qui
    // sauve TOUS les personnages en un seul batch), ça bloque la sauvegarde
    // du batch entier, pas seulement de celui-ci. Une fiche créée avant
    // l'ajout d'un champ (ex. pvTemporairesExpiration/mutations, absents de
    // `d` à la construction) se retrouve avec `this.champ === undefined` :
    // filtré ici plutôt que de risquer une régression à chaque nouveau champ.
    Object.keys(obj).forEach((k) => { if (obj[k] === undefined) delete obj[k]; });
    return obj;
  }
  static depuisJSON(obj) {
    return new Personnage(obj || {});
  }

  // Point d'application UNIQUE de tout gain de PV (soin de sort, potion,
  // régénération/tick, ajustement MJ +PV...) — remplace la logique dupliquée
  // (clamp + halving Corruption persistante) qui existait indépendamment dans
  // js/capacites.js (appliquerSoinPersoLocal) et js/app.js (soigner). Ajouté
  // pour le Collier de la Dette du Soigneur (data/loot.json:
  // collier_dette_soigneur) : tant que pRaw.detteSoigneurActive est vrai, le
  // PROCHAIN gain de PV, quelle qu'en soit la source, est ramené à 0 et la
  // dette s'efface — cf. js/app.js lancerTest/soigner, js/capacites.js
  // resoudreEffet("soin")/decompterEtatsDebutTour pour les points d'appel.
  // opts.ignorerCorruption : conservé pour compat d'appel (cf. js/app.js
  // ajusterPv/definirPv) — ne fait plus rien depuis le retrait de "Corruption
  // persistante" (Prêtre, Voie du chaos rang 4, remplacée par "Corruption
  // motivante", cf. prompt_pretre_voie_chaos.md) : le halving des soins reçus
  // n'existe plus, aucune classe ne réduit plus ses soins de cette manière.
  static appliquerGainPv(pRaw, montantBrut, opts = {}) {
    const perso = Personnage.depuisJSON(pRaw);
    let montant = montantBrut;
    // Mutation "Sang noir" (data/mutations.js: soinsRecusDelta) : réduit la
    // valeur ajoutée aux PV, jamais en-dessous de 0 — appliquée sur tout gain
    // positif, avant la dette du Soigneur (qui, elle, ramène à 0 sans notion
    // de "réduit" partiel).
    if (montant > 0) montant = Math.max(0, montant + perso.reductionSoinsMutations());
    let detteAnnulee = false;
    if (pRaw.detteSoigneurActive && montant > 0) {
      montant = 0;
      pRaw.detteSoigneurActive = false;
      detteAnnulee = true;
    }
    const avant = pRaw.pvActuel;
    pRaw.pvActuel = Math.max(0, Math.min(pRaw.pvMax, pRaw.pvActuel + montant));
    return { gain: pRaw.pvActuel - avant, reduit: montant < montantBrut && !detteAnnulee, detteAnnulee };
  }
}

if (typeof window !== "undefined") {
  window.Personnage = Personnage;
  window.SLOTS_EQUIPEMENT = SLOTS_EQUIPEMENT;
  window.GRIMOIRE_TIERS_PAR_RARETE = GRIMOIRE_TIERS_PAR_RARETE;
  window.GRIMOIRE_ORDRE_TIERS = GRIMOIRE_ORDRE_TIERS;
  window.GRIMOIRE_PLAFOND_TIER = GRIMOIRE_PLAFOND_TIER;
}
