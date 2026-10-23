import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Sorts et capacités en combat (lot L6.4a, décisions de Thomas du
 * 23/10/2026) : 2a (le client du lanceur résout), 3a (verbes, mineurs,
 * capacités actives), 4a (palier, surcharge, élément, coût de combat), 5a
 * (type d'action), 6a (visée sur la carte, portée et vue), 7a (cône de
 * 90°), 8a et 9a (sauvegardes des monstres, FOR = CON), 10a (changements
 * appliqués), 11a (PV temporaires), 12a (bonus temporaires), 13a (journal).
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
const B = await import('../../src/lib/combat/bonus');
const Z = await import('../../src/lib/combat/zone');
const S = await import('../../src/lib/combat/sorts');
const CH = await import('../../src/lib/combat/changements');
const P = await import('../../src/lib/combat/poussee');
const D = await import('../../src/lib/combat/demarrage');
const L = await import('../../src/lib/actions/sorts-combat');
const X = await import('../../src/lib/actions/attaques');
const A = await import('../../src/lib/actions/combat');
const F = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { degatsSurPj, attaquesDuPj } = await import('../../src/lib/combat/attaques-pj');
const { classeParId } = await import('../../src/regles');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type BonusCombat = import('../../src/lib/schemas/combat').BonusCombat;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;
type Changement = import('../../src/lib/effets/resolution').Changement;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const v2 = (nom: string, classe: string, choix: Partial<RefonteFiche> = {}, id = 'p1'): FicheV2 & { id: string } => {
  const f = { ...v1(nom, id), classe };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, f.niveau), ...choix }), id };
};
/** Un Magicien de niveau 9, l'école au rang voulu. */
const mageN = (ecole: string, rang: number, choix: Partial<RefonteFiche> = {}): FicheV2 & { id: string } => {
  const brut = { ...v1('Shyrion'), classe: 'magicien', niveau: 9 };
  return { ...F.convertirFiche(brut as never, { ...F.refonteVierge(classeParId.get('magicien')!, 9), ecole, elementDepart: 'feu', rangs: { 'magicien.ecole': rang, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'], ...choix } as never), id: 'p1', ppActuel: 30 } as FicheV2 & { id: string };
};
const mage = (id = 'p1') => v2('Shyrion', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] }, id);
const neutre = { physique: 1, magique: 1 };
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15, de: 12, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  sauvegardes: { FOR: 1, DEX: 2, CON: 1, Volonte: 0 }, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
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
const bonus = (b: Partial<BonusCombat>): BonusCombat => ({ sur: 'DEF', valeur: 2, rounds: 2, consomme: false, typeDegats: null, source: 'X', ...b });
const enBase = (c: Combattant & { id: string }) => base.set(`${C}/${c.id}`, (({ id: _i, ...x }) => x)(c));
const C = 'tables/t1/combats/c1/combattants';
const combat = { tour: 6, round: 2, scene: 'cave', actif: 'pj-p1', porteesLibres: false };
const scene = (murs: [[number, number], [number, number]][] = [], obstacles: [[number, number], [number, number]][] = []) => ({ colonnes: 10, lignes: 10, murs, obstacles, portes: [] }) as never;
const cases = (r: readonly { cx: number; cy: number }[]) => r.map((c) => `${c.cx},${c.cy}`).sort();

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  session.etape = 'joueur';
  journal.noterJet.mockClear();
});

describe('sauvegardes des monstres (8a, 9a)', () => {
  it('v1 : Réflexes = init plafonnée à 3 + dangerosité ; Vigueur = dangerosité + taille, pour CON et FOR ; Volonté = dangerosité + palier', () => {
    expect(D.sauvegardesDuMonstre({ init: 6, dangerosite: 1, taille: 'grande', tier: 'elite', boss: false })).toEqual({ FOR: 2, DEX: 4, CON: 2, Volonte: 2 });
    expect(D.sauvegardesDuMonstre({ init: 2, dangerosite: 3, taille: 'petite', boss: false })).toEqual({ FOR: 2, DEX: 2, CON: 2, Volonte: 3 });
    expect(D.sauvegardesDuMonstre({ init: 2, dangerosite: 3, taille: 'très grande', boss: true })).toEqual({ FOR: 5, DEX: 2, CON: 5, Volonte: 4 });
    expect(D.sauvegardesDuMonstre({ init: 9, dangerosite: 4, taille: 'moyenne', tier: 'd5', boss: true })).toEqual({ FOR: 4, DEX: 7, CON: 4, Volonte: 6 });
    expect(D.sauvegardesDuMonstre({ init: 0, dangerosite: 2, taille: 'inconnue', tier: 'inconnu', boss: false })).toEqual({ FOR: 2, DEX: 0, CON: 2, Volonte: 2 });
  });

  it('un PJ n’a ni sauvegardes, ni boss, ni démon sur le combattant (sa fiche les porte)', async () => {
    const { schemaCombattant } = await import('../../src/lib/schemas/combat');
    const { id: _i, ...p } = pj('p1');
    expect(schemaCombattant.safeParse(p).success).toBe(true);
    for (const x of [{ sauvegardes: { FOR: 0, DEX: 0, CON: 0, Volonte: 0 } }, { boss: true }, { demonOuMortVivant: true }]) expect(schemaCombattant.safeParse({ ...p, ...x }).success).toBe(false);
    const { id: _j, ...m } = monstre('a', { boss: true, demonOuMortVivant: true });
    expect(schemaCombattant.safeParse(m).success).toBe(true);
  });

  it('ce que le combat lit du bestiaire : armure, sauvegardes, boss, démon ou mort-vivant', () => {
    const m = { init: 3, pv: 14, def: 13, armureId: 'cuir', resistances: { magique: 0.5 }, dangerosite: 2, taille: 'grande', boss: true, race: ['mort-vivant'] };
    expect(D.monstrePourCombat(m, new Map([['cuir', 2]]))).toEqual({ init: 3, pv: 14, def: 13, armure: 2, resistances: { magique: 0.5 }, sauvegardes: { FOR: 3, DEX: 3, CON: 3, Volonte: 3 }, boss: true, demonOuMortVivant: true });
    expect(D.monstrePourCombat({ ...m, race: ['démon'], armureId: 'inconnue' }, new Map())).toMatchObject({ armure: 0, demonOuMortVivant: true });
    expect(D.monstrePourCombat({ ...m, race: ['humanoïdes'], armureId: undefined, boss: false }, new Map())).toMatchObject({ armure: 0, boss: false, demonOuMortVivant: false });
  });

  it('le combattant les porte ; le MJ les corrige, un PJ non', async () => {
    const b = { id: 'm-r1-a', genre: 'monstre' as const, nom: 'Goule', perso: null, uid: null, monstre: 'goule', modInit: 3, pvMax: 14, def: 12, armure: 0, resistances: neutre, mvtBase: 5, sauvegardes: { FOR: 1, DEX: 3, CON: 1, Volonte: 2 }, boss: true, demonOuMortVivant: true };
    await A.ajouterCombattant('c1', b, () => 0);
    expect(appels[0]!.donnees).toMatchObject({ sauvegardes: { FOR: 1, DEX: 3, CON: 1, Volonte: 2 }, boss: true, demonOuMortVivant: true, pvTemp: 0, bonus: [] });
    await A.ajouterCombattant('c1', { ...b, id: 'pj-x', genre: 'pj', perso: 'x', uid: 'u', monstre: null, pvMax: null, def: null, sauvegardes: null, boss: false, demonOuMortVivant: false });
    expect(appels[1]!.donnees).toMatchObject({ sauvegardes: null, boss: false, demonOuMortVivant: false });
    await A.corrigerSauvegardes('c1', monstre('a'), { FOR: 4, DEX: 0, CON: 4, Volonte: -1 });
    expect(appels[2]).toEqual({ fn: 'updateDoc', chemin: `${C}/m-r1-a`, donnees: { sauvegardes: { FOR: 4, DEX: 0, CON: 4, Volonte: -1 } } });
    await expect(A.corrigerSauvegardes('c1', pj('p1'), { FOR: 1, DEX: 1, CON: 1, Volonte: 1 })).rejects.toThrow('sur sa fiche');
    await expect(A.corrigerSauvegardes('c1', monstre('a'), { FOR: 41, DEX: 1, CON: 1, Volonte: 1 })).rejects.toThrow('−10 à +40');
    expect(appels).toHaveLength(3);
  });
});

