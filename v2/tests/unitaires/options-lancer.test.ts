import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Les choix du lancer et les passifs déclenchés (lot L6.5a, décisions de
 * Thomas du 26/10/2026) : 2b (le panneau « Options » : seuls les choix dont
 * le sort a besoin), 3a (la posture durable du Guerrier), 4a (le second
 * élément d'une combinaison, une fois par combat), 5a (montant de
 * Transfusion, caractéristique d'un élixir), 12a (Soif de sang, Sang
 * impie : d'office quand un ennemi tombe).
 */

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  const ref = (chemin: string) => ({ chemin, id: chemin.split('/').pop() });
  return {
    increment: (n: number) => ({ increment: n }),
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? ref(p.join('/')) : ref(`${(parent as { chemin: string }).chemin}/auto${++n}`)),
    deleteField: () => '<supprimé>',
    updateDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees });
    },
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
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
const OL = await import('../../src/lib/combat/options-lancer');
const PO = await import('../../src/lib/combat/posture');
const PA = await import('../../src/lib/combat/passifs');
const AP = await import('../../src/lib/actions/passifs');
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
const v2 = (nom: string, classe: string, choix: Partial<RefonteFiche> = {}, id = 'p1'): FicheV2 & { id: string } => {
  const f = { ...v1(nom, id), classe };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, f.niveau), ...choix }), id };
};
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
const mage = (id = 'p1') =>
  v2('Shyrion', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] }, id);
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
  session.uid = 'alice';
  session.nom = 'Alice';
  session.etape = 'joueur';
  journal.noterJet.mockClear();
});

const etat = (id: string) => ({ id, rounds: null, cumul: 1, charges: null, des: null, source: 'Shyrion' });
/** Un personnage de la refonte au niveau voulu (9 par défaut). */
const pjN = (nom: string, classe: string, choix: Record<string, unknown>, niveau = 9): FicheV2 & { id: string } => {
  const brut = { ...v1(nom), classe, niveau };
  return { ...F.convertirFiche(brut as never, { ...F.refonteVierge(classeParId.get(classe)!, niveau), ...choix } as never), id: 'p1', ppActuel: 30 } as FicheV2 & { id: string };
};
const guerrier = (rang = 2) => pjN('Karlach', 'guerrier', { rangs: { 'guerrier.soldat': rang } });
const necro = () => pjN('Shyrion', 'necromancien', { ecole: 'outre-tombe', elementDepart: 'sang', rangs: { 'necromancien.seuil': 3, 'necromancien.sang': 4 } });
const barde = () => pjN('Shyrion', 'barde', { rangs: { 'barde.alcoolisme': 1 } });
const pretre = () => pjN('Hermione', 'pretre', { rangs: { 'pretre.guerison': 1 } });
/** Un Magicien à deux éléments : le premier Maître, l'électricité Initié. */
const deuxElements = (depart = 'feu') =>
  mageN('evocation', 2, { rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 5 }, elementDepart: depart, secondElement: 'electricite', elementMaitre: depart } as never);
const sortDe = (f: FicheV2, id: string) => S.sortsDeCombat(f).find((x) => x.id === id)!;
const sansCarte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }] };

