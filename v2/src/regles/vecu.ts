import type { NoeudVecuSaisi } from '../lib/schemas/vecu';

/*
 * L'arbre du Vécu (lot L4.18). Source : doc « Refonte classes et magie —
 * cadre », « Arbre du Vécu — première version (validée) » : 33 nœuds,
 * trois branches (Social, Exploration, Savoir) et trois nœuds de
 * croisement, repris tels quels (effet, cible, valeur, condition, usage,
 * prérequis).
 *
 * Règles (validé) : tier 1 libre ; tier 2 = 2 points déjà mis dans la
 * branche ; tier 3 = 4 points ; bonus à +1, porté à +2 par le nœud de
 * tier supérieur de la même ligne (Éloquence, Savant). Filature donne +2
 * d'emblée (valeur du tableau).
 *
 * Décisions de Thomas du 22/10/2026 : 3a (le nœud offert compte dans sa
 * branche ; un nœud choisi est définitif, seul le MJ le retire), 4a (nœud
 * offert d'office selon la classe), 6a (les bonus de compétence
 * s'additionnent sur la fiche ; le reste est montré en texte).
 * Choix du lot, à valider : Endurci reste en texte, car le tableau limite
 * son +1 aux jets de CON contre la fatigue, la faim et la marche forcée.
 */

const permanent = 'Permanent';

/** Cadre des rituels de transmutation (validé), rappelé sur leurs nœuds. */
export const CADRE_DES_RITUELS =
  'Hors combat seulement ; matière non magique, jamais un objet porté ou tenu par une créature ; ne crée jamais de valeur (ni métal précieux, ni gemme, ni matériau de métier rare) ; jet de Connaissances (arcanes) : DD 12 (Façonnage), 14 (mineure), 16 (majeure), un échec gâche la matière ; les lieux et objets protégés (sceaux, magie, Remous) résistent.';

