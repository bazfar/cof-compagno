import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — le repos (lot L7.1a, décisions de Thomas du
 * 29/10/2026) : au poste du MJ, le repos court ou long des présents, avec
 * le couchage (2a, 3a), leurs repos courts (5b) et les jets qui attendent
 * (4b) ; chez le joueur, le jet de PV qu'il lance lui-même.
 */

const actions = vi.hoisted(() => {
  class RefusRepos extends Error {}
  return {
    RefusRepos,
    prendreRepos: vi.fn(async (..._a: unknown[]) => ({ servis: ['Orel'], enAttente: [] as string[], auPlafond: [] as string[] })),
    lancerJetRepos: vi.fn(async (..._a: unknown[]) => ({ total: 7, pv: 30 })),
    retirerJetRepos: vi.fn(async (..._a: unknown[]) => {}),
  };
});
vi.mock('../../src/lib/actions/repos', () => actions);
vi.mock('../../src/lib/actions/journal', () => ({ messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCombat);
vi.mock('../../src/lib/magasins/seances.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSeances);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/repos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRepos);

const { table, seances, joueurs, persos, reposEnAttente, etatRepos, remousDoc, suiviRemous } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: ReposMj } = await import('../../src/composants/ReposMj.svelte');
const { default: ReposJoueur } = await import('../../src/composants/ReposJoueur.svelte');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-refonte.json', 'utf8')) as Record<string, Record<string, unknown>>;
const orel = { ...FICHES.Orel!, id: 'p-o', proprietaireUid: 'alice' };
const nysa = { ...FICHES.Nysa!, id: 'p-n', proprietaireUid: 'carol' };
const absent = { ...FICHES.Nysa!, nom: 'Absente', id: 'p-x', proprietaireUid: 'dan' };

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  table.donnees = { sceneActive: 'cave', seanceOuverte: { id: 's14', numero: 14 }, combat: null };
  seances.elements = [{ id: 's14', numero: 14, ouverteLe: 1, closeLe: null, presents: ['alice', 'carol', 'eve'] }];
  joueurs.elements = [
    { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p-o' },
    { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'p-n' },
    { id: 'dan', nom: 'Dan', rejointLe: 1, persoActif: 'p-x' },
    { id: 'eve', nom: 'Eve', rejointLe: 1 },
  ];
  persos.elements = [orel, nysa, absent];
  reposEnAttente.elements = [];
  etatRepos.donnees = null;
  remousDoc.donnees = null;
  suiviRemous.length = 0;
});

describe('le repos, au poste du MJ (2a, 3a, 4b, 5b)', () => {
  it('sans séance ouverte, rien', () => {
    table.donnees = { sceneActive: 'cave', seanceOuverte: null };
    render(ReposMj);
    expect(screen.queryByRole('region', { name: 'Repos' })).toBeNull();
  });

  it('les personnages joués des présents, leurs repos courts, le jet qui attend, que le MJ retire', async () => {
    etatRepos.donnees = { courts: { 'p-o': 2 }, majLe: 1 };
    reposEnAttente.elements = [{ id: 'p-n', nom: 'Nysa', quoi: 'long', formule: '5d6+2', creeLe: 1 }];
    render(ReposMj);
    const liste = within(screen.getByRole('list', { name: 'Personnages des présents' }));
    expect(liste.getAllByRole('listitem').map((l) => l.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Nysa 0/2 repos courts jet 5d6+2 à lancer Retirer', 'Orel 2/2 repos courts']);
    await fireEvent.click(liste.getByRole('button', { name: 'Retirer le jet de repos de Nysa' }));
    expect(actions.retirerJetRepos).toHaveBeenCalledWith('p-n');
  });

  it('« Repos court » : les fiches des présents, l’état, les jets qui attendent, la scène et sa jauge ; le message dit qui', async () => {
    etatRepos.donnees = { courts: { 'p-o': 1 }, majLe: 1 };
    reposEnAttente.elements = [{ id: 'p-n', nom: 'Nysa', quoi: 'court', formule: '1d4', creeLe: 1 }];
    remousDoc.donnees = { total: 20, membrane: 'epaisse', contributions: {} };
    actions.prendreRepos.mockResolvedValueOnce({ servis: ['Orel'], enAttente: ['Nysa'], auPlafond: [] });
    render(ReposMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Repos court' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Repos court : Orel. Écartés : Nysa.');
    const [quoi, fiches, etat, attentes, options] = actions.prendreRepos.mock.calls[0]! as [string, { id: string }[], unknown, Set<string>, Record<string, unknown>];
    expect([quoi, fiches.map((f) => f.id), etat, [...attentes]]).toEqual(['court', ['p-n', 'p-o'], { courts: { 'p-o': 1 }, majLe: 1 }, ['p-n']]);
    expect(options).toEqual({ couchage: 'camp', combatEnCours: false, scene: 'cave', remous: { total: 20, membrane: 'epaisse', contributions: {} } });
    expect(suiviRemous).toEqual(['cave']);
  });

  it('« Repos long » : le couchage choisi ; un combat en cours part avec ; le message de l’app sans écartés', async () => {
    table.donnees = { sceneActive: 'cave', seanceOuverte: { id: 's14', numero: 14 }, combat: 'c1' };
    render(ReposMj);
    await fireEvent.change(screen.getByLabelText('Couchage'), { target: { value: 'luxe' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Repos long' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Repos long : Orel.');
    expect(actions.prendreRepos.mock.calls[0]![0]).toBe('long');
    expect(actions.prendreRepos.mock.calls[0]![4]).toMatchObject({ couchage: 'luxe', combatEnCours: true });
    expect([...(screen.getByLabelText('Couchage') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Camp (hors ville)', 'Dortoir (+1d4)', 'Chambre privée (+1d6)', 'Luxe (+1d8)']);
  });

  it('un refus de l’app, ou une erreur, se lit ; aucun présent joué : les boutons s’éteignent', async () => {
    actions.prendreRepos.mockRejectedValueOnce(new actions.RefusRepos('Un combat est en cours : le repos attend sa fin.'));
    const v = render(ReposMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Repos court' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Un combat est en cours : le repos attend sa fin.');
    actions.prendreRepos.mockRejectedValueOnce(new Error('réseau'));
    await fireEvent.click(screen.getByRole('button', { name: 'Repos long' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Error: réseau'));
    actions.retirerJetRepos.mockRejectedValueOnce(new Error('refusé'));
    reposEnAttente.elements = [{ id: 'p-o', nom: 'Orel', quoi: 'court', formule: '1d4', creeLe: 1 }];
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer le jet de repos de Orel' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Error: refusé'));
    v.unmount();
    seances.elements = [{ id: 's14', numero: 14, ouverteLe: 1, closeLe: null, presents: ['eve'] }];
    render(ReposMj);
    expect(screen.getByText('Aucun personnage joué parmi les présents.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Repos court' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Repos long' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('le jet de repos du joueur (4b)', () => {
  beforeEach(() => {
    session.uid = 'alice';
  });

  it('rien quand rien n’attend pour ses personnages', () => {
    reposEnAttente.elements = [{ id: 'p-n', nom: 'Nysa', quoi: 'court', formule: '1d4', creeLe: 1 }];
    render(ReposJoueur);
    expect(screen.queryByRole('region', { name: 'Repos en attente' })).toBeNull();
  });

  it('le jet de son personnage, qu’il lance ; le message dit ses PV ; un refus se lit', async () => {
    reposEnAttente.elements = [
      { id: 'p-o', nom: 'Orel', quoi: 'long', formule: '6d10+1d8+2', creeLe: 1 },
      { id: 'p-n', nom: 'Nysa', quoi: 'court', formule: '1d4', creeLe: 1 },
    ];
    render(ReposJoueur);
    const r = within(screen.getByRole('region', { name: 'Repos en attente' }));
    expect(r.getAllByRole('button').map((b) => b.textContent)).toEqual(['Lancer le jet de repos long de Orel (6d10+1d8+2)']);
    await fireEvent.click(r.getByRole('button'));
    expect(actions.lancerJetRepos).toHaveBeenCalledWith('p-o');
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Orel récupère 7 PV : 30 PV.');
    reposEnAttente.elements = [];
    flushSync();
    // Le message reste, le bouton part.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Orel récupère 7 PV : 30 PV.');
    reposEnAttente.elements = [{ id: 'p-o', nom: 'Orel', quoi: 'court', formule: '1d4', creeLe: 1 }];
    flushSync();
    actions.lancerJetRepos.mockRejectedValueOnce(new actions.RefusRepos('Ce jet de repos a déjà été lancé.'));
    await fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ce jet de repos a déjà été lancé.'));
    actions.lancerJetRepos.mockRejectedValueOnce(new Error('réseau'));
    await fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Error: réseau'));
  });
});
