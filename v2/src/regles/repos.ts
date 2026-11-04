/*
 * Le repos (lot L7.1a, décisions de Thomas du 29/10/2026), repris de la v1
 * (js/repos.js, data/repos.js) sans la cuisine ni le marché, qui ne sont
 * pas encore migrés.
 *   - 2a : repos court : 1d4 PV, +25 % des PP max (arrondi au supérieur),
 *     les ressources de classe « repos court » pleines ;
 *   - 3a : repos long : un dé de vie par tranche de deux niveaux, + mod CON,
 *     + le dé du couchage ; PP, Sacré et ressources de classe pleins ; le
 *     Remous du lieu vidé. Sans coût en pièces ni Fatiguée tant que la
 *     cuisine n'est pas migrée ;
 *   - 5b : 2 repos courts au plus entre deux repos longs.
 */

/** Le couchage du repos long (v1 : data/repos.js, PALIERS_AUBERGE) ; le camp n'a pas de dé. */
export const COUCHAGES = [
  { id: 'camp', nom: 'Camp (hors ville)', de: null },
  { id: 'dortoir', nom: 'Dortoir', de: '1d4' },
  { id: 'chambre_privee', nom: 'Chambre privée', de: '1d6' },
  { id: 'luxe', nom: 'Luxe', de: '1d8' },
] as const;
export type Couchage = (typeof COUCHAGES)[number]['id'];

export const DE_REPOS_COURT = '1d4';
/** La part des PP max qu'un repos court rend (arrondie au supérieur). */
export const PART_PP_REPOS_COURT = 0.25;
export const REPOS_COURTS_MAX = 2;
