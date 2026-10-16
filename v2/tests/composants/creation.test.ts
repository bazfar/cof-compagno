import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — assistant de création et liste des personnages
 * (lot L2.2b), montés dans un DOM simulé (jsdom).
 *
 * Les règles sont testées à part (tests/unitaires/creation.test.ts) ; ici,
 * on vérifie l'écran : chaque geste passe bien par les règles, un refus
 * s'affiche, « Créer » écrit une fiche complète, et le brouillon est effacé
 * après la création (bug v1 : « + Nouveau personnage » rouvrait le
 * précédent et l'écrasait). Firestore est remplacé par de faux magasins et
 * des actions espionnées.
 */

const actions = vi.hoisted(() => ({
  creerPerso: vi.fn(async (_id: string, _fiche: unknown) => {}),
  choisirPersoActif: vi.fn(async (_id: string) => {}),
}));
vi.mock('../../src/lib/actions/persos', () => ({
  ...actions,
  nouvelIdPerso: () => 'p-nouveau',
  messageErreurPerso: (e: unknown) => String(e),
}));
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/imports.svelte', async () => (await import('./faux-magasins.svelte')).magasinsImports);
const actionsImports = vi.hoisted(() => ({
  deposerImportV1: vi.fn(async (_id: string, _d: unknown) => {}),
  marquerImportRepris: vi.fn(async (_id: string, _perso: string) => {}),
  supprimerImportV1: vi.fn(async (_id: string) => {}),
}));
vi.mock('../../src/lib/actions/imports', () => ({ ...actionsImports, nouvelIdImport: () => 'v1-nouveau' }));
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { imports, joueurs, persos } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: AssistantCreation } = await import('../../src/composants/AssistantCreation.svelte');
const { default: MesPersonnages } = await import('../../src/composants/MesPersonnages.svelte');

const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom });
const etape = (nom: string) => fireEvent.click(bouton(new RegExp(`^${nom}`)));

/** Guerrier nain niveau 1, rempli à la main comme le ferait un joueur. */
async function remplirGuerrierNain(nom = 'Borin') {
  await fireEvent.input(screen.getByLabelText('Nom'), { target: { value: nom } });
  await fireEvent.click(bouton('Nain'));
  await fireEvent.click(bouton('Guerrier'));
  await etape('Caractéristiques');
  for (const c of ['FOR', 'FOR', 'FOR', 'CON', 'CON', 'CON']) await fireEvent.click(bouton(`Ajouter un point en ${c}`));
  await etape('Voies');
  await fireEvent.click(bouton('Prendre guerrier.soldat.1'));
  await fireEvent.change(screen.getByLabelText('Choix pour guerrier.elite.1'), { target: { value: 'FOR' } });
  await fireEvent.click(bouton('Prendre guerrier.elite.1'));
}

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  localStorage.clear();
  actions.creerPerso.mockClear();
  actions.choisirPersoActif.mockClear();
  joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1 }];
  persos.elements = [];
  imports.elements = [];
  actionsImports.deposerImportV1.mockClear();
  actionsImports.marquerImportRepris.mockClear();
});

