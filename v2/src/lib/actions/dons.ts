import { doc, runTransaction, type DocumentReference, type Transaction } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { Destinataire } from '../dons/dons';
import { nouvelIdDon } from '../dons/dons';
import { recevoirObjet, retirerPourDon } from '../regles/equipement';
import { versFirestore } from '../regles/fiche-document';
import { schemaDon, type Don, type StatutDon } from '../schemas/don';
import { schemaFiche, type Fiche } from '../schemas/fiche';
import { session } from '../session.svelte';
import { champsDuChangement } from './persos';

/*
 * Dons d'objets entre joueurs (lot L3.3, décision du 18/10/2026 : proposé
 * puis accepté). Seul endroit qui écrit dans tables/{table}/dons.
 *
 * Chaque geste est une TRANSACTION qui relit le don et la fiche touchée :
 * l'objet quitte le sac du donneur en même temps que le don est créé, et
 * n'entre dans un sac qu'en même temps que le don change de statut. Deux
 * clics simultanés (accepter et annuler, par exemple) ne peuvent donc ni
 * perdre ni dupliquer l'objet : le second relit un statut qui n'est plus
 * « propose » et il est refusé.
 */

export class RefusDon extends Error {}

const refDon = (id: string) => doc(db, `tables/${session.table}/dons/${id}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

async function lireFiche(tx: Transaction, ref: DocumentReference): Promise<Fiche> {
  const lue = await tx.get(ref);
  if (!lue.exists()) throw new RefusDon('Ce personnage n’existe plus.');
  return schemaFiche.parse(lue.data());
}

async function lireDon(tx: Transaction, id: string, attendu: StatutDon): Promise<Don> {
  const lu = await tx.get(refDon(id));
  if (!lu.exists()) throw new RefusDon('Ce don n’existe plus.');
  const don = schemaDon.parse(lu.data());
  if (don.statut !== attendu) throw new RefusDon('Ce don a déjà été réglé.');
  return don;
}

/** Le donneur propose `combien` unités de l'objet `cle` de son sac. L'objet est mis de côté dans le don. */
export async function proposerDon(dePerso: string, cle: string, combien: number, a: Destinataire): Promise<string> {
  const id = nouvelIdDon();
  await runTransaction(db, async (tx) => {
    const fiche = await lireFiche(tx, refPerso(dePerso));
    if (fiche.proprietaireUid !== session.uid) throw new RefusDon('Tu ne peux donner que les objets de tes personnages.');
    if (a.uid === session.uid) throw new RefusDon('Tu ne peux pas te donner un objet.');
    const { changement, objet } = retirerPourDon(fiche, cle, combien);
    const don = schemaDon.parse({
      deUid: session.uid,
      dePerso,
      deNom: fiche.nom,
      aUid: a.uid,
      aPerso: a.perso,
      aNom: a.nom,
      objet,
      statut: 'propose',
      creeLe: Date.now(),
      resoluLe: null,
    });
    tx.update(refPerso(dePerso), champsDuChangement(changement));
    tx.set(refDon(id), { ...don, objet: versFirestore(don.objet) });
  });
  return id;
}

/** Ranger l'objet du don dans `perso` et passer le don au statut `statut`, ensemble. */
async function rangerEtRegler(id: string, attendu: StatutDon, statut: StatutDon, quiRange: 'donneur' | 'receveur'): Promise<void> {
  await runTransaction(db, async (tx) => {
    const don = await lireDon(tx, id, attendu);
    const uid = quiRange === 'donneur' ? don.deUid : don.aUid;
    if (uid !== session.uid) throw new RefusDon('Ce geste revient à l’autre joueur.');
    const perso = quiRange === 'donneur' ? don.dePerso : don.aPerso;
    const fiche = await lireFiche(tx, refPerso(perso));
    tx.update(refPerso(perso), champsDuChangement(recevoirObjet(fiche, don.objet)));
    tx.update(refDon(id), { statut, resoluLe: Date.now() });
  });
}

/** Le receveur accepte : l'objet entre dans son sac. */
export const accepterDon = (id: string) => rangerEtRegler(id, 'propose', 'accepte', 'receveur');

/** Le donneur annule avant la réponse : l'objet revient dans son sac. */
export const annulerDon = (id: string) => rangerEtRegler(id, 'propose', 'annule', 'donneur');

/** Après un refus, le donneur reprend l'objet dans son sac. */
export const reprendreDon = (id: string) => rangerEtRegler(id, 'refuse', 'repris', 'donneur');

/** Le receveur refuse : l'objet reste dans le don jusqu'à ce que le donneur le reprenne. */
export async function refuserDon(id: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const don = await lireDon(tx, id, 'propose');
    if (don.aUid !== session.uid) throw new RefusDon('Ce geste revient à l’autre joueur.');
    tx.update(refDon(id), { statut: 'refuse', resoluLe: Date.now() });
  });
}
