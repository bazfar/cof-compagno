import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  const ref = (chemin: string) => ({ chemin, id: chemin.split('/').pop() });
  return {
    doc: (_db: unknown, ...p: string[]) => ref(p.join('/')),
    deleteDoc: async (r: { chemin: string }) => {
      appels.push({ fn: 'deleteDoc', chemin: r.chemin });
    },
    writeBatch: () => {
      const ecritures: typeof appels = [];
      return {
        set: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'lot.set', chemin: r.chemin, donnees }),
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
        delete: (r: { chemin: string }) => ecritures.push({ fn: 'tx.delete', chemin: r.chemin }),
      };
      const r = await f(tx);
      appels.push(...ecritures);
      return r;
    },
  };
});
const journal = vi.hoisted(() => ({ noterJet: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/journal', () => journal);
const remous = vi.hoisted(() => ({ viderRemous: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/remous', () => remous);

const { session } = await import('../../src/lib/session.svelte');
const R = await import('../../src/lib/repos/repos');
const A = await import('../../src/lib/actions/repos');
const F = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { classeParId } = await import('../../src/regles');
const { schemaEtatRepos, schemaReposEnAttente } = await import('../../src/lib/schemas/repos');
const { COUCHAGES, REPOS_COURTS_MAX } = await import('../../src/regles/repos');
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;

/*
 * Le repos (lot L7.1a, décisions de Thomas du 29/10/2026) : 2a (le repos
 * court), 3a (le repos long), 4b (le jet de PV qui attend), 5b (deux repos
 * courts au plus entre deux repos longs).
 */

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const v2 = (nom: string, classe: string, choix: Partial<RefonteFiche> = {}, id = 'p1'): FicheV2 & { id: string } => {
  const f = { ...v1(nom, id), classe };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, f.niveau), ...choix }), id };
};
const avecJauges = (f: FicheV2 & { id: string }, j: Partial<RefonteFiche['jauges']>, x: Partial<FicheV2> = {}) => ({ ...f, ...x, refonte: { ...f.refonte, jauges: { ...f.refonte.jauges, ...j } } }) as FicheV2 & { id: string };
const mage = () => v2('Shyrion', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] });
const sansDe = { des: [], faces: 0, bonus: 0, total: 0 };
const options = (o: Partial<Parameters<typeof A.prendreRepos>[4]> = {}) => ({ combatEnCours: false, scene: 'cave', remous: null, ...o });

beforeEach(() => {
  appels.length = 0;
  base.clear();
  journal.noterJet.mockClear();
  remous.viderRemous.mockClear();
  session.table = 't1';
});

