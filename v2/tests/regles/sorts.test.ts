import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des sorts lancés hors combat (lot G2a, décisions du 22/10/2026),
 * contre l'émulateur. Table « t1 » : Bob est MJ ; Alice et Carol sont
 * joueuses, Alice joue Kylhian (p-k).
 */
const TABLE = 'tables/t1';
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cof-compagno',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

const demande = (extra: Record<string, unknown> = {}) => ({
  uid: 'alice', perso: 'p-k', nom: 'Kylhian', sort: 'illusion.leurre', nomSort: 'Leurre', palier: 'I', pp: 1, echec: 10, sauvegarde: 'Volonte', dd: 13,
  intention: 'Une silhouette au bout du couloir', textes: ['Un bruit ou une silhouette immobile.'],
  statut: 'attente', motif: null, de: null, resistance: null, creeLe: 1, majLe: 1, ...extra,
});
const sortJournal = (extra: Record<string, unknown> = {}) => ({
  auteurUid: 'alice', auteurNom: 'Alice', perso: 'Kylhian', libelle: 'Lumière I, hors combat', formule: 'sort', des: [], bonus: 0, total: 0, creeLe: 1,
  sort: { nom: 'Lumière', palier: 'I', pp: 0, intention: 'Éclairer la crypte', issue: 'lance' }, ...extra,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${TABLE}/secret/codeMj`).set({ code: 'dragon' });
    await db.doc(`${TABLE}/mjs/bob`).set({ nom: 'Bob', code: 'dragon', rejointLe: 1 });
    await db.doc(`${TABLE}/joueurs/alice`).set({ nom: 'Alice', rejointLe: 1, persoActif: 'p-k' });
    await db.doc(`${TABLE}/joueurs/carol`).set({ nom: 'Carol', rejointLe: 1 });
    await db.doc(TABLE).set({ sceneActive: null });
    await db.doc(`${TABLE}/persos/p-k`).set({ proprietaireUid: 'alice', nom: 'Kylhian' });
    await db.doc(`${TABLE}/sortsHorsCombat/d1`).set(demande());
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const d = (uid: string, id = 'd1') => pour(uid).doc(`${TABLE}/sortsHorsCombat/${id}`);
const poser = (extra: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/sortsHorsCombat/d1`).set(demande(extra));
  });