describe('bonus et PV temporaires (11a, 12a)', () => {
  it('durées : des rounds, « prochain tour » = 1, le reste jusqu’à la fin du combat', () => {
    expect(B.dureeEnRounds({ rounds: 3 })).toBe(3);
    expect(B.dureeEnRounds({ rounds: 20 })).toBe(20);
    expect(B.dureeEnRounds('prochainTour')).toBe(1);
    expect(B.dureeEnRounds('finCombat')).toBeNull();
    expect(B.dureeEnRounds('scene')).toBeNull();
    expect(B.dureeEnRounds({ des: '1d4', plusModMagie: false })).toBeNull();
  });

  it('fin du tour : un round de moins ; sans durée, il reste ; 20 au plus', () => {
    expect(B.finDeTourBonus([bonus({ rounds: 2 }), bonus({ rounds: 1 }), bonus({ rounds: null })])).toEqual([bonus({ rounds: 1 }), bonus({ rounds: null })]);
    const vingt = Array.from({ length: 20 }, (_, i) => bonus({ valeur: i }));
    expect(B.poserBonus(vingt, bonus({ valeur: 99 }))).toHaveLength(20);
    expect(B.poserBonus(vingt, bonus({ valeur: 99 })).at(-1)!.valeur).toBe(99);
    expect(B.poserBonus(vingt, bonus({ valeur: 99 }))[0]!.valeur).toBe(1);
  });

  it('comptés dans les jets : les chiffres, les dés à part ; « prochaine frappe » tombe ; dissipation : les plus récents', () => {
    const bs = [bonus({ sur: 'DEF', valeur: 2 }), bonus({ sur: 'degats', valeur: '1d6', consomme: true }), bonus({ sur: 'degats', valeur: -1 }), bonus({ sur: 'attaque', valeur: 3 })];
    expect(B.bonusFixe(bs, ['DEF'])).toBe(2);
    expect(B.bonusFixe(bs, ['degats'])).toBe(-1);
    expect(B.bonusFixe(bs, ['attaque', 'DEF'])).toBe(5);
    expect(B.bonusDes(bs, ['degats'])).toEqual(['1d6']);
    expect(B.bonusDes(bs, ['DEF'])).toEqual([]);
    expect(B.consommerBonus(bs, ['degats'])).toEqual([bs[0], bs[2], bs[3]]);
    expect(B.consommerBonus(bs, ['DEF'])).toEqual(bs);
    expect(B.dissiper(bs, 1)).toEqual(bs.slice(0, 3));
    expect(B.dissiper(bs, 9)).toEqual([]);
    expect(B.dissiper(bs, 0)).toEqual(bs);
  });

  it('texte', () => {
    expect(B.texteBonus(bonus({ sur: 'DEF', valeur: 2, rounds: 3 }))).toBe('+2 DEF (3)');
    expect(B.texteBonus(bonus({ sur: 'attaque', valeur: -1, rounds: null }))).toBe('−1 attaque');
    expect(B.texteBonus(bonus({ sur: 'degats', valeur: '1d6', typeDegats: 'feu', consomme: true, rounds: null }))).toBe('+1d6 dégâts (feu), prochaine frappe');
    expect(B.texteBonus(bonus({ sur: 'inconnu', valeur: 0, rounds: 1 }))).toBe('+0 inconnu (1)');
  });

  it('PV temporaires : absorbés d’abord ; la plus forte réserve reste', () => {
    expect(B.absorber(5, 3)).toEqual({ pvTemp: 2, reste: 0 });
    expect(B.absorber(5, 8)).toEqual({ pvTemp: 0, reste: 3 });
    expect(B.absorber(0, 4)).toEqual({ pvTemp: 0, reste: 4 });
    expect(B.absorber(3, -2)).toEqual({ pvTemp: 3, reste: 0 });
    expect(B.gagnerPvTemp(4, 6)).toBe(6);
    expect(B.gagnerPvTemp(8, 6)).toBe(8);
    expect(B.gagnerPvTemp(0, 5000)).toBe(999);
  });
});

describe('zones et portées (6a, 7a)', () => {
  const sc = scene();
  it('carré N centré sur la case visée ; cercle de rayon N (Chebyshev) ; anneaux', () => {
    const carre = Z.casesDeZone(sc, { forme: 'carre', taille: 3, origine: 'point' }, { cx: 0, cy: 0 }, { cx: 5, cy: 5 });
    expect(cases(carre)).toEqual(cases([4, 5, 6].flatMap((y) => [4, 5, 6].map((x) => ({ cx: x, cy: y })))));
    expect(carre.find((c) => c.cx === 5 && c.cy === 5)!.anneau).toBe(0);
    expect(carre.find((c) => c.cx === 6 && c.cy === 4)!.anneau).toBe(1);
    expect(Z.casesDeZone(sc, { forme: 'carre', taille: 2, origine: 'point' }, { cx: 0, cy: 0 }, { cx: 5, cy: 5 }).map((c) => `${c.cx},${c.cy}`)).toEqual(['5,5', '6,5', '5,6', '6,6']);
    expect(Z.casesDeZone(sc, { forme: 'cercle', taille: 2, origine: 'point' }, { cx: 0, cy: 0 }, { cx: 5, cy: 5 })).toHaveLength(25);
    // Au bord : les cases hors de la carte n'y sont pas.
    expect(Z.casesDeZone(sc, { forme: 'cercle', taille: 1, origine: 'point' }, { cx: 5, cy: 5 }, { cx: 0, cy: 0 })).toHaveLength(4);
    expect(Z.casesDeZone(sc, { forme: 'cercle', taille: 1, origine: 'point' }, { cx: 5, cy: 5 }, { cx: 9, cy: 9 })).toHaveLength(4);
  });

  it('une zone du lanceur (aura) se centre sur lui ; une ligne ou un cône part de lui vers la case visée', () => {
    expect(Z.centreDeZone({ forme: 'cercle', taille: 2, origine: 'lanceur' }, { cx: 1, cy: 1 }, { cx: 7, cy: 7 })).toEqual({ cx: 1, cy: 1 });
    expect(Z.centreDeZone({ forme: 'carre', taille: 2, origine: 'lanceur' }, { cx: 1, cy: 1 }, { cx: 7, cy: 7 })).toEqual({ cx: 1, cy: 1 });
    expect(Z.centreDeZone({ forme: 'ligne', taille: 2, origine: 'lanceur' }, { cx: 1, cy: 1 }, { cx: 7, cy: 7 })).toEqual({ cx: 7, cy: 7 });
    expect(Z.centreDeZone({ forme: 'cercle', taille: 2, origine: 'point' }, { cx: 1, cy: 1 }, { cx: 7, cy: 7 })).toEqual({ cx: 7, cy: 7 });
    const ligne = Z.casesDeZone(sc, { forme: 'ligne', taille: 4, origine: 'lanceur' }, { cx: 1, cy: 2 }, { cx: 2, cy: 2 });
    expect(ligne).toEqual([{ cx: 2, cy: 2, anneau: 0 }, { cx: 3, cy: 2, anneau: 1 }, { cx: 4, cy: 2, anneau: 2 }, { cx: 5, cy: 2, anneau: 3 }]);
    // Un mur arrête la ligne.
    expect(Z.casesDeZone(scene([[[4, 0], [4, 10]]]), { forme: 'ligne', taille: 4, origine: 'lanceur' }, { cx: 1, cy: 2 }, { cx: 2, cy: 2 })).toHaveLength(2);
  });

  it('cône (7a) : le quart de 90° ouvert vers la case visée, sur N cases, sans la case du lanceur', () => {
    const droite = Z.casesDeZone(sc, { forme: 'cone', taille: 2, origine: 'lanceur' }, { cx: 5, cy: 5 }, { cx: 9, cy: 5 });
    expect(cases(droite)).toEqual(cases([{ cx: 6, cy: 4 }, { cx: 6, cy: 5 }, { cx: 6, cy: 6 }, { cx: 7, cy: 3 }, { cx: 7, cy: 4 }, { cx: 7, cy: 5 }, { cx: 7, cy: 6 }, { cx: 7, cy: 7 }]));
    expect(droite.find((c) => c.cx === 7 && c.cy === 5)!.anneau).toBe(1);
    expect(droite.find((c) => c.cx === 6 && c.cy === 5)!.anneau).toBe(0);
    const diagonale = Z.casesDeZone(sc, { forme: 'cone', taille: 1, origine: 'lanceur' }, { cx: 5, cy: 5 }, { cx: 8, cy: 8 });
    expect(cases(diagonale)).toEqual(cases([{ cx: 6, cy: 5 }, { cx: 6, cy: 6 }, { cx: 5, cy: 6 }]));
    expect(Z.casesDeZone(sc, { forme: 'cone', taille: 3, origine: 'lanceur' }, { cx: 5, cy: 5 }, { cx: 5, cy: 5 })).toEqual([]);
    // 90°, pas plus : sur 3 cases, 3 + 5 + 7 = 15 (à 120°, la case (7, 2) y entrerait).
    const large = Z.casesDeZone(sc, { forme: 'cone', taille: 3, origine: 'lanceur' }, { cx: 4, cy: 5 }, { cx: 9, cy: 5 });
    expect(large).toHaveLength(15);
    expect(large.some((c) => c.cx === 6 && c.cy === 2)).toBe(false);
    // Au bord de la carte, rien au-dehors.
    expect(Z.casesDeZone(sc, { forme: 'cone', taille: 3, origine: 'lanceur' }, { cx: 0, cy: 5 }, { cx: -4, cy: 5 })).toEqual([]);
    // Un mur coupe le cône.
    expect(Z.casesDeZone(scene([[[7, 0], [7, 10]]]), { forme: 'cone', taille: 2, origine: 'lanceur' }, { cx: 5, cy: 5 }, { cx: 9, cy: 5 })).toHaveLength(3);
  });

  it('les cases derrière un mur, vues du centre, ne sont pas prises', () => {
    const r = Z.casesDeZone(scene([[[6, 0], [6, 10]]]), { forme: 'carre', taille: 3, origine: 'point' }, { cx: 0, cy: 0 }, { cx: 5, cy: 5 });
    expect(r).toHaveLength(6);
    expect(r.some((c) => c.cx === 6)).toBe(false);
  });

  it('les jetons pris : vivants, sans le lanceur, avec leur anneau', () => {
    const z = Z.casesDeZone(sc, { forme: 'cercle', taille: 1, origine: 'point' }, { cx: 0, cy: 0 }, { cx: 5, cy: 5 });
    const jetons = [
      { id: 'moi', genre: 'pj' as const, cx: 5, cy: 4 },
      { id: 'a', genre: 'monstre' as const, cx: 5, cy: 5 },
      { id: 'b', genre: 'monstre' as const, cx: 6, cy: 6 },
      { id: 'mort', genre: 'monstre' as const, cx: 4, cy: 4, mort: true },
      { id: 'loin', genre: 'monstre' as const, cx: 8, cy: 8 },
    ];
    expect(Z.jetonsDansZone(jetons, z, 'moi')).toEqual([{ id: 'a', anneau: 0 }, { id: 'b', anneau: 1 }]);
  });

  it('portée en cases ; refus de portée et de vue', () => {
    expect(Z.porteeEnCases('contact', 6)).toBe(1);
    expect(Z.porteeEnCases('soi', 6)).toBe(0);
    expect(Z.porteeEnCases('arme', 6)).toBe(6);
    expect(Z.porteeEnCases(8, 6)).toBe(8);
    expect(Z.refusDePortee(sc, { cx: 0, cy: 0 }, { cx: 3, cy: 2 }, 3, true)).toBeNull();
    expect(Z.refusDePortee(sc, { cx: 0, cy: 0 }, { cx: 4, cy: 2 }, 3, true)).toBe('hors de portée (4 cases, 3 au plus)');
    expect(Z.refusDePortee(sc, { cx: 0, cy: 0 }, { cx: 2, cy: 2 }, 1, true)).toBe('pas au contact (2 cases)');
    expect(Z.refusDePortee(scene([[[2, 0], [2, 10]]]), { cx: 0, cy: 0 }, { cx: 3, cy: 0 }, 5, true)).toBe('pas de ligne de vue');
    expect(Z.refusDePortee(scene([[[2, 0], [2, 10]]]), { cx: 0, cy: 0 }, { cx: 3, cy: 0 }, 5, false)).toBeNull();
    expect(Z.refusDePortee(scene([[[2, 0], [2, 10]]]), { cx: 0, cy: 0 }, { cx: 0, cy: 0 }, 0, true)).toBeNull();
  });
});

