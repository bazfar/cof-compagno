import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TEST DE COMPOSANT — CarteTable.svelte, monté dans un DOM simulé (jsdom).
 *
 * Pourquoi : certains bugs ne vivent que dans l'enchaînement des états
 * d'un composant, invisibles aux tests de fonctions. Le 16/10, montrer une
 * scène d'une autre taille faisait disparaître la carte (8f2e7ff), et une
 * réécriture du composant a réintroduit le bug sans que rien ne sonne. Ce
 * test monte le vrai CarteTable et change de scène dans les deux sens.
 *
 * Firestore est remplacé par de faux magasins (tests/composants/faux-
 * magasins.svelte.ts) et le dessin par FauxBattlemap, qui lit tout ce que
 * CarteTable lui passe. Le reste est le vrai code : géométrie des scènes,
 * exploration, calculs.
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
const combatActions = vi.hoisted(() => ({ noterAction: vi.fn(async () => {}) }));
vi.mock('../../src/lib/actions/combat', () => combatActions);

const { table, jetonsScene, joueurs, persos, combatDoc, combattants } = await import('./faux-magasins.svelte');
const carteActions = await import('../../src/lib/actions/carte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { session } = await import('../../src/lib/session.svelte');
const { default: CarteTable } = await import('../../src/composants/CarteTable.svelte');

function montrer(scene: string | null) {
  table.donnees = { sceneActive: scene };
  flushSync();
}

async function carteAffichee(scene: string, exploration: string) {
  await waitFor(() => {
    const carte = screen.getByTestId('battlemap');
    expect(carte.dataset.scene).toBe(scene);
    expect(carte.dataset.exploration).toBe(exploration);
  });
  expect(screen.queryByRole('alert')).toBeNull();
}

beforeEach(() => {
  session.table = 't1';
  session.uid = 'bob';
  session.nom = 'Bob';
  table.donnees = { sceneActive: null };
  jetonsScene.elements = [];
  joueurs.elements = [];
  persos.elements = [];
  combatDoc.donnees = null;
  combattants.elements = [];
  vi.mocked(carteActions.poserJeton).mockClear();
  vi.mocked(carteActions.deplacerJeton).mockClear();
  combatActions.noterAction.mockClear();
});

describe('CarteTable : changement de scène (bug du 16/10, 8f2e7ff)', () => {
  it("Taverne 35 × 20 → Ambush 40 × 25 → Taverne : la carte reste là, l'exploration change de taille", async () => {
    render(CarteTable, { props: { role: 'mj' } });
    montrer('test_tavern');
    await carteAffichee('test_tavern', '70x40'); // 2 × 2 sous-cases par case
    await fireEvent.click(screen.getByRole('button', { name: 'voir' }));
    await waitFor(() => expect(screen.getByTestId('battlemap').dataset.vu).toBe('true'));

    montrer('ambush');
    await carteAffichee('ambush', '80x50');
    // L'exploration de la taverne ne déborde pas sur Ambush.
    expect(screen.getByTestId('battlemap').dataset.vu).toBe('false');

    await fireEvent.click(screen.getByRole('button', { name: 'voir' }));
    montrer('test_tavern');
    await carteAffichee('test_tavern', '70x40');
  });

  it('scènes de même taille (Ambush → Kratz, 40 × 25) : la carte reste là', async () => {
    render(CarteTable, { props: { role: 'joueur' } });
    montrer('ambush');
    await carteAffichee('ambush', '80x50');
    await fireEvent.click(screen.getByRole('button', { name: 'voir' }));
    montrer('kratz');
    await carteAffichee('kratz', '80x50');
    expect(screen.getByTestId('battlemap').dataset.vu).toBe('false');
  });

  it('aucune scène montrée : message, pas de carte', async () => {
    render(CarteTable, { props: { role: 'joueur' } });
    expect(await screen.findByText("Le MJ n'a pas encore montré de scène.")).toBeTruthy();
    expect(screen.queryByTestId('battlemap')).toBeNull();
  });
});

describe('CarteTable : jetons de PJ reliés aux personnages (L2.3)', () => {
  const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
  const kargash = () => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith('Kargash')), 'alice', 1).fiche, id: 'p1' });

  it('le joueur pose le jeton de son personnage joué, sous l’identifiant pj-<personnage>', async () => {
    session.uid = 'alice';
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' }];
    persos.elements = [kargash()];
    render(CarteTable, { props: { role: 'joueur' } });
    montrer('test_tavern');
    await screen.findByTestId('battlemap'); // géométrie chargée : on peut placer
    await fireEvent.click(await screen.findByRole('button', { name: `Poser le jeton de ${kargash().nom}` }));
    expect(carteActions.poserJeton).toHaveBeenCalledWith('test_tavern', 'pj-p1', expect.objectContaining({ genre: 'pj', nom: kargash().nom, proprietaire: 'alice' }));
  });

  it('sans personnage joué, pas de jeton à poser', async () => {
    session.uid = 'alice';
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1 }];
    render(CarteTable, { props: { role: 'joueur' } });
    montrer('test_tavern');
    expect(await screen.findByText('Choisis ton personnage joué pour poser ton jeton.')).toBeTruthy();
  });

  it('nom et PV du jeton relus dans la fiche, en direct ; un ancien jeton pj-<uid> reste tel quel', async () => {
    persos.elements = [kargash()];
    jetonsScene.elements = [
      { id: 'pj-p1', genre: 'pj', nom: 'Ancien nom', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 },
      { id: 'pj-carol', genre: 'pj', nom: 'Carol', couleur: '#27ae60', cx: 2, cy: 1, proprietaire: 'carol', creeLe: 1 },
    ];
    render(CarteTable, { props: { role: 'mj' } });
    montrer('test_tavern');
    const k = kargash();
    await waitFor(() => expect(screen.getByTestId('battlemap').dataset.jetons).toContain(`pj-p1=${k.nom} ${k.pvActuel}/${k.pvMax}`));
    expect(screen.getByTestId('battlemap').dataset.jetons).toContain('pj-carol=Carol');
    persos.elements = [{ ...k, pvActuel: 3 }];
    flushSync();
    await waitFor(() => expect(screen.getByTestId('battlemap').dataset.jetons).toContain(`pj-p1=${k.nom} 3/${k.pvMax}`));
  });

  it('MJ : « + PJ des joueurs » pose le personnage joué de chacun', async () => {
    session.uid = 'bob';
    joueurs.elements = [
      { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' },
      { id: 'carol', nom: 'Carol', rejointLe: 1 },
    ];
    persos.elements = [kargash()];
    render(CarteTable, { props: { role: 'mj' } });
    montrer('test_tavern');
    await screen.findByTestId('battlemap'); // géométrie chargée : on peut placer
    await fireEvent.click(await screen.findByRole('button', { name: '+ PJ des joueurs (1)' }));
    expect(carteActions.poserJeton).toHaveBeenCalledWith('test_tavern', 'pj-p1', expect.objectContaining({ nom: kargash().nom, proprietaire: 'alice' }));
  });
});

