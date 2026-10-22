import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * PNJ, attitude et réputation (lot S1, décisions de Thomas du 22/10/2026) :
 * l'échelle à six crans et son DD (15a), le départ selon la réputation
 * (16a, 4a), le service rendu (17a, seul chemin vers Allié, 13c), le repère
 * des joueurs (14b, 18a), la réputation et l'effet sur les prix (5, 12a),
 * les PNJ tirés du lore (3a), et les écritures en transaction à travers un
 * faux SDK Firestore.
 */

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  return {
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? { chemin: p.join('/') } : { chemin: `${(parent as { chemin: string }).chemin}/auto${++n}` }),
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
    },
    deleteDoc: async (r: { chemin: string }) => {
      appels.push({ fn: 'deleteDoc', chemin: r.chemin });
    },
    writeBatch: () => {
      const lot: typeof appels = [];
      return {
        set: (r: { chemin: string }, donnees: unknown) => lot.push({ fn: 'lot.set', chemin: r.chemin, donnees }),
        commit: async () => {
          appels.push(...lot);
        },
      };
    },
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => lu(r.chemin),
        set: (r: { chemin: string }, donnees: unknown) => {
          ecritures.push({ fn: 'tx.set', chemin: r.chemin, donnees });
        },
      };
      const r = await f(tx);
      appels.push(...ecritures);
      return r;
    },
  };
});

const { session } = await import('../../src/lib/session.svelte');
const A = await import('../../src/lib/pnj/attitude');
const P = await import('../../src/lib/actions/pnj');
const { schemaPnj } = await import('../../src/lib/schemas/pnj');
const { schemaReputationV1 } = await import('../../src/lib/schemas/reputation');
type Pnj = import('../../src/lib/schemas/pnj').Pnj;
type ReputationGroupe = import('../../src/lib/schemas/reputation').ReputationGroupe;

const pnj = (p: Partial<Pnj> = {}): Pnj => ({ nom: 'Aude Berlan', faction: null, lore: null, rencontre: false, cran: null, tendance: null, mensonges: 0, peuple: false, secrets: [], creeLe: 1, majLe: 1, ...p });
const rep = (scores: Record<string, number>): ReputationGroupe => ({ scores, majLe: 1 });
const vu = (cran: Pnj['cran'], p: Partial<Pnj> = {}) => pnj({ rencontre: true, cran, ...p });

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'mj';
});

describe('réputation (5, 12a)', () => {
  it('src/donnees/reputation.json : l’échelle v1 couvre −10 à +10, cinq blocs, les Fils plafonnés à +5', () => {
    const r = schemaReputationV1.parse(JSON.parse(readFileSync('src/donnees/reputation.json', 'utf8')));
    expect(r.echelle.map((p) => p.id)).toEqual(['allie_legendaire', 'fiable', 'reconnu', 'neutre', 'mefiant', 'deteste', 'nemesis']);
    expect(r.factions.map((f) => [f.id, f.plafond])).toEqual([
      ['comptoir', 10],
      ['serment_libris', 10],
      ['garde_citoyenne', 10],
      ['cercle_peuples', 10],
      ['fils_libris', 5],
    ]);
    expect(() => schemaReputationV1.parse({ ...r, echelle: r.echelle.filter((p) => p.id !== 'neutre') })).toThrow();
  });

  it('palier, score par défaut à 0, bornes −10 et plafond', () => {
    expect([-10, -9, -6, -5, -2, -1, 1, 2, 5, 6, 9, 10].map((s) => A.palierDe(s).id)).toEqual([
      'nemesis', 'deteste', 'deteste', 'mefiant', 'mefiant', 'neutre', 'neutre', 'reconnu', 'reconnu', 'fiable', 'fiable', 'allie_legendaire',
    ]);
    expect(A.scoreDe(null, 'comptoir')).toBe(0);
    expect(A.ajusterScore(rep({ fils_libris: 5 }), 'fils_libris', 1)).toBe(5);
    expect(A.ajusterScore(rep({ comptoir: 9 }), 'comptoir', 1)).toBe(10);
    expect(A.ajusterScore(rep({ comptoir: 10 }), 'comptoir', 1)).toBe(10);
    expect(A.ajusterScore(rep({ comptoir: -10 }), 'comptoir', -1)).toBe(-10);
    expect(A.ajusterScore(null, 'garde_citoyenne', -1)).toBe(-1);
    expect(() => A.ajusterScore(null, 'solvarn', 1)).toThrow(A.RefusAttitude);
  });

  it('l’effet sur les prix, en clair', () => {
    expect([10, 6, 3, 0, -3, -7, -10].map((s) => A.effetPrix(A.palierDe(s)))).toEqual([
      'Prix −20 %', 'Prix −10 %', 'Prix normaux', 'Prix normaux', 'Prix +10 %', 'Prix +25 %', 'Commerce refusé',
    ]);
  });
});

