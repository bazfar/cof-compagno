/* ============================================================
   COF-COMPAGNO — Récolte : milieux, paliers de rareté, rendement,
   table des aléas. Données pures — le moteur est dans js/recolte.js,
   l'intégration au repos long dans js/repos.js.

   Deux métiers récoltent (cf. data/metiers.js) : `traque` prélève la
   FAUNE, `alchimie` la FLORE. Le partage est strict et porté par le
   champ `recolte` de chaque entrée de data/loot.json — aucun métier
   ne peut récolter dans le domaine de l'autre, c'est ce qui crée
   l'interdépendance de table (les réactifs de poison viennent du
   traqueur, les plantes de l'alchimiste).

   ── Pourquoi une base de seuil à 10 et pas 8 comme la cuisine ──────
   Le jet de cuisine est volontairement NU (cf. data/metiers.js,
   METIERS.cuisine.caracteristique === null) : la difficulté est portée
   entièrement par l'écart de rang. Le jet de récolte porte au contraire
   des modificateurs (carac + compétence Survie + météo), parce que le
   métier doit récompenser le Chasseur et le Druide plutôt que doubler
   la Cuisine. La base est donc relevée de 8 à 10 pour compenser. Ne PAS
   "harmoniser" ça avec Cuisine.seuilEffectif plus tard : les deux
   formules ont la même FORME et des bases différentes, délibérément.
   ============================================================ */

// ── Milieux ──────────────────────────────────────────────────
const MILIEUX_RECOLTE = [
  { id: "foret",      nom: "Forêt",           icone: "🌲" },
  { id: "plaine",     nom: "Plaine",          icone: "🌾" },
  { id: "eau_douce",  nom: "Eau douce",       icone: "🎣" }, // rivière, marais, lac
  { id: "montagne",   nom: "Montagne",        icone: "⛰️" },
  { id: "littoral",   nom: "Littoral",        icone: "🌊" },
  { id: "souterrain", nom: "Souterrain",      icone: "🕳️" },
];

// ── Régions → nations d'origine des vivres ───────────────────
// Pont entre les ids de REGIONS_METEO (data/meteo.js) et le champ
// `origine` des vivres (data/loot.json), qui ne parlent pas le même
// vocabulaire. Une région donne accès aux espèces dont l'origine est
// "partout", l'une des nations listées, ou le BLOC de cette nation
// (cf. data/marche.js, _blocDe) — la résolution du bloc est faite
// côté moteur, pas ici.
const NATIONS_PAR_REGION = {
  solvarn:       ["solvarn"],
  valdorne:      ["valdorne"],
  arveth:        ["arveth"],
  mornac:        ["mornac"],
  liberra_nord:  ["liberra"],
  liberra_sud:   ["liberra"],
  serval:        ["serval"],
  failles:       ["khazrak"],
  terres_orques: [],            // aucune nation d'origine : "partout" seulement
  kaldrun:       ["kaldrun"],
  karag_dum:     ["khazrak"],
  aetharion:     ["aetharion"],
  aelindra:      ["aelindra"],
  mordanel:      ["mordanel"],
};

// ── Milieux disponibles par région ───────────────────────────
// Empêche de pêcher en galerie naine ou de chasser le sanglier dans
// les Failles Rouges. Le joueur ne voit que les milieux de sa région
// courante (cf. Meteo.obtenirEtat().regionId).
const MILIEUX_PAR_REGION = {
  solvarn:       ["foret", "plaine", "eau_douce"],
  valdorne:      ["foret", "plaine", "eau_douce", "littoral"],
  arveth:        ["plaine", "montagne", "foret"],
  mornac:        ["foret", "plaine", "eau_douce", "littoral"],
  liberra_nord:  ["plaine", "eau_douce", "littoral", "foret"],
  liberra_sud:   ["plaine", "eau_douce", "littoral"],
  serval:        ["montagne", "foret", "eau_douce"],
  failles:       ["montagne", "souterrain"],
  terres_orques: ["plaine", "montagne"],
  kaldrun:       ["souterrain"],
  karag_dum:     ["souterrain"],
  aetharion:     ["foret", "eau_douce", "montagne"],
  aelindra:      ["foret", "eau_douce", "plaine"],
  mordanel:      ["foret", "souterrain", "eau_douce"],
};

