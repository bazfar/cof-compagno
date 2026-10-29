import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — concentration et invocations (lot L6.4b2,
 * décisions de Thomas du 24/10/2026) : la concentration dans la barre (1a)
 * et dans le panneau du MJ (rompre, sauvegarde de CON quand un monstre
 * touche) ; poser une créature d'un clic (4a) ; la barre de l'invocation à
 * son tour (14a, 7a) ; les monstres la visent (10a) ; le client du MJ fait
 * payer maintien et Remous (2a, 15a), retire une invocation à 0 PV (9a) et
 * ses jetons à la clôture.
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
  attaqueSurInvocation: vi.fn(async (..._a: unknown[]) => ({ issue: { de: 12, bonus: 4, total: 16, def: 15, touche: true, critique: false, echecCritique: false }, net: 6, pv: 21 })),
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
const inv = vi.hoisted(() => ({
  COULEUR_INVOCATION: '#8e44ad',
  placementPermis: vi.fn((..._a: unknown[]) => null as string | null),
  poserInvocation: vi.fn(async (..._a: unknown[]) => {}),
  retirerInvocations: vi.fn(async (..._a: unknown[]) => {}),
  finirConcentration: vi.fn(async (..._a: unknown[]) => {}),
  rompreParAttaque: vi.fn(async (..._a: unknown[]) => 0),
  maintenirConcentration: vi.fn(async (..._a: unknown[]) => true),
  payerDebutDeTour: vi.fn(async (..._a: unknown[]) => 0),
  attaqueDInvocation: vi.fn(async (..._a: unknown[]) => ({ issue: { de: 15, bonus: 7, total: 22, def: 13, touche: true, critique: false, echecCritique: false }, net: 6 })),
  capaciteDInvocation: vi.fn(async (..._a: unknown[]) => '+2 prochain jet'),
}));
vi.mock('../../src/lib/actions/invocations', () => inv);
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
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { default: CombatMj } = await import('../../src/composants/CombatMj.svelte');
const { viseeCarte } = await import('../../src/lib/combat/visee.svelte');
const { default: BarreInvocation } = await import('../../src/composants/BarreInvocation.svelte');
const { default: CombatJoueur } = await import('../../src/composants/CombatJoueur.svelte');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type EtatCombat = import('../../src/lib/schemas/combat').EtatCombat;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const neutre = { physique: 1, magique: 1 };
const base = { modInit: 1, de: 10, pv: null as number | null, pvMax: null as number | null, aTerre: false, mvtBase: 5, def: null as number | null, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as EtatCombat[], usages: {} as Record<string, number>, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, monstre: null as string | null };
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
  zonesCombat.elements = [];
  faux.bestiaire.elements = [];
  Object.values(inv).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as { mockClear: () => void }).mockClear());
  Object.values(attaques).forEach((f) => f.mockClear());
  Object.values(zonesActions).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as { mockClear: () => void }).mockClear());
});

const tison = (c: Partial<Combattant & { id: string }> = {}) => ({
  ...base, id: 'i-p1-t3-1', genre: 'invocation' as const, nom: 'Tison', perso: null, uid: 'alice', modInit: 2, initiative: 13 as number | null, pv: 27, pvMax: 27, def: 15, mvtBase: 6, maitre: 'pj-p1',
  invocation: { creature: 'serviteur.feu', element: 'feu', attaque: { bonus: 7, des: '1d8+3', typeDegats: 'feu' }, objet: false, remous: 1, rounds: null, lancer: 't3' }, ...c,
});
const conc = (c: Record<string, unknown> = {}) => ({ action: 'enchantement.fascination', nom: 'Fascination', lancer: 't3', maintien: 1, rupture: ['cibleAttaquee', 'lanceurSurpris', 'autreConcentration'], rounds: null, etats: [{ cible: 'm-r1-a', etat: 'fascine' }], zone: null, invocations: [], ...c });
const legion = { creature: 'embrun', nom: 'Embrun', element: null, ids: ['i-p1-t6-1', 'i-p1-t6-2'], rounds: 3, portee: 6, maitre: { niveau: 9, modMagie: 3, attaqueMagique: 7, def: 14, pvActuel: 31, modInit: 2 }, de: 11, lancer: 't6' };

