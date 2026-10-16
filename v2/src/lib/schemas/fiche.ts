import { z } from 'zod';
import { schemaNom } from './acces.ts';
import { CARACS } from './commun.ts';

/*
 * La fiche d'un personnage (lot L2.1) : tables/{table}/persos/{id}.
 *
 * UN SEUL schéma pour l'écriture, la lecture, l'import et les tests. C'est
 * la réponse au bug v1 de `versJSON`, qui oubliait des champs (Grimoire,
 * puis XP de métiers et PP) et les effaçait à chaque sauvegarde : ici, un
 * champ absent du schéma est refusé par Zod côté app ET par les règles
 * Firestore (hasOnly), et le test d'aller-retour sur les fiches réelles
 * vérifie qu'aucun champ ne se perd.
 *
 * Les noms de champs sont ceux de la fiche de calcul (L1.3,
 * regles/fiche-calcul.ts), donc ceux de la v1 : la fiche se calcule sans
 * traduction. Le schéma est STRICT : un champ inconnu fait échouer la
 * validation au lieu d'être ignoré en silence. Deux différences avec la v1 :
 *   - `inventaire` est un DICTIONNAIRE {clé: objet} et non un tableau
 *     (cadrage) : un objet ajouté ou retiré ne réécrit que sa clé ;
 *   - `modules` garde tel quel ce que la 2.0 ne lit pas encore (métiers,
 *     livres, Remous… ; décision 5a du 16/10) : rien n'est perdu à l'import,
 *     chaque module le reprendra en migrant ;
 *   - `progression`, `vecu` et `usages` sont réservés, vides, pour les
 *     rencontres et le Vécu (cadrage, décidé le 16/10) : aucune migration
 *     de fiche ne sera nécessaire quand ils arriveront en 2.1.
 *
 * Le portrait n'est pas ici : il aura son propre document (décision 6a, L2.3).
 */

export const VERSION_FICHE = 1;

/** Objet porté ou transporté : celui du catalogue, enrichi à l'obtention (rareté, affixes…). */
export const schemaObjetFiche = z.looseObject({
  id: z.string().optional(),
  nom: z.string().optional(),
});

const entier = z.number().int();
const schemaEtatActif = z.looseObject({ idEtat: z.string() });

export const schemaFiche = z.strictObject({
  schemaVersion: z.literal(VERSION_FICHE),
  /** uid du joueur à qui appartient le personnage (un joueur peut en avoir plusieurs, décision 2a). */
  proprietaireUid: z.string().min(1),
  creeLe: entier.nonnegative(),

  // ---- Identité ----
  nom: schemaNom,
  genre: z.string().nullable().optional(),
  niveau: entier.min(1).max(20),
  classe: z.string().nullable(),
  race: z.string().nullable(),
  raceVariante: z.string().nullable().optional(),

  // ---- Règles (mêmes champs que regles/fiche-calcul.ts) ----
  caracs: z.partialRecord(z.enum(CARACS), entier),
  capacites: z.array(z.object({ id: z.string(), choix: z.string().optional() })),
  capacitesRace: z.array(entier),
  capacitesRaceChoix: z.record(z.string(), z.string()),
  voiesHorsProfil: z.array(z.object({ voie: z.string(), cout: z.number().optional() })),
  dons: z.array(z.string()),
  donsChoix: z.record(z.string(), z.unknown()),
  bonusCompetences: z.record(z.string(), z.number()),

  // ---- Points de vie et ressources ----
  pvMax: entier.nonnegative(),
  pvActuel: entier.nullable(),
  pvHistorique: z.array(z.looseObject({})),
  ppActuel: entier.nullable().optional(),
  /** Points de Cercle du Prêtre (v1 : pointsBannissement, pointsBenediction…). */
  pointsCercle: z.record(z.string(), entier).optional(),

  // ---- Équipement et possessions ----
  equipement: z.record(z.string(), schemaObjetFiche.nullable()),
  inventaire: z.record(z.string(), schemaObjetFiche),
  piecesOr: entier.nonnegative(),
  piecesArgent: entier.nonnegative(),
  piecesBronze: entier.nonnegative(),

  // ---- État et corruption ----
  etatsActifs: z.array(schemaEtatActif),
  mutations: z.array(z.looseObject({ palier: z.number(), d6: z.number() })).nullable(),
  corruptionCombat: entier,
  corruptionMajeure: entier,
  contratDemoniaquePenalite: z.looseObject({}).nullable().optional(),
  amesStockees: entier.nonnegative(),

  // ---- Magie ----
  grimoireSortsConnus: z.array(z.string()),
  grimoireSortsPrepares: z.array(z.string()),
  cercleSpecialisation: z.string().nullable(),

  // ---- Progression et Vécu (cadrage « Rencontres, PNJ et Vécu », décidé le 16/10) ----
  // Réservés dès L2.1, vides. Chaque cran sera un document persos/{id}/jalons/{id}
  // en ajout seul, écrit par le MJ (L2.5) ; ces champs en tiennent le compte.
  /** Crans vers le niveau suivant (MJ seul). */
  progression: z.strictObject({ crans: entier.nonnegative() }),
  /** Arbre de Vécu : crans et paliers (MJ), points et nœuds choisis (joueur). */
  vecu: z.strictObject({
    crans: entier.nonnegative(),
    paliers: entier.nonnegative(),
    points: entier.nonnegative(),
    noeuds: z.array(z.string()),
    noeudOffert: z.string().nullable(),
  }),
  /** Dernière utilisation de chaque nœud limité (rencontre, séance ou repos), par identifiant de nœud. */
  usages: z.record(z.string(), z.looseObject({})),

  // ---- Modules pas encore migrés (décision 5a) ----
  modules: z.record(z.string(), z.unknown()),
});

export type Fiche = z.infer<typeof schemaFiche>;

/** Valeurs vides des champs réservés : toute nouvelle fiche part de là. */
export function progressionVierge(): Pick<Fiche, 'progression' | 'vecu' | 'usages'> {
  return { progression: { crans: 0 }, vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null }, usages: {} };
}
export type ObjetFiche = z.infer<typeof schemaObjetFiche>;
