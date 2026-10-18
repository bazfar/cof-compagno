import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — écran Lore (lot L2.7b). Côté joueur : lecture,
 * recherche, marque « nouveau ». Côté MJ : partage, sceaux et édition
 * passent par enregistrerFicheLore avec la fiche d'avant (pour dater les
 * révélations) ; le brouillon n'est jamais écrasé par la base.
 */

const actions = vi.hoisted(() => ({
  enregistrerFicheLore: vi.fn(async (_id: string, _avant: unknown, apres: unknown) => apres),
  supprimerFicheLore: vi.fn(async (_id: string) => {}),
}));
vi.mock('../../src/lib/actions/lore', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/lore.svelte', async () => (await import('./faux-magasins.svelte')).magasinsLore);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { loreMj, loreJoueur, joueurs } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: LoreJoueur } = await import('../../src/composants/LoreJoueur.svelte');
const { default: LoreMj } = await import('../../src/composants/LoreMj.svelte');

const versionJ = (id: string, titre: string, categorie: string, reveleLe = 1, texte = 'Texte.') => ({
  id, titre, categorie, ordre: 10, etiquettes: [], lecteurs: ['*'], passages: [{ id: 'p-1', texte }], majLe: 1, reveleLe,
});
const ficheMj = (extra: Record<string, unknown> = {}) => ({
  id: 'marges', titre: "L'Atelier des Marges", categorie: 'Lieux', ordre: 10, etiquettes: [], visibilite: 'tous', lecteurs: [],
  passages: [
    { id: 'p-1', texte: 'Un atelier d’étudiants.', scelle: false },
    { id: 'p-2', texte: 'La jauge de Remous.', scelle: true },
  ],
  majLe: 1, reveleLe: 1, ...extra,
});

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  localStorage.clear();
  actions.enregistrerFicheLore.mockClear();
  actions.supprimerFicheLore.mockClear();
  loreMj.elements = [];
  loreJoueur.elements = [];
  joueurs.elements = [];
});

describe('lore côté joueur', () => {
  it('par catégorie, avec recherche sans accents ; la fiche s’ouvre', async () => {
    loreJoueur.elements = [versionJ('a', 'Libris', 'Lieux'), versionJ('b', 'Écorce', 'Fondations', 1, 'La sève est la magie.')];
    render(LoreJoueur);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Fondations', 'Lieux']);
    await fireEvent.input(screen.getByLabelText('Chercher dans le lore'), { target: { value: 'seve' } });
    expect(screen.queryByRole('button', { name: /Libris/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /Écorce/ }));
    expect(within(screen.getByRole('region', { name: 'Fiche de lore' })).getByText('La sève est la magie.')).toBeTruthy();
  });

  it('« nouveau » : rien au premier passage ; une révélation ensuite est marquée, comptée, et s’efface à l’ouverture', async () => {
    loreJoueur.elements = [versionJ('a', 'Libris', 'Lieux')];
    const compte = vi.fn();
    render(LoreJoueur, { props: { surNouveautes: compte } });
    flushSync();
    expect(screen.queryByText('nouveau')).toBeNull();
    loreJoueur.elements = [versionJ('a', 'Libris', 'Lieux'), versionJ('b', 'Le marché noir', 'Lieux', 50)];
    flushSync();
    expect(within(screen.getByRole('button', { name: /Le marché noir/ })).getByText('nouveau')).toBeTruthy();
    expect(compte).toHaveBeenLastCalledWith(1);
    await fireEvent.click(screen.getByRole('button', { name: /Le marché noir/ }));
    await waitFor(() => expect(screen.queryByText('nouveau')).toBeNull());
    expect(compte).toHaveBeenLastCalledWith(0);
  });

  it('rien de partagé : le message le dit', () => {
    render(LoreJoueur);
    expect(screen.getByText("Le MJ n'a encore rien partagé.")).toBeTruthy();
  });
});

