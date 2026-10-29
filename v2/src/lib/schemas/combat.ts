import { z } from 'zod';

/*
 * Le combat (lot L6.1, décisions de Thomas du 23/10/2026). Deux documents,
 * lus de toute la table :
 *   - tables/{t}/combats/{id} (2a) : le combat en cours, son round et le
 *     combattant qui joue. Le MJ l'écrit ; le joueur qui joue le fait
 *     tourner (« Finir mon tour », 6a). La table nomme le combat en cours
 *     (`combat`, comme `sceneHorsCombat`).
 *   - tables/{t}/combats/{id}/combattants/{jeton} : un document par
 *     combattant, d'identifiant celui de son jeton sur la scène (un PJ
 *     `pj-<perso>`, un monstre de rencontre `m-<rencontre>-<clé>`). Le
 *     joueur y écrit son initiative et ses actions du tour ; le MJ, tout.
 * Les PV des monstres y sont en chiffres, vus de toute la table (3b) ; leurs
 * attaques et leurs sauvegardes restent dans le bestiaire, que le MJ seul
 * lit. Les PV, PP et états d'un PJ restent sur sa fiche.
 *
 * Lot L6.2 (décisions de Thomas du 23/10/2026) : le joueur résout son
 * attaque sur son client (1b), contre la DEF du monstre, et inflige ses
 * dégâts après l'armure et les résistances du monstre (10a). La DEF,
 * l'armure et les résistances sont donc recopiées du bestiaire sur le
 * combattant au démarrage, lisibles de toute la table. Un PJ à 0 PV est
 * Mourant (7a) : ses jets de mort sont comptés ici, le temps du combat.
 *
 * Lot L6.4a (décisions de Thomas du 23/10/2026) : le joueur lance ses
 * sorts et capacités sur son client (2a) ; la cible sauvegarde avec les
 * sauvegardes recopiées du bestiaire sur le monstre au démarrage (8a, 9a),
 * que le MJ corrige ; les PV temporaires (11a) et les bonus temporaires
 * (12a) vivent sur le combattant, le temps du combat.
 *
 * Lot L6.4b2 (décisions de Thomas du 24/10/2026) :
 *   - concentration (12a) : le sort que le PJ maintient vit sur son
 *     combattant, avec ce qu'il a posé (états, zone, invocations), pour
 *     tout retirer quand elle s'arrête ;
 *   - invocations (13b) : un combattant à part, du genre « invocation »,
 *     avec son initiative, ses PV et sa DEF en chiffres (10a) ; `maitre`
 *     est le combattant qui l'a appelée, `uid` le joueur qui la joue
 *     (14a, 11a).
 *
 * Actions du tour (7a) : elles valent pour le tour `tourActions` ; quand le
 * combat passe au tour suivant, celles d'un autre tour comptent comme
 * neuves, sans que personne n'ait à les remettre à zéro.
 */

export const STATUTS_COMBAT = ['encours', 'clos'] as const;

export const schemaCombat = z.strictObject({
  nom: z.string().trim().min(1).max(80),
  /** Scène où se joue le combat. */
  scene: z.string().min(1).max(100),
  /** Rencontre préparée d'où il vient, ou null pour un combat libre (4a). */
  rencontre: z.string().min(1).max(100).nullable(),
  statut: z.enum(STATUTS_COMBAT),
  round: z.number().int().min(1).max(999),
  /** Compteur de tours, +1 à chaque main passée : il date les actions des combattants. */
  tour: z.number().int().min(1).max(99999),
  /** Combattant qui joue (identifiant de son jeton), ou null tant que personne n'a d'initiative. */
  actif: z.string().min(1).max(150).nullable(),
  /** Le MJ laisse attaquer hors de portée (L6.2, 4a : il passe outre). */
  porteesLibres: z.boolean(),
  creeLe: z.number().int().nonnegative(),
  closLe: z.number().int().nonnegative().nullable(),
});
export type Combat = z.infer<typeof schemaCombat>;

/**
 * Un état posé pendant le combat (L6.3, catalogue de la refonte : 1a).
 * `rounds` : ce qui reste, décompté à la fin du tour du porteur (5a) ; null
 * tant que personne ne le retire. `cumul` : poses d'un état cumulable
 * (Ivresse). `charges` : Double. `des` : dégâts par tour donnés par la
 * source (une attaque de monstre), à la place de ceux de l'état.
 */
