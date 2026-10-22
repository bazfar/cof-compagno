import type { ActionSaisie } from '../lib/schemas/effets';

/*
 * Sorts mineurs (lots L4.4b1 et L4.4b2). Source : doc « Refonte classes et
 * magie — cadre », « Sorts mineurs (niveau 0) » et « Sorts mineurs par
 * classe (validé) » : 0 PP, à volonté ; dégâts à l'attaque magique, dont le
 * dé suit le niveau (1d6, 1d8, 1d10) ; un élément ne leur donne que son
 * type de dégâts, sauf avec la Voie du virtuose (Affinité). Trait arcanique
 * porte à 10 cases (décision 16a du 21/10/2026).
 *
 * Paliers II et III : seulement par la Voie du virtuose (Répertoire en
 * passe un au II, Perfection les passe tous au III). Tableau proposé le
 * 21/10/2026 (décision 13a) et repris sans correction de Thomas. Désarmé
 * (Main du mage III) et Aveuglé (Lumière III) durent 1 round, comme un état
 * d'attaque spéciale (décision 1a du 21/10/2026).
 * Sorts mineurs du Barde (lot L4.8) : Moquerie et Rengaine en combat, à
 * 6 cases ; Mélodie et Ventriloquie hors combat.
 * Sorts mineurs du Druide (lot L4.15) : Fouet d'épines, Gourdin, Pousse et
 * Druidisme (« Sorts mineurs par classe (validé) »), plus Bouclier de
 * terre, ajouté par Thomas (décision 9a du 21/10/2026 : +1 en DEF à un
 * allié). Choix du lot, à valider : portées de 6 cases ; le Bouclier de
 * terre dure jusqu'au prochain tour du Druide ; le Gourdin frappe au contact
 * à l'attaque magique (SAG), dégâts physiques.
 * Sorts mineurs du Nécromancien (lot L4.17, décision 5a du 22/10/2026) :
 * Trait nécrotique et Frisson en combat, à 10 cases ; Sentir la mort,
 * Préserver et Main froide hors combat.
 */

type Textes = [string, string, string];

const horsCombat = (id: string, nom: string, description: string, textes: Textes, paliers: ActionSaisie['paliers'] = {}): ActionSaisie => ({
  id,
  nom,
  description,
  nature: 'mineur',
  rang: 0,
  etiquettes: ['exploration'],
  action: 'action',
  ciblage: { type: 'aucun', portee: 'soi' },
  resolution: { jet: 'aucun' },
  effets: [{ type: 'narratif', texte: textes[0], vise: 'lanceur' }],
  paliers: {
    II: { effets: { '0': { texte: textes[1] } } },
    III: { effets: { '0': { texte: textes[2] } } },
    ...paliers,
  },
  horsCombat: { paliers: textes },
});

/** Sort mineur hors combat sans paliers (Envoûteur : le Virtuose est propre au Magicien, 15a du 21/10/2026). */
const simple = (id: string, nom: string, description: string, texte: string, etiquettes: ActionSaisie['etiquettes'] = ['exploration']): ActionSaisie => ({
  id,
  nom,
  description,
  nature: 'mineur',
  rang: 0,
  etiquettes,
  action: 'action',
  ciblage: { type: 'aucun', portee: 'soi' },
  resolution: { jet: 'aucun' },
  effets: [{ type: 'narratif', texte, vise: 'lanceur' }],
  horsCombat: { paliers: [texte] },
});

