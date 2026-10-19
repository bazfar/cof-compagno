import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des rencontres préparées (lot L3.5), contre l'émulateur.
 * Table « t1 » : Bob est MJ, Alice est joueuse.
 */
const TABLE = 'tables/t1';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1 });
    await db.doc(TABLE).set({ sceneActive: null });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const rencontre = (extra: Record<string, unknown> = {}) => ({
  nom: 'Embuscade au pont',
  scene: 'clos',
  monstres: [{ cle: 'rat-1', monstre: 'rat', nom: 'Rat', cx: 3, cy: 4 }],
  butin: [{ objet: 'potion_soin', combien: 2 }],
  statut: 'preparee',
  creeLe: 1,
  majLe: 1,
  lanceeLe: null,
  butinEnvoyeLe: null,
  ...extra,
});

describe('rencontres (L3.5)', () => {
  it('le MJ seul les lit et les écrit ; une joueuse ne voit rien, pas même par requête', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/rencontres/r1`).set(rencontre()));
    await assertSucceeds(pour('bob').collection(`${TABLE}/rencontres`).get());
    await assertFails(pour('alice').doc(`${TABLE}/rencontres/r1`).get());
    await assertFails(pour('alice').collection(`${TABLE}/rencontres`).get());
    await assertFails(pour('alice').doc(`${TABLE}/rencontres/r2`).set(rencontre()));
    await assertFails(pour('alice').doc(`${TABLE}/rencontres/r1`).delete());
    await assertSucceeds(pour('bob').doc(`${TABLE}/rencontres/r1`).delete());
  });

  it('forme refusée : champ inconnu, statut inventé, nom vide', async () => {
    await assertFails(pour('bob').doc(`${TABLE}/rencontres/r1`).set(rencontre({ id: 'r1' })));
    await assertFails(pour('bob').doc(`${TABLE}/rencontres/r1`).set(rencontre({ statut: 'finie' })));
    await assertFails(pour('bob').doc(`${TABLE}/rencontres/r1`).set(rencontre({ nom: '' })));
  });

  it('lancer : huit jetons de monstre en une écriture groupée, puis la scène montrée et le statut', async () => {
    const db = pour('bob');
    const lot = db.batch();
    for (let i = 1; i <= 8; i++) {
      lot.set(db.doc(`${TABLE}/scenes/clos/jetons/m-r1-rat-${i}`), { genre: 'monstre', nom: `Rat ${i}`, couleur: '#c0392b', cx: i, cy: 2, proprietaire: null, creeLe: 1 });
    }
    await assertSucceeds(lot.commit());
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${TABLE}/rencontres/r1`).set(rencontre());
    });
    const fin = db.batch();
    fin.set(db.doc(TABLE), { sceneActive: 'clos' }, { merge: true });
    fin.update(db.doc(`${TABLE}/rencontres/r1`), { statut: 'lancee', lanceeLe: 2 });
    await assertSucceeds(fin.commit());
  });
});
