import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — les démons (lot L6.6b, décisions de Thomas du
 * 29/10/2026), côté MJ : le bloc « Démon » de CapacitesMj (faim 1a,
 * montée 2a, berserk 6a, passifs 5a 7a 8a), l'attaque d'un démon depuis
 * le panneau, le client du MJ (début de tour, Dernier souffle, rounds
 * survécus) et le butin à la clôture (12a).
 */

const actions = vi.hoisted(() => {
  class RefusCombat extends Error {}
  return {
    RefusCombat,
    demarrerCombat: vi.fn(async (_b: unknown, _e: string | null) => 'c1'),
    ajouterCombattant: vi.fn(async (_id: string, _b: unknown) => {}),
    lancerInitiative: vi.fn(async (_id: string, _c: unknown) => 12),
    finirTour: vi.fn(async (_id: string, _a: string | null, _cs: unknown, _t: unknown) => ({})),
    donnerLaMain: vi.fn(async (_id: string, _c: unknown, _qui: string) => {}),
    noterAction: vi.fn(async (_id: string, _c: unknown, _x: unknown, _q: unknown) => {}),
    ajusterPvMonstre: vi.fn(async (_id: string, _s: string, _c: unknown, _d: number) => 0),
    cloreCombat: vi.fn(async (_id: string) => {}),
    basculerPortees: vi.fn(async (_id: string, _l: boolean) => {}),
  };
});
vi.mock('../../src/lib/actions/combat', () => actions);
const attaques = vi.hoisted(() => ({
  attaquer: vi.fn(async (..._a: unknown[]) => ({ de: 20, bonus: 5, total: 25, def: 13, touche: true, critique: true, echecCritique: false })),
  infligerDegats: vi.fn(async (..._a: unknown[]) => ({ jet: { des: [3, 4], faces: 6, bonus: 0, total: 7 }, degats: { brut: 7, net: 7, detail: '7' }, pv: 2 })),
  attaqueDeMonstre: vi.fn(async (..._a: unknown[]) => ({ issue: { de: 15, bonus: 4, total: 19, def: 16, touche: true, critique: false, echecCritique: false }, net: 5, pv: 15 })),
  subirDegats: vi.fn(async (..._a: unknown[]) => ({ net: 5, pv: 15 })),
  lancerJetDeMort: vi.fn(async (..._a: unknown[]) => ({})),
  releverAllie: vi.fn(async (..._a: unknown[]) => {}),
  boirePotion: vi.fn(async (..._a: unknown[]) => 6),
  remettreJetsDeMort: vi.fn(async (..._a: unknown[]) => {}),
  viser: vi.fn(async (..._a: unknown[]) => {}),
  decharger: vi.fn(async (..._a: unknown[]) => 1),
  poserEtatSur: vi.fn(async (..._a: unknown[]) => {}),
  retirerEtatDe: vi.fn(async (..._a: unknown[]) => {}),
  debutDeTour: vi.fn(async (..._a: unknown[]) => 0),
  attaqueSurInvocation: vi.fn(async (..._a: unknown[]) => ({})),
  repousserDe: vi.fn(async (..._a: unknown[]) => 2),
}));
const monstresActions = vi.hoisted(() => ({
  cleCapacite: (nom: string) => `c:${nom}`,
  jouerCapaciteMonstre: vi.fn(async (..._a: unknown[]) => 'Souffle sur Kargash : rien'),
  corrigerLegendaire: vi.fn(async (..._a: unknown[]) => {}),
  jouerCurees: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('../../src/lib/actions/monstres', () => monstresActions);
const demonsActions = vi.hoisted(() => ({
  corrigerFaim: vi.fn(async (..._a: unknown[]) => {}),
  monterDemon: vi.fn(async (..._a: unknown[]) => 'A devient Affamé.'),
  compterRoundsSurvecus: vi.fn(async (..._a: unknown[]) => {}),
  retourALaMer: vi.fn(async (..._a: unknown[]) => {}),
  sursaut: vi.fn(async (..._a: unknown[]) => {}),
  debutDeTourDemons: vi.fn(async (..._a: unknown[]) => []),
}));
vi.mock('../../src/lib/actions/demons', () => demonsActions);
const rencontresActions = vi.hoisted(() => ({ envoyerButin: vi.fn(async (..._a: unknown[]) => 1) }));
vi.mock('../../src/lib/actions/rencontres', () => rencontresActions);
vi.mock('../../src/lib/actions/attaques', () => attaques);
const actionsCarte = vi.hoisted(() => ({ marquerMort: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/carte', () => actionsCarte);
const journal = vi.hoisted(() => ({ lancerEtNoter: vi.fn(async () => null), messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCombat);
vi.mock('../../src/lib/magasins/zones.svelte', async () => (await import('./faux-magasins.svelte')).magasinsZones);
const zonesActions = vi.hoisted(() => ({
  apresDeplacement: vi.fn(async (..._a: unknown[]) => 0),
  peindreCase: vi.fn(async (..._a: unknown[]) => {}),
  retirerZone: vi.fn(async (..._a: unknown[]) => {}),
  zonesDuDebutDeTour: vi.fn(async (..._a: unknown[]) => 0),
  idCase: (c: { cx: number; cy: number }) => `c-${c.cx}-${c.cy}`,
}));
vi.mock('../../src/lib/actions/zones', () => zonesActions);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);
vi.mock('../../src/lib/magasins/rencontres.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRencontres);
vi.mock('../../src/lib/magasins/portraits-jetons.svelte', () => ({ suivrePortraitsJetons: () => ({ images: {}, suivre: () => {}, arreter: () => {} }) }));
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));

const { table, jetonsScene, joueurs, persos, bestiaire, armesBestiaire, armuresBestiaire, rencontres, combatDoc, combattants } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { carteFaux } = await import('./faux-magasins.svelte');
const { default: CombatMj } = await import('../../src/composants/CombatMj.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { default: CapacitesMj } = await import('../../src/composants/CapacitesMj.svelte');
type Combattant = import('../../src/lib/schemas/combat').Combattant;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const BESTIAIRE: { id: string; nom: string }[] = JSON.parse(readFileSync('src/donnees/bestiaire.json', 'utf8')).monstres;
const modele = (id: string) => BESTIAIRE.find((m) => m.id === id)! as never as { id: string; nom: string };
const { traitsDemon } = await import('../../src/lib/combat/demons');
const reelle = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}) => ({
  id: `pj-${id}`, genre: 'pj' as const, nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: null as number | null, de: null as number | null, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}) => ({
  id: `m-r1-${id}`, genre: 'monstre' as const, nom: id, perso: null, uid: null, monstre: 'demon_reliquat', modInit: 3, initiative: 9 as number | null, de: 8 as number | null, pv: 10, pvMax: 10, aTerre: false,
  mvtBase: 5, def: 13 as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {} as Record<string, number>, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: true, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const combat = (c: Record<string, unknown> = {}) => ({ nom: 'Les démons', scene: 'cave', rencontre: 'r1', statut: 'encours' as const, round: 2, tour: 6, actif: null as string | null, porteesLibres: true, creeLe: 1, closLe: null, ...c });
const k = () => reelle('Kargash', 'p1', 'alice');
const moi = (c: Partial<Combattant> = {}) => pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 11, de: 10, ...c });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(attaques).forEach((f) => f.mockClear());
  Object.values(demonsActions).forEach((f) => f.mockClear());
  rencontresActions.envoyerButin.mockClear();
  actions.cloreCombat.mockClear();
  armesBestiaire.donnees = null;
  armuresBestiaire.donnees = null;
  table.donnees = { sceneActive: 'cave', combat: null };
  jetonsScene.elements = [];
  joueurs.elements = [];
  persos.elements = [];
  bestiaire.elements = [];
  rencontres.elements = [];
  combatDoc.donnees = null;
  combattants.elements = [];
  carteFaux.valeur = null;
});

describe('CapacitesMj : le démon (1a, 2a, 6a, 8a)', () => {
  const rendre = (id: string, m: ReturnType<typeof monstre>, modeles = BESTIAIRE) =>
    render(CapacitesMj, { props: { idCombat: 'c1', combat: combat(), monstre: m, modele: modele(id), combattants: [m], fiches: new Map(), carte: null, demon: traitsDemon(modele(id) as never), modeles, reductions: new Map([['x', 1]]) } as never });

  it('sa faim et ses passifs ; −/+ la corrigent ; avant le seuil, pas de montée', async () => {
    const m = monstre('A', { usages: { faim: 4 } });
    rendre('demon_reliquat', m);
    const g = within(screen.getByRole('group', { name: 'Démon' }));
    expect(screen.getByTestId('faim').textContent).toBe('Faim : 4/6 (PP drainés)');
    expect(g.queryByRole('button', { name: /^Monter/ })).toBeNull();
    await fireEvent.click(g.getByRole('button', { name: 'Une faim de plus' }));
    expect(demonsActions.corrigerFaim).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-A' }), 1);
    await fireEvent.click(g.getByRole('button', { name: 'Une faim de moins' }));
    expect(demonsActions.corrigerFaim).toHaveBeenLastCalledWith('c1', expect.anything(), -1);
  });

  it('à 0, « moins » est éteint ; au seuil, « Monter » vers chaque palier ; un palier absent du bestiaire est éteint', async () => {
    const r = rendre('demon_reliquat', monstre('A'));
    expect((screen.getByRole('button', { name: 'Une faim de moins' }) as HTMLButtonElement).disabled).toBe(true);
    r.unmount();
    const e = monstre('E', { monstre: 'demon_ecorcheur', usages: { faim: 40 } });
    rendre('demon_ecorcheur', e, BESTIAIRE.filter((x) => x.id !== 'demon_greffeur'));
    const fendue = screen.getByRole('button', { name: `Monter : ${modele('demon_ecorce_fendue').nom}` }) as HTMLButtonElement;
    const absent = screen.getByRole('button', { name: 'Monter : demon_greffeur' }) as HTMLButtonElement;
    expect(absent.disabled).toBe(true);
    await fireEvent.click(fendue);
    expect(demonsActions.monterDemon).toHaveBeenCalledWith('c1', 'cave', expect.objectContaining({ id: 'm-r1-E' }), expect.objectContaining({ paliersSuivants: ['demon_ecorce_fendue', 'demon_greffeur'] }), expect.objectContaining({ id: 'demon_ecorce_fendue' }), new Map([['x', 1]]));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'A devient Affamé.');
  });

  it('son berserk ; ce qui se joue d’office ; ce que le MJ applique lui-même', () => {
    const r = rendre('demon_greffeur', monstre('G', { monstre: 'demon_greffeur', usages: { berserk: 3 } }));
    expect(screen.getByTestId('berserk').textContent).toBe('Berserk : 3 touches, +3 aux dégâts');
    expect(screen.queryByTestId('faim')).toBeNull();
    expect(screen.getByText('Repousse : +8 PV au début de son tour.')).toBeTruthy();
    expect(screen.getByText('Vol de sève : il regagne 50 % des dégâts qu’il inflige.')).toBeTruthy();
    r.unmount();
    const r2 = rendre('demon_ecorcheur', monstre('E', { monstre: 'demon_ecorcheur', usages: { berserk: 1 } }));
    expect(screen.getByTestId('berserk').textContent).toBe('Berserk : 1 touche, +1 aux dégâts');
    r2.unmount();
    const r3 = rendre('demon_gouffre', monstre('O', { monstre: 'demon_gouffre' }));
    expect(screen.getByText('Puits : +1 PV par PP drainé.')).toBeTruthy();
    r3.unmount();
    const r4 = rendre('demon_charnier_marchant', monstre('C', { monstre: 'demon_charnier_marchant' }));
    expect(screen.getByText('Air vicié : 1d6 à qui commence son tour à 3 m.')).toBeTruthy();
    r4.unmount();
    const r5 = rendre('demon_mille_visages', monstre('V', { monstre: 'demon_mille_visages' }));
    expect(screen.getByText('Reflet : +5 PV par sauvegarde ratée contre lui.')).toBeTruthy();
    r5.unmount();
    const r6 = rendre('demon_seve_rouge', monstre('S', { monstre: 'demon_seve_rouge' }));
    expect(screen.getByText('Dernier souffle : à 0 PV avec 3 touches de berserk, un dernier tour.')).toBeTruthy();
    r6.unmount();
    rendre('demon_desiree', monstre('D', { monstre: 'demon_desiree' }));
    expect(screen.getByText(/^Au MJ : Bouclier de chair/)).toBeTruthy();
  });

  it('un monstre ordinaire : pas de bloc « Démon »', () => {
    render(CapacitesMj, { props: { idCombat: 'c1', combat: combat(), monstre: monstre('A'), modele: { id: 'x', nom: 'X', capacitesSpeciales: [] }, combattants: [], fiches: new Map(), carte: null } as never });
    expect(screen.queryByRole('group', { name: 'Démon' })).toBeNull();
    cleanup();
    render(CapacitesMj, { props: { idCombat: 'c1', combat: combat(), monstre: monstre('A'), modele: { id: 'x', nom: 'X', capacitesSpeciales: [] }, combattants: [], fiches: new Map(), carte: null, demon: traitsDemon({}) } as never });
    expect(screen.queryByRole('group', { name: 'Démon' })).toBeNull();
  });
});

describe('le panneau du MJ : l’attaque d’un démon', () => {
  it('ses traits partent avec l’attaque ; un monstre ordinaire, non', async () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [k()];
    bestiaire.elements = [{ ...BESTIAIRE.find((m) => m.id === 'demon_greffeur')!, attaques: [{ nom: 'Greffe', armeId: 'greffe', bonusAttaque: 10, effetSpecial: null }] }] as never;
    armesBestiaire.donnees = { liste: [{ id: 'greffe', nom: 'Greffe', type: 'arme', degats: '1d8', portee: 'contact', typedegats: 'physique' }] };
    combattants.elements = [monstre('a', { nom: 'Greffeur', monstre: 'demon_greffeur' }), moi()];
    render(PanneauCombat, { props: { carte: null } });
    expect(screen.getByRole('group', { name: 'Démon' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Greffe +10 · 1d8' }));
    await waitFor(() => expect(attaques.attaqueDeMonstre).toHaveBeenCalled());
    const appel = attaques.attaqueDeMonstre.mock.calls[0]!;
    expect(appel.slice(6)).toEqual([expect.any(Function), false, false, expect.objectContaining({ berserk: 1, repousse: 8, soinSurDegats: 0.5 })]);
  });
});

describe('le client du MJ : les démons (1a, 5a, 8a)', () => {
  const enCombat = (c: Record<string, unknown> = {}) => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat(c);
    persos.elements = [k()];
    bestiaire.elements = BESTIAIRE.filter((m) => m.id.startsWith('demon_')) as never;
    jetonsScene.elements = [];
  };

  it('5a : la main arrive à un démon qui repousse : son début de tour, une fois', async () => {
    enCombat({ actif: 'm-r1-e' });
    combattants.elements = [monstre('e', { monstre: 'demon_ecorcheur', pv: 40, pvMax: 60, initiative: 15 }), moi()];
    render(CombatMj);
    await waitFor(() => expect(demonsActions.debutDeTourDemons).toHaveBeenCalledTimes(1));
    expect(demonsActions.debutDeTourDemons.mock.calls[0]!.slice(0, 2)).toEqual(['c1', expect.objectContaining({ id: 'm-r1-e' })]);
    combattants.elements = [...combattants.elements];
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    expect(demonsActions.debutDeTourDemons).toHaveBeenCalledTimes(1);
  });

  it('5a, 8a : rien à faire au début du tour (un PJ loin de tout Charnier) : rien ; un Sursaut qui s’achève, si', async () => {
    enCombat({ actif: 'pj-p1' });
    combattants.elements = [monstre('e', { monstre: 'demon_ecorcheur', pv: 40, pvMax: 60 }), moi()];
    render(CombatMj);
    await new Promise((r) => setTimeout(r, 0));
    expect(demonsActions.debutDeTourDemons).not.toHaveBeenCalled();
    cleanup();
    enCombat({ actif: 'm-r1-s' });
    combattants.elements = [monstre('s', { monstre: 'demon_pustule', pv: 0, pvMax: 100, usages: { sursaut: 4 } }), moi()];
    render(CombatMj);
    await waitFor(() => expect(demonsActions.debutDeTourDemons).toHaveBeenCalledTimes(1));
  });

  it('8a : Air vicié : un PJ commence son tour près d’un Charnier', async () => {
    enCombat({ actif: 'pj-p1' });
    jetonsScene.elements = [
      { id: 'pj-p1', genre: 'pj', nom: 'Kargash', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 },
      { id: 'm-r1-c', genre: 'monstre', nom: 'Charnier', couleur: '#c0392b', cx: 2, cy: 1, proprietaire: null, creeLe: 1 },
    ];
    combattants.elements = [monstre('c', { monstre: 'demon_charnier_marchant', pv: 90, pvMax: 90 }), moi()];
    render(CombatMj);
    await waitFor(() => expect(demonsActions.debutDeTourDemons).toHaveBeenCalledTimes(1));
    expect(demonsActions.debutDeTourDemons.mock.calls[0]![1]).toMatchObject({ id: 'pj-p1' });
  });

  it('8a : un démon tombe, son berserk au seuil : Dernier souffle, une fois', async () => {
    enCombat({ actif: 'pj-p1' });
    combattants.elements = [monstre('s', { monstre: 'demon_seve_rouge', pv: 0, pvMax: 100, aTerre: true, usages: { berserk: 3 } }), monstre('t', { monstre: 'demon_seve_rouge', pv: 0, aTerre: true, usages: { berserk: 2 } }), moi()];
    render(CombatMj);
    await waitFor(() => expect(demonsActions.sursaut).toHaveBeenCalledTimes(1));
    expect(demonsActions.sursaut).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'm-r1-s' }));
    combattants.elements = [...combattants.elements];
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    expect(demonsActions.sursaut).toHaveBeenCalledTimes(1);
  });

  it('1a : un round commence : les démons debout qui se nourrissent de rounds survécus en comptent un', async () => {
    enCombat({ actif: 'pj-p1', round: 3 });
    combattants.elements = [monstre('p', { monstre: 'demon_pustule', usages: { faim: 1 } }), monstre('q', { monstre: 'demon_pustule', aTerre: true, pv: 0 }), monstre('r', { monstre: 'demon_reliquat' }), moi()];
    render(CombatMj);
    await waitFor(() => expect(demonsActions.compterRoundsSurvecus).toHaveBeenCalledTimes(1));
    expect(demonsActions.compterRoundsSurvecus).toHaveBeenCalledWith('c1', [{ c: expect.objectContaining({ id: 'm-r1-p' }), usages: { faim: 2, faimR: 3 } }]);
    combattants.elements = [...combattants.elements];
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    expect(demonsActions.compterRoundsSurvecus).toHaveBeenCalledTimes(1);
  });

  it('11a : un démon vu debout tombe : il retourne à la Mer ; pas celui qui se relève pour son Dernier souffle, ni un monstre ordinaire', async () => {
    enCombat({ actif: 'pj-p1' });
    bestiaire.elements = [...BESTIAIRE.filter((m) => m.id.startsWith('demon_')), { ...BESTIAIRE.find((m) => m.id === 'goblin_garde')!, id: 'gob' }] as never;
    const a = monstre('a', { nom: 'Reliquat' });
    const s = monstre('s', { monstre: 'demon_seve_rouge', usages: { berserk: 3 } });
    const g = monstre('g', { monstre: 'gob' });
    combattants.elements = [a, s, g, moi()];
    render(CombatMj);
    await new Promise((r) => setTimeout(r, 0));
    combattants.elements = [{ ...a, pv: 0, aTerre: true }, { ...s, pv: 0, aTerre: true }, { ...g, pv: 0, aTerre: true }, moi()];
    flushSync();
    await waitFor(() => expect(demonsActions.retourALaMer).toHaveBeenCalledTimes(1));
    expect(demonsActions.retourALaMer).toHaveBeenCalledWith([expect.objectContaining({ id: 'm-r1-a' })]);
  });

  it('hors d’un combat en cours, rien', async () => {
    enCombat({ actif: 'm-r1-e', statut: 'clos', round: 3 });
    combattants.elements = [monstre('e', { monstre: 'demon_ecorcheur', pv: 40, pvMax: 60 }), monstre('s', { monstre: 'demon_seve_rouge', pv: 0, aTerre: true, usages: { berserk: 3 } }), monstre('p', { monstre: 'demon_pustule' })];
    render(CombatMj);
    await new Promise((r) => setTimeout(r, 0));
    expect(demonsActions.debutDeTourDemons).not.toHaveBeenCalled();
    expect(demonsActions.sursaut).not.toHaveBeenCalled();
    expect(demonsActions.compterRoundsSurvecus).not.toHaveBeenCalled();
  });
});

