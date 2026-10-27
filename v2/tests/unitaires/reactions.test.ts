import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Les réactions en combat (lot L6.5b, décisions de Thomas du 26/10/2026) :
 * 1a (le joueur demande, le client du MJ joue), 2b et 3b (le pas qui quitte
 * le contact d'un ennemi, case après case, ouvre son attaque
 * d'opportunité), 4 (le déplacement va au bout), 5a et 11a (le monstre
 * frappe de sa première attaque au contact), 6a (la barre hors de son tour,
 * le rappel du MJ), 6b (le bond sur la case choisie), 7a (une réaction par
 * round, rendue au début de son tour), 8a (le bonus « contre cette
 * attaque » tombe avec elle), 9a (le coût à l'usage).
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
    deleteField: () => '<supprimé>',
    updateDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees });
    },
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
    },
    addDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'addDoc', chemin: r.chemin, donnees });
    },
    deleteDoc: async (r: { chemin: string }) => {
      appels.push({ fn: 'deleteDoc', chemin: r.chemin });
    },
    writeBatch: () => {
      const ecritures: typeof appels = [];
      return {
        set: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'lot.set', chemin: r.chemin, donnees }),
        update: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'lot.update', chemin: r.chemin, donnees }),
        delete: (r: { chemin: string }) => ecritures.push({ fn: 'lot.delete', chemin: r.chemin }),
        commit: async () => {
          appels.push(...ecritures);
        },
      };
    },
    getDocs: async (q: { chemin: string; w?: { champ: string; v: unknown } }) => ({
      docs: [...base.entries()]
        .filter(([k, d]) => k.startsWith(`${q.chemin}/`) && !k.slice(q.chemin.length + 1).includes('/') && (!q.w || d[q.w.champ] === q.w.v))
        .map(([k, d]) => ({ id: k.split('/').pop(), data: () => d })),
    }),
    query: (c: { chemin: string }, w?: { champ: string; v: unknown }) => ({ ...c, w }),
    where: (champ: string, _op: string, v: unknown) => ({ champ, v }),
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
const journal = vi.hoisted(() => ({ noterJet: vi.fn(async (..._a: unknown[]) => {}), lancerEtNoter: vi.fn() }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/actions/carte', () => ({ marquerMort: vi.fn() }));

const { session } = await import('../../src/lib/session.svelte');
const S = await import('../../src/lib/combat/sorts');
const L = await import('../../src/lib/actions/sorts-combat');
const F = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const R = await import('../../src/lib/combat/reactions');
const AR = await import('../../src/lib/actions/reactions');
const X = await import('../../src/lib/actions/attaques');
const B = await import('../../src/lib/combat/bonus');
const { appliquerChangements } = await import('../../src/lib/combat/changements');
const { pasAPas } = await import('../../src/lib/battlemap/interactions');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { PORTEE_CONTACT } = await import('../../src/lib/combat/attaque');
const { classeParId } = await import('../../src/regles');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id = 'p1'): Fiche & { id: string } => ({
  ...ficheDepuisV1(
    FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)),
    'alice',
    1,
  ).fiche,
  id,
});
/** Un Magicien de niveau 9, l'école au rang voulu. */
const mageN = (ecole: string, rang: number, choix: Partial<RefonteFiche> = {}): FicheV2 & { id: string } => {
  const brut = { ...v1('Shyrion'), classe: 'magicien', niveau: 9 };
  return {
    ...F.convertirFiche(
      brut as never,
      {
        ...F.refonteVierge(classeParId.get('magicien')!, 9),
        ecole,
        elementDepart: 'feu',
        rangs: { 'magicien.ecole': rang, 'magicien.elementaire': 1 },
        mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'],
        ...choix,
      } as never,
    ),
    id: 'p1',
    ppActuel: 30,
  } as FicheV2 & { id: string };
};
const neutre = { physique: 1, magique: 1 };
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`,
  genre: 'pj',
  nom: id,
  perso: id,
  uid: `u-${id}`,
  monstre: null,
  modInit: 1,
  initiative: 10,
  de: 9,
  pv: null,
  pvMax: null,
  aTerre: false,
  mvtBase: 5,
  def: null,
  armure: 0,
  resistances: neutre,
  mortSucces: 0,
  mortEchecs: 0,
  mort: false,
  etats: [],
  usages: {},
  gainTouche: { round: 0, montant: 0 },
  debutTour: 0,
  visee: false,
  sauvegardes: null,
  boss: false,
  demonOuMortVivant: false,
  pvTemp: 0,
  bonus: [],
  tourActions: 0,
  principale: false,
  secondaire: false,
  mvt: 0,
  sprint: false,
  creeLe: 1,
  maitre: null,
  invocation: null,
  concentration: null,
  ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`,
  genre: 'monstre',
  nom: id,
  perso: null,
  uid: null,
  monstre: 'goule',
  modInit: 3,
  initiative: 15,
  de: 12,
  pv: 14,
  pvMax: 14,
  aTerre: false,
  mvtBase: 5,
  def: 13,
  armure: 0,
  resistances: neutre,
  mortSucces: 0,
  mortEchecs: 0,
  mort: false,
  etats: [],
  usages: {},
  gainTouche: { round: 0, montant: 0 },
  debutTour: 0,
  visee: false,
  sauvegardes: { FOR: 1, DEX: 2, CON: 1, Volonte: 0 },
  boss: false,
  demonOuMortVivant: false,
  pvTemp: 0,
  bonus: [],
  tourActions: 0,
  principale: false,
  secondaire: false,
  mvt: 0,
  sprint: false,
  creeLe: 1,
  maitre: null,
  invocation: null,
  concentration: null,
  ...c,
});
/** Une suite de dés : [valeur, faces]. */
const suite = (...v: [number, number][]) => {
  let i = 0;
  return () => {
    const x = v[i++];
    if (!x) throw new Error('plus de dés prévus');
    return (x[0] - 0.5) / x[1];
  };
};
const enBase = (c: Combattant & { id: string }) => base.set(`${C}/${c.id}`, (({ id: _i, ...x }) => x)(c));
const C = 'tables/t1/combats/c1/combattants';
const combat = { tour: 6, round: 2, scene: 'cave', actif: 'pj-p1', porteesLibres: false };
const scene = (murs: [[number, number], [number, number]][] = [], obstacles: [[number, number], [number, number]][] = []) => ({ colonnes: 10, lignes: 10, murs, obstacles, portes: [] }) as never;

