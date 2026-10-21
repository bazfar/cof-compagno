import { z } from 'zod';
import { schemaFormuleDes, schemaId } from './commun.ts';

/*
 * Grammaire des actions et de leurs effets (lot L4.1, moteur d'effets).
 *
 * Source : doc « Refonte classes et magie — cadre », section « Structure
 * d'un sort (validé) », étendue aux capacités, techniques, réactions et
 * passifs des classes. Décidé le 20/10/2026 : la 2.0 bascule directement
 * sur la refonte ; ses règles sont écrites à la main dans src/regles/ et
 * validées par ce schéma.
 *
 * Chaque action est une fiche TYPÉE, pour qu'aucune ne retombe dans le
 * `special` libre de la v1 (293 occurrences) :
 *   - un effet que l'app sait appliquer a son type (dégâts, soin, état…) ;
 *   - un effet d'arbitrage (fiction, récit) est de type `narratif` : il est
 *     assumé, listé, et l'app l'affiche sans rien calculer ;
 *   - une action entière laissée au MJ porte `manuel` avec sa raison.
 *
 * Les pièges de la v1 sont fermés par construction (reference_schema_sorts.md) :
 *   - une durée est TOUJOURS `{ rounds: n }` ou un mot-clé de la liste,
 *     jamais un objet libre (en v1 : `{ motCle }` → NaN) ;
 *   - la cible d'un bonus est une liste FERMÉE (en v1 : une cible inconnue
 *     était stockée et jamais lue) ;
 *   - un état est désigné par son identifiant, vérifié contre le catalogue
 *     des états par les tests des règles (L4.2).
 *
 * Paliers (validé) : un verbe a jusqu'à 3 paliers ; II et III sont écrits en
 * DELTAS du palier I (lib/effets/paliers.ts les applique). Le rang de voie
 * qui débloque un palier n'est pas stocké : il se déduit du rang du verbe
 * (II deux rangs plus tard, III encore deux rangs après).
 *
 * Ce fichier n'importe que `zod` et ./commun.ts (avec l'extension), comme
 * les autres schémas de règles.
 */

// ---------- Vocabulaire ----------

/** Ce qu'est l'action : un verbe de discipline, un sort mineur, une technique de classe… */
export const NATURES = ['verbe', 'mineur', 'technique', 'capacite', 'reaction', 'passif'] as const;
export const schemaNature = z.enum(NATURES);

/** Étiquettes (validé) : la magie ne sert pas qu'au combat. */
export const schemaEtiquette = z.enum(['combat', 'exploration', 'social']);

/** Ce que coûte l'action dans le tour. `aucune` : passif. */
export const schemaTypeAction = z.enum(['action', 'reaction', 'gratuite', 'aucune']);

/** Fréquence d'usage. */
export const schemaLimite = z.enum(['volonte', '1x/round', '1x/combat', '1x/scene', '1x/scenario']);

/** Ressources de classe (doc de cadre, « Ressources de classe (validé) »), plus PV et âmes. */
export const RESSOURCES = [
  'pp',
  'endurance',
  'honneur',
  'instinct',
  'sacre',
  'inspiration',
  'forceNature',
  'ki',
  'pv',
  'ame',
] as const;
export const schemaRessource = z.enum(RESSOURCES);

/** Les sept éléments (validé). */
export const ELEMENTS = ['feu', 'glace', 'terre', 'eau', 'electricite', 'sang', 'psionique'] as const;
export const schemaElement = z.enum(ELEMENTS);
export type Element = z.infer<typeof schemaElement>;

/**
 * Types de dégâts. `magique` : magie pure, sans élément (validé : « sans
 * élément, le sort est magique pur ») ; un élément ajoute son effet
 * générique, il ne change pas ce type. `chaotique` : Voies du chaos, sans
 * mod de caractéristique (règle v1 conservée).
 */
export const schemaTypeDegats = z.enum([
  'physique',
  'magique',
  'sacre',
  'psychique',
  'necrotique',
  'chaotique',
  ...ELEMENTS,
]);

/** Sauvegardes de la refonte : FOR, DEX, CON et Volonté (doc de cadre). */
export const schemaSauvegarde = z.enum(['FOR', 'DEX', 'CON', 'Volonte']);
export type Sauvegarde = z.infer<typeof schemaSauvegarde>;

