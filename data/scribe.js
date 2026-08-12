/* ============================================================
   COF-COMPAGNO — Métier Scribe : matériel d'écriture et aléas.

   Le scribe copie un sort qu'il CONNAÎT sur un parchemin_<sortId> qui
   existe DÉJÀ au catalogue (72 sorts, 72 parchemins, couverture
   vérifiée). Il ne crée aucun objet nouveau — il rend fabricable ce
   qu'on ne pouvait qu'acheter.

   ── Le point d'équilibre, à ne pas perdre de vue ──────────────
   Le coût est en PP (le coût du sort lui-même, mecanique.coutPP — déjà
   2/4/6/16/25 par rang sur les 72 sorts, cf. data/donnees.js — jamais
   dupliqué ici dans une seconde table qui pourrait diverger), non
   récupérés avant le prochain repos long. Un magicien niveau 8 avec 25
   PP fait UN parchemin de rang 5, ou DOUZE de rang 1. La rentabilité est
   écrasante en bas de gamme, et c'est voulu : le scribe alimente la
   table en sorts d'entrée, il ne distribue pas des Boules de feu.
   Si l'économie dérape, c'est le coutPP des sorts qu'on regarde — pas la
   difficulté, pas le matériel.

   La qualité du jet ne change pas la puissance du parchemin (un sort
   est un sort) : elle change ce que la copie a COÛTÉ. Le maître scribe
   ne fait pas de meilleurs parchemins, il en fait plus avec le même
   pool. C'est la troisième façon dont un métier lit sa qualité, après
   les unités (Traque) et la portée (Musicien) — délibéré.
   ============================================================ */

// ── Matériel ─────────────────────────────────────────────────
// Trois emplacements, cumul plafonné à +5. Le papier de chiffe est le
// seul matériel à bonus NÉGATIF du jeu : c'est une option assumée pour
// un scribe fauché, pas une erreur de saisie.
const MATERIEL_SCRIBE = {
  encre: [
    { id: "encre_galle",      bonus: 0 },
    { id: "encre_ferrogallique", bonus: 1 },
    { id: "encre_seve",       bonus: 2 },
  ],
  support: [
    { id: "papier_chiffe",    bonus: -1 },
    { id: "velin_commun",     bonus: 0 },
    { id: "velin_fin",        bonus: 1 },
    { id: "velin_aetharion",  bonus: 2 },
  ],
  calame: [
    { id: "calame_roseau",    bonus: 0 },
    { id: "plume_oie",        bonus: 1 },
  ],
};

// ── Qualité du jet → coût réel de la copie ───────────────────
// parchemin : le parchemin est-il produit ?
// fautif    : se consume sans effet à la copie sur un 1-5 naturel (cf. Q12)
// materiel  : le matériel est-il consommé ?
// ppMult    : multiplicateur sur le coutPP du sort copié
const RESULTATS_SCRIBE = {
  desastre: { parchemin: false, fautif: false, materiel: true,  ppMult: 1,   alea: true  },
  rate:     { parchemin: false, fautif: false, materiel: true,  ppMult: 1,   alea: false },
  mediocre: { parchemin: true,  fautif: true,  materiel: true,  ppMult: 1,   alea: false },
  reussi:   { parchemin: true,  fautif: false, materiel: true,  ppMult: 1,   alea: false },
  bien:     { parchemin: true,  fautif: false, materiel: false, ppMult: 1,   alea: false },
  chef:     { parchemin: true,  fautif: false, materiel: false, ppMult: 0.5, alea: false },
};

