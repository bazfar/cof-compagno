import { choixRequis } from '../effets/profil.ts';
import { LIMITE_NOTES, progressionVierge, schemaFicheV1, VERSION_FICHE, type Fiche, type FicheV1, type FicheV2, type ObjetFiche } from '../schemas/fiche.ts';
import { actionParId, classeParId as classeRefonteParId, voieParId as voieRefonteParId } from '../../regles/index.ts';
import { ficheV1VersCalcul } from './conversion-v1.ts';
import { bonusCompetencesVecu } from '../fiche/vecu.ts';
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
type FicheBrute = Record<string, any>;

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

/**
 * Portrait et illustration : pas dans la fiche. Le portrait a son propre
 * document (décision 6a, L2.3) ; l'illustration grand format n'est pas
 * reprise (décision 3a du 16/10 : portrait seul). Les deux restent dans le
 * document importsV1 de la fiche déposée.
 */
const CHAMPS_V1_IMAGES = ['portrait', 'illustration'] as const;

/** Champs v1 repris par un champ de la fiche 2.0. */
const CHAMPS_V1_REPRIS = [
  'nom', 'genre', 'niveau', 'classe', 'race', 'raceVariante',
  'caracs', 'capacites', 'capacitesRace', 'capacitesRaceChoix', 'voiesHorsProfil', 'dons', 'donsChoix', 'bonusCompetences',
  'pvMax', 'pvActuel', 'pvHistorique', 'ppActuel',
  'equipement', 'piecesOr', 'piecesArgent', 'piecesBronze',
  'mutations', 'corruptionMajeure', 'contratDemoniaquePenalite', 'amesStockees',
  'grimoireSortsConnus', 'grimoireSortsPrepares', 'cercleSpecialisation', 'notes',
  ...Object.keys(POINTS_CERCLE_V1),
] as const;

/** Ce que la 2.0 ne lit pas encore d'une fiche v1, gardé tel quel (décision 5a). */
export function modulesV1(v1: FicheBrute): Record<string, unknown> {
  const connus = new Set<string>([...CHAMPS_V1_REPRIS, ...CHAMPS_V1_ABANDONNES, ...CHAMPS_V1_REMPLACES, ...CHAMPS_V1_IMAGES]);
  return Object.fromEntries(Object.entries(v1).filter(([k, v]) => !connus.has(k) && v !== undefined));
}

/** Points de Cercle du Prêtre, des quatre champs v1 au dictionnaire 2.0. */
export function pointsCercleV1(v1: FicheBrute): Record<string, number> {
  return Object.fromEntries(
    Object.entries(POINTS_CERCLE_V1).filter(([v1Cle]) => typeof v1[v1Cle] === 'number').map(([v1Cle, cle]) => [cle, v1[v1Cle] as number]),
  );
}

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
export function ficheDepuisV1(v1: FicheBrute, proprietaireUid: string, creeLe: number): { fiche: FicheV1; portrait: string | null } {
  const calc = ficheV1VersCalcul(v1);
  const modules = modulesV1(v1);
  const pointsCercle = pointsCercleV1(v1);

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
    ...(typeof v1.notes === 'string' && v1.notes ? { notes: v1.notes.slice(0, LIMITE_NOTES) } : {}),
    // Rien à reprendre : la v1 n'a ni crans ni Vécu.
    ...progressionVierge(),
    modules,
  };
  const portrait = typeof v1.portrait === 'string' && v1.portrait ? v1.portrait : null;
  return { fiche: schemaFicheV1.parse(versFirestore(brute, v1.nom ?? 'fiche')), portrait };
}

/**
 * Document de la 2.0 → fiche de calcul (L1.3). Une fiche de la refonte
 * (version 2, lot L4.11a) n'a plus de voies v1 : les calculs v1 n'y voient
 * aucune capacité, aucun sort ni Cercle ; la Plongée tient lieu de
 * corruption de combat, la Corruption d'Âme de corruption majeure.
 *
 * Spécimen d'élite (décision 14a du 21/10/2026, lot L4.12) : la
 * caractéristique choisie gagne son bonus dans les calculs (modificateur,
 * attaque, PV…), sans changer la valeur stockée. Les passifs de DEF et
 * d'initiative s'ajoutent à l'affichage (lib/fiche/vue-fiche.ts).
 */
export function ficheCalculDepuisFiche(f: Fiche): FicheCalcul {
  const v1 = f.schemaVersion === 1 ? f : null;
  return {
    niveau: f.niveau,
    classe: f.classe,
    race: f.race,
    raceVariante: f.raceVariante ?? null,
    caracs: f.schemaVersion === 1 ? f.caracs : caracsDeLaRefonte(f),
    capacites: v1?.capacites ?? [],
    capacitesRace: f.capacitesRace,
    capacitesRaceChoix: f.capacitesRaceChoix,
    voiesHorsProfil: v1?.voiesHorsProfil ?? [],
    dons: f.dons,
    donsChoix: f.donsChoix,
    // Vécu (lot L4.18, décision 6a) : les bonus de compétence des nœuds s'ajoutent à ceux de la fiche.
    bonusCompetences: avecLeVecu(f.bonusCompetences, bonusCompetencesVecu(f.vecu)),
    pvMax: f.pvMax,
    pvActuel: f.pvActuel,
    pvHistorique: f.pvHistorique,
    equipement: f.equipement,
    inventaireListe: Object.values(f.inventaire),
    etatsActifs: f.etatsActifs as FicheCalcul['etatsActifs'],
    mutations: (f.mutations ?? undefined) as FicheCalcul['mutations'],
    corruptionCombat: f.schemaVersion === 1 ? f.corruptionCombat : f.refonte.jauges.plongee,
    corruptionMajeure: f.schemaVersion === 1 ? f.corruptionMajeure : f.refonte.jauges.corruptionAme,
    contratDemoniaquePenalite: (f.contratDemoniaquePenalite ?? null) as FicheCalcul['contratDemoniaquePenalite'],
    amesStockees: f.amesStockees,
    piecesOr: f.piecesOr,
    piecesArgent: f.piecesArgent,
    piecesBronze: f.piecesBronze,
    grimoireSortsConnus: v1?.grimoireSortsConnus ?? [],
    grimoireSortsPrepares: v1?.grimoireSortsPrepares ?? [],
    cercleSpecialisation: v1?.cercleSpecialisation ?? null,
  };
}

function avecLeVecu(fiche: Record<string, number>, vecu: Record<string, number>): Record<string, number> {
  const b = { ...fiche };
  for (const [k, v] of Object.entries(vecu)) b[k] = (b[k] ?? 0) + v;
  return b;
}

/** Caractéristiques d'une fiche de la refonte, Spécimen d'élite compris (14a) : seulement si une voie prise le donne. */
export function caracsDeLaRefonte(f: FicheV2): FicheV2['caracs'] {
  const r = f.refonte;
  const classe = classeRefonteParId.get(r.classe);
  if (!classe || !r.caracEnPlus) return f.caracs;
  const choix = { niveau: f.niveau, modMagie: 0, rangs: r.rangs, mineurs: r.mineurs };
  const regle = choixRequis(classe, choix, { voies: voieRefonteParId, actions: actionParId }).caracEnPlus;
  if (!regle || !regle.parmi.includes(r.caracEnPlus)) return f.caracs;
  return { ...f.caracs, [r.caracEnPlus]: (f.caracs[r.caracEnPlus] ?? 10) + regle.valeur };
}
