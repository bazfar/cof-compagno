// Socle de référence par dangerosité — cf. equilibrage_bestiaire.pdf §1.
// Issu des médianes mesurées sur les 67 monstres, lissées : la progression
// PV/DEF/ATK était déjà saine, seule l'échelle de dégâts décrochait
// (les PV quadruplent de la dangerosité 1 à 4, les dégâts faisaient ×2,4).
const SOCLE_DANGEROSITE = {
  1: { pv: 15, def: 11, atk: 3, init: 2, dpt: 4 },
  2: { pv: 26, def: 13, atk: 5, init: 3, dpt: 7 },
  3: { pv: 40, def: 15, atk: 7, init: 4, dpt: 11 },
  // ATK relevée aux hauts paliers (+3 par cran au lieu de +2 au-delà de la
  // dangerosité 3) : les CA de personnages progressent plus vite que
  // l'échelle de monstres, mesuré sur la compagnie niveau 6 (CA 11 à 18) —
  // le Prêtre à CA 18 n'était touché qu'une fois sur deux par un Soldat
  // dangerosité 3. Recalibrage du socle uniquement : ne se répercute pas
  // sur les monstres existants (passera par le rapport d'écarts).
  4: { pv: 62, def: 17, atk: 10, init: 5, dpt: 17 },
  5: { pv: 90, def: 19, atk: 13, init: 6, dpt: 25 },
};

// Le rôle est un écart au socle, jamais une échelle parallèle : un monstre
// reste de sa dangerosité quel que soit son rôle. coeffPm traduit le fait
// qu'un Contrôleur ou un Soigneur délivrent moins de menace brute — mesuré
// en simulation, cf. §4 du PDF.
const ROLES_MONSTRE = {
  brute:         { nom: "Brute",         pv: 1.5,  def: -2, atk:  0, init: -1, dpt: 1.25, coeffPm: 1.0 },
  soldat:        { nom: "Soldat",        pv: 1.0,  def:  2, atk:  0, init:  0, dpt: 1.0,  coeffPm: 1.0 },
  escarmoucheur: { nom: "Escarmoucheur", pv: 0.85, def:  0, atk:  0, init:  1, dpt: 1.0,  coeffPm: 1.0 },
  artilleur:     { nom: "Artilleur",     pv: 0.65, def: -1, atk:  1, init:  1, dpt: 1.0,  coeffPm: 0.7 },
  controleur:    { nom: "Contrôleur",    pv: 0.65, def:  0, atk: -1, init:  1, dpt: 0.7,  coeffPm: 0.65 },
  soigneur:      { nom: "Soigneur",      pv: 0.7,  def:  1, atk: -1, init:  0, dpt: 0.7,  coeffPm: 0.65 },
};

const PM_DANGEROSITE = { 1: 10, 2: 20, 3: 40, 4: 80, 5: 160 };

// Budget d'une rencontre sérieuse : consomme environ la moitié des ressources
// et met un à deux personnages à terre.
function budgetRencontre(nbPJ, niveauMoyen) { return 5 * nbPJ * niveauMoyen; }

// Un boss ne s'additionne pas, il concentre la menace : à 80 Pm une
// composition avec boss est plus facile que la référence plate, à 100 Pm
// nettement plus dure. D'où ce coefficient appliqué à la rencontre entière.
const COEFF_BOSS = 1.3;

function coutRencontre(monstres) {
  const brut = monstres.reduce(function (t, m) {
    const r = ROLES_MONSTRE[m.role] || ROLES_MONSTRE.soldat;
    return t + PM_DANGEROSITE[m.dangerosite] * r.coeffPm;
  }, 0);
  const maxD = Math.max.apply(null, monstres.map(function (m) { return m.dangerosite; }));
  const aUnBoss = monstres.some(function (m) { return m.dangerosite === maxD; })
    && monstres.some(function (m) { return m.dangerosite < maxD; });
  return Math.round(brut * (aUnBoss ? COEFF_BOSS : 1));
}
