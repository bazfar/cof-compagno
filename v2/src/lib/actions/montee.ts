import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/client';
import { appliquerMonteeRefonte, RefusMontee, type MonteeRefonte, type MonteeRefonteAppliquee } from '../fiche/montee-refonte';
import { schemaFiche } from '../schemas/fiche';
import { session } from '../session.svelte';

/*
 * Montée de niveau (lot L2.5b). Une TRANSACTION relit la fiche, y rejoue
 * les choix du joueur (lib/fiche/montee-refonte.ts) et écrit en une fois le niveau,
 * les choix ajoutés, les PV et PP, et les crans dépensés. Deux clics, ou un
 * cran retiré entre-temps : la seconde écriture est refusée, jamais deux
 * niveaux pour une barre.
 *
 * Module à part de actions/progression.ts : les règles de la montée tirent
 * les données de règles, que la vue du groupe n'a pas à charger pour donner
 * un cran.
 *
 * Lot L6.7a (12b, décision de Thomas du 29/10/2026) : la montée v1
 * (regles/montee.ts, MonteeNiveau) est retirée ; une fiche v1 passe
 * d'abord à la refonte.
 */

/** Montée d'un personnage de la refonte (L4.11b) : même transaction, règles de lib/fiche/montee-refonte.ts. */
export async function monterNiveauRefonte(idPerso: string, m: MonteeRefonte): Promise<MonteeRefonteAppliquee> {
  const ref = doc(db, `tables/${session.table}/persos/${idPerso}`);
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(ref);
    if (!lu.exists()) throw new RefusMontee('Ce personnage n’existe plus.');
    const r = appliquerMonteeRefonte(schemaFiche.parse(lu.data()), m);
    tx.update(ref, { ...r.champs, 'progression.crans': r.fiche.progression.crans });
    return r;
  });
}