describe('lore côté MJ', () => {
  const ouvrir = async () => {
    session.uid = 'mj';
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1 }, { id: 'carol', nom: 'Carol', rejointLe: 1 }];
    loreMj.elements = [ficheMj()];
    render(LoreMj);
    await fireEvent.click(screen.getByRole('button', { name: /L'Atelier des Marges/ }));
  };
  const derniereEcriture = () => actions.enregistrerFicheLore.mock.calls.at(-1)! as [string, Record<string, unknown>, Record<string, unknown>];

  it('partage à certains : la fiche d’avant et la nouvelle partent à l’écriture', async () => {
    await ouvrir();
    await fireEvent.click(screen.getByRole('button', { name: 'Certains' }));
    const [id, avant, apres] = derniereEcriture();
    expect(id).toBe('marges');
    expect(avant).toMatchObject({ visibilite: 'tous' });
    expect(avant).not.toHaveProperty('id');
    expect(apres).toMatchObject({ visibilite: 'certains', lecteurs: [] });
    loreMj.elements = [ficheMj({ visibilite: 'certains' })];
    flushSync();
    await fireEvent.click(screen.getByLabelText('Carol'));
    expect(derniereEcriture()[2]).toMatchObject({ visibilite: 'certains', lecteurs: ['carol'] });
  });

  it('sceller et desceller un passage d’un clic', async () => {
    await ouvrir();
    await fireEvent.click(screen.getByRole('button', { name: /^Desceller : La jauge de Remous/ }));
    expect((derniereEcriture()[2].passages as { id: string; scelle: boolean }[]).map((p) => p.scelle)).toEqual([false, false]);
    await fireEvent.click(screen.getByRole('button', { name: /^Sceller : Un atelier/ }));
    expect((derniereEcriture()[2].passages as { id: string; scelle: boolean }[]).map((p) => p.scelle)).toEqual([true, true]);
  });

  it('édition : le brouillon survit à une mise à jour de la base ; titre vide refusé ; le partage est repris de la base', async () => {
    await ouvrir();
    await fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    await fireEvent.input(screen.getByLabelText('Titre'), { target: { value: 'Atelier des Marges (Académie)' } });
    // Pendant la saisie, la fiche change en base (partage réglé ailleurs) : le brouillon reste.
    loreMj.elements = [ficheMj({ visibilite: 'certains', lecteurs: ['alice'] })];
    flushSync();
    expect((screen.getByLabelText('Titre') as HTMLInputElement).value).toBe('Atelier des Marges (Académie)');
    await fireEvent.input(screen.getByLabelText('Texte du passage 1'), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const apres = derniereEcriture()[2];
    expect(apres).toMatchObject({ titre: 'Atelier des Marges (Académie)', visibilite: 'certains', lecteurs: ['alice'] });
    // Le passage vidé n'est pas gardé.
    expect((apres.passages as { id: string }[]).map((p) => p.id)).toEqual(['p-2']);
    await fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    await fireEvent.input(screen.getByLabelText('Titre'), { target: { value: '   ' } });
    actions.enregistrerFicheLore.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toMatch(/^Fiche non enregistrée : titre/);
    expect(actions.enregistrerFicheLore).not.toHaveBeenCalled();
  });

  it('nouvelle fiche : visible du MJ seul, rangée après les autres de sa catégorie', async () => {
    await ouvrir();
    await fireEvent.click(screen.getByRole('button', { name: 'Nouvelle fiche' }));
    await fireEvent.input(screen.getByLabelText('Titre'), { target: { value: 'La Racine Dorée' } });
    await fireEvent.input(screen.getByLabelText('Texte du passage 1'), { target: { value: 'Une taverne.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const [id, avant, apres] = derniereEcriture();
    expect(id).toMatch(/^f-/);
    expect(avant).toBeNull();
    expect(apres).toMatchObject({ titre: 'La Racine Dorée', categorie: 'Lieux', ordre: 20, visibilite: 'mj', lecteurs: [] });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Fiche créée, visible de toi seul.'));
  });

  it('supprimer demande confirmation', async () => {
    await ouvrir();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(actions.supprimerFicheLore).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(actions.supprimerFicheLore).toHaveBeenCalledWith('marges');
    confirmer.mockRestore();
  });
});
