import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Zones au sol (lot L6.4b1, décisions de Thomas du 24/10/2026) : 1a (cases
 * du MJ, infranchissable), 2a (difficile : 2 cases), 3a (case dangereuse,
 * une fois par tour), 4a (cachée jusqu'au déclenchement), 5a (un seul
 * modèle), 6a (le sort se rejoue, lanceur figé), 7a (qui déclenche), 8a
 * (une aura suit son lanceur), 9a (décompte à la fin du tour du lanceur),
 * 10a (pièges à usage unique), 11a (terrains), 16a (couleurs).
 */

const appels: { fn: string; chemin: string; donnees?: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lu = (chemin: string) => ({ exists: () => base.has(chemin), data: () => base.get(chemin) });
  const ref = (chemin: string) => ({ chemin, id: chemin.split('/').pop() });
  return {
    increment: (n: number) => ({ increment: n }),
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) => (p.length ? ref(p.join('/')) : ref(`${(parent as { chemin: string }).chemin}/auto${++n}`)),
    deleteField: () => '<supprimé>',
    updateDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees });
    },
    setDoc: async (r: { chemin: string }, donnees: unknown) => {
      appels.push({ fn: 'setDoc', chemin: r.chemin, donnees });
    },
    deleteDoc: async (r: { chemin: string }) => {
      appels.push({ fn: 'deleteDoc', chemin: r.chemin });
    },
    writeBatch: () => {
      const ecritures: typeof appels = [];
      return {
        set: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'lot.set', chemin: r.chemin, donnees }),
        update: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'lot.update', chemin: r.chemin, donnees }),
        commit: async () => {
          appels.push(...ecritures);
        },
      };
    },
    getDocs: async (q: { chemin: string; w?: { champ: string; v: unknown } }) => ({
      docs: [...base.entries()]
        .filter(([k, d]) => k.startsWith(`${q.chemin}/`) && !k.slice(q.chemin.length + 1).includes('/') && (!q.w || d[q.w.champ] === q.w.v))
        .map(([k, d]) => ({ id: k.split('/').pop(), data: () => d })),
    }),
    query: (c: { chemin: string }, w?: { champ: string; v: unknown }) => ({ ...c, w }),
    where: (champ: string, _op: string, v: unknown) => ({ champ, v }),
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => lu(r.chemin),
        update: (r: { chemin: string }, donnees: unknown) => ecritures.push({ fn: 'tx.update', chemin: r.chemin, donnees }),
        delete: (r: { chemin: string }) => ecritures.push({ fn: 'tx.delete', chemin: r.chemin }),
      };
      const r = await f(tx);
      appels.push(...ecritures);
      return r;
    },
  };
});
const journal = vi.hoisted(() => ({ noterJet: vi.fn(async (..._a: unknown[]) => {}), lancerEtNoter: vi.fn() }));
vi.mock('../../src/lib/actions/journal', () => journal);
vi.mock('../../src/lib/actions/carte', () => ({ marquerMort: vi.fn() }));

const { session } = await import('../../src/lib/session.svelte');
const Z = await import('../../src/lib/combat/zone');
const S = await import('../../src/lib/combat/sorts');
const P = await import('../../src/lib/combat/poussee');
const L = await import('../../src/lib/actions/sorts-combat');
const X = await import('../../src/lib/actions/attaques');
const A = await import('../../src/lib/actions/combat');
const F = await import('../../src/lib/fiche/refonte');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { degatsSurPj } = await import('../../src/lib/combat/attaques-pj');
const ZS = await import('../../src/lib/combat/zones-sol');
const EZ = await import('../../src/lib/combat/effets-zone');
const AZ = await import('../../src/lib/actions/zones');
const I = await import('../../src/lib/battlemap/interactions');
const G = await import('../../src/lib/battlemap/geometrie');
const { schemaZoneSol } = await import('../../src/lib/schemas/zones');
const { classeParId } = await import('../../src/regles');
type Combattant = import('../../src/lib/schemas/combat').Combattant;
type ZoneSol = import('../../src/lib/schemas/zones').ZoneSol;
type ZoneActive = import('../../src/lib/combat/zones-sol').ZoneActive;
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;