describe('la concentration et les créatures appelées dans la barre (1a, 4a)', () => {
  it('1a : sa concentration s’affiche ; à son tour, il y met fin', async () => {
    const moi = pj('p1', { nom: 'Shyrion', concentration: conc({ rounds: 2 }) as never });
    const vue = barre({ moi, combattants: [moi, goule()] });
    expect(screen.getByText('Fascination (2) · 1 PP par round')).toBeTruthy();
    await fireEvent.click(bouton('y mettre fin'));
    await screen.findByText('Concentration terminée.');
    expect(inv.finirConcentration).toHaveBeenCalledWith('c1', 'cave', moi, [moi, goule()], 'il y met fin', 'Shyrion');
    vue.unmount();
    barre({ moi, combattants: [moi, goule()], combat: combat({ actif: 'm-r1-a' }) });
    expect(screen.queryByRole('button', { name: 'y mettre fin' })).toBeNull();
  });

  it('1a : une attaque d’arme contre la cible d’une concentration la fait rompre', async () => {
    barre();
    await fireEvent.click(screen.getAllByRole('button', { name: /^Contact/ })[0]!);
    await waitFor(() => expect(inv.rompreParAttaque).toHaveBeenCalledWith('c1', 'cave', 'm-r1-a', expect.any(Array), 'Shyrion'));
  });

  it('4a : les créatures appelées se posent d’un clic, une à une ; le lancer attend', async () => {
    sortsCombat.lancerSortEnCombat.mockResolvedValueOnce({ issue: 'reussi', texte: 'Légion I lancé.', aPlacer: [], aInvoquer: [legion] as never });
    barre();
    await fireEvent.change(screen.getByLabelText('Sort ou capacité'), { target: { value: 'mineur.lumiere' } });
    await fireEvent.click(bouton('Lancer Lumière'));
    await screen.findByText('Légion I lancé. Clique sur la carte la case où paraît Embrun (6 cases au plus).');
    expect(screen.getByText('Place Embrun : clique une case libre (6 cases au plus).')).toBeTruthy();
    expect(bouton('Lancer Lumière').disabled).toBe(true);
    inv.placementPermis.mockReturnValueOnce('case prise');
    expect(viseeCarte.v!.apercu({ cx: 3, cy: 2 })).toEqual({ cases: [{ cx: 3, cy: 2 }], jetons: [], refus: 'case prise' });
    expect(inv.placementPermis).toHaveBeenCalledWith(carte.scene, carte.jetons, 'pj-p1', { cx: 3, cy: 2 }, 6);
    viseeCarte.v!.choisir({ cx: 4, cy: 2 }, null);
    await screen.findByText('Embrun paraît.');
    expect(inv.poserInvocation).toHaveBeenCalledWith('c1', combat(), expect.objectContaining({ id: 'pj-p1' }), legion, 'i-p1-t6-1', { cx: 4, cy: 2 }, carte);
    viseeCarte.v!.choisir({ cx: 5, cy: 2 }, null);
    await waitFor(() => expect(inv.poserInvocation).toHaveBeenLastCalledWith('c1', combat(), expect.anything(), legion, 'i-p1-t6-2', { cx: 5, cy: 2 }, carte));
    await waitFor(() => expect(viseeCarte.v).toBeNull());
    expect(bouton('Lancer Lumière').disabled).toBe(false);
  });
});

