import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  const ref = (chemin: string) => ({ chemin, id: chemin.split('/').pop() });
  return {
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (_db: unknown, ...p: string[]) => ref(p.join('/')),
    deleteField: () => '<supprimé>',
    updateDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees });
    },
    writeBatch: () => {
      const ecritures: typeof appels = [];
      return {
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
const journal = vi.hoisted(() => ({ noterJet: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/actions/carte', () => ({ marquerMort: vi.fn() }));


const { session } = await import('../../src/lib/session.svelte');
const D = await import('../../src/lib/combat/demons');
const AD = await import('../../src/lib/actions/demons');
const M = await import('../../src/lib/combat/monstres');
const AM = await import('../../src/lib/actions/monstres');
const X = await import('../../src/lib/actions/attaques');
const T = await import('../../src/lib/combat/attaque');
const { appliquerChangements } = await import('../../src/lib/combat/changements');
const { monstrePourCombat } = await import('../../src/lib/combat/demarrage');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { RefusCombat } = await import('../../src/lib/actions/combat');
const { etatParId } = await import('../../src/regles');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;

/*
 * Les démons (lot L6.6b, décisions de Thomas du 29/10/2026) : 1a (la
 * faim, comptée d'office), 2a et 3a (la montée, les dégâts gardés), 4a
 * (la Morsure d'ancrage), 5a (Repousse), 6a (Berserk), 7a (Puits, Vol de
 * sève), 8a (Air vicié, Reflet, Dernier souffle ; les rappels), 9a
 * (Putréfié), 10a (leurs attaques).
 */

const BESTIAIRE: ({ id: string; nom: string; pv: number } & Record<string, unknown>)[] = JSON.parse(readFileSync('src/donnees/bestiaire.json', 'utf8')).monstres;
const modele = (id: string) => BESTIAIRE.find((m) => m.id === id)! as never as Parameters<typeof D.traitsDemon>[0] & Parameters<typeof monstrePourCombat>[0] & { id: string; nom: string; pv: number; def: number; capacitesActives?: unknown[] };
const traits = (id: string) => D.traitsDemon(modele(id));
const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'demon_reliquat', modInit: 3, initiative: 15, de: 12, pv: 10, pvMax: 10, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: { FOR: 1, DEX: 2, CON: 3, Volonte: 0 }, boss: false, demonOuMortVivant: true, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const suite = (...v: [number, number][]) => {
  let i = 0;
  return () => {
    const [d, f] = v[i++]!;
    return (d - 0.5) / f;
  };
};
const C = 'tables/t1/combats/c1/combattants';
const combat = { tour: 6, round: 2, scene: 'cave' };
const enBase = (c: Combattant & { id: string }) => base.set(`${C}/${c.id}`, (({ id: _i, ...x }) => x)(c));
const etat = (id: string, x: Record<string, unknown> = {}) => ({ id, rounds: null, cumul: 1, charges: null, des: null, source: null, ...x });
const morsure = (drainPP?: number) => ({ nom: 'Morsure d’ancrage', bonus: 30, formule: '1d4', typeDegats: 'physique' as const, portee: T.PORTEE_CONTACT, seuilCritique: 20, etatSurTouche: null, ...(drainPP ? { drainPP } : {}) });
const rate = { ...morsure(), bonus: -30 };

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'bob';
  session.nom = 'Bob';
  journal.noterJet.mockClear();
});

describe('les traits du bestiaire', () => {
  it('lus des données : faim, paliers, berserk, Repousse, Puits, Vol de sève, passifs', () => {
    expect(traits('demon_reliquat')).toEqual({ faim: { type: 'pp_draines', seuil: 6 }, paliersSuivants: ['demon_affame'], berserk: 0, repousse: 0, soinSurDegats: 0, soinParPPDraine: 0, passifs: {} });
    expect(traits('demon_greffeur')).toMatchObject({ faim: null, paliersSuivants: [], berserk: 1, repousse: 8, soinSurDegats: 0.5 });
    expect(traits('demon_gouffre')).toMatchObject({ soinParPPDraine: 1 });
    expect(traits('demon_seve_rouge')).toMatchObject({ berserk: 2, passifs: { dernierSouffle: 3 } });
    expect(traits('demon_charnier_marchant').passifs).toEqual({ airVicie: { rayon: 3, formule: '1d6' } });
    expect(traits('demon_ecorcheur').paliersSuivants).toEqual(['demon_ecorce_fendue', 'demon_greffeur']);
    expect(D.traitsDemon({ faim: { type: 'autre', seuil: 2 }, paliersSuivants: 'x', berserk: { parTouche: 0 }, passifs: { reflet: 'x' } })).toEqual({ faim: null, paliersSuivants: [], berserk: 0, repousse: 0, soinSurDegats: 0, soinParPPDraine: 0, passifs: {} });
    expect(D.aDesTraits(D.traitsDemon({}))).toBe(false);
    for (const id of ['demon_reliquat', 'demon_greffeur', 'demon_gouffre', 'demon_mille_visages', 'demon_desiree', 'demon_pustule']) expect(D.aDesTraits(traits(id)), id).toBe(true);
    expect(D.aDesTraits(D.traitsDemon({ soinSurDegats: 0.5 }))).toBe(true);
    expect(D.aDesTraits(D.traitsDemon({ soinParPPDraine: 1 }))).toBe(true);
    expect(D.aDesTraits(D.traitsDemon({ repousse: 2 }))).toBe(true);
    expect(D.aDesTraits(D.traitsDemon({ berserk: { parTouche: 1 } }))).toBe(true);
    // Tout démon à jauge a ses paliers suivants au bestiaire.
    for (const m of BESTIAIRE) for (const id of D.traitsDemon(m as never).paliersSuivants) expect(BESTIAIRE.some((x) => x.id === id), id).toBe(true);
  });

  it('les passifs que le MJ applique lui-même', () => {
    expect(D.rappelsDemon(traits('demon_desiree'))).toEqual(['Bouclier de chair : les attaques contre lui ont le désavantage tant qu’une créature charmée lui est adjacente.']);
    expect(D.rappelsDemon(traits('demon_celle_qu_on_suit'))).toEqual(['Suite : une créature charmée à 3 m s’interpose et prend les attaques qui le visent.']);
    expect(D.rappelsDemon(traits('demon_brise_liens'))).toEqual(['Liens rompus : il regagne 1d6 PV quand une créature qu’il a charmée frappe un de ses alliés.']);
    expect(D.rappelsDemon(traits('demon_semeur_de_peste'))).toEqual(['Contagion : une créature Putréfiée qui tombe à 0 PV passe l’état à une créature adjacente.']);
    expect(D.rappelsDemon(traits('demon_la_lente'))).toEqual(['Ce qui ne guérit pas : les soins reçus par une créature Putréfiée sont multipliés par 0.5.']);
    expect(D.rappelsDemon(traits('demon_greffeur'))).toEqual([]);
  });
});

describe('la faim et la montée (1a, 2a, 3a)', () => {
  it('la jauge : comptée selon sa sorte, bornée ; au seuil, il peut monter', () => {
    expect(D.faimDe({ usages: {} })).toBe(0);
    expect(D.avecFaim({ x: 1, faim: 2 }, 3)).toEqual({ x: 1, faim: 5 });
    expect(D.avecFaim({}, -2)).toEqual({ faim: 0 });
    expect(D.avecFaim({ faim: 998 }, 5)).toEqual({ faim: 999 });
    const quoi = { ppDraines: 2, degatsInfliges: 7, etatsControle: 1 };
    expect(D.faimNourrie(traits('demon_reliquat'), quoi)).toBe(2);
    expect(D.faimNourrie(traits('demon_rejet'), quoi)).toBe(7);
    expect(D.faimNourrie(traits('demon_leurre'), quoi)).toBe(1);
    expect(D.faimNourrie(traits('demon_pustule'), quoi)).toBe(0);
    expect(D.faimNourrie(traits('demon_greffeur'), quoi)).toBe(0);
    expect(D.faimNourrie(traits('demon_reliquat'), {})).toBe(0);
    expect(D.faimNourrie(traits('demon_rejet'), {})).toBe(0);
    expect(D.faimNourrie(traits('demon_leurre'), {})).toBe(0);
    expect(D.peutMonter({ usages: { faim: 5 } }, traits('demon_reliquat'))).toBe(false);
    expect(D.peutMonter({ usages: { faim: 6 } }, traits('demon_reliquat'))).toBe(true);
    expect(D.peutMonter({ usages: { faim: 99 } }, traits('demon_greffeur'))).toBe(false);
    expect(D.peutMonter({ usages: { faim: 99 } }, { ...traits('demon_reliquat'), paliersSuivants: [] })).toBe(false);
  });

  it('les rounds survécus : debout, une fois par round, pas au premier', () => {
    const t = traits('demon_pustule');
    const c = monstre('a', { usages: { faim: 1 } });
    expect(D.roundSurvecu(c, t, 3)).toEqual({ faim: 2, faimR: 3 });
    expect(D.roundSurvecu({ ...c, usages: { faim: 1, faimR: 3 } }, t, 3)).toBeNull();
    expect(D.roundSurvecu(c, t, 1)).toBeNull();
    expect(D.roundSurvecu(c, t, 2)).toEqual({ faim: 2, faimR: 2 });
    expect(D.roundSurvecu({ ...c, aTerre: true }, t, 3)).toBeNull();
    expect(D.roundSurvecu({ ...c, mort: true }, t, 3)).toBeNull();
    expect(D.roundSurvecu(c, traits('demon_reliquat'), 3)).toBeNull();
    expect(D.roundSurvecu(c, t, 5000)).toEqual({ faim: 2, faimR: 999 });
  });

  it('3a : il prend le nouveau modèle et garde les dégâts subis (1 PV au moins) ; la faim repart, le berserk reste', () => {
    const affame = modele('demon_affame');
    const p = monstrePourCombat(affame, new Map());
    const r = D.apresMontee({ pv: 7, pvMax: 10, usages: { faim: 6, faimR: 2, berserk: 2, 'c:x': 1 } }, affame, new Map());
    expect(r).toEqual({
      monstre: 'demon_affame',
      nom: affame.nom,
      modInit: p.init,
      pvMax: affame.pv,
      pv: affame.pv - 3,
      def: p.def,
      armure: p.armure,
      resistances: { physique: 1, magique: 1, ...p.resistances },
      sauvegardes: p.sauvegardes,
      boss: p.boss,
      demonOuMortVivant: p.demonOuMortVivant,
      immunites: null,
      legendaire: null,
      usages: { berserk: 2, 'c:x': 1 },
    });
    expect(D.apresMontee({ pv: 1, pvMax: 500, usages: {} }, affame, new Map()).pv).toBe(1);
    expect(D.apresMontee({ pv: null, pvMax: null, usages: {} }, affame, new Map()).pv).toBe(affame.pv);
    const boss = { ...modele('demon_affame'), boss: true, immunites: ['effrayee'], nom: 'x'.repeat(50) };
    expect(D.apresMontee({ pv: 5, pvMax: 5, usages: {} }, boss, new Map())).toMatchObject({ immunites: ['effroi'], legendaire: expect.any(Number), nom: 'x'.repeat(40) });
  });
});

describe('berserk, drain, soins (4a, 6a, 7a)', () => {
  it('les helpers', () => {
    expect(D.touchesBerserk({ usages: {} })).toBe(0);
    expect(D.bonusBerserk({ usages: { berserk: 3 } }, traits('demon_seve_rouge'))).toBe(6);
    expect(D.drainer(6, 10)).toEqual({ pp: 6, pv: 0 });
    expect(D.drainer(6, 2)).toEqual({ pp: 2, pv: 4 });
    expect(D.drainer(6, null)).toEqual({ pp: 0, pv: 6 });
    expect(D.drainer(6, -3)).toEqual({ pp: 0, pv: 6 });
    expect(D.soinDuDemon(traits('demon_gouffre'), 6, 9)).toBe(6);
    expect(D.soinDuDemon(traits('demon_greffeur'), 6, 9)).toBe(4);
    expect(D.soinDuDemon(traits('demon_greffeur'), 0, -3)).toBe(0);
    expect(D.soigne({ pv: 5, pvMax: 10 }, 3)).toBe(8);
    expect(D.soigne({ pv: 9, pvMax: 10 }, 3)).toBe(10);
    expect(D.soigne({ pv: 9, pvMax: 10 }, -3)).toBe(9);
    expect(D.soigne({ pv: null, pvMax: null }, 3)).toBe(0);
  });

  it('4a, 1a : la Morsure d’ancrage draine les PP de la fiche ; la faim les compte ; au seuil, le journal le dit', async () => {
    const k = reelle('Kargash');
    const pp = vueFiche(k).pp!.actuel;
    await X.attaqueDeMonstre('c1', combat, monstre('A', { usages: { faim: 4 } }), morsure(2), pj('p1'), k, suite([10, 20], [3, 4]), false, false, traits('demon_reliquat'));
    expect(appels.find((a) => a.chemin === 'tables/t1/persos/p1')!.donnees).toMatchObject({ ppActuel: pp - 2 });
    expect(appels.filter((a) => a.chemin === `${C}/m-r1-A`).at(-1)!.donnees).toEqual({ usages: { faim: 6 } });
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; drain : 2 PP ; faim 6\/6$/);
  });

  it('4a : sans PP, le drain passe en PV et ne nourrit pas la faim ; à moitié, les deux', async () => {
    const h = reelle('Hyrma');
    const v = vueFiche(h);
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), morsure(2), pj('p1'), h, suite([10, 20], [3, 4]), false, false, traits('demon_reliquat'));
    expect(r.pv).toBe(Math.max(0, v.pv.actuel - r.net! - 2));
    expect(appels.find((a) => a.chemin === 'tables/t1/persos/p1')!.donnees).not.toHaveProperty('ppActuel');
    expect(appels.some((a) => a.chemin === `${C}/m-r1-A` && a.fn === 'lot.update' && 'usages' in (a.donnees as object) && 'faim' in ((a.donnees as { usages: object }).usages))).toBe(false);
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; drain : 2 PV$/);
    appels.length = 0;
    journal.noterJet.mockClear();
    const k = { ...reelle('Kargash'), ppActuel: 1 } as Fiche & { id: string };
    await X.attaqueDeMonstre('c1', combat, monstre('A'), morsure(2), pj('p1'), k, suite([10, 20], [3, 4]), false, false, traits('demon_reliquat'));
    expect(appels.find((a) => a.chemin === 'tables/t1/persos/p1')!.donnees).toMatchObject({ ppActuel: 0 });
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; drain : 1 PP, 1 PV ; faim 1\/6$/);
    // Un monstre ordinaire draine aussi (la donnée est sur l'attaque), sans faim.
    appels.length = 0;
    await X.attaqueDeMonstre('c1', combat, monstre('A'), morsure(2), pj('p1'), reelle('Kargash'), suite([10, 20], [3, 4]));
    expect(appels.find((a) => a.chemin === 'tables/t1/persos/p1')!.donnees).toMatchObject({ ppActuel: vueFiche(reelle('Kargash')).pp!.actuel - 2 });
    expect(appels.filter((a) => a.chemin === `${C}/m-r1-A`)).toHaveLength(1);
  });

  it('7a : le Puits rend un PV par PP drainé, sans dépasser son maximum', async () => {
    await X.attaqueDeMonstre('c1', combat, monstre('A', { monstre: 'demon_gouffre', pv: 30, pvMax: 40 }), morsure(6), pj('p1'), reelle('Kargash'), suite([10, 20], [3, 4]), false, false, traits('demon_gouffre'));
    expect(appels.filter((a) => a.chemin === `${C}/m-r1-A`).at(-1)!.donnees).toEqual({ pv: 36 });
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; drain : 6 PP ; A regagne 6 PV$/);
    appels.length = 0;
    await X.attaqueDeMonstre('c1', combat, monstre('A', { monstre: 'demon_gouffre', pv: 40, pvMax: 40 }), morsure(6), pj('p1'), reelle('Kargash'), suite([10, 20], [3, 4]), false, false, traits('demon_gouffre'));
    expect(appels.filter((a) => a.chemin === `${C}/m-r1-A`)).toHaveLength(1);
  });

  it('6a, 7a : touché, le berserk ajoute son bonus et compte la touche ; le Vol de sève rend la moitié des dégâts nets', async () => {
    const g = monstre('A', { monstre: 'demon_greffeur', pv: 50, pvMax: 93, usages: { berserk: 2 } });
    const r = await X.attaqueDeMonstre('c1', combat, g, morsure(), pj('p1'), reelle('Kargash'), suite([10, 20], [3, 4]), false, false, traits('demon_greffeur'));
    expect(journal.noterJet.mock.calls[1]!.slice(0, 2)).toEqual(['Dégâts Morsure d’ancrage sur Kargash corde d\'or', '1d4+2']);
    const soin = Math.floor(r.net! / 2);
    expect(appels.filter((a) => a.chemin === `${C}/m-r1-A`).at(-1)!.donnees).toEqual({ usages: { berserk: 3 }, ...(soin ? { pv: 50 + soin } : {}) });
    expect(journal.noterJet.mock.calls[1]![4]).toContain(' ; berserk +3');
  });

  it('1a : les PV nets infligés nourrissent la faim d’un Rejet', async () => {
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A', { monstre: 'demon_rejet', pv: 20, pvMax: 20, usages: { faim: 3 } }), morsure(), pj('p1'), reelle('Kargash'), suite([10, 20], [4, 4]), false, false, traits('demon_rejet'));
    expect(appels.filter((a) => a.chemin === `${C}/m-r1-A`).at(-1)!.donnees).toEqual({ usages: { faim: 3 + r.net! } });
  });

  it('6a : raté, le berserk lui coûte son bonus en PV et retombe à 0 ; à 0 PV, il tombe ; sans touche, rien', async () => {
    const t = traits('demon_greffeur');
    await X.attaqueDeMonstre('c1', combat, monstre('A', { pv: 50, pvMax: 93, usages: { berserk: 3, x: 1 } }), rate, pj('p1'), reelle('Kargash'), suite([10, 20]), false, false, t);
    expect(appels[0]!.donnees).toEqual({ tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false, pv: 47, aTerre: false, usages: { x: 1 } });
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/ ; berserk : A perd 3 PV$/);
    appels.length = 0;
    await X.attaqueDeMonstre('c1', combat, monstre('A', { pv: 2, pvMax: 93, usages: { berserk: 3 } }), rate, pj('p1'), reelle('Kargash'), suite([10, 20]), false, true, t);
    expect(appels[0]!.donnees).toEqual({ pv: 0, aTerre: true, usages: {} });
    appels.length = 0;
    journal.noterJet.mockClear();
    await X.attaqueDeMonstre('c1', combat, monstre('A', { pv: 50, pvMax: 93 }), rate, pj('p1'), reelle('Kargash'), suite([10, 20]), false, false, t);
    expect(appels[0]!.donnees).not.toHaveProperty('pv');
    expect(journal.noterJet.mock.calls[0]![4]).not.toContain('berserk');
  });
});

