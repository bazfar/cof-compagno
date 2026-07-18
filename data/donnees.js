/* ============================================================
   Chroniques Oubliées Fantasy — Données du jeu (homebrew)
   Extrait fidèlement des 8 PDF de référence.
   Ne pas modifier à la main sans raison : c'est la source de vérité.

   mecanique.portee / mecanique.zone : exprimés en CASES de grille
   (dd2vtt), pas en mètres — 1 case = 2 m (ratio validé avec Thomas,
   cohérent avec PORTEE_MAGIQUE_BASE = 5 cases pour 10 m côté js/app.js).
   Convertis depuis les mètres du texte "effet" (qui reste, lui, en
   mètres — libellé fidèle au livre de règles) par arrondi à
   l'inférieur (ex. 15 m → 7 cases, pas 8). Ces deux champs restent non
   lus par le moteur actuel (aucun vérificateur de portée pour les
   capacités/sorts, contrairement aux armes via porteeMinCases/
   porteeMaxCases) — préparés pour un futur système de portée basé sur
   les cases plutôt que sur une conversion à la volée.
   ============================================================ */

const CARACS = [
  { code: "FOR", nom: "Force" },
  { code: "DEX", nom: "Dextérité" },
  { code: "CON", nom: "Constitution" },
  { code: "INT", nom: "Intelligence" },
  { code: "SAG", nom: "Sagesse" },
  { code: "CHA", nom: "Charisme" },
];

/* Compétences et tests associés à chaque caractéristique.
   Sert de référence pour tout futur système de jets de compétence
   (actuellement non modélisé côté combat/capacités). */
const COMPETENCES_PAR_CARAC = {
  FOR: ["Athlétisme"],
  DEX: ["Discrétion", "Acrobaties", "Escamotage"],
  CON: [], // pas de compétence dédiée : PV, résistance poison/maladie, apnée, marches forcées
  INT: ["Connaissances (arcanes)", "Connaissances (histoire)", "Connaissances (nature)", "Investigation", "Artisanat"],
  SAG: ["Perception", "Discernement", "Survie", "Médecine", "Dressage"],
  CHA: ["Bluff", "Intimidation", "Représentation", "Persuasion"],
};

/* Les 3 jets de sauvegarde de COF, chacun porté par une seule caractéristique.
   FOR, INT et CHA n'ont pas de sauvegarde dédiée. */
const SAUVEGARDES = {
  Reflexes: "DEX",
  Vigueur: "CON",
  Volonte: "SAG",
};

/* Caractéristique de référence pour l'attaque magique de chaque classe.
   Sert au calcul automatique du bonus d'attaque magique. */
const CARAC_MAGIE = {
  barde: "CHA",
  pretre: "SAG",
  necromancien: "INT",
  druide: "SAG",
  enchanteur: "CHA",
  moine: "SAG",
  magicien: "INT",
  // guerrier, chasseur & chevalier : pas de magie
};

/* Archétype de progression du bonus d'attaque (jet uniquement, pas les dégâts) par classe. */
const ARCHETYPE_CLASSE = {
  guerrier: "martial", chevalier: "martial", chasseur: "martial",
  pretre: "hybride", druide: "hybride", barde: "hybride", moine: "hybride",
  magicien: "lanceur", necromancien: "lanceur", enchanteur: "lanceur",
};
/* Niveaux requis pour gagner +1 au bonus d'attaque selon l'archétype. */
const DIVISEUR_ATTAQUE = { martial: 2, hybride: 2, lanceur: 3 };

/* Famille de caractéristique associée à chaque classe, utilisée pour le coût
   d'ouverture des voies hors profil lors d'une montée de niveau. */
const FAMILLE_CLASSE = {
  guerrier: "FOR", chevalier: "FOR",
  chasseur: "DEX",
  pretre: "SAG", druide: "SAG", moine: "SAG",
  magicien: "INT", necromancien: "INT",
  barde: "CHA", enchanteur: "CHA",
};

/* Bonus de caractéristiques par classe pour la répartition en création
   (point-buy homebrew) : +2 sur la carac. principale, +1 sur la secondaire. */
const CLASS_BONUS_CARACS = {
  guerrier: { plus2: "FOR", plus1: "CON" },
  chevalier: { plus2: "FOR", plus1: "CHA" },
  moine: { plus2: "SAG", plus1: "DEX" },
  pretre: { plus2: "SAG", plus1: "CON" },
  druide: { plus2: "SAG", plus1: "CON" },
  magicien: { plus2: "INT", plus1: "CON" },
  necromancien: { plus2: "INT", plus1: "SAG" },
  barde: { plus2: "CHA", plus1: "DEX" },
  enchanteur: { plus2: "CHA", plus1: "INT" },
  chasseur: { plus2: "DEX", plus1: "CON" },
};

/* Catalogue des créatures invocables par capacité, pour poser un jeton de
   combat (Carte.ajouterTokenData) plutôt que de suivre l'invocation à la
   seule voix du MJ. voie/rangRequis pointent vers l'entrée réelle dans
   CLASSES[classe].voies pour vérifier que le personnage l'a bien acquise
   (cf. Personnage.capaciteEntree). pvMax/attaqueBonus null = valeur
   dynamique, résolue à l'invocation à partir du personnage invocateur
   (cf. js/carte.js, ouvrirModalInvocation/_resoudreInvocation) plutôt que
   figée ici. */
const INVOCATIONS = [
  {
    id: "zombie_necromancien",
    nom: "Zombie",
    classe: "necromancien", voie: "Voie de l'outre-tombe", rangRequis: 2,
    pvMax: 12, def: 10, armure: 0, init: 8, attaqueBonus: 3, degats: "1d6+1",
    description: "Init 8, DEF 10, PV 12, Att +3, DM 1d6+1. Se dégrade de 1 PV/minute (sauf rang 4 « Renfort macabre » qui l'arrête et ajoute +2 attaque/+5 PV).",
  },
  {
    id: "compagnon_druide",
    nom: "Compagnon animal (oiseau de proie)",
    classe: "druide", voie: "Voie des compagnons", rangRequis: 3,
    pvMax: 10, def: 12, armure: 0, init: null, attaqueBonus: null, degats: "1d4",
    description: "Att = attaque magique du Druide, DM 1d4. Lien télépathique, perception partagée (+5 — non chiffré ici). PV non précisés par le texte officiel : 10 par défaut, ajustable à la table.",
  },
  {
    id: "creature_corrompue_druide",
    nom: "Créature corrompue (Invocation tainted)",
    classe: "druide", voie: "Voie du chaos", rangRequis: 3,
    pvMax: null, def: 10, armure: 0, init: null, attaqueBonus: null, degats: "1d8",
    description: "PV = niveau × 2, Att = attaque du Druide − 2, DM 1d8. Ne dure que [1d4+1] tours — retire le jeton manuellement à expiration.",
  },
  {
    id: "barricade_guerrier",
    nom: "Barricade improvisée",
    classe: "guerrier", voie: "Voie de l'ingénieur", rangRequis: 3,
    // pvMaxFormule (résolue via Capacites.resoudreExpression, comme les
    // formules de dégâts/soin) plutôt que le fallback "pvMax null = niveau×2"
    // déjà câblé pour Créature corrompue — la barricade suit sa propre
    // formule (10 + Niveau, texte d'origine de Fortification de fortune).
    pvMax: null, pvMaxFormule: "10+niveau", def: 10, armure: 0, init: null, attaqueBonus: null, degats: null,
    // sansAttaque : token posé sans capacité d'attaque — bloque une case,
    // n'apparaît jamais dans le sélecteur de cible d'attaque des monstres.
    sansAttaque: true,
    description: "10 PV + Niveau, DEF 10. N'attaque jamais — bloque une case du champ de bataille (Fortification de fortune, Voie de l'ingénieur rang 3). Le bonus +2 DEF aux alliés abrités est accordé séparément, pas par ce jeton.",
  },
  {
    id: "cauchemar_enchanteur",
    nom: "Cauchemar incarné",
    classe: "enchanteur", voie: "Voie du chaos", rangRequis: 5,
    // pvMax: null sans pvMaxFormule -> repli générique "niveau × 2" déjà câblé
    // dans _resoudreInvocation (même défaut que Créature corrompue du
    // Druide) : le texte source ne chiffre aucun PV pour cette illusion.
    pvMax: null, def: 10, armure: 0, init: null, attaqueBonus: null, degats: "1d6",
    description: "PV = niveau × 2 (par défaut, non chiffré par le texte source), Att = attaque magique de l'Enchanteur, DM 1d6 (assumé, à ajuster avec Thomas si besoin). Ne dure que [Mod. de CHA] tours — retire le jeton manuellement à expiration, comme Créature corrompue (Druide).",
  },
];