// ── Table des aléas (d20), désastre uniquement ───────────────
// Volontairement plus courte et moins physique que ALEAS_RECOLTE : on
// se blesse en forêt, on gâche de l'encre à sa table. Les entrées
// narratives (16, 18, 19) n'appliquent rien et sont des amorces pour
// le MJ — c'est ce qui a le mieux marché sur la Traque.
const ALEAS_SCRIBE = [
  { d: 1,  id: "sort_decharge", nom: "Le sort se décharge",
    effet: { type: "degats", formule: "2d6" },
    texte: "L'incantation s'achève toute seule, sur la table, sur les mains." },
  { d: 2,  id: "encre_renversee", nom: "Encre renversée",
    effet: { type: "perteParchemin" },
    texte: "Un parchemin déjà écrit part avec la flaque." },
  { d: 3,  id: "epuisement_mental", nom: "Épuisement",
    effet: { type: "etat", id: "fatiguee", note: "Jusqu'au prochain repos long." },
    texte: "Six heures penché, et plus rien qui tienne debout derrière les yeux." },
  { d: 4,  id: "pp_gaspilles", nom: "Puits percé",
    effet: { type: "ppSupplementaires", formule: "1d4" },
    texte: "Ça a coûté plus que prévu, et on ne sait pas où c'est parti." },
  { d: 5,  id: "materiel_gache", nom: "Matériel gâché",
    effet: { type: "perteMateriel", tout: true },
    texte: "Toute la réserve d'encre, pas seulement la dose du jour." },
  { d: 6,  id: "main_tremblante", nom: "Main tremblante",
    effet: { type: "malusProchain", valeur: 2 },
    texte: "Elle ne se calmera pas avant demain." },
  { d: 7,  id: "rature", nom: "Rature",     effet: { type: "rien" },
    texte: "Un mot de travers à la dernière ligne. Tout est à refaire." },
  { d: 8,  id: "rature_b", nom: "Rature",   effet: { type: "rien" },
    texte: "La formule ne prend pas. Aucune raison apparente." },
  { d: 9,  id: "sceau_rate", nom: "Sceau raté", effet: { type: "rien" },
    texte: "Le rouleau ne se scelle pas. Un rouleau non scellé ne vaut rien." },
  { d: 10, id: "doute", nom: "Doute",       effet: { type: "rien" },
    texte: "Est-ce bien comme ça qu'on l'avait appris ?" },
  { d: 11, id: "interruption", nom: "Interruption", effet: { type: "rien" },
    texte: "Quelqu'un est entré. La concentration ne revient pas." },
  { d: 12, id: "lumiere", nom: "Mauvaise lumière", effet: { type: "rien" },
    texte: "On a écrit trois heures à la chandelle pour rien." },
  { d: 13, id: "recuperation", nom: "Récupération",
    effet: { type: "materielSauve" },
    texte: "Raté, mais le vélin est intact. On recommencera." },
  { d: 14, id: "recuperation_b", nom: "Récupération",
    effet: { type: "materielSauve" },
    texte: "L'encre est encore bonne. Ce n'est pas une journée perdue." },
  { d: 15, id: "ppRendus", nom: "Souffle repris",
    effet: { type: "ppRendus", formule: "1d4" },
    texte: "L'énergie n'est pas partie dans le vélin. Elle revient." },
  { d: 16, id: "marge", nom: "Note en marge", effet: { type: "info" },
    texte: "Une main plus ancienne a écrit quelque chose dans la marge. Le MJ décide quoi." },
  { d: 17, id: "lecon", nom: "Leçon", effet: { type: "xpBonus", valeur: 3 },
    texte: "On a compris pourquoi ça ratait. C'est déjà ça." },
  { d: 18, id: "palimpseste", nom: "Palimpseste", effet: { type: "info" },
    texte: "Sous l'encre neuve, un texte gratté remonte. Le MJ décide lequel." },
  { d: 19, id: "sceau_inconnu", nom: "Sceau inconnu", effet: { type: "info" },
    texte: "Le rouleau porte un sceau que le scribe ne reconnaît pas. Le MJ décide de qui." },
  { d: 20, id: "rattrapage", nom: "Rattrapage",
    effet: { type: "requalification", qualiteId: "mediocre" },
    texte: "Sauvé à la dernière ligne, mais la copie restera fautive." },
];

if (typeof window !== "undefined") {
  window.MATERIEL_SCRIBE = MATERIEL_SCRIBE;
  window.RESULTATS_SCRIBE = RESULTATS_SCRIBE;
  window.ALEAS_SCRIBE = ALEAS_SCRIBE;
}
