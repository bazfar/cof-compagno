import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Concentration et invocations (lot L6.4b2, décisions de Thomas du
 * 24/10/2026) : 1a (ce qui rompt la concentration ; une attaque qui touche
 * un PJ concentré : sauvegarde de CON), 2a (maintien au début du tour), 3a
 * (tout ce que le lancer a posé s'en va), 4a (poser d'un clic, 6 cases),
 * 5a et 6a (initiative : un jet par lancer), 7a (son tour : attaque,
 * capacités), 8a et 15a (Remous), 9a (rounds, 0 PV), 10a (chiffres), 11a
 * (qui écrit).
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
const X = await import('../../src/lib/actions/attaques');
const A = await import('../../src/lib/actions/combat');
const F = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const AI = await import('../../src/lib/actions/invocations');
const AZ = await import('../../src/lib/actions/zones');
const CH = await import('../../src/lib/combat/changements');
const CA = await import('../../src/lib/combat/carte');
const CI = await import('../../src/lib/combat/invocations');
const CC = await import('../../src/lib/combat/concentration');
const O = await import('../../src/lib/combat/ordre');
const { schemaCombattant } = await import('../../src/lib/schemas/combat');
const { classeParId } = await import('../../src/regles');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type ZoneSol = import('../../src/lib/schemas/zones').ZoneSol;
type ZoneActive = import('../../src/lib/combat/zones-sol').ZoneActive;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;

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
  sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15, de: 12, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  sauvegardes: { FOR: 1, DEX: 2, CON: 1, Volonte: 0 }, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
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

/** Une zone : une case en (5, 5) par défaut, du MJ, sans rien. */
const zone = (z: Partial<ZoneSol> = {}, id = 'z1'): ZoneActive => ({
  id, nom: 'Zone', nature: null, cases: [{ dx: 0, dy: 0 }], ancre: { cx: 5, cy: 5 }, lanceur: null, camp: null, filtre: 'tous', quand: null, sort: null, danger: null, dd: null, texte: null,
  usageUnique: false, cachee: false, rounds: null, declenchements: {}, creeLe: 1, ...z,
});
const j = (id: string, cx: number, cy: number, genre: 'pj' | 'monstre' = 'monstre') => ({ id, genre, cx, cy });
const Z0 = 'tables/t1/combats/c1/zones';

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  session.etape = 'joueur';
  journal.noterJet.mockClear();
});

/** Une invocation du combat : un Tison de Shyrion. */
const invoc = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  ...monstre(id),
  id: `i-${id}`,
  genre: 'invocation',
  nom: id,
  uid: 'u-p1',
  monstre: null,
  sauvegardes: null,
  pv: 27,
  pvMax: 27,
  def: 15,
  maitre: 'pj-p1',
  invocation: { creature: 'serviteur.feu', element: 'feu', attaque: { bonus: 7, des: '1d8+3', typeDegats: 'feu' }, objet: false, remous: 1, rounds: null, lancer: 't3' },
  ...c,
});
/** Un Magicien qui a appris Fascination par grimoire (Initié). */
const fascinateur = (): FicheV2 & { id: string } => {
  const f = mageN('evocation', 2);
  return { ...f, octrois: { ...f.octrois, verbes: [{ id: 'enchantement.fascination', maitrise: 'initie' }] } };
};
const maitreAuLancer = { niveau: 9, modMagie: 3, attaqueMagique: 7, def: 14, pvActuel: 31, modInit: 2 };
const conc = (c: Partial<Combattant['concentration'] & object> = {}) => ({
  action: 'enchantement.fascination', nom: 'Fascination', lancer: 't3', maintien: 1, rupture: ['cibleAttaquee', 'lanceurSurpris', 'autreConcentration'] as ('cibleAttaquee' | 'lanceurSurpris' | 'lanceurAttaque' | 'autreConcentration')[],
  rounds: null, etats: [{ cible: 'm-r1-a', etat: 'fascine' }], zone: null, invocations: [] as string[], ...c,
});
const etat = (id: string) => ({ id, rounds: null, cumul: 1, charges: null, des: null, source: 'Shyrion' });

