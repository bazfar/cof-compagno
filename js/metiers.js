/* ============================================================
   COF-COMPAGNO — Métiers : moteur générique (XP + rang).

   Ce module ne connaît AUCUN métier en particulier — Cuisine
   (js/cuisine.js) en est un simple appelant, comme un futur forgeron ou
   herboriste le serait. Cf. data/metiers.js pour RANGS_METIER/METIERS.

   Stockage : sur l'objet perso brut, champ p.metiers = { [metierId]: { xp } }
   — créé à la volée au premier gain d'XP, jamais de migration de masse.
   L'XP ne descend JAMAIS : aucun mécanisme d'oubli n'est prévu, décision
   délibérée (comme les usages de capacités, mais sans reset périodique).
   ============================================================ */

const Metiers = (() => {
  "use strict";

  function xp(p, metierId) {
    return (p.metiers && p.metiers[metierId] && p.metiers[metierId].xp) || 0;
  }

  function rang(p, metierId) {
    const x = xp(p, metierId);
    let r = 0;
    RANGS_METIER.forEach((palier) => { if (x >= palier.xpMin) r = palier.rang; });
    return r;
  }

  function titre(p, metierId) {
    const metier = METIERS[metierId];
    if (!metier) return "";
    return metier.titres[rang(p, metierId)] || metier.titres[metier.titres.length - 1];
  }

  // Ajoute n à l'XP du métier (créé à la volée). Ne sauvegarde PAS :
  // l'appelant fait le App.sauverPersos, comme Capacites.verifierUsage.
  function gagnerXp(p, metierId, n) {
    p.metiers = p.metiers || {};
    p.metiers[metierId] = p.metiers[metierId] || { xp: 0 };
    const rangAvant = rang(p, metierId);
    const xpAvant = p.metiers[metierId].xp;
    p.metiers[metierId].xp = xpAvant + n;
    const xpApres = p.metiers[metierId].xp;
    const rangApres = rang(p, metierId);
    return { xpAvant, xpApres, rangAvant, rangApres, montee: rangApres > rangAvant };
  }

  // { actuel, requis, pct } vers le rang suivant, ou null au rang 5 (max).
  function progressionVersRangSuivant(p, metierId) {
    const r = rang(p, metierId);
    const palierActuel = RANGS_METIER.find((pl) => pl.rang === r);
    const palierSuivant = RANGS_METIER.find((pl) => pl.rang === r + 1);
    if (!palierSuivant) return null;
    const x = xp(p, metierId);
    const actuel = x - palierActuel.xpMin;
    const requis = palierSuivant.xpMin - palierActuel.xpMin;
    return { actuel, requis, pct: Math.max(0, Math.min(100, Math.round((actuel / requis) * 100))) };
  }

  return { xp, rang, titre, gagnerXp, progressionVersRangSuivant };
})();

if (typeof window !== "undefined") window.Metiers = Metiers;
