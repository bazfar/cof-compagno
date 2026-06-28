/* ============================================================
   Personnage — instance de PJ (hérite d'Entité).
   Centralise les RÈGLES COF aujourd'hui éparpillées dans app.js :
   modificateurs, PV, DEF, bonus d'attaque, points de voie.
   Enveloppe la même structure de données que celle stockée
   en localStorage → adoption progressive possible.

   Dépend des globales de donnees.js :
   CLASSES, CARAC_MAGIE, ARCHETYPE_CLASSE, DIVISEUR_ATTAQUE.
   ============================================================ */

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
        inventaire: "",
        notes: "",
      },
      data
    );

    super({ nom: d.nom, pvMax: d.pvMax, pvActuel: d.pvActuel, def: d.def });

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
    this.inventaire = d.inventaire;
    this.notes = d.notes;
  }

  /* ----- Caractéristiques ----- */
  mod(code) {
    return Entite.modCarac(this.caracs[code]);
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
  // PV total = niveau 1 + somme des jets de niveau historisés
  pvCalcule() {
    return (this.pvHistorique || []).reduce((t, j) => t + (j.total || 0), this.pvNiveau1());
  }

  /* ----- Défense ----- */
  calculerDEF() {
    return 10 + this.mod("DEX");
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
    const b = this.bonusProgression();
    if (type === "contact") return b + this.mod("FOR");
    if (type === "distance") return b + this.mod("DEX");
    if (type === "magique") {
      const cm = typeof CARAC_MAGIE !== "undefined" ? CARAC_MAGIE[this.classe] : null;
      return cm ? b + this.mod(cm) : null;
    }
    return b;
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
      inventaire: this.inventaire,
      notes: this.notes,
    };
  }
  static depuisJSON(obj) {
    return new Personnage(obj || {});
  }
}

if (typeof window !== "undefined") window.Personnage = Personnage;
