import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Le Vécu en scène (lot S3, décisions de Thomas du 22/10/2026, 1a à 12a) :
 * Lire les gens, Homme du peuple, Orateur, Langue d'argent, Citer le
 * précédent, Levier, Crocheter et Désamorcer, Mémoire eidétique, les
 * questions au MJ, les capacités narratives, et le décompte des usages
 * (scène, séance) ; les écritures à travers un faux SDK Firestore.
 */

const appels: { fn: string; chemin: string; donnees?: unknown; options?: unknown; champ?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin), get: (c: string) => base.get(chemin)?.[c] });
  class FieldPath {
    segments: string[];
    constructor(...s: string[]) {
      this.segments = s;
    }
  }
  return {
    FieldPath,
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? { chemin: p.join('/') } : { chemin: `${(parent as { chemin: string }).chemin}/auto${++n}` }),
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
    },
    updateDoc: async (r: { chemin: string }, champ: unknown, valeur?: unknown) => {
      appels.push(champ instanceof FieldPath ? { fn: 'updateDoc', chemin: r.chemin, champ: champ.segments, donnees: valeur } : { fn: 'updateDoc', chemin: r.chemin, donnees: champ });
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
vi.mock('../../src/lib/actions/vecu', () => ({ donnerCranVecu: vi.fn() }));

const { session } = await import('../../src/lib/session.svelte');
const H = await import('../../src/lib/scenes/hors-combat');
const V = await import('../../src/lib/scenes/vecu-en-scene');
const S = await import('../../src/lib/actions/scenes-hors-combat');
const P = await import('../../src/lib/actions/pnj');
const { noeudVecuParId } = await import('../../src/regles');
type Scene = import('../../src/lib/schemas/scene-hors-combat').SceneHorsCombat;
type Action = import('../../src/lib/schemas/scene-hors-combat').ActionScene;
type Pnj = import('../../src/lib/schemas/pnj').Pnj;

const APPELES = [
  { uid: 'alice', perso: 'p-magnus', nom: 'Magnus' },
  { uid: 'bob', perso: 'p-kargash', nom: 'Kargash' },
];
const scene = (s: Partial<Scene> = {}): Scene => ({
  type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'Savoir d’où vient la fiole', mode: 'individuel', competence: null,
  requis: 3, toleres: 2, echecsVisibles: true, marquante: false, appeles: APPELES, appelesUids: ['alice', 'bob'], tour: 1, reussites: 0, echecs: 0,
  depart: 'neutre', hausses: 0, baisses: 0, menaces: 0, temp: 0, mensonges: 0, seduction: null, statut: 'ouverte', issue: null, creeLe: 1, closeLe: null,
  peuple: 0, foule: false, autorite: false, vecus: {}, usages: {}, ...s,
});
const lieu = (s: Partial<Scene> = {}) => scene({ type: 'exploration', pnj: null, cible: 'Celliers', depart: null, ...s });
const action = (a: Partial<Action> = {}): Action => ({
  uid: 'alice', perso: 'p-magnus', nom: 'Magnus', tour: 1, option: 'convaincre', competence: 'Persuasion', de: 10, bonus: 3, resultat: null, creeLe: 1,
  relance: false, note: null, delta: null, annule: false, ...a,
});
const pnj = (p: Partial<Pnj> = {}): Pnj => ({ nom: 'Aude Berlan', faction: null, lore: null, rencontre: true, cran: 'neutre', tendance: null, mensonges: 0, peuple: false, secrets: [], creeLe: 1, majLe: 1, ...p });
const avec = (...n: string[]) => ({ vecus: { alice: n } });

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'mj';
  journal.de = 14;
  journal.lancerEtNoter.mockClear();
});

