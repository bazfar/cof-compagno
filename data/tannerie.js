/* ============================================================
   COF-COMPAGNO — Métier Tannerie : agents, cuirs, recettes.

   Chaîne : peau brute (champ `peau` des espèces de traque) → cuir
   tanné (jet 1, qualité = tier du cuir) → objet fini (jet 2, qualité
   = RARETÉ de l'objet). Le cuir tanné joue pour le second jet le rôle
   que l'encre joue pour le Scribe : un matériau dont la qualité est
   un bonus, pas une puissance.

   ── Pourquoi la progression passe par la rareté ────────────────
   Les armures sont verrouillées par palier (cuir CA 12/1, clouté CA
   13/2, mailles CA 14/3 …). Un tanneur ne peut pas produire mieux que
   du cuir clouté sans casser cette échelle : le cuir ne devient pas de
   l'acier. Mais js/raretes.js ajoute bonusRarete à valeurCA ET à
   reductionDegats pour les armures — un cuir clouté peu commun vaut
   donc CA 14/réd. 3, soit une cotte de mailles, sans en être une.
   C'est le PREMIER usage du système de rareté par un joueur plutôt que
   par le MJ. Ne pas "corriger" ça en donnant au tanneur accès aux
   paliers supérieurs : ce serait casser deux systèmes à la fois.
   ============================================================ */

// ── Agents de tannage ────────────────────────────────────────
// Trois voies historiques réelles. Le bonus n'est PAS un bonus au jet
// (contrairement à l'encre du Scribe) : c'est un plafond sur le tier de
// cuir atteignable, parce qu'un tannage au sel ne donnera jamais un
// cuir d'exception quel que soit le talent du tanneur.
const AGENTS_TANNAGE = [
  { id: "sel_gemme",     tierMax: 0, note: "Tannage au sel : rapide, raide, suffisant." },
  { id: "tanin_ecorce",  tierMax: 1, note: "Tannage végétal : lent, souple, le standard des ateliers." },
  { id: "cervelle",      tierMax: 2, note: "Tannage à la cervelle : le plus souple qui existe, et le plus salissant." },
];

// `cervelle` plutôt qu'`urine` : les deux sont historiquement exactes
// (brain-tanning et tannage à l'urine sont tous deux attestés), la
// première est plus présentable dans une UI que sept joueurs regardent.
// Décision de Thomas, ne pas "compléter" avec l'autre.

// ── Tiers de cuir tanné ──────────────────────────────────────
// Bonus au SECOND jet (assemblage), plafonné par l'agent utilisé.
const TIERS_CUIR = [
  { id: "cuir_commun",     bonus: 0 },
  { id: "cuir_fin",        bonus: 1 },
  { id: "cuir_exception",  bonus: 2 },
];

