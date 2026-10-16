import { progressionVierge, schemaFiche, VERSION_FICHE, type Fiche, type ObjetFiche } from '../schemas/fiche.ts';
import { ficheV1VersCalcul } from './conversion-v1.ts';
import type { FicheCalcul } from './fiche-calcul.ts';

/*
 * Passages entre la fiche v1, le document Firestore de la 2.0 (schemas/
 * fiche.ts) et la fiche de calcul (L1.3). Lot L2.1.
 *
 * v1 → document : sert à l'import des fiches de la table (L2.2, puis L7).
 * document → calcul : sert à afficher les statistiques (L2.3), avec les
 * calculs déjà vérifiés contre la v1.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
type FicheV1 = Record<string, any>;

/**
 * Champs v1 volontairement abandonnés à l'import (cadrage, « Migration et
 * bascule ») : état de combat ou valeur recalculée. La fiche importée repart
 * de zéro sur ces points (aucun état actif, pas de corruption de combat…).
 */
export const CHAMPS_V1_ABANDONNES = [
  'def', // DEF stockée : la CA se calcule
  'etatsActifs',
  'usagesCapacites',
  'corruptionCombat',
  'pvTemporaires',
  'pvTemporairesExpiration',
  'mortSucces',
  'mortEchecs',
  'etatMort',
  'grimoirePreparationDisponible', // drapeaux de repos
  'grimoireRattrapageFait',
] as const;

/** Champs v1 d'identité et de propriété : remplacés par le document 2.0 (id, proprietaireUid). */
const CHAMPS_V1_REMPLACES = ['id', 'proprietaire', 'proprietaireNom', 'inventaireListe'] as const;

/** Points de Cercle du Prêtre : quatre champs v1, un dictionnaire en 2.0. */
const POINTS_CERCLE_V1: Record<string, string> = {
  pointsBannissement: 'bannissement',
  pointsBenediction: 'benediction',
  pointsConviction: 'conviction',
  pointsJugement: 'jugement',
};

/** Portrait et illustration : un document à part (décision 6a, L2.3), pas dans la fiche. */
const CHAMPS_V1_IMAGES = ['portrait', 'illustration'] as const;

/** Champs v1 repris par un champ de la fiche 2.0. */
const CHAMPS_V1_REPRIS = [
  'nom', 'genre', 'niveau', 'classe', 'race', 'raceVariante',
  'caracs', 'capacites', 'capacitesRace', 'capacitesRaceChoix', 'voiesHorsProfil', 'dons', 'donsChoix', 'bonusCompetences',
  'pvMax', 'pvActuel', 'pvHistorique', 'ppActuel',
  'equipement', 'piecesOr', 'piecesArgent', 'piecesBronze',
  'mutations', 'corruptionMajeure', 'contratDemoniaquePenalite', 'amesStockees',
  'grimoireSortsConnus', 'grimoireSortsPrepares', 'cercleSpecialisation',
  ...Object.keys(POINTS_CERCLE_V1),
] as const;

/**
 * Clés de l'inventaire : l'identifiant du catalogue, suffixé « ~2 », « ~3 »…
 * pour les doublons (deux potions de soin distinctes). Stables pour un même
 * ordre d'inventaire.
 */
export function inventaireEnDictionnaire(liste: readonly ObjetFiche[]): Record<string, ObjetFiche> {
  const dico: Record<string, ObjetFiche> = {};
  for (const objet of liste) {
    const base = (typeof objet.id === 'string' && objet.id) || 'objet';
    let cle = base;
    for (let n = 2; cle in dico; n++) cle = `${base}~${n}`;
    dico[cle] = objet;
  }
  return dico;
}

/**
 * Firestore refuse les tableaux de tableaux et les valeurs `undefined`.
 * Rend une copie JSON propre, ou lève en nommant le chemin fautif.
 */
export function versFirestore<T>(valeur: T, chemin = 'fiche'): T {
  const copie = JSON.parse(JSON.stringify(valeur)) as T;
  const verifier = (v: unknown, ou: string, dansTableau: boolean): void => {
    if (Array.isArray(v)) {
      if (dansTableau) throw new Error(`${ou} : tableau dans un tableau, refusé par Firestore.`);
      v.forEach((x, i) => verifier(x, `${ou}[${i}]`, true));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) verifier(x, `${ou}.${k}`, false);
    }
  };
  verifier(copie, chemin, false);
  return copie;
}

/**
 * Fiche v1 → document de la 2.0. Les voies passent du nom à l'identifiant
 * (conversion-v1, qui lève si une voie est introuvable) ; tout champ v1 non
 * repris et non abandonné va dans `modules`.
 */
