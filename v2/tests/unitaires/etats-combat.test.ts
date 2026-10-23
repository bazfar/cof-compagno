import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * États, ressources et attaques spéciales en combat (lot L6.3, décisions de
 * Thomas du 23/10/2026) : 1a (catalogue de la refonte), 2a (sur le
 * combattant), 4b (pose à la main), 5a (fin du tour du porteur), 6a (effets
 * appliqués), 7b (il passe lui-même), 8 (état d'un monstre sans
 * sauvegarde), 9a (ressources), 10a (usages), 11a (attaques spéciales),
 * 12a et A (repousser, collisions 1d4 / 1d6), Ba (l'obstacle arrête),
 * 13a (Précision, Décharge).
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
const journal = vi.hoisted(() => ({ noterJet: vi.fn(async (..._a: unknown[]) => {}), lancerEtNoter: vi.fn() }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/actions/carte', () => ({ marquerMort: vi.fn() }));

const { session } = await import('../../src/lib/session.svelte');
const E = await import('../../src/lib/combat/etats');
const R = await import('../../src/lib/combat/ressources');
const S = await import('../../src/lib/combat/speciales');
const P = await import('../../src/lib/combat/poussee');
const O = await import('../../src/lib/combat/ordre');
const X = await import('../../src/lib/actions/attaques');
const A = await import('../../src/lib/actions/combat');
const F = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { objetParId } = await import('../../src/lib/regles/donnees');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { classeParId } = await import('../../src/regles');
const { schemaCombattant } = await import('../../src/lib/schemas/combat');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type EtatCombat = import('../../src/lib/schemas/combat').EtatCombat;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const v2 = (nom: string, classe: string, choix: Partial<RefonteFiche> = {}, id = 'p1'): FicheV2 & { id: string } => {
  const f = { ...v1(nom, id), classe };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, f.niveau), ...choix }), id };
};
const neutre = { physique: 1, magique: 1 };
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15, de: 12, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const etat = (id: string, c: Partial<EtatCombat> = {}): EtatCombat => ({ id, rounds: 1, cumul: 1, charges: null, des: null, source: null, ...c });
/** Un aléa qui rend ces dés, chacun sur ses faces : [valeur, faces]. */
const suite = (...v: [number, number][]) => {
  let i = 0;
  return () => {
    const [d, f] = v[i++]!;
    return (d - 0.5) / f;
  };
};
/** Sans bouclier en main gauche (Karlach en porte un). */
const sansBouclier = <T extends Fiche>(f: T): T => ({ ...f, equipement: { ...f.equipement, main_gauche: null } });
const enBase = (c: Combattant & { id: string }) => base.set(`${C}/${c.id}`, (({ id: _i, ...x }) => x)(c));
const C = 'tables/t1/combats/c1/combattants';
const combat = { tour: 6, round: 2, scene: 'cave' };
const scene = (obstacles: [[number, number], [number, number]][] = [], murs: [[number, number], [number, number]][] = []) => ({ colonnes: 10, lignes: 10, murs, obstacles, portes: [] }) as never;

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  session.etape = 'joueur';
  journal.noterJet.mockClear();
  vi.restoreAllMocks();
});

