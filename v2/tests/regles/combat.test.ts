import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du combat (lot L6.1, décisions du 23/10/2026), contre
 * l'émulateur. Table « t1 » : Bob est MJ ; Alice joue Kargash (pj-p1),
 * Carol joue Hermione (pj-p2). Combat c1 sur la scène « cave ».
 */
const TABLE = 'tables/t1';
const C = `${TABLE}/combats/c1`;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

const combat = (extra: Record<string, unknown> = {}) => ({
  nom: 'Les goules', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', creeLe: 1, closLe: null, ...extra,
});
const combattant = (extra: Record<string, unknown> = {}) => ({
  genre: 'pj', nom: 'Kargash', perso: 'p1', uid: 'alice', monstre: null, modInit: 2, initiative: 14, de: 12, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...extra,
});
const goule = (extra: Record<string, unknown> = {}) =>
  combattant({ genre: 'monstre', nom: 'Goule', perso: null, uid: null, monstre: 'goule', modInit: 3, pv: 14, pvMax: 14, ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1, persoActif: 'p1' });
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1, persoActif: 'p2' });
    await db.doc(TABLE).set({ sceneActive: 'cave', combat: 'c1' });
    await db.doc(C).set(combat());
    await db.doc(`${C}/combattants/pj-p1`).set(combattant());
    await db.doc(`${C}/combattants/pj-p2`).set(combattant({ nom: 'Hermione', perso: 'p2', uid: 'carol', initiative: null, de: null }));
    await db.doc(`${C}/combattants/m-r1-a`).set(goule());
    await db.doc(`${TABLE}/scenes/cave/jetons/pj-p1`).set({ genre: 'pj', nom: 'Kargash', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 });
    await db.doc(`${TABLE}/scenes/cave/jetons/pj-p2`).set({ genre: 'pj', nom: 'Hermione', couleur: '#27ae60', cx: 2, cy: 1, proprietaire: 'carol', creeLe: 1 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const poser = (chemin: string, d: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(chemin).set(d);
  });

describe('combat (L6.1)', () => {
  it('toute la table lit ; le MJ seul crée et clôt ; la forme est vérifiée', async () => {
    await assertSucceeds(pour('carol').doc(C).get());
    await assertSucceeds(pour('carol').doc(`${C}/combattants/m-r1-a`).get());
    await assertFails(pour('alice').doc(`${TABLE}/combats/c2`).set(combat()));
    await assertSucceeds(pour('bob').doc(`${TABLE}/combats/c2`).set(combat()));
    await assertFails(pour('bob').doc(`${TABLE}/combats/c3`).set(combat({ statut: 'fini' })));
    await assertFails(pour('bob').doc(`${TABLE}/combats/c3`).set(combat({ dd: 13 })));
    await assertFails(pour('alice').doc(`${C}/combattants/m-r1-b`).set(goule()));
    await assertSucceeds(pour('bob').doc(`${C}/combattants/m-r1-b`).set(goule()));
    await assertFails(pour('bob').doc(`${C}/combattants/m-r1-c`).set(goule({ pv: null })));
    await assertFails(pour('bob').doc(`${C}/combattants/pj-p3`).set(combattant({ pv: 3, pvMax: 3 })));
    await assertSucceeds(pour('bob').doc(C).update({ statut: 'clos', actif: null, closLe: 9 }));
  });

  it('6a : le joueur qui a la main la passe (tour + 1, round inchangé ou + 1) ; pas un autre', async () => {
    await assertFails(pour('carol').doc(C).update({ actif: 'm-r1-a', tour: 4 }));
    await assertFails(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 5 }));
    await assertFails(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 4, round: 3 }));
    await assertFails(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 4, nom: 'x' }));
    await assertSucceeds(pour('alice').doc(C).update({ actif: 'm-r1-a', tour: 4, round: 2 }));
    // La main est à la goule : Alice ne peut plus rien.
    await assertFails(pour('alice').doc(C).update({ actif: 'pj-p1', tour: 5 }));
    await assertSucceeds(pour('bob').doc(C).update({ actif: 'pj-p1', tour: 5 }));
  });

  it('5a : chacun lance son initiative, une fois, initiative = d20 + modificateur', async () => {
    const carol = pour('carol').doc(`${C}/combattants/pj-p2`);
    await assertFails(pour('alice').doc(`${C}/combattants/pj-p2`).update({ initiative: 14, de: 12 }));
    await assertFails(carol.update({ initiative: 20, de: 12 }));
    await assertSucceeds(carol.update({ initiative: 14, de: 12 }));
    await assertFails(carol.update({ initiative: 22, de: 20 }));
  });

  it('7a : les actions du tour, à son tour, datées du tour en cours, sans dépasser ses cases', async () => {
    const alice = pour('alice').doc(`${C}/combattants/pj-p1`);
    await assertFails(alice.update({ tourActions: 2, principale: true }));
    await assertFails(alice.update({ tourActions: 3, mvt: 6 }));
    await assertSucceeds(alice.update({ tourActions: 3, mvt: 5 }));
    await assertSucceeds(alice.update({ tourActions: 3, principale: true, sprint: true, mvt: 7 }));
    await assertFails(alice.update({ tourActions: 3, pv: 3 }));
    // Plus son tour : plus d'action.
    await poser(C, combat({ actif: 'm-r1-a' }));
    await assertFails(alice.update({ tourActions: 3, secondaire: true }));
    // Le MJ règle tout, les PV des monstres compris.
    await assertSucceeds(pour('bob').doc(`${C}/combattants/m-r1-a`).update({ pv: 0, aTerre: true }));
  });

  it('8a : pendant le combat, un joueur ne déplace son jeton qu’à son tour ; le MJ, toujours ; hors combat, librement', async () => {
    await assertSucceeds(pour('alice').doc(`${TABLE}/scenes/cave/jetons/pj-p1`).update({ cx: 2, cy: 2 }));
    await assertFails(pour('carol').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 3, cy: 3 }));
    await assertSucceeds(pour('bob').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 3, cy: 3 }));
    await poser(TABLE, { sceneActive: 'cave', combat: null });
    await assertSucceeds(pour('carol').doc(`${TABLE}/scenes/cave/jetons/pj-p2`).update({ cx: 4, cy: 4 }));
  });
});