describe('attitude (13c, 15a, 16a, 17a)', () => {
  it('six crans, du plus hostile au plus proche, et leur modificateur de DD social', () => {
    expect(A.CRANS_ATTITUDE.map((c) => [A.NOMS_CRANS[c], A.MOD_DD_ATTITUDE[c]])).toEqual([
      ['Hostile', 2], ['Méfiant', 1], ['Neutre', 0], ['Connaissance', -1], ['Favorable', -2], ['Allié', -3],
    ]);
  });

  it('départ : la réputation de la faction (16a) ; sans faction de réputation, Neutre (4a)', () => {
    const depart = (s: number) => A.cranDeDepart('comptoir', rep({ comptoir: s }));
    expect([-10, -7, -3, 0, 3, 7, 10].map(depart)).toEqual(['hostile', 'hostile', 'mefiant', 'neutre', 'connaissance', 'favorable', 'allie']);
    expect(A.cranDeDepart('comptoir', null)).toBe('neutre');
    expect(A.cranDeDepart(null, rep({ comptoir: 10 }))).toBe('neutre');
    // Une faction hors des blocs n'a pas de réputation, même si un score traîne dans le document.
    expect(A.cranDeDepart('solvarn', rep({ solvarn: 10 }))).toBe('neutre');
  });

  it('rencontrer : visible, au cran de départ, sans tendance ; pas deux fois', () => {
    expect(A.rencontrer(pnj({ faction: 'fils_libris' }), rep({ fils_libris: -6 }), 9)).toEqual(pnj({ faction: 'fils_libris', rencontre: true, cran: 'hostile', majLe: 9 }));
    expect(() => A.rencontrer(vu('neutre'), null, 9)).toThrow('déjà rencontré');
  });

  it('service rendu : un cran de mieux à tout cran, jusqu’à Allié ; pas au-delà, ni avant la rencontre', () => {
    expect(A.rendreService(vu('hostile'), 5)).toEqual(vu('mefiant', { tendance: 'hausse', majLe: 5 }));
    expect(A.rendreService(vu('favorable', { tendance: 'baisse' }), 5).cran).toBe('allie');
    expect(() => A.rendreService(vu('allie'), 5)).toThrow('déjà Allié');
    expect(() => A.rendreService(pnj(), 5)).toThrow('pas encore rencontré');
  });

  it('correction du MJ : un cran, jamais jusqu’à Allié (13c), jamais sous Hostile', () => {
    expect(A.corrigerCran(vu('neutre'), 1, 3)).toEqual(vu('connaissance', { tendance: 'hausse', majLe: 3 }));
    expect(A.corrigerCran(vu('connaissance'), 1, 3).cran).toBe('favorable');
    expect(A.corrigerCran(vu('allie'), -1, 3)).toEqual(vu('favorable', { tendance: 'baisse', majLe: 3 }));
    expect(() => A.corrigerCran(vu('favorable'), 1, 3)).toThrow('Seul un service rendu fait passer Allié.');
    expect(() => A.corrigerCran(vu('hostile'), -1, 3)).toThrow('déjà Hostile');
    expect(() => A.corrigerCran(pnj(), -1, 3)).toThrow('pas encore rencontré');
  });

  it('repère des joueurs (14b, 18a) : le cran, le sens du dernier changement, et le conseil à Favorable', () => {
    expect(A.repere(pnj())).toBeNull();
    expect(A.repere(vu('connaissance', { tendance: 'hausse' }))).toEqual({ cran: 'Connaissance', fleche: '↑', conseil: null });
    expect(A.repere(vu('mefiant', { tendance: 'baisse' }))).toEqual({ cran: 'Méfiant', fleche: '↓', conseil: null });
    expect(A.repere(vu('favorable'))).toEqual({ cran: 'Favorable', fleche: null, conseil: 'Un service rendu pourrait en faire un allié.' });
    expect(A.repere(vu('allie'))?.conseil).toBeNull();
  });

  it('schéma : un PNJ rencontré a un cran, un PNJ pas encore rencontré n’en a pas', () => {
    expect(() => schemaPnj.parse(pnj({ cran: 'neutre' }))).toThrow();
    expect(() => schemaPnj.parse(pnj({ rencontre: true }))).toThrow();
    expect(schemaPnj.parse(vu('allie'))).toEqual(vu('allie'));
  });
});

