/*
 * Attitude d'un PNJ envers le groupe (lot S1, décisions de Thomas du
 * 22/10/2026). Source : doc « Refonte classes et magie — cadre »,
 * « Interaction avec les PNJ », amendé le 22/10 après simulation de trois
 * rencontres successives avec le groupe réel.
 *
 * Six crans (13c, échelle redite par Thomas : neutre → connaissance →
 * favorable → allié) :
 *   - par la parole, un PNJ ne dépasse jamais Favorable ;
 *   - Allié ne s'obtient que par un service rendu, que le MJ accorde (17a) ;
 *   - le cran est mémorisé d'une scène à l'autre.
 * Le modificateur s'ajoute au DD social des scènes (15a) : chaque cran
 * compte, et Allié, gagné par les actes, aide vraiment. Il sert au lot S2
 * (scènes jouées) ; S1 l'affiche au MJ seulement (le DD reste caché aux
 * joueurs).
 */

export const CRANS_ATTITUDE = ['hostile', 'mefiant', 'neutre', 'connaissance', 'favorable', 'allie'] as const;
export type CranAttitude = (typeof CRANS_ATTITUDE)[number];

export const NOMS_CRANS: Record<CranAttitude, string> = {
  hostile: 'Hostile',
  mefiant: 'Méfiant',
  neutre: 'Neutre',
  connaissance: 'Connaissance',
  favorable: 'Favorable',
  allie: 'Allié',
};

/** Modificateur du DD social selon le cran (15a). */
export const MOD_DD_ATTITUDE: Record<CranAttitude, number> = {
  hostile: 2,
  mefiant: 1,
  neutre: 0,
  connaissance: -1,
  favorable: -2,
  allie: -3,
};

/** Le plus haut cran qu'atteint la parole, scènes et corrections du MJ comprises (13c). */
export const CRAN_MAX_PAR_LA_PAROLE: CranAttitude = 'favorable';

/**
 * Cran de départ d'un PNJ d'une des factions de la réputation, à sa
 * première rencontre (16a), selon le palier du groupe auprès de sa
 * faction (identifiants de data/reputation.js). Un PNJ sans faction de
 * réputation part de Neutre (4a).
 */
export const DEPART_PAR_PALIER: Record<string, CranAttitude> = {
  nemesis: 'hostile',
  deteste: 'hostile',
  mefiant: 'mefiant',
  neutre: 'neutre',
  reconnu: 'connaissance',
  fiable: 'favorable',
  allie_legendaire: 'allie',
};