describe('les états (1a, 4b, 5a)', () => {
  it('poser : un état neuf ; déjà là, la plus longue durée ; cumulable, une pose de plus ; inconnu, refusé', () => {
    let e = E.poserEtat([], 'etourdi', 1, 'Karlach');
    expect(e).toEqual([etat('etourdi', { source: 'Karlach' })]);
    e = E.poserEtat(e, 'etourdi', 3, 'X');
    expect(e).toEqual([etat('etourdi', { rounds: 3, source: 'Karlach' })]);
    expect(E.poserEtat(e, 'etourdi', 2, 'X')[0]!.rounds).toBe(3);
    expect(E.poserEtat(e, 'etourdi', null, 'X')[0]!.rounds).toBeNull();
    expect(E.poserEtat(E.poserEtat([], 'ivresse', 2, null), 'ivresse', 1, null)).toEqual([etat('ivresse', { rounds: 2, cumul: 2 })]);
    expect(E.poserEtat([], 'saignement', 2, 'Goule', { des: '1d8' })[0]!.des).toBe('1d8');
    expect(() => E.poserEtat([], 'inconnu', 1, null)).toThrow('État inconnu');
    expect(E.poserEtat(Array.from({ length: 20 }, (_, i) => etat(`x${i}`)), 'expose', 1, null)).toHaveLength(20);
  });

  it('5a : à la fin du tour du porteur, un round de moins ; à 0 il tombe ; sans durée, il reste', () => {
    expect(E.finDeTour([etat('etourdi'), etat('expose', { rounds: 3 }), etat('marque', { rounds: null })])).toEqual([etat('expose', { rounds: 2 }), etat('marque', { rounds: null })]);
    expect(E.retirerEtat([etat('etourdi'), etat('expose')], 'etourdi')).toEqual([etat('expose')]);
  });

  it('6a : ce qui rompt un état (dégâts, ses attaques, mouvement)', () => {
    const l = [etat('endormi'), etat('dissimule'), etat('renverse'), etat('expose')];
    expect(E.rompre(l, 'degatsSubis').map((e) => e.id)).toEqual(['dissimule', 'renverse', 'expose']);
    expect(E.rompre(l, 'sesAttaques').map((e) => e.id)).toEqual(['endormi', 'renverse', 'expose']);
    expect(E.rompre(l, 'actionMouvement').map((e) => e.id)).toEqual(['endormi', 'dissimule', 'expose']);
    expect(E.rompre(l, 'estAttaque')).toEqual(l);
  });

  it('6a : modificateurs (un cumulable compte chaque pose), avantage et désavantage, « prochaine attaque » consommée', () => {
    expect(E.modificateur([etat('expose'), etat('renverse')], ['DEF'])).toBe(-6);
    expect(E.modificateur([etat('expose')], ['attaque'])).toBe(0);
    expect(E.modificateur([etat('ivresse', { cumul: 3 })], ['tests'])).toBe(-3);
    expect(E.avantageAttaque([etat('aveugle')], [])).toEqual({ avantage: -1, consommes: [] });
    expect(E.avantageAttaque([etat('desequilibre')], [])).toEqual({ avantage: -1, consommes: ['desequilibre'] });
    expect(E.avantageAttaque([], [etat('dissimule')])).toEqual({ avantage: -1, consommes: [] });
    expect(E.avantageAttaque([], [etat('feinte')])).toEqual({ avantage: 1, consommes: [] });
    expect(E.avantageAttaque([], [])).toEqual({ avantage: 0, consommes: [] });
    expect(E.d20Attaque(suite([5, 20], [17, 20]), 1)).toEqual({ des: [5, 17], garde: 17 });
    expect(E.d20Attaque(suite([5, 20], [17, 20]), -1)).toEqual({ des: [5, 17], garde: 5 });
    expect(E.d20Attaque(suite([5, 20]), 0)).toEqual({ des: [5], garde: 5 });
  });

  it('6a, 7b : agir, se déplacer, être ciblé, Double, Affaibli, dégâts par tour', () => {
    expect(E.peutAgir([etat('etourdi')])).toBe('deplacementSeul');
    expect(E.peutAgir([etat('etourdi'), etat('endormi')])).toBe('non');
    expect(E.peutAgir([])).toBe('oui');
    expect(E.deplacementPermis([etat('ralenti')])).toBe('moitie');
    expect(E.deplacementPermis([etat('ralenti'), etat('immobilise')])).toBe('nul');
    expect(E.deplacementPermis([])).toBe('normal');
    expect(E.ciblable([etat('expose')])).toBe(true);
    expect(E.leurre([etat('double', { charges: 2 })])?.id).toBe('double');
    expect(E.leurre([etat('expose')])).toBeNull();
    expect(E.consommerCharge([etat('double', { charges: 2 })], 'double')).toEqual([etat('double', { charges: 1 })]);
    expect(E.consommerCharge([etat('double', { charges: 1 })], 'double')).toEqual([]);
    expect(E.affaibli([etat('affaibli')])).toEqual({ pourcent: 25, minimum: 1 });
    expect(E.affaibli([etat('expose')])).toBeNull();
    expect(E.degatsParTour([etat('saignement'), etat('brulure'), etat('expose'), etat('saignement', { des: '1d8' })])).toEqual([
      { id: 'saignement', nom: 'Saignement', des: '1d6', typeDegats: 'physique' },
      { id: 'brulure', nom: 'Brûlure', des: '1d4', typeDegats: 'feu' },
      { id: 'saignement', nom: 'Saignement', des: '1d8', typeDegats: 'physique' },
    ]);
  });

  it('le texte d’un état ; le bestiaire v1 traduit (maudite → maudit)', () => {
    expect(E.texteEtat(etat('etourdi'))).toBe('Étourdi (1)');
    expect(E.texteEtat(etat('ivresse', { cumul: 2, rounds: null }))).toBe('Ivresse ×2');
    expect(E.texteEtat(etat('double', { charges: 2, rounds: 3 }))).toBe('Doublé [2] (3)');
    expect(E.ETATS_V1_VERS_REFONTE.maudite).toBe('maudit');
    expect(E.etatDuCatalogue('maudit')?.nom).toBe('Maudit');
    expect(E.etatsPosables().length).toBeGreaterThan(50);
    expect(E.regleEtat('etourdi')).toMatch(/./);
  });

  it('le déplacement : moitié arrondie au supérieur, ou rien (6a)', () => {
    expect(O.deplacementRestant(pj('S', { etats: [etat('ralenti')] }), 1)).toBe(3);
    expect(O.deplacementRestant(pj('S', { etats: [etat('immobilise')] }), 1)).toBe(0);
    expect(O.deplacementRestant(pj('S', { mvtBase: 6, tourActions: 1, mvt: 1, etats: [etat('ralenti')] }), 1)).toBe(2);
  });

  it('le schéma : 20 états au plus', () => {
    const { id: _i, ...p } = pj('S');
    expect(schemaCombattant.safeParse({ ...p, etats: Array.from({ length: 21 }, (_, i) => etat(`x${i}`)) }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, etats: [{ ...etat('x'), rounds: 0 }] }).success).toBe(false);
  });
});

