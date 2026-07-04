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

  // ── Malus continus ─────────────────────────────────────────
  influencee: { nom: "Influencée", categorie: "malus",
    description: "-2 à une caractéristique au choix du lanceur, OU vulnérabilité accrue au prochain test de manipulation." },
  marquee: { nom: "Marquée", categorie: "malus", parSource: true,
    description: "Tag posé par une capacité spécifique. Le bonus dépend TOUJOURS de la source : "
      + "marquee_pretre → +1d6 DM sacrés contre elle ; marquee_chasseur → +1 attaque contre elle. "
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
  ivresse: { nom: "Ivresse", categorie: "malus",
    description: "-1 à tous les tests par point d'Ivresse cumulé (mécanique Barde, voir notes_generales de la classe)." },

  // ── Altérations physiques ponctuelles ──────────────────────
  renversee: { nom: "Renversée", categorie: "physique",
    description: "-4 DEF, à terre ; se relever = action de mouvement (sauf capacité qui l'offre en gratuit)." },
  repoussee: { nom: "Repoussée", categorie: "physique",
    description: "Déplacée d'une distance fixe en ligne droite, sans dégât propre sauf collision." },
  gelee: { nom: "Gelée", categorie: "controle",
    description: "Variante d'Immobilisée par le froid ; résistance testée en DEX si la capacité le prévoit." },
  aveuglee: { nom: "Aveuglée", categorie: "malus",
    description: "Désavantage sur tous les jets d'attaque ; ne peut viser qu'au contact." },
  brulure: { nom: "Brûlure", categorie: "dot",
    description: "1d4 dégâts en début de tour tant que la cible reste dans les flammes / n'éteint pas le feu (action de mouvement pour éteindre)." },
};

const ORDRE_CATEGORIES_ETATS = ["controle", "malus", "dot", "physique"];

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