describe('ce que le sort demande (2b, 3a, 4a, 5a)', () => {
  it('rien pour un sort sans choix', () => {
    const f = mage();
    const b = OL.besoinsDuLancer(f, sortDe(f, 'evocation.choc'), 'I', null, null);
    expect(b).toEqual({ variantes: [], nombreDeDes: null, boosts: [], secondsElements: [], eau: false, posture: null, montant: null, carac: false, allie: null, rebond: false });
    expect(OL.manqueAuLancer(b, {})).toBeNull();
    expect(OL.besoinsDuLancer(f, { id: 'inconnu', elements: [] }, 'I', null, null)).toEqual(b);
  });

  it('3a : la posture du Guerrier : trois axes, jusqu’à son rang, doublé sous Maîtrise tactique', () => {
    const f = guerrier(2);
    const b = OL.besoinsDuLancer(f, sortDe(f, 'guerrier.posture-de-combat'), 'I', null, null);
    expect(b.posture).toEqual({ axes: ['attaque', 'DEF', 'degats'], plafond: 2 });
    expect(OL.plafondPosture(b, pj('p1'))).toBe(2);
    expect(OL.plafondPosture(b, pj('p1', { etats: [etat('maitrise_tactique')] }))).toBe(4);
    expect(OL.manqueAuLancer(b, {})).toBe('choisis la posture');
    expect(OL.manqueAuLancer(b, { posture: { plus: 'attaque', moins: 'DEF', valeur: 2 } })).toBeNull();
  });

  it('5a : Transfusion : combien de PV (2 × niveau) ; sa variante au palier II prend à un ennemi pour un allié', () => {
    const f = necro();
    const s = sortDe(f, 'seuil.transfusion');
    const b = OL.besoinsDuLancer(f, s, 'I', null, null);
    expect(b.montant).toEqual({ max: 18 });
    expect(b.variantes).toEqual([]);
    expect(OL.manqueAuLancer(b, {})).toBe('combien de PV ?');
    const b2 = OL.besoinsDuLancer(f, s, 'II', null, null);
    expect(b2.variantes).toEqual([{ id: 'sur-un-ennemi', nom: 'Prendre les PV à un ennemi' }]);
    // Une variante du palier I reste offerte aux paliers au-dessus.
    expect(OL.besoinsDuLancer(f, { id: 'seuil.suture', elements: [] }, 'II', null, null).variantes.map((v) => v.id)).toEqual(['sans-corps', 'ame']);
    expect(b2.allie).toBeNull();
    const v = OL.besoinsDuLancer(f, s, 'II', null, null, 'sur-un-ennemi');
    expect(v.allie).toEqual({ exige: true });
    expect(OL.manqueAuLancer(v, { montant: 4 })).toBe('choisis l’allié');
    expect(OL.manqueAuLancer(v, { montant: 4, allie: 'pj-p2' })).toBeNull();
    // Une variante d'un autre palier n'est pas prise.
    expect(OL.besoinsDuLancer(f, s, 'I', null, null, 'sur-un-ennemi').allie).toBeNull();
    expect(S.ciblageDe('seuil.transfusion', 'II', 1, undefined, 'sur-un-ennemi')!.camp).toBe('ennemi');
    expect(S.ciblageDe('seuil.transfusion', 'II')!.camp).toBe('allie');
  });

  it('5a : un élixir demande la caractéristique ; Prophétie, le nombre de dés que ses PP paient', () => {
    const f = barde();
    const b = OL.besoinsDuLancer(f, sortDe(f, 'barde.elixir-1'), 'I', null, null);
    expect(b.carac).toBe(true);
    expect(OL.manqueAuLancer(b, {})).toBe('choisis la caractéristique');
    expect(OL.manqueAuLancer(b, { caracChoisie: 'FOR' })).toBeNull();
    expect(OL.CARACS).toEqual(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']);
    const m = { ...mage(), ppActuel: 10 };
    const p = OL.besoinsDuLancer(m, { id: 'envouteur.prophetie', elements: [] }, 'I', null, null);
    expect(p.nombreDeDes).toEqual({ max: 3, ppParDe: 3 });
    expect(OL.manqueAuLancer(p, {})).toBe('combien de dés ?');
    expect(OL.besoinsDuLancer({ ...m, ppActuel: 90 }, { id: 'envouteur.prophetie', elements: [] }, 'I', null, null).nombreDeDes!.max).toBe(10);
  });

  it('les boosts de son cercle, s’il a la ressource qui les paie', () => {
    const f = pretre();
    const b = OL.besoinsDuLancer(f, sortDe(f, 'guerison.imposition'), 'I', null, null);
    expect(b.boosts).toEqual([
      { id: 'secondAllie', nom: 'Un second allié' },
      { id: 'retraitEtat', nom: 'Retire un état' },
    ]);
    // Sans la jauge qui les paie (un Magicien qui l'aurait par grimoire) : pas de boost.
    expect(OL.besoinsDuLancer(mage(), { id: 'guerison.imposition', elements: [] }, 'I', null, null).boosts).toEqual([]);
    expect(OL.NOMS_BOOSTS.plusUneCase).toBe('+1 case de zone');
    // Le chant se paie en Inspiration, pas en Sacré.
    const chanteur = pjN('Shyrion', 'barde', { rangs: { 'barde.chant': 1 } });
    expect(OL.besoinsDuLancer(chanteur, sortDe(chanteur, 'chant.note-discordante'), 'I', null, null).boosts.map((x) => x.id)).toEqual(['plusUneCible', 'plusUnRound']);
    // +1 cible, un second allié : la visée en prend une de plus.
    expect(S.ciblageDe('guerison.imposition', 'I', 1, 'secondAllie')!.nbCibles).toBe(S.ciblageDe('guerison.imposition', 'I')!.nbCibles + 1);
    expect(S.ciblageDe('guerison.imposition', 'I', 1, 'plusUneCible')!.nbCibles).toBe(S.ciblageDe('guerison.imposition', 'I')!.nbCibles + 1);
    expect(S.ciblageDe('guerison.imposition', 'I', 1, 'retraitEtat')!.nbCibles).toBe(S.ciblageDe('guerison.imposition', 'I')!.nbCibles);
  });

  it('4a : le second élément, parmi les siens (pas pour un sort mineur) ; le rebond de l’électricité ; l’eau', () => {
    const f = deuxElements();
    const missile = sortDe(f, 'evocation.missile');
    expect(OL.besoinsDuLancer(f, missile, 'I', null, null).secondsElements).toEqual([]);
    const b = OL.besoinsDuLancer(f, missile, 'I', 'feu', null);
    expect(b.secondsElements).toEqual([{ id: 'electricite', nom: 'Électricité', maitrise: 'initie' }]);
    expect(b.rebond).toBe(false);
    expect(OL.besoinsDuLancer(f, missile, 'I', 'feu', 'electricite').rebond).toBe(true);
    expect(OL.besoinsDuLancer(f, missile, 'I', 'electricite', null).rebond).toBe(true);
    // Sans premier élément, le second ne compte pas ; un premier Initié ne combine pas.
    expect(OL.besoinsDuLancer(f, missile, 'I', null, 'electricite').rebond).toBe(false);
    expect(OL.besoinsDuLancer(f, missile, 'I', 'electricite', null).secondsElements).toEqual([]);
    expect(OL.besoinsDuLancer(f, sortDe(f, 'mineur.trait-arcanique'), 'I', 'feu', null).secondsElements).toEqual([]);
    const eau = deuxElements('eau');
    const be = OL.besoinsDuLancer(eau, sortDe(eau, 'evocation.missile'), 'I', 'eau', null);
    expect(be.eau).toBe(true);
    expect(be.allie).toEqual({ exige: false });
    expect(OL.manqueAuLancer(be, { choixEau: 'retraitEtat' })).toBe('choisis l’allié dont l’eau retire un état');
    expect(OL.combinaisonUnParCombat('initie')).toBe(true);
    expect(OL.combinaisonUnParCombat('maitre')).toBe(false);
    expect(OL.combinaisonUnParCombat(null)).toBe(false);
    expect(OL.nomDeLaPaire('feu', 'electricite')).toBe(OL.nomDeLaPaire('electricite', 'feu'));
    expect(OL.nomDeLaPaire('feu', null)).toBeNull();
    expect(OL.nomDeLaPaire('electricite', 'terre') ?? OL.nomDeLaPaire('feu', 'terre')).toBeTruthy();
    expect(OL.rebondDe(['feu', 'electricite'])).toBe(2);
    expect(OL.rebondDe(['feu', null])).toBeNull();
  });
});

describe('le lancer prend les options (2b)', () => {
  const choix = (sort: string, o: object = {}, cibles: string[] = ['m-r1-a']) => ({ sort, palier: 'I' as const, surcharge: false, element: null, visee: { cibles, point: null }, ...o });
  const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 3, 0), j('m-r1-b', 4, 0), j('m-r1-c', 9, 9), j('pj-p2', 3, 1, 'pj')] };
  it('l’allié, le rebond (2 cases au plus de la cible), les voisins d’une combinaison ; les refus', () => {
    const f = deuxElements();
    const cs = [pj('p1'), monstre('a'), monstre('b'), monstre('c'), pj('p2')];
    const fiches = new Map([
      ['p1', f],
      ['p2', mage('p2')],
    ]);
    const prep = (o: object, element: string | null = 'electricite') =>
      S.preparerLancer(f, pj('p1'), combat, { ...choix('evocation.missile'), element: element as never, options: o }, carte, cs, fiches, () => 0.5);
    const l = prep({ rebond: 'm-r1-b', allie: 'pj-p2' }) as unknown as { rebond: { id: string }; allie: { id: string } };
    expect(l.rebond.id).toBe('m-r1-b');
    expect(l.allie.id).toBe('pj-p2');
    expect(prep({ rebond: 'm-r1-c' })).toBe('Le rebond saute 2 cases au plus.');
    expect(prep({ rebond: 'm-r1-b' }, 'feu')).toBe('Seul un élément qui rebondit (électricité) a un rebond.');
    expect(prep({ allie: 'm-r1-b' })).toBe('b : un allié seulement.');
    expect(prep({ allie: 'pj-p9' })).toBe('Cette créature n’est pas dans le combat.');
    expect(prep({ rebond: 'm-r1-z' })).toBe('Cette créature n’est pas dans le combat.');
    const atterre = [pj('p1'), monstre('a'), monstre('b'), monstre('c'), pj('p2', { mort: true, mortEchecs: 3 })];
    expect(S.preparerLancer(f, pj('p1'), combat, { ...choix('evocation.missile'), element: 'electricite', options: { allie: 'pj-p2' } }, carte, atterre, fiches, () => 0.5)).toBe(
      'Cette créature n’est pas dans le combat.',
    );
    expect(prep({ secondElement: 'eau' }, 'feu')).toBe('Une combinaison prend un premier élément, puis un second que tu maîtrises.');
    expect(prep({ secondElement: 'electricite' }, null)).toBe('Une combinaison prend un premier élément, puis un second que tu maîtrises.');
    const combo = prep({ secondElement: 'electricite' }, 'feu') as unknown as { secondElement: unknown; voisins: { id: string }[] };
    expect(combo.secondElement).toEqual({ id: 'electricite', maitrise: 'initie' });
    expect(combo.voisins.map((v) => v.id)).toEqual(['m-r1-b', 'pj-p2']);
    // Au contact de la cible : ni le lanceur, ni plus loin, ni à terre.
    const pres = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0), j('m-r1-b', 2, 0), j('m-r1-c', 3, 0), j('m-r1-d', 2, 1)] };
    const csPres = [pj('p1'), monstre('a'), monstre('b'), monstre('c'), monstre('d', { aTerre: true })];
    const v = S.preparerLancer(f, pj('p1'), combat, { ...choix('evocation.missile'), element: 'feu', options: { secondElement: 'electricite' } }, pres, csPres, fiches, () => 0.5) as unknown as {
      voisins: { id: string }[];
    };
    expect(v.voisins.map((x) => x.id)).toEqual(['m-r1-b']);
    expect((prep({}, 'feu') as unknown as { voisins?: unknown }).voisins).toBeUndefined();
    // Les autres options passent telles quelles au moteur.
    const tout = prep({ nombreDeDes: 2, boost: 'plusUnRound', choixEau: 'retraitEtat', posture: { plus: 'attaque', moins: 'DEF', valeur: 1 }, montant: 3, caracChoisie: 'FOR' }) as unknown as Record<
      string,
      unknown
    >;
    expect(tout).toMatchObject({ nombreDeDes: 2, boost: 'plusUnRound', choixEau: 'retraitEtat', posture: { plus: 'attaque', moins: 'DEF', valeur: 1 }, montant: 3, caracChoisie: 'FOR' });
  });
});

