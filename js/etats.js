/* ============================================================
   COF-COMPAGNO — Catalogue des états/altérations (buffs/debuffs).
   Référencé par id depuis data/donnees.js (champ mecanique.effets[].id
   de type "etat") et appliqué via js/capacites.js.
   ============================================================ */

const ETATS = {
  // ── États de contrôle ──────────────────────────────────────
  immobilisee: { nom: "Immobilisée", categorie: "controle",
    description: "Ne peut pas se déplacer ; peut attaquer si une cible est à portée." },
  entravee: { nom: "Entravée", categorie: "controle", reserve: true,
    description: "Comme Immobilisée + ne peut pas lancer de sort à composante gestuelle." },
  paralysee: { nom: "Paralysée", categorie: "controle", reserve: true,
    description: "Incapable d'agir ; DEF traitée comme si surprise." },
  etourdie: { nom: "Étourdie", categorie: "controle",
    description: "Perd son action ce tour (pas d'attaque, pas de capacité limitée) ; déplacement normal autorisé." },
  fascinee: { nom: "Fascinée", categorie: "controle",
    description: "Reste immobile, n'agit pas tant que l'effet est maintenu ; brisée par toute attaque/événement brutal." },
  charmee: { nom: "Charmée / Dominée", categorie: "controle",
    description: "Obéit aux ordres du lanceur, refuse le suicidaire ou l'extrême." },
  endormie: { nom: "Endormie", categorie: "controle",
    description: "Inconsciente ; se réveille au premier dégât subi ou manuellement." },
  confuse: { nom: "Confuse", categorie: "controle",
    description: "Attaque une cible aléatoire (alliés compris) à chaque tour où l'effet est actif." },
  effrayee: { nom: "Effrayée (Fuite)", categorie: "controle",
    description: "Doit s'éloigner de la source de peur, ne peut pas l'approcher ni l'attaquer." },
  silencieuse: { nom: "Réduite au silence", categorie: "controle",
    description: "Ne peut lancer aucun sort/capacité à composante vocale." },
  desarmee: { nom: "Désarmée", categorie: "controle", reserve: true,
    description: "Ne peut plus utiliser son arme (attaque au contact ou à distance avec une arme équipée) tant que l'état dure ; les attaques à mains nues, sorts et capacités sans arme restent possibles. Durée en tours fixée par la capacité/le piège qui l'inflige — pas de source actuelle dans le bestiaire ou le catalogue de loot." },
  invisible: { nom: "Invisible", categorie: "controle",
    description: "Non ciblable par une attaque ou une capacité tant que le porteur n'a pas lui-même attaqué ni lancé de capacité offensive. Le déplacement reste normal. L'état est rompu immédiatement dès la première action offensive du porteur, ou à expiration de sa durée." },
  invisible_majeur: { nom: "Invisible (majeure)", categorie: "controle",
    description: "Comme Invisible, mais ne se rompt PAS à la première action offensive du porteur — invisibilité complète jusqu'à expiration de sa durée (Magicien, sort Invisibilité majeure, rang 4)." },

  // ── Malus continus ─────────────────────────────────────────
  influencee: { nom: "Influencée", categorie: "malus",
    description: "-2 à une caractéristique au choix du lanceur, OU vulnérabilité accrue au prochain test de manipulation." },
  marquee: { nom: "Marquée", categorie: "malus", parSource: true,
    description: "Tag posé par une capacité spécifique. Le bonus dépend TOUJOURS de la source : "
      + "marquee_pretre → +1d6 DM sacrés contre elle ; marquee_chasseur → +1 attaque contre elle ; "
      + "marquee_chevalier → +2 attaque et +3 DM pour tout allié qui la frappe ensuite (Chevalier, Voie du commandant rang 5 « Charge collective »). "
      + "Les tags de sources différentes se cumulent ; deux applications de la même source ne se cumulent pas." },
  ralentie: { nom: "Ralentie", categorie: "malus",
    description: "-2 m de déplacement uniquement (ne touche pas la DEF — voir Déstabilisée)." },
  destabilisee: { nom: "Déstabilisée", categorie: "malus",
    description: "-2 DEF uniquement (ne touche pas le déplacement — voir Ralentie)." },
  fatiguee: { nom: "Fatiguée", categorie: "malus",
    description: "-2 à tous les tests, jusqu'au prochain repos long." },
  hallucinee: { nom: "Halluciné", categorie: "malus",
    description: "-2 Perception et -2 Volonté tant que l'effet dure." },
  maudite: { nom: "Maudite", categorie: "dot",
    description: "Dégâts au début de chaque tour, montant défini par la capacité qui l'inflige ; CON pour moitié si précisé par la capacité." },
  empoisonnee: { nom: "Empoisonnée", categorie: "dot",
    description: "Dégâts de poison au début de chaque tour tant que l'effet dure, "
      + "montant/durée fixés par le palier de poison appliqué (cf. Atelier > Alchimie > Poisons). "
      + "Neutralisée immédiatement par un Antidote." },
  ivresse: { nom: "Ivresse", categorie: "malus",
    description: "-1 à tous les tests par point d'Ivresse cumulé (mécanique Barde, voir notes_generales de la classe)." },

  // ── Altérations physiques ponctuelles ──────────────────────
  renversee: { nom: "Renversée", categorie: "physique",
    description: "-4 DEF, à terre ; se relever = action de mouvement (sauf capacité qui l'offre en gratuit)." },
  repoussee: { nom: "Repoussée", categorie: "physique",
    description: "Déplacée d'une distance fixe en ligne droite, sans dégât propre sauf collision." },
  gelee: { nom: "Gelée", categorie: "controle",
    description: "-2 DEF. Ne peut réaliser aucune action (attaque, capacité) ni se déplacer tant que l'effet dure." },
  aveuglee: { nom: "Aveuglée", categorie: "malus",
    description: "Désavantage sur tous les jets d'attaque ; ne peut viser qu'au contact." },
  aveugle_ou_sourd: { nom: "Aveuglé ou Assourdi", categorie: "malus",
    description: "Au choix du lanceur à l'activation : Aveuglé (comme Aveuglée) ou Assourdi (échoue automatiquement tout test reposant sur l'ouïe, ne peut lancer de sort à composante vocale) — Magicien, sort Cécité/Surdité, rang 4." },
  brulure: { nom: "Brûlure", categorie: "dot",
    description: "1d4 dégâts en début de tour tant que la cible reste dans les flammes / n'éteint pas le feu (action de mouvement pour éteindre)." },

  // ── Buffs ───────────────────────────────────────────────────
  sanctuaire_magicien: { nom: "Sanctuaire", categorie: "buff",
    description: "Immunité totale aux dégâts d'origine magique tant que l'état dure (Magicien, Voie de la magie protectrice, rang 5)." },
  sanctuaire_gardien: { nom: "Sanctuaire du gardien", categorie: "buff",
    description: "Régénère des PV en début de tour tant que l'état dure (Druide, Voie du protecteur, rang 5) — cf. formuleSoin, symétrique de formuleDot." },
  forme_chaos_sauvage: { nom: "Forme du chaos sauvage", categorie: "buff",
    description: "Divise par 2 (arrondi inférieur) les dégâts physiques subis tant que l'état dure (Druide, Voie du chaos, rang 5). +4 PV temporaires et attaque naturelle en 2d8 non modélisés — à gérer manuellement." },
  forme_ours: { nom: "Forme animale — Ours", categorie: "buff",
    description: "Druide, Voie des compagnons rang 5 « Forme animale » (choix tank) : +4 DEF, PV temporaires, +1d6 DM (griffes), divise par 2 les dégâts physiques subis tant que l'état dure." },
  forme_loup: { nom: "Forme animale — Loup", categorie: "buff",
    description: "Druide, Voie des compagnons rang 5 « Forme animale » (choix dex/crit) : +2 DEF, +Mod.DEX Initiative, +2 cases de déplacement, +1d4 DM (crocs), critique sur 18-20 au contact tant que l'état dure." },
  avatar_du_chaos: { nom: "Avatar du chaos", categorie: "buff",
    description: "Divise par 2 (arrondi inférieur) les dégâts physiques subis tant que l'état dure (Nécromancien, Voie du chaos, rang 5). +2d6 DM à tous les sorts non modélisé (bonus récurrent) — à ajouter manuellement à chaque jet de dégâts." },
  avatar_du_vide: { nom: "Avatar du Vide", categorie: "buff",
    description: "Divise par 2 (arrondi inférieur) les dégâts physiques subis tant que l'état dure (Magicien, Voie du chaos, rang 5). +2d6 DM à tous les sorts non modélisé (bonus récurrent) — à ajouter manuellement à chaque jet de dégâts." },
  totem_velocite: { nom: "Totem de la vélocité", categorie: "buff",
    description: "Une action de mouvement supplémentaire chaque tour (déplacement doublé) tant que l'état dure (Druide, Voie du shaman, rang 4)." },
  apogee_physique: { nom: "Apogée physique", categorie: "buff",
    description: "Double le modificateur de la caractéristique choisie à Spécimen d'élite tant que l'état dure (Guerrier, Voie de l'élite, rang 5)." },
  maitrise_tactique: { nom: "Maîtrise tactique", categorie: "buff",
    description: "Double la magnitude de Posture de combat (Guerrier, Voie du soldat rang 5), lu par Capacites.resoudreEffet à chaque activation de Posture de combat tant que l'état dure. N'affecte pas le volet 'Combat en phalange' (bonus par allié au contact), qui reste manuel." },
  dechainement: { nom: "Déchaînement", categorie: "buff",
    description: "+4 attaque (posé séparément), +2d6 DM à toutes les attaques au contact (cf. Personnage.bonusDegatsDechainement) tant que l'état dure (Guerrier, Voie du chaos rang 5). Chaque tour, test de Volonté (SAG) diff. 14 ou attaque redirigée vers la créature la plus proche, allié compris (cf. Capacites.decompterEtatsDebutTour/cibleCreaturePlusProche) — application de la redirection manuelle, comme le reste des redirections d'attaque non modélisées." },
  element_actif: { nom: "Élément actif", categorie: "buff",
    description: "Élément choisi à l'activation de Poing élémentaire (Moine, Voie des éléments rang 1), porté dans un champ 'element' dédié (feu/glace/terre/air) — lu par Capacites.resoudreEffet à la prochaine attaque à mains nues touchée : Feu ajoute des dégâts, Glace/Terre/Air appliquent respectivement Gelée/Renversée/-2 attaque à la cible." },
  arme_enchantee: { nom: "Arme enchantée", categorie: "buff",
    description: "+2 attaque (posé séparément) et +1d6 DM magiques (cf. Personnage.bonusDegatsArmeEnchantee) sur l'arme du porteur tant que l'état dure (Enchanteur, Voie de la transfiguration rang 3). Peut être posé sur n'importe quel allié, pas seulement l'Enchanteur." },
  image_decalee: { nom: "Image décalée", categorie: "buff",
    description: "La prochaine attaque réussie contre la cible rate automatiquement (annulation d'un coup — appréciation manuelle, non chiffrée par l'app). Dure 3 tours ou jusqu'à la fin du combat, selon ce qui arrive en premier (cf. Capacites.retirerEtatsFinCombat) — Enchanteur, Voie de l'enchantement, rang 1." },
  elan_commandant: { nom: "Élan du commandant", categorie: "buff",
    description: "+5 cases de déplacement ce tour (cf. Combat._deplacementMax), tant que l'état dure (Chevalier, Voie du commandant rang 5 « Charge collective ») — posé sur TOUS les PJ en combat, pas seulement les alliés en vue (simplification assumée)." },
  avatar_du_pacte: { nom: "Avatar du pacte", categorie: "buff",
    description: "+2d6 DM à toutes les attaques au contact (cf. Personnage.bonusDegatsAvatarPacte) et immunité à la Peur (cf. Personnage.aImmuniteEtat) tant que l'état dure (Chevalier, Voie du chaos rang 5). Le +4 DEF est posé séparément. Contrecoup (perd son action de mouvement au tour suivant) non modélisé." },
  vol: { nom: "Vol", categorie: "buff",
    description: "Peut voler librement tant que l'état dure (Magicien, sort Vol, rang 3)." },
  arme_benie: { nom: "Arme bénie", categorie: "buff",
    description: "+1 attaque et +2 dégâts au contact contre les créatures maléfiques/mortes-vivantes tant que l'état dure (Prêtre, Cercle de la Foi, sort Arme bénie, rang 3) — cf. Personnage.aArmeBenie." },
  increvable: { nom: "Increvable", categorie: "buff",
    description: "Les PV ne peuvent pas descendre sous 1 tant que l'état dure (Prêtre, Voie du chaos rang 5 « Le fléau, c'est moi ! ») — plancher spécial, distinct du KO normal à 0 PV, cf. subirDegats côté app.js." },
  protection_mort: { nom: "Protection contre la mort", categorie: "buff",
    description: "La prochaine fois que la cible tomberait à 0 PV ce combat, elle reste à 1 PV à la place (Prêtre, Cercle de Vie, sort Protection contre la mort, rang 3) — résolution manuelle, non chiffrée." },
  sursaut: { nom: "Sursaut", categorie: "buff",
    description: "Réduite à 0 PV mais encore debout : agit une dernière fois, puis tombe au début de son prochain tour (capacitesSpeciales, évènement \"tombeA0\", cf. Combat._estKO) — distinct de increvable/protection_mort ci-dessus, qui évitent le 0 plutôt que d'y tomber ; ici la créature y tombe et agit quand même. Tout nouveau dégât reçu pendant le sursaut y met fin immédiatement (cf. Carte.appliquerDegatsCombat)." },
  apaise: { nom: "Apaisé", categorie: "controle",
    description: "Ne peut pas attaquer ce tour, sauf en cas de légitime défense (Prêtre, Cercle de la Foi, sort Calme les esprits, rang 2)." },
  heretique: { nom: "Hérétique", categorie: "malus",
    description: "Tout dégât subi par la cible est augmenté de +1d4 (+1d8 si mort-vivante) tant que l'état dure (Prêtre, Cercle de la Foi, sort Voix du jugement, rang 4) — bonus appliqué manuellement à chaque source de dégâts, quelle qu'elle soit." },
  fascinee_illusoire: { nom: "Fascinée (illusion)", categorie: "controle",
    description: "Immobile tant que l'effet est maintenu (Enchanteur, Voie de l'enchantement rang 2 « Fascination ») — motCle 'maintenue', jamais décompté tour par tour. Coûte coutMaintienPP en PP à chaque début de tour du lanceur (cf. Combat._reinitialiserActionsEntree) ; PP insuffisants = état rompu et retiré immédiatement." },
  folie_illusoire: { nom: "Folie illusoire", categorie: "controle",
    description: "Sombre dans la folie et attaque la créature la plus proche (allié compris), sur échec d'une Sauvegarde Volonté (Enchanteur, Voie du chaos rang 3 « Illusion de masse » DD 15, ou rang 4 « Murmure terrifiant » DD 16 sur le palier <16). La redirection d'attaque reste une application manuelle par la table (pas de moteur de ciblage automatique d'attaque adverse dans l'app), même limite que le reste des redirections non modélisées (cf. Rage incontrôlée)." },
  ascension_chaotique: { nom: "Ascension chaotique", categorie: "buff",
    description: "Double tous les modificateurs de caractéristique (cf. Personnage.mod()/_multiplicateurAscension) et +4 à tous les jets d'attaque rapide, tant que l'état dure (Enchanteur, Voie du chaos rang 5, 1x/scénario). Le doublement du pool de PP est posé séparément à l'activation (rempli au nouveau max). Le doublement de PV max est approximé par un gain de PV temporaires égal au pvMax du personnage — cf. commentaire de Capacites.resoudreEffet." },
};

const ORDRE_CATEGORIES_ETATS = ["controle", "malus", "dot", "physique", "buff"];

// Utilitaire : retrouve un état par id, lève une erreur explicite si absent
// (mieux vaut planter tôt que d'afficher "undefined" à la table).
function getEtat(id) {
  const e = ETATS[id];
  if (!e) throw new Error(`État inconnu : "${id}" — vérifier js/etats.js`);
  return e;
}

if (typeof window !== "undefined") {
  window.ETATS = ETATS;
  window.getEtat = getEtat;
}
