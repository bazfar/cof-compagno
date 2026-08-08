/* ============================================================
   COF-COMPAGNO — Météo : registres, échelle d'intensité 1-20,
   paliers de modificateurs, climats et mapping régional.

   Le d20 donne l'INTENSITÉ (1 = calme, 20 = déchaîné). Le TYPE de
   temps vient du registre (tempéré / froid / aride), qui dépend du
   couple RÉGION × SAISON — pas de la région seule.

   Pourquoi région × saison et pas région seule : un climat continental
   (Solvarn, Valdorne, Arveth) est froid en hiver ET aride en été. Un
   climat méditerranéen (Mornac, Liberra nord) est aride en été et
   tempétueux en hiver. Fixer un registre par région rendrait ces deux
   climats indistinguables d'un climat tempéré plat.

   Les trois registres ont volontairement des COURBES DIFFÉRENTES.
   Si on les aligne, ils ne sont plus que des reskins :
     - tempéré : la pluie punit le TIR (air chargé, ligne de vue courte)
     - froid   : la neige punit la MARCHE et le CORPS, pas le tir
                 (air froid = stable), et laisse des TRACES — le bonus
                 de discrétion s'achète par un malus de poursuite
     - aride   : la chaleur ne gêne ni le tir ni la vue, elle INVERSE
                 la discrétion aux paliers bas (on voit venir de loin)

   Tous ces modificateurs sont SYMÉTRIQUES : ils s'appliquent aux
   monstres et PNJ autant qu'aux PJ.
   ============================================================ */

// ── Les 20 temps, par registre ───────────────────────────────
// Index du tableau = intensité − 1.
const TEMPS_PAR_REGISTRE = {
  tempere: [
    "Ciel lavé", "Beau, brise légère", "Voile de cirrus", "Ciel gris, sec",
    "Bruine", "Crachin", "Brume matinale", "Pluie fine continue",
    "Vent soutenu", "Averses", "Brouillard épais", "Pluie battante",
    "Bourrasques", "Pluie et vent", "Grain", "Orage",
    "Trombes d'eau", "Tempête", "Grêle", "Déchaînement",
  ],
  froid: [
    "Froid vif, ciel bleu", "Gelée blanche", "Air sec et mordant", "Ciel bas, sans neige",
    "Givre persistant", "Premiers flocons", "Brume glacée", "Neige fine continue",
    "Vent du nord", "Averses de neige", "Brouillard gelé", "Neige soutenue",
    "Poudrerie", "Neige et vent", "Verglas", "Tourmente",
    "Neige lourde", "Blizzard", "Grésil et verglas", "Nuit blanche",
  ],
  aride: [
    "Ciel de plomb, air clair", "Chaud et sec", "Ciel blanc", "Voile de poussière haute",
    "Chaleur lourde", "Souffle chaud", "Miroitement, mirages", "Chaleur continue",
    "Vent sec", "Bourrasques de poussière", "Brume de sable", "Canicule",
    "Rafales chargées", "Vent et sable", "Voile ocre", "Sirocco",
    "Ciel orange", "Tempête de sable", "Sable coupant", "Le Souffle",
  ],
};

// Les trois entrées 20 (Déchaînement / Nuit blanche / Le Souffle) sont
// volontairement "trop violentes pour être naturelles" : crochet narratif
// direct vers Khoreth et l'Inquisition de Solvarn. Ne pas les banaliser.

const REGISTRES_METEO = [
  { id: "tempere", nom: "Tempéré", icone: "🌧" },
  { id: "froid",   nom: "Froid",   icone: "❄️" },
  { id: "aride",   nom: "Aride",   icone: "🔥" },
];

const SAISONS_METEO = [
  { id: "printemps", nom: "Printemps" },
  { id: "ete",       nom: "Été" },
  { id: "automne",   nom: "Automne" },
  { id: "hiver",     nom: "Hiver" },
];

