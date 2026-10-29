import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appels: { fn: string; chemin: string; donnees?: unknown; options?: unknown }[] = [];
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (chemin: string) => ({ chemin, id: chemin.split('/').pop() });
  return {
    doc: (_db: unknown, ...p: string[]) => ref(p.join('/')),
    increment: (n: number) => ({ increment: n }),
    setDoc: async (r: { chemin: string }, donnees: unknown, options?: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees, ...(options ? { options } : {}) });
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
  };
});
const journal = vi.hoisted(() => ({ noterJet: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/journal', () => journal);

const { session } = await import('../../src/lib/session.svelte');
const R = await import('../../src/lib/combat/remous');
const AR = await import('../../src/lib/actions/remous');
const D = await import('../../src/lib/combat/demons');
const T = await import('../../src/lib/combat/attaque');
const { schemaRemous } = await import('../../src/lib/schemas/remous');
const { PALIERS_REMOUS, COEFFICIENTS_RACE, SEUILS_REMOUS, MEMBRANES } = await import('../../src/regles/remous');
const { monstrePourCombat } = await import('../../src/lib/combat/demarrage');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type Remous = import('../../src/lib/schemas/remous').Remous;

/*
 * Le Remous du lieu (lot L6.7b, décisions de Thomas du 29/10/2026) : 5a
 * (une jauge par scène), 6a et 7a (ce qui la nourrit), 8a (les effets des
 * paliers), 9a (ce que le MJ en fait), 10a (la Traque).
 */

const BESTIAIRE: ({ id: string; nom: string } & Record<string, unknown>)[] = JSON.parse(readFileSync('src/donnees/bestiaire.json', 'utf8')).monstres;
const modele = (id: string) => BESTIAIRE.find((m) => m.id === id)! as never as Parameters<typeof D.traitsDemon>[0] & Parameters<typeof monstrePourCombat>[0] & { id: string; nom: string; attaques: Parameters<typeof T.attaquesDuMonstre>[0] };
const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id = 'p1') => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  ...pj(id),
  id: `m-r1-${id}`, genre: 'monstre', perso: null, uid: null, monstre: 'goule', pv: 20, pvMax: 20, def: 13, sauvegardes: { FOR: 1, DEX: 2, CON: 3, Volonte: 0 },
  ...c,
});
const remous = (total: number, membrane: Remous['membrane'] = 'epaisse', contributions: Record<string, number> = {}): Remous => ({ total, membrane, contributions });
const sansDe = { des: [], faces: 0, bonus: 0, total: 0 };

beforeEach(() => {
  appels.length = 0;
  journal.noterJet.mockClear();
  session.table = 't1';
});