describe('ce que le personnage lance (3a, 4a, 5a)', () => {
  it('verbes, puis sorts mineurs, puis capacités ; ni réactions, ni passifs, ni attaques d’arme', () => {
    const s = S.sortsDeCombat(mage());
    expect(s.map((x) => [x.id, x.groupe, x.paliers.join(), x.maitrise, x.typeAction])).toEqual([
      ['evocation.missile', 'verbe', 'I', 'adepte', 'principale'],
      ['evocation.choc', 'verbe', 'I', 'adepte', 'principale'],
      ['mineur.trait-arcanique', 'mineur', 'I', 'adepte', 'principale'],
      ['mineur.lumiere', 'mineur', 'I', 'adepte', 'principale'],
    ]);
    expect(s[0]!.elements.map((e) => e.id)).toEqual(['feu']);
    expect(s[3]!.elements).toEqual([]);
    expect(S.sortsDeCombat(v2('Fred', 'pretre')).map((x) => x.id)).toEqual(['pretre.frappe-sacree']);
    // Barde : l'Inspiration (relance) est une réaction, pas dans la liste.
    expect(S.sortsDeCombat(v2('Kargash', 'barde')).map((x) => x.id)).not.toContain('barde.relance');
    // Cataclysme demande un élément Maître : la glace Initiée n'y est pas proposée.
    const brut = { ...v1('Shyrion'), classe: 'magicien', niveau: 12 };
    const maitre = F.convertirFiche(brut as never, { ...F.refonteVierge(classeParId.get('magicien')!, 12), ecole: 'evocation', elementDepart: 'feu', secondElement: 'glace', elementMaitre: 'feu', rangs: { 'magicien.ecole': 1, 'magicien.elementaire': 5 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] } as never);
    const sm = S.sortsDeCombat(maitre);
    expect(sm.find((x) => x.id === 'evocation.missile')!.elements.map((e) => e.id)).toEqual(['feu', 'glace']);
    expect(sm.find((x) => x.id === 'magicien.cataclysme')).toMatchObject({ elements: [{ id: 'feu', nom: 'Feu', maitrise: 'maitre' }], elementRequis: true });
    expect(S.sortsDeCombat(v2('Karlach', 'guerrier'))).toEqual([]);
    expect(S.sortsDeCombat(v1('Shyrion'))).toEqual([]);
    // Un verbe par grimoire (octroi du MJ) : palier I, avec la maîtrise de son école.
    const g = mage();
    const parGrimoire = S.sortsDeCombat({ ...g, octrois: { ...g.octrois, verbes: [{ id: 'illusion.leurre', maitrise: 'nonMaitrise' }] } }).find((x) => x.id === 'illusion.leurre');
    expect(parGrimoire).toMatchObject({ grimoire: true, maitrise: 'nonMaitrise', paliers: ['I'] });
  });

  it('type d’action (5a) : action → principale, mineure → secondaire, gratuite → rien', () => {
    expect(S.typeDAction({ action: 'action' })).toBe('principale');
    expect(S.typeDAction({ action: 'mineure' })).toBe('secondaire');
    expect(S.typeDAction({ action: 'gratuite' })).toBe('gratuite');
  });

  it('coût de combat (4a) : le tarif entier, l’élément selon sa maîtrise, la surcharge ; un sort mineur ne coûte rien', () => {
    expect(S.coutAffiche({ id: 'evocation.choc', maitrise: 'adepte' }, 'I', false, null)).toEqual({ texte: '3 PP', pp: 3 });
    expect(S.coutAffiche({ id: 'evocation.choc', maitrise: 'adepte' }, 'I', true, null)).toEqual({ texte: '6 PP', pp: 6 });
    expect(S.coutAffiche({ id: 'evocation.choc', maitrise: 'adepte' }, 'I', false, 'initie')).toEqual({ texte: '4 PP', pp: 4 });
    expect(S.coutAffiche({ id: 'evocation.choc', maitrise: 'initie' }, 'I', false, null)).toEqual({ texte: '4 PP', pp: 4 });
    expect(S.coutAffiche({ id: 'mineur.trait-arcanique', maitrise: 'adepte' }, 'I', false, null)).toEqual({ texte: '0 PP', pp: 0 });
    expect(S.coutAffiche({ id: 'mineur.lumiere', maitrise: 'adepte' }, 'I', true, null)).toEqual({ refus: 'un sort mineur ne se surcharge pas' });
    expect(S.coutAffiche({ id: 'pretre.frappe-sacree', maitrise: 'adepte' }, 'I', false, null)).toEqual({ texte: '2 PP', pp: 2 });
    expect(S.coutAffiche({ id: 'guerrier.second-souffle', maitrise: 'adepte' }, 'I', false, null)).toMatchObject({ texte: expect.stringMatching(/Endurance|sans coût/) });
    expect(S.coutAffiche({ id: 'inconnu', maitrise: 'adepte' }, 'I', false, null)).toEqual({ refus: 'action inconnue' });
  });

  it('surcharge : un palier au-dessus, jamais un verbe « 1×/combat » ; le palier lancé', () => {
    expect(S.surchargeable('evocation.choc', 'I')).toBe(true);
    expect(S.surchargeable('evocation.choc', 'II')).toBe(false);
    expect(S.surchargeable('evocation.nova', 'I')).toBe(false);
    expect(S.surchargeable('mineur.trait-arcanique', 'I')).toBe(false);
    expect(S.surchargeable('inconnu', 'I')).toBe(false);
    expect(S.palierLance('evocation.choc', 'I', true)).toBe('II');
    expect(S.palierLance('evocation.choc', 'I', false)).toBe('I');
    expect(S.palierLance('evocation.choc', 'II', true)).toBe('II');
  });

  it('ciblage au palier lancé : créature ou case ; une ligne et un cône demandent une case', () => {
    expect(S.ciblageDe('evocation.choc', 'I')).toEqual({ type: 'creature', camp: 'ennemi', portee: 6, nbCibles: 1, ligneDeVue: true, zone: null, clicCase: false });
    expect(S.ciblageDe('mineur.trait-arcanique', 'III')).toMatchObject({ portee: 15, nbCibles: 2 });
    expect(S.ciblageDe('evocation.rayon', 'I')).toMatchObject({ type: 'point', zone: { forme: 'ligne', taille: 5, origine: 'lanceur' }, clicCase: true });
    expect(S.ciblageDe('evocation.nova', 'I')).toMatchObject({ type: 'soi', portee: 0, zone: { forme: 'cercle', taille: 2, origine: 'lanceur' }, clicCase: false });
    expect(S.ciblageDe('inconnu', 'I')).toBeNull();
    expect(S.campPermis({ genre: 'monstre' }, 'ennemi')).toBe(true);
    expect(S.campPermis({ genre: 'pj' }, 'ennemi')).toBe(false);
    expect(S.campPermis({ genre: 'pj' }, 'allie')).toBe(true);
    expect(S.campPermis({ genre: 'monstre' }, 'allie')).toBe(false);
    expect(S.campPermis({ genre: 'monstre' }, 'toute')).toBe(true);
    const c = S.ciblageDe('evocation.choc', 'I')!;
    expect(S.viseeComplete(c, { cibles: [], point: null })).toBe(false);
    expect(S.viseeComplete(c, { cibles: ['x'], point: null })).toBe(true);
    const r = S.ciblageDe('evocation.rayon', 'I')!;
    expect(S.viseeComplete(r, { cibles: [], point: null })).toBe(false);
    expect(S.viseeComplete(r, { cibles: [], point: { cx: 1, cy: 1 } })).toBe(true);
  });

  it('aperçu de la visée : les jetons pris, le refus de portée (sauf portées libres)', () => {
    const jetons = [
      { id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 },
      { id: 'a', genre: 'monstre' as const, cx: 3, cy: 0 },
      { id: 'b', genre: 'monstre' as const, cx: 8, cy: 0 },
    ];
    const choc = S.ciblageDe('evocation.choc', 'I')!;
    expect(S.apercu(scene(), jetons, 'pj-p1', choc, { cibles: ['a'], point: null }, false)).toEqual({ cases: [], touches: ['a'], refus: null });
    expect(S.apercu(scene(), jetons, 'pj-p1', choc, { cibles: ['b'], point: null }, false).refus).toBe('hors de portée (8 cases, 6 au plus)');
    expect(S.apercu(scene(), jetons, 'pj-p1', choc, { cibles: ['b'], point: null }, true).refus).toBeNull();
    const rayon = S.ciblageDe('evocation.rayon', 'I')!;
    const a = S.apercu(scene(), jetons, 'pj-p1', rayon, { cibles: [], point: { cx: 2, cy: 0 } }, false);
    expect(a.cases).toHaveLength(5);
    expect(a.touches).toEqual(['a']);
    expect(S.apercu(scene(), jetons, 'pj-p1', rayon, { cibles: [], point: { cx: 9, cy: 0 } }, false).refus).toBe('hors de portée (9 cases, 5 au plus)');
    expect(S.apercu(scene(), jetons, 'absent', rayon, { cibles: [], point: null }, false).refus).toBe('ton jeton n’est pas sur la carte');
    const nova = S.ciblageDe('evocation.nova', 'I')!;
    expect(S.apercu(scene(), jetons, 'pj-p1', nova, { cibles: [], point: null }, false).cases).toHaveLength(9);
  });
});