// ── Paliers de rareté ────────────────────────────────────────
// rangCible alimente la formule de seuil (js/recolte.js) EXACTEMENT
// comme recette.rang alimente Cuisine.seuilEffectif. rangMin est la
// condition d'accès : on peut toujours viser un cran au-dessus de son
// rang, jamais deux — d'où un seuil de 12 pour toute cible "en
// extension", quel que soit le rang du personnage.
const RARETES_RECOLTE = {
  commun:     { nom: "Commun",     rangCible: 1, rangMin: 0 },
  peu_commun: { nom: "Peu commun", rangCible: 2, rangMin: 1 },
  rare:       { nom: "Rare",       rangCible: 3, rangMin: 2 },
  legendaire: { nom: "Légendaire", rangCible: 5, rangMin: 4 },
};

// ── Rendement en unités ──────────────────────────────────────
// Calibré sur la Cuisine : une recette demande 1 à 3 unités d'un
// ingrédient et un repos long nourrit 4 convives. Le commun est le
// seul palier qui remplit vraiment une besace ; le légendaire ne donne
// JAMAIS plus d'une unité, quelle que soit la qualité du jet.
// Clés = ids de QUALITES (data/cuisine.js), réutilisées telles quelles.
const RENDEMENT_RECOLTE = {
  desastre: { commun: 0, peu_commun: 0, rare: 0, legendaire: 0 },
  rate:     { commun: 0, peu_commun: 0, rare: 0, legendaire: 0 },
  mediocre: { commun: 2, peu_commun: 1, rare: 1, legendaire: 0 },
  reussi:   { commun: 4, peu_commun: 2, rare: 1, legendaire: 1 },
  bien:     { commun: 6, peu_commun: 3, rare: 2, legendaire: 1 },
  chef:     { commun: 8, peu_commun: 4, rare: 2, legendaire: 1 },
};