describe('PNJ du lore (3a)', () => {
  const fiche = (id: string, titre: string, faction: string | undefined, source = `v1:pnj:${id.slice(4)}`) => ({ id, titre, categorie: 'Personnages', etiquettes: faction ? [faction, 'Rencontré'] : [], source });

  it('la faction du lore v1 désigne un bloc de la réputation, article ou non', () => {
    expect(['Comptoir', 'Le Comptoir', 'Serment de Libris', 'Garde Citoyenne', 'Cercle des Peuples', 'Fils de Libris', 'Les Fils de Libris'].map(A.factionDuLore)).toEqual([
      'comptoir', 'comptoir', 'serment_libris', 'garde_citoyenne', 'cercle_peuples', 'fils_libris', 'fils_libris',
    ]);
    expect([A.factionDuLore('Solvarn'), A.factionDuLore('Citoyens de Libris'), A.factionDuLore(undefined)]).toEqual([null, null, null]);
  });

  it('une fiche PNJ_CLES devient un PNJ pas encore rencontré, lié à sa fiche ; ni doublon, ni autre fiche', () => {
    const fiches = [
      fiche('pnj-aude-berlan', 'Aude Berlan', 'Citoyens de Libris'),
      fiche('pnj-selyne', 'Selyne', 'Comptoir'),
      fiche('pnj-deja', 'Déjà là', 'Comptoir'),
      fiche('section-libris', 'Libris', undefined, 'v1:section:libris'),
      { id: 'pnj-main', titre: 'Écrit à la main', categorie: 'Personnages', etiquettes: [] },
    ];
    expect(A.pnjDepuisLore(fiches, new Set(['pnj-deja']), 7)).toEqual([
      { id: 'pnj-aude-berlan', pnj: pnj({ nom: 'Aude Berlan', lore: 'pnj-aude-berlan', creeLe: 7, majLe: 7 }) },
      { id: 'pnj-selyne', pnj: pnj({ nom: 'Selyne', faction: 'comptoir', lore: 'pnj-selyne', creeLe: 7, majLe: 7 }) },
    ]);
  });

  it('identifiant d’un PNJ créé à la main', () => {
    expect(A.nouvelIdPnj('Le Vieux Ferrand')).toMatch(/^vieux-ferrand-[a-z0-9]+$/);
    expect(A.nouvelIdPnj('!!!')).toMatch(/^pnj-[a-z0-9]+$/);
  });
});

