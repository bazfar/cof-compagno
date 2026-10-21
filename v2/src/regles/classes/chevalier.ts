import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Le Chevalier de la refonte (lot L4.13). Source : doc « Refonte classes et
 * magie — cadre », « Classes physiques », « Ressources de classe (validé) »,
 * « Chevalier » et « Doublons entre classes » ; voies v1
 * (src/donnees/classes.json) pour les chiffres que le cadre garde.
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - 1a : Honneur = 3 + niveau / 3, rechargé au repos long, gardé d'un
 *     combat à l'autre ; +2 en gagnant un duel, +1 en encaissant pour un
 *     allié (appliqués par le combat, L6), +1 par acte honorable (le MJ) ;
 *   - 2a : attaques spéciales des familles de contact et du bouclier (la v1
 *     « dédaigne les armes à distance »), 2 Honneur ;
 *   - 3a : Interposition, réaction de classe gratuite, qui prend la
 *     réaction du round ;
 *   - 4b : Maniement expert aussi (attaque spéciale à 1 Honneur), au rang 1
 *     de la Voie du bouclier, avec la Garde rapprochée ;
 *   - 5a : Noble, chiffres v1 ; le Défi loyal coûte 1 Honneur ;
 *   - 6a : Commandant inchangé, Ordre bref en action mineure, Coordination
 *     à condition d'être immobile ;
 *   - 7a : Bouclier (ex-Protecteur) : Garde rapprochée active pour
 *     1 Honneur, Garde à distance (Interposition à 2 cases), Bouclier
 *     vivant, Mur de boucliers (ex-Rempart), Sacrifice ultime ;
 *   - 8a : Paladin ; le Jugement devient Mise en accusation (doublon avec
 *     le Prêtre) ; le MJ dit qui est coupable : la cible accusée porte
 *     l'état Accusé, et Châtiment et Sentence ne frappent qu'elle ;
 *   - 9a : Voie du chaos aux signatures du cadre (src/regles/classes/chaos.ts) ;
 *   - 10a : d10, armes de contact, toutes armures et bouclier (v1) ;
 *   - 11a : Regard du juste, Autorité de sang et Défi loyal servent aussi en
 *     scène sociale.
 * Le Défi loyal oppose CHA à Volonté : la caractéristique de classe est le
 * CHA (DD 10 + mod de CHA, comme les sauvegardes du chaos, décision 2a du
 * lot L4.9). Les bonus « contre une seule cible » (duel) et les
 * redirections de dégâts sont écrits en texte : le combat (L6) les lit.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
const honneur = (montant: number) => [{ ressource: 'honneur' as const, montant }];

