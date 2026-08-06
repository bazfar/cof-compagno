#!/usr/bin/env node
/* ============================================================
   Script de contrôle (jetable, non lié au build) — schéma du catalogue
   d'objets (data/loot.json). Même patron que tools/valider_mecaniques.js
   (VM Node, rapport, code de sortie) — cf. ce fichier pour le précédent.

   NOTE IMPORTANTE sur la liste blanche de champs ci-dessous
   (COMMUN/COMMUN_MULTI_TYPE/PAR_TYPE) : reference_schema_objets_validateur.md
   (censé être la source de vérité, cf. le prompt qui a lancé ce chantier)
   n'était pas disponible au moment d'écrire ce script. La liste a donc été
   dérivée EMPIRIQUEMENT du catalogue actuel (189 items, data/loot.json) et
   des champs lus dynamiquement par js/raretes.js/js/enchantement.js/
   js/affixes.js/js/materiaux.js — pas recopiée depuis la référence. À
   comparer/mettre à jour si ce document réapparaît, ou à chaque nouveau
   type de champ introduit par un futur item.

   Usage : node tools/valider_loot.js
   Sort avec le code 1 et un rapport si des problèmes sont trouvés,
   0 et un résumé sinon.

   Portée volontairement limitée (cf. référence §4) : structure et
   cohérence de clés uniquement — aucune validation "sémantique"
   (équilibrage, cohérence des valeurs). Pas d'intégration CI/pre-commit :
   script lancé manuellement par Thomas avant tout commit touchant
   data/loot.json.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.join(__dirname, "..");

// Charge un script global classique (pas de module.exports) dans un contexte
// vm dédié, puis expose ses `const` de haut niveau via globalThis — même
// utilitaire que tools/valider_mecaniques.js.
function chargerGlobals(fichiers, noms) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  let code = "";
  for (const f of fichiers) {
    code += fs.readFileSync(path.join(RACINE, f), "utf8") + "\n";
  }
  code += noms.map((n) => `globalThis.${n} = typeof ${n} !== "undefined" ? ${n} : undefined;`).join("\n");
  vm.runInContext(code, ctx);
  return ctx;
}

const ctx = chargerGlobals(["data/donnees.js"], ["COMPETENCES_PAR_CARAC", "SAUVEGARDES", "ORDRE_CLASSES"]);
const COMPETENCES_PAR_CARAC = ctx.COMPETENCES_PAR_CARAC;
const SAUVEGARDES = ctx.SAUVEGARDES;
const ORDRE_CLASSES = ctx.ORDRE_CLASSES;
if (!COMPETENCES_PAR_CARAC) { console.error("❌ COMPETENCES_PAR_CARAC introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }
if (!SAUVEGARDES) { console.error("❌ SAUVEGARDES introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }
if (!ORDRE_CLASSES) { console.error("❌ ORDRE_CLASSES introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }

const ctxEtats = chargerGlobals(["js/etats.js"], ["ETATS"]);
const ETATS = ctxEtats.ETATS;
if (!ETATS) { console.error("❌ ETATS introuvable (js/etats.js n'a pas chargé)."); process.exit(1); }
function etatExiste(id) {
  return Object.prototype.hasOwnProperty.call(ETATS, /^marquee_.+/.test(id || "") ? "marquee" : id);
}

// Grammaire de lancerFormule (js/app.js) : suite de termes ±NdM ou ±K —
// même règle que tools/valider_bestiaire.js.
const RE_FORMULE_TERME = /^[+-]?(\d*d\d+|\d+)$/;
function formuleValide(f) {
  if (typeof f !== "string" || !f) return false;
  const termes = f.match(/[+-]?[^+-]+/g) || [];
  return termes.length > 0 && termes.every((t) => RE_FORMULE_TERME.test(t));
}

// Valide un tableau effets[] (cf. "Mécaniser les affixes de rareté", schéma
// étendu de declencheurs[]) — partagé entre la validation de data/loot.json
// (declencheurs[].effets, objets forgés/catalogue) et celle de js/raretes.js
// (mecanique.rare/legendaire.effets, affixes de rareté). `signaler` reçoit
// déjà la clé de l'item, ce module ne fait que préfixer le message par
// effets[i].
// esquive/reductionDegats (cf. "parade"/"absorbant" etc., lot "subitAttaque :
// esquive/réduction") : esquive n'est jamais résolu par
// _resoudreEffetsDeclencheur (traité en amont du jet, cf. _resoudreAttaqueEtSuite)
// — reductionDegats non plus (traité en amont de subirDegats, cf.
// _reduireDegatsSubisSiDisponible) — mais les deux passent par le même
// vocabulaire effets[]/validerEffets pour rester validés au même endroit.
const TYPES_EFFET_VALIDES = ["degats", "dot", "soin", "bonus", "etat", "ignoreReduction", "critique", "special", "esquive", "reductionDegats", "reflechitSort", "intercepte", "relance", "annuleCritique", "porteeCourte"];
const CIBLES_BONUS_VALIDES = ["attaque", "DEF"];
const DUREE_MOTS_CLES_LOOT = ["prochainTour", "finCombat", "permanente"];
// cible: "attaquant" sur un effet degats/etat (cf. "Affixes phase 2" §C,
// épineuse/renvoyeur, et "Affixes phase 4", éblouissant) : seul cas où un
// effet vise l'inverse du porteur qui l'a déclenché. Absent = comportement
// historique (vise la cible du porteur).
const CIBLES_EFFET_INVERSE_VALIDES = ["attaquant"];
const TYPES_EFFET_CIBLE_INVERSE = ["degats", "etat"];
// evenement partagé entre declencheurs[] (data/loot.json) et mecanique{}
// (js/raretes.js) — subitContact ajouté en phase 2 (cf. §C).
// subitAttaque (cf. lot "subitAttaque : esquive/réduction") : contrairement
// aux autres évènements, jamais résolu par _resoudreEffetsDeclencheur — géré
// à part par _declencherAttaqueMonstreVsPJ/_repondreFenetreAttaque (avant le
// jet d'attaque), sur le même moteur combat:reaction que Contresort.
// sortLance (cf. lot "reflechissant/muraille") : même moteur combat:reaction,
// jamais résolu par _resoudreEffetsDeclencheur non plus — géré par
// _repondantsSortLance/_repondreFenetreReaction (js/app.js).
// relance (cf. "insistante"/"protectrice", Pierre de chance, lot "jour") :
// déclenché manuellement par le JOUEUR sur son propre dernier jet d20 (cf.
// dernierJetRelancable/_relancerDernierJet), pas par _resoudreEffetsDeclencheur.
// critiqueSubi (cf. "protectrice") : proc automatique dès qu'un jet
// d'attaque de monstre contre un PJ est critique, cf. _resoudreAttaqueEtSuite.
// jetArme (cf. "tournoyante", francisque, lot "malgré la limite") : gate
// l'usage (1x/combat au rare, illimité au légendaire, cf. absence de champ
// usage) du bouton "Distance" pour une arme de contact aussi jetable — vérifié
// par _itemLancerArmeDisponible (js/app.js), jamais par _resoudreEffetsDeclencheur.
const EVENEMENTS_DECLENCHEUR_VALIDES = ["touche", "rate", "critique", "subitContact", "subitAttaque", "sortLance", "relance", "critiqueSubi", "jetArme"];
// typeDegats sur un déclencheur "subitContact" (cf. "réfléchissante",
// cotte_runique — ne renvoie que les dégâts magiques subis).
const TYPES_DEGATS_DECLENCHEUR_VALIDES = ["physique", "magique"];
// porteeRequise sur un déclencheur "subitAttaque" (cf. "parade"/"reactifs" —
// esquive restreinte au contact ; absent = contact ET distance, cf.
// "insaisissable").
const PORTEE_REQUISE_DECLENCHEUR_VALIDES = ["contact", "distance"];
// condition sur un déclencheur/mecanique (cf. "Affixes phase 2" §B :
// sauvage/féroce = cibleSousMoitie, precise = cibleBlessee).
const CONDITIONS_VALIDES = ["cibleBlessee", "cibleSousMoitie"];
// usage.frequence sur un déclencheur/mecanique (cf. "éblouissant", Affixes
// phase 4 — "1/2 fois par combat") : même grammaire que
// Capacites.parserFrequence (js/capacites.js), ex. "1x/combat", "2x/jour".
const RE_USAGE_FREQUENCE = /^\d+x\/.+$/i;
function validerEffets(effets, signaler) {
  if (!Array.isArray(effets) || !effets.length) { signaler("effets[] absent ou vide."); return; }
  effets.forEach((e, i) => {
    const p = `effets[${i}]`;
    if (!e || !TYPES_EFFET_VALIDES.includes(e.type)) { signaler(`${p}.type invalide : ${JSON.stringify(e && e.type)}.`); return; }
    if (e.probabilite !== undefined && (typeof e.probabilite !== "number" || e.probabilite < 0 || e.probabilite > 1)) {
      signaler(`${p}.probabilite devrait être un nombre entre 0 et 1, reçu ${JSON.stringify(e.probabilite)}.`);
    }
    if (e.type === "degats" || e.type === "dot" || e.type === "soin") {
      if (!formuleValide(e.formule)) signaler(`${p}.formule "${e.formule}" rejetée par la grammaire de lancerFormule.`);
    }
    if (TYPES_EFFET_CIBLE_INVERSE.includes(e.type) && e.cible !== undefined && !CIBLES_EFFET_INVERSE_VALIDES.includes(e.cible)) {
      signaler(`${p}.cible invalide : "${e.cible}" (attendu : absent ou ${CIBLES_EFFET_INVERSE_VALIDES.join("|")}).`);
    }
    if (e.type === "dot" || e.type === "etat") {
      const duree = e.type === "dot" ? e.duree : e.duree;
      if (e.type === "dot" && !(Number.isInteger(duree) && duree >= 1)) signaler(`${p}.duree devrait être un entier ≥ 1, reçu ${JSON.stringify(duree)}.`);
      if (e.type === "etat") {
        if (!e.id || !etatExiste(e.id)) signaler(`${p}.id inconnu de js/etats.js : ${JSON.stringify(e.id)}.`);
        if (e.duree !== undefined && !DUREE_MOTS_CLES_LOOT.includes(e.duree) && !/^\d+$/.test(String(e.duree))) {
          signaler(`${p}.duree "${e.duree}" non résoluble (entier en tours, ou ${DUREE_MOTS_CLES_LOOT.join("|")}).`);
        }
      }
    }
    if (e.type === "bonus") {
      if (!CIBLES_BONUS_VALIDES.includes(e.cible)) signaler(`${p}.cible doit valoir "attaque" ou "DEF".`);
      if (!Number.isInteger(e.valeur)) signaler(`${p}.valeur devrait être un entier.`);
      if (e.duree !== undefined && !DUREE_MOTS_CLES_LOOT.includes(e.duree) && !/^\d+$/.test(String(e.duree))) {
        signaler(`${p}.duree "${e.duree}" non résoluble (entier en tours, ou ${DUREE_MOTS_CLES_LOOT.join("|")}).`);
      }
    }
    if (e.type === "ignoreReduction" && !(Number.isInteger(e.valeur) && e.valeur >= 1)) {
      signaler(`${p}.valeur devrait être un entier ≥ 1, reçu ${JSON.stringify(e.valeur)}.`);
    }
    if (e.type === "critique" && !(Number.isInteger(e.seuil) && e.seuil >= 2 && e.seuil <= 20)) {
      signaler(`${p}.seuil devrait être un entier entre 2 et 20, reçu ${JSON.stringify(e.seuil)}.`);
    }
    // esquive/reflechitSort/intercepte/annuleCritique/porteeCourte : pas de
    // paramètre, juste le type — la logique (annulation du jet, redirection
    // du plan vers le lanceur, redirection de la cible vers un allié,
    // downgrade du crit, disponibilité du jet à distance courte) est portée
    // par la fenêtre de réaction ou par app.js directement (subitAttaque/
    // sortLance/critiqueSubi/jetArme), pas par ces effets.
    if (e.type === "reductionDegats" && !(typeof e.fraction === "number" && e.fraction > 0 && e.fraction <= 1)) {
      signaler(`${p}.fraction devrait être un nombre entre 0 (exclu) et 1, reçu ${JSON.stringify(e.fraction)}.`);
    }
    // relance : garderMeilleur (optionnel, cf. "insistante" légendaire) doit
    // être un booléen quand présent — absent/false = relance standard
    // (nouveau résultat imposé, cf. _relancerDernierJet).
    if (e.type === "relance" && e.garderMeilleur !== undefined && typeof e.garderMeilleur !== "boolean") {
      signaler(`${p}.garderMeilleur devrait être un booléen, reçu ${JSON.stringify(e.garderMeilleur)}.`);
    }
    if (e.type === "special" && !e.note) signaler(`${p} : un effet special doit porter une note pour le MJ.`);
  });
}

const COMPETENCES_VALIDES = new Set(Object.values(COMPETENCES_PAR_CARAC).flat());
const CARACS_VALIDES = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"];
const SAUVEGARDES_VALIDES = Object.keys(SAUVEGARDES);
const CLASSES_VALIDES = ORDRE_CLASSES;

// mecanique[palier].passif (cf. "Affixes phase 2" §A) — même chemin que
// Personnage._itemsEquipesUniques() (bonusCarac/bonusCompetences/
// bonusInitiative), + bonusDegatsContact (exception "brutale", formule de dé
// plutôt qu'un entier plat).
function validerPassif(cle, prefix, passif) {
  if (!passif || typeof passif !== "object") { signalerAffixe(cle, `${prefix} devrait être un objet, reçu ${JSON.stringify(passif)}.`); return; }
  if (passif.bonusCarac && typeof passif.bonusCarac === "object") {
    Object.keys(passif.bonusCarac).forEach((c) => {
      if (!CARACS_VALIDES.includes(c)) signalerAffixe(cle, `${prefix}.bonusCarac référence une caractéristique inconnue : "${c}".`);
    });
  }
  if (passif.bonusCompetences && typeof passif.bonusCompetences === "object") {
    Object.keys(passif.bonusCompetences).forEach((c) => {
      if (!COMPETENCES_VALIDES.has(c)) signalerAffixe(cle, `${prefix}.bonusCompetences référence une compétence inconnue : "${c}".`);
    });
  }
  if (passif.bonusInitiative !== undefined && !Number.isInteger(passif.bonusInitiative)) {
    signalerAffixe(cle, `${prefix}.bonusInitiative devrait être un entier, reçu ${JSON.stringify(passif.bonusInitiative)}.`);
  }
  if (passif.bonusDegatsContact !== undefined && !formuleValide(passif.bonusDegatsContact)) {
    signalerAffixe(cle, `${prefix}.bonusDegatsContact "${passif.bonusDegatsContact}" rejeté par la grammaire de lancerFormule.`);
  }
  if (passif.bonusDEF !== undefined && !Number.isInteger(passif.bonusDEF)) {
    signalerAffixe(cle, `${prefix}.bonusDEF devrait être un entier, reçu ${JSON.stringify(passif.bonusDEF)}.`);
  }
  // porteeMaxCases/porteeMinCases (cf. "tournoyante", francisque) : mêmes
  // bornes qu'une arme à distance normale du catalogue (data/loot.json).
  if (passif.porteeMaxCases !== undefined && !(Number.isInteger(passif.porteeMaxCases) && passif.porteeMaxCases >= 1)) {
    signalerAffixe(cle, `${prefix}.porteeMaxCases devrait être un entier ≥ 1, reçu ${JSON.stringify(passif.porteeMaxCases)}.`);
  }
  if (passif.porteeMinCases !== undefined && !(Number.isInteger(passif.porteeMinCases) && passif.porteeMinCases >= 0)) {
    signalerAffixe(cle, `${prefix}.porteeMinCases devrait être un entier ≥ 0, reçu ${JSON.stringify(passif.porteeMinCases)}.`);
  }
}

// usage{frequence} sur un déclencheur (data/loot.json ou mecanique.rare/
// legendaire) — cf. "éblouissant", Affixes phase 4. Signaler générique (pas
// signalerAffixe en dur) : partagé entre les items du catalogue et les
// affixes de rareté, comme validerEffets ci-dessus.
function validerUsage(usage, signaler) {
  if (!usage || typeof usage !== "object") { signaler(`usage devrait être un objet, reçu ${JSON.stringify(usage)}.`); return; }
  if (typeof usage.frequence !== "string" || !RE_USAGE_FREQUENCE.test(usage.frequence)) {
    signaler(`usage.frequence "${usage.frequence}" ne correspond pas au format attendu (ex. "1x/combat").`);
  }
}

// mecanique[palier].bonusAttaqueConditionnel (cf. "Affixes phase 2" §B,
// precise) — bonus au jet d'attaque lu avant le jet, jamais un effet de
// déclencheur.
function validerBonusAttaqueConditionnel(cle, prefix, bac) {
  if (!bac || typeof bac !== "object") { signalerAffixe(cle, `${prefix} devrait être un objet, reçu ${JSON.stringify(bac)}.`); return; }
  if (!CONDITIONS_VALIDES.includes(bac.condition)) signalerAffixe(cle, `${prefix}.condition invalide : "${bac.condition}" (attendu : ${CONDITIONS_VALIDES.join("|")}).`);
  if (!Number.isInteger(bac.valeur)) signalerAffixe(cle, `${prefix}.valeur devrait être un entier, reçu ${JSON.stringify(bac.valeur)}.`);
}

// data/loot.json : source de vérité éditée à la main (data/loot.js en est
// une copie générée, chargée par l'app au runtime — cf. son propre
// commentaire d'en-tête "Généré depuis data/loot.json"). On valide la
// source, pas la copie.
const LOOT_PATH = path.join(RACINE, "data", "loot.json");
const lootRaw = JSON.parse(fs.readFileSync(LOOT_PATH, "utf8"));
const items = lootRaw.items;
if (!Array.isArray(items)) { console.error("❌ data/loot.json : champ `items` absent ou n'est pas un tableau."); process.exit(1); }

const TYPES_VALIDES = ["arme", "armure", "bouclier", "accessoire", "consommable"];
const CATEGORIES_ARMURE_VALIDES = ["legere", "moyenne", "lourde"];

// Champs autorisés sur TOUT item, quel que soit le type.
const COMMUN = ["id", "nom", "type", "porte", "description", "prixPo"];
// Champs valides sur plusieurs types sans être universels (cf. usage réel
// dans le catalogue et dans le code de résolution des raretés/effets).
const COMMUN_MULTI_TYPE = ["horsMarche", "effet", "rarete", "rareteNom", "rareteCouleur",
  // formules/declencheurs : mêmes champs data-driven que la Forge du MJ (cf.
  // js/forge.js, prompt_declencheurs_forge.md) — génériques par nature (pas
  // liés à un type d'objet précis), utilisables aussi bien sur un objet du
  // catalogue statique (ex. epee_cupidite) que sur un objet forgé.
  "formules", "declencheurs",
  // rariteFixe/sansModificateurRegional : lus par js/marche.js SANS jamais
  // vérifier item.type (cf. _peutAvoirRarete/calculerPrix) — la Forge du MJ
  // (js/forge.js:_construireItem) les pose d'ailleurs sur TOUT objet forgé,
  // quel que soit son type. Trouvé en implémentant le bouton "Exporter pour
  // le repo" (Étape 4, "Mécaniser les affixes de rareté") : un objet
  // arme/armure/bouclier forgé avec ces champs (le cas courant) était rejeté
  // par la liste blanche alors qu'il tourne très bien en jeu.
  "rariteFixe", "sansModificateurRegional"];
// Champs spécifiques à chaque type.
const PAR_TYPE = {
  arme: ["degats", "portee", "typedegats", "enchantement", "deuxMains", "categorieArme", "porteeMinCases", "porteeMaxCases", "rechargement", "degatsAuMoinsRare", "bonusAttaqueMagique", "bonusDegatsMagiques"],
  armure: ["valeurCA", "malusDEX", "categorie", "reductionDegats"],
  bouclier: ["bonusDEF", "categorieBouclier"],
  accessoire: ["slot", "bonusCarac", "bonusCompetences", "bonusInitiative", "bonusDEF", "bonusAttaqueMagique", "bonusAttaqueDistance", "bonusDegatsMagiques", "bonusDegatsMainsNues", "bonusPvMaxDe", "grimoireClasses"],
  consommable: ["quantite", "sortAppris", "dureeEtat", "formuleDot", "jetable"],
};
// Champs qui, s'ils sont présents, doivent être de type number — "degats"/
// "degatsAuMoinsRare"/"bonusPvMaxDe" en sont volontairement exclus (formule
// de dé du type "1d6"/"1d4", pas un nombre, malgré le nom).
const CHAMPS_NOMBRE_STRICT = [
  "prixPo", "enchantement", "porteeMinCases", "porteeMaxCases", "rechargement",
  "valeurCA", "malusDEX", "reductionDegats", "bonusDEF", "quantite",
  "bonusInitiative", "bonusAttaqueMagique", "bonusAttaqueDistance", "bonusDegatsMagiques", "bonusDegatsMainsNues",
];

const problemesParItem = new Map(); // id (ou index si id manquant) -> [messages]
function signaler(idOuIndex, message) {
  const cle = idOuIndex;
  if (!problemesParItem.has(cle)) problemesParItem.set(cle, []);
  problemesParItem.get(cle).push(message);
}

const idsVus = new Map(); // id -> nombre d'occurrences

items.forEach((it, index) => {
  const cle = it.id || `(index ${index}, sans id)`;

  // 1. type valide
  if (!TYPES_VALIDES.includes(it.type)) {
    signaler(cle, `type invalide : "${it.type}" (attendu : ${TYPES_VALIDES.join("|")}).`);
    return; // pas de vérif de champs par type sans type valide
  }

  // 2. aucun champ hors liste blanche
  const autorises = new Set([...COMMUN, ...COMMUN_MULTI_TYPE, ...(PAR_TYPE[it.type] || [])]);
  Object.keys(it).forEach((champ) => {
    if (!autorises.has(champ)) {
      signaler(cle, `champ "${champ}" non autorisé pour le type "${it.type}".`);
    }
  });

  // 3. bonusCompetences
  if (it.bonusCompetences && typeof it.bonusCompetences === "object") {
    Object.keys(it.bonusCompetences).forEach((comp) => {
      if (!COMPETENCES_VALIDES.has(comp)) {
        signaler(cle, `bonusCompetences référence une compétence inconnue : "${comp}".`);
      }
    });
  }

  // 4. bonusCarac
  if (it.bonusCarac && typeof it.bonusCarac === "object") {
    Object.keys(it.bonusCarac).forEach((carac) => {
      if (!CARACS_VALIDES.includes(carac)) {
        signaler(cle, `bonusCarac référence une caractéristique inconnue : "${carac}".`);
      }
    });
  }

  // 4bis. grimoireClasses (Grimoire v2, cf. prompt_grimoire_v2_emplacements_typ_s.md)
  if (it.grimoireClasses !== undefined) {
    if (!Array.isArray(it.grimoireClasses)) {
      signaler(cle, `grimoireClasses devrait être un tableau, reçu ${typeof it.grimoireClasses}.`);
    } else {
      it.grimoireClasses.forEach((c) => {
        if (!CLASSES_VALIDES.includes(c)) signaler(cle, `grimoireClasses référence une classe inconnue : "${c}".`);
      });
    }
  }

  // 5. bonusSauvegardes (aucun item actuel n'en porte, vérifié quand même si présent)
  if (it.bonusSauvegardes && typeof it.bonusSauvegardes === "object") {
    Object.keys(it.bonusSauvegardes).forEach((sauv) => {
      if (!SAUVEGARDES_VALIDES.includes(sauv)) {
        signaler(cle, `bonusSauvegardes référence une sauvegarde inconnue : "${sauv}" (attendu : ${SAUVEGARDES_VALIDES.join("|")}).`);
      }
    });
  }

  // 6. armure : valeurCA/malusDEX/categorie
  if (it.type === "armure") {
    if (typeof it.valeurCA !== "number") signaler(cle, `armure sans valeurCA numérique (reçu : ${JSON.stringify(it.valeurCA)}).`);
    if (typeof it.malusDEX !== "number") signaler(cle, `armure sans malusDEX numérique (reçu : ${JSON.stringify(it.malusDEX)}).`);
    if (!CATEGORIES_ARMURE_VALIDES.includes(it.categorie)) signaler(cle, `armure avec categorie invalide : "${it.categorie}" (attendu : ${CATEGORIES_ARMURE_VALIDES.join("|")}).`);
  }

  // 7. champs numériques attendus bien de type number
  CHAMPS_NOMBRE_STRICT.forEach((champ) => {
    if (it[champ] !== undefined && typeof it[champ] !== "number") {
      signaler(cle, `champ "${champ}" devrait être un nombre, reçu ${typeof it[champ]} (${JSON.stringify(it[champ])}).`);
    }
  });

  // 8. id unique — comptage, rapport après la boucle
  if (it.id) idsVus.set(it.id, (idsVus.get(it.id) || 0) + 1);
  else signaler(cle, "id manquant.");

  // 9. formules/declencheurs (cf. js/forge.js, même schéma que les objets
  // forgés — reproduit ici pour un item du catalogue statique).
  const CIBLES_FORMULE_VALIDES = ["degats", "DEF", "initiative", "carac", "competence"];
  (it.formules || []).forEach((f, i) => {
    if (!f || typeof f.expr !== "string" || !f.expr) signaler(cle, `formules[${i}] sans expr valide.`);
    if (!f || !CIBLES_FORMULE_VALIDES.includes(f.cible)) signaler(cle, `formules[${i}].cible invalide : "${f && f.cible}" (attendu : ${CIBLES_FORMULE_VALIDES.join("|")}).`);
    if (f && f.cible === "carac" && !CARACS_VALIDES.includes(f.carac)) signaler(cle, `formules[${i}].carac invalide : "${f.carac}".`);
    if (f && f.cible === "competence" && !COMPETENCES_VALIDES.has(f.competence)) signaler(cle, `formules[${i}].competence inconnue : "${f.competence}".`);
  });
  const RESSOURCES_VALIDES = ["or", "argent", "bronze", "pv"];
  const OPERATIONS_VALIDES = ["perte", "gain"];
  (it.declencheurs || []).forEach((d, i) => {
    if (!d || !EVENEMENTS_DECLENCHEUR_VALIDES.includes(d.evenement)) { signaler(cle, `declencheurs[${i}].evenement invalide : "${d && d.evenement}" (attendu : ${EVENEMENTS_DECLENCHEUR_VALIDES.join("|")}).`); return; }
    if (d.condition !== undefined && !CONDITIONS_VALIDES.includes(d.condition)) {
      signaler(cle, `declencheurs[${i}].condition invalide : "${d.condition}" (attendu : ${CONDITIONS_VALIDES.join("|")}).`);
    }
    if (d.usage !== undefined) validerUsage(d.usage, (msg) => signaler(cle, `declencheurs[${i}].${msg}`));
    if (d.typeDegats !== undefined && !TYPES_DEGATS_DECLENCHEUR_VALIDES.includes(d.typeDegats)) {
      signaler(cle, `declencheurs[${i}].typeDegats invalide : "${d.typeDegats}" (attendu : ${TYPES_DEGATS_DECLENCHEUR_VALIDES.join("|")}).`);
    }
    if (d.porteeRequise !== undefined && !PORTEE_REQUISE_DECLENCHEUR_VALIDES.includes(d.porteeRequise)) {
      signaler(cle, `declencheurs[${i}].porteeRequise invalide : "${d.porteeRequise}" (attendu : ${PORTEE_REQUISE_DECLENCHEUR_VALIDES.join("|")}).`);
    }
    // Deux formes acceptées (cf. "Mécaniser les affixes de rareté") :
    // ressource/operation (Forge du MJ, existant) OU effets[] (vocabulaire
    // mecanique.effets[] de data/donnees.js, nouveau).
    if (Array.isArray(d.effets)) {
      validerEffets(d.effets, (msg) => signaler(cle, `declencheurs[${i}].${msg}`));
      return;
    }
    if (!RESSOURCES_VALIDES.includes(d.ressource)) signaler(cle, `declencheurs[${i}].ressource invalide : "${d.ressource}" (attendu : ${RESSOURCES_VALIDES.join("|")}).`);
    if (!OPERATIONS_VALIDES.includes(d.operation)) signaler(cle, `declencheurs[${i}].operation invalide : "${d.operation}" (attendu : ${OPERATIONS_VALIDES.join("|")}).`);
    if ((typeof d.valeur !== "string" && typeof d.valeur !== "number") || d.valeur === "") signaler(cle, `declencheurs[${i}].valeur manquante/invalide.`);
    if (d.repli) {
      if (!RESSOURCES_VALIDES.includes(d.repli.ressource)) signaler(cle, `declencheurs[${i}].repli.ressource invalide : "${d.repli.ressource}".`);
      if ((typeof d.repli.valeur !== "string" && typeof d.repli.valeur !== "number") || d.repli.valeur === "") signaler(cle, `declencheurs[${i}].repli.valeur manquante/invalide.`);
    }
  });
});

idsVus.forEach((n, id) => {
  if (n > 1) signaler(id, `id dupliqué (${n} occurrences dans le catalogue).`);
});

// ===========================================================================
// js/raretes.js — mecanique{} des affixes (cf. "Mécaniser les affixes de
// rareté"). Fichier séparé de data/loot.json, mais même vocabulaire effets[]
// — validé ici pour rester un seul script "avant tout commit touchant le
// loot/les raretés", comme demandé par le prompt (Étape 5).
// ===========================================================================
const ctxRaretes = chargerGlobals(["js/raretes.js"], ["EFFETS_PAR_ITEM", "EFFETS_RARETE"]);
const EFFETS_PAR_ITEM = ctxRaretes.EFFETS_PAR_ITEM;
const EFFETS_RARETE = ctxRaretes.EFFETS_RARETE;
if (!EFFETS_PAR_ITEM || !EFFETS_RARETE) { console.error("❌ EFFETS_PAR_ITEM/EFFETS_RARETE introuvables (js/raretes.js n'a pas chargé)."); process.exit(1); }

const problemesParAffixe = new Map();
function signalerAffixe(cle, message) {
  if (!problemesParAffixe.has(cle)) problemesParAffixe.set(cle, []);
  problemesParAffixe.get(cle).push(message);
}
let nbMecaniques = 0;
// meca[palier] porte des champs indépendants (cf. "Affixes phase 2" :
// passif, evenement+effets, bonusAttaqueConditionnel) — jamais mutuellement
// exclusifs (epee_courte.precise legendaire porte à la fois evenement+effets
// ET bonusAttaqueConditionnel). On ne valide que ce qui est effectivement
// présent, plutôt que de supposer une forme unique.
// Un seul déclencheur (evenement+effets+usage+typeDegats+porteeRequise) —
// factorisé pour être appliqué à la fois à `m` (forme courte historique) et
// à chaque entrée de `m.aussi[]` (cf. "protectrice", Pierre de chance : un
// palier peut porter DEUX déclencheurs indépendants, evenements/usages
// distincts — _appliquerMecanique, js/raretes.js).
function validerDeclencheurMecanique(cle, p, m) {
  if (!EVENEMENTS_DECLENCHEUR_VALIDES.includes(m.evenement)) signalerAffixe(cle, `${p}.evenement invalide : "${m.evenement}" (attendu : ${EVENEMENTS_DECLENCHEUR_VALIDES.join("|")}).`);
  validerEffets(m.effets, (msg) => signalerAffixe(cle, `${p}.${msg}`));
  if (m.condition !== undefined && !CONDITIONS_VALIDES.includes(m.condition)) {
    signalerAffixe(cle, `${p}.condition invalide : "${m.condition}" (attendu : ${CONDITIONS_VALIDES.join("|")}).`);
  }
  if (m.usage !== undefined) validerUsage(m.usage, (msg) => signalerAffixe(cle, `${p}.${msg}`));
  if (m.typeDegats !== undefined && !TYPES_DEGATS_DECLENCHEUR_VALIDES.includes(m.typeDegats)) {
    signalerAffixe(cle, `${p}.typeDegats invalide : "${m.typeDegats}" (attendu : ${TYPES_DEGATS_DECLENCHEUR_VALIDES.join("|")}).`);
  }
  if (m.porteeRequise !== undefined && !PORTEE_REQUISE_DECLENCHEUR_VALIDES.includes(m.porteeRequise)) {
    signalerAffixe(cle, `${p}.porteeRequise invalide : "${m.porteeRequise}" (attendu : ${PORTEE_REQUISE_DECLENCHEUR_VALIDES.join("|")}).`);
  }
}
function validerMecaniqueAffixe(cle, meca) {
  ["rare", "legendaire"].forEach((palier) => {
    const m = meca[palier];
    if (!m) return;
    nbMecaniques++;
    const p = `mecanique.${palier}`;
    if (m.evenement !== undefined || m.effets !== undefined) validerDeclencheurMecanique(cle, p, m);
    if (m.aussi !== undefined) {
      if (!Array.isArray(m.aussi)) signalerAffixe(cle, `${p}.aussi devrait être un tableau, reçu ${JSON.stringify(m.aussi)}.`);
      else m.aussi.forEach((sub, i) => validerDeclencheurMecanique(cle, `${p}.aussi[${i}]`, sub || {}));
    }
    if (m.passif !== undefined) validerPassif(cle, `${p}.passif`, m.passif);
    if (m.bonusAttaqueConditionnel !== undefined) validerBonusAttaqueConditionnel(cle, `${p}.bonusAttaqueConditionnel`, m.bonusAttaqueConditionnel);
    if (m.evenement === undefined && m.effets === undefined && m.passif === undefined && m.bonusAttaqueConditionnel === undefined && m.note === undefined) {
      signalerAffixe(cle, `${p} ne porte aucun champ reconnu (passif|evenement+effets|bonusAttaqueConditionnel).`);
    }
  });
}
Object.keys(EFFETS_PAR_ITEM).forEach((itemId) => {
  EFFETS_PAR_ITEM[itemId].forEach((variante) => {
    if (variante.mecanique) validerMecaniqueAffixe(`${itemId}.${variante.id}`, variante.mecanique);
  });
});
Object.keys(EFFETS_RARETE).forEach((type) => {
  if (EFFETS_RARETE[type].mecanique) validerMecaniqueAffixe(`EFFETS_RARETE.${type}`, EFFETS_RARETE[type].mecanique);
});

const itemsEnErreur = problemesParItem.size;
const totalErreurs = [...problemesParItem.values()].reduce((s, l) => s + l.length, 0);
const affixesEnErreur = problemesParAffixe.size;
const totalErreursAffixes = [...problemesParAffixe.values()].reduce((s, l) => s + l.length, 0);

if (totalErreurs || totalErreursAffixes) {
  if (totalErreurs) {
    console.log(`❌ ${totalErreurs} erreur(s) sur ${itemsEnErreur} item(s) :\n`);
    problemesParItem.forEach((messages, cle) => {
      console.log(`  [${cle}]`);
      messages.forEach((m) => console.log(`      ${m}`));
    });
  }
  if (totalErreursAffixes) {
    console.log(`❌ ${totalErreursAffixes} erreur(s) sur ${affixesEnErreur} affixe(s) de rareté (js/raretes.js) :\n`);
    problemesParAffixe.forEach((messages, cle) => {
      console.log(`  [${cle}]`);
      messages.forEach((m) => console.log(`      ${m}`));
    });
  }
  console.log(`\n${items.length} item(s) analysés (${itemsEnErreur} en erreur), ${nbMecaniques} mecanique(s) d'affixe analysée(s) (${affixesEnErreur} en erreur).`);
  process.exit(1);
} else {
  console.log(`✅ ${items.length} item(s) et ${nbMecaniques} mecanique(s) d'affixe (js/raretes.js) validés, aucune erreur.`);
  process.exit(0);
}
