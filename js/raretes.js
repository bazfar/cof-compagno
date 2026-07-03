/* ============================================================
   COF-COMPAGNO — Raretés de loot.
   4 paliers, chacun ajoutant +1 au bonus du précédent :
   - Commun      (gris)   : bonus +0 (l'objet du catalogue tel quel)
   - Peu commun  (vert)   : bonus +1
   - Rare        (violet) : bonus +2
   - Légendaire  (doré)   : bonus +3

   Le bonus s'applique différemment selon le type d'item :
   - arme      -> enchantement (dégâts fixes ajoutés au jet, cf. degats
                  inchangé + enchantement, comme les objets nommés du
                  catalogue type "Épée longue +1")
   - armure    -> valeurArmure
   - bouclier  -> bonusDEF
   - accessoire -> le nombre trouvé dans le champ `effet` (ex. "+1 FOR"
                  -> "+3 FOR" en rare). Si l'effet exprime une portée en
                  cases ("6 cases"), elle progresse de 2 cases par palier
                  plutôt que de 1 (ex. bottes : "+1 initiative" en commun
                  peut aussi se lire, en légendaire, comme un vrai bond
                  de mobilité si tu ajustes le libellé de base).
   - consommable -> non concerné par ce système (hors scope, cf. mémoire
                  de conversation) : quantité/puissance différenciées par
                  des items distincts (potion_soin / potion_soin_sup).

   Ne modifie jamais l'item du catalogue : renvoie toujours une COPIE.
   ============================================================ */

const RARETES = [
  { id: "commun",     nom: "Commun",     couleur: "#9c9c9c", bonus: 0 },
  { id: "peu_commun", nom: "Peu commun", couleur: "#2f9e44", bonus: 1 },
  { id: "rare",       nom: "Rare",       couleur: "#8a4fd1", bonus: 2 },
  { id: "legendaire", nom: "Légendaire", couleur: "#a8843a", bonus: 3 },
];

const Raretes = (() => {
  "use strict";

  function trouver(rareteId) {
    return RARETES.find((r) => r.id === rareteId) || RARETES[0];
  }

  // Renforce le champ `effet` d'un accessoire en repérant un motif numérique
  // connu. Ne modifie rien si aucun motif n'est reconnu.
  function _renforcerEffet(effet, bonus) {
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

  // Renvoie une copie de `item` ajustée pour la rareté `rareteId`.
  // Ajoute `rarete`, `rareteNom`, `rareteCouleur` ; `nom` devient le nom
  // affiché avec suffixe "+N" si bonus > 0 (le nom original reste dans
  // `nomBase`).
  function appliquer(item, rareteId) {
    const rarete = trouver(rareteId);
    const bonus = rarete.bonus;
    const clone = Object.assign({}, item, {
      rarete: rarete.id,
      rareteNom: rarete.nom,
      rareteCouleur: rarete.couleur,
      nomBase: item.nom,
    });

    if (bonus === 0) return clone;

    switch (item.type) {
      case "arme":
        clone.enchantement = (item.enchantement || 0) + bonus;
        clone.nom = `${item.nom} +${clone.enchantement}`;
        break;
      case "armure":
        clone.valeurArmure = (item.valeurArmure || 0) + bonus;
        clone.nom = `${item.nom} +${bonus}`;
        break;
      case "bouclier":
        clone.bonusDEF = (item.bonusDEF || 0) + bonus;
        clone.nom = `${item.nom} +${bonus}`;
        break;
      case "accessoire":
        clone.effet = _renforcerEffet(item.effet, bonus);
        clone.nom = `${item.nom} +${bonus}`;
        break;
      default:
        break; // consommable ou type inconnu : pas de bonus
    }
    return clone;
  }

  return { LISTE: RARETES, trouver, appliquer };
})();

if (typeof window !== "undefined") {
  window.RARETES = RARETES;
  window.Raretes = Raretes;
}
