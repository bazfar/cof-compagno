import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Scène hors combat jouée (lot S2, décisions de Thomas du 22/10/2026) :
 * la table des options sociales (8a), le DD modulé par l'attitude (15a),
 * le tour de table (7a), la clôture (8a, 9a, 10b, 13c), les mensonges (9a),
 * le Vécu d'une scène marquante (10a), et les écritures à travers un faux
 * SDK Firestore.
 */

const appels: { fn: string; chemin: string; donnees?: unknown; options?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin), get: (c: string) => base.get(chemin)?.[c] });
  return {
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? { chemin: p.join('/') } : { chemin: `${(parent as { chemin: string }).chemin}/auto${++n}` }),
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
    },
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => lu(r.chemin),
        set: (r: { chemin: string }, donnees: unknown, options?: unknown) => {
          ecritures.push({ fn: 'tx.set', chemin: r.chemin, donnees, ...(options ? { options } : {}) });
        },
        update: (r: { chemin: string }, donnees: unknown) => {
          ecritures.push({ fn: 'tx.update', chemin: r.chemin, donnees });
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
const vecu = vi.hoisted(() => ({ donnerCranVecu: vi.fn(async (_p: string, _d: 1 | -1, _l: string, _s?: string) => ({})) }));
vi.mock('../../src/lib/actions/vecu', () => vecu);

const { session } = await import('../../src/lib/session.svelte');
const H = await import('../../src/lib/scenes/hors-combat');
const S = await import('../../src/lib/actions/scenes-hors-combat');
const { decouvrirMensonge } = await import('../../src/lib/pnj/attitude');
const { schemaSceneHorsCombat, schemaActionScene } = await import('../../src/lib/schemas/scene-hors-combat');
const { schemaPnj } = await import('../../src/lib/schemas/pnj');
type Scene = import('../../src/lib/schemas/scene-hors-combat').SceneHorsCombat;
type Action = import('../../src/lib/schemas/scene-hors-combat').ActionScene;
type Pnj = import('../../src/lib/schemas/pnj').Pnj;

const APPELES = [
  { uid: 'alice', perso: 'p-magnus', nom: 'Magnus' },
  { uid: 'bob', perso: 'p-kargash', nom: 'Kargash' },
];
const scene = (s: Partial<Scene> = {}): Scene => ({
  type: 'social',
  pnj: 'pnj-aude',
  cible: 'Aude Berlan',
  objectif: 'Savoir d’où vient la fiole',
  mode: 'individuel',
  competence: null,
  requis: 3,
  toleres: 2,
  echecsVisibles: true,
  marquante: false,
  appeles: APPELES,
  appelesUids: ['alice', 'bob'],
  tour: 1,
  reussites: 0,
  echecs: 0,
  depart: 'neutre',
  hausses: 0,
  baisses: 0,
  menaces: 0,
  temp: 0,
  mensonges: 0,
  seduction: null,
  statut: 'ouverte',
  issue: null,
  creeLe: 1,
  closeLe: null,
  ...s,
});
const lieu = (s: Partial<Scene> = {}) => scene({ type: 'exploration', pnj: null, cible: 'Celliers du B0', depart: null, ...s });
const action = (a: Partial<Action> = {}): Action => ({ uid: 'alice', perso: 'p-magnus', nom: 'Magnus', tour: 1, option: 'convaincre', competence: 'Persuasion', de: 10, bonus: 3, resultat: null, creeLe: 1, ...a });
const pnj = (p: Partial<Pnj> = {}): Pnj => ({ nom: 'Aude Berlan', faction: null, lore: null, rencontre: true, cran: 'neutre', tendance: null, mensonges: 0, creeLe: 1, majLe: 1, ...p });

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'mj';
  journal.de = 14;
  journal.lancerEtNoter.mockClear();
  vecu.donnerCranVecu.mockClear();
});

