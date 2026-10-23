import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — le socle du combat (lot L6.1, décisions de Thomas
 * du 23/10/2026) : la colonne d'initiative (5a, 6a, 7a) pour le joueur et
 * le MJ, la section Combat du MJ (démarrer 4a, arriver 9a, clore 11a, PV
 * des monstres 3b), l'écran du joueur en combat et sa barre.
 *
 * Lot L6.2 (attaques et dégâts, décisions du 23/10/2026) : la barre du
 * joueur (attaquer 1b 2a 3a 4a 5a, Mourant 7a, Subir des dégâts 8a,
 * potions 9a), les attaques de monstre du MJ (6a), la DEF au démarrage,
 * les portées libres et ce que le client du MJ tient pour les joueurs.
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
}));
vi.mock('../../src/lib/actions/attaques', () => attaques);
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
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));

const { table, jetonsScene, joueurs, persos, bestiaire, armesBestiaire, armuresBestiaire, rencontres, combatDoc, combattants } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { attaquesDuPj } = await import('../../src/lib/combat/attaques-pj');
const { carteFaux } = await import('./faux-magasins.svelte');
const { default: OrdreCombat } = await import('../../src/composants/OrdreCombat.svelte');
const { default: CombatMj } = await import('../../src/composants/CombatMj.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { default: CombatJoueur } = await import('../../src/composants/CombatJoueur.svelte');
const { default: BarreCombat } = await import('../../src/composants/BarreCombat.svelte');
type Combattant = import('../../src/lib/schemas/combat').Combattant;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}) => ({
  id: `pj-${id}`, genre: 'pj' as const, nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: null as number | null, de: null as number | null, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}) => ({
  id: `m-r1-${id}`, genre: 'monstre' as const, nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: null as number | null, de: null as number | null, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13 as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, ...c,
});
const combat = (c: Record<string, unknown> = {}) => ({ nom: 'Les goules du cellier', scene: 'cave', rencontre: 'r1', statut: 'encours' as const, round: 2, tour: 6, actif: null as string | null, porteesLibres: false, creeLe: 1, closLe: null, ...c });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  Object.values(attaques).forEach((f) => f.mockClear());
  actionsCarte.marquerMort.mockClear();
  armesBestiaire.donnees = null;
  armuresBestiaire.donnees = null;
  journal.lancerEtNoter.mockClear();
  table.donnees = { sceneActive: 'cave', combat: null };
  jetonsScene.elements = [];
  joueurs.elements = [];
  persos.elements = [];
  bestiaire.elements = [];
  rencontres.elements = [];
  combatDoc.donnees = null;
  combattants.elements = [];
  carteFaux.valeur = null;
});

