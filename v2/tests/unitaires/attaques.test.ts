import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Attaques et dégâts en combat (lot L6.2, décisions de Thomas du
 * 23/10/2026) : 1b (le joueur résout contre la DEF), 2a (dégâts sur bouton,
 * appliqués au monstre), 3a (critique et 1 naturel), 4a (portée, ligne de
 * vue), 5a (l'action principale), 6a (attaque de monstre contre la CA),
 * 7a (Mourant : 3 réussites, 3 échecs, 5 jets au plus ; relever),
 * 8a (subir des dégâts), 9a (potion, action secondaire), 10a (armure,
 * résistances, réduction, détail au journal).
 */

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

const { session } = await import('../../src/lib/session.svelte');
const T = await import('../../src/lib/combat/attaque');
const P = await import('../../src/lib/combat/attaques-pj');
const M = await import('../../src/lib/combat/mort');
const X = await import('../../src/lib/actions/attaques');
const { ligneDeVue } = await import('../../src/lib/battlemap/ciblage');
const { CalculsPersonnage } = await import('../../src/lib/regles/calculs');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { objetParId } = await import('../../src/lib/regles/donnees');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { schemaCombattant } = await import('../../src/lib/schemas/combat');
const { schemaJetJournal } = await import('../../src/lib/schemas/journal');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15, de: 12, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
/** Un aléa qui rend ces dés, dans l'ordre (sur des faces de `faces`). */
const des = (faces: number, ...v: number[]) => {
  let i = 0;
  return () => (v[i++]! - 0.5) / faces;
};
/** Un aléa qui rend ces dés, chacun sur ses faces : [valeur, faces]. */
const suite = (...v: [number, number][]) => {
  let i = 0;
  return () => {
    const [d, f] = v[i++]!;
    return (d - 0.5) / f;
  };
};
const C = 'tables/t1/combats/c1/combattants';
const combat = { tour: 6, round: 2, scene: 'cave' };

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  journal.noterJet.mockClear();
  vi.restoreAllMocks();
});

describe('l’attaque (3a)', () => {
  it('d20 + bonus contre la DEF ; égalité touche ; 20 naturel touche toujours ; 1 naturel rate toujours', () => {
    expect(T.resoudreAttaque(8, 5, 13)).toEqual({ de: 8, bonus: 5, total: 13, def: 13, touche: true, critique: false, echecCritique: false });
    expect(T.resoudreAttaque(7, 5, 13).touche).toBe(false);
    expect(T.resoudreAttaque(20, -5, 30)).toMatchObject({ touche: true, critique: true });
    expect(T.resoudreAttaque(1, 30, 10)).toMatchObject({ touche: false, critique: false, echecCritique: true });
  });

  it('19–20 avec Précision létale (Maître d’armes 3)', () => {
    expect(T.resoudreAttaque(19, 0, 30, 19)).toMatchObject({ touche: true, critique: true });
    expect(T.resoudreAttaque(19, 0, 30)).toMatchObject({ touche: false, critique: false });
    const v2 = (rang: number) => ({ schemaVersion: 2, refonte: { rangs: { 'guerrier.maitre-d-armes': rang } } }) as never;
    expect(P.seuilCritiqueDe(v2(3))).toBe(19);
    expect(P.seuilCritiqueDe(v2(2))).toBe(20);
    expect(P.seuilCritiqueDe(reelle('Karlach'))).toBe(20);
  });

  it('le détail au journal (10a)', () => {
    expect(T.texteAttaque(T.resoudreAttaque(17, 5, 14))).toBe('d20 17 +5 = 22 contre DEF 14 : touché');
    expect(T.texteAttaque(T.resoudreAttaque(20, -1, 14), 'CA')).toBe('d20 20 −1 = 19 contre CA 14 : touché, critique');
    expect(T.texteAttaque(T.resoudreAttaque(1, 9, 5))).toBe('d20 1 +9 = 10 contre DEF 5 : raté (1 naturel)');
    expect(T.texteAttaque(T.resoudreAttaque(3, 0, 5))).toBe('d20 3 +0 = 3 contre DEF 5 : raté');
  });

  it('le critique double les dés de l’arme, pas ses bonus (moteur : doublerDes)', () => {
    expect(T.formuleDegats('1d8+3', true)).toBe('2d8+3');
    expect(T.formuleDegats('1+1d4', true)).toBe('1+2d4');
    expect(T.formuleDegats('1d8+3', false)).toBe('1d8+3');
  });

  it('une formule de dégâts à plusieurs termes', () => {
    expect(T.lancerDegats('2d6+1d4+3', suite([2, 6], [5, 6], [3, 4]))).toEqual({ des: [2, 5, 3], faces: 6, bonus: 3, total: 13 });
    expect(T.lancerDegats('1+1d4', des(4, 4))).toEqual({ des: [4], faces: 4, bonus: 1, total: 5 });
    expect(T.lancerDegats('1d4-3', des(4, 1))).toEqual({ des: [1], faces: 4, bonus: -3, total: 0 });
    expect(T.lancerDegats('3', () => 0)).toBeNull();
    expect(T.lancerDegats('1d4+x', () => 0)).toBeNull();
    expect(T.lancerDegats('1d4-1d6', () => 0)).toBeNull();
  });
});

