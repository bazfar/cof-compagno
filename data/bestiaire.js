/* ============================================================
   Bestiaire — COF Homebrew Arbre-Monde
   Source : bestiaire.json v1.0.0
   Export : BESTIAIRE (tableau) + BESTIAIRE_INDEX (map par id)
   ============================================================ */

const BESTIAIRE = [
  {
    id: "goblin_eclaireur",
    nom: "Gobelin éclaireur",
    categorie: "Session 1",
    faction: "Tribu Rochedent",
    pv: 6, def: 12, init: 4, atk: 2,
    dangerosite: 1, boss: false, taille: "petite",
    attaques: [
      { nom: "Dague rouillée",  jet: "1d20+2 vs DEF", degats: "1d4", portee: "contact",       type: "physique", effetSpecial: null },
      { nom: "Fronde",          jet: "1d20+3 vs DEF", degats: "1d4", portee: "moyenne (18m)", type: "physique", effetSpecial: null }
    ],
    capacitesSpeciales: [
      { nom: "Fuite instinctive",     description: "Si le gobelin est le dernier de son groupe, il tente de fuir (test SAG diff. 10 pour le bloquer). S'il réussit, il alerte le reste de la tribu." },
      { nom: "Camouflage de sous-bois", description: "En forêt, les PJ ont un malus de -2 à leurs tests de Perception pour repérer un éclaireur immobile." }
    ],
    lore: "Sentinelles légères de la tribu Rochedent, les éclaireurs gobelins patrouillent en binôme. Ils évitent le combat frontal mais n'hésitent pas à décrocher pour prévenir leurs congénères. Leur équipement est de mauvaise qualité mais leur connaissance du terrain est redoutable.",
    xp: 20
  },
  {
    id: "goblin_garde",
    nom: "Gobelin garde",
    categorie: "Session 1",
    faction: "Tribu Rochedent",
    pv: 12, def: 14, init: 2, atk: 3,
    dangerosite: 1, boss: false, taille: "petite",
    attaques: [
      { nom: "Couperet", jet: "1d20+3 vs DEF", degats: "1d6+1", portee: "contact",      type: "physique", effetSpecial: null },
      { nom: "Javelot",  jet: "1d20+2 vs DEF", degats: "1d6",   portee: "courte (6m)", type: "physique", effetSpecial: "Une utilisation par combat (stock de 2 javelots)." }
    ],
    capacitesSpeciales: [
      { nom: "Formation serrée", description: "Si deux gardes ou plus sont adjacents, ils gagnent +1 en DEF tant qu'ils restent en contact." }
    ],
    lore: "Plus lourdement équipés que les éclaireurs, les gardes portent un équipement de fortune récupéré sur des voyageurs. Ils défendent les points stratégiques du campement avec une discipline surprenante pour des gobelins.",
    xp: 35
  },
  {
    id: "goblin_chef",
    nom: "Kratz, chef de la tribu Rochedent",
    categorie: "Session 1",
    faction: "Tribu Rochedent",
    pv: 28, def: 15, init: 3, atk: 5,
    dangerosite: 2, boss: true, taille: "petite",
    attaques: [
      { nom: "Sabre récupéré",   jet: "1d20+5 vs DEF", degats: "1d8+2", portee: "contact",      type: "physique", effetSpecial: null },
      { nom: "Filet de chasse",  jet: "1d20+3 vs DEF", degats: "0",     portee: "courte (6m)", type: "physique", effetSpecial: "Si touché : cible entravée (DEF -2, pas de déplacement). Test FOR diff. 12 à chaque tour pour se libérer. Recharge : 3 rounds." },
      { nom: "Cri de ralliement", jet: null, degats: null,               portee: "zone (9m)",   type: "moral",    effetSpecial: "Utilisable 1 fois par combat. Tous les gobelins dans la zone regagnent 1d4 PV et +1 en ATK jusqu'à la fin du prochain tour de Kratz." }
    ],
    capacitesSpeciales: [
      { nom: "Autorité tribale", description: "Tant que Kratz est vivant, les gobelins de son groupe ne testent pas le moral. À sa mort, ils effectuent immédiatement un test de moral (SAG diff. 8) ou fuient." },
      { nom: "Coup bas",         description: "Si Kratz attaque un PJ qui vient d'être attaqué par un autre gobelin ce tour-ci, il gagne +2 aux dégâts." }
    ],
    lore: "Kratz n'est pas le plus fort de sa tribu, mais le plus rusé. Il a orchestré le rapt du charretier Aldric pour rançonner la ville voisine, une initiative sans précédent pour les Rochedent. Il négocie en broken Common et pourrait être un informateur involontaire sur d'autres menaces dans la région.",
    xp: 120,
    roleNarratif: "Boss de scène. Peut être capturé vivant pour interrogatoire. Connaît l'emplacement d'Aldric."
  },
  {
    id: "goblin_chaman",
    nom: "Gobelin chaman",
    categorie: "Session 1",
    faction: "Tribu Rochedent",
    pv: 8, def: 11, init: 3, atk: 1,
    dangerosite: 2, boss: false, taille: "petite",
    attaques: [
      { nom: "Bâton noueux",         jet: "1d20+1 vs DEF",          degats: "1d4", portee: "contact",      type: "physique",               effetSpecial: null },
      { nom: "Crachat de Sève noire", jet: "1d20+3 vs DEF (magique)", degats: "1d6", portee: "courte (6m)", type: "magique (Chaos corrompu)", effetSpecial: "Si touché : la cible doit réussir un test CON diff. 12 ou subir -1 en ATK jusqu'à la fin du combat (effet cumulable une fois max)." }
    ],
    capacitesSpeciales: [
      { nom: "Totem de peur",   description: "Action complète, utilisable 1 fois. Place un totem dans une case adjacente. Pendant 2 rounds, toute créature non-gobeline entrant dans une zone de 3m autour du totem doit réussir un test SAG diff. 11 ou perdre son action le tour suivant." },
      { nom: "Sève corrompue", description: "Le chaman perçoit vaguement les flux de Sève. Il peut sentir la présence de magie active dans un rayon de 15m (hors-combat)." }
    ],
    lore: "Rare gobelin touchant à la Sève corrompue — un éclat du Chaos filtré à travers la terre. Les chamans gobelins sont craints même au sein de leur tribu. Celui-ci a convaincu Kratz que le rapt était 'voulu par les esprits', ce qui est faux : il cherche à tester les défenses humaines pour une puissance extérieure encore inconnue.",
    xp: 80,
    roleNarratif: "Optionnel. Révèle l'implication d'une menace plus grande si capturé et interrogé."
  },
  {
    id: "loup_des_bois",
    nom: "Loup des bois",
    categorie: "Bestiaire général — Tier 1",
    faction: null,
    pv: 14, def: 13, init: 5, atk: 3,
    dangerosite: 1, boss: false, taille: "moyenne",
    attaques: [
      { nom: "Morsure",   jet: "1d20+3 vs DEF", degats: "1d6+1", portee: "contact", type: "physique", effetSpecial: null },
      { nom: "Plaquage",  jet: "1d20+3 vs DEF", degats: "1d4",   portee: "contact", type: "physique", effetSpecial: "Si touché : test FOR diff. 11 ou la cible est renversée (DEF -2 jusqu'à se relever avec une action)." }
    ],
    capacitesSpeciales: [
      { nom: "Meute",             description: "Pour chaque loup allié adjacent à la même cible, le loup gagne +1 aux jets d'attaque (max +3)." },
      { nom: "Odorat développé", description: "Ne peut pas être surpris par des créatures qu'il n'a pas sentie. Piste une cible blessée sans test." }
    ],
    lore: "Prédateurs naturels des forêts de l'Arbre-Monde, les loups obéissent à la hiérarchie de la Sève — ils se montrent rarement agressifs envers ceux qui ne perturbent pas l'équilibre. Un loup qui attaque de jour est souvent enragé ou manipulé.",
    xp: 40
  },
  {
    id: "sanglier_de_rage",
    nom: "Sanglier de rage",
    categorie: "Bestiaire général — Tier 1",
    faction: null,
    pv: 20, def: 12, init: 2, atk: 4,
    dangerosite: 2, boss: false, taille: "grande",
    attaques: [
      { nom: "Charge",    jet: "1d20+4 vs DEF", degats: "2d6",   portee: "contact", type: "physique", effetSpecial: "Utilisable seulement si le sanglier se déplace d'au moins 6m en ligne droite avant l'attaque. Si touché : test FOR diff. 13 ou repoussé de 3m et renversé." },
      { nom: "Défenses",  jet: "1d20+4 vs DEF", degats: "1d8+2", portee: "contact", type: "physique", effetSpecial: null }
    ],
    capacitesSpeciales: [
      { nom: "Rage sanguine", description: "En dessous de la moitié de ses PV, le sanglier gagne +2 en ATK et ne peut plus battre en retraite. Il attaque jusqu'à la mort." },
      { nom: "Peau épaisse",  description: "Réduit tous les dégâts physiques de 1 (min. 1)." }
    ],
    lore: "Les sangliers de l'Arbre-Monde sont imprégnés de Sève brute. Normalement paisibles, ils deviennent incontrôlables si leur territoire est souillé par le Chaos — leur pelage vire alors au noir et leurs yeux rougissent.",
    xp: 60
  },
  {
    id: "spectre_de_ruine",
    nom: "Spectre de ruine",
    categorie: "Bestiaire général — Tier 1",
    faction: "Échos du Chaos",
    pv: 10, def: 14, init: 4, atk: 3,
    dangerosite: 2, boss: false, taille: "moyenne",
    attaques: [
      { nom: "Toucher glacial",   jet: "1d20+3 vs DEF (magique)", degats: "1d6", portee: "contact",      type: "magique (froid)",   effetSpecial: "Si touché : test CON diff. 11 ou -1 en initiative jusqu'à la fin du combat." },
      { nom: "Hurlement du vide", jet: "1d20+3 vs DEF (magique)", degats: "1d4", portee: "courte (6m)", type: "magique (mental)",  effetSpecial: "Recharge : 3 rounds. Test SAG diff. 12 ou la cible perd son action le prochain tour (paralysie de terreur)." }
    ],
    capacitesSpeciales: [
      { nom: "Résistance physique", description: "Les armes non-magiques ne lui infligent que la moitié des dégâts (arrondi à l'inférieur). Les armes en bois de l'Arbre-Monde (traité par un Druide) l'affectent normalement." },
      { nom: "Ancrage au lieu",     description: "Le spectre ne peut s'éloigner de plus de 30m de l'endroit où il est mort. Il disparaît si l'ancrage (objet ou lieu maudit) est détruit." }
    ],
    lore: "Les spectres de ruine sont des fragments d'âme coincés dans les zones où le Chaos a touché la Sève. Ce ne sont pas des morts-vivants au sens classique — ils sont l'écho d'une terreur figée dans le bois même du monde. On les trouve dans les ruines pré-Fracture ou près des arbres-cicatrices.",
    xp: 75
  },
  {
    id: "racine_eveille",
    nom: "Racine éveillée",
    categorie: "Bestiaire général — Tier 1",
    faction: "Gardiens corrompus de la Sève",
    pv: 18, def: 13, init: 1, atk: 4,
    dangerosite: 2, boss: false, taille: "grande",
    attaques: [
      { nom: "Fouet de racine", jet: "1d20+4 vs DEF", degats: "1d8", portee: "courte (6m)", type: "physique", effetSpecial: null },
      { nom: "Emprise",         jet: "1d20+4 vs DEF", degats: "1d4", portee: "contact",      type: "physique", effetSpecial: "Si touché : la cible est saisie (ne peut pas se déplacer). Test FOR diff. 13 à chaque tour pour se libérer. La racine peut maintenir et attaquer en même temps." }
    ],
    capacitesSpeciales: [
      { nom: "Ancrage terrestre",    description: "Immunisée aux effets de poussée et renversement. Ne peut pas être déplacée de force." },
      { nom: "Régénération de Sève", description: "Récupère 2 PV au début de chacun de ses tours si elle est en contact avec la terre (pas sur pierre, bois mort ou métal)." },
      { nom: "Vulnérabilité au feu", description: "Subit +2 dégâts par dé de tous les effets de feu." }
    ],
    lore: "Quand la Sève d'un arbre ancien est corrompue par un éclat du Chaos, ses racines développent parfois une conscience rudimentaire et hostile. Ce n'est pas un monstre à proprement parler — c'est un arbre qui souffre et qui attaque tout ce qui approche. Les Druides peuvent tenter de le purifier (test SAG diff. 15, action complète) plutôt que de le tuer.",
    xp: 65
  },
  {
    id: "orc_pillard",
    nom: "Orc pillard",
    categorie: "Bestiaire général — Tier 1",
    faction: "Tribus orques libres",
    pv: 22, def: 14, init: 2, atk: 5,
    dangerosite: 2, boss: false, taille: "grande",
    attaques: [
      { nom: "Hache de guerre",  jet: "1d20+5 vs DEF", degats: "1d8+3", portee: "contact",      type: "physique", effetSpecial: null },
      { nom: "Lancer de hache", jet: "1d20+3 vs DEF", degats: "1d8+1", portee: "courte (6m)", type: "physique", effetSpecial: "1 utilisation (récupère la hache si il ne subit pas de dégâts ce tour)." }
    ],
    capacitesSpeciales: [
      { nom: "Furie de bataille",    description: "Lorsque l'orc tue un adversaire, il gagne immédiatement un déplacement bonus de 6m et une attaque bonus contre une cible adjacente." },
      { nom: "Cristallisé de guerre", description: "Conformément au lore de l'Arbre-Monde, l'orc est une émotion de guerre cristallisée. Il est immunisé aux effets de peur." }
    ],
    lore: "Les orcs du monde sont les émotions de guerre que les dieux ont chassées de leur panthéon lors de la Fracture — des êtres de pure violence cristallisée en chair. Les pillards sont les individus les moins organisés, souvent mercenaires ou bandits, mais certaines tribus ont développé des codes d'honneur complexes.",
    xp: 80
  },
  {
    id: "sylvath_fragment",
    nom: "Fragment de Sylvath",
    categorie: "Bestiaire général — Tier 2",
    faction: "Dieux du Chaos (Enfants de la Sève)",
    pv: 35, def: 16, init: 4, atk: 6,
    dangerosite: 3, boss: false, taille: "grande",
    attaques: [
      { nom: "Liane de corruption",   jet: "1d20+6 vs DEF (magique)",        degats: "1d10+2", portee: "courte (6m)", type: "magique (Chaos végétal)", effetSpecial: "Si touché : test CON diff. 14 ou la cible est empoisonnée (1d4 dégâts par round, 3 rounds). L'antidote est de la Sève pure appliquée par un Druide ou Prêtre." },
      { nom: "Explosion de spores",   jet: "1d20+5 vs DEF (magique, zone 4m)", degats: "2d6",    portee: "courte (6m)", type: "magique (Chaos végétal)", effetSpecial: "Recharge : 4 rounds. Toutes les créatures dans la zone sont affectées. Test CON diff. 13 ou aveuglées pendant 1 round." }
    ],
    capacitesSpeciales: [
      { nom: "Aura de corruption",      description: "Toute créature débutant son tour à 3m ou moins du fragment doit réussir un test CON diff. 12 ou subir 1d4 dégâts magiques (Chaos)." },
      { nom: "Régénération chaotique",  description: "Récupère 3 PV au début de son tour. La régénération est bloquée pour le round si la créature a subi des dégâts de feu ou de magie de l'Ordre." },
      { nom: "Appel du Dieu blessé",    description: "À sa mort, le fragment libère une onde de Sève corrompue : toutes les créatures à 6m testent leur résistance au Chaos (classe dépendante). Ceux qui échouent gagnent un point de Corruption." }
    ],
    lore: "Sylvath, dieu de la croissance devenu dieu du Chaos après la Fracture, projette des fragments de sa conscience dans le monde sous forme de masses végétales animées. Ces fragments cherchent à corrompre les nœuds de Sève pure — les vieux arbres, les sources, les sanctuaires Druides. Ils ne sont pas vraiment intelligents mais obéissent à une pulsion divine.",
    xp: 200
  },
  {
    id: "garde_solvarn",
    nom: "Garde impérial de Solvarn",
    categorie: "Bestiaire général — Tier 2",
    faction: "Empire de Solvarn",
    pv: 26, def: 17, init: 1, atk: 5,
    dangerosite: 2, boss: false, taille: "moyenne",
    attaques: [
      { nom: "Épée longue solaire", jet: "1d20+5 vs DEF", degats: "1d8+2", portee: "contact", type: "physique", effetSpecial: "L'arme est bénie par Aethar. Elle inflige +1d4 dégâts supplémentaires contre les créatures du Chaos." },
      { nom: "Bouclier-frappe",     jet: "1d20+4 vs DEF", degats: "1d4+1", portee: "contact", type: "physique", effetSpecial: "Test FOR diff. 12 ou la cible est repoussée de 1,5m et perd son action de déplacement." }
    ],
    capacitesSpeciales: [
      { nom: "Formation légionnaire", description: "Si trois gardes ou plus sont adjacents, ils forment un mur de boucliers : DEF +2 pour tous, mais se déplacent à demi-vitesse." },
      { nom: "Résistance solaire",    description: "Immunisé aux effets de peur d'origine Chaos. Bonus de +2 aux tests de résistance au Chaos." }
    ],
    lore: "L'Empire de Solvarn entraîne ses légionnaires dès l'enfance dans la doctrine du Soleil Éternel d'Aethar. Ces gardes sont fanatiques mais disciplinés — ils ne tuent pas aveuglément mais n'hésitent pas à arrêter quiconque est suspecté de contact avec la Sève corrompue, elfe ou humain.",
    xp: 90
  },
  {
    id: "golem_de_pierre_naine",
    nom: "Golem de pierre (artisanat nain)",
    categorie: "Bestiaire général — Tier 2",
    faction: "Khazrak Dûm (variante)",
    pv: 45, def: 18, init: 0, atk: 6,
    dangerosite: 3, boss: false, taille: "grande",
    attaques: [
      { nom: "Poing de granit", jet: "1d20+6 vs DEF", degats: "2d8+4", portee: "contact", type: "physique", effetSpecial: "Si dégâts ≥ 10 en une frappe : test FOR diff. 15 ou la cible est projetée à 3m et renversée." },
      { nom: "Piétinement",     jet: "1d20+5 vs DEF", degats: "2d6",   portee: "contact", type: "physique", effetSpecial: "Cible au sol uniquement. Les dégâts ignorent les armures légères." }
    ],
    capacitesSpeciales: [
      { nom: "Immunité (mental)", description: "Immunisé à tous les effets mentaux, charmes, peurs et illusions." },
      { nom: "Armure naturelle",  description: "Réduit tous les dégâts physiques de 3. Vulnérable aux dégâts de foudre (+2 dégâts par dé)." },
      { nom: "Mot d'arrêt",       description: "Chaque golem nain possède un mot de commande gravé en rune. Un personnage qui connaît le mot peut tenter de le désactiver (test INT diff. 16 en action complète)." }
    ],
    lore: "Les nains de Khazrak Dûm sculptent ces gardiens dans la roche-mère de l'Arbre-Monde, animés par un fragment de la Pierre divine de Valdaan. Les golems des Évolutionnistes (qui s'allient aux orques) sont souvent souillés d'échos de Chaos — moins obéissants, plus violents.",
    xp: 250
  },
  {
    id: "elfe_du_crepuscule_renegat",
    nom: "Elfe du Crépuscule renégat",
    categorie: "Bestiaire général — Tier 2",
    faction: "Mordanel (renégats)",
    pv: 20, def: 15, init: 5, atk: 6,
    dangerosite: 3, boss: false, taille: "moyenne",
    attaques: [
      { nom: "Lame d'ombre",       jet: "1d20+6 vs DEF",          degats: "1d6+2", portee: "contact",      type: "physique + magique", effetSpecial: "En lumière faible ou obscurité : +1d4 dégâts supplémentaires." },
      { nom: "Flèche de Sève noire", jet: "1d20+5 vs DEF (magique)", degats: "1d8",   portee: "longue (36m)", type: "magique (Chaos)",    effetSpecial: "Si touché : test SAG diff. 13 ou la cible est désorientée (-2 en ATK et DEF) pendant 1 round." },
      { nom: "Pas d'ombre",        jet: null, degats: null,                           portee: "contact",      type: "déplacement",       effetSpecial: "Réaction, 1 fois par round. Quand ciblé par une attaque, l'elfe peut se déplacer de 3m dans une direction — si la nouvelle case est dans l'ombre, l'attaque est annulée (test DEX diff. 12)." }
    ],
    capacitesSpeciales: [
      { nom: "Vision nocturne parfaite",       description: "Voit en obscurité totale jusqu'à 18m comme en plein jour. Dans l'ombre, il est considéré en camouflage léger (+2 DEF, -2 aux jets de Perception ennemis)." },
      { nom: "Résistance naturelle au Chaos", description: "Les Elfes du Crépuscule sont préChrono-Fracture. Ils bénéficient d'un bonus de +3 à tous leurs tests de résistance au Chaos, même corrompus." }
    ],
    lore: "Mordanel, nation des Elfes du Crépuscule, est officiellement neutre. Mais certains de ses membres — tentés par le pouvoir de la Sève noire ou mercenaires sans scrupules — opèrent dans les zones grises. Ce ne sont pas des monstres mais des ennemis circonstanciels, souvent récupérables par la diplomatie.",
    xp: 150
  }
];

const BESTIAIRE_INDEX = Object.fromEntries(BESTIAIRE.map(m => [m.id, m]));