const FICHES = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const v1 = (nom: string, id = 'p1'): Fiche & { id: string } => ({ ...ficheDepuisV1(FICHES.find((f: { nom: string }) => f.nom.startsWith(nom)), 'alice', 1).fiche, id });
const v2 = (nom: string, classe: string, choix: Partial<RefonteFiche> = {}, id = 'p1'): FicheV2 & { id: string } => {
  const f = { ...v1(nom, id), classe };
  return { ...F.convertirFiche(f as never, { ...F.refonteVierge(classeParId.get(classe)!, f.niveau), ...choix }), id };
};
/** Un Magicien de niveau 9, l'école au rang voulu. */
const mageN = (ecole: string, rang: number, choix: Partial<RefonteFiche> = {}): FicheV2 & { id: string } => {
  const brut = { ...v1('Shyrion'), classe: 'magicien', niveau: 9 };
  return { ...F.convertirFiche(brut as never, { ...F.refonteVierge(classeParId.get('magicien')!, 9), ecole, elementDepart: 'feu', rangs: { 'magicien.ecole': rang, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'], ...choix } as never), id: 'p1', ppActuel: 30 } as FicheV2 & { id: string };
};
const mage = (id = 'p1') => v2('Shyrion', 'magicien', { ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'] }, id);
const neutre = { physique: 1, magique: 1 };
const pj = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `pj-${id}`, genre: 'pj', nom: id, perso: id, uid: `u-${id}`, monstre: null, modInit: 1, initiative: 10, de: 9, pv: null, pvMax: null, aTerre: false,
  mvtBase: 5, def: null, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  sauvegardes: null, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
const monstre = (id: string, c: Partial<Combattant> = {}): Combattant & { id: string } => ({
  id: `m-r1-${id}`, genre: 'monstre', nom: id, perso: null, uid: null, monstre: 'goule', modInit: 3, initiative: 15, de: 12, pv: 14, pvMax: 14, aTerre: false,
  mvtBase: 5, def: 13, armure: 0, resistances: neutre, mortSucces: 0, mortEchecs: 0, mort: false, etats: [], usages: {}, gainTouche: { round: 0, montant: 0 }, debutTour: 0, visee: false,
  sauvegardes: { FOR: 1, DEX: 2, CON: 1, Volonte: 0 }, boss: false, demonOuMortVivant: false, pvTemp: 0, bonus: [], tourActions: 0, principale: false, secondaire: false, mvt: 0, sprint: false, creeLe: 1, maitre: null, invocation: null, concentration: null, ...c,
});
/** Une suite de dés : [valeur, faces]. */
const suite = (...v: [number, number][]) => {
  let i = 0;
  return () => {
    const x = v[i++];
    if (!x) throw new Error('plus de dés prévus');
    return (x[0] - 0.5) / x[1];
  };
};
const enBase = (c: Combattant & { id: string }) => base.set(`${C}/${c.id}`, (({ id: _i, ...x }) => x)(c));
const C = 'tables/t1/combats/c1/combattants';
const combat = { tour: 6, round: 2, scene: 'cave', actif: 'pj-p1', porteesLibres: false };
const scene = (murs: [[number, number], [number, number]][] = [], obstacles: [[number, number], [number, number]][] = []) => ({ colonnes: 10, lignes: 10, murs, obstacles, portes: [] }) as never;

const fige = { id: 'pj-p1', nom: 'Shyrion', camp: 'pj' as const, def: 12, sauvegardes: { FOR: 0, DEX: 1, CON: 0, Volonte: 2 }, modMagie: 3, attaqueMagique: 5, niveau: 5, mods: { INT: 3, DEX: 2 } };
/** Une zone : une case en (5, 5) par défaut, du MJ, sans rien. */
const zone = (z: Partial<ZoneSol> = {}, id = 'z1'): ZoneActive => ({
  id, nom: 'Zone', nature: null, cases: [{ dx: 0, dy: 0 }], ancre: { cx: 5, cy: 5 }, lanceur: null, camp: null, filtre: 'tous', quand: null, sort: null, danger: null, dd: null, texte: null,
  usageUnique: false, cachee: false, rounds: null, declenchements: {}, creeLe: 1, ...z,
});
const j = (id: string, cx: number, cy: number, genre: 'pj' | 'monstre' = 'monstre') => ({ id, genre, cx, cy });
const Z0 = 'tables/t1/combats/c1/zones';

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
  session.nom = 'Alice';
  session.etape = 'joueur';
  journal.noterJet.mockClear();
});

describe('les zones sur la carte (5a, 8a, 16a)', () => {
  it('leurs cases : autour de l’ancre, ou du jeton du lanceur (une aura le suit) ; rien s’il n’est plus là', () => {
    const z = zone({ cases: [{ dx: 0, dy: 0 }, { dx: 1, dy: -1 }] });
    expect(ZS.casesDe(z, [])).toEqual([{ cx: 5, cy: 5 }, { cx: 6, cy: 4 }]);
    const aura = zone({ ancre: null, lanceur: 'pj-p1', cases: [{ dx: -1, dy: 0 }] });
    expect(ZS.casesDe(aura, [j('pj-p1', 2, 3, 'pj')])).toEqual([{ cx: 1, cy: 3 }]);
    expect(ZS.casesDe(aura, [])).toEqual([]);
    expect(ZS.contient(z, [], { cx: 6, cy: 4 })).toBe(true);
    expect(ZS.contient(z, [], { cx: 6, cy: 5 })).toBe(false);
    expect(ZS.enDecalage([{ cx: 4, cy: 6 }], { cx: 5, cy: 5 })).toEqual([{ dx: -1, dy: 1 }]);
    // Sans ancre, la zone suit son lanceur : il lui en faut un.
    const sansId = (x: ZoneActive) => (({ id: _i, ...y }) => y)(x);
    expect(schemaZoneSol.safeParse(sansId(aura)).success).toBe(true);
    expect(schemaZoneSol.safeParse(sansId(zone({ ancre: null }))).success).toBe(false);
  });

  it('16a : la couleur et le texte', () => {
    expect(ZS.couleurDe(zone({ nature: 'infranchissable' }))).toBe('infranchissable');
    expect(ZS.couleurDe(zone({ nature: 'bloquant' }))).toBe('infranchissable');
    expect(ZS.couleurDe(zone({ nature: 'speciale', texte: 'x' }))).toBe('speciale');
    expect(ZS.couleurDe(zone({ nature: 'dangereuse', danger: { formule: '1d6', typeDegats: 'physique', sauvegarde: null, dd: null, etat: null, rounds: null } }))).toBe('degats');
    expect(ZS.couleurDe(zone({ nature: 'enflamme' }))).toBe('degats');
    expect(ZS.couleurDe(zone({ nature: 'sanctuaire' }))).toBe('benefique');
    expect(ZS.couleurDe(zone({ filtre: 'allies' }))).toBe('benefique');
    expect(ZS.couleurDe(zone({ sort: { action: 'nature.tempete', palier: 'I', element: null, lanceur: fige } }))).toBe('degats');
    expect(ZS.couleurDe(zone({ sort: { action: 'chant.requiem-du-silence', palier: 'I', element: null, lanceur: fige } }))).toBe('controle');
    expect(ZS.couleurDe(zone({ nature: 'difficile' }))).toBe('controle');
    expect(ZS.texteZone(zone({ nom: 'Givre', rounds: 2 }))).toBe('Givre (2)');
    expect(ZS.texteZone(zone({ nom: 'Fosse' }))).toBe('Fosse');
  });

  it('11a : un terrain bloquant est un mur autour de ses cases ; infranchissable et difficile se rangent à part ; un difficile « pour les ennemis » d’un PJ ne compte pas', () => {
    const s = ZS.solDesZones(
      [zone({ nature: 'bloquant', cases: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }] }), zone({ nature: 'infranchissable', ancre: { cx: 1, cy: 1 } }), zone({ nature: 'difficile', ancre: { cx: 2, cy: 2 } }), zone({ nature: 'difficile', ancre: { cx: 3, cy: 3 }, filtre: 'ennemis', camp: 'pj', lanceur: 'pj-p1' }), zone({ nature: 'difficile', ancre: { cx: 4, cy: 4 }, filtre: 'ennemis', camp: 'monstre', lanceur: 'm' })],
      [],
    );
    expect(s.murs).toHaveLength(8);
    expect(s.murs[0]).toEqual([[5, 5], [6, 5]]);
    expect([...s.infranchissables]).toEqual(['1,1']);
    expect([...s.difficiles]).toEqual(['2,2', '4,4']);
  });

  it('1a, 2a : la scène les prend ; un PJ ne traverse pas l’infranchissable (un monstre, si) ; entrer dans une case difficile coûte 2', () => {
    const geo = { id: 'x', nom: 'x', colonnes: 10, lignes: 10, pxParCaseSource: 70, murs: [], obstacles: [], portes: [] };
    const sc = G.sceneCalcul(geo, { mursDeZones: [[[3, 0], [3, 10]]], infranchissables: new Set(['2,1']), difficiles: new Set(['1,5', '2,5']) });
    expect(sc.murs).toHaveLength(1);
    expect(G.sceneCalcul(geo, { infranchissables: new Set() })).not.toHaveProperty('infranchissables');
    const pj = j('p', 1, 1, 'pj');
    expect(I.pasDeGlisser(sc, [pj], pj, { cx: 1, cy: 1 }, { cx: 2, cy: 1 })).toEqual({ case: { cx: 1, cy: 1 }, arret: 'mur' });
    expect(I.pasDeGlisser(sc, [pj], pj, { cx: 1, cy: 1 }, { cx: 1, cy: 2 })).toEqual({ case: { cx: 1, cy: 2 }, arret: null });
    expect(I.pasDeGlisser(sc, [pj], j('m', 1, 1), { cx: 1, cy: 1 }, { cx: 2, cy: 1 })).toEqual({ case: { cx: 2, cy: 1 }, arret: null });
    expect(I.pasDeGlisser(sc, [pj], pj, { cx: 2, cy: 2 }, { cx: 4, cy: 2 }).arret).toBe('mur');
    // Un pas long (le pointeur va vite) ne saute pas la case infranchissable.
    expect(I.pasDeGlisser(sc, [pj], pj, { cx: 2, cy: 0 }, { cx: 2, cy: 2 })).toEqual({ case: { cx: 2, cy: 0 }, arret: 'mur' });
    expect(I.pasDeGlisserBorne(sc, [pj], pj, { cx: 0, cy: 5 }, { cx: 2, cy: 5 }, 9)).toEqual({ case: { cx: 2, cy: 5 }, cout: 4, arret: null });
    expect(I.pasDeGlisserBorne(sc, [pj], pj, { cx: 0, cy: 5 }, { cx: 1, cy: 5 }, 1)).toEqual({ case: { cx: 0, cy: 5 }, cout: 0, arret: 'epuise' });
    expect(I.pasDeGlisserBorne(sc, [pj], pj, { cx: 0, cy: 6 }, { cx: 2, cy: 6 }, 9).cout).toBe(2);
  });

  it('la poussée s’arrête sur l’infranchissable (le décor) ; attirer aussi ; on n’y téléporte pas', () => {
    const sc = { colonnes: 10, lignes: 10, murs: [], obstacles: [], portes: [], infranchissables: new Set(['3,0']) } as never;
    expect(P.pousser(sc, [j('a', 1, 0), j('c', 2, 0)], 'a', 'c')).toEqual({ collision: 'decor' });
    expect(P.attirer(sc, [j('a', 1, 0), j('c', 4, 0)], 'a', 'c')).toBeNull();
    expect(P.arriveePermise(sc, [j('c', 1, 1)], 'c', { cx: 3, cy: 0 }, 5)).toBe('case infranchissable');
  });
});

describe('qui déclenche (3a, 7a, 9a, 10a)', () => {
  const vers = (de: [number, number], a: [number, number], camp: 'pj' | 'monstre' = 'monstre', id = 'm') => ({ id, camp, de: { cx: de[0], cy: de[1] }, vers: { cx: a[0], cy: a[1] } });
  it('à l’entrée (le trajet passe dedans, le départ est dehors) ; en fin de déplacement ; une fois par tour ; selon le filtre', () => {
    const entree = zone({ quand: 'entree' });
    expect(ZS.declenchements([entree], [], vers([3, 5], [7, 5]), 4).map((d) => d.quoi)).toEqual(['entree']);
    expect(ZS.declenchements([entree], [], vers([5, 5], [7, 5]), 4)).toEqual([]);
    expect(ZS.declenchements([entree], [], vers([3, 4], [7, 4]), 4)).toEqual([]);
    expect(ZS.declenchements([zone({ quand: 'entree', declenchements: { m: 4 } })], [], vers([3, 5], [7, 5]), 4)).toEqual([]);
    expect(ZS.declenchements([zone({ quand: 'entree', declenchements: { m: 4 } })], [], vers([3, 5], [7, 5]), 5)).toHaveLength(1);
    // Hors combat (tour 0) : à chaque entrée.
    expect(ZS.declenchements([zone({ quand: 'entree', declenchements: { m: 0 } })], [], vers([3, 5], [7, 5]), 0)).toHaveLength(1);
    const piege = zone({ quand: 'finDeplacement', filtre: 'ennemis', camp: 'pj', lanceur: 'pj-p1', usageUnique: true });
    expect(ZS.declenchements([piege], [], vers([3, 5], [5, 5]), 4).map((d) => d.quoi)).toEqual(['finDeplacement']);
    expect(ZS.declenchements([piege], [], vers([3, 5], [7, 5]), 4)).toEqual([]);
    expect(ZS.declenchements([piege], [], vers([3, 5], [5, 5], 'pj'), 4)).toEqual([]);
    expect(ZS.declenchements([zone()], [], vers([3, 5], [5, 5]), 4)).toEqual([]);
    // Déjà dedans : il n'y entre pas.
    const large = zone({ quand: 'entree', cases: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }] });
    expect(ZS.declenchements([large], [], vers([5, 5], [6, 5]), 4)).toEqual([]);
    expect(ZS.declenchements([large], [], vers([3, 5], [6, 5]), 4)).toHaveLength(1);
  });

  it('8a : une aura bouge avec son lanceur et ne le prend pas ; elle prend les autres', () => {
    const aura = zone({ quand: 'entree', ancre: null, lanceur: 'm', cases: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }] });
    expect(ZS.declenchements([aura], [j('m', 5, 5)], vers([2, 5], [5, 5]), 4)).toEqual([]);
    expect(ZS.declenchements([aura], [j('m', 5, 5)], vers([8, 5], [6, 5], 'monstre', 'n'), 4)).toHaveLength(1);
    const debut = { ...aura, quand: 'debutTour' as const };
    expect(ZS.debutDeTourZones([debut], [j('m', 5, 5)], 'm', 'monstre', 3)).toEqual([]);
    expect(ZS.debutDeTourZones([debut], [j('m', 5, 5), j('n', 6, 5)], 'n', 'monstre', 3)).toEqual([debut]);
  });

  it('le filtre : ennemis ou alliés du lanceur ; la zone du MJ touche tout le monde', () => {
    expect(ZS.concerne({ filtre: 'tous', camp: 'pj' }, 'pj')).toBe(true);
    expect(ZS.concerne({ filtre: 'ennemis', camp: null }, 'pj')).toBe(true);
    expect(ZS.concerne({ filtre: 'allies', camp: null }, 'monstre')).toBe(true);
    expect(ZS.concerne({ filtre: 'ennemis', camp: 'pj' }, 'pj')).toBe(false);
    expect(ZS.concerne({ filtre: 'ennemis', camp: 'pj' }, 'monstre')).toBe(true);
    expect(ZS.concerne({ filtre: 'allies', camp: 'pj' }, 'pj')).toBe(true);
    expect(ZS.concerne({ filtre: 'allies', camp: 'pj' }, 'monstre')).toBe(false);
  });

  it('début de tour : les zones « début de tour » et le sol qui brûle, sur sa case, une fois par tour', () => {
    const jetons = [j('m', 5, 5)];
    const zs = [zone({ quand: 'debutTour' }, 'a'), zone({ nature: 'enflamme' }, 'b'), zone({ nature: 'glissant', quand: 'entree' }, 'c'), zone({ quand: 'debutTour', ancre: { cx: 1, cy: 1 } }, 'd'), zone({ quand: 'debutTour', declenchements: { m: 3 } }, 'e')];
    expect(ZS.debutDeTourZones(zs, jetons, 'm', 'monstre', 3).map((z) => z.id)).toEqual(['a', 'b']);
    expect(ZS.debutDeTourZones(zs, jetons, 'absent', 'monstre', 3)).toEqual([]);
  });

  it('9a : à la fin du tour du lanceur, ses zones perdent un round ; à 0 elles s’en vont ; sans durée, elles restent', () => {
    const zs = [zone({ lanceur: 'p', rounds: 2 }, 'a'), zone({ lanceur: 'p', rounds: 1 }, 'b'), zone({ lanceur: 'p', rounds: null }, 'c'), zone({ lanceur: 'q', rounds: 1 }, 'd')];
    expect(ZS.finDeTourZones(zs, 'p')).toEqual({ maj: [{ id: 'a', rounds: 1 }], retirer: ['b'] });
  });

  it('11a : sanctuaire (ceux de dedans ne se ciblent pas depuis dehors) ; couverture (+2 en DEF)', () => {
    const s = zone({ nature: 'sanctuaire', cases: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }] });
    const jetons = [j('a', 1, 1), j('c', 5, 5), j('d', 6, 5)];
    expect(ZS.protegeParSanctuaire([s], jetons, 'a', 'c')).toBe(true);
    expect(ZS.protegeParSanctuaire([s], jetons, 'd', 'c')).toBe(false);
    expect(ZS.protegeParSanctuaire([s], jetons, 'c', 'a')).toBe(false);
    expect(ZS.protegeParSanctuaire([s], jetons, 'absent', 'c')).toBe(false);
    expect(ZS.couverture([zone({ nature: 'couverture' })], jetons, 'c')).toBe(2);
    expect(ZS.couverture([zone({ nature: 'couverture' })], jetons, 'a')).toBe(0);
    expect(ZS.couverture([zone({ nature: 'sanctuaire' })], jetons, 'c')).toBe(0);
  });
});