describe('les nœuds en scène (12a : le Vécu seulement)', () => {
  it('chaque nœud nommé existe ; le décompte des narratifs suit leur usage dans le cadre (11a)', () => {
    for (const n of V.NOEUDS_EN_SCENE) expect(noeudVecuParId.has(n), n).toBe(true);
    for (const [n, d] of Object.entries(V.NARRATIFS)) {
      const usage = noeudVecuParId.get(n)!.effets.map((e) => e.usage).join(' ');
      expect([n, d]).toEqual([n, usage.includes('1x/scène') ? 'scene' : usage.includes('1x/jour') ? 'jour' : 'libre']);
    }
    expect(V.noeudsEnScene(['affable', 'orateur', 'compagnon-oiseau', 'pisteur'])).toEqual(['orateur', 'compagnon-oiseau']);
  });

  it('Mémoire eidétique relance les compétences d’INT et de CHA seulement (8a)', () => {
    expect(['Persuasion', 'Bluff', 'Investigation', 'Connaissances (histoire)'].every((c) => V.COMPETENCES_RELANCABLES.has(c))).toBe(true);
    expect(['Perception', 'Discernement', 'Athlétisme', 'Escamotage'].some((c) => V.COMPETENCES_RELANCABLES.has(c))).toBe(false);
  });

  it('une fois par séance : la séance de l’usage, ou hors séance (11a)', () => {
    expect(V.dejaUtiliseCetteSeance({}, 'memoire-eidetique', 's14')).toBe(false);
    expect(V.dejaUtiliseCetteSeance({ 'memoire-eidetique': { seance: 's14' } }, 'memoire-eidetique', 's14')).toBe(true);
    expect(V.dejaUtiliseCetteSeance({ 'memoire-eidetique': { seance: 's13' } }, 'memoire-eidetique', 's14')).toBe(false);
    expect(V.dejaUtiliseCetteSeance({ 'memoire-eidetique': { seance: 'hors-seance' } }, 'memoire-eidetique', undefined)).toBe(true);
  });
});

describe('options du Vécu (1a, 5a)', () => {
  it('Lire les gens et Citer le précédent, pour leur porteur ; Citer face à une autorité ; une fois par scène', () => {
    const noms = (s: Scene) => H.choixPossibles(s, 'alice').map((c) => [c.nom, c.competence, c.refus]).slice(4);
    expect(noms(scene())).toEqual([]);
    expect(noms(scene(avec('lire-les-gens', 'citer-le-precedent')))).toEqual([['Lire les gens', 'Discernement', null]]);
    expect(noms(scene({ ...avec('lire-les-gens', 'citer-le-precedent'), autorite: true }))).toEqual([
      ['Lire les gens', 'Discernement', null],
      ['Citer le précédent', 'Connaissances (histoire)', null],
    ]);
    expect(noms(scene({ ...avec('lire-les-gens'), usages: { alice: ['lire-les-gens'] } }))[0]![2]).toBe('Déjà utilisé dans cette scène.');
    expect(H.choixPossibles(scene(avec('lire-les-gens')), 'bob')).toHaveLength(4);
  });

  it('Lire les gens réussi : le DD du moment, au joueur seul, sans toucher aux compteurs ; raté : rien', () => {
    const s = scene({ ...avec('lire-les-gens'), depart: 'connaissance' });
    const r = H.resoudre(s, 13, action({ option: 'lire', competence: 'Discernement', de: 12 }));
    expect([r.resultat, r.revelation, r.scene.reussites, r.scene.echecs, r.scene.usages]).toEqual(['reussite', 12, 0, 0, { alice: ['lire-les-gens'] }]);
    const e = H.resoudre(s, 13, action({ option: 'lire', competence: 'Discernement', de: 2 }));
    expect([e.resultat, e.revelation, e.scene.echecs]).toEqual(['echec', null, 0]);
    expect(H.resoudre(scene(), 13, action({ option: 'lire', competence: 'Discernement', de: 20 }))).toMatchObject({ resultat: 'passe', note: 'Lire les gens indisponible' });
    expect(H.resoudre({ ...s, usages: { alice: ['lire-les-gens'] } }, 13, action({ option: 'lire', competence: 'Discernement', de: 20 })).resultat).toBe('passe');
  });

  it('Citer le précédent : une réussite pour la scène, sans changer l’attitude ; échec compté', () => {
    const s = scene({ ...avec('citer-le-precedent'), autorite: true });
    const r = H.resoudre(s, 13, action({ option: 'citer', competence: 'Connaissances (histoire)', de: 15 }));
    expect([r.resultat, r.scene.reussites, r.scene.hausses, r.note, r.scene.usages.alice]).toEqual(['reussite', 1, 0, 'Citer le précédent', ['citer-le-precedent']]);
    const e = H.resoudre(s, 13, action({ option: 'citer', competence: 'Connaissances (histoire)', de: 1 }));
    expect([e.scene.echecs, e.scene.baisses]).toEqual([1, 0]);
    expect(H.resoudre({ ...s, autorite: false }, 13, action({ option: 'citer', competence: 'Connaissances (histoire)', de: 15 })).resultat).toBe('passe');
  });
});

