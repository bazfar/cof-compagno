import type { VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie, EffetSaisi } from '../../lib/schemas/effets';

/*
 * Voies du chaos des cinq classes du groupe (lot L4.9). Source : doc
 * « Refonte classes et magie — cadre », « Voies du chaos (validé pour
 * l'instant, à revoir à l'usage) » : contenu v1 conservé, remis au gabarit
 * commun.
 *
 * Gabarit (validé) : R1 une option de chaos propre à la classe (+1
 * Plongée) ; R2 Don corrompu, le même pour tous (+1) ; R3 un effet fort
 * (+2), d20 de chaos ; R4 un passif actif dès 5 de Corruption d'Âme, avec
 * une contrepartie sociale ; R5 l'Avatar, 1x/scénario, avec un contrecoup
 * (+3). Dégâts chaotiques sans mod de caractéristique (règle v1). Chaque
 * point de Plongée ajoute aussi 1 PP au Remous du lieu (combat, L6).
 *
 * Décisions de Thomas du 21/10/2026 (verrouillées) :
 *   - le chaos ne coûte ni PP ni ressource de classe, seulement la Plongée
 *     qu'il ajoute ; la Frappe vengeresse en dépense 1 (1a) ;
 *   - sauvegarde contre 10 + mod de la caractéristique de classe ; les
 *     rayons à l'attaque magique ; les tests de Volonté du chaoteux contre
 *     lui-même gardent leur DD v1 (12, 14) (2a) ;
 *   - un Avatar dure 3 + mod de la caractéristique de classe rounds ; les
 *     états du chaos durent 2 rounds ; Le fléau, c'est moi, 3 rounds (3a) ;
 *   - Don corrompu : une fois par tour, +1d6 chaotiques ou relance du dé de
 *     dégâts le plus bas, +1 Plongée (4a) ; d20 de chaos au R3, mutation du
 *     palier 1 sur 18–20 (5a) ;
 *   - +1 Corruption d'Âme par multiple de 6 de Plongée dépassé (1b), et +1
 *     directe à chaque Avatar (3b) ;
 *   - Prêtre : Affaiblissement à −2 sur deux axes, 2 rounds, Volonté ;
 *     Corruption motivante : X d4 encaissés, +X à tous ses jets 1 round,
 *     X = Plongée + Corruption d'Âme, au plus 6 (2a) ;
 *   - le détail par classe : réponses 6 à 11 (a).
 * Les contreparties sociales des R4 sont des textes, appliqués par le MJ
 * (11a). Les Voies du chaos des autres classes viendront avec elles.
 *
 * Chevalier (lot L4.13, décision 9a du 21/10/2026) : signatures du cadre.
 * Lame liée (+1d6 à la prochaine frappe réussie), Frappe du pacte (+2d6),
 * Marque du serment brisé (+2 DEF ou +1d8 sur l'arme, choix fixé à
 * l'acquisition), Avatar du pacte (+4 DEF, +2d6, immunisé à la peur, sans
 * déplacement au tour suivant). La Faveur sombre de la v1 (R2) laisse la
 * place au Don corrompu.
 *
 * Chasseur (lot L4.14, décision 8a) : Premier sang du prédateur (+1
 * Plongée par touche à distance ou par piège, 6 par combat au plus),
 * Hurlement du prédateur (Volonté : raté, Effroi 1 round ; réussi, −2 DEF
 * 2 rounds), Sens du sang (les blessés à 100 m ; les bêtes le fuient),
 * Chasse ultime (+4 à distance, couverts ignorés, 3 + mod de DEX rounds ;
 * ensuite il tire sur la créature la plus proche). L'Instinct sauvage v1
 * (R2) laisse la place au Don corrompu.
 */

const surSoi = { type: 'soi', portee: 'soi' } as const;
const sansJet = { jet: 'aucun' } as const;
const plongee = (montant: number) => ({ type: 'ressource', ressource: 'plongee', montant, vise: 'lanceur' }) as const;
const ame = { type: 'ressource', ressource: 'corruptionAme', montant: 1, vise: 'lanceur' } as const;
const avatar = (carac: 'CON' | 'INT' | 'CHA' | 'DEX') => ({ base: 3, plusModCible: carac }) as const;
const deuxRounds = { rounds: 2 } as const;