// ── Recettes ─────────────────────────────────────────────────
// rang → difficulte = 10 + 2 × rang (cf. Alchimie, Musicien, Scribe).
// produit : id d'un item EXISTANT du catalogue, sauf pour les cuirs et
// vélins créés par ce chantier.
// rarete : true = la qualité du jet détermine la rareté via
//          Raretes.appliquer ; false = objet toujours commun.
const RECETTES_TANNERIE = [
  // ── Tannage (jet 1) ────────────────────────────────────────
  { id: "tannage", nom: "Tanner une peau", rang: 1, etape: "tannage",
    produit: null,  // déterminé par le tier atteint
    intrants: [{ slot: "peau" }, { slot: "agent" }],
    description: "Trois jours au bain, puis on gratte. La peau devient du cuir ou ne devient rien." },

  // ── Assemblage (jet 2) ─────────────────────────────────────
  { id: "velin_commun_t", nom: "Vélin commun", rang: 1, etape: "assemblage",
    produit: "velin_commun", cuirs: 1, rarete: false,
    description: "Fendu fin, poncé, tendu. Le scribe n'en demande pas plus." },

  { id: "velin_fin_t", nom: "Vélin fin", rang: 2, etape: "assemblage",
    produit: "velin_fin", cuirs: 2, rarete: false,
    tierCuirMin: 1,
    description: "Assez lisse pour qu'une plume n'accroche pas une seule fois." },

  { id: "bordure_rondache", nom: "Border une rondache", rang: 1, etape: "assemblage",
    produit: "rondache", cuirs: 1, rarete: true,
    description: "Le bois seul éclate. Bordé de cuir, il plie." },

  { id: "outre", nom: "Outre de peau", rang: 1, etape: "assemblage",
    produit: "outre_eau", cuirs: 1, rarete: false,
    description: "Cousue, poissée, étanche. On ne pense à elle que quand elle manque." },

  { id: "doublure_duvet", nom: "Doublure de duvet", rang: 2, etape: "assemblage",
    produit: "doublure_duvet", cuirs: 1, duvets: 2, rarete: false,
    description: "Deux couches de cuir, du duvet entre les deux. Le registre froid devient tenable." },

  { id: "armure_cuir_t", nom: "Armure de cuir", rang: 2, etape: "assemblage",
    produit: "armure_cuir", cuirs: 3, rarete: true,
    description: "Plastron, épaulières, jambières. Trois peaux de chevreuil, ou une de cerf." },

  { id: "armure_cloute_t", nom: "Cuir clouté", rang: 3, etape: "assemblage",
    produit: "armure_cloute", cuirs: 4, clous: 1, rarete: true,
    tierCuirMin: 1,
    description: "Le cuir seul cède au tranchant. Les rivets le tiennent." },
];

// ── Qualité du jet d'assemblage → rareté de l'objet ──────────
// Décision de Thomas (Q4a). La qualité NE plafonne PAS par le rang :
// un tanneur rang 2 qui sort un 20 naturel produit un objet rare. Ça
// arrive rarement et ça doit rester une histoire qu'on raconte.
const RARETE_PAR_QUALITE = {
  desastre: null,          // objet perdu, cuirs perdus, aléa
  rate:     null,          // objet perdu, cuirs perdus
  mediocre: null,          // cuir gâché : les cuirs sont perdus, rien produit
  reussi:   "commun",
  bien:     "peu_commun",
  chef:     "rare",
};

