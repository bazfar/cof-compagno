import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Le socle du combat (lot L6.1, décisions de Thomas du 23/10/2026) :
 * 4a (démarrer depuis une rencontre ou libre), 5a (initiative, égalités),
 * 6a (la main, les combattants à terre sautés), 7a (actions du tour,
 * déplacement, Sprint +2), 8a (hors de son tour, pas de déplacement),
 * 9a (arriver en cours de combat), 3b (PV des monstres en chiffres),
 * 11a (clore).
 */

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  const ref = (chemin: string) => ({ chemin, id: chemin.split('/').pop() });
  return {
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? ref(p.join('/')) : ref(`${(parent as { chemin: string }).chemin}/auto${++n}`)),
    updateDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees });
    },
    writeBatch: () => {
      const ecritures: typeof appels = [];
      return {
        set: (r: { chemin: string }, donnees: unknown, options?: unknown) => ecritures.push({ fn: options ? 'lot.fusion' : 'lot.set', chemin: r.chemin, donnees }),
        update: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'lot.update', chemin: r.chemin, donnees }),
        commit: async () => {
          appels.push(...ecritures);
        },
      };
    },
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => lu(r.chemin),
        update: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'tx.update', chemin: r.chemin, donnees }),
      };
      const r = await f(tx);
      appels.push(...ecritures);
      return r;
    },
  };
});
const journal = vi.hoisted(() => ({ de: 12, lancerEtNoter: vi.fn(), noterJet: vi.fn(async () => {}) }));
vi.mock('../../src/lib/actions/journal', () => ({
  lancerEtNoter: journal.lancerEtNoter.mockImplementation(async (_l: string, f: string) => ({ des: [journal.de], faces: 20, bonus: 0, total: journal.de, formule: f })),
  noterJet: journal.noterJet,
}));
const carte = vi.hoisted(() => ({ marquerMort: vi.fn(async () => {}) }));
vi.mock('../../src/lib/actions/carte', () => carte);

const { session } = await import('../../src/lib/session.svelte');
const O = await import('../../src/lib/combat/ordre');
const D = await import('../../src/lib/combat/demarrage');
const K = await import('../../src/lib/combat/carte');
const A = await import('../../src/lib/actions/combat');
const { pasDeGlisserBorne } = await import('../../src/lib/battlemap/interactions');
const { schemaCombattant } = await import('../../src/lib/schemas/combat');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type Combat = import('../../src/lib/schemas/combat').Combat;

const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: null, de: null, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: null, de: null, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const combat = (c: Partial<Combat> = {}): Combat => ({ nom: 'Les goules', scene: 'cave', rencontre: 'r1', statut: 'encours', round: 1, tour: 1, actif: null, porteesLibres: false, creeLe: 1, closLe: null, ...c });
const avecInit = (c: Combattant & { id: string }, de: number) => ({ ...c, de, initiative: de + c.modInit });
const C = 'tables/t1/combats';

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'mj';
  session.nom = 'Thomas';
  journal.de = 12;
  journal.lancerEtNoter.mockClear();
  journal.noterJet.mockClear();
  carte.marquerMort.mockClear();
});