describe('le tour de l’invocation (14a, 7a)', () => {
  const tour = (o: Record<string, unknown> = {}) =>
    render(BarreInvocation, { props: { inv: tison(), idCombat: 'c1', combat: combat({ actif: 'i-p1-t3-1' }), combattants: [pj('p1', { nom: 'Shyrion' }), tison(), goule()], fiches: new Map(), carte: { ...carte, jetons: [...carte.jetons, { id: 'i-p1-t3-1', genre: 'invocation' as const, cx: 4, cy: 2 }] }, ...o } as never });

  it('ses PV, sa DEF, ses cases ; elle attaque un monstre au contact ; l’attaque rompt la concentration qui tient la cible', async () => {
    tour();
    expect(screen.getByText('Tour de Tison')).toBeTruthy();
    expect(screen.getByText('PV 27/27')).toBeTruthy();
    expect(screen.getByText('DEF 15')).toBeTruthy();
    await fireEvent.click(bouton('Attaquer · +7 · 1d8+3'));
    await screen.findByText('Touché : 6 dégâts à Goule A.');
    expect(inv.attaqueDInvocation).toHaveBeenCalledWith('c1', combat({ actif: 'i-p1-t3-1' }), tison(), goule(), Math.random, 0);
    expect(inv.rompreParAttaque).toHaveBeenCalledWith('c1', 'cave', 'm-r1-a', expect.any(Array), 'Tison');
  });

  it('hors de portée, ou l’action prise : l’attaque est refusée ; un raté se dit', async () => {
    const loin = { ...carte, jetons: [...carte.jetons, { id: 'i-p1-t3-1', genre: 'invocation' as const, cx: 8, cy: 2 }] };
    const v = tour({ carte: loin });
    expect(bouton('Attaquer · +7 · 1d8+3').disabled).toBe(true);
    expect(screen.getByText('pas au contact (5 cases).')).toBeTruthy();
    v.unmount();
    const w = tour({ carte: loin, combat: combat({ actif: 'i-p1-t3-1', porteesLibres: true }) });
    expect(bouton('Attaquer · +7 · 1d8+3').disabled).toBe(false);
    w.unmount();
    tour({ inv: tison({ tourActions: 6, principale: true }) });
    expect(bouton('Attaquer · +7 · 1d8+3').disabled).toBe(true);
    expect(screen.getByText('Action principale prise ce tour.')).toBeTruthy();
  });

  it('un raté', async () => {
    inv.attaqueDInvocation.mockResolvedValueOnce({ issue: { de: 2, bonus: 7, total: 9, def: 13, touche: false, critique: false, echecCritique: false }, net: null as never });
    tour();
    await fireEvent.click(bouton('Attaquer · +7 · 1d8+3'));
    await screen.findByText('Raté : 9 contre DEF 13.');
  });

  it('ses capacités : sur un allié choisi, ou au MJ ; un familier n’attaque pas', async () => {
    const familier = tison({ nom: 'Familier', invocation: { creature: 'familier', element: null, attaque: null, objet: false, remous: 0, rounds: null, lancer: 't3' } as never });
    const p2 = pj('p2', { nom: 'Hermione' });
    tour({ inv: familier, combattants: [pj('p1', { nom: 'Shyrion' }), p2, familier, goule()] });
    expect(screen.queryByRole('button', { name: /^Attaquer/ })).toBeNull();
    await fireEvent.change(screen.getByLabelText('Allié'), { target: { value: 'pj-p2' } });
    await fireEvent.click(bouton('Sur Hermione'));
    await screen.findByText('+2 prochain jet');
    expect(inv.capaciteDInvocation).toHaveBeenCalledWith('c1', expect.anything(), familier, 'Aide', p2, expect.any(Map));
    await fireEvent.click(bouton('Au MJ'));
    expect(inv.capaciteDInvocation).toHaveBeenLastCalledWith('c1', expect.anything(), familier, 'Éclaireur', p2, expect.any(Map));
  });

  it('14a : le joueur voit la barre de son invocation à son tour, au-dessus de la sienne ; pas celle d’un autre', async () => {
    persos.elements = [mage() as never];
    joueurs.elements = [{ id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p1' }];
    combatDoc.donnees = combat({ actif: 'i-p1-t3-1' });
    combattants.elements = [pj('p1', { nom: 'Shyrion' }), tison(), goule()];
    const v = render(CombatJoueur);
    expect(await screen.findByRole('region', { name: 'Tour de Tison' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mon personnage en combat' })).toBeTruthy();
    v.unmount();
    combattants.elements = [pj('p1', { nom: 'Shyrion' }), tison({ uid: 'bob' }), goule()];
    render(CombatJoueur);
    await screen.findByRole('region', { name: 'Mon personnage en combat' });
    expect(screen.queryByRole('region', { name: 'Tour de Tison' })).toBeNull();
  });
});

describe('le MJ (1a, 2a, 9a, 10a, 15a)', () => {
  it('10a : une invocation montre ses chiffres et son maître ; ses monstres la visent', async () => {
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion' }), tison({ invocation: { ...tison().invocation, rounds: 2 } as never })];
    faux.bestiaire.elements = [{ id: 'goule', nom: 'Goule', attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, bonusDegats: 2, effetSpecial: null }] }] as never;
    faux.armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] } as never;
    const v = render(PanneauCombat);
    const cible = screen.getByLabelText('Cible') as HTMLSelectElement;
    expect([...cible.options].map((o) => o.textContent)).toContain('Tison (2) · DEF 15 · 27/27 PV');
    await fireEvent.change(cible, { target: { value: 'i-p1-t3-1' } });
    await fireEvent.click(screen.getByRole('button', { name: /^Griffes/ }));
    await screen.findByText('Griffes : touché, 6 dégâts → Tison 21 PV.');
    expect(attaques.attaqueSurInvocation).toHaveBeenCalledWith('c1', expect.anything(), expect.objectContaining({ id: 'm-r1-a' }), expect.objectContaining({ nom: 'Griffes', defEnPlus: 0 }), expect.objectContaining({ id: 'i-p1-t3-1' }));
    expect(attaques.attaqueDeMonstre).not.toHaveBeenCalled();
    v.unmount();
    combatDoc.donnees = combat({ actif: 'i-p1-t3-1' });
    render(PanneauCombat);
    expect(screen.getByTestId('pv-monstre').textContent).toBe('27/27 PV');
    expect(screen.getByText('Invocation de Shyrion · 2 rounds · Remous 1 PP')).toBeTruthy();
    expect(screen.queryByLabelText('Sauvegarde FOR')).toBeNull();
  });

  it('1a : un PJ touché pendant sa concentration fait sa sauvegarde de CON ; le MJ la rompt d’un bouton', async () => {
    const moi = pj('p1', { nom: 'Shyrion', concentration: conc() as never });
    persos.elements = [mage() as never];
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule(), moi];
    faux.bestiaire.elements = [{ id: 'goule', nom: 'Goule', attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, bonusDegats: 2, effetSpecial: null }] }] as never;
    faux.armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] } as never;
    const v = render(PanneauCombat);
    await fireEvent.click(screen.getByRole('button', { name: /^Griffes/ }));
    await waitFor(() => expect(inv.maintenirConcentration).toHaveBeenCalledWith('c1', 'cave', expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'p1' }), 5, expect.any(Array), 'Goule A'));
    // Raté : pas de jet.
    attaques.attaqueDeMonstre.mockResolvedValueOnce({ issue: { de: 2, bonus: 4, total: 6, def: 16, touche: false, critique: false, echecCritique: false }, net: null as never, pv: 20 });
    inv.maintenirConcentration.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: /^Griffes/ }));
    await screen.findByText(/raté/);
    expect(inv.maintenirConcentration).not.toHaveBeenCalled();
    v.unmount();
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    render(PanneauCombat);
    expect(screen.getByText('Fascination · 1 PP par round')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Rompre' }));
    expect(inv.finirConcentration).toHaveBeenCalledWith('c1', 'cave', expect.objectContaining({ id: 'pj-p1' }), expect.any(Array), 'rompue par le MJ', 'MJ');
  });

  it('2a, 15a : la main arrive au mage : le client du MJ fait payer maintien et Remous, une fois ; 9a : une invocation à 0 PV s’en va ; à la clôture, leurs jetons', async () => {
    session.uid = 'mj';
    persos.elements = [mage() as never];
    const moi = pj('p1', { nom: 'Shyrion' });
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    combattants.elements = [goule(), moi, tison()];
    render(CombatMj);
    await waitFor(() => expect(inv.payerDebutDeTour).toHaveBeenCalledWith('c1', 'cave', expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'p1' }), expect.any(Array)));
    await waitFor(() => expect(attaques.debutDeTour).toHaveBeenCalledTimes(1));
    combattants.elements = [...combattants.elements];
    flushSync();
    expect(inv.payerDebutDeTour).toHaveBeenCalledTimes(1);
    // À 0 PV, une fois.
    combattants.elements = [goule(), { ...moi, debutTour: 6 }, tison({ pv: 0, aTerre: true })];
    flushSync();
    await waitFor(() => expect(inv.retirerInvocations).toHaveBeenCalledWith('c1', 'cave', [expect.objectContaining({ id: 'i-p1-t3-1' })], 'à 0 PV, elles retournent à la Mer', 'MJ'));
    combattants.elements = [...combattants.elements];
    flushSync();
    expect(inv.retirerInvocations).toHaveBeenCalledTimes(1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await fireEvent.click(screen.getByRole('button', { name: /Clore le combat/ }));
    await waitFor(() => expect(actions.cloreCombat).toHaveBeenCalledWith('c1', expect.any(Array), { scene: 'cave', ids: ['i-p1-t3-1'] }));
  });

  it('9a : une invocation abattue à son propre tour finit son tour avant d’être retirée (la main ne reste pas sur elle)', async () => {
    session.uid = 'mj';
    persos.elements = [mage() as never];
    combatDoc.donnees = combat({ actif: 'i-p1-t3-1' });
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion', debutTour: 6 }), tison({ pv: 0, aTerre: true })];
    render(CombatMj);
    await waitFor(() => expect(actions.finirTour).toHaveBeenCalledWith('c1', 'i-p1-t3-1', expect.any(Array), expect.any(Set)));
    await waitFor(() => expect(inv.retirerInvocations).toHaveBeenCalledWith('c1', 'cave', [expect.objectContaining({ id: 'i-p1-t3-1' })], 'à 0 PV, elles retournent à la Mer', 'MJ'));
  });

  it('9a : abattue hors de son tour, elle est retirée sans toucher à la main', async () => {
    session.uid = 'mj';
    persos.elements = [mage() as never];
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion', debutTour: 6 }), tison({ pv: 0, aTerre: true })];
    render(CombatMj);
    await waitFor(() => expect(inv.retirerInvocations).toHaveBeenCalledWith('c1', 'cave', [expect.objectContaining({ id: 'i-p1-t3-1' })], 'à 0 PV, elles retournent à la Mer', 'MJ'));
    expect(actions.finirTour).not.toHaveBeenCalled();
  });

  it('un monstre sans maintien ni Remous ni dégâts par tour : rien à payer', async () => {
    session.uid = 'mj';
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule(), pj('p1'), tison({ maitre: 'pj-p9' })];
    render(CombatMj);
    await screen.findByRole('region', { name: 'Combat en cours' });
    expect(inv.payerDebutDeTour).not.toHaveBeenCalled();
    // Rien à payer, mais le tour se note quand même (correctif du
    // 29/10/2026) : `debutTour` rend sa réaction du round (L6.5b, 7a).
    await waitFor(() => expect(attaques.debutDeTour).toHaveBeenCalledWith('c1', expect.objectContaining({ actif: 'm-r1-a' }), expect.objectContaining({ id: 'm-r1-a' }), null));
    expect(inv.payerDebutDeTour).not.toHaveBeenCalled();
  });
});

