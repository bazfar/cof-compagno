import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Le Chasseur de la refonte (lot L4.14). Source : doc « Refonte classes et
 * magie — cadre », « Classes physiques », « Ressources de classe (validé) »
 * et « Chasseur » ; voies v1 (src/donnees/classes.json) pour les chiffres
 * que le cadre garde.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - 1a : Instinct = 3 + niveau / 3, rechargé au repos court ; +1 en
 *     touchant sa cible marquée, une fois par round (le combat, L6) ;
 *   - 2b : armes à feu, deux familles : pistolet et fusil (Précision : il
 *     vise un tour sans tirer, +1d6 à la prochaine attaque, +1d10 sur un
 *     critique), tromblon (Décharge : trois balles de 1d4, trois cibles au
 *     plus) ; attaques spéciales de l'arc, de l'arbalète, de la dague et des
 *     armes à feu, 2 Instinct (src/regles/armes.ts) ;
 *   - 3a : Marque du chasseur, capacité de classe : action gratuite, une
 *     cible ; +1 en attaque contre elle, +2 au niveau 5, +3 au niveau 9 ;
 *     la toucher rend 1 Instinct ; changer de cible coûte 1 Instinct ;
 *   - 4a : Embuscade (fusion de la Traque et du Piège) : Camouflage,
 *     Premier coup, Sens du danger et Repli, Collet et fosse avec le
 *     Déclencheur en réaction, Piège du grand gibier ;
 *   - 5a : Gâchette : Tir ajusté (+1 à distance, tir spécial −1 Instinct),
 *     recharge gratuite, Tir de couverture en réaction, Œil de lynx, Tir
 *     fatal (comme le Coup de maître du Guerrier) ;
 *   - 6a : Grande chasse : Marque affûtée (+1d4 contre la cible marquée),
 *     Connaître sa proie, Traque acharnée, Coup de grâce, Trophée ultime ;
 *   - 7a : Limier, un chien en jeton (src/regles/invocations.ts) : 5 + 2 ×
 *     niveau PV, DEF 13, morsure 1d6 + 2 ; Flair, Saisie, Meute, Curée ;
 *   - 8a : Voie du chaos aux signatures du cadre (src/regles/classes/chaos.ts) ;
 *   - 9a : Pisteur et Détection des pièges partent au Vécu ;
 *   - 10a : d8, armures de cuir, pas de bouclier ; DEX, caractéristique de
 *     classe (DD de ses pièges et de son chaos : 10 + mod de DEX).
 * Les bonus « contre la cible marquée » de la Marque et la Traque acharnée
 * sont écrits en texte : le combat (L6) les lit.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
const frappe = { type: 'degats', des: 'arme', typeDegats: 'physique' } as const;
const piege = { type: 'point', portee: 'contact' } as const;

