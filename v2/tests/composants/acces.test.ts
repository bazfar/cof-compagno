import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — retrouver son joueur (correctif du 19/10/2026,
 * pseudo + code perso). Accueil : première venue ou « Je suis déjà venu ».
 * Joueur inscrit avant le correctif : choisir son code. MJ : voir qui a un
 * code, repérer et retirer les doublons.
 */

const actions = vi.hoisted(() => ({
  rejoindreCommeJoueur: vi.fn(async (_n: string, _c: string) => {}),
  retrouverJoueur: vi.fn(async (_n: string, _c: string) => {}),
  rejoindreCommeMj: vi.fn(async (_n: string, _c: string) => {}),
  protegerJoueur: vi.fn(async (_c: string) => {}),
  changerDeJoueur: vi.fn(async () => {}),
  retirerJoueur: vi.fn(async (_uid: string) => {}),
}));
vi.mock('../../src/lib/actions/acces', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { joueurs, persos } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: Accueil } = await import('../../src/ecrans/Accueil.svelte');
const { default: ProtegerJoueur } = await import('../../src/composants/ProtegerJoueur.svelte');
const { default: JoueursMj } = await import('../../src/composants/JoueursMj.svelte');

beforeEach(() => {
  session.table = 'arbre-monde';
  session.uid = 'u1';
  session.nom = 'thomas';
  session.protege = false;
  Object.values(actions).forEach((f) => f.mockClear());
  joueurs.elements = [];
  persos.elements = [];
});

describe('accueil', () => {
  it('première venue : pseudo et code perso', async () => {
    render(Accueil);
    await fireEvent.input(screen.getByLabelText('Ton pseudo'), { target: { value: 'Thomas' } });
    await fireEvent.input(screen.getByLabelText('Code perso'), { target: { value: 'dragon42' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la table' }));
    expect(actions.rejoindreCommeJoueur).toHaveBeenCalledWith('Thomas', 'dragon42');
  });

  it('« Je suis déjà venu » retrouve le joueur ; une erreur s’affiche', async () => {
    actions.retrouverJoueur.mockRejectedValueOnce(new Error('Pseudo ou code perso incorrect.'));
    render(Accueil);
    await fireEvent.click(screen.getByLabelText('Je suis déjà venu'));
    await fireEvent.input(screen.getByLabelText('Ton pseudo'), { target: { value: 'thomas' } });
    await fireEvent.input(screen.getByLabelText('Code perso'), { target: { value: 'mauvais1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Retrouver mon joueur' }));
    expect(actions.retrouverJoueur).toHaveBeenCalledWith('thomas', 'mauvais1');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Pseudo ou code perso incorrect.'));
  });

  it('MJ : nom et code MJ, sans code perso', async () => {
    render(Accueil);
    await fireEvent.click(screen.getByLabelText('Maître du jeu'));
    expect(screen.queryByLabelText('Code perso')).toBeNull();
    await fireEvent.input(screen.getByLabelText('Ton nom'), { target: { value: 'Bob' } });
    await fireEvent.input(screen.getByLabelText('Code MJ'), { target: { value: 'secret' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la table' }));
    expect(actions.rejoindreCommeMj).toHaveBeenCalledWith('Bob', 'secret');
  });
});

describe('joueur sans code perso', () => {
  it('choisir son code ; « me reconnecter » revient à l’accueil ; rien une fois protégé', async () => {
    const { unmount } = render(ProtegerJoueur);
    const carte = within(screen.getByRole('form', { name: 'Choisir un code perso' }));
    await fireEvent.input(carte.getByLabelText('Code perso'), { target: { value: 'dragon42' } });
    await fireEvent.click(carte.getByRole('button', { name: 'Enregistrer mon code' }));
    expect(actions.protegerJoueur).toHaveBeenCalledWith('dragon42');
    await fireEvent.click(carte.getByRole('button', { name: "J'ai déjà un code : me reconnecter" }));
    expect(actions.changerDeJoueur).toHaveBeenCalled();
    unmount();
    session.protege = true;
    render(ProtegerJoueur);
    expect(screen.queryByRole('form', { name: 'Choisir un code perso' })).toBeNull();
  });

  it('pseudo déjà protégé ailleurs : le message s’affiche', async () => {
    actions.protegerJoueur.mockRejectedValueOnce(new Error("Le pseudo « thomas » est déjà pris à cette table. Si c'est toi, choisis « Je suis déjà venu »."));
    render(ProtegerJoueur);
    await fireEvent.input(screen.getByLabelText('Code perso'), { target: { value: 'dragon42' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mon code' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/déjà pris/));
  });
});

describe('joueurs côté MJ', () => {
  it('les deux « thomas » sont marqués doublons ; retirer demande confirmation', async () => {
    joueurs.elements = [
      { id: 'u1', nom: 'thomas', rejointLe: Date.UTC(2026, 9, 18), protege: true },
      { id: 'u2', nom: 'Thomas', rejointLe: Date.UTC(2026, 9, 19) },
      { id: 'u3', nom: 'Alice', rejointLe: Date.UTC(2026, 9, 18), protege: true },
    ];
    persos.elements = [{ id: 'p1', nom: 'Corvin', proprietaireUid: 'u1' }];
    render(JoueursMj);
    expect(screen.getAllByText('doublon')).toHaveLength(2);
    expect(screen.getAllByText('code perso')).toHaveLength(2);
    expect(screen.getByText('sans code')).toBeTruthy();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const bouton = screen.getByRole('button', { name: 'Retirer Thomas (arrivé le 19 octobre)' });
    await fireEvent.click(bouton);
    expect(actions.retirerJoueur).not.toHaveBeenCalled();
    await fireEvent.click(bouton);
    expect(actions.retirerJoueur).toHaveBeenCalledWith('u2');
    expect(confirmer.mock.calls[1]?.[0]).toBe('Retirer « Thomas » de la table ?');
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer thomas (arrivé le 18 octobre)' }));
    expect(confirmer.mock.calls[2]?.[0]).toMatch(/Ses 1 personnage\(s\) restent dans le groupe/);
    confirmer.mockRestore();
  });
});