describe('CarteTable : en combat (L6.1 : 3b, 7a, 8a)', () => {
  const combattant = (id: string, c: Record<string, unknown> = {}) => ({
    id, genre: 'pj', nom: id, perso: id.slice(3), uid: 'alice', monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
    mvtBase: 5, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
  });
  const poser = (actif: string) => {
    jetonsScene.elements = [
      { id: 'pj-p1', genre: 'pj', nom: 'Kargash', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 },
      { id: 'm-r1-a', genre: 'monstre', nom: 'Goule A', couleur: '#c0392b', cx: 5, cy: 5, proprietaire: null, creeLe: 1 },
    ];
    combatDoc.donnees = { nom: 'Goules', scene: 'test_tavern', rencontre: 'r1', statut: 'encours', round: 1, tour: 3, actif, creeLe: 1, closLe: null };
    combattants.elements = [
      combattant('pj-p1', { tourActions: 3, mvt: 1 }),
      combattant('m-r1-a', { genre: 'monstre', perso: null, uid: null, monstre: 'goule', pv: 9, pvMax: 14 }),
    ];
    table.donnees = { sceneActive: 'test_tavern', combat: 'c1' };
    flushSync();
  };

  it('à son tour : son jeton a un budget de cases, et ce qu’il parcourt se décompte ; les PV des monstres en chiffres', async () => {
    session.uid = 'alice';
    render(CarteTable, { props: { role: 'joueur' } });
    poser('pj-p1');
    const carte = await screen.findByTestId('battlemap');
    await waitFor(() => expect(carte.dataset.budget).toBe('pj-p1:4'));
    expect(carte.dataset.actif).toBe('pj-p1');
    expect(carte.dataset.miens).toBe('pj-p1');
    expect(carte.dataset.jetons).toContain('m-r1-a=Goule A 9/14#');
    await fireEvent.click(screen.getByRole('button', { name: 'glisser' }));
    expect(carteActions.deplacerJeton).toHaveBeenCalledWith('test_tavern', 'pj-p1', { cx: 4, cy: 4 });
    expect(combatActions.noterAction).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 3 }), expect.objectContaining({ id: 'pj-p1' }), { cases: 2 });
  });

  it('hors de son tour, son jeton ne bouge pas (8a) ; le MJ bouge tout, sans budget', async () => {
    session.uid = 'alice';
    const vue = render(CarteTable, { props: { role: 'joueur' } });
    poser('m-r1-a');
    const carte = await screen.findByTestId('battlemap');
    await waitFor(() => expect(carte.dataset.actif).toBe('m-r1-a'));
    expect(carte.dataset.miens).toBe('');
    expect(carte.dataset.budget).toBe('');
    vue.unmount();
    session.uid = 'bob';
    render(CarteTable, { props: { role: 'mj' } });
    const mj = await screen.findByTestId('battlemap');
    await waitFor(() => expect(mj.dataset.actif).toBe('m-r1-a'));
    expect(mj.dataset.budget).toBe('');
  });

  it('combat clos : la carte redevient libre', async () => {
    session.uid = 'alice';
    render(CarteTable, { props: { role: 'joueur' } });
    poser('m-r1-a');
    combatDoc.donnees = { ...combatDoc.donnees!, statut: 'clos' };
    flushSync();
    const carte = await screen.findByTestId('battlemap');
    await waitFor(() => expect(carte.dataset.miens).toBe('pj-p1'));
    expect(carte.dataset.actif).toBe('');
    expect(carte.dataset.jetons).not.toContain('#');
  });
});