describe('ce que montrent les listes (10a, 14a)', () => {
  it('la barre de l’invocation ne propose ni un monstre à terre ou non ciblable, ni un monstre comme allié', () => {
    const tombee = goule({ id: 'm-r1-b', nom: 'Goule B', aTerre: true });
    const cachee = goule({ id: 'm-r1-c', nom: 'Goule C', etats: [{ id: 'invisible', rounds: null, cumul: 1, charges: null, des: null, source: null }] });
    const familier = tison({ nom: 'Familier', invocation: { creature: 'familier', element: null, attaque: { bonus: 7, des: '1d4', typeDegats: 'physique' }, objet: false, remous: 0, rounds: null, lancer: 't3' } as never });
    render(BarreInvocation, { props: { inv: familier, idCombat: 'c1', combat: combat({ actif: 'i-p1-t3-1' }), combattants: [pj('p1', { nom: 'Shyrion' }), familier, goule(), tombee, cachee], fiches: new Map(), carte: null } as never });
    expect([...(screen.getByLabelText('Cible') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Goule A · DEF 13']);
    expect([...(screen.getByLabelText('Allié') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Shyrion']);
  });

  it('l’ordre d’initiative montre les PV d’une invocation', async () => {
    const { default: OrdreCombat } = await import('../../src/composants/OrdreCombat.svelte');
    render(OrdreCombat, { props: { role: 'joueur', idCombat: 'c1', combat: combat({ actif: 'm-r1-a' }), combattants: [goule(), tison({ pv: 20 })], aTerre: new Set(), pvPj: new Map() } as never });
    expect(screen.getByText('20/27')).toBeTruthy();
  });

  it('le client du MJ : des dégâts par tour sans maintien ni Remous : rien à payer ; une invocation debout ne s’en va pas', async () => {
    session.uid = 'mj';
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule({ etats: [{ id: 'saignement', rounds: 2, cumul: 1, charges: null, des: null, source: null }] }), pj('p1'), tison()];
    render(CombatMj);
    await waitFor(() => expect(attaques.debutDeTour).toHaveBeenCalledTimes(1));
    expect(inv.payerDebutDeTour).not.toHaveBeenCalled();
    expect(inv.retirerInvocations).not.toHaveBeenCalled();
  });
});