const j = (id: string, cx: number, cy: number, genre: 'pj' | 'monstre' = 'monstre') => ({ id, genre, cx, cy });


beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'u-p1';
  session.nom = 'Alice';
  session.etape = 'mj';
  journal.noterJet.mockClear();
});

/** Un personnage de la refonte au niveau 9. */
const pjN = (nom: string, classe: string, choix: Record<string, unknown>, id = 'p1'): FicheV2 & { id: string } => {
  const brut = { ...v1(nom, id), classe, niveau: 9 };
  return { ...F.convertirFiche(brut as never, { ...F.refonteVierge(classeParId.get(classe)!, 9), ...choix } as never), id, ppActuel: 30 } as FicheV2 & { id: string };
};
/** Bouclier (abjuration rang 3 : palier II, sur un allié à 6 cases). */
const abjurateur = () => mageN('abjuration', 3);
/** Changement de posture (soldat 5) et Riposte (peuple 1). */
const guerrier = (id = 'p1') => pjN('Karlach', 'guerrier', { rangs: { 'guerrier.soldat': 5, 'guerrier.peuple': 1 } }, id);
/** Esquive acrobatique, Échappée, la relance de l'Inspiration. */
const barde = () => pjN('Shyrion', 'barde', { rangs: { 'barde.spectacle': 5 } });
/** Repli, Déclencheur, Tir de couverture. */
const chasseur = () => pjN('Shyrion', 'chasseur', { rangs: { 'chasseur.embuscade': 4, 'chasseur.gachette': 3 } });
const parId = (f: FicheV2, id: string) => S.reactionsDeCombat(f).find((s) => s.id === id)!;
const horsTour = { ...combat, actif: 'm-r1-a' };
const choixR = (sort: string, cibles: string[] = [], c: Record<string, unknown> = {}) => ({ sort, palier: 'I' as const, surcharge: false, element: null, visee: { cibles, point: null }, reaction: true as const, ...c });
const ecrit = (chemin: string) => appels.filter((a) => a.chemin === chemin).map((a) => a.donnees as Record<string, unknown>);
const R_ = 'tables/t1/combats/c1/reactions';
/** Une invocation du joueur p1 (L6.4b2). */
const invoc = () => ({
  ...monstre('i', { genre: 'invocation', monstre: null, uid: 'u-p1', maitre: 'pj-p1', def: 10, pv: 5, pvMax: 5, sauvegardes: null, invocation: { creature: 'tison', element: null, attaque: null, objet: false, remous: 1, rounds: 2, lancer: 't2' } }),
  id: 'i-p1-t2-1',
});
const sansCarte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj')] };
const O_ = 'tables/t1/combats/c1/opportunites';

describe('une réaction par round, rendue au début de son tour (7a)', () => {
  it('libre sans usage ; prise ce round ; rendue quand son tour recommence', () => {
    expect(R.reactionDisponible({ usages: {}, debutTour: 0 })).toBe(true);
    expect(R.reactionDisponible({ usages: { reaction: 5 }, debutTour: 3 })).toBe(false);
    expect(R.reactionDisponible({ usages: { reaction: 5 }, debutTour: 5 })).toBe(false);
    expect(R.reactionDisponible({ usages: { reaction: 5 }, debutTour: 6 })).toBe(true);
    expect(R.USAGE_REACTION).toBe('reaction');
  });
});