export function ficheDepuisV1(v1: FicheV1, proprietaireUid: string, creeLe: number): { fiche: Fiche; portrait: string | null } {
  const calc = ficheV1VersCalcul(v1);
  const connus = new Set<string>([...CHAMPS_V1_REPRIS, ...CHAMPS_V1_ABANDONNES, ...CHAMPS_V1_REMPLACES, ...CHAMPS_V1_IMAGES]);
  const modules = Object.fromEntries(Object.entries(v1).filter(([k, v]) => !connus.has(k) && v !== undefined));
  const pointsCercle = Object.fromEntries(
    Object.entries(POINTS_CERCLE_V1).filter(([v1Cle]) => typeof v1[v1Cle] === 'number').map(([v1Cle, cle]) => [cle, v1[v1Cle] as number]),
  );

  const brute = {
    schemaVersion: VERSION_FICHE,
    proprietaireUid,
    creeLe,
    nom: v1.nom,
    genre: v1.genre ?? null,
    niveau: v1.niveau ?? 1,
    classe: calc.classe ?? null,
    race: calc.race ?? null,
    raceVariante: calc.raceVariante ?? null,
    caracs: calc.caracs ?? {},
    capacites: calc.capacites ?? [],
    capacitesRace: calc.capacitesRace ?? [],
    capacitesRaceChoix: calc.capacitesRaceChoix ?? {},
    voiesHorsProfil: calc.voiesHorsProfil ?? [],
    dons: calc.dons ?? [],
    donsChoix: calc.donsChoix ?? {},
    bonusCompetences: calc.bonusCompetences ?? {},
    pvMax: v1.pvMax ?? 0,
    pvActuel: v1.pvActuel ?? null,
    pvHistorique: v1.pvHistorique ?? [],
    ...(typeof v1.ppActuel === 'number' ? { ppActuel: v1.ppActuel } : {}),
    ...(Object.keys(pointsCercle).length ? { pointsCercle } : {}),
    // Équipement après la migration « botte » → « jambe » de la v1 (conversion-v1).
    equipement: calc.equipement ?? {},
    inventaire: inventaireEnDictionnaire((calc.inventaireListe ?? []) as ObjetFiche[]),
    piecesOr: v1.piecesOr ?? 0,
    piecesArgent: v1.piecesArgent ?? 0,
    piecesBronze: v1.piecesBronze ?? 0,
    etatsActifs: [],
    mutations: v1.mutations ?? null,
    corruptionCombat: 0,
    corruptionMajeure: v1.corruptionMajeure ?? 0,
    contratDemoniaquePenalite: v1.contratDemoniaquePenalite ?? null,
    amesStockees: v1.amesStockees ?? 0,
    grimoireSortsConnus: v1.grimoireSortsConnus ?? [],
    grimoireSortsPrepares: v1.grimoireSortsPrepares ?? [],
    cercleSpecialisation: v1.cercleSpecialisation ?? null,
    // Rien à reprendre : la v1 n'a ni crans ni Vécu.
    ...progressionVierge(),
    modules,
  };
  const portrait = typeof v1.portrait === 'string' && v1.portrait ? v1.portrait : null;
  return { fiche: schemaFiche.parse(versFirestore(brute, v1.nom ?? 'fiche')), portrait };
}

/** Document de la 2.0 → fiche de calcul (L1.3). */
export function ficheCalculDepuisFiche(f: Fiche): FicheCalcul {
  return {
    niveau: f.niveau,
    classe: f.classe,
    race: f.race,
    raceVariante: f.raceVariante ?? null,
    caracs: f.caracs,
    capacites: f.capacites,
    capacitesRace: f.capacitesRace,
    capacitesRaceChoix: f.capacitesRaceChoix,
    voiesHorsProfil: f.voiesHorsProfil,
    dons: f.dons,
    donsChoix: f.donsChoix,
    bonusCompetences: f.bonusCompetences,
    pvMax: f.pvMax,
    pvActuel: f.pvActuel,
    pvHistorique: f.pvHistorique,
    equipement: f.equipement,
    inventaireListe: Object.values(f.inventaire),
    etatsActifs: f.etatsActifs as FicheCalcul['etatsActifs'],
    mutations: (f.mutations ?? undefined) as FicheCalcul['mutations'],
    corruptionCombat: f.corruptionCombat,
    corruptionMajeure: f.corruptionMajeure,
    contratDemoniaquePenalite: (f.contratDemoniaquePenalite ?? null) as FicheCalcul['contratDemoniaquePenalite'],
    amesStockees: f.amesStockees,
    piecesOr: f.piecesOr,
    piecesArgent: f.piecesArgent,
    piecesBronze: f.piecesBronze,
    grimoireSortsConnus: f.grimoireSortsConnus,
    grimoireSortsPrepares: f.grimoireSortsPrepares,
    cercleSpecialisation: f.cercleSpecialisation,
  };
}
