/* ============================================================
   Formule — évaluateur de formules de scaling pour les objets.
   Une formule est un TEXTE mathématique + des variables @nom du
   jeu, ex. "floor(@player-coin / 100)" ou "12 * @player-coin / 100".

   Sécurité : seuls les noms du registre (REGISTRE) et un jeu
   restreint d'opérateurs/fonctions maths sont autorisés — toute
   formule contenant autre chose renvoie 0 (jamais d'eval sauvage).

   Utilisé par :
   - js/personnage.js (bonus DEF/carac/compétence/initiative/dégâts
     dérivés d'un objet équipé qui porte un champ `formules`) ;
   - js/forge.js (l'éditeur : liste des variables + aperçu).
   ============================================================ */

const Formule = (() => {
  "use strict";

  // Registre : @nom -> { label (pour la Forge), get(ctx) -> nombre }.
  // ctx = { perso } (et plus tard { cible, jet } pour les variables
  // contextuelles). Toute valeur manquante est traitée comme 0.
  function _pct(p) { const m = p && p.pvMax; return m ? Math.floor(((p.pvActuel || 0) / m) * 100) : 0; }
  const REGISTRE = {
    "player-coin":        { label: "Or",        get: (c) => c.perso ? (c.perso.piecesOr || 0) : 0 },
    "player-silver":      { label: "Argent",    get: (c) => c.perso ? (c.perso.piecesArgent || 0) : 0 },
    "player-bronze":      { label: "Bronze",    get: (c) => c.perso ? (c.perso.piecesBronze || 0) : 0 },
    "player-level":       { label: "Niveau",    get: (c) => c.perso ? (c.perso.niveau || 1) : 1 },
    "player-hp":          { label: "PV actuels", get: (c) => c.perso ? (c.perso.pvActuel || 0) : 0 },
    "player-hp-max":      { label: "PV max",    get: (c) => c.perso ? (c.perso.pvMax || 0) : 0 },
    "player-hp-percent":  { label: "PV %",      get: (c) => c.perso ? _pct(c.perso) : 0 },
    "player-corruption":  { label: "Corruption", get: (c) => c.perso ? (c.perso.corruptionCombat || 0) : 0 },
    "player-for":         { label: "FOR",       get: (c) => _carac(c, "FOR") },
    "player-dex":         { label: "DEX",       get: (c) => _carac(c, "DEX") },
    "player-con":         { label: "CON",       get: (c) => _carac(c, "CON") },
    "player-int":         { label: "INT",       get: (c) => _carac(c, "INT") },
    "player-sag":         { label: "SAG",       get: (c) => _carac(c, "SAG") },
    "player-cha":         { label: "CHA",       get: (c) => _carac(c, "CHA") },
    "player-mod-for":     { label: "Mod FOR",   get: (c) => _mod(c, "FOR") },
    "player-mod-dex":     { label: "Mod DEX",   get: (c) => _mod(c, "DEX") },
    "player-mod-con":     { label: "Mod CON",   get: (c) => _mod(c, "CON") },
    "player-mod-int":     { label: "Mod INT",   get: (c) => _mod(c, "INT") },
    "player-mod-sag":     { label: "Mod SAG",   get: (c) => _mod(c, "SAG") },
    "player-mod-cha":     { label: "Mod CHA",   get: (c) => _mod(c, "CHA") },
  };
  function _carac(c, code) { return (c.perso && c.perso.caracs && c.perso.caracs[code]) || 0; }
  function _mod(c, code) { return (c.perso && typeof c.perso.mod === "function") ? (c.perso.mod(code) || 0) : 0; }

  const FONCTIONS = ["floor", "ceil", "round", "min", "max", "abs"];

  // Liste [{ cle, label }] pour peupler les boutons « insérer variable ».
  function variablesDisponibles() {
    return Object.keys(REGISTRE).map((cle) => ({ cle, label: REGISTRE[cle].label }));
  }

  // Évalue une formule dans un contexte. Renvoie un nombre (0 si vide,
  // invalide, ou non finie). Ne lève jamais.
  function evaluer(formule, ctx) {
    if (!formule || typeof formule !== "string") return 0;
    ctx = ctx || {};
    // 1) remplace chaque @nom par sa valeur numérique (0 si inconnu)
    let expr = formule.replace(/@([a-z0-9-]+)/gi, (m, nom) => {
      const v = REGISTRE[nom.toLowerCase()];
      return "(" + (v ? (Number(v.get(ctx)) || 0) : 0) + ")";
    });
    // 2) validation stricte : retire les fonctions autorisées, puis n'accepte
    //    plus que chiffres, opérateurs, parenthèses, points, virgules, espaces.
    const sansFn = expr.replace(new RegExp("\\b(" + FONCTIONS.join("|") + ")\\b", "g"), "");
    if (!/^[-+*/%().,\s0-9]*$/.test(sansFn)) return 0;
    // 3) évalue avec seulement les fonctions maths injectées (pas de scope global)
    try {
      const f = new Function(...FONCTIONS, '"use strict"; return (' + expr + ");");
      const r = f(Math.floor, Math.ceil, Math.round, Math.min, Math.max, Math.abs);
      return Number.isFinite(r) ? r : 0;
    } catch (e) { return 0; }
  }

  // Vérifie qu'une formule est valide (pour l'aperçu de la Forge) : renvoie
  // { ok, valeurDemo } évaluée sur un contexte d'exemple.
  const CTX_DEMO = { perso: { piecesOr: 350, piecesArgent: 40, piecesBronze: 12, niveau: 3, pvActuel: 18, pvMax: 30, corruptionCombat: 2, caracs: { FOR: 14, DEX: 12, CON: 13, INT: 10, SAG: 11, CHA: 16 }, mod(code) { return Math.floor(((this.caracs[code] || 10) - 10) / 2); } } };
  function apercuDemo(formule) { return evaluer(formule, CTX_DEMO); }

  return { evaluer, variablesDisponibles, apercuDemo, CTX_DEMO };
})();