// ── Table des aléas (d20) ────────────────────────────────────
// Lancée UNIQUEMENT sur un désastre (jet naturel de 1, ou total ≤ S−8).
// Une seule table pour les deux métiers : l'effet mécanique est commun,
// seul l'habillage change (champs `traque` / `alchimie`, purement
// descriptifs, jamais lus par le moteur).
//
// Types d'effet :
//   rencontre      { majeure } → drapeau MJ, le repos n'est PAS interrompu
//   degats         { formule, etat? }
//   etat           { id, note }
//   perteObjet     → arbitrage MJ (l'app ne choisit pas l'objet)
//   perteVivres    { formule }
//   blocageProchain→ pas de récolte au prochain repos long
//   rien
//   bonusProchain  { valeur } → reporté sur le prochain jet DANS CE MILIEU
//   info           → le MJ donne une information sur la région
//   unites         { nb | formule, rarete } → récolte de consolation
//   malusSocial    { valeur } → jusqu'au prochain repos long
//   requalification{ qualiteId } → le désastre est requalifié
const ALEAS_RECOLTE = [
  { d: 1,  id: "rencontre_majeure", nom: "Rencontre majeure",
    effet: { type: "rencontre", majeure: true },
    traque: "La piste menait droit à un repaire.",
    alchimie: "La clairière était déjà occupée." },
  { d: 2,  id: "rencontre", nom: "Rencontre",
    effet: { type: "rencontre", majeure: false },
    traque: "La bête se retourne.",
    alchimie: "On a dérangé quelque chose." },
  { d: 3,  id: "blessure_grave", nom: "Blessure grave",
    effet: { type: "degats", formule: "2d6", etat: "ralentie" },
    traque: "Encornage, puis la chute.",
    alchimie: "L'éboulis a cédé sous les pieds." },
  { d: 4,  id: "envenime", nom: "Envenimé",
    effet: { type: "etat", id: "empoisonnee", note: "Durée arbitrée par le MJ." },
    traque: "Une morsure qu'on n'a pas vue venir.",
    alchimie: "Sève caustique, plein les mains." },
  { d: 5,  id: "intoxication", nom: "Intoxication",
    effet: { type: "etat", id: "intoxication", note: "Jusqu'au prochain repos long." },
    traque: "De la viande goûtée trop vite.",
    alchimie: "Des spores inhalées sans y penser." },
  { d: 6,  id: "hallucination", nom: "Hallucination",
    effet: { type: "etat", id: "hallucinee", note: "Une heure." },
    traque: "Des baies grignotées en marchant.",
    alchimie: "Un champignon mal identifié." },
  { d: 7,  id: "blessure_legere", nom: "Blessure légère",
    effet: { type: "degats", formule: "1d6" },
    traque: "Une ronce, une pierre, rien de grave.",
    alchimie: "Une ronce, une pierre, rien de grave." },
  { d: 8,  id: "epuisement", nom: "Épuisement",
    effet: { type: "etat", id: "fatiguee", note: "Jusqu'au prochain repos long." },
    traque: "Une poursuite pour rien, jusqu'à la nuit.",
    alchimie: "Une journée entière à quatre pattes." },
  { d: 9,  id: "materiel_perdu", nom: "Matériel perdu",
    effet: { type: "perteObjet" },
    traque: "Arc décordé, collet laissé sur place.",
    alchimie: "Les fioles se sont brisées dans la besace." },
  { d: 10, id: "besace_ouverte", nom: "Besace ouverte",
    effet: { type: "perteVivres", formule: "1d4" },
    traque: "La sangle a lâché quelque part sur le chemin.",
    alchimie: "La sangle a lâché quelque part sur le chemin." },
  { d: 11, id: "egare", nom: "Égaré",
    effet: { type: "blocageProchain" },
    traque: "Un cercle, toute la nuit, sans le savoir.",
    alchimie: "Le sentier n'était plus là au retour." },
  { d: 12, id: "bredouille_a", nom: "Bredouille",
    effet: { type: "rien" },
    traque: "Rien. Vraiment rien.",
    alchimie: "Rien. Vraiment rien." },
  { d: 13, id: "bredouille_b", nom: "Bredouille",
    effet: { type: "rien" },
    traque: "La journée n'a rien donné.",
    alchimie: "La journée n'a rien donné." },
  { d: 14, id: "terrain_appris", nom: "Terrain appris",
    effet: { type: "bonusProchain", valeur: 2 },
    traque: "Les coulées sont repérées, maintenant.",
    alchimie: "Le sous-bois est cartographié dans la tête." },
  { d: 15, id: "peur_bleue", nom: "Peur bleue",
    effet: { type: "info", etat: "effrayee" },
    traque: "Ce n'était pas un animal.",
    alchimie: "Ce n'était pas une plante." },
  { d: 16, id: "maigre_consolation", nom: "Maigre consolation",
    effet: { type: "unites", nb: 1, rarete: "commun" },
    traque: "Presque rien, mais pas les mains vides.",
    alchimie: "Presque rien, mais pas les mains vides." },
  { d: 17, id: "charogne", nom: "Charogne",
    effet: { type: "unites", formule: "1d4", rarete: "commun", malusSocial: 2 },
    traque: "Revient couvert de sang jusqu'aux coudes.",
    alchimie: "Revient poissé de sève, et ça ne part pas." },
  { d: 18, id: "piste_inattendue", nom: "Piste inattendue",
    effet: { type: "bonusProchain", valeur: 4 },
    traque: "Rien ce soir, mais demain, oui.",
    alchimie: "Rien ce soir, mais demain, oui." },
  { d: 19, id: "rattrapage", nom: "Rattrapage",
    effet: { type: "requalification", qualiteId: "mediocre" },
    traque: "Sauvé de justesse, au dernier moment.",
    alchimie: "Sauvé de justesse, au dernier moment." },
  { d: 20, id: "coup_de_chance", nom: "Coup de chance",
    effet: { type: "unites", nb: 1, rarete: "rare", ignorerRang: true },
    traque: "Une bête déjà blessée, tombée là par hasard.",
    alchimie: "Un pied isolé, en fleur hors saison." },
];

if (typeof window !== "undefined") {
  window.MILIEUX_RECOLTE = MILIEUX_RECOLTE;
  window.NATIONS_PAR_REGION = NATIONS_PAR_REGION;
  window.MILIEUX_PAR_REGION = MILIEUX_PAR_REGION;
  window.RARETES_RECOLTE = RARETES_RECOLTE;
  window.RENDEMENT_RECOLTE = RENDEMENT_RECOLTE;
  window.ALEAS_RECOLTE = ALEAS_RECOLTE;
}