const CLASSES = {
  guerrier: {
    classe: "guerrier",
    nom_affiche: "Guerrier",
    de_de_vie: "1d10",
    armes: "Toutes les armes de contact",
    armures: "Toutes, jusqu'à l'armure de plaques complète ; maniement du bouclier",
    attaque: { contact: "Mod. de FORCE", distance: null, magique: null },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. La Voie du chaos n'est pas une voie « par défaut » : c'est une mécanique de corruption progressive (jauges, mutations, risque de bascule du personnage). À réserver à un joueur volontaire — à proposer avec son accord. Version particulière : la jauge de combat monte passivement quand il encaisse des dégâts, pas par un choix d'activation.",
    voies: [
      {
        nom: "Voie du soldat",
        speciale: false,
        description: "Souplesse tactique et combat en groupe. Voie officielle, conservée telle quelle.",
        rangs: [
          { rang: 1, nom: "Posture de combat", effet: "Au début du tour, applique jusqu'à -1 par rang en attaque, DEF ou DM, et obtient l'équivalent en bonus au choix jusqu'au prochain tour",
            mecanique: { type: "activable", usage: { frequence: "1x/tour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Posture de combat", consigne: "Choisis la répartition entre deux stats (±rang atteint dans la voie, doublé pendant Maîtrise tactique) :",
                    options: [
                      { valeur: "att_def", label: "+ Attaque / − DEF", paire: [ { cible: "attaque", signe: 1 }, { cible: "DEF", signe: -1 } ] },
                      { valeur: "def_att", label: "+ DEF / − Attaque", paire: [ { cible: "DEF", signe: 1 }, { cible: "attaque", signe: -1 } ] },
                      { valeur: "att_dm", label: "+ Attaque / − DM", paire: [ { cible: "attaque", signe: 1 }, { cible: "DM", signe: -1 } ] },
                      { valeur: "dm_att", label: "+ DM / − Attaque", paire: [ { cible: "DM", signe: 1 }, { cible: "attaque", signe: -1 } ] },
                      { valeur: "def_dm", label: "+ DEF / − DM", paire: [ { cible: "DEF", signe: 1 }, { cible: "DM", signe: -1 } ] },
                      { valeur: "dm_def", label: "+ DM / − DEF", paire: [ { cible: "DM", signe: 1 }, { cible: "DEF", signe: -1 } ] },
                    ] },
                  duree: "prochainTour" },
                { type: "special", note: "Magnitude = Personnage.rangMaxVoie('Voie du soldat') (±1 à ±4 selon les rangs déjà acquis dans la voie), doublée tant que l'état 'maitrise_tactique' (rang 5) est actif — résolution dédiée dans Capacites.resoudreEffet (choix pairé, cf. son commentaire). Le côté 'DM' est un nouveau canal de bonus temporaire (bonusTemporaire('DM')), lu dans les 3 points de construction des formules de dégâts d'arme côté app.js, au même titre que bonusDegatsArmeChaos." } ] } },
          { rang: 2, nom: "Combat en phalange", effet: "+1 DEF par PJ à son contact (case adjacente)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Simplifié par rapport au texte d'origine (+1 attaque ET DEF, condition 'combattant la même cible') : validé avec Thomas, +1 DEF uniquement, par PJ adjacent (distance <= 1 case), sans condition de cible commune. Déjà codé dans Personnage.bonusDefPhalange() (calqué sur bonusDefDuel()), câblé dans calculerDEF() — nécessite une scène de combat dd2vtt active et un jeton posé, comme bonusDefDuel." } ] } },
          { rang: 3, nom: "Second souffle (L)", effet: "Renonce à attaquer ce tour pour reprendre son souffle : regagne 2d6+Mod.CON PV",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "soin", formule: "2d6+Mod.CON" },
                { type: "special", note: "Formule validée avec Thomas (le texte source ne chiffrait rien) : 2d6+Mod.CON, cohérente avec Cri du rassemblement (rang 4, Voie du peuple, 1d6+Mod.CON en PV temporaires à un allié) — ici en soin réel sur soi, sans limite d'usage supplémentaire, pour compenser le coût d'un tour entier sans attaquer." } ] } },
          { rang: 4, nom: "Prouesse", effet: "Une fois par tour, sacrifie 1d4 PV pour +5 sur un test",
            mecanique: { type: "activable", usage: { frequence: "1x/tour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d4", elementaire: null },
                { type: "bonus", cible: "choix",
                  choix: { titre: "Prouesse", consigne: "Choisis le test de caractéristique qui reçoit +5 (sacrifice de 1d4 PV) :",
                    options: CARACS.map((c) => ({ valeur: c.code, label: `+5 ${c.nom.toUpperCase()}` })) },
                  valeur: 5, duree: "1" },
                { type: "special", note: "Sacrifice modélisé comme un effet 'degats' ciblé sur soi (cf. le jet d'attaque, mais ici sans jetOppose : dégâts appliqués directement). Bonus +5 sur le test de caractéristique choisi à l'activation (même mécanisme que la Voie de l'alcoolisme du Barde), durée d'un tour — approximé sur un test de caractéristique brut, pas une compétence précise." } ] } },
          { rang: 5, nom: "Maîtrise tactique", effet: "Capacité finale de maîtrise tactique (voir le manuel officiel pour le détail exact)",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "maitrise_tactique", duree: "3" },
                { type: "special", note: "Pose l'état 'maitrise_tactique' : Capacites.resoudreEffet double la magnitude de Posture de combat tant qu'il est actif (cf. son commentaire). Combat en phalange (rang 2, doublement du bonus par allié) reste non modélisé — Personnage.bonusDefPhalange() ne consulte pas cet état, bonus scalant avec un décompte d'alliés déjà approximé à sa propre valeur (cf. son rang)." } ] } },
        ],
      },
      {
        nom: "Voie du peuple",
        speciale: false,
        description: "Un défenseur né du peuple, pas un super-soldat. Sa force vient de qui il protège, pas de ce qu'il inflige.",
        rangs: [
          { rang: 1, nom: "Fils du village (réaction)", effet: "Réaction (3 par combat, pool partagé) : si un allié à son contact est visé par une attaque, peut s'interposer avant résolution et devient la cible. +2 CHA avec les gens du peuple",
            mecanique: { type: "activable", usage: { frequence: "libre" }, reactionCout: 1, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Le coût en réaction (1 des 3 par combat, pool générique — cf. mecanique.reactionCout, Capacites.lancer) est automatisé et bloque l'activation une fois le pool épuisé. La redirection de l'attaque vers le Guerrier reste, elle, une application manuelle par la table (pas de moteur de ciblage automatique d'attaque adverse dans l'app) — même limite que le reste des redirections non modélisées (cf. Rage incontrôlée). +2 CHA avec les gens du peuple : bonus de test hors combat, non chiffré." } ] } },
          { rang: 2, nom: "L'exemple (passive)", effet: "Se concentre : tant qu'il reste immobile ce tour, les PJ à 2 cases de lui gagnent +1 DEF",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "zone", portee: null, zone: 1, jetOppose: null,
              effets: [ { type: "special", note: "Reformulé (validé avec Thomas) par rapport au texte d'origine (+2 Volonté contre Peur/Intimidation, non chiffrable) : +1 DEF à tout PJ à 2 cases du Guerrier, tant que celui-ci reste immobile ce tour (Combat.estImmobile, même mécanique que Chasseur 'Camouflage naturel'). Calcul live (pas de bouton), câblé via Capacites.bonusDefAuraPeuple() — dépendant d'AUTRES personnages, ce bonus ne peut pas vivre dans Personnage (modèle auto-contenu par conception) ; appliqué à la fois à l'affichage de la fiche et à la résolution d'attaque (obtenirDefCible), pour ne jamais désynchroniser la DEF affichée de la DEF réellement opposée à une attaque." } ] } },
          { rang: 3, nom: "Rempart (passive)", effet: "Réduit de 2 points les DM qu'il subit lorsqu'il protège activement un allié",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Personnage.aRempart(), lu par subirDegats côté app.js : case à cocher manuelle 'Rempart' sur le formulaire Subir des dégâts (la condition 'protège activement un allié' n'est pas trackable automatiquement, elle est déclarée par le joueur au moment du jet) — réduit de 2 les dégâts, tout type confondu, sans limite d'usage." } ] } },
          { rang: 4, nom: "Cri du rassemblement (L, 1x/combat)", effet: "Alliés à portée de voix (15 m) : 1d6+Mod. de CON PV temporaires et +2 attaque pendant 2 tours",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "zone", portee: null, zone: 7, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "2" },
                { type: "pvTemp", formule: "1d6+Mod.CON", duree: "2" },
                { type: "special", note: "Déjà codé (type 'pvTemp', jamais cumulatif — cf. Capacites.appliquerPvTemporairesSurPerso). Comme le bonus d'attaque ci-dessus, mecanique.cible = 'zone' : le jet est résolu et affiché, mais son application reste manuelle allié par allié (l'app ne cible jamais automatiquement une zone entière) — même limitation déjà acceptée pour le bonus d'attaque." } ] } },
          { rang: 5, nom: "Le héros qu'on n'oublie pas (L, 1x/scénario)", effet: "Réaction unique (1x/scénario, compteur séparé du pool de 3 réactions/combat) : encaisse à la place d'un allié (≤3 m) qui tomberait à 0 PV (DM intégraux). S'il survit : -4 à tous ses tests jusqu'à la fin du combat",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: 1, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: -4, duree: "finCombat" },
                { type: "special", note: "Volontairement PAS de mecanique.reactionCout ici : ce rang garde son propre compteur usage.frequence '1x/scenario' (déjà automatisé par verifierUsage), entièrement indépendant du pool générique de 3 réactions/combat de Fils du village (rang 1, même voie) — décision validée avec Thomas, pour ne pas doublement contraindre une capacité déjà limitée à 1 seul usage par scénario. Encaisse l'intégralité des dégâts qui auraient réduit un allié à 3 m à 0 PV — redirection totale de dégâts non modélisée par le schéma standard. Le -4 s'applique à TOUS les tests, pas seulement l'attaque (approximé ici)." } ] } },
        ],
      },
      {
        nom: "Voie de l'élite",
        speciale: false,
        description: "Spécimen physique au sommet de sa forme. Pas de protection, pas de gadgets — juste un corps poussé à son maximum.",
        rangs: [
          { rang: 1, nom: "Spécimen d'élite (passive)", effet: "+1 permanent à une carac. physique au choix (FOR, DEX ou CON), fixée à l'acquisition",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "caracteristique", valeur: 1, duree: "permanente" },
                { type: "special", note: "Choix de la caractéristique (FOR, DEX ou CON) fixé à l'acquisition — déjà géré via CAPACITES_A_CHOIX côté app.js." } ] } },
          { rang: 2, nom: "Endurance de fer (passive)", effet: "+1 PV par niveau, en plus du Dé de vie ; avantage automatique aux tests de CON contre la fatigue",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "+1 PV par niveau déjà codé dans Personnage.bonusPvCapacites(). Avantage aux tests de CON contre la fatigue déjà codé dans Personnage.aEnduranceDeFer(), lu par le bouton 'Test de CON' (modeForce avantage, même mécanisme qu'Acteur) — approximé sur le test de CON brut, l'app n'ayant pas de sous-catégorie 'fatigue' séparée." } ] } },
          { rang: 3, nom: "Précision létale (passive)", effet: "Critiques sur 19-20 au lieu de 20 sur les attaques au contact",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Abaisse le seuil de critique à 19-20 sur les attaques au contact — déjà codé dans Personnage.critMinAttaque(), pas un effet degats/soin/etat/bonus classique." } ] } },
          { rang: 4, nom: "Force herculéenne (activable)", effet: "+1d4 DM bonus aux attaques au contact ; double capacité de charge et tests athlétiques",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d4", elementaire: null },
                { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive', ce qui masque le bouton Lancer partout dans l'app alors que cet effet degats est bien réel — passé à 'activable', même schéma que Frappe vengeresse (Guerrier, Voie du chaos rang 2) : bonus ajouté manuellement par le joueur à sa prochaine attaque au contact réussie. Double aussi la capacité de charge et les tests athlétiques — hors combat, non chiffrable ici." } ] } },
          { rang: 5, nom: "Apogée physique (L, 1x/combat)", effet: "3 tours : double le Mod. de la carac. choisie au Rang 1 pour tous les tests et calculs de dégâts associés",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "apogee_physique", duree: "3" },
                { type: "special", note: "Déjà codé : pose l'état 'apogee_physique' avec un champ 'carac' dynamique (résolu à la pose depuis le choix fait à Spécimen d'élite rang 1, cf. Capacites.resoudreEffet) ; Personnage.mod() double le modificateur de cette carac tant que l'état est actif — tests ET dégâts associés à ce mod sont donc couverts automatiquement (bonusAttaque/reductionDegats/etc. passent tous par mod())." } ] } },
        ],
      },
      {
        nom: "Voie de l'ingénieur",
        speciale: false,
        description: "Pièges et modification de terrain au service du groupe. Une vraie logique de chantier, du piège isolé au champ de bataille retourné.",
        rangs: [
          { rang: 1, nom: "Piège de fortune (action de mouvement)", effet: "Pose un piège à usage unique. Ennemi terminant son mouvement dessus : jet de DEX vs DEF, échec → 1d6 DM et Ralenti (-2 m)",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "DEX", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6", elementaire: null }, { type: "etat", id: "ralentie", duree: "3" },
                { type: "special", note: "Simplifié (validé avec Thomas) : DD fixe (12) remplacé par caracDefenseur 'DEF' — le champ difficulteFixe n'était en réalité jamais lu par le moteur (mort pour tout jetOppose, seul mecanique.testVolonte l'utilise). Le poseur du piège fait maintenant un jet de DEX vs la DEF de la cible, désormais pleinement automatisé (même principe que les autres simplifications vs DEF de la session), au prix du changement de logique fictionnelle (jet actif du poseur plutôt que jet de sauvegarde de la cible)." } ] } },
          { rang: 2, nom: "Terrain favorable (L)", effet: "Zone 3 m en terrain difficile pendant 3 tours — gênant uniquement pour les ennemis",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: null, zone: 1, jetOppose: null,
              effets: [ { type: "special", note: "Transforme une zone de 3 m en terrain difficile pendant 3 tours, gênant uniquement pour les ennemis — règle de terrain, non chiffrable par le schéma standard." } ] } },
          { rang: 3, nom: "Fortification de fortune (L)", effet: "Barricade improvisée sur 3 m (10 PV + Niveau). Alliés abrités : +4 DEF à distance, +2 au contact",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: null, zone: 1, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "finCombat" },
                { type: "special", note: "Approximation validée avec Thomas : le schéma ne distingue pas un bonus de DEF contre les attaques à distance d'un bonus contre les attaques au contact (un seul type 'bonus'/'DEF') — retenu la valeur basse (+2, celle du contact) plutôt que +4, pour ne jamais sur-évaluer la protection réelle. Comme Bastion improvisé (rang 5, même voie) : jet résolu et affiché, application manuelle allié par allié (mecanique.cible = 'zone'). La barricade elle-même (10 PV + Niveau, objet destructible) est désormais posée comme un jeton via le catalogue INVOCATIONS (entrée 'barricade_guerrier', cf. Carte.ouvrirModalInvocation/confirmerInvocation), au même titre que les invocations de Nécromancien/Druide — pvMaxFormule '10+niveau', sansAttaque:true (bloque une case mais n'attaque jamais). Le blocage de mouvement/LoS à travers la barricade (obstacle opaque) reste hors périmètre du système d'invocation, non comblé ici." } ] } },
          { rang: 4, nom: "Champ de pièges (L)", effet: "Pose jusqu'à 3 pièges en une action limitée ; dégâts des pièges passent à 2d6, jet de DEX vs DEF",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "DEX", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d6", elementaire: null },
                { type: "special", note: "Simplifié (validé avec Thomas) : DD fixe (14) remplacé par caracDefenseur 'DEF', même principe que Piège de fortune (rang 1, même voie) — désormais pleinement automatisé. Pose jusqu'à 3 pièges en une seule action limitée — un seul jet de dégâts représenté ici par piège déclenché." } ] } },
          { rang: 5, nom: "Bastion improvisé (L, 1x/combat)", effet: "Zone 6 m (~3 cases) en bastion pour le reste du combat : alliés +2 DEF en continu ; tout monstre y pénétrant subit une attaque d'opportunité au contact",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "zone", portee: null, zone: 3, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "finCombat" },
                { type: "special", note: "Bonus de DEF pour les alliés dans la zone (application manuelle allié par allié, mecanique.cible='zone' sans cibleId — même limite que Fortification de fortune, même voie). Reformulé (validé avec Thomas) par rapport au texte d'origine (DEX diff. 14 ou 2d6 DM, non modélisable par le schéma standard) : tout monstre entrant dans la zone (~3 cases, conversion 2m/case déjà utilisée pour le don Mobile/Grâce féline) déclenche une VRAIE attaque d'opportunité du Guerrier (jetOppose vs DEF, bonusAttaque('contact'), dégâts d'arme normaux) — même moteur que n'importe quelle attaque de capacité. Détection faite côté app.js (calcul live à chaque rendu de fiche, pas d'évènement 'jeton déplacé' dans le moteur), tant que le marqueur p.bastionActifFinCombat (posé par Capacites.lancer, remis à zéro par Combat.terminerCombat) reste actif." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — fureur corruptrice. Pas un pacte conscient : un soldat ordinaire qui a vécu trop de guerre. La fureur monte malgré lui, déclenchée par les dégâts encaissés.",
        rangs: [
          { rang: 1, nom: "Premier sang (passif)", effet: "Chaque attaque ennemie réussie contre lui : +1 Corruption de Fureur (CF, max 6/combat)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans subirDegats côté app.js (via Personnage.aPremierSangGuerrier()) : chaque appel avec des dégâts bruts > 0 représente une attaque ennemie réussie dans le modèle de l'app, +1 automatique à la jauge de Corruption de Fureur via Capacites.ajusterCorruptionCombat, plafonné à 6 pour cette source passive spécifiquement (d'autres capacités actives peuvent pousser plus haut)." } ] } },
          { rang: 2, nom: "Frappe vengeresse (activable)", effet: "Dépense 1 CF : +1d6 DM chaotiques à la prochaine attaque réussie. Répétable tant qu'il a des CF",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Coût : 1 CF (jauge de Corruption de Fureur), répétable tant qu'il en reste — non trackée par le schéma standard." } ] } },
          { rang: 3, nom: "Rage incontrôlée (L, 3 CF)", effet: "Attaque supplémentaire ce tour. Test de Volonté (SAG) diff. 12 : échec → la 2e attaque cible la créature la plus proche, allié compris. Consomme 2 CF",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null, actionBonus: true, corruptionCout: 2, corruptionCoutMin: 3,
              testVolonte: { carac: "SAG", difficulteFixe: 12 },
              effets: [ { type: "special", note: "actionBonus: true (Combat.accorderActionPrincipaleBonus, cf. Groupe 8 Barde Enchaînement) accorde l'attaque supplémentaire ; corruptionCout: 2 / corruptionCoutMin: 3 bloquent l'activation sous 3 CF et décomptent 2 CF au lancer. mecanique.testVolonte (nouveau champ générique, lu par Capacites.lancer() juste après jetOppose) automatise le test de Volonté (roulé comme un test de SAG, 1d20+Mod.SAG vs difficulteFixe) et calcule la cible forcée en cas d'échec (Capacites.cibleCreaturePlusProche : la créature la plus proche sur la table de combat, PJ ou monstre confondu — 'allié compris' — tie-break aléatoire en cas d'égalité de distance). L'application de la 2e attaque sur cette cible reste manuelle (sélection dans le menu déroulant existant) : aucun moteur de redirection automatique d'attaque dans l'app." } ] } },
          { rang: 4, nom: "Soif de sang (passive, dès CA 5+)", effet: "Réduire un ennemi à 0 PV régénère 1d6 PV immédiatement. Contrepartie : désavantage social avec les témoins du carnage",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "soin", formule: "1d6" },
                { type: "special", note: "Condition : réduire un ennemi à 0 PV. Contrepartie : désavantage social avec les témoins du carnage." } ] } },
          { rang: 5, nom: "Déchaînement (L, 1x/scénario, 6 CF)", effet: "[3+Mod. de CON] tours : +4 attaque, +2d6 DM. Chaque tour, test de Volonté (SAG) diff. 14 ou attaque redirigée vers la créature la plus proche, allié compris. Consomme tous les CF, convertis en CA",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 4, duree: "3+Mod.CON" },
                { type: "etat", id: "dechainement", duree: "3+Mod.CON", testVolonte: { carac: "SAG", difficulteFixe: 14 } },
                { type: "special", note: "+2d6 DM à toutes les attaques au contact pendant la durée : câblé via Personnage.bonusDegatsDechainement() (même canal que bonusDegatsArmeChaos, 3 sites app.js), actif tant que l'état 'dechainement' ci-dessus reste posé. Test de Volonté chaque tour : effet.testVolonte est recopié dans l'entrée etatsActifs à la pose (cf. resoudreEffet) et re-testé à CHAQUE tick par Capacites.decompterEtatsDebutTour (contrairement à mecanique.testVolonte de Rage incontrôlée, qui ne teste qu'à l'activation) — cible forcée en cas d'échec via Capacites.cibleCreaturePlusProche, application manuelle comme le reste des redirections d'attaque non modélisées. Conversion CF→CA : bloc dédié dans Capacites.lancer() (source.voie/rang/classe), hors du schéma générique corruptionCout qui suppose un coût FIXE connu à l'avance — ici la totalité de la jauge courante, dynamique, est consommée et convertie en Corruption d'Âme." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : combattant polyvalent (Soldat), protecteur (Peuple), brute physique (Élite), tacticien (Ingénieur). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Peuple et Ingénieur se combinent naturellement pour un défenseur tacticien ; Élite et Soldat forment un duo de combattant pur, simple et redoutable pour un nouveau joueur.",
    ],
  },

  barde: {
    classe: "barde",
    nom_affiche: "Barde",
    de_de_vie: "1d6",
    armes: "Armes à une main (rapière, dague...)",
    armures: "Jusqu'à l'armure de cuir renforcée, pas de bouclier",
    attaque: { contact: null, distance: null, magique: "Mod. de CHARISME" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. Tolérance (Voie de l'alcoolisme) — doses tolérées/jour sans Ivresse auto. = CON ÷ (5 − rang de l'alcool), arrondi à l'inférieur. Ivresse — -1 à tous les tests par point cumulé. Voie du chaos : le Barde corrompt surtout les autres mais se brûle au débordement (Volonté/SAG ou Confusion 1 tour + -4 CHA).",
    voies: [
      {
        nom: "Voie de l'alcoolisme",
        speciale: false,
        description: "Le barde fabrique et consomme ses propres élixirs pour booster ses caractéristiques — au prix d'une vraie tolérance à gérer.",
        rangs: [
          { rang: 1, nom: "Premier brassage", effet: "Alcool de rang 1 : +1 à une carac. au choix pendant [5+Mod. de CON] tours. Test de CON diff. 12 : échec → bonus divisé par 2 + 1 point d'Ivresse",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Premier brassage", consigne: "Choisis la caractéristique boostée par cette dose (+1, 5+Mod.CON tours) :",
                    options: CARACS.map((c) => ({ valeur: c.code, label: `+1 ${c.nom.toUpperCase()}` })) },
                  valeur: 1, duree: "5+Mod.CON" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : test de CON (DD 12) automatique à l'activation — échec → le bonus choisi est divisé par 2 (arrondi inférieur) et 1 point d'état Ivresse (cumulable, une entrée par échec) est posé, cf. bloc dédié dans Capacites.lancer (identifié par voie). Le malus global '-1/point d'Ivresse à tous les tests' reste manuel, comme Fatiguée/Halluciné (aucun malus 'tous les tests' câblé dans l'app)." } ] } },
          { rang: 2, nom: "Mélange amélioré", effet: "Alcool de rang 2 : +2, diff. de CON 14",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Mélange amélioré", consigne: "Choisis la caractéristique boostée par cette dose (+2, 5+Mod.CON tours) :",
                    options: CARACS.map((c) => ({ valeur: c.code, label: `+2 ${c.nom.toUpperCase()}` })) },
                  valeur: 2, duree: "5+Mod.CON" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : test de CON (DD 14) automatique, même mécanisme que Premier brassage (rang 1, même voie)." } ] } },
          { rang: 3, nom: "Double dose", effet: "Alcool de rang 3 : +3, diff. 16. Permet 2 effets d'Alcool actifs simultanément",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Double dose", consigne: "Choisis la caractéristique boostée par cette dose (+3, 5+Mod.CON tours) :",
                    options: CARACS.map((c) => ({ valeur: c.code, label: `+3 ${c.nom.toUpperCase()}` })) },
                  valeur: 3, duree: "5+Mod.CON" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : test de CON (DD 16) automatique, même mécanisme que Premier brassage. Permet 2 effets d'Alcool actifs simultanément — règle de cumul non trackée automatiquement (rien n'empêche d'en cumuler dès le rang 1, chaque dose posant son propre bonus temporaire indépendant)." } ] } },
          { rang: 4, nom: "Distillation supérieure", effet: "Alcool de rang 4 : +4, diff. 18",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Distillation supérieure", consigne: "Choisis la caractéristique boostée par cette dose (+4, 5+Mod.CON tours) :",
                    options: CARACS.map((c) => ({ valeur: c.code, label: `+4 ${c.nom.toUpperCase()}` })) },
                  valeur: 4, duree: "5+Mod.CON" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : test de CON (DD 18) automatique, même mécanisme que Premier brassage." } ] } },
          { rang: 5, nom: "Nectar ultime", effet: "Alcool de rang 5 : +5, diff. 20. Une seule dose tolérable, quel que soit le score de CON",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Nectar ultime", consigne: "Choisis la caractéristique boostée par cette dose (+5, 5+Mod.CON tours) :",
                    options: CARACS.map((c) => ({ valeur: c.code, label: `+5 ${c.nom.toUpperCase()}` })) },
                  valeur: 5, duree: "5+Mod.CON" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : test de CON (DD 20) automatique, même mécanisme que Premier brassage. Une seule dose tolérable quel que soit le score de CON — limite de cumul non trackée automatiquement." } ] } },
        ],
      },
      {
        nom: "Voie de la rapière",
        speciale: false,
        description: "Combat à l'épée légère, basé sur la précision. Adaptation chiffrée de la Voie de l'escrime officielle.",
        rangs: [
          { rang: 1, nom: "Précision", effet: "Utilise son score d'attaque normal avec une arme légère (dague, épée courte, rapière) ; +1 en attaque avec ces armes",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 1, duree: "permanente" },
                { type: "special", note: "Corrige un gap de donnée : ce bonus permanent était déclaré ici mais jamais lu par aucune fonction de calcul (aucun bonusAttaqueCapacites() n'existait, contrairement à bonusDefCapacites/bonusInitiativeCapacites déjà câblés pour Intelligence du combat au rang 2 de cette même voie). Ajouté et câblé dans Personnage.bonusAttaqueCapacites('contact'), lu par bonusAttaque(). Restriction 'armes légères uniquement' non modélisée — appliqué à toute attaque de contact, comme Force herculéenne pour les DM." } ] } },
          { rang: 2, nom: "Intelligence du combat (passive)", effet: "Ajoute son Mod. d'INT à l'Initiative et à la DEF, en plus de son Mod. de DEX",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "initiative", valeur: "Mod.INT", duree: "permanente" },
                { type: "bonus", cible: "DEF", valeur: "Mod.INT", duree: "permanente" },
                { type: "special", note: "Déjà calculé dans Personnage (cf. calculerDEF) pour la partie DEF ; valeur dynamique (Mod.INT), pas un nombre fixe." } ] } },
          { rang: 3, nom: "Feinte (L)", effet: "Test d'attaque opposé contre la DEF adverse : réussite → la cible subit -4 DEF jusqu'au prochain tour du Barde",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "DEF", valeur: -4, duree: "prochainTour", differe: true },
                { type: "special", note: "Bugfix (validé avec Thomas) : differe:true ajouté — le malus DEF ne s'appliquait jusqu'ici même sur un jet raté (seuls degats/etat sont différés par défaut jusqu'à confirmation de la touche). Même mécanisme que Chevalier « Avantages tactiques »/Moine « Précision instinctive »." } ] } },
          { rang: 4, nom: "Enchaînement (L)", effet: "Attaque supplémentaire avec arme légère, malus de -2 sur les deux attaques du tour",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null, actionBonus: true,
              effets: [ { type: "bonus", cible: "attaque", valeur: -2, duree: "1" },
                { type: "special", note: "actionBonus: true (lu génériquement par app.js) accorde l'attaque supplémentaire via Combat.accorderActionPrincipaleBonus (remet actionPrincipaleUtilisee à false ce tour) ; le malus -2 s'applique aux DEUX attaques via le bonus temporaire 'attaque' ci-dessus, lu par Personnage.bonusAttaque(). Corrige au passage 'cible: ennemi' → 'soi' : le malus concerne le Barde lui-même, pas une cible choisie." } ] } },
          { rang: 5, nom: "Botte mortelle (L, 1x/combat)", effet: "Ignore 2 points de Réduction des Dégâts adverse ; +2d6 DM bonus si la cible est déjà affaiblie (DEF réduite, Influencée...)",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "2d6", elementaire: null },
                { type: "special", note: "Mécanisé (validé avec Thomas) : ignore désormais 2 points fixes de RD (armure) adverse pour cette attaque, même calcul dédié que Chasseur « Trophée ultime » (RD-2 au lieu de RD/2, cf. Capacites.resoudreEffet identifié par voie+rang). Bonus de dégâts conditionné à une cible déjà affaiblie (DEF réduite, Influencée...) reste non automatisé pour un monstre (pas de suivi d'état créature, même limite que partout ailleurs dans l'app) — la formule '2d6' ci-dessus est ce bonus, à appliquer manuellement si la condition est remplie." } ] } },
        ],
      },
      {
        nom: "Voie du spectacle",
        speciale: false,
        description: "Acrobatie, esquive et présence scénique. Adaptation chiffrée de la Voie du saltimbanque officielle.",
        rangs: [
          { rang: 1, nom: "Acrobate", effet: "Bonus aux tests de DEX (acrobaties, équilibre, saut, escalade) égal à 2 × rang atteint dans cette Voie",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Acrobaties", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence('Acrobaties'). Équilibre/saut/escalade repliés sur cette même compétence, faute d'entrée dédiée dans COMPETENCES_PAR_CARAC." } ] } },
          { rang: 2, nom: "Grâce féline (passive)", effet: "+2 m de déplacement par tour ; se relever d'une position à terre devient une action gratuite",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "+2 m convertis en +1 case (décision de Thomas, faute de conversion mètres/cases établie ailleurs — même ordre de grandeur que le don Mobile) : déjà codé dans Combat._deplacementMax() côté js/combat.js. 'Se relever devient une action gratuite' : déjà gratuit par défaut dans l'app (retirer un état comme 'renversee' sur soi n'a jamais consommé d'action, aucune économie d'action à débloquer)." } ] } },
          { rang: 3, nom: "Lanceur de couteau", effet: "Lance des dagues à 10 m de portée, 1d4 + Mod. de DEX DM ; +1 en attaque avec les armes de jet légères",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "attaqueDistance", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d4+Mod.DEX", elementaire: null } ] } },
          { rang: 4, nom: "Esquive acrobatique (activable)", effet: "+2 DEF contre les attaques d'ennemis qui se sont déplacés ce tour ; sur attaque ratée contre lui, déplacement de 3 m en action gratuite",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "1" },
                { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive' alors que le bonus DEF a une durée non permanente ('1' tour) — un bonus temporaire doit passer par Capacites.lancer() pour être posé (cf. son commentaire sur les bonus 'permanente'), or 'passive' masque le bouton Lancer partout dans l'app. Passé à 'activable'. Condition : uniquement contre un ennemi qui s'est déplacé ce tour — non vérifiée automatiquement, à activer manuellement quand elle est remplie. Sur attaque ratée contre lui, déplacement de 3 m en action gratuite — non chiffrable." } ] } },
          { rang: 5, nom: "Liberté d'action", effet: "Immunisé aux effets d'Immobilisation et d'Entrave ; 1x/combat, ignore automatiquement un effet de paralysie sans test",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Personnage.aImmuniteEtat()/aLiberteAction(), lu aux deux points où un état est posé sur un PJ (Capacites.resoudreEffet et le panneau MJ appliquerMalus côté app.js) : bloque totalement 'immobilisee'/'entravee' à la pose, et consomme automatiquement l'usage 1x/combat (clé 'classe:barde:5') pour ignorer le premier 'paralysee' de chaque combat." } ] } },
        ],
      },
      {
        nom: "Voie du chant",
        speciale: false,
        description: "Affaiblissement pur par la voix — pas de dégâts directs, mais un vrai outil de démolition tactique.",
        rangs: [
          { rang: 1, nom: "Note discordante (sort, L)", effet: "Attaque magique, portée 12 m : -2 à un type de test au choix (attaque, DEF, ou tests de carac.) pendant [3+Mod. de CHA] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 6, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Note discordante", consigne: "Choisis le test pénalisé (-2, 3+Mod.CHA tours) :",
                    options: [{ valeur: "attaque", label: "Attaque" }, { valeur: "DEF", label: "DEF" }]
                      .concat(CARACS.map((c) => ({ valeur: c.code, label: `Test de ${c.nom.toUpperCase()}` }))) },
                  valeur: -2, duree: "3+Mod.CHA", differe: true },
                { type: "special", note: "Mécanisé (validé avec Thomas) : le type de test pénalisé devient un vrai choix à l'activation (attaque, DEF, ou l'une des 6 caracs brutes — même mécanisme que Barde « Premier brassage », Voie de l'alcoolisme), au lieu d'être figé sur 'attaque' par défaut. differe:true ajouté au passage (bugfix, cf. Feinte/Requiem du silence) : le malus ne s'applique désormais que si l'attaque touche." } ] } },
          { rang: 2, nom: "Refrain lancinant (passive)", effet: "Le malus de Note discordante passe à -3",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Capacites.resoudreEffet (branche 'bonus') : dès que ce rang 2 est acquis, le -2 de Note discordante (rang 1) est automatiquement remplacé par -3 à chaque lancer, identifié via voie+rang (ctx.voie/ctx.rang)." } ] } },
          { rang: 3, nom: "Chant brisant (L)", effet: "Zone 5 m, portée 15 m : tous les ennemis subissent -2 attaque et -2 DEF pendant [3+Mod. de CHA] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: 7, zone: 2, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: -2, duree: "3+Mod.CHA" },
                { type: "bonus", cible: "DEF", valeur: -2, duree: "3+Mod.CHA" } ] } },
          { rang: 4, nom: "Dissonance profonde (passive)", effet: "Double les malus de Note discordante et Chant brisant",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Simplifié (validé avec Thomas) par rapport au texte d'origine (cumul avec d'autres effets + durée +2 tours, non chiffrable) : double directement le malus de Note discordante (rang 1, déjà -3 avec Refrain lancinant rang 2) et de Chant brisant (rang 3, attaque ET DEF) — même principe que Refrain lancinant/Résistance arcanique, résolution dédiée dans Capacites.resoudreEffet (identifiée via voie+rang, cf. son commentaire)." } ] } },
          { rang: 5, nom: "Requiem du silence (L, 1x/combat)", effet: "Zone large : jet magique vs DEF → Réduit au silence (aucune capacité magique/vocale) et -4 attaque pendant 2 tours",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "zone", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "silencieuse", duree: "2" }, { type: "bonus", cible: "attaque", valeur: -4, duree: "2", differe: true },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'Volonte' à 'DEF' — data/bestiaire.json n'expose que pv/def/init/atk, aucun modificateur de SAG par monstre à opposer, donc 'Volonte' ne pouvait jamais être automatisé. Contre 'DEF', le jet magique du Barde est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible), comme n'importe quelle capacité d'attaque. mecanique.cible = 'zone' sans cibleId automatique : le sélecteur de cible (app.js) est étendu aux capacités 'zone' avec jetOppose pour permettre de choisir un monstre de la zone à la fois et relancer pour le suivant — même principe que 'application manuelle allié par allié' déjà en place pour les zones à bonus (Cri du rassemblement, Fortification de fortune...), mais avec le jet d'attaque désormais automatisé pour chaque cible choisie. Bugfix (validé avec Thomas) : differe:true ajouté sur le bonus -4 attaque — il s'appliquait jusqu'ici même sur un jet raté (seul l'état 'silencieuse' était différé, cf. TYPES_EFFETS_DIFFERES). Même mécanisme que Feinte (Voie de la rapière rang 3)." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — séduction corruptrice. Un vecteur de chaos qui corrompt à travers son art. Les autres se brûlent eux-mêmes ; lui brûle les autres, et se corrompt quand même un peu au passage.",
        rangs: [
          { rang: 1, nom: "Chant corrupteur (performance)", effet: "Test de CHA vs DEF, portée vocale : la cible touchée est Influencée (-2 à une carac. ou vulnérabilité à la suggestion) quelques tours. +1 CS",
            mecanique: { type: "activable", corruption: 1, usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "CHA", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "influencee", duree: "3" },
                { type: "special", note: "+1 CS (jauge de Chaos) déjà tracké via mecanique.corruption (correction d'une note obsolète qui le disait 'non trackée'). Simplifié (validé avec Thomas) : caracDefenseur passé de 'CHA' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de CHA par monstre, donc l'opposition CHA vs CHA d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet (1d20+Mod.CHA) est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible), comme n'importe quelle capacité d'attaque." } ] } },
          { rang: 2, nom: "Étreinte du Vide (activable)", effet: "Dépense 1 CS : +2 attaque et +1d6 DM chaotiques à la prochaine attaque réussie",
            mecanique: { type: "activable", corruption: 1, usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "1" },
                { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Simplifié (validé avec Thomas) par rapport au texte d'origine (\"force n'importe laquelle de ses capacités de séduction pour un bonus plus fort\", dépendance inter-capacités non modélisable) : même schéma que Guerrier \"Frappe vengeresse\" (Voie du chaos rang 2) — +2 attaque et +1d6 DM chaotiques à la prochaine attaque réussie, coût +1 CS via mecanique.corruption (gain de jauge, pas un mecanique.corruptionCout — pas de seuil minimum requis pour ce rang). Corrigé au passage cible 'ennemi' → 'soi' : ce buff s'applique au Barde lui-même, pas à une cible choisie." } ] } },
          { rang: 3, nom: "Mélopée de la Folie (L)", effet: "Zone, test de CHA vs DEF par cible : touché → confusion chaotique (attaquent au hasard, alliés compris) quelques tours. +2 CS. Critique : jet sur la table de mutation Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "zone", portee: null, zone: null,
              jetOppose: { caracAttaquant: "CHA", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "confuse", duree: "3" },
                { type: "special", note: "Mécanisé (validé avec Thomas, après correction de mon audit initial — la table Palier 1 existe bien, cf. data/mutations.js/TABLE_MUTATIONS, fournie par Thomas). +2 CS (jauge de Chaos, déjà tracké via mecanique.corruption). Critique : jet 1d6 automatique sur la table de mutation Palier 1 dès que le jet d'attaque est critique (seuil d'arme, cf. MUTATION_PALIER1_TRIGGERS/_rollMutationPalier1 dans Capacites.lancer, identifié par voie+rang+classe) — ajoute la mutation obtenue à p.mutations, journalisée comme tout autre dé, même mécanisme que le générateur de mutation existant (onglet Mutations). Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF', même principe que Chant corrupteur (rang 1, même voie) — désormais pleinement automatisé (touché/raté/critique) une fois une cible choisie. mecanique.cible = 'zone' sans cibleId automatique : le sélecteur de cible (app.js) est étendu aux capacités 'zone' avec jetOppose pour choisir un monstre de la zone à la fois et relancer pour le suivant." } ] } },
          { rang: 4, nom: "Voix qui corrompt (passive, dès CA 5+)", effet: "+2 Persuasion, Bluff et Intimidation. Contrepartie : méfiance sociale dans la haute société et les lieux sacrés",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Persuasion", valeur: 2, duree: "permanente" },
                { type: "bonus", cible: "Bluff", valeur: 2, duree: "permanente" },
                { type: "bonus", cible: "Intimidation", valeur: 2, duree: "permanente" },
                { type: "special", note: "Chiffré (validé avec Thomas) par rapport au texte d'origine (\"tous les effets de charme/séduction\", non chiffrable) : +2 aux 3 compétences de manipulation sociale de COMPETENCES_PAR_CARAC.CHA (Représentation exclue, plus proche de la performance artistique que de la séduction/manipulation) — déjà codé dans Personnage.bonusCompetence(), gate dès CA 5+ (this.corruptionMajeure >= 5), même principe que les autres passifs 'dès CA 5+' déjà mécanisés. Contrepartie (méfiance sociale en haute société/lieux sacrés) non modélisée — narratif, à la table." } ] } },
          { rang: 5, nom: "Symphonie du Chaos (L, 1x/scénario)", effet: "Zone large (alliés inclus s'ils sont pris dedans) : résistance ou frénésie chaotique plusieurs tours. +3 CS immédiat — risque réel pour le groupe",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "zone", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "confuse", duree: "3" },
                { type: "special", note: "Zone large touchant alliés comme ennemis (frénésie chaotique sur échec de résistance). +3 CS (jauge de Chaos) immédiat — risque réel pour le groupe, à arbitrer par le MJ." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : alchimiste-buveur (Alcoolisme), duelliste (Rapière), acrobate (Spectacle), démolisseur tactique (Chant). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Rapière et Spectacle se combinent naturellement pour un barde combattant agile ; Alcoolisme et Chant forment un duo de soutien original (boost personnel + affaiblissement ennemi, sans dégâts directs).",
    ],
  },

  pretre: {
    classe: "pretre",
    nom_affiche: "Prêtre",
    de_de_vie: "1d8",
    armes: "Armes contondantes à une main (marteau, masse) + une arme sacrée selon le dieu vénéré",
    armures: "Jusqu'à la chemise de mailles ; petit ou grand bouclier selon la divinité",
    attaque: { contact: null, distance: null, magique: "Mod. de SAGESSE" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. La Voie du chaos n'est pas une voie « par défaut » : mécanique de corruption progressive, à réserver à un joueur volontaire avec accord du MJ.",
    voies: [
      {
        nom: "Voie de la guérison",
        speciale: false,
        description: "Adaptation de la Voie des soins officielle, ajustée pour éviter la frustration des soins limités en début de partie.",
        rangs: [
          { rang: 1, nom: "Soins légers", effet: "1d8 + niveau PV par le toucher. Utilisable [rang+Mod. de SAG] fois/jour",
            mecanique: { type: "activable", usage: { frequence: "libre", formuleUsage: "rang+Mod.SAG" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "soin", formule: "1d8+niveau" } ] } },
          { rang: 2, nom: "Soins modérés", effet: "Version plus puissante, même limite [rang+Mod. de SAG] fois/jour",
            mecanique: { type: "activable", usage: { frequence: "libre", formuleUsage: "rang+Mod.SAG" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "soin", formule: "2d8+niveau" },
                { type: "special", note: "Formule interpolée entre Soins légers (1d8+niveau) et Grand Soin du rang 4 (3d8+niveau) — le texte ne donne pas de valeur exacte, à confirmer avec Thomas." } ] } },
          { rang: 3, nom: "Purification", effet: "Neutralise un poison ou une maladie par le toucher (enlève un état néfaste actif)",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "retraitEtat" },
                { type: "special", note: "Mécanisé (validé avec Thomas), même schéma que Jeûne purificateur (Moine, Voie de l'ascétisme rang 3) : retire le plus ancien état actif de catégorie non-buff sur la cible (poison/maladie repliés sur 'un état néfaste', l'app n'ayant pas de sous-catégorie dédiée)." } ] } },
          { rang: 4, nom: "Bénédiction (L)", effet: "Au choix : Grand Soin (3d8+niveau, 1 cible) OU Soin partagé (1d8+Mod. de SAG, jusqu'à 3 cibles). [rang+Mod. de SAG] fois/jour",
            mecanique: { type: "limitee", usage: { frequence: "libre", formuleUsage: "rang+Mod.SAG" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "soin", formule: "3d8+niveau",
                  choix: { titre: "Bénédiction", consigne: "Choisis le mode de soin :",
                    options: [ { valeur: "grand_soin", label: "Grand Soin (1 cible, 3d8+niveau)" }, { valeur: "soin_partage", label: "Soin partagé (jusqu'à 3 cibles, 1d8+Mod.SAG chacune)" } ] } },
                { type: "special", note: "Mécanisé (validé avec Thomas) : ouvre un overlay de choix à l'activation (modal générique déjà utilisé par Toucher flétrissant/Poing élémentaire). 'Grand Soin' traverse le flux standard (1 cible via le sélecteur habituel, formule 3d8+niveau). 'Soin partagé' est résolu par un cas particulier dédié dans Capacites.lancer() (nouveau paramètre cibleIds, jusqu'à 3 cibles indépendantes via un <select multiple> côté app.js, chacune reçoit son propre jet de 1d8+Mod.SAG) — seule capacité du jeu à cibler plusieurs alliés en une seule activation." } ] } },
          { rang: 5, nom: "Résurrection (rituel, 10 min)", effet: "Ramène un mort depuis moins de [Mod. de SAG] heures, relique et lien personnel requis. Revient avec 1d6 PV",
            mecanique: { type: "rituel", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "soin", formule: "1d6" },
                { type: "special", note: "Ramène un mort depuis moins de [Mod.SAG] heures ; nécessite une relique et un lien personnel avec la cible ; rituel de 10 minutes — conditions non modélisées par le schéma standard." } ] } },
        ],
      },
      {
        nom: "Voie de la conversion",
        speciale: false,
        description: "Adaptation des Voies de la foi et de la spiritualité officielles — la dimension sociale et protectrice de la religion plutôt que le combat.",
        rangs: [
          { rang: 1, nom: "Vêtements sacrés", effet: "+5 DEF tant qu'aucune armure physique n'est portée — la foi seule protège",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 5, duree: "permanente" },
                { type: "special", note: "Actif uniquement torse vide (aucune armure physique) — déjà calculé dans Personnage (cf. bonusDefCapacites), condition non générique au schéma standard." } ] } },
          { rang: 2, nom: "Voix de la persuasion", effet: "+2 par rang atteint dans la voie à tous les tests de CHA visant à persuader, convaincre ou prêcher",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Persuasion", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence('Persuasion')." } ] } },
          { rang: 3, nom: "Arme bénie", effet: "+1 attaque et +2 DM au contact contre les créatures maléfiques ou mortes-vivantes",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas, valeurs +1 attaque/+2 DM). Contrairement à Poing béni (Moine)/Sentence finale (Chevalier) — résolus via Capacites.lancer() avec une cible connue — le panneau d'attaque rapide (armes) ne résout jamais de cibleId : implémenté comme une bascule manuelle (togglesDons.arme_benie, même mécanisme que les dons Frappe puissante/Tir de précision), le joueur déclarant lui-même que la cible visée est maléfique/morte-vivante. Câblé dans Personnage.aArmeBenie() (gate) + les 2 sites app.js qui construisent attContact/dmgContact (rendreFicheSidebarBattlemap, rendreDockCombat)." } ] } },
          { rang: 4, nom: "Conviction avancée (L, 15 m)", effet: "Attaque magique vs DEF : la cible accomplit une action raisonnable demandée dans l'heure. Refuse le suicidaire. Immunité 24h après résistance",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "charmee", duree: "1" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de null (difficulté réelle 10+Mod.SAG de la cible, non modélisable) à 'DEF' — même principe qu'Enchanteur Fascination/Suggestion. Contre 'DEF', le jet magique est désormais pleinement automatisé. Refuse le suicidaire. Immunité 24h après résistance réussie (non trackée)." } ] } },
          { rang: 5, nom: "Voix de la foi (L, 1x/scénario, 10 m)", effet: "Alliés/réceptifs : +2 à tous les tests pendant [5+Mod. de SAG] tours. Hostiles/opposés à sa foi : -2, même durée",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: 5, zone: 5, jetOppose: null,
              effets: [ { type: "special", note: "Alliés/réceptifs dans la zone : +2 à TOUS les tests pendant [5+Mod.SAG] tours. Hostiles/opposés à sa foi : -2, même durée — portée sur 'tous les tests' et double polarité non modélisées par le type 'bonus' standard." } ] } },
        ],
      },
      {
        nom: "Voie de l'exorcisme",
        speciale: false,
        description: "Contrôle pur — pas de dégâts directs, tout en bannissement, immobilisation et purification. Laisse le combat à l'Inquisition.",
        rangs: [
          { rang: 1, nom: "Symbole sacré (activable, 10 m)", effet: "Attaque magique contre une cible démoniaque/morte-vivante : Repoussée (6 m), ne peut s'approcher à moins de 3 m pendant 1 tour",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "repoussee", duree: "1" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : l'éligibilité de la cible (démoniaque/morte-vivante) est désormais vérifiée automatiquement via le champ 'race' du bestiaire (_cibleEstDemonOuMortVivant, capacites.js) — bloque l'activation avec un message clair si la cible ne correspond pas, plutôt que de laisser un jet se dérouler pour rien. Repousse de 6 m ; la cible ne peut s'approcher à moins de 3 m pendant 1 tour (restriction additionnelle non capturée par l'état seul)." } ] } },
          { rang: 2, nom: "Rite de bannissement (L)", effet: "Attaque magique : échec → Immobilisée [1+Mod. de SAG] tours. Si invoquée et niveau inférieur : bannissement complet immédiat",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "immobilisee", duree: "1+Mod.SAG" },
                { type: "special", note: "Si la cible est invoquée et de niveau inférieur au Prêtre : bannissement complet immédiat au lieu de l'immobilisation — non modélisé par le schéma standard." } ] } },
          { rang: 3, nom: "Purification du lieu (rituel, 10 min)", effet: "Purifie une zone de 10 m de toute corruption mineure ambiante",
            mecanique: { type: "rituel", usage: { frequence: "libre" }, cible: "zone", portee: null, zone: 5, jetOppose: null,
              effets: [ { type: "special", note: "Purifie une zone de 10 m de toute corruption mineure ambiante — effet narratif/environnemental, pas un effet de combat chiffrable." } ] } },
          { rang: 4, nom: "Exorcisme (L)", effet: "Attaque magique opposée à l'entité possédant un hôte : réussite → entité expulsée, hôte survit",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "special", note: "Simplifié (validé avec Thomas, trouvé lors de la vérification finale) : caracDefenseur passé de 'Volonte' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de Volonté/SAG par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible), même simplification que Chant corrupteur (Barde)/Manipulation mentale (Nécromancien) et consorts. Réussite : l'entité possédant l'hôte est expulsée, l'hôte survit — pas d'état dédié 'possédé/expulsé' dans le catalogue, reste narratif." } ] } },
          { rang: 5, nom: "Sceau inviolable (L, 1x/scénario)", effet: "Empêche toute entité démoniaque/morte-vivante d'entrer/sortir d'une zone (20 m) pendant [Niveau] heures",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: null, zone: 10, jetOppose: null,
              effets: [ { type: "special", note: "Empêche toute entité démoniaque/morte-vivante d'entrer/sortir de la zone pendant [Niveau] heures — durée en heures hors combat, hors du vocabulaire de durée standard (tours/finCombat/finScenario)." } ] } },
        ],
      },
      {
        nom: "Voie de l'inquisition",
        speciale: false,
        description: "Traque et châtiment — orientée combat, centrée sur la marque d'une cible plutôt que la détection passive.",
        rangs: [
          { rang: 1, nom: "Œil de l'inquisiteur (1x/scène)", effet: "Test de SAG vs DEF de la cible suspectée : réussite → Marquée pour la scène/le combat",
            mecanique: { type: "activable", usage: { frequence: "1x/scene" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "SAG", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "marquee_pretre", duree: "finCombat" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de SAG par monstre, donc l'opposition SAG vs SAG d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet (1d20+Mod.SAG) est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible)." } ] } },
          { rang: 2, nom: "Frappe purificatrice (activable)", effet: "Les attaques contre une cible Marquée infligent +1d6 DM sacrés",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "sacre" },
                { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive' (bouton Lancer masqué partout dans l'app) alors que l'effet degats est réel — passé à 'activable'. Réservé à une cible déjà Marquée (marquee_pretre) — condition non vérifiée automatiquement, à activer manuellement sur une attaque réussie contre elle." } ] } },
          { rang: 3, nom: "Confession forcée (L)", effet: "Attaque magique contre une cible Marquée : réponse honnête obligatoire + -2 DEF jusqu'à la fin du combat",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "DEF", valeur: -2, duree: "finCombat", differe: true },
                { type: "special", note: "Réponse honnête obligatoire de la cible — effet narratif non chiffrable. Réservé à une cible déjà Marquée (marquee_pretre). Bugfix (validé avec Thomas, trouvé en auditant le même bug côté Barde) : differe:true ajouté — le malus DEF s'appliquait jusqu'ici même sur un jet raté." } ] } },
          { rang: 4, nom: "Chasse sans répit (passive)", effet: "Ignore la dissimulation/invisibilité d'une cible Marquée ; +2 m de déplacement en la poursuivant",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Ignore la dissimulation/invisibilité d'une cible Marquée ; +2 m de déplacement en la poursuivant — règles de perception/déplacement non chiffrables par le schéma standard." } ] } },
          { rang: 5, nom: "Bûcher purificateur (L, 1x/scénario)", effet: "Attaque contre une cible Marquée : 5d6 DM sacrés, doublés si la culpabilité est confirmée dans la fiction",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "5d6", elementaire: "sacre" },
                { type: "special", note: "Dégâts doublés si la culpabilité de la cible est confirmée dans la fiction — condition narrative/MJ, non trackée automatiquement." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — malédictions et corruption. Le Prêtre finit par manier la maladie et la malédiction comme une arme : combattre le mal en devenant un vecteur de pourriture.",
        rangs: [
          { rang: 1, nom: "Flétrissure (sort, L, 15 m)", effet: "Attaque magique : malédiction, 1d4 DM/tour pendant [3+Mod. de SAG] tours. +1 CS",
            mecanique: { type: "limitee", corruption: 1, usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "maudite", duree: "3+Mod.SAG", formuleDot: "1d4" }, { type: "degats", formule: "1d4", elementaire: "chaos" },
                { type: "special", note: "+1 point de jauge de Chaos (CS) — mécanique de jauge de Voie du chaos, non trackée par le schéma standard." } ] } },
          { rang: 2, nom: "Don corrompu (passive)", effet: "Force n'importe quel sort/capacité en payant +1 CS — intensifie un DOT actif (+1d4 DM/tour)",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Coût : +1 CS (jauge de Chaos). Force n'importe quel sort/capacité et intensifie un DOT actif de +1d4 DM/tour — dépendance inter-capacités et jauge non modélisées automatiquement." } ] } },
          { rang: 3, nom: "Peste rampante (L, zone 5 m, 15 m)", effet: "DOT 2d4 DM/tour pendant [3+Mod. de SAG] tours vs DEF. +2 CS. Échec catastrophique : jet table Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "zone", portee: 7, zone: 2,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "maudite", duree: "3+Mod.SAG", formuleDot: "2d4" }, { type: "degats", formule: "2d4", elementaire: "chaos" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'CON' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de CON par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible), au prix de la nuance 'CON pour moitié' sur résistance réussie (le schéma standard ne gère que touché/raté binaire, comme les autres capacités vs DEF du jeu). +2 CS. Mécanisé (validé avec Thomas) : échec catastrophique du lanceur (1 naturel) déclenche désormais un jet 1d6 automatique sur la table de mutation Palier 1 (cf. MUTATION_PALIER1_TRIGGERS/_rollMutationPalier1 dans Capacites.lancer)." } ] } },
          { rang: 4, nom: "Corruption persistante (passive, dès CA 5+)", effet: "Ses DOT résistent à la dissipation/soins adverses. Contrepartie : soins reçus réduits de moitié, méfiance de son ordre",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Contrepartie 'soins reçus réduits de moitié' déjà codée dans Personnage.aCorruptionPersistante(), lue par soigner() côté app.js et appliquerSoinPersoLocal() côté capacites.js (les deux seuls points d'application d'un soin à un PJ). 'DOT résiste à la dissipation' reste hors schéma : Dissipation n'annule aucun DOT dans l'app. Méfiance de son ordre : narratif." } ] } },
          { rang: 5, nom: "Fléau ultime (L, 1x/scénario)", effet: "DOT 4d6 DM/tour pendant 5 tours, propagation aux créatures adjacentes (1d6 DM contagion/tour). +3 CS immédiat",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "maudite", duree: "5", formuleDot: "4d6" }, { type: "degats", formule: "4d6", elementaire: "chaos" },
                { type: "special", note: "Propagation aux créatures adjacentes : 1d6 DM contagion/tour (zone non chiffrée). +3 CS (jauge de Chaos) immédiat." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : soigneur (Guérison), prêcheur (Conversion), rituel-iste (Exorcisme), chasseur (Inquisition). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Exorcisme et Inquisition se combinent pour un chasseur de mal complet (contrôle + punition) ; Guérison et Conversion forment un duo de soutien classique, idéal pour un premier personnage.",
    ],
  },

  necromancien: {
    classe: "necromancien",
    nom_affiche: "Nécromancien",
    de_de_vie: "1d4",
    armes: "Dague et bâton ferré",
    armures: "Aucune (sauf en tissu) ; pas de bouclier",
    attaque: { contact: null, distance: null, magique: "Mod. d'INTELLIGENCE" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. Voie du chaos — Contrecoup de débordement : 1d6 DM chaotiques instantanés (le corps encaisse l'excès de pouvoir). Mécanique de corruption progressive, à réserver à un joueur volontaire avec accord du MJ.",
    voies: [
      {
        nom: "Voie du sang",
        speciale: false,
        description: "Vampirisme et vol de vitalité — le Nécromancien se régénère en se nourrissant du sang adverse.",
        rangs: [
          { rang: 1, nom: "Morsure du sang (sort, L, contact)", effet: "Attaque magique au contact : inflige 1d6+Mod. d'INT DM. Récupère la moitié des DM infligés en PV",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6+Mod.INT", elementaire: null },
                { type: "special", note: "Mécanisé (validé avec Thomas) : récupère automatiquement la moitié des dégâts réellement infligés (après réduction/armure) en PV — nouveau helper _appliquerVolDeVie (capacites.js), identifié par voie+rang, réutilisable par Vol de vitalité/Étreinte exsangue (même voie)." } ] } },
          { rang: 2, nom: "Régénération sanguine (passive)", effet: "S'il a infligé des DM via cette voie au tour précédent, regagne 1d4 PV au début du tour suivant",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : redevenu passif et entièrement automatique — le flag p.aInfligeDegatsSang est posé par _appliquerVolDeVie dès qu'une capacité de la Voie du sang inflige des dégâts, puis consommé au début du tour suivant du Nécromancien (Capacites.decompterEtatsDebutTour) pour régénérer 1d4 PV, journalisé comme les dégâts de début de tour. Plus de bouton Lancer séparé à activer manuellement." } ] } },
          { rang: 3, nom: "Vol de vitalité (sort, L, 15 m)", effet: "Attaque magique à distance : inflige 2d6 DM. Récupère l'intégralité des DM infligés en PV",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d6", elementaire: null },
                { type: "special", note: "Mécanisé (validé avec Thomas) : récupère automatiquement l'intégralité des dégâts réellement infligés (après réduction/armure) en PV — même helper _appliquerVolDeVie que Morsure du sang (rang 1, même voie)." } ] } },
          { rang: 4, nom: "Sang impie (passive)", effet: "Réduire une créature à 0 PV avec une capacité de cette voie régénère immédiatement 2d6 PV bonus",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : redevenu passif — la condition (réduire une créature à 0 PV avec une capacité de cette voie) est désormais entièrement vérifiable (PV connus après résolution) et déclenche automatiquement les 2d6 PV bonus, cf. _appliquerVolDeVie dans capacites.js (identifié par voie+rang, même bloc que le vol de vie de Morsure du sang/Vol de vitalité/Étreinte exsangue). Plus de bouton Lancer séparé à activer manuellement." } ] } },
          { rang: 5, nom: "Étreinte exsangue (L, 1x/combat)", effet: "Attaque au contact : inflige 4d6 DM. Récupère l'intégralité en PV et gagne +2 à toutes ses carac. pendant 2 tours",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "4d6", elementaire: null },
                { type: "bonus", cible: "FOR", valeur: 2, duree: "2", differe: true },
                { type: "bonus", cible: "DEX", valeur: 2, duree: "2", differe: true },
                { type: "bonus", cible: "CON", valeur: 2, duree: "2", differe: true },
                { type: "bonus", cible: "INT", valeur: 2, duree: "2", differe: true },
                { type: "bonus", cible: "SAG", valeur: 2, duree: "2", differe: true },
                { type: "bonus", cible: "CHA", valeur: 2, duree: "2", differe: true },
                { type: "special", note: "Mécanisé (validé avec Thomas) : récupère automatiquement l'intégralité des dégâts réellement infligés en PV — même helper _appliquerVolDeVie que Morsure du sang/Vol de vitalité (même voie). +2 à TOUTES les caractéristiques désormais câblé (6 effets 'bonus' séparés, un par carac — Personnage.mod() lit déjà bonusTemporaire(code) génériquement pour n'importe quel code, aucun changement moteur nécessaire) ; differe:true sur chacun pour rester gaté sur la confirmation de la touche, comme les dégâts." } ] } },
        ],
      },
      {
        nom: "Voie de l'outre-tombe",
        speciale: false,
        description: "Réanimer les morts et lever une armée. Adaptation de la Voie de l'outre-tombe officielle.",
        rangs: [
          { rang: 1, nom: "Effroi (sort, L, 20 m)", effet: "Attaque magique vs DEF : fuite [1d4+rang] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 10, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "effrayee", duree: "1d4+rang" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de null (difficulté réelle 10+Mod.INT, testée en FOR ou SAG au choix de la cible, non modélisable) à 'DEF' — même principe que Fascination/Suggestion (Enchanteur), Conviction avancée (Prêtre). Contre 'DEF', le jet magique est désormais pleinement automatisé. Limite '1x/combat par créature ciblée' non trackée (usage par cible, hors du système usagesCapacites qui compte par personnage)." } ] } },
          { rang: 2, nom: "Animation des morts (sort, L)", effet: "Anime un cadavre humanoïde moyen (<1h) en zombie (Init 8, DEF 10, PV 12, Att +3, DM 1d6+1, 50% vitesse). 1 zombie/rang. Se dégrade -1 PV/min",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé via le catalogue INVOCATIONS (data/donnees.js, entrée 'zombie_necromancien') et Carte.ouvrirModalInvocation/confirmerInvocation (js/carte.js) : pose un jeton 'Zombie' (Init 8, DEF 10, PV 12, Att +3, DM 1d6+1) sur la carte, proposé uniquement si ce rang est acquis. Limite '1 zombie/rang' et dégradation -1 PV/minute non trackées automatiquement (pas de compteur d'invocations actives ni de minuteur temps réel côté app) — ajustement manuel de table." } ] } },
          { rang: 3, nom: "Pourriture des chairs (sort, L, 10 m)", effet: "Attaque magique : 1d6+Mod. d'INT DM",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6+Mod.INT", elementaire: null } ] } },
          { rang: 4, nom: "Renfort macabre (passive)", effet: "Tous les morts-vivants contrôlés : +2 attaque, +5 PV, cessent de se dégrader avec le temps",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Carte._resoudreInvocation() : +2 attaque et +5 PV appliqués automatiquement à l'invocation Zombie dès ce rang acquis. L'arrêt de la dégradation n'a rien à 'stopper' côté app : cette dégradation elle-même n'est trackée par aucun minuteur automatique (cf. rang 2, ajustement manuel de table de toute façon)." } ] } },
          { rang: 5, nom: "Légion de squelettes (1x/jour)", effet: "Invoque des squelettes pendant [niveau] tours, rayon 20 m : 3d6 DM/tour auto (réduits à 1d6 si action limitée d'opposition)",
            mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "zone", portee: null, zone: 10, jetOppose: null,
              effets: [ { type: "degats", formule: "3d6", elementaire: null },
                { type: "special", note: "Invocation d'une légion de squelettes infligeant ces dégâts automatiquement chaque tour pendant [niveau] tours (réduits à 1d6 si la cible utilise une action limitée pour s'opposer) — mécanique d'invocation zone/DOT non standard." } ] } },
        ],
      },
      {
        nom: "Voie de la sombre magie",
        speciale: false,
        description: "Malédictions, affaiblissement et manipulation mentale — briser ses ennemis de l'intérieur.",
        rangs: [
          { rang: 1, nom: "Œil mauvais (sort, L, 15 m)", effet: "Attaque magique : -2 à un type de test au choix (attaque, DEF, résistance) pendant [3+Mod. d'INT] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "attaque", valeur: -2, duree: "3+Mod.INT", differe: true },
                { type: "special", note: "Le type de test pénalisé (attaque, DEF ou résistance) est au choix du lanceur à l'activation — 'attaque' utilisé par défaut ici, 'DEF' modélisable via un second effet bonus si choisi. Bugfix (validé avec Thomas, trouvé en auditant le même bug côté Barde) : differe:true ajouté — le malus s'appliquait jusqu'ici même sur un jet raté." } ] } },
          { rang: 2, nom: "Toucher flétrissant (sort, L, contact)", effet: "Attaque magique au contact : -1d4 à l'attaque ou à la DEF de la cible (au choix), pendant 2 tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "choix",
                  choix: { titre: "Toucher flétrissant", consigne: "Choisis le test pénalisé pour la cible :",
                    options: [ { valeur: "attaque", label: "Attaque -1d4" }, { valeur: "DEF", label: "DEF -1d4" } ] },
                  valeur: "-1d4", duree: "2", differe: true },
                { type: "special", note: "Bugfix (validé avec Thomas, trouvé en auditant le même bug côté Barde) : differe:true ajouté — le malus s'appliquait jusqu'ici même sur un jet raté. Même mécanisme que Feinte/Note discordante/Requiem du silence du Barde." } ] } },
          { rang: 3, nom: "Manipulation mentale (sort, L, 10 m)", effet: "Test d'INT vs DEF : réussite → dicte une action limitée non suicidaire au prochain tour de la cible",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "INT", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "charmee", duree: "1" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de SAG par monstre, donc l'opposition INT vs SAG d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet (1d20+Mod.INT) est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible)." } ] } },
          { rang: 4, nom: "Malédiction profonde (passive)", effet: "Œil mauvais passe à -3 DEF ; Toucher flétrissant passe à -1d6",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Redéfini (validé avec Thomas), remplace le texte d'origine ('double la durée, dissipable uniquement par magie de rang supérieur' — non chiffrable, une formule de durée type '3+Mod.INT' ne se double pas aussi simplement qu'un dé). Upgrade numérique des rangs 1/2 de la même voie, même principe qu'Intensité élémentaire (Magicien)/Refrain lancinant (Barde), identifié par voie+rang dans Capacites.resoudreEffet : Œil mauvais passe de -2 attaque à -3 DEF, Toucher flétrissant de -1d4 à -1d6." } ] } },
          { rang: 5, nom: "Domination des ombres (L, 1x/scénario)", effet: "Contrôle total d'une cible [1+Mod. d'INT] tours vs DEF. Ordre suicidaire/contraire à sa nature : nouveau test pour résister",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "charmee", duree: "1+Mod.INT" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de SAG par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé (touché/raté/critique via obtenirDefCible). Un ordre suicidaire ou contraire à la nature de la cible déclenche un nouveau test de résistance — condition non trackée automatiquement." } ] } },
        ],
      },
      {
        nom: "Voie des âmes",
        speciale: false,
        description: "Capturer et lier des âmes, voler le savoir des morts. Un nécromancien érudit qui traite les âmes comme une ressource.",
        rangs: [
          { rang: 1, nom: "Murmure des morts (rituel, L, contact)", effet: "Communie avec l'âme d'un mort récent (<[Mod. d'INT] jours) et lui pose une question. Réponse honnête mais limitée — refus possible si douloureuse",
            mecanique: null },
          { rang: 2, nom: "Capture d'âme (sort, L, 10 m)", effet: "Attaque magique pour capturer l'âme d'une créature qui vient de mourir. Stockée dans un réceptacle ; max 3 simultanées",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null, jetOppose: null, ameGain: 1,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : réceptacle d'âmes désormais suivi (p.amesStockees, plafonné à 3 via mecanique.ameGain — cf. Capacites.lancer). Condition « créature qui vient de mourir » reste non vérifiée automatiquement (pas de suivi PV monstre en temps réel), comme le reste des préconditions non chiffrables de l'app." } ] } },
          { rang: 3, nom: "Libération vengeresse (L, dépense une âme)", effet: "Libère une âme contre un ennemi à distance : 2d6+Mod. d'INT DM. L'âme se dissipe définitivement après usage",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null, ameCout: 1,
              effets: [ { type: "degats", formule: "2d6+Mod.INT", elementaire: null },
                { type: "special", note: "Mécanisé (validé avec Thomas) : consomme automatiquement une âme du réceptacle (mecanique.ameCout) — bloque l'activation si le réceptacle est vide." } ] } },
          { rang: 4, nom: "Savoir volé (passive)", effet: "Chaque âme en sa possession donne +1 à un test d'INT au choix, cumulable jusqu'à +3",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : +1 par âme en réserve (plafonné à +3, cf. Personnage.bonusSavoirVole) appliqué automatiquement au bouton « Test de INT » de la fiche/dock. Réservé à INT, comme précisé par le texte — les autres caracs n'en bénéficient pas." } ] } },
          { rang: 5, nom: "Moisson d'âmes (L, 1x/scénario)", effet: "[3+Mod. d'INT] tours : capture automatiquement l'âme de toute créature qui meurt dans un rayon de 20 m, sans test ni limite de stockage",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: null, zone: 10, jetOppose: null,
              effets: [ { type: "special", note: "Pendant [3+Mod.INT] tours, capture automatiquement l'âme de toute créature qui meurt dans la zone, sans test ni limite de stockage — mécanique de capture automatique non chiffrable par degats/soin/etat/bonus." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — Corruption de Sort. Une magie instable, puisée à une source qui dépasse le Nécromancien et qui le corrompt en retour.",
        rangs: [
          { rang: 1, nom: "Étincelle chaotique (L, 20 m)", effet: "Attaque magique : réussite → 2d8 DM chaotiques (pas de Mod. d'INT, sort instable). +1 CS",
            mecanique: { type: "limitee", corruption: 1, usage: { frequence: "libre" }, cible: "ennemi", portee: 10, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d8", elementaire: "chaos" },
                { type: "special", note: "Pas de Mod.INT ajouté (sort instable, dégâts fixes aux dés). +1 point de jauge de Chaos (CS), non trackée par le schéma standard." } ] } },
          { rang: 2, nom: "Don corrompu (passive)", effet: "Une fois par tour, force n'importe quel sort/capacité : +1d6 DM ou relance un dé de DM raté. +1 CS",
            mecanique: { type: "activable", usage: { frequence: "1x/tour" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Alternative possible : relance un dé de dégâts raté au lieu du bonus +1d6. Coût : +1 CS (jauge de Chaos). Force n'importe quel sort/capacité — dépendance inter-capacités non modélisée automatiquement." } ] } },
          { rang: 3, nom: "Vrille de réalité (L, zone 5 m, 15 m)", effet: "Attaque magique par cible vs DEF : 4d6 DM. +2 CS. 18-20 naturel : jet table Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "zone", portee: 7, zone: 2,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "4d6", elementaire: "chaos" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'DEX' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de DEX par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé (touché/raté/critique), au prix de la nuance 'DEX pour moitié' sur résistance réussie (le schéma standard ne gère que touché/raté binaire). +2 CS. Mécanisé (validé avec Thomas) : jet naturel 18-20 (seuil fixe propre à cette capacité, indépendant du seuil de critique de l'arme) déclenche désormais un jet 1d6 automatique sur la table de mutation Palier 1." } ] } },
          { rang: 4, nom: "Symbiose du chaos (passive, dès CA 5+)", effet: "Au choix fixe : +2 réduction DM, ou +1d6 DM à tous les sorts. Contrepartie : détecté comme corrompu (désavantage CHA religieux, lieux saints fermés)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Choix fixé à l'acquisition (non rejouable) déjà codé, dès CA 5+ : +2 réduction de dégâts (Personnage.bonusReductionCapacites) ou +1d6 DM à tous les sorts (bonusDegatsSortsChaos, lu par Capacites.resoudreEffet). Contrepartie détectée comme corrompu — désavantage CHA en contexte religieux, non trackée." } ] } },
          { rang: 5, nom: "Avatar du chaos (L, 1x/scénario)", effet: "[3+Mod. d'INT] tours : +4 attaque magique, +2d6 DM à tous les sorts, divise par 2 les DM physiques subis. +3 CS immédiat",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 4, duree: "3+Mod.INT" },
                { type: "etat", id: "avatar_du_chaos", duree: "3+Mod.INT" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : +2d6 DM à tous les sorts désormais câblé — Personnage.bonusDegatsSortsChaos() vérifie maintenant aussi l'état temporaire 'avatar_du_chaos' (en plus du choix permanent CA 5+ de Symbiose du chaos, rang 4), les deux pouvant se cumuler. +3 CS (jauge de Chaos) immédiat. Division par 2 des DM physiques subis : cf. état 'avatar_du_chaos' (même mécanique que Forme du chaos sauvage du Druide)." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : viscéral (Sang), invocateur (Outre-tombe), manipulateur (Sombre magie), érudit macabre (Âmes). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Outre-tombe et Sombre magie se combinent pour un nécromancien tacticien (armée + contrôle mental) ; Sang et Âmes forment un duo d'érudit autosuffisant.",
    ],
  },

  druide: {
    classe: "druide",
    nom_affiche: "Druide",
    de_de_vie: "1d8",
    armes: "Dague, bâton, épieu, javelot, arc court",
    armures: "Armure de cuir ; petit bouclier en bois (DEF +1)",
    attaque: { contact: null, distance: null, magique: "Mod. de SAGESSE" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. Voie du chaos — version particulière : les Rangs 1 et 2 sont déjà des mutations entamées (la corruption grimpe avant même le premier combat). À réserver à un joueur volontaire avec accord du MJ.",
    voies: [
      {
        nom: "Voie de la nature",
        speciale: false,
        description: "Survie, terrain et résistance aux éléments. Adaptation de la Voie de la nature officielle.",
        rangs: [
          { rang: 1, nom: "Survie", effet: "+2 par rang atteint dans la voie à tous les tests de survie en milieu naturel (survie, vigilance, discrétion)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Survie", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence() pour Survie, Discrétion et Perception (vigilance repliée dessus, faute d'entrée dédiée)." } ] } },
          { rang: 2, nom: "Terrain naturel", effet: "Aucune pénalité de déplacement en terrain difficile (neige, boue, broussailles) ; +2 attaque et DEF lors d'un combat dans ces conditions",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "permanente" }, { type: "bonus", cible: "DEF", valeur: 2, duree: "permanente" },
                { type: "special", note: "Bonus actif uniquement en terrain difficile naturel (neige/boue/broussailles) — condition non trackée automatiquement. Ignore aussi la pénalité de déplacement en terrain difficile." } ] } },
          { rang: 3, nom: "Combat au bâton", effet: "Combat avec les deux extrémités de son bâton : deux attaques de contact, 1d6+Mod. de FOR ou DEX (au choix) chacune",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6+Mod.FOR", elementaire: null,
                  choix: { titre: "Combat au bâton", consigne: "Choisis la caractéristique utilisée pour les deux attaques :",
                    options: [{ valeur: "FOR", label: "Force" }, { valeur: "DEX", label: "Dextérité" }] } },
                { type: "special", note: "Mécanisé (validé avec Thomas) : résolution dédiée dans Capacites.lancer (identifiée par voie+rang, hors du schéma jetOppose standard qui ne gère qu'un seul jet) — boucle FIXE de 2 attaques au contact vs DEF de la même cible (contrairement à Avalanche de coups du Moine, qui s'arrête au premier raté), chacune 1d6+Mod.FOR ou 1d6+Mod.DEX selon le choix fait à l'activation. Assomption : le choix de caractéristique s'applique aux DEUX attaques (le texte ne précise pas s'il peut différer d'une attaque à l'autre dans le même tour)." } ] } },
          { rang: 4, nom: "Résistance naturelle", effet: "Réduction de DM égale à [Rang×2] contre les dégâts naturels (froid, chaleur, chutes, poisons, animaux/insectes)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Personnage.reductionDegatsNaturels() = 2×rangMaxVoie('Voie de la nature') ; nouveau type de dégâts 'Naturel' ajouté au sélecteur du formulaire Subir des dégâts (froid/chaleur/chute/poison/animal), distinct de physique/magique." } ] } },
          { rang: 5, nom: "Maîtrise du milieu", effet: "Capacité finale de maîtrise du milieu naturel (contenu officiel incertain — à compléter avec le manuel si besoin)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Contenu officiel incertain d'après le texte lui-même — à définir avec Thomas avant toute automatisation." } ] } },
        ],
      },
      {
        nom: "Voie des compagnons",
        speciale: false,
        description: "Lier un animal, communiquer, se transformer. Adaptation de la Voie des animaux officielle.",
        rangs: [
          { rang: 1, nom: "Communication animale", effet: "+2 par rang à tous les tests destinés à influencer un animal",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Dressage", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence('Dressage')." } ] } },
          { rang: 2, nom: "Nuée d'insectes (sort, L, 20 m)", effet: "Attaque magique : 1 DM/tour et -2 à toutes ses actions pendant [5+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 10, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "maudite", duree: "5+Mod.SAG", formuleDot: "1" }, { type: "degats", formule: "1", elementaire: null },
                { type: "special", note: "-2 à TOUTES les actions de la cible pendant la durée — non modélisé par le type 'bonus' standard (limité à attaque/DEF/initiative/une caractéristique)." } ] } },
          { rang: 3, nom: "Compagnon animal (oiseau de proie)", effet: "Lien télépathique, perception partagée (+5), Att = attaque magique du Druide, DM 1d4",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé via le catalogue INVOCATIONS (entrée 'compagnon_druide') et Carte.ouvrirModalInvocation : pose un jeton 'Compagnon animal' (PV 10, DEF 12, Att = attaque magique du Druide, DM 1d4) sur la carte. Lien télépathique/perception partagée reste narratif, non chiffrable." } ] } },
          { rang: 4, nom: "Masque du prédateur (sort)", effet: "Prend les traits d'un fauve : Mod. de SAG en Init/attaque/DM, vision nocturne, pendant [5+Mod. de SAG] tours",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "initiative", valeur: "Mod.SAG", duree: "5+Mod.SAG" },
                { type: "bonus", cible: "attaque", valeur: "Mod.SAG", duree: "5+Mod.SAG" },
                { type: "bonus", cible: "degats", valeur: "Mod.SAG", duree: "5+Mod.SAG" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : Mod.SAG aux dégâts désormais câblé via un nouveau bonus cible:'degats', lu génériquement par Personnage.bonusTemporaire('degats') aux mêmes 3 points que les autres bonus de dégâts temporaires (Frappe du pacte, Déchaînement...) — comme eux, limité au contact rapide (dmgContact), pas distance/magique. Confère aussi la vision nocturne — non modélisé (pas de mécanique de vision dans l'app)." } ] } },
          { rang: 5, nom: "Forme animale (L)", effet: "Se transforme en un animal de taille ≤ à la sienne, conserve ses PV, acquiert ses capacités naturelles. Deux profils au choix : Ours (tank — +4 DEF, PV temporaires, dégâts physiques subis divisés par 2, +1d6 DM de griffes) ou Loup (dex/crit — +2 DEF, +Mod.DEX Initiative, +2 cases de déplacement, critique sur 18-20 au contact, +1d4 DM de crocs), pendant [5+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special",
                  choix: { titre: "Forme animale", consigne: "Choisis la forme animale :",
                    options: [ { valeur: "ours", label: "Ours — tank (DEF, PV temp., réduction de dégâts, griffes)" },
                      { valeur: "loup", label: "Loup — dex/crit (Initiative, déplacement, critique abaissé, crocs)" } ] },
                  note: "Mécanisé (validé avec Thomas) : la transformation complète d'origine (stats/capacités remplacées par celles de l'animal, aucune infrastructure de stat-block alternatif dans l'app) est remplacée par un choix entre deux profils de buff temporaire, même principe que Moine « Fusion élémentaire » — table FORMES_ANIMALES_DRUIDE (Capacites.lancer) qui substitue entièrement mecanique.effets selon le choix fait à l'activation. Cet effet 'special' n'est qu'un gabarit structurel pour le validateur/le sélecteur de choix. Ours : +4 DEF, 2d6 PV temp., dégâts physiques subis divisés par 2 (nouvel état 'forme_ours', même mécanisme que Forme du chaos sauvage), +1d6 DM (nouveau bonus générique cible:'degats'). Loup : +2 DEF, +Mod.DEX Initiative, +2 cases de déplacement (état 'forme_loup', Combat._deplacementMax), critique sur 18-20 au contact (Personnage.critMinAttaque), +1d4 DM. Détails de conservation de taille/capacités naturelles hors combat restent narratifs." } ] } },
        ],
      },
      {
        nom: "Voie du protecteur",
        speciale: false,
        description: "Gardien défensif, magie de protection pour le groupe — un soutien qui blinde ses alliés plutôt que lui-même.",
        rangs: [
          { rang: 1, nom: "Égide naturelle (sort, L, 10 m)", effet: "Attaque magique : +3 DEF à un allié pendant [3+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 3, duree: "3+Mod.SAG" } ] } },
          { rang: 2, nom: "Symbiose protectrice (passive)", effet: "+2 DEF permanent tant qu'il se trouve en milieu naturel",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "permanente" },
                { type: "special", note: "Actif uniquement en milieu naturel — condition non trackée automatiquement." } ] } },
          { rang: 3, nom: "Écorce partagée (L, 10 m)", effet: "Un allié gagne une réduction de DM de 3 points pendant [3+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "reduction_degats", valeur: 3, duree: "3+Mod.SAG" },
                { type: "special", note: "Bonus temporaire posé sur l'allié ciblé, lu par Personnage.reductionDegats() via bonusTemporaire('reduction_degats') — décompté automatiquement tour par tour comme tout etatsActifs (même mécanisme que Bouclier arcanique)." } ] } },
          { rang: 4, nom: "Rempart vivant (L, zone 5 m, 15 m)", effet: "Tous les alliés dans la zone : +2 DEF et 1d6 PV temporaires",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: 7, zone: 2, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "finCombat" },
                { type: "pvTemp", formule: "1d6", duree: "finCombat" },
                { type: "special", note: "Déjà codé (type 'pvTemp', jamais cumulatif). Comme le bonus de DEF ci-dessus, mecanique.cible = 'zone' : jet résolu et affiché, application manuelle allié par allié — même limitation déjà acceptée pour le bonus de DEF." } ] } },
          { rang: 5, nom: "Sanctuaire du gardien (L, 1x/scénario, 10 m)", effet: "[5+Mod. de SAG] tours : alliés +4 DEF, régénèrent 1d4 PV/tour ; terrain difficile pour les ennemis uniquement",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: 5, zone: 5, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 4, duree: "5+Mod.SAG" },
                { type: "etat", id: "sanctuaire_gardien", duree: "5+Mod.SAG", formuleSoin: "1d4" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : le soin de 1d4 PV/tour est désormais un vrai HOT — nouveau champ générique formuleSoin (symétrique de formuleDot, ex. Brûlure/Maudite), relancé à chaque début de tour par Capacites.decompterEtatsDebutTour, journalisé comme tout autre soin de début de tour. mecanique.cible = 'zone' sans cibleId automatique : comme le bonus de DEF, application manuelle allié par allié (chaque allié reçoit sa propre entrée d'état, décomptée indépendamment). Terrain difficile pour les ennemis uniquement dans la zone reste narratif/non modélisé." } ] } },
        ],
      },
      {
        nom: "Voie du shaman",
        speciale: false,
        description: "Totems et buffs tribaux pour le groupe — un meneur spirituel complémentaire des autres voies.",
        rangs: [
          { rang: 1, nom: "Totem du courage (sort, L, 10 m)", effet: "Un allié gagne +2 en attaque pendant [3+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "3+Mod.SAG" } ] } },
          { rang: 2, nom: "Multitude des esprits (passive)", effet: "Peut maintenir 2 totems actifs simultanément sur des alliés différents",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Permet de maintenir 2 totems actifs simultanément sur des alliés différents — règle de cumul, pas un effet à lancer en soi." } ] } },
          { rang: 3, nom: "Totem de la force sauvage (sort, L, 10 m)", effet: "Un allié gagne +1d6 DM à ses attaques pendant [3+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "degats", valeur: "1d6", duree: "3+Mod.SAG" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : même mécanisme que Druide « Masque du prédateur » (Voie des compagnons rang 4) — nouveau bonus cible:'degats', lu génériquement par Personnage.bonusTemporaire('degats'), câblé aux 3 points de calcul de dmgContact. Le dé (1d6) est résolu une seule fois à la pose (comme tout bonus temporaire), pas relancé à chaque attaque de l'allié — limité au contact rapide, pas distance/magique, comme les autres bonus de dégâts déjà en jeu." } ] } },
          { rang: 4, nom: "Totem de la vélocité (sort, L, 10 m)", effet: "Un allié gagne une action de mouvement supplémentaire chaque tour pendant [3+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "totem_velocite", duree: "3+Mod.SAG" },
                { type: "special", note: "Pose l'état 'totem_velocite' sur l'allié ciblé : Combat._deplacementMax() double son déplacement de base tant que l'état est actif (modélise 'une action de mouvement supplémentaire chaque tour'), décompté automatiquement comme tout autre état." } ] } },
          { rang: 5, nom: "Convocation des esprits ancestraux (L, 1x/scénario, 15 m)", effet: "Tous les alliés dans la zone : +2 à toutes leurs caractéristiques pendant [5+Mod. de SAG] tours",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: 7, zone: 7, jetOppose: null,
              effets: [ { type: "bonus", cible: "FOR", valeur: 2, duree: "5+Mod.SAG" },
                { type: "bonus", cible: "DEX", valeur: 2, duree: "5+Mod.SAG" },
                { type: "bonus", cible: "CON", valeur: 2, duree: "5+Mod.SAG" },
                { type: "bonus", cible: "INT", valeur: 2, duree: "5+Mod.SAG" },
                { type: "bonus", cible: "SAG", valeur: 2, duree: "5+Mod.SAG" },
                { type: "bonus", cible: "CHA", valeur: 2, duree: "5+Mod.SAG" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : +2 à TOUTES les caractéristiques câblé (6 effets 'bonus' séparés, un par carac — même schéma que Nécromancien « Étreinte exsangue », Personnage.mod() lit déjà bonusTemporaire(code) génériquement, aucun changement moteur nécessaire). mecanique.cible = 'zone' sans cibleId automatique : comme le reste des bonus de zone, application manuelle allié par allié (sélecteur 'zone', cf. app.js)." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — le corps avant les pouvoirs. Des années à voir la forêt ravagée par le chaos, jusqu'à choisir de l'incarner pour mieux le combattre. Les Rangs 1 et 2 sont déjà des mutations entamées.",
        rangs: [
          { rang: 1, nom: "Chair instable", effet: "Attaque naturelle (griffes/ronces, contact) : 1d6 DM. Optionnel : pousser pour +1d6 DM (+1 CS)",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6", elementaire: null },
                { type: "special", note: "Optionnel : pousser pour +1d6 DM supplémentaires en payant +1 CS (jauge de Chaos) — coût/bonus optionnel non modélisé par un effet fixe." } ] } },
          { rang: 2, nom: "Écorce corrompue (passive)", effet: "+2 DEF naturelle permanente",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "permanente" } ] } },
          { rang: 3, nom: "Invocation tainted (L)", effet: "Invoque une créature/plante corrompue (PV=niveau×2, attaque=Druide-2, DM 1d8) pendant [1d4+1] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé via le catalogue INVOCATIONS (entrée 'creature_corrompue_druide') : pose un jeton 'Créature corrompue' (PV=niveau×2, Att=attaque Druide−2, DM 1d8) sur la carte. Durée [1d4+1] tours non trackée automatiquement — retirer le jeton manuellement à expiration (rappelé dans sa description)." } ] } },
          { rang: 4, nom: "Fléau rampant (L)", effet: "Aura 3 m pendant [3+Mod. de SAG] tours : 1d4 DM chaotiques à toute créature (alliée comprise) à portée",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: null, zone: 1, jetOppose: null,
              effets: [ { type: "etat", id: "maudite", duree: "3+Mod.SAG", formuleDot: "1d4" }, { type: "degats", formule: "1d4", elementaire: "chaos" },
                { type: "special", note: "Touche toute créature dans l'aura, alliés compris — pas de distinction ami/ennemi." } ] } },
          { rang: 5, nom: "Forme du chaos sauvage (L, 1x/scénario)", effet: "[3+Mod. de SAG] tours : +4 PV temp., attaque naturelle 2d8 DM, divise par 2 les DM physiques subis",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "forme_chaos_sauvage", duree: "3+Mod.SAG" },
                { type: "pvTemp", formule: "4", duree: "3+Mod.SAG" },
                { type: "special", note: "Pose l'état 'Forme du chaos sauvage' : divise par 2 (arrondi inf.) les dégâts PHYSIQUES subis pendant la durée, détecté automatiquement dans subirDegats côté app.js (même principe que Sanctuaire). +4 PV temporaires déjà codé (type 'pvTemp', mecanique.cible = 'soi' donc application 100% automatique, contrairement aux capacités de zone). Seule l'attaque naturelle passant à 2d8 DM reste non modélisée (hors du calcul de dégâts d'arme)." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : survivaliste (Nature), compagnon de la faune (Compagnons), soutien défensif (Protecteur), meneur tribal (Shaman). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Protecteur et Shaman se combinent pour un druide de soutien complet (défense + buffs) ; Nature et Compagnons forment le duo le plus classique du genre.",
    ],
  },

  enchanteur: {
    classe: "enchanteur",
    nom_affiche: "Enchanteur",
    de_de_vie: "1d4",
    armes: "Dague et bâton",
    armures: "Aucune (sauf en tissu) ; pas de bouclier",
    attaque: { contact: null, distance: null, magique: "Mod. de CHARISME" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. Profil maison : tromperie illusoire, transmutation d'objets, savoir historique et fascination scénique.",
    voies: [
      {
        nom: "Voie de l'enchantement",
        speciale: false,
        description: "Illusions et tromperie — manipuler la réalité perçue plutôt que la réalité elle-même.",
        rangs: [
          { rang: 1, nom: "Image décalée (sort, L)", effet: "Crée un double illusoire à 1 m de lui ou d'une autre cible alliée ; la prochaine attaque réussie contre lui rate automatiquement. Dure 3 tours ou jusqu'à la fin du combat, selon ce qui arrive en premier",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "image_decalee", duree: "3" },
                { type: "special", note: "L'annulation de la prochaine attaque réussie contre la cible protégée (soi-même ou un allié à 1 m) reste une appréciation manuelle (pas de mécanisme d'annulation de coup dans l'app) — seule la durée (3 tours, ou fin de combat immédiate si elle arrive avant, cf. Capacites.retirerEtatsFinCombat) est automatisée via l'état 'image_decalee'." } ] } },
          { rang: 2, nom: "Déguisement magique (sort, L)", effet: "Prend l'apparence exacte d'une créature humanoïde connue pendant [5+Mod. de CHA] heures ; SAG diff. [10+Mod. de CHA] pour percer l'illusion",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Change d'apparence pendant [5+Mod.CHA] heures (durée hors combat) ; un observateur doit réussir un test de SAG diff. [10+Mod.CHA] pour percer l'illusion — non modélisé par le schéma standard." } ] } },
          { rang: 3, nom: "Mirage (sort, L, zone 5 m, 20 m)", effet: "Crée une scène illusoire complexe ; les cibles qui interagissent font SAG diff. [10+Mod. de CHA]",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: 10, zone: 2, jetOppose: null,
              effets: [ { type: "special", note: "Scène illusoire complexe ; les cibles qui interagissent testent SAG diff. [10+Mod.CHA] — effet narratif/environnemental sans conséquence de combat chiffrable." } ] } },
          { rang: 4, nom: "Terreur (sort, L, 15 m)", effet: "Attaque magique : la cible voit sa pire crainte, fuit [1d4+Mod. de CHA] tours OU subit -4 DEF et attaque jusqu'à la fin du combat",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "effrayee", duree: "1d4+Mod.CHA" },
                { type: "special", note: "Alternative possible (au choix/appréciation) : -4 DEF et -4 attaque jusqu'à la fin du combat au lieu de la fuite." } ] } },
          { rang: 5, nom: "Grande illusion (sort, L, 1x/scénario, zone 20 m)", effet: "Illusion totale (bâtiment, armée, désastre) ; dure [niveau] heures sauf dissipation",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: null, zone: 10, jetOppose: null,
              effets: [ { type: "special", note: "Illusion totale (bâtiment, armée, désastre...) durant [niveau] heures sauf dissipation — effet narratif à grande échelle, non chiffrable par le schéma standard." } ] } },
        ],
      },
      {
        nom: "Voie de la transfiguration",
        speciale: false,
        description: "Transmutation d'objets — changer la nature des matériaux plutôt que leur forme.",
        rangs: [
          { rang: 1, nom: "Façonnage (rituel, contact)", effet: "Change la forme d'un objet non-magique ≤ petite taille (pierre → clé, bois → outil) ; la matière reste la même",
            mecanique: { type: "rituel", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Change la forme d'un objet non-magique de petite taille — effet d'artisanat magique, aucune conséquence de combat chiffrable." } ] } },
          { rang: 2, nom: "Transmutation mineure (rituel, contact, 1 tour)", effet: "Change la nature d'un matériau sur petite surface (bois → métal, verre → pierre) ; tient [niveau] heures",
            mecanique: { type: "rituel", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Change la nature d'un matériau sur petite surface, tient [niveau] heures — effet d'artisanat magique non chiffrable." } ] } },
          { rang: 3, nom: "Arme enchantée (sort, L, contact)", effet: "Une arme ou objet gagne +2 attaque et +1d6 DM magiques pendant [3+Mod. de CHA] tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "3+Mod.CHA" },
                { type: "etat", id: "arme_enchantee", duree: "3+Mod.CHA" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : +1d6 DM magiques désormais câblé via l'état 'arme_enchantee' (js/etats.js) et Personnage.bonusDegatsArmeEnchantee(), même schéma que bonusDegatsArmeChaos/Dechainement, câblé aux 3 mêmes sites app.js (dmgContact uniquement, même limite que ces deux précédents)." } ] } },
          { rang: 4, nom: "Transmutation majeure (rituel, contact, 5 min)", effet: "Change la nature d'une surface jusqu'à 2 m² ; permanent mais réversible par Dispersion magique",
            mecanique: { type: "rituel", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Change la nature d'une surface jusqu'à 2 m², permanent mais réversible par Dispersion magique — effet d'artisanat magique non chiffrable." } ] } },
          { rang: 5, nom: "Pierre en chair (sort, L, 10 m)", effet: "Pétrification partielle : -4 DEF et -2 m déplacement pendant [1d4+Mod. de CHA] tours. OU restaure une pétrification complète existante",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "DEF", valeur: -4, duree: "1d4+Mod.CHA", differe: true },
                { type: "special", note: "-2 m de déplacement en plus du malus de DEF (non chiffrable). Alternative : restaure une pétrification complète existante au lieu d'en infliger une nouvelle. Bugfix (validé avec Thomas, trouvé en auditant le même bug côté Barde) : differe:true ajouté — le malus DEF s'appliquait jusqu'ici même sur un jet raté." } ] } },
        ],
      },
      {
        nom: "Voie de l'historien",
        speciale: false,
        description: "Lore et divination mélangés — savoir ce qui fut et deviner ce qui vient.",
        rangs: [
          { rang: 1, nom: "Archives vivantes (passive)", effet: "+2 par rang à tous les tests d'INT visant à se souvenir d'une information historique, politique, géographique ou arcanique",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Connaissances (histoire)", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence() pour Connaissances (histoire) et Connaissances (arcanes) — politique/géographie repliées sur Connaissances (histoire), faute d'entrée dédiée." } ] } },
          { rang: 2, nom: "Lecture d'aura (sort, L, 5 m)", effet: "Révèle la nature magique d'un objet ou créature (école de magie, niveau approximatif, malédictions actives)",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "aucune", portee: 2, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Révèle la nature magique d'un objet/créature (école, niveau approximatif, malédictions actives) — information narrative, pas un effet chiffré." } ] } },
          { rang: 3, nom: "Pressentiment (passive)", effet: "Ne peut pas être surpris ; +2 Initiative ; une fois par combat, demande au MJ un indice sur les intentions d'une cible",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "initiative", valeur: 2, duree: "permanente" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : +2 Initiative ajouté (mentionné à l'origine, absent du texte de donnees.js jusqu'ici), câblé dans Personnage.bonusInitiativeCapacites() — même schéma/valeur que Chasseur 'Sens du danger' (Voie de la traque rang 4). 'Ne peut pas être surpris' et l'indice du MJ 1x/combat restent non modélisés (pas de mécanique de surprise dans l'app)." } ] } },
          { rang: 4, nom: "Vision du passé (sort, L, rituel 10 min)", effet: "En touchant un objet ou lieu, perçoit les événements marquants qui s'y sont déroulés (jusqu'à [niveau×10] ans)",
            mecanique: { type: "rituel", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Perçoit les événements marquants d'un objet/lieu (jusqu'à [niveau×10] ans) — information narrative, pas un effet chiffré." } ] } },
          { rang: 5, nom: "Prophétie (sort, L, 1x/scénario)", effet: "Pose une question sur un événement futur du scénario ; réponse véridique mais cryptique (une phrase, sans détail)",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Pose une question sur un événement futur ; réponse véridique mais cryptique du MJ — entièrement narratif." } ] } },
        ],
      },
      {
        nom: "Voie du spectacle",
        speciale: false,
        description: "Fascination, sommeil et domination mentale — subjuguer autant que commander.",
        rangs: [
          { rang: 1, nom: "Fascination (sort, L, 15 m)", effet: "Attaque magique vs DEF : Fascinée (immobile) tant que l'Enchanteur maintient (action L/tour). Brisée par toute attaque ou événement brutal",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "fascinee", duree: "1" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de null (difficulté réelle 10+Mod.SAG de la cible, non modélisable) à 'DEF' — même principe que Domination (rang 5, même voie). Contre 'DEF', le jet magique est désormais pleinement automatisé. Maintenue tant que l'Enchanteur consacre son action limitée chaque tour (re-testée manuellement chaque tour, non trackée) ; brisée par toute attaque/événement brutal." } ] } },
          { rang: 2, nom: "Voix envoûtante (passive)", effet: "+2 par rang à tous les tests de CHA visant à persuader, séduire ou distraire",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Persuasion", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence('Persuasion') — séduction/distraction repliées dessus, faute d'entrée dédiée." } ] } },
          { rang: 3, nom: "Sommeil (sort, L, 15 m)", effet: "Attaque magique contre une cible avec moins de [Mod. de CHA×5] PV actuels : endormie jusqu'à blessure ou réveil manuel",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 7, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "endormie", duree: "jusquAuReveil" },
                { type: "special", note: "Condition : la cible doit avoir moins de [Mod.CHA×5] PV actuels — seuil non vérifié automatiquement." } ] } },
          { rang: 4, nom: "Suggestion (sort, L, 10 m)", effet: "Attaque magique vs DEF : la cible exécute une action raisonnable dans l'heure, sans se souvenir d'avoir été influencée",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "charmee", duree: "1" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de null (difficulté réelle 10+Mod.SAG de la cible, non modélisable) à 'DEF' — même principe que Domination/Fascination (même voie). Contre 'DEF', le jet magique est désormais pleinement automatisé. La cible ne se souvient pas avoir été influencée (narratif)." } ] } },
          { rang: 5, nom: "Domination (sort, L, 1x/scénario)", effet: "Contrôle total d'une cible humanoïde pendant [Mod. de CHA] jours vs DEF ; nouveau test une fois par jour pour résister",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "charmee", duree: "Mod.CHA jours" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de SAG par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé. Durée en JOURS (hors du vocabulaire de durée standard en tours/finCombat/finScenario). La cible retente un test une fois par jour pour résister — non trackée automatiquement." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — illusions qui prennent vie. Ses illusions commencent à lui échapper et à se matérialiser contre sa volonté. La jauge monte à chaque sort réussi.",
        rangs: [
          { rang: 1, nom: "Illusion vivante (sort)", effet: "Ses illusions infligent 1d6 DM réels vs DEF de la cible. +1 CS par illusion réussie",
            mecanique: { type: "activable", corruption: 1, usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Corrige un bug de donnée : ce rang était marqué type 'passive', ce qui masque le bouton ⚔️ Lancer dans toute l'app (cf. htmlLancerCapacite/_capacitesLancablesPerso côté app.js) alors qu'il porte un jetOppose+degats à activer, comme ses équivalents de rang 1 dans les 6 autres classes. Passé à 'activable' + corruption:1 (même schéma que Barde/Prêtre/Nécromancien/Chevalier/Magicien rang 1) pour lui redonner un bouton fonctionnel et automatiser le +1 CS. Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de SAG par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé (touché/raté/critique)." } ] } },
          { rang: 2, nom: "Écho chaotique (passive)", effet: "Force n'importe quel sort d'illusion/enchantement en payant +1 CS : double la durée OU la zone d'effet",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Coût : +1 CS (jauge de Chaos). Double la durée OU la zone d'effet d'un sort d'illusion/enchantement — dépendance inter-capacités non modélisée automatiquement." } ] } },
          { rang: 3, nom: "Illusion de masse (L, zone 10 m)", effet: "Toutes créatures : jet magique vs DEF ou Fascinées 1 tour. +2 CS. Critique : jet table mutation Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "zone", portee: null, zone: 5,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "fascinee", duree: "1" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'SAG' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de SAG par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé une fois une cible choisie (sélecteur 'zone'+jetOppose, cf. app.js). Touche toutes les créatures de la zone, alliés compris — seuls les ennemis sont proposés dans le sélecteur, les alliés restent à appliquer manuellement. +2 CS. Mécanisé (validé avec Thomas) : critique (seuil d'arme) déclenche désormais un jet 1d6 automatique sur la table de mutation Palier 1." } ] } },
          { rang: 4, nom: "Réalité fracturée (passive, dès CA 5+)", effet: "Ses illusions indiscernables de la réalité pour les cibles non-magiques. Contrepartie : -2 SAG permanent (ne distingue plus toujours le vrai du faux)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "caracteristique", valeur: -2, duree: "permanente" },
                { type: "special", note: "Contrepartie -2 SAG permanent (dès Corruption d'Âme 5+) déjà codée dans Personnage.bonusCaracCapacites(). Ses illusions deviennent indiscernables de la réalité pour les cibles non-magiques — effet offensif non chiffrable." } ] } },
          { rang: 5, nom: "Cauchemar incarné (L, 1x/scénario)", effet: "Une illusion prend forme physique [Mod. de CHA] tours : peut attaquer, bloquer, interagir. +3 CS immédiat",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : l'illusion physique est désormais posée comme un jeton via le catalogue INVOCATIONS (entrée 'cauchemar_enchanteur', cf. Carte.ouvrirModalInvocation/confirmerInvocation), au même titre que les invocations de Nécromancien/Druide/Guerrier — PV = niveau×2 (par défaut, non chiffré par le texte source), attaque = attaque magique de l'Enchanteur, DM 1d6 (assumé). Ne dure que [Mod.CHA] tours — retirer le jeton manuellement à expiration, comme Créature corrompue (Druide). +3 CS (jauge de Chaos) immédiat, déjà tracké via mecanique.corruption." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : illusionniste (Enchantement), transmutateur (Transfiguration), érudit (Historien), fascinateur (Spectacle). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Enchantement et Spectacle se combinent pour un maître de la tromperie mentale ; Historien et Transfiguration forment le duo de l'érudit artisan.",
    ],
  },

  chasseur: {
    classe: "chasseur",
    nom_affiche: "Chasseur",
    de_de_vie: "1d8",
    armes: "Armes à feu légères (pistolet, mousquet), arc, dague de chasse",
    armures: "Armure de cuir (toutes variantes) ; pas de bouclier",
    attaque: { contact: null, distance: "Mod. de DEXTÉRITÉ", magique: null },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. Profil maison à la croisée de l'Arquebusier et du Rôdeur. Voie du chaos — version particulière : la jauge monte passivement à chaque touche réussie à distance ou via un piège.",
    voies: [
      {
        nom: "Voie de la traque",
        speciale: false,
        description: "Pistage, camouflage et embuscade — frapper avant d'être vu.",
        rangs: [
          { rang: 1, nom: "Pisteur (passive)", effet: "+2 par rang à tous les tests de survie, pistage et discrétion en extérieur",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Survie", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (pas une valeur fixe) déjà codé dans Personnage.bonusCompetence() pour Survie et Discrétion — pistage replié sur Survie, faute d'entrée dédiée." } ] } },
          { rang: 2, nom: "Camouflage naturel (passive)", effet: "+4 DEF tant qu'il reste immobile en milieu naturel",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 4, duree: "permanente" },
                { type: "special", note: "+4 DEF déjà codé dans Personnage.bonusDefImmobile() : actif tant que le déplacement du tour n'a pas été entamé (cf. Combat.estImmobile). La condition « milieu naturel » n'est pas trackée (pas de notion de terrain) — s'applique dès l'immobilité, à ajuster manuellement si la scène ne s'y prête pas." } ] } },
          { rang: 3, nom: "Premier coup (activable)", effet: "+1d6 DM contre une cible qui n'a pas encore agi ce combat",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: null },
                { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive' (bouton Lancer masqué partout dans l'app) alors que l'effet degats est réel — passé à 'activable'. Condition mécanisée (validé avec Thomas) : la cible ne doit pas avoir encore agi ce combat, vérifiée via le tracker d'initiative (Combat.aDejaAgiCeCombat) — bloque l'activation avec un message clair si la cible a déjà agi." } ] } },
          { rang: 4, nom: "Sens du danger (passive)", effet: "Ne peut pas être surpris ; +2 Initiative",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "initiative", valeur: 2, duree: "permanente" },
                { type: "special", note: "Corrige un gap de donnée : ce bonus permanent était déclaré ici mais jamais lu par aucune fonction (même famille de bug que Précision côté Barde). Ajouté et câblé dans Personnage.bonusInitiativeCapacites(). Ne peut pas être surprise (immunité, non trackée automatiquement)." } ] } },
          { rang: 5, nom: "Prédateur silencieux (L, 1x/combat)", effet: "+4 attaque sur la première attaque du combat, sans déclencher d'alerte",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 4, duree: "prochaineAttaque" } ] } },
        ],
      },
      {
        nom: "Voie de la gâchette",
        speciale: false,
        description: "Précision de tir, cadence et critiques — un tireur d'élite qui ne rate jamais sa cible.",
        rangs: [
          { rang: 1, nom: "Tir ajusté (passive)", effet: "+1 en attaque à distance",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 1, duree: "permanente" },
                { type: "special", note: "Corrige un gap de donnée : ce bonus permanent était déclaré ici mais jamais lu par aucune fonction (même famille de bug que Précision côté Barde). Ajouté et câblé dans Personnage.bonusAttaqueCapacites('distance')." } ] } },
          { rang: 2, nom: "Cadence affûtée (passive)", effet: "Recharger devient une action gratuite",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Recharger une arme à distance devient une action gratuite — règle d'économie d'action, pas un effet chiffrable." } ] } },
          { rang: 3, nom: "Tir mortel (L)", effet: "+2d6 DM si la cible est immobile ou n'a pas encore agi",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "2d6", elementaire: null },
                { type: "special", note: "Condition à deux branches (immobile OU n'a pas agi) : contrairement à Premier coup (Voie de la traque rang 3, une seule condition, bloquant), un OU ne peut pas bloquer sur une seule branche vérifiable — 'immobile' côté monstre n'est pas tracké par l'app. Informe seulement (via Combat.aDejaAgiCeCombat), sans bloquer l'activation." } ] } },
          { rang: 4, nom: "Œil de lynx (passive)", effet: "Ignore les pénalités de couvert partiel et de distance",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Ignore les pénalités de couvert partiel et de distance — modificateur de règle situationnel, pas un bonus chiffré fixe." } ] } },
          { rang: 5, nom: "Tir fatal (L, 1x/combat)", effet: "Critique sur 18-20 ; les critiques infligent triple dégâts au lieu de double",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Seuil de critique 18-20 et triplement des dégâts critiques à distance (au lieu du doublement standard) déjà codés — Personnage.aTirFatal()/critMinAttaque() + lancerFormule() côté app.js. Simplification : traité comme passif (toujours actif dès acquis), la limite 1x/combat n'est pas mécanisée (pas de compteur d'usage pour les attaques rapides, hors du système usagesCapacites)." } ] } },
        ],
      },
      {
        nom: "Voie du piège",
        speciale: false,
        description: "Pièges de chasse et contrôle de terrain — un trappeur qui prépare le terrain avant la traque.",
        rangs: [
          { rang: 1, nom: "Collet de fortune (action de mouvement)", effet: "Jet de DEX vs DEF, échec → Immobilisée 1 tour",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "DEX", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "etat", id: "immobilisee", duree: "1" },
                { type: "special", note: "Simplifié (validé avec Thomas) : DD fixe (12) remplacé par caracDefenseur 'DEF' — le champ difficulteFixe n'était en réalité jamais lu par le moteur. Désormais pleinement automatisé, même principe que Piège de fortune (Guerrier)." } ] } },
          { rang: 2, nom: "Fosse dissimulée (L)", effet: "2d6 DM, jet de DEX vs DEF pour l'éviter",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "DEX", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d6", elementaire: null },
                { type: "special", note: "Simplifié (validé avec Thomas) : DD fixe (14) remplacé par caracDefenseur 'DEF', même principe que Collet de fortune (rang 1, même voie) — désormais pleinement automatisé." } ] } },
          { rang: 3, nom: "Pièges multiples (passive)", effet: "Pose jusqu'à 2 pièges par préparation au lieu d'un seul",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Peut poser 2 pièges au lieu d'1 lors d'une préparation — règle de quantité, pas un effet chiffrable." } ] } },
          { rang: 4, nom: "Détection des pièges adverses (passive)", effet: "+4 à la détection de tout piège, naturel ou fabriqué",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Perception", valeur: 4, duree: "permanente" },
                { type: "special", note: "+4 déjà codé dans Personnage.bonusCompetence('Perception') — replié sur Perception faute de compétence 'détection de pièges' dédiée, s'applique donc à tout test de Perception (même simplification que les autres bonus de compétence élargis de l'app)." } ] } },
          { rang: 5, nom: "Piège du grand gibier (L, 1x/scénario)", effet: "Zone 5 m : 4d6 DM + immobilisation, contre une cible de grande taille",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: null, zone: 2, jetOppose: null,
              effets: [ { type: "degats", formule: "4d6", elementaire: null }, { type: "etat", id: "immobilisee", duree: "1" } ] } },
        ],
      },
      {
        nom: "Voie de la grande chasse",
        speciale: false,
        description: "Marquer et achever sa proie — l'identité propre du Chasseur, qui transforme chaque combat en traque personnelle.",
        rangs: [
          { rang: 1, nom: "Marque du chasseur (1x/scène)", effet: "Désigne une cible « Trophée » : +1 en attaque contre elle",
            mecanique: { type: "activable", usage: { frequence: "1x/scene" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "marquee_chasseur", duree: "finScenario" } ] } },
          { rang: 2, nom: "Connaître sa proie (passive)", effet: "Test pour révéler une faiblesse (résistance, vulnérabilité) de la cible marquée",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Test pour révéler une résistance/vulnérabilité de la cible marquée — information narrative, pas un effet chiffré." } ] } },
          { rang: 3, nom: "Traque acharnée (passive)", effet: "+2 m de déplacement et ignore le terrain difficile en poursuivant sa cible marquée",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "+2 m de déplacement et ignore le terrain difficile en poursuivant la cible marquée — effet de déplacement conditionnel, non modélisé par le schéma standard." } ] } },
          { rang: 4, nom: "Coup de grâce (activable)", effet: "+1d8 DM contre la cible marquée sous 50% PV",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d8", elementaire: null },
                { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive' (bouton Lancer masqué partout dans l'app) alors que l'effet degats est réel — passé à 'activable'. Condition 'sous 50% PV' mécanisée (validé avec Thomas), vérifiée pour PJ et monstre — bloque l'activation avec un message clair si au-dessus du seuil. Condition 'cible déjà Marquée' (marquee_chasseur) reste non vérifiable (pas de suivi d'état automatique pour les monstres, même limite que Frappe purificatrice/Confession forcée du Prêtre)." } ] } },
          { rang: 5, nom: "Trophée ultime (L, 1x/scénario)", effet: "Ignore la moitié de la RD de la cible marquée, +3d6 DM bonus",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "3d6", elementaire: null },
                { type: "special", note: "Mécanisé (validé avec Thomas) : le demi-RD (moitié de la réduction d'armure de la cible) est désormais appliqué automatiquement pour cette attaque — calcul dédié dans la branche 'degats' de resoudreEffet (identifié par voie+rang), qui écrit les PV nets directement plutôt que de passer par Carte.appliquerDegatsCombat/appliquerDegatsPersoLocal (réduction complète)." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — le chasseur devenu prédateur. Pas de déclencheur actif : la jauge monte à chaque touche réussie. À force de traquer, le Chasseur a fini par devenir lui-même la bête.",
        rangs: [
          { rang: 1, nom: "Premier sang du prédateur (passif)", effet: "Chaque touche réussie à distance ou via un piège : +1 CS (max 6/combat)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans _gererPremierSangChasseur() côté app.js (via Personnage.aPremierSangChasseur()), appelé après chaque attaque rapide à distance : +1 automatique à la jauge de Chaos sur une touche confirmée, plafonné à 6 pour cette source passive. La moitié 'via piège' reste hors schéma : l'app ne trace aucune pose/déclenchement de piège." } ] } },
          { rang: 2, nom: "Instinct sauvage (passive)", effet: "Force une capacité de Traque ou de la Gâchette en payant +1 CS : +1d6 DM bonus",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Coût : +1 point de jauge de Chaos (CS). Force une capacité de Traque ou de la Gâchette — dépendance inter-capacités non modélisée automatiquement." } ] } },
          { rang: 3, nom: "Hurlement du prédateur (L)", effet: "Cible fuit ou subit -2 DEF. +2 CS. Critique : jet sur la table de mutation Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "La cible fuit OU subit -2 DEF (appréciation MJ). +2 CS (jauge de Chaos). Critique : jet sur la table de mutation Palier 1 — reste non automatisé (contrairement aux 6 autres capacités du même schéma, cf. data/mutations.js/TABLE_MUTATIONS) : mecanique.jetOppose === null ici, donc aucun jet d'attaque n'est résolu par le moteur pour détecter un critique. Résolution narrative/MJ, non entièrement modélisable par le schéma standard." } ] } },
          { rang: 4, nom: "Sens du sang (passive, dès CA 5+)", effet: "Détecte automatiquement toute créature blessée dans un rayon de 100 m. Contrepartie : les animaux sauvages le fuient instinctivement",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: 50, jetOppose: null,
              effets: [ { type: "special", note: "Détecte automatiquement toute créature blessée dans un rayon de 100 m ; en contrepartie, les animaux sauvages le fuient instinctivement — détection passive non chiffrable." } ] } },
          { rang: 5, nom: "Chasse ultime (L, 1x/scénario)", effet: "+4 attaque à distance, ignore les couverts. +3 CS immédiat. Contrecoup : tire automatiquement sur la créature la plus proche dans sa ligne de mire, alliée ou non",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 4, duree: "finCombat" },
                { type: "special", note: "Ignore les couverts. +3 CS (jauge de Chaos) immédiat. Contrecoup mécanisé (validé avec Thomas) : la créature la plus proche (cibleCreaturePlusProche, même helper que Guerrier Rage incontrôlée) est désormais nommée dans le message à l'activation — la redirection de l'attaque reste, elle, une application manuelle (pas de moteur de ciblage forcé automatique dans l'app)." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : pisteur embusqué (Traque), tireur d'élite (Gâchette), trappeur (Piège), chasseur de trophées (Grande chasse). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Gâchette et Grande chasse se combinent pour un chasseur de trophées qui abat sa proie marquée à distance ; Traque et Piège forment le duo classique du trappeur.",
    ],
  },

  chevalier: {
    classe: "chevalier",
    nom_affiche: "Chevalier",
    de_de_vie: "1d10",
    armes: "Toutes les armes de contact (dédaigne les armes à distance)",
    armures: "Toutes, jusqu'à l'armure de plaques complète ; maniement du bouclier",
    attaque: { contact: "Mod. de FORCE", distance: null, magique: null },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. La Voie du chaos est une mécanique de corruption progressive (jauges, mutations, risque de bascule du personnage). À réserver à un joueur volontaire avec accord du MJ.",
    voies: [
      {
        nom: "Voie du noble",
        speciale: false,
        description: "Le rang et le prestige comme armes. Adaptation de la Voie de la noblesse officielle.",
        rangs: [
          { rang: 1, nom: null, effet: "Bonus de réputation : les tests sociaux face à la noblesse ou aux institutions sont facilités",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Facilite les tests sociaux face à la noblesse/institutions — bonus de test hors combat non chiffré précisément." } ] } },
          { rang: 2, nom: null, effet: "Ajoute son Mod. de CHA à sa DEF — son rang impose le respect, y compris au combat",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: "Mod.CHA", duree: "permanente" },
                { type: "special", note: "Déjà calculé dans Personnage (cf. calculerDEF) ; valeur dynamique (Mod.CHA), pas un nombre fixe." } ] } },
          { rang: 3, nom: null, effet: "Avantages tactiques en duel singulier (1 contre 1 formel) : jet de CHA vs DEF",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "CHA", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "attaque", valeur: 1, duree: "finCombat", differe: true }, { type: "bonus", cible: "DEF", valeur: 1, duree: "finCombat", differe: true },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'CHA' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de CHA par monstre, donc l'opposition CHA vs CHA d'origine ne pouvait jamais être automatisée. Auparavant exclu de cette simplification (les bonus s'appliquaient même sur un raté, incohérence entre le message 'Raté' et l'octroi du bonus) : désormais résolu via effet.differe (nouveau marqueur générique), qui gate ces deux bonus sur la confirmation de la touche, comme n'importe quel effet degats/etat vs DEF." } ] } },
          { rang: 4, nom: null, effet: "Résistance accrue aux tentatives de commandement ou d'intimidation venant d'un ennemi",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Résistance accrue (non chiffrée) aux tentatives de commandement/intimidation ennemies — bonus de test hors combat." } ] } },
          { rang: 5, nom: null, effet: "Capacité de prestige ultime liée à un titre ou une reconnaissance gagnée en jeu (à définir avec le MJ)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Contenu explicitement à définir avec le MJ selon la progression en jeu — le texte source ne fournit aucune formule à automatiser." } ] } },
        ],
      },
      {
        nom: "Voie du commandant",
        speciale: false,
        description: "Le meneur sur le champ de bataille. Adaptation de la Voie du meneur d'hommes officielle.",
        rangs: [
          { rang: 1, nom: null, effet: "Immunisé à la Peur ; étend un bonus de résistance à la Peur à ses alliés proches",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "zone", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Corrige un gap de donnée : l'immunité à l'état 'effrayee' pour le Chevalier lui-même n'était jamais câblée, contrairement à Liberté d'action (Barde, même mécanisme) déjà branché sur aImmuniteEtat(). Ajoutée dans Personnage.aImmuniteEtat(), lue aux deux points où un état est posé sur un PJ (Capacites.resoudreEffet et le panneau MJ appliquerMalus). Le bonus de résistance étendu aux alliés proches reste non chiffré/non modélisé." } ] } },
          { rang: 2, nom: null, effet: "Une fois par tour, peut encaisser un coup à la place d'un allié à son contact",
            mecanique: { type: "activable", usage: { frequence: "1x/tour" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Encaisse un coup à la place d'un allié à son contact (redirection défensive) — non modélisé par le schéma standard. Le compteur d'usage (0/1, période 'tour') est désormais remis à zéro automatiquement à chaque nouveau tour du Chevalier (validé avec Thomas) — corrige un gap générique qui touchait TOUTES les capacités '1x/tour' du jeu (cf. Combat._reinitialiserActionsEntree/Capacites.reinitialiserUsagesPeriode), pas seulement celle-ci." } ] } },
          { rang: 3, nom: null, effet: "Une fois par tour, un allié en vue peut relancer un test d'attaque raté",
            mecanique: { type: "activable", usage: { frequence: "1x/tour" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Échangé avec l'ancien rang 4 (validé avec Thomas). Permet à un allié en vue de relancer un test d'attaque raté — mécanique de relance, pas un effet degats/soin/etat/bonus classique." } ] } },
          { rang: 4, nom: "Élan tactique (activable, 1x/combat)", effet: "Donne une action principale bonus à un allié",
            mecanique: { type: "activable", usage: { frequence: "1x/combat" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              actionBonus: true,
              effets: [ { type: "special", note: "Remplace (validé avec Thomas) l'ancien rang 4 ('capacité tactique intermédiaire à préciser', échangé avec le rang 3). Mécanisé via mecanique.actionBonus (champ générique déjà utilisé par Barde 'Enchaînement'), étendu pour cibler l'allié choisi plutôt que le lanceur (cf. app.js, resoudreCapaciteEtRafraichir) : l'allié regagne immédiatement une action principale ce tour." } ] } },
          { rang: 5, nom: "Charge collective (L, 1x/combat)", effet: "Marque un ennemi : tout allié qui le frappe ensuite gagne +2 attaque et +3 DM. Accorde aussi +5 cases de déplacement à tous les PJ ce tour",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "marquee_chevalier", duree: "finCombat" },
                { type: "special", note: "Redéfini (validé avec Thomas), remplace le texte d'origine (déplacement collectif 20 m + bonus d'attaque, non modélisable). Deux volets : (1) marque la cible choisie (état 'marquee_chevalier', même famille que marquee_pretre/marquee_chasseur — +2 attaque et +3 DM pour tout allié qui la frappe ensuite, à appliquer manuellement comme les autres marques, aucun suivi d'état automatique pour les monstres) ; (2) accorde automatiquement +5 cases de déplacement à TOUS les PJ en combat (pas seulement 'en vue' — simplification assumée), via l'état 'elan_commandant' posé par un cas particulier dans Capacites.lancer() et lu par Combat._deplacementMax. Aucun jet requis pour poser la marque (contrairement à Œil de l'inquisiteur du Prêtre)." } ] } },
        ],
      },
      {
        nom: "Voie du protecteur",
        speciale: false,
        description: "Le rempart inébranlable. Adaptation de la Voie du bouclier du Guerrier, renommée.",
        rangs: [
          { rang: 1, nom: null, effet: "Partage le bonus de DEF de son bouclier avec un allié à son contact",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : calcul live (pas de bouton), câblé via Capacites.bonusDefAuraBouclierChevalier() — même schéma que L'exemple du Guerrier (Voie du peuple rang 2). Lit la valeur RÉELLE du bouclier équipé par le Chevalier (Personnage._itemsEquipesUniques(), champ bonusDEF), appliquée à tout allié à 1 case (contact). Appelé à la fois par obtenirDefCible() et par _defPjAvecAura() côté app.js, pour ne jamais désynchroniser la DEF affichée de la DEF réellement opposée à une attaque." } ] } },
          { rang: 2, nom: null, effet: "Peut absorber un coup destiné à un allié (L)",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Absorbe un coup destiné à un allié (redirection défensive totale) — non modélisé par le schéma standard." } ] } },
          { rang: 3, nom: null, effet: "Peut absorber un sort destiné à un allié (L)",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Absorbe un sort destiné à un allié — redirection défensive magique, non modélisée par le schéma standard." } ] } },
          { rang: 4, nom: null, effet: "Accès à l'armure de plaques complète, protection accrue contre les critiques",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Débloque l'accès à l'armure de plaques complète (règle d'équipement). Protection accrue contre les critiques — non chiffrée." } ] } },
          { rang: 5, nom: null, effet: "Peut renvoyer un sort absorbé contre son lanceur (L)",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Renvoie un sort précédemment absorbé (cf. rang 3) contre son lanceur d'origine — dépendance à un état précédent non modélisée par le schéma standard." } ] } },
        ],
      },
      {
        nom: "Voie du paladin (justicier)",
        speciale: false,
        description: "Pas un tank-soigneur comme le combo officiel Chevalier/Prêtre — un juge. Il détecte le mensonge, prononce des jugements, et punit la corruption avérée.",
        rangs: [
          { rang: 1, nom: "Regard du juste (activable, 1x/scène)", effet: "Test de CHA opposé (ou difficulté fixe) : révèle si l'interlocuteur ment consciemment — simple « il ment » / « il dit vrai », sans détail",
            mecanique: { type: "activable", usage: { frequence: "1x/scene" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "CHA", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "special", note: "Simplifié (validé avec Thomas, trouvé lors de la vérification finale) : caracDefenseur passé de 'CHA' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de CHA par monstre/PNJ, donc l'opposition CHA vs CHA d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet (1d20+Mod.CHA) est désormais pleinement automatisé, même simplification que Chant corrupteur (Barde)/Mélopée de la Folie et consorts. Révèle si l'interlocuteur ment consciemment (binaire, sans détail) — information narrative, pas un effet chiffré au-delà du jet lui-même." } ] } },
          { rang: 2, nom: "Châtiment du juste (activable)", effet: "Contre une cible reconnue coupable, la prochaine attaque réussie inflige +1d6 DM sacrés",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "sacre" },
                { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive' (bouton Lancer masqué partout dans l'app) alors que l'effet degats est réel — passé à 'activable'. Condition : la cible doit être reconnue coupable (cf. Regard du juste/Jugement) — non vérifiée automatiquement." } ] } },
          { rang: 3, nom: "Jugement (L, 1x/combat)", effet: "Jugement formel contre une cible. Coupable (appréciation MJ) : -4 attaque et DEF pour le reste du combat. Innocente : échec silencieux, aucun effet",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: -4, duree: "finCombat" }, { type: "bonus", cible: "DEF", valeur: -4, duree: "finCombat" },
                { type: "special", note: "Effet conditionné à une appréciation du MJ (cible coupable ou innocente) — si innocente, échec silencieux sans effet. Condition narrative non modélisée automatiquement." } ] } },
          { rang: 4, nom: "Verdict inébranlable (passive)", effet: "Avantage automatique aux tests de résistance contre la tromperie, l'illusion et la manipulation mentale",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Personnage.aAvantageResistanceMentale(), lu par le bouton 'Test de SAG' (modeForce avantage, même mécanisme qu'Acteur) — approximé sur le test de SAG brut, l'app n'ayant pas de sous-catégorie 'tromperie/illusion/manipulation' séparée." } ] } },
          { rang: 5, nom: "Sentence finale (L, 1x/scénario)", effet: "Contre une cible jugée coupable (Rang 3 confirmé) : l'attaque réussie suivante inflige +6d6 DM sacrés, doublés contre démons/morts-vivants/corrompus",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "6d6", elementaire: "sacre" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : le doublement contre démon/mort-vivant/corrompu est désormais automatique (champ 'race' du bestiaire, cf. _cibleEstMortVivantDemonCorrompu dans capacites.js). Condition restante non vérifiée automatiquement : la cible doit avoir été jugée coupable au rang 3." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — un chevalier en quête de puissance a passé un pacte avec une entité chaotique.",
        rangs: [
          { rang: 1, nom: "Lame liée (action gratuite, 1x/tour)", effet: "La prochaine attaque réussie ce tour inflige +1d6 DM chaotiques instables. +1 CP",
            mecanique: { type: "activable", corruption: 1, usage: { frequence: "1x/tour" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "+1 point de jauge de Corruption du Pacte (CP) — mécanique de jauge non trackée par le schéma standard." } ] } },
          { rang: 2, nom: "Faveur sombre (passive)", effet: "Force n'importe quelle capacité martiale : +2 attaque OU +2 DEF jusqu'au prochain tour. +1 CP",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "prochainTour" },
                { type: "special", note: "Alternative possible : +2 DEF au lieu de +2 attaque. Force n'importe quelle capacité martiale. +1 CP (jauge de Corruption du Pacte)." } ] } },
          { rang: 3, nom: "Frappe du pacte (L)", effet: "Attaque au contact : +2d6 DM chaotiques en cas de réussite. +2 CP. Critique (19-20) : jet sur la table de mutation Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d6", elementaire: "chaos" },
                { type: "special", note: "+2 CP (jauge de Corruption du Pacte). Mécanisé (validé avec Thomas) : jet naturel 19-20 (seuil fixe propre à cette capacité, indépendant du seuil de critique de l'arme) déclenche désormais un jet 1d6 automatique sur la table de mutation Palier 1 (cf. data/mutations.js, MUTATION_PALIER1_TRIGGERS/_rollMutationPalier1 dans Capacites.lancer)." } ] } },
          { rang: 4, nom: "Marque du serment brisé (passive, dès CA 5+)", effet: "Au choix, fixe : +2 DEF permanent, ou +1d8 DM chaotique sur l'arme de prédilection. Contrepartie : rejeté par les ordres de chevalerie",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Choix fixé à l'acquisition (non rejouable) déjà codé, dès CA 5+ : +2 DEF permanent (Personnage.bonusDefCapacites) ou +1d8 DM chaotique sur l'arme de contact (bonusDegatsArmeChaos, dmgContact côté app.js). Contrepartie (rejeté par les ordres de chevalerie) non trackée." } ] } },
          { rang: 5, nom: "Avatar du pacte (L, 1x/scénario)", effet: "[3+Mod. de CON] tours : armure semi-spectrale, +4 DEF, +2d6 DM à toutes les attaques, immunisé à la Peur. +3 CP immédiat. Contrecoup : perd son action de mouvement au tour suivant",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 4, duree: "3+Mod.CON" },
                { type: "etat", id: "avatar_du_pacte", duree: "3+Mod.CON" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : +2d6 DM à toutes les attaques désormais câblé via l'état 'avatar_du_pacte' et Personnage.bonusDegatsAvatarPacte() (même schéma que bonusDegatsDechainement du Guerrier), câblé aux 3 mêmes sites app.js (dmgContact). Immunité à la Peur également câblée dans Personnage.aImmuniteEtat() tant que cet état est actif. +3 CP immédiat, déjà tracké via mecanique.corruption. Contrecoup (perd son action de mouvement au tour suivant) reste non modélisé — pas de mécanisme pour bloquer spécifiquement le déplacement au prochain tour." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : aristocrate (Noble), meneur de troupes (Commandant), rempart (Protecteur), justicier (Paladin). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Protecteur et Commandant se combinent naturellement (un rempart qui rallie aussi ses troupes) ; Paladin et Noble forment un duo crédible pour un chevalier-juge issu d'une grande maison.",
    ],
  },

  moine: {
    classe: "moine",
    nom_affiche: "Moine",
    de_de_vie: "1d8",
    armes: "Toutes sauf les armes à poudre — le moine est le plus efficace à mains nues",
    armures: "Aucune armure, pas de bouclier",
    attaque: { contact: null, distance: null, magique: "Mod. de SAGESSE" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. La Voie du chaos est une mécanique de corruption progressive (jauges de Corruption Mentale et d'Âme, mutations). À réserver à un joueur volontaire avec accord du MJ.",
    voies: [
      {
        nom: "Voie des poings",
        speciale: false,
        description: "Le corps comme arme. Pas de subtilité, juste une puissance qui grandit à chaque rang.",
        rangs: [
          { rang: 1, nom: null, effet: "Les attaques à mains nues infligent des dégâts létaux : 1d6 + Mod. de FOR",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6+Mod.FOR", elementaire: null } ] } },
          { rang: 2, nom: null, effet: "Le dé de dégâts passe à 1d8",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d8+Mod.FOR", elementaire: null } ] } },
          { rang: 3, nom: null, effet: "Le dé passe à 1d10, +2 DEF",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d10+Mod.FOR", elementaire: null },
                { type: "bonus", cible: "DEF", valeur: 2, duree: "permanente" } ] } },
          { rang: 4, nom: null, effet: "Le dé passe à 1d12",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d12+Mod.FOR", elementaire: null } ] } },
          { rang: 5, nom: null, effet: "Le dé passe à 2d6 ; option d'attaquer avec un d12 au lieu du d20 pour +2d6 DM bonus en cas de réussite",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d6+Mod.FOR", elementaire: null },
                { type: "special", note: "Option : remplacer le d20 du jet d'attaque par un d12 pour +2d6 DM bonus en cas de réussite — bascule de dé d'attaque non modélisée par le schéma standard." } ] } },
        ],
      },
      {
        nom: "Voie de l'élévation",
        speciale: false,
        description: "Maîtrise spirituelle et technique du corps et du bâton — la précision avant la force. (Adaptation de la Voie de la maîtrise officielle.)",
        rangs: [
          { rang: 1, nom: null, effet: "Bonus de précision : critiques sur 19-20 au lieu de 20 sur les attaques au contact à mains nues ou au bâton",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Seuil 19-20 (même valeur que Précision létale, fixée par Thomas — le texte d'origine ne chiffrait pas le seuil) déjà codé dans Personnage.critMinAttaque(), limité aux attaques au contact à mains nues ou avec une arme d'id catalogue \"baton*\"." } ] } },
          { rang: 2, nom: null, effet: "Ajoute son Mod. d'INT ou de SAG (au choix à l'acquisition) à l'Initiative et à la DEF",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "initiative", valeur: "Mod.SAG", duree: "permanente" },
                { type: "bonus", cible: "DEF", valeur: "Mod.SAG", duree: "permanente" },
                { type: "special", note: "Choix fixé à l'acquisition entre Mod.INT et Mod.SAG (Mod.SAG utilisé par défaut ici, plus cohérent avec attaque.magique du Moine) — valeur dynamique, pas un nombre fixe." } ] } },
          { rang: 3, nom: "Précision instinctive (activable)", effet: "Test de Perception vs DEF de la cible observée : réussite → +2 à sa prochaine attaque contre elle",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "Perception", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "1", differe: true },
                { type: "special", note: "Mécanisé (validé avec Thomas), remplace le texte d'origine (estimation narrative de l'état de santé adverse). Nouveau caracAttaquant 'Perception' (Personnage.modCompetence('Perception','SAG')) dans le moteur jetOppose. Le bonus +2 attaque utilise effet.differe (nouveau marqueur générique) pour n'être appliqué QUE si le test touche — contrairement au comportement standard des effets 'bonus' (toujours appliqués même sur un raté)." } ] } },
          { rang: 4, nom: "Avalanche de coups (L, 1x/combat)", effet: "Série de jets d'attaque au contact vs DEF de la même cible, s'arrête au premier raté ; inflige autant de dés de dégâts (taille du dé de Voie des poings) que d'attaques touchées",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas), remplace le texte d'origine (dégâts explosifs sur jet maximal). Résolution dédiée dans Capacites.lancer() (identifiée par voie+rang), hors du schéma jetOppose standard (celui-ci ne gère qu'un seul jet d'attaque) : boucle de jets d'attaque au contact vs DEF, 1 naturel = arrêt automatique, puis un seul effet 'degats' de N dés (N = nombre de touches, taille de dé = celle du rang de Voie des poings le plus haut acquis, d4 par défaut si non investie — assomption) est résolu normalement. Garde-fou à 20 jets max." } ] } },
          { rang: 5, nom: null, effet: "Capacité ultime de maîtrise totale (à façonner avec le MJ selon le style de combat final souhaité — bâton ou mains nues)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Contenu à façonner avec le MJ selon le style de combat final souhaité — le texte source lui-même renvoie à une décision de table, pas de formule à inventer." } ] } },
        ],
      },
      {
        nom: "Voie de l'ascétisme",
        speciale: false,
        description: "Un moine qui a fait vœu de discipline et de foi. Sa force vient de ce qu'il a renoncé à posséder — et il frappe particulièrement fort tout ce qui est corrompu.",
        rangs: [
          { rang: 1, nom: "Discipline du corps (passive)", effet: "Renonce à un confort (silence, jeûne, dénuement matériel — trait de personnage). En échange : +2 à tous les tests de Volonté (SAG) contre la Peur et l'Intimidation",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Corrige un gap de donnée : ce bonus n'était lu par aucune fonction, contrairement à Vœu inébranlable (rang 4, même voie) déjà câblé via aAvantageResistanceMentale(). Ajouté et câblé dans Personnage.bonusTestCaracCapacites('SAG'), lu par les boutons de test de caractéristique — approximé en bonus additif sur TOUT test de SAG brut (même simplification de sous-catégorie déjà assumée pour Endurance de fer/Acteur/Résistance mentale, l'app n'ayant pas de bouton 'Test de Volonté vs Peur' séparé). Renoncement roleplay (trait de personnage) non vérifié au-delà de l'acquisition du rang." } ] } },
          { rang: 2, nom: "Poing béni (activable, 1x/combat)", effet: "La prochaine attaque inflige +1d6 DM sacrés, qui passent à +2d6 contre les morts-vivants, démons ou créatures corrompues",
            mecanique: { type: "activable", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "sacre" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : passe automatiquement à 2d6 si la cible est morte-vivante, démoniaque ou corrompue (champ 'race' du bestiaire, cf. _cibleEstMortVivantDemonCorrompu dans capacites.js)." } ] } },
          { rang: 3, nom: "Jeûne purificateur (L, 1x/jour)", effet: "Par le toucher, enlève un malus présent (état néfaste actif) sur lui-même ou un allié au contact",
            mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "allie", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "retraitEtat" },
                { type: "special", note: "Mécanisé (validé avec Thomas) : nouveau type d'effet générique 'retraitEtat' (Capacites.resoudreEffet) — retire le plus ancien état actif de catégorie non-buff sur la cible (poison/maladie/peur/charme repliés sur 'un état néfaste', l'app n'ayant pas de sous-catégorie dédiée). Retire un seul état par activation, pas tous." } ] } },
          { rang: 4, nom: "Vœu inébranlable (passive)", effet: "Avantage automatique aux tests de résistance contre la corruption, la possession ou la manipulation mentale",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Personnage.aAvantageResistanceMentale(), lu par le bouton 'Test de SAG' (modeForce avantage, même mécanisme qu'Acteur) — approximé sur le test de SAG brut, l'app n'ayant pas de sous-catégorie 'corruption/possession/manipulation' séparée." } ] } },
          { rang: 5, nom: "Illumination du juste (L, 1x/scénario)", effet: "Éclat sacré en zone de 3 m : 3d6 DM (6d6 contre morts-vivants / démons / corrompus), et soigne 1d6 + Mod. de SAG à lui-même et ses alliés dans la zone",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: null, zone: 1, jetOppose: null,
              effets: [ { type: "degats", formule: "3d6", elementaire: "sacre" }, { type: "soin", formule: "1d6+Mod.SAG" },
                { type: "special", note: "Dégâts doublés (6d6) contre morts-vivants/démons/corrompus toujours non automatisé, à la différence de Poing béni/Sentence finale (même condition, cf. _cibleEstMortVivantDemonCorrompu) : cible = 'zone' SANS jetOppose, donc jamais de cibleId résolu par le sélecteur de cible (app.js) — pas de cible ferme à interroger. Le soin touche le Moine et ses alliés dans la zone, les dégâts les ennemis." } ] } },
        ],
      },
      {
        nom: "Voie des éléments",
        speciale: false,
        description: "Le moine canalise feu, glace, terre et air à travers ses techniques de combat — boost physique, pas de magie incantée.",
        rangs: [
          { rang: 1, nom: "Poing élémentaire (action gratuite, 1x/tour)", effet: "Choisit un élément actif jusqu'au tour suivant. En plus des dégâts habituels de la prochaine attaque à mains nues touchée : Feu (+1d4 DM) · Glace (Gelée) · Terre (Renversée) · Air (-2 attaque)",
            mecanique: { type: "activable", usage: { frequence: "1x/tour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "element_actif", duree: "1",
                  choix: { titre: "Poing élémentaire", consigne: "Choisis l'élément actif :",
                    options: [ { valeur: "feu", label: "Feu (+1d4 DM)" }, { valeur: "glace", label: "Glace (Gelée sur touche)" },
                      { valeur: "terre", label: "Terre (Renversée sur touche)" }, { valeur: "air", label: "Air (-2 attaque sur touche)" } ] } },
                { type: "special", note: "Mécanisé (validé avec Thomas), remplace le texte d'origine (Glace +2 DEF au porteur, Terre poussée, Air désta­bilisation) par la version détaillée par Thomas : les 4 options infligent désormais toutes un effet secondaire À LA CIBLE sur une attaque à mains nues réussie, en plus des dégâts normaux (au lieu d'être des bonus défensifs au porteur pour Glace/Terre/Air). Choix résolu par un cas particulier dans Capacites.lancer() (pas resoudreEffet générique, car le choix détermine un ÉTAT DIFFÉRENT à poser, pas juste une valeur) : pose l'état 'element_actif' avec le choix mémorisé dans extra.element, lu à la prochaine résolution de dégâts de Voie des poings (branche 'degats' de resoudreEffet) — Feu ajoute le dé à la formule (upgradé 1d4→1d6 par Maîtrise élémentaire, rang 2), Glace/Terre/Air posent Gelée/Renversée/-2 attaque sur la cible touchée." } ] } },
          { rang: 2, nom: "Maîtrise élémentaire", effet: "Feu +1d6 DM (au lieu de +1d4)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : l'option Feu de Poing élémentaire (rang 1) passe de 1d4 à 1d6 dès ce rang 2 acquis, même principe qu'Intensité élémentaire (Magicien). Le texte d'origine ('Glace +3 DEF, Terre poussée, Air Étourdissement') portait sur les anciennes versions défensives de Glace/Terre/Air, remplacées au rang 1 (Gelée/Renversée/-2 attaque sur la cible) — aucune amélioration de rang 2 spécifiée par Thomas pour ces trois options, laissées telles quelles pour l'instant." } ] } },
          { rang: 3, nom: "Second souffle élémentaire (L)", effet: "Change d'élément actif en cours de combat sans attendre son tour",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Change d'élément actif (Poing élémentaire) en cours de combat sans attendre son tour — règle de timing, pas un effet à proprement lancer." } ] } },
          { rang: 4, nom: "Fusion élémentaire (L, 1x/combat)", effet: "Attaque au contact vs DEF combinant 2 éléments au choix : Feu+Glace (Choc thermique, 1d6 DM + -2 DEF zone adjacente) · Feu+Terre (Éruption, 1d6 DM + Étourdie) · Feu+Air (Tempête de braises, 1d6 DM + -2 attaque) · Glace+Terre (Permafrost, Gelée -4 DEF + Étourdie) · Glace+Air (Blizzard, Gelée -4 DEF + -2 attaque) · Terre+Air (Tempête de sable, Étourdie + -2 attaque)",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueContact", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6", elementaire: null,
                  choix: { titre: "Fusion élémentaire", consigne: "Choisis la paire d'éléments :",
                    options: [ { valeur: "feu_glace", label: "Feu + Glace — Choc thermique (Vapeur)" },
                      { valeur: "feu_terre", label: "Feu + Terre — Éruption (Magma)" },
                      { valeur: "feu_air", label: "Feu + Air — Tempête de braises" },
                      { valeur: "glace_terre", label: "Glace + Terre — Permafrost" },
                      { valeur: "glace_air", label: "Glace + Air — Blizzard" },
                      { valeur: "terre_air", label: "Terre + Air — Tempête de sable" } ] } },
                { type: "special", note: "Mécanisé (validé avec Thomas), remplace le texte d'origine ('effets par paire à détailler') par la table fournie par Thomas. L'effet 'degats' ci-dessus n'est qu'un gabarit structurel pour le validateur/le sélecteur de choix : le combo réellement résolu (table FUSIONS_ELEMENTAIRES_MOINE, Capacites.lancer) remplace entièrement mecanique.effets selon la paire choisie à l'activation — 3 combos n'infligent d'ailleurs aucun dégât (contrôle pur, cf. la table). Choc thermique : le -2 DEF aux créatures adjacentes à la cible reste manuel (géométrie non automatisée)." } ] } },
          { rang: 5, nom: "Avatar des éléments (L, 1x/scénario)", effet: "Les quatre éléments actifs simultanément : +2d6 feu, +4 DEF, immunité poussée/renversement, chance d'esquive surnaturelle",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "2d6", elementaire: "feu" }, { type: "bonus", cible: "DEF", valeur: 4, duree: "finCombat" },
                { type: "special", note: "Immunité à la poussée/au renversement, chance d'esquive surnaturelle — effets défensifs additionnels non chiffrables par le schéma standard." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — un moine qui a cherché à comprendre le chaos plutôt qu'à le combattre, et qui finit par y tomber. Tentation et hallucination, pas de sorts.",
        rangs: [
          { rang: 1, nom: "Méditation interdite (L)", effet: "+1d6 DM ou +2 attaque. Volonté (SAG) diff. 10 : échec → redirige l'attaque vers la créature la plus proche, allié compris",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              testVolonte: { carac: "SAG", difficulteFixe: 10 },
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Alternative possible : +2 attaque au lieu du bonus de dégâts (choix manuel). Test de Volonté (SAG vs 10) désormais automatisé via mecanique.testVolonte (même moteur que Guerrier Rage incontrôlée) : échec → redirection vers la créature la plus proche affichée dans le message, application manuelle." } ] } },
          { rang: 2, nom: "Voix du Vide (passive)", effet: "Force n'importe quelle capacité martiale (+2 attaque ou DEF). 1 chance sur 6 que les murmures échappent à voix haute",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "1" },
                { type: "special", note: "Alternative possible : +2 DEF au lieu de +2 attaque. Force n'importe quelle capacité martiale. 1 chance sur 6 que les murmures échappent à voix haute — effet narratif non chiffrable." } ] } },
          { rang: 3, nom: "Vision fracturée (L)", effet: "+2d6 DM chaotiques. Volonté diff. 12 : échec → redirection de l'attaque",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              testVolonte: { carac: "SAG", difficulteFixe: 12 },
              effets: [ { type: "degats", formule: "2d6", elementaire: "chaos" },
                { type: "special", note: "Test de Volonté (SAG vs 12) désormais automatisé via mecanique.testVolonte (même moteur que Méditation interdite/Guerrier) : échec → redirection vers la créature la plus proche affichée dans le message, application manuelle." } ] } },
          { rang: 4, nom: "Esprit fendu (passive, dès Corruption d'Âme 5+)", effet: "Avantage contre Peur/Charme. Contrepartie : hallucinations hors combat, méfiance des ordres monastiques",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Avantage déjà codé dans Personnage.aAvantageResistanceMentale() (verrou dès CA 5+), lu par le bouton 'Test de SAG' (modeForce avantage) — approximé sur le test de SAG brut. Contrepartie (hallucinations hors combat, méfiance des ordres monastiques) non modélisée, narrative." } ] } },
          { rang: 5, nom: "Illumination noire (L, 1x/scénario)", effet: "+4 Initiative, +2 attaque, esquive auto 1x/tour. Après coup : désavantage généralisé pendant 1d4 tours",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "initiative", valeur: 4, duree: "finCombat" }, { type: "bonus", cible: "attaque", valeur: 2, duree: "finCombat" },
                { type: "special", note: "Esquive automatique 1x/tour pendant la durée (non chiffrable). Après coup : désavantage généralisé pendant 1d4 tours — contrecoup non modélisé par le schéma standard." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : combat pur (Poings), technicien (Élévation), gardien spirituel (Ascétisme), tacticien (Éléments). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Rien n'empêche de piocher dans plusieurs voies en parallèle : un Moine Poings/Éléments ou Élévation/Ascétisme sont tout à fait viables.",
    ],
  },

  magicien: {
    classe: "magicien",
    nom_affiche: "Magicien",
    de_de_vie: "1d4",
    armes: "Dague, bâton ferré",
    armures: "Aucune armure (vêtements en tissu uniquement)",
    attaque: { contact: null, distance: null, magique: "Mod. d'INTELLIGENCE" },
    notes_generales:
      "(L) = capacité limitée : une seule capacité (L) utilisable par tour de combat. La Voie du chaos est une mécanique de corruption progressive (jauges, mutations, risque de bascule du personnage). À réserver à un joueur volontaire avec accord du MJ.",
    voies: [
      {
        nom: "Voie de la magie universitaire",
        speciale: false,
        description: "Le savoir comme arme. Adaptation de la Voie de la magie universelle officielle.",
        rangs: [
          { rang: 1, nom: null, effet: "Bonus de +2 à tous les tests d'INT liés à la connaissance et à l'érudition",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "Connaissances (arcanes)", valeur: 2, duree: "permanente" },
                { type: "special", note: "+2 par rang atteint (remplacé, pas cumulé) déjà codé dans Personnage.bonusCompetence() pour les 3 compétences Connaissances (arcanes/histoire/nature) — érudition repliée dessus, pas Investigation ni Artisanat." } ] } },
          { rang: 2, nom: null, effet: "Le bonus passe à +4 ; produit une source de lumière magique à volonté",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "+4 (remplace le +2 du rang 1) déjà codé, cf. rang 1. Produit une source de lumière magique à volonté — effet utilitaire non chiffrable." } ] } },
          { rang: 3, nom: null, effet: "Le bonus passe à +6 ; identification rapide d'objets ou de phénomènes magiques observés",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "+6 (remplace le +4 du rang 2) déjà codé, cf. rang 1. Identification rapide d'objets/phénomènes magiques observés — effet utilitaire non chiffrable." } ] } },
          { rang: 4, nom: null, effet: "Le bonus passe à +8 ; capacité d'invisibilité temporaire ([3+Mod. d'INT] tours), une fois par jour",
            mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "invisible", duree: "3+Mod.INT" },
                { type: "special", note: "+8 (remplace le +6 du rang 3, passif, hors de la limite 1x/jour) déjà codé, cf. rang 1. Durée assumée à [3+Mod.INT] tours (non précisée par le texte source, à ajuster avec Thomas si besoin) : l'état 'invisible' existe déjà dans le catalogue (js/etats.js) mais n'était raccroché à aucune capacité — corrigé ici." } ] } },
          { rang: 5, nom: null, effet: "INT héroïque : une fois par jour, relance un test d'INT raté et garde le meilleur résultat",
            mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Personnage.aIntHeroique() : case à cocher 'INT héroïque' sur la fiche complète (1x/jour, clé 'classe:magicien:univ5'), force l'avantage (2d20 garde le plus haut) sur le prochain Test d'INT — 'relance si raté, garde le meilleur' est mathématiquement équivalent à l'avantage." } ] } },
        ],
      },
      {
        nom: "Voie de la magie sauvage",
        speciale: false,
        description: "Le magicien n'a jamais pleinement dompté ses sorts. Chaque incantation offensive est traversée par une instabilité arcanique, source de puissance imprévisible.",
        rangs: [
          { rang: 1, nom: "Mutation Sauvage (auto.)", effet: "À chaque sort offensif, lancez 2d4 et retranchez 4 (de -2 à +4) : modificateur appliqué aux dégâts du sort",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Mécanisé (validé avec Thomas) : Capacites.resoudreEffet ajoute désormais automatiquement un jet 2d4-4 (via _rollMutationSauvage) à la formule de TOUT effet 'degats' d'un sort offensif du Magicien dès ce rang 1 acquis — pas seulement les capacités de cette voie. Affiché entre crochets à la suite du message de dégâts habituel." } ] } },
          { rang: 2, nom: "Instinct Chaotique", effet: "1x/combat, avant de lancer un sort : garantit d'obtenir le meilleur de 2 jets de Mutation Sauvage au lieu d'un seul",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Simplifié (validé avec Thomas) par rapport au texte d'origine ('relancez le 2d4 et gardez le nouveau résultat') : un vrai reroll RÉACTIF après avoir vu un mauvais jet impliquerait de rejouer une résolution de dégâts déjà appliquée à la cible — hors de portée du pipeline actuel (lancer() est une passe unique, pas d'annulation). Remplacé par un avantage PROACTIF : active ce bouton avant le prochain sort, le prochain jet de Mutation Sauvage (rang 1) est roulé deux fois et garde le meilleur résultat. Pose un drapeau consommé une seule fois (p.instinctChaotiqueActif), cf. lancer()." } ] } },
          { rang: 3, nom: "Canalisation Profonde", effet: "Sur un jet de Mutation Sauvage de +3 ou +4 : effet mineur au choix (repousse 1,5 m, embrase légèrement, ou aveugle 1 tour)",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Condition désormais vérifiée automatiquement (signalée entre crochets dans le message de Mutation Sauvage dès que le jet atteint +3 ou +4, cf. _rollMutationSauvage). Effet mineur au choix (repousse 1,5 m / embrase légèrement / Aveuglée 1 tour) reste à appliquer manuellement — choix non modélisé par un effet fixe." } ] } },
          { rang: 4, nom: "Maîtrise du Chaos", effet: "1x/jour, avant de lancer un sort : renonce au jet pour garantir +4 sans jet au sort suivant",
            mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Automatisé (validé avec Thomas) : la partie chiffrée du texte source ('+4 garanti sans jet, 1x/repos long') est désormais câblée — active ce bouton avant le prochain sort, son prochain jet de Mutation Sauvage (rang 1) applique +4 sans lancer les dés. Pose un drapeau consommé une seule fois (p.maitriseChaosGarantieActif), cf. lancer(). L'option de repli '-2 DM fixe' pour renoncer au jet sans ce rang reste un choix narratif, non gaté par un usage limité, laissé à la table." } ] } },
          { rang: 5, nom: "Submersion Arcanique", effet: "1x/jour, avant de lancer un sort : double le modificateur de Mutation Sauvage (-4 à +8). Négatif : 1d4 DM + Étourdi. Positif : effet spectaculaire",
            mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Automatisé (validé avec Thomas) : active ce bouton avant le prochain sort, pose un drapeau consommé une seule fois (p.submersionArcaniqueActif, cf. lancer()). Le prochain jet de Mutation Sauvage (rang 1) est doublé (-4 à +8) ; si le résultat doublé est négatif, applique automatiquement 1d4 DM + état 'Étourdie' 1 tour au lanceur (cf. _rollMutationSauvage). Si positif, l'« effet spectaculaire » reste non défini — narratif, à l'appréciation du MJ." } ] } },
        ],
      },
      {
        nom: "Voie de la magie élémentaire",
        speciale: false,
        description: "Feu, glace et terre canalisés à travers de vrais sorts — la version magicien de la polyvalence élémentaire.",
        rangs: [
          { rang: 1, nom: "Trio élémentaire (sort, L)", effet: "Choix quotidien : Flamme (1d6+Mod. d'INT feu) · Givre (1d6+Mod. d'INT glace, Ralentie 1 tour : -2 DEF) · Pierre (1d6+Mod. d'INT contact, repousse 1,5 m)",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "1d6+Mod.INT", elementaire: "feu" },
                { type: "special", note: "Choix à l'activation entre 3 sorts : Flamme (feu, modélisé ici), Givre (glace + état 'ralentie' 1 tour), ou Pierre (contact + repousse 1,5 m) — un seul sur les trois est représenté par l'effet degats ci-dessus." } ] } },
          { rang: 2, nom: "Intensité élémentaire", effet: "Les 3 sorts passent à 1d8 + Mod. d'INT",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Déjà codé dans Capacites.resoudreEffet (branche 'degats') : dès que ce rang 2 est acquis, le 1d6 initial du Trio élémentaire (rang 1, seule des 3 options de sort représentée par un effet 'degats') est automatiquement remplacé par 1d8, identifié via voie+rang." } ] } },
          { rang: 3, nom: "Zone élémentaire (L)", effet: "Version en zone (3 m, portée 15 m) d'un des 3 sorts : 3d6 DM vs DEF",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "zone", portee: 7, zone: 1,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "3d6", elementaire: null },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'DEX' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de DEX par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé, au prix de la nuance 'DEX pour moitié' sur résistance réussie (le schéma standard ne gère que touché/raté binaire). Élément (feu/glace/terre) au choix du lanceur." } ] } },
          { rang: 4, nom: "Maîtrise duale (L, 1x/combat)", effet: "Combine deux éléments en un seul sort (vapeur Feu+Glace, choc Feu+Terre... à détailler avec le MJ)",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Combine deux éléments en un seul sort — le texte lui-même renvoie au MJ pour le détail exact ; pas de formule fixe à modéliser tant que non tranché." } ] } },
          { rang: 5, nom: "Cataclysme élémentaire (L, 1x/scénario)", effet: "Zone 6 m, portée 20 m : 6d6 DM + effet annexe (Feu : brûlure · Glace : Gelée/Immobilisée · Terre : terrain difficile)",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "zone", portee: 10, zone: 3, jetOppose: null,
              effets: [ { type: "degats", formule: "6d6", elementaire: null },
                { type: "special", note: "Effet annexe selon l'élément choisi : Feu → état 'brulure' ; Glace → état 'gelee'/'immobilisee' ; Terre → terrain difficile (non chiffrable) — choix non modélisé par un effet fixe." } ] } },
        ],
      },
      {
        nom: "Voie de la magie protectrice",
        speciale: false,
        description: "Le savoir tourné vers la survie — boucliers, dissipation, renvoi. Le pilier défensif qui manquait au Magicien.",
        rangs: [
          { rang: 1, nom: "Bouclier arcanique (L)", effet: "Active un bouclier sur soi ou un allié à portée : +2 DEF pendant 2 tours",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null, jetOppose: null,
              effets: [ { type: "bonus", cible: "DEF", valeur: 2, duree: "2" } ] } },

          { rang: 2, nom: "Résistance arcanique", effet: "Passif : +2 aux jets de sauvegarde contre la magie. Bouclier arcanique passe à +3 DEF",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "+2 aux jets de sauvegarde contre la magie — l'app ne modélise aucun jet de sauvegarde côté PJ (les attaques de sorts ennemis se résolvent par comparaison à la DEF, jamais par un jet du joueur) : même limitation structurelle que race Élfe de sang 'Sang Divin'/Demi-Elfe 'Sang Mêlé', bonus de test hors combat non câblable ici." },
                { type: "special", note: "Corrige un gap de donnée : modifie Bouclier arcanique (rang 1), le bonus passe de +2 à +3 DEF — n'était pas câblé (contrairement à Refrain lancinant/Intensité élémentaire, même principe). Ajouté dans Capacites.resoudreEffet (branche 'bonus'), identifié via voie+rang, durée inchangée (2 tours)." } ] } },

          { rang: 3, nom: "Dissipation (L)", effet: "Test d'INT opposé contre le lanceur d'un effet magique ciblant le Magicien ou un allié à 10 m : succès = annule l'effet",
            mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "allie", portee: 5, zone: null,
              jetOppose: { caracAttaquant: "INT", caracDefenseur: "INT", difficulteFixe: null },
              effets: [ { type: "special", note: "Vérifié lors de l'audit final (validé avec Thomas) : contrairement aux autres jetOppose non-DEF simplifiés cette session (Chant corrupteur, Exorcisme, Regard du juste...), celui-ci reste volontairement intact — l'opposition porte sur le LANCEUR de l'effet magique à contrer, une tierce entité distincte de 'cible' (l'allié protégé, résolu via cibleId). Remplacer caracDefenseur par 'DEF' comparerait au jet contre la DEF de l'ALLIÉ protégé, pas celle de l'attaquant à contrer — un résultat structurellement faux, pas une simplification. Sur test d'INT réussi contre le lanceur de l'effet magique ciblé : annulation totale de cet effet, avant application — reste manuel." } ] } },

          { rang: 4, nom: "Renvoi partiel", effet: "1x/combat, quand le Magicien encaisse un sort qui le ciblait directement (test d'attaque magique réussi contre lui), renvoie la moitié des dégâts (arrondi inf.) à l'attaquant, si celui-ci est en vue",
            mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Corrige un bug de donnée : portait un effet 'degats' avec formule 'moitieRecue', un token que resoudreExpression() ne reconnaît pas (il tombe dans la branche 'terme non reconnu', compte pour 0) — le bouton Lancer semblait fonctionnel mais renvoyait toujours 0 dégâts. Passé en 'special' : calculer le montant réel exigerait de tracer l'attaquant et les dégâts encaissés à travers tout le pipeline (subirDegats ne connaît pas l'identité de l'attaquant), hors de portée d'un simple hook — à appliquer manuellement (moitié des dégâts du sort qui vient de toucher, arrondi inf.). Déclenché uniquement par un sort ciblé ayant réussi son test d'attaque magique contre le Magicien — ne s'applique pas aux dégâts de zone/AoE. Nécessite que l'attaquant soit en ligne de vue." } ] } },

          { rang: 5, nom: "Sanctuaire (L, 1x/scénario)", effet: "Pendant [2 + Mod. d'INT] tours : immunité totale aux dégâts magiques",
            mecanique: { type: "limitee", usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "etat", id: "sanctuaire_magicien", duree: "2+Mod.INT" },
                { type: "special", note: "Pose l'état 'Sanctuaire' (durée 2+Mod.INT tours, décomptée automatiquement chaque tour comme tout autre état) ; subirDegats côté app.js annule intégralement tout dégât marqué 'magique' tant que l'état est actif — détection automatique, pas de case à cocher (même principe que l'état 'renversee')." } ] } },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — folie arcanique : un magicien qui a creusé trop profondément dans les savoirs interdits, jusqu'à laisser le chaos s'immiscer dans son esprit et sa magie.",
        rangs: [
          { rang: 1, nom: "Glimpse du Vide (sort)", effet: "Attaque magique, portée 20 m : 2d8 DM chaotiques (pas de Mod. d'INT). +1 CS",
            mecanique: { type: "activable", corruption: 1, usage: { frequence: "libre" }, cible: "ennemi", portee: 10, zone: null,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "2d8", elementaire: "chaos" },
                { type: "special", note: "Pas de Mod.INT ajouté (sort instable). +1 point de jauge de Chaos (CS), non trackée par le schéma standard." } ] } },
          { rang: 2, nom: "Don corrompu (passive)", effet: "Force n'importe quel sort/capacité : +1d6 DM ou relance un dé raté. +1 CS",
            mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "degats", formule: "1d6", elementaire: "chaos" },
                { type: "special", note: "Alternative possible : relance un dé de dégâts raté au lieu du bonus +1d6. Coût : +1 CS (jauge de Chaos). Force n'importe quel sort/capacité — dépendance inter-capacités non modélisée automatiquement." } ] } },
          { rang: 3, nom: "Vision interdite (L)", effet: "Zone 5 m, portée 15 m : 4d6 DM vs DEF. +2 CS. Sur 18-20 naturel, jet sur la table de mutation Palier 1",
            mecanique: { type: "limitee", corruption: 2, usage: { frequence: "libre" }, cible: "zone", portee: 7, zone: 2,
              jetOppose: { caracAttaquant: "attaqueMagique", caracDefenseur: "DEF", difficulteFixe: null },
              effets: [ { type: "degats", formule: "4d6", elementaire: "chaos" },
                { type: "special", note: "Simplifié (validé avec Thomas) : caracDefenseur passé de 'DEX' à 'DEF' — data/bestiaire.json n'expose aucun modificateur de DEX par monstre, donc l'opposition d'origine ne pouvait jamais être automatisée. Contre 'DEF', le jet magique est désormais pleinement automatisé, au prix de la nuance 'DEX pour moitié' sur résistance réussie. +2 CS. Mécanisé (validé avec Thomas) : jet naturel 18-20 (seuil fixe propre à cette capacité, indépendant du seuil de critique de l'arme) déclenche désormais un jet 1d6 automatique sur la table de mutation Palier 1." } ] } },
          { rang: 4, nom: "Esprit fissuré (passive, dès CA 5+)", effet: "Au choix, fixe : +1d6 DM à tous les sorts, ou +2 résistance aux DM. Contrepartie : détecté comme instable par les cercles savants et académies",
            mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              effets: [ { type: "special", note: "Choix fixé à l'acquisition (non rejouable) déjà codé, dès CA 5+ : +1d6 DM à tous les sorts (Personnage.bonusDegatsSortsChaos, lu par Capacites.resoudreEffet) ou +2 résistance aux dégâts (bonusReductionCapacites). Contrepartie (détecté comme instable) non trackée." } ] } },
          { rang: 5, nom: "Avatar du Vide (L, 1x/scénario)", effet: "[3+Mod. d'INT] tours : +4 attaque magique, +2d6 DM à tous les sorts, divise par 2 les DM physiques subis. +3 CS immédiat. Contrecoup : Volonté (SAG) diff. 12 ou Halluciné 1 tour + 1d4 DM de choc arcanique",
            mecanique: { type: "limitee", corruption: 3, usage: { frequence: "1x/scenario" }, cible: "soi", portee: null, zone: null, jetOppose: null,
              testVolonte: { carac: "SAG", difficulteFixe: 12,
                echecEffets: [ { type: "etat", id: "hallucinee", duree: "1" }, { type: "degats", formule: "1d4", elementaire: null } ] },
              effets: [ { type: "bonus", cible: "attaque", valeur: 4, duree: "3+Mod.INT" },
                { type: "etat", id: "avatar_du_vide", duree: "3+Mod.INT" },
                { type: "special", note: "+2d6 DM à tous les sorts désormais câblé (même correctif que Nécromancien Avatar du chaos, validé avec Thomas) : Personnage.bonusDegatsSortsChaos() vérifie l'état temporaire 'avatar_du_vide' en plus du choix permanent CA 5+ d'Esprit fissuré (rang 4). +3 CS immédiat. Division par 2 des DM physiques subis : cf. état 'avatar_du_vide' (même mécanique que Forme du chaos sauvage du Druide). Contrecoup désormais automatisé via mecanique.testVolonte (nouveau champ echecEffets, générique) : test de SAG diff. 12 à l'activation, échec → état 'hallucinee' 1 tour + 1d4 DM de choc arcanique appliqués directement au lanceur." } ] } },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : érudit polyvalent (Universitaire), risque-tout instable (Sauvage), combattant magique (Élémentaire), gardien arcanique (Protectrice). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
      "Un personnage débute avec 2 capacités de rang 1 au choix parmi les voies ouvertes à son profil.",
      "Les rangs supérieurs s'acquièrent dans l'ordre — impossible de prendre le rang 3 sans avoir les rangs 1 et 2 de la même voie.",
      "Magie Sauvage et Magie Élémentaire sont parfaitement combinables : un mage élémentaliste à la magie instable est un concept tout à fait viable.",
    ],
  },
};

