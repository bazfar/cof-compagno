import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/*
 * Règles du bestiaire du MJ (lot L3.2), contre l'émulateur.
 * Table « t1 » : Bob est MJ, Alice est joueuse.
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
  });
});

afterAll(async () => {
  await env.cleanup();
});

const pour = (uid: string) => env.authenticatedContext(uid).firestore();
const monstre = (extra: Record<string, unknown> = {}) => ({
  nom: 'Gobelin éclaireur', race: ['humanoïdes'], pv: 6, def: 11, init: 4, atk: 2, dangerosite: 1, boss: false,
  role: 'controleur', taille: 'petite', attaques: [], capacitesSpeciales: [], lore: 'Sentinelle.', emoji: '👺',
  origine: 'v1', majLe: 1, ...extra,
});

describe('bestiaire du MJ (L3.2)', () => {
  it('le MJ seul le lit, l’écrit et le supprime ; une joueuse ne voit rien, même par requête', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/bestiaire/goblin_eclaireur`).set(monstre()));
    await assertSucceeds(pour('bob').collection(`${TABLE}/bestiaire`).get());
    await assertFails(pour('alice').doc(`${TABLE}/bestiaire/goblin_eclaireur`).get());
    await assertFails(pour('alice').collection(`${TABLE}/bestiaire`).get());
    await assertFails(pour('alice').doc(`${TABLE}/bestiaire/mj_x`).set(monstre({ origine: 'mj' })));
    await assertFails(pour('alice').doc(`${TABLE}/bestiaire/goblin_eclaireur`).delete());
    await assertSucceeds(pour('bob').doc(`${TABLE}/bestiaire/goblin_eclaireur`).delete());
  });

  it('forme refusée : PV nuls, dangerosité 6, origine inconnue, id dans le document', async () => {
    await assertFails(pour('bob').doc(`${TABLE}/bestiaire/m1`).set(monstre({ pv: 0 })));
    await assertFails(pour('bob').doc(`${TABLE}/bestiaire/m1`).set(monstre({ dangerosite: 6 })));
    await assertFails(pour('bob').doc(`${TABLE}/bestiaire/m1`).set(monstre({ origine: 'autre' })));
    await assertFails(pour('bob').doc(`${TABLE}/bestiaire/m1`).set(monstre({ id: 'm1' })));
  });

  it('listes de référence : MJ seul, et seulement armes, armures, équilibrage', async () => {
    await assertSucceeds(pour('bob').doc(`${TABLE}/bestiaireDonnees/armes`).set({ liste: [] }));
    await assertFails(pour('bob').doc(`${TABLE}/bestiaireDonnees/autre`).set({ liste: [] }));
    await assertFails(pour('alice').doc(`${TABLE}/bestiaireDonnees/armes`).get());
    await assertFails(pour('alice').doc(`${TABLE}/bestiaireDonnees/armes`).set({ liste: [] }));
  });
});
