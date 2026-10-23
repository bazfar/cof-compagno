import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — sorts et capacités en combat (lot L6.4a, décisions
 * de Thomas du 23/10/2026) : le bloc « Sorts et capacités » de la barre du
 * joueur (13a : liste, palier, surcharge, élément, coût de combat 4a, type
 * d'action 5a) ; la visée sur la carte (6a) ; « Lancer » (2a) ; placer un
 * jeton téléporté (10a) ; PV temporaires et bonus (11a, 12a) dans la
 * barre, le bandeau et le panneau du MJ ; les sauvegardes du monstre que
 * le MJ corrige (8a).
 */

const actions = vi.hoisted(() => {
  class RefusCombat extends Error {}
  return {
    RefusCombat,
    demarrerCombat: vi.fn(async (_b: unknown, _e: string | null) => 'c1'),
    ajouterCombattant: vi.fn(async (_id: string, _b: unknown) => {}),
    lancerInitiative: vi.fn(async (_id: string, _c: unknown) => 12),
    finirTour: vi.fn(async (_id: string, _a: string | null, _cs: unknown, _t: unknown) => ({})),
    donnerLaMain: vi.fn(async (_id: string, _c: unknown, _qui: string) => {}),
    noterAction: vi.fn(async (_id: string, _c: unknown, _x: unknown, _q: unknown) => {}),
    ajusterPvMonstre: vi.fn(async (_id: string, _s: string, _c: unknown, _d: number) => 0),
    cloreCombat: vi.fn(async (_id: string) => {}),
    basculerPortees: vi.fn(async (_id: string, _l: boolean) => {}),
    corrigerSauvegardes: vi.fn(async (..._a: unknown[]) => {}),
  };
});
vi.mock('../../src/lib/actions/combat', () => actions);
const attaques = vi.hoisted(() => ({
  attaquer: vi.fn(async (..._a: unknown[]) => ({ de: 20, bonus: 5, total: 25, def: 13, touche: true, critique: true, echecCritique: false })),
  infligerDegats: vi.fn(async (..._a: unknown[]) => ({ jet: { des: [3, 4], faces: 6, bonus: 0, total: 7 }, degats: { brut: 7, net: 7, detail: '7' }, pv: 2 })),
  attaqueDeMonstre: vi.fn(async (..._a: unknown[]) => ({ issue: { de: 15, bonus: 4, total: 19, def: 16, touche: true, critique: false, echecCritique: false }, net: 5, pv: 15 })),
  subirDegats: vi.fn(async (..._a: unknown[]) => ({ net: 5, pv: 15 })),
  lancerJetDeMort: vi.fn(async (..._a: unknown[]) => ({})),
  releverAllie: vi.fn(async (..._a: unknown[]) => {}),
  boirePotion: vi.fn(async (..._a: unknown[]) => 6),
  remettreJetsDeMort: vi.fn(async (..._a: unknown[]) => {}),
  viser: vi.fn(async (..._a: unknown[]) => {}),
  decharger: vi.fn(async (..._a: unknown[]) => 1),
  poserEtatSur: vi.fn(async (..._a: unknown[]) => {}),
  retirerEtatDe: vi.fn(async (..._a: unknown[]) => {}),
  debutDeTour: vi.fn(async (..._a: unknown[]) => 0),
}));
vi.mock('../../src/lib/actions/attaques', () => attaques);
const sortsCombat = vi.hoisted(() => ({
  lancerSortEnCombat: vi.fn(async (..._a: unknown[]) => ({ issue: 'reussi', texte: 'Choc I lancé.', aPlacer: [] as { cible: string; nom: string; cases: number }[] })),
  placerParSort: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('../../src/lib/actions/sorts-combat', () => sortsCombat);
const actionsCarte = vi.hoisted(() => ({ marquerMort: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/carte', () => actionsCarte);
const journal = vi.hoisted(() => ({ lancerEtNoter: vi.fn(async () => null), messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCombat);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);
vi.mock('../../src/lib/magasins/rencontres.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRencontres);
vi.mock('../../src/lib/magasins/portraits-jetons.svelte', () => ({ suivrePortraitsJetons: () => ({ images: {}, suivre: () => {}, arreter: () => {} }) }));
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));


const faux = await import('./faux-magasins.svelte');
const { table, persos, combatDoc, combattants, jetonsScene, joueurs } = faux;
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const F = await import('../../src/lib/fiche/refonte');
const { classeParId } = await import('../../src/regles');
const { default: BarreCombat } = await import('../../src/composants/BarreCombat.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { viseeCarte } = await import('../../src/lib/combat/visee.svelte');
const { default: BandeauCombat } = await import('../../src/composants/BandeauCombat.svelte');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type EtatCombat = import('../../src/lib/schemas/combat').EtatCombat;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const v2 = (nom: string, classe: string, choix: Record<string, unknown> = {}, id = 'p1', uid = 'alice') => {
  const f = { ...v1(nom, id, uid), classe };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, f.niveau), ...choix }), id };
};
const neutre = { physique: 1, magique: 1 };
const base = { modInit: 1, de: 10, pv: null as number | null, pvMax: null as number | null, aTerre: false, mvtBase: 5, def: null as number | null, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as EtatCombat[], usages: {} as Record<string, number>, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, monstre: null as string | null };
const pj = (id: string, c: Partial<Combattant> = {}) => ({ ...base, id: `pj-${id}`, genre: 'pj' as const, nom: id, perso: id, uid: 'alice', initiative: 11 as number | null, ...c });
const goule = (c: Partial<Combattant & { id: string }> = {}) => ({ ...base, id: 'm-r1-a', genre: 'monstre' as const, nom: 'Goule A', perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15 as number | null, pv: 9, pvMax: 14, def: 13, ...c });
const combat = (c: Record<string, unknown> = {}) => ({ nom: 'Goules', scene: 'cave', rencontre: 'r1', statut: 'encours' as const, round: 2, tour: 6, actif: 'pj-p1' as string | null, porteesLibres: false, creeLe: 1, closLe: null, ...c });
const carte = { scene: { colonnes: 10, lignes: 10, murs: [], obstacles: [], portes: [] } as never, jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 2 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 3, cy: 2 }] };
const mage = (rangEcole = 2, niveau = 3, choix: Record<string, unknown> = {}) => {
  const f = { ...v1('Shyrion', 'p1', 'alice'), classe: 'magicien', niveau };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get('magicien')!, niveau), ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': rangEcole, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'], ...choix } as never), id: 'p1' };
};
const barre = (o: Record<string, unknown> = {}) =>
  render(BarreCombat, { props: { fiche: mage(), idCombat: 'c1', combat: combat(), moi: pj('p1', { nom: 'Shyrion' }), combattants: [pj('p1', { nom: 'Shyrion' }), goule()], fiches: new Map(), carte, ...o } as never });
