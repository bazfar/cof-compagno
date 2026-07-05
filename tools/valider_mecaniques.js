#!/usr/bin/env node
/* ============================================================
   Script de contrôle (jetable, non lié au build) pour le chantier
   "mecanique" de data/donnees.js — cf. le prompt qui a lancé ce
   chantier (états/capacités).

   Vérifie, pour CLASSES et RACES :
   - que chaque rang a un champ `mecanique` défini (pas `undefined`)
     — `null` n'est toléré que pour les entrées listées dans
     EXCEPTIONS_MECANIQUE_NULL ci-dessous (étape 2bis du prompt),
   - que tout `effets[].id` (effet de type "etat") référence bien
     un id existant dans ETATS (js/etats.js),
   - que la forme générale de `mecanique` respecte le schéma minimal
     (type, usage, cible, effets tableau).

   Usage : node tools/valider_mecaniques.js
   Sort avec le code 1 et un rapport si des problèmes sont trouvés,
   0 et un résumé sinon.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.join(__dirname, "..");

// Capacités volontairement non automatisables (étape 2bis du prompt) :
// { classe|race, voie, rang } — mecanique: null toléré uniquement ici.
const EXCEPTIONS_MECANIQUE_NULL = [
  { classe: "enchanteur", voie: "Voie de l'historien", rang: 3 },
  { classe: "necromancien", voie: "Voie des âmes", rang: 1 },
];

function estException(classeCle, voieNom, rang) {
  return EXCEPTIONS_MECANIQUE_NULL.some(
    (e) => e.classe === classeCle && e.voie === voieNom && e.rang === rang
  );
}

// Charge un script global classique (pas de module.exports) dans un contexte
// vm dédié, puis expose ses `const` de haut niveau via globalThis pour
// pouvoir les lire depuis Node.
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

const ctx = chargerGlobals(
  ["js/etats.js", "data/donnees.js"],
  ["ETATS", "CLASSES", "RACES"]
);

const ETATS = ctx.ETATS;
const CLASSES = ctx.CLASSES;
const RACES = ctx.RACES;

if (!ETATS) { console.error("❌ ETATS introuvable (js/etats.js n'a pas chargé)."); process.exit(1); }
if (!CLASSES) { console.error("❌ CLASSES introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }
if (!RACES) { console.error("❌ RACES introuvable (data/donnees.js n'a pas chargé)."); process.exit(1); }

const TYPES_VALIDES = ["activable", "passive", "limitee", "rituel"];
const CIBLES_VALIDES = ["soi", "allie", "ennemi", "zone", "aucune"];
const TYPES_EFFET_VALIDES = ["degats", "soin", "etat", "bonus", "special"];

const problemes = []; // { ou: "classe/voie/rang nom", message }
let totalRangs = 0;
let totalManquants = 0;
let totalNull = 0;

function verifierMecanique(mecanique, ou) {
  if (mecanique === undefined) {
    problemes.push({ ou, message: "champ `mecanique` absent (undefined)." });
    totalManquants++;
    return;
  }
  if (mecanique === null) {
    totalNull++;
    return; // légitimité vérifiée par l'appelant (whitelist)
  }
  if (typeof mecanique !== "object") {
    problemes.push({ ou, message: `mecanique doit être un objet ou null, reçu ${typeof mecanique}.` });
    return;
  }
  if (!TYPES_VALIDES.includes(mecanique.type)) {
    problemes.push({ ou, message: `type invalide : "${mecanique.type}" (attendu : ${TYPES_VALIDES.join("|")}).` });
  }
  if (!mecanique.usage || typeof mecanique.usage.frequence !== "string") {
    problemes.push({ ou, message: "usage.frequence manquant ou invalide." });
  }
  if (!CIBLES_VALIDES.includes(mecanique.cible)) {
    problemes.push({ ou, message: `cible invalide : "${mecanique.cible}" (attendu : ${CIBLES_VALIDES.join("|")}).` });
  }
  if (!Array.isArray(mecanique.effets)) {
    problemes.push({ ou, message: "effets doit être un tableau." });
    return;
  }
  mecanique.effets.forEach((eff, i) => {
    if (!TYPES_EFFET_VALIDES.includes(eff.type)) {
      problemes.push({ ou, message: `effets[${i}].type invalide : "${eff.type}".` });
    }
    if (eff.type === "etat") {
      // "marquee_<source>" est un id composé (cf. js/etats.js, entrée
      // `marquee` avec parSource:true) : pas une clé littérale du catalogue,
      // mais une référence paramétrée à cette même entrée de base.
      const estMarqueeComposee = /^marquee_.+/.test(eff.id || "");
      if (eff.id === "marquee") {
        problemes.push({ ou, message: `effets[${i}] utilise "marquee" seul — il faut un id composé (ex. "marquee_pretre").` });
      } else if (!eff.id || !(ETATS[eff.id] || (estMarqueeComposee && ETATS.marquee))) {
        problemes.push({ ou, message: `effets[${i}] référence un état inconnu : "${eff.id}" (absent de js/etats.js).` });
      }
    }
  });
}

function verifierVoies(voies, classeCle, prefixeOu) {
  (voies || []).forEach((voie) => {
    (voie.rangs || []).forEach((rang) => {
      totalRangs++;
      const ou = `${prefixeOu} / ${voie.nom} / rang ${rang.rang}${rang.nom ? " (" + rang.nom + ")" : ""}`;
      if (rang.mecanique === null && !estException(classeCle, voie.nom, rang.rang)) {
        problemes.push({ ou, message: "mecanique: null non whitelisté (cf. EXCEPTIONS_MECANIQUE_NULL en étape 2bis)." });
      }
      verifierMecanique(rang.mecanique, ou);
    });
  });
}

function verifierVariantes(variantes, raceCle, prefixeOu) {
  (variantes || []).forEach((variante) => {
    totalRangs++;
    const ou = `${prefixeOu} / variante ${variante.nom_affiche || variante.code}`;
    if (variante.mecanique === null && !estException(raceCle, "__variante__", variante.code)) {
      problemes.push({ ou, message: "mecanique: null non whitelisté (cf. EXCEPTIONS_MECANIQUE_NULL en étape 2bis)." });
    }
    verifierMecanique(variante.mecanique, ou);
  });
}

for (const [cle, c] of Object.entries(CLASSES)) {
  verifierVoies(c.voies, cle, `CLASSES.${cle}`);
}
for (const [cle, r] of Object.entries(RACES)) {
  // Les races n'ont qu'une seule "voie" de rangs (pas de tableau `voies`) —
  // on l'enveloppe pour réutiliser verifierVoies telle quelle.
  verifierVoies([{ nom: r.voie_nom || cle, rangs: r.rangs }], cle, `RACES.${cle}`);
  verifierVariantes(r.variantes, cle, `RACES.${cle}`);
}

console.log(`Rangs analysés : ${totalRangs} (dont ${totalNull} volontairement à null, ${totalManquants} manquants)`);

if (problemes.length) {
  console.log(`\n❌ ${problemes.length} problème(s) :\n`);
  for (const p of problemes) {
    console.log(`  - ${p.ou}\n      ${p.message}`);
  }
  process.exit(1);
} else {
  console.log("\n✅ Aucun problème détecté.");
  process.exit(0);
}
