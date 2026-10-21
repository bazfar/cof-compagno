import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Le Magicien de la refonte (lot L4.4b1). Source : doc « Refonte classes et
 * magie — cadre », sections « Magicien », « Sorts mineurs par classe
 * (validé) », « Chiffrage des lanceurs (validé) » et décisions du 20 et du
 * 21/10/2026.
 *
 * Décisions verrouillées :
 *   - création : une école au choix (Évocation, Abjuration, Invocation) et
 *     un élément parmi les cinq ordinaires (feu, glace, terre, eau,
 *     électricité) ; le sang et le psionique restent au Nécromancien et à
 *     l'Envoûteur (20/10) ;
 *   - l'élément de départ est Initié tant que le rang 1 de la Voie
 *     élémentaire ne le monte pas à Adepte (5a du 21/10) ;
 *   - les éléments suivants viennent de la voie ou de la découverte, jamais
 *     du niveau (4a du 20/10) ;
 *   - Voie de l'école : chaque rang débloque le verbe de même rang ; l'école
 *     est Adepte à la création et Maître au rang 4 (validé) ;
 *   - Cataclysme : zone de rayon 2 à 13 cases, 6d6 de l'élément Maître avec
 *     son effet, DEX pour moitié, 6 PP, 1x/scénario (6a du 21/10) ;
 *   - réserve de PP : 4 + 2 × niveau + 2 × mod d'INT (formule v1, validé) ;
 *   - sorts mineurs : 2 à la création, +1 aux niveaux 5 et 9 (validé).
 * Les combinaisons de Maître (rang 3 de la Voie élémentaire) arriveront
 * avec leur lot commun ; la Voie sauvage, l'Hémomancie et le Virtuose en
 * L4.4b2 ; la Voie du chaos avec le lot commun des Voies du chaos.
 */

export const ACTIONS_MAGICIEN: ActionSaisie[] = [
  {
    id: 'magicien.cataclysme',
    nom: 'Cataclysme',
    description: 'Le mage libère d’un coup l’élément qu’il maîtrise.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    cout: [{ ressource: 'pp', montant: 6 }],
    elementMin: 'maitre',
    ciblage: { type: 'point', portee: 13 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    effets: [{ type: 'degats', des: '6d6', typeDegats: 'magique', vise: 'zone' }],
    element: { application: 'chaqueCible' },
  },
];

export const VOIES_MAGICIEN: VoieSaisie[] = [
  {
    id: 'magicien.ecole',
    nom: 'Voie de l’école',
    description: 'L’école choisie à la création, jusqu’à la maîtrise.',
    rangs: [
      { rang: 1, nom: 'Premier verbe', description: 'Le verbe de rang 1 de l’école ; l’école est Adepte.', regles: [{ type: 'verbeDeLEcole' }, { type: 'maitriseEcole', niveau: 'adepte' }] },
      { rang: 2, nom: 'Deuxième verbe', description: 'Le verbe de rang 2 de l’école.', regles: [{ type: 'verbeDeLEcole' }] },
      { rang: 3, nom: 'Troisième verbe', description: 'Le verbe de rang 3 de l’école ; le verbe de rang 1 passe au palier II.', regles: [{ type: 'verbeDeLEcole' }] },
      {
        rang: 4,
        nom: 'Maître de l’école',
        description: 'Le verbe de rang 4 ; l’école est Maître : −1 PP sur ses verbes, +2 au DD.',
        regles: [{ type: 'verbeDeLEcole' }, { type: 'maitriseEcole', niveau: 'maitre' }],
      },
      { rang: 5, nom: 'Cinquième verbe', description: 'Le verbe de rang 5 de l’école (1x/combat).', regles: [{ type: 'verbeDeLEcole' }] },
    ],
  },
  {
    id: 'magicien.elementaire',
    nom: 'Voie élémentaire',
    description: 'La maîtrise des éléments, jusqu’au cataclysme.',
    rangs: [
      { rang: 1, nom: 'Élément de départ', description: 'L’élément de départ passe Adepte.', regles: [{ type: 'maitriseElement', quel: 'depart', niveau: 'adepte' }] },
      { rang: 2, nom: 'Second élément', description: 'Un second élément, Initié.', regles: [{ type: 'secondElement', niveau: 'initie' }] },
      {
        rang: 3,
        nom: 'Maîtrise élémentaire',
        description: 'Un élément connu passe Maître : −1 PP, et les combinaisons de deux éléments s’ouvrent.',
        regles: [
          { type: 'maitriseElement', quel: 'auChoix', niveau: 'maitre' },
          { type: 'texte', texte: 'Combinaisons de Maître : elles arriveront avec leur lot commun, chiffrées.' },
        ],
      },
      { rang: 4, nom: 'Résonance', description: 'Annule un dérapage, une fois par combat.', regles: [{ type: 'annuleDerapage', limite: '1x/combat' }] },
      { rang: 5, nom: 'Cataclysme', description: 'Rayon 2 à 13 cases, 6d6 de l’élément Maître et son effet, DEX pour moitié ; 6 PP, 1x/scénario.', actions: ['magicien.cataclysme'] },
    ],
  },
];

export const MAGICIEN: ClasseSaisie = {
  id: 'magicien',
  nom: 'Magicien',
  famille: 'magique',
  deVie: 4,
  caracMagie: 'INT',
  reservePP: { base: 4, parNiveau: 2, parMod: 2 },
  voies: ['magicien.ecole', 'magicien.elementaire'],
  creation: {
    ecoles: ['evocation', 'abjuration', 'invocation'],
    elements: ['feu', 'glace', 'terre', 'eau', 'electricite'],
    elementsSecond: ['feu', 'glace', 'terre', 'eau', 'electricite'],
    maitriseElementDepart: 'initie',
  },
  mineurs: {
    liste: ['mineur.trait-arcanique', 'mineur.main-du-mage', 'mineur.lumiere', 'mineur.detection-magie', 'mineur.prestidigitation'],
    creation: 2,
    plusUnAuNiveau: [5, 9],
  },
};
