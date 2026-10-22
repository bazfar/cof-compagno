import { z } from 'zod';
import { schemaCran } from './pnj';

/*
 * Scène hors combat jouée (lot S2, décisions de Thomas du 22/10/2026).
 * Source : doc « Refonte classes et magie — cadre », « Système de scène »
 * et « Interaction avec les PNJ », amendés le 22/10.
 *
 * Trois documents, parce que les règles Firestore ne cachent pas une
 * partie d'un document :
 *   - tables/{t}/scenesHorsCombat/{id} (2b) : la scène, lue de toute la
 *     table, écrite par le MJ seul. Pas de DD (il reste caché, 6a).
 *   - tables/{t}/scenesHorsCombatMj/{id} : le DD de base, MJ seul.
 *   - tables/{t}/scenesHorsCombat/{id}/actions/{tour}-{uid} : l'action d'un
 *     appelé pour un tour, écrite par le joueur (option, d20, bonus) ; le
 *     client du MJ, seul à connaître le DD, y écrit le résultat (5a).
 * La scène en cours est aussi notée dans le document de la table
 * (`sceneHorsCombat`), pour que les joueurs la trouvent.
 */

export const TYPES_SCENE = ['social', 'exploration', 'enquete'] as const;
export type TypeScene = (typeof TYPES_SCENE)[number];
export const MODES_SCENE = ['individuel', 'groupe'] as const;
export const OPTIONS_SOCIALES = ['convaincre', 'menacer', 'tromper', 'seduire'] as const;
export type OptionSociale = (typeof OPTIONS_SOCIALES)[number];
/** `lire` (Lire les gens) et `citer` (Citer le précédent) : options du Vécu en scène sociale (S3). */
export const OPTIONS_SCENE = [...OPTIONS_SOCIALES, 'competence', 'lire', 'citer', 'passer'] as const;
export type OptionScene = (typeof OPTIONS_SCENE)[number];

const schemaUid = z.string().min(1).max(128);
const schemaCompetence = z.string().min(1).max(40);

export const schemaAppele = z.strictObject({
  uid: schemaUid,
  /** Le personnage joué à l'ouverture (2a) : c'est avec lui que le joueur agit. */
  perso: z.string().min(1).max(100),
  nom: z.string().min(1).max(40),
});
export type Appele = z.infer<typeof schemaAppele>;

export const schemaSceneHorsCombat = z
  .strictObject({
    type: z.enum(TYPES_SCENE),
    /** PNJ ciblé (obligatoire en social, 1a), ou null pour un lieu. */
    pnj: z.string().min(1).max(100).nullable(),
    /** Nom du PNJ ou du lieu, tel que les joueurs le lisent. */
    cible: z.string().trim().min(1).max(80),
    objectif: z.string().trim().min(1).max(200),
    mode: z.enum(MODES_SCENE),
    /** Mode groupe : la compétence que tous lancent. */
    competence: schemaCompetence.nullable(),
    requis: z.number().int().min(1).max(12),
    toleres: z.number().int().min(0).max(12),
    /** Le MJ choisit si les joueurs voient le compteur d'échecs (6a). */
    echecsVisibles: z.boolean(),
    /** Marquante (10a) : gagnée, elle propose un cran de Vécu à ceux qui ont réussi. */
    marquante: z.boolean(),
    appeles: z.array(schemaAppele).min(1).max(12),
    /** Les uid des appelés, pour les règles Firestore. */
    appelesUids: z.array(schemaUid).min(1).max(12),
    tour: z.number().int().min(1).max(99),
    reussites: z.number().int().min(0).max(99),
    echecs: z.number().int().min(0).max(99),
    // Attitude pendant la scène (social) : cran mémorisé à l'ouverture, puis ce qui l'a fait bouger.
    depart: schemaCran.nullable(),
    hausses: z.number().int().min(0).max(99),
    baisses: z.number().int().min(0).max(99),
    /** Menaces réussies (10b : chacune coûte un cran à la clôture). */
    menaces: z.number().int().min(0).max(99),
    /** Crans gagnés pour la scène seulement par la menace (+2 chacune, 4 au plus). */
    temp: z.number().int().min(0).max(4),
    /** Mensonges réussis (9a : chacun peut être découvert plus tard). */
    mensonges: z.number().int().min(0).max(99),
    /** Séduire réussi : le prochain jet social d'un autre appelé sur ce PNJ a +1. */
    seduction: schemaUid.nullable(),
    statut: z.enum(['ouverte', 'terminee', 'close']),
    /** Issue proposée (statut terminee) puis confirmée (close). */
    issue: z.enum(['gagnee', 'perdue', 'abandonnee']).nullable(),
    seance: z.string().min(1).max(40).optional(),
    creeLe: z.number().int().nonnegative(),
    closeLe: z.number().int().nonnegative().nullable(),
    // ---- Vécu en scène (lot S3). Absents des scènes de S2 : valeurs par défaut. ----
    /** Homme du peuple (2a) : la scène commence un cran plus haut. */
    peuple: z.number().int().min(0).max(1).default(0),
    /** Face à une foule ou un groupe (3a, Orateur). */
    foule: z.boolean().default(false),
    /** Face à une autorité (5a, Citer le précédent). */
    autorite: z.boolean().default(false),
    /** Nœuds du Vécu utiles en scène de chaque appelé, relevés à l'ouverture. */
    vecus: z.record(schemaUid, z.array(z.string().min(1).max(40)).max(40)).default({}),
    /** Nœuds « 1x/scène » déjà utilisés, par appelé, notés par le client du MJ. */
    usages: z.record(schemaUid, z.array(z.string().min(1).max(40)).max(40)).default({}),
  })
  .superRefine((s, ctx) => {
    if (s.type === 'social' && (s.pnj === null || s.depart === null)) ctx.addIssue({ code: 'custom', message: 'une scène sociale vise un PNJ rencontré', path: ['pnj'] });
    if (s.type === 'social' && s.mode === 'groupe') ctx.addIssue({ code: 'custom', message: 'une scène sociale se joue en mode individuel', path: ['mode'] });
    if ((s.mode === 'groupe') !== (s.competence !== null)) ctx.addIssue({ code: 'custom', message: 'le mode groupe a une compétence, le mode individuel n’en a pas', path: ['competence'] });
    if (s.appelesUids.join() !== s.appeles.map((a) => a.uid).join()) ctx.addIssue({ code: 'custom', message: 'appelesUids suit appeles', path: ['appelesUids'] });
  });
