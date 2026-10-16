import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — fiche vivante et vue du groupe (lot L2.3).
 *
 * Bug v1 visé : la fiche entière était redessinée à chaque événement, ce
 * qui effaçait la saisie en cours (PV, notes, bourse). Ici, la fiche change
 * dans « Firestore » pendant qu'on tape : ce qu'on tape reste, et n'est
 * écrit qu'à la validation.
 */

const actions = vi.hoisted(() => ({
  modifierPV: vi.fn(async (_id: string, _pv: number, _max: number) => {}),
  modifierPP: vi.fn(async (_id: string, _pp: number, _max: number) => {}),
  modifierPieces: vi.fn(async (_id: string, _p: unknown) => {}),
  modifierNotes: vi.fn(async (_id: string, _n: string) => {}),
  enregistrerPortrait: vi.fn(async (_id: string, _i: string) => {}),
  retirerPortrait: vi.fn(async (_id: string) => {}),
  appliquerChangement: vi.fn(async (_id: string, _ch: unknown) => {}),
}));
vi.mock('../../src/lib/actions/persos', () => ({ ...actions, messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { joueurs, persos, portraits } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { default: FicheVivante } = await import('../../src/composants/FicheVivante.svelte');
const { default: GroupeMj } = await import('../../src/composants/GroupeMj.svelte');
const E = await import('../../src/lib/regles/equipement');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string, uid = 'alice') => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => f.mockClear());
  for (const k of Object.keys(portraits)) delete portraits[k];
  persos.elements = [];
  joueurs.elements = [];
});

describe('fiche vivante', () => {
  it('Kylhian : PV, PP et CA calculés ; + et − écrivent seulement les PV', async () => {
    const kylhian = reelle('Kylhian', 'p-k');
    const vue = vueFiche(kylhian);
    render(FicheVivante, { props: { fiche: kylhian, modifiable: true } });
    expect((screen.getByLabelText('PV actuels') as HTMLInputElement).value).toBe(String(vue.pv.actuel));
    expect((screen.getByLabelText('PP actuels') as HTMLInputElement).value).toBe(String(vue.pp!.actuel));
    expect(screen.getByTestId('ca').textContent).toBe(String(vue.stats.ca));
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer un PV' }));
    expect(actions.modifierPV).toHaveBeenCalledWith('p-k', vue.pv.actuel - 1, vue.pv.max);
  });

  it('bug v1 : une mise à jour de la fiche pendant la saisie n’efface pas ce qu’on tape', async () => {
    const kylhian = reelle('Kylhian', 'p-k');
    const { rerender } = render(FicheVivante, { props: { fiche: kylhian, modifiable: true } });
    const champ = screen.getByLabelText('PV actuels') as HTMLInputElement;
    await fireEvent.focus(champ);
    await fireEvent.input(champ, { target: { value: '5' } });
    await rerender({ fiche: { ...kylhian, pvActuel: 9, piecesOr: 99 }, modifiable: true });
    expect(champ.value).toBe('5');
    await fireEvent.blur(champ);
    expect(actions.modifierPV).toHaveBeenCalledWith('p-k', 5, kylhian.pvMax);
    // Hors saisie, la valeur de la base revient.
    await rerender({ fiche: { ...kylhian, pvActuel: 7 }, modifiable: true });
    expect(champ.value).toBe('7');
  });

  it('notes : écrites à la sortie du champ, seulement si elles ont changé', async () => {
    const f = reelle('Karlach', 'p-c');
    render(FicheVivante, { props: { fiche: f, modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    const notes = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    await fireEvent.focus(notes);
    await fireEvent.blur(notes);
    expect(actions.modifierNotes).not.toHaveBeenCalled();
    await fireEvent.focus(notes);
    await fireEvent.input(notes, { target: { value: 'Espionne. Ne rien dire.' } });
    await fireEvent.blur(notes);
    expect(actions.modifierNotes).toHaveBeenCalledWith('p-c', 'Espionne. Ne rien dire.');
  });

  it('onglets : capacités avec leurs noms, choix et mutation', async () => {
    render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: false } });
    await fireEvent.click(screen.getByRole('button', { name: 'Capacités' }));
    expect(screen.getByText(/Spécimen d'élite/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Suivi' }));
    expect(screen.getByText('Veines sombres')).toBeTruthy();
  });

  it('lecture seule : ni bouton −/+, ni champ modifiable, ni portrait à changer', async () => {
    render(FicheVivante, { props: { fiche: reelle('Kylhian', 'p-k'), modifiable: false } });
    expect(screen.queryByRole('button', { name: 'Retirer un PV' })).toBeNull();
    expect(screen.queryByLabelText('PV actuels')).toBeNull();
    expect(screen.queryByText('Changer le portrait')).toBeNull();
  });

  it('portrait : l’image du document à part, sinon les initiales', async () => {
    const f = reelle('Kylhian', 'p-k');
    render(FicheVivante, { props: { fiche: f, modifiable: true } });
    expect(screen.getByRole('img', { name: `Portrait de ${f.nom} (aucun)` }).textContent).toBe('KB');
    portraits['p-k'] = { image: 'data:image/jpeg;base64,AAAA', majLe: 1 };
    flushSync();
    expect((screen.getByRole('img', { name: `Portrait de ${f.nom}` }) as HTMLImageElement).src).toContain('data:image/jpeg');
  });
});

