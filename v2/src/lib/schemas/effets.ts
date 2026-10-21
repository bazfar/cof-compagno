import { z } from 'zod';
import { schemaCarac, schemaFormuleDes, schemaId } from './commun.ts';

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

/**
 * Ce que coûte l'action dans le tour. `aucune` : passif. `mineure` : action
 * mineure, à côté de l'action du tour (Second souffle, décision 7a du
 * 21/10/2026 ; le Piège de fortune, action de mouvement en v1 ; lot L4.7).
 */
export const schemaTypeAction = z.enum(['action', 'mineure', 'reaction', 'gratuite', 'aucune']);

/** Fréquence d'usage. */
export const schemaLimite = z.enum(['volonte', '1x/round', '1x/combat', '1x/scene', '1x/scenario']);
export type Limite = z.infer<typeof schemaLimite>;

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
  /**
   * Voies du chaos (lot L4.9) : la Plongée, jauge de combat remise à 0 en
   * fin de combat ; la Corruption d'Âme, permanente (doc de cadre, « Voies
   * du chaos (validé) »).
   */
  'plongee',
  'corruptionAme',
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

/** Échelle de maîtrise d'un élément ou d'une école (validé). */
export const MAITRISES = ['nonMaitrise', 'initie', 'adepte', 'maitre'] as const;
export const schemaMaitrise = z.enum(MAITRISES);
export type Maitrise = z.infer<typeof schemaMaitrise>;

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
  /** Durée tirée au lancement, un seul jet par sort (Pierre en chair : 1d4 + CHA rounds, v1 ; lot L4.5). */
  z.strictObject({ des: schemaFormuleDes, plusModMagie: z.boolean().default(false) }),
  /** `base` + le mod de la cible pour cette caractéristique, au moins 1 round (élixirs du Barde : 3 + mod de CON du buveur, décision 15a ; lot L4.8). */
  z.strictObject({ base: z.number().int().min(0).max(10), plusModCible: schemaCarac }),
]);
export type Duree = z.infer<typeof schemaDuree>;

/**
 * Familles d'armes (doc de cadre, « Attaques spéciales d'arme ») : chacune
 * donne son attaque spéciale. La famille de chaque arme du catalogue est
 * dans src/regles/armes.ts (décision 1a du 21/10/2026, lot L4.7) ; bouclier
 * et mains nues ne sont pas des objets du catalogue.
 */
/** `armeAFeu` (pistolet, fusil) et `tromblon` : armes à feu du Chasseur (lot L4.14, décision 2b du 21/10/2026). */
export const FAMILLES_ARME = ['contondant', 'tranchantLourd', 'tranchantLeger', 'perforant', 'dague', 'bouclier', 'arc', 'arbalete', 'armeAFeu', 'tromblon', 'mainsNues'] as const;
export const schemaFamilleArme = z.enum(FAMILLES_ARME);
export type FamilleArme = z.infer<typeof schemaFamilleArme>;

/** Portée : contact, soi, un nombre de cases, ou celle de l'arme maniée (`arme`, lot L4.7 : allonge de la lance, tir de l'arc). */
export const schemaPortee = z.union([z.enum(['contact', 'soi', 'arme']), z.number().int().min(1).max(100)]);

/**
 * Qui reçoit un effet. `zone` : chaque créature de la zone, filtre de la
 * zone appliqué. `voisins` : les créatures à 1 case de la cible principale,
 * fournies par le lancer (Onde sismique, combinaison terre + électricité ;
 * lot L4.10).
 */
export const schemaVise = z.enum(['cible', 'zone', 'lanceur', 'allie', 'voisins']);

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
  /** Le lanceur n'a pas bougé ce tour (L'exemple, Voie du peuple ; lot L4.7). */
  'immobile',
  /** Le lanceur protège activement un allié, déclaré par le joueur comme en v1 (Pilier du village). */
  'protegeUnAllie',
  /** L'arme maniée est légère : dagues, épée courte, cimeterre, rapière (Précision du Barde, décision 7a ; lot L4.8). */
  'armeLegere',
  /** La cible porte un état de malus ou de contrôle (Botte mortelle, 10a). */
  'cibleAffaiblie',
  /** Premier round du combat (Entrée en scène, 11b). */
  'premierRound',
  /** La cible porte l'état Accusé (Mise en accusation du Chevalier, décision 8a ; lot L4.13). */
  'cibleAccusee',
  /** La cible n'a pas encore agi dans ce combat (Premier coup du Chasseur, lot L4.14). */
  'cibleNAPasAgi',
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
  /** Tous les jets d20 du porteur : attaques, sauvegardes, tests (Le héros qu'on n'oublie pas : −4 ; lot L4.7). */
  'tests',
  /** DEF contre les seules attaques au contact, ou à distance (abri de la Fortification de fortune, v1). */
  'DEFContact',
  'DEFDistance',
  /** La caractéristique que le lanceur choisit au lancer (élixirs du Barde ; lot L4.8). */
  'caracAuChoix',
]);