export const ACTIONS_CHASSEUR: ActionSaisie[] = [
  // ---- Marque du chasseur (3a) ----
  {
    id: 'chasseur.marque',
    nom: 'Marque du chasseur',
    description: 'En action gratuite, il marque sa proie : +1 en attaque contre elle (+2 au niveau 5, +3 au niveau 9). La toucher lui rend 1 Instinct, une fois par round.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'gratuite',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: sansJet,
    effets: [
      { type: 'etat', etat: 'marque', duree: 'finCombat' },
      { type: 'narratif', texte: 'Contre la cible marquée : +1 en attaque (niveaux 1 à 4), +2 (5 à 8), +3 (9 et plus) ; la toucher rend 1 Instinct, une fois par round.', vise: 'lanceur' },
    ],
  },
  {
    id: 'chasseur.changer-de-marque',
    nom: 'Changer de proie',
    description: 'Pour 1 Instinct, en action gratuite, sa Marque passe sur une autre cible.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'gratuite',
    cout: [{ ressource: 'instinct', montant: 1 }],
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: sansJet,
    effets: [
      { type: 'etat', etat: 'marque', duree: 'finCombat' },
      { type: 'narratif', texte: 'L’ancienne cible n’est plus marquée.', vise: 'lanceur' },
    ],
  },

  // ---- Voie de l'embuscade (4a) ----
  {
    id: 'chasseur.camouflage',
    nom: 'Camouflage',
    description: 'En action mineure, immobile en milieu naturel : il se déclare Dissimulé (validé par le MJ).',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'mineure',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'etat', etat: 'dissimule', duree: 'finCombat', condition: 'immobile', vise: 'lanceur' }],
    horsCombat: { paliers: ['À l’affût en milieu naturel, il passe inaperçu tant qu’il ne bouge pas.'] },
  },
  {
    id: 'chasseur.premier-coup',
    nom: 'Premier coup',
    description: '+1d6 aux dégâts contre une cible qui n’a pas encore agi dans ce combat.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'degats', valeur: '1d6', typeDegats: 'physique', duree: 'permanente', condition: 'cibleNAPasAgi', vise: 'lanceur' }],
  },
  {
    id: 'chasseur.sens-du-danger',
    nom: 'Sens du danger',
    description: 'Il ne peut pas être surpris ; +2 à l’initiative.',
    nature: 'passif',
    rang: 3,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'initiative', valeur: 2, duree: 'permanente', vise: 'lanceur' },
      { type: 'narratif', texte: 'Ne peut pas être surpris.', vise: 'lanceur' },
    ],
  },
  {
    id: 'chasseur.repli',
    nom: 'Repli',
    description: 'Un ennemi arrive à son contact : il recule de 2 cases, en réaction.',
    nature: 'reaction',
    rang: 3,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'ennemiArriveAuContact',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'deplacement', sens: 'libre', cases: 2, vise: 'lanceur' }],
  },
  {
    id: 'chasseur.collet',
    nom: 'Collet',
    description: 'En action mineure, un collet sur une case adjacente. Un ennemi qui y finit son déplacement : DEX contre sa DEF ; pris, Immobilisé 1 round.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'mineure',
    attaquePar: 'DEX',
    ciblage: piege,
    zone: { forme: 'carre', taille: 1, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'attaque' },
    persistance: { type: 'zone', duree: 'finCombat', quand: 'finDeplacement' },
    effets: [
      { type: 'etat', etat: 'immobilise', duree: { rounds: 1 }, vise: 'zone' },
      { type: 'narratif', texte: 'Usage unique : le collet disparaît une fois déclenché.', vise: 'lanceur' },
    ],
  },
  {
    id: 'chasseur.fosse',
    nom: 'Fosse dissimulée',
    description: 'Une fosse sur une case adjacente. Un ennemi qui y finit son déplacement : DEX contre sa DEF ; touché, 2d6.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    attaquePar: 'DEX',
    ciblage: piege,
    zone: { forme: 'carre', taille: 1, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'attaque' },
    persistance: { type: 'zone', duree: 'finCombat', quand: 'finDeplacement' },
    effets: [
      { type: 'degats', des: '2d6', typeDegats: 'physique', vise: 'zone' },
      { type: 'narratif', texte: 'Usage unique : la fosse est découverte une fois déclenchée.', vise: 'lanceur' },
    ],
  },
  {
    id: 'chasseur.declencheur',
    nom: 'Déclencheur',
    description: 'En réaction, il déclenche l’un de ses pièges quand une créature est sur sa case, sans attendre la fin de son déplacement.',
    nature: 'reaction',
    rang: 4,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'aToutMoment',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Le piège choisi se déclenche maintenant.', vise: 'lanceur' }],
  },
  {
    id: 'chasseur.piege-du-grand-gibier',
    nom: 'Piège du grand gibier',
    description: 'Une fois par scénario, un piège de 2 × 2 cases : DEX contre la DEF ; touché, 4d6 et Immobilisé 1 round. Fait pour une grande créature.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    attaquePar: 'DEX',
    ciblage: { type: 'point', portee: 'contact' },
    zone: { forme: 'carre', taille: 2, origine: 'point', filtre: 'ennemis' },
    resolution: { jet: 'attaque' },
    persistance: { type: 'zone', duree: 'finCombat', quand: 'finDeplacement' },
    effets: [
      { type: 'degats', des: '4d6', typeDegats: 'physique', vise: 'zone' },
      { type: 'etat', etat: 'immobilise', duree: { rounds: 1 }, vise: 'zone' },
    ],
  },

  // ---- Voie de la gâchette (5a) ----
  {
    id: 'chasseur.tir-ajuste',
    nom: 'Tir ajusté',
    description: '+1 en attaque à distance.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'attaqueDistance', valeur: 1, duree: 'permanente', vise: 'lanceur' }],
  },
  {
    id: 'chasseur.cadence',
    nom: 'Cadence affûtée',
    description: 'Recharger devient une action gratuite.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Recharger une arme est une action gratuite.', vise: 'lanceur' }],
  },
  {
    id: 'chasseur.tir-de-couverture',
    nom: 'Tir de couverture',
    description: 'Un ennemi attaque un allié : il le gêne d’un tir, −2 à cette attaque. Elle prend la réaction du round.',
    nature: 'reaction',
    rang: 3,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'allieCible',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'attaque', valeur: -2, duree: 'prochainTour' }],
  },
  {
    id: 'chasseur.oeil-de-lynx',
    nom: 'Œil de lynx',
    description: 'Il ignore les pénalités de couvert partiel et de distance.',
    nature: 'passif',
    rang: 4,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Ignore le couvert partiel et les pénalités de distance.', vise: 'lanceur' }],
  },

  // ---- Voie de la grande chasse (6a) ----
  {
    id: 'chasseur.marque-affutee',
    nom: 'Marque affûtée',
    description: '+1d4 aux dégâts contre sa cible marquée.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'degats', valeur: '1d4', typeDegats: 'physique', duree: 'permanente', condition: 'cibleMarquee', vise: 'lanceur' }],
  },
  {
    id: 'chasseur.connaitre-sa-proie',
    nom: 'Connaître sa proie',
    description: 'Un test sur sa cible marquée lui révèle une faiblesse : une résistance ou une vulnérabilité.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat', 'exploration'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Le MJ révèle une résistance ou une vulnérabilité de la cible.' }],
    manuel: 'Le MJ fixe la difficulté du test et choisit la faiblesse révélée.',
  },
  {
    id: 'chasseur.traque-acharnee',
    nom: 'Traque acharnée',
    description: 'En poursuivant sa cible marquée : +2 cases de déplacement, et il ignore le terrain difficile.',
    nature: 'passif',
    rang: 3,
    etiquettes: ['combat', 'exploration'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Vers sa cible marquée : +2 cases de déplacement, terrain difficile ignoré.', vise: 'lanceur' }],
  },
  {
    id: 'chasseur.coup-de-grace',
    nom: 'Coup de grâce',
    description: '+1d8 aux dégâts contre sa cible marquée quand elle est sous la moitié de ses PV.',
    nature: 'passif',
    rang: 4,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'degats', valeur: '1d8', typeDegats: 'physique', duree: 'permanente', condition: 'cibleMarquee', vise: 'lanceur' },
      { type: 'narratif', texte: 'Seulement si la cible marquée est sous la moitié de ses PV.', vise: 'lanceur' },
    ],
  },
  {
    id: 'chasseur.trophee-ultime',
    nom: 'Trophée ultime',
    description: 'Une fois par scénario, une attaque contre sa cible marquée : elle ignore la moitié de sa réduction de dégâts, +3d6.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [
      frappe,
      { type: 'degats', des: '3d6', typeDegats: 'physique', condition: 'cibleMarquee' },
      { type: 'narratif', texte: 'La réduction de dégâts de la cible compte pour moitié.' },
    ],
  },

  // ---- Voie du limier (7a) ----
  {
    id: 'chasseur.limier',
    nom: 'Limier',
    description: 'Son chien de chasse le suit au combat : un jeton sur la battlemap, qui agit au tour du Chasseur.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat', 'exploration'],
    action: 'mineure',
    limite: '1x/combat',
    ciblage: { type: 'point', portee: 'contact' },
    resolution: sansJet,
    effets: [{ type: 'invocation', creature: 'limier', duree: 'finCombat' }],
  },
  {
    id: 'chasseur.curee',
    nom: 'Curée',
    description: 'Une fois par combat, lui et son chien frappent la même cible : une attaque du Chasseur à +2d6, et une morsure du chien.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [
      frappe,
      { type: 'degats', des: '2d6', typeDegats: 'physique' },
      { type: 'narratif', texte: 'Le chien mord la même cible, à +2d6 lui aussi.', vise: 'lanceur' },
    ],
  },
];

