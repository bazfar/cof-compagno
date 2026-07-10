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
const SLOTS_EQUIPEMENT = ["tete", "torse", "jambe", "botte", "avant_bras", "main_droite", "main_gauche", "collier", "bague"];

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
        capacites: [],
        capacitesRace: [],
        voiesHorsProfil: [],
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
    this.capacites = d.capacites;
    this.capacitesRace = d.capacitesRace;
    this.voiesHorsProfil = d.voiesHorsProfil;
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
    return Entite.modCarac(this.caracs[code] + this.bonusCaracCapacites(code));
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
    return bonus;
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
  // PV de base au niveau 1 = dé de vie max + Mod. CON (min 1)
  pvNiveau1() {
    return Math.max(1, this.facesDeVie() + this.mod("CON"));
  }
  // PV total = niveau 1 + somme des jets de niveau historisés + bonus de capacités
  pvCalcule() {
    return (this.pvHistorique || []).reduce((t, j) => t + (j.total || 0), this.pvNiveau1()) + this.bonusPvCapacites();
  }
  // Guerrier — Voie de l'élite, rang 2 "Endurance de fer" (passive) : +1 PV par niveau.
  bonusPvCapacites() {
    let bonus = 0;
    if (this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 2)) {
      bonus += this.niveau || 1;
    }
    return bonus;
  }

  // Somme des bonus temporaires actuellement actifs (sorts/capacités posés via
  // js/capacites.js — Bouclier arcanique, Faveur sombre, etc. — cf. etatsActifs)
  // pour une cible donnée ("DEF", "attaque", "initiative"). Distinct des bonus
  // permanents hardcodés ci-dessous (bonusDefCapacites, etc.), qui restent la
  // seule source pour les bonus fixés à l'acquisition d'une capacité (les
  // entrées "permanente" ne sont jamais poussées dans etatsActifs, cf.
  // Capacites.lancer). Les bonus "caracteristique" (cible non précisée par le
  // schéma de données) ne sont pas repris ici, cf. bonusCaracCapacites.
  bonusTemporaire(cible) {
    return (this.etatsActifs || []).reduce((total, e) => {
      if (e.bonus && e.bonus.cible === cible && typeof e.bonus.valeur === "number") return total + e.bonus.valeur;
      return total;
    }, 0);
  }

  /* ----- Défense ----- */
  calculerDEF() {
    return 10 + this.mod("DEX") + this.bonusDefEquipement() + this.bonusDefCapacites() + this.bonusTemporaire("DEF");
  }

  // Initiative = Mod. de DEX + bonus de capacités (ex. Barde/Moine ajoutant
  // Mod.INT ou Mod.SAG en plus de la DEX, cf. bonusInitiativeCapacites) +
  // bonus temporaires actifs (sorts/capacités, cf. bonusTemporaire).
  calculerInitiative() {
    return this.mod("DEX") + this.bonusInitiativeCapacites() + this.bonusTemporaire("initiative");
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

  // Seuil de critique pour un type d'attaque donné ("contact"/"distance"/
  // "magique") : 20 par défaut, abaissé par certaines capacités.
  critMinAttaque(type) {
    // Guerrier — Voie de l'élite, rang 3 "Précision létale" (passive) :
    // critique sur 19-20 au lieu de 20, uniquement sur les attaques au contact.
    if (type === "contact" && this.classe === "guerrier" && this.estChoisie("Voie de l'élite", 3)) {
      return 19;
    }
    return 20;
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

    if (item.type === "bouclier") {
      const occupant = this.equipement.main_droite || this.equipement.main_gauche;
      if (occupant && occupant.type === "arme" && occupant.deuxMains) return undefined;
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
  // la faire — une arme de "contact" ne compte pas.
  armeDistanceEquipee() {
    for (const main of ["main_droite", "main_gauche"]) {
      const arme = this.armeEquipee(main);
      if (arme && arme.portee && arme.portee !== "contact") return arme;
    }
    return null;
  }
  // Arme de mêlée (portée "contact") équipée dans une main, ou null. Sert au
  // bouton de dégâts (battlemap) : la formule vient de l'arme réellement
  // équipée, pas d'une valeur générique à mains nues.
  armeContactEquipee() {
    for (const main of ["main_droite", "main_gauche"]) {
      const arme = this.armeEquipee(main);
      if (arme && arme.portee === "contact") return arme;
    }
    return null;
  }

  /* ----- Attaque ----- */
  // Bonus de progression selon l'archétype : martial +1/niv, hybride +1/2 niv, lanceur +1/3 niv
  bonusProgression() {
    const arch = (typeof ARCHETYPE_CLASSE !== "undefined" && ARCHETYPE_CLASSE[this.classe]) || "martial";
    const div = (typeof DIVISEUR_ATTAQUE !== "undefined" && DIVISEUR_ATTAQUE[arch]) || 1;
    return Math.floor((this.niveau || 1) / div);
  }
  // type : "contact" (FOR), "distance" (DEX), "magique" (carac de magie de la classe)
  bonusAttaque(type) {
    const b = this.bonusProgression() + this.bonusTemporaire("attaque");
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
      capacites: this.capacites,
      capacitesRace: this.capacitesRace,
      voiesHorsProfil: this.voiesHorsProfil,
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