export const MINEURS: ActionSaisie[] = [
  {
    id: 'mineur.trait-arcanique',
    nom: 'Trait arcanique',
    description: 'Un trait de force, à volonté.',
    nature: 'mineur',
    ecole: 'evocation',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'magique', progression: 'mineur' }],
    element: { application: 'ciblePrincipale' },
    paliers: {
      II: { ciblage: { portee: 15 } },
      III: { ciblage: { nbCibles: 2 } },
    },
  },
  horsCombat(
    'mineur.main-du-mage',
    'Main du mage',
    'Une main invisible.',
    [
      'Déplacer un petit objet à 6 cases.',
      'Déplacer jusqu’à 10 kg, ou manipuler : ouvrir, tirer un levier.',
      'Arracher son arme à une cible (sauvegarde de FOR).',
    ],
    {
      III: {
        etiquettes: ['combat', 'exploration'],
        ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
        resolution: { jet: 'sauvegarde', sauvegarde: 'FOR', siSauvegarde: 'annule' },
        effets: { '0': { texte: 'Arracher son arme à une cible (sauvegarde de FOR).' } },
        ajoute: [{ type: 'etat', etat: 'desarme', duree: { rounds: 1 } }],
      },
    },
  ),
  horsCombat(
    'mineur.lumiere',
    'Lumière',
    'Une lueur qui suit le mage.',
    ['Éclairer.', 'Une lumière colorée ou clignotante, signal visible de loin.', 'Un éclat qui aveugle une créature 1 round (sauvegarde de CON).'],
    {
      III: {
        etiquettes: ['combat', 'exploration'],
        ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
        resolution: { jet: 'sauvegarde', sauvegarde: 'CON', siSauvegarde: 'annule' },
        effets: { '0': { texte: 'Un éclat qui aveugle une créature 1 round (sauvegarde de CON).' } },
        ajoute: [{ type: 'etat', etat: 'aveugle', duree: { rounds: 1 } }],
      },
    },
  ),
  horsCombat('mineur.detection-magie', 'Détection de la magie', 'Le mage sent les auras.', [
    'Sentir une aura magique à 6 cases.',
    'Connaître l’école ou l’élément de l’aura.',
    'À 12 cases, et à travers une cloison.',
  ]),
  horsCombat('mineur.prestidigitation', 'Prestidigitation', 'Petits tours de magie.', [
    'Nettoyer, chauffer, faire un petit tour de magie.',
    'Une petite illusion sonore ou visuelle, une minute.',
    'Réparer un objet simple cassé.',
  ]),

  // ---- Envoûteur (lot L4.5 ; « Sorts mineurs par classe (validé) ») ----
  {
    id: 'mineur.pique-mentale',
    nom: 'Pique mentale',
    description: 'Une aiguille dans l’esprit, que l’armure n’arrête pas.',
    nature: 'mineur',
    ecole: 'enchantement',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ignoreArmure: true,
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'psychique', progression: 'mineur' }],
    element: { application: 'ciblePrincipale' },
  },
  simple('mineur.murmure', 'Murmure', 'Un message pour une seule oreille.', 'Un message que seule la cible entend, à 10 cases.', ['exploration', 'social']),
  simple('mineur.fantasme-mineur', 'Fantasme mineur', 'Une petite image ou un petit son.', 'Une petite image ou un petit son, une minute ; il ne compte pas de réussite.', ['exploration', 'social']),
  simple('mineur.amitie', 'Amitié', 'Un sourire qui ouvre les portes.', '+1 au prochain jet social sur un PNJ, qui s’en aperçoit ensuite (attitude −1 cran).', ['social']),
  {
    id: 'mineur.trouble',
    nom: 'Trouble',
    description: 'Un doute au mauvais moment.',
    nature: 'mineur',
    ecole: 'enchantement',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'bonus', cible: 'attaque', valeur: -1, duree: 'prochainTour' }],
  },

  // ---- Prêtre (lot L4.6 ; « Sorts mineurs par classe (validé) ») ----
  {
    id: 'mineur.flamme-vacillante',
    nom: 'Flamme vacillante',
    description: 'Une petite flamme sacrée.',
    nature: 'mineur',
    ecole: 'bannissement',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'sacre', progression: 'mineur' }],
  },
  {
    id: 'mineur.stabiliser',
    nom: 'Stabiliser',
    description: 'Un allié à terre ne meurt pas.',
    nature: 'mineur',
    ecole: 'guerison',
    rang: 0,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: { jet: 'aucun' },
    effets: [
      { type: 'soin', des: '1' },
      { type: 'narratif', texte: 'Seulement sur un allié à 0 PV : il ne meurt pas et remonte à 1 PV.' },
    ],
    horsCombat: { paliers: ['Un allié à 0 PV ne meurt pas et remonte à 1 PV.'] },
  },
  {
    id: 'mineur.benediction-mineure',
    nom: 'Bénédiction mineure',
    description: 'Un mot de bénédiction.',
    nature: 'mineur',
    ecole: 'foi',
    rang: 0,
    etiquettes: ['combat', 'social'],
    action: 'action',
    limite: '1x/round',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'prochainJet', valeur: 1, duree: 'finCombat' }],
    horsCombat: { paliers: ['+1 au prochain jet d’un allié.'] },
  },
  simple('mineur.sentir-le-mal', 'Sentir le mal', 'Le Prêtre sent ce qui vient de la Mer.', 'Savoir s’il y a un démon ou un mort-vivant à 6 cases.'),
  simple('mineur.purifier', 'Purifier', 'Une bénédiction sur la table.', 'Rendre une eau ou un repas sain.'),

  // ---- Barde (lot L4.8 ; « Sorts mineurs par classe (validé) » ; portées de 6 cases) ----
  {
    id: 'mineur.moquerie',
    nom: 'Moquerie',
    description: 'Un mot qui blesse, et la cible doute.',
    nature: 'mineur',
    ecole: 'chant',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'attaqueMagique' },
    effets: [
      { type: 'degats', des: '1d6', typeDegats: 'psychique', progression: 'mineur' },
      { type: 'bonus', cible: 'prochainJet', valeur: -1, duree: 'prochainTour' },
    ],
  },
  simple('mineur.melodie', 'Mélodie', 'Un air qui met la salle de son côté.', '+1 en Représentation pour la scène.', ['social']),
  simple('mineur.ventriloquie', 'Ventriloquie', 'Sa voix vient d’ailleurs.', 'Déplacer sa voix jusqu’à 6 cases.', ['social']),
  {
    id: 'mineur.rengaine',
    nom: 'Rengaine',
    description: 'Un air de marche.',
    nature: 'mineur',
    ecole: 'chant',
    rang: 0,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'deplacement', valeur: 1, duree: 'prochainTour' }],
    horsCombat: { paliers: ['Marche forcée sans fatigue pour le groupe.'] },
  },

  // ---- Druide (lot L4.15 ; « Sorts mineurs par classe (validé) » et décision 9a) ----
  {
    id: 'mineur.fouet-d-epines',
    nom: 'Fouet d’épines',
    description: 'Une liane épineuse qui fouette et ramène.',
    nature: 'mineur',
    ecole: 'nature',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'attaqueMagique' },
    effets: [
      { type: 'degats', des: '1d6', typeDegats: 'physique', progression: 'mineur' },
      { type: 'deplacement', sens: 'attire', cases: 1, condition: 'touche' },
    ],
    element: { application: 'ciblePrincipale' },
  },
  {
    id: 'mineur.gourdin',
    nom: 'Gourdin',
    description: 'Le bâton du Druide durcit et frappe avec la force de la nature.',
    nature: 'mineur',
    ecole: 'nature',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'contact' },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'physique', progression: 'mineur', crans: 1 }],
    element: { application: 'ciblePrincipale' },
  },
  {
    id: 'mineur.bouclier-de-terre',
    nom: 'Bouclier de terre',
    description: 'Une plaque de terre se dresse devant un allié.',
    nature: 'mineur',
    ecole: 'nature',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 6 },
    resolution: { jet: 'aucun' },
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 1, duree: 'prochainTour' }],
  },
  simple('mineur.pousse', 'Pousse', 'La sève répond à sa main.', 'Faire pousser une plante, réparer du bois.'),
  simple('mineur.druidisme', 'Druidisme', 'Les petits secrets de la nature.', 'Prévoir le temps, éteindre une flamme, faire éclore une fleur.'),

  // ---- Nécromancien (lot L4.17, décision 5a) ----
  {
    id: 'mineur.trait-necrotique',
    nom: 'Trait nécrotique',
    description: 'Un trait de mort, à volonté.',
    nature: 'mineur',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '1d6', typeDegats: 'necrotique', progression: 'mineur' }],
    element: { application: 'ciblePrincipale' },
  },
  {
    id: 'mineur.frisson',
    nom: 'Frisson',
    description: 'Un froid de tombe dans le dos de la cible.',
    nature: 'mineur',
    rang: 0,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'bonus', cible: 'attaque', valeur: -1, duree: 'prochainTour' }],
  },
  simple('mineur.sentir-la-mort', 'Sentir la mort', 'Il sent ce qui est mort, ou va l’être.', 'Savoir s’il y a un mort ou un mourant à 6 cases.'),
  simple('mineur.preserver', 'Préserver', 'Un cadavre qui attend.', 'Un cadavre ne pourrit pas pendant une semaine.'),
  simple('mineur.main-froide', 'Main froide', 'Le froid de la tombe au bout des doigts.', 'Un objet ou une boisson devient glacé.'),
];
