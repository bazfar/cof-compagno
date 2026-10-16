import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — reprise des fiches v1 (lot L2.2c) : le MJ dépose et
 * attribue une fiche, le joueur la reprend dans l'assistant. Firestore est
 * remplacé par de faux magasins et des actions espionnées.
 */

const actions = vi.hoisted(() => ({
  creerPerso: vi.fn(async (_id: string, _fiche: unknown) => {}),
  choisirPersoActif: vi.fn(async (_id: string) => {}),
  enregistrerPortrait: vi.fn(async (_id: string, _image: string) => {}),
  deposerImportV1: vi.fn(async (_id: string, _d: unknown) => {}),
  marquerImportRepris: vi.fn(async (_id: string, _perso: string) => {}),
  supprimerImportV1: vi.fn(async (_id: string) => {}),
}));
vi.mock('../../src/lib/actions/persos', () => ({
  creerPerso: actions.creerPerso,
  choisirPersoActif: actions.choisirPersoActif,
  enregistrerPortrait: actions.enregistrerPortrait,
  nouvelIdPerso: () => 'p-nouveau',
  messageErreurPerso: (e: unknown) => String(e),
}));
vi.mock('../../src/lib/actions/imports', () => ({
  deposerImportV1: actions.deposerImportV1,
  marquerImportRepris: actions.marquerImportRepris,
  supprimerImportV1: actions.supprimerImportV1,
  nouvelIdImport: () => 'v1-nouveau',
}));
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/imports.svelte', async () => (await import('./faux-magasins.svelte')).magasinsImports);

const { imports, joueurs, persos } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: MesPersonnages } = await import('../../src/composants/MesPersonnages.svelte');
const { default: ImportFichesV1 } = await import('../../src/composants/ImportFichesV1.svelte');

const FIXTURE = readFileSync('tests/fixtures/fiches-v1.json', 'utf8');
const KARGASH = JSON.parse(FIXTURE).fiches.find((f: { nom: string }) => f.nom.startsWith('Kargash'));
const PORTRAIT = 'data:image/jpeg;base64,AAAA';
const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom });

beforeEach(() => {
  session.table = 't1';
  localStorage.clear();
  Object.values(actions).forEach((f) => f.mockClear());
  joueurs.elements = [
    { id: 'alice', nom: 'Alice', rejointLe: 1 },
    { id: 'carol', nom: 'Carol', rejointLe: 1 },
  ];
  persos.elements = [];
  imports.elements = [];
});

describe('MJ : dépôt des fiches v1', () => {
  beforeEach(() => {
    session.uid = 'bob';
  });

  it('un export lu, attribué à une joueuse, déposé tel quel', async () => {
    render(ImportFichesV1);
    const fichier = new File([JSON.stringify(KARGASH)], 'cof-kargash.json', { type: 'application/json' });
    await fireEvent.change(screen.getByLabelText('Fichiers'), { target: { files: [fichier] } });
    const ligne = await screen.findByText(KARGASH.nom);
    expect((bouton('Déposer') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.change(screen.getByLabelText(`Joueur pour ${KARGASH.nom}`), { target: { value: 'alice' } });
    await fireEvent.click(bouton('Déposer'));
    await waitFor(() => expect(actions.deposerImportV1).toHaveBeenCalled());
    const [id, donnees] = actions.deposerImportV1.mock.calls[0]!;
    expect(id).toBe('v1-nouveau');
    expect(donnees).toMatchObject({ proprietaireUid: 'alice', nom: KARGASH.nom });
    expect(JSON.parse((donnees as { v1Json: string }).v1Json)).toEqual(KARGASH);
    expect(ligne.isConnected).toBe(false);
  });

  it('un fichier que la 2.0 ne peut pas reprendre est refusé, en le nommant', async () => {
    render(ImportFichesV1);
    const mauvais = new File([JSON.stringify({ ...KARGASH, classe: 'paladin' })], 'cof-x.json');
    await fireEvent.change(screen.getByLabelText('Fichiers'), { target: { files: [mauvais] } });
    const refus = await screen.findByLabelText('Fichiers refusés');
    expect(refus.textContent).toContain('cof-x.json');
    expect(refus.textContent).toContain('classe inconnue');
  });
});

describe('joueur : reprise d’une fiche v1', () => {
  beforeEach(() => {
    session.uid = 'alice';
    session.nom = 'Alice';
    // Portrait v1 (L2.3) : repris dans son propre document à la création.
    imports.elements = [{ id: 'i1', proprietaireUid: 'alice', nom: KARGASH.nom, importeLe: 1, v1Json: JSON.stringify({ ...KARGASH, portrait: PORTRAIT }) }];
  });

  it('Reprendre → anciens choix repris par les règles → fiche créée avec les valeurs v1, fiche marquée reprise', async () => {
    render(MesPersonnages);
    const liste = screen.getByLabelText('Fiches de la v1 à reprendre');
    await fireEvent.click(within(liste).getByRole('button', { name: 'Reprendre' }));

    expect(screen.getByRole('heading', { name: `Reprise de « ${KARGASH.nom} » (v1)` })).toBeTruthy();
    expect(screen.getByLabelText('Anciens choix (v1)').textContent).toContain('rang 1');
    // Race verrouillée : un refus, rien ne change.
    await fireEvent.click(bouton('Elfe'));
    expect(screen.getByRole('alert').textContent).toContain('Fiche reprise de la v1');

    await fireEvent.click(bouton(/^Voies/));
    await fireEvent.click(bouton('Reprendre mes anciens choix'));
    expect(screen.getByRole('status').textContent).toBe('Tous tes anciens choix ont été repris.');
    expect(screen.getByTestId('points-voie').textContent).toBe('0');

    await fireEvent.click(bouton(/^Récapitulatif/));
    await fireEvent.click(bouton('Créer le personnage'));
    await waitFor(() => expect(actions.marquerImportRepris).toHaveBeenCalledWith('i1', 'p-nouveau'));
    expect(actions.enregistrerPortrait).toHaveBeenCalledWith('p-nouveau', PORTRAIT);
    const fiche = actions.creerPerso.mock.calls[0]![1] as Record<string, unknown>;
    expect(fiche).toMatchObject({
      nom: KARGASH.nom, classe: 'barde', race: 'nain', niveau: 3, piecesOr: KARGASH.piecesOr,
      corruptionMajeure: KARGASH.corruptionMajeure, capacitesRace: [1, 2],
    });
  });

  it('une fiche déjà reprise n’est plus proposée', () => {
    imports.elements = [{ ...imports.elements[0]!, reprisPar: 'p-1' }];
    render(MesPersonnages);
    expect(screen.queryByLabelText('Fiches de la v1 à reprendre')).toBeNull();
  });

  it('reprendre ne touche pas à une création en cours (brouillons séparés)', async () => {
    localStorage.setItem('cof2:creation:t1:alice', JSON.stringify({ marque: 'création en cours' }));
    render(MesPersonnages);
    await fireEvent.click(within(screen.getByLabelText('Fiches de la v1 à reprendre')).getByRole('button', { name: 'Reprendre' }));
    await waitFor(() => expect(localStorage.getItem('cof2:creation:t1:alice:i1')).toContain(KARGASH.nom));
    expect(localStorage.getItem('cof2:creation:t1:alice')).toBe(JSON.stringify({ marque: 'création en cours' }));
  });
});
