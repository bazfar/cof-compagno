import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/client';
import { accorderNoeudV1, ajouterCranVecu, prendreNoeud, RefusVecu, retirerNoeud, type Vecu } from '../fiche/vecu';
import { schemaVecu } from '../schemas/fiche';
import { schemaJalon } from '../schemas/jalon';
import { session } from '../session.svelte';

/*
 * Écritures du Vécu (lot L4.18). Chaque geste est une TRANSACTION qui relit
 * le Vécu de la fiche avant de l'écrire : deux clics simultanés (le MJ et
 * le joueur) ne s'écrasent pas.
 *   - le MJ donne ou retire un cran (avec son jalon `vecu`, comme pour le
 *     niveau) ; il retire un nœud choisi ; il accorde un nœud de la v1 ;
 *   - le joueur prend un nœud, et reçoit son nœud offert s'il ne l'a pas.
 * Les règles Firestore bornent ce que le joueur écrit (decision 8a).
 */

export { RefusVecu };

const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

/** Lit le Vécu d'une fiche dans une transaction, applique le geste, et l'écrit. */
async function geste(idPerso: string, f: (v: Vecu, lu: { get: (champ: string) => unknown }) => { vecu: Vecu; autres?: Record<string, unknown>; jalon?: Record<string, unknown> }): Promise<Vecu> {
  const ref = refPerso(idPerso);
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(ref);
    if (!lu.exists()) throw new RefusVecu('Ce personnage n’existe plus.');
    const avant = schemaVecu.parse(lu.get('vecu'));
    const { vecu, autres, jalon } = f(avant, lu);
    const apres = schemaVecu.parse(vecu);
    if (jalon) tx.set(doc(collection(db, `tables/${session.table}/persos/${idPerso}/jalons`)), schemaJalon.parse(jalon));
    tx.update(ref, { vecu: apres, ...autres });
    return apres;
  });
}

/** Le MJ donne (+1) ou retire (−1) un cran de Vécu (décision 2a). */
export function donnerCranVecu(idPerso: string, delta: 1 | -1, libelle: string, seance?: string): Promise<Vecu> {
  return geste(idPerso, (v) => ({
    vecu: ajouterCranVecu(v, delta),
    jalon: { barre: 'vecu', delta, libelle: libelle.trim().slice(0, 80), parUid: session.uid, ...(seance ? { seance } : {}), creeLe: Date.now() },
  }));
}

/** Le joueur prend un nœud : un point dépensé. */
export function prendreNoeudVecu(idPerso: string, id: string): Promise<Vecu> {
  return geste(idPerso, (v) => ({ vecu: prendreNoeud(v, id) }));
}

/** Le nœud offert par la classe (4a), posé s'il manque encore. */
export function poserNoeudOffert(idPerso: string, id: string): Promise<Vecu> {
  return geste(idPerso, (v) => {
    if (v.noeudOffert) throw new RefusVecu('Le nœud offert est déjà posé.');
    return { vecu: { ...v, noeudOffert: id } };
  });
}

/** Le MJ retire un nœud choisi : son point revient (3a). */
export function retirerNoeudVecu(idPerso: string, id: string): Promise<Vecu> {
  return geste(idPerso, (v) => ({ vecu: retirerNoeud(v, id) }));
}

/** Le MJ accorde un nœud de la v1 (5a) : un palier et le nœud ; il quitte la liste des nœuds à accorder. */
export function accorderVecuV1(idPerso: string, id: string): Promise<Vecu> {
  return geste(idPerso, (v, lu) => {
    const enAttente = lu.get('octrois.vecuV1');
    const liste = Array.isArray(enAttente) ? (enAttente as string[]) : [];
    if (!liste.includes(id)) throw new RefusVecu('Ce nœud n’est pas à accorder.');
    return { vecu: accorderNoeudV1(v, id), autres: { 'octrois.vecuV1': liste.filter((x) => x !== id) } };
  });
}