describe('le chemin et l’attaque d’opportunité (2b, 3b, 10a, 11a)', () => {
  it('un pas rapide : les cases sautées s’intercalent, en diagonale d’abord', () => {
    expect(pasAPas({ cx: 0, cy: 0 }, { cx: 3, cy: 1 })).toEqual([
      { cx: 1, cy: 1 },
      { cx: 2, cy: 1 },
      { cx: 3, cy: 1 },
    ]);
    expect(pasAPas({ cx: 2, cy: 2 }, { cx: 2, cy: 0 })).toEqual([
      { cx: 2, cy: 1 },
      { cx: 2, cy: 0 },
    ]);
    expect(pasAPas({ cx: 2, cy: 2 }, { cx: 2, cy: 2 })).toEqual([]);
  });

  it('chaque ennemi dont il quitte le contact, le long du chemin ; pas les autres', () => {
    const chemin = [
      { cx: 1, cy: 1 },
      { cx: 2, cy: 1 },
      { cx: 3, cy: 1 },
      { cx: 4, cy: 1 },
    ];
    const jetons = [
      j('pj-p1', 4, 1, 'pj'),
      j('m-r1-a', 0, 1), // au contact au départ, quitté au premier pas
      j('m-r1-b', 2, 2), // au contact jusqu'à la troisième case, quitté au dernier pas
      j('m-r1-c', 7, 1), // jamais au contact
      j('m-r1-d', 0, 0), // à terre
      j('m-r1-e', 0, 2), // sa réaction est prise
      j('m-r1-f', 1, 0), // étourdi
      j('m-r1-g', 4, 2), // au contact à l'arrivée : il n'est pas quitté
      j('pj-p2', 0, 1, 'pj'), // un allié
      { ...j('m-r1-h', 2, 0), mort: true }, // un corps
    ];
    const cs = [
      pj('p1'),
      monstre('a'),
      monstre('b'),
      monstre('c'),
      monstre('d', { aTerre: true }),
      monstre('e', { usages: { reaction: 6 }, debutTour: 2 }),
      monstre('f', { etats: [{ id: 'etourdi', rounds: 1, cumul: 1, charges: null, des: null, source: null }] }),
      monstre('g'),
      pj('p2'),
      monstre('h'),
    ];
    expect(R.opportunitesDuChemin('pj-p1', chemin, jetons, cs)).toEqual(['m-r1-a', 'm-r1-b']);
    // Sans pas, rien.
    expect(R.opportunitesDuChemin('pj-p1', [chemin[0]!], jetons, cs)).toEqual([]);
    expect(R.opportunitesDuChemin('pj-p9', chemin, jetons, cs)).toEqual([]);
    expect(R.idOpportunite(6, 'm-r1-a', 'pj-p1')).toBe('t6-m-r1-a-pj-p1');
  });

  it('un monstre qui bouge : le PJ qu’il quitte peut frapper ; une invocation non (11a) ; un PJ mort non', () => {
    const chemin = [
      { cx: 1, cy: 1 },
      { cx: 3, cy: 1 },
    ];
    const jetons = [j('m-r1-a', 3, 1), j('pj-p1', 0, 1, 'pj'), j('i-p1-t2-1', 1, 0, 'pj'), j('pj-p2', 0, 0, 'pj')];
    const cs = [monstre('a'), pj('p1'), { ...pj('x', { genre: 'invocation', perso: null }), id: 'i-p1-t2-1' }, pj('p2', { mort: true, mortEchecs: 3 })];
    expect(R.opportunitesDuChemin('m-r1-a', chemin, jetons, cs)).toEqual(['pj-p1']);
  });
});

describe('ses réactions et ce qu’elles demandent (6a, 6b, 8a)', () => {
  it('les réactions de son profil, puis l’attaque d’opportunité ; la barre propose les premières', () => {
    const g = guerrier();
    expect(S.reactionsDeCombat(g).map((s) => s.id)).toEqual(['guerrier.changement-de-posture', 'guerrier.riposte', 'arme.opportunite']);
    expect(R.reactionsProposees(g).map((s) => s.id)).toEqual(['guerrier.changement-de-posture', 'guerrier.riposte']);
    expect(S.reactionsDeCombat(abjurateur()).map((s) => `${s.id}:${s.paliers.join('/')}`)).toEqual(['abjuration.bouclier:I/II', 'arme.opportunite:I']);
    // Les sorts de la barre ne les montrent pas.
    expect(S.sortsDeCombat(g).some((s) => s.id === 'guerrier.riposte' || s.id === 'arme.opportunite')).toBe(false);
    expect(S.reactionsDeCombat(v1('Shyrion'))).toEqual([]);
    expect(R.OPPORTUNITE).toBe('arme.opportunite');
  });

  it('la cible et son camp, le bond (6b), la posture et son plafond', () => {
    const g = guerrier();
    expect(R.besoinsReaction(g, pj('p1'), parId(g, 'guerrier.riposte'))).toEqual({ cible: 'ennemi', bond: null, posture: null });
    expect(R.besoinsReaction(g, pj('p1'), parId(g, 'guerrier.changement-de-posture'))).toEqual({ cible: null, bond: null, posture: { axes: ['attaque', 'DEF', 'degats'], plafond: 5 } });
    const sousMaitrise = pj('p1', { etats: [{ id: 'maitrise_tactique', rounds: 2, cumul: 1, charges: null, des: null, source: null }] });
    expect(R.besoinsReaction(g, sousMaitrise, parId(g, 'guerrier.changement-de-posture')).posture!.plafond).toBe(10);
    const b = barde();
    expect(R.besoinsReaction(b, pj('p1'), parId(b, 'barde.esquive-acrobatique'))).toEqual({ cible: null, bond: 2, posture: null });
    // Bouclier au palier II : sur un allié.
    const m = abjurateur();
    expect(R.besoinsReaction(m, pj('p1'), parId(m, 'abjuration.bouclier')).cible).toBe('allie');
  });
});

