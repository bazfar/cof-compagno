/* ============================================================
   Dons — bonus descriptifs gratuits acquis aux niveaux 4, 8 et 12
   (cf. REGLES_GENERALES dans data/donnees.js pour le contexte des
   paliers et js/personnage.js pour le champ `dons` du personnage).
   Appliqués manuellement par le joueur en jeu, comme les effets
   d'accessoires (js/raretes.js) ou les capacités textuelles ci-dessus —
   aucune automatisation de calcul de dégâts/DEF ici.
   ============================================================ */

const DONS = [
  { id: "frappe_puissante", nom: "Frappe puissante", categorie: "combat",
    effet: "Avec une arme deux_mains : accepte -2 au jet d'attaque pour +4 aux dégâts, au choix à chaque attaque." },

  { id: "tir_precision", nom: "Tir de précision", categorie: "combat",
    effet: "Avec une arme à distance : accepte -2 au jet d'attaque pour +4 aux dégâts. Ignore les bonus de couverture partielle de la cible." },

  { id: "combattant_duel", nom: "Combattant en duel", categorie: "combat",
    effet: "Tant que vous ne maniez qu'une seule arme (une main libre, ni bouclier ni seconde arme) et qu'un seul adversaire vous est adjacent : +2 DEF." },

  { id: "ambidextre", nom: "Ambidextre", categorie: "combat",
    effet: "Combat à deux armes : réduit de -4 à -2 le malus au jet d'attaque quand l'une des deux armes n'est pas courte, et porte les dégâts de l'arme secondaire de 50% à 75%." },

  { id: "maitre_armes_doubles", nom: "Maître d'armes doubles", categorie: "combat",
    effet: "Combat à deux armes : supprime totalement le malus au jet d'attaque (jet normal en toutes combinaisons) et porte les dégâts de l'arme secondaire à 100%." },

  { id: "maitre_armes_martiales", nom: "Maître des armes martiales", categorie: "combat",
    effet: "Manier une arme martiale ne provoque plus le malus de -3 au jet d'attaque, même sans la maîtriser nativement (cf. PROFICIENCE_ARME, data/donnees.js)." },

  { id: "expert_hast", nom: "Expert en hast", categorie: "combat",
    effet: "Avec une arme deux_mains à allonge (lance, hallebarde, pique, glaive de guerre) : +1 dégâts, et attaque d'opportunité bonus quand un ennemi entre à contact avec vous." },

  { id: "sentinelle", nom: "Sentinelle", categorie: "combat",
    effet: "Une cible qui quitte votre portée de contact subit une attaque d'opportunité même via une action de retrait organisé ; cette attaque réduit son déplacement à 0 pour le reste du tour." },

  { id: "robuste", nom: "Robuste", categorie: "defense",
    effet: "+2 PV par niveau, rétroactif sur tous les niveaux déjà acquis." },

  { id: "maitre_armures_moyennes", nom: "Maître des armures moyennes", categorie: "defense",
    effet: "Porter une armure moyenne ne provoque plus aucun malus de proficience (DEX forcé à 0 en CA, -3 attaque contact/magique, -2 attaque à distance, -2 tests DEX, -2 Réflexes, -2 déplacement), même sans la maîtriser nativement." },

  { id: "maitre_armures_lourdes", nom: "Maître des armures lourdes", categorie: "defense",
    effet: "Porter une armure lourde ne provoque plus aucun malus de proficience (DEX forcé à 0 en CA, -3 attaque contact/magique, -2 attaque à distance, -2 tests DEX, -2 Réflexes, -2 déplacement), même sans la maîtriser nativement. Avec une armure lourde équipée : réduit aussi de 3 les dégâts physiques subis, avant application de reductionDegats." },

  { id: "expert_bouclier", nom: "Expert du bouclier", categorie: "defense",
    effet: "Bouclier équipé : +1 DEF supplémentaire. Les adversaires qui vous attaquent au contact ou à distance sont désavantagés (2d20, gardent le plus bas)." },

  { id: "alerte", nom: "Alerte", categorie: "perception",
    effet: "+5 Initiative. Ne peut jamais être surpris." },

  { id: "mobile", nom: "Mobile", categorie: "mobilite",
    effet: "+1 case de déplacement. Ignore le terrain difficile après avoir attaqué un ennemi au contact ce tour. Ne provoque jamais d'attaque d'opportunité en s'éloignant d'une cible qu'il vient de frapper." },

  { id: "fouilleur_donjon", nom: "Fouilleur de donjon", categorie: "exploration",
    effet: "Avantage (relance en gardant le meilleur résultat) sur les jets de Perception liés aux pièges et passages secrets." },

  { id: "athlete", nom: "Athlète", categorie: "exploration",
    effet: "+1 FOR ou DEX au choix. Aucun malus au premier mètre d'escalade, de saut ou de nage." },

  { id: "doue", nom: "Doué", categorie: "social",
    effet: "+1 CHA lors des conversations (jets de Bluff, Intimidation, Représentation, Persuasion en dialogue, hors combat)." },

  { id: "acteur", nom: "Acteur", categorie: "social",
    effet: "Avantage sur les jets de CHA liés à l'imitation ou la tromperie. Peut imiter une voix déjà entendue." },

  { id: "initie_arcanes", nom: "Initié aux arcanes", categorie: "magie",
    effet: "Débloque gratuitement une voie hors profil liée à l'intelligence (Magicien ou Nécromancien), au choix. Ses rangs s'achètent ensuite normalement avec les points de capacité." },

  { id: "chanceux", nom: "Chanceux", categorie: "utilitaire",
    effet: "3 points de chance par jour. Dépenser un point pour relancer un jet raté (le sien, ou imposer la relance d'un jet qu'un ennemi vient de réussir contre lui)." },

  { id: "amelioration_carac", nom: "Amélioration de caractéristique", categorie: "stat",
    effet: "+1 à deux caractéristiques au choix. Plafond 18, sauf pour les caractéristiques d'affinité raciale qui montent à 20 : Elfe (INT, DEX) ; Nain / Demi-orc (CON, FOR) ; Demi-gobelin (DEX, INT)." },
];

if (typeof window !== "undefined") { window.DONS = DONS; }