// ── Climats ──────────────────────────────────────────────────
// Une cellule par saison : { registre, fenetre: [min, max] }.
//
// `fenetre` borne à la fois le premier jet et la dérive quotidienne.
// Sans elle, une marche aléatoire ±1d6 finit toujours collée à une borne
// 1 ou 20 et y reste — la météo deviendrait un cliquet, pas un climat.
// C'est aussi la fenêtre qui porte la SIGNATURE du climat : un été
// méditerranéen est sec ET stable (1-14), un hiver méditerranéen reste
// tempéré mais devient tempétueux (3-18). La côte de Mornac est
// dangereuse en janvier et molle en juillet — c'est voulu.
const CLIMATS_METEO = {
  continental: {
    nom: "Continental",
    printemps: { registre: "tempere", fenetre: [1, 16] },
    ete:       { registre: "aride",   fenetre: [3, 16] },
    automne:   { registre: "tempere", fenetre: [1, 16] },
    hiver:     { registre: "froid",   fenetre: [4, 20] },
  },
  mediterraneen: {
    nom: "Méditerranéen",
    printemps: { registre: "tempere", fenetre: [1, 14] },
    ete:       { registre: "aride",   fenetre: [1, 14] },
    automne:   { registre: "tempere", fenetre: [2, 17] },
    hiver:     { registre: "tempere", fenetre: [3, 18] },
  },
  chaud: {
    nom: "Chaud",
    printemps: { registre: "tempere", fenetre: [1, 14] },
    ete:       { registre: "aride",   fenetre: [4, 18] },
    automne:   { registre: "aride",   fenetre: [4, 18] },
    hiver:     { registre: "tempere", fenetre: [1, 14] },
  },
  montagnard: {
    nom: "Montagnard",
    printemps: { registre: "froid",   fenetre: [3, 16] },
    ete:       { registre: "tempere", fenetre: [1, 14] },
    automne:   { registre: "froid",   fenetre: [3, 16] },
    hiver:     { registre: "froid",   fenetre: [6, 20] },
  },
  aride: {
    nom: "Aride",
    printemps: { registre: "aride",   fenetre: [3, 18] },
    ete:       { registre: "aride",   fenetre: [5, 20] },
    automne:   { registre: "aride",   fenetre: [3, 18] },
    hiver:     { registre: "tempere", fenetre: [1, 14] },
  },
  // Deux climats souterrains DISTINCTS : aucun jet dans les deux cas,
  // mais Khazrak Dûm est chaud. Pas de météo, pas de malus de visibilité
  // ni de tir — et pourtant l'eau y coûte le double en permanence. Les
  // Failles Rouges sont le seul endroit du monde où on ne peut ni se
  // cacher dans le mauvais temps ni compter sur la pluie.
  souterrain_froid: { nom: "Souterrain (froid)", souterrain: true, effetPermanent: null },
  souterrain_chaud: { nom: "Souterrain (chaud)", souterrain: true, effetPermanent: { eau: 2 } },
};

// ── Régions → climat ─────────────────────────────────────────
// Géographie validée (cf. LORE > nations, data/donnees.js).
const REGIONS_METEO = [
  // Continent occidental
  { id: "solvarn",       nom: "Solvarn (Solmaris)",              climat: "continental" },
  { id: "valdorne",      nom: "Valdorne (Valdecourt, Haldren)",  climat: "continental" },
  { id: "arveth",        nom: "Arveth (Arvenfall, Boigris)",     climat: "continental" },
  { id: "mornac",        nom: "Mornac (Mornhaven, Port-Saphir)", climat: "mediterraneen" },
  { id: "liberra_nord",  nom: "Liberra nord (Libris)",           climat: "mediterraneen" },
  { id: "liberra_sud",   nom: "Liberra sud",                     climat: "chaud" },
  { id: "serval",        nom: "Serval (Contreforts, cols)",      climat: "montagnard" },
  { id: "failles",       nom: "Failles Rouges (surface)",        climat: "aride" },
  { id: "terres_orques", nom: "Terres sauvages orques",          climat: "aride" },
  { id: "kaldrun",       nom: "Kaldrun / Forge-Runez",           climat: "souterrain_froid" },
  { id: "karag_dum",     nom: "Karag Dûm / Grimgal",             climat: "souterrain_chaud" },
  // Continent oriental — POSÉ PAR DÉFAUT, non validé par Thomas.
  // Étagement nord→sud calqué sur le continent occidental. À corriger
  // dès qu'il tranche : trois lignes, rien d'autre à toucher.
  { id: "aetharion",     nom: "Aetharion (Elyndoril)",           climat: "mediterraneen" },
  { id: "aelindra",      nom: "Aelindra (Cœuvre)",               climat: "mediterraneen" },
  { id: "mordanel",      nom: "Mordanel (Valdourt)",             climat: "chaud" },
];

// ── Rudesse de l'année ───────────────────────────────────────
// Dial MJ, indépendant du climat : décale le jet et la fenêtre. Permet
// une "mauvaise année" sans retoucher la table des climats.
const RUDESSE_ANNEE = [
  { id: "clemente", nom: "Clémente", mod: -2 },
  { id: "normale",  nom: "Normale",  mod: 0 },
  { id: "rude",     nom: "Rude",     mod: 2 },
];

