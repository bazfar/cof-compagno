/*
 * Le Remous du lieu (lot L6.7b, décisions de Thomas du 29/10/2026), repris
 * de la v1 (js/remous.js ; Lore > Chroniques, « La membrane et les
 * Remous »). La jauge appartient au lieu : une par scène.
 *
 * - Les seuils sont cumulés (la jauge ne retombe pas d'elle-même) et se
 *   divisent selon la membrane : épaisse 1, amincie 2, fine 3, déchirée 4.
 *   Le palier 4 déchire la membrane.
 * - 7a : le coefficient de source d'un lanceur suit sa race. Humain, elfe
 *   et nain sont validés ; les trois demi-races gardent les valeurs
 *   proposées en v1 (décision 7a : on les garde).
 * - 8a : les effets des paliers s'appliquent d'office ; les démons sont
 *   immunisés aux dégâts de la Déchirure.
 */

export const SEUILS_REMOUS = [48, 96, 144, 192] as const;

export const MEMBRANES = {
  epaisse: { nom: 'Épaisse', diviseur: 1 },
  amincie: { nom: 'Amincie', diviseur: 2 },
  fine: { nom: 'Fine', diviseur: 3 },
  dechiree: { nom: 'Déchirée', diviseur: 4 },
} as const;
export type Membrane = keyof typeof MEMBRANES;
export const ORDRE_MEMBRANES: readonly Membrane[] = ['epaisse', 'amincie', 'fine', 'dechiree'];

export interface PalierRemous {
  palier: 0 | 1 | 2 | 3 | 4;
  nom: string;
  /** PP de moins par sort (jamais sous 0). */
  coutSorts: number;
  /** Dégâts de plus par cible touchée d'un sort. */
  degatsSorts: number;
  /** PP max de plus pour les lanceurs du lieu. */
  ppMax: number;
  /** Dégâts à tout le lieu, au début de chaque round ; null : aucun. */
  dechirure: string | null;
  /** Ce qui arrive aux démons, pour le MJ. */
  demon: string | null;
}

export const PALIERS_REMOUS: readonly PalierRemous[] = [
  { palier: 0, nom: 'Stable', coutSorts: 0, degatsSorts: 0, ppMax: 0, dechirure: null, demon: null },
  { palier: 1, nom: 'Déchirure', coutSorts: 1, degatsSorts: 2, ppMax: 0, dechirure: null, demon: 'Un démon D1 se manifeste (famille au choix du MJ).' },
  { palier: 2, nom: 'Ouverture', coutSorts: 2, degatsSorts: 4, ppMax: 4, dechirure: '1d6', demon: 'Le démon monte d’un palier.' },
  { palier: 3, nom: 'Marée', coutSorts: 3, degatsSorts: 6, ppMax: 8, dechirure: '2d6', demon: 'Le démon monte d’un palier, et un second démon apparaît.' },
  { palier: 4, nom: 'La Plaie', coutSorts: 4, degatsSorts: 8, ppMax: 12, dechirure: '3d6', demon: 'Le démon atteint son plafond (D4). Le lieu reste déchiré.' },
];

/** 7a : la part des PP d'un sort qui va au Remous, par race (inconnue : 0). */
export const COEFFICIENTS_RACE: Readonly<Record<string, number>> = {
  humain: 1, // puise dans la Mer
  elfe: 0, // la Sève : source Arbre
  nain: 0, // la Pierre : source Arbre
  demi_elfe: 0.5, // proposé en v1, gardé (7a)
  demi_orc: 1, // proposé en v1, gardé (7a)
  demi_gobelin: 1, // proposé en v1, gardé (7a)
};
