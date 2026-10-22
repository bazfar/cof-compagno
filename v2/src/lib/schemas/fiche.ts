import { z } from 'zod';
import { schemaNom } from './acces.ts';
import { CARACS, schemaId } from './commun.ts';
import { schemaElement, schemaMaitrise } from './effets.ts';

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
 * Le portrait n'est pas ici : il a son propre document,
 * persos/{id}/images/portrait (décision 6a, L2.3 ; schemas/portrait.ts).
 *
 * Version 2, la refonte (lot L4.11a, décisions de Thomas du 21/10/2026) :
 * chaque joueur refait ses voies au même niveau, valeurs conservées (4a).
 * Une fiche non convertie reste en version 1, lisible telle quelle ; la
 * conversion REMPLACE les champs propres à la v1 (capacités, voies hors
 * profil, grimoire, Cercle et points de Cercle, corruptions) par le bloc
 * `refonte` (1b), et le MJ accorde à part ce qui ne se choisit pas
 * (`octrois` : Voie du chaos, éléments découverts, verbes appris par
 * grimoire, conversion rouverte). Les voies hors profil disparaissent,
 * leurs points sont rendus (3a). Les deux versions vivent sous un même
 * schéma, discriminé par `schemaVersion`.
 */

export const VERSION_FICHE = 1;
export const VERSION_FICHE_REFONTE = 2;

/** Notes libres : au plus 10 000 caractères (marge large sous le 1 Mo d'un document). */
export const LIMITE_NOTES = 10_000;

/** Objet porté ou transporté : celui du catalogue, enrichi à l'obtention (rareté, affixes…). */
export const schemaObjetFiche = z.looseObject({
  id: z.string().optional(),
  nom: z.string().optional(),
});

const entier = z.number().int();
const schemaEtatActif = z.looseObject({ idEtat: z.string() });

/** Champs communs aux deux versions de la fiche. */
/** Arbre de Vécu : crans et paliers (MJ), points et nœuds choisis (joueur) ; lot L4.18 : `crans` compte ceux du palier en cours. */
export const schemaVecu = z.strictObject({
  crans: entier.nonnegative(),
  paliers: entier.nonnegative(),
  points: entier.nonnegative(),
  noeuds: z.array(z.string()),
  noeudOffert: z.string().nullable(),
});

const champsCommuns = {
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
  capacitesRace: z.array(entier),
  capacitesRaceChoix: z.record(z.string(), z.string()),
  dons: z.array(z.string()),
  donsChoix: z.record(z.string(), z.unknown()),
  bonusCompetences: z.record(z.string(), z.number()),

  // ---- Points de vie et ressources ----
  pvMax: entier.nonnegative(),
  pvActuel: entier.nullable(),
  pvHistorique: z.array(z.looseObject({})),
  ppActuel: entier.nullable().optional(),

  // ---- Équipement et possessions ----
  equipement: z.record(z.string(), schemaObjetFiche.nullable()),
  inventaire: z.record(z.string(), schemaObjetFiche),
  piecesOr: entier.nonnegative(),
  piecesArgent: entier.nonnegative(),
  piecesBronze: entier.nonnegative(),

  // ---- État et corruption ----
  etatsActifs: z.array(schemaEtatActif),
  mutations: z.array(z.looseObject({ palier: z.number(), d6: z.number() })).nullable(),
  contratDemoniaquePenalite: z.looseObject({}).nullable().optional(),
  amesStockees: entier.nonnegative(),

  // ---- Progression et Vécu (cadrage « Rencontres, PNJ et Vécu », décidé le 16/10) ----
  // Réservés dès L2.1, vides. Chaque cran sera un document persos/{id}/jalons/{id}
  // en ajout seul, écrit par le MJ (L2.5) ; ces champs en tiennent le compte.
  /** Crans vers le niveau suivant (MJ seul). */
  progression: z.strictObject({ crans: entier.nonnegative() }),
  /** Arbre de Vécu : crans et paliers (MJ), points et nœuds choisis (joueur). */
  vecu: schemaVecu,
  /** Dernière utilisation de chaque nœud limité (rencontre, séance ou repos), par identifiant de nœud. */
  usages: z.record(z.string(), z.looseObject({})),

  // ---- Notes libres du joueur (L2.3, décision 5a du 16/10 : v1 « notes ») ----
  notes: z.string().max(LIMITE_NOTES).optional(),

  // ---- Modules pas encore migrés (décision 5a) ----
  modules: z.record(z.string(), z.unknown()),
};

/** Fiche v1 : les voies, le grimoire et les jauges de la v1. */
export const schemaFicheV1 = z.strictObject({
  schemaVersion: z.literal(VERSION_FICHE),
  ...champsCommuns,
  /** `offert` : rang gratuit (Polyvalence de l'Humain, décision du 16/10), hors budget de points. */
  capacites: z.array(z.object({ id: z.string(), choix: z.string().optional(), offert: z.literal(true).optional() })),
  voiesHorsProfil: z.array(z.object({ voie: z.string(), cout: z.number().optional() })),
  /** Points de Cercle du Prêtre (v1 : pointsBannissement, pointsBenediction…). */
  pointsCercle: z.record(z.string(), entier).optional(),
  corruptionCombat: entier,
  corruptionMajeure: entier,
  grimoireSortsConnus: z.array(z.string()),
  grimoireSortsPrepares: z.array(z.string()),
  cercleSpecialisation: z.string().nullable(),
});

