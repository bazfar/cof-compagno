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
const SLOTS_EQUIPEMENT = ["tete", "torse", "jambe", "botte", "avant_bras", "main_droite", "main_gauche", "collier", "bague", "mains"];

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
        // État Mourant(e) (0 PV, cf. REGLES_GENERALES "Mort et stabilisation") :
        // compteurs du jet de mort en cours, remis à zéro à chaque franchissement
        // du seuil de 0 PV (cf. js/app.js _majEtatMourant). etatMort=true une
        // fois 3 échecs atteints — plus aucun jet de mort, tour définitivement
        // sauté (cf. Combat._estKO).
        mortSucces: 0,
        mortEchecs: 0,
        etatMort: false,
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
    this.equipement = d.equipement;
    this.inventaireListe = d.inventaireListe;
    this.notes = d.notes;
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
    // État Mourant(e) — cf. estMourant()/estMort() ci-dessous.
    this.mortSucces = d.mortSucces;
    this.mortEchecs = d.mortEchecs;
    this.etatMort = d.etatMort;

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
  mod(code) {
    return Entite.modCarac(this.caracs[code] + this.bonusCaracCapacites(code) + this.bonusCaracDons(code) + this.bonusTemporaire(code));
  }

  // Bonus permanent à une caractéristique de base, accordé par un choix fixé
  // à l'acquisition d'une capacité (ex. Guerrier — Spécimen d'élite : +1 FOR,
  // DEX ou CON au choix, cf. CAPACITES_A_CHOIX côté app.js). N'altère pas la
  // valeur affichée sur la fiche (this.caracs), seulement le modificateur
  // effectif utilisé pour tous les calculs (attaque, DEF, PV...).
  bonusCaracCapacites(code) {
    let bonus = 0;
    if (this.classe === "guerrier") {
      const cap = this.capaciteEntree("Voie de l'élite", 1);
      if (cap && cap.choix === code) bonus += 1;
    }
    // Enchanteur — Voie du chaos, rang 4 "Réalité fracturée" (passive, dès
    // Corruption d'Âme 5+) : -2 SAG permanent, contrepartie fixe (pas de
    // choix) tant que corruptionMajeure n'a pas atteint 5 — ne redescend
    // jamais en-dessous une fois franchi (corruptionMajeure ne diminue jamais).
    if (code === "SAG" && this.classe === "enchanteur" && this.estChoisie("Voie du chaos", 4) && (this.corruptionMajeure || 0) >= 5) {
      bonus -= 2;
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

    return bonus;
  }

  // Modificateur total pour un test de compétence : mod. de la carac porteuse
  // + bonusCompetence(nom) éventuel.
  modCompetence(nom, caracCode) {
    return this.mod(caracCode) + this.bonusCompetence(nom);
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
    return (this.pvHistorique || []).reduce((t, j) => t + (j.total || 0), this.pvNiveau1()) + this.bonusPvCapacites() + this.bonusPvDons();
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

  /* ----- Défense ----- */
  calculerDEF() {
    const dex = Math.min(this.mod("DEX"), this.plafondDex());
    return 10 + dex + this.bonusDefEquipement() + this.bonusDefCapacites() + this.bonusTemporaire("DEF") + this.bonusDefImmobile() + this.bonusDefDuel() + this.bonusDefBouclierExpert();
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

  // Don Expert du bouclier (simplifié par Thomas par rapport au texte
  // d'origine "+2 Réflexes ; réaction 1x/tour réduire de moitié des dégâts",
  // ni l'un ni l'autre trackés dans l'app) : +1 DEF si un bouclier est
  // équipé. Le second volet ("l'attaquant est désavantagé") n'est pas un
  // bonus de CE perso : cf. Personnage.aExpertBouclier(), lu directement par
  // _resoudreAttaqueMonstreVsPJ côté app.js pour forcer le désavantage sur le
  // jet de l'ATTAQUANT (monstre) — hors de portée de calculerDEF().
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

  // Plafond de bonus DEX à la DEF selon le poids de l'armure équipée (aucun
  // plafond si aucune armure ou armure légère, valeurArmure <= 2). Le champ
  // malusDEX du catalogue (data/loot.json) n'est volontairement pas lu ici :
  // superseded par ce plafond dérivé de valeurArmure (cf. commit) — laissé
  // en place sur les données pour ne rien casser, mais plus consulté.
  plafondDex() {
    const armure = this._itemsEquipesUniques().find((it) => it.type === "armure");
    const va = armure ? (armure.valeurArmure || 0) : 0;
    if (va >= 5) return this.plafondDexDons(0);
    if (va >= 3) return this.plafondDexDons(2);
    return Infinity; // pas d'armure ou armure légère : aucun plafond
  }
  // Don Maître des armures moyennes : relève le plafond des armures moyennes
  // (valeurArmure 3-4) de +2 à +3. Sans effet sur les armures lourdes (cf.
  // Maître des armures lourdes, qui ne touche pas au plafond DEX mais à la
  // réduction de dégâts physiques, cf. bonusReductionLourdeDons).
  plafondDexDons(plafondBase) {
    if (plafondBase === 2 && (this.dons || []).includes("maitre_armures_moyennes")) return 3;
    return plafondBase;
  }

  // Initiative = Mod. de DEX + bonus de capacités (ex. Barde/Moine ajoutant
  // Mod.INT ou Mod.SAG en plus de la DEX, cf. bonusInitiativeCapacites) +
  // bonus temporaires actifs (sorts/capacités, cf. bonusTemporaire).
  calculerInitiative() {
    return this.mod("DEX") + this.bonusInitiativeCapacites() + this.bonusInitiativeDons() + this.bonusTemporaire("initiative");
  }
  bonusInitiativeCapacites() {
    let bonus = 0;
    // Barde — Voie de la rapière, rang 2 "Intelligence du combat" (passive) :
    // ajoute aussi le Mod. d'INT à l'Initiative (déjà appliqué à la DEF).
    if (this.classe === "barde" && this.estChoisie("Voie de la rapière", 2)) {
      bonus += this.mod("INT");
    }
    // Moine — Voie de l'élévation, rang 2 : même choix (INT ou SAG) que pour la DEF.
    if (this.classe === "moine") {
      const cap = this.capaciteEntree("Voie de l'élévation", 2);
      if (cap && (cap.choix === "INT" || cap.choix === "SAG")) bonus += this.mod(cap.choix);
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
    // Moine — Voie de l'élévation, rang 1 "Bonus de précision" (passive) :
    // même seuil que Précision létale (19-20), fixé par Thomas car le texte
    // d'origine ("critiques facilités") n'en donnait pas — seulement aux
    // attaques au contact à mains nues ou au bâton (id catalogue "baton*",
    // cf. data/loot.js), pas avec une autre arme équipée.
    if (type === "contact" && this.classe === "moine" && this.estChoisie("Voie de l'élévation", 1)) {
      const armeContact = this.armeContactEquipee();
      const mainsNuesOuBaton = !armeContact || (armeContact.id || "").startsWith("baton");
      if (mainsNuesOuBaton) seuil = Math.min(seuil, 19);
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
    // Prêtre — Voie de la conversion, rang 1 "Vêtements sacrés" : +5 DEF tant
    // qu'aucune armure physique n'est portée. Seul un item de type "armure"
    // peut occuper le slot torse (cf. slotsPourType) : torse vide = pas d'armure.
    if (this.classe === "pretre" && this.estChoisie("Voie de la conversion", 1) && !this.equipement.torse) {
      bonus += 5;
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
    // Chevalier — Voie du noble, rang 2 : ajoute le Mod. de CHA à la DEF.
    if (this.classe === "chevalier" && this.estChoisie("Voie du noble", 2)) {
      bonus += this.mod("CHA");
    }
    // Moine — Voie des poings, rang 3 : "le dé passe à 1d10, +2 DEF" (partie DEF).
    if (this.classe === "moine" && this.estChoisie("Voie des poings", 3)) {
      bonus += 2;
    }
    // Chevalier — Voie du chaos, rang 4 "Marque du serment brisé" : choix fixé
    // à l'acquisition entre +2 DEF permanent et +1d8 DM chaotique (cf.
    // CAPACITES_A_CHOIX côté app.js) — seul le choix "def" affecte la DEF.
    if (this.classe === "chevalier") {
      const cap = this.capaciteEntree("Voie du chaos", 4);
      if (cap && cap.choix === "def") bonus += 2;
    }
    // Moine — Voie de l'élévation, rang 2 : ajoute au choix (fixé à
    // l'acquisition) le Mod. d'INT ou de SAG à l'Initiative et à la DEF.
    if (this.classe === "moine") {
      const cap = this.capaciteEntree("Voie de l'élévation", 2);
      if (cap && (cap.choix === "INT" || cap.choix === "SAG")) bonus += this.mod(cap.choix);
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
  // (voie.speciale === true, cf. data/donnees.js) ? Sert à n'afficher le bloc
  // Corruption sur la fiche qu'aux joueurs ayant opté pour cette mécanique
  // (proposée sur demande/accord MJ, jamais par défaut).
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

  /* ----- Équipement (slots) -----
     Seuls les items placés dans un slot comptent pour les stats de combat.
     inventaireListe (simple sac) n'a aucun effet mécanique. */

  // Emplacements compatibles avec le type d'un item (ou son slot explicite
  // si le catalogue le précise un jour, ex. une armure de jambes future).
  static slotsPourType(item) {
    if (!item) return [];
    if (item.slot) return [item.slot];
    switch (item.type) {
      case "arme": return ["main_droite", "main_gauche"];
      case "bouclier": return ["main_gauche"];
      case "armure": return ["torse"];
      case "accessoire": return ["collier", "bague", "avant_bras"];
      default: return []; // consommable, divers... jamais équipable
    }
  }

  // Combinaisons main_droite/main_gauche acceptées quand aucun des deux
  // objets n'est à deux mains (déjà géré séparément) : mêlée (courte ou
  // longue) + bouclier (historique) ; mêlée + arbalète courte ; mêlée +
  // arme courte (bi-arme) ; arc court + arme courte. Tout le reste (deux
  // armes à distance ensemble, arc court + bouclier ou + mêlée longue...)
  // reste hors du périmètre décrit par la table, donc refusé. Repose sur la
  // convention d'id du catalogue ("arc_*"/"arbalete_*") pour distinguer arc
  // court et arbalète courte, qui n'ont pas de champ dédié.
  // "contact" couvre aussi les armes d'allonge dont la portée précise une
  // extension ("contact +1 case", "contact étendu", "contact/lancer") —
  // toujours des armes de mêlée avant tout, cf. Expert en hast (lance,
  // hallebarde, pique, glaive de guerre) qui ne s'affichaient plus du tout
  // en armeContactEquipee() avec une comparaison stricte à "contact".
  static _estArmeContact(it) { return !!it && it.type === "arme" && typeof it.portee === "string" && it.portee.startsWith("contact"); }
  static _estArmeContactCourte(it) { return Personnage._estArmeContact(it) && it.categorieArme === "courte"; }
  static _estArbaleteCourte(it) { return !!it && it.type === "arme" && it.portee !== "contact" && (it.id || "").startsWith("arbalete"); }
  static _estArcCourt(it) { return !!it && it.type === "arme" && it.portee !== "contact" && (it.id || "").startsWith("arc"); }
  // `armeLongueAutorisee` (don Maître d'armes doubles) élargit la main
  // secondaire aux armes de contact "longue", en plus de "courte".
  static _armesCompatiblesMainsCroisees(a, b, armeLongueAutorisee) {
    if (!a || !b) return true; // main libre : toujours compatible
    if (a.deuxMains || b.deuxMains) return false;
    const estCourteOuAutorisee = (it) =>
      Personnage._estArmeContactCourte(it) || (armeLongueAutorisee && Personnage._estArmeContact(it) && it.categorieArme === "longue");
    const paire = (x, y) =>
      (Personnage._estArmeContact(x) && (y.type === "bouclier" || Personnage._estArbaleteCourte(y) || estCourteOuAutorisee(y))) ||
      (Personnage._estArcCourt(x) && estCourteOuAutorisee(y));
    return paire(a, b) || paire(b, a);
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
      const armeLongueAutorisee = (this.dons || []).includes("maitre_armes_doubles");
      if (autre && autre !== item && !Personnage._armesCompatiblesMainsCroisees(item, autre, armeLongueAutorisee)) return undefined;
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
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.valeurArmure || 0), 0) + this.bonusReductionCapacites();
  }
  // Druide — Voie du chaos, rang 4 "Symbiose du chaos" : choix fixé à
  // l'acquisition entre +2 réduction de dégâts et +1d6 DM à tous les sorts
  // (cf. CAPACITES_A_CHOIX côté app.js) — seul le choix "reduction" est
  // automatisable ici, l'autre étant un bonus au jet appliqué manuellement.
  bonusReductionCapacites() {
    let bonus = 0;
    if (this.classe === "druide") {
      const cap = this.capaciteEntree("Voie du chaos", 4);
      if (cap && cap.choix === "reduction") bonus += 2;
    }
    return bonus;
  }
  // Don Maître des armures lourdes : -3 dégâts physiques subis, appliqué
  // AVANT valeurArmure (cf. subirDegats côté app.js — pas inclus dans
  // reductionDegats(), qui n'a pas connaissance du type de dégâts). Actif
  // uniquement avec une armure valeurArmure >= 5 équipée.
  bonusReductionLourdeDons() {
    const armure = this._itemsEquipesUniques().find((it) => it.type === "armure");
    const va = armure ? (armure.valeurArmure || 0) : 0;
    return (va >= 5 && (this.dons || []).includes("maitre_armures_lourdes")) ? 3 : 0;
  }
  bonusDefEquipement() {
    return this._itemsEquipesUniques().reduce((t, it) => t + (it.bonusDEF || 0), 0);
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

  // Arme en main secondaire (bi-arme), si l'AUTRE main que celle de
  // armeContactEquipee() porte une arme de contact courte distincte — null
  // sinon (pas de bi-arme ; l'autre main porte un bouclier, une arbalète
  // courte, ou rien). Avec le don Maître d'armes doubles, une arme "longue"
  // en main secondaire compte aussi (cf. equiper/_armesCompatiblesMainsCroisees).
  // Sert à combiner les dégâts de contact (cf. app.js).
  armeCourteSecondaire() {
    const droite = this.armeEquipee("main_droite");
    const gauche = this.armeEquipee("main_gauche");
    const principale = this.armeContactEquipee();
    if (!principale) return null;
    const autre = principale === droite ? gauche : droite;
    if (!autre || autre === principale) return null;
    if (Personnage._estArmeContactCourte(autre)) return autre;
    if ((this.dons || []).includes("maitre_armes_doubles") && Personnage._estArmeContact(autre) && autre.categorieArme === "longue") return autre;
    return null;
  }

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

  // Malus/bonus d'attaque du combat à deux armes, uniquement au contact (la
  // règle de base est FOR-based, cf. REGLES_GENERALES) : -4 par défaut, -2
  // avec le don Ambidextre, 0 avec Maître d'armes doubles (qui inclut Ambidextre).
  malusCombatDeuxArmes(type) {
    if (type !== "contact" || !this.enCombatDeuxArmes()) return 0;
    const dons = this.dons || [];
    if (dons.includes("maitre_armes_doubles")) return 0;
    if (dons.includes("ambidextre")) return -2;
    return -4;
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
    return effet.formule.replace(/([+-])Mod\.([A-Za-z]+)/gi, (_, signe, code) => {
      const v = (signe === "-" ? -1 : 1) * this.mod(code.toUpperCase());
      return v >= 0 ? "+" + v : String(v);
    });
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
  // type : "contact" (FOR), "distance" (DEX), "magique" (carac de magie de la classe)
  bonusAttaque(type) {
    const b = this.bonusProgression() + this.bonusTemporaire("attaque") + this.malusCombatDeuxArmes(type);
    if (type === "contact") return b + this.mod("FOR");
    if (type === "distance") return b + this.mod("DEX");
    if (type === "magique") {
      const cm = typeof CARAC_MAGIE !== "undefined" ? CARAC_MAGIE[this.classe] : null;
      if (!cm) return null;
      // Bonus simple et mécanique d'un item équipé (ex. Grimoire : +1 attaque
      // magique tant qu'il est équipé, quelle que soit sa rareté) — à la
      // différence des effets de rareté (purement descriptifs, cf.
      // effetRarete), ce bonus est câblé directement ici.
      const bonusGrimoire = this._itemsEquipesUniques()
        .reduce((t, it) => t + (it.bonusAttaqueMagique || 0), 0);
      return b + this.mod(cm) + bonusGrimoire;
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
    if (niveau >= 8) return "1d10";
    if (niveau >= 4) return "1d8";
    return "1d6";
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
    return {
      id: this.id,
      nom: this.nom,
      niveau: this.niveau,
      classe: this.classe,
      race: this.race,
      raceVariante: this.raceVariante,
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
      mortSucces: this.mortSucces,
      mortEchecs: this.mortEchecs,
      etatMort: this.etatMort,
    };
  }
  static depuisJSON(obj) {
    return new Personnage(obj || {});
  }
}

if (typeof window !== "undefined") {
  window.Personnage = Personnage;
  window.SLOTS_EQUIPEMENT = SLOTS_EQUIPEMENT;
}
