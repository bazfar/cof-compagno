import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — import du lore v1 (lot L2.7a) : le MJ dépose
 * lore-v1.json ; une fiche déjà à la table est gardée telle quelle.
 */

const actions = vi.hoisted(() => ({
  importerLore: vi.fn(async (_e: unknown, _p: unknown) => ({ importees: 1, gardees: 1 })),
}));
vi.mock('../../src/lib/actions/lore', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/lore.svelte', async () => (await import('./faux-magasins.svelte')).magasinsLore);

const { loreMj } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: ImportLoreV1 } = await import('../../src/composants/ImportLoreV1.svelte');

const fiche = (titre: string, visibilite: string, source: string, scelle = false) => ({
  titre, categorie: 'Lieux', ordre: 10, etiquettes: [], visibilite, lecteurs: [],
  passages: [{ id: 'p-1', texte: 'Texte.', scelle }], majLe: 1, reveleLe: 1, source,
});
const exportLore = {
  format: 'cof-compagno/lore-v1',
  exporteLe: 1,
  fiches: [
    { id: 'section-libris', fiche: fiche('Libris', 'tous', 'v1:section:libris') },
    { id: 'section-notes', fiche: fiche('Notes MJ', 'mj', 'v1:section:notes', true) },
    { id: 'pnj-bob', fiche: fiche('Bob', 'tous', 'v1:pnj:bob', true) },
  ],
};
const deposer = async (contenu: string) => {
  const champ = screen.getByLabelText(/Choisir lore-v1.json/) as HTMLInputElement;
  const fichier = new File([contenu], 'lore-v1.json', { type: 'application/json' });
  Object.defineProperty(champ, 'files', { value: [fichier], configurable: true });
  await fireEvent.change(champ);
};

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  actions.importerLore.mockClear();
  loreMj.elements = [];
});

describe('import du lore v1', () => {
  it('résume ce qui sera importé, en gardant la fiche déjà présente (même source)', async () => {
    loreMj.elements = [{ id: 'autre-id', ...fiche('Bob modifié', 'tous', 'v1:pnj:bob') }];
    render(ImportLoreV1);
    await deposer(JSON.stringify(exportLore));
    await waitFor(() => expect(screen.getByTestId('resume-import').textContent).toMatch(/^2 fiches à importer : 1 partagée avec tous, 1 pour toi seul, 1 passage scellé ; 1 déjà présente, gardée\.$/));
    await fireEvent.click(screen.getByRole('button', { name: 'Importer 2 fiches' }));
    expect(actions.importerLore).toHaveBeenCalledTimes(1);
    const [, presentes] = actions.importerLore.mock.calls[0]! as [unknown, { ids: Set<string>; sources: Set<string> }];
    expect([...presentes.sources]).toEqual(['v1:pnj:bob']);
    await waitFor(() => expect(screen.getByText(/1 fiche importée, 1 déjà présente gardée telle quelle\./)).toBeTruthy());
  });

  it('un fichier qui n’est pas un export du lore est refusé, sans rien importer', async () => {
    render(ImportLoreV1);
    await deposer(JSON.stringify({ fiches: [] }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("n'est pas un export du lore v1"));
    expect(screen.queryByRole('button', { name: /^Importer/ })).toBeNull();
  });
});
