import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Tests des règles contre l'émulateur Firestore (npm run test:regles).
 * Chaque test pose une table « t1 » dont le code MJ est « dragon ».
 * L'API utilisée est celle renvoyée par rules-unit-testing (style compat).
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
    await ctx.firestore().doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pourAlice = () => env.authenticatedContext('alice').firestore();
const pourBob = () => env.authenticatedContext('bob').firestore();
const pourAnonyme = () => env.unauthenticatedContext().firestore();

async function aliceEstJoueuse(): Promise<void> {
  await pourAlice().doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1 });
}
async function bobEstMj(): Promise<void> {
  await pourBob().doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
}

describe('v1 : sessions/** reste ouvert tant que la v1 tourne', () => {
  it('lecture et écriture sans connexion', async () => {
    const db = pourAnonyme();
    await assertSucceeds(db.doc('sessions/table-arbre-monde/cof_persos/x').set({ nom: 'X' }));
    await assertSucceeds(db.doc('sessions/table-arbre-monde/cof_persos/x').get());
  });
});

describe('secret', () => {
  it('le code MJ est illisible, même pour un MJ', async () => {
    await bobEstMj();
    await assertFails(pourBob().doc(`${TABLE}/secret/codeMj`).get());
    await assertFails(pourAnonyme().doc(`${TABLE}/secret/codeMj`).get());
  });
});

describe('joueurs', () => {
  it('on rejoint la table pour soi-même', async () => {
    await assertSucceeds(pourAlice().doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1 }));
  });

  it("on ne peut pas inscrire quelqu'un d'autre", async () => {
    await assertFails(pourAlice().doc(`${TABLE}/joueurs/bob`).set({ nom: 'Bob', rejointLe: 1 }));
  });

  it('sans connexion, rien', async () => {
    await assertFails(pourAnonyme().doc(`${TABLE}/joueurs/x`).set({ nom: 'X', rejointLe: 1 }));
  });

  it('les champs inconnus et les noms vides sont refusés', async () => {
    await assertFails(pourAlice().doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1, admin: true }));
    await assertFails(pourAlice().doc(`${TABLE}/joueurs/alice`).set({ nom: '', rejointLe: 1 }));
  });

  it('seul un membre voit la liste des joueurs', async () => {
    await aliceEstJoueuse();
    await assertSucceeds(pourAlice().collection(`${TABLE}/joueurs`).get());
    await assertFails(pourBob().collection(`${TABLE}/joueurs`).get());
  });
});

describe('mjs', () => {
  it('le bon code fait un MJ', async () => {
    await assertSucceeds(
      pourBob().doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 }),
    );
  });

  it('un mauvais code est refusé', async () => {
    await assertFails(pourBob().doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'gobelin', rejointLe: 1 }));
  });

  it('une table sans code MJ refuse tout le monde', async () => {
    await assertFails(
      pourBob().doc('tables/sans-code/mjs/bob').set({ nom: 'Bob', code: 'dragon', rejointLe: 1 }),
    );
  });

  it("un MJ ne peut pas modifier son entrée (pas d'élévation déguisée)", async () => {
    await bobEstMj();
    await assertFails(pourBob().doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob2', code: 'dragon', rejointLe: 2 }));
  });

  it('le MJ voit les joueurs et peut en retirer un', async () => {
    await aliceEstJoueuse();
    await bobEstMj();
    await assertSucceeds(pourBob().collection(`${TABLE}/joueurs`).get());
    await assertSucceeds(pourBob().doc(`${TABLE}/joueurs/alice`).delete());
  });

  it('un joueur ne peut pas retirer un autre joueur', async () => {
    await aliceEstJoueuse();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1 });
    });
    await assertFails(pourAlice().doc(`${TABLE}/joueurs/carol`).delete());
  });
});

describe('document de table', () => {
  it('seul le MJ écrit sur la table', async () => {
    await aliceEstJoueuse();
    await bobEstMj();
    await assertFails(pourAlice().doc(TABLE).set({ nom: 'Arbre-Monde' }));
    await assertSucceeds(pourBob().doc(TABLE).set({ nom: 'Arbre-Monde' }));
  });
});

describe('collections non ouvertes', () => {
  it('tout le reste est refusé, même au MJ', async () => {
    await bobEstMj();
    await assertFails(pourBob().doc(`${TABLE}/persos/p1`).set({ nom: 'Shyrion' }));
  });
});