/** Action de chaos : jamais de coût en PP (1a), une étiquette combat par défaut. */
const chaos = (id: string, nom: string, description: string, rang: number, reste: Omit<ActionSaisie, 'id' | 'nom' | 'description' | 'rang' | 'etiquettes'> & Partial<Pick<ActionSaisie, 'etiquettes'>>): ActionSaisie => ({
  id: `chaos.${id}`,
  nom,
  description,
  rang,
  etiquettes: ['combat'],
  ...reste,
});

/** Les effets d'un Avatar : ses effets propres, +3 Plongée, +1 Corruption d'Âme (3b). */
const effetsDAvatar = (effets: EffetSaisi[]): EffetSaisi[] => [...effets, plongee(3), ame];

export const ACTIONS_CHAOS: ActionSaisie[] = [
  // ---- Guerrier (6a) ----
  chaos('guerrier.premier-sang', 'Premier sang', 'Chaque attaque ennemie qui le touche : +1 Plongée, 6 par combat au plus.', 1, {
    nature: 'passif',
    action: 'aucune',
    declencheur: 'attaqueSubie',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [plongee(1), { type: 'narratif', texte: 'Au plus 6 Plongée par combat par Premier sang (v1).', vise: 'lanceur' }],
  }),
  chaos('guerrier.frappe-vengeresse', 'Frappe vengeresse', 'Il dépense 1 Plongée : +1d6 chaotiques à sa prochaine attaque réussie. Répétable.', 1, {
    nature: 'capacite',
    action: 'gratuite',
    cout: [{ ressource: 'plongee', montant: 1 }],
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'degats', valeur: '1d6', typeDegats: 'chaotique', consomme: 'prochaineFrappe', duree: 'finCombat', vise: 'lanceur' }],
  }),
  chaos('guerrier.rage-incontrolee', 'Rage incontrôlée', 'Une attaque de plus ce tour ; Volonté DD 12, ou elle vise la créature la plus proche, allié compris.', 3, {
    nature: 'capacite',
    action: 'gratuite',
    limite: '1x/round',
    jetDeChaos: true,
    ciblage: surSoi,
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'rien', ddFixe: 12 },
    effets: [
      { type: 'narratif', texte: 'Une attaque de plus ce tour.' },
      { type: 'narratif', texte: 'Cette attaque vise la créature la plus proche, allié compris.', condition: 'sauvegardeRatee' },
      plongee(2),
    ],
  }),
  chaos('guerrier.soif-de-sang', 'Soif de sang', 'Dès 5 de Corruption d’Âme : un ennemi qu’il abat lui rend 1d6 PV.', 4, {
    nature: 'passif',
    action: 'aucune',
    declencheur: 'ennemiAbattu',
    corruptionAmeMin: 5,
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'soin', des: '1d6', vise: 'lanceur' }],
  }),
  chaos('guerrier.dechainement', 'Déchaînement', 'Une fois par scénario : +4 en attaque, +2d6 chaotiques, 3 + mod de CON rounds ; chaque tour, Volonté DD 14 ou son attaque vise le plus proche.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: effetsDAvatar([
      { type: 'bonus', cible: 'attaque', valeur: 4, duree: avatar('CON'), vise: 'lanceur' },
      { type: 'bonus', cible: 'degats', valeur: '2d6', typeDegats: 'chaotique', duree: avatar('CON'), vise: 'lanceur' },
      { type: 'etat', etat: 'dechainement', duree: avatar('CON'), vise: 'lanceur' },
    ]),
  }),

  // ---- Chevalier (L4.13, 9a) ----
  chaos('chevalier.lame-liee', 'Lame liée', 'Une fois par tour, en action gratuite : sa prochaine attaque réussie ce tour inflige +1d6 chaotiques.', 1, {
    nature: 'capacite',
    action: 'gratuite',
    limite: '1x/round',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'degats', valeur: '1d6', typeDegats: 'chaotique', consomme: 'prochaineFrappe', duree: 'prochainTour', vise: 'lanceur' }, plongee(1)],
  }),
  chaos('chevalier.frappe-du-pacte', 'Frappe du pacte', 'Une attaque au contact : +2d6 chaotiques si elle touche.', 3, {
    nature: 'capacite',
    action: 'action',
    jetDeChaos: true,
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [{ type: 'degats', des: 'arme', typeDegats: 'physique' }, { type: 'degats', des: '2d6', typeDegats: 'chaotique' }, plongee(2)],
  }),
  chaos('chevalier.marque-du-serment-brise', 'Marque du serment brisé', 'Dès 5 de Corruption d’Âme, au choix fixé à l’acquisition : +2 DEF, ou +1d8 chaotiques sur son arme.', 4, {
    nature: 'passif',
    action: 'aucune',
    corruptionAmeMin: 5,
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'DEF', valeur: 2, duree: 'permanente', vise: 'lanceur' }],
    variantes: [{ id: 'arme', nom: '+1d8 chaotiques sur l’arme', palier: 'I', delta: { remplaceEffets: [{ type: 'bonus', cible: 'degats', valeur: '1d8', typeDegats: 'chaotique', duree: 'permanente', vise: 'lanceur' }] } }],
  }),
  chaos('chevalier.avatar-du-pacte', 'Avatar du pacte', 'Une fois par scénario, 3 + mod de CON rounds : armure semi-spectrale, +4 DEF, +2d6 chaotiques à toutes ses attaques, immunisé à la peur. Au tour qui suit, il perd son déplacement.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: effetsDAvatar([
      { type: 'bonus', cible: 'DEF', valeur: 4, duree: avatar('CON'), vise: 'lanceur' },
      { type: 'bonus', cible: 'degats', valeur: '2d6', typeDegats: 'chaotique', duree: avatar('CON'), vise: 'lanceur' },
      { type: 'narratif', texte: 'Immunisé à la peur pendant l’Avatar ; au tour qui suit sa fin, il perd son déplacement.', vise: 'lanceur' },
    ]),
  }),

  // ---- Chasseur (L4.14, 8a) ----
  chaos('chasseur.premier-sang-du-predateur', 'Premier sang du prédateur', 'Chaque touche à distance ou par un piège : +1 Plongée, 6 par combat au plus.', 1, {
    nature: 'passif',
    action: 'aucune',
    ciblage: surSoi,
    resolution: sansJet,
    effets: [plongee(1), { type: 'narratif', texte: 'À chaque touche à distance ou par un piège ; au plus 6 Plongée par combat (v1).', vise: 'lanceur' }],
  }),
  chaos('chasseur.hurlement-du-predateur', 'Hurlement du prédateur', 'Un hurlement de bête : Volonté ; raté, la cible fuit (Effroi 1 round) ; réussi, elle a quand même −2 DEF 2 rounds.', 3, {
    nature: 'capacite',
    action: 'action',
    jetDeChaos: true,
    ciblage: { type: 'creature', camp: 'ennemi', portee: 10 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'rien' },
    effets: [
      { type: 'etat', etat: 'effroi', duree: { rounds: 1 }, condition: 'sauvegardeRatee' },
      { type: 'bonus', cible: 'DEF', valeur: -2, duree: deuxRounds, condition: 'sauvegardeReussie' },
      plongee(2),
    ],
  }),
  chaos('chasseur.sens-du-sang', 'Sens du sang', 'Dès 5 de Corruption d’Âme : il sent toute créature blessée à 100 m.', 4, {
    nature: 'passif',
    action: 'aucune',
    corruptionAmeMin: 5,
    etiquettes: ['combat', 'exploration'],
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: 'Détecte toute créature blessée à 100 m.', vise: 'lanceur' }],
  }),
  chaos('chasseur.chasse-ultime', 'Chasse ultime', 'Une fois par scénario, 3 + mod de DEX rounds : +4 en attaque à distance, il ignore les couverts. À la fin, il tire sur la créature la plus proche dans sa ligne de mire, alliée ou non.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: effetsDAvatar([
      { type: 'bonus', cible: 'attaqueDistance', valeur: 4, duree: avatar('DEX'), vise: 'lanceur' },
      { type: 'narratif', texte: 'Ignore les couverts ; à la fin, un tir sur la créature la plus proche dans sa ligne de mire, alliée ou non.', vise: 'lanceur' },
    ]),
  }),

  // ---- Magicien (7a) ----
  chaos('magicien.glimpse-du-vide', 'Glimpse du Vide', 'Un regard dans le Vide : 2d8 chaotiques à 20 cases, à l’attaque magique.', 1, {
    nature: 'capacite',
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 20 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'degats', des: '2d8', typeDegats: 'chaotique' }, plongee(1)],
  }),
  chaos('magicien.vision-interdite', 'Vision interdite', 'Rayon 2 jusqu’à 7 cases : 4d6 chaotiques, DEX pour moitié.', 3, {
    nature: 'capacite',
    action: 'action',
    jetDeChaos: true,
    ciblage: { type: 'point', portee: 7 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' },
    effets: [{ type: 'degats', des: '4d6', typeDegats: 'chaotique', vise: 'zone' }, plongee(2)],
  }),
  chaos('magicien.esprit-fissure', 'Esprit fissuré', 'Dès 5 de Corruption d’Âme, au choix fixé à l’acquisition : +1d6 chaotiques à ses sorts, ou +2 de réduction des dégâts.', 4, {
    nature: 'passif',
    action: 'aucune',
    corruptionAmeMin: 5,
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'degats', valeur: '1d6', typeDegats: 'chaotique', duree: 'permanente', vise: 'lanceur' }],
    variantes: [{ id: 'garde', nom: 'Réduction des dégâts', palier: 'I', delta: { remplaceEffets: [{ type: 'bonus', cible: 'reductionDegats', valeur: 2, duree: 'permanente', vise: 'lanceur' }] } }],
  }),
  chaos('magicien.avatar-du-vide', 'Avatar du Vide', 'Une fois par scénario, 3 + mod d’INT rounds : +4 en attaque magique, +2d6 à ses sorts, dégâts physiques subis divisés par deux. À la fin, Volonté DD 12 ou Halluciné 1 round et 1d4.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: effetsDAvatar([
      { type: 'bonus', cible: 'attaqueMagique', valeur: 4, duree: avatar('INT'), vise: 'lanceur' },
      { type: 'bonus', cible: 'degats', valeur: '2d6', typeDegats: 'chaotique', duree: avatar('INT'), vise: 'lanceur' },
      { type: 'etat', etat: 'avatar_du_vide', duree: avatar('INT'), vise: 'lanceur' },
    ]),
  }),

  // ---- Envoûteur (8a) ; l'Éclat chaotique (R1) est une capacité de voie ----
  chaos('envouteur.illusion-de-masse', 'Illusion de masse', 'Rayon 2 jusqu’à 6 cases : Volonté, ou Confus 2 rounds.', 3, {
    nature: 'capacite',
    action: 'action',
    jetDeChaos: true,
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'confus', duree: deuxRounds, vise: 'zone' }, plongee(2)],
  }),
  chaos('envouteur.murmure-terrifiant', 'Murmure terrifiant', 'Dès 5 de Corruption d’Âme : Volonté ; raté, 1d20 : 19–20 la cible tombe à 0 PV (boss et D5 : 3d10), 16–18 1d10, sinon Confus 3 rounds.', 4, {
    nature: 'capacite',
    action: 'action',
    corruptionAmeMin: 5,
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [
      {
        type: 'tableD20',
        lignes: [
          { min: 19, effets: [{ type: 'tombe', saufBoss: true }, { type: 'degats', des: '3d10', typeDegats: 'chaotique', sinon: 0 }] },
          { min: 16, effets: [{ type: 'degats', des: '1d10', typeDegats: 'chaotique' }] },
          { min: 1, effets: [{ type: 'etat', etat: 'confus', duree: { rounds: 3 } }] },
        ],
      },
    ],
  }),
  chaos('envouteur.ascension-chaotique', 'Ascension chaotique', 'Une fois par scénario : ses PP sont vidés, puis, 3 + mod de CHA rounds, PV max et bonus de caractéristiques doublés, réserve de PP doublée et pleine.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: effetsDAvatar([
      { type: 'ressource', ressource: 'pp', montant: 'vider', vise: 'lanceur' },
      { type: 'etat', etat: 'ascension_chaotique', duree: avatar('CHA'), vise: 'lanceur' },
    ]),
  }),

  // ---- Prêtre (9a, et 2a de la retouche) ----
  chaos('pretre.affaiblissement', 'Affaiblissement', 'Une malédiction : −2 sur deux axes au choix (attaque, DEF, dégâts), 2 rounds, Volonté.', 1, {
    nature: 'capacite',
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'bonus', cible: 'attaque', valeur: -2, duree: deuxRounds }, { type: 'bonus', cible: 'DEF', valeur: -2, duree: deuxRounds }, plongee(1)],
    variantes: [
      { id: 'attaque-degats', nom: 'Attaque et dégâts', palier: 'I', delta: { effets: { '1': { cible: 'degats' } } } },
      { id: 'def-degats', nom: 'DEF et dégâts', palier: 'I', delta: { effets: { '0': { cible: 'degats' } } } },
    ],
  }),
  chaos('pretre.corruption-motivante', 'Corruption motivante', 'Il encaisse X d4 et gagne +X à tous ses jets pendant 1 round ; X = Plongée + Corruption d’Âme, au plus 6.', 3, {
    nature: 'capacite',
    action: 'gratuite',
    limite: '1x/round',
    jetDeChaos: true,
    sacrifice: { parPointDeChaos: 'd4', plafond: 6 },
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'bonus', cible: 'tests', valeur: 'pointsDeChaos', duree: { rounds: 1 }, vise: 'lanceur' }, plongee(2)],
  }),
  chaos('pretre.supplement-corrompu', 'Supplément corrompu', 'Dès 5 de Corruption d’Âme : à court de Sacré, il en tire un point du chaos, pour 2 Plongée.', 4, {
    nature: 'capacite',
    action: 'gratuite',
    corruptionAmeMin: 5,
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'ressource', ressource: 'sacre', montant: 1, vise: 'lanceur' }, plongee(2)],
  }),
  chaos('pretre.le-fleau-c-est-moi', 'Le fléau, c’est moi', 'Une fois par scénario, 3 rounds : +1d8 à ses attaques, ses PV ne descendent pas sous 1, +1 DEF.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    resolution: sansJet,
    effets: effetsDAvatar([
      { type: 'bonus', cible: 'degats', valeur: '1d8', duree: { rounds: 3 }, vise: 'lanceur' },
      { type: 'plancherPv', valeur: 1, duree: { rounds: 3 }, vise: 'lanceur' },
      { type: 'bonus', cible: 'DEF', valeur: 1, duree: { rounds: 3 }, vise: 'lanceur' },
    ]),
  }),

  // ---- Barde (10a) ----
  chaos('barde.chant-corrupteur', 'Chant corrupteur', 'À l’attaque magique, 6 cases : Influencé 2 rounds (−2 à une caractéristique au choix du Barde).', 1, {
    nature: 'capacite',
    action: 'action',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 6 },
    resolution: { jet: 'attaqueMagique' },
    effets: [{ type: 'etat', etat: 'influence', duree: deuxRounds }, plongee(1)],
  }),
  chaos('barde.melopee-de-la-folie', 'Mélopée de la folie', 'Rayon 2 jusqu’à 6 cases : Volonté, ou Confus 2 rounds.', 3, {
    nature: 'capacite',
    action: 'action',
    jetDeChaos: true,
    ciblage: { type: 'point', portee: 6 },
    zone: { forme: 'cercle', taille: 2, origine: 'point' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: [{ type: 'etat', etat: 'confus', duree: deuxRounds, vise: 'zone' }, plongee(2)],
  }),
  chaos('barde.voix-qui-corrompt', 'Voix qui corrompt', 'Dès 5 de Corruption d’Âme : +2 en Persuasion, Bluff et Intimidation.', 4, {
    nature: 'passif',
    action: 'aucune',
    etiquettes: ['social'],
    corruptionAmeMin: 5,
    ciblage: surSoi,
    resolution: sansJet,
    effets: [{ type: 'narratif', texte: '+2 en Persuasion, Bluff et Intimidation.', vise: 'lanceur' }],
  }),
  chaos('barde.symphonie-du-chaos', 'Symphonie du chaos', 'Une fois par scénario : rayon 3 autour du Barde, alliés compris : Volonté, ou Confus 2 rounds.', 5, {
    nature: 'capacite',
    action: 'action',
    limite: '1x/scenario',
    ciblage: surSoi,
    zone: { forme: 'cercle', taille: 3, origine: 'lanceur' },
    resolution: { jet: 'sauvegarde', sauvegarde: 'Volonte', siSauvegarde: 'annule' },
    effets: effetsDAvatar([{ type: 'etat', etat: 'confus', duree: deuxRounds, vise: 'zone' }]),
  }),
];