const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom }) as HTMLButtonElement;


beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  Object.values(sortsCombat).forEach((f) => f.mockClear());
  table.donnees = { sceneActive: 'cave', combat: 'c1' };
  persos.elements = [];
  combatDoc.donnees = null;
  combattants.elements = [];
  jetonsScene.elements = [];
  joueurs.elements = [];
  viseeCarte.v = null;
});

describe('le bloc « Sorts et capacités » (13a)', () => {
  it('ses verbes, sorts mineurs et capacités, avec le type d’action ; le coût de combat (4a)', async () => {
    barre();
    const choix = screen.getByLabelText('Sort ou capacité') as HTMLSelectElement;
    expect([...choix.options].map((o) => o.textContent)).toEqual(['Missile · action', 'Choc · action', 'Trait arcanique · action', 'Lumière · action']);
    expect(screen.getByTestId('cout-sort').textContent).toBe('2 PP');
    await fireEvent.change(choix, { target: { value: 'evocation.choc' } });
    expect(screen.getByTestId('cout-sort').textContent).toBe('3 PP');
    expect(screen.getByText('Une créature ennemie, à 6 cases')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Surcharge'));
    expect(screen.getByTestId('cout-sort').textContent).toBe('6 PP');
    expect((screen.getByLabelText('Élément') as HTMLSelectElement).value).toBe('');
    await fireEvent.change(choix, { target: { value: 'mineur.lumiere' } });
    expect(screen.getByTestId('cout-sort').textContent).toBe('0 PP');
    expect(screen.queryByLabelText('Surcharge')).toBeNull();
    expect(screen.queryByLabelText('Élément')).toBeNull();
    expect(screen.getByText('Sans cible')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Viser sur la carte' })).toBeNull();
  });

  it('école Maître (−1), élément Initié (+1) ; le palier se choisit (au plus celui atteint)', async () => {
    barre({ fiche: mage(4, 9, { rangs: { 'magicien.ecole': 4 } }) });
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.choc' } });
    expect([...(screen.getByLabelText('Palier') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['I', 'II']);
    expect(screen.getByTestId('cout-sort').textContent).toBe('3 PP');
    await fireEvent.change(screen.getByLabelText('Élément'), { target: { value: 'feu' } });
    expect(screen.getByTestId('cout-sort').textContent).toBe('4 PP');
    await fireEvent.change(screen.getByLabelText('Palier'), { target: { value: 'I' } });
    expect(screen.getByTestId('cout-sort').textContent).toBe('3 PP');
    expect(screen.getByLabelText('Surcharge')).toBeTruthy();
  });

  it('6a : « Viser sur la carte » ouvre la visée ; le clic sur un jeton le prend pour cible ; « Lancer » résout (2a)', async () => {
    const moi = pj('p1', { nom: 'Shyrion' });
    barre({ moi, combattants: [moi, goule()] });
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.choc' } });
    expect(bouton('Lancer Choc').disabled).toBe(true);
    expect(viseeCarte.v).toBeNull();
    await fireEvent.click(bouton('Viser sur la carte'));
    expect(screen.getByText('Clique ta cible sur la carte.')).toBeTruthy();
    expect(viseeCarte.v).not.toBeNull();
    // Le survol de la goule : elle serait prise, à portée.
    expect(viseeCarte.v!.apercu({ cx: 3, cy: 2 })).toEqual({ cases: [], jetons: ['m-r1-a'], refus: null });
    // Le survol d'une case vide ou de soi (pas un ennemi) : rien de pris.
    expect(viseeCarte.v!.apercu({ cx: 5, cy: 5 }).jetons).toEqual([]);
    expect(viseeCarte.v!.apercu({ cx: 2, cy: 2 }).jetons).toEqual([]);
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    flushSync();
    expect(screen.getByTestId('visee').textContent).toMatch(/^Visée : Goule A/);
    expect(viseeCarte.v!.fixe.jetons).toEqual(['m-r1-a']);
    expect(bouton('Lancer Choc').disabled).toBe(false);
    await fireEvent.click(bouton('Lancer Choc'));
    await screen.findByText('Choc I lancé.');
    expect(sortsCombat.lancerSortEnCombat).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ tour: 6 }),
      expect.objectContaining({ id: 'pj-p1' }),
      expect.objectContaining({ id: 'p1' }),
      { sort: 'evocation.choc', palier: 'I', surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } },
      carte,
      expect.any(Array),
      expect.any(Map),
    );
    // La visée se referme.
    expect(viseeCarte.v).toBeNull();
    expect(screen.queryByTestId('visee')).toBeNull();
  });

  it('une seule cible pour Choc : un second clic remplace la première', async () => {
    const autre = goule({ id: 'm-r1-b', nom: 'Goule B' });
    barre({ combattants: [pj('p1', { nom: 'Shyrion' }), goule(), autre], carte: { ...carte, jetons: [...carte.jetons, { id: 'm-r1-b', genre: 'monstre' as const, cx: 4, cy: 2 }] } });
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.choc' } });
    await fireEvent.click(bouton('Viser sur la carte'));
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    flushSync();
    viseeCarte.v!.choisir({ cx: 4, cy: 2 }, 'm-r1-b');
    flushSync();
    expect(screen.getByTestId('visee').textContent).toMatch(/^Visée : Goule B effacer/);
  });

  it('un sort qui exige un élément ne propose pas « Sans élément »', async () => {
    const f = { ...v1('Shyrion', 'p1', 'alice'), classe: 'magicien', niveau: 12 };
    const maitre = { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get('magicien')!, 12), ecole: 'evocation', elementDepart: 'feu', secondElement: 'glace', elementMaitre: 'feu', rangs: { 'magicien.ecole': 1, 'magicien.elementaire': 5 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] } as never), id: 'p1' };
    barre({ fiche: maitre });
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'magicien.cataclysme' } });
    expect([...(screen.getByLabelText('Élément') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['feu']);
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.missile' } });
    expect([...(screen.getByLabelText('Élément') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'feu', 'glace']);
  });

  it('« effacer » la visée ; fermer la visée rend la carte ; changer de sort la remet à zéro', async () => {
    barre();
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.choc' } });
    await fireEvent.click(bouton('Viser sur la carte'));
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, null);
    flushSync();
    expect(screen.getByTestId('visee').textContent).toMatch(/Goule A/);
    await fireEvent.click(screen.getByRole('button', { name: 'effacer' }));
    expect(screen.queryByTestId('visee')).toBeNull();
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    flushSync();
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.missile' } });
    expect(screen.queryByTestId('visee')).toBeNull();
    expect(viseeCarte.v).toBeNull();
    await fireEvent.click(bouton('Viser sur la carte'));
    await fireEvent.click(bouton('Fermer la visée'));
    expect(viseeCarte.v).toBeNull();
  });

  it('6a : un sort en ligne vise une case ; la zone se montre au survol, hors de portée en refus', async () => {
    barre({ fiche: mage(3, 9) });
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.rayon' } });
    expect(screen.getByText('Une case, à 5 cases au plus · zone : ligne de 5')).toBeTruthy();
    await fireEvent.click(bouton('Viser sur la carte'));
    expect(screen.getByText('Clique la case visée sur la carte.')).toBeTruthy();
    const a = viseeCarte.v!.apercu({ cx: 3, cy: 2 });
    expect(a.cases).toHaveLength(5);
    expect(a.jetons).toEqual(['m-r1-a']);
    expect(viseeCarte.v!.apercu({ cx: 9, cy: 2 }).refus).toBe('hors de portée (7 cases, 5 au plus)');
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    flushSync();
    expect(screen.getByTestId('visee').textContent).toMatch(/^Visée : case 4, 3/);
    expect(bouton('Lancer Rayon').disabled).toBe(false);
  });

  it('refus visibles : pas son tour, action principale prise, déjà servi ; une fiche v1 ou sans sort', async () => {
    const vue = barre({ combat: combat({ actif: 'm-r1-a' }) });
    expect(bouton('Viser sur la carte').disabled).toBe(true);
    vue.unmount();
    const v = barre({ moi: pj('p1', { tourActions: 6, principale: true }) });
    expect(screen.getByText('Action principale prise ce tour.', { selector: '.sorts p' })).toBeTruthy();
    v.unmount();
    const v2b = barre({ fiche: mage(5, 9), moi: pj('p1', { usages: { 'evocation.nova': 1 } }) });
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.nova' } });
    expect(screen.getByText('Nova a déjà servi.')).toBeTruthy();
    expect(screen.getByText('Soi · zone : cercle de 2 autour de toi')).toBeTruthy();
    expect(screen.getByText('1×/combat')).toBeTruthy();
    expect(bouton('Lancer Nova').disabled).toBe(true);
    v2b.unmount();
    const v3 = barre({ fiche: v1('Shyrion', 'p1', 'alice') });
    expect(screen.getByText('Les sorts se lancent depuis une fiche de la refonte.')).toBeTruthy();
    v3.unmount();
    barre({ fiche: v2('Karlach', 'guerrier') });
    expect(screen.getByText('Aucun sort ni capacité à lancer.')).toBeTruthy();
  });

  it('un refus du lancer s’affiche', async () => {
    sortsCombat.lancerSortEnCombat.mockRejectedValueOnce(new actions.RefusCombat('Il te faut 3 PP (il t’en reste 2).'));
    barre();
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'mineur.lumiere' } });
    await fireEvent.click(bouton('Lancer Lumière'));
    expect((await screen.findByRole('alert')).textContent).toBe('Il te faut 3 PP (il t’en reste 2).');
  });

  it('10a : un sort qui téléporte : la case d’arrivée d’un clic', async () => {
    sortsCombat.lancerSortEnCombat.mockResolvedValueOnce({ issue: 'reussi', texte: 'Portail I lancé.', aPlacer: [{ cible: 'm-r1-a', nom: 'Goule A', cases: 6 }] });
    barre();
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'mineur.lumiere' } });
    await fireEvent.click(bouton('Lancer Lumière'));
    await screen.findByText('Portail I lancé. Clique sur la carte la case d’arrivée de Goule A (6 cases au plus).');
    expect(screen.getByText('Place Goule A : clique la case d’arrivée (6 cases au plus).')).toBeTruthy();
    expect(bouton('Lancer Lumière').disabled).toBe(true);
    expect(viseeCarte.v!.apercu({ cx: 5, cy: 2 })).toEqual({ cases: [{ cx: 5, cy: 2 }], jetons: ['m-r1-a'], refus: null });
    expect(viseeCarte.v!.apercu({ cx: 2, cy: 2 }).refus).toBe('case prise');
    viseeCarte.v!.choisir({ cx: 5, cy: 2 }, null);
    await screen.findByText('Goule A est placé.');
    expect(sortsCombat.placerParSort).toHaveBeenCalledWith('cave', carte, { cible: 'm-r1-a', nom: 'Goule A', cases: 6 }, { cx: 5, cy: 2 });
    expect(viseeCarte.v).toBeNull();
  });
});

