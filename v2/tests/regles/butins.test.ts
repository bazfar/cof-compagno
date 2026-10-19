import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du butin (lot L3.4), contre l'émulateur.
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
const vote = (extra: Record<string, unknown> = {}) => ({ choix: 'besoin', perso: 'pa', nom: 'Aëlys', d100: 42, relances: [], le: 1, ...extra });
const butin = (extra: Record<string, unknown> = {}) => ({
  objet: { id: 'dague', nom: 'Dague', type: 'arme' },
  statut: 'vote',
  creeLe: 1,
  tour: 0,
  enLice: [],
  votes: {},
  gagnant: null,
  resoluLe: null,
  ...extra,
});
const deposer = (extra: Record<string, unknown> = {}) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/butins/b1`).set(butin(extra));
  });
const ref = (uid: string) => pour(uid).doc(`${TABLE}/butins/b1`);

describe('butin (L3.4)', () => {
  it('le MJ met au vote ; toute la table lit ; un joueur ne crée ni ne retire', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/butins/b1`).set(butin()));
    await assertSucceeds(ref('alice').get());
    await assertSucceeds(pour('carol').collection(`${TABLE}/butins`).get());
    await assertFails(pour('alice').doc(`${TABLE}/butins/b2`).set(butin()));
    await assertFails(ref('alice').delete());
    await assertFails(pour('bob').doc(`${TABLE}/butins/b2`).set(butin({ statut: 'gagne' })));
    await assertFails(pour('bob').doc(`${TABLE}/butins/b2`).set(butin({ cadeau: 1 })));
    await assertSucceeds(ref('bob').delete());
  });

  it('un joueur vote pour lui, avec son personnage, un d100 entre 1 et 100', async () => {
    await deposer();
    await assertSucceeds(ref('alice').update({ 'votes.alice': vote() }));
    await assertFails(ref('alice').update({ 'votes.carol': vote({ perso: 'pc' }) }));
    await assertFails(ref('carol').update({ 'votes.carol': vote({ perso: 'pa' }) }));
    await assertFails(ref('carol').update({ 'votes.carol': vote({ perso: 'pc', d100: 101 }) }));
    await assertFails(ref('carol').update({ 'votes.carol': vote({ perso: 'pc', choix: 'tout' }) }));
    await assertFails(ref('carol').update({ 'votes.carol': vote({ perso: 'pc', relances: [99] }) }));
    await assertFails(ref('carol').update({ 'votes.carol': vote({ perso: 'pc' }), statut: 'attribue' }));
  });

  it('changer d’avis garde le d100 et le personnage', async () => {
    await deposer({ votes: { alice: vote() } });
    await assertSucceeds(ref('alice').update({ 'votes.alice': vote({ choix: 'envie', le: 2 }) }));
    await assertFails(ref('alice').update({ 'votes.alice': vote({ d100: 99 }) }));
  });

  it('vote clos : plus de vote ; en relance, seuls les joueurs à égalité ajoutent un d100', async () => {
    const votes = { alice: vote(), carol: vote({ perso: 'pc', nom: 'Corvin' }), dan: vote({ perso: 'pd', nom: 'Brann', choix: 'envie', d100: 90 }) };
    await deposer({ statut: 'relance', tour: 1, enLice: ['alice', 'carol'], votes });
    await assertFails(ref('dan').update({ 'votes.dan': { ...votes.dan, choix: 'besoin' } }));
    await assertFails(ref('dan').update({ 'votes.dan': { ...votes.dan, relances: [100] } }));
    await assertFails(ref('alice').update({ 'votes.alice': vote({ relances: [70, 80] }) }));
    await assertFails(ref('alice').update({ 'votes.alice': vote({ relances: [0] }) }));
    await assertFails(ref('alice').update({ 'votes.alice': vote({ d100: 50, relances: [70] }) }));
    await assertSucceeds(ref('alice').update({ 'votes.alice': vote({ relances: [70] }) }));
    await assertFails(ref('alice').update({ 'votes.alice': vote({ relances: [71] }) }));
  });

  it('deuxième relance : les relances d’avant ne changent pas', async () => {
    const votes = { alice: vote({ relances: [70] }), carol: vote({ perso: 'pc', nom: 'Corvin', relances: [70] }) };
    await deposer({ statut: 'relance', tour: 2, enLice: ['alice', 'carol'], votes });
    await assertFails(ref('carol').update({ 'votes.carol': { ...votes.carol, relances: [99, 12] } }));
    await assertSucceeds(ref('carol').update({ 'votes.carol': { ...votes.carol, relances: [70, 12] } }));
  });

  it('le MJ attribue, même pendant le vote ; un butin attribué ne bouge plus pour les joueurs', async () => {
    await deposer({ votes: { alice: vote() } });
    await assertSucceeds(ref('bob').update({ statut: 'attribue', gagnant: { uid: 'carol', perso: 'pc', nom: 'Corvin', mode: 'direct' }, resoluLe: 2 }));
    await assertFails(ref('alice').update({ 'votes.alice': vote({ choix: 'passe' }) }));
  });
});