/**
 * Les choix de la refonte (lot L4.11a) : ce que lit le profil
 * (lib/effets/profil.ts, ChoixDePersonnage), et les jauges.
 *   - `classe` : la classe de la refonte (Envoûteur pour l'Enchanteur v1) ;
 *     le champ `classe` de la fiche garde l'identifiant v1, que lisent les
 *     calculs de la fiche (dé de vie, PP, attaque) ;
 *   - `rangOffert` : le rang gratuit de la Polyvalence (Humain), dans une
 *     voie de la classe ; son coût ne compte pas ;
 *   - `variantes` : choix fixés à l'acquisition d'un passif (Esprit
 *     fissuré : `garde`), par identifiant d'action ;
 *   - `jauges` : Endurance, Inspiration et Sacré actuels (null : la classe
 *     n'en a pas), Plongée du combat, Corruption d'Âme. Pleines à la
 *     conversion ; la Corruption d'Âme reprend la corruption majeure v1, la
 *     Plongée part de 0 (décision 9a).
 */
/**
 * Ressources de classe tenues en jauge (lot L4.13) : Endurance et
 * Inspiration depuis L4.11a ; Honneur (Chevalier), puis Instinct, Force de
 * la nature et Ki, absents des fiches d'avant (optionnels, pour ne pas
 * invalider une fiche déjà convertie).
 */
export const JAUGES_DE_CLASSE = ['endurance', 'honneur', 'instinct', 'inspiration', 'forceNature', 'ki'] as const;
export type JaugeDeClasse = (typeof JAUGES_DE_CLASSE)[number];

export const schemaRefonteFiche = z.strictObject({
  classe: schemaId,
  rangs: z.record(schemaId, entier.min(0).max(5)),
  rangOffert: z.strictObject({ voie: schemaId, rang: entier.min(1).max(5) }).nullable(),
  ecole: schemaId.nullable(),
  elementDepart: schemaElement.nullable(),
  secondElement: schemaElement.nullable(),
  elementMaitre: schemaElement.nullable(),
  mineurs: z.array(schemaId),
  mineurPalierII: schemaId.nullable(),
  caracEnPlus: z.enum(CARACS).nullable(),
  variantes: z.record(schemaId, schemaId),
  jauges: z.strictObject({
    endurance: entier.nonnegative().nullable(),
    inspiration: entier.nonnegative().nullable(),
    honneur: entier.nonnegative().nullable().optional(),
    instinct: entier.nonnegative().nullable().optional(),
    forceNature: entier.nonnegative().nullable().optional(),
    ki: entier.nonnegative().nullable().optional(),
    /** Âmes du Nécromancien (lot L4.17) : 0 à 3, 5 avec la Moisson ; absentes des autres classes. */
    ames: entier.nonnegative().optional(),
    sacre: entier.nonnegative().nullable(),
    plongee: entier.nonnegative(),
    corruptionAme: entier.nonnegative(),
  }),
});

/**
 * Ce que le MJ accorde (décisions 5a, 6a, 7a, 12a) ; le joueur ne l'écrit
 * pas (règles Firestore) :
 *   - `chaos` : la Voie du chaos est ouverte à ce personnage ;
 *   - `elements` : éléments découverts en jeu, avec leur maîtrise ;
 *   - `verbes` : verbes d'une autre école appris par grimoire (palier I) ;
 *   - `reconversion` : le joueur peut refaire ses voies une fois de plus.
 */
export const schemaOctrois = z.strictObject({
  chaos: z.boolean(),
  elements: z.partialRecord(schemaElement, schemaMaitrise),
  verbes: z.array(z.strictObject({ id: schemaId, maitrise: z.enum(['nonMaitrise', 'initie']) })),
  reconversion: z.boolean(),
  /**
   * Nœuds du Vécu que les capacités v1 hors combat appellent (lot L4.18,
   * décision 5a) : notés à la conversion, le MJ les accorde un à un (un
   * palier et le nœud). Absent des fiches converties avant.
   */
  vecuV1: z.array(schemaId).max(20).optional(),
});

/** Fiche v2 : la refonte, sans les champs propres à la v1. */
export const schemaFicheV2 = z.strictObject({
  schemaVersion: z.literal(VERSION_FICHE_REFONTE),
  ...champsCommuns,
  refonte: schemaRefonteFiche,
  octrois: schemaOctrois,
});

export const schemaFiche = z.discriminatedUnion('schemaVersion', [schemaFicheV1, schemaFicheV2]);

export type Fiche = z.infer<typeof schemaFiche>;
export type FicheV1 = z.infer<typeof schemaFicheV1>;
export type FicheV2 = z.infer<typeof schemaFicheV2>;
export type RefonteFiche = z.infer<typeof schemaRefonteFiche>;
export type Octrois = z.infer<typeof schemaOctrois>;

/** Rien d'accordé : la Voie du chaos fermée, aucun élément ni verbe en plus. */
export function octroisVierges(): Octrois {
  return { chaos: false, elements: {}, verbes: [], reconversion: false };
}

/** Valeurs vides des champs réservés : toute nouvelle fiche part de là. */
export function progressionVierge(): Pick<Fiche, 'progression' | 'vecu' | 'usages'> {
  return { progression: { crans: 0 }, vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null }, usages: {} };
}
export type ObjetFiche = z.infer<typeof schemaObjetFiche>;
