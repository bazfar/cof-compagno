import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Écritures des fiches (lot L2.1), observées à travers un faux SDK
 * Firestore : quel document, quels champs. Garde-fou du bug v1 de versJSON
 * (fiche entière réécrite à chaque action, champs effacés au passage) :
 * hors création, une action n'écrit QUE ses champs. Les champs autorisés
 * sont aussi comparés à firestore.rules.
 */

const appels: { fn: string; chemin: string; donnees: unknown }[] = [];
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ chemin: p.join('/') }),
  setDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'setDoc', chemin: r.chemin, donnees }); },
  updateDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees }); },
  deleteDoc: async (r: { chemin: string }) => { appels.push({ fn: 'deleteDoc', chemin: r.chemin, donnees: undefined }); },
}));

const { session } = await import('../../src/lib/session.svelte');
const actions = await import('../../src/lib/actions/persos');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { schemaFiche } = await import('../../src/lib/schemas/fiche');
const { LIMITE_PORTRAIT, schemaPortrait } = await import('../../src/lib/schemas/portrait');

const FICHE_V1 = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fiches-v1.json'), 'utf8')).fiches[0];
const regles = readFileSync('firestore.rules', 'utf8');

beforeEach(() => {
  appels.length = 0;
  session.table = 't1';
  session.uid = 'alice';
});

describe('écritures champ par champ', () => {
  it('PV : seul pvActuel, borné à 0 et au maximum', async () => {
    await actions.modifierPV('p-1', 25, 18);
    await actions.modifierPV('p-1', -4, 18);
    expect(appels).toEqual([
      { fn: 'updateDoc', chemin: 'tables/t1/persos/p-1', donnees: { pvActuel: 18 } },
      { fn: 'updateDoc', chemin: 'tables/t1/persos/p-1', donnees: { pvActuel: 0 } },
    ]);
  });

  it('bourse : seules les pièces', async () => {
    await actions.modifierPieces('p-1', { piecesOr: 12.4, piecesArgent: -3, piecesBronze: 7 });
    expect(appels[0]?.donnees).toEqual({ piecesOr: 12, piecesArgent: 0, piecesBronze: 7 });
  });

  it('personnage actif : le document du joueur connecté', async () => {
    await actions.choisirPersoActif('p-1');
    expect(appels[0]).toEqual({ fn: 'updateDoc', chemin: 'tables/t1/joueurs/alice', donnees: { persoActif: 'p-1' } });
  });

  it('création : la fiche entière, validée ; un champ inconnu est refusé avant d\'écrire', async () => {
    const { fiche } = ficheDepuisV1(FICHE_V1, 'alice', 1);
    await actions.creerPerso('p-1', fiche);
    expect(appels[0]?.chemin).toBe('tables/t1/persos/p-1');
    expect(schemaFiche.parse(appels[0]?.donnees)).toEqual(fiche);
    await expect(actions.creerPerso('p-2', { ...fiche, def: 14 } as never)).rejects.toThrow();
    expect(appels).toHaveLength(1);
  });
});

describe('fiche vivante (L2.3)', () => {
  it('PP bornés, notes tronquées : un seul champ chacun', async () => {
    await actions.modifierPP('p-1', 30, 12);
    await actions.modifierNotes('p-1', 'x'.repeat(10_050));
    expect(appels[0]).toEqual({ fn: 'updateDoc', chemin: 'tables/t1/persos/p-1', donnees: { ppActuel: 12 } });
    expect(appels[1]?.chemin).toBe('tables/t1/persos/p-1');
    expect(Object.keys(appels[1]?.donnees as object)).toEqual(['notes']);
    expect((appels[1]?.donnees as { notes: string }).notes).toHaveLength(10_000);
  });

  it('le portrait va dans son propre document, jamais dans la fiche ; une image invalide est refusée', async () => {
    await actions.enregistrerPortrait('p-1', 'data:image/jpeg;base64,AAAA');
    await actions.retirerPortrait('p-1');
    expect(appels[0]).toMatchObject({ fn: 'setDoc', chemin: 'tables/t1/persos/p-1/images/portrait', donnees: { image: 'data:image/jpeg;base64,AAAA' } });
    expect(appels[1]).toEqual({ fn: 'deleteDoc', chemin: 'tables/t1/persos/p-1/images/portrait', donnees: undefined });
    await expect(actions.enregistrerPortrait('p-1', 'https://exemple.fr/image.png')).rejects.toThrow();
    expect(appels).toHaveLength(2);
  });
});

describe('schéma de fiche aligné sur firestore.rules', () => {
  it('mêmes champs autorisés des deux côtés', () => {
    const corps = regles.slice(regles.indexOf('function ficheValide('));
    const liste = /hasOnly\(\[([^\]]*)\]\)/.exec(corps)?.[1] ?? '';
    const champsRegles = liste.split(',').map((c) => c.trim().replace(/'/g, '')).filter(Boolean).sort();
    expect(champsRegles).toEqual(Object.keys(schemaFiche.shape).sort());
  });

  it('portrait : mêmes champs et même limite que portraitValide', () => {
    const corps = regles.slice(regles.indexOf('function portraitValide('));
    const liste = /hasOnly\(\[([^\]]*)\]\)/.exec(corps)?.[1] ?? '';
    expect(liste.split(',').map((c) => c.trim().replace(/'/g, '')).sort()).toEqual(Object.keys(schemaPortrait.shape).sort());
    expect(corps).toContain(`d.image.size() <= ${LIMITE_PORTRAIT}`);
  });
});