export const NOEUDS_VECU: NoeudVecuSaisi[] = [
  // ---- Social ----
  {
    id: 'affable',
    nom: 'Affable',
    branche: 'social',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Persuasion', valeur: '+1', condition: 'Dialogue pour obtenir une information', usage: permanent }],
    calcul: { competences: ['Persuasion'], bonus: 1 },
  },
  {
    id: 'beau-parleur',
    nom: 'Beau parleur',
    branche: 'social',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Persuasion, Bluff', valeur: '+1', condition: 'Persuader, convaincre, séduire en dialogue', usage: permanent }],
    calcul: { competences: ['Persuasion', 'Bluff'], bonus: 1 },
  },
  {
    id: 'lire-les-gens',
    nom: 'Lire les gens',
    branche: 'social',
    tier: 1,
    effets: [{ effet: 'optionScene', cible: 'Discernement contre Bluff du PNJ', valeur: 'Révèle son cran d’attitude et son intention', condition: 'Face à un PNJ', usage: '1x/PNJ par scène' }],
  },
  {
    id: 'marchander',
    nom: 'Marchander',
    branche: 'social',
    tier: 1,
    effets: [{ effet: 'optionScene', cible: 'Persuasion contre DD du marchand', valeur: 'Prix −10 %, ou un service au lieu de payer', condition: 'Achat ou vente', usage: '1x/transaction' }],
  },
  {
    id: 'homme-du-peuple',
    nom: 'Homme du peuple',
    branche: 'social',
    tier: 2,
    effets: [{ effet: 'attitude', cible: 'PNJ du peuple', valeur: '+1 cran au début de la scène', condition: null, usage: permanent }],
  },
  {
    id: 'eloquence',
    nom: 'Éloquence',
    branche: 'social',
    tier: 2,
    prerequis: ['beau-parleur'],
    effets: [{ effet: 'bonusCompetence', cible: 'Beau parleur', valeur: 'Passe à +2', condition: 'Comme Beau parleur', usage: permanent }],
    calcul: { competences: ['Persuasion', 'Bluff'], bonus: 1 },
  },
  {
    id: 'reseau-de-rumeurs',
    nom: 'Réseau de rumeurs',
    branche: 'social',
    tier: 2,
    prerequis: ['affable'],
    effets: [{ effet: 'information', cible: 'Question au MJ sur un PNJ ou un lieu', valeur: '1 réponse', condition: 'En ville', usage: '1x/séance' }],
  },
  {
    id: 'orateur',
    nom: 'Orateur',
    branche: 'social',
    tier: 2,
    prerequis: ['beau-parleur'],
    effets: [{ effet: 'reussite', cible: 'Réussite sociale', valeur: 'Compte double', condition: 'Face à une foule ou un groupe', usage: permanent }],
  },
  {
    id: 'langue-d-argent',
    nom: 'Langue d’argent',
    branche: 'social',
    tier: 3,
    effets: [{ effet: 'reussite', cible: 'Jet social raté', valeur: 'Échec de 2 ou moins → réussite', condition: 'Scène sociale', usage: '1x/scène' }],
  },
  {
    id: 'levier',
    nom: 'Levier',
    branche: 'social',
    tier: 3,
    prerequis: ['reseau-de-rumeurs'],
    effets: [{ effet: 'attitude', cible: 'PNJ dont un secret est connu', valeur: '±2 crans', condition: 'Le secret est utilisé, donc consommé', usage: '1x/secret' }],
  },

  // ---- Exploration ----
  {
    id: 'pisteur',
    nom: 'Pisteur',
    branche: 'exploration',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Survie, Discrétion', valeur: '+1', condition: 'En extérieur', usage: permanent }],
    calcul: { competences: ['Survie', 'Discrétion'], bonus: 1 },
  },
  {
    id: 'acrobate',
    nom: 'Acrobate',
    branche: 'exploration',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Acrobaties, Athlétisme', valeur: '+1', condition: 'Équilibre, saut, escalade', usage: permanent }],
    calcul: { competences: ['Acrobaties', 'Athlétisme'], bonus: 1 },
  },
  {
    id: 'oeil-du-fouilleur',
    nom: 'Œil du fouilleur',
    branche: 'exploration',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Perception', valeur: '+1', condition: 'Détection de pièges et passages', usage: permanent }],
    calcul: { competences: ['Perception'], bonus: 1 },
  },
  {
    id: 'crocheter',
    nom: 'Crocheter',
    branche: 'exploration',
    tier: 1,
    effets: [{ effet: 'reductionDD', cible: 'Escamotage', valeur: '−1 DD', condition: 'Serrures et mécanismes', usage: permanent }],
  },
  {
    id: 'premiers-soins',
    nom: 'Premiers soins',
    branche: 'exploration',
    tier: 1,
    effets: [{ effet: 'soin', cible: 'Médecine DD 12', valeur: 'Stabilise un allié à 0 PV ; hors combat, soigne 1d4', condition: null, usage: '1x/repos par allié' }],
  },
  {
    id: 'desamorcer',
    nom: 'Désamorcer',
    branche: 'exploration',
    tier: 2,
    prerequis: ['oeil-du-fouilleur'],
    effets: [{ effet: 'reductionDD', cible: 'Escamotage', valeur: '−1 DD', condition: 'Piège détecté', usage: permanent }],
  },
  {
    id: 'flair-du-tresor',
    nom: 'Flair du trésor',
    branche: 'exploration',
    tier: 2,
    prerequis: ['oeil-du-fouilleur'],
    effets: [
      {
        effet: 'information',
        cible: 'Trésor non découvert le plus proche',
        valeur: 'Une direction (« par là, à droite »), sans distance ni garantie sur ce qui le garde',
        condition: 'Dans un lieu exploré (donjon, ruine, bâtiment)',
        usage: '1x/lieu',
      },
    ],
  },
  {
    id: 'endurci',
    nom: 'Endurci',
    branche: 'exploration',
    tier: 2,
    effets: [
      { effet: 'bonusCarac', cible: 'Jets de CON', valeur: '+1', condition: 'Fatigue, faim, marche forcée', usage: permanent },
      { effet: 'reductionDegats', cible: 'Dégâts de froid, chaleur, chute, poison', valeur: '−2 dégâts', condition: null, usage: permanent },
    ],
  },
  {
    id: 'compagnon-oiseau',
    nom: 'Compagnon oiseau',
    branche: 'exploration',
    tier: 3,
    prerequis: ['pisteur'],
    effets: [{ effet: 'optionScene', cible: 'Perception partagée à distance', valeur: 'Il voit ce que l’oiseau voit', condition: 'En extérieur uniquement', usage: '1x/scène' }],
  },
  {
    id: 'chemin-de-traverse',
    nom: 'Chemin de traverse',
    branche: 'exploration',
    tier: 3,
    prerequis: ['pisteur'],
    effets: [{ effet: 'optionScene', cible: 'Survie, DD fixé par le MJ', valeur: 'Évite une rencontre ou arrive en avance', condition: 'En voyage', usage: '1x/trajet' }],
  },

  // ---- Savoir ----
  {
    id: 'erudit',
    nom: 'Érudit',
    branche: 'savoir',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Connaissances (histoire), Connaissances (arcanes)', valeur: '+1', condition: 'Se souvenir d’une information', usage: permanent }],
    calcul: { competences: ['Connaissances (histoire)', 'Connaissances (arcanes)'], bonus: 1 },
  },
  {
    id: 'naturaliste',
    nom: 'Naturaliste',
    branche: 'savoir',
    tier: 1,
    effets: [{ effet: 'bonusCompetence', cible: 'Connaissances (nature)', valeur: '+1', condition: 'Plantes, créatures, poisons', usage: permanent }],
    calcul: { competences: ['Connaissances (nature)'], bonus: 1 },
  },
  {
    id: 'faconnage',
    nom: 'Façonnage',
    branche: 'savoir',
    tier: 1,
    effets: [{ effet: 'rituel', cible: 'Objet non magique, petite taille au plus', valeur: 'Change sa forme, pas sa matière', condition: '10 minutes, cadre des rituels', usage: '1x/jour' }],
    note: CADRE_DES_RITUELS,
  },
  {
    id: 'dechiffrer',
    nom: 'Déchiffrer',
    branche: 'savoir',
    tier: 1,
    effets: [{ effet: 'optionScene', cible: 'Investigation, DD fixé par le MJ', valeur: 'Sens général d’une écriture, d’une langue ou d’un code', condition: null, usage: '1x/texte' }],
  },
  {
    id: 'memoire-eidetique',
    nom: 'Mémoire eidétique',
    branche: 'savoir',
    tier: 2,
    prerequis: ['erudit'],
    effets: [{ effet: 'relance', cible: 'Test d’INT ou de CHA', valeur: '1 relance', condition: 'Information déjà rencontrée en jeu', usage: '1x/jour' }],
  },
  {
    id: 'transmutation-mineure',
    nom: 'Transmutation mineure',
    branche: 'savoir',
    tier: 2,
    prerequis: ['faconnage'],
    effets: [{ effet: 'rituel', cible: 'Matériau commun d’un objet ou de 1 m²', valeur: 'Change de matière (bois, pierre, fer, verre)', condition: '1 tour ; tient [niveau] heures', usage: '1x/jour' }],
    note: CADRE_DES_RITUELS,
  },
  {
    id: 'identifier',
    nom: 'Identifier',
    branche: 'savoir',
    tier: 2,
    effets: [{ effet: 'information', cible: 'Connaissances (arcanes), DD selon la rareté', valeur: 'Propriétés d’un objet magique', condition: 'Sans l’utiliser', usage: '1x/objet' }],
  },
  {
    id: 'murmure-des-morts',
    nom: 'Murmure des morts',
    branche: 'savoir',
    tier: 2,
    effets: [{ effet: 'information', cible: 'Âme d’un mort récent (moins de [mod d’INT] jours)', valeur: '1 question, réponse honnête mais limitée', condition: null, usage: '1x/défunt' }],
  },
  {
    id: 'savant',
    nom: 'Savant',
    branche: 'savoir',
    tier: 3,
    prerequis: ['erudit'],
    effets: [
      { effet: 'bonusCompetence', cible: 'Érudit', valeur: 'Passe à +2', condition: null, usage: permanent },
      { effet: 'information', cible: 'Question au MJ', valeur: '1 fait sûr', condition: null, usage: '1x/scène' },
    ],
    calcul: { competences: ['Connaissances (histoire)', 'Connaissances (arcanes)'], bonus: 1 },
  },
  {
    id: 'transmutation-majeure',
    nom: 'Transmutation majeure',
    branche: 'savoir',
    tier: 3,
    prerequis: ['transmutation-mineure'],
    effets: [{ effet: 'rituel', cible: 'Surface jusqu’à 2 m²', valeur: 'Change de matière, permanent', condition: '1 heure ; réversible par Dispersion', usage: '1x/scénario' }],
    note: CADRE_DES_RITUELS,
  },

  // ---- Croisements (tier 2, un nœud requis dans chaque branche) ----
  {
    id: 'citer-le-precedent',
    nom: 'Citer le précédent',
    branche: 'croisement',
    tier: 2,
    prerequis: ['erudit', 'beau-parleur'],
    effets: [{ effet: 'reussite', cible: 'Jet de Connaissances réussi', valeur: 'Compte comme une réussite sociale', condition: 'Face à une autorité (Garde, tribunal, guilde)', usage: '1x/scène' }],
  },
  {
    id: 'filature',
    nom: 'Filature',
    branche: 'croisement',
    tier: 2,
    prerequis: ['affable', 'pisteur'],
    effets: [{ effet: 'bonusCompetence', cible: 'Discrétion', valeur: '+2', condition: 'Suivre quelqu’un en ville', usage: permanent }],
    calcul: { competences: ['Discrétion'], bonus: 2 },
  },
  {
    id: 'remedes-de-terrain',
    nom: 'Remèdes de terrain',
    branche: 'croisement',
    tier: 2,
    prerequis: ['premiers-soins', 'naturaliste'],
    effets: [{ effet: 'soin', cible: 'Premiers soins', valeur: 'Soigne 1d6 au lieu de 1d4 ; traite un poison', condition: null, usage: 'Comme Premiers soins' }],
  },
];

