import type { InvocationSaisie } from '../lib/schemas/invocations';
import { ELEMENTS } from '../lib/schemas/effets';
import type { Element } from '../lib/schemas/effets';

/*
 * Créatures invoquées par l'école d'Invocation (lot L4.4a).
 * Source : doc « Refonte classes et magie — cadre », tableau d'Invocation
 * et « Serviteurs (validé) ».
 *
 * Serviteurs (validé) : un par élément ; ce sont des âmes repêchées dans la
 * Mer des âmes (les Repêchés, ou ressacs aux Académies), revêtues d'un
 * corps d'élément ; à 0 PV, elles retournent à la Mer. Profil commun :
 * PV = 3 × niveau du mage, DEF 12 + mod, attaque magique du mage,
 * 1d8 + mod ; l'effet générique de l'élément s'applique quand il touche.
 * Chaque serviteur présent ajoute 1 PP à la jauge de Remous du lieu au
 * début de chaque round (multiplié par le coefficient de race du mage, à
 * confirmer : la jauge de Remous n'est pas encore en 2.0).
 *
 * La barricade du Guerrier ingénieur (lot L4.7) n'est pas une invocation
 * d'école : c'est un objet sur la battlemap, avec ses PV (10 + niveau,
 * v1), que toute attaque touche.
 *
 * Décisions de Thomas du 21/10/2026 : déplacement de 6 cases (3a) ;
 * arme spirituelle à PV = niveau et DEF 12 (4a). La DEF des mineurs de
 * Légion n'est pas dans le cadre : 12, comme le familier.
 */

const ROLES: Record<Element, { nom: string; patch: Partial<InvocationSaisie>; role: string }> = {
  terre: {
    nom: 'Bornier',
    role: 'Gardien : PV × 1,5, il s’interpose.',
    patch: {
      pv: { parNiveau: 4.5 },
      capacites: [{ nom: 'Interposition', texte: 'Prend à la place d’un allié adjacent une attaque qui le vise.' }],
    },
  },
  feu: { nom: 'Tison', role: 'Ses coups brûlent.', patch: {} },
  glace: {
    nom: 'Frimas',
    role: 'Ses coups ralentissent ; sa case devient glissante.',
    patch: { capacites: [{ nom: 'Sol gelé', texte: 'La case qu’il occupe est glissante.', effets: [{ type: 'terrain', nature: 'glissant', duree: 'finCombat' }] }] },
  },
  eau: {
    nom: 'Ondoyé',
    role: 'Repousse, ou retire un état à un allié adjacent.',
    patch: {
      capacites: [{ nom: 'Purge', texte: 'À la place de frapper, retire un état à un allié adjacent.', effets: [{ type: 'retraitEtat', etats: [], nombre: 1, vise: 'allie' }] }],
    },
  },
  electricite: { nom: 'Fulgure', role: 'Déplacement doublé ; ses coups rebondissent.', patch: { deplacement: 12 } },
  sang: {
    nom: 'Sangsue',
    role: 'Rend au mage la moitié de ses dégâts ; l’invoquer coûte des PV.',
    patch: { capacites: [{ nom: 'Saignée', texte: 'Le mage récupère la moitié des dégâts que la Sangsue inflige.' }] },
  },
  psionique: { nom: 'Rémanence', role: 'Vole, ignore l’armure, affaiblit.', patch: { vol: true } },
};

export const SERVITEURS: InvocationSaisie[] = ELEMENTS.map((element) => ({
  id: `serviteur.${element}`,
  nom: ROLES[element].nom,
  description: `Serviteur de l’élément ${element}. ${ROLES[element].role}`,
  pv: { parNiveau: 3 },
  def: { base: 12, plusModMagie: true },
  deplacement: 6,
  attaque: { des: '1d8', plusModMagie: true, typeDegats: element },
  element,
  remousParRound: 1,
  ...ROLES[element].patch,
}));