export const schemaEtatCombat = z.strictObject({
  id: z.string().min(1).max(60),
  rounds: z.number().int().min(1).max(99).nullable(),
  cumul: z.number().int().min(1).max(20),
  charges: z.number().int().min(1).max(20).nullable(),
  des: z.string().min(1).max(20).nullable(),
  /** Qui l'a posé (nom), pour le dire. */
  source: z.string().min(1).max(40).nullable(),
});
export type EtatCombat = z.infer<typeof schemaEtatCombat>;

/**
 * Un bonus temporaire (L6.4a, 12a) : ce qu'un sort ou une capacité ajoute
 * (« +2 en DEF 3 rounds », « +1d6 aux dégâts de la prochaine frappe »).
 * `sur` : la cible du bonus (schemaCibleBonus) ; `valeur` : un nombre ou
 * une formule de dés ; `rounds` : décompté comme un état, à la fin du tour
 * du porteur, null jusqu'à la fin du combat ; `consomme` : il tombe avec la
 * prochaine frappe.
 */
export const schemaBonusCombat = z.strictObject({
  sur: z.string().min(1).max(40),
  valeur: z.union([z.number().int().min(-99).max(99), z.string().min(1).max(20)]),
  rounds: z.number().int().min(1).max(99).nullable(),
  consomme: z.boolean(),
  typeDegats: z.string().min(1).max(20).nullable(),
  source: z.string().min(1).max(40).nullable(),
  /** La posture du Guerrier (L6.5a, 3a) : durable, une nouvelle la remplace. */
  posture: z.literal(true).optional(),
  /** L6.5b (8a) : posé par une réaction, il tombe avec la prochaine attaque (reçue pour une DEF, portée pour une attaque). */
  contreAttaque: z.literal(true).optional(),
});
export type BonusCombat = z.infer<typeof schemaBonusCombat>;

/** Les sauvegardes de la refonte (FOR, DEX, CON, Volonté), en bonus au d20. */
export const schemaSauvegardesCombat = z.strictObject({
  FOR: z.number().int().min(-10).max(40),
  DEX: z.number().int().min(-10).max(40),
  CON: z.number().int().min(-10).max(40),
  Volonte: z.number().int().min(-10).max(40),
});
export type SauvegardesCombat = z.infer<typeof schemaSauvegardesCombat>;

/**
 * Une invocation en jeu (L6.4b2, 10a) : ses chiffres, calculés au lancer
 * d'après son maître (lib/combat/invocations.ts). `attaque` : bonus (l'attaque
 * magique du maître), dés et type ; `objet` : toute attaque la touche
 * (barricade) ; `remous` : PP que le maître paie au début de son tour (15a) ;
 * `rounds` : décomptés à la fin du tour du maître (9a), null jusqu'à la fin
 * du combat ; `lancer` : le lancer qui l'a appelée.
 */
export const schemaInvocationEnJeu = z.strictObject({
  creature: z.string().min(1).max(60),
  element: z.string().min(1).max(20).nullable(),
  attaque: z.strictObject({ bonus: z.number().int().min(-10).max(40), des: z.string().min(1).max(20), typeDegats: z.string().min(1).max(20) }).nullable(),
  objet: z.boolean(),
  remous: z.number().int().min(0).max(3),
  rounds: z.number().int().min(1).max(99).nullable(),
  lancer: z.string().min(1).max(60),
});
export type InvocationEnJeu = z.infer<typeof schemaInvocationEnJeu>;

export const RUPTURES_CONCENTRATION = ['cibleAttaquee', 'lanceurSurpris', 'lanceurAttaque', 'autreConcentration'] as const;

/**
 * La concentration d'un PJ (L6.4b2, 1a à 3a) : le sort maintenu, son
 * maintien en PP par round (2a), ce qui la rompt (1a), ses rounds
 * (décomptés à la fin de son tour), et ce que ce lancer a posé (3a) : les
 * états sur leurs cibles, sa zone au sol, ses invocations.
 */