describe('sorts hors combat (G2a)', () => {
  it('lus du MJ et de qui les demande', async () => {
    await assertSucceeds(d('alice').get());
    await assertSucceeds(d('bob').get());
    await assertFails(d('carol').get());
    await assertSucceeds(pour('alice').collection(`${TABLE}/sortsHorsCombat`).where('uid', '==', 'alice').get());
    await assertFails(pour('carol').collection(`${TABLE}/sortsHorsCombat`).get());
  });

  it('la joueuse demande pour son personnage, en attente, sans réponse ni dé', async () => {
    await assertSucceeds(d('alice', 'd2').set(demande()));
    await assertFails(d('carol', 'd3').set(demande({ uid: 'carol' })));
    await assertFails(d('alice', 'd4').set(demande({ statut: 'acceptee' })));
    await assertFails(d('alice', 'd5').set(demande({ motif: 'oui' })));
    await assertFails(d('alice', 'd6').set(demande({ de: 12 })));
    await assertFails(d('alice', 'd7').set(demande({ dd: null })));
    await assertFails(d('alice', 'd8').set(demande({ intention: '' })));
    await assertFails(d('alice', 'd9').set(demande({ note: 'x' })));
    await assertFails(d('bob', 'd10').set(demande({ uid: 'bob' })));
  });

  it('le MJ accepte ou refuse une demande en attente, rien d’autre', async () => {
    await assertFails(d('alice').update({ statut: 'acceptee', majLe: 2 }));
    await assertFails(d('bob').update({ statut: 'acceptee', pp: 0, majLe: 2 }));
    await assertFails(d('bob').update({ statut: 'lancee', majLe: 2 }));
    await assertSucceeds(d('bob').update({ statut: 'refusee', motif: 'Non', majLe: 2 }));
    await assertFails(d('bob').update({ statut: 'acceptee', majLe: 3 }));
  });

  it('la joueuse lance un sort accepté : le d20 décide de « ratée »', async () => {
    await poser({ statut: 'acceptee' });
    await assertFails(d('carol').update({ statut: 'lancee', de: 15, majLe: 2 }));
    await assertFails(d('alice').update({ statut: 'lancee', de: null, majLe: 2 }));
    await assertFails(d('alice').update({ statut: 'lancee', de: 8, majLe: 2 }));
    await assertFails(d('alice').update({ statut: 'ratee', de: 15, majLe: 2 }));
    await assertFails(d('alice').update({ statut: 'lancee', de: 15, pp: 0, majLe: 2 }));
    await assertSucceeds(d('alice').update({ statut: 'ratee', de: 8, majLe: 2 }));
    await poser({ statut: 'acceptee', echec: 0 });
    await assertFails(d('alice').update({ statut: 'lancee', de: 15, majLe: 2 }));
    await assertSucceeds(d('alice').update({ statut: 'lancee', de: null, majLe: 2 }));
  });

  it('le MJ note la sauvegarde de la cible d’un sort lancé, une fois', async () => {
    await poser({ statut: 'lancee', de: 15 });
    await assertFails(d('alice').update({ resistance: { de: 4, bonus: 0, reussie: false }, majLe: 2 }));
    await assertFails(d('bob').update({ resistance: { de: 4, bonus: 0 }, majLe: 2 }));
    await assertSucceeds(d('bob').update({ resistance: { de: 4, bonus: 0, reussie: false }, majLe: 2 }));
    await assertFails(d('bob').update({ resistance: { de: 18, bonus: 0, reussie: true }, majLe: 3 }));
    await poser({ statut: 'lancee', de: 15, sauvegarde: null, dd: null });
    await assertFails(d('bob').update({ resistance: { de: 4, bonus: 0, reussie: false }, majLe: 2 }));
  });

  it('G2b : en scène, la demande porte scène et action ; le MJ fixe un bonus au plus celui du palier', async () => {
    await assertSucceeds(d('alice', 'd2').set(demande({ scene: 'sh1', action: '1-alice', bonus: null })));
    await assertFails(d('alice', 'd3').set(demande({ scene: 'sh1', action: null, bonus: null })));
    await assertFails(d('alice', 'd4').set(demande({ scene: 'sh1', action: '1-alice', bonus: 1 })));
    await poser({ scene: 'sh1', action: '1-alice', bonus: null });
    await assertFails(d('bob').update({ statut: 'acceptee', majLe: 2 }));
    await assertFails(d('bob').update({ statut: 'acceptee', bonus: 2, majLe: 2 }));
    await assertSucceeds(d('bob').update({ statut: 'acceptee', bonus: 1, majLe: 2 }));
    await poser({ scene: 'sh1', action: '1-alice', bonus: null });
    await assertSucceeds(d('bob').update({ statut: 'refusee', motif: 'Non', majLe: 2 }));
    // Hors scène, pas de bonus.
    await poser({});
    await assertFails(d('bob').update({ statut: 'acceptee', bonus: 1, majLe: 2 }));
  });

  it('journal : un sort peut n’avoir aucun dé ; un jet sans dé ni sort est refusé', async () => {
    const j = pour('alice').collection(`${TABLE}/journal`);
    await assertSucceeds(j.add(sortJournal()));
    const { sort: _sort, ...sansSort } = sortJournal();
    await assertFails(j.add(sansSort));
    await assertFails(j.add(sortJournal({ sort: { nom: 'Lumière', palier: 'IV', pp: 0, intention: 'x', issue: 'lance' } })));
    await assertFails(j.add(sortJournal({ sort: { nom: 'Lumière', palier: 'I', pp: 0, intention: 'x', issue: 'lance', effet: 'x' } })));
  });
});
