#!/usr/bin/env node
/* ============================================================
   Script de contrôle (jetable, non lié au build) — schéma du catalogue
   d'armes de monstres (data/armes_monstres.js) et du bestiaire
   (data/bestiaire.json). Même patron que tools/valider_loot.js (Node,
   rapport groupé, code de sortie) — cf. schema_cible_armes_monstres.md
   pour le document de référence complet (Variante A : dé nu partout,
   modificateur porté par l'attaque via bonusDegats).

   Usage : node tools/valider_bestiaire.js
   Sort avec le code 1 et un rapport si des problèmes sont trouvés,
   0 et un résumé sinon.

   Portée volontairement limitée : structure et cohérence de clés
   uniquement — aucune validation d'équilibrage. Lancé à la main avant
   tout commit touchant le bestiaire.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");

function chargerArmesMonstres() {
  let s = fs.readFileSync(path.join(RACINE, "data", "armes_monstres.js"), "utf8");
  s = s.replace(/^\/\*[\s\S]*?\*\/\s*/, "").replace(/^const\s+ARMES_MONSTRES\s*=\s*/, "").replace(/;\s*\nconst ArmesMonstres[\s\S]*/, "");
  return eval(s);
}

const ARMES_MONSTRES = chargerArmesMonstres();
const bestiaireRaw = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "bestiaire.json"), "utf8"));
const monstres = bestiaireRaw.monstres;
if (!Array.isArray(monstres)) { console.error("❌ data/bestiaire.json : champ `monstres` absent ou n'est pas un tableau."); process.exit(1); }

// ---------------------------------------------------------------------------
// Énumérations (cf. schema_cible_armes_monstres.md §4).
const PORTEES_VALIDES = [
  "contact", "contact +1 case (3m)", "courte (6m)", "moyenne (18m)", "longue (36m)",
  "contact (zone adjacente)", "contact (arc frontal)",
];
const TYPEDEGATS_VALIDES = ["physique", "magique"];
const ELEMENTAIRE_VALIDES = [null, "chaos", "sacre", "feu", "froid", "mental"];
// Grammaire de lancerFormule (js/app.js) : suite de termes ±NdM ou ±K.
const RE_FORMULE_TERME = /^[+-]?(\d*d\d+|\d+)$/;
function formuleValide(f) {
  if (typeof f !== "string" || !f) return false;
  const termes = f.match(/[+-]?[^+-]+/g) || [];
  return termes.length > 0 && termes.every((t) => RE_FORMULE_TERME.test(t));
}
// Exceptions dé composite (§4.3) — exemptées de la règle « dé nu ».
const EXCEPTIONS_DEGATS_COMPOSITES = new Set(["filet_de_chasse", "dague_dans_le_dos", "attaque_sournoise"]);
function estDeNu(f) {
  return /^\d*d\d+$/.test(f);
}

const RACES_VALIDES = ["humanoïdes", "monstres", "mort-vivant", "corrompu"];
const TIERS_VALIDES = ["basique", "veteran", "elite", "champion", "recrue", "meneur", "grand_hote"];

// ===========================================================================
// SECTION A — data/armes_monstres.js
// ===========================================================================
const CHAMPS_ARME_AUTORISES = new Set(["id", "nom", "type", "degats", "portee", "typedegats", "elementaire", "touches", "critMin"]);

const problemesArmes = new Map();
function signalerArme(cle, msg) {
  if (!problemesArmes.has(cle)) problemesArmes.set(cle, []);
  problemesArmes.get(cle).push(msg);
}

const idsArmesVus = new Set();
const armesReferencees = new Set(); // rempli en section B

ARMES_MONSTRES.forEach((a, index) => {
  const cle = a.id || `(index ${index}, sans id)`;

  // 1. Liste blanche de champs.
  Object.keys(a).forEach((champ) => {
    if (!CHAMPS_ARME_AUTORISES.has(champ)) signalerArme(cle, `champ "${champ}" non autorisé.`);
  });

  // 2. id unique, slug valide, sans suffixe doublon.
  if (!a.id || !/^[a-z0-9_]+$/.test(a.id)) {
    signalerArme(cle, `id invalide (attendu : ^[a-z0-9_]+$, reçu ${JSON.stringify(a.id)}).`);
  } else {
    if (idsArmesVus.has(a.id)) signalerArme(cle, "id dupliqué.");
    idsArmesVus.add(a.id);
  }

  // 3. type.
  if (a.type !== "arme") signalerArme(cle, `type invalide : "${a.type}" (attendu : "arme").`);

  // 4. degats — grammaire lancerFormule, et dé nu sauf exceptions.
  if (!formuleValide(a.degats)) {
    signalerArme(cle, `degats "${a.degats}" ne respecte pas la grammaire de lancerFormule (±NdM ou ±K).`);
  } else if (!EXCEPTIONS_DEGATS_COMPOSITES.has(a.id) && !estDeNu(a.degats)) {
    signalerArme(cle, `degats "${a.degats}" n'est pas un dé nu (^\\d*d\\d+$) — le modificateur fixe doit être porté par l'attaque (bonusDegats), pas par l'arme.`);
  }

  // 5. portee / typedegats / elementaire / touches / critMin.
  if (!PORTEES_VALIDES.includes(a.portee)) signalerArme(cle, `portee invalide : "${a.portee}" (attendu : ${PORTEES_VALIDES.join(" | ")}).`);
  if (!TYPEDEGATS_VALIDES.includes(a.typedegats)) signalerArme(cle, `typedegats invalide : "${a.typedegats}" (attendu : ${TYPEDEGATS_VALIDES.join(" | ")}).`);
  if (a.elementaire !== undefined && !ELEMENTAIRE_VALIDES.includes(a.elementaire)) {
    signalerArme(cle, `elementaire invalide : "${a.elementaire}" (attendu : ${ELEMENTAIRE_VALIDES.map((e) => e === null ? "null" : e).join(" | ")}).`);
  }
  if (a.touches !== undefined && !(Number.isInteger(a.touches) && a.touches >= 2)) {
    signalerArme(cle, `touches devrait être un entier ≥ 2, reçu ${JSON.stringify(a.touches)}.`);
  }
  if (a.critMin !== undefined && !(Number.isInteger(a.critMin) && a.critMin >= 2 && a.critMin <= 20)) {
    signalerArme(cle, `critMin devrait être un entier entre 2 et 20, reçu ${JSON.stringify(a.critMin)}.`);
  }
});

