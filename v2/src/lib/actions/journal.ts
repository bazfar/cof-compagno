import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/client';
import { lancerFormule, type Jet } from '../regles/des';
import { schemaJetJournal } from '../schemas/journal';
import { session } from '../session.svelte';

/*
 * Journal de dés commun (lot L2.5). Seul endroit qui écrit dans
 * tables/{table}/journal : un document par jet, jamais modifié.
 */

/**
 * Message lisible d'une erreur d'écriture. Ce module ne dépend pas de
 * actions/persos : le journal est sur l'écran de départ, et les données de
 * règles que tire la fiche doivent rester dans les morceaux chargés à la
 * demande.
 */
export function messageErreurJournal(erreur: unknown): string {
  if (typeof erreur === 'object' && erreur !== null && 'code' in erreur && erreur.code === 'permission-denied') {
    return "Action refusée : tu n'as pas le droit de faire ça.";
  }
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Note un jet déjà lancé (potion, PV de montée de niveau…). */
export async function noterJet(libelle: string, formule: string, jet: Jet, perso?: string): Promise<void> {
  const doc = schemaJetJournal.parse({
    auteurUid: session.uid,
    auteurNom: session.nom,
    ...(perso ? { perso } : {}),
    libelle: libelle.slice(0, 80),
    formule: formule.replace(/\s/g, ''),
    des: jet.des,
    bonus: jet.bonus,
    total: jet.total,
    creeLe: Date.now(),
  });
  await addDoc(collection(db, `tables/${session.table}/journal`), doc);
}

/** Lance une formule et la note. Rend le jet, ou null si la formule est illisible. */
export async function lancerEtNoter(libelle: string, formule: string, perso?: string, alea?: () => number): Promise<Jet | null> {
  const jet = lancerFormule(formule, alea);
  if (!jet) return null;
  await noterJet(libelle, formule, jet, perso);
  return jet;
}
