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

export const GENRES_COMBATTANT = ['pj', 'monstre'] as const;
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
    // ---- Actions du tour (7a), valables pour le tour `tourActions` du combat ----
    tourActions: z.number().int().min(0).max(99999),
    principale: z.boolean(),
    secondaire: z.boolean(),
    /** Cases déjà parcourues ce tour. */
    mvt: z.number().int().min(0).max(40),
    /** Sprint : +2 cases, l'action principale en échange. */
    sprint: z.boolean(),
    creeLe: z.number().int().nonnegative(),
  })
  .superRefine((c, ctx) => {
    const pj = c.genre === 'pj';
    if (pj !== (c.perso !== null) || pj !== (c.uid !== null)) ctx.addIssue({ code: 'custom', message: 'un PJ a son personnage et son joueur, un monstre non', path: ['perso'] });
    if (pj && (c.pv !== null || c.pvMax !== null || c.monstre !== null)) ctx.addIssue({ code: 'custom', message: 'les PV d’un PJ sont sur sa fiche', path: ['pv'] });
    if (!pj && (c.pv === null || c.pvMax === null)) ctx.addIssue({ code: 'custom', message: 'un monstre a ses PV', path: ['pv'] });
    if (pj !== (c.def === null)) ctx.addIssue({ code: 'custom', message: 'un monstre a sa DEF, un PJ a sa CA sur sa fiche', path: ['def'] });
    if (!pj && (c.mortSucces || c.mortEchecs || c.mort)) ctx.addIssue({ code: 'custom', message: 'seul un PJ fait des jets de mort', path: ['mort'] });
    if (c.mort && c.mortEchecs < 3) ctx.addIssue({ code: 'custom', message: 'la mort vient au troisième échec', path: ['mort'] });
    if ((c.initiative === null) !== (c.de === null)) ctx.addIssue({ code: 'custom', message: 'l’initiative et son d20 vont ensemble', path: ['de'] });
    if (c.sprint && !c.principale) ctx.addIssue({ code: 'custom', message: 'le Sprint prend l’action principale', path: ['sprint'] });
  });
export type Combattant = z.infer<typeof schemaCombattant>;