describe('les ressources (9a)', () => {
  it('Ki : au début du combat, sa valeur de départ ; par touche, +1, 2 par round', () => {
    const m = v2('Hyrma', 'moine', { elementDepart: 'psionique' });
    const ki = R.jauge(m, 'ki')!;
    expect(R.jaugesAuDebutDuCombat({ ...m, refonte: { ...m.refonte, jauges: { ...m.refonte.jauges, ki: 0 } } })).toEqual({ ki: 1 });
    expect(R.jaugesAuDebutDuCombat({ ...m, refonte: { ...m.refonte, jauges: { ...m.refonte.jauges, ki: 1 } } })).toEqual({});
    const zero = { ...m, refonte: { ...m.refonte, jauges: { ...m.refonte.jauges, ki: 0 } } };
    expect(R.gainParTouche(zero, pj('m'), 2)).toEqual({ jauges: { ki: 1 }, gainTouche: { round: 2, montant: 1 } });
    expect(R.gainParTouche(zero, pj('m', { gainTouche: { round: 2, montant: 2 } }), 2)).toBeNull();
    expect(R.gainParTouche(zero, pj('m', { gainTouche: { round: 1, montant: 2 } }), 2)).toEqual({ jauges: { ki: 1 }, gainTouche: { round: 2, montant: 1 } });
    expect(R.gainParTouche({ ...m, refonte: { ...m.refonte, jauges: { ...m.refonte.jauges, ki: ki.max! } } }, pj('m'), 2)).toBeNull();
    expect(R.gainParTouche(v2('Karlach', 'guerrier'), pj('k'), 2)).toBeNull();
  });

  it('Endurance par dégâts subis ; Inspiration sur son 20 naturel ; Plongée à 0 en fin de combat ; une fiche v1 n’a rien', () => {
    const g = v2('Karlach', 'guerrier');
    const bas = { ...g, refonte: { ...g.refonte, jauges: { ...g.refonte.jauges, endurance: 1 } } };
    expect(R.gainParDegatsSubis(bas, 3)).toEqual({ endurance: 2 });
    expect(R.gainParDegatsSubis(bas, 0)).toEqual({});
    expect(R.gainParDegatsSubis(g, 3)).toEqual({});
    const b = v2('Kargash', 'barde');
    const sans = { ...b, refonte: { ...b.refonte, jauges: { ...b.refonte.jauges, inspiration: 0 } } };
    expect(R.gainParVingtNaturel(sans, 20)).toEqual({ inspiration: 1 });
    expect(R.gainParVingtNaturel(sans, 19)).toEqual({});
    expect(R.jaugesALaFinDuCombat({ ...g, refonte: { ...g.refonte, jauges: { ...g.refonte.jauges, plongee: 4 } } })).toEqual({ plongee: 0 });
    expect(R.jaugesALaFinDuCombat(g)).toEqual({});
    expect(R.gainParDegatsSubis(v1('Karlach'), 3)).toEqual({});
    expect(R.payer(v1('Karlach'), 'endurance', 2)).toMatch(/Pas de/);
  });

  it('payer : la jauge après paiement, ou le refus', () => {
    const g = v2('Karlach', 'guerrier');
    const max = R.jauge(g, 'endurance')!.actuel;
    expect(R.payer(g, 'endurance', 2)).toEqual({ endurance: max - 2 });
    expect(R.payer({ ...g, refonte: { ...g.refonte, jauges: { ...g.refonte.jauges, endurance: 1 } } }, 'endurance', 2)).toBe('Il faut 2 Endurance (il en reste 1).');
    expect(R.champsJauges({ ki: 1, plongee: 0 })).toEqual({ 'refonte.jauges.ki': 1, 'refonte.jauges.plongee': 0 });
  });
});

