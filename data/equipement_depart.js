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
   - accessoire -> premier slot compatible via Personnage.slotsPourType
     (collier pour manuel_incantation/amulette_benediction, cf.
     prompt_grimoire_v2_emplacements_typ_s.md) — objet de Grimoire Commun
     donné de base aux classes qui en dépendent pour apprendre des sorts
     hors Voie (magicien/enchanteur/necromancien/pretre)
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
  // (cf. Personnage.slotsGrimoireParTier). Résolu vers le slot collier via
  // Personnage.slotsPourType, cf. appliquerEquipementDepart (js/app.js).
  pretre:       { arme: "masse",        armure: "armure_cloute",     bouclier: "bouclier_acier", accessoire: "amulette_benediction", consommables: ["huile_sainte", "potion_soin", "parchemin_resurrection"] },
  druide:       { arme: "francisque",   armure: "armure_druidique",  bouclier: "bouclier_seve",  consommables: ["antidote", "potion_soin"] },
  magicien:     { arme: "grimoire",     armure: "robe_mage",         bouclier: null,             accessoire: "manuel_incantation", consommables: ["parchemin_sort", "potion_soin"] },
  necromancien: { arme: "baton",        armure: "armure_ombre",      bouclier: null,             accessoire: "manuel_incantation", consommables: ["parchemin_sort", "potion_soin"] },
  barde:        { arme: "rapiere",      armure: "manteau_voyageur",  bouclier: null,             consommables: ["corde_enchantee", "potion_soin"] },
  enchanteur:   { arme: "dague",        armure: "robe_mage",         bouclier: null,             accessoire: "manuel_incantation", consommables: ["parchemin_sort", "potion_soin"] },
  chasseur:     { arme: "arc_long",     armure: "armure_ecailles",   bouclier: null,             consommables: ["fumigene", "potion_soin"] },
};

if (typeof window !== "undefined") {
  window.EQUIPEMENT_DEPART = EQUIPEMENT_DEPART;
}
