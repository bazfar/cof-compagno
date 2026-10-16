import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des fiches de personnage (lot L2.1), contre l'émulateur Firestore.
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
const alice = () => pour('alice');
const bob = () => pour('bob');

/** Fiche minimale valide (la forme complète est vérifiée par Zod dans l'app). */
const fiche = (proprietaireUid: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, proprietaireUid, creeLe: 1, nom: 'Shyrion', niveau: 3, classe: 'magicien', race: 'elfe',
  caracs: { FOR: 10 }, capacites: [], pvMax: 14, pvActuel: 14, equipement: {}, inventaire: {},
  piecesOr: 5, piecesArgent: 0, piecesBronze: 0, modules: {},
  progression: { crans: 0 }, vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null }, usages: {},
  ...extra,
});

async function poser(id: string, donnees: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/persos/${id}`).set(donnees);
  });
}

describe('fiches de personnage (L2.1)', () => {
  it('une joueuse crée SES personnages, plusieurs si elle veut (décision 2a)', async () => {
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).set(fiche('alice')));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p2`).set(fiche('alice', { nom: 'Fred' })));
    await assertFails(alice().doc(`${TABLE}/persos/p3`).set(fiche('carol')));
  });

  it('elle modifie sa fiche, pas celle des autres', async () => {
    await poser('p1', fiche('alice'));
    await poser('p2', fiche('carol'));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ pvActuel: 9 }));
    await assertFails(alice().doc(`${TABLE}/persos/p2`).update({ pvActuel: 9 }));
  });

  it("elle ne peut ni donner son personnage, ni se donner des crans, ni le supprimer", async () => {
    await poser('p1', fiche('alice'));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ proprietaireUid: 'carol' }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ progression: { crans: 9 } }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.crans': 3 }));
    await assertFails(alice().doc(`${TABLE}/persos/p2`).set(fiche('alice', { progression: { crans: 2 } })));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).delete());
  });

  it('Vécu : elle choisit ses nœuds et dépense ses points, sans en créer', async () => {
    await poser('p1', fiche('alice', { vecu: { crans: 3, paliers: 1, points: 1, noeuds: [], noeudOffert: null } }));
    await assertSucceeds(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 0, 'vecu.noeuds': ['oeil_du_chasseur'] }));
    await assertFails(alice().doc(`${TABLE}/persos/p1`).update({ 'vecu.points': 5 }));
  });

  it('le MJ fait tout : crans, changement de propriétaire, suppression', async () => {
    await poser('p1', fiche('alice'));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ progression: { crans: 2 } }));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).update({ proprietaireUid: 'carol' }));
    await assertSucceeds(bob().doc(`${TABLE}/persos/p1`).delete());
  });

  it('toute la table lit les fiches ; hors table, rien', async () => {
    await poser('p1', fiche('alice'));
    await assertSucceeds(pour('carol').doc(`${TABLE}/persos/p1`).get());
    await assertFails(pour('intrus').doc(`${TABLE}/persos/p1`).get());
  });

  it('forme refusée : champ inconnu (la DEF v1), niveau hors bornes, version future', async () => {
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { def: 14 })));
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { niveau: 21 })));
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { schemaVersion: 2 })));
    await assertFails(bob().doc(`${TABLE}/persos/p1`).set(fiche('alice', { jalons: { acquis: 1, requis: 3 } })));
  });
});
