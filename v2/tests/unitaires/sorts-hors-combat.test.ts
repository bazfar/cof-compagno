import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Sorts lancés hors combat, hors scène (lot G2a, décisions de Thomas du
 * 22/10/2026) : 1a (intention), 2b (palier au choix, au plus celui
 * atteint), 3a (mineurs gratuits, sans échec), 4a (par grimoire, avec le
 * jet d'échec), 5b et 15b (le MJ accepte, puis le joueur paie et lance),
 * 6a (moitié du coût, jet d'échec), 9a (au journal), 11a (limites),
 * 14b (sauvegarde de la cible), 16a (ce qui attend le MJ).
 */

const appels: { fn: string; chemin: string; donnees?: unknown; champs?: unknown[] }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  class FieldPath {
    segments: string[];
    constructor(...s: string[]) {
      this.segments = s;
    }
  }
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  return {
    increment: (n: number) => ({ increment: n }),
    FieldPath,
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? { chemin: p.join('/') } : { chemin: `${(parent as { chemin: string }).chemin}/auto${++n}` }),
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
    },
    updateDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees });
    },
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => lu(r.chemin),
        set: (r: { chemin: string }, donnees: unknown) => {
          ecritures.push({ fn: 'tx.set', chemin: r.chemin, donnees });
        },
        update: (r: { chemin: string }, ...champs: unknown[]) => {
          ecritures.push({ fn: 'tx.update', chemin: r.chemin, champs: champs.map((c) => (c instanceof FieldPath ? c.segments.join('/') : c)) });
        },
      };
      const r = await f(tx);
      appels.push(...ecritures);
      return r;
    },
  };
});
const journal = vi.hoisted(() => ({ de: 14, lancerEtNoter: vi.fn() }));
vi.mock('../../src/lib/actions/journal', () => ({
  lancerEtNoter: journal.lancerEtNoter.mockImplementation(async (_l: string, f: string) => ({ des: [journal.de], faces: 20, bonus: 0, total: journal.de, formule: f })),
}));

const { session } = await import('../../src/lib/session.svelte');
const L = await import('../../src/lib/fiche/sorts-hors-combat');
const A = await import('../../src/lib/actions/sorts-hors-combat');
const { schemaDemandeSort } = await import('../../src/lib/schemas/sort-hors-combat');
const { schemaJetJournal } = await import('../../src/lib/schemas/journal');
const R = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { classeParId } = await import('../../src/regles');
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type DemandeSort = import('../../src/lib/schemas/sort-hors-combat').DemandeSort;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
/** Kylhian, magicien d'évocation au rang 5, Leurre accordé Non maîtrisé, Lumière en mineur. */
const kylhian = (patch: Partial<FicheV2> = {}): FicheV2 & { id: string } => {
  const v1 = { ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith('Kylhian')), 'alice', 1).fiche, niveau: 5 };
  const f = R.convertirFiche(v1, { ...R.refonteVierge(classeParId.get('magicien')!, 5), ecole: 'evocation', elementDepart: 'feu', mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'], rangs: { 'magicien.ecole': 5 } });
  return { ...f, octrois: { ...f.octrois, verbes: [{ id: 'illusion.leurre', maitrise: 'nonMaitrise' }] }, id: 'p-k', ...patch };
};
const sort = (id: string) => L.sortsLancables(kylhian()).find((s) => s.id === id)!;
const demande = (patch: Partial<DemandeSort> = {}): DemandeSort => ({
  uid: 'alice', perso: 'p-k', nom: 'Kylhian', sort: 'illusion.leurre', nomSort: 'Leurre', palier: 'I', pp: 1, echec: 10, sauvegarde: 'Volonte', dd: 13,
  intention: 'Une silhouette au bout du couloir', textes: ['Un bruit ou une silhouette immobile : compte une réussite en infiltration.'],
  statut: 'acceptee', motif: null, de: null, resistance: null, scene: null, action: null, bonus: null, creeLe: 1, majLe: 1, ...patch,
});
const DEMANDE = 'tables/t1/sortsHorsCombat/d1';
const PERSO = 'tables/t1/persos/p-k';

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  journal.de = 14;
  journal.lancerEtNoter.mockClear();
});

