import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Sorts en scène (lot G2b, décisions de Thomas du 22/10/2026) : 1a (le sort
 * se déclare avec l'action, le d20 part), 2b (refusé : l'action est défaite,
 * le joueur rejoue), 3a (bonus de 0 à celui du palier), 5a et 14b
 * (sauvegarde de la cible), 6a (mineurs au bonus de leur palier), 7a
 * (options qui portent un sort), 7b (raté au jet d'échec : un échec de la
 * scène), 13a (+1, +2, +3).
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
    FieldPath,
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => {
      const chemin = p.length ? p.join('/') : `${(parent as { chemin: string }).chemin}/auto${++n}`;
      return { chemin, id: chemin.split('/').pop() };
    },
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
          ecritures.push(champs.length === 1 ? { fn: 'tx.update', chemin: r.chemin, donnees: champs[0] } : { fn: 'tx.update', chemin: r.chemin, champs });
        },
        delete: (r: { chemin: string }) => {
          ecritures.push({ fn: 'tx.delete', chemin: r.chemin });
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
vi.mock('../../src/lib/actions/vecu', () => ({ donnerCranVecu: vi.fn() }));

const { session } = await import('../../src/lib/session.svelte');
const H = await import('../../src/lib/scenes/hors-combat');
const L = await import('../../src/lib/fiche/sorts-hors-combat');
const S = await import('../../src/lib/actions/scenes-hors-combat');
const A = await import('../../src/lib/actions/sorts-hors-combat');
const { schemaDemandeSort, BONUS_PALIER } = await import('../../src/lib/schemas/sort-hors-combat');
const R = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { classeParId } = await import('../../src/regles');
type Scene = import('../../src/lib/schemas/scene-hors-combat').SceneHorsCombat;
type Action = import('../../src/lib/schemas/scene-hors-combat').ActionScene;
type DemandeSort = import('../../src/lib/schemas/sort-hors-combat').DemandeSort;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const kylhian = (): FicheV2 & { id: string } => {
  const v1 = { ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith('Kylhian')), 'alice', 1).fiche, niveau: 5 };
  const f = R.convertirFiche(v1, { ...R.refonteVierge(classeParId.get('magicien')!, 5), ecole: 'evocation', elementDepart: 'feu', mineurs: ['mineur.lumiere'], rangs: { 'magicien.ecole': 4 } });
  return { ...f, ppActuel: 10, octrois: { ...f.octrois, verbes: [{ id: 'illusion.leurre', maitrise: 'nonMaitrise' }] }, id: 'p-k' };
};
const APPELES = [
  { uid: 'alice', perso: 'p-k', nom: 'Kylhian' },
  { uid: 'bob', perso: 'p-kargash', nom: 'Kargash' },
];
const scene = (s: Partial<Scene> = {}): Scene => ({
  type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'Savoir d’où vient la fiole', mode: 'individuel', competence: null,
  requis: 3, toleres: 2, echecsVisibles: true, marquante: false, appeles: APPELES, appelesUids: ['alice', 'bob'], tour: 1, reussites: 0, echecs: 0,
  depart: 'neutre', hausses: 0, baisses: 0, menaces: 0, temp: 0, mensonges: 0, seduction: null, statut: 'ouverte', issue: null, creeLe: 1, closeLe: null,
  peuple: 0, foule: false, autorite: false, vecus: {}, usages: {}, ...s,
});
const action = (a: Partial<Action> = {}): Action => ({
  uid: 'alice', perso: 'p-k', nom: 'Kylhian', tour: 1, option: 'convaincre', competence: 'Persuasion', de: 10, bonus: 1, resultat: null, creeLe: 1,
  relance: false, note: null, delta: null, annule: false, sort: null, ...a,
});
const demande = (d: Partial<DemandeSort> = {}): DemandeSort => ({
  uid: 'alice', perso: 'p-k', nom: 'Kylhian', sort: 'enchantement.charme', nomSort: 'Charme', palier: 'II', pp: 2, echec: 0, sauvegarde: null, dd: null,
  intention: 'Le garde me trouve sympathique', textes: ['x', 'y'], statut: 'attente', motif: null, de: null, resistance: null,
  scene: 'sh1', action: '1-alice', bonus: null, creeLe: 1, majLe: 1, ...d,
});
const C = 'tables/t1/scenesHorsCombat/sh1';
const DEM = 'tables/t1/sortsHorsCombat/d1';

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  journal.de = 14;
  journal.lancerEtNoter.mockClear();
});

