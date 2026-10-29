import { z } from 'zod';
import { effetsAttaquesMonstres, ETATS_BESTIAIRE, etatParId } from '../../regles/index.ts';
import type { Changement, JetNote } from '../effets/resolution.ts';
import type { Combattant } from '../schemas/combat.ts';
import type { Fiche } from '../schemas/fiche.ts';
import type { EffetAttaqueMonstre } from '../schemas/monstres.ts';
import type { Sauvegarde } from '../schemas/effets.ts';
import { distanceCases, type Case } from '../battlemap/geometrie.ts';
import { lancerDegats } from './attaque.ts';
import { immunise } from './etats.ts';
import { legendairesRestantes, USAGE_LEGENDAIRE } from './legendaire.ts';
import { cibleDe } from './sorts.ts';

/*
 * Les monstres avancés (lot L6.6a, décisions de Thomas du 28/10/2026), en
 * fonctions pures. lib/actions/monstres.ts les écrit.
 *   - 2a, 3a : les capacités actives du bestiaire se jouent du panneau du
 *     MJ, sur les cibles qu'il coche ; leur limite (1× ou 2× par combat,
 *     1× par tour, recharge) se compte dans les `usages` du monstre ; l'app
 *     applique dégâts, soin, bonus et état, avec le jet d'attaque ou la
 *     sauvegarde des données ; le « spécial » va au MJ ;
 *   - 4a : une sauvegarde du bestiaire en caractéristique v1 : FOR, DEX et
 *     CON gardent leur nom ; SAG, INT et CHA sont la Volonté ;
 *   - 5a : une recharge de N rounds : servie au round R, elle revient au
 *     round R + N ;
 *   - 6b : les effets des attaques, traduits en données (src/regles/monstres.ts) ;
 *   - 7a : un boss a ses résistances légendaires (v1 : le champ du
 *     bestiaire, sinon max(1, dangerosité − 2)) ; une sauvegarde ratée
 *     contre un sort est réussie tant qu'il en reste ;
 *   - 8a : un état dont le monstre est immunisé ne se pose pas ;
 *   - 9a : Curée : quand un monstre tombe, ceux de sa famille qui ont la
 *     capacité gagnent ses bonus ;
 *   - 10a : une capacité « réaction » se joue comme les autres, et prend la
 *     réaction du round.
 */

type AvecId<T> = T & { id: string };

export { legendairesRestantes, USAGE_LEGENDAIRE };

// ---------------------------------------------------------------- 7a, 8a

/** Les immunités du bestiaire en états de la refonte (8a) ; un état sans équivalent n'en est pas une ici (rappel au MJ). */
export function immunitesDuMonstre(m: { immunites?: readonly string[] | undefined }): string[] {
  return [...new Set((m.immunites ?? []).map((id) => ETATS_BESTIAIRE[id] ?? id).filter((id) => etatParId.has(id)))].slice(0, 20);
}

/** Ce que le MJ applique lui-même : une immunité sans équivalent, une immunité sous condition. */
export function immunitesAuMj(m: { immunites?: readonly string[] | undefined; immunitesConditionnelles?: readonly { etats: readonly string[]; condition: string }[] | undefined }): string[] {
  const sans = (m.immunites ?? []).filter((id) => !etatParId.has(ETATS_BESTIAIRE[id] ?? id));
  return [...(sans.length ? [`immunisé : ${sans.join(', ')}`] : []), ...(m.immunitesConditionnelles ?? []).map((x) => `immunisé à ${x.etats.join(', ')} : ${x.condition}`)];
}

/** 7a : ses résistances légendaires du combat : 0 hors boss ; le champ du bestiaire ; sinon max(1, dangerosité − 2). */
export function legendaireDuMonstre(m: { boss: boolean; dangerosite: number; resistanceLegendaire?: unknown }): number {
  if (!m.boss) return 0;
  const n = typeof m.resistanceLegendaire === 'number' ? m.resistanceLegendaire : Math.max(1, m.dangerosite - 2);
  return Math.max(0, Math.min(10, Math.floor(n)));
}

export { immunise };

// ---------------------------------------------------------------- 6b : les attaques

