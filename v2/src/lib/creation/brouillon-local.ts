import { z } from 'zod';
import { brouillonVide, type Brouillon } from '../regles/creation.ts';
import { CARACS } from '../schemas/commun.ts';

/*
 * Brouillon de création gardé dans le navigateur (lot L2.2b) : un
 * rafraîchissement ou un onglet fermé ne fait pas perdre une création en
 * cours. Une clé par table et par joueur.
 *
 * Bug v1 corrigé (décision 1a) : le brouillon n'était jamais remis à zéro,
 * « + Nouveau personnage » rouvrait le précédent et l'écrasait. Ici, il est
 * effacé dès que le personnage est créé (AssistantCreation).
 *
 * Le stockage du navigateur peut être absent ou refuser (navigation
 * privée…) : chaque accès est protégé, et l'assistant marche sans.
 */

const schemaBrouillon: z.ZodType<Brouillon> = z.strictObject({
  nom: z.string(),
  genre: z.enum(['homme', 'femme']),
  classe: z.string().nullable(),
  race: z.string().nullable(),
  raceVariante: z.string().nullable(),
  niveau: z.number().int().min(1).max(20),
  caracsLibres: z.partialRecord(z.enum(CARACS), z.number().int()),
  capacites: z.array(z.strictObject({ id: z.string(), choix: z.string().optional(), offert: z.literal(true).optional() })),
  capacitesRaceChoix: z.record(z.string(), z.string()),
  voiesHorsProfil: z.array(z.strictObject({ voie: z.string(), cout: z.number() })),
  jetsPV: z.array(z.number().int()),
  dons: z.array(z.string()),
  donsChoix: z.record(z.string(), z.unknown()),
  sorts: z.array(z.string()),
  cercleSpecialisation: z.string().nullable(),
  equipementManuel: z.record(z.string(), z.looseObject({}).nullable()),
});

const cle = (table: string, uid: string) => `cof2:creation:${table}:${uid}`;

/** Le brouillon gardé, ou un brouillon vide (rien de gardé, illisible, ou d'une forme ancienne). */
export function lireBrouillon(table: string, uid: string): Brouillon {
  try {
    const brut = localStorage.getItem(cle(table, uid));
    if (!brut) return brouillonVide();
    const lu = schemaBrouillon.safeParse(JSON.parse(brut));
    return lu.success ? lu.data : brouillonVide();
  } catch {
    return brouillonVide();
  }
}

export function garderBrouillon(table: string, uid: string, b: Brouillon): void {
  try {
    localStorage.setItem(cle(table, uid), JSON.stringify(b));
  } catch {
    // Stockage indisponible : la création continue, seulement sans reprise.
  }
}

export function oublierBrouillon(table: string, uid: string): void {
  try {
    localStorage.removeItem(cle(table, uid));
  } catch {
    // idem
  }
}