/* Ordre d'affichage des classes */
const ORDRE_CLASSES = ["guerrier", "chevalier", "barde", "chasseur", "moine", "druide", "pretre", "magicien", "enchanteur", "necromancien"];

/* ============================================================
   VOIES RACIALES (homebrew)
   Chaque personnage dispose d'une Voie Raciale gratuite, en plus
   de ses Voies de profil. Ne consomme pas les points de capacité
   de classe. 1 capacité par rang, rangs acquis dans l'ordre.
   ============================================================ */
const RACES = {
  humain: {
    race: "humain",
    nom_affiche: "Humain",
    voie_nom: "Voie de Sang Mêlé",
    description: "Adaptabilité, résilience au Chaos latente, ambition divine héritée.",
    trait_passif: null,
    variantes: null,
    rangs: [
      { rang: 1, nom: "Sang Divin", effet: "+1 à tous les jets de sauvegarde contre la magie et la corruption.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "+1 à tous les jets de sauvegarde contre la magie et la corruption — bonus de test hors combat, pas d'action à déclencher." } ] } },
      { rang: 2, nom: "Résilience Mortelle", effet: "1x/jour, quand tu tombes à 0 PV, tu restes à 1 PV.",
        mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Déclenchement automatique quand les PV tomberaient à 0 : reste à 1 PV — mécanique de sauvegarde de mort, non modélisée par degats/soin/etat/bonus." } ] } },
      { rang: 3, nom: "Polyvalence", effet: "Tu gagnes un rang supplémentaire dans n'importe quelle Voie de ton profil (hors Voie du Chaos).",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Rang de voie supplémentaire — choix de construction de personnage, pas un effet de combat à lancer." } ] } },
      { rang: 4, nom: "Ambition", effet: "+2 à une caractéristique de ton choix (définitif, choisi à ce rang).",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "caracteristique", valeur: 2, duree: "permanente" },
            { type: "special", note: "Choix de la caractéristique fixé définitivement à l'acquisition — déjà géré via RACE_CAPACITES_A_CHOIX côté app.js." } ] } },
      { rang: 5, nom: "Étincelle Divine", effet: "1x/jour, tu réussis automatiquement un test de caractéristique (annonce avant le jet).",
        mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Réussite automatique d'un test de caractéristique, annoncée avant le jet — mécanique de réussite garantie, pas un effet degats/soin/etat/bonus classique." } ] } },
    ],
  },

  elfe: {
    race: "elfe",
    nom_affiche: "Elfe",
    voie_nom: "Voie de l'Enfant de la Sève",
    description: "Connexion à l'Arbre-Monde, acuité sensorielle, longévité — tronc commun à toutes les nations elfiques.",
    trait_passif: null,
    variantes: [
      { code: "aetharion", nom_affiche: "Aetharion (Haut Elfe)", nom_capacite: "Intuition Magique", effet: "Tu peux identifier un sort ou un objet magique par simple contact (test INT DD 12). +1 aux jets d'attaque magique.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "attaque", valeur: 1, duree: "permanente" },
            { type: "special", note: "+1 aux jets d'attaque magique (modélisé ci-dessus). Identification d'un sort/objet magique par contact (test INT DD 12) — non chiffrable par le schéma standard." } ] } },
      { code: "aelindra", nom_affiche: "Aelindra (Elfe Sylvain)", nom_capacite: "Communion Naturelle", effet: "En milieu naturel, tu ne laisses aucune trace. Tu peux communiquer des émotions simples avec les animaux sauvages.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Ne laisse aucune trace en milieu naturel ; communique des émotions simples avec les animaux sauvages — effets utilitaires hors combat, non chiffrables." } ] } },
      { code: "mordanel", nom_affiche: "Mordanel (Elfe du Crépuscule)", nom_capacite: "Regard du Témoin", effet: "1x/combat, tu peux désigner une cible : jusqu'à ton prochain tour, tous tes alliés ont +2 aux attaques contre elle.",
        mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "etat", id: "marquee_elfe_mordanel", duree: "1" } ] } },
    ],
    rangs: [
      { rang: 1, nom: "Sens Affinés", effet: "Vision dans la pénombre jusqu'à 18m. +2 aux tests de Perception.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "Perception", valeur: 2, duree: "permanente" },
            { type: "special", note: "Vision dans la pénombre jusqu'à 18m (non chiffrable). +2 Perception déjà codé dans Personnage.bonusCompetence('Perception')." } ] } },
      { rang: 2, nom: "Grâce de la Sève", effet: "+2 en DEX. Tu ne peux pas être surpris si tu n'es pas inconscient.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "caracteristique", valeur: 2, duree: "permanente" },
            { type: "special", note: "+2 DEX fixe déjà codé dans Personnage.bonusCaracCapacites(). Ne peut pas être surpris tant que conscient — immunité non modélisée comme un effet appliqué." } ] } },
      { rang: 3, nom: "Héritage National", effet: "Capacité différente selon la nation elfique — choisis ta nation pour révéler l'effet.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "L'effet réel vient de la variante nationale choisie (cf. race.variantes : Aetharion/Aelindra/Mordanel, chacune avec sa propre mecanique) — ce rang lui-même n'a pas de formule propre." } ] } },
      { rang: 4, nom: "Mémoire des Âges", effet: "1x/session, tu te souviens d'un fait historique ou lié à la magie pertinent (le MJ fournit une information vraie).",
        mecanique: { type: "limitee", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Le MJ fournit une information vraie pertinente — entièrement narratif, pas un effet chiffré. Fréquence '1x/session' hors du vocabulaire standard (tour/combat/scène/scénario/jour)." } ] } },
      { rang: 5, nom: "Lien à l'Arbre", effet: "1x/jour, tu médites 10 minutes pour regagner 1d6+SAG PV. Inutilisable en armure lourde.",
        mecanique: { type: "rituel", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "soin", formule: "1d6+Mod.SAG" },
            { type: "special", note: "Nécessite 10 minutes de méditation ; inutilisable en armure lourde — conditions non vérifiées automatiquement." } ] } },
    ],
  },

  nain: {
    race: "nain",
    nom_affiche: "Nain",
    voie_nom: "Voie de la Pierre Vivante",
    description: "Endurance, ancrage à la terre, magie artisanale intériorisée.",
    trait_passif: null,
    variantes: null,
    rangs: [
      { rang: 1, nom: "Résistance de Pierre", effet: "+2 PV par niveau (rétroactif à la création). Résistance aux poisons : +4 aux jets de sauvegarde.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "+2 PV par niveau déjà codé dans Personnage.bonusPvCapacites() (modifie pvMax, pas un effet ponctuel). +4 aux jets de sauvegarde contre les poisons — bonus de test hors combat." } ] } },
      { rang: 2, nom: "Vision des Profondeurs", effet: "Vision dans le noir total jusqu'à 18m. Tu sens instinctivement si un tunnel est stable ou sur le point de s'effondrer.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Vision dans le noir total jusqu'à 18m ; détection instinctive de la stabilité d'un tunnel — capacités de perception hors combat, non chiffrables." } ] } },
      { rang: 3, nom: "Ancrage", effet: "Tant que tu es debout sur de la terre ou de la pierre, tu ne peux pas être repoussé ou renversé contre ta volonté.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Immunité aux états 'repoussee' et 'renversee' tant que debout sur terre/pierre — condition de terrain non trackée automatiquement." } ] } },
      { rang: 4, nom: "Savoir des Veines", effet: "+2 aux tests d'INT liés à l'artisanat, la géologie, les mécanismes. Tu estimes la valeur exacte de tout minéral ou objet forgé au regard.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "Artisanat", valeur: 2, duree: "permanente" },
            { type: "special", note: "+2 Artisanat déjà codé dans Personnage.bonusCompetence('Artisanat') (géologie/mécanismes repliées dessus). Estimation exacte de valeur au regard : non chiffrable." } ] } },
      { rang: 5, nom: "Cœur de Montagne", effet: "1x/jour, tu encaisses sans dommage les dégâts d'une seule attaque (annonce après que les dés sont lancés mais avant application).",
        mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Déjà codé : Personnage.aCoeurDeMontagne() (verrou race+rang) + Capacites.verifierUsage/appliquer côté app.js (clé 'race:nain:5', 1x/jour) — case à cocher sur le formulaire 'Subir des dégâts', n'apparaît que si l'usage est encore disponible ; annule intégralement les dégâts saisis avant application." } ] } },
    ],
  },

  demi_elfe: {
    race: "demi_elfe",
    nom_affiche: "Demi-Elfe",
    voie_nom: "Voie de l'Entre Deux Mondes",
    description: "Hériter des deux sangs sans appartenir pleinement à aucun — polyvalence et sensibilité.",
    trait_passif: "-1 aux jets de Persuasion contre les Hauts Elfes d'Aetharion, qui considèrent le sang mêlé comme une dilution de la Sève.",
    variantes: null,
    rangs: [
      { rang: 1, nom: "Sens Affinés", effet: "Vision dans la pénombre jusqu'à 9m. +1 aux tests de Perception et de Social.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "Perception", valeur: 1, duree: "permanente" },
            { type: "special", note: "+1 Perception et +1 Social (les 4 compétences sociales CHA : Bluff/Intimidation/Représentation/Persuasion, même groupe que le don Doué) déjà codés dans Personnage.bonusCompetence(). Vision dans la pénombre : non chiffrable." } ] } },
      { rang: 2, nom: "Sang Mêlé", effet: "+1 à tous les jets de sauvegarde contre la magie. +1 en DEX ou CHA (choix définitif).",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "caracteristique", valeur: 1, duree: "permanente" },
            { type: "special", note: "+1 à tous les jets de sauvegarde contre la magie (bonus de test hors combat). Choix entre DEX et CHA pour le bonus de caractéristique déjà géré via RACE_CAPACITES_A_CHOIX côté app.js." } ] } },
      { rang: 3, nom: "Résonance", effet: "Tu perçois vaguement la présence de magie active dans un rayon de 9m (pas sa nature, juste son existence).",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: 4, jetOppose: null,
          effets: [ { type: "special", note: "Détecte la présence (pas la nature) de magie active dans un rayon de 9m — capacité de perception passive non chiffrable." } ] } },
      { rang: 4, nom: "Adaptabilité", effet: "Tu gagnes un rang supplémentaire dans n'importe quelle Voie de ton profil.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Rang de voie supplémentaire — choix de construction de personnage, pas un effet de combat à lancer." } ] } },
      { rang: 5, nom: "Double Héritage", effet: "1x/jour, tu peux relancer un test raté de Perception, Social ou INT. Tu gardes le second résultat.",
        mecanique: { type: "limitee", usage: { frequence: "1x/jour" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "Déjà codé dans Personnage.aDoubleHeritage() : case à cocher 'Double Héritage' sur la fiche complète (1x/jour, clé 'race:demi_elfe:5'), force l'avantage sur le prochain Test de Perception ou d'INT, ou sur les 4 compétences 'Social' (Bluff/Intimidation/Représentation/Persuasion) — même équivalence relance/avantage qu'INT héroïque." } ] } },
    ],
  },

  demi_orc: {
    race: "demi_orc",
    nom_affiche: "Demi-Orc",
    voie_nom: "Voie de la Rage Cristallisée",
    description: "Violence émotionnelle héritée des origines orciques, force brute maîtrisée ou subie.",
    trait_passif: "-1 aux jets de Persuasion contre les personnages de l'Empire de Solvarn et des Royaumes Coalisés. Ces factions de l'Ordre voient le sang orcique avec suspicion.",
    variantes: null,
    rangs: [
      { rang: 1, nom: "Carrure Menaçante", effet: "+2 aux tests d'Intimidation. Les ennemis humanoïdes de taille normale doivent réussir un test de SAG DD 10 pour t'attaquer en premier si une autre cible est disponible.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "Intimidation", valeur: 2, duree: "permanente" },
            { type: "special", note: "+2 Intimidation déjà codé dans Personnage.bonusCompetence('Intimidation'). Les ennemis doivent réussir un test de SAG DD 10 pour choisir le Demi-Orc comme cible prioritaire — effet de ciblage non modélisé par le schéma standard." } ] } },
      { rang: 2, nom: "Sang de Guerre", effet: "+1 en FOR ou CON (choix définitif). +2 PV par niveau (rétroactif).",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "caracteristique", valeur: 1, duree: "permanente" },
            { type: "special", note: "Choix entre FOR et CON déjà géré via RACE_CAPACITES_A_CHOIX côté app.js. +2 PV par niveau déjà codé dans Personnage.bonusPvCapacites() (modifie pvMax, pas un effet ponctuel)." } ] } },
      { rang: 3, nom: "Résistance Instinctive", effet: "Quand tu subis des dégâts qui t'amèneraient en dessous de la moitié de tes PV max, tu réduis ces dégâts de 3.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "reduction_degats", valeur: 3, duree: "permanente" },
            { type: "special", note: "Déjà codé dans Personnage.reductionSeuilBasPv(degatsNets), lu par subirDegats côté app.js : réduit de 3 (dans la limite des dégâts nets) uniquement quand le résultat ferait passer sous 50% des PV max." } ] } },
      { rang: 4, nom: "Frénésie Contenue", effet: "1x/combat, tu peux déclencher une rage : +2 aux jets d'attaque et de dégâts pendant 3 tours. À la fin, test CON DD 12 ou tu es Fatigué (-2 à tout) jusqu'au prochain repos.",
        mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "attaque", valeur: 2, duree: "3" },
            { type: "special", note: "+2 aux dégâts en plus de l'attaque pendant 3 tours (non modélisé par un effet ponctuel). À la fin : test de CON DD 12 ou état 'fatiguee' jusqu'au prochain repos." } ] } },
      { rang: 5, nom: "Mémoire de la Guerre (activable)", effet: "Les émotions orciques ancestrales te donnent un instinct de combat brut. Tu n'es jamais surpris en combat, et tu ajoutes +1d4 aux dégâts de ta première attaque à chaque combat.",
        mecanique: { type: "activable", usage: { frequence: "libre" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "degats", formule: "1d4", elementaire: null },
            { type: "special", note: "Corrige un bug de donnée : mecanique.type était 'passive' (bouton Lancer masqué partout dans l'app) alors que l'effet degats est réel — passé à 'activable'. Bonus limité à la première attaque de chaque combat — condition non vérifiée automatiquement. N'est jamais surpris en combat (immunité, non modélisée comme un effet appliqué)." } ] } },
    ],
  },

  demi_gobelin: {
    race: "demi_gobelin",
    nom_affiche: "Demi-Gobelin",
    voie_nom: "Voie de la Ruse des Petits",
    description: "Ingéniosité, survie par le biais, imprédictibilité héritée des émotions de peur et de ruse cristallisées.",
    trait_passif: "-1 aux jets de Persuasion contre les personnages de l'Empire de Solvarn et des Royaumes Coalisés. Ces factions de l'Ordre regardent le sang gobelin avec mépris et méfiance.",
    variantes: null,
    rangs: [
      { rang: 1, nom: "Petite Taille", effet: "+2 aux tests de Discrétion. Tu peux te glisser dans des espaces pour une créature de taille Petite sans test.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "Discrétion", valeur: 2, duree: "permanente" },
            { type: "special", note: "+2 Discrétion déjà codé dans Personnage.bonusCompetence('Discrétion'). Se glisser dans des espaces de taille Petite sans test : non chiffrable." } ] } },
      { rang: 2, nom: "Instinct de Fuite", effet: "Jamais de désavantage en Discrétion ou DEX pour te désengager d'un combat. +1 en DEX.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "caracteristique", valeur: 1, duree: "permanente" },
            { type: "special", note: "+1 DEX fixe déjà codé dans Personnage.bonusCaracCapacites(). Jamais de désavantage en Discrétion/DEX pour se désengager d'un combat — règle de test hors combat, non chiffrable en plus du bonus DEX ci-dessus." } ] } },
      { rang: 3, nom: "Bricoleur", effet: "Tu peux fabriquer ou désamorcer un piège simple avec des matériaux de récupération (test DEX ou INT DD 10). +2 aux tests liés aux pièges et mécanismes.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "aucune", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "bonus", cible: "Artisanat", valeur: 2, duree: "permanente" },
            { type: "special", note: "+2 Artisanat déjà codé dans Personnage.bonusCompetence('Artisanat') (pièges/mécanismes repliés dessus, faute d'entrée dédiée ; s'applique que le test soit fait en DEX ou en INT, bonusCompetence étant indépendant de la carac). Fabrication/désamorçage d'un piège simple : non chiffrable." } ] } },
      { rang: 4, nom: "Cible Difficile", effet: "Les attaques d'opportunité contre toi ont -2. 1x/combat, tu peux te déplacer de 3m sans provoquer d'attaque d'opportunité.",
        mecanique: { type: "passive", usage: { frequence: "libre" }, cible: "soi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "special", note: "-2 sur les attaques d'opportunité subies (règle de combat non chiffrable en DEF classique). 1x/combat, déplacement de 3m sans provoquer d'attaque d'opportunité." } ] } },
      { rang: 5, nom: "Coup Bas", effet: "1x/combat, si tu attaques une cible qui n'a pas encore agi ou qui est engagée avec un allié, tu infliges +2d6 dégâts supplémentaires.",
        mecanique: { type: "limitee", usage: { frequence: "1x/combat" }, cible: "ennemi", portee: null, zone: null, jetOppose: null,
          effets: [ { type: "degats", formule: "2d6", elementaire: null },
            { type: "special", note: "Condition : la cible n'a pas encore agi ce combat, ou est engagée avec un allié — non vérifiée automatiquement." } ] } },
    ],
  },
};