describe('ouvrir (1a, 11a)', () => {
  it('repères de difficulté du cadre, et un échec toléré de plus par tranche de 3 appelés au-delà de 3', () => {
    expect(Object.values(H.DIFFICULTES).map((d) => [d.dd, d.requis, d.toleres])).toEqual([[10, 2, 2], [13, 3, 2], [16, 4, 2], [18, 5, 3]]);
    expect([1, 3, 5, 6, 8, 9, 12].map((n) => H.toleresPourLeGroupe(2, n))).toEqual([2, 2, 2, 3, 3, 4, 5]);
  });

  it('ce qui manque : PNJ en social, pas de groupe en social, lieu, objectif, compétence du groupe, appelés', () => {
    const b = { type: 'social' as const, pnj: 'x', cible: 'X', objectif: 'O', mode: 'individuel' as const, competence: null, appeles: APPELES };
    expect(H.manquePourOuvrir(b)).toBeNull();
    expect(H.manquePourOuvrir({ ...b, pnj: null })).toBe('Une scène sociale vise un PNJ rencontré.');
    expect(H.manquePourOuvrir({ ...b, mode: 'groupe', competence: 'Persuasion' })).toBe('Une scène sociale se joue en mode individuel.');
    expect(H.manquePourOuvrir({ ...b, type: 'exploration', cible: ' ' })).toBe('Nomme le lieu de la scène.');
    expect(H.manquePourOuvrir({ ...b, objectif: '' })).toBe('Donne l’objectif de la scène.');
    expect(H.manquePourOuvrir({ ...b, type: 'enquete', mode: 'groupe' })).toBe('Choisis la compétence que tout le groupe lance.');
    expect(H.manquePourOuvrir({ ...b, appeles: [] })).toBe('Appelle au moins un joueur.');
  });

  it('schéma : social = PNJ et individuel ; groupe = une compétence ; appelesUids suit appeles', () => {
    expect(schemaSceneHorsCombat.parse(scene())).toEqual(scene());
    expect(() => schemaSceneHorsCombat.parse(scene({ depart: null }))).toThrow();
    expect(() => schemaSceneHorsCombat.parse(scene({ mode: 'groupe', competence: 'Persuasion' }))).toThrow();
    expect(() => schemaSceneHorsCombat.parse(lieu({ mode: 'groupe' }))).toThrow();
    expect(schemaSceneHorsCombat.parse(lieu({ mode: 'groupe', competence: 'Perception' })).competence).toBe('Perception');
    expect(() => schemaSceneHorsCombat.parse(scene({ appelesUids: ['bob', 'alice'] }))).toThrow();
    expect(() => schemaActionScene.parse(action({ option: 'passer', de: null, competence: null, resultat: null }))).toThrow();
    expect(schemaActionScene.parse(action({ option: 'passer', de: null, competence: null, resultat: 'passe' })).resultat).toBe('passe');
  });
});

describe('choix du joueur (4b)', () => {
  it('social : les quatre options et leur compétence ; Séduire grisé sous Neutre', () => {
    expect(H.choixPossibles(scene()).map((c) => [c.nom, c.competence, c.refus])).toEqual([
      ['Convaincre', 'Persuasion', null],
      ['Menacer', 'Intimidation', null],
      ['Tromper', 'Bluff', null],
      ['Séduire', 'Persuasion', null],
    ]);
    expect(H.choixPossibles(scene({ depart: 'mefiant' }))[3]!.refus).toBe('Séduire demande une cible au moins Neutre.');
    // L'attitude du moment compte : une menace réussie remonte la cible pour la scène.
    expect(H.choixPossibles(scene({ depart: 'mefiant', temp: 2 }))[3]!.refus).toBeNull();
  });

  it('exploration ou enquête : la compétence au choix ; en groupe, celle du MJ', () => {
    expect(H.choixPossibles(lieu())).toEqual([{ option: 'competence', nom: 'Compétence au choix', competence: null, refus: null }]);
    expect(H.choixPossibles(lieu({ mode: 'groupe', competence: 'Perception' }))).toEqual([{ option: 'competence', nom: 'Perception', competence: 'Perception', refus: null }]);
  });
});