export const schemaConcentration = z.strictObject({
  action: z.string().min(1).max(100),
  nom: z.string().min(1).max(60),
  lancer: z.string().min(1).max(60),
  maintien: z.number().int().min(0).max(5),
  rupture: z.array(z.enum(RUPTURES_CONCENTRATION)).max(4),
  rounds: z.number().int().min(1).max(99).nullable(),
  etats: z.array(z.strictObject({ cible: z.string().min(1).max(150), etat: z.string().min(1).max(60) })).max(20),
  zone: z.string().min(1).max(100).nullable(),
  invocations: z.array(z.string().min(1).max(150)).max(10),
});
export type Concentration = z.infer<typeof schemaConcentration>;

export const GENRES_COMBATTANT = ['pj', 'monstre', 'invocation'] as const;
export type GenreCombattant = (typeof GENRES_COMBATTANT)[number];

export const schemaCombattant = z
  .strictObject({
    genre: z.enum(GENRES_COMBATTANT),
    nom: z.string().trim().min(1).max(40),
    /** PJ : son personnage et le joueur qui le joue. */
    perso: z.string().min(1).max(100).nullable(),
    uid: z.string().min(1).max(128).nullable(),
    /** Monstre : son modèle dans le bestiaire du MJ, s'il en vient (rencontre préparée). */
    monstre: z.string().min(1).max(100).nullable(),
    /** Modificateur d'initiative : la fiche du PJ, le bestiaire du monstre. */
    modInit: z.number().int().min(-10).max(40),
    /** d20 + modificateur ; null tant qu'il n'est pas lancé (le combattant attend en bas de l'ordre). */
    initiative: z.number().int().min(-9).max(60).nullable(),
    de: z.number().int().min(1).max(20).nullable(),
    /** Monstre : PV en chiffres (3b). Null pour un PJ, dont les PV sont sur la fiche. */
    pv: z.number().int().min(-999).max(9999).nullable(),
    pvMax: z.number().int().min(1).max(9999).nullable(),
    /** Monstre à 0 PV : son tour est sauté. Un PJ à terre se lit sur sa fiche. */
    aTerre: z.boolean(),
    /** Cases par tour (5, +1 avec le don Mobile), avant le Sprint. */
    mvtBase: z.number().int().min(0).max(20),
    // ---- Défense du monstre (L6.2, 1b et 10a) ; null et neutres pour un PJ, qui les a sur sa fiche ----
    /** DEF du monstre ; null pour un PJ (sa CA est calculée de sa fiche). */
    def: z.number().int().min(-10).max(99).nullable(),
    /** Réduction des dégâts de son armure (bestiaire : armureId), retirée avant les résistances. */
    armure: z.number().int().min(0).max(99),
    /** Multiplicateurs de dégâts, appliqués après l'armure (v1 : ×0,5 résiste, ×1,5 vulnérable ; 1 neutre). */
    resistances: z.strictObject({ physique: z.number().min(0).max(5), magique: z.number().min(0).max(5) }),
    // ---- Mourant (L6.2, 7a) : PJ à 0 PV sur sa fiche ----
    /** Jets de mort réussis et ratés depuis qu'il est tombé : 3 réussites, il se relève à 1 PV ; 3 échecs, il meurt. */
    mortSucces: z.number().int().min(0).max(3),
    mortEchecs: z.number().int().min(0).max(3),
    /** Mort au combat : son tour est sauté. */
    mort: z.boolean(),
    // ---- États et ressources (L6.3) ----
    etats: z.array(schemaEtatCombat).max(20),
    /** Usages limités : action → round de son dernier usage (« 1×/combat » : présent ; « 1×/round » : ce round). */
    usages: z.record(z.string().min(1).max(60), z.number().int().min(1).max(999)),
    /** Ressource gagnée par touche ce round (Ki : 2 au plus par round). */
    gainTouche: z.strictObject({ round: z.number().int().min(0).max(999), montant: z.number().int().min(0).max(10) }),
    /** Tour du combat où son début de tour a été joué (dégâts par tour) ; 0 : jamais. */
    debutTour: z.number().int().min(0).max(99999),
    /** Précision (arme à feu) : il a visé ; sa prochaine attaque gagne +1d6 aux dégâts, +1d10 sur un critique. */
    visee: z.boolean(),
    // ---- Sorts (L6.4a) ----
    /** Monstre : ses sauvegardes, dérivées du bestiaire au démarrage (8a, 9a) ; null : PJ (sa fiche), ou monstre posé à la main (+0). */
    sauvegardes: schemaSauvegardesCombat.nullable(),
    /** Monstre boss (immunités du moteur : Sommeil, Ordre, Domination). */
    boss: z.boolean(),
    /** Démon ou mort-vivant (bestiaire : race), que certains sorts visent. */
    demonOuMortVivant: z.boolean(),
    /** PV temporaires (11a) : absorbés avant les PV ; ils s'en vont avec le combat. */
    pvTemp: z.number().int().min(0).max(999),
    /** Bonus temporaires (12a), comptés dans les jets comme les modificateurs d'état. */
    bonus: z.array(schemaBonusCombat).max(20),
    // ---- Actions du tour (7a), valables pour le tour `tourActions` du combat ----
    tourActions: z.number().int().min(0).max(99999),
    principale: z.boolean(),
    secondaire: z.boolean(),
    /** Cases déjà parcourues ce tour. */
    mvt: z.number().int().min(0).max(40),
    /** Sprint : +2 cases, l'action principale en échange. */
    sprint: z.boolean(),
    creeLe: z.number().int().nonnegative(),
    // ---- Concentration et invocations (L6.4b2) ----
    /** Invocation : le combattant qui l'a appelée. */
    maitre: z.string().min(1).max(150).nullable().default(null),
    invocation: schemaInvocationEnJeu.nullable().default(null),
    /** PJ : le sort qu'il maintient. */
    concentration: schemaConcentration.nullable().default(null),
    // ---- Monstres avancés (L6.6a) ----
    /** Monstre : les états du catalogue qui ne se posent pas sur lui (8a), recopiés du bestiaire au démarrage ; absent : aucun. */
    immunites: z.array(z.string().min(1).max(60)).min(1).max(20).optional(),
    /** Monstre boss : ses résistances légendaires du combat (7a) ; `usages.legendaire` compte celles qui ont servi ; absent : aucune. */
    legendaire: z.number().int().min(1).max(10).optional(),
  })
  .superRefine((c, ctx) => {
    const pj = c.genre === 'pj';
    const inv = c.genre === 'invocation';
    if (pj !== (c.perso !== null) || (pj || inv) !== (c.uid !== null)) ctx.addIssue({ code: 'custom', message: 'un PJ a son personnage et son joueur, un monstre non', path: ['perso'] });
    if (inv !== (c.invocation !== null) || inv !== (c.maitre !== null) || (inv && c.monstre !== null))
      ctx.addIssue({ code: 'custom', message: 'une invocation a son maître et ses chiffres', path: ['invocation'] });
    if (c.concentration && !pj) ctx.addIssue({ code: 'custom', message: 'seul un PJ se concentre', path: ['concentration'] });
    if (pj && (c.pv !== null || c.pvMax !== null || c.monstre !== null)) ctx.addIssue({ code: 'custom', message: 'les PV d’un PJ sont sur sa fiche', path: ['pv'] });
    if (!pj && (c.pv === null || c.pvMax === null)) ctx.addIssue({ code: 'custom', message: 'un monstre a ses PV', path: ['pv'] });
    if (pj !== (c.def === null)) ctx.addIssue({ code: 'custom', message: 'un monstre a sa DEF, un PJ a sa CA sur sa fiche', path: ['def'] });
    if (c.genre !== 'monstre' && (c.immunites !== undefined || c.legendaire !== undefined)) ctx.addIssue({ code: 'custom', message: 'seul un monstre a des immunités et des résistances légendaires', path: ['immunites'] });
    if (pj && (c.sauvegardes !== null || c.boss || c.demonOuMortVivant)) ctx.addIssue({ code: 'custom', message: 'les sauvegardes d’un PJ sont sur sa fiche', path: ['sauvegardes'] });
    if (!pj && (c.mortSucces || c.mortEchecs || c.mort)) ctx.addIssue({ code: 'custom', message: 'seul un PJ fait des jets de mort', path: ['mort'] });
    if (c.mort && c.mortEchecs < 3) ctx.addIssue({ code: 'custom', message: 'la mort vient au troisième échec', path: ['mort'] });
    if ((c.initiative === null) !== (c.de === null)) ctx.addIssue({ code: 'custom', message: 'l’initiative et son d20 vont ensemble', path: ['de'] });
    if (c.sprint && !c.principale) ctx.addIssue({ code: 'custom', message: 'le Sprint prend l’action principale', path: ['sprint'] });
  });
export type Combattant = z.infer<typeof schemaCombattant>;
