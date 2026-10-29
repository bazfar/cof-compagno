import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Les monstres avancés (lot L6.6a, décisions de Thomas du 28/10/2026) :
 * 2a (les capacités actives, jouées du panneau du MJ), 3a (les cibles
 * cochées, la portée d'une capacité à cible unique), 4a (FOR, DEX, CON ;
 * le reste est la Volonté), 5a (une recharge de N rounds), 6b (les effets
 * des attaques, traduits en données), 7a (les résistances légendaires d'un
 * boss), 8a (les immunités), 9a (Curée), 10a (les réactions des monstres).
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
vi.mock('../../src/lib/actions/carte', () => ({ marquerMort: vi.fn() }));

const { session } = await import('../../src/lib/session.svelte');
const R = await import('../../src/regles');
const M = await import('../../src/lib/combat/monstres');
const AM = await import('../../src/lib/actions/monstres');
const LG = await import('../../src/lib/combat/legendaire');
const X = await import('../../src/lib/actions/attaques');
const T = await import('../../src/lib/combat/attaque');
const { appliquerChangements } = await import('../../src/lib/combat/changements');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { cibleDe } = await import('../../src/lib/combat/sorts');
const { schemaCombattant } = await import('../../src/lib/schemas/combat');
const { texteBonus } = await import('../../src/lib/combat/bonus');
const { RefusCombat } = await import('../../src/lib/actions/combat');
const { resoudreLancer } = await import('../../src/lib/effets/resolution');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type EffetAttaqueMonstre = import('../../src/lib/schemas/monstres').EffetAttaqueMonstre;

const BESTIAIRE: { id: string; nom: string; boss: boolean; dangerosite: number; famille?: string; attaques: { nom: string }[]; capacitesActives?: unknown[]; capacitesSpeciales: unknown[]; immunites?: string[] }[] = JSON.parse(
  readFileSync('src/donnees/bestiaire.json', 'utf8'),
).monstres;
const modele = (id: string) => BESTIAIRE.find((m) => m.id === id)!;
const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15, de: 12, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: { FOR: 1, DEX: 2, CON: 3, Volonte: 0 }, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
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
const enBase = (c: Combattant & { id: string }) => base.set(`${C}/${c.id}`, (({ id: _i, ...x }) => x)(c));
const etat = (id: string, x: Record<string, unknown> = {}) => ({ id, rounds: null, cumul: 1, charges: null, des: null, source: null, ...x });

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'bob';
  session.nom = 'Bob';
  journal.noterJet.mockClear();
});

describe('les données (6b, 8a)', () => {
  it('les effets des attaques sont lus ; leurs états sont au catalogue ; chaque clé est une attaque du bestiaire', () => {
    expect(R.etatsDuBestiaireInconnus()).toEqual([]);
    expect(R.etatsDuBestiaireInconnus({ a: 'pas_un_etat', b: 'effroi' }, [{ etats: [{ id: 'zz', rounds: 1 }, { id: 'effroi', rounds: 1 }], auMj: null }, { auMj: null }])).toEqual(['pas_un_etat', 'zz']);
    expect(R.effetsAttaquesMonstres.size).toBe(93);
    for (const cle of R.effetsAttaquesMonstres.keys()) {
      const [m, a] = cle.split('|') as [string, string];
      expect(modele(m)?.attaques.some((x) => x.nom === a), cle).toBe(true);
    }
    expect(R.effetsAttaquesMonstres.get('sanglier_de_rage|Charge')).toEqual({ sauvegarde: { type: 'FOR', dd: 13 }, repousse: 2, etats: [{ id: 'renverse', rounds: null }], auMj: 'Seulement après 6 m en ligne droite.' });
    expect(R.effetsAttaquesMonstres.get('orc_elite|Double frappe')).toEqual({ unParRound: true, jets: 2, auMj: null });
    expect(R.effetsAttaquesMonstres.get('ours_champion|Griffes dévastatrices')).toEqual({ defIgnoree: 3, auMj: null });
  });

  it('les capacités actives du bestiaire se lisent toutes', () => {
    for (const m of BESTIAIRE) expect(M.capacitesDuMonstre(m).illisibles, m.id).toEqual([]);
    expect(BESTIAIRE.flatMap((m) => M.capacitesDuMonstre(m).capacites)).toHaveLength(71);
  });

  it('8a : les immunités d’un monstre, en états de la refonte ; celles sans équivalent et sous condition vont au MJ', () => {
    expect(M.immunitesDuMonstre(modele('connetable_cendre'))).toEqual(['empoisonne', 'effroi', 'charme']);
    expect(M.immunitesDuMonstre({ immunites: ['effrayee', 'effroi', 'paralysee'] })).toEqual(['effroi']);
    expect(M.immunitesDuMonstre({ immunites: Array.from({ length: 30 }, () => 'aveugle') })).toEqual(['aveugle']);
    expect(M.immunitesDuMonstre({})).toEqual([]);
    expect(M.immunitesAuMj({ immunites: ['paralysee', 'effrayee', 'folie_illusoire'] })).toEqual(['immunisé : paralysee, folie_illusoire']);
    expect(M.immunitesAuMj({ immunitesConditionnelles: [{ etats: ['charmee', 'effrayee'], condition: 'tant que son maître vit' }] })).toEqual(['immunisé à charmee, effrayee : tant que son maître vit']);
    expect(M.immunitesAuMj({})).toEqual([]);
    expect(M.immunise({ immunites: ['effroi'] }, 'effroi')).toBe(true);
    expect(M.immunise({ immunites: ['effroi'] }, 'charme')).toBe(false);
    expect(M.immunise({}, 'effroi')).toBe(false);
  });

  it('7a : les résistances légendaires : 0 hors boss ; le champ du bestiaire ; sinon max(1, dangerosité − 2), de 0 à 10', () => {
    expect(M.legendaireDuMonstre({ boss: false, dangerosite: 5 })).toBe(0);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 5 })).toBe(3);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 2 })).toBe(1);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 5, resistanceLegendaire: 4 })).toBe(4);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 5, resistanceLegendaire: 2.7 })).toBe(2);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 5, resistanceLegendaire: 15 })).toBe(10);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 5, resistanceLegendaire: -1 })).toBe(0);
    expect(M.legendaireDuMonstre({ boss: true, dangerosite: 5, resistanceLegendaire: '4' })).toBe(3);
    expect(M.legendairesRestantes({ legendaire: 3, usages: { legendaire: 1 } })).toBe(2);
    expect(M.legendairesRestantes({ legendaire: 1, usages: { legendaire: 4 } })).toBe(0);
    expect(M.legendairesRestantes({ usages: {} })).toBe(0);
  });

  it('le combattant porte immunités et résistances : un monstre seul, dans leurs bornes', () => {
    const { id: _i, ...m } = monstre('a');
    const { id: _j, ...p } = pj('p1');
    expect(schemaCombattant.safeParse({ ...m, immunites: ['effroi'], legendaire: 3 }).success).toBe(true);
    for (const x of [{ immunites: [] }, { immunites: Array.from({ length: 21 }, () => 'x') }, { immunites: [''] }, { legendaire: 0 }, { legendaire: 11 }, { legendaire: 1.5 }])
      expect(schemaCombattant.safeParse({ ...m, ...x }).success, JSON.stringify(x)).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, immunites: ['effroi'] }).success).toBe(false);
    expect(schemaCombattant.safeParse({ ...p, legendaire: 1 }).success).toBe(false);
  });
});