describe('le sort dans le jet (règles pures)', () => {
  it('13a : le bonus du palier', () => {
    expect(BONUS_PALIER).toEqual({ I: 1, II: 2, III: 3 });
  });

  it('tranché ou non : accord, lancement, sauvegarde ; ce qu’il fait au jet', () => {
    expect(L.effetEnScene(demande())).toBeNull();
    expect(L.effetEnScene(demande({ statut: 'acceptee', bonus: 2 }))).toBeNull();
    expect(L.effetEnScene(demande({ statut: 'refusee' }))).toBeNull();
    expect(L.effetEnScene(demande({ statut: 'lancee', bonus: 2 }))).toEqual({ rate: false, bonus: 2, note: 'Charme II +2' });
    expect(L.effetEnScene(demande({ statut: 'lancee', bonus: 0 }))).toEqual({ rate: false, bonus: 0, note: 'Charme II +0' });
    expect(L.effetEnScene(demande({ statut: 'ratee', de: 3, echec: 10 }))).toEqual({ rate: true, bonus: 0, note: 'Charme II raté' });
    const aSauvegarde = demande({ statut: 'lancee', bonus: 2, sauvegarde: 'Volonte', dd: 14 });
    expect(L.effetEnScene(aSauvegarde)).toBeNull();
    expect(L.effetEnScene({ ...aSauvegarde, resistance: { de: 18, bonus: 0, reussie: true } })).toEqual({ rate: false, bonus: 0, note: 'Charme II, la cible résiste' });
    expect(L.effetEnScene({ ...aSauvegarde, resistance: { de: 3, bonus: 0, reussie: false } })).toEqual({ rate: false, bonus: 2, note: 'Charme II +2' });
  });

  it('le bonus du sort fait réussir un jet qui aurait raté ; la note le dit', () => {
    // DD 13 à Neutre ; 10 + 1 = 11 : raté sans sort, réussi avec +2.
    expect(H.resoudre(scene(), 13, action()).resultat).toBe('echec');
    const r = H.resoudre(scene(), 13, action(), { rate: false, bonus: 2, note: 'Charme II +2' });
    expect(r.resultat).toBe('reussite');
    expect(r.note).toBe('Charme II +2');
    expect(r.scene).toMatchObject({ reussites: 1, hausses: 1 });
  });

  it('7b : raté au jet d’échec, un échec de la scène, quel que soit le d20, sans toucher à l’attitude', () => {
    const r = H.resoudre(scene(), 13, action({ de: 19, option: 'menacer', competence: 'Intimidation' }), { rate: true, bonus: 0, note: 'Charme II raté' });
    expect(r.resultat).toBe('echec');
    expect(r.note).toBe('Charme II raté');
    expect(r.delta).toEqual({ echecs: 1 });
    expect(r.scene).toMatchObject({ echecs: 1, baisses: 0 });
  });

  it('le Vécu garde sa note à côté du sort ; Séduire d’un autre reste dû', () => {
    const s = scene({ vecus: { alice: ['langue-d-argent'] }, seduction: 'bob' });
    // 9 + 1 + 1 (Séduire de Bob) + 0 = 11 ; DD 13 : raté de 2, Langue d'argent le rattrape.
    const r = H.resoudre(s, 13, action({ de: 9 }), { rate: false, bonus: 0, note: 'Charme II +0' });
    expect(r.resultat).toBe('reussite');
    expect(r.note).toBe('Langue d’argent');
    expect(r.scene.seduction).toBeNull();
    // Le sort ne consomme pas le +1 de Séduire sur une compétence hors social.
    const l = H.resoudre(scene({ type: 'exploration', pnj: null, depart: null, seduction: 'bob' }), 13, action({ option: 'competence', competence: 'Perception', de: 12 }), { rate: false, bonus: 1, note: 'Lumière I +1' });
    expect(l.resultat).toBe('reussite');
    expect(l.scene.seduction).toBe('bob');
  });

  it('7a : les options qui portent un sort', () => {
    expect(H.OPTIONS_AVEC_SORT).toEqual(['convaincre', 'menacer', 'tromper', 'seduire', 'competence']);
  });

  it('schéma : scène et action vont ensemble ; un bonus est en scène, au plus celui du palier', () => {
    expect(schemaDemandeSort.safeParse(demande()).success).toBe(true);
    expect(schemaDemandeSort.safeParse(demande({ action: null })).success).toBe(false);
    expect(schemaDemandeSort.safeParse(demande({ statut: 'acceptee', bonus: 2 })).success).toBe(true);
    expect(schemaDemandeSort.safeParse(demande({ statut: 'acceptee', bonus: 3 })).success).toBe(false);
    expect(schemaDemandeSort.safeParse(demande({ scene: null, action: null, bonus: 1 })).success).toBe(false);
    // Une demande de G2a, sans les champs de G2b, reste valide.
    const { scene: _s, action: _a, bonus: _b, ...g2a } = demande({ scene: null, action: null });
    expect(schemaDemandeSort.parse(g2a)).toMatchObject({ scene: null, action: null, bonus: null });
  });
});

