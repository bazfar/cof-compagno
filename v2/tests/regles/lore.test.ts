import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du lore partagé (lot L2.7a), contre l'émulateur.
 * Table « t1 » : Bob est MJ, Alice et Carol sont joueuses ; Dave n'est pas
 * à la table.
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
const ficheMj = (extra: Record<string, unknown> = {}) => ({
  titre: "L'Atelier des Marges", categorie: 'Lieux', ordre: 10, etiquettes: [], visibilite: 'tous', lecteurs: [],
  passages: [{ id: 'p-1', texte: 'Un atelier.', scelle: false }, { id: 'p-2', texte: 'Le secret.', scelle: true }],
  majLe: 1, reveleLe: 1, ...extra,
});
const ficheJoueurs = (lecteurs: string[], extra: Record<string, unknown> = {}) => ({
  titre: "L'Atelier des Marges", categorie: 'Lieux', ordre: 10, etiquettes: [], lecteurs,
  passages: [{ id: 'p-1', texte: 'Un atelier.' }], majLe: 1, reveleLe: 1, ...extra,
});
async function poser(chemin: string, donnees: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TABLE}/${chemin}`).set(donnees);
  });
}

describe('lore : fiche complète (loreMj)', () => {
  it('le MJ seul la lit, l’écrit et la supprime', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/loreMj/f1`).set(ficheMj()));
    await assertSucceeds(pour('bob').doc(`${TABLE}/loreMj/f1`).get());
    await assertFails(pour('alice').doc(`${TABLE}/loreMj/f1`).get());
    await assertFails(pour('alice').collection(`${TABLE}/loreMj`).get());
    await assertFails(pour('alice').doc(`${TABLE}/loreMj/f2`).set(ficheMj()));
    await assertFails(pour('alice').doc(`${TABLE}/loreMj/f1`).delete());
    await assertSucceeds(pour('bob').doc(`${TABLE}/loreMj/f1`).delete());
  });

  it('forme refusée : champ inconnu, visibilité inconnue, titre vide', async () => {
    await assertFails(pour('bob').doc(`${TABLE}/loreMj/f1`).set(ficheMj({ auteur: 'x' })));
    await assertFails(pour('bob').doc(`${TABLE}/loreMj/f1`).set(ficheMj({ visibilite: 'amis' })));
    await assertFails(pour('bob').doc(`${TABLE}/loreMj/f1`).set(ficheMj({ titre: '' })));
  });
});

describe('lore : version joueurs (lore)', () => {
  it('partagée à tous : toute joueuse la lit, même par requête ; un inconnu non', async () => {
    await poser('lore/f1', ficheJoueurs(['*']));
    await assertSucceeds(pour('alice').doc(`${TABLE}/lore/f1`).get());
    await assertSucceeds(pour('carol').collection(`${TABLE}/lore`).where('lecteurs', 'array-contains', '*').get());
    await assertFails(pour('dave').doc(`${TABLE}/lore/f1`).get());
  });

  it('partagée à certains : Alice la lit, Carol non ; chacune par sa requête', async () => {
    await poser('lore/f1', ficheJoueurs(['alice']));
    await poser('lore/f2', ficheJoueurs(['*']));
    await assertSucceeds(pour('alice').doc(`${TABLE}/lore/f1`).get());
    await assertFails(pour('carol').doc(`${TABLE}/lore/f1`).get());
    await assertSucceeds(pour('alice').collection(`${TABLE}/lore`).where('lecteurs', 'array-contains', 'alice').get());
    await assertSucceeds(pour('carol').collection(`${TABLE}/lore`).where('lecteurs', 'array-contains', 'carol').get());
    // Une requête qui ne filtre pas sur ses lecteurs est refusée en bloc.
    await assertFails(pour('carol').collection(`${TABLE}/lore`).get());
    await assertFails(pour('carol').collection(`${TABLE}/lore`).where('lecteurs', 'array-contains', 'alice').get());
  });

  it('seul le MJ l’écrit ; une liste de lecteurs vide est refusée (on supprime le document)', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/lore/f1`).set(ficheJoueurs(['*'])));
    await assertFails(pour('alice').doc(`${TABLE}/lore/f1`).update({ titre: 'Autre' }));
    await assertFails(pour('alice').doc(`${TABLE}/lore/f1`).delete());
    await assertFails(pour('bob').doc(`${TABLE}/lore/f2`).set(ficheJoueurs([])));
    // Un champ de la version MJ (visibilité, passage scellé) n'a rien à y faire.
    await assertFails(pour('bob').doc(`${TABLE}/lore/f3`).set(ficheJoueurs(['*'], { visibilite: 'tous' })));
    await assertSucceeds(pour('bob').doc(`${TABLE}/lore/f1`).delete());
  });
});