describe('le lanceur et ses cibles pour le moteur (2a, 8a, 12a)', () => {
  it('le lanceur : sa fiche, ses états, ses bonus du combat ; un PJ sauvegarde avec Réflexes → DEX, Vigueur → CON et FOR', () => {
    const f = mage();
    const vue = vueFiche(f);
    const s = S.sauvegardesDuPj(f);
    expect(s).toEqual({ FOR: vue.stats.sauvegardes.Vigueur, DEX: vue.stats.sauvegardes.Reflexes, CON: vue.stats.sauvegardes.Vigueur, Volonte: vue.stats.sauvegardes.Volonte });
    const moi = pj('p1', { etats: [{ id: 'aveugle', rounds: 1, cumul: 1, charges: null, des: null, source: null }], bonus: [bonus({ sur: 'attaqueMagique', valeur: 2 }), bonus({ sur: 'sauvegardeDEX', valeur: 1 }), bonus({ sur: 'DEF', valeur: 3 })] });
    const l = S.lanceurDe(f, moi);
    expect(l).toMatchObject({ id: 'pj-p1', camp: 'pj', etats: ['aveugle'], attaqueMagique: (vue.stats.attaque.magique ?? 0) + 2, def: vue.stats.ca + 3, niveau: 3, pv: vue.pv.actuel, pvMax: vue.pv.max, plongee: 0, corruptionAme: 0 });
    expect(l.sauvegardes).toEqual({ ...s, DEX: s.DEX + 1 });
    expect(l.mods!.INT).toBe(vue.caracs.find((c) => c.code === 'INT')!.mod);
    expect(l.modMagie).toBe(vue.caracs.find((c) => c.code === 'INT')!.mod);
    const k = v2('Karlach', 'guerrier');
    expect(vueFiche(k).stats.sauvegardes.Vigueur).toBeGreaterThan(0);
    expect(S.sauvegardesDuPj(k)).toMatchObject({ FOR: vueFiche(k).stats.sauvegardes.Vigueur, CON: vueFiche(k).stats.sauvegardes.Vigueur });
  });

  it('un monstre : sa DEF et ses sauvegardes, bonus compris ; sans sauvegardes, +0', () => {
    const m = monstre('a', { bonus: [bonus({ sur: 'sauvegardes', valeur: 2 }), bonus({ sur: 'DEF', valeur: -1 })], boss: true, demonOuMortVivant: true, etats: [{ id: 'renverse', rounds: null, cumul: 1, charges: null, des: null, source: null }] });
    expect(S.cibleDe(m, null, 4, 1)).toEqual({ id: 'm-r1-a', camp: 'monstre', etats: ['renverse'], distance: 4, anneau: 1, def: 12, sauvegardes: { FOR: 3, DEX: 4, CON: 3, Volonte: 2 }, boss: true, demonOuMortVivant: true, pv: 14 });
    expect(S.cibleDe(monstre('b', { sauvegardes: null }), null, 2).sauvegardes).toEqual({ FOR: 0, DEX: 0, CON: 0, Volonte: 0 });
    expect(S.cibleDe(monstre('b', { sauvegardes: null }), null, 2)).not.toHaveProperty('anneau');
    expect(() => S.cibleDe(pj('p2'), null, 1)).toThrow('fiche de p2 manque');
    const h = v2('Hermione', 'pretre', {}, 'p2');
    expect(S.cibleDe(pj('p2'), h, 1)).toMatchObject({ camp: 'pj', def: vueFiche(h).stats.ca, pv: vueFiche(h).pv.actuel, sauvegardes: S.sauvegardesDuPj(h) });
  });

  it('l’arme d’une capacité qui frappe : la famille demandée, les dés et le bonus séparés', () => {
    const k = v2('Karlach', 'guerrier');
    const a = S.armeEnJeu({ ...k, equipement: { ...k.equipement, main_gauche: null } }, {});
    expect(a).toMatchObject({ famille: 'tranchantLourd' });
    const formule = attaquesDuPj({ ...k, equipement: { ...k.equipement, main_gauche: null } }).find((x) => x.mode === 'contact')!.formule;
    const [, des, plus] = /^(\d+d\d+)([+-]\d+)?$/.exec(formule)!;
    expect(a).toMatchObject({ des, degats: plus ? Number(plus) : 0 });
    expect(des).not.toBe('1d4');
    expect(S.armeEnJeu(k, { armes: ['arc'] })).toBeUndefined();
  });

  it('preparerLancer : refus en une phrase (sort inconnu, palier, élément, cible, camp, portée)', () => {
    const f = mage();
    const moi = pj('p1');
    const goule = monstre('a');
    const carte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 3, cy: 0 }, { id: 'pj-p2', genre: 'pj' as const, cx: 1, cy: 0 }] };
    const ch = (c: Partial<import('../../src/lib/combat/sorts').ChoixDuLancer>) => ({ sort: 'evocation.choc', palier: 'I' as const, surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null }, ...c });
    const p = (c: Parameters<typeof ch>[0], k: typeof carte | null = carte) => S.preparerLancer(f, moi, combat, ch(c), k, [moi, goule, pj('p2')], new Map(), () => 0.5);
    expect(p({ sort: 'evocation.nova' })).toBe('Tu ne connais pas ce sort.');
    expect(p({ palier: 'II' })).toBe('Palier II pas encore atteint.');
    expect(p({ element: 'glace' })).toBe('Tu ne maîtrises pas cet élément.');
    expect(p({ visee: { cibles: [], point: null } })).toBe('Choisis ta cible sur la carte.');
    expect(p({ sort: 'evocation.missile', visee: { cibles: ['zz'], point: null } })).toBe('Cette cible n’est pas dans le combat.');
    expect(p({ visee: { cibles: ['pj-p2'], point: null } })).toBe('p2 : un ennemi seulement.');
    expect(p({}, { ...carte, jetons: [carte.jetons[0]!, { id: 'm-r1-a', genre: 'monstre', cx: 9, cy: 0 }] })).toBe('Hors d’atteinte : hors de portée (9 cases, 6 au plus).');
    const l = p({ element: 'feu', surcharge: true });
    expect(typeof l).toBe('object');
    expect(l).toMatchObject({ palier: 'I', surcharge: true, ecole: 'adepte', element: { id: 'feu', maitrise: 'adepte' }, premierRound: false, immobile: true });
    const lancer = l as import('../../src/lib/effets/resolution').Lancer;
    expect(lancer.cibles).toHaveLength(1);
    expect(lancer.cibles[0]).toMatchObject({ id: 'm-r1-a', distance: 3, camp: 'monstre' });
    expect(lancer.zone).toBeUndefined();
    // Sans carte : la cible à distance 0, pas de vérification de portée.
    expect(p({}, null)).toMatchObject({ cibles: [{ id: 'm-r1-a', distance: 0 }] });
    // Au premier round ; un sort « soi » vise le lanceur.
    expect(S.preparerLancer(f, moi, { ...combat, round: 1 }, ch({}), carte, [moi, goule], new Map(), () => 0.5)).toMatchObject({ premierRound: true });
    const f5 = mageN('evocation', 5);
    const proche = { ...carte, jetons: [carte.jetons[0]!, { id: 'm-r1-a', genre: 'monstre' as const, cx: 2, cy: 1 }] };
    const nova = S.preparerLancer(f5, moi, combat, ch({ sort: 'evocation.nova', visee: { cibles: [], point: null } }), proche, [moi, goule], new Map(), () => 0.5) as import('../../src/lib/effets/resolution').Lancer;
    expect(nova.cibles.map((c) => [c.id, c.distance])).toEqual([['pj-p1', 0]]);
    expect(nova.zone!.map((c) => [c.id, c.anneau, c.distance])).toEqual([['m-r1-a', 2, 2]]);
    expect(S.preparerLancer(f, moi, combat, ch({ sort: 'evocation.missile' }), null, [moi, goule], new Map(), () => 0.5)).toMatchObject({ cibles: [{ distance: 0 }] });
  });
});

