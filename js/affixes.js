/* ============================================================
   COF-COMPAGNO — Affixes d'armes (loot).

   Axe INDÉPENDANT de la rareté/variante/matériau, applicable à
   n'importe quelle arme du catalogue — mais, à la différence des
   variantes de rareté (EFFETS_PAR_ITEM, réservées à rare/légendaire),
   disponible dès "Peu commun". Chaque affixe définit un palier par
   rareté (peu_commun/rare/legendaire) ; la rareté choisie détermine
   quel palier s'applique.

   Deux affixes :
   - Aiguisé : abaisse le seuil de critique de l'arme (MÉCANISÉ, cf.
     Personnage.critMinAttaque, qui prend le meilleur seuil entre
     capacités de classe et arme équipée). Le bonus de dégâts SUR
     critique (rare/légendaire) reste DESCRIPTIF (effetAffixe) : comme
     tous les autres effets "sur coup critique" du jeu (cf. raretes.js),
     l'app ne fait pas le lien automatique entre le jet d'attaque et le
     jet de dégâts qui suit.
   - Folie : bonus de dégâts FIXE à chaque coup, MÉCANISÉ (ajouté à la
     formule de dégâts affichée, cf. bonusDegatsAffixe dans app.js). Le
     risque de Confusion sur une attaque manquée reste DESCRIPTIF :
     l'app ne résout pas touché/manqué contre la DEF d'une cible.
   ============================================================ */

const AFFIXES_ARMES = {
  aiguise: {
    id: "aiguise",
    nom: "Aiguisé",
    paliers: {
      peu_commun: { critMin: 19, suffixe: "aiguisé", texte: "Critique sur 19-20." },
      rare:       { critMin: 19, degatsCritique: "1d6", suffixe: "aiguisé", texte: "Critique sur 19-20. +1d6 dégâts sur un coup critique." },
      legendaire: { critMin: 18, degatsCritique: "1d8", suffixe: "aiguisé", texte: "Critique sur 18-20. +1d8 dégâts sur un coup critique." },
    },
  },
  folie: {
    id: "folie",
    nom: "Folie",
    paliers: {
      peu_commun: { bonusDegats: "1d4", suffixe: "de la folie", texte: "+1d4 dégâts. Sur une attaque manquée : Confus·e jusqu'à la fin du prochain tour (risque de frapper un allié)." },
      rare:       { bonusDegats: "1d6", suffixe: "de la folie", texte: "+1d6 dégâts. Sur une attaque manquée : Confus·e jusqu'à la fin du prochain tour (risque de frapper un allié)." },
      legendaire: { bonusDegats: "1d8", suffixe: "de la folie", texte: "+1d8 dégâts. Sur une attaque manquée : Confus·e jusqu'à la fin du prochain tour (risque de frapper un allié)." },
    },
  },
};

const Affixes = (() => {
  "use strict";

  const ORDRE_RARETE = ["commun", "peu_commun", "rare", "legendaire"];

  function disponiblePour(item) {
    return !!(item && item.type === "arme");
  }
  function trouver(affixeId) {
    return AFFIXES_ARMES[affixeId] || null;
  }

  // Palier effectif d'un affixe pour une rareté donnée : le palier défini le
  // plus haut parmi ceux ≤ rareteId (ex. rareteId "legendaire" mais l'affixe
  // ne définit que peu_commun/rare -> retombe sur "rare"). null si rareteId
  // est en-dessous du plus bas palier défini (ex. "commun").
  function _palierEffectif(affixe, rareteId) {
    const idxRarete = ORDRE_RARETE.indexOf(rareteId);
    if (idxRarete < 0) return null;
    let meilleur = null;
    Object.keys(affixe.paliers).forEach((palierId) => {
      const idxPalier = ORDRE_RARETE.indexOf(palierId);
      if (idxPalier >= 0 && idxPalier <= idxRarete && (meilleur === null || idxPalier > ORDRE_RARETE.indexOf(meilleur))) {
        meilleur = palierId;
      }
    });
    return meilleur;
  }

  /**
   * Renvoie une COPIE de `item` avec l'affixe appliqué, ou `item` inchangé si
   * affixeId est null/"aucun", l'item n'est pas une arme, ou la rareté choisie
   * est trop basse pour cet affixe (ex. "commun").
   */
  function appliquer(item, affixeId, rareteId) {
    if (!affixeId || affixeId === "aucun" || !disponiblePour(item)) return item;
    const affixe = trouver(affixeId);
    if (!affixe) return item;
    const palierId = _palierEffectif(affixe, rareteId);
    if (!palierId) return item;
    const palier = affixe.paliers[palierId];

    const clone = Object.assign({}, item, {
      affixe: affixeId,
      affixeNom: affixe.nom,
      effetAffixe: palier.texte,
    });
    if (palier.critMin !== undefined) clone.critMin = palier.critMin;
    if (palier.bonusDegats) clone.bonusDegatsAffixe = palier.bonusDegats;
    clone.nom = `${item.nom} ${palier.suffixe}`;
    return clone;
  }

  return { LISTE: AFFIXES_ARMES, disponiblePour, trouver, appliquer };
})();

if (typeof window !== "undefined") {
  window.AFFIXES_ARMES = AFFIXES_ARMES;
  window.Affixes = Affixes;
}
