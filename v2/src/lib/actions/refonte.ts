import { deleteField, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import { champsDeConversion, convertirFiche, refaireVoies } from '../fiche/refonte';
import { versFirestore } from '../regles/fiche-document';
import { RefusCreation } from '../regles/creation';
import { schemaFiche, schemaOctrois, type FicheV2, type Octrois, type RefonteFiche } from '../schemas/fiche';
import { session } from '../session.svelte';

/*
 * Écritures de la refonte sur une fiche (lot L4.11b). Module à part de
 * actions/persos.ts : la conversion tire les règles de la refonte
 * (src/regles), que les autres écrans n'ont pas à charger.
 *
 *   - convertirPerso : le joueur passe sa fiche v1 à la refonte (4a), une
 *     TRANSACTION relit la fiche, la convertit (lib/fiche/refonte.ts) et
 *     écrit le bloc `refonte`, les `octrois` et la version, en retirant les
 *     champs propres à la v1 (deleteField) ;
 *   - refaireVoiesPerso : le joueur refait ses voies quand le MJ a rouvert
 *     la conversion (5a), dans une transaction aussi : jauges relues gardées ;
 *   - modifierOctrois : le MJ ouvre la Voie du chaos, accorde éléments et
 *     verbes, rouvre la conversion (5a, 6a, 7a, 12a). Les règles Firestore
 *     n'autorisent ce champ qu'au MJ (hors conversion du joueur).
 */

const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

/** Conversion v1 → refonte, avec les choix du joueur. */
export async function convertirPerso(id: string, r: RefonteFiche): Promise<FicheV2> {
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(refPerso(id));
    if (!lu.exists()) throw new RefusCreation('Ce personnage n’existe plus.');
    const f = schemaFiche.parse(lu.data());
    if (f.schemaVersion !== 1) throw new RefusCreation('Ce personnage est déjà passé à la refonte.');
    const v2 = convertirFiche(f, r);
    const { aEcrire, aRetirer } = champsDeConversion(v2);
    tx.update(refPerso(id), {
      ...(versFirestore(aEcrire) as Record<string, unknown>),
      ...Object.fromEntries(aRetirer.map((k) => [k, deleteField()])),
    });
    return v2;
  });
}

/** Refaire ses voies (reconversion rouverte par le MJ) : seuls `refonte` et `octrois.reconversion` changent. */
export async function refaireVoiesPerso(id: string, r: RefonteFiche): Promise<FicheV2> {
  return runTransaction(db, async (tx) => {
    const lu = await tx.get(refPerso(id));
    if (!lu.exists()) throw new RefusCreation('Ce personnage n’existe plus.');
    const f = schemaFiche.parse(lu.data());
    if (f.schemaVersion !== 2) throw new RefusCreation('Ce personnage n’est pas passé à la refonte.');
    const v2 = refaireVoies(f, r);
    tx.update(refPerso(id), { refonte: versFirestore(v2.refonte), 'octrois.reconversion': false });
    return v2;
  });
}

/** MJ : les octrois d'un personnage de la refonte, écrits en entier (validés par le schéma). */
export async function modifierOctrois(id: string, octrois: Octrois): Promise<void> {
  await updateDoc(refPerso(id), { octrois: versFirestore(schemaOctrois.parse(octrois)) });
}
