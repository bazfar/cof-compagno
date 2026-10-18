import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des séances (lot L3.1), contre l'émulateur.
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
    await db.doc(TABLE).set({ sceneActive: null });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const seance = (extra: Record<string, unknown> = {}) => ({ numero: 14, ouverteLe: 1, closeLe: null, presents: ['alice'], ...extra });

describe('séances (L3.1)', () => {
  it('le MJ ouvre une séance et la note dans la table, d’une seule écriture groupée', async () => {
    const db = pour('bob');
    const b = db.batch();
    b.set(db.doc(`${TABLE}/seances/s14`), seance());
    b.update(db.doc(TABLE), { seanceOuverte: { id: 's14', numero: 14 } });
    await assertSucceeds(b.commit());
  });

  it('toute la table la lit ; une joueuse ne l’ouvre, ne se coche, ni ne la clôt', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${TABLE}/seances/s14`).set(seance());
    });
    await assertSucceeds(pour('carol').doc(`${TABLE}/seances/s14`).get());
    await assertSucceeds(pour('carol').collection(`${TABLE}/seances`).get());
    await assertFails(pour('carol').doc(`${TABLE}/seances/s15`).set(seance({ numero: 15 })));
    await assertFails(pour('carol').doc(`${TABLE}/seances/s14`).update({ presents: ['alice', 'carol'] }));
    await assertFails(pour('alice').doc(`${TABLE}/seances/s14`).update({ closeLe: 2 }));
    await assertFails(pour('alice').doc(TABLE).update({ seanceOuverte: null }));
    await assertSucceeds(pour('bob').doc(`${TABLE}/seances/s14`).update({ presents: ['alice', 'carol'], closeLe: 2 }));
  });

  it('forme refusée : champ inconnu, numéro 0, présents en texte', async () => {
    await assertFails(pour('bob').doc(`${TABLE}/seances/s1`).set(seance({ titre: 'x' })));
    await assertFails(pour('bob').doc(`${TABLE}/seances/s1`).set(seance({ numero: 0 })));
    await assertFails(pour('bob').doc(`${TABLE}/seances/s1`).set(seance({ presents: 'alice' })));
  });

  it('un cran peut porter sa séance ; sous une autre forme, refusé', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${TABLE}/persos/p1`).set({ proprietaireUid: 'alice' });
    });
    const cran = (extra: Record<string, unknown>) => ({ barre: 'niveau', delta: 1, libelle: 'Le pont tenu', parUid: 'bob', creeLe: 1, ...extra });
    await assertSucceeds(pour('bob').doc(`${TABLE}/persos/p1/jalons/j1`).set(cran({ seance: 's14' })));
    await assertFails(pour('bob').doc(`${TABLE}/persos/p1/jalons/j2`).set(cran({ seance: 14 })));
  });
});
