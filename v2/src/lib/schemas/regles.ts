import { z } from 'zod';
import { CARACS, schemaCarac, schemaId } from './commun.ts';

/*
 * Schémas des données de règles (src/donnees/*.json), importées de la v1
 * par outils/importer-v1.ts. Source unique de leur forme : l'import, les
 * tests et l'app s'en servent tous.
 *
 * Niveau d'exigence (décision verrouillée, lot L1, 15/10/2026) :
 * - STRICT sur ce qui est stable : noms des champs (une faute de frappe dans
 *   la v1 fait échouer l'import), types d'effets, cibles, fréquences ;
 * - TOLÉRANT (`z.unknown()`) sur les sous-structures complexes des
 *   mécaniques (choix, paliers, durées objet…) : elles seront redéfinies
 *   par le moteur d'effets, avec la refonte de la magie et des classes.
 * Ce fichier n'importe que `zod` et ./commun.ts (avec l'extension) :
 * outils/importer-v1.ts l'exécute directement avec Node.
 */

export { CARACS, schemaCarac, schemaId };

// ---------- Mécaniques (capacités, sorts, voies raciales) ----------
export const schemaFrequence = z.enum([
  'libre',
  'permanente',
  '1x/tour',
  '1x/combat',
  '1x/scene',
  '1x/jour',
  '1x/scenario',
]);

export const schemaEffet = z
  .object({
    type: z.enum(['bonus', 'special', 'soin', 'degats', 'etat', 'pvTemp', 'retraitEtat', 'dissipation', 'seuilsPv']),
    cible: z.string().optional(),
    note: z.string().optional(),
    formule: z.string().optional(),
    valeur: z.union([z.number(), z.string()]).optional(),
    id: z.string().optional(),
    elementaire: z.string().nullable().optional(),
    typeDegats: z.string().optional(),
    differe: z.boolean().optional(),
    formuleDot: z.string().optional(),
    formuleSoin: z.string().optional(),
    coutMaintienPP: z.number().optional(),
    choixApresCible: z.boolean().optional(),
    choixDynamique: z.string().optional(),
    cibleGroupe: z.string().optional(),
    // Sous-structures redéfinies par le moteur d'effets (refonte) :
    duree: z.unknown().optional(),
    choix: z.unknown().optional(),
    testVolonte: z.unknown().optional(),
    paliers: z.unknown().optional(),
    valeurParChoix: z.unknown().optional(),
    ciblesSupplementaires: z.unknown().optional(),
    recurrence: z.unknown().optional(),
    etatParChoix: z.unknown().optional(),
    formuleAlternative: z.unknown().optional(),
  })
  .strict();

export const schemaMecanique = z
  .object({
    type: z.enum(['activable', 'passive', 'limitee', 'rituel']),
    usage: z.object({ frequence: schemaFrequence }).strict(),
    cible: z.enum(['soi', 'allie', 'ennemi', 'zone', 'aucune', 'groupe']),
    portee: z.union([z.number(), z.string()]).nullable(),
    zone: z.unknown().nullable(),
    jetOppose: z.unknown().nullable(),
    effets: z.array(schemaEffet),
    coutPP: z.union([z.number(), z.literal('tout')]).optional(),
    typeSort: z.string().optional(),
    reactionCout: z.number().optional(),
    actionBonus: z.boolean().optional(),
    corruption: z.number().optional(),
    corruptionCout: z.number().optional(),
    corruptionCoutMin: z.number().optional(),
    ameGain: z.number().optional(),
    ameCout: z.number().optional(),
    rituel: z.boolean().optional(),
    maxCibles: z.number().optional(),
    remousMultiplicateur: z.number().optional(),
    cibleZoneHostile: z.boolean().optional(),
    coutPointsBenediction: z.number().optional(),
    coutPointsConviction: z.number().optional(),
    coutPointsBannissement: z.number().optional(),
    coutPointsJugement: z.number().optional(),
    testVolonte: z.unknown().optional(),
    jetSauvegardeFixe: z.unknown().optional(),
  })
  .strict();
export type Mecanique = z.infer<typeof schemaMecanique>;

// ---------- Classes, voies, capacités ----------
export const schemaCapacite = z
  .object({
    id: schemaId,
    rang: z.number().int().min(1).max(5),
    /** null : rang sans nom en v1 (Voie des poings du Moine, rangs 1 à 5). */
    nom: z.string().min(1).nullable(),
    effet: z.string(),
    mecanique: schemaMecanique.nullable(),
  })
  .strict();
export type Capacite = z.infer<typeof schemaCapacite>;

export const schemaVoie = z
  .object({
    id: schemaId,
    nom: z.string().min(1),
    speciale: z.boolean(),
    description: z.string(),
    rangs: z.array(schemaCapacite).length(5),
  })
  .strict();
export type Voie = z.infer<typeof schemaVoie>;

export const schemaClasse = z
  .object({
    id: schemaId,
    nom: z.string().min(1),
    deVie: z.number().int().positive(),
    armes: z.string(),
    armures: z.string(),
    attaque: z
      .object({ contact: z.string().nullable(), distance: z.string().nullable(), magique: z.string().nullable() })
      .strict(),
    notesGenerales: z.string(),
    creation: z.array(z.string()),
    voies: z.array(schemaVoie).min(1),
  })
  .strict();
