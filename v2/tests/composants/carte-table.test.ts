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

const { table, jetonsScene, joueurs, persos } = await import('./faux-magasins.svelte');
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
  vi.mocked(carteActions.poserJeton).mockClear();
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
