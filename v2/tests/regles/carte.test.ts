import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles de la battlemap (lot L5.3), contre l'émulateur Firestore.
 * Table « t1 » : Bob est MJ, Alice et Carol sont joueuses.
 */
const TABLE = 'tables/t1';
const SCENE = `${TABLE}/scenes/taverne`;
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
const intrus = () => pour('intrus');

const jetonPJ = (uid: string, extra: Record<string, unknown> = {}) => ({
  genre: 'pj', nom: 'Héros', couleur: '#2980b9', cx: 1, cy: 8, proprietaire: uid, creeLe: 1, ...extra,
});
const monstre = (extra: Record<string, unknown> = {}) => ({
  genre: 'monstre', nom: 'Gobelin', couleur: '#c0392b', cx: 10, cy: 10, proprietaire: null, creeLe: 1, ...extra,
});

async function poserEnTantQueMj(id: string, donnees: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${SCENE}/jetons/${id}`).set(donnees);
  });
}

describe('scène montrée', () => {
  it('le MJ choisit la scène ; un joueur ne peut pas', async () => {
    await assertSucceeds(bob().doc(TABLE).set({ sceneActive: 'taverne' }, { merge: true }));
    await assertFails(alice().doc(TABLE).set({ sceneActive: 'kratz' }, { merge: true }));
    await assertSucceeds(alice().doc(TABLE).get());
  });
});

describe('jetons', () => {
  it('un joueur pose son propre PJ, avec le bon identifiant', async () => {
    await assertSucceeds(alice().doc(`${SCENE}/jetons/pj-alice`).set(jetonPJ('alice')));
  });

  it("un joueur ne pose ni le PJ d'un autre, ni un monstre, ni un PJ sous un autre identifiant", async () => {
    await assertFails(alice().doc(`${SCENE}/jetons/pj-carol`).set(jetonPJ('carol')));
    await assertFails(alice().doc(`${SCENE}/jetons/pj-alice`).set(jetonPJ('carol')));
    await assertFails(alice().doc(`${SCENE}/jetons/pj-alice`).set(monstre({ proprietaire: 'alice' })));
    await assertFails(alice().doc(`${SCENE}/jetons/x`).set(jetonPJ('alice')));
    await assertFails(alice().doc(`${SCENE}/jetons/pj-alice`).set(jetonPJ('alice', { mort: false })));
  });

  it('le MJ pose tout, y compris le PJ d\'un joueur', async () => {
    await assertSucceeds(bob().doc(`${SCENE}/jetons/g1`).set(monstre()));
    await assertSucceeds(bob().doc(`${SCENE}/jetons/pj-carol`).set(jetonPJ('carol')));
  });

  it('forme refusée : champ inconnu, couleur, coordonnée, genre', async () => {
    await assertFails(bob().doc(`${SCENE}/jetons/g1`).set(monstre({ pv: 12 })));
    await assertFails(bob().doc(`${SCENE}/jetons/g1`).set(monstre({ couleur: 'rouge' })));
    await assertFails(bob().doc(`${SCENE}/jetons/g1`).set(monstre({ cx: -1 })));
    await assertFails(bob().doc(`${SCENE}/jetons/g1`).set(monstre({ cx: 1.5 })));
    await assertFails(bob().doc(`${SCENE}/jetons/g1`).set(monstre({ genre: 'dragon' })));
  });

  it('un joueur déplace son jeton, et seulement sa position', async () => {
    await poserEnTantQueMj('pj-alice', jetonPJ('alice'));
    await assertSucceeds(alice().doc(`${SCENE}/jetons/pj-alice`).update({ cx: 2, cy: 9 }));
    await assertFails(alice().doc(`${SCENE}/jetons/pj-alice`).update({ nom: 'Autre' }));
    await assertFails(alice().doc(`${SCENE}/jetons/pj-alice`).update({ proprietaire: 'carol' }));
    await assertFails(alice().doc(`${SCENE}/jetons/pj-alice`).update({ cx: 999 }));
  });

  it("un joueur ne déplace ni le jeton d'un autre, ni un monstre, ni ne tue", async () => {
    await poserEnTantQueMj('pj-carol', jetonPJ('carol'));
    await poserEnTantQueMj('g1', monstre());
    await assertFails(alice().doc(`${SCENE}/jetons/pj-carol`).update({ cx: 2 }));
    await assertFails(alice().doc(`${SCENE}/jetons/g1`).update({ cx: 2 }));
    await assertFails(alice().doc(`${SCENE}/jetons/g1`).update({ mort: true }));
  });

  it('le MJ déplace, tue et ranime', async () => {
    await poserEnTantQueMj('g1', monstre());
    await assertSucceeds(bob().doc(`${SCENE}/jetons/g1`).update({ cx: 3, cy: 4 }));
    await assertSucceeds(bob().doc(`${SCENE}/jetons/g1`).update({ mort: true }));
    await assertSucceeds(bob().doc(`${SCENE}/jetons/g1`).update({ mort: false }));
  });

  it('retirer : le MJ tout, un joueur seulement ses jetons', async () => {
    await poserEnTantQueMj('pj-alice', jetonPJ('alice'));
    await poserEnTantQueMj('pj-carol', jetonPJ('carol'));
    await poserEnTantQueMj('g1', monstre());
    await assertFails(alice().doc(`${SCENE}/jetons/pj-carol`).delete());
    await assertFails(alice().doc(`${SCENE}/jetons/g1`).delete());
    await assertSucceeds(alice().doc(`${SCENE}/jetons/pj-alice`).delete());
    await assertSucceeds(bob().doc(`${SCENE}/jetons/g1`).delete());
  });

  it('hors de la table : ni lecture, ni écriture', async () => {
    await poserEnTantQueMj('g1', monstre());
    await assertFails(intrus().collection(`${SCENE}/jetons`).get());
    await assertFails(intrus().doc(`${SCENE}/jetons/pj-intrus`).set(jetonPJ('intrus')));
    await assertSucceeds(alice().collection(`${SCENE}/jetons`).get());
  });
});

describe('état de la scène', () => {
  it("un joueur ouvre n'importe quelle porte, scène neuve ou non", async () => {
    await assertSucceeds(alice().doc(SCENE).set({ portesOuvertes: { p0: true } }, { merge: true }));
    await assertSucceeds(pour('carol').doc(SCENE).set({ portesOuvertes: { p3: true } }, { merge: true }));
    await assertSucceeds(alice().doc(SCENE).set({ portesOuvertes: { p0: false } }, { merge: true }));
  });

  it("un joueur ne touche pas à l'exploration", async () => {
    await assertFails(alice().doc(SCENE).set({ exploration: 'AAAA' }, { merge: true }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(SCENE).set({ exploration: 'AAAA', explorationRaz: 1 });
    });
    await assertFails(alice().doc(SCENE).set({ explorationRaz: 2 }, { merge: true }));
    await assertFails(alice().doc(SCENE).set({ portesOuvertes: { p0: true }, exploration: 'BBBB' }, { merge: true }));
  });

  it("le MJ écrit portes et exploration ; pas de champ inconnu", async () => {
    await assertSucceeds(bob().doc(SCENE).set({ portesOuvertes: { p0: true }, exploration: 'AAAA', explorationRaz: 1 }));
    await assertFails(bob().doc(SCENE).set({ murs: [] }, { merge: true }));
    await assertFails(bob().doc(SCENE).set({ exploration: 'A'.repeat(20001) }, { merge: true }));
  });

  it('hors de la table : rien', async () => {
    await assertFails(intrus().doc(SCENE).get());
    await assertFails(intrus().doc(SCENE).set({ portesOuvertes: { p0: true } }, { merge: true }));
  });
});

describe('dessins du MJ (L5.4)', () => {
  const mur = (extra: Record<string, unknown> = {}) => ({ type: 'mur', ax: 6, ay: 0, bx: 6, by: 20.5, creeLe: 1, ...extra });

  it('le MJ trace et efface murs, obstacles, portes et mur de force', async () => {
    await assertSucceeds(bob().doc(`${SCENE}/dessins/d1`).set(mur()));
    await assertSucceeds(bob().doc(`${SCENE}/dessins/d2`).set(mur({ type: 'obstacle' })));
    await assertSucceeds(bob().doc(`${SCENE}/dessins/d3`).set(mur({ type: 'porte', ouverte: false })));
    await assertSucceeds(bob().doc(`${SCENE}/dessins/d4`).set(mur({ tours: 3, lanceur: null })));
    await assertSucceeds(bob().doc(`${SCENE}/dessins/d1`).delete());
  });

  it('un joueur voit les dessins mais ne trace ni n\'efface rien', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${SCENE}/dessins/d1`).set(mur());
    });
    await assertSucceeds(alice().collection(`${SCENE}/dessins`).get());
    await assertFails(alice().doc(`${SCENE}/dessins/d2`).set(mur()));
    await assertFails(alice().doc(`${SCENE}/dessins/d1`).delete());
    await assertFails(intrus().collection(`${SCENE}/dessins`).get());
  });

  it('forme refusée : type, coordonnée, tours, champ inconnu', async () => {
    await assertFails(bob().doc(`${SCENE}/dessins/d1`).set(mur({ type: 'fosse' })));
    await assertFails(bob().doc(`${SCENE}/dessins/d1`).set(mur({ ax: -1 })));
    await assertFails(bob().doc(`${SCENE}/dessins/d1`).set(mur({ tours: 0 })));
    await assertFails(bob().doc(`${SCENE}/dessins/d1`).set(mur({ couleur: '#ffffff' })));
  });

  it('un joueur ouvre une porte dessinée comme une porte du .dd2vtt', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${SCENE}/dessins/d-porte`).set(mur({ type: 'porte', ouverte: false }));
    });
    await assertSucceeds(alice().doc(SCENE).set({ portesOuvertes: { 'd-porte': true } }, { merge: true }));
  });
});
