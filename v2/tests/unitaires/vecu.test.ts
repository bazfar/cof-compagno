import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * L'arbre du Vécu (lot L4.18) : les 33 nœuds du cadre, les règles de
 * l'arbre et de la barre (lib/fiche/vecu.ts), les bonus sur la fiche, le
 * nœud offert et le Vécu de la v1 à la conversion, et les écritures en
 * transaction (lib/actions/vecu.ts) à travers un faux SDK Firestore.
 * Décisions de Thomas du 22/10/2026 (1a à 8a).
 */

const appels: { fn: string; chemin: string; donnees: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const lire = (o: Record<string, unknown> | undefined, chemin: string) =>
    chemin.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
  return {
    collection: (_db: unknown, chemin: string) => ({ chemin }),
    doc: (parent: { chemin: string } | object, ...p: string[]) =>
      p.length ? { chemin: p.join('/') } : { chemin: `${(parent as { chemin: string }).chemin}/auto${++n}` },
    runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
      const ecritures: typeof appels = [];
      const tx = {
        get: async (r: { chemin: string }) => ({ exists: () => base.has(r.chemin), get: (c: string) => lire(base.get(r.chemin), c) }),
        set: (r: { chemin: string }, donnees: unknown) => { ecritures.push({ fn: 'tx.set', chemin: r.chemin, donnees }); },
        update: (r: { chemin: string }, donnees: unknown) => { ecritures.push({ fn: 'tx.update', chemin: r.chemin, donnees }); },
      };
      const r = await f(tx);
      appels.push(...ecritures);
      return r;
    },
  };
});

const { session } = await import('../../src/lib/session.svelte');
const V = await import('../../src/lib/fiche/vecu');
const A = await import('../../src/lib/actions/vecu');
const R = await import('../../src/lib/fiche/refonte');
const { noeudVecuParId, classeParId, referencesVecuManquantes, PREDILECTIONS_VECU } = await import('../../src/regles');
const { schemaNoeudVecu } = await import('../../src/lib/schemas/vecu');
const { ficheCalculDepuisFiche, ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { CalculsPersonnage } = await import('../../src/lib/regles/calculs');
type Vecu = import('../../src/lib/fiche/vecu').Vecu;

const vecu = (v: Partial<Vecu> = {}): Vecu => ({ crans: 0, paliers: 0, points: 0, noeuds: [], noeudOffert: null, ...v });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string) => ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom)), 'u', 1).fiche;

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'mj';
});

describe('les nœuds du cadre', () => {
  it('33 nœuds : 10 par branche et 3 croisements ; tout ce qu’ils citent existe', () => {
    const parBranche = (b: string) => [...noeudVecuParId.values()].filter((n) => n.branche === b).length;
    expect(noeudVecuParId.size).toBe(33);
    expect(['social', 'exploration', 'savoir', 'croisement'].map(parBranche)).toEqual([10, 10, 10, 3]);
    expect(referencesVecuManquantes()).toEqual([]);
  });

  it('prédilections : un nœud de tier 1 par classe de la refonte, les dix', () => {
    expect(Object.keys(PREDILECTIONS_VECU).sort()).toEqual([...classeParId.keys()].sort());
    expect(PREDILECTIONS_VECU).toMatchObject({ guerrier: 'premiers-soins', envouteur: 'lire-les-gens', necromancien: 'dechiffrer' });
    // Un nœud offert doit être de tier 1 : la vérification au chargement le dit.
    const modifiables = PREDILECTIONS_VECU as Record<string, string>;
    modifiables.moine = 'eloquence';
    try {
      expect(referencesVecuManquantes()).toEqual(['nœud offert de tier 1 eloquence (moine)']);
    } finally {
      modifiables.moine = 'acrobate';
    }
  });

  it('un croisement est de tier 2 et demande deux nœuds', () => {
    const filature = noeudVecuParId.get('filature')!;
    expect(schemaNoeudVecu.safeParse({ ...filature, prerequis: ['affable'] }).error?.issues[0]?.message).toBe('un nœud de croisement est de tier 2 et demande deux nœuds, un par branche');
  });
});

