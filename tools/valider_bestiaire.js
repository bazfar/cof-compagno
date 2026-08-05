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

// Catalogue des états (cf. js/etats.js) — pour vérifier que effets[].id /
// immunites[] / immunitesConditionnelles[].etats[] pointent vers un état
// réel, plutôt qu'un id fautif qui ne se verrait qu'en séance.
function chargerEtats() {
  let s = fs.readFileSync(path.join(RACINE, "js", "etats.js"), "utf8");
  s = s.replace(/^[\s\S]*?const\s+ETATS\s*=\s*/, "").replace(/;\s*\nconst ORDRE_CATEGORIES_ETATS[\s\S]*/, "");
  return eval("(" + s + ")");
}

const ARMES_MONSTRES = chargerArmesMonstres();
const ETATS = chargerEtats();
// Convention établie (cf. js/capacites.js, js/app.js _appliquerBonusMonstreDepuisMessages) :
// un état posé "par source" porte un id suffixé (marquee_pretre...) qui
// retombe sur l'entrée catalogue générique "marquee".
function etatExiste(id) {
  return Object.prototype.hasOwnProperty.call(ETATS, /^marquee_.+/.test(id) ? "marquee" : id);
}
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
const CHAMPS_MONSTRE_OPTIONNELS = ["famille", "tier", "voies", "faction", "roleNarratif",
  "capacitesActives", "immunites", "immunitesConditionnelles"];
const CHAMPS_MONSTRE_AUTORISES = new Set([...CHAMPS_MONSTRE_OBLIGATOIRES, ...CHAMPS_MONSTRE_OPTIONNELS]);

// Bloc mecanique de capacitesActives[] (cf. schema_cible_capacites_monstres.md
// §3) — sous-ensemble du schéma PJ de data/donnees.js, même vocabulaire à
// l'identique là où il existe. jetAttaque est le seul champ nouveau (un
// monstre n'a qu'un atk plat, contrairement à jetOppose.caracAttaquant côté PJ).
const CHAMPS_CAPACITE_AUTORISES = new Set(["nom", "description", "mecanique"]);
const CHAMPS_MECANIQUE_AUTORISES = new Set(["type", "usage", "cible", "portee", "zone", "effets",
  "actionBonus", "reactionCout", "jetAttaque", "jetSauvegardeFixe", "recharge"]);
