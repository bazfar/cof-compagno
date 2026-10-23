import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — le grimoire (lot G1, décisions de Thomas du
 * 22/10/2026) : onglets selon ce que le personnage a (2a), voie de l'école
 * en nœuds, verbe choisi et ses paliers, effet en combat généré (3a), usage
 * hors combat palier par palier (7), aperçu du coût avec un élément et la
 * surcharge ; la section du joueur n'apparaît que s'il a des sorts (1a).
 */

const sorts = vi.hoisted(() => {
  class RefusSort extends Error {}
  return {
    RefusSort,
    demanderSort: vi.fn(async (_f: unknown, _s: string, _p: string, _i: string, _se?: string) => 'd-n'),
    repondreDemandeSort: vi.fn(async (_d: unknown, _oui: boolean, _m: string, _b?: number) => {}),
    lancerSort: vi.fn(async (_id: string, _se?: string) => ({})),
    resisterSort: vi.fn(async (_d: unknown, _b: number) => true),
  };
});
vi.mock('../../src/lib/actions/sorts-hors-combat', () => sorts);
vi.mock('../../src/lib/actions/journal', () => ({ messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/sorts-hors-combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSorts);
vi.mock('../../src/lib/magasins/scenes-hors-combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsScenes);

const { joueurs, persos, table, demandesSorts, sceneHc } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const RF = await import('../../src/lib/fiche/refonte');
const { classeParId } = await import('../../src/regles');
const { default: Grimoire } = await import('../../src/composants/Grimoire.svelte');
const { default: GrimoireJoueur } = await import('../../src/composants/GrimoireJoueur.svelte');
const { default: DemandesSortsMj } = await import('../../src/composants/DemandesSortsMj.svelte');
const { default: CompteurSortsMj } = await import('../../src/composants/CompteurSortsMj.svelte');
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const convertie = (nom: string, classe: string, choix: Partial<RefonteFiche>, id: string, niveau?: number): FicheV2 & { id: string } => {
  const v1 = ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche;
  const n = niveau ?? v1.niveau;
  return { ...RF.convertirFiche({ ...v1, niveau: n }, { ...RF.refonteVierge(classeParId.get(classe)!, n), ...choix }), id };
};
const kylhian = () => {
  const f = convertie('Kylhian', 'magicien', { ecole: 'evocation', elementDepart: 'feu', mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'], rangs: { 'magicien.ecole': 4 } }, 'p-k', 5);
  return { ...f, octrois: { ...f.octrois, verbes: [{ id: 'illusion.leurre', maitrise: 'nonMaitrise' as const }], elements: { glace: 'initie' as const } } };
};
const karlach = () => convertie('Karlach', 'guerrier', {}, 'p-c');
const region = (nom: string) => within(screen.getByLabelText(nom, { selector: 'div' }));

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  persos.elements = [];
  joueurs.elements = [];
  demandesSorts.elements = [];
  table.donnees = { sceneActive: null, seanceOuverte: { id: 's1', numero: 1 }, sceneHorsCombat: null };
  sceneHc.donnees = null;
  Object.values(sorts).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
});

describe('Grimoire', () => {
  it('en-tête, onglets selon ce que le personnage a, voie en nœuds R1 à R5', () => {
    render(Grimoire, { props: { fiche: kylhian() } });
    expect(screen.getByRole('heading', { name: /Grimoire · Kylhian/ })).toBeTruthy();
    expect(screen.getByText(/Réserve : 20 \/ 20 PP/)).toBeTruthy();
    expect(screen.getAllByRole('tab', { selected: undefined }).filter((t) => t.closest('.onglets')).map((t) => t.textContent)).toEqual(['École', 'Écoles par grimoire', 'Sorts mineurs', 'Éléments']);
    const voie = within(screen.getByRole('navigation', { name: 'Voie de l’école' }));
    expect(voie.getAllByRole('button').map((b) => b.textContent)).toEqual(['Missile · II', 'Choc · II', 'Rayon · I', 'Vortex · I', 'Nova']);
    expect(voie.getByRole('button', { name: 'Missile · II' }).getAttribute('aria-pressed')).toBe('true');
    expect(voie.getByText('Rang 4 / 5')).toBeTruthy();
  });

  it('le verbe choisi : combat au palier atteint, coût détaillé, hors combat cumulé (7)', async () => {
    render(Grimoire, { props: { fiche: kylhian() } });
    expect(region('En combat').getByText('2 cibles ennemies, portée 10 cases')).toBeTruthy();
    const cout = screen.getByTestId('cout');
    expect(cout.textContent).toMatch(/^2 PP au palier II/);
    expect(within(cout).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['base du rang +2', 'palier +1', 'maîtrise d’école −1']);
    const hc = region('Hors combat');
    expect(hc.getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'I Briser ou couper un objet à distance.',
      'II Deux objets à la fois.',
      'III Trajectoire courbe : le trait contourne un obstacle. (au rang 5)',
    ]);
    expect(hc.getByText('1 PP hors combat, au palier II.')).toBeTruthy();
    expect(hc.getByText(/le reste s'apprécie entre le joueur et le MJ/)).toBeTruthy();
    // Le palier III, à venir : l'effet en combat change, pas le coût.
    await fireEvent.click(within(screen.getByRole('tablist', { name: 'Paliers' })).getByRole('tab', { name: /III/ }));
    expect(region('En combat').getByRole('heading', { name: 'En combat · palier III' })).toBeTruthy();
    expect(region('En combat').getByText('3 cibles ennemies, portée 10 cases')).toBeTruthy();
    expect(screen.getByTestId('cout').textContent).toMatch(/^2 PP au palier II/);
  });

  it('aperçu : un élément puis la surcharge changent le coût et montrent le dérapage', async () => {
    render(Grimoire, { props: { fiche: kylhian() } });
    await fireEvent.change(screen.getByLabelText('Élément'), { target: { value: 'glace' } });
    expect(screen.getByTestId('cout').textContent).toMatch(/^3 PP/);
    expect(within(screen.getByTestId('cout')).getByText('élément +1')).toBeTruthy();
    expect(screen.getByText(/Glace : Ralenti 1 tour\. Dérapage 20 % : Le lanceur est ralenti\./)).toBeTruthy();
    await fireEvent.click(screen.getByLabelText(/Surcharge : palier III/));
    expect(screen.getByTestId('cout').textContent).toMatch(/^6 PP au palier II, surchargé en III/);
    // Changer de verbe remet la surcharge à zéro.
    await fireEvent.click(screen.getByRole('button', { name: 'Rayon · I' }));
    expect((screen.getByLabelText(/Surcharge : palier II/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('cout').textContent).not.toMatch(/surchargé/);
    await fireEvent.click(screen.getByRole('button', { name: 'Choc · II' }));
    expect(screen.queryByLabelText(/Surcharge/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Choc' })).toBeTruthy();
  });

  it('un verbe pas encore appris : ni coût ni élément, ses paliers « au rang »', async () => {
    render(Grimoire, { props: { fiche: kylhian() } });
    await fireEvent.click(screen.getByRole('button', { name: 'Nova' }));
    expect(screen.getByText(/pas encore appris/)).toBeTruthy();
    expect(screen.queryByTestId('cout')).toBeNull();
    expect(screen.queryByLabelText('Élément')).toBeNull();
    expect(within(screen.getByRole('tablist', { name: 'Paliers' })).getAllByRole('tab').every((t) => /au rang/.test(t.textContent ?? ''))).toBe(true);
  });

  it('écoles par grimoire, mineurs, éléments : des cartes', async () => {
    render(Grimoire, { props: { fiche: kylhian() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Écoles par grimoire' }));
    const leurre = within(screen.getByRole('article', { name: 'Leurre' }));
    expect(leurre.getByText(/Non maîtrisé · palier I seulement/)).toBeTruthy();
    expect(leurre.getByText(/Échec sur 1 à 10 au d20 \(50 %\)/)).toBeTruthy();
    expect(leurre.getByText(/Un bruit ou une silhouette immobile/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Sorts mineurs' }));
    expect(within(screen.getByRole('article', { name: 'Lumière' })).getByText(/palier I · 0 PP/)).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Trait arcanique' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Éléments' }));
    expect(within(screen.getByRole('article', { name: 'Glace' })).getByText(/Dérapage \(20 %\)/)).toBeTruthy();
  });

  it('plusieurs voies d’école : un sélecteur ; le prêtre passe d’un Cercle à l’autre', async () => {
    render(Grimoire, { props: { fiche: convertie('Hermione', 'pretre', { rangs: { 'pretre.guerison': 3, 'pretre.jugement': 2 } }, 'p-h') } });
    const voies = within(screen.getByRole('group', { name: "Voies d'école" }));
    expect(voies.getAllByRole('button').length).toBeGreaterThan(1);
    expect(screen.queryByRole('tab', { name: 'Éléments' })).toBeNull();
    const jugement = voies.getByRole('button', { name: 'Jugement' });
    await fireEvent.click(jugement);
    expect(jugement.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Rang 2 / 5')).toBeTruthy();
  });

  it('un personnage sans sorts : rien', () => {
    const { container } = render(Grimoire, { props: { fiche: karlach() } });
    expect(container.querySelector('section')).toBeNull();
  });
});

describe('GrimoireJoueur (1a, 2a)', () => {
  it('le personnage actif du joueur, s’il a des sorts : la section est disponible', async () => {
    const surDisponible = vi.fn();
    persos.elements = [{ ...kylhian(), proprietaireUid: 'alice' }];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p-k' }];
    render(GrimoireJoueur, { props: { surDisponible } });
    expect(screen.getByRole('heading', { name: /Grimoire · Kylhian/ })).toBeTruthy();
    await waitFor(() => expect(surDisponible).toHaveBeenLastCalledWith(true));
  });

  it('le joueur demande ses sorts depuis son grimoire, avec la séance ouverte (G2a)', async () => {
    persos.elements = [{ ...kylhian(), proprietaireUid: 'alice' }];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p-k' }];
    render(GrimoireJoueur, { props: {} });
    const form = within(screen.getByRole('form', { name: 'Lancer Missile hors combat' }));
    await fireEvent.input(form.getByLabelText('Ce que tu veux faire'), { target: { value: 'Couper la corde du pont' } });
    await fireEvent.click(form.getByRole('button', { name: 'Demander au MJ' }));
    await waitFor(() => expect(sorts.demanderSort).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-k' }), 'evocation.missile', 'II', 'Couper la corde du pont', 's1'));
  });

  it('G2b (8b) : appelé dans une scène ouverte, il peut demander d’ici, avec un mot vers la carte de scène', async () => {
    persos.elements = [{ ...kylhian(), proprietaireUid: 'alice' }];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p-k' }];
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
    sceneHc.donnees = { statut: 'ouverte', appelesUids: ['alice'] } as never;
    const vue = render(GrimoireJoueur, { props: {} });
    expect(screen.getByRole('note').textContent).toMatch(/joins le sort à ton action dans la carte de scène/);
    expect(screen.getByRole('form', { name: 'Lancer Missile hors combat' })).toBeTruthy();
    vue.unmount();
    sceneHc.donnees = { statut: 'ouverte', appelesUids: ['bob'] } as never;
    render(GrimoireJoueur, { props: {} });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('un guerrier, une fiche v1 ou le personnage d’un autre : pas de section', async () => {
    for (const [perso, proprio] of [[karlach(), 'alice'], [{ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith('Kylhian')), 'alice', 1).fiche, id: 'p-k' }, 'alice'], [kylhian(), 'bob']] as const) {
      const surDisponible = vi.fn();
      persos.elements = [{ ...perso, proprietaireUid: proprio }];
      joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: perso.id }];
      const vue = render(GrimoireJoueur, { props: { surDisponible } });
      expect(screen.queryByRole('region', { name: 'Grimoire' })).toBeNull();
      await waitFor(() => expect(surDisponible).toHaveBeenLastCalledWith(false));
      vue.unmount();
    }
  });
});

const demande = (d: Record<string, unknown> = {}) => ({
  id: 'd1', uid: 'alice', perso: 'p-k', nom: 'Kylhian', sort: 'illusion.leurre', nomSort: 'Leurre', palier: 'I', pp: 1, echec: 10, sauvegarde: 'Volonte', dd: 13,
  intention: 'Une silhouette au bout du couloir', textes: ['Un bruit ou une silhouette immobile : compte une réussite en infiltration.'],
  statut: 'attente', motif: null, de: null, resistance: null, scene: null, action: null, bonus: null, creeLe: 1, majLe: 1, ...d,
});

describe('demander un sort hors combat (G2a : 1a, 2b, 3a, 4a)', () => {
  const lanceur = (patch: Record<string, unknown> = {}) => render(Grimoire, { props: { fiche: { ...kylhian(), ...patch }, lancer: { seance: 's1' } } });

  it('le verbe choisi : palier au plus celui atteint, coût, intention, puis la demande', async () => {
    lanceur();
    const form = within(screen.getByRole('form', { name: 'Lancer Missile hors combat' }));
    const palier = form.getByLabelText('Palier') as HTMLSelectElement;
    expect([...palier.options].map((o) => o.textContent)).toEqual(['I · 1 PP', 'II · 1 PP']);
    expect(palier.value).toBe('II');
    const bouton = form.getByRole('button', { name: 'Demander au MJ' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    await fireEvent.change(palier, { target: { value: 'I' } });
    await fireEvent.input(form.getByLabelText('Ce que tu veux faire'), { target: { value: 'Briser le cadenas' } });
    expect(bouton.disabled).toBe(false);
    await fireEvent.click(bouton);
    await waitFor(() => expect(sorts.demanderSort).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-k' }), 'evocation.missile', 'I', 'Briser le cadenas', 's1'));
    expect(await form.findByRole('status')).toBeTruthy();
  });

  it('le DD et la sauvegarde ; un refus de l’action s’affiche', async () => {
    sorts.demanderSort.mockRejectedValueOnce(new sorts.RefusSort('Il te faut 2 PP.'));
    lanceur();
    await fireEvent.click(screen.getByRole('button', { name: 'Choc · II' }));
    const form = within(screen.getByRole('form', { name: 'Lancer Choc hors combat' }));
    expect(form.getByText(/sauvegarde de la cible \(DD \d+\)/)).toBeTruthy();
    await fireEvent.input(form.getByLabelText('Ce que tu veux faire'), { target: { value: 'Enfoncer la porte' } });
    await fireEvent.click(form.getByRole('button', { name: 'Demander au MJ' }));
    expect((await form.findByRole('alert')).textContent).toBe('Il te faut 2 PP.');
  });

  it('PP manquants : bouton grisé ; un mineur reste possible à 0 PP', async () => {
    lanceur({ ppActuel: 0 });
    const form = within(screen.getByRole('form', { name: 'Lancer Missile hors combat' }));
    expect(form.getByText('Il te faut 1 PP (tu en as 0).')).toBeTruthy();
    await fireEvent.input(form.getByLabelText('Ce que tu veux faire'), { target: { value: 'x' } });
    expect((form.getByRole('button', { name: 'Demander au MJ' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByRole('tab', { name: 'Sorts mineurs' }));
    const lum = within(screen.getByRole('form', { name: 'Lancer Lumière hors combat' }));
    expect(lum.queryByLabelText('Palier')).toBeNull();
    await fireEvent.input(lum.getByLabelText('Ce que tu veux faire'), { target: { value: 'Éclairer la crypte' } });
    expect((lum.getByRole('button', { name: 'Demander au MJ' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('par grimoire : le risque d’échec ; pas de demande pour un verbe non appris ni sans usage hors combat', async () => {
    lanceur();
    await fireEvent.click(screen.getByRole('button', { name: 'Nova' }));
    expect(screen.queryByRole('form', { name: /hors combat/ })).toBeNull();
    await fireEvent.click(screen.getByRole('tab', { name: 'Écoles par grimoire' }));
    expect(within(screen.getByRole('form', { name: 'Lancer Leurre hors combat' })).getByText(/échec sur 1 à 10 au d20/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Sorts mineurs' }));
    expect(screen.queryByRole('form', { name: 'Lancer Trait arcanique hors combat' })).toBeNull();
  });

  it('le MJ, qui lit le grimoire depuis la fiche, ne demande rien', () => {
    render(Grimoire, { props: { fiche: kylhian() } });
    expect(screen.queryByRole('form', { name: /hors combat/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Mes sorts hors combat' })).toBeNull();
  });
});

describe('mes sorts hors combat (5b, 15b, 14b)', () => {
  it('chaque état ; « Lancer » sur un sort accepté', async () => {
    demandesSorts.elements = [
      demande({ id: 'a', creeLe: 6 }),
      demande({ id: 'b', statut: 'refusee', motif: 'Personne ne regarde', creeLe: 5 }),
      demande({ id: 'c', statut: 'acceptee', creeLe: 4 }),
      demande({ id: 'd', statut: 'ratee', de: 3, creeLe: 3 }),
      demande({ id: 'e', statut: 'lancee', de: 15, creeLe: 2 }),
      demande({ id: 'f', statut: 'lancee', de: 15, resistance: { de: 18, bonus: 0, reussie: true }, creeLe: 1 }),
      demande({ id: 'g', uid: 'bob', creeLe: 7 }),
      demande({ id: 'h', perso: 'p-autre', creeLe: 8 }),
    ];
    render(Grimoire, { props: { fiche: kylhian(), lancer: { seance: 's1' } } });
    const liste = within(screen.getByRole('region', { name: 'Mes sorts hors combat' }));
    expect(liste.getAllByRole('listitem').map((l) => l.querySelector('.aide')!.textContent)).toEqual([
      'En attente du MJ.',
      'Refusé : Personne ne regarde.',
      'Accepté.',
      'Raté (d20 : 3) : les PP sont dépensés.',
      'Lancé (d20 : 15). Sauvegarde de la cible : au MJ.',
      'Lancé (d20 : 15). La cible a résisté.',
    ]);
    await fireEvent.click(liste.getByRole('button', { name: 'Lancer (−1 PP)' }));
    expect(sorts.lancerSort).toHaveBeenCalledWith('c', 's1');
  });
});

describe('mes sorts : en scène (G2b)', () => {
  it('un sort accordé en scène se lance depuis la carte de scène, sans bouton ici', () => {
    demandesSorts.elements = [demande({ statut: 'acceptee', scene: 'sh1', action: '1-alice', bonus: 1 })];
    render(Grimoire, { props: { fiche: kylhian(), lancer: { seance: 's1' } } });
    const liste = within(screen.getByRole('region', { name: 'Mes sorts hors combat' }));
    expect(liste.getByText(/· en scène ·/)).toBeTruthy();
    expect(liste.getByText('Ta carte de scène le lance.')).toBeTruthy();
    expect(liste.queryByRole('button')).toBeNull();
  });
});

describe('le MJ et les sorts hors combat (5b, 14b, 16a)', () => {
  it('rien à montrer sans demande', () => {
    render(DemandesSortsMj);
    expect(screen.queryByRole('region', { name: 'Sorts hors combat' })).toBeNull();
  });

  it('une demande : intention, possibilités du palier, coût ; accepter avec un motif, refuser', async () => {
    demandesSorts.elements = [demande(), demande({ id: 'd2', nom: 'Magnus', creeLe: 2 })];
    render(DemandesSortsMj);
    const d = within(screen.getByRole('article', { name: 'Demande de Kylhian' }));
    expect(d.getByText(/« Une silhouette au bout du couloir »/)).toBeTruthy();
    expect(d.getByText(/Un bruit ou une silhouette immobile/)).toBeTruthy();
    expect(d.getByText('1 PP · échec sur 1 à 10 au d20 · sauvegarde de Volonté, DD 13')).toBeTruthy();
    await fireEvent.input(d.getByLabelText('Motif pour Kylhian'), { target: { value: 'Il fait nuit' } });
    await fireEvent.click(d.getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(sorts.repondreDemandeSort).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), true, 'Il fait nuit', 0));
    await fireEvent.click(within(screen.getByRole('article', { name: 'Demande de Magnus' })).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(sorts.repondreDemandeSort).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'd2' }), false, ''));
  });

  it('un sort lancé à sauvegarde : le MJ donne le bonus de la cible et lance ; les sorts traités sont repliés', async () => {
    demandesSorts.elements = [
      demande({ statut: 'lancee', de: 15 }),
      demande({ id: 'd2', statut: 'lancee', de: 15, resistance: { de: 4, bonus: 0, reussie: false } }),
      demande({ id: 'd3', statut: 'refusee', motif: 'Non' }),
      demande({ id: 'd4', statut: 'acceptee' }),
    ];
    render(DemandesSortsMj);
    const s = within(screen.getByRole('article', { name: 'Sauvegarde contre Leurre' }));
    expect(s.getByText(/sauvegarde de Volonté contre DD 13/)).toBeTruthy();
    await fireEvent.input(s.getByLabelText('Bonus de la cible'), { target: { value: '4' } });
    await fireEvent.click(s.getByRole('button', { name: 'Lancer la sauvegarde' }));
    await waitFor(() => expect(sorts.resisterSort).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), 4));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const faits = screen.getByText('Derniers sorts').closest('details')!;
    expect([...faits.querySelectorAll('li')].map((l) => l.textContent?.split(' : ').pop())).toEqual(['refusé (Non)', 'lancé, la cible n’a pas résisté']);
  });

  it('G2b : un sort de la scène en cours se tranche dans la carte de scène, pas ici', () => {
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
    demandesSorts.elements = [demande({ scene: 'sh1', action: '1-alice' }), demande({ id: 'd2', nom: 'Magnus', scene: 'sh0', action: '1-bob' }), demande({ id: 'd3', nom: 'Hermione' })];
    render(DemandesSortsMj);
    expect(screen.queryByRole('article', { name: 'Demande de Kylhian' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Demande de Magnus' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Demande de Hermione' })).toBeTruthy();
  });

  it('le compteur : demandes en attente et sauvegardes à lancer', async () => {
    const surNombre = vi.fn();
    demandesSorts.elements = [demande(), demande({ id: 'b', statut: 'lancee', de: 12 }), demande({ id: 'c', statut: 'acceptee' }), demande({ id: 'd', statut: 'refusee' })];
    render(CompteurSortsMj, { props: { surNombre } });
    await waitFor(() => expect(surNombre).toHaveBeenLastCalledWith(2));
  });
});
