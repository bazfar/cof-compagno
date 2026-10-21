import type { ClasseSaisie, VoieSaisie } from '../../lib/schemas/classes';
import type { ActionSaisie } from '../../lib/schemas/effets';

/*
 * Le Prêtre de la refonte (lot L4.6). Source : doc « Refonte classes et
 * magie — cadre », « Prêtre — Points de Sacré », « Ressources de classe
 * (validé) » et « Verbes des hybrides (validé) ».
 *
 * Décisions verrouillées :
 *   - quatre Cercles = quatre voies (Guérison, Foi, Bannissement,
 *     Jugement) ; le nom Cercle est conservé ; pas de choix à la création :
 *     la voie où il progresse ouvre son Cercle, avec ses paliers ;
 *   - hybride : PP réduits (4 + 2 × niveau + mod de SAG, règle v1), DD =
 *     10 + mod ; réserve de Sacré = 2 + niveau / 3, rechargée au repos long,
 *     +1 par acte de grande piété (MJ) ; un boost de Sacré par sort ;
 *   - pas d'élément de départ : éléments ordinaires par don seulement ;
 *   - sorts mineurs des hybrides : 1 à la création, +1 au niveau 7 ;
 *   - les passifs v1 disparaissent au profit des verbes et des boosts ;
 *   - décisions de Thomas du 21/10/2026 : chaque Cercle reste Adepte (1a) ;
 *     Vêtements sacrés = + mod de SAG en DEF sans armure (9b) ; l'attaque
 *     spéciale contondante et la Frappe sacrée viendront avec le système des
 *     attaques d'arme, au Guerrier (10a) ; Flamme vacillante à 10 cases,
 *     à l'attaque magique (11a).
 * Attaques d'arme (lot L4.7, décisions de Thomas du 21/10/2026) : famille
 * de prédilection contondante (décision du 20/10/2026), son attaque
 * spéciale une fois par combat, sans coût (3c) ; Frappe sacrée = attaque
 * d'arme + 1d6 sacrés, 2 PP, +1d6 au palier III (11a) ; ses paliers
 * suivent le Cercle le plus avancé, comme un verbe de rang 1.
 * La Voie du chaos : src/regles/classes/chaos.ts (lot L4.9).
 */

export const ACTIONS_PRETRE: ActionSaisie[] = [
  {
    id: 'pretre.vetements-sacres',
    nom: 'Vêtements sacrés',
    description: 'Sans armure, la foi protège le Prêtre.',
    nature: 'passif',
    rang: 1,
    etiquettes: ['combat'],
    action: 'aucune',
    ciblage: { type: 'soi', portee: 'soi' },
    resolution: { jet: 'aucun' },
    effets: [
      { type: 'bonus', cible: 'DEF', valeur: 'modMagie', duree: 'permanente', vise: 'lanceur' },
      { type: 'narratif', texte: 'Seulement sans armure.', vise: 'lanceur' },
    ],
  },
  {
    id: 'pretre.frappe-sacree',
    nom: 'Frappe sacrée',
    description: 'Une attaque d’arme chargée de foi : +1d6 dégâts sacrés, 2d6 au palier III.',
    nature: 'technique',
    rang: 1,
    etiquettes: ['combat'],
    action: 'action',
    cout: [{ ressource: 'pp', montant: 2 }],
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'arme' },
    resolution: { jet: 'attaque' },
    effets: [
      { type: 'degats', des: 'arme', typeDegats: 'physique' },
      { type: 'degats', des: '1d6', typeDegats: 'sacre' },
    ],
    // Le palier II ne change rien : la Frappe gagne son second dé au palier III (11a).
    paliers: { II: {}, III: { effets: { '1': { des: '2d6' } } } },
  },
];

const cercle = (id: string, nom: string, description: string, noms: [string, string, string, string, string]): VoieSaisie => ({
  id: `pretre.${id}`,
  nom: `Cercle de ${nom}`,
  description,
  rangs: noms.map((n, i) => ({
    rang: i + 1,
    nom: n,
    description: `Le verbe de rang ${i + 1} du Cercle${i === 0 ? ' ; le Cercle est Adepte' : ''}.`,
    regles: [{ type: 'verbeDeLEcole' as const, ecole: id }, ...(i === 0 ? [{ type: 'maitriseEcole' as const, niveau: 'adepte' as const }] : [])],
  })),
});

export const VOIES_PRETRE: VoieSaisie[] = [
  cercle('guerison', 'la Guérison', 'Soigner, purifier, tenir la mort à distance.', ['Imposition des mains', 'Chaîne de vie', 'Purification', 'Protection contre la mort', 'Guérison de masse']),
  cercle('foi', 'la Foi', 'Commander, protéger, apaiser.', ['Mot de commandement', 'Bouclier de la foi', 'Calme les esprits', 'Réprimande divine', 'Aura divine']),
  cercle('bannissement', 'Bannissement', 'Renvoyer à la Mer ce qui en sort.', ['Flamme sacrée', 'Rite de bannissement', 'Purification du lieu', 'Exorcisme', 'Bannissement']),
  cercle('jugement', 'Jugement', 'Marquer le coupable, et le frapper.', ['Œil de l’inquisiteur', 'Châtiment', 'Confession forcée', 'Colonne de flamme sacrée', 'Bûcher purificateur']),
];

export const PRETRE: ClasseSaisie = {
  id: 'pretre',
  nom: 'Prêtre',
  famille: 'hybride',
  deVie: 8,
  caracMagie: 'SAG',
  reservePP: { base: 4, parNiveau: 2, parMod: 1 },
  reserveSacre: { base: 2, diviseurNiveau: 3 },
  attaquesSpeciales: { familles: ['contondant'], cout: 'unParCombat' },
  actionsDeClasse: ['pretre.vetements-sacres', 'pretre.frappe-sacree'],
  voies: ['pretre.guerison', 'pretre.foi', 'pretre.bannissement', 'pretre.jugement', 'pretre.chaos'],
  creation: { ecoles: [], elements: null, elementsSecond: [] },
  mineurs: {
    liste: ['mineur.flamme-vacillante', 'mineur.stabiliser', 'mineur.benediction-mineure', 'mineur.sentir-le-mal', 'mineur.purifier'],
    creation: 1,
    plusUnAuNiveau: [7],
  },
};