describe('l’ordre et la main (5a, 6a)', () => {
  it('initiative décroissante ; égalité : le PJ avant le monstre, puis le modificateur ; sans initiative en bas', () => {
    const o = O.ordreCombat([
      avecInit(monstre('A'), 12), // 15
      avecInit(pj('Shyrion', { modInit: 1 }), 14), // 15
      avecInit(pj('Kargash', { modInit: 2 }), 9), // 11
      avecInit(pj('Karlach', { modInit: 4 }), 7), // 11 : meilleur modificateur, avant Kargash
      pj('Hermione'),
      avecInit(monstre('B'), 6), // 9
    ]);
    expect(o.map((c) => c.nom)).toEqual(['Shyrion', 'A', 'Karlach', 'Kargash', 'B', 'Hermione']);
  });

  it('la main suivante saute qui est à terre et qui n’a pas lancé ; revenir en tête ouvre un round', () => {
    const cs = [avecInit(monstre('A'), 12), avecInit(pj('S'), 11), avecInit(monstre('B'), 5), pj('H')];
    expect(O.mainSuivante(cs, 'm-r1-A', 1)).toEqual({ actif: 'pj-S', round: 1 });
    expect(O.mainSuivante(cs, 'pj-S', 1, new Set(['m-r1-B']))).toEqual({ actif: 'm-r1-A', round: 2 });
    expect(O.mainSuivante(cs, 'm-r1-B', 3)).toEqual({ actif: 'm-r1-A', round: 4 });
    expect(O.mainSuivante(cs, null, 1)).toEqual({ actif: 'm-r1-A', round: 1 });
    expect(O.mainSuivante(cs, 'disparu', 2)).toEqual({ actif: 'm-r1-A', round: 2 });
    // Seul debout : il rejoue au round suivant. Personne : la main reste.
    expect(O.mainSuivante([avecInit(pj('S'), 3)], 'pj-S', 1)).toEqual({ actif: 'pj-S', round: 2 });
    expect(O.mainSuivante([pj('S')], 'pj-S', 1)).toEqual({ actif: 'pj-S', round: 1 });
    expect(O.premierActif([pj('S'), pj('H')])).toBeNull();
  });

  it('à terre : le monstre à 0 PV, le PJ mort ; un PJ Mourant garde son tour (L6.2, 7a)', () => {
    const t = O.aTerreDuCombat([monstre('A', { aTerre: true }), monstre('B'), pj('S', { mortEchecs: 3, mort: true }), pj('H', { mortEchecs: 2 }), pj('K')]);
    expect([...t].sort()).toEqual(['m-r1-A', 'pj-S']);
  });
});

describe('les actions du tour (7a)', () => {
  it('celles d’un autre tour comptent comme neuves', () => {
    const c = pj('S', { tourActions: 3, principale: true, secondaire: true, mvt: 4, sprint: true });
    expect(O.actionsDuTour(c, 3)).toEqual({ principale: true, secondaire: true, mvt: 4, sprint: true });
    expect(O.actionsDuTour(c, 4)).toEqual({ principale: false, secondaire: false, mvt: 0, sprint: false });
  });

  it('5 cases, +1 avec le don Mobile, +2 au Sprint', () => {
    expect(O.deplacementDeBase([])).toBe(5);
    expect(O.deplacementDeBase(['mobile', 'alerte'])).toBe(6);
    expect(O.deplacementRestant(pj('S', { tourActions: 2, mvt: 3 }), 2)).toBe(2);
    expect(O.deplacementRestant(pj('S', { tourActions: 2, mvt: 3, principale: true, sprint: true }), 2)).toBe(4);
    expect(O.deplacementRestant(pj('S', { tourActions: 2, mvt: 9 }), 2)).toBe(0);
    expect(O.deplacementRestant(pj('S', { tourActions: 1, mvt: 3 }), 2)).toBe(5);
  });

  it('un pas de glisser ne dépense pas plus de cases qu’il n’en reste', () => {
    const scene = { colonnes: 20, lignes: 20, murs: [], obstacles: [], portes: [] } as never;
    const j = { id: 'pj-S', genre: 'pj', cx: 2, cy: 2 } as never;
    expect(pasDeGlisserBorne(scene, [j], j, { cx: 2, cy: 2 }, { cx: 4, cy: 3 }, 3)).toEqual({ case: { cx: 4, cy: 3 }, cout: 2, arret: null });
    expect(pasDeGlisserBorne(scene, [j], j, { cx: 2, cy: 2 }, { cx: 4, cy: 3 }, 1)).toEqual({ case: { cx: 2, cy: 2 }, cout: 0, arret: 'epuise' });
  });
});

