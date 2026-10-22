import reputationJson from '../../donnees/reputation.json';
import { CRAN_MAX_PAR_LA_PAROLE, CRANS_ATTITUDE, DEPART_PAR_PALIER, MOD_DD_ATTITUDE, NOMS_CRANS, type CranAttitude } from '../../regles/attitude';
import type { Pnj } from '../schemas/pnj';
import { SCORE_MIN, type FactionReputation, type PalierReputation, type ReputationGroupe, type ReputationV1 } from '../schemas/reputation';

/*
 * Règles de l'attitude des PNJ et de la réputation (lot S1, décisions de
 * Thomas du 22/10/2026). Pures : lib/actions/pnj.ts les applique dans des
 * transactions, les écrans les affichent.
 */

export { CRANS_ATTITUDE, MOD_DD_ATTITUDE, NOMS_CRANS, type CranAttitude };

export class RefusAttitude extends Error {}

// La validation de reputation.json est faite à l'import et par les tests (comme les autres données).
const REPUTATION = reputationJson as ReputationV1;
export const FACTIONS_REPUTATION: readonly FactionReputation[] = REPUTATION.factions;
export const factionParId: ReadonlyMap<string, FactionReputation> = new Map(FACTIONS_REPUTATION.map((f) => [f.id, f]));

// ---------------------------------------------------------------- Réputation

/** Score du groupe auprès d'une faction : 0 tant que le MJ n'y a pas touché. */
export function scoreDe(rep: ReputationGroupe | null, faction: string): number {
  return rep?.scores[faction] ?? 0;
}

export function palierDe(score: number): PalierReputation {
  const p = REPUTATION.echelle.find((x) => score >= x.min && score <= x.max);
  if (!p) throw new RefusAttitude(`Score de réputation hors échelle : ${score}.`);
  return p;
}

/** Nouveau score après un ajustement du MJ, borné à −10 et au plafond de la faction (v1). */
export function ajusterScore(rep: ReputationGroupe | null, faction: string, delta: number): number {
  const f = factionParId.get(faction);
  if (!f) throw new RefusAttitude(`Faction inconnue : ${faction}.`);
  return Math.max(SCORE_MIN, Math.min(f.plafond, scoreDe(rep, faction) + delta));
}

