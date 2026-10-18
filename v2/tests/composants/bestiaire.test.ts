import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { versDocument } from '../../src/lib/bestiaire/bestiaire';
import { armesMonstres, armuresMonstres, equilibrage, monstres } from '../../src/lib/regles/donnees-bestiaire';

/*
 * TESTS DE COMPOSANTS — bestiaire du MJ (lot L3.2) : consultation,
 * surcharge (les champs non modifiables ici, comme ceux des démons, sont
 * gardés), duplication en créature du MJ, import du fichier.
 */

const actions = vi.hoisted(() => ({
  enregistrerMonstre: vi.fn(async (_m: unknown, _o: string) => {}),
  supprimerMonstre: vi.fn(async (_id: string) => {}),
  importerBestiaire: vi.fn(async (_e: unknown, _p: unknown) => ({ importes: 1, gardes: 1 })),
}));
vi.mock('../../src/lib/actions/bestiaire', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);

const f = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: BestiaireMj } = await import('../../src/composants/BestiaireMj.svelte');
const { default: ImportBestiaireV1 } = await import('../../src/composants/ImportBestiaireV1.svelte');

const enBase = (id: string) => ({ id, ...versDocument(monstres.find((m) => m.id === id)!, 'v1', 1) });
const demon = monstres.find((m) => m.faim !== undefined)!;

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((a) => a.mockClear());
  f.bestiaire.elements = [enBase('goblin_eclaireur'), { id: demon.id, ...versDocument(demon, 'v1', 1) }];
  f.armesBestiaire.donnees = { liste: armesMonstres };
  f.armuresBestiaire.donnees = { liste: armuresMonstres };
  f.equilibrageBestiaire.donnees = equilibrage;
});

describe('bestiaire du MJ', () => {
  it('recherche, puis fiche : statistiques, attaques avec leur arme', async () => {
    render(BestiaireMj);
    await fireEvent.input(screen.getByLabelText('Chercher une créature'), { target: { value: 'eclaireur' } });
    expect(screen.queryByRole('button', { name: new RegExp(demon.nom) })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /Gobelin éclaireur/ }));
    const fiche = within(screen.getByRole('region', { name: 'Fiche de créature' }));
    expect(fiche.getByText(/^Dague rouillée \+2 · /)).toBeTruthy();
    expect(fiche.getByText('bestiaire v1')).toBeTruthy();
  });

  it('surcharge : les PV changent, les champs des démons sont gardés, l’origine reste v1', async () => {
    render(BestiaireMj);
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(demon.nom.replace(/[()]/g, '.')) }));
    await fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    await fireEvent.input(screen.getByLabelText('PV'), { target: { value: String(demon.pv + 7) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(actions.enregistrerMonstre).toHaveBeenCalledTimes(1);
    const [m, origine] = actions.enregistrerMonstre.mock.calls[0]! as [typeof demon, string];
    expect(origine).toBe('v1');
    expect(m.pv).toBe(demon.pv + 7);
    expect(m.faim).toEqual(demon.faim);
    expect(m.attaques).toEqual(demon.attaques);
    expect({ ...m, pv: demon.pv }).toEqual(demon);
  });

  it('dupliquer : une créature du MJ, avec un nouvel identifiant', async () => {
    render(BestiaireMj);
    await fireEvent.click(screen.getByRole('button', { name: /Gobelin éclaireur/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const [m, origine] = actions.enregistrerMonstre.mock.calls[0]! as [{ id: string; nom: string }, string];
    expect(origine).toBe('mj');
    expect(m.id).toBe('mj_gobelin_eclaireur_copie');
    expect(m.nom).toBe('Gobelin éclaireur (copie)');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('« Gobelin éclaireur (copie) » ajouté au bestiaire.'));
  });

  it('nouvelle créature sans nom : refusée, rien n’est écrit', async () => {
    render(BestiaireMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Nouvelle créature' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toMatch(/^Créature non enregistrée : nom/);
    expect(actions.enregistrerMonstre).not.toHaveBeenCalled();
  });

  it('supprimer demande confirmation, et rappelle que la réimport rétablit un monstre v1', async () => {
    render(BestiaireMj);
    await fireEvent.click(screen.getByRole('button', { name: /Gobelin éclaireur/ }));
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(confirmer.mock.calls[0]![0]).toContain('Réimporter le fichier du bestiaire le rétablira');
    expect(actions.supprimerMonstre).toHaveBeenCalledWith('goblin_eclaireur');
    confirmer.mockRestore();
  });
});

describe('import du bestiaire', () => {
  it('résume le fichier et garde les monstres déjà en base', async () => {
    render(ImportBestiaireV1);
    const exportB = { format: 'cof-compagno/bestiaire-v1', exporteLe: 1, monstres: monstres.slice(0, 3), armes: armesMonstres, armures: armuresMonstres, equilibrage };
    f.bestiaire.elements = [enBase(monstres[0]!.id)];
    const champ = screen.getByLabelText(/Choisir bestiaire-v1.json/) as HTMLInputElement;
    Object.defineProperty(champ, 'files', { value: [new File([JSON.stringify(exportB)], 'bestiaire-v1.json')], configurable: true });
    await fireEvent.change(champ);
    await waitFor(() => expect(screen.getByTestId('resume-bestiaire').textContent).toMatch(/^3 monstres dans le fichier : 2 à importer, 1 déjà en base, gardés\./));
    await fireEvent.click(screen.getByRole('button', { name: 'Importer 2 monstres' }));
    const [, presents] = actions.importerBestiaire.mock.calls[0]! as [unknown, Set<string>];
    expect([...presents]).toEqual([monstres[0]!.id]);
  });
});