describe('ce que la zone fait (3a, 6a, 11a)', () => {
  const cible = S.cibleDe(monstre('a'), null, 0);
  it('une case dangereuse : ses dégâts ; la sauvegarde réussie en ôte la moitié et évite l’état', () => {
    const danger = { formule: '2d6', typeDegats: 'physique' as const, sauvegarde: 'DEX' as const, dd: 13, etat: 'renverse', rounds: 2 };
    const rate = EZ.effetDeZone(zone({ nature: 'dangereuse', danger }), cible, suite([4, 6], [5, 6], [3, 20]))!;
    expect(rate.changements).toEqual([
      { type: 'degats', cible: 'm-r1-a', montant: 9, typeDegats: 'physique', calcul: '2d6' },
      { type: 'etat', cible: 'm-r1-a', etat: 'renverse', duree: { rounds: 2 } },
    ]);
    expect(rate.jets.map((x) => [x.quoi, x.total, x.reussi])).toEqual([['sauvegarde de DEX', 5, false], ['dégâts', 9, undefined]]);
    const reussi = EZ.effetDeZone(zone({ nature: 'dangereuse', danger }), cible, suite([4, 6], [5, 6], [18, 20]))!;
    expect(reussi.changements).toEqual([{ type: 'degats', cible: 'm-r1-a', montant: 4, typeDegats: 'physique', calcul: '2d6' }]);
    const sans = EZ.effetDeZone(zone({ nature: 'dangereuse', danger: { ...danger, sauvegarde: null, dd: null, rounds: null } }), cible, suite([1, 6], [1, 6]))!;
    expect(sans.changements).toEqual([{ type: 'degats', cible: 'm-r1-a', montant: 2, typeDegats: 'physique', calcul: '2d6' }, { type: 'etat', cible: 'm-r1-a', etat: 'renverse', duree: 'finCombat' }]);
  });

  it('glissant : sauvegarde de DEX contre le DD du sort, sinon Renversé ; enflammé et électrifié : 1d6 ; une case spéciale dit son texte', () => {
    expect(EZ.effetDeZone(zone({ nature: 'glissant', dd: 14 }), cible, suite([10, 20]))).toEqual({ jets: [{ quoi: 'sauvegarde de DEX', cible: 'm-r1-a', des: [10], total: 12, contre: 14, reussi: false }], changements: [{ type: 'tombe', cible: 'm-r1-a' }] });
    expect(EZ.effetDeZone(zone({ nature: 'glissant', dd: 14 }), cible, suite([12, 20]))!.changements).toEqual([]);
    expect(EZ.effetDeZone(zone({ nature: 'glissant' }), cible, suite([9, 20]))!.jets[0]!.contre).toBe(12);
    expect(EZ.effetDeZone(zone({ nature: 'enflamme' }), cible, suite([4, 6]))!.changements).toEqual([{ type: 'degats', cible: 'm-r1-a', montant: 4, typeDegats: 'feu', calcul: '1d6' }]);
    expect(EZ.effetDeZone(zone({ nature: 'electrifie' }), cible, suite([2, 6]))!.changements).toEqual([{ type: 'degats', cible: 'm-r1-a', montant: 2, typeDegats: 'electricite', calcul: '1d6' }]);
    expect(EZ.effetDeZone(zone({ nature: 'speciale', texte: 'Un portail' }), cible)).toEqual({ jets: [], changements: [{ type: 'narratif', cible: 'm-r1-a', texte: 'Un portail' }] });
    expect(EZ.effetDeZone(zone({ nature: 'difficile' }), cible)).toBeNull();
  });

  it('6a : le sort se rejoue avec le lanceur figé ; ni échec d’école, ni dérapage ; ni le terrain ni l’invocation', () => {
    // Tempête : DEX pour moitié au début du tour de qui s'y tient.
    const t = EZ.effetDeZone(zone({ sort: { action: 'nature.tempete', palier: 'I', element: { id: 'feu', maitrise: 'initie' }, lanceur: fige } }), cible, () => 0.05)!;
    expect(t.jets.some((x) => x.quoi.startsWith('maîtrise'))).toBe(false);
    expect(t.jets.find((x) => x.quoi.startsWith('sauvegarde'))!.contre).toBe(13);
    expect(t.changements.some((c) => c.type === 'degats' && c.cible === 'm-r1-a')).toBe(true);
    expect(t.changements.some((c) => c.type === 'terrain' || c.type === 'invocation')).toBe(false);
    expect(EZ.effetDeZone(zone({ sort: { action: 'inconnue', palier: 'I', element: null, lanceur: fige } }), cible)).toBeNull();
    // Givre : son palier (II : 3d6), sans reposer le terrain ; un palier qui n'existe pas rejoue le I.
    const givre = (palier: 'I' | 'II' | 'III') => EZ.effetDeZone(zone({ sort: { action: 'nature.givre', palier, element: null, lanceur: fige } }), cible, () => 0.5)!;
    expect(givre('II').jets.find((x) => x.quoi === 'dégâts')!.des).toHaveLength(3);
    expect(givre('III').jets.find((x) => x.quoi === 'dégâts')!.des).toHaveLength(2);
    expect(givre('II').changements.map((c) => c.type)).not.toContain('terrain');
    // Fléau rampant : le d20 de chaos a été joué au lancer.
    const fleau = EZ.effetDeZone(zone({ sort: { action: 'chaos.druide.fleau-rampant', palier: 'I', element: null, lanceur: fige } }), cible, () => 0.97)!;
    expect(fleau.jets.some((x) => x.quoi === 'd20 de chaos')).toBe(false);
    expect(fleau.changements.some((c) => c.type === 'mutation')).toBe(false);
    expect(fleau.changements.some((c) => c.type === 'degats')).toBe(true);
    expect(EZ.lanceurDuFige(fige)).toEqual({ id: 'pj-p1', camp: 'pj', def: 12, sauvegardes: fige.sauvegardes, etats: [], modMagie: 3, attaqueMagique: 5, niveau: 5, mods: { INT: 3, DEX: 2 } });
  });
});

