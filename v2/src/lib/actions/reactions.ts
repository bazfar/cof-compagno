import { addDoc, collection, deleteDoc, doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { Case } from '../battlemap/geometrie';
import { attaquesDuMonstre, type AttaqueMonstre, type CarteDuCombat } from '../combat/attaque';
import { etatPj } from '../combat/mort';
import { arriveePermise } from '../combat/poussee';
import { besoinsReaction, idOpportunite, OPPORTUNITE, reactionDisponible } from '../combat/reactions';
import { reactionsDeCombat } from '../combat/sorts';
import { vueFiche } from '../fiche/vue-fiche';
import type { Combat, Combattant } from '../schemas/combat';
import type { Fiche, FicheV2 } from '../schemas/fiche';
import type { DemandeReaction, Opportunite } from '../schemas/reactions';
import { session } from '../session.svelte';
import { attaqueDeMonstre, attaqueSurInvocation } from './attaques';
import { RefusCombat } from './combat';
import { maintenirConcentration } from './invocations';
import { lancerSortEnCombat, placerParSort } from './sorts-combat';

/*
 * Les réactions en combat (lot L6.5b, décisions de Thomas du 26/10/2026).
 *   - 1a : le joueur demande (un document `reactions` du combat) ; le
 *     client du MJ la joue d'office avec le moteur (lancerSortEnCombat,
 *     en réaction) et écrit tout ; la demande passe à « jouée » ou
 *     « refusée », avec le texte, que la barre du joueur montre ;
 *   - 2b : le client de celui qui bouge note les opportunités que son pas
 *     ouvre (un document `opportunites` par attaquant, ce tour) ;
 *   - 5a, 11a : le monstre frappe d'opportunité de sa première attaque au
 *     contact, depuis le panneau du MJ ; elle prend sa réaction.
 */

type AvecId<T> = T & { id: string };

const refReactions = (idCombat: string) => collection(db, `tables/${session.table}/combats/${idCombat}/reactions`);
const refReaction = (idCombat: string, id: string) => doc(db, `tables/${session.table}/combats/${idCombat}/reactions/${id}`);
const refOpportunite = (idCombat: string, id: string) => doc(db, `tables/${session.table}/combats/${idCombat}/opportunites/${id}`);

/** Le joueur demande sa réaction (6a), hors de son tour. */
export async function demanderReaction(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'actif'>,
  moi: AvecId<Combattant>,
  d: Pick<DemandeReaction, 'reaction' | 'cible' | 'case' | 'posture' | 'opportunite'>,
): Promise<void> {
  if (combat.actif === moi.id) throw new RefusCombat('À ton tour, pas de réaction : elle se joue hors de ton tour.');
  if (!reactionDisponible(moi)) throw new RefusCombat('Tu as déjà réagi ce round.');
  const demande: DemandeReaction = { qui: moi.id, uid: session.uid, ...d, tour: combat.tour, statut: 'attente', texte: null, creeLe: Date.now() };
  await addDoc(refReactions(idCombat), demande);
}

/** 2b : son pas ouvre l'attaque d'opportunité de ces ennemis, ce tour. */
export async function signalerOpportunites(idCombat: string, tour: number, cible: string, attaquants: readonly string[]): Promise<void> {
  const lot = writeBatch(db);
  for (const a of attaquants) lot.set(refOpportunite(idCombat, idOpportunite(tour, a, cible)), { attaquant: a, cible, tour, creeLe: Date.now() } satisfies Opportunite);
  await lot.commit();
}

/** Ce que le client du MJ connaît pour jouer une demande. */
export interface ContexteReaction {
  combattants: readonly AvecId<Combattant>[];
  /** Par personnage. */
  fiches: ReadonlyMap<string, AvecId<Fiche>>;
  carte: CarteDuCombat | null;
  opportunites: readonly AvecId<Opportunite>[];
}

/**
 * MJ (1a) : joue la demande d'un joueur, une fois (la demande est prise
 * dans une transaction). Rend le texte, ou null si un autre client du MJ
 * l'a déjà prise. Un refus passe la demande à « refusée », avec sa raison.
 */
export async function jouerReaction(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene' | 'actif' | 'porteesLibres'>,
  d: AvecId<DemandeReaction>,
  ctx: ContexteReaction,
  alea: () => number = Math.random,
): Promise<string | null> {
  const ref = refReaction(idCombat, d.id);
  const prise = await runTransaction(db, async (tx) => {
    const lu = await tx.get(ref);
    if (lu.data()?.statut !== 'attente') return false;
    tx.update(ref, { statut: 'jouee' });
    return true;
  });
  if (!prise) return null;
  try {
    const texte = (await resoudre(idCombat, combat, d, ctx, alea)).slice(0, 300);
    await updateDoc(ref, { texte });
    return texte;
  } catch (e) {
    const motif = (e instanceof RefusCombat ? e.message : 'L’app n’a pas pu la jouer.').slice(0, 300);
    await updateDoc(ref, { statut: 'refusee', texte: motif });
    return motif;
  }
}

async function resoudre(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene' | 'actif' | 'porteesLibres'>,
  d: DemandeReaction,
  ctx: ContexteReaction,
  alea: () => number,
): Promise<string> {
  const moi = ctx.combattants.find((c) => c.id === d.qui);
  if (!moi || moi.uid !== d.uid) throw new RefusCombat('Ce combattant n’est pas le sien.');
  if (d.tour !== combat.tour) throw new RefusCombat('Trop tard : le tour a passé.');
  const fiche = moi.perso ? ctx.fiches.get(moi.perso) : undefined;
  if (!fiche || fiche.schemaVersion !== 2) throw new RefusCombat('Les réactions viennent avec une fiche de la refonte.');
  if (etatPj(vueFiche(fiche).pv.actuel, moi) !== 'debout') throw new RefusCombat(`${moi.nom} est à terre.`);
  // 10a : l'opportunité se prend si son pas l'a ouverte, ce tour, sur lui.
  const opp = d.reaction === OPPORTUNITE ? ctx.opportunites.find((o) => o.id === d.opportunite && o.attaquant === moi.id && o.cible === d.cible && o.tour === combat.tour) : null;
  if (d.reaction === OPPORTUNITE && !opp) throw new RefusCombat('Cette attaque d’opportunité n’est plus ouverte.');
  const f = fiche as AvecId<FicheV2>;
  const s = reactionsDeCombat(f).find((x) => x.id === d.reaction);
  if (!s) throw new RefusCombat('Il ne connaît pas cette réaction.');
  // 6b : la case du bond, vérifiée avant que rien ne se paie.
  const b = besoinsReaction(f, moi, s);
  if (b.bond !== null) {
    if (!d.case || !ctx.carte) throw new RefusCombat('Choisis la case où il bondit.');
    const refus = arriveePermise(ctx.carte.scene, ctx.carte.jetons, moi.id, d.case, b.bond);
    if (refus) throw new RefusCombat(`${s.nom} : ${refus}.`);
  }
  const r = await lancerSortEnCombat(
    idCombat,
    combat,
    moi,
    f,
    { sort: s.id, palier: s.paliers.at(-1) ?? 'I', surcharge: false, element: null, visee: { cibles: d.cible ? [d.cible] : [], point: null }, reaction: true, ...(d.posture ? { options: { posture: d.posture } } : {}) },
    ctx.carte,
    ctx.combattants,
    ctx.fiches,
    alea,
  );
  const bond = r.aPlacer.find((p) => p.cible === moi.id);
  if (bond && d.case && ctx.carte) await placerParSort(combat.scene, ctx.carte, bond, d.case as Case);
  if (opp) await deleteDoc(refOpportunite(idCombat, opp.id));
  return `${s.nom} : ${r.texte}`;
}

/** 5a : l'attaque d'opportunité d'un monstre : sa première attaque au contact. */
export function attaqueDOpportunite(attaques: readonly AttaqueMonstre[]): AttaqueMonstre | null {
  return attaques.find((a) => !a.portee.vue) ?? null;
}

/**
 * MJ (5a, 11a) : le monstre frappe celui qui a quitté son contact, de sa
 * première attaque au contact ; elle prend sa réaction du round. Un PJ
 * touché pendant sa concentration fait sa sauvegarde (L6.4b2). Rend le
 * texte du panneau.
 */
export async function opportuniteDeMonstre(
  idCombat: string,
  combat: Pick<Combat, 'tour' | 'round' | 'scene'>,
  o: AvecId<Opportunite>,
  monstre: AvecId<Combattant>,
  cible: AvecId<Combattant>,
  /** Les attaques du bestiaire et la liste des armes du monstre. */
  duBestiaire: Parameters<typeof attaquesDuMonstre>[0],
  armes: Parameters<typeof attaquesDuMonstre>[1],
  fiche: AvecId<Fiche> | null,
  combattants: readonly AvecId<Combattant>[],
  alea: () => number = Math.random,
): Promise<string> {
  if (o.tour !== combat.tour || o.attaquant !== monstre.id || o.cible !== cible.id) throw new RefusCombat('Cette attaque d’opportunité n’est plus ouverte.');
  const a = attaqueDOpportunite(attaquesDuMonstre(duBestiaire, armes, monstre.monstre));
  if (!a) throw new RefusCombat(`${monstre.nom} n’a pas d’attaque au contact.`);
  let texte: string;
  if (cible.genre === 'invocation') {
    const r = await attaqueSurInvocation(idCombat, combat, monstre, a, cible, alea, true);
    texte = r.net === null ? `${a.nom} : raté.` : `${a.nom} : touché, ${r.net} dégâts → ${cible.nom} ${r.pv} PV.`;
  } else {
    if (!fiche) throw new RefusCombat(`La fiche de ${cible.nom} manque.`);
    const r = await attaqueDeMonstre(idCombat, combat, monstre, a, cible, fiche, alea, true);
    if (r.issue.touche && cible.concentration) await maintenirConcentration(idCombat, combat.scene, cible, fiche, r.net ?? 0, combattants, monstre.nom);
    texte = r.net === null ? `${a.nom} : raté.` : `${a.nom} : touché, ${r.net} dégâts → ${fiche.nom} ${r.pv} PV.`;
  }
  await deleteDoc(refOpportunite(idCombat, o.id));
  return `Opportunité de ${monstre.nom} sur ${cible.nom} : ${texte}`;
}
