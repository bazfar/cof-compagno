import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — zones au sol (lot L6.4b1, décisions de Thomas du
 * 24/10/2026) : l'outil « Cases » du MJ (1a, 3a, 4a), les zones dessinées
 * et le sol de la scène (2a, 11a, 16a), les déclenchements (7a : le jeton
 * qu'on déplace ; le client du MJ pour les cases du MJ), la liste du MJ
 * (16a).
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

const { table, jetonsScene, persos, combatDoc, combattants, zonesScene, zonesCombat, suiviZones } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: CarteTable } = await import('../../src/composants/CarteTable.svelte');

const zone = (z: Record<string, unknown> = {}, id = 'z1') => ({
  id, nom: 'Zone', nature: null, cases: [{ dx: 0, dy: 0 }], ancre: { cx: 5, cy: 5 }, lanceur: null, camp: null, filtre: 'tous', quand: null, sort: null, danger: null, dd: null, texte: null,
  usageUnique: false, cachee: false, rounds: null, declenchements: {}, creeLe: 1, ...z,
});
const combattant = (id: string, c: Record<string, unknown> = {}) => ({
  id, genre: 'pj', nom: id, perso: id.slice(3), uid: 'alice', monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, etats: [], usages: {}, debutTour: 0, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const poser = (actif: string | null) => {
  jetonsScene.elements = [
    { id: 'pj-p1', genre: 'pj', nom: 'Kargash', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 },
    { id: 'm-r1-a', genre: 'monstre', nom: 'Goule A', couleur: '#c0392b', cx: 5, cy: 5, proprietaire: null, creeLe: 1 },
  ];
  if (actif) {
    combatDoc.donnees = { nom: 'Goules', scene: 'test_tavern', rencontre: 'r1', statut: 'encours', round: 1, tour: 3, actif, creeLe: 1, closLe: null };
    combattants.elements = [combattant('pj-p1', { tourActions: 3, mvt: 1 }), combattant('m-r1-a', { genre: 'monstre', perso: null, uid: null, monstre: 'goule', pv: 9, pvMax: 14 })];
  }
  table.donnees = { sceneActive: 'test_tavern', combat: actif ? 'c1' : null };
  flushSync();
};

beforeEach(() => {
  session.table = 't1';
  session.uid = 'bob';
  session.nom = 'Bob';
  table.donnees = { sceneActive: null };
  jetonsScene.elements = [];
  persos.elements = [];
  combatDoc.donnees = null;
  combattants.elements = [];
  zonesScene.elements = [];
  zonesCombat.elements = [];
  suiviZones.mj = [];
  Object.values(zonesActions).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as { mockClear: () => void }).mockClear());
});