describe('groupe (vue du MJ)', () => {
  it('tous les personnages, le joué en tête ; PV modifiables sur place ; fiche complète à la demande', async () => {
    session.uid = 'bob';
    // Le personnage joué passe en tête, même si son joueur vient après dans l'alphabet.
    joueurs.elements = [
      { id: 'alice', nom: 'Alice', rejointLe: 1 },
      { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'p-v' },
    ];
    const karlach = reelle('Karlach', 'p-c');
    const vhorgar = reelle('Vhorgar', 'p-v', 'carol');
    persos.elements = [vhorgar, karlach];
    render(GroupeMj);
    const lignes = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(lignes.map((l) => l.querySelector('strong')?.textContent)).toEqual([vhorgar.nom, karlach.nom]);
    expect(within(lignes[0]!).getByText('joué')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: `Ajouter un PV à ${vhorgar.nom}` }));
    expect(actions.modifierPV).toHaveBeenCalledWith('p-v', (vhorgar.pvActuel ?? vhorgar.pvMax) + 1, vhorgar.pvMax);
    await fireEvent.click(within(lignes[0]!).getByRole('button', { name: 'Fiche' }));
    await waitFor(() => expect(screen.getByRole('region', { name: `Fiche de ${vhorgar.nom}` })).toBeTruthy());
  });
});

describe('onglet Équipement (L2.4)', () => {
  const ouvrir = async (fiche: ReturnType<typeof reelle>, mj = false) => {
    render(FicheVivante, { props: { fiche, modifiable: true, mj } });
    await fireEvent.click(screen.getByRole('button', { name: 'Équipement' }));
  };

  it('retirer l’épée de Karlach : un seul changement, l’emplacement vidé et l’épée au sac', async () => {
    const k = reelle('Karlach', 'p-c');
    await ouvrir(k);
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer Épée longue' }));
    expect(actions.appliquerChangement).toHaveBeenCalledTimes(1);
    const [id, ch] = actions.appliquerChangement.mock.calls[0]! as [string, { equipement: object; inventaire: Record<string, { id: string } | null> }];
    expect(id).toBe('p-c');
    expect(ch.equipement).toEqual({ main_droite: null });
    expect(Object.values(ch.inventaire).map((o) => o?.id)).toEqual(['epee_longue']);
  });

  it('un refus des règles s’affiche, et rien n’est écrit', async () => {
    const base = reelle('Karlach', 'p-c');
    const k = { ...E.appliquer(base, E.ajouterDuCatalogue(base, 'arc_long')), id: 'p-c' };
    await ouvrir(k);
    await fireEvent.click(screen.getByRole('button', { name: 'Équiper Arc long' }));
    expect(screen.getByRole('status').textContent).toContain('Libère tes deux mains');
    expect(actions.appliquerChangement).not.toHaveBeenCalled();
  });

  it('utiliser la potion de soin supérieure : PV rendus et le jet affiché', async () => {
    const k = { ...reelle('Karlach', 'p-c'), pvActuel: 5 };
    await ouvrir(k);
    await fireEvent.click(screen.getByRole('button', { name: 'Utiliser Potion de soin améliorée' }));
    const ch = actions.appliquerChangement.mock.calls[0]![1] as { pvActuel: number };
    expect(ch.pvActuel).toBeGreaterThan(5);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/1d8 → \d+ = \d+, \d+ PV rendus\./));
  });

  it('ajouter un objet : le MJ seul (décision 1a)', async () => {
    await ouvrir(reelle('Karlach', 'p-c'));
    expect(screen.queryByLabelText('Objet du catalogue')).toBeNull();
  });

  it('le MJ ajoute deux potions de soin au sac', async () => {
    await ouvrir(reelle('Karlach', 'p-c'), true);
    await fireEvent.change(screen.getByLabelText('Objet du catalogue'), { target: { value: 'potion_soin' } });
    await fireEvent.input(screen.getByLabelText('Quantité'), { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    const ch = actions.appliquerChangement.mock.calls[0]![1] as { inventaire: Record<string, { id: string; quantite: number }> };
    expect(Object.values(ch.inventaire)).toEqual([expect.objectContaining({ id: 'potion_soin', quantite: 2 })]);
  });

  it('pile : « Jeter 1 » retire une unité', async () => {
    const base = reelle('Karlach', 'p-c');
    const k = { ...E.appliquer(base, E.ajouterDuCatalogue(base, 'potion_soin', 3)), id: 'p-c' };
    await ouvrir(k);
    await fireEvent.click(screen.getByRole('button', { name: 'Jeter un Potion de soin' }));
    const ch = actions.appliquerChangement.mock.calls[0]![1] as { inventaire: Record<string, { quantite: number }> };
    expect(Object.values(ch.inventaire)[0]?.quantite).toBe(2);
  });
});
