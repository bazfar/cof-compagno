import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — scène hors combat (lot S2, décisions de Thomas du
 * 22/10/2026) : l'ouverture côté MJ (repères, 11a, appelés par défaut),
 * le suivi et la clôture (DD effectif au MJ seul, Vécu d'une scène
 * marquante), la carte du joueur (options et bonus de sa fiche, Séduire
 * grisé, compteur d'échecs caché, jamais le DD) et l'arbitre (5a).
 */

const actions = vi.hoisted(() => {
  class RefusScene extends Error {}
  return {
    RefusScene,
    ouvrirScene: vi.fn(async (_b: unknown, _s?: string) => 'sh1'),
    agirEnScene: vi.fn(async (_id: string, _s: unknown, _o: string, _c: string | null, _b: number) => ({})),
    resoudreAction: vi.fn(async (_id: string, _a: string) => {}),
    cloreScene: vi.fn(async (_id: string, _i: string) => ({})),
    donnerVecuDeScene: vi.fn(async (_s: unknown, _a: unknown, p: string[]) => p.length),
    // S3
    relancerEnScene: vi.fn(async (_id: string, _s: unknown, _a: unknown, _u: unknown, _se?: string) => ({})),
    utiliserCapacite: vi.fn(async (_id: string, _s: unknown, _n: string, _u: unknown) => {}),
    poserQuestion: vi.fn(async (_n: string, _q: string, _qui: unknown) => 'q1'),
    repondreQuestion: vi.fn(async (_id: string, _r: string) => {}),
    levierEnScene: vi.fn(async (_id: string, _s: 1 | -1, _t: string) => ({})),
  };
});
vi.mock('../../src/lib/actions/scenes-hors-combat', () => actions);
vi.mock('../../src/lib/actions/persos', () => ({ messageErreurPerso: (e: unknown) => String(e) }));
vi.mock('../../src/lib/actions/journal', () => ({ messageErreurJournal: (e: unknown) => String(e) }));
vi.mock('../../src/lib/magasins/scenes-hors-combat.svelte', async () => (await import('./faux-magasins.svelte')).magasinsScenes);
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/seances.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSeances);