/* Ordre d'affichage des races */
const ORDRE_RACES = ["humain", "elfe", "nain", "demi_elfe", "demi_orc", "demi_gobelin"];

/* ============================================================
   LORE DU MONDE
   ============================================================ */
const LORE = {
  titre: "Lore du Monde — Chroniques Oubliées Fantasy",
  intro:
    "Campagne maison — Document de référence · Version 1.0 (Juin 2026). L'Arbre-Monde, la Fracture, les races, les nations humaines (Solvarn · Royaumes Coalisés · Liberra), la géographie, la magie, le panthéon et le Chaos.",
  sections: [
    {
      titre: "Cosmogonie et origines du monde",
      contenu:
        "L'Arbre-Monde\n\nÀ l'origine de tout se dresse l'Arbre-Monde — axis de la création, siège des dieux et source de toute vie. Son écorce est le temps, sa sève est la magie, ses racines plongent dans des plans que nul mortel n'a jamais atteints. À son sommet siège le Trône de l'Arbre-Monde, source du pouvoir divin absolu.\n\nLe Panthéon Elfique — Les Deux Factions\n\n• Gardiens de l'Écorce (Ordre · Stase · Préservation) : veulent que l'Arbre reste immuable, parfait, fermé au monde. Pouvoir fondé sur la hiérarchie et la préservation. Ce sont eux qui gagnent la Guerre du Trône.\n• Enfants de la Sève (Croissance · Expansion · Vie) : veulent que l'Arbre croisse et engendre d'autres mondes. Pouvoir fondé sur la fécondité et le changement. Bannis et corrompus lors de la Fracture — ils deviennent les Dieux du Chaos.\n\nLa Guerre du Trône\n\nLa guerre éclate quand les Enfants de la Sève cherchent à ouvrir l'Arbre vers d'autres mondes, ce que les Gardiens refusent. Des siècles de conflit divin s'ensuivent. Les émotions générées — violence, meurtre, traque — sont si intenses qu'elles se solidifient en conscience et prennent une existence propre.\n\nLa Fracture\n\n• Défaite des Enfants de la Sève : vaincus, bannis et corrompus — leur désir de croissance devient désir de destruction : ne pouvant avoir l'Arbre, ils veulent l'annihiler.\n• L'Arbre blessé : ses racines sont partiellement corrompues. L'Arbre dépérit lentement depuis — un déclin que les Elfes ressentent dans leur chair.\n• Naissance des Humains : le sang versé pendant la Fracture, mêlé des deux factions, tombe sur le monde et prend vie. Les Humains portent l'écho de la guerre : double nature instable, susceptible au Chaos.\n• Naissance des Dieux du Chaos : les Enfants bannis créent leurs serviteurs — les Démons — pour détruire ce qu'ils n'ont pu posséder.",
    },
    {
      titre: "Les races du monde",
      contenu:
        "Les Elfes — Enfants de l'Arbre\n\nPremiers-nés de l'Arbre, antérieurs à la Fracture. Sang de sève pure → résistance au Chaos (+2 ou +rang aux jets contre la corruption de la Voie du Chaos). Ils ressentent physiquement la blessure de l'Arbre. Trois nations :\n\n• Aetharion (Hauts Elfes) : préserver et isoler l'Arbre. Hautains. Bannissent les demi-elfes. Mépris pour les Aelindra, méfiance pour les Mordanel.\n• Aelindra (Elfes Sylvains) : réparer l'Arbre en tissant des liens avec toutes les races. Présents dans la République. Acceptent les demi-elfes.\n• Mordanel (Elfes du Crépuscule) : garder la mémoire et témoigner. Fracture interne : Anciens prudents contre Jeunes qui veulent agir. Accusés par l'Empire d'avoir provoqué l'incarnation de la Traque.\n\nLes Humains — Sang Mêlé, Fracturé\n\nNés du sang divin des deux camps. Ambition insatiable, adaptabilité. -2 aux jets contre la corruption du Chaos, mais accès plus facile à la Voie du Chaos (les consciences les reconnaissent).\n\nLes Nains — Élémentaires de Pierre Éveillés\n\nCréés par un dieu Gardien de la Montagne, devenus conscients. Ancrage dans l'Ordre.\n• Nains de l'Ordre : forge, tradition, alliés de l'Empire (acier et cols fortifiés). +1 contre la corruption.\n• Khazrak Dûm (Nains Renégats) : ont pactisé avec orcs et gobelins et absorbé leurs traits. Plus grands, peau grisée, mâchoire proéminente. En dominant ce qu'ils méprisent, ils sont devenus ce qu'ils haïssent. Observés par les Dieux du Chaos.\n\nOrcs & Gobelins — Émotions Cristallisées\n\nNés des émotions de violence de la Guerre du Trône, ils créèrent des corps pour traquer et tuer les races de l'Ordre.\n• Orcs (meurtre glorieux) : combattent en horde, face à l'ennemi, vous regardent dans les yeux avant de tuer.\n• Gobelins (traque prédatrice) : embuscades, pièges, nombre. Tuent par instinct. Plus malléables — certaines tribus servent les Khazrak Dûm.",
    },
    {
      titre: "Le Chaos — hiérarchie et manifestations",
      contenu:
        "Hiérarchie du Chaos\n\n• Niveau I — Dieux du Chaos : Enfants de la Sève bannis, pleinement cristallisés. Absents physiquement, influence indirecte et plans à long terme.\n• Niveau II — Consciences-émotions (Violence / Meurtre / Traque) : pas encore des dieux, millénaires d'existence. Bénédictions sur champions ; rarement, incarnation temporaire (siècles de recharge).\n• Niveau III — Démons : serviteurs créés par les Dieux du Chaos. Actifs dans le monde, outils de destruction de l'Ordre.\n• Niveau IV — Orcs & Gobelins : corps des consciences dans le monde mortel. Omniprésents, instruments sans dévotion consciente.\n\nL'Incarnation de la Traque — le Silence de Valmoire (il y a ~18 ans)\n\nPour la première fois depuis des siècles, la conscience de la Traque s'est incarnée, dans une zone frontalière disputée entre les terres Mordanel et les marches orientales de Solvarn. Le village de Valmoire a disparu en trois semaines — les habitants traqués un par un, retrouvés des jours après sans marque de lutte. Cette méthode silencieuse et patiente a permis à l'Empire de désigner les Elfes du Crépuscule : \"Qui d'autre traque ainsi, sinon un peuple qui vit dans l'entre-deux du jour et de la nuit ?\"\n\nL'Empire a exploité l'événement pour élargir son accusation à Aetharion également — cible plus \"légitime\" aux yeux de l'opinion solvarienne (riche, isolationniste, déjà mal-aimée) qu'un peuple pauvre et dispersé. Mensonge délibéré ou conviction sincère ? Ambiguïté narrative centrale de la campagne. Et si les Dieux du Chaos avaient manipulé les deux camps simultanément ?\n\nChez les Mordanel, l'événement est encore frais : la fracture interne entre Anciens (retenue) et Jeunes (réponse armée) n'est pas tranchée. Les dryades proches des terres Mordanel se sont en partie retirées depuis le Silence — un désaveu silencieux qui aggrave la fracture (voir section Les Dryades).",
    },
    {
      titre: "Les trois systèmes humains",
      contenu:
        "La Grande Sécession (la Rupture) a eu lieu il y a environ 170 ans — assez loin pour ne plus être un souvenir personnel, assez proche pour rester un souvenir de famille encore instrumentalisé politiquement.\n\nMême origine pour tous les Humains — le sang divin fracturé. Après la Grande Sécession du Premier Empire, trois systèmes se disputent le monde connu : l'Empire de Solvarn, les Royaumes Coalisés (Valdorne, Arveth, Mornac, Serval) et la République de Liberra.\n\nL'Empire de Solvarn (Xénophobe · Centralisé · Religieux · Solaire)\nHéritier du Premier Empire ; la famille impériale revendique le sang des Gardiens de l'Écorce. Le soleil est son symbole. Doctrine : pureté du sang humain comme rempart au Chaos, non-humains = vecteurs de corruption. Ironie : Solvarn a raison sur un point (les Humains sont plus susceptibles au Chaos), appliqué de façon monstrueuse. But : purifier et reconquérir.\n\nLes Royaumes Coalisés (Chevaleresques · Féodaux · Hypocrites)\n• Valdorne : le plus ancien, berceau de la sécession, chevalerie sincère. Blason : un pont brisé surmonté d'une épée dressée, sur azur — écho direct à Pont-Rompu et au sacrifice d'Alaric. Devise : « Un seul suffit. »\n• Arveth : frontalier de Solvarn, sous pression constante — le vacillant. Blason : une flamme vacillante entre deux lances croisées, sur fond cendré. Devise : « Nous tenons la ligne. »\n• Mornac : maritime et commerçant, chevalerie de façade, pragmatique. Blason : une ancre couronnée sur des vagues, sur vert-de-mer. Devise : « Le vent tourne, le profit reste. »\n• Serval : montagnard, allié des Nains de l'Ordre, le plus indépendant. Blason : une enclume sur un pic montagneux, sur gris-pierre. Devise : « La roche encaisse mais ne se brise pas. »\nStructure féodale (Seigneurs → Chevaliers → Paysans). Point de rupture : si Arveth tombe, la coalition se fracture.\n\nLa République de Liberra (Idéaliste · Inclusive · Fracturée)\nNée de la Sécession, rejette l'Empire et le féodalisme. Assemblée de citoyens ; non-humains admis (représentation inégale). Majorité Aelindra, minorité Mordanel. Fractures : marchands vs idéalistes vs militaires vs communautés non-humaines.\n\nTensions actuelles\n• Solvarn → Royaumes : reconquête (Arveth en première ligne).\n• Solvarn → Liberra : hérésie raciale.\n• Solvarn → Aetharion : guerre ouverte.\n• Valdorne → Solvarn : résistance idéaliste, refuse tout compromis.\n• Arveth → Coalition : négociations secrètes déjà engagées avec Solvarn — un flanc coalisé neutralisé libérerait des troupes impériales pour l'effort contre Aetharion. Rupture potentielle si ces contacts sont révélés.\n• Mornac : pragmatisme marchand (commerce avec Liberra, vend à Solvarn si le prix est bon).\n• Serval ↔ Nains de l'Ordre : alliance montagnarde solide.\n• Liberra ↔ Aelindra : alliance naturelle. Liberra ↔ Royaumes : alliance inconfortable contre Solvarn.",
    },
    {
      titre: "Les Lieux de Libris",
      contenu:
        "Sept lieux structurent la vie politique et sociale de Libris — territoires informels des cinq blocs de l'Assemblée, ou terrains neutres où tout le monde se croise.\n\nLe Grand Marché (Quartier des Marchés)\nCœur commercial de la ville, sur la Lisdane. Entrepôts, comptoirs de change, guildes en tout genre — territoire naturel du Comptoir. C'est ici, dans l'arrière-boutique d'un entrepôt discret appartenant à un intermédiaire de confiance, que Maître Aurèle Ferrand traite ses affaires les moins avouables.\n\nLe Palais du Serment\nSiège officiel de l'Assemblée, bâtiment le plus ancien de Libris — la charte fondatrice y est conservée sous verre, dans la salle où Vasnal préside encore les débats. Terrain neutre en théorie ; en pratique, les cinq blocs s'y affrontent à coups de procédure.\n\nLa Citadelle des Ponts\nCaserne principale de la Garde Citoyenne, sur un éperon rocheux dominant un des ponts de la Lisdane. Accès restreint, patrouilles visibles — un lieu qui rassure certains habitants et en inquiète d'autres.\n\nLe Quartier du Tissage\nTerritoire du Cercle des Peuples. Quartier mixte où se concentrent Aelindra, Mordanel exilés et autres non-humains de la ville. Ateliers, maisons communes, un petit temple dédié à Aelindros.\n\nLa Racine Noire\nTaverne discrète en périphérie, loin des quartiers marchands — repaire informel des Fils de Libris. Pas de siège officiel : leur pouvoir se construit ici, autour de bière bon marché et de discours populistes adressés à ceux que le Comptoir a ruinés.\n\nLa Table Commune\nAuberge-carrefour près des quais, fréquentée par tout le monde — marchands, miliciens en repos, idéalistes désabusés, parfois même un Fils de Libris qui ne veut pas se faire remarquer. Le lieu neutre par excellence pour une rencontre discrète.\n\nLes Docks de Cendre-Claire\nPort principal, où arrivent les nouvelles de la guerre navale contre Aetharion et les cargaisons du Comptoir. Lieu de passage pour toute intrigue impliquant contrebande, espionnage étranger, ou rumeurs fraîchement débarquées d'un autre continent.",
    },
    {
      titre: "La Rupture — chronique de la Grande Sécession",
      contenu:
        "Quand la dynastie régnante du Premier Empire a durci sa doctrine solaire, une branche a revendiqué l'exclusivité du sang divin des Gardiens et verrouillé le pouvoir — devenant Solvarn. Quatre grandes maisons provinciales (futurs Valdorne, Arveth, Mornac, Serval) ont refusé cette purification et se sont soulevées ensemble : la Rupture. Guerre de dix ans, achevée sur un armistice que Solvarn n'a jamais considéré comme définitif.\n\nTrois batailles marquantes :\n\n• La Charge de Fossessainte (an 1) — bataille d'ouverture à un gué frontalier. Sire Alaric de Valdorne, jeune chevalier sans grade, rallie les colonnes dispersées et transforme une déroute en victoire. Fondateur du code chevaleresque de Valdorne : l'honneur individuel qui sauve la cause commune.\n\n• Le Siège de Mornhaven (an 4-5) — le Haut-Maréchal Corvain Ashe assiège la capitale de Mornac huit mois. Mornac tient grâce aux convois de Serval à travers ses cols — ce qui soude la Coalition en alliance réelle.\n\n• La Bataille du Pont-Rompu (an 9) — Alaric, devenu commandant respecté, meurt en détruisant un pont pour couvrir la retraite coalisée. Un mois plus tard, les deux camps épuisés négocient.\n\nL'Armistice des Quatre Sceaux — signé près de Pont-Rompu. Chaque maison appose son sceau séparément (d'où le nom), refusant un sceau commun. Solvarn signe sous protestation, le considérant comme une pause tactique. Corvain Ashe, marqué par cet échec, aurait inspiré des décennies plus tard le durcissement de la doctrine des Chevaliers-Inquisiteurs.\n\n\"Être un Alaric\", à Valdorne, désigne aujourd'hui un acte de courage qui dépasse son rang.",
    },
    {
      titre: "Les Dryades — gardiennes de l'Arbre",
      contenu:
        "Pendant la Guerre du Trône, des fragments de l'Arbre-Monde — racines-mères, nœuds de sève ancienne — ont gagné une conscience propre : le réflexe de survie de l'Arbre lui-même. Elles précèdent les trois nations elfiques.\n\nDeux niveaux :\n• Dryades mineures — liées à un bosquet précis, discrètes, nombreuses, dispersées dans toutes les forêts significatives du monde connu. Protègent leur bosquet localement.\n• Grandes Dryades — rarissimes, quasi-divines, nées seulement d'un traumatisme majeur infligé à l'Arbre (guerre, incendie, corruption). Une poignée dans tout le monde connu, chacune gardienne d'un site sacré. Rencontre = événement de campagne, pas rencontre aléatoire.\n\nRapport aux trois nations elfiques :\n• Aetharion — révérence formelle, quasi-religieuse ; sanctuaires cérémoniels, mais frustration de devoir s'incliner devant une autorité qu'ils ne contestent pas.\n• Aelindra — proximité réelle, presque familiale ; rituels de guérison invoquant l'aide d'une dryade locale.\n• Mordanel — méfiance mutuelle depuis le Silence de Valmoire. Certaines dryades proches des terres Mordanel se sont retirées, désaveu silencieux qui aggrave la fracture interne (Anciens vs Jeunes).",
    },
    {
      titre: "Géographie & capitales",
      contenu:
        "Un continent occidental et un continent oriental, séparés par une mer intérieure — la Mer de Cendre-Claire (les Solvariens) / Vaelthys, \"les eaux qui séparent\" (les Hauts Elfes).\n\nCONTINENT OCCIDENTAL\n• Empire de Solvarn — nord-centre — capitale Solmaris — frontière sud avec Arveth, marches orientales disputées avec Mordanel, côte orientale sur la Mer de Cendre-Claire (tête de pont vers Aetharion).\n• Valdorne — ouest — capitale Valdcourt — berceau de la Rupture.\n• Arveth — frontière directe avec Solvarn (le vacillant) — capitale Arvenfall.\n• Mornac — traversé par la Lisdane, côte sud — capitale Mornhaven — commerce.\n• Serval — Contreforts de Serval, allié aux Nains de l'Ordre — capitale Serval.\n• République de Liberra — sud, à l'embouchure de la Lisdane — capitale Libris.\n• Aelindra — côte centre-ouest, frontière naturelle avec Liberra.\n• Mordanel — marches orientales de Solvarn, côte, site du Silence de Valmoire — tête de pont impériale vers Aetharion.\n• Nains de l'Ordre — Contreforts de Serval — capitale souterraine Kaldrun (\"la Cité sous la Montagne\").\n• Khazrak Dûm (Nains Renégats) — les Failles Rouges, à l'est de Liberra, en bordure des terres orques. Scindés entre Résistants (proches de Kaldrun) et Évolutionnistes (enfoncés dans les Failles, au contact direct des tribus orques).\n• Tribus Orcs/Gobelins — terres sauvages à l'est de Liberra et au-delà des Failles Rouges.\n\nLA MER DE CENDRE-CLAIRE (VAELTHYS)\nSépare les deux continents. La guerre Solvarn/Aetharion s'y joue par débarquements et sièges côtiers plutôt que par une ligne de front terrestre — une guerre d'usure, sans percée décisive depuis 3 ans.\n\nCONTINENT ORIENTAL\n• Aetharion — côte occidentale face à Solvarn — forêt fermée — l'Arbre-Monde en son cœur : un lieu réel, caché, connu des seuls Hauts Elfes de haut rang et protégé par un réseau de bosquets à dryades. Officiellement nié comme lieu physique par la doctrine impériale (hérésie païenne) ; en pratique, objet d'enquêtes discrètes des Chevaliers-Inquisiteurs.\n• Tribus Orcs/Gobelins — marges orientales du continent, au-delà d'Aetharion.\n\nFLEUVES\n• La Sombre — frontière historique Solvarn/Arveth, gué de Fossessainte.\n• La Verselande — cœur des terres coalisées, entre Mornhaven et Valdorne, Pont-Rompu.\n• La Lisdane — source dans les Contreforts de Serval, traverse Mornac, se jette dans la mer près de Libris (alimente le Quartier des Marchés).",
    },
    {
      titre: "Le système de magie",
      contenu:
        "Une source unique (l'Arbre-Monde), trois prismes d'accès. La Fracture l'a blessé : le flux magique diminue lentement depuis des millénaires.\n\nLa Sève (magie elfique · intuitive · organique)\nInstinctive pour les Elfes (se souvenir, pas apprendre). Liée à la vie et aux cycles ; se raréfie avec le déclin de l'Arbre. Humains/Nains peuvent l'apprendre, avec effort. COF : +2 aux jets de magie innée pour les Elfes.\n\nLe Sang divin (magie humaine · puissante · instable)\nIntuitive pour les Humains. Plus puissante que la Sève mais tire vers le Chaos. L'Église de Solvarn l'utilise en croyant à un don du Soleil-Dieu. COF : -2 aux jets de corruption mais accès facilité à la Voie du Chaos.\n\nLa Pierre (magie naine · lente · permanente)\nRunes, forge, enchantements durables — les Nains parlent de travail, pas de magie. Lente mais ineffaçable. Ancre dans l'Ordre. COF : +1 aux jets contre la corruption pour les Nains de l'Ordre.\n\nLa Magie du Chaos\nMême source, mais accédée par les racines corrompues plutôt que le tronc sain. Plus puissante, immédiate pour les Humains, au prix d'une corruption progressive en trois paliers :\n• L'Effleurement (0-2 échecs) : yeux qui virent, voix dédoublée, plantes qui flétrissent. Aucun effet mécanique — les autres remarquent.\n• La Marque (3-5 échecs) : trait physique permanent (veine noire, mèche décolorée). -1 SAG ou CHA ; les Aetharion refusent de parler.\n• La Fracture (6+ échecs) : visions de la Guerre du Trône, voix des consciences. +1 dé de dégâts en Voie du Chaos mais jets avec désavantage.\n\nConseil MJ : ne pas tracker les échecs devant les joueurs — révéler les paliers narrativement.",
    },
    {
      titre: "Religion & panthéon",
      contenu:
        "Six dieux : trois Gardiens, trois Corrompus. Les Elfes vénèrent encore les Gardiens (leurs créateurs) ; les Royaumes les ont réinterprétés ; Solvarn les a fondus en un Soleil-Dieu unique pour effacer l'origine elfique. Les trois Enfants de la Sève vaincus sont devenus les Dieux du Chaos.\n\n• Aethar — Lumière & Temps (Premier Gardien) — symbole : soleil à huit branches — vénéré par Aetharion, Valdorne, Solvarn (Soleil-Dieu unique). Miroir chaotique : Aetharyn (temps dévoré, lumière aveuglante).\n• Aelindros — Sève & Croissance — symbole : feuille à nervures dorées — vénéré par Aelindra, Liberra, Mordanel. Miroir : Sylvath (saisons brisées, nature dévorante).\n• Valdaan — Ancêtres & Forge — symbole : enclume sur pierre gravée — vénéré par les Nains de l'Ordre, Serval, Valdorne. Miroir : Khoreth (pierre qui écrase, profondeurs).\n\nReligions par système\n• Église de Solvarn : monothéisme solaire dogmatique. Aethar réinterprété en Soleil-Dieu ; les autres dieux = « démons elfiques ». Magie réservée aux agréés ; le reste est hérésie. Légitime le sang impérial.\n• Cultes des Royaumes : Valdorne (Gardiens sincères), Arveth (culte hybride sous pression solvarienne — le vrai terrain de la rupture), Mornac (foi de façade), Serval (culte de Valdaan hérité des Nains).\n• Liberra : liberté de culte totale, magie libre réglementée. Tension mages vs laïcs craignant le Chaos.\n• Elfes : contact direct, pas de clergé — la magie est mémoire. Nains : la forge est une prière à Valdaan.\n\nLa fracture religieuse d'Arveth : le culte solvarien s'infiltre dans ses temples. Si Arveth bascule religieusement avant de basculer militairement, la coalition perd son ciment moral.",
    },
    {
      titre: "Institutions — l'Église de Solvarn",
      contenu:
        "Le Sacerdoce Solaire (culte officiel d'Aethar réinterprété en Soleil-Dieu) a une hiérarchie propre, distincte du pouvoir impérial :\n\n• Le Flambeau Suprême — Grand Pontife, chef spirituel, élu à vie par le Concile des Flammes.\n• Le Concile des Flammes — neuf hauts-clercs, un par province/dimension doctrinale. Élisent le Flambeau Suprême, peuvent en théorie le déposer pour hérésie.\n• Les Chevaliers-Inquisiteurs — ordre militant : traquent l'hérésie, surveillent la pureté doctrinale (y compris les rumeurs sur l'Arbre-Monde), servent aussi de guerriers-clercs d'élite. Le Haut-Maréchal Corvain Ashe (Siège de Mornhaven, Pont-Rompu) en est issu ; son échec a durci l'ordre depuis.\n• Les Flambeaux — clergé local, tiennent temples et paroisses.\n\nRapport de force avec l'Empereur : la légitimité impériale (sang des Gardiens) doit être reconnue rituellement par le Flambeau Suprême au couronnement pour être politiquement valide. Sans cette bénédiction, même un héritier de sang pur voit sa légitimité contestée. L'Église ne gouverne pas, mais peut fragiliser un Empereur en laissant planer le doute — deux ou trois Flambeaux Suprêmes ont utilisé ce levier historiquement.",
    },
    {
      titre: "Les Académies de Liberra",
      contenu:
        "L'Académie Libre de Libris — fondée sur les idéaux de la République (ouverture, savoir partagé entre races et traditions), devenue avec le temps prestigieuse et cloisonnée. Discrimination silencieuse envers les élèves demi-orcs, demi-gobelins, ou issus de traditions non académiques (magie de Pierre naine) : jamais interdits, rarement promus.\n\nDeux académies dissidentes nées de ce plafond de verre :\n• L'Atelier des Marges — fondé par d'anciens étudiants/professeurs lassés de la discrimination. Enseignement pratique, ouvert sans réserve aux demi-races. Jugé \"amateur\" par l'Académie Libre ; réputation d'efficacité redoutable sur le terrain.\n• Le Cénacle de la Pierre — cercle de transmission lié aux traditions naines de la Pierre. Méprisé par l'Académie Libre comme \"de l'artisanat déguisé\".\n\nMiroir de Liberra elle-même : sincèrement idéaliste dans ses principes, rongée par des intérêts concurrents dans sa pratique.",
    },
    {
      titre: "Notes MJ — éléments en construction",
      contenu:
        "PNJ clés à créer : l'Empereur de Solvarn ; un chevalier de Valdorne (l'idéal — voir Alaric de Valdorne comme référence/ancrage) ; un lord d'Arveth (le vacillant, tient les négociations secrètes avec Solvarn) ; un Ancien vs un Jeune Mordanel (fracture post-Silence de Valmoire) ; un Khazrak Dûm résistant (proche de Kaldrun, opposé aux Évolutionnistes).",
    },
  ],
};

