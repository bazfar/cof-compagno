import { deleteDoc, doc, runTransaction, writeBatch, type Transaction } from 'firebase/firestore';
import { issueDuVote, lancerD100, nouvelIdButin } from '../butin/butin';
import type { Destinataire } from '../dons/dons';
import { db } from '../firebase/client';
import { objetsPourButin, recevoirObjet } from '../regles/equipement';
import { versFirestore } from '../regles/fiche-document';
import { schemaButin, type Butin, type ChoixButin, type GagnantButin, type VoteButin } from '../schemas/butin';
import { schemaFiche } from '../schemas/fiche';
import { session } from '../session.svelte';
import { noterJet } from './journal';
import { champsDuChangement } from './persos';

/*
 * Butin (lot L3.4, décisions du 18 et du 19/10/2026). Seul endroit qui
 * écrit dans tables/{table}/butins.
 *
 * - Le MJ met un objet au vote, clôt le vote, et peut attribuer
 *   directement à tout moment.
 * - Chaque joueur écrit seulement son vote (`votes.<uid>`) : son d100 est
 *   lancé au premier vote et ne change plus ; à égalité, il relance.
 * - L'objet n'entre dans un sac qu'en même temps que le butin passe à
 *   « attribue » (transaction qui relit le butin) : jamais deux fois.
 *
 * Les dés sont lancés par le client du joueur et notés au journal commun,
 * comme tous les jets de l'app ; les règles vérifient qu'un d100 est entre
 * 1 et 100 et qu'il ne change plus, pas qu'il est honnête.
 */

export class RefusButin extends Error {}