describe('les invocations en calcul (10a, 13b, 5a, 6a, 9a, 15a)', () => {
  it('10a : leurs chiffres d’après le maître (serviteur, Bornier, Illusion vivante, barricade)', () => {
    const inv = (id: string) => [...(function* () {})()].length === 0 && (CI.chiffresInvocation as never, id);
    void inv;
    const de = (id: string) => CI.invocationEnJeu({ creature: id, nom: id, element: null, ids: ['x'], rounds: null, portee: 6 }, maitreAuLancer, 't3')!;
    expect(de('serviteur.feu')).toEqual({ enJeu: { creature: 'serviteur.feu', element: null, attaque: { bonus: 7, des: '1d8+3', typeDegats: 'feu' }, objet: false, remous: 1, rounds: null, lancer: 't3' }, pv: 27, def: 15, mvt: 6 });
    expect(de('serviteur.terre').pv).toBe(40);
    expect(de('serviteur.electricite').mvt).toBe(12);
    expect(de('double_illusoire')).toMatchObject({ pv: 15, def: 14, enJeu: { attaque: null, objet: false, remous: 0 } });
    expect(de('barricade')).toMatchObject({ pv: 19, def: 0, mvt: 0, enJeu: { objet: true } });
    expect(de('arme_spirituelle').enJeu.attaque).toEqual({ bonus: 7, des: '1d8', typeDegats: 'magique' });
    expect(CI.invocationEnJeu({ creature: 'zombie', nom: 'Zombie', element: null, ids: ['x'], rounds: 2, portee: 6 }, { ...maitreAuLancer, modMagie: -1 }, 't3')!.enJeu).toMatchObject({ attaque: { des: '1d6-1' }, remous: 1, rounds: 2 });
    expect(CI.invocationEnJeu({ creature: 'inconnue', nom: 'x', element: null, ids: ['x'], rounds: null, portee: 6 }, maitreAuLancer, 't3')).toBeNull();
    // Bornés : 1 PV au moins (une Illusion vivante d'un mage à 1 PV).
    expect(de('double_illusoire') && CI.invocationEnJeu({ creature: 'double_illusoire', nom: 'x', element: null, ids: ['x'], rounds: null, portee: 6 }, { ...maitreAuLancer, pvActuel: 1 }, 't3')!.pv).toBe(1);
    expect(CI.invocationEnJeu({ creature: 'serviteur.feu', nom: 'x', element: null, ids: ['x'], rounds: null, portee: 6 }, { ...maitreAuLancer, attaqueMagique: 60 }, 't3')!.enJeu.attaque!.bonus).toBe(40);
  });

  it('13b, 6a, 9a : ce qu’un lancer appelle : une entrée par créature, ses identifiants, ses rounds', () => {
    const r = CI.invocationsDuLancer(
      [
        { type: 'invocation', creature: 'embrun', nombre: 3, duree: { rounds: 3 } },
        { type: 'terrain', nature: 'glissant', duree: 'finCombat' },
        { type: 'invocation', creature: 'serviteur.feu', nombre: 1, duree: 'finCombat', element: 'feu' },
        { type: 'invocation', creature: 'inconnue', nombre: 1, duree: 'finCombat' },
      ],
      'pj-p1',
      't6',
    );
    expect(r).toEqual([
      { creature: 'embrun', nom: 'Embrun', element: null, ids: ['i-p1-t6-1', 'i-p1-t6-2', 'i-p1-t6-3'], rounds: 3, portee: 6 },
      { creature: 'serviteur.feu', nom: 'Tison', element: 'feu', ids: ['i-p1-t6-4'], rounds: null, portee: 6 },
    ]);
    expect(CI.invocationsDuLancer([{ type: 'invocation', creature: 'familier', nombre: 9, duree: 'scene' }], 'pj-p1', 't1')[0]!.ids).toHaveLength(5);
    expect(CI.roundsInvocation('prochainTour')).toBe(1);
    expect(CI.PORTEE_INVOCATION).toBe(6);
  });

  it('15a, 9a : le Remous du maître ; ses invocations perdent un round à la fin de son tour', () => {
    const cs = [pj('p1'), invoc('a'), invoc('b', { invocation: { ...invoc('b').invocation!, remous: 2, rounds: 2 } }), invoc('c', { invocation: { ...invoc('c').invocation!, remous: 0, rounds: 1 } }), invoc('d', { maitre: 'pj-p2' }), monstre('x')];
    expect(CI.invocationsDe(cs, 'pj-p1').map((c) => c.id)).toEqual(['i-a', 'i-b', 'i-c']);
    expect(CI.remousDu(cs, 'pj-p1')).toBe(3);
    expect(CI.remousDu(cs, 'pj-p9')).toBe(0);
    const f = CI.finDeTourInvocations(cs, 'pj-p1');
    expect(f.maj).toEqual([{ id: 'i-b', invocation: { ...cs[2]!.invocation!, rounds: 1 } }]);
    expect(f.retirer).toEqual(['i-c']);
    expect(CI.texteInvocation(cs[2]!)).toBe('b (2)');
    expect(CI.texteInvocation(cs[1]!)).toBe('a');
  });

  it('7a : les capacités qui ont des effets se jouent sur un allié ; les autres se lisent ; la portée de son attaque', () => {
    const familier = CI.capacitesDe('familier');
    expect(familier.map((c) => [c.nom, !!c.effets])).toEqual([['Aide', true], ['Éclaireur', false]]);
    expect(familier[0]!.effets!('pj-p2')).toEqual([{ type: 'bonus', cible: 'pj-p2', sur: 'prochainJet', valeur: 2, duree: 'finCombat' }]);
    expect(CI.capacitesDe('serviteur.eau')[0]!.effets!('pj-p2')).toEqual([{ type: 'retraitEtat', cible: 'pj-p2', etats: [], nombre: 1 }]);
    expect(CI.capacitesDe('serviteur.glace')[0]!.effets).toBeNull();
    expect(CI.capacitesDe('inconnue')).toEqual([]);
    expect(CI.porteeInvocation('squelette')).toEqual({ min: 0, max: 10, vue: true });
    expect(CI.porteeInvocation('zombie')).toEqual({ min: 0, max: 1, vue: false });
  });

  it('13b : le combattant d’une invocation : son maître, ses chiffres, le joueur qui la joue ; seul un PJ se concentre', () => {
    const sansId = (c: Combattant & { id: string }) => (({ id: _i, ...x }) => x)(c);
    expect(schemaCombattant.safeParse(sansId(invoc('a'))).success).toBe(true);
    expect(schemaCombattant.safeParse(sansId(invoc('a', { maitre: null }))).success).toBe(false);
    expect(schemaCombattant.safeParse(sansId(invoc('a', { invocation: null }))).success).toBe(false);
    expect(schemaCombattant.safeParse(sansId(invoc('a', { monstre: 'goule' }))).success).toBe(false);
    expect(schemaCombattant.safeParse(sansId(invoc('a', { uid: null }))).success).toBe(false);
    expect(schemaCombattant.safeParse(sansId(monstre('a', { maitre: 'pj-p1' }))).success).toBe(false);
    expect(schemaCombattant.safeParse(sansId(pj('p1', { concentration: conc() }))).success).toBe(true);
    expect(schemaCombattant.safeParse(sansId(monstre('a', { concentration: conc() }))).success).toBe(false);
    // Sans les champs de L6.4b2 (un combat d'avant) : ils valent null.
    const { maitre: _m, invocation: _i, concentration: _c, ...ancien } = sansId(pj('p1'));
    expect(schemaCombattant.parse(ancien)).toMatchObject({ maitre: null, invocation: null, concentration: null });
  });

  it('13b, 10a : dans le camp des PJ ; à 0 PV son tour est sauté ; le moteur la lit comme un monstre', () => {
    expect(O.campDe(invoc('a'))).toBe('pj');
    expect(O.campDe(monstre('a'))).toBe('monstre');
    expect([...O.aTerreDuCombat([invoc('a', { aTerre: true }), invoc('b'), pj('p1', { aTerre: true }), monstre('m', { aTerre: true })])]).toEqual(['i-a', 'm-r1-m']);
    expect(S.campPermis(invoc('a'), 'allie')).toBe(true);
    expect(S.campPermis(invoc('a'), 'ennemi')).toBe(false);
    expect(S.cibleDe(invoc('a'), null, 2)).toMatchObject({ id: 'i-a', camp: 'pj', def: 15, pv: 27, sauvegardes: { FOR: 0, DEX: 0, CON: 0, Volonte: 0 }, boss: false });
    // Ses PV en chiffres : un sort la blesse comme un monstre ; la carte les montre.
    const e = CH.appliquerChangements([{ type: 'degats', cible: 'i-a', montant: 5, typeDegats: 'physique', calcul: '5' }], new Map([['i-a', { c: invoc('a'), fiche: null }]]), { id: 'pj-p1', nom: 'S', fiche: null });
    expect(e.combattants.get('i-a')).toEqual({ pv: 22, aTerre: false });
    expect(CA.combatSurCarte({ statut: 'encours', actif: 'pj-p1', tour: 6, scene: 'cave' }, [invoc('a')], 'cave', 'mj', 'bob').pvMonstres.get('i-a')).toEqual({ actuel: 27, max: 27 });
  });

  it('13b : elle déclenche les zones des monstres comme un PJ ; un coup la blesse ; le MJ règle ses PV', async () => {
    const piege = zone({ quand: 'entree', filtre: 'ennemis', camp: 'monstre', lanceur: 'm-r1-x', texte: 'Un piège' }, 'p');
    const ctx = { lieu: { combat: 'c1' }, zones: [piege], jetons: [{ id: 'i-a', genre: 'invocation' as const, cx: 3, cy: 5 }], combat: null, combattants: [], fiches: new Map(), auteur: 'MJ' };
    expect(await AZ.apresDeplacement(ctx, { id: 'i-a', de: { cx: 3, cy: 5 }, vers: { cx: 6, cy: 5 } })).toBe(1);
    enBase(invoc('a'));
    expect(await AZ.apresDeplacement({ ...ctx, combat: { id: 'c1', tour: 6 }, combattants: [invoc('a')], jetons: [{ id: 'i-a', genre: 'monstre' as const, cx: 3, cy: 5 }] }, { id: 'i-a', de: { cx: 3, cy: 5 }, vers: { cx: 6, cy: 5 } })).toBe(1);
    appels.length = 0;
    expect(await X.blesser('c1', invoc('a'), null, { des: [4], faces: 6, bonus: 0, total: 4 }, '1d6', 'physique', 'Collision', 'K')).toBe(4);
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${C}/i-a`, donnees: { pv: 23, aTerre: false } }]);
    appels.length = 0;
    expect(await A.ajusterPvMonstre('c1', 'cave', invoc('a'), -5)).toBe(22);
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/i-a`, donnees: { pv: 22, aTerre: false } }]);
  });
});

