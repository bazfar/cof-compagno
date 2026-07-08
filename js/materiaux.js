/* ============================================================
   COF-COMPAGNO — Matériaux d'armes (loot).

   Axe INDÉPENDANT de la rareté et de l'enchantement — les bonus se
   cumulent (ex. une Épée longue +1, Rare, Enflammée cumule
   bonusDegatsTotal, effetRarete ET degatsFeu).

   Un seul matériau pour l'instant : Feu (3 rangs), applicable à
   n'importe quelle arme du catalogue (type === "arme") au moment de la
   mise en jeu. Architecture ouverte pour de futurs matériaux, mais ne
   PAS ajouter "Acier" (pénétration d'armure) — abandonné, trop fort pour
   le monde d'Arbre-Monde.

   Comme les effets spéciaux de rareté, cet effet est DESCRIPTIF — affiché
   dans l'inventaire et la fiche, pas appliqué automatiquement par le
   lanceur de dés (le joueur/MJ ajoute le dé de feu manuellement, comme
   pour tous les autres effets spéciaux du jeu).
   ============================================================ */

const MATERIAUX = {
  feu: {
    id: "feu",
    nom: "Enflammée",
    rangs: [
      { rang: 1, nom: "enflammée",     degatsFeu: "1d4" },
      { rang: 2, nom: "ardente",       degatsFeu: "1d6" },
      { rang: 3, nom: "incandescente", degatsFeu: "1d8" },
    ],
  },
};

const Materiaux = (() => {
  "use strict";

  function disponiblePour(item) {
    return !!(item && item.type === "arme");
  }
  function trouver(materiauId) {
    return MATERIAUX[materiauId] || null;
  }
  function trouverRang(materiauId, rang) {
    const m = trouver(materiauId);
    if (!m) return null;
    return m.rangs.find((r) => r.rang === rang) || m.rangs[0];
  }

  /**
   * Renvoie une COPIE de `item` avec le matériau appliqué, ou `item`
   * inchangé si materiauId est null/"aucun" ou l'item n'est pas une arme.
   */
  function appliquer(item, materiauId, rang) {
    if (!materiauId || materiauId === "aucun" || !disponiblePour(item)) return item;
    const infoRang = trouverRang(materiauId, rang);
    if (!infoRang) return item;

    const clone = Object.assign({}, item, {
      materiau: materiauId,
      materiauRang: infoRang.rang,
      materiauNom: infoRang.nom,
      degatsFeu: infoRang.degatsFeu,
      materiauEffet: `+${infoRang.degatsFeu} dégâts de feu`,
    });
    clone.nom = `${item.nom} ${infoRang.nom}`;
    return clone;
  }

  return { LISTE: MATERIAUX, disponiblePour, trouver, trouverRang, appliquer };
})();

if (typeof window !== "undefined") {
  window.MATERIAUX = MATERIAUX;
  window.Materiaux = Materiaux;
}