describe('les règles (2a, 3a, 5b)', () => {
  it('les données de la v1 : quatre couchages, 1d4 au court, deux repos courts', () => {
    expect(COUCHAGES.map((c) => [c.id, c.de])).toEqual([['camp', null], ['dortoir', '1d4'], ['chambre_privee', '1d6'], ['luxe', '1d8']]);
    expect(REPOS_COURTS_MAX).toBe(2);
  });

  it('le schéma : une formule de dés, court ou long ; les repos courts de 0 à 9', () => {
    const a = { nom: 'Orel', quoi: 'long', formule: '6d10+1d6+2', creeLe: 1 };
    expect(schemaReposEnAttente.parse(a)).toEqual(a);
    for (const f of ['1d4', '2d8-1', '1d6+1d4', '12d10+1d8+12']) expect(schemaReposEnAttente.safeParse({ ...a, formule: f }).success).toBe(true);
    for (const f of ['d4', '1d4+', '1d4*2', 'abc', '1d4+-1', '100d4']) expect(schemaReposEnAttente.safeParse({ ...a, formule: f }).success).toBe(false);
    expect(schemaReposEnAttente.safeParse({ ...a, quoi: 'nuit' }).success).toBe(false);
    expect(schemaReposEnAttente.safeParse({ ...a, autre: 1 }).success).toBe(false);
    expect(schemaEtatRepos.parse({ majLe: 2 })).toEqual({ courts: {}, majLe: 2 });
    expect(schemaEtatRepos.safeParse({ courts: { p1: 10 }, majLe: 2 }).success).toBe(false);
  });

  it('2a : au court, +25 % des PP max (arrondi au supérieur), jamais au-delà ; les ressources « repos court » pleines', () => {
    const m = mage();
    const max = vueFiche(m).pp!.max;
    expect(R.apresRepos({ ...m, ppActuel: 0 }, 'court')).toEqual({ ppActuel: Math.ceil(max / 4) });
    expect(R.apresRepos({ ...m, ppActuel: max - 1 }, 'court')).toEqual({ ppActuel: max });
    expect(R.apresRepos({ ...m, ppActuel: max }, 'court')).toEqual({});
    // Le Guerrier : son Endurance se recharge au repos court.
    const g = v2('Karlach', 'guerrier');
    const e = F.jaugesPleines(classeParId.get('guerrier')!, g.niveau, 0).endurance!;
    expect(R.apresRepos(avecJauges(g, { endurance: 0 }), 'court')).toEqual({ 'refonte.jauges.endurance': e });
    expect(R.apresRepos(avecJauges(g, { endurance: e }), 'court')).toEqual({});
  });

  it('3a : au long, PP pleins ; « repos court » et « repos long » pleines ; le Sacré plein ; l’Inspiration, la Plongée, l’Âme ne bougent pas', () => {
    const m = mage();
    expect(R.apresRepos({ ...m, ppActuel: 1 }, 'long')).toEqual({ ppActuel: vueFiche(m).pp!.max });
    // Le Chevalier : son Honneur ne revient qu'au repos long.
    const c = avecJauges(v2('Hyrma', 'chevalier'), { honneur: 0 });
    const h = F.jaugesPleines(classeParId.get('chevalier')!, c.niveau, 0).honneur!;
    expect(R.apresRepos(c, 'court')).toEqual({});
    expect(R.apresRepos(c, 'long')).toEqual({ 'refonte.jauges.honneur': h });
    // Le Prêtre : son Sacré, au long seulement.
    const p = avecJauges(v2('Hermione', 'pretre'), { sacre: 0 }, { ppActuel: 0 });
    const s = F.jaugesPleines(classeParId.get('pretre')!, p.niveau, 0).sacre!;
    expect(R.apresRepos(p, 'court')).not.toHaveProperty(['refonte.jauges.sacre']);
    expect(R.apresRepos(p, 'long')).toMatchObject({ 'refonte.jauges.sacre': s });
    // Le Barde : l'Inspiration ne se recharge jamais ; la Plongée et l'Âme restent.
    const b = avecJauges(v2('Kargash', 'barde'), { inspiration: 0, plongee: 3, corruptionAme: 2 });
    expect(Object.keys(R.apresRepos(b, 'long')).filter((k) => k.startsWith('refonte'))).toEqual([]);
  });

  it('une fiche v1 : les PP seuls', () => {
    const f = { ...v1('Shyrion'), ppActuel: 0 };
    const pp = vueFiche(f).pp!;
    expect(R.apresRepos(f, 'long')).toEqual({ ppActuel: pp.max });
  });

  it('le jet : 1d4 au court ; au long, un dé de vie par tranche de deux niveaux, le couchage, le mod de CON', () => {
    const g = v2('Karlach', 'guerrier');
    const v = vueFiche(g);
    const con = v.caracs.find((c) => c.code === 'CON')!.mod;
    const signe = con > 0 ? `+${con}` : con < 0 ? `${con}` : '';
    expect(R.formuleRepos(g, 'court', 'luxe')).toBe('1d4');
    expect(R.formuleRepos(g, 'long')).toBe(`${Math.ceil(g.niveau / 2)}d${v.deVie}${signe}`);
    expect(R.formuleRepos(g, 'long', 'chambre_privee')).toBe(`${Math.ceil(g.niveau / 2)}d${v.deVie}+1d6${signe}`);
    expect(R.formuleRepos({ ...g, niveau: 5 }, 'long', 'camp')).toMatch(/^3d/);
    expect(R.formuleRepos({ ...g, niveau: 4 }, 'long', 'camp')).toMatch(/^2d/);
    // Le mod de CON, positif, nul ou négatif.
    expect(R.formuleRepos({ ...g, niveau: 2, caracs: { ...g.caracs, CON: 14 } }, 'long', 'dortoir')).toBe(`1d${v.deVie}+1d4+2`);
    expect(R.formuleRepos({ ...g, niveau: 2, caracs: { ...g.caracs, CON: 10 } }, 'long', 'dortoir')).toBe(`1d${v.deVie}+1d4`);
    expect(R.formuleRepos({ ...g, niveau: 2, caracs: { ...g.caracs, CON: 6 } }, 'long', 'dortoir')).toBe(`1d${v.deVie}+1d4-2`);
  });

  it('les PV après le jet : plafonnés au maximum, et aux PV max stockés (le Pacte de sang affiche plus) ; jamais en baisse', () => {
    const g = { ...v2('Karlach', 'guerrier'), pvActuel: 3 };
    const max = vueFiche(g).pv.max;
    expect(R.pvApresJet(g, 4)).toBe(7);
    expect(R.pvApresJet(g, 999)).toBe(max);
    expect(R.pvApresJet(g, -2)).toBe(3);
    expect(R.pvApresJet({ ...g, pvActuel: 0 }, -1)).toBe(0);
    const pacte = { ...v2('Kylhian', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.hemomancie': 1 }, mineurs: ['mineur.lumiere', 'mineur.main-du-mage'] }), pvActuel: 1 };
    expect(vueFiche(pacte).pv.max).toBeGreaterThan(pacte.pvMax);
    expect(R.pvApresJet(pacte, 999)).toBe(pacte.pvMax);
  });
});

describe('le MJ lance le repos (2a, 3a, 4b, 5b)', () => {
  it('au court : PP et ressources rendus, un jet 1d4 qui attend, un repos court de plus ; au journal', async () => {
    const m = { ...mage(), id: 'p1', ppActuel: 0 };
    const g = avecJauges(v2('Karlach', 'guerrier', {}, 'p2'), { endurance: 0 });
    const r = await A.prendreRepos('court', [m, g], { courts: { p2: 1, autre: 2 }, majLe: 1 }, new Set(), options({ remous: { total: 20, membrane: 'epaisse', contributions: {} } }));
    expect(r).toEqual({ servis: [m.nom, g.nom], enAttente: [], auPlafond: [] });
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([
      ['lot.update', 'tables/t1/persos/p1'],
      ['lot.set', 'tables/t1/reposEnAttente/p1'],
      ['lot.update', 'tables/t1/persos/p2'],
      ['lot.set', 'tables/t1/reposEnAttente/p2'],
      ['lot.set', 'tables/t1/repos/etat'],
    ]);
    expect(appels[1]!.donnees).toEqual({ nom: m.nom, quoi: 'court', formule: '1d4', creeLe: expect.any(Number) });
    expect(appels[4]!.donnees).toEqual({ courts: { p1: 1, p2: 2, autre: 2 }, majLe: expect.any(Number) });
    expect(journal.noterJet.mock.calls).toEqual([['Repos court', '0', sansDe, 'MJ', `${m.nom}, ${g.nom} : PP et ressources rendus, jet de PV à lancer.`]]);
    expect(remous.viderRemous).not.toHaveBeenCalled();
  });

  it('5b, 4b : au plafond de repos courts, ou un jet encore à lancer : écarté, et dit ; personne à servir : refusé', async () => {
    const m = { ...mage(), ppActuel: vueFiche(mage()).pp!.max };
    const g = v2('Karlach', 'guerrier', {}, 'p2');
    const k = v2('Kylhian', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 1, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] }, 'p3');
    const r = await A.prendreRepos('court', [m, g, k], { courts: { p2: 2 }, majLe: 1 }, new Set(['p3']), options());
    expect(r).toEqual({ servis: [m.nom], enAttente: [k.nom], auPlafond: [g.nom] });
    // PP déjà pleins : rien à écrire sur la fiche, le jet attend quand même.
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([['lot.set', 'tables/t1/reposEnAttente/p1'], ['lot.set', 'tables/t1/repos/etat']]);
    expect(appels[1]!.donnees).toEqual({ courts: { p1: 1, p2: 2 }, majLe: expect.any(Number) });
    expect(journal.noterJet.mock.calls[0]![4]).toBe(`${m.nom} : PP et ressources rendus, jet de PV à lancer. Jet du repos précédent à lancer d’abord : ${k.nom}. Déjà 2 repos courts depuis le dernier repos long : ${g.nom}.`);
    appels.length = 0;
    await expect(A.prendreRepos('court', [g], { courts: { p2: 2 }, majLe: 1 }, new Set(), options())).rejects.toThrow(`Déjà 2 repos courts depuis le dernier repos long : ${g.nom}.`);
    await expect(A.prendreRepos('long', [g], null, new Set(['p2']), options())).rejects.toThrow(`Jet du repos précédent à lancer d’abord : ${g.nom}.`);
    await expect(A.prendreRepos('long', [], null, new Set(), options())).rejects.toThrow('Aucun personnage joué parmi les présents.');
    await expect(A.prendreRepos('long', [g], null, new Set(), options({ combatEnCours: true }))).rejects.toThrow('Un combat est en cours');
    expect(appels).toEqual([]);
  });

  it('3a : au long, le couchage dans le jet et au journal ; les repos courts repartent à 0, même au plafond ; le Remous du lieu vidé', async () => {
    const g = { ...avecJauges(v2('Karlach', 'guerrier', {}, 'p2'), { endurance: 0 }) };
    const lieu = { total: 30, membrane: 'fine' as const, contributions: {} };
    await A.prendreRepos('long', [g], { courts: { p2: 2 }, majLe: 1 }, new Set(), options({ couchage: 'luxe', remous: lieu }));
    expect(appels.find((a) => a.chemin.endsWith('reposEnAttente/p2'))!.donnees).toMatchObject({ quoi: 'long', formule: R.formuleRepos(g, 'long', 'luxe') });
    expect(appels.find((a) => a.chemin.endsWith('repos/etat'))!.donnees).toEqual({ courts: { p2: 0 }, majLe: expect.any(Number) });
    expect(journal.noterJet.mock.calls[0]![0]).toBe('Repos long — Luxe');
    expect(remous.viderRemous).toHaveBeenCalledWith('cave', lieu, 'repos');
    expect(journal.noterJet.mock.invocationCallOrder[0]!).toBeLessThan(remous.viderRemous.mock.invocationCallOrder[0]!);
  });

  it('3a : sans couchage choisi, le camp ; une jauge vide, ou sans scène : le Remous ne bouge pas', async () => {
    const g = v2('Karlach', 'guerrier', {}, 'p2');
    await A.prendreRepos('long', [g], null, new Set(), options({ remous: { total: 0, membrane: 'epaisse', contributions: {} } }));
    expect(journal.noterJet.mock.calls[0]![0]).toBe('Repos long — Camp (hors ville)');
    expect(appels.find((a) => a.chemin.endsWith('reposEnAttente/p2'))!.donnees).toMatchObject({ formule: R.formuleRepos(g, 'long', 'camp') });
    await A.prendreRepos('long', [g], null, new Set(), options({ scene: null, remous: { total: 9, membrane: 'epaisse', contributions: {} } }));
    await A.prendreRepos('long', [g], null, new Set(), options({ remous: null }));
    expect(remous.viderRemous).not.toHaveBeenCalled();
  });
});