describe('le Vécu dans la résolution (2a, 3a, 4a, 7a)', () => {
  it('Homme du peuple : la scène commence un cran plus haut', () => {
    expect(H.cranScene(scene({ peuple: 1 }))).toBe('connaissance');
    expect(H.ddEffectif(13, scene({ peuple: 1 }))).toBe(12);
  });

  it('Orateur : face à une foule, ses réussites sociales comptent double (20 naturel : quatre)', () => {
    const s = scene({ ...avec('orateur'), foule: true });
    expect(H.resoudre(s, 13, action({ de: 12 })).scene.reussites).toBe(2);
    expect(H.resoudre(s, 13, action({ de: 20 })).scene.reussites).toBe(4);
    expect(H.resoudre(s, 13, action({ de: 12 })).note).toBe('Orateur');
    expect(H.resoudre({ ...s, foule: false }, 13, action({ de: 12 })).scene.reussites).toBe(1);
    expect(H.resoudre(s, 13, action({ uid: 'bob', de: 12 })).scene.reussites).toBe(1);
  });

  it('Langue d’argent : le premier jet social raté de 2 ou moins devient une réussite ; une fois par scène', () => {
    const s = scene(avec('langue-d-argent'));
    const r = H.resoudre(s, 13, action({ de: 8 }));
    expect([r.resultat, r.note, r.scene.hausses, r.scene.usages.alice]).toEqual(['reussite', 'Langue d’argent', 1, ['langue-d-argent']]);
    expect(H.resoudre(r.scene, 13, action({ de: 8 })).resultat).toBe('echec');
    expect(H.resoudre(s, 13, action({ de: 7 })).resultat).toBe('echec');
    expect(H.resoudre(s, 13, action({ de: 1, bonus: 15 })).resultat).toBe('echec');
    expect(H.resoudre(lieu(avec('langue-d-argent')), 13, action({ option: 'competence', competence: 'Perception', de: 8 })).resultat).toBe('echec');
  });

  it('Crocheter et Désamorcer : −1 DD chacun en Escamotage, hors social', () => {
    const esc = action({ option: 'competence', competence: 'Escamotage' });
    expect(H.ddDuJet(13, lieu(avec('crocheter', 'desamorcer')), esc)).toBe(11);
    expect(H.ddDuJet(13, lieu(avec('crocheter')), esc)).toBe(12);
    expect(H.ddDuJet(13, lieu(avec('crocheter')), action({ option: 'competence', competence: 'Perception' }))).toBe(13);
    expect(H.resoudre(lieu(avec('crocheter', 'desamorcer')), 13, { ...esc, de: 8 }).resultat).toBe('reussite');
  });

  it('Lire les gens n’apporte pas de Vécu de scène marquante (10a de S2)', () => {
    expect(H.contributeurs(scene(), [{ uid: 'alice', resultat: 'reussite', option: 'lire' }, { uid: 'bob', resultat: 'reussite', option: 'convaincre' }])).toEqual([APPELES[1]]);
  });
});