describe('la concentration en calcul (1a, 2a, 3a)', () => {
  it('ce qu’un lancer maintient : ses états, sa zone, ses invocations, son maintien, ses rounds', () => {
    const a = (p: object) => ({ id: 'x.sort', nom: 'Sort', persistance: { type: 'concentration' as const, rupture: ['autreConcentration' as const], ...p } });
    const ch = [{ type: 'etat' as const, cible: 'm-r1-a', etat: 'fascine', duree: 'finCombat' as const }, { type: 'degats' as const, cible: 'm-r1-a', montant: 3, typeDegats: 'feu', calcul: '3' }];
    expect(CC.concentrationDuLancer(a({ duree: 'finCombat', maintien: 1 }) as never, 't3', ch, null, [])).toEqual({ action: 'x.sort', nom: 'Sort', lancer: 't3', maintien: 1, rupture: ['autreConcentration'], rounds: null, etats: [{ cible: 'm-r1-a', etat: 'fascine' }], zone: null, invocations: [] });
    expect(CC.concentrationDuLancer(a({ duree: { rounds: 3 } }) as never, 't3', [], 'z9', ['i-p1-t3-1'])).toMatchObject({ maintien: 0, rounds: 3, zone: 'z9', invocations: ['i-p1-t3-1'] });
    expect(CC.concentrationDuLancer(a({ duree: 'prochainTour' }) as never, 't3', [], null, [])!.rounds).toBe(1);
    expect(CC.concentrationDuLancer(a({}) as never, 't3', [], null, [])!.rounds).toBeNull();
    expect(CC.concentrationDuLancer({ id: 'y', nom: 'Y', persistance: { type: 'duree', rupture: [] } } as never, 't3', ch, null, [])).toBeNull();
    expect(CC.texteConcentration(conc({ rounds: 2 }))).toBe('Fascination (2) · 1 PP par round');
    expect(CC.texteConcentration(conc({ maintien: 0 }))).toBe('Fascination');
  });

  it('3a : ce qui s’en va avec elle ; 1a : ce qu’une attaque rompt ; le DD du jet ; son décompte', () => {
    const g = monstre('a', { etats: [etat('fascine'), etat('renverse')] });
    const autre = monstre('b', { etats: [etat('renverse')] });
    const c = conc({ etats: [{ cible: 'm-r1-a', etat: 'fascine' }, { cible: 'm-r1-b', etat: 'fascine' }, { cible: 'absent', etat: 'fascine' }], zone: 'z1', invocations: ['i-a', 'i-absente'] });
    const fin = CC.finDeConcentration(c, [g, autre, invoc('a')]);
    expect([...fin.etats]).toEqual([['m-r1-a', [etat('renverse')]]]);
    expect(fin.zone).toBe('z1');
    expect(fin.invocations).toEqual(['i-a']);
    // Deux états du même lancer sur une même cible.
    const deux = CC.finDeConcentration(conc({ etats: [{ cible: 'm-r1-a', etat: 'fascine' }, { cible: 'm-r1-a', etat: 'renverse' }] }), [g]);
    expect(deux.etats.get('m-r1-a')).toEqual([]);
    const lanceur = pj('p1', { concentration: conc() });
    const sansRupture = pj('p2', { concentration: conc({ rupture: ['autreConcentration'] }) });
    expect(CC.rompuesParAttaque([lanceur, sansRupture, g], 'm-r1-a').map((x) => x.id)).toEqual(['pj-p1']);
    expect(CC.rompuesParAttaque([lanceur], 'm-r1-b')).toEqual([]);
    expect(CC.ddConcentration(0)).toBe(10);
    expect(CC.ddConcentration(21)).toBe(10);
    expect(CC.ddConcentration(23)).toBe(11);
    expect(CC.finDeTourConcentration(conc())).toBeNull();
    expect(CC.finDeTourConcentration(conc({ rounds: 2 }))).toEqual({ rounds: 1 });
    expect(CC.finDeTourConcentration(conc({ rounds: 1 }))).toBe('fin');
  });
});