/* ============================================================
   PNJ CLÉS (panneau Lore > onglet "PNJ")
   Rendu par js/app.js (rendrePnjCles), rien à dupliquer ailleurs.
   ============================================================ */
const PNJ_CLES = [
  {
    id: "empereur-aurelian",
    nom: "Empereur Aurelian III de Solvarn",
    titre: "Chef de l'Empire de Solvarn",
    faction: "Solvarn",
    resume: "Un Empereur dévot en public, rongé par un doute qu'il ne peut confier à personne.",
    description:
      "Revendique le sang des Gardiens de l'Écorce. Lors de son couronnement, le Rite de l'Aube — l'invocation censée faire virer la flamme sacrée au blanc-or en présence d'un héritier légitime — n'a pas produit le signe attendu. Le Flambeau Suprême de l'époque, pour ne pas déstabiliser un Empire déjà en guerre, a déclaré publiquement le signe manifesté. Un pacte de silence mutuel scelle depuis le trône et l'autel. Aurelian vit avec la terreur intime d'être un imposteur — ce qui explique sa dévotion publique quasi-excessive et son acharnement personnel dans la guerre contre Aetharion : il espère, sans jamais l'admettre, qu'une preuve trouvée en territoire elfique pourrait enfin valider ou éclaircir la nature de son sang.\n\nMesuré en public, presque froid — jamais un mot de trop. En privé (rare), on devine un homme épuisé qui interroge des théologiens sur des points de doctrine obscurs sans jamais dire pourquoi.",
    accroches: [
      "Les PJ tombent sur un document ou un témoin évoquant \"l'Aube silencieuse\" (nom codé du secret).",
      "Un Chevalier-Inquisiteur trop curieux sur le sujet disparaît.",
      "L'actuel Flambeau Suprême, héritier du secret, pourrait s'en servir comme levier si l'Empereur devient trop indépendant.",
    ],
  },
  {
    id: "tristan-daurvel",
    nom: "Sire Tristan d'Aurvel",
    titre: "Chevalier de l'Ordre du Pont",
    faction: "Valdorne",
    resume: "L'idéal chevaleresque de Valdorne, fatigué pour la première fois de devoir y croire seul.",
    description:
      "Membre de l'Ordre du Pont, fondé en mémoire du sacrifice d'Alaric de Valdorne à Pont-Rompu — vœu de couvrir la retraite des faibles, quel qu'en soit le prix personnel. Tristan incarne cet idéal : courage, sacrifice, parole donnée. Mais la Rupture actuelle (négociations secrètes d'Arveth, cynisme grandissant ailleurs) le fatigue : il commence, pour la première fois, à se demander si l'honneur seul peut encore tenir la Coalition, ou si ce n'est qu'une belle histoire qu'on se raconte pendant que le monde négocie dans l'ombre.",
    accroches: [
      "Tristan enquête, sans certitude, sur des rumeurs de contacts entre Arveth et Solvarn.",
      "Face-à-face potentiel avec Lord Ranulf d'Arvenfall — non en ennemi, mais en homme qui refuse de croire ce qu'il soupçonne.",
      "Bon miroir moral pour des PJ eux-mêmes tentés par le compromis.",
    ],
  },
  {
    id: "ranulf-darvenfall",
    nom: "Lord Ranulf d'Arvenfall",
    titre: "Seigneur d'Arveth — le vacillant",
    faction: "Arveth",
    resume: "Il négocie en secret avec Solvarn, non par ambition, mais par peur sincère pour son peuple.",
    description:
      "Tient les négociations secrètes avec Solvarn. A vu, année après année, les raids solvariens saigner ses terres frontalières — hameaux brûlés, garnisons décimées. Convaincu qu'une guerre ouverte anéantirait son peuple, et que la Coalition, trop lente et trop divisée, n'enverra jamais l'aide nécessaire à temps. Ses négociations visent à obtenir un statut vassal survivable plutôt qu'une destruction certaine — pas une trahison par intérêt personnel. Ranulf se déteste pour ce choix autant qu'il le croit nécessaire ; il n'est l'ennemi de personne, sauf peut-être de lui-même.",
    accroches: [
      "Les PJ interceptent une missive ou escortent un émissaire suspect.",
      "Ranulf sollicite directement les PJ pour \"évaluer discrètement\" une option de repli, sans révéler tout de suite ses vraies intentions.",
      "Confrontation possible avec Tristan d'Aurvel si les deux fils narratifs se croisent.",
    ],
  },
  {
    id: "thelior-vane",
    nom: "Thélior Vane",
    titre: "Ancien Mordanel",
    faction: "Mordanel",
    resume: "Prône la retenue absolue depuis le Silence de Valmoire — la seule voie de survie selon lui.",
    description:
      "Croit que toute réponse armée confirmerait le récit impérial et achèverait de condamner son peuple aux yeux du monde — y compris aux yeux des dryades, dont le retrait silencieux le hante. Pour lui, la seule voie de survie est de prouver, patiemment, l'innocence des Mordanel.",
    accroches: [
      "Un conseil mordanel où les PJ doivent arbitrer ou choisir un camp face à Sylvaine Ithreal.",
      "Une action de Sylvaine (légitime défense ou provocation ?) met Thélior en position politique intenable.",
    ],
  },
  {
    id: "sylvaine-ithreal",
    nom: "Sylvaine Ithreal",
    titre: "Jeune Mordanel",
    faction: "Mordanel",
    resume: "A grandi sous le soupçon — pour elle, la patience des Anciens n'a rien changé.",
    description:
      "Incarnation de la génération qui a grandi sous le soupçon post-Silence de Valmoire. Pour elle, la retenue de Thélior Vane n'a rien changé — les dryades se sont retirées malgré des décennies de patience, l'Empire accuse toujours, alors autant agir. Ne prône pas nécessairement la violence aveugle, mais une affirmation publique et armée de la dignité mordanel, quitte à rompre avec la stratégie des Anciens.",
    accroches: [
      "Un PJ mordanel (si applicable) tiraillé personnellement entre Thélior et Sylvaine.",
      "Une provocation de Sylvaine qui force les PJ à choisir un camp dans la politique interne mordanel.",
    ],
  },
  {
    id: "thrakan-kelgarn",
    nom: "Thrakan Kelgarn",
    titre: "Chef de clan Khazrak Dûm — Résistant",
    faction: "Khazrak Dûm",
    resume: "Trop \"corrompu\" pour les Nains de l'Ordre, trop loyaliste pour les siens — seul entre deux mondes.",
    description:
      "Chef d'un clan Résistant, campé aux abords des Failles Rouges les plus proches de Kaldrun. Refuse l'assimilation plus poussée aux tribus orques que prônent les Évolutionnistes, sans renier l'histoire de son peuple — il espère une réconciliation, même lointaine, avec les Nains de l'Ordre. Méprisé par les deux côtés : trop \"corrompu\" pour les Nains de l'Ordre, trop \"loyaliste\" pour les Évolutionnistes de son propre peuple. Une figure tragique, seule, qui pourrait devenir un allié précieux et improbable pour des PJ qui sauraient voir au-delà des apparences.",
    accroches: [
      "Thrakan cherche un intermédiaire (les PJ ?) pour renouer un contact avec Kaldrun.",
      "Un raid évolutionniste contre son propre clan le force à demander de l'aide à des étrangers plutôt qu'aux siens.",
    ],
  },
  {
    id: "selyne-orwick",
    nom: "Selyne Orwick",
    titre: "Teneuse de comptes du Grand Marché",
    faction: "Comptoir",
    resume: "Discrète et terrifiée à l'idée de perdre sa place, elle tient les vrais livres de comptes d'intermédiaires du Comptoir sans jamais avoir posé de questions.",
    description:
      "Méthodique et effacée, Selyne gère la comptabilité de plusieurs intermédiaires du Comptoir, dont certains liés au réseau de Maître Aurèle Ferrand — sans jamais avoir cherché à savoir ce qu'elle validait. Peut être convaincue de parler contre une garantie de protection, ou contre une somme qu'elle n'oserait jamais réclamer elle-même.",
    accroches: [
      "Peut confirmer ou infirmer des mouvements d'argent suspects si les PJ remontent la piste du médaillon.",
      "Sait qui, chez Ferrand, panique depuis peu — signe qu'un fil se tend ailleurs dans la campagne.",
    ],
  },
  {
    id: "grizzard-ancre",
    nom: "Grizzard « l'Ancre »",
    titre: "Vigie des Docks de Cendre-Claire",
    faction: "Comptoir",
    resume: "Vieux docker balafré qui voit tout ce qui entre et sort du port, et vend ses informations pas cher.",
    description:
      "Plus à sa place sur les quais que n'importe où ailleurs, Grizzard observe le trafic portuaire depuis des décennies. Pas malveillant, juste pragmatique : il vend ses informations contre à boire à la Table Commune.",
    accroches: [
      "Premier à savoir quand une cargaison ou un passager « ne colle pas ».",
      "Source naturelle pour tout hook lié à la contrebande ou à l'espionnage étranger.",
    ],
  },
  {
    id: "aldous-kenrick",
    nom: "Aldous Kenrick",
    titre: "Archiviste du Palais du Serment",
    faction: "Serment de Libris",
    resume: "Passionné et un peu pédant, il garde la charte fondatrice et des décennies d'archives que plus personne ne consulte.",
    description:
      "Aldous connaît des pans entiers de l'histoire de la République que même Vasnal a oubliés. Sa passion pour les archives confine à l'obsession, mais elle en fait une mine d'informations historiques précieuses.",
    accroches: [
      "Peut fournir un document historique perdu, utile pour légitimer une action des PJ devant l'Assemblée.",
      "Inquiet de constater que certains dossiers anciens ont récemment été consultés par quelqu'un — sans savoir qui.",
    ],
  },
  {
    id: "liora-sennett",
    nom: "Liora Sennett",
    titre: "Aide du Consul Vasnal, successeure pressentie",
    faction: "Serment de Libris",
    resume: "Jeune et idéaliste, encore assez naïve pour croire que la charte fondatrice peut suffire à elle seule.",
    description:
      "Vasnal la teste discrètement pour sa succession sans le lui dire ouvertement. Liora porte encore intacte la foi dans les idéaux fondateurs de la République, dans un contexte où de moins en moins de blocs y croient encore vraiment.",
    accroches: [
      "Peut recruter les PJ pour des missions « propres » soutenant le Serment (protéger un témoin, porter un message sensible).",
      "Si les PJ l'aident à réussir, elle gagne en assurance ; si elle échoue, elle pourrait basculer vers le cynisme ambiant.",
    ],
  },
  {
    id: "bram-osgoode",
    nom: "Lieutenant Bram Osgoode",
    titre: "Officier de la Citadelle des Ponts",
    faction: "Garde Citoyenne",
    resume: "Discipliné en apparence, rongé par le doute depuis qu'il a vu le dossier sur le financement solvarien des Fils de Libris.",
    description:
      "Bram a vu le document que Kessing garde confidentiel, et l'ordre de le taire le ronge depuis. Officier loyal jusqu'ici, il commence à se demander si l'obéissance vaut encore quelque chose face à ce qu'il sait.",
    accroches: [
      "Pourrait être la fuite qui rend le document public, si les PJ gagnent sa confiance.",
      "Hook moral : obéir à Kessing ou trahir sa hiérarchie pour ce qu'il croit juste.",
    ],
  },
  {
    id: "yannick-doria",
    nom: "Sergent Yannick Doria",
    titre: "Ancien de la Garde, tient une salle d'armes",
    faction: "Garde Citoyenne",
    resume: "Retraité bourru qui entraîne encore quelques jeunes recrues et connaît tout le monde dans la Garde.",
    description:
      "Yannick a quitté le service actif mais garde un pied dans tous les cercles militaires de Libris, y compris ceux qui en sont partis en mauvais termes. Bon contact pour tout ce qui touche au monde martial de la République.",
    accroches: [
      "Bon contact pour recruter des PNJ mercenaires ou vétérans ponctuels.",
      "Sait qui, dans la Garde, a des sympathies inquiétantes pour les Fils de Libris.",
    ],
  },
  {
    id: "mira-sylvenne",
    nom: "Mira Sylvenne",
    titre: "Guérisseuse du Quartier du Tissage",
    faction: "Cercle des Peuples",
    resume: "Aelindra installée à Libris depuis des années, elle soigne sans distinction et voit la tension monter avant qu'elle n'éclate.",
    description:
      "Figure discrète mais respectée du Quartier du Tissage, Mira est souvent la première à percevoir les signaux faibles d'une escalade — bien avant que l'Assemblée ne s'en préoccupe.",
    accroches: [
      "Première à alerter les PJ si une attaque des Fils de Libris se prépare contre le quartier.",
      "Peut demander une escorte ou une protection en échange de soins ou d'informations sur la communauté.",
    ],
  },
  {
    id: "corin-vashtel",
    nom: "Corin Vashtel",
    titre: "Informateur mordanel en exil",
    faction: "Cercle des Peuples",
    resume: "Méfiant et discret, survivant du Silence de Valmoire, toujours sur le qui-vive.",
    description:
      "Corin garde des contacts dans des réseaux qu'il ne nomme jamais directement. Sa méfiance est le fruit d'une histoire personnelle marquée par le Silence de Valmoire — il ne fait confiance qu'à ceux qui ont fait leurs preuves.",
    accroches: [
      "Peut relier un fil de campagne à des rumeurs venues d'Aetharion ou du reste du continent.",
      "Bon PNJ à débloquer progressivement plutôt qu'à rencontrer d'emblée.",
    ],
  },
  {
    id: "petra-voss",
    nom: "Petra Voss",
    titre: "Ancienne membre repentie des Fils de Libris",
    faction: "Fils de Libris",
    resume: "A quitté le mouvement après avoir vu la violence tourner sérieux, vit cachée par peur d'être reconnue.",
    description:
      "Petra n'était pas une fanatique, juste quelqu'un de ruiné qui cherchait une communauté. Le basculement du mouvement vers la violence l'a poussée à fuir — mais elle sait encore beaucoup de choses sur son fonctionnement interne.",
    accroches: [
      "Informatrice potentielle contre Dessalles, mais seulement si les PJ garantissent sa sécurité.",
      "Hook d'humanité : nuance le mouvement au-delà de la caricature fanatique.",
    ],
  },
  {
    id: "denner-ashcombe",
    nom: "Denner Ashcombe",
    titre: "Petit commerçant sympathisant des Fils de Libris",
    faction: "Fils de Libris",
    resume: "Ruiné par la concurrence des guildes du Comptoir, pas violent, mais assiste aux discours de la Racine Noire faute d'alternative.",
    description:
      "Denner incarne le terreau économique du mouvement plutôt que son extrémisme. Sa colère est réelle et compréhensible, même si elle le pousse vers des cercles dangereux.",
    accroches: [
      "Peut donner aux PJ une vision nuancée du ressentiment des Fils de Libris — utile pour éviter le manichéisme.",
      "Quête possible : lui offrir une vraie alternative économique, pour tester si le mouvement perd du terrain autrement que par la force.",
    ],
  },
  {
    id: "ilsevar-cendreau",
    nom: "Ilsevar Cendreau",
    titre: "Veilleur Suprême de l'Œil de Solmaris",
    faction: "Solvarn",
    secret: true,
    resume: "Chef de l'ordre d'espionnage impérial — un homme sans naissance notable, précisément parce que c'est sa force.",
    description:
      "Ancien intendant sans lignée noble avant sa nomination par l'Empereur Aurelian III, dans les mois de panique suivant la Sécession des quatre maisons. Ilsevar rapporte uniquement à l'Empereur — aucune maison ne peut le réclamer comme un des siens, ni le corrompre par des liens de sang. Officiellement, il porte le titre terne de \"chancelier du Zénith\", poste administratif qui décourage les questions. Le nom \"Cendreau\" n'apparaît sur aucun registre officiel de la cour ; à Solmaris, on le prononce presque jamais à voix haute.\n\nIl cloisonne volontairement ses deux maîtres (Vantrel et Ashevel), qui ignorent l'un de l'autre au-delà du strict nécessaire opérationnel — deux maîtres qui se surveillent mutuellement ne complotent pas contre lui.",
    accroches: [
      "Un PJ remonte accidentellement jusqu'à \"Cendreau\" en tirant un fil administratif anodin — personne à la cour ne veut confirmer que ce nom existe.",
      "Ilsevar recrute discrètement un PJ étranger à la cour (donc incorruptible par les maisons) pour une mission qu'il ne peut confier à ses propres agents.",
      "Le secret personnel d'Aurelian III (l'Aube silencieuse) et l'existence de l'Œil pourraient un jour se recouper si un PJ tire sur les deux fils à la fois.",
    ],
  },
  {
    id: "isaure-vantrel",
    nom: "Dame Isaure Vantrel",
    titre: "Maître du Regard Intérieur",
    faction: "Solvarn",
    secret: true,
    resume: "Ancienne confesseure de la foi solaire — surveille les quatre maisons loyalistes de l'intérieur, sans jamais rien écrire.",
    description:
      "Choisie par Ilsevar pour sa maîtrise du protocole religieux : c'est elle qui décide quand une accusation de corruption par le Chaos devient \"utile\" plutôt que prématurée — arme politique redoutable dans un monde où le Sang divin humain est intrinsèquement sujet au Chaos, une dénonciation bien placée suffisant à briser une lignée sans procès public. Froide, méthodique, elle tient un registre mental plutôt qu'écrit des secrets des quatre maisons loyalistes (Ashe, Solenne, Vosgard, Kestrel) — elle ne fait jamais confiance au papier.\n\nSa couverture : dame de compagnie itinérante, reçue tour à tour dans les quatre foyers nobles sous prétexte de piété partagée. Personne ne s'étonne de sa présence ; personne ne se souvient exactement quand elle est arrivée pour la première fois.",
    accroches: [
      "Une maison loyaliste (au choix du MJ) découvre une fuite impossible à expliquer autrement que par un espion interne — les PJ enquêtent sans savoir qu'ils cherchent Vantrel.",
      "Vantrel envisage d'utiliser l'accusation de corruption par le Chaos contre un PNJ que les PJ protègent — dilemme moral si elle les approche pour \"confirmer\" des soupçons.",
      "Sa rivalité feutrée avec Corentin Ashevel (elle juge son terrain \"romantisme de mercenaire\") peut se jouer devant des PJ témoins sans qu'ils comprennent l'enjeu.",
    ],
  },
  {
    id: "corentin-ashevel",
    nom: "Corentin Ashevel",
    titre: "Maître du Regard Lointain",
    faction: "Solvarn",
    secret: true,
    resume: "Ancien marchand de la maison Ashe reconverti en espion — opère sur le front d'Aetharion et jusqu'à Libris même.",
    description:
      "Ancien marchand affilié à la maison Ashe (le nom \"Ashevel\" laisse planer une ambiguïté sur un lien de sang réel, jamais confirmée — lui-même l'entretient), reconverti en agent de la couronne après avoir monté un réseau commercial légitime le long du front d'Aetharion. Contrairement à Vantrel, il aime le risque et le contact direct : il a lui-même posé le pied à Libris sous couverture diplomatique. Exploite les liens de sang entre maisons loyalistes et leurs miroirs sécessionnistes (Ashe/Valdorne notamment) — cousins et anciens serments deviennent des sources précieuses côté Coalisés.\n\nRivalité feutrée avec Vantrel, qu'il juge \"paranoïa de cour\" — tension qu'Ilsevar cultive délibérément.",
    accroches: [
      "Les PJ croisent un marchand solvarien trop bien informé sur le front d'Aetharion ou sur Libris — Ashevel sous couverture.",
      "Un contact d'Ashevel côté Coalisés (cousin d'une maison sécessionniste) est démasqué : les PJ peuvent le sauver, l'exploiter, ou le voir liquidé par l'Œil lui-même.",
      "Cellule dédiée à Liberra jugée dangereuse non par la force militaire mais par contagion idéologique (mélange des races, République) — terrain naturel de recoupement avec le Comptoir/Aurèle Ferrand (Scénario 0).",
    ],
  },
  {
    id: "minerva-sarelle",
    nom: "Minerva Sarelle",
    titre: "Ancienne mage attitrée de la couronne de Valdorne (assassinée)",
    faction: "Valdorne",
    resume: "Conseillère arcanique du Roi pendant des décennies, morte dans des circonstances qu'elle seule aurait pu expliquer.",
    description:
      "Retrouvée morte il y a quelques mois dans sa tour d'étude à Valdcourt — la version officielle parle d'une défaillance rituelle, un accident regrettable mais plausible pour une mage de son âge manipulant des forces puissantes. En réalité, assassinée par un agent solvarien, probablement pour l'empêcher de terminer une recherche ou de transmettre une information à la couronne. Seule une poignée de personnes soupçonne la vérité ; personne ne peut encore la prouver. Le Roi Baldwin IV lui-même ignore tout du meurtre — il pleure une amie perdue à un mauvais moment, pas une victime de guerre.",
    accroches: [
      "Les PJ tombent sur un indice contredisant la thèse de l'accident (une trace de magie étrangère, un témoin disparu depuis).",
      "Un ancien apprenti ou familier de Minerva cherche des enquêteurs discrets, hors des canaux officiels de la couronne.",
      "La vérité, si elle éclate, pourrait autant galvaniser Valdorne contre Solvarn que fragiliser la confiance de Baldwin envers ses propres services de renseignement, qui n'ont rien vu venir.",
    ],
  },
  {
    id: "aldous-ferren",
    nom: "Aldous Ferren",
    titre: "Mage attitré de la cour d'Arveth",
    faction: "Arveth",
    resume: "Un des derniers praticiens de la foi libre des Gardiens encore toléré à la cour d'Arvenfall — de plus en plus seul.",
    description:
      "Pratique une magie ancrée dans la vénération sincère des Gardiens, à mesure que le culte solvarien s'infiltre discrètement dans les temples d'Arveth (cf. panthéon/religions). N'a jamais pris parti publiquement sur les négociations secrètes de Lord Ranulf, mais les deux sujets se rejoignent dans son esprit : céder à Solvarn militairement, c'est aussi, tôt ou tard, céder religieusement. Regardé avec une méfiance croissante par une partie du clergé infiltré, sans que personne n'ose encore l'accuser ouvertement.",
    accroches: [
      "Aldous cherche discrètement des alliés extérieurs pour documenter l'infiltration solvarienne dans les temples avant qu'elle ne devienne irréversible.",
      "Confrontation feutrée possible avec un prêtre récemment \"converti\" à une lecture plus orthodoxe (solvarienne) de la foi des Gardiens.",
      "Aldous pourrait être la première personne à qui Ranulf se confie vraiment, si les PJ gagnent sa confiance.",
    ],
  },
  {
    id: "corvina-aldren",
    nom: "Corvina Aldren",
    titre: "Mage attitrée de la cour de Mornac",
    faction: "Mornac",
    resume: "Magie de route commerciale et de divination au service de la Comtesse — et, à l'occasion, d'opérations moins avouables.",
    description:
      "Officiellement chargée de garantir la sécurité magique des routes commerciales et convois de Mornac (divination, protection contre le mauvais temps et la piraterie). Officieusement, l'instrument discret de la Comtesse Yselde Maren dans sa volonté de déstabiliser la guilde marchande grandissante de la République de Liberra — sabotages déguisés en accidents, informations glanées par divination et revendues ou exploitées contre les intérêts de la guilde. Ne se voit pas comme une comploteuse : à ses yeux, elle défend simplement les intérêts de Mornac contre un concurrent qui grandit trop vite.",
    accroches: [
      "Un \"accident\" suspect frappe un navire ou un entrepôt lié au Comptoir (bloc marchand de Liberra) — les PJ pourraient être engagés pour enquêter des deux côtés sans le savoir.",
      "Si le fil du complot de guilde du Scénario 0 (Maître Aurèle Ferrand, le médaillon) est déjà en cours, Corvina peut devenir une piste parallèle ou un point de convergence inattendu, à la discrétion du MJ — les deux fils ne sont pas fondus en un seul complot unique.",
      "La Comtesse Yselde Maren pourrait désavouer Corvina publiquement si l'opération est découverte, tout en la protégeant en coulisses.",
    ],
  },
  {
    id: "kettil-rhennar",
    nom: "Kettil Rhennar",
    titre: "Enchanteur de la cour de Serval, maître-artisan",
    faction: "Serval",
    resume: "Travaille main dans la main avec les maîtres-forgerons nains de Kaldrun — gardien discret de l'avance technologique de Serval.",
    description:
      "Formé aux côtés des Nains de l'Ordre, Kettil a contribué à développer des techniques de forge et d'enchantement inédites hors des terres naines — Serval est aujourd'hui en avance sur le reste des Royaumes Coalisés, et probablement sur l'Empire, en métallurgie et développement d'armes. Cette avance, jalousement gardée par le Margrave Torvald Sten, fait de Kettil une cible de choix pour l'espionnage étranger. En jeu, Kettil (ou un artisan formé par lui) peut servir de PNJ de référence pour un maître ou grand maître artisan d'enchantement de haut niveau (cf. système d'enchantement d'arme, `js/enchantement.js` — aucune modification de code ici, référence narrative uniquement).",
    accroches: [
      "Une puissance étrangère (Solvarn, ou une guilde de Mornac en délicatesse avec Serval) tente de débaucher ou d'espionner Kettil.",
      "Les PJ pourraient avoir besoin de ses services pour un enchantement de très haut niveau (+4/+5), difficilement accessible ailleurs.",
      "La frange isolationniste de la noblesse servaline voudrait que ce savoir-faire reste strictement interne — Kettil, plus ouvert, entre parfois en friction avec eux.",
    ],
  },
];