describe('les dégâts sur un monstre (10a)', () => {
  const d = (armure: number, physique = 1, magique = 1) => ({ armure, resistances: { physique, magique } });
  it('l’armure d’abord, puis la résistance du type, arrondi à l’inférieur (v1)', () => {
    expect(T.degatsSurMonstre(12, d(0), 'physique')).toEqual({ brut: 12, net: 12, detail: '12' });
    expect(T.degatsSurMonstre(12, d(2, 0.5), 'physique')).toEqual({ brut: 12, net: 5, detail: '12 − armure 2 = 10 × 0,5 (résiste au physique) = 5' });
    expect(T.degatsSurMonstre(11, d(0, 0.5), 'physique').net).toBe(5);
    expect(T.degatsSurMonstre(12, d(2, 0.5, 1.5), 'magique')).toEqual({ brut: 12, net: 15, detail: '12 − armure 2 = 10 × 1,5 (vulnérable à la magie) = 15' });
    expect(T.degatsSurMonstre(1, d(3), 'physique')).toEqual({ brut: 1, net: 0, detail: '1 − armure 3 = 0' });
    expect(T.degatsSurMonstre(5, d(0, 1, 0), 'magique').net).toBe(0);
  });
});

describe('la portée et la vue (4a)', () => {
  const scene = (murs: [[number, number], [number, number]][] = []) => ({ colonnes: 20, lignes: 20, murs, obstacles: [], portes: [] }) as never;
  const jetons = [
    { id: 'a', genre: 'pj' as const, cx: 2, cy: 2 },
    { id: 'b', genre: 'monstre' as const, cx: 3, cy: 3 },
    { id: 'c', genre: 'monstre' as const, cx: 6, cy: 2 },
  ];
  it('au contact : adjacent, diagonale comprise ; au-delà, refusé', () => {
    expect(T.horsDePortee(scene(), jetons, 'a', 'b', T.PORTEE_CONTACT)).toBeNull();
    expect(T.horsDePortee(scene(), [...jetons, { id: 'e', genre: 'monstre', cx: 4, cy: 2 }], 'a', 'e', T.PORTEE_CONTACT)).toBe('pas au contact (2 cases)');
    expect(T.horsDePortee(scene(), jetons, 'a', 'c', T.PORTEE_CONTACT)).toBe('pas au contact (4 cases)');
    expect(T.horsDePortee(scene(), jetons, 'a', 'c', { min: 0, max: 2, vue: false })).toBe('hors de portée (4 cases, 2 au plus)');
  });
  it('à distance : dans la portée, pas trop près, en vue', () => {
    const arc = { min: 1, max: 5, vue: true };
    expect(T.horsDePortee(scene(), jetons, 'a', 'c', arc)).toBeNull();
    expect(T.horsDePortee(scene([[[4, 0], [4, 10]]]), jetons, 'a', 'c', arc)).toBe('pas de ligne de vue');
    expect(T.horsDePortee(scene([[[4, 0], [4, 10]]]), jetons, 'a', 'c', { ...arc, vue: false })).toBeNull();
    expect(T.horsDePortee(scene(), [...jetons, { id: 'd', genre: 'monstre', cx: 2, cy: 2 }], 'a', 'd', arc)).toBe('trop près (0 case, 1 au moins)');
    expect(T.horsDePortee(scene(), jetons, 'a', 'c', { min: 2, max: 5, vue: true })).toBeNull();
    expect(T.horsDePortee(scene(), jetons, 'a', 'b', { min: 2, max: 5, vue: true })).toBe('trop près (1 case, 2 au moins)');
  });
  it('sans carte, sans jeton ou sans portée connue : le MJ juge', () => {
    expect(T.horsDePortee(null, jetons, 'a', 'c', T.PORTEE_CONTACT)).toBeNull();
    expect(T.horsDePortee(scene(), jetons, 'a', 'zz', T.PORTEE_CONTACT)).toBeNull();
    expect(T.horsDePortee(scene(), jetons, 'zz', 'a', T.PORTEE_CONTACT)).toBeNull();
    expect(T.horsDePortee(scene(), jetons, 'a', 'c', null)).toBeNull();
  });
  it('ligne de vue : un mur entre les centres la coupe, une porte ouverte non', () => {
    const porte = (ouverte: boolean) => ({ colonnes: 20, lignes: 20, murs: [], obstacles: [], portes: [{ id: 'p', a: [4, 0], b: [4, 10], ouverte }] }) as never;
    expect(ligneDeVue(scene(), { cx: 2, cy: 2 }, { cx: 6, cy: 2 })).toBe(true);
    expect(ligneDeVue(scene([[[4, 0], [4, 10]]]), { cx: 2, cy: 2 }, { cx: 6, cy: 2 })).toBe(false);
    expect(ligneDeVue(porte(false), { cx: 2, cy: 2 }, { cx: 6, cy: 2 })).toBe(false);
    expect(ligneDeVue(porte(true), { cx: 2, cy: 2 }, { cx: 6, cy: 2 })).toBe(true);
  });
  it('les portées des armes de monstre, en cases (1,5 m)', () => {
    expect(T.CASES_PORTEE_MONSTRE['contact +1 case (3m)']).toEqual({ min: 0, max: 2, vue: false });
    expect(T.CASES_PORTEE_MONSTRE['courte (6m)']).toEqual({ min: 0, max: 4, vue: true });
    expect(T.CASES_PORTEE_MONSTRE['moyenne (18m)'].max).toBe(12);
    expect(T.CASES_PORTEE_MONSTRE['longue (36m)'].max).toBe(24);
    expect(T.CASES_PORTEE_MONSTRE['contact (arc frontal)']).toBe(T.PORTEE_CONTACT);
    expect(T.CASES_PORTEE_MONSTRE['contact (zone adjacente)']).toBe(T.PORTEE_CONTACT);
  });
});