describe('la zone qu’un sort laisse (5a, 8a, 9a, 10a, 11a)', () => {
  const base0 = { palier: 'I' as const, element: null, lanceur: fige, dd: 14, cases: [{ cx: 5, cy: 5 }, { cx: 6, cy: 5 }], ancre: { cx: 5, cy: 5 }, suit: false, changements: [], maintenant: 7 };
  it('les rounds : la durée, base + un mod du lanceur ; null jusqu’à la fin du combat', () => {
    expect(EZ.roundsDeZone({ rounds: 3 }, fige)).toBe(3);
    expect(EZ.roundsDeZone('prochainTour', fige)).toBe(1);
    expect(EZ.roundsDeZone('finCombat', fige)).toBeNull();
    expect(EZ.roundsDeZone(undefined, fige)).toBeNull();
    expect(EZ.roundsDeZone({ base: 5, plusModMagie: true }, fige)).toBe(8);
    expect(EZ.roundsDeZone({ base: 3, plusModCible: 'CHA' }, fige)).toBe(3);
    expect(EZ.roundsDeZone({ base: 3, plusModCible: 'INT' }, fige)).toBe(6);
    expect(EZ.roundsDeZone({ base: 0, plusModCible: 'CHA' }, { modMagie: 0, mods: { CHA: -2 } })).toBe(1);
    expect(EZ.roundsDeZone({ des: '1d4', plusModMagie: false }, fige)).toBeNull();
  });

  it('Tempête : la zone qui dure, rejouée au début du tour ; ancrée sur sa case', () => {
    const z = EZ.zoneDuSort({ ...base0, action: 'nature.tempete' })!;
    expect(schemaZoneSol.parse(z)).toEqual(z);
    expect(z).toMatchObject({ nom: 'Tempête', nature: null, quand: 'debutTour', ancre: { cx: 5, cy: 5 }, cases: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }], lanceur: 'pj-p1', camp: 'pj', rounds: 3, usageUnique: false, dd: null, creeLe: 7 });
    expect(z.sort).toEqual({ action: 'nature.tempete', palier: 'I', element: null, lanceur: fige });
  });

  it('un piège : à usage unique, en fin de déplacement, pour les ennemis', () => {
    expect(EZ.zoneDuSort({ ...base0, action: 'guerrier.piege-de-fortune' })).toMatchObject({ quand: 'finDeplacement', usageUnique: true, filtre: 'ennemis', rounds: null });
  });

  it('Givre : le terrain glissant, qui agit à l’entrée avec le DD du sort, sans rejouer le sort ; Rempart : bloquant ; Sanctuaire : une aura qui suit le lanceur, son texte', () => {
    const givre = EZ.zoneDuSort({ ...base0, action: 'nature.givre', changements: [{ type: 'terrain', nature: 'glissant', duree: { rounds: 2 } }] })!;
    expect(givre).toMatchObject({ nature: 'glissant', quand: 'entree', sort: null, dd: 14, rounds: 2 });
    expect(EZ.zoneDuSort({ ...base0, action: 'abjuration.rempart', changements: [{ type: 'terrain', nature: 'bloquant', duree: { rounds: 2 } }] })).toMatchObject({ nature: 'bloquant', quand: null, dd: null, texte: null });
    const s = EZ.zoneDuSort({ ...base0, action: 'abjuration.sanctuaire', suit: true, changements: [{ type: 'terrain', nature: 'sanctuaire', duree: { rounds: 2 } }] })!;
    expect(s).toMatchObject({ ancre: null, nature: 'sanctuaire', texte: EZ.TEXTES_TERRAIN.sanctuaire });
    expect(EZ.zoneDuSort({ ...base0, action: 'evocation.choc' })).toBeNull();
    expect(EZ.zoneDuSort({ ...base0, action: 'nature.tempete', cases: [] })).toBeNull();
    expect(EZ.zoneDuSort({ ...base0, action: 'inconnue' })).toBeNull();
    // Un terrain posé par un sort qui ne dure pas (un élément) reste aussi, le temps du terrain.
    expect(EZ.zoneDuSort({ ...base0, action: 'evocation.choc', changements: [{ type: 'terrain', nature: 'enflamme', duree: { rounds: 1 } }] })).toMatchObject({ nature: 'enflamme', quand: 'entree', rounds: 1 });
    expect(EZ.zoneDuSort({ ...base0, action: 'evocation.choc', changements: [{ type: 'terrain', nature: 'lave', duree: { rounds: 1 } }] })).toBeNull();
  });

  it('Rempart : la ligne posée sur une case se dresse en travers de la direction du lanceur', () => {
    expect(Z.casesDeZone(scene(), { forme: 'ligne', taille: 3, origine: 'point' }, { cx: 1, cy: 5 }, { cx: 5, cy: 5 }).map((c) => [c.cx, c.cy])).toEqual([[5, 4], [5, 5], [5, 6]]);
    expect(Z.casesDeZone(scene(), { forme: 'ligne', taille: 3, origine: 'point' }, { cx: 5, cy: 1 }, { cx: 5, cy: 5 }).map((c) => [c.cx, c.cy])).toEqual([[6, 5], [5, 5], [4, 5]]);
    expect(Z.casesDeZone(scene(), { forme: 'ligne', taille: 2, origine: 'point' }, { cx: 5, cy: 5 }, { cx: 5, cy: 5 }).map((c) => [c.cx, c.cy])).toEqual([[5, 5], [6, 5]]);
    expect(Z.casesDeZone(scene(), { forme: 'ligne', taille: 3, origine: 'point' }, { cx: 1, cy: 0 }, { cx: 5, cy: 0 })).toHaveLength(2);
  });
});