describe('écritures', () => {
  const chemin = 'tables/t1/pnj/pnj-selyne';

  it('rencontrer : relit la réputation, écrit le PNJ et le geste « rencontre » dans son historique', async () => {
    base.set(chemin, pnj({ nom: 'Selyne', faction: 'comptoir' }));
    base.set('tables/t1/reputation/groupe', rep({ comptoir: 4 }));
    const p = await P.rencontrerPnj('pnj-selyne', 's0014');
    expect(p.cran).toBe('connaissance');
    expect(appels.map((a) => [a.fn, a.chemin.replace(/auto\d+$/, 'auto')])).toEqual([
      ['tx.set', chemin],
      ['tx.set', `${chemin}/historique/auto`],
    ]);
    expect(appels[1]!.donnees).toMatchObject({ geste: 'rencontre', avant: null, apres: 'connaissance', motif: 'Première rencontre', parUid: 'mj', seance: 's0014' });
  });

  it('service rendu et correction : un motif obligatoire, gardé dans l’historique', async () => {
    base.set(chemin, vu('favorable', { nom: 'Selyne' }));
    expect(() => P.rendreServicePnj('pnj-selyne', '  ')).toThrow('Dis quel service');
    expect(() => P.corrigerAttitudePnj('pnj-selyne', 1, '')).toThrow('Dis pourquoi');
    expect((await P.rendreServicePnj('pnj-selyne', 'Dette payée au Comptoir')).cran).toBe('allie');
    expect(appels[1]!.donnees).toMatchObject({ geste: 'service', avant: 'favorable', apres: 'allie', motif: 'Dette payée au Comptoir' });
    expect(appels[1]!.donnees).not.toHaveProperty('seance');
    appels.length = 0;
    await expect(P.corrigerAttitudePnj('pnj-selyne', 1, 'Flatterie')).rejects.toThrow('service rendu');
    expect(appels).toEqual([]);
  });

  it('S2 : un mensonge découvert, deux crans de moins, motif obligatoire, dans l’historique', async () => {
    base.set(chemin, vu('connaissance', { nom: 'Selyne', mensonges: 2 }));
    expect(() => P.mensongeDecouvertPnj('pnj-selyne', '')).toThrow('Dis comment');
    const p = await P.mensongeDecouvertPnj('pnj-selyne', 'Le sceau était faux', 's0015');
    expect([p.cran, p.mensonges, p.tendance]).toEqual(['mefiant', 1, 'baisse']);
    expect(appels[1]!.donnees).toMatchObject({ geste: 'mensonge', avant: 'connaissance', apres: 'mefiant', motif: 'Le sceau était faux', seance: 's0015' });
  });

  it('un PNJ disparu est refusé', async () => {
    await expect(P.rencontrerPnj('pnj-absent')).rejects.toThrow('n’existe plus');
  });

  it('la réputation : un document pour la table, borné au plafond', async () => {
    base.set('tables/t1/reputation/groupe', rep({ fils_libris: 5, comptoir: 2 }));
    expect(await P.ajusterReputation('fils_libris', 1)).toBe(5);
    expect(await P.ajusterReputation('garde_citoyenne', -1)).toBe(-1);
    expect(appels.map((a) => a.chemin)).toEqual(['tables/t1/reputation/groupe', 'tables/t1/reputation/groupe']);
    expect((appels[1]!.donnees as ReputationGroupe).scores).toEqual({ fils_libris: 5, comptoir: 2, garde_citoyenne: -1 });
  });

  it('créer à la main, importer du lore (sans doublon), retirer un PNJ pas encore rencontré seulement', async () => {
    const id = await P.creerPnj('Vieux Ferrand', 'garde_citoyenne');
    expect(appels[0]).toMatchObject({ fn: 'setDoc', chemin: `tables/t1/pnj/${id}`, donnees: { nom: 'Vieux Ferrand', faction: 'garde_citoyenne', rencontre: false, cran: null } });
    await expect(P.creerPnj('X', 'solvarn')).rejects.toThrow('Faction inconnue');
    appels.length = 0;
    const n = await P.importerPnjDuLore([{ id: 'pnj-a', titre: 'A', categorie: 'Personnages', etiquettes: [], source: 'v1:pnj:a' }, { id: 'pnj-b', titre: 'B', categorie: 'Personnages', etiquettes: [], source: 'v1:pnj:b' }], new Set(['pnj-b']));
    expect(n).toBe(1);
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([['lot.set', 'tables/t1/pnj/pnj-a']]);
    appels.length = 0;
    await expect(P.retirerPnj('pnj-a', vu('neutre', { nom: 'A' }))).rejects.toThrow('mémoire du groupe');
    await P.retirerPnj('pnj-a', pnj({ nom: 'A' }));
    expect(appels).toEqual([{ fn: 'deleteDoc', chemin: 'tables/t1/pnj/pnj-a' }]);
  });
});

describe('règles Firestore alignées sur les données', () => {
  it('les blocs, leurs plafonds et les six crans de firestore.rules suivent reputation.json et src/regles/attitude.ts', () => {
    const regles = readFileSync('firestore.rules', 'utf8');
    const liste = (fn: string) => JSON.parse(new RegExp(`function ${fn}\\(\\) \\{\\s*return (\\[[^\\]]*\\]);`).exec(regles)![1]!.replace(/'/g, '"'));
    expect(liste('factionsReputation')).toEqual(A.FACTIONS_REPUTATION.map((f) => f.id));
    expect(liste('cransAttitude')).toEqual([...A.CRANS_ATTITUDE]);
    for (const f of A.FACTIONS_REPUTATION) expect(regles).toContain(`scoreValide(d.scores.get('${f.id}', 0), ${f.plafond})`);
  });
});