describe('le joueur agit avec un sort (1a, 7a)', () => {
  const joint = (patch: Partial<import('../../src/lib/actions/scenes-hors-combat').SortJoint> = {}) => ({ fiche: kylhian(), sort: 'mineur.lumiere', palier: 'I' as const, intention: 'Éclairer le registre', ...patch });

  it('la demande part d’abord, pour cette scène et cette action ; puis le d20, puis l’action qui la porte', async () => {
    const a = await S.agirEnScene('sh1', scene({ type: 'enquete', pnj: null, depart: null }), 'competence', 'Perception', 2, joint());
    expect(appels.map((x) => [x.fn, x.chemin])).toEqual([
      ['setDoc', expect.stringMatching(/^tables\/t1\/sortsHorsCombat\/auto\d+$/)],
      ['setDoc', `${C}/actions/1-alice`],
    ]);
    const id = appels[0]!.chemin.split('/').pop();
    expect(appels[0]!.donnees).toMatchObject({ sort: 'mineur.lumiere', palier: 'I', pp: 0, scene: 'sh1', action: '1-alice', statut: 'attente', bonus: null });
    expect(journal.lancerEtNoter).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ sort: id, de: 14, resultat: null });
  });

  it('refuse : Lire les gens, Citer, Passer ; le sort d’un autre personnage ; rien n’est écrit', async () => {
    const s = scene({ vecus: { alice: ['lire-les-gens'] } });
    await expect(S.agirEnScene('sh1', s, 'lire', 'Discernement', 0, joint())).rejects.toThrow('option sociale ou une compétence');
    await expect(S.agirEnScene('sh1', s, 'passer', null, 0, joint())).rejects.toThrow('option sociale ou une compétence');
    await expect(S.agirEnScene('sh1', s, 'convaincre', 'Persuasion', 0, joint({ fiche: { ...kylhian(), id: 'p-autre' } }))).rejects.toThrow('personnage appelé');
    expect(appels).toEqual([]);
    expect(journal.lancerEtNoter).not.toHaveBeenCalled();
  });

  it('sans sort : l’action porte sort: null', async () => {
    const a = await S.agirEnScene('sh1', scene(), 'convaincre', 'Persuasion', 1);
    expect(a.sort).toBeNull();
  });
});