export const ACTIONS_CHEVALIER: ActionSaisie[] = [
  // ---- Réaction de classe (3a) ----
  {
    id: 'chevalier.interposition',
    nom: 'Interposition',
    description: 'Un allié à son contact est ciblé par une attaque : le Chevalier s’interpose et devient la cible à sa place. Elle prend la réaction du round.',
    nature: 'reaction',
    rang: 1,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'allieCible',
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Le Chevalier devient la cible de l’attaque à la place de l’allié.' }],
  },

  // ---- Voie du noble ----
  {
    id: 'chevalier.prestance-martiale',
    nom: 'Prestance martiale',
    description: '+ mod de CHA à l’initiative.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'initiative', valeur: { mod: 'CHA' }, duree: 'permanente', vise: 'lanceur' }],
  },
  {
    id: 'chevalier.defi-loyal',
    nom: 'Défi loyal',
    description: 'Pour 1 Honneur, il défie un ennemi en vue (CHA contre Volonté) : jusqu’à son prochain tour, la cible a −2 à tous ses tests si elle n’attaque pas le Chevalier.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat', 'social'],
    action: 'action',
    cout: honneur(1),
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'defie', duree: 'prochainTour' }],
    horsCombat: { paliers: ['Un défi public : l’autre relève le gant ou perd la face devant témoins.'] },
  },
  {
    id: 'chevalier.autorite-de-sang',
    nom: 'Autorité de sang',
    description: 'Tant qu’il est conscient, les alliés à 3 cases ont +1 aux sauvegardes de Volonté.',
    nature: 'passif',
    rang: 3,
    etiquettes: ['combat', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 3, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'sauvegardeVolonte', valeur: 1, duree: 'permanente', vise: 'zone' }],
    horsCombat: { paliers: ['Son nom ouvre les portes : une audience, un passage, un service qu’on n’aurait pas rendu à un autre.'] },
  },
  {
    id: 'chevalier.duel-d-honneur',
    nom: 'Duel d’honneur',
    description: 'Une fois par combat, il défie une cible en duel singulier : +2 en attaque et en DEF contre elle tant que dure le duel, mais −2 en DEF contre toute autre. Gagner le duel rend 2 Honneur.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: sansJet,
    effets: [
      { type: 'etat', etat: 'duel', duree: 'finCombat' },
      { type: 'narratif', texte: 'Contre la cible en duel : +2 en attaque et en DEF ; contre toute autre : −2 en DEF.', vise: 'lanceur' },
    ],
  },
  {
    id: 'chevalier.souverain-du-champ-de-bataille',
    nom: 'Souverain du champ de bataille',
    description: 'Une fois par scénario : lui et ses alliés à 5 cases gagnent +2 en attaque et en DEF pendant 3 + mod de CHA rounds.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 5, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    persistance: { type: 'zone', duree: { base: 3, plusModCible: 'CHA' }, quand: 'debutTour' },
    effets: [
      { type: 'bonus', cible: 'attaque', valeur: 2, duree: 'prochainTour', vise: 'zone' },
      { type: 'bonus', cible: 'DEF', valeur: 2, duree: 'prochainTour', vise: 'zone' },
    ],
  },

  // ---- Voie du commandant ----
  {
    id: 'chevalier.ordre-bref',
    nom: 'Ordre bref',
    description: 'En action mineure, il désigne un allié en vue : +2 à son prochain jet d’attaque.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'mineure',
    ciblage: { type: 'creature', camp: 'allie', portee: 20 },
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'attaque', valeur: 2, duree: 'prochainTour' }],
  },
  {
    id: 'chevalier.coordination',
    nom: 'Coordination',
    description: 'Tant qu’il n’a pas entamé son déplacement ce tour, les alliés à 2 cases ont +1 DEF.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 2, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 1, duree: 'prochainTour', condition: 'immobile', vise: 'zone' }],
  },
  {
    id: 'chevalier.manoeuvre-engagee',
    nom: 'Manœuvre engagée',
    description: 'Un allié à portée de voix fait son déplacement complet sans y dépenser son action de mouvement ce tour.',
    nature: 'capacite',
    rang: 3,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'allie', portee: 20 },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'L’allié se déplace sans dépenser son action de mouvement ce tour.' }],
  },
  {
    id: 'chevalier.elan-tactique',
    nom: 'Élan tactique',
    description: 'Une fois par combat, il donne une action principale en plus à un allié.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'allie', portee: 20 },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'L’allié gagne une action principale en plus, à jouer à son tour.' }],
  },
  {
    id: 'chevalier.charge-collective',
    nom: 'Charge collective',
    description: 'Une fois par combat, il marque un ennemi : tout allié qui le frappe ensuite gagne +2 en attaque et +3 aux dégâts. Tous les PJ gagnent +5 cases de déplacement ce tour.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: sansJet,
    effets: [
      { type: 'etat', etat: 'marque', duree: 'finCombat' },
      { type: 'narratif', texte: 'Contre la cible marquée : +2 en attaque et +3 aux dégâts pour tous les alliés.' },
      { type: 'narratif', texte: 'Tous les PJ gagnent +5 cases de déplacement ce tour.', vise: 'lanceur' },
    ],
  },

  // ---- Voie du bouclier (ex-Protecteur, 7a) ----
  {
    id: 'chevalier.garde-rapprochee',
    nom: 'Garde rapprochée',
    description: 'Pour 1 Honneur, il prend sous sa garde un allié à son contact : +2 DEF tant qu’il reste à son contact, jusqu’à la fin du combat ou un autre protégé.',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['combat'],
    action: 'mineure',
    cout: honneur(1),
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: sansJet,
    effets: [{ type: 'etat', etat: 'protege', duree: 'finCombat' }],
  },
  {
    id: 'chevalier.garde-a-distance',
    nom: 'Garde à distance',
    description: 'Un allié à 2 cases est ciblé par une attaque : il s’interpose et devient la cible à sa place. Elle prend la réaction du round.',
    nature: 'reaction',
    rang: 2,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'allieCible',
    ciblage: { type: 'creature', camp: 'allie', portee: 2 },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Le Chevalier bondit jusqu’à l’allié et devient la cible de l’attaque à sa place.' }],
  },
  {
    id: 'chevalier.bouclier-vivant',
    nom: 'Bouclier vivant',
    description: 'Un allié à son contact est touché : ses dégâts sont réduits de mod de CON + niveau / 2, que le Chevalier subit à sa place. Elle prend la réaction du round.',
    nature: 'reaction',
    rang: 3,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'allieCible',
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Dégâts de l’allié réduits de mod de CON + niveau / 2 ; le Chevalier subit cette part.' }],
  },
  {
    id: 'chevalier.mur-de-boucliers',
    nom: 'Mur de boucliers',
    description: 'Les alliés à son contact réduisent de 2 les dégâts qu’ils subissent.',
    nature: 'passif',
    rang: 4,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 1, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'reductionDegats', valeur: 2, duree: 'permanente', vise: 'zone' }],
  },
  {
    id: 'chevalier.sacrifice-ultime',
    nom: 'Sacrifice ultime',
    description: 'Une fois par scénario, pendant 1 round : tous les dégâts destinés aux alliés à 2 cases sont redirigés vers lui.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 2, origine: 'lanceur', filtre: 'allies' },
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Pendant 1 round, les dégâts destinés aux alliés à 2 cases sont redirigés vers le Chevalier.', vise: 'lanceur' }],
  },

  // ---- Voie du paladin (8a) ----
  {
    id: 'chevalier.regard-du-juste',
    nom: 'Regard du juste',
    description: 'Une fois par scène, CHA contre Volonté : il sait si son interlocuteur ment sciemment (« il ment » ou « il dit vrai », sans détail).',
    nature: 'capacite',
    rang: 1,
    etiquettes: ['social'],
    action: 'action',
    limite: '1x/scene',
    ciblage: { type: 'creature', camp: 'toute', portee: 5 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'narratif', texte: 'Le MJ dit si la cible ment sciemment.' }],
    horsCombat: { paliers: ['En interrogatoire ou en négociation : il sait si l’autre ment sciemment.'], reussites: 1 },
  },
  {
    id: 'chevalier.chatiment-du-juste',
    nom: 'Châtiment du juste',
    description: 'Une attaque à l’arme ; contre une cible accusée, +1d6 dégâts sacrés.',
    nature: 'capacite',
    rang: 2,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [
      { type: 'degats', des: 'arme', typeDegats: 'physique' },
      { type: 'degats', des: '1d6', typeDegats: 'sacre', condition: 'cibleAccusee' },
    ],
  },
  {
    id: 'chevalier.mise-en-accusation',
    nom: 'Mise en accusation',
    description: 'Une fois par combat, il accuse formellement une cible. Coupable (le MJ en juge) : −4 en attaque et en DEF jusqu’à la fin du combat. Innocente : rien, sans que le Chevalier le sache.',
    nature: 'capacite',
    rang: 3,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: sansJet,
    effets: [{ type: 'etat', etat: 'accuse', duree: 'finCombat' }],
    manuel: 'Le MJ dit si la cible est coupable ; innocente, il retire l’état Accusé sans le dire.',
  },
  {
    id: 'chevalier.verdict-inebranlable',
    nom: 'Verdict inébranlable',
    description: 'Avantage aux tests et sauvegardes contre la tromperie, l’illusion et la manipulation mentale.',
    nature: 'passif',
    rang: 4,
    etiquettes: ['combat', 'social'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Avantage contre la tromperie, l’illusion et la manipulation mentale.', vise: 'lanceur' }],
  },
  {
    id: 'chevalier.sentence-finale',
    nom: 'Sentence finale',
    description: 'Une fois par scénario, une attaque à l’arme contre une cible accusée : +6d6 dégâts sacrés, doublés contre les démons et les morts-vivants.',
    nature: 'capacite',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/scenario',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [
      { type: 'degats', des: 'arme', typeDegats: 'physique' },
      { type: 'degats', des: '6d6', typeDegats: 'sacre', doubleContre: 'demonsMortsVivants', condition: 'cibleAccusee' },
    ],
  },
];