describe('la jauge et ses paliers (5a, 8a)', () => {
  it('les données : quatre seuils cumulés, cinq paliers, quatre membranes, les races de la v1 (7a)', () => {
    expect(SEUILS_REMOUS).toEqual([48, 96, 144, 192]);
    expect(PALIERS_REMOUS.map((p) => [p.palier, p.nom, p.coutSorts, p.degatsSorts, p.ppMax, p.dechirure])).toEqual([
      [0, 'Stable', 0, 0, 0, null],
      [1, 'Déchirure', 1, 2, 0, null],
      [2, 'Ouverture', 2, 4, 4, '1d6'],
      [3, 'Marée', 3, 6, 8, '2d6'],
      [4, 'La Plaie', 4, 8, 12, '3d6'],
    ]);
    expect(Object.fromEntries(Object.entries(MEMBRANES).map(([k, v]) => [k, v.diviseur]))).toEqual({ epaisse: 1, amincie: 2, fine: 3, dechiree: 4 });
    expect(COEFFICIENTS_RACE).toEqual({ humain: 1, elfe: 0, nain: 0, demi_elfe: 0.5, demi_orc: 1, demi_gobelin: 1 });
    // Les démons ont leur texte à partir du palier 1.
    expect(PALIERS_REMOUS.map((p) => !!p.demon)).toEqual([false, true, true, true, true]);
  });

  it('les seuils se divisent selon la membrane, à l’arrondi', () => {
    expect(R.seuilsDe('epaisse')).toEqual([48, 96, 144, 192]);
    expect(R.seuilsDe('amincie')).toEqual([24, 48, 72, 96]);
    expect(R.seuilsDe('fine')).toEqual([16, 32, 48, 64]);
    expect(R.seuilsDe('dechiree')).toEqual([12, 24, 36, 48]);
  });

  it('le palier : sans jauge, Stable ; chaque seuil atteint en ajoute un ; la membrane compte', () => {
    expect(R.palierDe(null).palier).toBe(0);
    expect([0, 47, 48, 95, 96, 143, 144, 191, 192, 999].map((t) => R.palierDe(remous(t)).palier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(R.palierDe(remous(48, 'amincie')).palier).toBe(2);
    expect(R.palierDe(remous(16, 'fine')).palier).toBe(1);
    expect(R.palierDe(remous(48, 'dechiree')).palier).toBe(4);
  });

  it('le prochain seuil ; à la Plaie, aucun', () => {
    expect(R.prochainSeuil(remous(0))).toBe(48);
    expect(R.prochainSeuil(remous(48))).toBe(96);
    expect(R.prochainSeuil(remous(30, 'amincie'))).toBe(48);
    expect(R.prochainSeuil(remous(191))).toBe(192);
    expect(R.prochainSeuil(remous(192))).toBeNull();
  });

  it('le schéma : un total entier de 0 à 9999, la membrane épaisse par défaut, les contributions', () => {
    expect(schemaRemous.parse({ total: 3 })).toEqual({ total: 3, membrane: 'epaisse', contributions: {} });
    expect(schemaRemous.parse({ total: 9999, membrane: 'fine', contributions: { p1: 3, mj: 2 }, majLe: 5 })).toEqual({ total: 9999, membrane: 'fine', contributions: { p1: 3, mj: 2 }, majLe: 5 });
    for (const x of [{ total: -1 }, { total: 10000 }, { total: 1.5 }, { total: 1, membrane: 'percee' }, { total: 1, contributions: { p1: -1 } }, { total: 1, contributions: { '': 1 } }, { total: 1, autre: 1 }, { total: 1, majLe: -1 }])
      expect(schemaRemous.safeParse(x).success).toBe(false);
  });
});

describe('ce qui nourrit la jauge (6a, 7a)', () => {
  it('un sort : les PP réellement payés × la race, à l’inférieur ; la Plongée gagnée, point pour point ; une race inconnue, 0', () => {
    expect(R.verseParLeSort('humain', 3, 0)).toBe(3);
    expect(R.verseParLeSort('demi_elfe', 3, 0)).toBe(1);
    expect(R.verseParLeSort('demi_elfe', 4, 0)).toBe(2);
    expect(R.verseParLeSort('elfe', 5, 2)).toBe(2);
    expect(R.verseParLeSort('nain', 5, 0)).toBe(0);
    expect(R.verseParLeSort('inconnue', 5, 1)).toBe(1);
    expect(R.verseParLeSort('humain', -2, -1)).toBe(0);
  });

  it('la Plongée que le lancer fait gagner : celle du lanceur, positive', () => {
    const c = (x: Record<string, unknown>) => ({ type: 'ressource', cible: 'pj-p1', ressource: 'plongee', montant: 1, ...x }) as never;
    expect(R.plongeeGagnee([c({}), c({ montant: 2 }), c({ cible: 'pj-p2' }), c({ ressource: 'ki' }), c({ montant: -1 }), c({ montant: 'vider' }), { type: 'degats', cible: 'pj-p1', montant: 5, typeDegats: 'magique', calcul: '5' }], 'pj-p1')).toBe(3);
    expect(R.plongeeGagnee([], 'pj-p1')).toBe(0);
  });

  it('alimenter : un incrément du total et de la contribution, avec la date ; rien sous 1 ; au plus 60 d’un coup', async () => {
    await AR.alimenterRemous('cave', 3.7, 'p1');
    expect(appels).toEqual([{ fn: 'setDoc', chemin: 'tables/t1/remous/cave', donnees: { total: { increment: 3 }, contributions: { p1: { increment: 3 } }, majLe: expect.any(Number) }, options: { merge: true } }]);
    appels.length = 0;
    await AR.alimenterRemous('cave', 0.9, 'p1');
    await AR.alimenterRemous('cave', 0, 'p1');
    expect(appels).toEqual([]);
    await AR.alimenterRemous('cave', 1, 'mj');
    await AR.alimenterRemous('cave', 75, 'p1');
    expect(appels.map((a) => (a.donnees as { total: unknown }).total)).toEqual([{ increment: 1 }, { increment: 60 }]);
  });

  it('un sort de démon (Éclat) le dit : l’attaque le garde ; une autre attaque, non', () => {
    const m = modele('demon_reliquat');
    const armes = new Map(m.attaques.map((a) => [a.armeId, { degats: '1d4', portee: 'contact' as const, typedegats: 'magique' as const }]));
    const [morsure, eclat] = T.attaquesDuMonstre(m.attaques, armes, m.id);
    expect(eclat!.nom).toBe('Éclat');
    expect(eclat!.alimenteRemous).toBe(true);
    expect('alimenteRemous' in morsure!).toBe(false);
  });
});

describe('les effets du palier (8a)', () => {
  it('le coût : moins N PP, jamais sous 0 ; un sort gratuit le reste', () => {
    const p = (n: number) => PALIERS_REMOUS[n]!;
    expect(R.coutAuPalier(3, p(0))).toBe(3);
    expect(R.coutAuPalier(3, p(1))).toBe(2);
    expect(R.coutAuPalier(3, p(4))).toBe(0);
    expect(R.coutAuPalier(0, p(2))).toBe(0);
  });

  it('les dégâts : +N à chaque cible blessée ; le reste ne bouge pas ; Stable, rien', () => {
    const blesse = { type: 'degats', cible: 'm', montant: 5, typeDegats: 'magique', calcul: '5' } as const;
    const rien = { type: 'degats', cible: 'n', montant: 0, typeDegats: 'magique', calcul: '0' } as const;
    const autre = { type: 'ressource', cible: 'p', ressource: 'plongee', montant: 1 } as const;
    expect(R.degatsAuPalier([blesse, rien, autre], PALIERS_REMOUS[2]!)).toEqual([{ ...blesse, montant: 9 }, rien, autre]);
    const stable = [blesse];
    const r = R.degatsAuPalier(stable, PALIERS_REMOUS[0]!);
    expect(r).toEqual(stable);
    expect(r).not.toBe(stable);
  });

  it('la Déchirure : un jet pour tout le lieu, sur chaque créature debout sauf les démons ; au journal', async () => {
    // La goule résiste à la magie : la Déchirure est magique.
    const tous = [pj('p1'), monstre('a', { resistances: { physique: 1, magique: 0.5 } }), monstre('d', { monstre: 'demon_reliquat' }), monstre('t', { aTerre: true }), pj('p2', { mort: true })];
    const demon = (c: { monstre: string | null }) => c.monstre === 'demon_reliquat';
    const f = reelle('Shyrion');
    const pv = vueFiche(f).pv.actuel;
    const lignes = await AR.dechirure('c1', '2d6', tous, demon, new Map([['p1', f]]), () => 0.5);
    // 2d6 à 0,5 : 4 + 4.
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([
      ['lot.update', 'tables/t1/combats/c1/combattants/m-r1-a'],
      ['lot.update', 'tables/t1/persos/p1'],
    ]);
    expect(appels[0]!.donnees).toMatchObject({ pv: 16 });
    expect(appels[1]!.donnees).toMatchObject({ pvActuel: pv - 8 });
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatch(/^p1 : /);
    expect(lignes[1]).toMatch(/^a : /);
    expect(journal.noterJet.mock.calls).toEqual([['Déchirure', '2d6', { des: [4, 4], faces: 6, bonus: 0, total: 8 }, 'MJ', `8 à tout le lieu ; ${lignes.join(' ; ')}`]]);
  });

  it('la Déchirure : personne à toucher, ou une formule illisible : rien', async () => {
    expect(await AR.dechirure('c1', '1d6', [monstre('d', { monstre: 'demon_reliquat' })], (c) => c.monstre === 'demon_reliquat', new Map())).toEqual([]);
    expect(await AR.dechirure('c1', 'xx', [monstre('a')], () => false, new Map())).toEqual([]);
    expect(appels).toEqual([]);
    expect(journal.noterJet).not.toHaveBeenCalled();
  });

  it('un palier franchi part au journal, avec ce qu’il change', async () => {
    await AR.annoncerPalier(remous(48));
    await AR.annoncerPalier(remous(96));
    await AR.annoncerPalier(remous(192));
    expect(journal.noterJet.mock.calls).toEqual([
      ['Remous — palier 1, Déchirure', '0', sansDe, 'MJ', 'Gain : sorts −1 PP, +2 dégâts. Un démon D1 se manifeste (famille au choix du MJ).'],
      ['Remous — palier 2, Ouverture', '0', sansDe, 'MJ', 'Gain : sorts −2 PP, +4 dégâts, PP max +4. 1d6 dégâts par round à tout le lieu. Le démon monte d’un palier.'],
      ['Remous — palier 4, La Plaie', '0', sansDe, 'MJ', 'Gain : sorts −4 PP, +8 dégâts, PP max +12. 3d6 dégâts par round à tout le lieu. Le démon atteint son plafond (D4). Le lieu reste déchiré.'],
    ]);
  });

  it('la montée offerte aux démons : un usage, que « Monter » ouvre et que la montée prend', async () => {
    const t = D.traitsDemon(modele('demon_reliquat'));
    const d = monstre('d', { monstre: 'demon_reliquat', usages: { berserk: 2 } });
    expect(D.peutMonter(d, t)).toBe(false);
    await AR.offrirMontees('c1', [d, monstre('e', { nom: 'e', usages: {} })]);
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: 'tables/t1/combats/c1/combattants/m-r1-d', donnees: { usages: { berserk: 2, monteeRemous: 1 } } },
      { fn: 'lot.update', chemin: 'tables/t1/combats/c1/combattants/m-r1-e', donnees: { usages: { monteeRemous: 1 } } },
    ]);
    expect(journal.noterJet.mock.calls).toEqual([['Remous — montée', '0', sansDe, 'MJ', 'd, e peuvent monter d’un palier.']]);
    journal.noterJet.mockClear();
    await AR.offrirMontees('c1', [d]);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('d peut monter d’un palier.');
    const offert = { ...d, usages: { ...d.usages, [D.USAGE_MONTEE_REMOUS]: 1 } };
    expect(D.peutMonter(offert, t)).toBe(true);
    // Sans palier suivant, rien à offrir.
    expect(D.peutMonter(offert, { ...t, paliersSuivants: [] })).toBe(false);
    // Sans faim, l'offre suffit.
    expect(D.peutMonter(offert, { ...t, faim: null })).toBe(true);
    expect(D.peutMonter(d, { ...t, faim: null })).toBe(false);
    const apres = D.apresMontee(offert, modele(t.paliersSuivants[0]!), new Map());
    expect(apres.usages).toEqual({ berserk: 2 });
    appels.length = 0;
    journal.noterJet.mockClear();
    await AR.offrirMontees('c1', []);
    expect(appels).toEqual([]);
    expect(journal.noterJet).not.toHaveBeenCalled();
  });
});

