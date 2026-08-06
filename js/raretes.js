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
   - armure     -> bonusRarete s'ajoute à valeurCA ET reductionDegats (les
                   deux stats, depuis l'éclatement de l'ancien valeurArmure)
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
  arme:     { rare: "Saignement : +1d4 dégâts pendant 2 tours", legendaire: "Saignement aggravé : +1d6 dégâts pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "dot", formule: "1d4", duree: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "dot", formule: "1d6", duree: 3 }] },
      } },
  armure:   { rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact",
      mecanique: {
        rare: { evenement: "subitContact", effets: [{ type: "degats", formule: "1", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", effets: [{ type: "degats", formule: "2", cible: "attaquant" }] },
      } },
  bouclier: { rare: "1 fois par combat : annule totalement une attaque de contact", legendaire: "2 fois par combat : annule totalement une attaque de contact" },
};

// Effets spéciaux propres à chaque item générique, 2 variantes chacun.
// Champs : id (interne), nom (suffixe affiché), rare / legendaire (texte).
const EFFETS_PAR_ITEM = {
  // ── Armes ──────────────────────────────────────────────────
  dague: [
    { id: "vampirique", nom: "vampirique", rare: "Soigne 1d4 PV au porteur à chaque coup porté", legendaire: "Soigne 1d6 PV et régénère 1 PV par tour pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "soin", formule: "1d4" }] },
        legendaire: { evenement: "touche", effets: [{ type: "soin", formule: "1d6" }, { type: "special", note: "Régénère aussi 1 PV au porteur au début de chacun de ses 3 prochains tours — pas de dot positif dans le vocabulaire actuel, à suivre manuellement." }] },
      } },
    { id: "corruptrice", nom: "corruptrice", rare: "+1d8 dégâts, mais 1 chance sur 2 de gagner 1 point de Corruption", legendaire: "+1d10 dégâts, mais 1 chance sur 2 de gagner 2 points de Corruption",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "degats", formule: "1d8" }, { type: "special", note: "1 chance sur 2 de gagner 1 point de Corruption pour le porteur — à arbitrer/lancer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "degats", formule: "1d10" }, { type: "special", note: "1 chance sur 2 de gagner 2 points de Corruption pour le porteur — à arbitrer/lancer manuellement." }] },
      } },
  ],
  epee_courte: [
    { id: "precise", nom: "précise", rare: "+2 au jet d'attaque contre une cible déjà blessée", legendaire: "+4 au jet d'attaque contre une cible déjà blessée, critique sur 19-20",
      mecanique: {
        rare: { bonusAttaqueConditionnel: { condition: "cibleBlessee", valeur: 2 } },
        legendaire: { bonusAttaqueConditionnel: { condition: "cibleBlessee", valeur: 4 }, evenement: "touche", effets: [{ type: "critique", seuil: 19 }] },
      } },
    { id: "vive", nom: "vive", rare: "Permet une attaque supplémentaire à -4 une fois par tour", legendaire: "Permet une attaque supplémentaire sans malus une fois par tour" },
  ],
  epee_longue: [
    { id: "tranchante", nom: "tranchante", rare: "Saignement : +1d4 dégâts pendant 2 tours", legendaire: "Saignement aggravé : +1d6 dégâts pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "dot", formule: "1d4", duree: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "dot", formule: "1d6", duree: 3 }] },
      } },
    { id: "brise_garde", nom: "brise-garde", rare: "Réduit la DEF de la cible de 1 pendant 2 tours", legendaire: "Réduit la DEF de la cible de 2 pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "bonus", cible: "DEF", valeur: -1, duree: "2" }] },
        legendaire: { evenement: "touche", effets: [{ type: "bonus", cible: "DEF", valeur: -2, duree: "3" }] },
      } },
  ],
  hache_guerre: [
    { id: "sauvage", nom: "sauvage", rare: "+1d6 dégâts contre une cible à moins de la moitié de ses PV max", legendaire: "+2d6 dégâts contre une cible à moins de la moitié de ses PV max",
      mecanique: {
        rare: { evenement: "touche", condition: "cibleSousMoitie", effets: [{ type: "degats", formule: "1d6" }] },
        legendaire: { evenement: "touche", condition: "cibleSousMoitie", effets: [{ type: "degats", formule: "2d6" }] },
      } },
    { id: "broyeuse", nom: "broyeuse", rare: "Ignore 2 points de reductionDegats de la cible", legendaire: "Ignore 4 points de reductionDegats de la cible",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 4 }] },
      } },
  ],
  arc_court: [
    { id: "precise", nom: "précis", rare: "Ignore les bonus de couverture partielle", legendaire: "Ignore toute couverture, même totale, une fois par combat",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Ignore les bonus de couverture partielle — pas de système de couverture automatisé, à arbitrer manuellement." }] },
      } },
    { id: "empoisonnee", nom: "empoisonné", rare: "1 chance sur 2 d'infliger 1d4 dégâts de poison pendant 2 tours", legendaire: "1 chance sur 2 d'infliger 1d6 dégâts de poison pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "dot", formule: "1d4", duree: 2, probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "dot", formule: "1d6", duree: 3, probabilite: 0.5 }] },
      } },
  ],
  arc_long: [
    { id: "perforante", nom: "perforant", rare: "Ignore 2 points de reductionDegats de la cible", legendaire: "Ignore 4 points de reductionDegats de la cible",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 4 }] },
      } },
    { id: "enflammee", nom: "enflammé", rare: "1 chance sur 2 d'infliger 1d4 dégâts de feu supplémentaires", legendaire: "1 chance sur 2 d'infliger 1d6 dégâts de feu supplémentaires",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "degats", formule: "1d4", elementaire: "feu", probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "degats", formule: "1d6", elementaire: "feu", probabilite: 0.5 }] },
      } },
  ],
  lance: [
    { id: "empaleuse", nom: "empaleuse", rare: "Immobilise la cible 1 tour sur un coup critique", legendaire: "Immobilise la cible 1 tour sur tout coup touché",
      mecanique: {
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "immobilisee", duree: "1" }] },
      } },
    { id: "repousse", nom: "repousse", rare: "Repousse la cible d'1 case après un coup réussi", legendaire: "Repousse la cible de 2 cases et lui inflige 1d4 dégâts de chute potentiels",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Repousse la cible d'1 case après un coup réussi — pas de mécanique de déplacement forcé automatisée, à positionner manuellement sur la battlemap." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Repousse la cible de 2 cases (positionnement manuel) et lui inflige potentiellement 1d4 dégâts de chute si le terrain s'y prête — à l'appréciation du MJ." }] },
      } },
  ],
  masse: [
    { id: "etourdissante", nom: "étourdissante", rare: "1 chance sur 2 d'étourdir la cible 1 tour", legendaire: "1 chance sur 2 d'étourdir la cible 2 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "etat", id: "etourdie", duree: "1", probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "etourdie", duree: "2", probabilite: 0.5 }] },
      } },
    { id: "sacree", nom: "sacrée", rare: "+1d6 dégâts contre les créatures du Chaos ou morts-vivants", legendaire: "+2d6 dégâts contre les créatures du Chaos ou morts-vivants",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "+1d6 dégâts contre les créatures du Chaos ou morts-vivants — condition non automatisée (phase suivante), à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "+2d6 dégâts contre les créatures du Chaos ou morts-vivants — condition non automatisée (phase suivante), à appliquer manuellement." }] },
      } },
  ],
  marteau_guerre: [
    { id: "sismique", nom: "sismique", rare: "Sur coup critique, renverse la cible (elle perd son tour)", legendaire: "Renverse la cible sur tout coup touché",
      mecanique: {
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "renversee", duree: "1" }] },
      } },
    { id: "briseuse", nom: "briseuse", rare: "Ignore 2 points de bonusDEF d'un bouclier adverse", legendaire: "Ignore totalement le bonusDEF d'un bouclier adverse",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Ignore 2 points de bonusDEF d'un bouclier adverse — pas de mécanique bonusDEF-cible dans ce vocabulaire (ignoreReduction ne porte que sur reductionDegats), à appliquer manuellement au jet d'attaque." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Ignore totalement le bonusDEF d'un bouclier adverse — à appliquer manuellement au jet d'attaque." }] },
      } },
  ],
  rapiere: [
    { id: "gracieuse", nom: "gracieuse", rare: "+1 initiative tant que l'arme est équipée", legendaire: "+2 initiative, agit en premier au premier tour de tout combat",
      mecanique: {
        rare: { passif: { bonusInitiative: 1 } },
        legendaire: { passif: { bonusInitiative: 2 }, note: "Agit aussi en premier au premier tour de tout combat — pas de mécanique d'ordre d'initiative forcé, à arbitrer manuellement." },
      } },
    { id: "perfide", nom: "perfide", rare: "Critique sur 19-20", legendaire: "Critique sur 18-20",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "critique", seuil: 19 }] },
        legendaire: { evenement: "touche", effets: [{ type: "critique", seuil: 18 }] },
      } },
  ],
  arbalete: [
    { id: "perforante", nom: "perforante", rare: "Ignore 2 points de reductionDegats de la cible", legendaire: "Ignore 4 points de reductionDegats de la cible",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 4 }] },
      } },
    { id: "a_repetition", nom: "à répétition", rare: "Peut tirer deux fois par tour à -4 aux deux jets", legendaire: "Peut tirer deux fois par tour sans malus" },
  ],
  cimeterre: [
    { id: "tourbillonnante", nom: "tourbillonnante", rare: "Une fois par tour, touche un second adversaire adjacent à demi-dégâts", legendaire: "Touche un second adversaire adjacent à dégâts complets" },
    { id: "ensanglantee", nom: "ensanglantée", rare: "Saignement : +1d4 dégâts pendant 2 tours", legendaire: "Saignement aggravé : +1d6 dégâts pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "dot", formule: "1d4", duree: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "dot", formule: "1d6", duree: 3 }] },
      } },
  ],
  hallebarde: [
    { id: "fauchante", nom: "fauchante", rare: "Touche tous les adversaires adjacents en ligne à demi-dégâts", legendaire: "Touche tous les adversaires adjacents en ligne à dégâts complets",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Touche tous les adversaires adjacents en ligne à demi-dégâts — attaque en zone non automatisée, à résoudre manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Touche tous les adversaires adjacents en ligne à dégâts complets — attaque en zone non automatisée, à résoudre manuellement." }] },
      } },
    { id: "crochue", nom: "crochue", rare: "Peut désarmer la cible sur un coup critique", legendaire: "Peut désarmer la cible sur tout coup touché",
      mecanique: {
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Désarme la cible — pas de mécanique de désarmement (retrait d'arme équipée) automatisée, à appliquer manuellement." }] },
      } },
  ],
  fleau_armes: [
    { id: "imprevisible", nom: "imprévisible", rare: "Ignore le bonusDEF des boucliers", legendaire: "Ignore le bonusDEF des boucliers et -2 DEF cible pendant 1 tour",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Ignore le bonusDEF des boucliers — pas de mécanique bonusDEF-cible dans ce vocabulaire, à appliquer manuellement au jet d'attaque." }] },
        legendaire: { evenement: "touche", effets: [{ type: "bonus", cible: "DEF", valeur: -2, duree: "1" }, { type: "special", note: "Ignore aussi le bonusDEF des boucliers adverses — à ajuster manuellement au jet d'attaque." }] },
      } },
    { id: "brutale", nom: "brutale", rare: "1 chance sur 2 d'étourdir la cible 1 tour", legendaire: "1 chance sur 2 d'étourdir la cible 2 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "etat", id: "etourdie", duree: "1", probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "etourdie", duree: "2", probabilite: 0.5 }] },
      } },
  ],
  francisque: [
    { id: "tournoyante", nom: "tournoyante", rare: "Peut être relancée pour toucher une cible à distance courte, 1 fois par combat", legendaire: "Peut être relancée sans limite, revient dans la main du porteur",
      mecanique: {
        // porteeMaxCases (6 cases ≈ 9m, cf. la portée "jet 9m" déjà indiquée
        // dans le texte de base de la francisque, data/loot.js) : rend l'arme
        // reconnue par Personnage.armeDistanceEquipee()/bonusAttaque comme
        // aussi utilisable à distance courte (jet de FORCE, pas DEX), en plus
        // de son usage normal au contact — cf. Personnage._estArmeContactJetable.
        // evenement "jetArme"/effet "porteeCourte" : usage vérifié par
        // _itemLancerArmeDisponible (js/app.js) au rendu du bouton "Distance"
        // (sidebar/dock battlemap) ET consommé à la résolution du jet — pas
        // de usage au légendaire (illimité, cf. "revient dans la main" :
        // rien à modéliser en plus, cette app ne fait déjà jamais "perdre"
        // une arme équipée après une attaque, contrairement à un consommable
        // jetable — javelot.revenant/cape_brume.evanescente restent hors
        // scope pour cette même raison ailleurs dans le catalogue).
        rare: { passif: { porteeMaxCases: 6 }, evenement: "jetArme", usage: { frequence: "1x/combat" }, effets: [{ type: "porteeCourte" }] },
        legendaire: { passif: { porteeMaxCases: 6 }, evenement: "jetArme", effets: [{ type: "porteeCourte" }] },
      } },
    { id: "feroce", nom: "féroce", rare: "+1d4 dégâts contre une cible à moins de la moitié de ses PV max", legendaire: "+1d8 dégâts contre une cible à moins de la moitié de ses PV max",
      mecanique: {
        rare: { evenement: "touche", condition: "cibleSousMoitie", effets: [{ type: "degats", formule: "1d4" }] },
        legendaire: { evenement: "touche", condition: "cibleSousMoitie", effets: [{ type: "degats", formule: "1d8" }] },
      } },
  ],
  poignards_jumeaux: [
    { id: "duelliste", nom: "de duelliste", rare: "Deuxième attaque à -4 dans le même tour", legendaire: "Deuxième attaque sans malus dans le même tour" },
    { id: "toxique", nom: "toxique", rare: "1 chance sur 2 d'infliger 1d4 dégâts de poison pendant 2 tours", legendaire: "1 chance sur 2 d'infliger 1d6 dégâts de poison pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "dot", formule: "1d4", duree: 2, probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "dot", formule: "1d6", duree: 3, probabilite: 0.5 }] },
      } },
  ],
  pique: [
    { id: "ancree", nom: "ancrée", rare: "+2 à l'attaque contre une cible qui charge", legendaire: "+4 à l'attaque et dégâts doublés contre une cible qui charge",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "+2 à l'attaque contre une cible qui charge — condition non automatisée (phase suivante), à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "+4 à l'attaque et dégâts doublés contre une cible qui charge — condition non automatisée (phase suivante), à appliquer manuellement." }] },
      } },
    { id: "transpercante", nom: "transperçante", rare: "Touche deux cibles alignées à demi-dégâts", legendaire: "Touche deux cibles alignées à dégâts complets",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Touche deux cibles alignées à demi-dégâts — attaque multi-cible non automatisée, à résoudre manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Touche deux cibles alignées à dégâts complets — attaque multi-cible non automatisée, à résoudre manuellement." }] },
      } },
  ],
  epee_batarde: [
    { id: "polyvalente", nom: "polyvalente", rare: "+1 dégât si maniée à deux mains ce tour", legendaire: "+2 dégâts et +1 DEF si maniée à deux mains ce tour",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "+1 dégât si maniée à deux mains ce tour — condition de posture non automatisée, à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "+2 dégâts et +1 DEF si maniée à deux mains ce tour — condition de posture non automatisée, à appliquer manuellement." }] },
      } },
    { id: "implacable", nom: "implacable", rare: "Ignore 2 points de reductionDegats de la cible", legendaire: "Ignore 4 points de reductionDegats de la cible",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 4 }] },
      } },
  ],
  arbalete_lourde: [
    { id: "devastatrice", nom: "dévastatrice", rare: "+1d6 dégâts si la cible n'a pas encore agi ce tour", legendaire: "+2d6 dégâts si la cible n'a pas encore agi ce tour",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "+1d6 dégâts si la cible n'a pas encore agi ce tour — condition non automatisée (phase suivante), à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "+2d6 dégâts si la cible n'a pas encore agi ce tour — condition non automatisée (phase suivante), à appliquer manuellement." }] },
      } },
    { id: "perforante", nom: "perforante", rare: "Ignore 3 points de reductionDegats de la cible", legendaire: "Ignore 6 points de reductionDegats de la cible",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 3 }] },
        legendaire: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 6 }] },
      } },
  ],
  // 3 variantes plutôt que 2 (rien n'empêche d'en avoir plus, cf. en-tête de fichier).
  grimoire: [
    { id: "embrasement", nom: "d'embrasement",
      rare: "+1 dégâts au jet de dégâts, et applique l'état Brûlure (1d4 dégâts en début de tour) au toucher",
      legendaire: "+1 dégâts au jet de dégâts, et applique l'état Brûlure aggravée (1d6 dégâts en début de tour, 3 tours minimum) au toucher",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "degats", formule: "1" }, { type: "dot", formule: "1d4", duree: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "degats", formule: "1" }, { type: "dot", formule: "1d6", duree: 3 }, { type: "special", note: "3 tours minimum au lieu d'un plafond fixe — le MJ peut prolonger si le texte d'origine le justifie." }] },
      } },
    { id: "effrayante", nom: "effrayante",
      rare: "+1 dégâts au jet de dégâts, 1 chance sur 4 d'infliger l'état Effrayée (Fuite) à la cible pendant 1d4 tours",
      legendaire: "+1 dégâts au jet de dégâts, 1 chance sur 2 d'infliger l'état Effrayée (Fuite) à la cible pendant 1d4 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "degats", formule: "1" }, { type: "etat", id: "effrayee", duree: "2", probabilite: 0.25 }, { type: "special", note: "Durée normalement 1d4 tours (variable) — fixée à 2 tours (moyenne) pour l'automatisation, à ajuster manuellement si besoin." }] },
        legendaire: { evenement: "touche", effets: [{ type: "degats", formule: "1" }, { type: "etat", id: "effrayee", duree: "2", probabilite: 0.5 }, { type: "special", note: "Durée normalement 1d4 tours (variable) — fixée à 2 tours (moyenne) pour l'automatisation, à ajuster manuellement si besoin." }] },
      } },
    { id: "affaiblissante", nom: "affaiblissante",
      rare: "+1 dégâts au jet de dégâts, 1 chance sur 4 de réduire la DEF de la cible de 1 pendant 2 tours",
      legendaire: "+1 dégâts au jet de dégâts, 1 chance sur 2 de réduire la DEF de la cible de 1 pendant 3 tours",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "degats", formule: "1" }, { type: "bonus", cible: "DEF", valeur: -1, duree: "2", probabilite: 0.25 }] },
        legendaire: { evenement: "touche", effets: [{ type: "degats", formule: "1" }, { type: "bonus", cible: "DEF", valeur: -1, duree: "3", probabilite: 0.5 }] },
      } },
  ],

  // ── Armures ────────────────────────────────────────────────
  armure_cuir: [
    { id: "souple", nom: "souple", rare: "+1 en DEX tant que l'armure est équipée", legendaire: "+2 en DEX tant que l'armure est équipée",
      mecanique: {
        rare: { passif: { bonusCarac: { DEX: 1 } } },
        legendaire: { passif: { bonusCarac: { DEX: 2 } } },
      } },
    { id: "silencieuse", nom: "silencieuse", rare: "+1 en discrétion", legendaire: "+2 en discrétion, aucun malus en terrain difficile",
      mecanique: {
        rare: { passif: { bonusCompetences: { Discrétion: 1 } } },
        legendaire: { passif: { bonusCompetences: { Discrétion: 2 } }, note: "Aucun malus en terrain difficile — pas de mécanique de terrain difficile, à arbitrer manuellement." },
      } },
  ],
  armure_cloute: [
    { id: "epineuse", nom: "épineuse", rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact",
      mecanique: {
        rare: { evenement: "subitContact", effets: [{ type: "degats", formule: "1", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", effets: [{ type: "degats", formule: "2", cible: "attaquant" }] },
      } },
    { id: "robuste", nom: "robuste", rare: "Réduit de moitié les dégâts de chute", legendaire: "Annule les dégâts de chute" },
  ],
  cotte_mailles: [
    { id: "renforcee", nom: "renforcée", rare: "Réduit d'1 les dégâts physiques après application de reductionDegats", legendaire: "Réduit de 2 les dégâts physiques après application de reductionDegats" },
    { id: "cliquetante", nom: "intimidante", rare: "+1 en intimidation", legendaire: "+2 en intimidation, effraie les créatures de faible dangerosité au 1er round",
      mecanique: {
        rare: { passif: { bonusCompetences: { Intimidation: 1 } } },
        legendaire: { passif: { bonusCompetences: { Intimidation: 2 } }, note: "Effraie aussi les créatures de faible dangerosité au 1er round — à arbitrer manuellement." },
      } },
  ],
  demi_plaques: [
    { id: "imposante", nom: "imposante", rare: "+1 DEF contre les attaques à distance", legendaire: "+2 DEF contre les attaques à distance" },
    { id: "ancree", nom: "ancrée", rare: "Résiste automatiquement à un effet de repoussement par combat", legendaire: "Résiste automatiquement à tout effet de repoussement" },
  ],
  plaques_comp: [
    { id: "impenetrable", nom: "impénétrable", rare: "Réduit de 1 tout dégât physique après application de reductionDegats", legendaire: "Réduit de 2 tout dégât physique après application de reductionDegats" },
    { id: "ecrasante", nom: "écrasante", rare: "+1 en FOR tant que l'armure est équipée", legendaire: "+2 en FOR tant que l'armure est équipée",
      mecanique: {
        rare: { passif: { bonusCarac: { FOR: 1 } } },
        legendaire: { passif: { bonusCarac: { FOR: 2 } } },
      } },
  ],
  armure_ombre: [
    { id: "furtive", nom: "furtive", rare: "Silhouette indétectable dans l'obscurité totale", legendaire: "Idem, et déplacement totalement silencieux" },
    { id: "drainante", nom: "drainante", rare: "Soigne 1 PV au porteur quand une attaque de contact le manque", legendaire: "Soigne 2 PV au porteur quand une attaque de contact le manque" },
  ],
  cotte_runique: [
    { id: "protectrice", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance contre la magie" },
    { id: "reflechissante", nom: "réfléchissante", rare: "1 fois par combat, renvoie 1d4 dégâts magiques subis à l'attaquant", legendaire: "1 fois par combat, renvoie 1d8 dégâts magiques subis à l'attaquant",
      mecanique: {
        rare: { evenement: "subitContact", typeDegats: "magique", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d4", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", typeDegats: "magique", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d8", cible: "attaquant" }] },
      } },
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
    { id: "focalisante", nom: "focalisante", rare: "+1 en INT tant que la robe est équipée", legendaire: "+2 en INT tant que la robe est équipée",
      mecanique: {
        rare: { passif: { bonusCarac: { INT: 1 } } },
        legendaire: { passif: { bonusCarac: { INT: 2 } } },
      } },
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
    { id: "vivante", nom: "vivante", rare: "Se répare de 1 point de reductionDegats perdu par jour de repos", legendaire: "Se répare intégralement après une nuit de repos" },
    { id: "camouflee", nom: "camouflée", rare: "+1 en discrétion en milieu naturel", legendaire: "+2 en discrétion en milieu naturel, indétectable à l'arrêt" },
  ],

  // ── Boucliers ──────────────────────────────────────────────
  rondache: [
    { id: "vive", nom: "vive", rare: "+1 initiative tant que le bouclier est équipé", legendaire: "+2 initiative tant que le bouclier est équipé",
      mecanique: {
        rare: { passif: { bonusInitiative: 1 } },
        legendaire: { passif: { bonusInitiative: 2 } },
      } },
    { id: "parade", nom: "de parade", rare: "1 fois par combat, annule totalement une attaque de contact", legendaire: "2 fois par combat, annule totalement une attaque de contact",
      mecanique: {
        rare: { evenement: "subitAttaque", porteeRequise: "contact", usage: { frequence: "1x/combat" }, effets: [{ type: "esquive" }] },
        legendaire: { evenement: "subitAttaque", porteeRequise: "contact", usage: { frequence: "2x/combat" }, effets: [{ type: "esquive" }] },
      } },
  ],
  bouclier_acier: [
    { id: "standard", nom: "renforcé", rare: "+1 DEF supplémentaire contre les attaques à distance", legendaire: "+2 DEF supplémentaire contre les attaques à distance" },
    { id: "renvoyeur", nom: "renvoyeur", rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact",
      mecanique: {
        rare: { evenement: "subitContact", effets: [{ type: "degats", formule: "1", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", effets: [{ type: "degats", formule: "2", cible: "attaquant" }] },
      } },
  ],
  targe_elfique: [
    { id: "protectrice", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance contre la magie" },
    { id: "legere", nom: "légère", rare: "N'inflige aucun malus DEX même combinée à une armure lourde", legendaire: "Idem, + 1 initiative" },
  ],
  bouclier_tour: [
    { id: "muraille", nom: "muraille", rare: "1 fois par combat, protège aussi un allié adjacent d'une attaque", legendaire: "2 fois par combat, protège un allié adjacent d'une attaque",
      mecanique: {
        // intercepte (cf. lot "reflechissant/muraille") : contrairement à
        // esquive/reductionDegats (répondu par la CIBLE elle-même), ce
        // déclencheur est offert à tout ALLIÉ adjacent à la cible — filtré
        // par _repondantsSubitAttaque (js/app.js), pas par porteeRequise ici
        // (aucune restriction de contact/distance dans le texte de l'affixe).
        rare: { evenement: "subitAttaque", usage: { frequence: "1x/combat" }, effets: [{ type: "intercepte" }] },
        legendaire: { evenement: "subitAttaque", usage: { frequence: "2x/combat" }, effets: [{ type: "intercepte" }] },
      } },
    { id: "inebranlable", nom: "inébranlable", rare: "Résiste automatiquement à un effet de repoussement par combat", legendaire: "Résiste automatiquement à tout effet de repoussement" },
  ],
  bouclier_rond_nain: [
    { id: "runique", nom: "runique", rare: "1 fois par combat, renvoie 1d4 dégâts subis à l'attaquant", legendaire: "1 fois par combat, renvoie 1d8 dégâts subis à l'attaquant",
      mecanique: {
        rare: { evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d4", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d8", cible: "attaquant" }] },
      } },
    { id: "massif", nom: "massif", rare: "Ignore 1 point de dégâts physiques après application du bonusDEF", legendaire: "Ignore 2 points de dégâts physiques après application du bonusDEF" },
  ],
  bouclier_seve: [
    { id: "regenerant", nom: "régénérant", rare: "Soigne 1 PV au porteur à chaque tour où le bouclier bloque une attaque", legendaire: "Soigne 2 PV au porteur dans les mêmes conditions" },
    { id: "vivant", nom: "vivant", rare: "Se répare de 1 point de bonusDEF perdu par jour de repos", legendaire: "Se répare intégralement après une nuit de repos" },
  ],

  // ── Accessoires ────────────────────────────────────────────
  anneau_protection: [
    { id: "gardien", nom: "du gardien", rare: "+1 DEF ; annule automatiquement la surprise au premier round de combat", legendaire: "+2 DEF ; annule la surprise et agit en premier au premier round" },
    { id: "absorbant", nom: "absorbant", rare: "+1 DEF ; 1 fois par combat, réduit de moitié les dégâts d'une attaque subie", legendaire: "+2 DEF ; 2 fois par combat, réduit de moitié les dégâts d'une attaque subie",
      mecanique: {
        // reductionDegats (cf. lot "subitAttaque : esquive/réduction") :
        // contrairement à esquive, PAS un choix proposé au porteur — proc
        // automatique au moment des dégâts (comme épineuse/runique), lu par
        // _reduireDegatsSubisSiDisponible AVANT subirDegats (jamais par
        // _resoudreEffetsDeclencheur, qui n'intervient qu'après).
        rare: { passif: { bonusDEF: 1 }, evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "reductionDegats", fraction: 0.5 }] },
        legendaire: { passif: { bonusDEF: 2 }, evenement: "subitContact", usage: { frequence: "2x/combat" }, effets: [{ type: "reductionDegats", fraction: 0.5 }] },
      } },
  ],
  bracelets_defense: [
    { id: "impassibles", nom: "impassibles", rare: "+2 DEF (sans armure/bouclier) ; +1 aux jets de résistance", legendaire: "+3 DEF (sans armure/bouclier) ; +2 aux jets de résistance" },
    { id: "reactifs", nom: "réactifs", rare: "+2 DEF (sans armure/bouclier) ; 1 fois par combat, esquive totalement une attaque de contact", legendaire: "+3 DEF (sans armure/bouclier) ; 2 fois par combat, esquive totalement une attaque de contact",
      mecanique: {
        // +2/+3 DEF conditionnel ("sans armure/bouclier") laissé en note :
        // aucun bonusDEF de l'app n'est aujourd'hui conditionné à l'ABSENCE
        // d'un autre équipement (bonusDEF() somme tout, sans exclusion) —
        // même limite déjà acceptée pour "milieu naturel"/"terrain naturel"
        // ailleurs, à arbitrer manuellement plutôt qu'inventer un garde-fou
        // dédié pour ce seul cas. L'esquive, elle, est mécanisée normalement.
        rare: { evenement: "subitAttaque", porteeRequise: "contact", usage: { frequence: "1x/combat" }, effets: [{ type: "esquive" }],
          note: "+2 DEF sans armure/bouclier — condition non trackable automatiquement, à arbitrer manuellement." },
        legendaire: { evenement: "subitAttaque", porteeRequise: "contact", usage: { frequence: "2x/combat" }, effets: [{ type: "esquive" }],
          note: "+3 DEF sans armure/bouclier — condition non trackable automatiquement, à arbitrer manuellement." },
      } },
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
    { id: "insistante", nom: "insistante", rare: "2 fois par jour, relance un jet raté", legendaire: "3 fois par jour, relance un jet raté (garde le meilleur résultat)",
      mecanique: {
        // relance (cf. lot "jour" — pierre de chance) : DÉCLENCHÉ PAR LE
        // JOUEUR sur son propre dernier test d20 (cf. dernierJetRelancable/
        // _relancerDernierJet, js/app.js) — "raté" n'est pas toujours connu
        // de l'app (beaucoup de jets libres n'ont pas de DC suivie), c'est
        // au joueur de juger. garderMeilleur (légendaire uniquement, cf. son
        // texte exact) : conserve le MEILLEUR des deux résultats.
        rare: { evenement: "relance", usage: { frequence: "2x/jour" }, effets: [{ type: "relance" }] },
        legendaire: { evenement: "relance", usage: { frequence: "3x/jour" }, effets: [{ type: "relance", garderMeilleur: true }] },
      } },
    { id: "protectrice", nom: "protectrice", rare: "1 fois par jour, relance un jet raté ; 1 fois par jour, transforme un coup critique subi en coup normal", legendaire: "2 fois par jour, relance un jet raté ; 1 fois par combat, transforme un coup critique subi en coup normal",
      mecanique: {
        // 2 déclencheurs indépendants sur le même item (cf. meca.aussi[],
        // _appliquerMecanique) : "relance" (identique à "insistante", sans
        // garderMeilleur) ET "critiqueSubi" — ce second volet est un proc
        // AUTOMATIQUE (pas de choix du joueur, cf. "absorbant"), fréquence
        // et période distinctes de la relance (1x/jour puis 1x/COMBAT au
        // palier légendaire, cf. le texte exact).
        rare: { evenement: "relance", usage: { frequence: "1x/jour" }, effets: [{ type: "relance" }],
          aussi: [{ evenement: "critiqueSubi", usage: { frequence: "1x/jour" }, effets: [{ type: "annuleCritique" }] }] },
        legendaire: { evenement: "relance", usage: { frequence: "2x/jour" }, effets: [{ type: "relance" }],
          aussi: [{ evenement: "critiqueSubi", usage: { frequence: "1x/combat" }, effets: [{ type: "annuleCritique" }] }] },
      } },
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
    { id: "insaisissable", nom: "insaisissable", rare: "+1 DEF contre la première attaque ; 1 fois par combat, une attaque manque automatiquement sa cible", legendaire: "+2 DEF contre la première attaque ; 2 fois par combat, une attaque manque automatiquement sa cible",
      mecanique: {
        // Pas de porteeRequise (contrairement à parade/reactifs) : le texte
        // ne restreint pas à une attaque "de contact", donc l'esquive
        // s'applique aussi bien à une attaque de contact qu'à distance.
        rare: { evenement: "subitAttaque", usage: { frequence: "1x/combat" }, effets: [{ type: "esquive" }],
          note: "+1 DEF contre la première attaque du combat — aucun tracker de \"première attaque\" dans l'app, à arbitrer manuellement." },
        legendaire: { evenement: "subitAttaque", usage: { frequence: "2x/combat" }, effets: [{ type: "esquive" }],
          note: "+2 DEF contre la première attaque du combat — même limite qu'au palier rare, à arbitrer manuellement." },
      } },
    { id: "evanescente", nom: "évanescente", rare: "+1 DEF contre la première attaque ; 1 fois par combat, disparaît de la vue 1 tour (Discrétion totale)", legendaire: "+2 DEF contre la première attaque ; 2 fois par combat, disparaît de la vue 1 tour" },
  ],

  // ── Armes (suite) ──────────────────────────────────────────
  trident: [
    { id: "des_profondeurs", nom: "des profondeurs", rare: "+1d4 dégâts contre les créatures aquatiques ou en zone immergée", legendaire: "+1d8 dégâts dans les mêmes conditions, ignore les malus de combat en zone immergée",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "+1d4 dégâts contre les créatures aquatiques ou en zone immergée — condition non automatisée (phase suivante), à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "+1d8 dégâts dans les mêmes conditions, ignore les malus de combat en zone immergée — condition non automatisée (phase suivante), à appliquer manuellement." }] },
      } },
    { id: "immobilisante", nom: "immobilisante", rare: "1 chance sur 2 d'immobiliser la cible 1 tour sur un coup critique", legendaire: "Immobilise la cible 1 tour sur tout coup touché",
      mecanique: {
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "immobilisee", duree: "1" }] },
      } },
  ],
  fouet: [
    { id: "desarmant", nom: "désarmant", rare: "1 chance sur 2 de désarmer la cible sur un coup touché", legendaire: "Désarme automatiquement la cible sur tout coup touché",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "1 chance sur 2 de désarmer la cible — pas de mécanique de désarmement automatisée, à appliquer manuellement.", probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Désarme automatiquement la cible — pas de mécanique de désarmement automatisée, à appliquer manuellement." }] },
      } },
    { id: "entravant", nom: "entravant", rare: "1 chance sur 2 d'immobiliser la cible 1 tour", legendaire: "Immobilise la cible 1 tour sur tout coup touché, 2 tours sur critique",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "etat", id: "immobilisee", duree: "1", probabilite: 0.5 }] },
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "immobilisee", duree: "1" }, { type: "special", note: "2 tours au lieu d'1 si le coup est critique — non distingué automatiquement, à ajuster manuellement sur un critique." }] },
      } },
  ],
  javelot: [
    { id: "percant", nom: "perçant", rare: "Ignore 2 points de reductionDegats de la cible", legendaire: "Ignore 4 points de reductionDegats de la cible",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 2 }] },
        legendaire: { evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 4 }] },
      } },
    { id: "revenant", nom: "revenant", rare: "Revient dans la main du porteur après un lancer réussi, 1 fois par combat", legendaire: "Revient systématiquement dans la main du porteur après chaque lancer" },
  ],
  fronde: [
    { id: "precise", nom: "précise", rare: "+2 au jet d'attaque à longue portée", legendaire: "+4 au jet d'attaque à longue portée, critique sur 19-20",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "+2 au jet d'attaque à longue portée — condition de portée non automatisée, à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "+4 au jet d'attaque à longue portée, critique sur 19-20 — condition de portée non automatisée, à appliquer manuellement." }] },
      } },
    { id: "etourdissante", nom: "étourdissante", rare: "1 chance sur 2 d'étourdir la cible 1 tour sur un coup critique", legendaire: "Étourdit la cible 1 tour sur tout coup touché",
      mecanique: {
        legendaire: { evenement: "touche", effets: [{ type: "etat", id: "etourdie", duree: "1" }] },
      } },
  ],
  glaive_guerre: [
    { id: "decapitant", nom: "décapitant", rare: "Critique sur 19-20 contre les cibles sans casque ni armure lourde", legendaire: "Critique sur 18-20 dans les mêmes conditions, dégâts doublés sur critique",
      mecanique: {
        rare: { evenement: "touche", effets: [{ type: "special", note: "Critique sur 19-20 contre les cibles sans casque ni armure lourde — condition non automatisée (phase suivante), à appliquer manuellement." }] },
        legendaire: { evenement: "touche", effets: [{ type: "special", note: "Critique sur 18-20 dans les mêmes conditions, dégâts doublés sur critique — condition non automatisée (phase suivante), à appliquer manuellement." }] },
      } },
    { id: "imperial", nom: "impérial", rare: "+1 en intimidation tant que l'arme est visible", legendaire: "+2 en intimidation, effraie les créatures de faible dangerosité au 1er round",
      mecanique: {
        rare: { passif: { bonusCompetences: { Intimidation: 1 } } },
        legendaire: { passif: { bonusCompetences: { Intimidation: 2 } }, note: "Effraie aussi les créatures de faible dangerosité au 1er round — à arbitrer manuellement." },
      } },
  ],

  // ── Armures (suite) ────────────────────────────────────────
  cotte_mithril: [
    { id: "legere_air", nom: "légère comme l'air", rare: "+1 case de déplacement", legendaire: "+2 cases de déplacement" },
    { id: "protectrice_mithril", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance, absorbe automatiquement 1 dégât magique par tour" },
  ],
  armure_ossements: [
    { id: "macabre", nom: "macabre", rare: "+1 en intimidation, effraie les créatures vivantes de faible dangerosité", legendaire: "+2 en intimidation, immunise contre la Terreur",
      mecanique: {
        rare: { passif: { bonusCompetences: { Intimidation: 1 } }, note: "Effraie aussi les créatures vivantes de faible dangerosité — à arbitrer manuellement." },
        legendaire: { passif: { bonusCompetences: { Intimidation: 2 } }, note: "Immunise aussi contre la Terreur — pas d'immunité automatisée pour cet état précis, à arbitrer manuellement." },
      } },
    { id: "drainante_os", nom: "drainante", rare: "Soigne 1 PV au porteur à chaque ennemi tué à moins de 2 cases", legendaire: "Soigne 2 PV au porteur dans les mêmes conditions, + 1d4 PV temporaires" },
  ],
  armure_guerre_orque: [
    { id: "brutale", nom: "brutale", rare: "+1d4 dégâts avec armes de contact tant que l'armure est équipée", legendaire: "+1d6 dégâts avec armes de contact tant que l'armure est équipée",
      mecanique: {
        rare: { passif: { bonusDegatsContact: "1d4" } },
        legendaire: { passif: { bonusDegatsContact: "1d6" } },
      } },
    { id: "increvable", nom: "increvable", rare: "Ignore 1 point de dégâts physiques après application de reductionDegats", legendaire: "Ignore 2 points de dégâts physiques après application de reductionDegats" },
  ],
  gants_poing: [
    { id: "percutants", nom: "percutants", rare: "+1 dégâts à mains nues ; ignore 1 point de reductionDegats de la cible", legendaire: "+2 dégâts à mains nues ; ignore 2 points de reductionDegats de la cible" },
    { id: "foudroyants", nom: "foudroyants", rare: "+1 dégâts à mains nues ; 1 chance sur 2 d'étourdir la cible 1 tour sur un coup critique", legendaire: "+2 dégâts à mains nues ; étourdit systématiquement la cible 1 tour sur tout coup critique" },
  ],

  // ── Boucliers (suite) ──────────────────────────────────────
  bouclier_guet: [
    { id: "vigilant", nom: "vigilant", rare: "Ne peut jamais être surpris (garde une DEF normale même surpris)", legendaire: "Idem, + agit en premier au premier round si le groupe est surpris" },
    { id: "imposant", nom: "imposant", rare: "+1 en intimidation", legendaire: "+2 en intimidation, +1 DEF aux alliés adjacents",
      mecanique: {
        rare: { passif: { bonusCompetences: { Intimidation: 1 } } },
        legendaire: { passif: { bonusCompetences: { Intimidation: 2 } }, note: "+1 DEF aux alliés adjacents — pas de mécanique de bonus de zone automatisée, à arbitrer manuellement." },
      } },
  ],
  bouclier_miroir: [
    { id: "reflechissant", nom: "réfléchissant", rare: "1 fois par combat, renvoie un sort ciblé à son lanceur", legendaire: "2 fois par combat, renvoie un sort ciblé à son lanceur",
      mecanique: {
        // reflechitSort (cf. lot "reflechissant/muraille") : réponse
        // indépendante de Contresort dans la même fenêtre "sortLance",
        // réservée à la CIBLE du sort (contrairement à Contresort, ouvert à
        // tout PJ à portée) — cf. _repondantsSortLance/_itemReflechissantDisponible
        // (js/app.js). Redirige le plan d'effets vers le lanceur au lieu de
        // l'annuler (cf. redirigerVersLanceur, même chemin que cible:"soi").
        rare: { evenement: "sortLance", usage: { frequence: "1x/combat" }, effets: [{ type: "reflechitSort" }] },
        legendaire: { evenement: "sortLance", usage: { frequence: "2x/combat" }, effets: [{ type: "reflechitSort" }] },
      } },
    { id: "eblouissant", nom: "éblouissant", rare: "1 fois par combat, aveugle un attaquant au contact pendant 1 tour", legendaire: "2 fois par combat, aveugle un attaquant au contact pendant 1 tour",
      mecanique: {
        rare: { evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "etat", id: "aveuglee", duree: "1", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", usage: { frequence: "2x/combat" }, effets: [{ type: "etat", id: "aveuglee", duree: "1", cible: "attaquant" }] },
      } },
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

  // Fusionne mecanique[palier].passif dans le clone — MÊME chemin que les
  // accessoires du catalogue (bonusCarac/bonusCompetences/bonusInitiative,
  // lus génériquement par Personnage._itemsEquipesUniques()), jamais un
  // calcul parallèle (cf. Affixes phase 2 §A, piège "ne pas dupliquer
  // l'agrégation des bonus"). bonusDegatsContact (armure "brutale") est la
  // seule exception : lu par Personnage.bonusDegatsContactArmureEquipee(),
  // pas par une somme générique (formule de dé, pas un entier).
  function _appliquerPassif(clone, item, passif) {
    if (!passif) return;
    if (passif.bonusCarac) {
      clone.bonusCarac = Object.assign({}, item.bonusCarac);
      Object.keys(passif.bonusCarac).forEach((c) => { clone.bonusCarac[c] = (clone.bonusCarac[c] || 0) + passif.bonusCarac[c]; });
    }
    if (passif.bonusCompetences) {
      clone.bonusCompetences = Object.assign({}, item.bonusCompetences);
      Object.keys(passif.bonusCompetences).forEach((c) => { clone.bonusCompetences[c] = (clone.bonusCompetences[c] || 0) + passif.bonusCompetences[c]; });
    }
    if (passif.bonusInitiative) clone.bonusInitiative = (item.bonusInitiative || 0) + passif.bonusInitiative;
    if (passif.bonusDegatsContact) clone.bonusDegatsContact = passif.bonusDegatsContact;
    // bonusDEF (cf. "absorbant", lot subitAttaque esquive/réduction) : même
    // champ que celui déjà sommé génériquement par Personnage.bonusDEF()
    // (accessoires "de base" du catalogue) — aucun changement côté
    // personnage.js, juste posé ici comme les autres passifs.
    if (passif.bonusDEF) clone.bonusDEF = (item.bonusDEF || 0) + passif.bonusDEF;
    // porteeMaxCases/porteeMinCases (cf. "tournoyante", francisque, lot
    // "malgré la limite") : mêmes champs que ceux DÉJÀ portés nativement par
    // les vraies armes à distance du catalogue (arc, arbalète — cf.
    // data/loot.js) — leur seule PRÉSENCE sur une arme de contact suffit à
    // Personnage._estArmeContactJetable() pour la reconnaître comme jetable
    // à distance courte, sans marqueur dédié.
    if (passif.porteeMaxCases !== undefined) {
      clone.porteeMaxCases = passif.porteeMaxCases;
      clone.porteeMinCases = passif.porteeMinCases || 0;
    }
  }

  // mecanique[palier] (rare/legendaire) -> effets sur le clone, commun aux 4
  // types (cf. Affixes phase 2 : epineuse est une armure, renvoyeur un
  // bouclier, tous deux avec un déclencheur "subitContact" — la mécanique
  // n'est plus l'apanage des armes depuis cette phase). `meca` peut porter,
  // indépendamment les uns des autres : passif, evenement+effets
  // (déclencheur, avec condition et usage optionnels), bonusAttaqueConditionnel.
  // Un seul déclencheur (evenement+effets+usage+typeDegats+porteeRequise) —
  // factorisé pour être appelé sur `meca` (forme courte historique) ET sur
  // chaque entrée de `meca.aussi[]` (cf. "protectrice", Pierre de chance : un
  // palier peut porter DEUX déclencheurs indépendants, evenements/usages
  // distincts — ex. "relance" 1x/jour ET "critiqueSubi" 1x/combat).
  function _construireDeclencheur(spec) {
    // declencheurs[] : lu par _gererDeclencheursEquipement/
    // _gererDeclencheursSubitContact (js/app.js) sur l'item équipé — même
    // schéma que les objets forgés (Épée de Cupidité), juste produit ici
    // plutôt que par la Forge du MJ.
    const d = { evenement: spec.evenement, effets: spec.effets };
    if (spec.condition) d.condition = spec.condition;
    // usage (cf. "éblouissant", Affixes phase 4 — "1/2 fois par combat") :
    // même vocabulaire que mecanique.usage.frequence des capacités PJ/
    // monstres (Capacites.verifierUsage), lu par _verifierUsageDeclencheur
    // (js/app.js) plutôt que par un compteur ad hoc.
    if (spec.usage) d.usage = spec.usage;
    // typeDegats (cf. "réfléchissante", cotte_runique — ne renvoie que les
    // dégâts MAGIQUES subis) : filtre le déclencheur "subitContact" sur le
    // type de dégâts encaissé, lu par _gererDeclencheursSubitContact
    // (js/app.js). Absent = aucun filtre (épineuse/renvoyeur/runique).
    if (spec.typeDegats) d.typeDegats = spec.typeDegats;
    // porteeRequise (cf. "parade"/"reactifs", lot subitAttaque esquive) :
    // filtre le déclencheur "subitAttaque" sur le type d'attaque subie
    // ("contact" uniquement) — lu par _itemEsquiveDisponible (js/app.js).
    // Absent = aucun filtre (contact ET distance, cf. "insaisissable").
    if (spec.porteeRequise) d.porteeRequise = spec.porteeRequise;
    return d;
  }
  function _appliquerMecanique(clone, item, meca) {
    if (!meca) return;
    _appliquerPassif(clone, item, meca.passif);
    if (meca.evenement && Array.isArray(meca.effets)) {
      clone.declencheurs = [_construireDeclencheur(meca)];
      // critique{seuil} (cf. Rapière perfide) : résolu STATIQUEMENT ici, pas
      // par le déclencheur (le jet est déjà fait au moment où "touche" se
      // résout) — lu ensuite par Personnage.critMinAttaque() via arme.critMin,
      // mécanisme déjà existant.
      const effetCritique = meca.effets.find((e) => e.type === "critique");
      if (effetCritique) clone.critMin = Math.min(item.critMin || 20, effetCritique.seuil);
    }
    // aussi[] (cf. "protectrice" ci-dessus) : déclencheurs supplémentaires
    // sur le MÊME item, jamais mutuellement exclusifs avec le premier.
    if (Array.isArray(meca.aussi)) {
      meca.aussi.forEach((sub) => {
        if (!sub.evenement || !Array.isArray(sub.effets)) return;
        clone.declencheurs = (clone.declencheurs || []).concat([_construireDeclencheur(sub)]);
      });
    }
    // bonusAttaqueConditionnel (cf. "precise") : PAS un effet de déclencheur
    // — son bonus se lit AVANT le jet d'attaque (cf. Affixes phase 2 §B,
    // piège "precise n'est pas un effet de déclencheur"), par
    // _bonusAttaqueConditionnelEquipement (js/app.js), pas par le résolveur.
    if (meca.bonusAttaqueConditionnel) clone.bonusAttaqueConditionnel = meca.bonusAttaqueConditionnel;
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
        // Bâton (id "baton"/"baton_p1", cf. reference_sorts_connus.md §4) :
        // seule arme qui "canalise" — bonusAttaqueMagique/bonusDegatsMagiques
        // scalent avec la rareté de CET exemplaire plutôt que d'être une
        // valeur fixe en catalogue (Commun = pas de bonus, Peu commun +1,
        // Rare +2, Légendaire +3). Lus génériquement par
        // Personnage.bonusAttaque("magique")/degatsMagiques() comme
        // n'importe quel autre item équipé porteur de ces champs.
        if (/^baton/.test(item.id || "")) {
          clone.bonusAttaqueMagique = (item.bonusAttaqueMagique || 0) + bonus;
          clone.bonusDegatsMagiques = (item.bonusDegatsMagiques || 0) + bonus;
        }
        if (auMoinsRare && item.degatsAuMoinsRare) clone.degats = item.degatsAuMoinsRare;
        break;
      case "armure":
        // Le bonus de rareté se répartit sur les deux stats depuis
        // l'éclatement de l'ancien valeurArmure (cf. §7 de la référence
        // CA/armures) : valeurCA ET reductionDegats gagnent chacun +bonus.
        clone.valeurCA = (item.valeurCA || 10) + bonus;
        clone.reductionDegats = (item.reductionDegats || 0) + bonus;
        break;
      case "bouclier":
        clone.bonusDEF = (item.bonusDEF || 0) + bonus;
        break;
      case "accessoire":
        clone.effet = _renforcerEffetAccessoire(item.effet, bonus);
        break;
      default:
        break; // consommable ou type inconnu
    }

    // Texte rare/legendaire + mecanique (cf. "Mécaniser les affixes de
    // rareté") : commun aux 4 types depuis la phase 2 (armure/bouclier
    // peuvent désormais porter un déclencheur "subitContact" ou un passif,
    // pas seulement une arme "sur touche") — EFFETS_RARETE (repli générique)
    // porte aussi sa propre clé mecanique, même format que les variantes.
    if (auMoinsRare && item.type !== "consommable") {
      if (variante) { clone.effetRarete = variante[rarete.id]; clone.varianteNom = variante.nom; }
      else clone.effetRarete = _effetGenerique(item.type, rarete.id);
      const source = variante || EFFETS_RARETE[item.type];
      const meca = source && source.mecanique && source.mecanique[rarete.id];
      if (meca) _appliquerMecanique(clone, item, meca);
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
