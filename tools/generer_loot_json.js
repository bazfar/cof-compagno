#!/usr/bin/env node
/* ============================================================
   Génère data/loot.json depuis data/loot.js.

   POURQUOI CE SENS. data/loot.js est la source : c'est le seul des deux
   fichiers chargé par l'app (index.html → LOOT_CATALOGUE, lu par js/loot.js,
   js/marche.js, js/alchimie.js, js/cuisine.js, js/recolte.js, js/scribe.js,
   js/tannerie.js, js/app.js et data/equipement_depart.js), et c'est celui qui
   porte les commentaires de conception du catalogue — 83 lignes de notes à
   l'intérieur même du tableau, que JSON ne peut pas représenter. Générer le
   .js depuis le .json les détruirait.

   data/loot.json reste produit parce qu'une trentaine de commentaires du
   dépôt y renvoient par son nom (data/donnees.js, data/marche.js,
   data/recolte.js) et parce que tools/valider_loot.js le lit.

   Usage : node tools/generer_loot_json.js
   Idempotent : relancé sans modification, il réécrit un fichier identique.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Format : cf. tools/generer_loot_json_lib.js, partagé avec le contrôle de
// synchronisation de tools/valider_loot.js.
const { rendre } = require("./generer_loot_json_lib.js");

const RACINE = path.join(__dirname, "..");
const SRC = path.join(RACINE, "data", "loot.js");
const DST = path.join(RACINE, "data", "loot.json");

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(SRC, "utf8") +
    '\nglobalThis.__CATALOGUE = typeof LOOT_CATALOGUE !== "undefined" ? LOOT_CATALOGUE : undefined;' +
    '\nglobalThis.__VERSION = typeof LOOT_VERSION !== "undefined" ? LOOT_VERSION : undefined;',
  ctx
);

const items = ctx.__CATALOGUE;
const version = ctx.__VERSION;
if (!Array.isArray(items)) { console.error("❌ data/loot.js : LOOT_CATALOGUE introuvable ou n'est pas un tableau."); process.exit(1); }
if (typeof version !== "string") { console.error('❌ data/loot.js : LOOT_VERSION introuvable (const LOOT_VERSION = "x.y.z";).'); process.exit(1); }

const sortie = rendre(items, version);
const avant = fs.existsSync(DST) ? fs.readFileSync(DST, "utf8") : null;
fs.writeFileSync(DST, sortie, "utf8");

if (avant === sortie) {
  console.log(`✅ data/loot.json déjà à jour (${items.length} items, version ${version}).`);
} else {
  console.log(`✅ data/loot.json régénéré depuis data/loot.js (${items.length} items, version ${version}).`);
}
