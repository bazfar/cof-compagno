/* ============================================================
   COF-COMPAGNO — Raretés de loot.

   La rareté est INDÉPENDANTE de `enchantement` (bonus de forge
   existant, ex. "Épée longue +1"). Les deux s'additionnent au
   jet de dégâts mais restent deux champs séparés dans les
   données.

   4 paliers, chacun ajoutant +1 au bonus du précédent :
   - Commun      (gris  #9c9c9c) : bonus +0, aucun effet
   - Peu commun  (vert  #2f9e44) : bonus +1, aucun effet
   - Rare        (violet #8a4fd1): bonus +2, + un effet spécial
   - Légendaire  (doré  #a8843a) : bonus +3, + effet renforcé

   Application du bonus selon le type :
   - arme       -> bonusRarete s'ajoute aux dégâts EN PLUS de
                   l'enchantement existant (jamais fusionné)
   - armure     -> bonusRarete s'ajoute à valeurArmure
   - bouclier   -> bonusRarete s'ajoute à bonusDEF
   - accessoire -> le nombre du champ `effet` est augmenté (toujours),
                   EN PLUS d'une variante d'effet spécial si l'item en
                   propose (cf. ci-dessous) — les deux se cumulent, à la
                   différence d'arme/armure/bouclier où la variante
                   remplace l'effet générique par type.

   Effets spéciaux (rare/légendaire) : chaque arme/armure/bouclier/
   accessoire générique a 2 variantes possibles (cf. EFFETS_PAR_ITEM), au
   choix du MJ au moment de mettre l'objet en jeu — ex. une dague
   peut être tirée "vampirique" ou "corruptrice". Les 5 objets
   déjà nommés/enchantés du catalogue (épée longue +1, dague +2,
   arc court +1, arc d'Aelindra +1, hache naine +1) n'ont pas
   d'entrée ici : ils retombent sur l'effet générique par type
   (EFFETS_RARETE) plutôt que de cumuler une identité en plus de
   la leur. Les accessoires n'ont pas de repli générique (EFFETS_RARETE) :
   tous les accessoires du catalogue ont leurs deux variantes dédiées.

   Consommables : hors système (non concernés par la rareté).
   ============================================================ */

const RARETES = [
  { id: "commun",     nom: "Commun",     couleur: "#9c9c9c", bonus: 0 },
  { id: "peu_commun", nom: "Peu commun", couleur: "#2f9e44", bonus: 1 },
  { id: "rare",       nom: "Rare",       couleur: "#8a4fd1", bonus: 2 },
  { id: "legendaire", nom: "Légendaire", couleur: "#a8843a", bonus: 3 },
];