describe('qui entre dans le combat (4a)', () => {
  const fiches = new Map([['shy', { nom: 'Shyrion', uid: 'alice', modInit: 1, dons: ['mobile'] }]]);
  const bestiaire = new Map([['goule', { init: 3, pv: 14, def: 12, armure: 1, resistances: { magique: 0.5 } }]]);
  const rencontre = { id: 'r1', monstres: [{ cle: 'a', monstre: 'goule', nom: 'Goule A', cx: 1, cy: 1 }] };
  const jetons = [
    { id: 'pj-shy', genre: 'pj', nom: 'Shyrion' },
    { id: 'pj-inconnu', genre: 'pj', nom: '?' },
    { id: 'm-r1-a', genre: 'monstre', nom: 'Goule A' },
    { id: 'm-libre', genre: 'monstre', nom: 'Gobelin' },
    { id: 'm-mort', genre: 'monstre', nom: 'Rat', mort: true },
    { id: 'x', genre: 'libre', nom: 'Coffre' },
  ];

  const neutre = { physique: 1, magique: 1 };
  it('les PJ posés avec leur fiche, les monstres vivants avec le bestiaire de la rencontre (DEF, armure, résistances : L6.2) ; un monstre posé à la main attend ses PV et sa DEF', () => {
    const b = D.brouillonDuCombat(jetons, fiches, rencontre, bestiaire);
    expect(b).toEqual([
      { id: 'pj-shy', genre: 'pj', nom: 'Shyrion', perso: 'shy', uid: 'alice', monstre: null, modInit: 1, pvMax: null, def: null, armure: 0, resistances: neutre, mvtBase: 6 },
      { id: 'm-r1-a', genre: 'monstre', nom: 'Goule A', perso: null, uid: null, monstre: 'goule', modInit: 3, pvMax: 14, def: 12, armure: 1, resistances: { physique: 1, magique: 0.5 }, mvtBase: 5 },
      { id: 'm-libre', genre: 'monstre', nom: 'Gobelin', perso: null, uid: null, monstre: null, modInit: 0, pvMax: null, def: null, armure: 0, resistances: neutre, mvtBase: 5 },
    ]);
    expect(D.brouillonDuCombat(jetons, fiches, null, bestiaire).find((c) => c.id === 'm-r1-a')).toMatchObject({ monstre: null, pvMax: null, def: null });
  });

  it('ce qui manque pour démarrer', () => {
    const b = D.brouillonDuCombat(jetons, fiches, rencontre, bestiaire);
    expect(D.manquePourDemarrer(b)).toBe('Donne les PV de Gobelin.');
    expect(D.manquePourDemarrer(b.map((c) => (c.id === 'm-libre' ? { ...c, pvMax: 7 } : c)))).toBe('Donne la DEF de Gobelin.');
    expect(D.manquePourDemarrer(b.map((c) => (c.id === 'm-libre' ? { ...c, pvMax: 7, def: 0 } : c)))).toBeNull();
    expect(D.manquePourDemarrer(b.filter((c) => c.genre === 'monstre'))).toMatch(/Aucun PJ/);
    expect(D.manquePourDemarrer(b.filter((c) => c.genre === 'pj'))).toMatch(/Aucun monstre/);
  });
});

describe('le combat sur la carte (3b, 7a, 8a)', () => {
  const cs = [pj('S', { uid: 'alice', tourActions: 4, mvt: 2 }), pj('H', { uid: 'bob' }), monstre('A', { pv: 9 })];

  it('hors combat, clos ou sur une autre scène : rien', () => {
    expect(K.combatSurCarte(null, cs, 'cave', 'joueur', 'alice')).toBe(K.HORS_COMBAT);
    expect(K.combatSurCarte(combat({ statut: 'clos' }), cs, 'cave', 'joueur', 'alice')).toBe(K.HORS_COMBAT);
    expect(K.combatSurCarte(combat(), cs, 'foret', 'joueur', 'alice')).toBe(K.HORS_COMBAT);
  });

  it('le joueur ne bouge que le combattant qui joue, s’il est à lui, dans ses cases restantes ; le MJ bouge tout', () => {
    const k = K.combatSurCarte(combat({ actif: 'pj-S', tour: 4 }), cs, 'cave', 'joueur', 'alice');
    expect(k.actif).toBe('pj-S');
    expect([...k.bloques].sort()).toEqual(['m-r1-A', 'pj-H']);
    expect(k.budget).toEqual({ id: 'pj-S', cases: 3 });
    expect(K.combatSurCarte(combat({ actif: 'pj-S', tour: 4 }), cs, 'cave', 'joueur', 'bob').budget).toBeNull();
    const mj = K.combatSurCarte(combat({ actif: 'pj-S', tour: 4 }), cs, 'cave', 'mj', 'mj');
    expect(mj.bloques.size).toBe(0);
    expect(mj.budget).toBeNull();
    expect([...k.pvMonstres]).toEqual([['m-r1-A', { actuel: 9, max: 14 }]]);
  });
});

