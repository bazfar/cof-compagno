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
const montee = vi.hoisted(() => ({ monterNiveau: vi.fn(async (_id: string, _m: unknown) => ({ fiche: { niveau: 4 }, pvGagnes: 7 }) as unknown) }));
vi.mock('../../src/lib/actions/montee', () => montee);
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);

const { joueurs, persos, portraits } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { default: FicheVivante } = await import('../../src/composants/FicheVivante.svelte');
const { default: GroupeMj } = await import('../../src/composants/GroupeMj.svelte');
const E = await import('../../src/lib/regles/equipement');

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, id: string, uid = 'alice') => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => f.mockClear());
  Object.values(journal).forEach((f) => f.mockClear());
  montee.monterNiveau.mockClear();
  crans.donnerCran.mockReset();
  crans.donnerCran.mockResolvedValue(0);
  for (const k of Object.keys(portraits)) delete portraits[k];
  persos.elements = [];
  joueurs.elements = [];
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
    await fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
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
    await fireEvent.click(screen.getByRole('button', { name: 'Capacités' }));
    expect(screen.getByText(/Spécimen d'élite/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Suivi' }));
    expect(screen.getByText('Veines sombres')).toBeTruthy();
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
    const lignes = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(lignes.map((l) => l.querySelector('strong')?.textContent)).toEqual([vhorgar.nom, karlach.nom]);
    expect(within(lignes[0]!).getByText('joué')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: `Ajouter un PV à ${vhorgar.nom}` }));
    expect(actions.modifierPV).toHaveBeenCalledWith('p-v', (vhorgar.pvActuel ?? vhorgar.pvMax) + 1, vhorgar.pvMax);
    await fireEvent.click(within(lignes[0]!).getByRole('button', { name: 'Fiche' }));
    await waitFor(() => expect(screen.getByRole('region', { name: `Fiche de ${vhorgar.nom}` })).toBeTruthy());
  });
});

describe('onglet Équipement (L2.4)', () => {
  const ouvrir = async (fiche: ReturnType<typeof reelle>, mj = false) => {
    render(FicheVivante, { props: { fiche, modifiable: true, mj } });
    await fireEvent.click(screen.getByRole('button', { name: 'Équipement' }));
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
    await fireEvent.click(screen.getByRole('button', { name: 'Caractéristiques' }));
    const force = vue.caracs.find((c) => c.nom === 'Force')!;
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer un test de Force' }));
    const formule = force.mod === 0 ? '1d20' : `1d20${force.mod > 0 ? '+' : ''}${force.mod}`;
    expect(journal.lancerEtNoter).toHaveBeenCalledWith('Test de Force', formule, k.nom);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(`Test de Force : ${formule} → `));
  });

  it('lecture seule : aucune valeur à lancer, ni au combat ni dans les caractéristiques', async () => {
    render(FicheVivante, { props: { fiche: reelle('Kylhian', 'p-k'), modifiable: false } });
    expect(screen.queryByRole('button', { name: /^Lancer/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Caractéristiques' }));
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

  it('MJ : + et − par PJ avec le motif ; « +1 cran aux PJ joués » ne touche que les joués', async () => {
    session.uid = 'mj';
    joueurs.elements = [{ id: 'carol', nom: 'Carol', rejointLe: 1, persoActif: 'p-v' }];
    const karlach = reelle('Karlach', 'p-c');
    const vhorgar = reelle('Vhorgar', 'p-v', 'carol');
    persos.elements = [vhorgar, karlach];
    render(GroupeMj);
    await fireEvent.input(screen.getByLabelText('Motif du cran'), { target: { value: 'Le pont tenu' } });
    await fireEvent.click(screen.getByRole('button', { name: `Donner un cran à ${karlach.nom}` }));
    expect(crans.donnerCran).toHaveBeenLastCalledWith('p-c', 1, 'Le pont tenu');
    await fireEvent.click(screen.getByRole('button', { name: `Retirer un cran à ${karlach.nom}` }));
    expect(crans.donnerCran).toHaveBeenLastCalledWith('p-c', -1, 'Le pont tenu');
    crans.donnerCran.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: '+1 cran aux PJ joués' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Un cran donné à 1 PJ joué.'));
    expect(crans.donnerCran.mock.calls).toEqual([['p-v', 1, 'Le pont tenu']]);
    expect(screen.getByTestId(`crans-${karlach.id}`).textContent).toMatch(/^\d+ \/ \d+$/);
  });

  it('MJ : un refus (aucun cran à retirer) s’affiche', async () => {
    session.uid = 'mj';
    const karlach = reelle('Karlach', 'p-c');
    persos.elements = [karlach];
    crans.donnerCran.mockRejectedValueOnce(new crans.RefusCran('Aucun cran à retirer : un niveau acquis ne se perd pas.'));
    render(GroupeMj);
    expect((screen.getByRole('button', { name: '+1 cran aux PJ joués' }) as HTMLButtonElement).disabled).toBe(true);
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