// ── Table des aléas (d20), désastre uniquement ───────────────
// Patron ALEAS_SCRIBE, adapté aux deux ressources propres à ce métier :
// pas de PP (le tanneur n'en dépense pas, cf. js/tannerie.js §1) mais un
// quota de tentatives/jour — "ppSupplementaires"/"ppRendus" y deviennent
// donc "quotaSupplementaire"/"quotaRendu", même idée sur une autre jauge.
// Volontairement plus court et plus concret que ALEAS_RECOLTE : on gâche
// une peau ou un point de couture, on ne se perd pas en forêt. Les trois
// entrées narratives (16, 18, 19) n'appliquent rien et sont des amorces
// pour le MJ — c'est ce qui a le mieux marché sur la Traque.
const ALEAS_TANNERIE = [
  { d: 1,  id: "bain_renverse", nom: "Bain renversé",
    effet: { type: "perteMateriel", tout: true },
    texte: "La cuve se renverse d'un coup de coude. Trois jours de trempe, et plus une goutte pour recommencer." },
  { d: 2,  id: "peau_pourrie", nom: "Peau qui pourrit", effet: { type: "rien" },
    texte: "Elle a trop attendu avant le bain. Il n'en reste qu'une odeur." },
  { d: 3,  id: "couture_lache", nom: "Couture qui lâche", effet: { type: "rien" },
    texte: "Le fil cède au premier tour de poinçon. Tout est à recoudre — et il n'y a plus rien à recoudre." },
  { d: 4,  id: "alene_main", nom: "Alène dans la main",
    effet: { type: "degats", formule: "1d4" },
    texte: "Le poinçon dérape sur le cuir mouillé et trouve la paume." },
  { d: 5,  id: "cuir_retracte", nom: "Cuir qui se rétracte",
    effet: { type: "malusProchain", valeur: 2 },
    texte: "Séché trop vite, il s'est tordu. La prochaine peau prendra le même mauvais pli si la main ne se corrige pas." },
  { d: 6,  id: "odeur_tenace", nom: "Odeur tenace",
    effet: { type: "malusSocial", valeur: 2, duree: "jusqu'au prochain repos" },
    texte: "Elle ne part pas au lavage. Elle annonce le tanneur avant lui." },
  { d: 7,  id: "poincon_glisse", nom: "Rature", effet: { type: "rien" },
    texte: "Le poinçon glisse sur une veine plus dure que prévu. Rien de grave, rien d'utile non plus." },
  { d: 8,  id: "mauvaise_prise", nom: "Mauvaise prise", effet: { type: "rien" },
    texte: "Le cuir a tourné entre les mains au mauvais moment." },
  { d: 9,  id: "fil_casse", nom: "Fil cassé", effet: { type: "rien" },
    texte: "Le fil de couture rend l'âme à mi-ouvrage." },
  { d: 10, id: "doute", nom: "Doute", effet: { type: "rien" },
    texte: "Est-ce le bon sens du grain ? Trop tard pour vérifier." },
  { d: 11, id: "interruption", nom: "Interruption", effet: { type: "rien" },
    texte: "Quelqu'un est entré. La concentration ne revient pas." },
  { d: 12, id: "lumiere", nom: "Mauvaise lumière", effet: { type: "rien" },
    texte: "On a travaillé trois heures à la chandelle pour rien voir de ce qui comptait." },
  { d: 13, id: "recuperation_agent", nom: "Récupération",
    effet: { type: "materielSauve" },
    texte: "Raté, mais l'agent de tannage est encore bon. On recommencera avec." },
  { d: 14, id: "recuperation_cuir", nom: "Récupération",
    effet: { type: "materielSauve" },
    texte: "Le résultat est gâché, pas toute la réserve. Il en sortira encore quelque chose." },
  { d: 15, id: "jour_gagne", nom: "Jour gagné",
    effet: { type: "quotaRendu" },
    texte: "Le geste a été plus rapide que prévu. La tentative ne compte pas." },
  { d: 16, id: "marque_fer", nom: "Marque au fer", effet: { type: "info" },
    texte: "Sous le poil, une marque au fer que la bête portait déjà. Le MJ décide de qui." },
  { d: 17, id: "lecon", nom: "Leçon", effet: { type: "xpBonus", valeur: 3 },
    texte: "On a compris pourquoi ça ratait. C'est déjà ça." },
  { d: 18, id: "fleche_fichee", nom: "Flèche encore fichée", effet: { type: "info" },
    texte: "La pointe était restée sous la peau. Le MJ décide d'où elle vient." },
  { d: 19, id: "pas_la_bonne_bete", nom: "Pas la bonne bête", effet: { type: "info" },
    texte: "Cette peau ne correspond pas à ce qui a été chassé. Le MJ décide de ce qu'elle est vraiment." },
  { d: 20, id: "rattrapage", nom: "Rattrapage",
    effet: { type: "requalification", qualiteId: "mediocre" },
    texte: "Sauvé au dernier grattage, mais le résultat reste médiocre." },
];

if (typeof window !== "undefined") {
  window.AGENTS_TANNAGE = AGENTS_TANNAGE;
  window.TIERS_CUIR = TIERS_CUIR;
  window.RECETTES_TANNERIE = RECETTES_TANNERIE;
  window.RARETE_PAR_QUALITE = RARETE_PAR_QUALITE;
  window.ALEAS_TANNERIE = ALEAS_TANNERIE;
}
