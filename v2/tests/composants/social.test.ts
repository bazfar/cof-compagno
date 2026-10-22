import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — PNJ et réputation (lot S1, décisions de Thomas du
 * 22/10/2026) : la prépa social du MJ (réputation, PNJ tirés du lore,
 * rencontre, service rendu, corrections) et les relations côté joueur
 * (PNJ rencontrés seulement, cran et repère, jamais le DD).
 */

const actions = vi.hoisted(() => {
  class RefusAttitude extends Error {}
  return {
    RefusAttitude,
    ajusterReputation: vi.fn(async (_f: string, _d: number) => 0),
    creerPnj: vi.fn(async (_n: string, _f: string | null) => 'nouveau'),
    importerPnjDuLore: vi.fn(async (_f: unknown[], _e: Set<string>) => 1),
    rencontrerPnj: vi.fn(async (_id: string, _s?: string) => ({})),
    rendreServicePnj: vi.fn(async (_id: string, _m: string, _s?: string) => ({})),
    corrigerAttitudePnj: vi.fn(async (_id: string, _d: 1 | -1, _m: string, _s?: string) => ({})),
    retirerPnj: vi.fn(async (_id: string, _p: unknown) => {}),
    mensongeDecouvertPnj: vi.fn(async (_id: string, _m: string, _s?: string) => ({})),
  };
});
vi.mock('../../src/lib/actions/pnj', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/pnj.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPnj);
vi.mock('../../src/lib/magasins/lore.svelte', async () => (await import('./faux-magasins.svelte')).magasinsLore);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
// La scène (S2), en tête de la prépa social.
vi.mock('../../src/lib/actions/scenes-hors-combat', () => ({ RefusScene: class extends Error {}, ouvrirScene: vi.fn(), cloreScene: vi.fn(), donnerVecuDeScene: vi.fn() }));
vi.mock('../../src/lib/magasins/scenes-hors-combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsScenes);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/seances.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSeances);

const { pnjs, reputation, historiquePnj, loreMj, table } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { default: PrepaSocial } = await import('../../src/composants/PrepaSocial.svelte');
const { default: RelationsJoueur } = await import('../../src/composants/RelationsJoueur.svelte');

const pnj = (id: string, p: Record<string, unknown> = {}) => ({ id, nom: id, faction: null, lore: null, rencontre: false, cran: null, tendance: null, creeLe: 1, majLe: 1, ...p });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  pnjs.elements = [];
  reputation.donnees = null;
  historiquePnj.elements = [];
  loreMj.elements = [];
  table.donnees = { sceneActive: null, seanceOuverte: { id: 's0014', numero: 14 } };
});