describe('les attaques d’un monstre (6a)', () => {
  it('les dés de l’arme et le bonus de l’attaque ; le critique de l’arme ; une arme inconnue laissée de côté', () => {
    const armes = new Map([
      ['griffes', { degats: '1d6', portee: 'contact' as const, typedegats: 'physique' as const }],
      ['arc', { degats: '1d8', portee: 'moyenne (18m)' as const, typedegats: 'magique' as const, critMin: 18 }],
    ]);
    expect(
      T.attaquesDuMonstre(
        [
          { nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, bonusDegats: 2 },
          { nom: 'Tir', armeId: 'arc', bonusAttaque: 3, bonusDegats: -1 },
          { nom: 'Morsure', armeId: 'inconnue', bonusAttaque: 9 },
        ],
        armes,
      ),
    ).toEqual([
      { nom: 'Griffes', bonus: 4, formule: '1d6+2', typeDegats: 'physique', portee: T.PORTEE_CONTACT, seuilCritique: 20, etatSurTouche: null },
      { nom: 'Tir', bonus: 3, formule: '1d8-1', typeDegats: 'magique', portee: { min: 0, max: 12, vue: true }, seuilCritique: 18, etatSurTouche: null },
    ]);
  });
});

describe('les attaques et les dégâts d’un PJ (fiches réelles)', () => {
  it('l’arme de contact, son bonus et sa portée (allonge : 2 cases)', () => {
    expect(P.attaquesDuPj(reelle('Karlach'))).toEqual([
      { mode: 'contact', nom: 'Épée longue', bonus: vueFiche(reelle('Karlach')).stats.attaque.contact, formule: '1d8', typeDegats: 'physique', portee: T.PORTEE_CONTACT, seuilCritique: 20 },
    ]);
    expect(P.attaquesDuPj(reelle('Hyrma'))[0]).toMatchObject({ nom: 'Lance', formule: '1d8', portee: { min: 1, max: 2, vue: false } });
    expect(P.attaquesDuPj(reelle('Vhorgar'))[0]!.formule).toBe('1d8+1');
  });

  it('une arme à distance : sa portée et la vue', () => {
    const k = reelle('Kargash');
    const arc = { ...objetParId.get('arc_court')!, enchantement: 1 } as never;
    const f = { ...k, equipement: { ...k.equipement, main_gauche: arc } };
    const d = P.attaquesDuPj(f).find((a) => a.mode === 'distance')!;
    expect(d).toEqual({ mode: 'distance', nom: 'Arc court', bonus: vueFiche(f).stats.attaque.distance, formule: '1+1d4+1', typeDegats: 'physique', portee: { min: 1, max: 5, vue: true }, seuilCritique: 20 });
  });

  it('la formule de l’arme (v1) : bonusDegatsTotal avant l’enchantement, l’affixe en plus', () => {
    expect(P.formuleArme({ degats: '1d8', enchantement: 2 })).toBe('1d8+2');
    expect(P.formuleArme({ degats: '1d8', enchantement: 2, bonusDegatsTotal: 3 })).toBe('1d8+3');
    expect(P.formuleArme({ degats: '1d8', bonusDegatsAffixe: 2 })).toBe('1d8+2');
    expect(P.formuleArme({ degats: '1d8', bonusDegatsTotal: -1 })).toBe('1d8-1');
    expect(P.formuleArme({ nom: 'Bâton' })).toBeNull();
  });

  it('sans arme : les poings du Moine, ou rien', () => {
    const k = reelle('Kargash');
    const nu = { ...k, equipement: { ...k.equipement, main_droite: null, main_gauche: null } };
    expect(P.attaquesDuPj(nu)).toEqual([]);
    vi.spyOn(CalculsPersonnage.prototype, 'degatsPoings').mockReturnValue('1d6+2');
    expect(P.attaquesDuPj(nu)).toEqual([{ mode: 'contact', nom: 'Poings', bonus: vueFiche(nu).stats.attaque.contact, formule: '1d6+2', typeDegats: 'physique', portee: T.PORTEE_CONTACT, seuilCritique: 20 }]);
  });

  it('les dégâts subis : la réduction de l’armure ; le don sur le physique ; la résistance naturelle sur le naturel et la chute (8a, 10a)', () => {
    const h = reelle('Hyrma');
    expect(P.degatsSurPj(h, 10, 'magique')).toEqual({ brut: 10, net: 9, detail: '10 − 1 (armure) = 9' });
    expect(P.degatsSurPj(reelle('Kargash'), 10, 'physique')).toEqual({ brut: 10, net: 10, detail: '10' });
    vi.spyOn(CalculsPersonnage.prototype, 'bonusReductionLourdeDons').mockReturnValue(3);
    vi.spyOn(CalculsPersonnage.prototype, 'reductionDegatsNaturels').mockReturnValue(4);
    expect(P.degatsSurPj(h, 10, 'physique')).toEqual({ brut: 10, net: 6, detail: '10 − 4 (armure + don) = 6' });
    expect(P.degatsSurPj(h, 10, 'magique').net).toBe(9);
    expect(P.degatsSurPj(h, 10, 'naturel')).toEqual({ brut: 10, net: 5, detail: '10 − 5 (armure + résistance naturelle) = 5' });
    expect(P.degatsSurPj(h, 10, 'chute').net).toBe(5);
    expect(P.degatsSurPj(h, 3, 'naturel').net).toBe(0);
  });
});

