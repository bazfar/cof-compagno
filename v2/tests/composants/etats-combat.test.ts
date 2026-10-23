import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — états, ressources et attaques spéciales en combat
 * (lot L6.3, décisions de Thomas du 23/10/2026) : la barre du joueur (ses
 * jauges et ses états 14a, il passe s'il n'agit pas 7b, les attaques
 * spéciales et leur coût 11a, Coup d'estoc au choix 12a, Précision 13a,
 * poser un état 4b et D) ; le panneau du MJ (poser, retirer) ; le client du
 * MJ (dégâts de début de tour 6a, ressources au démarrage et à la clôture
 * 9a) ; le bandeau des combattants (C).
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
  viser: vi.fn(async (..._a: unknown[]) => {}),
  decharger: vi.fn(async (..._a: unknown[]) => 1),
  poserEtatSur: vi.fn(async (..._a: unknown[]) => {}),
  retirerEtatDe: vi.fn(async (..._a: unknown[]) => {}),
  debutDeTour: vi.fn(async (..._a: unknown[]) => 0),
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
vi.mock('../../src/lib/magasins/portraits-jetons.svelte', () => ({ suivrePortraitsJetons: () => ({ images: {}, suivre: () => {}, arreter: () => {} }) }));
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));


const faux = await import('./faux-magasins.svelte');
const { table, persos, combatDoc, combattants, jetonsScene, joueurs } = faux;
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const F = await import('../../src/lib/fiche/refonte');
const { objetParId } = await import('../../src/lib/regles/donnees');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { classeParId } = await import('../../src/regles');
const { default: BarreCombat } = await import('../../src/composants/BarreCombat.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { default: CombatMj } = await import('../../src/composants/CombatMj.svelte');
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
const etat = (id: string, c: Partial<EtatCombat> = {}): EtatCombat => ({ id, rounds: 1, cumul: 1, charges: null, des: null, source: null, ...c });
const combat = (c: Record<string, unknown> = {}) => ({ nom: 'Goules', scene: 'cave', rencontre: 'r1', statut: 'encours' as const, round: 2, tour: 6, actif: 'pj-p1' as string | null, porteesLibres: false, creeLe: 1, closLe: null, ...c });
const carte = { scene: { colonnes: 10, lignes: 10, murs: [], obstacles: [], portes: [] } as never, jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 2 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 3, cy: 2 }] };
const guerrier = () => {
  const g = v2('Karlach', 'guerrier');
  return { ...g, equipement: { ...g.equipement, main_gauche: null } };
};
const barre = (o: Record<string, unknown> = {}) =>
  render(BarreCombat, { props: { fiche: guerrier(), idCombat: 'c1', combat: combat(), moi: pj('p1', { nom: 'Karlach' }), combattants: [pj('p1', { nom: 'Karlach' }), goule()], fiches: new Map(), carte, ...o } as never });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'alice';
  Object.values(actions).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
  Object.values(attaques).forEach((f) => f.mockClear());
  table.donnees = { sceneActive: 'cave', combat: 'c1' };
  persos.elements = [];
  combatDoc.donnees = null;
  combattants.elements = [];
  jetonsScene.elements = [];
  joueurs.elements = [];
});