describe('résoudre un jet (5a, 8a, 15a)', () => {
  it('le DD est modulé par l’attitude du moment : Hostile +2 … Allié −3', () => {
    expect(H.ddEffectif(13, scene())).toBe(13);
    expect(H.ddEffectif(13, scene({ depart: 'hostile' }))).toBe(15);
    expect(H.ddEffectif(13, scene({ depart: 'connaissance', hausses: 1 }))).toBe(11);
    expect(H.ddEffectif(13, scene({ depart: 'favorable', temp: 4 }))).toBe(10);
    expect(H.ddEffectif(13, lieu())).toBe(13);
  });

  it('Convaincre : réussite +1 cran, une réussite ; échec : rien sur l’attitude', () => {
    const r = H.resoudre(scene(), 13, action({ de: 10 }));
    expect(r.resultat).toBe('reussite');
    expect([r.scene.reussites, r.scene.hausses, H.cranScene(r.scene)]).toEqual([1, 1, 'connaissance']);
    const e = H.resoudre(scene(), 13, action({ de: 9 }));
    expect([e.resultat, e.scene.echecs, e.scene.baisses]).toEqual(['echec', 1, 0]);
  });

  it('Menacer : réussite +2 crans pour la scène (4 au plus) ; échec −1 cran', () => {
    let s = H.resoudre(scene(), 13, action({ option: 'menacer', competence: 'Intimidation', de: 15 })).scene;
    expect([s.menaces, s.temp, s.hausses, H.cranScene(s)]).toEqual([1, 2, 0, 'favorable']);
    s = H.resoudre(s, 13, action({ uid: 'bob', option: 'menacer', competence: 'Intimidation', de: 15 })).scene;
    s = H.resoudre({ ...s, reussites: 0 }, 13, action({ option: 'menacer', competence: 'Intimidation', de: 15 })).scene;
    expect([s.menaces, s.temp]).toEqual([3, 4]);
    const e = H.resoudre(scene(), 13, action({ option: 'menacer', competence: 'Intimidation', de: 5 })).scene;
    expect([e.baisses, H.cranScene(e)]).toEqual([1, 'mefiant']);
  });

  it('Tromper : +1 cran et un mensonge à découvrir ; échec : rien de plus', () => {
    const s = H.resoudre(scene(), 13, action({ option: 'tromper', competence: 'Bluff', de: 12 })).scene;
    expect([s.hausses, s.mensonges]).toEqual([1, 1]);
    const e = H.resoudre(scene(), 13, action({ option: 'tromper', competence: 'Bluff', de: 2 })).scene;
    expect([e.baisses, e.mensonges]).toEqual([0, 0]);
  });

  it('Séduire : +1 cran, et +1 au prochain jet social d’un autre appelé (une fois) ; échec −1 cran', () => {
    const s = H.resoudre(scene(), 13, action({ option: 'seduire', de: 12 })).scene;
    expect([s.hausses, s.seduction]).toEqual([1, 'alice']);
    // DD 12 en Connaissance : Kargash fait 11 au total, +1 de la séduction.
    const k = H.resoudre(s, 13, action({ uid: 'bob', de: 8, bonus: 3 }));
    expect([k.resultat, k.scene.seduction]).toEqual(['reussite', null]);
    // Pas pour soi-même.
    expect(H.bonusSeduction(s, 'alice', 'convaincre')).toBe(0);
    expect(H.bonusSeduction(s, 'bob', 'competence')).toBe(0);
    const e = H.resoudre(scene(), 13, action({ option: 'seduire', de: 3 })).scene;
    expect([e.baisses, e.seduction]).toEqual([1, null]);
  });

  it('20 naturel : deux réussites, même sous le DD ; 1 naturel : échec et un cran de moins (en social)', () => {
    const v = H.resoudre(scene(), 30, action({ de: 20, bonus: -5 }));
    expect([v.resultat, v.scene.reussites]).toEqual(['reussite', 2]);
    const u = H.resoudre(scene(), 5, action({ de: 1, bonus: 20 }));
    expect([u.resultat, u.scene.baisses]).toEqual(['echec', 1]);
    const um = H.resoudre(scene(), 13, action({ option: 'menacer', competence: 'Intimidation', de: 1 })).scene;
    expect(um.baisses).toBe(2);
    expect(H.resoudre(lieu(), 13, action({ option: 'competence', competence: 'Perception', de: 1 })).scene.baisses).toBe(0);
  });

  it('la scène se termine d’elle-même : réussites atteintes (gagnée), échecs dépassés (perdue)', () => {
    const g = H.resoudre(scene({ reussites: 2 }), 13, action({ de: 15 })).scene;
    expect([g.statut, g.issue]).toEqual(['terminee', 'gagnee']);
    const p = H.resoudre(scene({ echecs: 2 }), 13, action({ de: 2 })).scene;
    expect([p.statut, p.issue]).toEqual(['terminee', 'perdue']);
    const encore = H.resoudre(scene({ echecs: 1 }), 13, action({ de: 2 })).scene;
    expect(encore.statut).toBe('ouverte');
    expect(() => H.resoudre(g, 13, action())).toThrow('n’attend plus');
    expect(() => H.resoudre(scene(), 13, action({ tour: 2 }))).toThrow('pas attendu');
    expect(() => H.resoudre(scene(), 13, action({ uid: 'carol' }))).toThrow('pas attendu');
  });

  it('passer : rien ne change', () => {
    const s = scene();
    expect(H.resoudre(s, 13, action({ option: 'passer', de: null, competence: null, resultat: 'passe' }))).toEqual({ resultat: 'passe', scene: s });
  });

  it('tour de table (7a) : le suivant s’ouvre quand chacun a agi ou passé', () => {
    expect(H.apresLeTour(scene(), [{ uid: 'alice', resultat: 'reussite' }]).tour).toBe(1);
    expect(H.apresLeTour(scene(), [{ uid: 'alice', resultat: 'reussite' }, { uid: 'bob', resultat: null }]).tour).toBe(1);
    expect(H.apresLeTour(scene(), [{ uid: 'alice', resultat: 'echec' }, { uid: 'bob', resultat: 'passe' }]).tour).toBe(2);
    expect(H.apresLeTour(scene({ statut: 'terminee' }), [{ uid: 'alice', resultat: 'echec' }, { uid: 'bob', resultat: 'passe' }]).tour).toBe(1);
  });
});