describe('écritures (1a, 3a, 4a, 7a, 9a, 10a)', () => {
  const reglage = { nature: 'dangereuse' as const, danger: { formule: '1d6', typeDegats: 'physique' as const, sauvegarde: null, dd: null, etat: null, rounds: null }, texte: null, cachee: true };
  it('le MJ peint une case (une par document), puis l’efface', async () => {
    expect(AZ.idCase({ cx: 3, cy: 4 })).toBe('c-3-4');
    await AZ.peindreCase('cave', { cx: 3, cy: 4 }, reglage);
    expect(appels[0]).toEqual({ fn: 'setDoc', chemin: 'tables/t1/scenes/cave/zones/c-3-4', donnees: expect.objectContaining({ nom: 'Case dangereuse', nature: 'dangereuse', ancre: { cx: 3, cy: 4 }, quand: 'entree', cachee: true, lanceur: null, camp: null }) });
    await AZ.peindreCase('cave', { cx: 3, cy: 4 }, null);
    expect(appels[1]).toEqual({ fn: 'deleteDoc', chemin: 'tables/t1/scenes/cave/zones/c-3-4' });
    expect(AZ.zoneDeCase({ cx: 0, cy: 0 }, { nature: 'difficile', danger: reglage.danger, texte: '  ', cachee: false }, 1)).toMatchObject({ quand: null, danger: null, texte: null });
    expect(AZ.zoneDeCase({ cx: 0, cy: 0 }, { nature: 'speciale', danger: null, texte: ' Autel ', cachee: false }, 1)).toMatchObject({ quand: 'entree', texte: 'Autel' });
    expect(() => AZ.zoneDeCase({ cx: 0, cy: 0 }, { nature: 'speciale', danger: null, texte: '', cachee: false }, 1)).toThrow();
    expect(() => AZ.zoneDeCase({ cx: 0, cy: 0 }, { ...reglage, danger: null }, 1)).toThrow();
    await AZ.poserZone('c1', (({ id: _i, ...x }) => x)(zone()));
    expect(appels[2]).toMatchObject({ fn: 'setDoc', chemin: expect.stringMatching(/^tables\/t1\/combats\/c1\/zones\/auto\d+$/) });
    await AZ.retirerZone({ combat: 'c1' }, 'z9');
    expect(appels[3]).toEqual({ fn: 'deleteDoc', chemin: `${Z0}/z9` });
  });

  it('3a, 4a : en combat, une case dangereuse blesse le monstre qui entre (dans une transaction), note le tour, se montre ; au journal', async () => {
    const g = monstre('a');
    enBase(g);
    const z = zone({ nom: 'Case dangereuse', nature: 'dangereuse', danger: reglage.danger, quand: 'entree', cachee: true }, 'c-5-5');
    const ok = await AZ.declencherZone({ scene: 'cave' }, z, { id: g.id, nom: 'a', combattant: g, fiche: null }, { id: 'c1', tour: 6 }, 'MJ', suite([4, 6]));
    expect(ok).toBe(true);
    expect(appels).toEqual([
      { fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 10, aTerre: false } },
      { fn: 'tx.update', chemin: 'tables/t1/scenes/cave/zones/c-5-5', donnees: { declenchements: { 'm-r1-a': 6 }, cachee: false } },
    ]);
    expect(journal.noterJet).toHaveBeenCalledWith('Case dangereuse : a', '1d20', { des: [4], faces: 20, bonus: 0, total: 4 }, 'MJ', 'dégâts 4 ; 4 dégâts physique (4)');
  });

  it('10a : un piège blesse et s’en va ; un combattant absent ne déclenche rien', async () => {
    const g = monstre('a', { def: 5 });
    enBase(g);
    const piege = { ...EZ.zoneDuSort({ action: 'guerrier.piege-de-fortune', palier: 'I', element: null, lanceur: fige, dd: 12, cases: [{ cx: 5, cy: 5 }], ancre: { cx: 5, cy: 5 }, suit: false, changements: [], maintenant: 1 })!, id: 'p1' };
    await AZ.declencherZone({ combat: 'c1' }, piege, { id: g.id, nom: 'a', combattant: g, fiche: null }, { id: 'c1', tour: 6 }, 'Karlach', suite([15, 20], [3, 6]));
    expect(appels.map((a) => [a.fn, a.chemin])).toEqual([['tx.update', `${C}/m-r1-a`], ['tx.delete', `${Z0}/p1`]]);
    expect(appels[0]!.donnees).toMatchObject({ pv: 11, etats: [expect.objectContaining({ id: 'ralenti', rounds: 3 })] });
    appels.length = 0;
    expect(await AZ.declencherZone({ combat: 'c1' }, piege, { id: 'm-r1-z', nom: 'z', combattant: monstre('z'), fiche: null }, { id: 'c1', tour: 6 }, 'K')).toBe(false);
    expect(appels).toEqual([]);
    // Une zone qui n'agit pas sur lui : rien d'écrit, pas de tour noté.
    expect(await AZ.declencherZone({ combat: 'c1' }, zone({ quand: 'entree', nature: 'difficile' }), { id: g.id, nom: 'a', combattant: g, fiche: null }, { id: 'c1', tour: 6 }, 'K')).toBe(false);
    expect(appels).toEqual([]);
  });

  it('en combat, un PJ prend les dégâts sur sa fiche, dans la transaction', async () => {
    const f = v2('Hermione', 'pretre', {}, 'p2');
    const moi = pj('p2');
    enBase(moi);
    const z = zone({ nature: 'dangereuse', danger: reglage.danger, quand: 'entree' }, 'c-5-5');
    await AZ.declencherZone({ scene: 'cave' }, z, { id: moi.id, nom: f.nom, combattant: moi, fiche: f }, { id: 'c1', tour: 6 }, 'MJ', suite([6, 6]));
    const net = degatsSurPj(f, 6, 'physique').net;
    expect(net).toBeGreaterThan(0);
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: 'tables/t1/persos/p2', donnees: { pvActuel: vueFiche(f).pv.actuel - net } });
  });

  it('hors combat : un PJ prend les dégâts sur sa fiche ; le reste est dit ; une zone qui n’agit pas le dit aussi', async () => {
    const f = v2('Hermione', 'pretre');
    const pv = vueFiche(f).pv.actuel;
    const z = zone({ nature: 'dangereuse', danger: { ...reglage.danger, etat: 'renverse' }, quand: 'entree' }, 'c-5-5');
    await AZ.declencherZone({ scene: 'cave' }, z, { id: 'pj-p1', nom: f.nom, combattant: null, fiche: f }, null, 'MJ', suite([6, 6]));
    const net = degatsSurPj(f, 6, 'physique').net;
    expect(appels).toEqual([
      ...(net ? [{ fn: 'updateDoc', chemin: 'tables/t1/persos/p1', donnees: { pvActuel: pv - net } }] : []),
      { fn: 'updateDoc', chemin: 'tables/t1/scenes/cave/zones/c-5-5', donnees: { declenchements: { 'pj-p1': 0 }, cachee: false } },
    ]);
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/MJ : etat hors combat$/);
    appels.length = 0;
    await AZ.declencherZone({ scene: 'cave' }, zone({ quand: 'entree' }, 'c-1-1'), { id: 'm-x', nom: 'Rat', combattant: null, fiche: null }, null, 'MJ');
    expect(journal.noterJet.mock.calls[1]![4]).toBe('Rat entre dans Zone.');
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: 'tables/t1/scenes/cave/zones/c-1-1', donnees: { declenchements: { 'm-x': 0 }, cachee: false } }]);
  });

  it('7a : après un déplacement, les zones où il entre agissent ; au début de son tour, celles sur sa case', async () => {
    const g = monstre('a');
    enBase(g);
    const zs = [zone({ nature: 'enflamme', quand: 'entree' }, 'f1'), zone({ quand: 'debutTour', nature: 'speciale', texte: 'Ici', ancre: { cx: 2, cy: 2 } }, 'f2')];
    const ctx = { lieu: { combat: 'c1' }, zones: zs, jetons: [{ id: 'm-r1-a', genre: 'monstre' as const, cx: 3, cy: 5 }], combat: { id: 'c1', tour: 6 }, combattants: [g], fiches: new Map(), auteur: 'MJ' };
    expect(await AZ.apresDeplacement(ctx, { id: 'm-r1-a', de: { cx: 3, cy: 5 }, vers: { cx: 6, cy: 5 } }, suite([2, 6]))).toBe(1);
    expect(appels[0]).toEqual({ fn: 'tx.update', chemin: `${C}/m-r1-a`, donnees: { pv: 12, aTerre: false } });
    expect(await AZ.apresDeplacement(ctx, { id: 'm-r1-a', de: { cx: 0, cy: 0 }, vers: { cx: 1, cy: 0 } })).toBe(0);
    appels.length = 0;
    expect(await AZ.zonesDuDebutDeTour({ ...ctx, jetons: [{ id: 'm-r1-a', genre: 'monstre', cx: 2, cy: 2 }] }, 'm-r1-a')).toBe(1);
    expect(journal.noterJet.mock.calls.at(-1)![4]).toBe('Ici');
    expect(await AZ.zonesDuDebutDeTour(ctx, 'absent')).toBe(0);
    // Un PJ, par son jeton : sa fiche.
    const f = v2('Hermione', 'pretre');
    appels.length = 0;
    expect(await AZ.apresDeplacement({ ...ctx, combat: null, combattants: [], fiches: new Map([['p1', f]]), jetons: [{ id: 'pj-p1', genre: 'pj', cx: 3, cy: 5 }] }, { id: 'pj-p1', de: { cx: 3, cy: 5 }, vers: { cx: 6, cy: 5 } }, suite([6, 6]))).toBe(1);
    expect(appels.map((a) => a.chemin)).toContain('tables/t1/persos/p1');
    // Le camp : un piège des PJ ne prend pas un PJ (par son combattant, ou par son jeton).
    const piege = zone({ quand: 'entree', filtre: 'ennemis', camp: 'pj', lanceur: 'pj-p9' }, 'p');
    const pjEnCombat = pj('p1');
    expect(await AZ.apresDeplacement({ ...ctx, zones: [piege], combattants: [pjEnCombat], jetons: [{ id: 'pj-p1', genre: 'monstre', cx: 3, cy: 5 }] }, { id: 'pj-p1', de: { cx: 3, cy: 5 }, vers: { cx: 6, cy: 5 } })).toBe(0);
    expect(await AZ.apresDeplacement({ ...ctx, zones: [piege], combat: null, combattants: [], jetons: [{ id: 'pj-p1', genre: 'pj', cx: 3, cy: 5 }] }, { id: 'pj-p1', de: { cx: 3, cy: 5 }, vers: { cx: 6, cy: 5 } })).toBe(0);
  });

  it('9a : finir son tour décompte ses zones, et retire celles qui finissent', async () => {
    base.set('tables/t1/combats/c1', { nom: 'x', scene: 'cave', rencontre: null, statut: 'encours', round: 1, tour: 3, actif: 'pj-p1', porteesLibres: false, creeLe: 1, closLe: null });
    enBase(pj('p1'));
    base.set(`${Z0}/a`, { ...zone({ lanceur: 'pj-p1', rounds: 2 }) });
    base.set(`${Z0}/b`, { ...zone({ lanceur: 'pj-p1', rounds: 1 }) });
    base.set(`${Z0}/c`, { ...zone({ lanceur: 'm-r1-a', rounds: 1 }) });
    await A.finirTour('c1', 'pj-p1', [pj('p1'), monstre('a')], new Set());
    expect(appels.filter((a) => a.chemin.includes('/zones/'))).toEqual([
      { fn: 'tx.update', chemin: `${Z0}/a`, donnees: { rounds: 1 } },
      { fn: 'tx.delete', chemin: `${Z0}/b` },
    ]);
  });
});