describe('le moteur joue la réaction, hors de son tour (1a, 7a, 8a, 9a, 4)', () => {
  it('Bouclier : +2 DEF contre la prochaine attaque, payé en PP ; ni action du tour ni main ; la réaction du round', async () => {
    const f = abjurateur();
    const moi = pj('p1');
    enBase(moi);
    const r = await L.lancerSortEnCombat('c1', horsTour, moi, f, choixR('abjuration.bouclier', ['pj-p1'], { palier: 'II' }), sansCarte as never, [moi], new Map([['p1', f]]), () => 0.5);
    expect(r.issue).toBe('reussi');
    const m = ecrit(`${C}/pj-p1`)[0]!;
    expect(m.bonus).toEqual([{ sur: 'DEF', valeur: 2, rounds: 1, consomme: false, typeDegats: null, source: 'Shyrion', contreAttaque: true }]);
    expect(m.usages).toEqual({ reaction: 6 });
    expect(m).not.toHaveProperty('principale');
    expect(m).not.toHaveProperty('tourActions');
    // 9a : son coût se paie à l'usage (Bouclier II : 3 PP).
    expect(ecrit('tables/t1/persos/p1')[0]!.ppActuel).toBe(27);
    expect(journal.noterJet.mock.calls[0]![4]).toContain('+2 DEF, prochaine attaque (1)');
  });

  it('refusée à son tour, ou sa réaction du round prise ; un sort ordinaire n’est pas une réaction', async () => {
    const f = abjurateur();
    await expect(L.lancerSortEnCombat('c1', combat, pj('p1'), f, choixR('abjuration.bouclier', ['pj-p1']), sansCarte as never, [pj('p1')], new Map([['p1', f]]), () => 0.5)).rejects.toThrow('À ton tour, pas de réaction');
    const prise = pj('p1', { usages: { reaction: 5 }, debutTour: 2 });
    await expect(L.lancerSortEnCombat('c1', horsTour, prise, f, choixR('abjuration.bouclier', ['pj-p1']), sansCarte as never, [prise], new Map([['p1', f]]), () => 0.5)).rejects.toThrow('p1 a déjà réagi ce round.');
    await expect(L.lancerSortEnCombat('c1', horsTour, pj('p1'), f, choixR('mineur.lumiere'), sansCarte as never, [pj('p1')], new Map([['p1', f]]), () => 0.5)).rejects.toThrow('Tu ne connais pas ce sort.');
    // Hors de son tour, sans réaction, rien ne change.
    await expect(L.lancerSortEnCombat('c1', horsTour, pj('p1'), f, { ...choixR('mineur.lumiere'), reaction: undefined }, sansCarte as never, [pj('p1')], new Map([['p1', f]]), () => 0.5)).rejects.toThrow('Ce n’est pas ton tour.');
  });

  it('l’opportunité : l’arme frappe, la réaction est prise ; le déplacement va au bout (4) ; la limite des données compte', async () => {
    const f = guerrier();
    const moi = pj('p1');
    const g = monstre('a');
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0)] };
    await L.lancerSortEnCombat('c1', horsTour, moi, f, choixR('arme.opportunite', ['m-r1-a']), carte as never, [moi, g], new Map([['p1', f]]), () => 0.9);
    expect(ecrit(`${C}/m-r1-a`)[0]!.pv).toBeLessThan(14);
    expect(ecrit(`${C}/pj-p1`)[0]).toEqual({ usages: { reaction: 6 } });
    const texte = journal.noterJet.mock.calls.map((c) => c[4]).join(' ');
    expect(texte).toContain('touché');
    expect(texte).not.toContain('arrête');
    // Changement de posture : une fois par round (données), en plus de la réaction.
    appels.length = 0;
    await L.lancerSortEnCombat('c1', horsTour, moi, f, choixR('guerrier.changement-de-posture', [], { options: { posture: { plus: 'attaque', moins: 'DEF', valeur: 2 } } }), carte as never, [moi, g], new Map([['p1', f]]), () => 0.5);
    const p = ecrit(`${C}/pj-p1`)[0]!;
    expect(p.usages).toEqual({ 'guerrier.changement-de-posture': 2, reaction: 6 });
    expect((p.bonus as { sur: string; valeur: number; posture?: true }[]).map((b) => [b.sur, b.valeur, b.posture])).toEqual([
      ['attaque', 2, true],
      ['DEF', -2, true],
    ]);
    const usee = pj('p1', { usages: { 'guerrier.changement-de-posture': 2 } });
    await expect(L.lancerSortEnCombat('c1', horsTour, usee, f, choixR('guerrier.changement-de-posture', [], { options: { posture: { plus: 'attaque', moins: 'DEF', valeur: 2 } } }), carte as never, [usee, g], new Map([['p1', f]]), () => 0.5)).rejects.toThrow('a déjà servi ce round');
  });

  it('Tir de couverture : −2 à la prochaine attaque de l’ennemi ; Esquive : le bond à placer', async () => {
    const f = chasseur();
    const moi = pj('p1');
    const g = monstre('a');
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0)] };
    await L.lancerSortEnCombat('c1', horsTour, moi, f, choixR('chasseur.tir-de-couverture', ['m-r1-a']), carte as never, [moi, g], new Map([['p1', f]]), () => 0.5);
    expect(ecrit(`${C}/m-r1-a`)[0]!.bonus).toEqual([{ sur: 'attaque', valeur: -2, rounds: 1, consomme: false, typeDegats: null, source: 'Shyrion', contreAttaque: true }]);
    const r = await L.lancerSortEnCombat('c1', horsTour, moi, barde(), choixR('barde.esquive-acrobatique'), carte as never, [moi, g], new Map([['p1', barde()]]), () => 0.5);
    expect(r.aPlacer).toEqual([{ cible: 'pj-p1', nom: 'p1', cases: 2 }]);
  });

  it('8a : seuls les bonus de DEF et d’attaque d’une réaction tombent avec l’attaque', () => {
    const lus = new Map([['pj-p1', { c: pj('p1'), fiche: null }]]);
    const bonus = (sur: string) => ({ type: 'bonus' as const, cible: 'pj-p1', sur, valeur: 2, duree: 'prochainTour' as const });
    const ecr = appliquerChangements([bonus('DEF'), bonus('degats'), bonus('attaqueDistance')], lus, { id: 'pj-p1', nom: 'Shyrion', fiche: null }, { reaction: true });
    expect((ecr.combattants.get('pj-p1')!.bonus as { sur: string; contreAttaque?: true }[]).map((b) => [b.sur, b.contreAttaque])).toEqual([
      ['DEF', true],
      ['degats', undefined],
      ['attaqueDistance', true],
    ]);
    const sans = appliquerChangements([bonus('DEF')], lus, { id: 'pj-p1', nom: 'Shyrion', fiche: null });
    expect((sans.combattants.get('pj-p1')!.bonus as { contreAttaque?: true }[])[0]).not.toHaveProperty('contreAttaque');
    const b = (sur: string, contreAttaque?: true) => ({ sur, valeur: 2, rounds: 1, consomme: false, typeDegats: null, source: null, ...(contreAttaque ? { contreAttaque } : {}) });
    const tous = [b('DEF', true), b('DEFContact', true), b('attaque', true), b('attaqueContact', true), b('DEF'), b('attaque')];
    expect(B.apresAttaque(tous, 'cible').map((x) => x.sur)).toEqual(['attaque', 'attaqueContact', 'DEF', 'attaque']);
    expect(B.apresAttaque(tous, 'attaquant').map((x) => x.sur)).toEqual(['DEF', 'DEFContact', 'DEF', 'attaque']);
    expect(B.texteBonus(b('DEF', true))).toBe('+2 DEF, prochaine attaque (1)');
    expect(B.SUR_CONTRE_ATTAQUE).toEqual(['DEF', 'DEFContact', 'DEFDistance', 'attaque', 'attaqueContact', 'attaqueDistance']);
  });
});

