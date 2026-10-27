import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — les choix du lancer (lot L6.5a, décisions de
 * Thomas du 26/10/2026) : le panneau « Options » replié de la barre (2b),
 * qui ne montre que ce dont le sort a besoin et retient « Lancer » tant
 * que manque un choix ; la posture (3a) ; le second élément (4a) ; le
 * montant et la caractéristique (5a) ; les passifs d'un ennemi abattu de
 * son arme (12a).
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
  lancerSortEnCombat: vi.fn(async (..._a: unknown[]) => ({ issue: 'reussi', texte: 'Choc I lancé.', aPlacer: [] as { cible: string; nom: string; cases: number }[], aInvoquer: [] as never[] })),
  placerParSort: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('../../src/lib/actions/sorts-combat', () => sortsCombat);
const actionsCarte = vi.hoisted(() => ({ marquerMort: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('../../src/lib/actions/carte', () => actionsCarte);
const journal = vi.hoisted(() => ({ lancerEtNoter: vi.fn(async () => null), messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCombat);
vi.mock('../../src/lib/magasins/zones.svelte', async () => (await import('./faux-magasins.svelte')).magasinsZones);
const zonesActions = vi.hoisted(() => ({
  apresDeplacement: vi.fn(async (..._a: unknown[]) => 0),
  peindreCase: vi.fn(async (..._a: unknown[]) => {}),
  retirerZone: vi.fn(async (..._a: unknown[]) => {}),
  zonesDuDebutDeTour: vi.fn(async (..._a: unknown[]) => 0),
  idCase: (c: { cx: number; cy: number }) => `c-${c.cx}-${c.cy}`,
}));
vi.mock('../../src/lib/actions/zones', () => zonesActions);
const passifs = vi.hoisted(() => ({ jouerPassifs: vi.fn(async (..._a: unknown[]) => 1) }));
vi.mock('../../src/lib/actions/passifs', () => passifs);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);
vi.mock('../../src/lib/magasins/rencontres.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRencontres);
vi.mock('../../src/lib/magasins/portraits-jetons.svelte', () => ({ suivrePortraitsJetons: () => ({ images: {}, suivre: () => {}, arreter: () => {} }) }));
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));

const faux = await import('./faux-magasins.svelte');
const { table, persos, combatDoc, combattants, jetonsScene, joueurs, zonesCombat } = faux;
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const F = await import('../../src/lib/fiche/refonte');
const { classeParId } = await import('../../src/regles');
const { default: BarreCombat } = await import('../../src/composants/BarreCombat.svelte');
const { viseeCarte } = await import('../../src/lib/combat/visee.svelte');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type EtatCombat = import('../../src/lib/schemas/combat').EtatCombat;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id: string, uid: string) => ({
  ...ficheDepuisV1(
    FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)),
    uid,
    1,
  ).fiche,
  id,
});
const neutre = { physique: 1, magique: 1 };
const base = {
  modInit: 1,
  de: 10,
  pv: null as number | null,
  pvMax: null as number | null,
  aTerre: false,
  mvtBase: 5,
  def: null as number | null,
  armure: 0,
  resistances: neutre,
  mortSucces: 0,
  mortEchecs: 0,
  mort: false,
  etats: [] as EtatCombat[],
  usages: {} as Record<string, number>,
  gainTouche: { round: 0, montant: 0 },
  debutTour: 0,
  visee: false,
  sauvegardes: null,
  boss: false,
  demonOuMortVivant: false,
  pvTemp: 0,
  bonus: [],
  tourActions: 0,
  principale: false,
  secondaire: false,
  mvt: 0,
  sprint: false,
  creeLe: 1,
  maitre: null,
  invocation: null,
  concentration: null,
  monstre: null as string | null,
};
const pj = (id: string, c: Partial<Combattant> = {}) => ({ ...base, id: `pj-${id}`, genre: 'pj' as const, nom: id, perso: id, uid: 'alice', initiative: 11 as number | null, ...c });
const goule = (c: Partial<Combattant & { id: string }> = {}) => ({
  ...base,
  id: 'm-r1-a',
  genre: 'monstre' as const,
  nom: 'Goule A',
  perso: null,
  uid: null,
  monstre: 'goule',
  modInit: 3,
  initiative: 15 as number | null,
  pv: 9,
  pvMax: 14,
  def: 13,
  ...c,
});
const combat = (c: Record<string, unknown> = {}) => ({
  nom: 'Goules',
  scene: 'cave',
  rencontre: 'r1',
  statut: 'encours' as const,
  round: 2,
  tour: 6,
  actif: 'pj-p1' as string | null,
  porteesLibres: false,
  creeLe: 1,
  closLe: null,
  ...c,
});
const carte = {
  scene: { colonnes: 10, lignes: 10, murs: [], obstacles: [], portes: [] } as never,
  jetons: [
    { id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 2 },
    { id: 'm-r1-a', genre: 'monstre' as const, cx: 3, cy: 2 },
  ],
};
const mage = (rangEcole = 2, niveau = 3, choix: Record<string, unknown> = {}) => {
  const f = { ...v1('Shyrion', 'p1', 'alice'), classe: 'magicien', niveau };
  return {
    ...F.convertirFiche(
      f as never,
      {
        ...F.refonteVierge(classeParId.get('magicien')!, niveau),
        ecole: 'evocation',
        elementDepart: 'feu',
        rangs: { 'magicien.ecole': rangEcole, 'magicien.elementaire': 1 },
        mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'],
        ...choix,
      } as never,
    ),
    id: 'p1',
  };
};
const barre = (o: Record<string, unknown> = {}) =>
  render(BarreCombat, {
    props: { fiche: mage(), idCombat: 'c1', combat: combat(), moi: pj('p1', { nom: 'Shyrion' }), combattants: [pj('p1', { nom: 'Shyrion' }), goule()], fiches: new Map(), carte, ...o } as never,
  });
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
  zonesCombat.elements = [];
  passifs.jouerPassifs.mockClear();
  Object.values(attaques).forEach((f) => f.mockClear());
  Object.values(zonesActions).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as { mockClear: () => void }).mockClear());
});

