import { noeudVecuParId } from '../../regles';
import { constantes } from '../regles/donnees';

/*
 * Le Vécu en scène (lot S3, décisions de Thomas du 22/10/2026 : 1a à 12a).
 * Quels nœuds jouent pendant une scène, et comment :
 *   - Lire les gens (1a) : option de scène sociale, une fois par scène ;
 *     réussi, le joueur seul apprend le DD du moment et l'intention du PNJ ;
 *   - Homme du peuple (2a) : face à un PNJ du peuple, la scène commence un
 *     cran plus haut (un seul, quel que soit le nombre de porteurs) ;
 *   - Orateur (3a) : face à une foule, ses réussites sociales comptent double ;
 *   - Langue d'argent (4a) : le client du MJ l'applique au premier jet
 *     social raté de 2 ou moins de la scène ;
 *   - Citer le précédent (5a) : face à une autorité, une fois par scène, un
 *     jet de Connaissances (histoire) réussi compte comme une réussite ;
 *   - Levier (6a) : le MJ l'applique (±2 crans pour la scène), un secret ne
 *     sert qu'une fois ;
 *   - Crocheter et Désamorcer (7a) : −1 DD chacun en Escamotage, en
 *     exploration et en enquête ;
 *   - Mémoire eidétique (8a) : une relance après un échec d'INT ou de CHA,
 *     une fois par jour de jeu, c'est-à-dire par séance ;
 *   - Savant et Réseau de rumeurs (9a) : une question au MJ, réponse privée ;
 *   - les autres (10a) : « Capacités du Vécu », utilisées et racontées.
 * Les « 1x/scène » sont comptés dans la scène ; les « 1x/séance » et
 * « 1x/jour » dans `usages` de la fiche, avec la séance (11a).
 */

/** Options du Vécu des nœuds narratifs (10a) et leur décompte : par scène, par jour (séance), ou laissé au MJ. */
export const NARRATIFS: Record<string, 'scene' | 'jour' | 'libre'> = {
  'compagnon-oiseau': 'scene',
  'chemin-de-traverse': 'libre',
  marchander: 'libre',
  dechiffrer: 'libre',
  'premiers-soins': 'libre',
  'remedes-de-terrain': 'libre',
  faconnage: 'jour',
  'transmutation-mineure': 'jour',
  'transmutation-majeure': 'libre',
  identifier: 'libre',
  'murmure-des-morts': 'libre',
};

/** Les nœuds dont la scène a besoin, relevés chez chaque appelé à l'ouverture. */
export const NOEUDS_EN_SCENE: readonly string[] = [
  'lire-les-gens',
  'homme-du-peuple',
  'orateur',
  'langue-d-argent',
  'citer-le-precedent',
  'levier',
  'crocheter',
  'desamorcer',
  'memoire-eidetique',
  'savant',
  ...Object.keys(NARRATIFS),
];

export const nomNoeud = (id: string) => noeudVecuParId.get(id)?.nom ?? id;

/** Compétences d'INT et de CHA : celles que Mémoire eidétique peut relancer (8a). */
export const COMPETENCES_RELANCABLES: ReadonlySet<string> = new Set([...(constantes.competencesParCarac.INT ?? []), ...(constantes.competencesParCarac.CHA ?? [])]);

/** Les nœuds utiles en scène parmi ceux d'un personnage. */
export function noeudsEnScene(possedes: readonly string[]): string[] {
  return possedes.filter((n) => NOEUDS_EN_SCENE.includes(n));
}

/** Clé de `usages` de la fiche pour un « 1x/séance » ou « 1x/jour » (11a). */
export const CLE_HORS_SEANCE = 'hors-seance';
export function dejaUtiliseCetteSeance(usages: Record<string, unknown>, noeud: string, seance: string | undefined): boolean {
  const u = usages[noeud] as { seance?: string } | undefined;
  return !!u && u.seance === (seance ?? CLE_HORS_SEANCE);
}