describe('l’arbre (3a)', () => {
  it('tier 1 libre, au prix d’un point ; sans point, refusé', () => {
    expect(V.prendreNoeud(vecu({ points: 1 }), 'affable')).toEqual(vecu({ points: 0, noeuds: ['affable'] }));
    expect(V.refusNoeud(vecu(), 'affable')).toBe('Aucun point de Vécu à dépenser.');
    expect(() => V.prendreNoeud(vecu(), 'affable')).toThrow(V.RefusVecu);
  });

  it('prérequis d’abord, puis le seuil du tier : 2 points dans la branche, 4 pour le tier 3', () => {
    expect(V.refusNoeud(vecu({ points: 3 }), 'eloquence')).toBe('Il faut d’abord : Beau parleur.');
    expect(V.refusNoeud(vecu({ points: 3, noeuds: ['beau-parleur'] }), 'eloquence')).toBe('Tier 2 : 2 points dans la branche Social (tu en as 1).');
    expect(V.refusNoeud(vecu({ points: 3, noeuds: ['beau-parleur', 'affable'] }), 'eloquence')).toBeNull();
    expect(V.refusNoeud(vecu({ points: 3, noeuds: ['affable', 'beau-parleur', 'marchander'] }), 'langue-d-argent')).toBe('Tier 3 : 4 points dans la branche Social (tu en as 3).');
  });

  it('le nœud offert compte dans sa branche et comme prérequis, sans coûter de point', () => {
    const v = vecu({ points: 1, noeuds: ['beau-parleur'], noeudOffert: 'affable' });
    expect(V.pointsParBranche(v).social).toBe(2);
    expect(V.refusNoeud(v, 'reseau-de-rumeurs')).toBeNull();
    expect(V.refusNoeud(v, 'affable')).toBe('Déjà pris.');
  });

  it('un croisement ne demande que ses deux nœuds', () => {
    expect(V.refusNoeud(vecu({ points: 1, noeuds: ['pisteur'] }), 'filature')).toBe('Il faut d’abord : Affable.');
    expect(V.refusNoeud(vecu({ points: 1, noeuds: ['pisteur'], noeudOffert: 'affable' }), 'filature')).toBeNull();
  });

  it('le MJ retire un nœud choisi, son point revient ; pas un nœud dont un autre dépend, ni le nœud offert', () => {
    const v = vecu({ noeuds: ['beau-parleur', 'affable', 'eloquence'], noeudOffert: 'pisteur' });
    expect(V.retirerNoeud(v, 'eloquence')).toEqual({ ...v, points: 1, noeuds: ['beau-parleur', 'affable'] });
    expect(() => V.retirerNoeud(v, 'beau-parleur')).toThrow('Éloquence en dépend : retire-le d’abord.');
    expect(() => V.retirerNoeud(v, 'pisteur')).toThrow('Le nœud offert ne se retire pas.');
    expect(() => V.retirerNoeud(v, 'savant')).toThrow('Ce nœud n’est pas pris.');
  });

  it('l’arbre affiché : branches, points, et pour chaque nœud pris, offert ou la raison d’un refus', () => {
    const a = V.arbreVecu(vecu({ points: 1, noeudOffert: 'erudit' }));
    expect(a.map((b) => [b.nom, b.points, b.noeuds.length])).toEqual([['Social', 0, 10], ['Exploration', 0, 10], ['Savoir', 1, 10], ['Croisements', 0, 3]]);
    const savoir = a[2]!.noeuds;
    expect(savoir.find((n) => n.noeud.id === 'erudit')).toMatchObject({ possede: true, offert: true, refus: null });
    expect(savoir.find((n) => n.noeud.id === 'savant')!.refus).toBe('Tier 3 : 4 points dans la branche Savoir (tu en as 1).');
  });
});

