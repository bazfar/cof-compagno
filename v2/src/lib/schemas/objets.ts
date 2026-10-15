import { z } from 'zod';
import { schemaCarac, schemaFormuleDes, schemaId } from './commun.ts';

/*
 * Schéma du catalogue d'objets (v1 : data/loot.js, LOOT_CATALOGUE) et de
 * l'équipement de départ (data/equipement_depart.js).
 *
 * Un seul schéma pour tous les types d'objets, avec la liste fermée des
 * champs que la v1 utilise réellement (une faute de frappe dans un nom de
 * champ fait échouer l'import). Le découpage par type (arme, armure,
 * accessoire…) viendra avec le lot loot (L3), qui retravaillera aussi
 * raretés, affixes, matériaux et enchantements (js/raretes.js… en v1).
 */

export const TYPES_OBJET = ['arme', 'armure', 'bouclier', 'consommable', 'accessoire', 'ingredient', 'recette'] as const;
export const RARETES = ['commun', 'peu_commun', 'rare', 'legendaire'] as const;
export const SLOTS_ACCESSOIRE = ['tete', 'collier', 'bague', 'jambe', 'mains', 'avant_bras'] as const;

export const schemaObjet = z
  .object({
    // Communs à tous les objets
    id: schemaId,
    nom: z.string(),
    type: z.enum(TYPES_OBJET),
    porte: z.boolean(),
    description: z.string(),
    prixPo: z.number().nonnegative(),
    quantite: z.number().int().positive().optional(),
    rarete: z.enum(RARETES).optional(),
    rariteFixe: z.boolean().optional(),
    rareteNom: z.string().optional(),
    rareteCouleur: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    origine: z.string().optional(),
    horsMarche: z.boolean().optional(),
    sansModificateurRegional: z.boolean().optional(),
    effet: z.string().optional(),
    effetDeclaratif: z.string().optional(),
    // Armes
    degats: schemaFormuleDes.optional(),
    degatsAuMoinsRare: schemaFormuleDes.optional(),
    portee: z.string().optional(),
    porteeMinCases: z.number().int().nonnegative().optional(),
    porteeMaxCases: z.number().int().positive().optional(),
    categoriePortee: z.enum(['contact', 'distance', 'allonge', 'jet']).optional(),
    typedegats: z.enum(['physique', 'magique']).optional(),
    enchantement: z.number().int().min(0).max(5).optional(),
    deuxMains: z.boolean().optional(),
    categorieArme: z.enum(['courte', 'longue', 'deux_mains']).optional(),
    maitrise: z.enum(['simple', 'martiale']).optional(),
    rechargement: z.number().int().positive().optional(),
    jetable: z.boolean().optional(),
    // Armures et boucliers
    valeurCA: z.number().int().optional(),
    categorie: z.enum(['legere', 'moyenne', 'lourde']).optional(),
    reductionDegats: z.number().int().nonnegative().optional(),
    malusDEX: z.number().int().nonnegative().optional(),
    categorieBouclier: z.enum(['petit', 'moyen', 'tour']).optional(),
    bonusDEF: z.number().int().optional(),
    // Accessoires et bonus
    slot: z.enum(SLOTS_ACCESSOIRE).nullable().optional(),
    bonusCarac: z.partialRecord(schemaCarac, z.number().int()).optional(),
    bonusSauvegardes: z.record(z.string(), z.number()).optional(),
    bonusSauvegardesVs: z.record(z.string(), z.number()).optional(),
    bonusCompetences: z.record(z.string(), z.number()).optional(),
    bonusInitiative: z.number().int().optional(),
    bonusAttaqueMagique: z.number().int().optional(),
    bonusAttaqueDistance: z.number().int().optional(),
    bonusDegatsMagiques: z.number().int().optional(),
    bonusDegatsMainsNues: z.number().int().optional(),
    bonusPvMaxDe: schemaFormuleDes.optional(),
    bonusInstrument: z.number().int().nonnegative().optional(),
    corruptionCombatRetiree: z.number().int().optional(),
    grimoireClasses: z.array(schemaId).optional(),
    // Matériaux
    materiau: schemaId.optional(),
    materiauNom: z.string().optional(),
    effetMateriau: z.string().optional(),
    bonusDegatsCreature: schemaFormuleDes.optional(),
    reductionDegatsCreature: z.number().int().optional(),
    // Consommables, récolte, cuisine, tannerie
    formuleDot: schemaFormuleDes.optional(),
    dureeEtat: z.number().int().positive().optional(),
    sortAppris: schemaId.optional(),
    recetteApprise: schemaId.optional(),
    recolte: z.enum(['alchimie', 'traque']).optional(),
    milieux: z.array(z.string()).optional(),
    vivre: z.boolean().optional(),
    familleVivre: z.string().optional(),
    peau: z.string().optional(),
    surfaceCuir: z.number().int().nonnegative().optional(),
    // Mécanisations propres à un objet (lot L3 / moteur d'effets) :
    formules: z.array(z.unknown()).optional(),
    declencheurs: z.array(z.unknown()).optional(),
    effetRepos: z.unknown().optional(),
  })
  .strict();
export type Objet = z.infer<typeof schemaObjet>;

export const schemaCatalogueObjets = z
  .object({
    version: z.string(),
    /** Types dont les exemplaires s'empilent dans l'inventaire (quantité). */
    typesEmpilables: z.array(z.enum(TYPES_OBJET)),
    objets: z.array(schemaObjet),
  })
  .strict();

export const schemaEquipementDepart = z.record(
  schemaId,
  z
    .object({
      arme: schemaId.nullable(),
      armure: schemaId.nullable(),
      bouclier: schemaId.nullable(),
      accessoire: schemaId.nullable().optional(),
      consommables: z.array(schemaId),
    })
    .strict(),
);
export type EquipementDepart = z.infer<typeof schemaEquipementDepart>;