// 6. Anti-doublon (§1/§7.6) : la clé (nom, degats, portee, typedegats,
// elementaire, touches) doit être unique — c'est la règle qui empêche la
// réapparition des suffixes _2/_3. Détection affinée pour l'id lui-même :
// un id n'est un doublon suspect QUE si sa base (id sans le `_<chiffre>`
// final) existe AUSSI comme id à part entière dans le catalogue — un id
// comme "epee_longue_enchantee_1" ou "devastation_voie_puissance_r_3" n'a
// pas de base sans suffixe dans le catalogue, ce n'est pas un doublon.
const clesFusion = new Map();
ARMES_MONSTRES.forEach((a) => {
  const cle = [a.nom, a.degats, a.portee, a.typedegats, a.elementaire || null, a.touches || 1].join("|");
  if (!clesFusion.has(cle)) clesFusion.set(cle, []);
  clesFusion.get(cle).push(a.id);
});
clesFusion.forEach((ids, cle) => {
  if (ids.length > 1) ids.forEach((id) => signalerArme(id, `doublon (nom, degats, portee, typedegats, elementaire, touches) identique à : ${ids.filter((x) => x !== id).join(", ")}.`));
});
ARMES_MONSTRES.forEach((a) => {
  const m = /^(.+)_(\d+)$/.exec(a.id || "");
  if (m && idsArmesVus.has(m[1])) signalerArme(a.id, `id suffixe doublon détecté : la base "${m[1]}" existe aussi comme id à part entière.`);
});

// ===========================================================================
// SECTION B — data/bestiaire.json
// ===========================================================================
const CHAMPS_MONSTRE_OBLIGATOIRES = ["id", "nom", "categorie", "race", "pv", "def", "init", "atk", "dangerosite", "boss", "taille", "attaques", "capacitesSpeciales", "lore", "armure", "emoji"];
const CHAMPS_MONSTRE_OPTIONNELS = ["famille", "tier", "voies", "faction", "roleNarratif"];
const CHAMPS_MONSTRE_AUTORISES = new Set([...CHAMPS_MONSTRE_OBLIGATOIRES, ...CHAMPS_MONSTRE_OPTIONNELS]);

const problemesMonstres = new Map();
function signalerMonstre(cle, msg) {
  if (!problemesMonstres.has(cle)) problemesMonstres.set(cle, []);
  problemesMonstres.get(cle).push(msg);
}

const idsMonstresVus = new Set();
let attaquesInlineHeritees = 0;

