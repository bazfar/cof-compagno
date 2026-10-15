import { z } from 'zod';

/*
 * Briques communes aux schémas de données (règles, bestiaire, objets).
 * Les schémas s'importent entre eux AVEC l'extension `.ts` : ils sont aussi
 * exécutés directement par Node (outils/importer-v1.ts), qui l'exige.
 */

/** Identifiant stable : minuscules, chiffres, tirets, points et soulignés. */
export const schemaId = z.string().regex(/^[a-z0-9_.-]+$/);

export const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;
export const schemaCarac = z.enum(CARACS);

/**
 * Formule de dés au sens de la v1 (lancerFormule) : une somme de termes
 * « ±NdM » ou « ±K », sans espaces. Ex. « 1d6 », « 2d6+3 », « 1d4-1 ».
 * Même grammaire que tools/valider_bestiaire.js.
 */
export const schemaFormuleDes = z
  .string()
  .refine((f) => {
    const termes = f.match(/[+-]?[^+-]+/g) ?? [];
    return termes.length > 0 && termes.every((t) => /^[+-]?(\d*d\d+|\d+)$/.test(t));
  }, 'formule de dés invalide (attendu : termes ±NdM ou ±K, ex. « 2d6+3 »)');
