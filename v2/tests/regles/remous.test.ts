import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, increment, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du Remous du lieu (lot L6.7b, décisions de Thomas du 29/10/2026),
 * contre l'émulateur. Table « t1 » : Bob est MJ ; Alice (perso p1) et
 * Carol (perso p2) sont joueuses ; Dan est joueur sans personnage joué ;
 * Eve n'est pas de la table.
 *   - 5a : une jauge par scène, lue de toute la table ;
 *   - 6a : un joueur la nourrit, au nom de son personnage joué, de 1 à 60
 *     d'un coup ; il ne la baisse pas, ne touche pas à la membrane ;
 *   - 9a : le MJ en fait ce qu'il veut (vider, membrane, ±).
 */
const TABLE = 'tables/t1';
const R = `${TABLE}/remous/cave`;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1, persoActif: 'p1' });
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1, persoActif: 'p2' });
    await db.doc(`${TABLE}/joueurs/dan`).set({ nom: 'Dan', rejointLe: 1 });
  });
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const deposer = (d: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(R).set(d);
  });
/** Ce que fait alimenterRemous (src/lib/actions/remous.ts). */
const verser = (uid: string, n: number, qui: string) => {
  const db = pour(uid);
  return setDoc(doc(db, R), { total: increment(n), contributions: { [qui]: increment(n) }, majLe: 5 }, { merge: true });
};

describe('Remous du lieu (L6.7b)', () => {
  it('toute la table lit ; pas qui n’en est pas', async () => {
    await deposer({ total: 10, membrane: 'fine', contributions: { p1: 10 } });
    await assertSucceeds(pour('alice').doc(R).get());
    await assertSucceeds(pour('bob').doc(R).get());
    await assertSucceeds(pour('dan').doc(R).get());
    await assertFails(pour('eve').doc(R).get());
  });

  it('6a : un joueur crée la jauge en la nourrissant, au nom de son personnage joué', async () => {
    await assertSucceeds(verser('alice', 3, 'p1'));
    await assertSucceeds(verser('carol', 60, 'p2'));
    await assertSucceeds(verser('alice', 1, 'p1'));
  });

  it('6a : pas au nom d’un autre, ni de « mj », ni sans personnage joué ; ni 0, ni plus de 60, ni de quoi la baisser', async () => {
    await assertFails(verser('alice', 3, 'p2'));
    await assertFails(verser('alice', 3, 'mj'));
    await assertFails(verser('dan', 3, 'p3'));
    await assertFails(verser('eve', 3, 'p1'));
    await assertFails(verser('alice', 61, 'p1'));
    await assertFails(verser('alice', 0, 'p1'));
    await assertFails(verser('alice', -2, 'p1'));
    await deposer({ total: 10, membrane: 'epaisse', contributions: { p1: 10 } });
    await assertFails(verser('alice', 0, 'p1'));
    await assertFails(verser('alice', -1, 'p1'));
  });

  it('6a : le total et sa contribution montent d’autant ; rien d’autre ne bouge', async () => {
    await deposer({ total: 10, membrane: 'fine', contributions: { p1: 4, p2: 6 } });
    const db = pour('alice');
    await assertSucceeds(setDoc(doc(db, R), { total: 13, membrane: 'fine', contributions: { p1: 7, p2: 6 } }));
    await assertFails(setDoc(doc(db, R), { total: 16, membrane: 'fine', contributions: { p1: 9, p2: 6 } }));
    await assertFails(setDoc(doc(db, R), { total: 16, membrane: 'fine', contributions: { p1: 10, p2: 5 } }));
    await assertFails(setDoc(doc(db, R), { total: 16, membrane: 'fine', contributions: { p1: 7, p2: 9 } }));
    await assertFails(setDoc(doc(db, R), { total: 16, membrane: 'epaisse', contributions: { p1: 10, p2: 6 } }));
    await assertFails(setDoc(doc(db, R), { total: 0, membrane: 'fine', contributions: {} }));
    await assertFails(setDoc(doc(db, R), { total: 16, membrane: 'fine', contributions: { p1: 10, p2: 6 }, autre: 1 }));
    await assertFails(db.doc(R).delete());
  });

  it('6a : une jauge créée par un joueur n’a pas d’autre membrane qu’épaisse', async () => {
    const db = pour('alice');
    await assertFails(setDoc(doc(db, R), { total: 3, membrane: 'fine', contributions: { p1: 3 } }));
    await assertSucceeds(setDoc(doc(db, R), { total: 3, membrane: 'epaisse', contributions: { p1: 3 } }));
  });

  it('9a : le MJ vide, règle la membrane, corrige, nourrit au nom de « mj », retire ; dans le schéma seulement', async () => {
    await deposer({ total: 100, membrane: 'epaisse', contributions: { p1: 100 } });
    const db = pour('bob');
    await assertSucceeds(setDoc(doc(db, R), { total: 0, membrane: 'epaisse', contributions: {}, majLe: 1 }));
    await assertSucceeds(setDoc(doc(db, R), { total: 0, membrane: 'dechiree', contributions: {}, majLe: 2 }));
    await assertSucceeds(setDoc(doc(db, R), { total: 9999, membrane: 'dechiree', contributions: {} }));
    await assertSucceeds(verser('bob', 4, 'mj'));
    await assertFails(setDoc(doc(db, R), { total: 10000, membrane: 'fine', contributions: {} }));
    await assertFails(setDoc(doc(db, R), { total: -1, membrane: 'fine', contributions: {} }));
    await assertFails(setDoc(doc(db, R), { total: 1.5, membrane: 'fine', contributions: {} }));
    await assertFails(setDoc(doc(db, R), { total: 1, membrane: 'percee', contributions: {} }));
    await assertFails(setDoc(doc(db, R), { total: 1, membrane: 'fine' }));
    await assertFails(setDoc(doc(db, R), { total: 1, membrane: 'fine', contributions: [] }));
    await assertFails(setDoc(doc(db, R), { total: 1, membrane: 'fine', contributions: {}, majLe: 'hier' }));
    await assertFails(setDoc(doc(db, R), { total: 1, membrane: 'fine', contributions: {}, autre: true }));
    await assertSucceeds(db.doc(R).delete());
  });
});