/* ============================================================
   FACTIONS (page "Lore" > onglet "Factions")
   Un groupe = un camp politique (Empire, République...), chacun avec ses
   entités internes (maisons/blocs) et une synthèse des rapports de force.
   ============================================================ */
const FACTIONS = [
  {
    groupe: "Empire de Solvarn",
    // Blason national, distinct des 4 blasons de maison (Ashe/Solenne/
    // Vosgard/Kestrel, cf. leurs description ci-dessous) — cf.
    // assets/blasons/README.md.
    blason: "assets/blasons/blason_solvarn.png",
    intro:
      "Quatre grandes maisons ont fait sécession lors de la Rupture pour fonder les Royaumes Coalisés (Valdorne, Arveth, Mornac, Serval). Quatre autres sont restées fidèles au trône de Solmaris. Narrativement, huit maisons issues du même Premier Empire — quatre qui ont trahi, quatre qui ont tenu bon, chacune des loyalistes reflétant, sous une forme corrompue par la doctrine impériale, la vertu qui a poussé son miroir sécessionniste à partir.\n\nBlason impérial — antérieur aux attributs de chaque maison (lames, flamme, balance, faucon), qui n'en sont que des déclinaisons. Devise inscrite sous le trône de Solmaris : « La pureté est le seul rempart. »",
    entites: [
      {
        nom: "Maison Ashe — Le Glaive",
        devise: "Un ordre, une lame.",
        blason: "assets/blasons/blason_ashe.png",
        description:
          "Chef actuel : Grand Maréchal Théodren Ashe, arrière-petit-fils du Haut-Maréchal Corvain Ashe (Siège de Mornhaven). Rigide, incorruptible en apparence — use la doctrine de son aïeul comme un dogme figé plutôt qu'une conviction vivante.\nBlason : soleil noir sur bronze, deux lames croisées. Commande l'armée impériale régulière, forme les officiers, supervise (sans les diriger) les Chevaliers-Inquisiteurs.\nFracture interne : son fils cadet Ilyan Ashe doute depuis Mornhaven — pas de la cause, de la méthode — et a été écarté du commandement plutôt que réduit au silence publiquement.\nMiroir : Valdorne, la chevalerie sincère devenue discipline totale.",
      },
      {
        nom: "Maison Solenne — La Flamme",
        devise: "La lumière ne négocie pas.",
        blason: "assets/blasons/blason_solenne.png",
        description:
          "Cheffe actuelle : Grande Sacerdotesse Yvelle Solenne, charismatique, absolument sincère dans sa foi — ce qui la rend plus dangereuse qu'une cynique.\nBlason : flamme dorée à sept pointes sur pourpre. Tient le Temple-Mère, légitime la lignée impériale, supervise doctrinalement les Chevaliers-Inquisiteurs.\nFracture interne : les \"Cendres Blanches\", faction jeune du clergé, prônent une purification encore plus radicale — tolérées comme bras armé idéologique, elles commencent à échapper à son contrôle.\nMiroir : aucun miroir sécessionniste direct — Solenne est le cœur idéologique de l'Empire.",
      },
      {
        nom: "Maison Vosgard — La Bourse",
        devise: "Ce qui se compte, se gouverne.",
        blason: "assets/blasons/blason_vosgard.png",
        description:
          "Chef actuel : Intendant Général Bastian Vosgard, administrateur brillant, sans conviction religieuse réelle.\nBlason : balance dorée sur gris-bleu. Trésorerie impériale, impôts provinciaux, logistique militaire — Ashe dépend de lui autant que de ses propres officiers.\nFracture interne : certains agents Vosgard vendent des renseignements économiques à Mornac, par intérêt commercial plus que par trahison idéologique.\nMiroir : Mornac, le pragmatisme marchand devenu corruption structurelle.",
      },
      {
        nom: "Maison Kestrel — Les Marches",
        devise: "La peur tient mieux qu'un traité.",
        blason: "assets/blasons/blason_kestrel.png",
        description:
          "Cheffe actuelle : Margravine Sélène Kestrel, dure, pragmatique, façonnée par des décennies de guerre frontalière contre Aetharion et les passes disputées avec Khazrak Dûm.\nBlason : faucon gris plongeant sur blanc glacé. Défend les Marches orientales, gère les garnisons frontalières et un réseau d'éclaireurs au-delà des lignes.\nFracture interne : maquille ses rapports envoyés à Ashe pour cacher l'épuisement réel de ses garnisons sous-équipées.\nMiroir : Serval, même géographie montagnarde, logique opposée (alliance vs domination par la peur).",
      },
    ],
    synthese:
      "Rapports de force à la cour de Solmaris (contexte : guerre ouverte contre Aetharion, siège naval sans percée depuis 3 ans)\n\n1. Ashe — ascendante : l'armée est incontournable en temps de guerre, mais dépend entièrement de Vosgard pour le financement.\n2. Solenne — le levier silencieux : légitimité rituelle de l'Empereur, mais les Cendres Blanches échappent peu à peu à son contrôle.\n3. Vosgard — indispensable et méprisée : pouvoir structurel jamais honoré en public.\n4. Kestrel — puissante localement, marginale à la cour : isolée politiquement, dépend de renforts qui n'arrivent jamais vraiment.\n\nAxes de tension : Ashe ↔ Solenne (rivalité froide pour l'oreille de l'Empereur) ; Ashe ↔ Vosgard (dépendance forcée sans confiance) ; Solenne ↔ Vosgard (méfiance doctrinale, l'argent sent l'hérésie pragmatique) ; Kestrel isolée, traitée en subalterne par Ashe.\n\nCe qui pourrait faire basculer l'équilibre : l'aboutissement des négociations secrètes Arveth–Solvarn libérerait des troupes pour Aetharion et renforcerait Ashe ; une dérive incontrôlée des Cendres Blanches forcerait l'Empereur à trancher entre les maisons ; la révélation de la corruption Vosgard–Mornac pourrait pousser Ashe et Solenne à une alliance ponctuelle inédite ; la chute d'une garnison Kestrel faute de renfort exposerait publiquement le mensonge de ses rapports.",
  },
  {
    groupe: "Royaumes Coalisés",
    intro:
      "Contrairement à l'Empire (un trône, huit maisons) ou à la République (une Assemblée fracturée en blocs), les Royaumes Coalisés ne partagent qu'une alliance militaire née de la Rupture, jamais une couronne commune — quatre royaumes féodaux indépendants (Seigneurs → Chevaliers → Paysans), liés par l'Armistice des Quatre Sceaux et par la nécessité de tenir face à Solvarn plus que par une identité partagée. L'idéal chevaleresque affiché en public cohabite, à des degrés variables selon le royaume, avec un pragmatisme politique que la Coalition préfère ne pas trop regarder en face.",
    entites: [
      {
        nom: "Valdorne — le berceau sincère",
        devise: "Un seul suffit.",
        blason: "assets/blasons/blason_valdorne.png",
        description:
          "Souverain actuel : Roi Baldwin IV de Valdorne, porte l'héritage d'Alaric comme une conviction vivante, pas un folklore — capitale Valdcourt.\nBlason : un pont brisé surmonté d'une épée dressée, sur azur — écho direct à Pont-Rompu.\nMage attitrée : Minerva Sarelle, conseillère arcanique de la couronne pendant des décennies, morte récemment — officiellement d'une \"défaillance rituelle\", en réalité assassinée par un agent solvarien. Un secret que seule une poignée de personnes soupçonne, que personne ne peut prouver, et que Baldwin lui-même ignore (cf. PNJ clés).\nFracture interne : plus la realpolitik gagne du terrain ailleurs dans la Coalition (Arveth en tête), plus Baldwin s'isole dans un idéalisme que certains courtisans jugent naïf face à la menace réelle — et il vient de perdre, sans le savoir, son conseil arcanique le plus fiable au pire moment possible.\nMiroir : la maison Ashe de Solvarn, la même chevalerie sincère devenue discipline totale sous la doctrine impériale.",
      },
      {
        nom: "Arveth — le vacillant",
        devise: "Nous tenons la ligne.",
        blason: "assets/blasons/blason_arveth.png",
        description:
          "Seigneur actuel : Lord Ranulf d'Arvenfall (cf. PNJ clés), négocie en secret avec Solvarn par peur sincère pour son peuple plus que par ambition — capitale Arvenfall, frontière directe avec l'Empire.\nBlason : une flamme vacillante entre deux lances croisées, sur fond cendré.\nMage attitré : Aldous Ferren, un des derniers praticiens de la foi libre des Gardiens encore toléré à la cour — de plus en plus regardé de travers par le culte solvarien qui s'infiltre dans les temples d'Arveth, tension religieuse qui se superpose à la tension politique du palais (cf. PNJ clés).\nFracture interne : le culte solvarien s'infiltre déjà dans ses temples — si Arveth bascule religieusement avant de basculer militairement, la Coalition perd son ciment moral avant même sa force armée.\nMiroir : aucun miroir loyaliste direct côté Solvarn — Arveth est le seul royaume dont le retour dans le giron impérial reste une possibilité concrète plutôt qu'une trahison de principe.",
      },
      {
        nom: "Mornac — le pragmatique",
        devise: "Le vent tourne, le profit reste.",
        blason: "assets/blasons/blason_mornac.png",
        description:
          "Souveraine actuelle : Comtesse Yselde Maren, dynastie marchande devenue dynastie régnante après le Siège de Mornhaven — la chevalerie y est un décorum de cour plus qu'une conviction — capitale Mornhaven, traversée par la Lisdane.\nBlason : une ancre couronnée sur des vagues, sur vert-de-mer.\nMage attitrée : Corvina Aldren, magie de route commerciale et de divination — instrument discret, à l'occasion, d'opérations moins avouables (cf. PNJ clés).\nFracture interne : Mornac a déjà des intérêts implantés dans la République de Liberra, mais voit d'un mauvais œil la flotte marchande grandissante de la République et cherche activement à déstabiliser sa guilde marchande — un fil qui pourrait recouper, sans s'y réduire, le complot de guilde déjà en germe côté Liberra (Le Comptoir, Maître Aurèle Ferrand, le médaillon). Commerce ouvertement avec Liberra et, discrètement, avec Solvarn si le prix est bon — pratique tolérée tant qu'elle finance la Coalition, mais qui deviendrait un scandale politique si rendue publique en pleine guerre.\nMiroir : la maison Vosgard de Solvarn, le même pragmatisme marchand devenu corruption structurelle sous la discipline impériale.",
      },
      {
        nom: "Serval — l'indépendant",
        devise: "La roche encaisse mais ne se brise pas.",
        blason: "assets/blasons/blason_serval.png",
        description:
          "Margrave actuel : Torvald Sten, montagnard austère, doit sa légitimité autant à l'alliance avec les Nains de l'Ordre qu'à son sang — capitale Serval, dans les Contreforts.\nBlason : une enclume sur un pic montagneux, sur gris-pierre.\nMage attitré : Kettil Rhennar, Enchanteur qui travaille main dans la main avec les maîtres-forgerons nains — au contact étroit des Nains de l'Ordre, Serval a développé des techniques de forge inédites hors des terres naines, en avance sur le reste des Royaumes (et probablement sur l'Empire) en métallurgie et développement d'armes. Rhennar en est le gardien discret (cf. PNJ clés).\nFracture interne : une frange jeune de la noblesse servaline pousse pour un désengagement pur et simple de la Coalition — \"nous tenons nos propres cols, pourquoi mourir pour Arvenfall ?\" — tension que Torvald contient pour l'instant par autorité personnelle plus que par consensus. Cette avance technologique jalousement gardée est autant un atout stratégique qu'une source de convoitise étrangère.\nMiroir : la maison Kestrel de Solvarn, même géographie montagnarde, logique inversée — alliance loyale face à la peur plutôt que domination par la peur.",
      },
    ],
    synthese:
      "Rapports de force au sein de la Coalition (contexte : pression croissante de Solvarn sur la frontière d'Arveth)\n\n1. Valdorne — autorité morale, faiblesse militaire relative : Baldwin est écouté par respect pour l'héritage d'Alaric, mais Valdorne n'a plus la puissance martiale de ses origines, et vient de perdre son conseil arcanique sans même le savoir.\n2. Mornac — poumon financier de la Coalition : sans son commerce (et ses compromissions), l'effort de guerre s'effondre — position similaire à celle du Comptoir côté Liberra, avec ses propres jeux d'influence à l'extérieur de la Coalition.\n3. Serval — allié fiable mais à la loyauté de plus en plus conditionnelle : la frange isolationniste grandit à mesure que la guerre s'éternise sans bénéfice direct pour les cols, malgré (ou à cause de) son avance technologique qui lui donne les moyens de son indépendance.\n4. Arveth — le maillon fragile assumé : chacun sait qu'Arveth plie sous la pression, personne n'ose encore l'admettre publiquement.\n\nAxes de tension : Valdorne ↔ Mornac (l'idéal chevaleresque méprise ouvertement, mais dépend financièrement, du pragmatisme marchand) ; Serval ↔ Arveth (indifférence mutuelle : Serval, isolé dans ses montagnes et sa forge, ne comprend pas l'urgence d'Arveth, qui le lui reproche) ; Mornac ↔ Arveth (Mornac verrait presque d'un bon œil un accord Arveth-Solvarn qui stabiliserait les routes commerciales, tant que ça ne devient pas un précédent) ; tous ↔ Solvarn (unité de façade qui masque des intérêts de plus en plus divergents à mesure que la guerre dure).\n\nCe qui pourrait faire basculer l'équilibre : la révélation publique des négociations de Ranulf forcerait un choix binaire — expulser Arveth ou le couvrir, les deux options fracturant la Coalition ; une défection ouverte de la frange isolationniste servaline priverait la Coalition de son flanc montagnard et de son avance en armement ; la découverte de l'assassinat de Minerva Sarelle (et de son commanditaire solvarien) pourrait autant unir Valdorne dans la colère que le déstabiliser s'il révèle que Baldwin l'ignorait ; un scandale sur le commerce Mornac-Solvarn, ou sur le sabotage de la guilde marchande de Liberra, au pire moment de la guerre pourrait forcer une purge politique à Mornhaven.",
  },
  {
    groupe: "République de Liberra",
    // Sceau d'État illustré, cf. assets/blasons/README.md pour la convention
    // de nommage — absent tant que le fichier n'a pas été déposé (repli
    // silencieux côté rendreFactions(), pas d'icône cassée). D'autres
    // factions pourront porter leur propre blason de la même façon.
    blason: "assets/blasons/blason_liberra.png",
    intro:
      "Contrairement à l'Empire, la République ne repose pas sur une noblesse mais sur une Assemblée de citoyens divisée en cinq blocs politiques, reflétant fidèlement ses fractures internes déjà connues : marchands, idéalistes, militaires, communautés non-humaines — auxquelles s'ajoute un cinquième bloc né du ressentiment, les Fils de Libris.\n\nDevise inscrite au fronton de l'Assemblée fondatrice : « La liberté ne s'hérite pas, elle se gagne. » Rarement brandi avec fierté unanime — chaque bloc préfère son propre insigne — le sceau d'État n'apparaît que sur les actes officiels, les frontières et la monnaie.",
    entites: [
      {
        nom: "Le Comptoir — bloc marchand",
        devise: "Le fleuve ne choisit pas ses passagers.",
        description:
          "Figure de proue : Consule Ilsabet Draeven, ancienne capitaine de commerce fluvial, pragmatique jusqu'à l'os.\nInsigne : écharpe bleu-marine, sceau d'une balance posée sur une vague. Contrôle les routes commerciales de la Lisdane et les ports, finance une bonne partie du budget de l'Assemblée par les taxes portuaires.\nFracture/hook : des guildes affiliées au Comptoir opèrent en sous-main jusque dans les provinces frontalières — le complot de guilde du Scénario 0 (Maître Aurèle Ferrand, le médaillon) est une ramification directe de ce bloc. Draeven ignore-t-elle vraiment ce que font ses guildes les plus zélées, ou ferme-t-elle les yeux tant que l'or rentre ?",
      },
      {
        nom: "Le Serment de Libris — bloc idéaliste",
        devise: "Ce que nous avons juré, nous le tiendrons.",
        description:
          "Figure de proue : Consul Emeric Vasnal, vieillissant, l'un des derniers signataires encore vivants de la charte fondatrice.\nInsigne : écharpe blanche, sceau d'une plume sur un livre ouvert. Faible en moyens concrets, fort en légitimité morale.\nFracture/hook : en perte de vitesse face aux blocs pragmatiques ; Vasnal cherche un successeur charismatique avant que le Serment ne devienne une relique symbolique sans pouvoir réel.",
      },
      {
        nom: "La Garde Citoyenne — bloc militaire",
        devise: "La liberté se défend, elle ne se proclame pas.",
        description:
          "Figure de proue : Général-Consul Rohar Kessing, ancien officier de terrain, discipline avant tout.\nInsigne : écharpe grise, sceau d'un bouclier croisé de deux lances. Contrôle la milice et la défense des frontières orientales — poids grandissant à mesure que la pression de Solvarn et les raids venus des Failles Rouges s'intensifient.\nFracture/hook : certains officiers murmurent qu'une République sans hiérarchie forte ne survivra pas à une vraie guerre — tentation autoritaire qui inquiète le Serment de Libris.",
      },
      {
        nom: "Le Cercle des Peuples — bloc communautés non-humaines",
        devise: "Admis n'est pas égal.",
        description:
          "Figure de proue : Conseillère Ythel Aelindra (majorité sylvaine), épaulée par une minorité mordanel en exil.\nInsigne : écharpe verte, sceau d'une feuille entrelacée à une main. Représentation officielle garantie par la charte, mais poids réel disproportionnellement faible face aux sièges humains.\nFracture/hook : pousse pour une réforme de représentation proportionnelle, combattue frontalement par les Fils de Libris — point de friction central de l'Assemblée.",
      },
      {
        nom: "Les Fils de Libris — bloc suprémaciste",
        devise: "Libris pour ceux qui l'ont bâtie.",
        description:
          "Figure de proue : Tribun Corwan Dessalles, orateur populiste, ancien petit commerçant ruiné par la concurrence des guildes du Comptoir.\nInsigne : écharpe rouge sombre, sceau d'un poing fermé sur une racine. Né du ressentiment économique et de la peur post-Silence de Valmoire — recrute chez les laissés-pour-compte du miracle marchand de la République.\nFracture/hook : ironie centrale, ce bloc reproduit, sans se l'avouer, la rhétorique de pureté de Solvarn — l'ennemi même que la Sécession voulait fuir. Certains soupçonnent, sans preuve, des financements discrets venus de l'Empire pour déstabiliser la République de l'intérieur. Un attentat ou une manifestation des Fils de Libris pourrait forcer les quatre autres blocs à une alliance de circonstance qu'ils détestent tous.",
      },
    ],
    synthese:
      "Rapports de force à l'Assemblée de Libris\n\n1. Le Comptoir — dominant : finance une bonne partie du budget de l'Assemblée, personne ne peut gouverner longtemps contre lui sans risquer la paralysie budgétaire.\n2. La Garde Citoyenne — en ascension rapide : la pression de Solvarn et les raids des Failles Rouges la rendent de plus en plus indispensable, et écoutée au-delà de son mandat strictement défensif.\n3. Les Fils de Libris — influence disproportionnée à son nombre réel de sièges : mobilisation de rue efficace, plus inquiétante que son poids électoral.\n4. Le Serment de Libris — autorité morale déclinante : peut encore mobiliser l'opinion en invoquant la charte fondatrice, mais de moins en moins de leviers concrets.\n5. Le Cercle des Peuples — représentation garantie, pouvoir réel le plus faible : sièges officiels sans poids proportionnel face aux blocs humains.\n\nAxes de tension : Comptoir ↔ Garde Citoyenne (alliance transactionnelle tendue sur les priorités budgétaires) ; Cercle des Peuples ↔ Fils de Libris (collision frontale et publique sur la représentation proportionnelle) ; Serment ↔ Cercle des Peuples (alliés idéologiques naturels mais sans moyens réels) ; Comptoir ↔ Fils de Libris (tension cachée — les guildes du Comptoir sont la cause économique directe du ressentiment qui nourrit les Fils) ; Garde Citoyenne ↔ Fils de Libris (flirt dangereux et non assumé entre discipline militaire et rhétorique d'ordre).\n\nCe qui pourrait faire basculer l'équilibre : la preuve d'un financement de Solvarn aux Fils de Libris unirait instantanément les quatre autres blocs contre eux ; un successeur charismatique pour Vasnal redonnerait du poids réel au Serment ; une trop grande montée en puissance de la Garde Citoyenne ferait craindre une dérive autoritaire ; l'issue de la réforme de représentation proportionnelle déterminerait si le Cercle des Peuples s'intègre durablement ou si les Fils de Libris gagnent un argument de recrutement supplémentaire.",
  },
];