export const INVOCATIONS: InvocationSaisie[] = [
  {
    id: 'familier',
    nom: 'Familier',
    description: 'Une petite créature liée au mage, qui l’aide et éclaire sa route.',
    pv: { parNiveau: 1 },
    def: { base: 12 },
    deplacement: 6,
    attaque: null,
    capacites: [
      {
        nom: 'Aide',
        texte: '+2 au prochain jet d’un allié.',
        effets: [{ type: 'bonus', cible: 'prochainJet', valeur: 2, duree: 'finCombat', vise: 'allie' }],
      },
      { nom: 'Éclaireur', texte: 'Hors combat, il part en reconnaissance.' },
    ],
  },
  {
    id: 'arme_spirituelle',
    nom: 'Arme spirituelle',
    description: 'Une arme de force qui frappe seule aux côtés du mage.',
    pv: { parNiveau: 1 },
    def: { base: 12 },
    deplacement: 6,
    attaque: { des: '1d8', typeDegats: 'magique' },
  },
  {
    id: 'arme_spirituelle_ii',
    nom: 'Arme spirituelle',
    description: 'Une arme de force qui frappe seule aux côtés du mage, et peut protéger un allié.',
    pv: { parNiveau: 1 },
    def: { base: 12 },
    deplacement: 6,
    attaque: { des: '2d6', typeDegats: 'magique' },
    capacites: [{ nom: 'Interposition', texte: 'Prend à la place d’un allié adjacent une attaque qui le vise.' }],
  },
  ...SERVITEURS,
  {
    id: 'double_illusoire',
    nom: 'Illusion vivante',
    description: 'Le double de l’Envoûteur (lot L4.5) : il ne frappe pas, il encaisse, et les sorts de l’Envoûteur peuvent partir de lui.',
    pv: { moitiePvLanceur: true },
    def: { commeLanceur: true },
    deplacement: 6,
    attaque: null,
    capacites: [
      {
        nom: 'Relais',
        texte: 'Le double ne frappe pas. Chaque sort de l’Envoûteur part, au choix, de l’Envoûteur ou du double : portée et ligne de vue se mesurent depuis l’un ou l’autre.',
      },
    ],
  },
  {
    id: 'barricade',
    nom: 'Barricade',
    description: 'Fortification de fortune du Guerrier ingénieur (lot L4.7, v1) : une barricade improvisée sur une case, qui abrite les alliés.',
    pv: { base: 10, parNiveau: 1 },
    def: { objet: true },
    deplacement: 0,
    attaque: null,
    capacites: [
      {
        nom: 'Abri',
        texte: 'Un allié abrité derrière la barricade gagne +4 DEF contre les attaques à distance et +2 au contact (v1).',
        effets: [
          { type: 'bonus', cible: 'DEFDistance', valeur: 4, duree: 'finCombat', vise: 'allie' },
          { type: 'bonus', cible: 'DEFContact', valeur: 2, duree: 'finCombat', vise: 'allie' },
        ],
      },
    ],
  },
  {
    id: 'limier',
    nom: 'Limier',
    description: 'Le chien de chasse du Chasseur (lot L4.14, décision 7a) : un jeton qui agit au tour du Chasseur.',
    pv: { base: 5, parNiveau: 2 },
    def: { base: 13 },
    deplacement: 6,
    attaque: { des: '1d6+2', typeDegats: 'physique' },
    capacites: [
      { nom: 'Flair', texte: 'Voie du limier, rang 2 : il détecte les créatures Dissimulées ou Invisibles à 2 cases.' },
      { nom: 'Saisie', texte: 'Voie du limier, rang 3 : sa morsure qui touche immobilise la cible 1 round.' },
      { nom: 'Meute', texte: 'Voie du limier, rang 4 : une réaction ; lui et le Chasseur au contact d’une même cible ont +2 en attaque contre elle.' },
    ],
  },
  // ---- Morts-vivants du Nécromancien (lot L4.17, décision 3a) : des Repêchés, comme les serviteurs ----
  {
    id: 'zombie',
    nom: 'Zombie',
    description: 'Un cadavre récent relevé par le Nécromancien (Relever) : lent, il frappe au jet d’attaque magique de son maître.',
    pv: { parNiveau: 2 },
    def: { base: 10 },
    deplacement: 3,
    attaque: { des: '1d6', plusModMagie: true, typeDegats: 'physique' },
    capacites: [{ nom: 'Repêché', texte: 'À 0 PV, son âme retourne à la Mer. Il dure jusqu’à la fin du combat.' }],
    remousParRound: 1,
  },
  {
    id: 'squelette',
    nom: 'Squelette',
    description: 'Des os relevés au palier II de Relever : il tire à l’arc, au jet d’attaque magique de son maître.',
    pv: { parNiveau: 2 },
    def: { base: 13 },
    deplacement: 6,
    attaque: { des: '1d6', plusModMagie: true, typeDegats: 'physique' },
    capacites: [
      { nom: 'Arc', texte: 'Son attaque porte à distance, jusqu’à 10 cases.' },
      { nom: 'Repêché', texte: 'À 0 PV, son âme retourne à la Mer. Il dure jusqu’à la fin du combat.' },
    ],
    remousParRound: 1,
  },
  {
    id: 'embrun',
    nom: 'Embrun',
    description: 'Serviteur mineur de Légion, sans élément. Les trois Embruns ajoutent ensemble 1 PP de Remous par round.',
    pv: { parNiveau: 1 },
    def: { base: 12 },
    deplacement: 6,
    attaque: { des: '1d6', typeDegats: 'magique' },
  },
];
