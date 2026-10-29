import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * TESTS DE COMPOSANTS — les monstres avancés (lot L6.6a, décisions de
 * Thomas du 28/10/2026), côté MJ : CapacitesMj (immunités 8a, résistances
 * légendaires 7a, capacités 2a 3a 10a), les attaques du panneau (leur
 * effet et leur limite, le jet suivant, la poussée : 6b) et Curée dans
 * CombatMj (9a).
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
  attaqueSurInvocation: vi.fn(async (..._a: unknown[]) => ({})),
  repousserDe: vi.fn(async (..._a: unknown[]) => 2),
}));
const monstresActions = vi.hoisted(() => ({
  cleCapacite: (nom: string) => `c:${nom}`,
  jouerCapaciteMonstre: vi.fn(async (..._a: unknown[]) => 'Souffle sur Kargash : rien'),
  corrigerLegendaire: vi.fn(async (..._a: unknown[]) => {}),
  jouerCurees: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('../../src/lib/actions/monstres', () => monstresActions);
vi.mock('../../src/lib/actions/attaques', () => attaques);
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
vi.mock('../../src/lib/magasins/persos.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPersos);
vi.mock('../../src/lib/magasins/presents.svelte', async () => (await import('./faux-magasins.svelte')).magasinsPresents);
vi.mock('../../src/lib/magasins/bestiaire.svelte', async () => (await import('./faux-magasins.svelte')).magasinsBestiaire);
vi.mock('../../src/lib/magasins/rencontres.svelte', async () => (await import('./faux-magasins.svelte')).magasinsRencontres);
vi.mock('../../src/lib/magasins/portraits-jetons.svelte', () => ({ suivrePortraitsJetons: () => ({ images: {}, suivre: () => {}, arreter: () => {} }) }));
vi.mock('../../src/composants/CarteTable.svelte', async () => ({ default: (await import('./FauxCarteTable.svelte')).default }));

const { table, jetonsScene, joueurs, persos, bestiaire, armesBestiaire, armuresBestiaire, rencontres, combatDoc, combattants } = await import('./faux-magasins.svelte');
const { session } = await import('../../src/lib/session.svelte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { carteFaux } = await import('./faux-magasins.svelte');
const { default: CombatMj } = await import('../../src/composants/CombatMj.svelte');
const { default: PanneauCombat } = await import('../../src/composants/PanneauCombat.svelte');
const { default: CapacitesMj } = await import('../../src/composants/CapacitesMj.svelte');
type Combattant = import('../../src/lib/schemas/combat').Combattant;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const BESTIAIRE: { id: string }[] = JSON.parse(readFileSync('src/donnees/bestiaire.json', 'utf8')).monstres;
const reelle = (nom: string, id: string, uid: string) => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), uid, 1).fiche, id });
const pj = (id: string, c: Partial<Combattant> = {}) => ({
  id: `pj-${id}`, genre: 'pj' as const, nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: null as number | null, de: null as number | null, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}) => ({
  id: `m-r1-${id}`, genre: 'monstre' as const, nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: null as number | null, de: null as number | null, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13 as number | null, armure: 0, resistances: { physique: 1, magique: 1 }, mortSucces: 0, mortEchecs: 0, mort: false, etats: [] as never[], usages: {} as Record<string, number>, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false, sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const combat = (c: Record<string, unknown> = {}) => ({ nom: 'Les goules du cellier', scene: 'cave', rencontre: 'r1', statut: 'encours' as const, round: 2, tour: 6, actif: null as string | null, porteesLibres: false, creeLe: 1, closLe: null, ...c });
const k = () => reelle('Kargash', 'p1', 'alice');
const moi = (c: Partial<Combattant> = {}) => pj('p1', { nom: 'Kargash', perso: 'p1', uid: 'alice', initiative: 11, de: 10, ...c });
const scene = { colonnes: 20, lignes: 20, murs: [], obstacles: [], portes: [] } as never;
const carte = (gx: number) => ({ scene, jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 2, cy: 2 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: gx, cy: 2 }] });

beforeEach(() => {
  session.table = 't1';
  session.uid = 'mj';
  Object.values(attaques).forEach((f) => f.mockClear());
  monstresActions.jouerCapaciteMonstre.mockClear();
  monstresActions.corrigerLegendaire.mockClear();
  monstresActions.jouerCurees.mockClear();
  actionsCarte.marquerMort.mockClear();
  armesBestiaire.donnees = null;
  armuresBestiaire.donnees = null;
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

describe('CapacitesMj : immunités et résistances légendaires (7a, 8a)', () => {
  const modele = (x: Record<string, unknown> = {}) => ({ id: 'connetable', nom: 'Connétable', capacitesSpeciales: [], ...x }) as never;
  const rendre = (m: ReturnType<typeof monstre>, x: Record<string, unknown> = {}) =>
    render(CapacitesMj, { props: { idCombat: 'c1', combat: combat(), monstre: m, modele: modele(x), combattants: [m], fiches: new Map(), carte: null } as never });

  it('ses immunités, et ce que le MJ applique lui-même ; le compteur des résistances, corrigé d’un bouton', async () => {
    const m = monstre('a', { nom: 'Connétable', boss: true, immunites: ['effroi', 'aveugle'], legendaire: 3, usages: { legendaire: 1 } });
    rendre(m, { immunites: ['effrayee', 'paralysee'], immunitesConditionnelles: [{ etats: ['charmee'], condition: 'de jour' }] });
    const imm = screen.getByTestId('immunites');
    expect(imm.textContent!.replace(/\s+/g, ' ').trim()).toBe('Immunisé : Effroi, Aveuglé. Au MJ : immunisé : paralysee.Au MJ : immunisé à charmee : de jour.');
    expect(screen.getByTestId('legendaire').textContent).toBe('Résistance légendaire : 2/3');
    await fireEvent.click(screen.getByRole('button', { name: 'Une résistance légendaire de moins' }));
    expect(monstresActions.corrigerLegendaire).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), 1);
    await fireEvent.click(screen.getByRole('button', { name: 'Une résistance légendaire de plus' }));
    expect(monstresActions.corrigerLegendaire).toHaveBeenLastCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), -1);
  });

  it('aux bornes, le bouton est éteint ; sans immunité ni résistance, rien ; une immunité au MJ seule', () => {
    const r = rendre(monstre('a', { legendaire: 2, usages: { legendaire: 2 } }));
    expect((screen.getByRole('button', { name: 'Une résistance légendaire de moins' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Une résistance légendaire de plus' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('immunites')).toBeNull();
    r.unmount();
    const r2 = rendre(monstre('a', { legendaire: 2 }));
    expect((screen.getByRole('button', { name: 'Une résistance légendaire de plus' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Une résistance légendaire de moins' }) as HTMLButtonElement).disabled).toBe(false);
    r2.unmount();
    const r3 = rendre(monstre('a'));
    expect(screen.queryByTestId('legendaire')).toBeNull();
    expect(screen.queryByTestId('immunites')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Capacités' })).toBeNull();
    expect(screen.queryByText('Capacités spéciales')).toBeNull();
    r3.unmount();
    rendre(monstre('a'), { immunites: ['paralysee'] });
    expect(screen.getByTestId('immunites').textContent!.trim()).toBe('Au MJ : immunisé : paralysee.');
  });
});

describe('CapacitesMj : les capacités (2a, 3a, 10a)', () => {
  const souffle = { nom: 'Souffle', description: 'Un cône de feu.', mecanique: { type: 'limitee', actionBonus: true, usage: { frequence: '1x/combat' }, cible: 'ennemi', portee: 6, zone: null, jetSauvegardeFixe: { carac: 'SAG', dd: 13 }, effets: [{ type: 'degats', formule: '2d6' }] } };
  const soin = { nom: 'Soin', description: 'Soigne.', mecanique: { type: 'activable', usage: { frequence: '2x/tour' }, cible: 'allie', portee: null, zone: null, jetAttaque: 5, effets: [{ type: 'soin', formule: '1d6' }] } };
  const vague = { nom: 'Vague', description: 'Tous.', mecanique: { type: 'limitee', usage: { frequence: '1x/recharge' }, recharge: 3, cible: 'zone', portee: null, zone: 6, effets: [] } };
  const parade = { nom: 'Parade', description: 'Pare.', mecanique: { type: 'activable', reactionCout: 1, usage: { frequence: '1x/recharge' }, cible: 'soi', portee: null, zone: null, effets: [] } };
  const libre = { nom: 'Cri', description: 'Crie.', mecanique: { type: 'activable', usage: { frequence: 'libre' }, cible: 'aucune', portee: null, zone: null, effets: [] } };
  const illisible = { nom: 'Étrange', description: 'Au MJ.', mecanique: { type: 'autre' } };
  const modele = { id: 'x', nom: 'X', capacitesActives: [souffle, soin, vague, parade, libre, illisible], capacitesSpeciales: [{ nom: 'Curée', description: 'Ils se ruent.' }] } as never;
  const tous = (m: ReturnType<typeof monstre>) => [m, monstre('b', { nom: 'Gob' }), monstre('c', { nom: 'Tombé', aTerre: true }), monstre('d', { nom: 'Mort', mort: true }), moi(), pj('p2', { nom: 'Hermione', aTerre: true }), pj('p3', { nom: 'Défunt', mort: true })];
  const rendre = (m = monstre('a', { nom: 'Chef' })) => render(CapacitesMj, { props: { idCombat: 'c1', combat: combat(), monstre: m, modele, combattants: tous(m), fiches: new Map(), carte: null } as never });
  const cases = (nom: string) => within(screen.getByRole('group', { name: `Cibles de ${nom}` })).getAllByRole('checkbox').map((c) => c.parentElement!.textContent!.trim());

  it('la liste : ce qu’elle prend, sa limite, sa portée, son jet ; les cibles possibles ; les illisibles et les spéciales en texte', () => {
    rendre();
    const liste = screen.getByRole('list', { name: 'Capacités de Chef' });
    const lignes = within(liste).getAllByRole('listitem').map((l) => l.textContent!.replace(/\s+/g, ' ').trim());
    expect(lignes[0]).toMatch(/^Souffle action bonus · 1×\/combat · 4 cases · Volonte 13 Un cône de feu\./);
    expect(lignes[1]).toMatch(/^Soin action · 2×\/round · attaque \+5 Soigne\./);
    expect(lignes[2]).toMatch(/^Vague action · recharge 3 rounds · zone 6 m Tous\./);
    expect(lignes[3]).toMatch(/^Parade réaction · recharge 1 round Pare\./);
    expect(lignes[4]).toMatch(/^Cri action · à volonté Crie\./);
    expect(lignes[5]).toBe('Étrange au MJ : Au MJ.');
    expect(cases('Souffle')).toEqual(['Kargash', 'Hermione']);
    expect(cases('Soin')).toEqual(['Chef', 'Gob']);
    expect(cases('Vague')).toEqual(['Chef', 'Gob', 'Kargash', 'Hermione']);
    expect(screen.queryByRole('group', { name: 'Cibles de Parade' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Cibles de Cri' })).toBeNull();
    expect(screen.getByText('Capacités spéciales')).toBeTruthy();
    expect(screen.getByText('Ils se ruent.')).toBeTruthy();
  });

  it('« Jouer » : les cibles cochées (décochées, retirées) ; le texte rendu ; les cases repartent vides', async () => {
    rendre();
    const g = within(screen.getByRole('group', { name: 'Cibles de Souffle' }));
    await fireEvent.click(g.getByLabelText('Kargash'));
    await fireEvent.click(g.getByLabelText('Hermione'));
    await fireEvent.click(g.getByLabelText('Hermione'));
    await fireEvent.click(screen.getByRole('button', { name: 'Jouer Souffle' }));
    expect(monstresActions.jouerCapaciteMonstre).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ tour: 6 }),
      expect.objectContaining({ id: 'm-r1-a' }),
      expect.objectContaining({ nom: 'Souffle', prend: 'secondaire', portee: 4 }),
      ['pj-p1'],
      { combattants: expect.any(Array), fiches: expect.any(Map), carte: null, demon: null },
    );
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Souffle sur Kargash : rien');
    expect((g.getByLabelText('Kargash') as HTMLInputElement).checked).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Jouer Cri' }));
    expect(monstresActions.jouerCapaciteMonstre).toHaveBeenLastCalledWith('c1', expect.anything(), expect.anything(), expect.objectContaining({ nom: 'Cri' }), [], expect.anything());
  });

  it('une limite servie éteint son bouton et le dit ; un refus de l’app, une erreur, se lisent', async () => {
    rendre(monstre('a', { nom: 'Chef', usages: { 'n:c:Souffle': 1, 'r:c:Souffle': 1 } }));
    expect((screen.getByRole('button', { name: 'Jouer Souffle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Souffle : déjà servie ce combat.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Jouer Soin' }) as HTMLButtonElement).disabled).toBe(false);
    monstresActions.jouerCapaciteMonstre.mockRejectedValueOnce(new actions.RefusCombat('Coche ses cibles.'));
    await fireEvent.click(screen.getByRole('button', { name: 'Jouer Soin' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Coche ses cibles.');
    monstresActions.jouerCapaciteMonstre.mockRejectedValueOnce(new Error('réseau'));
    await fireEvent.click(screen.getByRole('button', { name: 'Jouer Soin' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Error: réseau'));
    monstresActions.jouerCapaciteMonstre.mockResolvedValueOnce(undefined as never);
    await fireEvent.click(screen.getByRole('button', { name: 'Jouer Soin' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('le panneau du MJ : les attaques du monstre (6b)', () => {
  const avec = (id: string, attaque: string, c: Partial<Combattant> = {}) => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'm-r1-a' });
    persos.elements = [k()];
    bestiaire.elements = [{ ...BESTIAIRE.find((m) => m.id === id)!, attaques: [{ nom: attaque, armeId: 'griffes', bonusAttaque: 4, effetSpecial: 'Texte v1.' }] }] as never;
    armesBestiaire.donnees = { liste: [{ id: 'griffes', nom: 'Griffes', type: 'arme', degats: '1d6', portee: 'contact', typedegats: 'physique' }] };
    combattants.elements = [monstre('a', { nom: 'Goule A', monstre: id, ...c }), moi()];
  };

  it('sous l’attaque, son effet ; touchée et repoussée, le jeton recule ; ses capacités sont là', async () => {
    avec('sanglier_de_rage', 'Charge');
    attaques.attaqueDeMonstre.mockResolvedValueOnce({ issue: { de: 15, bonus: 4, total: 19, def: 16, touche: true, critique: false, echecCritique: false }, net: 5, pv: 15, repousse: 2 } as never);
    render(PanneauCombat, { props: { carte: carte(3) } });
    expect(screen.getByText('FOR 13 ou Renversé, repoussé de 2 cases · MJ : Seulement après 6 m en ligne droite.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Charge +4 · 1d6' }));
    await waitFor(() =>
      expect(attaques.repousserDe).toHaveBeenCalledWith(2, 'c1', expect.objectContaining({ tour: 6 }), expect.objectContaining({ id: 'm-r1-a' }), expect.objectContaining({ id: 'pj-p1' }), carte(3), expect.any(Array), expect.any(Map), 'Goule A'),
    );
    expect(attaques.attaqueDeMonstre.mock.calls[0]).toHaveLength(6);
  });

  it('sans poussée ou sans carte, pas de recul ; sans effet traduit, le texte du bestiaire', async () => {
    avec('sanglier_de_rage', 'Charge');
    attaques.attaqueDeMonstre.mockResolvedValueOnce({ issue: { de: 15, bonus: 4, total: 19, def: 16, touche: true, critique: false, echecCritique: false }, net: 5, pv: 15, repousse: 2 } as never);
    render(PanneauCombat, { props: { carte: null } });
    await fireEvent.click(screen.getByLabelText('Passer outre la portée'));
    await fireEvent.click(screen.getByRole('button', { name: 'Charge +4 · 1d6' }));
    await waitFor(() => expect(attaques.attaqueDeMonstre).toHaveBeenCalled());
    await fireEvent.click(screen.getByRole('button', { name: 'Charge +4 · 1d6' }));
    await waitFor(() => expect(attaques.attaqueDeMonstre).toHaveBeenCalledTimes(2));
    expect(attaques.repousserDe).not.toHaveBeenCalled();
    cleanup();
    avec('goblin_garde', 'Coup bas');
    render(PanneauCombat, { props: { carte: carte(3) } });
    expect(screen.getByText('Texte v1.')).toBeTruthy();
  });

  it('une attaque déjà servie ce combat : éteinte, et dite', () => {
    avec('goblin_garde', 'Javelot', { usages: { 'n:Javelot': 1, 'r:Javelot': 1 } });
    render(PanneauCombat, { props: { carte: carte(3) } });
    expect((screen.getByRole('button', { name: 'Javelot +4 · 1d6' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Javelot : déjà servie ce combat.')).toBeTruthy();
  });

  it('une attaque à deux jets : le jet suivant, sur la même cible ; les autres attaques attendent', async () => {
    avec('orc_elite', 'Double frappe');
    render(PanneauCombat, { props: { carte: carte(3) } });
    expect(screen.queryByRole('button', { name: /jet suivant/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Double frappe +4 · 1d6' }));
    const suivant = await screen.findByRole('button', { name: 'Double frappe : jet suivant (1)' });
    expect((screen.getByRole('button', { name: 'Double frappe +4 · 1d6' }) as HTMLButtonElement).disabled).toBe(true);
    expect((suivant as HTMLButtonElement).disabled).toBe(false);
    await fireEvent.click(suivant);
    await waitFor(() => expect(attaques.attaqueDeMonstre).toHaveBeenCalledTimes(2));
    expect(attaques.attaqueDeMonstre.mock.calls[1]![4]).toMatchObject({ id: 'pj-p1' });
    expect(attaques.attaqueDeMonstre.mock.calls[1]!.slice(6)).toEqual([expect.any(Function), false, true, null]);
    await waitFor(() => expect(screen.queryByRole('button', { name: /jet suivant/ })).toBeNull());
    expect((screen.getByRole('button', { name: 'Double frappe +4 · 1d6' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('le jet suivant vise la même cible ; un autre combattant choisi, il tombe', async () => {
    avec('orc_elite', 'Double frappe');
    persos.elements = [k(), reelle('Hermione', 'p2', 'bob')];
    combattants.elements = [...combattants.elements, pj('p2', { nom: 'Hermione', perso: 'p2', uid: 'bob' })];
    render(PanneauCombat, { props: { carte: null } });
    await fireEvent.click(screen.getByLabelText('Passer outre la portée'));
    const cible = screen.getByLabelText('Cible') as HTMLSelectElement;
    await fireEvent.change(cible, { target: { value: 'pj-p1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Double frappe +4 · 1d6' }));
    const suivant = (await screen.findByRole('button', { name: 'Double frappe : jet suivant (1)' })) as HTMLButtonElement;
    await fireEvent.change(cible, { target: { value: 'pj-p2' } });
    expect(suivant.disabled).toBe(true);
    await fireEvent.change(cible, { target: { value: 'pj-p1' } });
    expect(suivant.disabled).toBe(false);
    const qui = screen.getByLabelText('Combattant') as HTMLSelectElement;
    await fireEvent.change(qui, { target: { value: 'pj-p1' } });
    await fireEvent.change(qui, { target: { value: 'm-r1-a' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /jet suivant/ })).toBeNull());
  });

  it('ses capacités, sous ses attaques', () => {
    avec('loup_champion', 'Morsure');
    render(PanneauCombat, { props: { carte: carte(3) } });
    expect(screen.getByRole('list', { name: 'Capacités de Goule A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jouer Hurlement de commandement' })).toBeTruthy();
  });
});

describe('Curée dans CombatMj (9a)', () => {
  it('un cupide vu debout tombe : Curée pour sa famille, une fois ; un déjà tombé au chargement, non', async () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ actif: 'pj-p1' });
    persos.elements = [k()];
    bestiaire.elements = BESTIAIRE.filter((m) => m.id.startsWith('cupide_')) as never;
    const a = monstre('a', { nom: 'Recrue', monstre: 'cupide_recrue' });
    const b = monstre('b', { nom: 'Meneur', monstre: 'cupide_meneur' });
    const c = monstre('c', { nom: 'Vétéran', monstre: 'cupide_veteran', pv: 0, aTerre: true });
    combattants.elements = [a, b, c, moi()];
    render(CombatMj);
    await new Promise((r) => setTimeout(r, 0));
    expect(monstresActions.jouerCurees).not.toHaveBeenCalled();
    combattants.elements = [{ ...a, pv: 0, aTerre: true }, b, c, moi()];
    flushSync();
    await waitFor(() => expect(monstresActions.jouerCurees).toHaveBeenCalledTimes(1));
    expect(monstresActions.jouerCurees).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'm-r1-a' }), [
      { qui: expect.objectContaining({ id: 'm-r1-b' }), nom: 'Curée', changements: expect.arrayContaining([expect.objectContaining({ type: 'bonus', cible: 'm-r1-b', sur: 'attaque' })]) },
    ]);
    combattants.elements = [...combattants.elements];
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    expect(monstresActions.jouerCurees).toHaveBeenCalledTimes(1);
  });

  it('hors d’un combat en cours, rien', async () => {
    table.donnees = { sceneActive: 'cave', combat: 'c1' };
    combatDoc.donnees = combat({ statut: 'clos' as never });
    bestiaire.elements = BESTIAIRE.filter((m) => m.id.startsWith('cupide_')) as never;
    const a = monstre('a', { monstre: 'cupide_recrue' });
    combattants.elements = [a, monstre('b', { monstre: 'cupide_meneur' })];
    render(CombatMj);
    combattants.elements = [{ ...a, aTerre: true, pv: 0 }, monstre('b', { monstre: 'cupide_meneur' })];
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    expect(monstresActions.jouerCurees).not.toHaveBeenCalled();
  });
});
