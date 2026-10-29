import { z } from 'zod';
import { distanceCases } from '../battlemap/geometrie.ts';
import type { Combattant } from '../schemas/combat.ts';
import { monstrePourCombat, SANS_RESISTANCE } from './demarrage.ts';

/*
 * Les démons en combat (lot L6.6b, décisions de Thomas du 29/10/2026), en
 * fonctions pures. Le client du MJ les écrit (lib/actions/demons.ts,
 * attaques.ts, monstres.ts) ; ce qui change du démon se tient dans ses
 * `usages` : `faim`, `faimR` (le dernier round compté), `berserk` (ses
 * touches), `sursaut` (le tour de son Dernier souffle).
 *   - 1a : la jauge de faim se compte d'office : PP réellement drainés, PV
 *     nets infligés, états de contrôle nouveaux, rounds complets debout ;
 *     le MJ la voit et la corrige ;
 *   - 2a, 3a : au seuil, le MJ monte le démon (une forme, ou l'une des
 *     deux) ; il prend le nouveau modèle et garde les dégâts subis ; la
 *     faim repart à 0, le berserk se garde ;
 *   - 4a : la Morsure d'ancrage draine les PP qu'il y a ; le reste, en PV ;
 *   - 5a : Repousse, au début de son tour, s'il est debout ;
 *   - 6a : Berserk : chaque touche ajoute son bonus aux dégâts ; un raté
 *     lui coûte le bonus en PV et le remet à 0 ;
 *   - 7a : Puits et Vol de sève le soignent d'office ;
 *   - 8a : Air vicié, Reflet et Dernier souffle se jouent ; les autres
 *     passifs sont des rappels pour le MJ.
 */

type AvecId<T> = T & { id: string };

export const USAGE_FAIM = 'faim';
export const USAGE_FAIM_ROUND = 'faimR';
export const USAGE_BERSERK = 'berserk';
export const USAGE_SURSAUT = 'sursaut';
/** L6.7b (8a) : le Remous a franchi un palier (2 et plus) : le démon peut monter, une fois. */
export const USAGE_MONTEE_REMOUS = 'monteeRemous';

const schemaFaim = z.object({ type: z.enum(['pp_draines', 'degats_infliges', 'etats_controle', 'rounds_survecus']), seuil: z.number().int().min(1).max(999) });
const schemaPassifs = z.object({
  dernierSouffle: z.number().int().min(1).max(99).optional(),
  bouclierDeChair: z.literal(true).optional(),
  liensRompus: z.string().min(1).max(20).optional(),
  suite: z.number().positive().optional(),
  reflet: z.number().int().min(1).max(99).optional(),
  contagion: z.literal(true).optional(),
  airVicie: z.object({ rayon: z.number().positive(), formule: z.string().min(1).max(20) }).optional(),
  soinsReduitsSurMaudite: z.number().positive().optional(),
});

/** Ce que le bestiaire dit d'un démon, lu. */
export interface TraitsDemon {
  faim: z.infer<typeof schemaFaim> | null;
  /** Ses paliers suivants : un, ou deux au choix du MJ. */
  paliersSuivants: string[];
  /** Le bonus de dégâts par touche ; 0 : pas de berserk. */
  berserk: number;
  repousse: number;
  /** Vol de sève : la part des dégâts infligés qu'il regagne. */
  soinSurDegats: number;
  /** Puits : PV regagnés par PP drainé. */
  soinParPPDraine: number;
  passifs: z.infer<typeof schemaPassifs>;
}

export function traitsDemon(m: { faim?: unknown; paliersSuivants?: unknown; berserk?: unknown; repousse?: number | undefined; soinSurDegats?: number | undefined; soinParPPDraine?: number | undefined; passifs?: unknown }): TraitsDemon {
  const faim = schemaFaim.safeParse(m.faim);
  const paliers = z.array(z.string().min(1)).max(5).safeParse(m.paliersSuivants);
  const berserk = z.object({ parTouche: z.number().int().min(1).max(10) }).safeParse(m.berserk);
  const passifs = schemaPassifs.safeParse(m.passifs ?? {});
  return {
    faim: faim.success ? faim.data : null,
    paliersSuivants: paliers.success ? paliers.data : [],
    berserk: berserk.success ? berserk.data.parTouche : 0,
    repousse: m.repousse ?? 0,
    soinSurDegats: m.soinSurDegats ?? 0,
    soinParPPDraine: m.soinParPPDraine ?? 0,
    passifs: passifs.success ? passifs.data : {},
  };
}

