/* ============================================================
   COF-COMPAGNO — Cuisine : recettes, échelle de dé, qualités.

   Recalé sur reference_gastronomie.md (cf. prompt_cuisine_recalage_
   gastronomie.md, qui AMENDE prompt_repos_cuisine_metiers.md — la
   version "noms provisoires" du prompt principal est abandonnée, ce
   fichier n'implémente QUE la version recalée).

   ── Découplage rang / indexDe / registre (décision de design, pas un
   oubli de factorisation) ──────────────────────────────────────────
   Le document de référence pose un principe directeur : la méthode de
   cuisson est un marqueur SOCIAL, pas une échelle de qualité. Calquer les
   rangs 1→5 sur "table basse → table haute" encoderait "pauvre = mauvais",
   ce que le document refuse explicitement (le noble arvethien mange comme
   ses hommes ; le rat des veines est un plat ordinaire à Khazrak Dûm et une
   insulte à Kaldrun). D'où trois axes INDÉPENDANTS par recette :
     - rang        → difficulté technique (seuil du jet, XP, tentatives/jour)
     - indexDe     → valeur nourrissante (dé de PV au repos long)
     - registre    → position sociale du plat — PUREMENT DESCRIPTIF,
                     jamais lu par le moteur de résolution (cf. Cuisine.resoudre
                     dans js/cuisine.js). Ne JAMAIS dériver indexDe de rang :
                     un Chaudron de veille est techniquement simple mais très
                     nourrissant (rang 3, indexDe 4) ; des Quenelles de brochet
                     sont l'inverse (rang 5, indexDe 2) — c'est le point.

   Le document déclarait lui-même "aucun effet mécanique, choix assumé" pour
   le registre social — ce fichier le CONTREDIT sciemment sur un point
   différent (indexDe donne un effet mécanique, mais indexDe ≠ registre),
   en s'appuyant sur les 3 candidats que le document désignait lui-même
   comme prêts à recevoir un effet si la gastronomie passait en système
   (cf. CUISINE.effetsDeclaratifs plus bas).
   ============================================================ */

// Registre social du plat — AUCUN effet mécanique, jamais lu par le moteur.
// Sert uniquement d'étiquette dans l'UI et d'aide de description au MJ.
// Ne PAS l'utiliser pour moduler un jet : ce serait réintroduire
// "pauvre = mauvais", exactement ce que le découplage rang/indexDe évite.
const REGISTRES_TABLE = {
  haute:    { nom: "Table haute",    icone: "♛" },
  commune:  { nom: "Table commune",  icone: "◈" }, // noble et soldat mangent pareil
  basse:    { nom: "Table basse",    icone: "◦" },
  occasion: { nom: "Occasion",       icone: "✦" }, // rare, jamais lié au rang social
  rite:     { nom: "Rite",           icone: "☖" },
};

