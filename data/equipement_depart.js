/* ============================================================
   COF-COMPAGNO — Équipement de départ par classe.
   Références par id vers LOOT_CATALOGUE (data/loot.js, généré
   depuis data/loot.json) — ne pas dupliquer les champs de l'item
   ici, uniquement l'id, pour rester synchronisé si le catalogue
   change.

   Volontairement composé UNIQUEMENT d'objets non enchantés
   (enchantement = 0, pas d'accessoire à bonus) : les armes +1/+2
   et accessoires magiques restent des trouvailles de loot en jeu,
   jamais du matériel de départ.

   Slots ciblés (cf. SLOTS_EQUIPEMENT dans js/personnage.js) :
   - arme      -> main_droite (ou main_droite+main_gauche si deuxMains)
   - bouclier  -> main_gauche (null si la classe n'en porte pas)
   - armure    -> torse
   - accessoire -> inventaireListe, PAS un slot d'équipement : un objet de
     Grimoire (manuel_incantation/amulette_benediction, cf.
     prompt_grimoire_v2_emplacements_typ_s.md) suffit à être PORTÉ (dans le
     sac ou équipé, peu importe — cf. Personnage._objetGrimoirePorte) pour
     débloquer les emplacements de sorts hors Voie, donné Commun de base
     aux classes qui en dépendent (magicien/enchanteur/necromancien/pretre)
   - consommables -> inventaireListe (sac, sans effet mécanique tant
     que non utilisés)
   ============================================================ */

const EQUIPEMENT_DEPART = {
  guerrier:     { arme: "epee_longue",  armure: "armure_cuir",       bouclier: "bouclier_acier", consommables: ["potion_soin"] },
  chevalier:    { arme: "lance",        armure: "armure_cuir",       bouclier: "bouclier_acier", consommables: ["potion_soin"] },
  moine:        { arme: "dague",        armure: "manteau_voyageur",  bouclier: null,             consommables: ["potion_soin"] },
  // accessoire : objet de Grimoire (cf. prompt_grimoire_v2_emplacements_typ_s.md,
  // champ grimoireClasses côté data/loot.json) donné COMMUN de base à toute
  // classe en bénéficiant — sans lui, 0 emplacement de sort hors Voie
  // (cf. Personnage.slotsGrimoireParTier). Placé dans l'inventaire (comme
  // les consommables), pas équipé dans un slot : avoir l'objet sur soi
  // suffit, cf. appliquerEquipementDepart (js/app.js).
  // parchemin_benediction/parchemin_charme_mineur/parchemin_trait_de_feu
  // (au lieu du générique "parchemin_sort", qui n'a pas de champ
  // `sortAppris` et ne déclenche donc jamais le bouton "Apprendre") :
  // un sort de rang 1 RÉELLEMENT apprenable dès la création, plutôt qu'un
  // Manuel/Amulette vide dont l'utilité n'est pas évidente au premier
  // coup d'œil. N'importe quel autre sort reste accessible ensuite via le
  // bouton "📖 Apprentissage" de la carte Grimoire (liste complète du
  // catalogue, aucun parchemin requis) ou via un parchemin acheté/trouvé.
  pretre:       { arme: "masse",        armure: "armure_cloute",     bouclier: "bouclier_acier", accessoire: "amulette_benediction", consommables: ["parchemin_benediction", "huile_sainte", "potion_soin", "parchemin_resurrection"] },
  druide:       { arme: "francisque",   armure: "armure_druidique",  bouclier: "bouclier_seve",  consommables: ["antidote", "potion_soin"] },
  magicien:     { arme: "grimoire",     armure: "robe_mage",         bouclier: null,             accessoire: "manuel_incantation", consommables: ["parchemin_trait_de_feu", "potion_soin"] },
  necromancien: { arme: "baton",        armure: "armure_ombre",      bouclier: null,             accessoire: "manuel_incantation", consommables: ["parchemin_trait_de_feu", "potion_soin"] },
  barde:        { arme: "rapiere",      armure: "manteau_voyageur",  bouclier: null,             consommables: ["corde_enchantee", "potion_soin"] },
  enchanteur:   { arme: "dague",        armure: "robe_mage",         bouclier: null,             accessoire: "manuel_incantation", consommables: ["parchemin_charme_mineur", "potion_soin"] },
  chasseur:     { arme: "arc_long",     armure: "armure_ecailles",   bouclier: null,             consommables: ["fumigene", "potion_soin"] },
};

if (typeof window !== "undefined") {
  window.EQUIPEMENT_DEPART = EQUIPEMENT_DEPART;
}
