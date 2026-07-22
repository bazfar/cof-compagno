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
        "L'Arbre-Monde\n\nÀ l'origine de tout se dresse l'Arbre-Monde — axis de la création, siège des dieux et source de toute vie. Son écorce est le temps, sa sève est la magie, ses racines plongent dans des plans que nul mortel n'a jamais atteints. À son sommet siège le Trône de l'Arbre-Monde, source du pouvoir divin absolu.\n\nLe Panthéon Elfique — Les Deux Factions\n\n• Gardiens de l'Écorce (Ordre · Stase · Préservation) : veulent que l'Arbre reste immuable, parfait, fermé au monde. Pouvoir fondé sur la hiérarchie et la préservation. Ce sont eux qui gagnent la Guerre du Trône.\n• Enfants de la Sève (Croissance · Expansion · Vie) : veulent que l'Arbre croisse et engendre d'autres mondes. Pouvoir fondé sur la fécondité et le changement. Bannis et corrompus lors de la Fracture — ils deviennent les Dieux du Chaos. (Une partie des Elfes qui vénéraient les Enfants de la Sève les auraient suivis dans leur bannissement et leur corruption — fil narratif intentionnellement non développé.)\n\nLa Guerre du Trône\n\nLa guerre éclate quand les Enfants de la Sève cherchent à ouvrir l'Arbre vers d'autres mondes, ce que les Gardiens refusent. Des siècles de conflit divin s'ensuivent. Les émotions générées — violence, meurtre, traque — sont si intenses qu'elles se solidifient en conscience et prennent une existence propre.\n\nLa Fracture\n\n• Défaite des Enfants de la Sève : vaincus, bannis et corrompus — leur désir de croissance devient désir de destruction : ne pouvant avoir l'Arbre, ils veulent l'annihiler.\n• L'Arbre blessé : ses racines sont partiellement corrompues. L'Arbre dépérit lentement depuis — un déclin que les Elfes ressentent dans leur chair.\n• Naissance des Humains : le sang versé pendant la Fracture, mêlé des deux factions, tombe sur le monde et prend vie. Les Humains portent l'écho de la guerre : double nature instable, susceptible au Chaos.\n• Naissance des Dieux du Chaos : les Enfants bannis créent leurs serviteurs — les Démons — pour détruire ce qu'ils n'ont pu posséder.\n• Continent occidental ravagé : l'essentiel des combats de la Guerre du Trône se déroule sur le continent aujourd'hui occidental. Les Elfes qui y vivaient sont décimés ; les survivants se replient sur le continent oriental, où naissent les futures patries d'Aetharion, d'Aelindra et de Mordanel. Seules des enclaves occidentales subsistent, aujourd'hui disputées par les nations humaines (cf. Géographie & capitales).",
    },
    {
      titre: "Des tribus humaines au Premier Empire",
      contenu:
        "Le continent occidental, ravagé par près de deux mille ans de Guerre du Trône, ne reste pas vide longtemps. Les Elfes survivants se sont repliés à l'est ; les émotions cristallisées de la Fracture commencent à se donner des corps — les premières hordes orques et gobelines rôdent déjà sur des terres que plus personne ne dispute vraiment. C'est dans ces cendres, sans autre héritage qu'un sang mêlé et instable, que les Humains apparaissent et entament leur longue montée. Pendant près de trois siècles, ce ne sont que des tribus éparses, luttant pour survivre sur un sol encore marqué par la guerre des dieux — puis viennent, sur les cinq cents années suivantes, la maîtrise du feu, puis celle du bronze, puis du fer, jusqu'à l'émergence, voici environ douze siècles, d'une première grande civilisation humaine — la première à mériter ce nom sur ce continent.\n\nMais le sang qui coule dans les veines humaines porte l'écho de la guerre qui l'a créé, et cet héritage ne pouvait pas rester dormant éternellement. À mesure que les civilisations humaines se multiplient et se répandent, elles se tournent les unes contre les autres. S'ouvre alors, pour environ trois siècles et demi, une ère de guerres longues et meurtrières entre royaumes rivaux — des générations de sang versé pour des raisons que plus personne, à la fin, ne sait vraiment nommer. L'ironie n'échappe à aucun érudit qui s'y penche sérieusement : cette boucherie entre humains a fait plus, en quelques siècles, pour les jeunes peuples orques et gobelins que n'importe quelle guerre elfique n'aurait pu le faire — plus de violence, plus de haine, plus de mort à cristalliser, et les consciences du Chaos n'ont eu qu'à se servir sur un continent qui leur offrait déjà, sans le vouloir, exactement ce dont elles se nourrissent.\n\nDe ce chaos, une civilisation humaine a fini par se distinguer — remportant guerre après guerre, absorbant une à une les terres de ses rivales, jusqu'à ce qu'il ne reste plus, après des générations de conquêtes, personne pour lui disputer sérieusement le continent. Il y a environ huit siècles et demi, l'unification est proclamée : le Premier Empire naît.\n\nLe premier Empereur ne règne pas seul. Huit grandes familles l'accompagnent dès la fondation — les huit maisons fondatrices qui deviendront, des générations plus tard, les huit maisons de l'Empire (quatre resteront fidèles à Solmaris ; quatre finiront par s'en détacher lors de la Rupture). Sous leur autorité partagée, le Premier Empire connaît près de sept siècles de stabilité relative.\n\nC'est cette stabilité que la dynastie régnante finit par rompre elle-même, dans les dernières générations de ce long règne. Obsédée par l'idée d'être la lignée élue — la seule à porter légitimement le sang des Gardiens de l'Écorce —, elle resserre peu à peu l'emprise de la religion sur l'État. La doctrine gagne du terrain sur le pouvoir temporel jusqu'à s'y substituer presque entièrement, et avec elle grandissent les discriminations envers les non-humains, la pression foncière et sociale sur les serfs et les paysans, et bientôt sur certaines des huit familles elles-mêmes, qui voient leur autorité provinciale s'éroder au profit d'un trône de plus en plus absolu. C'est cette pression, accumulée sur des générations, qui finit par se rompre — voici cent soixante-dix ans, la Rupture, la Grande Sécession, et la naissance des Royaumes Coalisés et de la République de Liberra (cf. section \"La Rupture — chronique de la Grande Sécession\").",
    },
    {
      titre: "Les races du monde",
      contenu:
        "Les Elfes — Enfants de l'Arbre\n\nPremiers-nés de l'Arbre, antérieurs à la Fracture. Sang de sève pure → résistance au Chaos (+2 ou +rang aux jets contre la corruption de la Voie du Chaos). Ils ressentent physiquement la blessure de l'Arbre. Trois nations :\n\n• Aetharion (Hauts Elfes) : préserver et isoler l'Arbre. Hautains. Bannissent les demi-elfes. Mépris pour les Aelindra, méfiance pour les Mordanel.\n• Aelindra (Elfes Sylvains) : réparer l'Arbre en tissant des liens avec toutes les races. Présents dans la République. Acceptent les demi-elfes.\n• Mordanel (Elfes du Crépuscule) : garder la mémoire et témoigner. Fracture interne : Anciens prudents contre Jeunes qui veulent agir. Accusés par l'Empire d'avoir provoqué l'incarnation de la Traque.\n\nLes Humains — Sang Mêlé, Fracturé\n\nNés du sang divin des deux camps. Ambition insatiable, adaptabilité. -2 aux jets contre la corruption du Chaos, mais accès plus facile à la Voie du Chaos (les consciences les reconnaissent).\n\nLes Nains — Élémentaires de Pierre Éveillés\n\nCréés par un dieu Gardien de la Montagne, devenus conscients. Ancrage dans l'Ordre.\n• Nains de l'Ordre : forge, tradition, alliés de l'Empire (acier et cols fortifiés). +1 contre la corruption.\n• Khazrak Dûm (Nains Renégats) : après le Scellement des Portes du Sud (cf. Histoire — Le Scellement des Portes du Sud), qui emmure leurs garnisons hors de Kaldrun pour sauver la capitale, ces tribus sont livrées à elles-mêmes face aux tribus orques et gobelines des Failles Rouges. Des générations de siège sans espoir de renfort les poussent finalement à un pacte de survie avec leurs assaillants plutôt qu'à leur destruction — pacte qui les transforme peu à peu : plus grands, peau grisée, mâchoire proéminente. En dominant ce qu'ils méprisaient, ils sont devenus ce qu'ils haïssaient. Le Scellement a aussi détruit leur chaîne de commandement : organisés en clans indépendants plutôt qu'en pouvoir central, scindés entre Résistants (refusent toute assimilation nouvelle, espèrent encore une réconciliation avec Kaldrun) et Évolutionnistes (ont intégré le pacte comme identité, enviant en secret la pureté rituelle jamais compromise des Nains de l'Ordre — un ressentiment devenu, de génération en génération, un rêve de reconquête de Kaldrun). Observés par les Dieux du Chaos.\n\nOrcs & Gobelins — Émotions Cristallisées\n\nNés des émotions de violence de la Guerre du Trône, ils créèrent des corps pour traquer et tuer les races de l'Ordre.\n• Orcs (meurtre glorieux) : combattent en horde, face à l'ennemi, vous regardent dans les yeux avant de tuer.\n• Gobelins (traque prédatrice) : embuscades, pièges, nombre. Tuent par instinct. Plus malléables — certaines tribus servent les Khazrak Dûm.",
    },
    {
      titre: "Le Chaos — hiérarchie et manifestations",
      contenu:
        "Hiérarchie du Chaos\n\n• Niveau I — Dieux du Chaos : Enfants de la Sève bannis, pleinement cristallisés. Absents physiquement, influence indirecte et plans à long terme.\n• Niveau II — Consciences-émotions (Violence / Meurtre / Traque) : pas encore des dieux, millénaires d'existence. Bénédictions sur champions ; rarement, incarnation temporaire (siècles de recharge).\n• Niveau III — Démons : serviteurs créés par les Dieux du Chaos. Actifs dans le monde, outils de destruction de l'Ordre.\n• Niveau IV — Orcs & Gobelins : corps des consciences dans le monde mortel. Omniprésents, instruments sans dévotion consciente.\n\nL'Incarnation de la Traque — le Silence de Valmoire (il y a ~18 ans)\n\nPour la première fois depuis des siècles, la conscience de la Traque s'est incarnée, dans une zone frontalière disputée entre les terres Mordanel et les marches orientales de Solvarn. Le village de Valmoire a disparu en trois semaines — les habitants traqués un par un, retrouvés des jours après sans marque de lutte. Cette méthode silencieuse et patiente a permis à l'Empire de désigner les Elfes du Crépuscule : \"Qui d'autre traque ainsi, sinon un peuple qui vit dans l'entre-deux du jour et de la nuit ?\"\n\nL'Empire a exploité l'événement pour élargir son accusation à Aetharion également — cible plus \"légitime\" aux yeux de l'opinion solvarienne (riche, isolationniste, déjà mal-aimée) qu'un peuple pauvre et dispersé. Mensonge délibéré ou conviction sincère ? Ambiguïté narrative centrale de la campagne. Et si les Dieux du Chaos avaient manipulé les deux camps simultanément ?\n\nChez les Mordanel, l'événement est encore frais : la fracture interne entre Anciens (retenue) et Jeunes (réponse armée) n'est pas tranchée. Les dryades proches des terres Mordanel se sont en partie retirées depuis le Silence — un désaveu silencieux qui aggrave la fracture (voir section Les Dryades).",
    },
    {
      titre: "L'Aspect de la Bravoure — la quête de Valdorne",
      contenu:
        "La Guerre du Trône a cristallisé des émotions négatives en consciences autonomes — Violence, Meurtre, Traque, et à terme les Dieux du Chaos eux-mêmes. Aucune émotion positive n'a jamais accompli l'inverse. Nulle part. Jamais. C'est précisément ce que Valdorne tente de faire depuis des générations, sans savoir si la chose est seulement possible.\n\nTout part de la mort d'Alaric de Valdorne au Pont-Rompu : un acte de bravoure pure, sans espoir de survie ni de gloire posthume. Le clergé des Gardiens sincères de Valdorne enseigne que ce sacrifice a \"presque\" suffi à faire naître quelque chose — une Conscience-vertu, miroir inversé des Consciences du Chaos, née non de la souffrance infligée mais du sacrifice librement consenti. L'Ordre du Pont, fondé en mémoire d'Alaric, poursuit cette quête sans toujours oser la nommer aussi crûment : chaque vœu tenu, chaque retraite couverte au prix d'une vie, est autant un acte de guerre qu'une tentative de terminer ce qu'Alaric a commencé.\n\nQuelques champions légendaires, à travers les générations, auraient reçu dans des instants de bravoure extrême et désintéressée une clarté ou une force impossibles à expliquer autrement — jamais confirmées, jamais reproductibles à volonté, jamais consignées ailleurs que dans les chants et les vœux des chevaliers. Le Roi Baldwin IV y croit sincèrement, pas seulement par tradition politique — ce qui explique en bonne partie l'intransigeance idéologique de Valdorne envers Solvarn : transiger reviendrait à trahir un serment sacré envers quelque chose qui n'est peut-être même pas encore né.\n\nCar là est toute l'incertitude, gardée volontairement ouverte : personne ne sait si la vertu peut vraiment cristalliser comme la souffrance l'a fait, ou si l'intensité seule de l'émotion compte, indépendamment de sa valence morale. Le courage naît souvent de la peur, du désespoir, de la violence qu'on inflige ou qu'on subit. Rien ne garantit qu'un Aspect de la Bravoure, s'il naissait un jour, ressemblerait à ce que Valdorne espère.\n\nEt l'idéal porte en lui une faille plus immédiate, que peu osent formuler à voix haute : la bravoure qu'on célèbre est réservée à une élite. Seule une petite portion de la population — la noblesse, les lignées de chevaliers — a même la possibilité de tenter l'acte héroïque, reconnu, chanté, susceptible un jour de nourrir la quête. Le reste du royaume vit et meurt en paysans, en conscrits, en soldats de métier sans nom, ou au mieux en écuyers qui ne seront jamais adoubés. La quête collective de Valdorne repose, structurellement, sur le servage et le sacrifice anonyme de ceux à qui on ne donnera jamais la chance de devenir des Alaric. Si un Aspect de la Bravoure naissait un jour d'une vertu cultivée sur un tel fondement, nul ne sait s'il serait aussi pur que ses architectes l'espèrent — ou s'il porterait, comme les Humains portent l'écho de la Fracture, la trace de tout ce qu'il a fallu taire pour le faire naître.",
    },
    {
      titre: "Les trois systèmes humains",
      contenu:
        "La Grande Sécession (la Rupture) a eu lieu il y a environ 170 ans — assez loin pour ne plus être un souvenir personnel, assez proche pour rester un souvenir de famille encore instrumentalisé politiquement.\n\nMême origine pour tous les Humains — le sang divin fracturé. Après la Grande Sécession du Premier Empire, trois systèmes se disputent le monde connu : l'Empire de Solvarn, les Royaumes Coalisés (Valdorne, Arveth, Mornac, Serval) et la République de Liberra.\n\nL'Empire de Solvarn (Xénophobe · Centralisé · Religieux · Solaire)\nHéritier du Premier Empire ; la famille impériale revendique le sang des Gardiens de l'Écorce. Le soleil est son symbole. Doctrine : pureté du sang humain comme rempart au Chaos, non-humains = vecteurs de corruption. Ironie : Solvarn a raison sur un point (les Humains sont plus susceptibles au Chaos), appliqué de façon monstrueuse. But : purifier et reconquérir.\n\nLes Royaumes Coalisés (Chevaleresques · Féodaux · Hypocrites)\n• Valdorne : le plus ancien, berceau de la sécession, chevalerie sincère. Blason : un pont brisé surmonté d'une épée dressée, sur azur — écho direct à Pont-Rompu et au sacrifice d'Alaric. Devise : « Un seul suffit. »\n• Arveth : frontalier de Solvarn, sous pression constante — le vacillant. Blason : une flamme vacillante entre deux lances croisées, sur fond cendré. Devise : « Nous tenons la ligne. »\n• Mornac : maritime et commerçant, chevalerie de façade, pragmatique. Blason : une ancre couronnée sur des vagues, sur vert-de-mer. Devise : « Le vent tourne, le profit reste. »\n• Serval : montagnard, allié des Nains de l'Ordre, le plus indépendant. Blason : une enclume sur un pic montagneux, sur gris-pierre. Devise : « La roche encaisse mais ne se brise pas. »\nStructure féodale (Seigneurs → Chevaliers → Paysans). Point de rupture : si Arveth tombe, la coalition se fracture.\n\nLa République de Liberra (Idéaliste · Inclusive · Fracturée)\nNée de la Sécession, rejette l'Empire et le féodalisme. Assemblée de citoyens ; non-humains admis (représentation inégale). Majorité Aelindra, minorité Mordanel. Fractures : marchands vs idéalistes vs militaires vs communautés non-humaines.\n\nTensions actuelles\n• Solvarn → Royaumes : reconquête (Arveth en première ligne).\n• Solvarn → Liberra : hérésie raciale.\n• Solvarn → Aetharion / Mordanel : guerre ouverte sur les Marches Orientales, un second front qui immobilise une partie des forces impériales (cf. section \"Les Marches Orientales — le second front\").\n• Valdorne → Solvarn : un mal nécessaire autant qu'un ennemi. L'Empire est facilement qualifiable de tyrannique, ce qui sert sans détour la quête de l'Aspect de la Bravoure — un adversaire moralement simple facilite la geste héroïque que Valdorne cherche à accomplir. Résistance idéaliste, refuse tout compromis — en partie parce qu'un Solvarn moins monstrueux compliquerait sa propre narration.\n• Arveth → Solvarn : haine et peur viscérales, héritées de la Campagne des Marches et de sa saignée jamais refermée — sentiment populaire qui contraste durement avec les négociations secrètes de Ranulf d'Arvenfall. Arveth → Coalition : ces négociations, si un flanc coalisé venait à être neutralisé, libéreraient des troupes impériales pour l'effort contre Mordanel/Aetharion autant que contre le reste de la Coalition. Rupture potentielle si ces contacts sont révélés.\n• Mornac → Solvarn : l'Empire menace directement ses intérêts commerciaux à long terme, ce qui la rend prompte à fournir matériel, ressources et quelques régiments à l'effort de guerre coalisé — sans jamais renoncer à lui vendre si le prix est bon à court terme (pragmatisme marchand, cf. Serment du Grand Livre).\n• Serval → Solvarn : un souvenir plus qu'une urgence. Éloigné des combats, Serval tourne son attention vers les tribus orques/gobelines et les Évolutionnistes de Khazrak Dûm — la menace impériale reste ancrée dans les esprits sans être la préoccupation quotidienne.\n• Mordanel → Solvarn : l'expansionnisme impérial nourrit directement, selon la jeunesse mordanelle, la cristallisation des Consciences de Meurtre et de Traque — une menace cosmologique autant que politique pour ceux qui veulent se battre plutôt qu'attendre (cf. fracture Anciens/Jeunes).\n• Serval ↔ Nains de l'Ordre : alliance montagnarde solide.\n• Liberra ↔ Aelindra : alliance naturelle. Liberra ↔ Royaumes : alliance inconfortable contre Solvarn.",
    },
    {
      titre: "Les Lieux de Libris",
      contenu:
        "Sept lieux structurent la vie politique et sociale de Libris — territoires informels des cinq blocs de l'Assemblée, ou terrains neutres où tout le monde se croise.\n\nLe Grand Marché (Quartier des Marchés)\nCœur commercial de la ville, sur la Lisdane. Entrepôts, comptoirs de change, guildes en tout genre — territoire naturel du Comptoir. C'est ici, dans l'arrière-boutique d'un entrepôt discret appartenant à un intermédiaire de confiance, que Maître Aurèle Ferrand traite ses affaires les moins avouables.\n\nLe Palais du Serment\nSiège officiel de l'Assemblée, bâtiment le plus ancien de Libris — la charte fondatrice y est conservée sous verre, dans la salle où Vasnal préside encore les débats. Terrain neutre en théorie ; en pratique, les cinq blocs s'y affrontent à coups de procédure.\n\nLa Citadelle des Ponts\nCaserne principale de la Garde Citoyenne, sur un éperon rocheux dominant un des ponts de la Lisdane. Accès restreint, patrouilles visibles — un lieu qui rassure certains habitants et en inquiète d'autres.\n\nLe Quartier du Tissage\nTerritoire du Cercle des Peuples. Quartier mixte où se concentrent Aelindra, Mordanel exilés et autres non-humains de la ville. Ateliers, maisons communes, un petit temple dédié à Aelindros.\n\nLa Racine Noire\nTaverne discrète en périphérie, loin des quartiers marchands — repaire informel des Fils de Libris. Pas de siège officiel : leur pouvoir se construit ici, autour de bière bon marché et de discours populistes adressés à ceux que le Comptoir a ruinés.\n\nLa Table Commune\nAuberge-carrefour près des quais, fréquentée par tout le monde — marchands, miliciens en repos, idéalistes désabusés, parfois même un Fils de Libris qui ne veut pas se faire remarquer. Le lieu neutre par excellence pour une rencontre discrète.\n\nLes Docks de Port-Libris\nPort principal, où arrivent les nouvelles de la guerre navale contre Aetharion et les cargaisons du Comptoir. Lieu de passage pour toute intrigue impliquant contrebande, espionnage étranger, ou rumeurs fraîchement débarquées d'un autre continent.",
    },
    {
      titre: "La Rupture — chronique de la Grande Sécession",
      contenu:
        "Quand la dynastie régnante du Premier Empire a durci sa doctrine solaire, une branche a revendiqué l'exclusivité du sang divin des Gardiens et verrouillé le pouvoir — devenant Solvarn. Quatre grandes maisons provinciales (futurs Valdorne, Arveth, Mornac, Serval) ont refusé cette purification et se sont soulevées ensemble : la Rupture. Guerre de dix ans, achevée sur un armistice que Solvarn n'a jamais considéré comme définitif.\n\nCinq batailles marquantes :\n\n• La Charge de Fossessainte (an 1) — bataille d'ouverture à un gué frontalier. Sire Alaric de Valdorne, jeune chevalier sans grade, rallie les colonnes dispersées et transforme une déroute en victoire. Fondateur du code chevaleresque de Valdorne : l'honneur individuel qui sauve la cause commune.\n\n• La Campagne des Marches (an 2-3) — le commandement solvarien ne s'en prend pas à un maillon faible, mais au contraire au noyau militaire de la coalition : l'infanterie d'Arveth, héritière directe des légions qui tenaient déjà la marche orientale du Premier Empire, est de loin la force de combat la plus redoutable dont disposent les rebelles. Affaiblir durablement ce noyau vaut mieux, calcule l'Empire, qu'une victoire rapide ailleurs — deux ans d'une guerre d'usure d'une brutalité rare, sans manœuvre ni ruse, seulement des lignes qui s'affrontent jusqu'à l'épuisement sur le sol même d'Arveth. Les renforts de cavalerie envoyés par les ordres chevaleresques de Valdorne, encore portés par l'élan de Fossessainte, empêchent l'effondrement complet du front oriental — la première preuve concrète que la rébellion est une coalition réelle, et non quatre soulèvements séparés qui auraient pu tomber un par un. Arveth tient, mais au prix d'un saignement dont le royaume ne se relève jamais complètement : l'origine directe de la vulnérabilité permanente qu'il porte encore aujourd'hui, cent soixante-dix ans plus tard. L'ironie qui perdure : Arveth reste malgré tout le fer de lance de l'infanterie coalisée, quand la cavalerie demeure l'apanage des ordres chevaleresques de Valdorne — une répartition du travail martial héritée directement de cette campagne.\n\n• Le Siège de Mornhaven (an 4-5) — le Haut-Maréchal Corvain Ashe assiège la capitale de Mornac huit mois. Mornac tient grâce aux convois de Serval à travers ses cols — ce qui soude la Coalition en alliance réelle.\n\n• Le Siège du Col des Vents (an 6-7) — Solvarn ouvre un second front en tentant de forcer les passes de Serval, présumant le royaume montagnard isolé et sous-défendu après avoir vidé ses réserves pour les convois de Mornhaven. L'Empire y trouve à la place le premier déploiement conjoint des forces servalines et des guerriers de l'Ordre des Nains, épaulés par des armes runiques forgées pour l'occasion par le clan Pierrefonde — Margrave Aldous Sten et le maître d'armes naine Borin Pierrefonde y repoussent l'assaut avec des pertes impériales sévères. Ce n'est plus seulement une alliance diplomatique : c'est la première fois que Serval et les Nains de l'Ordre versent le sang ensemble, l'origine véritable du partenariat métallurgique permanent qui définit encore Serval aujourd'hui.\n\n• La Bataille du Pont-Rompu (an 9) — Alaric, devenu commandant respecté, meurt en détruisant un pont pour couvrir la retraite coalisée. Un mois plus tard, les deux camps épuisés négocient.\n\nL'Armistice des Quatre Sceaux — signé près de Pont-Rompu. Chaque maison appose son sceau séparément (d'où le nom), refusant un sceau commun. Solvarn signe sous protestation, le considérant comme une pause tactique. Corvain Ashe, le Haut-Maréchal qui a mené les deux campagnes les plus coûteuses de la guerre — les Marches puis Mornhaven — sans jamais emporter la victoire décisive qu'il cherchait, tient une place particulière dans la mémoire des deux camps. Pour l'Empire, il reste un commandant capable et dévoué, brisé non par une faute tactique mais par quelque chose de plus profond qu'il a passé le reste de sa vie à nommer : la conviction croissante, presque obsessionnelle, que Solvarn n'a pas perdu par manque de discipline militaire, mais par manque de pureté — des officiers trop cléments, des soldats qui fraternisaient avec des aumôniers ennemis, une foi diluée par des décennies de contact avec des terres qu'on aurait dû purifier plus tôt. Ses écrits, largement ignorés de son vivant, ont été redécouverts par le Sacerdoce Solaire des décennies plus tard — la matière première intellectuelle du durcissement doctrinal qui a donné naissance aux Chevaliers-Inquisiteurs. Corvain Ashe n'a jamais vu naître l'ordre qu'il a, sans le savoir, fondé dans le désespoir d'une défaite qu'il n'a jamais su accepter autrement.\n\nPour la Coalition, en particulier Arveth et Mornac, son nom évoque un tout autre souvenir : celui d'un général qui a bien failli les briser, deux fois, et qui n'a échoué ni par excès de retenue ni par manque de talent — seulement parce qu'un peuple qu'il avait lui-même formé, et un royaume montagnard qu'il avait sous-estimé, ont tenu un peu plus longtemps que lui. Théodren Ashe, son arrière-petit-fils, porte aujourd'hui sa doctrine comme un dogme figé — sans jamais sembler porter le doute et l'angoisse sincères qui l'ont fait naître chez son aïeul.\n\n\"Être un Alaric\", à Valdorne, désigne aujourd'hui un acte de courage qui dépasse son rang.",
    },
    {
      titre: "Les Écourtés et les Endurcis — les rites de guerre d'Arveth",
      contenu:
        "Avant la Rupture, Arveth n'était pas une maison de foi ni de commerce, mais d'épée : elle tenait la marche orientale du Premier Empire, déjà en première ligne face aux terres qui deviendraient plus tard celles de Mordanel. Cette expérience militaire, plus qu'aucun autre héritage, a fait d'Arveth le pilier martial de la Coalition après la sécession — le royaume qui sait vraiment se battre, quand Valdorne inspire et que Mornac finance.\n\nMais un pilier qu'on sollicite sans relâche finit par s'user. Cent soixante-dix ans de tension quasi permanente sur la frontière la plus exposée de toute la Coalition ont vidé Arveth d'une manière qu'aucun autre royaume coalisé n'a connue aussi durement : des hameaux qui se dépeuplent faute de bras pour les champs, des garnisons qui ne se renouvellent plus au rythme des naissances, un âge de conscription qui recule d'année en année, génération après génération, sans jamais vraiment s'arrêter de reculer.\n\nFace à cette hémorragie silencieuse, Arveth s'est tourné vers une réponse qu'aucun autre royaume n'a osé formaliser : la modification magique de ses propres soldats.\n\nLe Rite de Maturité Hâtée — que le peuple, en privé, appelle \"les Écourtés\" — accélère en quelques semaines la maturation physique et martiale d'un adolescent de quatorze à seize ans, là où la nature en aurait mis des années. Le nom dit tout : le rite raccourcit l'enfance de ceux qui le subissent, et raccourcit tout autant leur espérance de vie. La magie employée, rapide et instable par nécessité plutôt que par choix, expose ceux qui la reçoivent à un risque de corruption du Chaos plus élevé que la moyenne déjà préoccupante des Humains — un risque que le commandement militaire préfère ne pas quantifier publiquement.\n\nLe Rite du Sang Renforcé — \"les Endurcis\", dans le même argot populaire — vise cette fois des soldats déjà en service : renforcement magique du muscle, des réflexes, de l'endurance, pour qu'un seul combattant augmenté vaille ce qu'il aurait fallu deux ou trois hommes pour accomplir autrefois. Le rituel échoue parfois. Quand il échoue, ce n'est pas une simple inefficacité qu'on déplore : c'est une mort sur la table, ou pire, une mutation qu'on ne peut plus défaire — un corps qui a changé de nature sans que l'esprit qui l'habite ait eu voix au chapitre.\n\nLord Ranulf d'Arvenfall a autorisé les deux programmes à contrecœur, sous la pression insistante de son commandement militaire — un compromis de plus dans une liste qui ne cesse de s'allonger, aux côtés de ses négociations secrètes avec Solvarn. Ce que peu de gens savent encore à la cour, c'est que ce compromis a cessé, récemment, d'être purement abstrait pour lui.\n\nComme pour l'idéal chevaleresque de Valdorne, une réalité plus amère se cache sous la nécessité affichée : les fils et filles de la noblesse d'Arveth échappent presque toujours aux deux rites, exemptés par coutume plutôt que par loi écrite. Ce sont les enfants des paysans, des artisans, des soldats de métier sans nom, qui portent presque seuls le poids des Écourtés et des Endurcis — une asymétrie qu'Arveth partage, sans jamais le formuler ainsi, avec la faille de classe qui ronge l'idéal chevaleresque de son voisin valdornais.",
    },
    {
      titre: "Serval — l'alliance plutôt que la pureté",
      contenu:
        "Des quatre Royaumes Coalisés, Serval est celui qui a le moins hérité du réflexe de pureté et de méfiance envers les non-humains que Solvarn a fait de sa doctrine d'État. La raison n'est pas idéologique à l'origine — elle est géographique. Isolé derrière les Contreforts qui portent son nom, Serval n'a jamais eu la démographie nécessaire pour tenir ses cols seul face aux incursions orques et gobelines qui remontaient régulièrement des passes du sud. La survie a exigé des alliés, pas de la pureté — et le royaume a fini par en tirer une philosophie plutôt qu'une simple nécessité tactique.\n\nL'alliance la plus ancienne et la plus profonde reste celle avec les Nains de l'Ordre (cf. sections dédiées) — un partenariat de guerre devenu, avec les générations, un partenariat métallurgique permanent. Mais Serval a étendu ce même réflexe plus loin qu'aucun autre royaume coalisé n'a osé le faire : une relation commerciale suivie avec l'enclave occidentale d'Aelindra, échangeant acier servalin et ouvrages forgés par les Nains contre bois de sylve, remèdes et artisanat elfique. Ce n'est pas une alliance de sang ni de nécessité militaire immédiate comme celle avec l'Ordre — c'est un choix, et Serval en est discrètement fier : nulle part ailleurs dans les Royaumes Coalisés un marché ne voit se croiser aussi naturellement nains, humains et elfes sylvains.\n\nCe pragmatisme façonne aussi le regard que Serval porte sur Solvarn — un regard sans ambiguïté, rarement formulé à voix haute mais jamais caché non plus : l'Empire est rigide, fanatique, intransigeant, prêt à saigner seul plutôt qu'à accepter l'aide de mains qu'il juge impures. Aux yeux de Serval, c'est précisément cette rigidité qui aveugle Solvarn face à la menace qu'il prétend combattre — un royaume qui aurait pu apprendre depuis longtemps ce que Serval sait depuis des générations : on ne survit pas seul face au Chaos, aussi pur soit son sang.\n\nLa contribution de Serval à l'effort commun de la Coalition n'est ni chevaleresque comme celle de Valdorne, ni financière comme celle de Mornac, ni un sacrifice de chair comme celui d'Arveth : c'est un flux constant d'armes et d'armures produites par ses forges, en avance sur le reste du continent connu, et quelques régiments d'élite équipés d'armes à feu — mousquets et pistolets développés conjointement avec les maîtres-forgerons de Kaldrun, une technologie jalousement gardée, trop coûteuse et trop instable encore pour équiper autre chose que ces unités d'exception.",
    },
    {
      titre: "Le Scellement des Portes du Sud",
      contenu:
        "Il y a plusieurs siècles, une horde orque et gobeline massive s'engouffre par le passage sud des Contreforts de Serval, droit vers Kaldrun. Les garnisons naines qui gardaient cette frontière tiennent la ligne aussi longtemps qu'elles peuvent, sans réussir à contenir le nombre.\n\nKaldrun doit choisir : dégarnir dangereusement la capitale pour envoyer des renforts, ou sceller le passage pour de bon. Les Gardiens du Marteau de l'époque choisissent de sceller — un effondrement contrôlé obtenu par une rune interdite, proche du Marteau-Premier, jamais réutilisée depuis. Kaldrun est sauvée. Ses propres garnisons du sud en sont emmurées, avec la horde, de l'autre côté.\n\nLe commandant de ces garnisons, Korrin Sombreforge, aurait envoyé un dernier message suppliant Kaldrun d'envoyer des renforts avant le scellement — resté sans réponse. Chez ses descendants directs (le clan Sombreforge, aujourd'hui clan martial de Kaldrun), son nom reste synonyme d'un sacrifice nécessaire qu'on célèbre en silence, plus qu'on ne le discute. Chez les descendants des garnisons emmurées — devenues au fil des générations les tribus de Khazrak Dûm — son nom, quand il est encore transmis, est synonyme d'un abandon que Kaldrun n'a jamais officiellement reconnu comme tel.\n\nLa rune du Scellement a été gravée par un maître du clan Runegrave, dépositaire des mystères les plus anciens — ce qui fait de ce clan, bien plus que les soldats Sombreforge qui ont simplement tenu la ligne, le véritable porteur du poids théologique de la décision.\n\nAucun accès n'a jamais été rouvert. Les galeries scellées sont aujourd'hui surveillées en permanence par le clan Pierrefonde, qui rapporte depuis peu des bruits réguliers de l'autre côté — une information qui n'a pas encore été remontée officiellement.\n\n\"Être un Sombreforge\", à Kaldrun, désigne un acte de sacrifice qui ne se discute pas. Chez Khazrak Dûm, le même nom n'évoque qu'une porte fermée.",
    },
    {
      titre: "Les Dryades — gardiennes de l'Arbre",
      contenu:
        "Les dryades sont des fragments de l'Arbre-Monde ayant gagné une conscience propre — le réflexe de survie de l'Arbre lui-même. Comme tout arbre, l'Arbre-Monde perd de l'écorce ; ce phénomène naturel et continu — pas seulement un événement de guerre unique — facilite grandement l'intégration des dryades parmi les peuples du monde : elles ne sont pas de simples reliques figées d'un passé mythique, elles continuent d'apparaître aujourd'hui. La Guerre du Trône (voir Cosmogonie), traumatisme le plus violent jamais infligé à l'Arbre, en a produit une vague majeure — dont les rarissimes Grandes Dryades. Elles précèdent les trois nations elfiques.\n\nDeux niveaux :\n• Dryades mineures — nées d'une perte d'écorce, aussi bien issue d'un choc violent que d'un simple vieillissement naturel de l'Arbre. Liées à un bosquet précis, discrètes, nombreuses, dispersées dans toutes les forêts significatives du monde connu. Protègent leur bosquet localement.\n• Grandes Dryades — rarissimes, quasi-divines, nées seulement d'un traumatisme majeur infligé à l'Arbre (guerre, incendie, corruption). Une poignée dans tout le monde connu, chacune gardienne d'un site sacré. Rencontre = événement de campagne, pas rencontre aléatoire.\n\nRapport aux trois nations elfiques :\n• Aetharion — révérence formelle, quasi-religieuse ; sanctuaires cérémoniels, mais frustration de devoir s'incliner devant une autorité qu'ils ne contestent pas.\n• Aelindra — proximité réelle, presque familiale ; rituels de guérison invoquant l'aide d'une dryade locale.\n• Mordanel — méfiance mutuelle depuis le Silence de Valmoire. Certaines dryades proches des terres Mordanel se sont retirées, désaveu silencieux qui aggrave la fracture interne (Anciens vs Jeunes).",
    },
    {
      titre: "Les Marches Orientales — le second front",
      contenu:
        "Tandis qu'Arveth saigne au sud pour retenir la Coalition sous la pression solvarienne, un second front, bien plus à l'est, oppose l'Empire à l'enclave occidentale de Mordanel — les Marches Orientales, disputées depuis des décennies, théâtre du Silence de Valmoire et gardées côté impérial par le Fort de l'Aube. Aetharion, refusant de laisser ses cousins occidentaux se faire repousser à la mer sans réagir, y a engagé ses propres régiments expéditionnaires, débarqués par-delà la Mer de Cendre-Claire — le même conflit, sans percée décisive depuis trois ans, que la doctrine impériale qualifie officiellement de guerre contre Aetharion.\n\nPour la génération mordanelle la plus jeune, déjà en délicat désaccord avec la retenue prônée par les Anciens depuis le Silence, ce front porte un poids qui dépasse la politique. L'expansionnisme de Solvarn n'est pas seulement une menace territoriale : chaque affrontement, chaque mort sur ce front nourrit directement, selon eux, la cristallisation continue des Consciences de Meurtre et de Traque — les mêmes forces nées, des siècles plus tôt, de la violence de la Guerre du Trône. Pour cette jeunesse prête à se battre, l'Empire n'est plus seulement un ennemi politique : c'est un moteur actif de Chaos qu'il faut arrêter, pas seulement contenir — l'expression la plus aiguë de la fracture entre Anciens et Jeunes déjà présente ailleurs dans le lore mordanel.\n\nCe second front et celui de la Coalition, si loin l'un de l'autre géographiquement, sont liés par une dépendance stratégique qu'aucun des deux camps ne reconnaît ouvertement : l'Empire ne peut engager la totalité de ses forces sur aucun des deux tant que l'autre reste actif. Un cessez-le-feu ou une victoire décisive sur l'un libérerait des troupes impériales suffisantes pour écraser l'autre. Arveth, à son insu ou presque, protège Mordanel simplement en continuant de se battre — et Mordanel, de la même façon, protège Arveth. Aucune alliance formelle ne lie les deux fronts : l'aversion d'Arveth pour les non-humains et le mépris elfique envers les hommes rendent toute coopération directe improbable. Mais chaque camp sait, sans jamais le dire à voix haute, que la survie de l'autre conditionne la sienne.",
    },
    {
      titre: "Les Nains de l'Ordre — forge et foi",
      contenu:
        "On ne prie pas Valdaan les mains vides — on ne s'adresse à lui qu'en travaillant. C'est pourquoi les Nains de l'Ordre n'ont pas de clergé au sens humain : les Gardiens du Marteau sont à la fois prêtres et maîtres-artisans, une seule fonction, jamais deux.\n\nLe nom de marteau\nChaque nain naît avec un nom de sang, privé et familial. Il reçoit son nom de marteau au terme de son premier ouvrage achevé seul — c'est ce second nom qui compte socialement. Un nain qui n'a pas encore de nom de marteau est dit \"non-forgé\", quel que soit son âge : un statut social bas, peu importe la naissance.\n\nLa marque de clan\nLe nom complet d'un nain de l'Ordre se décompose en trois parties : le prénom, le nom de famille (privé, hérité, transmis quelle que soit la trajectoire personnelle), et la marque d'appartenance de clan — qui ne s'hérite pas. Cette marque s'obtient en réussissant une épreuve propre à chaque clan : atteindre un certain niveau de maîtrise runique pour les Runegrave, être capable de forger une arme runique pour les Pierrefonde, avoir tué une dizaine d'orcs pour les Sombreforge, obtenir un diplôme de recherche en rune pour les Ferrune. Un nain né dans une famille de clan sans avoir passé l'épreuve reste identifié par son seul nom de famille — la marque de clan se mérite à chaque génération, elle ne se présume jamais.\n\nLes runes d'intention\nAucun objet consacré ne sort d'une forge sans une rune d'intention — protection, mémoire, patience, colère (comme outil ponctuel, jamais comme identité) — frappée dans le métal en même temps qu'il prend forme, jamais après. Une arme sans rune est un objet mort : du métal, pas une prière.\n\nForge-Runez\nAu sud de Kaldrun, Forge-Runez enseigne l'écriture runique à tous les apprentis du royaume avant leur admission dans les forges profondes de la capitale. Les mystères les plus anciens (le Marteau-Premier, les runes interdites) restent sous la montagne — Forge-Runez est la porte, pas le sanctuaire, ce qui en fait un lieu bien plus accessible aux étrangers que Kaldrun elle-même.\n\nLe métal muet de Serval\nÀ Serval, Kettil Rhennar et les artisans humains formés par les maîtres-forgerons nains ont hérité de la technique sans le rite. Les Nains de l'Ordre les respectent comme artisans, mais parlent en privé de \"métal muet\" — un ouvrage qui tient et protège, mais qui ne prie rien. Une friction discrète, jamais publique, sous une alliance par ailleurs solide.\n\nLe miroir de Khazrak Dûm\nCe que les Évolutionnistes envient le plus chez l'Ordre n'est pas sa richesse ni sa sécurité, mais sa complétude rituelle : le droit de graver une rune de mémoire ou de patience sans que ça les mette en danger le lendemain. Après des générations où chaque forge n'a servi que l'effort de survie face aux orcs, le vocabulaire runique complet s'est perdu chez eux — un savoir mort, pas une pratique restreinte. Ce n'est plus une blessure qu'on rumine : c'est devenu, de génération en génération, un projet — reprendre un jour Kaldrun, ou au moins ses forges sacrées, pour retrouver par la force ce que le temps et le pacte avec les orcs leur ont pris.",
    },
    {
      titre: "Géographie & capitales",
      contenu:
        "Un continent occidental et un continent oriental, séparés par une mer intérieure — la Mer de Cendre-Claire (les Solvariens) / Vaelthys, \"les eaux qui séparent\" (les Hauts Elfes).\n\nCONTINENT OCCIDENTAL\n• Empire de Solvarn — nord-centre — capitale Solmaris — villes : Fort Soleil (forteresse, nord), Kor Valdan (côte du Golfe d'Acier), Naros (fort-frontière face à Arveth), Durnholk — frontière sud avec Arveth, marches orientales disputées avec l'enclave mordanelle, côte orientale sur la Mer de Cendre-Claire (tête de pont vers Aetharion).\n• Valdorne — ouest — capitale Valdecourt — villes : Gardesèle (côte nord-ouest), Haldren — berceau de la Rupture.\n• Arveth — frontière directe avec Solvarn (le vacillant) — capitale Arvenfall — ville : Boigris (frontière des Marches Orientales).\n• Mornac — traversé par la Lisdane, côte sud — capitale Mornhaven — port secondaire : Port-Saphir — commerce.\n• Serval — Contreforts de Serval, allié aux Nains de l'Ordre — capitale Serval — villes : Grimval, Roc-Épine (grande ville côtière face au Détroit des Brumes) ; cols : Col du Corbeau, Col des Vents.\n• République de Liberra — sud, à l'embouchure de la Lisdane — capitale Libris — port principal : Port-Libris (Grand Port).\n• Enclave occidentale d'Aelindra — côte centre-ouest, frontière naturelle avec Liberra — Bois des Dryades. Communauté sylvaine installée loin de la patrie orientale, sans capitale propre, alliée naturelle de Liberra.\n• Enclave occidentale de Mordanel — marches orientales de Solvarn, côte, site du Silence de Valmoire — tête de pont impériale disputée vers Aetharion ; Fort de l'Aube en marque la frontière. Territoire séparé de la patrie orientale, sans capitale propre.\n• Nains de l'Ordre — Contreforts de Serval — capitale souterraine Kaldrun (\"la Cité sous la Montagne\") — site : Forge-Runez.\n• Khazrak Dûm (Nains Renégats) — les Failles Rouges, à l'est de Liberra, en bordure des terres orques — capitale Karag Dûm — ville : Grimgal. Scindés entre Résistants (proches de Kaldrun) et Évolutionnistes (enfoncés dans les Failles, au contact direct des tribus orques).\n• Tribus Orcs/Gobelins — terres sauvages à l'est de Liberra et au-delà des Failles Rouges.\n\nLA MER DE CENDRE-CLAIRE (VAELTHYS)\nSépare les deux continents. La guerre Solvarn/Aetharion s'y joue par débarquements et sièges côtiers plutôt que par une ligne de front terrestre — une guerre d'usure, sans percée décisive depuis 3 ans.\n\nCONTINENT ORIENTAL\n• Aetharion — côte occidentale face à Solvarn — forêt fermée — capitale Elyndoril — villes : Santhari (côte, face au Détroit des Brumes), Lorienn (grande ville côtière nord-est) — l'Arbre-Monde en son cœur : un lieu réel, caché, connu des seuls Hauts Elfes de haut rang et protégé par un réseau de bosquets à dryades. Officiellement nié comme lieu physique par la doctrine impériale (hérésie païenne) ; en pratique, objet d'enquêtes discrètes des Chevaliers-Inquisiteurs.\n• Aelindra (patrie) — sud d'Aetharion — capitale Cœuvre — villes : Aranil, Valmeryl. Patrie ancestrale des Elfes Sylvains ; l'enclave occidentale (côte de Liberra) en est une communauté séparée, sans lien de gouvernance directe.\n• Mordanel (patrie) — sud d'Aelindra — capitale Valdourt — villes : Myral, Ombreval. Patrie ancestrale des Elfes du Crépuscule ; l'enclave occidentale (marches de Solvarn, Silence de Valmoire) en est un territoire séparé, sans lien de gouvernance directe.\n• Tribus Orcs/Gobelins — marges orientales du continent, au-delà d'Aetharion.\n\nFLEUVES\n• La Sombre — frontière historique Solvarn/Arveth, gué de Fossessainte.\n• La Verselande — cœur des terres coalisées, entre Mornhaven et Valdorne, Pont-Rompu.\n• La Lisdane — source dans les Contreforts de Serval, traverse Mornac, se jette dans la mer près de Libris (alimente le Quartier des Marchés).",
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
        "PNJ clés à créer : l'Empereur de Solvarn ; un chevalier de Valdorne (l'idéal — voir Alaric de Valdorne comme référence/ancrage) ; un lord d'Arveth (le vacillant, tient les négociations secrètes avec Solvarn) ; un Ancien vs un Jeune Mordanel (fracture post-Silence de Valmoire) ; un Khazrak Dûm résistant (proche de Kaldrun, opposé aux Évolutionnistes) ; Korrin Sombreforge et le chef actuel du clan Grimgal comme PNJ historiques/antagonistes potentiels (cf. Le Scellement des Portes du Sud) ; le sort des Elfes ayant suivi les Enfants de la Sève dans leur bannissement (à développer — fil intentionnellement non révélé).",
    },
  ],
};