describe('la colonne d’initiative (5a, 6a, 7a)', () => {
  const ordre = () => [
    { ...monstre('Goule A', { initiative: 15, de: 12, pv: 9 }) },
    { ...pj('Shyrion', { uid: 'alice', initiative: 12, de: 11, tourActions: 6, mvt: 2 }) },
    { ...monstre('Goule B', { initiative: 9, de: 6, pv: 0, aTerre: true }) },
    { ...pj('Hermione', { uid: 'bob' }) },
  ];
  const props = (role: 'mj' | 'joueur', actif: string | null) => ({
    role, idCombat: 'c1', combat: combat({ actif }), combattants: ordre(), aTerre: new Set(['m-r1-Goule B']), pvPj: new Map([['pj-Shyrion', { actuel: 17, max: 21 }]]),
  });

  it('joueur, à son tour : l’ordre, les PV en chiffres, ses actions, le Sprint, « Finir mon tour »', async () => {
    session.uid = 'alice';
    render(OrdreCombat, { props: props('joueur', 'pj-Shyrion') });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((l) => l.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['15 Goule A 9/14', '12 Shyrion · à toi 17/21', '9 Goule B à terre', '— Hermione']);
    expect(items[1]!.getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('mvt').textContent).toBe('Mvt 3/5');
    await fireEvent.click(screen.getByRole('button', { name: 'Princ.' }));
    expect(actions.noterAction).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'pj-Shyrion' }), { principale: true });
    await fireEvent.click(screen.getByRole('button', { name: /^Sprint : \+2 cases/ }));
    expect(actions.noterAction).toHaveBeenLastCalledWith('c1', expect.anything(), expect.anything(), { sprint: true });
    await fireEvent.click(screen.getByRole('button', { name: 'Finir mon tour' }));
    expect(actions.finirTour).toHaveBeenCalledWith('c1', 'pj-Shyrion', expect.any(Array), new Set(['m-r1-Goule B']));
    // Pas de bouton d'initiative pour un autre joueur.
    expect(screen.queryByRole('button', { name: /Lancer/ })).toBeNull();
  });

  it('joueur, hors de son tour : ni actions ni fin de tour ; il lance son initiative s’il ne l’a pas', async () => {
    session.uid = 'bob';
    render(OrdreCombat, { props: props('joueur', 'm-r1-Goule A') });
    expect(screen.queryByRole('button', { name: 'Finir mon tour' })).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer mon initiative' }));
    expect(actions.lancerInitiative).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'pj-Hermione' }));
  });

  it('Sprint pris : plus de Sprint, l’action principale verrouillée, 7 cases', () => {
    session.uid = 'alice';
    const p = props('joueur', 'pj-Shyrion');
    p.combattants[1] = { ...p.combattants[1]!, principale: true, sprint: true };
    render(OrdreCombat, { props: p });
    expect(screen.queryByRole('button', { name: /^Sprint/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Princ.' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('mvt').textContent).toBe('Mvt 5/7');
  });

  it('MJ : l’initiative d’un absent, la fin du tour de qui joue, la main à qui il veut', async () => {
    render(OrdreCombat, { props: props('mj', 'm-r1-Goule A') });
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer pour Hermione' }));
    expect(actions.lancerInitiative).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'pj-Hermione' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Finir le tour de Goule A' }));
    expect(actions.finirTour).toHaveBeenCalledWith('c1', 'm-r1-Goule A', expect.any(Array), expect.any(Set));
    const choix = screen.getByLabelText('Donner la main à') as HTMLSelectElement;
    expect([...choix.options].map((o) => o.textContent)).toEqual(['—', 'Shyrion', 'Goule B']);
    await fireEvent.change(choix, { target: { value: 'pj-Shyrion' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Donner' }));
    expect(actions.donnerLaMain).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 6 }), 'pj-Shyrion');
  });
});

describe('section Combat du MJ (4a, 9a, 11a)', () => {
  const k = () => reelle('Kargash', 'p1', 'alice');
  const poser = () => {
    persos.elements = [k()];
    jetonsScene.elements = [
      { id: 'pj-p1', genre: 'pj', nom: 'Kargash', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 },
      { id: 'm-r1-a', genre: 'monstre', nom: 'Goule A', couleur: '#c0392b', cx: 5, cy: 5, proprietaire: null, creeLe: 1 },
      { id: 'm-x', genre: 'monstre', nom: 'Rat', couleur: '#c0392b', cx: 6, cy: 5, proprietaire: null, creeLe: 1 },
    ];
    rencontres.elements = [{ id: 'r1', nom: 'Les goules du cellier', scene: 'cave', statut: 'lancee', lanceeLe: 5, monstres: [{ cle: 'a', monstre: 'goule', nom: 'Goule A', cx: 5, cy: 5 }], butin: [], creeLe: 1 }];
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', init: 3, pv: 14, def: 13, armureId: 'cuir', attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }] }];
    armuresBestiaire.donnees = { liste: [{ id: 'cuir', nom: 'Cuir épais', reduction: 2, naturelle: true }] };
  };

  it('démarrer depuis la rencontre lancée : PV et DEF du bestiaire, PV et DEF à donner pour un monstre posé à la main', async () => {
    poser();
    render(CombatMj);
    const zone = within(screen.getByRole('region', { name: 'Démarrer un combat' }));
    expect((zone.getByLabelText('Nom') as HTMLInputElement).value).toBe('Les goules du cellier');
    expect((zone.getByLabelText('PV de Goule A') as HTMLInputElement).value).toBe('14');
    expect(zone.getByText('Donne les PV de Rat.')).toBeTruthy();
    const bouton = zone.getByRole('button', { name: 'Démarrer le combat' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect((zone.getByLabelText('DEF de Goule A') as HTMLInputElement).value).toBe('13');
    await fireEvent.input(zone.getByLabelText('PV de Rat'), { target: { value: '4' } });
    expect(zone.getByText('Donne la DEF de Rat.')).toBeTruthy();
    expect(bouton.disabled).toBe(true);
    await fireEvent.input(zone.getByLabelText('DEF de Rat'), { target: { value: '11' } });
    expect(bouton.disabled).toBe(false);
    await fireEvent.click(bouton);
    await waitFor(() => expect(actions.demarrerCombat).toHaveBeenCalled());
    const [b, enCours] = actions.demarrerCombat.mock.calls[0]! as [{ nom: string; scene: string; rencontre: string; combattants: { id: string; pvMax: number | null; modInit: number }[] }, null];
    expect(enCours).toBeNull();
    expect(b).toMatchObject({ nom: 'Les goules du cellier', scene: 'cave', rencontre: 'r1' });
    expect(b.combattants.map((c) => [c.id, c.pvMax])).toEqual([['pj-p1', null], ['m-r1-a', 14], ['m-x', 4]]);
    expect(b.combattants.map((c) => (c as unknown as { def: number | null }).def)).toEqual([null, 13, 11]);
    expect(b.combattants.map((c) => (c as unknown as { armure: number }).armure)).toEqual([0, 2, 0]);
    expect(b.combattants[0]!.modInit).toBe(vueFiche(k()).stats.initiative);
  });

  it('combat libre : les monstres sans fiche de bestiaire', async () => {
    poser();
    render(CombatMj);
    await fireEvent.change(screen.getByLabelText('D’où vient-il'.replace('’', "'")), { target: { value: '' } });
    expect((screen.getByLabelText('PV de Goule A') as HTMLInputElement).value).toBe('');
  });

  it('pas de scène montrée : rien à démarrer', () => {
    table.donnees = { sceneActive: null, combat: null };
    render(CombatMj);
    expect(screen.getByText(/Montre d'abord une scène/)).toBeTruthy();
  });

  it('en combat : l’initiative, un combattant qui arrive, la clôture ; la main au premier qui a une initiative', async () => {
    poser();
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: null });
    combattants.elements = [pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 14, de: 12 })];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(CombatMj);
    expect(screen.getByRole('heading', { name: 'Les goules du cellier' })).toBeTruthy();
    await waitFor(() => expect(actions.donnerLaMain).toHaveBeenCalledWith('c1', expect.objectContaining({ actif: null }), 'pj-p1'));
    // La liste bouge avant que la main soit lue : elle n'est pas donnée deux fois.
    combattants.elements = [...combattants.elements, pj('p9', { nom: 'Zed', perso: 'p9', uid: 'zed' })];
    flushSync();
    await new Promise((r) => setTimeout(r, 20));
    expect(actions.donnerLaMain).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByText('Ajouter un combattant'));
    const choix = screen.getByLabelText('Jeton de la scène') as HTMLSelectElement;
    expect([...choix.options].map((o) => o.textContent)).toEqual(['—', 'Goule A', 'Rat']);
    await fireEvent.change(choix, { target: { value: 'm-x' } });
    await fireEvent.input(screen.getByLabelText('PV'), { target: { value: '5' } });
    expect((screen.getByRole('button', { name: 'Ajouter' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText('DEF'), { target: { value: '10' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(actions.ajouterCombattant).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-x', pvMax: 5, def: 10 })));
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le combat' }));
    await waitFor(() => expect(actions.cloreCombat).toHaveBeenCalledWith('c1'));
  });
});

describe('panneau du combattant (3b)', () => {
  beforeEach(() => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [reelle('Kargash', 'p1', 'alice')];
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', init: 3, pv: 14, def: 13, attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }] }];
    combattants.elements = [monstre('a', { nom: 'Goule A', initiative: 15, de: 12, pv: 9 }), pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 11, de: 10 })];
  });

  it('le monstre qui joue : ses PV réglés à la main, sa DEF ; une attaque dont l’arme manque à la liste est dite, pas devinée', async () => {
    render(PanneauCombat);
    expect(screen.getByRole('heading', { name: 'Goule A' })).toBeTruthy();
    expect(screen.getByTestId('pv-monstre').textContent).toBe('9/14 PV');
    expect(screen.getByText('DEF 13')).toBeTruthy();
    expect(screen.getByText(/Aucune attaque dont l'arme est dans la liste/)).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('PV à ajouter ou retirer'), { target: { value: '4' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer des PV' }));
    expect(actions.ajusterPvMonstre).toHaveBeenCalledWith('c1', 'cave', expect.objectContaining({ id: 'm-r1-a' }), -4);
    await fireEvent.click(screen.getByRole('button', { name: 'Rendre des PV' }));
    expect(actions.ajusterPvMonstre).toHaveBeenLastCalledWith('c1', 'cave', expect.anything(), 4);
  });

  it('un PJ choisi : sa fiche en bref ; les PJ du combat', async () => {
    render(PanneauCombat);
    await fireEvent.change(screen.getByLabelText('Combattant'), { target: { value: 'pj-p1' } });
    const v = vueFiche(persos.elements[0] as never);
    expect(screen.getByText(`PV ${v.pv.actuel}/${v.pv.max}`)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Les PJ du combat' })).getByText('Kargash')).toBeTruthy();
  });
});

describe('le joueur en combat', () => {
  const k = () => reelle('Kargash', 'p1', 'alice');
  beforeEach(() => {
    session.uid = 'alice';
    persos.elements = [k()];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' }];
  });

  it('son personnage joué est dans le combat : l’initiative, la carte, sa barre', async () => {
    const surEnCombat = vi.fn();
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    combattants.elements = [pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 11, de: 10 })];
    render(CombatJoueur, { props: { surEnCombat } });
    await waitFor(() => expect(surEnCombat).toHaveBeenLastCalledWith(true));
    expect(screen.getByRole('region', { name: 'Ordre d’initiative'.replace('’', "'") })).toBeTruthy();
    expect(screen.getByTestId('carte-table').dataset.hauteur).toBe('560px');
    expect(screen.getByRole('region', { name: 'Mon personnage en combat' })).toBeTruthy();
    // Clos : plus de combat.
    combatDoc.donnees = combat({ statut: 'clos' });
    flushSync();
    await waitFor(() => expect(surEnCombat).toHaveBeenLastCalledWith(false));
    expect(screen.queryByTestId('carte-table')).toBeNull();
  });

  it('un combat sans son personnage : pas d’écran de combat', async () => {
    const surEnCombat = vi.fn();
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat();
    combattants.elements = [pj('autre', { uid: 'bob' })];
    render(CombatJoueur, { props: { surEnCombat } });
    await waitFor(() => expect(surEnCombat).toHaveBeenLastCalledWith(false));
    expect(screen.queryByTestId('carte-table')).toBeNull();
  });

  it('la barre : identité et PV ; jets de carac au journal ; le reste grisé avec son lot', async () => {
    const f = k();
    render(BarreCombat, { props: { fiche: f, idCombat: 'c1', combat: combat({ actif: 'm-r1-a' }), moi: pj('p1', { perso: 'p1', uid: 'alice' }), combattants: [], fiches: new Map(), carte: null } });
    const v = vueFiche(f);
    expect(screen.getByTestId('pv-combat').textContent).toBe(`${v.pv.actuel}/${v.pv.max}`);
    const force = v.caracs.find((c) => c.code === 'FOR')!;
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Test de ${force.nom}`) }));
    expect(journal.lancerEtNoter).toHaveBeenCalledWith(`Test de ${force.nom}`, expect.stringMatching(/^1d20/), f.nom);
    expect((screen.getByRole('button', { name: 'Attaques spéciales · L6.3' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Sorts et capacités · L6.4')).toBeTruthy();
  });
});

describe('attaques et dégâts (L6.2)', () => {
  const k = () => reelle('Kargash', 'p1', 'alice');
  const moi = (c: Partial<Combattant> = {}) => pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 11, de: 10, ...c });
  const goule = (c: Partial<Combattant> = {}) => monstre('a', { nom: 'Goule A', initiative: 15, de: 12, pv: 9, def: 13, ...c });
  const scene = { colonnes: 20, lignes: 20, murs: [], obstacles: [], portes: [] } as never;
  const carte = (gx: number) => ({ scene, jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 2 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: gx, cy: 2 }] });
  const barre = (o: Record<string, unknown> = {}) =>
    render(BarreCombat, {
      props: { fiche: k(), idCombat: 'c1', combat: combat({ actif: 'pj-p1' }), moi: moi(), combattants: [moi(), goule(), monstre('b', { nom: 'Goule B', pv: 0, aTerre: true })], fiches: new Map(), carte: carte(3), ...o } as never,
    });
  beforeEach(() => {
    session.uid = 'alice';
  });

  it('à son tour : la cible et sa DEF, l’attaque de l’arme ; touché en critique, les dégâts doublés à lancer (1b, 2a, 3a)', async () => {
    const a = attaquesDuPj(k())[0]!;
    barre();
    const cible = screen.getByLabelText('Cible') as HTMLSelectElement;
    expect([...cible.options].map((o) => o.textContent)).toEqual(['Goule A · DEF 13']); // la goule B, à terre, n'y est pas
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Contact · ${a.nom}`) }));
    expect(attaques.attaquer).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'm-r1-a' }), a, k().nom);
    await screen.findByText('Critique ! d20 20 : Goule A est touché.');
    await fireEvent.click(screen.getByRole('button', { name: /^Lancer les dégâts .* \(critique\)$/ }));
    expect(attaques.infligerDegats).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), { nom: a.nom, formule: a.formule, typeDegats: a.typeDegats, critique: true }, k().nom);
    await screen.findByText('7 dégâts (7) : Goule A à 2 PV.');
    expect(screen.queryByRole('button', { name: /^Lancer les dégâts/ })).toBeNull();
  });

  it('raté : pas de dégâts à lancer', async () => {
    attaques.attaquer.mockResolvedValueOnce({ de: 1, bonus: 5, total: 6, def: 13, touche: false, critique: false, echecCritique: true });
    barre();
    await fireEvent.click(screen.getAllByRole('button', { name: /^Contact · / })[0]!);
    await screen.findByText('Raté : 1 naturel.');
    expect(screen.queryByRole('button', { name: /^Lancer les dégâts/ })).toBeNull();
  });

  it('hors de portée : refusé et dit ; le MJ libère les portées (4a)', () => {
    const { unmount } = barre({ carte: carte(9) });
    const bouton = screen.getAllByRole('button', { name: /^Contact · / })[0] as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(screen.getByText(/pas au contact \(7 cases\)/)).toBeTruthy();
    unmount();
    barre({ carte: carte(9), combat: combat({ actif: 'pj-p1', porteesLibres: true }) });
    expect((screen.getAllByRole('button', { name: /^Contact · / })[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('hors de son tour, ou l’action principale prise : pas d’attaque (5a)', () => {
    const { unmount } = barre({ combat: combat({ actif: 'm-r1-a' }) });
    expect((screen.getAllByRole('button', { name: /^Contact · / })[0] as HTMLButtonElement).disabled).toBe(true);
    unmount();
    barre({ moi: moi({ tourActions: 6, principale: true }) });
    expect((screen.getAllByRole('button', { name: /^Contact · / })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Action principale prise ce tour.')).toBeTruthy();
  });

  it('Mourant : seul le jet de mort, à son tour ; mort : plus rien (7a)', async () => {
    const f = { ...k(), pvActuel: 0 };
    const { unmount } = barre({ fiche: f, moi: moi({ mortSucces: 1, mortEchecs: 2 }) });
    expect(screen.getByText('Mourant · 1/3 réussites, 2/3 échecs')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Contact · / })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer mon jet de mort' }));
    expect(attaques.lancerJetDeMort).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'pj-p1' }), f);
    unmount();
    const hors = barre({ fiche: f, combat: combat({ actif: 'm-r1-a' }) });
    expect((screen.getByRole('button', { name: 'Lancer mon jet de mort' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('À ton tour.')).toBeTruthy();
    hors.unmount();
    barre({ fiche: f, moi: moi({ mortEchecs: 3, mort: true }) });
    expect(screen.getByText(`${f.nom} est mort.`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Contact · / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lancer mon jet de mort' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Subir des dégâts' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('relever un allié Mourant (7a)', async () => {
    const h = { ...reelle('Hermione', 'p2', 'bob'), pvActuel: 0 };
    const allie = pj('p2', { nom: 'Hermione', perso: 'p2', uid: 'bob', mortEchecs: 1 });
    const debout = pj('p3', { nom: 'Hyrma', perso: 'p3', uid: 'carol' });
    barre({ combattants: [moi(), allie, debout, goule()], fiches: new Map([['p2', h], ['p3', reelle('Hyrma', 'p3', 'carol')]]) });
    expect(screen.queryByRole('button', { name: 'Relever Hyrma' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Relever Hermione' }));
    expect(attaques.releverAllie).toHaveBeenCalledWith('c1', expect.anything(), expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'pj-p2' }), h, k().nom);
  });

  it('boire une potion, l’action secondaire (9a) ; subir des dégâts, un montant et un type (8a)', async () => {
    const f = k();
    barre({ fiche: f });
    const [cle] = Object.entries(f.inventaire).find(([, o]) => o.id === 'potion_soin_sup')!;
    await fireEvent.click(screen.getByRole('button', { name: /^Boire Potion de soin améliorée/ }));
    expect(attaques.boirePotion).toHaveBeenCalledWith('c1', expect.anything(), expect.objectContaining({ id: 'pj-p1' }), f, cle);
    await screen.findByText('Potion de soin améliorée : 6 PV rendus.');
    await fireEvent.click(screen.getByRole('button', { name: 'Subir des dégâts' }));
    await fireEvent.input(screen.getByLabelText('Dégâts bruts'), { target: { value: '7' } });
    await fireEvent.change(screen.getByLabelText('Type de dégâts'), { target: { value: 'magique' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(attaques.subirDegats).toHaveBeenCalledWith(f, 7, 'magique');
    await screen.findByText('5 dégâts subis : 15 PV.');
  });

  it('secondaire prise : plus de potion ce tour', () => {
    barre({ moi: moi({ tourActions: 6, secondaire: true }) });
    expect((screen.getByRole('button', { name: /^Boire / }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('MJ : le monstre attaque un PJ choisi, contre sa CA ; portée vérifiée, le MJ passe outre (6a, 4a)', async () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [k()];
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', init: 3, pv: 14, def: 13, attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, bonusDegats: 2, effetSpecial: null }] }];
    armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] };
    persos.elements = [k(), { ...reelle('Hermione', 'p2', 'bob'), pvActuel: 0 }];
    combattants.elements = [goule(), moi(), pj('p2', { nom: 'Hermione', perso: 'p2', uid: 'bob', mortEchecs: 3, mort: true })];
    render(PanneauCombat, { props: { carte: carte(6) } });
    const ca = vueFiche(k()).stats.ca;
    const cibles = screen.getByLabelText('Cible') as HTMLSelectElement;
    expect(cibles.options).toHaveLength(1); // Hermione, morte, n'est plus une cible
    expect(cibles.options[0]!.textContent).toMatch(new RegExp(`^Kargash · CA ${ca}`));
    const bouton = screen.getByRole('button', { name: 'Griffes +4 · 1d6+2' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(screen.getByText('pas au contact (4 cases)')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Passer outre la portée'));
    expect(bouton.disabled).toBe(false);
    await fireEvent.click(bouton);
    expect(attaques.attaqueDeMonstre).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ tour: 6 }),
      expect.objectContaining({ id: 'm-r1-a' }),
      { nom: 'Griffes', bonus: 4, formule: '1d6+2', typeDegats: 'physique', portee: { min: 0, max: 1, vue: false }, seuilCritique: 20 },
      expect.objectContaining({ id: 'pj-p1' }),
      expect.objectContaining({ id: 'p1' }),
    );
    await screen.findByText('Griffes : touché, 5 dégâts → Kargash corde d’or 15 PV.'.replace('’', "'"));
  });

  it('MJ : l’action principale du monstre prise, plus d’attaque ; un PJ Mourant est dit', () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [{ ...k(), pvActuel: 0 }];
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', init: 3, pv: 14, def: 13, attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }] }];
    armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] };
    combattants.elements = [goule({ tourActions: 6, principale: true }), moi({ mortSucces: 2 })];
    render(PanneauCombat);
    expect((screen.getByRole('button', { name: 'Griffes +4 · 1d6' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Action principale prise ce tour.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Les PJ du combat' })).getByText(/^Mourant 2✓ 0✗/)).toBeTruthy();
  });

  it('MJ : portées libres ; le jeton d’un monstre tombé suit ; les jets de mort d’un PJ relevé repartent de zéro', async () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    persos.elements = [k()];
    jetonsScene.elements = [
      { id: 'm-r1-a', genre: 'monstre', nom: 'Goule A', couleur: '#c0392b', cx: 5, cy: 5, proprietaire: null, creeLe: 1 },
      { id: 'm-r1-b', genre: 'monstre', nom: 'Goule B', couleur: '#c0392b', cx: 6, cy: 5, proprietaire: null, creeLe: 1, mort: true },
      { id: 'm-r1-c', genre: 'monstre', nom: 'Goule C', couleur: '#c0392b', cx: 7, cy: 5, proprietaire: null, creeLe: 1 },
    ];
    combattants.elements = [goule({ pv: 0, aTerre: true }), monstre('b', { pv: 0, aTerre: true }), monstre('c'), moi({ mortSucces: 1, mortEchecs: 2 })];
    render(CombatMj);
    await waitFor(() => expect(actionsCarte.marquerMort).toHaveBeenCalledWith('cave', 'm-r1-a', true));
    await waitFor(() => expect(attaques.remettreJetsDeMort).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'pj-p1' })));
    // La liste bouge avant que les écritures soient lues : rien n'est écrit deux fois.
    combattants.elements = [...combattants.elements];
    flushSync();
    await new Promise((r) => setTimeout(r, 20));
    expect(actionsCarte.marquerMort).toHaveBeenCalledTimes(1);
    expect(attaques.remettreJetsDeMort).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByLabelText(/^Portées libres/));
    expect(actions.basculerPortees).toHaveBeenCalledWith('c1', true);
  });

  it('MJ : décocher les portées libres', async () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'pj-p1', porteesLibres: true });
    combattants.elements = [moi()];
    render(CombatMj);
    await fireEvent.click(screen.getByLabelText(/^Portées libres/));
    expect(actions.basculerPortees).toHaveBeenCalledWith('c1', false);
  });

  it('le joueur en combat : la barre lit la carte de la table pour les portées', async () => {
    session.uid = 'alice';
    persos.elements = [k()];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' }];
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    combattants.elements = [moi(), goule()];
    carteFaux.valeur = carte(9);
    render(CombatJoueur);
    expect(await screen.findByText(/pas au contact \(7 cases\)/)).toBeTruthy();
  });

  it('l’ordre : un PJ Mourant garde sa place, un PJ mort est dit mort', () => {
    render(OrdreCombat, {
      props: {
        role: 'joueur', idCombat: 'c1', combat: combat({ actif: 'm-r1-a' }),
        combattants: [goule(), moi({ mortSucces: 1, mortEchecs: 1 }), pj('p2', { nom: 'Hermione', initiative: 5, de: 4, mortEchecs: 3, mort: true })],
        aTerre: new Set(['pj-p2']), pvPj: new Map([['pj-p1', { actuel: 0, max: 20 }], ['pj-p2', { actuel: 0, max: 29 }]]),
      },
    });
    const items = within(screen.getByRole('list')).getAllByRole('listitem').map((l) => l.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['15 Goule A · joue 9/14', '11 Kargash Mourant 1✓ 1✗', '5 Hermione mort']);
  });
});