describe('prépa social (MJ)', () => {
  it('réputation : score, palier et prix par bloc ; + et − ajustent ; le plafond des Fils bloque +', async () => {
    reputation.donnees = { scores: { comptoir: 6, fils_libris: 5, garde_citoyenne: -10 }, majLe: 1 };
    render(PrepaSocial);
    const zone = screen.getByRole('region', { name: 'Réputation du groupe' });
    const ligne = (nom: string) => within(zone).getByRole('rowheader', { name: nom }).closest('tr')!;
    expect(within(ligne('Le Comptoir')).getAllByRole('cell').map((c) => c.textContent?.trim()).slice(0, 3)).toEqual(['+6', 'Fiable', 'Prix −10 %']);
    expect(within(ligne('La Garde Citoyenne')).getAllByRole('cell').map((c) => c.textContent?.trim()).slice(0, 3)).toEqual(['−10', 'Némésis', 'Commerce refusé']);
    expect((screen.getByRole('button', { name: 'Monter la réputation auprès de Les Fils de Libris' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Baisser la réputation auprès de La Garde Citoyenne' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Monter la réputation auprès de Le Comptoir' }));
    expect(actions.ajusterReputation).toHaveBeenCalledWith('comptoir', 1);
  });

  it('les PNJ du lore : le bouton compte ceux qui manquent et les crée', async () => {
    loreMj.elements = [
      { id: 'pnj-a', titre: 'A', categorie: 'Personnages', etiquettes: [], source: 'v1:pnj:a' },
      { id: 'pnj-b', titre: 'B', categorie: 'Personnages', etiquettes: [], source: 'v1:pnj:b' },
      { id: 'section-x', titre: 'X', categorie: 'Lieux', etiquettes: [], source: 'v1:section:x' },
    ];
    pnjs.elements = [pnj('pnj-b')];
    render(PrepaSocial);
    await fireEvent.click(screen.getByRole('button', { name: 'Créer les PNJ du lore (1)' }));
    expect(actions.importerPnjDuLore).toHaveBeenCalledTimes(1);
    expect([...actions.importerPnjDuLore.mock.calls[0]![1]]).toEqual(['pnj-b']);
  });

  it('pas encore rencontré : le cran qu’il aura (réputation de sa faction), « Rencontré » dans la séance ouverte', async () => {
    reputation.donnees = { scores: { comptoir: 3 }, majLe: 1 };
    pnjs.elements = [pnj('selyne', { nom: 'Selyne', faction: 'comptoir' })];
    render(PrepaSocial);
    await fireEvent.click(screen.getByRole('button', { name: /^Selyne/ }));
    const fiche = screen.getByRole('complementary', { name: 'Fiche du PNJ' });
    expect(fiche.textContent).toContain('À la rencontre : Connaissance (réputation de sa faction).');
    await fireEvent.click(within(fiche).getByRole('button', { name: 'Rencontré' }));
    expect(actions.rencontrerPnj).toHaveBeenCalledWith('selyne', 's0014');
  });

  it('rencontré : cran et DD (MJ seul), ce que voient les joueurs ; service et corrections demandent un motif', async () => {
    pnjs.elements = [pnj('aude', { nom: 'Aude Berlan', rencontre: true, cran: 'favorable', tendance: 'hausse' })];
    historiquePnj.elements = [{ geste: 'rencontre', avant: null, apres: 'connaissance', motif: 'Première rencontre', parUid: 'mj', creeLe: 1 }];
    render(PrepaSocial);
    await fireEvent.click(screen.getByRole('button', { name: /^Aude Berlan/ }));
    const fiche = screen.getByRole('complementary', { name: 'Fiche du PNJ' });
    expect(within(fiche).getByTestId('cran-mj').textContent).toBe('Favorable');
    expect(fiche.textContent).toContain('DD social −2');
    expect(fiche.textContent).toContain('Les joueurs voient : Favorable ↑ · Un service rendu pourrait en faire un allié.');
    expect(fiche.textContent).toContain('Rencontre : Connaissance — Première rencontre');
    const service = within(fiche).getByRole('button', { name: 'Service rendu' }) as HTMLButtonElement;
    expect(service.disabled).toBe(true);
    await fireEvent.input(within(fiche).getByLabelText('Motif'), { target: { value: 'Dette payée' } });
    expect(service.disabled).toBe(false);
    // À Favorable, la parole ne monte plus (13c) : seul le service rendu.
    expect((within(fiche).getByRole('button', { name: 'Un cran de plus' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(service);
    expect(actions.rendreServicePnj).toHaveBeenCalledWith('aude', 'Dette payée', 's0014');
  });

  it('S2 : depuis la fiche d’un PNJ rencontré, ouvrir une scène avec lui ; un mensonge découvert, avec motif, tant qu’il en reste', async () => {
    pnjs.elements = [pnj('aude', { nom: 'Aude Berlan', rencontre: true, cran: 'connaissance', mensonges: 1 }), pnj('rurik', { nom: 'Rurik', rencontre: true, cran: 'neutre' })];
    render(PrepaSocial);
    await fireEvent.click(screen.getByRole('button', { name: /^Aude Berlan/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ouvrir une scène avec Aude Berlan' }));
    expect((within(screen.getByRole('region', { name: 'Scène' })).getByLabelText('PNJ') as HTMLSelectElement).value).toBe('aude');
    const fiche = screen.getByRole('complementary', { name: 'Fiche du PNJ' });
    const bouton = within(fiche).getByRole('button', { name: 'Mensonge découvert (1 en cours)' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    await fireEvent.input(within(fiche).getByLabelText('Motif'), { target: { value: 'Elle a vérifié au Comptoir' } });
    await fireEvent.click(bouton);
    expect(actions.mensongeDecouvertPnj).toHaveBeenCalledWith('aude', 'Elle a vérifié au Comptoir', 's0014');
    await fireEvent.click(screen.getByRole('button', { name: /^Rurik/ }));
    expect(screen.queryByRole('button', { name: /^Mensonge découvert/ })).toBeNull();
  });

  it('chercher et filtrer : rencontrés, pas encore rencontrés', async () => {
    pnjs.elements = [pnj('a', { nom: 'Aude', rencontre: true, cran: 'neutre' }), pnj('b', { nom: 'Bastian' }), pnj('c', { nom: 'Colin' })];
    render(PrepaSocial);
    const liste = () => screen.getAllByRole('button', { pressed: false }).map((b) => b.querySelector('.nom')?.textContent).filter(Boolean);
    expect(liste()).toEqual(['Aude', 'Bastian', 'Colin']);
    await fireEvent.change(screen.getByRole('combobox', { name: 'Montrer' }), { target: { value: 'inconnus' } });
    expect(liste()).toEqual(['Bastian', 'Colin']);
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Chercher un PNJ' }), { target: { value: 'col' } });
    expect(liste()).toEqual(['Colin']);
  });
});

describe('relations (joueur)', () => {
  it('réputation par bloc et PNJ rencontrés seulement, avec leur repère ; jamais le DD', () => {
    session.uid = 'alice';
    reputation.donnees = { scores: { cercle_peuples: 2 }, majLe: 1 };
    pnjs.elements = [
      pnj('aude', { nom: 'Aude Berlan', rencontre: true, cran: 'favorable', tendance: 'hausse' }),
      pnj('rurik', { nom: 'Rurik Aldenne', faction: 'garde_citoyenne', rencontre: true, cran: 'mefiant', tendance: 'baisse' }),
      pnj('secret', { nom: 'Inconnu' }),
    ];
    render(RelationsJoueur);
    const rep = screen.getByRole('region', { name: 'Réputation du groupe' });
    expect(rep.textContent).toContain('Le Cercle des Peuples Reconnu (+2)');
    expect(rep.textContent).toContain('Le Comptoir Neutre (0)');
    const zone = screen.getByRole('region', { name: 'PNJ rencontrés' });
    expect(within(zone).getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent)).toEqual(['Aude Berlan', 'Rurik Aldenne']);
    expect(within(zone).getByTestId('cran-aude').textContent).toBe('Favorable ↑');
    expect(within(zone).getByTestId('cran-rurik').textContent).toBe('Méfiant ↓');
    expect(zone.textContent).toContain('Un service rendu pourrait en faire un allié.');
    expect(zone.textContent).toContain('La Garde Citoyenne');
    expect(document.body.textContent).not.toContain('Inconnu');
    expect(document.body.textContent).not.toContain('DD');
  });

  it('personne encore', () => {
    render(RelationsJoueur);
    expect(screen.getByText("Le groupe n'a encore rencontré personne.")).toBeTruthy();
  });
});