/** 11a : un démon du bestiaire (sa race), qui retourne à la Mer quand il tombe. */
export const estDemon = (m: { race?: readonly string[] | undefined } | undefined): boolean => !!m?.race?.includes('démon');

/** Un démon a-t-il de quoi se jouer ici ? */
export function aDesTraits(t: TraitsDemon): boolean {
  return !!(t.faim || t.berserk || t.repousse || t.soinSurDegats || t.soinParPPDraine || Object.keys(t.passifs).length);
}

// ---------------------------------------------------------------- 1a, 2a : la faim

export const faimDe = (c: Pick<Combattant, 'usages'>): number => c.usages[USAGE_FAIM] ?? 0;

/** Les `usages` avec `n` de faim en plus (bornée de 0 à 999). */
export function avecFaim(usages: Readonly<Record<string, number>>, n: number): Record<string, number> {
  return { ...usages, [USAGE_FAIM]: Math.max(0, Math.min(999, (usages[USAGE_FAIM] ?? 0) + n)) };
}

/** Les états de contrôle qui nourrissent la faim (Fascinée, Influencée, Charmée). */
export const ETATS_CONTROLE: readonly string[] = ['fascine', 'influence', 'charme'];

/** La faim que nourrit ce qui vient d'arriver, selon sa sorte ; 0 sinon. */
export function faimNourrie(t: TraitsDemon, quoi: { ppDraines?: number; degatsInfliges?: number; etatsControle?: number }): number {
  if (!t.faim) return 0;
  return t.faim.type === 'pp_draines' ? (quoi.ppDraines ?? 0) : t.faim.type === 'degats_infliges' ? (quoi.degatsInfliges ?? 0) : t.faim.type === 'etats_controle' ? (quoi.etatsControle ?? 0) : 0;
}

/** 2a : au seuil, il peut monter (s'il a un palier suivant) ; L6.7b (8a) : ou le Remous le lui offre. */
export function peutMonter(c: Pick<Combattant, 'usages'>, t: TraitsDemon): boolean {
  return t.paliersSuivants.length > 0 && ((!!t.faim && faimDe(c) >= t.faim.seuil) || !!c.usages[USAGE_MONTEE_REMOUS]);
}

/**
 * 1a : les rounds survécus : le round `round` commence ; le démon debout
 * compte le round fini, une fois (`faimR`). Rien au premier round.
 */
export function roundSurvecu(c: Pick<Combattant, 'usages' | 'aTerre' | 'mort'>, t: TraitsDemon, round: number): Record<string, number> | null {
  if (t.faim?.type !== 'rounds_survecus' || round < 2 || c.aTerre || c.mort || c.usages[USAGE_FAIM_ROUND] === round) return null;
  return { ...avecFaim(c.usages, 1), [USAGE_FAIM_ROUND]: Math.min(999, round) };
}

/**
 * 2a, 3a : le démon monte au palier `m` : il prend son modèle et garde les
 * dégâts subis (au moins 1 PV) ; la faim repart à 0, le berserk se garde ;
 * la montée que le Remous offrait est prise.
 * Rend les champs du combattant à écrire ; `null` : un champ à retirer.
 */
export function apresMontee(
  c: Pick<Combattant, 'pv' | 'pvMax' | 'usages'>,
  m: Parameters<typeof monstrePourCombat>[0] & { id: string; nom: string },
  reductions: ReadonlyMap<string, number>,
): Record<string, unknown> {
  const p = monstrePourCombat(m, reductions);
  const subis = Math.max(0, (c.pvMax ?? 0) - (c.pv ?? 0));
  const { [USAGE_FAIM]: _f, [USAGE_FAIM_ROUND]: _r, [USAGE_MONTEE_REMOUS]: _m, ...usages } = c.usages;
  return {
    monstre: m.id,
    nom: m.nom.slice(0, 40),
    modInit: p.init,
    pvMax: p.pv,
    pv: Math.max(1, p.pv - subis),
    def: p.def,
    armure: p.armure,
    resistances: { ...SANS_RESISTANCE, ...p.resistances },
    sauvegardes: p.sauvegardes,
    boss: p.boss,
    demonOuMortVivant: p.demonOuMortVivant,
    immunites: p.immunites ?? null,
    legendaire: p.legendaire ?? null,
    usages,
  };
}