describe('les changements écrits (10a, 11a, 12a)', () => {
  const lanceur = mage();
  const lu = (c: Combattant & { id: string }, fiche: (Fiche & { id: string }) | null = null) => [c.id, { c, fiche }] as const;
  const appliquer = (ch: Changement[], lus: ReturnType<typeof lu>[], depart = {}) => CH.appliquerChangements(ch, new Map(lus), { id: 'pj-p1', nom: 'Shyrion', fiche: lanceur }, depart);

  it('dégâts sur un monstre : armure, puis résistance (un élément compte comme magique) ; PV temporaires d’abord ; Endormi se réveille', () => {
    const g = monstre('a', { armure: 2, resistances: { physique: 1, magique: 0.5 }, pvTemp: 3, etats: [{ id: 'endormi', rounds: 2, cumul: 1, charges: null, des: null, source: null }] });
    const e = appliquer([{ type: 'degats', cible: g.id, montant: 12, typeDegats: 'feu', calcul: '2d6 (12)' }], [lu(g)]);
    // (12 − 2) × 0,5 = 5 ; 3 sur les PV temporaires, 2 sur les PV.
    expect(e.combattants.get(g.id)).toEqual({ etats: [], pvTemp: 0, pv: 12, aTerre: false });
    expect(e.lignes.get(g.id)).toEqual(['5 dégâts feu (12 − armure 2 = 10 × 0,5 (résiste à la magie) = 5, 3 sur les PV temporaires)']);
    expect(CH.typeSubi('physique')).toBe('physique');
    expect(CH.typeSubi('magique')).toBe('magique');
    expect(CH.typeSubi('glace')).toBe('magique');
    const phys = appliquer([{ type: 'degats', cible: g.id, montant: 20, typeDegats: 'physique', calcul: 'x' }], [lu({ ...g, pvTemp: 0, etats: [] })]);
    expect(phys.combattants.get(g.id)).toEqual({ pv: 0, aTerre: true });
  });

  it('dégâts sur un PJ : sa réduction, ses PV temporaires ; le lanceur gagne sa ressource par dégâts subis, pas un allié', () => {
    const h = v2('Hermione', 'pretre', {}, 'p2');
    const pv = vueFiche(h).pv.actuel;
    const e = appliquer([{ type: 'degats', cible: 'pj-p2', montant: 6, typeDegats: 'magique', calcul: '6' }], [lu(pj('p2', { pvTemp: 2 }), h)]);
    expect(e.combattants.get('pj-p2')).toEqual({ pvTemp: 0 });
    expect(e.fiches.get('p2')).toEqual({ pvActuel: pv - 4 });
    const k = v2('Karlach', 'guerrier', {}, 'p1');
    const g = { ...k, refonte: { ...k.refonte, jauges: { ...k.refonte.jauges, endurance: 0 } } };
    const e2 = CH.appliquerChangements([{ type: 'degats', cible: 'pj-p1', montant: 3, typeDegats: 'physique', calcul: '3' }], new Map([lu(pj('p1'), g)]), { id: 'pj-p1', nom: 'K', fiche: g });
    expect(e2.fiches.get('p1')).toHaveProperty('refonte.jauges.endurance');
    const k2 = v2('Karlach', 'guerrier', {}, 'p2');
    const e3 = appliquer([{ type: 'degats', cible: 'pj-p2', montant: 12, typeDegats: 'physique', calcul: '12' }], [lu(pj('p2'), { ...k2, refonte: { ...k2.refonte, jauges: { ...k2.refonte.jauges, endurance: 0 } } })]);
    expect(e3.fiches.get('p2')).toEqual({ pvActuel: expect.any(Number) });
    expect(e3.fiches.get('p2')!.pvActuel).toBeLessThan(vueFiche(k2).pv.actuel);
    // Le gain d'un allié ne va pas sur la fiche du lanceur.
    expect(e3.fiches.has('p1')).toBe(false);
    const sans = appliquer([{ type: 'degats', cible: 'pj-p2', montant: 3, typeDegats: 'physique', calcul: '3' }], [lu(pj('p2'))]);
    expect(sans.auMj).toEqual(['3 dégâts sur p2 : fiche absente']);
  });

  it('soins sur un PJ, au plus ses PV max ; le soin d’un monstre reste au MJ ; soin complet', () => {
    const h = v2('Hermione', 'pretre', {}, 'p2');
    const max = vueFiche(h).pv.max;
    const blesse = { ...h, pvActuel: max - 5 };
    expect(appliquer([{ type: 'soin', cible: 'pj-p2', montant: 3 }], [lu(pj('p2'), blesse)]).fiches.get('p2')).toEqual({ pvActuel: max - 2 });
    const plein = appliquer([{ type: 'soin', cible: 'pj-p2', montant: 30 }], [lu(pj('p2'), blesse)]);
    expect(plein.fiches.get('p2')).toEqual({ pvActuel: max });
    expect(plein.lignes.get('pj-p2')).toEqual(['+5 PV']);
    expect(appliquer([{ type: 'soinComplet', cible: 'pj-p2' }], [lu(pj('p2'), blesse)]).fiches.get('p2')).toEqual({ pvActuel: max });
    expect(appliquer([{ type: 'soin', cible: 'pj-p2', montant: -3 }], [lu(pj('p2'), blesse)]).fiches.has('p2')).toBe(false);
    const g = monstre('a', { pv: 3 });
    const e = appliquer([{ type: 'soin', cible: g.id, montant: 4 }, { type: 'soinComplet', cible: g.id }], [lu(g)]);
    expect(e.combattants.size).toBe(0);
    expect(e.auMj).toEqual(['Soin de a (4) : au MJ', 'Soin de a : au MJ']);
  });

  it('PV temporaires, états (durée, source, charges), état inconnu au MJ, charge consommée', () => {
    expect(appliquer([{ type: 'pvTemp', cible: 'm-r1-a', montant: 6 }], [lu(monstre('a', { pvTemp: 8 }))]).combattants.has('m-r1-a')).toBe(false);
    const g = monstre('a', { pvTemp: 4 });
    const e = appliquer(
      [
        { type: 'pvTemp', cible: g.id, montant: 6 },
        { type: 'etat', cible: g.id, etat: 'etourdi', duree: { rounds: 2 } },
        { type: 'etat', cible: g.id, etat: 'double', duree: 'finCombat', charges: 2 },
        { type: 'etat', cible: g.id, etat: 'inexistant', duree: { rounds: 1 } },
        { type: 'chargeConsommee', cible: g.id, etat: 'double' },
      ],
      [lu(g)],
    );
    expect(e.combattants.get(g.id)).toEqual({
      etats: [
        { id: 'etourdi', rounds: 2, cumul: 1, charges: null, des: null, source: 'Shyrion' },
        { id: 'double', rounds: null, cumul: 1, charges: 1, des: null, source: 'Shyrion' },
      ],
      pvTemp: 6,
    });
    expect(e.auMj).toEqual(['État « inexistant » sur a']);
    expect(e.lignes.get(g.id)).toEqual(['6 PV temporaires', 'Étourdi 2 rounds', 'Doublé', 'Doublé : une charge']);
    const contre = appliquer([{ type: 'etat', cible: g.id, etat: 'marque', duree: { rounds: 1 }, drainePour: 'x' }], [lu(g)]);
    expect(contre.auMj).toEqual(['Marqué sur a : drain au MJ']);
  });

  it('retraits d’état : ceux nommés, ou les N plus récents qui gênent ; dissipation ; « tombe » : Renversé', () => {
    const e = (id: string) => ({ id, rounds: 1, cumul: 1, charges: null, des: null, source: null });
    const g = monstre('a', { etats: [e('etourdi'), e('forme_loup'), e('aveugle'), e('saignement')], bonus: [bonus({}), bonus({ sur: 'attaque' })] });
    expect(appliquer([{ type: 'retraitEtat', cible: g.id, etats: ['aveugle'], nombre: 1 }], [lu(g)]).combattants.get(g.id)).toEqual({ etats: [e('etourdi'), e('forme_loup'), e('saignement')] });
    expect(appliquer([{ type: 'retraitEtat', cible: g.id, etats: [], nombre: 2 }], [lu(g)]).combattants.get(g.id)).toEqual({ etats: [e('etourdi'), e('forme_loup')] });
    expect(appliquer([{ type: 'retraitEtat', cible: g.id, etats: [], nombre: 2 }], [lu(g)]).lignes.get(g.id)).toEqual(['2 état(s) retiré(s)']);
    const forme = monstre('a', { etats: [e('etourdi'), e('aveugle'), e('forme_loup'), e('double')] });
    expect(appliquer([{ type: 'retraitEtat', cible: g.id, etats: [], nombre: 1 }], [lu(forme)]).combattants.get(g.id)).toEqual({ etats: [e('etourdi'), e('forme_loup'), e('double')] });
    expect(appliquer([{ type: 'retraitEtat', cible: 'pj-p1', etats: ['aveugle'], nombre: 1 }], [lu(pj('p1', { etats: [e('aveugle')] }), lanceur)]).lignes.get('pj-p1')).toBeUndefined();
    const d = appliquer([{ type: 'dissipation', cible: g.id, nombre: 1 }], [lu(g)]);
    expect(d.combattants.get(g.id)).toEqual({ bonus: [bonus({})] });
    expect(d.lignes.get(g.id)).toEqual(['1 effet(s) dissipé(s)']);
    expect(appliquer([{ type: 'dissipation', cible: g.id, nombre: 1 }], [lu(monstre('a'))]).lignes.get(g.id)).toEqual(['rien à dissiper']);
    expect(appliquer([{ type: 'tombe', cible: g.id }], [lu(monstre('a'))]).combattants.get(g.id)).toEqual({ etats: [{ id: 'renverse', rounds: null, cumul: 1, charges: null, des: null, source: 'Shyrion' }] });
  });

  it('bonus : chiffre ou dés, durée, prochaine frappe, type ; « par allié au contact » le dit au MJ', () => {
    const g = pj('p2');
    const e = appliquer(
      [
        { type: 'bonus', cible: g.id, sur: 'DEF', valeur: 2, duree: { rounds: 3 } },
        { type: 'bonus', cible: g.id, sur: 'degats', valeur: '1d6', duree: 'finCombat', typeDegats: 'feu', consomme: 'prochaineFrappe' },
        { type: 'bonus', cible: g.id, sur: 'attaque', valeur: 150, duree: 'prochainTour', parAllieAuContact: true },
      ],
      [lu(g, v2('Hermione', 'pretre', {}, 'p2'))],
    );
    expect(e.combattants.get(g.id)).toEqual({
      bonus: [
        { sur: 'DEF', valeur: 2, rounds: 3, consomme: false, typeDegats: null, source: 'Shyrion' },
        { sur: 'degats', valeur: '1d6', rounds: null, consomme: true, typeDegats: 'feu', source: 'Shyrion' },
        { sur: 'attaque', valeur: 99, rounds: 1, consomme: false, typeDegats: null, source: 'Shyrion' },
      ],
    });
    expect(e.auMj).toEqual(['+99 attaque (1) sur p2 : par allié au contact, au MJ']);
  });

  it('ressources du lanceur (bornées à sa jauge), pas d’un autre ; déplacements rendus ; invocation, terrain et le reste au MJ', () => {
    const e = appliquer(
      [
        { type: 'ressource', cible: 'pj-p1', ressource: 'plongee', montant: 2 },
        { type: 'ressource', cible: 'pj-p1', ressource: 'plongee', montant: 1 },
        { type: 'ressource', cible: 'pj-p1', ressource: 'ki', montant: 1 },
        { type: 'ressource', cible: 'pj-p2', ressource: 'plongee', montant: 1 },
        { type: 'deplacement', cible: 'm-r1-a', sens: 'repousse', cases: 2 },
        { type: 'invocation', creature: 'serviteur', nombre: 1, duree: 'finCombat', element: 'feu' },
        { type: 'terrain', nature: 'glace', duree: { rounds: 2 } },
        { type: 'relance', cible: 'pj-p1' },
        { type: 'narratif', cible: 'm-r1-a', texte: 'Il tremble.' },
        { type: 'soin', cible: 'absent', montant: 1 },
      ],
      [lu(pj('p1'), lanceur), lu(pj('p2'), v2('Hermione', 'pretre', {}, 'p2')), lu(monstre('a'))],
    );
    expect(e.fiches.get('p1')).toEqual({ 'refonte.jauges.plongee': 3 });
    expect(e.deplacements).toEqual([{ cible: 'm-r1-a', sens: 'repousse', cases: 2 }]);
    expect(e.auMj).toEqual(['ki : au MJ', 'plongee de p2 : au MJ', 'Invocation : 1 × serviteur (feu)', 'Terrain : glace', 'relance sur p1', 'soin sur absent']);
    expect(e.lignes.get('m-r1-a')).toEqual(['Il tremble.']);
    expect(e.lignes.get('pj-p1')).toEqual(['Plongée 2', 'Plongée 3']);
    const vide = appliquer([{ type: 'ressource', cible: 'pj-p1', ressource: 'plongee', montant: 'vider' }], [lu(pj('p1'), lanceur)], { jauges: { plongee: 4 } });
    expect(vide.fiches.get('p1')).toEqual({ 'refonte.jauges.plongee': 0 });
    const g = v2('Karlach', 'guerrier', {}, 'p1');
    const borne = CH.appliquerChangements([{ type: 'ressource', cible: 'pj-p1', ressource: 'endurance', montant: 50 }], new Map([lu(pj('p1'), g)]), { id: 'pj-p1', nom: 'K', fiche: g });
    expect(borne.fiches.get('p1')).toEqual({ 'refonte.jauges.endurance': vueFiche(g).refonte!.jauges.find((j) => j.cle === 'endurance')!.max });
  });

  it('les PV et jauges de départ : le coût déjà payé', () => {
    const pv = vueFiche(lanceur).pv.actuel;
    const e = appliquer([{ type: 'soin', cible: 'pj-p1', montant: 1 }], [lu(pj('p1'), lanceur)], { pv: new Map([['p1', pv - 3]]), jauges: { plongee: 1 } });
    expect(e.fiches.get('p1')).toEqual({ pvActuel: pv - 2, 'refonte.jauges.plongee': 1 });
  });
});