export type SceneHorsCombat = z.infer<typeof schemaSceneHorsCombat>;

export const schemaSceneHorsCombatMj = z.strictObject({
  dd: z.number().int().min(5).max(30),
});
export type SceneHorsCombatMj = z.infer<typeof schemaSceneHorsCombatMj>;

export const schemaActionScene = z
  .strictObject({
    uid: schemaUid,
    perso: z.string().min(1).max(100),
    nom: z.string().min(1).max(40),
    tour: z.number().int().min(1).max(99),
    option: z.enum(OPTIONS_SCENE),
    competence: schemaCompetence.nullable(),
    /** Le d20 lancé par le joueur (null s'il passe). */
    de: z.number().int().min(1).max(20).nullable(),
    bonus: z.number().int().min(-20).max(40),
    resultat: z.enum(['reussite', 'echec', 'passe']).nullable(),
    creeLe: z.number().int().nonnegative(),
    // ---- Lot S3 ----
    /** Relance de Mémoire eidétique (8a) : l'action `<tour>-<uid>-r`, qui remplace un échec. */
    relance: z.boolean().default(false),
    /** Ce que le client du MJ a noté (« Langue d'argent », « Orateur »…). */
    note: z.string().max(60).nullable().default(null),
    /** Ce que le jet a changé à la scène, pour qu'une relance puisse le défaire. */
    delta: z.record(z.string().max(20), z.number().int()).nullable().default(null),
    /** Échec remplacé par une relance. */
    annule: z.boolean().default(false),
  })
  .superRefine((a, ctx) => {
    const passe = a.option === 'passer';
    if (passe !== (a.de === null) || (passe && a.resultat !== 'passe')) ctx.addIssue({ code: 'custom', message: 'passer : ni dé ni compétence, résultat « passe »', path: ['option'] });
    if (!passe && a.competence === null) ctx.addIssue({ code: 'custom', message: 'une action lance une compétence', path: ['competence'] });
  });
export type ActionScene = z.infer<typeof schemaActionScene>;

/**
 * tables/{t}/scenesHorsCombat/{id}/utilisations/{u} (S3, 10a) : un nœud
 * narratif du Vécu utilisé pendant la scène (« Capacités du Vécu »). Un
 * « 1x/scène » a l'identifiant `<uid>-<nœud>` : une seule fois par scène.
 */
export const schemaUtilisationVecu = z.strictObject({
  uid: schemaUid,
  perso: z.string().min(1).max(100),
  nom: z.string().min(1).max(40),
  noeud: z.string().min(1).max(40),
  tour: z.number().int().min(1).max(99),
  creeLe: z.number().int().nonnegative(),
});
export type UtilisationVecu = z.infer<typeof schemaUtilisationVecu>;

/**
 * tables/{t}/questions/{id} (S3, 1a et 9a) : une question au MJ, ou ce que
 * Lire les gens révèle. Le MJ et le joueur qui l'a posée la lisent seuls.
 *   - Savant (1x/scène) : identifiant `<scène>-<uid>-savant` ;
 *   - Réseau de rumeurs (1x/séance), hors scène ;
 *   - Lire les gens : posée par le client du MJ, avec le DD du moment ;
 *     le MJ y écrit l'intention du PNJ.
 */
export const NOEUDS_QUESTION = ['savant', 'reseau-de-rumeurs', 'lire-les-gens'] as const;
export const schemaQuestionMj = z.strictObject({
  uid: schemaUid,
  perso: z.string().min(1).max(100),
  nom: z.string().min(1).max(40),
  noeud: z.enum(NOEUDS_QUESTION),
  scene: z.string().min(1).max(100).nullable(),
  question: z.string().trim().min(1).max(300).nullable(),
  /** Lire les gens : le DD effectif au moment du jet. */
  dd: z.number().int().min(0).max(40).nullable(),
  reponse: z.string().trim().min(1).max(500).nullable(),
  creeLe: z.number().int().nonnegative(),
  reponduLe: z.number().int().nonnegative().nullable(),
});
export type QuestionMj = z.infer<typeof schemaQuestionMj>;