describe('les attaques spéciales (11a, 13a)', () => {
  it('Guerrier à l’épée longue : Fendre, 2 Endurance, Exposé 1 round ; 2 avec Précision létale', () => {
    const g = sansBouclier(v2('Karlach', 'guerrier'));
    const s = S.attaquesSpecialesDuPj(g);
    expect(s.map((x) => [x.id, x.famille, x.effet, x.cout])).toEqual([['arme.fendre', 'tranchantLourd', { type: 'etat', etat: 'expose', rounds: 1 }, { ressource: 'endurance', montant: 2 }]]);
    expect(s[0]!.arme.nom).toBe('Épée longue');
    const pl = sansBouclier(v2('Karlach', 'guerrier', { rangs: { 'guerrier.maitre-d-armes': 3 }, caracEnPlus: 'FOR' }));
    expect(S.attaquesSpecialesDuPj(pl)[0]).toMatchObject({ effet: { rounds: 2 }, cout: { montant: 1 } });
  });

  it('Coup d’estoc au choix ; Carreau lourd repousse ; Précision et Décharge ; un hybride, une fois par combat', () => {
    const avec = (f: FicheV2 & { id: string }, main: string, objet: string) => ({ ...f, equipement: { ...f.equipement, [main]: objetParId.get(objet) as never } });
    const g = sansBouclier(v2('Karlach', 'guerrier'));
    const effets = (f: Fiche) => S.attaquesSpecialesDuPj(f).map((x) => [x.id, x.effet.type]);
    expect(effets(avec(g, 'main_droite', 'rapiere'))).toEqual([['arme.coup-d-estoc', 'estoc']]);
    expect(effets(avec(g, 'main_droite', 'arbalete'))).toEqual([['arme.carreau-lourd', 'repousse']]);
    expect(effets(avec(g, 'main_droite', 'pistolet'))).toEqual([['arme.precision', 'precision']]);
    expect(effets(avec(g, 'main_droite', 'tromblon'))).toEqual([['arme.decharge', 'decharge']]);
    const bouclier = S.attaquesSpecialesDuPj(avec(g, 'main_gauche', 'bouclier_acier')).find((x) => x.famille === 'bouclier')!;
    expect(bouclier).toMatchObject({ id: 'arme.coup-de-bouclier', arme: { formule: '' }, effet: { etat: 'renverse' } });
    const pretre = avec(sansBouclier(v2('Hermione', 'pretre')), 'main_droite', 'masse');
    expect(S.attaquesSpecialesDuPj(pretre).map((x) => [x.id, x.cout])).toEqual([['arme.coup-assommant', 'unParCombat']]);
    expect(S.attaquesSpecialesDuPj(avec(sansBouclier(v2('Hermione', 'pretre')), 'main_droite', 'epee_longue'))).toEqual([]);
    expect(S.attaquesSpecialesDuPj(v1('Karlach'))).toEqual([]);
  });
});

describe('repousser (12a, A, Ba)', () => {
  const jetons = [
    { id: 'a', genre: 'pj' as const, cx: 2, cy: 2 },
    { id: 'c', genre: 'monstre' as const, cx: 3, cy: 3 },
  ];
  it('dans l’axe de l’attaquant, diagonale comprise ; case libre : il y va', () => {
    expect(P.pousser(scene(), jetons, 'a', 'c')).toEqual({ vers: { cx: 4, cy: 4 } });
    expect(P.pousser(scene(), [jetons[0]!, { id: 'c', genre: 'monstre', cx: 3, cy: 2 }], 'a', 'c')).toEqual({ vers: { cx: 4, cy: 2 } });
  });
  it('collision : un jeton (pas un mort), un mur, un obstacle dessiné, le bord ; sans attaquant ou sur sa case, rien', () => {
    expect(P.pousser(scene(), [...jetons, { id: 'x', genre: 'monstre', cx: 4, cy: 4 }], 'a', 'c')).toEqual({ collision: 'jeton', avec: 'x' });
    expect(P.pousser(scene(), [...jetons, { id: 'x', genre: 'monstre', cx: 4, cy: 4, mort: true }], 'a', 'c')).toEqual({ vers: { cx: 4, cy: 4 } });
    expect(P.pousser(scene([], [[[4, 0], [4, 10]]]), jetons, 'a', 'c')).toEqual({ collision: 'decor' });
    expect(P.pousser(scene([[[4, 0], [4, 10]]]), jetons, 'a', 'c')).toEqual({ collision: 'decor' });
    expect(P.pousser(scene(), [{ id: 'a', genre: 'pj', cx: 8, cy: 8 }, { id: 'c', genre: 'monstre', cx: 9, cy: 9 }], 'a', 'c')).toEqual({ collision: 'decor' });
    expect(P.pousser(scene(), [{ id: 'a', genre: 'pj', cx: 1, cy: 1 }, { id: 'c', genre: 'monstre', cx: 0, cy: 1 }], 'a', 'c')).toEqual({ collision: 'decor' });
    expect(P.pousser(scene(), jetons, 'zz', 'c')).toBeNull();
    expect(P.pousser(scene(), [jetons[0]!, { id: 'c', genre: 'monstre', cx: 2, cy: 2 }], 'a', 'c')).toBeNull();
    expect([P.DEGATS_COLLISION_JETON, P.DEGATS_COLLISION_DECOR]).toEqual(['1d4', '1d6']);
  });
});