describe('ce qui se lance hors combat', () => {
  it('les verbes appris qui ont un usage hors combat, le verbe par grimoire, les mineurs ; pas les autres', () => {
    expect(L.sortsLancables(kylhian()).map((s) => [s.id, s.mineur, s.parGrimoire])).toEqual([
      ['evocation.missile', false, false],
      ['evocation.choc', false, false],
      ['evocation.rayon', false, false],
      ['evocation.vortex', false, false],
      ['evocation.nova', false, false],
      ['illusion.leurre', false, true],
      ['mineur.lumiere', true, false],
    ]);
  });

  it('un verbe de la voie pas encore appris ne se lance pas', () => {
    const v1 = { ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith('Kylhian')), 'alice', 1).fiche, niveau: 5 };
    const f = R.convertirFiche(v1, { ...R.refonteVierge(classeParId.get('magicien')!, 5), ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 4 } });
    expect(L.sortsLancables(f).map((s) => s.id)).toEqual(['evocation.missile', 'evocation.choc', 'evocation.rayon', 'evocation.vortex']);
  });

  it('2b et 6a : un palier au choix jusqu’à celui atteint, la moitié du coût en combat, ce qu’il ouvre en cumul (7)', () => {
    const m = sort('evocation.missile');
    expect(m.paliers.map((p) => [p.palier, p.pp])).toEqual([
      ['I', 1],
      ['II', 1],
      ['III', 2],
    ]);
    expect(m.paliers[2]!.textes).toEqual(['Briser ou couper un objet à distance.', 'Deux objets à la fois.', 'Trajectoire courbe : le trait contourne un obstacle.']);
    expect(m.paliers[0]!.textes).toEqual(['Briser ou couper un objet à distance.']);
    expect(m.echec).toBe(0);
    expect(sort('evocation.choc').paliers.map((p) => p.palier)).toEqual(['I', 'II']);
  });

  it('14b : la sauvegarde et le DD du palier lancé', () => {
    expect(sort('evocation.choc').paliers[0]).toMatchObject({ sauvegarde: 'FOR', dd: 15 });
    expect(sort('evocation.missile').paliers[0]).toMatchObject({ sauvegarde: null, dd: null });
  });

  it('4a : par grimoire, palier I et jet d’échec ; 3a : un mineur ne coûte rien et ne rate pas', () => {
    const l = sort('illusion.leurre');
    expect(l.paliers.map((p) => [p.palier, p.pp, p.sauvegarde, p.dd])).toEqual([['I', 1, 'Volonte', 13]]);
    expect(l.echec).toBe(10);
    const lum = sort('mineur.lumiere');
    expect(lum.paliers.map((p) => [p.palier, p.pp])).toEqual([['I', 0]]);
    expect(lum.echec).toBe(0);
  });

  it('11a : un verbe « 1x/combat » se lance une fois par séance hors combat', () => {
    expect(sort('evocation.nova').unParSeance).toBe(true);
    expect(sort('evocation.missile').unParSeance).toBe(false);
  });

  it('PP disponibles : ceux de la fiche, sinon la réserve pleine', () => {
    expect(L.reservePP(kylhian())).toBe(20);
    expect(L.ppDisponibles(kylhian({ ppActuel: null }))).toBe(20);
    expect(L.ppDisponibles(kylhian({ ppActuel: 3 }))).toBe(3);
    expect(L.ppDisponibles(kylhian({ ppActuel: 0 }))).toBe(0);
  });

  it('jet d’échec, sauvegarde de la cible, ce qui attend le MJ (16a)', () => {
    expect(L.sortRate(10, 10)).toBe(true);
    expect(L.sortRate(11, 10)).toBe(false);
    expect(L.sortRate(1, 0)).toBe(false);
    expect(L.cibleResiste(10, 3, 13)).toBe(true);
    expect(L.cibleResiste(10, 2, 13)).toBe(false);
    expect(L.aTraiter(demande({ statut: 'attente' }))).toBe(true);
    expect(L.aTraiter(demande({ statut: 'acceptee' }))).toBe(false);
    expect(L.aTraiter(demande({ statut: 'lancee' }))).toBe(true);
    expect(L.aTraiter(demande({ statut: 'lancee', resistance: { de: 5, bonus: 0, reussie: false } }))).toBe(false);
    expect(L.aTraiter(demande({ statut: 'lancee', sauvegarde: null, dd: null }))).toBe(false);
    expect(L.aTraiter(demande({ statut: 'ratee', de: 3 }))).toBe(false);
  });
});