describe('le butin à la clôture (12a)', () => {
  const avecRencontre = (r: Record<string, unknown> = {}) => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    persos.elements = [k()];
    combattants.elements = [moi({ initiative: 14, de: 12 })];
    rencontres.elements = [{ id: 'r1', nom: 'Les démons', scene: 'cave', statut: 'lancee', lanceeLe: 5, monstres: [], butin: [{ objet: 'potion_soin', combien: 2 }, { objet: 'dague', combien: 1 }], butinEnvoyeLe: null, creeLe: 1, majLe: 1, ...r }] as never;
  };

  it('le butin prévu part au vote après la clôture, coché par défaut ; le message le dit', async () => {
    avecRencontre();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(CombatMj);
    const caseButin = screen.getByLabelText('Envoyer le butin au vote à la clôture (2 objets)') as HTMLInputElement;
    expect(caseButin.checked).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le combat' }));
    await waitFor(() => expect(rencontresActions.envoyerButin).toHaveBeenCalledWith('r1', expect.objectContaining({ id: 'r1' })));
    expect(confirmer.mock.calls[0]![0]).toBe('Clore le combat ? L’ordre d’initiative sera effacé. Le butin part au vote.');
    expect(actions.cloreCombat.mock.invocationCallOrder[0]!).toBeLessThan(rencontresActions.envoyerButin.mock.invocationCallOrder[0]!);
    confirmer.mockRestore();
  });

  it('décoché, il reste ; refusée, la clôture n’envoie rien ; déjà envoyé ou sans butin, pas de case', async () => {
    avecRencontre();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(CombatMj);
    await fireEvent.click(screen.getByLabelText(/^Envoyer le butin au vote/));
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le combat' }));
    await waitFor(() => expect(actions.cloreCombat).toHaveBeenCalled());
    expect(rencontresActions.envoyerButin).not.toHaveBeenCalled();
    expect(confirmer.mock.calls[0]![0]).toBe('Clore le combat ? L’ordre d’initiative sera effacé.');
    cleanup();
    confirmer.mockReturnValue(false);
    actions.cloreCombat.mockClear();
    avecRencontre();
    render(CombatMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le combat' }));
    expect(actions.cloreCombat).not.toHaveBeenCalled();
    expect(rencontresActions.envoyerButin).not.toHaveBeenCalled();
    cleanup();
    avecRencontre({ butinEnvoyeLe: 9 });
    render(CombatMj);
    expect(screen.queryByLabelText(/^Envoyer le butin au vote/)).toBeNull();
    cleanup();
    avecRencontre({ butin: [] });
    render(CombatMj);
    expect(screen.queryByLabelText(/^Envoyer le butin au vote/)).toBeNull();
    cleanup();
    avecRencontre({ butin: [{ objet: 'dague', combien: 1 }] });
    render(CombatMj);
    expect(screen.getByLabelText('Envoyer le butin au vote à la clôture (1 objet)')).toBeTruthy();
    confirmer.mockRestore();
  });

  it('la clôture refusée par l’app : le butin ne part pas', async () => {
    avecRencontre();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    actions.cloreCombat.mockRejectedValueOnce(new actions.RefusCombat('non'));
    render(CombatMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le combat' }));
    await screen.findByText('non');
    expect(rencontresActions.envoyerButin).not.toHaveBeenCalled();
    confirmer.mockRestore();
  });
});