describe('écritures (L6.3)', () => {
  const a = { nom: 'Épée', bonus: 4, seuilCritique: 20, mode: 'contact' as const };

  it('l’attaque compte les états : DEF baissée, désavantage (2d20), « prochaine attaque » consommée, rupture des deux côtés', async () => {
    const k = v1('Kargash');
    const att = pj('p1', { etats: [etat('desequilibre'), etat('invisible')] });
    const cible = monstre('A', { etats: [etat('expose')] });
    const i = await X.attaquer('c1', combat, att, cible, a, k, suite([15, 20], [9, 20]));
    expect(i).toMatchObject({ de: 9, des: [15, 9], bonus: 4, total: 13, def: 11, touche: true });
    expect(appels[0]).toEqual({ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: expect.objectContaining({ principale: true, etats: [] }) });
    expect(journal.noterJet.mock.calls[0]![4]).toBe('2d20 (15, 9) garde 9 +4 = 13 contre DEF 11 : touché');
  });

  it('Double : l’attaque rate d’office et use une charge ; une cible non ciblable, un attaquant qui n’agit pas, un Aveuglé à distance : refusés', async () => {
    const k = v1('Kargash');
    const i = await X.attaquer('c1', combat, pj('p1'), monstre('A', { etats: [etat('double', { charges: 2 })] }), a, k, suite([20, 20]));
    expect(i.touche).toBe(false);
    expect(appels.find((x) => x.chemin === `${C}/m-r1-A`)?.donnees).toEqual({ etats: [etat('double', { charges: 1 })] });
    expect(journal.noterJet.mock.calls[0]![4]).toBe('Doublé : l’attaque rate d’office.');
    await expect(X.attaquer('c1', combat, pj('p1', { etats: [etat('etourdi')] }), monstre('A'), a, k)).rejects.toThrow('ne peut que se déplacer');
    await expect(X.attaquer('c1', combat, pj('p1', { etats: [etat('endormi')] }), monstre('A'), a, k)).rejects.toThrow('ne peut pas agir');
    await expect(X.attaquer('c1', combat, pj('p1'), monstre('A', { etats: [etat('banni')] }), a, k)).rejects.toThrow('pris pour cible');
    await expect(X.attaquer('c1', combat, pj('p1', { etats: [etat('aveugle')] }), monstre('A'), { ...a, mode: 'distance' }, k)).rejects.toThrow('qu’au contact');
  });

  it('11a : une spéciale paie son coût, touchée pose son état ; ratée, le coût est payé quand même ; pas assez, refusée', async () => {
    const g = sansBouclier(v2('Karlach', 'guerrier'));
    const s = S.attaquesSpecialesDuPj(g)[0]!;
    const end = R.jauge(g, 'endurance')!.actuel;
    await X.attaquer('c1', combat, pj('p1'), monstre('A'), { ...s.arme, nom: s.nom }, g, suite([18, 20]), { s });
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: expect.objectContaining({ principale: true }) },
      { fn: 'lot.update', chemin: `${C}/m-r1-A`, donnees: { etats: [etat('expose', { source: g.nom })] } },
      { fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { 'refonte.jauges.endurance': end - 2 } },
    ]);
    expect(journal.noterJet.mock.calls[0]![0]).toBe('Fendre sur A');
    appels.length = 0;
    await X.attaquer('c1', combat, pj('p1'), monstre('A'), { ...s.arme, nom: s.nom }, g, suite([2, 20]), { s });
    expect(appels.map((x) => x.chemin)).toEqual([`${C}/pj-p1`, 'tables/t1/persos/p1']);
    const vide = { ...g, refonte: { ...g.refonte, jauges: { ...g.refonte.jauges, endurance: 1 } } };
    await expect(X.attaquer('c1', combat, pj('p1'), monstre('A'), { ...s.arme, nom: s.nom }, vide, suite([2, 20]), { s })).rejects.toThrow('Il faut 2 Endurance');
  });

  it('10a : la spéciale d’un hybride, une fois par combat', async () => {
    const h = sansBouclier(v2('Hermione', 'pretre'));
    const s = S.attaquesSpecialesDuPj(h)[0]!;
    await X.attaquer('c1', combat, pj('p1'), monstre('A'), { ...s.arme, nom: s.nom }, h, suite([18, 20]), { s });
    expect(appels[0]!.donnees).toMatchObject({ usages: { attaqueSpeciale: 2 } });
    await expect(X.attaquer('c1', combat, pj('p1', { usages: { attaqueSpeciale: 1 } }), monstre('A'), { ...s.arme, nom: s.nom }, h, suite([18, 20]), { s })).rejects.toThrow('déjà faite');
  });

  it('11a : Coup d’estoc « Déséquilibrer » pose Déséquilibré ; Coup de bouclier, sans dés, ne demande pas de dégâts (attaque-pj)', async () => {
    const g = { ...v2('Karlach', 'guerrier'), equipement: { ...v2('Karlach', 'guerrier').equipement, main_droite: objetParId.get('rapiere') as never, main_gauche: null } };
    const s = S.attaquesSpecialesDuPj(g)[0]!;
    await X.attaquer('c1', combat, pj('p1'), monstre('A'), { ...s.arme, nom: s.nom }, g, suite([18, 20]), { s, estoc: 'etat' });
    expect(appels.find((x) => x.chemin === `${C}/m-r1-A`)?.donnees).toEqual({ etats: [etat('desequilibre', { source: g.nom })] });
  });

  it('les mains nues du Moine de la refonte : le dé de son niveau + FOR', () => {
    const m = v2('Hyrma', 'moine', { elementDepart: 'psionique' });
    const nu = { ...m, equipement: { ...m.equipement, main_droite: null, main_gauche: null } };
    const p = (F.profilDe(classeParId.get('moine')!, nu.refonte, F.contexteDe(nu, classeParId.get('moine')!)).deMainsNues)!;
    const a = S.famillesManiees(nu).get('mainsNues');
    expect(a?.nom).toBe('Poings');
    expect(a?.formule.startsWith(p)).toBe(true);
  });

  it('12a : Coup d’estoc « repousser » : le jeton recule ; collision avec un jeton : 1d4 à chacun ; contre le décor : 1d6', async () => {
    const g = { ...v2('Karlach', 'guerrier'), equipement: { ...v2('Karlach', 'guerrier').equipement, main_droite: objetParId.get('rapiere') as never, main_gauche: null } };
    const s = S.attaquesSpecialesDuPj(g)[0]!;
    const carte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 2 }, { id: 'm-r1-A', genre: 'monstre' as const, cx: 3, cy: 2 }] };
    await X.attaquer('c1', combat, pj('p1'), monstre('A'), { ...s.arme, nom: s.nom }, g, suite([18, 20]), { s, estoc: 'repousse', carte });
    expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: 'tables/t1/scenes/cave/jetons/m-r1-A', donnees: { cx: 4, cy: 2 } });
    expect(appels.some((x) => x.chemin === `${C}/m-r1-A`)).toBe(false); // repoussé, pas Déséquilibré
    // Collision contre un jeton : le poussé et le heurté.
    appels.length = 0;
    const goule = monstre('A', { pv: 10 });
    const rat = monstre('B', { pv: 5 });
    enBase(goule);
    enBase(rat);
    const r = await X.repousser('c1', 'cave', pj('p1'), goule, { scene: scene(), jetons: [...carte.jetons, { id: 'm-r1-B', genre: 'monstre', cx: 4, cy: 2 }] }, [goule, rat], new Map(), 'K', suite([3, 4], [2, 4]));
    expect(r).toBe('jeton');
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { pv: 7, aTerre: false } },
      { fn: 'tx.update', chemin: `${C}/m-r1-B`, donnees: { pv: 3, aTerre: false } },
    ]);
    expect(journal.noterJet.mock.calls.at(-2)!.slice(0, 2)).toEqual(['Collision : A heurte un jeton', '1d4']);
    // Contre le décor : 1d6 au poussé seulement ; un PJ heurté, sa fiche.
    appels.length = 0;
    const r2 = await X.repousser('c1', 'cave', pj('p1'), goule, { scene: scene([], [[[4, 0], [4, 10]]]), jetons: carte.jetons }, [goule], new Map(), 'K', suite([6, 6]));
    expect(r2).toBe('decor');
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { pv: 4, aTerre: false } }]);
    appels.length = 0;
    const h = v1('Hermione', 'p2');
    const allie = pj('p2');
    await X.repousser('c1', 'cave', pj('p1'), goule, { scene: scene(), jetons: [...carte.jetons, { id: 'pj-p2', genre: 'pj', cx: 4, cy: 2 }] }, [goule, allie], new Map([['p2', h]]), 'K', suite([1, 4], [4, 4]));
    expect(appels.at(-1)).toEqual({ fn: 'lot.update', chemin: 'tables/t1/persos/p2', donnees: { pvActuel: vueFiche(h).pv.actuel - 4 } });
  });

  it('les dégâts de l’attaquant : ses états (+ dégâts, Affaibli) et sa Précision, consommée ; ceux de la cible rompus', async () => {
    enBase(monstre('A', { pv: 20, etats: [etat('endormi')] }));
    const r = await X.infligerDegats('c1', monstre('A'), { nom: 'Épée', formule: '1d8', typeDegats: 'physique', critique: false }, 'K', suite([8, 8], [4, 6]), pj('p1', { visee: true, etats: [etat('affaibli')] }));
    // 8 + 4 (visée) = 12, affaibli : 12 − 3 = 9.
    expect(r).toMatchObject({ jet: { total: 12 }, pv: 11, degats: { net: 9, detail: '12, affaibli : 9' } });
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { pv: 11, aTerre: false, etats: [] } },
      { fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { visee: false } },
    ]);
    expect(journal.noterJet.mock.calls[0]![1]).toBe('1d8+1d6');
    appels.length = 0;
    await X.infligerDegats('c1', monstre('A'), { nom: 'Épée', formule: '1d8', typeDegats: 'physique', critique: true }, 'K', suite([1, 8], [1, 8], [10, 10]), pj('p1', { visee: true }));
    expect(journal.noterJet.mock.calls.at(-1)![1]).toBe('2d8+1d10');
  });

  it('13a : viser paie, prend l’action et arme la Précision ; Décharge : un jet par balle, 1d4 à chaque touche', async () => {
    const g = { ...v2('Karlach', 'guerrier'), equipement: { ...v2('Karlach', 'guerrier').equipement, main_droite: objetParId.get('pistolet') as never, main_gauche: null } };
    const s = S.attaquesSpecialesDuPj(g)[0]!;
    await X.viser('c1', combat, pj('p1'), s, g);
    expect(appels.map((x) => [x.chemin, x.donnees])).toEqual([
      ['tables/t1/persos/p1', { 'refonte.jauges.endurance': R.jauge(g, 'endurance')!.actuel - 2 }],
      [`${C}/pj-p1`, expect.objectContaining({ principale: true, visee: true })],
    ]);
    await expect(X.viser('c1', combat, pj('p1', { tourActions: 6, principale: true }), s, g)).rejects.toThrow('action principale');
    appels.length = 0;
    const t = { ...g, equipement: { ...g.equipement, main_droite: objetParId.get('tromblon') as never } };
    const d = S.attaquesSpecialesDuPj(t)[0]!;
    for (const id of ['A', 'B', 'C']) enBase(monstre(id, { pv: 10 }));
    const n = await X.decharger('c1', combat, pj('p1'), [monstre('A'), monstre('B'), monstre('C')], d, t, suite([18, 20], [3, 4], [1, 20], [19, 20], [2, 4]));
    expect(n).toBe(2);
    expect(appels.filter((x) => x.fn === 'tx.update').map((x) => [x.chemin, x.donnees])).toEqual([
      [`${C}/m-r1-A`, { pv: 7, aTerre: false }],
      [`${C}/m-r1-C`, { pv: 8, aTerre: false }],
    ]);
    await expect(X.decharger('c1', combat, pj('p1'), [], d, t)).rejects.toThrow('Une à trois');
    // Une cible à terre parmi les suivantes : pas de balle pour elle.
    appels.length = 0;
    journal.noterJet.mockClear();
    await X.decharger('c1', combat, pj('p1'), [monstre('A'), monstre('B', { aTerre: true, pv: 0 })], d, t, suite([2, 20]));
    expect(journal.noterJet.mock.calls.map((c) => c[0])).toEqual(['Décharge sur A']);
  });

  it('8 : l’attaque d’un monstre pose son état à la touche (maudite → maudit), sans sauvegarde ; le gain par dégâts subis ; les états de part et d’autre', async () => {
    session.etape = 'mj';
    const g = v2('Karlach', 'guerrier');
    const basse = { ...g, refonte: { ...g.refonte, jauges: { ...g.refonte.jauges, endurance: 0 } } };
    const att = { nom: 'Morsure', bonus: 4, formule: '1d6', typeDegats: 'physique' as const, portee: { min: 0, max: 1, vue: false }, seuilCritique: 20, etatSurTouche: { id: 'maudite', duree: 2 } };
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A', { etats: [etat('expose')] }), att, pj('p1', { perso: 'p1', etats: [etat('endormi')] }), basse, suite([20, 20], [3, 6], [3, 6]));
    expect(r).toMatchObject({ etat: 'maudit', issue: { critique: true } });
    const ecr = appels.filter((x) => x.fn === 'lot.update');
    expect(ecr.find((x) => x.chemin === 'tables/t1/persos/p1')!.donnees).toEqual({ pvActuel: expect.any(Number), 'refonte.jauges.endurance': 1 });
    expect(ecr.find((x) => x.chemin === `${C}/pj-p1`)!.donnees).toEqual({ etats: [etat('maudit', { rounds: 2, source: 'A' })] });
    expect(journal.noterJet.mock.calls.at(-1)![4]).toMatch(/ ; Maudit 2 rounds$/);
    // Un état inconnu de la refonte est dit, pas posé.
    appels.length = 0;
    const r2 = await X.attaqueDeMonstre('c1', combat, monstre('A'), { ...att, etatSurTouche: { id: 'gelee', duree: 1 } }, pj('p1', { perso: 'p1' }), basse, suite([20, 20], [3, 6], [3, 6]));
    expect(r2.etat).toBeNull();
    expect(journal.noterJet.mock.calls.at(-1)![4]).toMatch(/état « gelee » inconnu de la refonte, au MJ$/);
    // Raté : l'état « est attaqué » des deux côtés sans écrire la fiche.
    appels.length = 0;
    await X.attaqueDeMonstre('c1', combat, monstre('A'), att, pj('p1', { perso: 'p1' }), basse, suite([1, 20]));
    expect(appels.some((x) => x.chemin === 'tables/t1/persos/p1')).toBe(false);
  });

  it('subir des dégâts en combat : le gain par dégâts subis, et les états rompus', async () => {
    const g = v2('Karlach', 'guerrier');
    const basse = { ...g, refonte: { ...g.refonte, jauges: { ...g.refonte.jauges, endurance: 0 } } };
    await X.subirDegats(basse, 5, 'physique', { idCombat: 'c1', c: pj('p1', { etats: [etat('endormi'), etat('expose')] }) });
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { pvActuel: expect.any(Number), 'refonte.jauges.endurance': 1 } },
      { fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { etats: [etat('expose')] } },
    ]);
  });

  it('début de tour (6a) : les dégâts par tour, une fois, au journal ; poser et retirer à la main (4b)', async () => {
    session.etape = 'mj';
    const goule = monstre('A', { pv: 10, etats: [etat('saignement'), etat('brulure', { des: '1d8' })] });
    enBase(goule);
    expect(await X.debutDeTour('c1', combat, goule, null, suite([4, 6], [5, 8]))).toBe(9);
    expect(appels[0]).toEqual({ fn: 'updateDoc', chemin: `${C}/m-r1-A`, donnees: { debutTour: 6 } });
    expect(journal.noterJet.mock.calls.map((c) => c[0])).toEqual(['Saignement : début du tour de A', 'Brûlure : début du tour de A']);
    appels.length = 0;
    await X.poserEtatSur('c1', monstre('A'), 'etourdi', 2, 'Alice');
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/m-r1-A`, donnees: { etats: [etat('etourdi', { rounds: 2, source: 'Alice' })] } }]);
    expect(journal.noterJet.mock.calls.at(-1)![4]).toBe('Alice pose Étourdi sur A, 2 rounds.');
    await expect(X.poserEtatSur('c1', monstre('A'), 'nope', 1, 'A')).rejects.toThrow('État inconnu');
    await expect(X.poserEtatSur('c1', monstre('A'), 'etourdi', 0, 'A')).rejects.toThrow('1 à 99');
    appels.length = 0;
    await X.retirerEtatDe('c1', monstre('A', { etats: [etat('etourdi'), etat('expose')] }), 'etourdi');
    expect(appels[0]!.donnees).toEqual({ etats: [etat('expose')] });
  });

  it('5a : finir le tour décompte les états de qui le finit ; se déplacer rompt les états du mouvement', async () => {
    base.set('tables/t1/combats/c1', { nom: 'x', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null });
    enBase(pj('p1', { etats: [etat('etourdi'), etat('expose', { rounds: 2 })] }));
    await A.finirTour('c1', 'pj-p1', [pj('p1'), monstre('A')], new Set());
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { etats: [etat('expose')] } });
    appels.length = 0;
    await A.noterAction('c1', { tour: 3 }, pj('p1', { etats: [etat('renverse')] }), { cases: 2 });
    expect(appels[0]!.donnees).toMatchObject({ mvt: 2, etats: [] });
    appels.length = 0;
    await A.noterAction('c1', { tour: 3 }, pj('p1', { etats: [etat('expose')] }), { cases: 1 });
    expect(appels[0]!.donnees).not.toHaveProperty('etats');
  });

  it('9a : au démarrage, le Ki reprend sa valeur ; à la clôture, la Plongée revient à 0', async () => {
    session.etape = 'mj';
    const brouillon = [{ id: 'pj-p1', genre: 'pj' as const, nom: 'M', perso: 'p1', uid: 'alice', monstre: null, modInit: 1, pvMax: null, def: null, armure: 0, resistances: neutre, mvtBase: 5 }];
    await A.demarrerCombat({ nom: 'x', scene: 'cave', rencontre: null, combattants: brouillon }, null, () => 0.5, [{ perso: 'p1', jauges: { ki: 1 } }, { perso: 'p2', jauges: {} }]);
    expect(appels.filter((x) => x.chemin.startsWith('tables/t1/persos'))).toEqual([{ fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { 'refonte.jauges.ki': 1 } }]);
    appels.length = 0;
    await A.cloreCombat('c1', [{ perso: 'p1', jauges: { plongee: 0 } }]);
    expect(appels[0]).toEqual({ fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { 'refonte.jauges.plongee': 0 } });
  });
});