/** Un personnage de la refonte au niveau 9. */
const pjN = (nom: string, classe: string, choix: Record<string, unknown>) => {
  const f = { ...v1(nom, 'p1', 'alice'), classe, niveau: 9 };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, 9), ...choix } as never), id: 'p1', ppActuel: 30 };
};
const options = () => screen.queryByText(/^Options/);
const lancerAvec = () => sortsCombat.lancerSortEnCombat.mock.calls.at(-1)![4] as { options?: Record<string, unknown> };
const choisir = (label: string, value: string | number) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saisir = (label: string, value: number) => fireEvent.input(screen.getByLabelText(label), { target: { value } });

describe('le panneau « Options » (2b)', () => {
  it('rien pour Choc ; la posture du Guerrier manque : « Lancer » attend, puis part avec elle (3a)', async () => {
    barre();
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'evocation.choc' } });
    expect(options()).toBeNull();
    const g = pjN('Karlach', 'guerrier', { rangs: { 'guerrier.soldat': 2 } });
    barre({ fiche: g, moi: pj('p1', { nom: 'Karlach' }) });
    expect(screen.getByText('Options · choisis la posture')).toBeTruthy();
    const panneau = () => screen.getByText(/^Options/).closest('details')!;
    expect(panneau().open).toBe(true);
    expect(bouton('Lancer Posture de combat').disabled).toBe(true);
    expect(screen.getByText('1 à 2')).toBeTruthy();
    await choisir('Axe en bonus', 'attaque');
    await saisir('Valeur de la posture', 2);
    expect(screen.getByText('Options · choisis la posture')).toBeTruthy();
    await choisir('Axe en malus', 'DEF');
    expect(screen.getByText('Options')).toBeTruthy();
    // Complet, le panneau reste ouvert : le joueur voit ce qu'il a choisi.
    expect(panneau().open).toBe(true);
    await fireEvent.click(bouton('Lancer Posture de combat'));
    await waitFor(() => expect(lancerAvec().options).toEqual({ posture: { plus: 'attaque', moins: 'DEF', valeur: 2 } }));
  });

  it('3a : sous Maîtrise tactique, la posture va jusqu’au double', () => {
    const g = pjN('Karlach', 'guerrier', { rangs: { 'guerrier.soldat': 2 } });
    barre({ fiche: g, moi: pj('p1', { nom: 'Karlach', etats: [{ id: 'maitrise_tactique', rounds: 2, cumul: 1, charges: null, des: null, source: null }] }) });
    expect(screen.getByText('1 à 4')).toBeTruthy();
  });

  it('4a : le second élément après un premier Maître ; la paire, une fois par combat ; déjà faite, « Lancer » attend ; le rebond de l’électricité', async () => {
    const f = mage(2, 9, { rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 5 }, secondElement: 'electricite', elementMaitre: 'feu' });
    barre({ fiche: f });
    await choisir('Sort ou capacité', 'evocation.missile');
    expect(screen.queryByLabelText('Second élément')).toBeNull();
    await choisir('Élément', 'feu');
    // Rien d'exigé : le panneau reste replié.
    expect(screen.getByText(/^Options/).closest('details')!.open).toBe(false);
    await choisir('Second élément', 'electricite');
    expect(screen.getByText(/· 1× par combat$/)).toBeTruthy();
    expect(screen.getByLabelText('Rebond')).toBeTruthy();
    await choisir('Rebond', 'pj-p1');
    expect(screen.queryByText(/déjà faite/)).toBeNull();
    const avant = screen.getByTestId('cout-sort').textContent;
    await choisir('Second élément', '');
    expect(screen.getByTestId('cout-sort').textContent).not.toBe(avant);
    expect(screen.queryByLabelText('Rebond')).toBeNull();
    await choisir('Second élément', 'electricite');
    await fireEvent.click(bouton('Viser sur la carte'));
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    await fireEvent.click(bouton('Lancer Missile'));
    await waitFor(() => expect(lancerAvec()).toMatchObject({ element: 'feu', options: { secondElement: 'electricite' } }));
  });

  it('4a : un second élément Maître ne compte pas la combinaison du combat ; changer le premier élément oublie le second', async () => {
    const f = mage(2, 9, { rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 5 }, secondElement: 'electricite', elementMaitre: 'feu' });
    const deuxMaitres = { ...f, octrois: { ...f.octrois, elements: { eau: 'maitre' } } };
    barre({ fiche: deuxMaitres, moi: pj('p1', { nom: 'Shyrion', usages: { combinaison: 1 } }) });
    await choisir('Sort ou capacité', 'evocation.missile');
    await choisir('Élément', 'feu');
    await choisir('Second élément', 'eau');
    expect(screen.queryByText(/1× par combat/)).toBeNull();
    expect(screen.queryByText(/déjà faite/)).toBeNull();
    await fireEvent.click(bouton('Viser sur la carte'));
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    await screen.findByTestId('visee');
    expect(bouton('Lancer Missile').disabled).toBe(false);
    // Le premier élément devient l'eau : plus de second élément, le coût est celui de l'eau seule.
    await choisir('Second élément', 'electricite');
    await choisir('Élément', 'electricite');
    expect(screen.getByTestId('cout-sort').textContent).toMatch(/PP$/);
  });

  it('4a : la combinaison du combat déjà faite', async () => {
    const f = mage(2, 9, { rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 5 }, secondElement: 'electricite', elementMaitre: 'feu' });
    barre({ fiche: f, moi: pj('p1', { nom: 'Shyrion', usages: { combinaison: 1 } }) });
    await choisir('Sort ou capacité', 'evocation.missile');
    await choisir('Élément', 'feu');
    await choisir('Second élément', 'electricite');
    expect(screen.getByText(/: déjà faite$/)).toBeTruthy();
    await fireEvent.click(bouton('Viser sur la carte'));
    viseeCarte.v!.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    await screen.findByTestId('visee');
    expect(bouton('Lancer Missile').disabled).toBe(true);
    // Sans combinaison, il lance.
    await choisir('Second élément', '');
    expect(bouton('Lancer Missile').disabled).toBe(false);
  });

  it('5a : Transfusion : combien de PV ; au palier II, sa variante demande l’allié ; un élixir, sa caractéristique', async () => {
    const n = pjN('Shyrion', 'necromancien', { ecole: 'outre-tombe', elementDepart: 'sang', rangs: { 'necromancien.seuil': 3 } });
    const p2 = pj('p2', { nom: 'Hermione' });
    const vue = barre({ fiche: n, combattants: [pj('p1', { nom: 'Shyrion' }), goule(), p2] });
    await choisir('Sort ou capacité', 'seuil.transfusion');
    expect(screen.getByText('Options · combien de PV ?')).toBeTruthy();
    expect(screen.getByText('1 à 18')).toBeTruthy();
    await saisir('Montant', 4);
    expect(screen.queryByText(/combien de PV/)).toBeNull();
    vue.unmount();
    const b = pjN('Shyrion', 'barde', { rangs: { 'barde.alcoolisme': 1 } });
    barre({ fiche: b });
    expect(screen.getByText('Options · choisis la caractéristique')).toBeTruthy();
    expect([...(screen.getByLabelText('Caractéristique') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']);
    await choisir('Caractéristique', 'CON');
    expect(screen.queryByText(/choisis la caractéristique/)).toBeNull();
  });

  it('les options d’un sort s’oublient quand on en change ; l’allié se choisit parmi les PJ', async () => {
    const f = mage(2, 9, { rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 5 }, elementDepart: 'eau', secondElement: 'electricite', elementMaitre: 'eau' });
    barre({ fiche: f, combattants: [pj('p1', { nom: 'Shyrion' }), goule(), pj('p2', { nom: 'Hermione' })] });
    await choisir('Sort ou capacité', 'evocation.missile');
    await choisir('Élément', 'eau');
    expect([...(screen.getByLabelText('Allié') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['—', 'Shyrion', 'Hermione']);
    await choisir('Effet de l’eau', 'retraitEtat');
    expect(screen.getByText('Options · choisis l’allié dont l’eau retire un état')).toBeTruthy();
    await choisir('Allié', 'pj-p2');
    expect(screen.queryByText(/dont l’eau/)).toBeNull();
    await choisir('Sort ou capacité', 'evocation.choc');
    await choisir('Sort ou capacité', 'evocation.missile');
    await choisir('Élément', 'eau');
    expect((screen.getByLabelText('Effet de l’eau') as HTMLSelectElement).value).toBe('poussee');
    expect((screen.getByLabelText('Allié') as HTMLSelectElement).value).toBe('');
  });
});

describe('12a : un ennemi abattu de son arme', () => {
  it('déclenche ses passifs ; un ennemi qui tient, non', async () => {
    barre();
    await fireEvent.click(screen.getAllByRole('button', { name: /^Contact/ })[0]!);
    await fireEvent.click(await screen.findByRole('button', { name: /^Lancer les dégâts/ }));
    await waitFor(() => expect(attaques.infligerDegats).toHaveBeenCalled());
    expect(passifs.jouerPassifs).not.toHaveBeenCalled();
    attaques.infligerDegats.mockResolvedValueOnce({ jet: { des: [6], faces: 6, bonus: 0, total: 6 }, degats: { brut: 6, net: 6, detail: '6' }, pv: 0 });
    await fireEvent.click(screen.getAllByRole('button', { name: /^Contact/ })[0]!);
    await fireEvent.click(await screen.findByRole('button', { name: /^Lancer les dégâts/ }));
    await waitFor(() =>
      expect(passifs.jouerPassifs).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'p1' }), { quoi: 'ennemiAbattu', parSortDeSang: false }),
    );
  });
});
