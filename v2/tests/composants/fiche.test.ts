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
 *
 * Mise en page (L2.6) : quatre onglets (rôle « tab »), caractéristiques dans
 * Combat, notes dans « Suivi et notes », capacités en combat / hors combat ;
 * la fiche du groupe s'ouvre dans un panneau latéral.
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
// Journal de dés et crans (L2.5) : on vérifie ce qui est noté, sans Firestore.
const journal = vi.hoisted(() => ({
  noterJet: vi.fn(async (_l: string, _f: string, _j: unknown, _p?: string) => {}),
  lancerEtNoter: vi.fn(async (_l: string, _f: string, _p?: string) => ({ des: [14], faces: 20, bonus: 0, total: 14 }) as { des: number[]; faces: number; bonus: number; total: number } | null),
}));
vi.mock('../../src/lib/actions/journal', () => ({ ...journal, messageErreurJournal: (e: unknown) => String(e) }));
const crans = vi.hoisted(() => {
  class RefusCran extends Error {}
  return { RefusCran, donnerCran: vi.fn(async (_id: string, _d: 1 | -1, _l: string) => 0) };
});
vi.mock('../../src/lib/actions/progression', () => crans);
// Montée de niveau (L2.5b) : on vérifie ce qui part à l'écriture.
const montee = vi.hoisted(() => ({
  monterNiveau: vi.fn(async (_id: string, _m: unknown) => ({ fiche: { niveau: 4 }, pvGagnes: 7 }) as unknown),
  monterNiveauRefonte: vi.fn(async (_id: string, _m: unknown) => ({ fiche: { niveau: 4 }, pvGagnes: 6 }) as unknown),
}));
vi.mock('../../src/lib/actions/montee', () => montee);
// Refonte (L4.11b) : conversion, « Refaire mes voies », octrois du MJ.
const refonte = vi.hoisted(() => ({
  convertirPerso: vi.fn(async (_id: string, _r: unknown) => ({}) as unknown),
  refaireVoiesPerso: vi.fn(async (_id: string, _r: unknown) => ({}) as unknown),
  modifierOctrois: vi.fn(async (_id: string, _o: unknown) => {}),
  modifierJauges: vi.fn(async (_id: string, _j: unknown) => {}),
}));
vi.mock('../../src/lib/actions/refonte', () => refonte);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
// Séance ouverte et présents (L3.1).
vi.mock('../../src/lib/magasins/carte.svelte', async () => (await import('./faux-magasins.svelte')).magasinsCarte);
vi.mock('../../src/lib/magasins/seances.svelte', async () => (await import('./faux-magasins.svelte')).magasinsSeances);