describe('l’attaque d’un monstre (8a, 5a)', () => {
  const griffes = { nom: 'Griffes', bonus: 4, formule: '1d6', typeDegats: 'physique' as const, portee: PORTEE_CONTACT, seuilCritique: 20, etatSurTouche: null };
  const contre = (sur: string, valeur: number) => ({ sur, valeur, rounds: 1, consomme: false, typeDegats: null, source: 'Shyrion', contreAttaque: true as const });
  const tenace = { sur: 'DEF', valeur: 1, rounds: 3, consomme: false, typeDegats: null, source: 'Bénédiction' };

  it('le Bouclier compte dans le jet puis tombe ; le −2 de couverture aussi ; le reste demeure', async () => {
    const f = guerrier();
    const ca = vueFiche(f).stats.ca;
    const cible = pj('p1', { bonus: [contre('DEF', 2), tenace] });
    const m = monstre('a', { bonus: [contre('attaque', -2)] });
    // d20 juste assez sans les bonus, raté avec : 4 − 2 contre CA + 2 + 1.
    const de = ca - 4;
    const r = await X.attaqueDeMonstre('c1', combat, m, griffes, cible, f, suite([de, 20]));
    expect(r.issue.touche).toBe(false);
    expect(r.issue.def).toBe(ca + 3);
    expect(r.issue.bonus).toBe(2);
    expect(ecrit(`${C}/m-r1-a`)[0]).toMatchObject({ bonus: [], principale: true });
    expect(ecrit(`${C}/pj-p1`)).toEqual([{ bonus: [tenace] }]);
  });

  it('touché : les bonus tombent avec les dégâts ; sans bonus « contre », rien ne s’écrit de plus', async () => {
    const f = guerrier();
    const cible = pj('p1', { bonus: [contre('DEF', 2)] });
    await X.attaqueDeMonstre('c1', combat, monstre('a'), griffes, cible, f, suite([19, 20], [3, 6]));
    expect(ecrit(`${C}/pj-p1`)).toEqual([{ bonus: [] }]);
    expect(ecrit(`${C}/m-r1-a`)[0]).not.toHaveProperty('bonus');
    // Le −2 de couverture et un bonus de dégâts « prochaine frappe » : tous deux tombent.
    appels.length = 0;
    const frappe = { sur: 'degats', valeur: 2, rounds: null, consomme: true, typeDegats: null, source: 'Rage' };
    await X.attaqueDeMonstre('c1', combat, monstre('a', { bonus: [contre('attaque', -2), frappe] }), griffes, pj('p1'), f, suite([19, 20], [3, 6]));
    expect(ecrit(`${C}/m-r1-a`).map((m) => m.bonus)).toEqual([[frappe], []]);
    appels.length = 0;
    await X.attaqueDeMonstre('c1', combat, monstre('a'), griffes, pj('p1'), f, suite([1, 20]));
    expect(ecrit(`${C}/pj-p1`)).toEqual([]);
  });

  it('5a : en réaction, elle prend la réaction du round, pas l’action ; une seule ; « Opportunité » au journal', async () => {
    const f = guerrier();
    const m = monstre('a', { principale: true, tourActions: 6 });
    await X.attaqueDeMonstre('c1', combat, m, griffes, pj('p1'), f, suite([1, 20]), true);
    expect(ecrit(`${C}/m-r1-a`)[0]).toEqual({ usages: { reaction: 6 } });
    expect(journal.noterJet.mock.calls[0]![0]).toBe('Opportunité : Griffes sur Karlach Grimhollow');
    await expect(X.attaqueDeMonstre('c1', combat, monstre('a', { usages: { reaction: 6 } }), griffes, pj('p1'), f, suite([1, 20]), true)).rejects.toThrow('a a déjà réagi ce round.');
    // Hors réaction, l'action principale prise refuse.
    await expect(X.attaqueDeMonstre('c1', combat, m, griffes, pj('p1'), f, suite([1, 20]))).rejects.toThrow('L’action principale est déjà prise');
  });

  it('sur une invocation : la réaction aussi, et le −2 de couverture tombe', async () => {
    const inv = invoc();
    const m = monstre('a', { bonus: [contre('attaque', -2)] });
    enBase(inv);
    await X.attaqueSurInvocation('c1', combat, m, griffes, inv, suite([1, 20]), true);
    expect(ecrit(`${C}/m-r1-a`)[0]).toEqual({ usages: { reaction: 6 }, bonus: [] });
    expect(journal.noterJet.mock.calls[0]![0]).toBe('Opportunité : Griffes sur i');
  });
});

