import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { versFirestore } from '../regles/fiche-document';
import { db } from '../firebase/client';
import { LIMITE_NOTES, schemaFiche, type Fiche } from '../schemas/fiche';
import { schemaPortrait } from '../schemas/portrait';
import { session } from '../session.svelte';

/*
 * Écritures des fiches de personnage (lot L2.1). Seul endroit qui écrit
 * dans tables/{table}/persos. Chaque action ne touche que les champs
 * concernés : jamais de réécriture de la fiche entière après sa création
 * (c'est ce qui effaçait des champs en v1, via versJSON).
 *
 * Les écrans de L2.2 à L2.5 ajouteront leurs actions ici (équiper,
 * inventaire, montée de niveau…), toujours champ par champ. Les crans de
 * progression et de Vécu passeront par une transaction (le document du
 * cran et le compte de la fiche ensemble), en L2.5.
 */

const cheminPerso = (id: string) => `tables/${session.table}/persos/${id}`;

/** Message lisible pour une écriture de fiche refusée. */
export function messageErreurPerso(erreur: unknown): string {
  if (typeof erreur === 'object' && erreur !== null && 'code' in erreur && erreur.code === 'permission-denied') {
    return "Action refusée : tu n'as pas le droit de faire ça.";
  }
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Identifiant d'un nouveau personnage. */
export function nouvelIdPerso(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Crée une fiche (assistant de création L2.2, ou import d'une fiche v1).
 * La seule écriture de fiche entière : elle passe par le schéma et par
 * versFirestore, qui refusent un champ inconnu ou une forme que Firestore
 * ne sait pas stocker.
 */
export async function creerPerso(id: string, fiche: Fiche): Promise<void> {
  await setDoc(doc(db, cheminPerso(id)), versFirestore(schemaFiche.parse(fiche)));
}

/** Points de vie actuels (bornés à 0 et au maximum de la fiche). */
export async function modifierPV(id: string, pvActuel: number, pvMax: number): Promise<void> {
  await updateDoc(doc(db, cheminPerso(id)), { pvActuel: Math.max(0, Math.min(pvMax, Math.round(pvActuel))) });
}

/** Bourse : seules les pièces changent. */
export async function modifierPieces(id: string, pieces: { piecesOr: number; piecesArgent: number; piecesBronze: number }): Promise<void> {
  const positif = (n: number) => Math.max(0, Math.round(n));
  await updateDoc(doc(db, cheminPerso(id)), {
    piecesOr: positif(pieces.piecesOr),
    piecesArgent: positif(pieces.piecesArgent),
    piecesBronze: positif(pieces.piecesBronze),
  });
}

/** Points de pouvoir actuels (bornés à 0 et au maximum calculé). */
export async function modifierPP(id: string, ppActuel: number, ppMax: number): Promise<void> {
  await updateDoc(doc(db, cheminPerso(id)), { ppActuel: Math.max(0, Math.min(ppMax, Math.round(ppActuel))) });
}

/** Notes libres (L2.3) : seul le champ `notes`, tronqué à la limite du schéma. */
export async function modifierNotes(id: string, notes: string): Promise<void> {
  await updateDoc(doc(db, cheminPerso(id)), { notes: notes.slice(0, LIMITE_NOTES) });
}

/** Portrait (L2.3) : son propre document, jamais la fiche. */
export async function enregistrerPortrait(id: string, image: string): Promise<void> {
  await setDoc(doc(db, `${cheminPerso(id)}/images/portrait`), schemaPortrait.parse({ image, majLe: Date.now() }));
}

export async function retirerPortrait(id: string): Promise<void> {
  await deleteDoc(doc(db, `${cheminPerso(id)}/images/portrait`));
}

/**
 * Personnage actif du joueur connecté (décision 2a : plusieurs personnages
 * par joueur, un seul joué à la fois). Champ déjà prévu dans joueurs/{uid}.
 */
export async function choisirPersoActif(idPerso: string): Promise<void> {
  await updateDoc(doc(db, `tables/${session.table}/joueurs/${session.uid}`), { persoActif: idPerso });
}
