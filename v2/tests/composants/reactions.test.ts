import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — les réactions (lot L6.5b, décisions de Thomas du
 * 26/10/2026) : le bloc « Réactions » de la barre, hors de son tour (6a),
 * sa cible, sa posture, la case d'un bond sur la carte (6b) ; l'attaque
 * d'opportunité ouverte (10a) ; une réaction par round (7a) ; ce qu'il en
 * est advenu ; côté MJ, la demande jouée d'office (1a), l'opportunité
 * d'un monstre (5a) et le rappel avant l'attaque (6a).
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
const reactionsActions = vi.hoisted(() => ({
  demanderReaction: vi.fn(async (..._a: unknown[]) => {}),
  jouerReaction: vi.fn(async (..._a: unknown[]) => 'jouée'),
  opportuniteDeMonstre: vi.fn(async (..._a: unknown[]) => 'Opportunité de Goule A sur Shyrion : Griffes : raté.'),
  signalerOpportunites: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('../../src/lib/actions/reactions', () => reactionsActions);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);
vi.mock('../../src/lib/magasins/rencontres.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRencontres);
vi.mock('../../src/lib/magasins/portraits-jetons.svelte', () => ({ suivrePortraitsJetons: () => ({ images: {}, suivre: () => {}, arreter: () => {} }) }));
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));

const faux = await import('./faux-magasins.svelte');
const { table, persos, combatDoc, combattants, jetonsScene, joueurs, zonesCombat, reactions, opportunites, bestiaire, armesBestiaire } = faux;
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const F = await import('../../src/lib/fiche/refonte');
const { classeParId } = await import('../../src/regles');
const { default: BarreCombat } = await import('../../src/composants/BarreCombat.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
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
  Object.values(reactionsActions).forEach((f) => f.mockClear());
  reactions.elements = [];
  opportunites.elements = [];
  bestiaire.elements = [];
  armesBestiaire.donnees = null;
  Object.values(attaques).forEach((f) => f.mockClear());
  Object.values(zonesActions).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as { mockClear: () => void }).mockClear());
});


/** Un personnage de la refonte au niveau 9. */
const pjN = (nom: string, classe: string, choix: Record<string, unknown>) => {
  const f = { ...v1(nom, 'p1', 'alice'), classe, niveau: 9 };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, 9), ...choix } as never), id: 'p1', ppActuel: 30 };
};
const guerrier = () => pjN('Karlach', 'guerrier', { rangs: { 'guerrier.soldat': 5, 'guerrier.peuple': 1 } });
const barde = () => pjN('Shyrion', 'barde', { rangs: { 'barde.spectacle': 5 } });
/** Dans le bloc « Réactions » (la barre a aussi ses sorts, et la posture de combat). */
const dans = () => within(screen.getByRole('group', { name: 'Réactions' }));
const choisir = (label: string, value: string | number) => fireEvent.change(dans().getByLabelText(label), { target: { value } });
const saisir = (label: string, value: number) => fireEvent.input(dans().getByLabelText(label), { target: { value } });
const horsTour = combat({ actif: 'm-r1-a' });
const reactionsDe = (o: Record<string, unknown> = {}) => barre({ fiche: guerrier(), combat: horsTour, ...o });
const demande = () => reactionsActions.demanderReaction.mock.calls.at(-1)!;
const bloc = () => screen.queryByRole('heading', { name: 'Réactions' });

