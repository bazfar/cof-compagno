import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Le Barde de la refonte (lot L4.8), chef d'orchestre du groupe. Source :
 * doc « Refonte classes et magie — cadre », « Barde — Inspiration »,
 * « Ressources de classe (validé) » et « Verbes des hybrides (validé) » ;
 * voies v1 (src/donnees/classes.json) pour ce que le cadre garde.
 *
 * Décisions verrouillées :
 *   - hybride : PP réduits (4 + 2 × niveau + mod de CHA, règle v1), DD =
 *     10 + mod ; Inspiration = 2 + niveau / 4, pleine à la création, jamais
 *     rechargée d'office : +1 par 20 naturel, le sien ou celui de tout allié
 *     qui l'entend (décision 5b du 21/10/2026), ou par action inspirante
 *     (MJ) ; elle relance un d20 (1 point, réaction : le second jet compte,
 *     6a) ou booste un chant (1 point, un par sort : +1 cible ou +1 round) ;
 *   - sans élément de départ ; éléments ordinaires par don seulement ;
 *   - attaque spéciale perforante (rapière), une fois par combat, sans coût
 *     (décision 3c du lot L4.7) ;
 *   - sorts mineurs des hybrides : 1 à la création, +1 au niveau 7 ;
 *   - Voie du chant = son école, avec paliers ; les passifs v1 (Refrain
 *     lancinant, Dissonance profonde) deviennent ces paliers ;
 *   - Rapière : Précision et Intelligence du combat restent passifs ;
 *     Enchaînement et Botte mortelle conservés ; décisions de Thomas du
 *     21/10/2026 : armes légères = dagues, épée courte, cimeterre, rapière
 *     (7a) ; la Feinte est une attaque normale qui donne en plus l'avantage
 *     à la prochaine attaque contre la cible (8b) ; le Barde garde le nom
 *     Enchaînement, le rang 4 du Maître d'armes devient Coup double (9a) ;
 *     Botte mortelle : +2d6 contre une cible qui porte un état de malus ou
 *     de contrôle, « ignore 2 de réduction » attend les résistances du
 *     combat (10a) ;
 *   - Spectacle : l'Acrobate part au Vécu ; nouveau rang 1, Entrée en
 *     scène : +2 en initiative et +1 case au premier round (11b) ; Esquive
 *     acrobatique : réaction, 2 cases quand une attaque le rate, sans le
 *     +2 DEF de la v1 (12a) ; Échappée : réaction 1x/combat qui retire
 *     Immobilisé, Ralenti ou Renversé, l'immunité v1 disparaît (13a) ;
 *     Lanceur de couteau : une dague lancée à 5 cases, +1 en attaque aux
 *     armes de jet légères (14a) ;
 *   - Alcoolisme, rendue collective : servir un élixir est une action
 *     mineure, au contact, pour lui ou un allié ; le buveur fait le test de
 *     CON (DD 12 à 20 selon le rang, v1) : réussite, +rang à une
 *     caractéristique au choix pendant 3 + mod de CON du buveur rounds ;
 *     échec, moitié du bonus et 1 Ivresse (15a) ; Ivresse −1 à tous les
 *     tests par point, cumulable, jusqu'à la fin de la scène ; la tolérance
 *     v1 disparaît (16a) ; les doses viennent du métier de brassage.
 * La Voie du chaos : src/regles/classes/chaos.ts (lot L4.9).
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
const frappe = { type: 'degats', des: 'arme', typeDegats: 'physique' } as const;

const NOMS_ELIXIRS = ['Premier brassage', 'Mélange amélioré', 'Double dose', 'Distillation supérieure', 'Nectar ultime'] as const;

