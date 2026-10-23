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

  it('G2a (9a) : un sort lancé hors combat dit ses PP, l’intention et le d20 du jet d’échec', () => {
    jets.elements = [
      { id: 'j2', auteurUid: 'alice', auteurNom: 'Alice', perso: 'Kylhian', libelle: 'Leurre I, hors combat : raté', formule: '1d20 (échec sur 1 à 10)', des: [7], bonus: 0, total: 7, creeLe: 2, sort: { nom: 'Leurre', palier: 'I', pp: 1, intention: 'Une silhouette', issue: 'rate' } },
      { id: 'j1', auteurUid: 'alice', auteurNom: 'Alice', perso: 'Kylhian', libelle: 'Lumière I, hors combat', formule: 'sort', des: [], bonus: 0, total: 0, creeLe: 1, sort: { nom: 'Lumière', palier: 'I', pp: 0, intention: 'Éclairer la crypte', issue: 'lance' } },
    ];
    render(JournalDes);
    const resultats = within(screen.getByRole('list', { name: 'Derniers jets' }))
      .getAllByRole('listitem')
      .map((l) => l.querySelector('.resultat')?.textContent);
    expect(resultats).toEqual(['1 PP · « Une silhouette » · d20 : 7', '0 PP · « Éclairer la crypte »']);
  });

  it('L6.2 (10a) : un jet de combat dit son détail ; des dégâts subis sans dé n’ont que lui', () => {
    jets.elements = [
      { id: 'j2', auteurUid: 'alice', auteurNom: 'Alice', perso: 'Hyrma', libelle: 'Dégâts subis (physique)', formule: '7', des: [], bonus: 7, total: 6, creeLe: 2, detail: '7 − 1 (armure) = 6 → 22/28 PV' },
      { id: 'j1', auteurUid: 'alice', auteurNom: 'Alice', perso: 'Hyrma', libelle: 'Lance sur Goule A', formule: '1d20+3', des: [11], bonus: 3, total: 14, creeLe: 1, detail: 'd20 11 +3 = 14 contre DEF 13 : touché' },
    ];
    render(JournalDes);
    const lignes = within(screen.getByRole('list', { name: 'Derniers jets' })).getAllByRole('listitem');
    expect(lignes.map((l) => [l.querySelector('.resultat')?.textContent ?? null, l.querySelector('.detail')?.textContent])).toEqual([
      [null, '7 − 1 (armure) = 6 → 22/28 PV'],
      ['1d20+3 → 11 + 3 = 14', 'd20 11 +3 = 14 contre DEF 13 : touché'],
    ]);
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

  it('L2.6 : version compacte, les 8 derniers jets puis la liste entière à la demande', async () => {
    jets.elements = Array.from({ length: 12 }, (_, i) => ({ id: `j${i}`, auteurUid: 'bob', auteurNom: 'Bob', libelle: `Jet ${i}`, formule: '1d6', des: [3], bonus: 0, total: 3, creeLe: 100 - i }));
    render(JournalDes, { props: { compact: true } });
    const liste = () => within(screen.getByRole('list', { name: 'Derniers jets' })).getAllByRole('listitem');
    expect(liste()).toHaveLength(8);
    expect(liste()[0]!.textContent).toContain('Jet 0');
    await fireEvent.click(screen.getByRole('button', { name: 'Voir les 12 derniers' }));
    expect(liste()).toHaveLength(12);
    await fireEvent.click(screen.getByRole('button', { name: 'Réduire' }));
    expect(liste()).toHaveLength(8);
  });

  it('version complète (par défaut) : tous les jets suivis, sans bouton', () => {
    jets.elements = Array.from({ length: 12 }, (_, i) => ({ id: `j${i}`, auteurUid: 'bob', auteurNom: 'Bob', libelle: `Jet ${i}`, formule: '1d6', des: [3], bonus: 0, total: 3, creeLe: 100 - i }));
    render(JournalDes);
    expect(within(screen.getByRole('list', { name: 'Derniers jets' })).getAllByRole('listitem')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /^Voir les/ })).toBeNull();
  });
});