type Rang = { nom: string; description: string; actions?: string[]; regles?: VoieSaisie['rangs'][number]['regles'] };

/** Une Voie du chaos au gabarit commun : le R2 est le Don corrompu ; le R4 porte sa contrepartie sociale. */
function voieDuChaos(classe: string, description: string, r1: Rang, r3: Rang, r4: Rang & { contrepartie: string }, r5: Rang): VoieSaisie {
  const { contrepartie, ...rang4 } = r4;
  return {
    id: `${classe}.chaos`,
    nom: 'Voie du chaos',
    description: `${description} Chaque point de Plongée nourrit aussi le Remous du lieu.`,
    surAccordDuMJ: true,
    rangs: [
      { rang: 1, ...r1 },
      {
        rang: 2,
        nom: 'Don corrompu',
        description: 'Une fois par tour, il force un sort ou une attaque : +1d6 chaotiques ou relance du dé de dégâts le plus bas ; +1 Plongée.',
        regles: [{ type: 'capacite', nom: 'donCorrompu', limite: '1x/round' }],
      },
      { rang: 3, ...r3 },
      { rang: 4, ...rang4, regles: [...(rang4.regles ?? []), { type: 'texte', texte: `${rang4.nom} : ${contrepartie}` }] },
      { rang: 5, ...r5 },
    ],
  };
}