describe('la variante change le ciblage et passe au moteur (10)', () => {
  it('Transfusion prise à un ennemi : la visée vise l’ennemi', () => {
    const f = pjN('Shyrion', 'necromancien', { ecole: 'outre-tombe', elementDepart: 'sang', rangs: { 'necromancien.seuil': 5, 'necromancien.sang': 4 } });
    const cs = [pj('p1'), monstre('a'), pj('p2')];
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0), j('pj-p2', 0, 1, 'pj')] };
    const choix = { sort: 'seuil.transfusion', palier: 'II' as const, surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } };
    expect(S.preparerLancer(f, pj('p1'), combat, choix, carte, cs, new Map([['p1', f]]), () => 0.5)).toBe('a : un allié seulement.');
    const l = S.preparerLancer(
      f,
      pj('p1'),
      combat,
      { ...choix, options: { variante: 'sur-un-ennemi', montant: 3, allie: 'pj-p2' } },
      carte,
      cs,
      new Map([
        ['p1', f],
        ['p2', { ...f, id: 'p2' }],
      ]),
      () => 0.5,
    ) as unknown as { variante: string };
    expect(l.variante).toBe('sur-un-ennemi');
  });
});

describe('la posture durable (3a)', () => {
  it('une nouvelle posture remplace l’ancienne ; les autres bonus restent ; elle se lit et se dit', () => {
    const autre = { sur: 'DEF', valeur: 2, rounds: 2, consomme: false, typeDegats: null, source: 'Hermione' };
    const b1 = PO.poserPosture([autre], { plus: 'attaque', moins: 'DEF', valeur: 2 });
    expect(b1).toEqual([
      autre,
      { sur: 'attaque', valeur: 2, rounds: null, consomme: false, typeDegats: null, source: 'Posture', posture: true },
      { sur: 'DEF', valeur: -2, rounds: null, consomme: false, typeDegats: null, source: 'Posture', posture: true },
    ]);
    const b2 = PO.poserPosture(b1, { plus: 'degats', moins: 'attaque', valeur: 1 });
    expect(b2).toHaveLength(3);
    expect(PO.postureDe(b2)).toEqual({ plus: 'degats', moins: 'attaque', valeur: 1 });
    expect(PO.postureDe([autre])).toBeNull();
    expect(PO.textePosture({ plus: 'degats', moins: 'DEF', valeur: 3 })).toBe('Posture : +3 dégâts, −3 DEF');
    expect(
      PO.poserPosture(
        Array.from({ length: 20 }, () => autre),
        { plus: 'attaque', moins: 'DEF', valeur: 1 },
      ),
    ).toHaveLength(20);
  });

  it('le Guerrier prend sa posture : deux bonus durables, au journal ; une autre la remplace', async () => {
    const f = guerrier(2);
    const moi = pj('p1');
    enBase(moi);
    const choix = {
      sort: 'guerrier.posture-de-combat',
      palier: 'I' as const,
      surcharge: false,
      element: null,
      visee: { cibles: [], point: null },
      options: { posture: { plus: 'attaque' as const, moins: 'DEF' as const, valeur: 2 } },
    };
    await L.lancerSortEnCombat('c1', combat, moi, f, choix, sansCarte, [moi], new Map([['p1', f]]), () => 0.5);
    const maj = appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees as { bonus: unknown[] };
    expect(maj.bonus).toEqual(PO.poserPosture([], { plus: 'attaque', moins: 'DEF', valeur: 2 }));
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/Posture : \+2 attaque, −2 DEF/);
    appels.length = 0;
    const avec = pj('p1', { bonus: maj.bonus as never, usages: {} });
    enBase(avec);
    await L.lancerSortEnCombat(
      'c1',
      { ...combat, round: 3 },
      avec,
      f,
      { ...choix, options: { posture: { plus: 'degats', moins: 'attaque', valeur: 1 } } },
      sansCarte,
      [avec],
      new Map([['p1', f]]),
      () => 0.5,
    );
    const maj2 = appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees as { bonus: unknown[] };
    expect(PO.postureDe(maj2.bonus as never)).toEqual({ plus: 'degats', moins: 'attaque', valeur: 1 });
    expect(maj2.bonus).toHaveLength(2);
    // Au-delà de son rang : le moteur refuse.
    await expect(
      L.lancerSortEnCombat(
        'c1',
        { ...combat, round: 4 },
        avec,
        f,
        { ...choix, options: { posture: { plus: 'degats', moins: 'attaque', valeur: 3 } } },
        sansCarte,
        [avec],
        new Map([['p1', f]]),
        () => 0.5,
      ),
    ).rejects.toThrow('posture de 1 à 2');
  });
});

