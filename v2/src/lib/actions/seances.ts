import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/client';
import { schemaSeance } from '../schemas/seance';
import { session } from '../session.svelte';

/*
 * Séances (lot L3.1). Seul endroit qui écrit dans tables/{table}/seances
 * et le champ `seanceOuverte` de la table. Ouvrir et clore passent par une
 * TRANSACTION qui relit la table : deux séances ne peuvent pas être
 * ouvertes à la fois, même si deux MJ cliquent ensemble.
 */

export class RefusSeance extends Error {}

const refTable = () => doc(db, `tables/${session.table}`);
const refSeance = (id: string) => doc(db, `tables/${session.table}/seances/${id}`);

/** Identifiant lisible et trié : « s0014 ». */
export function idSeance(numero: number): string {
  return `s${String(numero).padStart(4, '0')}`;
}

export async function ouvrirSeance(numero: number, presents: string[]): Promise<string> {
  const id = idSeance(numero);
  return runTransaction(db, async (tx) => {
    const table = await tx.get(refTable());
    const ouverte = table.get('seanceOuverte') as { numero?: number } | null | undefined;
    if (ouverte) throw new RefusSeance(`La séance ${ouverte.numero ?? ''} est déjà ouverte : clos-la d'abord.`.replace('  ', ' '));
    if ((await tx.get(refSeance(id))).exists()) throw new RefusSeance(`La séance ${numero} existe déjà : choisis un autre numéro.`);
    tx.set(refSeance(id), schemaSeance.parse({ numero, ouverteLe: Date.now(), closeLe: null, presents: [...new Set(presents)] }));
    tx.set(refTable(), { seanceOuverte: { id, numero } }, { merge: true });
    return id;
  });
}

/** Coche ou décoche un présent ; seulement sur une séance ouverte. */
export async function changerPresents(id: string, presents: string[]): Promise<void> {
  await runTransaction(db, async (tx) => {
    const lue = await tx.get(refSeance(id));
    if (!lue.exists() || lue.get('closeLe') !== null) throw new RefusSeance('Cette séance est close : les présents ne changent plus.');
    tx.update(refSeance(id), { presents: [...new Set(presents)] });
  });
}

export async function cloreSeance(id: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const lue = await tx.get(refSeance(id));
    if (!lue.exists()) throw new RefusSeance('Cette séance n’existe plus.');
    tx.update(refSeance(id), { closeLe: Date.now() });
    tx.set(refTable(), { seanceOuverte: null }, { merge: true });
  });
}