describe('schémas', () => {
  it('une demande : sauvegarde et DD vont ensemble ; la résistance suit un sort lancé ; le d20 suit le lancement', () => {
    expect(schemaDemandeSort.safeParse(demande()).success).toBe(true);
    expect(schemaDemandeSort.safeParse(demande({ dd: null })).success).toBe(false);
    expect(schemaDemandeSort.safeParse(demande({ resistance: { de: 4, bonus: 0, reussie: false } })).success).toBe(false);
    expect(schemaDemandeSort.safeParse(demande({ statut: 'lancee', resistance: { de: 4, bonus: 0, reussie: false } })).success).toBe(true);
    expect(schemaDemandeSort.safeParse(demande({ de: 12 })).success).toBe(false);
    expect(schemaDemandeSort.safeParse(demande({ statut: 'lancee', de: 12 })).success).toBe(true);
    expect(schemaDemandeSort.safeParse(demande({ intention: ' ' })).success).toBe(false);
  });

  it('journal : un sort peut n’avoir aucun dé, un jet non', () => {
    const jet = { auteurUid: 'alice', auteurNom: 'Alice', libelle: 'Lumière I, hors combat', formule: 'sort', des: [], bonus: 0, total: 0, creeLe: 1 };
    expect(schemaJetJournal.safeParse(jet).success).toBe(false);
    expect(schemaJetJournal.safeParse({ ...jet, sort: { nom: 'Lumière', palier: 'I', pp: 0, intention: 'Éclairer la crypte', issue: 'lance' } }).success).toBe(true);
  });
});

describe('demander (1a, 2b)', () => {
  it('écrit une demande en attente : coût, échec, sauvegarde, textes du palier', async () => {
    await A.demanderSort(kylhian(), 'illusion.leurre', 'I', '  Une silhouette au bout du couloir ', 's1');
    expect(appels).toHaveLength(1);
    const a = appels[0]!;
    expect(a.fn).toBe('setDoc');
    expect(a.chemin).toMatch(/^tables\/t1\/sortsHorsCombat\/auto\d+$/);
    expect(a.donnees).toMatchObject({ uid: 'alice', perso: 'p-k', sort: 'illusion.leurre', nomSort: 'Leurre', palier: 'I', pp: 1, echec: 10, sauvegarde: 'Volonte', dd: 13, intention: 'Une silhouette au bout du couloir', statut: 'attente', motif: null, de: null, resistance: null });
  });

  it('refuse : sans intention, palier non atteint, sort sans usage hors combat, PP manquants, « 1x/combat » déjà lancé cette séance', async () => {
    await expect(A.demanderSort(kylhian(), 'evocation.missile', 'I', ' ', 's1')).rejects.toThrow('Dis en une ligne');
    await expect(A.demanderSort(kylhian(), 'illusion.leurre', 'II', 'x', 's1')).rejects.toThrow('ne se lance pas');
    await expect(A.demanderSort(kylhian(), 'mineur.trait-arcanique', 'I', 'x', 's1')).rejects.toThrow('ne se lance pas');
    await expect(A.demanderSort(kylhian({ ppActuel: 1 }), 'evocation.missile', 'III', 'x', 's1')).rejects.toThrow('Il te faut 2 PP');
    await expect(A.demanderSort(kylhian({ usages: { 'evocation.nova': { seance: 's1', le: 1 } } }), 'evocation.nova', 'I', 'x', 's1')).rejects.toThrow('déjà servi cette séance');
    expect(appels).toEqual([]);
    // Une autre séance : de nouveau possible.
    await A.demanderSort(kylhian({ usages: { 'evocation.nova': { seance: 's0', le: 1 } } }), 'evocation.nova', 'I', 'x', 's1');
    expect(appels).toHaveLength(1);
  });
});

