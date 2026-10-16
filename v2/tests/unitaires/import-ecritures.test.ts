import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Écritures des fiches v1 déposées (lot L2.2c), observées à travers un faux
 * SDK Firestore, et schéma aligné sur firestore.rules.
 */

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ chemin: p.join('/') }),
  setDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'setDoc', chemin: r.chemin, donnees }); },
  updateDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees }); },
  deleteDoc: async (r: { chemin: string }) => { appels.push({ fn: 'deleteDoc', chemin: r.chemin }); },
}));

const { session } = await import('../../src/lib/session.svelte');
const actions = await import('../../src/lib/actions/imports');
const { schemaImportV1, LIMITE_V1_JSON } = await import('../../src/lib/schemas/import-v1');

beforeEach(() => {
  appels.length = 0;
  session.table = 't1';
});

describe('fiches v1 déposées', () => {
  it('dépôt : le document entier, validé ; reprise : seul reprisPar', async () => {
    await actions.deposerImportV1('v1-a', { proprietaireUid: 'alice', nom: 'Shyrion', v1Json: '{}' });
    await actions.marquerImportRepris('v1-a', 'p-1');
    await actions.supprimerImportV1('v1-a');
    expect(appels[0]).toMatchObject({ fn: 'setDoc', chemin: 'tables/t1/importsV1/v1-a', donnees: { proprietaireUid: 'alice', nom: 'Shyrion', v1Json: '{}' } });
    expect(appels.slice(1)).toEqual([
      { fn: 'updateDoc', chemin: 'tables/t1/importsV1/v1-a', donnees: { reprisPar: 'p-1' } },
      { fn: 'deleteDoc', chemin: 'tables/t1/importsV1/v1-a' },
    ]);
  });

  it('un texte v1 trop long est refusé avant d’écrire', async () => {
    await expect(actions.deposerImportV1('v1-b', { proprietaireUid: 'alice', nom: 'X', v1Json: 'x'.repeat(LIMITE_V1_JSON + 1) })).rejects.toThrow();
    expect(appels).toEqual([]);
  });

  it('mêmes champs autorisés que firestore.rules (importValide)', () => {
    const regles = readFileSync('firestore.rules', 'utf8');
    const corps = regles.slice(regles.indexOf('function importValide('));
    const liste = /hasOnly\(\[([^\]]*)\]\)/.exec(corps)?.[1] ?? '';
    expect(liste.split(',').map((c) => c.trim().replace(/'/g, '')).filter(Boolean).sort()).toEqual(Object.keys(schemaImportV1.shape).sort());
    expect(corps).toContain(`d.v1Json.size() <= ${LIMITE_V1_JSON}`);
  });
});
