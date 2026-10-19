import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — butin (lot L3.4). Joueur : Besoin / Envie /
 * Passer, son d100, la relance à égalité. MJ : mettre au vote, clore,
 * attribuer directement, et le départage automatique quand tous les
 * joueurs à égalité ont relancé.
 */

const actions = vi.hoisted(() => {
  class RefusButin extends Error {}
  return {
    RefusButin,
    voter: vi.fn(async (_id: string, _c: string, _p: unknown) => ({ d100: 87, lance: true, objet: 'Dague' })),
    relancer: vi.fn(async (_id: string) => 64),
    mettreAuVote: vi.fn(async (_id: string, _n: number) => 1),
    avancerButin: vi.fn(async (_id: string) => 'attribue'),
    attribuerDirectement: vi.fn(async (_id: string, _d: unknown) => {}),
    retirerButin: vi.fn(async (_id: string) => {}),
  };
});
vi.mock('../../src/lib/actions/butin', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/butins.svelte', async () => (await import('./faux-magasins.svelte')).magasinsButins);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { butins, joueurs, persos } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: ButinJoueur } = await import('../../src/composants/ButinJoueur.svelte');
const { default: ButinMj } = await import('../../src/composants/ButinMj.svelte');

const vote = (choix: string, d100: number, nom: string, perso: string, relances: number[] = []) => ({ choix, perso, nom, d100, relances, le: 1 });
const butin = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  objet: { id: 'dague', nom: 'Dague', type: 'arme' },
  statut: 'vote',
  creeLe: 1,
  tour: 0,
  enLice: [],
  votes: {},
  gagnant: null,
  resoluLe: null,
  ...extra,
});

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  joueurs.elements = [
    { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'pa' },
    { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'pc' },
  ];
  persos.elements = [
    { id: 'pa', nom: 'Aëlys', proprietaireUid: 'alice' },
    { id: 'pc', nom: 'Corvin', proprietaireUid: 'carol' },
  ];
  butins.elements = [];
});

describe('butin côté joueur', () => {
  it('rien au vote, rien attribué : pas de carte', () => {
    render(ButinJoueur);
    expect(screen.queryByRole('region', { name: 'Butin' })).toBeNull();
  });

  it('voter Besoin avec son personnage joué ; le d100 s’affiche', async () => {
    butins.elements = [butin('b1', { votes: { carol: vote('envie', 40, 'Corvin', 'pc') } })];
    render(ButinJoueur);
    const choix = within(screen.getByRole('group', { name: 'Ton choix pour Dague' }));
    await fireEvent.click(choix.getByRole('button', { name: 'Besoin' }));
    expect(actions.voter).toHaveBeenCalledWith('b1', 'besoin', { id: 'pa', nom: 'Aëlys' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Besoin : ton d100 donne 87.'));
    expect(within(screen.getByRole('list', { name: 'Votes pour Dague' })).getByText('Corvin')).toBeTruthy();
  });

  it('sans personnage joué, on ne vote pas', () => {
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1 }];
    butins.elements = [butin('b1')];
    render(ButinJoueur);
    expect(screen.getByText(/Choisis un personnage joué pour voter/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Besoin' }).hasAttribute('disabled')).toBe(true);
  });

  it('à égalité : relancer ; les autres voient qu’on relance ; l’objet attribué reste affiché', async () => {
    const votes = { alice: vote('besoin', 80, 'Aëlys', 'pa'), carol: vote('besoin', 80, 'Corvin', 'pc') };
    butins.elements = [
      butin('b1', { statut: 'relance', tour: 1, enLice: ['alice', 'carol'], votes }),
      butin('b0', { statut: 'attribue', objet: { nom: 'Potion de soin' }, gagnant: { uid: 'carol', perso: 'pc', nom: 'Corvin', mode: 'direct' }, resoluLe: 5 }),
    ];
    render(ButinJoueur);
    await fireEvent.click(screen.getByRole('button', { name: 'Relancer mon d100' }));
    expect(actions.relancer).toHaveBeenCalledWith('b1');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Relance : ton d100 donne 64.'));
    expect(within(screen.getByRole('list', { name: 'Derniers objets attribués' })).getByText(/Corvin \(par le MJ\)/)).toBeTruthy();
  });
});

describe('butin côté MJ', () => {
  it('mettre au vote un objet du catalogue', async () => {
    render(ButinMj);
    await fireEvent.change(screen.getByLabelText('Objet à mettre au vote'), { target: { value: 'potion_soin' } });
    await fireEvent.input(screen.getByLabelText('Combien'), { target: { value: '3' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Mettre au vote' }));
    expect(actions.mettreAuVote).toHaveBeenCalledWith('potion_soin', 3);
  });

  it('clore le vote ; attribuer directement, même pendant le vote', async () => {
    butins.elements = [butin('b1', { votes: { alice: vote('besoin', 12, 'Aëlys', 'pa') } })];
    render(ButinMj);
    expect(screen.getByText('Vote ouvert : 1 vote.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le vote' }));
    expect(actions.avancerButin).toHaveBeenCalledWith('b1');
    await fireEvent.change(screen.getByLabelText('Attribuer Dague à'), { target: { value: 'pc' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Attribuer' }));
    expect(actions.attribuerDirectement).toHaveBeenCalledWith('b1', { uid: 'carol', perso: 'pc', nom: 'Corvin', joueur: 'Carol' });
  });

  it('relance : on attend les manquants ; dès que tous ont relancé, départage tout seul', async () => {
    const votes = { alice: vote('besoin', 80, 'Aëlys', 'pa', [55]), carol: vote('besoin', 80, 'Corvin', 'pc') };
    butins.elements = [butin('b1', { statut: 'relance', tour: 1, enLice: ['alice', 'carol'], votes })];
    render(ButinMj);
    expect(screen.getByText('Égalité (Besoin) entre Aëlys, Corvin : relance 1, on attend Corvin.')).toBeTruthy();
    expect(actions.avancerButin).not.toHaveBeenCalled();
    butins.elements = [butin('b1', { statut: 'relance', tour: 1, enLice: ['alice', 'carol'], votes: { ...votes, carol: vote('besoin', 80, 'Corvin', 'pc', [61]) } })];
    await waitFor(() => expect(actions.avancerButin).toHaveBeenCalledWith('b1'));
  });
});