/* ============================================================
   CHRONOLOGIE (page "Lore" > onglet "Chronologie")
   Frise chronologique du monde. Chaque événement porte un tag `peuples`
   (tableau, même logique que le tag `race` du bestiaire) pour permettre un
   filtrage par peuple. Seuls les événements humains sont renseignés pour
   l'instant — les événements nains et elfiques seront ajoutés plus tard,
   sans changement de structure.
   ============================================================ */
const CHRONOLOGIE = [
  {
    id: "guerre-du-trone",
    periode: "La Guerre du Trône & la Fracture",
    quand: "il y a ~2000 ans",
    duree: null,
    peuples: ["elfes", "humains", "chaos"],
    description:
      "Des siècles de conflit divin entre Gardiens de l'Écorce et Enfants de la Sève. Le sang versé pendant la Fracture donne naissance aux Humains ; les Enfants bannis deviennent les Dieux du Chaos ; le continent occidental est ravagé, les Elfes survivants se replient à l'est.",
  },
  {
    id: "ere-tribus",
    periode: "Ère des tribus humaines",
    quand: "il y a ~1700 à ~2000 ans",
    duree: "~300 ans",
    peuples: ["humains"],
    description:
      "Sur un continent encore marqué par la guerre des dieux, les premières tribus humaines survivent en groupes épars, sans organisation durable.",
  },
  {
    id: "maitrise-feu-bronze-fer",
    periode: "Maîtrise du feu, du bronze puis du fer — première civilisation",
    quand: "il y a ~1200 à ~1700 ans",
    duree: "~500 ans",
    peuples: ["humains"],
    description:
      "Progrès techniques successifs jusqu'à l'émergence de la première grande civilisation humaine du continent.",
  },
  {
    id: "guerres-inter-civilisations",
    periode: "Guerres inter-civilisations humaines",
    quand: "il y a ~850 à ~1200 ans",
    duree: "~350 ans",
    peuples: ["humains", "chaos"],
    description:
      "Les civilisations humaines rivales s'affrontent pendant des générations. Cette violence prolongée nourrit indirectement l'essor des jeunes peuples orques et gobelins.",
  },
  {
    id: "premier-empire",
    periode: "Proclamation du Premier Empire",
    quand: "il y a ~850 ans",
    duree: null,
    peuples: ["humains"],
    description:
      "Une civilisation humaine s'impose sur toutes les autres et proclame l'unification. Huit grandes familles fondatrices accompagnent le premier Empereur.",
  },
  {
    id: "regne-premier-empire",
    periode: "Règne du Premier Empire",
    quand: "il y a ~170 à ~850 ans",
    duree: "~680 ans",
    peuples: ["humains"],
    description:
      "Stabilité relative sous l'autorité partagée des huit maisons, puis dérive doctrinale progressive de la dynastie régnante, obsédée par l'idée d'être la lignée élue du sang des Gardiens.",
  },
  {
    id: "rupture",
    periode: "La Rupture — Grande Sécession",
    quand: "il y a ~170 ans",
    duree: null,
    peuples: ["humains"],
    description:
      "Quatre des huit maisons font sécession et fondent les Royaumes Coalisés ; naissance de la République de Liberra. Cf. section \"La Rupture — chronique de la Grande Sécession\" pour le détail des batailles.",
  },
];

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
    id: "baldwin-iv",
    nom: "Roi Baldwin IV de Valdorne",
    titre: "Roi de Valdorne",
    faction: "Valdorne",
    secret: false,
    resume: "Porte l'héritage d'Alaric comme une conviction vivante — sincèrement habité par la quête de l'Aspect de la Bravoure, pas seulement par tradition politique.",
    description:
      "Baldwin gouverne Valdorne moins comme un roi pragmatique que comme le gardien d'un serment qui dépasse sa propre vie : voir un jour la bravoure de son peuple accomplir ce qu'Alaric a failli achever au Pont-Rompu. Cette conviction sincère explique son intransigeance envers Solvarn, jugée naïve par certains courtisans à mesure que la realpolitik gagne du terrain ailleurs dans la Coalition (Arveth en tête).\n\nIl ignore toujours que sa conseillère arcanique de longue date, Minerva Sarelle, a été assassinée par un agent solvarien plutôt que victime d'un accident rituel — il pleure une amie perdue à un mauvais moment, pas une victime de guerre. La vérité, si elle éclate, pourrait autant galvaniser son royaume que fragiliser sa confiance dans ses propres services.",
    accroches: [
      "Baldwin pourrait charger des PJ étrangers à la cour d'une quête directement liée à la recherche de \"preuves\" de l'Aspect — sans se douter de ce qu'ils pourraient réellement trouver.",
      "La découverte de la vérité sur Minerva Sarelle pourrait être révélée par des PJ, forçant Baldwin à choisir entre la colère et le doute sur son propre jugement.",
      "Sa fille Blanche pourrait tenter d'utiliser des PJ pour lui faire entendre raison sur le coût réel de la quête, sans jamais le confronter directement.",
    ],
  },
  {
    id: "reine-alienor",
    nom: "Reine Aliénor de Valdorne",
    titre: "Reine de Valdorne",
    faction: "Valdorne",
    secret: false,
    resume: "Partage pleinement la foi de son époux dans la quête de l'Aspect — les deux souverains y voient une conviction commune plutôt qu'un désaccord.",
    description:
      "Contrairement à beaucoup de mariages politiques entre maisons rivales, Aliénor et Baldwin partagent une foi authentique et commune dans l'héritage d'Alaric — ce qui rend leur couple inhabituellement uni face aux pressions de la cour. Elle gère la vie quotidienne de la couronne avec la même conviction tranquille que son époux, et c'est elle, plus que lui, qui a remarqué que leur fille Blanche commence à douter — sans savoir encore comment aborder la question sans la braquer.",
    accroches: [
      "Aliénor pourrait chercher un intermédiaire (un PJ de confiance) pour comprendre les doutes de Blanche avant qu'ils n'éclatent en conflit ouvert avec Baldwin.",
      "Sa foi sincère pourrait être mise à l'épreuve si des preuves contradictoires sur la nature de l'Aspect émergent.",
      "Elle pourrait être la première de la famille royale à apprendre la vérité sur Minerva Sarelle, et devoir décider seule si elle en parle à Baldwin.",
    ],
  },
  {
    id: "prince-roland",
    nom: "Prince héritier Roland de Valdorne",
    titre: "Héritier du trône de Valdorne (25 ans)",
    faction: "Valdorne",
    secret: false,
    resume: "Élevé pour devenir le prochain grand exemple chevaleresque — rêve d'accomplir ce qu'Alaric n'a pu terminer.",
    description:
      "Roland a grandi en écoutant les chants de Pont-Rompu comme d'autres enfants écoutent des berceuses. Il ne doute jamais de la quête de son père ; il rêve activement d'en devenir l'instrument, l'acte héroïque qui achèverait enfin ce qu'Alaric a commencé. Sire Tristan d'Aurvel, chevalier de l'Ordre du Pont déjà fatigué de porter cet idéal presque seul, voit en Roland à la fois un espoir sincère et une pression supplémentaire : le prince attend de lui des réponses que Tristan n'a plus la certitude de posséder.",
    accroches: [
      "Roland pourrait chercher à provoquer lui-même l'occasion d'un acte de bravoure suffisamment pur pour \"réussir\" là où des générations ont échoué — au risque de forcer les choses plutôt que de les laisser advenir.",
      "Sa relation avec Tristan d'Aurvel pourrait se tendre si Roland perçoit la fatigue morale du chevalier comme un manque de foi.",
      "Un PJ pourrait devenir malgré lui le témoin (ou l'objet) d'une quête que Roland engage pour prouver sa valeur avant même de monter sur le trône.",
    ],
  },
  {
    id: "princesse-blanche",
    nom: "Princesse Blanche de Valdorne",
    titre: "Princesse de Valdorne (21 ans)",
    faction: "Valdorne",
    secret: false,
    resume: "La seule voix de doute dans la famille royale — pas sur la sincérité de la quête, mais sur ce que Valdorne sacrifie pour la poursuivre.",
    description:
      "Blanche ne remet pas en cause la sincérité de son père, ni même la possibilité que l'Aspect existe un jour. Ce qui l'inquiète, c'est le prix : un royaume qui investit son autorité morale et une partie de sa force réelle dans une légende jamais prouvée, pendant que Solvarn regagne du terrain et que la Coalition se fracture doucement autour d'eux (Arveth en négociations secrètes, Serval de plus en plus conditionnel). Elle observe le pragmatisme grandissant ailleurs dans la Coalition avec un mélange d'envie et de culpabilité de ressentir cette envie.\n\nElle n'ose pas confronter son père directement — ce serait, à ses yeux comme aux siens, un acte de trahison familiale autant que politique.",
    accroches: [
      "Blanche pourrait chercher, par des canaux indirects (un PJ, un conseiller de confiance), à infléchir la politique de Valdorne sans jamais s'opposer publiquement à son père.",
      "Elle pourrait être la première de la famille à apprendre que Minerva Sarelle a été assassinée — et à comprendre ce que cela signifie pour la vulnérabilité réelle du royaume.",
      "Un rapprochement discret avec des voix pragmatiques d'Arveth ou de Mornac pourrait la faire apparaître, aux yeux de certains, comme une menace pour l'unité idéologique de Valdorne.",
    ],
  },
  {
    id: "ranulf-darvenfall",
    nom: "Lord Ranulf d'Arvenfall",
    titre: "Seigneur d'Arveth — le vacillant",
    faction: "Arveth",
    resume: "Il négocie en secret avec Solvarn, non par ambition, mais par peur sincère pour son peuple.",
    description:
      "Tient les négociations secrètes avec Solvarn. A vu, année après année, les raids solvariens saigner ses terres frontalières — hameaux brûlés, garnisons décimées. Convaincu qu'une guerre ouverte anéantirait son peuple, et que la Coalition, trop lente et trop divisée, n'enverra jamais l'aide nécessaire à temps. Ses négociations visent à obtenir un statut vassal survivable plutôt qu'une destruction certaine — pas une trahison par intérêt personnel. Ranulf se déteste pour ce choix autant qu'il le croit nécessaire ; il n'est l'ennemi de personne, sauf peut-être de lui-même. Ranulf n'a peut-être pas mesuré toute la portée de ses négociations : neutraliser Arveth ne libérerait pas seulement des troupes contre le reste de la Coalition, mais aussi contre Mordanel et les régiments d'Aetharion qui tiennent les Marches Orientales — un second front qu'il ignore protéger simplement en continuant, malgré lui, à se battre.",
    accroches: [
      "Les PJ interceptent une missive ou escortent un émissaire suspect.",
      "Ranulf sollicite directement les PJ pour \"évaluer discrètement\" une option de repli, sans révéler tout de suite ses vraies intentions.",
      "Confrontation possible avec Tristan d'Aurvel si les deux fils narratifs se croisent.",
    ],
  },
  {
    id: "osric-kell",
    nom: "Magistre Osric Kell",
    titre: "Superviseur des rites de guerre d'Arveth",
    faction: "Arveth",
    secret: false,
    resume: "Dirige les Écourtés et les Endurcis avec la conviction sincère qu'il s'agit du seul moyen de sauver Arveth — sans les remords qui rongent Ranulf.",
    description:
      "Là où Ranulf autorise les rites à contrecœur, Osric les a conçus et continue de les défendre avec une conviction froide et sans hésitation apparente : Arveth mourra de toute façon si personne n'agit, alors autant agir efficacement. Il tient des registres méticuleux des échecs (morts, mutations) qu'il présente à la cour comme un coût de guerre acceptable, au même titre que des pertes au combat — une comparaison que beaucoup, y compris Ranulf, ont du mal à accepter aussi froidement que lui.\n\nIl ignore encore que la propre fille de Ranulf s'est portée volontaire pour le Rite du Sang Renforcé ; quand il l'apprendra, sa réaction (fierté d'avoir une conversion aussi symbolique, ou malaise d'exposer la famille régnante au même risque que les autres) reste à déterminer selon les besoins de la campagne.",
    accroches: [
      "Osric pourrait chercher à recruter des PJ pour tester une variante plus risquée des rites, présentée comme une amélioration.",
      "Un PJ pourrait découvrir les registres des échecs d'Osric et devoir décider s'il les rend publics.",
      "La découverte qu'Elswyth s'est portée volontaire pourrait forcer Osric à choisir entre la protéger discrètement et la traiter comme n'importe quel autre sujet.",
    ],
  },
  {
    id: "merielle-darvenfall",
    nom: "Lady Mérielle d'Arvenfall",
    titre: "Épouse de Lord Ranulf d'Arvenfall",
    faction: "Arveth",
    secret: false,
    resume: "Porte en silence le poids des deux secrets de son mari — les négociations avec Solvarn, et maintenant le choix de leur fille.",
    description:
      "Mérielle a soutenu Ranulf à travers chacun de ses compromis, convaincue comme lui qu'un mauvais choix vaut parfois mieux qu'aucun choix. Mais la décision d'Elswyth de se soumettre elle-même au Rite du Sang Renforcé a fissuré cette solidarité silencieuse pour la première fois : Mérielle n'arrive pas à décider si elle est terrifiée, ou secrètement fière que sa fille refuse le privilège qui aurait dû la protéger.",
    accroches: [
      "Mérielle pourrait chercher, en secret et sans le dire à Ranulf, à obtenir des garanties d'Osric Kell sur la sécurité du rituel d'Elswyth.",
      "Elle pourrait devenir la première à craquer et révéler l'existence des négociations avec Solvarn, si la pression familiale devient trop forte.",
      "Un PJ pourrait devenir son confident malgré lui, simplement en étant présent au mauvais moment.",
    ],
  },
  {
    id: "edmund-darvenfall",
    nom: "Edmund d'Arvenfall",
    titre: "Héritier d'Arveth (24 ans)",
    faction: "Arveth",
    secret: false,
    resume: "Protégé par la coutume qui exempte la noblesse des rites de guerre — un privilège qu'il porte de plus en plus mal.",
    description:
      "Edmund n'a jamais eu à choisir entre l'enfance et le champ de bataille, contrairement à la plupart des jeunes gens de son âge à Arveth. Il le sait, et ça le ronge discrètement — d'autant plus depuis qu'Elswyth, sa cadette, a choisi de renoncer à cette même protection. Il n'a pas son courage, ou pas encore, et n'ose pas se l'avouer complètement.",
    accroches: [
      "Edmund pourrait chercher à compenser sa culpabilité par un excès de zèle politique ou militaire, sans jamais vraiment égaler le geste de sa sœur.",
      "Un PJ issu du peuple pourrait le confronter, consciemment ou non, sur le privilège dont il n'a jamais eu à répondre.",
      "Si Ranulf venait à disparaître, Edmund devrait choisir s'il perpétue les mêmes compromis ou change de cap — sans être certain d'en avoir la force.",
    ],
  },
  {
    id: "elswyth-darvenfall",
    nom: "Elswyth d'Arvenfall",
    titre: "Cadette d'Arveth (19 ans)",
    faction: "Arveth",
    secret: true,
    resume: "S'est portée volontaire pour le Rite du Sang Renforcé contre l'avis de son père — la noblesse d'Arveth n'est pas censée porter ce risque.",
    description:
      "Elswyth a grandi en regardant partir des jeunes gens de son âge, année après année, sans jamais avoir à craindre le même sort. Ce privilège est devenu, avec le temps, une honte qu'elle ne pouvait plus porter en silence. Contre l'avis explicite de Ranulf et à l'insu d'Osric Kell jusqu'à très récemment, elle s'est portée volontaire pour le Rite du Sang Renforcé — un geste qu'elle refuse de présenter comme un sacrifice, insistant qu'il s'agit simplement de justice.\n\nRanulf ne sait pas encore comment réagir : l'en empêcher par son autorité de père et de seigneur trahirait tout ce qu'il prétend défendre en autorisant le rite pour les autres ; la laisser faire pourrait lui coûter sa fille.",
    accroches: [
      "Le rituel d'Elswyth pourrait échouer, réussir, ou produire un résultat ambigu — un moment charnière pour toute la famille d'Arvenfall et pour la politique intérieure d'Arveth.",
      "Des PJ pourraient être sollicités, sciemment ou non, pour protéger ou surveiller Elswyth pendant ou après le rituel.",
      "Si sa décision devient publique, elle pourrait devenir malgré elle un symbole politique — pour ou contre la poursuite des rites de guerre — bien au-delà de ce qu'elle a voulu.",
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
    id: "brakka-thrundal",
    nom: "Maréchal Brakka Thrundal, dite Ligne-Tenue",
    titre: "Chef du clan Sombreforge",
    faction: "Nains de l'Ordre",
    resume: "A gagné sa marque de clan en tenant la ligne face aux orcs — et compte bien que Kaldrun n'oublie jamais ce que ça veut dire.",
    description:
      "Descendante directe de Korrin Sombreforge, Brakka a obtenu sa marque \"Ligne-Tenue\" en abattant une dizaine d'orcs lors d'une incursion aux Portes du Sud — l'épreuve martiale du clan, qu'elle a passée jeune et sans hésitation. Commande aujourd'hui la garnison de Kaldrun avec la même rigueur silencieuse que ses ancêtres : la sentinelle face aux galeries scellées n'est pas une corvée, c'est un rite qu'elle refuse de voir affaibli. Porte la version héroïque du Scellement sans nuance ni remords, et s'oppose à toute réconciliation avec Khazrak Dûm — moins par doctrine que par une fierté martiale qu'elle considère comme la seule chose qui reste intacte de ce que ses ancêtres ont payé.",
    accroches: [
      "Les bruits rapportés en silence par Pierrefonde finissent par remonter jusqu'à elle — sa réaction pourrait rouvrir le dossier du Scellement.",
      "Un jeune Sombreforge qui rechigne à l'épreuve des dix orcs (par pacifisme, blessure, ou doute) la place devant une contradiction qu'elle refuse d'examiner.",
      "Face-à-face possible avec Thrakan Kelgarn si un canal de dialogue s'ouvre malgré elle.",
    ],
  },
  {
    id: "ishma-kaelvorn",
    nom: "Haute Gardienne du Marteau Ishma Kaelvorn, dite Silence-Gravé",
    titre: "Cheffe du clan Runegrave",
    faction: "Nains de l'Ordre",
    resume: "Porte, en silence, le vrai poids théologique du Scellement — c'est son clan qui a gravé la rune, pas les soldats qu'on célèbre.",
    description:
      "A obtenu sa marque \"Silence-Gravé\" en atteignant la maîtrise runique la plus élevée reconnue par le clan Runegrave, dépositaire des mystères les plus anciens de l'Ordre — le Marteau-Premier compris. En tant que Haute Gardienne du Marteau, elle porte une charge que Sombreforge ignore superbement : c'est un maître Runegrave, pas un soldat, qui a gravé la rune interdite du Scellement. Ishma ne le rappelle jamais publiquement — le silence fait partie de la prière —, mais elle sait que la légitimité même des Gardiens du Marteau repose sur cette gravure plus que sur n'importe quel sacrifice martial.",
    accroches: [
      "La dissidence naissante chez les jeunes de Ferrune (son propre vivier) pourrait la forcer à sortir de son silence théologique.",
      "Un PJ Runegrave en quête de sa marque devrait affronter, via Ishma, ce que \"maîtrise runique reconnue\" veut vraiment dire au-delà du simple niveau technique.",
      "Détient peut-être, dans les mystères du Marteau-Premier, un savoir qui pourrait rouvrir ou refermer définitivement le dossier du Scellement.",
    ],
  },
  {
    id: "dorn-brannok",
    nom: "Maître des Galeries Dorn Brannok, dit Écoute-Roche",
    titre: "Chef du clan Pierrefonde",
    faction: "Nains de l'Ordre",
    resume: "Sait que quelque chose bouge derrière les galeries scellées — et n'a toujours pas osé le dire aux Sombreforge.",
    description:
      "A gagné sa marque \"Écoute-Roche\" en démontrant sa capacité à forger une arme runique — l'épreuve du clan Pierrefonde, plus discrète que celle des Sombreforge mais tout aussi exigeante. Dirige les architectes de galeries et les mineurs qui entretiennent en silence les murs du Scellement, pour s'assurer qu'ils tiennent. Rapporte depuis peu, à ses plus proches, des bruits réguliers de l'autre côté de l'effondrement — trop réguliers pour être naturels — une information qu'il n'a pas encore osé remonter officiellement aux Sombreforge, de peur de rouvrir un dossier que tout Kaldrun préférerait clos.",
    accroches: [
      "Les PJ pourraient être les premiers à qui Dorn confie ces bruits, avant même Brakka Thrundal.",
      "Une expédition discrète vers les galeries scellées, montée par Dorn sans en référer à l'autorité centrale.",
      "Si les bruits remontent enfin aux Sombreforge, Dorn devra assumer publiquement d'avoir attendu.",
    ],
  },
  {
    id: "kessa-hurnvig",
    nom: "Maîtresse de Forge-Runez Kessa Hurnvig, dite Double-Trempe",
    titre: "Cheffe du clan Ferrune",
    faction: "Nains de l'Ordre",
    resume: "Supervise une jeunesse qui commence, discrètement, à trouver absurde qu'on ne discute jamais du Scellement.",
    description:
      "A obtenu sa marque \"Double-Trempe\" en décrochant un diplôme de recherche en rune — la théorie éprouvée par la recherche, puis éprouvée par l'enseignement, comme le veut la devise du clan. Supervise Forge-Runez et la formation de tous les apprentis du royaume à l'écriture runique, avant leur admission dans les forges profondes de Kaldrun. Plus jeune et plus tournée vers l'extérieur que les autres chefs de clan, elle a le plus de contacts avec les artisans de Serval. Consciente qu'une frange discrète de ses propres apprentis commence à trouver absurde qu'on enseigne le Scellement comme une évidence morale sans jamais en débattre — elle n'encourage pas ouvertement cette dissidence, mais ne l'étouffe pas non plus.",
    accroches: [
      "La dissidence naissante chez ses apprentis pourrait devenir, si elle s'organise, le premier canal officieux de dialogue avec Khazrak Dûm que Kaldrun n'a jamais eu.",
      "Un PJ nain de l'Ordre pourrait être l'un de ces apprentis sympathisants à la cause de Thrakan Kelgarn.",
      "Kessa elle-même, tiraillée entre loyauté envers l'Ordre et curiosité intellectuelle, pourrait basculer selon comment les PJ abordent la question.",
    ],
  },
  {
    id: "vrag-grimgal",
    nom: "Vrag Grimgal",
    titre: "Chef de guerre du clan Grimgal — Évolutionniste",
    faction: "Khazrak Dûm",
    resume: "Rêve de fédérer les clans évolutionnistes pour reprendre Kaldrun par la force — et s'en approche, doucement.",
    description:
      "Chef de guerre du clan qui donne son nom à la forge de guerre de Karag Dûm — le clan évolutionniste le plus fervent, celui qui porte le plus ouvertement le rêve de reconquête de Kaldrun. Vrag travaille activement à fédérer les autres clans évolutionnistes derrière ce rêve, sans y être encore parvenu : Grimgal n'est pas encore assez puissant pour rassembler les autres à lui seul. Le jour où il y parviendrait, le rêve latent deviendrait une vraie menace militaire contre Serval et Kaldrun.",
    accroches: [
      "Un chef Grimgal charismatique (Vrag) qui parvient à fédérer les autres clans évolutionnistes transformerait le rêve latent en campagne militaire réelle.",
      "Les PJ pourraient intercepter ou infiltrer une tentative de Vrag de rallier un clan évolutionniste hésitant.",
      "Rivalité ou négociation possible avec Skarn Ombrefaille, dont les contacts commerciaux pourraient servir — ou entraver — les ambitions militaires de Vrag.",
    ],
  },
  {
    id: "skarn-ombrefaille",
    nom: "Skarn Ombrefaille",
    titre: "Négociant en chef du clan Ombrefaille — oscillant",
    faction: "Khazrak Dûm",
    resume: "Ni Résistant ni Évolutionniste — juste utile, avec des contacts que personne d'autre n'a.",
    description:
      "Tient le fil de tous les contacts commerciaux, légaux et de contrebande du clan Ombrefaille à travers les Failles Rouges — y compris avec des intermédiaires humains ou orques selon l'opportunité. Sans conviction idéologique forte, contrairement à Thrakan Kelgarn ou Vrag Grimgal, Skarn cultive délibérément son absence de camp : c'est ce qui lui donne accès à tout le monde. Point d'entrée naturel pour des PJ qui voudraient s'infiltrer dans l'un ou l'autre camp sans devoir déjà choisir un côté.",
    accroches: [
      "Skarn pourrait vendre une information à qui paie le mieux — y compris sur Vrag Grimgal ou Thrakan Kelgarn.",
      "Un PJ cherchant un point d'entrée neutre dans les Failles Rouges passe naturellement par lui.",
      "Sa neutralité pourrait se fissurer si l'un des deux camps lui fait une offre qu'il ne peut refuser.",
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
    titre: "Vigie des Docks de Port-Libris",
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
      "Elle a repéré les traces d'un réseau d'informateurs parallèle et soupçonne une fuite venue d'un rival qu'elle n'a pas encore identifié comme Aveline Roquefeu — les PJ pourraient devenir malgré eux les preuves qui lui manquent pour confirmer ses soupçons.",
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
    id: "theobald-ardenne",
    nom: "Théobald Ardenne",
    titre: "Flambeau Suprême du Sacerdoce Solaire",
    faction: "Solvarn",
    secret: false,
    resume: "Grand Pontife du culte solaire, sincèrement dévot — et seul dépositaire vivant, avec l'Empereur, du secret du couronnement d'Aurelian III.",
    description:
      "Élu à vie par le Concile des Flammes voici une douzaine d'années, après une carrière de simple Flambeau de paroisse dans une province reculée où il s'est fait connaître pour un ascétisme sans calcul — le genre de dévotion qu'on ne peut pas feindre assez longtemps pour tromper neuf hauts-clercs. Il croit sincèrement en tout ce qu'il prêche, ce qui en fait à la fois un chef spirituel respecté et un homme étonnamment naïf sur les intrigues qui se jouent sous lui.\n\nIl a hérité, avec sa charge, du secret le plus lourd du Sacerdoce : le Rite de l'Aube d'Aurelian III n'a jamais produit le signe attendu, et son prédécesseur a menti pour ne pas déstabiliser l'Empire. Théobald tient ce silence non par calcul politique, mais parce qu'il croit sincèrement que révéler le doute briserait quelque chose de plus grand que la vérité elle-même. Il n'a jamais utilisé ce levier — ce qui frustre profondément Aveline Roquefeu, sa Protectrice de la Flamme, qui y voit une arme dormante entre des mains qui refusent de s'en servir.",
    accroches: [
      "Une preuve troublante sur l'Arbre-Monde ébranle sa propre foi — comment un homme sincère réagit-il quand le doute touche enfin sa propre religion ?",
      "Aveline Roquefeu tente de le manipuler vers une action contre l'Empereur en s'appuyant sur le secret du couronnement, sans jamais le formuler aussi crûment.",
      "Les PJ deviennent malgré eux porteurs d'un signe (authentique ou fabriqué) touchant à l'Arbre-Monde, de quoi faire vaciller la dévotion sincère de Théobald.",
    ],
  },
  {
    id: "aveline-roquefeu",
    nom: "Aveline Roquefeu",
    titre: "Protectrice de la Flamme",
    faction: "Solvarn",
    secret: false,
    resume: "Numéro deux de facto de l'appareil inquisitorial — sincèrement dévouée à la doctrine en public, ambitieuse et calculatrice en privé.",
    description:
      "Officiellement chargée de superviser l'ensemble des Chevaliers-Inquisiteurs au nom du Concile des Flammes — une charge administrative que Théobald, peu intéressé par la logistique de la traque, lui a cédée presque entièrement dès son élection. Aveline s'en est servie pour construire, sans jamais le nommer ainsi, un pouvoir personnel qui dépasse largement son titre.\n\nElle a commencé, ces derniers mois, à tisser son propre réseau de confidents à travers Solmaris — officiellement pour la traque hérétique, en réalité pour accumuler du levier politique. Sans le savoir, elle recrute parfois les mêmes informateurs que le Regard Intérieur de l'Œil de Solmaris cultive depuis des années : Isaure Vantrel a remarqué les signes d'un réseau parallèle et a identifié Aveline comme la source — sans que celle-ci se doute un instant que l'Œil existe.\n\nBastian Vorn, Grand Inquisiteur et son subordonné le plus capable sur le terrain, exécute ses ordres sans poser de questions — sincèrement loyal à la doctrine, il ne soupçonne rien des ambitions personnelles de sa supérieure.",
    accroches: [
      "Un informateur d'Aveline appartient déjà secrètement au Regard Intérieur — un PJ pourrait se retrouver, sans comprendre l'enjeu, au centre de ce recoupement.",
      "Isaure Vantrel choisit la sape silencieuse plutôt que la dénonciation (retourner un contact en double agent, glisser une fausse piste hérétique) faute de pouvoir révéler l'existence de l'Œil — les PJ pourraient exécuter cette manœuvre sans savoir pour qui ils travaillent réellement.",
      "Aveline pousse discrètement Théobald vers le secret du couronnement d'Aurelian III sans jamais le formuler aussi explicitement — jusqu'où ira-t-elle si elle sent une opportunité ?",
    ],
  },
  {
    id: "imperatrice-liesenne",
    nom: "Impératrice Liesenne Solyr, née Fenlyre",
    titre: "Impératrice de Solvarn",
    faction: "Solvarn",
    secret: false,
    resume: "Épouse d'Aurelian III, choisie hors des huit maisons pour qu'aucune ne puisse revendiquer un droit de sang sur ses enfants.",
    description:
      "Issue d'une famille noble mineure sans rattachement aux huit maisons — un choix délibéré d'Aurelian III, déjà rongé par le doute sur son propre sang, qui ne pouvait tolérer qu'une maison puisse un jour revendiquer un droit sur ses enfants par la lignée maternelle. Discrète en public, redoutablement observatrice en privé.\n\nC'est elle, davantage que son époux, qui a fini par deviner que quelque chose s'est mal passé au Rite de l'Aube — sans qu'Aurelian le lui ait jamais avoué. Elle porte ce soupçon seule depuis des années, et observe ses quatre enfants avec la question silencieuse de savoir lequel d'entre eux devra un jour affronter le même rite qu'elle soupçonne d'avoir déjà brisé son père.",
    accroches: [
      "Liesenne pourrait confier son soupçon à un PJ de confiance plutôt qu'à son propre époux — pourquoi choisirait-elle un étranger plutôt que sa famille ?",
      "Elle observe ses enfants de près pour deviner lequel gérerait le mieux la vérité si elle venait à éclater publiquement.",
      "Un PJ pourrait devenir, sans le savoir, le vecteur qui confirme ou infirme son soupçon sur le Rite de l'Aube.",
    ],
  },
  {
    id: "prince-cassian",
    nom: "Prince héritier Cassian Solyr",
    titre: "Héritier du trône de Solvarn (24 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Dévotion publique presque excessive — et la terreur intime de revivre l'échec de son père au moment de son propre couronnement.",
    description:
      "Le plus proche de Théobald Ardenne personnellement, au point que certains à la cour murmurent qu'il ferait un meilleur Flambeau qu'Empereur. Sa piété rassure la cour et calme les tensions avec le Sacerdoce — mais elle cache la même angoisse que son père a portée en silence pendant des décennies : et si le Rite de l'Aube échouait de nouveau, pour lui, le jour de son propre couronnement ?\n\nIl ignore que sa mère a deviné la vérité sur le rite de son père. Il ignore surtout qu'Aurelian n'a jamais pu se résoudre à l'avertir de ce qui l'attend peut-être.",
    accroches: [
      "Cassian pourrait chercher, sans le dire à personne, à comprendre exactement ce qu'implique le Rite de l'Aube avant son propre couronnement.",
      "Sa proximité avec Théobald Ardenne pourrait le mettre, malgré lui, au centre des manœuvres d'Aveline Roquefeu.",
      "Si la vérité sur le couronnement de son père éclate avant le sien, Cassian devra décider s'il perpétue le mensonge ou le brise.",
    ],
  },
  {
    id: "prince-dorian",
    nom: "Prince Dorian Solyr",
    titre: "Second prince de Solvarn (21 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Ambitieux, cultive la Maison Ashe, rêve d'un commandement contre Aetharion — juge son frère aîné trop hésitant.",
    description:
      "Proche d'Aldric Ashe, avec qui il partage une vision martiale de ce que devrait être l'Empire — les deux hommes se sont liés d'amitié à l'Académie militaire, une relation que le Grand Maréchal Théodren Ashe encourage discrètement, sans savoir jusqu'où Dorian souhaite la pousser politiquement. Dorian n'a aucun doute théologique : sa foi est celle d'un soldat, simple et fonctionnelle. Il voit la guerre contre Aetharion comme une occasion de gloire personnelle autant que comme un devoir sacré.",
    accroches: [
      "Dorian pourrait pousser pour un commandement de terrain, quitte à court-circuiter la prudence de son frère aîné Cassian.",
      "Son amitié avec Aldric Ashe pourrait devenir un levier politique si la succession venait un jour à se contester.",
      "Sa soif de gloire pourrait le pousser à prendre des risques inconsidérés sur le front d'Aetharion — un PJ pourrait devoir le sauver de lui-même.",
    ],
  },
  {
    id: "prince-renaud",
    nom: "Prince Renaud Solyr",
    titre: "Troisième prince de Solvarn (17 ans)",
    faction: "Solvarn",
    secret: true,
    resume: "Le cadet studieux — en train de mettre discrètement la main sur des agents de bas niveau de l'Œil de Solmaris, sans savoir ce qu'il touche vraiment.",
    description:
      "Sa curiosité pour les vieux registres du couronnement de son père l'a mené, par accident, sur des traces administratives que même Ilsevar Cendreau croyait bien enterrées — des lignes de dépenses codées, des comptes de courrier qui ne correspondent à aucun poste officiel. Plutôt que de tout révéler (il n'en a d'ailleurs pas encore saisi l'ampleur), Renaud a commencé, ces derniers mois, à cultiver quelques agents de bas niveau un par un : un courrier qu'il a couvert après une erreur, un informateur mineur à qui il a rendu une faveur discrète.\n\nIl ne sait pas qu'il touche à l'Œil de Solmaris ; il croit avoir simplement trouvé des gens utiles et reconnaissants. Troisième dans l'ordre de succession, éclipsé par ses deux frères, il découvre pour la première fois ce que c'est que d'avoir du pouvoir que personne ne lui a donné — et il y prend goût.\n\nIlsevar Cendreau n'a encore rien remarqué : ce sont des agents trop bas dans la hiérarchie pour attirer son attention. Mais un réseau construit sans compartimentage, même petit, même innocent dans l'intention, est exactement le genre de faille que trois maîtres cloisonnés n'ont jamais pensé à surveiller — parce qu'elle ne vient d'aucun d'entre eux.",
    accroches: [
      "Un des agents de bas niveau que Renaud croit avoir \"recruté\" pourrait en réalité rendre compte à Vantrel ou Ashevel sans que personne ne s'en rende compte encore.",
      "Si Cendreau découvre ce que fait Renaud, la question devient : protège-t-il un prince maladroit, ou traite-t-il la fuite comme n'importe quelle autre menace ?",
      "Les PJ pourraient croiser un informateur mineur visiblement loyal à quelqu'un d'inattendu — un fil qui remonte, sans le vouloir, jusqu'à un prince de 17 ans.",
    ],
  },
  {
    id: "princesse-elyane",
    nom: "Princesse Elyane Solyr",
    titre: "Princesse de Solvarn (19 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Exclue de la succession par la primogéniture masculine, promise à un mariage politique qu'elle n'a pas choisi — la plus perspicace des quatre, et la seule que personne ne prend au sérieux.",
    description:
      "N'ayant aucune part légitime au trône (Cassian, puis Dorian, puis Renaud la précèdent tous dans l'ordre de succession), Elyane est traitée à la cour comme un instrument diplomatique plutôt que comme une héritière — un mariage avec une maison loyaliste ou, plus audacieusement, avec une maison sécessionniste dans l'espoir d'une paix future, est déjà envisagé sans qu'on lui ait vraiment demandé son avis.\n\nCette mise à l'écart a un effet inattendu : personne ne la surveille vraiment, ni ne se méfie d'elle. Elle observe tout — les tensions entre ses frères, l'inquiétude muette de sa mère, la piété trop parfaite de Cassian — et commence à assembler des pièces que personne d'autre n'a même cherché à relier.",
    accroches: [
      "Elyane pourrait être la première à remarquer que quelque chose ne va pas entre ses parents au sujet du couronnement de son père.",
      "Un mariage politique proposé pour elle (Solvarn ou Coalisé) pourrait devenir un point de départ de campagne à part entière.",
      "Sous-estimée par tous, elle pourrait devenir la meilleure alliée discrète des PJ à la cour impériale — ou leur pire adversaire, si elle décide de jouer sa propre partie.",
    ],
  },
  {
    id: "aldric-ashe",
    nom: "Aldric Ashe",
    titre: "Héritier de la Maison Ashe (27 ans, marié)",
    faction: "Solvarn",
    secret: false,
    resume: "Aîné de Théodren Ashe, rigide comme son père, sans le moindre doute sur la doctrine — marié à Dame Iselde Solenne.",
    description:
      "Groomé depuis l'enfance pour succéder à son père, Aldric incarne la discipline martiale d'Ashe sans jamais la questionner — contrairement à son frère cadet Ilyan. Son mariage avec Dame Iselde Solenne (cousine de la Grande Sacerdotesse Yvelle Solenne, non son fils Cyrian) lie en privé deux maisons officiellement rivales froides pour l'oreille de l'Empereur : ce que la politique de cour maintient à distance, le sang le rapproche malgré tout.\n\nProche ami du Prince Dorian Solyr depuis l'Académie militaire, il partage sa vision martiale de l'Empire et son impatience face à la guerre d'usure contre Aetharion.",
    accroches: [
      "Le mariage Ashe-Solenne pourrait devenir un canal de communication informel entre deux maisons qui, officiellement, se méfient l'une de l'autre.",
      "Son amitié avec le Prince Dorian pourrait le pousser vers des ambitions politiques dépassant largement le commandement militaire qu'il attend.",
      "Aldric pourrait être le premier à devoir choisir entre la loyauté à son père et celle à son frère si la fracture Ilyan/Théodren éclate publiquement.",
    ],
  },
  {
    id: "ilyan-ashe",
    nom: "Ilyan Ashe",
    titre: "Cadet de la Maison Ashe, écarté du commandement (24 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Doute de la méthode de l'Inquisition depuis Mornhaven — pas de la cause — et en paie le prix politique.",
    description:
      "Contrairement à son frère Aldric, Ilyan a vu d'assez près les conséquences du durcissement doctrinal hérité de son arrière-grand-père Corvain Ashe pour commencer à en douter — non pas de la nécessité de défendre l'Empire, mais des méthodes de plus en plus radicales employées en son nom. Son père Théodren l'a écarté du commandement plutôt que de le réduire publiquement au silence, un geste qui protège autant qu'il condamne : Ilyan reste un Ashe, mais un Ashe sans troupes.",
    accroches: [
      "Ilyan pourrait chercher des alliés discrets parmi ceux qui partagent ses doutes — dangereux, dans une maison qui ne tolère pas la dissidence publique.",
      "Un PJ pourrait le convaincre d'utiliser sa position marginale pour infléchir la doctrine de l'intérieur plutôt que de la fuir.",
      "Sa relation avec son frère Aldric, loyal jusqu'à l'aveuglement, pourrait se briser si les tensions internes à Ashe éclatent au grand jour.",
    ],
  },
  {
    id: "isabeau-ashe",
    nom: "Isabeau Ashe",
    titre: "Chevalier-Inquisiteur, benjamine de la Maison Ashe (20 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "A rejoint l'ordre militant que sa propre maison supervise — et fait déjà partie, sans le savoir vraiment, du réseau personnel qu'Aveline Roquefeu est en train de tisser.",
    description:
      "Plus jeune des trois enfants Ashe, Isabeau a choisi de rejoindre les Chevaliers-Inquisiteurs plutôt que l'armée régulière — un choix que son père approuve publiquement, sans se douter que sa fille sert, dans les faits, davantage les intérêts personnels d'Aveline Roquefeu que la doctrine officielle du Concile. Isabeau croit servir la Flamme ; elle ignore la distinction, de plus en plus ténue, entre les deux.",
    accroches: [
      "Isabeau pourrait être chargée par Roquefeu d'une mission qui, sur le terrain, ressemble à s'y méprendre à une affaire de famille Ashe — sans qu'elle comprenne le double jeu.",
      "Si elle découvre la nature réelle du réseau de Roquefeu, la question devient : le rapporte-t-elle à son père, au Concile, ou garde-t-elle le silence par loyauté mal placée ?",
      "Son lien de sang avec Ashe pourrait un jour rapprocher, sans le vouloir, les intérêts de sa maison et ceux de Roquefeu.",
    ],
  },
  {
    id: "cyrian-solenne",
    nom: "Cyrian Solenne",
    titre: "Fils unique de la Grande Sacerdotesse Yvelle Solenne (26 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Voix montante des Cendres Blanches — la faction radicale que sa propre mère peine justement à contrôler.",
    description:
      "Là où Yvelle Solenne incarne une foi sincère mais mesurée, son fils Cyrian a trouvé dans les Cendres Blanches une ferveur plus tranchante, plus jeune, qui le séduit précisément parce qu'elle dépasse la prudence politique de sa mère. Il ne s'oppose pas à elle ouvertement — ce serait un scandale que ni l'un ni l'autre ne peut se permettre — mais son influence grandissante sur la faction inquiète Yvelle bien plus que n'importe quel rival extérieur.",
    accroches: [
      "Cyrian pourrait pousser les Cendres Blanches vers une action radicale que sa mère serait ensuite forcée de désavouer publiquement — ou de couvrir.",
      "Un PJ pourrait devenir, sans le vouloir, la preuve vivante que la doctrine de pureté du sang est plus compliquée que les Cendres Blanches ne le prêchent.",
      "La relation mère-fils pourrait se briser publiquement si Cyrian venait à dépasser une ligne que Yvelle ne peut tolérer.",
    ],
  },
  {
    id: "renard-vosgard",
    nom: "Renard Vosgard",
    titre: "Héritier de la Maison Vosgard (29 ans, marié)",
    faction: "Solvarn",
    secret: false,
    resume: "Aîné discipliné, futur Intendant sans surprise — marié à une parente éloignée de la Comtesse Yselde Maren de Mornac.",
    description:
      "Administrateur prometteur, Renard suit la voie tracée par son père sans dévier — son mariage avec une parente de la dynastie marchande de Mornac a été salué comme un coup diplomatique brillant, resserrant des liens commerciaux déjà informels entre les deux maisons. Ce que Renard ignore : cette même alliance sanctionnée officiellement offre, par accident, une couverture presque parfaite à la fuite de renseignements économiques bien moins officielle que sa sœur Isolde entretient vers ce même Mornac.",
    accroches: [
      "Si la fuite d'Isolde est découverte, les soupçons tomberont d'abord sur le mariage de Renard avant qu'on ne pense à elle.",
      "Renard pourrait involontairement transmettre une information sensible en toute innocence, croyant qu'il s'agit d'une correspondance familiale ordinaire.",
      "Sa loyauté envers son père pourrait être testée s'il découvre que sa propre sœur a exploité son mariage sans son consentement.",
    ],
  },
  {
    id: "isolde-vosgard",
    nom: "Isolde Vosgard",
    titre: "Cadette de la Maison Vosgard (25 ans)",
    faction: "Solvarn",
    secret: true,
    resume: "Source réelle et personnelle de la fuite de renseignements économiques vers Mornac déjà connue de la maison — pas seulement une affaire d'intérêt commercial.",
    description:
      "Officiellement, la maison Vosgard tolère que certains de ses agents vendent des renseignements économiques à Mornac par simple opportunisme commercial. En réalité, c'est Isolde elle-même qui alimente une bonne partie de cette fuite — pour des raisons plus personnelles que mercantiles, qu'elle n'a confiées à personne. Le mariage de son frère Renard avec une parente de Mornac lui offre une couverture inespérée : personne ne s'étonne des échanges réguliers entre les deux maisons.",
    accroches: [
      "La vraie raison d'Isolde (romantique ? un vieux ressentiment familial ? une dette qu'elle rembourse ?) reste à la discrétion du MJ — un bon accroche à développer selon les besoins de la campagne.",
      "Si son père Bastian découvre la vérité, la question devient : protège-t-il sa fille, ou fait-il un exemple pour préserver la réputation de la maison ?",
      "Isolde pourrait recruter un PJ, sans lui révéler l'ampleur réelle de ce qu'elle fait, pour une mission qui semble anodine mais touche à Mornac.",
    ],
  },
  {
    id: "tobias-vosgard",
    nom: "Tobias Vosgard",
    titre: "Benjamin de la Maison Vosgard (21 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Ambitieux, frustré par une maison \"indispensable et méprisée\" à la cour — cherche une reconnaissance politique que l'argent seul ne lui donne pas.",
    description:
      "Tobias a grandi en observant son père gérer les finances d'un Empire qui ne remercie jamais publiquement la maison Vosgard pour son travail indispensable. Contrairement à son frère Renard, satisfait de l'ombre utile, Tobias veut que sa maison soit reconnue pour ce qu'elle apporte réellement — quitte à chercher des alliances politiques plus audacieuses que ce que son père jugerait prudent.",
    accroches: [
      "Tobias pourrait chercher à se rapprocher du Prince Dorian ou d'Aldric Ashe pour offrir un soutien financier en échange d'une reconnaissance politique.",
      "Son impatience pourrait le pousser à prendre des initiatives que Bastian Vosgard devra ensuite désavouer ou couvrir.",
      "Il pourrait devenir un point d'entrée pour des PJ cherchant un financement discret — à condition d'accepter de jouer selon ses propres ambitions.",
    ],
  },
  {
    id: "garrick-kestrel",
    nom: "Garrick Kestrel",
    titre: "Fils unique de la Margravine Sélène Kestrel (23 ans)",
    faction: "Solvarn",
    secret: false,
    resume: "Endurci par la frontière, rancunier envers le mépris de la Maison Ashe pour les rapports de sa mère — pourrait chercher des appuis en dehors des canaux officiels.",
    description:
      "Élevé sur les Marches orientales plutôt qu'à la cour de Solmaris, Garrick a vu de ses propres yeux l'épuisement réel des garnisons que sa mère maquille dans ses rapports à Ashe pour éviter d'admettre publiquement leur vulnérabilité. Ce mépris silencieux de la capitale envers la frontière qui la protège le pousse, en privé, à envisager des solutions que sa mère refuserait d'approuver ouvertement — y compris, potentiellement, des contacts discrets avec des homologues coalisés partageant la même frustration face à leurs propres capitales (échec en miroir avec Lord Ranulf d'Arveth, déjà engagé dans des négociations secrètes avec Solvarn).",
    accroches: [
      "Garrick pourrait initier un contact non-officiel avec quelqu'un côté Arveth ou Serval, par pur pragmatisme frontalier plutôt que par trahison.",
      "Si Ashe découvre que Kestrel maquille ses rapports, Garrick pourrait être le premier à en payer le prix politique à la place de sa mère.",
      "Sa frustration pourrait le rendre réceptif à une offre extérieure (Œil de Solmaris, un PJ, un rival) qu'il ne verrait pas venir dans un contexte moins désespéré.",
    ],
  },
  {
    id: "minerva-sarelle",
    nom: "Minerva Sarelle",
    titre: "Ancienne mage attitrée de la couronne de Valdorne (assassinée)",
    faction: "Valdorne",
    resume: "Conseillère arcanique du Roi pendant des décennies, morte dans des circonstances qu'elle seule aurait pu expliquer.",
    description:
      "Retrouvée morte il y a quelques mois dans sa tour d'étude à Valdecourt — la version officielle parle d'une défaillance rituelle, un accident regrettable mais plausible pour une mage de son âge manipulant des forces puissantes. En réalité, assassinée par un agent solvarien, probablement pour l'empêcher de terminer une recherche ou de transmettre une information à la couronne. Seule une poignée de personnes soupçonne la vérité ; personne ne peut encore la prouver. Le Roi Baldwin IV lui-même ignore tout du meurtre — il pleure une amie perdue à un mauvais moment, pas une victime de guerre.",
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
  {
    id: "torvald-sten",
    nom: "Margrave Torvald Sten",
    titre: "Margrave de Serval",
    faction: "Serval",
    secret: false,
    resume: "Montagnard austère dont la légitimité repose autant sur l'alliance avec les Nains de l'Ordre que sur son sang — méprise ouvertement la rigidité doctrinale de Solvarn.",
    description:
      "Torvald gouverne Serval avec la conviction tranquille que la survie de son royaume n'a jamais dépendu de la pureté de quiconque, mais de la solidité de ses alliances — d'abord avec les Nains de l'Ordre, plus récemment avec l'enclave occidentale d'Aelindra. Il tient la frange isolationniste de sa noblesse à distance par autorité personnelle plutôt que par consensus, un équilibre de plus en plus fragile à mesure que la guerre s'éternise sans bénéfice direct visible pour les cols de Serval.\n\nSa fille Sigrun est devenue, sans qu'il l'ait voulu ni qu'elle l'ait entièrement cherché, le visage de cette même frange isolationniste — une situation que Torvald refuse encore d'affronter directement, espérant que le temps ou la raison politique règle la question avant que la succession ne le fasse à sa place.",
    accroches: [
      "Torvald pourrait solliciter des PJ étrangers pour sonder discrètement l'étendue réelle du soutien à Sigrun parmi la noblesse, sans passer par ses propres conseillers.",
      "Une crise sur la frontière des cols pourrait forcer Torvald à choisir entre renforcer la Coalition ou céder du terrain aux arguments isolationnistes de sa fille.",
      "Sa relation avec les Gardiens du Marteau de Kaldrun pourrait être mise à l'épreuve si les tensions internes de l'Ordre (Runegrave, dissidence sur le Scellement) débordent sur le terrain diplomatique servalin.",
    ],
  },
  {
    id: "halvard-sten",
    nom: "Halvard Sten",
    titre: "Héritier de Serval",
    faction: "Serval",
    secret: false,
    resume: "Poursuit avec conviction la philosophie d'alliance de son père — se rêve en pont naturel entre Serval, les Nains de l'Ordre et Aelindra.",
    description:
      "Halvard a grandi en accompagnant son père dans les forges profondes de Kaldrun et sur les routes commerciales vers l'enclave d'Aelindra, et il en a tiré une conviction sincère : l'avenir de Serval n'est pas dans le repli sur ses cols, mais dans l'approfondissement de ces alliances. Il espère, une fois sur le trône, formaliser la relation avec Aelindra en quelque chose de plus durable qu'un simple commerce — une ambition qui inquiète autant qu'elle inspire, selon qui l'écoute à la cour de Serval.",
    accroches: [
      "Halvard pourrait chercher à négocier lui-même, en parallèle de son père, un accord plus formel avec Aelindra — au risque de le court-circuiter politiquement.",
      "Sa relation avec sa sœur Sigrun pourrait basculer en confrontation ouverte si la question de la succession venait à se poser plus tôt que prévu.",
      "Un PJ elfe sylvain ou nain pourrait devenir, sans le chercher, un argument vivant dans le débat que Halvard mène contre la frange isolationniste.",
    ],
  },
  {
    id: "sigrun-sten",
    nom: "Sigrun Sten",
    titre: "Cadette de Serval, figure de la frange isolationniste",
    faction: "Serval",
    secret: false,
    resume: "Devenue, sans l'avoir entièrement cherché, le visage de la noblesse servaline qui veut se retirer de la Coalition.",
    description:
      "Sigrun n'a jamais officiellement pris la tête du mouvement isolationniste — elle a simplement exprimé, plus ouvertement que son père ne le tolérait à la cour, que Serval saigne pour des royaumes qui ne l'ont jamais aidé en retour. Ses mots ont suffi à faire d'elle un point de ralliement, qu'elle le veuille ou non, pour une frange de jeune noblesse déjà convaincue avant même qu'elle ne parle. Elle n'est pas hostile aux Nains ni à Aelindra — son désaccord porte uniquement sur la Coalition et son coût, pas sur l'ouverture aux autres peuples qui définit Serval depuis des générations.",
    accroches: [
      "Sigrun pourrait chercher à clarifier publiquement les limites de sa position (pro-alliance non-humaine, anti-Coalition) avant que d'autres ne la déforment à leur avantage.",
      "Une tentative de récupération politique par un tiers (Solvarn ? Une faction de Mornac intéressée par un flanc coalisé affaibli ?) pourrait forcer Sigrun à choisir un camp plus fermement qu'elle ne le souhaite.",
      "Le conflit larvé avec son frère Halvard pourrait éclater au grand jour si Torvald venait à trancher publiquement en faveur de l'un des deux.",
    ],
  },
  {
    id: "freya-kallsen",
    nom: "Commandante Freya Kallsen",
    titre: "Commandante des Régiments de Poudre de Serval",
    faction: "Serval",
    secret: false,
    resume: "Dirige les rares régiments d'élite équipés d'armes à feu — la technologie la plus jalousement gardée de Serval.",
    description:
      "Freya commande les quelques centaines de soldats formés à l'usage du mousquet et du pistolet, une arme encore trop coûteuse et trop instable pour équiper davantage que ces unités d'exception. Elle travaille en coordination étroite avec Kettil Rhennar pour l'entretien et l'amélioration continue de cette technologie, et considère son commandement comme le véritable joyau militaire de Serval — plus décisif, à ses yeux, que n'importe quel nombre de lances et de boucliers.",
    accroches: [
      "Une puissance étrangère (Solvarn, une guilde de Mornac, ou un acteur encore plus discret) pourrait chercher à percer le secret de fabrication des armes à feu servalines via Freya ou ses hommes.",
      "Un incident lors d'un entraînement (arme instable, accident de poudre) pourrait relancer le débat interne sur la sécurité et le coût réel de cette technologie.",
      "Freya pourrait être sollicitée pour évaluer si la technologie devrait être partagée avec le reste de la Coalition — une décision aux conséquences stratégiques majeures.",
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
    histoire:
      "Solvarn est né d'un choix, pas d'une conquête : quand la dynastie régnante du Premier Empire a durci sa doctrine solaire, elle a revendiqué pour elle seule l'exclusivité du sang divin des Gardiens de l'Écorce, verrouillant un pouvoir jusque-là partagé entre les grandes maisons provinciales.\n\nQuatre d'entre elles — futurs Valdorne, Arveth, Mornac et Serval — ont refusé cette purification et se sont soulevées ensemble : la Rupture. Dix ans de guerre, trois batailles devenues légende chez l'ennemi (Fossessainte, Mornhaven, Pont-Rompu), et un Armistice des Quatre Sceaux que l'Empire n'a jamais accepté comme définitif — seulement comme une pause tactique.\n\nLes quatre maisons restées fidèles — Ashe, Solenne, Vosgard, Kestrel — ont hérité chacune d'un pan du pouvoir impérial reconstruit après la sécession : l'épée, la foi, la bourse, la frontière. Elles ne se voient pas comme les vainqueurs d'une guerre civile, mais comme les gardiennes de ce que les traîtres ont abandonné.\n\nDepuis, Solvarn n'a jamais renoncé à l'idée de reconquérir ce qu'il a perdu. La doctrine de pureté du sang, née de cette rupture, s'est retournée vers l'extérieur : d'abord contre les Royaumes sécessionnistes, puis, sans que l'ironie échappe à personne à la cour, contre les Elfes d'Aetharion — la guerre ouverte qui occupe aujourd'hui l'essentiel des forces impériales.\n\nCette histoire se lit jusque dans la pierre. L'architecture solvarienne obéit à deux registres qui ne se mélangent jamais : le Zénith, réservé aux centres de pouvoir, aux quartiers nobles et aux temples, où tout est marbre blanc, bronze doré et démesure — une pureté qui s'affiche parce qu'elle ne peut jamais tout à fait se prouver ; et la Marche, qui couvre tout le reste, granit gris et fer nu, où la seule vertu visible est la fonction. Plus un lieu est proche du pouvoir, plus il éblouit ; plus il en est loin, plus il se tait.\n\nL'Ordre Solaire, réservé au Zénith, décline la colonne classique en un chapiteau où les rayons de bronze doré remplacent les feuilles d'acanthe, et couronne ses frontons d'un oculus unique — un disque qui figure tantôt le soleil, tantôt une fenêtre de guet, sans qu'on sache jamais lequel des deux on croise du regard. L'Ordre de la Marche, à l'inverse, réduit la colonne à un pilastre plein, sans ornement ni chapiteau : un ordre qui refuse d'être regardé. Les deux se retrouvent dans les mêmes motifs, gravés en or sur le premier, en fer nu sur le second — le soleil à huit branches d'Aethar, la couronne de flammes qui orne les statues des empereurs et des Flambeaux Suprêmes à la place d'une couronne de laurier, et les Frises de Purification, bas-reliefs qui rejouent Fossessainte, Mornhaven et Pont-Rompu en triomphes éclatants, très loin des défaites stratégiques qu'elles furent réellement. Partout, en Zénith comme en Marche, les Niches de Confession creusent les murs publics — vides, silencieuses, attendant qu'un citoyen y dépose une suspicion d'hérésie.\n\nSolmaris elle-même incarne ce contraste à l'échelle d'une ville. Le Zénith s'élève sur l'éperon rocheux qui domine la cité, accessible par la seule Voie Dorée, une voie processionnelle bordée de statues colossales aux anciens empereurs et Flambeaux — leurs yeux jamais sculptés, blancs et vides, aveugles et omniscients à la fois. La gravir dit le rang de qui la gravit : litière, cheval ou à pied, la vitesse d'ascension est elle-même un langage social. Trois monuments s'y disputent l'horizon : le Temple-Mère de la Maison Solenne, dôme doré visible depuis n'importe quel point de la ville ; le Palais du Zénith, résidence impériale bâtie sciemment un peu plus bas que le Temple — un rappel de pierre, permanent et silencieux, que même l'Empereur reste sous la légitimité que lui accorde le Sacerdoce ; et le Cénacle des Flammes, où siège le Concile. À l'écart, dans une ruelle sans ornement que la Voie Dorée ne laisse presque pas deviner, se cache la Chancellerie du Zénith — couverture administrative de l'Œil de Solmaris, assez proche du pouvoir pour agir vite, assez terne pour n'attirer aucun regard.\n\nEn contrebas s'étend la Marche, organisée non en quartiers nobles mais en quartiers fonctionnels qui reprennent la logique des quatre maisons loyalistes : le Bastion, casernes et arsenaux d'Ashe contre les murs d'enceinte ; les Greniers, entrepôts et Trésorerie de Vosgard, sciemment sans éclat ; et le Front, quartier populaire d'artisans et de familles qui envoient leurs fils tenir les garnisons de Kestrel. Un seul monument y rivalise en taille, sinon en faste, avec le Zénith : le Mur des Confessions, longue paroi de granit brut qui traverse tout le Front, percée de centaines de niches — la surveillance, ici, ne se fait pas discrète, elle s'affiche, précisément parce que c'est dans ce quartier que Solvarn redoute le plus le ressentiment.\n\nCe qui frappe d'abord un visiteur à Solmaris n'est pourtant pas ce qu'il voit, mais ce qu'il entend : les cloches du Temple-Mère sonnent les heures solaires — lever, zénith, coucher — sur toute la ville, et la Marche entière s'immobilise quelques secondes à chaque sonnerie, tête baissée. Ne pas s'arrêter, c'est se faire remarquer.",
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
          "Chef actuel : Grand Maréchal Théodren Ashe, arrière-petit-fils du Haut-Maréchal Corvain Ashe (Siège de Mornhaven). Rigide, incorruptible en apparence — use la doctrine de son aïeul comme un dogme figé plutôt qu'une conviction vivante.\n\nBlason : soleil noir sur bronze, deux lames croisées. Commande l'armée impériale régulière, forme les officiers, supervise (sans les diriger) les Chevaliers-Inquisiteurs.\n\nFamille : trois enfants. Aldric (aîné, 27 ans, marié à Dame Iselde Solenne), héritier sans le moindre doute ; Ilyan (cadet, 24 ans), écarté du commandement ; Isabeau (benjamine, 20 ans), Chevalier-Inquisiteur — cf. PNJ clés pour le détail des trois.\n\nFracture interne : Ilyan doute depuis Mornhaven — pas de la cause, de la méthode — et a été écarté du commandement plutôt que réduit au silence publiquement.\n\nMiroir : Valdorne, la chevalerie sincère devenue discipline totale.",
      },
      {
        nom: "Maison Solenne — La Flamme",
        devise: "La lumière ne négocie pas.",
        blason: "assets/blasons/blason_solenne.png",
        description:
          "Cheffe actuelle : Grande Sacerdotesse Yvelle Solenne, charismatique, absolument sincère dans sa foi — ce qui la rend plus dangereuse qu'une cynique.\n\nBlason : flamme dorée à sept pointes sur pourpre. Tient le Temple-Mère, légitime la lignée impériale, supervise doctrinalement les Chevaliers-Inquisiteurs.\n\nFamille : un fils unique, Cyrian (26 ans) — voix montante des Cendres Blanches, la faction que sa propre mère peine justement à contrôler (cf. PNJ clés).\n\nFracture interne : les \"Cendres Blanches\", faction jeune du clergé, prônent une purification encore plus radicale — tolérées comme bras armé idéologique, elles commencent à échapper à son contrôle.\n\nMiroir : aucun miroir sécessionniste direct — Solenne est le cœur idéologique de l'Empire.",
      },
      {
        nom: "Maison Vosgard — La Bourse",
        devise: "Ce qui se compte, se gouverne.",
        blason: "assets/blasons/blason_vosgard.png",
        description:
          "Chef actuel : Intendant Général Bastian Vosgard, administrateur brillant, sans conviction religieuse réelle.\n\nBlason : balance dorée sur gris-bleu. Trésorerie impériale, impôts provinciaux, logistique militaire — Ashe dépend de lui autant que de ses propres officiers.\n\nFamille : trois enfants. Renard (aîné, 29 ans, marié à une parente de la Comtesse Yselde Maren de Mornac) ; Isolde (cadette, 25 ans) ; Tobias (benjamin, 21 ans) — cf. PNJ clés pour le détail des trois.\n\nFracture interne : certains agents Vosgard vendent des renseignements économiques à Mornac, par intérêt commercial plus que par trahison idéologique — le mariage de Renard avec Mornac offre, sans qu'il le sache, une couverture parfaite à cette fuite.\n\nMiroir : Mornac, le pragmatisme marchand devenu corruption structurelle.",
      },
      {
        nom: "Maison Kestrel — Les Marches",
        devise: "La peur tient mieux qu'un traité.",
        blason: "assets/blasons/blason_kestrel.png",
        description:
          "Cheffe actuelle : Margravine Sélène Kestrel, dure, pragmatique, façonnée par des décennies de guerre frontalière contre Aetharion et les passes disputées avec Khazrak Dûm.\n\nBlason : faucon gris plongeant sur blanc glacé. Défend les Marches orientales, gère les garnisons frontalières et un réseau d'éclaireurs au-delà des lignes.\n\nFamille : un fils unique, Garrick (23 ans), endurci par la frontière et rancunier envers le mépris d'Ashe pour les rapports de sa mère (cf. PNJ clés).\n\nFracture interne : maquille ses rapports envoyés à Ashe pour cacher l'épuisement réel de ses garnisons sous-équipées.\n\nMiroir : Serval, même géographie montagnarde, logique opposée (alliance vs domination par la peur).",
      },
      {
        nom: "Inquisition",
        devise: "Rien n'échappe à la Flamme — sauf, peut-être, ce qu'elle refuse elle-même de voir.",
        secret: true,
        id: "inquisition",
        description:
          "Née du durcissement doctrinal qui a suivi l'échec du Haut-Maréchal Corvain Ashe à Mornhaven et Pont-Rompu, l'Inquisition traque l'hérésie et surveille la pureté doctrinale au nom du Concile des Flammes. Officiellement, elle ne répond qu'au Concile et, in fine, au Flambeau Suprême — les Chevaliers-Inquisiteurs, guerriers-clercs d'élite, en sont le bras armé le plus visible.",
        descriptionSecrete:
          "Dans les faits, c'est Aveline Roquefeu, Protectrice de la Flamme, qui en dirige l'essentiel du quotidien — une charge administrative que Théobald Ardenne, Flambeau Suprême sincèrement dévot mais peu intéressé par la logistique de la traque, lui a cédée presque entièrement dès son élection. Sans le savoir, Aveline a ouvert un front invisible contre l'Œil de Solmaris en recrutant sur le même terrain que le Regard Intérieur d'Isaure Vantrel — une guerre froide que ni l'une ni l'autre ne peut se permettre de rendre publique. Bastian Vorn, Grand Inquisiteur et agent de terrain le plus capable d'Aveline, exécute ses ordres sans poser de questions, sincèrement loyal à la doctrine — il ignore tout des ambitions personnelles de sa supérieure.",
      },
      {
        nom: "Œil de Solmaris",
        devise: "Ce qui n'existe sur aucun registre ne peut être ni confirmé, ni trahi.",
        secret: true,
        id: "oeil-solmaris",
        description:
          "Rumeur persistante à la cour de Solmaris : au-delà de l'armée et de l'Inquisition, l'Empereur disposerait d'un service de renseignement personnel, jamais officiellement reconnu, répondant à lui seul.",
        descriptionSecrete:
          "Fondé en secret par l'Empereur Aurelian III dans les mois de panique qui ont suivi la Sécession des quatre maisons, l'Œil de Solmaris répond uniquement à la Couronne — jamais à l'Église, jamais aux maisons loyalistes. Son fondateur, Ilsevar Cendreau, Veilleur Suprême sous couverture de chancelier du Zénith, cloisonne volontairement ses deux maîtres de terrain : Isaure Vantrel, Maître du Regard Intérieur, surveille les quatre maisons loyalistes sous couverture de dame de compagnie itinérante, et a récemment repéré les traces d'un réseau rival qu'elle attribue à la Protectrice de la Flamme, sans savoir que celle-ci ignore tout de l'Œil ; Corentin Ashevel, Maître du Regard Lointain, opère sur le front d'Aetharion et jusqu'à Libris, exploitant les liens de sang entre maisons loyalistes et sécessionnistes. Une confrontation ouverte avec l'Inquisition exposerait l'existence même de l'Œil à l'appareil religieux — un risque qu'aucun des deux camps n'est prêt à prendre, pour l'instant.",
      },
    ],
    synthese:
      "Rapports de force à la cour de Solmaris (contexte : guerre ouverte contre Aetharion, siège naval sans percée depuis 3 ans)\n\n1. Ashe — ascendante : l'armée est incontournable en temps de guerre, mais dépend entièrement de Vosgard pour le financement.\n2. Solenne — le levier silencieux : légitimité rituelle de l'Empereur, mais les Cendres Blanches échappent peu à peu à son contrôle.\n3. Vosgard — indispensable et méprisée : pouvoir structurel jamais honoré en public.\n4. Kestrel — puissante localement, marginale à la cour : isolée politiquement, dépend de renforts qui n'arrivent jamais vraiment.\n\nAxes de tension : Ashe ↔ Solenne (rivalité froide pour l'oreille de l'Empereur) ; Ashe ↔ Vosgard (dépendance forcée sans confiance) ; Solenne ↔ Vosgard (méfiance doctrinale, l'argent sent l'hérésie pragmatique) ; Kestrel isolée, traitée en subalterne par Ashe.\n\nCe qui pourrait faire basculer l'équilibre : l'aboutissement des négociations secrètes Arveth–Solvarn libérerait des troupes pour Aetharion et renforcerait Ashe ; une dérive incontrôlée des Cendres Blanches forcerait l'Empereur à trancher entre les maisons ; la révélation de la corruption Vosgard–Mornac pourrait pousser Ashe et Solenne à une alliance ponctuelle inédite ; la chute d'une garnison Kestrel faute de renfort exposerait publiquement le mensonge de ses rapports.",
  },
  {
    groupe: "Royaumes Coalisés",
    histoire:
      "Avant la Rupture, les quatre royaumes n'étaient que des maisons provinciales du Premier Empire, chacune déjà investie d'un rôle qui lui survivrait à la sécession : Valdorne administrait le cœur historique de l'Empire et ses ordres chevaleresques ; Arveth tenait la marche orientale, déjà en première ligne face aux terres qui deviendraient plus tard celles de Mordanel ; Mornac contrôlait l'embouchure de la Lisdane et son commerce fluvial ; Serval gouvernait les passes minières des Contreforts et son alliance informelle, déjà ancienne, avec les Nains de l'Ordre.\n\nQuand la dynastie régnante a durci sa doctrine solaire et fait de la pureté du sang humain un rempart contre le Chaos, chacune de ces maisons y a vu une menace différente. Serval refusait de voir ses partenaires nains désignés comme vecteurs de corruption ; Mornac redoutait qu'une purification générale n'étouffe son commerce avec l'étranger ; le clergé de Valdorne, fidèle aux cultes plus anciens des Gardiens, refusait la nouvelle orthodoxie solaire ; Arveth, en première ligne géographique, craignait d'être la première sacrifiée pour faire un exemple. Quatre griefs différents, une seule réponse : la Rupture.\n\nLa Charge de Fossessainte, an 1 : à un gué frontalier, Sire Alaric de Valdorne, jeune chevalier sans grade, rallie des colonnes dispersées et transforme une déroute en victoire — le premier acte d'un code chevaleresque qui portera son nom pendant des générations.\n\nLe Siège de Mornhaven, an 4-5 : le Haut-Maréchal Corvain Ashe assiège la capitale de Mornac pendant huit mois. Mornac ne tient que grâce aux convois de vivres que Serval fait passer par ses cols au péril de ses propres hommes — le moment précis où une alliance militaire de circonstance devient une dette de sang que ni l'un ni l'autre royaume n'a jamais oubliée, et qui explique encore aujourd'hui la place particulière de Serval dans les conseils de Mornac.\n\nLa Bataille du Pont-Rompu, an 9 : Alaric, devenu commandant respecté, meurt en détruisant un pont pour couvrir la retraite coalisée. Un mois plus tard, les deux camps épuisés négocient.\n\nL'Armistice des Quatre Sceaux, signé près de Pont-Rompu, porte la marque de cette méfiance fondatrice : chaque maison y appose son sceau séparément, refusant jusqu'au bout un sceau commun qui aurait trop ressemblé à la couronne qu'elles venaient de fuir.\n\nLes décennies suivantes ont vu les quatre royaumes diverger dans la façon d'habiter leur victoire. À Valdorne, l'héritage d'Alaric est devenu une conviction vivante plutôt qu'un folklore, jusqu'à Baldwin IV aujourd'hui. À Mornac, les familles marchandes qui avaient financé la survie du siège de Mornhaven ont fini, deux générations plus tard, par convertir ce levier économique en couronne elle-même — une dynastie marchande devenue dynastie régnante, dont la Comtesse Yselde Maren est l'héritière directe. À Serval, l'alliance de guerre avec les Nains de l'Ordre s'est muée en partenariat métallurgique permanent, au point que la légitimité de Torvald Sten aujourd'hui repose autant sur cette alliance que sur son sang. À Arveth seul, rien n'a vraiment changé : toujours en première ligne face à Solvarn cent soixante-dix ans plus tard, le royaume vit encore l'exposition qui l'a poussé à la Rupture — ce qui rend les négociations secrètes de Lord Ranulf avec l'Empire moins une trahison inédite qu'une continuité amère de cette vulnérabilité fondatrice.\n\nCent soixante-dix ans après l'Armistice, la Coalition tient toujours — mais l'union née dans le sang du champ de bataille s'effrite avec le temps qui passe et l'absence d'un ennemi commun aussi immédiat qu'autrefois.",
    intro:
      "Contrairement à l'Empire (un trône, huit maisons) ou à la République (une Assemblée fracturée en blocs), les Royaumes Coalisés ne partagent qu'une alliance militaire née de la Rupture, jamais une couronne commune — quatre royaumes féodaux indépendants (Seigneurs → Chevaliers → Paysans), liés par l'Armistice des Quatre Sceaux et par la nécessité de tenir face à Solvarn plus que par une identité partagée. L'idéal chevaleresque affiché en public cohabite, à des degrés variables selon le royaume, avec un pragmatisme politique que la Coalition préfère ne pas trop regarder en face.",
    entites: [
      {
        nom: "Valdorne — le berceau sincère",
        devise: "Un seul suffit.",
        blason: "assets/blasons/blason_valdorne.png",
        description:
          "Souverain actuel : Roi Baldwin IV de Valdorne, porte l'héritage d'Alaric comme une conviction vivante, pas un folklore — capitale Valdecourt.\n\nBlason : un pont brisé surmonté d'une épée dressée, sur azur — écho direct à Pont-Rompu.\n\nFamille : Reine Aliénor (partage pleinement sa foi dans la quête) ; Prince héritier Roland (25 ans), élevé pour devenir le prochain grand exemple chevaleresque ; Princesse Blanche (21 ans), seule voix de doute — pas sur la sincérité de la quête, mais sur le prix que Valdorne paie pour la poursuivre (cf. PNJ clés).\n\nL'obsession du royaume : depuis des générations, Valdorne poursuit la naissance d'un Aspect de la Bravoure, miroir inversé des Consciences du Chaos — jamais accompli nulle part, par personne (cf. section \"L'Aspect de la Bravoure\"). Cette quête repose sur un fondement rarement questionné : seule la noblesse chevaleresque peut prétendre à l'acte héroïque reconnu ; le reste du royaume sert en paysans, conscrits ou écuyers jamais adoubés.\n\nMage attitrée : Minerva Sarelle, conseillère arcanique de la couronne pendant des décennies, morte récemment — officiellement d'une \"défaillance rituelle\", en réalité assassinée par un agent solvarien. Un secret que seule une poignée de personnes soupçonne, que personne ne peut prouver, et que Baldwin lui-même ignore (cf. PNJ clés).\n\nFracture interne : plus la realpolitik gagne du terrain ailleurs dans la Coalition (Arveth en tête), plus Baldwin s'isole dans un idéalisme que certains courtisans jugent naïf face à la menace réelle — et il vient de perdre, sans le savoir, son conseil arcanique le plus fiable au pire moment possible.\n\nMiroir : la maison Ashe de Solvarn, la même chevalerie sincère devenue discipline totale sous la doctrine impériale.",
      },
      {
        nom: "Arveth — le vacillant",
        devise: "Nous tenons la ligne.",
        blason: "assets/blasons/blason_arveth.png",
        description:
          "Seigneur actuel : Lord Ranulf d'Arvenfall (cf. PNJ clés), négocie en secret avec Solvarn par peur sincère pour son peuple plus que par ambition — capitale Arvenfall, frontière directe avec l'Empire.\n\nBlason : une flamme vacillante entre deux lances croisées, sur fond cendré.\n\nFamille : Lady Mérielle d'Arvenfall (épouse) ; Edmund (aîné, 24 ans), héritier protégé par la coutume qui exempte la noblesse des rites de guerre ; Elswyth (cadette, 19 ans), qui a choisi de se soumettre elle-même au Rite du Sang Renforcé contre l'avis de son père (cf. PNJ clés).\n\nLes rites de guerre : face à l'hémorragie démographique d'un siècle et demi de tension frontalière quasi permanente, Arveth pratique deux programmes de modification magique de ses soldats — le Rite de Maturité Hâtée (\"les Écourtés\") et le Rite du Sang Renforcé (\"les Endurcis\"), tous deux supervisés par le Magistre Osric Kell (cf. section \"Les Écourtés et les Endurcis\" et PNJ clés). Les deux rites comportent des risques sérieux — corruption du Chaos, mort, mutation — et pèsent presque exclusivement sur les enfants du peuple, la noblesse y échappant par coutume.\n\nMage attitré : Aldous Ferren, un des derniers praticiens de la foi libre des Gardiens encore toléré à la cour — de plus en plus regardé de travers par le culte solvarien qui s'infiltre dans les temples d'Arveth, tension religieuse qui se superpose à la tension politique du palais (cf. PNJ clés).\n\nFracture interne : le culte solvarien s'infiltre déjà dans ses temples — si Arveth bascule religieusement avant de basculer militairement, la Coalition perd son ciment moral avant même sa force armée.\n\nMiroir : aucun miroir loyaliste direct côté Solvarn — Arveth est le seul royaume dont le retour dans le giron impérial reste une possibilité concrète plutôt qu'une trahison de principe.",
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
          "Margrave actuel : Torvald Sten, montagnard austère, doit sa légitimité autant à l'alliance avec les Nains de l'Ordre qu'à son sang — capitale Serval, dans les Contreforts.\n\nBlason : une enclume sur un pic montagneux, sur gris-pierre.\n\nFamille : Halvard (aîné), qui poursuit avec conviction la philosophie d'alliance de son père ; Sigrun (cadette), devenue malgré elle la figure de ralliement de la frange isolationniste (cf. PNJ clés).\n\nLe royaume le moins xénophobe de la Coalition : l'isolement géographique de Serval, qui l'a forcé à s'allier aux Nains de l'Ordre pour survivre aux incursions orques et gobelines, s'est étendu à un commerce suivi avec l'enclave occidentale d'Aelindra — nains, humains et elfes sylvains s'y croisent plus naturellement qu'ailleurs dans les Royaumes Coalisés. Serval juge l'Empire rigide, fanatique et intransigeant (cf. section \"Serval — l'alliance plutôt que la pureté\").\n\nMage attitré : Kettil Rhennar, Enchanteur qui travaille main dans la main avec les maîtres-forgerons nains — au contact étroit des Nains de l'Ordre, Serval a développé des techniques de forge inédites hors des terres naines, en avance sur le reste des Royaumes (et probablement sur l'Empire) en métallurgie et développement d'armes. Rhennar en est le gardien discret (cf. PNJ clés).\n\nContribution à la Coalition : un flux constant d'armes et d'armures produites par les forges servalines, et quelques régiments d'élite équipés d'armes à feu (mousquets, pistolets) développées avec les Nains — la technologie la plus jalousement gardée du royaume (cf. Commandante Freya Kallsen, PNJ clés).\n\nFracture interne : une frange jeune de la noblesse servaline pousse pour un désengagement pur et simple de la Coalition — \"nous tenons nos propres cols, pourquoi mourir pour Arvenfall ?\" — tension que Torvald contient pour l'instant par autorité personnelle plus que par consensus, et qui porte maintenant, en partie, le visage de sa propre fille. Cette avance technologique jalousement gardée est autant un atout stratégique qu'une source de convoitise étrangère.\n\nMiroir : la maison Kestrel de Solvarn, même géographie montagnarde, logique inversée — alliance loyale face à la peur plutôt que domination par la peur.",
      },
    ],
    synthese:
      "Rapports de force au sein de la Coalition (contexte : pression croissante de Solvarn sur la frontière d'Arveth)\n\n1. Valdorne — autorité morale, faiblesse militaire relative : Baldwin est écouté par respect pour l'héritage d'Alaric, mais Valdorne n'a plus la puissance martiale de ses origines, et vient de perdre son conseil arcanique sans même le savoir.\n2. Mornac — poumon financier de la Coalition : sans son commerce (et ses compromissions), l'effort de guerre s'effondre — position similaire à celle du Comptoir côté Liberra, avec ses propres jeux d'influence à l'extérieur de la Coalition.\n3. Serval — allié fiable mais à la loyauté de plus en plus conditionnelle : la frange isolationniste grandit à mesure que la guerre s'éternise sans bénéfice direct pour les cols, malgré (ou à cause de) son avance technologique qui lui donne les moyens de son indépendance.\n4. Arveth — le maillon fragile assumé : chacun sait qu'Arveth plie sous la pression, personne n'ose encore l'admettre publiquement.\n\nAxes de tension : Valdorne ↔ Mornac (l'idéal chevaleresque méprise ouvertement, mais dépend financièrement, du pragmatisme marchand) ; Serval ↔ Arveth (indifférence mutuelle : Serval, isolé dans ses montagnes et sa forge, ne comprend pas l'urgence d'Arveth, qui le lui reproche) ; Mornac ↔ Arveth (Mornac verrait presque d'un bon œil un accord Arveth-Solvarn qui stabiliserait les routes commerciales, tant que ça ne devient pas un précédent) ; tous ↔ Solvarn (unité de façade qui masque des intérêts de plus en plus divergents à mesure que la guerre dure).\n\nCe qui pourrait faire basculer l'équilibre : la révélation publique des négociations de Ranulf forcerait un choix binaire — expulser Arveth ou le couvrir, les deux options fracturant la Coalition ; une défection ouverte de la frange isolationniste servaline priverait la Coalition de son flanc montagnard et de son avance en armement ; la découverte de l'assassinat de Minerva Sarelle (et de son commanditaire solvarien) pourrait autant unir Valdorne dans la colère que le déstabiliser s'il révèle que Baldwin l'ignorait ; un scandale sur le commerce Mornac-Solvarn, ou sur le sabotage de la guilde marchande de Liberra, au pire moment de la guerre pourrait forcer une purge politique à Mornhaven.",
  },
  {
    groupe: "République de Liberra",
    histoire:
      "Liberra est née dans la foulée de la même Grande Sécession qui a donné naissance aux Royaumes Coalisés — mais portée par un refus plus radical. Ni les provinces qui préféraient une nouvelle couronne, ni celles restées fidèles à l'ancienne : ses fondateurs n'étaient pas des maisons nobles en rupture, mais des marchands du fleuve, des elfes et demi-elfes fuyant l'intolérance ailleurs, et des roturiers déplacés par la guerre qui n'avaient rien à gagner d'une couronne, quelle qu'elle soit. Ils ont rejeté jusqu'au principe féodal que même les maisons sécessionnistes avaient conservé, pariant sur une Assemblée de citoyens plutôt que sur une nouvelle noblesse.\n\nLe choix du site n'avait rien d'un hasard : à l'embouchure de la Lisdane, Libris contrôlait déjà, avant même d'être une capitale, le passage obligé du commerce fluvial entre les terres coalisées et la Mer de Cendre-Claire. Cette position a financé la République avant même qu'elle n'ait un nom.\n\nLa charte fondatrice, rédigée par une poignée de signataires dont Emeric Vasnal reste aujourd'hui le dernier témoin vivant, a fait un choix que ni l'Empire ni la Coalition n'osaient : accueillir, même inégalement, les non-humains dans ses institutions, à une époque où Solvarn les qualifiait déjà de vecteurs de corruption. Une majorité Aelindra et une minorité Mordanel en exil s'y sont installées durablement, faisant de Libris un carrefour sans équivalent sur le continent.\n\nMais une charte n'est pas un gouvernement, et l'idéalisme des origines a dû composer très vite avec des pouvoirs qu'il n'avait pas prévus. Les grandes familles du commerce fluvial, qui avaient financé la survie de la ville dans ses premières années, ont fini par peser plus lourd dans l'Assemblée que les idéalistes qui l'avaient fondée — c'est de cette accumulation lente que le Comptoir tient aujourd'hui sa position dominante.\n\nLa défense de la République a suivi une trajectoire inverse : nées de milices citoyennes ponctuelles, réunies seulement face à une menace directe, ses forces se sont peu à peu institutionnalisées en une Garde Citoyenne permanente, à mesure que la pression de Solvarn au nord et les raids venus des Failles Rouges à l'est rendaient l'improvisation trop coûteuse.\n\nLe cinquième bloc, les Fils de Libris, est le plus récent et le seul né non pas d'un idéal mais d'un manque : le Silence de Valmoire, il y a environ dix-huit ans, a jeté sur la République un afflux de peur et de méfiance que le miracle marchand n'a pas su absorber. Le ressentiment de ceux que ce miracle a laissés pour compte a trouvé, dans le populisme de Corwan Dessalles, une voix — une ironie amère pour une République qui a fui la rhétorique de pureté de Solvarn pour la voir renaître, sans le nom, dans ses propres rues.",
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
  {
    groupe: "Nains de l'Ordre",
    histoire:
      "Les Nains ne se racontent pas comme des enfants de l'Arbre-Monde, mais comme une prière exaucée : des élémentaires de pierre éveillés par l'attention d'un dieu Gardien de la Montagne, Valdaan, avant même la Fracture. Cette origine façonne tout le reste — chez eux, la forge n'est pas un métier comme un autre, c'est la seule façon de s'adresser à leur dieu.\n\nKaldrun, la Cité sous la Montagne, s'est construite sur ce principe pendant des siècles sans grand bouleversement, jusqu'au jour où une horde orque et gobeline a manqué de tout emporter par le passage sud des Contreforts de Serval. Les Gardiens du Marteau de l'époque ont scellé ce passage pour de bon — sacrifiant leurs propres garnisons du sud pour sauver la capitale. C'est le Scellement des Portes du Sud (cf. Histoire), l'événement fondateur qui pèse encore, différemment, sur chaque clan de l'Ordre aujourd'hui. Sombreforge a tenu la ligne jusqu'au bout ; c'est un maître Runegrave qui a gravé la rune interdite ayant scellé le passage pour de bon — la fierté martiale du sacrifice pour l'un, le poids théologique silencieux d'avoir prononcé la parole qui l'a rendu possible pour l'autre.\n\nLa marque qui se mérite\nUn nain de l'Ordre porte trois noms : le prénom, le nom de famille hérité, et la marque d'appartenance de clan — qui ne se transmet pas. Elle se mérite à chaque génération par une épreuve propre à chaque clan : dix orcs abattus pour les Sombreforge, la maîtrise runique la plus haute pour les Runegrave, une arme runique forgée pour les Pierrefonde, un diplôme de recherche en rune pour les Ferrune. Sans l'épreuve réussie, un nain reste identifié par son seul nom de famille, quelle que soit sa lignée.\n\nContrairement à Khazrak Dûm, l'Ordre n'a pas perdu son autorité centrale dans la catastrophe — les Gardiens du Marteau ont au contraire resserré leur emprise, présentant le sacrifice comme la preuve qu'une décision unique et rapide, prise en temps de crise, doit rester au-dessus de toute contestation.\n\nCette centralisation, née d'un deuil qu'on ne discute plus, explique pourquoi remettre en cause le Scellement aujourd'hui revient presque à remettre en cause la légitimité même des Gardiens du Marteau — et pourquoi chaque clan porte ce poids à sa manière plutôt que de le porter ensemble.",
    // Blason absent tant qu'il n'a pas été déposé dans assets/blasons/
    // (repli silencieux côté rendreFactions() — voir assets/blasons/README.md).
    blason: "assets/blasons/blason_nains_ordre.png",
    intro:
      "Kaldrun, \"la Cité sous la Montagne\", dans les Contreforts de Serval. Les clans y sont des corps de métier autant que des lignées — le nom de sang porté à la naissance est le nom de clan — subordonnés à l'autorité centrale des Gardiens du Marteau, prêtres-artisans qui ne séparent jamais la foi de la forge. Le Scellement des Portes du Sud pèse encore sur chaque clan, différemment : fierté martiale pour les uns, poids théologique silencieux pour les autres.",
    entites: [
      {
        nom: "Clan Sombreforge — martial",
        devise: "On a tenu. On tiendra.",
        blason: "assets/blasons/blason_sombreforge.png",
        description:
          "Chef actuel : Maréchal Brakka Thrundal, dite Ligne-Tenue (marque obtenue en tuant une dizaine d'orcs lors d'une incursion aux Portes du Sud) — descendant direct de Korrin Sombreforge, commandant des garnisons emmurées lors du Scellement. Ce sont les soldats de Kaldrun, pas les prêtres-artisans : ils gardent la garnison de la capitale et montent depuis des siècles une sentinelle ininterrompue face aux galeries scellées — presque un rite plus qu'une simple affectation militaire. Portent la version héroïque de l'histoire (\"on a tenu la ligne, on a sauvé Kaldrun\") et s'opposent à toute réconciliation avec Khazrak Dûm, moins par doctrine que par fierté martiale : reconnaître une faute reviendrait à trahir ce que leurs ancêtres ont payé.",
      },
      {
        nom: "Clan Runegrave — magie et runes profondes",
        devise: "Le silence aussi est une prière.",
        blason: "assets/blasons/blason_runegrave.png",
        description:
          "Chef actuel : Haute Gardienne du Marteau Ishma Kaelvorn, dite Silence-Gravé (marque obtenue en atteignant la maîtrise runique la plus élevée reconnue par le clan). Dépositaires des mystères les plus anciens, dont le Marteau-Premier — bien au-delà de l'écriture runique enseignée à Forge-Runez. C'est un maître Runegrave, et non un Sombreforge, qui a gravé la rune interdite du Scellement : ce clan porte donc le véritable poids théologique de la décision, en silence, plutôt que la fierté martiale des Sombreforge. La plupart des Gardiens du Marteau actuels en sont issus. Ferrune leur sert de vivier — les apprentis les plus doués de Forge-Runez, une fois choisis, y sont admis pour les runes que même Forge-Runez n'enseigne pas.",
      },
      {
        nom: "Clan Pierrefonde — mines et architecture",
        devise: "La pierre ne ment jamais, elle attend.",
        blason: "assets/blasons/blason_pierrefonde.png",
        description:
          "Chef actuel : Maître des Galeries Dorn Brannok, dit Écoute-Roche (marque obtenue en démontrant sa capacité à forger une arme runique). Clan des architectes de galeries et des mineurs. Entretient en silence les galeries murées du Scellement, pour s'assurer qu'elles tiennent. Hook de campagne : rapporte depuis peu des bruits réguliers de l'autre côté de l'effondrement — trop réguliers pour être naturels — une information qu'il n'a pas encore osé remonter aux Sombreforge.",
      },
      {
        nom: "Clan Ferrune — école de Forge-Runez",
        devise: "Chaque rune s'apprend deux fois.",
        blason: "assets/blasons/blason_ferrune.png",
        description:
          "Chef actuel : Maîtresse de Forge-Runez Kessa Hurnvig, dite Double-Trempe (marque obtenue en décrochant un diplôme de recherche en rune). Supervise Forge-Runez et la formation des apprentis à l'écriture runique. Plus jeune, plus tourné vers l'extérieur — le clan qui a le plus de contacts avec les artisans de Serval (cf. Kettil Rhennar). Une frange discrète, chez les apprentis récents, commence à trouver absurde qu'on enseigne le Scellement comme une évidence morale sans jamais en débattre — terreau naturel pour un PJ nain de l'Ordre ou un allié sympathisant à la cause de Thrakan Kelgarn.",
      },
    ],
    synthese:
      "Le Scellement ne divise pas l'Ordre en deux camps nets, mais en deux raisons différentes de refuser d'en reparler : Sombreforge par fierté martiale, Runegrave par poids spirituel silencieux. Une éventuelle réconciliation avec Thrakan Kelgarn devrait donc convaincre deux clans, pour deux raisons opposées — ce qui la rend plus difficile à amorcer qu'une simple question de politique étrangère.\n\nCe qui pourrait faire basculer l'équilibre : les bruits rapportés par Pierrefonde, s'ils remontent enfin aux Sombreforge, forceraient l'Ordre à rouvrir un dossier qu'il croyait clos depuis des siècles ; la dissidence naissante chez les jeunes de Ferrune pourrait, si elle s'organise, devenir le premier canal officieux de dialogue avec Khazrak Dûm que Kaldrun n'a jamais eu.",
  },
  {
    groupe: "Khazrak Dûm",
    histoire:
      "Khazrak Dûm ne s'est pas construit — il a survécu à ce qui aurait dû être sa fin. Quand Kaldrun a scellé les Portes du Sud pour repousser une horde orque et gobeline, ce sont les garnisons naines qui tenaient cette frontière qui se sont retrouvées emmurées avec l'ennemi, de l'autre côté (cf. Histoire — Le Scellement des Portes du Sud).\n\nDes générations de siège sans le moindre espoir de renfort ont suivi. Sans vivres, sans relève, sans même la certitude que Kaldrun se souvenait d'eux, ces garnisons ont fini par choisir un pacte de survie avec leurs assaillants plutôt que leur propre destruction — un choix qui les a transformés peu à peu, jusqu'à la peau grisée et la mâchoire proéminente qu'on leur connaît aujourd'hui.\n\nCe pacte a coûté plus que des vies : le vocabulaire runique complet, transmis depuis des générations à Kaldrun, s'est perdu chez eux faute de pouvoir le pratiquer sans se mettre en danger — un savoir mort, pas une pratique refusée. Le Scellement a aussi rasé toute chaîne de commandement unifiée : sans Gardiens du Marteau pour trancher, le pouvoir s'est fragmenté clan par clan, chacun choisissant sa propre réponse à l'abandon.\n\nDe cette fragmentation sont nés deux camps qui n'ont jamais cessé de se répondre : les Résistants, qui refusent d'oublier ce qu'ils étaient et espèrent encore une réconciliation ; les Évolutionnistes, qui ont fait de la transformation une identité et rêvent, de génération en génération, de reprendre par la force ce que le temps et l'abandon leur ont pris.",
    // Blason absent tant qu'il n'a pas été déposé dans assets/blasons/
    // (repli silencieux côté rendreFactions() — voir assets/blasons/README.md).
    blason: "assets/blasons/blason_khazrak_dum.png",
    intro:
      "Karag Dûm, dans les Failles Rouges à l'est de Liberra, en bordure des terres orques — davantage un lieu de rassemblement symbolique et une grande forge commune (Grimgal) qu'une capitale au sens où Kaldrun l'est. Le Scellement des Portes du Sud n'a pas seulement coupé ce peuple de Kaldrun, il a aussi rasé toute chaîne de commandement unifiée : le vrai pouvoir reste au niveau du clan, chacun avec son propre camp — Résistant, Évolutionniste, ou oscillant selon les générations.",
    entites: [
      {
        nom: "Clan Kelgarn — Résistant",
        devise: "Nous nous souvenons de ce qui manque.",
        blason: "assets/blasons/blason_kelgarn.png",
        description:
          "Le clan de Thrakan Kelgarn (cf. PNJ clés). Résistant de longue date, un des rares à avoir conservé, de mémoire orale imparfaite, des fragments du vocabulaire runique complet — jamais assez pour forger une vraie rune de mémoire, juste assez pour savoir que quelque chose manque. C'est cette conscience précise de la perte qui nourrit l'espoir de réconciliation de Thrakan plutôt que la résignation. Isolé même au sein de son propre camp : Khazrak Dûm n'a pas d'autorité centralisée pour soutenir massivement un seul clan.",
      },
      {
        nom: "Clan Grimgal — Évolutionniste",
        devise: "Ce qu'on nous a pris, nous le reprendrons.",
        blason: "assets/blasons/blason_grimgal.png",
        description:
          "Chef actuel : Vrag Grimgal, chef de guerre du clan — c'est lui qui travaille activement à fédérer les autres clans évolutionnistes derrière le rêve de reconquête de Kaldrun. Donne son nom à la forge de guerre de Karag Dûm. Le clan évolutionniste le plus fervent, celui qui porte le plus ouvertement le rêve de reconquête de Kaldrun. Pas encore assez puissant pour fédérer les autres clans évolutionnistes derrière lui. Le jour où un clan Grimgal unifié rassemblerait les autres, le rêve latent deviendrait une vraie menace militaire.",
      },
      {
        nom: "Clan Ombrefaille — oscillant",
        devise: "Ni loyal, ni perdu — utile.",
        blason: "assets/blasons/blason_ombrefaille.png",
        description:
          "Chef actuel : Skarn Ombrefaille, négociant en chef du clan — tient le fil de tous les contacts commerciaux, légaux et de contrebande, à travers les Failles Rouges. Ni vraiment Résistant ni vraiment Évolutionniste. Contrôle une bonne partie du commerce, légal et de contrebande, à travers les Failles Rouges — y compris avec des intermédiaires humains ou orques selon l'opportunité. Sans conviction idéologique forte, mais avec un accès et des contacts que ni Kelgarn ni Grimgal n'ont : point d'entrée naturel pour des PJ qui voudraient s'infiltrer dans l'un ou l'autre camp sans devoir déjà choisir un côté.",
      },
    ],
    synthese:
      "L'absence de pouvoir central depuis le Scellement explique pourquoi le rêve de reconquête des Évolutionnistes n'est jamais devenu une vraie menace militaire coordonnée : c'est une aspiration culturelle largement partagée, pas un plan de guerre. Elle explique aussi pourquoi Thrakan Kelgarn reste une figure tragique isolée — même son propre camp n'a pas la structure pour le soutenir massivement.\n\nCe qui pourrait faire basculer l'équilibre : un chef Grimgal charismatique parvenant à fédérer les autres clans évolutionnistes transformerait le rêve latent en campagne militaire réelle contre Serval et Kaldrun ; à l'inverse, un rapprochement réussi entre Kelgarn et un Gardien du Marteau ouvert d'esprit côté Ordre pourrait fracturer les Évolutionnistes de l'intérieur, entre ceux qui y verraient un espoir et ceux qui y verraient une trahison à punir.",
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
  { nom: 'Arbre-Monde',           fichier: 'assets/maps/Carte monde.png',        categorie: 'Monde' },
  { nom: 'Aetharion',             fichier: 'assets/maps/aetharion.png',          categorie: 'Nations' },
  { nom: 'Aelindra',              fichier: 'assets/maps/aelindra.png',           categorie: 'Nations' },
  { nom: 'Mordanel',              fichier: 'assets/maps/mordanel.png',           categorie: 'Nations' },
  { nom: 'Empire de Solvarn',     fichier: 'assets/maps/solvarn.png',            categorie: 'Nations' },
  { nom: 'République de Liberra', fichier: 'assets/maps/liberra.png',            categorie: 'Nations' },
  { nom: 'Arveth',                fichier: 'assets/maps/arveth.png',             categorie: 'Nations' },
  { nom: 'Mornac',                fichier: 'assets/maps/mornac.png',             categorie: 'Nations' },
  { nom: 'Serval',                fichier: 'assets/maps/serval.png',             categorie: 'Nations' },
  { nom: 'Khazrak Dûm',           fichier: 'assets/maps/khazrak-dum.png',        categorie: 'Nations' },
  { nom: 'Domaine de Valdecourt',  fichier: 'assets/maps/domaine-valdcourt.png',  categorie: 'Régions' },
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
