import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — le Remous du lieu (lot L6.7b, décisions de Thomas
 * du 29/10/2026) : la jauge, chez le joueur et chez le MJ (5a, 9a, 10a) ;
 * l'annonce des paliers et la membrane déchirée (8a) ; la Déchirure et la
 * montée offerte aux démons par le client du MJ (8a) ; la Traque et la
 * Membrane amincie dans le bloc « Démon » (10a, 11a) ; l'Éclat d'un démon
 * qui nourrit la jauge (6a).
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
const remousActions = vi.hoisted(() => ({
  alimenterRemous: vi.fn(async (..._a: unknown[]) => {}),
  viderRemous: vi.fn(async (..._a: unknown[]) => {}),
  reglerMembrane: vi.fn(async (..._a: unknown[]) => {}),
  corrigerRemous: vi.fn(async (..._a: unknown[]) => {}),
  annoncerPalier: vi.fn(async (..._a: unknown[]) => {}),
  dechirure: vi.fn(async (..._a: unknown[]) => []),
  offrirMontees: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('../../src/lib/actions/remous', () => remousActions);
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

const { table, jetonsScene, joueurs, persos, bestiaire, armesBestiaire, armuresBestiaire, rencontres, combatDoc, combattants, remousDoc, suiviRemous } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { carteFaux } = await import('./faux-magasins.svelte');
const { default: CombatMj } = await import('../../src/composants/CombatMj.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { default: CapacitesMj } = await import('../../src/composants/CapacitesMj.svelte');
const { default: JaugeRemous } = await import('../../src/composants/JaugeRemous.svelte');
const { traitsDemon } = await import('../../src/lib/combat/demons');
type Combattant = import('../../src/lib/schemas/combat').Combattant;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const BESTIAIRE: { id: string; nom: string; attaques: { nom: string; armeId: string }[] }[] = JSON.parse(readFileSync('src/donnees/bestiaire.json', 'utf8')).monstres;
const modele = (id: string) => BESTIAIRE.find((m) => m.id === id)! as never as { id: string; nom: string };
const reelle = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}) => ({
  id: `pj-${id}`, genre: 'pj' as const, nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: null as number | null, de: null as number | null, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}) => ({
  id: `m-r1-${id}`, genre: 'monstre' as const, nom: id, perso: null, uid: null, monstre: 'demon_reliquat', modInit: 3, initiative: 9 as number | null, de: 8 as number | null, pv: 10, pvMax: 10, aTerre: false,
  mvtBase: 5, def: 13 as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {} as Record<string, number>, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: true, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const combat = (c: Record<string, unknown> = {}) => ({ nom: 'Les démons', scene: 'cave', rencontre: 'r1', statut: 'encours' as const, round: 2, tour: 6, actif: 'pj-p1' as string | null, porteesLibres: true, creeLe: 1, closLe: null, ...c });
const k = () => reelle('Kargash', 'p1', 'alice');
const moi = (c: Partial<Combattant> = {}) => pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 11, de: 10, ...c });
const jauge = (total: number, membrane = 'epaisse', contributions: Record<string, number> = {}) => ({ total, membrane, contributions });
const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(attaques).forEach((f) => f.mockClear());
  Object.values(demonsActions).forEach((f) => f.mockClear());
  Object.values(remousActions).forEach((f) => f.mockClear());
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
  remousDoc.donnees = null;
  remousDoc.pret = true;
  remousDoc.erreur = null;
  suiviRemous.length = 0;
});