const { joueurs, persos, portraits, table, seances } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { default: FicheVivante } = await import('../../src/composants/FicheVivante.svelte');
const { default: GroupeMj } = await import('../../src/composants/GroupeMj.svelte');
const E = await import('../../src/lib/regles/equipement');
const RF = await import('../../src/lib/fiche/refonte');
const { classeParId } = await import('../../src/regles');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string, uid = 'alice') => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => f.mockClear());
  Object.values(journal).forEach((f) => f.mockClear());
  montee.monterNiveau.mockClear();
  montee.monterNiveauRefonte.mockClear();
  Object.values(refonte).forEach((f) => f.mockClear());
  crans.donnerCran.mockReset();
  crans.donnerCran.mockResolvedValue(0);
  for (const k of Object.keys(portraits)) delete portraits[k];
  persos.elements = [];
  joueurs.elements = [];
  table.donnees = { sceneActive: null, seanceOuverte: null };
  seances.elements = [];
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
    await fireEvent.click(screen.getByRole('tab', { name: 'Suivi et notes' }));
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
    await fireEvent.click(screen.getByRole('tab', { name: 'Capacités' }));
    expect(screen.getByText(/Spécimen d'élite/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Suivi et notes' }));
    expect(screen.getByText('Veines sombres')).toBeTruthy();
  });

  it('L2.6 : quatre onglets, dans cet ordre, et les caractéristiques dans Combat', () => {
    render(FicheVivante, { props: { fiche: reelle('Kylhian', 'p-k'), modifiable: true } });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Combat', 'Capacités', 'Équipement', 'Suivi et notes']);
    expect(screen.getByRole('tab', { name: 'Combat' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Lancer un test de Force' })).toBeTruthy();
  });

  it('L2.6 : capacités en combat et hors combat (Magnus : Historien et Spectacle à part)', async () => {
    const m = reelle('Magnus', 'p-m');
    const hors = vueFiche(m).voies.filter((v) => v.horsCombat);
    expect(hors.length).toBeGreaterThan(0);
    render(FicheVivante, { props: { fiche: m, modifiable: false } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Capacités' }));
    for (const v of hors) expect(screen.queryByRole('heading', { name: v.nom })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Hors combat' }));
    for (const v of hors) expect(screen.getByRole('heading', { name: v.nom })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dons' })).toBeNull();
  });

  it('L2.6 : sans voie hors combat, la section le dit', async () => {
    render(FicheVivante, { props: { fiche: reelle('Kylhian', 'p-k'), modifiable: false } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Capacités' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Hors combat' }));
    expect(screen.getByText(/Aucune capacité hors combat pour l'instant/)).toBeTruthy();
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
    const lignes = within(screen.getByRole('list', { name: 'Personnages de la table' })).getAllByRole('listitem');
    expect(lignes.map((l) => l.querySelector('strong')?.textContent)).toEqual([vhorgar.nom, karlach.nom]);
    expect(within(lignes[0]!).getByText('joué')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: `Ajouter un PV à ${vhorgar.nom}` }));
    expect(actions.modifierPV).toHaveBeenCalledWith('p-v', (vhorgar.pvActuel ?? vhorgar.pvMax) + 1, vhorgar.pvMax);
    await fireEvent.click(within(lignes[0]!).getByRole('button', { name: `Ouvrir la fiche de ${vhorgar.nom}` }));
    const panneau = await screen.findByRole('dialog', { name: 'Fiche complète' });
    expect(within(panneau).getByRole('region', { name: `Fiche de ${vhorgar.nom}` })).toBeTruthy();
  });

  it('L2.6 : le panneau de la fiche se ferme à Échap, sauf pendant une saisie', async () => {
    session.uid = 'mj';
    const karlach = reelle('Karlach', 'p-c');
    persos.elements = [karlach];
    render(GroupeMj);
    await fireEvent.click(screen.getByRole('button', { name: `Ouvrir la fiche de ${karlach.nom}` }));
    const panneau = await screen.findByRole('dialog', { name: 'Fiche complète' });
    // Échap dans le champ des PV : la saisie n'est pas perdue, le panneau reste.
    const champ = within(panneau).getByLabelText('PV actuels');
    await fireEvent.focus(champ);
    await fireEvent.input(champ, { target: { value: '3' } });
    await fireEvent.keyDown(champ, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Fiche complète' })).toBeTruthy();
    expect((champ as HTMLInputElement).value).toBe('3');
    await fireEvent.blur(champ);
    expect(actions.modifierPV).toHaveBeenCalledWith('p-c', 3, karlach.pvMax);
    // Hors saisie, Échap ferme.
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Fiche complète' })).toBeNull();
  });
});

describe('onglet Équipement (L2.4)', () => {
  const ouvrir = async (fiche: ReturnType<typeof reelle>, mj = false) => {
    render(FicheVivante, { props: { fiche, modifiable: true, mj } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Équipement' }));
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
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Potion de soin améliorée : 1d8 → \d+, \d+ PV rendus\.$/));
    // Le jet part au journal commun, au nom du personnage (L2.5).
    expect(journal.noterJet).toHaveBeenCalledWith('Potion de soin améliorée', '1d8', expect.objectContaining({ des: [expect.any(Number)] }), k.nom);
  });

  it('potion : si le journal refuse, les PV sont rendus et le message le dit', async () => {
    journal.noterJet.mockRejectedValueOnce(new Error('hors ligne'));
    await ouvrir({ ...reelle('Karlach', 'p-c'), pvActuel: 5 });
    await fireEvent.click(screen.getByRole('button', { name: 'Utiliser Potion de soin améliorée' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/PV rendus\. \(Jet non noté au journal : Error: hors ligne\)$/));
    expect(actions.appliquerChangement).toHaveBeenCalledTimes(1);
  });

  it('potion : si la fiche n’est pas écrite, aucun jet n’est noté', async () => {
    actions.appliquerChangement.mockRejectedValueOnce(new Error('refusé'));
    await ouvrir({ ...reelle('Karlach', 'p-c'), pvActuel: 5 });
    await fireEvent.click(screen.getByRole('button', { name: 'Utiliser Potion de soin améliorée' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Error: refusé'));
    expect(journal.noterJet).not.toHaveBeenCalled();
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

describe('jets depuis la fiche et crans (L2.5)', () => {
  it('cliquer une valeur lance d20 + modificateur, au nom du personnage, et affiche le résultat', async () => {
    const k = reelle('Kylhian', 'p-k');
    const vue = vueFiche(k);
    render(FicheVivante, { props: { fiche: k, modifiable: true } });
    const force = vue.caracs.find((c) => c.nom === 'Force')!;
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer un test de Force' }));
    const formule = force.mod === 0 ? '1d20' : `1d20${force.mod > 0 ? '+' : ''}${force.mod}`;
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Test de Force', formule, k.nom);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(`Test de Force : ${formule} → `));
  });

  it('lecture seule : aucune valeur à lancer (caractéristiques, attaques, sauvegardes)', () => {
    render(FicheVivante, { props: { fiche: reelle('Kylhian', 'p-k'), modifiable: false } });
    expect(screen.queryByRole('button', { name: /^Lancer/ })).toBeNull();
  });

  it('au combat : attaques et sauvegardes se lancent', async () => {
    const k = reelle('Kylhian', 'p-k');
    render(FicheVivante, { props: { fiche: k, modifiable: true } });
    const [n, v] = Object.entries(vueFiche(k).stats.sauvegardes)[0]!;
    await fireEvent.click(screen.getByRole('button', { name: `Lancer ${n}` }));
    expect(journal.lancerEtNoter).toHaveBeenCalledWith(`Sauvegarde : ${n}`, v === 0 ? '1d20' : `1d20${v > 0 ? '+' : ''}${v}`, k.nom);
    await fireEvent.click(screen.getAllByRole('button', { name: /^Lancer l'attaque/ })[0]!);
    expect(journal.lancerEtNoter).toHaveBeenLastCalledWith(expect.stringMatching(/^Attaque /), expect.stringMatching(/^1d20/), k.nom);
  });

  it('barre de progression : crans donnés sur crans requis, et l’annonce quand elle est pleine', async () => {
    const k = reelle('Kylhian', 'p-k');
    const { cransRequis } = await import('../../src/lib/regles/progression');
    const requis = cransRequis(k.niveau)!;
    const { unmount } = render(FicheVivante, { props: { fiche: { ...k, progression: { crans: 1 } }, modifiable: true } });
    expect(screen.getByTestId('crans').textContent).toBe(`1 / ${requis} crans vers le niveau ${k.niveau + 1}`);
    expect(screen.queryByText(/Barre pleine/)).toBeNull();
    unmount();
    render(FicheVivante, { props: { fiche: { ...k, progression: { crans: requis } }, modifiable: true } });
    expect(screen.getByText(/Barre pleine/)).toBeTruthy();
  });

  it('MJ : + et − par PJ avec le motif ; « +1 cran aux présents » ne touche que les PJ joués des présents (L3.1)', async () => {
    session.uid = 'mj';
    joueurs.elements = [
      { id: 'alice', nom: 'Alice', rejointLe: 1, persoActif: 'p-c' },
      { id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'p-v' },
    ];
    // Séance 14 ouverte : Carol est cochée présente, Alice non.
    table.donnees = { sceneActive: null, seanceOuverte: { id: 's0014', numero: 14 } };
    seances.elements = [{ id: 's0014', numero: 14, ouverteLe: 1, closeLe: null, presents: ['carol'] }];
    const karlach = reelle('Karlach', 'p-c');
    const vhorgar = reelle('Vhorgar', 'p-v', 'carol');
    persos.elements = [vhorgar, karlach];
    render(GroupeMj);
    await fireEvent.input(screen.getByLabelText('Motif du cran'), { target: { value: 'Le pont tenu' } });
    await fireEvent.click(screen.getByRole('button', { name: `Donner un cran à ${karlach.nom}` }));
    expect(crans.donnerCran).toHaveBeenLastCalledWith('p-c', 1, 'Le pont tenu', 's0014');
    await fireEvent.click(screen.getByRole('button', { name: `Retirer un cran à ${karlach.nom}` }));
    expect(crans.donnerCran).toHaveBeenLastCalledWith('p-c', -1, 'Le pont tenu', 's0014');
    crans.donnerCran.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: '+1 cran aux présents' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Un cran donné à 1 PJ présent.'));
    expect(crans.donnerCran.mock.calls).toEqual([['p-v', 1, 'Le pont tenu', 's0014']]);
    expect(screen.getByTestId(`crans-${karlach.id}`).textContent).toMatch(/^\d+ \/ \d+$/);
  });

  it('MJ, hors séance : pas de cran aux présents, le cran à la main ne porte pas de séance', async () => {
    session.uid = 'mj';
    joueurs.elements = [{ id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'p-v' }];
    const vhorgar = reelle('Vhorgar', 'p-v', 'carol');
    persos.elements = [vhorgar];
    render(GroupeMj);
    expect((screen.getByRole('button', { name: '+1 cran aux présents' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Ouvre une séance pour donner un cran aux présents.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: `Donner un cran à ${vhorgar.nom}` }));
    expect(crans.donnerCran).toHaveBeenLastCalledWith('p-v', 1, '', undefined);
  });

  it('MJ : un refus (aucun cran à retirer) s’affiche', async () => {
    session.uid = 'mj';
    const karlach = reelle('Karlach', 'p-c');
    persos.elements = [karlach];
    crans.donnerCran.mockRejectedValueOnce(new crans.RefusCran('Aucun cran à retirer : un niveau acquis ne se perd pas.'));
    render(GroupeMj);
    expect((screen.getByRole('button', { name: '+1 cran aux présents' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: `Retirer un cran à ${karlach.nom}` }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Aucun cran à retirer : un niveau acquis ne se perd pas.'));
  });
});

describe('montée de niveau guidée (L2.5b)', () => {
  /** Karlach (guerrier humain niveau 3), barre pleine. */
  const prete = () => ({ ...reelle('Karlach', 'p-c'), progression: { crans: 3 } });
  const ouvrir = async () => {
    const k = prete();
    // Comme dans l'app : la fiche vient d'un magasin réactif (un proxy Svelte, que structuredClone refuse).
    persos.elements = [k];
    render(FicheVivante, { props: { fiche: persos.elements[0] as typeof k, modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Passer au niveau 4' }));
    return { k, zone: within(screen.getByRole('region', { name: 'Montée de niveau' })) };
  };

  it('barre pleine : le bouton n’apparaît qu’à qui peut modifier la fiche', () => {
    render(FicheVivante, { props: { fiche: prete(), modifiable: false } });
    expect(screen.queryByRole('button', { name: 'Passer au niveau 4' })).toBeNull();
  });

  it('ce qui manque est listé, et la validation attend ; le dé de vie part au journal', async () => {
    const { k, zone } = await ouvrir();
    const manque = within(zone.getByRole('list', { name: 'À compléter' }));
    expect(manque.getByText('Lance le dé de vie du niveau 4.')).toBeTruthy();
    expect(manque.getByText('Choisis 1 don(s).')).toBeTruthy();
    expect((zone.getByRole('button', { name: 'Passer au niveau 4' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(zone.getByRole('button', { name: 'Lancer le dé de vie (d10)' }));
    await waitFor(() => expect(journal.noterJet).toHaveBeenCalledWith('PV du niveau 4', '1d10', expect.objectContaining({ faces: 10 }), k.nom));
    expect(zone.getByTestId('jet-pv').textContent).toMatch(/^Dé de vie : \d+ — PV max \d+ → \d+$/);
    expect(zone.queryByRole('button', { name: /^Lancer le dé de vie/ })).toBeNull();
  });

  it('un rang acquis ne se retire pas ; un rang pris à l’instant, si', async () => {
    const { k, zone } = await ouvrir();
    expect(zone.queryAllByRole('button', { name: /^Retirer / })).toEqual([]);
    const prendre = zone.getAllByRole('button', { name: /^Prendre [a-z]/ }).find((b) => !/\.chaos\./.test(b.getAttribute('aria-label')!))!;
    const id = prendre.getAttribute('aria-label')!.replace('Prendre ', '');
    await fireEvent.click(prendre);
    expect(zone.getByRole('button', { name: `Retirer ${id}` })).toBeTruthy();
    expect(k.capacites.some((c) => c.id === id)).toBe(false);
  });

  it('complète : la montée part à l’écriture avec le jet et le don, puis le message', async () => {
    const { zone } = await ouvrir();
    await fireEvent.click(zone.getByRole('button', { name: 'Lancer le dé de vie (d10)' }));
    await fireEvent.change(zone.getByLabelText('Don'), { target: { value: 'alerte' } });
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Passer au niveau 4' }));
    await waitFor(() => expect(montee.monterNiveau).toHaveBeenCalledTimes(1));
    const [id, m] = montee.monterNiveau.mock.calls[0]! as [string, { jetPV: number; b: { dons: string[]; niveau: number } }];
    expect(id).toBe('p-c');
    expect(m.jetPV).toBeGreaterThan(0);
    expect(m.b.dons).toContain('alerte');
    expect(m.b.niveau).toBe(4);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/passe au niveau 4 \(\+7 PV max\)\.$/));
    expect(screen.queryByRole('region', { name: 'Montée de niveau' })).toBeNull();
  });

  it('un refus à l’écriture s’affiche dans la montée, qui reste ouverte', async () => {
    const { RefusMontee } = await import('../../src/lib/regles/montee');
    montee.monterNiveau.mockRejectedValueOnce(new RefusMontee('La fiche a changé pendant la montée de niveau : recommence-la.'));
    const { zone } = await ouvrir();
    await fireEvent.click(zone.getByRole('button', { name: 'Lancer le dé de vie (d10)' }));
    await fireEvent.change(zone.getByLabelText('Don'), { target: { value: 'alerte' } });
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Passer au niveau 4' }));
    await waitFor(() => expect(zone.getByRole('alert').textContent).toBe('La fiche a changé pendant la montée de niveau : recommence-la.'));
  });
});

describe('refonte (L4.11b)', () => {
  const guerrier = classeParId.get('guerrier')!;
  /** Karlach passée à la refonte (Soldat 3, Peuple 2), barre pleine. */
  const karlachV2 = (patch: Record<string, unknown> = {}) => ({
    ...RF.convertirFiche(reelle('Karlach', 'p-c'), { ...RF.refonteVierge(guerrier, 3), rangs: { 'guerrier.soldat': 3, 'guerrier.peuple': 2 } }),
    id: 'p-c',
    progression: { crans: 3 },
    ...patch,
  });

  it('« Passer à la refonte » : à qui peut modifier la fiche, pour toutes les classes (le Nécromancien depuis L4.17)', () => {
    const vue = render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: true } });
    expect(screen.getByRole('button', { name: 'Passer à la refonte' })).toBeTruthy();
    vue.unmount();
    const lecture = render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: false } });
    expect(screen.queryByRole('button', { name: 'Passer à la refonte' })).toBeNull();
    lecture.unmount();
    render(FicheVivante, { props: { fiche: { ...reelle('Hyrma', 'p-h'), classe: 'necromancien' }, modifiable: true } });
    expect(screen.getByRole('button', { name: 'Passer à la refonte' })).toBeTruthy();
  });

  it('conversion : anciennes voies rappelées, voies refaites, confirmation, puis l’écriture', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Passer à la refonte' }));
    const zone = within(screen.getByRole('region', { name: 'Passer à la refonte' }));
    expect(zone.getByText(/Tes voies en v1/)).toBeTruthy();
    for (const rang of [1, 2, 3]) await fireEvent.click(zone.getByRole('button', { name: `Prendre guerrier.soldat rang ${rang}` }));
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre guerrier.peuple rang 1' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre guerrier.peuple rang 2' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre guerrier.ingenieur rang 1' }));
    expect(zone.getByRole('alert').textContent).toBe('Pas assez de points de voie.');
    await fireEvent.click(zone.getByRole('button', { name: 'Passer à la refonte' }));
    await waitFor(() => expect(refonte.convertirPerso).toHaveBeenCalledTimes(1));
    expect(refonte.convertirPerso.mock.calls[0]![0]).toBe('p-c');
    expect(refonte.convertirPerso.mock.calls[0]![1]).toMatchObject({ classe: 'guerrier', rangs: { 'guerrier.soldat': 3, 'guerrier.peuple': 2 } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/est passé\(e\) à la refonte\.$/));
  });

  it('conversion : la Voie du chaos n’est proposée qu’à qui l’avait en v1 (12a)', async () => {
    const vue = render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Passer à la refonte' }));
    expect(screen.queryByRole('button', { name: 'Prendre guerrier.chaos rang 1' })).toBeNull();
    vue.unmount();
    render(FicheVivante, { props: { fiche: reelle('Magnus', 'p-m'), modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Passer à la refonte' }));
    const zone = within(screen.getByRole('region', { name: 'Passer à la refonte' }));
    expect(zone.getByText(/Tu avais la Voie du chaos en v1/)).toBeTruthy();
    expect(zone.getByRole('button', { name: 'Prendre envouteur.chaos rang 1' })).toBeTruthy();
  });

  it('conversion annulée à la confirmation : rien n’est écrit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Passer à la refonte' }));
    const zone = within(screen.getByRole('region', { name: 'Passer à la refonte' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Passer à la refonte' }));
    expect(refonte.convertirPerso).not.toHaveBeenCalled();
  });

  it('« Refaire mes voies » quand le MJ a rouvert la conversion ; pas sinon', async () => {
    const vue = render(FicheVivante, { props: { fiche: karlachV2(), modifiable: true } });
    expect(screen.queryByRole('button', { name: 'Refaire mes voies' })).toBeNull();
    vue.unmount();
    const f = karlachV2();
    render(FicheVivante, { props: { fiche: { ...f, octrois: { ...f.octrois, reconversion: true } }, modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Refaire mes voies' }));
    const zone = within(screen.getByRole('region', { name: 'Refaire mes voies' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Retirer guerrier.peuple rang 2' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Valider mes voies' }));
    await waitFor(() => expect(refonte.refaireVoiesPerso).toHaveBeenCalledWith('p-c', expect.objectContaining({ rangs: { 'guerrier.soldat': 3, 'guerrier.peuple': 1 } })));
  });

  it('montée d’une fiche de la refonte : rangs acquis figés, gestes, puis l’écriture', async () => {
    persos.elements = [karlachV2()];
    render(FicheVivante, { props: { fiche: persos.elements[0] as ReturnType<typeof karlachV2>, modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Passer au niveau 4' }));
    const zone = within(screen.getByRole('region', { name: 'Montée de niveau' }));
    expect(zone.queryByRole('button', { name: 'Retirer guerrier.soldat rang 3' })).toBeNull();
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre guerrier.ingenieur rang 1' }));
    expect(zone.getByRole('button', { name: 'Retirer guerrier.ingenieur rang 1' })).toBeTruthy();
    await fireEvent.click(zone.getByRole('button', { name: 'Lancer le dé de vie (d10)' }));
    expect(zone.getByText(/^Endurance : 4 → 4$/)).toBeTruthy(); // 3 + niveau / 3 : 4 aux niveaux 3 et 4
    await fireEvent.change(zone.getByLabelText('Don'), { target: { value: 'alerte' } });
    await fireEvent.click(zone.getByRole('button', { name: 'Prendre' }));
    await fireEvent.click(zone.getByRole('button', { name: 'Passer au niveau 4' }));
    await waitFor(() => expect(montee.monterNiveauRefonte).toHaveBeenCalledTimes(1));
    const [id, m] = montee.monterNiveauRefonte.mock.calls[0]! as [string, { r: { rangs: Record<string, number> }; b: { dons: string[] } }];
    expect(id).toBe('p-c');
    expect(m.r.rangs).toEqual({ 'guerrier.soldat': 3, 'guerrier.peuple': 2, 'guerrier.ingenieur': 1 });
    expect(m.b.dons).toContain('alerte');
    expect(montee.monterNiveau).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/passe au niveau 4 \(\+6 PV max\)\.$/));
  });

  it('octrois : le MJ seul ; chaos ouvert, élément et verbe accordés, puis « Enregistrer »', async () => {
    const vue = render(FicheVivante, { props: { fiche: karlachV2(), modifiable: true } });
    expect(screen.queryByRole('button', { name: 'Octrois de la refonte' })).toBeNull();
    vue.unmount();
    render(FicheVivante, { props: { fiche: karlachV2(), modifiable: true, mj: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Octrois de la refonte' }));
    const zone = within(screen.getByRole('region', { name: 'Octrois de la refonte' }));
    await fireEvent.click(zone.getByLabelText('Voie du chaos ouverte'));
    await fireEvent.change(zone.getByLabelText('Élément Glace'), { target: { value: 'initie' } });
    await fireEvent.change(zone.getByLabelText('Verbe à accorder'), { target: { value: 'evocation.missile' } });
    await fireEvent.click(zone.getByRole('button', { name: 'Accorder' }));
    expect(zone.getByRole('button', { name: `Retirer ${RF.nomAction('evocation.missile')}` })).toBeTruthy();
    await fireEvent.click(zone.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(refonte.modifierOctrois).toHaveBeenCalledWith('p-c', { chaos: true, elements: { glace: 'initie' }, verbes: [{ id: 'evocation.missile', maitrise: 'initie' }], reconversion: false }),
    );
  });

  it('octrois : fermer la Voie du chaos d’un personnage qui y a des rangs est refusé, la case reste cochée', async () => {
    const f = karlachV2();
    const avecChaos = { ...f, refonte: { ...f.refonte, rangs: { ...f.refonte.rangs, 'guerrier.chaos': 1 } }, octrois: { ...f.octrois, chaos: true } };
    render(FicheVivante, { props: { fiche: avecChaos, modifiable: true, mj: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Octrois de la refonte' }));
    const zone = within(screen.getByRole('region', { name: 'Octrois de la refonte' }));
    const caseChaos = zone.getByLabelText('Voie du chaos ouverte') as HTMLInputElement;
    await fireEvent.click(caseChaos);
    expect(zone.getByRole('alert').textContent).toContain('rouvre sa conversion');
    expect(caseChaos.checked).toBe(true);
  });

  it('vue du groupe : le MJ voit où en est chaque personnage avec la refonte', () => {
    session.uid = 'mj';
    const f = karlachV2();
    persos.elements = [
      { ...f, id: 'p-1', nom: 'Converti' },
      { ...f, id: 'p-2', nom: 'Rouvert', octrois: { ...f.octrois, reconversion: true } },
      { ...reelle('Vhorgar', 'p-3'), nom: 'A convertir' },
      { ...reelle('Hyrma', 'p-4'), classe: 'necromancien', nom: 'Nécromancien' },
    ];
    render(GroupeMj);
    const lignes = within(screen.getByRole('list', { name: 'Personnages de la table' })).getAllByRole('listitem');
    const badges = (nom: string) => [...lignes.find((l) => l.querySelector('strong')?.textContent === nom)!.querySelectorAll('.badge')].map((b) => b.textContent);
    expect(badges('Converti')).toEqual(['refonte']);
    expect(badges('Rouvert')).toEqual(['conversion rouverte']);
    expect(badges('A convertir')).toEqual(['à convertir']);
    expect(badges('Nécromancien')).toEqual(['à convertir']);
  });
});

describe('fiche de la refonte : jauges et actions (L4.12)', () => {
  const kylhian = () => {
    const v1 = reelle('Kylhian', 'p-k');
    const f = RF.convertirFiche(v1, {
      ...RF.refonteVierge(classeParId.get('magicien')!, v1.niveau),
      ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.virtuose': 1 },
      mineurs: ['mineur.trait-arcanique', 'mineur.lumiere', 'mineur.main-du-mage'], mineurPalierII: 'mineur.trait-arcanique',
    });
    return { ...f, id: 'p-k' };
  };
  const karlach = (jauges: Record<string, number> = {}) => {
    const f = RF.convertirFiche(reelle('Karlach', 'p-c'), { ...RF.refonteVierge(classeParId.get('guerrier')!, 3), rangs: { 'guerrier.soldat': 3, 'guerrier.peuple': 2 } });
    return { ...f, id: 'p-c', refonte: { ...f.refonte, jauges: { ...f.refonte.jauges, ...jauges } } };
  };

  it('onglet Actions seulement pour une fiche de la refonte (1b)', () => {
    const v1 = render(FicheVivante, { props: { fiche: reelle('Karlach', 'p-c'), modifiable: true } });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Combat', 'Capacités', 'Équipement', 'Suivi et notes']);
    v1.unmount();
    render(FicheVivante, { props: { fiche: karlach(), modifiable: true } });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Combat', 'Capacités', 'Actions', 'Équipement', 'Suivi et notes']);
  });

  it('jauges dans l’en-tête (7a) : − et + écrivent seulement les jauges, bornées', async () => {
    render(FicheVivante, { props: { fiche: karlach(), modifiable: true } });
    expect(screen.getByTestId('jauge-endurance').textContent).toBe('4');
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer 1 Endurance' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter 1 Endurance' }));
    expect(refonte.modifierJauges.mock.calls.map((c) => (c[1] as { endurance: number }).endurance)).toEqual([3, 4]);
    expect(refonte.modifierJauges.mock.calls[0]![0]).toBe('p-c');
  });

  it('Plongée au-delà de 6 : +1 Corruption d’Âme et l’annonce du palier de mutation (9a, 10a) ; « Fin du combat »', async () => {
    render(FicheVivante, { props: { fiche: karlach({ plongee: 6, corruptionAme: 0 }), modifiable: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter 1 Plongée' }));
    await waitFor(() => expect(refonte.modifierJauges).toHaveBeenCalledWith('p-c', expect.objectContaining({ plongee: 7, corruptionAme: 1 })));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('La Plongée dépasse 6 : +1 Corruption d’Âme. Palier de mutation 1 franchi : mutation à tirer avec le MJ.'));
    await fireEvent.click(screen.getByRole('button', { name: 'Fin du combat' }));
    await waitFor(() => expect(refonte.modifierJauges).toHaveBeenLastCalledWith('p-c', expect.objectContaining({ plongee: 0 })));
  });

  it('lecture seule : jauges affichées, sans bouton', () => {
    render(FicheVivante, { props: { fiche: karlach({ plongee: 2 }), modifiable: false } });
    expect(screen.getByTestId('jauge-plongee').textContent).toBe('2');
    expect(screen.queryByRole('button', { name: /^Ajouter 1 / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fin du combat' })).toBeNull();
  });

  it('Actions : un clic lance l’attaque magique et les dégâts au journal (15b) ; la sauvegarde montre son DD', async () => {
    const f = kylhian();
    render(FicheVivante, { props: { fiche: f, modifiable: true } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    const trait = within(screen.getByRole('listitem', { name: 'Trait arcanique' }));
    expect(trait.getByText('palier II')).toBeTruthy();
    const bouton = trait.getByRole('button', { name: 'Lancer Trait arcanique : attaque magique' });
    await fireEvent.click(bouton);
    const formule = bouton.textContent!.replace('Attaque ', '');
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Trait arcanique : attaque magique', formule, f.nom);
    await fireEvent.click(trait.getByRole('button', { name: 'Lancer Trait arcanique : dégâts' }));
    expect(journal.lancerEtNoter).toHaveBeenLastCalledWith('Trait arcanique : dégâts', '1d6', f.nom);
    expect(within(screen.getByRole('listitem', { name: 'Choc' })).getByText(/^DD \d+, sauvegarde de FOR$/)).toBeTruthy();
  });

  it('Actions : hors combat (4a), seulement ce qui a un usage hors combat, avec son coût réduit ; tri par voie (2a)', async () => {
    render(FicheVivante, { props: { fiche: kylhian(), modifiable: true } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(screen.getByRole('heading', { name: 'Attaques d’arme' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Par voie' }));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toContain('Voie de l’école');
    await fireEvent.click(screen.getByRole('button', { name: 'Hors combat' }));
    expect(screen.queryByRole('listitem', { name: 'Attaque' })).toBeNull();
    expect(within(screen.getByRole('listitem', { name: 'Choc' })).getByText(/2 PP hors combat/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Lancer / })).toBeNull();
  });

  it('lecture seule : les actions sans bouton de jet', async () => {
    render(FicheVivante, { props: { fiche: kylhian(), modifiable: false } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(screen.queryByRole('button', { name: /^Lancer / })).toBeNull();
    expect(screen.getByRole('region', { name: 'Magie' })).toBeTruthy();
  });
});
