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

const ctx = chargerGlobals(["data/donnees.js"], ["COMPETENCES_PAR_CARAC", "SAUVEGARDES"]);
const COMPETENCES_PAR_CARAC = ctx.COMPETENCES_PAR_CARAC;
const SAUVEGARDES = ctx.SAUVEGARDES;
if (!COMPETENCES_PAR_CARAC) { console.error("❌ COMPETENCES_PAR_CARAC introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }
if (!SAUVEGARDES) { console.error("❌ SAUVEGARDES introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }

const COMPETENCES_VALIDES = new Set(Object.values(COMPETENCES_PAR_CARAC).flat());
const CARACS_VALIDES = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"];
const SAUVEGARDES_VALIDES = Object.keys(SAUVEGARDES);

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
  "formules", "declencheurs"];
// Champs spécifiques à chaque type.
const PAR_TYPE = {
  arme: ["degats", "portee", "typedegats", "enchantement", "deuxMains", "categorieArme", "porteeMinCases", "porteeMaxCases", "rechargement", "degatsAuMoinsRare", "bonusAttaqueMagique", "bonusDegatsMagiques"],
  armure: ["valeurCA", "malusDEX", "categorie", "reductionDegats"],
  bouclier: ["bonusDEF", "categorieBouclier"],
  accessoire: ["slot", "bonusCarac", "bonusCompetences", "bonusInitiative", "bonusDEF", "bonusAttaqueMagique", "bonusAttaqueDistance", "bonusDegatsMagiques", "bonusDegatsMainsNues", "bonusPvMaxDe", "rariteFixe", "sansModificateurRegional"],
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
  const EVENEMENTS_VALIDES = ["touche", "rate", "critique"];
  const RESSOURCES_VALIDES = ["or", "argent", "bronze", "pv"];
  const OPERATIONS_VALIDES = ["perte", "gain"];
  (it.declencheurs || []).forEach((d, i) => {
    if (!d || !EVENEMENTS_VALIDES.includes(d.evenement)) signaler(cle, `declencheurs[${i}].evenement invalide : "${d && d.evenement}" (attendu : ${EVENEMENTS_VALIDES.join("|")}).`);
    if (!d || !RESSOURCES_VALIDES.includes(d.ressource)) signaler(cle, `declencheurs[${i}].ressource invalide : "${d && d.ressource}" (attendu : ${RESSOURCES_VALIDES.join("|")}).`);
    if (!d || !OPERATIONS_VALIDES.includes(d.operation)) signaler(cle, `declencheurs[${i}].operation invalide : "${d && d.operation}" (attendu : ${OPERATIONS_VALIDES.join("|")}).`);
    if (!d || (typeof d.valeur !== "string" && typeof d.valeur !== "number") || d.valeur === "") signaler(cle, `declencheurs[${i}].valeur manquante/invalide.`);
    if (d && d.repli) {
      if (!RESSOURCES_VALIDES.includes(d.repli.ressource)) signaler(cle, `declencheurs[${i}].repli.ressource invalide : "${d.repli.ressource}".`);
      if ((typeof d.repli.valeur !== "string" && typeof d.repli.valeur !== "number") || d.repli.valeur === "") signaler(cle, `declencheurs[${i}].repli.valeur manquante/invalide.`);
    }
  });
});

idsVus.forEach((n, id) => {
  if (n > 1) signaler(id, `id dupliqué (${n} occurrences dans le catalogue).`);
});

const itemsEnErreur = problemesParItem.size;
const totalErreurs = [...problemesParItem.values()].reduce((s, l) => s + l.length, 0);

if (totalErreurs) {
  console.log(`❌ ${totalErreurs} erreur(s) sur ${itemsEnErreur} item(s) :\n`);
  problemesParItem.forEach((messages, cle) => {
    console.log(`  [${cle}]`);
    messages.forEach((m) => console.log(`      ${m}`));
  });
  console.log(`\n${items.length} item(s) analysés, ${itemsEnErreur} en erreur, ${totalErreurs} erreur(s) au total.`);
  process.exit(1);
} else {
  console.log(`✅ ${items.length} item(s) validés, aucune erreur.`);
  process.exit(0);
}