describe('Mémoire eidétique (8a) : relancer, défaire l’échec', () => {
  it('un échec rend son delta ; le défaire rouvre une scène que cet échec avait perdue', () => {
    const r = H.resoudre(scene({ echecs: 2 }), 13, action({ option: 'menacer', competence: 'Intimidation', de: 1 }));
    expect([r.scene.statut, r.delta]).toEqual(['terminee', { echecs: 1, baisses: 2 }]);
    const d = H.defaireJet(r.scene, r.delta);
    expect([d.statut, d.issue, d.echecs, d.baisses]).toEqual(['ouverte', null, 2, 0]);
    expect(() => H.defaireJet({ ...r.scene, statut: 'close' }, r.delta)).toThrow('close');
  });

  it('relançable : un échec d’INT ou de CHA, du porteur, pas déjà relancé ni annulé, scène pas close', () => {
    const s = scene(avec('memoire-eidetique'));
    const e = action({ resultat: 'echec' });
    expect(H.relancable(s, e)).toBe(true);
    expect(H.relancable(scene(), e)).toBe(false);
    expect(H.relancable(s, { ...e, resultat: 'reussite' })).toBe(false);
    expect(H.relancable(s, { ...e, competence: 'Perception' })).toBe(false);
    expect(H.relancable(s, { ...e, annule: true })).toBe(false);
    expect(H.relancable(s, { ...e, relance: true })).toBe(false);
    expect(H.relancable({ ...s, statut: 'close' }, e)).toBe(false);
    expect(H.relancable({ ...s, statut: 'terminee' }, e)).toBe(true);
  });

  it('une relance peut viser un tour passé ; pas un tour à venir', () => {
    expect(H.resoudre(scene({ tour: 3 }), 13, action({ tour: 2, relance: true, de: 15 })).resultat).toBe('reussite');
    expect(() => H.resoudre(scene({ tour: 3 }), 13, action({ tour: 4, relance: true }))).toThrow('pas attendu');
  });
});

