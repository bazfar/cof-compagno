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
  bouclier: { rare: "1 fois par combat : annule totalement une attaque de contact", legendaire: "2 fois par combat : annule totalement une attaque de contact",
      mecanique: {
        // Repli générique utilisé par tout bouclier SANS variante propre dans
        // EFFETS_PAR_ITEM (cf. Raretes.appliquer, `source = variante ||
        // EFFETS_RARETE[item.type]`) — même mécanique que "absorbant" (lot
        // "subitAttaque : esquive/réduction"), fraction 1.0 (annulation
        // totale) au lieu de 0.5, lue par _reduireDegatsSubisSiDisponible.
        rare: { evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "reductionDegats", fraction: 1 }] },
        legendaire: { evenement: "subitContact", usage: { frequence: "2x/combat" }, effets: [{ type: "reductionDegats", fraction: 1 }] },
      } },
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
    { id: "vive", nom: "vive", rare: "Permet une attaque supplémentaire à -4 une fois par tour", legendaire: "Permet une attaque supplémentaire sans malus une fois par tour",
      mecanique: {
        // attaqueSupplementaire (cf. lot "armes A/B") : même mécanique que
        // Barde "Enchaînement (L)" — bouton dédié qui accorde une action via
        // Combat.accorderActionPrincipaleBonus, malus posé comme bonusTemporaire
        // "attaque" (s'applique aux DEUX attaques du tour, même assomption
        // documentée que la capacité). "-4" au rare, aucun malus au légendaire.
        rare: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "bonus", cible: "attaque", valeur: -4, duree: "1" }] },
        legendaire: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "special", note: "Aucun malus à ce palier." }] },
      } },
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
    { id: "a_repetition", nom: "à répétition", rare: "Peut tirer deux fois par tour à -4 aux deux jets", legendaire: "Peut tirer deux fois par tour sans malus",
      mecanique: {
        // Même mécanique que "vive" (épée courte) — cf. lot "armes A/B".
        rare: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "bonus", cible: "attaque", valeur: -4, duree: "1" }] },
        legendaire: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "special", note: "Aucun malus à ce palier." }] },
      } },
  ],
  cimeterre: [
    { id: "tourbillonnante", nom: "tourbillonnante", rare: "Une fois par tour, touche un second adversaire adjacent à demi-dégâts", legendaire: "Touche un second adversaire adjacent à dégâts complets",
      mecanique: {
        // Même bouton "attaqueSupplementaire" que "vive" (aucun malus au jet
        // d'attaque ici, contrairement à "vive"/"a_repetition"/"duelliste") :
        // "à demi-dégâts" (rare) reste à appliquer manuellement sur le jet de
        // dégâts de cette attaque — aucune notion de "cible secondaire" ni de
        // dégâts fractionnés dans le vocabulaire des déclencheurs.
        rare: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "special", note: "Vise un second adversaire ADJACENT, à demi-dégâts (à appliquer manuellement sur le jet de dégâts)." }] },
        legendaire: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "special", note: "Vise un second adversaire ADJACENT, à dégâts complets." }] },
      } },
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
        // porteeMaxCases (6 cases ≈ 9m) : ÉTEND la portée de base de la
        // francisque (categoriePortee "jet", 1-5 cases déjà de base depuis
        // prompt_portees_armes.md — reconnue par Personnage.armeDistanceEquipee()
        // sans l'aide de cet affixe) à 6 cases. L'affixe n'accorde donc plus la
        // capacité à distance elle-même (déjà acquise), seulement sa relance
        // (cf. evenement "jetArme" ci-dessous) et cette portée étendue.
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
    { id: "duelliste", nom: "de duelliste", rare: "Deuxième attaque à -4 dans le même tour", legendaire: "Deuxième attaque sans malus dans le même tour",
      mecanique: {
        // Même mécanique que "vive" (épée courte) — cf. lot "armes A/B".
        rare: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "bonus", cible: "attaque", valeur: -4, duree: "1" }] },
        legendaire: { evenement: "attaqueSupplementaire", usage: { frequence: "1x/tour" }, effets: [{ type: "special", note: "Aucun malus à ce palier." }] },
      } },
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
    { id: "robuste", nom: "robuste", rare: "Réduit de moitié les dégâts de chute", legendaire: "Annule les dégâts de chute",
      mecanique: {
        // fractionReductionChute (cf. lot "armures C") : nécessite la
        // nouvelle valeur "chute" du sélecteur "Subir des dégâts" (distincte
        // de "naturel", cf. subirDegats js/app.js) — sans elle, une chute
        // saisie comme "naturel" générique ne bénéficierait QUE du don
        // Résistance naturelle, jamais de cet affixe.
        rare: { passif: { fractionReductionChute: 0.5 } },
        legendaire: { passif: { fractionReductionChute: 1 } },
      } },
  ],
  cotte_mailles: [
    { id: "renforcee", nom: "renforcée", rare: "Réduit d'1 les dégâts physiques après application de reductionDegats", legendaire: "Réduit de 2 les dégâts physiques après application de reductionDegats",
      mecanique: {
        // bonusReductionPhysique (cf. lot "armures A" — même texte que
        // plaques_comp.impenetrable/armure_guerre_orque.increvable) : lu par
        // Personnage.bonusReductionPhysiqueEquipement() (js/personnage.js),
        // appliqué dans subirDegats (js/app.js) uniquement sur les dégâts
        // typeDegats === "physique", en plus de reductionDegats (l'armure).
        rare: { passif: { bonusReductionPhysique: 1 } },
        legendaire: { passif: { bonusReductionPhysique: 2 } },
      } },
    { id: "cliquetante", nom: "intimidante", rare: "+1 en intimidation", legendaire: "+2 en intimidation, effraie les créatures de faible dangerosité au 1er round",
      mecanique: {
        rare: { passif: { bonusCompetences: { Intimidation: 1 } } },
        legendaire: { passif: { bonusCompetences: { Intimidation: 2 } }, note: "Effraie aussi les créatures de faible dangerosité au 1er round — à arbitrer manuellement." },
      } },
  ],
  demi_plaques: [
    { id: "imposante", nom: "imposante", rare: "+1 DEF contre les attaques à distance", legendaire: "+2 DEF contre les attaques à distance",
      mecanique: {
        // bonusDefDistance (cf. lot "armures B") : lu par _defPjAvecAura
        // uniquement lors de la résolution d'une attaque de type "distance"
        // (arme à distance OU capacité à jetAttaque, jamais de contact),
        // jamais dans la DEF générale affichée.
        rare: { passif: { bonusDefDistance: 1 } },
        legendaire: { passif: { bonusDefDistance: 2 } },
      } },
    { id: "ancree", nom: "ancrée", rare: "Résiste automatiquement à un effet de repoussement par combat", legendaire: "Résiste automatiquement à tout effet de repoussement",
      mecanique: {
        // immuniteEtats (lot "repoussement") : palier légendaire SEUL —
        // immunité permanente, lue par Personnage.aImmuniteEtat("repoussee").
        // Le palier rare ("1 fois par combat") aurait demandé de dupliquer
        // le double-contrôle gate+usage déjà écrit pour "Liberté d'action" à
        // chaque site d'application d'état — laissé en note.
        legendaire: { passif: { immuniteEtats: ["repoussee"] } },
        rare: { note: "1 fois par combat — pas de notion d'usage limité dans aImmuniteEtat (contrairement à Liberté d'action, gérée séparément à chaque site d'application d'état) ; à arbitrer manuellement." },
      } },
  ],
  plaques_comp: [
    { id: "impenetrable", nom: "impénétrable", rare: "Réduit de 1 tout dégât physique après application de reductionDegats", legendaire: "Réduit de 2 tout dégât physique après application de reductionDegats",
      mecanique: {
        // Même mécanique que cotte_mailles.renforcee (texte identique) —
        // cf. bonusReductionPhysique là-bas pour le détail.
        rare: { passif: { bonusReductionPhysique: 1 } },
        legendaire: { passif: { bonusReductionPhysique: 2 } },
      } },
    { id: "ecrasante", nom: "écrasante", rare: "+1 en FOR tant que l'armure est équipée", legendaire: "+2 en FOR tant que l'armure est équipée",
      mecanique: {
        rare: { passif: { bonusCarac: { FOR: 1 } } },
        legendaire: { passif: { bonusCarac: { FOR: 2 } } },
      } },
  ],
  armure_ombre: [
    { id: "furtive", nom: "furtive", rare: "Silhouette indétectable dans l'obscurité totale", legendaire: "Idem, et déplacement totalement silencieux" },
    { id: "drainante", nom: "drainante", rare: "Soigne 1 PV au porteur quand une attaque de contact le manque", legendaire: "Soigne 2 PV au porteur quand une attaque de contact le manque",
      mecanique: {
        // evenement "rateSubie" (cf. lot "armures B") : proc AUTOMATIQUE
        // (pas de choix du joueur) sur une attaque de CONTACT ratée contre
        // le porteur — pas d'usage.frequence dans le texte (aucune limite
        // par combat), lu par _itemSoinRateDisponible/_resoudreAttaqueEtSuite
        // (js/app.js). Portée à la voie principale (arme + capacité à
        // jetAttaque) ; l'attaque d'opportunité de désengagement, résolue
        // hors de cette fonction, n'est pas couverte.
        rare: { evenement: "rateSubie", effets: [{ type: "soin", formule: "1" }] },
        legendaire: { evenement: "rateSubie", effets: [{ type: "soin", formule: "2" }] },
      } },
  ],
  cotte_runique: [
    // "protectrice" reste TEXTE SEUL : cf. la note détaillée sur
    // "protectrice_mithril" (cotte_mithril, lot "armures C") pour la raison —
    // le save concerné par "contre la magie" dépend du sort, jamais fixe.
    { id: "protectrice", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance contre la magie" },
    { id: "reflechissante", nom: "réfléchissante", rare: "1 fois par combat, renvoie 1d4 dégâts magiques subis à l'attaquant", legendaire: "1 fois par combat, renvoie 1d8 dégâts magiques subis à l'attaquant",
      mecanique: {
        rare: { evenement: "subitContact", typeDegats: "magique", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d4", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", typeDegats: "magique", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d8", cible: "attaquant" }] },
      } },
  ],
  armure_ecailles: [
    { id: "glissante", nom: "glissante", rare: "+1 DEF contre les attaques d'opportunité", legendaire: "+2 DEF contre les attaques d'opportunité, jamais pris au dépourvu",
      mecanique: {
        // bonusDefOpportunite (cf. lot "armures B") : lu par _defPjAvecAura
        // uniquement lors de la résolution d'une AO (cf. tenterDesengagement),
        // jamais dans la DEF générale affichée.
        rare: { passif: { bonusDefOpportunite: 1 } },
        legendaire: { passif: { bonusDefOpportunite: 2 }, note: "« Jamais pris au dépourvu » (pas de malus de surprise) — aucune mécanique de surprise automatisée dans l'app, à arbitrer manuellement." },
      } },
    { id: "resistante", nom: "résistante", rare: "Résistance 1 aux dégâts de feu", legendaire: "Résistance 2 aux dégâts de feu",
      mecanique: {
        // Type FIXE ("feu") — cf. Personnage.reductionElementaireEquipement,
        // lu sur le paramètre elementDegats de subirDegats (indépendant du
        // typeDegats physique/magique/naturel/chute).
        rare: { passif: { resistanceElementaire: [{ type: "feu", valeur: 1 }] } },
        legendaire: { passif: { resistanceElementaire: [{ type: "feu", valeur: 2 }] } },
      } },
  ],
  brigandine: [
    { id: "cachee", nom: "dissimulée", rare: "Peut être portée sous des vêtements civils sans être détectée", legendaire: "Idem, + 1 en discrétion" },
    { id: "fiable", nom: "fiable", rare: "Ignore le premier coup critique subi par combat (dégâts normaux à la place)", legendaire: "Ignore les deux premiers coups critiques subis par combat",
      mecanique: {
        // critiqueSubi/annuleCritique (cf. "protectrice", pierre_chance, lot
        // "jour") : même proc automatique (pas de choix du joueur), juste
        // une fréquence différente — 1x/combat au rare, 2x/combat au
        // légendaire (au lieu de 1x/jour puis 1x/combat pour pierre_chance).
        rare: { evenement: "critiqueSubi", usage: { frequence: "1x/combat" }, effets: [{ type: "annuleCritique" }] },
        legendaire: { evenement: "critiqueSubi", usage: { frequence: "2x/combat" }, effets: [{ type: "annuleCritique" }] },
      } },
  ],
  robe_mage: [
    { id: "focalisante", nom: "focalisante", rare: "+1 en INT tant que la robe est équipée", legendaire: "+2 en INT tant que la robe est équipée",
      mecanique: {
        rare: { passif: { bonusCarac: { INT: 1 } } },
        legendaire: { passif: { bonusCarac: { INT: 2 } } },
      } },
    { id: "tissee_de_seve", nom: "tissée de Sève", rare: "+1d6 PV max ; régénère 1 PV par tour hors combat", legendaire: "+2d6 PV max ; régénère 1 PV par tour, même en combat",
      mecanique: {
        // Palier rare : le "+1d6 PV max" est mécanisé (bonusPvMaxDe, infra
        // partagée avec toute future Amulette de santé) ; le "régénère 1 PV
        // par tour hors combat" n'a aucun crochet de tour hors combat dans
        // l'app et reste une note manuelle non automatisée.
        rare: { passif: { bonusPvMaxDe: "1d6" } },
        legendaire: { passif: { bonusPvMaxDe: "2d6", regenCombat: 1 } },
      } },
  ],
  manteau_voyageur: [
    { id: "endurant", nom: "endurant", rare: "+1 case de déplacement", legendaire: "+2 cases de déplacement",
      mecanique: {
        rare: { passif: { bonusDeplacement: 1 } },
        legendaire: { passif: { bonusDeplacement: 2 } },
      } },
    { id: "impermeable", nom: "imperméable", rare: "Immunité aux effets météorologiques mineurs (pluie, froid léger)", legendaire: "Immunité totale aux effets climatiques, y compris magiques" },
  ],
  armure_garde_solvarn: [
    { id: "disciplinee", nom: "disciplinée", rare: "+1 aux jets de moral en groupe", legendaire: "+2 aux jets de moral, immunise contre la Terreur en groupe" },
    { id: "standard", nom: "d'unité", rare: "+1 DEF quand porté aux côtés d'un autre porteur de la même armure", legendaire: "+2 DEF dans les mêmes conditions",
      mecanique: {
        // bonusDefArmureGroupe (lot "précédent armure_garde_solvarn") : lu
        // par Personnage.bonusDefArmureGroupeEquipement() — PREMIER cas où
        // Personnage lit l'équipement d'un AUTRE personnage (via
        // App.chargerPersos(), même pattern déjà utilisé par Combat/
        // Capacites, jamais par Personnage lui-même jusqu'ici).
        rare: { passif: { bonusDefArmureGroupe: 1 } },
        legendaire: { passif: { bonusDefArmureGroupe: 2 } },
      } },
  ],
  armure_druidique: [
    { id: "vivante", nom: "vivante", rare: "Se répare de 1 point de reductionDegats perdu par jour de repos", legendaire: "Se répare intégralement après une nuit de repos" },
    { id: "camouflee", nom: "camouflée", rare: "+1 en discrétion en milieu naturel", legendaire: "+2 en discrétion en milieu naturel, indétectable à l'arrêt",
      mecanique: {
        // "en milieu naturel" abandonné (comme "silencieuse" légendaire —
        // aucun malus/bonus de terrain automatisé dans l'app) : bonus
        // inconditionnel, condition laissée en note.
        rare: { passif: { bonusCompetences: { Discrétion: 1 } }, note: "Bonus normalement limité au milieu naturel — pas de détection de terrain automatisée, appliqué ici sans condition (à arbitrer si hors milieu naturel)." },
        legendaire: { passif: { bonusCompetences: { Discrétion: 2 } }, note: "Idem, + indétectable à l'arrêt — non automatisé, à arbitrer manuellement." },
      } },
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
    { id: "standard", nom: "renforcé", rare: "+1 DEF supplémentaire contre les attaques à distance", legendaire: "+2 DEF supplémentaire contre les attaques à distance",
      mecanique: {
        // Même schéma que "imposante" (demi_plaques, lot "armures B").
        rare: { passif: { bonusDefDistance: 1 } },
        legendaire: { passif: { bonusDefDistance: 2 } },
      } },
    { id: "renvoyeur", nom: "renvoyeur", rare: "Renvoie 1 point de dégâts à l'attaquant au contact", legendaire: "Renvoie 2 points de dégâts à l'attaquant au contact",
      mecanique: {
        rare: { evenement: "subitContact", effets: [{ type: "degats", formule: "1", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", effets: [{ type: "degats", formule: "2", cible: "attaquant" }] },
      } },
  ],
  targe_elfique: [
    // "protectrice" reste TEXTE SEUL : même limite que cotte_runique.protectrice
    // ci-dessus (cf. note détaillée sur cotte_mithril.protectrice_mithril).
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
    { id: "inebranlable", nom: "inébranlable", rare: "Résiste automatiquement à un effet de repoussement par combat", legendaire: "Résiste automatiquement à tout effet de repoussement",
      mecanique: {
        // Même mécanique que "ancree" (demi_plaques) — cf. lot "repoussement".
        legendaire: { passif: { immuniteEtats: ["repoussee"] } },
        rare: { note: "1 fois par combat — pas de notion d'usage limité dans aImmuniteEtat ; à arbitrer manuellement." },
      } },
  ],
  bouclier_rond_nain: [
    { id: "runique", nom: "runique", rare: "1 fois par combat, renvoie 1d4 dégâts subis à l'attaquant", legendaire: "1 fois par combat, renvoie 1d8 dégâts subis à l'attaquant",
      mecanique: {
        rare: { evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d4", cible: "attaquant" }] },
        legendaire: { evenement: "subitContact", usage: { frequence: "1x/combat" }, effets: [{ type: "degats", formule: "1d8", cible: "attaquant" }] },
      } },
    { id: "massif", nom: "massif", rare: "Ignore 1 point de dégâts physiques après application du bonusDEF", legendaire: "Ignore 2 points de dégâts physiques après application du bonusDEF",
      mecanique: {
        // Même champ que "renforcee"/"impenetrable"/"increvable" (lot "armures A").
        rare: { passif: { bonusReductionPhysique: 1 } },
        legendaire: { passif: { bonusReductionPhysique: 2 } },
      } },
  ],
  bouclier_seve: [
    { id: "regenerant", nom: "régénérant", rare: "Soigne 1 PV au porteur à chaque tour où le bouclier bloque une attaque", legendaire: "Soigne 2 PV au porteur dans les mêmes conditions",
      mecanique: {
        // Sibling de "drainante" (armure_ombre, lot "armures B") : même event
        // "rateSubie" (attaque de CONTACT ratée sur le porteur — "bloque"
        // avec un bouclier = rate le porteur), plafonné 1x/tour ("à chaque
        // tour" du texte) au lieu d'illimité comme drainante.
        rare: { evenement: "rateSubie", usage: { frequence: "1x/tour" }, effets: [{ type: "soin", formule: "1" }] },
        legendaire: { evenement: "rateSubie", usage: { frequence: "1x/tour" }, effets: [{ type: "soin", formule: "2" }] },
      } },
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
    { id: "impassibles", nom: "impassibles", rare: "+2 DEF (sans armure/bouclier) ; +1 aux jets de résistance", legendaire: "+3 DEF (sans armure/bouclier) ; +2 aux jets de résistance",
      mecanique: {
        // bonusDefSansArmure (lot "armes/accessoires D") : conditionnel à
        // l'ABSENCE d'armure ET de bouclier, lu directement dans
        // calculerCA() (cf. Personnage.bonusDefSansArmureEquipement) —
        // "+X aux jets de résistance" générique (sans type précisé) reste
        // TEXTE SEUL, même limite que le reste du cluster "jets de résistance"
        // (cf. cotte_runique/targe_elfique.protectrice).
        rare: { passif: { bonusDefSansArmure: 2 } },
        legendaire: { passif: { bonusDefSansArmure: 3 } },
      } },
    { id: "reactifs", nom: "réactifs", rare: "+2 DEF (sans armure/bouclier) ; 1 fois par combat, esquive totalement une attaque de contact", legendaire: "+3 DEF (sans armure/bouclier) ; 2 fois par combat, esquive totalement une attaque de contact",
      mecanique: {
        // bonusDefSansArmure (lot "armes/accessoires D") : même champ
        // qu'"impassibles" ci-dessus — n'était laissé en note QUE parce que
        // ce champ n'existait pas encore au moment d'écrire ce commentaire
        // (cf. le "à arbitrer manuellement" ci-dessous, aujourd'hui caduc).
        // L'esquive reste mécanisée comme avant.
        rare: { passif: { bonusDefSansArmure: 2 }, evenement: "subitAttaque", porteeRequise: "contact", usage: { frequence: "1x/combat" }, effets: [{ type: "esquive" }] },
        legendaire: { passif: { bonusDefSansArmure: 3 }, evenement: "subitAttaque", porteeRequise: "contact", usage: { frequence: "2x/combat" }, effets: [{ type: "esquive" }] },
      } },
  ],
  bottes_vitesse: [
    { id: "fulgurantes", nom: "fulgurantes", rare: "+1 case de déplacement ; 1 fois par combat, double le déplacement pour ce tour", legendaire: "+2 cases de déplacement ; 2 fois par combat, double le déplacement",
      mecanique: {
        // bonusDeplacement (passif, cf. Combat._deplacementMax) + evenement
        // "doublerDeplacement"/effet "doubleDeplacement" (cf. lot "malgré la
        // limite") : DÉCLENCHÉ PAR LE JOUEUR sur son propre tour (bouton
        // dédié dans "Actions du tour", pas une réaction) — usage vérifié
        // par _itemDoubleDeplacementDisponible (js/app.js), qui délègue
        // ensuite à Combat.doublerDeplacement (ajoute _deplacementMax(p) une
        // seconde fois au déplacement restant, sans coût d'action —
        // contrairement à Sprint).
        rare: { passif: { bonusDeplacement: 1 }, evenement: "doublerDeplacement", usage: { frequence: "1x/combat" }, effets: [{ type: "doubleDeplacement" }] },
        legendaire: { passif: { bonusDeplacement: 2 }, evenement: "doublerDeplacement", usage: { frequence: "2x/combat" }, effets: [{ type: "doubleDeplacement" }] },
      } },
    { id: "esquivantes", nom: "esquivantes", rare: "+1 case de déplacement ; +1 DEF contre les attaques d'opportunité", legendaire: "+2 cases de déplacement ; +2 DEF contre les attaques d'opportunité, jamais pris au dépourvu",
      mecanique: {
        rare: { passif: { bonusDeplacement: 1, bonusDefOpportunite: 1 } },
        legendaire: { passif: { bonusDeplacement: 2, bonusDefOpportunite: 2 },
          note: "« Jamais pris au dépourvu » (pas de malus de surprise) — aucune mécanique de surprise automatisée dans l'app, à arbitrer manuellement (même limite que \"glissante\", armure_ecailles)." },
      } },
  ],
  gants_voleur: [
    { id: "silencieux", nom: "silencieux", rare: "+1 Discrétion/Escamotage ; ouvre les serrures simples sans jet", legendaire: "+2 Discrétion/Escamotage ; ouvre les serrures complexes sans jet, désamorce les pièges simples automatiquement",
      mecanique: {
        // Même schéma que "prestes" (ci-dessous) — "ouvre les serrures/
        // désamorce les pièges sans jet" reste descriptif : aucune mécanique
        // de serrure/piège dans l'app (toujours un jet de compétence libre).
        rare: { passif: { bonusCompetences: { Discrétion: 1, Escamotage: 1 } }, note: "Ouvre les serrures simples sans jet — non modélisé, à arbitrer manuellement." },
        legendaire: { passif: { bonusCompetences: { Discrétion: 2, Escamotage: 2 } }, note: "Ouvre les serrures complexes sans jet et désamorce les pièges simples automatiquement — même remarque." },
      } },
    { id: "prestes", nom: "prestes", rare: "+1 Discrétion/Escamotage ; +1 initiative", legendaire: "+2 Discrétion/Escamotage ; +2 initiative, agit en premier au premier tour",
      mecanique: {
        rare: { passif: { bonusCompetences: { Discrétion: 1, Escamotage: 1 }, bonusInitiative: 1 } },
        legendaire: { passif: { bonusCompetences: { Discrétion: 2, Escamotage: 2 }, bonusInitiative: 2 },
          note: "Agit en premier au premier tour — pas de mécanique d'ordre d'initiative forcé, à arbitrer manuellement (même limite déjà notée pour d'autres bonus d'initiative de ce catalogue)." },
      } },
  ],
  anneau_resistance: [
    { id: "renforce", nom: "renforcé", rare: "Résistance 2 au type de dégâts choisi", legendaire: "Résistance 3 au type choisi, immunité aux effets secondaires mineurs de ce type",
      mecanique: {
        // nbChoix:1 — le joueur choisit UN type (feu/froid/chaos/mental/
        // sacré) à l'équipement, cf. js/app.js _resoudreChoixResistanceSiBesoin.
        rare: { passif: { resistanceElementaireEnAttente: { nbChoix: 1, valeur: 2 } } },
        legendaire: { passif: { resistanceElementaireEnAttente: { nbChoix: 1, valeur: 3 } },
          note: "Immunité aux effets secondaires mineurs du type choisi — aucun effet secondaire de ce genre n'est automatisé dans l'app (poison/peur/etc. déjà purement descriptifs), rien à arbitrer de plus." },
      } },
    { id: "polyvalent", nom: "polyvalent", rare: "Résistance 1 à deux types de dégâts au choix", legendaire: "Résistance 2 à deux types de dégâts au choix",
      mecanique: {
        // nbChoix:2 — même choix, mais deux types distincts.
        rare: { passif: { resistanceElementaireEnAttente: { nbChoix: 2, valeur: 1 } } },
        legendaire: { passif: { resistanceElementaireEnAttente: { nbChoix: 2, valeur: 2 } } },
      } },
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
    { id: "vivifiante", nom: "vivifiante", rare: "+1d6 PV max ; régénère 1 PV par tour hors combat", legendaire: "+2d6 PV max ; régénère 1 PV par tour même en combat",
      mecanique: {
        // Sibling exact de "tissée de sève" (robe_mage, lot "armures C") —
        // même infra bonusPvMaxDe/regenCombat, même limite documentée là-bas
        // pour le palier rare ("hors combat", non mécanisé).
        rare: { passif: { bonusPvMaxDe: "1d6" } },
        legendaire: { passif: { bonusPvMaxDe: "2d6", regenCombat: 1 } },
      } },
    { id: "purifiante", nom: "purifiante", rare: "+1d4 PV max ; immunité aux maladies mineures", legendaire: "+1d6 PV max ; immunité totale aux maladies et poisons faibles",
      mecanique: {
        // Immunité maladies/poisons reste descriptive : aucune mécanique de
        // maladie/empoisonnement "passif" dans l'app (le poison existant est
        // toujours un dot posé manuellement par le MJ, jamais une ressource
        // suivie à laquelle s'immuniser).
        rare: { passif: { bonusPvMaxDe: "1d4" }, note: "Immunité aux maladies mineures — non modélisée, à arbitrer manuellement." },
        legendaire: { passif: { bonusPvMaxDe: "1d6" }, note: "Immunité totale aux maladies et poisons faibles — même remarque." },
      } },
  ],
  collier_clarte: [
    { id: "impenetrable", nom: "impénétrable", rare: "Immunisé à la lecture de pensées ; +1 aux jets de résistance mentale", legendaire: "Immunisé à la lecture de pensées ; +2 aux jets de résistance mentale, immunité à la Terreur",
      mecanique: {
        // bonusResistanceMentale (lot "armes/accessoires D") : "mentale" est
        // assez spécifique pour être fixé sur Volonté (cf. Personnage.
        // modSauvegarde), contrairement à "contre la magie" (jamais mécanisé).
        // Immunité lecture de pensées/Terreur reste descriptive : pas de
        // mécanique de télépathie/lecture de pensées dans l'app.
        rare: { passif: { bonusResistanceMentale: 1 }, note: "Immunité à la lecture de pensées — non modélisée, à arbitrer manuellement." },
        legendaire: { passif: { bonusResistanceMentale: 2 }, note: "Immunité à la lecture de pensées et à la Terreur — même remarque." },
      } },
    { id: "voile", nom: "voilé", rare: "Immunisé à la lecture de pensées ; invisible à la divination à courte portée", legendaire: "Immunisé à la lecture de pensées ; invisible à toute divination" },
  ],
  ceinturon_colosse: [
    { id: "ecrasant", nom: "écrasant", rare: "+2 FOR ; +1d4 dégâts avec armes de contact", legendaire: "+3 FOR ; +1d6 dégâts avec armes de contact",
      mecanique: {
        // bonusDegatsContact (cf. "brutale", armure_guerre_orque) : champ
        // partagé, désormais généralisé à tout type d'objet équipé plutôt que
        // restreint aux armures — cf. Personnage.bonusDegatsContactEquipement.
        rare: { passif: { bonusCarac: { FOR: 2 }, bonusDegatsContact: "1d4" } },
        legendaire: { passif: { bonusCarac: { FOR: 3 }, bonusDegatsContact: "1d6" } },
      } },
    { id: "inebranlable", nom: "inébranlable", rare: "+2 FOR ; ne peut être renversé ni repoussé", legendaire: "+3 FOR ; idem, + immunité à l'Étourdissement",
      mecanique: {
        // "ne peut être renversé/repoussé/étourdi" reste descriptif : aucune
        // capacité ou piège de l'app n'inflige "renversee"/"etourdie" de
        // façon automatisée (vérifié — infliction toujours manuelle), donc
        // rien à immuniser concrètement pour l'instant.
        rare: { passif: { bonusCarac: { FOR: 2 } }, note: "Immunité renversement/repoussement — non modélisée (rien ne les inflige automatiquement dans l'app), rien à arbitrer de plus." },
        legendaire: { passif: { bonusCarac: { FOR: 3 } }, note: "Immunité renversement/repoussement/Étourdissement — même remarque." },
      } },
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
    { id: "evanescente", nom: "évanescente", rare: "+1 DEF contre la première attaque ; 1 fois par combat, disparaît de la vue 1 tour (Discrétion totale)", legendaire: "+2 DEF contre la première attaque ; 2 fois par combat, disparaît de la vue 1 tour",
      mecanique: {
        // evenement "disparition" (cf. lot "malgré la limite") : DÉCLENCHÉ
        // PAR LE JOUEUR (bouton dédié, pas une réaction) — pose l'état
        // "invisible" (js/etats.js, déjà défini : "non ciblable tant que le
        // porteur n'a pas lui-même attaqué...") sur SOI-MÊME, même
        // vocabulaire effets[] "etat" que les autres affixes (éblouissant
        // pose "aveuglee" sur l'ATTAQUANT ; ici, pas de cible: "attaquant",
        // l'effet vise le porteur par défaut). +1/+2 DEF contre la première
        // attaque : même limite qu'"insaisissable" ci-dessus (aucun tracker
        // de "première attaque" dans l'app), laissé en note.
        rare: { evenement: "disparition", usage: { frequence: "1x/combat" }, effets: [{ type: "etat", id: "invisible", duree: "1" }],
          note: "+1 DEF contre la première attaque du combat — aucun tracker de \"première attaque\" dans l'app, à arbitrer manuellement." },
        legendaire: { evenement: "disparition", usage: { frequence: "2x/combat" }, effets: [{ type: "etat", id: "invisible", duree: "1" }],
          note: "+2 DEF contre la première attaque du combat — même limite qu'au palier rare, à arbitrer manuellement." },
      } },
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
    { id: "legere_air", nom: "légère comme l'air", rare: "+1 case de déplacement", legendaire: "+2 cases de déplacement",
      mecanique: {
        // Même passif que "endurante" (manteau_voyageur) — cf. lot "armures A".
        rare: { passif: { bonusDeplacement: 1 } },
        legendaire: { passif: { bonusDeplacement: 2 } },
      } },
    { id: "protectrice_mithril", nom: "protectrice", rare: "+1 aux jets de résistance contre la magie", legendaire: "+2 aux jets de résistance, absorbe automatiquement 1 dégât magique par tour",
      mecanique: {
        // "+X aux jets de résistance contre la magie" (rare et le premier
        // segment du légendaire) : reste TEXTE SEUL, cf. note générale sur le
        // cluster "jets de résistance" plus haut dans ce fichier (§ lot
        // "armures C") — Personnage.modSauvegarde n'a aucune notion de "cette
        // sauvegarde est faite contre un effet magique", contrairement à
        // Verdict/Vœu inébranlable (SAG→Volonté fixe) : ici le save concerné
        // dépend du SORT (Reflexes pour une boule de feu, Vigueur pour un
        // poison magique, Volonté pour une charme...), jamais fixe — même
        // limite déjà documentée en dur dans le bloc "Jets de sauvegarde" de
        // la fiche (cf. afficherFiche : "bonus conditionnels (vs magie...) ne
        // sont pas encore chiffrés ici"). amulette_prot
        // (data/loot.js, "+1 à tous les jets de résistance") porte exactement
        // la même limite, non résolue non plus.
        // Le second segment du légendaire (absorption automatique), lui, EST
        // mécanisable : reductionDegats à valeur FLAT plutôt que fraction (cf.
        // "absorbant"), 1x/tour (remis à zéro par Combat._reinitialiserActionsEntree,
        // comme toute autre capacité "1x/tour"), restreint aux dégâts magiques
        // via typeDegats — lu par _reduireDegatsSubisSiDisponible, AVANT subirDegats.
        legendaire: { evenement: "subitContact", typeDegats: "magique", usage: { frequence: "1x/tour" }, effets: [{ type: "reductionDegats", valeur: 1 }] },
      } },
  ],
  armure_ossements: [
    { id: "macabre", nom: "macabre", rare: "+1 en intimidation, effraie les créatures vivantes de faible dangerosité", legendaire: "+2 en intimidation, immunise contre la Terreur",
      mecanique: {
        rare: { passif: { bonusCompetences: { Intimidation: 1 } }, note: "Effraie aussi les créatures vivantes de faible dangerosité — à arbitrer manuellement." },
        legendaire: { passif: { bonusCompetences: { Intimidation: 2 } }, note: "Immunise aussi contre la Terreur — pas d'immunité automatisée pour cet état précis, à arbitrer manuellement." },
      } },
    { id: "drainante_os", nom: "drainante", rare: "Soigne 1 PV au porteur à chaque ennemi tué à moins de 2 cases", legendaire: "Soigne 2 PV au porteur dans les mêmes conditions, + 1d4 PV temporaires",
      mecanique: {
        // ennemiTue (lot "armes/accessoires D") : détecté dans
        // _appliquerDegatsCibleRapide (js/app.js) — passage des PV du
        // monstre de >0 à 0 sur CETTE action, PJ à ≤2 cases (Carte.
        // distanceCasesEntre) — résolu par _declencherEnnemiTue, jamais par
        // _resoudreEffetsDeclencheur.
        rare: { evenement: "ennemiTue", effets: [{ type: "soin", formule: "1" }] },
        legendaire: { evenement: "ennemiTue", effets: [{ type: "soin", formule: "2" }, { type: "pvTemp", formule: "1d4", duree: "finCombat" }] },
      } },
  ],
  armure_guerre_orque: [
    { id: "brutale", nom: "brutale", rare: "+1d4 dégâts avec armes de contact tant que l'armure est équipée", legendaire: "+1d6 dégâts avec armes de contact tant que l'armure est équipée",
      mecanique: {
        rare: { passif: { bonusDegatsContact: "1d4" } },
        legendaire: { passif: { bonusDegatsContact: "1d6" } },
      } },
    { id: "increvable", nom: "increvable", rare: "Ignore 1 point de dégâts physiques après application de reductionDegats", legendaire: "Ignore 2 points de dégâts physiques après application de reductionDegats",
      mecanique: {
        // Même mécanique que cotte_mailles.renforcee (texte identique) —
        // cf. bonusReductionPhysique là-bas pour le détail. Sans lien avec
        // l'état "increvable" (js/etats.js, PV plancher à 1) — collision de
        // nom entre un id d'affixe et un id d'état, deux catalogues distincts.
        rare: { passif: { bonusReductionPhysique: 1 } },
        legendaire: { passif: { bonusReductionPhysique: 2 } },
      } },
  ],
  gants_poing: [
    { id: "percutants", nom: "percutants", rare: "+1 dégâts à mains nues ; ignore 1 point de reductionDegats de la cible", legendaire: "+2 dégâts à mains nues ; ignore 2 points de reductionDegats de la cible",
      mecanique: {
        // ignoreReduction sur "touche" (comme "perforante") : le vocabulaire
        // des déclencheurs n'a aucune notion "mains nues vs arme en main" —
        // s'applique sur tout coup de CONTACT réussi tant que les gants sont
        // équipés, pas uniquement les frappes à mains nues au sens strict.
        rare: { passif: { bonusDegatsMainsNues: 1 }, evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 1 }] },
        legendaire: { passif: { bonusDegatsMainsNues: 2 }, evenement: "touche", effets: [{ type: "ignoreReduction", valeur: 2 }] },
      } },
    { id: "foudroyants", nom: "foudroyants", rare: "+1 dégâts à mains nues ; 1 chance sur 2 d'étourdir la cible 1 tour sur un coup critique", legendaire: "+2 dégâts à mains nues ; étourdit systématiquement la cible 1 tour sur tout coup critique",
      mecanique: {
        // evenement "critique" (jamais exercé jusqu'ici dans ce catalogue) :
        // déjà câblé génériquement par _gererDeclencheursEquipement (proc dès
        // que resolution.critique === true). probabilite (lu génériquement
        // par _resoudreEffetsDeclencheur, AVANT le dispatch par type — même
        // mécanisme que "toxique", poignards_jumeaux) porte le "1 chance sur 2".
        rare: { passif: { bonusDegatsMainsNues: 1 }, evenement: "critique", effets: [{ type: "etat", id: "etourdie", duree: "1", probabilite: 0.5 }] },
        legendaire: { passif: { bonusDegatsMainsNues: 2 }, evenement: "critique", effets: [{ type: "etat", id: "etourdie", duree: "1" }] },
      } },
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
  // seule exception : lu par Personnage.bonusDegatsContactEquipement(),
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
    // "malgré la limite") : ÉCRASE la portée de base de l'arme affixée — pour
    // la francisque (categoriePortee "jet", 1-5 cases de base depuis
    // prompt_portees_armes.md), l'affixe l'étend à 6 cases. N'affecte plus la
    // RECONNAISSANCE comme arme à distance (Personnage.armeDistanceEquipee()
    // s'appuie sur categoriePortee, pas sur la présence de ce champ — toute
    // arme en porte un désormais, cf. normalisation des portées).
    if (passif.porteeMaxCases !== undefined) {
      clone.porteeMaxCases = passif.porteeMaxCases;
      clone.porteeMinCases = passif.porteeMinCases || 0;
    }
    // bonusDeplacement (cf. "fulgurantes", bottes_vitesse, lot "malgré la
    // limite") : même convention additive que bonusDEF/bonusInitiative —
    // lu par Combat._deplacementMax() (js/combat.js), même somme générique
    // sur les items équipés que le don Mobile (+1 case).
    if (passif.bonusDeplacement) clone.bonusDeplacement = (item.bonusDeplacement || 0) + passif.bonusDeplacement;
    // bonusReductionPhysique (cf. "renforcee"/"impenetrable"/"increvable",
    // lot "armures A") : même convention additive — lu par
    // Personnage.bonusReductionPhysiqueEquipement(), jamais fusionné à
    // item.reductionDegats (qui réduit tous les types de dégâts, cf.
    // subirDegats), puisque ce bonus-ci est physique uniquement.
    if (passif.bonusReductionPhysique) clone.bonusReductionPhysique = (item.bonusReductionPhysique || 0) + passif.bonusReductionPhysique;
    // bonusDefDistance/bonusDefOpportunite (cf. "imposante"/"glissante", lot
    // "armures B") : même convention additive — lus par
    // Personnage.bonusDefContreDistance()/bonusDefContreOpportunite(), eux-
    // mêmes lus uniquement par _defPjAvecAura (js/app.js) au moment de
    // résoudre une attaque du type concerné, jamais dans calculerCA().
    if (passif.bonusDefDistance) clone.bonusDefDistance = (item.bonusDefDistance || 0) + passif.bonusDefDistance;
    if (passif.bonusDefOpportunite) clone.bonusDefOpportunite = (item.bonusDefOpportunite || 0) + passif.bonusDefOpportunite;
    // fractionReductionChute (cf. "robuste", armure_cloute, lot "armures C") :
    // seul passif FRACTIONNAIRE (0-1) de ce fichier — pas additif comme les
    // autres (0.5 + 0.5 dépasserait le sens physique d'une "annulation"),
    // simple écrasement par la valeur du palier. Lu par
    // Personnage.fractionReductionChuteEquipement().
    if (passif.fractionReductionChute !== undefined) clone.fractionReductionChute = passif.fractionReductionChute;
    // regenCombat (cf. "tissée de sève", robe_mage, légendaire uniquement,
    // lot "armures C") : additif — lu par Personnage.regenCombatEquipement(),
    // consommé par Combat.tourSuivant() au début du tour du porteur. Le
    // palier rare ("hors combat") n'a aucun crochet de tour hors combat dans
    // l'app (js/repos.js ne gère que le repos long) et reste non mécanisé.
    if (passif.regenCombat) clone.regenCombat = (item.regenCombat || 0) + passif.regenCombat;
    // bonusPvMaxDe (cf. "tissée de sève", lot "armures C" — infra déjà
    // présente côté js/app.js/_resoudreDePvMaxSiBesoin et
    // Personnage.bonusPvEquipement, jamais encore posée par une mécanique de
    // rareté) : dé roulé UNE SEULE FOIS à l'équipement, jamais additif —
    // écrasement direct comme fractionReductionChute.
    if (passif.bonusPvMaxDe) clone.bonusPvMaxDe = passif.bonusPvMaxDe;
    // resistanceElementaire (cf. "résistante", armure_ecailles, type "feu"
    // FIXE — lot "armures C" cluster résistances) : tableau [{type,valeur}],
    // écrasement direct comme fractionReductionChute/bonusPvMaxDe — la somme
    // ENTRE objets équipés se fait côté Personnage.reductionElementaireEquipement,
    // pas ici.
    if (passif.resistanceElementaire) clone.resistanceElementaire = passif.resistanceElementaire;
    // resistanceElementaireEnAttente (cf. "renforcé"/"polyvalent",
    // anneau_resistance — type(s) CHOISI(S) par le joueur, pas fixe) :
    // {nbChoix, valeur}, résolu en resistanceElementaire au premier
    // équipement de CETTE instance (cf. js/app.js
    // _resoudreChoixResistanceSiBesoin), même principe que bonusPvMaxDe.
    if (passif.resistanceElementaireEnAttente) clone.resistanceElementaireEnAttente = passif.resistanceElementaireEnAttente;
    // bonusResistanceMentale/bonusDefSansArmure (cf. "impenetrable"/collier_clarte
    // et "impassibles"/bracelets_defense, lot "armes/accessoires D") : même
    // convention additive que bonusReductionPhysique/bonusDefDistance —
    // entiers, sommés génériquement par Personnage.bonusResistanceMentaleEquipement()/
    // bonusDefSansArmureEquipement().
    if (passif.bonusResistanceMentale) clone.bonusResistanceMentale = (item.bonusResistanceMentale || 0) + passif.bonusResistanceMentale;
    if (passif.bonusDefSansArmure) clone.bonusDefSansArmure = (item.bonusDefSansArmure || 0) + passif.bonusDefSansArmure;
    // immuniteEtats (cf. "ancree"/"inebranlable", légendaire uniquement, lot
    // "repoussement") : tableau d'ids d'état — lu par Personnage.aImmuniteEtat,
    // union (pas de doublon) plutôt qu'écrasement, au cas où deux objets
    // équipés en porteraient chacun un différent.
    if (passif.immuniteEtats) clone.immuniteEtats = Array.from(new Set([...(item.immuniteEtats || []), ...passif.immuniteEtats]));
    // bonusDefArmureGroupe (cf. "standard"/"d'unité", armure_garde_solvarn,
    // lot "précédent armure_garde_solvarn") : même convention additive —
    // entier, lu par Personnage.bonusDefArmureGroupeEquipement().
    if (passif.bonusDefArmureGroupe) clone.bonusDefArmureGroupe = (item.bonusDefArmureGroupe || 0) + passif.bonusDefArmureGroupe;
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
        // Recalibrage équilibrage (cf. equilibrage_bestiaire.pdf) : le bonus
        // de rareté ne touche plus QUE la CA, jamais reductionDegats. La CA
        // est un seuil — elle retire une proportion constante de touches,
        // quel que soit l'attaquant. La réduction est SOUSTRACTIVE : son
        // effet dépend de la taille du coup, et à réduction élevée elle peut
        // ramener à zéro les dégâts d'un monstre de faible dangerosité —
        // elle n'atténue pas la menace, elle efface des paliers entiers du
        // bestiaire. reductionDegats reste donc figée à sa valeur de
        // catalogue, jamais scalée par la rareté de l'exemplaire.
        clone.valeurCA = (item.valeurCA || 10) + bonus;
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
