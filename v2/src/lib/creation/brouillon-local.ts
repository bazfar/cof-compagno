import { z } from 'zod';
import type { Brouillon } from '../regles/creation.ts';
import { CARACS } from '../schemas/commun.ts';

/*
 * Brouillon de création gardé dans le navigateur (lot L2.2b) : un
 * rafraîchissement ou un onglet fermé ne fait pas perdre une création en
 * cours. Une clé par table et par joueur, et une par fiche v1 en reprise
 * (L2.2c) : reprendre une fiche n'écrase pas une création en cours.
 *
 * Bug v1 corrigé (décision 1a) : le brouillon n'était jamais remis à zéro,
 * « + Nouveau personnage » rouvrait le précédent et l'écrasait. Ici, il est
 * effacé dès que le personnage est créé (AssistantCreation).
 *
 * Le stockage du navigateur peut être absent ou refuser (navigation
 * privée…) : chaque accès est protégé, et l'assistant marche sans.
 */

const objet = z.looseObject({});
const schemaReprise = z.strictObject({
  idImport: z.string(),
  anciens: z.strictObject({
    capacites: z.array(z.strictObject({ voie: z.string(), rang: z.number(), choix: z.string().optional() })),
    capacitesRace: z.array(z.number()),
    capacitesRaceChoix: z.record(z.string(), z.string()),
    voiesHorsProfil: z.array(z.strictObject({ classe: z.string(), voie: z.string(), cout: z.number().optional() })),
    dons: z.array(z.string()),
    donsChoix: z.record(z.string(), z.unknown()),
    bonusCompetences: z.record(z.string(), z.number()),
  }),
  report: z.strictObject({
    jetsRepris: z.number().int(),
    pvActuel: z.number().nullable(),
    ppActuel: z.number().nullable(),
    pointsCercle: z.record(z.string(), z.number()),
    equipement: z.record(z.string(), objet.nullable()),
    inventaire: z.array(objet),
    piecesOr: z.number(),
    piecesArgent: z.number(),
    piecesBronze: z.number(),
    corruptionMajeure: z.number(),
    mutations: z.array(z.looseObject({ palier: z.number(), d6: z.number() })).nullable(),
    contratDemoniaquePenalite: objet.nullable(),
    amesStockees: z.number(),
    sortsConnus: z.array(z.string()),
    sortsPrepares: z.array(z.string()),
    modules: z.record(z.string(), z.unknown()),
    notes: z.string(),
    portrait: z.string().nullable(),
  }),
});

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
  equipementManuel: z.record(z.string(), objet.nullable()),
  reprise: schemaReprise.nullable(),
});

const cle = (table: string, uid: string, idImport?: string) => `cof2:creation:${table}:${uid}${idImport ? `:${idImport}` : ''}`;

/** Le brouillon gardé, ou null (rien de gardé, illisible, ou d'une forme ancienne). */
export function lireBrouillon(table: string, uid: string, idImport?: string): Brouillon | null {
  try {
    const brut = localStorage.getItem(cle(table, uid, idImport));
    if (!brut) return null;
    const lu = schemaBrouillon.safeParse(JSON.parse(brut));
    return lu.success ? lu.data : null;
  } catch {
    return null;
  }
}

/** Où garder ce brouillon : la reprise d'une fiche v1 a sa propre place. */
export function garderBrouillon(table: string, uid: string, b: Brouillon): void {
  try {
    localStorage.setItem(cle(table, uid, b.reprise?.idImport), JSON.stringify(b));
  } catch {
    // Stockage indisponible : la création continue, seulement sans reprise.
  }
}

export function oublierBrouillon(table: string, uid: string, idImport?: string): void {
  try {
    localStorage.removeItem(cle(table, uid, idImport));
  } catch {
    // idem
  }
}
