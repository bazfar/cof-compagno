import type { CARACS } from '../schemas/commun.ts';

/*
 * Ce que les calculs de règles lisent sur une fiche (lot L1.3).
 *
 * C'est la fiche v1 (js/personnage.js) avec une seule différence de fond :
 * les capacités et les voies hors profil désignent les voies par
 * IDENTIFIANT (`guerrier.elite.2`), plus par leur nom. La conversion depuis
 * une fiche v1 est dans conversion-v1.ts.
 *
 * Presque tout est optionnel, comme en v1 : les calculs appliquent les mêmes
 * valeurs par défaut que le constructeur de Personnage.
 */

export type Carac = (typeof CARACS)[number];

export const SLOTS_EQUIPEMENT = [
  'tete', 'torse', 'jambe', 'avant_bras', 'main_droite', 'main_gauche', 'collier', 'bague', 'mains',
] as const;
export type Slot = (typeof SLOTS_EQUIPEMENT)[number];

/**
 * Objet tel qu'il est PORTÉ sur une fiche. Ce n'est pas l'objet du catalogue :
 * à l'obtention, la rareté et les affixes lui ajoutent des champs
 * (bonusRarete, bonusDefSansArmure…). D'où la signature ouverte.
 */
export interface ObjetPorte {
  id?: string;
  nom?: string;
  type?: string;
  categorie?: string;
  categorieArme?: string;
  categoriePortee?: string;
  portee?: string;
  maitrise?: string;
  deuxMains?: boolean;
  valeurCA?: number;
  malusDEX?: number;
  bonusRarete?: number;
  grimoireClasses?: string[];
  bonusCarac?: Partial<Record<string, number>>;
  bonusCompetences?: Record<string, number>;
  bonusSauvegardes?: Record<string, number>;
  bonusSauvegardesVs?: Record<string, number>;
  formules?: { cible?: string; expr?: string; carac?: string; competence?: string }[];
  [champ: string]: unknown;
}

export interface BonusEtat {
  cible?: string;
  valeur?: unknown;
  vs?: string;
}

export interface EtatActif {
  idEtat: string;
  dureeRestante?: unknown;
  source?: string;
  carac?: string;
  bonus?: BonusEtat;
}

export interface CapaciteChoisie {
  /** Identifiant de capacité : `<voie>.<rang>`, ex. `guerrier.elite.1`. */
  id: string;
  /** Option retenue à l'acquisition (carac de Spécimen d'élite, « def » ou « reduction » en Voie du chaos…). */
  choix?: string;
}

export interface MutationAcquise {
  palier: number;
  d6: number;
  nom?: string;
}

export interface FicheCalcul {
  id?: string | null;
  niveau?: number;
  classe?: string | null;
  race?: string | null;
  raceVariante?: string | null;
  caracs?: Partial<Record<Carac, number>>;
  capacites?: CapaciteChoisie[];
  capacitesRace?: number[];
  capacitesRaceChoix?: Record<string, string>;
  voiesHorsProfil?: { voie: string; cout?: number }[];
  dons?: string[];
  donsChoix?: Record<string, unknown>;
  bonusCompetences?: Record<string, number>;
  pvMax?: number;
  pvActuel?: number | null;
  pvHistorique?: { total?: number }[];
  equipement?: Partial<Record<string, ObjetPorte | null>>;
  inventaireListe?: ObjetPorte[];
  etatsActifs?: EtatActif[];
  mutations?: MutationAcquise[];
  corruptionCombat?: number;
  corruptionMajeure?: number;
  contratDemoniaquePenalite?: { carac?: string; valeur?: unknown } | null;
  amesStockees?: number;
  piecesOr?: number;
  piecesArgent?: number;
  piecesBronze?: number;
  grimoireSortsConnus?: string[];
  grimoireSortsPrepares?: string[];
  cercleSpecialisation?: string | null;
}

/**
 * Ce que la v1 allait lire hors de la fiche (SyncStore, carte de combat).
 * Absent = hors combat et sans veillée musicale : ces bonus valent 0, comme
 * en v1 quand la carte n'est pas chargée.
 */
export interface ContexteCalcul {
  /** Veillée musicale en cours (v1 : SyncStore « musique:veillee »). */
  musique?: { portee: string[]; cible: string; valeur: number } | null;
  combat?: {
    /** Le personnage ne s'est pas déplacé ce tour (Voie de la traque rang 2). */
    immobile?: boolean;
    /** Nombre de monstres adjacents (don Combattant en duel). */
    monstresAdjacents?: number;
    /** Nombre d'autres PJ adjacents (Phalange, Voie du soldat rang 2). */
    alliesAdjacents?: number;
    /** Un PJ adjacent porte-t-il cet objet ? (armures de groupe) */
    allieAdjacentPorte?: (idObjet: string) => boolean;
  };
}
