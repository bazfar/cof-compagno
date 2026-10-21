import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';
import { voieDeLaSecondeEcole, voieDeLEcole } from './commun';

/*
 * L'Envoûteur de la refonte, ex-Enchanteur (lot L4.5). Source : doc
 * « Refonte classes et magie — cadre », section « Envoûteur », et décisions
 * de Thomas du 21/10/2026.
 *
 * Décisions verrouillées :
 *   - création : Illusion ou Enchantement, l'autre restant accessible par
 *     grimoire (Non maîtrisé → Initié) ou par la seconde école ; le
 *     psionique comme élément de départ, Initié puis Adepte au rang 1 de la
 *     Voie de l'esprit (1a, comme 5a pour le Magicien) ; tout passe en CHA
 *     (validé) ;
 *   - voies : école, esprit, transmutation, puis au choix Prescience ou
 *     seconde école (plafonnée à Adepte, sans palier III ; son rang 5 reste
 *     au palier I : 14a) ; la Voie du chaos aura son lot commun ;
 *   - Lien mental : tout le groupe est lié ; une fois par round, un allié
 *     lié gagne +1 à son prochain jet (8a) ;
 *   - Réalité de l'esprit : une illusion psionique inflige 1d6 psychiques à
 *     sa cible au début de chacun de ses tours (9a) ;
 *   - Tempête psychique : rayon 2 à 10 cases, 4d6 psychiques, Volonté pour
 *     moitié, Étourdi 1 round sur un échec ; elle dissipe illusions et
 *     charmes ennemis de la zone ; 6 PP, 1x/scénario (10a) ;
 *   - Transmutation (11) : Arme enchantée (+2 en attaque, +1d6 magiques) et
 *     Vitesse (+2 cases) pendant 2 rounds ; enchantement d'armes permanent
 *     au rang 3 (règle v1) ; Métamorphose 1 round (Volonté, pas les boss) ;
 *     Pierre en chair reprise de la v1 (−4 DEF et Ralenti 1d4 + CHA rounds,
 *     CON ; ou une pétrification levée) ;
 *   - Prescience (13) : Pressentiment, Jamais surpris (+2 initiative), Fil
 *     du destin (relance d'un jet allié, 1x/combat), Double vue, Prophétie :
 *     une fois par combat, l'Envoûteur tire d'avance autant de d20 qu'il
 *     veut, 3 PP par dé, puis attribue chaque résultat à un joueur ou un
 *     monstre, qui le prend comme valeur de son prochain jet ;
 *   - sorts mineurs : 2 à la création, +1 aux niveaux 5 et 9, sans paliers
 *     (le Virtuose est propre au Magicien : 15a).
 *
 * À confirmer par Thomas (question 12 restée sans réponse, et coûts absents
 * du cadre) : capacités de Transmutation au barème des verbes selon leur
 * rang (2, 3, 5 et 6 PP) ; Rempart mental 5 PP ; Pressentiment et Double
 * vue 2 PP ; Lien mental et Fil du destin sans coût ; portées de 6 cases.
 */

const pp = (montant: number) => [{ ressource: 'pp' as const, montant }];

