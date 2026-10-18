import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/client';
import { ajouterCran } from '../regles/progression';
import { schemaJalon } from '../schemas/jalon';
import { session } from '../session.svelte';

/*
 * Crans de progression (lot L2.5), donnés ou retirés par le MJ. Une
 * TRANSACTION écrit ensemble le document du cran (persos/{id}/jalons, en
 * ajout seul) et le compte de la fiche (progression.crans) : jamais l'un
 * sans l'autre, même si deux MJ cliquent en même temps.
 *
 * `seance` (L3.1) : la séance ouverte, notée sur le cran pour l'historique.
 */

export class RefusCran extends Error {}

export async function donnerCran(idPerso: string, delta: 1 | -1, libelle: string, seance?: string): Promise<number> {
  const refPerso = doc(db, `tables/${session.table}/persos/${idPerso}`);
  const refJalon = doc(collection(db, `tables/${session.table}/persos/${idPerso}/jalons`));
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(refPerso);
    if (!lu.exists()) throw new RefusCran('Ce personnage n’existe plus.');
    // Seul le compte est lu : un cran ne dépend pas du reste de la fiche.
    const actuel = lu.get('progression.crans');
    const avant = Number.isInteger(actuel) && actuel > 0 ? (actuel as number) : 0;
    if (delta < 0 && avant === 0) throw new RefusCran('Aucun cran à retirer : un niveau acquis ne se perd pas.');
    const crans = ajouterCran(avant, delta);
    tx.set(refJalon, schemaJalon.parse({ barre: 'niveau', delta, libelle: libelle.trim().slice(0, 80), parUid: session.uid, ...(seance ? { seance } : {}), creeLe: Date.now() }));
    tx.update(refPerso, { 'progression.crans': crans });
    return crans;
  });
}
