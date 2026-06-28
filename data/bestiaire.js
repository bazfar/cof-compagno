/* ============================================================
   Bestiaire de base — Chroniques Oubliées Fantasy (homebrew)
   Modèles de monstres (ModeleMonstre). Le MJ peut en créer d'autres
   (élites, boss) qui s'ajoutent à cette liste (stockés en localStorage).

   type : "normal" | "elite" | "boss"
   attaques / capacites : listes de chaînes (texte libre).
   ============================================================ */

const TYPES_MONSTRE = {
  normal: { label: "Normal", couleur: "#5a7d44" },
  elite:  { label: "Élite",  couleur: "#b8924a" },
  boss:   { label: "Boss",   couleur: "#8a2f3b" },
};

const BESTIAIRE_BASE = [
  // ---------- Normaux ----------
  {
    id: "gobelin", nom: "Gobelin", emoji: "👺", type: "normal",
    pv: 8, def: 12, init: 12, attaque: 3,
    attaques: ["Dague rouillée — 1d4+1"],
    capacites: ["Embuscade : +2 en attaque s'il agit depuis une cachette"],
    tags: ["gobelinoïde"],
    description: "Né de la ruse cristallisée. Frappe depuis l'ombre, fuit dès qu'il est en infériorité.",
  },
  {
    id: "orc", nom: "Orc", emoji: "🪓", type: "normal",
    pv: 14, def: 13, init: 10, attaque: 4,
    attaques: ["Hache lourde — 1d8+2"],
    capacites: ["Férocité : +2 aux dégâts quand il est sous 50% de PV"],
    tags: ["orc"],
    description: "Né du meurtre frontal. Combat en horde, regarde sa proie dans les yeux.",
  },
  {
    id: "loup", nom: "Loup", emoji: "🐺", type: "normal",
    pv: 10, def: 13, init: 14, attaque: 3,
    attaques: ["Morsure — 1d6+1"],
    capacites: ["Tactique de meute : +1 en attaque par allié adjacent à la cible"],
    tags: ["bête"],
    description: "Prédateur des forêts. Dangereux en nombre, lâche seul.",
  },
  {
    id: "squelette", nom: "Squelette", emoji: "💀", type: "normal",
    pv: 9, def: 11, init: 8, attaque: 2,
    attaques: ["Épée ébréchée — 1d6"],
    capacites: ["Mort-vivant : immunisé à la peur, au poison et aux saignements"],
    tags: ["mort-vivant"],
    description: "Os réanimés par la nécromancie. Obéit sans poser de question.",
  },
  {
    id: "zombie", nom: "Zombie", emoji: "🧟", type: "normal",
    pv: 13, def: 9, init: 5, attaque: 2,
    attaques: ["Griffes putrides — 1d6"],
    capacites: ["Mort-vivant", "Lent : -2 m de déplacement", "Résilience : ignore le premier coup critique reçu"],
    tags: ["mort-vivant"],
    description: "Cadavre relevé. Lent mais tenace, avance sans crainte.",
  },
  {
    id: "araignee", nom: "Araignée géante", emoji: "🕷️", type: "normal",
    pv: 11, def: 13, init: 13, attaque: 3,
    attaques: ["Morsure venimeuse — 1d6 + poison (CON diff. 12 ou 1d4/tour, 3 tours)"],
    capacites: ["Toile : peut Immobiliser une cible (DEX diff. 12)"],
    tags: ["bête"],
    description: "Tisse ses embuscades dans les ruines et les cavernes.",
  },
  {
    id: "bandit", nom: "Bandit", emoji: "🗡️", type: "normal",
    pv: 10, def: 12, init: 11, attaque: 3,
    attaques: ["Épée courte — 1d6+1", "Arbalète légère — 1d6 (à distance)"],
    capacites: ["Attaque sournoise : +1d6 contre une cible déjà engagée"],
    tags: ["humanoïde"],
    description: "Détrousseur des routes. Préfère le nombre et la surprise.",
  },

  // ---------- Élites ----------
  {
    id: "chamane-gobelin", nom: "Chamane gobelin", emoji: "🔮", type: "elite",
    pv: 14, def: 12, init: 11, attaque: 3,
    attaques: ["Éclair chaotique — 2d6 (portée 15 m)"],
    capacites: ["Soin tribal (L) : rend 1d6 PV à un allié", "Malédiction : -2 aux jets d'une cible (SAG diff. 12)"],
    tags: ["gobelinoïde", "lanceur"],
    description: "Canalise une bribe de chaos pour soutenir sa tribu.",
  },
  {
    id: "ours-cavernes", nom: "Ours des cavernes", emoji: "🐻", type: "elite",
    pv: 28, def: 13, init: 9, attaque: 6,
    attaques: ["Coup de griffes — 2d6+3", "Morsure — 1d10+3"],
    capacites: ["Étreinte : Immobilise une cible touchée (FOR diff. 14)", "Furie : 2 attaques par tour sous 50% de PV"],
    tags: ["bête"],
    description: "Colosse des grottes. Charge tout ce qui menace sa tanière.",
  },
  {
    id: "chevalier-dechu", nom: "Chevalier déchu", emoji: "⚔️", type: "elite",
    pv: 30, def: 16, init: 10, attaque: 6,
    attaques: ["Lame maudite — 1d8+4 +1d6 chaotiques"],
    capacites: ["Armure lourde : réduction de 2 sur les DM physiques", "Serment brisé : +2 attaque contre les PJ marqués"],
    tags: ["humanoïde", "corrompu"],
    description: "Un chevalier qui a pactisé avec le chaos. Redoutable et discipliné.",
  },
  {
    id: "demon-mineur", nom: "Démon mineur", emoji: "👹", type: "elite",
    pv: 25, def: 14, init: 12, attaque: 5,
    attaques: ["Griffes ardentes — 2d6 (feu)"],
    capacites: ["Résistance au feu", "Vol : se déplace en ignorant le terrain", "Terreur : SAG diff. 13 ou Apeuré 1 tour"],
    tags: ["démon", "chaos"],
    description: "Serviteur créé par les Dieux du Chaos pour détruire l'Ordre.",
  },
  {
    id: "khazrak-brute", nom: "Brute Khazrak", emoji: "🛡️", type: "elite",
    pv: 32, def: 15, init: 9, attaque: 6,
    attaques: ["Masse runique — 2d6+4"],
    capacites: ["Peau de pierre : réduction de 3 sur les DM", "Brise-garde : ignore les boucliers"],
    tags: ["nain renégat"],
    description: "Nain sublimé par le pacte orc-gobelin. Mi-pierre, mi-fureur.",
  },

  // ---------- Boss ----------
  {
    id: "seigneur-orc", nom: "Seigneur de guerre orc", emoji: "👑", type: "boss",
    pv: 60, def: 15, init: 10, attaque: 7,
    attaques: ["Hache à deux mains — 2d8+4", "Coup tournoyant (L) — touche tous les ennemis adjacents (2d6)"],
    capacites: [
      "Cri de guerre (L, 1x/combat) : tous les alliés orcs gagnent +2 en attaque pendant 3 tours",
      "Inébranlable : avantage aux jets contre les effets de contrôle",
    ],
    tags: ["orc", "meneur"],
    description: "Chef de horde couronné par le sang versé. Là où il marche, la guerre suit.",
  },
  {
    id: "necromancien-liche", nom: "Nécromancien-liche", emoji: "☠️", type: "boss",
    pv: 70, def: 16, init: 11, attaque: 6,
    attaques: ["Rayon de mort — 3d6 (portée 20 m)", "Toucher flétrissant — 2d6 + draine 1d4 PV au lanceur"],
    capacites: [
      "Légion (L) : invoque 1d4 squelettes au début de son tour",
      "Phylactère : la première fois qu'il tombe à 0 PV, revient à 1d6×10 PV au tour suivant",
      "Aura de terreur : SAG diff. 14 à l'approche ou Apeuré",
    ],
    tags: ["mort-vivant", "lanceur", "corrompu"],
    description: "Magicien ayant creusé trop loin dans les savoirs interdits. La mort ne le retient plus.",
  },
  {
    id: "incarnation-traque", nom: "Incarnation de la Traque", emoji: "🌑", type: "boss",
    pv: 90, def: 17, init: 16, attaque: 8,
    attaques: ["Frappe silencieuse — 3d8 (avantage si la cible ne l'a pas repérée)"],
    capacites: [
      "Chasseresse invisible : invisible tant qu'elle n'a pas attaqué ce tour",
      "Marque de la proie : désigne une cible — +2d6 DM contre elle tout le combat",
      "Sans bruit : ne peut être entendue, ignore le terrain difficile",
    ],
    tags: ["conscience-émotion", "chaos", "unique"],
    description: "Conscience-émotion incarnée pour la première fois depuis des siècles. Chasse des villages entiers, en silence.",
  },
];