const { table, joueurs, persos, seances, sceneHc, sceneHcMj, actionsScene, utilisationsScene, questionsMj } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { default: SceneMj } = await import('../../src/composants/SceneMj.svelte');
const { default: SceneJoueur } = await import('../../src/composants/SceneJoueur.svelte');
const { default: ArbitreScene } = await import('../../src/composants/ArbitreScene.svelte');
const { default: QuestionsMj } = await import('../../src/composants/QuestionsMj.svelte');
const { default: RumeursVecu } = await import('../../src/composants/RumeursVecu.svelte');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const PNJ = [{ id: 'pnj-aude', nom: 'Aude Berlan', faction: null, lore: null, rencontre: true, cran: 'neutre' as const, tendance: null, mensonges: 0, peuple: false, secrets: [], creeLe: 1, majLe: 1 }];
const APPELES = [
  { uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane' },
  { uid: 'bob', perso: 'p-kargash', nom: "Kargash corde d'or" },
];
const scene = (s: Record<string, unknown> = {}) => ({
  type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', objectif: 'Savoir d’où vient la fiole', mode: 'individuel', competence: null,
  requis: 3, toleres: 2, echecsVisibles: true, marquante: false, appeles: APPELES, appelesUids: ['alice', 'bob'], tour: 1, reussites: 0, echecs: 0,
  depart: 'neutre', hausses: 0, baisses: 0, menaces: 0, temp: 0, mensonges: 0, seduction: null, statut: 'ouverte', issue: null, creeLe: 1, closeLe: null,
  peuple: 0, foule: false, autorite: false, vecus: {}, usages: {}, ...s,
});
const action = (a: Record<string, unknown> = {}) => ({ id: '1-alice', uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane', tour: 1, option: 'convaincre', competence: 'Persuasion', de: 12, bonus: 3, resultat: null, creeLe: 1, relance: false, note: null, delta: null, annule: false, ...a });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  const noms = ['Magnus', 'Kargash', 'Hermione', 'Shyrion', 'Kylhian', 'Karlach'];
  persos.elements = noms.map((n, i) => reelle(n, `p-${n.toLowerCase()}`, `u${i}`));
  joueurs.elements = noms.map((n, i) => ({ id: `u${i}`, nom: `Joueur ${i}`, rejointLe: 1, persoActif: `p-${n.toLowerCase()}` }));
  seances.elements = [{ id: 's0014', numero: 14, ouverteLe: 1, closeLe: null, presents: ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'] }];
  table.donnees = { sceneActive: null, seanceOuverte: { id: 's0014', numero: 14 }, sceneHorsCombat: null };
  sceneHc.donnees = null;
  sceneHcMj.donnees = null;
  actionsScene.elements = [];
  utilisationsScene.elements = [];
  questionsMj.elements = [];
});

describe('scène, côté MJ', () => {
  it('ouvrir : repères de la difficulté, 11a pour six appelés, présents cochés ; le brouillon part tel quel', async () => {
    render(SceneMj, { props: { pnjs: PNJ } });
    await fireEvent.change(screen.getByLabelText('PNJ'), { target: { value: 'pnj-aude' } });
    await fireEvent.input(screen.getByLabelText('Objectif'), { target: { value: 'Savoir d’où vient la fiole' } });
    expect((screen.getByLabelText('DD') as HTMLInputElement).value).toBe('13');
    expect((screen.getByLabelText('Échecs tolérés') as HTMLInputElement).value).toBe('3');
    await fireEvent.click(screen.getByLabelText(/^Karlach/));
    expect((screen.getByLabelText('Échecs tolérés') as HTMLInputElement).value).toBe('2');
    await fireEvent.change(screen.getByLabelText('Difficulté'), { target: { value: 'difficile' } });
    await fireEvent.click(screen.getByLabelText(/Scène marquante/));
    await fireEvent.click(screen.getByLabelText(/compteur d'échecs/));
    await fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la scène' }));
    expect(actions.ouvrirScene).toHaveBeenCalledTimes(1);
    const [b, seance] = actions.ouvrirScene.mock.calls[0]!;
    expect(seance).toBe('s0014');
    expect(b).toMatchObject({ type: 'social', pnj: 'pnj-aude', cible: 'Aude Berlan', mode: 'individuel', competence: null, dd: 16, requis: 4, toleres: 2, marquante: true, echecsVisibles: false });
    expect((b as { appeles: { nom: string }[] }).appeles.map((a) => a.nom)).not.toContain('Karlach Grimhollow');
    expect((b as { appeles: unknown[] }).appeles).toHaveLength(5);
  });

  it('appelés par défaut : les présents de la séance ouverte ; sans séance, tous ceux qui ont un personnage joué', async () => {
    seances.elements = [{ id: 's0014', numero: 14, ouverteLe: 1, closeLe: null, presents: ['u0', 'u1'] }];
    const { unmount } = render(SceneMj, { props: { pnjs: PNJ } });
    const coches = () => screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked && /\(Joueur/.test(c.parentElement?.textContent ?? '')).map((c) => c.parentElement?.textContent?.split(' (')[0]?.trim());
    expect(coches()).toEqual(["Kargash corde d'or", 'Magnus Bane']);
    unmount();
    table.donnees = { ...table.donnees, seanceOuverte: null };
    render(SceneMj, { props: { pnjs: PNJ } });
    expect(coches()).toHaveLength(6);
  });

  it('exploration en groupe : un lieu et la compétence de tous', async () => {
    render(SceneMj, { props: { pnjs: PNJ } });
    await fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'exploration' } });
    await fireEvent.input(screen.getByLabelText('Lieu'), { target: { value: 'Celliers du B0' } });
    await fireEvent.input(screen.getByLabelText('Objectif'), { target: { value: 'Repérer les pièges' } });
    await fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'groupe' } });
    await fireEvent.change(screen.getByLabelText('Compétence'), { target: { value: 'Perception' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la scène' }));
    expect(actions.ouvrirScene.mock.calls[0]![0]).toMatchObject({ type: 'exploration', pnj: null, cible: 'Celliers du B0', mode: 'groupe', competence: 'Perception' });
  });

  it('en cours : DD effectif (MJ seul), jets du tour ; terminée, l’issue se confirme', async () => {
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
    sceneHc.donnees = scene({ hausses: 1, reussites: 1 });
    sceneHcMj.donnees = { dd: 13 };
    actionsScene.elements = [action({ resultat: 'reussite' })];
    render(SceneMj, { props: { pnjs: PNJ } });
    const zone = screen.getByRole('region', { name: 'Scène' });
    expect(zone.textContent).toContain('Attitude en scène : Connaissance · DD effectif 12 (base 13, −1)');
    expect(zone.textContent).toContain('Magnus Bane : Convaincre, 15 — réussite');
    expect(zone.textContent).toContain("Kargash corde d'or : à lui de jouer");
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull();
    sceneHc.donnees = scene({ reussites: 3, statut: 'terminee', issue: 'gagnee' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmer : scène gagnée' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Confirmer : scène gagnée' }));
    expect(actions.cloreScene).toHaveBeenCalledWith('sh1', 'gagnee');
  });

  it('marquante gagnée : un cran de Vécu à ceux qui ont réussi, cochés par défaut ; puis enchaîner sur le PNJ', async () => {
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
    sceneHc.donnees = scene({ marquante: true, reussites: 3, statut: 'terminee', issue: 'gagnee' });
    actionsScene.elements = [action({ resultat: 'reussite' }), action({ id: '1-bob', uid: 'bob', resultat: 'echec' })];
    render(SceneMj, { props: { pnjs: PNJ } });
    await fireEvent.click(screen.getByRole('button', { name: 'Confirmer : scène gagnée' }));
    // La table ne montre plus la scène ; le MJ la garde à l'écran.
    table.donnees = { ...table.donnees, sceneHorsCombat: null };
    sceneHc.donnees = scene({ marquante: true, reussites: 3, statut: 'close', issue: 'gagnee' });
    const coche = (await screen.findByLabelText('Magnus Bane')) as HTMLInputElement;
    expect(coche.checked).toBe(true);
    expect(screen.queryByLabelText("Kargash corde d'or")).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Donner le Vécu' }));
    expect(actions.donnerVecuDeScene.mock.calls[0]![2]).toEqual(['p-magnus']);
    await fireEvent.click(screen.getByRole('button', { name: 'Nouvelle scène avec Aude Berlan' }));
    expect((screen.getByLabelText('PNJ') as HTMLSelectElement).value).toBe('pnj-aude');
  });
});

describe('scène, côté joueur', () => {
  beforeEach(() => {
    persos.elements = [reelle('Magnus', 'p-magnus', 'alice'), reelle('Kargash', 'p-kargash', 'bob')];
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
    session.uid = 'alice';
  });

  it('les quatre options avec la compétence et le bonus de sa fiche ; Séduire grisé sous Neutre ; jamais le DD', async () => {
    sceneHc.donnees = scene({ depart: 'mefiant' });
    render(SceneJoueur);
    const mods = new Map(vueFiche(persos.elements[0] as never).competences.map((c) => [c.nom, c.mod]));
    const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
    const groupe = screen.getByRole('group', { name: 'Ton action' });
    expect(within(groupe).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      `Convaincre · Persuasion ${signe(mods.get('Persuasion')!)}`,
      `Menacer · Intimidation ${signe(mods.get('Intimidation')!)}`,
      `Tromper · Bluff ${signe(mods.get('Bluff')!)}`,
      `Séduire · Persuasion ${signe(mods.get('Persuasion')!)}`,
      'Passer mon tour',
    ]);
    expect((within(groupe).getByRole('button', { name: /^Séduire/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('scene-attitude').textContent).toBe('Méfiant');
    expect(document.body.textContent).not.toMatch(/DD/);
    await fireEvent.click(within(groupe).getByRole('button', { name: /^Convaincre/ }));
    expect(actions.agirEnScene).toHaveBeenCalledWith('sh1', expect.objectContaining({ tour: 1 }), 'convaincre', 'Persuasion', mods.get('Persuasion'));
    await fireEvent.click(within(groupe).getByRole('button', { name: 'Passer mon tour' }));
    expect(actions.agirEnScene).toHaveBeenLastCalledWith('sh1', expect.anything(), 'passer', null, 0);
  });

  it('exploration individuelle : n’importe quelle compétence (4b) ; compteur d’échecs caché si le MJ le veut', async () => {
    sceneHc.donnees = scene({ type: 'exploration', pnj: null, cible: 'Celliers', depart: null, echecsVisibles: false });
    render(SceneJoueur);
    await fireEvent.change(screen.getByLabelText('Compétence'), { target: { value: 'Investigation' } });
    await fireEvent.click(screen.getByRole('button', { name: /^Lancer Investigation/ }));
    expect(actions.agirEnScene.mock.calls[0]!.slice(2, 4)).toEqual(['competence', 'Investigation']);
    expect(screen.getByTestId('scene-reussites')).toBeTruthy();
    expect(screen.queryByTestId('scene-echecs')).toBeNull();
    expect(screen.queryByTestId('scene-attitude')).toBeNull();
  });

  it('a joué ce tour : on attend ; pas appelé : on regarde ; terminée : le MJ conclut', async () => {
    sceneHc.donnees = scene();
    actionsScene.elements = [action()];
    const { unmount } = render(SceneJoueur);
    expect(screen.queryByRole('group', { name: 'Ton action' })).toBeNull();
    expect(screen.getByText('Le MJ tranche…')).toBeTruthy();
    expect(screen.getByText(/Magnus Bane : Convaincre — 15, en cours…/)).toBeTruthy();
    unmount();
    session.uid = 'carol';
    actionsScene.elements = [];
    render(SceneJoueur);
    expect(screen.getByRole('region', { name: 'Scène en cours' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Ton action' })).toBeNull();
    sceneHc.donnees = scene({ statut: 'terminee', issue: 'gagnee' });
    await waitFor(() => expect(screen.getByText('Scène terminée : le MJ conclut.')).toBeTruthy());
  });

  it('pas de scène : rien', () => {
    table.donnees = { ...table.donnees, sceneHorsCombat: null };
    render(SceneJoueur);
    expect(screen.queryByRole('region', { name: 'Scène en cours' })).toBeNull();
  });
});

describe('arbitre (5a, 7a)', () => {
  it('résout chaque jet en attente du tour, et fait tourner quand tous ont joué', async () => {
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
    sceneHc.donnees = scene();
    actionsScene.elements = [action(), action({ id: '1-bob', uid: 'bob', option: 'passer', competence: null, de: null, resultat: 'passe' })];
    render(ArbitreScene);
    await waitFor(() => expect(actions.resoudreAction).toHaveBeenCalledWith('sh1', '1-alice'));
    expect(actions.resoudreAction).toHaveBeenCalledTimes(1);
    actions.resoudreAction.mockClear();
    actionsScene.elements = [action({ resultat: 'reussite' }), action({ id: '1-bob', uid: 'bob', option: 'passer', competence: null, de: null, resultat: 'passe' })];
    await waitFor(() => expect(actions.resoudreAction).toHaveBeenCalledWith('sh1', '1-alice'));
    actions.resoudreAction.mockClear();
    // Scène terminée : plus rien, sauf une relance de Mémoire eidétique (S3).
    sceneHc.donnees = scene({ statut: 'terminee', issue: 'gagnee' });
    actionsScene.elements = [action({ id: '1-alice' })];
    await new Promise((r) => setTimeout(r, 20));
    expect(actions.resoudreAction).not.toHaveBeenCalled();
    actionsScene.elements = [action({ id: '1-alice', resultat: 'echec' }), action({ id: '1-alice-r', relance: true })];
    await waitFor(() => expect(actions.resoudreAction).toHaveBeenCalledWith('sh1', '1-alice-r'));
  });
});

describe('Vécu en scène (S3)', () => {
  const avec = (uid: string, ...n: string[]) => ({ vecus: { [uid]: n } });
  beforeEach(() => {
    persos.elements = [reelle('Magnus', 'p-magnus', 'alice'), reelle('Kargash', 'p-kargash', 'bob')];
    table.donnees = { ...table.donnees, sceneHorsCombat: 'sh1' };
  });

  it('MJ : foule et autorité à l’ouverture (scène sociale)', async () => {
    table.donnees = { ...table.donnees, sceneHorsCombat: null };
    render(SceneMj, { props: { pnjs: PNJ } });
    await fireEvent.change(screen.getByLabelText('PNJ'), { target: { value: 'pnj-aude' } });
    await fireEvent.input(screen.getByLabelText('Objectif'), { target: { value: 'Convaincre l’Assemblée' } });
    await fireEvent.click(screen.getByLabelText(/Face à une foule/));
    await fireEvent.click(screen.getByLabelText(/Face à une autorité/));
    await fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la scène' }));
    expect(actions.ouvrirScene.mock.calls[0]![0]).toMatchObject({ foule: true, autorite: true });
    await fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'exploration' } });
    expect(screen.queryByLabelText(/Face à une foule/)).toBeNull();
  });

  it('MJ : Levier si un appelé l’a, avec le secret ; les notes du Vécu et les relances sur les jets ; les capacités utilisées', async () => {
    sceneHc.donnees = scene({ ...avec('bob', 'levier'), peuple: 1 });
    sceneHcMj.donnees = { dd: 13 };
    actionsScene.elements = [action({ resultat: 'reussite', note: 'Langue d’argent' })];
    utilisationsScene.elements = [{ id: 'bob-compagnon-oiseau', uid: 'bob', perso: 'p-kargash', nom: "Kargash corde d'or", noeud: 'compagnon-oiseau', tour: 1, creeLe: 1 }];
    render(SceneMj, { props: { pnjs: PNJ } });
    const zone = screen.getByRole('region', { name: 'Scène' });
    expect(zone.textContent).toContain('Homme du peuple : la scène a commencé un cran plus haut.');
    expect(zone.textContent).toContain('Magnus Bane : Convaincre, 15 — réussite (Langue d’argent)');
    expect(screen.getByTestId('scene-capacites').textContent).toContain("Kargash corde d'or — Compagnon oiseau (tour 1)");
    const plus = screen.getByRole('button', { name: '+2 crans' }) as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText(/Levier/), { target: { value: 'La dette envers le Roi' } });
    await fireEvent.click(plus);
    expect(actions.levierEnScene).toHaveBeenCalledWith('sh1', 1, 'La dette envers le Roi');
    sceneHc.donnees = scene();
    await waitFor(() => expect(screen.queryByRole('button', { name: '+2 crans' })).toBeNull());
  });

  it('joueur : Lire les gens et Citer le précédent parmi ses options ; relancer un échec ; capacités ; Savant', async () => {
    session.uid = 'alice';
    sceneHc.donnees = scene({ ...avec('alice', 'lire-les-gens', 'citer-le-precedent', 'memoire-eidetique', 'savant', 'compagnon-oiseau', 'faconnage'), autorite: true, seance: 's0014', tour: 2 });
    const echec = action({ resultat: 'echec' });
    actionsScene.elements = [echec];
    utilisationsScene.elements = [{ id: 'alice-compagnon-oiseau', uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane', noeud: 'compagnon-oiseau', tour: 1, creeLe: 1 }];
    render(SceneJoueur);
    const groupe = screen.getByRole('group', { name: 'Ton action' });
    expect(within(groupe).getAllByRole('button').map((b) => b.textContent?.split(' · ')[0]?.trim())).toEqual(['Convaincre', 'Menacer', 'Tromper', 'Séduire', 'Lire les gens', 'Citer le précédent', 'Passer mon tour']);
    await fireEvent.click(screen.getByRole('button', { name: 'Relancer (Mémoire eidétique) : Persuasion' }));
    expect(actions.relancerEnScene).toHaveBeenCalledWith('sh1', expect.objectContaining({ tour: 2 }), expect.objectContaining({ id: '1-alice' }), expect.anything(), 's0014');
    const capacites = screen.getByRole('group', { name: 'Capacités du Vécu' });
    expect((within(capacites).getByRole('button', { name: 'Utiliser Compagnon oiseau' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(within(capacites).getByRole('button', { name: 'Utiliser Façonnage' }));
    expect(actions.utiliserCapacite).toHaveBeenCalledWith('sh1', expect.anything(), 'faconnage', expect.anything());
    await fireEvent.input(screen.getByLabelText(/Savant/), { target: { value: 'Qui a forgé ce sceau ?' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Poser au MJ' }));
    expect(actions.poserQuestion).toHaveBeenCalledWith('savant', 'Qui a forgé ce sceau ?', expect.objectContaining({ scene: 'sh1', perso: 'p-magnus', seance: 's0014' }));
  });

  it('joueur : la relance déjà faite ou la séance déjà servie la retirent ; un autre que le porteur ne voit rien', async () => {
    session.uid = 'alice';
    sceneHc.donnees = scene(avec('alice', 'memoire-eidetique'));
    actionsScene.elements = [action({ resultat: 'echec' }), action({ id: '1-alice-r', relance: true, resultat: 'echec' })];
    const { unmount } = render(SceneJoueur);
    expect(screen.queryByRole('button', { name: /^Relancer/ })).toBeNull();
    expect(screen.getByText(/relance, Convaincre — 15, échec/)).toBeTruthy();
    unmount();
    sceneHc.donnees = scene({ ...avec('alice', 'memoire-eidetique'), seance: 's0014' });
    actionsScene.elements = [action({ resultat: 'echec' })];
    persos.elements = [{ ...persos.elements[0]!, usages: { 'memoire-eidetique': { seance: 's0014' } } }, persos.elements[1]!];
    const deux = render(SceneJoueur);
    expect(screen.queryByRole('button', { name: /^Relancer/ })).toBeNull();
    deux.unmount();
    session.uid = 'bob';
    render(SceneJoueur);
    expect(screen.queryByRole('button', { name: /^Relancer/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Capacités du Vécu' })).toBeNull();
  });

  it('joueur : ce que Lire les gens révèle, et la réponse du MJ, chez lui seul', async () => {
    sceneHc.donnees = scene(avec('alice', 'lire-les-gens'));
    // Une lecture d'une scène passée ne s'affiche pas dans celle-ci.
    const ancienne = { id: 'sh0-alice-lire', uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane', noeud: 'lire-les-gens', scene: 'sh0', question: null, dd: 9, reponse: 'Rien', creeLe: 0, reponduLe: 1 };
    const lecture = { id: 'sh1-alice-lire', uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane', noeud: 'lire-les-gens', scene: 'sh1', question: null, dd: 12, reponse: null, creeLe: 1, reponduLe: null };
    questionsMj.elements = [ancienne, lecture];
    session.uid = 'alice';
    const { unmount } = render(SceneJoueur);
    expect(screen.getByTestId('lecture').textContent).toBe('Lire les gens : il te faudra 12. Le MJ te dit son intention…');
    questionsMj.elements = [ancienne, { ...lecture, reponse: 'Elle protège son frère.' }];
    await waitFor(() => expect(screen.getByTestId('lecture').textContent).toBe('Lire les gens : il te faudra 12. Intention : Elle protège son frère.'));
    unmount();
    session.uid = 'bob';
    render(SceneJoueur);
    expect(screen.queryByTestId('lecture')).toBeNull();
  });

  it('MJ : les questions en attente, et la réponse', async () => {
    questionsMj.elements = [
      { id: 'sh1-alice-lire', uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane', noeud: 'lire-les-gens', scene: 'sh1', question: null, dd: 12, reponse: null, creeLe: 1, reponduLe: null },
      { id: 'sh1-bob-savant', uid: 'bob', perso: 'p-kargash', nom: 'Kargash', noeud: 'savant', scene: 'sh1', question: 'Qui a forgé ce sceau ?', dd: null, reponse: null, creeLe: 2, reponduLe: null },
      { id: 's0013-carol-rumeurs', uid: 'carol', perso: 'p-x', nom: 'Shyrion', noeud: 'reseau-de-rumeurs', scene: null, question: 'Où dort Marec ?', dd: null, reponse: 'Rangée B', creeLe: 0, reponduLe: 1 },
    ];
    render(QuestionsMj);
    expect(screen.queryByLabelText('Réponse à Shyrion')).toBeNull();
    const zone = screen.getByRole('region', { name: 'Questions des joueurs' });
    expect(zone.textContent).toContain('Magnus Bane a lu son interlocuteur (Lire les gens) : il lui faudra 12. Donne son intention.');
    expect(zone.textContent).toContain('Kargash (Savant) : Qui a forgé ce sceau ?');
    await fireEvent.input(screen.getByLabelText('Réponse à Kargash'), { target: { value: 'Les forges de Mornac' } });
    await fireEvent.click(within(zone).getAllByRole('button', { name: 'Répondre' })[1]!);
    expect(actions.repondreQuestion).toHaveBeenCalledWith('sh1-bob-savant', 'Les forges de Mornac');
  });

  it('Réseau de rumeurs sur la fiche : une question par séance ; les réponses ; rien sans le nœud', async () => {
    session.uid = 'alice';
    const f = reelle('Magnus', 'p-magnus', 'alice');
    const avecRumeurs = { ...f, vecu: { crans: 0, paliers: 3, points: 0, noeuds: ['affable', 'beau-parleur', 'reseau-de-rumeurs'], noeudOffert: 'lire-les-gens' } };
    questionsMj.elements = [{ id: 's0013-alice-rumeurs', uid: 'alice', perso: 'p-magnus', nom: 'Magnus Bane', noeud: 'reseau-de-rumeurs', scene: null, question: 'Où dort Marec ?', dd: null, reponse: 'Rangée B', creeLe: 1, reponduLe: 2 }];
    const { unmount } = render(RumeursVecu, { props: { fiche: avecRumeurs as never } });
    expect(screen.getByText('Où dort Marec ? — Rangée B')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(/Une question au MJ/), { target: { value: 'Qui tient le B0 ?' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Poser au MJ' }));
    expect(actions.poserQuestion).toHaveBeenCalledWith('reseau-de-rumeurs', 'Qui tient le B0 ?', expect.objectContaining({ perso: 'p-magnus', seance: 's0014', scene: null }));
    unmount();
    render(RumeursVecu, { props: { fiche: { ...avecRumeurs, usages: { 'reseau-de-rumeurs': { seance: 's0014' } } } as never } });
    expect(screen.getByText('Déjà utilisé cette séance.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Poser au MJ' })).toBeNull();
  });
});
