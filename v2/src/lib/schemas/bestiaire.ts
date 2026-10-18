import { z } from 'zod';
import { schemaFormuleDes, schemaId } from './commun.ts';

/*
 * Schémas du bestiaire, des armes et armures de monstres et du socle
 * d'équilibrage, importés de la v1 (data/bestiaire.json, armes_monstres.js,
 * armures_monstres.js, equilibrage.js) par outils/importer-v1.ts.
 *
 * Les listes de valeurs et de champs autorisés reprennent celles de
 * tools/valider_bestiaire.js (v1) : ce qui passait la validation v1 passe
 * ici, une faute de frappe dans un nom de champ ne passe ni l'un ni l'autre.
 * Les sous-structures propres aux démons et aux capacités mécanisées
 * (faim, paliers, passifs, mécaniques) restent souples : elles relèvent du
 * combat (lot L6) et du moteur d'effets.
 */

export const PORTEES_ARME_MONSTRE = [
  'contact',
  'contact +1 case (3m)',
  'courte (6m)',
  'moyenne (18m)',
  'longue (36m)',
  'contact (zone adjacente)',
  'contact (arc frontal)',
] as const;

/** Dégâts de base « dé nu » ; seules ces armes portent un modificateur fixe (cf. v1). */
export const ARMES_DEGATS_COMPOSITES = ['filet_de_chasse', 'dague_dans_le_dos', 'attaque_sournoise'] as const;

export const schemaArmeMonstre = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    nom: z.string(),
    type: z.literal('arme'),
    degats: schemaFormuleDes,
    portee: z.enum(PORTEES_ARME_MONSTRE),
    typedegats: z.enum(['physique', 'magique']),
    elementaire: z.enum(['chaos', 'sacre', 'feu', 'froid', 'mental']).nullable().optional(),
    touches: z.number().int().min(2).optional(),
    critMin: z.number().int().min(2).max(20).optional(),
  })
  .strict()
  .refine(
    (a) => (ARMES_DEGATS_COMPOSITES as readonly string[]).includes(a.id) || /^\d*d\d+$/.test(a.degats),
    { message: 'les dégâts doivent être un dé nu : le modificateur est porté par l\'attaque (bonusDegats)' },
  );
export type ArmeMonstre = z.infer<typeof schemaArmeMonstre>;

export const schemaArmureMonstre = z
  .object({
    id: schemaId,
    nom: z.string(),
    reduction: z.number().int().nonnegative(),
    naturelle: z.boolean(),
    note: z.string().optional(),
  })
  .strict();
export type ArmureMonstre = z.infer<typeof schemaArmureMonstre>;

export const schemaAttaqueMonstre = z
  .object({
    nom: z.string(),
    armeId: schemaId,
    bonusAttaque: z.number().int(),
    bonusDegats: z.number().int().optional(),
    effetSpecial: z.string().nullable(),
    drainPP: z.number().int().positive().optional(),
    alimenteRemous: z.boolean().optional(),
    etatSurTouche: z
      .object({ id: schemaId, duree: z.number().int().positive(), formuleDot: schemaFormuleDes.optional() })
      .strict()
      .optional(),
  })
  .strict();

export const schemaCapaciteSpeciale = z
  .object({ nom: z.string(), description: z.string(), mecanique: z.unknown().optional() })
  .strict();

export const RACES_MONSTRE = ['humanoïdes', 'monstres', 'mort-vivant', 'corrompu', 'démon'] as const;
export const TIERS_MONSTRE = [
  'basique', 'veteran', 'elite', 'champion', 'recrue', 'meneur', 'grand_hote',
  'd1', 'd2', 'd3', 'd4', 'd5',
] as const;