/**
 * Durée : un nombre de rounds, ou un mot-clé. Jamais d'objet libre.
 * `prochainTour` : jusqu'au prochain tour du lanceur.
 */
export const schemaDuree = z.union([
  z.strictObject({ rounds: z.number().int().min(1).max(20) }),
  z.enum(['prochainTour', 'finCombat', 'scene', 'permanente']),
]);
export type Duree = z.infer<typeof schemaDuree>;

/** Portée : contact, soi, ou un nombre de cases. */
export const schemaPortee = z.union([z.enum(['contact', 'soi']), z.number().int().min(1).max(100)]);

/** Qui reçoit un effet. `zone` : chaque créature de la zone, filtre de la zone appliqué. */
export const schemaVise = z.enum(['cible', 'zone', 'lanceur', 'allie']);

/**
 * Conditions d'un effet. Liste fermée : une condition nouvelle s'ajoute
 * ici, avec le code qui la lit (L4.2), jamais en texte libre.
 */
export const schemaCondition = z.enum([
  'touche',
  'sauvegardeRatee',
  'sauvegardeReussie',
  'contreMetal',
  'contreDemonsMortsVivants',
  'cibleMarquee',
]);

/** Cibles de bonus et malus. Liste FERMÉE (piège v1 : cible inconnue jamais lue). */
export const schemaCibleBonus = z.enum([
  'attaque',
  'attaqueContact',
  'attaqueDistance',
  'attaqueMagique',
  'DEF',
  'degats',
  'sauvegardes',
  'sauvegardeFOR',
  'sauvegardeDEX',
  'sauvegardeCON',
  'sauvegardeVolonte',
  'initiative',
  'deplacement',
  'DD',
  'FOR',
  'DEX',
  'CON',
  'INT',
  'SAG',
  'CHA',
  'reductionDegats',
  'prochainJet',
]);

// ---------- Effets ----------

const champsCommuns = {
  vise: schemaVise.default('cible'),
  condition: schemaCondition.optional(),
};

const schemaEffetDegats = z.strictObject({
  type: z.literal('degats'),
  des: schemaFormuleDes,
  /** Ajoute le mod de la caractéristique de magie (ou d'attaque). */
  plusMod: z.boolean().default(false),
  typeDegats: schemaTypeDegats,
  /**
   * Dégâts pleins jusqu'à `pleinsJusqua` cases du lanceur, réduits au-delà,
   * jusqu'à la portée (Choc, décision du 20/10/2026 : pleins à 3 cases,
   * moitié de 4 à 6).
   */
  attenuation: z.strictObject({ pleinsJusqua: z.number().int().min(1).max(20), auDela: z.literal('moitie') }).optional(),
  ...champsCommuns,
});

const schemaEffetSoin = z.strictObject({
  type: z.literal('soin'),
  des: schemaFormuleDes,
  plusMod: z.boolean().default(false),
  ...champsCommuns,
});

const schemaEffetPvTemp = z.strictObject({
  type: z.literal('pvTemp'),
  des: schemaFormuleDes,
  plusMod: z.boolean().default(false),
  ...champsCommuns,
});

const schemaEffetEtat = z.strictObject({
  type: z.literal('etat'),
  /** Identifiant d'un état du catalogue (L4.2). */
  etat: schemaId,
  duree: schemaDuree,
  ...champsCommuns,
});

const schemaEffetRetraitEtat = z.strictObject({
  type: z.literal('retraitEtat'),
  /** États retirés au choix ; vide = n'importe quel état. */
  etats: z.array(schemaId),
  nombre: z.number().int().min(1).default(1),
  ...champsCommuns,
});

const schemaEffetDeplacement = z.strictObject({
  type: z.literal('deplacement'),
  /** repousse : s'éloigne du lanceur (ou du centre) ; attire : s'en approche ; teleporte : vers une case choisie. */
  sens: z.enum(['repousse', 'attire', 'teleporte']),
  cases: z.number().int().min(1).max(20),
  ...champsCommuns,
});

