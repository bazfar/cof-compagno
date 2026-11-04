import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du repos (lot L7.1a, décisions de Thomas du 29/10/2026), contre
 * l'émulateur. Table « t1 » : Bob est MJ ; Alice possède le personnage p1,
 * Carol le p2 ; Eve n'est pas de la table.
 *   - 4b : le MJ ouvre un jet de repos ; le propriétaire du personnage le
 *     retire en le lançant ; personne d'autre ;
 *   - 5b : les repos courts de chacun, tenus par le MJ seul.
 */
const TABLE = 'tables/t1';
const A1 = `${TABLE}/reposEnAttente/p1`;
const ETAT = `${TABLE}/repos/etat`;
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
    await db.doc(`${TABLE}/persos/p1`).set({ proprietaireUid: 'alice' });
    await db.doc(`${TABLE}/persos/p2`).set({ proprietaireUid: 'carol' });
  });
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const attente = (x: Record<string, unknown> = {}) => ({ nom: 'Orel', quoi: 'long', formule: '6d10+1d8+2', creeLe: 1, ...x });
const deposer = (chemin: string, d: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(chemin).set(d);
  });

describe('repos (L7.1a)', () => {
  it('toute la table lit les jets qui attendent et les repos courts ; pas qui n’en est pas', async () => {
    await deposer(A1, attente());
    await deposer(ETAT, { courts: { p1: 1 }, majLe: 1 });
    await assertSucceeds(pour('alice').doc(A1).get());
    await assertSucceeds(pour('carol').doc(A1).get());
    await assertSucceeds(pour('bob').doc(ETAT).get());
    await assertSucceeds(pour('carol').doc(ETAT).get());
    await assertFails(pour('eve').doc(A1).get());
    await assertFails(pour('eve').doc(ETAT).get());
  });

  it('4b : le MJ ouvre un jet, dans le schéma seulement', async () => {
    const mj = pour('bob');
    await assertSucceeds(mj.doc(A1).set(attente()));
    await assertSucceeds(mj.doc(A1).set(attente({ quoi: 'court', formule: '1d4' })));
    await assertSucceeds(mj.doc(A1).set(attente({ formule: '3d8-1' })));
    await assertFails(mj.doc(A1).set(attente({ formule: '1d4*9' })));
    await assertFails(mj.doc(A1).set(attente({ formule: '100d4' })));
    await assertFails(mj.doc(A1).set(attente({ quoi: 'nuit' })));
    await assertFails(mj.doc(A1).set(attente({ nom: '' })));
    await assertFails(mj.doc(A1).set(attente({ creeLe: -1 })));
    await assertFails(mj.doc(A1).set(attente({ autre: true })));
    const { formule: _f, ...sansFormule } = attente();
    await assertFails(mj.doc(A1).set(sansFormule));
  });

  it('4b : un joueur n’ouvre ni ne change un jet ; le propriétaire le retire, pas un autre joueur ; le MJ aussi', async () => {
    await assertFails(pour('alice').doc(A1).set(attente()));
    await deposer(A1, attente());
    await assertFails(pour('alice').doc(A1).update({ formule: '12d10+1d8+20' }));
    await assertFails(pour('carol').doc(A1).delete());
    await assertFails(pour('eve').doc(A1).delete());
    await assertSucceeds(pour('alice').doc(A1).delete());
    await deposer(A1, attente());
    await assertSucceeds(pour('bob').doc(A1).delete());
  });

  it('5b : le MJ tient les repos courts, dans `repos/etat` seulement ; un joueur, non', async () => {
    const mj = pour('bob');
    await assertSucceeds(mj.doc(ETAT).set({ courts: { p1: 2, p2: 0 }, majLe: 5 }));
    await assertSucceeds(mj.doc(ETAT).set({ courts: {}, majLe: 6 }));
    await assertFails(mj.doc(`${TABLE}/repos/autre`).set({ courts: {}, majLe: 6 }));
    await assertFails(mj.doc(ETAT).set({ courts: [], majLe: 6 }));
    await assertFails(mj.doc(ETAT).set({ courts: {} }));
    await assertFails(mj.doc(ETAT).set({ courts: {}, majLe: 'hier' }));
    await assertFails(mj.doc(ETAT).set({ courts: {}, majLe: 6, autre: 1 }));
    await assertFails(pour('alice').doc(ETAT).set({ courts: { p1: 0 }, majLe: 7 }));
    await assertFails(pour('alice').doc(ETAT).delete());
    await assertSucceeds(mj.doc(ETAT).delete());
  });
});