describe('la jauge (5a, 9a, 10a)', () => {
  it('sans scène montrée, rien', () => {
    table.donnees = { sceneActive: null };
    render(JaugeRemous, { props: { role: 'joueur' } });
    expect(screen.queryByRole('region', { name: 'Remous du lieu' })).toBeNull();
  });

  it('le joueur : le palier, le total, le prochain seuil, la membrane et ce que le palier change ; pas de commande', () => {
    remousDoc.donnees = jauge(50, 'epaisse', { p1: 50 });
    persos.elements = [k()];
    render(JaugeRemous, { props: { role: 'joueur' } });
    expect(suiviRemous).toEqual(['cave']);
    const r = within(screen.getByRole('region', { name: 'Remous du lieu' }));
    expect(r.getByText('Palier 1 — Déchirure')).toBeTruthy();
    expect(r.getByText('50')).toBeTruthy();
    expect(r.getByText('/ 96 pour le palier suivant')).toBeTruthy();
    expect(screen.getByTestId('effets-remous').textContent).toBe('Membrane épaisse. Sorts −1 PP, +2 dégâts.');
    expect(r.queryByRole('button')).toBeNull();
    expect(r.queryByText(/traque/)).toBeNull();
    expect(r.queryByText(/démon/)).toBeNull();
  });

  it('sans jauge encore : Stable, 0 sur 48 ; la Plaie : plus de seuil, la Déchirure et les PP max dits', () => {
    const v = render(JaugeRemous, { props: { role: 'joueur' } });
    expect(screen.getByText('Palier 0 — Stable')).toBeTruthy();
    expect(screen.getByText('/ 48 pour le palier suivant')).toBeTruthy();
    expect(screen.getByTestId('effets-remous').textContent).toBe('Membrane épaisse.');
    v.unmount();
    remousDoc.donnees = jauge(60, 'dechiree');
    render(JaugeRemous, { props: { role: 'joueur' } });
    expect(screen.getByText('Palier 4 — La Plaie')).toBeTruthy();
    expect(screen.getByText('la Plaie est ouverte')).toBeTruthy();
    expect(screen.getByTestId('effets-remous').textContent).toBe('Membrane déchirée. Sorts −4 PP, +8 dégâts, PP max +12 ; Déchirure 3d6 par round.');
  });

  it('une erreur de lecture se dit', () => {
    remousDoc.erreur = 'refusé';
    render(JaugeRemous, { props: { role: 'joueur' } });
    expect(screen.getByRole('alert').textContent).toBe('Remous indisponible : refusé');
  });

  it('le MJ : ce qui arrive aux démons, qui le Remous traque ; −/+, la membrane, les deux vidanges', async () => {
    const r0 = jauge(100, 'epaisse', { p1: 60, mj: 40 });
    remousDoc.donnees = r0;
    persos.elements = [k()];
    render(JaugeRemous, { props: { role: 'mj' } });
    const r = within(screen.getByRole('region', { name: 'Remous du lieu' }));
    expect(r.getByText('Le démon monte d’un palier.')).toBeTruthy();
    expect(r.getByText(`Le Remous traque ${k().nom}.`)).toBeTruthy();
    await fireEvent.input(r.getByLabelText('Montant'), { target: { value: '5' } });
    await fireEvent.click(r.getByRole('button', { name: 'Ajouter au Remous' }));
    expect(remousActions.corrigerRemous).toHaveBeenLastCalledWith('cave', r0, 5);
    await fireEvent.click(r.getByRole('button', { name: 'Retirer du Remous' }));
    expect(remousActions.corrigerRemous).toHaveBeenLastCalledWith('cave', r0, -5);
    await fireEvent.change(r.getByLabelText('Membrane'), { target: { value: 'fine' } });
    expect(remousActions.reglerMembrane).toHaveBeenLastCalledWith('cave', r0, 'fine');
    await fireEvent.click(r.getByRole('button', { name: 'Vider : repos long' }));
    expect(remousActions.viderRemous).toHaveBeenLastCalledWith('cave', r0, 'repos');
    await fireEvent.click(r.getByRole('button', { name: 'Vider : heure de marche' }));
    expect(remousActions.viderRemous).toHaveBeenLastCalledWith('cave', r0, 'marche');
    // Un montant négatif ne retourne pas le geste.
    await fireEvent.input(r.getByLabelText('Montant'), { target: { value: '-3' } });
    await fireEvent.click(r.getByRole('button', { name: 'Ajouter au Remous' }));
    expect(remousActions.corrigerRemous).toHaveBeenLastCalledWith('cave', r0, 0);
    await fireEvent.click(r.getByRole('button', { name: 'Retirer du Remous' }));
    expect(remousActions.corrigerRemous).toHaveBeenLastCalledWith('cave', r0, -0);
  });

  it('le MJ : jauge vide, pas de vidange ; la Traque d’un personnage absent ne se dit pas ; un refus se lit', async () => {
    remousDoc.donnees = jauge(0, 'epaisse', { inconnu: 3 });
    remousActions.corrigerRemous.mockRejectedValueOnce(new Error('refusé'));
    render(JaugeRemous, { props: { role: 'mj' } });
    expect((screen.getByRole('button', { name: 'Vider : repos long' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Vider : heure de marche' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/traque/)).toBeNull();
    expect(screen.queryByText(/démon/i)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter au Remous' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Error: refusé');
  });
});

describe('les paliers franchis, chez le MJ (8a)', () => {
  it('le premier palier lu ne s’annonce pas ; un palier qui monte, si, une fois ; qui descend, non', async () => {
    remousDoc.donnees = jauge(50);
    render(JaugeRemous, { props: { role: 'mj' } });
    await attendre();
    expect(remousActions.annoncerPalier).not.toHaveBeenCalled();
    remousDoc.donnees = jauge(60);
    flushSync();
    await attendre();
    expect(remousActions.annoncerPalier).not.toHaveBeenCalled();
    remousDoc.donnees = jauge(100);
    flushSync();
    await waitFor(() => expect(remousActions.annoncerPalier).toHaveBeenCalledTimes(1));
    expect(remousActions.annoncerPalier).toHaveBeenCalledWith(jauge(100));
    expect(remousActions.reglerMembrane).not.toHaveBeenCalled();
    remousDoc.donnees = jauge(110);
    flushSync();
    remousDoc.donnees = jauge(10);
    flushSync();
    await attendre();
    expect(remousActions.annoncerPalier).toHaveBeenCalledTimes(1);
    // Redescendu, il remonte : il s'annonce de nouveau.
    remousDoc.donnees = jauge(50);
    flushSync();
    await waitFor(() => expect(remousActions.annoncerPalier).toHaveBeenCalledTimes(2));
  });

  it('le palier 4 atteint déchire la membrane ; déjà déchirée, non ; chez le joueur, rien', async () => {
    remousDoc.donnees = jauge(100);
    const v = render(JaugeRemous, { props: { role: 'mj' } });
    await attendre();
    // Le palier 3 ne la déchire pas.
    remousDoc.donnees = jauge(150);
    flushSync();
    await waitFor(() => expect(remousActions.annoncerPalier).toHaveBeenCalledTimes(1));
    expect(remousActions.reglerMembrane).not.toHaveBeenCalled();
    remousDoc.donnees = jauge(200);
    flushSync();
    await waitFor(() => expect(remousActions.reglerMembrane).toHaveBeenCalledWith('cave', jauge(200), 'dechiree'));
    expect(remousActions.annoncerPalier.mock.invocationCallOrder[0]!).toBeLessThan(remousActions.reglerMembrane.mock.invocationCallOrder[0]!);
    v.unmount();
    remousActions.reglerMembrane.mockClear();
    remousDoc.donnees = jauge(30, 'dechiree');
    const v2 = render(JaugeRemous, { props: { role: 'mj' } });
    await attendre();
    remousDoc.donnees = jauge(50, 'dechiree');
    flushSync();
    await waitFor(() => expect(remousActions.annoncerPalier).toHaveBeenCalledTimes(3));
    expect(remousActions.reglerMembrane).not.toHaveBeenCalled();
    v2.unmount();
    remousActions.annoncerPalier.mockClear();
    remousDoc.donnees = jauge(10);
    render(JaugeRemous, { props: { role: 'joueur' } });
    await attendre();
    remousDoc.donnees = jauge(200);
    flushSync();
    await attendre();
    expect(remousActions.annoncerPalier).not.toHaveBeenCalled();
  });

  it('une autre scène montrée repart de son palier, sans annonce ; pas lu encore, rien', async () => {
    remousDoc.donnees = jauge(10);
    remousDoc.pret = false;
    render(JaugeRemous, { props: { role: 'mj' } });
    await attendre();
    remousDoc.donnees = jauge(100);
    flushSync();
    await attendre();
    remousDoc.pret = true;
    flushSync();
    await attendre();
    expect(remousActions.annoncerPalier).not.toHaveBeenCalled();
    table.donnees = { sceneActive: 'grotte' };
    remousDoc.donnees = jauge(150);
    flushSync();
    await attendre();
    expect(suiviRemous).toEqual(['cave', 'grotte']);
    expect(remousActions.annoncerPalier).not.toHaveBeenCalled();
  });
});

describe('le client du MJ en combat (8a)', () => {
  const enCombat = (c: Record<string, unknown> = {}) => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat(c);
    persos.elements = [k()];
    bestiaire.elements = BESTIAIRE.filter((m) => m.id.startsWith('demon_') || m.id === 'goblin_garde') as never;
  };

  it('un round qui commence au palier 2 : la Déchirure, sauf sur les démons ; une fois ; ni au premier round vu', async () => {
    enCombat({ round: 2 });
    remousDoc.donnees = jauge(100);
    const d = monstre('d');
    const g = monstre('g', { monstre: 'goblin_garde', demonOuMortVivant: false });
    combattants.elements = [d, g, moi()];
    render(CombatMj);
    await attendre();
    expect(remousActions.dechirure).not.toHaveBeenCalled();
    combatDoc.donnees = combat({ round: 3 });
    flushSync();
    await waitFor(() => expect(remousActions.dechirure).toHaveBeenCalledTimes(1));
    const [id, formule, tous, estDemon, fiches] = remousActions.dechirure.mock.calls[0]! as [string, string, { id: string }[], (c: unknown) => boolean, Map<string, unknown>];
    expect([id, formule, tous.map((c) => c.id)]).toEqual(['c1', '1d6', ['m-r1-d', 'm-r1-g', 'pj-p1']]);
    expect([estDemon(d), estDemon(g), estDemon(moi())]).toEqual([true, false, false]);
    expect([...fiches.keys()]).toEqual(['p1']);
    combattants.elements = [...combattants.elements];
    flushSync();
    await attendre();
    expect(remousActions.dechirure).toHaveBeenCalledTimes(1);
  });

  it('pas de Déchirure sous le palier 2, ni hors d’un combat en cours, ni avant que la jauge soit lue', async () => {
    enCombat({ round: 2 });
    remousDoc.donnees = jauge(60);
    combattants.elements = [moi()];
    const v = render(CombatMj);
    await attendre();
    combatDoc.donnees = combat({ round: 3 });
    flushSync();
    await attendre();
    expect(remousActions.dechirure).not.toHaveBeenCalled();
    v.unmount();
    enCombat({ round: 2, statut: 'clos' });
    remousDoc.donnees = jauge(150);
    const v2 = render(CombatMj);
    await attendre();
    combatDoc.donnees = combat({ round: 3, statut: 'clos' });
    flushSync();
    await attendre();
    expect(remousActions.dechirure).not.toHaveBeenCalled();
    v2.unmount();
    enCombat({ round: 2 });
    remousDoc.pret = false;
    render(CombatMj);
    await attendre();
    combatDoc.donnees = combat({ round: 3 });
    flushSync();
    await attendre();
    expect(remousActions.dechirure).not.toHaveBeenCalled();
  });

  it('le Remous franchit le palier 2 : la montée offerte aux démons debout qui ont où monter ; une fois ; pas au palier 1', async () => {
    enCombat();
    remousDoc.donnees = jauge(10);
    const d = monstre('d');
    const plafond = monstre('h', { monstre: 'demon_heure_figee' });
    const tombe = monstre('t', { aTerre: true, pv: 0 });
    const g = monstre('g', { monstre: 'goblin_garde', demonOuMortVivant: false });
    combattants.elements = [d, plafond, tombe, g, moi()];
    render(CombatMj);
    await attendre();
    remousDoc.donnees = jauge(50);
    flushSync();
    await attendre();
    expect(remousActions.offrirMontees).not.toHaveBeenCalled();
    remousDoc.donnees = jauge(100);
    flushSync();
    await waitFor(() => expect(remousActions.offrirMontees).toHaveBeenCalledTimes(1));
    expect(remousActions.offrirMontees).toHaveBeenCalledWith('c1', [d]);
    remousDoc.donnees = jauge(110);
    combattants.elements = [...combattants.elements];
    flushSync();
    await attendre();
    expect(remousActions.offrirMontees).toHaveBeenCalledTimes(1);
    remousDoc.donnees = jauge(150);
    flushSync();
    await waitFor(() => expect(remousActions.offrirMontees).toHaveBeenCalledTimes(2));
  });

  it('avant que la jauge soit lue, rien n’est offert', async () => {
    enCombat();
    remousDoc.pret = false;
    remousDoc.donnees = jauge(10);
    combattants.elements = [monstre('d'), moi()];
    render(CombatMj);
    await attendre();
    remousDoc.donnees = jauge(150);
    flushSync();
    await attendre();
    expect(remousActions.offrirMontees).not.toHaveBeenCalled();
  });

  it('un autre combat repart de ce qu’il lit : ni Déchirure ni montée à son premier coup d’œil', async () => {
    enCombat({ round: 1 });
    remousDoc.donnees = jauge(10);
    combattants.elements = [monstre('d'), moi()];
    render(CombatMj);
    await attendre();
    table.donnees = { sceneActive: 'cave', combat: 'c2' };
    combatDoc.donnees = combat({ round: 2 });
    remousDoc.donnees = jauge(150);
    flushSync();
    await attendre();
    expect(remousActions.dechirure).not.toHaveBeenCalled();
    expect(remousActions.offrirMontees).not.toHaveBeenCalled();
  });

  it('le premier palier lu n’offre rien ; hors d’un combat en cours, rien', async () => {
    enCombat();
    remousDoc.donnees = jauge(150);
    combattants.elements = [monstre('d'), moi()];
    const v = render(CombatMj);
    await attendre();
    expect(remousActions.offrirMontees).not.toHaveBeenCalled();
    v.unmount();
    enCombat({ statut: 'clos' });
    remousDoc.donnees = jauge(10);
    render(CombatMj);
    await attendre();
    remousDoc.donnees = jauge(150);
    flushSync();
    await attendre();
    expect(remousActions.offrirMontees).not.toHaveBeenCalled();
  });
});

describe('le bloc « Démon » (10a, 11a) ; la montée offerte (8a)', () => {
  const rendre = (id: string, m: ReturnType<typeof monstre>, traque: string | null = null, md: object = modele(id)) =>
    render(CapacitesMj, { props: { idCombat: 'c1', combat: combat(), monstre: m, modele: md, combattants: [m], fiches: new Map(), carte: null, demon: traitsDemon(modele(id) as never), modeles: BESTIAIRE, reductions: new Map(), traque } as never });

  it('un démon qui traque le remueur le nomme ; personne, rien', () => {
    const v = rendre('demon_reliquat', monstre('A'), 'Kargash');
    expect(screen.getByTestId('traque').textContent).toBe('Traque : Kargash');
    v.unmount();
    rendre('demon_reliquat', monstre('A'));
    expect(screen.queryByTestId('traque')).toBeNull();
  });

  it('un démon sans Traque ne nomme personne ; le Gouffre rappelle la Membrane amincie', () => {
    const sans = { ...modele('demon_reliquat'), capacitesSpeciales: [] };
    const v = rendre('demon_reliquat', monstre('S'), 'Kargash', sans);
    expect(screen.queryByTestId('traque')).toBeNull();
    expect(screen.queryByText(/Membrane amincie/)).toBeNull();
    v.unmount();
    rendre('demon_gouffre', monstre('O', { monstre: 'demon_gouffre' }));
    expect(screen.getByText('Au MJ : Membrane amincie : tant qu’il reste, baisse la membrane du lieu d’un rang ou ajoute au Remous (jauge du lieu).')).toBeTruthy();
  });

  it('la montée offerte : « Monter » avant la faim', () => {
    rendre('demon_reliquat', monstre('A', { usages: { monteeRemous: 1 } }));
    expect(screen.getByRole('button', { name: `Monter : ${modele('demon_affame').nom}` })).toBeTruthy();
  });
});

describe('le panneau du MJ : l’Éclat nourrit le Remous (6a, 10a)', () => {
  const panneau = (attaque: string) => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [k()];
    const m = BESTIAIRE.find((x) => x.id === 'demon_affame')!;
    bestiaire.elements = [m] as never;
    armesBestiaire.donnees = { liste: m.attaques.map((a) => ({ id: a.armeId, nom: a.nom, type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'magique' })) };
    combattants.elements = [monstre('a', { nom: 'Affamé', monstre: 'demon_affame' }), moi()];
    render(PanneauCombat, { props: { carte: null } });
    return screen.getByRole('button', { name: new RegExp(`^${attaque} `) });
  };

  it('l’Éclat verse la dangerosité du démon, au nom du MJ ; la Morsure, rien', async () => {
    await fireEvent.click(panneau('Éclat'));
    await waitFor(() => expect(remousActions.alimenterRemous).toHaveBeenCalledWith('cave', 2, 'mj'));
    expect(remousActions.alimenterRemous.mock.invocationCallOrder[0]!).toBeGreaterThan(attaques.attaqueDeMonstre.mock.invocationCallOrder[0]!);
    cleanup();
    remousActions.alimenterRemous.mockClear();
    await fireEvent.click(panneau("Morsure d'ancrage"));
    await waitFor(() => expect(attaques.attaqueDeMonstre).toHaveBeenCalledTimes(2));
    expect(remousActions.alimenterRemous).not.toHaveBeenCalled();
  });

  it('la Traque du démon nomme celui qui a le plus nourri la jauge', () => {
    remousDoc.donnees = jauge(30, 'epaisse', { p1: 20, mj: 25 });
    panneau('Éclat');
    expect(screen.getByTestId('traque').textContent).toBe(`Traque : ${k().nom}`);
    expect(suiviRemous).toContain('cave');
  });
});