export const VOIES_CHASSEUR: VoieSaisie[] = [
  {
    id: 'chasseur.embuscade',
    nom: 'Voie de l’embuscade',
    description: 'L’affût et le piège : frapper avant d’être vu, attendre que la proie vienne.',
    rangs: [
      { rang: 1, nom: 'Camouflage', description: 'Immobile en milieu naturel, il se déclare Dissimulé.', actions: ['chasseur.camouflage'] },
      { rang: 2, nom: 'Premier coup', description: '+1d6 contre une cible qui n’a pas encore agi.', actions: ['chasseur.premier-coup'] },
      { rang: 3, nom: 'Sens du danger', description: 'Jamais surpris, +2 initiative ; Repli en réaction.', actions: ['chasseur.sens-du-danger', 'chasseur.repli'] },
      { rang: 4, nom: 'Collet et fosse', description: 'Pièges : Immobilisé, ou 2d6 ; Déclencheur en réaction.', actions: ['chasseur.collet', 'chasseur.fosse', 'chasseur.declencheur'] },
      { rang: 5, nom: 'Piège du grand gibier', description: '1x/scénario : 4d6 et Immobilisé sur 2 × 2 cases.', actions: ['chasseur.piege-du-grand-gibier'] },
    ],
  },
  {
    id: 'chasseur.gachette',
    nom: 'Voie de la gâchette',
    description: 'La maîtrise du tir : chaque projectile compte.',
    rangs: [
      {
        rang: 1,
        nom: 'Tir ajusté',
        description: '+1 à distance ; ses tirs spéciaux coûtent 1 Instinct de moins.',
        actions: ['chasseur.tir-ajuste'],
        regles: [{ type: 'capacite', nom: 'maniementExpert' }],
      },
      { rang: 2, nom: 'Cadence affûtée', description: 'Recharger est une action gratuite.', actions: ['chasseur.cadence'] },
      { rang: 3, nom: 'Tir de couverture', description: 'Réaction : −2 à l’attaque d’un ennemi contre un allié.', actions: ['chasseur.tir-de-couverture'] },
      { rang: 4, nom: 'Œil de lynx', description: 'Ignore couvert partiel et distance.', actions: ['chasseur.oeil-de-lynx'] },
      { rang: 5, nom: 'Tir fatal', description: '1x/combat, un tir spécial pose deux états, ou porte l’arme et un élément.', regles: [{ type: 'capacite', nom: 'coupDeMaitre', limite: '1x/combat' }] },
    ],
  },
  {
    id: 'chasseur.grande-chasse',
    nom: 'Voie de la grande chasse',
    description: 'Une proie, une seule : la Marque devient une condamnation.',
    rangs: [
      { rang: 1, nom: 'Marque affûtée', description: '+1d4 contre la cible marquée.', actions: ['chasseur.marque-affutee'] },
      { rang: 2, nom: 'Connaître sa proie', description: 'Un test révèle une faiblesse de la cible marquée.', actions: ['chasseur.connaitre-sa-proie'] },
      { rang: 3, nom: 'Traque acharnée', description: '+2 cases et terrain difficile ignoré vers la cible marquée.', actions: ['chasseur.traque-acharnee'] },
      { rang: 4, nom: 'Coup de grâce', description: '+1d8 contre la cible marquée sous la moitié de ses PV.', actions: ['chasseur.coup-de-grace'] },
      { rang: 5, nom: 'Trophée ultime', description: '1x/scénario : +3d6, moitié de la réduction de dégâts ignorée.', actions: ['chasseur.trophee-ultime'] },
    ],
  },
  {
    id: 'chasseur.limier',
    nom: 'Voie du limier',
    description: 'Un chien de chasse dressé, qui traque et mord avec lui.',
    rangs: [
      { rang: 1, nom: 'Limier', description: 'Le chien, un jeton qui agit au tour du Chasseur.', actions: ['chasseur.limier'] },
      { rang: 2, nom: 'Flair', description: 'Le chien détecte Dissimulé et Invisible à 2 cases.', regles: [{ type: 'texte', texte: 'Flair : le limier détecte les créatures Dissimulées ou Invisibles à 2 cases.' }] },
      { rang: 3, nom: 'Saisie', description: 'Sa morsure immobilise.', regles: [{ type: 'texte', texte: 'Saisie : une morsure du limier qui touche immobilise la cible 1 round.' }] },
      { rang: 4, nom: 'Meute', description: 'Le chien gagne une réaction ; tenaille avec le Chasseur.', regles: [{ type: 'texte', texte: 'Meute : le limier a une réaction (attaque d’opportunité) ; lui et le Chasseur au contact d’une même cible ont +2 en attaque contre elle.' }] },
      { rang: 5, nom: 'Curée', description: '1x/combat : le Chasseur et le chien frappent ensemble, +2d6.', actions: ['chasseur.curee'] },
    ],
  },
];

export const CHASSEUR: ClasseSaisie = {
  id: 'chasseur',
  nom: 'Chasseur',
  famille: 'physique',
  deVie: 8,
  caracMagie: 'DEX',
  ressourceDeClasse: { ressource: 'instinct', base: 3, diviseurNiveau: 3, recharge: 'reposCourt' },
  attaquesSpeciales: { familles: ['arc', 'arbalete', 'dague', 'armeAFeu', 'tromblon'], cout: { ressource: 'instinct', montant: 2 } },
  actionsDeClasse: ['chasseur.marque', 'chasseur.changer-de-marque'],
  voies: ['chasseur.embuscade', 'chasseur.gachette', 'chasseur.grande-chasse', 'chasseur.limier', 'chasseur.chaos'],
  creation: {},
  mineurs: { liste: [], creation: 0, plusUnAuNiveau: [] },
};
