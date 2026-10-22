import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des PNJ et de la réputation (lot S1, décisions du 22/10/2026),
 * contre l'émulateur. Table « t1 » : Bob est MJ, Alice est joueuse.
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
const pnj = (extra: Record<string, unknown> = {}) => ({
  nom: 'Selyne',
  faction: 'comptoir',
  lore: 'pnj-selyne',
  rencontre: false,
  cran: null,
  tendance: null,
  creeLe: 1,
  majLe: 1,
  ...extra,
});
const geste = (uid: string, extra: Record<string, unknown> = {}) => ({
  geste: 'service',
  avant: 'favorable',
  apres: 'allie',
  motif: 'Dette payée',
  parUid: uid,
  creeLe: 1,
  ...extra,
});

async function poser(chemin: string, donnees: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(chemin).set(donnees);
  });
}

describe('PNJ (S1)', () => {
  it('le MJ les écrit ; une joueuse ne peut ni créer, ni changer, ni retirer', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/pnj/selyne`).set(pnj()));
    await assertSucceeds(pour('bob').doc(`${TABLE}/pnj/selyne`).set(pnj({ rencontre: true, cran: 'connaissance' })));
    await assertFails(pour('alice').doc(`${TABLE}/pnj/autre`).set(pnj()));
    await assertFails(pour('alice').doc(`${TABLE}/pnj/selyne`).set(pnj({ rencontre: true, cran: 'allie' })));
    await assertFails(pour('alice').doc(`${TABLE}/pnj/selyne`).delete());
    await assertSucceeds(pour('bob').doc(`${TABLE}/pnj/selyne`).delete());
  });

  it('une joueuse lit un PNJ rencontré, jamais un PNJ pas encore rencontré ; sa requête doit filtrer', async () => {
    await poser(`${TABLE}/pnj/vu`, pnj({ rencontre: true, cran: 'neutre' }));
    await poser(`${TABLE}/pnj/cache`, pnj({ nom: 'Inconnu' }));
    await assertSucceeds(pour('alice').doc(`${TABLE}/pnj/vu`).get());
    await assertFails(pour('alice').doc(`${TABLE}/pnj/cache`).get());
    await assertSucceeds(pour('alice').collection(`${TABLE}/pnj`).where('rencontre', '==', true).get());
    await assertFails(pour('alice').collection(`${TABLE}/pnj`).get());
    await assertSucceeds(pour('bob').collection(`${TABLE}/pnj`).get());
    await assertFails(env.unauthenticatedContext().firestore().doc(`${TABLE}/pnj/vu`).get());
  });

  it('forme refusée : cran inventé, cran sans rencontre, rencontre sans cran, faction hors des blocs, champ inconnu', async () => {
    const bob = pour('bob').doc(`${TABLE}/pnj/selyne`);
    await assertFails(bob.set(pnj({ rencontre: true, cran: 'ami' })));
    await assertFails(bob.set(pnj({ cran: 'neutre' })));
    await assertFails(bob.set(pnj({ rencontre: true })));
    await assertFails(bob.set(pnj({ faction: 'solvarn' })));
    await assertFails(bob.set(pnj({ secret: 'x' })));
    await assertFails(bob.set(pnj({ tendance: 'stable' })));
    await assertFails(bob.set(pnj({ nom: '' })));
    await assertSucceeds(bob.set(pnj({ faction: null, lore: null })));
  });

  it('historique : le MJ seul, à son nom, sans réécriture', async () => {
    await poser(`${TABLE}/pnj/selyne`, pnj({ rencontre: true, cran: 'allie' }));
    const h = `${TABLE}/pnj/selyne/historique`;
    await assertSucceeds(pour('bob').doc(`${h}/g1`).set(geste('bob', { seance: 's0014' })));
    await assertFails(pour('bob').doc(`${h}/g2`).set(geste('alice')));
    await assertFails(pour('bob').doc(`${h}/g3`).set(geste('bob', { motif: '' })));
    await assertFails(pour('bob').doc(`${h}/g4`).set(geste('bob', { geste: 'scene' })));
    await assertFails(pour('bob').doc(`${h}/g1`).set(geste('bob', { motif: 'Autre chose' })));
    await assertFails(pour('alice').doc(`${h}/g1`).get());
    await assertFails(pour('alice').doc(`${h}/g5`).set(geste('alice')));
    await assertSucceeds(pour('bob').doc(`${h}/g1`).get());
  });
});

describe('réputation (S1)', () => {
  const groupe = `${TABLE}/reputation/groupe`;

  it('toute la table la lit ; le MJ seul l’écrit, dans un seul document', async () => {
    await assertSucceeds(pour('bob').doc(groupe).set({ scores: { comptoir: 3 }, majLe: 1 }));
    await assertSucceeds(pour('alice').doc(groupe).get());
    await assertFails(pour('alice').doc(groupe).set({ scores: { comptoir: 10 }, majLe: 2 }));
    await assertFails(pour('bob').doc(`${TABLE}/reputation/autre`).set({ scores: {}, majLe: 1 }));
    await assertFails(pour('bob').doc(groupe).delete());
  });

  it('scores bornés : −10, +10, et +5 pour les Fils de Libris ; blocs connus seulement', async () => {
    const bob = pour('bob').doc(groupe);
    await assertSucceeds(bob.set({ scores: { comptoir: 10, garde_citoyenne: -10, fils_libris: 5 }, majLe: 1 }));
    await assertFails(bob.set({ scores: { comptoir: 11 }, majLe: 1 }));
    await assertFails(bob.set({ scores: { comptoir: -11 }, majLe: 1 }));
    await assertFails(bob.set({ scores: { fils_libris: 6 }, majLe: 1 }));
    await assertFails(bob.set({ scores: { solvarn: 1 }, majLe: 1 }));
    await assertFails(bob.set({ scores: { comptoir: 1.5 }, majLe: 1 }));
    await assertFails(bob.set({ scores: {}, majLe: 1, note: 'x' }));
  });
});