// Échelle ordonnée : la qualité du jet décale indexDe (voir QUALITES), le
// rang de la recette fixe la valeur de départ — bornée aux deux extrémités
// (pas de dé sous 1d4 ni au-dessus de 2d10).
const ECHELLE_DES_PLAT = ["1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "2d10"];
// index :                    0       1       2        3       4       5       6
// dé final = ECHELLE_DES_PLAT[clamp(recette.indexDe + qualite.dPlat, 0, 6)]

// Bandes de qualité du jet (1d20, SANS modificateur — cf. Cuisine.resoudre).
// dPlat: null (désastre/raté) = pas de dé issu de l'échelle : le désastre
// produit quand même un plat, mais avec un dé d'intoxication FIXE (1d6,
// indépendant de indexDe) ; le raté ne produit rien du tout.
// 1 est TOUJOURS un désastre et 20 TOUJOURS un chef-d'œuvre, quel que soit
// le seuil S — délibéré : un Grand queux peut encore rater un plat.
const QUALITES = [
  { id: "desastre", nom: "Désastre",     dPlat: null, xpMult: 0,   intoxication: true },
  { id: "rate",     nom: "Raté",         dPlat: null, xpMult: 0 },
  { id: "mediocre", nom: "Médiocre",     dPlat: -1,   xpMult: 0.5 },
  { id: "reussi",   nom: "Réussi",       dPlat: 0,    xpMult: 1 },
  { id: "bien",     nom: "Bien réussi",  dPlat: +1,   xpMult: 1 },
  { id: "chef",     nom: "Chef-d'œuvre", dPlat: +1,   xpMult: 1,   maximise: true },
];

/* ── Catalogue des recettes ──────────────────────────────────────
   NOTE DE COMPTAGE : le prompt de recalage annonce "47 recettes" en prose,
   mais son propre tableau exhaustif (repris ici À L'IDENTIQUE, aucun ajout
   ni retrait) en contient 57. La consigne "interdiction absolue d'inventer"
   prime sur le chiffre cité en introduction — ne PAS "corriger" à 47 en
   supprimant des entrées, le tableau source est la référence.
   Ordre du fichier : par nation, dans l'ordre du document source.

   Amendement rang 5 (prompt_cuisine_bonus_rang5.md) : +2 recettes
   (service_aetharion, table_de_prestige) → 59 recettes au total, rang 5
   porté à 6. oie_confite et boeuf_de_lannee restent au rang 4 (TODO Thomas
   de prompt_cuisine_facteurs_nutritifs.md explicitement levé, "ne pas
   promouvoir"). Les 6 recettes de rang 5 portent désormais un champ décrivant
   un bonus temporaire (cf. js/repos.js, validerRepos, qui l'accorde) — EXCLUSIF à ce rang.
   ============================================================ */
const CUISINE_RECETTES = [
  // ── Solvarn — Zénith ──
  { id: "pain_soleil", nom: "Pain-soleil", rang: 3, indexDe: 1, registre: "haute",
    ingredients: [{ id: "froment", qte: 2 }, { id: "safran_autel", qte: 1 }] },
  { id: "sauce_or", nom: "Sauce d'Or", rang: 5, indexDe: 1, registre: "haute",
    ingredients: [{ id: "poule_doree", qte: 1 }, { id: "safran_autel", qte: 1 }, { id: "miel_bruyere", qte: 1 }, { id: "beurre", qte: 2 }],
    // Bonus temporaire (cf. prompt_cuisine_bonus_rang5.md §2-3) : plat de
    // Concile et de Chancellerie — "on juge un cuisinier solvarien à sa
    // nappe de sauce". Accordé à partir d'Excellent, jusqu'au prochain
    // repos long, remplace (ne s'additionne pas à) un bonus du même type.
    bonusTemporaire: { type: "testsSociaux", valeur: 1, libelle: "+1 aux tests sociaux" } },
  { id: "volaille_zenith", nom: "Volaille du Zénith", rang: 4, indexDe: 4, registre: "haute",
    ingredients: [{ id: "poule_doree", qte: 1 }, { id: "safran_autel", qte: 1 }, { id: "beurre", qte: 1 }] },
  { id: "oie_confite", nom: "Oie confite de la Sombre", rang: 4, indexDe: 5, registre: "haute",
    ingredients: [{ id: "oie", qte: 1 }, { id: "sel", qte: 2 }] },
  { id: "carpe_kor_valdan", nom: "Carpe de vivier au Kor Valdan", rang: 3, indexDe: 2, registre: "haute",
    ingredients: [{ id: "carpe_vivier", qte: 1 }, { id: "vin_blanc", qte: 1 }, { id: "poivre_quais", qte: 1 }] },

  // ── Solvarn — Marche ──
  { id: "la_grise", nom: "La Grise", rang: 1, indexDe: 0, registre: "basse",
    ingredients: [{ id: "orge_grise", qte: 2 }, { id: "sel", qte: 1 }] },
  { id: "pain_naros", nom: "Pain de Naros", rang: 2, indexDe: 1, registre: "basse",
    ingredients: [{ id: "seigle", qte: 2 }] },
  { id: "soupe_de_fer", nom: "Soupe de fer", rang: 1, indexDe: 1, registre: "basse",
    ingredients: [{ id: "chou_durnholk", qte: 1 }, { id: "lard", qte: 1 }] },
  { id: "hareng_dessale", nom: "Hareng dessalé", rang: 1, indexDe: 1, registre: "basse",
    ingredients: [{ id: "hareng_barrique", qte: 1 }, { id: "seigle", qte: 1 }] },
  { id: "le_gris", nom: "Le gris", rang: 2, indexDe: 0, registre: "basse",
    ingredients: [{ id: "chou_durnholk", qte: 2 }, { id: "sel", qte: 1 }] },

  // ── Valdorne ──
  { id: "cerf_au_cidre", nom: "Cerf-des-brumes au cidre", rang: 4, indexDe: 4, registre: "haute",
    ingredients: [{ id: "cerf_brumes", qte: 2 }, { id: "cidre_gardesele", qte: 1 }, { id: "pomme_gardesele", qte: 1 }] },
  { id: "sanglier_broche", nom: "Sanglier à la broche", rang: 3, indexDe: 5, registre: "occasion",
    ingredients: [{ id: "sanglier_futaies", qte: 2 }, { id: "herbe_fumee", qte: 1 }] },
  { id: "potee_de_cendre", nom: "Potée de cendre", rang: 1, indexDe: 2, registre: "basse",
    ingredients: [{ id: "navet_cendre", qte: 2 }, { id: "lard", qte: 1 }, { id: "poiree", qte: 1 }] },
  { id: "civet_ferme", nom: "Civet fermé", rang: 4, indexDe: 3, registre: "basse",
    // Plat ILLÉGAL chez un roturier valdornien (le gibier appartient au
    // seigneur) — accroche de MJ, aucune conséquence mécanique.
    ingredients: [{ id: "lievre_fossessainte", qte: 1 }, { id: "cidre_gardesele", qte: 1 }] },
  { id: "pomme", nom: "Pommé", rang: 2, indexDe: 0, registre: "commune",
    ingredients: [{ id: "pomme_gardesele", qte: 3 }] },

  // ── Arveth ──
  // Les quatre plats arvethiens sont en registre "commune" : c'est le point
  // identitaire de la nation (le noble mange comme ses hommes). Ne pas
  // "corriger" en répartissant haute/basse.
  { id: "galette_sarrasin", nom: "Galette de sarrasin", rang: 1, indexDe: 1, registre: "commune",
    ingredients: [{ id: "sarrasin", qte: 2 }] },
  { id: "chaudron_de_veille", nom: "Le Chaudron de veille", rang: 3, indexDe: 4, registre: "commune",
    ingredients: [{ id: "boeuf_landes", qte: 2 }, { id: "orge_grise", qte: 1 }, { id: "prune_boigris", qte: 1 }],
    effetDeclaratif: "Servi avant une bataille ou un départ. On mange debout, dans le même chaudron, chacun sa louche. Le MJ peut accorder un bénéfice à ceux qui en ont partagé au dernier repos long." },
  { id: "boeuf_de_lannee", nom: "Bœuf de l'année", rang: 4, indexDe: 5, registre: "commune",
    ingredients: [{ id: "boeuf_landes", qte: 2 }, { id: "herbe_fumee", qte: 1 }, { id: "sel", qte: 1 }] },
  { id: "prune_brulante", nom: "Prune brûlante", rang: 3, indexDe: 0, registre: "commune",
    ingredients: [{ id: "eau_de_vie_boigris", qte: 1 }] },

  // ── Mornac ──
  { id: "jambon_mornhaven", nom: "Jambon de Mornhaven", rang: 5, indexDe: 4, registre: "haute",
    ingredients: [{ id: "porc_noir", qte: 2 }, { id: "sel", qte: 2 }],
    // Affiné trois ans, servi seul, dense — bonus temporaire, cf. sauce_or ci-dessus.
    bonusTemporaire: { type: "testsCarac", valeur: 1, carac: "CON", libelle: "+1 aux tests de CON" } },
  { id: "matelote_lisdane", nom: "Matelote de la Lisdane", rang: 3, indexDe: 4, registre: "commune",
    ingredients: [{ id: "anguille", qte: 2 }, { id: "vin_noir_mornac", qte: 1 }, { id: "ail_levees", qte: 1 }] },
  { id: "quenelles_brochet", nom: "Quenelles de brochet", rang: 5, indexDe: 2, registre: "haute",
    ingredients: [{ id: "brochet", qte: 2 }, { id: "oeuf", qte: 1 }],
    // Technique pure, impossible sans apprentissage — bonus temporaire, cf. sauce_or ci-dessus.
    bonusTemporaire: { type: "testsCarac", valeur: 1, carac: "DEX", libelle: "+1 aux tests de DEX" } },
  { id: "porc_noir_prunes", nom: "Porc noir aux prunes", rang: 4, indexDe: 4, registre: "haute",
    ingredients: [{ id: "porc_noir", qte: 1 }, { id: "prune_boigris", qte: 2 }, { id: "vin_noir_mornac", qte: 1 }] },
  { id: "repas_long", nom: "Le Repas long", rang: 5, indexDe: 6, registre: "haute",
    // Sommet du catalogue : seul indexDe 6 (2d10). Sept services, rang 5,
    // une tentative par jour. Coût en ingrédients délibérément prohibitif.
    // Sept services, ordre fixe — le festin qui tient au corps.
    ingredients: [{ id: "porc_noir", qte: 1 }, { id: "brochet", qte: 1 }, { id: "anguille", qte: 1 }, { id: "vin_noir_mornac", qte: 2 }, { id: "beurre", qte: 1 }, { id: "prune_boigris", qte: 1 }],
    bonusTemporaire: { type: "pvTemporaires", valeur: 5, libelle: "+5 PV temporaires" } },

  // ── Serval ──
  { id: "fromage_de_col", nom: "Fromage de col", rang: 4, indexDe: 2, registre: "commune",
    ingredients: [{ id: "lait_mouton_contreforts", qte: 3 }, { id: "sel_gemme", qte: 1 }] },
  { id: "agneau_au_fumoir", nom: "Agneau au fumoir", rang: 3, indexDe: 4, registre: "occasion",
    ingredients: [{ id: "agneau", qte: 2 }, { id: "herbe_fumee", qte: 2 }] },
  { id: "biere_de_col", nom: "Bière de col", rang: 3, indexDe: 0, registre: "commune",
    ingredients: [{ id: "orge_grise", qte: 2 }, { id: "houblon_serval", qte: 1 }] },
  { id: "champignons_farcis", nom: "Champignons farcis", rang: 2, indexDe: 1, registre: "commune",
    ingredients: [{ id: "champignon_chaumes", qte: 2 }, { id: "lard", qte: 1 }, { id: "seigle", qte: 1 }] },

  // ── Liberra ──
  // Il n'existe que deux plats libériens parce que le document pose qu'il
  // n'existe PAS de cuisine libérienne — "six cuisines dans la même rue".
  // C'est aussi ce qui justifie canoniquement que le catalogue entier soit
  // accessible à Libris.
  { id: "anguille_grand_port", nom: "Anguille fumée du Grand Port", rang: 2, indexDe: 2, registre: "basse",
    ingredients: [{ id: "anguille", qte: 2 }, { id: "herbe_fumee", qte: 1 }] },
  { id: "bouillon_de_silure", nom: "Bouillon de silure", rang: 4, indexDe: 4, registre: "haute",
    ingredients: [{ id: "silure", qte: 1 }, { id: "ail_levees", qte: 1 }, { id: "poivre_quais", qte: 1 }] },

  // ── Aetharion ──
  { id: "seve_claire", nom: "Sève claire", rang: 1, indexDe: 0, registre: "rite",
    ingredients: [{ id: "seve_montante", qte: 1 }] },
  { id: "truite_tranchee", nom: "Truite tranchée", rang: 4, indexDe: 2, registre: "haute",
    ingredients: [{ id: "truite_source", qte: 1 }, { id: "seve_ambree", qte: 1 }, { id: "mousse_poivre", qte: 1 }] },
  { id: "bouillon_trompette", nom: "Bouillon de trompette", rang: 2, indexDe: 1, registre: "commune",
    ingredients: [{ id: "trompette_seve", qte: 2 }, { id: "fougere_crosse", qte: 1 }] },
  { id: "feuille_dargent", nom: "Feuille d'argent", rang: 1, indexDe: 0, registre: "rite",
    ingredients: [{ id: "feuille_argent", qte: 1 }] },
  { id: "chevreuil_aux_baies", nom: "Chevreuil aux baies", rang: 4, indexDe: 4, registre: "occasion",
    ingredients: [{ id: "chevreuil_halliers", qte: 2 }, { id: "baie_crepuscule", qte: 1 }, { id: "seve_ambree", qte: 1 }] },
  { id: "service_aetharion", nom: "Le Service d'Aetharion", rang: 5, indexDe: 3, registre: "rite",
    // Amendement rang 5 (prompt_cuisine_bonus_rang5.md, étape 1) : "repas en
    // service ordonné, sève claire en ouverture, poisson cru, infusion de
    // feuille d'argent en clôture" — ce n'est pas une invention, le document
    // de référence décrit ce repas composé sans en faire une entrée de
    // tableau. Aucun ingrédient nouveau : les 4 figurent déjà dans les vivres.
    // Le prompt donne facteurNutritif 0,55 (échelle de prompt_cuisine_
    // facteurs_nutritifs.md, JAMAIS appliqué à ce fichier — aucun champ
    // facteurNutritif n'existe ici, cf. audit). Traduit sur l'échelle
    // indexDe/ECHELLE_DES_PLAT réellement en usage via le même rapport que
    // repas_long (facteurNutritif 0,95 ↔ indexDe 6, le plafond documenté) :
    // 0,55 / 0,95 × 6 ≈ 3,5 → indexDe 3 (1d10).
    ingredients: [{ id: "seve_montante", qte: 1 }, { id: "truite_source", qte: 1 }, { id: "trompette_seve", qte: 1 }, { id: "feuille_argent", qte: 1 }],
    // Protocole, infusion de clôture, chaque étape a un mot dit à voix haute.
    bonusTemporaire: { type: "testsCarac", valeur: 1, carac: "SAG", libelle: "+1 aux tests de SAG" } },

  // ── Aelindra ──
  { id: "pain_de_gland", nom: "Pain de gland", rang: 1, indexDe: 1, registre: "commune",
    ingredients: [{ id: "farine_gland", qte: 2 }] },
  { id: "fromage_de_feuille", nom: "Fromage de feuille", rang: 3, indexDe: 1, registre: "commune",
    ingredients: [{ id: "lait_chevre_naine", qte: 2 }] },
  { id: "le_plat", nom: "Le Plat", rang: 3, indexDe: 4, registre: "commune",
    ingredients: [{ id: "chataigne_coeuvre", qte: 2 }, { id: "riz_valmeryl", qte: 1 }, { id: "cresson", qte: 1 }, { id: "huile_noisette", qte: 1 }] },
  { id: "sanglier_boucane", nom: "Sanglier boucané", rang: 3, indexDe: 4, registre: "occasion",
    ingredients: [{ id: "sanglier_aranil", qte: 2 }, { id: "herbe_fumee", qte: 1 }] },

  // ── Mordanel ──
  { id: "soupe_lanterne", nom: "Soupe-lanterne", rang: 2, indexDe: 1, registre: "commune",
    ingredients: [{ id: "champignon_lanterne", qte: 2 }, { id: "ail_ombres", qte: 1 }] },
  { id: "escargots_canopee", nom: "Escargots de canopée", rang: 3, indexDe: 1, registre: "haute",
    ingredients: [{ id: "escargots_canopee", qte: 2 }, { id: "seve_ambree", qte: 1 }, { id: "mousse_poivre", qte: 1 }] },
  { id: "prunes_pales_macerees", nom: "Prunes pâles macérées", rang: 2, indexDe: 0, registre: "commune",
    ingredients: [{ id: "prune_pale", qte: 2 }, { id: "seve_ambree", qte: 1 }] },
  { id: "vin_de_crepuscule", nom: "Vin de crépuscule", rang: 4, indexDe: 0, registre: "commune",
    ingredients: [{ id: "baie_crepuscule", qte: 3 }] },
  { id: "caille_de_brume", nom: "Caille de brume", rang: 3, indexDe: 2, registre: "occasion",
    ingredients: [{ id: "caille_brume", qte: 2 }] },

  // ── Kaldrun ──
  { id: "bouillie_de_cave", nom: "Bouillie de cave", rang: 1, indexDe: 1, registre: "commune",
    ingredients: [{ id: "cave_mousse", qte: 2 }, { id: "fromage_bleu_galerie", qte: 1 }, { id: "sel_gemme", qte: 1 }] },
  { id: "barrique_grillee", nom: "Barrique grillée", rang: 1, indexDe: 1, registre: "commune",
    ingredients: [{ id: "champignon_barrique", qte: 2 }] },
  { id: "pain_de_souche", nom: "Pain de souche", rang: 3, indexDe: 1, registre: "rite",
    ingredients: [{ id: "orge_galerie", qte: 2 }, { id: "levure_souche", qte: 1 }],
    effetDeclaratif: "Cuit avec la levure de la famille. Servi aux funérailles, il dit qui enterre qui. Un clan qui a perdu sa souche ne peut plus enterrer les siens." },
  { id: "biere_de_clan", nom: "Bière de clan", rang: 3, indexDe: 0, registre: "commune",
    ingredients: [{ id: "orge_galerie", qte: 2 }, { id: "houblon_serval", qte: 1 }, { id: "levure_souche", qte: 1 }] },
  { id: "boeuf_de_surface", nom: "Bœuf de surface", rang: 3, indexDe: 5, registre: "haute",
    ingredients: [{ id: "boeuf_serval", qte: 2 }, { id: "sel_gemme", qte: 1 }] },
  { id: "sombre_truffe_rapee", nom: "Sombre-truffe râpée", rang: 2, indexDe: 1, registre: "haute",
    ingredients: [{ id: "sombre_truffe", qte: 1 }, { id: "cave_mousse", qte: 1 }] },
  { id: "table_de_prestige", nom: "La Table de prestige", rang: 5, indexDe: 5, registre: "haute",
    // Amendement rang 5 (prompt_cuisine_bonus_rang5.md, étape 1) : ce nom
    // porte déjà celui-ci dans les amorces gastronomiques du document
    // source — pas une invention. Aucun ingrédient nouveau.
    // facteurNutritif 0,85 du prompt, traduit en indexDe via le même rapport
    // que service_aetharion ci-dessus : 0,85 / 0,95 × 6 ≈ 5,4 → indexDe 5 (2d8).
    ingredients: [{ id: "boeuf_serval", qte: 2 }, { id: "sombre_truffe", qte: 1 }, { id: "houblon_serval", qte: 1 }, { id: "sel_gemme", qte: 1 }],
    // Bœuf de surface descendu vivant, cuisine calorique naine.
    bonusTemporaire: { type: "testsCarac", valeur: 1, carac: "FOR", libelle: "+1 aux tests de FOR" } },

  // ── Khazrak Dûm ──
  { id: "chapeau_rouge_bouilli", nom: "Chapeau-rouge trois fois bouilli", rang: 3, indexDe: 1, registre: "commune",
    ingredients: [{ id: "chapeau_rouge", qte: 2 }],
    // Cadeau du lore : le document dit "mal bouilli, il rend malade — c'est
    // admis". La mécanique d'intoxication au désastre (cf. QUALITES ci-dessus)
    // est donc canoniquement ATTENDUE sur ce plat précis. Aucune règle
    // spéciale : le désastre standard suffit — seul l'avertissement UI change.
    avertissement: "Mal bouilli, il rend malade — c'est admis. Un désastre sur cette recette provoque une intoxication tout à fait canonique." },
  { id: "ver_grille", nom: "Ver grillé", rang: 2, indexDe: 2, registre: "commune",
    ingredients: [{ id: "ver_roche", qte: 2 }, { id: "poivre_cendre", qte: 1 }] },
  { id: "graisse_de_ver", nom: "Graisse de ver", rang: 1, indexDe: 0, registre: "basse",
    ingredients: [{ id: "ver_roche", qte: 1 }] },
  { id: "rat_des_veines", nom: "Rat des veines", rang: 1, indexDe: 1, registre: "basse",
    ingredients: [{ id: "rat_veines", qte: 2 }] },
  { id: "barbade_infusion", nom: "Barbade pâle en infusion", rang: 2, indexDe: 0, registre: "commune",
    ingredients: [{ id: "barbade_pale", qte: 1 }] },

  // ── Rites de table ──
  { id: "champignon_echo_prepare", nom: "Champignon-écho", rang: 2, indexDe: 0, registre: "rite",
    ingredients: [{ id: "champignon_echo", qte: 1 }],
    effetDeclaratif: "Grave la voix une heure. On ne jure pas d'une voix ordinaire : à prendre avant un serment de clan ou un chant de forge. Le MJ arbitre l'effet sur la scène concernée." },
  { id: "poisson_cloche_servi", nom: "Poisson-cloche", rang: 3, indexDe: 2, registre: "rite",
    ingredients: [{ id: "poisson_cloche", qte: 1 }] },
];

/* ── Exclusions volontaires (à ne PAS rajouter plus tard) ──────────
   - Le bol de poivre : "pas un plat, un affichage de revenu" (document).
   - Le bloc (sel gemme servalien) : usage de table, pas préparation.
   - Miel de bosquet : ingrédient qui "ne se cuisine pas, se donne" — vit
     dans le catalogue loot (miel_bosquet) avec son propre effetDeclaratif,
     jamais comme recette. N'apparaît dans AUCUNE liste d'ingrédients ici.
   ============================================================ */

if (typeof window !== "undefined") {
  window.REGISTRES_TABLE = REGISTRES_TABLE;
  window.ECHELLE_DES_PLAT = ECHELLE_DES_PLAT;
  window.QUALITES = QUALITES;
  window.CUISINE_RECETTES = CUISINE_RECETTES;
}