describe('la demande du joueur, le client du MJ (1a, 2b, 6b)', () => {
  it('demander : hors de son tour, la réaction libre ; le document en attente', async () => {
    session.uid = 'u-p1';
    await AR.demanderReaction('c1', horsTour, pj('p1'), { reaction: 'guerrier.riposte', cible: 'm-r1-a', case: null, posture: null, opportunite: null });
    expect(appels).toEqual([
      { fn: 'addDoc', chemin: R_, donnees: { qui: 'pj-p1', uid: 'u-p1', reaction: 'guerrier.riposte', cible: 'm-r1-a', case: null, posture: null, opportunite: null, tour: 6, statut: 'attente', texte: null, creeLe: expect.any(Number) } },
    ]);
    await expect(AR.demanderReaction('c1', combat, pj('p1'), { reaction: 'guerrier.riposte', cible: null, case: null, posture: null, opportunite: null })).rejects.toThrow('À ton tour');
    await expect(AR.demanderReaction('c1', horsTour, pj('p1', { usages: { reaction: 6 } }), { reaction: 'guerrier.riposte', cible: null, case: null, posture: null, opportunite: null })).rejects.toThrow('Tu as déjà réagi ce round.');
  });

  it('2b : son pas ouvre ces opportunités, ce tour, une par attaquant', async () => {
    await AR.signalerOpportunites('c1', 6, 'pj-p1', ['m-r1-a', 'm-r1-b']);
    expect(appels).toEqual([
      { fn: 'lot.set', chemin: `${O_}/t6-m-r1-a-pj-p1`, donnees: { attaquant: 'm-r1-a', cible: 'pj-p1', tour: 6, creeLe: expect.any(Number) } },
      { fn: 'lot.set', chemin: `${O_}/t6-m-r1-b-pj-p1`, donnees: { attaquant: 'm-r1-b', cible: 'pj-p1', tour: 6, creeLe: expect.any(Number) } },
    ]);
  });

  const demande = (c: Record<string, unknown> = {}) => ({ id: 'r1', qui: 'pj-p1', uid: 'u-p1', reaction: 'guerrier.riposte', cible: 'm-r1-a', case: null, posture: null, opportunite: null, tour: 6, statut: 'attente' as const, texte: null, creeLe: 1, ...c });
  const enAttente = (c: Record<string, unknown> = {}) => base.set(`${R_}/r1`, { ...demande(c) });
  const contexte = (f: FicheV2 & { id: string }, c: Record<string, unknown> = {}) => {
    const moi = pj('p1');
    const g = monstre('a');
    enBase(moi);
    enBase(g);
    return { combattants: [moi, g], fiches: new Map([['p1', f]]), carte: { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0)] }, opportunites: [], ...c } as never;
  };

  it('le MJ la prend une fois, la joue, en écrit le texte ; prise ailleurs, rien', async () => {
    enAttente();
    const t = await AR.jouerReaction('c1', horsTour, demande(), contexte(guerrier()), () => 0.9);
    expect(t).toMatch(/^Riposte : Riposte I lancé/);
    expect(appels[0]).toEqual({ fn: 'tx.update', chemin: `${R_}/r1`, donnees: { statut: 'jouee' } });
    expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: `${R_}/r1`, donnees: { texte: t } });
    expect(ecrit(`${C}/m-r1-a`)[0]!.pv).toBeLessThan(14);
    base.set(`${R_}/r1`, { ...demande({ statut: 'jouee' }) });
    appels.length = 0;
    expect(await AR.jouerReaction('c1', horsTour, demande(), contexte(guerrier()), () => 0.9)).toBeNull();
    expect(appels).toEqual([]);
    base.delete(`${R_}/r1`);
    expect(await AR.jouerReaction('c1', horsTour, demande(), contexte(guerrier()), () => 0.9)).toBeNull();
  });

  it('les refus : la demande passe à « refusée », avec sa raison', async () => {
    const refus = async (d: Record<string, unknown>, ctx: Record<string, unknown> = {}, f = guerrier(), cb = horsTour) => {
      enAttente(d);
      appels.length = 0;
      const t = await AR.jouerReaction('c1', cb, demande(d), contexte(f, ctx), () => 0.9);
      expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: `${R_}/r1`, donnees: { statut: 'refusee', texte: t } });
      return t;
    };
    expect(await refus({ uid: 'u-p9' })).toBe('Ce combattant n’est pas le sien.');
    expect(await refus({ qui: 'pj-p9' })).toBe('Ce combattant n’est pas le sien.');
    expect(await refus({ tour: 5 })).toBe('Trop tard : le tour a passé.');
    expect(await refus({}, { fiches: new Map([['p1', v1('Shyrion')]]) })).toBe('Les réactions viennent avec une fiche de la refonte.');
    expect(await refus({}, { fiches: new Map() })).toBe('Les réactions viennent avec une fiche de la refonte.');
    expect(await refus({}, {}, { ...guerrier(), pvActuel: 0 })).toBe('p1 est à terre.');
    expect(await refus({ reaction: 'arme.opportunite', opportunite: 't6-m-r1-a-pj-p1' })).toBe('Cette attaque d’opportunité n’est plus ouverte.');
    expect(await refus({ reaction: 'barde.relance' })).toBe('Il ne connaît pas cette réaction.');
    expect(await refus({ reaction: 'barde.esquive-acrobatique', cible: null }, {}, barde())).toBe('Choisis la case où il bondit.');
    expect(await refus({ reaction: 'barde.esquive-acrobatique', cible: null, case: { cx: 5, cy: 5 } }, {}, barde())).toMatch(/^Esquive acrobatique : /);
    expect(await refus({ reaction: 'barde.esquive-acrobatique', cible: null, case: { cx: 1, cy: 0 } }, {}, barde())).toMatch(/^Esquive acrobatique : /);
    expect(await refus({ reaction: 'barde.esquive-acrobatique', cible: null, case: { cx: 0, cy: 1 } }, { carte: null }, barde())).toBe('Choisis la case où il bondit.');
    // Le moteur refuse : à son tour.
    expect(await refus({}, {}, guerrier(), combat)).toBe('À ton tour, pas de réaction : elle se joue hors de ton tour.');
    expect(ecrit(`${C}/m-r1-a`)).toEqual([]);
  });

  it('une erreur de l’app : refusée, sans détail', async () => {
    enAttente();
    const ctx = contexte(guerrier());
    const t = await AR.jouerReaction('c1', horsTour, demande(), { ...(ctx as object), combattants: null } as never, () => 0.9);
    expect(t).toBe('L’app n’a pas pu la jouer.');
  });

  it('l’opportunité ouverte se prend, puis se retire ; le bond se pose sur sa case (6b)', async () => {
    const o = { id: 't6-m-r1-a-pj-p1', attaquant: 'pj-p1', cible: 'm-r1-a', tour: 6, creeLe: 1 };
    const d = { reaction: 'arme.opportunite', opportunite: o.id };
    enAttente(d);
    const pasLeSien = [{ ...o, attaquant: 'pj-p2' }, { ...o, cible: 'm-r1-b' }, { ...o, tour: 5 }, { ...o, id: 'autre' }];
    for (const x of pasLeSien) {
      enAttente(d);
      expect(await AR.jouerReaction('c1', horsTour, demande(d), contexte(guerrier(), { opportunites: [x] }), () => 0.9)).toBe('Cette attaque d’opportunité n’est plus ouverte.');
    }
    enAttente(d);
    appels.length = 0;
    const t = await AR.jouerReaction('c1', horsTour, demande(d), contexte(guerrier(), { opportunites: [o] }), () => 0.9);
    expect(t).toMatch(/^Attaque d’opportunité : /);
    expect(appels.filter((a) => a.fn === 'deleteDoc')).toEqual([{ fn: 'deleteDoc', chemin: `${O_}/${o.id}` }]);
    // 6b
    const b = { reaction: 'barde.esquive-acrobatique', cible: null, case: { cx: 0, cy: 2 } };
    enAttente(b);
    appels.length = 0;
    await AR.jouerReaction('c1', horsTour, demande(b), contexte(barde()), () => 0.9);
    expect(appels.filter((a) => a.chemin === 'tables/t1/scenes/cave/jetons/pj-p1')).toEqual([{ fn: 'updateDoc', chemin: 'tables/t1/scenes/cave/jetons/pj-p1', donnees: { cx: 0, cy: 2 } }]);
    expect(appels.some((a) => a.fn === 'deleteDoc')).toBe(false);
  });

  it('la posture d’un Changement de posture passe au moteur', async () => {
    const d = { reaction: 'guerrier.changement-de-posture', cible: null, posture: { plus: 'degats', moins: 'attaque', valeur: 3 } };
    enAttente(d);
    await AR.jouerReaction('c1', horsTour, demande(d), contexte(guerrier()), () => 0.9);
    expect((ecrit(`${C}/pj-p1`)[0]!.bonus as { sur: string; valeur: number }[]).map((b) => [b.sur, b.valeur])).toEqual([
      ['degats', 3],
      ['attaque', -3],
    ]);
  });
});

