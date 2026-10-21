import type { ActionSaisie, FamilleArme } from '../lib/schemas/effets';

/*
 * Attaques d'arme de la refonte (lot L4.7). Source : doc « Refonte classes
 * et magie — cadre », « Attaques spéciales d'arme », « Réactions » et
 * « Ressources de classe (validé) ».
 *
 * Décisions verrouillées :
 *   - chaque famille d'armes donne une attaque spéciale qui pose un état ;
 *     l'état dure 1 round (décision 1a du 21/10/2026, lot L4.2) ;
 *   - la famille de chaque arme du catalogue est dans FAMILLE_DES_ARMES
 *     (décision 1a du 21/10/2026, lot L4.7) ; bouclier et mains nues ne
 *     sont pas des objets du catalogue ;
 *   - l'état est posé d'office si l'attaque touche, sans sauvegarde (2a) ;
 *   - coût : celui de la classe (2 Endurance au Guerrier, 1 avec Maniement
 *     expert ; une fois par combat, sans coût, pour les hybrides : 3c) ;
 *   - Coup d'estoc : Déséquilibré, ou repoussé d'une case ; Carreau lourd :
 *     repoussé d'une case (9a) ;
 *   - attaque d'opportunité pour toutes les classes ; elle prend la seule
 *     réaction du round, partagée avec les réactions de voie (6a, et
 *     décision du 20/10/2026) ; elle arrête le déplacement (doc de cadre).
 * La portée `arme` est celle de l'arme maniée : contact, allonge de la
 * lance, tir de l'arc.
 */

/** Famille de chaque arme du catalogue (src/donnees/objets.json), par identifiant (1a). */
export const FAMILLE_DES_ARMES: Readonly<Record<string, FamilleArme>> = {
  masse: 'contondant',
  marteau_guerre: 'contondant',
  marteau_grisfer: 'contondant',
  fleau_armes: 'contondant',
  baton: 'contondant',
  baton_p1: 'contondant',
  grimoire: 'contondant',
  fronde: 'contondant',
  epee_longue: 'tranchantLourd',
  epee_longue_p1: 'tranchantLourd',
  epee_cupidite: 'tranchantLourd',
  epee_batarde: 'tranchantLourd',
  epee_deux_mains: 'tranchantLourd',
  hache_deux_mains: 'tranchantLourd',
  hache_guerre: 'tranchantLourd',
  hache_naine_p1: 'tranchantLourd',
  francisque: 'tranchantLourd',
  hallebarde: 'tranchantLourd',
  glaive_guerre: 'tranchantLourd',
  epee_courte: 'tranchantLeger',
  cimeterre: 'tranchantLeger',
  fouet: 'tranchantLeger',
  rapiere: 'perforant',
  lance: 'perforant',
  pique: 'perforant',
  trident: 'perforant',
  javelot: 'perforant',
  dague: 'dague',
  dague_p2: 'dague',
  poignards_jumeaux: 'dague',
  arc_court: 'arc',
  arc_long: 'arc',
  arc_court_p1: 'arc',
  arc_aelindra_p1: 'arc',
  arbalete: 'arbalete',
  arbalete_lourde: 'arbalete',
  arbalete_courte: 'arbalete',
};

/** Les actions d'arme que toutes les classes ont (6a). */
export const ACTIONS_COMMUNES = ['arme.attaque', 'arme.opportunite'] as const;

const frappe = { type: 'degats', des: 'arme', typeDegats: 'physique' } as const;
const auContactOuALaPortee = { type: 'creature', camp: 'ennemi', portee: 'arme' } as const;

/** Une attaque spéciale : l'attaque de l'arme, puis son état (1 round) ou son effet, si elle touche. */
const speciale = (id: string, nom: string, famille: FamilleArme, description: string, effet: ActionSaisie['effets'][number], patch: Partial<ActionSaisie> = {}): ActionSaisie => ({
  id: `arme.${id}`,
  nom,
  description,
  nature: 'technique',
  rang: 1,
  etiquettes: ['combat'],
  action: 'action',
  famille,
  ciblage: auContactOuALaPortee,
  resolution: { jet: 'attaque' },
  effets: [frappe, effet],
  ...patch,
});

const unRound = { rounds: 1 } as const;

export const ACTIONS_ARMES: ActionSaisie[] = [
  {
    id: 'arme.attaque',
    nom: 'Attaque',
    description: 'Une attaque avec l’arme maniée.',
    nature: 'technique',
    rang: 1,
    etiquettes: ['combat'],
    action: 'action',
    ciblage: auContactOuALaPortee,
    resolution: { jet: 'attaque' },
    effets: [frappe],
  },
  {
    id: 'arme.opportunite',
    nom: 'Attaque d’opportunité',
    description: 'Un ennemi quitte le contact : une attaque gratuite, qui prend la réaction du round. Si elle touche, il s’arrête là.',
    nature: 'reaction',
    rang: 1,
    etiquettes: ['combat'],
    action: 'reaction',
    declencheur: 'ennemiQuitteContact',
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'contact' },
    resolution: { jet: 'attaque' },
    effets: [frappe, { type: 'narratif', texte: 'Son déplacement s’arrête là.', condition: 'touche' }],
  },
  speciale('coup-assommant', 'Coup assommant', 'contondant', 'Une arme contondante : si le coup touche, la cible est Étourdie 1 round.', { type: 'etat', etat: 'etourdi', duree: unRound }),
  speciale('fendre', 'Fendre', 'tranchantLourd', 'Un tranchant lourd : si le coup touche, la cible est Exposée 1 round.', { type: 'etat', etat: 'expose', duree: unRound }),
  speciale('entaille', 'Entaille', 'tranchantLeger', 'Un tranchant léger : si le coup touche, la cible Saigne 1 round.', { type: 'etat', etat: 'saignement', duree: unRound }),
  speciale('coup-d-estoc', 'Coup d’estoc', 'perforant', 'Une arme perforante : si le coup touche, la cible est Déséquilibrée 1 round, ou repoussée d’une case (9a).', { type: 'etat', etat: 'desequilibre', duree: unRound }, {
    variantes: [{ id: 'repousser', nom: 'Repousser', palier: 'I', delta: { remplaceEffets: [frappe, { type: 'deplacement', sens: 'repousse', cases: 1 }] } }],
  }),
  speciale('coup-bas', 'Coup bas', 'dague', 'Une dague : si le coup touche, la cible est Affaiblie 1 round.', { type: 'etat', etat: 'affaibli', duree: unRound }),
  speciale('coup-de-bouclier', 'Coup de bouclier', 'bouclier', 'Le bouclier : si le coup touche, la cible est Renversée.', { type: 'etat', etat: 'renverse', duree: unRound }, {
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'contact' },
  }),
  speciale('tir-epinglant', 'Tir épinglant', 'arc', 'Un arc : si la flèche touche, la cible est Immobilisée 1 round.', { type: 'etat', etat: 'immobilise', duree: unRound }),
  speciale('carreau-lourd', 'Carreau lourd', 'arbalete', 'Une arbalète : si le carreau touche, la cible est repoussée d’une case (9a).', { type: 'deplacement', sens: 'repousse', cases: 1 }),
  speciale('frappe-nerveuse', 'Frappe nerveuse', 'mainsNues', 'À mains nues : si le coup touche, la cible est Ralentie 1 round.', { type: 'etat', etat: 'ralenti', duree: unRound }, {
    ciblage: { type: 'creature', camp: 'ennemi', portee: 'contact' },
  }),
];
