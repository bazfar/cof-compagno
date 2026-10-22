import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des scènes hors combat (lot S2, décisions du 22/10/2026), contre
 * l'émulateur. Table « t1 » : Bob est MJ ; Alice et Carol sont joueuses,
 * Alice seule est appelée.
 */
const TABLE = 'tables/t1';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

const scene = (extra: Record<string, unknown> = {}) => ({
  type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'Savoir d’où vient la fiole', mode: 'individuel', competence: null,
  requis: 3, toleres: 2, echecsVisibles: true, marquante: false,
  appeles: [{ uid: 'alice', perso: 'p-magnus', nom: 'Magnus' }], appelesUids: ['alice'],
  tour: 1, reussites: 0, echecs: 0, depart: 'neutre', hausses: 0, baisses: 0, menaces: 0, temp: 0, mensonges: 0, seduction: null,
  statut: 'ouverte', issue: null, creeLe: 1, closeLe: null, ...extra,
});
const action = (extra: Record<string, unknown> = {}) => ({
  uid: 'alice', perso: 'p-magnus', nom: 'Magnus', tour: 1, option: 'convaincre', competence: 'Persuasion', de: 14, bonus: 3, resultat: null, creeLe: 1, ...extra,
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
    await db.doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene());
    await db.doc(`${TABLE}/scenesHorsCombatMj/sh1`).set({ dd: 13 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const actes = `${TABLE}/scenesHorsCombat/sh1/actions`;

describe('scènes hors combat (S2)', () => {
  it('toute la table lit la scène ; le MJ seul l’écrit ; le DD est au MJ seul', async () => {
    await assertSucceeds(pour('carol').doc(`${TABLE}/scenesHorsCombat/sh1`).get());
    await assertFails(pour('alice').doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene({ reussites: 3 })));
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene({ reussites: 1, hausses: 1 })));
    await assertFails(pour('alice').doc(`${TABLE}/scenesHorsCombatMj/sh1`).get());
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenesHorsCombatMj/sh1`).get());
    await assertFails(pour('bob').doc(`${TABLE}/scenesHorsCombatMj/sh1`).set({ dd: 40 }));
    await assertFails(pour('bob').doc(`${TABLE}/scenesHorsCombatMj/sh1`).set({ dd: 13, note: 'x' }));
  });

  it('forme de la scène refusée : DD dedans, statut inventé, appelesUids qui ne suit pas', async () => {
    const bob = pour('bob').doc(`${TABLE}/scenesHorsCombat/sh2`);
    await assertFails(bob.set(scene({ dd: 13 })));
    await assertFails(bob.set(scene({ statut: 'finie' })));
    await assertFails(bob.set(scene({ appelesUids: [] })));
    await assertFails(bob.set(scene({ temp: 6 })));
    await assertSucceeds(bob.set(scene({ seance: 's0014' })));
  });

  it('une appelée écrit son action du tour, une seule, à son nom, sans résultat ; passer donne « passe »', async () => {
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ resultat: 'reussite' })));
    await assertFails(pour('alice').doc(`${actes}/2-alice`).set(action({ tour: 2 })));
    await assertFails(pour('alice').doc(`${actes}/1-carol`).set(action()));
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ uid: 'carol' })));
    await assertSucceeds(pour('alice').doc(`${actes}/1-alice`).set(action()));
    // Pas de seconde action ce tour (ni de réécriture).
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ de: 20 })));
    await assertSucceeds(pour('bob').doc(`${actes}/1-alice`).update({ resultat: 'reussite' }));
    await assertFails(pour('bob').doc(`${actes}/1-alice`).update({ de: 20 }));
  });

  it('passer ; une non-appelée ne joue pas ; une scène terminée n’attend plus de jet', async () => {
    await assertFails(pour('alice').doc(`${actes}/1-alice`).set(action({ option: 'passer', competence: null, de: null, resultat: null })));
    await assertSucceeds(pour('alice').doc(`${actes}/1-alice`).set(action({ option: 'passer', competence: null, de: null, resultat: 'passe' })));
    await assertFails(pour('carol').doc(`${actes}/1-carol`).set(action({ uid: 'carol' })));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${TABLE}/scenesHorsCombat/sh1`).set(scene({ tour: 2, statut: 'terminee', issue: 'gagnee' }));
    });
    await assertFails(pour('alice').doc(`${actes}/2-alice`).set(action({ tour: 2 })));
    await assertSucceeds(pour('carol').collection(actes).get());
  });
});
