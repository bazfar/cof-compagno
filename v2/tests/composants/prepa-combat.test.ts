import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — prépa combat (lot L3.5) : composer une rencontre
 * (monstres du bestiaire, scène, butin prévu), les monstres placés d'avance
 * dans l'aperçu, la jauge d'équilibrage, puis lancer et envoyer le butin.
 */

const actions = vi.hoisted(() => {
  class RefusRencontre extends Error {}
  return {
    RefusRencontre,
    COULEUR_MONSTRE: '#c0392b',
    creerRencontre: vi.fn(async (_n: string) => 'r2'),
    enregistrerRencontre: vi.fn(async (_id: string, _a: unknown, _b: unknown) => {}),
    lancerRencontre: vi.fn(async (_id: string, _r: { monstres: unknown[] }) => _r.monstres.length),
    envoyerButin: vi.fn(async (_id: string, _r: unknown) => 2),
    supprimerRencontre: vi.fn(async (_id: string) => {}),
  };
});
vi.mock('../../src/lib/actions/rencontres', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/rencontres.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRencontres);
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/seances.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSeances);
vi.mock('../../src/composants/ApercuScene.svelte', async () => ({ default: (await import('./FauxApercuScene.svelte')).default }));

const { rencontres, bestiaire, equilibrageBestiaire, joueurs, persos, table, seances } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { equilibrage } = await import('../../src/lib/regles/donnees-bestiaire');
const { catalogueScenes } = await import('../../src/lib/battlemap/scenes');
const { default: PrepaCombat } = await import('../../src/composants/PrepaCombat.svelte');

const SCENE = catalogueScenes[0]!.id;
const rencontre = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  nom: 'Embuscade au pont',
  scene: null,
  monstres: [],
  butin: [],
  statut: 'preparee',
  creeLe: 1,
  majLe: 1,
  lanceeLe: null,
  butinEnvoyeLe: null,
  ...extra,
});

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  rencontres.elements = [rencontre()];
  bestiaire.elements = [
    { id: 'gobelin', nom: 'Gobelin', dangerosite: 1, role: 'soldat', boss: false, faction: 'x', famille: 'x', race: 'x' },
    { id: 'chef', nom: 'Chef gobelin', dangerosite: 3, role: 'soldat', boss: true, faction: 'x', famille: 'x', race: 'x' },
  ];
  equilibrageBestiaire.donnees = equilibrage as unknown as Record<string, unknown>;
  joueurs.elements = [
    { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'pa' },
    { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'pc' },
  ];
  persos.elements = [
    { id: 'pa', nom: 'Aëlys', proprietaireUid: 'alice', niveau: 2 },
    { id: 'pc', nom: 'Corvin', proprietaireUid: 'carol', niveau: 2 },
  ];
  table.donnees = { sceneActive: null, seanceOuverte: null };
  seances.elements = [];
});

const ouvrir = async () => {
  render(PrepaCombat);
  await fireEvent.click(screen.getByRole('button', { name: /Embuscade au pont/ }));
};

describe('prépa combat', () => {
  it('composer : scène, monstres placés d’avance, jauge, puis enregistrer', async () => {
    await ouvrir();
    await fireEvent.change(screen.getByLabelText('Scène'), { target: { value: SCENE } });
    await fireEvent.change(screen.getByLabelText('Monstre du bestiaire'), { target: { value: 'gobelin' } });
    await fireEvent.input(screen.getByLabelText('Nombre de monstres'), { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter les monstres' }));
    await fireEvent.change(screen.getByLabelText('Monstre du bestiaire'), { target: { value: 'chef' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter les monstres' }));
    // Placés tout seuls autour du centre de la scène (10 × 10).
    await waitFor(() => expect(screen.getAllByTestId('jeton-apercu')).toHaveLength(3));
    const liste = within(screen.getByRole('list', { name: 'Monstres de la rencontre' }));
    expect(liste.getByDisplayValue('Gobelin 2')).toBeTruthy();
    expect(liste.queryByText('non placé')).toBeNull();
    // Jauge : (10 + 10 + 40) × 1,3 (boss) = 78 Pm pour 2 PJ de niveau 2 (budget 20).
    expect(screen.getByText(/78 Pm pour un budget de 20 Pm \(2 PJ de niveau moyen 2, personnages joués\)/)).toBeTruthy();
    expect(screen.getByText('Très dangereuse')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'déplacer' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(actions.enregistrerRencontre).toHaveBeenCalledTimes(1);
    const b = actions.enregistrerRencontre.mock.calls[0]![2] as { scene: string; monstres: { nom: string; cx: number; cy: number }[] };
    expect(b.scene).toBe(SCENE);
    expect(b.monstres.map((m) => m.nom)).toEqual(['Gobelin', 'Gobelin 2', 'Chef gobelin']);
    expect(b.monstres[0]).toMatchObject({ cx: 0, cy: 0 });
  });

  it('la jauge suit les présents de la séance ouverte', async () => {
    table.donnees = { sceneActive: null, seanceOuverte: { id: 's0014', numero: 14 } };
    seances.elements = [{ id: 's0014', numero: 14, ouverteLe: 1, closeLe: null, presents: ['alice'] }];
    rencontres.elements = [rencontre({ monstres: [{ cle: 'gobelin-1', monstre: 'gobelin', nom: 'Gobelin', cx: 1, cy: 1 }] })];
    await ouvrir();
    expect(screen.getByText(/10 Pm pour un budget de 10 Pm \(1 PJ de niveau moyen 2, présents de la séance\)/)).toBeTruthy();
    expect(screen.getByText('Sérieuse')).toBeTruthy();
  });

  it('lancer : refusé sans scène ; sinon confirmation, puis la rencontre part avec ses monstres placés', async () => {
    const placee = { cle: 'gobelin-1', monstre: 'gobelin', nom: 'Gobelin', cx: 4, cy: 4 };
    rencontres.elements = [rencontre({ monstres: [placee] })];
    await ouvrir();
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer la rencontre' }));
    expect(screen.getByRole('status').textContent).toBe('Choisis une scène.');
    rencontres.elements = [rencontre({ scene: SCENE, monstres: [placee], butin: [{ objet: 'potion_soin', combien: 2 }] })];
    await waitFor(() => expect(screen.getAllByTestId('jeton-apercu')).toHaveLength(1));
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer la rencontre' }));
    await waitFor(() => expect(actions.lancerRencontre).toHaveBeenCalledWith('r1', expect.objectContaining({ scene: SCENE, monstres: [placee] })));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Rencontre lancée : 1 monstre\(s\)/));
    await fireEvent.click(screen.getByRole('button', { name: 'Envoyer le butin au vote' }));
    await waitFor(() => expect(actions.envoyerButin).toHaveBeenCalledWith('r1', expect.objectContaining({ butin: [{ objet: 'potion_soin', combien: 2 }] })));
    confirmer.mockRestore();
  });

  it('une modification en cours n’est pas écrasée par la base', async () => {
    await ouvrir();
    await fireEvent.input(screen.getByLabelText('Nom de la rencontre'), { target: { value: 'Embuscade au gué' } });
    rencontres.elements = [rencontre({ nom: 'Autre nom', majLe: 2 })];
    await waitFor(() => expect((screen.getByLabelText('Nom de la rencontre') as HTMLInputElement).value).toBe('Embuscade au gué'));
    expect(screen.getByText('modifiée')).toBeTruthy();
  });
});