describe('PV temporaires, bonus, sauvegardes (8a, 11a, 12a)', () => {
  const bonus = { sur: 'DEF', valeur: 2, rounds: 3, consomme: false, typeDegats: null, source: 'Hermione' };

  it('la barre : ses PV temporaires et ses bonus', () => {
    barre({ moi: pj('p1', { pvTemp: 5, bonus: [bonus] }) });
    expect(screen.getByText('PV temp. 5')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Mes bonus' })).getByText('+2 DEF (3)')).toBeTruthy();
  });

  it('le bandeau : « +5 » après les PV, les bonus en pastilles', () => {
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    combattants.elements = [goule({ pvTemp: 5, bonus: [bonus] })];
    render(BandeauCombat);
    expect(screen.getByText('9/14 +5')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Bonus de Goule A' })).getByText('+2 DEF (3)').getAttribute('title')).toBe('Hermione');
  });

  it('le panneau du MJ : les sauvegardes du monstre, qu’il corrige ; sans sauvegardes, +0 à donner ; PV temporaires et bonus', async () => {
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule({ sauvegardes: { FOR: 2, DEX: 3, CON: 2, Volonte: 1 } as never, pvTemp: 4, bonus: [bonus] as never })];
    const vue = render(PanneauCombat);
    expect(screen.getByText('PV temp. 4')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Bonus de Goule A' })).getByText('+2 DEF (3)')).toBeTruthy();
    expect((screen.getByLabelText('Sauvegarde DEX') as HTMLInputElement).value).toBe('3');
    await fireEvent.input(screen.getByLabelText('Sauvegarde Vol.'), { target: { value: '4' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
    expect(actions.corrigerSauvegardes).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), { FOR: 2, DEX: 3, CON: 2, Volonte: 4 });
    vue.unmount();
    combattants.elements = [goule()];
    render(PanneauCombat);
    expect(screen.getByText('Sauvegardes à donner (+0)')).toBeTruthy();
    expect((screen.getByLabelText('Sauvegarde FOR') as HTMLInputElement).value).toBe('0');
  });
});