export const VOIES_CHEVALIER: VoieSaisie[] = [
  {
    id: 'chevalier.noble',
    nom: 'Voie du noble',
    description: 'L’aristocrate : défier, imposer, régner sur le champ de bataille.',
    rangs: [
      { rang: 1, nom: 'Prestance martiale', description: '+ mod de CHA à l’initiative.', actions: ['chevalier.prestance-martiale'] },
      { rang: 2, nom: 'Défi loyal', description: '1 Honneur : −2 à tous ses tests si la cible n’attaque pas le Chevalier.', actions: ['chevalier.defi-loyal'] },
      { rang: 3, nom: 'Autorité de sang', description: '+1 aux sauvegardes de Volonté des alliés à 3 cases.', actions: ['chevalier.autorite-de-sang'] },
      { rang: 4, nom: 'Duel d’honneur', description: '1x/combat : +2 en attaque et en DEF contre la cible, −2 en DEF contre les autres.', actions: ['chevalier.duel-d-honneur'] },
      { rang: 5, nom: 'Souverain du champ de bataille', description: '1x/scénario : +2 en attaque et en DEF, alliés à 5 cases, 3 + CHA rounds.', actions: ['chevalier.souverain-du-champ-de-bataille'] },
    ],
  },
  {
    id: 'chevalier.commandant',
    nom: 'Voie du commandant',
    description: 'Le meneur de troupes : ses ordres font agir les autres.',
    rangs: [
      { rang: 1, nom: 'Ordre bref', description: 'Action mineure : +2 à la prochaine attaque d’un allié.', actions: ['chevalier.ordre-bref'] },
      { rang: 2, nom: 'Coordination', description: 'Immobile, +1 DEF aux alliés à 2 cases.', actions: ['chevalier.coordination'] },
      { rang: 3, nom: 'Manœuvre engagée', description: 'Un allié se déplace sans dépenser son action de mouvement.', actions: ['chevalier.manoeuvre-engagee'] },
      { rang: 4, nom: 'Élan tactique', description: '1x/combat : une action principale en plus à un allié.', actions: ['chevalier.elan-tactique'] },
      { rang: 5, nom: 'Charge collective', description: '1x/combat : +2 en attaque et +3 aux dégâts contre la cible marquée ; +5 cases aux PJ.', actions: ['chevalier.charge-collective'] },
    ],
  },
  {
    id: 'chevalier.bouclier',
    nom: 'Voie du bouclier',
    description: 'L’ex-Protecteur : le rempart qui encaisse pour les autres.',
    rangs: [
      {
        rang: 1,
        nom: 'Garde rapprochée',
        description: '1 Honneur : +2 DEF à un allié à son contact ; ses attaques spéciales coûtent 1 Honneur de moins.',
        actions: ['chevalier.garde-rapprochee'],
        regles: [{ type: 'capacite', nom: 'maniementExpert' }],
      },
      { rang: 2, nom: 'Garde à distance', description: 'L’Interposition à 2 cases.', actions: ['chevalier.garde-a-distance'] },
      { rang: 3, nom: 'Bouclier vivant', description: 'Il encaisse une part des dégâts d’un allié.', actions: ['chevalier.bouclier-vivant'] },
      { rang: 4, nom: 'Mur de boucliers', description: '−2 aux dégâts subis par les alliés à son contact.', actions: ['chevalier.mur-de-boucliers'] },
      { rang: 5, nom: 'Sacrifice ultime', description: '1x/scénario : les dégâts des alliés à 2 cases redirigés vers lui 1 round.', actions: ['chevalier.sacrifice-ultime'] },
    ],
  },
  {
    id: 'chevalier.paladin',
    nom: 'Voie du paladin',
    description: 'Le justicier : il démasque, accuse et châtie.',
    rangs: [
      { rang: 1, nom: 'Regard du juste', description: '1x/scène : il sait si l’autre ment sciemment.', actions: ['chevalier.regard-du-juste'] },
      { rang: 2, nom: 'Châtiment du juste', description: '+1d6 sacrés contre une cible accusée.', actions: ['chevalier.chatiment-du-juste'] },
      { rang: 3, nom: 'Mise en accusation', description: '1x/combat : −4 en attaque et en DEF à la cible, si le MJ la juge coupable.', actions: ['chevalier.mise-en-accusation'] },
      { rang: 4, nom: 'Verdict inébranlable', description: 'Avantage contre tromperie, illusion et manipulation.', actions: ['chevalier.verdict-inebranlable'] },
      { rang: 5, nom: 'Sentence finale', description: '1x/scénario : +6d6 sacrés contre une cible accusée.', actions: ['chevalier.sentence-finale'] },
    ],
  },
];

export const CHEVALIER: ClasseSaisie = {
  id: 'chevalier',
  nom: 'Chevalier',
  famille: 'physique',
  deVie: 10,
  caracMagie: 'CHA',
  ressourceDeClasse: { ressource: 'honneur', base: 3, diviseurNiveau: 3, recharge: 'reposLong' },
  attaquesSpeciales: { familles: ['contondant', 'tranchantLourd', 'tranchantLeger', 'perforant', 'dague', 'bouclier', 'mainsNues'], cout: { ressource: 'honneur', montant: 2 } },
  actionsDeClasse: ['chevalier.interposition'],
  voies: ['chevalier.noble', 'chevalier.commandant', 'chevalier.bouclier', 'chevalier.paladin', 'chevalier.chaos'],
  creation: {},
  mineurs: { liste: [], creation: 0, plusUnAuNiveau: [] },
};