// ---------- Effets ----------

const champsCommuns = {
  vise: schemaVise.default('cible'),
  condition: schemaCondition.optional(),
  /** Boss et démons D5 n'y sont pas soumis (Sommeil, Ordre, Domination : validé ; lot L4.5). */
  saufBoss: z.literal(true).optional(),
  /** « Sinon » : seulement si l'effet d'index donné n'a pas pris sur cette cible (Bannissement, lot L4.6). */
  sinon: z.number().int().min(0).max(20).optional(),
};

/** Mod d'une caractéristique nommée, à la place du mod de magie (Second souffle : CON ; décision 12a du 21/10/2026, lot L4.7). */
const champMod = { mod: schemaCarac.optional() };

const schemaEffetDegats = z.strictObject({
  type: z.literal('degats'),
  /**
   * `arme` : les dés de l'arme maniée, plus son bonus de dégâts, tous deux
   * fournis par le lancer (lot L4.7) ; un critique double ces dés.
   */
  des: z.union([schemaFormuleDes, z.literal('arme')]),
  /** Ajoute le mod de la caractéristique de magie (ou d'attaque). */
  plusMod: z.boolean().default(false),
  ...champMod,
  typeDegats: schemaTypeDegats,
  /**
   * Dégâts pleins jusqu'à `pleinsJusqua` cases du lanceur, réduits au-delà,
   * jusqu'à la portée (Choc, décision du 20/10/2026 : pleins à 3 cases,
   * moitié de 4 à 6).
   */
  attenuation: z.strictObject({ pleinsJusqua: z.number().int().min(1).max(20), auDela: z.literal('moitie') }).optional(),
  /**
   * Sort mineur (validé) : le dé suit le niveau du lanceur, 1d6 aux niveaux
   * 1 à 4, 1d8 de 5 à 8, 1d10 de 9 à 12 (lib/effets/resolution.ts, deMineur).
   */
  progression: z.literal('mineur').optional(),
  /** Dégâts doublés contre les démons et morts-vivants (Flamme sacrée, lot L4.6). */
  doubleContre: z.literal('demonsMortsVivants').optional(),
  ...champsCommuns,
});

const schemaEffetSoin = z.strictObject({
  type: z.literal('soin'),
  des: schemaFormuleDes,
  plusMod: z.boolean().default(false),
  /** Chaîne (lot L4.6) : les cibles après la première reçoivent la moitié du même jet. */
  enChaine: z.literal('moitie').optional(),
  ...champMod,
  ...champsCommuns,
});

const schemaEffetPvTemp = z.strictObject({
  type: z.literal('pvTemp'),
  des: schemaFormuleDes,
  plusMod: z.boolean().default(false),
  ...champMod,
  ...champsCommuns,
});

const schemaEffetEtat = z.strictObject({
  type: z.literal('etat'),
  /** Identifiant d'un état du catalogue (L4.2). */
  etat: schemaId,
  duree: schemaDuree,
  /** Usages avant que l'état tombe (Double : la prochaine attaque, puis deux au palier II ; lot L4.5). */
  charges: z.number().int().min(1).max(5).optional(),
  /** Seulement si la cible a au plus `parNiveau` × niveau du lanceur en PV actuels (Sommeil : 4 × niveau ; Bannissement : 5 × niveau). */
  siPvAuPlus: z.strictObject({ parNiveau: z.number().int().min(1).max(10) }).optional(),
  /** Les dégâts de l'état soignent le lanceur (Brûlure qui draine, combinaison feu + sang ; lot L4.10). */
  draine: z.literal(true).optional(),
  /** Bonus des alliés du lanceur contre le porteur (Marque de l'Œil de l'inquisiteur, lot L4.6). */
  contre: z.array(z.strictObject({ cible: z.enum(['attaque', 'degats']), valeur: z.number().int().min(-10).max(10) })).optional(),
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
  /** repousse : s'éloigne du lanceur (ou du centre) ; attire : s'en approche ; teleporte : vers une case choisie ; libre : il se déplace où il veut (Esquive acrobatique, lot L4.8). */
  sens: z.enum(['repousse', 'attire', 'teleporte', 'libre']),
  cases: z.number().int().min(1).max(20),
  ...champsCommuns,
});