describe('poser et retirer les invocations (4a, 9a, 13b)', () => {
  const carte = { scene: { ...(scene() as object), infranchissables: new Set(['4,4']) } as never, jetons: [j('pj-p1', 2, 2, 'pj'), j('m-r1-a', 3, 3)] };
  it('4a : une case libre, sur la carte, à 6 cases au plus du mage', () => {
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 8, cy: 2 }, 6)).toBeNull();
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 9, cy: 2 }, 6)).toBe('6 cases au plus');
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 8, cy: 8 }, 6)).toBeNull();
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 3, cy: 3 }, 6)).toBe('case prise');
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 2, cy: 2 }, 6)).toBe('case prise');
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 4, cy: 4 }, 6)).toBe('case infranchissable');
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: -1, cy: 2 }, 6)).toBe('hors de la carte');
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p1', { cx: 2, cy: 10 }, 9)).toBe('hors de la carte');
    expect(AI.placementPermis(carte.scene, carte.jetons, 'pj-p9', { cx: 2, cy: 3 }, 6)).toBe('ton jeton n’est pas sur la carte');
  });

  it('13b, 5a : le combattant (son initiative, ses chiffres), puis son jeton, au joueur', async () => {
    const a = { creature: 'serviteur.feu', nom: 'Tison', element: 'feu', ids: ['i-p1-t6-1'], rounds: null, portee: 6, maitre: maitreAuLancer, de: 11, lancer: 't6' };
    await AI.poserInvocation('c1', combat, pj('p1'), a, 'i-p1-t6-1', { cx: 4, cy: 2 }, carte);
    expect(appels.map((x) => [x.fn, x.chemin])).toEqual([['setDoc', `${C}/i-p1-t6-1`], ['setDoc', 'tables/t1/scenes/cave/jetons/i-p1-t6-1']]);
    expect(appels[0]!.donnees).toMatchObject({ genre: 'invocation', nom: 'Tison', uid: 'u-p1', perso: null, maitre: 'pj-p1', initiative: 13, de: 11, modInit: 2, pv: 27, pvMax: 27, def: 15, mvtBase: 6, invocation: { creature: 'serviteur.feu', element: 'feu', remous: 1, lancer: 't6' } });
    expect(appels[1]!.donnees).toMatchObject({ genre: 'invocation', nom: 'Tison', couleur: AI.COULEUR_INVOCATION, cx: 4, cy: 2, proprietaire: 'u-p1' });
    await expect(AI.poserInvocation('c1', combat, pj('p1'), a, 'x', { cx: 3, cy: 3 }, carte)).rejects.toThrow('Tison : case prise.');
    await expect(AI.poserInvocation('c1', combat, monstre('z', { id: 'pj-p1' } as never), a, 'x', { cx: 4, cy: 2 }, carte)).rejects.toThrow('Seul un PJ appelle une créature.');
    await expect(AI.poserInvocation('c1', combat, pj('p1'), { ...a, creature: 'inconnue' }, 'x', { cx: 4, cy: 2 }, carte)).rejects.toThrow('Créature inconnue : inconnue.');
  });

  it('9a, 15a : retirer des invocations : leur combattant et leur jeton ; au journal', async () => {
    await AI.retirerInvocations('c1', 'cave', [invoc('a'), invoc('b')], 'à 0 PV, elles retournent à la Mer', 'MJ');
    expect(appels.map((x) => [x.fn, x.chemin])).toEqual([
      ['lot.delete', `${C}/i-a`], ['lot.delete', 'tables/t1/scenes/cave/jetons/i-a'], ['lot.delete', `${C}/i-b`], ['lot.delete', 'tables/t1/scenes/cave/jetons/i-b'],
    ]);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('a, b : à 0 PV, elles retournent à la Mer.');
    appels.length = 0;
    await AI.retirerInvocations('c1', 'cave', [], 'x', 'MJ');
    expect(appels).toEqual([]);
    expect(journal.noterJet).toHaveBeenCalledTimes(1);
  });
});