describe('écritures', () => {
  const c = 'tables/t1/scenesHorsCombat/sh1';

  it('ouvrir : les nœuds utiles en scène de chaque appelé ; Homme du peuple face à un PNJ du peuple', async () => {
    base.set('tables/t1', {});
    base.set('tables/t1/pnj/pnj-aude', pnj({ peuple: true }));
    base.set('tables/t1/persos/p-magnus', { vecu: { crans: 0, paliers: 2, points: 0, noeuds: ['affable', 'homme-du-peuple', 'orateur'], noeudOffert: 'lire-les-gens' } });
    base.set('tables/t1/persos/p-kargash', { vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: 'marchander' } });
    await S.ouvrirScene({ type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'O', mode: 'individuel', competence: null, dd: 13, requis: 3, toleres: 2, echecsVisibles: true, marquante: false, foule: true, autorite: false, appeles: APPELES });
    expect(appels[0]!.donnees).toMatchObject({ peuple: 1, foule: true, autorite: false, vecus: { alice: ['lire-les-gens', 'homme-du-peuple', 'orateur'], bob: ['marchander'] }, usages: {} });
    appels.length = 0;
    base.set('tables/t1/pnj/pnj-aude', pnj({ peuple: false }));
    await S.ouvrirScene({ type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'O', mode: 'individuel', competence: null, dd: 13, requis: 3, toleres: 2, echecsVisibles: true, marquante: false, foule: false, autorite: false, appeles: APPELES });
    expect(appels[0]!.donnees).toMatchObject({ peuple: 0 });
    // Un PNJ du peuple, mais personne n'a Homme du peuple : rien.
    appels.length = 0;
    base.set('tables/t1/pnj/pnj-aude', pnj({ peuple: true }));
    base.set('tables/t1/persos/p-magnus', { vecu: { crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: 'lire-les-gens' } });
    await S.ouvrirScene({ type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'O', mode: 'individuel', competence: null, dd: 13, requis: 3, toleres: 2, echecsVisibles: true, marquante: false, foule: false, autorite: false, appeles: APPELES });
    expect(appels[0]!.donnees).toMatchObject({ peuple: 0 });
  });

  it('résoudre Lire les gens : la révélation va dans une question au joueur seul, avec le DD du moment', async () => {
    base.set(c, scene(avec('lire-les-gens')));
    base.set('tables/t1/scenesHorsCombatMj/sh1', { dd: 13 });
    base.set(`${c}/actions/1-alice`, action({ option: 'lire', competence: 'Discernement', de: 11 }));
    await S.resoudreAction('sh1', '1-alice');
    const q = appels.find((a) => a.chemin === 'tables/t1/questions/sh1-alice-lire');
    expect(q?.donnees).toMatchObject({ uid: 'alice', noeud: 'lire-les-gens', scene: 'sh1', dd: 13, question: null, reponse: null });
  });

  it('relance : l’échec est défait et annulé, le nouveau jet tranché ; une relance refusée passe', async () => {
    const echec = action({ option: 'menacer', competence: 'Intimidation', de: 1, resultat: 'echec', delta: { echecs: 1, baisses: 2 } });
    base.set(c, scene({ ...avec('memoire-eidetique'), echecs: 3, baisses: 2, statut: 'terminee', issue: 'perdue', tour: 2 }));
    base.set('tables/t1/scenesHorsCombatMj/sh1', { dd: 13 });
    base.set(`${c}/actions/1-alice`, echec);
    base.set(`${c}/actions/1-alice-r`, { ...echec, de: 15, resultat: null, relance: true, delta: null });
    await S.resoudreAction('sh1', '1-alice-r');
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([
      ['tx.update', `${c}/actions/1-alice`],
      ['tx.update', `${c}/actions/1-alice-r`],
      ['tx.set', c],
    ]);
    expect(appels[0]!.donnees).toEqual({ annule: true });
    expect(appels[1]!.donnees).toMatchObject({ resultat: 'reussite', note: 'Mémoire eidétique' });
    expect(appels[2]!.donnees).toMatchObject({ statut: 'ouverte', issue: null, echecs: 2, baisses: 0, reussites: 1, menaces: 1, temp: 2 });
    appels.length = 0;
    base.set(c, scene({ echecs: 1 }));
    await S.resoudreAction('sh1', '1-alice-r');
    expect(appels).toEqual([{ fn: 'tx.update', chemin: `${c}/actions/1-alice-r`, donnees: { resultat: 'passe', note: 'Relance refusée' } }]);
  });

  it('relancer (joueur) : le d20 au journal, l’action `-r`, l’usage de la séance ; une fois par séance', async () => {
    session.uid = 'alice';
    journal.de = 16;
    const s = scene({ ...avec('memoire-eidetique'), seance: 's14' });
    const echec = action({ resultat: 'echec', delta: { echecs: 1 } });
    await S.relancerEnScene('sh1', s, echec, {}, 's14');
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Scène : relance (Persuasion)', '1d20+3', 'Magnus');
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([
      ['setDoc', `${c}/actions/1-alice-r`],
      ['updateDoc', 'tables/t1/persos/p-magnus'],
    ]);
    expect(appels[0]!.donnees).toMatchObject({ de: 16, relance: true, resultat: null, delta: null });
    expect(appels[1]).toMatchObject({ champ: ['usages', 'memoire-eidetique'], donnees: { seance: 's14' } });
    await expect(S.relancerEnScene('sh1', s, echec, { 'memoire-eidetique': { seance: 's14' } }, 's14')).rejects.toThrow('déjà servi');
    await expect(S.relancerEnScene('sh1', s, { ...echec, competence: 'Perception' }, {}, 's14')).rejects.toThrow('pas être relancé');
  });

  it('relancer : l’action vient du magasin avec son `id`, que le schéma strict refuserait', async () => {
    session.uid = 'alice';
    journal.de = 11;
    const s = scene({ ...avec('memoire-eidetique'), seance: 's14' });
    // L'écran passe un AvecId<ActionScene> : le `id` du document en plus.
    const duMagasin = { ...action({ resultat: 'echec', delta: { echecs: 1 } }), id: '1-alice' };
    await S.relancerEnScene('sh1', s, duMagasin, {}, 's14');
    expect(appels[0]!.chemin).toBe(`${c}/actions/1-alice-r`);
    expect(appels[0]!.donnees).toMatchObject({ de: 11, relance: true, resultat: null });
    expect(appels[0]!.donnees).not.toHaveProperty('id');
  });

  it('capacités du Vécu (10a) : une fois par scène, une fois par séance, ou libre ; seulement pour leur porteur', async () => {
    session.uid = 'alice';
    const s = scene({ ...avec('compagnon-oiseau', 'faconnage', 'dechiffrer'), seance: 's14' });
    await S.utiliserCapacite('sh1', s, 'compagnon-oiseau', {});
    expect(appels[0]).toMatchObject({ fn: 'setDoc', chemin: `${c}/utilisations/alice-compagnon-oiseau`, donnees: { noeud: 'compagnon-oiseau', nom: 'Magnus' } });
    appels.length = 0;
    await S.utiliserCapacite('sh1', s, 'faconnage', {});
    expect(appels.map((a) => a.fn)).toEqual(['setDoc', 'updateDoc']);
    await expect(S.utiliserCapacite('sh1', s, 'faconnage', { faconnage: { seance: 's14' } })).rejects.toThrow('déjà servi');
    appels.length = 0;
    await S.utiliserCapacite('sh1', s, 'dechiffrer', {});
    expect(appels.map((a) => a.fn)).toEqual(['setDoc']);
    await expect(S.utiliserCapacite('sh1', s, 'marchander', {})).rejects.toThrow('pas cette capacité');
  });

  it('questions (9a) : Savant pendant une scène (une par scène), Réseau de rumeurs une fois par séance ; le MJ répond', async () => {
    session.uid = 'alice';
    const qui = { perso: 'p-magnus', nom: 'Magnus', usages: {}, seance: 's14', scene: 'sh1' };
    expect(await S.poserQuestion('savant', 'Qui a forgé ce sceau ?', qui)).toBe('sh1-alice-savant');
    expect(appels[0]!.donnees).toMatchObject({ noeud: 'savant', scene: 'sh1', question: 'Qui a forgé ce sceau ?', reponse: null });
    await expect(S.poserQuestion('savant', 'x', { ...qui, scene: null })).rejects.toThrow('pendant une scène');
    appels.length = 0;
    expect(await S.poserQuestion('reseau-de-rumeurs', 'Où dort Marec ?', { ...qui, scene: null })).toBe('s14-alice-rumeurs');
    expect(appels.map((a) => [a.fn, a.champ ?? null])).toEqual([['setDoc', null], ['updateDoc', ['usages', 'reseau-de-rumeurs']]]);
    await expect(S.poserQuestion('reseau-de-rumeurs', 'x', { ...qui, usages: { 'reseau-de-rumeurs': { seance: 's14' } } })).rejects.toThrow('déjà servi');
    await expect(S.poserQuestion('savant', ' ', qui)).rejects.toThrow('Écris');
    appels.length = 0;
    session.uid = 'mj';
    await S.repondreQuestion('sh1-alice-savant', ' Les forges de Mornac ');
    expect(appels[0]).toMatchObject({ fn: 'updateDoc', chemin: 'tables/t1/questions/sh1-alice-savant', donnees: { reponse: 'Les forges de Mornac' } });
  });

  it('Levier (6a) : ±2 crans pour la scène, le secret noté sur le PNJ, une seule fois ; seulement si un appelé l’a', async () => {
    base.set(c, scene(avec('levier')));
    base.set('tables/t1/pnj/pnj-aude', pnj());
    const s = await S.levierEnScene('sh1', 1, 'La dette envers le Roi');
    expect([s.hausses, H.cranScene(s)]).toEqual([2, 'favorable']);
    expect(appels[1]!.donnees).toMatchObject({ secrets: ['La dette envers le Roi'] });
    base.set('tables/t1/pnj/pnj-aude', pnj({ secrets: ['La dette envers le Roi'] }));
    await expect(S.levierEnScene('sh1', -1, 'la dette envers le roi')).rejects.toThrow('déjà servi');
    base.set(c, scene());
    await expect(S.levierEnScene('sh1', 1, 'Autre')).rejects.toThrow('Aucun appelé');
    await expect(S.levierEnScene('sh1', 1, ' ')).rejects.toThrow('Note le secret');
    appels.length = 0;
    base.set(c, scene(avec('levier')));
    base.set('tables/t1/pnj/pnj-aude', pnj());
    expect((await S.levierEnScene('sh1', -1, 'Le faux sceau')).baisses).toBe(2);
  });

  it('PNJ du peuple (2a) : le MJ le marque', async () => {
    base.set('tables/t1/pnj/pnj-aude', pnj());
    await P.marquerPeuplePnj('pnj-aude', true);
    expect(appels[0]!.donnees).toMatchObject({ peuple: true });
  });
});
