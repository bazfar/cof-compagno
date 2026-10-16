import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — journal de dés commun (lot L2.5, décision 4a) :
 * toute la table voit tous les jets ; le lanceur libre note ses jets.
 */

const journal = vi.hoisted(() => ({
  lancerEtNoter: vi.fn(async (_l: string, f: string) => (f === '2d' ? null : { des: [3], faces: 6, bonus: 0, total: 3 })),
  noterJet: vi.fn(async () => {}),
}));
vi.mock('../../src/lib/actions/journal', () => ({ ...journal, messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/journal.svelte', async () => (await import('./faux-magasins.svelte')).magasinsJournal);

const { jets } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: JournalDes } = await import('../../src/composants/JournalDes.svelte');

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  journal.lancerEtNoter.mockClear();
  jets.elements = [];
});

describe('journal de dés', () => {
  it('les jets de toute la table : personnage (sinon joueur), motif et résultat', () => {
    jets.elements = [
      { id: 'j2', auteurUid: 'bob', auteurNom: 'Bob', perso: 'Kargash', libelle: 'Test de Force', formule: '1d20+3', des: [14], bonus: 3, total: 17, creeLe: 2 },
      { id: 'j1', auteurUid: 'mj', auteurNom: 'Thomas', libelle: 'Jet libre', formule: '2d6', des: [2, 5], bonus: 0, total: 7, creeLe: 1 },
    ];
    render(JournalDes);
    const lignes = within(screen.getByRole('list', { name: 'Derniers jets' })).getAllByRole('listitem');
    expect(lignes.map((l) => l.querySelector('strong')?.textContent)).toEqual(['Kargash', 'Thomas']);
    expect(lignes[0]!.textContent).toContain('Test de Force');
    expect(lignes[0]!.textContent).toContain('1d20+3 → 14 + 3 = 17');
    expect(lignes[1]!.textContent).toContain('2d6 → 2 + 5 = 7');
  });

  it('lanceur libre : formule et motif ; dé rapide ; formule illisible expliquée', async () => {
    render(JournalDes);
    expect(screen.getByText('Aucun jet pour l\'instant.')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Formule'), { target: { value: '3d6+1' } });
    await fireEvent.input(screen.getByLabelText('Pour quoi'), { target: { value: 'Dégâts' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    expect(journal.lancerEtNoter).toHaveBeenLastCalledWith('Dégâts', '3d6+1');
    await fireEvent.input(screen.getByLabelText('Pour quoi'), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: '1d8' }));
    expect(journal.lancerEtNoter).toHaveBeenLastCalledWith('Jet libre', '1d8');
    await fireEvent.input(screen.getByLabelText('Formule'), { target: { value: '2d' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Formule illisible : « 2d »'));
  });
});
