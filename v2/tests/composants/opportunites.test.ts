import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — l'attaque d'opportunité sur la carte (lot L6.5b,
 * décisions de Thomas du 26/10/2026) : 2b (le client de celui qui bouge
 * la note), 3b (case après case, le long du chemin), 10a (un ennemi dont
 * il quitte le contact) ; le joueur ne la note que pour le combattant qui
 * a la main.
 */

vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/actions/carte', () => ({
  basculerPorte: vi.fn(async () => {}),
  deplacerJeton: vi.fn(async () => {}),
  effacerDessin: vi.fn(async () => {}),
  enregistrerExploration: vi.fn(async () => {}),
  importerScene: vi.fn(async () => {}),
  marquerMort: vi.fn(async () => {}),
  messageErreurCarte: (e: unknown) => String(e),
  montrerScene: vi.fn(async () => {}),
  poserJeton: vi.fn(async () => {}),
  reinitialiserExploration: vi.fn(async () => {}),
  retirerJeton: vi.fn(async () => {}),
  supprimerSceneImportee: vi.fn(async () => {}),
  toutReveler: vi.fn(async () => {}),
  tracerDessin: vi.fn(async () => {}),
}));
vi.mock('../../src/composants/Battlemap.svelte', async () => ({ default: (await import('./FauxBattlemap.svelte')).default }));
// Combat (L6.1).
vi.mock('../../src/lib/magasins/combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCombat);
vi.mock('../../src/lib/magasins/zones.svelte', async () => (await import('./faux-magasins.svelte')).magasinsZones);
const combatActions = vi.hoisted(() => ({ noterAction: vi.fn(async () => {}), RefusCombat: class extends Error {} }));
vi.mock('../../src/lib/actions/combat', () => combatActions);

const zonesActions = vi.hoisted(() => ({
  apresDeplacement: vi.fn(async (..._a: unknown[]) => 0),
  peindreCase: vi.fn(async (..._a: unknown[]) => {}),
  retirerZone: vi.fn(async (..._a: unknown[]) => {}),
  zonesDuDebutDeTour: vi.fn(async (..._a: unknown[]) => 0),
  idCase: (c: { cx: number; cy: number }) => `c-${c.cx}-${c.cy}`,
}));
vi.mock('../../src/lib/actions/zones', () => zonesActions);
const reactionsActions = vi.hoisted(() => ({ signalerOpportunites: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/reactions', () => reactionsActions);

const { table, jetonsScene, persos, combatDoc, combattants, glisserLibre } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: CarteTable } = await import('../../src/composants/CarteTable.svelte');

const combattant = (id: string, c: Record<string, unknown> = {}) => ({
  id, genre: 'pj', nom: id, perso: id.slice(3), uid: 'alice', monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false, mort: false,
  mvtBase: 5, etats: [], usages: {}, debutTour: 0, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const goule = (id: string) => combattant(id, { genre: 'monstre', perso: null, uid: null, monstre: 'goule', pv: 9, pvMax: 14 });
const jeton = (id: string, cx: number, cy: number) => ({ id, genre: id.startsWith('pj') ? 'pj' : 'monstre', nom: id, couleur: '#2980b9', cx, cy, proprietaire: id.startsWith('pj') ? 'alice' : null, creeLe: 1 });
/** pj-p1 en (1, 1) ; une goule au contact de son départ, une autre au loin. */
const poser = (actif: string, statut = 'encours') => {
  table.donnees = { sceneActive: 'test_tavern', combat: 'c1' };
  jetonsScene.elements = [jeton('pj-p1', 1, 1), jeton('m-r1-a', 0, 1), jeton('m-r1-b', 8, 8)];
  combatDoc.donnees = { nom: 'Goules', scene: 'test_tavern', rencontre: 'r1', statut, round: 1, tour: 3, actif, porteesLibres: false, creeLe: 1, closLe: null };
  combattants.elements = [combattant('pj-p1', { tourActions: 3, mvt: 1 }), goule('m-r1-a'), goule('m-r1-b')];
};

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  persos.elements = [];
  glisserLibre.v = null;
  reactionsActions.signalerOpportunites.mockClear();
});

describe('le pas qui quitte le contact (2b, 3b, 10a)', () => {
  it('le joueur, à son tour : son chemin quitte la goule au premier pas ; l’autre, jamais au contact, non', async () => {
    poser('pj-p1');
    render(CarteTable, { props: { role: 'joueur' } });
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser' }));
    expect(reactionsActions.signalerOpportunites).toHaveBeenCalledExactlyOnceWith('c1', 3, 'pj-p1', ['m-r1-a']);
  });

  it('le chemin compte : partir et revenir au contact l’ouvre quand même', async () => {
    poser('pj-p1');
    jetonsScene.elements = [jeton('pj-p1', 1, 1), jeton('m-r1-a', 2, 1), jeton('m-r1-b', 8, 8)];
    glisserLibre.v = {
      id: 'pj-p1',
      chemin: [
        { cx: 1, cy: 0 },
        { cx: 0, cy: 0 },
        { cx: 1, cy: 0 },
      ],
    };
    render(CarteTable, { props: { role: 'mj' } });
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser libre' }));
    expect(reactionsActions.signalerOpportunites).toHaveBeenCalledExactlyOnceWith('c1', 3, 'pj-p1', ['m-r1-a']);
  });

  it('le MJ, pour tous : la goule qu’il éloigne ouvre l’opportunité du PJ', async () => {
    poser('pj-p1');
    glisserLibre.v = { id: 'm-r1-a', chemin: [{ cx: 0, cy: 3 }] };
    render(CarteTable, { props: { role: 'mj' } });
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser libre' }));
    expect(reactionsActions.signalerOpportunites).toHaveBeenCalledExactlyOnceWith('c1', 3, 'm-r1-a', ['pj-p1']);
  });

  it('rien : un joueur qui n’a pas la main, un pas qui reste au contact, un combat clos', async () => {
    poser('m-r1-a');
    glisserLibre.v = { id: 'pj-p1', chemin: [{ cx: 3, cy: 3 }] };
    const r = render(CarteTable, { props: { role: 'joueur' } });
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser libre' }));
    r.unmount();
    poser('pj-p1');
    glisserLibre.v = { id: 'pj-p1', chemin: [{ cx: 1, cy: 2 }] };
    const r2 = render(CarteTable, { props: { role: 'mj' } });
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser libre' }));
    r2.unmount();
    poser('pj-p1', 'clos');
    glisserLibre.v = { id: 'pj-p1', chemin: [{ cx: 3, cy: 3 }] };
    render(CarteTable, { props: { role: 'mj' } });
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser libre' }));
    expect(reactionsActions.signalerOpportunites).not.toHaveBeenCalled();
  });
});