describe('le jet de repos (4b)', () => {
  const g = { ...v2('Karlach', 'guerrier', {}, 'p2'), pvActuel: 2 };
  const enBase = () => {
    const { id: _id, ...x } = g;
    base.set('tables/t1/persos/p2', x as never);
    base.set('tables/t1/reposEnAttente/p2', { nom: g.nom, quoi: 'long', formule: '2d6+1', creeLe: 1 });
  };

  it('ses PV montent du jet, plafonnés ; le jet qui attendait part ; au journal', async () => {
    enBase();
    // 2d6 à 0,5 : 4 + 4, +1.
    expect(await A.lancerJetRepos('p2', () => 0.5)).toEqual({ total: 9, pv: Math.min(11, vueFiche(g).pv.max) });
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: 'tables/t1/persos/p2', donnees: { pvActuel: Math.min(11, vueFiche(g).pv.max) } },
      { fn: 'tx.delete', chemin: 'tables/t1/reposEnAttente/p2' },
    ]);
    expect(journal.noterJet.mock.calls).toEqual([['Repos long — PV', '2d6+1', { des: [4, 4], faces: 6, bonus: 1, total: 9 }, g.nom, `${g.nom} : ${Math.min(11, vueFiche(g).pv.max)} PV.`]]);
  });

  it('déjà lancé, ou la fiche absente : refusé, rien n’est écrit', async () => {
    await expect(A.lancerJetRepos('p2')).rejects.toThrow('Ce jet de repos a déjà été lancé.');
    base.set('tables/t1/reposEnAttente/p2', { nom: g.nom, quoi: 'court', formule: '1d4', creeLe: 1 });
    await expect(A.lancerJetRepos('p2')).rejects.toThrow('Fiche introuvable.');
    expect(appels).toEqual([]);
    expect(journal.noterJet).not.toHaveBeenCalled();
  });

  it('le MJ retire un jet qui attend', async () => {
    await A.retirerJetRepos('p2');
    expect(appels).toEqual([{ fn: 'deleteDoc', chemin: 'tables/t1/reposEnAttente/p2' }]);
  });
});