export type Classe = z.infer<typeof schemaClasse>;

// ---------- Races ----------
export const schemaVarianteRace = z
  .object({
    id: schemaId,
    code: z.string(),
    nom: z.string(),
    nomCapacite: z.string(),
    effet: z.string(),
    mecanique: schemaMecanique.nullable(),
  })
  .strict();

export const schemaRace = z
  .object({
    id: schemaId,
    nom: z.string(),
    description: z.string(),
    traitPassif: z.string().nullable(),
    voie: z.object({ id: schemaId, nom: z.string(), rangs: z.array(schemaCapacite).length(5) }).strict(),
    variantes: z.array(schemaVarianteRace),
  })
  .strict();
export type Race = z.infer<typeof schemaRace>;

// ---------- Sorts ----------
export const schemaSort = z
  .object({
    id: schemaId,
    nom: z.string(),
    rang: z.number().int().min(1).max(5),
    categorie: z.string(),
    effet: z.string(),
    /** Listes qui contiennent ce sort : « arcanique » (Magicien, Enchanteur, Nécromancien), « pretre ». */
    listes: z.array(z.enum(['arcanique', 'pretre'])).min(1),
    mecanique: schemaMecanique,
  })
  .strict();
export type Sort = z.infer<typeof schemaSort>;

// ---------- États, dons, mutations ----------
export const schemaEtat = z
  .object({
    id: schemaId,
    nom: z.string(),
    categorie: z.enum(['controle', 'malus', 'dot', 'physique', 'buff']),
    description: z.string(),
    reserve: z.boolean().optional(),
    parSource: z.boolean().optional(),
  })
  .strict();

export const schemaDon = z
  .object({ id: schemaId, nom: z.string(), categorie: z.string(), effet: z.string() })
  .strict();

export const schemaMutation = z
  .object({
    d6: z.number().int().min(1).max(6),
    nom: z.string(),
    effet: z.string(),
    caracDelta: z.partialRecord(schemaCarac, z.number()).optional(),
    competenceDelta: z.record(z.string(), z.number()).optional(),
  })
  .loose();

export const schemaMutations = z
  .object({
    seuilsPaliers: z.record(z.string(), z.number()),
    paliers: z.array(
      z.object({ palier: z.number().int(), nom: z.string(), plage: z.string(), mutations: z.array(schemaMutation) }).strict(),
    ),
    rupture: z.object({ nom: z.string(), plage: z.string(), texte: z.string() }).strict(),
  })
  .strict();

// ---------- Constantes de règles ----------
const parClasse = <T extends z.ZodType>(valeur: T) => z.record(schemaId, valeur);

export const schemaConstantes = z
  .object({
    caracs: z.array(z.object({ code: schemaCarac, nom: z.string() }).strict()).length(6),
    sauvegardes: z.record(z.string(), schemaCarac),
    competencesParCarac: z.record(schemaCarac, z.array(z.string())),
    ordreClasses: z.array(schemaId),
    ordreRaces: z.array(schemaId),
    archetypeClasse: parClasse(z.enum(['martial', 'hybride', 'lanceur'])),
    diviseurAttaque: z.record(z.enum(['martial', 'hybride', 'lanceur']), z.number().int().positive()),
    multiplicateurModPP: z.record(z.enum(['hybride', 'lanceur']), z.number()),
    familleClasse: parClasse(schemaCarac),
    caracMagie: parClasse(schemaCarac),
    bonusCaracsClasse: parClasse(z.object({ plus2: schemaCarac, plus1: schemaCarac }).strict()),
    maitriseArmure: parClasse(z.enum(['legere', 'moyenne', 'lourde'])),
    maitriseArme: parClasse(z.enum(['simple', 'martiale'])),
    rangCategorieArmure: z.record(z.string(), z.number().int()),
    rangMaitriseArme: z.record(z.string(), z.number().int()),
    classesEligiblesAttaqueOpportunite: z.array(schemaId),
    coutPPParRang: z.record(z.string(), z.number()),
    niveauMinParRang: z.record(z.string(), z.number()),
    grimoireInscritsBase: z.number().int(),
    grimoireNiveauPivot: z.number().int(),
    cercleSortGratuit: z.record(z.string(), schemaId),
    /** École → capacités qui la débloquent (toutes les voies portant le nom cité par la v1). */
    ecoleDeblocage: z.record(z.string(), z.array(schemaId).min(1)),
    /** Sorts accordés directement par une capacité. */
    sortsAccordes: z.array(z.object({ capacite: schemaId, sort: schemaId }).strict()),
    invocations: z.array(z.object({ id: schemaId, capacite: schemaId }).loose()),
  })
  .strict();
export type Constantes = z.infer<typeof schemaConstantes>;

// ---------- Table des identifiants figés ----------
/**
 * « classe|Nom de la voie » → identifiant. Une entrée n'est JAMAIS modifiée
 * par l'import : renommer une voie dans la v1 garde son identifiant (voir
 * src/donnees/LISEZMOI.md).
 */
export const schemaIdentifiants = z
  .object({
    voies: z.record(z.string(), schemaId),
  })
  .strict();