describe('Mourant (7a)', () => {
  it('11 ou plus réussit ; 3 réussites, il se relève (tout à zéro) ; 3 échecs, il meurt', () => {
    expect(M.jetDeMort(11, { mortSucces: 0, mortEchecs: 0 })).toEqual({ de: 11, reussi: true, mortSucces: 1, mortEchecs: 0, mort: false, issue: null });
    expect(M.jetDeMort(10, { mortSucces: 0, mortEchecs: 0 })).toEqual({ de: 10, reussi: false, mortSucces: 0, mortEchecs: 1, mort: false, issue: null });
    expect(M.jetDeMort(15, { mortSucces: 2, mortEchecs: 2 })).toEqual({ de: 15, reussi: true, mortSucces: 0, mortEchecs: 0, mort: false, issue: 'releve' });
    expect(M.jetDeMort(2, { mortSucces: 2, mortEchecs: 2 })).toEqual({ de: 2, reussi: false, mortSucces: 2, mortEchecs: 3, mort: true, issue: 'mort' });
  });

  it('5 jets au plus : l’issue tombe au plus tard au cinquième', () => {
    expect(M.JETS_DE_MORT_MAX).toBe(5);
    for (let suite = 0; suite < 32; suite++) {
      let c = { mortSucces: 0, mortEchecs: 0 };
      let n = 0;
      let issue: string | null = null;
      while (!issue) {
        const r = M.jetDeMort(suite & (1 << n) ? 15 : 5, c);
        n++;
        issue = r.issue;
        c = r;
      }
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(M.JETS_DE_MORT_MAX);
    }
  });

  it('debout, Mourant, mort ; le texte du journal', () => {
    expect(M.etatPj(5, { mort: false })).toBe('debout');
    expect(M.etatPj(0, { mort: false })).toBe('mourant');
    expect(M.etatPj(0, { mort: true })).toBe('mort');
    expect(M.etatPj(3, { mort: true })).toBe('mort');
    expect(M.texteJetDeMort(M.jetDeMort(14, { mortSucces: 1, mortEchecs: 1 }), 'Kargash')).toBe('d20 14 : réussite (2/3 réussites, 1/3 échecs)');
    expect(M.texteJetDeMort(M.jetDeMort(14, { mortSucces: 2, mortEchecs: 1 }), 'Kargash')).toBe('d20 14 : réussite. Kargash se relève à 1 PV.');
    expect(M.texteJetDeMort(M.jetDeMort(3, { mortSucces: 0, mortEchecs: 2 }), 'Kargash')).toBe('d20 3 : échec. Kargash succombe.');
  });

  it('les jets à remettre à zéro : un PJ revenu au-dessus de 0 PV', () => {
    expect(M.jetsDeMortARemettre(pj('S', { mortSucces: 1 }), 1)).toBe(true);
    expect(M.jetsDeMortARemettre(pj('S', { mortEchecs: 3, mort: true }), 4)).toBe(true);
    expect(M.jetsDeMortARemettre(pj('S', { mortEchecs: 1 }), 0)).toBe(false);
    expect(M.jetsDeMortARemettre(pj('S', { mortEchecs: 1 }), 1)).toBe(true);
    expect(M.jetsDeMortARemettre(pj('S'), 5)).toBe(false);
    expect(M.jetsDeMortARemettre(pj('S', { mortSucces: 1 }), undefined)).toBe(false);
    expect(M.jetsDeMortARemettre(monstre('A'), 5)).toBe(false);
  });

  it('le schéma : seul un PJ fait des jets de mort ; la mort au troisième échec ; un monstre a sa DEF', () => {
    const { id: _a, ...p } = pj('S');
    const { id: _b, ...m } = monstre('A');
    expect(schemaCombattant.safeParse({ ...p, mortEchecs: 3, mort: true }).success).toBe(true);
    expect(schemaCombattant.safeParse({ ...p, mortEchecs: 2, mort: true }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...m, mortSucces: 1 }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...m, def: null }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, def: 12 }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...m, resistances: { physique: 0.5 } }).success).toBe(false);
  });

  it('le journal : un détail sans dé est permis (dégâts subis), pas un jet vide', () => {
    const j = { auteurUid: 'u', auteurNom: 'Alice', libelle: 'Dégâts subis', formule: '7', des: [], bonus: 7, total: 5, creeLe: 1 };
    expect(schemaJetJournal.safeParse(j).success).toBe(false);
    expect(schemaJetJournal.safeParse({ ...j, detail: '7 − 2 (armure) = 5' }).success).toBe(true);
    expect(schemaJetJournal.safeParse({ ...j, detail: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('écritures', () => {
  const k = () => reelle('Kargash');

  it('attaquer (1b, 5a) : d20 + bonus contre la DEF, l’action principale prise, au journal', async () => {
    const a = { nom: 'Rapière', bonus: 4, seuilCritique: 20, mode: 'contact' as const };
    const i = await X.attaquer('c1', combat, pj('p1'), monstre('A'), a, k(), des(20, 9));
    expect(i).toMatchObject({ de: 9, total: 13, touche: true, critique: false });
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } }]);
    expect(journal.noterJet).toHaveBeenCalledWith('Rapière sur A', '1d20+4', { des: [9], faces: 20, bonus: 4, total: 13 }, k().nom, 'd20 9 +4 = 13 contre DEF 13 : touché');
    // Les actions déjà notées ce tour sont gardées.
    appels.length = 0;
    await X.attaquer('c1', combat, pj('p1', { tourActions: 6, secondaire: true, mvt: 3 }), monstre('A'), a, k(), des(20, 1));
    expect(appels[0]!.donnees).toEqual({ tourActions: 6, principale: true, secondaire: true, mvt: 3, sprint: false });
  });

  it('attaquer : refusé si l’action principale est prise, la cible à terre ou pas un monstre', async () => {
    const a = { nom: 'Rapière', bonus: 4, seuilCritique: 20, mode: 'contact' as const };
    await expect(X.attaquer('c1', combat, pj('p1', { tourActions: 6, principale: true }), monstre('A'), a, k())).rejects.toThrow('action principale est déjà prise');
    await expect(X.attaquer('c1', combat, pj('p1'), monstre('A', { aTerre: true, pv: 0 }), a, k())).rejects.toThrow('déjà à terre');
    await expect(X.attaquer('c1', combat, pj('p1'), pj('p2'), a, k())).rejects.toThrow('On attaque un monstre');
    // Une principale d'un autre tour ne compte pas.
    await X.attaquer('c1', combat, pj('p1', { tourActions: 5, principale: true }), monstre('A'), a, k(), des(20, 2));
    expect(appels).toHaveLength(1);
  });

  it('infliger les dégâts (2a, 3a, 10a) : lus et écrits en transaction, armure et résistance, au journal', async () => {
    base.set(`${C}/m-r1-A`, (({ id: _i, ...m }) => m)(monstre('A', { pv: 9, armure: 1, resistances: { physique: 0.5, magique: 1 } })));
    const r = await X.infligerDegats('c1', monstre('A', { pv: 14 }), { nom: 'Rapière', formule: '1d6+2', typeDegats: 'physique', critique: true }, 'Kargash', des(6, 6, 5));
    // 2d6+2 = 13 − 1 = 12 × 0,5 = 6 ; les PV lus (9), pas ceux de l'écran (14).
    expect(r).toMatchObject({ degats: { brut: 13, net: 6 }, pv: 3 });
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { pv: 3, aTerre: false } }]);
    expect(journal.noterJet).toHaveBeenCalledWith('Dégâts Rapière sur A (critique)', '2d6+2', { des: [6, 5], faces: 6, bonus: 2, total: 13 }, 'Kargash', '13 − armure 1 = 12 × 0,5 (résiste au physique) = 6 → A 3/14 PV');
  });

  it('infliger les dégâts : à 0 PV le monstre tombe ; formule illisible ou monstre parti : refusé', async () => {
    base.set(`${C}/m-r1-A`, (({ id: _i, ...m }) => m)(monstre('A', { pv: 4 })));
    const r = await X.infligerDegats('c1', monstre('A'), { nom: 'Hache', formule: '1d8', typeDegats: 'magique', critique: false }, 'K', des(8, 7));
    expect(r.pv).toBe(0);
    expect(appels[0]!.donnees).toEqual({ pv: 0, aTerre: true });
    expect(journal.noterJet.mock.calls[0]![4]).toBe('7 → A tombe');
    await expect(X.infligerDegats('c1', monstre('A'), { nom: 'x', formule: 'n', typeDegats: 'physique', critique: false }, 'K')).rejects.toThrow('illisible');
    await expect(X.infligerDegats('c1', monstre('B'), { nom: 'x', formule: '1d4', typeDegats: 'physique', critique: false }, 'K')).rejects.toThrow('plus dans le combat');
    base.set(`${C}/pj-p2`, (({ id: _i, ...p }) => p)(pj('p2')));
    await expect(X.infligerDegats('c1', pj('p2'), { nom: 'x', formule: '1d4', typeDegats: 'physique', critique: false }, 'K')).rejects.toThrow('On blesse un monstre');
  });

  const griffes = { nom: 'Griffes', bonus: 4, formule: '1d6+2', typeDegats: 'physique' as const, portee: T.PORTEE_CONTACT, seuilCritique: 20, etatSurTouche: null };

  it('attaque de monstre (6a) : contre la CA de la fiche ; raté, rien d’autre que l’action et le journal', async () => {
    const f = k();
    const ca = vueFiche(f).stats.ca;
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes, pj('p1'), f, des(20, ca - 4 - 1));
    expect(r.net).toBeNull();
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/m-r1-A`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } }]);
    expect(journal.noterJet).toHaveBeenCalledTimes(1);
    expect(journal.noterJet.mock.calls[0]![4]).toBe(`d20 ${ca - 5} +4 = ${ca - 1} contre CA ${ca} : raté`);
  });

  it('attaque de monstre : touché, les dégâts après la réduction du PJ ôtés de sa fiche ; critique, dés doublés ; à 0, Mourant', async () => {
    const h = reelle('Hyrma');
    const v = vueFiche(h);
    const alea = suite([20, 20], [6, 6], [4, 6]);
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes, pj('p1', { perso: 'p1' }), h, alea);
    // 2d6+2 = 12, − 1 d'armure = 11.
    expect(r).toMatchObject({ issue: { critique: true }, net: 11, pv: Math.max(0, v.pv.actuel - 11) });
    expect(appels[1]).toEqual({ fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { pvActuel: Math.max(0, v.pv.actuel - 11) } });
    expect(journal.noterJet.mock.calls[1]!.slice(0, 2)).toEqual(['Dégâts Griffes sur Hyrma (critique)', '2d6+2']);
    expect(journal.noterJet.mock.calls[1]![4]).toBe(`12 − 1 (armure) = 11 → Hyrma ${v.pv.actuel - 11}/${v.pv.max} PV`);
    appels.length = 0;
    journal.noterJet.mockClear();
    const presque = { ...h, pvActuel: 2 };
    const r2 = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes, pj('p1', { perso: 'p1' }), presque, suite([19, 20], [1, 6]));
    expect(r2.pv).toBe(0);
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/→ Hyrma 0\/\d+ PV, Mourant$/);
  });

  it('attaque de monstre : refusée hors d’un monstre, contre autre chose qu’un PJ du combat, ou l’action prise', async () => {
    const f = k();
    await expect(X.attaqueDeMonstre('c1', combat, pj('p2'), griffes, pj('p1'), f)).rejects.toThrow('Seul un monstre');
    await expect(X.attaqueDeMonstre('c1', combat, monstre('A'), griffes, pj('autre'), f)).rejects.toThrow('PJ du combat');
    await expect(X.attaqueDeMonstre('c1', combat, monstre('A'), griffes, monstre('B'), f)).rejects.toThrow('PJ du combat');
    await expect(X.attaqueDeMonstre('c1', combat, monstre('A', { tourActions: 6, principale: true }), griffes, pj('p1'), f)).rejects.toThrow('action principale');
    expect(appels).toEqual([]);
  });

  it('subir des dégâts (8a) : après réduction, ôtés de la fiche, jamais sous 0 ; au journal sans dé', async () => {
    const h = reelle('Hyrma');
    const v = vueFiche(h);
    expect(await X.subirDegats(h, 7, 'physique')).toEqual({ net: 6, pv: v.pv.actuel - 6 });
    expect(appels).toEqual([{ fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: { pvActuel: v.pv.actuel - 6 } }]);
    expect(journal.noterJet).toHaveBeenCalledWith('Dégâts subis (physique)', '7', { des: [], faces: 0, bonus: 7, total: 6 }, 'Hyrma', `7 − 1 (armure) = 6 → ${v.pv.actuel - 6}/${v.pv.max} PV`);
    expect((await X.subirDegats(h, 999, 'magique')).pv).toBe(0);
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/, Mourant$/);
    await expect(X.subirDegats(h, -1, 'physique')).rejects.toThrow('Donne un nombre');
    await expect(X.subirDegats(h, Number.NaN, 'physique')).rejects.toThrow('Donne un nombre');
  });

  it('jet de mort (7a) : l’action principale ; une réussite de plus ; refusé debout ou déjà fait', async () => {
    const f = { ...k(), pvActuel: 0 };
    const i = await X.lancerJetDeMort('c1', combat, pj('p1', { mortSucces: 1 }), f, des(20, 12));
    expect(i.issue).toBeNull();
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false, mortSucces: 2, mortEchecs: 0, mort: false } }]);
    expect(journal.noterJet).toHaveBeenCalledWith('Jet de mort', '1d20', { des: [12], faces: 20, bonus: 0, total: 12 }, f.nom, 'd20 12 : réussite (2/3 réussites, 0/3 échecs)');
    await expect(X.lancerJetDeMort('c1', combat, pj('p1'), k(), des(20, 12))).rejects.toThrow('pas Mourant');
    await expect(X.lancerJetDeMort('c1', combat, pj('p1', { mortEchecs: 3, mort: true }), f)).rejects.toThrow('pas Mourant');
    await expect(X.lancerJetDeMort('c1', combat, pj('p1', { tourActions: 6, principale: true }), f)).rejects.toThrow('action principale');
  });

  it('jet de mort : la troisième réussite le relève à 1 PV ; le troisième échec le tue', async () => {
    const f = { ...k(), pvActuel: 0 };
    await X.lancerJetDeMort('c1', combat, pj('p1', { mortSucces: 2, mortEchecs: 2 }), f, des(20, 20));
    expect(appels.map((a) => [a.chemin, a.donnees])).toEqual([
      [`${C}/pj-p1`, expect.objectContaining({ mortSucces: 0, mortEchecs: 0, mort: false })],
      ['tables/t1/persos/p1', { pvActuel: 1 }],
    ]);
    appels.length = 0;
    await X.lancerJetDeMort('c1', combat, pj('p1', { mortEchecs: 2 }), f, des(20, 3));
    expect(appels).toEqual([{ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: expect.objectContaining({ mortEchecs: 3, mort: true }) }]);
  });

  it('relever un allié Mourant (7a) : l’action principale, l’allié à 1 PV ; refusé s’il est debout ou mort', async () => {
    const h = { ...reelle('Hermione', 'p2'), pvActuel: 0 };
    await X.releverAllie('c1', combat, pj('p1'), pj('p2', { mortEchecs: 1 }), h, 'Kargash');
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } },
      { fn: 'lot.update', chemin: 'tables/t1/persos/p2', donnees: { pvActuel: 1 } },
    ]);
    expect(journal.noterJet).toHaveBeenCalledWith('Relève Hermione', '1', { des: [], faces: 0, bonus: 1, total: 1 }, 'Kargash', 'Kargash relève Hermione : 1 PV.');
    await expect(X.releverAllie('c1', combat, pj('p1'), pj('p2'), reelle('Hermione', 'p2'), 'K')).rejects.toThrow('pas besoin');
    await expect(X.releverAllie('c1', combat, pj('p1'), pj('p2', { mortEchecs: 3, mort: true }), h, 'K')).rejects.toThrow('pas besoin');
    await expect(X.releverAllie('c1', combat, pj('p1'), pj('p3'), h, 'K')).rejects.toThrow('PJ du combat');
    await expect(X.releverAllie('c1', combat, pj('p1', { tourActions: 6, principale: true }), pj('p2'), h, 'K')).rejects.toThrow('action principale');
  });

  it('boire une potion (9a) : une de moins, les PV rendus, l’action secondaire ; refusé si elle est prise', async () => {
    const f = { ...k(), pvActuel: 10 };
    const [cle] = Object.entries(f.inventaire).find(([, o]) => o.id === 'potion_soin_sup')!;
    const soin = await X.boirePotion('c1', combat, pj('p1', { tourActions: 6, principale: true }), f, cle, des(8, 5));
    expect(soin).toBe(5);
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: 'tables/t1/persos/p1', donnees: expect.objectContaining({ pvActuel: 15 }) },
      { fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { tourActions: 6, principale: true, secondaire: true, mvt: 0, sprint: false } },
    ]);
    expect(journal.noterJet).toHaveBeenCalledWith('Potion de soin améliorée', '1d8', expect.objectContaining({ total: 5 }), f.nom, `5 PV rendus → 15/${f.pvMax} PV`);
    await expect(X.boirePotion('c1', combat, pj('p1', { tourActions: 6, secondaire: true }), f, cle)).rejects.toThrow('secondaire est déjà prise');
    await expect(X.boirePotion('c1', combat, pj('p1'), f, 'absente')).rejects.toBeInstanceOf((await import('../../src/lib/actions/combat')).RefusCombat);
  });

  it('MJ : remettre les jets de mort à zéro', async () => {
    await X.remettreJetsDeMort('c1', pj('p1', { mortSucces: 2 }));
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/pj-p1`, donnees: { mortSucces: 0, mortEchecs: 0, mort: false } }]);
  });
});