// ── Paliers de modificateurs ─────────────────────────────────
// 5 paliers de 4 points d'intensité. Vingt jeux de modificateurs
// seraient impraticables à table : les 20 entrées portent la couleur,
// les 5 paliers portent la mécanique.
//
// Champs :
//   discretion / detection / distance : modificateur entier au jet
//   traces    : bonus au pistage DU groupe (registre froid uniquement)
//   portee    : { type: "aucun" | "pourcent" | "divise" | "fixe" | "bonus",
//                 valeur } appliqué à porteeMaxCases
//   voyage    : { terrainDifficile, vitesse (1 ou 0.5), testCon }
//   social    : bonus aux tests sociaux EN INTÉRIEUR (taverne, auberge)
//   exposition: null | { testCon: difficulté } — échec → état "fatiguee"
//   eau       : multiplicateur de consommation (registre aride)
const PALIERS_METEO = {
  tempere: [
    { min: 1,  max: 4,  nom: "Sec",      discretion: 0, detection: 0,  distance: 0,  portee: { type: "aucun" },                  voyage: { terrainDifficile: false, vitesse: 1,   testCon: false }, social: 0, exposition: null },
    { min: 5,  max: 8,  nom: "Humide",   discretion: 1, detection: -1, distance: -1, portee: { type: "aucun" },                  voyage: { terrainDifficile: false, vitesse: 1,   testCon: false }, social: 1, exposition: null },
    { min: 9,  max: 12, nom: "Mauvais",  discretion: 2, detection: -2, distance: -2, portee: { type: "pourcent", valeur: 0.75 }, voyage: { terrainDifficile: true,  vitesse: 1,   testCon: false }, social: 2, exposition: null },
    { min: 13, max: 16, nom: "Violent",  discretion: 2, detection: -2, distance: -4, portee: { type: "divise",   valeur: 2 },    voyage: { terrainDifficile: true,  vitesse: 0.5, testCon: false }, social: 2, exposition: null },
    { min: 17, max: 20, nom: "Déchaîné", discretion: 4, detection: -4, distance: -4, portee: { type: "fixe",     valeur: 2 },    voyage: { terrainDifficile: true,  vitesse: 0.5, testCon: true  }, social: 2, exposition: { testCon: 14 } },
  ],
  froid: [
    { min: 1,  max: 4,  nom: "Froid sec",    discretion: 0, detection: 0,  distance: 0,  traces: 0, portee: { type: "aucun" },                  voyage: { terrainDifficile: false, vitesse: 1,   testCon: false }, social: 0, exposition: null },
    { min: 5,  max: 8,  nom: "Gel",          discretion: 1, detection: 0,  distance: 0,  traces: 2, portee: { type: "aucun" },                  voyage: { terrainDifficile: false, vitesse: 1,   testCon: false }, social: 1, exposition: null },
    { min: 9,  max: 12, nom: "Neige",        discretion: 2, detection: -2, distance: -1, traces: 4, portee: { type: "aucun" },                  voyage: { terrainDifficile: true,  vitesse: 1,   testCon: false }, social: 2, exposition: null },
    { min: 13, max: 16, nom: "Neige lourde", discretion: 3, detection: -2, distance: -2, traces: 4, portee: { type: "pourcent", valeur: 0.75 }, voyage: { terrainDifficile: true,  vitesse: 0.5, testCon: false }, social: 3, exposition: { testCon: 12 } },
    { min: 17, max: 20, nom: "Blizzard",     discretion: 4, detection: -4, distance: -4, traces: 0, portee: { type: "divise",   valeur: 2 },    voyage: { terrainDifficile: true,  vitesse: 0.5, testCon: true  }, social: 3, exposition: { testCon: 16 } },
  ],
  aride: [
    // discretion NÉGATIVE aux paliers bas : ce n'est pas une faute de signe.
    // L'air est si clair qu'on voit venir de très loin — se cacher est plus
    // dur qu'en temps neutre. C'est l'identité mécanique du registre aride.
    { min: 1,  max: 4,  nom: "Air clair",         discretion: -2, detection: 2,  distance: 0,  portee: { type: "bonus", valeur: 1 },       voyage: { terrainDifficile: false, vitesse: 1,   testCon: false }, social: 0, eau: 1, exposition: null },
    { min: 5,  max: 8,  nom: "Chaleur",           discretion: -1, detection: 1,  distance: 0,  portee: { type: "aucun" },                  voyage: { terrainDifficile: false, vitesse: 1,   testCon: false }, social: 0, eau: 1, exposition: null },
    { min: 9,  max: 12, nom: "Canicule",          discretion: -1, detection: 0,  distance: 0,  portee: { type: "aucun" },                  voyage: { terrainDifficile: false, vitesse: 1,   testCon: true  }, social: 1, eau: 2, exposition: null },
    { min: 13, max: 16, nom: "Vent chargé",       discretion: 1,  detection: -2, distance: -2, portee: { type: "pourcent", valeur: 0.75 }, voyage: { terrainDifficile: true,  vitesse: 0.5, testCon: true  }, social: 2, eau: 2, exposition: { testCon: 12 } },
    { min: 17, max: 20, nom: "Tempête de sable",  discretion: 4,  detection: -4, distance: -4, portee: { type: "fixe", valeur: 2 },        voyage: { terrainDifficile: true,  vitesse: 0.5, testCon: true  }, social: 2, eau: 3, exposition: { testCon: 16 } },
  ],
};

if (typeof window !== "undefined") {
  window.TEMPS_PAR_REGISTRE = TEMPS_PAR_REGISTRE;
  window.REGISTRES_METEO = REGISTRES_METEO;
  window.SAISONS_METEO = SAISONS_METEO;
  window.CLIMATS_METEO = CLIMATS_METEO;
  window.REGIONS_METEO = REGIONS_METEO;
  window.RUDESSE_ANNEE = RUDESSE_ANNEE;
  window.PALIERS_METEO = PALIERS_METEO;
}