export const VOIES_CHAOS: VoieSaisie[] = [
  voieDuChaos(
    'chasseur',
    'Le prédateur prend le dessus sur le chasseur : il chasse pour le sang, plus pour la proie.',
    { nom: 'Premier sang du prédateur', description: '+1 Plongée par touche à distance ou par piège.', actions: ['chaos.chasseur.premier-sang-du-predateur'] },
    { nom: 'Hurlement du prédateur', description: 'La cible fuit, ou perd 2 DEF.', actions: ['chaos.chasseur.hurlement-du-predateur'] },
    { nom: 'Sens du sang', description: 'Les blessés à 100 m.', actions: ['chaos.chasseur.sens-du-sang'], contrepartie: 'les bêtes sauvages le fuient d’instinct.' },
    { nom: 'Chasse ultime', description: 'L’Avatar du Chasseur.', actions: ['chaos.chasseur.chasse-ultime'] },
  ),
  voieDuChaos(
    'chevalier',
    'Un serment rompu, un pacte noué à sa place : la lame obéit à autre chose que l’honneur.',
    { nom: 'Lame liée', description: '+1d6 chaotiques à la prochaine frappe.', actions: ['chaos.chevalier.lame-liee'] },
    { nom: 'Frappe du pacte', description: '+2d6 chaotiques.', actions: ['chaos.chevalier.frappe-du-pacte'] },
    { nom: 'Marque du serment brisé', description: '+2 DEF ou +1d8 sur l’arme.', actions: ['chaos.chevalier.marque-du-serment-brise'], contrepartie: 'les ordres de chevalerie le rejettent.' },
    { nom: 'Avatar du pacte', description: 'L’Avatar du Chevalier.', actions: ['chaos.chevalier.avatar-du-pacte'] },
  ),
  voieDuChaos(
    'guerrier',
    'Un soldat qui a vécu trop de guerre : la fureur monte malgré lui, à chaque coup encaissé.',
    { nom: 'Premier sang', description: '+1 Plongée par coup encaissé ; Frappe vengeresse.', actions: ['chaos.guerrier.premier-sang', 'chaos.guerrier.frappe-vengeresse'] },
    { nom: 'Rage incontrôlée', description: 'Une attaque de plus, au risque de frapper un allié.', actions: ['chaos.guerrier.rage-incontrolee'] },
    { nom: 'Soif de sang', description: 'Un ennemi abattu rend 1d6 PV.', actions: ['chaos.guerrier.soif-de-sang'], contrepartie: 'les témoins du carnage lui deviennent hostiles.' },
    { nom: 'Déchaînement', description: 'L’Avatar du Guerrier.', actions: ['chaos.guerrier.dechainement'] },
  ),
  voieDuChaos(
    'magicien',
    'La folie arcanique : un mage qui a creusé trop profond dans les savoirs interdits.',
    { nom: 'Glimpse du Vide', description: '2d8 chaotiques à 20 cases.', actions: ['chaos.magicien.glimpse-du-vide'] },
    { nom: 'Vision interdite', description: '4d6 chaotiques en zone.', actions: ['chaos.magicien.vision-interdite'] },
    { nom: 'Esprit fissuré', description: '+1d6 aux sorts ou +2 de réduction.', actions: ['chaos.magicien.esprit-fissure'], contrepartie: 'les Académies et les cercles savants le repèrent comme instable.' },
    { nom: 'Avatar du Vide', description: 'L’Avatar du Magicien.', actions: ['chaos.magicien.avatar-du-vide'] },
  ),
  voieDuChaos(
    'envouteur',
    'Des illusions qui prennent vie et lui échappent.',
    {
      nom: 'Éclat chaotique',
      description: 'Ses sorts d’Illusion infligent aussi 1d6 chaotiques à chaque ennemi qu’ils affectent ; +1 Plongée par sort.',
      regles: [{ type: 'capacite', nom: 'eclatChaotique' }],
    },
    { nom: 'Illusion de masse', description: 'Une zone de folie.', actions: ['chaos.envouteur.illusion-de-masse'] },
    {
      nom: 'Murmure terrifiant',
      description: 'Un murmure qui peut abattre.',
      actions: ['chaos.envouteur.murmure-terrifiant'],
      contrepartie: 'ceux qui l’ont entendu murmurer ne lui font plus confiance.',
    },
    { nom: 'Ascension chaotique', description: 'L’Avatar de l’Envoûteur.', actions: ['chaos.envouteur.ascension-chaotique'] },
  ),
  voieDuChaos(
    'pretre',
    'Malédiction et corruption : il combat le mal en devenant un vecteur de pourriture.',
    { nom: 'Affaiblissement', description: '−2 sur deux axes, 2 rounds.', actions: ['chaos.pretre.affaiblissement'] },
    { nom: 'Corruption motivante', description: 'X d4 encaissés pour +X à tous ses jets.', actions: ['chaos.pretre.corruption-motivante'] },
    { nom: 'Supplément corrompu', description: 'Un point de Sacré tiré du chaos.', actions: ['chaos.pretre.supplement-corrompu'], contrepartie: 'le clergé se méfie de lui.' },
    { nom: 'Le fléau, c’est moi', description: 'L’Avatar du Prêtre.', actions: ['chaos.pretre.le-fleau-c-est-moi'] },
  ),
  voieDuChaos(
    'barde',
    'Une séduction corruptrice : il brûle les autres, et se corrompt un peu au passage.',
    { nom: 'Chant corrupteur', description: 'Influencé 2 rounds.', actions: ['chaos.barde.chant-corrupteur'] },
    { nom: 'Mélopée de la folie', description: 'Une zone de confusion.', actions: ['chaos.barde.melopee-de-la-folie'] },
    {
      nom: 'Voix qui corrompt',
      description: '+2 en Persuasion, Bluff, Intimidation.',
      actions: ['chaos.barde.voix-qui-corrompt'],
      contrepartie: 'la haute société et les lieux saints se méfient de lui.',
    },
    { nom: 'Symphonie du chaos', description: 'L’Avatar du Barde, alliés compris.', actions: ['chaos.barde.symphonie-du-chaos'] },
  ),
];