describe('clôture (8a, 9a, 10b, 13c)', () => {
  it('gagnée : un cran de mieux, un seul, quelles que soient les hausses de la scène', () => {
    expect(H.pnjApresScene(pnj(), scene({ hausses: 3 }), 'gagnee', 5)).toEqual(pnj({ cran: 'connaissance', tendance: 'hausse', majLe: 5 }));
    expect(H.pnjApresScene(pnj(), scene({ hausses: 3 }), 'perdue', 5).cran).toBe('neutre');
  });

  it('jamais au-delà de Favorable par la parole ; un Allié le reste', () => {
    expect(H.pnjApresScene(pnj({ cran: 'favorable' }), scene(), 'gagnee', 5).cran).toBe('favorable');
    expect(H.pnjApresScene(pnj({ cran: 'allie' }), scene(), 'gagnee', 5).cran).toBe('allie');
  });

  it('les baisses restent entières, et chaque menace réussie coûte un cran (10b), même gagnée', () => {
    expect(H.pnjApresScene(pnj(), scene({ baisses: 1, menaces: 1 }), 'gagnee', 5)).toMatchObject({ cran: 'mefiant', tendance: 'baisse' });
    expect(H.pnjApresScene(pnj(), scene({ menaces: 2 }), 'gagnee', 5).cran).toBe('mefiant');
    expect(H.pnjApresScene(pnj(), scene({ baisses: 9 }), 'abandonnee', 5).cran).toBe('hostile');
    // Sans issue : pas de gain.
    expect(H.pnjApresScene(pnj(), scene(), 'abandonnee', 5)).toEqual(pnj({ majLe: 5 }));
  });

  it('les mensonges réussis restent à découvrir (9a) : deux crans de moins chacun', () => {
    const p = H.pnjApresScene(pnj(), scene({ mensonges: 2 }), 'gagnee', 5);
    expect(p.mensonges).toBe(2);
    expect(decouvrirMensonge(p, 6)).toMatchObject({ cran: 'mefiant', tendance: 'baisse', mensonges: 1 });
    expect(decouvrirMensonge(pnj({ cran: 'mefiant', mensonges: 1 }), 6).cran).toBe('hostile');
    expect(() => decouvrirMensonge(pnj(), 6)).toThrow('Aucun mensonge');
  });

  it('Vécu d’une scène marquante (10a) : ceux qui ont apporté une réussite', () => {
    expect(H.contributeurs(scene(), [{ uid: 'bob', resultat: 'echec' }, { uid: 'bob', resultat: 'reussite' }, { uid: 'alice', resultat: 'passe' }])).toEqual([APPELES[1]]);
  });

  it('un PNJ créé avant S2, sans compteur de mensonges, en a zéro', () => {
    const { mensonges: _m, ...ancien } = pnj();
    expect(schemaPnj.parse(ancien).mensonges).toBe(0);
  });
});