export const schemaMonstre = z
  .object({
    id: schemaId,
    nom: z.string(),
    race: z.array(z.enum(RACES_MONSTRE)).min(1),
    pv: z.number().int().positive(),
    def: z.number().int(),
    init: z.number().int(),
    atk: z.number().int(),
    dangerosite: z.number().int().min(1).max(5),
    boss: z.boolean(),
    /** Clé de equilibrage.roles (vérifié par les tests de cohérence). */
    role: z.string(),
    taille: z.enum(['petite', 'moyenne', 'grande', 'très grande']),
    attaques: z.array(schemaAttaqueMonstre),
    capacitesSpeciales: z.array(schemaCapaciteSpeciale),
    lore: z.string(),
    emoji: z.string(),
    famille: z.string().optional(),
    tier: z.enum(TIERS_MONSTRE).optional(),
    faction: z.string().nullable().optional(),
    roleNarratif: z.string().optional(),
    armureId: schemaId.optional(),
    defMentale: z.number().int().optional(),
    immunites: z.array(schemaId).optional(),
    immunitesConditionnelles: z
      .array(z.object({ etats: z.array(schemaId), condition: z.string() }).strict())
      .optional(),
    resistances: z.partialRecord(z.enum(['physique', 'magique']), z.number().positive()).optional(),
    repousse: z.number().int().positive().optional(),
    soinSurDegats: z.number().positive().optional(),
    soinParPPDraine: z.number().positive().optional(),
    // Combat et démons (lot L6) :
    voies: z.unknown().optional(),
    capacitesActives: z.array(z.unknown()).optional(),
    resistanceLegendaire: z.unknown().optional(),
    faim: z.unknown().optional(),
    paliersSuivants: z.unknown().optional(),
    berserk: z.unknown().optional(),
    passifs: z.unknown().optional(),
  })
  .strict();
export type Monstre = z.infer<typeof schemaMonstre>;

/*
 * Bestiaire en base (lot L3.2, décision du 18/10/2026 : Firestore, lisible
 * du MJ seul). tables/{table}/bestiaire/{id} : un monstre, sans son id
 * (c'est celui du document), avec son origine et sa date de modification.
 * tables/{table}/bestiaireDonnees/{armes|armures|equilibrage} : les listes
 * de référence. Rien de tout cela n'est livré avec l'app.
 */
export const ORIGINES_MONSTRE = ['v1', 'mj'] as const;
export const schemaMonstreEnBase = schemaMonstre.omit({ id: true }).extend({
  /** v1 : importé de la v1 (éventuellement modifié) ; mj : créé par le MJ. */
  origine: z.enum(ORIGINES_MONSTRE),
  majLe: z.number().int().nonnegative(),
});
export type MonstreEnBase = z.infer<typeof schemaMonstreEnBase>;

export const schemaBestiaire = z
  .object({
    version: z.string(),
    notes: z.object({ generale: z.string(), familles: z.string(), race: z.string() }).strict(),
    monstres: z.array(schemaMonstre),
  })
  .strict();

const schemaStatsSocle = z
  .object({ pv: z.number(), def: z.number(), atk: z.number(), init: z.number(), dpt: z.number() })
  .strict();

export const schemaEquilibrage = z
  .object({
    /** Statistiques de référence par dangerosité (1 à 5). */
    socleDangerosite: z.record(z.string(), schemaStatsSocle),
    /** Modificateurs par rôle de monstre. */
    roles: z.record(
      schemaId,
      z
        .object({
          nom: z.string(),
          pv: z.number(),
          def: z.number(),
          atk: z.number(),
          init: z.number(),
          dpt: z.number(),
          coeffPm: z.number(),
        })
        .strict(),
    ),
    pmDangerosite: z.record(z.string(), z.number()),
    coeffBoss: z.number(),
  })
  .strict();
export type Equilibrage = z.infer<typeof schemaEquilibrage>;

/** bestiaireDonnees/armes et /armures : la liste entière dans un document. */
export const schemaListeArmes = z.strictObject({ liste: z.array(schemaArmeMonstre) });
export const schemaListeArmures = z.strictObject({ liste: z.array(schemaArmureMonstre) });

/** Fichier produit par `npm run bestiaire:exporter`, déposé par le MJ (lot L3.2). */
export const schemaExportBestiaire = z.strictObject({
  format: z.literal('cof-compagno/bestiaire-v1'),
  exporteLe: z.number().int().nonnegative(),
  monstres: z.array(schemaMonstre),
  armes: z.array(schemaArmeMonstre),
  armures: z.array(schemaArmureMonstre),
  equilibrage: schemaEquilibrage,
});
export type ExportBestiaire = z.infer<typeof schemaExportBestiaire>;
