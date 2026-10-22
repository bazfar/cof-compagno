import { collection, deleteDoc, doc, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import {
  ajusterScore,
  corrigerCran,
  decouvrirMensonge,
  factionParId,
  nouvelIdPnj,
  pnjDepuisLore,
  RefusAttitude,
  rencontrer,
  rendreService,
  type FicheLorePourPnj,
} from '../pnj/attitude';
import { schemaGesteAttitude, schemaPnj, type GesteAttitude, type Pnj } from '../schemas/pnj';
import { schemaReputationGroupe, type ReputationGroupe } from '../schemas/reputation';
import { session } from '../session.svelte';

/*
 * Écritures des PNJ et de la réputation (lot S1). Le MJ seul écrit (règles
 * Firestore). Chaque changement d'attitude est une TRANSACTION qui relit le
 * PNJ (et la réputation pour une rencontre) avant d'écrire, et note le geste
 * dans l'historique du PNJ, avec son motif.
 */

export { RefusAttitude };

const refPnj = (id: string) => doc(db, `tables/${session.table}/pnj/${id}`);
const refReputation = () => doc(db, `tables/${session.table}/reputation/groupe`);
const PAR_LOT = 200;

/** Crée un PNJ à la main (pas encore rencontré) ; rend son identifiant. */
export async function creerPnj(nom: string, faction: string | null): Promise<string> {
  if (faction && !factionParId.has(faction)) throw new RefusAttitude(`Faction inconnue : ${faction}.`);
  const id = nouvelIdPnj(nom);
  const maintenant = Date.now();
  const p = schemaPnj.parse({ nom, faction, lore: null, rencontre: false, cran: null, tendance: null, mensonges: 0, creeLe: maintenant, majLe: maintenant });
  await setDoc(refPnj(id), p);
  return id;
}

/** Retire un PNJ pas encore rencontré (une faute de frappe, un doublon) ; un PNJ rencontré reste. */
export async function retirerPnj(id: string, p: Pnj): Promise<void> {
  if (p.rencontre) throw new RefusAttitude(`${p.nom} est rencontré : il reste dans la mémoire du groupe.`);
  await deleteDoc(refPnj(id));
}

/** Crée les PNJ du lore importé qui n'en ont pas encore (3a) ; rend leur nombre. */
export async function importerPnjDuLore(fiches: readonly FicheLorePourPnj[], existants: ReadonlySet<string>): Promise<number> {
  const nouveaux = pnjDepuisLore(fiches, existants, Date.now());
  for (let i = 0; i < nouveaux.length; i += PAR_LOT) {
    const lot = writeBatch(db);
    for (const { id, pnj } of nouveaux.slice(i, i + PAR_LOT)) lot.set(refPnj(id), schemaPnj.parse(pnj));
    await lot.commit();
  }
  return nouveaux.length;
}

/** Relit le PNJ, applique le geste, écrit le PNJ et son historique. */
async function geste(id: string, nom: GesteAttitude, motif: string, seance: string | undefined, f: (p: Pnj, rep: ReputationGroupe | null) => Pnj, lireReputation = false): Promise<Pnj> {
  const ref = refPnj(id);
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(ref);
    if (!lu.exists()) throw new RefusAttitude('Ce PNJ n’existe plus.');
    const avant = schemaPnj.parse(lu.data());
    let rep: ReputationGroupe | null = null;
    if (lireReputation) {
      const r = await tx.get(refReputation());
      rep = r.exists() ? schemaReputationGroupe.parse(r.data()) : null;
    }
    const apres = schemaPnj.parse(f(avant, rep));
    const trace = schemaGesteAttitude.parse({ geste: nom, avant: avant.cran, apres: apres.cran, motif: motif.trim().slice(0, 120), parUid: session.uid, ...(seance ? { seance } : {}), creeLe: Date.now() });
    tx.set(ref, apres);
    tx.set(doc(collection(db, `tables/${session.table}/pnj/${id}/historique`)), trace);
    return apres;
  });
}

/** Le groupe rencontre le PNJ : il devient visible des joueurs, au cran que fixe la réputation (16a) ou Neutre (4a). */
export function rencontrerPnj(id: string, seance?: string): Promise<Pnj> {
  return geste(id, 'rencontre', 'Première rencontre', seance, (p, rep) => rencontrer(p, rep, Date.now()), true);
}

/** Service rendu (17a) : un cran de mieux, avec le motif. */
export function rendreServicePnj(id: string, motif: string, seance?: string): Promise<Pnj> {
  if (!motif.trim()) throw new RefusAttitude('Dis quel service a été rendu.');
  return geste(id, 'service', motif, seance, (p) => rendreService(p, Date.now()));
}

/** Correction du MJ : un cran de plus ou de moins, avec le motif (jamais jusqu'à Allié). */
export function corrigerAttitudePnj(id: string, delta: 1 | -1, motif: string, seance?: string): Promise<Pnj> {
  if (!motif.trim()) throw new RefusAttitude('Dis pourquoi l’attitude change.');
  return geste(id, 'correction', motif, seance, (p) => corrigerCran(p, delta, Date.now()));
}

/** Un mensonge d'une scène passée est découvert (S2, 9a) : deux crans de moins, avec le motif. */
export function mensongeDecouvertPnj(id: string, motif: string, seance?: string): Promise<Pnj> {
  if (!motif.trim()) throw new RefusAttitude('Dis comment le mensonge a été découvert.');
  return geste(id, 'mensonge', motif, seance, (p) => decouvrirMensonge(p, Date.now()));
}

/** Le MJ ajuste la réputation du groupe auprès d'une faction (bornée à −10 et au plafond). */
export function ajusterReputation(faction: string, delta: number): Promise<number> {
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(refReputation());
    const rep = lu.exists() ? schemaReputationGroupe.parse(lu.data()) : null;
    const score = ajusterScore(rep, faction, delta);
    tx.set(refReputation(), schemaReputationGroupe.parse({ scores: { ...(rep?.scores ?? {}), [faction]: score }, majLe: Date.now() }));
    return score;
  });
}
