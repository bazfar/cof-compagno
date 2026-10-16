import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Lot L2.5 : dés, barre de progression, crans donnés par le MJ (transaction)
 * et journal de dés commun, observés à travers un faux SDK Firestore. Les
 * champs des documents sont comparés à firestore.rules.
 */

const appels: { fn: string; chemin: string; donnees: unknown }[] = [];
/** Fiches « en base » pour la transaction : chemin → données. */
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lire = (o: Record<string, unknown> | undefined, chemin: string) =>
    chemin.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
  return {
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) =>
      p.length ? { chemin: p.join('/') } : { chemin: `${(parent as { chemin: string }).chemin}/auto${++n}` },
    addDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'addDoc', chemin: r.chemin, donnees }); },
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => ({ exists: () => base.has(r.chemin), get: (c: string) => lire(base.get(r.chemin), c) }),
        set: (r: { chemin: string }, donnees: unknown) => { ecritures.push({ fn: 'tx.set', chemin: r.chemin, donnees }); },
        update: (r: { chemin: string }, donnees: unknown) => { ecritures.push({ fn: 'tx.update', chemin: r.chemin, donnees }); },
      };
      const r = await f(tx); // une exception annule tout : rien n'est écrit
      appels.push(...ecritures);
      return r;
    },
  };
});

const { session } = await import('../../src/lib/session.svelte');
const { lancerFormule, formuleTest, texteJet } = await import('../../src/lib/regles/des');
const { cransRequis, ajouterCran, barreNiveau, NIVEAU_PLAFOND } = await import('../../src/lib/regles/progression');
const { donnerCran, RefusCran } = await import('../../src/lib/actions/progression');
const { noterJet, lancerEtNoter } = await import('../../src/lib/actions/journal');
const { schemaJalon } = await import('../../src/lib/schemas/jalon');
const { schemaJetJournal } = await import('../../src/lib/schemas/journal');

const regles = readFileSync('firestore.rules', 'utf8');
function champsAutorises(ancre: string): string[] {
  const corps = regles.slice(regles.indexOf(ancre));
  return /hasOnly\(\[([^\]]*)\]\)/.exec(corps)![1]!.split(',').map((c) => c.trim().replace(/'/g, '')).sort();
}
/** Dés fixés : chaque appel rend la valeur suivante de la liste. */
const des = (...v: number[]) => () => v.shift()!;

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'mj';
  session.nom = 'Thomas';
});

describe('dés', () => {
  it('formules lues : nombre de dés, faces, bonus ; espaces ignorés', () => {
    expect(lancerFormule('2d6+3', des(0, 0.99))).toEqual({ des: [1, 6], faces: 6, bonus: 3, total: 10 });
    expect(lancerFormule(' d20 - 2 ', des(0.5))).toEqual({ des: [11], faces: 20, bonus: -2, total: 9 });
    expect(lancerFormule('1D100', des(0.999))?.total).toBe(100);
  });

  it('formules refusées : illisibles ou démesurées', () => {
    for (const f of ['', 'd', '2d', '0d6', '101d6', '1d1', '1d1001', '1d6+1001', '1d6*2', '3', 'deux dés']) expect(lancerFormule(f), f).toBeNull();
    expect(lancerFormule('100d1000+1000')).not.toBeNull();
  });

  it('test d20 + modificateur, et le texte d’un jet', () => {
    expect([formuleTest(3), formuleTest(-1), formuleTest(0)]).toEqual(['1d20+3', '1d20-1', '1d20']);
    expect(texteJet('1d20+3', { des: [14], faces: 20, bonus: 3, total: 17 })).toBe('1d20+3 → 14 + 3 = 17');
    expect(texteJet('1d20-1', { des: [14], faces: 20, bonus: -1, total: 13 })).toBe('1d20-1 → 14 − 1 = 13');
    expect(texteJet('2d6', { des: [2, 5], faces: 6, bonus: 0, total: 7 })).toBe('2d6 → 2 + 5 = 7');
    expect(texteJet('1d20', { des: [14], faces: 20, bonus: 0, total: 14 })).toBe('1d20 → 14');
  });
});

