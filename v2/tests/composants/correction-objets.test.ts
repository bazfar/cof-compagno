import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — lot L3.6. Le MJ corrige une fiche (seuls les champs
 * touchés partent, après confirmation) ; Données › Objets : chercher un
 * objet, l'ajouter au sac d'un personnage ou le mettre au vote.
 */

const persosActions = vi.hoisted(() => ({
  corrigerFiche: vi.fn(async (_id: string, _f: unknown, _c: unknown) => {}),
  appliquerChangement: vi.fn(async (_id: string, _ch: unknown) => {}),
}));
vi.mock('../../src/lib/actions/persos', () => ({ ...persosActions, messageErreurPerso: (e: unknown) => String(e) }));
const butinActions = vi.hoisted(() => {
  class RefusButin extends Error {}
  return { RefusButin, mettreAuVote: vi.fn(async (_id: string, _n: number) => 1) };
});
vi.mock('../../src/lib/actions/butin', () => butinActions);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);

const { persos } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { default: CorrectionFiche } = await import('../../src/composants/CorrectionFiche.svelte');
const { default: ObjetsMj } = await import('../../src/composants/ObjetsMj.svelte');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(persosActions).forEach((f) => f.mockClear());
  butinActions.mettreAuVote.mockClear();
  persos.elements = [];
});

describe('correction d’une fiche par le MJ', () => {
  it('seuls les champs touchés partent, après confirmation', async () => {
    const k = reelle('Karlach', 'p-c');
    const surFin = vi.fn();
    render(CorrectionFiche, { props: { fiche: k, surFin } });
    const zone = within(screen.getByRole('region', { name: 'Corriger la fiche (MJ)' }));
    expect(zone.getByText('Aucune modification.')).toBeTruthy();
    await fireEvent.input(zone.getByLabelText('PV max'), { target: { value: String(k.pvMax + 4) } });
    await fireEvent.input(zone.getByLabelText('FOR'), { target: { value: '16' } });
    expect(zone.getByText('Modifié : caractéristiques, PV max')).toBeTruthy();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await fireEvent.click(zone.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(persosActions.corrigerFiche).toHaveBeenCalledTimes(1));
    const [id, , champs] = persosActions.corrigerFiche.mock.calls[0]! as [string, unknown, Record<string, unknown>];
    expect(id).toBe('p-c');
    expect(Object.keys(champs).sort()).toEqual(['caracs', 'pvMax']);
    expect((champs.caracs as Record<string, number>).FOR).toBe(16);
    expect(surFin).toHaveBeenCalledWith('Fiche corrigée : caractéristiques, PV max.');
    confirmer.mockRestore();
  });

  it('un refus s’affiche et rien n’est écrit ; régler le rang d’une voie', async () => {
    const k = reelle('Karlach', 'p-c');
    render(CorrectionFiche, { props: { fiche: k, surFin: () => {} } });
    await fireEvent.input(screen.getByLabelText('FOR'), { target: { value: '45' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toBe('FOR doit être un entier entre 1 et 30.');
    expect(persosActions.corrigerFiche).not.toHaveBeenCalled();
    const rang = (screen.getAllByLabelText(/^Rang dans /) as HTMLSelectElement[]).find((x) => x.value !== '0')!;
    await fireEvent.change(rang, { target: { value: '0' } });
    expect(screen.getByText(/Modifié : .*voies et rangs/)).toBeTruthy();
  });
});

describe('Données › Objets', () => {
  it('chercher, lire la fiche, ajouter au sac d’un personnage, mettre au vote', async () => {
    persos.elements = [reelle('Karlach', 'p-c')];
    render(ObjetsMj);
    await fireEvent.input(screen.getByLabelText('Chercher un objet'), { target: { value: 'potion de soin' } });
    const liste = within(screen.getByRole('list', { name: 'Objets trouvés' }));
    await fireEvent.click(liste.getAllByRole('button').find((b) => b.textContent?.startsWith('Potion de soin'))!);
    expect(screen.getByRole('heading', { name: 'Potion de soin' })).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Quantité'), { target: { value: '2' } });
    await fireEvent.change(screen.getByLabelText('Personnage qui reçoit l’objet'.replace('’', "'")), { target: { value: 'p-c' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter au sac' }));
    await waitFor(() => expect(persosActions.appliquerChangement).toHaveBeenCalledTimes(1));
    const [id, ch] = persosActions.appliquerChangement.mock.calls[0]! as [string, { inventaire: Record<string, { id: string; quantite?: number }> }];
    expect(id).toBe('p-c');
    expect(Object.values(ch.inventaire).some((o) => o.id === 'potion_soin')).toBe(true);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/ajouté au sac de Karlach/));
    await fireEvent.click(screen.getByRole('button', { name: 'Mettre au vote' }));
    expect(butinActions.mettreAuVote).toHaveBeenCalledWith('potion_soin', 2);
  });
});