monstres.forEach((m, index) => {
  const cle = m.id || `(index ${index}, sans id)`;

  // 8. id unique, slug valide.
  if (!m.id || !/^[a-z0-9_]+$/.test(m.id)) {
    signalerMonstre(cle, `id invalide (attendu : ^[a-z0-9_]+$, reçu ${JSON.stringify(m.id)}).`);
  } else {
    if (idsMonstresVus.has(m.id)) signalerMonstre(cle, "id dupliqué.");
    idsMonstresVus.add(m.id);
  }

  // Champs non autorisés (liste blanche, obligatoires + optionnels).
  Object.keys(m).forEach((champ) => {
    if (!CHAMPS_MONSTRE_AUTORISES.has(champ)) signalerMonstre(cle, `champ "${champ}" non autorisé.`);
  });

  // 9. Champs obligatoires présents.
  CHAMPS_MONSTRE_OBLIGATOIRES.forEach((champ) => {
    if (m[champ] === undefined) signalerMonstre(cle, `champ obligatoire manquant : "${champ}".`);
  });

  // 10. Types simples.
  if (m.dangerosite !== undefined && !(Number.isInteger(m.dangerosite) && m.dangerosite >= 1 && m.dangerosite <= 5)) {
    signalerMonstre(cle, `dangerosite devrait être un entier 1-5, reçu ${JSON.stringify(m.dangerosite)}.`);
  }
  if (m.boss !== undefined && typeof m.boss !== "boolean") signalerMonstre(cle, `boss devrait être un booléen, reçu ${typeof m.boss}.`);
  ["pv", "def", "init", "atk"].forEach((champ) => {
    if (m[champ] !== undefined && !Number.isInteger(m[champ])) signalerMonstre(cle, `${champ} devrait être un entier, reçu ${JSON.stringify(m[champ])}.`);
  });

  // 11. race[] ⊆ enum.
  if (m.race !== undefined) {
    if (!Array.isArray(m.race)) signalerMonstre(cle, `race devrait être un tableau, reçu ${typeof m.race}.`);
    else m.race.forEach((r) => { if (!RACES_VALIDES.includes(r)) signalerMonstre(cle, `race contient une valeur inconnue : "${r}" (attendu : ${RACES_VALIDES.join(" | ")}).`); });
  }

  // 12. tier ∈ enum si présent.
  if (m.tier !== undefined && !TIERS_VALIDES.includes(m.tier)) {
    signalerMonstre(cle, `tier invalide : "${m.tier}" (attendu : ${TIERS_VALIDES.join(" | ")}).`);
  }

  // 13/14. attaques[].
  (m.attaques || []).forEach((a, i) => {
    if (a.armeId !== undefined) {
      armesReferencees.add(a.armeId);
      if (!idsArmesVus.has(a.armeId)) signalerMonstre(cle, `attaques[${i}].armeId introuvable dans le catalogue : "${a.armeId}".`);
      if (typeof a.bonusAttaque !== "number" || !Number.isInteger(a.bonusAttaque)) {
        signalerMonstre(cle, `attaques[${i}].bonusAttaque devrait être un entier, reçu ${JSON.stringify(a.bonusAttaque)}.`);
      }
      if (a.bonusDegats !== undefined && !Number.isInteger(a.bonusDegats)) {
        signalerMonstre(cle, `attaques[${i}].bonusDegats devrait être un entier, reçu ${JSON.stringify(a.bonusDegats)}.`);
      }
      if (!a.nom) signalerMonstre(cle, `attaques[${i}].nom manquant.`);
      if (a.effetSpecial !== null && typeof a.effetSpecial !== "string") {
        signalerMonstre(cle, `attaques[${i}].effetSpecial devrait être string|null, reçu ${typeof a.effetSpecial}.`);
      }
    } else {
      // Format inline hérité (cf. §3) : produit dynamiquement par
      // js/carte.js pour les invocations de joueur — avertissement, pas
      // une erreur (hors périmètre de cette migration, cf. §8).
      attaquesInlineHeritees++;
    }
  });
});

// 7. Arme jamais référencée (avertissement).
const armesJamaisReferencees = [...idsArmesVus].filter((id) => !armesReferencees.has(id));

// ===========================================================================
// RAPPORT
// ===========================================================================
const totalErreursArmes = [...problemesArmes.values()].reduce((s, l) => s + l.length, 0);
const totalErreursMonstres = [...problemesMonstres.values()].reduce((s, l) => s + l.length, 0);
const totalErreurs = totalErreursArmes + totalErreursMonstres;

if (totalErreursArmes) {
  console.log(`❌ ${totalErreursArmes} erreur(s) sur ${problemesArmes.size} arme(s) (data/armes_monstres.js) :\n`);
  problemesArmes.forEach((messages, cle) => {
    console.log(`  [${cle}]`);
    messages.forEach((m) => console.log(`      ${m}`));
  });
  console.log("");
}
if (totalErreursMonstres) {
  console.log(`❌ ${totalErreursMonstres} erreur(s) sur ${problemesMonstres.size} monstre(s) (data/bestiaire.json) :\n`);
  problemesMonstres.forEach((messages, cle) => {
    console.log(`  [${cle}]`);
    messages.forEach((m) => console.log(`      ${m}`));
  });
  console.log("");
}
if (armesJamaisReferencees.length) {
  console.log(`⚠️  ${armesJamaisReferencees.length} arme(s) jamais référencée(s) par aucun monstre : ${armesJamaisReferencees.join(", ")}.\n`);
}
if (attaquesInlineHeritees) {
  console.log(`⚠️  ${attaquesInlineHeritees} attaque(s) au format inline hérité (jet/degats/portee/type sans armeId) — produites dynamiquement par js/carte.js (invocations), hors périmètre de cette migration.\n`);
}

if (totalErreurs) {
  console.log(`${ARMES_MONSTRES.length} arme(s) et ${monstres.length} monstre(s) analysés, ${totalErreurs} erreur(s) au total.`);
  process.exit(1);
} else {
  console.log(`✅ ${ARMES_MONSTRES.length} arme(s) et ${monstres.length} monstre(s) validés, aucune erreur.`);
  process.exit(0);
}
