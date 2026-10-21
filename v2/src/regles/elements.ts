import type { FicheElementSaisie } from '../lib/schemas/elements';

/*
 * Les sept éléments (lot L4.2) : doc « Refonte classes et magie — cadre »,
 * tableaux « Les sept éléments » et « Effet générique des éléments »
 * (validés). Une seule fiche par élément, quel que soit le verbe ; seules
 * quelques combinaisons signature seront écrites à la main avec leurs
 * verbes.
 *
 * Sur un sort sans sauvegarde (Missile), la terre se joue sur une
 * sauvegarde de FOR et le psionique sur une sauvegarde de Volonté, pour leur
 * effet seulement (décisions 4a et 5a du 21/10/2026, lot L4.3).
 *
 * Laissés en texte, faute de chiffre dans le cadre (le MJ arbitre) : les
 * dérapages de l'eau (de combien de cases ?) et de l'électricité (qui prend
 * le rebond ?). La version « arme » des éléments (don Sensibilité
 * élémentaire, Poing élémentaire) viendra avec les classes qui s'en servent.
 */
export const ELEMENTS_REFONTE: FicheElementSaisie[] = [
  {
    id: 'feu',
    nom: 'Feu',
    role: 'Dégâts dans la durée',
    sort: { texte: 'Brûlure 1d4 pendant 2 tours.', effets: [{ type: 'etat', etat: 'brulure', duree: { rounds: 2 } }] },
    derapage: { texte: 'Le lanceur prend la brûlure.', effets: [{ type: 'etat', etat: 'brulure', duree: { rounds: 2 }, vise: 'lanceur' }] },
  },
  {
    id: 'glace',
    nom: 'Glace',
    role: 'Ralentir, figer',
    sort: { texte: 'Ralenti 1 tour.', effets: [{ type: 'etat', etat: 'ralenti', duree: { rounds: 1 } }] },
    derapage: { texte: 'Le lanceur est ralenti.', effets: [{ type: 'etat', etat: 'ralenti', duree: { rounds: 1 }, vise: 'lanceur' }] },
  },
  {
    id: 'terre',
    nom: 'Terre',
    role: 'Défense et terrain',
    sort: {
      texte: 'Renversé si sauvegarde ratée.',
      effets: [{ type: 'etat', etat: 'renverse', duree: { rounds: 1 }, condition: 'sauvegardeRatee' }],
      sauvegardeSiAucune: 'FOR',
    },
    derapage: { texte: 'Le lanceur est renversé.', effets: [{ type: 'etat', etat: 'renverse', duree: { rounds: 1 }, vise: 'lanceur' }] },
  },
  {
    id: 'eau',
    nom: 'Eau',
    role: 'Mouvement et purge',
    sort: {
      texte: 'Repoussé de 2 cases de plus, ou un allié de la zone perd un état.',
      modifie: { pousseeEnPlus: 2 },
      auChoix: [{ type: 'retraitEtat', etats: [], nombre: 1, vise: 'allie' }],
    },
    derapage: {
      texte: 'Le lanceur ou un allié est repoussé.',
      effets: [{ type: 'narratif', texte: 'Le MJ repousse le lanceur ou un allié proche.', vise: 'lanceur' }],
    },
  },
  {
    id: 'electricite',
    nom: 'Électricité',
    role: 'Plusieurs cibles',
    sort: {
      texte: 'Rebond sur une 2ᵉ cible à 2 cases max, moitié des dégâts ; dégâts doublés contre une armure de métal.',
      modifie: { rebond: { cases: 2, part: 'moitie' }, contreMetal: 2 },
    },
    derapage: {
      texte: 'Le rebond touche un allié ou le lanceur.',
      effets: [{ type: 'narratif', texte: 'Le MJ dirige le rebond sur un allié ou sur le lanceur.', vise: 'lanceur' }],
    },
  },
  {
    id: 'sang',
    nom: 'Sang',
    role: 'Puissance contre prix',
    sort: {
      texte: '+1 dé de dégâts, payé en PV à hauteur du coût du sort ; le lanceur récupère la moitié du dé ajouté.',
      modifie: { deSupplementaire: { payeEnPv: 'coutDuSort', recupere: 'moitie' } },
    },
    derapage: { texte: 'Coût en PV doublé.', modifie: { coutPvMultiplie: 2 } },
  },
  {
    id: 'psionique',
    nom: 'Psionique',
    role: 'L’esprit',
    sort: {
      texte: 'Sauvegarde de Volonté, armure ignorée ; ratée : Affaibli 1 tour.',
      modifie: { sauvegarde: 'Volonte', ignoreArmure: true },
      effets: [{ type: 'etat', etat: 'affaibli', duree: { rounds: 1 }, condition: 'sauvegardeRatee' }],
      sauvegardeSiAucune: 'Volonte',
    },
    derapage: { texte: 'Le lanceur est étourdi.', effets: [{ type: 'etat', etat: 'etourdi', duree: { rounds: 1 }, vise: 'lanceur' }] },
  },
];