describe('les limites (5a, 6b)', () => {
  const m = (usages: Record<string, number>) => ({ usages });

  it('par combat : une fois, ou N fois', () => {
    expect(M.refusDeLimite(m({}), 'Javelot', { parCombat: 1 }, 2)).toBeNull();
    const u = M.avecUsage({ x: 4 }, 'Javelot', { parCombat: 1 }, 2);
    expect(u).toEqual({ x: 4, 'n:Javelot': 1, 'r:Javelot': 2 });
    expect(M.refusDeLimite(m(u), 'Javelot', { parCombat: 1 }, 5)).toBe('déjà servie ce combat');
    expect(M.refusDeLimite(m(u), 'Javelot', { parCombat: 2 }, 5)).toBeNull();
    const u2 = M.avecUsage(u, 'Javelot', { parCombat: 2 }, 3);
    expect(u2).toEqual({ x: 4, 'n:Javelot': 2, 'r:Javelot': 3 });
    expect(M.refusDeLimite(m(u2), 'Javelot', { parCombat: 2 }, 5)).toBe('déjà 2 fois ce combat');
  });

  it('par round : N fois dans le round, et le round suivant de nouveau', () => {
    const u = M.avecUsage({}, 'Rempart', { parRound: 2 }, 3);
    expect(u).toEqual({ 'n:Rempart': 1, 'r:Rempart': 3, 'nr:Rempart': 1 });
    expect(M.refusDeLimite(m(u), 'Rempart', { parRound: 2 }, 3)).toBeNull();
    const u2 = M.avecUsage(u, 'Rempart', { parRound: 2 }, 3);
    expect(u2['nr:Rempart']).toBe(2);
    expect(M.refusDeLimite(m(u2), 'Rempart', { parRound: 2 }, 3)).toBe('déjà servie ce round');
    expect(M.refusDeLimite(m(u2), 'Rempart', { parRound: 2 }, 4)).toBeNull();
    expect(M.avecUsage(u2, 'Rempart', { parRound: 2 }, 4)).toEqual({ 'n:Rempart': 3, 'r:Rempart': 4, 'nr:Rempart': 1 });
  });

  it('5a : une recharge de N rounds : servie au round R, elle revient au round R + N', () => {
    const u = M.avecUsage({}, 'Filet', { recharge: 3 }, 2);
    expect(M.refusDeLimite(m(u), 'Filet', { recharge: 3 }, 4)).toBe('se recharge (round 5)');
    expect(M.refusDeLimite(m(u), 'Filet', { recharge: 3 }, 5)).toBeNull();
    expect(M.refusDeLimite(m({}), 'Filet', { recharge: 3 }, 1)).toBeNull();
  });

  it('sans limite, rien ne se compte ; les clés sont bornées à 60 caractères, le compte à 999', () => {
    expect(M.avecUsage({ a: 1 }, 'Griffes', {}, 2)).toEqual({ a: 1 });
    expect(M.refusDeLimite(m({ 'n:Griffes': 9, 'r:Griffes': 2 }), 'Griffes', {}, 2)).toBeNull();
    const long = 'x'.repeat(80);
    expect(Object.keys(M.avecUsage({}, long, { parRound: 1 }, 1)).every((k) => k.length === 60)).toBe(true);
    expect(M.avecUsage({ 'n:a': 999, 'r:a': 5, 'nr:a': 999 }, 'a', { parRound: 1 }, 5)).toEqual({ 'n:a': 999, 'r:a': 5, 'nr:a': 999 });
    expect(M.avecUsage({}, 'a', { parCombat: 1 }, 0)['r:a']).toBe(1);
    expect(M.avecUsage({}, 'a', { parCombat: 1 }, 5000)['r:a']).toBe(999);
  });

  it('6b : la limite d’une attaque, son effet en une ligne', () => {
    expect(M.limiteDeLAttaque(null)).toEqual({ parCombat: undefined, parRound: undefined, recharge: undefined });
    expect(M.limiteDeLAttaque({ parCombat: 2, unParRound: true, recharge: 3, auMj: null })).toEqual({ parCombat: 2, parRound: 1, recharge: 3 });
    expect(M.texteEffetAttaque(null, 'Texte du bestiaire')).toBe('Texte du bestiaire');
    expect(M.texteEffetAttaque(null, null)).toBe('');
    expect(M.texteEffetAttaque(R.effetsAttaquesMonstres.get('sanglier_de_rage|Charge')!, 'x')).toBe('FOR 13 ou Renversé, repoussé de 2 cases · MJ : Seulement après 6 m en ligne droite.');
    const e: EffetAttaqueMonstre = { parCombat: 1, unParRound: true, recharge: 2, jets: 2, critique: 19, defIgnoree: 3, etats: [{ id: 'etourdi', rounds: 1 }, { id: 'expose', rounds: 2 }], malus: [{ sur: 'DEF', valeur: -1, rounds: 3 }, { sur: 'attaque', valeur: -2, rounds: 1 }, { sur: 'attaque', valeur: -1, rounds: null }], repousse: 1, auMj: null };
    expect(M.texteEffetAttaque(e, null)).toBe(
      '1×/combat · 1×/round · recharge 2 rounds · 2 jets · critique sur 19-20 · ignore 3 de DEF · touché : Étourdi 1 round, Exposé 2 rounds, -1 DEF 3 rounds, -2 attaque 1 round, -1 attaque, repoussé de 1 case',
    );
    expect(M.texteEffetAttaque({ recharge: 1, auMj: 'Rien.' }, null)).toBe('recharge 1 round · MJ : Rien.');
    expect(M.texteEffetAttaque({ etats: [{ id: 'inconnu', rounds: null }], auMj: null }, null)).toBe('touché : inconnu');
  });

  it('6b : l’attaque du monstre porte son effet et son texte ; le critique de l’effet', () => {
    const armes = new Map([['epee', { id: 'epee', nom: 'Épée', degats: '1d8', typeDegats: 'physique', portee: null, critMin: 20 }]]) as never;
    const [a] = T.attaquesDuMonstre([{ nom: 'Griffes dévastatrices', armeId: 'epee', bonusAttaque: 6, effetSpecial: 'Ignore 3 DEF.' }] as never, armes, 'ours_champion');
    expect(a).toMatchObject({ nom: 'Griffes dévastatrices', effet: { defIgnoree: 3, auMj: null }, texte: 'Ignore 3 DEF.', seuilCritique: 20 });
    const [b] = T.attaquesDuMonstre([{ nom: 'Hache', armeId: 'epee', bonusAttaque: 6, effetSpecial: null }] as never, armes, null);
    expect(b).not.toHaveProperty('effet');
    expect(b).not.toHaveProperty('texte');
    const [c] = T.attaquesDuMonstre([{ nom: 'Lame du serment brisé', armeId: 'epee', bonusAttaque: 6 }] as never, armes, 'connetable_cendre');
    expect(c).toMatchObject({ seuilCritique: 19, effet: { critique: 19, auMj: null } });
    const [d] = T.attaquesDuMonstre([{ nom: 'Lame', armeId: 'epee', bonusAttaque: 6 }] as never, new Map([['epee', { degats: '1d8', typedegats: 'physique', portee: 'contact' }]]) as never, null);
    expect(d!.seuilCritique).toBe(20);
    expect(M.effetDeLAttaque('ours_champion', 'Griffes dévastatrices')).toEqual({ defIgnoree: 3, auMj: null });
    expect(M.effetDeLAttaque(null, 'Griffes dévastatrices')).toBeNull();
    expect(M.effetDeLAttaque('ours_champion', 'x')).toBeNull();
  });
});