describe('les autres choix au lancer (4a, 5a)', () => {
  it('4a : une combinaison Initiée sert une fois par combat ; son coût compte le second élément', async () => {
    const f = deuxElements();
    const moi = pj('p1');
    const g = monstre('a');
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 3, 0)] };
    const choix = {
      sort: 'evocation.missile',
      palier: 'I' as const,
      surcharge: false,
      element: 'feu' as const,
      visee: { cibles: ['m-r1-a'], point: null },
      options: { secondElement: 'electricite' as const },
    };
    await L.lancerSortEnCombat('c1', combat, moi, f, choix, carte, [moi, g], new Map([['p1', f]]), () => 0.5);
    expect(appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees).toMatchObject({ usages: { combinaison: 2 } });
    await expect(L.lancerSortEnCombat('c1', combat, pj('p1', { usages: { combinaison: 2 } }), f, choix, carte, [moi, g], new Map([['p1', f]]), () => 0.5)).rejects.toThrow(
      'La combinaison du combat est déjà faite.',
    );
    // Un second élément Maître ne compte pas la combinaison du combat.
    const maitres = { ...f, octrois: { ...f.octrois, elements: { electricite: 'maitre' as const } } };
    appels.length = 0;
    await L.lancerSortEnCombat('c1', combat, pj('p1', { usages: { combinaison: 1 } }), maitres, choix, carte, [moi, g], new Map([['p1', maitres]]), () => 0.5);
    expect(appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees).not.toHaveProperty('usages');
    const sans = S.coutAffiche(sortDe(f, 'evocation.missile'), 'I', false, 'maitre');
    const avec = S.coutAffiche(sortDe(f, 'evocation.missile'), 'I', false, 'maitre', 'initie');
    expect((avec as { pp: number }).pp).toBeGreaterThan((sans as { pp: number }).pp);
  });

  it('5a : Transfusion de 5 PV à un allié ; un élixir de FOR', async () => {
    const f = necro();
    const moi = pj('p1');
    const allie = pj('p2');
    const h = v2('Hermione', 'pretre', {}, 'p2');
    enBase(moi);
    enBase(allie);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('pj-p2', 1, 0, 'pj')] };
    await L.lancerSortEnCombat(
      'c1',
      combat,
      moi,
      f,
      { sort: 'seuil.transfusion', palier: 'I', surcharge: false, element: null, visee: { cibles: ['pj-p2'], point: null }, options: { montant: 5 } },
      carte,
      [moi, allie],
      new Map<string, Fiche & { id: string }>([
        ['p1', f],
        ['p2', h],
      ]),
      () => 0.5,
    );
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/5 PV/);
    const b = barde();
    appels.length = 0;
    await L.lancerSortEnCombat(
      'c1',
      combat,
      moi,
      b,
      { sort: 'barde.elixir-1', palier: 'I', surcharge: false, element: null, visee: { cibles: ['pj-p2'], point: null }, options: { caracChoisie: 'FOR' } },
      carte,
      [moi, allie],
      new Map<string, Fiche & { id: string }>([
        ['p1', b],
        ['p2', h],
      ]),
      () => 0.95,
    );
    expect(appels.find((a) => a.chemin === `${C}/pj-p2`)!.donnees).toMatchObject({ bonus: [expect.objectContaining({ sur: 'FOR', valeur: 1 })] });
  });
});