describe('les sorts posent leurs zones ; les poussées déclenchent (5a, 7a)', () => {
  it('Rempart : le terrain bloquant reste au sol, en travers de la case visée ; plus de « Terrain » pour le MJ', async () => {
    const f = mageN('abjuration', 2);
    const moi = pj('p1');
    enBase(moi);
    const carte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 1, cy: 5 }] };
    await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'abjuration.rempart', palier: 'I', surcharge: false, element: null, visee: { cibles: [], point: { cx: 5, cy: 5 } } }, carte, [moi], new Map(), () => 0.5);
    const pose = appels.find((a) => a.fn === 'setDoc' && a.chemin.startsWith(`${Z0}/`))!;
    expect(pose.donnees).toMatchObject({ nom: 'Rempart', nature: 'bloquant', ancre: { cx: 5, cy: 5 }, cases: [{ dx: 0, dy: -1 }, { dx: 0, dy: 0 }, { dx: 0, dy: 1 }], lanceur: 'pj-p1', rounds: 2 });
    expect(journal.noterJet.mock.calls[0]![4]).not.toMatch(/Terrain/);
  });

  it('8a : Sanctuaire, une aura : posée sans ancre, autour du lanceur', async () => {
    const f = mageN('abjuration', 5);
    const moi = pj('p1');
    enBase(moi);
    await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'abjuration.sanctuaire', palier: 'I', surcharge: false, element: null, visee: { cibles: [], point: null } }, { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 5, cy: 5 }] }, [moi], new Map(), () => 0.5);
    const pose = appels.find((a) => a.fn === 'setDoc' && a.chemin.startsWith(`${Z0}/`))!;
    expect(pose.donnees).toMatchObject({ nom: 'Sanctuaire', nature: 'sanctuaire', ancre: null, lanceur: 'pj-p1' });
    expect((pose.donnees as ZoneSol).cases).toContainEqual({ dx: 1, dy: 1 });
  });

  it('un sort raté ne pose rien', async () => {
    // Feu Initié (sans la voie élémentaire) : il dérape de 1 à 4.
    const f = mageN('abjuration', 2, { rangs: { 'magicien.ecole': 2 } });
    const moi = pj('p1');
    enBase(moi);
    await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'abjuration.rempart', palier: 'I', surcharge: false, element: 'feu', visee: { cibles: [], point: { cx: 5, cy: 5 } } }, { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 1, cy: 5 }] }, [moi], new Map([['p1', f]]), () => 0.05);
    expect(journal.noterJet.mock.calls[0]![4]).toMatch(/dérape/);
    expect(appels.some((a) => a.chemin.includes('/zones/'))).toBe(false);
  });

  it('un sort qui ne dure pas ne pose rien ; sans carte non plus', async () => {
    const f = mage();
    const moi = pj('p1');
    enBase(moi);
    enBase(monstre('a'));
    await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'mineur.lumiere', palier: 'I', surcharge: false, element: null, visee: { cibles: [], point: null } }, { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 1, cy: 5 }] }, [moi], new Map(), () => 0.5);
    expect(appels.some((a) => a.chemin.includes('/zones/'))).toBe(false);
  });

  it('7a : une goule repoussée par Choc dans une zone du combat la déclenche', async () => {
    const f = mage();
    const moi = pj('p1');
    const g = monstre('a');
    enBase(moi);
    enBase(g);
    const carte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 2, cy: 0 }], zones: [zone({ nature: 'enflamme', quand: 'entree', ancre: { cx: 3, cy: 0 } }, 'f1'), zone({ nature: 'enflamme', quand: 'entree', ancre: { cx: 3, cy: 0 } }, 'scene')], idsZonesCombat: new Set(['f1']) };
    await L.lancerSortEnCombat('c1', combat, moi, f, { sort: 'evocation.choc', palier: 'I', surcharge: false, element: null, visee: { cibles: ['m-r1-a'], point: null } }, carte, [moi, g], new Map([['p1', f]]), suite([2, 20], [4, 6], [5, 6], [3, 6]));
    expect(journal.noterJet.mock.calls.map((c) => c[0])).toEqual(['Choc I', 'Choc sur a', 'Zone : a']);
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: `${Z0}/f1`, donnees: { declenchements: { 'm-r1-a': 6 }, cachee: false } });
  });
});