/* ============================================================
   RÈGLES GÉNÉRALES (page "Règles" > onglet "Général")
   Même format que LORE.sections ({ titre, contenu }) — rendu par
   js/app.js (rendreReglesGeneral), rien à dupliquer ailleurs.
   ============================================================ */
const REGLES_GENERALES = [
  {
    titre: "Les jets de dé",
    contenu:
      "Tout test = 1d20 + modificateur pertinent, contre un seuil de difficulté ou en opposition. Réussite critique sur 20 naturel, échec critique sur 1 naturel. Avantage = 2d20, garder le plus haut. Désavantage = 2d20, garder le plus bas.",
  },
  {
    titre: "Attaque",
    contenu:
      "Jet = 1d20 + bonus d'attaque (caractéristique + bonus de classe/niveau + bonus de voie éventuel) contre la DEF de la cible. Le bonus de classe/niveau s'applique uniquement au jet, jamais aux dégâts : Martial (Guerrier, Chevalier, Chasseur) +1 tous les 2 niveaux ; Hybride (Prêtre, Druide, Barde, Moine) +1 tous les 2 niveaux ; Lanceur (Magicien, Nécromancien, Enchanteur) +1 tous les 3 niveaux.",
  },
  {
    titre: "Dégâts",
    contenu:
      "Formule fixe de l'arme/capacité + modificateur de caractéristique. Les dégâts n'augmentent pas avec le niveau — seulement via les voies ou l'enchantement (+X fixe au dégât, jamais au jet d'attaque, plafond +5).",
  },
  {
    titre: "Combat à deux armes",
    contenu:
      "Équiper une arme à une main dans chaque main (sans bouclier) est possible, mais sans le don Ambidextre, chaque attaque avec ces armes utilise la formule 1d20 + Mod.FOR - 4 au lieu du bonus d'attaque habituel du personnage. Le don Ambidextre réduit ce malus à -2. Le don Maître d'armes doubles retire ce malus restant et autorise en plus une arme de catégorie longue en main secondaire (normalement réservée aux armes courtes). Cette règle générique est indépendante des capacités de Voie qui accordent leurs propres attaques supplémentaires (ex. « Enchaînement » du Barde, Voie de l'escrime rang 4).",
  },
  {
    titre: "Dons (niveaux 4, 8 et 12)",
    html: true,
    contenu:
      `<p>Aux niveaux 4, 8 et 12 (soit 1, 2 et 3 voies de classe complètes, cf. pointsVoieTotal), chaque personnage obtient un Don gratuit au choix parmi la liste ci-dessous, en plus des points de voie habituels — aucune réduction de ceux-ci. Un personnage déjà à ces niveaux avant l'introduction de cette règle peut rattraper ses Dons manquants depuis sa fiche. Les Dons sont des bonus descriptifs, appliqués manuellement par le joueur en jeu, comme les effets d'accessoires ou les capacités textuelles — aucune automatisation de calcul de dégâts/DEF.</p>
      <div class="tableau-regle-scroll"><table class="tableau-regle">
        <thead><tr><th>Catégorie</th><th>Don</th><th>Effet</th></tr></thead>
        <tbody>
          <tr><td rowspan="7">Combat</td><td>Frappe puissante</td><td>Arme deux_mains : -2 attaque / +4 dégâts au choix</td></tr>
          <tr><td>Tir de précision</td><td>Arme à distance : -2 attaque / +4 dégâts, ignore couverture partielle</td></tr>
          <tr><td>Combattant en duel</td><td>Arme unique, main libre, un seul adversaire adjacent : +2 DEF</td></tr>
          <tr><td>Ambidextre</td><td>Permet deux armes à une main, malus de combat à deux armes réduit à -2</td></tr>
          <tr><td>Maître d'armes doubles</td><td>Retire ce malus, autorise une arme longue en main secondaire</td></tr>
          <tr><td>Expert en hast</td><td>Arme deux_mains à allonge : +1 dégâts, attaque d'opportunité bonus au contact</td></tr>
          <tr><td>Sentinelle</td><td>Attaque d'opportunité même sur retrait organisé, réduit le déplacement de la cible à 0</td></tr>
          <tr><td rowspan="4">Défense</td><td>Robuste</td><td>+2 PV par niveau, rétroactif</td></tr>
          <tr><td>Maître des armures moyennes</td><td>ValeurArmure 3-4 : aucun malus de Discrétion, plafond DEX +3</td></tr>
          <tr><td>Maître des armures lourdes</td><td>ValeurArmure 5+ : -3 dégâts physiques subis avant valeurArmure</td></tr>
          <tr><td>Expert du bouclier</td><td>Bouclier équipé : +2 Réflexes, 1x/tour réduit de moitié des dégâts subis</td></tr>
          <tr><td>Perception</td><td>Alerte</td><td>+5 Initiative, jamais surpris</td></tr>
          <tr><td>Mobilité</td><td>Mobile</td><td>+1 case de déplacement, ignore terrain difficile après avoir attaqué au contact, jamais d'attaque d'opportunité en s'éloignant d'une cible frappée</td></tr>
          <tr><td rowspan="2">Exploration</td><td>Fouilleur de donjon</td><td>Avantage Perception sur pièges et passages secrets</td></tr>
          <tr><td>Athlète</td><td>+1 FOR ou DEX au choix, aucun malus au premier mètre d'escalade/saut/nage</td></tr>
          <tr><td rowspan="2">Social</td><td>Doué</td><td>+1 CHA en conversation hors combat</td></tr>
          <tr><td>Acteur</td><td>Avantage CHA imitation/tromperie, peut imiter une voix entendue</td></tr>
          <tr><td>Magie</td><td>Initié aux arcanes</td><td>Apprend le rang 1 d'une Voie d'une autre classe, plafonné à ce rang</td></tr>
          <tr><td>Utilitaire</td><td>Chanceux</td><td>3 points de chance/jour, relance un jet raté ou impose la relance d'un jet ennemi réussi</td></tr>
          <tr><td>Caractéristique</td><td>Amélioration de caractéristique</td><td>+1 à deux caractéristiques, plafond 18, ou 20 pour l'affinité raciale (Elfe INT/DEX, Nain/Demi-orc CON/FOR, Demi-gobelin DEX/INT)</td></tr>
        </tbody>
      </table></div>`,
  },
  {
    titre: "Défense et initiative",
    contenu:
      "DEF : caractéristique fixe du personnage/monstre, modifiée par l'armure, les capacités et les états actifs (ex. Renversée -4 DEF, Gelée -2 DEF, Déstabilisée -2 DEF). Une attaque touche si le jet égale ou dépasse la DEF.\nInitiative : 1d20 + modificateur d'initiative en début de combat, détermine l'ordre des tours. Les monstres la lancent automatiquement, les joueurs cliquent pour lancer la leur.",
  },
  {
    titre: "Mort et stabilisation",
    contenu:
      "Un joueur qui tombe à 0 PV entre en état Mourant(e) — il garde son tour, mais ne peut ni agir ni se déplacer : à la place, il lance un jet de mort (1d20, 11+ = succès). 3 succès stabilisent à 1 PV (debout, agit normalement au tour suivant) ; 3 échecs cumulés entraînent la mort (etatMort), qui saute définitivement son tour. Tant que le compteur n'a pas atteint 3 d'un côté ou de l'autre, les jets continuent tour après tour.\n\nUn allié peut aussi stabiliser un Mourant(e) — ou remettre debout un allié simplement Renversé (ex. tombé par glissade) — via la compétence « Relever un allié » (action principale, aucun jet requis, réussite automatique). Sur un Mourant(e), le ramène immédiatement à 1 PV debout ; sur un Renversé(e), retire l'état sans autre effet.\n\nToute blessure qui remonte les PV au-dessus de 0 (soin, potion...) annule le jet de mort en cours, quel que soit le nombre de succès/échecs déjà accumulés.",
  },
  {
    titre: "Enchantement à risque (Atelier)",
    html: true,
    contenu:
      `<p>Craft magique risqué sur une arme ou une armure déjà en inventaire (onglet Atelier) : le jet est 1d20 + bonus d'artisan, contre la difficulté du palier visé. La destruction se vérifie sur le d20 BRUT seul (avant bonus), indépendamment de la réussite du test — un jet bas peut détruire l'objet même si le bonus aurait suffi à réussir. Une tentative (succès, échec ou destruction) consomme toujours les matériaux ET compte pour le quota du jour, quel que soit le résultat ; seul un échec laisse l'objet intact. Le MJ réinitialise les compteurs de tous les joueurs via le bouton « Nouveau jour » de l'Atelier.</p>
      <div class="tableau-regle-scroll"><table class="tableau-regle">
        <thead><tr><th>Type</th><th>Palier</th><th>Difficulté</th><th>Tentatives/j</th><th>Matériaux</th><th>Risque / effet</th></tr></thead>
        <tbody>
          <tr><td rowspan="5">Générique (arme, dégâts)</td><td>+1</td><td>12</td><td>3</td><td>1 Poussière de fer</td><td>Aucune destruction</td></tr>
          <tr><td>+2</td><td>14</td><td>3</td><td>1 Poussière d'acier</td><td>Aucune destruction</td></tr>
          <tr><td>+3</td><td>16</td><td>2</td><td>1 Gemme magique</td><td>Détruit si jet ≤2</td></tr>
          <tr><td>+4</td><td>18</td><td>1</td><td>2 Gemmes magiques</td><td>Détruit si jet ≤5</td></tr>
          <tr><td>+5</td><td>20</td><td>1</td><td>3 Gemmes magiques + 1 Diamant</td><td>Détruit si jet ≤10 ; ignore en permanence 2 points de valeurArmure de la cible</td></tr>
          <tr><td rowspan="3">Feu (arme, jamais de destruction)</td><td>Rang 1 « enflammée »</td><td>12</td><td>3</td><td>1 Poussière de rubis</td><td>1d4 dégâts de feu</td></tr>
          <tr><td>Rang 2 « ardente »</td><td>14</td><td>2</td><td>2 Poussières de rubis</td><td>1d6 dégâts de feu</td></tr>
          <tr><td>Rang 3 « incandescente »</td><td>16</td><td>1</td><td>3 Poussières de rubis</td><td>1d8 dégâts de feu</td></tr>
          <tr><td rowspan="3">Protection (armure, valeurArmure)</td><td>+1</td><td>12</td><td>3</td><td>1 Poussière de diamant</td><td>Aucune destruction</td></tr>
          <tr><td>+2</td><td>14</td><td>2</td><td>2 Poussières de diamant</td><td>Aucune destruction</td></tr>
          <tr><td>+3</td><td>16</td><td>1</td><td>3 Poussières de diamant</td><td>Détruit si jet ≤5</td></tr>
        </tbody>
      </table></div>`,
  },
  {
    titre: "Alchimie à risque (Atelier)",
    html: true,
    contenu:
      `<p>Brassage de potions (onglet Atelier, sous-onglet Alchimie) : le jet est 1d20 + bonus d'artisan, contre la difficulté du palier/recette visé. Contrairement à l'enchantement, rien n'est jamais détruit — il n'y a pas d'objet de départ à perdre, seulement des ingrédients. Un jet catastrophique (d20 BRUT seul, avant bonus, ≤ seuil du palier) ne produit pas d'échec sec : il produit une Potion ratée à la place de la potion visée. Un palier/recette compte toujours comme une tentative consommée pour la journée, quel que soit le résultat (réussite, échec ou ratée). Le MJ réinitialise les compteurs de tous les joueurs via le même bouton « Nouveau jour » de l'Atelier.</p>
      <div class="tableau-regle-scroll"><table class="tableau-regle">
        <thead><tr><th>Filière</th><th>Palier / potion</th><th>Difficulté</th><th>Tentatives/j</th><th>Ingrédients</th><th>Risque</th></tr></thead>
        <tbody>
          <tr><td rowspan="3">Soin — Sève (Druide)</td><td>Palier 1 « Potion de soin mineure »</td><td>10</td><td>5</td><td>1 Fleur de sève naissante</td><td>—</td></tr>
          <tr><td>Palier 2 « Potion de soin »</td><td>12</td><td>4</td><td>1 Fleur de sève éclose</td><td>—</td></tr>
          <tr><td>Palier 3 « Potion de soin supérieure »</td><td>14</td><td>3</td><td>2 Fleurs de sève ancienne</td><td>Ratée si jet ≤2</td></tr>
          <tr><td rowspan="3">Soin — Flambeau (Prêtre)</td><td>Palier 4 « Potion de soin bénie »</td><td>16</td><td>2</td><td>1 Fleur-flambeau</td><td>Ratée si jet ≤3</td></tr>
          <tr><td>Palier 5 « Potion de soin majeure »</td><td>18</td><td>1</td><td>2 Fleurs-flambeau embrasées</td><td>Ratée si jet ≤5</td></tr>
          <tr><td>Palier 6 « Potion de soin majeure bénie »</td><td>20</td><td>1</td><td>1 Fleur d'aurore éternelle + 1 Diamant</td><td>Ratée si jet ≤8</td></tr>
          <tr><td rowspan="6">Utilitaires (aucune ratée)</td><td>Antidote</td><td>10</td><td>5</td><td>2 Herbes médicinales</td><td>—</td></tr>
          <tr><td>Huile sainte</td><td>12</td><td>3</td><td>1 Fleur-flambeau</td><td>—</td></tr>
          <tr><td>Élixir de vision nocturne</td><td>12</td><td>3</td><td>1 Fleur de lune</td><td>—</td></tr>
          <tr><td>Fumigène</td><td>10</td><td>4</td><td>1 Poussière de fer + 1 Herbe médicinale</td><td>—</td></tr>
          <tr><td>Élixir de force</td><td>14</td><td>2</td><td>2 Fleurs rugissantes</td><td>—</td></tr>
          <tr><td>Bombe alchimique</td><td>14</td><td>2</td><td>2 Herbes de feu</td><td>—</td></tr>
        </tbody>
      </table></div>`,
  },
  {
    titre: "Portée en cases, rechargement et catégories d'armes",
    contenu:
      "Portée en cases : les armes à distance (arcs, arbalètes) portent désormais porteeMinCases/porteeMaxCases, la fourchette de cases utilisables sur la grille de combat en plus du texte descriptif. porteeMinCases: 0 signifie utilisable au contact (ex. Arc court, Arbalète courte) ; au-delà de porteeMaxCases ou en-deçà de porteeMinCases, le tir n'est pas possible.\n\nRechargement : une arme avec un champ rechargement: N ne peut pas retirer au round suivant un tir — elle doit être rechargée (N rounds d'attente) avant de pouvoir être utilisée à nouveau (Arbalète légère : 1 round ; Arbalète lourde : 2 rounds). L'Arbalète courte n'a aucun rechargement (tir libre chaque round), en échange de dégâts plus faibles.\n\ncategorieArme (courte / longue / deux_mains) : classification de référence apposée sur toutes les armes de mêlée du catalogue — sert désormais aux combinaisons d'équipement mains droite/gauche (voir entrée suivante).",
  },
  {
    titre: "Équipement des mains (une main / deux mains, bi-arme)",
    html: true,
    contenu:
      `<p>Bi-arme : si la main secondaire porte une arme courte de corps à corps, les dégâts de contact combinent le jet de l'arme principale ET celui de l'arme courte (les deux formules s'additionnent, ex. « 1d8+1d4 ») — un seul jet d'attaque, mais deux dés de dégâts cumulés.</p>
      <div class="tableau-regle-scroll"><table class="tableau-regle">
        <thead><tr><th>Main principale</th><th>Main secondaire possible</th><th>Effet</th></tr></thead>
        <tbody>
          <tr><td>Arc long / Arbalète normale ou lourde</td><td>Aucune (arme à deux mains)</td><td>Occupe les deux mains, rien d'autre ne peut être équipé en même temps</td></tr>
          <tr><td>Arc court / Arbalète courte</td><td>Arme courte de corps à corps</td><td>N'occupe qu'une main : l'autre reste libre (dague, masse, épée courte...)</td></tr>
          <tr><td>Arme de corps à corps courte ou longue (une main)</td><td>Bouclier, arbalète courte, ou arme courte de corps à corps</td><td>Combinaison possible dans la main secondaire</td></tr>
          <tr><td>Arme longue ou à deux mains</td><td>Aucune autre arme de corps à corps</td><td>Seule une arme courte peut compléter une arme courte ou longue</td></tr>
        </tbody>
      </table></div>`,
  },
];

