import type { CapaciteDeVoie, ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';
import { voieDeLEcole } from './commun';

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
 * Voie sauvage, Hémomancie, Virtuose (lot L4.4b2, décisions du 21/10/2026) :
 *   - Mutation sauvage : la règle v1 reste (2d4 − 4 aux dégâts de chaque sort
 *     offensif) et elle remplace le dérapage : le sort part sans son élément
 *     (2a, 7b) ; les capacités « 1x/jour » de la v1 passent en 1x/combat
 *     (8b) ; Canalisation « embrase légèrement » = Brûlure 1 round ;
 *   - Pacte de sang : passif permanent dès le rang 1 ; les PP s'ajoutent aux
 *     PV max, les sorts coûtent leurs PP en PV, jamais sous 1 PV, et les
 *     soins reçus sont divisés par 2 (9a, validé) ;
 *   - Sang appelle sang : un quart des dégâts infligés, arrondi à
 *     l'inférieur, au plus la moitié du coût du sort arrondie au supérieur
 *     (10c, après simulation ; 3a) ;
 *   - Seuil critique : sous la moitié des PV, la surcharge perd ses +2 PP,
 *     le +1 du palier reste (1a) ;
 *   - Sang versé : après au moins 5 dégâts subis, un dé de plus au prochain
 *     sort (11b) ;
 *   - Saignée (1x/scénario) : la moitié des PV actuels ; au choix, le
 *     prochain verbe au palier III sans coût et +2d6, ou un allié soigné
 *     entièrement (12a) ;
 *   - Virtuose : Geste réflexe quand un ennemi entre au contact du mage ou
 *     attaque un allié adjacent (14a) ; Geste unique = dés doublés (15b) ;
 *     Perfection monte les dés d'un cran (20/10).
 * La 4ᵉ voie est l'Hémomancie ou le Virtuose, jamais les deux (validé). Les
 * combinaisons de Maître auront leur lot commun ; la Voie du chaos est dans
 * src/regles/classes/chaos.ts (lot L4.9).
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
  {
    id: 'magicien.saignee-soin',
    nom: 'Saignée (soin)',
    description: 'Le mage verse la moitié de son sang pour rendre un allié entier.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    limite: '1x/scenario',
    sacrifice: 'moitiePvActuels',
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'soinComplet' }],
    horsCombat: { paliers: ['Sauver un blessé grave en lui donnant son sang.'] },
  },
];

const capacite = (nom: CapaciteDeVoie, limite?: '1x/combat' | '1x/scenario') => ({ type: 'capacite' as const, nom, ...(limite ? { limite } : {}) });

export const VOIES_MAGICIEN: VoieSaisie[] = [
  voieDeLEcole('magicien'),
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
  {
    id: 'magicien.sauvage',
    nom: 'Voie sauvage',
    description: 'La magie qui déborde : chaque sort offensif varie, et un dérapage devient une mutation.',
    rangs: [
      {
        rang: 1,
        nom: 'Mutation sauvage',
        description: 'Chaque sort offensif : 2d4 − 4 à ses dégâts. Un dérapage ne fait plus rater le sort : il part sans son élément.',
        regles: [capacite('mutationSauvage')],
      },
      { rang: 2, nom: 'Instinct chaotique', description: 'Une fois par combat, avant un sort : le meilleur de deux jets de Mutation sauvage.', regles: [capacite('instinctChaotique', '1x/combat')] },
      {
        rang: 3,
        nom: 'Canalisation profonde',
        description: 'Sur une Mutation de +3 ou plus : au choix, la cible est repoussée d’une case, brûlée 1 round, ou aveuglée 1 round.',
        regles: [capacite('canalisation')],
      },
      { rang: 4, nom: 'Maîtrise du chaos', description: 'Une fois par combat, avant un sort : +4 sans jet.', regles: [capacite('maitriseDuChaos', '1x/combat')] },
      {
        rang: 5,
        nom: 'Submersion arcanique',
        description: 'Une fois par combat : la Mutation compte double (−4 à +8). Négative : le mage prend 1d4 et est étourdi ; positive : un effet spectaculaire.',
        regles: [capacite('submersion', '1x/combat')],
      },
    ],
  },
  {
    id: 'magicien.hemomancie',
    nom: 'Voie de l’hémomancie',
    description: 'La magie payée en sang. Taboue à Liberra.',
    rangs: [
      {
        rang: 1,
        nom: 'Pacte de sang',
        description: 'Les PP s’ajoutent aux PV max ; les sorts coûtent leurs PP en PV, jamais sous 1 PV ; les soins reçus sont divisés par 2.',
        regles: [capacite('pacteDeSang')],
      },
      {
        rang: 2,
        nom: 'Sang appelle sang',
        description: 'Un sort qui blesse rend un quart des dégâts infligés, au plus la moitié de son coût.',
        regles: [capacite('sangAppelleSang')],
      },
      { rang: 3, nom: 'Seuil critique', description: 'Sous la moitié des PV, la surcharge ne coûte pas ses +2.', regles: [capacite('seuilCritique')] },
      { rang: 4, nom: 'Sang versé', description: 'Après au moins 5 dégâts subis, le prochain sort gagne un dé.', regles: [capacite('sangVerse')] },
      {
        rang: 5,
        nom: 'Saignée',
        description: 'Une fois par scénario, la moitié de ses PV : le prochain verbe au palier III sans coût et +2d6, ou un allié soigné entièrement.',
        actions: ['magicien.saignee-soin'],
        regles: [capacite('saignee', '1x/scenario')],
      },
    ],
  },
  {
    id: 'magicien.virtuose',
    nom: 'Voie du virtuose',
    description: 'Le mage renonce à des verbes pour perfectionner ses sorts mineurs.',
    rangs: [
      { rang: 1, nom: 'Répertoire', description: 'Un sort mineur de plus ; l’un d’eux passe au palier II.', regles: [capacite('repertoire')] },
      { rang: 2, nom: 'Affinité', description: 'Avec un élément au moins Adepte, un sort mineur en porte l’effet complet.', regles: [capacite('affinite')] },
      { rang: 3, nom: 'Geste réflexe', description: 'Un sort mineur en réaction, quand un ennemi entre à son contact ou attaque un allié adjacent.', regles: [capacite('gesteReflexe')] },
      { rang: 4, nom: 'Perfection', description: 'Tous ses sorts mineurs au palier III, dés d’un cran au-dessus.', regles: [capacite('perfection')] },
      { rang: 5, nom: 'Le geste unique', description: 'Une fois par combat, un sort mineur aux dés doublés.', regles: [capacite('gesteUnique', '1x/combat')] },
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
  voies: ['magicien.ecole', 'magicien.elementaire', 'magicien.sauvage', 'magicien.hemomancie', 'magicien.virtuose', 'magicien.chaos'],
  voiesExclusives: [['magicien.hemomancie', 'magicien.virtuose']],
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