describe('schéma du combattant', () => {
  it('un PJ sans PV ni modèle, un monstre avec ses PV ; initiative et d20 ensemble ; le Sprint prend l’action principale', () => {
    const { id: _i, ...p } = pj('S');
    const { id: _j, ...m } = monstre('A');
    expect(schemaCombattant.safeParse(p).success).toBe(true);
    expect(schemaCombattant.safeParse(m).success).toBe(true);
    expect(schemaCombattant.safeParse({ ...p, pv: 3, pvMax: 3 }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...m, pv: null }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...m, uid: 'x' }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, initiative: 12 }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, sprint: true }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, sprint: true, principale: true }).success).toBe(true);
  });
});

describe('écritures', () => {
  const brouillon = [
    { id: 'pj-shy', genre: 'pj' as const, nom: 'Shyrion', perso: 'shy', uid: 'alice', monstre: null, modInit: 1, pvMax: null, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mvtBase: 5 },
    { id: 'm-r1-a', genre: 'monstre' as const, nom: 'Goule A', perso: null, uid: null, monstre: 'goule', modInit: 3, pvMax: 14, def: 12, armure: 2, resistances: { physique: 0.5, magique: 1 }, mvtBase: 5 },
  ];

  it('démarrer : le combat, ses combattants, la table ; les monstres lancent leur initiative au journal, la main au premier', async () => {
    const id = await A.demarrerCombat({ nom: 'Les goules', scene: 'cave', rencontre: 'r1', combattants: brouillon }, null, () => 0.5); // d20 = 11
    expect(id).toMatch(/^auto\d+$/);
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([
      ['lot.set', `${C}/${id}`],
      ['lot.set', `${C}/${id}/combattants/pj-shy`],
      ['lot.set', `${C}/${id}/combattants/m-r1-a`],
      ['lot.fusion', 'tables/t1'],
    ]);
    expect(appels[0]!.donnees).toMatchObject({ nom: 'Les goules', scene: 'cave', rencontre: 'r1', statut: 'encours', round: 1, tour: 1, actif: 'm-r1-a' });
    expect(appels[1]!.donnees).toMatchObject({ initiative: null, de: null, pv: null });
    expect(appels[0]!.donnees).toMatchObject({ porteesLibres: false });
    expect(appels[1]!.donnees).toMatchObject({ def: null, armure: 0, mortSucces: 0, mortEchecs: 0, mort: false });
    expect(appels[2]!.donnees).toMatchObject({ initiative: 14, de: 11, pv: 14, pvMax: 14, aTerre: false, def: 12, armure: 2, resistances: { physique: 0.5, magique: 1 } });
    expect(appels[3]!.donnees).toEqual({ combat: id });
    expect(journal.noterJet).toHaveBeenCalledTimes(1);
    expect(journal.noterJet).toHaveBeenCalledWith('Initiative', '1d20+3', { des: [11], faces: 20, bonus: 3, total: 14 }, 'Goule A');
  });

  it('démarrer : refusé si un combat est en cours, ou un monstre sans PV ou sans DEF', async () => {
    await expect(A.demarrerCombat({ nom: 'x', scene: 'cave', rencontre: null, combattants: brouillon }, 'c0')).rejects.toThrow('déjà en cours');
    await expect(A.demarrerCombat({ nom: 'x', scene: 'cave', rencontre: null, combattants: [{ ...brouillon[1]!, pvMax: null }] }, null)).rejects.toThrow('Donne les PV');
    await expect(A.demarrerCombat({ nom: 'x', scene: 'cave', rencontre: null, combattants: [{ ...brouillon[1]!, def: null }] }, null)).rejects.toThrow('Donne la DEF');
    expect(appels).toEqual([]);
  });

  it('arriver en cours de combat (9a) : un monstre lance son initiative, un PJ attend la sienne', async () => {
    await A.ajouterCombattant('c1', brouillon[1]!, () => 0);
    await A.ajouterCombattant('c1', brouillon[0]!);
    expect(appels.map((a) => [a.chemin, (a.donnees as Combattant).initiative])).toEqual([
      [`${C}/c1/combattants/m-r1-a`, 4],
      [`${C}/c1/combattants/pj-shy`, null],
    ]);
  });

  it('lancer son initiative (5a), une fois', async () => {
    journal.de = 17;
    expect(await A.lancerInitiative('c1', pj('S', { modInit: 2 }))).toBe(19);
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Initiative', '1d20+2', 'S');
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/c1/combattants/pj-S`, donnees: { initiative: 19, de: 17 } }]);
    await expect(A.lancerInitiative('c1', avecInit(pj('S'), 4))).rejects.toThrow('déjà son initiative');
  });

  it('finir le tour (6a) : la main au suivant, tour + 1 ; refusé si la main a changé ou si le combat est clos', async () => {
    const cs = [avecInit(monstre('A'), 12), avecInit(pj('S'), 11)];
    base.set(`${C}/c1`, combat({ actif: 'pj-S', round: 2, tour: 7 }));
    const apres = await A.finirTour('c1', 'pj-S', cs, new Set());
    expect(apres).toMatchObject({ actif: 'm-r1-A', round: 3, tour: 8 });
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${C}/c1`, donnees: { actif: 'm-r1-A', round: 3, tour: 8 } }]);
    appels.length = 0;
    await expect(A.finirTour('c1', 'm-r1-A', cs, new Set())).rejects.toThrow('déjà changé');
    base.set(`${C}/c1`, combat({ actif: 'pj-S', statut: 'clos' }));
    await expect(A.finirTour('c1', 'pj-S', cs, new Set())).rejects.toThrow('clos');
    expect(appels).toEqual([]);
  });

  it('donner la main (6a)', async () => {
    await A.donnerLaMain('c1', combat({ tour: 4 }), 'pj-H');
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/c1`, donnees: { actif: 'pj-H', tour: 5 } }]);
  });

  it('les actions (7a) : principale, secondaire, Sprint (+2, prend la principale), cases', async () => {
    const cb = combat({ tour: 5 });
    const c = pj('S', { tourActions: 4, principale: true, mvt: 5 });
    await A.noterAction('c1', cb, c, { sprint: true });
    expect(appels.at(-1)!.donnees).toEqual({ tourActions: 5, principale: true, secondaire: false, mvt: 0, sprint: true });
    await A.noterAction('c1', cb, pj('S', { tourActions: 5, mvt: 3 }), { cases: 2 });
    expect(appels.at(-1)!.donnees).toEqual({ tourActions: 5, principale: false, secondaire: false, mvt: 5, sprint: false });
    await A.noterAction('c1', cb, pj('S', { tourActions: 5 }), { secondaire: true });
    expect(appels.at(-1)!.donnees).toMatchObject({ secondaire: true });
    await expect(A.noterAction('c1', cb, pj('S', { tourActions: 5, principale: true }), { sprint: true })).rejects.toThrow('plus de Sprint');
    await expect(A.noterAction('c1', cb, pj('S', { tourActions: 5, principale: true, sprint: true }), { principale: false })).rejects.toThrow('Sprint a pris');
    await expect(A.noterAction('c1', cb, pj('S', { tourActions: 5, mvt: 4 }), { cases: 2 })).rejects.toThrow('ne te reste que 1 case.');
  });

  it('PV d’un monstre (3b) : bornés ; à 0, à terre et son jeton marqué mort ; relevé, l’inverse', async () => {
    expect(await A.ajusterPvMonstre('c1', 'cave', monstre('A', { pv: 5 }), -9)).toBe(0);
    expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: `${C}/c1/combattants/m-r1-A`, donnees: { pv: 0, aTerre: true } });
    expect(carte.marquerMort).toHaveBeenLastCalledWith('cave', 'm-r1-A', true);
    expect(await A.ajusterPvMonstre('c1', 'cave', monstre('A', { pv: 0, aTerre: true }), 30)).toBe(14);
    expect(carte.marquerMort).toHaveBeenLastCalledWith('cave', 'm-r1-A', false);
    carte.marquerMort.mockClear();
    await A.ajusterPvMonstre('c1', 'cave', monstre('A', { pv: 8 }), -3);
    expect(carte.marquerMort).not.toHaveBeenCalled();
    await expect(A.ajusterPvMonstre('c1', 'cave', pj('S'), -3)).rejects.toThrow('sur sa fiche');
  });

  it('clore (11a) : le combat clos, la table sans combat', async () => {
    await A.cloreCombat('c1');
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: `${C}/c1`, donnees: { statut: 'clos', actif: null, closLe: expect.any(Number) } },
      { fn: 'lot.fusion', chemin: 'tables/t1', donnees: { combat: null } },
    ]);
  });
});