/* ── Cartes monde disponibles dans assets/maps/ ────────────
   Pour ajouter une carte : ajouter une entrée ici + l'image dans assets/maps/ */
const CARTES_MONDE = [
  { nom: 'Arbre-Monde',           fichier: 'assets/maps/monde.png',              categorie: 'Monde' },
  { nom: 'Aetharion',             fichier: 'assets/maps/aetharion.png',          categorie: 'Nations' },
  { nom: 'Aelindra',              fichier: 'assets/maps/aelindra.png',           categorie: 'Nations' },
  { nom: 'Mordanel',              fichier: 'assets/maps/mordanel.png',           categorie: 'Nations' },
  { nom: 'Empire de Solvarn',     fichier: 'assets/maps/solvarn.png',            categorie: 'Nations' },
  { nom: 'République de Liberra', fichier: 'assets/maps/liberra.png',            categorie: 'Nations' },
  { nom: 'Arveth',                fichier: 'assets/maps/arveth.png',             categorie: 'Nations' },
  { nom: 'Mornac',                fichier: 'assets/maps/mornac.png',             categorie: 'Nations' },
  { nom: 'Serval',                fichier: 'assets/maps/serval.png',             categorie: 'Nations' },
  { nom: 'Khazrak Dûm',           fichier: 'assets/maps/khazrak-dum.png',        categorie: 'Nations' },
  { nom: 'Domaine de Valdcourt',  fichier: 'assets/maps/domaine-valdcourt.png',  categorie: 'Régions' },
  { nom: 'Bosquet des Guérisseurs',    fichier: 'assets/maps/bosquet-des-guerisseurs.png', categorie: 'Lieux & combats' },
  { nom: "Clairière de l'Arbre-Monde", fichier: 'assets/maps/clairiere-arbre-monde.png',   categorie: 'Lieux & combats' },
  { nom: 'Col des Marteaux',           fichier: 'assets/maps/col-des-marteaux.png',         categorie: 'Lieux & combats' },
  { nom: 'Forges Khazrak',             fichier: 'assets/maps/forges-khazrak.png',           categorie: 'Lieux & combats' },
  { nom: 'Fortin du Soleil Rouge',     fichier: 'assets/maps/fortin-du-soleil-rouge.png',   categorie: 'Lieux & combats' },
  { nom: 'Marches de Libris',          fichier: 'assets/maps/marches-de-libris.png',        categorie: 'Lieux & combats' },
  { nom: 'Port des Corsaires',         fichier: 'assets/maps/port-des-corsaires.png',       categorie: 'Lieux & combats' },
  { nom: "Ruines d'Arvenfall (Est)",   fichier: 'assets/maps/ruines-arvenfall-est.png',     categorie: 'Lieux & combats' },
  { nom: 'Nécropole des Témoins',      fichier: 'assets/maps/necropole-des-temoins.png',    categorie: 'Lieux & combats' },
];

/* ── Battlemaps (scènes de combat .dd2vtt) disponibles dans assets/battlemaps/ ──
   Pour ajouter une scène : exporte-la depuis Dungeondraft en .dd2vtt, dépose le
   fichier dans assets/battlemaps/, puis ajoute une entrée ici.
   key   : identifiant stable, sert de clé de synchro MJ ↔ joueurs (ne pas le
           changer une fois utilisé en session, sous peine de perdre les
           tokens/portes déjà synchronisés pour cette scène)
   label : nom affiché dans le sélecteur de scène
   file  : chemin du fichier .dd2vtt */
const CARTES_BATTLEMAP = [
  { key: 'test_tavern', label: 'Taverne (test)', file: 'assets/battlemaps/test_tavern.dd2vtt' },
  { key: 'ambush', label: 'Ambush', file: 'assets/battlemaps/Ambush.dd2vtt' },
  { key: 'forest_1', label: 'Forest 1', file: 'assets/battlemaps/Forest 1.dd2vtt' },
  { key: 'kratz', label: 'Kratz', file: 'assets/battlemaps/Kratz.dd2vtt' },
];
