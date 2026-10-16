import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des fiches v1 déposées par le MJ (lot L2.2c), contre l'émulateur.
 * Table « t1 » : Bob est MJ, Alice et Carol sont joueuses.
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
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const depot = (proprietaireUid: string, extra: Record<string, unknown> = {}) => ({
  proprietaireUid, nom: 'Shyrion', importeLe: 1, v1Json: '{"nom":"Shyrion"}', ...extra,
});
async function poser(id: string, donnees: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/importsV1/${id}`).set(donnees);
  });
}

describe('fiches v1 déposées (L2.2c)', () => {
  it('seul le MJ dépose et retire une fiche', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/importsV1/i1`).set(depot('alice')));
    await assertFails(pour('alice').doc(`${TABLE}/importsV1/i2`).set(depot('alice')));
    await assertFails(pour('alice').doc(`${TABLE}/importsV1/i1`).delete());
    await assertSucceeds(pour('bob').doc(`${TABLE}/importsV1/i1`).delete());
  });

  it('une joueuse ne lit que les fiches qui lui sont attribuées, y compris par requête filtrée', async () => {
    await poser('i1', depot('alice'));
    await poser('i2', depot('carol'));
    await assertSucceeds(pour('alice').doc(`${TABLE}/importsV1/i1`).get());
    await assertFails(pour('alice').doc(`${TABLE}/importsV1/i2`).get());
    await assertSucceeds(pour('alice').collection(`${TABLE}/importsV1`).where('proprietaireUid', '==', 'alice').get());
    await assertFails(pour('alice').collection(`${TABLE}/importsV1`).get());
  });

  it('elle note une seule fois le personnage qui en est né, sans rien toucher d’autre', async () => {
    await poser('i1', depot('alice'));
    await assertFails(pour('alice').doc(`${TABLE}/importsV1/i1`).update({ v1Json: '{}' }));
    await assertFails(pour('carol').doc(`${TABLE}/importsV1/i1`).update({ reprisPar: 'p-x' }));
    await assertSucceeds(pour('alice').doc(`${TABLE}/importsV1/i1`).update({ reprisPar: 'p-1' }));
    await assertFails(pour('alice').doc(`${TABLE}/importsV1/i1`).update({ reprisPar: 'p-2' }));
  });

  it('forme refusée : champ inconnu, texte trop long', async () => {
    await assertFails(pour('bob').doc(`${TABLE}/importsV1/i1`).set(depot('alice', { portrait: 'x' })));
    await assertFails(pour('bob').doc(`${TABLE}/importsV1/i1`).set(depot('alice', { v1Json: 'x'.repeat(900001) })));
  });
});