// ---------------------------------------------------------------- 6a : berserk

export const touchesBerserk = (c: Pick<Combattant, 'usages'>): number => c.usages[USAGE_BERSERK] ?? 0;

/** Le bonus de dégâts que ses touches lui donnent. */
export const bonusBerserk = (c: Pick<Combattant, 'usages'>, t: TraitsDemon): number => touchesBerserk(c) * t.berserk;

// ---------------------------------------------------------------- 4a, 7a : drain et soins

/** 4a : la Morsure d'ancrage : les PP qu'il y a, le reste en PV. */
export function drainer(drain: number, ppActuels: number | null): { pp: number; pv: number } {
  const pp = Math.max(0, Math.min(drain, ppActuels ?? 0));
  return { pp, pv: drain - pp };
}

/** 7a : ce qu'il regagne : Puits (par PP drainé), Vol de sève (une part des dégâts nets, à l'inférieur). */
export function soinDuDemon(t: TraitsDemon, ppDraines: number, degats: number): number {
  return Math.floor(ppDraines * t.soinParPPDraine) + Math.floor(Math.max(0, degats) * t.soinSurDegats);
}

/** Des PV en plus, sans dépasser son maximum. */
export function soigne(c: Pick<Combattant, 'pv' | 'pvMax'>, n: number): number {
  return Math.min(c.pvMax ?? 0, (c.pv ?? 0) + Math.max(0, n));
}

// ---------------------------------------------------------------- 8a : les passifs

/** Air vicié : les démons debout dont l'air atteint celui qui commence son tour (rayon en mètres, 1,5 m par case). */
export function airsVicies(
  actif: AvecId<Combattant>,
  combattants: readonly AvecId<Combattant>[],
  traits: (c: AvecId<Combattant>) => TraitsDemon | null,
  jetons: readonly { id: string; cx: number; cy: number }[],
): { source: AvecId<Combattant>; formule: string }[] {
  const ici = jetons.find((j) => j.id === actif.id);
  if (!ici || actif.aTerre || actif.mort) return [];
  return combattants.flatMap((c) => {
    const air = c.id !== actif.id && c.genre === 'monstre' && !c.aTerre ? traits(c)?.passifs.airVicie : undefined;
    const j = air ? jetons.find((x) => x.id === c.id) : undefined;
    return air && j && distanceCases(ici, j) <= Math.floor(air.rayon / 1.5) ? [{ source: c, formule: air.formule }] : [];
  });
}

/** Dernier souffle : tombé, ses touches de berserk au seuil, pas encore servi : il se relève pour un dernier tour. */
export function sursautPossible(c: Pick<Combattant, 'usages' | 'aTerre' | 'mort'>, t: TraitsDemon): boolean {
  const n = t.passifs.dernierSouffle;
  return n !== undefined && c.aTerre && !c.mort && touchesBerserk(c) >= n && c.usages[USAGE_SURSAUT] === undefined;
}

/** Les passifs que le MJ applique lui-même. */
export function rappelsDemon(t: TraitsDemon): string[] {
  const p = t.passifs;
  return [
    ...(p.bouclierDeChair ? ['Bouclier de chair : les attaques contre lui ont le désavantage tant qu’une créature charmée lui est adjacente.'] : []),
    ...(p.suite ? [`Suite : une créature charmée à ${p.suite} m s’interpose et prend les attaques qui le visent.`] : []),
    ...(p.liensRompus ? [`Liens rompus : il regagne ${p.liensRompus} PV quand une créature qu’il a charmée frappe un de ses alliés.`] : []),
    ...(p.contagion ? ['Contagion : une créature Putréfiée qui tombe à 0 PV passe l’état à une créature adjacente.'] : []),
    ...(p.soinsReduitsSurMaudite ? [`Ce qui ne guérit pas : les soins reçus par une créature Putréfiée sont multipliés par ${p.soinsReduitsSurMaudite}.`] : []),
  ];
}