describe('repoussé par une arme (7a)', () => {
  it('une goule repoussée dans une zone du combat la déclenche ; hors des zones, rien', async () => {
    const g = monstre('a');
    enBase(g);
    const carte = { scene: scene(), jetons: [{ id: 'pj-p1', genre: 'pj' as const, cx: 0, cy: 0 }, { id: 'm-r1-a', genre: 'monstre' as const, cx: 1, cy: 0 }], zones: [zone({ nature: 'enflamme', quand: 'entree', ancre: { cx: 2, cy: 0 } }, 'f1')], idsZonesCombat: new Set(['f1']) };
    expect(await X.repousser('c1', 'cave', pj('p1'), g, carte, [g], new Map(), 'K', suite([3, 6]), { tour: 6 })).toBe('pousse');
    expect(appels).toContainEqual({ fn: 'tx.update', chemin: `${Z0}/f1`, donnees: { declenchements: { 'm-r1-a': 6 }, cachee: false } });
    expect(journal.noterJet.mock.calls.at(-1)![0]).toBe('Zone : a');
  });
});

describe('couverture dans les attaques (11a)', () => {
  it('la DEF de la cible gagne la couverture que l’écran lui passe', async () => {
    const f = v2('Karlach', 'guerrier');
    const g = monstre('a', { def: 13 });
    const i = await X.attaquer('c1', combat, pj('p1'), g, { nom: 'Arc', bonus: 0, seuilCritique: 20, mode: 'distance', defEnPlus: 2 }, f, suite([14, 20]));
    expect(i).toMatchObject({ total: 14, def: 15, touche: false });
  });
});