/** Un élixir de rang n (v1) : +n, test de CON 10 + 2n ; échec, moitié du bonus (à l'inférieur) et 1 Ivresse. */
const elixir = (n: number): ActionSaisie => {
  const duree = { base: 3, plusModCible: 'CON' } as const;
  const moitie = Math.floor(n / 2);
  return {
    id: `barde.elixir-${n}`,
    nom: NOMS_ELIXIRS[n - 1]!,
    description: `Un élixir de rang ${n} : +${n} à une caractéristique au choix, pendant 3 + mod de CON du buveur rounds ; test de CON ${10 + 2 * n}.`,
    nature: 'capacite',
    rang: n,
    etiquettes: ['combat', 'exploration'],
    action: 'mineure',
    ciblage: { type: 'creature', camp: 'allie', portee: 'contact' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'CON', siSauvegarde: 'rien', ddFixe: 10 + 2 * n },
    effets: [
      { type: 'bonus', cible: 'caracAuChoix', valeur: n, duree, condition: 'sauvegardeReussie' },
      ...(moitie ? [{ type: 'bonus' as const, cible: 'caracAuChoix' as const, valeur: moitie, duree, condition: 'sauvegardeRatee' as const }] : []),
      { type: 'etat', etat: 'ivresse', duree: 'scene', condition: 'sauvegardeRatee' },
    ],
  };
};

export const ACTIONS_BARDE: ActionSaisie[] = [
  // ---- Classe ----
  {
    id: 'barde.relance',
    nom: 'Inspiration : relance',
    description: 'Un d20 du Barde ou d’un allié qui l’entend vient de tomber : 1 Inspiration, et on le relance ; le second jet compte.',
    nature: 'reaction',
    rang: 1,
    etiquettes: ['combat', 'exploration', 'social'],
    action: 'reaction',
    declencheur: 'jetAllie',
    cout: [{ ressource: 'inspiration', montant: 1 }],
    ciblage: { type: 'creature', camp: 'allie', portee: 7 },
    resolution: sansJet,
    effets: [{ type: 'relance' }],
  },

  // ---- Voie de la rapière ----
  {
    id: 'barde.precision',
    nom: 'Précision',
    description: '+1 en attaque avec une arme légère.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'attaque', valeur: 1, duree: 'permanente', condition: 'armeLegere', vise: 'lanceur' }],
  },
  {
    id: 'barde.intelligence-du-combat',
    nom: 'Intelligence du combat',
    description: 'Son mod d’INT s’ajoute à son initiative et à sa DEF.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'initiative', valeur: { mod: 'INT' }, duree: 'permanente', vise: 'lanceur' },
      { type: 'bonus', cible: 'DEF', valeur: { mod: 'INT' }, duree: 'permanente', vise: 'lanceur' },
    ],
  },
  {
    id: 'barde.feinte',
    nom: 'Feinte',
    description: 'Une attaque qui ouvre la garde : si elle touche, la prochaine attaque contre la cible a l’avantage, jusqu’à son prochain tour.',
    nature: 'technique',
    rang: 3,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [frappe, { type: 'etat', etat: 'feinte', duree: 'prochainTour' }],
  },
  {
    id: 'barde.enchainement',
    nom: 'Enchaînement',
    description: 'Une attaque de plus ce tour avec une arme légère ; −2 aux deux attaques.',
    nature: 'capacite',
    rang: 4,
    etiquettes: ['combat'],
    action: 'gratuite',
    limite: '1x/round',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'attaque', valeur: -2, duree: 'prochainTour', vise: 'lanceur' },
      { type: 'narratif', texte: 'Une attaque de plus ce tour, avec une arme légère.', vise: 'lanceur' },
    ],
  },
  {
    id: 'barde.botte-mortelle',
    nom: 'Botte mortelle',
    description: 'Une fois par combat : +2d6 contre une cible déjà affaiblie (malus ou contrôle) ; ignore 2 de réduction des dégâts.',
    nature: 'technique',
    rang: 5,
    etiquettes: ['combat'],
    action: 'action',
    limite: '1x/combat',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [
      frappe,
      { type: 'degats', des: '2d6', typeDegats: 'physique', condition: 'cibleAffaiblie' },
      { type: 'narratif', texte: 'Ignore 2 points de réduction des dégâts (avec les résistances du combat).', condition: 'touche' },
    ],
  },

  // ---- Voie du spectacle ----
  {
    id: 'barde.entree-en-scene',
    nom: 'Entrée en scène',
    description: '+2 en initiative ; +1 case de déplacement au premier round.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'initiative', valeur: 2, duree: 'permanente', vise: 'lanceur' },
      { type: 'bonus', cible: 'deplacement', valeur: 1, duree: 'prochainTour', condition: 'premierRound', vise: 'lanceur' },
    ],
  },
  {
    id: 'barde.grace-feline',
    nom: 'Grâce féline',
    description: '+1 case de déplacement ; se relever est une action gratuite.',
    nature: 'passif',
    rang: 2,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [
      { type: 'bonus', cible: 'deplacement', valeur: 1, duree: 'permanente', vise: 'lanceur' },
      { type: 'narratif', texte: 'Se relever est une action gratuite.', vise: 'lanceur' },
    ],
  },
  {
    id: 'barde.lancer-un-couteau',
    nom: 'Lancer un couteau',
    description: 'Une dague lancée jusqu’à 5 cases : dés de la dague + mod de DEX (la fiche passe ce bonus de dégâts).',
    nature: 'technique',
    rang: 3,
    etiquettes: ['combat'],
    action: 'action',
    armes: ['dague'],
    ciblage: { type: 'creature', camp: 'ennemi', portee: 5 },
    resolution: { jet: 'attaque' },
    effets: [frappe],
  },
  {
    id: 'barde.lanceur-de-couteau',
    nom: 'Lanceur de couteau',
    description: '+1 en attaque avec les armes de jet légères.',
    nature: 'passif',
    rang: 3,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'attaqueDistance', valeur: 1, duree: 'permanente', condition: 'armeLegere', vise: 'lanceur' }],
  },
  {
    id: 'barde.esquive-acrobatique',
    nom: 'Esquive acrobatique',
    description: 'Une attaque le rate : il bondit de 2 cases.',
    nature: 'reaction',
    rang: 4,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'attaqueRatee',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'deplacement', sens: 'libre', cases: 2, vise: 'lanceur' }],
  },
  {
    id: 'barde.echappee',
    nom: 'Échappée',
    description: 'Une fois par combat, en réaction : il se libère d’une entrave (Immobilisé, Ralenti ou Renversé).',
    nature: 'reaction',
    rang: 5,
    etiquettes: ['combat'],
    action: 'reaction',
    limite: '1x/combat',
    declencheur: 'etatSubi',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'retraitEtat', etats: ['immobilise', 'ralenti', 'renverse'], nombre: 1, vise: 'lanceur' }],
  },

  // ---- Voie de l'alcoolisme ----
  ...[1, 2, 3, 4, 5].map(elixir),
];