/** L'effet traduit d'une attaque (6b), ou null. */
export function effetDeLAttaque(monstre: string | null, attaque: string): EffetAttaqueMonstre | null {
  return effetsAttaquesMonstres.get(`${monstre}|${attaque}`) ?? null;
}

/** Les limites d'une attaque ou d'une capacité, comptées dans les `usages` du monstre. */
export interface Limite {
  /** Utilisations par combat. */
  parCombat?: number | undefined;
  /** Utilisations par round. */
  parRound?: number | undefined;
  /** Revient après N rounds. */
  recharge?: number | undefined;
}

const cleNombre = (cle: string) => `n:${cle}`.slice(0, 60);
const cleRound = (cle: string) => `r:${cle}`.slice(0, 60);
const cleNombreRound = (cle: string) => `nr:${cle}`.slice(0, 60);

/** Pourquoi elle ne sert pas maintenant ; null : elle sert. */
export function refusDeLimite(c: Pick<Combattant, 'usages'>, cle: string, l: Limite, round: number): string | null {
  const n = c.usages[cleNombre(cle)] ?? 0;
  const r = c.usages[cleRound(cle)];
  if (l.parCombat !== undefined && n >= l.parCombat) return l.parCombat > 1 ? `déjà ${l.parCombat} fois ce combat` : 'déjà servie ce combat';
  if (l.parRound !== undefined && r === round && (c.usages[cleNombreRound(cle)] ?? 0) >= l.parRound) return 'déjà servie ce round';
  if (l.recharge !== undefined && r !== undefined && round < r + l.recharge) return `se recharge (round ${r + l.recharge})`;
  return null;
}

/** Les `usages` après un usage (round `round`). */
export function avecUsage(usages: Readonly<Record<string, number>>, cle: string, l: Limite, round: number): Record<string, number> {
  if (l.parCombat === undefined && l.parRound === undefined && l.recharge === undefined) return { ...usages };
  const memeRound = usages[cleRound(cle)] === round;
  return {
    ...usages,
    [cleNombre(cle)]: Math.min(999, (usages[cleNombre(cle)] ?? 0) + 1),
    [cleRound(cle)]: Math.max(1, Math.min(999, round)),
    ...(l.parRound !== undefined ? { [cleNombreRound(cle)]: memeRound ? Math.min(999, (usages[cleNombreRound(cle)] ?? 0) + 1) : 1 } : {}),
  };
}