const TYPES_MECANIQUE_VALIDES = ["activable", "limitee", "passive"];
const CIBLES_MECANIQUE_VALIDES = ["soi", "ennemi", "allie", "zone", "aucune"];
const PORTEE_MOTS_CLES = ["adjacent", "vue", "voix"];
const TYPES_EFFET_MONSTRE_VALIDES = ["degats", "etat", "bonus", "soin", "retraitEtat", "special"];
const CARACS_SAUVEGARDE_VALIDES = ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "Volonte", "Reflexes", "Vigueur"];
const DUREE_MOTS_CLES = ["prochainTour", "finCombat", "permanente"];

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

  // 13/14. attaques[] — depuis la migration des capacités (cf.
  // schema_cible_capacites_monstres.md), attaques[] ne contient plus que des
  // armes : armeId est désormais OBLIGATOIRE. js/carte.js produit toujours le
  // format inline hérité pour les invocations de joueur, mais celles-ci ne
  // transitent jamais par bestiaire.json — une entrée sans armeId ICI est une
  // capacité restée au mauvais endroit (à déplacer dans capacitesActives[]).
  (m.attaques || []).forEach((a, i) => {
    if (a.armeId === undefined) {
      attaquesInlineHeritees++;
      signalerMonstre(cle, `attaques[${i}] "${a.nom || "?"}" sans armeId — une capacité n'a plus sa place dans attaques[], à déplacer dans capacitesActives[].`);
      return;
    }
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
  });

  // 15. capacitesActives[] : bloc mecanique optionnel, mais explicite (null
  // si purement narrative — jamais absent silencieusement).
  (m.capacitesActives || []).forEach((cap, i) => {
    const refCap = `capacitesActives[${i}] "${cap.nom || "?"}"`;
    Object.keys(cap).forEach((c) => {
      if (!CHAMPS_CAPACITE_AUTORISES.has(c)) signalerMonstre(cle, `${refCap} : champ "${c}" non autorisé.`);
    });
    if (!cap.nom) signalerMonstre(cle, `${refCap}.nom manquant.`);
    if (typeof cap.description !== "string") signalerMonstre(cle, `${refCap}.description devrait être une chaîne.`);
    if (cap.mecanique === undefined) {
      signalerMonstre(cle, `${refCap}.mecanique absente — mettre null si la capacité est purement narrative.`);
      return;
    }
    const meca = cap.mecanique;
    if (!meca) return;

    Object.keys(meca).forEach((c) => {
      if (!CHAMPS_MECANIQUE_AUTORISES.has(c)) signalerMonstre(cle, `${refCap}.mecanique : champ "${c}" non autorisé.`);
    });
    if (!TYPES_MECANIQUE_VALIDES.includes(meca.type)) signalerMonstre(cle, `${refCap}.mecanique.type invalide : ${JSON.stringify(meca.type)}.`);
    if (!CIBLES_MECANIQUE_VALIDES.includes(meca.cible)) signalerMonstre(cle, `${refCap}.mecanique.cible invalide : ${JSON.stringify(meca.cible)}.`);

    const freq = meca.usage && meca.usage.frequence;
    if (!freq) signalerMonstre(cle, `${refCap}.mecanique.usage.frequence manquante.`);
    else if (freq !== "libre" && freq !== "permanente" && !/^\d+x\/.+$/.test(freq)) {
      signalerMonstre(cle, `${refCap}.mecanique.usage.frequence "${freq}" illisible par Capacites.parserFrequence.`);
    }

    if (meca.portee !== null && meca.portee !== undefined
        && !Number.isInteger(meca.portee) && !PORTEE_MOTS_CLES.includes(meca.portee)) {
      signalerMonstre(cle, `${refCap}.mecanique.portee : entier (mètres), null, ou ${PORTEE_MOTS_CLES.join(" | ")}.`);
    }
    if (meca.zone !== null && meca.zone !== undefined && !Number.isInteger(meca.zone)) {
      signalerMonstre(cle, `${refCap}.mecanique.zone devrait être un rayon entier en mètres ou null.`);
    }
    if (meca.jetAttaque !== undefined && !Number.isInteger(meca.jetAttaque)) signalerMonstre(cle, `${refCap}.mecanique.jetAttaque devrait être un entier.`);
    if (meca.reactionCout !== undefined && !Number.isInteger(meca.reactionCout)) signalerMonstre(cle, `${refCap}.mecanique.reactionCout devrait être un entier.`);
    if (meca.actionBonus !== undefined && typeof meca.actionBonus !== "boolean") signalerMonstre(cle, `${refCap}.mecanique.actionBonus devrait être un booléen.`);

    // recharge : purement déclaratif — aucune période nommée "recharge"
    // n'est réinitialisée automatiquement, le MJ débloque à la main (↻).
    if (meca.recharge !== undefined) {
      if (!Number.isInteger(meca.recharge) || meca.recharge < 1) signalerMonstre(cle, `${refCap}.mecanique.recharge devrait être un entier ≥ 1.`);
      if (freq !== "1x/recharge") signalerMonstre(cle, `${refCap}.mecanique.recharge présente sans usage.frequence "1x/recharge".`);
    }

    if (meca.jetSauvegardeFixe) {
      if (!CARACS_SAUVEGARDE_VALIDES.includes(meca.jetSauvegardeFixe.carac)) {
        signalerMonstre(cle, `${refCap}.mecanique.jetSauvegardeFixe.carac invalide : ${JSON.stringify(meca.jetSauvegardeFixe.carac)}.`);
      }
      if (!Number.isInteger(meca.jetSauvegardeFixe.dd)) signalerMonstre(cle, `${refCap}.mecanique.jetSauvegardeFixe.dd devrait être un entier.`);
    }

    if (!Array.isArray(meca.effets) || !meca.effets.length) {
      signalerMonstre(cle, `${refCap}.mecanique.effets[] absent ou vide.`);
      return;
    }
    meca.effets.forEach((e, k) => {
      const refE = `${refCap}.effets[${k}]`;
      if (!TYPES_EFFET_MONSTRE_VALIDES.includes(e.type)) { signalerMonstre(cle, `${refE}.type invalide : ${JSON.stringify(e.type)}.`); return; }
      if (e.type === "degats" || e.type === "soin") {
        if (!formuleValide(e.formule)) signalerMonstre(cle, `${refE}.formule "${e.formule}" rejetée par la grammaire de lancerFormule.`);
        if (e.surReussite !== undefined && e.surReussite !== "demi") signalerMonstre(cle, `${refE}.surReussite ne vaut que "demi".`);
        if (e.surReussite && !meca.jetSauvegardeFixe) signalerMonstre(cle, `${refE}.surReussite sans jetSauvegardeFixe — rien ne peut être réussi.`);
      }
      if (e.type === "etat") {
        if (!e.id || !etatExiste(e.id)) signalerMonstre(cle, `${refE}.id inconnu de js/etats.js : ${JSON.stringify(e.id)}.`);
        if (e.duree !== undefined && !DUREE_MOTS_CLES.includes(e.duree) && !/^\d+$/.test(String(e.duree))) {
          signalerMonstre(cle, `${refE}.duree "${e.duree}" non résoluble (entier en tours, ou ${DUREE_MOTS_CLES.join(" | ")}).`);
        }
      }
      if (e.type === "bonus") {
        if (e.cible !== "attaque" && e.cible !== "DEF") signalerMonstre(cle, `${refE}.cible doit valoir "attaque" ou "DEF" — seules valeurs lues par _bonusEtatsMonstre.`);
        if (!Number.isInteger(e.valeur)) signalerMonstre(cle, `${refE}.valeur devrait être un entier.`);
      }
      if (e.type === "special" && !e.note) signalerMonstre(cle, `${refE} : un effet special doit porter une note pour le MJ.`);
    });
  });

  // 16. immunites[] / immunitesConditionnelles[].
  (m.immunites || []).forEach((id) => {
    if (!etatExiste(id)) signalerMonstre(cle, `immunites : état inconnu de js/etats.js : ${JSON.stringify(id)}.`);
  });
  (m.immunitesConditionnelles || []).forEach((ic, i) => {
    const refIc = `immunitesConditionnelles[${i}]`;
    if (!Array.isArray(ic.etats) || !ic.etats.length) signalerMonstre(cle, `${refIc}.etats[] absent ou vide.`);
    else ic.etats.forEach((id) => {
      if (!etatExiste(id)) signalerMonstre(cle, `${refIc} : état inconnu : ${JSON.stringify(id)}.`);
      if ((m.immunites || []).includes(id)) signalerMonstre(cle, `${refIc} : "${id}" est déjà en immunité pleine, la condition ne sera jamais lue.`);
    });
    if (!ic.condition) signalerMonstre(cle, `${refIc}.condition manquante — c'est le texte affiché au MJ.`);
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
// attaquesInlineHeritees (armeId manquant) est désormais une ERREUR (cf. §13/14
// ci-dessus, déjà listée par monstre) — plus un simple avertissement "hors
// périmètre" : depuis la migration des capacités, une entrée sans armeId dans
// bestiaire.json est une capacité restée au mauvais endroit, jamais un format
// hérité légitime (celui-ci n'est produit qu'à la volée par js/carte.js pour
// les invocations, qui ne transitent jamais par ce fichier).

if (totalErreurs) {
  console.log(`${ARMES_MONSTRES.length} arme(s) et ${monstres.length} monstre(s) analysés, ${totalErreurs} erreur(s) au total.`);
  process.exit(1);
} else {
  console.log(`✅ ${ARMES_MONSTRES.length} arme(s) et ${monstres.length} monstre(s) validés, aucune erreur.`);
  process.exit(0);
}