describe('la barre du joueur (L6.3)', () => {
  it('ses jauges ; ses états avec leur règle, qu’il retire à son tour (14a)', async () => {
    const g = guerrier();
    barre({ moi: pj('p1', { etats: [etat('expose', { rounds: 2 })] }) });
    expect(screen.getByText(/^Endurance \d+\/\d+$/)).toBeTruthy();
    const liste = within(screen.getByRole('list', { name: 'Mes états' }));
    expect(liste.getByText('Exposé (2)')).toBeTruthy();
    expect(liste.getByText(/DEF/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer Exposé (2)' }));
    expect(attaques.retirerEtatDe).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'pj-p1' }), 'expose');
    expect(g.schemaVersion).toBe(2);
  });

  it('hors de son tour, ses états sans « retirer » ; un coup de bouclier qui touche ne demande pas de dégâts', async () => {
    const vue = barre({ combat: combat({ actif: 'm-r1-a' }), moi: pj('p1', { etats: [etat('expose', { rounds: 2 })] }) });
    expect(screen.queryByRole('button', { name: 'Retirer Exposé (2)' })).toBeNull();
    vue.unmount();
    const g = v2('Karlach', 'guerrier');
    attaques.attaquer.mockResolvedValueOnce({ de: 15, bonus: 5, total: 20, def: 13, touche: true, critique: false, echecCritique: false });
    barre({ fiche: g });
    await fireEvent.click(screen.getByRole('button', { name: 'Coup de bouclier · 2 Endurance' }));
    await screen.findByText('Touché : 20 contre DEF 13.');
    expect(screen.queryByRole('button', { name: /^Lancer les dégâts/ })).toBeNull();
  });

  it('7b : un état qui l’empêche d’agir le dit ; il garde la main et passe lui-même', () => {
    const { unmount } = barre({ moi: pj('p1', { etats: [etat('endormi')] }) });
    expect(screen.getByText('Tu ne peux pas agir ce tour : finis ton tour.')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: /^Contact · / })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^Fendre/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    barre({ moi: pj('p1', { etats: [etat('etourdi')] }) });
    expect(screen.getByText('Tu ne peux que te déplacer ce tour.')).toBeTruthy();
  });

  it('11a : l’attaque spéciale de son arme, avec son coût ; touchée, les dégâts à lancer', async () => {
    barre();
    await fireEvent.click(screen.getByRole('button', { name: 'Fendre · 2 Endurance' }));
    expect(attaques.attaquer).toHaveBeenCalledWith(
      'c1', expect.anything(), expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'm-r1-a' }),
      expect.objectContaining({ nom: 'Épée longue', mode: 'contact' }), expect.objectContaining({ id: 'p1' }), expect.any(Function),
      expect.objectContaining({ s: expect.objectContaining({ id: 'arme.fendre' }), estoc: undefined, carte }),
    );
    expect(await screen.findByRole('button', { name: /^Lancer les dégâts 2d8/ })).toBeTruthy();
  });

  it('12a : Coup d’estoc au choix, Déséquilibrer ou Repousser ; un hybride, une fois par combat', async () => {
    const g = guerrier();
    const r = { ...g, equipement: { ...g.equipement, main_droite: objetParId.get('rapiere') as never } };
    const vue = barre({ fiche: r });
    await fireEvent.click(screen.getByRole('button', { name: 'Coup d’estoc · Repousser · 2 Endurance' }));
    expect(attaques.attaquer.mock.calls.at(-1)![7]).toMatchObject({ estoc: 'repousse' });
    vue.unmount();
    const h = v2('Hermione', 'pretre');
    const pretre = { ...h, equipement: { ...h.equipement, main_gauche: null } };
    barre({ fiche: pretre, moi: pj('p1', { usages: { attaqueSpeciale: 1 } }) });
    expect((screen.getByRole('button', { name: 'Coup assommant · 1×/combat' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Attaque spéciale du combat faite.')).toBeTruthy();
  });

  it('13a : Précision vise ; la visée s’annonce', async () => {
    const g = guerrier();
    const p = { ...g, equipement: { ...g.equipement, main_droite: objetParId.get('pistolet') as never } };
    const vue = barre({ fiche: p });
    await fireEvent.click(screen.getByRole('button', { name: 'Précision · 2 Endurance' }));
    expect(attaques.viser).toHaveBeenCalledWith('c1', expect.anything(), expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'arme.precision' }), p);
    vue.unmount();
    barre({ fiche: p, moi: pj('p1', { visee: true }) });
    expect(screen.getByText('Tu as visé : ta prochaine attaque gagne +1d6 aux dégâts.')).toBeTruthy();
  });

  it('4b, D : à son tour, il pose un état sur qui il veut ; hors de son tour, non ; une cible non ciblable disparaît des cibles', async () => {
    const vue = barre({ combattants: [pj('p1', { nom: 'Karlach' }), goule(), goule({ id: 'm-r1-b', nom: 'Goule B', etats: [etat('banni')] })] });
    expect([...(screen.getByLabelText('Cible') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Goule A · DEF 13']);
    await fireEvent.change(screen.getByLabelText('État à poser'), { target: { value: 'etourdi' } });
    await fireEvent.input(screen.getByLabelText('Rounds'), { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Poser' }));
    expect(attaques.poserEtatSur).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), 'etourdi', 2, expect.any(String));
    await fireEvent.change(screen.getByLabelText('Sur qui'), { target: { value: 'pj-p1' } });
    await fireEvent.change(screen.getByLabelText('État à poser'), { target: { value: 'protege' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Poser' }));
    expect(attaques.poserEtatSur).toHaveBeenLastCalledWith('c1', expect.objectContaining({ id: 'pj-p1' }), 'protege', 2, expect.any(String));
    vue.unmount();
    barre({ combat: combat({ actif: 'm-r1-a' }) });
    expect(screen.queryByLabelText('État à poser')).toBeNull();
  });

  it('la DEF montrée au choix de la cible est celle que le jet visera : l’Exposé la baisse de 2, un bonus temporaire la monte', () => {
    const vue = barre({ combattants: [pj('p1', { nom: 'Karlach' }), goule({ etats: [etat('expose', { rounds: 2 })] })] });
    expect([...(screen.getByLabelText('Cible') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Goule A · DEF 11']);
    vue.unmount();
    barre({ combattants: [pj('p1', { nom: 'Karlach' }), goule({ etats: [etat('expose', { rounds: 2 })], bonus: [{ sur: 'DEF', valeur: 3, rounds: 2, consomme: false, typeDegats: null, source: 'Bénédiction' }] })] });
    expect([...(screen.getByLabelText('Cible') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Goule A · DEF 14']);
  });
});

describe('le MJ (L6.3)', () => {
  it('le panneau : les états du combattant, retirer, poser (sans durée : jusqu’à retrait)', async () => {
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule({ etats: [etat('expose', { source: 'Karlach' })] })];
    render(PanneauCombat);
    const liste = within(screen.getByRole('list', { name: 'États de Goule A' }));
    expect(liste.getByText('Exposé (1)')).toBeTruthy();
    expect(liste.getByText(/· Karlach/)).toBeTruthy();
    await fireEvent.click(liste.getByRole('button', { name: 'Retirer Exposé (1)' }));
    expect(attaques.retirerEtatDe).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), 'expose');
    await fireEvent.change(screen.getByLabelText('État à poser'), { target: { value: 'marque' } });
    await fireEvent.input(screen.getByLabelText('Rounds'), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Poser' }));
    expect(attaques.poserEtatSur).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), 'marque', null, 'MJ');
  });

  it('le panneau : un PJ que nul ne peut cibler n’est pas proposé aux attaques du monstre', () => {
    const { armesBestiaire, bestiaire } = faux;
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', race: ['mort-vivant'], dangerosite: 2, taille: 'moyenne', boss: false, init: 3, pv: 14, def: 13, attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }] }];
    armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] };
    persos.elements = [v1('Kargash', 'p1', 'alice'), v1('Hermione', 'p2', 'bob')];
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule(), pj('p1', { nom: 'Kargash' }), pj('p2', { nom: 'Hermione', uid: 'bob', etats: [etat('banni')] })];
    render(PanneauCombat);
    expect([...(screen.getByLabelText('Cible') as HTMLSelectElement).options].map((o) => o.textContent?.split(' · ')[0])).toEqual(['Kargash']);
    bestiaire.elements = [];
    armesBestiaire.donnees = null;
  });

  it('la DEF du monstre et la CA des PJ sont montrées telles que le jet les visera : l’Exposé les baisse de 2', () => {
    const { armesBestiaire, bestiaire } = faux;
    bestiaire.elements = [{ id: 'goule', nom: 'Goule', init: 3, pv: 14, def: 13, attaques: [{ nom: 'Griffes', armeId: 'griffes', bonusAttaque: 4, effetSpecial: null }] }];
    armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] };
    const kargash = v1('Kargash', 'p1', 'alice');
    persos.elements = [kargash];
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule({ etats: [etat('expose')] }), pj('p1', { nom: 'Kargash', etats: [etat('expose')] })];
    render(PanneauCombat);
    expect(screen.getByText('DEF 11')).toBeTruthy(); // 13 − 2
    const ca = vueFiche(kargash).stats.ca - 2;
    expect((screen.getByLabelText('Cible') as HTMLSelectElement).options[0]!.textContent).toMatch(new RegExp(`^Kargash · CA ${ca} ·`));
    bestiaire.elements = [];
    armesBestiaire.donnees = null;
  });

  it('6a : la main arrive à un combattant qui saigne : ses dégâts par tour, une fois', async () => {
    session.uid = 'mj';
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule({ etats: [etat('saignement')] }), pj('p1', { etats: [etat('saignement')], debutTour: 0 })];
    render(CombatMj);
    await waitFor(() => expect(attaques.debutDeTour).toHaveBeenCalledWith('c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'm-r1-a' }), null));
    combattants.elements = [...combattants.elements];
    flushSync();
    await new Promise((r) => setTimeout(r, 20));
    expect(attaques.debutDeTour).toHaveBeenCalledTimes(1);
  });

  it('6a : déjà joué ce tour, ou sans dégâts par tour : rien ; un PJ, avec sa fiche', async () => {
    session.uid = 'mj';
    const k = v1('Kargash', 'p1', 'alice');
    persos.elements = [k];
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    combattants.elements = [goule({ etats: [etat('saignement')], debutTour: 6 })];
    const vue = render(CombatMj);
    await new Promise((r) => setTimeout(r, 20));
    expect(attaques.debutDeTour).not.toHaveBeenCalled();
    vue.unmount();
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    combattants.elements = [pj('p1', { etats: [etat('expose')] })];
    const v2_ = render(CombatMj);
    await new Promise((r) => setTimeout(r, 20));
    expect(attaques.debutDeTour).not.toHaveBeenCalled();
    v2_.unmount();
    combattants.elements = [pj('p1', { etats: [etat('saignement')] })];
    render(CombatMj);
    await waitFor(() => expect(attaques.debutDeTour).toHaveBeenCalledWith('c1', expect.anything(), expect.objectContaining({ id: 'pj-p1' }), expect.objectContaining({ id: 'p1' })));
  });

  it('9a : au démarrage, le Ki d’un moine repart ; à la clôture, la Plongée revient à 0', async () => {
    session.uid = 'mj';
    const m = v2('Hyrma', 'moine', { elementDepart: 'psionique' });
    const moine = { ...m, refonte: { ...m.refonte, jauges: { ...m.refonte.jauges, ki: 0, plongee: 3 } } };
    persos.elements = [moine];
    jetonsScene.elements = [
      { id: 'pj-p1', genre: 'pj', nom: 'Hyrma', couleur: '#2980b9', cx: 1, cy: 1, proprietaire: 'alice', creeLe: 1 },
      { id: 'm-x', genre: 'monstre', nom: 'Rat', couleur: '#c0392b', cx: 6, cy: 5, proprietaire: null, creeLe: 1 },
    ];
    table.donnees = { sceneActive: 'cave', combat: null };
    const vue = render(CombatMj);
    await fireEvent.input(screen.getByLabelText('PV de Rat'), { target: { value: '4' } });
    await fireEvent.input(screen.getByLabelText('DEF de Rat'), { target: { value: '10' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Démarrer le combat' }));
    await waitFor(() => expect(actions.demarrerCombat).toHaveBeenCalled());
    expect((actions.demarrerCombat.mock.calls[0] as unknown[])[3]).toEqual([{ perso: 'p1', jauges: { ki: 1 } }]);
    vue.unmount();
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: null });
    combattants.elements = [pj('p1')];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(CombatMj);
    await fireEvent.click(screen.getByRole('button', { name: 'Clore le combat' }));
    await waitFor(() => expect(actions.cloreCombat).toHaveBeenCalledWith('c1', [{ perso: 'p1', jauges: { plongee: 0 } }]));
  });
});

describe('le bandeau des combattants (C)', () => {
  it('dans l’ordre d’initiative : PV, états, qui joue ; un mort grisé ; hors combat, rien', () => {
    const k = v1('Kargash', 'p1', 'alice');
    persos.elements = [k];
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    combattants.elements = [pj('p1', { nom: 'Kargash', initiative: 12, etats: [etat('expose', { rounds: 2 })] }), goule({ initiative: 15 }), goule({ id: 'm-r1-c', nom: 'Goule C', initiative: 2, pv: 0, aTerre: true })];
    const vue = render(BandeauCombat);
    const items = within(screen.getByRole('list', { name: 'Combattants' })).getAllByRole('listitem').filter((l) => l.parentElement?.getAttribute('aria-label') === 'Combattants');
    expect(items.map((l) => l.querySelector('.nom')?.textContent)).toEqual(['Goule A', 'Kargash', 'Goule C']);
    expect(items[0]!.querySelector('.chiffres')?.textContent).toBe('9/14');
    expect(items[1]!.getAttribute('aria-current')).toBe('true');
    expect(within(items[1]!).getByText('Exposé (2)').getAttribute('title')).toMatch(/DEF/);
    expect(items[2]!.classList.contains('terre')).toBe(true);
    expect(items[1]!.querySelector('.initiale')?.textContent).toBe('K');
    vue.unmount();
    combatDoc.donnees = combat({ statut: 'clos' });
    render(BandeauCombat);
    expect(screen.queryByRole('list', { name: 'Combattants' })).toBeNull();
  });
});