/** L'effet d'une attaque en une ligne, pour le panneau du MJ (6b). */
export function texteEffetAttaque(e: EffetAttaqueMonstre | null, texte: string | null): string {
  if (!e) return texte ?? '';
  const nomEtat = (id: string) => etatParId.get(id)?.nom ?? id;
  const quoi = [
    ...(e.etats ?? []).map((x) => `${nomEtat(x.id)}${x.rounds ? ` ${x.rounds} round${x.rounds > 1 ? 's' : ''}` : ''}`),
    ...(e.malus ?? []).map((m) => `${m.valeur} ${m.sur}${m.rounds ? ` ${m.rounds} round${m.rounds > 1 ? 's' : ''}` : ''}`),
    ...(e.repousse ? [`repoussé de ${e.repousse} case${e.repousse > 1 ? 's' : ''}`] : []),
  ].join(', ');
  return [
    e.parCombat ? `${e.parCombat}×/combat` : '',
    e.unParRound ? '1×/round' : '',
    e.recharge ? `recharge ${e.recharge} round${e.recharge > 1 ? 's' : ''}` : '',
    e.jets ? `${e.jets} jets` : '',
    e.critique ? `critique sur ${e.critique}-20` : '',
    e.defIgnoree ? `ignore ${e.defIgnoree} de DEF` : '',
    quoi ? `${e.sauvegarde ? `${e.sauvegarde.type} ${e.sauvegarde.dd} ou ` : 'touché : '}${quoi}` : '',
    e.auMj ? `MJ : ${e.auMj}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** La limite d'une attaque (6b). */
export const limiteDeLAttaque = (e: EffetAttaqueMonstre | null): Limite => ({ parCombat: e?.parCombat, parRound: e?.unParRound ? 1 : undefined, recharge: e?.recharge });

// ---------------------------------------------------------------- 2a : les capacités

const schemaEffetCapacite = z.union([
  z.object({ type: z.literal('degats'), formule: z.string().min(1).max(20), elementaire: z.string().nullable().optional(), surReussite: z.literal('demi').optional() }),
  z.object({ type: z.literal('soin'), formule: z.string().min(1).max(20) }),
  z.object({ type: z.literal('etat'), id: z.string().min(1).max(60), duree: z.string().min(1).max(20), formuleDot: z.string().min(1).max(20).optional() }),
  z.object({ type: z.literal('bonus'), cible: z.string().min(1).max(40), valeur: z.number().int().min(-20).max(20), duree: z.string().min(1).max(20) }),
  z.object({ type: z.literal('special'), note: z.string().min(1).max(500) }),
]);
const schemaMecanique = z.object({
  type: z.enum(['limitee', 'activable']),
  usage: z.object({ frequence: z.string().min(1).max(20) }),
  recharge: z.number().int().min(1).max(10).optional(),
  cible: z.enum(['ennemi', 'allie', 'zone', 'soi', 'aucune']),
  // « adjacent » : une case ; « vue » : sans portée.
  portee: z.union([z.number(), z.literal('adjacent'), z.literal('vue')]).nullable(),
  zone: z.number().nullable(),
  jetAttaque: z.number().int().min(-10).max(30).optional(),
  jetSauvegardeFixe: z.object({ carac: z.string(), dd: z.number().int().min(5).max(30) }).optional(),
  reactionCout: z.number().optional(),
  actionBonus: z.boolean().optional(),
  effets: z.array(schemaEffetCapacite).max(10),
});

/** Une capacité active du bestiaire (2a), lue. */
export interface CapaciteMonstre {
  /** L6.7a (4a) : une aura (une zone « libre ») : elle se joue d'office au début de son tour, sans action. */
  aura: boolean;
  nom: string;
  description: string;
  limite: Limite;
  cible: 'ennemi' | 'allie' | 'zone' | 'soi' | 'aucune';
  /** En cases (le bestiaire dit des mètres, 1,5 m par case) ; null : sans portée. */
  portee: number | null;
  zone: number | null;
  jetAttaque: number | null;
  sauvegarde: { type: Sauvegarde; dd: number } | null;
  /** Ce qu'elle prend : l'action, l'action bonus (secondaire) ou la réaction du round (10a). */
  prend: 'principale' | 'secondaire' | 'reaction';
  effets: z.infer<typeof schemaEffetCapacite>[];
}

/** 4a : la sauvegarde de la refonte d'une caractéristique du bestiaire. */
export function sauvegardeDe(carac: string): Sauvegarde {
  return carac === 'FOR' || carac === 'DEX' || carac === 'CON' ? carac : 'Volonte';
}

/** La limite écrite dans le bestiaire (« 1x/combat », « 2x/tour », « 1x/recharge », « libre »). */
export function limiteDe(frequence: string, recharge: number | undefined): Limite {
  const m = /^(\d)x\/(combat|tour|recharge)$/.exec(frequence);
  if (!m) return {};
  const n = Number(m[1]);
  return m[2] === 'combat' ? { parCombat: n } : m[2] === 'tour' ? { parRound: n } : { recharge: recharge ?? 1 };
}

/** Les capacités actives du monstre que l'app sait lire ; les autres restent au texte (`illisibles`). */
export function capacitesDuMonstre(m: { capacitesActives?: readonly unknown[] | undefined }): { capacites: CapaciteMonstre[]; illisibles: { nom: string; description: string }[] } {
  const capacites: CapaciteMonstre[] = [];
  const illisibles: { nom: string; description: string }[] = [];
  for (const brut of m.capacitesActives ?? []) {
    const c = z.object({ nom: z.string(), description: z.string(), mecanique: schemaMecanique }).safeParse(brut);
    if (!c.success) {
      const t = brut as { nom?: unknown; description?: unknown };
      if (typeof t?.nom === 'string') illisibles.push({ nom: t.nom, description: typeof t.description === 'string' ? t.description : '' });
      continue;
    }
    const k = c.data.mecanique;
    capacites.push({
      aura: k.cible === 'zone' && k.usage.frequence === 'libre',
      nom: c.data.nom,
      description: c.data.description,
      limite: limiteDe(k.usage.frequence, k.recharge),
      cible: k.cible,
      portee: k.portee === null || k.portee === 'vue' ? null : k.portee === 'adjacent' ? 1 : Math.max(1, Math.round(k.portee / 1.5)),
      zone: k.zone,
      jetAttaque: k.jetAttaque ?? null,
      sauvegarde: k.jetSauvegardeFixe ? { type: sauvegardeDe(k.jetSauvegardeFixe.carac), dd: k.jetSauvegardeFixe.dd } : null,
      prend: k.reactionCout ? 'reaction' : k.actionBonus ? 'secondaire' : 'principale',
      effets: k.effets,
    });
  }
  return { capacites, illisibles };
}

/** Une durée du bestiaire (« 1 », « 2 », « prochainTour », « finCombat ») pour le moteur. */
export function dureeDuBestiaire(d: string): { rounds: number } | 'prochainTour' | 'finCombat' {
  if (/^\d+$/.test(d)) return { rounds: Math.max(1, Math.min(20, Number(d))) };
  return d === 'prochainTour' ? 'prochainTour' : 'finCombat';
}

/** Ce qu'une capacité donne : les jets, les changements, ce qui reste au MJ. */
export interface CapaciteJouee {
  jets: JetNote[];
  changements: Changement[];
  auMj: string[];
}

/**
 * 2a : la capacité sur ses cibles. Les dés des dégâts et du soin se
 * lancent une fois pour toutes les cibles ; chaque cible fait son jet
 * d'attaque ou sa sauvegarde. Raté (attaque) ou réussie (sauvegarde) :
 * rien, sauf des dégâts « moitié ».
 */
export function jouerCapacite(cap: CapaciteMonstre, cibles: readonly { c: AvecId<Combattant>; fiche: Fiche | null }[], alea: () => number): CapaciteJouee {
  const jets: JetNote[] = [];
  const changements: Changement[] = [];
  const auMj: string[] = [];
  const d20 = () => 1 + Math.floor(alea() * 20);
  const des = new Map<string, number>();
  const lancer = (formule: string, quoi: string): number => {
    const cle = `${quoi}|${formule}`;
    if (!des.has(cle)) {
      // Un nombre seul (Cautérisation : 1 ; Frappe légendaire : 42) se prend tel quel.
      const j = /^\d+$/.test(formule) ? { des: [], total: Number(formule) } : lancerDegats(formule, alea);
      if (!j) {
        auMj.push(`${quoi} : formule illisible « ${formule} »`);
        des.set(cle, 0);
      } else {
        jets.push({ quoi, des: j.des, total: j.total });
        des.set(cle, j.total);
      }
    }
    return des.get(cle)!;
  };
  for (const e of cap.effets) if (e.type === 'special') auMj.push(e.note);
  for (const { c, fiche } of cibles) {
    const lue = cibleDe(c, fiche, 0);
    let touche = true;
    let sauve = false;
    if (cap.jetAttaque !== null) {
      const d = d20();
      const total = d + cap.jetAttaque;
      touche = d === 20 || (d !== 1 && total >= lue.def);
      jets.push({ quoi: 'attaque', cible: c.id, des: [d], total, contre: lue.def, reussi: touche });
    }
    if (touche && cap.sauvegarde) {
      const d = d20();
      const total = d + lue.sauvegardes[cap.sauvegarde.type];
      sauve = total >= cap.sauvegarde.dd;
      jets.push({ quoi: `sauvegarde de ${cap.sauvegarde.type}`, cible: c.id, des: [d], total, contre: cap.sauvegarde.dd, reussi: sauve });
    }
    if (!touche) continue;
    for (const e of cap.effets) {
      if (e.type === 'degats') {
        if (sauve && e.surReussite !== 'demi') continue;
        const brut = lancer(e.formule, 'dégâts');
        const montant = sauve ? Math.floor(brut / 2) : brut;
        changements.push({ type: 'degats', cible: c.id, montant, typeDegats: e.elementaire ?? 'physique', calcul: `${montant}${sauve ? ' (sauvegarde réussie : moitié)' : ''}` });
      } else if (sauve) continue;
      else if (e.type === 'soin') changements.push({ type: 'soin', cible: c.id, montant: lancer(e.formule, 'soin') });
      else if (e.type === 'bonus') changements.push({ type: 'bonus', cible: c.id, sur: e.cible, valeur: e.valeur, duree: dureeDuBestiaire(e.duree) });
      else if (e.type === 'etat') {
        const id = ETATS_BESTIAIRE[e.id] ?? e.id;
        if (!etatParId.has(id)) auMj.push(`État « ${e.id} » sur ${c.nom}`);
        else changements.push({ type: 'etat', cible: c.id, etat: id, duree: dureeDuBestiaire(e.duree), ...(e.formuleDot ? { des: e.formuleDot } : {}) });
      }
    }
  }
  return { jets, changements, auMj };
}

// ---------------------------------------------------------------- L6.7a : les zones

/**
 * L6.7a (2a, 3a, décisions de Thomas du 29/10/2026) : une capacité en zone
 * est centrée sur le monstre (toutes celles du bestiaire le sont) ; elle
 * prend tout ce qui est debout dans son rayon (1,5 m par case), ses alliés
 * compris, sauf lui. Sans son jeton sur la carte : personne.
 */
export function ciblesDeZone(monstre: { id: string }, zoneM: number, combattants: readonly AvecId<Combattant>[], jetons: readonly { id: string; cx: number; cy: number }[]): string[] {
  const centre = jetons.find((j) => j.id === monstre.id);
  if (!centre) return [];
  const r = Math.floor(zoneM / 1.5);
  return combattants
    .filter((c) => c.id !== monstre.id && !c.mort && !(c.genre !== 'pj' && c.aTerre))
    .filter((c) => {
      const j = jetons.find((x) => x.id === c.id);
      return !!j && distanceCases(centre, j) <= r;
    })
    .map((c) => c.id);
}

/** Les cases de la zone, dans la grille, pour la montrer sur la carte. */
export function casesDeZone(centre: Case, zoneM: number, grille: { colonnes: number; lignes: number }): Case[] {
  const r = Math.floor(zoneM / 1.5);
  const cases: Case[] = [];
  for (let cy = Math.max(0, centre.cy - r); cy <= Math.min(grille.lignes - 1, centre.cy + r); cy++)
    for (let cx = Math.max(0, centre.cx - r); cx <= Math.min(grille.colonnes - 1, centre.cx + r); cx++) cases.push({ cx, cy });
  return cases;
}

// ---------------------------------------------------------------- 9a : Curée

const schemaCuree = z.object({
  nom: z.string(),
  mecanique: z.object({
    declencheur: z.object({ evenement: z.literal('allieTombe'), portee: z.literal('famille') }),
    effets: z.array(z.object({ type: z.literal('bonus'), cible: z.string().min(1).max(40), valeur: z.number().int().min(-20).max(20), duree: z.string() })).min(1),
  }),
});

/** 9a : quand `tombe` tombe, les monstres debout de sa famille qui ont la capacité : leurs bonus. */
export function cureesApresChute(
  tombe: AvecId<Combattant>,
  combattants: readonly AvecId<Combattant>[],
  modeles: ReadonlyMap<string, { famille?: string | undefined; capacitesSpeciales: readonly unknown[] }>,
): { qui: AvecId<Combattant>; nom: string; changements: Changement[] }[] {
  const famille = tombe.monstre ? modeles.get(tombe.monstre)?.famille : undefined;
  if (!famille) return [];
  return combattants.flatMap((c) => {
    const m = c.monstre ? modeles.get(c.monstre) : undefined;
    if (c.genre !== 'monstre' || c.aTerre || !m || m.famille !== famille) return [];
    return m.capacitesSpeciales.flatMap((brut) => {
      const k = schemaCuree.safeParse(brut);
      if (!k.success) return [];
      return [{ qui: c, nom: k.data.nom, changements: k.data.mecanique.effets.map((e): Changement => ({ type: 'bonus', cible: c.id, sur: e.cible, valeur: e.valeur, duree: dureeDuBestiaire(e.duree) })) }];
    });
  });
}