describe('l’outil « Cases » du MJ (1a, 3a, 4a)', () => {
  it('le MJ peint une case dangereuse cachée d’un clic ; un clic sur une case peinte l’efface', async () => {
    render(CarteTable, { props: { role: 'mj' } });
    poser(null);
    const carte = await screen.findByTestId('battlemap');
    expect(carte.dataset.visee).toBe('non');
    await fireEvent.change(screen.getByLabelText('Outil'), { target: { value: 'cases' } });
    expect(carte.dataset.visee).toBe('oui');
    await fireEvent.change(screen.getByLabelText('Case'), { target: { value: 'dangereuse' } });
    await fireEvent.input(screen.getByLabelText('Dégâts de la case'), { target: { value: '2d6' } });
    await fireEvent.change(screen.getByLabelText('Sauvegarde de la case'), { target: { value: 'CON' } });
    await fireEvent.input(screen.getByLabelText('DD'), { target: { value: '14' } });
    await fireEvent.change(screen.getByLabelText('État de la case'), { target: { value: 'renverse' } });
    await fireEvent.input(screen.getByLabelText('Rounds'), { target: { value: '2' } });
    await fireEvent.click(screen.getByLabelText('Cachée'));
    await fireEvent.click(screen.getByRole('button', { name: 'cliquer 2,3' }));
    expect(zonesActions.peindreCase).toHaveBeenCalledWith('test_tavern', { cx: 2, cy: 3 }, {
      nature: 'dangereuse',
      cachee: true,
      texte: null,
      danger: { formule: '2d6', typeDegats: 'physique', sauvegarde: 'CON', dd: 14, etat: 'renverse', rounds: 2 },
    });
    zonesScene.elements = [zone({ ancre: { cx: 2, cy: 3 } }, 'c-2-3')];
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: 'cliquer 2,3' }));
    expect(zonesActions.peindreCase).toHaveBeenLastCalledWith('test_tavern', { cx: 2, cy: 3 }, null);
  });

  it('une case spéciale porte son texte ; une case difficile, rien d’autre ; le joueur ne lit que les visibles', async () => {
    const vue = render(CarteTable, { props: { role: 'mj' } });
    poser(null);
    await screen.findByTestId('battlemap');
    expect(suiviZones.mj).toContain(true);
    await fireEvent.change(screen.getByLabelText('Outil'), { target: { value: 'cases' } });
    await fireEvent.change(screen.getByLabelText('Case'), { target: { value: 'speciale' } });
    await fireEvent.input(screen.getByLabelText('Texte de la case'), { target: { value: 'Un autel' } });
    await fireEvent.click(screen.getByRole('button', { name: 'cliquer 2,3' }));
    expect(zonesActions.peindreCase).toHaveBeenLastCalledWith('test_tavern', { cx: 2, cy: 3 }, { nature: 'speciale', cachee: false, texte: 'Un autel', danger: null });
    await fireEvent.change(screen.getByLabelText('Case'), { target: { value: 'difficile' } });
    expect(screen.queryByLabelText('Texte de la case')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'cliquer 2,3' }));
    expect(zonesActions.peindreCase).toHaveBeenLastCalledWith('test_tavern', { cx: 2, cy: 3 }, { nature: 'difficile', cachee: false, texte: null, danger: null });
    vue.unmount();
    suiviZones.mj = [];
    session.uid = 'alice';
    render(CarteTable, { props: { role: 'joueur' } });
    await screen.findByTestId('battlemap');
    expect(suiviZones.mj).toEqual([false]);
    expect(screen.queryByLabelText('Outil')).toBeNull();
  });
});

describe('les zones sur la carte (2a, 11a, 16a)', () => {
  it('dessinées en couleur, avec leur nom et leurs rounds ; le sol de la scène les prend ; la carte les rend à l’écran', async () => {
    zonesScene.elements = [zone({ nature: 'infranchissable', nom: 'Infranchissable', ancre: { cx: 2, cy: 2 } }, 'c-2-2'), zone({ nature: 'difficile', nom: 'Terrain difficile', ancre: { cx: 3, cy: 3 }, cachee: true }, 'c-3-3')];
    zonesCombat.elements = [zone({ nature: 'bloquant', nom: 'Rempart', rounds: 2, lanceur: 'pj-p1', camp: 'pj' }, 'r'), zone({ nom: 'Sanctuaire', nature: 'sanctuaire', texte: 'Rien ne vise dedans.', ancre: null, lanceur: 'pj-p1', camp: 'pj', cases: [{ dx: 1, dy: 0 }] }, 's')];
    const surCarte = vi.fn();
    render(CarteTable, { props: { role: 'mj', surCarte } });
    poser('pj-p1');
    const carte = await screen.findByTestId('battlemap');
    await waitFor(() => expect(carte.dataset.zones).toBe('infranchissable:Infranchissable:2,2|controle:Terrain difficile:3,3:cachee|infranchissable:Rempart (2):5,5|benefique:Sanctuaire — Rien ne vise dedans.:2,1'));
    expect(carte.dataset.sol).toBe('2,2/3,3/4');
    const c = surCarte.mock.lastCall![0] as { zones: { id: string }[]; idsZonesCombat: Set<string>; scene: { infranchissables: Set<string> } };
    expect(c.zones.map((z) => z.id)).toEqual(['c-2-2', 'c-3-3', 'r', 's']);
    expect([...c.idsZonesCombat]).toEqual(['r', 's']);
    expect([...c.scene.infranchissables]).toEqual(['2,2']);
  });

  it('les zones d’un combat sur une autre scène ne s’affichent pas', async () => {
    zonesCombat.elements = [zone({}, 'r')];
    render(CarteTable, { props: { role: 'mj' } });
    poser('pj-p1');
    combatDoc.donnees = { ...combatDoc.donnees!, scene: 'ailleurs' };
    flushSync();
    const carte = await screen.findByTestId('battlemap');
    await waitFor(() => expect(carte.dataset.zones).toBe(''));
  });
});