/** Prédilections de classe (validé ; décision 4a) : le nœud de tier 1 offert, par classe de la refonte. */
export const PREDILECTIONS_VECU: Readonly<Record<string, string>> = {
  guerrier: 'premiers-soins',
  chevalier: 'beau-parleur',
  chasseur: 'pisteur',
  pretre: 'affable',
  druide: 'naturaliste',
  barde: 'marchander',
  moine: 'acrobate',
  magicien: 'erudit',
  envouteur: 'lire-les-gens',
  necromancien: 'dechiffrer',
};

/**
 * Migration v1 (décision 5a) : les capacités v1 hors combat et le nœud qui
 * leur correspond (« Inventaire v1 pour l'arbre du Vécu »). La conversion
 * les note ; le MJ les accorde ensuite (un palier et le nœud chacune).
 * Terrain naturel (Druide, Nature R2) n'a pas de nœud : Pied sûr est
 * retiré du premier arbre.
 */
export const VECU_DES_CAPACITES_V1: Readonly<Record<string, string>> = {
  'pretre.conversion.2': 'beau-parleur',
  'enchanteur.spectacle.2': 'beau-parleur',
  'guerrier.peuple.1': 'homme-du-peuple',
  'chasseur.traque.1': 'pisteur',
  'druide.nature.1': 'pisteur',
  'barde.spectacle.1': 'acrobate',
  'guerrier.elite.2': 'endurci',
  'chasseur.piege.4': 'oeil-du-fouilleur',
  'druide.nature.4': 'endurci',
  'druide.compagnons.3': 'compagnon-oiseau',
  'enchanteur.historien.1': 'erudit',
  'enchanteur.historien.4': 'memoire-eidetique',
  'enchanteur.transfiguration.1': 'faconnage',
  'enchanteur.transfiguration.2': 'transmutation-mineure',
  'enchanteur.transfiguration.4': 'transmutation-majeure',
  'necromancien.ames.1': 'murmure-des-morts',
};