describe('finir une concentration (1a, 2a, 3a, ajout de Thomas)', () => {
  it('3a : elle tombe ; les états de son lancer, sa zone et ses invocations s’en vont ; au journal', async () => {
    const g = monstre('a', { etats: [etat('fascine')] });
    const l = pj('p1', { concentration: conc({ zone: 'z1', invocations: ['i-a'] }) });
    await AI.finirConcentration('c1', 'cave', l, [l, g, invoc('a')], 'il y met fin', 'Shyrion');
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { concentration: null } },
      { fn: 'lot.update', chemin: `${C}/m-r1-a`, donnees: { etats: [] } },
      { fn: 'lot.delete', chemin: `${Z0}/z1` },
      { fn: 'lot.delete', chemin: `${C}/i-a` },
      { fn: 'lot.delete', chemin: 'tables/t1/scenes/cave/jetons/i-a' },
    ]);
    expect(journal.noterJet.mock.calls[0]!.slice(0, 1)).toEqual(['Concentration : Fascination']);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('p1 perd sa concentration (il y met fin).');
    appels.length = 0;
    await AI.finirConcentration('c1', 'cave', pj('p1'), [], 'x', 'MJ');
    expect(appels).toEqual([]);
  });

  it('1a : une attaque contre la cible d’une Fascination la rompt', async () => {
    const g = monstre('a', { etats: [etat('fascine')] });
    const l = pj('p1', { concentration: conc() });
    expect(await AI.rompreParAttaque('c1', 'cave', 'm-r1-a', [l, g], 'Karlach')).toBe(1);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('p1 perd sa concentration (a est attaqué).');
    expect(await AI.rompreParAttaque('c1', 'cave', 'm-r1-b', [l, g], 'Karlach')).toBe(0);
  });

  it('ajout de Thomas : touché, le PJ concentré fait une sauvegarde de CON, DD 10 ou la moitié des dégâts', async () => {
    const f = mage();
    const con = S.sauvegardesDuPj(f).CON;
    const l = pj('p1', { concentration: conc() });
    expect(await AI.maintenirConcentration('c1', 'cave', l, f, 24, [l], 'Goule', suite([12 - con, 20]))).toBe(true);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('sauvegarde de CON 12 contre DD 12 : maintenue');
    expect(appels).toEqual([]);
    expect(await AI.maintenirConcentration('c1', 'cave', l, f, 4, [l], 'Goule', suite([9 - con, 20]))).toBe(false);
    expect(journal.noterJet.mock.calls[1]![4]).toBe('sauvegarde de CON 9 contre DD 10 : rompue');
    expect(appels).toContainEqual({ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { concentration: null } });
    // Un bonus de sauvegarde compte.
    expect(await AI.maintenirConcentration('c1', 'cave', pj('p1', { concentration: conc(), bonus: [{ sur: 'CON', valeur: 1, rounds: null, consomme: false, typeDegats: null, source: null }] }), f, 4, [l], 'Goule', suite([9 - con, 20]))).toBe(true);
    // Sans concentration : rien à lancer.
    expect(await AI.maintenirConcentration('c1', 'cave', pj('p1'), f, 4, [], 'Goule')).toBe(true);
    expect(journal.noterJet).toHaveBeenCalledTimes(4);
  });

  it('2a, 15a : au début de son tour, le mage paie le maintien puis le Remous ; sans de quoi payer, ça s’arrête', async () => {
    const f = { ...mage(), ppActuel: 3 };
    const l = pj('p1', { concentration: conc() });
    const cs = [l, invoc('a'), invoc('b')];
    expect(await AI.payerDebutDeTour('c1', 'cave', l, f, cs)).toBe(3);
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: 'tables/t1/persos/p1', donnees: { ppActuel: 0 } }]);
    expect(journal.noterJet.mock.calls.map((c) => c[4])).toEqual(['p1 paie 1 PP pour maintenir Fascination.', 'p1 paie 2 PP de Remous pour ses invocations.']);
    appels.length = 0;
    journal.noterJet.mockClear();
    // 2 PP : le maintien passe, le Remous non : les invocations s'en vont.
    expect(await AI.payerDebutDeTour('c1', 'cave', l, { ...f, ppActuel: 2 }, cs)).toBe(1);
    expect(appels.filter((a) => a.fn === 'lot.delete').map((a) => a.chemin)).toEqual([`${C}/i-a`, 'tables/t1/scenes/cave/jetons/i-a', `${C}/i-b`, 'tables/t1/scenes/cave/jetons/i-b']);
    expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: 'tables/t1/persos/p1', donnees: { ppActuel: 1 } });
    appels.length = 0;
    // 0 PP : la concentration tombe, le Remous non plus.
    expect(await AI.payerDebutDeTour('c1', 'cave', l, { ...f, ppActuel: 0 }, cs)).toBe(0);
    expect(appels.some((a) => a.chemin === `${C}/pj-p1` && JSON.stringify(a.donnees) === '{"concentration":null}')).toBe(true);
    expect(appels.some((a) => a.fn === 'updateDoc')).toBe(false);
    // Juste de quoi payer le maintien.
    appels.length = 0;
    expect(await AI.payerDebutDeTour('c1', 'cave', l, { ...f, ppActuel: 1 }, [l])).toBe(1);
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: 'tables/t1/persos/p1', donnees: { ppActuel: 0 } }]);
    // Ni maintien ni Remous, ou pas de fiche de la refonte : rien.
    appels.length = 0;
    expect(await AI.payerDebutDeTour('c1', 'cave', pj('p1'), f, [pj('p1')])).toBe(0);
    expect(await AI.payerDebutDeTour('c1', 'cave', l, null, cs)).toBe(0);
    expect(await AI.payerDebutDeTour('c1', 'cave', l, v1('Shyrion'), cs)).toBe(0);
    expect(appels).toEqual([]);
  });
});