describe('l’opportunité d’un monstre, depuis le panneau du MJ (5a, 11a)', () => {
  const attaques = [
    { nom: 'Arc', armeId: 'arc', bonusAttaque: 3 },
    { nom: 'Griffes', armeId: 'griffe', bonusAttaque: 4 },
  ];
  const armes = new Map([
    ['arc', { degats: '1d8', portee: 'moyenne (18m)' as const, typedegats: 'physique' as const }],
    ['griffe', { degats: '1d6', portee: 'contact' as const, typedegats: 'physique' as const }],
  ]);
  const o = { id: 't6-m-r1-a-pj-p1', attaquant: 'm-r1-a', cible: 'pj-p1', tour: 6, creeLe: 1 };

  it('sa première attaque au contact ; la réaction prise ; l’opportunité retirée ; la concentration en jeu', async () => {
    const f = guerrier();
    const cible = pj('p1', { concentration: { action: 'illusion.fascination', nom: 'Fascination', lancer: 't2', maintien: 0, rupture: [], rounds: null, etats: [], zone: null, invocations: [] } });
    const t = await AR.opportuniteDeMonstre('c1', combat, o, monstre('a'), cible, attaques, armes, f, [monstre('a'), cible], suite([19, 20], [3, 6], [20, 20]));
    expect(t).toMatch(/^Opportunité de a sur p1 : Griffes : touché, \d+ dégâts → Karlach Grimhollow \d+ PV\.$/);
    expect(journal.noterJet.mock.calls[0]![0]).toBe('Opportunité : Griffes sur Karlach Grimhollow');
    expect(appels.filter((a) => a.fn === 'deleteDoc')).toEqual([{ fn: 'deleteDoc', chemin: `${O_}/${o.id}` }]);
    expect(journal.noterJet.mock.calls.some((c) => String(c[0]).includes('oncentration'))).toBe(true);
    expect(AR.attaqueDOpportunite([])).toBeNull();
  });

  it('raté ; sur une invocation ; les refus', async () => {
    const f = guerrier();
    expect(await AR.opportuniteDeMonstre('c1', combat, o, monstre('a'), pj('p1'), attaques, armes, f, [], suite([1, 20]))).toBe('Opportunité de a sur p1 : Griffes : raté.');
    const inv = invoc();
    enBase(inv);
    const oi = { ...o, cible: inv.id };
    appels.length = 0;
    expect(await AR.opportuniteDeMonstre('c1', combat, oi, monstre('a', { principale: true, tourActions: 6 }), inv, attaques, armes, null, [], suite([19, 20], [3, 6]))).toMatch(/^Opportunité de a sur i : Griffes : touché, \d+ dégâts → i \d+ PV\.$/);
    expect(ecrit(`${C}/m-r1-a`)[0]).toEqual({ usages: { reaction: 6 } });
    expect(await AR.opportuniteDeMonstre('c1', combat, oi, monstre('a'), inv, attaques, armes, null, [], suite([1, 20]))).toBe('Opportunité de a sur i : Griffes : raté.');
    for (const x of [{ ...o, tour: 5 }, { ...o, attaquant: 'm-r1-b' }, { ...o, cible: 'pj-p2' }]) await expect(AR.opportuniteDeMonstre('c1', combat, x, monstre('a'), pj('p1'), attaques, armes, f, [], suite([1, 20]))).rejects.toThrow('n’est plus ouverte');
    await expect(AR.opportuniteDeMonstre('c1', combat, o, monstre('a'), pj('p1'), [attaques[0]!], armes, f, [], suite([1, 20]))).rejects.toThrow('a n’a pas d’attaque au contact.');
    await expect(AR.opportuniteDeMonstre('c1', combat, o, monstre('a'), pj('p1'), attaques, armes, null, [], suite([1, 20]))).rejects.toThrow('La fiche de p1 manque.');
  });
});