describe('ce que le MJ en fait (9a) ; la Traque (10a)', () => {
  it('vider : le total et les contributions à 0, la membrane gardée ; au journal selon la raison', async () => {
    await AR.viderRemous('cave', remous(60, 'fine', { p1: 60 }), 'repos');
    await AR.viderRemous('cave', null, 'marche');
    expect(appels).toEqual([
      { fn: 'setDoc', chemin: 'tables/t1/remous/cave', donnees: { total: 0, membrane: 'fine', contributions: {}, majLe: expect.any(Number) } },
      { fn: 'setDoc', chemin: 'tables/t1/remous/cave', donnees: { total: 0, membrane: 'epaisse', contributions: {}, majLe: expect.any(Number) } },
    ]);
    expect(journal.noterJet.mock.calls.map((c) => c[4])).toEqual(['Repos long : la jauge du lieu retombe à 0.', 'Une heure de marche effective : la jauge du lieu retombe à 0.']);
  });

  it('la membrane : réglée, le reste gardé ; sans jauge, une jauge vide', async () => {
    await AR.reglerMembrane('cave', remous(30, 'epaisse', { p1: 30 }), 'amincie');
    await AR.reglerMembrane('cave', null, 'dechiree');
    expect(appels.map((a) => a.donnees)).toEqual([
      { total: 30, membrane: 'amincie', contributions: { p1: 30 }, majLe: expect.any(Number) },
      { total: 0, membrane: 'dechiree', contributions: {}, majLe: expect.any(Number) },
    ]);
  });

  it('corriger au −/+ : jamais sous 0 ni au-delà de 9999 ; le reste gardé', async () => {
    await AR.corrigerRemous('cave', remous(10, 'fine', { p1: 10 }), 5);
    await AR.corrigerRemous('cave', remous(10), -15);
    await AR.corrigerRemous('cave', null, 3);
    await AR.corrigerRemous('cave', remous(9998), 5);
    expect(appels.map((a) => a.donnees)).toEqual([
      { total: 15, membrane: 'fine', contributions: { p1: 10 }, majLe: expect.any(Number) },
      { total: 0, membrane: 'epaisse', contributions: {}, majLe: expect.any(Number) },
      { total: 3, membrane: 'epaisse', contributions: {}, majLe: expect.any(Number) },
      { total: 9999, membrane: 'epaisse', contributions: {}, majLe: expect.any(Number) },
    ]);
  });

  it('la Traque : celui qui l’a le plus nourrie, pas le MJ ; à égalité, le premier ; personne, null', () => {
    expect(R.remueur(remous(0, 'epaisse', { p1: 3, p2: 7, mj: 40 }))).toBe('p2');
    expect(R.remueur(remous(0, 'epaisse', { p1: 5, p2: 5 }))).toBe('p1');
    expect(R.remueur(remous(0, 'epaisse', { mj: 4, p1: 0 }))).toBeNull();
    expect(R.remueur(remous(0))).toBeNull();
    expect(R.remueur(null)).toBeNull();
  });
});
