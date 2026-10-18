import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/client';
import { appliquerMontee, RefusMontee, type Montee, type MonteeAppliquee } from '../regles/montee';
import { schemaFiche } from '../schemas/fiche';
import { session } from '../session.svelte';

/*
 * Montée de niveau (lot L2.5b). Une TRANSACTION relit la fiche, y rejoue
 * les choix du joueur (regles/montee.ts) et écrit en une fois le niveau,
 * les choix ajoutés, les PV et PP, et les crans dépensés. Deux clics, ou un
 * cran retiré entre-temps : la seconde écriture est refusée, jamais deux
 * niveaux pour une barre.
 *
 * Module à part de actions/progression.ts : les règles de la montée tirent
 * les données de règles, que la vue du groupe n'a pas à charger pour donner
 * un cran.
 */

export async function monterNiveau(idPerso: string, m: Montee): Promise<MonteeAppliquee> {
  const ref = doc(db, `tables/${session.table}/persos/${idPerso}`);
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(ref);
    if (!lu.exists()) throw new RefusMontee('Ce personnage n’existe plus.');
    const r = appliquerMontee(schemaFiche.parse(lu.data()), m);
    tx.update(ref, { ...r.champs, 'progression.crans': r.fiche.progression.crans });
    return r;
  });
}
