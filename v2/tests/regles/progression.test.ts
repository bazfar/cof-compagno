import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles des crans de progression et du journal de dés (lot L2.5), contre
 * l'émulateur. Table « t1 » : Bob est MJ, Alice et Carol sont joueuses.
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
    await db.doc(`${TABLE}/persos/p1`).set(fiche('alice'));
  });
});

afterAll(async () => {
  await env.cleanup();
});

/** Fiche minimale valide (mêmes champs que dans persos.test.ts). */
function fiche(proprietaireUid: string, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, proprietaireUid, creeLe: 1, nom: 'Shyrion', niveau: 3, classe: 'magicien', race: 'elfe',
    caracs: { FOR: 10 }, capacites: [], pvMax: 14, pvActuel: 14, equipement: {}, inventaire: {},
    piecesOr: 5, piecesArgent: 0, piecesBronze: 0, modules: {},
    progression: { crans: 2 }, vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null }, usages: {},
    ...extra,
  };
}

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const cran = (parUid: string, extra: Record<string, unknown> = {}) => ({ barre: 'niveau', delta: 1, libelle: 'Le marché noir', parUid, creeLe: 1, ...extra });
const jet = (auteurUid: string, extra: Record<string, unknown> = {}) => ({
  auteurUid, auteurNom: 'Alice', perso: 'Shyrion', libelle: 'Perception', formule: '1d20+2', des: [14], bonus: 2, total: 16, creeLe: 1, ...extra,
});

describe('crans de progression (L2.5)', () => {
  it('le MJ seul ajoute un cran ; toute la table les lit ; personne ne les modifie ni ne les supprime', async () => {
    const chemin = `${TABLE}/persos/p1/jalons`;
    await assertSucceeds(pour('bob').doc(`${chemin}/j1`).set(cran('bob')));
    await assertFails(pour('alice').doc(`${chemin}/j2`).set(cran('alice')));
    await assertSucceeds(pour('carol').doc(`${chemin}/j1`).get());
    await assertFails(pour('bob').doc(`${chemin}/j1`).update({ delta: -1 }));
    await assertFails(pour('bob').doc(`${chemin}/j1`).delete());
  });

  it('écriture groupée comme donnerCran : le MJ passe ; la joueuse, même propriétaire, non', async () => {
    const groupe = (uid: string) => {
      const db = pour(uid);
      const b = db.batch();
      b.set(db.doc(`${TABLE}/persos/p1/jalons/j-${uid}`), cran(uid));
      b.update(db.doc(`${TABLE}/persos/p1`), { 'progression.crans': 3 });
      return b.commit();
    };
    await assertFails(groupe('alice'));
    await assertSucceeds(groupe('bob'));
  });

  it('forme refusée : barre inconnue, delta de 2, auteur usurpé ; la barre du Vécu passe (L4.18)', async () => {
    const chemin = `${TABLE}/persos/p1/jalons`;
    await assertSucceeds(pour('bob').doc(`${chemin}/j0`).set(cran('bob', { barre: 'vecu' })));
    await assertFails(pour('bob').doc(`${chemin}/j1`).set(cran('bob', { barre: 'metier' })));
    await assertFails(pour('bob').doc(`${chemin}/j1`).set(cran('bob', { delta: 2 })));
    await assertFails(pour('bob').doc(`${chemin}/j1`).set(cran('alice')));
  });
});

describe('montée de niveau par la joueuse (L2.5b)', () => {
  const poser = (extra: Record<string, unknown>) =>
    env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(`${TABLE}/persos/p1`).set(fiche('alice', extra)); });
  const p1 = (uid: string) => pour(uid).doc(`${TABLE}/persos/p1`);

  it('un niveau, crans requis dépensés (3 pour passer du 3 au 4), le surplus gardé : permis', async () => {
    await poser({ progression: { crans: 4 } });
    await assertSucceeds(p1('alice').update({ niveau: 4, 'progression.crans': 1, pvMax: 21, dons: ['robuste'] }));
  });

  it('refusé : niveau sans crans, deux niveaux, crans insuffisants, crans seuls, ou la fiche d’un autre', async () => {
    await poser({ progression: { crans: 4 } });
    await assertFails(p1('alice').update({ niveau: 4 }));
    await assertFails(p1('alice').update({ niveau: 5, 'progression.crans': 1 }));
    await assertFails(p1('alice').update({ niveau: 4, 'progression.crans': 2 }));
    await assertFails(p1('alice').update({ 'progression.crans': 1 }));
    await assertFails(p1('carol').update({ niveau: 4, 'progression.crans': 1 }));
    await poser({ progression: { crans: 2 } });
    await assertFails(p1('alice').update({ niveau: 4, 'progression.crans': -1 }));
  });

  it('plafond : pas de montée au-delà du niveau 12 ; le MJ, lui, fait tout', async () => {
    await poser({ niveau: 12, progression: { crans: 6 } });
    await assertFails(p1('alice').update({ niveau: 13, 'progression.crans': 0 }));
    await assertSucceeds(p1('bob').update({ niveau: 13 }));
  });
});

describe('journal de dés (L2.5)', () => {
  it('chacun ajoute ses jets, toute la table les lit, personne ne les modifie ni ne les supprime', async () => {
    await assertSucceeds(pour('alice').doc(`${TABLE}/journal/a`).set(jet('alice')));
    await assertFails(pour('alice').doc(`${TABLE}/journal/b`).set(jet('carol')));
    await assertSucceeds(pour('carol').doc(`${TABLE}/journal/a`).get());
    await assertFails(pour('alice').doc(`${TABLE}/journal/a`).update({ total: 20 }));
    await assertFails(pour('bob').doc(`${TABLE}/journal/a`).delete());
    await assertFails(pour('intrus').doc(`${TABLE}/journal/c`).set(jet('intrus')));
  });

  it('forme refusée : champ inconnu, aucun dé', async () => {
    await assertFails(pour('alice').doc(`${TABLE}/journal/a`).set(jet('alice', { secret: true })));
    await assertFails(pour('alice').doc(`${TABLE}/journal/a`).set(jet('alice', { des: [] })));
  });
});