describe('repousser et attirer de N cases ; placer (10a)', () => {
  const j = (id: string, cx: number, cy: number, x: object = {}) => ({ id, genre: 'monstre' as const, cx, cy, ...x });
  it('repousser : case par case, la collision l’arrête ; attirer : vers l’origine, il s’arrête devant ce qui bloque', () => {
    const jetons = [j('l', 0, 0), j('c', 2, 0)];
    expect(P.trajet(scene(), jetons, { cx: 0, cy: 0 }, 'c', 'repousse', 3)).toEqual({ vers: { cx: 5, cy: 0 }, collision: null });
    expect(P.trajet(scene(), [...jetons, j('x', 4, 0)], { cx: 0, cy: 0 }, 'c', 'repousse', 3)).toEqual({ vers: { cx: 3, cy: 0 }, collision: { collision: 'jeton', avec: 'x' } });
    expect(P.trajet(scene([[[3, 0], [3, 10]]]), jetons, { cx: 0, cy: 0 }, 'c', 'repousse', 3)).toEqual({ vers: null, collision: { collision: 'decor' } });
    expect(P.trajet(scene(), [j('l', 0, 0), j('c', 6, 0)], { cx: 0, cy: 0 }, 'c', 'attire', 3)).toEqual({ vers: { cx: 3, cy: 0 }, collision: null });
    expect(P.trajet(scene(), [j('l', 0, 0), j('c', 2, 0)], { cx: 0, cy: 0 }, 'c', 'attire', 3)).toEqual({ vers: { cx: 1, cy: 0 }, collision: null });
    expect(P.trajet(scene(), [j('l', 0, 0), j('c', 4, 0), j('x', 3, 0)], { cx: 0, cy: 0 }, 'c', 'attire', 3)).toEqual({ vers: null, collision: null });
    // Depuis le centre d'une zone (Vortex), qui ne tient pas de case.
    expect(P.trajet(scene(), [j('c', 5, 7)], { cx: 5, cy: 5 }, 'c', 'attire', 1)).toEqual({ vers: { cx: 5, cy: 6 }, collision: null });
    expect(P.trajet(scene(), [j('c', 5, 6)], { cx: 5, cy: 5 }, 'c', 'repousse', 1)).toEqual({ vers: { cx: 5, cy: 7 }, collision: null });
    // Attiré vers le centre d'une zone : il s'arrête à côté, jamais dessus.
    expect(P.trajet(scene(), [j('c', 5, 6)], { cx: 5, cy: 5 }, 'c', 'attire', 2)).toEqual({ vers: null, collision: null });
    // Un mur l'arrête.
    expect(P.trajet(scene([[[3, 0], [3, 10]]]), [j('c', 5, 0)], { cx: 0, cy: 0 }, 'c', 'attire', 3)).toEqual({ vers: { cx: 3, cy: 0 }, collision: null });
    expect(P.attirer(scene(), [j('l', 0, 0)], 'l', 'absent')).toBeNull();
    expect(P.attirer(scene(), [j('l', 0, 0), j('c', 0, 0)], 'l', 'c')).toBeNull();
    expect(P.attirer(scene([], [[[2, 0], [2, 10]]]), [j('l', 0, 0), j('c', 2, 0)], 'l', 'c')).toBeNull();
  });

  it('arrivée d’une téléportation : dans la carte, à N cases au plus, libre', () => {
    const jetons = [j('c', 2, 2), j('x', 4, 4), j('mort', 3, 3, { mort: true })];
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 5, cy: 2 }, 3)).toBeNull();
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 3, cy: 3 }, 3)).toBeNull();
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 2, cy: 2 }, 3)).toBeNull();
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 6, cy: 2 }, 3)).toBe('3 cases au plus');
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 3, cy: 2 }, 0)).toBe('0 case au plus');
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 4, cy: 4 }, 3)).toBe('case prise');
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: -1, cy: 2 }, 3)).toBe('hors de la carte');
    expect(P.arriveePermise(scene(), jetons, 'c', { cx: 2, cy: 10 }, 9)).toBe('hors de la carte');
    expect(P.arriveePermise(scene(), jetons, 'zz', { cx: 2, cy: 2 }, 3)).toBe('ce jeton n’est pas sur la carte');
  });
});