describe('écritures', () => {
  const brouillon = { type: 'social' as const, pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'Savoir d’où vient la fiole', mode: 'individuel' as const, competence: null, dd: 13, requis: 3, toleres: 2, echecsVisibles: false, marquante: true, appeles: APPELES };

  it('ouvrir : la scène (attitude de départ lue sur le PNJ), le DD à part, la table ; une seule à la fois', async () => {
    base.set('tables/t1', { sceneActive: null });
    base.set('tables/t1/pnj/pnj-aude', pnj({ cran: 'connaissance' }));
    const id = await S.ouvrirScene(brouillon, 's0014');
    expect(appels.map((a) => a.chemin)).toEqual([`tables/t1/scenesHorsCombat/${id}`, `tables/t1/scenesHorsCombatMj/${id}`, 'tables/t1']);
    expect(appels[0]!.donnees).toMatchObject({ depart: 'connaissance', tour: 1, statut: 'ouverte', echecsVisibles: false, marquante: true, appelesUids: ['alice', 'bob'], seance: 's0014' });
    expect(appels[0]!.donnees).not.toHaveProperty('dd');
    expect(appels[1]!.donnees).toEqual({ dd: 13 });
    expect(appels[2]).toMatchObject({ donnees: { sceneHorsCombat: id }, options: { merge: true } });
    base.set('tables/t1', { sceneHorsCombat: 'autre' });
    await expect(S.ouvrirScene(brouillon)).rejects.toThrow('déjà en cours');
    base.set('tables/t1', {});
    base.set('tables/t1/pnj/pnj-aude', pnj({ rencontre: false, cran: null }));
    await expect(S.ouvrirScene(brouillon)).rejects.toThrow('pas encore rencontré');
    await expect(S.ouvrirScene({ ...brouillon, objectif: ' ' })).rejects.toThrow('objectif');
  });

  it('agir : le d20 au journal au nom du personnage, puis l’action du tour ; passer n’écrit que l’action', async () => {
    session.uid = 'alice';
    journal.de = 17;
    const a = await S.agirEnScene('sh1', scene({ tour: 2 }), 'convaincre', 'Persuasion', 3);
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Scène : Convaincre (Persuasion)', '1d20+3', 'Magnus');
    expect(appels).toEqual([{ fn: 'setDoc', chemin: 'tables/t1/scenesHorsCombat/sh1/actions/2-alice', donnees: a }]);
    expect(a).toMatchObject({ de: 17, bonus: 3, resultat: null, perso: 'p-magnus' });
    appels.length = 0;
    journal.lancerEtNoter.mockClear();
    await S.agirEnScene('sh1', scene(), 'passer', null, 0);
    expect(journal.lancerEtNoter).not.toHaveBeenCalled();
    expect(appels[0]).toMatchObject({ chemin: 'tables/t1/scenesHorsCombat/sh1/actions/1-alice', donnees: { option: 'passer', de: null, resultat: 'passe' } });
    session.uid = 'carol';
    await expect(S.agirEnScene('sh1', scene(), 'convaincre', 'Persuasion', 0)).rejects.toThrow('pas appelé');
  });

  it('résoudre (client du MJ) : le résultat sur l’action, la scène ; le tour tourne quand chacun a joué', async () => {
    const c = 'tables/t1/scenesHorsCombat/sh1';
    base.set(c, scene());
    base.set('tables/t1/scenesHorsCombatMj/sh1', { dd: 13 });
    base.set(`${c}/actions/1-alice`, action({ de: 12 }));
    await S.resoudreAction('sh1', '1-alice');
    expect(appels.map((a) => [a.fn, a.chemin, a.donnees])).toEqual([
      ['tx.update', `${c}/actions/1-alice`, { resultat: 'reussite' }],
      ['tx.set', c, scene({ reussites: 1, hausses: 1 })],
    ]);
    appels.length = 0;
    base.set(c, scene({ reussites: 1, hausses: 1 }));
    base.set(`${c}/actions/1-alice`, action({ de: 12, resultat: 'reussite' }));
    base.set(`${c}/actions/1-bob`, action({ uid: 'bob', option: 'passer', competence: null, de: null, resultat: 'passe' }));
    await S.resoudreAction('sh1', '1-bob');
    expect(appels).toEqual([{ fn: 'tx.set', chemin: c, donnees: scene({ reussites: 1, hausses: 1, tour: 2 }) }]);
    appels.length = 0;
    // Déjà résolu, et pas de tour à faire tourner : rien.
    base.set(`${c}/actions/1-bob`, action({ uid: 'bob', de: 3, resultat: null }));
    base.set(c, scene({ reussites: 1, hausses: 1, tour: 2 }));
    await S.resoudreAction('sh1', '1-bob');
    expect(appels).toEqual([]);
  });

  it('clore : confirme l’issue proposée, met à jour le PNJ et son historique, libère la table', async () => {
    const c = 'tables/t1/scenesHorsCombat/sh1';
    base.set(c, scene({ statut: 'terminee', issue: 'gagnee', menaces: 1, mensonges: 1, seance: 's0014' }));
    base.set('tables/t1/pnj/pnj-aude', pnj({ cran: 'connaissance' }));
    await expect(S.cloreScene('sh1', 'perdue')).rejects.toThrow('se confirme');
    const close = await S.cloreScene('sh1', 'gagnee');
    expect(close).toMatchObject({ statut: 'close', issue: 'gagnee' });
    expect(appels.map((a) => a.chemin.replace(/auto\d+$/, 'auto'))).toEqual(['tables/t1/pnj/pnj-aude', 'tables/t1/pnj/pnj-aude/historique/auto', c, 'tables/t1']);
    // Connaissance, +1 gagnée, −1 menace : Connaissance ; un mensonge à découvrir.
    expect(appels[0]!.donnees).toMatchObject({ cran: 'connaissance', mensonges: 1 });
    expect(appels[1]!.donnees).toMatchObject({ geste: 'scene', avant: 'connaissance', apres: 'connaissance', motif: 'Scène gagnée : Savoir d’où vient la fiole', seance: 's0014' });
    expect(appels[3]!.donnees).toEqual({ sceneHorsCombat: null });
    base.set(c, close);
    await expect(S.cloreScene('sh1', 'abandonnee')).rejects.toThrow('déjà close');
  });

  it('clore sans issue à tout moment ; une scène de lieu ne touche aucun PNJ', async () => {
    base.set('tables/t1/scenesHorsCombat/sh2', lieu());
    await S.cloreScene('sh2', 'abandonnee');
    expect(appels.map((a) => a.chemin)).toEqual(['tables/t1/scenesHorsCombat/sh2', 'tables/t1']);
  });

  it('Vécu (10a) : marquante gagnée seulement, et seulement à ceux qui ont réussi', async () => {
    const actions = [action({ resultat: 'reussite' }), action({ uid: 'bob', resultat: 'echec' })];
    const s = scene({ marquante: true, statut: 'close', issue: 'gagnee', seance: 's0014' });
    expect(await S.donnerVecuDeScene(s, actions, ['p-magnus', 'p-kargash'])).toBe(1);
    expect(vecu.donnerCranVecu.mock.calls).toEqual([['p-magnus', 1, 'Scène : Savoir d’où vient la fiole', 's0014']]);
    await expect(S.donnerVecuDeScene({ ...s, marquante: false }, actions, ['p-magnus'])).rejects.toThrow('marquante gagnée');
    await expect(S.donnerVecuDeScene({ ...s, issue: 'perdue' }, actions, ['p-magnus'])).rejects.toThrow('marquante gagnée');
  });
});