const schemaEffetBonus = z.strictObject({
  type: z.literal('bonus'),
  cible: schemaCibleBonus,
  /**
   * Signé : un malus est négatif. Formule de dés autorisée (« 1d4 ») ;
   * `modMagie` : le mod de la caractéristique de magie (Vêtements sacrés,
   * lot L4.6) ; `{ mod }` : celui d'une caractéristique nommée (lot L4.7) ;
   * `pointsDeChaos` : Plongée + Corruption d'Âme du lanceur, plafonnés
   * (Corruption motivante, lot L4.9).
   */
  valeur: z.union([z.number().int().min(-20).max(20), schemaFormuleDes, z.literal('modMagie'), z.strictObject({ mod: schemaCarac }), z.literal('pointsDeChaos')]),
  duree: schemaDuree,
  /** Dégâts en plus : leur type (Châtiment : sacrés, lot L4.6). */
  typeDegats: schemaTypeDegats.optional(),
  /** Le bonus tombe après usage (Châtiment : la prochaine frappe au contact). */
  consomme: z.literal('prochaineFrappe').optional(),
  /** Multiplié par le nombre d'alliés au contact, que compte le combat (Combat en phalange : +1 DEF par allié ; lot L4.7). */
  parAllieAuContact: z.literal(true).optional(),
  ...champsCommuns,
});

/**
 * Posture (Posture de combat, Voie du soldat, règle v1 conservée ; lot
 * L4.7) : le porteur prend jusqu'à son rang dans la voie en malus sur un
 * axe et autant en bonus sur un autre, jusqu'à son prochain tour ; la
 * Maîtrise tactique double ce plafond (décision du 20/10/2026). Le joueur
 * choisit les axes et la valeur au lancer.
 */
const schemaEffetPosture = z.strictObject({
  type: z.literal('posture'),
  axes: z.array(z.enum(['attaque', 'DEF', 'degats'])).min(2),
  ...champsCommuns,
});

/**
 * Les PV de la cible ne descendent pas sous `valeur` (Protection contre la
 * mort, lot L4.6) ; pendant `duree` si elle est donnée (Le fléau, c'est
 * moi : 3 rounds, lot L4.9), sinon jusqu'au prochain coup.
 */
const schemaEffetPlancherPv = z.strictObject({
  type: z.literal('plancherPv'),
  valeur: z.number().int().min(1).max(10),
  duree: schemaDuree.optional(),
  ...champsCommuns,
});

const schemaEffetRessource = z.strictObject({
  type: z.literal('ressource'),
  ressource: schemaRessource,
  /** Signé : gain positif, perte négative ; `vider` : la réserve tombe à 0 (Ascension chaotique, lot L4.9). */
  montant: z.union([z.number().int().min(-20).max(20), z.literal('vider')]),
  ...champsCommuns,
});

/** La cible tombe à 0 PV (Murmure terrifiant, 19–20 ; lot L4.9). */
const schemaEffetTombe = z.strictObject({
  type: z.literal('tombe'),
  ...champsCommuns,
});

const schemaEffetInvocation = z.strictObject({
  type: z.literal('invocation'),
  /** Identifiant d'une créature invocable (src/regles/invocations.ts, lot L4.4a). */
  creature: schemaId,
  /**
   * La créature dépend de l'élément choisi au lancement : `<creature>.<élément>`
   * (Serviteur : `serviteur.feu` est Tison). Le lancement exige alors un élément.
   */
  parElement: z.boolean().default(false),
  nombre: z.number().int().min(1).max(10).default(1),
  duree: schemaDuree,
  ...champsCommuns,
});

