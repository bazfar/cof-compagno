/* ============================================================
   Entité — socle commun de tout ce qui combat (PJ, PNJ, monstres, boss).
   Aucune dépendance. Sert de base à Personnage et Monstre.
   ============================================================ */

class Entite {
  /**
   * @param {object} o
   * @param {string} o.nom
   * @param {number} o.pvMax
   * @param {number|null} o.pvActuel  (null → plein)
   * @param {number} o.def
   * @param {number} o.atk  bonus d'attaque de base (surtout pour les monstres)
   */
  constructor({ nom = "", pvMax = 1, pvActuel = null, def = 10, atk = 0 } = {}) {
    this.nom = nom;
    this.pvMax = Math.max(1, pvMax | 0);
    this.pvActuel = pvActuel == null ? this.pvMax : pvActuel | 0;
    this.def = def | 0;
    this.atk = atk | 0;
  }

  // Modificateur de caractéristique façon d20 : (val - 10) / 2 arrondi à l'inférieur
  static modCarac(valeur) {
    return Math.floor((Number(valeur) - 10) / 2);
  }

  subirDegats(n) {
    this.pvActuel = Math.max(0, this.pvActuel - Math.max(0, n | 0));
    return this.pvActuel;
  }

  soigner(n) {
    this.pvActuel = Math.min(this.pvMax, this.pvActuel + Math.max(0, n | 0));
    return this.pvActuel;
  }

  estVivant() {
    return this.pvActuel > 0;
  }

  // Ratio de PV (0..1) — pratique pour les barres de vie
  ratioPv() {
    return this.pvMax > 0 ? Math.max(0, Math.min(1, this.pvActuel / this.pvMax)) : 0;
  }
}

// Disponible globalement (pas de build, scripts classiques)
if (typeof window !== "undefined") window.Entite = Entite;
