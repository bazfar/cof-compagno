import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
vi.mock('../../src/lib/actions/carte', () => ({
  basculerPorte: vi.fn(async () => {}),
  deplacerJeton: vi.fn(async () => {}),
  effacerDessin: vi.fn(async () => {}),
  enregistrerExploration: vi.fn(async () => {}),
  idJetonPJ: (uid: string) => `pj-${uid}`,
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

const { table } = await import('./faux-magasins.svelte');
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
