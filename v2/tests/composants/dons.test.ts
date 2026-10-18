import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — dons d'objets entre joueurs (lot L3.3) : « Donner… »
 * dans le sac propose l'objet au personnage joué d'un autre joueur ; le
 * panneau des dons montre ce qui attend un geste (accepter, refuser,
 * annuler, reprendre).
 */

const actions = vi.hoisted(() => {
  class RefusDon extends Error {}
  return {
    RefusDon,
    proposerDon: vi.fn(async (_p: string, _c: string, _n: number, _a: unknown) => 'd1'),
    accepterDon: vi.fn(async (_id: string) => {}),
    refuserDon: vi.fn(async (_id: string) => {}),
    annulerDon: vi.fn(async (_id: string) => {}),
    reprendreDon: vi.fn(async (_id: string) => {}),
  };
});
vi.mock('../../src/lib/actions/dons', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ appliquerChangement: vi.fn(), messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/actions/journal', () => ({ noterJet: vi.fn(), lancerEtNoter: vi.fn() }));
vi.mock('../../src/lib/actions/montee', () => ({ monterNiveau: vi.fn() }));
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/dons.svelte', async () => (await import('./faux-magasins.svelte')).magasinsDons);

const { dons } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const E = await import('../../src/lib/regles/equipement');
const { default: FicheVivante } = await import('../../src/composants/FicheVivante.svelte');
const { default: DonsJoueur } = await import('../../src/composants/DonsJoueur.svelte');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const corvin = { uid: 'carol', perso: 'pc', nom: 'Corvin', joueur: 'Carol' };
const brann = { uid: 'dan', perso: 'pd', nom: 'Brann', joueur: 'Dan' };
const don = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  deUid: 'alice',
  dePerso: 'pa',
  deNom: 'Aëlys',
  aUid: 'carol',
  aPerso: 'pc',
  aNom: 'Corvin',
  objet: { nom: 'Potion de soins', quantite: 2 },
  statut: 'propose',
  creeLe: 1,
  resoluLe: null,
  ...extra,
});

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  dons.elements = [];
});

describe('donner depuis le sac', () => {
  const avecPotions = () => {
    const base = reelle('Karlach', 'pa');
    const ch = E.ajouterDuCatalogue(base, 'potion_soin', 3);
    return { fiche: { ...E.appliquer(base, ch), id: 'pa' }, cle: Object.keys(ch.inventaire)[0]! };
  };

  it('choisir le destinataire et la quantité, puis proposer', async () => {
    const { fiche, cle } = avecPotions();
    render(FicheVivante, { props: { fiche, modifiable: true, destinataires: [brann, corvin] } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Équipement' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Donner Potion de soin' }));
    const groupe = screen.getByRole('group', { name: 'Donner Potion de soin' });
    expect(within(groupe).getByRole('button', { name: 'Proposer' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.change(within(groupe).getByLabelText('Donner à'), { target: { value: 'pc' } });
    await fireEvent.input(within(groupe).getByLabelText('Combien'), { target: { value: '2' } });
    await fireEvent.click(within(groupe).getByRole('button', { name: 'Proposer' }));
    expect(actions.proposerDon).toHaveBeenCalledWith('pa', cle, 2, corvin);
    await waitFor(() => expect(screen.getByText('Potion de soin proposé à Corvin : en attente de sa réponse.')).toBeTruthy());
  });

  it('un refus s’affiche ; sans destinataire (vue du MJ), pas de « Donner… »', async () => {
    actions.proposerDon.mockRejectedValueOnce(new actions.RefusDon('Cet objet n’est plus dans le sac.'));
    const { fiche } = avecPotions();
    const { unmount } = render(FicheVivante, { props: { fiche, modifiable: true, destinataires: [corvin] } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Équipement' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Donner Potion de soin' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Proposer' }));
    await waitFor(() => expect(screen.getByText('Cet objet n’est plus dans le sac.')).toBeTruthy());
    unmount();
    render(FicheVivante, { props: { fiche, modifiable: true, mj: true } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Équipement' }));
    expect(screen.queryByRole('button', { name: 'Donner Potion de soin' })).toBeNull();
  });
});

describe('panneau des dons', () => {
  it('rien en attente : rien à l’écran', () => {
    dons.elements = [don('d1', { statut: 'accepte', resoluLe: 2 })];
    render(DonsJoueur);
    expect(screen.queryByRole('region', { name: 'Dons d’objets' })).toBeNull();
  });

  it('reçu : accepter ou refuser', async () => {
    session.uid = 'carol';
    dons.elements = [don('d1')];
    render(DonsJoueur);
    const recu = within(screen.getByRole('list', { name: 'Objets proposés' }));
    expect(recu.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Aëlys propose Potion de soins ×2 à Corvin')).toBeTruthy();
    await fireEvent.click(recu.getByRole('button', { name: 'Accepter' }));
    expect(actions.accepterDon).toHaveBeenCalledWith('d1');
    await fireEvent.click(recu.getByRole('button', { name: 'Refuser' }));
    expect(actions.refuserDon).toHaveBeenCalledWith('d1');
  });

  it('proposé : annuler ; refusé : reprendre', async () => {
    dons.elements = [don('d1'), don('d2', { statut: 'refuse', resoluLe: 2, objet: { nom: 'Dague' } })];
    render(DonsJoueur);
    await fireEvent.click(within(screen.getByRole('list', { name: 'Dons en attente' })).getByRole('button', { name: 'Annuler' }));
    expect(actions.annulerDon).toHaveBeenCalledWith('d1');
    await fireEvent.click(within(screen.getByRole('list', { name: 'Dons refusés' })).getByRole('button', { name: 'Reprendre' }));
    expect(actions.reprendreDon).toHaveBeenCalledWith('d2');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Dague est revenu dans le sac de Aëlys.'));
  });

  it('un geste déjà réglé ailleurs : le refus s’affiche', async () => {
    session.uid = 'carol';
    actions.accepterDon.mockRejectedValueOnce(new actions.RefusDon('Ce don a déjà été réglé.'));
    dons.elements = [don('d1')];
    render(DonsJoueur);
    await fireEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ce don a déjà été réglé.'));
  });
});