describe('lancer en combat (2a, 4a, 5a, 10a, 13a)', () => {
  const f = mage();
  const moi = pj('p1');
  const goule = monstre('a');
  const carte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 2, cy: 0 }] };
  const choix = (c: Partial<import('../../src/lib/combat/sorts').ChoixDuLancer> = {}) => ({ sort: 'evocation.choc', palier: 'I' as const, surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null }, ...c });
  const dd = () => 10 + vueFiche(f).caracs.find((c) => c.code === 'INT')!.mod;
  const ecritures = () => appels.filter((a) => a.fn === 'tx.update');

  it('Choc sur une goule : elle rate sa sauvegarde de FOR, prend 2d6 et recule d’une case ; 3 PP payés ; l’action principale prise ; au journal', async () => {
    enBase(moi);
    enBase(goule);
    // Sauvegarde : d20 = 2 (+1) ; dégâts 2d6 = 4 + 5.
    const r = await L.lancerSortEnCombat('c1', combat, moi, f, choix(), carte, [moi, goule], new Map([['p1', f]]), suite([2, 20], [4, 6], [5, 6]));
    expect(r).toEqual({ issue: 'reussi', texte: 'Choc I lancé.', aPlacer: [] });
    expect(ecritures()).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 5, aTerre: false } },
      { fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } },
      { fn: 'tx.update', chemin: 'tables/t1/persos/p1', donnees: { ppActuel: vueFiche(f).pp!.actuel - 3 } },
    ]);
    expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: 'tables/t1/scenes/cave/jetons/m-r1-a', donnees: { cx: 3, cy: 0 } });
    expect(journal.noterJet).toHaveBeenCalledTimes(2);
    expect(journal.noterJet.mock.calls[0]).toEqual(['Choc I', '0', { des: [], faces: 0, bonus: 0, total: 0 }, f.nom, `${f.nom} : lancé (3 PP)`]);
    expect(journal.noterJet.mock.calls[1]).toEqual(['Choc sur a', '1d20', { des: [2], faces: 20, bonus: 0, total: 3 }, f.nom, `sauvegarde de FOR 3 contre DD ${dd()} : raté ; dégâts 9 (4, 5) ; 9 dégâts magique (9)`]);
  });

  it('une sauvegarde réussie : la moitié, pas de recul', async () => {
    enBase(moi);
    enBase(goule);
    await L.lancerSortEnCombat('c1', combat, moi, f, choix(), carte, [moi, goule], new Map([['p1', f]]), suite([19, 20], [4, 6], [5, 6]));
    expect(ecritures()[0]).toEqual({ fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 10, aTerre: false } });
    expect(appels.some((a) => a.chemin.includes('jetons'))).toBe(false);
  });

  it('Trait arcanique (mineur) : l’attaque magique contre la DEF, 0 PP', async () => {
    enBase(moi);
    enBase(goule);
    await L.lancerSortEnCombat('c1', combat, moi, f, choix({ sort: 'mineur.trait-arcanique' }), carte, [moi, goule], new Map([['p1', f]]), suite([18, 20], [6, 6]));
    const att = vueFiche(f).stats.attaque.magique ?? 0;
    expect(journal.noterJet.mock.calls[1]![4]).toBe(`attaque magique ${18 + att} contre DEF 13 : touché ; dégâts 6 ; 6 dégâts magique (6)`);
    expect(ecritures().find((a) => a.chemin.endsWith('persos/p1'))).toBeUndefined();
  });

  it('refusé : pas son tour, état qui l’empêche, action prise, limite, cible absente, PP manquants', async () => {
    const lancer = (c: Partial<typeof combat> = {}, m: Combattant & { id: string } = moi, fi: FicheV2 & { id: string } = f, ch = choix()) =>
      L.lancerSortEnCombat('c1', { ...combat, ...c }, m, fi, ch, carte, [m, goule], new Map(), suite([2, 20], [4, 6], [5, 6]));
    await expect(lancer({ actif: 'm-r1-a' })).rejects.toThrow('Ce n’est pas ton tour.');
    await expect(lancer({}, pj('p1', { etats: [{ id: 'etourdi', rounds: 1, cumul: 1, charges: null, des: null, source: null }] }))).rejects.toThrow('ne peut que se déplacer');
    await expect(lancer({}, pj('p1', { etats: [{ id: 'endormi', rounds: 1, cumul: 1, charges: null, des: null, source: null }] }))).rejects.toThrow('ne peut pas agir');
    await expect(lancer({}, pj('p1', { tourActions: 6, principale: true }))).rejects.toThrow('L’action principale est déjà prise ce tour.');
    await expect(lancer({}, moi, f, choix({ sort: 'evocation.nova' }))).rejects.toThrow('Tu ne connais pas ce sort.');
    await expect(lancer({}, moi, f, choix({ visee: { cibles: [], point: null } }))).rejects.toThrow('Choisis ta cible');
    await expect(lancer({}, moi, { ...f, ppActuel: 2 })).rejects.toThrow('Il te faut 3 PP (il t’en reste 2).');
    expect(appels).toEqual([]);
  });

  it('limites : « 1×/combat » une fois ; l’usage noté au round du lancer', async () => {
    const f5 = mageN('evocation', 5);
    expect(S.sortsDeCombat(f5).find((x) => x.id === 'evocation.nova')).toMatchObject({ limite: '1x/combat' });
    const deja = pj('p1', { usages: { 'evocation.nova': 1 } });
    await expect(L.lancerSortEnCombat('c1', combat, deja, f5, choix({ sort: 'evocation.nova', visee: { cibles: [], point: null } }), carte, [deja, goule], new Map(), () => 0.5)).rejects.toThrow('Nova a déjà servi ce combat.');
    enBase(moi);
    enBase(goule);
    await L.lancerSortEnCombat('c1', combat, moi, f5, choix({ sort: 'evocation.nova', visee: { cibles: [], point: null } }), carte, [moi, goule], new Map(), () => 0.5);
    expect(ecritures().find((a) => a.chemin === `${C}/pj-p1`)!.donnees).toMatchObject({ usages: { 'evocation.nova': 2 }, principale: true });
    // La goule, à 2 cases, est dans le cercle de 2 autour de lui.
    expect(ecritures().some((a) => a.chemin === `${C}/m-r1-a`)).toBe(true);
  });

  it('le texte des jets au journal', () => {
    expect(L.texteJet({ quoi: 'maîtrise de l’école', des: [3], total: 3, contre: 4, reussi: false })).toBe('maîtrise de l’école 3 contre échec sur 4 : raté');
    expect(L.texteJet({ quoi: 'attaque magique', des: [20, 3], total: 25, contre: 12, reussi: true, critique: true })).toBe('attaque magique 25 (20, 3) contre DEF 12 : critique');
    expect(L.texteJet({ quoi: 'attaque', des: [5], total: 8, contre: 12, reussi: false })).toBe('attaque 8 contre DEF 12 : raté');
    expect(L.texteJet({ quoi: 'sauvegarde de DEX', des: [15], total: 17, contre: 13, reussi: true })).toBe('sauvegarde de DEX 17 contre DD 13 : réussi');
    expect(L.texteJet({ quoi: 'Éclat chaotique', des: [4], total: 4 })).toBe('Éclat chaotique 4');
  });


  it('Rayon (ligne) : tout ce qui est sur la ligne, allié compris ; la fiche de l’allié perd ses PV ; un mort et un monstre à terre n’y sont pas', async () => {
    const f3 = mageN('evocation', 3);
    const h = v2('Hermione', 'pretre', {}, 'p2');
    const allie = pj('p2');
    const tombe = monstre('b', { pv: 0, aTerre: true });
    const k = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'pj-p2', genre: 'pj' as const, cx: 1, cy: 0 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 3, cy: 0 }, { id: 'm-r1-b', genre: 'monstre' as const, cx: 4, cy: 0 }, { id: 'mort', genre: 'monstre' as const, cx: 2, cy: 0, mort: true }] };
    for (const c of [moi, allie, goule, tombe]) enBase(c);
    const r = await L.lancerSortEnCombat('c1', combat, moi, f3, choix({ sort: 'evocation.rayon', visee: { cibles: [], point: { cx: 1, cy: 0 } } }), k, [moi, allie, goule, tombe], new Map([['p2', h]]), () => 0.95);
    expect(r.issue).toBe('reussi');
    const pv = vueFiche(h).pv.actuel;
    // 3d6 = 18, sauvegardes réussies (d20 = 20) : la moitié, 9.
    const net = degatsSurPj(h, 9, 'magique').net;
    expect(ecritures()).toContainEqual({ fn: 'tx.update', chemin: 'tables/t1/persos/p2', donnees: { pvActuel: Math.max(0, pv - net) } });
    expect(ecritures()).toContainEqual({ fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 5, aTerre: false } });
    expect(ecritures().some((a) => a.chemin.endsWith('m-r1-b'))).toBe(false);
    expect(journal.noterJet.mock.calls.map((c) => c[0])).toEqual(['Rayon I', 'Rayon sur p2', 'Rayon sur a']);
    // Sans carte, une zone ne se résout pas.
    await expect(L.lancerSortEnCombat('c1', combat, moi, f3, choix({ sort: 'evocation.rayon', visee: { cibles: [], point: { cx: 1, cy: 0 } } }), null, [moi, goule], new Map(), () => 0.5)).rejects.toThrow('La carte du combat n’est pas chargée.');
  });

  it('l’élément qui dérape (Initié : 1 à 4) : le sort échoue, les PP sont payés, le dérapage frappe le lanceur', async () => {
    const f2 = { ...v2('Shyrion', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] }), ppActuel: 10 };
    const s = S.sortsDeCombat(f2).find((x) => x.id === 'evocation.choc')!;
    expect(s.elements).toEqual([{ id: 'feu', nom: 'Feu', maitrise: 'initie' }]);
    enBase(moi);
    enBase(goule);
    const r = await L.lancerSortEnCombat('c1', combat, moi, f2, choix({ element: 'feu' }), carte, [moi, goule], new Map([['p1', f2]]), () => 0.05);
    expect(r).toEqual({ issue: 'derapage', texte: 'Choc I : l’élément dérape, le sort échoue.', aPlacer: [] });
    expect(ecritures().find((a) => a.chemin === 'tables/t1/persos/p1')!.donnees).toMatchObject({ ppActuel: 6 });
    expect(ecritures().some((a) => a.chemin.endsWith('m-r1-a'))).toBe(false);
    expect(journal.noterJet.mock.calls[0]![1]).toBe('1d20');
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/^Shyrion : l’élément dérape \(4 PP\) ; maîtrise de l’élément 2 contre échec sur 4 : raté/);
  });

  it('Choc qui repousse une goule contre une autre : la collision, 1d4 à chacune', async () => {
    const autre = monstre('b');
    for (const c of [moi, goule, autre]) enBase(c);
    const k = { ...carte, jetons: [...carte.jetons, { id: 'm-r1-b', genre: 'monstre' as const, cx: 3, cy: 0 }] };
    await L.lancerSortEnCombat('c1', combat, moi, f, choix(), k, [moi, goule, autre], new Map([['p1', f]]), suite([2, 20], [1, 6], [1, 6], [3, 4], [2, 4]));
    expect(appels.some((a) => a.chemin.includes('jetons'))).toBe(false);
    expect(journal.noterJet.mock.calls.map((c) => c[0])).toEqual(['Choc I', 'Choc sur a', 'Collision : a heurte un jeton', 'Collision : b est heurté']);
    // a : 14 − 2 (Choc) − 3 (collision).
    expect(appels.filter((a) => a.chemin.endsWith('m-r1-a')).map((a) => (a.donnees as { pv: number }).pv)).toEqual([12, 11]);
  });

  it('Vortex : la zone attire vers son centre, pas vers le lanceur', async () => {
    const f4 = mageN('evocation', 4);
    const g = monstre('a');
    for (const c of [moi, g]) enBase(c);
    const k = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 6, cy: 6 }] };
    await L.lancerSortEnCombat('c1', combat, moi, f4, choix({ sort: 'evocation.vortex', visee: { cibles: [], point: { cx: 5, cy: 5 } } }), k, [moi, g], new Map(), () => 0.05);
    expect(ecritures().find((a) => a.chemin === `${C}/m-r1-a`)).toBeDefined();
    expect(appels.some((a) => a.chemin.includes('jetons'))).toBe(false);
  });

  it('Portail sur un allié : il accepte, et le joueur place son jeton à 6 cases', async () => {
    const fi = mageN('invocation', 3);
    const allie = pj('p2');
    for (const c of [moi, allie]) enBase(c);
    const k = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'pj-p2', genre: 'pj' as const, cx: 1, cy: 0 }] };
    const r = await L.lancerSortEnCombat('c1', combat, moi, fi, choix({ sort: 'invocation.portail', visee: { cibles: ['pj-p2'], point: null } }), k, [moi, allie], new Map([['p2', v2('Hermione', 'pretre', {}, 'p2')]]), () => 0.5);
    expect(r.aPlacer).toEqual([{ cible: 'pj-p2', nom: 'p2', cases: 6 }]);
  });

  it('une capacité qui coûte une ressource de classe : payée, ou refusée faute de quoi ; gratuite, elle ne prend pas d’action', async () => {
    const ch = v2('Vhorgar', 'chasseur');
    expect(S.sortsDeCombat(ch).map((x) => [x.id, x.typeAction])).toEqual([['chasseur.marque', 'gratuite'], ['chasseur.changer-de-marque', 'gratuite']]);
    expect(S.coutAffiche({ id: 'chasseur.changer-de-marque', maitrise: 'adepte' }, 'I', false, null)).toEqual({ texte: '1 Instinct', pp: 0 });
    enBase(moi);
    enBase(goule);
    const c = choix({ sort: 'chasseur.changer-de-marque' });
    await L.lancerSortEnCombat('c1', combat, moi, ch, c, carte, [moi, goule], new Map(), () => 0.5);
    expect(ecritures()).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { etats: [{ id: 'marque', rounds: null, cumul: 1, charges: null, des: null, source: ch.nom.slice(0, 40) }] } },
      { fn: 'tx.update', chemin: 'tables/t1/persos/p1', donnees: { 'refonte.jauges.instinct': 2 } },
    ]);
    expect(journal.noterJet.mock.calls[0]![4]).toBe(`${ch.nom} : lancé (1 instinct) ; L’ancienne cible n’est plus marquée.`);
    const vide = { ...ch, refonte: { ...ch.refonte, jauges: { ...ch.refonte.jauges, instinct: 0 } } };
    await expect(L.lancerSortEnCombat('c1', combat, moi, vide, c, carte, [moi, goule], new Map(), () => 0.5)).rejects.toThrow('Il faut 1 Instinct (il en reste 0).');
  });

  it('placer un jeton téléporté : la case cliquée, refusée si elle est prise', async () => {
    const p = { cible: 'm-r1-a', nom: 'a', cases: 2 };
    await L.placerParSort('cave', carte, p, { cx: 4, cy: 0 });
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: 'tables/t1/scenes/cave/jetons/m-r1-a', donnees: { cx: 4, cy: 0 } }]);
    await expect(L.placerParSort('cave', carte, p, { cx: 0, cy: 0 })).rejects.toThrow('a : case prise.');
    await expect(L.placerParSort('cave', carte, p, { cx: 5, cy: 0 })).rejects.toThrow('a : 2 cases au plus.');
  });
});