describe('le MJ tranche (2b, 3a)', () => {
  it('accepte avec un bonus, borné au palier', async () => {
    await A.repondreDemandeSort({ ...demande(), id: 'd1' }, true, '', 5);
    await A.repondreDemandeSort({ ...demande({ palier: 'I' }), id: 'd1' }, true, ' Bien vu ', 0);
    expect(appels.map((a) => a.donnees)).toEqual([
      { statut: 'acceptee', motif: null, bonus: 2, majLe: expect.any(Number) },
      { statut: 'acceptee', motif: 'Bien vu', bonus: 0, majLe: expect.any(Number) },
    ]);
  });

  it('refuse : la demande, et l’action du tour défaite pour que le joueur rejoue', async () => {
    await A.repondreDemandeSort({ ...demande(), id: 'd1' }, false, 'Pas devant le capitaine');
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: DEM, donnees: { statut: 'refusee', motif: 'Pas devant le capitaine', majLe: expect.any(Number) } },
      { fn: 'tx.delete', chemin: `${C}/actions/1-alice` },
    ]);
  });

  it('le lancement en scène est noté « en scène » au journal', async () => {
    base.set(DEM, demande({ statut: 'acceptee', bonus: 2 }) as unknown as Record<string, unknown>);
    const { id: _id, ...f } = kylhian();
    base.set('tables/t1/persos/p-k', f as unknown as Record<string, unknown>);
    await A.lancerSort('d1', 's1', () => 0);
    expect(appels.find((a) => a.fn === 'tx.set')!.donnees).toMatchObject({ libelle: 'Charme II, en scène' });
  });
});

describe('résoudre une action qui porte un sort (client du MJ)', () => {
  const poser = (d: DemandeSort | null, a: Partial<Action> = {}) => {
    base.set(C, scene() as unknown as Record<string, unknown>);
    base.set('tables/t1/scenesHorsCombatMj/sh1', { dd: 13 });
    base.set(`${C}/actions/1-alice`, action({ sort: 'd1', ...a }) as unknown as Record<string, unknown>);
    if (d) base.set(DEM, d as unknown as Record<string, unknown>);
  };

  it('tant que le sort n’est pas tranché, ou s’il manque, rien', async () => {
    for (const d of [demande(), demande({ statut: 'acceptee', bonus: 2 }), demande({ statut: 'lancee', bonus: 2, sauvegarde: 'Volonte', dd: 14 }), null]) {
      base.clear();
      poser(d);
      await S.resoudreAction('sh1', '1-alice');
      expect(appels).toEqual([]);
    }
  });

  it('lancé : le bonus entre dans le jet, la note sur l’action', async () => {
    poser(demande({ statut: 'lancee', bonus: 2 }));
    await S.resoudreAction('sh1', '1-alice');
    expect(appels[0]).toEqual({ fn: 'tx.update', chemin: `${C}/actions/1-alice`, donnees: { resultat: 'reussite', note: 'Charme II +2', delta: { reussites: 1, hausses: 1 } } });
  });

  it('la cible a résisté : pas de bonus ; raté au jet d’échec : échec de la scène', async () => {
    poser(demande({ statut: 'lancee', bonus: 2, sauvegarde: 'Volonte', dd: 14, resistance: { de: 17, bonus: 0, reussie: true } }));
    await S.resoudreAction('sh1', '1-alice');
    expect(appels[0]!.donnees).toMatchObject({ resultat: 'echec', note: 'Charme II, la cible résiste' });
    appels.length = 0;
    base.clear();
    poser(demande({ statut: 'ratee', echec: 10, de: 4 }), { de: 20 });
    await S.resoudreAction('sh1', '1-alice');
    expect(appels[0]!.donnees).toMatchObject({ resultat: 'echec', note: 'Charme II raté', delta: { echecs: 1 } });
  });
});