describe('assistant de création', () => {
  it('un guerrier nain créé de bout en bout : fiche complète écrite, brouillon effacé', async () => {
    const surCree = vi.fn();
    render(AssistantCreation, { props: { surCree, surAnnuler: () => {} } });
    await remplirGuerrierNain();
    expect(screen.getByTestId('points-voie').textContent).toBe('0');

    await etape('Récapitulatif');
    expect(screen.queryByLabelText('À compléter')).toBeNull();
    await fireEvent.click(bouton('Créer le personnage'));

    await waitFor(() => expect(surCree).toHaveBeenCalledWith('p-nouveau'));
    const [id, fiche] = actions.creerPerso.mock.calls[0]!;
    expect(id).toBe('p-nouveau');
    expect(fiche).toMatchObject({
      nom: 'Borin', proprietaireUid: 'alice', classe: 'guerrier', race: 'nain', niveau: 1, capacitesRace: [1],
      capacites: [{ id: 'guerrier.soldat.1' }, { id: 'guerrier.elite.1', choix: 'FOR' }],
      caracs: { FOR: 15, CON: 14 }, pvMax: 16, pvActuel: 16,
    });
    // Bug v1 corrigé : l'assistant repart d'un brouillon vide.
    expect(localStorage.getItem('cof2:creation:t1:alice')).not.toContain('Borin');
    await etape('Identité');
    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('');
  });

  it('un geste refusé par les règles affiche la raison, sans rien changer', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await remplirGuerrierNain();
    await fireEvent.click(bouton('Prendre guerrier.peuple.1'));
    expect(screen.getByRole('alert').textContent).toBe('Pas assez de points de capacité.');
    expect(screen.getByTestId('points-voie').textContent).toBe('0');
  });

  it('« Créer » reste grisé tant que le brouillon est incomplet, et la liste dit pourquoi', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await fireEvent.click(bouton('Guerrier'));
    await etape('Récapitulatif');
    expect((bouton('Créer le personnage') as HTMLButtonElement).disabled).toBe(true);
    const liste = within(screen.getByLabelText('À compléter'));
    expect(liste.getByText('Choisis une race.')).toBeTruthy();
    expect(liste.getByText('Donne un nom au personnage.')).toBeTruthy();
  });

  it('le brouillon survit à un rechargement ; « Recommencer » le vide', async () => {
    const premier = render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await remplirGuerrierNain('Gimra');
    premier.unmount();

    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('Gimra');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await fireEvent.click(bouton('Recommencer'));
    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('');
  });

  it('un brouillon gardé illisible ou d’une forme ancienne est ignoré, sans erreur', async () => {
    localStorage.setItem('cof2:creation:t1:alice', '{"nom": 42}');
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('niveau 3 : les PV des niveaux suivants se lancent un par un, la création les exige', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await remplirGuerrierNain();
    await etape('Identité');
    await fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: '3' } });
    await etape('PV et dons');
    await fireEvent.click(bouton('Lancer les PV du niveau 2'));
    await fireEvent.click(bouton('Lancer les PV du niveau 3'));
    expect(screen.queryByRole('button', { name: /Lancer les PV/ })).toBeNull();
    expect(screen.getAllByText(/^Niveau [23] :/)).toHaveLength(2);
  });

  it('Polyvalence : le bouton « Offert » n’apparaît que pour un Humain niveau 5', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await fireEvent.click(bouton('Humain'));
    await fireEvent.click(bouton('Guerrier'));
    await etape('Voies');
    expect(screen.queryByRole('button', { name: 'Prendre guerrier.soldat.1 offert' })).toBeNull();
    await etape('Identité');
    await fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: '5' } });
    await etape('Voies');
    await fireEvent.click(bouton('Prendre guerrier.soldat.1 offert'));
    expect(screen.getByTestId('points-voie').textContent).toBe('10');
    expect(screen.queryByRole('button', { name: /offert$/ })).toBeNull();
  });
});

describe('mes personnages', () => {
  const fiche = (id: string, proprietaireUid: string, nom: string, creeLe: number) => ({
    id, proprietaireUid, nom, creeLe, niveau: 3, classe: 'barde', race: 'nain',
  });

  it('seulement les personnages du joueur ; « Jouer ce personnage » change le personnage joué', async () => {
    persos.elements = [fiche('p1', 'alice', 'Kargash', 1), fiche('p2', 'carol', 'Autre', 2), fiche('p3', 'alice', 'Second', 3)];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' }];
    render(MesPersonnages);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('strong')?.textContent)).toEqual(['Kargash', 'Second']);
    expect(within(items[0]!).getByText('joué')).toBeTruthy();
    await fireEvent.click(within(items[1]!).getByRole('button', { name: 'Jouer ce personnage' }));
    expect(actions.choisirPersoActif).toHaveBeenCalledWith('p3');
  });

  it('le premier personnage créé devient le personnage joué', async () => {
    render(MesPersonnages);
    expect(screen.getByText("Tu n'as pas encore de personnage à cette table.")).toBeTruthy();
    await fireEvent.click(bouton('Créer un personnage'));
    await remplirGuerrierNain();
    await etape('Récapitulatif');
    await fireEvent.click(bouton('Créer le personnage'));
    await waitFor(() => expect(actions.choisirPersoActif).toHaveBeenCalledWith('p-nouveau'));
    flushSync();
    expect(screen.getByRole('button', { name: 'Créer un personnage' })).toBeTruthy();
  });
});