describe('bonus et PV temporaires dans les attaques (11a, 12a)', () => {
  it('le jet d’attaque : bonus d’attaque de l’attaquant, de DEF de la cible ; les dégâts : bonus et dés, la « prochaine frappe » tombe ; les PV temporaires d’abord', async () => {
    const f = v2('Karlach', 'guerrier');
    const moi = pj('p1', { bonus: [bonus({ sur: 'attaque', valeur: 2 }), bonus({ sur: 'degats', valeur: '1d4', consomme: true }), bonus({ sur: 'degats', valeur: 1 })] });
    const g = monstre('a', { bonus: [bonus({ sur: 'DEF', valeur: 3 }), bonus({ sur: 'DEFDistance', valeur: 5 })], pvTemp: 4 });
    enBase(g);
    const i = await X.attaquer('c1', combat, moi, g, { nom: 'Épée', bonus: 4, seuilCritique: 20, mode: 'contact' }, f, suite([10, 20]));
    expect(i).toMatchObject({ total: 16, def: 16, touche: true });
    const r = await X.infligerDegats('c1', g, { nom: 'Épée', formule: '1d8', typeDegats: 'physique', critique: false }, 'K', suite([5, 8], [3, 4]), moi);
    // 5 + 3 + 1 = 9 ; 4 sur les PV temporaires.
    expect(r.pv).toBe(9);
    expect(appels.filter((a) => a.fn === 'tx.update')).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 9, aTerre: false, pvTemp: 0 } },
      { fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { bonus: [moi.bonus[0], moi.bonus[2]] } },
    ]);
    expect(journal.noterJet.mock.calls.at(-1)![1]).toBe('1d8+1d4+1');
    expect(journal.noterJet.mock.calls.at(-1)![4]).toBe('9, 4 sur les PV temporaires → a 9/14 PV');
  });

  it('un monstre : ses bonus de dégâts ; le PJ touché perd d’abord ses PV temporaires', async () => {
    const f = v2('Hermione', 'pretre');
    const g = monstre('a', { bonus: [bonus({ sur: 'degats', valeur: 2, consomme: true })] });
    const cible = pj('p1', { pvTemp: 3 });
    const pv = vueFiche(f).pv.actuel;
    const r = await X.attaqueDeMonstre('c1', combat, g, { nom: 'Griffes', bonus: 30, formule: '1d6', typeDegats: 'physique', portee: { min: 0, max: 1, vue: false }, seuilCritique: 20, etatSurTouche: null }, cible, f, suite([10, 20], [4, 6]));
    const red = pv - r.pv;
    expect(r.net).toBeGreaterThan(0);
    expect(red).toBe(Math.max(0, r.net! - 3));
    expect(appels).toContainEqual({ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { pvTemp: Math.max(0, 3 - r.net!) } });
    expect(appels).toContainEqual({ fn: 'lot.update', chemin: `${C}/m-r1-a`, donnees: { bonus: [] } });
  });

  it('blesser et subir des dégâts : les PV temporaires d’abord ; tout absorbé, la fiche n’est pas touchée', async () => {
    const f = v2('Hermione', 'pretre');
    const net = degatsSurPj(f, 3, 'magique').net;
    await X.blesser('c1', pj('p1', { pvTemp: 10 }), f, { des: [3], faces: 4, bonus: 0, total: 3 }, '1d4', 'magique', 'Collision', 'K');
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { pvTemp: 10 - net } }]);
    appels.length = 0;
    const r = await X.subirDegats(f, 3, 'magique', { idCombat: 'c1', c: pj('p1', { pvTemp: 1 }) });
    expect(r.pv).toBe(vueFiche(f).pv.actuel - (net - 1));
    expect(appels).toContainEqual({ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { pvTemp: 0 } });
    appels.length = 0;
    enBase(monstre('a', { pvTemp: 2 }));
    await X.blesser('c1', monstre('a', { pvTemp: 2 }), null, { des: [3], faces: 4, bonus: 0, total: 3 }, '1d4', 'physique', 'Collision', 'K');
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 13, aTerre: false, pvTemp: 0 } });
  });

  it('fin du tour : les bonus de celui qui finit perdent un round', async () => {
    base.set('tables/t1/combats/c1', { nom: 'x', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null });
    const moi = pj('p1', { bonus: [bonus({ rounds: 1 }), bonus({ rounds: 3 })] });
    enBase(moi);
    await A.finirTour('c1', 'pj-p1', [moi, monstre('a')], new Set());
    expect(appels[0]).toEqual({ fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { bonus: [bonus({ rounds: 2 })] } });
  });
});
