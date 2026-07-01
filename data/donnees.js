/* ============================================================
   Chroniques Oubliées Fantasy — Données du jeu (homebrew)
   Extrait fidèlement des 8 PDF de référence.
   Ne pas modifier à la main sans raison : c'est la source de vérité.
   ============================================================ */

const CARACS = [
  { code: "FOR", nom: "Force" },
  { code: "DEX", nom: "Dextérité" },
  { code: "CON", nom: "Constitution" },
  { code: "INT", nom: "Intelligence" },
  { code: "SAG", nom: "Sagesse" },
  { code: "CHA", nom: "Charisme" },
];

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
const DIVISEUR_ATTAQUE = { martial: 1, hybride: 2, lanceur: 3 };

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
          { rang: 1, nom: "Posture de combat", effet: "Au début du tour, applique jusqu'à -1 par rang en attaque, DEF ou DM, et obtient l'équivalent en bonus au choix jusqu'au prochain tour" },
          { rang: 2, nom: "Combat en phalange", effet: "+1 attaque et DEF par allié au contact combattant la même cible" },
          { rang: 3, nom: "Second souffle (L)", effet: "Renonce à attaquer ce tour pour reprendre son souffle" },
          { rang: 4, nom: "Prouesse", effet: "Une fois par tour, sacrifie 1d4 PV pour +5 sur un test" },
          { rang: 5, nom: "Maîtrise tactique", effet: "Capacité finale de maîtrise tactique (voir le manuel officiel pour le détail exact)" },
        ],
      },
      {
        nom: "Voie du peuple",
        speciale: false,
        description: "Un défenseur né du peuple, pas un super-soldat. Sa force vient de qui il protège, pas de ce qu'il inflige.",
        rangs: [
          { rang: 1, nom: "Fils du village (réactif, 1x/tour)", effet: "Quand un allié à son contact est visé, peut s'interposer avant résolution et devient la cible. +2 CHA avec les gens du peuple" },
          { rang: 2, nom: "L'exemple (passive)", effet: "Alliés à portée de vue (10 m) : +2 Volonté contre Peur/Intimidation tant qu'il est conscient et engagé" },
          { rang: 3, nom: "Rempart (passive)", effet: "Réduit de 2 points les DM qu'il subit lorsqu'il protège activement un allié" },
          { rang: 4, nom: "Cri du rassemblement (L, 1x/combat)", effet: "Alliés à portée de voix (15 m) : 1d6+Mod. de CON PV temporaires et +2 attaque pendant 2 tours" },
          { rang: 5, nom: "Le héros qu'on n'oublie pas (L, 1x/scénario)", effet: "Encaisse à la place d'un allié (≤3 m) qui tomberait à 0 PV (DM intégraux). S'il survit : -4 à tous ses tests jusqu'à la fin du combat" },
        ],
      },
      {
        nom: "Voie de l'élite",
        speciale: false,
        description: "Spécimen physique au sommet de sa forme. Pas de protection, pas de gadgets — juste un corps poussé à son maximum.",
        rangs: [
          { rang: 1, nom: "Spécimen d'élite (passive)", effet: "+1 permanent à une carac. physique au choix (FOR, DEX ou CON), fixée à l'acquisition" },
          { rang: 2, nom: "Endurance de fer (passive)", effet: "+1 PV par niveau, en plus du Dé de vie ; avantage automatique aux tests de CON contre la fatigue" },
          { rang: 3, nom: "Précision létale (passive)", effet: "Critiques sur 19-20 au lieu de 20 sur les attaques au contact" },
          { rang: 4, nom: "Force herculéenne (passive)", effet: "+1d4 DM bonus aux attaques au contact ; double capacité de charge et tests athlétiques" },
          { rang: 5, nom: "Apogée physique (L, 1x/combat)", effet: "3 tours : double le Mod. de la carac. choisie au Rang 1 pour tous les tests et calculs de dégâts associés" },
        ],
      },
      {
        nom: "Voie de l'ingénieur",
        speciale: false,
        description: "Pièges et modification de terrain au service du groupe. Une vraie logique de chantier, du piège isolé au champ de bataille retourné.",
        rangs: [
          { rang: 1, nom: "Piège de fortune (action de mouvement)", effet: "Pose un piège à usage unique. Ennemi terminant son mouvement dessus : DEX diff. 12, échec → 1d6 DM et Ralenti (-2 m)" },
          { rang: 2, nom: "Terrain favorable (L)", effet: "Zone 3 m en terrain difficile pendant 3 tours — gênant uniquement pour les ennemis" },
          { rang: 3, nom: "Fortification de fortune (L)", effet: "Barricade improvisée sur 3 m (10 PV + Niveau). Alliés abrités : +4 DEF à distance, +2 au contact" },
          { rang: 4, nom: "Champ de pièges (L)", effet: "Pose jusqu'à 3 pièges en une action limitée ; dégâts des pièges passent à 2d6, diff. de DEX 14" },
          { rang: 5, nom: "Bastion improvisé (L, 1x/combat)", effet: "Zone 6 m en bastion pour le reste du combat : alliés +2 DEF en continu ; ennemis y pénétrant : DEX diff. 14 ou 2d6 DM" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — fureur corruptrice. Pas un pacte conscient : un soldat ordinaire qui a vécu trop de guerre. La fureur monte malgré lui, déclenchée par les dégâts encaissés.",
        rangs: [
          { rang: 1, nom: "Premier sang (passif)", effet: "Chaque attaque ennemie réussie contre lui : +1 Corruption de Fureur (CF, max 6/combat)" },
          { rang: 2, nom: "Frappe vengeresse (activable)", effet: "Dépense 1 CF : +1d6 DM chaotiques à la prochaine attaque réussie. Répétable tant qu'il a des CF" },
          { rang: 3, nom: "Rage incontrôlée (L, 3 CF)", effet: "Attaque supplémentaire ce tour. Volonté diff. 12 : échec → la 2e attaque cible la créature la plus proche, allié compris. Consomme 2 CF" },
          { rang: 4, nom: "Soif de sang (passive, dès CA 5+)", effet: "Réduire un ennemi à 0 PV régénère 1d6 PV immédiatement. Contrepartie : désavantage social avec les témoins du carnage" },
          { rang: 5, nom: "Déchaînement (L, 1x/scénario, 6 CF)", effet: "[3+Mod. de CON] tours : +4 attaque, +2d6 DM. Chaque tour, Volonté diff. 14 ou attaque redirigée vers la cible la plus proche. Consomme tous les CF + conversion en CA" },
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
          { rang: 1, nom: "Premier brassage", effet: "Alcool de rang 1 : +1 à une carac. au choix pendant [5+Mod. de CON] tours. Test de CON diff. 12 : échec → bonus divisé par 2 + 1 point d'Ivresse" },
          { rang: 2, nom: "Mélange amélioré", effet: "Alcool de rang 2 : +2, diff. de CON 14" },
          { rang: 3, nom: "Double dose", effet: "Alcool de rang 3 : +3, diff. 16. Permet 2 effets d'Alcool actifs simultanément" },
          { rang: 4, nom: "Distillation supérieure", effet: "Alcool de rang 4 : +4, diff. 18" },
          { rang: 5, nom: "Nectar ultime", effet: "Alcool de rang 5 : +5, diff. 20. Une seule dose tolérable, quel que soit le score de CON" },
        ],
      },
      {
        nom: "Voie de la rapière",
        speciale: false,
        description: "Combat à l'épée légère, basé sur la précision. Adaptation chiffrée de la Voie de l'escrime officielle.",
        rangs: [
          { rang: 1, nom: "Précision", effet: "Utilise son score d'attaque normal avec une arme légère (dague, épée courte, rapière) ; +1 en attaque avec ces armes" },
          { rang: 2, nom: "Intelligence du combat (passive)", effet: "Ajoute son Mod. d'INT à l'Initiative et à la DEF, en plus de son Mod. de DEX" },
          { rang: 3, nom: "Feinte (L)", effet: "Test d'attaque opposé contre la DEF adverse : réussite → la cible subit -4 DEF jusqu'au prochain tour du Barde" },
          { rang: 4, nom: "Enchaînement (L)", effet: "Attaque supplémentaire avec arme légère, malus de -2 sur les deux attaques du tour" },
          { rang: 5, nom: "Botte mortelle (L, 1x/combat)", effet: "Ignore 2 points de Réduction des Dégâts adverse ; +2d6 DM bonus si la cible est déjà affaiblie (DEF réduite, Influencée...)" },
        ],
      },
      {
        nom: "Voie du spectacle",
        speciale: false,
        description: "Acrobatie, esquive et présence scénique. Adaptation chiffrée de la Voie du saltimbanque officielle.",
        rangs: [
          { rang: 1, nom: "Acrobate", effet: "Bonus aux tests de DEX (acrobaties, équilibre, saut, escalade) égal à 2 × rang atteint dans cette Voie" },
          { rang: 2, nom: "Grâce féline (passive)", effet: "+2 m de déplacement par tour ; se relever d'une position à terre devient une action gratuite" },
          { rang: 3, nom: "Lanceur de couteau", effet: "Lance des dagues à 10 m de portée, 1d4 + Mod. de DEX DM ; +1 en attaque avec les armes de jet légères" },
          { rang: 4, nom: "Esquive acrobatique (passive)", effet: "+2 DEF contre les attaques d'ennemis qui se sont déplacés ce tour ; sur attaque ratée contre lui, déplacement de 3 m en action gratuite" },
          { rang: 5, nom: "Liberté d'action", effet: "Immunisé aux effets d'Immobilisation et d'Entrave ; 1x/combat, ignore automatiquement un effet de paralysie sans test" },
        ],
      },
      {
        nom: "Voie du chant",
        speciale: false,
        description: "Affaiblissement pur par la voix — pas de dégâts directs, mais un vrai outil de démolition tactique.",
        rangs: [
          { rang: 1, nom: "Note discordante (sort, L)", effet: "Attaque magique, portée 15 m : -2 à un type de test au choix (attaque, DEF, ou tests de carac.) pendant [3+Mod. de CHA] tours" },
          { rang: 2, nom: "Refrain lancinant (passive)", effet: "Le malus de Note discordante passe à -3" },
          { rang: 3, nom: "Chant brisant (L)", effet: "Zone 5 m, portée 15 m : tous les ennemis subissent -2 attaque et -2 DEF pendant [3+Mod. de CHA] tours" },
          { rang: 4, nom: "Dissonance profonde (passive)", effet: "Les malus se cumulent avec d'autres effets et durent +2 tours de plus" },
          { rang: 5, nom: "Requiem du silence (L, 1x/combat)", effet: "Zone large : échec à un test de Volonté → Réduit au silence (aucune capacité magique/vocale) et -4 attaque pendant 2 tours" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — séduction corruptrice. Un vecteur de chaos qui corrompt à travers son art. Les autres se brûlent eux-mêmes ; lui brûle les autres, et se corrompt quand même un peu au passage.",
        rangs: [
          { rang: 1, nom: "Chant corrupteur (performance)", effet: "Test de CHA opposé, portée vocale : la cible en échec est Influencée (-2 à une carac. ou vulnérabilité à la suggestion) quelques tours. +1 CS" },
          { rang: 2, nom: "Étreinte du Vide (passive)", effet: "Force n'importe laquelle de ses capacités de séduction en payant +1 CS, pour un bonus plus fort" },
          { rang: 3, nom: "Mélopée de la Folie (L)", effet: "Zone, test opposé par cible : échecs → confusion chaotique (attaquent au hasard, alliés compris) quelques tours. +2 CS. Critique : jet sur la table de mutation Palier 1" },
          { rang: 4, nom: "Voix qui corrompt (passive, dès CA 5+)", effet: "Bonus permanent à tous les effets de charme/séduction. Contrepartie : méfiance sociale dans la haute société et les lieux sacrés" },
          { rang: 5, nom: "Symphonie du Chaos (L, 1x/scénario)", effet: "Zone large (alliés inclus s'ils sont pris dedans) : résistance ou frénésie chaotique plusieurs tours. +3 CS immédiat — risque réel pour le groupe" },
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
          { rang: 1, nom: "Soins légers", effet: "1d8 + niveau PV par le toucher. Utilisable [rang+Mod. de SAG] fois/jour" },
          { rang: 2, nom: "Soins modérés", effet: "Version plus puissante, même limite [rang+Mod. de SAG] fois/jour" },
          { rang: 3, nom: "Purification", effet: "Neutralise un poison ou une maladie par le toucher" },
          { rang: 4, nom: "Bénédiction (L)", effet: "Au choix : Grand Soin (3d8+niveau, 1 cible) OU Soin partagé (1d8+Mod. de SAG, jusqu'à 3 cibles). [rang+Mod. de SAG] fois/jour" },
          { rang: 5, nom: "Résurrection (rituel, 10 min)", effet: "Ramène un mort depuis moins de [Mod. de SAG] heures, relique et lien personnel requis. Revient avec 1d6 PV" },
        ],
      },
      {
        nom: "Voie de la conversion",
        speciale: false,
        description: "Adaptation des Voies de la foi et de la spiritualité officielles — la dimension sociale et protectrice de la religion plutôt que le combat.",
        rangs: [
          { rang: 1, nom: "Vêtements sacrés", effet: "+5 DEF tant qu'aucune armure physique n'est portée — la foi seule protège" },
          { rang: 2, nom: "Voix de la persuasion", effet: "+2 par rang atteint dans la voie à tous les tests de CHA visant à persuader, convaincre ou prêcher" },
          { rang: 3, nom: "Arme bénie", effet: "L'arme du Prêtre inflige des DM supplémentaires contre les créatures maléfiques ou mortes-vivantes" },
          { rang: 4, nom: "Conviction avancée (L, 15 m)", effet: "Attaque magique diff. [10+Mod. de SAG cible] : la cible accomplit une action raisonnable demandée dans l'heure. Refuse le suicidaire. Immunité 24h après résistance" },
          { rang: 5, nom: "Voix de la foi (L, 1x/scénario, 10 m)", effet: "Alliés/réceptifs : +2 à tous les tests pendant [5+Mod. de SAG] tours. Hostiles/opposés à sa foi : -2, même durée" },
        ],
      },
      {
        nom: "Voie de l'exorcisme",
        speciale: false,
        description: "Contrôle pur — pas de dégâts directs, tout en bannissement, immobilisation et purification. Laisse le combat à l'Inquisition.",
        rangs: [
          { rang: 1, nom: "Symbole sacré (activable, 10 m)", effet: "Attaque magique contre une cible démoniaque/morte-vivante : Repoussée (6 m), ne peut s'approcher à moins de 3 m pendant 1 tour" },
          { rang: 2, nom: "Rite de bannissement (L)", effet: "Attaque magique : échec → Immobilisée [1+Mod. de SAG] tours. Si invoquée et niveau inférieur : bannissement complet immédiat" },
          { rang: 3, nom: "Purification du lieu (rituel, 10 min)", effet: "Purifie une zone de 10 m de toute corruption mineure ambiante" },
          { rang: 4, nom: "Exorcisme (L)", effet: "Attaque magique opposée à l'entité possédant un hôte : réussite → entité expulsée, hôte survit" },
          { rang: 5, nom: "Sceau inviolable (L, 1x/scénario)", effet: "Empêche toute entité démoniaque/morte-vivante d'entrer/sortir d'une zone (20 m) pendant [Niveau] heures" },
        ],
      },
      {
        nom: "Voie de l'inquisition",
        speciale: false,
        description: "Traque et châtiment — orientée combat, centrée sur la marque d'une cible plutôt que la détection passive.",
        rangs: [
          { rang: 1, nom: "Œil de l'inquisiteur (1x/scène)", effet: "Test de SAG opposé contre une cible suspectée : réussite → Marquée pour la scène/le combat" },
          { rang: 2, nom: "Frappe purificatrice (passive)", effet: "Les attaques contre une cible Marquée infligent +1d6 DM sacrés" },
          { rang: 3, nom: "Confession forcée (L)", effet: "Attaque magique contre une cible Marquée : réponse honnête obligatoire + -2 DEF jusqu'à la fin du combat" },
          { rang: 4, nom: "Chasse sans répit (passive)", effet: "Ignore la dissimulation/invisibilité d'une cible Marquée ; +2 m de déplacement en la poursuivant" },
          { rang: 5, nom: "Bûcher purificateur (L, 1x/scénario)", effet: "Attaque contre une cible Marquée : 5d6 DM sacrés, doublés si la culpabilité est confirmée dans la fiction" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — malédictions et corruption. Le Prêtre finit par manier la maladie et la malédiction comme une arme : combattre le mal en devenant un vecteur de pourriture.",
        rangs: [
          { rang: 1, nom: "Flétrissure (sort, L, 15 m)", effet: "Attaque magique : malédiction, 1d4 DM/tour pendant [3+Mod. de SAG] tours. +1 CS" },
          { rang: 2, nom: "Don corrompu (passive)", effet: "Force n'importe quel sort/capacité en payant +1 CS — intensifie un DOT actif (+1d4 DM/tour)" },
          { rang: 3, nom: "Peste rampante (L, zone 5 m, 15 m)", effet: "DOT 2d4 DM/tour pendant [3+Mod. de SAG] tours (CON pour moitié). +2 CS. Échec catastrophique : jet table Palier 1" },
          { rang: 4, nom: "Corruption persistante (passive, dès CA 5+)", effet: "Ses DOT résistent à la dissipation/soins adverses. Contrepartie : soins reçus réduits de moitié, méfiance de son ordre" },
          { rang: 5, nom: "Fléau ultime (L, 1x/scénario)", effet: "DOT 4d6 DM/tour pendant 5 tours, propagation aux créatures adjacentes (1d6 DM contagion/tour). +3 CS immédiat" },
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
          { rang: 1, nom: "Morsure du sang (sort, L, contact)", effet: "Attaque magique au contact : inflige 1d6+Mod. d'INT DM. Récupère la moitié des DM infligés en PV" },
          { rang: 2, nom: "Régénération sanguine (passive)", effet: "S'il a infligé des DM via cette voie au tour précédent, regagne 1d4 PV au début du tour suivant" },
          { rang: 3, nom: "Vol de vitalité (sort, L, 15 m)", effet: "Attaque magique à distance : inflige 2d6 DM. Récupère l'intégralité des DM infligés en PV" },
          { rang: 4, nom: "Sang impie (passive)", effet: "Réduire une créature à 0 PV avec une capacité de cette voie régénère immédiatement 2d6 PV bonus" },
          { rang: 5, nom: "Étreinte exsangue (L, 1x/combat)", effet: "Attaque au contact : inflige 4d6 DM. Récupère l'intégralité en PV et gagne +2 à toutes ses carac. pendant 2 tours" },
        ],
      },
      {
        nom: "Voie de l'outre-tombe",
        speciale: false,
        description: "Réanimer les morts et lever une armée. Adaptation de la Voie de l'outre-tombe officielle.",
        rangs: [
          { rang: 1, nom: "Effroi (sort, L, 20 m)", effet: "Attaque magique : FOR ou SAG (au choix) diff. [10+Mod. d'INT] ou fuite [1d4+rang] tours. 1x/combat par créature" },
          { rang: 2, nom: "Animation des morts (sort, L)", effet: "Anime un cadavre humanoïde moyen (<1h) en zombie (Init 8, DEF 10, PV 12, Att +3, DM 1d6+1, 50% vitesse). 1 zombie/rang. Se dégrade -1 PV/min" },
          { rang: 3, nom: "Pourriture des chairs (sort, L, 10 m)", effet: "Attaque magique : 1d6+Mod. d'INT DM" },
          { rang: 4, nom: "Renfort macabre (passive)", effet: "Tous les morts-vivants contrôlés : +2 attaque, +5 PV, cessent de se dégrader avec le temps" },
          { rang: 5, nom: "Légion de squelettes (1x/jour)", effet: "Invoque des squelettes pendant [niveau] tours, rayon 20 m : 3d6 DM/tour auto (réduits à 1d6 si action limitée d'opposition)" },
        ],
      },
      {
        nom: "Voie de la sombre magie",
        speciale: false,
        description: "Malédictions, affaiblissement et manipulation mentale — briser ses ennemis de l'intérieur.",
        rangs: [
          { rang: 1, nom: "Œil mauvais (sort, L, 15 m)", effet: "Attaque magique : -2 à un type de test au choix (attaque, DEF, résistance) pendant [3+Mod. d'INT] tours" },
          { rang: 2, nom: "Toucher flétrissant (sort, L, contact)", effet: "Attaque magique au contact : -1d4 à une carac. physique (FOR, DEX ou CON) au choix, pendant 24h" },
          { rang: 3, nom: "Manipulation mentale (sort, L, 10 m)", effet: "Test opposé INT vs SAG : réussite → dicte une action limitée non suicidaire au prochain tour de la cible" },
          { rang: 4, nom: "Malédiction profonde (passive)", effet: "Les effets d'Œil mauvais et Toucher flétrissant durent 2x plus longtemps, dissipables uniquement par magie de rang supérieur" },
          { rang: 5, nom: "Domination des ombres (L, 1x/scénario)", effet: "Contrôle total d'une cible [1+Mod. d'INT] tours. Ordre suicidaire/contraire à sa nature : nouveau test pour résister" },
        ],
      },
      {
        nom: "Voie des âmes",
        speciale: false,
        description: "Capturer et lier des âmes, voler le savoir des morts. Un nécromancien érudit qui traite les âmes comme une ressource.",
        rangs: [
          { rang: 1, nom: "Murmure des morts (rituel, L, contact)", effet: "Communie avec l'âme d'un mort récent (<[Mod. d'INT] jours) et lui pose une question. Réponse honnête mais limitée — refus possible si douloureuse" },
          { rang: 2, nom: "Capture d'âme (sort, L, 10 m)", effet: "Attaque magique pour capturer l'âme d'une créature qui vient de mourir. Stockée dans un réceptacle ; max 3 simultanées" },
          { rang: 3, nom: "Libération vengeresse (L, dépense une âme)", effet: "Libère une âme contre un ennemi à distance : 2d6+Mod. d'INT DM. L'âme se dissipe définitivement après usage" },
          { rang: 4, nom: "Savoir volé (passive)", effet: "Chaque âme en sa possession donne +1 à un test d'INT au choix, cumulable jusqu'à +3" },
          { rang: 5, nom: "Moisson d'âmes (L, 1x/scénario)", effet: "[3+Mod. d'INT] tours : capture automatiquement l'âme de toute créature qui meurt dans un rayon de 20 m, sans test ni limite de stockage" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — Corruption de Sort. Une magie instable, puisée à une source qui dépasse le Nécromancien et qui le corrompt en retour.",
        rangs: [
          { rang: 1, nom: "Étincelle chaotique (L, 20 m)", effet: "Attaque magique : réussite → 2d8 DM chaotiques (pas de Mod. d'INT, sort instable). +1 CS" },
          { rang: 2, nom: "Don corrompu (passive)", effet: "Une fois par tour, force n'importe quel sort/capacité : +1d6 DM ou relance un dé de DM raté. +1 CS" },
          { rang: 3, nom: "Vrille de réalité (L, zone 5 m, 15 m)", effet: "Attaque magique par cible (ou DEX diff. [10+Mod. d'INT] pour moitié) : 4d6 DM. +2 CS. 18-20 naturel : jet table Palier 1" },
          { rang: 4, nom: "Symbiose du chaos (passive, dès CA 5+)", effet: "Au choix fixe : +2 réduction DM, ou +1d6 DM à tous les sorts. Contrepartie : détecté comme corrompu (désavantage CHA religieux, lieux saints fermés)" },
          { rang: 5, nom: "Avatar du chaos (L, 1x/scénario)", effet: "[3+Mod. d'INT] tours : +4 attaque magique, +2d6 DM à tous les sorts, divise par 2 les DM physiques subis. +3 CS immédiat" },
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
          { rang: 1, nom: "Survie", effet: "+2 par rang atteint dans la voie à tous les tests de survie en milieu naturel (survie, vigilance, discrétion)" },
          { rang: 2, nom: "Terrain naturel", effet: "Aucune pénalité de déplacement en terrain difficile (neige, boue, broussailles) ; +2 attaque et DEF lors d'un combat dans ces conditions" },
          { rang: 3, nom: "Combat au bâton", effet: "Combat avec les deux extrémités de son bâton : deux attaques de contact, 1d6+Mod. de FOR ou DEX (au choix) chacune" },
          { rang: 4, nom: "Résistance naturelle", effet: "Réduction de DM égale à [Rang×2] contre les dégâts naturels (froid, chaleur, chutes, poisons, animaux/insectes)" },
          { rang: 5, nom: "Maîtrise du milieu", effet: "Capacité finale de maîtrise du milieu naturel (contenu officiel incertain — à compléter avec le manuel si besoin)" },
        ],
      },
      {
        nom: "Voie des compagnons",
        speciale: false,
        description: "Lier un animal, communiquer, se transformer. Adaptation de la Voie des animaux officielle.",
        rangs: [
          { rang: 1, nom: "Communication animale", effet: "+2 par rang à tous les tests destinés à influencer un animal" },
          { rang: 2, nom: "Nuée d'insectes (sort, L, 20 m)", effet: "Attaque magique : 1 DM/tour et -2 à toutes ses actions pendant [5+Mod. de SAG] tours" },
          { rang: 3, nom: "Compagnon animal (oiseau de proie)", effet: "Lien télépathique, perception partagée (+5), Att = attaque magique du Druide, DM 1d4" },
          { rang: 4, nom: "Masque du prédateur (sort)", effet: "Prend les traits d'un fauve : Mod. de SAG en Init/attaque/DM, vision nocturne, pendant [5+Mod. de SAG] tours" },
          { rang: 5, nom: "Forme animale (L)", effet: "Se transforme en un animal de taille ≤ à la sienne, conserve ses PV, acquiert ses capacités naturelles" },
        ],
      },
      {
        nom: "Voie du protecteur",
        speciale: false,
        description: "Gardien défensif, magie de protection pour le groupe — un soutien qui blinde ses alliés plutôt que lui-même.",
        rangs: [
          { rang: 1, nom: "Égide naturelle (sort, L, 10 m)", effet: "Attaque magique : +3 DEF à un allié pendant [3+Mod. de SAG] tours" },
          { rang: 2, nom: "Symbiose protectrice (passive)", effet: "+2 DEF permanent tant qu'il se trouve en milieu naturel" },
          { rang: 3, nom: "Écorce partagée (L, 10 m)", effet: "Un allié gagne une réduction de DM de 3 points pendant [3+Mod. de SAG] tours" },
          { rang: 4, nom: "Rempart vivant (L, zone 5 m, 15 m)", effet: "Tous les alliés dans la zone : +2 DEF et 1d6 PV temporaires" },
          { rang: 5, nom: "Sanctuaire du gardien (L, 1x/scénario, 10 m)", effet: "[5+Mod. de SAG] tours : alliés +4 DEF, régénèrent 1d4 PV/tour ; terrain difficile pour les ennemis uniquement" },
        ],
      },
      {
        nom: "Voie du shaman",
        speciale: false,
        description: "Totems et buffs tribaux pour le groupe — un meneur spirituel complémentaire des autres voies.",
        rangs: [
          { rang: 1, nom: "Totem du courage (sort, L, 10 m)", effet: "Un allié gagne +2 en attaque pendant [3+Mod. de SAG] tours" },
          { rang: 2, nom: "Multitude des esprits (passive)", effet: "Peut maintenir 2 totems actifs simultanément sur des alliés différents" },
          { rang: 3, nom: "Totem de la force sauvage (sort, L, 10 m)", effet: "Un allié gagne +1d6 DM à ses attaques pendant [3+Mod. de SAG] tours" },
          { rang: 4, nom: "Totem de la vélocité (sort, L, 10 m)", effet: "Un allié gagne une action de mouvement supplémentaire chaque tour pendant [3+Mod. de SAG] tours" },
          { rang: 5, nom: "Convocation des esprits ancestraux (L, 1x/scénario, 15 m)", effet: "Tous les alliés dans la zone : +2 à toutes leurs caractéristiques pendant [5+Mod. de SAG] tours" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — le corps avant les pouvoirs. Des années à voir la forêt ravagée par le chaos, jusqu'à choisir de l'incarner pour mieux le combattre. Les Rangs 1 et 2 sont déjà des mutations entamées.",
        rangs: [
          { rang: 1, nom: "Chair instable", effet: "Attaque naturelle (griffes/ronces, contact) : 1d6 DM. Optionnel : pousser pour +1d6 DM (+1 CS)" },
          { rang: 2, nom: "Écorce corrompue (passive)", effet: "+2 DEF naturelle permanente" },
          { rang: 3, nom: "Invocation tainted (L)", effet: "Invoque une créature/plante corrompue (PV=niveau×2, attaque=Druide-2, DM 1d8) pendant [1d4+1] tours" },
          { rang: 4, nom: "Fléau rampant (L)", effet: "Aura 3 m pendant [3+Mod. de SAG] tours : 1d4 DM chaotiques à toute créature (alliée comprise) à portée" },
          { rang: 5, nom: "Forme du chaos sauvage (L, 1x/scénario)", effet: "[3+Mod. de SAG] tours : +4 PV temp., attaque naturelle 2d8 DM, divise par 2 les DM physiques subis" },
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
          { rang: 1, nom: "Image décalée (sort, L)", effet: "Crée un double illusoire à 1 m de lui ; la prochaine attaque réussie contre lui rate automatiquement" },
          { rang: 2, nom: "Déguisement magique (sort, L)", effet: "Prend l'apparence exacte d'une créature humanoïde connue pendant [5+Mod. de CHA] heures ; SAG diff. [10+Mod. de CHA] pour percer l'illusion" },
          { rang: 3, nom: "Mirage (sort, L, zone 5 m, 20 m)", effet: "Crée une scène illusoire complexe ; les cibles qui interagissent font SAG diff. [10+Mod. de CHA]" },
          { rang: 4, nom: "Terreur (sort, L, 15 m)", effet: "Attaque magique : la cible voit sa pire crainte, fuit [1d4+Mod. de CHA] tours OU subit -4 DEF et attaque jusqu'à la fin du combat" },
          { rang: 5, nom: "Grande illusion (sort, L, 1x/scénario, zone 20 m)", effet: "Illusion totale (bâtiment, armée, désastre) ; dure [niveau] heures sauf dissipation" },
        ],
      },
      {
        nom: "Voie de la transfiguration",
        speciale: false,
        description: "Transmutation d'objets — changer la nature des matériaux plutôt que leur forme.",
        rangs: [
          { rang: 1, nom: "Façonnage (rituel, contact)", effet: "Change la forme d'un objet non-magique ≤ petite taille (pierre → clé, bois → outil) ; la matière reste la même" },
          { rang: 2, nom: "Transmutation mineure (rituel, contact, 1 tour)", effet: "Change la nature d'un matériau sur petite surface (bois → métal, verre → pierre) ; tient [niveau] heures" },
          { rang: 3, nom: "Arme enchantée (sort, L, contact)", effet: "Une arme ou objet gagne +2 attaque et +1d6 DM magiques pendant [3+Mod. de CHA] tours" },
          { rang: 4, nom: "Transmutation majeure (rituel, contact, 5 min)", effet: "Change la nature d'une surface jusqu'à 2 m² ; permanent mais réversible par Dispersion magique" },
          { rang: 5, nom: "Pierre en chair (sort, L, 10 m)", effet: "Pétrification partielle : -4 DEF et -2 m déplacement pendant [1d4+Mod. de CHA] tours. OU restaure une pétrification complète existante" },
        ],
      },
      {
        nom: "Voie de l'historien",
        speciale: false,
        description: "Lore et divination mélangés — savoir ce qui fut et deviner ce qui vient.",
        rangs: [
          { rang: 1, nom: "Archives vivantes (passive)", effet: "+2 par rang à tous les tests d'INT visant à se souvenir d'une information historique, politique, géographique ou arcanique" },
          { rang: 2, nom: "Lecture d'aura (sort, L, 5 m)", effet: "Révèle la nature magique d'un objet ou créature (école de magie, niveau approximatif, malédictions actives)" },
          { rang: 3, nom: "Pressentiment (passive)", effet: "Ne peut pas être surpris ; +2 Initiative ; une fois par combat, demande au MJ un indice sur les intentions d'une cible" },
          { rang: 4, nom: "Vision du passé (sort, L, rituel 10 min)", effet: "En touchant un objet ou lieu, perçoit les événements marquants qui s'y sont déroulés (jusqu'à [niveau×10] ans)" },
          { rang: 5, nom: "Prophétie (sort, L, 1x/scénario)", effet: "Pose une question sur un événement futur du scénario ; réponse véridique mais cryptique (une phrase, sans détail)" },
        ],
      },
      {
        nom: "Voie du spectacle",
        speciale: false,
        description: "Fascination, sommeil et domination mentale — subjuguer autant que commander.",
        rangs: [
          { rang: 1, nom: "Fascination (sort, L, 15 m)", effet: "Attaque magique diff. [10+Mod. de SAG cible] : Fascinée (immobile) tant que l'Enchanteur maintient (action L/tour). La cible retente le test chaque tour. Brisée par toute attaque ou événement brutal" },
          { rang: 2, nom: "Voix envoûtante (passive)", effet: "+2 par rang à tous les tests de CHA visant à persuader, séduire ou distraire" },
          { rang: 3, nom: "Sommeil (sort, L, 15 m)", effet: "Attaque magique contre une cible avec moins de [Mod. de CHA×5] PV actuels : endormie jusqu'à blessure ou réveil manuel" },
          { rang: 4, nom: "Suggestion (sort, L, 10 m)", effet: "Attaque magique diff. [10+Mod. de SAG cible] : la cible exécute une action raisonnable dans l'heure, sans se souvenir d'avoir été influencée" },
          { rang: 5, nom: "Domination (sort, L, 1x/scénario)", effet: "Contrôle total d'une cible humanoïde pendant [Mod. de CHA] jours ; SAG diff. [10+Mod. de CHA] une fois par jour pour résister" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — illusions qui prennent vie. Ses illusions commencent à lui échapper et à se matérialiser contre sa volonté. La jauge monte à chaque sort réussi.",
        rangs: [
          { rang: 1, nom: "Illusion vivante (passive)", effet: "Ses illusions infligent 1d6 DM réels si la cible rate SAG diff. [10+Mod. de CHA]. +1 CS par illusion réussie" },
          { rang: 2, nom: "Écho chaotique (passive)", effet: "Force n'importe quel sort d'illusion/enchantement en payant +1 CS : double la durée OU la zone d'effet" },
          { rang: 3, nom: "Illusion de masse (L, zone 10 m)", effet: "Toutes créatures : SAG diff. [10+Mod. de CHA] ou Fascinées 1 tour. +2 CS. Critique : jet table mutation Palier 1" },
          { rang: 4, nom: "Réalité fracturée (passive, dès CA 5+)", effet: "Ses illusions indiscernables de la réalité pour les cibles non-magiques. Contrepartie : -2 SAG permanent (ne distingue plus toujours le vrai du faux)" },
          { rang: 5, nom: "Cauchemar incarné (L, 1x/scénario)", effet: "Une illusion prend forme physique [Mod. de CHA] tours : peut attaquer, bloquer, interagir. +3 CS immédiat" },
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
          { rang: 1, nom: "Pisteur (passive)", effet: "+2 par rang à tous les tests de survie, pistage et discrétion en extérieur" },
          { rang: 2, nom: "Camouflage naturel (passive)", effet: "+4 DEF tant qu'il reste immobile en milieu naturel" },
          { rang: 3, nom: "Premier coup (passive)", effet: "+1d6 DM contre une cible qui n'a pas encore agi ce combat" },
          { rang: 4, nom: "Sens du danger (passive)", effet: "Ne peut pas être surpris ; +2 Initiative" },
          { rang: 5, nom: "Prédateur silencieux (L, 1x/combat)", effet: "+4 attaque sur la première attaque du combat, sans déclencher d'alerte" },
        ],
      },
      {
        nom: "Voie de la gâchette",
        speciale: false,
        description: "Précision de tir, cadence et critiques — un tireur d'élite qui ne rate jamais sa cible.",
        rangs: [
          { rang: 1, nom: "Tir ajusté (passive)", effet: "+1 en attaque à distance" },
          { rang: 2, nom: "Cadence affûtée (passive)", effet: "Recharger devient une action gratuite" },
          { rang: 3, nom: "Tir mortel (L)", effet: "+2d6 DM si la cible est immobile ou n'a pas encore agi" },
          { rang: 4, nom: "Œil de lynx (passive)", effet: "Ignore les pénalités de couvert partiel et de distance" },
          { rang: 5, nom: "Tir fatal (L, 1x/combat)", effet: "Critique sur 18-20 ; les critiques infligent triple dégâts au lieu de double" },
        ],
      },
      {
        nom: "Voie du piège",
        speciale: false,
        description: "Pièges de chasse et contrôle de terrain — un trappeur qui prépare le terrain avant la traque.",
        rangs: [
          { rang: 1, nom: "Collet de fortune (action de mouvement)", effet: "Test de DEX diff. 12 ou Immobilisée 1 tour" },
          { rang: 2, nom: "Fosse dissimulée (L)", effet: "2d6 DM, DEX diff. 14 pour l'éviter" },
          { rang: 3, nom: "Pièges multiples (passive)", effet: "Pose jusqu'à 2 pièges par préparation au lieu d'un seul" },
          { rang: 4, nom: "Détection des pièges adverses (passive)", effet: "+4 à la détection de tout piège, naturel ou fabriqué" },
          { rang: 5, nom: "Piège du grand gibier (L, 1x/scénario)", effet: "Zone 5 m : 4d6 DM + immobilisation, contre une cible de grande taille" },
        ],
      },
      {
        nom: "Voie de la grande chasse",
        speciale: false,
        description: "Marquer et achever sa proie — l'identité propre du Chasseur, qui transforme chaque combat en traque personnelle.",
        rangs: [
          { rang: 1, nom: "Marque du chasseur (1x/scène)", effet: "Désigne une cible « Trophée » : +1 en attaque contre elle" },
          { rang: 2, nom: "Connaître sa proie (passive)", effet: "Test pour révéler une faiblesse (résistance, vulnérabilité) de la cible marquée" },
          { rang: 3, nom: "Traque acharnée (passive)", effet: "+2 m de déplacement et ignore le terrain difficile en poursuivant sa cible marquée" },
          { rang: 4, nom: "Coup de grâce (passive)", effet: "+1d8 DM contre la cible marquée sous 50% PV" },
          { rang: 5, nom: "Trophée ultime (L, 1x/scénario)", effet: "Ignore la moitié de la RD de la cible marquée, +3d6 DM bonus" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — le chasseur devenu prédateur. Pas de déclencheur actif : la jauge monte à chaque touche réussie. À force de traquer, le Chasseur a fini par devenir lui-même la bête.",
        rangs: [
          { rang: 1, nom: "Premier sang du prédateur (passif)", effet: "Chaque touche réussie à distance ou via un piège : +1 CS (max 6/combat)" },
          { rang: 2, nom: "Instinct sauvage (passive)", effet: "Force une capacité de Traque ou de la Gâchette en payant +1 CS : +1d6 DM bonus" },
          { rang: 3, nom: "Hurlement du prédateur (L)", effet: "Cible fuit ou subit -2 DEF. +2 CS. Critique : jet sur la table de mutation Palier 1" },
          { rang: 4, nom: "Sens du sang (passive, dès CA 5+)", effet: "Détecte automatiquement toute créature blessée dans un rayon de 100 m. Contrepartie : les animaux sauvages le fuient instinctivement" },
          { rang: 5, nom: "Chasse ultime (L, 1x/scénario)", effet: "+4 attaque à distance, ignore les couverts. +3 CS immédiat. Contrecoup : tire automatiquement sur la créature la plus proche dans sa ligne de mire, alliée ou non" },
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
          { rang: 1, nom: null, effet: "Bonus de réputation : les tests sociaux face à la noblesse ou aux institutions sont facilités" },
          { rang: 2, nom: null, effet: "Ajoute son Mod. de CHA à sa DEF — son rang impose le respect, y compris au combat" },
          { rang: 3, nom: null, effet: "Avantages tactiques en duel singulier (1 contre 1 formel)" },
          { rang: 4, nom: null, effet: "Résistance accrue aux tentatives de commandement ou d'intimidation venant d'un ennemi" },
          { rang: 5, nom: null, effet: "Capacité de prestige ultime liée à un titre ou une reconnaissance gagnée en jeu (à définir avec le MJ)" },
        ],
      },
      {
        nom: "Voie du commandant",
        speciale: false,
        description: "Le meneur sur le champ de bataille. Adaptation de la Voie du meneur d'hommes officielle.",
        rangs: [
          { rang: 1, nom: null, effet: "Immunisé à la Peur ; étend un bonus de résistance à la Peur à ses alliés proches" },
          { rang: 2, nom: null, effet: "Une fois par tour, peut encaisser un coup à la place d'un allié à son contact" },
          { rang: 3, nom: null, effet: "Capacité tactique intermédiaire (à préciser selon la progression de ta table)" },
          { rang: 4, nom: null, effet: "Une fois par tour, un allié en vue peut relancer un test d'attaque raté" },
          { rang: 5, nom: null, effet: "Charge collective (L, 1x/combat) : le Chevalier et ses alliés en vue se déplacent jusqu'à 20 m en ligne droite et enchaînent une attaque avec bonus" },
        ],
      },
      {
        nom: "Voie du protecteur",
        speciale: false,
        description: "Le rempart inébranlable. Adaptation de la Voie du bouclier du Guerrier, renommée.",
        rangs: [
          { rang: 1, nom: null, effet: "Partage le bonus de DEF de son bouclier avec un allié à son contact" },
          { rang: 2, nom: null, effet: "Peut absorber un coup destiné à un allié (L)" },
          { rang: 3, nom: null, effet: "Peut absorber un sort destiné à un allié (L)" },
          { rang: 4, nom: null, effet: "Accès à l'armure de plaques complète, protection accrue contre les critiques" },
          { rang: 5, nom: null, effet: "Peut renvoyer un sort absorbé contre son lanceur (L)" },
        ],
      },
      {
        nom: "Voie du paladin (justicier)",
        speciale: false,
        description: "Pas un tank-soigneur comme le combo officiel Chevalier/Prêtre — un juge. Il détecte le mensonge, prononce des jugements, et punit la corruption avérée.",
        rangs: [
          { rang: 1, nom: "Regard du juste (activable, 1x/scène)", effet: "Test de CHA opposé (ou difficulté fixe) : révèle si l'interlocuteur ment consciemment — simple « il ment » / « il dit vrai », sans détail" },
          { rang: 2, nom: "Châtiment du juste (passive)", effet: "Contre une cible reconnue coupable, la prochaine attaque réussie inflige +1d6 DM sacrés" },
          { rang: 3, nom: "Jugement (L, 1x/combat)", effet: "Jugement formel contre une cible. Coupable (appréciation MJ) : -4 attaque et DEF pour le reste du combat. Innocente : échec silencieux, aucun effet" },
          { rang: 4, nom: "Verdict inébranlable (passive)", effet: "Avantage automatique aux tests de résistance contre la tromperie, l'illusion et la manipulation mentale" },
          { rang: 5, nom: "Sentence finale (L, 1x/scénario)", effet: "Contre une cible jugée coupable (Rang 3 confirmé) : l'attaque réussie suivante inflige +6d6 DM sacrés, doublés contre démons/morts-vivants/corrompus" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — un chevalier en quête de puissance a passé un pacte avec une entité chaotique.",
        rangs: [
          { rang: 1, nom: "Lame liée (action gratuite, 1x/tour)", effet: "La prochaine attaque réussie ce tour inflige +1d6 DM chaotiques instables. +1 CP" },
          { rang: 2, nom: "Faveur sombre (passive)", effet: "Force n'importe quelle capacité martiale : +2 attaque OU +2 DEF jusqu'au prochain tour. +1 CP" },
          { rang: 3, nom: "Frappe du pacte (L)", effet: "Attaque au contact : +2d6 DM chaotiques en cas de réussite. +2 CP. Critique (19-20) : jet sur la table de mutation Palier 1" },
          { rang: 4, nom: "Marque du serment brisé (passive, dès CA 5+)", effet: "Au choix, fixe : +2 DEF permanent, ou +1d8 DM chaotique sur l'arme de prédilection. Contrepartie : rejeté par les ordres de chevalerie" },
          { rang: 5, nom: "Avatar du pacte (L, 1x/scénario)", effet: "[3+Mod. de CON] tours : armure semi-spectrale, +4 DEF, +2d6 DM à toutes les attaques, immunisé à la Peur. +3 CP immédiat. Contrecoup : perd son action de mouvement au tour suivant" },
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
          { rang: 1, nom: null, effet: "Les attaques à mains nues infligent des dégâts létaux : 1d6 + Mod. de FOR" },
          { rang: 2, nom: null, effet: "Le dé de dégâts passe à 1d8" },
          { rang: 3, nom: null, effet: "Le dé passe à 1d10, +2 DEF" },
          { rang: 4, nom: null, effet: "Le dé passe à 1d12" },
          { rang: 5, nom: null, effet: "Le dé passe à 2d6 ; option d'attaquer avec un d12 au lieu du d20 pour +2d6 DM bonus en cas de réussite" },
        ],
      },
      {
        nom: "Voie de l'élévation",
        speciale: false,
        description: "Maîtrise spirituelle et technique du corps et du bâton — la précision avant la force. (Adaptation de la Voie de la maîtrise officielle.)",
        rangs: [
          { rang: 1, nom: null, effet: "Bonus de précision : critiques facilités sur les attaques à mains nues ou au bâton" },
          { rang: 2, nom: null, effet: "Ajoute son Mod. d'INT ou de SAG (au choix à l'acquisition) à l'Initiative et à la DEF" },
          { rang: 3, nom: null, effet: "Perception fine du combat : estimation de l'état de santé et de la puissance relative d'un adversaire observé" },
          { rang: 4, nom: null, effet: "Les dégâts de ses attaques ne plafonnent plus sur un jet maximal (relance et cumule)" },
          { rang: 5, nom: null, effet: "Capacité ultime de maîtrise totale (à façonner avec le MJ selon le style de combat final souhaité — bâton ou mains nues)" },
        ],
      },
      {
        nom: "Voie de l'ascétisme",
        speciale: false,
        description: "Un moine qui a fait vœu de discipline et de foi. Sa force vient de ce qu'il a renoncé à posséder — et il frappe particulièrement fort tout ce qui est corrompu.",
        rangs: [
          { rang: 1, nom: "Discipline du corps (passive)", effet: "Renonce à un confort (silence, jeûne, dénuement matériel — trait de personnage). En échange : +2 à tous les tests de Volonté (SAG) contre la Peur et l'Intimidation" },
          { rang: 2, nom: "Poing béni (activable, 1x/combat)", effet: "La prochaine attaque inflige +1d6 DM sacrés, qui passent à +2d6 contre les morts-vivants, démons ou créatures corrompues" },
          { rang: 3, nom: "Jeûne purificateur (L, 1x/jour)", effet: "Par le toucher, purge un effet néfaste (poison, maladie, peur, charme) sur lui-même ou un allié au contact" },
          { rang: 4, nom: "Vœu inébranlable (passive)", effet: "Avantage automatique aux tests de résistance contre la corruption, la possession ou la manipulation mentale" },
          { rang: 5, nom: "Illumination du juste (L, 1x/scénario)", effet: "Éclat sacré en zone de 3 m : 3d6 DM (6d6 contre morts-vivants / démons / corrompus), et soigne 1d6 + Mod. de SAG à lui-même et ses alliés dans la zone" },
        ],
      },
      {
        nom: "Voie des éléments",
        speciale: false,
        description: "Le moine canalise feu, glace, terre et air à travers ses techniques de combat — boost physique, pas de magie incantée.",
        rangs: [
          { rang: 1, nom: "Poing élémentaire (action gratuite, 1x/tour)", effet: "Un élément actif jusqu'au tour suivant : Feu +1d4 DM · Glace +2 DEF · Terre (déstabilise, -2 DEF sur réussite) · Air (déstabilise, -2 attaque sur réussite)" },
          { rang: 2, nom: "Maîtrise élémentaire", effet: "Feu +1d6 DM · Glace +3 DEF · Terre ajoute une poussée de 1,5 m · Air → Étourdissement sur échec du test de DEX adverse" },
          { rang: 3, nom: "Second souffle élémentaire (L)", effet: "Change d'élément actif en cours de combat sans attendre son tour" },
          { rang: 4, nom: "Fusion élémentaire (L, 1x/combat)", effet: "Combine deux éléments pour un tour (effets par paire à détailler : Air+Feu, Air+Glace, Air+Terre...)" },
          { rang: 5, nom: "Avatar des éléments (L, 1x/scénario)", effet: "Les quatre éléments actifs simultanément : +2d6 feu, +4 DEF, immunité poussée/renversement, chance d'esquive surnaturelle" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — un moine qui a cherché à comprendre le chaos plutôt qu'à le combattre, et qui finit par y tomber. Tentation et hallucination, pas de sorts.",
        rangs: [
          { rang: 1, nom: "Méditation interdite (L)", effet: "+1d6 DM ou +2 attaque. Volonté (SAG) diff. 10 : échec → redirige l'attaque vers la créature la plus proche, allié compris" },
          { rang: 2, nom: "Voix du Vide (passive)", effet: "Force n'importe quelle capacité martiale (+2 attaque ou DEF). 1 chance sur 6 que les murmures échappent à voix haute" },
          { rang: 3, nom: "Vision fracturée (L)", effet: "+2d6 DM chaotiques. Volonté diff. 12 : échec → redirection de l'attaque" },
          { rang: 4, nom: "Esprit fendu (passive, dès Corruption d'Âme 5+)", effet: "Avantage contre Peur/Charme. Contrepartie : hallucinations hors combat, méfiance des ordres monastiques" },
          { rang: 5, nom: "Illumination noire (L, 1x/scénario)", effet: "+4 Initiative, +2 attaque, esquive auto 1x/tour. Après coup : désavantage généralisé pendant 1d4 tours" },
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
          { rang: 1, nom: null, effet: "Bonus de +2 à tous les tests d'INT liés à la connaissance et à l'érudition" },
          { rang: 2, nom: null, effet: "Le bonus passe à +4 ; produit une source de lumière magique à volonté" },
          { rang: 3, nom: null, effet: "Le bonus passe à +6 ; identification rapide d'objets ou de phénomènes magiques observés" },
          { rang: 4, nom: null, effet: "Le bonus passe à +8 ; capacité d'invisibilité temporaire, une fois par jour" },
          { rang: 5, nom: null, effet: "INT héroïque : une fois par jour, relance un test d'INT raté et garde le meilleur résultat" },
        ],
      },
      {
        nom: "Voie de la magie sauvage",
        speciale: false,
        description: "Le magicien n'a jamais pleinement dompté ses sorts. Chaque incantation offensive est traversée par une instabilité arcanique, source de puissance imprévisible.",
        rangs: [
          { rang: 1, nom: "Mutation Sauvage (auto.)", effet: "À chaque sort offensif, lancez 2d4 et retranchez 4 (de -2 à +4) : modificateur appliqué aux dégâts du sort" },
          { rang: 2, nom: "Instinct Chaotique", effet: "1x/rencontre, relancez le 2d4 et gardez le nouveau résultat" },
          { rang: 3, nom: "Canalisation Profonde", effet: "Sur un jet de +3 ou +4 : effet mineur au choix (repousse 1,5 m, embrase légèrement, ou aveugle 1 tour)" },
          { rang: 4, nom: "Maîtrise du Chaos", effet: "Renoncez au jet (-2 DM fixe) pour garantir +4 sans jet au sort suivant. 1x/repos long" },
          { rang: 5, nom: "Submersion Arcanique", effet: "1x/jour : doublez le modificateur (-4 à +8). Négatif : 1d4 DM + Étourdi. Positif : effet spectaculaire" },
        ],
      },
      {
        nom: "Voie de la magie élémentaire",
        speciale: false,
        description: "Feu, glace et terre canalisés à travers de vrais sorts — la version magicien de la polyvalence élémentaire.",
        rangs: [
          { rang: 1, nom: "Trio élémentaire (sort, L)", effet: "Choix quotidien : Flamme (1d6+Mod. d'INT feu) · Givre (1d6+Mod. d'INT glace, Ralentie 1 tour : -2 DEF) · Pierre (1d6+Mod. d'INT contact, repousse 1,5 m)" },
          { rang: 2, nom: "Intensité élémentaire", effet: "Les 3 sorts passent à 1d8 + Mod. d'INT" },
          { rang: 3, nom: "Zone élémentaire (L)", effet: "Version en zone (3 m, portée 15 m) d'un des 3 sorts : 3d6 DM, test de DEX diff. [10+Mod. d'INT] pour moitié" },
          { rang: 4, nom: "Maîtrise duale (L, 1x/combat)", effet: "Combine deux éléments en un seul sort (vapeur Feu+Glace, choc Feu+Terre... à détailler avec le MJ)" },
          { rang: 5, nom: "Cataclysme élémentaire (L, 1x/scénario)", effet: "Zone 6 m, portée 20 m : 6d6 DM + effet annexe (Feu : brûlure · Glace : Gelée/Immobilisée · Terre : terrain difficile)" },
        ],
      },
      {
        nom: "Voie du chaos",
        speciale: true,
        description: "Voie spéciale — folie arcanique : un magicien qui a creusé trop profondément dans les savoirs interdits, jusqu'à laisser le chaos s'immiscer dans son esprit et sa magie.",
        rangs: [
          { rang: 1, nom: "Glimpse du Vide (sort)", effet: "Attaque magique, portée 20 m : 2d8 DM chaotiques (pas de Mod. d'INT). +1 CS" },
          { rang: 2, nom: "Don corrompu (passive)", effet: "Force n'importe quel sort/capacité : +1d6 DM ou relance un dé raté. +1 CS" },
          { rang: 3, nom: "Vision interdite (L)", effet: "Zone 5 m, portée 15 m : 4d6 DM (DEX diff. [10+Mod. d'INT] pour moitié). +2 CS. Sur 18-20 naturel, jet sur la table de mutation Palier 1" },
          { rang: 4, nom: "Esprit fissuré (passive, dès CA 5+)", effet: "Au choix, fixe : +1d6 DM à tous les sorts, ou +2 résistance aux DM. Contrepartie : détecté comme instable par les cercles savants et académies" },
          { rang: 5, nom: "Avatar du Vide (L, 1x/scénario)", effet: "[3+Mod. d'INT] tours : +4 attaque magique, +2d6 DM à tous les sorts, divise par 2 les DM physiques subis. +3 CS immédiat. Contrecoup : Volonté (SAG) diff. 12 ou Halluciné 1 tour + 1d4 DM de choc arcanique" },
        ],
      },
    ],
    creation: [
      "Choisis ton orientation : érudit polyvalent (Universitaire), risque-tout instable (Sauvage), combattant magique (Élémentaire). La Voie du chaos n'est proposée que sur demande ou par accord avec le MJ.",
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
      { rang: 1, nom: "Sang Divin", effet: "+1 à tous les jets de sauvegarde contre la magie et la corruption." },
      { rang: 2, nom: "Résilience Mortelle", effet: "1x/jour, quand tu tombes à 0 PV, tu restes à 1 PV." },
      { rang: 3, nom: "Polyvalence", effet: "Tu gagnes un rang supplémentaire dans n'importe quelle Voie de ton profil (hors Voie du Chaos)." },
      { rang: 4, nom: "Ambition", effet: "+2 à une caractéristique de ton choix (définitif, choisi à ce rang)." },
      { rang: 5, nom: "Étincelle Divine", effet: "1x/jour, tu réussis automatiquement un test de caractéristique (annonce avant le jet)." },
    ],
  },

  elfe: {
    race: "elfe",
    nom_affiche: "Elfe",
    voie_nom: "Voie de l'Enfant de la Sève",
    description: "Connexion à l'Arbre-Monde, acuité sensorielle, longévité — tronc commun à toutes les nations elfiques.",
    trait_passif: null,
    variantes: [
      { code: "aetharion", nom_affiche: "Aetharion (Haut Elfe)", nom_capacite: "Intuition Magique", effet: "Tu peux identifier un sort ou un objet magique par simple contact (test INT DD 12). +1 aux jets d'attaque magique." },
      { code: "aelindra", nom_affiche: "Aelindra (Elfe Sylvain)", nom_capacite: "Communion Naturelle", effet: "En milieu naturel, tu ne laisses aucune trace. Tu peux communiquer des émotions simples avec les animaux sauvages." },
      { code: "mordanel", nom_affiche: "Mordanel (Elfe du Crépuscule)", nom_capacite: "Regard du Témoin", effet: "1x/combat, tu peux désigner une cible : jusqu'à ton prochain tour, tous tes alliés ont +2 aux attaques contre elle." },
    ],
    rangs: [
      { rang: 1, nom: "Sens Affinés", effet: "Vision dans la pénombre jusqu'à 18m. +2 aux tests de Perception." },
      { rang: 2, nom: "Grâce de la Sève", effet: "+2 en DEX. Tu ne peux pas être surpris si tu n'es pas inconscient." },
      { rang: 3, nom: "Héritage National", effet: "Capacité différente selon la nation elfique — choisis ta nation pour révéler l'effet." },
      { rang: 4, nom: "Mémoire des Âges", effet: "1x/session, tu te souviens d'un fait historique ou lié à la magie pertinent (le MJ fournit une information vraie)." },
      { rang: 5, nom: "Lien à l'Arbre", effet: "1x/jour, tu médites 10 minutes pour regagner 1d6+SAG PV. Inutilisable en armure lourde." },
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
      { rang: 1, nom: "Résistance de Pierre", effet: "+2 PV par niveau (rétroactif à la création). Résistance aux poisons : +4 aux jets de sauvegarde." },
      { rang: 2, nom: "Vision des Profondeurs", effet: "Vision dans le noir total jusqu'à 18m. Tu sens instinctivement si un tunnel est stable ou sur le point de s'effondrer." },
      { rang: 3, nom: "Ancrage", effet: "Tant que tu es debout sur de la terre ou de la pierre, tu ne peux pas être repoussé ou renversé contre ta volonté." },
      { rang: 4, nom: "Savoir des Veines", effet: "+2 aux tests d'INT liés à l'artisanat, la géologie, les mécanismes. Tu estimes la valeur exacte de tout minéral ou objet forgé au regard." },
      { rang: 5, nom: "Cœur de Montagne", effet: "1x/jour, tu encaisses sans dommage les dégâts d'une seule attaque (annonce après que les dés sont lancés mais avant application)." },
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
      { rang: 1, nom: "Sens Affinés", effet: "Vision dans la pénombre jusqu'à 9m. +1 aux tests de Perception et de Social." },
      { rang: 2, nom: "Sang Mêlé", effet: "+1 à tous les jets de sauvegarde contre la magie. +1 en DEX ou CHA (choix définitif)." },
      { rang: 3, nom: "Résonance", effet: "Tu perçois vaguement la présence de magie active dans un rayon de 9m (pas sa nature, juste son existence)." },
      { rang: 4, nom: "Adaptabilité", effet: "Tu gagnes un rang supplémentaire dans n'importe quelle Voie de ton profil." },
      { rang: 5, nom: "Double Héritage", effet: "1x/jour, tu peux relancer un test raté de Perception, Social ou INT. Tu gardes le second résultat." },
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
      { rang: 1, nom: "Carrure Menaçante", effet: "+2 aux tests d'Intimidation. Les ennemis humanoïdes de taille normale doivent réussir un test de SAG DD 10 pour t'attaquer en premier si une autre cible est disponible." },
      { rang: 2, nom: "Sang de Guerre", effet: "+1 en FOR ou CON (choix définitif). +2 PV par niveau (rétroactif)." },
      { rang: 3, nom: "Résistance Instinctive", effet: "Quand tu subis des dégâts qui t'amèneraient en dessous de la moitié de tes PV max, tu réduis ces dégâts de 3." },
      { rang: 4, nom: "Frénésie Contenue", effet: "1x/combat, tu peux déclencher une rage : +2 aux jets d'attaque et de dégâts pendant 3 tours. À la fin, test CON DD 12 ou tu es Fatigué (-2 à tout) jusqu'au prochain repos." },
      { rang: 5, nom: "Mémoire de la Guerre", effet: "Les émotions orciques ancestrales te donnent un instinct de combat brut. Tu n'es jamais surpris en combat, et tu ajoutes +1d4 aux dégâts de ta première attaque à chaque combat." },
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
      { rang: 1, nom: "Petite Taille", effet: "+2 aux tests de Discrétion. Tu peux te glisser dans des espaces pour une créature de taille Petite sans test." },
      { rang: 2, nom: "Instinct de Fuite", effet: "Jamais de désavantage en Discrétion ou DEX pour te désengager d'un combat. +1 en DEX." },
      { rang: 3, nom: "Bricoleur", effet: "Tu peux fabriquer ou désamorcer un piège simple avec des matériaux de récupération (test DEX ou INT DD 10). +2 aux tests liés aux pièges et mécanismes." },
      { rang: 4, nom: "Cible Difficile", effet: "Les attaques d'opportunité contre toi ont -2. 1x/combat, tu peux te déplacer de 3m sans provoquer d'attaque d'opportunité." },
      { rang: 5, nom: "Coup Bas", effet: "1x/combat, si tu attaques une cible qui n'a pas encore agi ou qui est engagée avec un allié, tu infliges +2d6 dégâts supplémentaires." },
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
        "Hiérarchie du Chaos\n\n• Niveau I — Dieux du Chaos : Enfants de la Sève bannis, pleinement cristallisés. Absents physiquement, influence indirecte et plans à long terme.\n• Niveau II — Consciences-émotions (Violence / Meurtre / Traque) : pas encore des dieux, millénaires d'existence. Bénédictions sur champions ; rarement, incarnation temporaire (siècles de recharge).\n• Niveau III — Démons : serviteurs créés par les Dieux du Chaos. Actifs dans le monde, outils de destruction de l'Ordre.\n• Niveau IV — Orcs & Gobelins : corps des consciences dans le monde mortel. Omniprésents, instruments sans dévotion consciente.\n\nL'Incarnation de la Traque — l'événement fondateur\n\nPour la première fois depuis des siècles, la conscience de la Traque s'est incarnée. Elle a chassé méthodiquement des villages entiers, silencieusement — un mode opératoire proche de la magie elfique plutôt que d'une attaque orc frontale.\n\nL'Empire l'a utilisé : il a désigné les Mordanel comme responsables, invocateurs du Chaos. Mensonge délibéré ou conviction sincère ? Ambiguïté narrative centrale de la campagne. Et si les Dieux du Chaos avaient manipulé les deux camps simultanément ?",
    },
    {
      titre: "Les trois systèmes humains",
      contenu:
        "Même origine pour tous les Humains — le sang divin fracturé. Après la Grande Sécession du Premier Empire, trois systèmes se disputent le monde connu : l'Empire de Solvarn, les Royaumes Coalisés (Valdorne, Arveth, Mornac, Serval) et la République de Liberra.\n\nL'Empire de Solvarn (Xénophobe · Centralisé · Religieux · Solaire)\nHéritier du Premier Empire ; la famille impériale revendique le sang des Gardiens de l'Écorce. Le soleil est son symbole. Doctrine : pureté du sang humain comme rempart au Chaos, non-humains = vecteurs de corruption. Ironie : Solvarn a raison sur un point (les Humains sont plus susceptibles au Chaos), appliqué de façon monstrueuse. But : purifier et reconquérir.\n\nLes Royaumes Coalisés (Chevaleresques · Féodaux · Hypocrites)\n• Valdorne : le plus ancien, berceau de la sécession, chevalerie sincère.\n• Arveth : frontalier de Solvarn, sous pression constante — le vacillant.\n• Mornac : maritime et commerçant, chevalerie de façade, pragmatique.\n• Serval : montagnard, allié des Nains de l'Ordre, le plus indépendant.\nStructure féodale (Seigneurs → Chevaliers → Paysans). Point de rupture : si Arveth tombe, la coalition se fracture.\n\nLa République de Liberra (Idéaliste · Inclusive · Fracturée)\nNée de la Sécession, rejette l'Empire et le féodalisme. Assemblée de citoyens ; non-humains admis (représentation inégale). Majorité Aelindra, minorité Mordanel. Fractures : marchands vs idéalistes vs militaires vs communautés non-humaines.\n\nTensions actuelles\n• Solvarn → Royaumes : reconquête (Arveth en première ligne).\n• Solvarn → Liberra : hérésie raciale.\n• Solvarn → Aetharion : guerre ouverte.\n• Valdorne → Solvarn : résistance idéaliste, refuse tout compromis.\n• Arveth → Coalition : vacillement, envisage de négocier — rupture potentielle.\n• Mornac : pragmatisme marchand (commerce avec Liberra, vend à Solvarn si le prix est bon).\n• Serval ↔ Nains de l'Ordre : alliance montagnarde solide.\n• Liberra ↔ Aelindra : alliance naturelle. Liberra ↔ Royaumes : alliance inconfortable contre Solvarn.",
    },
    {
      titre: "Géographie & capitales",
      contenu:
        "La Chaîne des Anciens traverse le continent du nord au sud et le divise en deux : qui contrôle ses cols contrôle le commerce et les armées. Les Nains de l'Ordre y tiennent trois forteresses-cols (nord, central, sud) — d'où les ménagements de Solvarn malgré sa xénophobie. À l'ouest : forêts elfiques et Royaumes Coalisés. À l'est : Solvarn et les Hordes.\n\n• Empire de Solvarn — Nord & centre-est — capitale Solmaris — borde Arveth au sud, Aetharion à l'ouest.\n• Valdorne — Sud-ouest — capitale Valdcourt — berceau de la sécession, forêts proches.\n• Arveth — Centre-sud — capitale Arvenfall — coincé entre Solvarn et la Chaîne (le vacillant).\n• Mornac — Côte sud — capitale Mornhaven — accès maritime, commerce avec tous.\n• Serval — Adossé à la Chaîne — capitale Serval — alliance avec les Nains de l'Ordre.\n• République de Liberra — Centre — capitale Libris — entre Royaumes et forêts elfiques.\n• Aetharion — Nord-ouest, côte — forêt fermée, Arbre-Monde en son cœur.\n• Aelindra — Centre-ouest, côte — forêt ouverte, frontière naturelle avec Liberra.\n• Mordanel — Sud-ouest, côte — entre Aelindra et Mornac (accusés par Solvarn).\n• Nains de l'Ordre — Chaîne des Anciens — trois forteresses-cols.\n• Khazrak Dûm — Pics Lointains (nord-est) — isolés.\n• Tribus Orcs/Gobelins — Est d'Aetharion et de Liberra — pression constante sur les forêts elfiques.",
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
      titre: "Notes MJ — éléments en construction",
      contenu:
        "Histoire récente : datation de la Grande Sécession ; lieu exact de l'incarnation de la Traque ; état des fronts Solvarn / Aetharion ; stade de vacillement d'Arveth.\n\nPNJ clés à créer : l'Empereur de Solvarn ; un chevalier de Valdorne (l'idéal) ; un lord d'Arveth (le vacillant) ; un Ancien vs un Jeune Mordanel ; un Khazrak Dûm résistant.\n\nDétails du monde : noms des fleuves et des mers ; peut-on voir/visiter l'Arbre-Monde ? ; structure de l'Église solvarienne (pape, inquisiteurs ?) ; fonctionnement des Académies de Liberra.",
    },
  ],
};

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
];