const schemaEffetBonus = z.strictObject({
  type: z.literal('bonus'),
  cible: schemaCibleBonus,
  /** Signé : un malus est négatif. Formule de dés autorisée (« 1d4 »). */
  valeur: z.union([z.number().int().min(-20).max(20), schemaFormuleDes]),
  duree: schemaDuree,
  ...champsCommuns,
});

const schemaEffetRessource = z.strictObject({
  type: z.literal('ressource'),
  ressource: schemaRessource,
  /** Signé : gain positif, perte négative. */
  montant: z.number().int().min(-20).max(20),
  ...champsCommuns,
});

const schemaEffetInvocation = z.strictObject({
  type: z.literal('invocation'),
  /** Identifiant d'une créature invocable (serviteurs, familier… : L4.2 et suivants). */
  creature: schemaId,
  nombre: z.number().int().min(1).max(10).default(1),
  duree: schemaDuree,
  ...champsCommuns,
});

const schemaEffetTerrain = z.strictObject({
  type: z.literal('terrain'),
  nature: z.enum(['difficile', 'glissant', 'bloquant', 'couverture', 'enflamme']),
  duree: schemaDuree,
  ...champsCommuns,
});

const schemaEffetDissipation = z.strictObject({
  type: z.literal('dissipation'),
  nombre: z.number().int().min(1).default(1),
  ...champsCommuns,
});

/** Effet d'arbitrage, assumé : l'app l'affiche, le MJ l'applique. */
const schemaEffetNarratif = z.strictObject({
  type: z.literal('narratif'),
  texte: z.string().min(1),
  ...champsCommuns,
});

export const schemaEffet = z.discriminatedUnion('type', [
  schemaEffetDegats,
  schemaEffetSoin,
  schemaEffetPvTemp,
  schemaEffetEtat,
  schemaEffetRetraitEtat,
  schemaEffetDeplacement,
  schemaEffetBonus,
  schemaEffetRessource,
  schemaEffetInvocation,
  schemaEffetTerrain,
  schemaEffetDissipation,
  schemaEffetNarratif,
]);
export type Effet = z.infer<typeof schemaEffet>;
export type EffetSaisi = z.input<typeof schemaEffet>;
export const TYPES_EFFET = schemaEffet.options.map((o) => o.shape.type.value);

// ---------- Ciblage, zone, résolution, persistance ----------

export const schemaCiblage = z.strictObject({
  type: z.enum(['soi', 'creature', 'point', 'aucun']),
  camp: z.enum(['ennemi', 'allie', 'toute']).default('toute'),
  portee: schemaPortee,
  /** 1 par défaut ; plus pour les projectiles (un dé par projectile, cibles séparables). */
  nbCibles: z.number().int().min(1).max(10).default(1),
  ligneDeVue: z.boolean().default(true),
});

export const schemaZone = z.strictObject({
  /** `carre` : zone N×N centrée (« zone 3×3 ») ; `cercle` : rayon N ; `ligne` : N cases depuis l'origine. */
  forme: z.enum(['carre', 'cercle', 'ligne', 'cone']),
  /** Côté (carré), rayon (cercle) ou longueur (ligne, cône), en cases. */
  taille: z.number().int().min(1).max(20),
  origine: z.enum(['lanceur', 'cible', 'point']),
  /** Validé : une zone touche tout le monde, alliés compris, sauf mention contraire. */
  filtre: z.enum(['tous', 'ennemis', 'allies']).default('tous'),
  /** 100 / 75 / 50 % par cercle autour du centre. */
  degressif: z.boolean().default(false),
});

export const schemaResolution = z
  .strictObject({
    /** Validé : les verbes passent par un DD et une sauvegarde ; l'attaque magique est réservée aux sorts mineurs. */
    jet: z.enum(['auto', 'sauvegarde', 'attaqueMagique', 'attaque', 'aucun']),
    sauvegarde: schemaSauvegarde.optional(),
    /** Ce que fait une sauvegarde réussie sur les effets sans condition. */
    siSauvegarde: z.enum(['annule', 'moitie', 'rien']).optional(),
  })
  .refine((r) => (r.jet === 'sauvegarde') === (r.sauvegarde !== undefined), {
    message: 'une sauvegarde est nommée si et seulement si le jet est une sauvegarde',
  })
  .refine((r) => (r.jet === 'sauvegarde') === (r.siSauvegarde !== undefined), {
    message: 'siSauvegarde est donné si et seulement si le jet est une sauvegarde',
  });

