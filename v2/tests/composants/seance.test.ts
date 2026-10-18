import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — séance (lot L3.1) : le MJ ouvre une séance avec
 * les présents précochés (joueurs ayant un personnage joué), coche et
 * décoche pendant la séance, puis la clôt. La séance ouverte s'affiche
 * dans la barre du haut.
 */

const actions = vi.hoisted(() => {
  class RefusSeance extends Error {}
  return {
    RefusSeance,
    ouvrirSeance: vi.fn(async (_n: number, _p: string[]) => 's0014'),
    changerPresents: vi.fn(async (_id: string, _p: string[]) => {}),
    cloreSeance: vi.fn(async (_id: string) => {}),
  };
});
vi.mock('../../src/lib/actions/seances', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/seances.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSeances);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { table, seances, joueurs } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: SeanceMj } = await import('../../src/composants/SeanceMj.svelte');
const { default: BarreHaut } = await import('../../src/composants/BarreHaut.svelte');

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  table.donnees = { sceneActive: null, seanceOuverte: null };
  seances.elements = [{ id: 's0013', numero: 13, ouverteLe: Date.UTC(2026, 9, 11, 18), closeLe: Date.UTC(2026, 9, 11, 21), presents: ['alice'] }];
  joueurs.elements = [
    { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p-a' },
    { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'p-c' },
    { id: 'dan', nom: 'Dan', rejointLe: 1 },
  ];
});

describe('séance côté MJ', () => {
  it('ouvrir : numéro suivant, présents précochés (personnage joué), corrigeables', async () => {
    render(SeanceMj);
    expect(screen.getByText('Dernière : séance 13, le 11 octobre.')).toBeTruthy();
    expect((screen.getByLabelText('Alice') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Dan') as HTMLInputElement).checked).toBe(false);
    await fireEvent.click(screen.getByLabelText('Carol'));
    await fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la séance 14' }));
    expect(actions.ouvrirSeance).toHaveBeenCalledWith(14, ['alice']);
  });

  it('ouverte : cocher et décocher écrit les présents ; clore demande confirmation', async () => {
    table.donnees = { sceneActive: null, seanceOuverte: { id: 's0014', numero: 14 } };
    seances.elements = [{ id: 's0014', numero: 14, ouverteLe: 1, closeLe: null, presents: ['alice'] }];
    render(SeanceMj);
    expect(screen.getByRole('heading', { name: 'Séance 14' })).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Dan'));
    expect(actions.changerPresents).toHaveBeenLastCalledWith('s0014', ['alice', 'dan']);
    await fireEvent.click(screen.getByLabelText('Alice'));
    expect(actions.changerPresents).toHaveBeenLastCalledWith('s0014', []);
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Clore la séance' }));
    expect(actions.cloreSeance).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Clore la séance' }));
    expect(actions.cloreSeance).toHaveBeenCalledWith('s0014');
    confirmer.mockRestore();
  });

  it('un refus (séance déjà ouverte ailleurs) s’affiche', async () => {
    actions.ouvrirSeance.mockRejectedValueOnce(new actions.RefusSeance("La séance 14 est déjà ouverte : clos-la d'abord."));
    render(SeanceMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la séance 14' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("La séance 14 est déjà ouverte : clos-la d'abord."));
  });
});

describe('barre du haut', () => {
  it('affiche la séance ouverte, des deux côtés', () => {
    render(BarreHaut, { props: { etiquette: 'Joueur' } });
    expect(screen.queryByText(/^Séance \d+$/)).toBeNull();
    table.donnees = { sceneActive: null, seanceOuverte: { id: 's0014', numero: 14 } };
    flushSync();
    expect(screen.getByRole('status').textContent).toBe('Séance 14');
  });
});