describe('les passifs déclenchés (12a)', () => {
  it('Sang impie : seulement quand un sort de sang abat l’ennemi ; un sort de sang', () => {
    const f = necro();
    expect(PA.passifsDeclenches(f, { quoi: 'ennemiAbattu', parSortDeSang: true }).map((a) => a.id)).toEqual(['necromancien.sang-impie']);
    expect(PA.passifsDeclenches(f, { quoi: 'ennemiAbattu', parSortDeSang: false })).toEqual([]);
    expect(PA.passifsDeclenches(mage(), { quoi: 'ennemiAbattu', parSortDeSang: true })).toEqual([]);
    expect(PA.passifsDeclenches(v1('Shyrion'), { quoi: 'ennemiAbattu', parSortDeSang: true })).toEqual([]);
    expect(PA.estDeSang({ ecole: 'sang' }, null)).toBe(true);
    expect(PA.estDeSang({ ecole: 'evocation' }, 'sang')).toBe(true);
    expect(PA.estDeSang({ ecole: 'evocation' }, 'feu')).toBe(false);
  });

  it('jouer : le soin sur la fiche, au journal ; ses PV d’après le coup ; rien pour une fiche v1', async () => {
    const f = { ...necro(), pvActuel: 10 };
    const moi = pj('p1');
    expect(await AP.jouerPassifs('c1', moi, f, { quoi: 'ennemiAbattu', parSortDeSang: true }, 2, suite([3, 6], [4, 6]))).toBe(1);
    expect(appels).toEqual([{ fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { pvActuel: 9 } }]);
    expect(journal.noterJet.mock.calls[0]!.slice(0, 1)).toEqual(['Sang impie']);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('+7 PV');
    appels.length = 0;
    expect(await AP.jouerPassifs('c1', moi, f, { quoi: 'ennemiAbattu', parSortDeSang: false })).toBe(0);
    expect(await AP.jouerPassifs('c1', moi, v1('Shyrion'), { quoi: 'ennemiAbattu', parSortDeSang: true })).toBe(0);
    expect(appels).toEqual([]);
  });

  it('Soif de sang : dès 5 de Corruption d’Âme, que le moteur vérifie', async () => {
    const base0 = pjN('Karlach', 'guerrier', {});
    // La Voie du chaos ouverte par le MJ (octrois), au rang 4.
    const g = (c: number) =>
      ({
        ...base0,
        octrois: { ...base0.octrois, chaos: true },
        refonte: { ...base0.refonte, rangs: { ...base0.refonte.rangs, 'guerrier.chaos': 4 }, jauges: { ...base0.refonte.jauges, corruptionAme: c } },
      }) as typeof base0;
    expect(PA.passifsDeclenches(g(6), { quoi: 'ennemiAbattu', parSortDeSang: false }).map((a) => a.id)).toEqual(['chaos.guerrier.soif-de-sang']);
    expect(await AP.jouerPassifs('c1', pj('p1'), g(6), { quoi: 'ennemiAbattu', parSortDeSang: false }, null, suite([4, 6]))).toBe(1);
    expect(await AP.jouerPassifs('c1', pj('p1'), g(3), { quoi: 'ennemiAbattu', parSortDeSang: false })).toBe(0);
  });

  it('Sang impie part des PV d’après le sort (son drain compris) ; un sort qui n’est pas de sang ne le joue pas', async () => {
    const f = { ...necro(), pvActuel: 2 };
    const moi = pj('p1');
    const g = monstre('a', { pv: 1 });
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0)] };
    await L.lancerSortEnCombat(
      'c1',
      combat,
      moi,
      f,
      { sort: 'sang.morsure-du-sang', palier: 'I', surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } },
      carte,
      [moi, g],
      new Map([['p1', f]]),
      () => (appels.some((x) => x.chemin === 'tables/t1/persos/p1') ? 0 : 0.9),
    );
    const ecrits = appels.filter((a) => a.chemin === 'tables/t1/persos/p1').map((a) => (a.donnees as { pvActuel?: number }).pvActuel);
    expect(ecrits).toHaveLength(2);
    // Le soin, aux dés les plus bas (2d6 : 2), s'ajoute aux PV d'après le drain.
    expect(ecrits[1]).toBe(ecrits[0]! + 2);
    expect(ecrits[0]).toBeGreaterThan(2);
    // Pourriture (outre-tombe) n'est pas un sort de sang.
    const ot = pjN('Shyrion', 'necromancien', { ecole: 'outre-tombe', elementDepart: 'sang', rangs: { 'necromancien.ecole': 3, 'necromancien.sang': 4 } });
    journal.noterJet.mockClear();
    enBase(g);
    await L.lancerSortEnCombat(
      'c1',
      combat,
      moi,
      ot,
      { sort: 'outre-tombe.pourriture', palier: 'I', surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } },
      carte,
      [moi, g],
      new Map([['p1', ot]]),
      () => 0.1,
    );
    expect(journal.noterJet.mock.calls.map((c) => c[0])).not.toContain('Sang impie');
  });

  it('un sort de sang qui abat un monstre joue Sang impie ; un monstre qui tient, non', async () => {
    const f = necro();
    const moi = pj('p1');
    const g = monstre('a', { pv: 1 });
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 1, 0)] };
    const choix = { sort: 'sang.morsure-du-sang', palier: 'I' as const, surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } };
    await L.lancerSortEnCombat('c1', combat, moi, f, choix, carte, [moi, g], new Map([['p1', f]]), () => 0.9);
    expect(journal.noterJet.mock.calls.map((c) => c[0])).toContain('Sang impie');
    journal.noterJet.mockClear();
    const solide = monstre('a', { pv: 99, pvMax: 99 });
    enBase(solide);
    await L.lancerSortEnCombat('c1', combat, moi, f, choix, carte, [moi, solide], new Map([['p1', f]]), () => 0.9);
    expect(journal.noterJet.mock.calls.map((c) => c[0])).not.toContain('Sang impie');
  });
});