describe('le bloc « Réactions » de la barre (6a, 7a)', () => {
  it('hors de son tour, debout, avec une fiche de la refonte seulement', () => {
    const r = barre({ fiche: guerrier() });
    expect(bloc()).toBeNull();
    r.unmount();
    const r2 = reactionsDe();
    expect(bloc()).toBeTruthy();
    expect(screen.getByText('Réaction du round : libre.')).toBeTruthy();
    r2.unmount();
    const r3 = reactionsDe({ fiche: { ...guerrier(), pvActuel: 0 } });
    expect(bloc()).toBeNull();
    r3.unmount();
    barre({ fiche: v1('Shyrion', 'p1', 'alice'), combat: horsTour });
    expect(bloc()).toBeNull();
  });

  it('Riposte : la cible ennemie exigée, puis la demande ; l’opportunité n’est pas dans la liste', async () => {
    reactionsDe({ combattants: [pj('p1', { nom: 'Shyrion' }), goule(), goule({ id: 'm-r1-b', nom: 'Goule B', aTerre: true }), pj('p2', { nom: 'Hermione' })] });
    const liste = screen.getByLabelText('Réaction') as HTMLSelectElement;
    expect([...liste.options].map((o) => o.textContent)).toEqual(['Changement de posture', 'Riposte']);
    await choisir('Réaction', 'guerrier.riposte');
    const cibles = screen.getByLabelText('Cible de la réaction') as HTMLSelectElement;
    expect([...cibles.options].map((o) => o.textContent)).toEqual(['—', 'Goule A']);
    expect(bouton('Réagir : Riposte').disabled).toBe(true);
    expect(screen.getByText('Pour réagir : choisis la cible.')).toBeTruthy();
    await choisir('Cible de la réaction', 'm-r1-a');
    expect(screen.queryByText(/^Pour réagir/)).toBeNull();
    await fireEvent.click(bouton('Réagir : Riposte'));
    expect(demande()).toEqual(['c1', horsTour, expect.objectContaining({ id: 'pj-p1' }), { reaction: 'guerrier.riposte', cible: 'm-r1-a', case: null, posture: null, opportunite: null }]);
  });

  it('Changement de posture : les deux axes et la valeur (1 à son rang), sans cible ; une autre réaction oublie ces choix', async () => {
    reactionsDe();
    expect(dans().getByText('1 à 5')).toBeTruthy();
    expect(screen.queryByLabelText('Cible de la réaction')).toBeNull();
    expect(screen.getByText('Pour réagir : choisis la posture.')).toBeTruthy();
    await choisir('Axe en bonus', 'degats');
    await saisir('Valeur de la posture', 3);
    expect(bouton('Réagir : Changement de posture').disabled).toBe(true);
    await choisir('Axe en malus', 'DEF');
    await fireEvent.click(bouton('Réagir : Changement de posture'));
    expect(demande()[3]).toEqual({ reaction: 'guerrier.changement-de-posture', cible: null, case: null, posture: { plus: 'degats', moins: 'DEF', valeur: 3 }, opportunite: null });
    await choisir('Réaction', 'guerrier.riposte');
    await choisir('Réaction', 'guerrier.changement-de-posture');
    expect((dans().getByLabelText('Axe en bonus') as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Pour réagir : choisis la posture.')).toBeTruthy();
  });

  it('10a : l’opportunité ouverte sur lui, ce tour, est un bouton', async () => {
    opportunites.elements = [
      { id: 't6-pj-p1-m-r1-a', attaquant: 'pj-p1', cible: 'm-r1-a', tour: 6, creeLe: 1 },
      { id: 't5-pj-p1-m-r1-a', attaquant: 'pj-p1', cible: 'm-r1-a', tour: 5, creeLe: 1 },
      { id: 't6-pj-p2-m-r1-a', attaquant: 'pj-p2', cible: 'm-r1-a', tour: 6, creeLe: 1 },
    ];
    reactionsDe();
    expect(screen.getAllByRole('button', { name: /^Attaque d’opportunité/ })).toHaveLength(1);
    await fireEvent.click(bouton('Attaque d’opportunité sur Goule A'));
    expect(demande()[3]).toEqual({ reaction: 'arme.opportunite', cible: 'm-r1-a', case: null, posture: null, opportunite: 't6-pj-p1-m-r1-a' });
  });

  it('7a : une réaction sans choix à faire attend aussi la réaction du round, et la demande en cours', async () => {
    const r = reactionsDe({ fiche: barde(), moi: pj('p1', { nom: 'Shyrion', usages: { reaction: 6 }, debutTour: 2 }) });
    await choisir('Réaction', 'barde.echappee');
    expect(bouton('Réagir : Échappée').disabled).toBe(true);
    r.unmount();
    reactions.elements = [{ id: 'r1', qui: 'pj-p1', uid: 'alice', reaction: 'barde.relance', cible: null, case: null, posture: null, opportunite: null, tour: 6, statut: 'attente', texte: null, creeLe: 2 }];
    reactionsDe({ fiche: barde() });
    await choisir('Réaction', 'barde.echappee');
    expect(bouton('Réagir : Échappée').disabled).toBe(true);
    reactions.elements = [];
    flushSync();
    expect(bouton('Réagir : Échappée').disabled).toBe(false);
  });

  it('7a : sa réaction prise, tout attend son tour ; une demande en cours aussi ; ce qu’il en est advenu', async () => {
    opportunites.elements = [{ id: 'o', attaquant: 'pj-p1', cible: 'm-r1-a', tour: 6, creeLe: 1 }];
    const r = reactionsDe({ moi: pj('p1', { nom: 'Shyrion', usages: { reaction: 6 }, debutTour: 2 }) });
    expect(screen.getByText('Réaction du round prise : elle revient au début de ton tour.')).toBeTruthy();
    expect(bouton('Attaque d’opportunité sur Goule A').disabled).toBe(true);
    expect(bouton('Réagir : Changement de posture').disabled).toBe(true);
    r.unmount();
    const d = (c: Record<string, unknown>) => ({ id: 'r1', qui: 'pj-p1', uid: 'alice', reaction: 'guerrier.riposte', cible: 'm-r1-a', case: null, posture: null, opportunite: null, tour: 6, statut: 'attente', texte: null, creeLe: 2, ...c });
    reactions.elements = [d({}), d({ id: 'r0', statut: 'jouee', texte: 'Ancienne', creeLe: 1 }), d({ id: 'r9', uid: 'bob', creeLe: 9, statut: 'jouee', texte: 'Pas la sienne' }), d({ id: 'r8', tour: 5, creeLe: 8, statut: 'jouee', texte: 'Un autre tour' })];
    reactionsDe();
    expect(screen.getByText('Demandée : le MJ la joue…')).toBeTruthy();
    expect(bouton('Attaque d’opportunité sur Goule A').disabled).toBe(true);
    reactions.elements = [d({ statut: 'refusee', texte: 'Trop tard : le tour a passé.' })];
    flushSync();
    expect(screen.getByText('Refusée : Trop tard : le tour a passé.')).toBeTruthy();
    expect(bouton('Attaque d’opportunité sur Goule A').disabled).toBe(false);
    reactions.elements = [d({ statut: 'jouee', texte: 'Riposte : Riposte I lancé.' })];
    flushSync();
    expect(screen.getByText('Riposte : Riposte I lancé.')).toBeTruthy();
    reactions.elements = [d({ statut: 'jouee', texte: null })];
    flushSync();
    expect(screen.getByText('Jouée.')).toBeTruthy();
  });

  it('un refus de l’app se lit dans la barre', async () => {
    reactionsActions.demanderReaction.mockRejectedValueOnce(new actions.RefusCombat('Tu as déjà réagi ce round.'));
    opportunites.elements = [{ id: 'o', attaquant: 'pj-p1', cible: 'm-r1-a', tour: 6, creeLe: 1 }];
    reactionsDe();
    await fireEvent.click(bouton('Attaque d’opportunité sur Goule A'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Tu as déjà réagi ce round.');
  });

  it('6b : le bond se pose sur une case de la carte, à 2 cases au plus, libre ; le coût et la limite se lisent', async () => {
    reactionsDe({ fiche: barde() });
    await choisir('Réaction', 'barde.esquive-acrobatique');
    expect(screen.getByText('Pour réagir : choisis la case du bond.')).toBeTruthy();
    expect(viseeCarte.v).toBeNull();
    await fireEvent.click(bouton('Choisir la case'));
    const v = viseeCarte.v!;
    expect(v.fixe).toEqual({ cases: [], jetons: ['pj-p1'] });
    expect(v.apercu({ cx: 9, cy: 9 }).refus).toBeTruthy();
    expect(v.apercu({ cx: 2, cy: 4 })).toEqual({ cases: [{ cx: 2, cy: 4 }], jetons: ['pj-p1'], refus: null });
    v.choisir({ cx: 9, cy: 9 }, null);
    v.choisir({ cx: 3, cy: 2 }, 'm-r1-a');
    flushSync();
    expect(screen.queryByTestId('case-bond')).toBeNull();
    v.choisir({ cx: 2, cy: 4 }, null);
    flushSync();
    expect(screen.getByTestId('case-bond').textContent).toBe('Case 3, 5');
    expect(viseeCarte.v).toBeNull();
    await fireEvent.click(bouton('Réagir : Esquive acrobatique'));
    expect(demande()[3]).toEqual({ reaction: 'barde.esquive-acrobatique', cible: null, case: { cx: 2, cy: 4 }, posture: null, opportunite: null });
    // Le coût de la relance, la limite de l'Échappée, déjà servie.
    await choisir('Réaction', 'barde.relance');
    expect(screen.getByTestId('cout-reaction').textContent).toBe('1 Inspiration');
    await choisir('Réaction', 'barde.echappee');
    expect(screen.getByText('1×/combat')).toBeTruthy();
    expect(bouton('Réagir : Échappée').disabled).toBe(false);
  });

  it('une réaction déjà servie (limite des données) attend ; une « 1× par round » revient au round suivant', async () => {
    reactionsDe({ fiche: barde(), moi: pj('p1', { nom: 'Shyrion', usages: { 'barde.echappee': 1 } }) });
    await choisir('Réaction', 'barde.echappee');
    expect(bouton('Réagir : Échappée').disabled).toBe(true);
    expect(screen.getByText('Échappée a déjà servi.')).toBeTruthy();
  });

  it('« 1× par round » : servie ce round, elle attend ; au round suivant, non', async () => {
    const r = reactionsDe({ moi: pj('p1', { nom: 'Shyrion', usages: { 'guerrier.changement-de-posture': 2 } }) });
    expect(screen.getByText('Changement de posture a déjà servi.')).toBeTruthy();
    r.unmount();
    reactionsDe({ moi: pj('p1', { nom: 'Shyrion', usages: { 'guerrier.changement-de-posture': 1 } }) });
    expect(screen.queryByText('Changement de posture a déjà servi.')).toBeNull();
  });
});

describe('le MJ (1a, 5a, 6a)', () => {
  const mageAbj = () => ({ ...pjN('Shyrion', 'magicien', { ecole: 'abjuration', elementDepart: 'feu', rangs: { 'magicien.ecole': 3, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] }) });
  const enCombat = () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [mageAbj()];
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', capacitesSpeciales: [], race: ['mort-vivant'], dangerosite: 2, taille: 'moyenne', boss: false, init: 3, pv: 14, def: 13, attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }] }];
    armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] };
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion' })];
  };
  const d = (c: Record<string, unknown> = {}) => ({ id: 'r1', qui: 'pj-p1', uid: 'alice', reaction: 'abjuration.bouclier', cible: 'pj-p1', case: null, posture: null, opportunite: null, tour: 6, statut: 'attente', texte: null, creeLe: 2, ...c });

  it('son client joue chaque demande en attente, une fois ; la liste dit ce qu’il en est advenu', async () => {
    enCombat();
    reactions.elements = [d(), d({ id: 'r2', statut: 'jouee', texte: 'Bouclier : lancé.', creeLe: 1 }), d({ id: 'r3', statut: 'refusee', texte: 'Trop tard.', creeLe: 0 }), d({ id: 'r4', statut: 'jouee', tour: 5, texte: 'Avant' })];
    render(PanneauCombat, { props: { carte } });
    await waitFor(() => expect(reactionsActions.jouerReaction).toHaveBeenCalledTimes(1));
    const [id, cb, dem, ctx] = reactionsActions.jouerReaction.mock.calls[0]! as [string, { tour: number }, { id: string }, { combattants: { id: string }[]; fiches: Map<string, unknown>; carte: unknown; opportunites: unknown[] }];
    expect([id, cb.tour, dem.id]).toEqual(['c1', 6, 'r1']);
    expect(ctx.combattants.map((c) => c.id)).toEqual(['m-r1-a', 'pj-p1']);
    expect([...ctx.fiches.keys()]).toEqual(['p1']);
    expect(ctx.carte).toBe(carte);
    // L6.7b (8a) : sans jauge, pas de Remous ; la jauge du lieu part avec le combat.
    expect(cb).toMatchObject({ remous: null });
    combattants.elements = [...combattants.elements];
    flushSync();
    expect(reactionsActions.jouerReaction).toHaveBeenCalledTimes(1);
    const liste = screen.getByRole('list', { name: 'Demandes de réaction' });
    expect([...liste.querySelectorAll('li')].map((li) => li.textContent?.trim().replace(/\s+/g, ' '))).toEqual(['Shyrion en cours…', 'Shyrion Bouclier : lancé.', 'Shyrion refusée : Trop tard.']);
    // Un combat clos ne joue plus.
    reactions.elements = [d({ id: 'r5' })];
    combatDoc.donnees = combat({ actif: 'm-r1-a', statut: 'clos' });
    flushSync();
    expect(reactionsActions.jouerReaction).toHaveBeenCalledTimes(1);
  });

  it('L6.7b (8a) : la jauge du lieu part avec la réaction', async () => {
    enCombat();
    faux.remousDoc.donnees = { total: 100, membrane: 'epaisse', contributions: {} };
    reactions.elements = [d()];
    render(PanneauCombat, { props: { carte } });
    await waitFor(() => expect(reactionsActions.jouerReaction).toHaveBeenCalledTimes(1));
    expect(reactionsActions.jouerReaction.mock.calls[0]![1]).toMatchObject({ tour: 6, remous: { total: 100 } });
    faux.remousDoc.donnees = null;
  });

  it('5a : l’opportunité d’un monstre, d’un bouton ; celle d’un PJ se dit ; un monstre sans bestiaire, non', async () => {
    enCombat();
    opportunites.elements = [
      { id: 'o1', attaquant: 'm-r1-a', cible: 'pj-p1', tour: 6, creeLe: 1 },
      { id: 'o2', attaquant: 'pj-p1', cible: 'm-r1-a', tour: 6, creeLe: 1 },
      { id: 'o3', attaquant: 'm-r1-a', cible: 'pj-p1', tour: 5, creeLe: 1 },
      // Un attaquant qui n'est plus du combat : rien.
      { id: 'o5', attaquant: 'm-r1-z', cible: 'pj-p1', tour: 6, creeLe: 1 },
    ];
    render(PanneauCombat, { props: { carte } });
    expect(screen.getByText('Shyrion peut frapper Goule A d’opportunité.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Opportunité/ })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Opportunité : Goule A sur Shyrion' }));
    const args = reactionsActions.opportuniteDeMonstre.mock.calls[0]! as unknown[];
    expect(args.slice(0, 5)).toEqual(['c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'o1' }), expect.objectContaining({ id: 'm-r1-a' }), expect.objectContaining({ id: 'pj-p1' })]);
    expect(args[5]).toEqual([{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }]);
    expect((args[6] as Map<string, unknown>).has('griffes')).toBe(true);
    expect(args[7]).toEqual(expect.objectContaining({ id: 'p1' }));
    expect((args[8] as { id: string }[]).map((c) => c.id)).toEqual(['m-r1-a', 'pj-p1']);
    expect(await screen.findByText('Opportunité de Goule A sur Shyrion : Griffes : raté.')).toBeTruthy();
    bestiaire.elements = [];
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: 'Opportunité : Goule A sur Shyrion' }));
    expect(await screen.findByText('Goule A : pas de fiche de bestiaire, son attaque se joue au journal.')).toBeTruthy();
    expect(reactionsActions.opportuniteDeMonstre).toHaveBeenCalledTimes(1);
  });

  it('un refus de l’app sur l’opportunité se lit ; une invocation n’a pas de fiche', async () => {
    enCombat();
    reactionsActions.opportuniteDeMonstre.mockRejectedValueOnce(new actions.RefusCombat('Cette attaque d’opportunité n’est plus ouverte.'));
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion' }), { ...pj('inv', { nom: 'Tison', genre: 'invocation', perso: null }), id: 'i-p1-t2-1' }];
    opportunites.elements = [{ id: 'o4', attaquant: 'm-r1-a', cible: 'i-p1-t2-1', tour: 6, creeLe: 1 }];
    render(PanneauCombat, { props: { carte } });
    await fireEvent.click(screen.getByRole('button', { name: 'Opportunité : Goule A sur Tison' }));
    expect(await screen.findByText('Cette attaque d’opportunité n’est plus ouverte.')).toBeTruthy();
    expect((reactionsActions.opportuniteDeMonstre.mock.calls[0]! as unknown[])[7]).toBeNull();
  });

  it('6a : avant l’attaque du monstre, les réactions que la cible et ses alliés peuvent jouer', () => {
    enCombat();
    render(PanneauCombat, { props: { carte } });
    expect(screen.getByRole('note', { name: 'Réactions possibles' }).textContent?.trim()).toBe('Avant l’attaque, ils peuvent réagir : Shyrion (Bouclier).');
  });

  it('sans réaction à jouer, pas de rappel ; un PJ choisi, pas de rappel', async () => {
    enCombat();
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion', usages: { reaction: 6 } })];
    const r = render(PanneauCombat, { props: { carte } });
    expect(screen.queryByRole('note')).toBeNull();
    r.unmount();
    combattants.elements = [goule(), pj('p1', { nom: 'Shyrion' })];
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    render(PanneauCombat, { props: { carte } });
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Réactions du round' })).toBeNull();
  });
});