describe('le tour d’une invocation (7a, 14a)', () => {
  const tour = { tour: 6, actif: 'i-a' };
  it('elle attaque un monstre à l’attaque magique du maître ; ses dés, après l’armure et la résistance ; l’élément au MJ', async () => {
    const g = monstre('a', { def: 13, armure: 1 });
    enBase(g);
    const r = await AI.attaqueDInvocation('c1', tour, invoc('a'), g, suite([10, 20], [5, 8]));
    expect(r).toMatchObject({ issue: { total: 17, def: 13, touche: true }, net: 7 });
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 7, aTerre: false } },
      { fn: 'tx.update', chemin: `${C}/i-a`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } },
    ]);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('d20 10 +7 = 17 contre DEF 13 : touché ; dégâts 8 (5) ; 7 dégâts feu (8 − armure 1 = 7) → a 7/14 PV ; MJ : effet de l’élément feu');
    appels.length = 0;
    // Ratée : rien sur le monstre, l'action est prise.
    const rate = await AI.attaqueDInvocation('c1', tour, invoc('a', { invocation: { ...invoc('a').invocation!, element: null } }), g, suite([2, 20]));
    expect(rate.net).toBeNull();
    expect(appels.map((a) => a.chemin)).toEqual([`${C}/i-a`]);
  });

  it('ses bonus et ses états comptent ; la couverture et les bonus de DEF de la cible aussi ; les dégâts réveillent', async () => {
    const g = monstre('a', { def: 13, etats: [etat('endormi')], bonus: [{ sur: 'DEF', valeur: 1, rounds: null, consomme: false, typeDegats: null, source: null }] });
    enBase(g);
    const r = await AI.attaqueDInvocation('c1', tour, invoc('a', { bonus: [{ sur: 'attaque', valeur: 2, rounds: null, consomme: false, typeDegats: null, source: null }] }), g, suite([7, 20], [5, 8]), 2);
    expect(r.issue).toMatchObject({ total: 16, def: 16, touche: true });
    expect(appels[0]!.donnees).toMatchObject({ etats: [] });
  });

  it('les refus : pas son tour, pas d’attaque, un PJ, à terre, action prise, absente', async () => {
    const g = monstre('a');
    await expect(AI.attaqueDInvocation('c1', { tour: 6, actif: 'pj-p1' }, invoc('a'), g)).rejects.toThrow('Ce n’est pas le tour de a.');
    await expect(AI.attaqueDInvocation('c1', tour, invoc('a', { invocation: { ...invoc('a').invocation!, attaque: null } }), g)).rejects.toThrow('a n’attaque pas.');
    await expect(AI.attaqueDInvocation('c1', tour, invoc('a'), pj('p2'))).rejects.toThrow('On attaque un monstre.');
    await expect(AI.attaqueDInvocation('c1', tour, invoc('a'), monstre('a', { aTerre: true }))).rejects.toThrow('a est déjà à terre.');
    await expect(AI.attaqueDInvocation('c1', tour, invoc('a', { tourActions: 6, principale: true }), g)).rejects.toThrow('L’action principale est déjà prise ce tour.');
    await expect(AI.attaqueDInvocation('c1', tour, invoc('a', { etats: [etat('etourdi')] }), g)).rejects.toThrow('a ne peut pas agir ce tour.');
    await expect(AI.attaqueDInvocation('c1', tour, invoc('a'), g, suite([20, 20], [5, 8]))).rejects.toThrow('a n’est plus dans le combat.');
  });

  it('une capacité sur un allié (Aide : +2 au prochain jet) ; une capacité qui se lit va au MJ', async () => {
    const familier = invoc('f', { invocation: { ...invoc('f').invocation!, creature: 'familier', attaque: null } });
    const t = { tour: 6, actif: 'i-f' };
    const allie = pj('p2');
    expect(await AI.capaciteDInvocation('c1', t, familier, 'Aide', allie, new Map())).toBe('+2 prochain jet');
    expect(appels).toEqual([
      { fn: 'lot.update', chemin: `${C}/pj-p2`, donnees: { bonus: [{ sur: 'prochainJet', valeur: 2, rounds: null, consomme: false, typeDegats: null, source: 'f' }] } },
      { fn: 'lot.update', chemin: `${C}/i-f`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } },
    ]);
    appels.length = 0;
    expect(await AI.capaciteDInvocation('c1', t, familier, 'Éclaireur', allie, new Map())).toBe('Hors combat, il part en reconnaissance.');
    expect(journal.noterJet.mock.calls.at(-1)![4]).toBe('MJ : Hors combat, il part en reconnaissance.');
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: `${C}/i-f`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false } }]);
    await expect(AI.capaciteDInvocation('c1', t, familier, 'Aide', monstre('a'), new Map())).rejects.toThrow('Aide se joue sur un allié.');
    await expect(AI.capaciteDInvocation('c1', t, familier, 'Vol', allie, new Map())).rejects.toThrow('f n’a pas Vol.');
    await expect(AI.capaciteDInvocation('c1', { tour: 6, actif: 'pj-p1' }, familier, 'Aide', allie, new Map())).rejects.toThrow('Ce n’est pas le tour de f.');
    await expect(AI.capaciteDInvocation('c1', t, { ...familier, tourActions: 6, principale: true }, 'Aide', allie, new Map())).rejects.toThrow('L’action principale est déjà prise ce tour.');
  });
});

