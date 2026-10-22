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

vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { joueurs, persos } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const RF = await import('../../src/lib/fiche/refonte');
const { classeParId } = await import('../../src/regles');
const { default: Grimoire } = await import('../../src/composants/Grimoire.svelte');
const { default: GrimoireJoueur } = await import('../../src/composants/GrimoireJoueur.svelte');
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