// Repli générique par type, utilisé seulement si l'item n'a pas
// d'entrée dans EFFETS_PAR_ITEM (objets déjà nommés/enchantés, ou
// tout futur ajout au catalogue non encore couvert ci-dessous).
const EFFETS_RARETE = {
  arme:     { rare: "Saignement : +1d4 dégâts pendant 2 tours", legendaire: "Saignement aggravé : +1d6 dégâts pendant 3 tours" },
  armure:   { rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact" },
  bouclier: { rare: "1 fois par combat : annule totalement une attaque de contact", legendaire: "2 fois par combat : annule totalement une attaque de contact" },
};

// Effets spéciaux propres à chaque item générique, 2 variantes chacun.
// Champs : id (interne), nom (suffixe affiché), rare / legendaire (texte).
const EFFETS_PAR_ITEM = {
  // ── Armes ──────────────────────────────────────────────────
  dague: [
    { id: "vampirique", nom: "vampirique", rare: "Soigne 1d4 PV au porteur à chaque coup porté", legendaire: "Soigne 1d6 PV et régénère 1 PV par tour pendant 3 tours" },
    { id: "corruptrice", nom: "corruptrice", rare: "+1d8 dégâts, mais 1 chance sur 2 de gagner 1 point de Corruption", legendaire: "+1d10 dégâts, mais 1 chance sur 2 de gagner 2 points de Corruption" },
  ],
  epee_courte: [
    { id: "precise", nom: "précise", rare: "+2 au jet d'attaque contre une cible déjà blessée", legendaire: "+4 au jet d'attaque contre une cible déjà blessée, critique sur 19-20" },
    { id: "vive", nom: "vive", rare: "Permet une attaque supplémentaire à -4 une fois par tour", legendaire: "Permet une attaque supplémentaire sans malus une fois par tour" },
  ],
  epee_longue: [
    { id: "tranchante", nom: "tranchante", rare: "Saignement : +1d4 dégâts pendant 2 tours", legendaire: "Saignement aggravé : +1d6 dégâts pendant 3 tours" },
    { id: "brise_garde", nom: "brise-garde", rare: "Réduit la DEF de la cible de 1 pendant 2 tours", legendaire: "Réduit la DEF de la cible de 2 pendant 3 tours" },
  ],
  hache_guerre: [
    { id: "sauvage", nom: "sauvage", rare: "+1d6 dégâts contre une cible à moins de la moitié de ses PV max", legendaire: "+2d6 dégâts contre une cible à moins de la moitié de ses PV max" },
    { id: "broyeuse", nom: "broyeuse", rare: "Ignore 2 points de valeurArmure de la cible", legendaire: "Ignore 4 points de valeurArmure de la cible" },
  ],
  arc_court: [
    { id: "precise", nom: "précis", rare: "Ignore les bonus de couverture partielle", legendaire: "Ignore toute couverture, même totale, une fois par combat" },
    { id: "empoisonnee", nom: "empoisonné", rare: "1 chance sur 2 d'infliger 1d4 dégâts de poison pendant 2 tours", legendaire: "1 chance sur 2 d'infliger 1d6 dégâts de poison pendant 3 tours" },
  ],
  arc_long: [
    { id: "perforante", nom: "perforant", rare: "Ignore 2 points de valeurArmure de la cible", legendaire: "Ignore 4 points de valeurArmure de la cible" },
    { id: "enflammee", nom: "enflammé", rare: "1 chance sur 2 d'infliger 1d4 dégâts de feu supplémentaires", legendaire: "1 chance sur 2 d'infliger 1d6 dégâts de feu supplémentaires" },
  ],
  lance: [
    { id: "empaleuse", nom: "empaleuse", rare: "Immobilise la cible 1 tour sur un coup critique", legendaire: "Immobilise la cible 1 tour sur tout coup touché" },
    { id: "repousse", nom: "repousse", rare: "Repousse la cible d'1 case après un coup réussi", legendaire: "Repousse la cible de 2 cases et lui inflige 1d4 dégâts de chute potentiels" },
  ],
  masse: [
    { id: "etourdissante", nom: "étourdissante", rare: "1 chance sur 2 d'étourdir la cible 1 tour", legendaire: "1 chance sur 2 d'étourdir la cible 2 tours" },
    { id: "sacree", nom: "sacrée", rare: "+1d6 dégâts contre les créatures du Chaos ou morts-vivants", legendaire: "+2d6 dégâts contre les créatures du Chaos ou morts-vivants" },
  ],
  marteau_guerre: [
    { id: "sismique", nom: "sismique", rare: "Sur coup critique, renverse la cible (elle perd son tour)", legendaire: "Renverse la cible sur tout coup touché" },
    { id: "briseuse", nom: "briseuse", rare: "Ignore 2 points de bonusDEF d'un bouclier adverse", legendaire: "Ignore totalement le bonusDEF d'un bouclier adverse" },
  ],
  rapiere: [
    { id: "gracieuse", nom: "gracieuse", rare: "+1 initiative tant que l'arme est équipée", legendaire: "+2 initiative, agit en premier au premier tour de tout combat" },
    { id: "perfide", nom: "perfide", rare: "Critique sur 19-20", legendaire: "Critique sur 18-20" },
  ],
  arbalete: [
    { id: "perforante", nom: "perforante", rare: "Ignore 2 points de valeurArmure de la cible", legendaire: "Ignore 4 points de valeurArmure de la cible" },
    { id: "a_repetition", nom: "à répétition", rare: "Peut tirer deux fois par tour à -4 aux deux jets", legendaire: "Peut tirer deux fois par tour sans malus" },
  ],
  cimeterre: [
    { id: "tourbillonnante", nom: "tourbillonnante", rare: "Une fois par tour, touche un second adversaire adjacent à demi-dégâts", legendaire: "Touche un second adversaire adjacent à dégâts complets" },
    { id: "ensanglantee", nom: "ensanglantée", rare: "Saignement : +1d4 dégâts pendant 2 tours", legendaire: "Saignement aggravé : +1d6 dégâts pendant 3 tours" },
  ],
  hallebarde: [
    { id: "fauchante", nom: "fauchante", rare: "Touche tous les adversaires adjacents en ligne à demi-dégâts", legendaire: "Touche tous les adversaires adjacents en ligne à dégâts complets" },
    { id: "crochue", nom: "crochue", rare: "Peut désarmer la cible sur un coup critique", legendaire: "Peut désarmer la cible sur tout coup touché" },
  ],
  fleau_armes: [
    { id: "imprevisible", nom: "imprévisible", rare: "Ignore le bonusDEF des boucliers", legendaire: "Ignore le bonusDEF des boucliers et -2 DEF cible pendant 1 tour" },
    { id: "brutale", nom: "brutale", rare: "1 chance sur 2 d'étourdir la cible 1 tour", legendaire: "1 chance sur 2 d'étourdir la cible 2 tours" },
  ],
  francisque: [
    { id: "tournoyante", nom: "tournoyante", rare: "Peut être relancée pour toucher une cible à distance courte, 1 fois par combat", legendaire: "Peut être relancée sans limite, revient dans la main du porteur" },
    { id: "feroce", nom: "féroce", rare: "+1d4 dégâts contre une cible à moins de la moitié de ses PV max", legendaire: "+1d8 dégâts contre une cible à moins de la moitié de ses PV max" },
  ],
  poignards_jumeaux: [
    { id: "duelliste", nom: "de duelliste", rare: "Deuxième attaque à -4 dans le même tour", legendaire: "Deuxième attaque sans malus dans le même tour" },
    { id: "toxique", nom: "toxique", rare: "1 chance sur 2 d'infliger 1d4 dégâts de poison pendant 2 tours", legendaire: "1 chance sur 2 d'infliger 1d6 dégâts de poison pendant 3 tours" },
  ],
  pique: [
    { id: "ancree", nom: "ancrée", rare: "+2 à l'attaque contre une cible qui charge", legendaire: "+4 à l'attaque et dégâts doublés contre une cible qui charge" },
    { id: "transpercante", nom: "transperçante", rare: "Touche deux cibles alignées à demi-dégâts", legendaire: "Touche deux cibles alignées à dégâts complets" },
  ],
  epee_batarde: [
    { id: "polyvalente", nom: "polyvalente", rare: "+1 dégât si maniée à deux mains ce tour", legendaire: "+2 dégâts et +1 DEF si maniée à deux mains ce tour" },
    { id: "implacable", nom: "implacable", rare: "Ignore 2 points de valeurArmure de la cible", legendaire: "Ignore 4 points de valeurArmure de la cible" },
  ],
  arbalete_lourde: [
    { id: "devastatrice", nom: "dévastatrice", rare: "+1d6 dégâts si la cible n'a pas encore agi ce tour", legendaire: "+2d6 dégâts si la cible n'a pas encore agi ce tour" },
    { id: "perforante", nom: "perforante", rare: "Ignore 3 points de valeurArmure de la cible", legendaire: "Ignore 6 points de valeurArmure de la cible" },
  ],
  // 3 variantes plutôt que 2 (rien n'empêche d'en avoir plus, cf. en-tête de fichier).
  grimoire: [
    { id: "embrasement", nom: "d'embrasement",
      rare: "+1 dégâts au jet de dégâts, et applique l'état Brûlure (1d4 dégâts en début de tour) au toucher",
      legendaire: "+1 dégâts au jet de dégâts, et applique l'état Brûlure aggravée (1d6 dégâts en début de tour, 3 tours minimum) au toucher" },
    { id: "effrayante", nom: "effrayante",
      rare: "+1 dégâts au jet de dégâts, 1 chance sur 4 d'infliger l'état Effrayée (Fuite) à la cible pendant 1d4 tours",
      legendaire: "+1 dégâts au jet de dégâts, 1 chance sur 2 d'infliger l'état Effrayée (Fuite) à la cible pendant 1d4 tours" },
    { id: "affaiblissante", nom: "affaiblissante",
      rare: "+1 dégâts au jet de dégâts, 1 chance sur 4 de réduire la DEF de la cible de 1 pendant 2 tours",
      legendaire: "+1 dégâts au jet de dégâts, 1 chance sur 2 de réduire la DEF de la cible de 1 pendant 3 tours" },
  ],

  // ── Armures ────────────────────────────────────────────────
  armure_cuir: [
    { id: "souple", nom: "souple", rare: "+1 en DEX tant que l'armure est équipée", legendaire: "+2 en DEX tant que l'armure est équipée" },
    { id: "silencieuse", nom: "silencieuse", rare: "+1 en discrétion", legendaire: "+2 en discrétion, aucun malus en terrain difficile" },
  ],
  armure_cloute: [
    { id: "epineuse", nom: "épineuse", rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact" },
    { id: "robuste", nom: "robuste", rare: "Réduit de moitié les dégâts de chute", legendaire: "Annule les dégâts de chute" },
  ],
  cotte_mailles: [
    { id: "renforcee", nom: "renforcée", rare: "Réduit d'1 les dégâts physiques après application de valeurArmure", legendaire: "Réduit de 2 les dégâts physiques après application de valeurArmure" },
    { id: "cliquetante", nom: "intimidante", rare: "+1 en intimidation", legendaire: "+2 en intimidation, effraie les créatures de faible dangerosité au 1er round" },
  ],
  demi_plaques: [
    { id: "imposante", nom: "imposante", rare: "+1 DEF contre les attaques à distance", legendaire: "+2 DEF contre les attaques à distance" },
    { id: "ancree", nom: "ancrée", rare: "Résiste automatiquement à un effet de repoussement par combat", legendaire: "Résiste automatiquement à tout effet de repoussement" },
  ],
  plaques_comp: [
    { id: "impenetrable", nom: "impénétrable", rare: "Réduit de 1 tout dégât physique après application de valeurArmure", legendaire: "Réduit de 2 tout dégât physique après application de valeurArmure" },
    { id: "ecrasante", nom: "écrasante", rare: "+1 en FOR tant que l'armure est équipée", legendaire: "+2 en FOR tant que l'armure est équipée" },
  ],
  armure_ombre: [
    { id: "furtive", nom: "furtive", rare: "Silhouette indétectable dans l'obscurité totale", legendaire: "Idem, et déplacement totalement silencieux" },
    { id: "drainante", nom: "drainante", rare: "Soigne 1 PV au porteur quand une attaque de contact le manque", legendaire: "Soigne 2 PV au porteur quand une attaque de contact le manque" },
  ],
  cotte_runique: [
    { id: "protectrice", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance contre la magie" },
    { id: "reflechissante", nom: "réfléchissante", rare: "1 fois par combat, renvoie 1d4 dégâts magiques subis à l'attaquant", legendaire: "1 fois par combat, renvoie 1d8 dégâts magiques subis à l'attaquant" },
  ],
  armure_ecailles: [
    { id: "glissante", nom: "glissante", rare: "+1 DEF contre les attaques d'opportunité", legendaire: "+2 DEF contre les attaques d'opportunité, jamais pris au dépourvu" },
    { id: "resistante", nom: "résistante", rare: "Résistance 1 aux dégâts de feu", legendaire: "Résistance 2 aux dégâts de feu" },
  ],
  brigandine: [
    { id: "cachee", nom: "dissimulée", rare: "Peut être portée sous des vêtements civils sans être détectée", legendaire: "Idem, + 1 en discrétion" },
    { id: "fiable", nom: "fiable", rare: "Ignore le premier coup critique subi par combat (dégâts normaux à la place)", legendaire: "Ignore les deux premiers coups critiques subis par combat" },
  ],
  robe_mage: [
    { id: "focalisante", nom: "focalisante", rare: "+1 en INT tant que la robe est équipée", legendaire: "+2 en INT tant que la robe est équipée" },
    { id: "tissee_de_seve", nom: "tissée de Sève", rare: "Régénère 1 PV par tour hors combat", legendaire: "Régénère 1 PV par tour, même en combat" },
  ],
  manteau_voyageur: [
    { id: "endurant", nom: "endurant", rare: "+1 case de déplacement", legendaire: "+2 cases de déplacement" },
    { id: "impermeable", nom: "imperméable", rare: "Immunité aux effets météorologiques mineurs (pluie, froid léger)", legendaire: "Immunité totale aux effets climatiques, y compris magiques" },
  ],
  armure_garde_solvarn: [
    { id: "disciplinee", nom: "disciplinée", rare: "+1 aux jets de moral en groupe", legendaire: "+2 aux jets de moral, immunise contre la Terreur en groupe" },
    { id: "standard", nom: "d'unité", rare: "+1 DEF quand porté aux côtés d'un autre porteur de la même armure", legendaire: "+2 DEF dans les mêmes conditions" },
  ],
  armure_druidique: [
    { id: "vivante", nom: "vivante", rare: "Se répare de 1 point de valeurArmure perdu par jour de repos", legendaire: "Se répare intégralement après une nuit de repos" },
    { id: "camouflee", nom: "camouflée", rare: "+1 en discrétion en milieu naturel", legendaire: "+2 en discrétion en milieu naturel, indétectable à l'arrêt" },
  ],

  // ── Boucliers ──────────────────────────────────────────────
  rondache: [
    { id: "vive", nom: "vive", rare: "+1 initiative tant que le bouclier est équipé", legendaire: "+2 initiative tant que le bouclier est équipé" },
    { id: "parade", nom: "de parade", rare: "1 fois par combat, annule totalement une attaque de contact", legendaire: "2 fois par combat, annule totalement une attaque de contact" },
  ],
  bouclier_acier: [
    { id: "standard", nom: "renforcé", rare: "+1 DEF supplémentaire contre les attaques à distance", legendaire: "+2 DEF supplémentaire contre les attaques à distance" },
    { id: "renvoyeur", nom: "renvoyeur", rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact" },
  ],
  targe_elfique: [
    { id: "protectrice", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance contre la magie" },
    { id: "legere", nom: "légère", rare: "N'inflige aucun malus DEX même combinée à une armure lourde", legendaire: "Idem, + 1 initiative" },
  ],
  bouclier_tour: [
    { id: "muraille", nom: "muraille", rare: "1 fois par combat, protège aussi un allié adjacent d'une attaque", legendaire: "2 fois par combat, protège un allié adjacent d'une attaque" },
    { id: "inebranlable", nom: "inébranlable", rare: "Résiste automatiquement à un effet de repoussement par combat", legendaire: "Résiste automatiquement à tout effet de repoussement" },
  ],
  bouclier_rond_nain: [
    { id: "runique", nom: "runique", rare: "1 fois par combat, renvoie 1d4 dégâts subis à l'attaquant", legendaire: "1 fois par combat, renvoie 1d8 dégâts subis à l'attaquant" },
    { id: "massif", nom: "massif", rare: "Ignore 1 point de dégâts physiques après application du bonusDEF", legendaire: "Ignore 2 points de dégâts physiques après application du bonusDEF" },
  ],
  bouclier_seve: [
    { id: "regenerant", nom: "régénérant", rare: "Soigne 1 PV au porteur à chaque tour où le bouclier bloque une attaque", legendaire: "Soigne 2 PV au porteur dans les mêmes conditions" },
    { id: "vivant", nom: "vivant", rare: "Se répare de 1 point de bonusDEF perdu par jour de repos", legendaire: "Se répare intégralement après une nuit de repos" },
  ],

  // ── Accessoires ────────────────────────────────────────────
  anneau_protection: [
    { id: "gardien", nom: "du gardien", rare: "+1 DEF ; annule automatiquement la surprise au premier round de combat", legendaire: "+2 DEF ; annule la surprise et agit en premier au premier round" },
    { id: "absorbant", nom: "absorbant", rare: "+1 DEF ; 1 fois par combat, réduit de moitié les dégâts d'une attaque subie", legendaire: "+2 DEF ; 2 fois par combat, réduit de moitié les dégâts d'une attaque subie" },
  ],
  bracelets_defense: [
    { id: "impassibles", nom: "impassibles", rare: "+2 DEF (sans armure/bouclier) ; +1 aux jets de résistance", legendaire: "+3 DEF (sans armure/bouclier) ; +2 aux jets de résistance" },
    { id: "reactifs", nom: "réactifs", rare: "+2 DEF (sans armure/bouclier) ; 1 fois par combat, esquive totalement une attaque de contact", legendaire: "+3 DEF (sans armure/bouclier) ; 2 fois par combat, esquive totalement une attaque de contact" },
  ],
  bottes_vitesse: [
    { id: "fulgurantes", nom: "fulgurantes", rare: "+1 case de déplacement ; 1 fois par combat, double le déplacement pour ce tour", legendaire: "+2 cases de déplacement ; 2 fois par combat, double le déplacement" },
    { id: "esquivantes", nom: "esquivantes", rare: "+1 case de déplacement ; +1 DEF contre les attaques d'opportunité", legendaire: "+2 cases de déplacement ; +2 DEF contre les attaques d'opportunité, jamais pris au dépourvu" },
  ],
  gants_voleur: [
    { id: "silencieux", nom: "silencieux", rare: "+1 Discrétion/Escamotage ; ouvre les serrures simples sans jet", legendaire: "+2 Discrétion/Escamotage ; ouvre les serrures complexes sans jet, désamorce les pièges simples automatiquement" },
    { id: "prestes", nom: "prestes", rare: "+1 Discrétion/Escamotage ; +1 initiative", legendaire: "+2 Discrétion/Escamotage ; +2 initiative, agit en premier au premier tour" },
  ],
  anneau_resistance: [
    { id: "renforce", nom: "renforcé", rare: "Résistance 2 au type de dégâts choisi", legendaire: "Résistance 3 au type choisi, immunité aux effets secondaires mineurs de ce type" },
    { id: "polyvalent", nom: "polyvalent", rare: "Résistance 1 à deux types de dégâts au choix", legendaire: "Résistance 2 à deux types de dégâts au choix" },
  ],
  pierre_chance: [
    { id: "insistante", nom: "insistante", rare: "2 fois par jour, relance un jet raté", legendaire: "3 fois par jour, relance un jet raté (garde le meilleur résultat)" },
    { id: "protectrice", nom: "protectrice", rare: "1 fois par jour, relance un jet raté ; 1 fois par jour, transforme un coup critique subi en coup normal", legendaire: "2 fois par jour, relance un jet raté ; 1 fois par combat, transforme un coup critique subi en coup normal" },
  ],
  amulette_sante: [
    { id: "vivifiante", nom: "vivifiante", rare: "+1d6 PV max ; régénère 1 PV par tour hors combat", legendaire: "+2d6 PV max ; régénère 1 PV par tour même en combat" },
    { id: "purifiante", nom: "purifiante", rare: "+1d4 PV max ; immunité aux maladies mineures", legendaire: "+1d6 PV max ; immunité totale aux maladies et poisons faibles" },
  ],
  collier_clarte: [
    { id: "impenetrable", nom: "impénétrable", rare: "Immunisé à la lecture de pensées ; +1 aux jets de résistance mentale", legendaire: "Immunisé à la lecture de pensées ; +2 aux jets de résistance mentale, immunité à la Terreur" },
    { id: "voile", nom: "voilé", rare: "Immunisé à la lecture de pensées ; invisible à la divination à courte portée", legendaire: "Immunisé à la lecture de pensées ; invisible à toute divination" },
  ],
  ceinturon_colosse: [
    { id: "ecrasant", nom: "écrasant", rare: "+2 FOR ; +1d4 dégâts avec armes de contact", legendaire: "+3 FOR ; +1d6 dégâts avec armes de contact" },
    { id: "inebranlable", nom: "inébranlable", rare: "+2 FOR ; ne peut être renversé ni repoussé", legendaire: "+3 FOR ; idem, + immunité à l'Étourdissement" },
  ],
  cape_brume: [
    { id: "insaisissable", nom: "insaisissable", rare: "+1 DEF contre la première attaque ; 1 fois par combat, une attaque manque automatiquement sa cible", legendaire: "+2 DEF contre la première attaque ; 2 fois par combat, une attaque manque automatiquement sa cible" },
    { id: "evanescente", nom: "évanescente", rare: "+1 DEF contre la première attaque ; 1 fois par combat, disparaît de la vue 1 tour (Discrétion totale)", legendaire: "+2 DEF contre la première attaque ; 2 fois par combat, disparaît de la vue 1 tour" },
  ],

  // ── Armes (suite) ──────────────────────────────────────────
  trident: [
    { id: "des_profondeurs", nom: "des profondeurs", rare: "+1d4 dégâts contre les créatures aquatiques ou en zone immergée", legendaire: "+1d8 dégâts dans les mêmes conditions, ignore les malus de combat en zone immergée" },
    { id: "immobilisante", nom: "immobilisante", rare: "1 chance sur 2 d'immobiliser la cible 1 tour sur un coup critique", legendaire: "Immobilise la cible 1 tour sur tout coup touché" },
  ],
  fouet: [
    { id: "desarmant", nom: "désarmant", rare: "1 chance sur 2 de désarmer la cible sur un coup touché", legendaire: "Désarme automatiquement la cible sur tout coup touché" },
    { id: "entravant", nom: "entravant", rare: "1 chance sur 2 d'immobiliser la cible 1 tour", legendaire: "Immobilise la cible 1 tour sur tout coup touché, 2 tours sur critique" },
  ],
  javelot: [
    { id: "percant", nom: "perçant", rare: "Ignore 2 points de valeurArmure de la cible", legendaire: "Ignore 4 points de valeurArmure de la cible" },
    { id: "revenant", nom: "revenant", rare: "Revient dans la main du porteur après un lancer réussi, 1 fois par combat", legendaire: "Revient systématiquement dans la main du porteur après chaque lancer" },
  ],
  fronde: [
    { id: "precise", nom: "précise", rare: "+2 au jet d'attaque à longue portée", legendaire: "+4 au jet d'attaque à longue portée, critique sur 19-20" },
    { id: "etourdissante", nom: "étourdissante", rare: "1 chance sur 2 d'étourdir la cible 1 tour sur un coup critique", legendaire: "Étourdit la cible 1 tour sur tout coup touché" },
  ],
  glaive_guerre: [
    { id: "decapitant", nom: "décapitant", rare: "Critique sur 19-20 contre les cibles sans casque ni armure lourde", legendaire: "Critique sur 18-20 dans les mêmes conditions, dégâts doublés sur critique" },
    { id: "imperial", nom: "impérial", rare: "+1 en intimidation tant que l'arme est visible", legendaire: "+2 en intimidation, effraie les créatures de faible dangerosité au 1er round" },
  ],

  // ── Armures (suite) ────────────────────────────────────────
  cotte_mithril: [
    { id: "legere_air", nom: "légère comme l'air", rare: "+1 case de déplacement", legendaire: "+2 cases de déplacement" },
    { id: "protectrice_mithril", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance, absorbe automatiquement 1 dégât magique par tour" },
  ],
  armure_ossements: [
    { id: "macabre", nom: "macabre", rare: "+1 en intimidation, effraie les créatures vivantes de faible dangerosité", legendaire: "+2 en intimidation, immunise contre la Terreur" },
    { id: "drainante_os", nom: "drainante", rare: "Soigne 1 PV au porteur à chaque ennemi tué à moins de 2 cases", legendaire: "Soigne 2 PV au porteur dans les mêmes conditions, + 1d4 PV temporaires" },
  ],
  armure_guerre_orque: [
    { id: "brutale", nom: "brutale", rare: "+1d4 dégâts avec armes de contact tant que l'armure est équipée", legendaire: "+1d6 dégâts avec armes de contact tant que l'armure est équipée" },
    { id: "increvable", nom: "increvable", rare: "Ignore 1 point de dégâts physiques après application de valeurArmure", legendaire: "Ignore 2 points de dégâts physiques après application de valeurArmure" },
  ],
  gants_poing: [
    { id: "percutants", nom: "percutants", rare: "+1 dégâts à mains nues ; ignore 1 point de valeurArmure de la cible", legendaire: "+2 dégâts à mains nues ; ignore 2 points de valeurArmure de la cible" },
    { id: "foudroyants", nom: "foudroyants", rare: "+1 dégâts à mains nues ; 1 chance sur 2 d'étourdir la cible 1 tour sur un coup critique", legendaire: "+2 dégâts à mains nues ; étourdit systématiquement la cible 1 tour sur tout coup critique" },
  ],

  // ── Boucliers (suite) ──────────────────────────────────────
  bouclier_guet: [
    { id: "vigilant", nom: "vigilant", rare: "Ne peut jamais être surpris (garde une DEF normale même surpris)", legendaire: "Idem, + agit en premier au premier round si le groupe est surpris" },
    { id: "imposant", nom: "imposant", rare: "+1 en intimidation", legendaire: "+2 en intimidation, +1 DEF aux alliés adjacents" },
  ],
  bouclier_miroir: [
    { id: "reflechissant", nom: "réfléchissant", rare: "1 fois par combat, renvoie un sort ciblé à son lanceur", legendaire: "2 fois par combat, renvoie un sort ciblé à son lanceur" },
    { id: "eblouissant", nom: "éblouissant", rare: "1 fois par combat, aveugle un attaquant au contact pendant 1 tour", legendaire: "2 fois par combat, aveugle un attaquant au contact pendant 1 tour" },
  ],
};

const Raretes = (() => {
  "use strict";

  function trouver(rareteId) {
    return RARETES.find((r) => r.id === rareteId) || RARETES[0];
  }

  // Variantes d'effet disponibles pour un item donné (tableau vide si aucune
  // définie -> l'appelant doit alors se rabattre sur l'effet générique).
  function variantesDisponibles(itemId) {
    return EFFETS_PAR_ITEM[itemId] || [];
  }

  function _effetGenerique(type, rareteId) {
    const table = EFFETS_RARETE[type];
    return (table && table[rareteId]) || null;
  }

  function _renforcerEffetAccessoire(effet, bonus) {
    if (!effet || !bonus) return effet;
    const mPlus = effet.match(/^\+(\d+)(.*)$/);
    if (mPlus) return `+${parseInt(mPlus[1], 10) + bonus}${mPlus[2]}`;
    const mCases = effet.match(/(\d+)(\s*cases?)/i);
    if (mCases) {
      const nouveau = parseInt(mCases[1], 10) + bonus * 2;
      return effet.replace(mCases[0], `${nouveau}${mCases[2]}`);
    }
    return effet;
  }

  /**
   * Renvoie une COPIE de `item` ajustée pour la rareté `rareteId`, avec la
   * variante d'effet `varianteId` si l'item en propose (cf. variantesDisponibles).
   * Ne modifie jamais `enchantement`.
   */
  function appliquer(item, rareteId, varianteId) {
    const rarete = trouver(rareteId);
    const bonus = rarete.bonus;
    const auMoinsRare = rarete.id === "rare" || rarete.id === "legendaire";

    const clone = Object.assign({}, item, {
      rarete: rarete.id,
      rareteNom: rarete.nom,
      rareteCouleur: rarete.couleur,
      bonusRarete: bonus,
      effetRarete: null,
      varianteNom: null,
    });

    const variantes = variantesDisponibles(item.id);
    const variante = variantes.length
      ? (variantes.find((v) => v.id === varianteId) || variantes[0])
      : null;

    switch (item.type) {
      case "arme":
        clone.bonusDegatsTotal = (item.enchantement || 0) + bonus;
        if (auMoinsRare) {
          if (item.degatsAuMoinsRare) clone.degats = item.degatsAuMoinsRare;
          if (variante) { clone.effetRarete = variante[rarete.id]; clone.varianteNom = variante.nom; }
          else clone.effetRarete = _effetGenerique("arme", rarete.id);
        }
        break;
      case "armure":
        clone.valeurArmure = (item.valeurArmure || 0) + bonus;
        if (auMoinsRare) {
          if (variante) { clone.effetRarete = variante[rarete.id]; clone.varianteNom = variante.nom; }
          else clone.effetRarete = _effetGenerique("armure", rarete.id);
        }
        break;
      case "bouclier":
        clone.bonusDEF = (item.bonusDEF || 0) + bonus;
        if (auMoinsRare) {
          if (variante) { clone.effetRarete = variante[rarete.id]; clone.varianteNom = variante.nom; }
          else clone.effetRarete = _effetGenerique("bouclier", rarete.id);
        }
        break;
      case "accessoire":
        clone.effet = _renforcerEffetAccessoire(item.effet, bonus);
        if (auMoinsRare) {
          if (variante) { clone.effetRarete = variante[rarete.id]; clone.varianteNom = variante.nom; }
        }
        break;
      default:
        break; // consommable ou type inconnu
    }

    if (clone.varianteNom) clone.nom = `${item.nom} ${clone.varianteNom}`;
    return clone;
  }

  return { LISTE: RARETES, EFFETS: EFFETS_RARETE, EFFETS_PAR_ITEM, trouver, appliquer, variantesDisponibles };
})();

if (typeof window !== "undefined") {
  window.RARETES = RARETES;
  window.Raretes = Raretes;
}