export const VOIES_BARDE: VoieSaisie[] = [
  {
    id: 'barde.chant',
    nom: 'Voie du chant',
    description: 'Son école : renforcer les alliés, défaire les ennemis.',
    rangs: [
      { rang: 1, nom: 'Note discordante', description: 'Le verbe de rang 1 du chant ; le chant est Adepte.', regles: [{ type: 'verbeDeLEcole', ecole: 'chant' }, { type: 'maitriseEcole', niveau: 'adepte' }] },
      { rang: 2, nom: 'Ballade', description: 'Le verbe de rang 2 du chant.', regles: [{ type: 'verbeDeLEcole', ecole: 'chant' }] },
      { rang: 3, nom: 'Chant brisant', description: 'Le verbe de rang 3 ; Note discordante passe au palier II.', regles: [{ type: 'verbeDeLEcole', ecole: 'chant' }] },
      { rang: 4, nom: 'Contre-chant', description: 'Le verbe de rang 4 ; Ballade passe au palier II.', regles: [{ type: 'verbeDeLEcole', ecole: 'chant' }] },
      { rang: 5, nom: 'Requiem du silence', description: 'Le verbe de rang 5 (1x/combat) ; Note discordante III, Chant brisant II.', regles: [{ type: 'verbeDeLEcole', ecole: 'chant' }] },
    ],
  },
  {
    id: 'barde.rapiere',
    nom: 'Voie de la rapière',
    description: 'L’escrime légère, la précision avant la force.',
    rangs: [
      {
        rang: 1,
        nom: 'Précision',
        description: '+1 en attaque avec une arme légère.',
        actions: ['barde.precision'],
        regles: [{ type: 'texte', texte: 'Précision : avec une arme légère, le Barde attaque à son score d’attaque normal.' }],
      },
      { rang: 2, nom: 'Intelligence du combat', description: '+ mod d’INT en initiative et en DEF.', actions: ['barde.intelligence-du-combat'] },
      { rang: 3, nom: 'Feinte', description: 'Une attaque qui donne l’avantage à la suivante.', actions: ['barde.feinte'] },
      { rang: 4, nom: 'Enchaînement', description: 'Une attaque de plus, −2 aux deux.', actions: ['barde.enchainement'] },
      { rang: 5, nom: 'Botte mortelle', description: '1x/combat, +2d6 contre une cible affaiblie.', actions: ['barde.botte-mortelle'] },
    ],
  },
  {
    id: 'barde.spectacle',
    nom: 'Voie du spectacle',
    description: 'Présence scénique, esquive et lames lancées.',
    rangs: [
      { rang: 1, nom: 'Entrée en scène', description: '+2 en initiative, +1 case au premier round.', actions: ['barde.entree-en-scene'] },
      { rang: 2, nom: 'Grâce féline', description: '+1 case ; se relever est gratuit.', actions: ['barde.grace-feline'] },
      { rang: 3, nom: 'Lanceur de couteau', description: 'Une dague lancée à 5 cases ; +1 aux armes de jet légères.', actions: ['barde.lancer-un-couteau', 'barde.lanceur-de-couteau'] },
      { rang: 4, nom: 'Esquive acrobatique', description: 'Réaction : 2 cases quand une attaque le rate.', actions: ['barde.esquive-acrobatique'] },
      { rang: 5, nom: 'Échappée', description: 'Réaction 1x/combat : se libérer d’une entrave.', actions: ['barde.echappee'] },
    ],
  },
  {
    id: 'barde.alcoolisme',
    nom: 'Voie de l’alcoolisme',
    description: 'Ses élixirs servent à tout le groupe, avec l’Ivresse pour prix.',
    rangs: [
      {
        rang: 1,
        nom: 'Premier brassage',
        description: 'Élixir de rang 1 : +1, test de CON 12.',
        actions: ['barde.elixir-1'],
        regles: [{ type: 'texte', texte: 'Les doses se brassent au métier de brassage ; l’app ne les compte pas encore.' }],
      },
      { rang: 2, nom: 'Mélange amélioré', description: 'Élixir de rang 2 : +2, test de CON 14.', actions: ['barde.elixir-2'] },
      {
        rang: 3,
        nom: 'Double dose',
        description: 'Élixir de rang 3 : +3, test de CON 16 ; deux élixirs actifs à la fois.',
        actions: ['barde.elixir-3'],
        regles: [{ type: 'texte', texte: 'Double dose : un buveur peut avoir deux élixirs actifs à la fois.' }],
      },
      { rang: 4, nom: 'Distillation supérieure', description: 'Élixir de rang 4 : +4, test de CON 18.', actions: ['barde.elixir-4'] },
      { rang: 5, nom: 'Nectar ultime', description: 'Élixir de rang 5 : +5, test de CON 20.', actions: ['barde.elixir-5'] },
    ],
  },
];

export const BARDE: ClasseSaisie = {
  id: 'barde',
  nom: 'Barde',
  famille: 'hybride',
  deVie: 6,
  caracMagie: 'CHA',
  reservePP: { base: 4, parNiveau: 2, parMod: 1 },
  ressourceDeClasse: { ressource: 'inspiration', base: 2, diviseurNiveau: 4, recharge: 'jamais', parVingtNaturel: 'luiEtAlliesQuiLEntendent' },
  attaquesSpeciales: { familles: ['perforant'], cout: 'unParCombat' },
  actionsDeClasse: ['barde.relance'],
  voies: ['barde.chant', 'barde.rapiere', 'barde.spectacle', 'barde.alcoolisme', 'barde.chaos'],
  creation: {},
  mineurs: { liste: ['mineur.moquerie', 'mineur.melodie', 'mineur.ventriloquie', 'mineur.rengaine'], creation: 1, plusUnAuNiveau: [7] },
};