describe('les capacités d’un démon (1a, 8a)', () => {
  const ctx = (combattants: (Combattant & { id: string })[], demon: ReturnType<typeof traits> | null) => ({ combattants, fiches: new Map(), carte: null, demon });

  it('1a : les états de contrôle nouveaux nourrissent la faim (pas sur qui l’a déjà, ni sur un immunisé)', async () => {
    const attrait = M.capacitesDuMonstre(modele('demon_leurre')).capacites.find((c) => c.nom === 'Attrait')!;
    const l = monstre('L', { monstre: 'demon_leurre', usages: { faim: 1 } });
    const b = monstre('b');
    const c = monstre('c', { etats: [etat('fascine')] as never });
    const d = monstre('d', { immunites: ['fascine'] });
    for (const x of [l, b, c, d]) enBase(x);
    const t = await AM.jouerCapaciteMonstre('c1', combat, l, attrait, [b.id, c.id, d.id], ctx([l, b, c, d], traits('demon_leurre')), suite([1, 20], [1, 20], [1, 20]));
    expect(appels.find((a) => a.chemin === `${C}/m-r1-L`)!.donnees).toMatchObject({ usages: { faim: 2 } });
    expect(t).toContain(' ; faim 2/3');
    // Un autre état (pas de contrôle) : rien.
    appels.length = 0;
    const renverse = { ...attrait, nom: 'Croc', effets: [{ type: 'etat' as const, id: 'renverse', duree: '1' }] };
    await AM.jouerCapaciteMonstre('c1', combat, l, renverse, [b.id], ctx([l, b], traits('demon_leurre')), suite([1, 20]));
    expect((appels.find((a) => a.chemin === `${C}/m-r1-L`)!.donnees as { usages: Record<string, number> }).usages.faim).toBe(1);
    // Sans les traits : pas de faim.
    appels.length = 0;
    await AM.jouerCapaciteMonstre('c1', combat, l, attrait, [b.id], ctx([l, b, c, d], null), suite([1, 20]));
    expect((appels.find((a) => a.chemin === `${C}/m-r1-L`)!.donnees as { usages: Record<string, number> }).usages.faim).toBe(1);
    // Une sauvegarde réussie : rien de nouveau.
    appels.length = 0;
    await AM.jouerCapaciteMonstre('c1', combat, l, attrait, [b.id], ctx([l, b], traits('demon_leurre')), suite([20, 20]));
    expect((appels.find((a) => a.chemin === `${C}/m-r1-L`)!.donnees as { usages: Record<string, number> }).usages.faim).toBe(1);
  });

  it('8a : Reflet : par sauvegarde ratée contre lui, il regagne ses PV, sans dépasser son maximum', async () => {
    const cap = M.capacitesDuMonstre(modele('demon_mille_visages')).capacites.find((c) => c.sauvegarde)!;
    const m = monstre('V', { monstre: 'demon_mille_visages', pv: 40, pvMax: 59 });
    const b = monstre('b');
    const c = monstre('c');
    for (const x of [m, b, c]) enBase(x);
    const t = await AM.jouerCapaciteMonstre('c1', combat, m, cap, [b.id, c.id], ctx([m, b, c], traits('demon_mille_visages')), suite([1, 20], [20, 20]));
    expect(appels.find((a) => a.chemin === `${C}/m-r1-V`)!.donnees).toMatchObject({ pv: 45 });
    expect(t).toContain(' ; Reflet : V regagne 5 PV');
    appels.length = 0;
    await AM.jouerCapaciteMonstre('c1', combat, m, cap, [b.id, c.id], ctx([m, b, c], traits('demon_mille_visages')), suite([1, 20], [1, 20]));
    expect(appels.find((a) => a.chemin === `${C}/m-r1-V`)!.donnees).toMatchObject({ pv: 50 });
    // Une attaque ratée n'est pas une sauvegarde ratée.
    appels.length = 0;
    const frappe = { ...cap, jetAttaque: 0, sauvegarde: null, effets: [] };
    await AM.jouerCapaciteMonstre('c1', combat, m, frappe, [b.id], ctx([m, b], traits('demon_mille_visages')), suite([2, 20]));
    expect(appels.find((a) => a.chemin === `${C}/m-r1-V`)!.donnees).not.toHaveProperty('pv');
    appels.length = 0;
    const plein = monstre('V', { monstre: 'demon_mille_visages', pv: 59, pvMax: 59 });
    await AM.jouerCapaciteMonstre('c1', combat, plein, cap, [b.id], ctx([plein, b], traits('demon_mille_visages')), suite([1, 20]));
    expect(appels.find((a) => a.chemin === `${C}/m-r1-V`)!.donnees).not.toHaveProperty('pv');
  });
});

