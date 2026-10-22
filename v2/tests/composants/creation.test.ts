import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
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
 *
 * L4.11b (décision 10a) : le Guerrier, le Magicien, l'Enchanteur, le
 * Prêtre et le Barde créent désormais une fiche de la refonte ; depuis
 * L4.17, les dix classes le font, Nécromancien compris : l'assistant ne
 * passe plus par le parcours v1 (voies v1), qui n'a plus de classe à
 * servir. Le Nécromancien sert ici d'exemple de lanceur de la refonte.
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
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');

const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom });
const etape = (nom: string) => fireEvent.click(bouton(new RegExp(`^${nom}`)));

/** Nécromancien nain niveau 1 de la refonte (L4.17) : école, sang, deux sorts mineurs, deux rangs. */
async function remplirNecromancienNain(nom = 'Borin') {
  await fireEvent.input(screen.getByLabelText('Nom'), { target: { value: nom } });
  await fireEvent.click(bouton('Nain'));
  await fireEvent.click(bouton('Nécromancien'));
  await etape('Caractéristiques');
  for (const c of ['FOR', 'FOR', 'FOR', 'CON', 'CON', 'CON']) await fireEvent.click(bouton(`Ajouter un point en ${c}`));
  await etape('Voies');
  await fireEvent.click(bouton('Outre-tombe'));
  await fireEvent.click(bouton('Sang'));
  await fireEvent.click(screen.getByLabelText('Trait nécrotique'));
  await fireEvent.click(screen.getByLabelText('Frisson'));
  await fireEvent.click(bouton('Prendre necromancien.ecole rang 1'));
  await fireEvent.click(bouton('Prendre necromancien.sang rang 1'));
}

/** Guerrier nain niveau 1 de la refonte : identité, caractéristiques, deux rangs de Soldat. */
async function remplirGuerrierRefonte(nom = 'Torg') {
  await fireEvent.input(screen.getByLabelText('Nom'), { target: { value: nom } });
  await fireEvent.click(bouton('Nain'));
  await fireEvent.click(bouton('Guerrier'));
  await etape('Caractéristiques');
  for (const c of ['FOR', 'FOR', 'FOR', 'CON', 'CON', 'CON']) await fireEvent.click(bouton(`Ajouter un point en ${c}`));
  await etape('Voies');
  await fireEvent.click(bouton('Prendre guerrier.soldat rang 1'));
  await fireEvent.click(bouton('Prendre guerrier.soldat rang 2'));
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
  it('un nécromancien nain créé de bout en bout : fiche complète écrite, brouillon effacé', async () => {
    const surCree = vi.fn();
    render(AssistantCreation, { props: { surCree, surAnnuler: () => {} } });
    await remplirNecromancienNain();
    expect(screen.getByTestId('points-refonte').textContent).toBe('0');

    await etape('Récapitulatif');
    expect(screen.queryByLabelText('À compléter')).toBeNull();
    await fireEvent.click(bouton('Créer le personnage'));

    await waitFor(() => expect(surCree).toHaveBeenCalledWith('p-nouveau'));
    const [id, fiche] = actions.creerPerso.mock.calls[0]!;
    expect(id).toBe('p-nouveau');
    expect(fiche).toMatchObject({
      schemaVersion: 2, nom: 'Borin', proprietaireUid: 'alice', classe: 'necromancien', race: 'nain', niveau: 1, capacitesRace: [1],
      caracs: { FOR: 13, CON: 13 },
      refonte: {
        classe: 'necromancien', ecole: 'outre-tombe', elementDepart: 'sang', mineurs: ['mineur.trait-necrotique', 'mineur.frisson'],
        rangs: { 'necromancien.ecole': 1, 'necromancien.sang': 1 }, jauges: { ames: 0, plongee: 0, corruptionAme: 0 },
      },
    });
    // Bug v1 corrigé : l'assistant repart d'un brouillon vide.
    expect(localStorage.getItem('cof2:creation:t1:alice')).not.toContain('Borin');
    await etape('Identité');
    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('');
  });

  it('un geste refusé par les règles affiche la raison, sans rien changer', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await remplirNecromancienNain();
    await fireEvent.click(bouton('Prendre necromancien.ames rang 1'));
    expect(screen.getByRole('alert').textContent).toBe('Pas assez de points de voie.');
    expect(screen.getByTestId('points-refonte').textContent).toBe('0');
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
    await remplirNecromancienNain('Gimra');
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
    await remplirNecromancienNain();
    await etape('Identité');
    await fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: '3' } });
    await etape('PV et dons');
    await fireEvent.click(bouton('Lancer les PV du niveau 2'));
    await fireEvent.click(bouton('Lancer les PV du niveau 3'));
    expect(screen.queryByRole('button', { name: /Lancer les PV/ })).toBeNull();
    expect(screen.getAllByText(/^Niveau [23] :/)).toHaveLength(2);
  });
});