describe('les monstres attaquent les invocations (10a)', () => {
  const griffes = { nom: 'Griffes', bonus: 4, formule: '1d6+2', typeDegats: 'physique' as const, portee: { min: 0, max: 1, vue: false }, seuilCritique: 20, etatSurTouche: null };
  it('contre sa DEF ; touchée, ses PV en chiffres ; une barricade est toujours touchée', async () => {
    const t = invoc('a');
    enBase(t);
    const r = await X.attaqueSurInvocation('c1', combat, monstre('g'), griffes, t, suite([12, 20], [4, 6]));
    expect(r).toMatchObject({ issue: { total: 16, touche: true }, net: 6, pv: 21 });
    expect(appels.at(-1)).toEqual({ fn: 'tx.update', chemin: `${C}/i-a`, donnees: { pv: 21, aTerre: false } });
    appels.length = 0;
    const b = invoc('b', { def: 0, invocation: { ...invoc('b').invocation!, creature: 'barricade', attaque: null, objet: true } });
    enBase(b);
    const rb = await X.attaqueSurInvocation('c1', combat, monstre('g'), griffes, b, suite([1, 20], [6, 6]));
    expect(rb.issue.touche).toBe(true);
    expect(journal.noterJet.mock.calls.at(-2)![4]).toBe('un objet : touché d’office');
    // Ses PV temporaires d'abord.
    enBase(invoc('p', { pvTemp: 3 }));
    expect((await X.attaqueSurInvocation('c1', combat, monstre('g'), griffes, invoc('p', { pvTemp: 3 }), suite([12, 20], [4, 6]))).pv).toBe(24);
    const rate = await X.attaqueSurInvocation('c1', combat, monstre('g'), griffes, t, suite([2, 20]));
    expect(rate).toMatchObject({ net: null, pv: 27 });
    await expect(X.attaqueSurInvocation('c1', combat, monstre('g'), griffes, pj('p1'))).rejects.toThrow('On attaque une invocation du combat.');
    await expect(X.attaqueSurInvocation('c1', combat, pj('p1'), griffes, t)).rejects.toThrow('Seul un monstre attaque depuis ce panneau.');
    // À 0 PV : à terre, le journal dit qu'elle retourne à la Mer.
    enBase(invoc('c', { pv: 3 }));
    expect((await X.attaqueSurInvocation('c1', combat, monstre('g'), griffes, invoc('c', { pv: 3 }), suite([15, 20], [4, 6]))).pv).toBe(0);
    expect(journal.noterJet.mock.calls.at(-1)![4]).toMatch(/c retourne à la Mer$/);
  });
});

describe('le tour du maître finit (9a, 1a, 3a) ; la clôture', () => {
  it('ses invocations perdent un round, ou s’en vont avec leur jeton ; sa concentration aussi', async () => {
    base.set('tables/t1/combats/c1', { nom: 'x', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null });
    const g = monstre('a', { etats: [etat('fascine')] });
    const moi = pj('p1', { concentration: conc({ rounds: 1, zone: 'zc', invocations: ['i-c'] }), etats: [etat('fascine')] });
    const deux = invoc('a', { invocation: { ...invoc('a').invocation!, rounds: 2 } });
    const un = invoc('b', { invocation: { ...invoc('b').invocation!, rounds: 1 } });
    // L'Illusion vivante de la concentration : sans durée à elle, elle s'en va avec elle ; sa zone aussi.
    const lie = invoc('c', { invocation: { ...invoc('c').invocation!, rounds: null } });
    enBase(moi);
    base.set(`${Z0}/zc`, { ...zone({ lanceur: 'pj-p1', rounds: 2 }) });
    const cs = [moi, g, deux, un, lie];
    await A.finirTour('c1', 'pj-p1', cs, new Set());
    const w = appels.map((a) => [a.fn, a.chemin, a.donnees]);
    expect(w).toContainEqual(['tx.update', `${C}/m-r1-a`, { etats: [] }]);
    expect(w).toContainEqual(['tx.update', `${C}/pj-p1`, { concentration: null }]);
    expect(w).toContainEqual(['tx.update', `${C}/i-a`, { invocation: { ...deux.invocation!, rounds: 1 } }]);
    expect(w.some((x) => x[0] === 'tx.update' && x[1] === `${Z0}/zc`)).toBe(false);
    expect(w.filter((x) => x[0] === 'tx.delete').map((x) => x[1])).toEqual([`${Z0}/zc`, `${C}/i-b`, 'tables/t1/scenes/cave/jetons/i-b', `${C}/i-c`, 'tables/t1/scenes/cave/jetons/i-c']);
    expect(journal.noterJet.mock.calls.map((c) => c[4])).toEqual(['Fascination s’achève.', 'b, c : leur temps est écoulé, elles retournent à la Mer.']);
  });

  it('une concentration de plusieurs rounds en perd un ; son état sur lui-même tombe avec elle', async () => {
    base.set('tables/t1/combats/c1', { nom: 'x', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null });
    const moi = pj('p1', { concentration: conc({ rounds: 2 }) });
    enBase(moi);
    await A.finirTour('c1', 'pj-p1', [moi], new Set());
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { concentration: { ...conc(), rounds: 1 } } });
    appels.length = 0;
    const voile = pj('p1', { concentration: conc({ rounds: 1, etats: [{ cible: 'pj-p1', etat: 'dissimule' }] }), etats: [etat('dissimule')] });
    enBase(voile);
    await A.finirTour('c1', 'pj-p1', [voile], new Set());
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: `${C}/pj-p1`, donnees: { concentration: null, etats: [] } });
  });

  it('à la clôture, les jetons des invocations s’en vont', async () => {
    await A.cloreCombat('c1', [], { scene: 'cave', ids: ['i-a'] });
    expect(appels[0]).toEqual({ fn: 'lot.delete', chemin: 'tables/t1/scenes/cave/jetons/i-a' });
  });
});

