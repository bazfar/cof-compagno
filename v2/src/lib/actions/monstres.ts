import { doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { distanceCases } from '../battlemap/geometrie';
import type { CarteDuCombat } from '../combat/attaque';
import { appliquerChangements, texteJet, type Lu } from '../combat/changements';
import { immunise, peutAgir } from '../combat/etats';
import { avecFaim, ETATS_CONTROLE, faimDe, faimNourrie, soigne, type TraitsDemon } from '../combat/demons';
import { avecUsage, jouerCapacite, legendairesRestantes, refusDeLimite, USAGE_LEGENDAIRE, type CapaciteMonstre } from '../combat/monstres';
import { actionsDuTour } from '../combat/ordre';
import { reactionDisponible, USAGE_REACTION } from '../combat/reactions';
import type { Changement } from '../effets/resolution';
import { schemaCombattant, type Combat, type Combattant } from '../schemas/combat';
import type { Fiche } from '../schemas/fiche';
import { session } from '../session.svelte';
import { RefusCombat } from './combat';
import { noterJet } from './journal';

/*
 * Le MJ joue les monstres avancés (lot L6.6a, décisions de Thomas du
 * 28/10/2026). lib/combat/monstres.ts dit le reste.
 *   - 2a, 3a, 10a : une capacité, sur les cibles cochées ; son action (ou
 *     l'action bonus, ou la réaction du round) et sa limite ;
 *   - 9a : Curée, quand un monstre tombe ;
 *   - 7a : le MJ corrige le compteur des résistances légendaires.
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

/** La clé de `usages` d'une capacité (les attaques prennent leur nom seul). */
export const cleCapacite = (nom: string) => `c:${nom}`;

/** Ce que la capacité prend au monstre : son action, son action bonus, ou sa réaction du round (10a). */
function prise(combat: Pick<Combat, 'tour'>, m: Combattant, quoi: CapaciteMonstre['prend']): Record<string, unknown> {
  if (quoi === 'reaction') {
    if (!reactionDisponible(m)) throw new RefusCombat(`${m.nom} a déjà réagi ce round.`);
    return { usages: { ...m.usages, [USAGE_REACTION]: combat.tour } };
  }
  const a = actionsDuTour(m, combat.tour);
  if (a[quoi]) throw new RefusCombat(quoi === 'principale' ? 'L’action principale est déjà prise ce tour.' : 'L’action bonus est déjà prise ce tour.');
  return { tourActions: combat.tour, ...a, [quoi]: true };
}

/** Écrit des changements : les combattants touchés, lus dans une transaction ; le monstre qui agit reçoit aussi `moiEnPlus`. Rend les écritures. */
async function ecrire(idCombat: string, monstre: AvecId<Combattant>, changements: readonly Changement[], fiches: ReadonlyMap<string, AvecId<Fiche>>, moiEnPlus: Record<string, unknown>) {
  const touches = new Set<string>([monstre.id]);
  for (const c of changements) if ('cible' in c) touches.add(c.cible);
  return runTransaction(db, async (tx) => {
    const lus = new Map<string, Lu>();
    for (const id of touches) {
      const d = await tx.get(refCombattant(idCombat, id));
      if (!d.exists()) continue;
      const c = { ...schemaCombattant.parse(d.data()), id };
      lus.set(id, { c, fiche: c.perso ? (fiches.get(c.perso) ?? null) : null });
    }
    const ecr = appliquerChangements(changements, lus, { id: monstre.id, nom: monstre.nom, fiche: null }, { parLeMj: true });
    for (const [id, m] of ecr.combattants) if (id !== monstre.id) tx.update(refCombattant(idCombat, id), m);
    const moi = { ...(ecr.combattants.get(monstre.id) ?? {}), ...moiEnPlus };
    if (Object.keys(moi).length) tx.update(refCombattant(idCombat, monstre.id), moi);
    for (const [id, m] of ecr.fiches) tx.update(refPerso(id), m);
    return ecr;
  });
}

/**
 * MJ (2a, 3a) : le monstre joue une capacité sur les cibles cochées.
 * Refusée : déjà servie (sa limite), son action prise, une cible hors du
 * combat ou hors de portée (une capacité à cible unique, sur la carte).
 * Rend le texte du panneau.
 */
export async function jouerCapaciteMonstre(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round'>,
  monstre: AvecId<Combattant>,
  cap: CapaciteMonstre,
  cibles: readonly string[],
  ctx: { combattants: readonly AvecId<Combattant>[]; fiches: ReadonlyMap<string, AvecId<Fiche>>; carte: CarteDuCombat | null; demon?: TraitsDemon | null },
  alea: () => number = Math.random,
): Promise<string> {
  if (monstre.genre !== 'monstre' || monstre.aTerre) throw new RefusCombat('Seul un monstre debout joue ses capacités.');
  const agit = peutAgir(monstre.etats);
  if (agit !== 'oui') throw new RefusCombat(agit === 'non' ? `${monstre.nom} ne peut pas agir ce tour.` : `${monstre.nom} ne peut que se déplacer ce tour.`);
  const refus = refusDeLimite(monstre, cleCapacite(cap.nom), cap.limite, combat.round);
  if (refus) throw new RefusCombat(`${cap.nom} : ${refus}.`);
  const ids = cap.cible === 'soi' ? [monstre.id] : cap.cible === 'aucune' ? [] : [...new Set(cibles)];
  if ((cap.cible === 'ennemi' || cap.cible === 'allie' || cap.cible === 'zone') && !ids.length) throw new RefusCombat('Coche ses cibles.');
  const visees = ids.map((id) => {
    const c = ctx.combattants.find((x) => x.id === id);
    if (!c || c.mort || (c.genre === 'monstre' && c.aTerre)) throw new RefusCombat('Une cible n’est plus dans le combat.');
    if (c.genre === 'pj' && !(c.perso && ctx.fiches.has(c.perso))) throw new RefusCombat(`La fiche de ${c.nom} manque.`);
    return { c, fiche: c.perso ? ctx.fiches.get(c.perso)! : null };
  });
  // 3a : une capacité à cible unique se vérifie à portée, sur la carte.
  if (cap.portee !== null && ctx.carte && (cap.cible === 'ennemi' || cap.cible === 'allie')) {
    const moi = ctx.carte.jetons.find((j) => j.id === monstre.id);
    for (const { c } of visees) {
      const j = ctx.carte.jetons.find((x) => x.id === c.id);
      if (moi && j && distanceCases(moi, j) > cap.portee) throw new RefusCombat(`${c.nom} est hors de portée (${distanceCases(moi, j)} cases, ${cap.portee} au plus).`);
    }
  }
  const p = prise(combat, monstre, cap.prend);
  const usages = avecUsage((p.usages as Record<string, number> | undefined) ?? monstre.usages, cleCapacite(cap.nom), cap.limite, combat.round);
  const r = jouerCapacite(cap, visees, alea);
  // L6.6b (1a, 8a) : un démon : la faim de ses états de contrôle nouveaux ; Reflet, par sauvegarde ratée contre lui.
  const moi: Record<string, unknown> = { ...p, usages };
  const notes: string[] = [];
  const demon = ctx.demon ?? null;
  if (demon) {
    const nouveaux = r.changements.filter((ch) => {
      const c = ch.type === 'etat' && ETATS_CONTROLE.includes(ch.etat) ? visees.find((v) => v.c.id === ch.cible)?.c : undefined;
      return !!c && ch.type === 'etat' && !immunise(c, ch.etat) && !c.etats.some((e) => e.id === ch.etat);
    }).length;
    const faim = faimNourrie(demon, { etatsControle: nouveaux });
    if (faim && demon.faim) {
      moi.usages = avecFaim(usages, faim);
      notes.push(`faim ${faimDe({ usages: moi.usages as Record<string, number> })}/${demon.faim.seuil}`);
    }
    const rates = r.jets.filter((j) => j.cible && j.quoi.startsWith('sauvegarde') && j.reussi === false).length;
    const pv = soigne(monstre, (demon.passifs.reflet ?? 0) * rates);
    if (pv !== monstre.pv) {
      moi.pv = pv;
      notes.push(`Reflet : ${monstre.nom} regagne ${pv - (monstre.pv ?? 0)} PV`);
    }
  }
  const ecr = await ecrire(idCombat, monstre, r.changements, ctx.fiches, moi);
  const nomDe = (id: string) => ctx.combattants.find((c) => c.id === id)?.nom ?? id;
  const lignes = [
    ...r.jets.filter((j) => !j.cible).map(texteJet),
    ...visees.map(({ c }) => `${c.nom} : ${[...r.jets.filter((j) => j.cible === c.id).map(texteJet), ...(ecr.lignes.get(c.id) ?? [])].join(', ') || 'rien'}`),
    ...notes,
    ...[...r.auMj, ...ecr.auMj].map((x) => `MJ : ${x}`),
  ];
  const texte = lignes.join(' ; ') || 'rien';
  await noterJet(cap.nom, '0', { des: [], faces: 0, bonus: 0, total: 0 }, monstre.nom, texte);
  return `${cap.nom}${visees.length ? ` sur ${visees.map(({ c }) => nomDe(c.id)).join(', ')}` : ''} : ${texte}`;
}

/** 9a : Curée : les monstres de la famille de celui qui tombe gagnent leurs bonus. */
export async function jouerCurees(idCombat: string, tombe: Pick<Combattant, 'nom'>, curees: readonly { qui: AvecId<Combattant>; nom: string; changements: Changement[] }[]): Promise<void> {
  if (!curees.length) return;
  const lot = writeBatch(db);
  const lignes: string[] = [];
  for (const k of curees) {
    const ecr = appliquerChangements(k.changements, new Map([[k.qui.id, { c: k.qui, fiche: null }]]), { id: k.qui.id, nom: k.nom, fiche: null });
    lot.update(refCombattant(idCombat, k.qui.id), ecr.combattants.get(k.qui.id)!);
    lignes.push(`${k.qui.nom} : ${(ecr.lignes.get(k.qui.id) ?? []).join(', ')}`);
  }
  await lot.commit();
  await noterJet(curees[0]!.nom, '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', `${tombe.nom} tombe ; ${lignes.join(' ; ')}`);
}

/** 7a : le MJ corrige les résistances légendaires qui ont servi (+1 : une de moins à jouer). */
export async function corrigerLegendaire(idCombat: string, c: AvecId<Combattant>, delta: 1 | -1): Promise<void> {
  const servies = Math.max(0, Math.min(c.legendaire ?? 0, (c.usages[USAGE_LEGENDAIRE] ?? 0) + delta));
  const { [USAGE_LEGENDAIRE]: _avant, ...autres } = c.usages;
  await updateDoc(refCombattant(idCombat, c.id), { usages: servies ? { ...autres, [USAGE_LEGENDAIRE]: servies } : autres });
  await noterJet(`Résistance légendaire de ${c.nom}`, '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', `corrigée : ${legendairesRestantes({ legendaire: c.legendaire, usages: { [USAGE_LEGENDAIRE]: servies } })}/${c.legendaire ?? 0} restantes.`);
}