describe('assistant de création : classes de la refonte (L4.11b, 10a)', () => {
  it('un guerrier de la refonte : étape Voies de la refonte, pas d’étape Magie, fiche v2 écrite', async () => {
    const surCree = vi.fn();
    render(AssistantCreation, { props: { surCree, surAnnuler: () => {} } });
    await remplirGuerrierRefonte();
    expect(screen.getByTestId('points-refonte').textContent).toBe('0');
    expect(screen.queryByRole('button', { name: /^Magie/ })).toBeNull();
    // La Voie du chaos n'est pas proposée à la création (12a).
    expect(screen.queryByText(/chaos — ouverte par le MJ/)).toBeNull();
    await etape('Récapitulatif');
    expect(screen.queryByLabelText('À compléter')).toBeNull();
    await fireEvent.click(bouton('Créer le personnage'));
    await waitFor(() => expect(surCree).toHaveBeenCalledWith('p-nouveau'));
    const fiche = actions.creerPerso.mock.calls[0]![1] as Record<string, unknown>;
    expect(fiche).toMatchObject({
      schemaVersion: 2, nom: 'Torg', classe: 'guerrier', race: 'nain', niveau: 1,
      refonte: { classe: 'guerrier', rangs: { 'guerrier.soldat': 2 }, jauges: { endurance: 3, plongee: 0, corruptionAme: 0 } },
      octrois: { chaos: false, elements: {}, verbes: [], reconversion: false },
    });
    expect('capacites' in fiche).toBe(false);
  });

  it('un geste refusé par la refonte s’affiche ; retirer un rang le rend', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await remplirGuerrierRefonte();
    await fireEvent.click(bouton('Prendre guerrier.peuple rang 1'));
    expect(screen.getByRole('alert').textContent).toBe('Pas assez de points de voie.');
    await fireEvent.click(bouton('Retirer guerrier.soldat rang 2'));
    expect(screen.getByTestId('points-refonte').textContent).toBe('1');
  });

  it('magicien : école, élément et sorts mineurs à choisir ; la liste dit ce qui manque', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await fireEvent.click(bouton('Magicien'));
    await etape('Voies');
    const manque = within(screen.getByLabelText('Voies à compléter'));
    expect(manque.getByText(/^Choisis une école/)).toBeTruthy();
    await fireEvent.click(bouton('Évocation'));
    await fireEvent.click(bouton('Feu'));
    await fireEvent.click(screen.getByLabelText('Lumière'));
    await fireEvent.click(screen.getByLabelText('Main du mage'));
    await fireEvent.click(screen.getByLabelText('Trait arcanique'));
    expect(screen.getByRole('alert').textContent).toBe('2 sorts mineurs au plus à ce niveau.');
    expect(screen.getByText('Sorts mineurs (2 / 2)')).toBeTruthy();
    expect(screen.queryByLabelText('Voies à compléter')).toBeNull();
  });

  it('Polyvalence : « Offert » seulement pour un Humain niveau 5, une fois, hors budget', async () => {
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await fireEvent.click(bouton('Humain'));
    await fireEvent.click(bouton('Guerrier'));
    await etape('Voies');
    expect(screen.queryByRole('button', { name: 'Offrir guerrier.soldat rang 1' })).toBeNull();
    await etape('Identité');
    await fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: '5' } });
    await etape('Voies');
    await fireEvent.click(bouton('Offrir guerrier.soldat rang 1'));
    expect(screen.getByTestId('points-refonte').textContent).toBe('10');
    expect(screen.getByText('offert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Offrir / })).toBeNull();
  });

  it('le bloc de la refonte survit au rechargement, avec le reste du brouillon', async () => {
    const premier = render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await remplirGuerrierRefonte('Gimra');
    premier.unmount();
    render(AssistantCreation, { props: { surCree: () => {}, surAnnuler: () => {} } });
    await etape('Voies');
    expect(screen.getByTestId('points-refonte').textContent).toBe('0');
  });
});

describe('mes personnages', () => {
  const KARGASH = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches.find((f: { nom: string }) => f.nom.startsWith('Kargash'));
  const fiche = (id: string, proprietaireUid: string, nom: string, creeLe: number) => ({
    ...ficheDepuisV1(KARGASH, proprietaireUid, creeLe).fiche, id, nom,
  });

  it('seulement les personnages du joueur ; « Jouer ce personnage » change le personnage joué', async () => {
    persos.elements = [fiche('p1', 'alice', 'Kargash', 1), fiche('p2', 'carol', 'Autre', 2), fiche('p3', 'alice', 'Second', 3)];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' }];
    render(MesPersonnages);
    const items = within(screen.getByRole('region', { name: 'Mes personnages' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('strong')?.textContent)).toEqual(['Kargash', 'Second']);
    expect(within(items[0]!).getByText('joué')).toBeTruthy();
    await fireEvent.click(within(items[1]!).getByRole('button', { name: 'Jouer ce personnage' }));
    expect(actions.choisirPersoActif).toHaveBeenCalledWith('p3');
  });

  it('le premier personnage créé devient le personnage joué', async () => {
    render(MesPersonnages);
    expect(screen.getByText("Tu n'as pas encore de personnage à cette table.")).toBeTruthy();
    await fireEvent.click(bouton('Créer un personnage'));
    await remplirNecromancienNain();
    await etape('Récapitulatif');
    await fireEvent.click(bouton('Créer le personnage'));
    await waitFor(() => expect(actions.choisirPersoActif).toHaveBeenCalledWith('p-nouveau'));
    flushSync();
    expect(screen.getByRole('button', { name: 'Créer un personnage' })).toBeTruthy();
  });
});