/** L'effet du palier sur les prix, en clair (12a : affiché ; la boutique l'appliquera). */
export function effetPrix(p: PalierReputation): string {
  if (p.modPrix === null) return 'Commerce refusé';
  if (p.modPrix === 0) return 'Prix normaux';
  const pct = Math.round(p.modPrix * 100);
  return `Prix ${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

// ---------------------------------------------------------------- Attitude

const rang = (c: CranAttitude) => CRANS_ATTITUDE.indexOf(c);

/**
 * Cran de départ à la première rencontre : selon la réputation du groupe
 * auprès de la faction du PNJ (16a) ; Neutre pour un PNJ sans faction de
 * réputation (4a).
 */
export function cranDeDepart(faction: string | null, rep: ReputationGroupe | null): CranAttitude {
  if (!faction || !factionParId.has(faction)) return 'neutre';
  return DEPART_PAR_PALIER[palierDe(scoreDe(rep, faction)).id] ?? 'neutre';
}

/** Le PNJ rencontré pour la première fois : visible des joueurs, avec son cran de départ. */
export function rencontrer(p: Pnj, rep: ReputationGroupe | null, maintenant: number): Pnj {
  if (p.rencontre) throw new RefusAttitude(`${p.nom} est déjà rencontré.`);
  return { ...p, rencontre: true, cran: cranDeDepart(p.faction, rep), tendance: null, majLe: maintenant };
}

/** Service rendu (17a) : un cran de mieux, quel que soit le cran ; le seul chemin de Favorable à Allié. */
export function rendreService(p: Pnj, maintenant: number): Pnj {
  if (!p.rencontre || !p.cran) throw new RefusAttitude(`${p.nom} n’est pas encore rencontré.`);
  if (p.cran === 'allie') throw new RefusAttitude(`${p.nom} est déjà Allié.`);
  return { ...p, cran: CRANS_ATTITUDE[rang(p.cran) + 1]!, tendance: 'hausse', majLe: maintenant };
}

/**
 * Correction du MJ (un cran de plus ou de moins), en attendant les scènes
 * jouées (S2). Comme la parole, elle ne fait pas passer Allié (13c) : il
 * faut un service rendu.
 */
export function corrigerCran(p: Pnj, delta: 1 | -1, maintenant: number): Pnj {
  if (!p.rencontre || !p.cran) throw new RefusAttitude(`${p.nom} n’est pas encore rencontré.`);
  const r = rang(p.cran) + delta;
  if (r < 0) throw new RefusAttitude(`${p.nom} est déjà Hostile.`);
  if (delta > 0 && r > rang(CRAN_MAX_PAR_LA_PAROLE)) throw new RefusAttitude('Seul un service rendu fait passer Allié.');
  return { ...p, cran: CRANS_ATTITUDE[r]!, tendance: delta > 0 ? 'hausse' : 'baisse', majLe: maintenant };
}

/** Un mensonge réussi en scène est découvert (S2, 9a) : deux crans de moins (table 8a). */
export function decouvrirMensonge(p: Pnj, maintenant: number): Pnj {
  if (!p.rencontre || !p.cran) throw new RefusAttitude(`${p.nom} n’est pas encore rencontré.`);
  if (p.mensonges < 1) throw new RefusAttitude(`Aucun mensonge à découvrir auprès de ${p.nom}.`);
  return { ...p, cran: CRANS_ATTITUDE[Math.max(0, rang(p.cran) - 2)]!, tendance: 'baisse', mensonges: p.mensonges - 1, majLe: maintenant };
}

/** Ce que les joueurs voient d'un PNJ rencontré (14b, 18a). */
export interface RepereAttitude {
  cran: string;
  fleche: '↑' | '↓' | null;
  conseil: string | null;
}

export function repere(p: Pnj): RepereAttitude | null {
  if (!p.rencontre || !p.cran) return null;
  return {
    cran: NOMS_CRANS[p.cran],
    fleche: p.tendance === 'hausse' ? '↑' : p.tendance === 'baisse' ? '↓' : null,
    conseil: p.cran === 'favorable' ? 'Un service rendu pourrait en faire un allié.' : null,
  };
}

// ---------------------------------------------------------------- PNJ du lore

/** « Le Comptoir », « Comptoir » → « comptoir » : nom sans article ni accent. */
function nomSimple(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(les|le|la)\s+|^l'/, '')
    .trim();
}

/** Faction de la réputation que nomme le lore v1 (« Comptoir » → comptoir), ou null. */
export function factionDuLore(nom: string | undefined): string | null {
  if (!nom) return null;
  const n = nomSimple(nom);
  return FACTIONS_REPUTATION.find((f) => nomSimple(f.nom) === n)?.id ?? null;
}

/** Ce qu'il faut d'une fiche de lore MJ pour en tirer un PNJ. */
export interface FicheLorePourPnj {
  id: string;
  titre: string;
  categorie: string;
  etiquettes: readonly string[];
  source?: string | undefined;
}

/**
 * Les PNJ à créer depuis le lore importé de la v1 (3a) : les fiches de la
 * catégorie Personnages venues de PNJ_CLES, sauf celles qui ont déjà leur
 * PNJ. La faction est la première étiquette de la fiche (lib/lore/import-v1).
 */
export function pnjDepuisLore(fiches: readonly FicheLorePourPnj[], existants: ReadonlySet<string>, maintenant: number): { id: string; pnj: Pnj }[] {
  return fiches
    .filter((f) => f.source?.startsWith('v1:pnj:') && !existants.has(f.id))
    .map((f) => ({
      id: f.id,
      pnj: { nom: f.titre.slice(0, 80), faction: factionDuLore(f.etiquettes[0]), lore: f.id, rencontre: false, cran: null, tendance: null, mensonges: 0, peuple: false, secrets: [], creeLe: maintenant, majLe: maintenant },
    }));
}

/** Identifiant d'un PNJ créé à la main : son nom, sans accent ni espace, et un suffixe. */
export function nouvelIdPnj(nom: string): string {
  const base = nomSimple(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pnj';
  return `${base}-${Date.now().toString(36)}`;
}