describe('barre de progression (cadrage : 3, 4, 5, 6 crans ; plafond 12)', () => {
  it('crans requis par niveau visé', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(cransRequis)).toEqual([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6]);
    expect(cransRequis(NIVEAU_PLAFOND)).toBeNull();
    expect(NIVEAU_PLAFOND).toBe(12);
  });

  it('un cran retiré ne descend jamais sous zéro', () => {
    expect([ajouterCran(2, 1), ajouterCran(2, -1), ajouterCran(0, -1)]).toEqual([3, 1, 0]);
  });

  it('barre : part remplie, pleine à partir du requis, pleine au-delà sans déborder ; au plafond, rien à remplir', () => {
    expect(barreNiveau({ niveau: 4, progression: { crans: 2 } })).toEqual({ crans: 2, requis: 4, pleine: false, part: 0.5 });
    expect(barreNiveau({ niveau: 4, progression: { crans: 4 } }).pleine).toBe(true);
    expect(barreNiveau({ niveau: 4, progression: { crans: 6 } })).toMatchObject({ pleine: true, part: 1 });
    expect(barreNiveau({ niveau: 12, progression: { crans: 3 } })).toEqual({ crans: 3, requis: null, pleine: false, part: 1 });
  });
});

describe('crans donnés par le MJ (transaction)', () => {
  it('le document du cran et le compte de la fiche, ensemble, et rien d’autre', async () => {
    base.set('tables/t1/persos/p-1', { niveau: 3, progression: { crans: 2 } });
    expect(await donnerCran('p-1', 1, '  Le pont tenu  ')).toBe(3);
    expect(appels).toHaveLength(2);
    const [jalon, compte] = appels;
    expect(jalon).toMatchObject({ fn: 'tx.set', chemin: expect.stringMatching(/^tables\/t1\/persos\/p-1\/jalons\/.+/) });
    expect(jalon!.donnees).toEqual({ barre: 'niveau', delta: 1, libelle: 'Le pont tenu', parUid: 'mj', creeLe: expect.any(Number) });
    expect(compte).toEqual({ fn: 'tx.update', chemin: 'tables/t1/persos/p-1', donnees: { 'progression.crans': 3 } });
  });

  it('retirer à zéro est refusé, et rien n’est écrit ; un personnage disparu aussi', async () => {
    base.set('tables/t1/persos/p-1', { progression: { crans: 0 } });
    await expect(donnerCran('p-1', -1, '')).rejects.toThrow(RefusCran);
    await expect(donnerCran('p-absent', 1, '')).rejects.toThrow('n’existe plus');
    expect(appels).toEqual([]);
    base.set('tables/t1/persos/p-1', { progression: { crans: 1 } });
    expect(await donnerCran('p-1', -1, 'Critique')).toBe(0);
  });

  it('motif tronqué à 80 caractères ; jalon aligné sur jalonValide', async () => {
    base.set('tables/t1/persos/p-1', { progression: { crans: 0 } });
    await donnerCran('p-1', 1, 'x'.repeat(200));
    expect((appels[0]!.donnees as { libelle: string }).libelle).toHaveLength(80);
    expect(champsAutorises('function jalonValide(')).toEqual(Object.keys(schemaJalon.shape).sort());
  });
});

describe('journal de dés commun', () => {
  it('un jet noté : auteur, personnage, formule sans espaces, dés et total ; un seul addDoc', async () => {
    session.uid = 'alice';
    session.nom = 'Alice';
    const jet = await lancerEtNoter('Test de Force', '1d20 + 2', 'Kargash', des(0.5));
    expect(jet).toEqual({ des: [11], faces: 20, bonus: 2, total: 13 });
    expect(appels).toEqual([
      {
        fn: 'addDoc',
        chemin: 'tables/t1/journal',
        donnees: { auteurUid: 'alice', auteurNom: 'Alice', perso: 'Kargash', libelle: 'Test de Force', formule: '1d20+2', des: [11], bonus: 2, total: 13, creeLe: expect.any(Number) },
      },
    ]);
  });

  it('formule illisible : rien n’est noté ; sans personnage : pas de champ perso', async () => {
    expect(await lancerEtNoter('Jet libre', '2d', undefined)).toBeNull();
    expect(appels).toEqual([]);
    await noterJet('Jet libre', '1d6', { des: [4], faces: 6, bonus: 0, total: 4 });
    expect(appels[0]!.donnees).not.toHaveProperty('perso');
  });

  it('jet aligné sur jetValide', () => {
    expect(champsAutorises('function jetValide(')).toEqual(Object.keys(schemaJetJournal.shape).sort());
  });
});