describe('les passifs et le début de tour (5a, 8a, 9a)', () => {
  const scene = { colonnes: 10, lignes: 10, murs: [], obstacles: [], portes: [] };
  const traitsDe = (c: { monstre: string | null }) => (c.monstre ? D.traitsDemon(modele(c.monstre)) : null);

  it('Air vicié : les démons debout à portée de celui qui commence son tour', () => {
    void scene;
    const k = pj('p1');
    const ch = monstre('ch', { monstre: 'demon_charnier_marchant' });
    const loin = monstre('lo', { monstre: 'demon_charnier_marchant' });
    const tombe = monstre('to', { monstre: 'demon_charnier_marchant', aTerre: true });
    const jetons = [{ id: 'pj-p1', cx: 0, cy: 0 }, { id: 'm-r1-ch', cx: 2, cy: 0 }, { id: 'm-r1-lo', cx: 3, cy: 0 }, { id: 'm-r1-to', cx: 1, cy: 1 }];
    expect(D.airsVicies(k, [k, ch, loin, tombe], traitsDe, jetons)).toEqual([{ source: ch, formule: '1d6' }]);
    expect(D.airsVicies(ch, [k, ch, loin], traitsDe, jetons)).toEqual([{ source: loin, formule: '1d6' }]);
    expect(D.airsVicies({ ...k, aTerre: true }, [k, ch], traitsDe, jetons)).toEqual([]);
    expect(D.airsVicies({ ...k, mort: true }, [k, ch], traitsDe, jetons)).toEqual([]);
    expect(D.airsVicies(k, [k, ch], traitsDe, jetons.slice(1))).toEqual([]);
    expect(D.airsVicies(k, [k, ch], traitsDe, [jetons[0]!])).toEqual([]);
    const large = (c: { monstre: string | null }) => (c.monstre ? { ...D.traitsDemon(modele('demon_charnier_marchant')), passifs: { airVicie: { rayon: 4, formule: '1d6' } } } : null);
    expect(D.airsVicies(k, [k, loin], large, jetons)).toEqual([]);
    expect(D.airsVicies(k, [k, pj('p2', { monstre: 'demon_charnier_marchant' } as never)], traitsDe, [...jetons, { id: 'pj-p2', cx: 1, cy: 0 }])).toEqual([]);
  });

  it('Dernier souffle : tombé, son berserk au seuil, une fois', () => {
    const t = traits('demon_seve_rouge');
    expect(D.sursautPossible({ aTerre: true, mort: false, usages: { berserk: 3 } }, t)).toBe(true);
    expect(D.sursautPossible({ aTerre: true, mort: false, usages: { berserk: 2 } }, t)).toBe(false);
    expect(D.sursautPossible({ aTerre: false, mort: false, usages: { berserk: 3 } }, t)).toBe(false);
    expect(D.sursautPossible({ aTerre: true, mort: true, usages: { berserk: 3 } }, t)).toBe(false);
    expect(D.sursautPossible({ aTerre: true, mort: false, usages: { berserk: 3, sursaut: 4 } }, t)).toBe(false);
    expect(D.sursautPossible({ aTerre: true, mort: false, usages: { berserk: 9 } }, traits('demon_greffeur'))).toBe(false);
  });

  it('au début de son tour : la fin du Sursaut ; sinon la Repousse ; rien à faire, rien au journal', async () => {
    const vide = new Map();
    expect(await AD.debutDeTourDemons('c1', monstre('S', { monstre: 'demon_seve_rouge', pv: 0, usages: { sursaut: 4 } }), [], traitsDe, vide, [])).toEqual(['S : son Sursaut s’achève, il tombe']);
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/m-r1-S`, donnees: { aTerre: true, pv: 0 } }]);
    appels.length = 0;
    expect(await AD.debutDeTourDemons('c1', monstre('E', { monstre: 'demon_ecorcheur', pv: 40, pvMax: 60 }), [], traitsDe, vide, [])).toEqual(['E : Repousse, +6 PV']);
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/m-r1-E`, donnees: { pv: 46 } }]);
    expect(journal.noterJet).toHaveBeenLastCalledWith('Début du tour de E', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', 'E : Repousse, +6 PV');
    appels.length = 0;
    journal.noterJet.mockClear();
    expect(await AD.debutDeTourDemons('c1', monstre('E', { monstre: 'demon_ecorcheur', pv: 60, pvMax: 60 }), [], traitsDe, vide, [])).toEqual([]);
    expect(await AD.debutDeTourDemons('c1', monstre('E', { monstre: 'demon_ecorcheur', pv: 0, pvMax: 60, aTerre: true }), [], traitsDe, vide, [])).toEqual([]);
    expect(await AD.debutDeTourDemons('c1', monstre('S', { monstre: 'demon_seve_rouge', pv: 0, aTerre: true, usages: { sursaut: 4 } }), [], traitsDe, vide, [])).toEqual([]);
    expect(await AD.debutDeTourDemons('c1', pj('p1', { usages: { sursaut: 4 } }), [], traitsDe, vide, [])).toEqual([]);
    expect(appels).toEqual([]);
    expect(journal.noterJet).not.toHaveBeenCalled();
  });

  it('Air vicié : 1d6 au PJ qui commence son tour près du Charnier, ôtés de sa fiche ; à un monstre, de ses PV', async () => {
    const k = reelle('Kargash');
    const p = pj('p1');
    const ch = monstre('ch', { nom: 'Charnier', monstre: 'demon_charnier_marchant' });
    const jetons = [{ id: 'pj-p1', cx: 0, cy: 0 }, { id: 'm-r1-ch', cx: 1, cy: 0 }, { id: 'm-r1-b', cx: 0, cy: 1 }];
    const l = await AD.debutDeTourDemons('c1', p, [p, ch], traitsDe, new Map([['p1', k]]), jetons, suite([4, 6]));
    expect(l[0]).toBe('Air vicié de Charnier : 4 sur p1');
    expect(l).toHaveLength(2);
    expect(l[1]).toMatch(/^\d+ dégâts physique/);
    expect(appels.find((a) => a.chemin === 'tables/t1/persos/p1')!.donnees).toMatchObject({ pvActuel: expect.any(Number) });
    appels.length = 0;
    const b = monstre('b', { monstre: null, pv: 9, pvMax: 9 });
    await AD.debutDeTourDemons('c1', b, [b, ch], traitsDe, new Map(), jetons, suite([4, 6]));
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/m-r1-b`, donnees: { pv: 5, aTerre: false } }]);
    // Une formule illisible : rien.
    appels.length = 0;
    const illisible = (c: { monstre: string | null }) => (c.monstre ? { ...D.traitsDemon(modele('demon_charnier_marchant')), passifs: { airVicie: { rayon: 3, formule: 'x' } } } : null);
    expect(await AD.debutDeTourDemons('c1', b, [b, ch], illisible, new Map(), jetons)).toEqual([]);
    expect(appels).toEqual([]);
  });

  it('9a : Putréfié : posé avec ses dés, sans cumul ; un soin magique y met fin', () => {
    expect(etatParId.get('putrefie')).toMatchObject({ categorie: 'degats', degatsParTour: { des: '1d4' }, rompuPar: ['soinMagique'] });
    const k = reelle('Kargash');
    const p = pj('p1', { etats: [etat('putrefie', { rounds: 3, des: '2d6' }), etat('expose')] as never });
    const ecr = appliquerChangements([{ type: 'soin', cible: p.id, montant: 2 }], new Map([[p.id, { c: p, fiche: { ...k, pvActuel: 1 } }]]), { id: 'x', nom: 'X', fiche: null });
    expect((ecr.combattants.get(p.id) as { etats: { id: string }[] }).etats.map((e) => e.id)).toEqual(['expose']);
  });
});

describe('les écritures du MJ (1a, 2a, 8a)', () => {
  it('11a : des démons retournent à la Mer, au journal ; personne, rien', async () => {
    expect(D.estDemon(modele('demon_reliquat') as never)).toBe(true);
    expect(D.estDemon({ race: ['monstres'] })).toBe(false);
    expect(D.estDemon(undefined)).toBe(false);
    await AD.retourALaMer([]);
    expect(journal.noterJet).not.toHaveBeenCalled();
    await AD.retourALaMer([monstre('A')]);
    expect(journal.noterJet).toHaveBeenLastCalledWith('Retour à la Mer', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', 'A retourne à la Mer.');
    await AD.retourALaMer([monstre('A'), monstre('B')]);
    expect(journal.noterJet.mock.calls.at(-1)![4]).toBe('A, B retournent à la Mer.');
  });

  it('corriger la faim', async () => {
    await AD.corrigerFaim('c1', monstre('A', { usages: { faim: 2, x: 1 } }), -1);
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/m-r1-A`, donnees: { usages: { faim: 1, x: 1 } } }]);
    expect(journal.noterJet).toHaveBeenCalledWith('Faim de A', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', 'corrigée : 1.');
  });

  it('monter : vers un de ses paliers suivants, debout ; les champs absents retirés ; son jeton change de nom', async () => {
    const t = traits('demon_reliquat');
    const a = monstre('A', { pv: 7, pvMax: 10, usages: { faim: 6 }, immunites: ['effroi'] });
    const texte = await AD.monterDemon('c1', 'cave', a, t, modele('demon_affame'), new Map());
    const affame = modele('demon_affame');
    expect(appels[0]).toMatchObject({ fn: 'lot.update', chemin: `${C}/m-r1-A`, donnees: { monstre: 'demon_affame', nom: affame.nom, pv: affame.pv - 3, immunites: '<supprimé>', legendaire: '<supprimé>', usages: {} } });
    expect(appels[1]).toEqual({ fn: 'lot.update', chemin: 'tables/t1/scenes/cave/jetons/m-r1-A', donnees: { nom: affame.nom } });
    expect(texte).toBe(`A devient ${affame.nom} : ${affame.pv - 3}/${affame.pv} PV.`);
    expect(journal.noterJet).toHaveBeenCalledWith('Montée de A', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', texte);
    appels.length = 0;
    await expect(AD.monterDemon('c1', 'cave', a, t, modele('demon_gouffre'), new Map())).rejects.toThrow(`${modele('demon_gouffre').nom} n’est pas un palier suivant de A.`);
    await expect(AD.monterDemon('c1', 'cave', { ...a, aTerre: true }, t, modele('demon_affame'), new Map())).rejects.toThrow('Seul un démon debout monte.');
    await expect(AD.monterDemon('c1', 'cave', { ...a, mort: true }, t, modele('demon_affame'), new Map())).rejects.toBeInstanceOf(RefusCombat);
    await expect(AD.monterDemon('c1', 'cave', pj('p1'), t, modele('demon_affame'), new Map())).rejects.toThrow('Seul un démon debout monte.');
    expect(appels).toEqual([]);
  });

  it('les rounds survécus, en un lot ; le Sursaut', async () => {
    await AD.compterRoundsSurvecus('c1', []);
    expect(appels).toEqual([]);
    await AD.compterRoundsSurvecus('c1', [{ c: monstre('A'), usages: { faim: 1, faimR: 2 } }]);
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/m-r1-A`, donnees: { usages: { faim: 1, faimR: 2 } } }]);
    appels.length = 0;
    await AD.sursaut('c1', combat, monstre('S', { aTerre: true, pv: 0, usages: { berserk: 3 } }));
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/m-r1-S`, donnees: { aTerre: false, usages: { berserk: 3, sursaut: 6 } } }]);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('S se relève, en Sursaut : il agit une dernière fois et tombe au début de son prochain tour.');
    appels.length = 0;
    await AD.sursaut('c1', { tour: 0 }, monstre('S'));
    expect((appels[0]!.donnees as { usages: Record<string, number> }).usages.sursaut).toBe(1);
  });
});

