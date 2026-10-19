import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { idJetonRencontre, manquePourLancer, nouvelIdRencontre } from '../rencontres/rencontre';
import { schemaJeton } from '../schemas/carte';
import { schemaRencontre, type BrouillonRencontre, type Rencontre } from '../schemas/rencontre';
import { session } from '../session.svelte';
import { mettreAuVote } from './butin';

/*
 * Rencontres préparées (lot L3.5). Seul endroit qui écrit dans
 * tables/{table}/rencontres (le MJ seul, règles Firestore).
 *
 * Lancer une rencontre pose ses monstres sur leur scène, là où le MJ les a
 * placés, puis montre la scène à la table. Les jetons d'abord, par petits
 * lots (chaque écriture groupée reste sous les limites des règles), la
 * scène montrée et le statut ensuite : les joueurs ne voient jamais une
 * scène à moitié peuplée. Relancer repose les mêmes jetons (mêmes
 * identifiants), sans doublon.
 */

export class RefusRencontre extends Error {}

/** Couleur des jetons de monstre (la même que « + Monstre » sur la carte). */
export const COULEUR_MONSTRE = '#c0392b';
const PAR_LOT = 8;

const refRencontre = (id: string) => doc(db, `tables/${session.table}/rencontres/${id}`);

/** Crée une rencontre vide ; rend son identifiant. */
export async function creerRencontre(nom: string): Promise<string> {
  const id = nouvelIdRencontre();
  const maintenant = Date.now();
  const r = schemaRencontre.parse({ nom, scene: null, monstres: [], butin: [], statut: 'preparee', creeLe: maintenant, majLe: maintenant, lanceeLe: null, butinEnvoyeLe: null });
  await setDoc(refRencontre(id), r);
  return id;
}

/** Enregistre le brouillon (nom, scène, monstres placés, butin prévu). */
export async function enregistrerRencontre(id: string, avant: Rencontre, b: BrouillonRencontre): Promise<void> {
  const { statut, creeLe, lanceeLe, butinEnvoyeLe } = avant; // pas l'`id` du magasin : il n'est pas un champ du document
  const r = schemaRencontre.parse({ nom: b.nom, scene: b.scene, monstres: b.monstres, butin: b.butin, statut, creeLe, lanceeLe, butinEnvoyeLe, majLe: Date.now() });
  await setDoc(refRencontre(id), r);
}

/** Pose les monstres sur la scène et la montre à la table. */
export async function lancerRencontre(id: string, r: Rencontre): Promise<number> {
  const manque = manquePourLancer(r);
  if (manque || !r.scene) throw new RefusRencontre(manque ?? 'Choisis une scène.');
  const scene = r.scene;
  const maintenant = Date.now();
  for (let i = 0; i < r.monstres.length; i += PAR_LOT) {
    const lot = writeBatch(db);
    for (const m of r.monstres.slice(i, i + PAR_LOT)) {
      const jeton = schemaJeton.parse({ genre: 'monstre', nom: m.nom, couleur: COULEUR_MONSTRE, cx: m.cx, cy: m.cy, proprietaire: null, creeLe: maintenant });
      lot.set(doc(db, `tables/${session.table}/scenes/${scene}/jetons/${idJetonRencontre(id, m.cle)}`), jeton);
    }
    await lot.commit();
  }
  const fin = writeBatch(db);
  fin.set(doc(db, 'tables', session.table), { sceneActive: scene }, { merge: true });
  fin.update(refRencontre(id), { statut: 'lancee', lanceeLe: maintenant });
  await fin.commit();
  return r.monstres.length;
}

/** Envoie le butin prévu au vote (L3.4) et le note dans la rencontre. Rend le nombre d'objets mis au vote. */
export async function envoyerButin(id: string, r: Rencontre): Promise<number> {
  if (!r.butin.length) throw new RefusRencontre('Aucun butin prévu pour cette rencontre.');
  let n = 0;
  for (const b of r.butin) n += await mettreAuVote(b.objet, b.combien);
  await setDoc(refRencontre(id), { butinEnvoyeLe: Date.now() }, { merge: true });
  return n;
}

export async function supprimerRencontre(id: string): Promise<void> {
  await deleteDoc(refRencontre(id));
}