const schemaEffetTerrain = z.strictObject({
  type: z.literal('terrain'),
  /** `bloquant` : bloque le passage et la vue, couverture totale (Rempart) ; `sanctuaire` : rien d'extérieur ne cible ceux qui sont dedans. */
  nature: z.enum(['difficile', 'glissant', 'bloquant', 'couverture', 'enflamme', 'sanctuaire', 'illusion', 'sanctifie', 'electrifie']),
  duree: schemaDuree,
  ...champsCommuns,
});

const schemaEffetDissipation = z.strictObject({
  type: z.literal('dissipation'),
  nombre: z.number().int().min(1).default(1),
  ...champsCommuns,
});

/** Rend tous ses PV à la cible (Saignée, lot L4.4b2). */
const schemaEffetSoinComplet = z.strictObject({
  type: z.literal('soinComplet'),
  ...champsCommuns,
});

/** Réaction : les dégâts du déclencheur sont réduits ; `renvoi` : la part retenue revient à celui qui les inflige (Renvoi). */
const schemaEffetReductionDegats = z.strictObject({
  type: z.literal('reductionDegats'),
  part: z.literal('moitie'),
  renvoi: z.boolean().default(false),
  ...champsCommuns,
});

/**
 * Dés lancés d'avance (Prophétie, lot L4.5) : le lanceur en choisit le
 * nombre au lancement, chacun coûte `ppParDe` ; il attribue ensuite chaque
 * résultat à une créature, qui le prend comme valeur de son prochain jet.
 */
const schemaEffetJetsReserves = z.strictObject({
  type: z.literal('jetsReserves'),
  des: schemaFormuleDes,
  ppParDe: z.number().int().min(1).max(10),
  ...champsCommuns,
});

/** Le d20 qui déclenche la réaction est relancé, le second jet compte (Inspiration du Barde, décision 6a ; lot L4.8). */
const schemaEffetRelance = z.strictObject({
  type: z.literal('relance'),
  ...champsCommuns,
});

/** Effet d'arbitrage, assumé : l'app l'affiche, le MJ l'applique. */
const schemaEffetNarratif = z.strictObject({
  type: z.literal('narratif'),
  texte: z.string().min(1),
  ...champsCommuns,
});

const EFFETS_DE_BASE = [
  schemaEffetDegats,
  schemaEffetSoin,
  schemaEffetPvTemp,
  schemaEffetEtat,
  schemaEffetRetraitEtat,
  schemaEffetDeplacement,
  schemaEffetBonus,
  schemaEffetPosture,
  schemaEffetRessource,
  schemaEffetInvocation,
  schemaEffetTerrain,
  schemaEffetDissipation,
  schemaEffetReductionDegats,
  schemaEffetSoinComplet,
  schemaEffetJetsReserves,
  schemaEffetPlancherPv,
  schemaEffetRelance,
  schemaEffetTombe,
  schemaEffetNarratif,
] as const;

/**
 * Table au d20 (Murmure terrifiant, lot L4.9) : un d20 par cible, la ligne
 * dont `min` est le plus haut atteint s'applique. Ses lignes ne contiennent
 * pas d'autre table. Un « sinon » d'une ligne renvoie à un effet de la même
 * ligne.
 */
const schemaEffetTableD20 = z.strictObject({
  type: z.literal('tableD20'),
  lignes: z
    .array(z.strictObject({ min: z.number().int().min(1).max(20), effets: z.array(z.discriminatedUnion('type', [...EFFETS_DE_BASE])).min(1) }))
    .min(2)
    .refine((l) => l.every((x, i) => i === 0 || x.min < l[i - 1]!.min) && l.at(-1)!.min === 1, 'lignes par min décroissant, la dernière à 1'),
  ...champsCommuns,
});

export const schemaEffet = z.discriminatedUnion('type', [...EFFETS_DE_BASE, schemaEffetTableD20]);
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
    /** Un allié du lanceur ne sauvegarde pas : il accepte l'effet (Portail). */
    consentant: z.literal(true).optional(),
    /** DD fixe, à la place de celui du lanceur (test de CON d'un élixir : 12 à 20, v1 ; lot L4.8). */
    ddFixe: z.number().int().min(5).max(30).optional(),
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
  /** Zone persistante : quand elle agit. `finDeplacement` : une créature y finit son déplacement (pièges, v1 ; lot L4.7). */
  quand: z.enum(['entree', 'finDeplacement', 'debutTour', 'finTour']).optional(),
});