describe('les déclenchements (7a)', () => {
  it('le joueur déplace son jeton : les zones du combat sont jouées sur son client, du départ à l’arrivée', async () => {
    zonesCombat.elements = [zone({ nature: 'enflamme', quand: 'entree' }, 'f')];
    session.uid = 'alice';
    render(CarteTable, { props: { role: 'joueur' } });
    poser('pj-p1');
    await screen.findByTestId('battlemap');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser' }));
    expect(zonesActions.apresDeplacement).toHaveBeenCalledWith(
      expect.objectContaining({ lieu: { combat: 'c1' }, zones: [expect.objectContaining({ id: 'f' })], combat: { id: 'c1', tour: 3 }, auteur: 'pj-p1' }),
      { id: 'pj-p1', de: expect.objectContaining({ cx: 1, cy: 1 }), vers: { cx: 4, cy: 4 } },
    );
  });

  it('le client du MJ voit bouger un jeton et joue les cases du MJ, en combat comme hors combat ; rien au premier affichage', async () => {
    zonesScene.elements = [zone({ nature: 'dangereuse', quand: 'entree', danger: { formule: '1d6', typeDegats: 'physique', sauvegarde: null, dd: null, etat: null, rounds: null } }, 'c-5-5')];
    render(CarteTable, { props: { role: 'mj' } });
    poser(null);
    await screen.findByTestId('battlemap');
    expect(zonesActions.apresDeplacement).not.toHaveBeenCalled();
    jetonsScene.elements = jetonsScene.elements.map((j) => (j.id === 'pj-p1' ? { ...j, cx: 6, cy: 5 } : j));
    flushSync();
    await waitFor(() =>
      expect(zonesActions.apresDeplacement).toHaveBeenCalledWith(expect.objectContaining({ lieu: { scene: 'test_tavern' }, combat: null, auteur: 'MJ' }), { id: 'pj-p1', de: { cx: 1, cy: 1 }, vers: expect.objectContaining({ cx: 6, cy: 5 }) }),
    );
    // Un jeton relu sans avoir bougé ne rejoue rien.
    const n = zonesActions.apresDeplacement.mock.calls.length;
    jetonsScene.elements = jetonsScene.elements.map((j) => ({ ...j }));
    flushSync();
    expect(zonesActions.apresDeplacement).toHaveBeenCalledTimes(n);
    poser('m-r1-a');
    jetonsScene.elements = jetonsScene.elements.map((j) => (j.id === 'm-r1-a' ? { ...j, cx: 4, cy: 5 } : j));
    flushSync();
    await waitFor(() => expect(zonesActions.apresDeplacement).toHaveBeenLastCalledWith(expect.objectContaining({ combat: { id: 'c1', tour: 3 } }), expect.objectContaining({ id: 'm-r1-a' })));
  });

  it('un joueur ne joue pas les cases du MJ', async () => {
    zonesScene.elements = [zone({ quand: 'entree', nature: 'speciale', texte: 'x' }, 'c-5-5')];
    session.uid = 'alice';
    render(CarteTable, { props: { role: 'joueur' } });
    poser(null);
    await screen.findByTestId('battlemap');
    jetonsScene.elements = jetonsScene.elements.map((j) => (j.id === 'pj-p1' ? { ...j, cx: 6, cy: 5 } : j));
    flushSync();
    expect(zonesActions.apresDeplacement).not.toHaveBeenCalled();
  });
});