describe('lancer un sort de concentration ou d’invocation (1a, 3a, 13b)', () => {
  it('Fascination : la concentration s’inscrit avec l’état posé ; une nouvelle remplace l’ancienne', async () => {
    const f = fascinateur();
    const g = monstre('a', { sauvegardes: { FOR: 0, DEX: 0, CON: 0, Volonte: -5 } });
    const ancienne = monstre('b', { etats: [etat('fascine')] });
    const moi = pj('p1', { concentration: conc({ etats: [{ cible: 'm-r1-b', etat: 'fascine' }] }) });
    enBase(moi);
    enBase(g);
    enBase(ancienne);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 2, 0), j('m-r1-b', 3, 0)] };
    const r = await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'enchantement.fascination', palier: 'I', surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } }, carte, [moi, g, ancienne], new Map([['p1', f]]), () => 0.3);
    expect(r.texte).toBe('Fascination I lancé. Concentration : Fascination.');
    expect(appels[0]).toEqual({ fn: 'lot.update', chemin: `${C}/pj-p1`, donnees: { concentration: null } });
    expect(appels[1]).toEqual({ fn: 'lot.update', chemin: `${C}/m-r1-b`, donnees: { etats: [] } });
    expect(appels.at(-1)).toEqual({ fn: 'updateDoc', chemin: `${C}/pj-p1`, donnees: { concentration: { action: 'enchantement.fascination', nom: 'Fascination', lancer: 't6', maintien: 1, rupture: ['cibleAttaquee', 'lanceurSurpris', 'autreConcentration'], rounds: null, etats: [{ cible: 'm-r1-a', etat: 'fascine' }], zone: null, invocations: [] } } });
    expect(journal.noterJet.mock.calls[0]![4]).toBe('p1 perd sa concentration (Fascination la remplace).');
  });

  it('la cible réussit sa sauvegarde : la concentration s’inscrit, sans état ; un lancer raté ne remplace rien', async () => {
    const f = fascinateur();
    const g = monstre('a', { sauvegardes: { FOR: 0, DEX: 0, CON: 0, Volonte: 30 } });
    const moi = pj('p1', { concentration: conc({ etats: [] }) });
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 2, 0)] };
    const choix = { sort: 'enchantement.fascination', palier: 'I' as const, surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } };
    await L.lancerSortEnCombat('c1', combat, moi, f, choix, carte, [moi, g], new Map([['p1', f]]), () => 0.3);
    expect(appels.at(-1)!.donnees).toMatchObject({ concentration: { etats: [] } });
    appels.length = 0;
    // Initié par grimoire : 1 à 4 au d20, l'école rate ; l'ancienne concentration reste.
    const r = await L.lancerSortEnCombat('c1', combat, moi, f, choix, carte, [moi, g], new Map([['p1', f]]), () => 0.1);
    expect(r.issue).toBe('echecEcole');
    expect(appels.some((a) => a.chemin === `${C}/pj-p1` && 'concentration' in (a.donnees as object))).toBe(false);
  });

  it('1a : un sort d’attaque contre la cible d’une Fascination la rompt', async () => {
    const f = mage();
    const g = monstre('a', { def: 5, etats: [etat('fascine')] });
    const moi = pj('p1');
    const autre = pj('p2', { concentration: conc() });
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj'), j('m-r1-a', 2, 0)] };
    await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'mineur.trait-arcanique', palier: 'I', surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } }, carte, [moi, g, autre], new Map([['p1', f]]), () => 0.5);
    expect(appels).toContainEqual({ fn: 'lot.update', chemin: `${C}/pj-p2`, donnees: { concentration: null } });
    expect(journal.noterJet.mock.calls.map((c) => c[4])).toContain('p2 perd sa concentration (a est attaqué).');
  });

  it('un sort d’invocation qui dérape n’appelle rien', async () => {
    const f = mageN('invocation', 2, { rangs: { 'magicien.ecole': 2 } });
    const moi = pj('p1');
    enBase(moi);
    const r = await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'invocation.arme-spirituelle', palier: 'I', surcharge: false, element: 'feu', visee: { cibles: [], point: { cx: 2, cy: 0 } } }, { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj')] }, [moi], new Map([['p1', f]]), () => 0.05);
    expect(r.issue).toBe('derapage');
    expect(r.aInvoquer).toEqual([]);
  });

  it('13b, 5a : Arme spirituelle : la créature à poser, son initiative au journal ; plus d’« Invocation » pour le MJ', async () => {
    const f = mageN('invocation', 2);
    const moi = pj('p1', { modInit: 2 });
    enBase(moi);
    const carte = { scene: scene(), jetons: [j('pj-p1', 0, 0, 'pj')] };
    const r = await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'invocation.arme-spirituelle', palier: 'I', surcharge: false, element: null, visee: { cibles: [], point: { cx: 2, cy: 0 } } }, carte, [moi], new Map([['p1', f]]), () => 0.5);
    expect(r.aInvoquer).toHaveLength(1);
    expect(r.aInvoquer[0]).toMatchObject({ creature: 'arme_spirituelle', nom: 'Arme spirituelle', ids: ['i-p1-t6-1'], rounds: 3, portee: 6, de: 11, lancer: 't6', maitre: { modInit: 2, niveau: 9 } });
    const notes = journal.noterJet.mock.calls;
    expect(notes[0]![4]).not.toMatch(/Invocation/);
    expect(notes.find((c) => c[0] === 'Initiative de Arme spirituelle')![2]).toEqual({ des: [11], faces: 20, bonus: 2, total: 13 });
  });
});