export const ACTIONS_ENVOUTEUR: ActionSaisie[] = [
  // ---- Voie de l'esprit ----
  {
    id: 'envouteur.lien-mental',
    nom: 'Lien mental',
    description: 'Une télépathie avec tout le groupe.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'gratuite',
    limite: '1x/round',
    ciblage: { type: 'creature', camp: 'allie', portee: 100, ligneDeVue: false },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'prochainJet', valeur: 1, duree: 'finCombat' }],
    horsCombat: { paliers: ['Coordination silencieuse : une réussite en infiltration.'], reussites: 1 },
  },
  {
    id: 'envouteur.rempart-mental',
    nom: 'Rempart mental',
    description: 'Brise un contrôle mental sur l’Envoûteur ou un allié lié.',
    nature: 'reaction',
    rang: 4,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'controleMental',
    cout: pp(5),
    ciblage: { type: 'creature', camp: 'allie', portee: 100, ligneDeVue: false },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'retraitEtat', etats: ['charme', 'fascine', 'domine', 'leurre', 'leurre_eclatant', 'effroi', 'confus'], nombre: 1 }],
  },
  {
    id: 'envouteur.tempete-psychique',
    nom: 'Tempête psychique',
    description: 'Un orage dans les esprits, qui brise les illusions et les charmes ennemis.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    cout: pp(6),
    ciblage: { type: 'point', portee: 10 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'moitie' },
    effets: [
      { type: 'degats', des: '4d6', typeDegats: 'psychique', vise: 'zone' },
      { type: 'etat', etat: 'etourdi', duree: { rounds: 1 }, vise: 'zone', condition: 'sauvegardeRatee' },
      { type: 'narratif', texte: 'Les illusions et les charmes ennemis de la zone se dissipent.', vise: 'lanceur' },
    ],
  },
  // ---- Voie de la transmutation ----
  {
    id: 'envouteur.arme-enchantee',
    nom: 'Arme enchantée',
    description: 'L’arme d’un allié s’éveille.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'action',
    cout: pp(2),
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [
      { type: 'bonus', cible: 'attaque', valeur: 2, duree: { rounds: 2 } },
      { type: 'bonus', cible: 'degats', valeur: '1d6', duree: { rounds: 2 } },
    ],
  },
  {
    id: 'envouteur.vitesse',
    nom: 'Vitesse',
    description: 'Un allié se déplace plus vite.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    cout: pp(3),
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'deplacement', valeur: 2, duree: { rounds: 2 } }],
    horsCombat: { paliers: ['Une marche rapide pour un allié.'] },
  },
  {
    id: 'envouteur.metamorphose',
    nom: 'Métamorphose',
    description: 'La cible devient un petit animal inoffensif.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    cout: pp(5),
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'metamorphose', duree: { rounds: 1 }, saufBoss: true }],
  },
  {
    id: 'envouteur.pierre-en-chair',
    nom: 'Pierre en chair',
    description: 'Une pétrification partielle.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    cout: pp(6),
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'CON', siSauvegarde: 'annule' },
    effets: [
      { type: 'bonus', cible: 'DEF', valeur: -4, duree: { des: '1d4', plusModMagie: true } },
      { type: 'etat', etat: 'ralenti', duree: { des: '1d4', plusModMagie: true } },
    ],
  },
  {
    id: 'envouteur.restaurer-chair',
    nom: 'Pierre en chair (restaurer)',
    description: 'Lève une pétrification complète.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    cout: pp(6),
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'narratif', texte: 'La pétrification se lève : la cible redevient chair.' }],
    horsCombat: { paliers: ['Rendre la chair à une statue vivante.'] },
  },
  // ---- Voie de la prescience ----
  {
    id: 'envouteur.pressentiment',
    nom: 'Pressentiment',
    description: 'L’Envoûteur voit le coup venir.',
    nature: 'reaction',
    rang: 1,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'attaqueVisee',
    cout: pp(2),
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'etat', etat: 'presage', duree: 'prochainTour' }],
  },
  {
    id: 'envouteur.jamais-surpris',
    nom: 'Jamais surpris',
    description: 'Il sait ce qui vient.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: { type: 'soi', portee: 'soi' },
    resolution: { jet: 'aucun' },
    effets: [
      { type: 'bonus', cible: 'initiative', valeur: 2, duree: 'permanente', vise: 'lanceur' },
      { type: 'narratif', texte: 'Ne peut pas être surpris.', vise: 'lanceur' },
    ],
  },
  {
    id: 'envouteur.fil-du-destin',
    nom: 'Fil du destin',
    description: 'Il tire sur le fil d’un jet manqué.',
    nature: 'reaction',
    rang: 3,
    etiquettes: ['combat', 'social'],
    action: 'reaction',
    limite: '1x/combat',
    declencheur: 'jetAllie',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'narratif', texte: 'L’allié relance son jet et garde le nouveau résultat.' }],
  },
  {
    id: 'envouteur.double-vue',
    nom: 'Double vue',
    description: 'Le Pressentiment, retourné en faveur d’un allié.',
    nature: 'reaction',
    rang: 4,
    etiquettes: ['combat', 'social'],
    action: 'reaction',
    declencheur: 'jetAllie',
    cout: pp(2),
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'narratif', texte: 'L’allié lance ce jet avec l’avantage (2d20, le meilleur).' }],
  },
  {
    id: 'envouteur.prophetie',
    nom: 'Prophétie',
    description: 'L’Envoûteur lit les dés avant qu’ils ne roulent.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'soi', portee: 'soi' },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'jetsReserves', des: '1d20', ppParDe: 3, vise: 'lanceur' }],
  },
];