const refButin = (id: string) => doc(db, `tables/${session.table}/butins/${id}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

async function lireButin(tx: Transaction, id: string): Promise<Butin> {
  const lu = await tx.get(refButin(id));
  if (!lu.exists()) throw new RefusButin('Ce butin n’existe plus.');
  return schemaButin.parse(lu.data());
}

/** MJ : met au vote `combien` exemplaires d'un objet du catalogue (un consommable forme une seule pile). */
export async function mettreAuVote(idObjet: string, combien: number): Promise<number> {
  const objets = objetsPourButin(idObjet, combien);
  const lot = writeBatch(db);
  const maintenant = Date.now();
  for (const objet of objets) {
    const butin = schemaButin.parse({ objet, statut: 'vote', creeLe: maintenant, tour: 0, enLice: [], votes: {}, gagnant: null, resoluLe: null });
    lot.set(refButin(nouvelIdButin()), { ...butin, objet: versFirestore(butin.objet) });
  }
  await lot.commit();
  return objets.length;
}

/**
 * Joueur : vote (ou change d'avis tant que le vote est ouvert). Le d100 est
 * lancé au premier vote, puis gardé. Rend le d100 et s'il vient d'être lancé.
 */
export async function voter(id: string, choix: ChoixButin, perso: { id: string; nom: string }): Promise<{ d100: number; lance: boolean; objet: string }> {
  const res = await runTransaction(db, async (tx) => {
    const butin = await lireButin(tx, id);
    if (butin.statut !== 'vote') throw new RefusButin('Le vote est clos.');
    const avant = butin.votes[session.uid];
    if (avant && avant.perso !== perso.id) throw new RefusButin(`Tu as voté avec ${avant.nom} : c'est lui qui recevra l'objet.`);
    const d100 = avant?.d100 ?? lancerD100();
    const vote: VoteButin = { choix, perso: perso.id, nom: perso.nom, d100, relances: [], le: Date.now() };
    tx.update(refButin(id), { [`votes.${session.uid}`]: vote });
    return { d100, lance: !avant, objet: String(butin.objet.nom ?? 'Objet') };
  });
  if (res.lance) await noterD100(`Butin : ${res.objet}`, res.d100, perso.nom);
  return res;
}

/** Joueur à égalité : relance son d100 pour le tour en cours. */
export async function relancer(id: string): Promise<number> {
  const res = await runTransaction(db, async (tx) => {
    const butin = await lireButin(tx, id);
    const avant = butin.votes[session.uid];
    if (butin.statut !== 'relance' || !butin.enLice.includes(session.uid) || !avant) throw new RefusButin('Pas de relance pour toi sur ce butin.');
    if (avant.relances.length >= butin.tour) throw new RefusButin('Tu as déjà relancé : on attend les autres.');
    const d = lancerD100();
    tx.update(refButin(id), { [`votes.${session.uid}`]: { ...avant, relances: [...avant.relances, d], le: Date.now() } });
    return { d, objet: String(butin.objet.nom ?? 'Objet'), nom: avant.nom };
  });
  await noterD100(`Butin, relance : ${res.objet}`, res.d, res.nom);
  return res.d;
}

/** Le jet est déjà dans le butin : le journal n'est qu'un écho, son échec ne défait rien. */
async function noterD100(libelle: string, d: number, perso: string): Promise<void> {
  try {
    await noterJet(libelle, '1d100', { des: [d], faces: 100, bonus: 0, total: d }, perso);
  } catch {
    // Rien : le d100 est noté dans le butin, que toute la table voit.
  }
}

/** Range l'objet dans le sac du gagnant et clôt le butin, dans la même transaction. */
async function donner(tx: Transaction, id: string, butin: Butin, gagnant: GagnantButin): Promise<void> {
  const lue = await tx.get(refPerso(gagnant.perso));
  if (!lue.exists()) throw new RefusButin(`Le personnage de ${gagnant.nom} n’existe plus : attribue l’objet directement.`);
  const fiche = schemaFiche.parse(lue.data());
  tx.update(refPerso(gagnant.perso), champsDuChangement(recevoirObjet(fiche, butin.objet)));
  tx.update(refButin(id), { statut: 'attribue', gagnant, tour: butin.tour, enLice: [], resoluLe: Date.now() });
}

/**
 * MJ : clôt le vote, ou fait avancer un butin en relance. Selon les votes :
 * l'objet va au gagnant ; ou les joueurs à égalité doivent relancer ; ou
 * personne n'en veut (« clos », à attribuer directement ou à retirer).
 * Sans effet si on attend encore des relances. Rend ce qui s'est passé.
 */
export async function avancerButin(id: string): Promise<'attribue' | 'relance' | 'attente' | 'clos'> {
  return runTransaction(db, async (tx) => {
    const butin = await lireButin(tx, id);
    if (butin.statut === 'attribue' || butin.statut === 'clos') throw new RefusButin('Ce butin est déjà réglé.');
    const issue = issueDuVote(butin.votes);
    if (issue.etat === 'personne') {
      tx.update(refButin(id), { statut: 'clos', resoluLe: Date.now() });
      return 'clos';
    }
    if (issue.etat === 'gagnant') {
      await donner(tx, id, butin, { uid: issue.uid, perso: issue.vote.perso, nom: issue.vote.nom, mode: 'vote' });
      return 'attribue';
    }
    if (issue.tour > 20) throw new RefusButin('Vingt relances à égalité : attribue l’objet directement.');
    if (butin.statut === 'relance' && butin.tour === issue.tour) return 'attente';
    tx.update(refButin(id), { statut: 'relance', tour: issue.tour, enLice: issue.enLice });
    return 'relance';
  });
}

/** MJ : attribue directement, à tout moment (même pendant le vote). */
export async function attribuerDirectement(id: string, a: Destinataire): Promise<void> {
  await runTransaction(db, async (tx) => {
    const butin = await lireButin(tx, id);
    if (butin.statut === 'attribue') throw new RefusButin('Ce butin est déjà attribué.');
    await donner(tx, id, butin, { uid: a.uid, perso: a.perso, nom: a.nom, mode: 'direct' });
  });
}

/** MJ : retire un butin (personne n'en veut, ou erreur de saisie). */
export async function retirerButin(id: string): Promise<void> {
  await deleteDoc(refButin(id));
}