/** Ce qui déclenche une réaction. */
export const schemaDeclencheur = z.enum([
  /** Une attaque vise le lanceur, ou un allié à la portée du sort (Bouclier). */
  'attaqueVisee',
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
  /** À tout moment hors de son tour (changement de posture, Maîtrise tactique ; lot L4.7). */
  'aToutMoment',
  /** Le porteur subit un état (Échappée du Barde ; lot L4.8). */
  'etatSubi',
  /** Il réduit un ennemi à 0 PV (Soif de sang, Voie du chaos du Guerrier ; lot L4.9). */
  'ennemiAbattu',
  /** Un ennemi arrive à son contact (Repli du Chasseur, lot L4.14). */
  'ennemiArriveAuContact',
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
  resolution: z
    .strictObject({
      jet: z.enum(['auto', 'sauvegarde', 'attaqueMagique', 'attaque', 'aucun']).optional(),
      sauvegarde: schemaSauvegarde.optional(),
      siSauvegarde: z.enum(['annule', 'moitie', 'rien']).optional(),
    })
    .optional(),
  /** Un palier peut ouvrir un usage (Main du mage III : en combat, lot L4.4b2). */
  etiquettes: z.array(schemaEtiquette).min(1).optional(),
  persistance: z
    .strictObject({
      type: schemaPersistance.shape.type.optional(),
      duree: schemaDuree.optional(),
      maintien: z.number().int().min(1).max(5).optional(),
      rupture: z.array(z.enum(['cibleAttaquee', 'lanceurSurpris', 'lanceurAttaque', 'autreConcentration'])).optional(),
      quand: z.enum(['entree', 'finDeplacement', 'debutTour', 'finTour']).optional(),
    })
    .optional(),
  effets: z.record(z.string().regex(/^\d+$/), z.record(z.string(), z.unknown())).optional(),
  ajoute: z.array(schemaEffet).optional(),
  /** Remplace tous les effets (une variante qui fait autre chose : Calme les esprits, lot L4.6). */
  remplaceEffets: z.array(schemaEffet).min(1).optional(),
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
    /** L'attaque vise la DEF sans armure (Pique mentale, lot L4.5). */
    ignoreArmure: z.literal(true).optional(),
    /**
     * Le lanceur sacrifie des PV en plus du coût (Saignée : la moitié de ses
     * PV actuels ; Prouesse : 1d4, lot L4.7) ; `parPointDeChaos` : un dé
     * par point de Plongée + Corruption d'Âme, au plus `plafond`
     * (Corruption motivante, lot L4.9).
     */
    sacrifice: z
      .union([
        z.literal('moitiePvActuels'),
        z.strictObject({ des: schemaFormuleDes }),
        z.strictObject({ parPointDeChaos: z.enum(['d4', 'd6']), plafond: z.number().int().min(1).max(10) }),
      ])
      .optional(),
    /** Voie du chaos, R3 (lot L4.9) : un d20 de chaos à chaque usage ; 18 à 20, mutation du palier 1. */
    jetDeChaos: z.literal(true).optional(),
    /** Voie du chaos, R4 : active seulement dès cette Corruption d'Âme (5, validé). */
    corruptionAmeMin: z.number().int().min(1).max(10).optional(),
    /** Attaque spéciale de cette famille d'armes (lot L4.7) : il faut une arme de la famille, et son coût vient de la classe. */
    famille: schemaFamilleArme.optional(),
    /** Jet d'attaque fait avec le mod de cette caractéristique, sans arme (pièges : DEX contre la DEF, v1). */
    attaquePar: schemaCarac.optional(),
    /** L'action demande une arme de ces familles, sans être une attaque spéciale (Lancer un couteau : une dague ; lot L4.8). */
    armes: z.array(schemaFamilleArme).min(1).optional(),
    /** Exige un élément au moins à ce rang (Serviteur : Initié ; Cataclysme : Maître). */
    elementMin: schemaMaitrise.optional(),
    declencheur: schemaDeclencheur.optional(),
    ciblage: schemaCiblage,
    zone: schemaZone.nullable().default(null),
    resolution: schemaResolution,
    persistance: schemaPersistance.default({ type: 'instantane', rupture: [] }),
    effets: z.array(schemaEffet),
    paliers: z.strictObject({ II: schemaDeltaPalier.optional(), III: schemaDeltaPalier.optional() }).default({}),
    /**
     * Variantes d'un palier : à ce palier, le lanceur choisit ce delta à la
     * place de celui du palier (Bouclier III : +3 DEF, ou deux cibles).
     */
    variantes: z.array(z.strictObject({ id: schemaId, nom: z.string().min(1), palier: z.enum(['I', 'II', 'III']), delta: schemaDeltaPalier })).default([]),
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
    }
    if (a.nature !== 'verbe' && a.nature !== 'mineur' && a.rang === 0) ko('seul un sort mineur est de rang 0', ['rang']);
    if (a.paliers.III && !a.paliers.II) ko('un palier III suppose un palier II', ['paliers']);
    a.variantes.forEach((v, i) => {
      if (v.palier !== 'I' && !a.paliers[v.palier]) ko(`une variante du palier ${v.palier} suppose ce palier`, ['variantes', i, 'palier']);
    });
    if (new Set(a.variantes.map((v) => v.id)).size !== a.variantes.length) ko('deux variantes ont le même identifiant', ['variantes']);
    if ((a.nature === 'reaction' || a.action === 'reaction') && !a.declencheur) ko('une réaction a un déclencheur', ['declencheur']);
    // Un passif peut avoir un déclencheur : il joue d'office (Premier sang, Soif de sang ; lot L4.9).
    if (a.declencheur && a.action !== 'reaction' && a.nature !== 'passif') ko('seule une réaction, ou un passif, a un déclencheur', ['declencheur']);
    if (a.nature === 'passif' && a.action !== 'aucune') ko('un passif ne coûte aucune action', ['action']);
    if (a.elementMin && !a.element) ko('une action qui exige un élément doit en accepter un', ['elementMin']);
    a.effets.forEach((e, i) => {
      if (e.type === 'degats' && e.progression === 'mineur' && a.nature !== 'mineur') ko('seul un sort mineur suit la progression des sorts mineurs', ['effets', i, 'progression']);
      if ((e.type === 'degats' || e.type === 'soin' || e.type === 'pvTemp') && e.plusMod && e.mod) ko('un seul mod : celui de magie ou celui nommé', ['effets', i, 'mod']);
      if (e.type === 'degats' && e.des === 'arme' && !(a.resolution.jet === 'attaque' && !a.attaquePar)) ko('les dés de l’arme demandent une attaque à l’arme', ['effets', i, 'des']);
    });
    // Attaques d'arme (lot L4.7).
    if (a.attaquePar && a.resolution.jet !== 'attaque') ko('attaquePar demande un jet d’attaque', ['attaquePar']);
    // Une attaque spéciale frappe à l'arme, ou la prépare sans jet (Précision des armes à feu : il vise un tour sans tirer, lot L4.14).
    if (a.famille && (a.nature !== 'technique' || (a.resolution.jet !== 'attaque' && a.resolution.jet !== 'aucun') || a.attaquePar)) ko('une attaque spéciale est une technique, à l’attaque d’arme ou sans jet', ['famille']);
    if (a.famille && a.cout) ko('le coût d’une attaque spéciale vient de la classe', ['cout']);
    if (a.armes && !(a.resolution.jet === 'attaque' && !a.attaquePar)) ko('une arme exigée demande une attaque à l’arme', ['armes']);
    if (a.horsCombat && !a.etiquettes.some((e) => e !== 'combat')) ko('un usage hors combat demande l’étiquette exploration ou social', ['etiquettes']);
    if (a.effets.length === 0 && !a.manuel) ko('une action sans effet est manuelle, avec sa raison', ['effets']);
    if (a.persistance.type === 'concentration' && a.persistance.duree === undefined && a.persistance.maintien === undefined)
      ko('une concentration a une durée ou un coût de maintien', ['persistance']);
    a.effets.forEach((e, i) => {
      if (e.sinon !== undefined && e.sinon >= i) ko('« sinon » renvoie à un effet qui le précède', ['effets', i, 'sinon']);
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