describe('les capacités (2a, 3a, 4a, 10a)', () => {
  it('4a : FOR, DEX, CON gardent leur nom ; le reste est la Volonté', () => {
    expect(['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map(M.sauvegardeDe)).toEqual(['FOR', 'DEX', 'CON', 'Volonte', 'Volonte', 'Volonte']);
  });

  it('la limite écrite au bestiaire ; la durée de ses effets', () => {
    expect(M.limiteDe('1x/combat', undefined)).toEqual({ parCombat: 1 });
    expect(M.limiteDe('3x/combat', undefined)).toEqual({ parCombat: 3 });
    expect(M.limiteDe('2x/tour', undefined)).toEqual({ parRound: 2 });
    expect(M.limiteDe('1x/recharge', 4)).toEqual({ recharge: 4 });
    expect(M.limiteDe('1x/recharge', undefined)).toEqual({ recharge: 1 });
    expect(M.limiteDe('libre', undefined)).toEqual({});
    expect(M.limiteDe('x1x/combat', undefined)).toEqual({});
    expect(M.limiteDe('1x/combats', undefined)).toEqual({});
    expect(M.dureeDuBestiaire('2')).toEqual({ rounds: 2 });
    expect(M.dureeDuBestiaire('0')).toEqual({ rounds: 1 });
    expect(M.dureeDuBestiaire('40')).toEqual({ rounds: 20 });
    expect(M.dureeDuBestiaire('prochainTour')).toBe('prochainTour');
    expect(M.dureeDuBestiaire('finCombat')).toBe('finCombat');
    expect(M.dureeDuBestiaire('2 rounds')).toBe('finCombat');
  });

  it('lues du bestiaire : ce qu’elles prennent, leur portée en cases, leur sauvegarde', () => {
    const loup = M.capacitesDuMonstre(modele('loup_champion')).capacites;
    expect(loup[0]).toEqual({
      nom: 'Hurlement de commandement',
      description: expect.any(String),
      limite: { parCombat: 1 },
      cible: 'zone',
      portee: null,
      zone: 18,
      jetAttaque: null,
      sauvegarde: { type: 'Volonte', dd: 13 },
      prend: 'secondaire',
      effets: [
        { type: 'bonus', cible: 'attaque', valeur: -2, duree: '2' },
        { type: 'special', note: expect.any(String) },
      ],
    });
    const garde = M.capacitesDuMonstre(modele('garde_champion')).capacites;
    expect(garde.map((c) => [c.nom, c.prend, c.portee, c.limite])).toEqual([
      ['Rempart vivant', 'reaction', 1, { parRound: 2 }],
      [expect.any(String), 'principale', null, { parCombat: 1 }],
      ['Parade', 'reaction', null, {}],
      [expect.any(String), 'principale', null, { parCombat: 1 }],
    ]);
    const portees = BESTIAIRE.flatMap((m) => M.capacitesDuMonstre(m).capacites).map((c) => c.portee);
    expect(new Set(portees)).toEqual(new Set([null, 1, 4, 6, 12, 24]));
    const proche = { nom: 'Z', description: '', mecanique: { type: 'limitee', usage: { frequence: 'libre' }, cible: 'ennemi', portee: 0.6, zone: null, effets: [] } };
    expect(M.capacitesDuMonstre({ capacitesActives: [proche] }).capacites[0]!.portee).toBe(1);
    const brut = { capacitesActives: [{ nom: 'X', description: 'D', mecanique: { type: 'autre' } }, { nom: 'Y', mecanique: {} }, { description: 'sans nom' }, null] };
    expect(M.capacitesDuMonstre(brut)).toEqual({ capacites: [], illisibles: [{ nom: 'X', description: 'D' }, { nom: 'Y', description: '' }] });
    expect(M.capacitesDuMonstre({})).toEqual({ capacites: [], illisibles: [] });
  });

  const cap = (c: Partial<import('../../src/lib/combat/monstres').CapaciteMonstre> = {}): import('../../src/lib/combat/monstres').CapaciteMonstre => ({
    nom: 'Souffle',
    description: '',
    limite: { parCombat: 1 },
    cible: 'zone',
    portee: null,
    zone: 6,
    jetAttaque: null,
    sauvegarde: null,
    prend: 'principale',
    effets: [],
    ...c,
  });

  it('2a : une sauvegarde par cible ; les dés une fois pour toutes ; réussie, la moitié des dégâts « demi », rien d’autre', () => {
    const a = monstre('a');
    const b = monstre('b');
    const c = cap({
      sauvegarde: { type: 'DEX', dd: 13 },
      effets: [
        { type: 'degats', formule: '2d6', elementaire: 'feu', surReussite: 'demi' },
        { type: 'etat', id: 'renversee', duree: '1' },
        { type: 'special', note: 'Le sol brûle.' },
      ],
    });
    const r = M.jouerCapacite(c, [{ c: a, fiche: null }, { c: b, fiche: null }], suite([5, 20], [4, 6], [5, 6], [15, 20]));
    expect(r.jets).toEqual([
      { quoi: 'sauvegarde de DEX', cible: 'm-r1-a', des: [5], total: 7, contre: 13, reussi: false },
      { quoi: 'dégâts', des: [4, 5], total: 9 },
      { quoi: 'sauvegarde de DEX', cible: 'm-r1-b', des: [15], total: 17, contre: 13, reussi: true },
    ]);
    expect(r.changements).toEqual([
      { type: 'degats', cible: 'm-r1-a', montant: 9, typeDegats: 'feu', calcul: '9' },
      { type: 'etat', cible: 'm-r1-a', etat: 'renverse', duree: { rounds: 1 } },
      { type: 'degats', cible: 'm-r1-b', montant: 4, typeDegats: 'feu', calcul: '4 (sauvegarde réussie : moitié)' },
    ]);
    expect(r.auMj).toEqual(['Le sol brûle.']);
    // Sans « demi », une sauvegarde réussie annule les dégâts ; sans élément, ils sont physiques.
    const r2 = M.jouerCapacite(cap({ sauvegarde: { type: 'CON', dd: 12 }, effets: [{ type: 'degats', formule: '1d6' }] }), [{ c: a, fiche: null }, { c: b, fiche: null }], suite([9, 20], [8, 20], [3, 6]));
    expect(r2.changements).toEqual([{ type: 'degats', cible: 'm-r1-b', montant: 3, typeDegats: 'physique', calcul: '3' }]);
    expect(r2.jets.map((j) => j.reussi)).toEqual([true, false, undefined]);
  });

  it('2a : le jet d’attaque contre la DEF (20 touche, 1 rate) ; soin, bonus, état avec ses dés ; un état inconnu, une formule illisible : au MJ', () => {
    const a = monstre('a', { bonus: [{ sur: 'DEF', valeur: 2, rounds: 1, consomme: false, typeDegats: null, source: 'x' }] });
    const b = monstre('b');
    const c = monstre('c', { def: 30 });
    const d = monstre('d', { def: 0 });
    const k = cap({
      cible: 'ennemi',
      jetAttaque: 5,
      effets: [
        { type: 'soin', formule: '1d4' },
        { type: 'bonus', cible: 'DEF', valeur: -1, duree: 'prochainTour' },
        { type: 'etat', id: 'saignement', duree: '2', formuleDot: '1d4' },
        { type: 'etat', id: 'paralysee', duree: '1' },
        { type: 'degats', formule: 'n' },
        { type: 'degats', formule: '1', elementaire: 'feu' },
      ],
    });
    // a : 9 + 5 = 14 contre 15 (13 + 2) : raté ; b : 8 + 5 = 13 contre 13 : touché ; c : 20 naturel ; d : 1 naturel.
    const r = M.jouerCapacite(k, [{ c: a, fiche: null }, { c: b, fiche: null }, { c, fiche: null }, { c: d, fiche: null }], suite([9, 20], [8, 20], [3, 4], [20, 20], [1, 20]));
    expect(r.jets).toEqual([
      { quoi: 'attaque', cible: 'm-r1-a', des: [9], total: 14, contre: 15, reussi: false },
      { quoi: 'attaque', cible: 'm-r1-b', des: [8], total: 13, contre: 13, reussi: true },
      { quoi: 'soin', des: [3], total: 3 },
      { quoi: 'dégâts', des: [], total: 1 },
      { quoi: 'attaque', cible: 'm-r1-c', des: [20], total: 25, contre: 30, reussi: true },
      { quoi: 'attaque', cible: 'm-r1-d', des: [1], total: 6, contre: 0, reussi: false },
    ]);
    const surB = [
      { type: 'soin', cible: 'm-r1-b', montant: 3 },
      { type: 'bonus', cible: 'm-r1-b', sur: 'DEF', valeur: -1, duree: 'prochainTour' },
      { type: 'etat', cible: 'm-r1-b', etat: 'saignement', duree: { rounds: 2 }, des: '1d4' },
      { type: 'degats', cible: 'm-r1-b', montant: 0, typeDegats: 'physique', calcul: '0' },
      { type: 'degats', cible: 'm-r1-b', montant: 1, typeDegats: 'feu', calcul: '1' },
    ];
    expect(r.changements).toEqual([...surB, ...surB.map((x) => ({ ...x, cible: 'm-r1-c' }))]);
    expect(r.auMj).toEqual(['État « paralysee » sur b', 'dégâts : formule illisible « n »', 'État « paralysee » sur c']);
    // Raté : pas de sauvegarde à faire.
    const s = M.jouerCapacite(cap({ jetAttaque: 5, sauvegarde: { type: 'DEX', dd: 10 }, effets: [{ type: 'etat', id: 'renverse', duree: '1' }] }), [{ c: b, fiche: null }], suite([2, 20], [1, 20]));
    expect(s).toEqual({ jets: [{ quoi: 'attaque', cible: 'm-r1-b', des: [2], total: 7, contre: 13, reussi: false }], changements: [], auMj: [] });
    // Une capacité sans cible : son « spécial » seul.
    expect(M.jouerCapacite(cap({ cible: 'aucune', effets: [{ type: 'special', note: 'Appel.' }] }), [], () => 0.5)).toEqual({ jets: [], changements: [], auMj: ['Appel.'] });
  });
});

describe('Curée (9a)', () => {
  const modeles = new Map(BESTIAIRE.map((m) => [m.id, m]));
  it('un cupide tombe : les autres cupides debout ont +1 attaque et +1 dégâts au tour suivant ; pas les autres', () => {
    const tombe = monstre('t', { monstre: 'cupide_recrue', aTerre: true, pv: 0 });
    const a = monstre('a', { monstre: 'cupide_meneur' });
    const terre = monstre('b', { monstre: 'cupide_veteran', aTerre: true, pv: 0 });
    const autre = monstre('c', { monstre: 'goblin_garde' });
    const libre = monstre('d', { monstre: null });
    const inconnu = monstre('e', { monstre: 'nulle_part' });
    const k = M.cureesApresChute(tombe, [tombe, a, terre, autre, libre, inconnu, pj('p1')], modeles);
    expect(k).toEqual([
      {
        qui: a,
        nom: 'Curée',
        changements: [
          { type: 'bonus', cible: 'm-r1-a', sur: 'attaque', valeur: 1, duree: 'prochainTour' },
          { type: 'bonus', cible: 'm-r1-a', sur: 'degats', valeur: 1, duree: 'prochainTour' },
        ],
      },
    ]);
    expect(M.cureesApresChute(monstre('x', { monstre: 'goblin_garde' }), [a], modeles)).toEqual([]);
    expect(M.cureesApresChute(monstre('x', { monstre: null }), [a], modeles)).toEqual([]);
    // Un monstre de la famille sans la capacité : rien.
    expect(M.cureesApresChute(tombe, [monstre('f', { monstre: 'z' })], new Map<string, { famille?: string; capacitesSpeciales: unknown[] }>([...modeles, ['z', { famille: 'cupide', capacitesSpeciales: [{ nom: 'Autre' }] }]]))).toEqual([]);
    // Curée d'une autre famille, ou d'un monstre sans famille : rien.
    const curee = modele('cupide_meneur').capacitesSpeciales;
    const autres = new Map<string, { famille?: string; capacitesSpeciales: unknown[] }>([...modeles, ['orc_x', { famille: 'orc', capacitesSpeciales: curee }], ['sans', { capacitesSpeciales: curee }]]);
    expect(M.cureesApresChute(tombe, [monstre('g', { monstre: 'orc_x' })], autres)).toEqual([]);
    expect(M.cureesApresChute(monstre('t', { monstre: 'sans', aTerre: true }), [monstre('h', { monstre: 'sans' })], autres)).toEqual([]);
    // Un PJ à la même « famille » que rien : jamais.
    expect(M.cureesApresChute(tombe, [pj('p2', { monstre: 'cupide_meneur' } as never)], modeles)).toEqual([]);
  });

  it('jouerCurees : un lot, au journal ; rien sans curée', async () => {
    const a = monstre('a', { monstre: 'cupide_meneur' });
    const tombe = monstre('t', { nom: 'Recrue' });
    await AM.jouerCurees('c1', tombe, M.cureesApresChute(monstre('t', { monstre: 'cupide_recrue' }), [a], new Map(BESTIAIRE.map((m) => [m.id, m]))));
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ fn: 'lot.update', chemin: `${C}/m-r1-a` });
    expect((appels[0]!.donnees as { bonus: unknown[] }).bonus).toHaveLength(2);
    expect(journal.noterJet).toHaveBeenCalledTimes(1);
    expect(journal.noterJet.mock.calls[0]!.slice(0, 4)).toEqual(['Curée', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ']);
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/^Recrue tombe ; a : .+/);
    appels.length = 0;
    await AM.jouerCurees('c1', tombe, []);
    expect(appels).toEqual([]);
    expect(journal.noterJet).toHaveBeenCalledTimes(1);
  });
});

describe('immunités (8a)', () => {
  it('un état dont la cible est immunisée ne se pose pas : le moteur le dit', () => {
    const m = monstre('a', { immunites: ['effroi'] });
    const ecr = appliquerChangements(
      [
        { type: 'etat', cible: m.id, etat: 'effroi', duree: { rounds: 2 } },
        { type: 'etat', cible: m.id, etat: 'renverse', duree: { rounds: 1 } },
      ],
      new Map([[m.id, { c: m, fiche: null }]]),
      { id: 'pj-p1', nom: 'K', fiche: null },
    );
    expect((ecr.combattants.get(m.id) as { etats: { id: string }[] }).etats.map((e) => e.id)).toEqual(['renverse']);
    expect(ecr.lignes.get(m.id)).toContain('immunisé : Effroi');
  });

  it('un état avec ses dés (saignement) se pose avec eux', () => {
    const m = monstre('a');
    const ecr = appliquerChangements([{ type: 'etat', cible: m.id, etat: 'saignement', duree: { rounds: 2 }, des: '1d4' }], new Map([[m.id, { c: m, fiche: null }]]), { id: 'x', nom: 'X', fiche: null });
    expect((ecr.combattants.get(m.id) as { etats: { des: string | null }[] }).etats[0]!.des).toBe('1d4');
    const ecr2 = appliquerChangements([{ type: 'etat', cible: m.id, etat: 'saignement', duree: { rounds: 2 } }], new Map([[m.id, { c: m, fiche: null }]]), { id: 'x', nom: 'X', fiche: null });
    expect((ecr2.combattants.get(m.id) as { etats: { des: string | null }[] }).etats[0]!.des).toBeNull();
  });

  it('à la main : refusé', async () => {
    await expect(X.poserEtatSur('c1', monstre('a', { immunites: ['effroi'] }), 'effroi', 2, 'MJ')).rejects.toThrow('a est immunisé : Effroi.');
    expect(appels).toEqual([]);
    await X.poserEtatSur('c1', monstre('a', { immunites: ['effroi'] }), 'renverse', 1, 'MJ');
    expect(appels).toHaveLength(1);
  });

  it('l’attaque spéciale du joueur : touché, l’état ne se pose pas sur un immunisé ; le journal le dit', async () => {
    const k = reelle('Kargash');
    const a = { nom: 'Masse', bonus: 4, seuilCritique: 20, mode: 'contact' as const };
    const s = { id: 'coup-assommant', nom: 'Coup assommant', description: '', famille: 'contondant', arme: a, effet: { type: 'etat', etat: 'etourdi', rounds: 1 }, cout: 'unParCombat' } as never;
    await X.attaquer('c1', combat, pj('p1'), monstre('A', { immunites: ['etourdi'] }), a, k, suite([15, 20]), { s });
    expect(appels.some((x) => x.chemin === `${C}/m-r1-A`)).toBe(false);
    expect(journal.noterJet.mock.calls[0]![4]).toBe('d20 15 +4 = 19 contre DEF 13 : touché ; immunisé : Étourdi');
    appels.length = 0;
    journal.noterJet.mockClear();
    await X.attaquer('c1', combat, pj('p1'), monstre('A'), a, k, suite([15, 20]), { s });
    expect(appels).toContainEqual(expect.objectContaining({ chemin: `${C}/m-r1-A`, donnees: { etats: [expect.objectContaining({ id: 'etourdi' })] } }));
    expect(journal.noterJet.mock.calls[0]![4]).toBe('d20 15 +4 = 19 contre DEF 13 : touché');
  });
});

describe('l’attaque du monstre et son effet (6b)', () => {
  const k = () => reelle('Kargash');
  const sauvFOR = () => cibleDe(pj('p1'), k(), 0).sauvegardes.FOR;
  const griffes = (effet: EffetAttaqueMonstre | null, texte: string | null = null) => ({ nom: 'Charge', bonus: 30, formule: '1d6+2', typeDegats: 'physique' as const, portee: T.PORTEE_CONTACT, seuilCritique: 20, etatSurTouche: null, effet, texte });
  const charge: EffetAttaqueMonstre = { sauvegarde: { type: 'FOR', dd: 25 }, repousse: 2, etats: [{ id: 'renverse', rounds: null }], malus: [{ sur: 'DEF', valeur: -1, rounds: 3 }], auMj: 'Après 6 m.' };

  it('touché, sauvegarde ratée : l’état, le malus, la poussée ; ce qui reste au MJ ; au journal', async () => {
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes(charge), pj('p1'), k(), suite([10, 20], [3, 6], [2, 20]));
    expect(r).toMatchObject({ net: expect.any(Number), repousse: 2 });
    const cible = appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees as { etats: { id: string; source: string }[]; bonus: unknown[] };
    expect(cible.etats).toEqual([expect.objectContaining({ id: 'renverse', rounds: null, source: 'A' })]);
    expect(cible.bonus).toEqual([{ sur: 'DEF', valeur: -1, rounds: 3, consomme: false, typeDegats: null, source: 'A' }]);
    const t = journal.noterJet.mock.calls[1]![4] as string;
    expect(t).toContain(` ; sauvegarde de FOR ${2 + sauvFOR()} (d20 2) contre 25 : ratée ; Renversé ; `);
    expect(t).toMatch(/ ; repoussé de 2 cases ; MJ : Après 6 m\.$/);
  });

  it('sauvegarde réussie : ni état, ni malus, ni poussée ; raté : pas de sauvegarde', async () => {
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes({ ...charge, sauvegarde: { type: 'FOR', dd: 5 } }), pj('p1'), k(), suite([10, 20], [3, 6], [19, 20]));
    expect(r.repousse).toBe(0);
    expect(appels.find((a) => a.chemin === `${C}/pj-p1`)).toBeUndefined();
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; sauvegarde de FOR \d+ \(d20 19\) contre 5 : réussie ; MJ : Après 6 m\.$/);
    appels.length = 0;
    journal.noterJet.mockClear();
    const rate = await X.attaqueDeMonstre('c1', combat, monstre('A'), { ...griffes(charge), bonus: -30 }, pj('p1'), k(), suite([10, 20]));
    expect(rate).toMatchObject({ net: null, repousse: 0 });
    expect(journal.noterJet).toHaveBeenCalledTimes(1);
  });

  it('sans sauvegarde : l’effet se pose au touché ; une poussée d’une case ; sans effet traduit, le texte du bestiaire au MJ', async () => {
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes({ etats: [{ id: 'saignement', rounds: 2, des: '1d4' }], repousse: 1, auMj: null }), pj('p1'), k(), suite([10, 20], [3, 6]));
    expect(r.repousse).toBe(1);
    const cible = appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees as { etats: { id: string; des: string }[] };
    expect(cible.etats).toEqual([expect.objectContaining({ id: 'saignement', rounds: 2, des: '1d4' })]);
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; Saignement 2 rounds ; repoussé de 1 case$/);
    appels.length = 0;
    journal.noterJet.mockClear();
    await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes(null, 'Le texte.'), pj('p1'), k(), suite([10, 20], [3, 6]));
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(/ ; MJ : Le texte\.$/);
    journal.noterJet.mockClear();
    await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes({ auMj: null }, 'Le texte.'), pj('p1'), k(), suite([10, 20], [3, 6]));
    expect(journal.noterJet.mock.calls[1]![4]).not.toContain('MJ :');
  });

  it('un effet d’un seul genre (état, malus, poussée) se pose ; la sauvegarde compte ses bonus, et réussit à égalité', async () => {
    const seul = async (e: EffetAttaqueMonstre) => {
      appels.length = 0;
      journal.noterJet.mockClear();
      return X.attaqueDeMonstre('c1', combat, monstre('A'), griffes(e), pj('p1'), k(), suite([10, 20], [3, 6]));
    };
    await seul({ etats: [{ id: 'expose', rounds: 1 }], auMj: null });
    expect((appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees as { etats: { id: string }[] }).etats.map((e) => e.id)).toEqual(['expose']);
    await seul({ malus: [{ sur: 'attaque', valeur: -2, rounds: 1 }], auMj: null });
    const b = (appels.find((a) => a.chemin === `${C}/pj-p1`)!.donnees as { bonus: Parameters<typeof texteBonus>[0][] }).bonus;
    expect(b).toEqual([{ sur: 'attaque', valeur: -2, rounds: 1, consomme: false, typeDegats: null, source: 'A' }]);
    expect(journal.noterJet.mock.calls[1]![4]).toMatch(new RegExp(` ; ${texteBonus(b[0]!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect((await seul({ repousse: 1, auMj: null })).repousse).toBe(1);
    // +3 aux sauvegardes : d20 10 + FOR + 3, pile le DD : réussie.
    const plus = { sur: 'sauvegardes' as const, valeur: 3, rounds: 2, consomme: false, typeDegats: null, source: 'x' };
    const dd = 10 + sauvFOR() + 3;
    appels.length = 0;
    journal.noterJet.mockClear();
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes({ sauvegarde: { type: 'FOR', dd }, repousse: 1, auMj: null }), pj('p1', { bonus: [plus] }), k(), suite([10, 20], [3, 6], [10, 20]));
    expect(r.repousse).toBe(0);
    expect(journal.noterJet.mock.calls[1]![4]).toContain(`sauvegarde de FOR ${dd} (d20 10) contre ${dd} : réussie`);
  });

  it('la DEF ignorée baisse la CA visée ; un malus déjà là n’est pas réécrit', async () => {
    const ca = vueFiche(k()).stats.ca;
    const r = await X.attaqueDeMonstre('c1', combat, monstre('A'), { ...griffes({ defIgnoree: 3, auMj: null }), bonus: 0 }, pj('p1'), k(), suite([ca - 3, 20], [3, 6]));
    expect(r.issue).toMatchObject({ touche: true, def: ca - 3 });
    appels.length = 0;
    const b = { sur: 'DEF' as const, valeur: -1, rounds: 3, consomme: false, typeDegats: null, source: 'A' };
    await X.attaqueDeMonstre('c1', combat, monstre('A'), griffes({ malus: [{ sur: 'DEF', valeur: -1, rounds: 3 }], auMj: null }), pj('p1', { bonus: [b] }), k(), suite([10, 20], [3, 6]));
    expect(appels.find((a) => a.chemin === `${C}/pj-p1`)).toBeUndefined();
  });

  it('ses limites : par combat, comptée avec l’action ; déjà servie, refusée ; le jet suivant ne prend rien et ne compte pas', async () => {
    const javelot = griffes({ parCombat: 1, auMj: null });
    await X.attaqueDeMonstre('c1', combat, monstre('A'), javelot, pj('p1'), k(), suite([1, 20]));
    expect(appels[0]).toEqual({ fn: 'lot.update', chemin: `${C}/m-r1-A`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false, usages: { 'n:Charge': 1, 'r:Charge': 2 } } });
    const servi = monstre('A', { usages: { 'n:Charge': 1, 'r:Charge': 2 } });
    await expect(X.attaqueDeMonstre('c1', combat, servi, javelot, pj('p1'), k(), suite([1, 20]))).rejects.toThrow('Charge : déjà servie ce combat.');
    appels.length = 0;
    const pris = monstre('A', { usages: { 'n:Charge': 1, 'r:Charge': 2 }, tourActions: 6, principale: true });
    await X.attaqueDeMonstre('c1', combat, pris, javelot, pj('p1'), k(), suite([1, 20]), false, true);
    expect(appels).toEqual([]);
    // Une réaction (opportunité) compte aussi l'usage, avec sa réaction du round.
    await X.attaqueDeMonstre('c1', combat, monstre('A'), javelot, pj('p1'), k(), suite([1, 20]), true);
    expect(appels[0]!.donnees).toEqual({ usages: { reaction: 6, 'n:Charge': 1, 'r:Charge': 2 } });
  });

  it('repousserDe : case après case ; arrêté, il s’arrête', async () => {
    const scene = { colonnes: 10, lignes: 10, murs: [], portes: [], obstacles: [] } as never;
    const a = monstre('A');
    const p = pj('p1');
    enBase(a);
    enBase(p);
    const carte = { scene, jetons: [{ id: 'm-r1-A', genre: 'monstre' as const, cx: 1, cy: 1 }, { id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 1 }] };
    const n = await X.repousserDe(2, 'c1', combat, a, p, carte as never, [a, p], new Map([['p1', k()]]), 'A', () => 0.5);
    expect(n).toBe(2);
    expect(appels.filter((x) => x.chemin.includes('jetons')).map((x) => x.donnees)).toEqual([
      { cx: 3, cy: 1 },
      { cx: 4, cy: 1 },
    ]);
    appels.length = 0;
    const bord = { scene, jetons: [{ id: 'm-r1-A', genre: 'monstre' as const, cx: 7, cy: 1 }, { id: 'pj-p1', genre: 'pj' as const, cx: 8, cy: 1 }] };
    expect(await X.repousserDe(3, 'c1', combat, a, p, bord as never, [a, p], new Map([['p1', k()]]), 'A', () => 0.5)).toBe(1);
  });
});

describe('le MJ joue une capacité (2a, 3a, 10a)', () => {
  const souffle = (c: Partial<import('../../src/lib/combat/monstres').CapaciteMonstre> = {}): import('../../src/lib/combat/monstres').CapaciteMonstre => ({
    nom: 'Souffle',
    description: '',
    limite: { parCombat: 1 },
    cible: 'ennemi',
    portee: null,
    zone: null,
    jetAttaque: null,
    sauvegarde: null,
    prend: 'principale',
    effets: [{ type: 'degats', formule: '1d6' }],
    ...c,
  });
  const ctx = (combattants: (Combattant & { id: string })[], carte: unknown = null) => ({ combattants, fiches: new Map(), carte: carte as never });

  it('sur les cibles cochées : ses dégâts, son action et son usage écrits ; au journal ; rend le texte', async () => {
    const m = monstre('A');
    const b = monstre('B');
    const c = monstre('C');
    for (const x of [m, b, c]) enBase(x);
    const t = await AM.jouerCapaciteMonstre('c1', combat, m, souffle(), ['m-r1-B', 'm-r1-B', 'm-r1-C'], ctx([m, b, c]), suite([4, 6]));
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-B`, donnees: { pv: 10, aTerre: false } },
      { fn: 'tx.update', chemin: `${C}/m-r1-C`, donnees: { pv: 10, aTerre: false } },
      { fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { tourActions: 6, principale: true, secondaire: false, mvt: 0, sprint: false, usages: { 'n:c:Souffle': 1, 'r:c:Souffle': 2 } } },
    ]);
    expect(t).toMatch(/^Souffle sur B, C : dégâts 4 ; B : .+ ; C : .+$/);
    expect(journal.noterJet).toHaveBeenCalledWith('Souffle', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'A', t.slice('Souffle sur B, C : '.length));
  });

  it('sur soi, sans cible ; l’action bonus ; la réaction du round (10a) ; un MJ noté au texte', async () => {
    const m = monstre('A', { pv: 10 });
    enBase(m);
    const t = await AM.jouerCapaciteMonstre('c1', combat, m, souffle({ cible: 'soi', prend: 'secondaire', limite: {}, effets: [{ type: 'soin', formule: '1d4' }, { type: 'special', note: 'Il rugit.' }] }), ['m-r1-B'], ctx([m]), suite([2, 4]));
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { pv: 12, aTerre: false, tourActions: 6, principale: false, secondaire: true, mvt: 0, sprint: false, usages: {} } }]);
    expect(t).toMatch(/^Souffle sur A : soin 2 ; A : .+ ; MJ : Il rugit\.$/);
    appels.length = 0;
    const r = await AM.jouerCapaciteMonstre('c1', combat, m, souffle({ cible: 'aucune', prend: 'reaction', limite: { parRound: 2 }, effets: [] }), [], ctx([m]));
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${C}/m-r1-A`, donnees: { usages: { reaction: 6, 'n:c:Souffle': 1, 'r:c:Souffle': 2, 'nr:c:Souffle': 1 } } }]);
    expect(r).toBe('Souffle : rien');
    appels.length = 0;
    expect(await AM.jouerCapaciteMonstre('c1', combat, m, souffle({ cible: 'aucune', limite: {}, effets: [] }), ['m-r1-B'], ctx([m, monstre('B')]))).toBe('Souffle : rien');
    await expect(AM.jouerCapaciteMonstre('c1', combat, monstre('A', { usages: { reaction: 6 } }), souffle({ cible: 'aucune', prend: 'reaction', effets: [] }), [], ctx([m]))).rejects.toThrow('A a déjà réagi ce round.');
  });

  it('refusée : pas un monstre debout, il ne peut pas agir, déjà servie, son action prise, sans cible, cible absente, fiche manquante, hors de portée', async () => {
    const m = monstre('A');
    const b = monstre('B');
    const jouer = (qui: Combattant & { id: string }, cap = souffle(), cibles = ['m-r1-B'], c = ctx([m, b])) => AM.jouerCapaciteMonstre('c1', combat, qui, cap, cibles, c);
    await expect(jouer(pj('p1'))).rejects.toThrow('Seul un monstre debout');
    await expect(jouer(monstre('A', { aTerre: true }))).rejects.toThrow('Seul un monstre debout');
    await expect(jouer(monstre('A', { etats: [etat('endormi')] as never }))).rejects.toThrow('A ne peut pas agir ce tour.');
    await expect(jouer(monstre('A', { etats: [etat('etourdi')] as never }))).rejects.toThrow('A ne peut que se déplacer ce tour.');
    await expect(jouer(monstre('A', { usages: { 'n:c:Souffle': 1, 'r:c:Souffle': 1 } }))).rejects.toThrow('Souffle : déjà servie ce combat.');
    await expect(jouer(monstre('A', { tourActions: 6, principale: true }))).rejects.toThrow('L’action principale est déjà prise ce tour.');
    await expect(jouer(monstre('A', { tourActions: 6, secondaire: true }), souffle({ prend: 'secondaire' }))).rejects.toThrow('L’action bonus est déjà prise ce tour.');
    await expect(jouer(m, souffle(), [])).rejects.toThrow('Coche ses cibles.');
    await expect(jouer(m, souffle({ cible: 'allie' }), [])).rejects.toThrow('Coche ses cibles.');
    await expect(jouer(m, souffle({ cible: 'zone' }), [])).rejects.toThrow('Coche ses cibles.');
    await expect(jouer(m, souffle(), ['x'])).rejects.toThrow('Une cible n’est plus dans le combat.');
    await expect(jouer(m, souffle(), ['m-r1-B'], ctx([m, monstre('B', { aTerre: true })]))).rejects.toThrow('Une cible n’est plus dans le combat.');
    await expect(jouer(m, souffle(), ['m-r1-B'], ctx([m, monstre('B', { mort: true })]))).rejects.toThrow('Une cible n’est plus dans le combat.');
    await expect(jouer(m, souffle(), ['pj-p1'], ctx([m, pj('p1')]))).rejects.toThrow('La fiche de p1 manque.');
    await expect(jouer(m, souffle(), ['pj-p1'], ctx([m, pj('p1')]))).rejects.toBeInstanceOf(RefusCombat);
    await expect(jouer(m, souffle(), ['pj-p1'], ctx([m, pj('p1', { perso: null })]))).rejects.toThrow('La fiche de p1 manque.');
    const carte = { scene: {}, jetons: [{ id: 'm-r1-A', cx: 0, cy: 0 }, { id: 'm-r1-B', cx: 3, cy: 0 }] };
    await expect(jouer(m, souffle({ portee: 2 }), ['m-r1-B'], ctx([m, b], carte))).rejects.toThrow('B est hors de portée (3 cases, 2 au plus).');
    await expect(jouer(m, souffle({ portee: 2, cible: 'allie' }), ['m-r1-B'], ctx([m, b], carte))).rejects.toThrow('hors de portée');
    expect(appels).toEqual([]);
    // À portée, sans carte, en zone, ou un jeton absent : elle part.
    enBase(m);
    enBase(b);
    await expect(jouer(m, souffle({ portee: 3 }), ['m-r1-B'], ctx([m, b], carte))).resolves.toBeTypeOf('string');
    await expect(jouer(m, souffle({ portee: 2 }), ['m-r1-B'], ctx([m, b]))).resolves.toBeTypeOf('string');
    await expect(jouer(m, souffle({ portee: 2, cible: 'zone' }), ['m-r1-B'], ctx([m, b], carte))).resolves.toBeTypeOf('string');
    await expect(jouer(m, souffle({ portee: 2 }), ['m-r1-B'], ctx([m, b], { scene: {}, jetons: [{ id: 'm-r1-B', cx: 3, cy: 0 }] }))).resolves.toBeTypeOf('string');
    await expect(jouer(m, souffle({ portee: 2 }), ['m-r1-B'], ctx([m, b], { scene: {}, jetons: [{ id: 'm-r1-A', cx: 0, cy: 0 }] }))).resolves.toBeTypeOf('string');
    await expect(jouer(monstre('A', { etats: [etat('immobilise'), etat('effroi')] as never }))).resolves.toBeTypeOf('string');
  });

  it('un combattant disparu de la base n’est pas écrit', async () => {
    const m = monstre('A');
    const b = monstre('B');
    enBase(m);
    await AM.jouerCapaciteMonstre('c1', combat, m, souffle(), ['m-r1-B'], ctx([m, b]), suite([4, 6]));
    expect(appels.map((a) => a.chemin)).toEqual([`${C}/m-r1-A`]);
    expect(journal.noterJet.mock.calls[0]![4]).toContain('MJ : degats sur m-r1-B');
  });

  it('7a : le MJ corrige le compteur des résistances légendaires, dans ses bornes', async () => {
    const boss = monstre('A', { boss: true, legendaire: 2, usages: { x: 1, legendaire: 1 } });
    await AM.corrigerLegendaire('c1', boss, 1);
    expect(appels[0]).toEqual({ fn: 'updateDoc', chemin: `${C}/m-r1-A`, donnees: { usages: { x: 1, legendaire: 2 } } });
    expect(journal.noterJet).toHaveBeenCalledWith('Résistance légendaire de A', '0', { des: [], faces: 0, bonus: 0, total: 0 }, 'MJ', 'corrigée : 0/2 restantes.');
    await AM.corrigerLegendaire('c1', boss, -1);
    expect(appels[1]!.donnees).toEqual({ usages: { x: 1 } });
    expect(journal.noterJet.mock.calls[1]![4]).toBe('corrigée : 2/2 restantes.');
    await AM.corrigerLegendaire('c1', monstre('A', { boss: true, legendaire: 2, usages: { legendaire: 2 } }), 1);
    expect(appels[2]!.donnees).toEqual({ usages: { legendaire: 2 } });
    await AM.corrigerLegendaire('c1', monstre('A', { usages: {} }), -1);
    expect(appels[3]!.donnees).toEqual({ usages: {} });
    expect(journal.noterJet.mock.calls[3]![4]).toBe('corrigée : 0/0 restantes.');
  });

  it('7a : dans un lancer, une résistance sert une fois : Rayon et Gel (DEX, puis FOR) sur un boss qui n’en a qu’une', () => {
    const { etatParId, elementParId, combinaisons, actionParId } = R;
    const sauv = { FOR: 0, DEX: 0, CON: 0, Volonte: 0 };
    const r = resoudreLancer(
      {
        action: actionParId.get('evocation.rayon')!,
        palier: 'I',
        lanceur: { id: 'mage', camp: 'pj', def: 12, sauvegardes: sauv, etats: [], modMagie: 3, attaqueMagique: 5, niveau: 6, pv: 30, pvMax: 30 },
        cibles: [],
        zone: [{ id: 'boss', camp: 'ennemi', def: 12, sauvegardes: sauv, etats: [], distance: 3, legendaire: 1 }],
        element: { id: 'glace', maitrise: 'maitre' },
        secondElement: { id: 'eau', maitrise: 'maitre' },
        alea: suite([2, 20], [2, 2], [2, 2], [2, 2], [2, 20]),
      },
      { etats: etatParId, elements: elementParId, combinaisons },
    );
    if (!r.ok) throw new Error(r.raison);
    const saves = r.jets.filter((j) => j.cible === 'boss' && j.quoi.startsWith('sauvegarde'));
    expect(saves.map((j) => [j.quoi, j.reussi, !!j.legendaire])).toEqual([
      ['sauvegarde de DEX (résistance légendaire)', true, true],
      ['sauvegarde de FOR (élément)', false, false],
    ]);
  });

  it('7a : les résistances qui ont servi, par cible', () => {
    expect([...LG.legendairesServies([{ cible: 'a', legendaire: true }, { cible: 'a', legendaire: true }, { cible: 'b' }, { legendaire: true }, { cible: 'c', legendaire: true }])]).toEqual([
      ['a', 2],
      ['c', 1],
    ]);
  });
});