export const schemaPersistance = z.strictObject({
  type: z.enum(['instantane', 'duree', 'concentration', 'zone']),
  duree: schemaDuree.optional(),
  /** Coût de maintien par round, en points de la ressource de l'action. */
  maintien: z.number().int().min(1).max(5).optional(),
  rupture: z.array(z.enum(['cibleAttaquee', 'lanceurSurpris', 'lanceurAttaque', 'autreConcentration'])).default([]),
  /** Zone persistante : quand elle agit. */
  quand: z.enum(['entree', 'debutTour', 'finTour']).optional(),
});

/** Ce qui déclenche une réaction. */
export const schemaDeclencheur = z.enum([
  'allieCible',
  'allieAttaqueAuContact',
  'attaqueSubie',
  'attaqueRatee',
  'ennemiQuitteContact',
  'sortCible',
  'effetSonOuCharme',
  'controleMental',
  'allieTombe',
  'jetAllie',
]);

/** Un coût fixe (techniques, capacités) ; les verbes ont le leur par formule (lib/effets/cout.ts). */
export const schemaCout = z.strictObject({
  ressource: schemaRessource,
  montant: z.number().int().min(0).max(20),
});

export const schemaElementAutorise = z.strictObject({
  /** Où s'applique l'effet générique de l'élément. */
  application: z.enum(['ciblePrincipale', 'chaqueCible', 'chaqueProjectile']),
});

/** Usage hors combat (validé) : autant de paliers que l'effet en combat ; coût = moitié, arrondie au supérieur, minimum 1. */
export const schemaHorsCombat = z.strictObject({
  paliers: z.array(z.string().min(1)).min(1).max(3),
  /** En scène, une réussite comptée d'office (Leurre, Terreur…). */
  reussites: z.number().int().min(1).max(3).optional(),
});

// ---------- Paliers en deltas ----------

/*
 * Un delta touche les champs qui changent ; `effets` se patche par index,
 * `ajoute` en ajoute à la fin. Les deltas sont écrits SANS valeurs par
 * défaut : un `.partial()` des schémas ci-dessus garderait leurs défauts et
 * un delta `{ nbCibles: 2 }` remettrait le camp à `toute` (testé).
 */