describe('le MJ répond (5b)', () => {
  it('accepte ou refuse, avec ou sans motif', async () => {
    await A.repondreDemandeSort({ ...demande(), id: 'd1' }, true, '  ');
    await A.repondreDemandeSort({ ...demande(), id: 'd1' }, false, ' Pas de lumière ici ');
    expect(appels.map((a) => [a.fn, a.chemin, (a.donnees as Record<string, unknown>).statut, (a.donnees as Record<string, unknown>).motif])).toEqual([
      ['updateDoc', DEMANDE, 'acceptee', null],
      ['updateDoc', DEMANDE, 'refusee', 'Pas de lumière ici'],
    ]);
  });
});

describe('lancer (15b, 6a, 9a)', () => {
  const poser = (d: DemandeSort, f: FicheV2 = kylhian({ ppActuel: 5 })) => {
    base.set(DEMANDE, d as unknown as Record<string, unknown>);
    const { id: _id, ...enBase } = f as FicheV2 & { id?: string };
    base.set(PERSO, enBase as unknown as Record<string, unknown>);
  };

  it('jet d’échec réussi : PP payés, sort lancé, noté au journal avec son d20', async () => {
    poser(demande());
    const d = await A.lancerSort('d1', 's1', () => 0.6); // d20 = 13 > 10
    expect(d).toMatchObject({ statut: 'lancee', de: 13 });
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([
      ['tx.update', PERSO],
      ['tx.update', DEMANDE],
      ['tx.set', expect.stringMatching(/^tables\/t1\/journal\/auto\d+$/)],
    ]);
    expect(appels[0]!.champs).toEqual(['ppActuel', 4]);
    expect(appels[1]!.champs![0]).toMatchObject({ statut: 'lancee', de: 13 });
    expect(appels[2]!.donnees).toMatchObject({ perso: 'Kylhian', libelle: 'Leurre I, hors combat', des: [13], total: 13, sort: { nom: 'Leurre', palier: 'I', pp: 1, intention: 'Une silhouette au bout du couloir', issue: 'lance' } });
  });

  it('jet d’échec raté : les PP sont dépensés, le sort est raté', async () => {
    poser(demande());
    const d = await A.lancerSort('d1', 's1', () => 0.45); // d20 = 10
    expect(d).toMatchObject({ statut: 'ratee', de: 10 });
    expect(appels[0]!.champs).toEqual(['ppActuel', 4]);
    expect(appels[2]!.donnees).toMatchObject({ libelle: 'Leurre I, hors combat : raté', sort: { issue: 'rate' } });
  });

  it('sans jet d’échec, pas de dé ; un « 1x/combat » est noté dans usages avec la séance (11a)', async () => {
    poser(demande({ sort: 'evocation.nova', nomSort: 'Nova', pp: 3, echec: 0, sauvegarde: 'DEX', dd: 15 }));
    const d = await A.lancerSort('d1', 's1', () => 0);
    expect(d).toMatchObject({ statut: 'lancee', de: null });
    expect(appels[0]!.champs).toEqual(['ppActuel', 2, 'usages/evocation.nova', { seance: 's1', le: expect.any(Number) }]);
    expect(appels[2]!.donnees).toMatchObject({ formule: 'sort', des: [], total: 0 });
  });

  it('L6.7b (6a, 7a) : ses PP payés vont au Remous de la scène active, × la race, raté ou non ; sans scène, rien', async () => {
    poser(demande({ pp: 3 }), { ...kylhian({ ppActuel: 5 }), race: 'humain' });
    await A.lancerSort('d1', 's1', () => 0.45, 'cave');
    expect(appels.at(-1)).toEqual({ fn: 'setDoc', chemin: 'tables/t1/remous/cave', donnees: { total: { increment: 3 }, contributions: { 'p-k': { increment: 3 } }, majLe: expect.any(Number) } });
    appels.length = 0;
    poser(demande({ pp: 3 }), { ...kylhian({ ppActuel: 5 }), race: 'humain' });
    await A.lancerSort('d1', 's1', () => 0.6);
    expect(appels.some((a) => a.fn === 'setDoc')).toBe(false);
    poser(demande({ pp: 3 }), { ...kylhian({ ppActuel: 5 }), race: 'elfe' });
    await A.lancerSort('d1', 's1', () => 0.6, 'cave');
    expect(appels.some((a) => a.fn === 'setDoc')).toBe(false);
  });

  it('PP jamais notés : la réserve pleine', async () => {
    poser(demande(), kylhian({ ppActuel: null }));
    await A.lancerSort('d1', undefined, () => 0.99);
    expect(appels[0]!.champs).toEqual(['ppActuel', 19]);
  });

  it('refuse : pas accepté, pas le sien, PP manquants ; rien n’est écrit', async () => {
    poser(demande({ statut: 'attente' }));
    await expect(A.lancerSort('d1', 's1')).rejects.toThrow('pas accepté');
    poser(demande({ uid: 'bob' }));
    await expect(A.lancerSort('d1', 's1')).rejects.toThrow('pas le tien');
    poser(demande({ pp: 6 }));
    await expect(A.lancerSort('d1', 's1')).rejects.toThrow('Il te faut 6 PP (tu en as 5)');
    base.delete(DEMANDE);
    await expect(A.lancerSort('d1', 's1')).rejects.toThrow('n’existe plus');
    expect(appels).toEqual([]);
  });
});

