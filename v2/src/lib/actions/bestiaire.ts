import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { versDocument } from '../bestiaire/bestiaire';
import { db } from '../firebase/client';
import { schemaMonstre, schemaMonstreEnBase, type ExportBestiaire, type Monstre, type MonstreEnBase } from '../schemas/bestiaire';
import { session } from '../session.svelte';

/*
 * Bestiaire du MJ (lot L3.2). Seul endroit qui écrit dans
 * tables/{table}/bestiaire et bestiaireDonnees. Chaque monstre passe par
 * schemaMonstre avant d'être écrit : un monstre que la 2.0 ne saurait pas
 * relire n'entre pas en base.
 */

const chemin = (id: string) => `tables/${session.table}/bestiaire/${id}`;
const cheminDonnees = (id: 'armes' | 'armures' | 'equilibrage') => `tables/${session.table}/bestiaireDonnees/${id}`;

/** 500 opérations par écriture groupée : on reste large. */
const PAR_LOT = 400;

/**
 * MJ : importe l'export du bestiaire. Un monstre déjà en base (même id) est
 * gardé tel quel : réimporter ne défait jamais une surcharge. Les listes
 * de référence (armes, armures, équilibrage) sont remplacées : elles ne
 * se modifient pas dans l'app.
 */
export async function importerBestiaire(e: ExportBestiaire, presents: ReadonlySet<string>): Promise<{ importes: number; gardes: number }> {
  const maintenant = Date.now();
  const nouveaux = e.monstres.filter((m) => !presents.has(m.id));
  const premier = writeBatch(db);
  premier.set(doc(db, cheminDonnees('armes')), { liste: e.armes });
  premier.set(doc(db, cheminDonnees('armures')), { liste: e.armures });
  premier.set(doc(db, cheminDonnees('equilibrage')), e.equilibrage);
  await premier.commit();
  for (let i = 0; i < nouveaux.length; i += PAR_LOT) {
    const lot = writeBatch(db);
    for (const m of nouveaux.slice(i, i + PAR_LOT)) lot.set(doc(db, chemin(m.id)), schemaMonstreEnBase.parse(versDocument(m, 'v1', maintenant)));
    await lot.commit();
  }
  return { importes: nouveaux.length, gardes: e.monstres.length - nouveaux.length };
}

/** MJ : enregistre un monstre (surcharge d'un monstre v1, ou créature du MJ). */
export async function enregistrerMonstre(m: Monstre, origine: MonstreEnBase['origine']): Promise<void> {
  const valide = schemaMonstre.parse(m);
  await setDoc(doc(db, chemin(valide.id)), schemaMonstreEnBase.parse(versDocument(valide, origine, Date.now())));
}

export async function supprimerMonstre(id: string): Promise<void> {
  await deleteDoc(doc(db, chemin(id)));
}