export const schemaDeltaPalier = z.strictObject({
  ciblage: z
    .strictObject({
      type: schemaCiblage.shape.type.optional(),
      camp: z.enum(['ennemi', 'allie', 'toute']).optional(),
      portee: schemaPortee.optional(),
      nbCibles: z.number().int().min(1).max(10).optional(),
      ligneDeVue: z.boolean().optional(),
    })
    .optional(),
  zone: z
    .strictObject({
      forme: schemaZone.shape.forme.optional(),
      taille: schemaZone.shape.taille.optional(),
      origine: schemaZone.shape.origine.optional(),
      filtre: z.enum(['tous', 'ennemis', 'allies']).optional(),
      degressif: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  resolution: z.strictObject({ sauvegarde: schemaSauvegarde.optional(), siSauvegarde: z.enum(['annule', 'moitie', 'rien']).optional() }).optional(),
  persistance: z
    .strictObject({
      type: schemaPersistance.shape.type.optional(),
      duree: schemaDuree.optional(),
      maintien: z.number().int().min(1).max(5).optional(),
      rupture: z.array(z.enum(['cibleAttaquee', 'lanceurSurpris', 'lanceurAttaque', 'autreConcentration'])).optional(),
      quand: z.enum(['entree', 'debutTour', 'finTour']).optional(),
    })
    .optional(),
  effets: z.record(z.string().regex(/^\d+$/), z.record(z.string(), z.unknown())).optional(),
  ajoute: z.array(schemaEffet).optional(),
  element: schemaElementAutorise.optional(),
});
export type DeltaPalier = z.infer<typeof schemaDeltaPalier>;

// ---------- L'action ----------

export const schemaAction = z
  .strictObject({
    id: schemaId,
    nom: z.string().min(1),
    description: z.string().min(1),
    nature: schemaNature,
    /** Discipline (école ou Cercle) d'un verbe ou d'un sort mineur. */
    ecole: schemaId.optional(),
    /** 1 à 5 pour un verbe (coût de base, paliers) ; 0 pour un sort mineur. */
    rang: z.number().int().min(0).max(5),
    etiquettes: z.array(schemaEtiquette).min(1),
    action: schemaTypeAction,
    limite: schemaLimite.default('volonte'),
    /** Coût fixe. Absent pour un verbe (formule) et un sort mineur (0). */
    cout: z.array(schemaCout).optional(),
    declencheur: schemaDeclencheur.optional(),
    ciblage: schemaCiblage,
    zone: schemaZone.nullable().default(null),
    resolution: schemaResolution,
    persistance: schemaPersistance.default({ type: 'instantane', rupture: [] }),
    effets: z.array(schemaEffet),
    paliers: z.strictObject({ II: schemaDeltaPalier.optional(), III: schemaDeltaPalier.optional() }).default({}),
    element: schemaElementAutorise.nullable().default(null),
    horsCombat: schemaHorsCombat.nullable().default(null),
    /** Action laissée au MJ, avec sa raison : listée, jamais cachée. */
    manuel: z.string().min(1).optional(),
  })
  .superRefine((a, ctx) => {
    const ko = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
    if (a.nature === 'verbe') {
      if (a.rang < 1) ko('un verbe a un rang de 1 à 5', ['rang']);
      if (!a.ecole) ko('un verbe appartient à une école', ['ecole']);
      if (a.cout) ko('le coût d’un verbe vient de la formule (lib/effets/cout.ts), pas d’un coût fixe', ['cout']);
    }
    if (a.nature === 'mineur') {
      if (a.rang !== 0) ko('un sort mineur est de rang 0', ['rang']);
      if (a.cout) ko('un sort mineur coûte 0 PP', ['cout']);
      if (a.paliers.II || a.paliers.III) ko('un sort mineur n’a pas de paliers (sauf Voie du virtuose, plus tard)', ['paliers']);
    }
    if (a.nature !== 'verbe' && a.nature !== 'mineur' && a.rang === 0) ko('seul un sort mineur est de rang 0', ['rang']);
    if (a.paliers.III && !a.paliers.II) ko('un palier III suppose un palier II', ['paliers']);
    if ((a.nature === 'reaction' || a.action === 'reaction') && !a.declencheur) ko('une réaction a un déclencheur', ['declencheur']);
    if (a.declencheur && a.action !== 'reaction') ko('seule une réaction a un déclencheur', ['declencheur']);
    if (a.nature === 'passif' && a.action !== 'aucune') ko('un passif ne coûte aucune action', ['action']);
    if (a.horsCombat && !a.etiquettes.some((e) => e !== 'combat')) ko('un usage hors combat demande l’étiquette exploration ou social', ['etiquettes']);
    if (a.effets.length === 0 && !a.manuel) ko('une action sans effet est manuelle, avec sa raison', ['effets']);
    if (a.persistance.type === 'concentration' && a.persistance.duree === undefined && a.persistance.maintien === undefined)
      ko('une concentration a une durée ou un coût de maintien', ['persistance']);
    a.effets.forEach((e, i) => {
      if (e.vise === 'zone' && !a.zone) ko('un effet sur la zone demande une zone', ['effets', i, 'vise']);
      if (e.type === 'degats' && e.attenuation && !(typeof a.ciblage.portee === 'number' && a.ciblage.portee > e.attenuation.pleinsJusqua))
        ko('une atténuation demande une portée en cases au-delà des dégâts pleins', ['effets', i, 'attenuation']);
      if ((e.condition === 'sauvegardeRatee' || e.condition === 'sauvegardeReussie') && a.resolution.jet !== 'sauvegarde')
        ko('une condition de sauvegarde demande un jet de sauvegarde', ['effets', i, 'condition']);
    });
  });
export type Action = z.infer<typeof schemaAction>;
/** Ce qu'on écrit dans src/regles/ : les valeurs par défaut peuvent être omises. */
export type ActionSaisie = z.input<typeof schemaAction>;

export const PALIERS = ['I', 'II', 'III'] as const;
export type Palier = (typeof PALIERS)[number];