describe('sauvegarde de la cible (14b)', () => {
  it('le MJ la lance au journal ; la cible résiste si d20 + bonus atteint le DD', async () => {
    journal.de = 10;
    expect(await A.resisterSort({ ...demande({ statut: 'lancee' }), id: 'd1' }, 3)).toBe(true);
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Sauvegarde de Volonté contre Leurre (DD 13)', '1d20+3', undefined, expect.any(Function));
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: DEMANDE, donnees: { resistance: { de: 10, bonus: 3, reussie: true }, majLe: expect.any(Number) } }]);
    appels.length = 0;
    expect(await A.resisterSort({ ...demande({ statut: 'lancee' }), id: 'd1' }, 2)).toBe(false);
    expect(journal.lancerEtNoter).toHaveBeenLastCalledWith('Sauvegarde de Volonté contre Leurre (DD 13)', '1d20+2', undefined, expect.any(Function));
    expect(await A.resisterSort({ ...demande({ statut: 'lancee' }), id: 'd1' }, -1)).toBe(false);
    expect(journal.lancerEtNoter).toHaveBeenLastCalledWith(expect.any(String), '1d20-1', undefined, expect.any(Function));
  });

  it('refuse : sort non lancé, sans sauvegarde, déjà résolu', async () => {
    await expect(A.resisterSort({ ...demande(), id: 'd1' }, 0)).rejects.toThrow('n’appelle pas');
    await expect(A.resisterSort({ ...demande({ statut: 'lancee', sauvegarde: null, dd: null }), id: 'd1' }, 0)).rejects.toThrow('n’appelle pas');
    await expect(A.resisterSort({ ...demande({ statut: 'lancee', resistance: { de: 3, bonus: 0, reussie: false } }), id: 'd1' }, 0)).rejects.toThrow('déjà fait');
    expect(appels).toEqual([]);
  });
});