export const VOIES_ENVOUTEUR: VoieSaisie[] = [
  voieDeLEcole('envouteur'),
  {
    id: 'envouteur.esprit',
    nom: 'Voie de l’esprit',
    description: 'Le psionique, du murmure à la tempête.',
    rangs: [
      {
        rang: 1,
        nom: 'Esprit aiguisé',
        description: 'Le psionique passe Adepte : ses sorts psioniques visent la Volonté et ignorent l’armure.',
        regles: [{ type: 'maitriseElement', quel: 'depart', niveau: 'adepte' }],
      },
      { rang: 2, nom: 'Lien mental', description: 'Tout le groupe est lié : une fois par round, un allié lié gagne +1 à son prochain jet.', actions: ['envouteur.lien-mental'] },
      {
        rang: 3,
        nom: 'Réalité de l’esprit',
        description: 'Le psionique passe Maître ; une illusion psionique inflige 1d6 psychiques à sa cible au début de chacun de ses tours.',
        regles: [
          { type: 'maitriseElement', quel: 'depart', niveau: 'maitre' },
          { type: 'capacite', nom: 'realiteDeLEsprit' },
          { type: 'texte', texte: 'Combinaisons de Maître : elles arriveront avec leur lot commun, chiffrées.' },
        ],
      },
      { rang: 4, nom: 'Rempart mental', description: 'Réaction : annule un contrôle mental sur soi ou un allié lié.', actions: ['envouteur.rempart-mental'] },
      { rang: 5, nom: 'Tempête psychique', description: 'Rayon 2 à 10 cases, 4d6 psychiques, Volonté pour moitié, Étourdi 1 round ; 1x/scénario.', actions: ['envouteur.tempete-psychique'] },
    ],
  },
  {
    id: 'envouteur.transmutation',
    nom: 'Voie de la transmutation',
    description: 'La matière obéit : armes, corps, pierre.',
    rangs: [
      { rang: 1, nom: 'Arme enchantée', description: 'L’arme d’un allié : +2 en attaque et +1d6 magiques pendant 2 rounds.', actions: ['envouteur.arme-enchantee'] },
      { rang: 2, nom: 'Vitesse', description: 'Un allié : +2 cases de déplacement pendant 2 rounds.', actions: ['envouteur.vitesse'] },
      {
        rang: 3,
        nom: 'Enchantement permanent',
        description: 'Enchanter une arme à demeure, de +1 à +5 ; autant de tentatives par jour que de rangs dans la voie (règle v1).',
        regles: [{ type: 'texte', texte: 'Enchantement d’armes permanent : table d’enchantement v1, tentatives par jour = rang dans la voie.' }],
      },
      { rang: 4, nom: 'Métamorphose', description: 'Une cible devient un petit animal inoffensif pendant 1 round (Volonté ; pas les boss).', actions: ['envouteur.metamorphose'] },
      {
        rang: 5,
        nom: 'Pierre en chair',
        description: '−4 DEF et Ralenti pendant 1d4 + CHA rounds (CON), ou une pétrification levée.',
        actions: ['envouteur.pierre-en-chair', 'envouteur.restaurer-chair'],
      },
    ],
  },
  {
    id: 'envouteur.prescience',
    nom: 'Voie de la prescience',
    description: 'L’Envoûteur voit un peu plus loin que les autres.',
    rangs: [
      { rang: 1, nom: 'Pressentiment', description: 'Réaction : une attaque contre lui ou un allié à 6 cases se fait avec le désavantage.', actions: ['envouteur.pressentiment'] },
      { rang: 2, nom: 'Jamais surpris', description: 'Ne peut pas être surpris ; +2 en initiative.', actions: ['envouteur.jamais-surpris'] },
      { rang: 3, nom: 'Fil du destin', description: 'Une fois par combat, un allié relance un jet.', actions: ['envouteur.fil-du-destin'] },
      { rang: 4, nom: 'Double vue', description: 'Réaction : un allié lance son jet avec l’avantage.', actions: ['envouteur.double-vue'] },
      {
        rang: 5,
        nom: 'Prophétie',
        description: 'Une fois par combat : des d20 tirés d’avance, 3 PP chacun, que l’Envoûteur attribue comme prochains jets.',
        actions: ['envouteur.prophetie'],
      },
    ],
  },
  voieDeLaSecondeEcole('envouteur'),
];

export const ENVOUTEUR: ClasseSaisie = {
  id: 'envouteur',
  nom: 'Envoûteur',
  famille: 'magique',
  deVie: 4,
  caracMagie: 'CHA',
  reservePP: { base: 4, parNiveau: 2, parMod: 2 },
  voies: ['envouteur.ecole', 'envouteur.esprit', 'envouteur.transmutation', 'envouteur.prescience', 'envouteur.seconde-ecole'],
  voiesExclusives: [['envouteur.prescience', 'envouteur.seconde-ecole']],
  creation: {
    ecoles: ['illusion', 'enchantement'],
    elements: ['psionique'],
    elementsSecond: [],
    maitriseElementDepart: 'initie',
  },
  mineurs: {
    liste: ['mineur.pique-mentale', 'mineur.murmure', 'mineur.fantasme-mineur', 'mineur.amitie', 'mineur.trouble'],
    creation: 2,
    plusUnAuNiveau: [5, 9],
  },
};
