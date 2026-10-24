import { traceBresenham } from '../battlemap/ciblage.ts';
import type { Case, JetonCarte, Segment } from '../battlemap/geometrie.ts';
import type { ZoneSol } from '../schemas/zones.ts';
import { actionParId } from '../../regles/index.ts';

/*
 * Les zones au sol en calcul pur (lot L6.4b1, décisions de Thomas du
 * 24/10/2026) : où elles sont, ce qu'elles font au sol, qui les déclenche.
 *   - 1a, 2a : une case infranchissable arrête un PJ (le MJ place ses
 *     monstres où il veut, comme en v1) ; entrer dans une case difficile
 *     coûte 2 cases ;
 *   - 5a : cases du MJ, zones de sort et pièges, un seul modèle ;
 *   - 7a : à l'entrée et en fin de déplacement, le client de celui qui
 *     bouge ; en début de tour, celui du MJ ;
 *   - 8a : une aura suit le jeton de son lanceur ; elle bouge avec lui et
 *     ne le prend pas ;
 *   - 9a : la durée se décompte à la fin du tour du lanceur ;
 *   - 11a : bloquant = un mur temporaire (passage et vue), couverture +2 en
 *     DEF à distance, sanctuaire : ceux de dedans ne se ciblent pas depuis
 *     dehors ;
 *   - 16a : une couleur par sorte de zone.
 */

export type ZoneActive = ZoneSol & { id: string };

const cle = (c: Case) => `${c.cx},${c.cy}`;

/** Les cases d'une zone sur la carte : autour de son ancre, ou du jeton de son lanceur (8a) ; aucune s'il n'est plus là. */
export function casesDe(z: Pick<ZoneSol, 'cases' | 'ancre' | 'lanceur'>, jetons: readonly JetonCarte[]): Case[] {
  const a = z.ancre ?? jetons.find((j) => j.id === z.lanceur) ?? null;
  return a ? z.cases.map((c) => ({ cx: a.cx + c.dx, cy: a.cy + c.dy })) : [];
}

/** Une zone contient-elle cette case ? */
export function contient(z: ZoneActive, jetons: readonly JetonCarte[], c: Case): boolean {
  return casesDe(z, jetons).some((x) => x.cx === c.cx && x.cy === c.cy);
}

/** Les quatre bords d'une case : un terrain bloquant est un mur tout autour (11a). */
function bords(c: Case): Segment[] {
  const { cx: x, cy: y } = c;
  return [
    [[x, y], [x + 1, y]],
    [[x + 1, y], [x + 1, y + 1]],
    [[x, y + 1], [x + 1, y + 1]],
    [[x, y], [x, y + 1]],
  ];
}

/** Ce que les zones changent au sol de la scène (geometrie.sceneCalcul) : murs des terrains bloquants, cases infranchissables et difficiles. */
export function solDesZones(zones: readonly ZoneActive[], jetons: readonly JetonCarte[]): { murs: Segment[]; infranchissables: Set<string>; difficiles: Set<string> } {
  const murs: Segment[] = [];
  const infranchissables = new Set<string>();
  const difficiles = new Set<string>();
  for (const z of zones) {
    const cs = casesDe(z, jetons);
    if (z.nature === 'bloquant') for (const c of cs) murs.push(...bords(c));
    if (z.nature === 'infranchissable') for (const c of cs) infranchissables.add(cle(c));
    // Seuls les PJ comptent leurs cases : un terrain difficile « pour les ennemis » posé par un PJ ne les ralentit pas.
    if (z.nature === 'difficile' && concerne(z, 'pj')) for (const c of cs) difficiles.add(cle(c));
  }
  return { murs, infranchissables, difficiles };
}

/** Une aura (sans ancre) ne prend pas son lanceur : elle est autour de lui (8a). */
const sonAura = (z: Pick<ZoneSol, 'ancre' | 'lanceur'>, id: string) => z.ancre === null && z.lanceur === id;

/** Le filtre de la zone (zone d'un sort : ennemis ou alliés de son lanceur) ; le MJ touche tout le monde. */
export function concerne(z: Pick<ZoneSol, 'filtre' | 'camp'>, camp: 'pj' | 'monstre'): boolean {
  if (z.filtre === 'tous' || z.camp === null) return true;
  return z.filtre === 'ennemis' ? camp !== z.camp : camp === z.camp;
}

export interface Declenchement {
  zone: ZoneActive;
  quoi: 'entree' | 'finDeplacement';
}

/**
 * Ce qu'un déplacement déclenche (3a, 7a, 10a) : les zones où le jeton
 * entre (une case du trajet dedans, la case de départ dehors) et celles où
 * il finit son déplacement ; une fois par tour du combat et par créature.
 * Un piège ne prend que ceux qu'il vise (filtre).
 */