describe('les attaques des démons (10a)', () => {
  it('traduites : deux jets pour les deux touches ; le reste joué ailleurs ; le drain porté par l’attaque', () => {
    const R = M.effetDeLAttaque;
    expect(R('demon_ecorce_fendue', 'Frappe fendante')).toEqual({ jets: 2, auMj: null });
    expect(R('demon_seve_rouge', 'Rage de sève')).toEqual({ jets: 2, auMj: null });
    expect(R('demon_greffeur', 'Greffe')).toEqual({ auMj: null });
    expect(R('demon_la_lente', 'Toucher putride')).toEqual({ auMj: null });
    const armes = new Map([['m', { degats: '1d6', typedegats: 'physique', portee: 'contact' }]]) as never;
    const [a] = T.attaquesDuMonstre([{ nom: 'Morsure d\'ancrage', armeId: 'm', bonusAttaque: 4, drainPP: 2, effetSpecial: 'x' }] as never, armes, 'demon_reliquat');
    expect(a).toMatchObject({ drainPP: 2, effet: { auMj: null } });
    const [b] = T.attaquesDuMonstre([{ nom: 'Éclat', armeId: 'm', bonusAttaque: 4, effetSpecial: null }] as never, armes, 'demon_reliquat');
    expect(b).not.toHaveProperty('drainPP');
  });
});