describe('l’arbre dessiné (L4.18b)', () => {
  it('trois colonnes, Social, Exploration, Savoir ; trois étages avec leur seuil ; chaque nœud une fois, à sa place', () => {
    const d = V.dispositionVecu(vecu());
    expect(d.branches.map((b) => [b.branche, b.nom])).toEqual([['social', 'Social'], ['exploration', 'Exploration'], ['savoir', 'Savoir']]);
    for (const b of d.branches) {
      expect(b.etages.map((e) => [e.tier, e.seuil])).toEqual([[1, 0], [2, 2], [3, 4]]);
      for (const e of b.etages) for (const n of e.noeuds) expect([n.noeud.branche, n.noeud.tier]).toEqual([b.branche, e.tier]);
    }
    const ids = [...d.branches.flatMap((b) => b.etages.flatMap((e) => e.noeuds.map((n) => n.noeud.id))), ...d.croisements.map((c) => c.noeud.id)];
    expect(ids.length).toBe(33);
    expect(new Set(ids)).toEqual(new Set(noeudVecuParId.keys()));
  });

  it('un étage s’allume quand la branche a son seuil (le nœud offert compte)', () => {
    const allumes = (v: Vecu) => V.dispositionVecu(v).branches.map((b) => b.etages.map((e) => e.atteint));
    expect(allumes(vecu())).toEqual([[true, false, false], [true, false, false], [true, false, false]]);
    expect(allumes(vecu({ noeuds: ['affable'], noeudOffert: 'beau-parleur' }))).toEqual([[true, true, false], [true, false, false], [true, false, false]]);
    expect(allumes(vecu({ noeuds: ['affable', 'beau-parleur', 'marchander', 'lire-les-gens', 'pisteur'] }))).toEqual([[true, true, true], [true, false, false], [true, false, false]]);
  });

  it('les croisements se placent entre leurs deux branches', () => {
    const entre = Object.fromEntries(V.dispositionVecu(vecu()).croisements.map((c) => [c.noeud.id, c.entre]));
    expect(entre).toEqual({ 'citer-le-precedent': [0, 2], filature: [0, 1], 'remedes-de-terrain': [1, 2] });
  });

  it('un trait par prérequis ; plein quand les deux nœuds sont pris', () => {
    const total = [...noeudVecuParId.values()].reduce((s, n) => s + n.prerequis.length, 0);
    const trait = (v: Vecu) => V.dispositionVecu(v).liens.find((l) => l.de === 'beau-parleur' && l.vers === 'eloquence');
    expect(V.dispositionVecu(vecu()).liens).toHaveLength(total);
    expect(trait(vecu())).toEqual({ de: 'beau-parleur', vers: 'eloquence', acquis: false });
    expect(trait(vecu({ noeuds: ['beau-parleur'] }))!.acquis).toBe(false);
    expect(trait(vecu({ noeuds: ['eloquence'] }))!.acquis).toBe(false);
    expect(trait(vecu({ noeuds: ['affable', 'eloquence'], noeudOffert: 'beau-parleur' }))!.acquis).toBe(true);
    // Les croisements aussi ont leurs deux traits (l'écran les écrit en toutes lettres).
    expect(V.dispositionVecu(vecu()).liens.filter((l) => l.vers === 'filature').map((l) => l.de)).toEqual(['affable', 'pisteur']);
  });
});

describe('la barre (2a)', () => {
  it('tous les 3 crans, un palier et un point ; un retrait ne descend jamais sous un palier', () => {
    let v = vecu();
    for (let i = 0; i < 3; i++) v = V.ajouterCranVecu(v, 1);
    expect(v).toEqual(vecu({ crans: 0, paliers: 1, points: 1 }));
    expect(() => V.ajouterCranVecu(v, -1)).toThrow('Aucun cran à retirer : un palier atteint ne se perd pas.');
    expect(V.ajouterCranVecu(vecu({ crans: 2 }), -1)).toEqual(vecu({ crans: 1 }));
    expect(V.barreVecu(vecu({ crans: 2, paliers: 1, points: 1 }))).toEqual({ crans: 2, requis: 3, paliers: 1, points: 1 });
  });
});

describe('sur la fiche (6a)', () => {
  it('les bonus de compétence des nœuds s’additionnent : +1, puis +2 avec la ligne supérieure ; Filature +2', () => {
    expect(V.bonusCompetencesVecu(vecu({ noeuds: ['beau-parleur', 'eloquence', 'filature'], noeudOffert: 'erudit' }))).toEqual({
      Persuasion: 2,
      Bluff: 2,
      Discrétion: 2,
      'Connaissances (histoire)': 1,
      'Connaissances (arcanes)': 1,
    });
    expect(V.bonusCompetencesVecu(vecu({ noeuds: ['endurci', 'crocheter'] }))).toEqual({});
  });

  it('les compétences de la fiche les comptent', () => {
    const f = reelle('Kylhian');
    const avant = new CalculsPersonnage(ficheCalculDepuisFiche(f)).bonusCompetence('Persuasion');
    const apres = new CalculsPersonnage(ficheCalculDepuisFiche({ ...f, vecu: vecu({ noeuds: ['beau-parleur', 'eloquence'] }) })).bonusCompetence('Persuasion');
    expect(apres - avant).toBe(2);
  });
});

describe('nœud offert (4a) et Vécu de la v1 (5a)', () => {
  it('le nœud offert d’une classe ; la conversion le pose, et note les nœuds des capacités v1 hors combat', () => {
    expect([V.noeudOffertDe('moine'), V.noeudOffertDe(null), V.noeudOffertDe('inconnue')]).toEqual(['acrobate', null, null]);
    expect(V.vecuDesCapacitesV1([{ id: 'pretre.conversion.2' }, { id: 'enchanteur.spectacle.2' }, { id: 'guerrier.soldat.1' }, { id: 'chasseur.traque.1' }])).toEqual(['beau-parleur', 'pisteur']);
    const v2 = R.convertirFiche(reelle('Hermione'), R.refonteVierge(classeParId.get('pretre')!, 3));
    expect(v2.vecu.noeudOffert).toBe('affable');
    expect(v2.octrois.vecuV1 ?? []).toEqual(V.vecuDesCapacitesV1(reelle('Hermione').capacites));
  });

  it('le MJ accorde un nœud de la v1 : un palier et le nœud ; s’il l’a déjà, un palier et un point', () => {
    expect(V.accorderNoeudV1(vecu(), 'endurci')).toEqual(vecu({ paliers: 1, noeuds: ['endurci'] }));
    expect(V.accorderNoeudV1(vecu({ noeudOffert: 'pisteur' }), 'pisteur')).toEqual(vecu({ paliers: 1, points: 1, noeudOffert: 'pisteur' }));
  });
});