export function declenchements(
  zones: readonly ZoneActive[],
  jetons: readonly JetonCarte[],
  bouge: { id: string; camp: 'pj' | 'monstre'; de: Case; vers: Case },
  tour: number,
): Declenchement[] {
  const chemin = traceBresenham(bouge.de.cx, bouge.de.cy, bouge.vers.cx, bouge.vers.cy).map((c) => ({ cx: c.x, cy: c.y }));
  const r: Declenchement[] = [];
  for (const z of zones) {
    if (!z.quand || !concerne(z, bouge.camp) || sonAura(z, bouge.id)) continue;
    if (tour > 0 && z.declenchements[bouge.id] === tour) continue;
    const dedans = new Set(casesDe(z, jetons).map(cle));
    if (z.quand === 'entree' && !dedans.has(cle(bouge.de)) && chemin.some((c) => dedans.has(cle(c)))) r.push({ zone: z, quoi: 'entree' });
    if (z.quand === 'finDeplacement' && dedans.has(cle(bouge.vers))) r.push({ zone: z, quoi: 'finDeplacement' });
  }
  return r;
}

/** Terrains qui brûlent ou crépitent (11a) : à l'entrée, et au début du tour de qui s'y tient. */
export const TERRAINS_QUI_BLESSENT: readonly string[] = ['enflamme', 'electrifie'];

/** Les zones qui agissent au début du tour d'un combattant sur sa case (7a, 11a). */
export function debutDeTourZones(zones: readonly ZoneActive[], jetons: readonly JetonCarte[], id: string, camp: 'pj' | 'monstre', tour: number): ZoneActive[] {
  const j = jetons.find((x) => x.id === id);
  if (!j) return [];
  return zones.filter(
    (z) => (z.quand === 'debutTour' || TERRAINS_QUI_BLESSENT.includes(z.nature ?? '')) && concerne(z, camp) && !sonAura(z, id) && z.declenchements[id] !== tour && contient(z, jetons, j),
  );
}

/** Fin du tour du lanceur (9a) : un round de moins à ses zones ; à 0, elles s'en vont. */
export function finDeTourZones(zones: readonly Pick<ZoneActive, 'id' | 'lanceur' | 'rounds'>[], idLanceur: string): { maj: { id: string; rounds: number }[]; retirer: string[] } {
  const maj: { id: string; rounds: number }[] = [];
  const retirer: string[] = [];
  for (const z of zones) {
    if (z.lanceur !== idLanceur || z.rounds === null) continue;
    if (z.rounds > 1) maj.push({ id: z.id, rounds: z.rounds - 1 });
    else retirer.push(z.id);
  }
  return { maj, retirer };
}

/** Sanctuaire (11a) : la cible est dans un sanctuaire où l'attaquant n'est pas. */
export function protegeParSanctuaire(zones: readonly ZoneActive[], jetons: readonly JetonCarte[], idAttaquant: string, idCible: string): boolean {
  const a = jetons.find((j) => j.id === idAttaquant);
  const c = jetons.find((j) => j.id === idCible);
  if (!a || !c) return false;
  return zones.some((z) => z.nature === 'sanctuaire' && contient(z, jetons, c) && !contient(z, jetons, a));
}

/** Couverture (11a) : +2 en DEF contre une attaque à distance. */
export const DEF_COUVERTURE = 2;
export function couverture(zones: readonly ZoneActive[], jetons: readonly JetonCarte[], idCible: string): number {
  const c = jetons.find((j) => j.id === idCible);
  return c && zones.some((z) => z.nature === 'couverture' && contient(z, jetons, c)) ? DEF_COUVERTURE : 0;
}

export type CouleurZone = 'degats' | 'benefique' | 'controle' | 'infranchissable' | 'speciale';

/** 16a : rouge pour ce qui blesse, or pour ce qui aide, violet pour ce qui gêne ; à part, l'infranchissable et la case spéciale. */
export function couleurDe(z: Pick<ZoneSol, 'nature' | 'sort' | 'danger' | 'filtre'>): CouleurZone {
  if (z.nature === 'infranchissable' || z.nature === 'bloquant') return 'infranchissable';
  if (z.nature === 'speciale') return 'speciale';
  if (z.danger || z.nature === 'enflamme' || z.nature === 'electrifie') return 'degats';
  if (z.nature === 'sanctuaire' || z.nature === 'sanctifie' || z.nature === 'couverture' || z.filtre === 'allies') return 'benefique';
  const a = z.sort ? actionParId.get(z.sort.action) : undefined;
  if (a?.effets.some((e) => e.type === 'degats')) return 'degats';
  return 'controle';
}

/** « Givre (2) » : le nom et les rounds qui restent (16a). */
export function texteZone(z: Pick<ZoneSol, 'nom' | 'rounds'>): string {
  return `${z.nom}${z.rounds !== null ? ` (${z.rounds})` : ''}`;
}

/** Les cases en décalage autour d'une ancre (pour poser une zone de sort). */
export function enDecalage(cases: readonly Case[], ancre: Case): { dx: number; dy: number }[] {
  return cases.map((c) => ({ dx: c.cx - ancre.cx, dy: c.cy - ancre.cy }));
}
