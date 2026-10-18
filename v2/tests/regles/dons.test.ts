import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des dons d'objets (lot L3.3), contre l'émulateur.
 * Table « t1 » : Bob est MJ ; Alice (perso pa), Carol (perso pc) et Dan
 * (perso pd) sont joueurs.
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
    for (const [uid, perso] of [['alice', 'pa'], ['carol', 'pc'], ['dan', 'pd']]) {
      await db.doc(`${TABLE}/joueurs/${uid}`).set({ nom: uid, rejointLe: 1, persoActif: perso });
      await db.doc(`${TABLE}/persos/${perso}`).set({ proprietaireUid: uid });
    }
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const don = (extra: Record<string, unknown> = {}) => ({
  deUid: 'alice',
  dePerso: 'pa',
  deNom: 'Aëlys',
  aUid: 'carol',
  aPerso: 'pc',
  aNom: 'Corvin',
  objet: { nom: 'Potion de soins', type: 'potion', quantite: 2 },
  statut: 'propose',
  creeLe: 1,
  resoluLe: null,
  ...extra,
});
const deposer = (extra: Record<string, unknown> = {}) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/dons/d1`).set(don(extra));
  });

describe('dons d’objets (L3.3)', () => {
  it('Alice propose un objet de son personnage au personnage de Carol', async () => {
    await assertSucceeds(pour('alice').doc(`${TABLE}/dons/d1`).set(don()));
  });

  it('proposition refusée : au nom d’un autre, depuis le perso d’un autre, vers soi, vers un perso mal attribué, déjà réglée', async () => {
    await assertFails(pour('dan').doc(`${TABLE}/dons/d1`).set(don()));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ dePerso: 'pd' })));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ aUid: 'alice', aPerso: 'pa' })));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ aPerso: 'pd' })));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ statut: 'accepte' })));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ resoluLe: 2 })));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ cadeau: true })));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).set(don({ objet: 'potion' })));
  });

  it('lu du donneur, du receveur et du MJ ; pas d’un autre joueur', async () => {
    await deposer();
    await assertSucceeds(pour('alice').doc(`${TABLE}/dons/d1`).get());
    await assertSucceeds(pour('carol').doc(`${TABLE}/dons/d1`).get());
    await assertSucceeds(pour('bob').doc(`${TABLE}/dons/d1`).get());
    await assertFails(pour('dan').doc(`${TABLE}/dons/d1`).get());
    await assertSucceeds(pour('alice').collection(`${TABLE}/dons`).where('deUid', '==', 'alice').get());
    await assertSucceeds(pour('carol').collection(`${TABLE}/dons`).where('aUid', '==', 'carol').get());
    await assertFails(pour('dan').collection(`${TABLE}/dons`).get());
  });

  it('le receveur accepte ou refuse ; le donneur ne peut pas accepter à sa place', async () => {
    await deposer();
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).update({ statut: 'accepte', resoluLe: 2 }));
    await assertFails(pour('dan').doc(`${TABLE}/dons/d1`).update({ statut: 'accepte', resoluLe: 2 }));
    await assertSucceeds(pour('carol').doc(`${TABLE}/dons/d1`).update({ statut: 'accepte', resoluLe: 2 }));
    await deposer();
    await assertSucceeds(pour('carol').doc(`${TABLE}/dons/d1`).update({ statut: 'refuse', resoluLe: 2 }));
  });

  it('le donneur annule une proposition, ou reprend un objet refusé ; rien d’autre', async () => {
    await deposer();
    await assertFails(pour('carol').doc(`${TABLE}/dons/d1`).update({ statut: 'annule', resoluLe: 2 }));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).update({ statut: 'repris', resoluLe: 2 }));
    await assertSucceeds(pour('alice').doc(`${TABLE}/dons/d1`).update({ statut: 'annule', resoluLe: 2 }));
    await deposer({ statut: 'refuse', resoluLe: 2 });
    await assertSucceeds(pour('alice').doc(`${TABLE}/dons/d1`).update({ statut: 'repris', resoluLe: 3 }));
  });

  it('un don réglé ne bouge plus ; l’objet et les parties ne changent jamais', async () => {
    await deposer({ statut: 'accepte', resoluLe: 2 });
    await assertFails(pour('carol').doc(`${TABLE}/dons/d1`).update({ statut: 'refuse', resoluLe: 3 }));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).update({ statut: 'annule', resoluLe: 3 }));
    await deposer();
    await assertFails(pour('carol').doc(`${TABLE}/dons/d1`).update({ statut: 'accepte', resoluLe: 2, objet: { nom: 'Épée', quantite: 9 } }));
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).update({ statut: 'annule', resoluLe: 2, aPerso: 'pd' }));
    await assertFails(pour('carol').doc(`${TABLE}/dons/d1`).update({ statut: 'accepte' }));
  });

  it('seul le MJ supprime un don', async () => {
    await deposer();
    await assertFails(pour('alice').doc(`${TABLE}/dons/d1`).delete());
    await assertFails(pour('carol').doc(`${TABLE}/dons/d1`).delete());
    await assertSucceeds(pour('bob').doc(`${TABLE}/dons/d1`).delete());
  });
});