describe('écritures (transactions)', () => {
  const chemin = 'tables/t1/persos/p-1';

  it('un cran de Vécu : le jalon `vecu` et le Vécu, ensemble ; au troisième, un palier et un point', async () => {
    base.set(chemin, { vecu: vecu({ crans: 2 }) });
    expect(await A.donnerCranVecu('p-1', 1, '  Le marchand  ', 's0014')).toEqual(vecu({ paliers: 1, points: 1 }));
    expect(appels).toEqual([
      { fn: 'tx.set', chemin: expect.stringMatching(/^tables\/t1\/persos\/p-1\/jalons\/.+/), donnees: { barre: 'vecu', delta: 1, libelle: 'Le marchand', parUid: 'mj', seance: 's0014', creeLe: expect.any(Number) } },
      { fn: 'tx.update', chemin, donnees: { vecu: vecu({ paliers: 1, points: 1 }) } },
    ]);
  });

  it('un refus n’écrit rien ; un personnage disparu non plus', async () => {
    base.set(chemin, { vecu: vecu() });
    await expect(A.donnerCranVecu('p-1', -1, '')).rejects.toThrow(A.RefusVecu);
    await expect(A.prendreNoeudVecu('p-1', 'affable')).rejects.toThrow('Aucun point de Vécu à dépenser.');
    await expect(A.prendreNoeudVecu('p-absent', 'affable')).rejects.toThrow('n’existe plus');
    expect(appels).toEqual([]);
  });

  it('le joueur prend un nœud ; le nœud offert se pose une fois', async () => {
    base.set(chemin, { vecu: vecu({ points: 1 }) });
    await A.prendreNoeudVecu('p-1', 'pisteur');
    expect(appels).toEqual([{ fn: 'tx.update', chemin, donnees: { vecu: vecu({ noeuds: ['pisteur'] }) } }]);
    appels.length = 0;
    await A.poserNoeudOffert('p-1', 'erudit');
    expect(appels[0]!.donnees).toEqual({ vecu: vecu({ points: 1, noeudOffert: 'erudit' }) });
    base.set(chemin, { vecu: vecu({ noeudOffert: 'erudit' }) });
    await expect(A.poserNoeudOffert('p-1', 'affable')).rejects.toThrow('déjà posé');
  });

  it('le MJ retire un nœud, et accorde un nœud de la v1 qui quitte la liste', async () => {
    base.set(chemin, { vecu: vecu({ noeuds: ['affable'] }), octrois: { vecuV1: ['endurci', 'pisteur'] } });
    await A.retirerNoeudVecu('p-1', 'affable');
    expect(appels[0]!.donnees).toEqual({ vecu: vecu({ points: 1 }) });
    appels.length = 0;
    await A.accorderVecuV1('p-1', 'endurci');
    expect(appels).toEqual([{ fn: 'tx.update', chemin, donnees: { vecu: vecu({ paliers: 1, noeuds: ['affable', 'endurci'] }), 'octrois.vecuV1': ['pisteur'] } }]);
    await expect(A.accorderVecuV1('p-1', 'savant')).rejects.toThrow('n’est pas à accorder');
  });
});

describe('règles Firestore (8a)', () => {
  const regles = readFileSync('firestore.rules', 'utf8');
  it('le joueur paie chaque nœud d’un point, n’en retire aucun, pose le nœud offert une fois ; le jalon accepte la barre `vecu`', () => {
    const corps = regles.slice(regles.indexOf('function vecuChoisiParJoueur('), regles.indexOf('// ---- Lore partagé'));
    expect(corps).toContain('apres.noeuds.size() - avant.noeuds.size() == avant.points - apres.points');
    expect(corps).toContain('apres.noeuds.hasAll(avant.noeuds)');
    expect(corps).toContain('(apres.noeudOffert == avant.noeudOffert || avant.noeudOffert == null)');
    expect(regles).toContain("(d.barre == 'niveau' || d.barre == 'vecu')");
  });
});