describe('le rappel du MJ avant l’attaque d’un monstre (6a)', () => {
  it('les réactions de la cible contre une attaque, celles des alliés pour un allié ; libres et debout seulement', () => {
    const m = { ...abjurateur(), id: 'p1' };
    const g = guerrier('p2');
    const fiches = new Map<string, Fiche>([
      ['p1', m],
      ['p2', g],
      ['p3', { ...guerrier('p3'), pvActuel: 0 }],
      ['p4', guerrier('p4')],
    ]);
    const cs = [pj('p1'), pj('p2'), pj('p3'), pj('p4', { usages: { reaction: 6 } }), monstre('a'), pj('p5')];
    expect(R.rappelAvantAttaque('pj-p1', cs, fiches)).toEqual([
      { qui: 'pj-p1', nom: 'p1', reactions: ['Bouclier'] },
      { qui: 'pj-p2', nom: 'p2', reactions: ['Riposte'] },
    ]);
    // Le Guerrier visé : son Changement de posture (à tout moment) ; le Bouclier du mage n'est pas pour un allié.
    expect(R.rappelAvantAttaque('pj-p2', cs, fiches)).toEqual([{ qui: 'pj-p2', nom: 'p2', reactions: ['Changement de posture'] }]);
    const etourdi = cs.map((c) => (c.id === 'pj-p2' ? { ...c, etats: [{ id: 'etourdi', rounds: 1, cumul: 1, charges: null, des: null, source: null }] } : c));
    expect(R.rappelAvantAttaque('pj-p1', etourdi, fiches)).toEqual([{ qui: 'pj-p1', nom: 'p1', reactions: ['Bouclier'] }]);
  });
});
