import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/client';
import { appliquerChangements } from '../combat/changements';
import { passifsDeclenches, type EvenementPassif } from '../combat/passifs';
import { CATALOGUE, lanceurDe } from '../combat/sorts';
import { resoudreLancer } from '../effets/resolution';
import type { Combattant } from '../schemas/combat';
import type { Fiche, FicheV2 } from '../schemas/fiche';
import { session } from '../session.svelte';
import { noterJet } from './journal';

/*
 * Les passifs déclenchés en combat (lot L6.5a, décision 12a de Thomas du
 * 26/10/2026) : le client de celui qui abat l'ennemi les joue d'office,
 * avec le moteur, sur son personnage ; au journal. Le texte qui ne fait
 * que dire leur condition n'y est pas répété.
 */

type AvecId<T> = T & { id: string };

const refCombattant = (idCombat: string, c: string) => doc(db, `tables/${session.table}/combats/${idCombat}/combattants/${c}`);
const refPerso = (id: string) => doc(db, `tables/${session.table}/persos/${id}`);

/** Les passifs que l'événement déclenche, joués sur le personnage ; rend leur nombre. `pvActuel` : ses PV après le coup (le coût d'un sort de sang). */
export async function jouerPassifs(
  idCombat: string,
  moi: AvecId<Combattant>,
  fiche: AvecId<Fiche>,
  e: EvenementPassif,
  pvActuel: number | null = null,
  alea: () => number = Math.random,
): Promise<number> {
  let n = 0;
  for (const a of passifsDeclenches(fiche, e)) {
    // passifsDeclenches ne rend rien pour une fiche v1.
    const lanceur = lanceurDe(fiche as AvecId<FicheV2>, moi);
    const r = resoudreLancer({ action: a, palier: 'I', lanceur, cibles: [{ ...lanceur, distance: 0 }], alea }, CATALOGUE);
    if (!r.ok) continue;
    const ecr = appliquerChangements(
      r.changements.filter((c) => c.type !== 'narratif'),
      new Map([[moi.id, { c: moi, fiche }]]),
      { id: moi.id, nom: fiche.nom, fiche },
      pvActuel !== null ? { pv: new Map([[fiche.id, pvActuel]]) } : {},
    );
    const lot = writeBatch(db);
    for (const [id, m] of ecr.fiches) lot.update(refPerso(id), m);
    for (const [id, m] of ecr.combattants) lot.update(refCombattant(idCombat, id), m);
    await lot.commit();
    if (pvActuel !== null && ecr.fiches.get(fiche.id)?.pvActuel !== undefined) pvActuel = ecr.fiches.get(fiche.id)!.pvActuel as number;
    await noterJet(a.nom, '0', { des: [], faces: 0, bonus: 0, total: 0 }, fiche.nom, [...(ecr.lignes.get(moi.id) ?? []), ...ecr.auMj.map((x) => `MJ : ${x}`)].join(' ; ') || a.description);
    n++;
  }
  return n;
}
